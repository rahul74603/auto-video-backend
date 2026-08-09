"use strict";

/**
 * Source Fetcher — safely fetch a given official URL/notification page and
 * extract grounded material (text, tables, links) for the article agents.
 *
 * Safety rules:
 *  - only http/https URLs are allowed (no file:, data:, javascript: ...)
 *  - no embedded credentials (user:pass@host)
 *  - localhost / private / link-local / loopback hosts are refused (SSRF guard)
 *  - bounded size, explicit timeout and redirect cap
 */

const axios = require("axios");
const https = require("https");
const { execFile } = require("child_process");
const { promisify } = require("util");
const cheerio = require("cheerio");

const execFileAsync = promisify(execFile);
const { isBlockedDomain } = require("./constants");

const MAX_TEXT_CHARS = 24000;
const MAX_TABLES = 25;
const MAX_TABLE_ROWS = 80;
const MAX_TABLE_CELLS = 14;
const MAX_LINKS = 120;
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;

// Most requests keep normal TLS verification. This agent is deliberately used
// only as a fallback for broken government/university certificate chains.
const INSECURE_GOVT_TLS_AGENT = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function isPrivateHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]"
  ) {
    return true;
  }
  // Raw IPv4 literal checks
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;                    // 10.0.0.0/8
    if (a === 127) return true;                   // loopback
    if (a === 169 && b === 254) return true;      // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;      // 192.168.0.0/16
    if (a === 0) return true;
  }
  if (host.startsWith("fe80:") || host.startsWith("[fe80:")) return true;
  if (host.startsWith("fc") || host.startsWith("fd")) {
    // Unique-local IPv6 (fc00::/7) — only relevant when a literal v6 host is used.
    if (host.includes(":")) return true;
  }
  return false;
}

/**
 * Validate and normalize a source URL. Throws with .code = "INVALID_SOURCE_URL".
 * @returns {URL} parsed URL object
 */
function assertSafeSourceUrl(rawUrl) {
  const fail = (message) => {
    const err = new Error(message);
    err.code = "INVALID_SOURCE_URL";
    throw err;
  };

  if (!rawUrl || typeof rawUrl !== "string") fail("Source URL is required");
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) fail("Source URL is too long");

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    fail(`Source URL is not a valid URL: ${trimmed.slice(0, 80)}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail("Only http/https source URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    fail("Source URL must not contain credentials");
  }
  if (isPrivateHostname(parsed.hostname)) {
    fail("Source URL points to a private/local host");
  }
  return parsed;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/**
 * Extract grounded material from raw HTML: page title, readable text,
 * tables as row arrays and official-looking links (absolute).
 */
function extractFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, form, nav, footer, header, aside, .sidebar, #sidebar, .advertisement, .ads").remove();

  const pageTitle =
    normalizeWhitespace($('meta[property="og:title"]').attr("content")) ||
    normalizeWhitespace($("title").first().text()) ||
    normalizeWhitespace($("h1").first().text());

  const metaDescription = normalizeWhitespace(
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content")
  );

  // Tables → structured rows (dates/fees/vacancy data usually lives here).
  const tables = [];
  $("table").each((_, table) => {
    if (tables.length >= MAX_TABLES) return false;
    const rows = [];
    $(table).find("tr").each((__, row) => {
      if (rows.length >= MAX_TABLE_ROWS) return false;
      const cells = [];
      $(row).find("th, td").each((___, cell) => {
        if (cells.length >= MAX_TABLE_CELLS) return false;
        const text = normalizeWhitespace($(cell).text()).slice(0, 300);
        if (text) cells.push(text);
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length) tables.push(rows);
  });

  // Links → absolute URLs only; keep anchor text as context.
  const links = [];
  const seen = new Set();
  $("a[href]").each((_, el) => {
    if (links.length >= MAX_LINKS) return false;
    const href = ($(el).attr("href") || "").trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
    let absolute;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    if (seen.has(absolute)) return;
    seen.add(absolute);
    const text = normalizeWhitespace($(el).text()).slice(0, 200);
    links.push({ text, url: absolute });
  });

  const mainText =
    normalizeWhitespace($("article, main, .post-body, .entry-content, .post, #content").first().text()) ||
    normalizeWhitespace($("body").text());

  return {
    pageTitle: pageTitle.slice(0, 250),
    metaDescription: metaDescription.slice(0, 400),
    text: mainText.slice(0, MAX_TEXT_CHARS),
    tables,
    links
  };
}

/**
 * APPLY/LOGIN FORM portals (Digialm EForms, TCS iON, applyonline pages...).
 * Ye candidate-login wale pages hote hain — yahan se article nahi ban sakta
 * (koi vacancy/fee/dates hoti hi nahi + bina session ke 400/403 dete hain).
 * Source URL me notification page/PDF chahiye hota hai.
 */
const FORM_PORTAL_HINTS = [
  /cdn\.digialm\.com\/EForms/i,
  /digialm\.com.*\/(login|registration|apply)/i,
  /\/EForms\//i,
  /\/(login|signin|candidate-login)(\.html?|\.jsp|\.php)?(\?|$)/i,
  /applyonline/i,
  /onlineregistration/i,
  /tcsion.*\/(login|form)/i
];

function looksLikeFormPortal(url) {
  const s = String(url || "");
  return FORM_PORTAL_HINTS.some((re) => re.test(s));
}

/**
 * Noticeboard/dashboard pages (NIC RecSys, UPSC/SSC home pages...) patle hote
 * hain par unpe "Notification / Advt / PDF" jaisa link zaroor hota hai.
 * Usme se sabse sahi link chunta hai — ek hi hop follow hoga.
 */
const NOTIFICATIONISH = /(notification|notif|advt|advertisement|recruit|vacanc|corrigendum|detailed|pdf)/i;

function pickFollowLink(links, currentUrl) {
  if (!Array.isArray(links) || !links.length) return null;
  let host = "";
  try {
    host = new URL(currentUrl).hostname.toLowerCase();
  } catch {
    host = "";
  }
  const scored = [];
  for (const link of links) {
    const url = String(link?.url || "");
    if (!/^https?:/i.test(url)) continue;
    if (url === currentUrl) continue;
    if (looksLikeFormPortal(url)) continue;
    if (isBlockedDomain(url)) continue;
    const linkText = `${link.text || ""} ${link.url || ""}`;
    const isPdf = /\.pdf(\?|#|$)/i.test(url);
    const notif = NOTIFICATIONISH.test(linkText);
    if (!isPdf && !notif) continue;
    let score = 0;
    if (isPdf) score += 5;
    if (notif) score += 3;
    try {
      const h = new URL(url).hostname.toLowerCase();
      if (h === host) score += 2;
      if (h.endsWith(".gov.in") || h.endsWith(".nic.in")) score += 1;
    } catch {
      /* ignore */
    }
    scored.push({ url, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.url || null;
}

// Real browser headers — bahut si govt/news sites obvious bot User-Agent ko
// turant 403 kar deti hain, isliye normal Chrome jaisa request bhejte hain.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
  "Accept-Language": "hi-IN,hi;q=0.9,en-IN;q=0.8,en;q=0.7",
  Referer: "https://www.google.com/",
  "Upgrade-Insecure-Requests": "1"
};

// pdf-parse lazy-loaded (sirf tab chahiye jab PDF aaye).
let pdfParse;
function getPdfParse() {
  if (pdfParse === undefined) {
    try {
      pdfParse = require("pdf-parse");
    } catch {
      pdfParse = null;
    }
  }
  return pdfParse;
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data, "utf-8");
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(String(data || ""), "utf-8");
}

function looksLikePdf(url, headers, buffer) {
  const contentType = String(headers?.["content-type"] || headers?.["Content-Type"] || "").toLowerCase();
  if (contentType.includes("application/pdf")) return true;
  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = "";
  }
  if (pathname.endsWith(".pdf")) return true;
  return buffer.length > 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Text straight out of a notification PDF (SSR-safe, no rendering needed). */
async function extractFromPdf(buffer, url) {
  const pdfParseModule = getPdfParse();
  if (!pdfParseModule || !pdfParseModule.PDFParse) {
    const err = new Error("PDF notification mila par pdf-parse library backend me available nahi hai");
    err.code = "SOURCE_TOO_THIN";
    throw err;
  }
  const pdf = new pdfParseModule.PDFParse({ data: buffer });
  let result;
  try {
    result = await pdf.getText();
  } catch (e) {
    const err = new Error(`PDF padha nahi ja saka (corrupt ya password-protected?): ${e.message}`);
    err.code = "SOURCE_TOO_THIN";
    throw err;
  } finally {
    if (typeof pdf.destroy === "function") await pdf.destroy().catch(() => {});
  }
  const text = normalizeWhitespace(result.text || "");
  if (text.length < 120) {
    const err = new Error(
      "PDF se readable text nahi mila (scanned image PDF lagta hai) — kisi official PAGE ka link try karo"
    );
    err.code = "SOURCE_TOO_THIN";
    throw err;
  }
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
  return {
    pageTitle: firstLine.slice(0, 250) || url.split("/").pop().slice(0, 250),
    metaDescription: "",
    text: text.slice(0, MAX_TEXT_CHARS),
    tables: [],
    links: []
  };
}

/**
 * Headless-Chrome render fallback — jab plain fetch pe page ka text bahut kam
 * mile (JavaScript se render hone wale govt portals), ek baar real browser se
 * page khol kar HTML lete hain. Sirf production path par chalta hai
 * (tests me injected httpGet hota hai, tab ye skip hota hai).
 */
async function renderWithChromium(url, timeoutMs) {
  let browser;
  try {
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: { width: 1280, height: 800 }
    });
    const page = await browser.newPage();
    await page.setUserAgent(BROWSER_HEADERS["User-Agent"]);
    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs || 30000 });
    return await page.content();
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function isTlsCertificateError(error) {
  return /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT|self[ -]signed certificate|CERT_HAS_EXPIRED|CERTIFICATE_VERIFY_FAILED|unable to verify/i.test(
    String(error?.code || "") + " " + String(error?.message || error || "")
  );
}

function assertSafeRedirect(options) {
  // Axios calls this hook before opening every redirected connection. It closes
  // the otherwise easy SSRF hole where a public URL redirects to 127.0.0.1.
  const protocol = options?.protocol || "https:";
  const host = options?.hostname || options?.host;
  assertSafeSourceUrl(`${protocol}//${host || ""}${options?.path || "/"}`);
}

function axiosSourceGet(url, { timeout, insecureTls = false } = {}) {
  return axios.get(url, {
    headers: BROWSER_HEADERS,
    timeout: timeout || 35000,
    maxRedirects: 5,
    maxContentLength: MAX_DOWNLOAD_BYTES,
    maxBodyLength: MAX_DOWNLOAD_BYTES,
    responseType: "arraybuffer",
    httpsAgent: insecureTls ? INSECURE_GOVT_TLS_AGENT : undefined,
    beforeRedirect: (options) => assertSafeRedirect(options),
    validateStatus: (status) => status >= 200 && status < 300
  });
}

/**
 * Last transport fallback for badly configured public portals. execFile (not a
 * shell string) prevents URL command injection. Curl's protocol and size caps
 * keep this bounded; source URLs are validated before reaching this function.
 */
async function fetchWithCurl(url, timeoutMs = 45000) {
  const args = [
    "--silent", "--show-error", "--fail", "--location", "--insecure",
    "--max-redirs", "5", "--max-time", String(Math.ceil(timeoutMs / 1000)),
    "--max-filesize", String(MAX_DOWNLOAD_BYTES),
    "--proto", "=http,https", "--proto-redir", "=http,https",
    "--user-agent", BROWSER_HEADERS["User-Agent"],
    "--header", `Accept: ${BROWSER_HEADERS.Accept}`,
    "--header", `Accept-Language: ${BROWSER_HEADERS["Accept-Language"]}`,
    "--referer", BROWSER_HEADERS.Referer,
    url
  ];
  const { stdout } = await execFileAsync("curl", args, {
    encoding: "buffer",
    timeout: timeoutMs + 5000,
    maxBuffer: MAX_DOWNLOAD_BYTES + 1024
  });
  const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || "");
  if (buffer.length < 80) throw new Error("curl returned an empty or too-small response");
  return { data: buffer, headers: {}, viaCurl: true };
}

/**
 * Fetch a URL and extract source material.
 * deps.httpGet is injectable for tests; must resolve to { data, headers }.
 */
async function fetchAndExtractSource(rawUrl, deps = {}) {
  const parsed = assertSafeSourceUrl(rawUrl);

  // APPLY/LOGIN form portals ko turant reject karo — yahan se article nahi ban sakta.
  if (looksLikeFormPortal(parsed.toString())) {
    const err = new Error(
      "Ye link APPLY/LOGIN FORM page ka hai (jaise Digialm EForms) — yahan vacancy/fee/dates padhi nahi hoti, " +
        "isliye article nahi ban sakta. Source URL me official NOTIFICATION page ya PDF ka DIRECT link daalo " +
        "(jisme bharti ki poori jaankari likhi ho). Apply-form ka link article ke andar 'Apply Online' me lagta hai. " +
        "💡 Army/Navy/Air Force ke portals pe notification login ke ANDAR hoti hai (public nahi) — unke liye " +
        "pib.gov.in ya official site ke 'What's New / Notifications' section ka PUBLIC page dhoondh kar daalo."
    );
    err.code = "INVALID_SOURCE_URL";
    throw err;
  }

  const httpGet =
    deps.httpGet ||
    ((url) => axiosSourceGet(url, { timeout: deps.timeoutMs || 35000 }));

  let response;
  let lastErr;
  try {
    response = await httpGet(parsed.toString());
  } catch (err) {
    lastErr = err;
    const isTimeout = /timeout|ETIMEDOUT|ECONNABORTED|ECONNRESET|EAI_AGAIN|socket hang up/i.test(
      String(err?.message || err)
    );
    // Slow sarkari servers (HPSC jaise govt sites CDN-warmup me pehli hit hang,
    // dusri hit dete hain) — timeout/network issue pe EK plain retry zyada timeout ke saath.
    // deps.slowRetryGet = tests ke liye injectable.
    if ((!deps.httpGet || deps.slowRetryGet) && isTimeout) {
      console.warn(`source fetch: pehli hit timeout (${err.message}) — slow-server retry...`);
      const retryGet =
        deps.slowRetryGet ||
        ((url) => axiosSourceGet(url, { timeout: 70000 }));
      try {
        response = await retryGet(parsed.toString());
      } catch (retryErr) {
        console.warn(`source fetch: slow-server retry bhi fail: ${retryErr.message}`);
      }
    }
    // Defective certificate chains are common on university/government portals.
    // Do not weaken TLS for every site: retry only after a certificate failure.
    if (!response && !deps.httpGet && isTlsCertificateError(lastErr)) {
      try {
        console.warn(`source fetch: certificate issue for ${parsed.hostname}; retrying this source with compatibility TLS`);
        response = await axiosSourceGet(parsed.toString(), { timeout: deps.timeoutMs || 45000, insecureTls: true });
        response.viaInsecureTls = true;
      } catch (tlsErr) {
        lastErr = tlsErr;
        console.warn(`source fetch: compatibility TLS retry failed: ${tlsErr.message}`);
      }
    }

    // Curl handles a few legacy TLS/WAF stacks that Node's HTTP client cannot.
    // It remains a final transport fallback after the normal browser-like request.
    if (!response && !deps.httpGet) {
      try {
        console.warn(`source fetch: trying curl fallback for ${parsed.toString()}`);
        response = await fetchWithCurl(parsed.toString(), deps.timeoutMs || 45000);
      } catch (curlErr) {
        console.warn(`source fetch: curl fallback failed: ${curlErr.message}`);
      }
    }

    // HTTP error (403 bot-block wagera) pe EK baar headless Chrome se try karo —
    // kuch sites real browser ko allow kar deti hain. (Sirf production path pe.)
    if (!response && !deps.httpGet) {
      try {
        const renderedHtml = await renderWithChromium(parsed.toString(), deps.timeoutMs || 45000);
        if (typeof renderedHtml === "string" && renderedHtml.length >= 80) {
          response = { data: renderedHtml, headers: {}, viaRender: true };
        }
      } catch (renderErr) {
        console.warn(`render retry failed for ${parsed.toString()}:`, renderErr.message);
      }
    }
    if (!response && (!deps.httpGet || deps.jinaGet)) {
      // FINAL FALLBACK: proxy-reader (r.jina.ai) — alag network se page/PDF ka
      // clean text laata hai. Site humare cloud IP ko blackhole kar rahi ho
      // (HPSC case) tab bhi article ban jaata hai. deps.jinaGet = tests injectable.
      try {
        const jinaGet =
          deps.jinaGet ||
          ((u) =>
            axios.get(u, {
              headers: BROWSER_HEADERS,
              timeout: 60000,
              maxContentLength: 8 * 1024 * 1024,
              responseType: "text",
              validateStatus: (status) => status >= 200 && status < 300
            }));
        const jr = await jinaGet(`https://r.jina.ai/${parsed.toString()}`);
        const rawText = String(jr?.data || "");
        if (rawText.trim().length >= 500) {
          const titleMatch = rawText.match(/^Title:\s*(.+)$/m);
          const cleanText = normalizeWhitespace(rawText.replace(/^Title:.*$/m, ""));
          return {
            ok: true,
            url: parsed.toString(),
            pageTitle: (titleMatch ? titleMatch[1] : cleanText.split("\n")[0] || "").trim().slice(0, 250),
            metaDescription: "",
            text: cleanText.slice(0, MAX_TEXT_CHARS),
            tables: [],
            links: [],
            fetchedAt: new Date().toISOString(),
            fetchedBytes: Buffer.byteLength(rawText),
            status: 200,
            via: "jina-reader"
          };
        }
      } catch (jinaErr) {
        console.warn(`jina-reader fallback failed for ${parsed.toString()}:`, jinaErr.message);
      }
    }

    if (!response) {
      const status = lastErr?.response?.status;
      const isPdfUrl = parsed.pathname.toLowerCase().endsWith(".pdf");
      const blocked = isTimeout || isPdfUrl || status === 403 || status === 429 || status === 502;
      const wrapped = new Error(
        `Source ${isPdfUrl ? "PDF" : "page"} fetch nahi ho paya${status ? ` (site ne status ${status} diya — shayad block kiya)` : ""}: ${lastErr?.message || "unknown network error"}` +
          (blocked
            ? " — 💡 Sarkari site cloud server ko block kar rahi ho sakti hai. PDF/Image ko 📄 UPLOAD button se do, ya official link upar rakhkar poora text Source Text box me copy-paste karo."
            : "")
      );
      wrapped.code = "SOURCE_FETCH_FAILED";
      throw wrapped;
    }
  }

  const buffer = toBuffer(response.data);

  // PDF notification → direct text extraction.
  if (looksLikePdf(parsed.toString(), response.headers, buffer)) {
    const extracted = await extractFromPdf(buffer, parsed.toString());
    return {
      ok: true,
      url: parsed.toString(),
      fetchedAt: new Date().toISOString(),
      via: "pdf",
      ...extracted
    };
  }

  const rawHtml = buffer.toString("utf-8");
  let extracted = rawHtml.length >= 80 ? extractFromHtml(rawHtml, parsed.toString()) : null;

  const THIN_MIN = 120;
  const needsMoreText = () => !extracted || !extracted.text || extracted.text.length < THIN_MIN;

  // 1) Noticeboard link-follow: patle dashboard/portal page (NIC RecSys, UPSC/SSC home)
  // pe "Notification / Advt / PDF" jaisa link dikhe to EK hop follow karke asli
  // content (page ya PDF) wahan se nikaalo.
  if (needsMoreText() && extracted && Array.isArray(extracted.links) && extracted.links.length) {
    const followCandidate = pickFollowLink(extracted.links, parsed.toString());
    let followUrl = null;
    if (followCandidate) {
      try {
        followUrl = assertSafeSourceUrl(followCandidate).toString();
      } catch {
        followUrl = null;
      }
    }
    if (followUrl) {
      try {
        const followResp = await httpGet(followUrl);
        const fbuf = toBuffer(followResp.data);
        if (looksLikePdf(followUrl, followResp.headers, fbuf)) {
          const pdfOut = await extractFromPdf(fbuf, followUrl);
          extracted = { ...pdfOut, viaLink: followUrl };
        } else {
          const fhtml = fbuf.toString("utf-8");
          if (fhtml.length >= 80) {
            const out = extractFromHtml(fhtml, followUrl);
            if (out.text && out.text.length >= THIN_MIN) extracted = { ...out, viaLink: followUrl };
          }
        }
      } catch (followErr) {
        console.warn(`link-follow failed for ${followUrl}:`, followErr.message);
      }
    }
  }

  // 2) JS-render fallback: plain HTML me text na mile to ek baar headless Chrome se
  // render karke dobara try karo (sirf jab test-injected fetcher na ho, aur abhi-abhi
  // render se hi aaya ho to dobara nahi).
  if (needsMoreText() && !deps.httpGet && !response.viaRender) {
    try {
      const renderedHtml = await renderWithChromium(parsed.toString(), deps.timeoutMs || 30000);
      if (typeof renderedHtml === "string" && renderedHtml.length >= 80) {
        const rendered = extractFromHtml(renderedHtml, parsed.toString());
        if (rendered.text && rendered.text.length >= THIN_MIN) {
          extracted = { ...rendered, viaRender: true };
        }
      }
    } catch (renderErr) {
      console.warn(`render fallback failed for ${parsed.toString()}:`, renderErr.message);
    }
  }

  if (!extracted) {
    const err = new Error("Source page is empty or unreadable — sahi (direct) link check karo");
    err.code = "SOURCE_TOO_THIN";
    throw err;
  }
  if (!extracted.text || extracted.text.length < THIN_MIN) {
    const err = new Error(
      "Source page has too little readable text to ground an article — page JavaScript se banta hai ya text bahut kam hai; notification ka direct page/PDF link daalo"
    );
    err.code = "SOURCE_TOO_THIN";
    throw err;
  }

  const via = extracted.viaLink ? "link-follow" : extracted.viaRender ? "render" : response.viaCurl ? "curl" : response.viaInsecureTls ? "compatibility-tls" : "http";
  delete extracted.viaRender;
  delete extracted.viaLink;
  return {
    ok: true,
    url: parsed.toString(),
    fetchedAt: new Date().toISOString(),
    via,
    ...extracted
  };
}

module.exports = {
  assertSafeSourceUrl,
  fetchAndExtractSource,
  extractFromHtml,
  isPrivateHostname,
  MAX_TEXT_CHARS,
  BROWSER_HEADERS,
  fetchWithCurl,
  isTlsCertificateError
};

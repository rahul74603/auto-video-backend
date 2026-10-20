const functions = require("firebase-functions/v1");
// v1 Firestore triggers work on Spark plan (125K reads / 50K writes per month free).
// Replaced the v2 noop with a real v1 trigger so JOB publish instantly
// dispatches to GitHub Actions without requiring Blaze billing.
const onDocumentCreated = (documentPath) => (handler) => functions.firestore.document(documentPath).onCreate(handler);
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const cheerio = require("cheerio");
const Parser = require('rss-parser');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
    parsePublishedAt,
    extractPublishedAtFromHtml,
    isDeadlineExpired,
} = require("./source_freshness");
const {
    MAX_SCRAPER_AGE_DAYS,
    isWithinScraperWindow,
    isInterviewNotice,
    isGovernmentJob,
    classifyJobSource,
    isHighQualityPrivateJob,
} = require("./scraper_policy");
const {
    buildDescription,
    buildFallbackArticleHtml,
    htmlWordCount,
    backfillDraftDescriptions,
} = require("./description_fallback");
const {
    isOfficialSourceUrl,
    resolveOfficialSourceUrl,
    extractOfficialSourceCandidates,
    isOfficialSourceRelevant,
} = require("./fast_track_sources");
const { fetchAndExtractSource } = require("./agents/article_agents/source_fetcher");
const { assertSourceArticleWorthy } = require("./agents/article_agents/source_adequacy_gate");

// =========================================================
// 🔐 FIREBASE INIT
// =========================================================
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
        console.log("✅ Firebase initialized");
    } else {
        admin.initializeApp();
    }
}

const db     = admin.firestore();
const parser = new Parser();

// =========================================================
// 🛠️ HELPERS
// =========================================================
function createSlug(title) {
    if (!title) return "govt-job";
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 80);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const SKIP_KEYWORDS = [
    'admit card', 'result', 'answer key', 'cut off', 'cutoff',
    'merit list', 'interview schedule', 'exam date', 'syllabus',
    'hall ticket', 'call letter'
];

function shouldSkipTitle(title) {
    if (!title) return true;
    const lower = title.toLowerCase();
    return isInterviewNotice(title) || SKIP_KEYWORDS.some(kw => lower.includes(kw));
}

// =========================================================
// 🔔 GOOGLE INDEXING API
// =========================================================
async function notifyGoogle(url) {
    try {
        const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
        if (!serviceAccountVar) return;

        const key = JSON.parse(serviceAccountVar);
        const jwtClient = new google.auth.JWT({
            email: key.client_email,
            key: key.private_key.replace(/\\n/g, '\n'),
            scopes: ["https://www.googleapis.com/auth/indexing"]
        });

        await jwtClient.authorize();
        await axios.post(
            "https://indexing.googleapis.com/v3/urlNotifications:publish",
            { url, type: "URL_UPDATED" },
            {
                headers: {
                    Authorization: `Bearer ${jwtClient.credentials.access_token}`
                }
            }
        );
        console.log("🚀 Google Indexing:", url);
    } catch (err) {
        console.error("❌ Indexing Error:", err.message);
    }
}

// =========================================================
// 🚀 GITHUB ACTIONS TRIGGER
// =========================================================
async function triggerGitHubVideoAction(jobData) {
    const GITHUB_TOKEN = process.env.GH_TOKEN;
    const REPO_OWNER   = process.env.GITHUB_OWNER;
    const REPO_NAME    = process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN) {
        console.error("❌ GH_TOKEN missing!");
        return false;
    }
    if (!REPO_OWNER || !REPO_NAME) {
        console.error("❌ GITHUB_OWNER या GITHUB_REPO missing!");
        return false;
    }

    const cleanJobData = {
        id:           String(jobData.id || ''),
        slug:         String(jobData.slug || jobData.id || ''),
        title:        String(jobData.title || 'Latest Govt Job'),
        category:     String(jobData.category || 'Default'),
        type:         'JOB',
        startDate:    String(jobData.startDate || ''),
        lastDate:     String(jobData.lastDate || ''),
        updateDate:   String(jobData.updateDate || ''),
        organization: String(jobData.organization || ''),
        vacancies:    String(jobData.vacancies || '')
    };

    const payload = {
        event_type: "generate_job_video",
        client_payload: {
            jobData: cleanJobData
        }
    };

    console.log("📤 GitHub Trigger:", JSON.stringify(cleanJobData));

    try {
        const response = await axios.post(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`,
            payload,
            {
                headers: {
                    Authorization:          `Bearer ${GITHUB_TOKEN}`,
                    Accept:                 "application/vnd.github.v3+json",
                    "Content-Type":         "application/json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                timeout: 15000
            }
        );

        if (response.status === 204) {
            console.log("✅ GitHub Actions triggered!");
            return true;
        }

        console.warn("⚠️ Unexpected status:", response.status);
        return false;

    } catch (err) {
        if (err.response) {
            console.error("❌ GitHub API Error:", {
                status: err.response.status,
                data:   JSON.stringify(err.response.data)
            });
            if (err.response.status === 401) console.error("🔑 GH_TOKEN expired!");
            if (err.response.status === 404) console.error("🔍 Repo not found!");
            if (err.response.status === 422) console.error("⚙️ yml में repository_dispatch नहीं!");
        } else {
            console.error("❌ Network Error:", err.message);
        }
        return false;
    }
}

// =========================================================
// 🤖 AI JOB DATA EXTRACTOR
// =========================================================
async function extractJobDataWithAI(scrapedContent, jobLink) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const todayDate = new Date().toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year:     'numeric',
        month:    'long',
        day:      'numeric'
    });

    const prompt = `Act as a Precise Job Data Specialist. Extract details ONLY from the scraped data.
Follow these mapping rules to fill EVERY field:

1. title: "Job Title", "Post Name", "Name of Post", "पद का नाम"
2. startDate: "Start Date", "Application Start Date", "Opening Date"
3. lastDate: "Last Date", "Closing Date", "अंतिम तिथि"
4. vacancies: "Vacancies", "Total Posts", "कुल पद"
5. organization: "Organization", "Department", "Board"
6. salary: "Salary", "Pay Scale", "Pay Matrix"
7. minAge/ageLimit: "Age Limit"
8. advtNo: "Advt. No.", "Advertisement No"
9. qualification: "Qualification", "Educational Qualification"
10. location: "Job Location", "State", "Place of Posting"
11. selectionProcess: "Selection Process"
12. eligibility: "Physical Standards", "PST", "PET"
13. feeGen: General/UR fee amount
14. feeSCST: SC/ST/PH fee amount
15. feeFemale: Female fee amount
16. feeOBC: OBC/EWS fee amount
17. applicationFee: Payment mode description
18. notificationLink: URL from brackets like (URL: https://...) - ONLY official govt/org URLs
19. applyLink: Official apply URL only; if the source does not include one, return an empty string (never use the RSS/aggregator URL).
20. officialSiteLink: Official website URL
21. isExpired: Compare lastDate with today (${todayDate}), true if expired
22. category: ssc/banking/railway/upsc/defense/teaching/state/engineering/other
23. description is mandatory: return a DETAILED 6-8 line SEO-rich Hinglish summary — post name, organization, total vacancies, qualification, age limit, fees, start/last dates aur apply mode sab cover karo (jo source me ho). Pehle 2 lines me primary keywords (post + org + year) zaroor aane chahiye. If details are sparse, keep it cautious and tell readers to verify the official notification; never invent facts and never return an empty description.

SCRAPED DATA:
${scrapedContent}

Return ONLY this JSON (no markdown):
{
  "title": "",
  "slug": "seo-friendly-slug",
  "metaDescription": "160 char SEO description",
  "category": "ssc",
  "organization": "",
  "advtNo": "",
  "startDate": "",
  "lastDate": "",
  "vacancies": "",
  "salary": "",
  "qualification": "",
  "minAge": "",
  "ageLimit": "",
  "location": "",
  "selectionProcess": "",
  "eligibility": "",
  "feeGen": "",
  "feeSCST": "",
  "feeFemale": "",
  "feeOBC": "",
  "applicationFee": "",
  "notificationLink": "",
  "applyLink": "",
  "officialSiteLink": "",
  "description": "detailed 6-8 line SEO-rich Hinglish summary (post+org+vacancies+qualification+fees+dates)",
  "isExpired": false
}`;

    const result = await model.generateContent(prompt);
    let text = result.response.text()
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

    let data = JSON.parse(text);
    if (Array.isArray(data)) data = data[0];
    return data;
}

async function fetchOfficialJobSource(scrapedContent, jobData, logger = console.log) {
    const rawCandidates = [
        jobData?.notificationLink,
        ...extractOfficialSourceCandidates(scrapedContent),
        jobData?.officialSiteLink,
        jobData?.applyLink,
    ];
    const candidates = [...new Set(rawCandidates.map(resolveOfficialSourceUrl).filter(Boolean))]
        .sort((a, b) => Number(/\.pdf(?:$|[?#])/i.test(b)) - Number(/\.pdf(?:$|[?#])/i.test(a)))
        .slice(0, 5);
    if (!candidates.length) return { status: 'official_link_unavailable', url: '', text: '' };

    let lastStatus = 'official_fetch_failed';
    for (const url of candidates) {
        try {
            const source = await fetchAndExtractSource(url, { timeoutMs: 35000 });
            assertSourceArticleWorthy({ ...source, url });
            const sourceText = [
                `OFFICIAL SOURCE URL: ${url}`,
                `PAGE TITLE: ${source.pageTitle || ''}`,
                source.text || '',
                ...(source.tables || []).map((rows, index) => `TABLE ${index + 1}:\n${rows.map((row) => row.join(' | ')).join('\n')}`),
                ...(source.links || []).map((link) => `LINK: ${link.text || ''} -> ${link.url || ''}`),
            ].filter(Boolean).join('\n\n').slice(0, 24000);
            if (sourceText.replace(/\s+/g, ' ').trim().length < 400) {
                lastStatus = 'official_page_thin';
                logger(`⚠️ Official job source was too thin to ground an article: ${url}`);
                continue;
            }
            if (!isOfficialSourceRelevant({
                sourceText,
                title: jobData?.title,
                organization: jobData?.organization,
            })) {
                lastStatus = 'official_source_mismatch';
                logger(`⚠️ Official source does not clearly match this job: ${url}`);
                continue;
            }
            logger(`✅ Official job source fetched: ${url}`);
            return { status: 'verified', url, text: sourceText, source };
        } catch (err) {
            lastStatus = 'official_fetch_failed';
            logger(`⚠️ Official job source fetch failed [${url}]: ${err.message}`);
        }
    }
    return { status: lastStatus, url: '', text: '' };
}

// =========================================================
// ✍️ FULL ARTICLE GENERATOR (scraper ke saath hi — alag step nahi)
// Draft me hi poora SEO article (articleHtml) bhar deta hai taaki admin
// ko Review Draft me sab READYMADE mile — bas check karke publish.
// =========================================================
async function generateFullJobArticle(jobData, scrapedContent) {
    const facts = JSON.stringify({
        title: jobData.title, organization: jobData.organization, advtNo: jobData.advtNo,
        startDate: jobData.startDate, lastDate: jobData.lastDate, vacancies: jobData.vacancies,
        salary: jobData.salary, qualification: jobData.qualification, minAge: jobData.minAge,
        ageLimit: jobData.ageLimit, location: jobData.location,
        selectionProcess: jobData.selectionProcess, eligibility: jobData.eligibility,
        feeGen: jobData.feeGen, feeOBC: jobData.feeOBC, feeSCST: jobData.feeSCST,
        feeFemale: jobData.feeFemale, applicationFee: jobData.applicationFee,
        applyLink: jobData.applyLink, notificationLink: jobData.notificationLink,
        officialSiteLink: jobData.officialSiteLink
    });

    const prompt = `Act as StudyGyaan's careful editorial writer for Indian government-job applicants.
Write a useful, source-grounded job article in clear Hinglish (Hindi in Devanagari, standard English terms where clearer).

=== EXTRACTED FACTS ===
${facts}

=== OFFICIAL SOURCE TEXT (primary source; authoritative) ===
${String(scrapedContent).slice(0, 18000)}

=== STRICT EDITORIAL RULES ===
1. Use exact dates, amounts, vacancy counts, category/reservation, qualifications, age cut-off, address, selection steps and URLs from the official source only. Do not infer or fill gaps from common recruitment patterns.
2. Do not add an experience requirement, age-relaxation rule, document list, application instruction, exam date, fee, or eligibility condition unless the official source explicitly says it.
3. Missing fields should be omitted or described as "नोटिफिकेशन में स्पष्ट नहीं"; never turn missing data into a guess or a generic government rule.
4. Do not spin the source by swapping synonyms. Explain the practical implications of the actual notice in original wording.
5. No keyword stuffing (same phrase baar-baar mat ghusao), no self-praise, no generic wishes. Lekin article DETAILED aur COMPLETE hona chahiye — facts ke saath unka matlab bhi samjhao (jaise last date nazdeek ho to jaldi apply ki salah). Lambaai detail se aani chahiye, repetition se nahi.
6. Never claim "fact-checked" or imply a human review. The content is an editorial draft until a human verifies it.
7. Use only direct official links supplied in the extracted facts. Never label a publisher/aggregator redirect as an official application link.

=== OUTPUT: LONG-FORM, DETAILED, SEO-RICH ARTICLE ===
TARGET: 1500-2200 words (minimum ~1000). Sarkari-result style ka COMPLETE coverage — chhota summary bilkul nahi.
Return only clean semantic HTML, no markdown, <html>/<head>/<body>, or <h1> (the page already has its H1).
MANDATORY structure (H2 headings keyword-rich — post name + organization + year istemal karo):
1) Intro paragraph — role, organization, vacancies, application mode, deadline (primary keywords pehle 100 words me).
2) Overview table — saare key facts ek nazar me (post, org, advt no, vacancies, dates, qualification, age, salary, location).
3) Important Dates — table + 2-3 line explanation (kab se kab tak, kya miss na karein).
4) Vacancy Details — post-wise/category-wise break-up jo source me ho; table preferred.
5) Eligibility / Qualification — har post ke liye kaun apply kar sakta hai, detail me.
6) Age Limit — min/max, cut-off date, relaxation sirf tab jab notice me likhi ho.
7) Salary / Pay Scale — pay matrix/grade pay sahit jo source me ho.
8) Application Fee — table (Gen/OBC/EWS/SC/ST/Female) + payment mode; notice me na ho to "स्पष्ट नहीं" likho, guess mat karo.
9) Selection Process — stages detail me, har stage ka matlab samjhate hue.
10) How to Apply — numbered steps, ACTUAL mode ke hisaab se (online/offline); address/documents/delivery sirf tab jab notice me ho.
11) Important Links — Apply Online / Notification PDF / Official Website (direct official HTTPS only).
12) FAQs — 8-12 unique source-backed questions (last date? fees? qualification? age? salary? selection? kaise apply karein?).
13) Conclusion — 3-4 lines: key highlights + official notification verify karne ki salah.
Missing fact = section chhota karo ya "नोटिफिकेशन में स्पष्ट नहीं" likho; guess/adha-satya kabhi nahi.`;

    let bestHtml = '';
    let bestWords = 0;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            // Attempt 2 = EXPAND pass: pehla output chhota aaya to model ko wahi
            // article detail me badhane ko kaho (facts same, sections poore karo).
            const attemptPrompt = attempt === 1 ? prompt
                : `${prompt}\n\n=== EXPAND INSTRUCTION (previous output was too short) ===\nPichhli baar article bahut chhota aaya tha. ISI notice par DOBARA likho — poora section structure (overview, dates, vacancy, eligibility, age, salary, fee, selection, apply steps, links, 8-12 FAQs, conclusion) aur MINIMUM 1000 words. Koi naya fact invent mat karo; maujooda facts ko detail me samjhao.`;
            const result = await model.generateContent(attemptPrompt);
            let html = result.response.text()
                .replace(/```html/gi, '')
                .replace(/```/g, '')
                .trim();
            // Safety: h1 aa gaya ho to h2 bana do (page pe single H1 rahe)
            html = html.replace(/<h1(\s[^>]*)?>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>');
            const words = htmlWordCount(html);
            if (words > bestWords) { bestWords = words; bestHtml = html; }
            // LONG-FORM gate: 700+ words chahiye (target 1500-2200). Chhota aaya
            // to attempt 2 me EXPAND instruction ke saath retry hoga.
            if (words >= 700) return html;
            console.warn(`⚠️ Job article too short (${words} words, attempt ${attempt}/2, need 700+).`);
        } catch (err) {
            console.warn(`⚠️ Job article generation failed (attempt ${attempt}/2): ${err.message}`);
            if (/429|quota|resource exhausted/i.test(err.message || '')) break;
        }
        if (attempt < 2) await sleep(2000);
    }

    // Dono attempts chhote aaye: agar AI output 250+ words ka hai to wahi rakho
    // (fallback se behtar), warna fact-only fallback do.
    if (bestWords >= 250) {
        console.warn(`⚠️ Job article stayed short after 2 attempts — keeping best AI output (${bestWords} words) for human review.`);
        return bestHtml;
    }
    console.warn('🧩 Saving a grounded, fact-only fallback Job article for human review.');
    return buildFallbackArticleHtml({
        ...jobData,
        kind: 'job',
        summary: jobData.description,
    });
}

// =========================================================
// 🌐 WEB SCRAPER (429 rate-limit pe smart retry + polite delay)
// =========================================================
async function scrapeJobPage(url) {
    const RETRY_WAITS = [15000, 35000, 60000]; // 429/5xx pe: 15s → 35s → 60s
    let lastErr;
    for (let attempt = 0; attempt <= RETRY_WAITS.length; attempt++) {
        try {
            return await scrapeJobPageOnce(url);
        } catch (err) {
            lastErr = err;
            const status = err.response && err.response.status;
            const retryable = status === 429 || status === 503 || status === 502;
            if (!retryable || attempt === RETRY_WAITS.length) throw err;
            console.log(`   ⏳ HTTP ${status} — ${RETRY_WAITS[attempt] / 1000}s ruk ke retry (${attempt + 1}/${RETRY_WAITS.length})...`);
            await sleep(RETRY_WAITS[attempt]);
        }
    }
    throw lastErr;
}

async function scrapeJobPageOnce(url) {
    const { data: html } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept':     'text/html,application/xhtml+xml'
        },
        timeout: 25000
    });

    const pagePublishedAt = extractPublishedAtFromHtml(html);
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, .sidebar, #sidebar').remove();

    $("table a, .post-body a, article a").each((i, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr("href");
        if (href && href.startsWith("http")) {
            $(el).replaceWith(`${text} (URL: ${href})`);
        }
    });

    let tableContent = "";
    $('table').each((i, el) => {
        tableContent += "\n--- TABLE ---\n";
        tableContent += $(el).text().replace(/\s\s+/g, ' ').trim();
        tableContent += "\n";
    });

    const mainBody = ($('.post-body, article, .entry-content, main').first().text()
        || $('body').text())
        .replace(/\s\s+/g, ' ')
        .trim();

    const sourceDate = pagePublishedAt ? new Date(pagePublishedAt).toISOString() : "";
    return `SOURCE_PUBLISHED_AT: ${sourceDate}\nTABLES:\n${tableContent}\n\nCONTENT:\n${mainBody}`.substring(0, 15000);
}

// =========================================================
// 🔥 CORE SCRAPING LOGIC
// =========================================================
// =========================================================
// 🌐 MULTI-SOURCE JOB FEEDS (ek site down/429 ho to baaki chalte rahen)
// Round-robin merge — koi ek site dominate nahi karti.
// =========================================================
// PHASE-2: sources ab source_registry me (Firestore `sources` collection override +
// health tracking). Ye list fallback hai — registry khali ho to yahi chalti hai.
const { DEFAULT_SOURCES, getEnabledSources, recordSourceCheck } = require("./source_registry");
const JOB_SOURCES = DEFAULT_SOURCES;

async function fetchAllJobItems(perSource = 12, limitTotal = 60) {
    const allItems = [];
    const now = Date.now();
    // Registry-enabled sources (Firestore `sources`), warna legacy fallback
    const sources = await getEnabledSources(db, JOB_SOURCES);
    for (const src of sources) {
        try {
            const feed = await parser.parseURL(src.url);
            const items = (feed.items || []).map((it) => ({
                title: (it.title || '').trim(),
                link: (it.link || it.guid || '').trim(),
                source: src.name,
                publishedAt: it.isoDate || it.pubDate || ''
            })).filter((it) => it.title && it.link && !it.link.includes('127.0.0.1'))
              .filter((it) => {
                  if (!it.publishedAt) return true; // page metadata must verify it before any save
                  const publishedAt = parsePublishedAt(it.publishedAt);
                  const fresh = isWithinScraperWindow(publishedAt, { now });
                  if (!fresh) console.log(`⏭️ Outside ${MAX_SCRAPER_AGE_DAYS}-day window: ${it.title.slice(0, 70)}`);
                  return fresh;
              })
              .sort((a, b) => parsePublishedAt(b.publishedAt) - parsePublishedAt(a.publishedAt))
              .slice(0, perSource);
            allItems.push(...items);
            console.log(`📰 ${src.name}: ${items.length} fresh items`);
            await recordSourceCheck(db, src.name, { ok: true, itemCount: items.length });
        } catch (e) {
            console.warn(`⚠️ ${src.name} feed fail (skip): ${e.message.slice(0, 80)}`);
            await recordSourceCheck(db, src.name, { ok: false, error: e.message });
        }
        await sleep(1500);
    }

    // Recency is the primary ordering: today first, then progressively older.
    // Undated RSS entries stay last and are accepted only if page metadata verifies them.
    const unique = new Map();
    for (const item of allItems) {
        const key = item.link.toLowerCase();
        if (!unique.has(key)) unique.set(key, item);
    }
    const merged = [...unique.values()]
        .sort((a, b) => parsePublishedAt(b.publishedAt) - parsePublishedAt(a.publishedAt))
        .slice(0, limitTotal);
    console.log(`📊 Total fresh candidates (newest first): ${merged.length}`);
    return merged;
}

// =========================================================
// ⭐ JOB QUALITY SCORE — factual completeness and official-source provenance
// Article length never adds quality points.
// =========================================================
function jobQualityScore(jobData, articleHtml) {
    let score = 0;
    if (jobData.lastDate)      score += 2;
    if (jobData.vacancies)     score += 2;
    if (jobData.qualification) score += 2;
    if (jobData.salary)        score += 1;
    if (jobData.startDate)     score += 1;
    if (jobData.organization)  score += 1;
    if (jobData.feeGen || jobData.applicationFee) score += 1;
    if (jobData.notificationLink || jobData.applyLink) score += 1;
    if (jobData.sourceVerificationStatus === 'verified' && jobData.officialSourceUrl) score += 2;
    const words = String(articleHtml || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
    // Do not award quality points for length; score factual completeness and source provenance.
    return { score, words };
}

const QUALITY_GOOD  = 9; // top-quality threshold
const QUALITY_FLOOR = 6; // government-job backup threshold
const MAX_EVALUATIONS  = 12; // AI-quota/time budget per run

async function scrapeGovtJobsLogic(maxJobs = 5) {
    const parsedMaxJobs = Number.parseInt(maxJobs, 10);
    const targetMaxJobs = Math.min(5, Math.max(0, Number.isFinite(parsedMaxJobs) ? parsedMaxJobs : 5));
    console.log(`🚀 Govt Jobs Scraper Started (max ${targetMaxJobs}, fresh window ${MAX_SCRAPER_AGE_DAYS} days)...`);

    if (targetMaxJobs === 0) return 0;

    // Gap-fill summaries on scraper-created pending drafts only; never touch published jobs.
    try {
        await backfillDraftDescriptions({
            db,
            collectionName: 'job_drafts',
            allowedStatuses: ['pending', 'draft'],
            kind: 'job',
            maxDocs: 100,
            logger: console.log,
        });
    } catch (err) {
        console.warn(`⚠️ Job draft description backfill skipped: ${err.message}`);
    }

    const items = await fetchAllJobItems();

    // 🛡️ Cross-site duplicate protection: recent titles (published + drafts)
    const { overlapsAny } = require('./agents/article_agents/title_utils');
    const recentTitles = [];
    try {
        const [jobsSnap, draftsSnap] = await Promise.all([
            db.collection("jobs").orderBy("createdAt", "desc").limit(60).get(),
            db.collection("job_drafts").orderBy("createdAt", "desc").limit(60).get()
        ]);
        jobsSnap.forEach((d) => { const t = d.data().title; if (t) recentTitles.push(String(t)); });
        draftsSnap.forEach((d) => { const t = d.data().title; if (t) recentTitles.push(String(t)); });
        // v3.4 (2026-10-07): fast_track titles bhi shield me — cross-collection
        // duplicate content roko (jobs me wahi news dobara nahi aayegi)
        try {
            const ftSnap = await db.collection("fast_track").orderBy("createdAt", "desc").limit(60).get();
            ftSnap.forEach((d) => { const t = d.data().title; if (t) recentTitles.push(String(t)); });
        } catch (e) {
            console.warn("fast_track cross-shield skip:", e.message);
        }
    } catch (e) {
        console.warn("Recent titles fetch failed:", e.message);
    }

    const now = new Date();
    const dateSuffix = now.toLocaleString('en-IN', {
        month: 'short',
        year:  'numeric'
    }).toLowerCase().replace(' ', '-');

    let internalLinks = [];
    try {
        const recentBlogs = await db.collection("blogs")
            .orderBy("createdAt", "desc")
            .limit(3)
            .get();
        recentBlogs.forEach(b => {
            const data = b.data();
            internalLinks.push({
                title: data.title,
                slug:  data.slug || b.id
            });
        });
    } catch (e) {
        console.warn("Internal links fetch failed:", e.message);
    }

    let savedCount = 0;
    let evaluated = 0;
    const governmentPool = [];
    const privateFallbackPool = [];

    const evaluationOrder = [...items].sort((a, b) => {
        const governmentPriority = Number(isGovernmentJob({ title: b.title })) - Number(isGovernmentJob({ title: a.title }));
        return governmentPriority || (parsePublishedAt(b.publishedAt) - parsePublishedAt(a.publishedAt));
    });

    for (const item of evaluationOrder) {
        // Govt/public-sector notices are always exhausted before private fallback.
        if (governmentPool.length >= targetMaxJobs) break;
        if (evaluated >= MAX_EVALUATIONS) {
            console.log(`⏸️ Evaluation budget khatam (${MAX_EVALUATIONS}) — is run me itna hi`);
            break;
        }

        const titleText = (item.title || '').trim();

        if (shouldSkipTitle(titleText)) {
            console.log(`⏭️ Skipped: ${titleText}`);
            continue;
        }

        // 🛡️ Same job doosri site se? Title-overlap check
        const dup = overlapsAny(titleText, recentTitles);
        if (dup.dup) {
            console.log(`⏭️ Duplicate (cross-site): "${titleText}" ≈ "${dup.with}"`);
            continue;
        }

        // ✅ RSS link as-is fetch karo - block nahi karo
        const jobLink = (item.link || item.guid || '').trim();
        if (!jobLink || jobLink.includes('127.0.0.1')) continue;

        const docId = Buffer.from(jobLink)
            .toString('base64')
            .replace(/\//g, '_')
            .replace(/\+/g, '-')
            .substring(0, 100);

        const alreadyDone = await db.collection("processed_links").doc(docId).get();
        if (alreadyDone.exists) {
            console.log(`⏭️ Already processed: ${titleText}`);
            continue;
        }

        try {
            evaluated++;
            console.log(`📡 [${evaluated}/${MAX_EVALUATIONS}] Scraping (${item.source || 'RSS'}): ${jobLink}`);
            await sleep(8000); // 🕊️ polite delay — source site 429 na de
            const scrapedContent = await scrapeJobPage(jobLink);
            const pageDate = scrapedContent.match(/^SOURCE_PUBLISHED_AT:\s*([^\n]*)/m)?.[1] || "";
            const verifiedPublishedAt = parsePublishedAt(pageDate, item.publishedAt);
            if (!isWithinScraperWindow(verifiedPublishedAt)) {
                console.log(`⏭️ Unverified or outside ${MAX_SCRAPER_AGE_DAYS}-day window (${item.source || 'RSS'}): ${titleText}`);
                continue;
            }

            console.log(`🤖 AI Processing: ${titleText}`);
            const discoveryData = await extractJobDataWithAI(scrapedContent, jobLink);
            const officialSource = await fetchOfficialJobSource(scrapedContent, {
                ...discoveryData,
                title: discoveryData.title || titleText,
            });
            let jobData = discoveryData;
            if (officialSource.status === 'verified') {
                const officialData = await extractJobDataWithAI(officialSource.text, officialSource.url);
                jobData = {
                    ...officialData,
                    title: officialData.title || discoveryData.title || titleText,
                    slug: discoveryData.slug || officialData.slug || '',
                    category: officialData.category || discoveryData.category || 'other',
                    organization: officialData.organization || discoveryData.organization || '',
                    notificationLink: officialSource.url,
                    applyLink: officialData.applyLink || discoveryData.applyLink || '',
                    officialSiteLink: officialData.officialSiteLink || discoveryData.officialSiteLink || '',
                    sourceVerificationStatus: 'verified',
                    officialSourceUrl: officialSource.url,
                };
            } else {
                jobData = {
                    ...discoveryData,
                    sourceVerificationStatus: officialSource.status,
                    officialSourceUrl: '',
                };
                console.log(`⚠️ Official job source not verified (${officialSource.status}); generated article will stay fact-only and require review.`);
            }

            const finalTitle = jobData.title || titleText;
            if (isInterviewNotice(finalTitle)) {
                console.log(`⏭️ Interview-only notice excluded: ${finalTitle}`);
                continue;
            }

            if (jobData.isExpired === true || isDeadlineExpired(jobData.lastDate)) {
                console.log(`⏭️ Expired/closed deadline: ${finalTitle} (${jobData.lastDate || "AI expiry check"})`);
                await db.collection("processed_links").doc(docId).set({
                    link:        jobLink,
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    note:        "Expired"
                });
                continue;
            }

            if (!finalTitle || finalTitle.length < 5) continue;

            const baseSlug  = jobData.slug || createSlug(finalTitle);
            const finalSlug = `${baseSlug}-${dateSuffix}`;

            const slugExists = await db.collection("job_drafts").doc(finalSlug).get();
            if (slugExists.exists) {
                console.log(`⏭️ Slug exists: ${finalSlug}`);
                continue;
            }

            // Keep CTA/source links on HTTPS official institution domains only.
            // An RSS aggregator URL must never be relabeled as the official apply link.
            const cleanApplyLink = officialSource.status === 'verified'
                ? resolveOfficialSourceUrl(jobData.applyLink)
                    || resolveOfficialSourceUrl(isOfficialSourceUrl(jobLink) ? jobLink : '')
                : '';
            const cleanNotificationLink = officialSource.status === 'verified' ? officialSource.url : '';
            const cleanOfficialSiteLink = officialSource.status === 'verified'
                ? resolveOfficialSourceUrl(jobData.officialSiteLink)
                : '';

            console.log(`🔗 applyLink: ${cleanApplyLink}`);

            // Long AI articles require readable official-source text. If unavailable,
            // preserve a concise fact-only draft for human review instead of inventing filler.
            let articleHtml = '';
            let articleGenerationMode = 'fact_fallback';
            try {
                if (officialSource.status === 'verified') {
                    articleHtml = await generateFullJobArticle({
                        ...jobData,
                        title: finalTitle,
                        applyLink: cleanApplyLink,
                        notificationLink: cleanNotificationLink,
                        officialSiteLink: cleanOfficialSiteLink,
                    }, officialSource.text);
                    articleGenerationMode = 'ai_generated';
                } else {
                    articleHtml = buildFallbackArticleHtml({
                        ...jobData,
                        kind: 'job',
                        title: finalTitle,
                        originalLink: jobLink,
                        officialSourceUrl: '',
                        summary: jobData.description,
                    });
                }
                const words = articleHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
                console.log(`📝 Article (${articleGenerationMode}; source ${officialSource.status}): ${words} words`);
            } catch (artErr) {
                console.warn(`⚠️ Job article generation failed (draft remains review-only): ${artErr.message}`);
            }

            const description = buildDescription({
                preferred: jobData.description,
                metaDescription: jobData.metaDescription,
                articleHtml,
                sourceText: scrapedContent,
                title: finalTitle,
                organization: jobData.organization,
                vacancies: jobData.vacancies,
                lastDate: jobData.lastDate,
                qualification: jobData.qualification,
                kind: 'job',
            });
            console.log(`🗒️ Job description ready (${description.length} chars)`);
            if (!description.trim() || !articleHtml.trim()) {
                throw new Error('Refusing to save a Job draft without description and article content.');
            }

            const draftPayload = {
                title:            finalTitle,
                slug:             finalSlug,
                type:             "JOB",
                status:           "pending",
                metaDescription:  jobData.metaDescription  || '',
                description,
                articleHtml:      articleHtml              || '',
                category:         jobData.category         || 'other',
                organization:     jobData.organization     || '',
                advtNo:           jobData.advtNo           || '',
                startDate:        jobData.startDate        || '',
                lastDate:         jobData.lastDate         || '',
                vacancies:        jobData.vacancies        || '',
                salary:           jobData.salary           || '',
                qualification:    jobData.qualification    || '',
                minAge:           jobData.minAge           || '',
                ageLimit:         jobData.ageLimit         || '',
                location:         jobData.location         || '',
                selectionProcess: jobData.selectionProcess || '',
                eligibility:      jobData.eligibility      || '',
                feeGen:           jobData.feeGen           || '',
                feeSCST:          jobData.feeSCST          || '',
                feeFemale:        jobData.feeFemale        || '',
                feeOBC:           jobData.feeOBC           || '',
                applicationFee:   jobData.applicationFee   || '',
                // ✅ Cleaned links - blocked domains nahi aayenge
                notificationLink: cleanNotificationLink,
                applyLink:        cleanApplyLink,
                officialSiteLink: cleanOfficialSiteLink,
                originalLink:     jobLink,
                sourcePublishedAt: new Date(verifiedPublishedAt).toISOString(),
                sourceVerificationStatus: officialSource.status,
                officialSourceUrl: officialSource.status === 'verified' ? officialSource.url : '',
                articleGenerationMode,
                requiresHumanReview: true,
                internalLinks:    internalLinks,
                createdAt:        admin.firestore.FieldValue.serverTimestamp()
            };

            const cleanPayload = Object.fromEntries(
                Object.entries(draftPayload).filter(([, v]) => v !== undefined)
            );

            // ⭐ QUALITY GATE — sirf ache article wale jobs save honge
            const { score, words } = jobQualityScore(jobData, articleHtml);
            console.log(`⭐ Quality: ${score}/13 (${words} words) — ${finalTitle.slice(0, 50)}`);

            // Processed mark turant (dobara AI-quota waste na ho)
            await db.collection("processed_links").doc(docId).set({
                link:         jobLink,
                slug:         finalSlug,
                title:        finalTitle,
                qualityScore: score,
                processedAt:  admin.firestore.FieldValue.serverTimestamp()
            });

            const jobType = classifyJobSource({
                title: finalTitle,
                organization: jobData.organization,
                officialUrl: `${jobData.officialSiteLink || ''} ${jobData.notificationLink || ''}`,
            });
            const candidate = { finalSlug, cleanPayload, finalTitle, score, publishedAt: verifiedPublishedAt };

            if (jobType === "government") {
                if (score >= QUALITY_FLOOR) {
                    governmentPool.push(candidate);
                    recentTitles.push(finalTitle);
                    console.log(`🏛️ Government candidate (${governmentPool.length}) [score ${score}]: ${finalTitle}`);
                } else {
                    console.log(`🗑️ Low-quality government job [score ${score}] — skip: ${finalTitle}`);
                }
            } else if (isHighQualityPrivateJob(jobData, score, QUALITY_GOOD)) {
                privateFallbackPool.push(candidate);
                recentTitles.push(finalTitle);
                console.log(`🏢 Qualified private fallback (${privateFallbackPool.length}) [score ${score}]: ${finalTitle}`);
            } else {
                console.log(`⏭️ Private/unclear job rejected: incomplete facts or score below ${QUALITY_GOOD} — ${finalTitle}`);
            }
            await sleep(2000);

        } catch (err) {
            console.error(`❌ Failed: ${jobLink} | ${err.message}`);
        }
    }

    const newestFirst = (a, b) => (b.publishedAt - a.publishedAt) || (b.score - a.score);
    governmentPool.sort(newestFirst);
    privateFallbackPool.sort(newestFirst);
    const selectedCandidates = [...governmentPool, ...privateFallbackPool].slice(0, targetMaxJobs);

    for (const candidate of selectedCandidates) {
        await db.collection("job_drafts").doc(candidate.finalSlug).set(candidate.cleanPayload);
        savedCount++;
        console.log(`✅ Saved (${savedCount}/${targetMaxJobs}) [score ${candidate.score}]: ${candidate.finalTitle}`);
    }

    console.log(`🎯 Complete: ${savedCount} jobs saved (government=${Math.min(savedCount, governmentPool.length)}, private fallback=${Math.max(0, savedCount - governmentPool.length)})`);
    return savedCount;
}

// =========================================================
// 1️⃣ HTTP TRIGGER - Scraper API
// =========================================================
exports.fetchLatestGovtJobs = functions.https.onRequest(async (req, res) => {

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).send("Method Not Allowed");
    }

    const authHeader  = req.headers['x-scraper-key'];
    const SCRAPER_KEY = process.env.SCRAPER_SECRET_KEY || "StudyGyaan_786_Secure";

    if (authHeader !== SCRAPER_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const lastRunDoc = await db.collection("system_configs")
            .doc("scraper_status").get();

        if (lastRunDoc.exists) {
            const lastRun = lastRunDoc.data().lastRun?.toDate();
            if (lastRun) {
                const minsSince = (Date.now() - lastRun.getTime()) / 60000;
                if (minsSince < 30) {
                    return res.json({
                        success: false,
                        message: `Rate limited. Wait ${Math.round(30 - minsSince)} mins.`
                    });
                }
            }
        }

        await db.collection("system_configs").doc("scraper_status").set({
            lastRun: admin.firestore.FieldValue.serverTimestamp(),
            status:  "running"
        });

    } catch (e) {
        console.warn("Rate limit check failed:", e.message);
    }

    try {
        const count = await scrapeGovtJobsLogic(5);

        await db.collection("system_configs").doc("scraper_status").set({
            lastRun:   admin.firestore.FieldValue.serverTimestamp(),
            status:    "completed",
            lastCount: count
        }, { merge: true });

        res.json({
            success:   true,
            message:   `${count} new jobs saved to drafts!`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("❌ Scraper Error:", error.message);
        await db.collection("system_configs").doc("scraper_status").set({
            status:    "error",
            lastError: error.message
        }, { merge: true }).catch(() => {});
        res.status(500).json({ success: false, error: error.message });
    }
});

// =========================================================
// 2️⃣ FIRESTORE TRIGGER - Job Publish होने पर
// =========================================================
// =========================================================
// 2) FIRESTORE TRIGGER - Job publish hone par (v1 - Spark compatible)
// =========================================================
exports.onJobPublishedNotify = onDocumentCreated("jobs/{jobId}")(async (snap, context) => {

    if (!snap) return null;

    const job   = snap.data();
    const jobId = context.params.jobId;

    if (job.type && job.type !== 'JOB') {
        console.log("Skipping non-JOB type:", job.type);
        return null;
    }

    const jobUrl = `https://studygyaan.in/job/${job.slug || jobId}`;
    console.log("\n" + "=".repeat(50));
    console.log("New Job:", job.title);
    console.log("URL:", jobUrl);
    console.log("=".repeat(50) + "\n");
    // STEP 1: Schema Save
    // ─────────────────────────────────────
    try {
        const publishTime = job.createdAt?.toDate?.()?.toISOString()
            || new Date().toISOString();

        const jobSchema = {
            "@context":       "https://schema.org/",
            "@type":          "JobPosting",
            "title":          job.title || '',
            "description":    job.description || job.title || '',
            "datePosted":     publishTime,
            "employmentType": "FULL_TIME",
            "hiringOrganization": {
                "@type":  "Organization",
                "name":   job.organization || "Govt Department",
                "sameAs": "https://studygyaan.in",
                "logo":   "https://studygyaan.in/logo.png"
            },
            "jobLocation": {
                "@type": "Place",
                "address": {
                    "@type":          "PostalAddress",
                    "addressRegion":  job.location || "India",
                    "addressCountry": "IN"
                }
            },
            "validThrough": job.lastDate || '',
            "identifier": {
                "@type": "PropertyValue",
                "name":  job.organization || "StudyGyaan",
                "value": job.advtNo || jobId
            }
        };

        if (job.salary && job.salary.length > 2) {
            jobSchema.baseSalary = {
                "@type":    "MonetaryAmount",
                "currency": "INR",
                "value": {
                    "@type":       "QuantitativeValue",
                    "description": job.salary
                }
            };
        }

        await db.collection("jobs").doc(jobId).update({
            schemaMarkup: JSON.stringify(jobSchema)
        });
        console.log("✅ Schema saved");
    } catch (e) {
        console.error("Schema error:", e.message);
    }

    // ─────────────────────────────────────
    // STEP 1.5: Auto-Optimizer quality pass (fire-and-forget semantics).
    // The job document is ALREADY published at this point, so an optimizer
    // failure must never fail this trigger. Awaited with a hard timeout so
    // the v1 background function instance is not frozen mid-write.
    // ─────────────────────────────────────
    try {
        const { triggerOptimizerAfterPublish } = require('./agents/seo_intelligence/publish_hook');
        const optimizeWithTimeout = Promise.race([
            triggerOptimizerAfterPublish(db, admin.firestore.FieldValue,
                { ...job, id: jobId, type: 'JOB' }, 'jobs'),
            new Promise((resolve) => setTimeout(() => resolve(null), 90_000))
        ]);
        await optimizeWithTimeout.catch((optErr) =>
            console.warn("⚠️ Auto-optimizer hook failed (non-blocking):", optErr.message)
        );
    } catch (optErr) {
        console.warn("⚠️ Auto-optimizer hook skipped (non-blocking):", optErr.message);
    }

    // ─────────────────────────────────────
    // STEP 2: Search Engine Pings (Google Indexing API + IndexNow + Sitemap Ping)
    // ─────────────────────────────────────
    await notifyGoogle(jobUrl).catch(e =>
        console.log("Google indexing skip:", e.message)
    );

    // 🚀 Multi-endpoint IndexNow (Bing + Yandex + Seznam + Naver — 4 endpoints)
    // + Google/Bing/Yandex sitemap pings + WebSub — free, no API key needed
    try {
        const booster = require("./indexing_booster");
        booster.submitToAllIndexNow([jobUrl, "https://studygyaan.in/govt-jobs"]).catch(() => {});
        booster.pingAllSitemaps().catch(() => {});
        booster.publishWebSub().catch(() => {});
        console.log("✅ Multi-engine search ping dispatched");
    } catch (inErr) {
        console.warn("⚠️ Booster ping failed (fallback single-endpoint):", inErr.message);
        // Fallback: single-endpoint submit
        axios.post(
            "https://api.indexnow.org/indexnow",
            { host: "studygyaan.in", key: "9629c8c41fa94b898f83a53ecd320743", keyLocation: "https://studygyaan.in/9629c8c41fa94b898f83a53ecd320743.txt", urlList: [jobUrl] },
            { headers: { "Content-Type": "application/json; charset=utf-8" }, timeout: 8000, validateStatus: () => true }
        ).catch(() => {});
    }

    // ─────────────────────────────────────
    // STEP 3: GitHub Actions → Video
    // ─────────────────────────────────────
    let videoStatus = "⏳ Video trigger initiated";

    // Check automation guard
    try {
        const { isAutomationEnabled } = require('./agents/automation_guard');
        const guard = await isAutomationEnabled(db, 'video_maker');
        if (!guard.enabled) {
            console.log(`⏸️ Video trigger skipped — ${guard.reason}`);
            videoStatus = `⏸️ Paused: ${guard.reason}`;
            throw new Error(`Skipped: ${guard.reason}`);
        }
    } catch (guardErr) {
        if (guardErr.message && guardErr.message.startsWith('Skipped:')) throw guardErr;
        console.warn('Guard check failed (continuing):', guardErr.message);
    }

    try {
        const triggered = await triggerGitHubVideoAction({
            ...job,
            id:   jobId,
            slug: job.slug || jobId,
            type: 'JOB'
        });

        if (triggered) {
            videoStatus = "✅ Video generation started!";
            await db.collection("jobs").doc(jobId).update({
                videoTriggered:   true,
                videoTriggeredAt: admin.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
            console.log("✅ GitHub trigger success");
        } else {
            videoStatus = "⚠️ GitHub trigger failed";
            console.log("⚠️ GitHub trigger failed");
        }
    } catch (err) {
        console.error("Trigger error:", err.message);
        videoStatus = `❌ Error: ${err.message.substring(0, 50)}`;
    }

    // ─────────────────────────────────────
    // STEP 4: Telegram
    // ─────────────────────────────────────
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

    if (BOT_TOKEN && CHAT_ID) {
        const msg =
            `🚨 <b>New Govt Job Alert!</b>\n\n` +
            `📌 <b>Post:</b> ${job.title || 'New Job'}\n` +
            `🏢 <b>Dept:</b> ${job.organization || 'Govt Dept'}\n` +
            `🎓 <b>Qualification:</b> ${job.qualification || 'Check Details'}\n` +
            `⏳ <b>Last Date:</b> ${job.lastDate || 'Apply Soon'}\n` +
            `💼 <b>Vacancies:</b> ${job.vacancies || 'Check Notification'}\n\n` +
            `📖 <b>Full Details:</b>\n${jobUrl}\n\n` +
            `🎬 ${videoStatus}\n\n` +
            `🔔 @studygyaan_official`;

        await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                chat_id:                  CHAT_ID,
                text:                     msg,
                parse_mode:               'HTML',
                disable_web_page_preview: false
            }
        ).catch(e => console.error("Telegram error:", e.message));

        console.log("✅ Telegram sent!");
    } else {
        console.log("⚠️ Telegram credentials missing");
    }

    // ─────────────────────────────────────
    // STEP 4B: Social Media Orchestrator — Twitter, LinkedIn, Facebook, Insta, YouTube
    // Respects automation guard (Pause All) and posts to all enabled platforms
    // Just add keys in .env and GitHub Secrets — no code change needed
    // ─────────────────────────────────────
    try {
        const { postToAllPlatforms } = require('./social_media/social_orchestrator');
        const socialResult = await postToAllPlatforms({
            type: 'JOB',
            data: job,
            url: jobUrl,
            db: db,
            FieldValue: admin.firestore.FieldValue
        });
        console.log(`📊 Social orchestrator: ${socialResult.summary}`);
        // Save result to job doc for debugging
        await db.collection("jobs").doc(jobId).update({
            socialPostedAt: admin.firestore.FieldValue.serverTimestamp(),
            socialSummary: socialResult.summary,
            socialSucceeded: socialResult.succeeded.map(s => s.platform)
        }).catch(() => {});
    } catch (socialErr) {
        console.error("Social orchestrator error (non-blocking):", socialErr.message);
    }

    // ─────────────────────────────────────
    // STEP 5: WhatsApp (अभी बंद है)
    // ─────────────────────────────────────
    /*
    const WA_SERVER = process.env.WHATSAPP_SERVER_URL;
    if (WA_SERVER) {
        const waMsg = `🚨 *New Govt Job!*\n\n📌 *${job.title}*\n\n🔗 ${jobUrl}`;
        axios.post(`${WA_SERVER}/send-job`, {
            targetId:    "120363425475163322@newsletter",
            messageText: waMsg
        }).catch(e => console.log("WhatsApp skip:", e.message));
    }
    */

    console.log(`\n✅ All done: ${job.title}`);
    return null;
});

// =========================================================
// 3️⃣ CLI RUNNER
// =========================================================
exports.runJobScraper = async (maxJobs = 5) => {
    try {
        console.log("🤖 CLI Scraper Started...");
        const count = await scrapeGovtJobsLogic(maxJobs);
        console.log(`🎯 Done: ${count} jobs saved`);
        return count;
    } catch (error) {
        console.error("❌ CLI Failed:", error.message);
        throw error;
    }
};

// =========================================================
// ✅ Direct Run (GitHub Actions / CLI)
// =========================================================
if (require.main === module) {
    const maxJobs = parseInt(process.argv[2]) || 5;
    scrapeGovtJobsLogic(maxJobs)
        .then(count => {
            console.log(`✅ Complete: ${count} jobs saved`);
            process.exit(0);
        })
        .catch(err => {
            console.error("❌ Failed:", err.message);
            process.exit(1);
        });
}


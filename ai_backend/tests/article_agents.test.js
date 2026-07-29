"use strict";

/**
 * Tests for the source-grounded AI Article Agents:
 *   - source_fetcher: safe URL validation + grounded extraction
 *   - job_article_writer / fast_track_article_writer: normalization rules
 *   - fact_quality_reviewer: hallucination, duplicate, stuffing, structure
 *   - article_pipeline: draft-first guarantee + guarded publishing
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSafeSourceUrl,
  fetchAndExtractSource,
  extractFromHtml,
  isPrivateHostname
} = require("../agents/article_agents/source_fetcher");
const {
  normalizeJobArticle,
  generateJobArticle,
  buildJobWriterPrompt
} = require("../agents/article_agents/job_article_writer");
const {
  normalizeFastTrackArticle,
  generateFastTrackArticle
} = require("../agents/article_agents/fast_track_article_writer");
const {
  reviewArticle,
  extractClaims,
  numberSetOf,
  parseDateFlexible
} = require("../agents/article_agents/fact_quality_reviewer");
const {
  searchAndFetchSource,
  searchWeb,
  buildSearchQuery,
  scoreCandidate,
  unwrapDuckDuckGo,
  unwrapBing,
  decodeGoogleNewsUrl,
  dedupeQueryWords
} = require("../agents/article_agents/web_searcher");
const {
  runGeneratePipeline,
  buildDraftRecord,
  assertPublishable,
  buildJobPublishPayload,
  buildFastTrackPublishPayload,
  sanitizeJobDate,
  sanitizeJobFee,
  reReview,
  packTables,
  unpackTables
} = require("../agents/article_agents/article_pipeline");
const { EDITORIAL_AUTHOR } = require("../agents/article_agents/constants");

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const SOURCE_URL = "https://ssc.gov.in/portal/cgl-notification-2026";

const JOB_SOURCE_HTML = `<!doctype html><html><head>
<title>SSC CGL 2026 Notification - Apply Online for 5432 Posts</title>
<meta name="description" content="SSC CGL 2026 recruitment notification">
</head><body>
<nav>skip nav</nav>
<article>
<h1>SSC CGL 2026 Recruitment</h1>
<p>Staff Selection Commission (SSC) has released the Combined Graduate Level (CGL) 2026 notification.
Advt No: SSC/CGL/2026/01. Eligible candidates can apply online at the official website ssc.gov.in.</p>
<table>
<tr><th>Event</th><th>Date</th></tr>
<tr><td>Application Start Date</td><td>01/07/2026</td></tr>
<tr><td>Last Date to Apply</td><td>31/07/2026</td></tr>
<tr><td>Exam Date</td><td>October 2026</td></tr>
</table>
<table>
<tr><th>Category</th><th>Fee</th></tr>
<tr><td>General / OBC / EWS</td><td>Rs. 100</td></tr>
<tr><td>SC / ST / Female</td><td>Rs. 0 (Nil)</td></tr>
</table>
<p>Total Vacancies: 5432 posts. Qualification: Bachelor Degree in any stream from a recognized university.
Age Limit: 18 to 32 years as on 01/08/2026. Salary: Pay Level 4 to Level 8 (Rs. 25500 to Rs. 151100).</p>
<p>Selection Process: Tier-I written exam, Tier-II exam, Document Verification.</p>
</article>
<a href="https://ssc.gov.in/apply-cgl-2026">Apply Online for SSC CGL</a>
<a href="https://ssc.gov.in/pdf/cgl-2026-notification.pdf">Download Notification PDF</a>
<a href="https://freejobalert.com/some-spam-page">Spam aggregator link</a>
<footer>footer junk</footer>
</body></html>`;

function makeJobSource() {
  const extracted = extractFromHtml(JOB_SOURCE_HTML, SOURCE_URL);
  return { ok: true, url: SOURCE_URL, fetchedAt: "2026-07-27T10:00:00.000Z", ...extracted };
}

/** A writer JSON payload that is fully grounded in JOB_SOURCE_HTML. */
function groundedWriterPayload(overrides = {}) {
  return {
    seoTitle: "SSC CGL 2026 Recruitment 5432 Posts - Apply Online",
    metaDescription:
      "SSC CGL 2026 भर्ती के लिए ऑनलाइन आवेदन करें। 5432 पदों पर नौकरी, आवेदन 31/07/2026 तक। फीस, पात्रता, सैलरी और चयन प्रक्रिया की पूरी जानकारी यहाँ देखें।",
    slug: "ssc-cgl-2026-recruitment",
    h1: "SSC CGL 2026 Recruitment",
    shortDescription: "Staff Selection Commission ने SSC CGL 2026 के 5432 पदों के लिए नोटिफिकेशन जारी किया है। ऑनलाइन आवेदन 31/07/2026 तक।",
    facts: {
      title: "SSC CGL 2026",
      organization: "Staff Selection Commission (SSC)",
      advtNo: "SSC/CGL/2026/01",
      category: "ssc",
      startDate: "01/07/2026",
      lastDate: "31/07/2026",
      examDate: "October 2026",
      vacancies: "5432",
      salary: "Pay Level 4 to Level 8 (Rs. 25500 to Rs. 151100)",
      qualification: "Bachelor Degree in any stream",
      minAge: "18",
      ageLimit: "18 to 32 years",
      location: "India",
      selectionProcess: "Tier-I written exam, Tier-II exam, Document Verification",
      eligibility: "Bachelor Degree, 18 to 32 years",
      feeGen: "100",
      feeSCST: "0",
      feeFemale: "0",
      feeOBC: "100",
      applicationFee: "Online payment",
      applyLink: "https://ssc.gov.in/apply-cgl-2026",
      notificationLink: "https://ssc.gov.in/pdf/cgl-2026-notification.pdf",
      officialSiteLink: "https://ssc.gov.in"
    },
    officialLinks: [
      { label: "Apply Online", url: "https://ssc.gov.in/apply-cgl-2026" },
      { label: "Notification PDF", url: "https://ssc.gov.in/pdf/cgl-2026-notification.pdf" }
    ],
    keywords: ["ssc cgl 2026", "ssc cgl vacancy 2026"],
    ...overrides
  };
}

/**
 * Generate a long, varied, grounded article body (>1600 words) without
 * keyword-stuffing density and without ungrounded numbers.
 */
const SENTENCE_BANK = [
  "Staff Selection Commission की इस भर्ती का नोटिफिकेशन आधिकारिक वेबसाइट पर जारी हुआ है और उम्मीदवारों को आवेदन से पहले पूरी जानकारी ध्यान से पढ़नी चाहिए।",
  "Combined Graduate Level परीक्षा देशभर के अभ्यर्थियों के लिए एक बड़ा अवसर मानी जाती है क्योंकि इसमें ग्रेजुएट स्तर की अलग-अलग पोस्टिंग मिलती है।",
  "आवेदन करने से पहले अभ्यर्थी अपनी शैक्षणिक योग्यता, आयु सीमा और आरक्षण संबंधी शर्तों को official notification से जरूर मिला लें।",
  "ऑनलाइन फॉर्म भरते समय नाम, जन्म तिथि और श्रेणी जैसी जानकारी बिल्कुल सही भरनी चाहिए क्योंकि बाद में सुधार की गुंजाइश सीमित होती है।",
  "तैयारी के लिए उम्मीदवार पिछले वर्षों के प्रश्न पत्र, सिलेबस और समय प्रबंधन की रणनीति पर ध्यान दे सकते हैं।",
  "भर्ती प्रक्रिया पूरी तरह पारदर्शी तरीके से चलती है और हर चरण की सूचना आधिकारिक पोर्टल पर समय-समय पर अपडेट होती रहती है।",
  "Admit card संबंधी जानकारी परीक्षा से पहले commission की वेबसाइट पर उपलब्ध कराई जाती है, इसलिए नियमित जांच करते रहें।",
  "चयन प्रक्रिया में Tier-I और Tier-II लिखित परीक्षा के बाद Document Verification का चरण आता है, जैसा कि नोटिफिकेशन में बताया गया है।",
  "आवेदन शुल्क का भुगतान ऑनलाइन माध्यम से किया जाता है और रसीद की प्रति सुरक्षित रखना उम्मीदवार की जिम्मेदारी होती है।",
  "Bachelor Degree किसी भी stream में मान्यता प्राप्त university से होनी चाहिए, यह शर्त notification में साफ लिखी है।",
  "फॉर्म जमा करने के बाद application number कहीं नोट कर लें ताकि भविष्य में status check करने में दिक्कत न हो।",
  "Exam date, city intimation और admit card जैसी अपडेट्स के लिए केवल आधिकारिक स्रोतों पर भरोसा करें, अफवाहों पर नहीं।",
  "Category wise आरक्षण नियम सरकारी दिशानिर्देशों के अनुसार लागू होते हैं और इसका विवरण notification में दिया गया है।",
  "मेरिट सूची परीक्षा के प्रदर्शन के आधार पर बनती है, इसलिए नियमित अभ्यास और रिवीजन ही सफलता की कुंजी है।",
  "सरकारी नौकरी की तैयारी कर रहे अभ्यर्थियों के लिए यह भर्ती एक महत्वपूर्ण मौका है क्योंकि पदों की संख्या अच्छी है।"
];

function groundedContentHtml(wordTarget = 1450) {
  const overview = `
    <h1>SSC CGL 2026 Recruitment</h1>
    <h2>संक्षिप्त जानकारी</h2>
    <p>Staff Selection Commission (SSC) ने Combined Graduate Level (CGL) 2026 की official notification जारी कर दी है।
    इस भर्ती में कुल 5432 posts भरे जाने हैं और आवेदन प्रक्रिया ऑनलाइन माध्यम से चलेगी। Advt No SSC/CGL/2026/01 के तहत
    योग्य उम्मीदवार आधिकारिक वेबसाइट ssc.gov.in पर आवेदन कर सकते हैं।</p>
    <div class="table-responsive"><table class="ai-data-table"><thead><tr><th>विवरण</th><th>जानकारी</th></tr></thead>
    <tbody>
    <tr><td>संगठन</td><td>Staff Selection Commission (SSC)</td></tr>
    <tr><td>कुल पद</td><td>5432</td></tr>
    <tr><td>योग्यता</td><td>Bachelor Degree</td></tr>
    <tr><td>आयु सीमा</td><td>18 से 32 वर्ष</td></tr>
    </tbody></table></div>
    <h2>महत्वपूर्ण तिथियाँ (Important Dates)</h2>
    <p>Notification के अनुसार आवेदन की प्रक्रिया 01/07/2026 से शुरू हो रही है और अंतिम तिथि 31/07/2026 है। परीक्षा October 2026 में आयोजित होने की बात कही गई है।</p>
    <div class="table-responsive"><table class="ai-data-table"><thead><tr><th>घटना</th><th>तिथि</th></tr></thead>
    <tbody>
    <tr><td>आवेदन शुरू</td><td>01/07/2026</td></tr>
    <tr><td>अंतिम तिथि</td><td>31/07/2026</td></tr>
    </tbody></table></div>
    <h2>आवेदन शुल्क (Application Fee)</h2>
    <p>General, OBC और EWS श्रेणी के उम्मीदवारों के लिए शुल्क Rs. 100 रखा गया है, जबकि SC, ST और Female अभ्यर्थियों के लिए शुल्क Rs. 0 यानी शून्य है।</p>
    <div class="table-responsive"><table class="ai-data-table"><thead><tr><th>श्रेणी</th><th>शुल्क</th></tr></thead>
    <tbody><tr><td>General / OBC / EWS</td><td>Rs. 100</td></tr><tr><td>SC / ST / Female</td><td>Rs. 0</td></tr></tbody></table></div>
    <h2>पात्रता और योग्यता (Eligibility)</h2>
    <p>इस भर्ती के लिए उम्मीदवार के पास मान्यता प्राप्त university से किसी भी stream में Bachelor Degree होना आवश्यक है। आयु सीमा 18 से 32 वर्ष बताई गई है और आरक्षित श्रेणियों को नियमानुसार छूट का प्रावधान notification में दिया गया है।</p>
    <h2>वेतन (Salary Details)</h2>
    <p>चुने गए उम्मीदवारों को Pay Level 4 से Level 8 तक का वेतन दिया जाएगा, जिसकी राशि Rs. 25500 से Rs. 151100 तक बताई गई है।</p>
    <h2>चयन प्रक्रिया (Selection Process)</h2>
    <p>Notification के अनुसार चयन Tier-I लिखित परीक्षा, Tier-II परीक्षा और Document Verification के माध्यम से होगा। हर चरण qualify करना अनिवार्य है।</p>
    <h2>आवेदन कैसे करें (How to Apply Online)</h2>
    <p>सबसे पहले आधिकारिक वेबसाइट खोलें और अपना registration करें। इसके बाद लॉगिन करके फॉर्म की जानकारी ध्यान से भरें, दस्तावेज़ अपलोड करें, शुल्क का भुगतान करें और अंत में फॉर्म submit करके प्रिंटआउट अवश्य ले लें।</p>
    <h3>फॉर्म भरते समय ध्यान रखने योग्य बातें</h3>
    <p>फोटो और हस्ताक्षर स्पष्ट होने चाहिए, मोबाइल नंबर और ईमेल सक्रिय रखें तथा किसी भी गलती से बचने के लिए preview जरूर देखें।</p>
    <h2>जरूरी दस्तावेज़ (Documents Required)</h2>
    <p>आवेदन के समय पासपोर्ट साइज फोटो, हस्ताक्षर, शैक्षणिक प्रमाणपत्र, श्रेणी प्रमाणपत्र और पहचान पत्र जैसे documents तैयार रखने चाहिए।</p>
    <h2>Important Links (महत्वपूर्ण लिंक)</h2>
    <p>आवेदन और notification से जुड़े official links नीचे दिए गए हैं:</p>
    <ul>
      <li><a href="https://ssc.gov.in/apply-cgl-2026">Apply Online</a></li>
      <li><a href="https://ssc.gov.in/pdf/cgl-2026-notification.pdf">Notification PDF</a></li>
    </ul>
    <h2>अक्सर पूछे जाने वाले प्रश्न (FAQs)</h2>`;

  const sentences = [];
  let words = 0;
  let i = 0;
  while (words < wordTarget) {
    const s = SENTENCE_BANK[i % SENTENCE_BANK.length];
    sentences.push(s);
    words += s.split(/\s+/).length;
    i++;
  }
  return overview + `<p>${sentences.join(" ")}</p>`;
}

function groundedFaqs() {
  return [
    { question: "SSC CGL 2026 में कुल कितने पद हैं?", answer: "Notification के अनुसार कुल 5432 posts भरे जाने हैं।" },
    { question: "SSC CGL 2026 आवेदन की अंतिम तिथि क्या है?", answer: "ऑनलाइन आवेदन की अंतिम तिथि 31/07/2026 बताई गई है।" },
    { question: "आवेदन शुल्क कितना है?", answer: "General, OBC, EWS के लिए Rs. 100 और SC, ST, Female के लिए Rs. 0 है।" },
    { question: "SSC CGL 2026 के लिए योग्यता क्या है?", answer: "मान्यता प्राप्त university से Bachelor Degree होना आवश्यक है।" },
    { question: "चयन प्रक्रिया क्या है?", answer: "Tier-I परीक्षा, Tier-II परीक्षा और Document Verification।" }
  ];
}

function makeGroundedJobArticle() {
  const source = makeJobSource();
  const raw = groundedWriterPayload({
    contentHtml: groundedContentHtml(),
    faqs: groundedFaqs()
  });
  return normalizeJobArticle(raw, { source });
}

/* ------------------------------------------------------------------ */
/* 1. Source fetcher                                                   */
/* ------------------------------------------------------------------ */

test("source fetcher rejects unsafe URLs", () => {
  for (const bad of [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "javascript:alert(1)",
    "http://127.0.0.1/admin",
    "http://localhost:3000/jobs",
    "http://192.168.1.5/x",
    "http://10.0.0.8/x",
    "http://169.254.169.254/latest/meta-data",
    "https://user:pass@example.com/x",
    "not-a-url"
  ]) {
    assert.throws(() => assertSafeSourceUrl(bad), /./, `should reject ${bad}`);
  }
  assert.equal(isPrivateHostname("ssc.gov.in"), false);
  const parsed = assertSafeSourceUrl(" https://ssc.gov.in/notice ");
  assert.equal(parsed.hostname, "ssc.gov.in");
});

test("source fetcher extracts text, tables and links safely", async () => {
  const httpGet = async () => ({ data: JOB_SOURCE_HTML, headers: {} });
  const source = await fetchAndExtractSource(SOURCE_URL, { httpGet });

  assert.equal(source.ok, true);
  assert.match(source.pageTitle, /SSC CGL 2026/);
  assert.match(source.text, /5432 posts/);
  assert.ok(!source.text.includes("footer junk"), "nav/footer content should be removed");
  assert.equal(source.tables.length, 2);
  assert.deepEqual(source.tables[0][1], ["Application Start Date", "01/07/2026"]);

  const urls = source.links.map((l) => l.url);
  assert.ok(urls.includes("https://ssc.gov.in/apply-cgl-2026"));
  assert.ok(urls.includes("https://ssc.gov.in/pdf/cgl-2026-notification.pdf"));
});

test("source fetcher fails when page has too little text", async () => {
  const thinPage = `<!doctype html><html><head><title>x</title></head><body><p>hi</p></body></html>${"<!-- pad -->".repeat(12)}`;
  const httpGet = async () => ({ data: thinPage, headers: {} });
  await assert.rejects(() => fetchAndExtractSource("https://example.com/x", { httpGet }), /little readable text/);
});

/* ------------------------------------------------------------------ */
/* 2. Job Article Writer                                               */
/* ------------------------------------------------------------------ */

test("job writer prompt is source-grounded and demands the required structure", () => {
  const prompt = buildJobWriterPrompt({ source: makeJobSource(), instructions: "focus on dates" });
  assert.match(prompt, /NEVER invent or guess dates/);
  assert.match(prompt, /1600-2500/);
  assert.match(prompt, /table-responsive/);
  assert.match(prompt, new RegExp(EDITORIAL_AUTHOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, /01\/07\/2026/); // grounded table data present
  assert.match(prompt, /focus on dates/);
});

test("job writer normalization enforces single h1, responsive tables and editorial author", async () => {
  const source = makeJobSource();
  const raw = groundedWriterPayload({
    contentHtml:
      '<h1>Wrong H1</h1><h1>Second h1 gets demoted</h1><h2>महत्वपूर्ण तिथियाँ</h2><table><tr><td>31/07/2026</td></tr></table><p><a href="https://freejobalert.com/spam">bad link</a></p><script>alert(1)</script>',
    officialLinks: [
      { label: "Spam", url: "https://freejobalert.com/spam" },
      { label: "Apply Online", url: "https://ssc.gov.in/apply-cgl-2026" }
    ],
    faqs: groundedFaqs()
  });

  const article = normalizeJobArticle(raw, { source });

  const h1Count = (article.contentHtml.match(/<h1/g) || []).length;
  assert.equal(h1Count, 1, "exactly one h1 must survive");
  assert.match(article.contentHtml, /<h1>SSC CGL 2026 Recruitment<\/h1>/);
  assert.match(article.contentHtml, /<h2>Second h1 gets demoted<\/h2>/);
  assert.match(article.contentHtml, /table-responsive/);
  assert.ok(!article.contentHtml.includes("freejobalert.com"), "blocked-domain anchors must be dropped");
  assert.ok(!article.contentHtml.includes("<script>"));

  assert.equal(article.authorName, EDITORIAL_AUTHOR);
  assert.equal(article.officialLinks.length, 1);
  assert.equal(article.officialLinks[0].url, "https://ssc.gov.in/apply-cgl-2026");
  assert.equal(article.facts.applyLink, "https://ssc.gov.in/apply-cgl-2026");
});

test("job writer applies source-url fallback for applyLink and structured data omits unknown facts", () => {
  const source = makeJobSource();
  const raw = groundedWriterPayload({
    contentHtml: groundedContentHtml(),
    faqs: groundedFaqs()
  });
  raw.facts.applyLink = "https://freejobalert.com/blocked-apply"; // must be rejected
  raw.facts.examDate = ""; // unknown → must not appear in schema

  const article = normalizeJobArticle(raw, { source });
  assert.equal(article.facts.applyLink, SOURCE_URL, "blocked/empty apply link falls back to the source URL");

  const schemaText = JSON.stringify(article.structuredData);
  assert.match(schemaText, /JobPosting/);
  assert.match(schemaText, /FAQPage/);
  assert.match(schemaText, /Staff Selection Commission/);
  assert.match(schemaText, /5432/);
  const jobPosting = article.structuredData[0];
  assert.equal(jobPosting.validThrough, "31/07/2026");
  assert.equal("baseSalary" in jobPosting, true);
  assert.match(JSON.stringify(jobPosting.baseSalary), /151100/);
});

test("generateJobArticle works with an injectable model client", async () => {
  const source = makeJobSource();
  const raw = groundedWriterPayload({ contentHtml: groundedContentHtml(), faqs: groundedFaqs() });
  const article = await generateJobArticle(
    { source, instructions: "" },
    { generateJson: async () => JSON.parse(JSON.stringify(raw)) }
  );
  assert.equal(article.type, "JOB");
  assert.equal(article.slug, "ssc-cgl-2026-recruitment");
  assert.ok(article.wordCount > 1600, `wordCount=${article.wordCount} should exceed 1600`);
});

/* ------------------------------------------------------------------ */
/* 3. Fast Track Article Writer                                        */
/* ------------------------------------------------------------------ */

test("fast track writer normalization keeps official direct link only", () => {
  const source = makeJobSource();
  const raw = {
    seoTitle: "SSC CGL 2026 Result - Check at ssc.gov.in",
    metaDescription: "SSC CGL 2026 का result official website ssc.gov.in पर जारी हुआ है। Roll number से अपना result देखने की प्रक्रिया यहाँ देखें।",
    slug: "ssc-cgl-2026-result",
    h1: "SSC CGL 2026 Result",
    shortDescription: "SSC ने CGL 2026 result जारी कर दिया है।",
    contentHtml: groundedContentHtml(),
    faqs: groundedFaqs(),
    facts: {
      title: "SSC CGL 2026 Result",
      category: "Result",
      org: "Staff Selection Commission (SSC)",
      updateDate: "27/07/2026",
      directLink: "https://freejobalert.com/fake-result-link"
    },
    officialLinks: [{ label: "Check Result", url: "https://ssc.gov.in/apply-cgl-2026" }]
  };

  const article = normalizeFastTrackArticle(raw, { source });
  assert.equal(article.type, "FAST_TRACK");
  assert.equal(article.facts.category, "Result");
  assert.equal(article.facts.directLink, "", "blocked aggregator links must be dropped");
  assert.equal(article.authorName, EDITORIAL_AUTHOR);
  const schemaText = JSON.stringify(article.structuredData);
  assert.match(schemaText, /"Article"/);
  assert.match(schemaText, /FAQPage/);
  assert.match(schemaText, new RegExp(EDITORIAL_AUTHOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("generateFastTrackArticle uses the separate fast-track writer", async () => {
  const source = makeJobSource();
  const raw = {
    seoTitle: "SSC CGL 2026 Answer Key Released",
    metaDescription: "SSC CGL 2026 answer key official portal पर उपलब्ध है। Download करने की पूरी प्रक्रिया और objection की जानकारी यहाँ पढ़ें।",
    slug: "ssc-cgl-2026-answer-key",
    h1: "SSC CGL 2026 Answer Key",
    shortDescription: "Answer key जारी।",
    contentHtml: groundedContentHtml(),
    faqs: groundedFaqs(),
    facts: { title: "SSC CGL 2026 Answer Key", category: "Answer Key", org: "SSC", updateDate: "27/07/2026", directLink: "https://ssc.gov.in/apply-cgl-2026" },
    officialLinks: []
  };
  const article = await generateFastTrackArticle(
    { source },
    { generateJson: async () => JSON.parse(JSON.stringify(raw)) }
  );
  assert.equal(article.facts.category, "Answer Key");
  assert.equal(article.facts.directLink, "https://ssc.gov.in/apply-cgl-2026");
});

/* ------------------------------------------------------------------ */
/* 4. Fact & Quality Reviewer                                          */
/* ------------------------------------------------------------------ */

test("reviewer passes a fully grounded, well-structured job article", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  const review = reviewArticle({
    type: "JOB",
    article,
    source,
    existing: { titles: [], slugs: [], snippets: [] }
  });
  assert.deepEqual(review.issues, [], `unexpected issues: ${review.issues.join(" | ")}`);
  assert.equal(review.verdict, "pass");
  assert.ok(review.metrics.wordCount >= 1600);
});

test("reviewer blocks hallucinated fees, dates and vacancy numbers", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  article.contentHtml = article.contentHtml.replace(
    "</ul>",
    "</ul><p>अंतिम तिथि 15/09/2026 है और शुल्क ₹ 999 लगेगा। कुल 12800 posts पर भर्ती होगी।</p>"
  );
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.equal(review.verdict, "fail");
  assert.ok(review.issues.some((i) => i.startsWith("hallucination:date") && i.includes("15/09/2026")), review.issues.join("|"));
  assert.ok(review.issues.some((i) => i.startsWith("hallucination:money") && i.includes("999")), review.issues.join("|"));
  assert.ok(review.issues.some((i) => i.startsWith("hallucination:vacancy") && i.includes("12800")), review.issues.join("|"));
});

test("reviewer treats re-formatted but source-grounded numbers as verified", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  // "5,432" (comma format) and "1 July 2026" style are different strings but
  // component numbers exist in the source → must NOT be flagged.
  article.contentHtml = article.contentHtml.replace("</ul>", "</ul><p>कुल 5,432 posts पर आवेदन शुरू हो चुके हैं।</p>");
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(!review.issues.some((i) => i.includes("5,432") || i.includes("5432")), review.issues.join("|"));
});

test("reviewer blocks duplicate slug and duplicate title", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();

  const bySlug = reviewArticle({
    type: "JOB",
    article,
    source,
    existing: { titles: [], slugs: ["ssc-cgl-2026-recruitment"], snippets: [] }
  });
  assert.equal(bySlug.verdict, "fail");
  assert.ok(bySlug.issues.some((i) => i.startsWith("duplicate:slug")));

  const byTitle = reviewArticle({
    type: "JOB",
    article,
    source,
    existing: { titles: ["SSC CGL 2026 Recruitment"], slugs: [], snippets: [] }
  });
  assert.equal(byTitle.verdict, "fail");
  assert.ok(byTitle.issues.some((i) => i.startsWith("duplicate:title")));

  const byContent = reviewArticle({
    type: "JOB",
    article,
    source,
    existing: { titles: [], slugs: [], snippets: [article.contentHtml] }
  });
  assert.equal(byContent.verdict, "fail");
  assert.ok(byContent.issues.some((i) => i.startsWith("duplicate:content-similarity")));
});

test("reviewer blocks keyword stuffing", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  const stuffed = "<p>" + "sarkari naukri ssc job ".repeat(200) + "</p>";
  article.contentHtml = article.contentHtml + stuffed;
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.equal(review.verdict, "fail");
  assert.ok(review.issues.some((i) => i.startsWith("keyword-stuffing")), review.issues.join("|"));
});

test("reviewer blocks structural problems and wrong author", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();

  const short = { ...article, contentHtml: "<h1>X</h1><h2>a</h2><p>छोटा लेख।</p>", wordCount: 12 };
  const shortReview = reviewArticle({ type: "JOB", article: short, source, existing: {} });
  assert.equal(shortReview.verdict, "fail");
  assert.ok(shortReview.issues.some((i) => i.startsWith("word-count-low")));

  const multiH1 = { ...article, contentHtml: "<h1>A</h1><h1>B</h1>" + article.contentHtml };
  const multiReview = reviewArticle({ type: "JOB", article: multiH1, source, existing: {} });
  assert.ok(multiReview.issues.some((i) => i.startsWith("structure:multiple-h1")));

  const noFaq = { ...article, faqs: [] };
  const faqReview = reviewArticle({ type: "JOB", article: noFaq, source, existing: {} });
  assert.ok(faqReview.issues.some((i) => i.startsWith("structure:too-few-faqs")));

  const badAuthor = { ...article, authorName: "Rahul Kumar" };
  const authorReview = reviewArticle({ type: "JOB", article: badAuthor, source, existing: {} });
  assert.ok(authorReview.issues.some((i) => i.startsWith("author:invalid")));

  const noLinks = { ...article, officialLinks: [] };
  const linkReview = reviewArticle({ type: "JOB", article: noLinks, source, existing: {} });
  assert.ok(linkReview.issues.some((i) => i.startsWith("official-links:missing")));
});

test("claim extraction understands dates, money, vacancies and percentages", () => {
  const claims = extractClaims("अंतिम तिथि 31/07/2026, शुल्क ₹ 100, कुल 5432 posts, 50% आरक्षण, 12 अगस्त 2026 तक।");
  const kinds = claims.map((c) => c.kind);
  assert.ok(kinds.includes("date"));
  assert.ok(kinds.includes("money"));
  assert.ok(kinds.includes("vacancy"));
  assert.ok(kinds.includes("percent"));
  const nums = numberSetOf("₹ 5,432 दिनांक 01/07/2026");
  assert.ok(nums.has("5432"));
  assert.ok(nums.has("01"));
  assert.ok(nums.has("1"), "de-zeroed variant should exist");
  assert.ok(nums.has("2026"));
});

/* ------------------------------------------------------------------ */
/* 5. Pipeline: draft-first & guarded publishing                       */
/* ------------------------------------------------------------------ */

async function makeDraftViaPipeline(mode = "auto") {
  const source = makeJobSource();
  const raw = groundedWriterPayload({ contentHtml: groundedContentHtml(), faqs: groundedFaqs() });
  return runGeneratePipeline(
    { type: "job", sourceUrl: SOURCE_URL, instructions: "", mode, source, existing: { titles: [], slugs: [], snippets: [] } },
    { writerDeps: { generateJson: async () => JSON.parse(JSON.stringify(raw)) } }
  );
}

test("pipeline always creates a draft — automatic mode can never publish directly", async () => {
  const draft = await makeDraftViaPipeline("auto");
  assert.equal(draft.status, "draft");
  assert.equal(draft.mode, "auto");
  assert.equal(draft.publishedDocId, null);
  assert.equal(draft.publishedCollection, null);
  assert.equal(draft.reviewStatus, "passed");
  assert.equal(draft.publishBlocked, false);
  assert.equal(draft.authorName, EDITORIAL_AUTHOR);
  assert.ok(draft.sourceSnapshot.sha256.length > 20);

  const manualDraft = await makeDraftViaPipeline("manual");
  assert.equal(manualDraft.status, "draft", "even manual generation stays draft-first");
});

test("failed review marks the draft unpublishable", async () => {
  const source = makeJobSource();
  const raw = groundedWriterPayload({
    contentHtml: groundedContentHtml() + "<p>भर्ती 99999 posts की है।</p>",
    faqs: groundedFaqs()
  });
  const draft = await runGeneratePipeline(
    { type: "job", sourceUrl: SOURCE_URL, instructions: "", mode: "auto", source, existing: {} },
    { writerDeps: { generateJson: async () => JSON.parse(JSON.stringify(raw)) } }
  );
  assert.equal(draft.reviewStatus, "failed");
  assert.equal(draft.publishBlocked, true);
  assert.equal(draft.status, "draft");
});

test("assertPublishable blocks failed/stale/published drafts and not manual review bypass", async () => {
  const good = await makeDraftViaPipeline("manual");
  assert.equal(assertPublishable(good), true);

  const failed = { ...good, reviewStatus: "failed" };
  assert.throws(() => assertPublishable(failed), /Publish blocked/);

  const stale = { ...good, reviewStale: true };
  assert.throws(() => assertPublishable(stale), /re-run|review/i);

  const published = { ...good, status: "published" };
  assert.throws(() => assertPublishable(published), /already published/i);

  assert.throws(() => assertPublishable(null), /Draft not found/);
});

test("publish payload builders map to existing jobs / fast_track shapes", async () => {
  const draft = await makeDraftViaPipeline("manual");

  const jobPayload = buildJobPublishPayload({ ...draft }, "draft-123");
  assert.equal(jobPayload.type, "JOB");
  assert.equal(jobPayload.status, "published");
  assert.equal(jobPayload.authorName, EDITORIAL_AUTHOR);
  assert.equal(jobPayload.organization, "Staff Selection Commission (SSC)");
  assert.equal(jobPayload.vacancies, "5432");
  assert.equal(jobPayload.lastDate, "2026-07-31"); // panel ke liye ISO normalize hota hai
  assert.equal(jobPayload.applyLink, "https://ssc.gov.in/apply-cgl-2026");
  assert.equal(jobPayload.publishedFromDraftId, "draft-123");
  assert.ok(Array.isArray(jobPayload.faqs) && jobPayload.faqs.length >= 4);
  assert.match(jobPayload.schemaMarkup, /JobPosting/);
  assert.equal(Object.getPrototypeOf(jobPayload), Object.prototype);

  const ftPayload = buildFastTrackPublishPayload(
    {
      ...draft,
      type: "FAST_TRACK",
      facts: { title: "SSC Result", category: "Result", org: "SSC", updateDate: "27/07/2026", directLink: "https://ssc.gov.in/apply-cgl-2026" }
    },
    "draft-9"
  );
  assert.equal(ftPayload.status, "published");
  assert.equal(ftPayload.category, "Result");
  assert.equal(ftPayload.directLink, "https://ssc.gov.in/apply-cgl-2026");
  assert.equal(ftPayload.authorName, EDITORIAL_AUTHOR);
});

test("Apply flow: reReview re-verifies edits against the stored snapshot", async () => {
  const draft = await makeDraftViaPipeline("manual");
  const editedArticle = {
    h1: draft.h1,
    seoTitle: draft.seoTitle,
    metaDescription: draft.metaDescription,
    shortDescription: draft.shortDescription,
    slug: draft.slug,
    contentHtml: draft.articleHtml + "<p>अब अंतिम तिथि 30/11/2026 हो गई है।</p>",
    faqs: draft.faqs,
    facts: { ...draft.facts, lastDate: "30/11/2026" },
    officialLinks: draft.officialLinks,
    keywords: draft.keywords,
    type: "JOB"
  };
  const { review } = reReview({
    type: "job",
    article: editedArticle,
    sourceSnapshot: draft.sourceSnapshot,
    existing: {}
  });
  assert.equal(review.verdict, "fail", "admin-invented date must fail verification");
  assert.ok(review.issues.some((i) => i.includes("30/11/2026")), review.issues.join("|"));
});

/* ------------------------------------------------------------------ */
/* 8. Originality, own-links & word-limit hardening                    */
/* ------------------------------------------------------------------ */

test("job article ends with hamare apne join-us section (4 official channels, idempotent)", () => {
  const source = makeJobSource();
  const raw = groundedWriterPayload({ contentHtml: groundedContentHtml(), faqs: groundedFaqs() });
  const article = normalizeJobArticle(raw, { source });

  assert.match(article.contentHtml, /youtube\.com\/@studygyaan_official/);
  assert.match(article.contentHtml, /t\.me\/studygyaan_official/);
  assert.match(article.contentHtml, /whatsapp\.com\/channel\//);
  assert.match(article.contentHtml, /facebook\.com\/StudyGyaan\.in/);
  assert.match(article.contentHtml, /ai-join-us-section/);

  // Apply-flow simulation: dubara normalize karne par section duplicate nahi hona chahiye.
  const again = normalizeJobArticle({ ...raw, contentHtml: article.contentHtml }, { source });
  const count = (again.contentHtml.match(/ai-join-us-section/g) || []).length;
  assert.equal(count, 1, "join-us section must be idempotent");
});

test("fast track article bhi hamare apne social links ke saath end hota hai", () => {
  const source = makeJobSource();
  const raw = {
    seoTitle: "SSC CGL Result 2026",
    metaDescription: "x".repeat(140),
    slug: "ssc-cgl-result-2026",
    h1: "SSC CGL Result 2026",
    shortDescription: "short",
    contentHtml: "<h1>SSC CGL Result 2026</h1><p>content</p>",
    faqs: [],
    facts: { title: "SSC CGL Result", category: "Result", org: "SSC" },
    officialLinks: [{ label: "Result", url: "https://ssc.gov.in/result" }],
    keywords: []
  };
  const article = normalizeFastTrackArticle(raw, { source });
  assert.match(article.contentHtml, /t\.me\/studygyaan_official/);
  assert.match(article.contentHtml, /youtube\.com\/@studygyaan_official/);
});

test("reviewer flags prose copied verbatim from the source page (Google duplicate content risk)", () => {
  const source = makeJobSource();
  // ~900 unique words ka unique prose — pura ka pura article me copy kiya gaya hai
  const copiedProse = Array.from({ length: 900 }, (_, i) => `uniquecopyword${i}`).join(" ");
  source.text = `${source.text} ${copiedProse}`;

  const article = makeGroundedJobArticle();
  article.contentHtml += `<p>${copiedProse}</p>`;

  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    review.issues.some((i) => i.startsWith("duplicate:source-copy")),
    `source-copy issue expected, got: ${review.issues.join("|")}`
  );
});

test("reviewer passes original wording even when all facts are the same", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle(); // alag wording, same facts (fixtures ka base case)
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    !review.issues.some((i) => i.startsWith("duplicate:source-copy")),
    `original prose must not be flagged: ${review.issues.join("|")}`
  );
});

test("generateJobArticle auto-compresses when writer overshoots the word limit", async () => {
  const source = makeJobSource();
  const longRaw = groundedWriterPayload({
    contentHtml: `${groundedContentHtml()}<p>${"और अतिरिक्त विस्तृत जानकारी बहुत लंबी पंक्ति ".repeat(900)}</p>`,
    faqs: groundedFaqs()
  });
  let calls = 0;
  const fakeGen = async () => {
    calls += 1;
    if (calls === 1) return JSON.parse(JSON.stringify(longRaw));
    return { contentHtml: groundedContentHtml(), faqs: groundedFaqs() }; // compress response
  };
  const article = await generateJobArticle({ source, instructions: "" }, { generateJson: fakeGen });
  assert.equal(calls, 2, "compress retry ek baar fire hona chahiye");
  assert.ok(article.wordCount <= 2700, `wordCount=${article.wordCount} should be back in range`);
});

test("source snapshot tables Firestore-safe hain (no nested arrays) aur losslessly restore hote hain", () => {
  const tables = [
    [
      ["Post Name", "Vacancies"],
      ["Social Worker", "12"]
    ]
  ];
  const packed = packTables(tables);
  const hasNestedArray = JSON.stringify(packed).includes("[[");
  assert.equal(hasNestedArray, false, "packed shape me array-in-array nahi hona chahiye");
  assert.deepEqual(unpackTables(packed), tables, "round-trip lossless hona chahiye");
});

test("source fetcher rejects apply/login form portal URLs with clear guidance", async () => {
  await assert.rejects(
    () => fetchAndExtractSource("https://cdn.digialm.com/EForms/configuredHtml/1258/101431/login.html"),
    (err) => {
      assert.equal(err.code, "INVALID_SOURCE_URL");
      assert.match(err.message, /NOTIFICATION page ya PDF/);
      return true;
    }
  );
  await assert.rejects(
    () => fetchAndExtractSource("https://example.gov.in/candidate-login.html"),
    (err) => {
      assert.equal(err.code, "INVALID_SOURCE_URL");
      return true;
    }
  );
});

test("patla noticeboard page: andar ka Notification PDF link khud follow ho jata hai", async () => {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const lines = [
    "CERT-In Scientist B Recruitment 2026 Official Notification",
    "Total 100 Vacancies Last Date 30 August 2026 Group A Posts",
    "Qualification B Tech M Tech Salary Level 10 Apply Online Mode"
  ];
  const stream = lines.map((l, i) => `BT /F1 12 Tf 50 ${750 - i * 20} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${stream.length}>>stream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((b, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${b}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  const pdfBuf = Buffer.from(out, "latin1");

  const boardHtml =
    '<html><body><div class="notice-board">' +
    '<a href="https://www.cert-in.org.in/PDF/ScientistB-Notification.pdf">Notification</a>' +
    "</div><p>CERT-In Recruitment Home 2026</p></body></html>";
  const httpGet = async (url) =>
    /\.pdf/i.test(url)
      ? { data: pdfBuf, headers: { "content-type": "application/pdf" } }
      : { data: boardHtml, headers: {} };

  const source = await fetchAndExtractSource(
    "https://examinationservices.nic.in/RecSys2026/Root/Home.aspx?enc=XYZ123",
    { httpGet }
  );
  assert.equal(source.via, "link-follow");
  assert.ok(source.text.includes("CERT-In Scientist B Recruitment 2026"), source.text.slice(0, 120));
  assert.ok(source.text.length >= 120);
});

/* ------------------------------------------------------------------ */
/* 9. Web searcher + freshness + name recheck (nayi powers)            */
/* ------------------------------------------------------------------ */

test("parseDateFlexible Hindi, English aur numeric dates samajhta hai", () => {
  const d1 = parseDateFlexible("25/08/2026");
  assert.equal(d1.getUTCFullYear(), 2026);
  assert.equal(d1.getUTCMonth(), 7);
  assert.equal(d1.getUTCDate(), 25);
  const d2 = parseDateFlexible("25 अगस्त 2026");
  assert.equal(d2.getUTCMonth(), 7);
  assert.equal(d2.getUTCDate(), 25);
  const d3 = parseDateFlexible("August 25, 2026");
  assert.equal(d3.getUTCMonth(), 7);
  assert.equal(parseDateFlexible("koi date nahi"), null);
  assert.equal(parseDateFlexible(""), null);
});

test("freshness check: beet chuki last date wali purani notification BLOCK hoti hai", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  const old = new Date(Date.now() - 60 * 86400000); // 60 din pehle
  const dd = String(old.getUTCDate()).padStart(2, "0");
  const mm = String(old.getUTCMonth() + 1).padStart(2, "0");
  const yy = old.getUTCFullYear();
  article.facts = { ...article.facts, lastDate: `${dd}/${mm}/${yy}` };
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    review.issues.some((i) => i.startsWith("freshness:expired")),
    `expired issue expected: ${review.issues.join("|")}`
  );
});

test("freshness check: aane wali (future) last date pass hoti hai", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  const future = new Date(Date.now() + 30 * 86400000);
  const dd = String(future.getUTCDate()).padStart(2, "0");
  const mm = String(future.getUTCMonth() + 1).padStart(2, "0");
  article.facts = { ...article.facts, lastDate: `${dd}/${mm}/${future.getUTCFullYear()}` };
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    !review.issues.some((i) => i.startsWith("freshness")),
    `future date must not be flagged: ${review.issues.join("|")}`
  );
});

test("name recheck: organization naam source me na ho to BLOCK (galat naam pakda jaata hai)", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  article.facts = { ...article.facts, organization: "Ministry of Imaginary Affairs Atlantis" };
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    review.issues.some((i) => i.startsWith("hallucination:organization")),
    `org hallucination expected: ${review.issues.join("|")}`
  );
});

test("name recheck: sahi organization naam (source wala) pass hota hai", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle(); // fixture ka org source me grounded hai
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    !review.issues.some((i) => i.startsWith("hallucination:organization")),
    `sahi naam flag nahi hona chahiye: ${review.issues.join("|")}`
  );
});

test("buildSearchQuery instructions se saaf query banata hai", () => {
  const q = buildSearchQuery("Job: SSC CGL 2026 | Staff Selection Commission | ssc", "");
  assert.match(q, /SSC CGL 2026/);
  assert.match(q, /Staff Selection Commission/);
  assert.match(q, /notification/);
  assert.ok(!/^Job:/i.test(q), "Job: prefix hatna chahiye");
  assert.equal(buildSearchQuery("", ""), "");
});

test("unwrapDuckDuckGo redirect se asli URL nikaalta hai", () => {
  const real = "https://ssc.gov.in/portal/cgl-notification-2026";
  const wrapped = `//duckduckgo.com/l/?uddg=${encodeURIComponent(real)}&rut=abc`;
  assert.equal(unwrapDuckDuckGo(wrapped), real);
});

test("candidate scoring official domain + notification word ko upar rakhti hai", () => {
  const official = scoreCandidate({ title: "CGL Notification 2026", url: "https://ssc.gov.in/cgl", via: "duckduckgo" });
  const random = scoreCandidate({ title: "Some blog post", url: "https://random-example-xyz.com/post", via: "google-news" });
  assert.ok(official > random, `official (${official}) should beat random (${random})`);
});

test("web searcher: link na ho to query se official source khud dhoondh laata hai", async () => {
  const realNotificationUrl = "https://ssc.gov.in/portal assistant notification".replace(" ", "-");
  const ddgHtml =
    `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(realNotificationUrl)}">` +
    "SSC Assistant Notification 2026</a>";
  const richHtml = `<html><body><main><p>${"SSC Assistant Recruitment 2026 official notification details with dates fees and vacancies. ".repeat(
    60
  )}</p></main></body></html>`;

  class FakeRssParser {
    async parseURL() {
      return { items: [] };
    }
  }
  const httpGet = async (url) => ({ data: url.includes("duckduckgo") ? ddgHtml : richHtml, headers: {} });
  const source = await searchAndFetchSource("SSC Assistant notification 2026", {
    httpGet,
    sourceHttpGet: httpGet,
    RssParser: FakeRssParser
  });
  assert.equal(source.via, "search");
  assert.equal(source.searchedQuery, "SSC Assistant notification 2026");
  assert.ok(source.text.length >= 600);
});

// =========================================================
//  MODEL CLIENT — transient retry + rate-limit fallback
// =========================================================
const { generateJson, isTransientGeminiError, isRateLimitError } = require("../agents/article_agents/model_client");

const noSleep = async () => {};

test("model client: transient 503 pe backoff-retry karke success laata hai", async () => {
  let calls = 0;
  const waits = [];
  const flaky = async () => {
    calls += 1;
    if (calls < 3) {
      const e = new Error("Gemini call failed — [503 UNAVAILABLE] model overloaded");
      e.code = "GEMINI_CALL_FAILED";
      throw e;
    }
    return { title: "ok" };
  };
  const out = await generateJson("prompt", {}, {
    callOnce: flaky,
    sleep: async (ms) => { waits.push(ms); }
  });
  assert.equal(out.title, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2500, 5000]);
});

test("model client: har baar 429 aaye to AI_RATE_LIMITED friendly error (3 koshishen)", async () => {
  let calls = 0;
  const limited = async () => {
    calls += 1;
    throw new Error("Gemini call failed — [429] Resource exhausted (quota)");
  };
  await assert.rejects(
    () => generateJson("prompt", {}, { callOnce: limited, sleep: noSleep }),
    (err) => {
      assert.equal(err.code, "AI_RATE_LIMITED");
      assert.match(err.message, /1-2 minute/);
      return true;
    }
  );
  assert.equal(calls, 3);
});

test("model client: non-JSON pe ek strict retry phir success (bina sleep ke)", async () => {
  let calls = 0;
  const badThenGood = async (prompt) => {
    calls += 1;
    if (calls === 1) {
      const e = new Error("Writer returned an unparseable JSON response");
      e.code = "WRITER_BAD_JSON";
      throw e;
    }
    assert.match(prompt, /STRICT RETRY/);
    return { a: 1 };
  };
  const out = await generateJson("p", {}, { callOnce: badThenGood, sleep: noSleep });
  assert.equal(out.a, 1);
  assert.equal(calls, 2);
});

test("model client: transient/rate-limit error classification sahi hai", () => {
  assert.ok(isTransientGeminiError("503 UNAVAILABLE model overloaded"));
  assert.ok(isTransientGeminiError("socket hang up"));
  assert.ok(!isTransientGeminiError("Writer returned an unparseable JSON response"));
  assert.ok(isRateLimitError("429 too many requests"));
  assert.ok(!isRateLimitError("503 UNAVAILABLE"));
});

// =========================================================
//  DATE/FEE PANEL CLEANUP + dates coverage (user complaint:
//  "publish hua par dates/box sahi nahi aaya")
// =========================================================

test("sanitizeJobDate: parseable → ISO, junk placeholder → drop, partial digit-text → keep", () => {
  assert.equal(sanitizeJobDate("31 July 2026"), "2026-07-31");
  assert.equal(sanitizeJobDate("31/07/2026"), "2026-07-31");
  assert.equal(sanitizeJobDate("नियमों के अनुसार"), "");
  assert.equal(sanitizeJobDate(""), "");
  assert.equal(sanitizeJobDate("1st week of Sept 2026"), "1st week of Sept 2026");
});

test("sanitizeJobFee: ₹ hatao, nil → 0, text-junk → drop", () => {
  assert.equal(sanitizeJobFee("₹1000/-"), "1000");
  assert.equal(sanitizeJobFee("₹Nil"), "0");
  assert.equal(sanitizeJobFee("Free"), "0");
  assert.equal(sanitizeJobFee("As per category"), "");
  assert.equal(sanitizeJobFee("100"), "100");
  assert.equal(sanitizeJobFee(""), "");
});

test("publish payload: info-box fields clean jaate hain (ISO dates, no ₹₹, no junk)", () => {
  const draft = {
    title: "Test Bharti 2026",
    slug: "test-bharti-2026",
    metaDescription: "meta",
    shortDescription: "short",
    articleHtml: "<h1>Test</h1>",
    facts: {
      organization: "Test Org",
      startDate: "01 July 2026",
      lastDate: "31/07/2026",
      examDate: "नियमों के अनुसार",
      feeGen: "₹1000/-",
      feeOBC: "₹ 250",
      feeSCST: "₹Nil",
      feeFemale: "Free"
    }
  };
  const payload = buildJobPublishPayload(draft, "draft-1");
  assert.equal(payload.startDate, "2026-07-01");
  assert.equal(payload.lastDate, "2026-07-31");
  assert.equal(payload.examDate, undefined, "junk examDate drop hona chahiye");
  assert.equal(payload.feeGen, "1000");
  assert.equal(payload.feeOBC, "250");
  assert.equal(payload.feeSCST, "0");
  assert.equal(payload.feeFemale, "0");
  assert.equal(payload.type, "JOB");
});

const DATE_STRIP_RE = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z\u0900-\u097F]{3,12}\s+\d{4}/g;

test("dates check: source me dates thi par article se gayab → BLOCK (dates:missed)", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  article.contentHtml = article.contentHtml.replace(DATE_STRIP_RE, "—");
  article.facts = { ...article.facts, startDate: "", lastDate: "", examDate: "" };
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    review.issues.some((i) => i.startsWith("dates:missed")),
    `dates:missed expected: ${review.issues.join("|")}`
  );
});

test("dates check: article me dates hain par JOB facts box khaali → BLOCK (dates:box-missing)", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  article.facts = { ...article.facts, startDate: "", lastDate: "", examDate: "" };
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    review.issues.some((i) => i.startsWith("dates:box-missing")),
    `dates:box-missing expected: ${review.issues.join("|")}`
  );
});

test("dates check: source me bhi date nahi to sirf warning, block nahi", () => {
  const source = makeJobSource();
  source.text = source.text.replace(DATE_STRIP_RE, "—");
  source.tables = (source.tables || []).map((rows) => rows.map((cells) => cells.map((c) => c.replace(DATE_STRIP_RE, "—"))));
  const article = makeGroundedJobArticle();
  article.contentHtml = article.contentHtml.replace(DATE_STRIP_RE, "—");
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    review.warnings.some((w) => w.startsWith("dates:none")),
    `dates:none warning expected: ${review.warnings.join("|")}`
  );
  assert.ok(
    !review.issues.some((i) => i.startsWith("dates:")),
    `date se related koi issue nahi hona chahiye: ${review.issues.join("|")}`
  );
});

test("dates check: normal grounded article par koi dates issue nahi aata", () => {
  const source = makeJobSource();
  const article = makeGroundedJobArticle();
  const review = reviewArticle({ type: "JOB", article, source, existing: {} });
  assert.ok(
    !review.issues.some((i) => i.startsWith("dates:")),
    `sahi article par dates issue nahi chahiye: ${review.issues.join("|")}`
  );
});

// =========================================================
//  WEB SEARCHER v2 — multi-engine fallback + redirect decode
//  (user case: "fast track aa hi nahi raha" — sirf google-news
//  redirect candidates try ho rahe the, DDG empty pada tha)
// =========================================================

test("unwrapBing ck/a redirect se asli URL nikaalta hai", () => {
  const real = "https://hpsc.gov.in/results-page";
  const wrapped = `https://www.bing.com/ck/a?u=a1${Buffer.from(real).toString("base64url")}&p=xyz`;
  assert.equal(unwrapBing(wrapped), real);
  assert.equal(unwrapBing(real), real); // direct URL waise ka waisa
});

test("decodeGoogleNewsUrl purane base64 format se publisher URL nikaalta hai", () => {
  const real = "https://hpsc.gov.in/WriteReadData/lKm0BcQsr95uADID9RWl6Q==/AP_Marks.pdf";
  const payload = Buffer.concat([
    Buffer.from([0x08, 0x13, 0x22, real.length]),
    Buffer.from(real, "latin1"),
    Buffer.from([0xd2, 0x01, 0x00])
  ]);
  const newsUrl = `https://news.google.com/rss/articles/${payload.toString("base64url")}?oc=5`;
  assert.equal(decodeGoogleNewsUrl(newsUrl), real);
  // Naya encrypted format (andhar koi http nahi) → URL waise ka waisa
  const nonsense = `https://news.google.com/rss/articles/${Buffer.from("random-encrypted-bytes-no-link").toString("base64url")}?oc=5`;
  assert.equal(decodeGoogleNewsUrl(nonsense), nonsense);
});

test("dedupeQueryWords duplicate shabd hata deta hai, order same rakhta hai", () => {
  assert.equal(
    dedupeQueryWords("HPSC Assistant Professor Result 2026 HPSC Result notification 2026"),
    "HPSC Assistant Professor Result 2026 notification"
  );
});

test("buildSearchQuery wand prefill me duplicate words nahi aane deta", () => {
  const q = buildSearchQuery("Fast Track: HPSC Assistant Professor Result 2026 | HPSC | Result", "");
  const hpscCount = q.toLowerCase().split(/\s+/).filter((w) => w === "hpsc").length;
  assert.equal(hpscCount, 1, `query me HPSC sirf ek baar hona chahiye: ${q}`);
  assert.ok(q.startsWith("HPSC Assistant Professor Result 2026"));
  assert.ok(q.includes("notification"));
});

test("searchWeb: DDG down ho to Bing se DIRECT URLs aa jaate hain (fault isolation)", async () => {
  const direct = "https://hpsc.gov.in/results/ap-marks.pdf";
  const wrappedReal = "https://hpsc.gov.in/results-page";
  const wrapped = `https://www.bing.com/ck/a?u=a1${Buffer.from(wrappedReal).toString("base64url")}&p=z`;
  const bingHtml =
    `<ul><li class="b_algo"><h2><a href="${direct}">HPSC AP Marks PDF</a></h2></li>` +
    `<li class="b_algo"><h2><a href="${wrapped}">HPSC Results Page</a></h2></li></ul>`;
  class FakeRssParser {
    async parseURL() {
      throw new Error("news bhi down");
    }
  }
  const httpGet = async (url) => {
    if (url.startsWith("https://www.bing.com/search")) return { data: bingHtml, headers: {} };
    throw new Error("blocked"); // DDG html + lite dono down
  };
  const results = await searchWeb("HPSC Assistant Professor Result 2026 notification 2026", {
    httpGet,
    RssParser: FakeRssParser
  });
  const urls = results.map((r) => r.url);
  assert.ok(urls.includes(direct), `bing direct candidate chahiye: ${urls.join(",")}`);
  assert.ok(urls.includes(wrappedReal), `bing wrapped decode hoke chahiye: ${urls.join(",")}`);
});

test("scoreCandidate unresolved google-news redirect ko niche rakhta hai", () => {
  const newsRedirect = scoreCandidate({
    title: "Some Result",
    url: "https://news.google.com/rss/articles/CBMiabcdefghijklmnop1234",
    via: "google-news"
  });
  const official = scoreCandidate({
    title: "Some Result notification",
    url: "https://hpsc.gov.in/results",
    via: "bing"
  });
  assert.ok(official > newsRedirect, `official (${official}) should beat news-redirect (${newsRedirect})`);
});

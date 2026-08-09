"use strict";

/**
 * Tests for the ARTICLE SELF-REPAIR AGENT + pipeline SELF-HEALING LOOP:
 *   - article_repairer: deterministic repairs (facts cleaning, FAQ drops,
 *     SEO trims, date harvest) + VERIFIED FACT SHEET + issue classification
 *   - article_pipeline: auto-repair loop (fail → feedback → rewrite,
 *     fatal issues stop early, best attempt saved)
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractFromHtml
} = require("../agents/article_agents/source_fetcher");
const {
  repairArticleDeterministically,
  buildGroundingFactSheet,
  splitReviewIssues
} = require("../agents/article_agents/article_repairer");
const { runGeneratePipeline } = require("../agents/article_agents/article_pipeline");
const { buildJobWriterPrompt } = require("../agents/article_agents/job_article_writer");
const { buildFastTrackWriterPrompt } = require("../agents/article_agents/fast_track_article_writer");

/* ------------------------------------------------------------------ */
/* Fixtures (future dates 2027 — freshness check kabhi expire na ho)  */
/* ------------------------------------------------------------------ */

const SOURCE_URL = "https://ssc.gov.in/portal/mts-notification-2027";

const SOURCE_HTML = `<!doctype html><html><head>
<title>SSC MTS 2027 Notification - Apply Online for 8000 Posts</title>
</head><body>
<article>
<h1>SSC MTS 2027 Recruitment</h1>
<p>Staff Selection Commission (SSC) has released the Multi Tasking Staff (MTS) 2027 notification.
Advt No: SSC/MTS/2027/02. Eligible candidates can apply online at ssc.gov.in.</p>
<table>
<tr><th>Event</th><th>Date</th></tr>
<tr><td>Application Start Date</td><td>01/12/2027</td></tr>
<tr><td>Last Date to Apply</td><td>31/12/2027</td></tr>
</table>
<table>
<tr><th>Category</th><th>Fee</th></tr>
<tr><td>General / OBC</td><td>Rs. 100</td></tr>
<tr><td>SC / ST / Female</td><td>Rs. 0</td></tr>
</table>
<p>Total Vacancies: 8000 posts. Qualification: Matric (10th pass). Age Limit: 18 to 25 years.
Salary: Pay Level 1 (Rs. 18000 to Rs. 56900). Selection: Computer Based Examination.</p>
</article>
<a href="https://ssc.gov.in/apply-mts-2027">Apply Online</a>
<a href="https://ssc.gov.in/pdf/mts-2027.pdf">Notification PDF</a>
</body></html>`;

function makeSource() {
  const extracted = extractFromHtml(SOURCE_HTML, SOURCE_URL);
  return { ok: true, url: SOURCE_URL, fetchedAt: "2026-08-01T10:00:00.000Z", ...extracted };
}

/** Sentences WITHOUT any numbers — word count badhane ke liye safe (no hallucination). */
const SAFE_SENTENCES = [
  "स्टाफ सिलेक्शन कमिशन की इस भर्ती का नोटिफिकेशन आधिकारिक वेबसाइट पर जारी हो चुका है और इच्छुक अभ्यर्थी आवेदन से पहले सभी शर्तें ध्यान से पढ़ लें।",
  "मल्टी टास्किंग स्टाफ के पदों पर चयनित अभ्यर्थियों को विभिन्न विभागों में तैनाती दी जा सकती है, इसलिए आवेदन करते समय अपनी प्राथमिकताएं सोच समझ कर भरें।",
  "ऑनलाइन आवेदन प्रक्रिया में नाम, जन्म तिथि और शैक्षणिक योग्यता जैसी मूलभूत जानकारी बिल्कुल सही भरना आवश्यक है क्योंकि बाद में सुधार सीमित होता है।",
  "परीक्षा की तैयारी के लिए अभ्यर्थी पिछले वर्षों के प्रश्न पत्र और आधिकारिक सिलेबस का अध्ययन करें तथा नियमित अभ्यास जारी रखें।",
  "आवेदन शुल्क का भुगतान ऑनलाइन माध्यम से किया जाता है और रसीद को भविष्य के संदर्भ के लिए सुरक्षित रखना उम्मीदवार की जिम्मेदारी है।",
  "चयन प्रक्रिया के हर चरण की सूचना आयोग की आधिकारिक वेबसाइट पर प्रकाशित की जाती है, इसलिए अभ्यर्थी नियमित रूप से वेबसाइट देखते रहें।",
  "आरक्षित श्रेणी के अभ्यर्थियों को सरकारी दिशानिर्देशों के अनुसार आयु सीमा में छूट का प्रावधान लागू होता है, विस्तृत विवरण नोटिफिकेशन में उपलब्ध है।",
  "फॉर्म जमा करने के बाद अभ्यर्थी अपना आवेदन क्रमांक अवश्य नोट कर लें ताकि बाद में स्थिति जांचने में किसी समस्या का सामना न करना पड़े।",
  "किसी भी प्रकार की अफवाह या गलत सूचना पर ध्यान न दें और केवल आधिकारिक स्रोतों से प्राप्त जानकारी पर ही भरोसा करें।",
  "सरकारी सेवा में कार्य करने का यह अवसर युवा अभ्यर्थियों के लिए एक स्थिर करियर की शुरुआत माना जाता है और प्रतिस्पर्धा भी काफी रहती है।",
  "एडमिट कार्ड परीक्षा से पहले जारी किया जाएगा और उसमें परीक्षा केंद्र, समय व दिशा निर्देश दिए जाएंगे, जिन्हें ध्यान से पढ़ना चाहिए।",
  "दस्तावेज़ सत्यापन के समय मूल प्रमाण पत्र साथ रखना अनिवार्य होता है, अतः सभी मूल दस्तावेज़ पहले से तैयार रखें।"
];

function longBody(wordTarget = 1500) {
  const overview = `
  <h1>SSC MTS 2027 Recruitment</h1>
  <h2>संक्षिप्त विवरण</h2>
  <p>स्टाफ सिलेक्शन कमिशन ने मल्टी टास्किंग स्टाफ भर्ती का नोटिफिकेशन जारी किया है। कुल 8000 पदों पर आवेदन लिए जाएंगे।</p>
  <div class="table-responsive"><table class="ai-data-table"><thead><tr><th>विवरण</th><th>जानकारी</th></tr></thead>
  <tbody><tr><td>संगठन</td><td>Staff Selection Commission (SSC)</td></tr><tr><td>कुल पद</td><td>8000</td></tr></tbody></table></div>
  <h2>महत्वपूर्ण तिथियाँ</h2>
  <p>आवेदन 01/12/2027 से शुरू होंगे और अंतिम तिथि 31/12/2027 है।</p>
  <h2>आवेदन शुल्क</h2>
  <p>General व OBC वर्ग के लिए शुल्क Rs. 100 है जबकि SC, ST व महिला अभ्यर्थियों के लिए Rs. 0 है।</p>
  <h2>पात्रता और योग्यता</h2>
  <p>अभ्यर्थी Matric (10th pass) होना चाहिए। आयु सीमा 18 से 25 वर्ष निर्धारित की गई है।</p>
  <h2>वेतन</h2>
  <p>चयनित अभ्यर्थियों को Pay Level 1 के तहत Rs. 18000 से Rs. 56900 तक वेतन मिलेगा।</p>
  <h2>चयन प्रक्रिया</h2>
  <p>चयन Computer Based Examination के माध्यम से होगा।</p>
  <h2>आवेदन कैसे करें</h2>
  <ol><li>आधिकारिक वेबसाइट खोलें</li><li>Registration करें</li><li>फॉर्म भरें व शुल्क जमा करें</li><li>प्रिंटआउट लें</li></ol>
  <h2>जरूरी दस्तावेज़</h2>
  <p>फोटो, हस्ताक्षर, शैक्षणिक प्रमाण पत्र व पहचान पत्र तैयार रखें।</p>
  <h2>Important Links</h2>
  <ul><li><a href="https://ssc.gov.in/apply-mts-2027">Apply Online</a></li>
  <li><a href="https://ssc.gov.in/pdf/mts-2027.pdf">Notification PDF</a></li></ul>
  <h2>अक्सर पूछे जाने वाले प्रश्न</h2>`;
  const sentences = [];
  let words = 0;
  let i = 0;
  while (words < wordTarget) {
    const s = SAFE_SENTENCES[i % SAFE_SENTENCES.length];
    sentences.push(s);
    words += s.split(/\s+/).length;
    i += 1;
  }
  return overview + `<p>${sentences.join(" ")}</p>`;
}

/** Short body — word-count + structure fail karne ke liye (fixable issues). */
function shortBody() {
  return `<h1>SSC MTS 2027 Recruitment</h1><h2>संक्षिप्त विवरण</h2>
  <p>स्टाफ सिलेक्शन कमिशन ने मल्टी टास्किंग स्टाफ भर्ती का नोटिफिकेशन जारी किया है।</p>`;
}

function groundedFaqs() {
  return [
    { question: "SSC MTS 2027 के लिए आवेदन कैसे करें?", answer: "आधिकारिक वेबसाइट पर जाकर ऑनलाइन आवेदन किया जा सकता है, विस्तृत चरण नोटिफिकेशन में दिए गए हैं।" },
    { question: "शैक्षणिक योग्यता क्या होनी चाहिए?", answer: "अभ्यर्थी का Matric पास होना आवश्यक है, जैसा कि आधिकारिक नोटिफिकेशन में बताया गया है।" },
    { question: "चयन किस आधार पर होगा?", answer: "चयन Computer Based Examination के माध्यम से किया जाएगा।" },
    { question: "आवेदन शुल्क कितना है?", answer: "General व OBC वर्ग के लिए Rs. 100 है जबकि SC, ST व महिला अभ्यर्थियों के लिए Rs. 0 है।" },
    { question: "अंतिम तिथि क्या है?", answer: "आवेदन की अंतिम तिथि 31/12/2027 निर्धारित की गई है।" },
    { question: "वेतन कितना मिलेगा?", answer: "Pay Level 1 के तहत Rs. 18000 से Rs. 56900 तक वेतनमान निर्धारित है।" }
  ];
}

function goodPayload(overrides = {}) {
  return {
    seoTitle: "SSC MTS 2027 Recruitment 8000 Posts - Apply Online",
    metaDescription:
      "SSC MTS 2027 भर्ती के लिए ऑनलाइन आवेदन शुरू। 8000 पदों पर भर्ती, अंतिम तिथि 31/12/2027। योग्यता, आयु सीमा, वेतन और चयन प्रक्रिया की पूरी जानकारी यहाँ पढ़ें।",
    slug: "ssc-mts-2027-recruitment",
    h1: "SSC MTS 2027 Recruitment",
    shortDescription: "Staff Selection Commission ने SSC MTS 2027 के 8000 पदों के लिए नोटिफिकेशन जारी किया है।",
    contentHtml: longBody(),
    faqs: groundedFaqs(),
    facts: {
      title: "SSC MTS 2027 Recruitment",
      organization: "Staff Selection Commission (SSC)",
      advtNo: "SSC/MTS/2027/02",
      category: "ssc",
      startDate: "01/12/2027",
      lastDate: "31/12/2027",
      vacancies: "8000",
      salary: "Pay Level 1 (Rs. 18000 to Rs. 56900)",
      qualification: "Matric (10th pass)",
      ageLimit: "18 to 25 years",
      selectionProcess: "Computer Based Examination",
      feeGen: "100",
      feeSCST: "0",
      feeFemale: "0",
      feeOBC: "100",
      applyLink: "https://ssc.gov.in/apply-mts-2027",
      notificationLink: "https://ssc.gov.in/pdf/mts-2027.pdf",
      officialSiteLink: "https://ssc.gov.in"
    },
    officialLinks: [
      { label: "Apply Online", url: "https://ssc.gov.in/apply-mts-2027" },
      { label: "Notification PDF", url: "https://ssc.gov.in/pdf/mts-2027.pdf" }
    ],
    keywords: ["ssc mts 2027", "ssc mts recruitment"],
    ...overrides
  };
}

const EMPTY_EXISTING = { titles: [], slugs: [], snippets: [] };

/* ------------------------------------------------------------------ */
/* 1. Deterministic repairs                                            */
/* ------------------------------------------------------------------ */

test("repairer: ungrounded facts clear, source-known values recover, SEO trims", () => {
  const source = makeSource();
  const article = {
    type: "JOB",
    seoTitle: "x".repeat(95),
    metaDescription: "y".repeat(220),
    facts: {
      vacancies: "99999",          // source me nahi → CLEAR
      feeGen: "100",               // grounded → untouched
      lastDate: "31/12/2027",      // grounded → untouched
      examDate: "15/01/2028",      // 15/01 source me nahi → CLEAR
      salary: "Rs. 25000 se 60000" // 25000/60000 source me nahi → CLEAR
    },
    faqs: [],
    wordCount: 2000,
    contentHtml: "<h1>t</h1>"
  };
  const repairs = repairArticleDeterministically(article, source);
  assert.equal(article.facts.vacancies, "8000", "bad value clear hone ke baad source se sahi vacancy recover hoti hai");
  assert.equal(article.facts.examDate, "");
  assert.match(article.facts.salary, /Pay Level 1.*18000.*56900/, "bad salary ke badle source salary recover hoti hai");
  assert.doesNotMatch(article.facts.salary, /25000|60000/);
  assert.equal(article.facts.feeGen, "100");
  assert.equal(article.facts.lastDate, "31/12/2027");
  assert.ok(article.seoTitle.length <= 70);
  assert.ok(article.metaDescription.length <= 170);
  assert.ok(repairs.some((r) => r.startsWith("facts:vacancies")));
  assert.ok(repairs.some((r) => r.startsWith("seo:title-trimmed")));
});

test("repairer: ungrounded FAQ drop hoti hai jab 4+ bachti hon aur word-floor na toote", () => {
  const source = makeSource();
  const badFaq = { question: "कितनी भर्ती निकली?", answer: "कुल 777777 पदों पर भर्ती निकली है।" };
  const article = {
    type: "JOB",
    seoTitle: "ok",
    metaDescription: "fine",
    facts: {},
    faqs: [...groundedFaqs(), badFaq],
    wordCount: 2200,
    contentHtml: "<h1>t</h1>"
  };
  const repairs = repairArticleDeterministically(article, source);
  assert.equal(article.faqs.length, 6, "ungrounded FAQ drop ho gayi");
  assert.ok(!article.faqs.some((f) => f.answer.includes("777777")));
  assert.ok(repairs.some((r) => r.startsWith("faqs:dropped-ungrounded")));
});

test("repairer: FAQs 4 se kam na bachein to drop NAHI hoti", () => {
  const source = makeSource();
  const badFaq = { question: "कितनी भर्ती?", answer: "कुल 777777 पद।" };
  const article = {
    type: "JOB",
    seoTitle: "ok",
    metaDescription: "fine",
    facts: {},
    faqs: [groundedFaqs()[0], groundedFaqs()[1], groundedFaqs()[2], badFaq],
    wordCount: 2200,
    contentHtml: "<h1>t</h1>"
  };
  repairArticleDeterministically(article, source);
  assert.equal(article.faqs.length, 4, "4 FAQs barkarar — reviewer minimum se kam nahi kar sakte");
});

test("repairer: applyMode me admin-bhari facts clear NAHI hoti", () => {
  const source = makeSource();
  const article = {
    type: "JOB",
    seoTitle: "x".repeat(95),
    metaDescription: "ok",
    facts: { vacancies: "12345" }, // admin ne khud bhara — source me nahi hai
    faqs: [],
    wordCount: 2000,
    contentHtml: "<h1>t</h1>"
  };
  repairArticleDeterministically(article, source, { applyMode: true });
  assert.equal(article.facts.vacancies, "12345", "apply-mode admin facts respect karta hai");
  assert.ok(article.seoTitle.length <= 70, "SEO trim apply-mode me bhi hota hai");
});

/* ------------------------------------------------------------------ */
/* 2. Verified fact sheet + issue classification                       */
/* ------------------------------------------------------------------ */

test("fact sheet: source ke numbers/dates allowlist me aate hain + prompt block banta hai", () => {
  const sheet = buildGroundingFactSheet(makeSource());
  assert.ok(sheet.numbers.includes("8000"));
  assert.ok(sheet.numbers.includes("100"));
  assert.ok(sheet.dates.some((d) => d.includes("31/12/2027")));
  assert.match(sheet.promptBlock, /VERIFIED FACT SHEET/);
  assert.match(sheet.promptBlock, /hallucination = automatic FAIL/);
});

test("splitReviewIssues: duplicate/expired/speculative FATAL, baaki fixable", () => {
  const { fatal, fixable } = splitReviewIssues([
    "duplicate:title:\"XYZ\"",
    "freshness:expired:\"01/01/2020\" — purani",
    "speculative:no-declared-date — kuch bhi",
    "word-count-low:1200 (<1600)",
    "hallucination:money:\"₹999\"",
    "structure:too-few-faqs:2"
  ]);
  assert.equal(fatal.length, 3);
  assert.equal(fixable.length, 3);
});

/* ------------------------------------------------------------------ */
/* 3. Writer prompts carry the strict allowlist                        */
/* ------------------------------------------------------------------ */

test("job + fast-track writer prompts me VERIFIED FACT SHEET allowlist hoti hai", () => {
  const source = makeSource();
  const jobPrompt = buildJobWriterPrompt({ source, instructions: "" });
  assert.match(jobPrompt, /VERIFIED FACT SHEET/);
  assert.match(jobPrompt, /8000/); // source number allowlist me
  assert.match(jobPrompt, /FINAL SELF-CHECK/);
  assert.match(jobPrompt, /ABSOLUTE MINIMUM 1600/);

  const ftPrompt = buildFastTrackWriterPrompt({ source, instructions: "" });
  assert.match(ftPrompt, /VERIFIED FACT SHEET/);
  assert.match(ftPrompt, /FINAL SELF-CHECK/);
});

/* ------------------------------------------------------------------ */
/* 4. Pipeline SELF-HEALING LOOP                                       */
/* ------------------------------------------------------------------ */

test("pipeline: pehla attempt FAIL → feedback ke saath doosra attempt PASS (self-healing)", async () => {
  const source = makeSource();
  const calls = [];
  const stub = async (prompt) => {
    calls.push(prompt);
    if (calls.length === 1) return JSON.parse(JSON.stringify(goodPayload({ contentHtml: shortBody() })));
    return JSON.parse(JSON.stringify(goodPayload()));
  };
  const draft = await runGeneratePipeline(
    { type: "job", sourceUrl: SOURCE_URL, instructions: "", mode: "auto", source, existing: EMPTY_EXISTING },
    { writerDeps: { generateJson: stub }, maxRepairAttempts: 3 }
  );
  assert.equal(calls.length, 2, "exactly do attempts — pehla fail, doosra pass");
  assert.equal(draft.reviewStatus, "passed");
  assert.equal(draft.publishBlocked, false);
  assert.equal(draft.repairAttempts, 2);
  assert.equal(draft.repairPassedOnAttempt, 2);
  assert.match(calls[1], /PICHLE REVIEW KI FEEDBACK/, "doosre attempt me pichli failings ka feedback gaya");
  assert.match(calls[1], /word-count-low/);
});

test("pipeline: pehla hi attempt PASS ho to doosra attempt NAHI hota (no wasted calls)", async () => {
  const source = makeSource();
  let calls = 0;
  const stub = async () => {
    calls += 1;
    return JSON.parse(JSON.stringify(goodPayload()));
  };
  const draft = await runGeneratePipeline(
    { type: "job", sourceUrl: SOURCE_URL, instructions: "", mode: "manual", source, existing: EMPTY_EXISTING },
    { writerDeps: { generateJson: stub }, maxRepairAttempts: 3 }
  );
  assert.equal(calls, 1);
  assert.equal(draft.reviewStatus, "passed");
  assert.equal(draft.repairAttempts, 1);
  assert.equal(draft.repairPassedOnAttempt, 1);
});

test("pipeline: FATAL duplicate issue par retry NAHI (writer ek hi baar chala)", async () => {
  const source = makeSource();
  let calls = 0;
  const stub = async () => {
    calls += 1;
    return JSON.parse(JSON.stringify(goodPayload()));
  };
  const draft = await runGeneratePipeline(
    {
      type: "job",
      sourceUrl: SOURCE_URL,
      instructions: "",
      mode: "manual",
      source,
      existing: { titles: ["SSC MTS 2027 Recruitment"], slugs: [], snippets: [] }
    },
    { writerDeps: { generateJson: stub }, maxRepairAttempts: 3 }
  );
  assert.equal(calls, 1, "duplicate fatal hai — retry bekaar, turant roka");
  assert.equal(draft.reviewStatus, "failed");
  assert.equal(draft.repairPassedOnAttempt, null);
  assert.ok(draft.reviewReport.issues.some((i) => i.startsWith("duplicate:")));
});

test("pipeline: sab attempts fail hon to BEST-score attempt save hota hai", async () => {
  const source = makeSource();
  const stub = async () =>
    JSON.parse(
      JSON.stringify(
        goodPayload({
          contentHtml: shortBody() + "<p>भर्ती 99999 posts की है।</p>" // hallucination + short → fail
        })
      )
    );
  const draft = await runGeneratePipeline(
    { type: "job", sourceUrl: SOURCE_URL, instructions: "", mode: "auto", source, existing: EMPTY_EXISTING },
    { writerDeps: { generateJson: stub }, maxRepairAttempts: 2 }
  );
  assert.equal(draft.reviewStatus, "failed");
  assert.equal(draft.publishBlocked, true);
  assert.equal(draft.repairAttempts, 2, "dono attempts liye gaye");
  assert.equal(draft.repairPassedOnAttempt, null);
  assert.ok(draft.reviewReport.issues.length, "best attempt ke issues draft me record hain");
});

test("pipeline: retry-attempt me writer crash ho to best-so-far draft bach jaata hai", async () => {
  const source = makeSource();
  let calls = 0;
  const stub = async () => {
    calls += 1;
    if (calls === 1) return JSON.parse(JSON.stringify(goodPayload({ contentHtml: shortBody() }))); // fail
    const e = new Error("Gemini call failed — [429] Resource exhausted");
    e.code = "AI_RATE_LIMITED";
    throw e;
  };
  const draft = await runGeneratePipeline(
    { type: "job", sourceUrl: SOURCE_URL, instructions: "", mode: "manual", source, existing: EMPTY_EXISTING },
    { writerDeps: { generateJson: stub }, maxRepairAttempts: 3 }
  );
  assert.equal(calls, 2, "doosra attempt crash hua, teesra try nahi");
  assert.equal(draft.reviewStatus, "failed", "best-so-far (attempt 1) draft save hua — toota nahi");
  assert.equal(draft.repairBestAttempt, 1);
  assert.ok(draft.articleHtml, "draft content barkarar");
});

test("pipeline: deterministic repairs draft record me repairLog ke roop me aate hain", async () => {
  const source = makeSource();
  const stub = async () => {
    const payload = goodPayload();
    payload.facts.vacancies = "555555"; // ungrounded → repairer clear karega
    return JSON.parse(JSON.stringify(payload));
  };
  const draft = await runGeneratePipeline(
    { type: "job", sourceUrl: SOURCE_URL, instructions: "", mode: "manual", source, existing: EMPTY_EXISTING },
    { writerDeps: { generateJson: stub }, maxRepairAttempts: 3 }
  );
  assert.ok(Array.isArray(draft.repairLog));
  assert.ok(
    draft.repairLog.some((r) => r.startsWith("facts:vacancies:cleared-ungrounded")),
    "ungrounded vacancy fact clear hua aur log me gaya"
  );
  assert.equal(draft.facts.vacancies, "8000", "draft me source wala sahi fact gaya, galat nahi");
  assert.ok(
    draft.repairLog.some((r) => r === "facts:vacancies:source-harvested"),
    "clear hone ke baad source-only harvester ne sahi value recover ki"
  );
});

/* ------------------------------------------------------------------ */
/* 5. FAST TRACK — self-healing loop FT ke liye bhi utna hi pakka     */
/* ------------------------------------------------------------------ */

const FT_SOURCE_URL = "https://ssc.gov.in/portal/mts-result-2028";

const FT_SOURCE_HTML = `<!doctype html><html><head>
<title>SSC MTS 2027 Result Declared - Check Now</title>
</head><body>
<article>
<h1>SSC MTS 2027 Result</h1>
<p>Staff Selection Commission (SSC) has declared the Multi Tasking Staff (MTS) 2027 examination result.
A total of 25000 candidates appeared in the examination. Result was declared on 15/03/2028.</p>
<p>Candidates can check their result using roll number and date of birth on ssc.gov.in.
Cut-off marks and category wise merit list are available on the official website.</p>
</article>
<a href="https://ssc.gov.in/result-mts-2028">Check Result</a>
<a href="https://ssc.gov.in/pdf/mts-2028-cutoff.pdf">Cut-off PDF</a>
</body></html>`;

function makeFtSource() {
  const extracted = extractFromHtml(FT_SOURCE_HTML, FT_SOURCE_URL);
  return { ok: true, url: FT_SOURCE_URL, fetchedAt: "2026-08-01T10:00:00.000Z", ...extracted };
}

function ftBody(wordTarget = 1150) {
  const overview = `
  <h1>SSC MTS 2027 Result Declared</h1>
  <h2>अपडेट एक नज़र में</h2>
  <p>स्टाफ सिलेक्शन कमिशन ने मल्टी टास्किंग स्टाफ परीक्षा का परिणाम घोषित कर दिया है। कुल 25000 अभ्यर्थी परीक्षा में शामिल हुए थे।</p>
  <div class="table-responsive"><table class="ai-data-table"><thead><tr><th>विवरण</th><th>जानकारी</th></tr></thead>
  <tbody><tr><td>संगठन</td><td>Staff Selection Commission (SSC)</td></tr><tr><td>परिणाम तिथि</td><td>15/03/2028</td></tr></tbody></table></div>
  <h2>महत्वपूर्ण तिथियाँ</h2>
  <p>परिणाम 15/03/2028 को घोषित किया गया है।</p>
  <h2>Result कैसे चेक करें</h2>
  <ol><li>आधिकारिक वेबसाइट खोलें</li><li>Result लिंक पर क्लिक करें</li><li>Roll number व जन्म तिथि भरें</li><li>परिणाम डाउनलोड करें</li></ol>
  <h2>क्या-क्या details मिलेंगी</h2>
  <p>Roll number, प्राप्तांक, cut-off marks और category wise merit list की जानकारी आधिकारिक वेबसाइट पर उपलब्ध है।</p>
  <h2>आगे की प्रक्रिया</h2>
  <p>चयनित अभ्यर्थियों को document verification व अन्य चरणों की सूचना आयोग द्वारा दी जाएगी।</p>
  <h2>Important Links</h2>
  <ul><li><a href="https://ssc.gov.in/result-mts-2028">Check Result</a></li>
  <li><a href="https://ssc.gov.in/pdf/mts-2028-cutoff.pdf">Cut-off PDF</a></li></ul>
  <h2>अक्सर पूछे जाने वाले प्रश्न</h2>`;
  const sentences = [];
  let words = 0;
  let i = 0;
  while (words < wordTarget) {
    const s = SAFE_SENTENCES[i % SAFE_SENTENCES.length];
    sentences.push(s);
    words += s.split(/\s+/).length;
    i += 1;
  }
  return overview + `<p>${sentences.join(" ")}</p>`;
}

function ftGoodPayload(overrides = {}) {
  return {
    seoTitle: "SSC MTS 2027 Result Declared - Check Now",
    metaDescription:
      "SSC MTS 2027 का परिणाम घोषित हो गया है। कुल 25000 अभ्यर्थी शामिल हुए। Roll number से परिणाम चेक करने का तरीका, cut-off व merit list की पूरी जानकारी यहाँ पढ़ें।",
    slug: "ssc-mts-2027-result",
    h1: "SSC MTS 2027 Result Declared",
    shortDescription: "Staff Selection Commission ने SSC MTS 2027 परीक्षा का परिणाम घोषित किया।",
    contentHtml: ftBody(),
    faqs: [
      { question: "SSC MTS 2027 का परिणाम कैसे चेक करें?", answer: "आधिकारिक वेबसाइट पर roll number व जन्म तिथि से परिणाम चेक किया जा सकता है।" },
      { question: "परिणाम कब घोषित हुआ?", answer: "परिणाम 15/03/2028 को घोषित किया गया है।" },
      { question: "कितने अभ्यर्थी परीक्षा में शामिल हुए?", answer: "कुल 25000 अभ्यर्थी परीक्षा में शामिल हुए थे।" },
      { question: "Cut-off marks कहाँ मिलेंगे?", answer: "Cut-off marks व category wise merit list आधिकारिक वेबसाइट पर उपलब्ध हैं।" },
      { question: "चयन के बाद क्या प्रक्रिया है?", answer: "चयनित अभ्यर्थियों को document verification सहित आगे के चरणों की सूचना आयोग देगा।" }
    ],
    facts: {
      title: "SSC MTS 2027 Result Declared",
      category: "Result",
      org: "Staff Selection Commission (SSC)",
      updateDate: "15/03/2028",
      directLink: "https://ssc.gov.in/result-mts-2028",
      totalCandidates: "25000",
      details: "Result declared on official website using roll number"
    },
    officialLinks: [
      { label: "Check Result", url: "https://ssc.gov.in/result-mts-2028" },
      { label: "Cut-off PDF", url: "https://ssc.gov.in/pdf/mts-2028-cutoff.pdf" }
    ],
    keywords: ["ssc mts result", "ssc mts 2027 result"],
    ...overrides
  };
}

test("pipeline (FAST TRACK): self-healing loop FT articles ke liye bhi kaam karta hai", async () => {
  const source = makeFtSource();
  const calls = [];
  const stub = async (prompt) => {
    calls.push(prompt);
    if (calls.length === 1) {
      // pehla attempt: chhoti body → word-count-low (fixable)
      return JSON.parse(JSON.stringify(ftGoodPayload({ contentHtml: "<h1>SSC MTS 2027 Result Declared</h1><h2>अपडेट एक नज़र में</h2><p>परिणाम घोषित।</p>" })));
    }
    return JSON.parse(JSON.stringify(ftGoodPayload()));
  };
  const draft = await runGeneratePipeline(
    { type: "fast-track", sourceUrl: FT_SOURCE_URL, instructions: "", mode: "auto", source, existing: EMPTY_EXISTING },
    { writerDeps: { generateJson: stub }, maxRepairAttempts: 3 }
  );
  assert.equal(calls.length, 2, "FT ke liye bhi fail → feedback → rewrite chala");
  assert.equal(draft.type, "FAST_TRACK");
  assert.equal(draft.reviewStatus, "passed");
  assert.equal(draft.repairPassedOnAttempt, 2);
  assert.equal(draft.publishBlocked, false);
  assert.match(calls[1], /PICHLE REVIEW KI FEEDBACK/);
});

test("pipeline (FAST TRACK): FT prompt me bhi VERIFIED FACT SHEET allowlist hoti hai", () => {
  const sheet = buildGroundingFactSheet(makeFtSource());
  assert.ok(sheet.numbers.includes("25000"));
  assert.ok(sheet.dates.some((d) => d.includes("15/03/2028")));
});

/* ------------------------------------------------------------------ */
/* 6. Issue-specific FIX guidance (self-heal quality)                  */
/* ------------------------------------------------------------------ */

const { formatReviewFeedbackPrompt } = require("../agents/article_agents/fact_quality_reviewer");

test("feedback: har issue ke saath concrete FIX guidance jata hai", () => {
  const prompt = formatReviewFeedbackPrompt([
    "word-count-low:1350 (<1600)",
    "structure:too-few-faqs:2",
    "hallucination:money:\"₹1,40,000\"",
    "dates:box-missing — article me dates hain par facts me nahi"
  ]);
  assert.match(prompt, /PICHLE REVIEW KI FEEDBACK/);
  assert.match(prompt, /FIX: Article sirf 1350 words/);   // exact count guidance me
  assert.match(prompt, /EXACTLY 6 FAQs/);
  assert.match(prompt, /VERIFIED FACT SHEET me maujood/);
  assert.match(prompt, /facts\.startDate\/lastDate\/examDate/);
});

test("feedback: bina issues ke koi block nahi (pehla attempt clean)", () => {
  assert.equal(formatReviewFeedbackPrompt([]), "");
  assert.equal(formatReviewFeedbackPrompt(undefined), "");
});

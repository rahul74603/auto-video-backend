const functions = require("firebase-functions");
// onDocumentCreated (Blaze/v2 only) replaced with noop for Spark
const onDocumentCreated = () => () => {};
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const cheerio = require("cheerio");
const Parser = require('rss-parser');
const { GoogleGenerativeAI } = require("@google/generative-ai");

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
    return SKIP_KEYWORDS.some(kw => lower.includes(kw));
}

// =========================================================
// 🚫 BLOCKED DOMAINS
// Sirf applyLink, notificationLink, officialSiteLink
// mein ye domains nahi aane chahiye
// RSS fetch aur scraping pe koi asar nahi
// =========================================================
const BLOCKED_DOMAINS = [
    'freejobalert.com',
    'sarkariresult.com',
    'rojgarresult.com',
    'naukri.com',
    'shine.com',
    'monster.com'
];

function isBlockedLink(url) {
    if (!url || url === '#' || url.trim() === '') return false;
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return BLOCKED_DOMAINS.some(domain => hostname.includes(domain));
    } catch {
        return false;
    }
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
19. applyLink: Official apply URL only, default "${jobLink}"
20. officialSiteLink: Official website URL
21. isExpired: Compare lastDate with today (${todayDate}), true if expired
22. category: ssc/banking/railway/upsc/defense/teaching/state/engineering/other

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
  "applyLink": "${jobLink}",
  "officialSiteLink": "",
  "description": "3-4 line Hinglish summary",
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

// =========================================================
// ✍️ FULL ARTICLE GENERATOR (scraper ke saath hi — alag step nahi)
// Draft me hi poora SEO article (articleHtml) bhar deta hai taaki admin
// ko Review Draft me sab READYMADE mile — bas check karke publish.
// =========================================================
async function generateFullJobArticle(jobData, scrapedContent) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

    const prompt = `Act as StudyGyaan's senior editorial writer for Indian government-job aspirants.
Write a COMPLETE, ORIGINAL, source-grounded job article in easy Hinglish (Hindi-English mix, Devanagari for Hindi words).

=== VERIFIED FACTS (in JSON — inhi facts ko use karo) ===
${facts}

=== OFFICIAL SOURCE TEXT (ground truth) ===
${String(scrapedContent).slice(0, 15000)}

=== STRICT RULES ===
1. Facts (dates/fees/vacancies/qualification/links) SIRF upar se lo. Koi fact INVENT mat karo.
2. Agar koi fact missing hai to us section me likho: "अधिक जानकारी के लिए आधिकारिक नोटिफिकेशन देखें।" — guess kabhi nahi.
3. Source ke sentences WORD-BY-WORD copy MAT karo — apni original editorial wording likho (facts same rahenge).
4. Koi keyword stuffing nahi, koi filler repetition nahi, koi generic AI padding nahi. Har paragraph useful ho.
5. Sirf OFFICIAL links use karo (jo facts me diye hain). Koi third-party job portal nahi.

=== OUTPUT FORMAT ===
- Return ONLY clean HTML (no markdown, no \`\`\`, no <html>/<head>/<body> tags).
- NO <h1> (page title already H1 hai). Structure:
  1. 2-3 intro <p> (kya bharti hai, kaun apply kar sakta hai, deadline)
  2. <h2>संक्षिप्त जानकारी (Overview)</h2> + <table> (Organization | Post | Advt No | Vacancies | Mode | Last Date | Official Website)
  3. <h2>महत्वपूर्ण तिथियाँ (Important Dates)</h2> + <table> (sirf available dates)
  4. <h2>पद एवं रिक्तियों का विवरण (Vacancy Details)</h2>
  5. <h2>शैक्षणिक योग्यता (Educational Qualification)</h2>
  6. <h2>आयु सीमा (Age Limit)</h2>
  7. <h2>वेतन (Salary / Pay Scale)</h2>
  8. <h2>आवेदन शुल्क (Application Fee)</h2> + <table> (sirf available categories)
  9. <h2>चयन प्रक्रिया (Selection Process)</h2>
  10. <h2>आवेदन कैसे करें (How to Apply)</h2> + <ol> numbered steps
  11. <h2>महत्वपूर्ण निर्देश (Important Instructions)</h2> + <ul>
  12. <h2>महत्वपूर्ण लिंक (Important Links)</h2> + <table> (Apply Online / Notification PDF / Official Website — sirf diye hue official links, <a href> ke saath)
  13. <h2>अक्सर पूछे जाने वाले प्रश्न (FAQs)</h2> + 5-7 <h3>Question</h3><p>Answer</p> pairs (source-grounded answers)
  14. Chhota useful conclusion <p> (official notification check karke deadline se pehle apply karne ki salah)
- Target: 1500-2200 meaningful words. Agar source me kam jankari hai to chhota likho — filler add MAT karo.`;

    const result = await model.generateContent(prompt);
    let html = result.response.text()
        .replace(/```html/gi, '')
        .replace(/```/g, '')
        .trim();
    // Safety: h1 aa gaya ho to h2 bana do (page pe single H1 rahe)
    html = html.replace(/<h1(\s[^>]*)?>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>');
    return html;
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

    return `TABLES:\n${tableContent}\n\nCONTENT:\n${mainBody}`.substring(0, 15000);
}

// =========================================================
// 🔥 CORE SCRAPING LOGIC
// =========================================================
async function scrapeGovtJobsLogic(maxJobs = 5) {
    console.log("🚀 Govt Jobs Scraper Started...");

    const rssUrl = 'https://www.indgovtjobs.in/feeds/posts/default?alt=rss';
    const feed   = await parser.parseURL(rssUrl);
    const items  = feed.items.slice(0, 50);

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

    for (const item of items) {
        if (savedCount >= maxJobs) break;

        const titleText = (item.title || '').trim();

        if (shouldSkipTitle(titleText)) {
            console.log(`⏭️ Skipped: ${titleText}`);
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
            console.log(`📡 Scraping: ${jobLink}`);
            await sleep(8000); // 🕊️ polite delay — source site 429 na de
            const scrapedContent = await scrapeJobPage(jobLink);

            console.log(`🤖 AI Processing: ${titleText}`);
            const jobData = await extractJobDataWithAI(scrapedContent, jobLink);

            const finalTitle = jobData.title || titleText;

            if (jobData.isExpired === true) {
                console.log(`⏭️ Expired: ${finalTitle}`);
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

            // =========================================================
            // ✅ SIRF LINKS CLEAN KARO - RSS fetch pe koi asar nahi
            // applyLink blocked → original jobLink use karo
            // notificationLink blocked → empty string
            // officialSiteLink blocked → empty string
            // =========================================================
            const cleanApplyLink = isBlockedLink(jobData.applyLink)
                ? jobLink
                : (jobData.applyLink || jobLink);

            const cleanNotificationLink = isBlockedLink(jobData.notificationLink)
                ? ''
                : (jobData.notificationLink || '');

            const cleanOfficialSiteLink = isBlockedLink(jobData.officialSiteLink)
                ? ''
                : (jobData.officialSiteLink || '');

            console.log(`🔗 applyLink: ${cleanApplyLink}`);

            // ✍️ FULL ARTICLE — scraper ke saath hi ready (admin ko bas review karna hai)
            let articleHtml = '';
            try {
                articleHtml = await generateFullJobArticle(jobData, scrapedContent);
                const words = articleHtml.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
                console.log(`📝 Full article generated: ${words} words`);
            } catch (artErr) {
                console.warn(`⚠️ Full article generation fail (draft phir bhi banega): ${artErr.message}`);
            }

            const draftPayload = {
                title:            finalTitle,
                slug:             finalSlug,
                type:             "JOB",
                status:           "pending",
                metaDescription:  jobData.metaDescription  || '',
                description:      jobData.description      || '',
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
                internalLinks:    internalLinks,
                createdAt:        admin.firestore.FieldValue.serverTimestamp()
            };

            const cleanPayload = Object.fromEntries(
                Object.entries(draftPayload).filter(([, v]) => v !== undefined)
            );

            await db.collection("job_drafts").doc(finalSlug).set(cleanPayload);
            await db.collection("processed_links").doc(docId).set({
                link:        jobLink,
                slug:        finalSlug,
                title:       finalTitle,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            savedCount++;
            console.log(`✅ Saved (${savedCount}/${maxJobs}): ${finalTitle}`);
            await sleep(2000);

        } catch (err) {
            console.error(`❌ Failed: ${jobLink} | ${err.message}`);
        }
    }

    console.log(`🎯 Complete: ${savedCount} jobs saved`);
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
exports.onJobPublishedNotify = onDocumentCreated({
    document:       "jobs/{jobId}",
    timeoutSeconds: 120,
    memory:         "512MB",
    secrets: [
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        "GH_TOKEN",
        "GITHUB_OWNER",
        "GITHUB_REPO",
        "SERVICE_ACCOUNT_JSON"
    ]
}, async (event) => {

    const snap = event.data;
    if (!snap) return null;

    const job   = snap.data();
    const jobId = event.params.jobId;

    if (job.type && job.type !== 'JOB') {
        console.log(`⏭️ Skipping non-JOB type: ${job.type}`);
        return null;
    }

    const jobUrl = `https://studygyaan.in/job/${job.slug || jobId}`;
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 New Job: ${job.title}`);
    console.log(`🔗 URL: ${jobUrl}`);
    console.log(`${'='.repeat(50)}\n`);

    // ─────────────────────────────────────
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


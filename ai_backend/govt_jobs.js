require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore"); // ✅ Written → Created
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const cheerio = require("cheerio");
const Parser = require('rss-parser');

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
const db = admin.firestore();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

// ✅ Skip keywords - comprehensive list
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
            { headers: { Authorization: `Bearer ${jwtClient.credentials.access_token}` } }
        );
        console.log("🚀 Google Indexing:", url);
    } catch (err) {
        console.error("❌ Indexing Error:", err.message);
    }
}

// =========================================================
// 🤖 AI JOB DATA EXTRACTOR
// =========================================================
async function extractJobDataWithAI(scrapedContent, jobLink) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        generationConfig: { responseMimeType: "application/json" }
    });

    const todayDate = new Date().toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const prompt = `Act as a Precise Job Data Specialist. Extract details ONLY from the scraped data.
Follow these mapping rules to fill EVERY field:

1. title: "Job Title", "Post Name", "Name of Post", "पद का नाम"
2. startDate: "Start Date", "Application Start Date", "Opening Date", "प्रारंभ तिथि"
3. lastDate: "Last Date", "Closing Date", "अंतिम तिथि", "आवेदन की अंतिम तिथि"
4. vacancies: "Vacancies", "Total Posts", "कुल पद" - extract numbers
5. organization: "Organization", "Department", "Board", "संस्था", "विभाग"
6. salary: "Salary", "Pay Scale", "Pay Matrix", "वेतन"
7. minAge/ageLimit: "Age Limit", "आयु सीमा"
8. advtNo: "Advt. No.", "Advertisement No", "विज्ञापन संख्या"
9. qualification: "Qualification", "Educational Qualification", "योग्यता"
10. location: "Job Location", "State", "Place of Posting", "स्थान"
11. selectionProcess: "Selection Process", "चयन प्रक्रिया"
12. eligibility: "Physical Standards", "PST", "PET", "शारीरिक योग्यता"
13. feeGen: General/UR fee amount
14. feeSCST: SC/ST/PH fee amount
15. feeFemale: Female fee amount
16. feeOBC: OBC/EWS fee amount
17. applicationFee: Payment mode description
18. notificationLink: URL from brackets like (URL: https://...)
19. applyLink: Apply URL from brackets, default "${jobLink}"
20. officialSiteLink: Official website URL
21. isExpired: Compare lastDate with today (${todayDate}), return true if expired
22. category: Identify from: ssc, banking, railway, upsc, defense, teaching, state, engineering, other

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
// 🌐 WEB SCRAPER
// =========================================================
async function scrapeJobPage(url) {
    const { data: html } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml'
        },
        timeout: 25000
    });

    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, .sidebar, #sidebar').remove();

    // Links को text में convert करो ताकि AI पढ़ सके
    $("table a, .post-body a, article a").each((i, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr("href");
        if (href && href.startsWith("http")) {
            $(el).replaceWith(`${text} (URL: ${href})`);
        }
    });

    // Tables extract करो
    let tableContent = "";
    $('table').each((i, el) => {
        tableContent += "\n--- TABLE ---\n";
        tableContent += $(el).text().replace(/\s\s+/g, ' ').trim();
        tableContent += "\n";
    });

    // Main body
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
    const feed = await parser.parseURL(rssUrl);
    const items = feed.items.slice(0, 50); // ✅ 50 scan करो, 5 save करो

    // ✅ Date suffix for unique slugs
    const now = new Date();
    const dateSuffix = now.toLocaleString('en-IN', {
        month: 'short',
        year: 'numeric'
    }).toLowerCase().replace(' ', '-');

    // ✅ Internal links for SEO
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
                slug: data.slug || b.id
            });
        });
    } catch (e) {
        console.warn("Internal links fetch failed:", e.message);
    }

    let savedCount = 0;

    for (const item of items) {
        if (savedCount >= maxJobs) break;

        const titleText = (item.title || '').trim();

        // ✅ Skip non-job content
        if (shouldSkipTitle(titleText)) {
            console.log(`⏭️ Skipped: ${titleText}`);
            continue;
        }

        const jobLink = (item.link || item.guid || '').trim();
        if (!jobLink || jobLink.includes('127.0.0.1')) continue;

        // ✅ Duplicate check
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
            const scrapedContent = await scrapeJobPage(jobLink);

            console.log(`🤖 AI Processing: ${titleText}`);
            const jobData = await extractJobDataWithAI(scrapedContent, jobLink);

            const finalTitle = jobData.title || titleText;

            // ✅ Skip expired jobs
            if (jobData.isExpired === true) {
                console.log(`⏭️ Expired job skipped: ${finalTitle}`);
                await db.collection("processed_links").doc(docId).set({
                    link: jobLink,
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    note: "Expired"
                });
                continue;
            }

            if (!finalTitle || finalTitle.length < 5) {
                console.log(`⏭️ No valid title found`);
                continue;
            }

            // ✅ Unique slug with date
            const baseSlug = jobData.slug || createSlug(finalTitle);
            const finalSlug = `${baseSlug}-${dateSuffix}`;

            // ✅ Check slug duplicate
            const slugExists = await db.collection("job_drafts").doc(finalSlug).get();
            if (slugExists.exists) {
                console.log(`⏭️ Slug already exists: ${finalSlug}`);
                continue;
            }

            // ✅ FIXED: No duplicate description key!
            const draftPayload = {
                title: finalTitle,
                slug: finalSlug,
                type: "JOB",
                status: "pending",
                // ✅ metaDescription अलग field में
                metaDescription: jobData.metaDescription || '',
                // ✅ description एक ही बार
                description: jobData.description || '',
                category: jobData.category || 'other',
                organization: jobData.organization || '',
                advtNo: jobData.advtNo || '',
                startDate: jobData.startDate || '',
                lastDate: jobData.lastDate || '',
                vacancies: jobData.vacancies || '',
                salary: jobData.salary || '',
                qualification: jobData.qualification || '',
                minAge: jobData.minAge || '',
                ageLimit: jobData.ageLimit || '',
                location: jobData.location || '',
                selectionProcess: jobData.selectionProcess || '',
                eligibility: jobData.eligibility || '',
                feeGen: jobData.feeGen || '',
                feeSCST: jobData.feeSCST || '',
                feeFemale: jobData.feeFemale || '',
                feeOBC: jobData.feeOBC || '',
                applicationFee: jobData.applicationFee || '',
                notificationLink: jobData.notificationLink || '',
                applyLink: jobData.applyLink || jobLink,
                officialSiteLink: jobData.officialSiteLink || '',
                originalLink: jobLink,
                internalLinks: internalLinks,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // undefined values remove करो
            const cleanPayload = Object.fromEntries(
                Object.entries(draftPayload).filter(([, v]) => v !== undefined)
            );

            await db.collection("job_drafts").doc(finalSlug).set(cleanPayload);
            await db.collection("processed_links").doc(docId).set({
                link: jobLink,
                slug: finalSlug,
                title: finalTitle,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            savedCount++;
            console.log(`✅ Saved (${savedCount}/${maxJobs}): ${finalTitle}`);

            // ✅ Rate limiting - API को overwhelm न करो
            await sleep(2000);

        } catch (err) {
            console.error(`❌ Failed: ${jobLink} | ${err.message}`);
            // Continue with next item
        }
    }

    console.log(`🎯 Scraping Complete: ${savedCount} jobs saved`);
    return savedCount;
}

// =========================================================
// 1️⃣ HTTP TRIGGER - Scraper API
// =========================================================
exports.fetchLatestGovtJobs = onRequest({
    cors: false, // ✅ CORS disabled - Server-only endpoint
    timeoutSeconds: 300,
    memory: "1GiB",
    secrets: ["SERVICE_ACCOUNT_JSON", "GEMINI_API_KEY"]
}, async (req, res) => {

    // ✅ Method check
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).send("Method Not Allowed");
    }

    // ✅ Authorization Header से check करो (URL में नहीं!)
    const authHeader = req.headers['x-scraper-key'];
    const SCRAPER_KEY = process.env.SCRAPER_SECRET_KEY || "StudyGyaan_786_Secure";

    if (authHeader !== SCRAPER_KEY) {
        console.warn("❌ Unauthorized scraper access attempt");
        return res.status(401).json({ error: "Unauthorized" });
    }

    // ✅ Rate limiting - Last run check
    try {
        const lastRunDoc = await db.collection("system_configs").doc("scraper_status").get();
        if (lastRunDoc.exists) {
            const lastRun = lastRunDoc.data().lastRun?.toDate();
            if (lastRun) {
                const minutesSinceLastRun = (Date.now() - lastRun.getTime()) / 60000;
                if (minutesSinceLastRun < 30) {
                    return res.json({
                        success: false,
                        message: `Rate limited. Last run ${Math.round(minutesSinceLastRun)} mins ago. Wait ${Math.round(30 - minutesSinceLastRun)} more mins.`
                    });
                }
            }
        }

        // Update last run time
        await db.collection("system_configs").doc("scraper_status").set({
            lastRun: admin.firestore.FieldValue.serverTimestamp(),
            status: "running"
        });

    } catch (e) {
        console.warn("Rate limit check failed:", e.message);
    }

    try {
        const count = await scrapeGovtJobsLogic(5);

        await db.collection("system_configs").doc("scraper_status").set({
            lastRun: admin.firestore.FieldValue.serverTimestamp(),
            status: "completed",
            lastCount: count
        }, { merge: true });

        res.json({
            success: true,
            message: `${count} new jobs saved to drafts!`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("❌ Scraper Error:", error.message);

        await db.collection("system_configs").doc("scraper_status").set({
            status: "error",
            lastError: error.message
        }, { merge: true }).catch(() => {});

        res.status(500).json({ success: false, error: error.message });
    }
});

// =========================================================
// 2️⃣ FIRESTORE TRIGGER - Job Published होने पर
// =========================================================
exports.onJobPublishedNotify = onDocumentCreated({
    // ✅ Written → Created (सिर्फ नई job पर trigger, edit पर नहीं!)
    document: "jobs/{jobId}",
    secrets: [
        "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
        "GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON",
        "GMAIL_CREDENTIALS", "YOUTUBE_TOKEN", "TTS_KEY_JSON"
    ],
    timeoutSeconds: 540,
    memory: "2GiB",
    cpu: 1
}, async (event) => {
    const snap = event.data;
    if (!snap) return null;

    const job = snap.data();
    const jobId = event.params.jobId;

    // ✅ Only JOB type, not AFFILIATE/COURSE
    if (job.type !== 'JOB' && job.type !== undefined) {
        console.log(`⏭️ Skipping non-JOB type: ${job.type}`);
        return null;
    }

    const jobUrl = `https://studygyaan.in/job/${job.slug || jobId}`;
    console.log(`🚀 New Job Published: ${job.title} | ${jobUrl}`);

    // ✅ JobPosting Schema save करो
    try {
        const publishTime = job.createdAt?.toDate?.()?.toISOString()
            || new Date().toISOString();

        const jobSchema = {
            "@context": "https://schema.org/",
            "@type": "JobPosting",
            "title": job.title || '',
            "description": job.description || job.title || '',
            "datePosted": publishTime,
            "employmentType": "FULL_TIME",
            "hiringOrganization": {
                "@type": "Organization",
                "name": job.organization || "Govt Department",
                "sameAs": "https://studygyaan.in",
                "logo": "https://studygyaan.in/logo.png"
            },
            "jobLocation": {
                "@type": "Place",
                "address": {
                    "@type": "PostalAddress",
                    "addressRegion": job.location || "India",
                    "addressCountry": "IN"
                }
            },
            "validThrough": job.lastDate || '',
            "identifier": {
                "@type": "PropertyValue",
                "name": job.organization || "StudyGyaan",
                "value": job.advtNo || jobId
            }
        };

        // Salary अगर है तो add करो
        if (job.salary && job.salary.length > 2) {
            jobSchema.baseSalary = {
                "@type": "MonetaryAmount",
                "currency": "INR",
                "value": {
                    "@type": "QuantitativeValue",
                    "description": job.salary
                }
            };
        }

        await db.collection("jobs").doc(jobId).update({
            schemaMarkup: JSON.stringify(jobSchema)
        });
        console.log("✅ Job Schema saved");
    } catch (schemaErr) {
        console.error("Schema save error:", schemaErr.message);
    }

    // ✅ Google Indexing
    await notifyGoogle(jobUrl).catch(e =>
        console.log("Indexing skip:", e.message)
    );

    // ✅ Video Generation
    let videoStatus = "Not attempted";
    try {
        let generateVideo;
        try {
            ({ generateAndUploadVideo: generateVideo } = require('./autoVideo'));
        } catch (importErr) {
            console.warn("autoVideo not found:", importErr.message);
            generateVideo = null;
        }

        if (generateVideo) {
            const success = await generateVideo({
                ...job,
                id: jobId,
                slug: job.slug || jobId
            });
            videoStatus = success ? "✅ Video uploaded!" : "⚠️ Video failed";

            if (success) {
                await db.collection("jobs").doc(jobId)
                    .update({ videoGenerated: true })
                    .catch(() => {});
            }
        } else {
            videoStatus = "⏭️ Video module not available";
        }
    } catch (videoErr) {
        console.error("Video error:", videoErr.message);
        videoStatus = `❌ Video error: ${videoErr.message.substring(0, 50)}`;
    }

    // ✅ Telegram Notification
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (BOT_TOKEN && CHAT_ID) {
        const msg = `🚨 <b>New Govt Job Alert!</b>\n\n` +
            `📌 <b>Post:</b> ${job.title || 'New Job'}\n` +
            `🏢 <b>Dept:</b> ${job.organization || 'Govt Department'}\n` +
            `🎓 <b>Qualification:</b> ${job.qualification || 'Check Details'}\n` +
            `⏳ <b>Last Date:</b> ${job.lastDate || 'Apply Soon'}\n` +
            `💼 <b>Vacancies:</b> ${job.vacancies || 'Check Notification'}\n\n` +
            `📖 <b>Full Details:</b>\n${jobUrl}\n\n` +
            `🎬 ${videoStatus}\n\n` +
            `🔔 @studygyaan_official`;

        try {
            await axios.post(
                `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
                {
                    chat_id: CHAT_ID,
                    text: msg,
                    parse_mode: 'HTML',
                    disable_web_page_preview: false
                }
            );
            console.log("✅ Telegram sent!");
        } catch (tgErr) {
            console.error("Telegram error:", tgErr.message);
        }
    }

    // ✅ WhatsApp (Environment variable से IP लो)
    const WA_SERVER = process.env.WHATSAPP_SERVER_URL;
    if (WA_SERVER) {
        const waMsg = `🚨 *New Govt Job Alert!*\n\n📌 *${job.title}*\n\n🔗 Details:\n${jobUrl}`;
        axios.post(`${WA_SERVER}/send-job`, {
            targetId: "120363425475163322@newsletter",
            messageText: waMsg
        }).catch(e => console.log("WhatsApp skip:", e.message));
    }

    console.log(`✅ Job notification complete: ${job.title}`);
    return null;
});

// =========================================================
// 3️⃣ GITHUB ACTIONS CLI RUNNER
// =========================================================
exports.runJobScraper = async (maxJobs = 5) => {
    try {
        console.log("🤖 CLI Scraper Started...");
        const count = await scrapeGovtJobsLogic(maxJobs);
        console.log(`🎯 Done: ${count} jobs saved to job_drafts`);
        return count;
    } catch (error) {
        console.error("❌ CLI Scraper Failed:", error.message);
        throw error;
    }
};

// =========================================================
// ✅ Direct Run Support (GitHub Actions)
// =========================================================
if (require.main === module) {
    const maxJobs = parseInt(process.argv[2]) || 5;
    console.log(`🚀 Running scraper for ${maxJobs} jobs...`);

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

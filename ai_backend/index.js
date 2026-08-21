const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
const path = require("path");
const { registerAgentRoutes, authorizeAgentRequest } = require("./agents/agent_orchestrator");
const { enhanceCommand } = require("./agents/prompt_enhancer");
const { SEOIndexingAgent } = require("./agents/seo_indexing_agent");
setGlobalOptions({
  maxInstances: 10,
  timeoutSeconds: 300,
  memory: "1GiB",
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const { isAutomationEnabled } = require("./agents/automation_guard");

// Manual and automatic specialist-agent entry points. Cost-bearing routes are
// protected with AGENT_ADMIN_TOKEN inside the orchestrator.
registerAgentRoutes(app);
// Source-grounded Job / Fast-track article agents (Generate, Preview,
// Regenerate, Apply, Publish). Draft-first; failed review blocks publishing.
require("./agents/article_agents/article_routes").registerArticleAgentRoutes(app, db);
// 📱 Article → Web Story backfill endpoint (POST /stories/backfill)
require("./article_to_story").registerStoryRoutes(app, db, admin.firestore.FieldValue);
app.post("/seo/indexing-audit", async (req, res) => {
  const auth = authorizeAgentRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  try {
    const agent = new SEOIndexingAgent();
    const report = await agent.run({
      mode: req.body?.mode === "auto" ? "auto" : "audit",
      url: req.body?.url,
      maxUrls: Math.min(Number(req.body?.maxUrls) || 50, 200),
      outputPath: path.resolve("/tmp", `seo-audit-${Date.now()}.json`)
    });
    return res.json({
      success: true,
      runId: report.runId,
      mode: report.mode,
      sitemap: report.sitemap,
      summary: report.summary,
      searchConsole: report.searchConsole,
      indexingApi: report.indexingApi,
      audits: report.audits
    });
  } catch (error) {
    console.error("SEO indexing agent error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= AI MODEL CONFIG ================= */
const AI_MODELS = {
  MOCK_TEST: "gemini-2.5-flash-lite", // gemgemini की टाइपिंग मिस्टेक भी सही कर दी है
  BLOG: "gemini-2.5-flash-lite",
};

let genAI_instance = null;

function getModel(modelName, config) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  if (!genAI_instance) {
    // .env या Secrets से आपकी GEMINI_API_KEY उठाएगा
    genAI_instance = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI_instance.getGenerativeModel({
    model: modelName,
    generationConfig: config,
  });
}

function safeJSONParse(text) {
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text);
}

/* ================= PING ================= */

/**
 * Best-effort multi-engine indexing ping — publish flow ko kabhi block nahi karta.
 * 4 IndexNow endpoints (api.indexnow.org, Bing, Seznam, Yandex) + sitemap pings
 * + WebSub — sab free, koi API key nahi chahiye.
 */
function fireAndForgetIndexNow(urls) {
  try {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).slice(0, 100);
    if (!list.length) return;
    const booster = require("./indexing_booster");
    booster.submitToAllIndexNow(list).catch(() => {});
    booster.pingAllSitemaps().catch(() => {});
    booster.publishWebSub().catch(() => {});
  } catch (e) {
    // Never block publish
  }
}

/* ================= MOCK TEST GENERATOR ================= */

app.post("/generate", async (req, res) => {
  const { topic, totalQuestions = 50 } = req.body;

  if (!topic) {
    return res.status(400).json({ success: false, error: "Topic is required" });
  }

  try {
    const model = getModel(AI_MODELS.MOCK_TEST, {
      maxOutputTokens: 7000, // safe range
      temperature: 0.2,
      responseMimeType: "application/json",
    });

    const enhancedIntent = await enhanceCommand({
      agentId: "mock-test",
      command: topic,
      mode: req.body?.mode === "auto" ? "auto" : "manual",
      context: { totalQuestions, audience: "Indian competitive-exam students", bilingual: true },
      outputContract: "Use this as a precise topic/exam brief for the downstream JSON mock-test generator."
    });

    let allQuestions = [];
    const seen = new Set();

    const batchSize = 5; // small stable batches
    const maxAttempts = 12; // safety limit
    let attempts = 0;

    while (allQuestions.length < totalQuestions && attempts < maxAttempts) {
      attempts++;

      const remaining = totalQuestions - allQuestions.length;
      const currentBatchSize = Math.min(batchSize, remaining);

      const prompt = `
Act as a Senior Paper Setter for Indian Competitive Exams like SSC CGL, Railway RRB, Banking, UPSC.

Generate EXACTLY ${currentBatchSize} UNIQUE and HIGH-LEVEL questions.

Requested Topic/Exam: "${topic}"

PROMPT-ENGINEER BRIEF (use it only to clarify the same request; never change the requested exam/topic):
<enhanced_brief>
${enhancedIntent.prompt}
</enhanced_brief>

CRITICAL RULES:

1. If topic is an EXAM NAME (like "Railway Special", "SSC CGL"):
   - Generate FULL MIXED PAPER
   - 25% Quantitative Aptitude
   - 25% Reasoning
   - 25% General Science
   - 25% GK + Current Affairs
   - DO NOT generate railway track history unless syllabus demands.

2. If topic is a SUBJECT (like "Algebra"):
   - Only generate that subject questions.

3. Strictly competitive exam level.
4. No basic trivial questions.
5. No repetition.
6. Bilingual format mandatory.

Return ONLY valid JSON.

Format:
{
  "title": "string",
  "questions": [
    {
      "qText": "Hindi\\nEnglish",
      "options": [
        "Hindi / English",
        "Hindi / English",
        "Hindi / English",
        "Hindi / English"
      ],
      "correctOption": 0,
      "qLogic": "Hindi\\nEnglish"
    }
  ]
}
`;

      const resp = await model.generateContent(prompt);
      let text = resp.response?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) continue;

      let json;
      try {
        json = safeJSONParse(text);
      } catch (err) {
        console.error("JSON PARSE ERROR:", err.message);
        continue;
      }

      for (const q of json.questions || []) {
        if (!seen.has(q.qText)) {
          seen.add(q.qText);
          allQuestions.push(q);
        }
      }
    }

    // Final trim (extra safety)
    allQuestions = allQuestions.slice(0, totalQuestions);

    if (allQuestions.length === 0) {
      return res.status(500).json({
        success: false,
        error: "AI failed to generate questions. Try again.",
      });
    }

    const docRef = await db.collection("mock_tests").add({
      title: topic,
      questions: allQuestions,
      totalQuestions: allQuestions.length,
      durationMinutes: allQuestions.length,
      negativeMarking: 0.25,
      requestedTopic: topic,
      createdAt: new Date(),
      status: "published",
    });

    // 🔔 IndexNow ping — Bing/Yandex ko turant notify
    fireAndForgetIndexNow([`https://studygyaan.in/test/${encodeURIComponent(docRef.id)}`]);

    return res.json({
      success: true,
      id: docRef.id,
      count: allQuestions.length,
      url: `https://studygyaan.in/test/${docRef.id}`,
    });

  } catch (error) {
    console.error("SERVER ERROR:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/* ================= BLOG GENERATOR (MANUAL + PHOTO + TELEGRAM) ================= */

app.post("/generate-blog", async (req, res) => {
  const { topic } = req.body;

  if (!topic) {
    return res.status(400).json({
      success: false,
      error: "Topic is required",
    });
  }

  try {
    const model = getModel(AI_MODELS.BLOG, {
      maxOutputTokens: 8000,
      temperature: 0.65,
      responseMimeType: "application/json",
    });

    const enhancedIntent = await enhanceCommand({
      agentId: "blog-editor",
      command: topic,
      mode: req.body?.mode === "auto" ? "auto" : "manual",
      context: { site: "StudyGyaan.in", audience: "Indian students", language: "Hindi/Hinglish" },
      outputContract: "Create a research and editorial brief for the downstream blog writer; do not write the article yet."
    });

    // Prompt Engineer Agent output is passed to the specialist Blog Agent.
    const prompt = `
You are an Indian Hindi content creator.
Bharatiya students ke liye SEO friendly Hinglish blog likho
MANDATORY LANGUAGE RULES:

1. Article MUST be written in Hinglish.
2. At least 40% of sentences must contain Hindi (Devanagari script).
3. Each paragraph MUST contain at least one Hindi sentence.
4. Headings must also contain Hindi words.
5. Pure English paragraphs are NOT allowed.
6. Do NOT generate a pure English article under any condition.

STRUCTURE:
- Catchy SEO Title (Hinglish)
- SEO Meta Description (Hinglish)
- 5-8 SEO Tags
- Proper HTML formatting inside "content"
- Use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <blockquote>
- Add emojis in headings
- Short paragraphs
- Add <br> spacing
- Add FAQ section (3-5)
- Add motivational conclusion
- 900-1200 words

Return ONLY valid JSON.

Format:
{
  "title": "",
  "metaDescription": "",
  "tags": [],
  "imagePrompt": "High-quality realistic educational 3D digital art representing '${topic}', 16:9 aspect ratio, vibrant colors, featuring the exact text 'StudyGyaan.in' written in large, bold, and highly readable font as a watermark or main element",
  "content": ""
}

Topic: "${topic}"

EDITORIAL BRIEF FROM PROMPT-ENGINEER AGENT:
<enhanced_brief>
${enhancedIntent.prompt}
</enhanced_brief>
`;

    const resp = await model.generateContent(prompt);
    let text = resp.response?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("Empty AI response");

    let finalData;
    try {
      finalData = safeJSONParse(text);
    } catch (err) {
      console.error("BLOG JSON PARSE ERROR:", err.message);
      return res.status(500).json({ success: false, error: "Invalid AI JSON format" });
    }

    if (finalData.metaDescription && finalData.metaDescription.length > 160) {
      finalData.metaDescription = finalData.metaDescription.substring(0, 157) + "...";
    }

    // 🎨 2. IMAGE GENERATION LOGIC
    let imageUrl = "";
    try {
      console.log("🎨 Generating Image for Manual Blog...");
      const { GoogleAuth } = require("google-auth-library");
      const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
      const client = await auth.getClient();
      const token = (await client.getAccessToken()).token;

      const projectId = "studymaterial-406ad"; 
      const location = "us-central1";
      const imagenUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`;

      const imageResponse = await axios.post(imagenUrl, {
          instances: [{ prompt: finalData.imagePrompt }],
          parameters: { sampleCount: 1, aspectRatio: "16:9" }
      }, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (imageResponse.data?.predictions?.length > 0) {
          const base64Image = imageResponse.data.predictions[0].bytesBase64Encoded;
          const bucket = admin.storage().bucket(); // Default bucket
          const fileName = `blog_images/manual_blog_${Date.now()}.png`;
          const file = bucket.file(fileName);

          await file.save(Buffer.from(base64Image, 'base64'), {
              metadata: { contentType: 'image/png' },
              public: true
          });

          imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
          console.log("✅ Image Uploaded:", imageUrl);
      }
    } catch (imgError) {
      console.error("❌ IMAGE GENERATION FAILED:", imgError.message);
    }

    // 💾 3. SAVE TO FIRESTORE DIRECTLY
    const blogRef = await db.collection("blogs").add({
        title: finalData.title,
        description: finalData.metaDescription || "",
        tags: finalData.tags || [],
        content: finalData.content,
        imageUrl: imageUrl, 
        category: finalData.category || "General Info", 
        type: "blog",
        status: "publish", // डायरेक्ट पब्लिश
        author: "Rahul Sir",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        date: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`🎯 Manual Blog Saved to DB with ID: ${blogRef.id}`);

    // 🔔 IndexNow ping — Bing/Yandex/Seznam ko turant notify (Google bhi IndexNow pe crawl karta hai)
    fireAndForgetIndexNow([`https://studygyaan.in/blog/${encodeURIComponent(finalData.slug || blogRef.id)}`]);

    // 📢 4. TELEGRAM AUTO-POST
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        try {
            const blogUrl = `https://studygyaan.in/blog/${blogRef.id}`;
            const telegramMessage = `🔥 <b>${finalData.title}</b>\n\n${finalData.metaDescription || ""}\n\n📖 <b>पूरा पढ़ें:</b>\n${blogUrl}\n\n🚀 <i>Join @studygyaan_official for more!</i>`;
            
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: telegramMessage,
                parse_mode: 'HTML'
            });
            console.log("📢 Telegram Notification Sent Successfully!");
        } catch (teleError) {
            console.error("❌ Telegram Error:", teleError.message);
        }
    }

    // 🔙 5. RETURN TO FRONTEND
    return res.json({
      success: true,
      message: "Blog Generated, Image Created, Saved & Sent to Telegram! 🚀",
      id: blogRef.id,
      data: {
          ...finalData,
          imageUrl: imageUrl
      }
    });

  } catch (error) {
    console.error("BLOG ERROR:", error.message, error.stack);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/* ================= FINAL EXPORTS (TIMEOUT FIX & VISIBLE) ================= */

// 0. API Core & Meta Tags (Working)
exports.api = onRequest({
 secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID", "GEMINI_API_KEY", "GMAIL_CREDENTIALS", "SERVICE_ACCOUNT_JSON", "AGENT_ADMIN_TOKEN"],
  maxInstances: 10,
  timeoutSeconds: 300,
  memory: "1GiB",
  cors: true
}, app);

// Spark-safe HTTP SEO functions live in seo_export.js (package.json "main")
// so CI can deploy them without discovering secrets/schedules/extensions.
Object.assign(exports, require("./seo_export"));

// 📲 Telegram APPROVE BUTTONS — AI draft card ke ✅/❌ clicks yahi handle hote hain
exports.telegramDraftWebhook = onRequest({
    secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID"],
    maxInstances: 5,
    timeoutSeconds: 60
}, (req, res) => require("./telegram_draft_bot").handleWebhook(
    db,
    admin.firestore.FieldValue,
    null,
    require("./telegram_draft_bot").adminCredsFromEnv()
)(req, res));

// 1. Govt Jobs
exports.onJobApprovedSendTelegram = onDocumentWritten({
    document: "jobs/{jobId}",
    secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON", "GMAIL_CREDENTIALS", "YOUTUBE_TOKEN", "TTS_KEY_JSON"],
    timeoutSeconds: 540, memory: "2GiB"
}, (event) => require("./govt_jobs").onJobApprovedSendTelegram(event));

exports.fetchLatestGovtJobs = onRequest({ timeoutSeconds: 300, memory: "1GiB" }, 
    (req, res) => require("./govt_jobs").fetchLatestGovtJobs(req, res));
    exports.onJobPublishedNotify = require("./govt_jobs").onJobPublishedNotify;

// 2. Fast Track Updates
exports.fetchFastTrackUpdates = require("./fast_track_updates").fetchFastTrackUpdates;
exports.triggerFastTrackUpdates = require("./fast_track_updates").triggerFastTrackUpdates;
exports.onFastTrackApprovedSendTelegram = require("./fast_track_updates").onFastTrackApprovedSendTelegram;

// 3. News, RSS & SEO HTTP functions are exported from seo_export.js above.

// 4. Web Stories
exports.renderWebStory = onRequest({ cors: true }, (req, res) => {
    const storyId = req.path.split('/').filter(Boolean)[0];
    req.params = { id: storyId }; 
    return require("./web_stories").renderWebStory(req, res);
});
exports.generateStoriesSitemap = onRequest({ memory: "256MiB" }, (req, res) => require("./web_stories").generateStoriesSitemap(req, res));

// 🖼️ DYNAMIC OG IMAGES (WebP — halki) — share-preview har job/update/blog ke liye
// GET /jobOgImage?c=job|update|blog&s=<slug>
exports.jobOgImage = onRequest(
    { memory: "512MiB", timeoutSeconds: 60, maxInstances: 10 },
    require("./og_image").createOgImageHandler(db)
);

// 📱 4B. AUTO WEB STORIES — article publish hote hi Discover-ready AMP story
// (jobs/fast_track/blogs; sirf publish-transition pe chalti hai, views/edits pe nahi)
const autoStoryTrigger = (collectionName, idParam) => (event) =>
    require("./article_to_story").handleDocumentWritten(db, admin.firestore.FieldValue, collectionName, idParam)(event);
exports.onJobPublishedAutoStory = onDocumentWritten({ document: "jobs/{jobId}", maxInstances: 5 },
    autoStoryTrigger("jobs", "jobId"));
exports.onFastTrackPublishedAutoStory = onDocumentWritten({ document: "fast_track/{docId}", maxInstances: 5 },
    autoStoryTrigger("fast_track", "docId"));
exports.onBlogPublishedAutoStory = onDocumentWritten({ document: "blogs/{docId}", maxInstances: 5 },
    autoStoryTrigger("blogs", "docId"));

// 🌅 4C. AUTO-DRAFTS MACHINE — roz subah 8 baje (IST) fresh items se AI drafts
// bante hain + Telegram approve-card (publish kabhi khud nahi karta)
// 🛑 Automation guard — Firestore system_settings/automation se ON/OFF
exports.scheduledAutoDrafts = onSchedule({
    schedule: "every day 08:00",
    timeZone: "Asia/Kolkata",
    secrets: ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID"],
    timeoutSeconds: 540,
    memory: "1GiB",
    maxInstances: 1
}, async () => {
    const guard = await isAutomationEnabled(db, 'auto_drafts');
    if (!guard.enabled) {
        console.log(`⏸️ scheduledAutoDrafts skipped — ${guard.reason}`);
        return { skipped: true, reason: guard.reason };
    }
    return require("./auto_drafts").runAutoDraftsJob(db, admin.firestore.FieldValue, { limit: 2, repairLimit: 2 });
});

// 🔁 4D. RETRY MACHINE — har 30 minute (user request 30-40 min): jo draft "ready for publish" (review
// PASS) nahi hua, use dobara regenerate karo (pichli review issues ke saath);
// har cycle me pipeline ka self-healing loop khud 3 writer-attempts leta hai.
// Ready hote hi Telegram pe ✅ PUBLISH approval card jata hai.
// + 1 fresh candidate bhi. Khali queue pe kuch nahi hota (AI call zero).
// 🛑 Automation guard — smart facts harvester (salary, dates, titles) ke saath
exports.scheduledAutoDraftRetry = onSchedule({
    schedule: "every 30 minutes",
    timeZone: "Asia/Kolkata",
    secrets: ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID"],
    timeoutSeconds: 540,
    memory: "1GiB",
    maxInstances: 1
}, async () => {
    const guard = await isAutomationEnabled(db, 'auto_drafts_repair');
    if (!guard.enabled) {
        console.log(`⏸️ scheduledAutoDraftRetry skipped — ${guard.reason}`);
        return { skipped: true, reason: guard.reason };
    }
    return require("./auto_drafts").runAutoDraftsJob(db, admin.firestore.FieldValue, { limit: 1, repairLimit: 1 });
});

// Manual run (admin/GitHub Actions ke liye) — GET/POST dono chalega
// 🛑 Guard — unless ?force=true
exports.triggerAutoDrafts = onRequest({
    secrets: ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID"],
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (req, res) => {
    try {
        const force = String(req.query.force || req.body?.force || '').toLowerCase() === 'true';
        if (!force) {
            const guard = await isAutomationEnabled(db, 'auto_drafts');
            if (!guard.enabled) {
                return res.status(200).json({ success: false, skipped: true, reason: guard.reason, message: `Paused: ${guard.reason}. Use ?force=true to override.` });
            }
        }
        const limit = Number(req.query.limit || req.body?.limit || 2);
        const repairLimit = Number(req.query.repairLimit || req.body?.repairLimit || 1);
        const report = await require("./auto_drafts").runAutoDraftsJob(db, admin.firestore.FieldValue, { limit, repairLimit });
        return res.json({ success: true, ...report });
    } catch (error) {
        console.error("❌ triggerAutoDrafts:", error);
        return res.status(500).json({ success: false, error: error.message || "auto-drafts failed" });
    }
});

// 5. Auto Stories (Triggered via GitHub Actions API)
exports.triggerBlogStoryNoon = onRequest({ timeoutSeconds: 300, memory: "512MiB" }, (req, res) => require("./auto_stories").triggerBlogStoryNoon(req, res));

exports.triggerBlogStoryNight = onRequest({ timeoutSeconds: 300, memory: "512MiB" }, (req, res) => require("./auto_stories").triggerBlogStoryNight(req, res));

exports.triggerMockStoryMorning = onRequest({ timeoutSeconds: 300, memory: "512MiB" }, (req, res) => require("./auto_stories").triggerMockStoryMorning(req, res));

// 6. Daily Alert & Others
exports.triggerDailyAlert = onRequest({ timeoutSeconds: 300, memory: "1GiB" }, (req, res) => require("./daily_alert").triggerDailyAlert(req, res));
exports.generatePremiumNote = onRequest({ timeoutSeconds: 300, memory: "1GiB" }, 
    (req, res) => require("./premium_notes").generatePremiumNote(req, res));

// ✅ NOTE: generateDailyMocks अब GitHub Actions पर है, इसलिए इसे यहाँ से हटा दिया गया है। 

exports.autoImageJobDrafts = onDocumentWritten("job_drafts/{docId}", (event) => {
    return require('./autoImage').autoImageJobDrafts(event);
});

exports.autoImageFastTrack = onDocumentWritten("fast_track_drafts/{docId}", (event) => {
    return require('./autoImage').autoImageFastTrack(event);
});

/* ============ 🤖 SEO MASTER AGENT — Pure project ka SEO + Connections Guardian ============ */
// Smart facts harvester: salary, dates, titles, vacancy, org sab pehchanta hai
// Har 30-40 min me fetch draft jobs/fast-tracks ko regenerate + Telegram
// SEO control, connections jodke rakhna, gadbad thik karna, Google trending

// 6hrly SEO Master — deep audit + connection health + auto-fix
exports.scheduledSEOMaster6Hourly = onSchedule({
    schedule: "every 6 hours",
    timeZone: "Asia/Kolkata",
    secrets: ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID", "SERVICE_ACCOUNT_JSON"],
    timeoutSeconds: 540,
    memory: "1GiB",
    maxInstances: 1
}, async () => {
    const guard = await isAutomationEnabled(db, 'google_indexing');
    if (!guard.enabled) {
        console.log(`⏸️ SEO Master 6hr skipped — ${guard.reason}`);
        return { skipped: true, reason: guard.reason };
    }
    const { runSEOMasterAgent } = require("./agents/seo_master_agent");
    return runSEOMasterAgent(db, admin.firestore.FieldValue, { maxUrls: 100 });
});

// Daily 9am IST — Trending check + Telegram summary
exports.scheduledSEOMasterDaily = onSchedule({
    schedule: "every day 09:00",
    timeZone: "Asia/Kolkata",
    secrets: ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID", "SERVICE_ACCOUNT_JSON"],
    timeoutSeconds: 540,
    memory: "1GiB",
    maxInstances: 1
}, async () => {
    const guard = await isAutomationEnabled(db, 'google_indexing');
    if (!guard.enabled) {
        console.log(`⏸️ SEO Master Daily skipped — ${guard.reason}`);
        return { skipped: true, reason: guard.reason };
    }
    const { runSEOMasterAgent } = require("./agents/seo_master_agent");
    return runSEOMasterAgent(db, admin.firestore.FieldValue, { maxUrls: 150, isDaily: true });
});

// Manual trigger for SEO Master (admin)
exports.triggerSEOMaster = onRequest({
    secrets: ["GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_ADMIN_CHAT_ID", "SERVICE_ACCOUNT_JSON"],
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (req, res) => {
    try {
        const force = String(req.query.force || req.body?.force || '').toLowerCase() === 'true';
        if (!force) {
            const guard = await isAutomationEnabled(db, 'google_indexing');
            if (!guard.enabled) {
                return res.status(200).json({ success: false, skipped: true, reason: guard.reason });
            }
        }
        const { runSEOMasterAgent } = require("./agents/seo_master_agent");
        const report = await runSEOMasterAgent(db, admin.firestore.FieldValue, { 
            maxUrls: Number(req.query.maxUrls || 120),
            isDaily: String(req.query.daily || '').toLowerCase() === 'true',
            force
        });
        return res.json({ success: true, ...report });
    } catch (e) {
        console.error("SEO Master error:", e);
        return res.status(500).json({ success: false, error: e.message });
    }
});

/* ============ AUTO SEO INDEXING (naya public page bante hi Google/Bing ping) ============ */
const { onDocumentCreated: __onIndexDocCreated } = require("firebase-functions/v2/firestore");
const autoIndexer = require("./auto_indexer");

// jobs / fast_track / blogs / web_stories / mock_tests — har naye public doc pe:
//   IndexNow (Bing family) turant + Google Indexing API (SERVICE_ACCOUNT_JSON secret
//   se, jo api function pe pehle se configured hai). Draft/archived skip.
// NOTE: indexing sirf best-effort hai — publish kabhi iske fail se nahi rukta.
// ⚠️ onDocumentCreated v2 triggers EventArc use karte hain — Blaze plan chahiye.
// secrets: binding hata diya hai taaki Spark pe bhi deploy ho sake (Google Indexing
// API SA-JSON ke bina skip ho jayegi; IndexNow bina credentials ke chalta hai).
// Blaze pe secrets: ["SERVICE_ACCOUNT_JSON"] add kar sakte ho.
autoIndexer.AUTO_INDEX_COLLECTIONS.forEach((coll) => {
  exports[`onIndexPing_${coll}`] = __onIndexDocCreated(
    { document: `${coll}/{docId}`, maxInstances: 5 },
    autoIndexer.buildCreatedHandler(coll, { fieldValue: admin.firestore.FieldValue })
  );
});

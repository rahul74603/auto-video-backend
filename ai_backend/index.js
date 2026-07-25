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

// Manual and automatic specialist-agent entry points. Cost-bearing routes are
// protected with AGENT_ADMIN_TOKEN inside the orchestrator.
registerAgentRoutes(app);
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
    });

    return res.json({
      success: true,
      id: docRef.id,
      count: allQuestions.length,
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

const handleMetaTags = require("./server_seo_renderer").createServerSeoHandler({
  db,
  renderWebStory: (req, res) => require("./web_stories").renderWebStory(req, res)
});
/* ================= FINAL EXPORTS (TIMEOUT FIX & VISIBLE) ================= */

// 0. API Core & Meta Tags (Working)
exports.api = onRequest({
 secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "GEMINI_API_KEY", "GMAIL_CREDENTIALS", "SERVICE_ACCOUNT_JSON", "AGENT_ADMIN_TOKEN"],
  maxInstances: 10,
  timeoutSeconds: 300,
  memory: "1GiB",
  cors: true
}, app);

exports.serverSideMetaTags = onRequest({ memory: "1GiB" }, (req, res) => handleMetaTags(req, res));

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

// 3. News, RSS & SEO
exports.rssFeed = onRequest({ memory: "1GiB" }, (req, res) => require("./newsFeed").rssFeed(req, res));
const proxySeoFunction = (name) => onRequest({ memory: "512MiB", timeoutSeconds: 300 }, (req, res) => {
    return require("./seo_functions")[name](req, res);
});
exports.generateSitemapIndex = proxySeoFunction("generateSitemapIndex");
exports.generateSitemapMain = proxySeoFunction("generateSitemapMain");
exports.generateSitemapBlogs = proxySeoFunction("generateSitemapBlogs");
exports.generateSitemapJobs = proxySeoFunction("generateSitemapJobs");
exports.generateSitemapTests = proxySeoFunction("generateSitemapTests");
exports.generateSitemapStories = proxySeoFunction("generateSitemapStories");
exports.generateSitemapUpdates = proxySeoFunction("generateSitemapUpdates");
exports.generateSitemapNews = proxySeoFunction("generateSitemapNews");
// Legacy all-in-one sitemap remains available at /sitemap-all.xml only.
exports.generateSitemap = proxySeoFunction("generateSitemap");
exports.generateRss = proxySeoFunction("generateRss");

// 4. Web Stories
exports.renderWebStory = onRequest({ cors: true }, (req, res) => {
    const storyId = req.path.split('/').filter(Boolean)[0];
    req.params = { id: storyId }; 
    return require("./web_stories").renderWebStory(req, res);
});
exports.generateStoriesSitemap = onRequest({ memory: "256MiB" }, (req, res) => require("./web_stories").generateStoriesSitemap(req, res));

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

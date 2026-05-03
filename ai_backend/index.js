const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { VertexAI } = require("@google-cloud/vertexai");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
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

const vertex_ai = new VertexAI({
  project: "studymaterial-406ad",
  location: "us-central1",
});

/* ================= AI MODEL CONFIG ================= */

const AI_MODELS = {
  MOCK_TEST: "gemgemini-2.5-flash-lite",
  BLOG: "gemini-2.5-flash-lite",
};

function getModel(modelName, config) {
  return vertex_ai.getGenerativeModel({
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
      temperature: 0.8, // Thoda creative
      responseMimeType: "application/json",
    });

    // 1. 🔥 PROMPT MEIN IMAGE KA LOGIC ADD KIYA
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

async function handleMetaTags(req, res) {
    const parts = req.path.split('/').filter(p => p !== "");
    const category = parts[0]; 
    const postId = parts[1];
    
// 🚀 NEW: GOOGLE WEB STORIES SMART INTERCEPTOR
    if (category === "web-stories" && postId) {
        try {
            const { renderWebStory } = require("./web_stories");
            req.params = { id: postId }; 
            return await renderWebStory(req, res);
        } catch (err) {
            console.error("Web Story Error:", err);
            return res.status(500).send("Web Story Server Error");
        }
    }
    try {
        const indexPath = path.resolve(__dirname, './index.html');
        let html = fs.readFileSync(indexPath, 'utf8');

        // अगर फंक्शन चला, तो पेज के एकदम नीचे ये ठप्पा लग जाएगा
        html = html.replace('</body>', '\n\n</body>');

        // 🔥 CANONICAL URL GENERATOR (Removes trailing slash to fix Search Console Duplicates)
        let cleanPath = req.path;
        if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
            cleanPath = cleanPath.slice(0, -1);
        }
        const canonicalUrl = `https://studygyaan.in${cleanPath}`;

        // 🔥 INJECT CANONICAL TAG JUST BEFORE </head>
        html = html.replace('</head>', `\n<link rel="canonical" href="${canonicalUrl}" />\n</head>`);

        if (postId && category) {
            let collectionName = category;
            if (category === "job") collectionName = "jobs"; 
            if (category === "blog") collectionName = "blogs"; 

            const postDoc = await db.collection(collectionName).doc(postId).get();
            
            if (postDoc.exists) {
                const data = postDoc.data();
                const title = data.title || data.post_name || "StudyGyaan Update";
                const desc = data.shortDescription || "Latest update on StudyGyaan";
                
                // ✅ ये रहा तेरी cPanel वाली फोटो का लिंक
                const defaultImg = "https://studygyaan.in/og-image.jpg";
                let img = data.subject_img || data.imageUrl || defaultImg;
                
                html = html.replace(/_OG_TITLE_/g, title);
                html = html.replace(/_OG_DESCRIPTION_/g, desc);
                html = html.replace(/_OG_IMAGE_/g, img);
                html = html.replace(/_OG_URL_/g, canonicalUrl); // Updated to use strictly clean Canonical URL
                
                html = html.replace('</body>', '\n\n</body>');
            } else {
                html = html.replace('</body>', `\n\n</body>`);
            }
        }
        res.set('Cache-Control', 'no-store'); // कैश बंद कर दिया
        return res.status(200).send(html);
    } catch (e) {
        return res.status(500).send("Backend Crash: " + e.message);
    }
}
/* ================= EXPORTS ================= */
// Express based API with Secrets and CORS Enabled
exports.api = onRequest({
 secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "GEMINI_API_KEY", "GMAIL_CREDENTIALS", "SERVICE_ACCOUNT_JSON"],
  maxInstances: 10,
  timeoutSeconds: 300,
  memory: "1GiB",
  cors: true
}, app);

/// Separate Cloud Functions
const govtJobs = require("./govt_jobs");
exports.onJobApprovedSendTelegram = govtJobs.onJobApprovedSendTelegram;
exports.fetchLatestGovtJobs = govtJobs.fetchLatestGovtJobs; // 🚀 YAHAN YE NAYI LINE ADD HUI HAI

const premiumNotes = require("./premium_notes");
exports.generatePremiumNote = premiumNotes.generatePremiumNote;

const autoBlog = require("./auto_blog");
exports.generateDailyBlog = autoBlog.generateDailyBlog;

const fastTrack = require("./fast_track_updates");
exports.fetchFastTrackUpdates = fastTrack.fetchFastTrackUpdates;
exports.scheduledFastTrackUpdates = fastTrack.scheduledFastTrackUpdates;
// index.js के अंत में इसे जोड़ें
const autoMock = require("./auto_mock");
exports.generateDailyMocks = autoMock.generateDailyMocks;

// 🔥 FAST TRACK TRIGGER EXPORT
exports.onFastTrackApprovedSendTelegram = fastTrack.onFastTrackApprovedSendTelegram;

// newsFeed.js से फंक्शन मंगाओ
const { rssFeed } = require('./newsFeed');

// इसे एक्सपोर्ट करो ताकि यह लाइव हो सके
exports.rssFeed = rssFeed;

exports.serverSideMetaTags = onRequest({ memory: "1GiB" }, (req, res) => handleMetaTags(req, res));
// 🔥 WEB STORIES DIRECT URL EXPORT (FRONTEND KE LIYE)
const { renderWebStory, generateStoriesSitemap } = require("./web_stories");
exports.renderWebStory = onRequest({ cors: true }, (req, res) => {
    // URL से ID निकालने का स्मार्ट तरीका (क्योंकि यह Express नहीं है)
    const storyId = req.path.split('/').filter(Boolean)[0];
    req.params = { id: storyId }; 
    return renderWebStory(req, res);
});
exports.generateStoriesSitemap = generateStoriesSitemap;

// AUTO STORIES EXPORTS
const autoStories = require("./auto_stories");
exports.scheduledBlogStoryNoon = autoStories.scheduledBlogStoryNoon;
exports.scheduledBlogStoryNight = autoStories.scheduledBlogStoryNight;
exports.scheduledMockStoryMorning = autoStories.scheduledMockStoryMorning;

// ============================================================================
// 🚀 SEO, ALERTS & INDEXING (Clean & Divided Logic)
// ============================================================================

const seo = require("./seo_functions");
const dailyAlert = require("./daily_alert");
const { onSchedule } = require("firebase-functions/v2/scheduler");

// 1. Sitemap, RSS & Google Indexing (seo_functions.js से आ रहे हैं)
exports.generateSitemap = seo.generateSitemap;
exports.generateRss = seo.generateRss;
exports.forcePushSitemap = seo.forcePushSitemap;

// 2. Daily Telegram Alert (सुबह 8:30 बजे - daily_alert.js से)
exports.scheduledDailyJobAlert = onSchedule({
    schedule: "30 8 * * *",
    timeZone: "Asia/Kolkata",
    memory: "1GiB",
    secrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
}, async (event) => {
    await dailyAlert.runDailyAlert();
});

// ✅ Payment Webhook को आपके कहे अनुसार हटा दिया गया है।
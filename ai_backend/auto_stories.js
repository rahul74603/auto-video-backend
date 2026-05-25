require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const sharp = require("sharp"); // ✅ WebP conversion ke liye

if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket("studymaterial-406ad.firebasestorage.app");

// ==========================================
// 🛠️ HELPERS
// ==========================================

function createSlug(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
}

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
            { url: url, type: "URL_UPDATED" },
            { headers: { Authorization: `Bearer ${jwtClient.credentials.access_token}` } }
        );
        console.log("🚀 Google Indexing API called for:", url);
    } catch (err) {
        console.error("❌ Story Indexing Error:", err.message);
    }
}

// ==========================================
// 🖼️ WEBP VERTICAL IMAGE GENERATOR
// Pollinations se PNG download → Sharp se WebP convert → Firebase upload
// ==========================================
async function generateVerticalStoryImage(title, category) {
    try {
        console.log("🎨 Generating WebP Vertical Image...");

        const imagePrompt = `Vertical 9:16 portrait educational poster for ${category}: ${title}, vibrant, no text, clean background`;
        const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1080&height=1920&nologo=true&quality=high`;

        // Step 1: Raw image download karo
        const imgRes = await axios.get(pollUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        // Step 2: Sharp se WebP convert karo (30-50% size reduction)
        const webpBuffer = await sharp(Buffer.from(imgRes.data, 'binary'))
            .resize(1080, 1920, { fit: 'cover', position: 'center' })
            .webp({
                quality: 85,
                effort: 6,
                lossless: false
            })
            .toBuffer();

        console.log(`✅ WebP converted. Size: ${(webpBuffer.length / 1024).toFixed(1)} KB`);

        // Step 3: Firebase me WebP save karo
        const fileName = `web_stories_images/story_${Date.now()}.webp`;
        const file = bucket.file(fileName);

        await file.save(webpBuffer, {
            metadata: {
                contentType: 'image/webp',
                cacheControl: 'public, max-age=31536000'
            },
            public: true
        });

        const webpUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log("✅ WebP Image Uploaded:", webpUrl);
        return webpUrl;

    } catch (imgError) {
        console.error("❌ WebP Generation Failed:", imgError.message);
        // Fallback image (already 9:16 vertical)
        return "https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=1080&h=1920&auto=format&fit=crop";
    }
}

// ==========================================
// 🛠️ MASTER FUNCTION
// ==========================================
async function createStoryFromOldest(collectionName, storyType) {
    try {
        // 🔥 FIX: 'orderBy' हटा दिया गया है ताकि बिना date वाले नए/पुराने blogs भी hide ना हों
        const snapshot = await db.collection(collectionName).get();

        let targetDoc = null;
        for (let docItem of snapshot.docs) {
            const data = docItem.data();
            // यह true और "true" (string) दोनों को अच्छे से हैंडल करेगा
            if (data.isStoryCreated !== true && data.isStoryCreated !== "true") {
                targetDoc = docItem;
                break;
            }
        }

        if (!targetDoc) {
            console.log(`No pending ${collectionName} found for stories.`);
            return null;
        }

        const doc = targetDoc;
        const data = doc.data();

        let finalTitle = data.title || "New Update";
        if (storyType === 'mocktest' && !data.title) {
            finalTitle = data.testName || "New Mock Test";
        }

        const originalSlug = data.slug || doc.id;
        const storySlug = data.slug || createSlug(finalTitle);
        const path = storyType === 'mocktest' ? 'test' : 'blog';
        const applyLink = `https://studygyaan.in/${path}/${originalSlug}`;
        const storyUrl = `https://studygyaan.in/web-stories/${storySlug}`;
        const description = data.metaDescription || data.description || `Attempt this free ${storyType} on StudyGyaan.`;

        // ✅ WebP image generate karo
        const verticalCoverImage = await generateVerticalStoryImage(finalTitle, data.category || storyType);

        // ✅ Firestore me save karo
        // NOTE: coverImageWidth, coverImageHeight, coverImageType yahan save ho raha hai
        // web_stories.js inhe og:image tags me use karta hai — Discover ke liye zaroori hai
        await db.collection("web_stories").doc(storySlug).set({
            title: finalTitle,
            slug: storySlug,
            description: description,
            tags: data.tags || ["studygyaan", storyType, "education"],
            coverImage: verticalCoverImage,
            coverImageWidth: 1080,          // ✅ web_stories.js me og:image:width ke liye
            coverImageHeight: 1920,         // ✅ web_stories.js me og:image:height ke liye
            coverImageType: "image/webp",   // ✅ web_stories.js me og:image:type ke liye
            applyLink: applyLink,
            organization: data.organization || "StudyGyaan",
            vacancies: data.vacancies || "Check Now",
            lastDate: data.lastDate || "Apply Fast",
            category: data.category || "Education",
            author: data.author || "Rahul Sir",
            storyType: storyType,
            questions: data.totalQuestions || (data.questions ? data.questions.length : "50"),
            duration: data.durationMinutes || "30",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // ✅ Original document mark karo
        await db.collection(collectionName).doc(doc.id).update({
            isStoryCreated: true
        });

        console.log(`✅ Story created: ${storySlug}`);

        // ✅ Google Auto Indexing
        await notifyGoogle(storyUrl);

        // ✅ Telegram Alert
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (botToken && chatId) {
            const badge = storyType === 'blog' ? "📱 NEW BLOG STORY" : "🎯 MOCK TEST STORY";
            const msg = `<b>${badge} [WebP ✅]</b>\n\n${finalTitle}\n\n⚡ <b>Quick View (Web Story):</b>\n<a href="${storyUrl}">${storyUrl}</a>`;
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                chat_id: chatId, text: msg, parse_mode: 'HTML'
            }).catch(e => console.log("Telegram Error:", e.message));
        }

        return storySlug;

    } catch (error) {
        console.error(`❌ Error in auto-story for ${collectionName}:`, error.message);
    }
}

// ==========================================
// 🚀 HTTP APIs
// ==========================================

exports.triggerBlogStoryNoon = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
}, async (req, res) => {
    const storySlug = await createStoryFromOldest('blogs', 'blog');
    return res.status(200).json({
        success: true,
        message: "Noon Blog Story API Executed",
        generatedStory: storySlug || "No pending blogs found"
    });
});

exports.triggerBlogStoryNight = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
}, async (req, res) => {
    const storySlug = await createStoryFromOldest('blogs', 'blog');
    return res.status(200).json({
        success: true,
        message: "Night Blog Story API Executed",
        generatedStory: storySlug || "No pending blogs found"
    });
});

exports.triggerMockStoryMorning = onRequest({
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
}, async (req, res) => {
    const storySlug = await createStoryFromOldest('mock_tests', 'mocktest');
    return res.status(200).json({
        success: true,
        message: "Morning Mock Test Story API Executed",
        generatedStory: storySlug || "No pending mock tests found"
    });
});

// ==========================================
// ✅ GitHub Actions Direct Run
// ==========================================
if (require.main === module) {
    const action = process.argv[2] || "blog";
    const collection = action === "mocktest" ? "mock_tests" : "blogs";
    const storyType = action === "mocktest" ? "mocktest" : "blog";

    console.log(`🚀 Running auto_stories.js directly for: ${storyType}`);

    createStoryFromOldest(collection, storyType)
        .then(slug => {
            console.log(`✅ Done. Generated Story: ${slug || "No pending items"}`);
            process.exit(0);
        })
        .catch(err => {
            console.error(`❌ Failed: ${err.message}`);
            process.exit(1);
        });
}

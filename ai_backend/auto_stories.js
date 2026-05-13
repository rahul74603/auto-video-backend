require("dotenv").config();
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");

// ✅ GitHub Secrets से Service Account JSON उठाना
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
const bucket = admin.storage().bucket("studymaterial-406ad.firebasestorage.app"); // 🔥 Storage Bucket Add Kiya

// ==========================================
// 🛠️ SEO & IMAGE HELPERS
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
        await axios.post("https://indexing.googleapis.com/v3/urlNotifications:publish", 
            { url: url, type: "URL_UPDATED" }, 
            { headers: { Authorization: `Bearer ${jwtClient.credentials.access_token}` } }
        );
        console.log("🚀 Web Story Indexed for Discover:", url);
    } catch (err) {
        console.error("❌ Story Indexing Error:", err.message);
    }
}

// 🔥 NEW: 9:16 VERTICAL IMAGE GENERATOR (For GSC Error Fix)
async function generateVerticalStoryImage(title, category) {
    try {
        console.log("🎨 Generating Vertical Image for Story...");
        const imagePrompt = `Vertical 9:16 portrait educational poster for ${category}: ${title}, vibrant, no text, clean UI background`;
        
        // Google Discover ke liye resolution 1080x1920 kiya gaya hai
        const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1080&height=1920&nologo=true&quality=high`;
        
        const imgRes = await axios.get(pollUrl, { 
            responseType: 'arraybuffer', 
            timeout: 30000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        
        const fileName = `web_stories_images/story_${Date.now()}.png`;
        const file = bucket.file(fileName);
        
        await file.save(Buffer.from(imgRes.data, 'binary'), {
            metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' },
            public: true
        });
        
        return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    } catch (imgError) {
        console.error("❌ Story Image Generation Failed:", imgError.message);
        // Fallback: Default High-Quality Vertical Image
        return "https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=1080&h=1920&auto=format&fit=crop";
    }
}

// ==========================================
// 🛠️ मास्टर फंक्शन (SMART ENGINE)
// ==========================================
async function createStoryFromOldest(collectionName, storyType) {
    try {
        console.log(`Checking for pending ${collectionName} to create a story...`);

        const snapshot = await db.collection(collectionName)
            .where("isStoryCreated", "==", false)
            .orderBy("createdAt", "asc") 
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.log(`No pending ${collectionName} found for stories.`);
            return null;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        let finalTitle = data.title || "New Update";
        if (storyType === 'mocktest' && !data.title) {
            finalTitle = data.testName || "New Mock Test";
        }

        // 🔥 SMART SEO URL LOGIC
        const originalSlug = data.slug || doc.id; 
        const storySlug = data.slug || createSlug(finalTitle);

        const path = storyType === 'mocktest' ? 'test' : 'blog';
        const applyLink = `https://studygyaan.in/${path}/${originalSlug}`;
        const storyUrl = `https://studygyaan.in/web-stories/${storySlug}`;

        // 🔥 GENERATE VERTICAL POSTER
        const verticalCoverImage = await generateVerticalStoryImage(finalTitle, data.category || storyType);

        // 🔥 FULL SEO DATA MERGE
        await db.collection("web_stories").doc(storySlug).set({
            title: finalTitle,
            slug: storySlug,
            description: data.metaDescription || data.description || `Attempt this free ${storyType} on StudyGyaan.`,
            tags: data.tags || ["studygyaan", storyType, "education"],
            coverImage: verticalCoverImage, // ✅ Nayi 9:16 Vertical Image use hogi
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

        // 📝 Mark original document as processed
        await db.collection(collectionName).doc(doc.id).update({
            isStoryCreated: true
        });

        console.log(`✅ Story created with SEO Slug & Vertical Image: ${storySlug}`);

        // 🌐 AUTO INDEXING
        await notifyGoogle(storyUrl);

        // 📢 TELEGRAM ALERT
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (botToken && chatId) {
            const badge = storyType === 'blog' ? "📱 NEW BLOG STORY" : "🎯 MOCK TEST STORY";
            const msg = `<b>${badge}</b>\n\n${finalTitle}\n\n⚡ <b>Quick View (Web Story):</b>\n<a href="${storyUrl}">${storyUrl}</a>`;
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                chat_id: chatId, text: msg, parse_mode: 'HTML'
            }).catch(e => console.log("Telegram Error in Auto Story"));
        }

        return storySlug;

    } catch (error) {
        console.error(`❌ Error in auto-story for ${collectionName}:`, error.message);
    }
}

// ==========================================
// ⏰ शेड्यूलर: 12:00 PM (BLOG STORY)
// ==========================================
exports.scheduledBlogStoryNoon = onSchedule({
    schedule: "0 12 * * *", 
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] 
}, async () => {
    await createStoryFromOldest('blogs', 'blog');
});

// ==========================================
// ⏰ शेड्यूलर: 9:00 PM (BLOG STORY)
// ==========================================
exports.scheduledBlogStoryNight = onSchedule({
    schedule: "0 21 * * *", 
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] 
}, async () => {
    await createStoryFromOldest('blogs', 'blog');
});

// ==========================================
// ⏰ शेड्यूलर: सुबह 10:00 AM (MOCK TEST STORY)
// ==========================================
exports.scheduledMockStoryMorning = onSchedule({
    schedule: "0 10 * * *", 
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    secrets: ["SERVICE_ACCOUNT_JSON", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] 
}, async () => {
    await createStoryFromOldest('mock_tests', 'mocktest'); 
});

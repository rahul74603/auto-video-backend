require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const sharp = require("sharp");

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
// bucket hata diya — Firebase Storage Spark pe band, ab cpanel_storage.js use hota hai

// ==========================================
// 🛠️ HELPERS
// ==========================================
function createSlug(title) {
    return title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
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
        console.log("🚀 Google Indexing API:", url);
    } catch (err) {
        console.error("❌ Indexing Error:", err.message);
    }
}

// ==========================================
// 🖼️ RELIABLE IMAGE SOURCES
// ==========================================

// Multiple reliable image sources with fallbacks
const EDUCATION_IMAGES = {
    'railway': [
        'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1474487548417-781cb6d646b3?w=1080&h=1920&fit=crop'
    ],
    'ssc': [
        'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=1080&h=1920&fit=crop'
    ],
    'banking': [
        'https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1080&h=1920&fit=crop'
    ],
    'police': [
        'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1453873531674-2151bcd01707?w=1080&h=1920&fit=crop'
    ],
    'exam': [
        'https://images.unsplash.com/photo-1588702547923-7093a6c3ba33?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1080&h=1920&fit=crop'
    ],
    'education': [
        'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?w=1080&h=1920&fit=crop'
    ],
    'default': [
        'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=1080&h=1920&fit=crop'
    ]
};

function getImageCategory(title, category) {
    const text = (title + ' ' + category).toLowerCase();
    if (text.includes('railway') || text.includes('rrb') || text.includes('ntpc')) return 'railway';
    if (text.includes('ssc') || text.includes('cgl') || text.includes('chsl')) return 'ssc';
    if (text.includes('bank') || text.includes('ibps') || text.includes('sbi')) return 'banking';
    if (text.includes('police') || text.includes('constable')) return 'police';
    if (text.includes('exam') || text.includes('test') || text.includes('mock')) return 'exam';
    if (text.includes('education') || text.includes('study')) return 'education';
    return 'default';
}

async function generateVerticalStoryImage(title, category) {
    const imgCat = getImageCategory(title, category);
    const imageList = EDUCATION_IMAGES[imgCat] || EDUCATION_IMAGES['default'];

    // Try each image source
    for (const imgUrl of imageList) {
        try {
            console.log(`🎨 Downloading image: ${imgUrl}`);
            const imgRes = await axios.get(imgUrl, {
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: { "User-Agent": "Mozilla/5.0" }
            });

            // Sharp se WebP convert
            const webpBuffer = await sharp(Buffer.from(imgRes.data, 'binary'))
                .resize(1080, 1920, { fit: 'cover', position: 'center' })
                .webp({ quality: 85, effort: 4 })
                .toBuffer();

            console.log(`✅ WebP: ${(webpBuffer.length / 1024).toFixed(1)} KB`);

            // cPanel upload (FREE — Firebase Storage Spark pe band ho gaya)
            const fileName = `uploads/web_stories_images/story_${Date.now()}.webp`;
            const webpUrl = await require("./cpanel_storage").uploadBuffer(webpBuffer, fileName);

            console.log("✅ Image Uploaded (cPanel):", webpUrl);
            return { url: webpUrl, width: 1080, height: 1920, type: 'image/webp' };

        } catch (imgError) {
            console.error(`❌ Image source failed: ${imgError.message}`);
            continue;
        }
    }

    // Final fallback
    return {
        url: "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=1080&h=1920&fit=crop",
        width: 1080,
        height: 1920,
        type: 'image/jpeg'
    };
}

// ==========================================
// 📖 STORY SLIDES GENERATOR
// ==========================================
function generateBlogSlides(data, title, applyLink) {
    const desc = data.description || data.metaDescription || '';
    const category = data.category || 'Education';
    const author = data.author || 'Rahul Sir';

    // Description को sentences में तोड़ो
    const sentences = desc.split(/[।.!?]+/).filter(s => s.trim().length > 10);

    // Slides data array
    const slides = [];

    // Slide 1: Cover (image के साथ)
    slides.push({
        type: 'cover',
        title: title,
        subtitle: category,
        badge: '📝 NEW BLOG POST'
    });

    // Slide 2: Key Info
    slides.push({
        type: 'info',
        heading: '📌 About This Article',
        lines: [
            `📁 Category: ${category}`,
            `✍️ By: ${author}`,
            `🌐 Source: StudyGyaan.in`,
            `📅 Latest Update Available`
        ]
    });

    // Slide 3: Description Part 1
    if (sentences.length > 0) {
        slides.push({
            type: 'content',
            heading: '📰 Key Highlights',
            lines: sentences.slice(0, 3).map(s => `• ${s.trim()}`)
        });
    }

    // Slide 4: More Content
    if (sentences.length > 3) {
        slides.push({
            type: 'content',
            heading: '📋 More Details',
            lines: sentences.slice(3, 6).map(s => `• ${s.trim()}`)
        });
    } else {
        slides.push({
            type: 'content',
            heading: '✅ Why Read This?',
            lines: [
                '• Complete & Accurate Information',
                '• Easy Hindi + English Explanation',
                '• Free PDF Download Available',
                '• Updated for 2025 Exams'
            ]
        });
    }

    // Slide 5: CTA
    slides.push({
        type: 'cta',
        heading: '🚀 Get Full Details FREE!',
        lines: [
            '✅ Free PDF Notes',
            '✅ Online Mock Tests',
            '✅ Daily Job Updates',
            '✅ Previous Year Papers'
        ],
        ctaText: 'Read Full Article',
        ctaLink: applyLink
    });

    return slides;
}

function generateMockSlides(data, title, applyLink) {
    const totalQ = data.totalQuestions || (data.questions ? data.questions.length : 50);
    const duration = data.durationMinutes || 30;
    const subject = data.subject || data.category || 'General Knowledge';

    const slides = [];

    // Slide 1: Cover
    slides.push({
        type: 'cover',
        title: title,
        subtitle: `${subject} Mock Test`,
        badge: '🎯 FREE MOCK TEST'
    });

    // Slide 2: Test Info
    slides.push({
        type: 'stats',
        heading: '📊 Test Overview',
        stats: [
            { icon: '📝', value: String(totalQ), label: 'Questions' },
            { icon: '⏱️', value: String(duration), label: 'Minutes' },
            { icon: '🏆', value: 'FREE', label: 'Cost' },
            { icon: '📱', value: 'Online', label: 'Mode' }
        ]
    });

    // Slide 3: Topics Covered
    slides.push({
        type: 'content',
        heading: '📚 Topics Covered',
        lines: [
            `• ${subject} Important Questions`,
            '• Previous Year Expected MCQs',
            '• Bilingual Hindi + English',
            '• With Timer & Explanation',
            '• Exam-Level Difficulty'
        ]
    });

    // Slide 4: Who Should Attempt
    slides.push({
        type: 'content',
        heading: '🎯 Best For These Exams',
        lines: [
            '• SSC CGL, CHSL, MTS 2025',
            '• RRB NTPC, Group D 2025',
            '• Bank PO, Clerk 2025',
            '• Police Bharti 2025',
            '• All State Exams 2025'
        ]
    });

    // Slide 5: CTA
    slides.push({
        type: 'cta',
        heading: '🚀 Attempt Test FREE Now!',
        lines: [
            '✅ No Registration Required',
            '✅ Instant Result & Score',
            '✅ Detailed Explanation',
            '✅ Free Certificate'
        ],
        ctaText: 'Start Mock Test FREE',
        ctaLink: applyLink
    });

    return slides;
}

// ==========================================
// 🛠️ MASTER FUNCTION
// ==========================================
async function createStoryFromOldest(collectionName, storyType) {
    try {
        const snapshot = await db.collection(collectionName).get();

        let targetDoc = null;
        for (let docItem of snapshot.docs) {
            const data = docItem.data();
            if (data.isStoryCreated !== true && data.isStoryCreated !== "true") {
                targetDoc = docItem;
                break;
            }
        }

        if (!targetDoc) {
            console.log(`✅ No pending ${collectionName} for stories.`);
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
        const description = data.metaDescription || data.description
            || `Attempt this free ${storyType} on StudyGyaan.`;

        // ✅ Reliable image generate
        const imgData = await generateVerticalStoryImage(finalTitle, data.category || storyType);

        // ✅ Generate slides data
        const slides = storyType === 'blog'
            ? generateBlogSlides(data, finalTitle, applyLink)
            : generateMockSlides(data, finalTitle, applyLink);

        // ✅ Firestore में save करो
        await db.collection("web_stories").doc(storySlug).set({
            title: finalTitle,
            slug: storySlug,
            description: description,
            tags: data.tags || ["studygyaan", storyType, "education"],
            coverImage: imgData.url,
            coverImageWidth: imgData.width,
            coverImageHeight: imgData.height,
            coverImageType: imgData.type,
            applyLink: applyLink,
            organization: data.organization || "StudyGyaan",
            vacancies: data.vacancies || "Check Now",
            lastDate: data.lastDate || "Apply Fast",
            category: data.category || "Education",
            author: data.author || "Rahul Sir",
            storyType: storyType,
            // 🆕 Slides data save करो
            slides: slides,
            questions: data.totalQuestions || (data.questions ? data.questions.length : "50"),
            duration: data.durationMinutes || "30",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // ✅ Original doc mark करो
        await db.collection(collectionName).doc(doc.id).update({
            isStoryCreated: true
        });

        // ⭐ Auto-optimizer: fire-and-forget quality pass after publish.
        // WEB_STORY is metadata-only by design; optimizer failure NEVER
        // blocks the publish.
        try {
            const { triggerOptimizerNonBlocking } = require("./agents/seo_intelligence/publish_hook");
            triggerOptimizerNonBlocking(db, admin.firestore.FieldValue, {
                id: storySlug, slug: storySlug, title: finalTitle, type: "WEB_STORY",
                description, category: data.category || "Education", author: data.author || "Rahul Sir",
                createdAt: new Date().toISOString()
            }, "web_stories");
        } catch (optErr) {
            console.warn("⚠️ Optimizer hook skipped (non-blocking):", optErr.message);
        }

        console.log(`✅ Story created: ${storySlug} | Slides: ${slides.length}`);

        // ✅ Google Indexing
        await notifyGoogle(storyUrl);

        // ✅ Telegram
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (botToken && chatId) {
            const badge = storyType === 'blog' ? "📱 BLOG STORY" : "🎯 MOCK TEST STORY";
            const msg = `<b>${badge} [${slides.length} Slides ✅]</b>\n\n${finalTitle}\n\n🔗 <a href="${storyUrl}">${storyUrl}</a>`;
            await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                chat_id: chatId,
                text: msg,
                parse_mode: 'HTML'
            }).catch(e => console.log("Telegram Error:", e.message));
        }

        return storySlug;

    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return null;
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
        message: "Blog Story Created",
        generatedStory: storySlug || "No pending blogs"
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
        message: "Blog Story Created",
        generatedStory: storySlug || "No pending blogs"
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
        message: "Mock Test Story Created",
        generatedStory: storySlug || "No pending mock tests"
    });
});

// ==========================================
// ✅ Direct Run
// ==========================================
if (require.main === module) {
    const action = process.argv[2] || "blog";
    const collection = action === "mocktest" ? "mock_tests" : "blogs";
    const storyType = action === "mocktest" ? "mocktest" : "blog";

    console.log(`🚀 Running: ${storyType}`);
    createStoryFromOldest(collection, storyType)
        .then(slug => {
            console.log(`✅ Done: ${slug || "No pending"}`);
            process.exit(0);
        })
        .catch(err => {
            console.error(`❌ Failed: ${err.message}`);
            process.exit(1);
        });
}

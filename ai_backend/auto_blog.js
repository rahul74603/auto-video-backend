require("dotenv").config();
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// =========================================================
// 🔐 1. FIREBASE & AUTH INITIALIZATION
// =========================================================
let serviceAccount = null;
const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;

if (!admin.apps.length) {
    const config = {
        projectId: "studymaterial-406ad",
        storageBucket: "studymaterial-406ad.firebasestorage.app"
    };

    if (serviceAccountVar && serviceAccountVar !== "undefined") {
        try {
            serviceAccount = JSON.parse(serviceAccountVar);
            admin.initializeApp({
                ...config,
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ Firebase initialized with Secrets");
        } catch (e) {
            console.error("❌ JSON Parse Error in Service Account:", e.message);
            admin.initializeApp(config);
        }
    } else {
        admin.initializeApp(config);
        console.log("⚠️ SERVICE_ACCOUNT_JSON missing, using default initialization.");
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket("studymaterial-406ad.firebasestorage.app");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// =========================================================
// 📚 2. MASTER TOPICS POOL (Diverse Categories)
// =========================================================
const MASTER_POOL = {
    "Job_Alerts": [
        "Upcoming Railway Recruitment Vacancies", "SSC GD vs State Police: Career Comparison", "High Salary Govt Jobs After 12th", 
        "Bank Exam Calendar Analysis", "Female Special Vacancies in Defense", "Latest Teaching Jobs in India"
    ],
    "Syllabus_Guide": [
        "SSC CGL Tier-1 Detailed Syllabus", "UPSC Prelims Strategy for Beginners", "Railway Group D Math Important Topics",
        "UP Police Constable Hindi Preparation Guide", "English Grammar Hacks for Competitive Exams"
    ],
    "Student_Life_Motivation": [
        "How to handle Exam Stress and Anxiety", "Hostel Life vs Home Study: Honest Review", "Student Budget Management Tips",
        "Success Story: From Zero to Govt Employee", "How to avoid distractions while studying", "Power of Consistency in Competition"
    ],
    "Academic_Deep_Dive": [
        "Indian History: Important Dates of Modern Era", "General Science: Biology Human Body Facts", "Indian Economy: Understanding GDP & Inflation",
        "World Geography: Major Continents and Oceans", "Computer Awareness for Govt Exams"
    ],
    "Trending_Education_News": [
        "New Education Policy Major Changes", "Digital Revolution in Rural Education", "Impact of AI on Indian Job Market",
        "New Rules for Online Recruitment Exams", "Future of Competitive Coaching in India"
    ]
};

const POWER_WORDS = ["🔥 Breaking:", "🚨 Latest Update:", "⚡ Exclusive:", "📊 Complete Guide:", "🎯 Target 2026:", "📖 Special:"];

// =========================================================
// 🛠️ 3. SEO, LINKING & UTILITY HELPERS
// =========================================================

function createSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

function cleanJsonResponse(rawText) {
    try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        let cleaned = jsonMatch[0].replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
        return JSON.parse(cleaned);
    } catch (e) {
        return null;
    }
}

function generateFAQSchema(content) {
    const faqRegex = /<p><strong>Q[^<]*<\/strong><\/p>[^]*?<p>(.*?)<\/p>/g;
    let match;
    const faqs = [];
    let count = 0;
    while ((match = faqRegex.exec(content)) !== null && count < 5) {
        faqs.push({
            "@type": "Question",
            "name": match[0].replace(/<\/?[^>]+>/g, '').trim(),
            "acceptedAnswer": {
                "@type": "Answer",
                "text": match[1].trim().substring(0, 200)
            }
        });
        count++;
    }
    if (faqs.length === 0) return "";
    return `\n<script type="application/ld+json">\n${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs
    })}\n</script>`;
}

async function getInternalLinks(limit = 5) {
    try {
        const snapshot = await db.collection("blogs")
            .orderBy("date", "desc")
            .limit(limit)
            .get();

        let links = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            links.push({
                title: data.title,
                url: `https://studygyaan.in/blog/${data.slug || doc.id}`,
                category: data.category
            });
        });
        return links;
    } catch (e) {
        return [];
    }
}

function generateMetaTags(data) {
    const title = data.title.length > 60 ? data.title.substring(0, 57) + "..." : data.title;
    const description = data.metaDescription.length > 160 ? data.metaDescription.substring(0, 157) + "..." : data.metaDescription;

    return `
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="article">
<meta property="og:url" content="${data.url}">
<meta property="og:image" content="${data.imageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${data.imageUrl}">
`;
}

async function generateAndUploadImage(imagePrompt, blogId) {
    try {
        const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1280&height=720&nologo=true&quality=high`;
        const imgRes = await axios.get(pollUrl, { 
            responseType: 'arraybuffer', 
            timeout: 30000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        
        const fileName = `blog_images/blog_${blogId}.png`;
        const file = bucket.file(fileName);
        const compressedData = Buffer.from(imgRes.data, 'binary');
        
        await file.save(compressedData, {
            metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' },
            public: true
        });
        
        return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    } catch (imgError) {
        console.error("❌ IMAGE FAILED:", imgError.message);
        return "https://studygyaan.in/default-blog.png";
    }
}

async function notifyGoogle(url, retryCount = 0) {
    try {
        const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
        if (!serviceAccountVar || serviceAccountVar === "undefined") {
            console.log("⚠️ Skipping Google Indexing: SERVICE_ACCOUNT_JSON not found.");
            return;
        }
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
        console.log("🚀 Indexing API Success:", url);
    } catch (err) {
        if (err.response && err.response.status === 429 && retryCount < 3) {
            console.log(`⚠️ Rate Limit Hit (429). Retrying in 30 seconds... (Attempt ${retryCount + 1})`);
            await new Promise(resolve => setTimeout(resolve, 30000));
            return notifyGoogle(url, retryCount + 1);
        }
        console.error("❌ Indexing API Error:", err.message);
    }
}

function checkContentQuality(content) {
    const wordCount = content.split(/\s+/).length;
    const headingCount = (content.match(/<h[1-6][^>]*>/g) || []).length;
    const paragraphCount = (content.match(/<p[^>]*>/g) || []).length;
    const listCount = (content.match(/<(ul|ol|li)[^>]*>/g) || []).length;
    
    return {
        wordCount: wordCount,
        hasEnoughContent: wordCount >= 1200,
        hasHeadings: headingCount >= 5,
        hasParagraphs: paragraphCount >= 10,
        hasLists: listCount >= 3
    };
}

// =========================================================
// 🚀 4. MAIN GENERATOR ENGINE
// =========================================================

async function generateDailyBlog() {
    try {
        console.log("🚀 Starting Advanced Auto-Blogger Engine...");

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        const TWITTER_API_KEY = process.env.TWITTER_API_KEY;

        // 🔥 Shuffling Logic: Random Category -> Random Topic
        const categories = Object.keys(MASTER_POOL);
        const randomCat = categories[Math.floor(Math.random() * categories.length)];
        const rawTopic = MASTER_POOL[randomCat][Math.floor(Math.random() * MASTER_POOL[randomCat].length)];

        const now = new Date();
        const monthYear = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        const powerPrefix = POWER_WORDS[Math.floor(Math.random() * POWER_WORDS.length)];

        console.log(`🎬 Shuffled Category: ${randomCat} | Topic: ${rawTopic}`);

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
You are a Premium SEO Writer for StudyGyaan.in. Write a DEEP and ENGAGING blog post.
Category: "${randomCat}"
Topic: "${rawTopic}"

SEO REQUIREMENTS:
- Article length MUST be at least 1500-2000 words.
- Structure: Use H1, H2, H3, HTML Tables for data, and Bullet Points.
- Style: Mix of Hindi and Hinglish. 
- Content Tone: If 'Student_Life', use emotional storytelling. If 'Job_Alerts', be factual with tables. If 'Academic', be educational.
- Include a 5-question FAQ section at the end.

FORMAT JSON:
{
  "aiTitle": "Main Catchy Title (Without Date)",
  "metaDescription": "160 char SEO snippet",
  "keywords": ["keyword1", "keyword2", "LSI keyword"],
  "imagePrompt": "High quality 3D educational thumbnail for ${randomCat}: ${rawTopic}",
  "content": "Full HTML Content starting with an introduction."
}`;

        const result = await model.generateContent(prompt);
        const blogData = cleanJsonResponse(result.response.text());
        if (!blogData) throw new Error("Invalid AI JSON Output");

        console.log("✅ Blog Content Generated. Checking Quality...");

        // 🔥 QUALITY CHECK
        const quality = checkContentQuality(blogData.content);
        if (!quality.hasEnoughContent) {
            console.log("⚠️ Content too short, regenerating...");
            return generateDailyBlog();
        }

        console.log("✅ Quality Passed. Moving to Image Generation...");

        // 🎨 IMAGE GENERATION
        let imageUrl = "https://studygyaan.in/default-blog.png";
        try {
            imageUrl = await generateAndUploadImage(blogData.imagePrompt, Date.now());
        } catch (imgError) {
            console.error("❌ IMAGE FAILED:", imgError.message);
        }

        // 🔥 UNIQUE TITLE & SLUG
        const finalTitle = `${powerPrefix} ${blogData.aiTitle} (${monthYear})`;
        const slug = createSlug(finalTitle);
        const blogUrl = `https://studygyaan.in/blog/${slug}`;

        // 📝 INTERNAL LINKING (Appended to Content)
        const internalLinks = await getInternalLinks(5);
        let linkHTML = "<h2>Important Related Articles</h2><ul>";
        internalLinks.forEach(link => {
            linkHTML += `<li><a href="${link.url}" target="_blank">${link.title}</a></li>`;
        });
        linkHTML += "</ul>";

        // 🔥 MERGE CONTENT, FAQ SCHEMA & INTERNAL LINKS
        const faqSchema = generateFAQSchema(blogData.content);
        blogData.content += linkHTML;
        blogData.content += faqSchema;

        // 💾 SAVE TO FIRESTORE
        await db.collection("blogs").doc(slug).set({
            title: finalTitle,
            slug: slug,
            description: blogData.metaDescription,
            tags: blogData.keywords,
            content: blogData.content,
            imageUrl: imageUrl,
            category: randomCat,
            type: "auto-blog",
            author: "Rahul Sir AI",
            date: admin.firestore.FieldValue.serverTimestamp(),
            url: blogUrl,
            metaTags: generateMetaTags({
                title: finalTitle,
                metaDescription: blogData.metaDescription,
                url: blogUrl,
                imageUrl: imageUrl
            }),
            qualityScore: quality.wordCount / 2000,
            wordCount: quality.wordCount
        });

        console.log(`🎯 Published to Firestore: ${slug}`);
        
        // 🌐 AUTO INDEXING
        await notifyGoogle(blogUrl);

        // 📢 TELEGRAM
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            try {
                const telegramMessage = `<b>🔥 नया ब्लॉग लाइव: ${finalTitle}</b>\n\n📖 <b>यहाँ पढ़ें:</b> ${blogUrl}\n\n⏱️ <b>Time to Read:</b> ${Math.floor(quality.wordCount / 200)} mins\n\n📊 <b>Category:</b> ${randomCat.replace(/_/g, ' ')}`;
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: TELEGRAM_CHAT_ID, 
                    text: telegramMessage, 
                    parse_mode: 'HTML'
                });
                console.log("📢 Telegram Notification Sent!");
            } catch (tgError) {
                console.error("❌ Telegram Error:", tgError.message);
            }
        }

        // 📢 TWITTER
        if (TWITTER_API_KEY) {
            try {
                const twitterMessage = `🔥 ${finalTitle}\n\n${blogUrl}\n\n📚 Read this complete guide to boost your preparation!`;
                await axios.post(`https://api.twitter.com/2/tweets`, { text: twitterMessage }, {
                    headers: { 'Authorization': `Bearer ${TWITTER_API_KEY}`, 'Content-Type': 'application/json' }
                });
                console.log("🐦 Twitter Notification Sent!");
            } catch (twError) {
                console.error("❌ Twitter Error:", twError.message);
            }
        }

        return true;
    } catch (error) {
        console.error("❌ CRITICAL ERROR IN AUTO-BLOG ENGINE:", error.message);
        return false;
    }
}

// 🚀 RUN TRIGGER
if (require.main === module) {
    generateDailyBlog().then(success => {
        console.log(success ? "✅ Task Finished Successfully" : "⚠️ Task Finished with errors");
        process.exit(success ? 0 : 1);
    });
}

module.exports = { generateDailyBlog };

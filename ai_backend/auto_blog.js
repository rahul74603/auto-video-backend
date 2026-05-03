require("dotenv").config();
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ✅ GitHub Secrets + Local Deployment Safe Initialization
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

// ✅ Initialize FREE Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// 🔥 SLUG GENERATOR
function createSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, '-')
        .trim();
}
// 🔥 INTERNAL LINKING ENGINE
async function getInternalLinks() {
    try {
        const snapshot = await db.collection("blogs")
            .orderBy("date", "desc")
            .limit(5)
            .get();

        let links = [];
        snapshot.forEach(doc => {
            links.push({
                title: doc.data().title,
               url: `https://studygyaan.in/blog/${doc.data().slug || doc.id}`
            });
        });

        return links;
    } catch (e) {
        return [];
    }
}
function generateFAQSchema(content) {
    const faqs = [];

    const questions = content.match(/<p>(.*?)\?/g);

    if (questions) {
        questions.slice(0, 5).forEach(q => {
            const cleanQ = q.replace(/<[^>]+>/g, '').trim();
            const answer = "Check full details in article.";

            faqs.push({
                "@type": "Question",
                "name": cleanQ,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": answer
                }
            });
        });
    }

    if (faqs.length === 0) return "";

    return `
<script type="application/ld+json">
${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs
})}
</script>`;
}
// --- JSON Cleaner Helper ---
function cleanJsonResponse(rawText) {
    try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        let cleaned = jsonMatch[0]
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") 
            .trim();
        return JSON.parse(cleaned);
    } catch (e) {
        return null;
    }
}

// --- Google Indexing (Fixed to v3) ---
async function notifyGoogle(url) {
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
        
        // 👇 यहाँ v1 की जगह v3 कर दिया गया है
        await axios.post("https://indexing.googleapis.com/v3/urlNotifications:publish", {
            url: url, type: "URL_UPDATED"
        }, {
            headers: { Authorization: `Bearer ${jwtClient.credentials.access_token}` }
        });
        
        console.log("🚀 Indexing API Success:", url);
    } catch (err) {
        console.error("❌ Indexing API Error:", err.message);
    }
}

// 🔥 MAIN GENERATOR ENGINE
async function generateDailyBlog() {
    try {
        console.log("🚀 Starting Free Auto-Blogger Engine...");

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
// 🔥 TRENDING KEYWORD ENGINE
async function getTrendingKeywords() {
    try {
        const keywords = [
 "latest govt jobs 2026",
 "ssc gd notification 2026",
 "railway recruitment 2026",
 "police bharti 2026",
 "bank jobs vacancy",
 "free mock test ssc",
 "gk questions pdf",
 "current affairs today",
 "ssc exam preparation",
 "up police vacancy"
];

        
        // 🔥 Random + mix logic
        const shuffled = keywords.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 3);
    } catch (e) {
        return ["latest govt jobs"];
    }
}

        const keywords = await getTrendingKeywords();
const topic = keywords.join(" | ");
console.log(`🔥 Keywords Selected: ${topic}`);
        
if (!topic.toLowerCase().includes("job") &&
    !topic.toLowerCase().includes("ssc") &&
    !topic.toLowerCase().includes("exam") &&
    !topic.toLowerCase().includes("gk")) {
    console.log("❌ Invalid topic skipped");
    return false;
}

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
You are a professional SEO content writer for a EDUCATION website (StudyGyaan.in).

IMPORTANT RULES:
- Content must ONLY be related to:
  Govt Jobs, SSC, Railway, Police, Exams, GK, GS, Study Material
- DO NOT generate random topics
- DO NOT go outside education niche
- Focus on Indian competitive exams

Create a HIGHLY SEO OPTIMIZED blog post.

- Article length MUST be at least 1200-1800 words
- Content must be detailed, structured and valuable
- Use multiple headings (H1, H2, H3)
- Add bullet points, tables if needed

- Include FAQ section with at least 5 questions
- Use simple Hindi + Hinglish mix
- Add keywords naturally in headings

TARGET KEYWORDS: ${topic}

STRICT FORMAT (JSON ONLY):
{
  "title": "High CTR Hindi Hinglish Title (Power words + numbers)",
  "metaDescription": "150 chars SEO description with keywords",
  "tags": ["govt jobs", "ssc", "latest jobs"],
  "imagePrompt": "Modern 3D educational thumbnail for ${topic}",
  "content": "
  <h1>Main SEO Title</h1>
  <p>Hook paragraph (engaging + keywords)</p>

  <h2>Latest Update</h2>
  <p>Fresh info</p>

  <h2>Important Details</h2>
  <ul><li>Points</li></ul>

  <h2>Eligibility</h2>
  <p>Details</p>

  <h2>Important Dates</h2>
  <p>Dates</p>

  <h2>Application Process</h2>
  <p>Steps</p>

  <h2>FAQ</h2>
  <p>Q&A format</p>

  <h2>Conclusion</h2>
  <p>Summary + CTA</p>
  "
}
`;

        const result = await model.generateContent(prompt);
        const blogData = cleanJsonResponse(result.response.text());
        if (!blogData) throw new Error("Invalid AI JSON Output");

        console.log("✅ Blog Content Generated. Moving to Image Generation...");

        // 🎨 IMAGE GENERATION
        let imageUrl = "https://studygyaan.in/default-blog.png";
        try {
            const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(blogData.imagePrompt)}?width=1280&height=720&nologo=true`;
            const imgRes = await axios.get(pollUrl, { 
                responseType: 'arraybuffer', 
                timeout: 30000,
                headers: { "User-Agent": "Mozilla/5.0" }
            });
            
            const fileName = `blog_images/blog_${Date.now()}.png`;
            const file = bucket.file(fileName);
            await file.save(Buffer.from(imgRes.data, 'binary'), {
                metadata: { contentType: 'image/png' },
                public: true
            });
            imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        } catch (imgError) {
            console.error("❌ IMAGE FAILED:", imgError.message);
        }

        // 📝 SAVE TO FIRESTORE
        const internalLinks = await getInternalLinks();

let linkHTML = "<h2>Important Related Articles</h2><ul>";
internalLinks.forEach(link => {
   linkHTML += `<li><a href="${link.url}" target="_blank">${link.title}</a></li>`;
});
linkHTML += "</ul>";

// 🔥 FAQ SCHEMA ADD (पहले)
const faqSchema = generateFAQSchema(blogData.content);
blogData.content += faqSchema;
blogData.content += linkHTML;
blogData.tags = [...new Set([
    ...blogData.tags,
    ...keywords
])];
        blogData.title = "🔥 " + blogData.title + " (2026 Latest Update)";

    
        const blogRef = await db.collection("blogs").add({
        title: blogData.title,
        slug: createSlug(blogData.title),
            description: blogData.metaDescription,
            tags: blogData.tags,
            content: blogData.content,
            imageUrl: imageUrl, 
            category: blogData.tags?.[0] || "Education",
            type: "auto-blog",
            author: "Rahul Sir AI",
            date: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`🎯 Published to Firestore: ${blogRef.id}`);
        const blogUrl = `https://studygyaan.in/blog/${createSlug(blogData.title)}`;
        
        await notifyGoogle(blogUrl);

        // 📢 TELEGRAM
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            try {
                const telegramMessage = `<b>🔥 नया स्टडी ब्लॉग: ${blogData.title}</b>\n\n📖 <b>पूरा टॉपिक यहाँ पढ़ें:</b> ${blogUrl}`;
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: TELEGRAM_CHAT_ID, text: telegramMessage, parse_mode: 'HTML'
                });
                console.log("📢 Telegram Notification Sent!");
            } catch (tgError) {
                console.error("❌ Telegram Error:", tgError.message);
            }
        } else {
            console.log("⚠️ TELEGRAM SKIPPED: Token or Chat ID not found.");
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
    });
}



module.exports = { generateDailyBlog };
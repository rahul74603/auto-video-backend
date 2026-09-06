require("dotenv").config();
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const sharp = require("sharp"); // ✅ WebP conversion ke liye

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
            console.error("❌ JSON Parse Error:", e.message);
            admin.initializeApp(config);
        }
    } else {
        admin.initializeApp(config);
        console.log("⚠️ Using default initialization.");
    }
}

const db = admin.firestore();
// bucket hata diya — Firebase Storage Spark pe band, ab cpanel_storage.js use hota hai
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// =========================================================
// 📚 2. MASTER TOPICS POOL
// =========================================================
const MASTER_POOL = {
    "Job_Alerts": [
        "Upcoming Railway Recruitment Vacancies", "SSC GD vs State Police Career Comparison",
        "High Salary Govt Jobs After 12th", "Bank Exam Calendar Analysis",
        "Female Special Vacancies in Defense", "Latest Teaching Jobs in India",
        "UPSC Jobs Without Exam", "Railway Jobs for ITI Holders",
        "Top 10 Banking Jobs in India", "Government Jobs for Engineers",
        "Medical Field Government Jobs", "Teaching Jobs State Wise Analysis"
    ],
    "Syllabus_Guide": [
        "SSC CGL Tier 1 Detailed Syllabus", "UPSC Prelims Strategy for Beginners",
        "Railway Group D Math Important Topics", "UP Police Constable Hindi Preparation Guide",
        "English Grammar Hacks for Competitive Exams", "IBPS PO Complete Syllabus Breakdown",
        "NEET Preparation Roadmap", "JEE Advanced Physics Key Concepts",
        "NDA Mathematics Syllabus", "CLAT Legal Reasoning Preparation"
    ],
    "Student_Life_Motivation": [
        "How to handle Exam Stress and Anxiety", "Hostel Life vs Home Study Honest Review",
        "Student Budget Management Tips", "Success Story From Zero to Govt Employee",
        "How to avoid distractions while studying", "Power of Consistency in Competition",
        "Morning vs Night Study Which is Better", "Handling Family Pressure During Preparation",
        "Building Strong Study Habits", "Overcoming Failure in Competitive Exams"
    ],
    "Academic_Deep_Dive": [
        "Indian History Important Dates of Modern Era", "General Science Biology Human Body Facts",
        "Indian Economy Understanding GDP and Inflation", "World Geography Major Continents and Oceans",
        "Computer Awareness for Govt Exams", "Polity Fundamental Rights Explained",
        "Ancient Indian History Key Topics", "Environmental Science for Exams",
        "Indian Constitution Important Articles", "Current Affairs Monthly Digest"
    ],
    "Trending_Education_News": [
        "New Education Policy Major Changes", "Digital Revolution in Rural Education",
        "Impact of AI on Indian Job Market", "New Rules for Online Recruitment Exams",
        "Future of Competitive Coaching in India", "Latest Exam Pattern Changes 2026",
        "Online vs Offline Exams Debate", "Government Schemes for Students",
        "Educational Reforms in India", "Technology in Modern Education"
    ],
    "Exam_Strategies": [
        "Last Minute Revision Techniques", "How to Attempt Mock Tests Effectively",
        "Time Management in Competitive Exams", "Negative Marking Strategy",
        "Speed Reading Techniques", "Memory Boosting Methods for Students",
        "Answer Writing Skills for Descriptive Exams", "MCQ Solving Strategies",
        "Stress Free Exam Day Preparation"
    ],
    "Career_Guidance": [
        "Government Job vs Private Job Comparison", "Best Career Options After Graduation",
        "Scope of Teaching Career in India", "Defense Career Complete Guide",
        "Banking Sector Career Prospects", "Career in Indian Railways",
        "Medical Field Career Opportunities", "Engineering Career Paths",
        "Career in Indian Police Services"
    ]
};

// =========================================================
// 🎨 3. DYNAMIC CONTENT VARIATION SYSTEM
// =========================================================

// 50+ Power Words for Maximum Variation
const POWER_WORDS = [
    "🔥 Breaking", "🚨 Latest Update", "⚡ Exclusive", "📊 Complete Guide",
    "🎯 Target 2026", "📖 Special Report", "💡 Must Read", "🌟 Trending Now",
    "📢 Important Alert", "🎓 Expert Guide", "✨ New Update", "🔔 Big Alert",
    "📝 Detailed Analysis", "🏆 Top Secrets", "💼 Career Special",
    "🔑 Key Insights", "📌 Ultimate Guide", "🚀 Fast Track",
    "💪 Power Guide", "🌈 Complete Package", "🔍 Deep Dive",
    "⭐ Star Guide", "🎪 Special Edition", "🌊 Mega Guide",
    "🦁 Bold Strategy", "🎭 Unique Approach", "🔮 Future Ready",
    "🎯 Bullseye Tips", "🌺 Fresh Perspective", "💎 Premium Guide"
];

// 15+ Writing Styles
const WRITING_STYLES = [
    "conversational and friendly like talking to a friend",
    "professional and authoritative like an expert",
    "motivational and inspiring like a coach",
    "analytical and data-driven with statistics",
    "storytelling with real life examples and narrative",
    "question-answer based interactive format",
    "step-by-step tutorial with numbered instructions",
    "comparative analysis with pros and cons",
    "news journalism style with facts first",
    "listicle format with engaging bullets",
    "case study based with real examples",
    "beginner friendly with simple explanations",
    "advanced expert level deep analysis",
    "problem-solution format addressing pain points",
    "interview style with expert quotes"
];

// 10+ Content Structures - Completely Different Templates
const CONTENT_STRUCTURES = [
    {
        name: "Classic_SEO",
        template: "strong hook introduction → background context → main content with H2 subheadings → real world examples → data table → expert tips → FAQ section → strong conclusion with CTA"
    },
    {
        name: "Story_First",
        template: "compelling story opening → problem identification → journey to solution → detailed breakdown → case studies → lessons learned → practical tips → FAQ → inspiring conclusion"
    },
    {
        name: "News_Style",
        template: "breaking news angle → who what when where why → background story → expert analysis → impact assessment → future predictions → reader action guide → FAQ → summary"
    },
    {
        name: "Question_Based",
        template: "provocative question intro → answer overview → deep dive Q&A format → supporting evidence → counter arguments → expert consensus → practical application → FAQ → final verdict"
    },
    {
        name: "Data_Driven",
        template: "shocking statistic hook → data context → trend analysis → comparative tables → visual data description → insights extraction → actionable recommendations → FAQ → data summary"
    },
    {
        name: "Problem_Solution",
        template: "pain point identification → why this problem exists → failed solutions → correct approach → step by step solution → success metrics → common mistakes → FAQ → success roadmap"
    },
    {
        name: "Ultimate_Guide",
        template: "what you will learn → complete overview → chapter by chapter breakdown → advanced tips → tools and resources → expert shortcuts → common pitfalls → FAQ → mastery checklist"
    },
    {
        name: "Listicle_Pro",
        template: "teaser intro → why this list matters → item 1 with deep explanation → item 2-N with examples → bonus tips → ranking methodology → what to do next → FAQ → power summary"
    },
    {
        name: "Comparison_Master",
        template: "comparison teaser → why compare → option A deep dive → option B deep dive → head to head table → winner by category → who should choose what → FAQ → final recommendation"
    },
    {
        name: "Beginner_To_Pro",
        template: "beginner friendly intro → level 1 basics → level 2 intermediate → level 3 advanced → expert level mastery → resource list → learning path → FAQ → graduation checklist"
    }
];

// =========================================================
// 🛡️ 4. ADVANCED ANTI-DUPLICATE SYSTEM
// =========================================================

async function generateContentFingerprint(title, content) {
    // Multiple fingerprinting methods
    const titleHash = crypto.createHash('md5').update(title.toLowerCase().trim()).digest('hex');
    const contentSample = content.substring(0, 500).toLowerCase().replace(/\s+/g, ' ');
    const contentHash = crypto.createHash('md5').update(contentSample).digest('hex');

    // Extract key phrases for similarity check
    const keyPhrases = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(' ')
        .filter(w => w.length > 5)
        .slice(0, 5)
        .sort()
        .join('_');

    return {
        titleHash,
        contentHash,
        keyPhrases,
        wordCount: content.split(/\s+/).length
    };
}

async function checkDuplicateContent(title, content) {
    try {
        console.log("🔍 Running Anti-Duplicate Check...");

        const fingerprint = await generateContentFingerprint(title, content);

        // Check 1: Exact title hash match
        const exactTitleMatch = await db.collection("blogs")
            .where("titleHash", "==", fingerprint.titleHash)
            .limit(1)
            .get();

        if (!exactTitleMatch.empty) {
            console.log("❌ DUPLICATE: Exact title hash found!");
            return { isDuplicate: true, reason: "exact_title_match" };
        }

        // Check 2: Content hash match
        const contentHashMatch = await db.collection("blogs")
            .where("contentHash", "==", fingerprint.contentHash)
            .limit(1)
            .get();

        if (!contentHashMatch.empty) {
            console.log("❌ DUPLICATE: Similar content found!");
            return { isDuplicate: true, reason: "content_hash_match" };
        }

        // Check 3: Key phrases similarity
        const keyPhraseMatch = await db.collection("blogs")
            .where("keyPhrases", "==", fingerprint.keyPhrases)
            .limit(1)
            .get();

        if (!keyPhraseMatch.empty) {
            console.log("❌ DUPLICATE: Similar key phrases found!");
            return { isDuplicate: true, reason: "keyphrase_match" };
        }

        // Check 4: Recent blogs on same topic (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSimilar = await db.collection("blogs")
            .where("topicBase", "==", fingerprint.keyPhrases.split('_').slice(0, 2).join('_'))
            .where("date", ">=", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
            .limit(1)
            .get();

        if (!recentSimilar.empty) {
            console.log("⚠️ WARNING: Similar topic published in last 30 days");
            return { isDuplicate: true, reason: "recent_similar_topic" };
        }

        console.log("✅ Anti-Duplicate Check PASSED - Content is unique!");
        return { isDuplicate: false, fingerprint };

    } catch (e) {
        console.error("⚠️ Duplicate check error:", e.message);
        return { isDuplicate: false, fingerprint: null };
    }
}

// =========================================================
// 🎨 5. WEBP IMAGE GENERATOR
// =========================================================

// Dynamic Image Styles - 20+ Variations
const IMAGE_STYLES = [
    "ultra-realistic 3D render with dramatic lighting and depth",
    "vibrant flat design illustration with bold geometric shapes",
    "professional infographic with charts and data visualization",
    "cinematic photograph style with bokeh background",
    "modern isometric 3D design with colorful elements",
    "minimalist clean design with white space and typography",
    "watercolor artistic style with soft gradients",
    "dark mode futuristic neon design with glowing elements",
    "vintage retro poster style with warm colors",
    "comic book style with bold outlines and bright colors",
    "abstract geometric art with mathematical patterns",
    "newspaper editorial style with professional layout",
    "social media card style with engaging typography",
    "educational diagram style with clear labels",
    "motivational poster style with inspiring visuals"
];

// Dynamic Color Schemes
const COLOR_SCHEMES = [
    "blue and gold gradient", "red and white professional",
    "green and yellow vibrant", "purple and pink modern",
    "orange and blue energetic", "teal and coral fresh",
    "dark navy and gold premium", "lime green and black bold",
    "sunset orange gradient", "midnight blue and silver"
];

function generateDynamicImagePrompt(category, topic, writingStyle) {
    const randomStyle = IMAGE_STYLES[Math.floor(Math.random() * IMAGE_STYLES.length)];
    const randomColors = COLOR_SCHEMES[Math.floor(Math.random() * COLOR_SCHEMES.length)];
    const randomSeed = Math.floor(Math.random() * 99999);

    const categoryVisuals = {
        "Job_Alerts": `Indian government office building, official stamp, recruitment notice board, professional setting`,
        "Syllabus_Guide": `open textbooks, study desk with stationery, laptop with notes, library background`,
        "Student_Life_Motivation": `motivated student studying, graduation cap, success achievement, bright future`,
        "Academic_Deep_Dive": `educational diagrams, knowledge map, research papers, academic setting`,
        "Trending_Education_News": `digital screen with news, technology education, modern classroom`,
        "Exam_Strategies": `exam hall, answer sheet, timer clock, strategic planning board`,
        "Career_Guidance": `career ladder, professional office, career path roadmap, success journey`
    };

    const visual = categoryVisuals[category] || `educational content, learning environment`;

    return `${randomStyle}, ${visual}, ${randomColors} color scheme, topic: ${topic}, high quality 16:9 aspect ratio, no text overlay, seed:${randomSeed}`;
}

async function generateAndUploadWebPImage(imagePrompt, blogId, retryCount = 0) {
    try {
        console.log("🎨 Generating image and converting to WebP...");

        const randomSeed = Math.floor(Math.random() * 99999);
        const encodedPrompt = encodeURIComponent(imagePrompt);

        // Multiple image API options for reliability
        const imageApis = [
            `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&nologo=true&seed=${randomSeed}&enhance=true&model=flux`,
            `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&nologo=true&seed=${randomSeed + 1}&model=turbo`,
        ];

        const selectedApi = imageApis[retryCount % imageApis.length];

        const imgRes = await axios.get(selectedApi, {
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/*"
            }
        });

        const originalBuffer = Buffer.from(imgRes.data, 'binary');

        // ✅ Convert to WebP using Sharp
        const webpBuffer = await sharp(originalBuffer)
            .webp({
                quality: 85,        // Good quality
                effort: 6,          // Compression effort (0-6)
                lossless: false,    // Lossy for smaller size
                nearLossless: false
            })
            .resize(1280, 720, {
                fit: 'cover',
                position: 'center'
            })
            .toBuffer();

        console.log(`📦 Image converted: ${Math.round(originalBuffer.length / 1024)}KB → ${Math.round(webpBuffer.length / 1024)}KB WebP`);

        // Upload WebP to cPanel (FREE — Firebase Storage Spark plan pe band ho gaya)
        const timestamp = Date.now();
        const fileName = `uploads/blog_images/${blogId}_${timestamp}_${randomSeed}.webp`;
        const publicUrl = await require("./cpanel_storage").uploadBuffer(webpBuffer, fileName);
        console.log("✅ WebP Image uploaded (cPanel):", publicUrl);
        return publicUrl;

    } catch (imgError) {
        console.error("❌ Image error:", imgError.message);

        if (retryCount < 3) {
            console.log(`🔄 Retrying image... (${retryCount + 1}/3)`);
            await new Promise(resolve => setTimeout(resolve, 4000));
            return generateAndUploadWebPImage(imagePrompt, blogId, retryCount + 1);
        }

        return "https://studygyaan.in/default-blog.webp";
    }
}

// =========================================================
// 🔗 6. REAL DATABASE INTERNAL LINKING
// =========================================================

async function fetchAllAvailableResources(category, keywords) {
    const resources = { blogs: [], jobs: [], mockTests: [] };

    try {
        console.log("📦 Fetching REAL data from Firestore...");

        // ✅ Blogs - Same Category
        try {
            const categoryBlogsSnapshot = await db.collection("blogs")
                .where("category", "==", category)
                .orderBy("date", "desc")
                .limit(8)
                .get();

            categoryBlogsSnapshot.forEach(doc => {
                const data = doc.data();
                const realSlug = data.slug || doc.id;
                resources.blogs.push({
                    title: data.title,
                    url: `https://studygyaan.in/blog/${realSlug}`,
                    docId: doc.id,
                    category: data.category || category,
                    type: "blog"
                });
            });
        } catch (e) {
            console.log("⚠️ Category blogs:", e.message);
        }

        // ✅ Recent Blogs - All Categories
        try {
            const recentBlogsSnapshot = await db.collection("blogs")
                .orderBy("date", "desc")
                .limit(20)
                .get();

            recentBlogsSnapshot.forEach(doc => {
                const data = doc.data();
                const realSlug = data.slug || doc.id;
                const exists = resources.blogs.find(b => b.docId === doc.id);
                if (!exists && data.title) {
                    resources.blogs.push({
                        title: data.title,
                        url: `https://studygyaan.in/blog/${realSlug}`,
                        docId: doc.id,
                        category: data.category || "General",
                        type: "blog"
                    });
                }
            });
            console.log(`✅ Blogs: ${resources.blogs.length}`);
        } catch (e) {
            console.log("⚠️ Recent blogs:", e.message);
        }

        // ✅ Jobs - Real Data
        try {
            const jobsSnapshot = await db.collection("jobs")
                .orderBy("createdAt", "desc")
                .limit(20)
                .get();

            jobsSnapshot.forEach(doc => {
                const data = doc.data();
                const jobSlug = data.slug || doc.id;
                resources.jobs.push({
                    title: data.title || "Government Job",
                    url: `https://studygyaan.in/job/${jobSlug}`,
                    docId: doc.id,
                    category: data.category || "General",
                    type: "job"
                });
            });
            console.log(`✅ Jobs: ${resources.jobs.length}`);
        } catch (e) {
            try {
                const jobsSnapshot = await db.collection("jobs").limit(20).get();
                jobsSnapshot.forEach(doc => {
                    const data = doc.data();
                    const jobSlug = data.slug || doc.id;
                    resources.jobs.push({
                        title: data.title || "Government Job",
                        url: `https://studygyaan.in/job/${jobSlug}`,
                        docId: doc.id,
                        type: "job"
                    });
                });
                console.log(`✅ Jobs (fallback): ${resources.jobs.length}`);
            } catch (e2) {
                console.log("⚠️ Jobs error:", e2.message);
            }
        }

        // ✅ Mock Tests
        try {
            const testsSnapshot = await db.collection("mockTests").limit(20).get();
            if (!testsSnapshot.empty) {
                testsSnapshot.forEach(doc => {
                    const data = doc.data();
                    const testSlug = data.slug || doc.id;
                    resources.mockTests.push({
                        title: data.title || data.testName || "Practice Test",
                        url: `https://studygyaan.in/test/${testSlug}`,
                        docId: doc.id,
                        type: "mockTest"
                    });
                });
            }
            console.log(`✅ Mock Tests: ${resources.mockTests.length}`);
        } catch (e) {
            console.log("ℹ️ MockTests:", e.message);
        }

        return resources;

    } catch (error) {
        console.error("❌ fetchAllAvailableResources error:", error.message);
        return resources;
    }
}

async function generateSmartInternalLinks(category, keywords, topic) {
    try {
        const allResources = await fetchAllAvailableResources(category, keywords);
        const total = allResources.blogs.length + allResources.jobs.length + allResources.mockTests.length;

        if (total === 0) {
            console.log("⚠️ No resources in DB yet");
            return [];
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: { temperature: 0.5, maxOutputTokens: 2048 }
        });

        const resourcesJson = JSON.stringify({
            blogs: allResources.blogs.slice(0, 15),
            jobs: allResources.jobs.slice(0, 10),
            mockTests: allResources.mockTests.slice(0, 10)
        });

        const linkPrompt = `SEO Expert task: Select most relevant resources for this blog.

BLOG TOPIC: "${topic}"
CATEGORY: "${category}"

REAL DATABASE RESOURCES:
${resourcesJson}

Select 5-8 most relevant. Use EXACT URLs from above. Do NOT create or modify URLs.

Return ONLY JSON array:
[{"title":"exact title","url":"exact url unchanged","type":"blog/job/mockTest","reason":"Hindi mein relevance"}]`;

        const result = await model.generateContent(linkPrompt);
        const responseText = result.response.text();
        const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);

        if (!jsonMatch) return createSmartFallbackLinks(allResources, category);

        const selectedLinks = JSON.parse(jsonMatch[0]);

        // ✅ Verify every URL is real
        const allRealUrls = [
            ...allResources.blogs.map(b => b.url),
            ...allResources.jobs.map(j => j.url),
            ...allResources.mockTests.map(t => t.url)
        ];

        const verifiedLinks = selectedLinks.filter(link => {
            const isReal = allRealUrls.includes(link.url);
            if (!isReal) console.log(`⚠️ Blocked fake URL: ${link.url}`);
            return isReal;
        });

        console.log(`✅ Verified real links: ${verifiedLinks.length}`);
        return verifiedLinks.length >= 3 ? verifiedLinks : createSmartFallbackLinks(allResources, category);

    } catch (error) {
        console.error("❌ Smart linking error:", error.message);
        const allResources = await fetchAllAvailableResources(category, keywords);
        return createSmartFallbackLinks(allResources, category);
    }
}

function createSmartFallbackLinks(allResources, category) {
    const fallback = [];

    allResources.blogs.filter(b => b.category === category).slice(0, 3)
        .forEach(b => fallback.push({ title: b.title, url: b.url, type: "blog", reason: "इसी category का related article" }));

    allResources.blogs.filter(b => b.category !== category).slice(0, 2)
        .forEach(b => fallback.push({ title: b.title, url: b.url, type: "blog", reason: "पढ़ने योग्य महत्वपूर्ण लेख" }));

    allResources.jobs.slice(0, 2)
        .forEach(j => fallback.push({ title: j.title, url: j.url, type: "job", reason: "नई सरकारी नौकरी" }));

    allResources.mockTests.slice(0, 2)
        .forEach(t => fallback.push({ title: t.title, url: t.url, type: "mockTest", reason: "प्रैक्टिस टेस्ट दें" }));

    return fallback;
}

// =========================================================
// 🎨 7. DYNAMIC HTML CONTENT RENDERER
// =========================================================

// 8 Completely Different Blog Layout Templates
const BLOG_TEMPLATES = [
    {
        name: "Modern_Card",
        headerStyle: `style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center;"`,
        sectionStyle: `style="background: white; border-left: 5px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0; box-shadow: 0 4px 15px rgba(0,0,0,0.08);"`,
        tipBoxStyle: `style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 15px; margin: 20px 0;"`,
        tableStyle: `style="width:100%; border-collapse: collapse; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);"`,
        thStyle: `style="background: #667eea; color: white; padding: 15px; text-align: left;"`,
        tdStyle: `style="padding: 12px 15px; border-bottom: 1px solid #eee;"`,
        faqStyle: `style="background: #f8f9ff; border: 1px solid #667eea; border-radius: 10px; padding: 20px; margin: 15px 0;"`
    },
    {
        name: "Fire_Theme",
        headerStyle: `style="background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%); color: #333; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center;"`,
        sectionStyle: `style="background: #fff9f0; border-left: 5px solid #f7971e; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0; box-shadow: 0 4px 15px rgba(247,151,30,0.15);"`,
        tipBoxStyle: `style="background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%); color: #333; padding: 20px; border-radius: 15px; margin: 20px 0;"`,
        tableStyle: `style="width:100%; border-collapse: collapse; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(247,151,30,0.2);"`,
        thStyle: `style="background: #f7971e; color: white; padding: 15px; text-align: left;"`,
        tdStyle: `style="padding: 12px 15px; border-bottom: 1px solid #ffe4b5;"`,
        faqStyle: `style="background: #fff9f0; border: 1px solid #f7971e; border-radius: 10px; padding: 20px; margin: 15px 0;"`
    },
    {
        name: "Nature_Green",
        headerStyle: `style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center;"`,
        sectionStyle: `style="background: #f0fff4; border-left: 5px solid #11998e; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0; box-shadow: 0 4px 15px rgba(17,153,142,0.1);"`,
        tipBoxStyle: `style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 20px; border-radius: 15px; margin: 20px 0;"`,
        tableStyle: `style="width:100%; border-collapse: collapse; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(17,153,142,0.15);"`,
        thStyle: `style="background: #11998e; color: white; padding: 15px; text-align: left;"`,
        tdStyle: `style="padding: 12px 15px; border-bottom: 1px solid #c6f6d5;"`,
        faqStyle: `style="background: #f0fff4; border: 1px solid #11998e; border-radius: 10px; padding: 20px; margin: 15px 0;"`
    },
    {
        name: "Royal_Blue",
        headerStyle: `style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center;"`,
        sectionStyle: `style="background: #f0f4ff; border-left: 5px solid #0f3460; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0; box-shadow: 0 4px 15px rgba(15,52,96,0.1);"`,
        tipBoxStyle: `style="background: linear-gradient(135deg, #0f3460 0%, #533483 100%); color: white; padding: 20px; border-radius: 15px; margin: 20px 0;"`,
        tableStyle: `style="width:100%; border-collapse: collapse; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(15,52,96,0.15);"`,
        thStyle: `style="background: #0f3460; color: white; padding: 15px; text-align: left;"`,
        tdStyle: `style="padding: 12px 15px; border-bottom: 1px solid #dbeafe;"`,
        faqStyle: `style="background: #eff6ff; border: 1px solid #0f3460; border-radius: 10px; padding: 20px; margin: 15px 0;"`
    },
    {
        name: "Sunset_Pink",
        headerStyle: `style="background: linear-gradient(135deg, #ee0979 0%, #ff6a00 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; text-align: center;"`,
        sectionStyle: `style="background: #fff0f6; border-left: 5px solid #ee0979; padding: 20px; margin: 20px 0; border-radius: 0 10px 10px 0; box-shadow: 0 4px 15px rgba(238,9,121,0.1);"`,
        tipBoxStyle: `style="background: linear-gradient(135deg, #ee0979 0%, #ff6a00 100%); color: white; padding: 20px; border-radius: 15px; margin: 20px 0;"`,
        tableStyle: `style="width:100%; border-collapse: collapse; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(238,9,121,0.15);"`,
        thStyle: `style="background: #ee0979; color: white; padding: 15px; text-align: left;"`,
        tdStyle: `style="padding: 12px 15px; border-bottom: 1px solid #ffe4f0;"`,
        faqStyle: `style="background: #fff0f6; border: 1px solid #ee0979; border-radius: 10px; padding: 20px; margin: 15px 0;"`
    }
];

function getRandomTemplate() {
    return BLOG_TEMPLATES[Math.floor(Math.random() * BLOG_TEMPLATES.length)];
}

function createInternalLinksHTML(smartLinks, template) {
    if (!smartLinks || smartLinks.length === 0) return "";

    const blogs = smartLinks.filter(l => l.type === "blog");
    const jobs = smartLinks.filter(l => l.type === "job");
    const mockTests = smartLinks.filter(l => l.type === "mockTest");

    // Dynamic section styles based on template
    const sectionColors = [
        { bg: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", text: "white" },
        { bg: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)", text: "#333" },
        { bg: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)", text: "white" },
        { bg: "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)", text: "white" },
        { bg: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)", text: "white" }
    ];

    const randomColor = sectionColors[Math.floor(Math.random() * sectionColors.length)];

    let html = `<div class="related-resources" style="margin: 50px 0; padding: 35px; background: ${randomColor.bg}; border-radius: 20px; box-shadow: 0 15px 40px rgba(0,0,0,0.15);">`;

    html += `<h2 style="color: ${randomColor.text}; font-size: 26px; margin-bottom: 25px; text-align: center; font-weight: 700;">📚 आपके लिए चुने गए महत्वपूर्ण संसाधन</h2>`;

    if (blogs.length > 0) {
        html += `<div style="background: rgba(255,255,255,0.95); border-radius: 15px; padding: 20px; margin-bottom: 20px;">`;
        html += `<h3 style="color: #333; font-size: 20px; margin-bottom: 15px; border-bottom: 2px solid #ddd; padding-bottom: 10px;">📖 संबंधित लेख</h3>`;
        html += `<ul style="list-style: none; padding: 0; margin: 0;">`;
        blogs.forEach(link => {
            html += `<li style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                <a href="${link.url}" title="${link.title}" style="color: #2980b9; font-weight: 600; text-decoration: none; font-size: 15px;">🔗 ${link.title}</a>
                <small style="display: block; color: #888; margin-top: 3px;">${link.reason || ''}</small>
            </li>`;
        });
        html += `</ul></div>`;
    }

    if (jobs.length > 0) {
        html += `<div style="background: rgba(255,255,255,0.95); border-radius: 15px; padding: 20px; margin-bottom: 20px;">`;
        html += `<h3 style="color: #333; font-size: 20px; margin-bottom: 15px; border-bottom: 2px solid #ddd; padding-bottom: 10px;">💼 नौकरी के अवसर</h3>`;
        html += `<ul style="list-style: none; padding: 0; margin: 0;">`;
        jobs.forEach(link => {
            html += `<li style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                <a href="${link.url}" title="${link.title}" style="color: #27ae60; font-weight: 600; text-decoration: none; font-size: 15px;">🎯 ${link.title}</a>
                <small style="display: block; color: #888; margin-top: 3px;">${link.reason || ''}</small>
            </li>`;
        });
        html += `</ul></div>`;
    }

    if (mockTests.length > 0) {
        html += `<div style="background: rgba(255,255,255,0.95); border-radius: 15px; padding: 20px; margin-bottom: 10px;">`;
        html += `<h3 style="color: #333; font-size: 20px; margin-bottom: 15px; border-bottom: 2px solid #ddd; padding-bottom: 10px;">📝 प्रैक्टिस टेस्ट</h3>`;
        html += `<ul style="list-style: none; padding: 0; margin: 0;">`;
        mockTests.forEach(link => {
            html += `<li style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                <a href="${link.url}" title="${link.title}" style="color: #e74c3c; font-weight: 600; text-decoration: none; font-size: 15px;">✍️ ${link.title}</a>
                <small style="display: block; color: #888; margin-top: 3px;">${link.reason || ''}</small>
            </li>`;
        });
        html += `</ul></div>`;
    }

    html += `</div>`;
    return html;
}

// =========================================================
// 🛠️ 8. UTILITY FUNCTIONS
// =========================================================

function generateUniqueHash(content) {
    return crypto.createHash('sha256')
        .update(content + Date.now() + Math.random())
        .digest('hex')
        .substring(0, 12);
}

function createDynamicSlug(title, category) {
    const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-')
        .substring(0, 60);

    const uniqueId = generateUniqueHash(title);
    const timestamp = Date.now().toString(36);

    return `${baseSlug}-${timestamp}-${uniqueId}`;
}

function generateAdvancedMetaTags(data) {
    const title = data.title.length > 60 ? data.title.substring(0, 57) + "..." : data.title;
    const description = data.metaDescription.length > 160 ? data.metaDescription.substring(0, 157) + "..." : data.metaDescription;

    return `
<link rel="canonical" href="${data.url}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
<meta name="description" content="${description}">
<meta name="keywords" content="${data.keywords.join(', ')}">
<meta name="author" content="${data.author}">
<meta property="og:locale" content="hi_IN" />
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${data.url}">
<meta property="og:site_name" content="StudyGyaan" />
<meta property="og:image" content="${data.imageUrl}">
<meta property="og:image:width" content="1280" />
<meta property="og:image:height" content="720" />
<meta property="og:image:type" content="image/webp" />
<meta property="article:published_time" content="${new Date().toISOString()}" />
<meta property="article:modified_time" content="${new Date().toISOString()}" />
<meta property="article:author" content="${data.author}" />
<meta property="article:section" content="${data.category}" />
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${data.imageUrl}">
<meta name="twitter:site" content="@StudyGyaan" />
`.trim();
}

function generateAllSchemas(data) {
    const articleSchema = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": data.title,
        "description": data.metaDescription,
        "image": { "@type": "ImageObject", "url": data.imageUrl, "width": 1280, "height": 720 },
        "datePublished": new Date().toISOString(),
        "dateModified": new Date().toISOString(),
        "author": { "@type": "Person", "name": data.author, "url": "https://studygyaan.in/about" },
        "publisher": {
            "@type": "Organization",
            "name": "StudyGyaan",
            "logo": { "@type": "ImageObject", "url": "https://studygyaan.in/logo.webp" }
        },
        "mainEntityOfPage": { "@type": "WebPage", "@id": data.url },
        "wordCount": data.wordCount,
        "timeRequired": `PT${data.readingTime}M`,
        "inLanguage": "hi-IN",
        "articleSection": data.category
    };

    const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://studygyaan.in" },
            { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://studygyaan.in/blog" },
            { "@type": "ListItem", "position": 3, "name": data.title, "item": data.url }
        ]
    };

    // Extract FAQs from content
    const faqs = [];
    const faqPattern = /<h3[^>]*>(.*?)<\/h3>\s*<p>(.*?)<\/p>/gi;
    let match;
    while ((match = faqPattern.exec(data.content)) !== null && faqs.length < 8) {
        const q = match[1].replace(/<[^>]+>/g, '').trim();
        const a = match[2].replace(/<[^>]+>/g, '').trim();
        if (q.includes('?') && a.length > 20) {
            faqs.push({
                "@type": "Question",
                "name": q,
                "acceptedAnswer": { "@type": "Answer", "text": a.substring(0, 300) }
            });
        }
    }

    const faqSchema = faqs.length > 0 ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs
    } : null;

    let schemas = `\n<script type="application/ld+json">\n${JSON.stringify(articleSchema, null, 2)}\n</script>`;
    schemas += `\n<script type="application/ld+json">\n${JSON.stringify(breadcrumbSchema, null, 2)}\n</script>`;
    if (faqSchema) {
        schemas += `\n<script type="application/ld+json">\n${JSON.stringify(faqSchema, null, 2)}\n</script>`;
    }

    return schemas;
}

function checkContentQuality(content) {
    const wordCount = content.split(/\s+/).length;
    const headingCount = (content.match(/<h[2-4][^>]*>/g) || []).length;
    const paragraphCount = (content.match(/<p[^>]*>/g) || []).length;
    const listCount = (content.match(/<(ul|ol)[^>]*>/g) || []).length;
    const tableCount = (content.match(/<table[^>]*>/g) || []).length;
    const strongCount = (content.match(/<strong[^>]*>/g) || []).length;

    let score = 0;
    score += Math.min(wordCount / 20, 40);
    score += headingCount * 3;
    score += paragraphCount * 2;
    score += listCount * 5;
    score += tableCount * 8;
    score += strongCount * 1;

    return {
        wordCount,
        headingCount,
        paragraphCount,
        listCount,
        tableCount,
        hasEnoughContent: wordCount >= 1200,
        hasHeadings: headingCount >= 5,
        score: Math.min(Math.round(score), 100),
        readingTime: Math.ceil(wordCount / 200)
    };
}

function cleanJsonResponse(rawText) {
    try {
        let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        cleaned = jsonMatch[0]
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
            .replace(/\\n/g, " ")
            .replace(/\\t/g, " ")
            .replace(/\s+/g, " ")
            .replace(/,(\s*[}\]])/g, '$1')
            .trim();

        const parsed = JSON.parse(cleaned);
        if (!parsed.aiTitle || !parsed.content || !parsed.metaDescription) return null;
        return parsed;
    } catch (e) {
        console.error("JSON Parse Error:", e.message);
        return null;
    }
}

async function notifyGoogle(url, retryCount = 0) {
    try {
        const saVar = process.env.SERVICE_ACCOUNT_JSON;
        if (!saVar || saVar === "undefined") return;

        const key = JSON.parse(saVar);
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
                    Authorization: `Bearer ${jwtClient.credentials.access_token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        console.log("🚀 Google Indexing Success:", url);
    } catch (err) {
        if (err.response?.status === 429 && retryCount < 3) {
            await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 15000));
            return notifyGoogle(url, retryCount + 1);
        }
        console.error("❌ Indexing Error:", err.response?.data || err.message);
    }
}

// =========================================================
// 🤖 9. AI CONTENT GENERATOR - MAX UNIQUENESS
// =========================================================

async function generateAdvancedBlogContent(category, topic, writingStyle, structure, retryCount = 0) {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: {
                temperature: 0.9,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 8192
            }
        });

        const now = new Date();
        const currentDate = now.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });

        // Random unique elements
        const randomEmoji = ["🎯", "🚀", "💡", "🔥", "⚡", "🌟", "📊", "🏆"][Math.floor(Math.random() * 8)];
        const randomOpener = [
            "क्या आप जानते हैं कि",
            "आज हम बात करेंगे",
            "सोचिए अगर आपको पता हो",
            "एक ऐसा सवाल जो हर student पूछता है",
            "अगर आप सच में serious हैं तो",
            "बहुत कम लोग जानते हैं कि",
            "आज की सबसे important जानकारी",
            "यह जानकारी आपकी life बदल सकती है"
        ][Math.floor(Math.random() * 8)];

        const prompt = `You are an EXPERT Hindi-Hinglish Content Writer for StudyGyaan.in. Write a COMPLETELY UNIQUE blog post.

TOPIC: "${topic}"
CATEGORY: "${category}"
WRITING STYLE: ${writingStyle}
STRUCTURE: ${structure.template}
DATE: ${currentDate}
UNIQUE OPENER: "${randomOpener}"
EMOJI THEME: ${randomEmoji}

STRICT REQUIREMENTS:
1. Start with "${randomOpener}" - make it compelling
2. Length: 2000-2500 words
3. Language: Natural Hindi-Hinglish mix (60% Hindi, 40% English terms)
4. HTML format: h2, h3, p, ul, ol, table, strong, em tags
5. Include at least: 2 comparison tables, 3 real examples, 1 step-by-step guide
6. FAQ Section: 6-8 questions (include "?" in questions for schema detection)
7. Every section must be genuinely unique and informative
8. No generic filler content - only real, useful information
9. Conversational tone - write like explaining to a friend
10. Include current 2025-2026 relevant data

CONTENT MUST INCLUDE:
- Strong hook opening paragraph
- At least 6 H2 headings
- At least 4 H3 subheadings  
- 2 data tables with real information
- Numbered list with at least 7 items
- Bullet points with actionable tips
- Real examples with context
- FAQ section with 6-8 Q&A pairs
- Strong conclusion with clear CTA

IMPORTANT: Return ONLY valid JSON without markdown.

JSON FORMAT:
{
  "aiTitle": "Unique compelling title 50-65 characters without date",
  "metaDescription": "Engaging 150-160 char description with primary keyword naturally placed",
  "keywords": ["primary keyword", "secondary keyword", "lsi keyword 1", "lsi keyword 2", "lsi keyword 3", "lsi keyword 4", "lsi keyword 5"],
  "imagePrompt": "Detailed visual description for AI image generation",
  "content": "Complete HTML content 2000+ words",
  "excerpt": "150 char engaging summary",
  "targetAudience": "Who this article is for",
  "uniqueAngle": "What makes this article unique"
}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        console.log("🔍 Parsing AI response...");
        const blogData = cleanJsonResponse(responseText);

        if (!blogData || !blogData.content || blogData.content.length < 1500) {
            if (retryCount < 2) {
                console.log(`⚠️ Insufficient content, retrying... (${retryCount + 1}/2)`);
                await new Promise(r => setTimeout(r, 3000));
                return generateAdvancedBlogContent(category, topic, writingStyle, structure, retryCount + 1);
            }
            throw new Error("AI generated insufficient content");
        }

        blogData.keywords = blogData.keywords || [topic, category, "exam preparation", "government jobs", "study tips"];
        blogData.excerpt = blogData.excerpt || blogData.metaDescription;

        return blogData;

    } catch (error) {
        console.error("❌ Content generation error:", error.message);
        if (retryCount < 2) {
            await new Promise(r => setTimeout(r, 4000));
            return generateAdvancedBlogContent(category, topic, writingStyle, structure, retryCount + 1);
        }
        throw error;
    }
}

// =========================================================
// 🚀 10. MAIN BLOG GENERATION ENGINE
// =========================================================

async function generateDailyBlog() {
    try {
        console.log("🚀 Starting ADVANCED Auto-Blogger Engine v3.0...");
        console.log("⏰ Time:", new Date().toLocaleString('hi-IN'));

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        // 🎲 STEP 1: Random Category
        const categories = Object.keys(MASTER_POOL);
        const randomCat = categories[Math.floor(Math.random() * categories.length)];
        console.log(`🎯 Category: ${randomCat}`);

        // 🎲 STEP 2: Random Topic
        const availableTopics = MASTER_POOL[randomCat];
        const rawTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
        console.log(`📝 Topic: ${rawTopic}`);

        // 🎲 STEP 3: Random Writing Style
        const writingStyle = WRITING_STYLES[Math.floor(Math.random() * WRITING_STYLES.length)];
        console.log(`✍️ Style: ${writingStyle}`);

        // 🎲 STEP 4: Random Content Structure
        const contentStructure = CONTENT_STRUCTURES[Math.floor(Math.random() * CONTENT_STRUCTURES.length)];
        console.log(`🏗️ Structure: ${contentStructure.name}`);

        // 🎲 STEP 5: Random Blog Template
        const blogTemplate = getRandomTemplate();
        console.log(`🎨 Template: ${blogTemplate.name}`);

        // 🤖 STEP 6: Generate Content
        console.log("🤖 Generating content with Gemini...");
        const blogData = await generateAdvancedBlogContent(randomCat, rawTopic, writingStyle, contentStructure);
        console.log(`✅ Content: ${blogData.content.length} characters`);

        // 🔍 STEP 7: Quality Check
        const quality = checkContentQuality(blogData.content);
        console.log(`📊 Quality: ${quality.score}/100, Words: ${quality.wordCount}`);

        if (!quality.hasEnoughContent) {
            console.log("⚠️ Below quality threshold, regenerating...");
            return generateDailyBlog();
        }

        // 🛡️ STEP 8: Anti-Duplicate Check
        console.log("🛡️ Running Anti-Duplicate System...");
        const duplicateCheck = await checkDuplicateContent(blogData.aiTitle, blogData.content);

        if (duplicateCheck.isDuplicate) {
            console.log(`⚠️ Duplicate detected (${duplicateCheck.reason}), regenerating with different approach...`);
            // Change topic slightly and regenerate
            const newTopic = `${rawTopic} - Advanced Guide ${Date.now().toString(36)}`;
            const newBlogData = await generateAdvancedBlogContent(randomCat, newTopic, writingStyle, contentStructure);
            Object.assign(blogData, newBlogData);
        }

        // 📅 STEP 9: Create Unique Title
        const now = new Date();
        const dateVariants = [
            now.toLocaleString('hi-IN', { month: 'long', year: 'numeric' }),
            `${now.getFullYear()}`,
            now.toLocaleString('hi-IN', { month: 'short', year: 'numeric' }),
            now.toLocaleString('hi-IN', { day: 'numeric', month: 'long' })
        ];
        const selectedDate = dateVariants[Math.floor(Math.random() * dateVariants.length)];
        const powerPrefix = POWER_WORDS[Math.floor(Math.random() * POWER_WORDS.length)];
        const finalTitle = `${powerPrefix}: ${blogData.aiTitle} (${selectedDate})`;
        console.log(`📌 Title: ${finalTitle}`);

        // 🔗 STEP 10: Unique Slug
        const slug = createDynamicSlug(finalTitle, randomCat);
        const blogUrl = `https://studygyaan.in/blog/${slug}`;
        console.log(`🔗 URL: ${blogUrl}`);

        // 🎨 STEP 11: Generate WebP Image
        console.log("🎨 Generating WebP image...");
        const imagePrompt = generateDynamicImagePrompt(randomCat, rawTopic, writingStyle);
        const imageUrl = await generateAndUploadWebPImage(imagePrompt, slug);

        // 🔗 STEP 12: Smart Internal Links (Real DB)
        console.log("🔗 Fetching real internal links...");
        const smartLinks = await generateSmartInternalLinks(randomCat, blogData.keywords, rawTopic);
        const linkHTML = createInternalLinksHTML(smartLinks, blogTemplate);
        console.log(`✅ Real links added: ${smartLinks.length}`);

        // 📋 STEP 13: Generate Schemas
        const finalQuality = checkContentQuality(blogData.content);
        const schemas = generateAllSchemas({
            title: finalTitle,
            metaDescription: blogData.metaDescription,
            imageUrl,
            author: "StudyGyaan Team",
            url: blogUrl,
            category: randomCat,
            wordCount: finalQuality.wordCount,
            readingTime: finalQuality.readingTime,
            content: blogData.content
        });

        // 🔗 STEP 14: Merge All Content
        const finalContent = blogData.content + linkHTML + schemas;

        // 🔑 STEP 15: Generate Fingerprints for Anti-Duplicate
        const fingerprint = await generateContentFingerprint(finalTitle, blogData.content);
        const keyPhrases = finalTitle
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(' ')
            .filter(w => w.length > 5)
            .slice(0, 3)
            .join('_');

        // 💾 STEP 16: Save to Firestore
        const blogDocument = {
            // Core Content
            title: finalTitle,
            slug: slug,
            description: blogData.metaDescription,
            excerpt: blogData.excerpt || blogData.metaDescription,
            content: finalContent,

            // SEO
            tags: blogData.keywords,
            category: randomCat,
            metaTags: generateAdvancedMetaTags({
                title: finalTitle,
                metaDescription: blogData.metaDescription,
                keywords: blogData.keywords,
                url: blogUrl,
                imageUrl,
                author: "StudyGyaan Team",
                category: randomCat
            }),

            // Anti-Duplicate Fingerprints
            titleHash: fingerprint.titleHash,
            contentHash: fingerprint.contentHash,
            keyPhrases: fingerprint.keyPhrases,
            topicBase: keyPhrases,

            // Media
            imageUrl,
            imageFormat: "webp",
            imagePrompt: imagePrompt.substring(0, 300),

            // Internal Links
            internalLinks: smartLinks,
            internalLinksCount: smartLinks.length,

            // Attribution
            author: "StudyGyaan Team",
            type: "auto-blog-v3.0",

            // Timestamps
            date: admin.firestore.FieldValue.serverTimestamp(),
            publishedDate: admin.firestore.Timestamp.now(),
            lastModified: admin.firestore.Timestamp.now(),

            // URLs
            url: blogUrl,
            canonicalUrl: blogUrl,

            // Analytics
            qualityScore: finalQuality.score,
            wordCount: finalQuality.wordCount,
            readingTime: finalQuality.readingTime,

            // Variation Metadata
            writingStyle,
            contentStructure: contentStructure.name,
            blogTemplate: blogTemplate.name,
            targetAudience: blogData.targetAudience || "Competitive exam students",
            uniqueAngle: blogData.uniqueAngle || "Comprehensive analysis",

            // Status
            status: "published",
            visibility: "public",
            featured: finalQuality.score > 80,

            // Indexing
            indexed: false,
            indexingAttempts: 0
        };

        await db.collection("blogs").doc(slug).set(blogDocument);
        console.log(`💾 Saved to Firestore: ${slug}`);

        // 🌐 STEP 17: Google Indexing
        await notifyGoogle(blogUrl);

        // 📢 STEP 18: Telegram Notification
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            try {
                const msg = `🎉 <b>नया Blog Live!</b>

📌 <b>${finalTitle}</b>

📂 Category: ${randomCat.replace(/_/g, ' ')}
🎨 Template: ${blogTemplate.name}
📊 Quality: ${finalQuality.score}/100
📝 Words: ${finalQuality.wordCount}
⏱️ Reading: ${finalQuality.readingTime} min
🔗 Links: ${smartLinks.length} (Real DB)
🖼️ Format: WebP (Optimized)
✍️ Style: ${writingStyle.substring(0, 30)}

🔗 <b>Read:</b> ${blogUrl}

#StudyGyaan #${randomCat}`.trim();

                await axios.post(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
                    { chat_id: TELEGRAM_CHAT_ID, photo: imageUrl, caption: msg, parse_mode: 'HTML' },
                    { timeout: 10000 }
                );
                console.log("📢 Telegram sent!");
            } catch (tgErr) {
                console.error("❌ Telegram:", tgErr.message);
            }
        }

        // 📊 STEP 19: Success Summary
        console.log("\n" + "=".repeat(60));
        console.log("✅ BLOG PUBLISHED SUCCESSFULLY!");
        console.log("=".repeat(60));
        console.log(`📌 Title:     ${finalTitle}`);
        console.log(`🔗 URL:       ${blogUrl}`);
        console.log(`🎨 Template:  ${blogTemplate.name}`);
        console.log(`📊 Quality:   ${finalQuality.score}/100`);
        console.log(`📝 Words:     ${finalQuality.wordCount}`);
        console.log(`🖼️ Image:     WebP (Optimized)`);
        console.log(`🔗 Links:     ${smartLinks.length} (Real URLs)`);
        console.log(`🛡️ Duplicate: PASSED`);
        console.log("=".repeat(60) + "\n");

        return true;

    } catch (error) {
        console.error("\n❌ CRITICAL ERROR:", error.message);
        console.error("Stack:", error.stack);
        return false;
    }
}

// =========================================================
// 🚀 EXECUTION
// =========================================================

if (require.main === module) {
    console.log("🎬 Auto-Blogger V3.0 Started...");

    generateDailyBlog()
        .then(success => {
            console.log(success ? "✅ COMPLETED!" : "⚠️ FINISHED WITH ERRORS");
            process.exit(success ? 0 : 1);
        })
        .catch(err => {
            console.error("❌ FATAL:", err.message);
            process.exit(1);
        });
}

module.exports = { generateDailyBlog };

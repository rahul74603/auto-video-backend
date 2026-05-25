require("dotenv").config();
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");

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
        "Bank Exam Calendar Analysis", "Female Special Vacancies in Defense", "Latest Teaching Jobs in India",
        "UPSC Jobs Without Exam", "Railway Jobs for ITI Holders", "Top 10 Banking Jobs in India",
        "Government Jobs for Engineers", "Medical Field Government Jobs", "Teaching Jobs State Wise Analysis"
    ],
    "Syllabus_Guide": [
        "SSC CGL Tier-1 Detailed Syllabus", "UPSC Prelims Strategy for Beginners", "Railway Group D Math Important Topics",
        "UP Police Constable Hindi Preparation Guide", "English Grammar Hacks for Competitive Exams",
        "IBPS PO Complete Syllabus Breakdown", "NEET Preparation Roadmap", "JEE Advanced Physics Key Concepts",
        "NDA Mathematics Syllabus", "CLAT Legal Reasoning Preparation"
    ],
    "Student_Life_Motivation": [
        "How to handle Exam Stress and Anxiety", "Hostel Life vs Home Study: Honest Review", "Student Budget Management Tips",
        "Success Story: From Zero to Govt Employee", "How to avoid distractions while studying", "Power of Consistency in Competition",
        "Morning vs Night Study: Which is Better", "Handling Family Pressure During Preparation", "Building Strong Study Habits",
        "Overcoming Failure in Competitive Exams", "Time Management Secrets for Students"
    ],
    "Academic_Deep_Dive": [
        "Indian History: Important Dates of Modern Era", "General Science: Biology Human Body Facts", "Indian Economy: Understanding GDP & Inflation",
        "World Geography: Major Continents and Oceans", "Computer Awareness for Govt Exams",
        "Polity: Fundamental Rights Explained", "Ancient Indian History Key Topics", "Environmental Science for Exams",
        "Indian Constitution: Important Articles", "Current Affairs Monthly Digest"
    ],
    "Trending_Education_News": [
        "New Education Policy Major Changes", "Digital Revolution in Rural Education", "Impact of AI on Indian Job Market",
        "New Rules for Online Recruitment Exams", "Future of Competitive Coaching in India",
        "Latest Exam Pattern Changes 2026", "Online vs Offline Exams Debate", "Government Schemes for Students",
        "Educational Reforms in India", "Technology in Modern Education"
    ],
    "Exam_Strategies": [
        "Last Minute Revision Techniques", "How to Attempt Mock Tests Effectively", "Time Management in Competitive Exams",
        "Negative Marking Strategy", "Speed Reading Techniques", "Memory Boosting Methods for Students",
        "Answer Writing Skills for Descriptive Exams", "MCQ Solving Strategies", "Stress Free Exam Day Preparation"
    ],
    "Career_Guidance": [
        "Government Job vs Private Job Comparison", "Best Career Options After Graduation", "Scope of Teaching Career in India",
        "Defense Career Complete Guide", "Banking Sector Career Prospects", "Career in Indian Railways",
        "Medical Field Career Opportunities", "Engineering Career Paths", "Career in Indian Police Services"
    ]
};

// 🎯 DYNAMIC POWER WORDS - More Variety
const POWER_WORDS = [
    "🔥 Breaking:", "🚨 Latest Update:", "⚡ Exclusive:", "📊 Complete Guide:", 
    "🎯 Target 2026:", "📖 Special:", "💡 Must Read:", "🌟 Trending:", 
    "📢 Important:", "🎓 Expert Guide:", "✨ New:", "🔔 Alert:", 
    "📝 Detailed:", "🏆 Top:", "💼 Career:"
];

// 🎨 WRITING STYLES - Human-like Variations
const WRITING_STYLES = [
    "conversational and friendly",
    "professional and informative",
    "motivational and inspiring",
    "analytical and detailed",
    "storytelling with examples",
    "question-answer based",
    "step-by-step tutorial style",
    "comparative analysis style"
];

// 📝 CONTENT STRUCTURES - Different Templates
const CONTENT_STRUCTURES = [
    "introduction → main points with subheadings → examples → FAQ → conclusion",
    "hook → problem statement → solution breakdown → real examples → action steps → FAQ",
    "story opening → context → detailed analysis → case studies → tips → FAQ → summary",
    "question based intro → answer sections → data tables → expert tips → FAQ → final thoughts",
    "trending news angle → background → impact analysis → future predictions → FAQ → conclusion"
];

// =========================================================
// 🛠️ 3. ADVANCED UNIQUENESS GENERATORS
// =========================================================

function generateUniqueHash(content) {
    return crypto.createHash('sha256').update(content + Date.now() + Math.random()).digest('hex').substring(0, 12);
}

function createDynamicSlug(title, category) {
    const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    
    const uniqueId = generateUniqueHash(title);
    const timestamp = Date.now().toString(36);
    
    return `${baseSlug}-${category.toLowerCase()}-${timestamp}-${uniqueId}`;
}

function getRandomElements(arr, count) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function generateDynamicImagePrompt(category, topic, style) {
    const imageStyles = [
        "modern 3D illustration with vibrant colors",
        "professional infographic style design",
        "minimalist flat design with icons",
        "realistic photograph style",
        "gradient background with typography focus",
        "isometric 3D design elements",
        "abstract geometric patterns",
        "educational diagram style"
    ];
    
    const selectedStyle = imageStyles[Math.floor(Math.random() * imageStyles.length)];
    
    const prompts = {
        "Job_Alerts": `${selectedStyle}, Indian government job recruitment theme, office setup, official documents, professional atmosphere, ${topic}`,
        "Syllabus_Guide": `${selectedStyle}, study materials, books, laptop, notes, student desk setup, educational theme, ${topic}`,
        "Student_Life_Motivation": `${selectedStyle}, motivated student, success journey, inspirational theme, positive vibes, ${topic}`,
        "Academic_Deep_Dive": `${selectedStyle}, educational content, knowledge representation, academic theme, ${topic}`,
        "Trending_Education_News": `${selectedStyle}, news breaking theme, digital education, modern technology, ${topic}`,
        "Exam_Strategies": `${selectedStyle}, exam preparation, strategic planning, study tips visualization, ${topic}`,
        "Career_Guidance": `${selectedStyle}, career path, professional growth, future planning, ${topic}`
    };
    
    return prompts[category] || `${selectedStyle}, educational content about ${topic}`;
}

async function checkDuplicateContent(title, content) {
    try {
        const titleWords = title.toLowerCase().split(' ').filter(w => w.length > 3).slice(0, 5);
        const query = db.collection("blogs");
        
        for (let word of titleWords) {
            const snapshot = await query.where('title', '>=', word).where('title', '<=', word + '\uf8ff').limit(1).get();
            if (!snapshot.empty) {
                console.log("⚠️ Similar title found, making it more unique...");
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error("Duplicate check error:", e.message);
        return false;
    }
}

function cleanJsonResponse(rawText) {
    try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        let cleaned = jsonMatch[0]
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
            .replace(/,(\s*[}\]])/g, '$1')
            .trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("JSON Parse Error:", e.message);
        return null;
    }
}

function generateAdvancedFAQSchema(content) {
    const faqPatterns = [
        /<h3[^>]*>(.*?प्रश्न.*?|.*?Question.*?|.*?Q\d+.*?)<\/h3>\s*<p>(.*?)<\/p>/gi,
        /<p><strong>(.*?प्रश्न.*?|.*?Question.*?|.*?Q\d+.*?)<\/strong><\/p>\s*<p>(.*?)<\/p>/gi,
        /<li><strong>(.*?\?)<\/strong>\s*(.*?)<\/li>/gi
    ];
    
    const faqs = [];
    
    for (let pattern of faqPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null && faqs.length < 8) {
            const question = match[1].replace(/<\/?[^>]+>/g, '').trim();
            const answer = match[2].replace(/<\/?[^>]+>/g, '').trim();
            
            if (question.length > 10 && answer.length > 20) {
                faqs.push({
                    "@type": "Question",
                    "name": question,
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": answer.substring(0, 300)
                    }
                });
            }
        }
    }
    
    if (faqs.length === 0) return "";
    
    return `\n<script type="application/ld+json">\n${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs
    }, null, 2)}\n</script>`;
}

function generateArticleSchema(data) {
    return `\n<script type="application/ld+json">\n${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": data.title,
        "description": data.description,
        "image": data.imageUrl,
        "datePublished": new Date().toISOString(),
        "dateModified": new Date().toISOString(),
        "author": {
            "@type": "Person",
            "name": data.author
        },
        "publisher": {
            "@type": "Organization",
            "name": "StudyGyaan",
            "logo": {
                "@type": "ImageObject",
                "url": "https://studygyaan.in/logo.png"
            }
        },
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": data.url
        }
    }, null, 2)}\n</script>`;
}

function generateBreadcrumbSchema(category, title, url) {
    return `\n<script type="application/ld+json">\n${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://studygyaan.in"
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": "Blog",
                "item": "https://studygyaan.in/blog"
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": category.replace(/_/g, ' '),
                "item": `https://studygyaan.in/blog/category/${category.toLowerCase()}`
            },
            {
                "@type": "ListItem",
                "position": 4,
                "name": title,
                "item": url
            }
        ]
    }, null, 2)}\n</script>`;
}

async function getSmartInternalLinks(currentCategory, currentTags, limit = 6) {
    try {
        const links = [];
        
        // Category-based links
        const categorySnapshot = await db.collection("blogs")
            .where("category", "==", currentCategory)
            .orderBy("date", "desc")
            .limit(3)
            .get();
        
        categorySnapshot.forEach(doc => {
            const data = doc.data();
            links.push({
                title: data.title,
                url: `https://studygyaan.in/blog/${data.slug || doc.id}`,
                category: data.category,
                relevance: "same-category"
            });
        });
        
        // Tag-based links
        if (currentTags && currentTags.length > 0) {
            const tagSnapshot = await db.collection("blogs")
                .where("tags", "array-contains-any", currentTags.slice(0, 3))
                .orderBy("date", "desc")
                .limit(3)
                .get();
            
            tagSnapshot.forEach(doc => {
                const data = doc.data();
                if (!links.find(l => l.url.includes(data.slug))) {
                    links.push({
                        title: data.title,
                        url: `https://studygyaan.in/blog/${data.slug || doc.id}`,
                        category: data.category,
                        relevance: "related-tags"
                    });
                }
            });
        }
        
        return links.slice(0, limit);
    } catch (e) {
        console.error("Internal links error:", e.message);
        return [];
    }
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
<meta property="article:published_time" content="${new Date().toISOString()}" />
<meta property="article:modified_time" content="${new Date().toISOString()}" />
<meta property="article:author" content="${data.author}" />
<meta property="article:section" content="${data.category}" />
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${data.imageUrl}">
<meta name="twitter:site" content="@StudyGyaan" />
<meta name="twitter:creator" content="@StudyGyaan" />
`;
}

async function generateAndUploadImage(imagePrompt, blogId, retryCount = 0) {
    try {
        const encodedPrompt = encodeURIComponent(imagePrompt);
        const timestamp = Date.now();
        const randomSeed = Math.floor(Math.random() * 10000);
        
        const pollUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&nologo=true&seed=${randomSeed}&enhance=true&model=flux`;
        
        const imgRes = await axios.get(pollUrl, { 
            responseType: 'arraybuffer', 
            timeout: 45000,
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/png,image/jpeg,image/*"
            }
        });
        
        const fileName = `blog_images/${blogId}_${timestamp}_${randomSeed}.png`;
        const file = bucket.file(fileName);
        const imageBuffer = Buffer.from(imgRes.data, 'binary');
        
        await file.save(imageBuffer, {
            metadata: { 
                contentType: 'image/png', 
                cacheControl: 'public, max-age=31536000',
                metadata: {
                    firebaseStorageDownloadTokens: crypto.randomUUID()
                }
            },
            public: true
        });
        
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log("✅ Image uploaded:", publicUrl);
        return publicUrl;
        
    } catch (imgError) {
        console.error("❌ IMAGE GENERATION FAILED:", imgError.message);
        
        if (retryCount < 2) {
            console.log(`🔄 Retrying image generation... (${retryCount + 1}/2)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return generateAndUploadImage(imagePrompt, blogId, retryCount + 1);
        }
        
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
        
        await axios.post(
            "https://indexing.googleapis.com/v3/urlNotifications:publish", 
            { url: url, type: "URL_UPDATED" }, 
            { 
                headers: { 
                    Authorization: `Bearer ${jwtClient.credentials.access_token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        
        console.log("🚀 Google Indexing API Success:", url);
        
    } catch (err) {
        if (err.response && err.response.status === 429 && retryCount < 3) {
            const waitTime = Math.pow(2, retryCount) * 15000;
            console.log(`⚠️ Rate Limit (429). Waiting ${waitTime/1000}s... (Attempt ${retryCount + 1})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return notifyGoogle(url, retryCount + 1);
        }
        console.error("❌ Indexing API Error:", err.response?.data || err.message);
    }
}

function checkAdvancedContentQuality(content) {
    const wordCount = content.split(/\s+/).length;
    const headingCount = (content.match(/<h[2-4][^>]*>/g) || []).length;
    const paragraphCount = (content.match(/<p[^>]*>/g) || []).length;
    const listCount = (content.match(/<(ul|ol)[^>]*>/g) || []).length;
    const tableCount = (content.match(/<table[^>]*>/g) || []).length;
    const strongCount = (content.match(/<strong[^>]*>/g) || []).length;
    const linkCount = (content.match(/<a [^>]*>/g) || []).length;
    
    return {
        wordCount: wordCount,
        hasEnoughContent: wordCount >= 1500,
        hasHeadings: headingCount >= 6,
        hasParagraphs: paragraphCount >= 12,
        hasLists: listCount >= 2,
        hasTables: tableCount >= 1,
        hasFormatting: strongCount >= 10,
        hasLinks: linkCount >= 3,
        readingTime: Math.ceil(wordCount / 200),
        score: calculateQualityScore(wordCount, headingCount, paragraphCount, listCount, tableCount)
    };
}

function calculateQualityScore(words, headings, paragraphs, lists, tables) {
    let score = 0;
    score += Math.min(words / 20, 100);
    score += headings * 5;
    score += paragraphs * 3;
    score += lists * 10;
    score += tables * 15;
    return Math.min(score, 100);
}

// =========================================================
// 🚀 4. ADVANCED AI CONTENT GENERATOR
// =========================================================

async function generateAdvancedBlogContent(category, topic, writingStyle, structure) {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite",
        generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.9,
            topP: 0.95,
            topK: 40
        }
    });

    const now = new Date();
    const currentDate = now.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const currentYear = now.getFullYear();

    const prompt = `
आप एक EXPERT SEO Content Writer हैं जो StudyGyaan.in के लिए premium quality blog लिखते हैं।

📌 TOPIC DETAILS:
- Category: "${category}"
- Main Topic: "${topic}"
- Writing Style: ${writingStyle}
- Content Structure: ${structure}
- Current Date: ${currentDate}

🎯 CONTENT REQUIREMENTS:

1. LENGTH & DEPTH:
   - Minimum 2000-2500 words (बहुत detailed)
   - हर section में depth और examples हों
   - Real-life scenarios और case studies include करें

2. STRUCTURE (HTML Format):
   - <h1> Main Title (catchy और unique)
   - <h2> Major Sections (कम से कम 6-8)
   - <h3> Sub-sections (जहाँ जरूरी हो)
   - <p> Paragraphs (short और readable)
   - <ul>/<ol> Lists (जहाँ applicable)
   - <table> Data Tables (कम से कम 2 tables)
   - <strong> Important points highlight करने के लिए

3. LANGUAGE & TONE:
   - Hindi + Hinglish mix (natural conversation जैसा)
   - Simple words use करें, difficult words को explain करें
   - Reader को directly address करें (आप, तुम)
   - Emojis strategically use करें (but not too much)

4. SEO OPTIMIZATION:
   - LSI Keywords naturally include करें
   - Internal linking opportunities mention करें
   - Meta description compelling हो

5. UNIQUE ELEMENTS:
   - Personal anecdotes या real examples
   - Latest ${currentYear} data और statistics
   - Step-by-step guides जहाँ possible
   - Pro tips और expert advice sections
   - Common mistakes और उनसे बचने के तरीके

6. ENGAGEMENT:
   - Questions पूछें readers से
   - Interactive elements suggest करें
   - Call-to-action include करें

7. FAQ SECTION:
   - कम से कम 8-10 FAQs
   - Real queries जो students पूछते हैं
   - Detailed answers (50-100 words each)

8. CONCLUSION:
   - Actionable takeaways
   - Motivation और encouragement
   - Next steps clearly बताएं

⚠️ AVOID:
- Generic या copied content
- Too technical jargon without explanation
- Long boring paragraphs
- Irrelevant information

FORMAT YOUR RESPONSE AS JSON:
{
  "aiTitle": "Compelling title WITHOUT date (50-60 characters)",
  "metaDescription": "Engaging 150-160 character description with primary keyword",
  "keywords": ["primary keyword", "secondary keyword", "LSI keyword 1", "LSI keyword 2", "LSI keyword 3"],
  "imagePrompt": "Detailed image description for AI generation",
  "content": "Full HTML formatted content (2000+ words) starting with engaging introduction",
  "excerpt": "150 character engaging summary for preview",
  "targetAudience": "Who is this article for",
  "uniqueAngle": "What makes this article different"
}

अब "${topic}" पर एक exceptional blog article लिखें जो readers को पूरी तरह engage करे और उनकी सभी doubts clear करे।
`;

    const result = await model.generateContent(prompt);
    const blogData = cleanJsonResponse(result.response.text());
    
    if (!blogData || !blogData.content || blogData.content.length < 1000) {
        throw new Error("AI generated insufficient content");
    }
    
    return blogData;
}

// =========================================================
// 🎯 5. MAIN BLOG GENERATION ENGINE
// =========================================================

async function generateDailyBlog() {
    try {
        console.log("🚀 Starting ADVANCED Auto-Blogger Engine v2.0...");
        console.log("⏰ Time:", new Date().toLocaleString('hi-IN'));

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        // 🎲 STEP 1: Random Category Selection
        const categories = Object.keys(MASTER_POOL);
        const randomCat = categories[Math.floor(Math.random() * categories.length)];
        console.log(`🎯 Selected Category: ${randomCat}`);

        // 🎲 STEP 2: Random Topic Selection
        const availableTopics = MASTER_POOL[randomCat];
        const rawTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
        console.log(`📝 Selected Topic: ${rawTopic}`);

        // 🎲 STEP 3: Random Writing Style
        const writingStyle = WRITING_STYLES[Math.floor(Math.random() * WRITING_STYLES.length)];
        console.log(`✍️ Writing Style: ${writingStyle}`);

        // 🎲 STEP 4: Random Content Structure
        const contentStructure = CONTENT_STRUCTURES[Math.floor(Math.random() * CONTENT_STRUCTURES.length)];
        console.log(`🏗️ Content Structure: ${contentStructure}`);

        // 🤖 STEP 5: Generate Content with AI
        console.log("🤖 Generating content with Gemini AI...");
        const blogData = await generateAdvancedBlogContent(randomCat, rawTopic, writingStyle, contentStructure);
        
        if (!blogData) {
            throw new Error("Failed to generate blog content");
        }

        console.log("✅ Content Generated Successfully!");
        console.log(`📏 Content Length: ${blogData.content.length} characters`);

        // 🔍 STEP 6: Quality Check
        const quality = checkAdvancedContentQuality(blogData.content);
        console.log("📊 Quality Metrics:", quality);

        if (!quality.hasEnoughContent) {
            console.log("⚠️ Content below quality threshold, regenerating...");
            return generateDailyBlog();
        }

        // 🔄 STEP 7: Check for Duplicates
        const isDuplicate = await checkDuplicateContent(blogData.aiTitle, blogData.content);
        if (isDuplicate) {
            console.log("⚠️ Similar content detected, regenerating with different approach...");
            return generateDailyBlog();
        }

        // 📅 STEP 8: Create Unique Title with Date Variation
        const now = new Date();
        const dateFormats = [
            now.toLocaleString('hi-IN', { month: 'long', year: 'numeric' }),
            now.toLocaleString('hi-IN', { month: 'short', year: 'numeric' }),
            `${now.getFullYear()}`,
            now.toLocaleString('hi-IN', { day: 'numeric', month: 'long' })
        ];
        const selectedDateFormat = dateFormats[Math.floor(Math.random() * dateFormats.length)];
        
        const powerPrefix = POWER_WORDS[Math.floor(Math.random() * POWER_WORDS.length)];
        const finalTitle = `${powerPrefix} ${blogData.aiTitle} (${selectedDateFormat})`;
        
        console.log(`📌 Final Title: ${finalTitle}`);

        // 🔗 STEP 9: Generate Unique Slug
        const slug = createDynamicSlug(finalTitle, randomCat);
        const blogUrl = `https://studygyaan.in/blog/${slug}`;
        console.log(`🔗 Blog URL: ${blogUrl}`);

        // 🎨 STEP 10: Generate Unique Image
        console.log("🎨 Generating unique image...");
        const uniqueImagePrompt = generateDynamicImagePrompt(randomCat, rawTopic, writingStyle);
        const imageUrl = await generateAndUploadImage(uniqueImagePrompt, slug);

        // 🔗 STEP 11: Get Smart Internal Links
        console.log("🔗 Fetching smart internal links...");
        const internalLinks = await getSmartInternalLinks(randomCat, blogData.keywords, 6);
        
        let linkHTML = '<div class="related-articles"><h2>📚 संबंधित महत्वपूर्ण लेख</h2><ul class="related-links">';
        internalLinks.forEach(link => {
            linkHTML += `<li><a href="${link.url}" rel="bookmark" title="${link.title}">${link.title}</a></li>`;
        });
        linkHTML += '</ul></div>';

        // 📋 STEP 12: Generate All Schema Markups
        const faqSchema = generateAdvancedFAQSchema(blogData.content);
        const articleSchema = generateArticleSchema({
            title: finalTitle,
            description: blogData.metaDescription,
            imageUrl: imageUrl,
            author: "StudyGyaan Team",
            url: blogUrl
        });
        const breadcrumbSchema = generateBreadcrumbSchema(randomCat, finalTitle, blogUrl);

        // 🔗 STEP 13: Merge All Content
        const finalContent = blogData.content + linkHTML + faqSchema + articleSchema + breadcrumbSchema;

        // 📊 STEP 14: Final Quality Score
        const finalQuality = checkAdvancedContentQuality(finalContent);
        console.log("📊 Final Quality Score:", finalQuality.score);

        // 💾 STEP 15: Save to Firestore with Complete Metadata
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
                imageUrl: imageUrl,
                author: "StudyGyaan Team",
                category: randomCat
            }),
            
            // Media
            imageUrl: imageUrl,
            imagePrompt: uniqueImagePrompt,
            
            // Attribution
            author: "StudyGyaan Team",
            type: "auto-blog-v2",
            
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
            
            // Advanced Metadata
            writingStyle: writingStyle,
            contentStructure: contentStructure,
            targetAudience: blogData.targetAudience,
            uniqueAngle: blogData.uniqueAngle,
            
            // Status
            status: "published",
            visibility: "public",
            featured: finalQuality.score > 85,
            
            // Indexing
            indexed: false,
            indexingAttempts: 0,
            lastIndexingAttempt: null
        };

        await db.collection("blogs").doc(slug).set(blogDocument);
        console.log(`💾 Published to Firestore: ${slug}`);

        // 🌐 STEP 16: Google Indexing
        console.log("🌐 Requesting Google Indexing...");
        await notifyGoogle(blogUrl);

        // 📢 STEP 17: Telegram Notification
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            try {
                const telegramMessage = `
🎉 <b>नया ब्लॉग पोस्ट लाइव!</b>

📌 <b>${finalTitle}</b>

📂 <b>Category:</b> ${randomCat.replace(/_/g, ' ')}
📊 <b>Quality Score:</b> ${Math.round(finalQuality.score)}/100
📝 <b>Words:</b> ${finalQuality.wordCount}
⏱️ <b>Reading Time:</b> ${finalQuality.readingTime} mins
✍️ <b>Style:</b> ${writingStyle}

🔗 <b>Read Here:</b> ${blogUrl}

#StudyGyaan #NewPost #${randomCat}
                `.trim();

                await axios.post(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
                    {
                        chat_id: TELEGRAM_CHAT_ID,
                        photo: imageUrl,
                        caption: telegramMessage,
                        parse_mode: 'HTML'
                    },
                    { timeout: 10000 }
                );
                console.log("📢 Telegram notification sent!");
            } catch (tgError) {
                console.error("❌ Telegram Error:", tgError.message);
            }
        }

        // 📊 STEP 18: Log Success Summary
        console.log("\n" + "=".repeat(60));
        console.log("✅ BLOG GENERATION SUCCESSFUL!");
        console.log("=".repeat(60));
        console.log(`📌 Title: ${finalTitle}`);
        console.log(`🔗 URL: ${blogUrl}`);
        console.log(`📂 Category: ${randomCat}`);
        console.log(`📊 Quality: ${Math.round(finalQuality.score)}/100`);
        console.log(`📝 Words: ${finalQuality.wordCount}`);
        console.log(`⏱️ Reading: ${finalQuality.readingTime} mins`);
        console.log(`🎨 Image: ${imageUrl}`);
        console.log("=".repeat(60) + "\n");

        return true;

    } catch (error) {
        console.error("\n" + "❌".repeat(30));
        console.error("CRITICAL ERROR IN AUTO-BLOG ENGINE");
        console.error("❌".repeat(30));
        console.error("Error Message:", error.message);
        console.error("Error Stack:", error.stack);
        console.error("❌".repeat(30) + "\n");
        return false;
    }
}

// =========================================================
// 🚀 6. EXECUTION HANDLER
// =========================================================

if (require.main === module) {
    console.log("🎬 Auto-Blogger V2.0 Started...");
    console.log("⏰ Execution Time:", new Date().toLocaleString('hi-IN'));
    
    generateDailyBlog()
        .then(success => {
            console.log(success ? 
                "\n✅ ✅ ✅ TASK COMPLETED SUCCESSFULLY ✅ ✅ ✅\n" : 
                "\n⚠️ ⚠️ ⚠️ TASK FINISHED WITH ERRORS ⚠️ ⚠️ ⚠️\n"
            );
            process.exit(success ? 0 : 1);
        })
        .catch(err => {
            console.error("\n❌ FATAL ERROR:", err.message);
            process.exit(1);
        });
}

module.exports = { generateDailyBlog };

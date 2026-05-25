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
        "Upcoming Railway Recruitment Vacancies", "SSC GD vs State Police Career Comparison", "High Salary Govt Jobs After 12th", 
        "Bank Exam Calendar Analysis", "Female Special Vacancies in Defense", "Latest Teaching Jobs in India",
        "UPSC Jobs Without Exam", "Railway Jobs for ITI Holders", "Top 10 Banking Jobs in India",
        "Government Jobs for Engineers", "Medical Field Government Jobs", "Teaching Jobs State Wise Analysis"
    ],
    "Syllabus_Guide": [
        "SSC CGL Tier 1 Detailed Syllabus", "UPSC Prelims Strategy for Beginners", "Railway Group D Math Important Topics",
        "UP Police Constable Hindi Preparation Guide", "English Grammar Hacks for Competitive Exams",
        "IBPS PO Complete Syllabus Breakdown", "NEET Preparation Roadmap", "JEE Advanced Physics Key Concepts",
        "NDA Mathematics Syllabus", "CLAT Legal Reasoning Preparation"
    ],
    "Student_Life_Motivation": [
        "How to handle Exam Stress and Anxiety", "Hostel Life vs Home Study Honest Review", "Student Budget Management Tips",
        "Success Story From Zero to Govt Employee", "How to avoid distractions while studying", "Power of Consistency in Competition",
        "Morning vs Night Study Which is Better", "Handling Family Pressure During Preparation", "Building Strong Study Habits",
        "Overcoming Failure in Competitive Exams", "Time Management Secrets for Students"
    ],
    "Academic_Deep_Dive": [
        "Indian History Important Dates of Modern Era", "General Science Biology Human Body Facts", "Indian Economy Understanding GDP and Inflation",
        "World Geography Major Continents and Oceans", "Computer Awareness for Govt Exams",
        "Polity Fundamental Rights Explained", "Ancient Indian History Key Topics", "Environmental Science for Exams",
        "Indian Constitution Important Articles", "Current Affairs Monthly Digest"
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
    "🔥 Breaking", "🚨 Latest Update", "⚡ Exclusive", "📊 Complete Guide", 
    "🎯 Target 2026", "📖 Special", "💡 Must Read", "🌟 Trending", 
    "📢 Important", "🎓 Expert Guide", "✨ New", "🔔 Alert", 
    "📝 Detailed", "🏆 Top", "💼 Career"
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
    "introduction then main points with subheadings then examples then FAQ then conclusion",
    "hook then problem statement then solution breakdown then real examples then action steps then FAQ",
    "story opening then context then detailed analysis then case studies then tips then FAQ then summary",
    "question based intro then answer sections then data tables then expert tips then FAQ then final thoughts",
    "trending news angle then background then impact analysis then future predictions then FAQ then conclusion"
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
    
    return `${baseSlug}-${category.toLowerCase()}-${timestamp}-${uniqueId}`.substring(0, 150);
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

async function checkDuplicateContent(title) {
    try {
        const titleWords = title.toLowerCase().split(' ').filter(w => w.length > 4).slice(0, 3);
        
        for (let word of titleWords) {
            const snapshot = await db.collection("blogs")
                .where('title', '>=', word)
                .where('title', '<=', word + '\uf8ff')
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                console.log("⚠️ Similar title found, will create unique variation");
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
        // Remove markdown code blocks
        let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        // Extract JSON object
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("No JSON object found in response");
            return null;
        }
        
        cleaned = jsonMatch[0];
        
        // Remove control characters and fix common issues
        cleaned = cleaned
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control chars
            .replace(/\\n/g, " ") // Replace newlines
            .replace(/\\t/g, " ") // Replace tabs
            .replace(/\s+/g, " ") // Normalize spaces
            .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
            .trim();
        
        // Try to parse
        const parsed = JSON.parse(cleaned);
        
        // Validate required fields
        if (!parsed.aiTitle || !parsed.content || !parsed.metaDescription) {
            console.error("Missing required fields in JSON");
            return null;
        }
        
        return parsed;
        
    } catch (e) {
        console.error("JSON Parse Error:", e.message);
        console.error("Raw text sample:", rawText.substring(0, 500));
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

// =========================================================
// 🔗 ADVANCED SMART INTERNAL LINKING SYSTEM
// =========================================================

async function fetchAllAvailableResources(category, keywords) {
    const resources = {
        blogs: [],
        jobs: [],
        mockTests: []
    };

    try {
        // 🎯 Fetch Related Blogs (Same Category)
        const categoryBlogsSnapshot = await db.collection("blogs")
            .where("category", "==", category)
            .where("status", "==", "published")
            .orderBy("date", "desc")
            .limit(10)
            .get();

        categoryBlogsSnapshot.forEach(doc => {
            const data = doc.data();
            resources.blogs.push({
                title: data.title,
                url: `https://studygyaan.in/blog/${data.slug || doc.id}`,
                category: data.category,
                relevance: "same-category",
                type: "blog"
            });
        });

        // 🎯 Fetch Related Blogs (By Tags/Keywords)
        if (keywords && keywords.length > 0) {
            const tagBlogsSnapshot = await db.collection("blogs")
                .where("tags", "array-contains-any", keywords.slice(0, 5))
                .where("status", "==", "published")
                .orderBy("date", "desc")
                .limit(10)
                .get();

            tagBlogsSnapshot.forEach(doc => {
                const data = doc.data();
                const exists = resources.blogs.find(b => b.url.includes(data.slug));
                if (!exists) {
                    resources.blogs.push({
                        title: data.title,
                        url: `https://studygyaan.in/blog/${data.slug || doc.id}`,
                        category: data.category,
                        relevance: "related-tags",
                        type: "blog"
                    });
                }
            });
        }

        // 💼 Fetch Related Jobs
        const jobsSnapshot = await db.collection("jobs")
            .where("status", "==", "active")
            .orderBy("postedDate", "desc")
            .limit(15)
            .get();

        jobsSnapshot.forEach(doc => {
            const data = doc.data();
            resources.jobs.push({
                title: data.title || data.jobTitle || "Government Job",
                url: `https://studygyaan.in/jobs/${doc.id}`,
                category: data.category || "Government Jobs",
                relevance: data.examName || data.department || "General",
                type: "job"
            });
        });

        // 📝 Fetch Related Mock Tests
        const mockTestsSnapshot = await db.collection("mockTests")
            .where("isActive", "==", true)
            .orderBy("createdAt", "desc")
            .limit(15)
            .get();

        mockTestsSnapshot.forEach(doc => {
            const data = doc.data();
            resources.mockTests.push({
                title: data.title || data.testName || "Practice Test",
                url: `https://studygyaan.in/mock-tests/${doc.id}`,
                category: data.category || data.subject || "General",
                relevance: data.examType || "Competitive Exam",
                type: "mockTest"
            });
        });

        console.log(`📊 Resources Found: ${resources.blogs.length} blogs, ${resources.jobs.length} jobs, ${resources.mockTests.length} mock tests`);

        return resources;

    } catch (error) {
        console.error("❌ Error fetching resources:", error.message);
        return resources;
    }
}

async function generateSmartInternalLinks(category, keywords, topic) {
    try {
        console.log("🔗 Fetching all available resources...");
        
        const allResources = await fetchAllAvailableResources(category, keywords);
        
        // AI will intelligently select links
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-lite",
            generationConfig: { 
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        });

        const resourcesJson = JSON.stringify({
            blogs: allResources.blogs.slice(0, 15),
            jobs: allResources.jobs.slice(0, 15),
            mockTests: allResources.mockTests.slice(0, 15)
        }, null, 2);

        const linkPrompt = `You are an SEO expert who creates smart internal linking strategies.

CURRENT BLOG TOPIC: "${topic}"
CATEGORY: "${category}"
KEYWORDS: ${keywords.join(', ')}

AVAILABLE RESOURCES:
${resourcesJson}

TASK: Select 8-12 MOST RELEVANT resources (mix of blogs, jobs, and mock tests) that would genuinely help readers.

RULES:
- Choose resources that are contextually relevant to the topic
- Mix different types: 4-6 blogs, 2-3 jobs, 2-3 mock tests
- Prioritize high relevance
- Avoid duplicates
- Each link should add value to the reader

Return ONLY a JSON array with selected resources:
[
  {
    "title": "Resource title",
    "url": "Full URL",
    "type": "blog/job/mockTest",
    "reason": "Why this is relevant (1 sentence)"
  }
]`;

        const result = await model.generateContent(linkPrompt);
        const responseText = result.response.text();
        
        // Clean and parse AI response
        let cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        
        if (!jsonMatch) {
            console.log("⚠️ AI didn't return valid links, using fallback");
            return createFallbackLinks(allResources);
        }

        const selectedLinks = JSON.parse(jsonMatch[0]);
        console.log(`✅ AI selected ${selectedLinks.length} smart internal links`);
        
        return selectedLinks;

    } catch (error) {
        console.error("❌ Smart linking error:", error.message);
        return [];
    }
}

function createFallbackLinks(allResources) {
    const fallback = [];
    
    // Add 4 random blogs
    const shuffledBlogs = allResources.blogs.sort(() => 0.5 - Math.random()).slice(0, 4);
    fallback.push(...shuffledBlogs.map(b => ({
        title: b.title,
        url: b.url,
        type: "blog",
        reason: "Related content"
    })));
    
    // Add 2 random jobs
    const shuffledJobs = allResources.jobs.sort(() => 0.5 - Math.random()).slice(0, 2);
    fallback.push(...shuffledJobs.map(j => ({
        title: j.title,
        url: j.url,
        type: "job",
        reason: "Career opportunity"
    })));
    
    // Add 2 random mock tests
    const shuffledTests = allResources.mockTests.sort(() => 0.5 - Math.random()).slice(0, 2);
    fallback.push(...shuffledTests.map(t => ({
        title: t.title,
        url: t.url,
        type: "mockTest",
        reason: "Practice test"
    })));
    
    return fallback;
}

function createInternalLinksHTML(smartLinks) {
    if (!smartLinks || smartLinks.length === 0) {
        return "";
    }

    // Group by type
    const blogs = smartLinks.filter(l => l.type === "blog");
    const jobs = smartLinks.filter(l => l.type === "job");
    const mockTests = smartLinks.filter(l => l.type === "mockTest");

    let html = '<div class="related-resources-section" style="margin: 40px 0; padding: 30px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">';
    
    html += '<h2 style="color: #2c3e50; font-size: 28px; margin-bottom: 25px; text-align: center; border-bottom: 3px solid #3498db; padding-bottom: 15px;">📚 आपके लिए चुने गए महत्वपूर्ण संसाधन</h2>';

    // Blogs Section
    if (blogs.length > 0) {
        html += '<div class="blogs-section" style="margin-bottom: 25px;">';
        html += '<h3 style="color: #34495e; font-size: 22px; margin-bottom: 15px; display: flex; align-items: center;"><span style="margin-right: 10px;">📖</span> संबंधित लेख पढ़ें</h3>';
        html += '<ul style="list-style: none; padding: 0;">';
        blogs.forEach(link => {
            html += `<li style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); transition: transform 0.2s;">
                <a href="${link.url}" rel="bookmark" title="${link.title}" style="text-decoration: none; color: #2980b9; font-weight: 600; font-size: 16px; display: block;">
                    🔗 ${link.title}
                </a>
                <small style="color: #7f8c8d; display: block; margin-top: 5px; font-size: 13px;">${link.reason || 'Related content'}</small>
            </li>`;
        });
        html += '</ul></div>';
    }

    // Jobs Section
    if (jobs.length > 0) {
        html += '<div class="jobs-section" style="margin-bottom: 25px;">';
        html += '<h3 style="color: #34495e; font-size: 22px; margin-bottom: 15px; display: flex; align-items: center;"><span style="margin-right: 10px;">💼</span> नौकरी के अवसर देखें</h3>';
        html += '<ul style="list-style: none; padding: 0;">';
        jobs.forEach(link => {
            html += `<li style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <a href="${link.url}" rel="bookmark" title="${link.title}" style="text-decoration: none; color: #27ae60; font-weight: 600; font-size: 16px; display: block;">
                    🎯 ${link.title}
                </a>
                <small style="color: #7f8c8d; display: block; margin-top: 5px; font-size: 13px;">${link.reason || 'Job opportunity'}</small>
            </li>`;
        });
        html += '</ul></div>';
    }

    // Mock Tests Section
    if (mockTests.length > 0) {
        html += '<div class="mock-tests-section" style="margin-bottom: 10px;">';
        html += '<h3 style="color: #34495e; font-size: 22px; margin-bottom: 15px; display: flex; align-items: center;"><span style="margin-right: 10px;">📝</span> प्रैक्टिस टेस्ट दें</h3>';
        html += '<ul style="list-style: none; padding: 0;">';
        mockTests.forEach(link => {
            html += `<li style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <a href="${link.url}" rel="bookmark" title="${link.title}" style="text-decoration: none; color: #e74c3c; font-weight: 600; font-size: 16px; display: block;">
                    ✍️ ${link.title}
                </a>
                <small style="color: #7f8c8d; display: block; margin-top: 5px; font-size: 13px;">${link.reason || 'Practice test'}</small>
            </li>`;
        });
        html += '</ul></div>';
    }

    html += '<p style="text-align: center; margin-top: 20px; color: #7f8c8d; font-size: 14px;">💡 ये सभी संसाधन आपकी तैयारी को बेहतर बनाने के लिए चुने गए हैं</p>';
    html += '</div>';

    return html;
}

// =========================================================
// 🛠️ OTHER UTILITY FUNCTIONS
// =========================================================

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
        hasEnoughContent: wordCount >= 1200,
        hasHeadings: headingCount >= 5,
        hasParagraphs: paragraphCount >= 10,
        hasLists: listCount >= 2,
        hasTables: tableCount >= 0,
        hasFormatting: strongCount >= 8,
        hasLinks: linkCount >= 0,
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

async function generateAdvancedBlogContent(category, topic, writingStyle, structure, retryCount = 0) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { 
                temperature: 0.85,
                topP: 0.9,
                topK: 40,
                maxOutputTokens: 8192
            }
        });

        const now = new Date();
        const currentDate = now.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        const currentYear = now.getFullYear();

        const prompt = `You are an EXPERT SEO Content Writer for StudyGyaan.in writing premium quality educational blogs in Hindi-English mix.

TOPIC: "${topic}"
CATEGORY: "${category}"
STYLE: ${writingStyle}
STRUCTURE: ${structure}
DATE: ${currentDate}

CONTENT REQUIREMENTS:
- Length: 1800-2200 words minimum
- Language: Natural Hindi-Hinglish mix (conversational tone)
- Structure: HTML format with h2, h3, p, ul, ol, table tags
- Include: Real examples, data tables, step-by-step guides
- FAQ Section: 6-8 detailed questions with answers
- SEO: Natural keyword placement

IMPORTANT: Return ONLY valid JSON without any markdown formatting or code blocks.

JSON FORMAT:
{
  "aiTitle": "Catchy title without date in 50-60 characters",
  "metaDescription": "Compelling 150-160 char description with primary keyword",
  "keywords": ["primary keyword", "secondary keyword", "LSI keyword 1", "LSI keyword 2"],
  "imagePrompt": "Detailed image description for AI generation",
  "content": "Full HTML formatted content 1800+ words starting with engaging intro",
  "excerpt": "150 char engaging summary",
  "targetAudience": "Target reader description",
  "uniqueAngle": "What makes this unique"
}

Write exceptional content on "${topic}" that fully engages readers and clears all doubts.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        console.log("🔍 AI Response received, parsing...");
        
        const blogData = cleanJsonResponse(responseText);
        
        if (!blogData || !blogData.content || blogData.content.length < 1000) {
            if (retryCount < 2) {
                console.log(`⚠️ Invalid response, retrying... (${retryCount + 1}/2)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return generateAdvancedBlogContent(category, topic, writingStyle, structure, retryCount + 1);
            }
            throw new Error("AI generated insufficient content after retries");
        }
        
        // Ensure all required fields have defaults
        blogData.keywords = blogData.keywords || [topic, category, "study material", "exam preparation"];
        blogData.excerpt = blogData.excerpt || blogData.metaDescription;
        blogData.targetAudience = blogData.targetAudience || "Students preparing for competitive exams";
        blogData.uniqueAngle = blogData.uniqueAngle || "Comprehensive guide with practical examples";
        
        return blogData;
        
    } catch (error) {
        console.error("❌ Content generation error:", error.message);
        if (retryCount < 2) {
            console.log(`🔄 Retrying content generation... (${retryCount + 1}/2)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return generateAdvancedBlogContent(category, topic, writingStyle, structure, retryCount + 1);
        }
        throw error;
    }
}

// =========================================================
// 🎯 5. MAIN BLOG GENERATION ENGINE
// =========================================================

async function generateDailyBlog() {
    try {
        console.log("🚀 Starting ADVANCED Auto-Blogger Engine v2.1...");
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
        
        console.log("✅ Content Generated Successfully!");
        console.log(`📏 Content Length: ${blogData.content.length} characters`);

        // 🔍 STEP 6: Quality Check
        const quality = checkAdvancedContentQuality(blogData.content);
        console.log("📊 Quality Metrics:", {
            words: quality.wordCount,
            headings: quality.hasHeadings,
            score: Math.round(quality.score)
        });

        if (!quality.hasEnoughContent) {
            console.log("⚠️ Content below quality threshold, regenerating...");
            return generateDailyBlog();
        }

        // 📅 STEP 7: Create Unique Title with Date Variation
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

        // 🔗 STEP 8: Generate Unique Slug
        const slug = createDynamicSlug(finalTitle, randomCat);
        const blogUrl = `https://studygyaan.in/blog/${slug}`;
        console.log(`🔗 Blog URL: ${blogUrl}`);

        // 🎨 STEP 9: Generate Unique Image
        console.log("🎨 Generating unique image...");
        const uniqueImagePrompt = generateDynamicImagePrompt(randomCat, rawTopic, writingStyle);
        const imageUrl = await generateAndUploadImage(uniqueImagePrompt, slug);

        // 🔗 STEP 10: AI-Powered Smart Internal Linking
        console.log("🤖 AI is selecting smart internal links...");
        const smartLinks = await generateSmartInternalLinks(randomCat, blogData.keywords, rawTopic);
        const linkHTML = createInternalLinksHTML(smartLinks);
        console.log(`✅ Added ${smartLinks.length} AI-selected internal links`);

        // 📋 STEP 11: Generate All Schema Markups
        const faqSchema = generateAdvancedFAQSchema(blogData.content);
        const articleSchema = generateArticleSchema({
            title: finalTitle,
            description: blogData.metaDescription,
            imageUrl: imageUrl,
            author: "StudyGyaan Team",
            url: blogUrl
        });
        const breadcrumbSchema = generateBreadcrumbSchema(randomCat, finalTitle, blogUrl);

        // 🔗 STEP 12: Merge All Content
        const finalContent = blogData.content + linkHTML + faqSchema + articleSchema + breadcrumbSchema;

        // 📊 STEP 13: Final Quality Score
        const finalQuality = checkAdvancedContentQuality(finalContent);
        console.log("📊 Final Quality Score:", Math.round(finalQuality.score));

        // 💾 STEP 14: Save to Firestore with Complete Metadata
        const blogDocument = {
            // Core Content
            title: finalTitle,
            slug: slug,
            description: blogData.metaDescription,
            excerpt: blogData.excerpt,
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
            
            // Internal Links
            internalLinks: smartLinks,
            internalLinksCount: smartLinks.length,
            
            // Attribution
            author: "StudyGyaan Team",
            type: "auto-blog-v2.1",
            
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

        // 🌐 STEP 15: Google Indexing
        console.log("🌐 Requesting Google Indexing...");
        await notifyGoogle(blogUrl);

        // 📢 STEP 16: Telegram Notification
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            try {
                const telegramMessage = `
🎉 <b>नया ब्लॉग पोस्ट लाइव!</b>

📌 <b>${finalTitle}</b>

📂 <b>Category:</b> ${randomCat.replace(/_/g, ' ')}
📊 <b>Quality Score:</b> ${Math.round(finalQuality.score)}/100
📝 <b>Words:</b> ${finalQuality.wordCount}
⏱️ <b>Reading Time:</b> ${finalQuality.readingTime} mins
🔗 <b>Internal Links:</b> ${smartLinks.length} (AI-selected)
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

        // 📊 STEP 17: Log Success Summary
        console.log("\n" + "=".repeat(60));
        console.log("✅ BLOG GENERATION SUCCESSFUL!");
        console.log("=".repeat(60));
        console.log(`📌 Title: ${finalTitle}`);
        console.log(`🔗 URL: ${blogUrl}`);
        console.log(`📂 Category: ${randomCat}`);
        console.log(`📊 Quality: ${Math.round(finalQuality.score)}/100`);
        console.log(`📝 Words: ${finalQuality.wordCount}`);
        console.log(`⏱️ Reading: ${finalQuality.readingTime} mins`);
        console.log(`🔗 AI Internal Links: ${smartLinks.length}`);
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
    console.log("🎬 Auto-Blogger V2.1 Started...");
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

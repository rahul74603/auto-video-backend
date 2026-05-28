const fs = require('fs');
const axios = require('axios');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { google } = require('googleapis');
const admin = require("firebase-admin");
const { createCanvas, registerFont } = require('canvas');
const textToSpeech = require('@google-cloud/text-to-speech');
const ffmpegPath = require('ffmpeg-static');
const FormData = require('form-data');
require("dotenv").config();

// =========================================================
// 🔐 0. FIREBASE INITIALIZATION
// =========================================================
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

// =========================================================
// 🅰️ 0.1. HINDI FONT DOWNLOADER ENGINE
// =========================================================
async function setupHindiFont() {
    const fontPath = path.join(os.tmpdir(), 'HindiFont-Bold.ttf');
    if (!fs.existsSync(fontPath)) {
        console.log('⬇️ हिंदी फॉन्ट डाउनलोड हो रहा है...');
        const response = await axios({
            url: 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Bold.ttf',
            method: 'GET',
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(fontPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        console.log('✅ हिंदी फॉन्ट डाउनलोड हो गया!');
    }
    registerFont(fontPath, { family: 'HindiFont' });
}

// =========================================================
// 🔐 1. YOUTUBE AUTHENTICATION
// =========================================================
async function getYouTubeClient() {
    const credentialsVar = process.env.GMAIL_CREDENTIALS;
    const tokenVar = process.env.YOUTUBE_TOKEN;

    if (!credentialsVar || !tokenVar || tokenVar === "test" || tokenVar === "temp_key") {
        throw new Error("❌ GMAIL_CREDENTIALS या YOUTUBE_TOKEN नहीं मिला!");
    }

    let creds, token;
    try {
        creds = JSON.parse(credentialsVar);
        token = JSON.parse(tokenVar);
    } catch (e) {
        throw new Error("❌ YouTube Secrets Invalid JSON format.");
    }

    const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);
    return google.youtube({ version: 'v3', auth: oAuth2Client });
}

// =========================================================
// 📱 2. FACEBOOK UPLOAD ENGINE
// =========================================================
async function uploadToFacebook(videoPath, description) {
    const FB_PAGE_ID = process.env.FB_PAGE_ID;
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

    if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
        console.log('⚠️ Facebook skip किया।');
        return;
    }

    console.log('📱 Facebook पर अपलोड शुरू...');
    const formData = new FormData();
    formData.append('access_token', FB_PAGE_TOKEN);
    formData.append('source', fs.createReadStream(videoPath));
    formData.append('description', description);

    try {
        const fbRes = await axios.post(
            `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/videos`,
            formData,
            { headers: formData.getHeaders() }
        );
        console.log('✅ Facebook वीडियो live! ID: ' + fbRes.data.id);
    } catch (fbErr) {
        console.error('❌ Facebook अपलोड फेल:', fbErr.response ? fbErr.response.data : fbErr.message);
    }
}

// =========================================================
// 🧠 3. DYNAMIC KEYWORD ENGINE (SEO POWERHOUSE)
// =========================================================

// 🎯 Category-wise Trending Keywords Database
const CATEGORY_KEYWORDS = {
    'Railway': [
        'RRB NTPC 2025', 'Railway Bharti 2025', 'RRB Group D', 'Railway Vacancy 2025',
        'NTPC CBT 2025', 'Railway Recruitment', 'Junior Engineer Railway', 'RRB ALP 2025',
        'Indian Railway Jobs', 'Railway Exam Preparation', 'RRB NTPC Syllabus',
        'Railway GK Questions', 'RRB Previous Year Paper', 'Railway Exam Date 2025'
    ],
    'SSC': [
        'SSC CGL 2025', 'SSC CHSL 2025', 'SSC MTS 2025', 'SSC GD 2025',
        'Staff Selection Commission', 'SSC Exam Preparation', 'SSC CGL Syllabus 2025',
        'SSC Tier 1 2025', 'SSC Previous Year Questions', 'SSC GK Hindi',
        'SSC Math Tricks', 'SSC English Grammar', 'SSC Reasoning Questions',
        'SSC CPO 2025', 'SSC JE 2025', 'Multi Tasking Staff Recruitment'
    ],
    'Banking': [
        'Bank PO 2025', 'IBPS PO 2025', 'SBI PO 2025', 'Bank Clerk 2025',
        'IBPS Clerk 2025', 'RBI Grade B 2025', 'Banking Exam Preparation',
        'Bank Exam GK', 'Current Affairs Banking', 'Banking Awareness 2025',
        'SBI Clerk 2025', 'Canara Bank PO', 'Bank Exam Syllabus',
        'Financial Awareness', 'IBPS RRB 2025'
    ],
    'Police': [
        'UP Police 2025', 'Delhi Police Bharti', 'Bihar Police 2025', 'Rajasthan Police',
        'MP Police Constable', 'Police Exam Preparation', 'Constable Bharti 2025',
        'Sub Inspector SI Bharti', 'Police GK Questions', 'Physical Test Police',
        'Police Syllabus Hindi', 'State Police Vacancy 2025'
    ],
    'UPSC': [
        'UPSC 2025', 'IAS Preparation', 'IPS Exam', 'Civil Services 2025',
        'UPSC Prelims 2025', 'UPSC Mains', 'UPSC Current Affairs', 'UPSC GS Paper',
        'IAS Topper Strategy', 'UPSC Syllabus Hindi', 'UPSC Study Material',
        'Optional Subject UPSC', 'CSAT 2025', 'UPSC Mock Test'
    ],
    'State': [
        'Sarkari Naukri 2025', 'State PSC 2025', 'BPSC 2025', 'UPPSC 2025',
        'RPSC 2025', 'MPSC 2025', 'Government Jobs 2025', 'Sarkari Result 2025',
        'State Government Vacancy', 'PCS Exam Preparation', 'State Board Exam'
    ],
    'Default': [
        'Sarkari Naukri 2025', 'Government Jobs 2025', 'Exam Preparation 2025',
        'Free Study Material', 'Online Mock Test', 'Current Affairs 2025',
        'GK Questions Hindi', 'General Knowledge 2025', 'Competitive Exam Tips',
        'Study Tips Hindi', 'Exam Date 2025', 'Admit Card 2025', 'Result 2025'
    ]
};

// 📊 High-Search-Volume Base Tags
const VIRAL_BASE_TAGS = [
    'Sarkari Result', 'Sarkari Naukri', 'Govt Jobs 2025', 'Free PDF Download',
    'Study Material Hindi', 'Exam Preparation', 'Online Test Series',
    'Current Affairs Hindi', 'GK in Hindi', 'StudyGyaan', 'Competitive Exam',
    'Latest Vacancy 2025', 'Admit Card', 'Answer Key 2025', 'Cut Off Marks',
    'Syllabus 2025', 'Previous Year Paper', 'Mock Test Free', 'Notes PDF',
    'सरकारी नौकरी', 'सरकारी रिजल्ट', 'परीक्षा तैयारी', 'फ्री नोट्स'
];

function detectCategory(title, content) {
    const text = (title + ' ' + content).toLowerCase();
    if (text.includes('rrb') || text.includes('railway') || text.includes('ntpc') || text.includes('group d')) return 'Railway';
    if (text.includes('ssc') || text.includes('cgl') || text.includes('chsl') || text.includes('mts')) return 'SSC';
    if (text.includes('bank') || text.includes('ibps') || text.includes('sbi') || text.includes('rbi')) return 'Banking';
    if (text.includes('police') || text.includes('constable') || text.includes('si ')) return 'Police';
    if (text.includes('upsc') || text.includes('ias') || text.includes('ips') || text.includes('civil service')) return 'UPSC';
    if (text.includes('psc') || text.includes('uppsc') || text.includes('bpsc') || text.includes('rpsc')) return 'State';
    return 'Default';
}

function extractTitleKeywords(title) {
    // Important words निकालो title से
    const stopWords = ['और', 'की', 'के', 'का', 'में', 'से', 'को', 'है', 'हैं', 'यह', 'वह',
        'for', 'the', 'and', 'are', 'was', 'has', 'have', 'will', 'with', 'from',
        'that', 'this', 'they', 'not', 'but', 'out', 'now', 'get'];
    
    return title.split(/[\s,\-|]+/)
        .filter(w => w.length > 2 && !stopWords.includes(w.toLowerCase()))
        .map(w => w.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '')) // Hindi + English chars
        .filter(w => w.length > 2)
        .slice(0, 8);
}

function generateDynamicSEO(blogData, blogCat) {
    const title = blogData.title || '';
    const content = blogData.description || blogData.content || '';
    
    // 🎯 Auto-detect actual category
    const detectedCat = detectCategory(title, content);
    const finalCat = blogCat !== 'Default' ? blogCat : detectedCat;
    
    // 📊 Category-specific keywords लो
    const catKeywords = CATEGORY_KEYWORDS[finalCat] || CATEGORY_KEYWORDS['Default'];
    
    // 🔑 Title से specific keywords निकालो
    const titleKeywords = extractTitleKeywords(title);
    
    // 📅 Year/Month dynamic keywords
    const now = new Date();
    const year = now.getFullYear();
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[now.getMonth()];
    
    const timeKeywords = [
        `${finalCat} ${year}`, `Exam ${year}`, `${month} ${year} Update`,
        `Latest ${finalCat} Update`, `New Vacancy ${year}`
    ];
    
    // 🔗 Post link
    const identifier = blogData.slug || blogData.id;
    const postLink = identifier ? `https://studygyaan.in/blog/${identifier}` : 'https://studygyaan.in';
    
    // 🏷️ Final Tags - Unique और Ranked
    let allTags = [];
    
    // Priority order: Title keywords > Category keywords > Time keywords > Base tags
    const tagSources = [
        ...titleKeywords,
        ...catKeywords,
        ...timeKeywords,
        ...VIRAL_BASE_TAGS
    ];
    
    // Deduplicate करो
    const seen = new Set();
    for (let tag of tagSources) {
        const clean = tag.trim();
        if (clean && !seen.has(clean.toLowerCase())) {
            seen.add(clean.toLowerCase());
            allTags.push(clean);
        }
    }
    
    // YouTube max 500 chars for tags
    let finalTags = [];
    let tagLength = 0;
    for (let tag of allTags) {
        if (tagLength + tag.length + 2 <= 490) {
            finalTags.push(tag);
            tagLength += tag.length + 2;
        }
    }
    
    // 📝 Power Description (YouTube Algorithm Friendly)
    const hashtags = finalTags.slice(0, 3).map(t => '#' + t.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '')).join(' ');
    const keywordString = finalTags.slice(0, 20).join(' | ');
    
    const description = generatePowerDescription(title, postLink, finalCat, keywordString, hashtags, year);
    
    console.log(`✅ SEO Generated: ${finalTags.length} tags | Category: ${finalCat}`);
    
    return {
        tags: finalTags,
        description: description,
        postLink: postLink,
        detectedCategory: finalCat
    };
}

function generatePowerDescription(title, postLink, category, keywords, hashtags, year) {
    // YouTube Algorithm के लिए Perfect Description Structure
    return `${title} | ${category} ${year} | StudyGyaan

📌 इस topic की पूरी जानकारी यहाँ से पढ़ें:
🔗 ${postLink}

━━━━━━━━━━━━━━━━━━━━━━━
📚 FREE STUDY MATERIAL पाने के लिए अभी Visit करें:
👉 https://studygyaan.in

✅ Website पर मिलेगा:
• Free PDF Notes Download
• Online Mock Test Series  
• Latest Vacancy Updates
• Previous Year Question Papers
• Cut Off & Answer Key
━━━━━━━━━━━━━━━━━━━━━━━

🔔 SUBSCRIBE करें और Bell Icon दबाएं ताकि कोई भी Update Miss न हो!

📲 Telegram Join करें - Daily Free Notes पाएं!

━━━━━━━━━━━━━━━━━━━━━━━
⏰ VIDEO CHAPTERS:
00:00 - Introduction
00:30 - Important Updates
02:00 - Key Points
02:45 - How to Prepare
03:00 - Study Material & Website

━━━━━━━━━━━━━━━━━━━━━━━
🔎 KEYWORDS:
${keywords}

━━━━━━━━━━━━━━━━━━━━━━━
${hashtags} #StudyGyaan #SarkariNaukri #${category}

⚠️ DISCLAIMER: यह channel purely educational purposes के लिए है। सभी जानकारी Official Sources से ली जाती है।`;
}

// =========================================================
// 🏷️ VIRAL TITLE GENERATOR
// =========================================================
function generateViralTitle(blogTitle, category) {
    const now = new Date();
    const year = now.getFullYear();
    
    // Category-specific hooks जो actually काम करते हैं
    const categoryHooks = {
        'Railway': ['RRB Official Update', 'Railway Big News', 'Railway Bharti Update'],
        'SSC': ['SSC Official Notice', 'SSC Big Update', 'SSC Exam Alert'],
        'Banking': ['Bank Exam Update', 'IBPS Official News', 'Banking Big Alert'],
        'Police': ['Police Bharti Update', 'Police Exam News', 'Constable Vacancy Update'],
        'UPSC': ['UPSC Official Update', 'IAS Exam News', 'Civil Services Alert'],
        'State': ['Sarkari Naukri Update', 'Govt Job Alert', 'State Exam News'],
        'Default': ['Exam Update', 'Sarkari Result', 'Important Notice']
    };
    
    const hooks = categoryHooks[category] || categoryHooks['Default'];
    const hook = hooks[Math.floor(Math.random() * hooks.length)];
    
    // Clean title - 60 chars max for title part
    let cleanTitle = blogTitle
        .replace(/[|]/g, '-')
        .trim();
    
    // Title formats जो YouTube में rank करते हैं
    const formats = [
        `${cleanTitle} ${year} | ${hook} | StudyGyaan`,
        `${hook}: ${cleanTitle} | Free Study Material | StudyGyaan`,
        `${cleanTitle} - Complete Guide ${year} | ${hook} | StudyGyaan`
    ];
    
    let finalTitle = formats[Math.floor(Math.random() * formats.length)];
    
    // YouTube 100 char limit
    if (finalTitle.length > 100) {
        finalTitle = `${cleanTitle.substring(0, 55)} | ${hook} ${year} | StudyGyaan`;
    }
    if (finalTitle.length > 100) {
        finalTitle = finalTitle.substring(0, 97) + '...';
    }
    
    return finalTitle;
}

// =========================================================
// 💬 PINNED COMMENT ENGINE (High Engagement)
// =========================================================
function generatePinnedComment(postLink, category) {
    const templates = [
        `📌 इस Video से Related FREE STUDY MATERIAL यहाँ मिलेगा:\n🔗 ${postLink}\n\n✅ Website पर Free में पाएं:\n• PDF Notes Download\n• Mock Test Series\n• Latest Updates\n\n👉 Visit: https://studygyaan.in\n\n🔔 SUBSCRIBE करें & Bell दबाएं!`,
        
        `🎯 Complete Notes & PDF Download करें:\n🔗 ${postLink}\n\n📚 StudyGyaan.in पर मिलेगा:\n✅ Free Mock Test\n✅ Previous Year Papers\n✅ Latest Vacancy Updates\n\n👉 https://studygyaan.in\n\n❓ कोई सवाल है? Comment करें!`,
        
        `🔥 इस topic का FREE PDF & Full Detail:\n👇 ${postLink}\n\n━━━━━━━━━━━━\n📱 Daily Updates के लिए:\n🌐 Website: studygyaan.in\n\n💡 Tip: Bookmark करें ताकि याद रहे!\n\n👍 Video पसंद आई? LIKE करें!`
    ];
    
    return templates[Math.floor(Math.random() * templates.length)];
}

// =========================================================
// 🧠 4. GEMINI API SCRIPT WRITER
// =========================================================
async function generateScriptWithGemini(blogTitle, blogContent) {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("❌ GEMINI_API_KEY नहीं मिला!");

    console.log("🧠 Gemini से Script लिखवाई जा रही है...");

    const prompt = `तुम एक बहुत बेहतरीन YouTube Educational Content Creator हो। 
    नीचे दिए गए ब्लॉग पोस्ट के आधार पर एक 3 मिनट की शानदार YouTube वीडियो स्क्रिप्ट लिखो।
    
    स्क्रिप्ट हिंदी में होनी चाहिए (देवनागरी लिपि में)।
    
    Structure:
    1. पहले 15 सेकंड में एक जबरदस्त Hook - ऐसा सवाल या statement जो viewer को रोके
    2. बीच में मुख्य जानकारी - Simple और Clear भाषा में
    3. अंत में Call to Action - StudyGyaan.in website पर जाने के लिए कहो और Like+Subscribe के लिए
    
    Rules:
    - जब भी website का नाम आए तो "स्टडी ज्ञान डॉट इन" लिखें
    - केवल बोले जाने वाले शब्द लिखो
    - कोई brackets, asterisk, या extra formatting मत लिखो
    - Natural और engaging बोलने जैसी भाषा रखो
    
    ब्लॉग टाइटल: ${blogTitle}
    ब्लॉग जानकारी: ${blogContent}`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const script = response.data.candidates[0].content.parts[0].text;
        console.log("✅ Script ready!");
        return script.replace(/[\*\#\_\[\]]/g, '').trim();
    } catch (error) {
        throw new Error("❌ Gemini API Error: " + (error.response ? JSON.stringify(error.response.data) : error.message));
    }
}

// =========================================================
// 🖼️ 5. LANDSCAPE POSTER ENGINE (16:9 YouTube)
// =========================================================
function createLandscapePoster(title, outputPath, category) {
    console.log('🖼️ YouTube Poster बन रहा है...');
    const width = 1920, height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Category-based gradient colors
    const gradients = {
        'Railway': ['#0a192f', '#1a3a5c', '#0066cc'],
        'SSC': ['#1a0a00', '#4a1500', '#cc4400'],
        'Banking': ['#001a00', '#0a3300', '#006600'],
        'Police': ['#1a0a2e', '#2d1b69', '#7c3aed'],
        'UPSC': ['#0f0f1a', '#1a1a3e', '#2244cc'],
        'Default': ['#0f2027', '#203a43', '#2c5364']
    };
    
    const colors = gradients[category] || gradients['Default'];
    let grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.5, colors[1]);
    grad.addColorStop(1, colors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Grid pattern overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 80) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    function wrapText(context, text, x, y, maxWidth, lineHeight) {
        let words = text.split(' '), line = '';
        let lines = [];
        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            if (context.measureText(testLine).width > maxWidth && n > 0) {
                lines.push({ text: line, y: y });
                line = words[n] + ' ';
                y += lineHeight;
            } else { line = testLine; }
        }
        lines.push({ text: line, y: y });
        lines.forEach(l => context.fillText(l.text, x, l.y));
        return y;
    }

    // 🔴 TOP BADGE
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.roundRect(width/2 - 350, 40, 700, 90, 45);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px "HindiFont", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔔 STUDYGYAAN.IN EXCLUSIVE', width/2, 85);

    // ⭐ MAIN TITLE
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 95px "HindiFont", sans-serif';
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 20;
    ctx.textBaseline = 'top';
    const titleY = wrapText(ctx, title, width/2, 200, 1700, 120);
    ctx.shadowBlur = 0;

    // 🟡 BOTTOM BAR
    const barGrad = ctx.createLinearGradient(0, 900, width, 1080);
    barGrad.addColorStop(0, '#FF6B00');
    barGrad.addColorStop(1, '#FFD700');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 900, width, 180);
    
    ctx.fillStyle = '#000000';
    ctx.font = '900 62px "HindiFont", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('👇 FULL DETAILS + FREE PDF LINK IN DESCRIPTION 👇', width/2, 990);

    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
    console.log('✅ Poster save हो गया!');
}

// =========================================================
// 🎬 6. MAIN LONG VIDEO GENERATOR ENGINE
// =========================================================
async function generateLongVideo() {
    console.log("🎬 Long Video Engine Started...");
    const tempDir = os.tmpdir();
    const audioPath = path.resolve(tempDir, `long-audio-${Date.now()}.mp3`);
    const posterPath = path.resolve(tempDir, `long-poster-${Date.now()}.png`);

    try {
        await setupHindiFont();

        const snapshot = await db.collection('blogs').limit(300).get();
        if (snapshot.empty) throw new Error("❌ कोई ब्लॉग नहीं मिला!");

        let targetBlogDoc = null;
        for (let doc of snapshot.docs) {
            if (doc.data().longVideoMade !== true) {
                targetBlogDoc = doc;
                break;
            }
        }

        if (!targetBlogDoc) {
            console.log("✅ सभी Blogs के Videos बन चुके हैं।");
            return true;
        }

        const blogData = targetBlogDoc.data();
        blogData.id = targetBlogDoc.id;

        const blogTitle = blogData.title || "New Update";
        const blogContent = blogData.description || blogData.content || blogTitle;
        const blogCat = blogData.category || 'Default';

        const safeSlug = (blogData.slug || 'studygyaan-update').replace(/[^a-z0-9]/gi, '-').substring(0, 50);
        const videoPath = path.resolve(tempDir, `${safeSlug}-${Date.now()}.mp4`);

        console.log(`📝 Blog मिला: ${blogTitle}`);
        console.log(`📂 Category: ${blogCat}`);

        // 🔐 YouTube Client
        const youtube = await getYouTubeClient();

        // 🧠 Script Generate
        const scriptText = await generateScriptWithGemini(blogTitle, blogContent);

        // 🏷️ SEO Generate (Dynamic & Powerful)
        const seoData = generateDynamicSEO(blogData, blogCat);
        const detectedCategory = seoData.detectedCategory;

        // 📢 Viral Title Generate
        const finalTitle = generateViralTitle(blogTitle, detectedCategory);
        console.log(`📢 Title: ${finalTitle}`);

        // 🗣️ TTS Audio
        console.log("🗣️ Audio generate हो रही है...");
        const ttsKeyVar = process.env.TTS_KEY_JSON;
        if (!ttsKeyVar) throw new Error("❌ TTS_KEY_JSON नहीं मिला!");
        const ttsClient = new textToSpeech.TextToSpeechClient({ credentials: JSON.parse(ttsKeyVar) });

        let chunks = [];
        let currentChunk = "";
        let sentences = scriptText.split(/(?<=[.!?।\n])/);

        for (let sentence of sentences) {
            if (!sentence.trim()) continue;
            if (currentChunk.length + sentence.length > 1200) {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = sentence;
            } else {
                currentChunk += sentence;
            }
        }
        if (currentChunk.trim().length > 0) chunks.push(currentChunk);

        console.log(`🗣️ Script को ${chunks.length} हिस्सों में audio बनाई जा रही है...`);

        let finalAudioBuffer = Buffer.alloc(0);
        for (let i = 0; i < chunks.length; i++) {
            const [response] = await ttsClient.synthesizeSpeech({
                input: { text: chunks[i] },
                voice: { languageCode: 'hi-IN', name: 'hi-IN-Neural2-C' },
                audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
            });
            const chunkBuffer = Buffer.from(response.audioContent, 'binary');
            finalAudioBuffer = Buffer.concat([finalAudioBuffer, chunkBuffer]);
            console.log(`⏳ Audio part ${i + 1}/${chunks.length} done`);
        }

        fs.writeFileSync(audioPath, finalAudioBuffer, 'binary');
        console.log("✅ Audio तैयार!");

        // 🖼️ Poster
        createLandscapePoster(blogTitle, posterPath, detectedCategory);

        // 🎵 Background Music
        const targetDir = __dirname.includes('ai_backend') ? __dirname : path.join(process.cwd(), 'ai_backend');
        const bgMusicDir = path.join(targetDir, 'bg_music');
        let finalMusic = null;
        if (fs.existsSync(bgMusicDir)) {
            const mp3Files = fs.readdirSync(bgMusicDir).filter(f => f.toLowerCase().endsWith('.mp3'));
            if (mp3Files.length > 0) finalMusic = path.resolve(path.join(bgMusicDir, mp3Files[0]));
        }

        // 🎬 FFmpeg Render
        console.log('🎬 FFmpeg rendering...');
        const hasMusic = finalMusic && fs.existsSync(finalMusic);

        let args = [];
        if (hasMusic) {
            const filter = `[1:a]volume=1.4[voice];[2:a]volume=0.05[bgm];[voice][bgm]amix=inputs=2:duration=first[a]`;
            args = ['-y', '-loop', '1', '-i', posterPath, '-i', audioPath, '-stream_loop', '-1', '-i', finalMusic,
                '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage',
                '-c:a', 'aac', '-b:a', '128k', '-shortest', '-pix_fmt', 'yuv420p', videoPath];
        } else {
            args = ['-y', '-loop', '1', '-i', posterPath, '-i', audioPath,
                '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage',
                '-c:a', 'aac', '-b:a', '128k', '-shortest', '-pix_fmt', 'yuv420p', videoPath];
        }

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, args);
            ffmpeg.stderr.on('data', (data) => {
                const out = data.toString();
                if (out.includes('time=')) process.stdout.write(`\r${out.split('\n')[0]}`);
            });
            ffmpeg.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg exit code: ${code}`));
            });
        });

        console.log(`\n✅ Video ready: ${videoPath}`);

        // =========================================================
        // 🚀 YOUTUBE UPLOAD
        // =========================================================
        console.log('🚀 YouTube पर upload हो रहा है...');

        // Final description with dynamic SEO
        const finalDescription = seoData.description;

        console.log(`📊 Tags count: ${seoData.tags.length}`);
        console.log(`📊 Top 5 tags: ${seoData.tags.slice(0, 5).join(', ')}`);

        const res = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: {
                    title: finalTitle,
                    description: finalDescription,
                    tags: seoData.tags,
                    categoryId: '27', // Education category
                    defaultLanguage: 'hi',
                    defaultAudioLanguage: 'hi'
                },
                status: {
                    privacyStatus: 'public',
                    selfDeclaredMadeForKids: false,
                    madeForKids: false
                }
            },
            media: { body: fs.createReadStream(videoPath) }
        });

        const videoId = res.data.id;
        console.log('✅ YouTube Video Live! https://youtu.be/' + videoId);

        // 🖼️ Custom Thumbnail
        try {
            await youtube.thumbnails.set({
                videoId: videoId,
                media: { body: fs.createReadStream(posterPath) }
            });
            console.log('🖼️ ✅ Custom Thumbnail set!');
        } catch (thumbErr) {
            console.log('⚠️ Thumbnail error:', thumbErr.message);
        }

        // 📂 Playlist
        try {
            const playlistTitle = `${detectedCategory} Exam Updates ${new Date().getFullYear()}`;
            const playlistsRes = await youtube.playlists.list({ part: 'snippet', mine: true, maxResults: 50 });
            let playlistId = null;
            const existingPlaylist = (playlistsRes.data.items || []).find(
                p => p.snippet.title.toLowerCase() === playlistTitle.toLowerCase()
            );

            if (existingPlaylist) {
                playlistId = existingPlaylist.id;
                console.log(`📂 Existing playlist found: ${playlistTitle}`);
            } else {
                const newPlaylist = await youtube.playlists.insert({
                    part: 'snippet,status',
                    requestBody: {
                        snippet: {
                            title: playlistTitle,
                            description: `${detectedCategory} Exam Preparation Videos - Free Study Material | StudyGyaan.in`
                        },
                        status: { privacyStatus: 'public' }
                    }
                });
                playlistId = newPlaylist.data.id;
                console.log(`📂 New playlist created: ${playlistTitle}`);
            }

            await youtube.playlistItems.insert({
                part: 'snippet',
                requestBody: {
                    snippet: {
                        playlistId: playlistId,
                        resourceId: { kind: 'youtube#video', videoId: videoId }
                    }
                }
            });
            console.log(`✅ Video playlist में add हो गया!`);
        } catch (pErr) {
            console.log('⚠️ Playlist skip:', pErr.message);
        }

        // 📢 Telegram Notification
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            const tgMsg = `🚀 <b>New Video Live on YouTube!</b>\n\n📌 <b>Topic:</b> ${blogTitle}\n🏷️ <b>Category:</b> ${detectedCategory}\n🔗 <b>Watch:</b> https://youtu.be/${videoId}\n\n📊 <b>SEO Tags:</b> ${seoData.tags.slice(0, 5).join(', ')}\n\n✅ Auto-uploaded successfully!`;
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: tgMsg,
                parse_mode: 'HTML'
            }).catch(() => console.log('⚠️ Telegram notification fail।'));
        }

        // 📱 Facebook Upload
        await uploadToFacebook(videoPath, finalDescription);

        // 💬 Auto Pinned Comment (HIGH ENGAGEMENT)
        console.log('⏳ 15 seconds wait for comment...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        try {
            const pinnedComment = generatePinnedComment(seoData.postLink, detectedCategory);
            
            const commentRes = await youtube.commentThreads.insert({
                part: 'snippet',
                requestBody: {
                    snippet: {
                        videoId: videoId,
                        topLevelComment: {
                            snippet: { textOriginal: pinnedComment }
                        }
                    }
                }
            });
            
            // Comment Pin करो
            try {
                await youtube.comments.setModerationStatus({
                    id: commentRes.data.id,
                    moderationStatus: 'published',
                    banAuthor: false
                });
            } catch(pinErr) {
                // Pin करना optional है
            }
            
            console.log('💬 ✅ First comment live!');
        } catch (commentErr) {
            console.log('⚠️ Comment skip:', commentErr.message);
        }

        // 🔥 Firebase Update
        await db.collection('blogs').doc(blogData.id).update({ longVideoMade: true });
        console.log(`✅ Firebase updated for: ${blogTitle}`);

        // Cleanup
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        return true;

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (fs.existsSync(posterPath)) fs.unlinkSync(posterPath);
    }
}

// ============================================================================
// ✅ GitHub Actions Execution
// ============================================================================
if (require.main === module) {
    generateLongVideo()
        .then(() => {
            console.log("✅ Process Complete!");
            process.exit(0);
        })
        .catch(err => {
            console.error("❌ Failed:", err.message);
            process.exit(1);
        });
}

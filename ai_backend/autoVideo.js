const fs = require('fs');
const axios = require('axios');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { google } = require('googleapis');
const admin = require("firebase-admin");
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
        console.log("✅ Firebase initialized");
    } else {
        admin.initializeApp();
        console.log("✅ Firebase initialized (default)");
    }
}

// =========================================================
// 🔐 1. YOUTUBE AUTHENTICATION
// =========================================================
async function getYouTubeClient() {
    const credentialsVar = process.env.GMAIL_CREDENTIALS;
    const tokenVar = process.env.YOUTUBE_TOKEN;

    if (!credentialsVar || !tokenVar || tokenVar === "test" || tokenVar === "temp_key") {
        throw new Error("❌ GMAIL_CREDENTIALS या YOUTUBE_TOKEN सीक्रेट नहीं मिला!");
    }

    let creds, token;
    try {
        creds = JSON.parse(credentialsVar);
        token = JSON.parse(tokenVar);
    } catch (e) {
        throw new Error("❌ YOUTUBE Secrets Invalid JSON format.");
    }

    const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);
    return google.youtube({ version: 'v3', auth: oAuth2Client });
}

// =========================================================
// 📱 FACEBOOK UPLOAD ENGINE
// =========================================================
async function uploadToFacebook(videoPath, description) {
    const FB_PAGE_ID = process.env.FB_PAGE_ID;
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

    if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
        console.log('⚠️ FB credentials नहीं मिले, Facebook skip किया।');
        return null;
    }

    console.log('📱 Facebook पर अपलोड शुरू...');

    try {
        const initRes = await axios.post(
            `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/video_reels`,
            { upload_phase: 'start', access_token: FB_PAGE_TOKEN }
        );

        const fbVideoId = initRes.data.video_id;
        const uploadUrl = initRes.data.upload_url;

        const videoBuffer = fs.readFileSync(videoPath);
        await axios.post(uploadUrl, videoBuffer, {
            headers: {
                'Authorization': `OAuth ${FB_PAGE_TOKEN}`,
                'Content-Type': 'application/octet-stream',
                'offset': '0',
                'file_size': videoBuffer.length.toString()
            }
        });

        await axios.post(
            `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/video_reels`,
            {
                upload_phase: 'finish',
                video_id: fbVideoId,
                access_token: FB_PAGE_TOKEN,
                video_state: 'PUBLISHED',
                description: description
            }
        );

        console.log('✅ Facebook Reel Live! ID: ' + fbVideoId);
        return fbVideoId;

    } catch (reelErr) {
        console.log('⚠️ Reels API failed, normal video try...');

        try {
            const formData = new FormData();
            formData.append('access_token', FB_PAGE_TOKEN);
            formData.append('source', fs.createReadStream(videoPath));
            formData.append('description', description);

            const fbRes = await axios.post(
                `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/videos`,
                formData,
                { headers: formData.getHeaders() }
            );
            console.log('✅ Facebook Video Live! ID: ' + fbRes.data.id);
            return fbRes.data.id;
        } catch (fbErr) {
            console.error('❌ Facebook upload failed:', fbErr.response?.data || fbErr.message);
            return null;
        }
    }
}

// =========================================================
// 🧠 2. MEGA SEO ENGINE - COMPLETE REBUILD
// =========================================================

// ✅ TAG SANITIZER - Only YouTube Safe ASCII Tags
function sanitizeTag(tag) {
    if (!tag) return null;
    let clean = tag
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/[<>'"&]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (clean.length < 2) return null;
    if (clean.length > 100) clean = clean.substring(0, 100).trim();
    return clean || null;
}

// ✅ CATEGORY SPECIFIC KEYWORD BANKS
const CATEGORY_KEYWORDS = {
    'Result': [
        'Sarkari Result', 'Result Out', 'Result Declared', 'Merit List',
        'Cutoff Marks', 'Selection List', 'Final Result', 'Result Check',
        'Result Direct Link', 'Result Today', 'Written Result',
        'Interview Result', 'DV Result', 'Document Verification',
        'Result Kaise Dekhe', 'Result Download', 'Score Card',
        'Mark Sheet Download', 'Waiting List', 'Reserve List'
    ],
    'Admit Card': [
        'Admit Card Out', 'Admit Card Download', 'Hall Ticket',
        'Call Letter', 'Exam Center', 'Exam Date', 'Admit Card Link',
        'E Admit Card', 'Admit Card Kaise Download', 'Exam Schedule',
        'Interview Letter', 'CBT Admit Card', 'Online Exam Admit Card',
        'Exam City', 'Reporting Time', 'Admit Card PDF'
    ],
    'Answer Key': [
        'Answer Key Out', 'Official Answer Key', 'Provisional Answer Key',
        'Objection Answer Key', 'Answer Key PDF', 'Expected Cutoff',
        'Cutoff Marks', 'Answer Key Link', 'Question Paper',
        'Answer Key Challenge', 'Set Wise Answer Key',
        'Answer Key Download', 'Official Paper', 'Question Paper PDF'
    ],
    'Syllabus': [
        'New Syllabus', 'Exam Pattern', 'Syllabus PDF', 'Free Syllabus',
        'Exam Syllabus', 'Study Plan', 'Important Topics',
        'Syllabus In Hindi', 'Complete Syllabus', 'Topic Wise Syllabus',
        'New Exam Pattern', 'Subject Wise Syllabus', 'Preparation Tips',
        'Best Books', 'Study Material Free'
    ],
    'Default': [
        'New Vacancy', 'Sarkari Naukri', 'Govt Jobs', 'Online Form',
        'Free Job Alert', 'Latest Vacancy', 'Apply Online',
        'Job Notification', 'Recruitment', 'Bharti', 'Vacancy Out',
        'Application Form', 'Eligibility', 'Age Limit', 'Salary',
        'Last Date', 'Total Posts', 'How To Apply'
    ]
};

// ✅ EXAM TYPE TAGS
const EXAM_TYPE_TAGS = [
    'SSC CGL 2025', 'SSC CHSL 2025', 'SSC MTS 2025', 'SSC GD 2025',
    'SSC CPO 2025', 'SSC Stenographer 2025',
    'RRB NTPC 2025', 'Railway Group D 2025', 'RRB ALP 2025',
    'RRB JE 2025', 'Railway Recruitment 2025',
    'IBPS PO 2025', 'IBPS Clerk 2025', 'SBI PO 2025', 'SBI Clerk 2025',
    'Bank Jobs 2025', 'RBI Grade B 2025',
    'UP Police 2025', 'Delhi Police 2025', 'Police Constable 2025',
    'SI Recruitment 2025', 'CRPF 2025', 'BSF 2025', 'CISF 2025',
    'UPSC 2025', 'IAS 2025', 'IPS 2025', 'State PSC 2025',
    'UPPSC 2025', 'BPSC 2025', 'RPSC 2025', 'MPSC 2025',
    'Army Bharti 2025', 'Navy Bharti 2025', 'Airforce Bharti 2025',
    'Teacher Bharti 2025', 'CTET 2025', 'UPTET 2025',
    'Anganwadi Bharti 2025', 'Gram Panchayat Bharti 2025',
    'High Court Jobs 2025', 'NHM Recruitment 2025'
];

// ✅ UNIVERSAL VIRAL TAGS
const UNIVERSAL_TAGS = [
    'StudyGyaan', 'Sarkari Result', 'Sarkari Naukri',
    'Government Jobs 2025', 'Govt Job Alert', 'Free Job Alert',
    'Latest Recruitment 2025', 'Job Alert Today',
    'NaukariResult', 'Job Notification 2025',
    'Employment News', 'Rozgar Samachar',
    'Exam Preparation Hindi', 'Free Study Material',
    'Free PDF Download', 'Current Affairs 2025',
    'GK Questions Hindi', 'Mock Test Free',
    'Online Form 2025', 'Apply Online 2025'
];

function generateSEO(jobData, jobCat) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });

    // ✅ Title से keywords extract
    const stopWords = ['and', 'the', 'for', 'out', 'now', 'is', 'are', 'was',
        'in', 'on', 'of', 'to', 'a', 'an', 'at', 'by', 'from', 'with'];

    let titleWords = (jobData.title || '')
        .split(/[\s,\-\/\|]+/)
        .map(w => w.replace(/[^a-zA-Z0-9]/g, '').trim())
        .filter(w => w.length > 2 && !stopWords.includes(w.toLowerCase()));

    // Title words के year-combo tags
    let titleComboTags = titleWords
        .filter(w => w.length > 3)
        .slice(0, 5)
        .map(w => `${w} ${currentYear}`);

    // ✅ Category specific keywords
    const catKeywords = CATEGORY_KEYWORDS[jobCat] || CATEGORY_KEYWORDS['Default'];

    // ✅ All tags combine - priority order
    const allTagSources = [
        ...titleWords,
        ...titleComboTags,
        ...catKeywords,
        ...EXAM_TYPE_TAGS,
        ...UNIVERSAL_TAGS
    ];

    // ✅ Sanitize + Deduplicate + YouTube 500 char limit
    const seen = new Set();
    let finalTags = [];
    let totalCharCount = 0;

    for (let rawTag of allTagSources) {
        const clean = sanitizeTag(rawTag);
        if (!clean) continue;
        if (seen.has(clean.toLowerCase())) continue;
        if (totalCharCount + clean.length + 2 > 495) break;
        seen.add(clean.toLowerCase());
        finalTags.push(clean);
        totalCharCount += clean.length + 2;
    }

    console.log(`✅ Tags generated: ${finalTags.length} | Chars: ${totalCharCount}`);

    // ✅ Post URL
    const identifier = jobData.slug || jobData.id;
    let postLink = "https://studygyaan.in";
    if (identifier) {
        postLink = jobData.type === 'JOB'
            ? `https://studygyaan.in/job/${identifier}`
            : `https://studygyaan.in/update/${identifier}`;
    }

    const telegramLink = process.env.TELEGRAM_CHANNEL_LINK || "https://t.me/studygyaan_official";

    // ✅ Hashtags - ASCII only, top 15
    const hashtags = finalTags
        .slice(0, 15)
        .map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, ''))
        .filter(h => h.length > 2)
        .join(' ');

    // ✅ MEGA DESCRIPTION - Full Power
    const categoryEmojis = {
        'Result': '🏆',
        'Admit Card': '🎫',
        'Answer Key': '🔑',
        'Syllabus': '📚',
        'Default': '⚡'
    };
    const catEmoji = categoryEmojis[jobCat] || '📌';

    const description =
        `${catEmoji} ${jobData.title} - ${jobCat} ${currentYear} Latest Update\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 DIRECT LINK - Check Now:\n` +
        `🔗 ${postLink}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +

        `📚 FREE STUDY MATERIAL:\n` +
        `👉 Free PDF + Mock Test: https://studygyaan.in\n` +
        `👉 Daily Job Alert: https://studygyaan.in\n` +
        `👉 Previous Year Paper: https://studygyaan.in\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📲 JOIN TELEGRAM (Fastest Updates):\n` +
        `🔔 ${telegramLink}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +

        `✅ IS VIDEO MEIN KYA HAI:\n` +
        `• ${jobData.title} - Complete Details\n` +
        `• ${jobCat} - Direct Download Link\n` +
        `• Eligibility, Age Limit, Salary\n` +
        `• How To Apply Step By Step\n` +
        `• Important Dates\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 YEH VIDEO KISKE LIYE HAI:\n` +
        `• SSC CGL, CHSL, MTS, GD ${currentYear}\n` +
        `• RRB NTPC, Group D, ALP ${currentYear}\n` +
        `• Bank PO, Clerk, IBPS, SBI ${currentYear}\n` +
        `• UP Police, Delhi Police ${currentYear}\n` +
        `• UPSC, State PSC ${currentYear}\n` +
        `• Army, Navy, Airforce Bharti ${currentYear}\n` +
        `• Teacher Bharti, CTET ${currentYear}\n` +
        `• Sabhi Competitive Exams ${currentYear}\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📱 FOLLOW US:\n` +
        `🌐 Website: https://studygyaan.in\n` +
        `📲 Telegram: ${telegramLink}\n` +
        `▶️ YouTube: https://www.youtube.com/@StudyGyaan\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔔 SUBSCRIBE karein aur Bell Icon dabaein!\n` +
        `👍 Like karein agar helpful laga!\n` +
        `💬 Comment mein apna score bataein!\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔎 SEARCH KEYWORDS:\n` +
        `${finalTags.slice(0, 30).join(', ')}\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${hashtags}\n\n` +

        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ DISCLAIMER: Yeh channel sirf information ke liye hai.\n` +
        `Official website ke liye upar diya gaya link use karein.\n\n` +
        `⚡ Powered by StudyGyaan.in - India Ka No.1 Free Study Portal`;

    return { tags: finalTags, description, postLink, telegramLink, hashtags };
}

// =========================================================
// 🎬 3. VIRAL TITLE GENERATOR
// =========================================================
function generateViralTitle(jobData, jobCat) {
    const currentYear = new Date().getFullYear();

    let cleanTitle = jobData.title.length > 50
        ? jobData.title.substring(0, 50) + "..."
        : jobData.title;

    // Title से Hindi chars हटाओ title में
    cleanTitle = cleanTitle.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim() || jobData.title.substring(0, 50);

    const hooks = {
        'Result': [
            `Result Out ${currentYear}`,
            `Result Declared`,
            `Official Result Live`,
            `Final Result Out`
        ],
        'Admit Card': [
            `Admit Card Out ${currentYear}`,
            `Hall Ticket Download Now`,
            `Admit Card Released`,
            `Exam Date Admit Card Out`
        ],
        'Answer Key': [
            `Answer Key Out ${currentYear}`,
            `Official Answer Key Released`,
            `Answer Key PDF Download`,
            `Expected Cutoff Answer Key`
        ],
        'Syllabus': [
            `New Syllabus ${currentYear}`,
            `Exam Pattern Changed`,
            `Syllabus PDF Free Download`,
            `New Exam Pattern Out`
        ],
        'Default': [
            `New Vacancy ${currentYear}`,
            `Bumper Bharti Out`,
            `Govt Job Alert ${currentYear}`,
            `Apply Now Sarkari Naukri`
        ]
    };

    const categoryHooks = hooks[jobCat] || hooks['Default'];
    const selectedHook = categoryHooks[Math.floor(Math.random() * categoryHooks.length)];

    let finalTitle = `${selectedHook} | ${cleanTitle} | StudyGyaan`;
    if (finalTitle.length > 100) {
        finalTitle = `${selectedHook} | ${cleanTitle.substring(0, 45)} | StudyGyaan`;
    }
    if (finalTitle.length > 100) {
        finalTitle = finalTitle.substring(0, 97) + '...';
    }

    return finalTitle;
}

// =========================================================
// 🎨 4. POSTER DESIGNER
// =========================================================
async function createPoster(jobData, jobCat, posterPath) {
    const { createCanvas } = require('canvas');

    const width = 1080;
    const height = 1920;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const themes = {
        "Result": {
            bg1: '#0f2027', bg2: '#203a43', bg3: '#2c5364',
            accent: '#00FF00', badgeBg: '#28a745',
            textBadge: 'RESULT DECLARED', emoji: '🏆'
        },
        "Admit Card": {
            bg1: '#4b134f', bg2: '#c94b4b', bg3: '#ff0844',
            accent: '#FFD700', badgeBg: '#dc3545',
            textBadge: 'ADMIT CARD OUT', emoji: '🎫'
        },
        "Syllabus": {
            bg1: '#141e30', bg2: '#243b55', bg3: '#2c3e50',
            accent: '#00FFFF', badgeBg: '#17a2b8',
            textBadge: 'NEW SYLLABUS OUT', emoji: '📚'
        },
        "Answer Key": {
            bg1: '#232526', bg2: '#414345', bg3: '#4b6cb7',
            accent: '#FFA500', badgeBg: '#fd7e14',
            textBadge: 'ANSWER KEY OUT', emoji: '🔑'
        },
        "Default": {
            bg1: '#0f0c29', bg2: '#302b63', bg3: '#24243e',
            accent: '#00FFFF', badgeBg: '#d32f2f',
            textBadge: 'NEW VACANCY OUT', emoji: '⚡'
        }
    };

    const theme = themes[jobCat] || themes['Default'];

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, theme.bg1);
    grad.addColorStop(0.5, theme.bg2);
    grad.addColorStop(1, theme.bg3);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = theme.accent;
    ctx.beginPath(); ctx.arc(900, 200, 300, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(100, 1700, 250, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    function drawRoundedRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function wrapText(text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                ctx.fillText(line.trim(), x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line.trim(), x, y);
        return y + lineHeight;
    }

    // TOP LOGO BAR
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 30;
    drawRoundedRect(80, 60, 920, 130, 65);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STUDYGYAAN.IN', width / 2, 125);

    // CATEGORY BADGE
    ctx.fillStyle = theme.badgeBg;
    ctx.fillRect(0, 220, width, 110);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 62px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(theme.textBadge, width / 2, 275);

    // IMPORTANT TEXT
    ctx.fillStyle = '#FFFF00';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText('!! IMPORTANT UPDATE !!', width / 2, 390);

    // MAIN TITLE
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 74px sans-serif';
    ctx.textBaseline = 'alphabetic';
    let titleEndY = wrapText(
        (jobData.title || '').toUpperCase(),
        width / 2, 510, 960, 90
    );
    ctx.shadowBlur = 0;

    // CTA BUTTON
    let ctaY = titleEndY + 40;

    const ctaTexts = {
        'Result': { text: 'CHECK RESULT NOW', color: '#00FF00' },
        'Admit Card': { text: 'DOWNLOAD NOW', color: '#FFD700' },
        'Answer Key': { text: 'CHECK ANSWER KEY', color: '#FFA500' },
        'Syllabus': { text: 'FREE PDF DOWNLOAD', color: '#00FFFF' },
        'Default': { text: 'APPLY NOW - LAST DATE NAZAR', color: '#FF4444' }
    };
    const cta = ctaTexts[jobCat] || ctaTexts['Default'];

    drawRoundedRect(100, ctaY - 55, 880, 90, 45);
    ctx.fillStyle = cta.color;
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = cta.color;
    ctx.font = 'bold 62px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(cta.text, width / 2, ctaY);

    // INFO BOX
    let infoBoxY = ctaY + 80;
    drawRoundedRect(50, infoBoxY, 980, 260, 40);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = theme.accent;
    ctx.stroke();

    ctx.font = 'bold 55px sans-serif';
    const todayDate = new Date().toLocaleDateString('en-GB');

    if (['Result', 'Answer Key', 'Admit Card'].includes(jobCat)) {
        ctx.fillStyle = '#00FFFF';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${theme.emoji} Update: ${jobCat} Out!`, width / 2, infoBoxY + 80);
        ctx.fillStyle = '#FFFFFF';
        const showDate = (jobData.updateDate && jobData.updateDate !== 'undefined')
            ? jobData.updateDate : todayDate;
        ctx.fillText(`Date: ${showDate}`, width / 2, infoBoxY + 180);
    } else {
        ctx.fillStyle = '#00FFFF';
        ctx.textBaseline = 'middle';
        const showStart = (jobData.startDate && jobData.startDate !== 'undefined')
            ? jobData.startDate : 'Apply Now';
        ctx.fillText(`Apply: ${showStart}`, width / 2, infoBoxY + 80);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 62px sans-serif';
        const showLast = (jobData.lastDate && jobData.lastDate !== 'undefined')
            ? jobData.lastDate : 'Jaldi Karein!';
        ctx.fillText(`Last Date: ${showLast}`, width / 2, infoBoxY + 180);
    }

    // WEBSITE BOX
    let webBoxY = infoBoxY + 280;
    if (webBoxY + 100 > 1580) webBoxY = 1480;

    drawRoundedRect(50, webBoxY, 980, 100, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFD700';
    ctx.stroke();
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 50px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('StudyGyaan.in - Free PDF + Mock Test', width / 2, webBoxY + 50);

    // TELEGRAM BOX
    let tgBoxY = webBoxY + 120;
    if (tgBoxY + 100 > 1720) tgBoxY = 1610;

    drawRoundedRect(50, tgBoxY, 980, 100, 30);
    ctx.fillStyle = '#0088cc';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('JOIN TELEGRAM: @studygyaan_official', width / 2, tgBoxY + 50);

    // FOOTER
    ctx.fillStyle = '#FFCC00';
    ctx.fillRect(0, 1760, width, 160);
    ctx.fillStyle = '#000000';
    ctx.font = '900 50px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('DIRECT LINK - FIRST COMMENT MEIN', width / 2, 1840);

    fs.writeFileSync(posterPath, canvas.toBuffer('image/png'));
    console.log('✅ Poster बन गया!');

    const anchorY = tgBoxY + 120;
    return Math.min(anchorY, 1200);
}

// =========================================================
// 🎬 5. MAIN VIDEO GENERATOR ENGINE
// =========================================================
async function generateAndUploadVideo(jobData) {
    const textToSpeech = require('@google-cloud/text-to-speech');
    const ffmpegPath = require('ffmpeg-static');

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎬 Video Engine Start`);
    console.log(`📌 Title    : ${jobData.title}`);
    console.log(`📂 Type     : ${jobData.type}`);
    console.log(`🏷️  Category : ${jobData.category}`);
    console.log(`🔗 Slug     : ${jobData.slug}`);
    console.log(`${'='.repeat(50)}\n`);

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const audioPath = path.join(tempDir, `audio-${timestamp}.mp3`);
    const posterPath = path.join(tempDir, `poster-${timestamp}.png`);
    const safeSlug = (jobData.slug || 'govt-update').replace(/[^a-z0-9]/gi, '-').substring(0, 50);
    const videoPath = path.join(tempDir, `${safeSlug}-${timestamp}.mp4`);

    let jobCat = jobData.category || 'Default';

    if (jobData.type === 'JOB') {
        const validJobCats = ['Result', 'Admit Card', 'Answer Key', 'Syllabus'];
        if (!validJobCats.includes(jobCat)) {
            jobCat = 'Default';
        }
    }

    console.log(`✅ Final jobCat: ${jobCat} (type: ${jobData.type})`);

    try {
        const youtube = await getYouTubeClient();

        const targetDir = __dirname.includes('ai_backend')
            ? __dirname
            : path.join(process.cwd(), 'ai_backend');
        const bgMusicDir = path.join(targetDir, 'bg_music');

        console.log(`📁 Target Dir: ${targetDir}`);

        let bgMusicPath = '';
        if (fs.existsSync(bgMusicDir)) {
            const mp3Files = fs.readdirSync(bgMusicDir).filter(f => f.toLowerCase().endsWith('.mp3'));
            if (mp3Files.length > 0) {
                bgMusicPath = path.join(bgMusicDir, mp3Files[Math.floor(Math.random() * mp3Files.length)]);
                console.log(`🎵 Music: ${path.basename(bgMusicPath)}`);
            }
        } else {
            console.log(`⚠️ bg_music folder नहीं मिला: ${bgMusicDir}`);
        }

        const anchorFiles = fs.readdirSync(targetDir).filter(f => f.toLowerCase().endsWith('.mp4'));
        if (anchorFiles.length === 0) {
            throw new Error(`❌ Anchor videos नहीं मिले: ${targetDir}`);
        }

        const selectedVideoFile = anchorFiles[Math.floor(Math.random() * anchorFiles.length)];
        const isFemale = selectedVideoFile.toLowerCase().includes('female');
        const isMale = selectedVideoFile.toLowerCase().includes('male');

        let selectedVoice;
        if (isFemale) selectedVoice = 'hi-IN-Neural2-A';
        else if (isMale) selectedVoice = 'hi-IN-Neural2-C';
        else selectedVoice = Math.random() > 0.5 ? 'hi-IN-Neural2-A' : 'hi-IN-Neural2-C';

        const finalAnchorPath = path.join(targetDir, selectedVideoFile);
        console.log(`🎥 Anchor: ${selectedVideoFile} | Voice: ${selectedVoice}`);

        const ttsKeyVar = process.env.TTS_KEY_JSON;
        if (!ttsKeyVar || ttsKeyVar === "test") {
            throw new Error("❌ TTS_KEY_JSON missing!");
        }

        let ttsCreds;
        try {
            ttsCreds = JSON.parse(ttsKeyVar);
        } catch (e) {
            throw new Error("❌ TTS_KEY_JSON Invalid JSON.");
        }

        const ttsClient = new textToSpeech.TextToSpeechClient({ credentials: ttsCreds });

        let cleanName = (jobData.title || '').length > 55
            ? jobData.title.substring(0, 55)
            : (jobData.title || 'Latest Update');

        const telegramChannel = process.env.TELEGRAM_CHANNEL_NAME || "Study Gyaan";

        const jobScripts = [
            `Berozgaar ho? Toh yeh mauka haath se jaane mat dena! ${cleanName} ki nayi vacancy out ho gayi hai. Form bharne ki poori detail pehle comment mein hai. ${telegramChannel} Telegram se judein aur daily job alerts paayein.`,
            `Ek aur shandar sarkari naukri aa gayi hai! ${cleanName} ke liye abhi apply karein. Last date nikalne se pehle form bhar do. Link pehle comment mein hai. StudyGyaan dot in visit karein.`,
            `Taiyaari shuru kar do! ${cleanName} ki bumper bharti aayi hai. Yogyata aur apply link pehle comment mein dekhein. StudyGyaan se jude rahein free PDF aur mock test ke liye.`
        ];

        const fastTrackScripts = {
            'Result': [
                `Kya aapne bhi iska exam diya tha? Toh dil tham ke baithiye! ${cleanName} ka result finally declare ho chuka hai. Apna result check karne ke liye pehla comment dekhein. ${telegramChannel} Telegram channel se judein sabse fast updates ke liye.`,
                `Jis result ka intezaar tha, woh aa gaya! ${cleanName} result jari ho gaya hai. Direct link pehle comment mein hai. Abhi check karein aur StudyGyaan dot in visit karein.`
            ],
            'Admit Card': [
                `Exam date paas aa rahi hai! ${cleanName} ka admit card jari ho chuka hai. Apna exam center aur timing check karne ke liye pehla comment dekhein. StudyGyaan dot in se free study material bhi download karein.`,
                `Bina iske exam center mein entry nahi milegi! ${cleanName} admit card download karein. Link pehle comment mein hai. StudyGyaan Telegram join karein fast updates ke liye.`
            ],
            'Answer Key': [
                `Exam mein top karna hai? ${cleanName} ki answer key jari ho gayi hai. Apne jawab milaein aur cutoff ka andaza lagaein. Direct link pehle comment mein hai.`,
                `${cleanName} answer key check karein aur objection daalne ka mauka mat chookein! Link pehle comment mein hai. StudyGyaan dot in visit karein.`
            ],
            'Syllabus': [
                `Selection chahiye toh yeh zaroor dekhein! ${cleanName} ka naya syllabus jari ho gaya hai. Free PDF download karein, link pehle comment mein hai. StudyGyaan dot in se aur study material paayein.`,
                `${cleanName} exam pattern badal gaya hai! Naya syllabus check karein. Free PDF pehle comment mein hai. StudyGyaan Telegram se judein.`
            ],
            'Default': [
                `Berozgaar ho? Toh yeh mauka haath se jaane mat dena! ${cleanName} ki nayi vacancy out ho gayi hai. Form bharne ki poori detail pehle comment mein hai. StudyGyaan dot in visit karein.`,
                `Ek aur shandar sarkari naukri aa gayi hai! ${cleanName} ke liye abhi apply karein. Link pehle comment mein hai. Daily updates ke liye StudyGyaan Telegram join karein.`
            ]
        };

        let scriptArray;
        if (jobData.type === 'JOB') {
            scriptArray = jobScripts;
        } else {
            scriptArray = fastTrackScripts[jobCat] || fastTrackScripts['Default'];
        }

        const script = scriptArray[Math.floor(Math.random() * scriptArray.length)];
        console.log(`🎙️ Script: ${script.substring(0, 80)}...`);

        const [ttsResponse] = await ttsClient.synthesizeSpeech({
            input: { text: script },
            voice: { languageCode: 'hi-IN', name: selectedVoice },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 1.08, pitch: 1.0 }
        });
        fs.writeFileSync(audioPath, ttsResponse.audioContent, 'binary');
        console.log('✅ Audio तैयार हो गया!');

        const safeAnchorY = await createPoster(jobData, jobCat, posterPath);
        console.log(`📍 Anchor Y position: ${safeAnchorY}`);

        console.log('🎬 FFmpeg Rendering शुरू...');

        const finalPoster = path.resolve(posterPath);
        const finalAudio = path.resolve(audioPath);
        const finalVideoOut = path.resolve(videoPath);
        const finalAnchor = path.resolve(finalAnchorPath);
        const finalMusic = bgMusicPath ? path.resolve(bgMusicPath) : null;
        const hasMusic = finalMusic && fs.existsSync(finalMusic);

        console.log(`🔍 File Check:`);
        console.log(`   Poster : ${fs.existsSync(finalPoster)}`);
        console.log(`   Anchor : ${fs.existsSync(finalAnchor)}`);
        console.log(`   Audio  : ${fs.existsSync(finalAudio)}`);
        console.log(`   Music  : ${hasMusic}`);

        let filter, args;

        if (hasMusic) {
            filter =
                `[0:v]zoompan=z='min(zoom+0.0005,1.1)':d=1:s=1080x1920:fps=30[bg];` +
                `[1:v]format=yuv420p,crop=iw:ih-80:0:0,colorkey=0x00FF00:0.3:0.1,scale=680:-1[anchor];` +
                `[bg][anchor]overlay=(main_w-overlay_w)/2:${safeAnchorY}[outv];` +
                `[2:a]volume=1.5[voice];[3:a]volume=0.08[bgm];[voice][bgm]amix=inputs=2:duration=first[a]`;

            args = [
                '-y',
                '-loop', '1', '-i', finalPoster,
                '-stream_loop', '-1', '-an', '-i', finalAnchor,
                '-i', finalAudio,
                '-stream_loop', '-1', '-i', finalMusic,
                '-filter_complex', filter,
                '-map', '[outv]', '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'superfast', '-crf', '26',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-shortest', '-pix_fmt', 'yuv420p',
                finalVideoOut
            ];
        } else {
            console.log('⚠️ BG Music नहीं मिला, बिना म्यूजिक के render...');
            filter =
                `[0:v]zoompan=z='min(zoom+0.0005,1.1)':d=1:s=1080x1920:fps=30[bg];` +
                `[1:v]format=yuv420p,crop=iw:ih-80:0:0,colorkey=0x00FF00:0.3:0.1,scale=680:-1[anchor];` +
                `[bg][anchor]overlay=(main_w-overlay_w)/2:${safeAnchorY}[outv];` +
                `[2:a]volume=1.5[a]`;

            args = [
                '-y',
                '-loop', '1', '-i', finalPoster,
                '-stream_loop', '-1', '-an', '-i', finalAnchor,
                '-i', finalAudio,
                '-filter_complex', filter,
                '-map', '[outv]', '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'superfast', '-crf', '26',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-shortest', '-pix_fmt', 'yuv420p',
                finalVideoOut
            ];
        }

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, args);
            ffmpeg.stderr.on('data', (data) => {
                const out = data.toString();
                if (out.includes('frame=')) {
                    process.stdout.write(`\r${out.split('\n')[0]}`);
                }
            });
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log('\n✅ Rendering पूरी!');
                    resolve();
                } else {
                    reject(new Error(`FFmpeg failed: code ${code}`));
                }
            });
        });

        // ✅ SEO Data Generate
        const seoData = generateSEO(jobData, jobCat);
        const finalTitle = generateViralTitle(jobData, jobCat);

        console.log(`\n📢 YouTube Title: ${finalTitle}`);
        console.log(`📊 Tags Count: ${seoData.tags.length}`);
        console.log(`📝 Description Length: ${seoData.description.length} chars`);
        console.log(`🏷️ Top 5 Tags: ${seoData.tags.slice(0, 5).join(', ')}`);

        // ✅ YouTube Upload with FULL SEO
        console.log('\n📤 YouTube पर Upload हो रहा है...');

        let ytVideoId = '';

        // Upload with retry logic
        const maxRetries = 3;
        let currentTags = [...seoData.tags];

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🚀 Upload attempt ${attempt}/${maxRetries}...`);

                // Final tag validation
                const validatedTags = currentTags.filter(tag => {
                    if (!tag || typeof tag !== 'string') return false;
                    if (tag.length < 2 || tag.length > 100) return false;
                    if (!/^[\x20-\x7E]+$/.test(tag)) return false;
                    return true;
                });

                console.log(`✅ Validated tags: ${validatedTags.length}`);

                const ytRes = await youtube.videos.insert({
                    part: 'snippet,status',
                    requestBody: {
                        snippet: {
                            title: finalTitle,
                            description: seoData.description,
                            tags: validatedTags,
                            categoryId: '27',
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

                ytVideoId = ytRes.data.id;
                console.log(`✅ YouTube Live! https://youtu.be/${ytVideoId}`);
                break;

            } catch (uploadErr) {
                console.error(`❌ Attempt ${attempt} failed: ${uploadErr.message}`);

                if (
                    uploadErr.message.includes('invalid video keywords') ||
                    uploadErr.message.includes('keywords') ||
                    uploadErr.message.includes('tags')
                ) {
                    console.log('🔄 Tags error - tags remove karke retry...');
                    currentTags = [];
                    continue;
                }

                if (attempt === maxRetries) {
                    throw new Error(`YouTube upload failed after ${maxRetries} attempts: ${uploadErr.message}`);
                }

                const waitSec = 5 * attempt;
                console.log(`⏳ ${waitSec}s wait before retry...`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
            }
        }

        if (!ytVideoId) {
            throw new Error('YouTube Video ID नहीं मिला!');
        }

        const videoUrl = `https://youtu.be/${ytVideoId}`;

        // ✅ Custom Thumbnail
        try {
            await youtube.thumbnails.set({
                videoId: ytVideoId,
                media: { body: fs.createReadStream(posterPath) }
            });
            console.log('🖼️ ✅ Thumbnail set!');
        } catch (thumbErr) {
            console.log('⚠️ Thumbnail error:', thumbErr.message);
        }

        // ✅ Playlist में add करो
        try {
            const playlistNames = {
                'Result': 'Results and Updates',
                'Admit Card': 'Admit Cards',
                'Syllabus': 'Exam Syllabus',
                'Answer Key': 'Answer Keys',
                'Default': 'Latest Govt Jobs'
            };
            const playlistTitle = playlistNames[jobCat] || playlistNames['Default'];

            const plRes = await youtube.playlists.list({
                part: 'snippet',
                mine: true,
                maxResults: 50
            });

            let playlistId = null;
            const existing = (plRes.data.items || []).find(
                p => p.snippet.title.toLowerCase() === playlistTitle.toLowerCase()
            );

            if (existing) {
                playlistId = existing.id;
                console.log(`📂 Existing Playlist: ${playlistTitle}`);
            } else {
                const newPl = await youtube.playlists.insert({
                    part: 'snippet,status',
                    requestBody: {
                        snippet: {
                            title: playlistTitle,
                            description: `${playlistTitle} - StudyGyaan.in | Free Study Material`
                        },
                        status: { privacyStatus: 'public' }
                    }
                });
                playlistId = newPl.data.id;
                console.log(`📂 New Playlist created: ${playlistTitle}`);
            }

            await youtube.playlistItems.insert({
                part: 'snippet',
                requestBody: {
                    snippet: {
                        playlistId: playlistId,
                        resourceId: { kind: 'youtube#video', videoId: ytVideoId }
                    }
                }
            });
            console.log(`✅ Playlist mein add!`);
        } catch (plErr) {
            console.log('⚠️ Playlist error:', plErr.message);
        }

        // ✅ Facebook Upload
        await uploadToFacebook(videoPath, seoData.description);

        // ✅ Telegram Notification
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            const icons = {
                'Result': '🏆',
                'Admit Card': '🎫',
                'Answer Key': '🔑',
                'Syllabus': '📚',
                'Default': '⚡'
            };
            const icon = icons[jobCat] || '📌';
            let tgLabel = jobData.type === 'JOB'
                ? '💼 New Govt Job Alert!'
                : `${icon} New ${jobCat}!`;

            const tgMsg =
                `🎬 <b>New Video Live on YouTube!</b>\n\n` +
                `${tgLabel}\n` +
                `<b>${jobData.title}</b>\n\n` +
                `▶️ <b>Watch Now:</b>\n${videoUrl}\n\n` +
                `📌 <b>Full Details:</b>\n${seoData.postLink}\n\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `🔔 <b>Fast Updates ke liye Join karein:</b>\n` +
                `📲 ${seoData.telegramLink}\n\n` +
                `🌐 <b>Website:</b> https://studygyaan.in`;

            try {
                await axios.post(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        chat_id: TELEGRAM_CHAT_ID,
                        text: tgMsg,
                        parse_mode: 'HTML',
                        disable_web_page_preview: false
                    }
                );
                console.log('✅ Telegram notification sent!');
            } catch (tgErr) {
                console.log('⚠️ Telegram error:', tgErr.message);
            }
        } else {
            console.log('⚠️ Telegram credentials missing, skipping...');
        }

        // ✅ First Comment - 15 sec wait
        console.log('⏳ 15 seconds wait (comment ke liye)...');
        await new Promise(r => setTimeout(r, 15000));

        try {
            const commentText =
                `DIRECT LINK yahan hai:\n` +
                `${seoData.postLink}\n\n` +
                `Free PDF + Mock Test:\n` +
                `https://studygyaan.in\n\n` +
                `Telegram Join karein (Fastest Updates):\n` +
                `${seoData.telegramLink}\n\n` +
                `Daily Govt Job Alert ke liye SUBSCRIBE zaroor karein!\n` +
                `Like karein agar helpful laga!`;

            await youtube.commentThreads.insert({
                part: 'snippet',
                requestBody: {
                    snippet: {
                        videoId: ytVideoId,
                        topLevelComment: {
                            snippet: { textOriginal: commentText }
                        }
                    }
                }
            });
            console.log('💬 ✅ First comment post!');
        } catch (commentErr) {
            console.log('⚠️ Comment error:', commentErr.message);
        }

        // ✅ Firestore Update
        try {
            const db = admin.firestore();

            let collection;
            if (jobData.type === 'JOB') {
                collection = 'jobs';
            } else if (jobData.type === 'FAST_TRACK') {
                collection = 'fast_track';
            } else {
                collection = 'fast_track';
            }

            const docId = jobData.slug || jobData.id;
            console.log(`💾 Firestore update: ${collection}/${docId}`);

            if (docId) {
                await db.collection(collection).doc(docId).update({
                    youtubeVideoId: ytVideoId,
                    youtubeVideoUrl: videoUrl,
                    videoCreatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ Firestore updated!`);
            } else {
                console.log('⚠️ docId नहीं मिला, Firestore skip।');
            }
        } catch (dbErr) {
            console.log('⚠️ Firestore update error:', dbErr.message);
        }

        console.log(`\n${'='.repeat(50)}`);
        console.log(`🎉 सब कुछ हो गया!`);
        console.log(`📺 YouTube : ${videoUrl}`);
        console.log(`🌐 Website : ${seoData.postLink}`);
        console.log(`📂 Type    : ${jobData.type}`);
        console.log(`🏷️  Tags    : ${seoData.tags.length}`);
        console.log(`${'='.repeat(50)}\n`);

        return true;

    } catch (err) {
        console.error('❌ Video Engine Error:', err.message);
        console.error(err.stack);
        return false;
    } finally {
        [audioPath, posterPath, videoPath].forEach(f => {
            try {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch (e) { }
        });
        console.log('🧹 Temp files cleanup done!');
    }
}

module.exports = { generateAndUploadVideo };

// =========================================================
// ✅ GitHub Actions Execution Block
// =========================================================
if (require.main === module) {
    const payloadStr = process.env.JOB_DATA;

    if (payloadStr) {
        try {
            const jobData = JSON.parse(payloadStr);

            console.log(`\n🚀 GitHub Actions Mode`);
            console.log(`📌 Title : ${jobData.title}`);
            console.log(`📂 Type  : ${jobData.type}`);
            console.log(`🏷️  Cat   : ${jobData.category}\n`);

            generateAndUploadVideo(jobData)
                .then(success => {
                    if (success) {
                        console.log("✅ Video Process Complete!");
                        process.exit(0);
                    } else {
                        console.log("❌ Video Process Failed!");
                        process.exit(1);
                    }
                })
                .catch(err => {
                    console.error("❌ Fatal Error:", err.message);
                    console.error(err.stack);
                    process.exit(1);
                });
        } catch (e) {
            console.error("❌ JSON Parse Error:", e.message);
            console.error("Raw payload:", payloadStr.substring(0, 200));
            process.exit(1);
        }
    } else {
        console.error("❌ JOB_DATA environment variable नहीं मिला!");
        process.exit(1);
    }
}

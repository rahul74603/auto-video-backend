const fs = require('fs');
const axios = require('axios');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { google } = require('googleapis');
const admin = require("firebase-admin");
const FormData = require('form-data');
const V = require('./video_state');
const ttsEngine = require('./tts_engine');
const flags = require('./agents/growth/feature_flags');
const motionEngine = require('./agents/growth/motion_engine');
const aiVisualEngine = require('./agents/growth/ai_visual_engine');
const { containsApplyLanguage } = require('./agents/growth/content_intent');
require("dotenv").config();

// ✅ Approved anchor files only — never pick up unrelated MP4s from the folder.
const APPROVED_ANCHORS = [
    'male_anchor_1.mp4',
    'male_anchor_3.mp4',
    'female_anchor_2.mp4',
    'female_anchor_4.mp4',
    'female_anchor_5.mp4'
];

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
    const tokenVar       = process.env.YOUTUBE_TOKEN;

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
    const FB_PAGE_ID    = process.env.FB_PAGE_ID;
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

    if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
        console.log('⚠️ FB credentials नहीं मिले, Facebook skip किया।');
        return null;
    }

    console.log('📱 Facebook Reels पर अपलोड शुरू...');

    try {
        const initRes = await axios.post(
            `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/video_reels`,
            {
                upload_phase: 'start',
                access_token: FB_PAGE_TOKEN
            }
        );

        const fbVideoId = initRes.data.video_id;
        const uploadUrl = initRes.data.upload_url;

        const videoBuffer = fs.readFileSync(videoPath);
        await axios.post(uploadUrl, videoBuffer, {
            headers: {
                'Authorization': `OAuth ${FB_PAGE_TOKEN}`,
                'Content-Type':  'application/octet-stream',
                'offset':        '0',
                'file_size':     videoBuffer.length.toString()
            }
        });

        await axios.post(
            `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/video_reels`,
            {
                upload_phase: 'finish',
                video_id:     fbVideoId,
                access_token: FB_PAGE_TOKEN,
                video_state:  'PUBLISHED',
                description:  description
            }
        );

        console.log('✅ Facebook Reel Live! ID: ' + fbVideoId);
        return fbVideoId;

    } catch (reelErr) {
        console.log('⚠️ Reels API failed, normal video try कर रहे हैं...');
        console.log('Reel Error:', reelErr.response?.data || reelErr.message);

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
// 🧠 2. MEGA SEO ENGINE - ULTRA OPTIMIZED FOR BOTH TYPES
// =========================================================
function generateSEO(jobData, jobCat) {

    const currentYear  = new Date().getFullYear();
    const currentMonth = new Date().toLocaleString('en-IN', { month: 'long' });

    // ✅ Category-wise ULTRA power tags - FAST_TRACK के लिए extra viral tags
    const categoryTags = {
        'Result': [
            `SarkariResult${currentYear}`, `Result${currentYear}`, 'ResultOut', 'ResultDeclared',
            'MeritList', 'CutoffList', 'SelectionList', 'FinalResult', 'ResultKaiseCheck',
            'ResultLink', 'SarkariResultToday', 'ExamResult', 'ResultPDF', 'CheckResult',
            'ResultCheckNow', 'ResultLive', 'OfficialResult', 'MarkSheet', 'Scorecard',
            `${currentMonth}Result${currentYear}`, 'ResultNotification', 'ResultAlert'
        ],
        'Admit Card': [
            `AdmitCard${currentYear}`, 'AdmitCardOut', 'HallTicket', 'CallLetter',
            'ExamCenter', 'AdmitCardDownload', 'ExamDate', 'AdmitCardLink', 'EAdmitCard',
            'ExamHallTicket', 'DownloadAdmitCard', 'AdmitCardPDF', 'ExamSchedule',
            `${currentMonth}AdmitCard${currentYear}`, 'AdmitCardAlert', 'AdmitCardNotification',
            'HallTicketDownload', 'ExamCenterList', 'AdmitCardLive'
        ],
        'Answer Key': [
            `AnswerKey${currentYear}`, 'AnswerKeyOut', 'OfficialAnswerKey', 'ProvisionalKey',
            'ObjectionKey', 'AnswerKeyPDF', 'CutoffMarks', 'ExpectedCutoff', 'AnswerKeyLink',
            'AnswerKeyDownload', 'CheckAnswerKey', 'AnswerKeyLive', 'ObjectionWindow',
            `${currentMonth}AnswerKey${currentYear}`, 'AnswerKeyNotification', 'FinalAnswerKey',
            'QuestionPaper', 'SolutionKey', 'AnswerKeyAlert'
        ],
        'Syllabus': [
            `Syllabus${currentYear}`, 'NewSyllabus', 'ExamPattern', 'SyllabusPDF',
            'FreeSyllabus', 'ExamSyllabus', 'StudyPlan', 'ImportantTopics', 'SyllabusInHindi',
            'LatestSyllabus', 'UpdatedSyllabus', 'SyllabusDownload', 'ExamPatternChange',
            `${currentMonth}Syllabus${currentYear}`, 'SyllabusAlert', 'NewExamPattern',
            'SyllabusNotification', 'FreeSyllabusPDF', 'SyllabusLive', 'TopicWiseSyllabus'
        ],
        'Default': [
            `NewVacancy${currentYear}`, 'SarkariNaukri', 'GovtJobs', 'OnlineForm',
            'FreeJobAlert', 'LatestVacancy', 'ApplyOnline', 'NaukariResult', 'JobNotification',
            `Vacancy${currentYear}`, 'SarkariJob', 'GovernmentJob', 'FormFillUp',
            `${currentMonth}Vacancy${currentYear}`, 'JobAlert', 'VacancyOut', 'ApplyNow',
            'NewBharti', 'BhartiAlert', 'SarkariJobAlert'
        ]
    };

    // ✅ ULTRA Universal high-search tags - maximum reach के लिए
    const universalTags = [
        'StudyGyaan', 'StudyGyaanIn', `SarkariResult${currentYear}`,
        `GovtJobs${currentYear}`, `${currentMonth}${currentYear}`,
        'SarkariNaukri', 'ExamPreparation', 'FreePDF', 'JobAlert',
        'LatestUpdate', 'GovernmentJob', 'NaukariUpdate',
        'RailwayJobs', 'SSCJobs', 'BankJobs', 'PoliceJobs',
        'ArmyBharti', 'TeacherBharti', 'StateLevelJobs',
        'SarkariExam', 'ExamUpdate', 'FreeJobAlertIndia',
        'SarkariNaukriAlert', 'GovtJobAlert', 'LatestSarkariJob',
        'IndianGovtJobs', 'CentralGovtJobs', 'StateGovtJobs',
        'JobUpdate', 'NaukariAlert', 'SarkariJobUpdate',
        'Shorts', 'YTShorts', 'ViralShorts', 'TrendingShorts'
    ];

    // ✅ Type-wise EXTRA boost tags
    const typeBoostTags = {
        'JOB': [
            'SarkariNaukriAlert', 'GovtJobVacancy', 'NewGovtJob',
            'LatestGovtJob', 'GovtJobNotification', 'FreshVacancy',
            'JobOpportunity', 'GovtJobSeeker', 'SarkariJobLive'
        ],
        'FAST_TRACK': [
            'FastUpdate', 'BreakingNewsExam', 'ExamAlert',
            'LatestExamUpdate', 'ExamNotification', 'ImportantUpdate',
            'ExamNews', 'QuickUpdate', 'UrgentUpdate'
        ]
    };

    // ✅ Title से keywords extract करो
    const stopWords = ['and', 'the', 'for', 'out', 'now', 'is', 'are', 'was', 'in', 'on', 'of', 'to', 'a', 'an'];
    let titleWords = (jobData.title || '')
        .split(/[\s,\-\/]+/)
        .filter(w => w.length > 2 && !stopWords.includes(w.toLowerCase()))
        .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
        .filter(w => w.length > 2);

    // ✅ Tags combine और deduplicate
    const catSpecificTags = categoryTags[jobCat] || categoryTags['Default'];
    const typeBoost = typeBoostTags[jobData.type] || typeBoostTags['FAST_TRACK'];
    let allTags = [...new Set([...titleWords, ...catSpecificTags, ...typeBoost, ...universalTags])];

    // ✅ YouTube 500 char limit के अंदर रखो
    let finalTags = [];
    let charCount  = 0;
    for (const tag of allTags) {
        if (charCount + tag.length + 2 <= 490) {
            finalTags.push(tag);
            charCount += tag.length + 2;
        }
    }

    // ✅ Post URL - type के हिसाब से
    const identifier = jobData.slug || jobData.id;
    let postLink = "https://studygyaan.in";
    if (identifier) {
        postLink = jobData.type === 'JOB'
            ? `https://studygyaan.in/job/${identifier}`
            : `https://studygyaan.in/update/${identifier}`;
    }

    // ✅ Telegram link
    const telegramLink = process.env.TELEGRAM_CHANNEL_LINK || "https://t.me/studygyaan_official";

    // ✅ Top hashtags for description - category + type के हिसाब से
    const hashtagPool = [...titleWords.slice(0, 3), ...catSpecificTags.slice(0, 5), ...typeBoost.slice(0, 2), ...universalTags.slice(0, 5)];
    const uniqueHashtags = [...new Set(hashtagPool)].slice(0, 15);
    const hashtags = uniqueHashtags
        .map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, ''))
        .join(' ');

    // ✅ Type-wise intro line for description
    const typeIntro = jobData.type === 'JOB'
        ? `💼 सरकारी नौकरी का मौका! ${jobData.title} के लिए अभी Apply करें`
        : `🚨 ${jobCat} जारी! ${jobData.title} - अभी चेक करें`;

    // ✅ Category-wise CTA line
    const categoryCTA = {
        'Result':     '✅ अपना Result अभी Check करें - लिंक नीचे है',
        'Admit Card': '📥 Admit Card Download करें - लिंक नीचे है',
        'Answer Key': '🔑 Answer Key देखें और Objection डालें - लिंक नीचे है',
        'Syllabus':   '📚 Free Syllabus PDF Download करें - लिंक नीचे है',
        'Default':    '🚀 अभी Apply करें - लास्ट डेट निकलने से पहले'
    };
    const ctaLine = categoryCTA[jobCat] || categoryCTA['Default'];

    // ✅ Full ULTRA SEO Description
    const description =
        `${typeIntro}\n\n` +
        `${ctaLine}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 DIRECT LINK - अभी चेक करें:\n` +
        `🔗 ${postLink}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📚 FREE STUDY MATERIAL & JOB ALERTS:\n` +
        `👉 Free PDF + Mock Test: https://studygyaan.in\n` +
        `👉 Daily Job Alert: https://studygyaan.in\n` +
        `👉 Exam Preparation: https://studygyaan.in\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📲 JOIN TELEGRAM (सबसे तेज़ अपडेट - 1 मिनट में notification):\n` +
        `🔔 ${telegramLink}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🏷️ TRENDING KEYWORDS:\n` +
        `${finalTags.join(', ')}\n\n` +
        `${hashtags}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ DISCLAIMER: यह चैनल सिर्फ सूचना के उद्देश्य से है।\n` +
        `Official website के लिए हमेशा ऊपर दिया गया लिंक use करें।\n\n` +
        `🎬 More Videos: https://www.youtube.com/@StudyGyaan`;

    return { tags: finalTags, description, postLink, telegramLink, hashtags, typeIntro, ctaLine };
}

// =========================================================
// 🎬 3. VIRAL TITLE GENERATOR - BOTH TYPES OPTIMIZED
// =========================================================
function generateViralTitle(jobData, jobCat) {
    const currentYear = new Date().getFullYear();
    let cleanTitle = jobData.title.length > 42
        ? jobData.title.substring(0, 42) + "..."
        : jobData.title;

    const hooks = {
        'Result': [
            `😱 RESULT OUT! ${cleanTitle} | चेक करो अभी`,
            `🔥 रिजल्ट जारी! ${cleanTitle} | Direct Link`,
            `🚨 खुशखबरी! ${cleanTitle} Result Declared`,
            `⚡ LIVE Result! ${cleanTitle} | अभी देखें`
        ],
        'Admit Card': [
            `🚨 Admit Card OUT! ${cleanTitle} | अभी Download`,
            `🔥 Hall Ticket जारी! ${cleanTitle} | Link Here`,
            `😱 Exam Date नज़दीक! ${cleanTitle} Admit Card`,
            `⚡ Download NOW! ${cleanTitle} | Exam Center`
        ],
        'Answer Key': [
            `🔑 Answer Key OUT! ${cleanTitle} | Check Now`,
            `🚨 Official Key जारी! ${cleanTitle} | Objection Link`,
            `😱 ${cleanTitle} Answer Key PDF | Free Download`,
            `⚡ Expected Cutoff + ${cleanTitle} | Answer Key`
        ],
        'Syllabus': [
            `📚 New Syllabus जारी! ${cleanTitle} | Free PDF`,
            `🔥 Exam Pattern Changed! ${cleanTitle} | Full Syllabus`,
            `😱 ${cleanTitle} Syllabus ${currentYear} | Free Download`,
            `⚡ New Pattern! ${cleanTitle} | TopicWise PDF`
        ],
        'Default': [
            `😱 बम्पर भर्ती! ${cleanTitle} | Apply Now`,
            `🔥 New Vacancy ${currentYear}! ${cleanTitle} | Form Out`,
            `🚨 सीधी भर्ती! ${cleanTitle} | मौका मत चूको`,
            `⚡ Govt Job Alert! ${cleanTitle} | Last Date`
        ]
    };

    const categoryHooks = hooks[jobCat] || hooks['Default'];
    const selectedHook  = categoryHooks[Math.floor(Math.random() * categoryHooks.length)];

    let finalTitle = `${selectedHook} | StudyGyaan #Shorts`;
    if (finalTitle.length > 100) {
        finalTitle = finalTitle.substring(0, 97) + '...';
    }

    return finalTitle;
}

// =========================================================
// 🎨 4. POSTER DESIGNER
// =========================================================
async function createPoster(jobData, jobCat, posterPath, growthRec = null) {
    const { createCanvas } = require('canvas');

    const width  = 1080;
    const height = 1920;
    const canvas = createCanvas(width, height);
    const ctx    = canvas.getContext('2d');

    // Clean, professional color themes
    const themes = {
        "Result": {
            bg1: '#1a1a2e', bg2: '#16213e', bg3: '#0f3460',
            accent: '#00d4ff', badgeBg: '#e94560',
            textBadge: 'RESULT OUT', emoji: '🏆'
        },
        "Admit Card": {
            bg1: '#2d132c', bg2: '#3d1c4a', bg3: '#4a1f5c',
            accent: '#ffd700', badgeBg: '#ff6b6b',
            textBadge: 'ADMIT CARD OUT', emoji: '🎫'
        },
        "Answer Key": {
            bg1: '#1e3c72', bg2: '#2a5298', bg3: '#1e3c72',
            accent: '#ffa500', badgeBg: '#ff8c00',
            textBadge: 'ANSWER KEY', emoji: '🔑'
        },
        "Syllabus": {
            bg1: '#134e5e', bg2: '#2a6b7c', bg3: '#134e5e',
            accent: '#00ff88', badgeBg: '#00cc6a',
            textBadge: 'NEW SYLLABUS', emoji: ''
        },
        "Default": {
            bg1: '#0f0c29', bg2: '#302b63', bg3: '#24243e',
            accent: '#00d4ff', badgeBg: '#ff006e',
            textBadge: 'LATEST UPDATE', emoji: '⚡'
        }
    };

    const theme = themes[jobCat] || themes['Default'];
    const aiVisualMeta = growthRec?.enhancements?.aiVisual || null;
    // The growth chain decides the layer. When it decided a lower layer
    // (background/template) we honor that and keep the static theme; when it
    // decided the category layer we reuse its palette. Only when there is no
    // chain result at all do we keep the legacy seeded-palette behaviour.
    const categoryVisual = aiVisualMeta?.categoryVisual
        || (
            (!aiVisualMeta || aiVisualMeta.visualSource === 'category_fallback')
                ? aiVisualEngine.resolveCategoryVisualFallback({
                    title: jobData.title,
                    category: jobCat,
                    type: jobData.type,
                    slug: jobData.slug,
                    id: jobData.id,
                    documentId: jobData.id
                }, { seed: growthRec?.enhancements?.visualPlan?.seed })
                : null
        );
    if (categoryVisual?.colors) {
        theme.bg1 = categoryVisual.colors.bg1 || theme.bg1;
        theme.bg2 = categoryVisual.colors.bg2 || theme.bg2;
        theme.bg3 = categoryVisual.colors.bg3 || theme.bg3;
        theme.accent = categoryVisual.colors.accent || theme.accent;
        if (categoryVisual.colors.badgeBg) theme.badgeBg = categoryVisual.colors.badgeBg;
    }

    function fillCategoryBackground() {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, theme.bg1);
        grad.addColorStop(0.5, theme.bg2);
        grad.addColorStop(1, theme.bg3);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    // 1. BACKGROUND — layered visual chain:
    //    AI image (visual_source=ai) -> local fallback image
    //    (visual_source=local_fallback) -> category palette
    //    (visual_source=category_fallback) -> static theme gradient
    //    (visual_source=background_fallback). The poster template itself is
    //    the final guarantee (visual_source=template_fallback).
    let posterApplied = false;
    let visualSource = 'template_fallback';
    const bgImagePath = aiVisualMeta?.path || null;
    const bgImageUsable = bgImagePath
        && fs.existsSync(bgImagePath)
        && aiVisualEngine.isUsableImage(bgImagePath);

    const canvasFallbackSource = () => {
        if (categoryVisual) return 'category_fallback';
        if (aiVisualMeta?.visualSource === 'background_fallback') return 'background_fallback';
        if (aiVisualMeta?.visualSource === 'template_fallback') return 'template_fallback';
        return 'background_fallback';
    };

    if (bgImageUsable) {
        try {
            const { Image } = require('canvas');
            const bgImg = new Image();
            bgImg.src = fs.readFileSync(bgImagePath);
            const scale = Math.max(width / bgImg.width, height / bgImg.height);
            const drawW = bgImg.width * scale;
            const drawH = bgImg.height * scale;
            const drawX = (width - drawW) / 2;
            const drawY = (height - drawH) / 2;
            ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, 0, width, height);
            posterApplied = true;
            visualSource = aiVisualMeta?.visualSource === 'ai' ? 'ai' : 'local_fallback';
            console.log(`visual_source=${visualSource} path=${bgImagePath} loaded=true applied=true`);
            console.log(`🖼️ ${visualSource === 'ai' ? 'AI' : 'Local fallback'} image used as poster background`);
        } catch (err) {
            console.log(`⚠️ Background image load failed (${err.message || err}) — falling back to canvas background`);
            fillCategoryBackground();
            posterApplied = true;
            visualSource = canvasFallbackSource();
            console.log(`visual_source=${visualSource} variant=${categoryVisual?.variant ?? 'static'} applied=true`);
        }
    } else {
        if (bgImagePath) {
            console.log(`⚠️ Background image unusable/missing at: ${bgImagePath} — falling back to canvas background`);
        }
        fillCategoryBackground();
        posterApplied = true;
        visualSource = canvasFallbackSource();
        console.log(`visual_source=${visualSource} variant=${categoryVisual?.variant ?? 'static'} applied=${posterApplied} generation=${aiVisualMeta?.generation || 'none'}`);
    }

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
                y   += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line.trim(), x, y);
        return y + lineHeight;
    }

    // ✅ 2. BRAND LOGO (TOP, LARGE, PROMINENT)
    const brandY = 100;
    ctx.shadowColor  = theme.accent;
    ctx.shadowBlur   = 40;
    drawRoundedRect(100, brandY, 880, 160, 80);
    ctx.fillStyle    = theme.accent;
    ctx.fill();
    ctx.shadowBlur   = 0;
    ctx.fillStyle    = '#000000';
    ctx.font         = 'bold 90px "Noto Sans Devanagari", "Noto Sans", sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STUDYGYAAN.IN', width / 2, brandY + 80);

    // ✅ 3. CATEGORY BADGE (below brand, clean)
    const badgeY = 300;
    drawRoundedRect(200, badgeY, 680, 100, 50);
    ctx.fillStyle    = theme.badgeBg;
    ctx.fill();
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 70px "Noto Sans Devanagari", "Noto Sans", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${theme.emoji} ${theme.textBadge} ${theme.emoji}`, width / 2, badgeY + 50);

    // ✅ 4. FIRST FRAME / IMPORTANT TEXT (clean, no overlap)
    const firstFrameText = (jobData.firstFrameText || '').toUpperCase();
    const importantTextY = 440;
    
    if (firstFrameText) {
        drawRoundedRect(50, importantTextY, 980, 90, 45);
        ctx.fillStyle = '#FF0000';
        ctx.fill();
        ctx.fillStyle    = '#FFFFFF';
        ctx.font         = 'bold 60px "Noto Sans Devanagari", "Noto Sans", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(firstFrameText, width / 2, importantTextY + 45);
    } else {
        ctx.fillStyle = '#FFD700';
        ctx.font      = 'bold 75px "Noto Sans Devanagari", "Noto Sans", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(' IMPORTANT UPDATE 🔥', width / 2, importantTextY + 45);
    }

    // ✅ 5. MAIN TITLE (centered, large, clean)
    ctx.shadowColor  = theme.accent;
    ctx.shadowBlur   = 30;
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 85px "Noto Sans Devanagari", "Noto Sans", sans-serif';
    ctx.textBaseline = 'top';
    const titleY = 580;
    const titleEndY = wrapText(
        (jobData.title || 'Latest Update').toUpperCase(),
        width / 2, titleY, 900, 110
    );
    ctx.shadowBlur = 0;

    // ✅ 6. KEY INFO BOX (dates, vacancies - clean layout)
    const infoBoxY = Math.max(titleEndY + 50, 750);
    drawRoundedRect(80, infoBoxY, 920, 320, 60);
    ctx.fillStyle   = 'rgba(0, 0, 0, 0.7)';
    ctx.fill();
    ctx.lineWidth   = 5;
    ctx.strokeStyle = theme.accent;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let infoLineY = infoBoxY + 60;

    if (['Result', 'Answer Key', 'Admit Card'].includes(jobCat)) {
        ctx.fillStyle    = '#00FF88';
        ctx.font         = 'bold 65px "Noto Sans Devanagari", "Noto Sans", sans-serif';
        ctx.fillText(`${theme.emoji} ${jobCat} DECLARED`, width / 2, infoLineY);
        infoLineY += 90;
        ctx.fillStyle = '#FFFFFF';
        ctx.font      = 'bold 60px "Noto Sans Devanagari", "Noto Sans", sans-serif';
        const showDate = (jobData.updateDate && jobData.updateDate !== 'undefined')
            ? jobData.updateDate : new Date().toLocaleDateString('en-GB');
        ctx.fillText(`${showDate}`, width / 2, infoLineY);
    } else {
        // Show vacancies if available
        if (jobData.vacancies) {
            ctx.fillStyle    = '#00FF88';
            ctx.font         = 'bold 65px "Noto Sans Devanagari", "Noto Sans", sans-serif';
            ctx.fillText(`${jobData.vacancies} VACANCIES`, width / 2, infoLineY);
            infoLineY += 90;
        }
        
        // Apply date
        ctx.fillStyle = '#00D4FF';
        ctx.font      = 'bold 60px "Noto Sans Devanagari", "Noto Sans", sans-serif';
        const showStart = (jobData.startDate && jobData.startDate !== 'undefined')
            ? jobData.startDate : 'Apply Now';
        ctx.fillText(`Apply: ${showStart}`, width / 2, infoLineY);
        infoLineY += 90;
        
        // Last date
        ctx.fillStyle = '#FF4444';
        ctx.font      = 'bold 65px "Noto Sans Devanagari", "Noto Sans", sans-serif';
        const showLast = (jobData.lastDate && jobData.lastDate !== 'undefined')
            ? jobData.lastDate : 'Apply Soon!';
        ctx.fillText(`Last Date: ${showLast}`, width / 2, infoLineY);
    }

    // ✅ 7. DYNAMIC CTA BUTTON (from CTA engine or fallback)
    const ctaY = infoBoxY + 380;
    const ctaTexts = {
        'Result':     { text: 'CHECK RESULT',  color: '#00FF88' },
        'Admit Card': { text: 'DOWNLOAD NOW',  color: '#FFD700' },
        'Answer Key': { text: 'VIEW KEY',      color: '#FFA500' },
        'Syllabus':   { text: 'GET PDF',       color: '#00FF88' },
        'Default':    { text: 'APPLY NOW',     color: '#FF4444' }
    };
    const fallbackCta = ctaTexts[jobCat] || ctaTexts['Default'];
    let ctaText = fallbackCta.text;
    let ctaColor = fallbackCta.color;
    
    if (growthRec?.enhancements?.cta?.closing?.template) {
        const ctaTemplate = growthRec.enhancements.cta.closing.template;
        const nonApplyCats = ['Result', 'Admit Card', 'Answer Key', 'Syllabus'];
        if (nonApplyCats.includes(jobCat) && containsApplyLanguage(ctaTemplate)) {
            ctaText = fallbackCta.text;
            ctaColor = fallbackCta.color;
        } else {
            ctaText = ctaTemplate.toUpperCase().replace(/[^A-Z0-9\s!]/g, '').substring(0, 25);
            ctaColor = growthRec.enhancements.cta.closing.color || fallbackCta.color;
        }
    }

    drawRoundedRect(150, ctaY, 780, 110, 55);
    ctx.fillStyle   = ctaColor;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 75px "Noto Sans Devanagari", "Noto Sans", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(ctaText, width / 2, ctaY + 55);

    // ✅ 8. TELEGRAM (smaller, bottom)
    const tgY = ctaY + 160;
    drawRoundedRect(100, tgY, 880, 80, 40);
    ctx.fillStyle    = '#0088cc';
    ctx.fill();
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 50px "Noto Sans Devanagari", "Noto Sans", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('@studygyaan_official', width / 2, tgY + 40);

    // ✅ 9. FOOTER (clean, minimal)
    ctx.fillStyle    = '#FFD700';
    ctx.fillRect(0, 1780, width, 140);
    ctx.fillStyle    = '#000000';
    ctx.font         = 'bold 60px "Noto Sans Devanagari", "Noto Sans", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('LINK IN FIRST COMMENT', width / 2, 1850);

    fs.writeFileSync(posterPath, canvas.toBuffer('image/png'));
    console.log(' Poster created (clean design)!');

    // Return anchor Y position (where video anchor should be placed)
    return Math.min(tgY + 120, 1400);
}

// =========================================================
// 🎬 5. MAIN VIDEO GENERATOR ENGINE
// =========================================================
/**
 * Render + upload one JOB / FAST_TRACK video.
 *
 * @param {object} jobData  payload (same shape as the repository_dispatch client_payload.jobData)
 * @param {object} [options]
 *        options.managedState  true when the caller (video_dispatcher.js) owns the
 *                              Firestore videoStatus bookkeeping.
 *        options.docRef        resolved Firestore DocumentReference (optional).
 *        options.collection    'jobs' | 'fast_track' (optional).
 *        options.privacyStatus 'public' | 'unlisted' | 'private' (optional override).
 * @returns {Promise<{success:boolean, videoId?:string, videoUrl?:string, error?:string, uploadFailed?:boolean}>}
 */
async function generateAndUploadVideo(jobData, options = {}) {
    const ffmpegPath   = require('ffmpeg-static');

    // Tracks how far we got, so an upload error is reported as `upload_failed`
    // rather than a generic render failure (PART 18).
    let renderCompleted = false;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎬 Video Engine Start`);
    console.log(`📌 Title    : ${jobData.title}`);
    console.log(`📂 Type     : ${jobData.type}`);
    console.log(`🏷️  Category : ${jobData.category}`);
    console.log(`🔗 Slug     : ${jobData.slug}`);
    console.log(`${'='.repeat(50)}\n`);

    const tempDir   = os.tmpdir();
    const timestamp = Date.now();
    const audioPath  = path.join(tempDir, `audio-${timestamp}.mp3`);
    const posterPath = path.join(tempDir, `poster-${timestamp}.png`);
    const safeSlug   = (jobData.slug || 'govt-update').replace(/[^a-z0-9]/gi, '-').substring(0, 50);
    const videoPath  = path.join(tempDir, `${safeSlug}-${timestamp}.mp4`);
    const subtitlePath = path.join(tempDir, `subs-${timestamp}.srt`); // always defined for cleanup

    let jobCat = jobData.category || 'Default';

    if (jobData.type === 'JOB') {
        const validJobCats = ['Result', 'Admit Card', 'Answer Key', 'Syllabus'];
        if (!validJobCats.includes(jobCat)) {
            jobCat = 'Default';
        }
    }

    console.log(`✅ Final jobCat decided: ${jobCat} (type: ${jobData.type})`);

    try {
        const youtube = await getYouTubeClient();

        const targetDir  = __dirname.includes('ai_backend')
            ? __dirname
            : path.join(process.cwd(), 'ai_backend');
        const bgMusicDir = path.join(targetDir, 'bg_music');

        console.log(`📁 Target Dir: ${targetDir}`);

        // 🧠 GROWTH ENGINE INTEGRATION — use recommendation if provided
        const growthRec = options.growthRecommendation || null;
        const growthEnabled = growthRec && growthRec.recommended;
        if (growthEnabled) {
            console.log(`🧠 Growth Engine: contentScore=${growthRec.contentScore}, hook=${growthRec.hook?.hookType || 'none'}, duration=${growthRec.duration}s`);
            const learn = growthRec.learning;
            if (learn) {
                console.log(`🧠 Learning: used=${learn.used} policy=${learn.policyVersion || 'none'} dims=[${(learn.dimensionsApplied || []).join(',') || 'none'}] exploration=${!!learn.exploration}`);
                for (const [dim, d] of Object.entries(learn.decisions || {})) {
                    if (d && d.mode && d.mode !== 'none') {
                        console.log(`   • ${dim}: ${d.mode} → ${String(d.value).slice(0, 40)} (winner=${d.winner}, conf=${d.confidence}, n=${d.sampleSize}${d.applied === false ? ', NOT APPLIED: ' + (d.appliedReason || 'unsupported') : ''})`);
                    }
                }
            }
        }

        let bgMusicPath = '';
        // Music selection: use growth recommendation if available, else random
        if (growthEnabled && growthRec.music && fs.existsSync(growthRec.music)) {
            bgMusicPath = growthRec.music;
            console.log(`🎵 Music (growth): ${path.basename(bgMusicPath)}`);
        } else if (fs.existsSync(bgMusicDir)) {
            const mp3Files = fs.readdirSync(bgMusicDir).filter(f => f.toLowerCase().endsWith('.mp3'));
            if (mp3Files.length > 0) {
                bgMusicPath = path.join(bgMusicDir, mp3Files[Math.floor(Math.random() * mp3Files.length)]);
                console.log(`🎵 Music: ${path.basename(bgMusicPath)}`);
            }
        } else {
            console.log(`⚠️ bg_music folder नहीं मिला: ${bgMusicDir}`);
        }

        // ✅ Only approved anchor files (deterministic list, random pick among them)
        const anchorFiles = APPROVED_ANCHORS.filter(f => fs.existsSync(path.join(targetDir, f)));
        if (anchorFiles.length === 0) {
            throw new Error(
                `❌ Approved anchor videos नहीं मिले: ${targetDir} ` +
                `(expected: ${APPROVED_ANCHORS.join(', ')})`
            );
        }

        // Presenter selection: use growth recommendation if available, else random
        let selectedVideoFile;
        if (growthEnabled && growthRec.presenter && anchorFiles.includes(growthRec.presenter)) {
            selectedVideoFile = growthRec.presenter;
            console.log(`🎥 Anchor (growth): ${selectedVideoFile}`);
        } else {
            selectedVideoFile = anchorFiles[Math.floor(Math.random() * anchorFiles.length)];
        }
        const isFemale          = selectedVideoFile.toLowerCase().includes('female');
        const isMale            = selectedVideoFile.toLowerCase().includes('male');

        let selectedVoice;
        if (isFemale)    selectedVoice = 'hi-IN-Neural2-A';
        else if (isMale) selectedVoice = 'hi-IN-Neural2-C';
        else             selectedVoice = Math.random() > 0.5 ? 'hi-IN-Neural2-A' : 'hi-IN-Neural2-C';

        const finalAnchorPath = path.join(targetDir, selectedVideoFile);
        console.log(`🎥 Anchor: ${selectedVideoFile} | Voice: ${selectedVoice}`);

//  Reusable FFmpeg runner with bounded stderr capture.
//    mode = 'full' | 'static-fallback' (for diagnostics only)
async function runFFmpeg(ffmpegPath, args, mode = 'full') {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, args);
        const stderrChunks = [];
        const MAX_STDERR_BYTES = 12000;
        let totalStderrBytes = 0;

        ffmpeg.stderr.on('data', (data) => {
            const out = data.toString();
            if (out.includes('frame=')) {
                process.stdout.write(`\r[${mode}] ${out.split('\n')[0]}`);
            }
            if (totalStderrBytes < MAX_STDERR_BYTES) {
                const budget = MAX_STDERR_BYTES - totalStderrBytes;
                stderrChunks.push(Buffer.from(data).slice(0, budget));
                totalStderrBytes += Math.min(data.length, budget);
            }
        });
        ffmpeg.on('error', (spawnErr) => reject(new Error(`FFmpeg spawn failed: ${spawnErr.message}`)));
        ffmpeg.on('close', (code, signal) => {
            if (code === 0) {
                console.log(`\n[${mode}] Rendering पूरी!`);
                resolve();
            } else {
                const stderrTail = Buffer.concat(stderrChunks).toString('utf8');
                const diagnostic = stderrTail.length > 4000
                    ? '...[truncated]...' + stderrTail.slice(-4000)
                    : stderrTail;
                const cmdSummary = `${path.basename(ffmpegPath)} ... [${args.length} args]`;
                reject(new Error(
                    `FFmpeg failed (${mode}): exitCode=${code}` +
                    (signal ? ` signal=${signal}` : '') +
                    `\nCommand: ${cmdSummary}` +
                    `\nSTDERR:\n${diagnostic}`
                ));
            }
        });
    });
}

        // TTS credentials are optional now: tts_engine falls back to the free
        // Edge voices when Google TTS is unavailable (e.g. billing disabled).
        const ttsKeyVar = process.env.TTS_KEY_JSON;
        if (!ttsKeyVar || ttsKeyVar === "test") {
            console.log('ℹ️ TTS_KEY_JSON नहीं मिला — free Edge TTS use होगा।');
        }

        let cleanName = (jobData.title || '').length > 55
            ? jobData.title.substring(0, 55)
            : (jobData.title || 'Latest Update');

        const telegramChannel = process.env.TELEGRAM_CHANNEL_NAME || "स्टडी ज्ञान";

        const jobScripts = [
            `बेरोजगार हो? तो ये मौका हाथ से जाने मत देना! ${cleanName} की नई वैकेंसी आउट हो गई है। फॉर्म भरने की पूरी डिटेल पहले कमेंट में है। ${telegramChannel} टेलीग्राम से जुड़ें।`,
            `एक और शानदार सरकारी नौकरी आ गई है! ${cleanName} के लिए अभी अप्लाई करें। लास्ट डेट निकलने से पहले फॉर्म भर दो। लिंक पहले कमेंट में है।`,
            `तैयारी शुरू कर दो! ${cleanName} की बम्पर भर्ती आई है। योग्यता और अप्लाई लिंक पहले कमेंट में देखें। स्टडी ज्ञान से जुड़े रहें।`
        ];

        const fastTrackScripts = {
            'Result': [
                `क्या आपने भी इसका एग्जाम दिया था? तो दिल थाम के बैठिये! ${cleanName} का रिजल्ट फाइनली डिक्लेयर हो चुका है। अपना रिजल्ट चेक करने के लिए पहला कमेंट देखें, और हमारे टेलीग्राम चैनल ${telegramChannel} से जुड़ें।`,
                `जिस रिजल्ट का इंतज़ार था, वो आ गया! ${cleanName} रिजल्ट जारी हो गया है। डायरेक्ट लिंक पहले कमेंट में है। अभी चेक करें।`
            ],
            'Admit Card': [
                `एग्जाम डेट पास आ रही है! ${cleanName} का एडमिट कार्ड जारी हो चुका है। अपना एग्जाम सेंटर और टाइमिंग चेक करने के लिए पहला कमेंट देखें।`,
                `बिना इसके एग्जाम सेंटर में एंट्री नहीं मिलेगी! ${cleanName} एडमिट कार्ड डाउनलोड करें। लिंक पहले कमेंट में है।`
            ],
            'Answer Key': [
                `एग्जाम में टॉप करना है? ${cleanName} की आंसर की जारी हो गई है। अपने जवाब मिलाएं और कटऑफ का अंदाज़ा लगाएं। डायरेक्ट लिंक पहले कमेंट में है।`,
                `${cleanName} आंसर की चेक करें और ऑब्जेक्शन डालने का मौका मत चूकें! लिंक पहले कमेंट में है।`
            ],
            'Syllabus': [
                `सिलेक्शन चाहिए तो ये ज़रूर देखें! ${cleanName} का नया सिलेबस जारी हो गया है। फ्री पीडीएफ डाउनलोड करें, लिंक पहले कमेंट में है।`,
                `${cleanName} एग्जाम पैटर्न बदल गया है! नया सिलेबस चेक करें। फ्री पीडीएफ पहले कमेंट में है।`
            ],
            'Default': [
                `बेरोजगार हो? तो ये मौका हाथ से जाने मत देना! ${cleanName} की नई वैकेंसी आउट हो गई है। फॉर्म भरने की पूरी डिटेल पहले कमेंट में है।`,
                `एक और शानदार सरकारी नौकरी आ गई है! ${cleanName} के लिए अभी अप्लाई करें। लिंक पहले कमेंट में है।`
            ]
        };

        let scriptArray;
        if (jobData.type === 'JOB') {
            scriptArray = jobScripts;
        } else {
            scriptArray = fastTrackScripts[jobCat] || fastTrackScripts['Default'];
        }

        // 🧠 GROWTH ENGINE: use generated script if available and high-quality
        let script;
        if (growthEnabled && growthRec.script && growthRec.script.script && growthRec.contentScore >= 40) {
            script = growthRec.script.script;
            console.log(`🎙️ Script (growth): ${script.substring(0, 80)}...`);
        } else {
            script = scriptArray[Math.floor(Math.random() * scriptArray.length)];
            console.log(`🎙️ Script: ${script.substring(0, 80)}...`);
        }

        // 🧠 LEARNED DURATION (Growth Self-Learning, Phase 5): the target
        // duration from the recommendation (blended with the learned policy
        // target when learning is active) is applied to the REAL render by
        // (1) trimming the script to a safe word budget (content is only
        // ever removed, never invented) and (2) adjusting the TTS speaking
        // rate within a natural band. The rendered video's length equals
        // the voice track, so this genuinely changes the output duration.
        let speakingRate = 1.08;
        const durationTarget = (growthEnabled
            && Number.isFinite(Number(growthRec.duration))
            && Number(growthRec.duration) >= 10
            && Number(growthRec.duration) <= 60) ? Math.round(Number(growthRec.duration)) : null;
        if (durationTarget) {
            const durationFitter = require('./agents/growth/duration_fitter');
            const fit = durationFitter.fitScriptToDuration(script, durationTarget);
            if (fit.script && fit.script.trim()) script = fit.script;
            speakingRate = fit.speakingRate;
            const learningNote = growthRec.learning && growthRec.learning.decisions
                && growthRec.learning.decisions.duration
                ? ` (mode=${growthRec.learning.decisions.duration.mode}${growthRec.learning.decisions.duration.changedSelection ? ', changed from default ' + growthRec.learning.decisions.duration.defaultWouldBe + 's' : ''})`
                : '';
            console.log(`🎯 Duration target ${durationTarget}s${learningNote}: est ${fit.estimatedSeconds}s, rate ${speakingRate}, trimmed=${fit.trimmed} (${fit.strategy})`);
        }

        await ttsEngine.synthesize(script, audioPath, {
            googleVoice:  selectedVoice,
            gender:       isFemale ? 'female' : (isMale ? 'male' : 'neutral'),
            speakingRate: speakingRate,
            pitch:        1.0
        });

        // 🧠 GROWTH ENGINE: Generate subtitles for the video
        let hasSubtitles = false;
        try {
            const flags = require('./agents/growth/feature_flags');
const motionEngine = require('./agents/growth/motion_engine');
            if (flags.isEnabled('SUBTITLE_ENGINE_ENABLED')) {
                const subtitleEngine = require('./agents/growth/subtitle_engine');
                // Build minimal script structure for subtitle generation
                const scriptForSubs = {
                    script: script,
                    sections: growthRec?.script?.sections || { hook: script }
                };
                // Use growth keywords for highlighting if available
                const keywords = growthRec?.script?.sections?.hook
                    ? growthRec.script.sections.hook.split(/\s+/).filter(w => /\d/.test(w) || /PASS|POST|DATE|RESULT/i.test(w))
                    : [];
                const subResult = subtitleEngine.generateSubtitles(scriptForSubs, { keywords });
                if (subResult.subtitles && subResult.subtitles.length > 0) {
                    const srtContent = subResult.toSRT();
                    fs.writeFileSync(subtitlePath, srtContent, 'utf8');
                    hasSubtitles = fs.existsSync(subtitlePath) && fs.statSync(subtitlePath).size > 0;
                    if (hasSubtitles) {
                        console.log(`📝 Subtitles generated: ${subResult.subtitles.length} segments`);
                    }
                }
            }
        } catch (subErr) {
            console.log(`⚠️ Subtitle generation failed (${V.shortError(subErr, 80)}) — continuing without subtitles`);
            hasSubtitles = false;
        }

        // 🧠 GROWTH ENGINE: Generate first-frame overlay text
        const firstFrameText = growthRec?.firstFrame?.text || '';
        if (firstFrameText) {
            console.log(`️ First frame: "${firstFrameText}"`);
            // Pass to poster generator
            jobData.firstFrameText = firstFrameText;
        }

        const safeAnchorY = await createPoster(jobData, jobCat, posterPath, growthRec);
        console.log(`📍 Anchor Y position: ${safeAnchorY}`);

        console.log('🎬 FFmpeg Rendering शुरू...');

        const finalPoster   = path.resolve(posterPath);
        const finalAudio    = path.resolve(audioPath);
        const finalVideoOut = path.resolve(videoPath);
        const finalAnchor   = path.resolve(finalAnchorPath);
        const finalMusic    = bgMusicPath ? path.resolve(bgMusicPath) : null;
        const hasMusic      = finalMusic && fs.existsSync(finalMusic);

        console.log(`🔍 File Check:`);
        console.log(`   Poster : ${fs.existsSync(finalPoster)}`);
        console.log(`   Anchor : ${fs.existsSync(finalAnchor)}`);
        console.log(`   Audio  : ${fs.existsSync(finalAudio)}`);
        console.log(`   Music  : ${hasMusic}`);

        // outLabel: which video output label to map (with or without subtitles)
        const burnEnabled = flags.isEnabled('SUBTITLE_BURN_ENABLED');
        const outLabel = (hasSubtitles && burnEnabled) ? '[outvs]' : '[outv]';

        // 🔧 subFilter must be declared OUTSIDE the if(hasMusic)/else blocks
        // so it's in scope for the static-fallback retry filter below.
        let subFilter = '';
        if (hasSubtitles && burnEnabled) {
            subFilter = `;[outv]subtitles='${subtitlePath}':force_style='FontName=Noto Sans Devanagari,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,MarginV=180,Alignment=2'[outvs]`;
        }

        let filter, args;

        if (hasMusic) {
            // 🔥 SUBTITLE BURN: only when flag ON + SRT exists.
            // Default OFF — GitHub Actions runner has no Devanagari font,
            // burning produces □□□ tofu boxes. SRT still generated for
            // YouTube CC upload; burn when font is installed.
            // subFilter is already computed above in outer scope.
            // 🧠 MOTION ENGINE: Apply controlled motion to poster
            let motionFilter = '';
            if (growthEnabled && growthRec?.enhancements?.motionProfile?.profile?.ffmpegFilter) {
                motionFilter = growthRec.enhancements.motionProfile.profile.ffmpegFilter;
                console.log(` Motion: ${growthRec.enhancements.motionProfile.profile.name}`);
            } else {
                // Default subtle zoom
                motionFilter = "zoompan=z='min(zoom+0.0005,1.1)':d=1:s=1080x1920:fps=30";
            }
            
            filter =
                `[0:v]${motionFilter}[bg];` +
                `[1:v]format=yuv420p,crop=iw:ih-80:0:0,colorkey=0x00FF00:0.3:0.1,scale=680:-1[anchor];` +
                `[bg][anchor]overlay=(main_w-overlay_w)/2:${safeAnchorY}[outv]` +
                subFilter + `;` +
                `[2:a]volume=1.5[voice];[3:a]volume=0.08[bgm];[voice][bgm]amix=inputs=2:duration=first[a]`;

            args = [
                '-y',
                '-loop', '1', '-i', finalPoster,
                '-stream_loop', '-1', '-an', '-i', finalAnchor,
                '-i', finalAudio,
                '-stream_loop', '-1', '-i', finalMusic,
                '-filter_complex', filter,
                '-map', outLabel, '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'superfast', '-crf', '26',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-shortest', '-pix_fmt', 'yuv420p',
                finalVideoOut
            ];
        } else {
            console.log('⚠️ BG Music नहीं मिला, बिना म्यूजिक के render...');
            // subFilter already computed above in outer scope.
            // 🔥 SUBTITLE BURN: only when flag ON + SRT exists.
            // 🧠 MOTION ENGINE: Apply controlled motion to poster
            let motionFilter = '';
            if (growthEnabled && growthRec?.enhancements?.motionProfile?.profile?.ffmpegFilter) {
                motionFilter = growthRec.enhancements.motionProfile.profile.ffmpegFilter;
                console.log(`🎬 Motion: ${growthRec.enhancements.motionProfile.profile.name}`);
            } else {
                // Default subtle zoom
                motionFilter = "zoompan=z='min(zoom+0.0005,1.1)':d=1:s=1080x1920:fps=30";
            }
            
            filter =
                `[0:v]${motionFilter}[bg];` +
                `[1:v]format=yuv420p,crop=iw:ih-80:0:0,colorkey=0x00FF00:0.3:0.1,scale=680:-1[anchor];` +
                `[bg][anchor]overlay=(main_w-overlay_w)/2:${safeAnchorY}[outv]` +
                subFilter + `;` +
                `[2:a]volume=1.5[a]`;

            args = [
                '-y',
                '-loop', '1', '-i', finalPoster,
                '-stream_loop', '-1', '-an', '-i', finalAnchor,
                '-i', finalAudio,
                '-filter_complex', filter,
                '-map', outLabel, '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'superfast', '-crf', '26',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-shortest', '-pix_fmt', 'yuv420p',
                finalVideoOut
            ];
        }

        //  FFmpeg rendering with motion-fallback:
        //   1. Try full filter (poster + motion + anchor overlay)
        //   2. On failure, retry with static poster (no motion)
        //   3. On second failure, give up — let caller mark as failed
        const STATIC_MOTION = "zoompan=z='min(zoom+0.0005,1.1)':d=1:s=1080x1920:fps=30";
        let ffmpegSucceeded = false;

        for (const attempt of [filter, null]) {   // null = static fallback
            const effectiveFilter = attempt || (hasMusic
                ? `${STATIC_MOTION}[bg];[1:v]format=yuv420p,crop=iw:ih-80:0:0,colorkey=0x00FF00:0.3:0.1,scale=680:-1[anchor];[bg][anchor]overlay=(main_w-overlay_w)/2:${safeAnchorY}[outv]${subFilter};[2:a]volume=1.5[voice];[3:a]volume=0.08[bgm];[voice][bgm]amix=inputs=2:duration=first[a]`
                : `${STATIC_MOTION}[bg];[1:v]format=yuv420p,crop=iw:ih-80:0:0,colorkey=0x00FF00:0.3:0.1,scale=680:-1[anchor];[bg][anchor]overlay=(main_w-overlay_w)/2:${safeAnchorY}[outv]${subFilter};[2:a]volume=1.5[a]`
            );

            const ffmpegArgs = hasMusic
                ? ['-y', '-loop', '1', '-i', finalPoster, '-stream_loop', '-1', '-an', '-i', finalAnchor, '-i', finalAudio, '-stream_loop', '-1', '-i', finalMusic, '-filter_complex', effectiveFilter, '-map', outLabel, '-map', '[a]', '-c:v', 'libx264', '-preset', 'superfast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-shortest', '-pix_fmt', 'yuv420p', finalVideoOut]
                : ['-y', '-loop', '1', '-i', finalPoster, '-stream_loop', '-1', '-an', '-i', finalAnchor, '-i', finalAudio, '-filter_complex', effectiveFilter, '-map', outLabel, '-map', '[a]', '-c:v', 'libx264', '-preset', 'superfast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-shortest', '-pix_fmt', 'yuv420p', finalVideoOut];

            try {
                await runFFmpeg(ffmpegPath, ffmpegArgs, effectiveFilter === filter ? 'full' : 'static-fallback');
                ffmpegSucceeded = true;
                break;
            } catch (err) {
                const isFallback = attempt === null;
                if (isFallback) throw err;   // last attempt — propagate
                console.log(`⚠️ FFmpeg full-motion render failed — retrying with static poster: ${V.shortError(err, 120)}`);
            }
        }

        if (ffmpegSucceeded) console.log('✅ Rendering पूरी!');
        else throw new Error('FFmpeg failed after all fallback attempts');

        renderCompleted = true;

        // ✅ SEO Data Generate - BOTH TYPES के लिए full data
        // 🧠 GROWTH ENGINE: use platform-specific packaging if available
        let seoData, finalTitle;
        if (growthEnabled && growthRec.platformPackage && growthRec.platformPackage.youtube) {
            const ytPkg = growthRec.platformPackage.youtube;
            finalTitle = ytPkg.title || generateViralTitle(jobData, jobCat);
            seoData = {
                tags: ytPkg.tags || [],
                description: ytPkg.description || '',
                postLink: `https://studygyaan.in/${jobData.type === 'JOB' ? 'job' : 'update'}/${jobData.slug || jobData.id}`,
                telegramLink: process.env.TELEGRAM_CHANNEL_LINK || "https://t.me/studygyaan_official",
                hashtags: (ytPkg.hashtags || []).map(h => '#' + h).join(' '),
                typeIntro: '',
                ctaLine: ytPkg.cta || ''
            };
            console.log(`🧠 SEO (growth): title="${finalTitle}", tags=${seoData.tags.length}`);
        } else {
            seoData    = generateSEO(jobData, jobCat);
            finalTitle = generateViralTitle(jobData, jobCat);
        }

        console.log(`\n📊 SEO REPORT:`);
        console.log(`   📌 Title       : ${finalTitle}`);
        console.log(`   🏷️  Tags Count  : ${seoData.tags.length}`);
        console.log(`   📝 Tags Preview: ${seoData.tags.slice(0, 8).join(', ')}...`);
        console.log(`   🔗 Post Link   : ${seoData.postLink}`);
        console.log(`   #️⃣  Hashtags    : ${seoData.hashtags.substring(0, 80)}...`);

        // ✅ Full YouTube Description - BOTH TYPES के लिए proper description
        const youtubeDescription =
            `${seoData.description}\n\n` +
            `⚡ Powered by StudyGyaan.in`;

        // A non-public upload means this is a controlled test run. Public
        // side-channels (Facebook, Telegram, the YouTube first comment) must be
        // skipped, otherwise a test video is broadcast to the real audience
        // even though YouTube itself is unlisted.
        const effectivePrivacy = options.privacyStatus || process.env.VIDEO_PRIVACY_STATUS || 'public';
        const isTestUpload     = effectivePrivacy !== 'public';
        if (isTestUpload) {
            console.log(`🧪 Test upload (privacy=${effectivePrivacy}) — Facebook / Telegram / first-comment skip होंगे।`);
        }

        // ✅ YouTube Upload with full SEO
        console.log('📤 YouTube पर Upload हो रहा है...');
        console.log(`🏷️  Uploading ${seoData.tags.length} tags...`);
        
        const ytRes = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: {
                    title:          finalTitle,
                    description:    youtubeDescription,
                    tags:           seoData.tags,
                    categoryId:     '27',  // Education
                    defaultLanguage: 'hi',
                    defaultAudioLanguage: 'hi'
                },
                status: {
                    // Default stays 'public'. VIDEO_PRIVACY_STATUS=unlisted lets the
                    // pipeline be tested without spamming the public channel (PART 24).
                    privacyStatus:           options.privacyStatus || process.env.VIDEO_PRIVACY_STATUS || 'public',
                    selfDeclaredMadeForKids: false,
                    madeForKids:             false
                }
            },
            media: { body: fs.createReadStream(videoPath) }
        });

        const videoId  = ytRes.data.id;
        const videoUrl = `https://youtu.be/${videoId}`;
        console.log(`✅ YouTube Live! ${videoUrl}`);
        console.log(`✅ SEO Tags Applied: ${seoData.tags.length} tags`);

        // ✅ Custom Thumbnail
        try {
            await youtube.thumbnails.set({
                videoId: videoId,
                media:   { body: fs.createReadStream(posterPath) }
            });
            console.log('🖼️ Thumbnail set!');
        } catch (thumbErr) {
            console.log('⚠️ Thumbnail error:', thumbErr.message);
        }

        // ✅ Playlist में add करो
        try {
            // A non-public test upload must not appear in a public playlist.
            if (isTestUpload) {
                throw new Error(`Playlist skipped — test upload (privacy=${effectivePrivacy})`);
            }

            const playlistNames = {
                'Result':     'Results & Updates',
                'Admit Card': 'Admit Cards',
                'Syllabus':   'Exam Syllabus',
                'Answer Key': 'Answer Keys',
                'Default':    'Latest Govt Jobs'
            };
            const playlistTitle = playlistNames[jobCat] || playlistNames['Default'];

            const plRes = await youtube.playlists.list({
                part:       'snippet',
                mine:       true,
                maxResults: 50
            });

            let playlistId = null;
            const existing = (plRes.data.items || []).find(
                p => p.snippet.title.toLowerCase() === playlistTitle.toLowerCase()
            );

            if (existing) {
                playlistId = existing.id;
                console.log(`📂 Existing Playlist found: ${playlistTitle}`);
            } else {
                const newPl = await youtube.playlists.insert({
                    part: 'snippet,status',
                    requestBody: {
                        snippet: {
                            title:       playlistTitle,
                            description: `${playlistTitle} - StudyGyaan.in | Latest Updates`
                        },
                        status: { privacyStatus: 'public' }
                    }
                });
                playlistId = newPl.data.id;
                console.log(`📂 नई Playlist बनाई: ${playlistTitle}`);
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
            console.log(`✅ Playlist '${playlistTitle}' में add किया!`);
        } catch (plErr) {
            console.log('⚠️ Playlist error:', plErr.message);
        }

        // Independent platform statuses — one failure must not mark the whole
        // video as failed. Each platform is tracked separately in Firestore.
        const platformStatuses = { youtube: 'completed' };

        // ✅ Facebook Upload (public runs only)
        if (isTestUpload) {
            console.log('⏭️ Facebook skip — test upload.');
            platformStatuses.facebook = 'skipped';
        } else {
            try {
                await uploadToFacebook(videoPath, seoData.description);
                platformStatuses.facebook = 'completed';
            } catch (fbErr) {
                console.log('⚠️ Facebook upload failed:', fbErr.message);
                platformStatuses.facebook = 'failed';
                platformStatuses.facebookError = V.shortError(fbErr, 200);
            }
        }

        // ✅ Telegram Notification
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

        if (isTestUpload) {
            console.log('⏭️ Telegram skip — test upload.');
        } else if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            const icons = {
                'Result':     '🏆',
                'Admit Card': '🎫',
                'Answer Key': '🔑',
                'Syllabus':   '📚',
                'Default':    '⚡'
            };
            const icon = icons[jobCat] || '📌';

            let tgLabel = jobData.type === 'JOB' ? '💼 New Govt Job Alert!' : `${icon} New ${jobCat}!`;

            const tgMsg =
                `🎬 <b>New Video Live on YouTube!</b>\n\n` +
                `${tgLabel}\n` +
                `<b>${jobData.title}</b>\n\n` +
                `▶️ <b>Watch Now:</b>\n${videoUrl}\n\n` +
                `📌 <b>Full Details & Direct Link:</b>\n${seoData.postLink}\n\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `🔔 <b>Fast Updates के लिए Join करें:</b>\n` +
                `📲 ${seoData.telegramLink}\n\n` +
                `🌐 <b>Website:</b> https://studygyaan.in`;

            try {
                await axios.post(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        chat_id:                  TELEGRAM_CHAT_ID,
                        text:                     tgMsg,
                        parse_mode:               'HTML',
                        disable_web_page_preview: false
                    }
                );
                console.log('✅ Telegram notification sent!');
                platformStatuses.telegram = 'completed';
            } catch (tgErr) {
                console.log('⚠️ Telegram error:', tgErr.message);
                platformStatuses.telegram = 'failed';
                platformStatuses.telegramError = V.shortError(tgErr, 200);
            }
        } else {
            console.log('️ Telegram credentials missing, skipping...');
            platformStatuses.telegram = 'skipped';
        }

        // ✅ Auto First Comment (public runs only)
        if (isTestUpload) {
            console.log('⏭️ First comment skip — test upload.');
        } else {
        console.log('⏳ 12 seconds wait (comment के लिए)...');
        await new Promise(r => setTimeout(r, 12000));

        try {
            const commentText =
                `📌 DIRECT LINK यहाँ है 👇\n` +
                `🔗 ${seoData.postLink}\n\n` +
                `📚 Free PDF + Mock Test:\n` +
                `👉 https://studygyaan.in\n\n` +
                `📲 Telegram Join करें (सबसे तेज़ Updates):\n` +
                `🔔 ${seoData.telegramLink}\n\n` +
                `🏷️ Tags: ${seoData.tags.slice(0, 10).map(t => '#' + t).join(' ')}\n\n` +
                `🚀 Daily Govt Job Alert के लिए Subscribe करें!`;

            await youtube.commentThreads.insert({
                part: 'snippet',
                requestBody: {
                    snippet: {
                        videoId:         videoId,
                        topLevelComment: {
                            snippet: { textOriginal: commentText }
                        }
                    }
                }
            });
            console.log('💬 First comment post हो गया!');
        } catch (commentErr) {
            console.log('⚠️ Comment error:', commentErr.message);
        }
        }

        // ✅ Firestore state update.
        // When the dispatcher owns the state machine (managedState) it writes the
        // final videoStatus itself — we skip here to keep a single writer.
        if (options.managedState) {
            console.log('💾 Firestore state handled by dispatcher (managedState) — engine skip.');
        } else {
            const collection = options.collection || (jobData.type === 'JOB' ? 'jobs' : 'fast_track');
            try {
                const db = admin.firestore();
                const ref = options.docRef || await V.resolveDocRef(db, collection, {
                    docId: jobData.id,
                    id:    jobData.id,
                    slug:  jobData.slug
                });

                if (ref) {
                    console.log(`💾 Firestore update: ${collection}/${ref.id}`);
                    await V.markCompleted(db, admin, collection, ref, { videoId, videoUrl });
                    console.log(`✅ Firestore updated: ${collection}/${ref.id}`);
                } else {
                    console.log(`⚠️ ${collection} document नहीं मिला (id=${jobData.id}, slug=${jobData.slug}) — Firestore skip.`);
                }
            } catch (dbErr) {
                console.log('⚠️ Firestore update error:', dbErr.message);
            }
        }

        console.log(`\n${'='.repeat(50)}`);
        console.log(`🎉 सब कुछ हो गया!`);
        console.log(`📺 YouTube   : ${videoUrl}`);
        console.log(`🌐 Website   : ${seoData.postLink}`);
        console.log(`📂 Type      : ${jobData.type}`);
        console.log(`🏷️  Category  : ${jobCat}`);
        console.log(`🔖 Tags Count: ${seoData.tags.length}`);
        console.log(`${'='.repeat(50)}\n`);

        return { success: true, videoId, videoUrl, platformStatuses };

    } catch (err) {
        // Render succeeded but something after it (YouTube upload) blew up →
        // report upload_failed so the document is not marked "completed".
        const uploadFailed = renderCompleted === true;
        console.error(`❌ Video Engine Error (${uploadFailed ? 'upload stage' : 'render stage'}):`, err.message);
        console.error(err.stack);

        if (!options.managedState) {
            const collection = options.collection || (jobData.type === 'JOB' ? 'jobs' : 'fast_track');
            await V.safeUpdate(
                admin.firestore(), admin, collection,
                options.docRef || { docId: jobData.id, id: jobData.id, slug: jobData.slug },
                (ref) => V.markFailed(admin.firestore(), admin, collection, ref, err, { uploadFailed })
            );
        }

        return { success: false, error: V.shortError(err), uploadFailed };
    } finally {
        [audioPath, posterPath, videoPath, subtitlePath].forEach(f => {
            try {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch (e) {
                // ignore cleanup errors
            }
        });
        console.log('🧹 Temp files cleanup done!');
    }
}

module.exports = { generateAndUploadVideo, APPROVED_ANCHORS };

// =========================================================
// ✅ GitHub Actions Execution Block (repository_dispatch path)
// =========================================================
/**
 * Claim the source document before rendering so the legacy Cloud Function path
 * and the new scheduled dispatcher can never produce duplicate videos.
 * If Firestore is unreachable we still render (fail-open) — the old behaviour.
 */
async function runFromRepositoryDispatch(jobData) {
    const collection = jobData.type === 'JOB' ? 'jobs' : 'fast_track';
    const kind       = jobData.type === 'JOB' ? V.KIND.JOB : V.KIND.FAST_TRACK;
    const runId      = process.env.GITHUB_RUN_ID
        ? `dispatch-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
        : `dispatch-${Date.now()}`;

    let db   = null;
    let ref  = null;

    try {
        db  = admin.firestore();
        ref = await V.resolveDocRef(db, collection, {
            docId: jobData.id,
            id:    jobData.id,
            slug:  jobData.slug
        });
    } catch (err) {
        console.log(`⚠️ Firestore unavailable for claim (${V.shortError(err, 140)}) — rendering without claim.`);
    }

    if (!ref) {
        console.log(`⚠️ ${collection} document नहीं मिला (id=${jobData.id}, slug=${jobData.slug}) — claim skip, rendering anyway.`);
        const result = await generateAndUploadVideo(jobData);
        return result.success === true;
    }

    let claimed = false;
    try {
        const claim = await V.claim(db, admin, kind, ref, {
            runId,
            worker: 'repository-dispatch',
            // Legacy trigger just fired for this doc — that is exactly why we are here.
            legacyGraceMs: 0,
            // Manual/legacy dispatch should not be blocked by the backlog window.
            maxAgeDays: 0
        });
        claimed = claim.claimed;
        if (!claimed) {
            console.log(`⏭️ Skipping duplicate video for ${collection}/${ref.id} — ${claim.reason}`);
            return true; // not an error: another worker already handled it
        }
        console.log(`🔒 Claimed ${collection}/${ref.id} (attempt ${claim.attempts})`);
    } catch (err) {
        console.log(`⚠️ Claim failed (${V.shortError(err, 140)}) — rendering without claim.`);
    }

    const result = await generateAndUploadVideo(jobData, {
        managedState: claimed,
        collection,
        docRef: ref
    });

    if (claimed) {
        if (result.success) {
            await V.safeUpdate(db, admin, collection, ref, (r) =>
                V.markCompleted(db, admin, collection, r, {
                    videoId:  result.videoId,
                    videoUrl: result.videoUrl
                })
            );
        } else {
            await V.safeUpdate(db, admin, collection, ref, (r) =>
                V.markFailed(db, admin, collection, r, result.error, { uploadFailed: result.uploadFailed })
            );
        }
    }

    return result.success === true;
}

if (require.main === module) {
    const payloadStr = process.env.JOB_DATA;

    if (payloadStr) {
        let jobData;
        try {
            jobData = JSON.parse(payloadStr);
        } catch (e) {
            console.error("❌ JSON Parse Error:", e.message);
            console.error("Raw payload:", payloadStr.substring(0, 200));
            process.exit(1);
        }

        console.log(`\n🚀 GitHub Actions Mode`);
        console.log(`📌 Title : ${jobData.title}`);
        console.log(`📂 Type  : ${jobData.type}`);
        console.log(`🏷️  Cat   : ${jobData.category}\n`);

        runFromRepositoryDispatch(jobData)
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
    } else {
        console.error("❌ JOB_DATA environment variable नहीं मिला!");
        process.exit(1);
    }
}

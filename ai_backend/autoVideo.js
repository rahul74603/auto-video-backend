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
async function createPoster(jobData, jobCat, posterPath) {
    const { createCanvas } = require('canvas');

    const width  = 1080;
    const height = 1920;
    const canvas = createCanvas(width, height);
    const ctx    = canvas.getContext('2d');

    const themes = {
        "Result": {
            bg1: '#0f2027', bg2: '#203a43', bg3: '#2c5364',
            accent: '#00FF00', badgeBg: '#28a745',
            textBadge: '🏆 RESULT DECLARED 🏆', emoji: '🏆'
        },
        "Admit Card": {
            bg1: '#4b134f', bg2: '#c94b4b', bg3: '#ff0844',
            accent: '#FFD700', badgeBg: '#dc3545',
            textBadge: '🎫 ADMIT CARD OUT 🎫', emoji: '🎫'
        },
        "Syllabus": {
            bg1: '#141e30', bg2: '#243b55', bg3: '#2c3e50',
            accent: '#00FFFF', badgeBg: '#17a2b8',
            textBadge: '📚 NEW SYLLABUS 📚', emoji: '📚'
        },
        "Answer Key": {
            bg1: '#232526', bg2: '#414345', bg3: '#4b6cb7',
            accent: '#FFA500', badgeBg: '#fd7e14',
            textBadge: '🔑 ANSWER KEY 🔑', emoji: '🔑'
        },
        "Default": {
            bg1: '#0f0c29', bg2: '#302b63', bg3: '#24243e',
            accent: '#00FFFF', badgeBg: '#d32f2f',
            textBadge: '⚡ LATEST UPDATE ⚡', emoji: '⚡'
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
    ctx.fillStyle   = theme.accent;
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
                y   += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line.trim(), x, y);
        return y + lineHeight;
    }

    // ✅ 1. TOP LOGO BAR
    ctx.shadowColor  = theme.accent;
    ctx.shadowBlur   = 30;
    drawRoundedRect(80, 60, 920, 130, 65);
    ctx.fillStyle    = theme.accent;
    ctx.fill();
    ctx.shadowBlur   = 0;
    ctx.fillStyle    = '#000000';
    ctx.font         = 'bold 72px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📚 STUDYGYAAN.IN 📚', width / 2, 125);

    // ✅ 2. CATEGORY BADGE
    ctx.fillStyle    = theme.badgeBg;
    ctx.fillRect(0, 220, width, 110);
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 62px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(theme.textBadge, width / 2, 275);

    // ✅ 3. IMPORTANT TEXT
    ctx.fillStyle = '#FFFF00';
    ctx.font      = 'bold 78px sans-serif';
    ctx.fillText('🔥 IMPORTANT UPDATE 🔥', width / 2, 390);

    // ✅ 4. MAIN TITLE
    ctx.shadowColor  = theme.accent;
    ctx.shadowBlur   = 20;
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = '900 78px sans-serif';
    ctx.textBaseline = 'alphabetic';
    let titleEndY = wrapText(
        (jobData.title || '').toUpperCase(),
        width / 2, 510, 960, 95
    );
    ctx.shadowBlur = 0;

    // ✅ 5. CTA BUTTON
    let ctaY = titleEndY + 40;

    const ctaTexts = {
        'Result':     { text: '✅ CHECK RESULT NOW',  color: '#00FF00' },
        'Admit Card': { text: '📥 DOWNLOAD NOW',      color: '#FFD700' },
        'Answer Key': { text: '🔑 CHECK ANSWER KEY',  color: '#FFA500' },
        'Syllabus':   { text: '📚 FREE PDF DOWNLOAD', color: '#00FFFF' },
        'Default':    { text: '🚀 APPLY NOW',          color: '#FF4444' }
    };
    const cta = ctaTexts[jobCat] || ctaTexts['Default'];

    drawRoundedRect(100, ctaY - 55, 880, 90, 45);
    ctx.fillStyle   = cta.color;
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle    = cta.color;
    ctx.font         = 'bold 68px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(cta.text, width / 2, ctaY);

    // ✅ 6. INFO BOX
    let infoBoxY = ctaY + 80;
    drawRoundedRect(50, infoBoxY, 980, 260, 40);
    ctx.fillStyle   = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    ctx.lineWidth   = 4;
    ctx.strokeStyle = theme.accent;
    ctx.stroke();

    ctx.font = 'bold 58px sans-serif';
    const todayDate = new Date().toLocaleDateString('en-GB');

    if (['Result', 'Answer Key', 'Admit Card'].includes(jobCat)) {
        ctx.fillStyle    = '#00FFFF';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${theme.emoji} Update: ${jobCat} Out!`, width / 2, infoBoxY + 80);
        ctx.fillStyle = '#FFFFFF';
        const showDate = (jobData.updateDate && jobData.updateDate !== 'undefined')
            ? jobData.updateDate : todayDate;
        ctx.fillText(`📅 Date: ${showDate}`, width / 2, infoBoxY + 180);
    } else {
        ctx.fillStyle    = '#00FFFF';
        ctx.textBaseline = 'middle';
        const showStart = (jobData.startDate && jobData.startDate !== 'undefined')
            ? jobData.startDate : 'Apply Now';
        ctx.fillText(`🚀 Apply: ${showStart}`, width / 2, infoBoxY + 80);
        ctx.fillStyle = '#FFFFFF';
        ctx.font      = 'bold 65px sans-serif';
        const showLast = (jobData.lastDate && jobData.lastDate !== 'undefined')
            ? jobData.lastDate : 'जल्दी करें!';
        ctx.fillText(`⏳ Last Date: ${showLast}`, width / 2, infoBoxY + 180);
    }

    // ✅ 7. TELEGRAM BOX
    let tgBoxY = infoBoxY + 280;
    if (tgBoxY + 100 > 1740) {
        tgBoxY = 1630;
    }

    drawRoundedRect(50, tgBoxY, 980, 100, 30);
    ctx.fillStyle    = '#0088cc';
    ctx.fill();
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 48px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('📲 JOIN TELEGRAM: @studygyaan_official', width / 2, tgBoxY + 50);

    // ✅ 8. FOOTER
    ctx.fillStyle    = '#FFCC00';
    ctx.fillRect(0, 1750, width, 170);
    ctx.fillStyle    = '#000000';
    ctx.font         = '900 52px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('👇 DIRECT LINK - FIRST COMMENT में 👇', width / 2, 1835);

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
    const ffmpegPath   = require('ffmpeg-static');

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
        const isFemale          = selectedVideoFile.toLowerCase().includes('female');
        const isMale            = selectedVideoFile.toLowerCase().includes('male');

        let selectedVoice;
        if (isFemale)    selectedVoice = 'hi-IN-Neural2-A';
        else if (isMale) selectedVoice = 'hi-IN-Neural2-C';
        else             selectedVoice = Math.random() > 0.5 ? 'hi-IN-Neural2-A' : 'hi-IN-Neural2-C';

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

        const script = scriptArray[Math.floor(Math.random() * scriptArray.length)];
        console.log(`🎙️ Script: ${script.substring(0, 80)}...`);

        const [ttsResponse] = await ttsClient.synthesizeSpeech({
            input:       { text: script },
            voice:       { languageCode: 'hi-IN', name: selectedVoice },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 1.08, pitch: 1.0 }
        });
        fs.writeFileSync(audioPath, ttsResponse.audioContent, 'binary');
        console.log('✅ Audio तैयार हो गया!');

        const safeAnchorY = await createPoster(jobData, jobCat, posterPath);
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

        // ✅ SEO Data Generate - BOTH TYPES के लिए full data
        const seoData    = generateSEO(jobData, jobCat);
        const finalTitle = generateViralTitle(jobData, jobCat);

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
                    privacyStatus:           'public',
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

        // ✅ Facebook Upload
        await uploadToFacebook(videoPath, seoData.description);

        // ✅ Telegram Notification
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
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
            } catch (tgErr) {
                console.log('⚠️ Telegram error:', tgErr.message);
            }
        } else {
            console.log('⚠️ Telegram credentials missing, skipping...');
        }

        // ✅ Auto First Comment
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

        // ✅ Firestore में video URL update करो
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
                    youtubeVideoId:  videoId,
                    youtubeVideoUrl: videoUrl,
                    videoCreatedAt:  admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ Firestore updated: ${collection}/${docId}`);
            } else {
                console.log('⚠️ docId नहीं मिला, Firestore skip किया।');
            }
        } catch (dbErr) {
            console.log('⚠️ Firestore update error:', dbErr.message);
        }

        console.log(`\n${'='.repeat(50)}`);
        console.log(`🎉 सब कुछ हो गया!`);
        console.log(`📺 YouTube   : ${videoUrl}`);
        console.log(`🌐 Website   : ${seoData.postLink}`);
        console.log(`📂 Type      : ${jobData.type}`);
        console.log(`🏷️  Category  : ${jobCat}`);
        console.log(`🔖 Tags Count: ${seoData.tags.length}`);
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
            } catch (e) {
                // ignore cleanup errors
            }
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

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
const V = require('./video_state');
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
// 🅰️ 0.1. HINDI FONT DOWNLOADER
// =========================================================
async function setupHindiFont() {
    const fontPath = path.join(os.tmpdir(), 'HindiFont-Bold.ttf');
    if (!fs.existsSync(fontPath)) {
        console.log('⬇️ Hindi Font download हो रहा है...');
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
        console.log('✅ Font ready!');
    }
    registerFont(fontPath, { family: 'HindiFont' });
}

// =========================================================
// 🔐 1. YOUTUBE AUTH - ✅ UPDATED (SELF_TEST CHANNEL)
// =========================================================
async function getYouTubeClient() {
    const credentialsVar = process.env.GMAIL_CREDENTIALS;
    const tokenVar = process.env.YOUTUBE_TOKEN_SELF_TEST; // ✅ CHANGED

    if (!credentialsVar || !tokenVar) {
        throw new Error("❌ GMAIL_CREDENTIALS या YOUTUBE_TOKEN_SELF_TEST नहीं मिला!");
    }

    const creds = JSON.parse(credentialsVar);
    const token = JSON.parse(tokenVar);
    const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });

    // ✅ Verify - confirm karega sahi channel hai
    try {
        const me = await youtube.channels.list({
            part: 'snippet',
            mine: true
        });
        const channel = me.data.items?.[0];
        if (channel) {
            console.log(`📺 Upload Channel: ${channel.snippet.title} | ID: ${channel.id}`);
        } else {
            throw new Error("❌ Koi YouTube channel nahi mila is token se!");
        }
    } catch (verifyErr) {
        throw new Error(`❌ YouTube Auth fail: ${verifyErr.message}`);
    }

    return youtube;
}

// =========================================================
// 📱 2. FACEBOOK UPLOAD
// =========================================================
async function uploadToFacebook(videoPath, description) {
    const FB_PAGE_ID = process.env.FB_PAGE_ID;
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
    if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
        return console.log('⚠️ Facebook skip।');
    }
    console.log('📱 Facebook upload शुरू...');
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
        console.log('✅ Facebook live! ID: ' + fbRes.data.id);
    } catch (fbErr) {
        console.error('❌ Facebook fail:', fbErr.response ? fbErr.response.data : fbErr.message);
    }
}

// =========================================================
// 🧠 3. TEXT CLEANER
// =========================================================
function cleanText(str) {
    if (!str) return "";
    return String(str).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

// =========================================================
// 🏷️ 4. DYNAMIC SEO ENGINE
// =========================================================
const SUBJECT_KEYWORDS = {
    'GK': [
        'GK Questions Hindi', 'General Knowledge 2025', 'GK Quiz',
        'Samanya Gyan', 'GK Mock Test', 'General Knowledge Quiz',
        'GK Practice Set', 'GK Important Questions', 'Static GK',
        'GK Questions Answers', 'Daily GK Quiz', 'GK for SSC',
        'GK for Railway', 'GK for Police Exam', 'GK for UPSC'
    ],
    'General Knowledge': [
        'GK Questions Hindi', 'General Knowledge 2025', 'Samanya Gyan Quiz',
        'GK Mock Test Series', 'Important GK Questions', 'GK Practice Set',
        'GK for Competitive Exam', 'GK Hindi Medium', 'Top GK Questions'
    ],
    'Math': [
        'Math Mock Test', 'Mathematics Questions Hindi', 'Maths Tricks Hindi',
        'Quantitative Aptitude', 'Math Practice Set', 'SSC Math Questions',
        'Railway Math Mock Test', 'Math Short Tricks', 'Arithmetic Questions',
        'Number System', 'Percentage Questions', 'Profit Loss Questions',
        'Time Speed Distance', 'Simple Interest Questions', 'Algebra Hindi'
    ],
    'Mathematics': [
        'Mathematics Mock Test', 'Math Questions Hindi', 'Quantitative Aptitude',
        'Maths Practice Set', 'SSC Maths Tricks', 'Railway Maths Questions',
        'Math Short Tricks Hindi', 'Important Math Questions'
    ],
    'Science': [
        'General Science Mock Test', 'Science Questions Hindi', 'Science GK Quiz',
        'Physics Questions Hindi', 'Chemistry Questions Hindi', 'Biology Questions',
        'Science Practice Set', 'Science for Railway', 'Science for SSC',
        'General Science 2025', 'Science Important Questions', 'Science MCQ Hindi',
        'NCERT Science Questions', 'Basic Science Quiz', 'Science GK Hindi'
    ],
    'General Science': [
        'General Science Questions', 'Science Mock Test Hindi', 'Science GK 2025',
        'Science MCQ Practice', 'Science for Competitive Exam', 'Important Science Questions'
    ],
    'English': [
        'English Grammar Questions', 'English Mock Test', 'English Practice Set',
        'Vocabulary Questions', 'Synonyms Antonyms', 'English for SSC',
        'English for Railway', 'Fill in the Blanks', 'Error Detection',
        'Reading Comprehension', 'English MCQ', 'Spotting Errors',
        'One Word Substitution', 'Idioms Phrases', 'English Grammar Rules'
    ],
    'Hindi': [
        'Hindi Grammar Questions', 'Hindi Mock Test', 'Hindi Vyakaran',
        'Sandhi Viched', 'Samas Questions', 'Hindi Sahitya',
        'Hindi Practice Set', 'Hindi for SSC', 'Hindi for Railway',
        'Muhavare Lokoktiyan', 'Hindi Vocabulary', 'Hindi Grammar Rules'
    ],
    'Reasoning': [
        'Reasoning Mock Test', 'Logical Reasoning Questions', 'Reasoning Hindi',
        'Non Verbal Reasoning', 'Verbal Reasoning', 'Reasoning Practice Set',
        'Coding Decoding', 'Blood Relations', 'Direction Questions',
        'Series Questions', 'Analogy Questions', 'Syllogism Questions',
        'Reasoning for SSC', 'Reasoning for Railway', 'Mental Ability Questions'
    ],
    'Current Affairs': [
        'Current Affairs 2025', 'Current Affairs Hindi', 'Monthly Current Affairs',
        'Daily Current Affairs Quiz', 'Current Affairs Mock Test',
        'GK Current Affairs 2025', 'Latest Current Affairs', 'Important Events 2025'
    ],
    'History': [
        'History Questions Hindi', 'Indian History Mock Test', 'History GK Quiz',
        'Ancient History Questions', 'Medieval History Questions', 'Modern History',
        'History Practice Set', 'Itihas Questions Hindi', 'History for UPSC',
        'History for SSC', 'Important Historical Events', 'History MCQ Hindi'
    ],
    'Geography': [
        'Geography Questions Hindi', 'Geography Mock Test', 'Bhugol Questions',
        'Indian Geography Quiz', 'World Geography Questions', 'Geography GK',
        'Geography Practice Set', 'Physical Geography', 'Geography for UPSC',
        'Geography for SSC', 'Important Geography Questions'
    ],
    'Computer': [
        'Computer Questions Hindi', 'Computer Mock Test', 'Computer GK Quiz',
        'Basic Computer Questions', 'MS Office Questions', 'Internet Questions',
        'Computer Awareness', 'Computer for Bank Exam', 'Computer Practice Set',
        'Computer Fundamental Questions', 'Operating System Questions'
    ],
    'Economy': [
        'Economy Questions Hindi', 'Economics Mock Test', 'Indian Economy GK',
        'Economics Practice Set', 'Budget Questions', 'Finance Questions Hindi',
        'Economy for UPSC', 'Economy for SSC', 'Banking Economy Questions'
    ],
    'Polity': [
        'Indian Polity Questions', 'Constitution Questions Hindi', 'Polity Mock Test',
        'Fundamental Rights Questions', 'Parliament Questions',
        'Polity Practice Set', 'Polity for UPSC', 'Polity for SSC',
        'Constitution of India Quiz', 'Preamble Questions', 'Directive Principles'
    ],
    'Default': [
        'Mock Test Hindi', 'Practice Set 2025', 'Online Mock Test Free',
        'MCQ Questions Hindi', 'Objective Questions', 'Quiz Competition',
        'Exam Practice Questions', 'Top Questions 2025', 'Important MCQ'
    ]
};

const EXAM_TAGS = [
    'SSC CGL 2025', 'SSC CHSL 2025', 'SSC MTS 2025', 'SSC GD 2025',
    'RRB NTPC 2025', 'Railway Group D', 'RRB ALP 2025',
    'Bank PO 2025', 'IBPS PO 2025', 'SBI PO 2025',
    'UP Police 2025', 'Delhi Police', 'Police Constable 2025',
    'UPSC 2025', 'State PSC 2025', 'Sarkari Naukri 2025',
    'Government Jobs 2025', 'Competitive Exam 2025', 'Exam Preparation Hindi'
];

const BASE_MOCK_TAGS = [
    'Mock Test', 'Practice Set', 'Online Test Series', 'Free Mock Test',
    'MCQ with Answers', 'Quiz with Timer', 'StudyGyaan', 'Free Study Material',
    'Exam Tips Hindi', 'Study Material 2025', 'Important Questions',
    'Previous Year Paper', 'Expected Questions 2025'
];

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

function getSubjectKey(subject) {
    const s = subject.toLowerCase();
    if (s.includes('gk') || s.includes('general know')) return 'GK';
    if (s.includes('math')) return 'Math';
    if (s.includes('science') || s.includes('vigyan')) return 'Science';
    if (s.includes('english')) return 'English';
    if (s.includes('hindi')) return 'Hindi';
    if (s.includes('reason')) return 'Reasoning';
    if (s.includes('current')) return 'Current Affairs';
    if (s.includes('history') || s.includes('itihas')) return 'History';
    if (s.includes('geo') || s.includes('bhugol')) return 'Geography';
    if (s.includes('computer')) return 'Computer';
    if (s.includes('economy') || s.includes('economic')) return 'Economy';
    if (s.includes('polity') || s.includes('constitution')) return 'Polity';
    return 'Default';
}

function generateMockTestSEO(subject, title, totalQuestions) {
    const subjectKey = getSubjectKey(subject);
    const subjectKeywords = SUBJECT_KEYWORDS[subjectKey] || SUBJECT_KEYWORDS['Default'];

    const now = new Date();
    const year = now.getFullYear();
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[now.getMonth()];

    const subjectClean = subject.replace(/[^\x20-\x7E]/g, '').trim() || 'GK';

    const timeTags = [
        `${subjectClean} Mock Test ${year}`,
        `${subjectClean} Questions ${month} ${year}`,
        `${subjectClean} Practice Set ${year}`,
        `Top ${totalQuestions} ${subjectClean} Questions`,
        `${subjectClean} Quiz ${year}`
    ];

    const allTagSources = [
        `${subjectClean} Mock Test`,
        `${totalQuestions} Questions ${subjectClean}`,
        ...timeTags,
        ...subjectKeywords,
        ...EXAM_TAGS,
        ...BASE_MOCK_TAGS
    ];

    const seen = new Set();
    let finalTags = [];
    let totalTagLength = 0;

    for (let rawTag of allTagSources) {
        const clean = sanitizeTag(rawTag);
        if (!clean) continue;
        if (seen.has(clean.toLowerCase())) continue;
        if (totalTagLength + clean.length + 2 > 495) break;
        seen.add(clean.toLowerCase());
        finalTags.push(clean);
        totalTagLength += clean.length + 2;
    }

    console.log(`✅ SEO: ${finalTags.length} tags | Total chars: ${totalTagLength} | Subject: ${subjectKey}`);
    return finalTags;
}

function generateMockTitle(subject, totalQuestions) {
    const now = new Date();
    const year = now.getFullYear();

    const subjectClean = subject.replace(/[^\x20-\x7E]/g, '').trim() || subject;
    const subjectUpper = subjectClean.toUpperCase();

    const safeHooks = [
        `Top ${totalQuestions} ${subjectUpper} Questions`,
        `${subjectUpper} Mock Test ${totalQuestions} QandA`,
        `${totalQuestions} Important ${subjectUpper} Questions`,
        `${subjectUpper} Practice Set ${totalQuestions} Questions`,
        `${subjectUpper} Quiz ${year} Top ${totalQuestions} MCQ`
    ];

    const suffixes = [
        `With Timer and Answers StudyGyaan`,
        `Bilingual Hindi English StudyGyaan`,
        `Free Mock Test ${year} StudyGyaan`,
        `With Explanation StudyGyaan.in`
    ];

    const hook = safeHooks[Math.floor(Math.random() * safeHooks.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

    let finalTitle = `${hook} | ${suffix}`;
    if (finalTitle.length > 100) finalTitle = `${hook} | StudyGyaan ${year}`;
    if (finalTitle.length > 100) finalTitle = finalTitle.substring(0, 97) + '...';

    return finalTitle;
}

function generateMockDescription(subject, totalQuestions, ytTitle, tags) {
    const now = new Date();
    const year = now.getFullYear();
    const subjectUpper = subject.toUpperCase();

    const topTagsStr = tags.slice(0, 15).join(' | ');
    const hashtagStr = tags.slice(0, 8)
        .map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, ''))
        .filter(h => h.length > 1)
        .join(' ');

    return `${ytTitle}

Free Online Mock Test aur Free PDF Download karein:
Website: https://studygyaan.in

Is Video mein kya hai:
- ${subjectUpper} ke Top ${totalQuestions} Important Questions
- Har Question par 5 Second Timer
- Bilingual Hindi aur English Format
- Sahi Jawab aur Explanation ke saath
- Timer ke saath Practice karein

Yeh Mock Test kiske liye hai:
SSC CGL, CHSL, MTS, GD ${year}
RRB NTPC, Group D, ALP ${year}
Bank PO, Clerk, IBPS ${year}
UP Police, Delhi Police ${year}
UPSC, State PSC ${year}
Sabhi Competitive Exams ${year}

Daily Updates ke liye:
Website: https://studygyaan.in
Free PDF aur Mock Test Available

SUBSCRIBE karein aur Bell Icon dabaein!

VIDEO CHAPTERS:
00:00 - Introduction
00:30 - Questions Start

KEYWORDS: ${topTagsStr}

${hashtagStr} #MockTest #StudyGyaan #${subjectUpper.replace(/\s+/g, '')} #ExamPrep #${year}

DISCLAIMER: Yeh channel purely educational purposes ke liye hai.`;
}

function generateMockPinnedComment(subject, totalQuestions) {
    const templates = [
        `Free ${subject} Mock Test PDF:\n👉 https://studygyaan.in\n\nMore Mock Tests + Previous Year Papers free mein available hain!\n\nScore kitna aaya? Comment mein bataen!\n\nSUBSCRIBE karein & Bell dabaein!`,
        `${subject} ke aur Practice Sets free mein:\nhttps://studygyaan.in\n\nTop ${totalQuestions} Questions ki PDF website par available hai!\n\nKoi Question doubt hai? Comment karein!\n\nTip: Roz ek Mock Test zaroor dein!`,
        `More ${subject} Mock Tests free mein:\nhttps://studygyaan.in\n\nDaily Updates ke liye visit karein: studygyaan.in\n\nScore Comment mein bataen!\nLike karein agar Helpful laga!`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
}

// =========================================================
// 🖼️ 5. ATTRACTIVE THUMBNAIL GENERATOR
// =========================================================
function createAttractiveThumbnail(subject, totalQuestions, outputPath) {
    const width = 1280, height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#1a0533');
    grad.addColorStop(0.5, '#2d1b69');
    grad.addColorStop(1, '#11998e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, 12, height);

    ctx.beginPath();
    ctx.arc(280, 360, 220, 0, 2 * Math.PI);
    ctx.fillStyle = '#FF4500';
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#FFD700';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 220px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 15;
    ctx.fillText(`${totalQuestions}`, 280, 340);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText('Questions', 280, 520);

    ctx.fillStyle = '#FFD700';
    ctx.font = `bold 100px "HindiFont", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const subjectDisplay = subject.length > 12 ? subject.substring(0, 12) : subject;
    ctx.fillText(subjectDisplay.toUpperCase(), 540, 80);

    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.roundRect(530, 210, 680, 110, 20);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 75px "HindiFont", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MOCK TEST', 870, 220);

    ctx.fillStyle = '#00C853';
    ctx.beginPath();
    ctx.roundRect(530, 350, 330, 85, 42);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('With Timer', 695, 355);

    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.roundRect(880, 350, 220, 85, 42);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 55px sans-serif';
    ctx.fillText('FREE', 990, 355);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SSC | Railway | Bank | Police | UPSC', 535, 470);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 620, width, 100);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 52px "HindiFont", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('StudyGyaan.in | Free Mock Tests + PDF Notes', width / 2, 630);

    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

// =========================================================
// 🖼️ 5.1 INTRO SLIDE GENERATOR
// =========================================================
function createIntroSlide(subject, totalQuestions, outputPath) {
    const width = 1920, height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(0.5, '#203a43');
    grad.addColorStop(1, '#2c5364');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.roundRect(width / 2 - 400, 50, 800, 100, 50);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 55px "HindiFont", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STUDYGYAAN.IN', width / 2, 100);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 120px "HindiFont", sans-serif';
    ctx.fillText(`${subject.toUpperCase()}`, width / 2, 350);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 80px "HindiFont", sans-serif';
    ctx.fillText(`MOCK TEST`, width / 2, 500);

    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 70px "HindiFont", sans-serif';
    ctx.fillText(`Top ${totalQuestions} Important Questions`, width / 2, 650);

    ctx.fillStyle = '#FF4500';
    ctx.font = 'bold 60px "HindiFont", sans-serif';
    ctx.fillText(`Timer ke saath Practice karein`, width / 2, 780);

    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 920, width, 160);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 65px "HindiFont", sans-serif';
    ctx.fillText(`FREE PDF + MORE TESTS: StudyGyaan.in`, width / 2, 1000);

    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

// =========================================================
// 🖼️ 5.2 OUTRO SLIDE GENERATOR
// =========================================================
function createOutroSlide(outputPath) {
    const width = 1920, height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(1, '#2c5364');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 80px "HindiFont", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Thanks For Watching!`, width / 2, 300);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px "HindiFont", sans-serif';
    ctx.fillText(`Score Comment mein bataen!`, width / 2, 450);
    ctx.fillText(`Like, Share aur Subscribe karein`, width / 2, 560);

    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 65px "HindiFont", sans-serif';
    ctx.fillText(`Free Mock Tests + PDF Notes:`, width / 2, 700);

    ctx.fillStyle = '#FF4500';
    ctx.font = 'bold 80px "HindiFont", sans-serif';
    ctx.fillText(`StudyGyaan.in`, width / 2, 830);

    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

// =========================================================
// 🖼️ 5.3 MOCK TEST SLIDE GENERATOR
// =========================================================
function createMockSlide(questionObj, qNumber, totalQuestions, mode, subject, outputPath, timerNumber = null) {
    const width = 1920, height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(0.5, '#203a43');
    grad.addColorStop(1, '#2c5364');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 0, width, 100);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 50px "HindiFont", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${subject.toUpperCase()} MOCK TEST | StudyGyaan.in`, width / 2, 50);

    ctx.fillStyle = '#FF4500';
    ctx.fillRect(50, 150, 350, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "HindiFont", sans-serif';
    ctx.fillText(`Question ${qNumber} / ${totalQuestions}`, 225, 190);

    let totalChars = (
        questionObj.qEn + questionObj.qHi +
        questionObj.optA_En + questionObj.optA_Hi +
        questionObj.optB_En + questionObj.optB_Hi +
        questionObj.optC_En + questionObj.optC_Hi +
        questionObj.optD_En + questionObj.optD_Hi
    ).length;

    let qFont = 55, optFont = 45, blockGap = 60, lineGap = 15;
    if (totalChars > 350) { qFont = 45; optFont = 38; blockGap = 40; lineGap = 10; }
    if (totalChars > 600) { qFont = 38; optFont = 32; blockGap = 30; lineGap = 8; }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    function drawTextBlock(context, text, x, startY, maxWidth, lineHeight, color) {
        context.fillStyle = color;
        let words = text.split(' ');
        let line = '';
        let currentY = startY;
        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            if (context.measureText(testLine).width > maxWidth && n > 0) {
                context.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        context.fillText(line, x, currentY);
        return currentY + lineHeight;
    }

    let currentY = 270;

    ctx.font = `bold ${qFont}px "HindiFont", sans-serif`;
    if (questionObj.qEn === questionObj.qHi || !questionObj.qEn) {
        currentY = drawTextBlock(ctx, `Q. ${questionObj.qHi || questionObj.qEn}`, 80, currentY, 1750, qFont + lineGap, '#ffffff') + blockGap;
    } else {
        currentY = drawTextBlock(ctx, `Q. ${questionObj.qEn}`, 80, currentY, 1750, qFont + lineGap, '#ffffff') + 10;
        currentY = drawTextBlock(ctx, `${questionObj.qHi}`, 80, currentY, 1750, qFont + lineGap, '#00FFFF') + blockGap;
    }

    const options = [
        { label: 'A', textEn: questionObj.optA_En, textHi: questionObj.optA_Hi },
        { label: 'B', textEn: questionObj.optB_En, textHi: questionObj.optB_Hi },
        { label: 'C', textEn: questionObj.optC_En, textHi: questionObj.optC_Hi },
        { label: 'D', textEn: questionObj.optD_En, textHi: questionObj.optD_Hi }
    ];

    ctx.font = `bold ${optFont}px "HindiFont", sans-serif`;

    options.forEach(opt => {
        let optText = (opt.textEn === opt.textHi || !opt.textEn)
            ? `${opt.label}) ${opt.textHi || opt.textEn}`
            : `${opt.label}) ${opt.textEn}  |  ${opt.textHi}`;

        let startBoxY = currentY - 10;
        let words = optText.split(' ');
        let tempLine = '', linesCount = 1;
        for (let n = 0; n < words.length; n++) {
            let testLine = tempLine + words[n] + ' ';
            if (ctx.measureText(testLine).width > 1680 && n > 0) {
                linesCount++;
                tempLine = words[n] + ' ';
            } else { tempLine = testLine; }
        }
        let boxHeight = (linesCount * (optFont + lineGap)) + 15;

        if (mode === 'answer' && opt.label === questionObj.correct) {
            ctx.fillStyle = '#28a745';
            ctx.fillRect(70, startBoxY, 1780, boxHeight);
        }

        currentY = drawTextBlock(ctx, optText, 100, currentY, 1680, optFont + lineGap, '#ffffff') + 30;
    });

    if (mode === 'timer' && timerNumber !== null) {
        ctx.beginPath();
        ctx.arc(1600, 200, 90, 0, 2 * Math.PI, false);
        ctx.fillStyle = timerNumber <= 2 ? '#FF0000' : '#ffcc00';
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 100px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${timerNumber}`, 1600, 200);
    }

    if (mode === 'answer') {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 50px "HindiFont", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Correct Answer: Option ${questionObj.correct}`, width / 2, 1060);
    }

    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

// =========================================================
// 🗣️ 6. TTS ENGINE
// =========================================================
async function generateAudio(text, outputPath, ttsClient) {
    const [response] = await ttsClient.synthesizeSpeech({
        input: { text: text },
        voice: { languageCode: 'hi-IN', name: 'hi-IN-Neural2-B' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
    });
    fs.writeFileSync(outputPath, response.audioContent, 'binary');
}

// =========================================================
// 🎬 7. FFMPEG CLIP RENDERER
// =========================================================
async function renderClip(imagePath, audioPath, outputPath, isSilentTimer = false, duration = 1) {
    let args = [];
    if (isSilentTimer) {
        args = [
            '-y', '-loop', '1', '-i', imagePath,
            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
            '-pix_fmt', 'yuv420p', '-s', '1920x1080', '-r', '30',
            '-t', `${duration}`, outputPath
        ];
    } else {
        args = [
            '-y', '-loop', '1', '-i', imagePath, '-i', audioPath,
            '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
            '-pix_fmt', 'yuv420p', '-s', '1920x1080', '-r', '30',
            '-shortest', outputPath
        ];
    }

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, args, { stdio: 'ignore' });
        ffmpeg.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg Clip Error: Code ${code}`));
        });
    });
}

// =========================================================
// 🚀 8. YOUTUBE UPLOAD WITH RETRY
// =========================================================
async function uploadToYouTube(youtube, finalVideoPath, ytTitle, seoDescription, seoTags, privacyStatus) {
    const maxRetries = 3;
    let currentTags = [...seoTags];
    const finalPrivacy = privacyStatus || process.env.VIDEO_PRIVACY_STATUS || 'public';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🚀 YouTube upload attempt ${attempt}/${maxRetries}...`);

            const validatedTags = currentTags.filter(tag => {
                if (!tag || typeof tag !== 'string') return false;
                if (tag.length < 2 || tag.length > 100) return false;
                if (!/^[\x20-\x7E]+$/.test(tag)) return false;
                return true;
            });

            console.log(`📊 Validated tags count: ${validatedTags.length}`);

            const res = await youtube.videos.insert({
                part: 'snippet,status',
                requestBody: {
                    snippet: {
                        title: ytTitle,
                        description: seoDescription,
                        tags: validatedTags,
                        categoryId: '27',
                        defaultLanguage: 'hi',
                        defaultAudioLanguage: 'hi'
                    },
                    status: {
                        privacyStatus: finalPrivacy,
                        selfDeclaredMadeForKids: false,
                        madeForKids: false
                    }
                },
                media: { body: fs.createReadStream(finalVideoPath) }
            });

            console.log('✅ YouTube Live! https://youtu.be/' + res.data.id);
            return res.data.id;

        } catch (err) {
            console.error(`❌ Attempt ${attempt} failed:`, err.message);

            if (
                err.message.includes('invalid video keywords') ||
                err.message.includes('keywords') ||
                err.message.includes('tags')
            ) {
                console.log('🔄 Tags error - tags remove karke retry...');
                currentTags = [];
                continue;
            }

            if (attempt === maxRetries) {
                throw new Error(`YouTube upload failed after ${maxRetries} attempts: ${err.message}`);
            }

            const waitSec = 5 * attempt;
            console.log(`⏳ ${waitSec} seconds wait...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
        }
    }
}

// =========================================================
// 🚀 9. MAIN MOCK TEST VIDEO ENGINE
// =========================================================
/**
 * Render + upload one mock test video.
 *
 * @param {object} [options]
 *        options.docRef        Firestore DocumentReference chosen by the dispatcher.
 *        options.docId         document id (when docRef is supplied).
 *        options.docData       already-read document data (avoids a second read).
 *        options.managedState  true when video_dispatcher.js owns videoStatus bookkeeping.
 *        options.privacyStatus YouTube privacy override ('unlisted' for safe tests).
 * @returns {Promise<{success:boolean, videoId?:string, videoUrl?:string, error?:string, uploadFailed?:boolean, skipped?:boolean}>}
 */
async function generateMockTestVideo(options = {}) {
    console.log("🎬 Mock Test Video Engine Started...");
    const tempDir = os.tmpdir();
    let renderCompleted = false;
    let targetRef = options.docRef || null;

    try {
        await setupHindiFont();

        let mockData;

        if (targetRef && options.docData) {
            mockData = { ...options.docData, id: options.docId || targetRef.id };
        } else if (targetRef) {
            const snap = await targetRef.get();
            if (!snap.exists) throw new Error(`❌ mock_tests/${targetRef.id} नहीं मिला!`);
            mockData = { ...snap.data(), id: snap.id };
        } else {
            // Standalone mode (mock_test_maker.yml / manual run):
            // pick the first document that the shared state machine considers pending.
            const snapshot = await db.collection('mock_tests').limit(300).get();
            if (snapshot.empty) {
                console.log("ℹ️ mock_tests collection खाली है — कुछ करने को नहीं।");
                return { success: true, skipped: true };
            }

            let targetDoc = null;
            for (const doc of snapshot.docs) {
                const verdict = V.evaluateMockTest(doc.data() || {}, { maxAgeDays: 0 });
                if (verdict.eligible) { targetDoc = doc; break; }
            }

            if (!targetDoc) {
                console.log("✅ सभी eligible Mock Tests के Videos बन चुके हैं (या permanently failed हैं)।");
                return { success: true, skipped: true };
            }

            targetRef = targetDoc.ref;
            mockData = { ...targetDoc.data(), id: targetDoc.id };

            // Claim it so a parallel dispatcher run can never duplicate the video.
            const claim = await V.claim(db, admin, V.KIND.MOCK_TEST, targetRef, {
                runId: process.env.GITHUB_RUN_ID ? `mock-${process.env.GITHUB_RUN_ID}` : `mock-${Date.now()}`,
                worker: 'mock-test-workflow',
                maxAgeDays: 0
            });
            if (!claim.claimed) {
                console.log(`⏭️ ${targetRef.id} किसी और worker ने ले लिया — ${claim.reason}`);
                return { success: true, skipped: true };
            }
            console.log(`🔒 Claimed mock_tests/${targetRef.id} (attempt ${claim.attempts})`);
        }

        console.log(`📄 Mock Test doc: ${mockData.id}`);

        if (!mockData.questions || mockData.questions.length === 0) {
            throw new Error(`❌ इस Set में कोई Question नहीं है!`);
        }

        const totalQuestions = mockData.questions.length;
        const subject = mockData.subject || "General Knowledge";
        const title = mockData.title || `${subject} ${totalQuestions} Q&A Mock Test`;

        console.log(`📚 Subject: ${subject} | Questions: ${totalQuestions}`);

        const ttsKeyVar = process.env.TTS_KEY_JSON;
        if (!ttsKeyVar) throw new Error("❌ TTS_KEY_JSON नहीं मिला!");
        const ttsClient = new textToSpeech.TextToSpeechClient({ credentials: JSON.parse(ttsKeyVar) });

        const concatListPath = path.join(tempDir, `concat_${Date.now()}.txt`);
        let concatContent = "";
        let filesToClean = [concatListPath];

        // INTRO
        console.log('🎬 Intro slide बन रहा है...');
        const introImg = path.join(tempDir, `intro_img.png`);
        const introAud = path.join(tempDir, `intro_aud.mp3`);
        const introVid = path.join(tempDir, `intro_vid.mp4`);
        filesToClean.push(introImg, introAud, introVid);

        createIntroSlide(subject, totalQuestions, introImg);
        const introText = `Namaste! StudyGyaan dot in par aapka swagat hai. Aaj hum ${subject} ke ${totalQuestions} sabse mahatvapurn prashna dekhenge. Har prashna ke liye aapko 5 second ka samay milega. Taiyar hain? Chaliye shuru karte hain!`;
        await generateAudio(introText, introAud, ttsClient);
        await renderClip(introImg, introAud, introVid, false);
        concatContent += `file '${introVid}'\n`;

        // QUESTIONS LOOP
        for (let i = 0; i < totalQuestions; i++) {
            console.log(`⏳ Question ${i + 1}/${totalQuestions} बन रहा है...`);
            const rawQ = mockData.questions[i];

            let qTextSafe = rawQ.qText != null ? String(rawQ.qText).replace(/\n/g, ' / ') : "";
            let qParts = qTextSafe.split(/\s*\/\s*/);
            let qEn = cleanText(qParts[0]);
            let qHi = qParts.length > 1 ? cleanText(qParts[1]) : qEn;

            let opts = rawQ.options || [];
            let parsedOpts = [];
            let correctLabel = "A";

            let correctOptSafe = rawQ.correctOption != null
                ? String(rawQ.correctOption).replace(/\*\*/g, '').replace(/\n/g, ' / ').trim()
                : "";

            let cleanCorrectOpt = cleanText(correctOptSafe).toUpperCase().replace("OPTION ", "").trim();
            if (["A", "B", "C", "D"].includes(cleanCorrectOpt)) {
                correctLabel = cleanCorrectOpt;
            } else if (["0", "1", "2", "3"].includes(cleanCorrectOpt)) {
                correctLabel = String.fromCharCode(65 + parseInt(cleanCorrectOpt));
            }

            for (let j = 0; j < 4; j++) {
                let optStr = opts[j] != null ? String(opts[j]).replace(/\n/g, ' / ') : "";
                let oParts = optStr.split(/\s*\/\s*/);
                let oEn = cleanText(oParts[0]);
                let oHi = oParts.length > 1 ? cleanText(oParts[1]) : oEn;
                parsedOpts.push({ en: oEn, hi: oHi });

                if (!["A", "B", "C", "D", "0", "1", "2", "3"].includes(cleanCorrectOpt)) {
                    if (
                        cleanText(optStr).toUpperCase() === cleanCorrectOpt ||
                        cleanText(oParts[0]).toUpperCase() === cleanCorrectOpt
                    ) {
                        correctLabel = String.fromCharCode(65 + j);
                    }
                }
            }

            let correctIdx = correctLabel.charCodeAt(0) - 65;
            let correctTarget = parsedOpts[correctIdx];
            parsedOpts = parsedOpts
                .map(v => ({ v, s: Math.random() }))
                .sort((a, b) => a.s - b.s)
                .map(d => d.v);
            let newIdx = parsedOpts.indexOf(correctTarget);
            if (newIdx !== -1) correctLabel = String.fromCharCode(65 + newIdx);

            const q = {
                qEn, qHi,
                optA_En: parsedOpts[0]?.en || "", optA_Hi: parsedOpts[0]?.hi || "",
                optB_En: parsedOpts[1]?.en || "", optB_Hi: parsedOpts[1]?.hi || "",
                optC_En: parsedOpts[2]?.en || "", optC_Hi: parsedOpts[2]?.hi || "",
                optD_En: parsedOpts[3]?.en || "", optD_Hi: parsedOpts[3]?.hi || "",
                correct: correctLabel || "A"
            };

            const qImg = path.join(tempDir, `q_img_${i}.png`);
            const qAud = path.join(tempDir, `q_aud_${i}.mp3`);
            const qVid = path.join(tempDir, `q_vid_${i}.mp4`);
            const aImg = path.join(tempDir, `a_img_${i}.png`);
            const aAud = path.join(tempDir, `a_aud_${i}.mp3`);
            const aVid = path.join(tempDir, `a_vid_${i}.mp4`);
            filesToClean.push(qImg, qAud, qVid, aImg, aAud, aVid);

            createMockSlide(q, i + 1, totalQuestions, 'question', subject, qImg);
            createMockSlide(q, i + 1, totalQuestions, 'answer', subject, aImg);

            let spokenQuestion = (q.qEn === q.qHi || !q.qEn) ? q.qHi : `${q.qEn}. ${q.qHi}`;
            let oA = (q.optA_En === q.optA_Hi || !q.optA_En) ? q.optA_Hi : `${q.optA_En}, ya ${q.optA_Hi}`;
            let oB = (q.optB_En === q.optB_Hi || !q.optB_En) ? q.optB_Hi : `${q.optB_En}, ya ${q.optB_Hi}`;
            let oC = (q.optC_En === q.optC_Hi || !q.optC_En) ? q.optC_Hi : `${q.optC_En}, ya ${q.optC_Hi}`;
            let oD = (q.optD_En === q.optD_Hi || !q.optD_En) ? q.optD_Hi : `${q.optD_En}, ya ${q.optD_Hi}`;

            const qText = `Prashna ${i + 1}. ${spokenQuestion}. Option A: ${oA}. Option B: ${oB}. Option C: ${oC}. Option D: ${oD}. Aapka samay shuru.`;
            const aText = `Sahi jawab hai, Option ${q.correct}.`;

            await generateAudio(qText, qAud, ttsClient);
            await generateAudio(aText, aAud, ttsClient);

            await renderClip(qImg, qAud, qVid, false);
            concatContent += `file '${qVid}'\n`;

            for (let t = 5; t >= 1; t--) {
                const tImg = path.join(tempDir, `t_img_${i}_${t}.png`);
                const tVid = path.join(tempDir, `t_vid_${i}_${t}.mp4`);
                filesToClean.push(tImg, tVid);
                createMockSlide(q, i + 1, totalQuestions, 'timer', subject, tImg, t);
                await renderClip(tImg, null, tVid, true, 1);
                concatContent += `file '${tVid}'\n`;
            }

            await renderClip(aImg, aAud, aVid, false);
            concatContent += `file '${aVid}'\n`;

            const aWaitVid = path.join(tempDir, `a_wait_vid_${i}.mp4`);
            filesToClean.push(aWaitVid);
            await renderClip(aImg, null, aWaitVid, true, 2);
            concatContent += `file '${aWaitVid}'\n`;
        }

        // OUTRO
        console.log(`🎬 Outro बन रहा है...`);
        const outroImg = path.join(tempDir, `outro_img.png`);
        const outroAud = path.join(tempDir, `outro_aud.mp3`);
        const outroVid = path.join(tempDir, `outro_vid.mp4`);
        filesToClean.push(outroImg, outroAud, outroVid);

        createOutroSlide(outroImg);
        const outroText = `Video dekhne ke liye bahut bahut dhanyawad! Aapka score comment mein zaroor bataen. Aur adhik free mock tests aur PDF notes ke liye hamari website, StudyGyaan dot in, par zaroor visit karein. Channel Subscribe karein aur Bell Icon dabaen taaki koi bhi update miss na ho!`;
        await generateAudio(outroText, outroAud, ttsClient);
        await renderClip(outroImg, outroAud, outroVid, false);
        concatContent += `file '${outroVid}'\n`;

        fs.writeFileSync(concatListPath, concatContent);

        console.log(`🎬 Final Video concat हो रहा है...`);
        const finalVideoPath = path.join(tempDir, `final_mock_${Date.now()}.mp4`);
        filesToClean.push(finalVideoPath);

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, [
                '-y', '-f', 'concat', '-safe', '0',
                '-i', concatListPath, '-c', 'copy', finalVideoPath
            ], { stdio: 'ignore' });
            ffmpeg.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg Concat Error: ${code}`));
            });
        });

        console.log(`✅ Final Video ready!`);
        renderCompleted = true;

        const seoTags = generateMockTestSEO(subject, title, totalQuestions);
        const ytTitle = generateMockTitle(subject, totalQuestions);
        const seoDescription = generateMockDescription(subject, totalQuestions, ytTitle, seoTags);

        console.log(`📢 Title: ${ytTitle}`);
        console.log(`📊 Tags: ${seoTags.length} generated`);

        // YOUTUBE UPLOAD
        const youtube = await getYouTubeClient();
        let ytVideoId = "";
        let ytUploadError = null;

        try {
            ytVideoId = await uploadToYouTube(youtube, finalVideoPath, ytTitle, seoDescription, seoTags, options.privacyStatus);

            // THUMBNAIL
            const thumbPath = path.join(tempDir, `thumbnail_${Date.now()}.png`);
            filesToClean.push(thumbPath);
            try {
                createAttractiveThumbnail(subject, totalQuestions, thumbPath);
                await youtube.thumbnails.set({
                    videoId: ytVideoId,
                    media: { body: fs.createReadStream(thumbPath) }
                });
                console.log('🖼️ ✅ Thumbnail set!');
            } catch (thumbErr) {
                console.log('⚠️ Thumbnail error:', thumbErr.message);
            }

            // PLAYLIST
            try {
                const playlistTitle = `${subject} Mock Test Series ${new Date().getFullYear()}`;
                const playlistsRes = await youtube.playlists.list({
                    part: 'snippet', mine: true, maxResults: 50
                });
                let playlistId = null;
                const existing = (playlistsRes.data.items || []).find(
                    p => p.snippet.title.toLowerCase() === playlistTitle.toLowerCase()
                );

                if (existing) {
                    playlistId = existing.id;
                    console.log(`📂 Existing playlist: ${playlistTitle}`);
                } else {
                    const newPL = await youtube.playlists.insert({
                        part: 'snippet,status',
                        requestBody: {
                            snippet: {
                                title: playlistTitle,
                                description: `${subject} ke Important Mock Tests | Free Study Material | StudyGyaan.in`
                            },
                            status: { privacyStatus: 'public' }
                        }
                    });
                    playlistId = newPL.data.id;
                    console.log(`📂 New playlist created: ${playlistTitle}`);
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
                console.log('✅ Playlist mein add!');
            } catch (pErr) {
                console.log('⚠️ Playlist skip:', pErr.message);
            }

            // PINNED COMMENT
            console.log('⏳ 15 seconds wait for comment...');
            await new Promise(resolve => setTimeout(resolve, 15000));

            try {
                const pinnedComment = generateMockPinnedComment(subject, totalQuestions);
                const commentRes = await youtube.commentThreads.insert({
                    part: 'snippet',
                    requestBody: {
                        snippet: {
                            videoId: ytVideoId,
                            topLevelComment: {
                                snippet: { textOriginal: pinnedComment }
                            }
                        }
                    }
                });
                console.log('💬 ✅ Comment posted!');

                try {
                    await youtube.comments.setModerationStatus({
                        id: commentRes.data.snippet.topLevelComment.id,
                        moderationStatus: 'published'
                    });
                } catch (pinErr) {
                    // Pin fail is okay
                }
            } catch (cErr) {
                console.log('⚠️ Comment skip:', cErr.message);
            }

        } catch (ytErr) {
            // ❌ YouTube is the mandatory destination — record it, do not silently succeed.
            ytUploadError = ytErr;
            console.error('❌ YouTube upload failed:', ytErr.message);
        }

        // FACEBOOK (optional — never fails the run)
        await uploadToFacebook(finalVideoPath, seoDescription);

        // TELEGRAM
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            const tgMsg = `New Mock Test Live!\n\nSubject: ${subject}\nQuestions: ${totalQuestions}\nTitle: ${ytTitle}\n${ytVideoId ? `Watch: https://youtu.be/${ytVideoId}\n` : ''}\nTop Tags: ${seoTags.slice(0, 5).join(', ')}\n\nAuto-uploaded by StudyGyaan Bot!`;
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: tgMsg
            }).catch(() => console.log('⚠️ Telegram fail।'));
        }

        // CLEANUP (always, before we decide success/failure)
        filesToClean.forEach(f => {
            if (f && fs.existsSync(f)) {
                try { fs.unlinkSync(f); } catch (e) { /* ignore */ }
            }
        });

        const ref = targetRef || db.collection('mock_tests').doc(mockData.id);
        const videoUrl = ytVideoId ? `https://youtu.be/${ytVideoId}` : '';

        if (ytUploadError || !ytVideoId) {
            const error = ytUploadError || new Error('YouTube upload returned no video id');
            // Video rendered fine, upload did not → upload_failed (PART 18).
            if (!options.managedState) {
                await V.safeUpdate(db, admin, 'mock_tests', ref, (r) =>
                    V.markFailed(db, admin, 'mock_tests', r, error, { uploadFailed: true })
                );
            }
            console.error('❌ Mock Test: video बना लेकिन YouTube upload fail हुआ।');
            return { success: false, error: V.shortError(error), uploadFailed: true };
        }

        // FIREBASE UPDATE — legacy mockVideoMade flag + new status fields
        if (options.managedState) {
            console.log('💾 Firestore state handled by dispatcher (managedState) — engine skip.');
        } else {
            await V.safeUpdate(db, admin, 'mock_tests', ref, (r) =>
                V.markCompleted(db, admin, 'mock_tests', r, {
                    videoId: ytVideoId,
                    videoUrl,
                    extra: { mockVideoMade: true }
                })
            );
            console.log(`✅ Firebase updated!`);
        }

        console.log("✅ All done!");
        return { success: true, videoId: ytVideoId, videoUrl };

    } catch (error) {
        const uploadFailed = renderCompleted === true;
        console.error(`❌ Mock Test Engine Error (${uploadFailed ? 'upload stage' : 'render stage'}):`, error.message);

        if (!options.managedState && targetRef) {
            await V.safeUpdate(db, admin, 'mock_tests', targetRef, (r) =>
                V.markFailed(db, admin, 'mock_tests', r, error, { uploadFailed })
            );
        }

        return { success: false, error: V.shortError(error), uploadFailed };
    }
}

module.exports = { generateMockTestVideo };

// ============================================================================
// ✅ GitHub Actions Entry Point
// ============================================================================
if (require.main === module) {
    generateMockTestVideo()
        .then((result) => {
            if (result && result.success) {
                if (result.skipped) console.log("ℹ️ Nothing pending — Mock Test process finished.");
                else console.log("✅ Mock Test Process Complete!");
                process.exit(0);
            }
            console.error(`❌ Mock Test Failed: ${result && result.error ? result.error : 'unknown error'}`);
            process.exit(1);
        })
        .catch(err => {
            console.error("❌ Failed:", err.message);
            process.exit(1);
        });
}

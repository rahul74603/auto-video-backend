const fs = require('fs');
const axios = require('axios');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const textToSpeech = require('@google-cloud/text-to-speech');
const { createCanvas, registerFont } = require('canvas');
const { google } = require('googleapis');
const ffmpegPath = require('ffmpeg-static');
const admin = require("firebase-admin");
const FormData = require('form-data');
require("dotenv").config();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramUpdate(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('✅ टेलीग्राम पर मैसेज भेज दिया गया!');
    } catch (err) {
        console.error('❌ टेलीग्राम एरर:', err.message);
    }
}
// =========================================================
// 🔐 0. FIREBASE INITIALIZATION (GitHub Secrets से)
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

// =========================================================
// 🔐 1. YOUTUBE AUTHENTICATION (GitHub Secrets से)
// =========================================================
async function getYouTubeClient() {
    const credentialsVar = process.env.GMAIL_CREDENTIALS;
    const tokenVar = process.env.YOUTUBE_TOKEN;

    if (!credentialsVar || !tokenVar || tokenVar === "test" || tokenVar === "temp_key") {
        throw new Error("❌ GMAIL_CREDENTIALS या YOUTUBE_TOKEN सीक्रेट नहीं मिला या Dummy सेट है!");
    }

    let creds, token;
    try {
        creds = JSON.parse(credentialsVar);
        token = JSON.parse(tokenVar);
    } catch (e) {
        throw new Error("❌ YOUTUBE Secrets Invalid JSON format (शायद Dummy Text है). कृपया असली JSON डालें।");
    }

    const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    oAuth2Client.setCredentials(token);
    return google.youtube({ version: 'v3', auth: oAuth2Client });
}

// =========================================================
// 📱 FACEBOOK UPLOAD ENGINE (Reels & Video)
// =========================================================
async function uploadToFacebook(videoPath, description) {
    const FB_PAGE_ID = process.env.FB_PAGE_ID;
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

    if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
        console.log('⚠️ FB_PAGE_ID या TOKEN नहीं मिला, फेसबुक स्किप कर दिया।');
        return;
    }

    console.log('📱 फेसबुक और रील पर अपलोड शुरू...');
    const formData = new FormData();
    formData.append('access_token', FB_PAGE_TOKEN);
    formData.append('source', fs.createReadStream(videoPath));
    formData.append('description', description + "\n\n👉 Visit: https://studygyaan.in\n#govtjobs #study #exam");

    try {
        const fbRes = await axios.post(
            `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/videos`,
            formData,
            { headers: formData.getHeaders() }
        );
        console.log('✅ फेसबुक वीडियो/रील लाइव! ID: ' + fbRes.data.id);
    } catch (fbErr) {
        console.error('❌ फेसबुक अपलोड फेल:', fbErr.response ? fbErr.response.data : fbErr.message);
    }
}

// =========================================================
// 🧠 2. THE MAGIC SEO ENGINE (Heavy Tags & Post Link)
// =========================================================
function generateSEO(jobData, jobCat) {
    let titleWords = jobData.title.split(' ').filter(w => w.length > 2 && !['and', 'the', 'for', 'out', 'now'].includes(w.toLowerCase()));
    let mainOrg = titleWords.slice(0, 2).join(''); 
    
    let baseTags = [
        'SarkariResult2026', 'NewVacancy2026', 'StudyGyaan', 'StudyGyaan.in', 'GovtJobs2026', 
        'LatestUpdate', 'FreePDF', 'PremiumNotes', 'StudyMaterial',
        'SarkariNaukri', 'ExamPreparation', 'JobAlert'
    ];
    
    let catTag = jobCat !== 'Default' ? jobCat.replace(/\s+/g, '') : 'NewVacancy'; 
    let specificTag = mainOrg + catTag; 

    let allTags = [...new Set([specificTag, catTag, ...titleWords, ...baseTags])].slice(0, 25);
    let hashtags = allTags.slice(0, 5).map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, '')).join(' ');


    let postLink = "https://studygyaan.in";
    if (jobData.id) {
        postLink = jobData.type === 'JOB' ? `https://studygyaan.in/job/${jobData.id}` : `https://studygyaan.in/update/${jobData.id}`;
    }

    let description = `
🔥 ${jobData.title} ${jobCat} 2026 Latest Update

📌 Apply / Check Here:
🔗 ${postLink}

📚 Free PDF + Mock Test:
👉 https://studygyaan.in

🚀 Daily Govt Jobs + Notes:
👉 Visit StudyGyaan.in

🔔 Subscribe for fastest updates

🔥 Trending Keywords:
${allTags.join(', ')}

${hashtags}
`;
let videoCTA = "\n🎥 Watch full video on YouTube: StudyGyaan Official";
description += videoCTA;

    return { tags: allTags, description: description, postLink: postLink };
}

// =========================================================
// 🎬 3. MAIN VIDEO GENERATOR ENGINE
// =========================================================
async function generateAndUploadVideo(jobData) {
    console.log(`🎬 [Premium-Engine] '${jobData.title}' के लिए रेंडरिंग शुरू...`);
    
    const tempDir = os.tmpdir();
    const audioPath = path.join(tempDir, 'temp-audio.mp3');
    const posterPath = path.join(tempDir, 'temp-poster.png');
    const videoPath = path.join(tempDir, 'final-output.mp4');

    let jobCat = jobData.category || 'Default';

    try {
        const youtube = await getYouTubeClient();

        // --- Music & Avatar ---
        const bgMusicDir = path.join(__dirname, 'bg_music');
        let bgMusicPath = '';
        if (fs.existsSync(bgMusicDir)) {
            const mp3Files = fs.readdirSync(bgMusicDir).filter(f => f.toLowerCase().endsWith('.mp3'));
            if (mp3Files.length > 0) bgMusicPath = path.join(bgMusicDir, mp3Files[Math.floor(Math.random() * mp3Files.length)]);
        }

        const filesInFolder = fs.readdirSync(__dirname);
        const anchorFiles = filesInFolder.filter(file => file.toLowerCase().endsWith('.mp4'));
        if (anchorFiles.length === 0) {
    throw new Error("❌ No anchor videos found!");
}

let selectedVideoFile = anchorFiles[Math.floor(Math.random() * anchorFiles.length)];
        
        // फिक्स: सिर्फ 'female' कीवर्ड चेक होगा, नंबर्स नहीं।
        let isFemale = selectedVideoFile.toLowerCase().includes('female');
let isMale = selectedVideoFile.toLowerCase().includes('male');

let selectedVoice;

if (isFemale) {
    selectedVoice = 'hi-IN-Neural2-A';
} else if (isMale) {
    selectedVoice = 'hi-IN-Neural2-C';
} else {
    // fallback smart detection
    selectedVoice = Math.random() > 0.5 ? 'hi-IN-Neural2-A' : 'hi-IN-Neural2-C';
}
        const finalAnchorPath = path.join(__dirname, selectedVideoFile);

        console.log(`🎥 Selected Anchor: ${selectedVideoFile} | 🎵 Voice: ${selectedVoice}`);

        // --- Text to Speech (Secret से Credentials उठाना) ---
        const ttsKeyVar = process.env.TTS_KEY_JSON;
        if (!ttsKeyVar || ttsKeyVar === "test" || ttsKeyVar === "temp_key") throw new Error("❌ TTS_KEY_JSON सीक्रेट नहीं मिला या Dummy सेट है!");
        
        let ttsCreds;
        try {
            ttsCreds = JSON.parse(ttsKeyVar);
        } catch (e) {
            throw new Error("❌ TTS_KEY_JSON Invalid JSON format (शायद Dummy Text है). कृपया असली JSON डालें।");
        }
        
        const ttsClient = new textToSpeech.TextToSpeechClient({ 
            credentials: ttsCreds 
        });

        let hooks = [
    "रुको! ये अपडेट मिस मत करना!",
    "अगर तुम exam की तैयारी कर रहे हो तो ये जरूरी है!",
    "आज की सबसे बड़ी खबर!",
    "ये मौका बार-बार नहीं आता!"
];

let hook = hooks[Math.floor(Math.random() * hooks.length)];

let script = `${hook} ⚠️ ध्यान से सुनो! ${jobData.title} ${
    jobCat === 'Result' ? 'का रिजल्ट जारी हो चुका है' :
    jobCat === 'Admit Card' ? 'का एडमिट कार्ड आ गया है' :
    jobCat === 'Answer Key' ? 'की आंसर की जारी हो गई है' :
    'की नई भर्ती आ गई है'
}. पूरी जानकारी और डायरेक्ट लिंक के लिए अभी गूगल पर सर्च करें StudyGyaan.in`;

        const [response] = await ttsClient.synthesizeSpeech({
            input: { text: script },
            voice: { languageCode: 'hi-IN', name: selectedVoice },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 },
        });
        fs.writeFileSync(audioPath, response.audioContent, 'binary');

        // --- 🖼️ DYNAMIC THEME ENGINE ---
        console.log('🖼️ स्मार्ट ऑटो-पोस्टर डिज़ाइन हो रहा है...');
        const width = 1080, height = 1920;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const themes = {
            "Result": { bg1: '#0f2027', bg2: '#203a43', bg3: '#2c5364', accent: '#00FF00', textBadge: '🏆 RESULT DECLARED 🏆', badgeBg: '#28a745' },
            "Admit Card": { bg1: '#4b134f', bg2: '#c94b4b', bg3: '#ff0844', accent: '#FFD700', textBadge: '🎫 ADMIT CARD OUT 🎫', badgeBg: '#dc3545' },
            "Syllabus": { bg1: '#141e30', bg2: '#243b55', bg3: '#2c3e50', accent: '#00FFFF', textBadge: '📚 NEW SYLLABUS 📚', badgeBg: '#17a2b8' },
            "Answer Key": { bg1: '#232526', bg2: '#414345', bg3: '#4b6cb7', accent: '#FFA500', textBadge: '🔑 ANSWER KEY 🔑', badgeBg: '#fd7e14' },
            "Default": { bg1: '#0f0c29', bg2: '#302b63', bg3: '#24243e', accent: '#00FFFF', textBadge: '⚡ LATEST UPDATE ⚡', badgeBg: '#d32f2f' }
        };

        let activeTheme = themes[jobCat] || themes['Default'];

        function drawRoundedRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }

        let grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, activeTheme.bg1);
        grad.addColorStop(0.5, activeTheme.bg2);
        grad.addColorStop(1, activeTheme.bg3);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 20;
        drawRoundedRect(ctx, 160, 80, 760, 140, 70);
        ctx.fillStyle = activeTheme.accent; 
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0f0c29';
        ctx.font = 'bold 80px sans-serif'; 
        ctx.textAlign = 'center';
        ctx.fillText('STUDYGYAAN.IN', width / 2, 180);

        ctx.fillStyle = activeTheme.badgeBg; 
        ctx.fillRect(0, 260, width, 120);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 70px sans-serif';
        ctx.letterSpacing = "3px";
        ctx.fillText(activeTheme.textBadge, width / 2, 345);
        ctx.fillStyle = "#FFFF00";
ctx.font = 'bold 90px sans-serif';
ctx.fillText("🔥 IMPORTANT 🔥", width / 2, 450);
ctx.fillStyle = "#FF0000";
ctx.font = 'bold 60px sans-serif'; // Text thoda chota kiya taaki mix na ho
ctx.fillText("APPLY NOW", width / 2, 680); // 600 se niche shift kiya

        function wrapText(context, text, x, y, maxWidth, lineHeight) {
            let words = text.split(' '), line = '';
            for (let n = 0; n < words.length; n++) {
                let testLine = line + words[n] + ' ';
                if (context.measureText(testLine).width > maxWidth && n > 0) {
                    context.fillText(line, x, y);
                    line = words[n] + ' ';
                    y += lineHeight;
                } else { line = testLine; }
            }
            context.fillText(line, x, y);
            return y;
        }

        ctx.shadowColor = activeTheme.accent; 
        ctx.shadowBlur = 25;
        ctx.fillStyle = '#ffffff'; 
        ctx.font = '900 85px sans-serif'; 
        let titleEndY = wrapText(ctx, jobData.title.toUpperCase(), width / 2, 530, 950, 105);
        ctx.shadowBlur = 0; 

        let infoY = 1350; 
        let boxHeight = 320;
        
        drawRoundedRect(ctx, 60, infoY - 80, 960, boxHeight, 40);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; 
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = activeTheme.accent; 
        ctx.stroke();

        ctx.font = 'bold 65px sans-serif';
        
        let todayDate = new Date().toLocaleDateString('en-GB');
        
        if (jobCat === 'Result' || jobCat === 'Answer Key' || jobCat === 'Admit Card') {
            ctx.fillStyle = activeTheme.accent;
            ctx.fillText(`📌 Update: ${jobCat} Out!`, width / 2, infoY + 20);
            ctx.fillStyle = '#FF4500'; 
            let showDate = (jobData.updateDate && jobData.updateDate !== 'undefined') ? jobData.updateDate : todayDate;
            ctx.fillText(`📅 Date: ${showDate}`, width / 2, infoY + 140);
        } else {
            ctx.fillStyle = activeTheme.accent;
            let showStart = (jobData.startDate && jobData.startDate !== 'undefined') ? jobData.startDate : 'Apply Now';
            ctx.fillText(`🚀 Starts: ${showStart}`, width / 2, infoY + 20);
            ctx.fillStyle = '#FF4500'; 
            ctx.font = 'bold 75px sans-serif'; 
            let showLast = (jobData.lastDate && jobData.lastDate !== 'undefined') ? jobData.lastDate : 'Soon';
            ctx.fillText(`⏳ Last Date: ${showLast}`, width / 2, infoY + 140);
        }

        drawRoundedRect(ctx, 150, 1720, 780, 130, 65);
        ctx.fillStyle = activeTheme.accent;
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 70px sans-serif';
        ctx.fillText(`🔍 Check on studygyaan.in`, width / 2, 1810);

        fs.writeFileSync(posterPath, canvas.toBuffer('image/png'));

        // --- 🎬 VIDEO RENDERING (Optimized & Visible Progress) ---
        console.log('🎬 रेंडरिंग चालू है... (गिटहब लॉग्स में प्रोग्रेस देखें)');
        
        const filter = `[0:v]zoompan=z='min(zoom+0.0005,1.1)':d=1:s=1080x1920:fps=30[bg];` +
                       `[1:v]format=yuv420p,crop=iw:ih-80:0:0,colorkey=0x00FF00:0.3:0.1,scale=800:-1[anchor];` +
                       `[bg][anchor]overlay=(main_w-overlay_w)/2:780[outv];` +
                       `[2:a]volume=1.4[voice];[3:a]volume=0.10[bgm];[voice][bgm]amix=inputs=2:duration=first[a]`;

        const args = [
            '-y', '-loop', '1', '-i', posterPath,
            '-stream_loop', '-1', '-an', '-i', finalAnchorPath,
            '-i', audioPath,
            '-stream_loop', '-1', '-i', bgMusicPath,
            '-filter_complex', filter,
            '-map', '[outv]', '-map', '[a]',
            '-c:v', 'libx264', '-preset', 'superfast', '-crf', '28',
            '-c:a', 'aac', '-b:a', '128k', '-shortest', '-pix_fmt', 'yuv420p',
            videoPath
        ];

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, args);
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                if (output.includes('frame=')) {
                    process.stdout.write(`\r${output.split('\n')[0]}`);
                }
            });
            ffmpeg.on('close', (code) => {
                if (code === 0) { 
                    console.log('\n✅ रेंडरिंग पूरी हुई!'); 
                    resolve(); 
                } else { 
                    reject(new Error(`FFmpeg exited with code ${code}`)); 
                }
            });
        });

        // --- 🚀 YOUTUBE UPLOAD ---
        const seoData = generateSEO(jobData, jobCat); 
        
        let maxTitleLen = jobCat !== 'Default' ? 45 : 55;
        let cleanTitle = jobData.title.length > maxTitleLen ? jobData.title.substring(0, maxTitleLen) + "..." : jobData.title;
        let powerWords = ["🔥 Breaking", "🚨 Alert", "⚡ Latest", "💥 Big Update"];
let randomPower = powerWords[Math.floor(Math.random() * powerWords.length)];

let finalTitle = `${randomPower} ${cleanTitle.substring(0,40)} ${jobCat !== 'Default' ? jobCat + ' Out!' : 'New Vacancy'} 2026 #Shorts`;

        const res = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: { title: finalTitle, description: seoData.description, tags: seoData.tags },
                status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
            },
            media: { body: fs.createReadStream(videoPath) }
        });
        
        console.log('✅ यूट्यूब वीडियो लाइव! URL: https://youtu.be/' + res.data.id);
        await sendTelegramUpdate(`🚀 <b>New Video Live!</b>\n\n📌 ${finalTitle}\n🔗 <a href="https://youtu.be/${res.data.id}">Watch Here</a>\n\n✅ Uploaded on YouTube & Facebook.`);

        // --- 🚀 FACEBOOK & REELS (Call the function) ---
        await uploadToFacebook(videoPath, seoData.description);

           // --- 💬 AUTO COMMENT ---

        console.log('⏳ 10 सेकंड का इंतज़ार... (कमेंट करने के लिए)');

        await new Promise(resolve => setTimeout(resolve, 10000));

       

        try {

            await youtube.commentThreads.insert({

                part: 'snippet',

                requestBody: {

                    snippet: {

                        videoId: res.data.id,

                        topLevelComment: { snippet: { textOriginal: `🔥 Direct Link + Free PDF 👇
🔗 ${seoData.postLink}

📚 Daily Mock Test & Notes:
👉 https://studygyaan.in

🚀 Join Telegram for Fast Updates` } }

                    }

                }

            });

            console.log('💬 पहला कमेंट सफलतापूर्वक पिन कर दिया गया!');

        } catch (commentErr) {

            console.log('⚠️ कमेंट करने में दिक्कत आई:', commentErr.message);

        }

        // --- सफ़ाई ---
        if(fs.existsSync(audioPath)) fs.unlinkSync(audioPath); 
        if(fs.existsSync(posterPath)) fs.unlinkSync(posterPath); 
        if(fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        
        return true;

    } catch (err) {
        console.error('❌ Error in Premium Video Engine:', err.message);
        return false;
    }
}

module.exports = { generateAndUploadVideo };

if (require.main === module) {
    const payloadStr = process.env.JOB_DATA;
    if (payloadStr) {
        try {
            const jobData = JSON.parse(payloadStr);
            generateAndUploadVideo(jobData).then(success => {
                process.exit(success ? 0 : 1);
            });
        } catch (e) {
            console.error("❌ JSON Parse Error:", e.message);
        }
    }
}

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

    let rawTags = [...new Set([specificTag, catTag, ...titleWords, ...baseTags])];
    
    // 🔥 YouTube 400 character limit fix (Smart Tag Trimmer)
    let allTags = [];
    let currentLength = 0;
    for (let tag of rawTags) {
        if (currentLength + tag.length + 1 <= 380) { // 380 limit for safety
            allTags.push(tag);
            currentLength += tag.length + 1;
        }
    }

    let hashtags = allTags.slice(0, 5).map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, '')).join(' ');

    // 🔥 Slug Priority Logic for URL
    const identifier = jobData.slug || jobData.id; 
    let postLink = "https://studygyaan.in";
    
    if (identifier) {
        postLink = jobData.type === 'JOB' ? `https://studygyaan.in/job/${identifier}` : `https://studygyaan.in/update/${identifier}`;
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
    // 🔥 Timeout Fix: भारी लाइब्रेरीज़ को अंदर रखा गया है
    const textToSpeech = require('@google-cloud/text-to-speech');
    const { createCanvas, registerFont } = require('canvas');
    const ffmpegPath = require('ffmpeg-static');

    console.log(`🎬 [Premium-Engine] '${jobData.title}' के लिए रेंडरिंग शुरू...`);
    
    const tempDir = os.tmpdir();
    const audioPath = path.join(tempDir, `temp-audio-${Date.now()}.mp3`);
    const posterPath = path.join(tempDir, `temp-poster-${Date.now()}.png`);
    
    // 🔥 SEO Friendly Filename (यूट्यूब के लिए)
    const safeSlug = (jobData.slug || 'govt-job').replace(/[^a-z0-9]/gi, '-').substring(0, 50);
    const videoPath = path.join(tempDir, `${safeSlug}-${Date.now()}.mp4`);

    let jobCat = jobData.category || 'Default';

    try {
        const youtube = await getYouTubeClient();

      // --- Music & Avatar ---
        // 🔥 डायरेक्ट 'ai_backend' और 'bg_music' लोकेशन फोर्स की गई है
        const targetDir = __dirname.includes('ai_backend') ? __dirname : path.join(process.cwd(), 'ai_backend');
        const bgMusicDir = path.join(targetDir, 'bg_music');
        
        let bgMusicPath = '';
        if (fs.existsSync(bgMusicDir)) {
            const mp3Files = fs.readdirSync(bgMusicDir).filter(f => f.toLowerCase().endsWith('.mp3'));
            if (mp3Files.length > 0) {
                bgMusicPath = path.join(bgMusicDir, mp3Files[Math.floor(Math.random() * mp3Files.length)]);
            }
        } else {
            console.log(`❌ ERROR: गिटहब को ${bgMusicDir} पर म्यूजिक फोल्डर नहीं मिला!`);
        }

        const filesInFolder = fs.readdirSync(targetDir);
        const anchorFiles = filesInFolder.filter(file => file.toLowerCase().endsWith('.mp4'));
        if (anchorFiles.length === 0) {
            throw new Error(`❌ No anchor videos found in ${targetDir}!`);
        }

        let selectedVideoFile = anchorFiles[Math.floor(Math.random() * anchorFiles.length)];
        
        let isFemale = selectedVideoFile.toLowerCase().includes('female');
        let isMale = selectedVideoFile.toLowerCase().includes('male');

        let selectedVoice;
        if (isFemale) {
            selectedVoice = 'hi-IN-Neural2-A';
        } else if (isMale) {
            selectedVoice = 'hi-IN-Neural2-C';
        } else {
            selectedVoice = Math.random() > 0.5 ? 'hi-IN-Neural2-A' : 'hi-IN-Neural2-C';
        }
        const finalAnchorPath = path.join(targetDir, selectedVideoFile);

        console.log(`🎥 Selected Anchor: ${selectedVideoFile} | 🎵 Voice: ${selectedVoice}`);;

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

       let cleanName = jobData.title.length > 50 ? jobData.title.substring(0, 50) : jobData.title;
        let script = "";
        // 🔥 Smart Human-like Hooks
        if (jobCat === 'Result') {
            let rHooks = ["क्या आपने भी इसका एग्जाम दिया था? तो दिल थाम के बैठिये!", "जिस रिजल्ट का आपको इंतज़ार था, वो आ गया है!", "खुशखबरी! रिजल्ट आ गया है!"];
            script = `${rHooks[Math.floor(Math.random() * rHooks.length)]} ⚠️ ${cleanName} का रिजल्ट फाइनली डिक्लेयर हो चुका है। अपना रिजल्ट तुरंत चेक करने के लिए पहला कमेंट पढ़ें!`;
        } else if (jobCat === 'Admit Card') {
            let aHooks = ["एग्जाम डेट पास आ गई है, क्या आप तैयार हैं?", "अलर्ट! एडमिट कार्ड आउट हो चुका है!", "बिना इसके एग्जाम सेंटर में एंट्री नहीं मिलेगी!"];
            script = `${aHooks[Math.floor(Math.random() * aHooks.length)]} ⚠️ ${cleanName} का एडमिट कार्ड जारी कर दिया गया है। अपना सेंटर और टाइमिंग चेक करने के लिए पहले कमेंट में दिए लिंक पर जाएँ!`;
        } else if (jobCat === 'Syllabus' || jobCat === 'Answer Key') {
            let sHooks = ["एग्जाम में टॉप करना है? तो ये ज़रूर देखें!", "सिलेक्शन चाहिए तो ये गलती मत करना!"];
            script = `${sHooks[Math.floor(Math.random() * sHooks.length)]} ⚠️ ${cleanName} की नई अपडेट आ गई है। फ्री पीडीएफ डाउनलोड करने के लिए कमेंट बॉक्स चेक करें!`;
        } else {
            let jHooks = ["बेरोजगार हो? तो ये मौका हाथ से जाने मत देना!", "एक और शानदार सरकारी नौकरी आ गई है!", "तैयारी शुरू कर दो, क्योंकि बंपर भर्ती आ गई है!"];
            script = `${jHooks[Math.floor(Math.random() * jHooks.length)]} ⚠️ ${cleanName} की नई वैकेंसी आउट हो गई है। फॉर्म भरने की पूरी डिटेल के लिए पहला कमेंट चेक करें!`;
        }

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
       // 🔥 Dynamic CTA Logic: Fast Track और Jobs के लिए अलग-अलग टेक्स्ट
        if (jobCat === 'Default' || jobCat === 'JOB') {
            ctx.fillStyle = "#FF0000";
            ctx.font = 'bold 80px sans-serif';
            ctx.fillText("APPLY NOW", width / 2, 600);
        } else if (jobCat === 'Result') {
            ctx.fillStyle = "#00FF00";
            ctx.font = 'bold 70px sans-serif';
            ctx.fillText("CHECK RESULT", width / 2, 600);
        } else if (jobCat === 'Admit Card') {
            ctx.fillStyle = "#FFD700";
            ctx.font = 'bold 70px sans-serif';
            ctx.fillText("DOWNLOAD NOW", width / 2, 600);
        }
        // Syllabus और Answer Key के लिए जगह खाली छोड़ दी जाएगी
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

        // 🔥 Visual Retention Hack: Comment Call-To-Action
        ctx.fillStyle = '#ffcc00'; // Eye-catching Yellow banner
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = '900 55px sans-serif';
        ctx.fillText(`👇 LINK IN FIRST COMMENT 👇`, width / 2, 1805);

        // --- 🎬 VIDEO RENDERING ---
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
        let cleanTitle = jobData.title.length > 40 ? jobData.title.substring(0, 40) + ".." : jobData.title;
        
        // 🔥 Viral Title Hooks for Click-Through-Rate (CTR)
        let viralHooks = [];
        if (jobCat === 'Result') viralHooks = ["😱 जल्दी चेक करें!", "🔥 Result आ गया!", "🚨 90% फेल?"];
        else if (jobCat === 'Admit Card') viralHooks = ["🚨 सेंटर चेक करें!", "🔥 Download Now!", "😱 Exam Date!"];
        else viralHooks = ["😱 मौका मत छोड़ना!", "🔥 Apply Now!", "🚨 Notification Out!"];
        
        let vHook = viralHooks[Math.floor(Math.random() * viralHooks.length)];
        let finalTitle = `${vHook} ${cleanTitle} ${jobCat !== 'Default' ? jobCat : 'Vacancy'} #Shorts #GovtJobs`;
        const res = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: { title: finalTitle, description: seoData.description, tags: seoData.tags },
                status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
            },
            media: { body: fs.createReadStream(videoPath) }
        });
        
        console.log('✅ यूट्यूब वीडियो लाइव! URL: https://youtu.be/' + res.data.id);
// --- 🖼️ 1. AUTO CUSTOM THUMBNAIL ---
        try {
            await youtube.thumbnails.set({
                videoId: res.data.id,
                media: { body: fs.createReadStream(posterPath) }
            });
            console.log('🖼️ ✅ कस्टम थंबनेल सेट कर दिया गया!');
        } catch (thumbErr) {
            console.log('⚠️ थंबनेल लगाने में दिक्कत आई (अकाउंट Verify होना चाहिए):', thumbErr.message);
        }

        // --- 📂 2. AUTO PLAYLIST SORTING ---
        try {
            // 🔥 Smart Playlist Logic
            let playlistTitle = "Latest Govt Jobs"; // सिर्फ Jobs और Vacancy के लिए
            if (jobCat === 'Result') playlistTitle = "Results & Updates";
            else if (jobCat === 'Admit Card') playlistTitle = "Admit Cards";
            else if (jobCat === 'Syllabus') playlistTitle = "Exam Syllabus";
            else if (jobCat === 'Answer Key') playlistTitle = "Answer Keys";
            
            // चेक करें कि क्या यह प्लेलिस्ट पहले से मौजूद है
            const playlistsRes = await youtube.playlists.list({ part: 'snippet', mine: true, maxResults: 50 });
            let playlistId = null;
            const existingPlaylist = (playlistsRes.data.items || []).find(p => p.snippet.title.toLowerCase() === playlistTitle.toLowerCase());
            
            if (existingPlaylist) {
                playlistId = existingPlaylist.id;
            } else {
                // अगर नहीं है, तो नई प्लेलिस्ट बना लें
                const newPlaylist = await youtube.playlists.insert({
                    part: 'snippet,status',
                    requestBody: { snippet: { title: playlistTitle }, status: { privacyStatus: 'public' } }
                });
                playlistId = newPlaylist.data.id;
                console.log(`📂 नई प्लेलिस्ट '${playlistTitle}' बनाई गई!`);
            }
            
            // वीडियो को प्लेलिस्ट में डालें
            await youtube.playlistItems.insert({
                part: 'snippet',
                requestBody: {
                    snippet: { playlistId: playlistId, resourceId: { kind: 'youtube#video', videoId: res.data.id } }
                }
            });
            console.log(`✅ वीडियो को '${playlistTitle}' प्लेलिस्ट में जोड़ दिया गया!`);
        } catch (pErr) {
            console.log('⚠️ प्लेलिस्ट में जोड़ने में दिक्कत आई:', pErr.message);
        }
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: `🚀 New Video Live!\n\n📌 ${finalTitle}\n🔗 Watch Here: https://youtu.be/${res.data.id}\n\n✅ Uploaded on YouTube & Facebook.`,
                parse_mode: 'HTML'
            }).catch(() => console.log('टेलीग्राम एरर'));
        }

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
                        topLevelComment: { snippet: { textOriginal: `🔥 Direct Link + Free PDF 👇\n🔗 ${seoData.postLink}\n\n📚 Daily Mock Test & Notes:\n👉 https://studygyaan.in\n\n🚀 Join Telegram for Fast Updates` } }
                    }
                }
            });
            console.log('💬 पहला कमेंट सफलतापूर्वक पिन कर दिया गया!');
        } catch (commentErr) {
            console.log('⚠️ कमेंट करने में दिक्कत आई:', commentErr.message);
        }

        return true;
    } catch (err) {
        console.error('❌ Error in Premium Video Engine:', err.message);
        return false;
    } finally {
        // --- 🧹 क्लीनअप ---
        if(fs.existsSync(audioPath)) fs.unlinkSync(audioPath); 
        if(fs.existsSync(posterPath)) fs.unlinkSync(posterPath); 
        if(fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    }
}

module.exports = { generateAndUploadVideo };

// ✅ GitHub Actions Execution Block (यह लाइन रन होने के लिए बहुत ज़रूरी है)
if (require.main === module) {
    const payloadStr = process.env.JOB_DATA;
    if (payloadStr) {
        try {
            const jobData = JSON.parse(payloadStr);
            generateAndUploadVideo(jobData).then(success => {
                console.log("✅ Video Process Finished");
                process.exit(success ? 0 : 1);
            }).catch(err => {
                console.error("❌ Video Execution Error:", err.message);
                process.exit(1);
            });
        } catch (e) {
            console.error("❌ JSON Parse Error:", e.message);
            process.exit(1);
        }
    } else {
        console.error("❌ JOB_DATA not found in environment.");
        process.exit(1);
    }
}

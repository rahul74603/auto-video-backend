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
        console.log('⬇️ सर्वर पर हिंदी फॉन्ट नहीं है, डाउनलोड किया जा रहा है...');
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
    if (!credentialsVar || !tokenVar) throw new Error("❌ GMAIL_CREDENTIALS या YOUTUBE_TOKEN सीक्रेट नहीं मिला!");

    const creds = JSON.parse(credentialsVar);
    const token = JSON.parse(tokenVar);
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
    if (!FB_PAGE_ID || !FB_PAGE_TOKEN) return console.log('⚠️ FB_PAGE_ID या TOKEN नहीं मिला, फेसबुक स्किप कर दिया।');

    console.log('📱 फेसबुक पेज पर मॉक टेस्ट वीडियो अपलोड शुरू...');
    const formData = new FormData();
    formData.append('access_token', FB_PAGE_TOKEN);
    formData.append('source', fs.createReadStream(videoPath));
    formData.append('description', description + "\n\n👉 Free Mock Tests: https://studygyaan.in\n#mocktest #studymaterial");

    try {
        const fbRes = await axios.post(`https://graph.facebook.com/v19.0/${FB_PAGE_ID}/videos`, formData, { headers: formData.getHeaders() });
        console.log('✅ फेसबुक वीडियो सफलतापूर्वक लाइव हो गया! ID: ' + fbRes.data.id);
    } catch (fbErr) {
        console.error('❌ फेसबुक अपलोड फेल:', fbErr.response ? fbErr.response.data : fbErr.message);
    }
}

// =========================================================
// 🧠 3. TEXT CLEANER & COMPARATOR
// =========================================================
function cleanText(str) {
    if (!str) return "";
    // 🔥 FIX: Removes ** (tarankan) and multiple spaces
    return String(str).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function isSimilar(str1, str2) {
    if (!str1 || !str2) return true;
    let s1 = str1.toLowerCase().replace(/[^a-z0-9]/gi, '').trim();
    let s2 = str2.toLowerCase().replace(/[^a-z0-9]/gi, '').trim();
    return s1 === s2;
}

// =========================================================
// 🖼️ 4. MOCK TEST SLIDE GENERATOR (BULLETPROOF BLOCK RENDERING)
// =========================================================
function createMockSlide(questionObj, qNumber, totalQuestions, mode, subject, outputPath, timerNumber = null) {
    const width = 1920, height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    let grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(0.5, '#203a43');
    grad.addColorStop(1, '#2c5364');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Top Bar
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 0, width, 100);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 50px "HindiFont", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${subject.toUpperCase()} MOCK TEST | StudyGyaan.in`, width / 2, 50);

    // Question Number Box
    ctx.fillStyle = '#FF4500';
    ctx.fillRect(50, 150, 350, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px "HindiFont", sans-serif';
    ctx.fillText(`Question ${qNumber} / ${totalQuestions}`, 225, 190);

    // Auto-Scale Font Sizes
    let totalChars = (questionObj.qEn + questionObj.qHi + questionObj.optA_En + questionObj.optA_Hi + questionObj.optB_En + questionObj.optB_Hi + questionObj.optC_En + questionObj.optC_Hi + questionObj.optD_En + questionObj.optD_Hi).length;
    let qFont = 55; let optFont = 45; let blockGap = 60; let lineGap = 15; 
    if (totalChars > 350) { qFont = 45; optFont = 38; blockGap = 40; lineGap = 10; }
    if (totalChars > 600) { qFont = 38; optFont = 32; blockGap = 30; lineGap = 8; }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // 🔥 FIX: The Ultimate Draw Block logic that physically prevents overlap
    function drawTextBlock(context, text, x, startY, maxWidth, lineHeight, color) {
        context.fillStyle = color;
        let words = text.split(' ');
        let line = '';
        let currentY = startY;

        for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            let metrics = context.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                context.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight; 
            } else {
                line = testLine;
            }
        }
        context.fillText(line, x, currentY);
        return currentY + lineHeight; // Returns exact Y coordinate for the next text block
    }

    let currentY = 270;

    // 1. Draw Question
    ctx.font = `bold ${qFont}px "HindiFont", sans-serif`;
    if (questionObj.qEn === questionObj.qHi || !questionObj.qEn) {
        currentY = drawTextBlock(ctx, `प्र. ${questionObj.qHi || questionObj.qEn}`, 80, currentY, 1750, qFont + lineGap, '#ffffff') + blockGap;
    } else {
        currentY = drawTextBlock(ctx, `Q. ${questionObj.qEn}`, 80, currentY, 1750, qFont + lineGap, '#ffffff') + 10;
        currentY = drawTextBlock(ctx, `प्र. ${questionObj.qHi}`, 80, currentY, 1750, qFont + lineGap, '#00FFFF') + blockGap;
    }
    
    // 2. Draw Options
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
            : `${opt.label}) ${opt.textEn}     |     ${opt.textHi}`;
        
        let startBoxY = currentY - 10;
        
        // Measure exact height needed for background box
        let words = optText.split(' ');
        let tempLine = '';
        let linesCount = 1;
        for (let n = 0; n < words.length; n++) {
            let testLine = tempLine + words[n] + ' ';
            if (ctx.measureText(testLine).width > 1680 && n > 0) {
                linesCount++;
                tempLine = words[n] + ' ';
            } else { tempLine = testLine; }
        }
        let boxHeight = (linesCount * (optFont + lineGap)) + 15;

        // Draw Answer Box
        if (mode === 'answer' && opt.label === questionObj.correct) {
            ctx.fillStyle = '#28a745'; 
            ctx.fillRect(70, startBoxY, 1780, boxHeight);
        }

        // Draw Text and dynamically move to next exact position
        currentY = drawTextBlock(ctx, optText, 100, currentY, 1680, optFont + lineGap, '#ffffff') + 30; // 30px gap between options
    });

    // 3. Visual Timer
    if (mode === 'timer' && timerNumber !== null) {
        ctx.beginPath();
        ctx.arc(1600, 200, 90, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#ffcc00';
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
        ctx.fillText(`✅ Correct Answer: Option ${questionObj.correct}`, width / 2, 980);
    }

    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

// =========================================================
// 🖼️ 4.5 OUTRO SLIDE GENERATOR
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
    ctx.fillText(`Thanks For Watching!`, width / 2, 350);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px "HindiFont", sans-serif';
    ctx.fillText(`👍 Like, Share & Subscribe`, width / 2, 550);

    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 70px "HindiFont", sans-serif';
    ctx.fillText(`For More Jobs, Mock Tests & Blogs`, width / 2, 750);
    
    ctx.fillStyle = '#FF4500';
    ctx.fillText(`Visit: StudyGyaan.in`, width / 2, 850);

    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

// =========================================================
// 🗣️ 5. TEXT TO SPEECH (TTS) ENGINE
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
// 🎬 6. FFMPEG CLIP RENDERER
// =========================================================
async function renderClip(imagePath, audioPath, outputPath, isSilentTimer = false, duration = 1) {
    let args = [];
    if (isSilentTimer) {
        args = ['-y', '-loop', '1', '-i', imagePath, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-pix_fmt', 'yuv420p', '-s', '1920x1080', '-r', '30', '-t', `${duration}`, outputPath];
    } else {
        args = ['-y', '-loop', '1', '-i', imagePath, '-i', audioPath, '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-pix_fmt', 'yuv420p', '-s', '1920x1080', '-r', '30', '-shortest', outputPath];
    }

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, args, { stdio: 'ignore' });
        ffmpeg.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg Clip Render Error: Code ${code}`));
        });
    });
}

// =========================================================
// 🚀 7. MAIN MOCK TEST VIDEO ENGINE
// =========================================================
async function generateMockTestVideo() {
    console.log("🎬 Mock Test Video Engine Started...");
    const tempDir = os.tmpdir();
    
    try {
        await setupHindiFont();

        const snapshot = await db.collection('mock_tests').orderBy("createdAt", "desc").limit(10).get();
        if (snapshot.empty) throw new Error("❌ कोई मॉक टेस्ट नहीं मिला!");
        
        let targetDoc = null;
        for (let doc of snapshot.docs) {
            if (doc.data().mockVideoMade !== true) {
                targetDoc = doc;
                break;
            }
        }

        if (!targetDoc) return console.log("✅ सभी लेटेस्ट मॉक टेस्ट्स के वीडियो बन चुके हैं।");
        
        const mockData = targetDoc.data();
        mockData.id = targetDoc.id;

        if (!mockData.questions || mockData.questions.length === 0) {
            throw new Error(`❌ एरर: इस सेट में कोई प्रश्न नहीं है। कम से कम 1 प्रश्न होना अनिवार्य है।`);
        }
        
        const totalQuestions = mockData.questions.length;
        const subject = mockData.subject || "General";
        const title = mockData.title || `${subject} ${totalQuestions} Q&A Mock Test`;
        
        console.log(`📚 विषय: ${subject} - ${totalQuestions} प्रश्नों का सेट मिल गया है!`);

        const ttsKeyVar = process.env.TTS_KEY_JSON;
        if (!ttsKeyVar) throw new Error("❌ TTS_KEY_JSON नहीं मिला!");
        const ttsClient = new textToSpeech.TextToSpeechClient({ credentials: JSON.parse(ttsKeyVar) });

        const concatListPath = path.join(tempDir, `concat_${Date.now()}.txt`);
        let concatContent = "";
        let filesToClean = [concatListPath];

        for (let i = 0; i < totalQuestions; i++) {
            console.log(`⏳ जनरेट हो रहा है: प्रश्न ${i + 1}/${totalQuestions} ...`);
            const rawQ = mockData.questions[i];
            
            // 🔥 FIX: Replace Database 'Enter' (\n) with ' / ' before splitting to fix overlap root cause
            let qTextSafe = rawQ.qText != null ? String(rawQ.qText).replace(/\n/g, ' / ') : "";
            let qParts = qTextSafe.split(/\s*\/\s*/);
            let qEn = cleanText(qParts[0]);
            let qHi = qParts.length > 1 ? cleanText(qParts[1]) : qEn; 

            let opts = rawQ.options || [];
            let parsedOpts = [];
            let correctLabel = "A";
            
            let correctOptSafe = rawQ.correctOption != null ? String(rawQ.correctOption).replace(/\*\*/g, '').replace(/\n/g, ' / ').trim() : "";

            for (let j = 0; j < 4; j++) {
                let optStr = opts[j] != null ? String(opts[j]).replace(/\n/g, ' / ') : "";
                let oParts = optStr.split(/\s*\/\s*/);
                let oEn = cleanText(oParts[0]);
                let oHi = oParts.length > 1 ? cleanText(oParts[1]) : oEn;
                parsedOpts.push({ en: oEn, hi: oHi });
                
                if (correctOptSafe !== "" && cleanText(optStr) === correctOptSafe) {
                    correctLabel = String.fromCharCode(65 + j); 
                }
            }

            const q = {
                qEn: qEn, qHi: qHi,
                optA_En: parsedOpts[0] ? parsedOpts[0].en : "", optA_Hi: parsedOpts[0] ? parsedOpts[0].hi : "",
                optB_En: parsedOpts[1] ? parsedOpts[1].en : "", optB_Hi: parsedOpts[1] ? parsedOpts[1].hi : "",
                optC_En: parsedOpts[2] ? parsedOpts[2].en : "", optC_Hi: parsedOpts[2] ? parsedOpts[2].hi : "",
                optD_En: parsedOpts[3] ? parsedOpts[3].en : "", optD_Hi: parsedOpts[3] ? parsedOpts[3].hi : "",
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

            // Audio Generation
            let spokenQuestion = (q.qEn === q.qHi || !q.qEn) ? q.qHi : `${q.qEn}. ${q.qHi}`;
            let oA = (q.optA_En === q.optA_Hi || !q.optA_En) ? q.optA_Hi : `${q.optA_En}, या ${q.optA_Hi}`;
            let oB = (q.optB_En === q.optB_Hi || !q.optB_En) ? q.optB_Hi : `${q.optB_En}, या ${q.optB_Hi}`;
            let oC = (q.optC_En === q.optC_Hi || !q.optC_En) ? q.optC_Hi : `${q.optC_En}, या ${q.optC_Hi}`;
            let oD = (q.optD_En === q.optD_Hi || !q.optD_En) ? q.optD_Hi : `${q.optD_En}, या ${q.optD_Hi}`;

            const qText = `प्रश्न ${i + 1}. ${spokenQuestion}. ऑप्शंस हैं: ए, ${oA}. बी, ${oB}. सी, ${oC}. डी, ${oD}. आपका समय शुरू होता है अब।`;
            const aText = `सही जवाब है, ऑप्शन ${q.correct}.`;
            
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
        }

        console.log(`🎬 आउट्रो जनरेट हो रहा है...`);
        const outroImg = path.join(tempDir, `outro_img.png`);
        const outroAud = path.join(tempDir, `outro_aud.mp3`);
        const outroVid = path.join(tempDir, `outro_vid.mp4`);
        filesToClean.push(outroImg, outroAud, outroVid);

        createOutroSlide(outroImg);
        const outroText = "वीडियो देखने के लिए धन्यवाद। कृपया चैनल को लाइक और सब्सक्राइब करें। और अधिक जॉब्स, मॉक टेस्ट और ब्लॉग्स के लिए हमारी वेबसाइट, स्टडी ज्ञान डॉट इन, पर ज़रूर विजिट करें।";
        await generateAudio(outroText, outroAud, ttsClient);
        await renderClip(outroImg, outroAud, outroVid, false);
        
        concatContent += `file '${outroVid}'\n`;

        fs.writeFileSync(concatListPath, concatContent);
        
        console.log(`🎬 सभी ${totalQuestions} प्रश्नों और आउट्रो को जोड़कर फाइनल वीडियो बनाया जा रहा है (इसमें समय लगेगा)...`);
        const finalVideoPath = path.join(tempDir, `final_mock_${Date.now()}.mp4`);
        filesToClean.push(finalVideoPath);

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', finalVideoPath], { stdio: 'ignore' });
            ffmpeg.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg Concat Error ${code}`));
            });
        });

        console.log(`✅ फुल ${totalQuestions} प्रश्नों का वीडियो तैयार: ${finalVideoPath}`);

        const youtube = await getYouTubeClient();
        const seoDesc = `🔥 ${title} | ${subject} Mock Test\n\n📌 Take Free Mock Tests & Download PDF:\n👉 https://studygyaan.in\n\n#MockTest #StudyGyaan #ExamPreparation`;
        
        let ytTitle = `${title} | Top ${totalQuestions} Questions | StudyGyaan`;
        if (ytTitle.length > 100) ytTitle = ytTitle.substring(0, 97) + '...'; 

        let ytVideoId = ""; // 🔥 वीडियो ID को बाहर स्टोर करने के लिए
        console.log('🚀 यूट्यूब पर अपलोड हो रहा है...');
        try {
            const res = await youtube.videos.insert({
                part: 'snippet,status',
                requestBody: {
                    snippet: { title: ytTitle, description: seoDesc, tags: ['MockTest', 'StudyGyaan', subject, 'TopQuestions'] },
                    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
                },
                media: { body: fs.createReadStream(finalVideoPath) }
            });
            ytVideoId = res.data.id;
            console.log('✅ यूट्यूब वीडियो लाइव! URL: https://youtu.be/' + ytVideoId);
            try { await youtube.thumbnails.set({ videoId: ytVideoId, media: { body: fs.createReadStream(filesToClean[1]) } }); } catch (e) {}
        } catch(ytErr) {
            console.error('❌ यूट्यूब अपलोड फेल:', ytErr.message);
        }

        await uploadToFacebook(finalVideoPath, seoDesc);

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            let teleText = `🚀 <b>New ${totalQuestions} Q&A Mock Test Live!</b>\n\n📌 <b>Subject:</b> ${subject}\n`;
            if (ytVideoId) teleText += `🔗 <b>Watch Here:</b> https://youtu.be/${ytVideoId}\n\n`;
            teleText += `✅ Try it now on StudyGyaan.in`;

            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: teleText,
                parse_mode: 'HTML'
            }).catch(() => {});
        }

        await db.collection('mock_tests').doc(mockData.id).update({ mockVideoMade: true });
        console.log(`✅ डेटाबेस में स्टेटस अपडेट कर दिया गया!`);

        filesToClean.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
        return true;

    } catch (error) {
        console.error('❌ Error in Mock Test Engine:', error.message);
        throw error;
    }
}

if (require.main === module) {
    generateMockTestVideo()
        .then(() => {
            console.log("✅ Full Mock Test Process Finished");
            process.exit(0);
        })
        .catch(err => {
            process.exit(1);
        });
}

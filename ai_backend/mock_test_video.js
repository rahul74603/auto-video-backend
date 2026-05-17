const fs = require('fs');
const axios = require('axios');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { google } = require('googleapis');
const admin = require("firebase-admin");
const { createCanvas } = require('canvas');
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
// 🖼️ 3. MOCK TEST SLIDE GENERATOR (HINDI + ENGLISH)
// =========================================================
function createMockSlide(questionObj, qNumber, totalQuestions, isAnswer, subject, outputPath) {
    const width = 1920, height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background Gradient
    let grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(0.5, '#203a43');
    grad.addColorStop(1, '#2c5364');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Header Top Bar
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 0, width, 100);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${subject.toUpperCase()} MOCK TEST | StudyGyaan.in`, width / 2, 50);

    // Question Number Box
    ctx.fillStyle = '#FF4500';
    ctx.fillRect(50, 150, 350, 80);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px sans-serif';
    ctx.fillText(`Question ${qNumber} / ${totalQuestions}`, 225, 190);

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
        return y + lineHeight;
    }

    // Draw English & Hindi Question
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 55px sans-serif';
    let textY = 280;
    textY = wrapText(ctx, `Q. ${questionObj.qEn}`, 80, textY, 1750, 70);
    textY += 20;
    ctx.fillStyle = '#00FFFF'; 
    textY = wrapText(ctx, `प्र. ${questionObj.qHi}`, 80, textY, 1750, 70);
    
    // Draw Options
    textY += 60;
    const options = [
        { label: 'A', textEn: questionObj.optA_En, textHi: questionObj.optA_Hi },
        { label: 'B', textEn: questionObj.optB_En, textHi: questionObj.optB_Hi },
        { label: 'C', textEn: questionObj.optC_En, textHi: questionObj.optC_Hi },
        { label: 'D', textEn: questionObj.optD_En, textHi: questionObj.optD_Hi }
    ];

    ctx.font = 'bold 45px sans-serif';
    options.forEach(opt => {
        if (isAnswer && opt.label === questionObj.correct) {
            ctx.fillStyle = '#28a745'; 
            ctx.fillRect(70, textY - 15, 1780, 80);
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(`${opt.label}) ${opt.textEn}  |  ${opt.textHi}`, 100, textY);
        textY += 100;
    });

    if (isAnswer) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 50px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`✅ Correct Answer: Option ${questionObj.correct}`, width / 2, 980);
    }

    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

// =========================================================
// 🗣️ 4. TEXT TO SPEECH (TTS) ENGINE
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
// 🎬 5. FFMPEG CLIP RENDERER
// =========================================================
async function renderClip(imagePath, audioPath, outputPath, isSilentTimer = false) {
    let args = [];
    if (isSilentTimer) {
        args = ['-y', '-loop', '1', '-i', imagePath, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', '-s', '1920x1080', '-r', '30', '-t', '5', outputPath];
    } else {
        args = ['-y', '-loop', '1', '-i', imagePath, '-i', audioPath, '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', '-s', '1920x1080', '-r', '30', '-shortest', outputPath];
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
// 🚀 6. MAIN MOCK TEST VIDEO ENGINE
// =========================================================
async function generateMockTestVideo() {
    console.log("🎬 Mock Test Video Engine Started...");
    const tempDir = os.tmpdir();
    
    try {
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
            
            let qTextSafe = rawQ.qText != null ? String(rawQ.qText) : "";
            let qParts = qTextSafe.split(' / ');
            let qEn = qParts[0] ? qParts[0].trim() : "";
            let qHi = qParts[1] ? qParts[1].trim() : qEn; 

            let opts = rawQ.options || [];
            let parsedOpts = [];
            let correctLabel = "A";
            
            let correctOptSafe = rawQ.correctOption != null ? String(rawQ.correctOption).trim() : "";

            for (let j = 0; j < 4; j++) {
                let optStr = opts[j] != null ? String(opts[j]) : "";
                let oParts = optStr.split(' / ');
                let oEn = oParts[0] ? oParts[0].trim() : "";
                let oHi = oParts[1] ? oParts[1].trim() : oEn;
                parsedOpts.push({ en: oEn, hi: oHi });
                
                if (correctOptSafe !== "" && correctOptSafe === optStr.trim()) {
                    correctLabel = String.fromCharCode(65 + j); // 0=A, 1=B, 2=C, 3=D
                }
            }

            const q = {
                qEn: qEn,
                qHi: qHi,
                optA_En: parsedOpts[0] ? parsedOpts[0].en : "",
                optA_Hi: parsedOpts[0] ? parsedOpts[0].hi : "",
                optB_En: parsedOpts[1] ? parsedOpts[1].en : "",
                optB_Hi: parsedOpts[1] ? parsedOpts[1].hi : "",
                optC_En: parsedOpts[2] ? parsedOpts[2].en : "",
                optC_Hi: parsedOpts[2] ? parsedOpts[2].hi : "",
                optD_En: parsedOpts[3] ? parsedOpts[3].en : "",
                optD_Hi: parsedOpts[3] ? parsedOpts[3].hi : "",
                correct: correctLabel
            };
            
            const qImg = path.join(tempDir, `q_img_${i}.png`);
            const aImg = path.join(tempDir, `a_img_${i}.png`);
            const qAud = path.join(tempDir, `q_aud_${i}.mp3`);
            const aAud = path.join(tempDir, `a_aud_${i}.mp3`);
            const qVid = path.join(tempDir, `q_vid_${i}.mp4`);
            const tVid = path.join(tempDir, `t_vid_${i}.mp4`);
            const aVid = path.join(tempDir, `a_vid_${i}.mp4`);
            filesToClean.push(qImg, aImg, qAud, aAud, qVid, tVid, aVid);

            createMockSlide(q, i + 1, totalQuestions, false, subject, qImg);
            createMockSlide(q, i + 1, totalQuestions, true, subject, aImg);

            const qText = `प्रश्न ${i + 1}. ${q.qHi}. ऑप्शंस हैं. ए, ${q.optA_Hi}. बी, ${q.optB_Hi}. सी, ${q.optC_Hi}. डी, ${q.optD_Hi}. आपका समय शुरू होता है अब।`;
            const aText = `सही जवाब है, ऑप्शन ${q.correct}.`;
            await generateAudio(qText, qAud, ttsClient);
            await generateAudio(aText, aAud, ttsClient);

            await renderClip(qImg, qAud, qVid, false); 
            await renderClip(qImg, null, tVid, true);  
            await renderClip(aImg, aAud, aVid, false); 

            concatContent += `file '${qVid}'\nfile '${tVid}'\nfile '${aVid}'\n`;
        }

        fs.writeFileSync(concatListPath, concatContent);
        
        console.log(`🎬 सभी ${totalQuestions} प्रश्नों को जोड़कर फाइनल वीडियो बनाया जा रहा है (इसमें समय लगेगा)...`);
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
        
        // 🔥 FIX: Title 100 Characters Limit Safeguard
        let ytTitle = `${title} | Top ${totalQuestions} Questions | StudyGyaan`;
        if (ytTitle.length > 100) {
            ytTitle = ytTitle.substring(0, 97) + '...'; // 100 अक्षरों से ज्यादा होने पर ट्रिम करें
        }

        console.log('🚀 यूट्यूब पर अपलोड हो रहा है...');
        const res = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: { title: ytTitle, description: seoDesc, tags: ['MockTest', 'StudyGyaan', subject, 'TopQuestions'] },
                status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
            },
            media: { body: fs.createReadStream(finalVideoPath) }
        });

        console.log('✅ यूट्यूब वीडियो लाइव! URL: https://youtu.be/' + res.data.id);

        try {
            await youtube.thumbnails.set({ videoId: res.data.id, media: { body: fs.createReadStream(filesToClean[1]) } }); 
        } catch (e) { console.log('⚠️ थंबनेल स्किप'); }

        await uploadToFacebook(finalVideoPath, seoDesc);

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: `🚀 <b>New ${totalQuestions} Q&A Mock Test Live!</b>\n\n📌 <b>Subject:</b> ${subject}\n🔗 <b>Watch:</b> https://youtu.be/${res.data.id}\n\n✅ Try it now on StudyGyaan.in`,
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

// ============================================================================
// ✅ GitHub Actions Execution Block
// ============================================================================
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

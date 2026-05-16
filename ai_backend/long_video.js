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
// 🧠 1. GEMINI API SCRIPT WRITER
// =========================================================
async function generateScriptWithGemini(blogTitle, blogContent) {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("❌ GEMINI_API_KEY सीक्रेट नहीं मिला!");

    console.log("🧠 Gemini API से स्क्रिप्ट लिखवाई जा रही है...");
    
    const prompt = `तुम एक बहुत बेहतरीन YouTube Educational Content Creator हो। 
    नीचे दिए गए ब्लॉग पोस्ट के आधार पर एक 3 मिनट की शानदार YouTube वीडियो स्क्रिप्ट लिखो।
    स्क्रिप्ट हिंदी में होनी चाहिए (लेकिन देवनागरी लिपि में)।
    वीडियो की शुरुआत एक हुक (Hook) से करो, बीच में मुख्य बातें बताओ, और अंत में StudyGyaan.in वेबसाइट पर जाने और वीडियो लाइक करने के लिए कहो।
    केवल बोले जाने वाले शब्द (Spoken text) लिखो। कोई ब्रैकेट, बैकग्राउंड म्यूजिक का नाम, या एक्स्ट्रा टेक्स्ट मत लिखना।

    ब्लॉग का टाइटल: ${blogTitle}
    ब्लॉग की जानकारी: ${blogContent}`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const script = response.data.candidates[0].content.parts[0].text;
        console.log("✅ स्क्रिप्ट रेडी है!");
        return script.replace(/[\*\#\_]/g, ''); // फालतू मार्क्स हटाना
    } catch (error) {
        throw new Error("❌ Gemini API Error: " + (error.response ? JSON.stringify(error.response.data) : error.message));
    }
}

// =========================================================
// 🖼️ 2. LANDSCAPE POSTER ENGINE (16:9 for YouTube Long Form)
// =========================================================
function createLandscapePoster(title, outputPath) {
    console.log('🖼️ 16:9 यूट्यूब पोस्टर डिज़ाइन हो रहा है...');
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

    // Text Wrap Function
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

    // Header
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STUDYGYAAN.IN EXCLUSIVE', width / 2, 150);

    // Main Title
    ctx.fillStyle = '#ffffff'; 
    ctx.font = 'bold 110px sans-serif'; 
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 15;
    wrapText(ctx, title.toUpperCase(), width / 2, 400, 1600, 140);
    ctx.shadowBlur = 0;

    // CTA Box
    ctx.fillStyle = '#ffcc00'; 
    ctx.fillRect(0, 880, width, 200); 
    ctx.fillStyle = '#000000';
    ctx.font = '900 70px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`👇 FULL DETAILS LINK IN DESCRIPTION 👇`, width / 2, 980);
    
    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
    console.log('✅ पोस्टर सेव हो गया!');
}

// =========================================================
// 🎬 3. MAIN LONG VIDEO GENERATOR ENGINE
// =========================================================
async function generateLongVideo() {
    console.log("🎬 Long Video Engine Started...");
    const tempDir = os.tmpdir();
    const audioPath = path.resolve(tempDir, `long-audio-${Date.now()}.mp3`);
    const posterPath = path.resolve(tempDir, `long-poster-${Date.now()}.png`);
    const videoPath = path.resolve(tempDir, `long-video-${Date.now()}.mp4`);

    try {
        // 1. Fetch Latest Blog
        const snapshot = await db.collection('blogs').orderBy("createdAt", "desc").limit(1).get();
        if (snapshot.empty) throw new Error("❌ कोई ब्लॉग नहीं मिला!");
        const blogDoc = snapshot.docs[0];
        const blogData = blogDoc.data();
        const blogTitle = blogData.title || "New Update";
        const blogContent = blogData.description || blogData.content || blogTitle;

        console.log(`📝 ब्लॉग मिला: ${blogTitle}`);

        // 2. Generate Script
        const scriptText = await generateScriptWithGemini(blogTitle, blogContent);

        // 3. Generate Audio via Google TTS
        console.log("🗣️ आवाज़ (TTS) जनरेट हो रही है...");
        const ttsKeyVar = process.env.TTS_KEY_JSON;
        if (!ttsKeyVar) throw new Error("❌ TTS_KEY_JSON नहीं मिला!");
        const ttsClient = new textToSpeech.TextToSpeechClient({ credentials: JSON.parse(ttsKeyVar) });
        
        const [response] = await ttsClient.synthesizeSpeech({
            input: { text: scriptText },
            voice: { languageCode: 'hi-IN', name: 'hi-IN-Neural2-C' }, // Male Voice
            audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
        });
        fs.writeFileSync(audioPath, response.audioContent, 'binary');

        // 4. Generate Poster
        createLandscapePoster(blogTitle, posterPath);

        // 5. Check Music
        const targetDir = __dirname.includes('ai_backend') ? __dirname : path.join(process.cwd(), 'ai_backend');
        const bgMusicDir = path.join(targetDir, 'bg_music');
        let finalMusic = null;
        if (fs.existsSync(bgMusicDir)) {
            const mp3Files = fs.readdirSync(bgMusicDir).filter(f => f.toLowerCase().endsWith('.mp3'));
            if (mp3Files.length > 0) finalMusic = path.resolve(path.join(bgMusicDir, mp3Files[0]));
        }

        // 6. FFmpeg Rendering
        console.log('🎬 FFmpeg रेंडरिंग चालू है... (लॉन्ग वीडियो में थोड़ा समय लग सकता है)');
        const hasMusic = finalMusic && fs.existsSync(finalMusic);
        
        let args = [];
        if (hasMusic) {
            // म्यूजिक के साथ
            const filter = `[1:a]volume=1.4[voice];[2:a]volume=0.05[bgm];[voice][bgm]amix=inputs=2:duration=first[a]`;
            args = ['-y', '-loop', '1', '-i', posterPath, '-i', audioPath, '-stream_loop', '-1', '-i', finalMusic, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-pix_fmt', 'yuv420p', videoPath];
        } else {
            // बिना म्यूजिक
            args = ['-y', '-loop', '1', '-i', posterPath, '-i', audioPath, '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-pix_fmt', 'yuv420p', videoPath];
        }

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, args);
            ffmpeg.stderr.on('data', (data) => {
                const out = data.toString();
                if (out.includes('time=')) process.stdout.write(`\r${out.split('\n')[0]}`);
            });
            ffmpeg.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg code ${code}`));
            });
        });

        console.log(`\n✅ फुल लेंथ वीडियो तैयार हो गया: ${videoPath}`);
        // यहाँ से आप इसे अपलोड करने का लॉजिक (YouTube API) कॉल कर सकते हैं।
        return videoPath;

    } catch (error) {
        console.error('❌ Error in Long Video Engine:', error.message);
        throw error;
    } finally {
        if(fs.existsSync(audioPath)) fs.unlinkSync(audioPath); 
        if(fs.existsSync(posterPath)) fs.unlinkSync(posterPath); 
    }
}

// ============================================================================
// ✅ GitHub Actions Execution Block
// ============================================================================
if (require.main === module) {
    generateLongVideo()
        .then(() => {
            console.log("✅ Process Finished Successfully");
            process.exit(0);
        })
        .catch(err => {
            process.exit(1);
        });
}

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

    if (!credentialsVar || !tokenVar || tokenVar === "test" || tokenVar === "temp_key") {
        throw new Error("❌ GMAIL_CREDENTIALS या YOUTUBE_TOKEN सीक्रेट नहीं मिला या Dummy सेट है!");
    }

    let creds, token;
    try {
        creds = JSON.parse(credentialsVar);
        token = JSON.parse(tokenVar);
    } catch (e) {
        throw new Error("❌ YOUTUBE Secrets Invalid JSON format. कृपया असली JSON डालें।");
    }

    const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    oAuth2Client.setCredentials(token);
    return google.youtube({ version: 'v3', auth: oAuth2Client });
}

// =========================================================
// 📱 2. FACEBOOK UPLOAD ENGINE (Videos & Reels)
// =========================================================
async function uploadToFacebook(videoPath, description) {
    const FB_PAGE_ID = process.env.FB_PAGE_ID;
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

    if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
        console.log('⚠️ FB_PAGE_ID या TOKEN नहीं मिला, फेसबुक स्किप कर दिया।');
        return;
    }

    console.log('📱 फेसबुक पेज पर लॉन्ग वीडियो अपलोड शुरू...');
    const formData = new FormData();
    formData.append('access_token', FB_PAGE_TOKEN);
    formData.append('source', fs.createReadStream(videoPath));
    formData.append('description', description + "\n\n👉 Visit: https://studygyaan.in\n#studymaterial #exams #education");

    try {
        const fbRes = await axios.post(
            `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/videos`,
            formData,
            { headers: formData.getHeaders() }
        );
        console.log('✅ फेसबुक वीडियो सफलतापूर्वक लाइव हो गया! ID: ' + fbRes.data.id);
    } catch (fbErr) {
        console.error('❌ फेसबुक अपलोड फेल:', fbErr.response ? fbErr.response.data : fbErr.message);
    }
}

// =========================================================
// 🧠 3. THE MAGIC SEO ENGINE FOR BLOGS
// =========================================================
function generateSEO(blogData, blogCat) {
    let titleWords = blogData.title.split(' ').filter(w => w.length > 2 && !['and', 'the', 'for', 'out', 'now'].includes(w.toLowerCase()));
    let mainOrg = titleWords.slice(0, 2).join(''); 
    
    let baseTags = [
        'StudyGyaan', 'StudyGyaan.in', 'ExamPreparation', 'SarkariResult2026', 
        'LatestUpdate', 'FreePDF', 'PremiumNotes', 'StudyMaterial', 'MockTest'
    ];
    
    let catTag = blogCat !== 'Default' ? blogCat.replace(/\s+/g, '') : 'BlogUpdate'; 
    let specificTag = mainOrg + catTag; 

    let rawTags = [...new Set([specificTag, catTag, ...titleWords, ...baseTags])];
    
    let allTags = [];
    let currentLength = 0;
    for (let tag of rawTags) {
        if (currentLength + tag.length + 1 <= 380) { 
            allTags.push(tag);
            currentLength += tag.length + 1;
        }
    }

    let hashtags = allTags.slice(0, 5).map(t => '#' + t.replace(/[^a-zA-Z0-9]/g, '')).join(' ');
    const identifier = blogData.slug || blogData.id; 
    let postLink = "https://studygyaan.in";
    
    if (identifier) {
        postLink = `https://studygyaan.in/blog/${identifier}`;
    }

    let description = `
🔥 ${blogData.title} ${blogCat} 2026 Latest Educational Update

📌 Full Details Check Here:
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
// 🧠 4. GEMINI API SCRIPT WRITER
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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const script = response.data.candidates[0].content.parts[0].text;
        console.log("✅ स्क्रिप्ट रेडी है!");
        return script.replace(/[\*\#\_]/g, ''); 
    } catch (error) {
        throw new Error("❌ Gemini API Error: " + (error.response ? JSON.stringify(error.response.data) : error.message));
    }
}

// =========================================================
// 🖼️ 5. LANDSCAPE POSTER ENGINE (16:9 for YouTube Long Form)
// =========================================================
function createLandscapePoster(title, outputPath) {
    console.log('🖼️ 16:9 यूट्यूब पोस्टर डिज़ाइन हो रहा है...');
    const width = 1920, height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0f2027');
    grad.addColorStop(0.5, '#203a43');
    grad.addColorStop(1, '#2c5364');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

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

    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STUDYGYAAN.IN EXCLUSIVE', width / 2, 150);

    ctx.fillStyle = '#ffffff'; 
    ctx.font = 'bold 110px sans-serif'; 
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 15;
    wrapText(ctx, title.toUpperCase(), width / 2, 400, 1600, 140);
    ctx.shadowBlur = 0;

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
// 🎬 6. MAIN LONG VIDEO GENERATOR ENGINE
// =========================================================
async function generateLongVideo() {
    console.log("🎬 Long Video Engine Started...");
    const tempDir = os.tmpdir();
    const audioPath = path.resolve(tempDir, `long-audio-${Date.now()}.mp3`);
    const posterPath = path.resolve(tempDir, `long-poster-${Date.now()}.png`);
    
    try {
        // 🔥 FIX: 10 नए ब्लॉग चेक करने का लॉजिक (Status Flag)
        const snapshot = await db.collection('blogs').orderBy("createdAt", "desc").limit(10).get();
        if (snapshot.empty) throw new Error("❌ कोई ब्लॉग नहीं मिला!");
        
        let targetBlogDoc = null;
        for (let doc of snapshot.docs) {
            if (doc.data().longVideoMade !== true) {
                targetBlogDoc = doc;
                break;
            }
        }

        if (!targetBlogDoc) {
            console.log("✅ सभी 10 लेटेस्ट ब्लॉग्स के वीडियो बन चुके हैं। कोई नया वीडियो नहीं बनाना है।");
            return true;
        }

        const blogData = targetBlogDoc.data();
        blogData.id = targetBlogDoc.id; // ID सिंक करना

        const blogTitle = blogData.title || "New Update";
        const blogContent = blogData.description || blogData.content || blogTitle;
        const blogCat = blogData.category || 'Default';

        const safeSlug = (blogData.slug || 'studygyaan-update').replace(/[^a-z0-9]/gi, '-').substring(0, 50);
        const videoPath = path.resolve(tempDir, `${safeSlug}-${Date.now()}.mp4`);

        console.log(`📝 नया ब्लॉग मिला: ${blogTitle}`);

        const youtube = await getYouTubeClient();
        const scriptText = await generateScriptWithGemini(blogTitle, blogContent);

        console.log("🗣️ आवाज़ (TTS) जनरेट हो रही है...");
        const ttsKeyVar = process.env.TTS_KEY_JSON;
        if (!ttsKeyVar) throw new Error("❌ TTS_KEY_JSON नहीं मिला!");
        const ttsClient = new textToSpeech.TextToSpeechClient({ credentials: JSON.parse(ttsKeyVar) });
        
        let chunks = [];
        let currentChunk = "";
        let sentences = scriptText.split(/(?<=[.!?।\n])/); 
        
        for (let sentence of sentences) {
            if (!sentence.trim()) continue;
            if (currentChunk.length + sentence.length > 1200) {
                if(currentChunk) chunks.push(currentChunk);
                currentChunk = sentence;
            } else {
                currentChunk += sentence;
            }
        }
        if (currentChunk.trim().length > 0) chunks.push(currentChunk);

        console.log(`🗣️ स्क्रिप्ट बड़ी है, इसे ${chunks.length} हिस्सों में बाँट कर आवाज़ बनाई जा रही है...`);

        let finalAudioBuffer = Buffer.alloc(0);
        for (let i = 0; i < chunks.length; i++) {
            const [response] = await ttsClient.synthesizeSpeech({
                input: { text: chunks[i] },
                voice: { languageCode: 'hi-IN', name: 'hi-IN-Neural2-C' },
                audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
            });
            const chunkBuffer = Buffer.from(response.audioContent, 'binary');
            finalAudioBuffer = Buffer.concat([finalAudioBuffer, chunkBuffer]);
            console.log(`⏳ हिस्सा ${i + 1}/${chunks.length} जनरेट हुआ...`);
        }
        
        fs.writeFileSync(audioPath, finalAudioBuffer, 'binary');
        console.log("✅ फाइनल ऑडियो तैयार हो गई!");

        createLandscapePoster(blogTitle, posterPath);

        const targetDir = __dirname.includes('ai_backend') ? __dirname : path.join(process.cwd(), 'ai_backend');
        const bgMusicDir = path.join(targetDir, 'bg_music');
        let finalMusic = null;
        if (fs.existsSync(bgMusicDir)) {
            const mp3Files = fs.readdirSync(bgMusicDir).filter(f => f.toLowerCase().endsWith('.mp3'));
            if (mp3Files.length > 0) finalMusic = path.resolve(path.join(bgMusicDir, mp3Files[0]));
        }

        console.log('🎬 FFmpeg रेंडरिंग चालू है...');
        const hasMusic = finalMusic && fs.existsSync(finalMusic);
        
        let args = [];
        if (hasMusic) {
            const filter = `[1:a]volume=1.4[voice];[2:a]volume=0.05[bgm];[voice][bgm]amix=inputs=2:duration=first[a]`;
            args = ['-y', '-loop', '1', '-i', posterPath, '-i', audioPath, '-stream_loop', '-1', '-i', finalMusic, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-pix_fmt', 'yuv420p', videoPath];
        } else {
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

        // =========================================================
        // 🚀 YOUTUBE UPLOAD PROCESS
        // =========================================================
        const seoData = generateSEO(blogData, blogCat);
        let cleanTitle = blogTitle.length > 40 ? blogTitle.substring(0, 40) + ".." : blogTitle;
        
        let viralHooks = ["😱 बड़ी खुशखबरी!", "🔥 New Update Out!", "🚨 ज़रूर देखें!"];
        let vHook = viralHooks[Math.floor(Math.random() * viralHooks.length)];
        let finalTitle = `${vHook} ${cleanTitle} | StudyGyaan #Education #GovtJobs`;

        console.log('🚀 यूट्यूब पर वीडियो अपलोड किया जा रहा है...');
        const res = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: { title: finalTitle, description: seoData.description, tags: seoData.tags },
                status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
            },
            media: { body: fs.createReadStream(videoPath) }
        });

        console.log('✅ यूट्यूब वीडियो लाइव! URL: https://youtu.be/' + res.data.id);

        // --- 🖼️ CUSTOM THUMBNAIL ---
        try {
            await youtube.thumbnails.set({
                videoId: res.data.id,
                media: { body: fs.createReadStream(posterPath) }
            });
            console.log('🖼️ ✅ कस्टम थंबनेल सेट कर दिया गया!');
        } catch (thumbErr) {
            console.log('⚠️ थंबनेल लगाने में दिक्कत आई:', thumbErr.message);
        }

        // --- 📂 PLAYLIST SORTING ---
        try {
            let playlistTitle = "Latest Educational Updates";
            const playlistsRes = await youtube.playlists.list({ part: 'snippet', mine: true, maxResults: 50 });
            let playlistId = null;
            const existingPlaylist = (playlistsRes.data.items || []).find(p => p.snippet.title.toLowerCase() === playlistTitle.toLowerCase());
            
            if (existingPlaylist) {
                playlistId = existingPlaylist.id;
            } else {
                const newPlaylist = await youtube.playlists.insert({
                    part: 'snippet,status',
                    requestBody: { snippet: { title: playlistTitle }, status: { privacyStatus: 'public' } }
                });
                playlistId = newPlaylist.data.id;
                console.log(`📂 नई प्लेलिस्ट '${playlistTitle}' बनाई गई!`);
            }
            
            await youtube.playlistItems.insert({
                part: 'snippet',
                requestBody: {
                    snippet: { playlistId: playlistId, resourceId: { kind: 'youtube#video', videoId: res.data.id } }
                }
            });
            console.log(`✅ वीडियो को प्लेलिस्ट में जोड़ दिया गया!`);
        } catch (pErr) {
            console.log('⚠️ प्लेलिस्ट ऑपरेशन स्किप्ड:', pErr.message);
        }

        // --- 📢 TELEGRAM NOTIFICATION ---
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: `🚀 <b>New Full Video Live!</b>\n\n📌 <b>Topic:</b> ${blogTitle}\n🔗 <b>Watch Here:</b> https://youtu.be/${res.data.id}\n\n✅ Automatically uploaded on YouTube & Facebook.`,
                parse_mode: 'HTML'
            }).catch(() => console.log('⚠️ टेलीग्राम नोटिफिकेशन सेंड फेल।'));
        }

        // --- 📱 FACEBOOK & REELS UPLOAD ---
        await uploadToFacebook(videoPath, seoData.description);

        // --- 💬 AUTO PINNED COMMENT ---
        console.log('⏳ 10 सेकंड का इंतज़ार... (कमेंट करने के लिए)');
        await new Promise(resolve => setTimeout(resolve, 10000));

        try {
            await youtube.commentThreads.insert({
                part: 'snippet',
                requestBody: {
                    snippet: {
                        videoId: res.data.id,
                        topLevelComment: { snippet: { textOriginal: `🔥 Direct Link + Free Materials 👇\n🔗 ${seoData.postLink}\n\n📚 Website:\n👉 https://studygyaan.in\n\n🚀 Join Telegram For Instant Notifications!` } }
                    }
                }
            });
            console.log('💬 पहला कमेंट सफलतापूर्वक लाइव हो गया!');
        } catch (commentErr) {
            console.log('⚠️ कमेंट सेक्शन स्किप्ड:', commentErr.message);
        }

        // 🔥 FIREBASE STATUS UPDATE
        await db.collection('blogs').doc(blogData.id).update({ longVideoMade: true });
        console.log(`✅ डेटाबेस में ब्लॉग '${blogTitle}' का longVideoMade स्टेटस अपडेट कर दिया गया!`);

        // लोकल फाइल्स डिलीट करना
        if(fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        return true;

    } catch (error) {
        console.error('❌ Error in Long Video Master Engine:', error.message);
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
            console.log("✅ Full Process Finished Successfully");
            process.exit(0);
        })
        .catch(err => {
            process.exit(1);
        });
}

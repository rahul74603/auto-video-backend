require("dotenv").config();
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");

// ✅ Firebase Initialization
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    const config = {
        projectId: "studymaterial-406ad",
        storageBucket: "studymaterial-406ad.firebasestorage.app"
    };

    if (serviceAccountVar && serviceAccountVar !== "undefined") {
        try {
            const serviceAccount = JSON.parse(serviceAccountVar);
            admin.initializeApp({
                ...config,
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (e) {
            admin.initializeApp(config);
        }
    } else {
        admin.initializeApp(config);
    }
}
const bucket = admin.storage().bucket();

/* ========================================== */
/* 🎨 AI IMAGE GENERATOR LOGIC (IMAGEN 3 + OG Fallback) */
/* Best-of-best: Try Imagen 3 first, fallback to sharp OG image (always works, 0 cost) */
/* ========================================== */
async function generateBrandedImage(title, docId) {
    // Try Imagen 3 first
    try {
        console.log(`🎨 [Best-of-2] Attempt 1: Imagen 3 for: ${title}`);
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) throw new Error('GEMINI_API_KEY missing');

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`,
            {
                instances: [
                    { 
                        prompt: `A highly professional, neat, and educational YouTube thumbnail for a government job/exam update. Text clearly written on the image: "studygyaan.in". Topic: "${title}". No clutter, clean background, readable fonts, realistic human touch.` 
                    }
                ],
                parameters: { 
                    sampleCount: 1, 
                    aspectRatio: "16:9"
                }
            },
            { timeout: 30000 }
        );

        const base64Image = response.data?.predictions?.[0]?.bytesBase64Encoded;
        if (!base64Image) throw new Error('No image in response');

        const buffer = Buffer.from(base64Image, 'base64');
        const fileName = `thumbnails/${docId}_${Date.now()}_imagen.jpg`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
            metadata: { 
                contentType: 'image/jpeg', 
                cacheControl: 'public, max-age=31536000' 
            }
        });
        await file.makePublic();
        const imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log(`✅ [Best-of-2] Imagen 3 Success: ${imageUrl}`);
        return imageUrl;

    } catch (error) {
        console.warn(`⚠️ Imagen 3 failed (will try OG fallback): ${error.response?.data?.error?.message || error.message}`);

        // Fallback 2: OG Image via sharp (always works, no external API, 0 cost, fixes "auto pic not working")
        try {
            console.log(`🎨 [Best-of-2] Attempt 2: OG Sharp fallback for: ${title}`);
            const { buildOgSvg } = require('./og_image');
            const sharp = require('sharp');
            
            // Build OG SVG similar to og_image.js but simpler
            const svg = buildOgSvg({
                canonicalType: 'job',
                title: title.slice(0, 80),
                subtitle: 'StudyGyaan - Sarkari Naukri'
            });

            const buffer = await sharp(Buffer.from(svg))
                .jpeg({ quality: 85 })
                .toBuffer();

            const fileName = `thumbnails/${docId}_${Date.now()}_og.jpg`;
            const file = bucket.file(fileName);

            await file.save(buffer, {
                metadata: {
                    contentType: 'image/jpeg',
                    cacheControl: 'public, max-age=31536000'
                }
            });
            await file.makePublic();
            const imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            console.log(`✅ [Best-of-2] OG Fallback Success: ${imageUrl}`);
            return imageUrl;

        } catch (fallbackErr) {
            console.error(`❌ Both Imagen and OG fallback failed: ${fallbackErr.message}`);
            // Final fallback: return default og-image URL (no upload)
            return `https://studygyaan.in/og-image.jpg`;
        }
    }
}

/* ========================================== */
/* 1️⃣ TRIGGER FOR JOB DRAFTS                  */
/* ========================================== */
exports.autoImageJobDrafts = onDocumentCreated({
    document: "job_drafts/{docId}",
    memory: "1GiB",
    timeoutSeconds: 300,
    secrets: ["GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON"]
}, async (event) => {
    const data = event.data.data();
    
    // अगर डेटा नहीं है या पहले से इमेज मौजूद है, तो रुक जाओ
    if (!data || data.imageUrl) return null;

    const newImageUrl = await generateBrandedImage(data.title, event.params.docId);
    if (newImageUrl) {
        await event.data.ref.update({ imageUrl: newImageUrl });
    }
    return null;
});

/* ========================================== */
/* 2️⃣ TRIGGER FOR FAST TRACK DRAFTS            */
/* ========================================== */
exports.autoImageFastTrack = onDocumentCreated({
    document: "fast_track/{docId}",
    memory: "1GiB",
    timeoutSeconds: 300,
    secrets: ["GEMINI_API_KEY", "SERVICE_ACCOUNT_JSON"]
}, async (event) => {
    const data = event.data.data();
    
    if (!data || data.imageUrl) return null;

    const newImageUrl = await generateBrandedImage(data.title, event.params.docId);
    if (newImageUrl) {
        await event.data.ref.update({ imageUrl: newImageUrl });
    }
    return null;
});

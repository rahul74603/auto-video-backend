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
/* 🎨 AI IMAGE GENERATOR LOGIC (IMAGEN 3)     */
/* ========================================== */
async function generateBrandedImage(title, docId) {
    try {
        console.log(`🎨 Generating AI Image for: ${title}`);
        const apiKey = process.env.GEMINI_API_KEY;
        
        // 🔥 Google Imagen 3 API Call (Best for 16:9 Thumbnails)
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
                    aspectRatio: "16:9" // Google Discover & News Standard Size
                }
            }
        );

        const base64Image = response.data.predictions[0].bytesBase64Encoded;
        const buffer = Buffer.from(base64Image, 'base64');

        // 🔥 Save to Firebase Storage
        const fileName = `thumbnails/${docId}_${Date.now()}.jpg`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
            metadata: { 
                contentType: 'image/jpeg', 
                cacheControl: 'public, max-age=31536000' 
            }
        });

        await file.makePublic();
        const imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        
        console.log(`✅ Image Successfully Generated & Saved: ${imageUrl}`);
        return imageUrl;

    } catch (error) {
        console.error("❌ Image Generation Failed:", error.response?.data || error.message);
        return null;
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

// @ts-nocheck
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// ✅ Firebase Admin Initialization (Same as Payment Checker)
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

// ✅ Gemini AI Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.processNotes = async () => {
    console.log("📝 Starting AI Note Processor...");

    try {
        // 1. Pending conversions ढूंढें
        const snapshot = await db.collection("note_conversions").where("status", "==", "pending").limit(5).get();

        if (snapshot.empty) {
            console.log("✅ No pending notes to process.");
            return;
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        for (const doc of snapshot.docs) {
            const data = doc.data();
            console.log(`🔍 Processing image: ${data.fileName}`);

            try {
                // 2. Image URL को Base64 में बदलें (Gemini की ज़रूरत)
                const response = await fetch(data.imageUrl);
                const buffer = await response.arrayBuffer();
                const base64Data = Buffer.from(buffer).toString("base64");

                const prompt = "Extract all handwritten text from this image and format it into a clean, readable digital note. Keep the language exactly as written (Hindi/English). Only give the extracted text, no extra talk.";

                const result = await model.generateContent([
                    prompt,
                    { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
                ]);

                const extractedText = result.response.text();

                // 3. Firestore में रिजल्ट अपडेट करें
                await db.collection("note_conversions").doc(doc.id).update({
                    extractedText: extractedText,
                    status: "completed",
                    processedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`✅ Successfully processed: ${data.fileName}`);
            } catch (err) {
                console.error(`❌ Error processing doc ${doc.id}:`, err.message);
                await db.collection("note_conversions").doc(doc.id).update({ status: "failed" });
            }
        }
    } catch (error) {
        console.error("❌ Note Processor Global Error:", error.message);
    }
};

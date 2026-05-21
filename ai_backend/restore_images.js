require("dotenv").config();
const admin = require("firebase-admin");

// 🔐 FIREBASE INITIALIZATION
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "studymaterial-406ad.firebasestorage.app"
        });
        console.log("✅ Firebase SDK Initialized for Image Recovery!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

async function recoverImages() {
    console.log("🚨 Starting Image Recovery from Firebase Hidden Recycle Bin...");
    try {
        // Recycle bin aur deleted versions ki saari files nikalna
        const [files] = await bucket.getFiles({ versions: true });
        let recoveredCount = 0;

        for (const file of files) {
            const isDeleted = file.metadata.timeDeleted; 
            const ext = file.name.toLowerCase();

            // Sirf un files ko pakadna jo delete hui hain aur images hain
            if (isDeleted && (ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".png"))) {
                console.log(`♻️ Found deleted image: ${file.name}`);
                
                try {
                    const oldGenerationFile = bucket.file(file.name, { generation: file.metadata.generation });
                    
                    // Option A: Restore API use karna
                    if (typeof oldGenerationFile.restore === 'function') {
                        await oldGenerationFile.restore();
                    } else {
                        // Option B: Agar restore direct na ho to purani file ko wapas copy karna
                        await oldGenerationFile.copy(bucket.file(file.name));
                    }
                    
                    recoveredCount++;
                    console.log(`✅ Successfully Restored: ${file.name}`);
                } catch (err) {
                    console.log(`⚠️ Could not restore ${file.name}: ${err.message}`);
                }
            }
        }
        
        console.log(`\n🎉 Recovery Complete! Total ${recoveredCount} images restored.`);
        console.log("🌐 Ab apni React website ko refresh karke check karein, saari photos wapas aa gayi hongi!");
        
    } catch (error) {
        console.error("❌ Recovery Error:", error.message);
    }
}

recoverImages();

require("dotenv").config();
const admin = require("firebase-admin");
const path = require("path");

// 🔐 FIREBASE INITIALIZATION
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "studymaterial-406ad.firebasestorage.app"
        });
        console.log("✅ Firebase SDK Initialized for Direct Purge!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

async function purgeHeavyFiles() {
    try {
        console.log("🚀 Starting Ultimate Storage Purge Engine...");
        const [files] = await bucket.getFiles();
        let deletedCount = 0;

        for (const file of files) {
            if (file.name.endsWith("/")) continue;

            const sizeInBytes = parseInt(file.metadata.size || 0);
            const sizeInMB = sizeInBytes / (1024 * 1024);

            // 🔥 5MB से बड़ी जो भी फाइल सामने आएगी, उसे सीधे डिलीट मारेंगे
            if (sizeInMB >= 5.0) {
                console.log(`🗑️ Deleting Heavy File: ${file.name} (${sizeInMB.toFixed(2)} MB)`);
                await file.delete();
                deletedCount++;
            }
        }

        console.log("\n=============================================");
        console.log(`🎉 PURGE COMPLETED SUCCESSFULY!`);
        console.log(`🔥 Total heavy files destroyed: ${deletedCount}`);
        console.log("=============================================");

    } catch (error) {
        console.error("❌ Purge Engine Error:", error.message);
    }
}

if (require.main === module) {
    purgeHeavyFiles().then(() => process.exit(0)).catch(() => process.exit(1));
}

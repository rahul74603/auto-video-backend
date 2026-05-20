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
        console.log("✅ Firebase SDK Initialized for SOFT-DELETE RECOVERY!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

async function recoverSoftDeletedFiles() {
    try {
        console.log("🚀 Starting Absolute Soft-Delete Recovery Engine...");
        
        // 🔍 गूगल क्लाउड के छुपे हुए सॉफ्ट-डिलीटेड आर्काइव को स्कैन करना
        const [files] = await bucket.getFiles({
            versions: true,
            softDeleted: true // 🔥 यह सीधे ट्रैश/सॉफ्ट-डिलीटेड फाइल्स को टारगेट करेगा
        });

        console.log(`📦 Found ${files.length} historical entries in storage memory.`);
        let restoredCount = 0;

        for (const file of files) {
            // अगर फाइल डिलीटेड स्टेट में है
            if (file.metadata && (file.metadata.timeDeleted || file.metadata.softDeleteTime)) {
                const sizeInBytes = parseInt(file.metadata.size || 0);
                const sizeInMB = sizeInBytes / (1024 * 1024);

                // सिर्फ वही 47 भारी रेलवे और नोटिफिकेशन वाली फाइल्स
                if (sizeInMB >= 5.0) {
                    console.log(`🔄 Recovering: ${file.name} (${sizeInMB.toFixed(2)} MB)`);
                    
                    // फाइल को उसके पुराने डिलीटेड वर्जन से वापस एक्टिव मोड में कॉपी करना
                    await bucket.file(file.name, { generation: file.metadata.generation }).copy(bucket.file(file.name));
                    restoredCount++;
                }
            }
        }

        console.log("\n=============================================");
        console.log(`🎉 ABSOLUTE RECOVERY COMPLETED!`);
        console.log(`✅ Total files restored successfully: ${restoredCount}`);
        console.log("=============================================");

    } catch (error) {
        console.error("❌ Recovery Engine Error:", error.message);
    }
}

if (require.main === module) {
    recoverSoftDeletedFiles().then(() => process.exit(0)).catch(() => process.exit(1));
}

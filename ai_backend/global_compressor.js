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
        console.log("✅ Firebase SDK Initialized for PERFECT RECOVERY!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

async function fixAndRestore() {
    try {
        console.log("🚀 Starting Final Recovery Engine...");
        
        // 🔥 FIXED: यहाँ से versions: true हटा दिया है, केवल softDeleted: true रखा है ताकि एरर न आए
        const [files] = await bucket.getFiles({
            softDeleted: true 
        });

        console.log(`📦 Found ${files.length} soft-deleted historical objects.`);
        let restoredCount = 0;

        for (const file of files) {
            // चेक करेंगे कि क्या फाइल का डिलीटेड डेटा मौजूद है
            if (file.metadata && (file.metadata.timeDeleted || file.metadata.softDeleteTime)) {
                const sizeInBytes = parseInt(file.metadata.size || 0);
                const sizeInMB = sizeInBytes / (1024 * 1024);

                // आपकी सभी 5MB से बड़ी जरूरी फाइल्स
                if (sizeInMB >= 5.0) {
                    console.log(`🔄 Restoring: ${file.name} (${sizeInMB.toFixed(2)} MB)`);
                    
                    // जनरेशन आईडी से सीधे एक्टिव पाथ पर रिस्टोर (कॉपी) करना
                    await bucket.file(file.name, { generation: file.metadata.generation }).copy(bucket.file(file.name));
                    restoredCount++;
                }
            }
        }

        console.log("\n=============================================");
        console.log(`🎉 RESTORATION SUCCESSFUL!`);
        console.log(`✅ Total files brought back online: ${restoredCount}`);
        console.log("=============================================");

    } catch (error) {
        console.error("❌ Recovery Failed:", error.message);
    }
}

if (require.main === module) {
    fixAndRestore().then(() => process.exit(0)).catch(() => process.exit(1));
}

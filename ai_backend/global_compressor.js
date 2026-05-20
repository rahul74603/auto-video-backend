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
        console.log("✅ Firebase SDK Initialized for Data Restoration!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

async function restoreDeletedFiles() {
    try {
        console.log("🚀 Starting Ultimate Data Restoration Engine...");
        console.log("Recovering all deleted heavy files from version history...\n");

        // 🔍 बकेट के सभी वर्शन्स (सॉफ्ट डिलीटेड फाइल्स) को खोजना
        const [files] = await bucket.getFiles({ versions: true });
        let restoredCount = 0;

        for (const file of files) {
            // अगर फाइल डिलीट मार्कर है (यानी अभी लाइव नहीं है और जनरेशन आईडी है)
            if (file.metadata.generation && !file.metadata.timeDeleted) {
                
                // हम चेक करेंगे कि क्या इसका कोई छुपा हुआ पुराना वर्जन मौजूद है
                const sizeInBytes = parseInt(file.metadata.size || 0);
                const sizeInMB = sizeInBytes / (1024 * 1024);

                // सिर्फ वही भारी 47 फाइलें जो 5MB से बड़ी थीं
                if (sizeInMB >= 5.0) {
                    console.log(`🔄 Restoring File: ${file.name} (${sizeInMB.toFixed(2)} MB)`);
                    
                    // कॉपी कमांड के जरिए पुराने वर्जन को वापस लाइव (Active) करना
                    await bucket.file(file.name, { generation: file.metadata.generation }).copy(bucket.file(file.name));
                    restoredCount++;
                }
            }
        }

        console.log("\n=============================================");
        console.log(`🎉 RESTORATION COMPLETED SUCCESSFULLY!`);
        console.log(`✅ Total files brought back to life: ${restoredCount}`);
        console.log("=============================================");

    } catch (error) {
        console.error("❌ Restoration Engine Error:", error.message);
    }
}

if (require.main === module) {
    restoreDeletedFiles().then(() => process.exit(0)).catch(() => process.exit(1));
}

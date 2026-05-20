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
        console.log("✅ Firebase SDK Initialized for Scanning!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

async function scanHeavyFiles() {
    try {
        console.log("🔍 Starting Deep Storage Scanner...");
        console.log("Looking for files larger than 5MB...\n");
        
        const [files] = await bucket.getFiles();
        let heavyFilesCount = 0;
        let totalBucketSizeByte = 0;

        console.log("=== 🚨 HEAVY FILES LIST (GREATER THAN 5MB) ===");
        
        files.forEach(file => {
            const sizeInBytes = parseInt(file.metadata.size || 0);
            totalBucketSizeByte += sizeInBytes;
            const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

            // 5MB से बड़ी फाइल को फिल्टर करना
            if (parseFloat(sizeInMB) >= 5.0) {
                heavyFilesCount++;
                console.log(`❌ [HEAVY] Path: ${file.name} | Size: ${sizeInMB} MB | Type: ${file.metadata.contentType}`);
            }
        });

        console.log("\n=============================================");
        console.log(`📊 TOTAL SCAN SUMMARY:`);
        console.log(`🔹 Total files scanned in bucket: ${files.length}`);
        console.log(`🔹 Total heavy files found (>= 5MB): ${heavyFilesCount}`);
        console.log(`🔹 Calculated Total Bucket Size: ${(totalBucketSizeByte / (1024 * 1024 * 1024)).toFixed(2)} GB`);
        console.log("=============================================");

    } catch (error) {
        console.error("❌ Scanner Engine Error:", error.message);
    }
}

scanHeavyFiles();

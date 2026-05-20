require("dotenv").config();
const admin = require("firebase-admin");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { execSync } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

// 🔐 FIREBASE INITIALIZATION
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "studymaterial-406ad.firebasestorage.app"
        });
        console.log("✅ Firebase Master SDK Initialized!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

async function runGlobalBucketCleaner() {
    try {
        console.log("🚀 Starting Ultimate Global Overwrite & PDF Compressor Engine...");
        
        const [files] = await bucket.getFiles();
        console.log(`📦 Total items found in entire bucket: ${files.length}`);

        // BATCH ENGINE: एक बार में सिर्फ 10 भारी फाइल्स प्रोसेस होंगी ताकि गिटहब टाइमआउट न हो
        let processedCount = 0;
        const MAX_BATCH_SIZE = 10; 

        for (const file of files) {
            if (processedCount >= MAX_BATCH_SIZE) {
                console.log(`🛑 Batch limit of ${MAX_BATCH_SIZE} reached for this run. Stopping to prevent timeout.`);
                break;
            }

            if (file.name.endsWith("/")) continue;

            const ext = path.extname(file.name).toLowerCase();
            const sizeInBytes = parseInt(file.metadata.size || 0);
            const sizeInMB = sizeInBytes / (1024 * 1024);

            // 🛑 स्किप कंडीशन 1: अगर फाइल पर हमारा 'isOptimized' का ठप्पा लगा है, तो उसे तुरंत छोड़ दो!
            if (file.metadata && file.metadata.metadata && file.metadata.metadata.isOptimized === "true") {
                continue;
            }

            // 🗑️ 1. भारी वीडियो फाइल्स को तुरंत डिलीट करना
            if ([".mp4", ".avi", ".mkv", ".mov", ".3gp", ".webm"].includes(ext)) {
                console.log(`🗑️ Deleting video file to clear space: ${file.name}`);
                await file.delete();
                processedCount++;
                continue;
            }

            // 🛑 स्किप कंडीशन 2: अब हर PDF कंप्रेस होगी, सिर्फ webp को स्किप करेंगे। 2MB वाला रूल हटा दिया क्योंकि ठप्पा लगा दिया है।
            if (ext === ".webp") continue;

            const tempLocalPath = path.join(os.tmpdir(), `raw_${Date.now()}${ext}`);
            const tempOutputPath = path.join(os.tmpdir(), `out_${Date.now()}${ext === ".pdf" ? ".pdf" : ".webp"}`);
            
            let targetStoragePath = file.name;
            let contentType = file.metadata.contentType;

            if ([".jpg", ".jpeg", ".png", ".bmp", ".tiff"].includes(ext)) {
                const folderPath = path.dirname(file.name);
                const baseName = path.basename(file.name, ext);
                targetStoragePath = folderPath === "." ? `${baseName}.webp` : `${folderPath}/${baseName}.webp`;
                contentType = "image/webp";
            } else if (ext !== ".pdf") {
                continue; 
            }

            console.log(`--------------------------------------------------`);
            console.log(`⚙️ Overwrite Optimizing [${processedCount + 1}/${MAX_BATCH_SIZE}]: ${file.name} (${sizeInMB.toFixed(2)} MB)`);

            try {
                await file.download({ destination: tempLocalPath });

                if (ext === ".pdf") {
                    // 📄 GHOSTSCRIPT COMPRESSION (HARDCORE SCANNED PDF REDUCTION)
                    console.log(`⚙️ Ghostscript running to compress images inside PDF...`);
                    try {
                        // GitHub Actions me Ghostscript (gs) pehle se hota hai. Ye PDF ke andar ki heavy images ko sikod dega.
                        const gsCommand = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${tempOutputPath}" "${tempLocalPath}"`;
                        execSync(gsCommand);
                    } catch (gsError) {
                        console.log(`⚠️ GS Failed, fallback to normal copy: ${gsError.message}`);
                        fs.copyFileSync(tempLocalPath, tempOutputPath);
                    }
                } else {
                    // 🖼️ IMAGE COMPRESSION
                    await sharp(tempLocalPath)
                        .resize({ width: 1280, withoutEnlargement: true, fit: 'inside' })
                        .webp({ quality: 40 })
                        .toFile(tempOutputPath);
                }

                // 📊 नई फाइल का साइज कैलकुलेट करना
                const newSizeInBytes = fs.statSync(tempOutputPath).size;
                const newSizeInMB = newSizeInBytes / (1024 * 1024);
                const newExt = path.extname(targetStoragePath).toLowerCase() || ext;

                // 📤 ओरिजिनल पाथ पर ओवरराइट करना और 'isOptimized' का ठप्पा लगाना
                await bucket.upload(tempOutputPath, {
                    destination: targetStoragePath,
                    metadata: { 
                        contentType: contentType, 
                        cacheControl: "public, max-age=31536000",
                        metadata: { isOptimized: "true" } // 🔥 यह लाइन सुनिश्चित करेगी कि फाइल दोबारा कभी प्रोसेस न हो
                    }
                });

                if (file.name !== targetStoragePath) {
                    await file.delete();
                    console.log(`🗑️ Original format removed.`);
                }
                
                // 📈 साइज और फॉर्मेट का लाइव रिपोर्ट लॉग प्रिंट करना
                console.log(`✅ Success! Format: [${ext} ➡️ ${newExt}] | Size: [${sizeInMB.toFixed(2)} MB ➡️ ${newSizeInMB.toFixed(2)} MB]`);
                processedCount++;

            } catch (procErr) {
                console.error(`❌ Error processing ${file.name}:`, procErr.message);
            } finally {
                if (fs.existsSync(tempLocalPath)) fs.unlinkSync(tempLocalPath);
                if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
            }
        }

        console.log("🎉 Entire Bucket Overwrite & PDF Compression Completed!");
    } catch (error) {
        console.error("❌ Master Overwrite Engine Error:", error.message);
    }
}

if (require.main === module) {
    runGlobalBucketCleaner().then(() => process.exit(0)).catch(() => process.exit(1));
}

require("dotenv").config();
const admin = require("firebase-admin");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
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
        console.log("🚀 Starting Global Bucket Cleaner & Compressor Engine...");
        
        // 🔍 पूरी बकेट की सभी फाइल्स एक साथ स्कैन करना
        const [files] = await bucket.getFiles();
        console.log(`📦 Total items found in entire bucket: ${files.length}`);

        for (const file of files) {
            if (file.name.endsWith("/")) continue; // फोल्डर्स को स्किप करें

            const ext = path.extname(file.name).toLowerCase();
            const folderPath = path.dirname(file.name);
            const baseName = path.basename(file.name, ext);
            
            // 🛑 1. वीडियो डिलीट करने का लॉजिक (Space Saver)
            if ([".mp4", ".avi", ".mkv", ".mov", ".3gp", ".webm"].includes(ext)) {
                console.log(`🗑️ Deleting heavy video file: ${file.name}`);
                await file.delete();
                continue;
            }

            // 🛑 2. पहले से ऑप्टिमाइज्ड .webp इमेज को स्किप करना
            if (ext === ".webp") {
                continue; 
            }

            const tempLocalPath = path.join(os.tmpdir(), `raw_${Date.now()}${ext}`);
            let targetExt = ext;
            let contentType = file.metadata.contentType;

            // अगर इमेज है तो उसे .webp में बदलेंगे
            if ([".jpg", ".jpeg", ".png", ".bmp", ".tiff"].includes(ext)) {
                targetExt = ".webp";
                contentType = "image/webp";
            } else if (ext !== ".pdf") {
                // अगर इमेज या पीडीएफ नहीं है तो स्किप करें
                continue;
            }

            // नया रिप्लेसमेंट पाथ (उसी फोल्डर में जहाँ पुरानी फाइल थी)
            const targetStoragePath = folderPath === "." ? `${baseName}${targetExt}` : `${folderPath}/${baseName}${targetExt}`;
            const tempOutputPath = path.join(os.tmpdir(), `out_${Date.now()}${targetExt}`);

            console.log(`--------------------------------------------------`);
            console.log(`⚙️ Processing: ${file.name} -> ${targetStoragePath}`);

            try {
                // फाइल डाउनलोड करें
                await file.download({ destination: tempLocalPath });

                if (ext === ".pdf") {
                    // 📄 PDF COMPRESSION & REPLACE
                    console.log(`⚙️ Compressing PDF Document...`);
                    const pdfBytes = fs.readFileSync(tempLocalPath);
                    const pdfDoc = await PDFDocument.load(pdfBytes);
                    const compressedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
                    fs.writeFileSync(tempOutputPath, compressedPdfBytes);
                } else {
                    // 🖼️ IMAGE COMPRESSION & CONVERT TO WEBP
                    console.log(`⚙️ Converting Image to Compressed WebP...`);
                    await sharp(tempLocalPath)
                        .resize({ width: 1280, withoutEnlargement: true, fit: 'inside' })
                        .webp({ quality: 50 })
                        .toFile(tempOutputPath);
                }

                // 📤 नई ऑप्टिमाइज्ड फाइल अपलोड करें
                await bucket.upload(tempOutputPath, {
                    destination: targetStoragePath,
                    metadata: { contentType: contentType, cacheControl: "public, max-age=31536000" }
                });
                console.log(`📤 Uploaded optimized file.`);

                // 🗑️ पुरानी भारी फाइल डिलीट करें (अगर नाम बदल गया है जैसे .png से .webp)
                if (file.name !== targetStoragePath) {
                    await file.delete();
                    console.log(`🗑️ Deleted original heavy file: ${file.name}`);
                }

            } catch (procErr) {
                console.error(`❌ Skip/Error processing ${file.name}:`, procErr.message);
            } finally {
                // 🧹 लोकल सफाई
                if (fs.existsSync(tempLocalPath)) fs.unlinkSync(tempLocalPath);
                if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
            }
        }

        console.log("🎉 Entire Bucket Scanning & Compression Cycle Completed!");
    } catch (error) {
        console.error("❌ Master Cleaner Engine Error:", error.message);
    }
}

if (require.main === module) {
    runGlobalBucketCleaner().then(() => process.exit(0)).catch(() => process.exit(1));
}

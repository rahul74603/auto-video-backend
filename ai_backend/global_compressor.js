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
        console.log("🚀 Starting Ultimate Global Overwrite & PDF Compressor Engine...");
        
        const [files] = await bucket.getFiles();
        console.log(`📦 Total items found in entire bucket: ${files.length}`);

        for (const file of files) {
            if (file.name.endsWith("/")) continue;

            const ext = path.extname(file.name).toLowerCase();
            const sizeInBytes = parseInt(file.metadata.size || 0);
            const sizeInMB = sizeInBytes / (1024 * 1024);

            // 🗑️ 1. भारी वीडियो फाइल्स को तुरंत डिलीट करना
            if ([".mp4", ".avi", ".mkv", ".mov", ".3gp", ".webm"].includes(ext)) {
                console.log(`🗑️ Deleting video file to clear space: ${file.name}`);
                await file.delete();
                continue;
            }

            // 🛑 स्किप कंडीशन: जो फाइलें पहले से 2MB से छोटी हैं, उन्हें दोबारा कंप्रेस नहीं करेंगे (टाइम बचेगा)
            if (sizeInMB < 2.0 && ext === ".pdf") continue;
            if (ext === ".webp") continue;

            const tempLocalPath = path.join(os.tmpdir(), `raw_${Date.now()}${ext}`);
            const tempOutputPath = path.join(os.tmpdir(), `out_${Date.now()}${ext === ".pdf" ? ".pdf" : ".webp"}`);
            
            // अगर इमेज है तो उसे .webp नाम से उसी फोल्डर में रिप्लेस करेंगे
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
            console.log(`⚙️ Overwrite Optimizing: ${file.name} (${sizeInMB.toFixed(2)} MB)`);

            try {
                await file.download({ destination: tempLocalPath });

                if (ext === ".pdf") {
                    // 📄 HARD PDF COMPRESSION & RE-SYNTHESIS
                    console.log(`⚙️ Re-scaling and flattening heavy PDF...`);
                    const pdfBytes = fs.readFileSync(tempLocalPath);
                    const pdfDoc = await PDFDocument.load(pdfBytes);
                    
                    const compressedPdfBytes = await pdfDoc.save({ 
                        useObjectStreams: true,
                        addDefaultPage: false
                    });
                    fs.writeFileSync(tempOutputPath, compressedPdfBytes);
                } else {
                    // 🖼️ IMAGE COMPRESSION
                    await sharp(tempLocalPath)
                        .resize({ width: 1280, withoutEnlargement: true, fit: 'inside' })
                        .webp({ quality: 40 })
                        .toFile(tempOutputPath);
                }

                // 📤 ओरिजिनल पाथ पर ओवरराइट (रिप्लेस) करना
                await bucket.upload(tempOutputPath, {
                    destination: targetStoragePath,
                    metadata: { contentType: contentType, cacheControl: "public, max-age=31536000" }
                });

                // अगर इमेज का एक्सटेंशन बदल गया है (.png से .webp), तो पुरानी...
                if (file.name !== targetStoragePath) {
                    await file.delete();
                    console.log(`🗑️ Original format removed.`);
                }
                console.log(`✅ Successfully replaced with optimized version!`);

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

// 🔥 FIXED: सही फंक्शन नाम को यहाँ कॉल किया गया है
if (require.main === module) {
    runGlobalBucketCleaner().then(() => process.exit(0)).catch(() => process.exit(1));
}

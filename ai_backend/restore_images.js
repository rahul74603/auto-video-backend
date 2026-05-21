require("dotenv").config();
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.SERVICE_ACCOUNT_JSON)),
        storageBucket: "studymaterial-406ad.firebasestorage.app" // 🔥 Storage access ke liye
    });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();
const collectionsToUpdate = ["blogs", "webstories", "posts", "articles", "news"];

async function autoHealLinks() {
    console.log("🚑 STARTING AUTO-HEALER: Checking live Storage for missing images...");
    let totalFixed = 0;

    for (const collectionName of collectionsToUpdate) {
        console.log(`\n📂 Scanning collection: ${collectionName}...`);
        try {
            const snapshot = await db.collection(collectionName).get();
            if (snapshot.empty) continue;

            for (const doc of snapshot.docs) {
                const data = doc.data();
                let needsUpdate = false;

                async function healObject(obj) {
                    if (obj === null || obj === undefined) return obj;

                    if (typeof obj === 'string') {
                        // Agar link me .webp hai, to asli file check karenge
                        if (obj.includes("firebasestorage.googleapis.com") && obj.includes(".webp")) {
                            const match = obj.match(/\/o\/([^?]+)/);
                            if (match) {
                                const filePath = decodeURIComponent(match[1]);
                                try {
                                    const [exists] = await bucket.file(filePath).exists();
                                    if (!exists) {
                                        // WebP nahi mili, matlab ye naya blog hai! Try JPG
                                        const jpgPath = filePath.replace('.webp', '.jpg');
                                        const [jpgExists] = await bucket.file(jpgPath).exists();
                                        if (jpgExists) {
                                            needsUpdate = true;
                                            return obj.replace('.webp', '.jpg'); // Wapas JPG kar diya
                                        } else {
                                            // Try PNG
                                            const pngPath = filePath.replace('.webp', '.png');
                                            const [pngExists] = await bucket.file(pngPath).exists();
                                            if (pngExists) {
                                                needsUpdate = true;
                                                return obj.replace('.webp', '.png'); // Wapas PNG kar diya
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Ignore storage errors
                                }
                            }
                        }
                        return obj;
                    } 
                    else if (Array.isArray(obj)) {
                        const arr = [];
                        for (let i = 0; i < obj.length; i++) {
                            arr.push(await healObject(obj[i]));
                        }
                        return arr;
                    } 
                    else if (typeof obj === 'object') {
                        // Date/Time ko bilkul safe rakhna hai
                        if (obj.constructor && obj.constructor.name === 'Timestamp') return obj;
                        if (('_seconds' in obj && '_nanoseconds' in obj) || ('seconds' in obj && 'nanoseconds' in obj)) return obj;
                        
                        const newObj = {};
                        for (const key in obj) {
                            newObj[key] = await healObject(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                }

                const healedData = await healObject(data);

                if (needsUpdate) {
                    await db.collection(collectionName).doc(doc.id).set(healedData);
                    console.log(`✅ Restored original image format for new post: ${doc.id}`);
                    totalFixed++;
                }
            }
        } catch (err) {
            console.log(`❌ Error in ${collectionName}: ${err.message}`);
        }
    }
    console.log(`\n🎉 AUTO-HEAL COMPLETE! Total ${totalFixed} new posts fixed. PLEASE HARD REFRESH YOUR WEBSITE!`);
}

autoHealLinks();

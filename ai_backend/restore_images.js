require("dotenv").config();
const admin = require("firebase-admin");

if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin SDK Initialized!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const db = admin.firestore();

// 🔥 YAHAN APNE DATABASE COLLECTIONS KE NAAM HAIN (Aapki site ke liye common naam daal diye hain)
const collectionsToUpdate = ["blogs", "webstories", "posts", "articles", "news"]; 

async function updateLinks() {
    console.log("🚀 Starting Database Update: Replacing .jpg/.png with .webp...");
    let totalUpdated = 0;

    for (const collectionName of collectionsToUpdate) {
        console.log(`\n📂 Scanning collection: ${collectionName}...`);
        try {
            const snapshot = await db.collection(collectionName).get();
            if (snapshot.empty) {
                console.log(`⚠️ No data found in ${collectionName}.`);
                continue;
            }

            for (const doc of snapshot.docs) {
                const data = doc.data();
                let needsUpdate = false;

                // 🔄 Recursive function jo database ke andar har jagah photo ke link dhundhega
                function replaceImageExt(obj) {
                    if (typeof obj === 'string') {
                        if (obj.includes('.jpg') || obj.includes('.png') || obj.includes('.jpeg') || 
                            obj.includes('.JPG') || obj.includes('.PNG')) {
                            needsUpdate = true;
                            return obj.replace(/\.jpg/gi, '.webp')
                                      .replace(/\.jpeg/gi, '.webp')
                                      .replace(/\.png/gi, '.webp');
                        }
                        return obj;
                    } else if (Array.isArray(obj)) {
                        return obj.map(item => replaceImageExt(item));
                    } else if (obj !== null && typeof obj === 'object') {
                        const newObj = {};
                        for (const key in obj) {
                            newObj[key] = replaceImageExt(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                }

                const updatedData = replaceImageExt(data);

                if (needsUpdate) {
                    await db.collection(collectionName).doc(doc.id).set(updatedData);
                    console.log(`✅ Fixed photo links in document: ${doc.id}`);
                    totalUpdated++;
                }
            }
        } catch (err) {
            console.log(`❌ Error scanning ${collectionName}: ${err.message}`);
        }
    }
    console.log(`\n🎉 DONE! Total ${totalUpdated} posts/stories updated with .webp photos.`);
}

updateLinks();

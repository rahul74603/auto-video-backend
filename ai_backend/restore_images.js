require("dotenv").config();
const admin = require("firebase-admin");

if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin SDK Initialized for EMERGENCY REPAIR!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const db = admin.firestore();
const collectionsToUpdate = ["blogs", "webstories", "posts", "articles", "news"]; 

async function emergencyFix() {
    console.log("🚨 Starting Emergency Repair: Fixing 'Invalid Date' and Broken Image Links...");
    let totalFixed = 0;

    for (const collectionName of collectionsToUpdate) {
        console.log(`\n📂 Scanning collection: ${collectionName}...`);
        try {
            const snapshot = await db.collection(collectionName).get();
            if (snapshot.empty) continue;

            for (const doc of snapshot.docs) {
                const data = doc.data();
                let needsUpdate = false;

                function fixData(obj) {
                    if (obj === null || obj === undefined) return obj;

                    if (typeof obj === 'object') {
                        if (Array.isArray(obj)) {
                            return obj.map(item => fixData(item));
                        }

                        // 🔥 FIX 1: RESTORE BROKEN DATES (Invalid Date Error)
                        if (('_seconds' in obj && '_nanoseconds' in obj) || ('seconds' in obj && 'nanoseconds' in obj)) {
                            needsUpdate = true;
                            const sec = obj._seconds !== undefined ? obj._seconds : obj.seconds;
                            const nano = obj._nanoseconds !== undefined ? obj._nanoseconds : obj.nanoseconds;
                            return new admin.firestore.Timestamp(sec, nano); // Converting back to original Firebase Date Format
                        }

                        const newObj = {};
                        for (const key in obj) {
                            // 🔥 FIX 2: REPAIR BROKEN .webp IMAGE TOKENS
                            if (typeof obj[key] === 'string' && obj[key].includes('firebasestorage') && obj[key].includes('.webp') && obj[key].includes('token=')) {
                                needsUpdate = true;
                                // Remove the old invalid token that is blocking the image
                                newObj[key] = obj[key].replace(/&token=[^&]+/, '').replace(/\?token=[^&]+$/, '');
                            } else {
                                newObj[key] = fixData(obj[key]);
                            }
                        }
                        return newObj;
                    }
                    return obj;
                }

                const fixedData = fixData(data);

                if (needsUpdate) {
                    await db.collection(collectionName).doc(doc.id).set(fixedData);
                    console.log(`✅ Fixed Date/Image in document: ${doc.id}`);
                    totalFixed++;
                }
            }
        } catch (err) {
            console.log(`❌ Error in ${collectionName}: ${err.message}`);
        }
    }
    console.log(`\n🎉 EMERGENCY REPAIR DONE! Total ${totalFixed} posts fixed. PLEASE HARD REFRESH YOUR WEBSITE!`);
}

emergencyFix();

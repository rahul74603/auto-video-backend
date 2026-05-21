require("dotenv").config();
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.SERVICE_ACCOUNT_JSON))
    });
}

const db = admin.firestore();
const collectionsToUpdate = ["blogs", "webstories", "posts", "articles", "news"];

async function fixFinalLinks() {
    console.log("🚀 FINAL FIX: Converting Raw GCS Links to Firebase Public Links...");
    let totalFixed = 0;

    for (const collectionName of collectionsToUpdate) {
        console.log(`\n📂 Scanning collection: ${collectionName}...`);
        try {
            const snapshot = await db.collection(collectionName).get();
            if (snapshot.empty) continue;

            for (const doc of snapshot.docs) {
                const data = doc.data();
                let needsUpdate = false;

                function fixLinksInObject(obj) {
                    if (obj === null || obj === undefined) return obj;

                    if (typeof obj === 'string') {
                        let original = obj;
                        
                        // 🔥 FIX: Raw storage links ko Firebase Public links me badalna
                        if (original.includes("storage.googleapis.com/studymaterial-406ad.firebasestorage.app")) {
                            original = original.replace(/https:\/\/storage\.googleapis\.com\/studymaterial-406ad\.firebasestorage\.app\/([^"'\s>]+)/g, (match, path) => {
                                const cleanPath = path.split('?')[0]; 
                                return `https://firebasestorage.googleapis.com/v0/b/studymaterial-406ad.firebasestorage.app/o/${encodeURIComponent(cleanPath)}?alt=media`;
                            });
                            needsUpdate = true;
                        }
                        
                        // Security check: Agar koi firebase link hai jisme ?alt=media missing hai
                        if (original.includes("firebasestorage.googleapis.com") && !original.includes("alt=media")) {
                            original = original.replace(/(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/studymaterial-406ad\.firebasestorage\.app\/o\/[^"'\s>?]+)/g, "$1?alt=media");
                            needsUpdate = true;
                        }

                        return original;
                    } 
                    else if (Array.isArray(obj)) {
                        return obj.map(item => fixLinksInObject(item));
                    } 
                    else if (typeof obj === 'object') {
                        // 🛑 Dates (Timestamps) ko bilkul nahi chhedna hai (Pichli galti se seekh)
                        if (obj.constructor && obj.constructor.name === 'Timestamp') return obj;
                        if (('_seconds' in obj && '_nanoseconds' in obj) || ('seconds' in obj && 'nanoseconds' in obj)) return obj;
                        
                        const newObj = {};
                        for (const key in obj) {
                            newObj[key] = fixLinksInObject(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                }

                const fixedData = fixLinksInObject(data);

                if (needsUpdate) {
                    await db.collection(collectionName).doc(doc.id).set(fixedData);
                    console.log(`✅ Fixed format in document: ${doc.id}`);
                    totalFixed++;
                }
            }
        } catch (err) {
            console.log(`❌ Error in ${collectionName}: ${err.message}`);
        }
    }
    console.log(`\n🎉 PERFECT! Total ${totalFixed} posts updated to Official Firebase Links. PLEASE HARD REFRESH YOUR WEBSITE!`);
}

fixFinalLinks();

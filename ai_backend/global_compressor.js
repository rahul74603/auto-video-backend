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
        console.log("✅ Firebase SDK Initialized for EXACT RECOVERY!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

// 🔥 सिर्फ और सिर्फ यही 47 फाइल्स रिकवर होंगी, बाकी कुछ नहीं!
const EXACT_FILES_TO_RESTORE = [
    "job_notifications/1774626642104_BEL-SET-Notification-2026-indgovtjobs.pdf",
    "job_notifications/1774838737119_SSB Sub Inspector Notification 2026 Copy.pdf",
    "job_notifications/draft_1774969396198_SSF-Constable-Tradesman-Notification-2026-indgovtjobs.pdf",
    "job_notifications/draft_1775400913144_Rampur Raza Library Notification 2026.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Computer Awareness set 1.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Computer Awareness set 2.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Economics set 3 Hunger Index, Happiness Index.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Economics set 4 Indian Share Market & Financial Institutions.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Economics set 5 Budget, Government Schemes & Miscellaneous.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 1 Ancient & Medieval Indian History.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 10 Emergency, Commissions & Important Articles.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 2 Modern India & National Movement.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 3 Indian Geography.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 4 Agriculture & Resources.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 5 Solar System & World Geography.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 6 Indian Polity.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 7 Fundamental Rights, Duties & DPSP.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 8 President, Vice-President & Parliament.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GK set 9 Judiciary, Governor & Panchayati Raj.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 1 Physics_ Units & Measurements .pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 10 chemistry Fuels, Glass, Fertilizers & Explosives.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 11 Biology Cell & Tissue.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 12 Biology Digestive System and Respiratory System.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 13 Biology Blood & Circulatory System.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 14 Biology Vitamins, Nutrients & Human Diseases.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 15 Biology Plant Kingdom & Miscellaneous.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 2 Motion, Force & Work .pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 3 Properties of Matter & Heat .pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 4 Light & Sound.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 5 Electricity & Magnetism.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 6 chemistry Matter & Atomic Structure.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 7 chemistry Acids, Bases & Salts.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 8 chemistry Metals, Non-metals & Alloys.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway GS set 9 chemistry Periodic Table & Inert Gases.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Indian Economics set 1 Basic Concepts, National Income & Planning.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Indian Economics set 2 Banking, Currency & Taxation.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Sports & Awards set 15.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Sports & Awards set 16 Other Sports, Stadiums & Personalities.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Sports & Awards set 17 Cricket, Hockey & Football Special.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Sports & Awards set 18 Global Honors.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway Sports & Awards set 19 Major Honors.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway current Affairs set 11.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway special GK set 11 Currencies & Capitals.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway special GK set 12 India Firsts.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway special GK set 13 World Firsts.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway special GK set 14 International Boundaries.pdf",
    "premium_content/KuCwULFEum71NBF8r5VJ/Railway static GK set 20 Inventions & Scientific Instruments.pdf"
];

async function exactRecoveryEngine() {
    try {
        console.log("🚀 Starting Exact 47 Files Recovery...");
        
        // केवल सॉफ्ट-डिलीटेड फाइल्स ढूंढ रहे हैं
        const [files] = await bucket.getFiles({ softDeleted: true });
        let restoredCount = 0;

        for (const file of files) {
            // अगर यह फाइल हमारी लिस्ट में मौजूद है और डिलीटेड है
            if (EXACT_FILES_TO_RESTORE.includes(file.name) && file.metadata && file.metadata.timeDeleted) {
                console.log(`🔄 Downloading & Re-uploading: ${file.name}`);
                
                try {
                    // 1. फाइल को उसके जनरेशन आईडी से सीधे मेमोरी (Buffer) में डाउनलोड करो
                    const [fileBuffer] = await bucket.file(file.name, { generation: file.metadata.generation }).download();
                    
                    // 2. डाउनलोड हुई मेमोरी फाइल को वापस नया (Active) बनाकर सेव कर दो
                    await bucket.file(file.name).save(fileBuffer, {
                        metadata: { contentType: 'application/pdf', cacheControl: "public, max-age=31536000" }
                    });
                    
                    console.log(`✅ Success: ${file.name}`);
                    restoredCount++;
                } catch (err) {
                    console.log(`❌ Error restoring ${file.name}: ${err.message}`);
                }
            }
        }

        console.log("\n=============================================");
        console.log(`🎉 47 FILES RECOVERY COMPLETED!`);
        console.log(`✅ Total files brought back online: ${restoredCount}`);
        console.log("=============================================");

    } catch (error) {
        console.error("❌ Recovery Engine Error:", error.message);
    }
}

if (require.main === module) {
    exactRecoveryEngine().then(() => process.exit(0)).catch(() => process.exit(1));
}

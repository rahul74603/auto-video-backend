require("dotenv").config();
const admin = require("firebase-admin");

// 🔐 FIREBASE INITIALIZATION
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(serviceAccountVar)),
            storageBucket: "studymaterial-406ad.firebasestorage.app"
        });
        console.log("✅ SDK Initialized for BRUTE-FORCE RECOVERY!");
    } else {
        throw new Error("❌ SERVICE_ACCOUNT_JSON missing!");
    }
}

const bucket = admin.storage().bucket();

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

async function forceBufferRestore() {
    console.log("🚀 Starting BRUTE-FORCE Recovery...");
    try {
        // यह बिना किसी कंडीशन के बकेट का पूरा इतिहास (वर्शन्स) ले आएगा
        const [files] = await bucket.getFiles({ versions: true });
        let restoredSet = new Set();

        for (const file of files) {
            // अगर फाइल लिस्ट में है और अब तक रिस्टोर नहीं हुई है
            if (EXACT_FILES_TO_RESTORE.includes(file.name) && !restoredSet.has(file.name)) {
                
                const size = parseInt(file.metadata.size || 0);
                
                // 0 byte के कचरे (डिलीट मार्कर) को इग्नोर करो, असली डेटा (1MB से ऊपर) पकड़ो
                if (size > 1048576) {
                    console.log(`⏳ Downloading original data for: ${file.name} (${(size/1024/1024).toFixed(2)} MB)`);
                    
                    try {
                        // 1. पुराने असली वर्जन को मेमोरी में डाउनलोड करो
                        const [buffer] = await file.download();
                        
                        // 2. उसी नाम से उसे लाइव बकेट में बिलकुल नई फाइल की तरह सेव कर दो
                        await bucket.file(file.name).save(buffer, {
                            metadata: { contentType: "application/pdf" }
                        });
                        
                        restoredSet.add(file.name);
                        console.log(`✅ Restored Successfully!`);
                    } catch (err) {
                        console.log(`❌ Failed: ${err.message}`);
                    }
                }
            }
        }
        console.log(`\n🎉 JOB DONE! Brought back ${restoredSet.size} out of 47 files.`);
    } catch (e) {
        console.error("Crash:", e.message);
    }
}

if (require.main === module) {
    forceBufferRestore().then(() => process.exit(0)).catch(() => process.exit(1));
}

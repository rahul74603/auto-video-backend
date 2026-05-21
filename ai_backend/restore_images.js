require("dotenv").config();
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.SERVICE_ACCOUNT_JSON))
    });
}

async function checkBrokenLink() {
    const db = admin.firestore();
    // Aapne jo blog ka link bheja, hum ussi ka X-Ray kar rahe hain
    const docId = "latest-update-master-english-grammar-ultimate-hacks-for-competitive-exam-success-may-2026";
    const doc = await db.collection("blogs").doc(docId).get();
    
    if (doc.exists) {
        const data = doc.data();
        console.log("\n🚨 DIAGNOSIS REPORT FOR:", docId);
        
        // Ye code sirf aapke toote huye photo ke links ko terminal me print karega
        function scan(obj, path = "") {
            if (typeof obj === 'string') {
                if (obj.includes("firebasestorage") || obj.includes(".webp")) {
                    console.log(`\n📌 [${path}] =>`, obj);
                }
            } else if (typeof obj === 'object' && obj !== null) {
                for (let k in obj) {
                    scan(obj[k], path ? `${path}.${k}` : k);
                }
            }
        }
        scan(data);
        console.log("\n✅ Bhai bas ye terminal ka output mujhe copy karke bhej do!");
    } else {
        console.log("❌ Document nahi mila.");
    }
}
checkBrokenLink();

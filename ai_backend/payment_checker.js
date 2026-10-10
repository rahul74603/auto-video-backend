const admin = require("firebase-admin");
const { google } = require("googleapis");
require("dotenv").config();

const {
    DEFAULT_ALERT_SENDERS,
    MATCH_WINDOW_MS,
    EXPIRE_AFTER_MS,
    matchTransaction,
    buildGmailQuery,
} = require("./payment_matcher");

// ✅ Firebase Admin Initialization
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
    } else {
        admin.initializeApp();
    }
}
const db = admin.firestore();

exports.checkPayments = async () => {
    console.log("🚀 Starting Automatic Payment Checker...");

    const credentialsVar = process.env.GMAIL_CREDENTIALS;
    const tokenVar = process.env.PAYMENT_GMAIL_TOKEN;

    if (!credentialsVar || !tokenVar) {
        console.error("❌ Missing GMAIL_CREDENTIALS or PAYMENT_GMAIL_TOKEN in Secrets!");
        return;
    }

    try {
        const creds = JSON.parse(credentialsVar);
        const token = JSON.parse(tokenVar);
        const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;

        const oAuth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirect_uris ? redirect_uris[0] : "https://developers.google.com/oauthplayground"
        );

        oAuth2Client.setCredentials(token);
        const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

        const pendingSnapshot = await db.collection("purchases").where("status", "==", "pending").get();
        if (pendingSnapshot.empty) {
            console.log("✅ No pending payments.");
            return;
        }

        // 🔧 Multiple bank senders supported via PAYMENT_ALERT_SENDERS (comma separated)
        const senders = (process.env.PAYMENT_ALERT_SENDERS || DEFAULT_ALERT_SENDERS.join(","))
            .split(",").map((s) => s.trim()).filter(Boolean);
        const gmailQuery = buildGmailQuery(senders);
        console.log(`📬 Gmail query: ${gmailQuery}`);

        const res = await gmail.users.messages.list({
            userId: "me",
            q: gmailQuery,
            maxResults: 100,
        });

        const messages = res.data.messages || [];
        const bankTransactions = [];

        for (const msg of messages) {
            const emailData = await gmail.users.messages.get({ userId: "me", id: msg.id });
            let fullText = "";

            // ✅ Recursive Scraper: विज्ञापन और बैनर के पीछे छिपे टेक्स्ट को निकालने के लिए
            const extractText = (part) => {
                if (part.parts) {
                    part.parts.forEach(extractText);
                }
                if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
                    if (part.body && part.body.data) {
                        fullText += Buffer.from(part.body.data, 'base64').toString('utf-8') + " ";
                    }
                }
            };

            if (emailData.data.payload) {
                extractText(emailData.data.payload);
            }

            // ✅ HTML टैग्स हटाना और क्लीन टेक्स्ट बनाना
            fullText = fullText.replace(/<[^>]*>?/gm, ' ') || emailData.data.snippet || "";

            bankTransactions.push({
                id: msg.id,
                text: fullText,
                time: parseInt(emailData.data.internalDate, 10),
                isUsed: false
            });
        }

        for (const doc of pendingSnapshot.docs) {
            const purchase = doc.data();
            const expectedAmount = Number(purchase.amount).toFixed(2);
            let purchaseTime = (purchase.timestamp && typeof purchase.timestamp.toDate === 'function') ?
                               purchase.timestamp.toDate().getTime() :
                               new Date(purchase.timestamp).getTime();

            console.log(`\n🔎 CHECKING: Amount ${expectedAmount} for User ${purchase.userEmail}${purchase.utr ? ` (UTR: ${purchase.utr})` : ""}`);

            // 🗑️ Fix: पुरानी requests को delete करने के बजाय "expired" mark करो —
            //    पैसा आया तो history रहेगी, admin/user को record दिखेगा।
            if (Date.now() - purchaseTime > EXPIRE_AFTER_MS) {
                await db.collection("purchases").doc(doc.id).update({
                    status: "expired",
                    expiredAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`⌛ Marked expired (>${EXPIRE_AFTER_MS / 3600000}h old): ${expectedAmount}`);
                continue;
            }

            let isMatchFound = false;

            for (const tx of bankTransactions) {
                if (tx.isUsed) continue;

                // 🔒 Accuracy fix: सिर्फ CREDIT alerts match होंगे (debit alerts skip),
                //    amount exact-parse से compare होगा, UTR मिला तो वो भी strong match।
                const result = matchTransaction({
                    emailText: tx.text,
                    emailTimeMs: tx.time,
                    purchaseTimeMs: purchaseTime,
                    expectedAmount,
                    utr: purchase.utr,
                });

                if (!result.matched) {
                    // DEBUG: सिर्फ amount पास-पास दिखे तो log
                    if (tx.text.includes(expectedAmount)) {
                        const timeDiff = Math.abs(tx.time - purchaseTime);
                        console.log(`--- Near Match (rejected) ---`);
                        console.log(`💰 Amount text seen | Time Diff: ${Math.round(timeDiff / 60000)} mins | Window: ${MATCH_WINDOW_MS / 3600000}h`);
                        console.log(`📧 Email Snippet: ${tx.text.substring(0, 150).replace(/\n/g, ' ')}`);
                    }
                    continue;
                }

                const usedCheck = await db.collection("purchases").where("emailMessageId", "==", tx.id).get();
                if (!usedCheck.empty) { tx.isUsed = true; continue; }

                console.log(`✅ SUCCESS! Matching credit email found (via ${result.via}).`);
                tx.isUsed = true;

                await db.collection("purchases").doc(doc.id).update({
                    status: "completed",
                    emailMessageId: tx.id,
                    verifiedVia: result.via,
                    unlockedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                if (purchase.userId && purchase.courseId) {
                    await db.collection("users").doc(purchase.userId).set({
                        [`purchased_${purchase.courseId}`]: true,
                        lastPurchaseDate: new Date().toISOString()
                    }, { merge: true });
                }

                isMatchFound = true;
                break;
            }

            if (!isMatchFound) {
                console.log(`❌ Still No Match for ${expectedAmount}`);
            }
        }
    } catch (error) {
        console.error("❌ Payment Checker Error:", error.message);
    }
};

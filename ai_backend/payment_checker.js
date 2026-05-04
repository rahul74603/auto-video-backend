// @ts-nocheck
const admin = require("firebase-admin");
const { google } = require("googleapis");
require("dotenv").config();

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

        const res = await gmail.users.messages.list({
            userId: "me",
            q: "from:alert@mail.uco.bank.in",
            maxResults: 50,
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
                time: parseInt(emailData.data.internalDate),
                isUsed: false 
            });
        }

        for (const doc of pendingSnapshot.docs) {
            const purchase = doc.data();
            const expectedAmount = Number(purchase.amount).toFixed(2);
            let purchaseTime = (typeof purchase.timestamp.toDate === 'function') ? 
                               purchase.timestamp.toDate().getTime() : 
                               new Date(purchase.timestamp).getTime();

            console.log(`\n🔎 CHECKING: Amount ${expectedAmount} for User ${purchase.userEmail}`);

            // ✅ Junk Cleanup: 2 घंटे से पुराना डेटा हटाना
            if (Date.now() - purchaseTime > 2 * 60 * 60 * 1000) {
                await db.collection("purchases").doc(doc.id).delete();
                console.log(`🗑️ Deleted junk request: ${expectedAmount}`);
                continue;
            }

            let isMatchFound = false;

            for (const tx of bankTransactions) {
                // ✅ Regex Match
                const strictExpectedAmount = expectedAmount.replace('.', '\\.');
                const amountRegex = new RegExp(`${strictExpectedAmount}`, "i");
                const isAmountMatch = amountRegex.test(tx.text);

                // ✅ Time Match (120 min buffer)
                const timeDifference = Math.abs(tx.time - purchaseTime);
                // ✅ टाइम बफर को बढ़ाकर 24 घंटे (1440 मिनट) कर दिया है ताकि UTC/IST का फर्क खत्म हो जाए
                 const isTimeMatch = timeDifference <= 24 * 60 * 60 * 1000;

                // 🔴 DEBUG LOGS: यहाँ से पता चलेगा गड़बड़ कहाँ है
                if (isAmountMatch || timeDifference < 180 * 60 * 1000) {
                    console.log(`--- Potential Match Found ---`);
                    console.log(`💰 Expected: ${expectedAmount} | In Email: ${isAmountMatch ? 'YES' : 'NO'}`);
                    console.log(`⏰ Time Diff: ${Math.round(timeDifference / 60000)} mins | Match: ${isTimeMatch ? 'YES' : 'NO'}`);
                    console.log(`📧 Email Snippet: ${tx.text.substring(0, 150).replace(/\n/g, ' ')}`);
                }

                if (isAmountMatch && isTimeMatch) {
                    if (tx.isUsed) continue;
                    const usedCheck = await db.collection("purchases").where("emailMessageId", "==", tx.id).get();
                    if (!usedCheck.empty) { tx.isUsed = true; continue; }

                    console.log(`✅ SUCCESS! Matching Email Found.`);
                    tx.isUsed = true;
                    
                    await db.collection("purchases").doc(doc.id).update({
                        status: "completed",
                        emailMessageId: tx.id,
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
            }

            if (!isMatchFound) {
                console.log(`❌ Still No Match for ${expectedAmount}`);
            }
        }
    } catch (error) {
        console.error("❌ Payment Checker Error:", error.message);
    }
};

// @ts-nocheck
const admin = require("firebase-admin");
const { google } = require("googleapis");
require("dotenv").config();

// ✅ Firebase Admin Initialization using Secrets
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
    
    // ✅ OAuth2 Setup using Combined Secrets
    const credentialsVar = process.env.GMAIL_CREDENTIALS;
    const tokenVar = process.env.PAYMENT_GMAIL_TOKEN;

    if (!credentialsVar || !tokenVar) {
        console.error("❌ Missing GMAIL_CREDENTIALS or PAYMENT_GMAIL_TOKEN in Secrets!");
        return; // अब यह सिर्फ फंक्शन को रोकेगा, ऐप क्रैश नहीं करेगा
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

        // ✅ Token object includes the refresh_token we generated
        oAuth2Client.setCredentials(token);
        const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

        const pendingSnapshot = await db.collection("purchases").where("status", "==", "pending").get();
        if (pendingSnapshot.empty) {
            console.log("✅ No pending payments.");
            return;
        }

      // ✅ 1. Email Limit 15 से 50 कर दी गई है
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
            
            // ✅ Smart Recursive Function: ईमेल की हर अंदरूनी लेयर (Banners/Images के पीछे) से टेक्स्ट निकालने के लिए
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
            
            // ✅ HTML टैग्स को हटा रहे हैं ताकि Regex को अमाउंट ढूँढने में दिक्कत ना हो
            fullText = fullText.replace(/<[^>]*>?/gm, ' ') || emailData.data.snippet || "";

            bankTransactions.push({ 
                id: msg.id, // ✅ 2. Message ID सेव कर रहे हैं
                text: fullText, 
                time: parseInt(emailData.data.internalDate),
                isUsed: false // डुप्लीकेट प्रोटेक्शन के लिए
            });
        }
    for (const doc of pendingSnapshot.docs) {
            const purchase = doc.data();
            const expectedAmount = Number(purchase.amount).toFixed(2);
            let purchaseTime = (typeof purchase.timestamp.toDate === 'function') ? purchase.timestamp.toDate().getTime() : new Date(purchase.timestamp).getTime();

            // ✅ 3. Junk Cleanup: 2 घंटे (7200000 ms) से पुराना फेक/पेंडिंग पेमेंट डिलीट करें
            const currentTime = Date.now();
            if (currentTime - purchaseTime > 2 * 60 * 60 * 1000) {
                await db.collection("purchases").doc(doc.id).delete();
                console.log(`🗑️ Deleted expired junk request for Amount: ${expectedAmount}`);
                continue;
            }

            let isMatchFound = false;

            for (const tx of bankTransactions) {
                // ✅ 4. Strict Amount Match (सिर्फ 199.01 को पकड़ेगा, 1199.01 को नहीं)
                const strictExpectedAmount = expectedAmount.replace('.', '\\.');
                const amountRegex = new RegExp(`\\b${strictExpectedAmount}\\b`, "i");
                const isAmountMatch = amountRegex.test(tx.text);

                const timeDifference = Math.abs(tx.time - purchaseTime);
                const isTimeMatch = timeDifference <= 60 * 60 * 1000;

                if (isAmountMatch && isTimeMatch) {
                    // ✅ 5. Duplicate Protection: चेक करें कि ये ईमेल पहले यूज़ तो नहीं हुआ
                    if (tx.isUsed) continue;
                    const usedCheck = await db.collection("purchases").where("emailMessageId", "==", tx.id).get();
                    if (!usedCheck.empty) {
                        tx.isUsed = true;
                        continue;
                    }

                    console.log(`✅ MATCH FOUND! Amount: ${expectedAmount}`);
                    tx.isUsed = true;
                    
                    await db.collection("purchases").doc(doc.id).update({
                        status: "completed",
                        emailMessageId: tx.id, // Email का ID सेव कर दिया
                        unlockedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    if (purchase.userId && purchase.courseId) {
                        const userRef = db.collection("users").doc(purchase.userId);
                        await userRef.set({
                            [`purchased_${purchase.courseId}`]: true,
                            lastPurchaseDate: new Date().toISOString()
                        }, { merge: true });
                        console.log(`🎉 Course ${purchase.courseId} auto-unlocked for User: ${purchase.userId}`);
                    }

                    isMatchFound = true;
                    break;
                }
            }

            if (!isMatchFound) {
                console.log(`⏳ No match for Amount: ${expectedAmount}`);
            }
        }
    } catch (error) {
        console.error("❌ Payment Checker Error:", error.message);
    }
};

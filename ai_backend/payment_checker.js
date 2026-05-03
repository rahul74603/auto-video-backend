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

        // पिछले 15 ईमेल्स मंगा रहे हैं
        const res = await gmail.users.messages.list({
            userId: "me",
            q: "from:alert@mail.uco.bank.in",
            maxResults: 15,
        });

        const messages = res.data.messages || [];
        const bankTransactions = [];
        
        for (const msg of messages) {
            const emailData = await gmail.users.messages.get({ userId: "me", id: msg.id });
            
            // ✅ Full Email Body Extraction Logic
            let fullText = "";
            const payload = emailData.data.payload;
            
            if (payload) {
                if (payload.parts) {
                    for (let part of payload.parts) {
                        if ((part.mimeType === 'text/plain' || part.mimeType === 'text/html') && part.body && part.body.data) {
                            fullText += Buffer.from(part.body.data, 'base64').toString('utf-8');
                        }
                    }
                } else if (payload.body && payload.body.data) {
                    fullText = Buffer.from(payload.body.data, 'base64').toString('utf-8');
                }
            }
            
            // अगर बॉडी न मिले तो बैकअप के लिए स्निपेट इस्तेमाल करेंगे
            fullText = fullText || emailData.data.snippet || "";

            bankTransactions.push({ 
                text: fullText, 
                time: parseInt(emailData.data.internalDate) 
            });
        }

        for (const doc of pendingSnapshot.docs) {
            const purchase = doc.data();
            const expectedAmount = Number(purchase.amount).toFixed(2); 
            let purchaseTime = (typeof purchase.timestamp.toDate === 'function') ? purchase.timestamp.toDate().getTime() : new Date(purchase.timestamp).getTime();

            let isMatchFound = false;

            for (const tx of bankTransactions) {
                // ✅ Amount Match: Rs.5.49 या सिर्फ 5.49 को ढूंढना
                const amountRegex = new RegExp(`${expectedAmount}`, "i");
                const isAmountMatch = amountRegex.test(tx.text);

                // ✅ Time Match: बफर 60 मिनट (60 * 60 * 1000 ms)
                const timeDifference = Math.abs(tx.time - purchaseTime);
                const isTimeMatch = timeDifference <= 60 * 60 * 1000;

                if (isAmountMatch && isTimeMatch) {
                    console.log(`✅ MATCH FOUND! Amount: ${expectedAmount}`);
                    
                    // 1. Purchase का स्टेटस अपडेट करें
                    await db.collection("purchases").doc(doc.id).update({
                        status: "completed",
                        unlockedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // 2. यूजर के अकाउंट में कोर्स अनलॉक करें
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
                console.log(`⏳ No match for Amount: ${expectedAmount} (Check if email received in last 60 mins)`);
            }
        }
    } catch (error) {
        console.error("❌ Payment Checker Error:", error.message);
    }
};

checkPayments();
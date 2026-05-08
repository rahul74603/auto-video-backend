require("dotenv").config();
const admin = require("firebase-admin");
const axios = require("axios");
const { google } = require("googleapis");
const xml2js = require("xml2js");

// ✅ GitHub Secrets + Firebase Compatible Initialization
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
        console.log("✅ Firebase initialized for Indexing");
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore(); // 🔥 डेटाबेस इनिशियलाइज़ किया
const WEBSITE_URL = "https://studygyaan.in";

// ✅ Google Indexing API Setup using Secrets
const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
let indexing;

if (serviceAccountVar) {
    const credentials = JSON.parse(serviceAccountVar);
    const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ["https://www.googleapis.com/auth/indexing"],
    });
    indexing = google.indexing({
        version: "v3",
        auth: auth,
    });
}

/**
 * 🔥 Smart Sitemap Indexing (Only Unindexed URLs)
 */
const runSitemapIndexing = async () => {
    console.log("🚀 Starting Smart Google Indexing Process...");
    
    try {
        if (!indexing) {
            throw new Error("Indexing API not initialized. Check SERVICE_ACCOUNT_JSON.");
        }

        // 1. Fetch Sitemap from Website
        const sitemapUrl = `${WEBSITE_URL}/sitemap.xml`;
        console.log(`📡 Fetching Sitemap: ${sitemapUrl}`);
        
        const response = await axios.get(sitemapUrl, { timeout: 30000 });
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        
        if (!result.urlset || !result.urlset.url) {
            throw new Error("Invalid Sitemap format or no URLs found.");
        }

        const allUrls = result.urlset.url.map(u => u.loc[0]);
        console.log(`📊 Total URLs in Sitemap: ${allUrls.length}`);

        // 2. 🔥 Memory System: Firestore से पुरानी हिस्ट्री मंगाना
        const historyRef = db.collection("system_configs").doc("indexing_history");
        const historyDoc = await historyRef.get();
        let alreadyIndexedUrls = historyDoc.exists ? historyDoc.data().urls || [] : [];

        // 3. 🔥 Filter: सिर्फ वो लिंक्स निकालो जो पहले कभी नहीं भेजे गए
        const newUnindexedUrls = allUrls.filter(url => !alreadyIndexedUrls.includes(url));
        console.log(`🔍 Found ${newUnindexedUrls.length} NEW URLs that need indexing.`);

        if (newUnindexedUrls.length === 0) {
            console.log("✅ All URLs are already submitted. No new links to index today.");
            return 0; // काम खत्म, कोई कोटा बर्बाद नहीं
        }

        // 4. Process URLs (Daily Limit set to 150)
        let count = 0;
        let successfulUrls = [];
        const urlsToProcess = newUnindexedUrls.slice(0, 150); 

        console.log(`⚙️ Pushing ${urlsToProcess.length} URLs to Google...`);

        for (const url of urlsToProcess) { 
            try {
                await indexing.urlNotifications.publish({
                    requestBody: {
                        url: url,
                        type: "URL_UPDATED",
                    },
                });
                count++;
                successfulUrls.push(url); // सफल हुए लिंक्स को लिस्ट में डालो
                
                // Rate limit बचाने के लिए 500ms का ब्रेक
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
                console.error(`❌ Error pushing ${url}:`, err.message);
            }
        }

        // 5. 🔥 Update Memory: जो लिंक्स आज भेजे गए, उन्हें हिस्ट्री में सेव कर दो
        if (successfulUrls.length > 0) {
            let updatedHistory = [...alreadyIndexedUrls, ...successfulUrls];
            
            // Firestore डॉक्यूमेंट साइज़ (1MB) न भरे, इसलिए सिर्फ ताज़ा 5000 लिंक्स याद रखेंगे
            if (updatedHistory.length > 5000) {
                updatedHistory = updatedHistory.slice(updatedHistory.length - 5000);
            }
            
            await historyRef.set({ urls: updatedHistory }, { merge: true });
            console.log("💾 Indexing History updated in Database.");
        }

        console.log(`🎯 Indexing Task Completed! ${count} NEW URLs pushed to Google.`);
        return count;

    } catch (error) {
        console.error("❌ Indexing Process Failed:", error.message);
        throw error;
    }
};

// GitHub Actions या Manual Run के लिए
if (require.main === module) {
    runSitemapIndexing().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runSitemapIndexing };

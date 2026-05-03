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
 * 🔥 Force Push Sitemap URLs to Google Indexing API
 */
const runSitemapIndexing = async () => {
    console.log("🚀 Starting Google Indexing Process...");
    
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
        
        // 2. Extract URLs
        if (!result.urlset || !result.urlset.url) {
            throw new Error("Invalid Sitemap format or no URLs found.");
        }

        const allUrls = result.urlset.url.map(u => u.loc[0]);
        console.log(`✅ Total URLs found in Sitemap: ${allUrls.length}`);

        // 3. Process URLs (Daily Limit check: Max 200)
        let count = 0;
        const urlsToProcess = allUrls.slice(0, 200); 

        for (const url of urlsToProcess) { 
            try {
                await indexing.urlNotifications.publish({
                    requestBody: {
                        url: url,
                        type: "URL_UPDATED",
                    },
                });
                count++;
                // Small delay to avoid rate hitting limits too fast
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
                console.error(`❌ Error pushing ${url}:`, err.message);
            }
        }

        console.log(`🎯 Indexing Task Completed! ${count} URLs pushed to Google.`);
        return count;

    } catch (error) {
        console.error("❌ Indexing Process Failed:", error.message);
        throw error;
    }
};

// GitHub Actions या Manual Run के लिए
if (require.main === module) {
    runSitemapIndexing();
}

module.exports = { runSitemapIndexing };
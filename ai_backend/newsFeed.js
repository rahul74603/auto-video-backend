require("dotenv").config();
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // ✅ Gemini AI Added

// ✅ GitHub Secrets + Firebase Cloud Compatible Initialization
if (!admin.apps.length) {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;
    if (serviceAccountVar) {
        const serviceAccount = JSON.parse(serviceAccountVar);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: "studymaterial-406ad"
        });
        console.log("✅ Firebase initialized with Secrets");
    } else {
        admin.initializeApp();
        console.log("✅ Firebase initialized with Default Auth");
    }
}

exports.rssFeed = functions.https.onRequest(async (req, res) => {
    try {
        const db = admin.firestore();
        
        // 1. वो सारे Collections जहाँ से डेटा उठाना है
        const collections = [
            'jobs', 
            'blogs',         // Auto-blogs
            'fast_track',    // Fast Track
            'mock_tests', 
            'study_materials', 
            'admit_cards', 
            'results', 
            'answer_keys'
        ];
        
        let allItems = [];

        // 2. हर कलेक्शन से डेटा निकालने का प्रोसेस
        const fetchPromises = collections.map(async (colName) => {
            try {
                // Blogs के लिए 'date' और बाकी के लिए 'createdAt'
                const timeField = (colName === 'blogs') ? 'date' : 'createdAt';

                const snapshot = await db.collection(colName)
                    .orderBy(timeField, 'desc') 
                    .limit(20)
                    .get();

                snapshot.forEach(doc => {
                    const data = doc.data();
                    const status = (data.status || '').toLowerCase();
                    const type = (data.type || '');
                    
                    // Status Check (published, active, approved etc.)
                    const isExplicitlyLive = data.isLive === true || status === 'published' || status === 'publish' || status === 'approved' || status === 'active';
                    
                    // Auto-Blogs handling
                    const isAutoBlog = (colName === 'blogs' && (!data.status || type === 'auto-blog'));

                    if (isExplicitlyLive || isAutoBlog) {
                        allItems.push({
                            id: doc.id,
                            ...data,
                            universalTime: data[timeField], 
                            collectionName: colName 
                        });
                    }
                });
            } catch (err) {
                console.warn(`Skipping collection ${colName}:`, err.message);
            }
        });

        await Promise.all(fetchPromises);

        // 3. लेटेस्ट फर्स्ट सॉर्टिंग
        allItems.sort((a, b) => {
            const dateA = a.universalTime ? (typeof a.universalTime.toDate === 'function' ? a.universalTime.toDate() : new Date(a.universalTime)) : new Date(0);
            const dateB = b.universalTime ? (typeof b.universalTime.toDate === 'function' ? b.universalTime.toDate() : new Date(b.universalTime)) : new Date(0);
            return dateB.getTime() - dateA.getTime();
        });

        // 4. टॉप 30 आइटम्स
        const finalItems = allItems.slice(0, 30);

        // 🚀 5. AI MAGIC: BULK TITLE REWRITE LOGIC
        try {
            const apiKey = process.env.GEMINI_NEWS_API_KEY;
            if (apiKey) {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ 
                    model: "gemini-2.5-flash-lite", // Fast & Free Tier Friendly
                    generationConfig: { responseMimeType: "application/json" } // Force JSON output
                });

                // Prepare short data to save tokens
                const itemsForAI = finalItems.map(item => ({
                    id: item.id,
                    type: item.collectionName,
                    title: item.title || item.post_name || item.jobTitle || 'New Update'
                }));

                const prompt = `You are a professional Hindi News Editor. Rewrite the following titles into catchy, clickable "Breaking News" style Hindi headlines (e.g., "SSC CGL 2026 Notification Out: यहाँ से करें डायरेक्ट अप्लाई एक क्लिक में"). Keep the core information true. Return ONLY a JSON array of objects with exactly two keys: 'id' and 'newsTitle'. Data: ${JSON.stringify(itemsForAI)}`;

                const result = await model.generateContent(prompt);
                const aiResponse = JSON.parse(result.response.text());

                // Merge new titles back to finalItems
                aiResponse.forEach(aiItem => {
                    const index = finalItems.findIndex(i => i.id === aiItem.id);
                    if (index !== -1) {
                        finalItems[index].aiNewsTitle = aiItem.newsTitle;
                    }
                });
                console.log("✅ AI Title Rewrite Successful");
            } else {
                console.log("⚠️ GEMINI_NEWS_API_KEY not found. Skipping AI rewrite.");
            }
        } catch (aiError) {
            console.error("❌ AI Rewrite Failed (Using normal titles):", aiError.message);
        }

        // ✅ 6. XML Structure
        let xml = `<?xml version="1.0" encoding="UTF-8" ?>
        <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
            <title>StudyGyaan | Latest Govt Jobs, Admit Cards &amp; Results</title>
            <link>https://studygyaan.in</link>
            <description>Get the fastest updates on all Sarkari Naukri, Exams and Blogs.</description>
            <language>hi-IN</language>
            <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;

        finalItems.forEach(item => {
            let routeType = item.collectionName;
            if (routeType === 'jobs') routeType = 'job';
            if (routeType === 'blogs') routeType = 'blog';
            if (routeType === 'fast_track') routeType = 'update';
            
            const postUrl = `https://studygyaan.in/${routeType}/${item.id}`;
            const pubDate = item.universalTime ? (typeof item.universalTime.toDate === 'function' ? item.universalTime.toDate().toUTCString() : new Date(item.universalTime).toUTCString()) : new Date().toUTCString();
            
            const author = item.author || 'StudyGyaan';
            const imageUrl = item.imageUrl || item.image || item.thumbnail || item.featuredImage || '';
            let imageTag = '';
            
            if (imageUrl) {
                imageTag = `<media:content url="${imageUrl}" medium="image"/>`;
            }

            // AI Title इस्तेमाल करें, अगर फेल हुआ तो पुराना टाइटल
            const finalDisplayTitle = item.aiNewsTitle || item.title || item.post_name || item.jobTitle || 'New Update';

            xml += `
            <item>
                <title><![CDATA[${finalDisplayTitle}]]></title>
                <link>${postUrl}</link>
                <guid isPermaLink="false">${postUrl}</guid>
                <pubDate>${pubDate}</pubDate>
                <category><![CDATA[${item.collectionName.toUpperCase()}]]></category>
                <dc:creator><![CDATA[${author}]]></dc:creator>
                <description><![CDATA[${item.shortDescription || item.description || 'Read more details on StudyGyaan'}]]></description>
                <content:encoded><![CDATA[${item.content || item.shortDescription || item.description || ''}]]></content:encoded>
                ${imageTag}
            </item>`;
        });

        xml += `</channel></rss>`;

        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);

    } catch (error) {
        console.error("❌ Multi-Category Feed Error:", error.message);
        res.status(500).send("Internal Server Error");
    }
});
require("dotenv").config();
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require("@google/generative-ai");

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

// ✅ 1. XML URL Safety Helper
const escapeXml = (unsafe) => {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&"']/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '"': return '&quot;';
            case "'": return '&apos;';
            default: return c;
        }
    });
};

exports.rssFeed = functions.https.onRequest(async (req, res) => {
    try {
        const db = admin.firestore();
        
        const collections = [
            'jobs', 
            'blogs', 
            'fast_track', 
            'mock_tests', 
            'study_materials', 
            'admit_cards', 
            'results', 
            'answer_keys'
        ];
        
        let allItems = [];
        const seenIds = new Set();
        const fetchPromises = collections.map(async (colName) => {
            try {
                const timeField = (colName === 'blogs') ? 'date' : 'createdAt';
                const snapshot = await db.collection(colName)
                    .orderBy(timeField, 'desc') 
                    .limit(20)
                    .get();

                snapshot.forEach(doc => {
                    const data = doc.data();
                    const status = (data.status || '').toLowerCase();
                    const type = (data.type || '');
                    const isExplicitlyLive = data.isLive === true || status === 'published' || status === 'publish' || status === 'approved' || status === 'active';
                    const isAutoBlog = (colName === 'blogs' && (!data.status || type === 'auto-blog'));

                    if (isExplicitlyLive || isAutoBlog) {
                        // 👉 duplicate check
                        if (!seenIds.has(doc.id)) {
                            seenIds.add(doc.id);
                            allItems.push({
                                id: doc.id,
                                ...data,
                                universalTime: data[timeField], 
                                collectionName: colName 
                            });
                        }
                    }
                });
            } catch (err) {
                console.warn(`Skipping collection ${colName}:`, err.message);
            }
        });

        await Promise.all(fetchPromises);

        allItems.forEach(item => {
            let boost = 0;
            const title = (item.title || '').toLowerCase();
            if (title.includes('result')) boost += 5;
            if (title.includes('admit')) boost += 4;
            if (title.includes('answer')) boost += 3;
            item.priorityScore = boost;
        });

        allItems.sort((a, b) => {
            const dateA = a.universalTime?.toDate ? a.universalTime.toDate() : new Date(a.universalTime);
            const dateB = b.universalTime?.toDate ? b.universalTime.toDate() : new Date(b.universalTime);
            return (b.priorityScore || 0) - (a.priorityScore || 0) || dateB - dateA;
        });

        const finalItems = allItems.slice(0, 30);

        // 🚀 AI MAGIC: BULK TITLE REWRITE LOGIC
        try {
            const apiKey = process.env.GEMINI_NEWS_API_KEY;
            if (apiKey) {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ 
                    model: "gemini-2.5-flash-lite", 
                    generationConfig: { responseMimeType: "application/json" } 
                });

                const itemsForAI = finalItems.map(item => ({
                    id: item.id,
                    title: item.title || item.post_name || item.jobTitle || 'New Update'
                }));

                const prompt = `
You are a viral Hindi news content creator.

Rewrite each title into:
- Highly clickable
- Add emoji (🚨🔥📢)
- Add urgency words like "अभी देखें", "जल्दी करें"
- Add year if possible (2026)
- Make it SEO optimized

Return JSON:
[{ "id": "...", "newsTitle": "...", "summary": "..."}]

Data:
${JSON.stringify(itemsForAI)}
`;

                const result = await model.generateContent(prompt);
                
                // ✅ AI JSON Parse Bug Fix (Remove markdown formatting)
                let aiText = result.response.text();
                aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
                const aiResponse = JSON.parse(aiText);

                aiResponse.forEach(aiItem => {
                    const index = finalItems.findIndex(i => i.id === aiItem.id);
                    if (index !== -1) {
                        finalItems[index].aiNewsTitle = aiItem.newsTitle;
                        finalItems[index].aiSummary = aiItem.summary || '';
                    }
                });
                console.log("✅ AI Title Rewrite Successful");
            }
        } catch (aiError) {
            console.error("❌ AI Rewrite Failed:", aiError.message);
        }

       // ✅ 2. XML Structure (Strict RSS 2.0 & Google News Valid)
        let xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
    <title>StudyGyaan | Latest Govt Jobs, Admit Cards &amp; Results</title>
    <link>https://studygyaan.in</link>
    <atom:link href="https://studygyaan.in/rss" rel="self" type="application/rss+xml" />
    <description>Get the fastest updates on all Sarkari Naukri, Exams and Blogs.</description>
    <language>hi-IN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;

       finalItems.forEach(item => {
            // 🔥 ALL ROUTES MAPPED TO AVOID 404 ERRORS
            let routeType = item.collectionName;
            if (routeType === 'jobs') routeType = 'job';
            else if (routeType === 'blogs') routeType = 'blog';
            else if (routeType === 'fast_track') routeType = 'update';
            else if (routeType === 'mock_tests') routeType = 'test';
            else if (routeType === 'study_materials') routeType = 'free-study-material';
            else if (routeType === 'admit_cards') routeType = 'admit-card';
            else if (routeType === 'results') routeType = 'result';
            else if (routeType === 'answer_keys') routeType = 'answer-key';
            
            // 🔥 Slug Fallback: अगर 'slug' है तो वो यूज़ करो, वरना 'id'
            const slugOrId = item.slug ? item.slug : item.id;
            const rawPostUrl = `https://studygyaan.in/${routeType}/${slugOrId}`;
            const postUrl = escapeXml(rawPostUrl);
            
            // ✅ Date Fallback Fix (ताकि Invalid Date से XML क्रैश न हो)
            let pubDate = new Date().toUTCString();
            if (item.universalTime) {
                const parsedDate = typeof item.universalTime.toDate === 'function' ? item.universalTime.toDate() : new Date(item.universalTime);
                if (!isNaN(parsedDate.getTime())) {
                    pubDate = parsedDate.toUTCString();
                }
            }
            
            const rawImageUrl = item.imageUrl || item.image || item.thumbnail || item.featuredImage || 'https://studygyaan.in/og-image.jpg';
            const imageUrl = escapeXml(rawImageUrl);
            
            const author = item.author || 'Rahul Sir';
            
            // ✅ HTML Content को CDATA के लिए सुरक्षित रखा (बिना escapeXml के)
            const rawContent = item.content || item.description || '';
            const finalDisplayTitle = item.aiNewsTitle || item.title || item.post_name || item.jobTitle || 'New Update';
            const finalDescription = item.aiSummary || item.shortDescription || item.description || 'Latest update available, check now!';

            xml += `
    <item>
        <title><![CDATA[${finalDisplayTitle}]]></title>
        <link>${postUrl}</link>
        <guid isPermaLink="false">${postUrl}</guid>
        <pubDate>${pubDate}</pubDate>
        <category><![CDATA[${item.collectionName.toUpperCase()}]]></category>
        <dc:creator><![CDATA[${author}]]></dc:creator>
        <description><![CDATA[${finalDescription}]]></description>
        <content:encoded><![CDATA[${rawContent}]]></content:encoded>
        ${imageUrl ? `<enclosure url="${imageUrl}" length="0" type="image/jpeg" />\n        <media:content url="${imageUrl}" medium="image"/>` : ''}
        <media:title><![CDATA[${finalDisplayTitle}]]></media:title>
        <media:description><![CDATA[${finalDescription}]]></media:description>
    </item>`;
        });

        xml += `\n</channel></rss>`;

        res.set('Cache-Control', 'public, max-age=600, s-maxage=1200, stale-while-revalidate=300');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml.trim());

    } catch (error) {
        console.error("❌ Multi-Category Feed Error:", error.message);
        res.status(500).send("Internal Server Error");
    }
});

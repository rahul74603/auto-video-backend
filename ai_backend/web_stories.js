const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialize Firebase Admin (Agar pehle se nahi hai toh)
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const renderWebStory = async (req, res) => {
    // URL se story ki ID nikalna
    const storyId = req.params.id;

    if (!storyId) {
        return res.status(400).send("Story ID is required");
    }

    try {
        const storyDoc = await db.collection("web_stories").doc(storyId).get();

        if (!storyDoc.exists) {
            return res.status(404).send("<h2>Web Story Not Found</h2><p>Ye story delete ho chuki hai ya link galat hai.</p>");
        }

        const data = storyDoc.data();
        
        // 🛠️ 1. STORY TYPE IDENTIFICATION (Mocktest or Blog)
        const storyType = String(data.storyType || 'mocktest').toLowerCase(); 

        // Common Fields
        const title = data.title || "StudyGyaan Update";
        const pageUrl = `https://studygyaan.in/web-stories/${storyId}`;
        
        // 🔥 Smart Exam Background Image Fallback
        let coverImage = data.coverImage || "https://studygyaan.in/og-image.jpg";
        if (storyType === 'mocktest' && coverImage.includes('og-image.jpg')) {
            coverImage = "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?q=80&w=720&auto=format&fit=crop";
        }

        const applyLink = data.applyLink || "https://studygyaan.in";
        const publisher = "StudyGyaan";
        const publisherLogo = "https://studygyaan.in/logo.png";
        
        // Date Formatting for SEO (Fallback to current time if missing)
        const publishedDate = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();

        // 🔥 2. DYNAMIC CONTENT LOGIC (Badges, Rows & Button Text)
        let badgeText = "";
        let badgeColor = "";
        let detailsHtml = "";
        let outlinkText = "";
        let metaDescription = "";

        if (storyType === 'blog') {
            // BLOG SETTINGS
            badgeText = "📝 NEW BLOG POST";
            badgeColor = "#059669"; // Green Theme
            outlinkText = "Read Full Blog";
            const desc = data.description || "Read this complete article to boost your knowledge and stay updated.";
            metaDescription = desc;
            detailsHtml = `
                <p class="story-desc">${desc}</p>
                <div class="detail-row"><span class="highlight" style="color:#6ee7b7;">📁 Category:</span> ${data.category || 'Education'}</div>
                <div class="detail-row"><span class="highlight" style="color:#6ee7b7;">✍️ By:</span> ${data.author || 'Rahul Sir'}</div>
            `;
        } else {
            // 🎯 NEW MOCK TEST SETTINGS (Exam Dashboard Look)
            badgeText = "🎯 MOCK TEST LIVE";
            badgeColor = "#2563eb"; // Blue Theme
            outlinkText = "Attempt Test Now";
            
            // Smart Description Title ke hisab se
            const smartDesc = `Check your preparation level! Attempt this high-level '${title}' with real exam-like questions and negative marking.`;
            metaDescription = smartDesc;

            detailsHtml = `
                <p class="story-desc">${smartDesc}</p>
                <div class="test-stats">
                    <div class="stat-box"><span class="stat-icon">📝</span><span class="stat-val">${data.questions || '50'}</span><span class="stat-label">Questions</span></div>
                    <div class="stat-box"><span class="stat-icon">⏱️</span><span class="stat-val">${data.duration || '30'}</span><span class="stat-label">Minutes</span></div>
                    <div class="stat-box"><span class="stat-icon">🏆</span><span class="stat-val">FREE</span><span class="stat-label">Test</span></div>
                </div>
            `;
        }

        // 🔥 JSON-LD SCHEMA FOR GOOGLE DISCOVER/SEARCH 🔥
        const jsonLdMarkup = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": pageUrl
            },
            "headline": title,
            "image": [coverImage],
            "datePublished": publishedDate,
            "dateModified": publishedDate,
            "author": {
                "@type": "Person",
                "name": data.author || "Rahul Sir",
                "url": "https://studygyaan.in"
            },
            "publisher": {
                "@type": "Organization",
                "name": publisher,
                "logo": {
                    "@type": "ImageObject",
                    "url": publisherLogo
                }
            }
        });

        // 🔥 3. GOOGLE AMP WEB STORY HTML 🔥
        const html = `<!doctype html>
<html amp lang="hi">
<head>
    <meta charset="utf-8">
    <script async src="https://cdn.ampproject.org/v0.js"></script>
    <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
    <title>${title}</title>
    <meta name="description" content="${metaDescription}">
    <link rel="canonical" href="${pageUrl}">
    <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
    
    <script type="application/ld+json">
        ${jsonLdMarkup}
    </script>
    
    <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
    
    <style amp-custom>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
      amp-story { color: white; }
      
      .overlay {
        background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 100%);
        width: 100%;
        height: 100%;
      }
      
      .content-wrapper {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        height: 100%;
        padding: 0 24px 100px 24px; /* Space for swipe up button */
      }
      
      .glass-box {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      }
      
      .badge { 
        background: ${badgeColor}; 
        color: white; 
        padding: 6px 12px; 
        border-radius: 6px; 
        font-size: 0.8rem; 
        font-weight: 900;
        text-transform: uppercase; 
        letter-spacing: 1px;
        margin-bottom: 16px; 
        display: inline-block; 
      }
      
      h1 { 
        font-size: 2rem; 
        font-weight: 900; 
        line-height: 1.2; 
        margin-bottom: 16px; 
        text-shadow: 2px 2px 4px rgba(0,0,0,0.8); 
      }
      
      .story-desc { 
        font-size: 1.05rem; 
        color: #f8fafc; 
        line-height: 1.4; 
        margin-bottom: 20px; 
        font-weight: 600; 
        text-shadow: 1px 1px 3px rgba(0,0,0,0.8); 
      }
      
      .detail-row {
        font-size: 1.1rem;
        font-weight: bold;
        margin: 10px 0;
        display: flex;
        align-items: center;
      }
      
      .highlight { margin-right: 8px;}
      
      /* NEW MOCK TEST STATS CSS */
      .test-stats { 
        display: flex; 
        justify-content: space-between; 
        gap: 8px; 
        margin-top: 15px; 
      }
      .stat-box { 
        flex: 1; 
        background: rgba(0,0,0,0.5); 
        border: 1px solid rgba(255,255,255,0.15); 
        border-radius: 12px; 
        padding: 12px 2px; 
        text-align: center; 
      }
      .stat-icon { 
        font-size: 1.4rem; 
        display: block; 
        margin-bottom: 4px; 
      }
      .stat-val { 
        font-size: 1.1rem; 
        font-weight: 900; 
        color: #fff; 
        display: block; 
      }
      .stat-label { 
        font-size: 0.65rem; 
        color: #cbd5e1; 
        text-transform: uppercase; 
        font-weight: bold; 
        letter-spacing: 1px;
      }
    </style>
</head>
<body>
    <amp-story standalone
        title="${title}"
        publisher="${publisher}"
        publisher-logo-src="${publisherLogo}"
        poster-portrait-src="${coverImage}">
        
      <amp-story-page id="page1">
        
        <amp-story-grid-layer template="fill">
          <amp-img src="${coverImage}" width="720" height="1280" layout="responsive" alt="Background"></amp-img>
        </amp-story-grid-layer>
        
        <amp-story-grid-layer template="fill">
          <div class="overlay"></div>
        </amp-story-grid-layer>

        <amp-story-grid-layer template="vertical">
          <div class="content-wrapper">
            <div class="glass-box" animate-in="fade-in" animate-in-duration="0.8s">
              <span class="badge">${badgeText}</span>
              <h1>${title}</h1>
              ${detailsHtml}
            </div>
          </div>
        </amp-story-grid-layer>

        <amp-story-page-outlink layout="nodisplay" theme="custom">
          <a href="${applyLink}">${outlinkText}</a>
        </amp-story-page-outlink>
        
      </amp-story-page>

    </amp-story>
</body>
</html>`;

        // Cache settings & Response
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/html');
        return res.status(200).send(html);

    } catch (error) {
        console.error("❌ Web Story Generation Error:", error);
        return res.status(500).send("Server Error: Unable to load story");
    }
};

// 🚀 NEW: WEB STORIES SITEMAP GENERATOR 
const generateStoriesSitemap = onRequest({ cors: true, timeoutSeconds: 60, memory: "256MiB" }, async (req, res) => {
    try {
        const snapshot = await db.collection("web_stories")
            .orderBy("createdAt", "desc")
            .limit(500)
            .get();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

        snapshot.forEach(doc => {
            const data = doc.data();
            const storyId = doc.id;
            const pageUrl = `https://studygyaan.in/web-stories/${storyId}`;
            
            // Fix Image URL and Title for XML safety
            let coverImage = data.coverImage || "https://studygyaan.in/og-image.jpg";
            coverImage = coverImage.replace(/&/g, '&amp;');
            
            const title = (data.title || "StudyGyaan Web Story")
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            const publishedDate = data.createdAt && data.createdAt.toDate 
                ? data.createdAt.toDate().toISOString() 
                : new Date().toISOString();

            xml += `  <url>\n`;
            xml += `    <loc>${pageUrl}</loc>\n`;
            xml += `    <lastmod>${publishedDate}</lastmod>\n`;
            xml += `    <image:image>\n`;
            xml += `      <image:loc>${coverImage}</image:loc>\n`;
            xml += `      <image:title>${title}</image:title>\n`;
            xml += `    </image:image>\n`;
            xml += `  </url>\n`;
        });

        xml += `</urlset>`;

        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/xml; charset=utf-8');
        res.status(200).send(xml);

    } catch (error) {
        console.error("❌ Web Story Sitemap Error:", error.message);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = { renderWebStory, generateStoriesSitemap };
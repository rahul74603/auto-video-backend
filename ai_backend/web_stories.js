const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 🎨 SLIDE HTML GENERATORS
// ==========================================

// HTML injection se bachne ke liye (titles me quotes/& aa sakte hain)
const { escapeHtml } = require("./agents/article_agents/article_html_utils");
const esc = (v) => escapeHtml(String(v === undefined || v === null ? "" : v));

// Publisher assets — public/story-assets/ (Discover ke liye real logo zaroori)
const PUBLISHER_LOGO_URL = "https://studygyaan.in/story-assets/publisher-logo.png";

// storyType → badge color
const BADGE_COLORS = {
    job: "#1d4ed8",
    fasttrack: "#ea580c",
    blog: "#059669",
    mocktest: "#7c3aed"
};

// Blocked statuses — inki story render/sitemap dono se bahar
const HIDDEN_STORY_STATUS = new Set(["draft", "pending", "rejected", "private", "archived", "deleted", "trash"]);
function isStoryHidden(data = {}) {
    if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return true;
    return HIDDEN_STORY_STATUS.has(String(data.status || "").trim().toLowerCase());
}

function buildCoverPage(slide, coverImage, coverW, coverH, badgeColor) {
    return `
  <amp-story-page id="page-cover" auto-advance-after="5s">
    <amp-story-grid-layer template="fill">
      <amp-img
        src="${coverImage}"
        width="${coverW}"
        height="${coverH}"
        layout="responsive"
        alt="${esc(slide.title)}">
      </amp-img>
    </amp-story-grid-layer>

    <amp-story-grid-layer template="fill">
      <div class="overlay-dark"></div>
    </amp-story-grid-layer>

    <amp-story-grid-layer template="vertical" class="content-layer">
      <div class="cover-content">
        <div class="badge" style="background:${badgeColor}">
          ${esc(slide.badge || '📚 STUDYGYAAN')}
        </div>
        <h1 class="cover-title" animate-in="fly-in-bottom" animate-in-duration="0.6s">
          ${esc(slide.title)}
        </h1>
        <p class="cover-sub" animate-in="fade-in" animate-in-duration="0.8s" animate-in-delay="0.3s">
          ${esc(slide.subtitle || 'StudyGyaan.in')}
        </p>
        <div class="brand-tag" animate-in="fade-in" animate-in-delay="0.5s">
          🌐 StudyGyaan.in
        </div>
      </div>
    </amp-story-grid-layer>
  </amp-story-page>`;
}

function buildInfoPage(slide, pageId, bgColor) {
    const linesHtml = (slide.lines || [])
        .map(line => `<div class="info-line">${esc(line)}</div>`)
        .join('');

    return `
  <amp-story-page id="${pageId}" auto-advance-after="6s">
    <amp-story-grid-layer template="fill">
      <div class="bg-gradient" style="background:${bgColor}"></div>
    </amp-story-grid-layer>

    <amp-story-grid-layer template="vertical" class="content-layer">
      <div class="slide-content">
        <h2 class="slide-heading" animate-in="fly-in-top" animate-in-duration="0.5s">
          ${esc(slide.heading)}
        </h2>
        <div class="lines-box" animate-in="fade-in" animate-in-delay="0.3s">
          ${linesHtml}
        </div>
        <div class="brand-watermark">StudyGyaan.in</div>
      </div>
    </amp-story-grid-layer>
  </amp-story-page>`;
}

function buildStatsPage(slide, pageId) {
    const statsHtml = (slide.stats || []).map(stat => `
      <div class="stat-card">
        <span class="stat-icon">${esc(stat.icon)}</span>
        <span class="stat-val">${esc(stat.value)}</span>
        <span class="stat-lbl">${esc(stat.label)}</span>
      </div>`).join('');

    return `
  <amp-story-page id="${pageId}" auto-advance-after="6s">
    <amp-story-grid-layer template="fill">
      <div class="bg-gradient" style="background:linear-gradient(135deg,#0f2027,#203a43,#2c5364)"></div>
    </amp-story-grid-layer>

    <amp-story-grid-layer template="vertical" class="content-layer">
      <div class="slide-content">
        <h2 class="slide-heading" animate-in="fly-in-top" animate-in-duration="0.5s">
          ${esc(slide.heading)}
        </h2>
        <div class="stats-grid" animate-in="fade-in" animate-in-delay="0.3s">
          ${statsHtml}
        </div>
        <div class="brand-watermark">StudyGyaan.in</div>
      </div>
    </amp-story-grid-layer>
  </amp-story-page>`;
}

function buildContentPage(slide, pageId, bgColor) {
    const linesHtml = (slide.lines || [])
        .map(line => `<div class="content-line">${esc(line)}</div>`)
        .join('');

    return `
  <amp-story-page id="${pageId}" auto-advance-after="7s">
    <amp-story-grid-layer template="fill">
      <div class="bg-gradient" style="background:${bgColor}"></div>
    </amp-story-grid-layer>

    <amp-story-grid-layer template="vertical" class="content-layer">
      <div class="slide-content">
        <h2 class="slide-heading" animate-in="fly-in-top" animate-in-duration="0.5s">
          ${esc(slide.heading)}
        </h2>
        <div class="lines-box" animate-in="fly-in-bottom" animate-in-delay="0.3s">
          ${linesHtml}
        </div>
        <div class="brand-watermark">StudyGyaan.in</div>
      </div>
    </amp-story-grid-layer>
  </amp-story-page>`;
}

function buildCtaPage(slide, pageId, applyLink) {
    const linesHtml = (slide.lines || [])
        .map(line => `<div class="cta-line">${esc(line)}</div>`)
        .join('');

    return `
  <amp-story-page id="${pageId}" auto-advance-after="8s">
    <amp-story-grid-layer template="fill">
      <div class="bg-gradient" style="background:linear-gradient(135deg,#7c3aed,#2563eb,#0f2027)"></div>
    </amp-story-grid-layer>

    <amp-story-grid-layer template="vertical" class="content-layer">
      <div class="slide-content">
        <h2 class="cta-heading" animate-in="zoom-in" animate-in-duration="0.6s">
          ${esc(slide.heading)}
        </h2>
        <div class="cta-box" animate-in="fade-in" animate-in-delay="0.4s">
          ${linesHtml}
        </div>
        <a href="${esc(applyLink)}" class="cta-btn" animate-in="fly-in-bottom" animate-in-delay="0.6s">
          ${esc(slide.ctaText || 'Visit Now')} →
        </a>
        <div class="brand-watermark">StudyGyaan.in</div>
      </div>
    </amp-story-grid-layer>

    <amp-story-page-outlink layout="nodisplay">
      <a href="${esc(applyLink)}">${esc(slide.ctaText || 'Visit StudyGyaan.in')}</a>
    </amp-story-page-outlink>
  </amp-story-page>`;
}

// ==========================================
// 🎨 FULL CSS
// ==========================================
const AMP_CUSTOM_CSS = `
  /* Base */
  body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }
  amp-story { color: white; }

  /* Overlays */
  .overlay-dark {
    background: linear-gradient(
      to bottom,
      rgba(0,0,0,0.1) 0%,
      rgba(0,0,0,0.4) 40%,
      rgba(0,0,0,0.85) 100%
    );
    width: 100%;
    height: 100%;
  }

  .bg-gradient {
    width: 100%;
    height: 100%;
  }

  /* Content Layer */
  .content-layer {
    padding: 0;
  }

  /* Cover Slide */
  .cover-content {
    position: absolute;
    bottom: 80px;
    left: 0;
    right: 0;
    padding: 0 24px;
  }

  .badge {
    color: white;
    padding: 8px 16px;
    border-radius: 30px;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 1.5px;
    display: inline-block;
    margin-bottom: 16px;
    text-transform: uppercase;
  }

  .cover-title {
    font-size: 32px;
    font-weight: 900;
    line-height: 1.2;
    margin: 0 0 12px 0;
    text-shadow: 2px 2px 8px rgba(0,0,0,0.9);
    color: #ffffff;
  }

  .cover-sub {
    font-size: 18px;
    color: #fbbf24;
    font-weight: 700;
    margin: 0 0 16px 0;
    text-shadow: 1px 1px 4px rgba(0,0,0,0.8);
  }

  .brand-tag {
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 700;
    display: inline-block;
    color: #ffffff;
  }

  /* Info / Content Slides */
  .slide-content {
    padding: 40px 24px 80px 24px;
    display: flex;
    flex-direction: column;
    height: 100%;
    justify-content: center;
  }

  .slide-heading {
    font-size: 26px;
    font-weight: 900;
    margin: 0 0 24px 0;
    color: #fbbf24;
    text-shadow: 1px 1px 4px rgba(0,0,0,0.8);
    border-bottom: 3px solid rgba(251,191,36,0.4);
    padding-bottom: 12px;
  }

  .lines-box {
    background: rgba(0,0,0,0.4);
    border-radius: 16px;
    padding: 20px;
    border: 1px solid rgba(255,255,255,0.1);
  }

  .info-line {
    font-size: 18px;
    font-weight: 700;
    color: #f1f5f9;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
  }

  .info-line:last-child { border-bottom: none; }

  .content-line {
    font-size: 17px;
    font-weight: 600;
    color: #e2e8f0;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
  }

  .content-line:last-child { border-bottom: none; }

  /* Stats Slide */
  .stats-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
  }

  .stat-card {
    flex: 1;
    min-width: 100px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 16px;
    padding: 16px 8px;
    text-align: center;
  }

  .stat-icon { font-size: 28px; display: block; margin-bottom: 6px; }
  .stat-val {
    font-size: 22px;
    font-weight: 900;
    color: #fbbf24;
    display: block;
  }
  .stat-lbl {
    font-size: 11px;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
    display: block;
    margin-top: 4px;
  }

  /* CTA Slide */
  .cta-heading {
    font-size: 28px;
    font-weight: 900;
    color: #ffffff;
    margin: 0 0 20px 0;
    text-shadow: 2px 2px 6px rgba(0,0,0,0.8);
    text-align: center;
  }

  .cta-box {
    background: rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 24px;
    border: 1px solid rgba(255,255,255,0.2);
  }

  .cta-line {
    font-size: 18px;
    font-weight: 700;
    color: #a7f3d0;
    padding: 8px 0;
    text-shadow: 1px 1px 3px rgba(0,0,0,0.6);
  }

  .cta-btn {
    display: block;
    background: linear-gradient(135deg, #f59e0b, #ef4444);
    color: white;
    text-decoration: none;
    padding: 16px 24px;
    border-radius: 50px;
    font-size: 20px;
    font-weight: 900;
    text-align: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    letter-spacing: 0.5px;
  }

  /* Brand Watermark */
  .brand-watermark {
    position: absolute;
    bottom: 20px;
    right: 20px;
    font-size: 12px;
    color: rgba(255,255,255,0.5);
    font-weight: 700;
  }

  /* Bookend */
  amp-story-bookend { color: white; }
`;

// ==========================================
// 🔖 BOOKEND CONFIG
// ==========================================
function buildBookend(title, pageUrl, coverImage) {
    const bookendData = {
        "bookendVersion": "v1.0",
        "shareProviders": [
            { "provider": "whatsapp" },
            { "provider": "twitter" },
            { "provider": "facebook" },
            { "provider": "email" },
            { "provider": "system" }
        ],
        "components": [
            {
                "type": "heading",
                "text": "More from StudyGyaan"
            },
            {
                "type": "small",
                "title": "Free Mock Tests & PDF Notes",
                "url": "https://studygyaan.in",
                "image": coverImage
            },
            {
                "type": "small",
                "title": "Latest Sarkari Naukri Updates",
                "url": "https://studygyaan.in/blog",
                "image": coverImage
            },
            {
                "type": "cta-link",
                "links": [
                    {
                        "text": "🌐 Visit StudyGyaan.in",
                        "url": "https://studygyaan.in"
                    }
                ]
            }
        ]
    };

    return JSON.stringify(bookendData);
}

// ==========================================
// 🚀 MAIN RENDER FUNCTION
// ==========================================
const renderWebStory = async (req, res) => {
    const identifier = req.params.id;

    if (!identifier) {
        return res.status(400).send("Story ID required");
    }

    try {
        let storyData = null;
        let storyId = identifier;

        // Slug से ढूंढो
        const slugQuery = await db.collection("web_stories")
            .where("slug", "==", identifier)
            .limit(1)
            .get();

        if (!slugQuery.empty) {
            storyData = slugQuery.docs[0].data();
            storyId = slugQuery.docs[0].id;
        } else {
            // Doc ID से ढूंढो
            const idDoc = await db.collection("web_stories").doc(identifier).get();
            if (idDoc.exists) {
                storyData = idDoc.data();
                if (storyData.slug && storyData.slug !== identifier) {
                    return res.redirect(301, `https://studygyaan.in/web-stories/${storyData.slug}`);
                }
            }
        }

        if (!storyData) {
            return res.status(404).send("<h2>Story Not Found</h2>");
        }

        // Draft/noIndex stories public na hon (Discover + search dono se bahar)
        if (isStoryHidden(storyData)) {
            res.set("Cache-Control", "no-store");
            return res.status(404).send("<h2>Story Not Found</h2>");
        }

        const data = storyData;
        const storyType = String(data.storyType || 'mocktest').toLowerCase();
        const title = String(data.title || "StudyGyaan Update");
        const slug = data.slug || storyId;
        const pageUrl = `https://studygyaan.in/web-stories/${slug}`;
        const applyLink = data.applyLink || "https://studygyaan.in";
        const publisher = "StudyGyaan";
        const publisherLogo = PUBLISHER_LOGO_URL;

        const coverImage = data.coverImage
            || "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=1080&h=1920&fit=crop";
        const coverImageWidth = data.coverImageWidth || 1080;
        const coverImageHeight = data.coverImageHeight || 1920;
        const coverImageType = data.coverImageType || "image/webp";

        const publishedDate = data.createdAt && data.createdAt.toDate
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();

        const metaDescription = data.description
            || `${title} - Free Study Material on StudyGyaan.in`;

        // Badge Color (storyType ke hisaab se)
        const badgeColor = BADGE_COLORS[storyType] || '#1d4ed8';

        // Background gradients for slides
        const bgColors = [
            'linear-gradient(135deg,#0f2027,#203a43,#2c5364)',
            'linear-gradient(135deg,#1a0a00,#4a1500,#7c2d12)',
            'linear-gradient(135deg,#001a00,#0a3300,#14532d)',
            'linear-gradient(135deg,#0f0f1a,#1a1a3e,#1e3a8a)',
            'linear-gradient(135deg,#2d1b69,#4c1d95,#7c3aed)'
        ];

        // ✅ Slides data - Firestore से या default generate करो
        let slides = data.slides;
        if (!slides || slides.length < 3) {
            // Old stories के लिए default slides
            if (storyType === 'blog') {
                slides = [
                    { type: 'cover', title: title, subtitle: data.category || 'Education', badge: '📝 NEW BLOG POST' },
                    { type: 'info', heading: '📌 About This Article', lines: [`📁 ${data.category || 'Education'}`, `✍️ ${data.author || 'Rahul Sir'}`, '🌐 StudyGyaan.in', '📅 Latest 2025 Update'] },
                    { type: 'content', heading: '✅ Key Highlights', lines: ['• Complete Information', '• Easy Hindi Explanation', '• Free PDF Download', '• Updated for 2025'] },
                    { type: 'content', heading: '📚 Why Read This?', lines: ['• Exam-Focused Content', '• Important for All Govt Exams', '• Short & Clear Format', '• Expert Written'] },
                    { type: 'cta', heading: '🚀 Read Full Article FREE!', lines: ['✅ Free PDF Notes', '✅ Online Mock Tests', '✅ Daily Updates'], ctaText: 'Read Full Article', ctaLink: applyLink }
                ];
            } else {
                slides = [
                    { type: 'cover', title: title, subtitle: `${data.subject || 'GK'} Mock Test`, badge: '🎯 FREE MOCK TEST' },
                    { type: 'stats', heading: '📊 Test Overview', stats: [{ icon: '📝', value: String(data.questions || '50'), label: 'Questions' }, { icon: '⏱️', value: String(data.duration || '30'), label: 'Minutes' }, { icon: '🏆', value: 'FREE', label: 'Cost' }, { icon: '📱', value: 'Online', label: 'Mode' }] },
                    { type: 'content', heading: '📚 Topics Covered', lines: ['• Important Expected MCQs', '• Previous Year Questions', '• Bilingual Hindi + English', '• With Timer & Explanation'] },
                    { type: 'content', heading: '🎯 For These Exams', lines: ['• SSC CGL, CHSL 2025', '• RRB NTPC, Group D 2025', '• Bank PO, Clerk 2025', '• Police & State Exams 2025'] },
                    { type: 'cta', heading: '🚀 Attempt FREE Now!', lines: ['✅ No Registration', '✅ Instant Results', '✅ Free Certificate'], ctaText: 'Start Mock Test FREE', ctaLink: applyLink }
                ];
            }
        }

        // ✅ Slides HTML Build करो
        let slidesHtml = '';
        slides.forEach((slide, idx) => {
            const pageId = idx === 0 ? 'page-cover' : `page-${idx + 1}`;
            const bgColor = bgColors[idx % bgColors.length];

            switch (slide.type) {
                case 'cover':
                    slidesHtml += buildCoverPage(slide, coverImage, coverImageWidth, coverImageHeight, badgeColor);
                    break;
                case 'stats':
                    slidesHtml += buildStatsPage(slide, pageId);
                    break;
                case 'cta':
                    slidesHtml += buildCtaPage(slide, pageId, applyLink);
                    break;
                case 'info':
                case 'content':
                default:
                    slidesHtml += buildInfoPage(slide, pageId, bgColor);
                    break;
            }
        });

        // ✅ JSON-LD
        const jsonLd = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
            "headline": title,
            "image": {
                "@type": "ImageObject",
                "url": coverImage,
                "width": coverImageWidth,
                "height": coverImageHeight
            },
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
                    "url": publisherLogo,
                    "width": 512,
                    "height": 512
                }
            },
            "description": metaDescription,
            "isAccessibleForFree": true,
            "inLanguage": "hi"
        });

        // ✅ Bookend (`</script>` injection se bachne ke liye `<` neutralize)
        const bookendJson = buildBookend(title, pageUrl, coverImage).replace(/</g, "\\u003c");
        const jsonLdSafe = jsonLd.replace(/</g, "\\u003c");

        // Head values escaped (titles me " & < aa sakte hain)
        const safeTitle = esc(title);
        const safeDesc = esc(metaDescription);
        const safeCover = esc(coverImage);

        // ✅ FULL AMP HTML
        const html = `<!doctype html>
<html amp lang="hi">
<head>
  <meta charset="utf-8">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script async custom-element="amp-story"
    src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  <link rel="canonical" href="${pageUrl}">
  <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
  <meta name="robots" content="max-image-preview:large">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="StudyGyaan">
  <meta property="og:image" content="${safeCover}">
  <meta property="og:image:width" content="${coverImageWidth}">
  <meta property="og:image:height" content="${coverImageHeight}">
  <meta property="og:image:type" content="${coverImageType}">
  <meta property="article:published_time" content="${publishedDate}">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeCover}">

  <!-- JSON-LD -->
  <script type="application/ld+json">${jsonLdSafe}</script>

  <!-- AMP Boilerplate -->
  <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>
  <noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>

  <style amp-custom>${AMP_CUSTOM_CSS}</style>
</head>
<body>
  <amp-story
    standalone
    title="${safeTitle}"
    publisher="${publisher}"
    publisher-logo-src="${publisherLogo}"
    poster-portrait-src="${safeCover}">

    ${slidesHtml}

    <!-- ✅ Bookend - Google के लिए Required -->
    <amp-story-bookend layout="nodisplay">
      <script type="application/json">
        ${bookendJson}
      </script>
    </amp-story-bookend>

  </amp-story>
</body>
</html>`;

        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.set('Content-Type', 'text/html');
        return res.status(200).send(html);

    } catch (error) {
        console.error("❌ Web Story Error:", error);
        return res.status(500).send("Server Error");
    }
};

// ==========================================
// 🗺️ SITEMAP
// ==========================================
const generateStoriesSitemap = onRequest({
    cors: true,
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (req, res) => {
    try {
        const snapshot = await db.collection("web_stories")
            .orderBy("createdAt", "desc")
            .limit(500)
            .get();

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" `;
        xml += `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (isStoryHidden(data)) return;
            const slug = data.slug || doc.id;
            const pageUrl = `https://studygyaan.in/web-stories/${slug}`;
            const coverImage = (data.coverImage || "https://studygyaan.in/og-image.jpg")
                .replace(/&/g, '&amp;');
            const title = (data.title || "StudyGyaan Web Story")
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const publishedDate = data.createdAt && data.createdAt.toDate
                ? data.createdAt.toDate().toISOString()
                : new Date().toISOString();

            xml += `  <url>\n`;
            xml += `    <loc>${pageUrl}</loc>\n`;
            xml += `    <lastmod>${publishedDate}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.9</priority>\n`;
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
        console.error("❌ Sitemap Error:", error.message);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = { renderWebStory, generateStoriesSitemap };

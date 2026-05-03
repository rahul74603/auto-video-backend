// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase/config'; 
import { doc, getDoc } from 'firebase/firestore';
import { X, Loader2 } from 'lucide-react';
import SEO from '../components/SEO'; 

const WebStoryViewer = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [storyData, setStoryData] = useState<any>(null);
    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStory = async () => {
            try {
                if (!id) return;
                
                const docRef = doc(db, 'web_stories', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setStoryData(data);
                    
                    const storyType = String(data.storyType || 'mocktest').toLowerCase(); 
                    const title = data.title || "StudyGyaan Update";
                    
                    let coverImage = data.coverImage || "https://studygyaan.in/og-image.jpg";
                    if (storyType === 'mocktest' && coverImage.includes('og-image.jpg')) {
                        coverImage = "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?q=80&w=720&auto=format&fit=crop";
                    }

                    const applyLink = data.applyLink || "https://studygyaan.in";
                    const publisher = "StudyGyaan";
                    const publisherLogo = "https://studygyaan.in/logo.png";

                    let badgeText = "";
                    let badgeColor = "";
                    let detailsHtml = "";
                    let outlinkText = "";

                    if (storyType === 'blog') {
                        badgeText = "📝 NEW BLOG POST";
                        badgeColor = "#059669"; 
                        outlinkText = "Read Full Blog";
                        const desc = data.description || "Read this complete article to boost your knowledge and stay updated.";
                        detailsHtml = `
                            <p class="story-desc">${desc}</p>
                            <div class="detail-row"><span class="highlight" style="color:#6ee7b7;">📁 Category:</span> ${data.category || 'Education'}</div>
                            <div class="detail-row"><span class="highlight" style="color:#6ee7b7;">✍️ By:</span> ${data.author || 'Rahul Sir'}</div>
                        `;
                    } else {
                        badgeText = "🎯 MOCK TEST LIVE";
                        badgeColor = "#2563eb"; 
                        outlinkText = "Attempt Test Now";
                        const smartDesc = `Check your preparation level! Attempt this high-level '${title}' with real exam-like questions.`;
                        detailsHtml = `
                            <p class="story-desc">${smartDesc}</p>
                            <div class="test-stats">
                                <div class="stat-box"><span class="stat-icon">📝</span><span class="stat-val">${data.questions || '50'}</span><span class="stat-label">Questions</span></div>
                                <div class="stat-box"><span class="stat-icon">⏱️</span><span class="stat-val">${data.duration || '30'}</span><span class="stat-label">Minutes</span></div>
                                <div class="stat-box"><span class="stat-icon">🏆</span><span class="stat-val">FREE</span><span class="stat-label">Test</span></div>
                            </div>
                        `;
                    }

                    // 🔥 PERFECT CODE: Using backticks (`) for dynamic AMP HTML
                    const html = `<!doctype html>
<html amp lang="hi">
<head>
    <meta charset="utf-8">
    <script async src="https://cdn.ampproject.org/v0.js"></script>
    <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
    <title>${title}</title>
    <link rel="canonical" href="https://studygyaan.in/web-stories/${id}">
    <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
    <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
    <style amp-custom>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
      amp-story { color: white; }
      .overlay { background: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 100%); width: 100%; height: 100%; }
      .content-wrapper { display: flex; flex-direction: column; justify-content: flex-end; height: 100%; padding: 0 24px 100px 24px; }
      .glass-box { background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border: 1px solid rgba(255,255,255,0.2); border-radius: 24px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
      .badge { background: ${badgeColor}; color: white; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; display: inline-block; }
      h1 { font-size: 1.8rem; font-weight: 900; line-height: 1.2; margin-bottom: 16px; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); }
      .story-desc { font-size: 1rem; color: #f8fafc; line-height: 1.4; margin-bottom: 20px; font-weight: 600; }
      .detail-row { font-size: 1rem; font-weight: bold; margin: 10px 0; display: flex; align-items: center; }
      .test-stats { display: flex; justify-content: space-between; gap: 8px; margin-top: 15px; }
      .stat-box { flex: 1; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 12px 2px; text-align: center; }
      .stat-icon { font-size: 1.2rem; display: block; margin-bottom: 4px; }
      .stat-val { font-size: 1rem; font-weight: 900; color: #fff; display: block; }
      .stat-label { font-size: 0.6rem; color: #cbd5e1; text-transform: uppercase; font-weight: bold; }
    </style>
</head>
<body>
    <amp-story standalone title="${title}" publisher="${publisher}" publisher-logo-src="${publisherLogo}" poster-portrait-src="${coverImage}">
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
                    
                    setHtmlContent(html);
                }
            } catch (error) {
                console.error("Error fetching story:", error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchStory();
    }, [id]);

    if (loading) return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-white">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <p className="font-black uppercase tracking-widest text-xs">Loading Story...</p>
        </div>
    );

    if (!htmlContent || !storyData) return <div className="h-screen w-screen flex items-center justify-center bg-black text-white">Story Not Found</div>;

    return (
        <div className="h-screen w-screen bg-black flex justify-center items-center fixed inset-0 z-[9999]">
            
            <SEO 
                customTitle={`${storyData.title} | Web Story | StudyGyaan`}
                customDescription={storyData.description || `Watch this exclusive web story about ${storyData.title} on StudyGyaan.`}
                customUrl={`https://studygyaan.in/web-stories/${id}`}
                customImage={storyData.coverImage || "https://studygyaan.in/og-image.jpg"}
            />

            <iframe 
                srcDoc={htmlContent} 
                className="w-full h-full max-w-[450px] border-none bg-black shadow-2xl" 
                title={storyData.title}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />

            <button 
                onClick={() => navigate('/')} 
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-red-500 rounded-full text-white z-[10000] transition-all cursor-pointer border border-white/20 backdrop-blur-md"
                aria-label="Close Story"
            >
                <X size={24} />
            </button>
            {/* ✅ SEO FIX: Visually Hidden Internal Links (Fixes 'No outgoing links' without breaking Full-Screen Story UI) */}
            <div style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
                <h2>Explore More on StudyGyaan</h2>
                <a href="/govt-jobs">Latest Govt Jobs</a>
                <a href="/free-study-material">Free Study Material</a>
                <a href="/test">Free Mock Tests</a>
                <a href="/blog">Sarkari Yojana & Blogs</a>
            </div>
        </div>
    );
};

export default WebStoryViewer;
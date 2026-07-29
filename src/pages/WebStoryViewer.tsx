import { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStory } from '@/features/stories/hooks/useStory';
import {
    X, Loader2,
    ExternalLink, Share2, Check
} from 'lucide-react';
import SEO from '../components/SEO';
import { toDateSafe } from '@/types/firestore';
import type { TimestampLike } from '@/types/firestore';

// =========================================================
// 🧾 STORY DOC TYPES
// =========================================================
interface StoryStat {
    icon?: string;
    value?: string;
    label?: string;
}

interface StorySlide {
    type?: string;
    badge?: string;
    title?: string;
    subtitle?: string;
    heading?: string;
    stats?: StoryStat[];
    lines?: string[];
    ctaText?: string;
    ctaLink?: string;
}

interface StoryDocData {
    title?: string;
    slug?: string;
    coverImage?: string;
    applyLink?: string;
    storyType?: string;
    category?: string;
    author?: string;
    subject?: string;
    questions?: string | number;
    duration?: string | number;
    description?: string;
    createdAt?: TimestampLike;
    slides?: StorySlide[];
}

// =========================================================
// 🛠️ HELPERS
// =========================================================
function getIsoDate(timeSource: TimestampLike): string {
    return (toDateSafe(timeSource) || new Date()).toISOString();
}

// =========================================================
// 🎨 SLIDE RENDERER
// =========================================================

// Slide backgrounds
const SLIDE_GRADIENTS = [
    'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    'linear-gradient(135deg, #1a0a00, #4a1500, #7c2d12)',
    'linear-gradient(135deg, #001a00, #0a3300, #14532d)',
    'linear-gradient(135deg, #1a0a2e, #2d1b69, #4c1d95)',
    'linear-gradient(135deg, #0f0f1a, #1a1a3e, #1e3a8a)'
];

function buildSlideContent(slide: StorySlide, applyLink: string): string {
    switch (slide.type) {
        case 'cover':
            return `
                <div class="cover-content">
                    <div class="badge">${slide.badge || '📚 STUDYGYAAN'}</div>
                    <h1 class="cover-title">${slide.title || ''}</h1>
                    <p class="cover-sub">${slide.subtitle || 'StudyGyaan.in'}</p>
                    <div class="brand-tag">🌐 StudyGyaan.in</div>
                </div>`;

        case 'stats': {
            const statsHtml = (slide.stats || []).map(s =>
                `<div class="stat-card">
                    <span class="stat-icon">${s.icon}</span>
                    <span class="stat-val">${s.value}</span>
                    <span class="stat-lbl">${s.label}</span>
                </div>`
            ).join('');
            return `
                <div class="slide-content">
                    <h2 class="slide-heading">${slide.heading || ''}</h2>
                    <div class="stats-grid">${statsHtml}</div>
                    <div class="brand-wm">StudyGyaan.in</div>
                </div>`;
        }

        case 'cta': {
            const ctaLines = (slide.lines || []).map(l =>
                `<div class="cta-line">${l}</div>`
            ).join('');
            return `
                <div class="slide-content">
                    <h2 class="cta-heading">${slide.heading || ''}</h2>
                    <div class="cta-box">${ctaLines}</div>
                    <a href="${applyLink}" class="cta-btn">
                        ${slide.ctaText || 'Visit Now'} →
                    </a>
                    <div class="brand-wm">StudyGyaan.in</div>
                </div>`;
        }

        case 'info':
        case 'content':
        default: {
            const lines = (slide.lines || []).map(l =>
                `<div class="info-line">${l}</div>`
            ).join('');
            return `
                <div class="slide-content">
                    <h2 class="slide-heading">${slide.heading || ''}</h2>
                    <div class="lines-box">${lines}</div>
                    <div class="brand-wm">StudyGyaan.in</div>
                </div>`;
        }
    }
}

// =========================================================
// 🏗️ MULTI-PAGE STORY BUILDER
// =========================================================
function buildMultiPageStory(data: StoryDocData, storyId: string): string {
    const title = data.title || "StudyGyaan Update";
    const canonicalStoryId = data.slug || storyId;
    const coverImage = data.coverImage
        || "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=720&h=1280&fit=crop";
    const applyLink = data.applyLink || "https://studygyaan.in";
    const storyType = String(data.storyType || 'mocktest').toLowerCase();
    const badgeColor = storyType === 'blog' ? '#059669'
        : storyType === 'job' ? '#1d4ed8'
        : storyType === 'fasttrack' ? '#ea580c'
        : '#2563eb';

    // ✅ Slides - Firestore से या default
    let slides: StorySlide[] | undefined = data.slides;
    if (!slides || slides.length < 3) {
        if (storyType === 'blog') {
            slides = [
                {
                    type: 'cover',
                    title: title,
                    subtitle: data.category || 'Education',
                    badge: '📝 NEW BLOG POST'
                },
                {
                    type: 'info',
                    heading: '📌 About This Article',
                    lines: [
                        `📁 ${data.category || 'Education'}`,
                        `✍️ ${data.author || 'StudyGyaan Editorial Team'}`,
                        '🌐 StudyGyaan.in',
                        '📅 Latest 2025 Update'
                    ]
                },
                {
                    type: 'content',
                    heading: '✅ Key Highlights',
                    lines: [
                        '• Complete & Accurate Information',
                        '• Easy Hindi Explanation',
                        '• Free PDF Download Available',
                        '• Updated for 2025 Exams'
                    ]
                },
                {
                    type: 'content',
                    heading: '📚 Why Read This?',
                    lines: [
                        '• Exam-Focused Content',
                        '• Important for Govt Exams',
                        '• Short & Clear Format',
                        '• Expert Written'
                    ]
                },
                {
                    type: 'cta',
                    heading: '🚀 Read Full Article FREE!',
                    lines: [
                        '✅ Free PDF Notes',
                        '✅ Online Mock Tests',
                        '✅ Daily Updates'
                    ],
                    ctaText: 'Read Full Article',
                    ctaLink: applyLink
                }
            ];
        } else {
            slides = [
                {
                    type: 'cover',
                    title: title,
                    subtitle: `${data.subject || 'GK'} Mock Test`,
                    badge: '🎯 FREE MOCK TEST'
                },
                {
                    type: 'stats',
                    heading: '📊 Test Overview',
                    stats: [
                        { icon: '📝', value: String(data.questions || '50'), label: 'Questions' },
                        { icon: '⏱️', value: String(data.duration || '30'), label: 'Minutes' },
                        { icon: '🏆', value: 'FREE', label: 'Cost' },
                        { icon: '📱', value: 'Online', label: 'Mode' }
                    ]
                },
                {
                    type: 'content',
                    heading: '📚 Topics Covered',
                    lines: [
                        '• Important Expected MCQs',
                        '• Previous Year Questions',
                        '• Bilingual Hindi + English',
                        '• With Timer & Explanation'
                    ]
                },
                {
                    type: 'content',
                    heading: '🎯 Best For These Exams',
                    lines: [
                        '• SSC CGL, CHSL 2025',
                        '• RRB NTPC, Group D 2025',
                        '• Bank PO, Clerk 2025',
                        '• Police & State Exams 2025'
                    ]
                },
                {
                    type: 'cta',
                    heading: '🚀 Attempt FREE Now!',
                    lines: [
                        '✅ No Registration Required',
                        '✅ Instant Result & Score',
                        '✅ Free Certificate'
                    ],
                    ctaText: 'Start Test FREE',
                    ctaLink: applyLink
                }
            ];
        }
    }

    // ✅ Build pages HTML
    const pagesHtml = slides.map((slide, idx) => {
        const pageId = idx === 0 ? 'page-cover' : `page-${idx + 1}`;
        const bgGrad = SLIDE_GRADIENTS[idx % SLIDE_GRADIENTS.length];
        const autoAdv = slide.type === 'cta' ? '8s' : '6s';
        const content = buildSlideContent(slide, applyLink);
        const isLastPage = idx === slides.length - 1;

        let bgLayer = '';
        if (idx === 0) {
            // Cover page - image background
            bgLayer = `
                <amp-story-grid-layer template="fill">
                    <amp-img
                        src="${coverImage}"
                        width="720"
                        height="1280"
                        layout="responsive"
                        alt="${title}">
                    </amp-img>
                </amp-story-grid-layer>
                <amp-story-grid-layer template="fill">
                    <div class="overlay-dark"></div>
                </amp-story-grid-layer>`;
        } else {
            // Other pages - gradient background
            bgLayer = `
                <amp-story-grid-layer template="fill">
                    <div style="background:${bgGrad};width:100%;height:100%;"></div>
                </amp-story-grid-layer>`;
        }

        return `
        <amp-story-page id="${pageId}" auto-advance-after="${autoAdv}">
            ${bgLayer}
            <amp-story-grid-layer template="vertical">
                ${content}
            </amp-story-grid-layer>
            ${isLastPage ? `
            <amp-story-page-outlink layout="nodisplay">
                <a href="${applyLink}">Visit StudyGyaan.in</a>
            </amp-story-page-outlink>` : ''}
        </amp-story-page>`;
    }).join('\n');

    // ✅ Bookend
    const bookendJson = JSON.stringify({
        "bookendVersion": "v1.0",
        "shareProviders": [
            { "provider": "whatsapp" },
            { "provider": "twitter" },
            { "provider": "facebook" },
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
                "type": "cta-link",
                "links": [{
                    "text": "🌐 Visit StudyGyaan.in",
                    "url": "https://studygyaan.in"
                }]
            }
        ]
    });

    // ✅ CSS
    const css = `
        body { font-family: 'Segoe UI', sans-serif; margin: 0; }
        amp-story { color: white; }

        .overlay-dark {
            background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.85) 100%);
            width: 100%; height: 100%;
        }

        /* Cover */
        .cover-content {
            position: absolute;
            bottom: 80px; left: 0; right: 0;
            padding: 0 24px;
        }
        .badge {
            color: white;
            background: ${badgeColor};
            padding: 8px 16px;
            border-radius: 30px;
            font-size: 12px;
            font-weight: 900;
            display: inline-block;
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .cover-title {
            font-size: 28px;
            font-weight: 900;
            line-height: 1.2;
            margin: 0 0 12px 0;
            text-shadow: 2px 2px 8px rgba(0,0,0,0.9);
        }
        .cover-sub {
            font-size: 16px;
            color: #fbbf24;
            font-weight: 700;
            margin: 0 0 14px 0;
        }
        .brand-tag {
            background: rgba(255,255,255,0.15);
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 700;
            display: inline-block;
        }

        /* Info/Content Slides */
        .slide-content {
            padding: 40px 20px 80px 20px;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .slide-heading {
            font-size: 22px;
            font-weight: 900;
            color: #fbbf24;
            margin: 0 0 20px 0;
            border-bottom: 3px solid rgba(251,191,36,0.4);
            padding-bottom: 10px;
        }
        .lines-box {
            background: rgba(0,0,0,0.4);
            border-radius: 16px;
            padding: 16px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .info-line {
            font-size: 16px;
            font-weight: 700;
            color: #f1f5f9;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .info-line:last-child { border-bottom: none; }

        /* Stats */
        .stats-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 8px;
        }
        .stat-card {
            flex: 1;
            min-width: 80px;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 14px;
            padding: 14px 6px;
            text-align: center;
        }
        .stat-icon { font-size: 24px; display: block; margin-bottom: 6px; }
        .stat-val { font-size: 20px; font-weight: 900; color: #fbbf24; display: block; }
        .stat-lbl { font-size: 10px; color: #cbd5e1; text-transform: uppercase; font-weight: 700; }

        /* CTA */
        .cta-heading {
            font-size: 24px;
            font-weight: 900;
            color: #fff;
            margin: 0 0 16px 0;
            text-align: center;
        }
        .cta-box {
            background: rgba(255,255,255,0.1);
            border-radius: 14px;
            padding: 16px;
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .cta-line {
            font-size: 16px;
            font-weight: 700;
            color: #a7f3d0;
            padding: 6px 0;
        }
        .cta-btn {
            display: block;
            background: linear-gradient(135deg, #f59e0b, #ef4444);
            color: white;
            text-decoration: none;
            padding: 14px 20px;
            border-radius: 50px;
            font-size: 18px;
            font-weight: 900;
            text-align: center;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }

        /* Brand Watermark */
        .brand-wm {
            position: absolute;
            bottom: 16px; right: 16px;
            font-size: 11px;
            color: rgba(255,255,255,0.4);
            font-weight: 700;
        }
    `;

    return `<!doctype html>
<html amp lang="hi">
<head>
    <meta charset="utf-8">
    <script async src="https://cdn.ampproject.org/v0.js"></script>
    <script async custom-element="amp-story"
        src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
    <title>${title}</title>
    <link rel="canonical" href="https://studygyaan.in/web-stories/${canonicalStoryId}">
    <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
    <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>
    <noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
    <style amp-custom>${css}</style>
</head>
<body>
    <amp-story
        standalone
        title="${title}"
        publisher="StudyGyaan"
        publisher-logo-src="https://studygyaan.in/story-assets/publisher-logo.png"
        poster-portrait-src="${coverImage}">

        ${pagesHtml}

        <amp-story-bookend layout="nodisplay">
            <script type="application/json">
                ${bookendJson}
            </script>
        </amp-story-bookend>

    </amp-story>
</body>
</html>`;
}

// =========================================================
// 🚀 MAIN COMPONENT
// =========================================================
const WebStoryViewer = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [copied, setCopied] = useState(false);

    const { story: loadedStory, loading: storyLoading, error: storyError } = useStory(id);

    // Derived data (sync effect zaroori nahi)
    const storyData = loadedStory as StoryDocData | null;
    const docId = loadedStory?.id ?? null;
    const loading = storyLoading;
    const notFound = Boolean(!id || storyError) || (!storyLoading && !loadedStory?.id);
    const htmlContent = useMemo(
        () => (storyData && docId ? buildMultiPageStory(storyData, docId) : null),
        [storyData, docId]
    );

    // =========================================================
    // 📤 SHARE
    // =========================================================
    const handleShare = useCallback(async () => {
        const url = `https://studygyaan.in/web-stories/${docId || id}`;
        const title = storyData?.title || 'StudyGyaan Web Story';

        if (navigator.share) {
            try {
                await navigator.share({ title, url });
                return;
            } catch { /* cancelled */ }
        }

        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        } catch { /* silent */ }
    }, [storyData, docId, id]);

    // =========================================================
    // 🔄 CLOSE HANDLER
    // =========================================================
    const handleClose = useCallback(() => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/web-stories');
        }
    }, [navigate]);

    // =========================================================
    // 🔄 LOADING
    // =========================================================
    if (loading) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-white">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                <p className="font-black uppercase tracking-widest text-xs">
                    Story Load हो रही है...
                </p>
            </div>
        );
    }

    // =========================================================
    // ❌ NOT FOUND
    // =========================================================
    if (notFound || !htmlContent || !storyData) {
        return (
            <>
                <SEO
                    customTitle="Story Not Found | StudyGyaan"
                    noIndex={true}
                />
                <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-white gap-4">
                    <div className="text-5xl">😔</div>
                    <h1 className="text-xl font-black">Story नहीं मिली!</h1>
                    <a
                        href="/web-stories"
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-blue-700 transition-all"
                    >
                        सभी Stories देखें →
                    </a>
                </div>
            </>
        );
    }

    // =========================================================
    // 📊 SEO DATA
    // =========================================================
    const storySlug = storyData.slug || docId || id;
    const canonicalUrl = `https://studygyaan.in/web-stories/${storySlug}`;
    const publishedIso = getIsoDate(storyData.createdAt);

    // =========================================================
    // 🎨 RENDER
    // =========================================================
    return (
        <div className="h-screen w-screen bg-black flex justify-center items-center fixed inset-0 z-[9999]">

            {/* ✅ SEO - Proper props */}
            <SEO
                customTitle={`${storyData.title} | Web Story | StudyGyaan`}
                customDescription={
                    storyData.description
                    || `${storyData.title} - StudyGyaan Web Story पर पढ़ें।`
                }
                customUrl={canonicalUrl}
                customImage={storyData.coverImage || "https://studygyaan.in/og-image.jpg"}
                customKeywords={`${storyData.title}, Web Story, StudyGyaan, ${storyData.category || 'Education'}`}
                ogType="article"
                publishedDate={publishedIso}
                author={storyData.author || "StudyGyaan"}
                category={storyData.category || "Education"}
            />

            {/* ✅ AMP Story iframe */}
            <iframe
                srcDoc={htmlContent}
                className="w-full h-full max-w-[450px] border-none bg-black shadow-2xl"
                title={storyData.title}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation allow-top-navigation-by-user-activation"
                loading="eager"
            />

            {/* ✅ Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-[10000]">
                {/* Close */}
                <button
                    onClick={handleClose}
                    className="p-2 bg-white/10 hover:bg-red-500 rounded-full text-white transition-all border border-white/20 backdrop-blur-md"
                    aria-label="Story बंद करें"
                >
                    <X size={22} />
                </button>

                {/* Share */}
                <button
                    onClick={handleShare}
                    className="p-2 bg-white/10 hover:bg-blue-500 rounded-full text-white transition-all border border-white/20 backdrop-blur-md"
                    aria-label="Share करें"
                >
                    {copied
                        ? <Check size={22} className="text-green-400" />
                        : <Share2 size={22} />
                    }
                </button>
            </div>

            {/* ✅ Bottom CTA (Visible, Not Hidden!) */}
            <div className="absolute bottom-0 left-0 right-0 max-w-[450px] mx-auto">
                <a
                    href={storyData.applyLink || '/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-black text-sm hover:from-blue-700 transition-all"
                >
                    <span>
                        {storyData.storyType === 'blog'
                            ? '📝 Full Blog पढ़ें'
                            : storyData.storyType === 'job'
                            ? '🏛️ पूरी भर्ती देखें'
                            : storyData.storyType === 'fasttrack'
                            ? '⚡ पूरी जानकारी देखें'
                            : '🎯 Test Attempt करें'
                        }
                    </span>
                    <ExternalLink size={18} />
                </a>
            </div>

            {/* ✅ Visible Related Links (Not Hidden - No Cloaking!) */}
            <nav
                className="absolute bottom-14 left-0 right-0 max-w-[450px] mx-auto px-3 pb-2"
                aria-label="Related Links"
            >
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    {[
                        { href: "/govt-jobs", label: "🏛️ Jobs" },
                        { href: "/test", label: "📝 Tests" },
                        { href: "/blog", label: "📰 Blogs" },
                        { href: "/free-study-material", label: "📚 Notes" }
                    ].map(link => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="shrink-0 bg-white/10 text-white text-[10px] font-black px-3 py-1.5 rounded-full border border-white/20 hover:bg-white/20 transition-all backdrop-blur-sm whitespace-nowrap"
                        >
                            {link.label}
                        </a>
                    ))}
                </div>
            </nav>
        </div>
    );
};

export default WebStoryViewer;

import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_AUTHOR = 'StudyGyaan Editorial Team';

interface PageSeoEntry {
    title: string;
    description: string;
    keywords: string;
}

interface SchemaObject {
    [key: string]: unknown;
}

export interface SEOProps {
    customTitle?: string;
    customDescription?: string;
    customImage?: string;
    customUrl?: string;
    customKeywords?: string;
    ogType?: string;
    publishedDate?: string;
    modifiedDate?: string;
    author?: string;
    category?: string;
    noIndex?: boolean;
    noFollow?: boolean;
    schemaType?: string;
}

// =========================================================
// 📊 PAGE-WISE DEFAULT SEO DATABASE
// =========================================================
const PAGE_SEO_MAP: Record<string, PageSeoEntry> = {
    '/': {
        title: `StudyGyaan - Free Study Material, Govt Jobs & Mock Tests ${CURRENT_YEAR}`,
        description: 'StudyGyaan पर पाएं Latest Sarkari Naukri, Free PDF Notes, Online Mock Tests, Admit Card, Result और Premium Study Material। SSC, Railway, Bank, Police Exam की सबसे बेहतर तैयारी।',
        keywords: `studygyaan, sarkari naukri ${CURRENT_YEAR}, govt jobs, free study material, mock test, SSC CGL, RRB NTPC`
    },
    '/govt-jobs': {
        title: `Latest Govt Jobs ${CURRENT_YEAR} - सरकारी नौकरी | StudyGyaan`,
        description: `सभी Latest Government Jobs ${CURRENT_YEAR} की जानकारी। SSC, Railway, Bank, Police, UPSC और State PSC की Vacancy। Free Application, Syllabus और Preparation Tips।`,
        keywords: `govt jobs ${CURRENT_YEAR}, sarkari naukri, government vacancy, sarkari job alert`
    },
    '/blog': {
        title: `Education Blog - Exam Tips & Updates ${CURRENT_YEAR} | StudyGyaan`,
        description: 'Latest Education News, Exam Analysis, Study Tips और Competitive Exam Updates। SSC, Railway, Banking Exam की पूरी जानकारी Hindi में।',
        keywords: 'education blog hindi, exam tips, study tips, competitive exam updates'
    },
    '/test': {
        title: `Free Online Mock Tests ${CURRENT_YEAR} - Practice Sets | StudyGyaan`,
        description: 'SSC, Railway, Bank, Police के Free Online Mock Tests। Bilingual Hindi+English Practice Sets with Timer। Previous Year Papers और Expected Questions।',
        keywords: 'free mock test, online test series, practice set, SSC mock test, railway mock test'
    },
    '/web-stories': {
        title: 'Web Stories - Quick Updates & News | StudyGyaan',
        description: 'Latest Sarkari Naukri और Exam Updates को Web Stories के format में। Quick, Visual और Easy to read format में सभी important updates।',
        keywords: 'web stories, exam updates, sarkari naukri stories, quick updates'
    },
    '/free-study-material': {
        title: `Free Study Material PDF Download ${CURRENT_YEAR} | StudyGyaan`,
        description: 'SSC, Railway, Bank, Police, UPSC के लिए Free PDF Notes Download करें। Complete Study Material, Previous Year Papers और Topic-wise Notes।',
        keywords: 'free study material pdf, free notes download, SSC notes, railway notes, bank exam pdf'
    },
    '/e-books': {
        title: `Free E-Books Download ${CURRENT_YEAR} - All Exams | StudyGyaan`,
        description: 'All Competitive Exams के लिए Free E-Books। GK, Math, Reasoning, English, Hindi और Science की Complete Books।',
        keywords: 'free ebooks, competitive exam books, GK book pdf, math ebook, reasoning book'
    },
    '/premium-notes': {
        title: `Premium Notes & Study Material ${CURRENT_YEAR} | StudyGyaan`,
        description: 'Expert-prepared Premium Notes जो आपकी Exam Preparation को Next Level ले जाएंगे। Topic-wise Complete Notes with Practice Questions।',
        keywords: 'premium notes, best study material, expert notes, exam preparation notes'
    },
    '/fasttrack': {
        title: 'FastTrack Updates - Latest Exam News | StudyGyaan',
        description: 'सभी Exams की Latest Updates एक जगह। Admit Card, Result, Answer Key और Notification की सबसे Fast Updates।',
        keywords: 'fasttrack updates, latest exam news, admit card, result, answer key'
    },
    '/about-us': {
        title: 'About StudyGyaan - India\'s Trusted Exam Portal',
        description: 'StudyGyaan के बारे में जानें। हमारा Mission, Team और Education के प्रति हमारी Commitment।',
        keywords: 'about studygyaan, education portal, exam preparation website'
    },
    '/contact-us': {
        title: 'Contact Us - StudyGyaan Help & Support',
        description: 'StudyGyaan से Contact करें। किसी भी Help, Feedback या Query के लिए हमसे बात करें।',
        keywords: 'contact studygyaan, help, support, feedback'
    },
    '/privacy-policy': {
        title: 'Privacy Policy | StudyGyaan',
        description: 'StudyGyaan Privacy Policy - हम आपकी Personal Information को कैसे Protect करते हैं।',
        keywords: 'privacy policy, data protection, studygyaan'
    },
    '/terms-conditions': {
        title: 'Terms & Conditions | StudyGyaan',
        description: 'StudyGyaan Terms and Conditions - Website Use के Rules और Regulations।',
        keywords: 'terms conditions, terms of use, studygyaan'
    }
};

const DEFAULT_SEO = {
    title: `StudyGyaan - Sarkari Naukri & Exam Preparation ${CURRENT_YEAR}`,
    description: 'StudyGyaan पर पाएं Latest Govt Jobs, Free Study Material, Mock Tests और Exam Updates। SSC, Railway, Bank, Police की Best Preparation।',
    keywords: 'studygyaan, sarkari naukri, exam preparation, free study material',
    image: 'https://studygyaan.in/og-image.jpg'
};

// =========================================================
// 🔧 HELPER: Clean URL
// =========================================================
const CANONICAL_PATH_ALIASES: Record<string, string> = {
    '/about': '/about-us',
    '/contact': '/contact-us',
    '/mock-tests': '/test',
    '/all-stories': '/web-stories',
    '/jobs': '/govt-jobs',
    '/refund-policy': '/refund-cancellation-policy'
};

/**
 * Canonical URL is normalized in one place so query strings, fragments,
 * trailing slashes and legacy route names can never create duplicate signals.
 */
function cleanUrl(value?: string): string {
    const baseUrl = 'https://studygyaan.in';
    try {
        const url = new URL(value || baseUrl, baseUrl);
        let pathname = url.pathname.replace(/\/{2,}/g, '/');

        pathname = CANONICAL_PATH_ALIASES[pathname] || pathname;
        const prefixAliases = [
            ['/jobs/', '/job/'],
            ['/blogs/', '/blog/'],
            ['/mock-tests/', '/test/'],
            ['/fasttrack/', '/update/'],
            ['/free-study-material/', '/material/'],
            ['/e-book/', '/ebook/']
        ];
        for (const [legacyPrefix, canonicalPrefix] of prefixAliases) {
            if (pathname.startsWith(legacyPrefix)) {
                pathname = `${canonicalPrefix}${pathname.slice(legacyPrefix.length)}`;
                break;
            }
        }

        if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
        return pathname === '/' ? baseUrl : `${baseUrl}${pathname}`;
    } catch {
        return baseUrl;
    }
}

// =========================================================
// 🔧 HELPER: Path to Readable Name
// =========================================================
function pathToTitle(path: string): string {
    if (!path) return 'StudyGyaan';
    return path
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// =========================================================
// 📊 JSON-LD SCHEMA GENERATORS
// =========================================================
function getOrganizationSchema(): SchemaObject {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "StudyGyaan",
        "url": "https://studygyaan.in",
        "logo": {
            "@type": "ImageObject",
            "url": "https://studygyaan.in/logo.png",
            "width": 300,
            "height": 60
        },
        "sameAs": [
            "https://www.youtube.com/@StudyGyaan",
            "https://t.me/studygyaan"
        ],
        "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "customer support",
            "email": "admin@studygyaan.in",
            "availableLanguage": ["Hindi", "English"]
        }
    };
}

function getWebsiteSchema(): SchemaObject {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "StudyGyaan",
        "url": "https://studygyaan.in",
        "description": DEFAULT_SEO.description,
        "inLanguage": "hi",
        "potentialAction": {
            "@type": "SearchAction",
            "target": {
                "@type": "EntryPoint",
                "urlTemplate": "https://studygyaan.in/search?q={search_term_string}"
            },
            "query-input": "required name=search_term_string"
        }
    };
}

function getBreadcrumbSchema(pathname: string): SchemaObject | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    const items: { "@type": string; position: number; name: string; item: string }[] = [
        {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://studygyaan.in"
        }
    ];

    let currentPath = '';
    parts.forEach((part, idx) => {
        currentPath += `/${part}`;
        items.push({
            "@type": "ListItem",
            "position": idx + 2,
            "name": pathToTitle(part),
            "item": `https://studygyaan.in${currentPath}`
        });
    });

    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": items
    };
}

function getArticleSchema(
    title: string,
    description: string,
    image: string,
    url: string,
    publishedDate?: string,
    author?: string
): SchemaObject {
    return {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": title,
        "description": description,
        "image": {
            "@type": "ImageObject",
            "url": image,
            "width": 1200,
            "height": 630
        },
        "url": url,
        "datePublished": publishedDate || new Date().toISOString(),
        "dateModified": new Date().toISOString(),
        "author": {
            "@type": "Organization",
            "name": author || DEFAULT_AUTHOR,
            "url": "https://studygyaan.in"
        },
        "publisher": {
            "@type": "Organization",
            "name": "StudyGyaan",
            "logo": {
                "@type": "ImageObject",
                "url": "https://studygyaan.in/logo.png",
                "width": 300,
                "height": 60
            }
        },
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": url
        },
        "isAccessibleForFree": true,
        "inLanguage": "hi"
    };
}

// =========================================================
// 🚀 MAIN SEO COMPONENT
// =========================================================
const SEO = ({
    // Basic Props
    customTitle,
    customDescription,
    customImage,
    customUrl,
    customKeywords,

    // Type
    ogType = "website", // website | article | product

    // Article specific (Blog/Job pages के लिए)
    publishedDate,
    modifiedDate,
    author,
    category,

    // Control
    noIndex = false,      // 404 pages के लिए
    noFollow = false,     // External pages के लिए

    // Schema
    schemaType = "website" // website | article | breadcrumb | all
}: SEOProps) => {
    const location = useLocation();
    const baseUrl = "https://studygyaan.in";

    // ✅ Clean pathname
    const cleanPathname = location.pathname.endsWith('/')
        && location.pathname.length > 1
        ? location.pathname.slice(0, -1)
        : location.pathname;

    // ✅ Page-specific SEO lookup
    const pageSEO = PAGE_SEO_MAP[cleanPathname] || null;

    // ✅ Final values
    const finalTitle = customTitle
        || (pageSEO && pageSEO.title)
        || DEFAULT_SEO.title;

    const finalDesc = customDescription
        || (pageSEO && pageSEO.description)
        || DEFAULT_SEO.description;

    const finalImage = customImage || DEFAULT_SEO.image;

    const finalUrl = cleanUrl(customUrl || `${baseUrl}${cleanPathname}`);

    const finalKeywords = customKeywords
        || (pageSEO && pageSEO.keywords)
        || DEFAULT_SEO.keywords;

    // ✅ Robots
    const robotsContent = [
        noIndex ? 'noindex' : 'index',
        noFollow ? 'nofollow' : 'follow',
        'max-image-preview:large',
        'max-snippet:-1',
        'max-video-preview:-1'
    ].join(', ');

    // ✅ JSON-LD Schemas
    const schemas: SchemaObject[] = [];

    // Homepage पर Organization + Website schema
    if (cleanPathname === '/' || cleanPathname === '') {
        schemas.push(getOrganizationSchema());
        schemas.push(getWebsiteSchema());
    }

    // Article pages पर Article schema
    if (ogType === 'article' || schemaType === 'article') {
        schemas.push(getArticleSchema(
            finalTitle,
            finalDesc,
            finalImage,
            finalUrl,
            publishedDate,
            author
        ));
    }

    // Breadcrumb - dynamic pages पर
    if (cleanPathname !== '/' && cleanPathname !== '') {
        const breadcrumb = getBreadcrumbSchema(cleanPathname);
        if (breadcrumb) schemas.push(breadcrumb);
    }

    // ✅ Published time for articles
    const pubTime = publishedDate || new Date().toISOString();
    const modTime = modifiedDate || new Date().toISOString();

    return (
        <Helmet>
            {/* ===== BASIC META ===== */}
            <title>{finalTitle}</title>
            <meta name="description" content={finalDesc} />
            <meta name="keywords" content={finalKeywords} />
            <meta name="author" content={author || DEFAULT_AUTHOR} />
            <meta name="robots" content={robotsContent} />
            <meta name="googlebot" content={robotsContent} />

            {/* ===== CANONICAL ===== */}
            <link rel="canonical" href={finalUrl} />

            {/* ===== LANGUAGE ===== */}
            <html lang="hi" />
            <meta httpEquiv="content-language" content="hi" />

            {/* ===== OPEN GRAPH ===== */}
            <meta property="og:locale" content="hi_IN" />
            <meta property="og:locale:alternate" content="en_US" />
            <meta property="og:type" content={ogType} />
            <meta property="og:title" content={finalTitle} />
            <meta property="og:description" content={finalDesc} />
            <meta property="og:url" content={finalUrl} />
            <meta property="og:site_name" content="StudyGyaan" />
            <meta property="og:image" content={finalImage} />
            <meta property="og:image:secure_url" content={finalImage} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:image:type" content="image/jpeg" />
            <meta property="og:image:alt" content={finalTitle} />

            {/* ===== ARTICLE META (Blog/Job pages) ===== */}
            {ogType === 'article' && (
                <>
                    <meta property="article:published_time" content={pubTime} />
                    <meta property="article:modified_time" content={modTime} />
                    <meta property="article:author" content={author || DEFAULT_AUTHOR} />
                    {category && (
                        <meta property="article:section" content={category} />
                    )}
                </>
            )}

            {/* ===== TWITTER ===== */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:site" content="@StudyGyaan" />
            <meta name="twitter:creator" content="@StudyGyaan" />
            <meta name="twitter:title" content={finalTitle} />
            <meta name="twitter:description" content={finalDesc} />
            <meta name="twitter:image" content={finalImage} />
            <meta name="twitter:image:alt" content={finalTitle} />

            {/* ===== JSON-LD SCHEMAS ===== */}
            {schemas.map((schema, idx) => (
                <script
                    key={idx}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(schema, null, 0)
                    }}
                />
            ))}
        </Helmet>
    );
};

export default SEO;
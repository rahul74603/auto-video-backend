/**
 * jobHubs.ts — 🎯 PROGRAMMATIC SEO HUB PAGES config
 * ===================================================
 * Har hub = ek high-search-volume landing page (/jobs/10th-pass, /jobs/mp ...)
 * Jobs ke existing fields (qualification/location/category/title) se
 * AUTO-FILTER hota hai — koi manual kaam nahi.
 *
 * ⚠️ NOTE: seo_static/hubs.cjs me YAHI slugs + patterns hain (bots/sitemap ke
 * liye) — yahan kuch badlo to wahan bhi badlna.
 */

export type JobHub = {
    slug: string;
    label: string;        // chip/button text
    h1: string;           // page heading
    seoTitle: string;
    metaDescription: string;
    group: 'qualification' | 'category' | 'state';
    emoji: string;
    pattern: string;      // regex (case-insensitive) — title+qualification+location+category pe
};

const YEAR = new Date().getFullYear();

export const JOB_HUBS: JobHub[] = [
    // ===== QUALIFICATION =====
    { slug: '10th-pass', label: '10th Pass Jobs', emoji: '🎒', group: 'qualification',
      h1: `10th Pass Govt Jobs ${YEAR} — 10वीं पास सरकारी नौकरी`,
      seoTitle: `10th Pass Govt Jobs ${YEAR}: Latest 10वीं पास Sarkari Naukri`,
      metaDescription: `10th pass govt jobs ${YEAR} ki latest list — vacancy, last date, apply link. 10वीं पास ke liye railway, police, army sarkari naukri yahan dekhein.`,
      pattern: '(10th|10 th|matric|high school|10वीं|dasvi)' },
    { slug: '12th-pass', label: '12th Pass Jobs', emoji: '📗', group: 'qualification',
      h1: `12th Pass Govt Jobs ${YEAR} — 12वीं पास सरकारी नौकरी`,
      seoTitle: `12th Pass Govt Jobs ${YEAR}: Latest 12वीं पास Sarkari Naukri`,
      metaDescription: `12th pass govt jobs ${YEAR} — intermediate pass ke liye latest sarkari naukri, vacancy details, last date aur apply online links.`,
      pattern: '(12th|12 th|10\\+2|intermediate|higher secondary|12वीं)' },
    { slug: 'graduate', label: 'Graduate Jobs', emoji: '🎓', group: 'qualification',
      h1: `Graduate Govt Jobs ${YEAR} — ग्रेजुएट सरकारी नौकरी`,
      seoTitle: `Graduate Govt Jobs ${YEAR}: Degree Pass Sarkari Naukri List`,
      metaDescription: `Graduation complete? Latest graduate govt jobs ${YEAR} — bank PO, SSC CGL, UPSC aur degree-pass sarkari naukri ki poori list yahan.`,
      pattern: '(graduat|bachelor|degree|\\bb\\.?a\\b|\\bb\\.?sc\\b|\\bb\\.?com\\b|\\bb\\.?tech\\b|स्नातक)' },
    { slug: 'iti', label: 'ITI Jobs', emoji: '🔧', group: 'qualification',
      h1: `ITI Govt Jobs ${YEAR} — ITI पास सरकारी नौकरी`,
      seoTitle: `ITI Govt Jobs ${YEAR}: Latest ITI Pass Sarkari Naukri & Apprentice`,
      metaDescription: `ITI pass ke liye latest govt jobs ${YEAR} — railway apprentice, technician, fitter, electrician sarkari vacancy list with apply links.`,
      pattern: '\\biti\\b|apprentice' },
    { slug: 'diploma', label: 'Diploma Jobs', emoji: '📐', group: 'qualification',
      h1: `Diploma Govt Jobs ${YEAR} — डिप्लोमा सरकारी नौकरी`,
      seoTitle: `Diploma Govt Jobs ${YEAR}: Polytechnic Diploma Sarkari Naukri`,
      metaDescription: `Diploma/polytechnic holders ke liye latest govt jobs ${YEAR} — junior engineer, technician aur diploma-pass sarkari vacancies yahan dekhein.`,
      pattern: 'diploma|polytechnic' },

    // ===== CATEGORY =====
    { slug: 'railway', label: 'Railway Jobs', emoji: '🚂', group: 'category',
      h1: `Railway Govt Jobs ${YEAR} — रेलवे भर्ती`,
      seoTitle: `Railway Jobs ${YEAR}: Latest RRB/RRC Bharti, Vacancy & Apply`,
      metaDescription: `Railway recruitment ${YEAR} — RRB NTPC, Group D, JE, ALP aur RRC apprentice ki latest bharti, vacancy, last date aur apply online link.`,
      pattern: 'railway|\\brrb\\b|\\brrc\\b|metro|\\bntpc\\b|रेलवे' },
    { slug: 'banking', label: 'Bank Jobs', emoji: '🏦', group: 'category',
      h1: `Bank Govt Jobs ${YEAR} — बैंक भर्ती`,
      seoTitle: `Bank Jobs ${YEAR}: IBPS, SBI, RBI Latest Bharti & Vacancy`,
      metaDescription: `Banking jobs ${YEAR} — IBPS PO/Clerk, SBI, RBI aur gramin bank ki latest bharti, eligibility, last date aur apply online links yahan.`,
      pattern: '\\bbank\\b|ibps|\\bsbi\\b|\\brbi\\b|nabard|बैंक' },
    { slug: 'ssc', label: 'SSC Jobs', emoji: '📋', group: 'category',
      h1: `SSC Jobs ${YEAR} — SSC भर्ती`,
      seoTitle: `SSC Jobs ${YEAR}: CGL, CHSL, GD, MTS Latest Recruitment`,
      metaDescription: `SSC recruitment ${YEAR} — CGL, CHSL, GD Constable, MTS, Stenographer ki latest vacancy, exam dates aur apply online details.`,
      pattern: '\\bssc\\b' },
    { slug: 'defence', label: 'Defence Jobs', emoji: '🪖', group: 'category',
      h1: `Defence Govt Jobs ${YEAR} — सेना भर्ती`,
      seoTitle: `Defence Jobs ${YEAR}: Army, Navy, Airforce, Agniveer Bharti`,
      metaDescription: `Defence recruitment ${YEAR} — Indian Army, Navy, Air Force, Agniveer, BSF, CRPF, CISF ki latest bharti aur eligibility details.`,
      pattern: '\\barmy\\b|navy|air force|airforce|defence|defense|\\bbsf\\b|crpf|cisf|itbp|\\bssb\\b|coast guard|agniveer|सेना' },
    { slug: 'police', label: 'Police Jobs', emoji: '👮', group: 'category',
      h1: `Police Bharti ${YEAR} — पुलिस भर्ती`,
      seoTitle: `Police Bharti ${YEAR}: Constable, SI Latest Recruitment`,
      metaDescription: `Police bharti ${YEAR} — constable, SI, head constable ki state-wise latest vacancy, physical eligibility, last date aur apply links.`,
      pattern: 'police|constable|पुलिस|सिपाही' },
    { slug: 'teaching', label: 'Teaching Jobs', emoji: '👨‍🏫', group: 'category',
      h1: `Teaching Govt Jobs ${YEAR} — शिक्षक भर्ती`,
      seoTitle: `Teaching Jobs ${YEAR}: Teacher, TGT, PGT Latest Bharti`,
      metaDescription: `Teacher bharti ${YEAR} — TGT, PGT, PRT, assistant professor aur shikshak ki latest sarkari vacancy, eligibility aur apply details.`,
      pattern: 'teacher|teaching|\\btgt\\b|\\bpgt\\b|\\bprt\\b|professor|faculty|lecturer|शिक्षक' },
    { slug: 'engineering', label: 'Engineering Jobs', emoji: '⚙️', group: 'category',
      h1: `Engineering Govt Jobs ${YEAR} — इंजीनियर भर्ती`,
      seoTitle: `Engineering Govt Jobs ${YEAR}: JE, AE Sarkari Naukri`,
      metaDescription: `Engineers ke liye govt jobs ${YEAR} — junior engineer (JE), assistant engineer (AE), PSU aur technical sarkari vacancies ki list.`,
      pattern: 'engineer|\\bje\\b|\\bjen\\b|\\baee\\b|\\bae\\b' },
    { slug: 'upsc', label: 'UPSC Jobs', emoji: '🏛️', group: 'category',
      h1: `UPSC Recruitment ${YEAR} — UPSC भर्ती`,
      seoTitle: `UPSC Jobs ${YEAR}: Civil Services & Latest UPSC Bharti`,
      metaDescription: `UPSC recruitment ${YEAR} — civil services, EPFO, CDS, NDA aur UPSC ki direct bharti ki latest vacancies aur apply online links.`,
      pattern: '\\bupsc\\b|civil services|\\bias\\b|\\bips\\b|\\bnda\\b|\\bcds\\b' },

    // ===== STATE =====
    { slug: 'up', label: 'UP Jobs', emoji: '📍', group: 'state',
      h1: `UP Govt Jobs ${YEAR} — उत्तर प्रदेश सरकारी नौकरी`,
      seoTitle: `UP Govt Jobs ${YEAR}: Uttar Pradesh Latest Sarkari Naukri`,
      metaDescription: `UP govt jobs ${YEAR} — UPPSC, UPSSSC, UP Police aur Uttar Pradesh ki saari latest sarkari bharti, vacancy aur apply links.`,
      pattern: 'uttar pradesh|\\bup\\b|uppsc|upsssc|उत्तर प्रदेश' },
    { slug: 'mp', label: 'MP Jobs', emoji: '📍', group: 'state',
      h1: `MP Govt Jobs ${YEAR} — मध्य प्रदेश सरकारी नौकरी`,
      seoTitle: `MP Govt Jobs ${YEAR}: Madhya Pradesh Latest Sarkari Naukri`,
      metaDescription: `MP govt jobs ${YEAR} — MPPSC, MPESB, MP Police aur Madhya Pradesh ki latest sarkari bharti, vacancy details aur apply online.`,
      pattern: 'madhya pradesh|\\bmp\\b|mppsc|mpesb|मध्य प्रदेश' },
    { slug: 'bihar', label: 'Bihar Jobs', emoji: '📍', group: 'state',
      h1: `Bihar Govt Jobs ${YEAR} — बिहार सरकारी नौकरी`,
      seoTitle: `Bihar Govt Jobs ${YEAR}: BPSC & Latest Bihar Sarkari Naukri`,
      metaDescription: `Bihar govt jobs ${YEAR} — BPSC, Bihar Police, BSSC ki latest bharti, vacancy, eligibility aur apply online links yahan dekhein.`,
      pattern: 'bihar|bpsc|bssc|बिहार' },
    { slug: 'rajasthan', label: 'Rajasthan Jobs', emoji: '📍', group: 'state',
      h1: `Rajasthan Govt Jobs ${YEAR} — राजस्थान सरकारी नौकरी`,
      seoTitle: `Rajasthan Govt Jobs ${YEAR}: RPSC, RSMSSB Latest Bharti`,
      metaDescription: `Rajasthan govt jobs ${YEAR} — RPSC, RSMSSB, Rajasthan Police ki latest sarkari bharti, vacancy aur apply online details.`,
      pattern: 'rajasthan|rpsc|rsmssb|राजस्थान' },
    { slug: 'maharashtra', label: 'Maharashtra Jobs', emoji: '📍', group: 'state',
      h1: `Maharashtra Govt Jobs ${YEAR} — महाराष्ट्र सरकारी नौकरी`,
      seoTitle: `Maharashtra Govt Jobs ${YEAR}: MPSC & Latest Sarkari Naukri`,
      metaDescription: `Maharashtra govt jobs ${YEAR} — MPSC aur Maharashtra ki latest sarkari bharti, vacancy details, last date aur apply online links.`,
      pattern: 'maharashtra|\\bmpsc\\b|महाराष्ट्र' },
];

export const findHub = (slug: string): JobHub | undefined =>
    JOB_HUBS.find((h) => h.slug === slug);

export const hubMatches = (hub: JobHub, haystack: string): boolean =>
    new RegExp(hub.pattern, 'i').test(haystack);

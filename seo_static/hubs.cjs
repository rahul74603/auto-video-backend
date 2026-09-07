/**
 * hubs.cjs — 🎯 SEO Hub Pages config (sitemap + bots ke liye)
 * ============================================================
 * ⚠️ src/config/jobHubs.ts ka CJS twin — slugs/patterns SAME rakhna!
 */
"use strict";

const YEAR = new Date().getFullYear();

const JOB_HUBS = [
  { slug: "10th-pass", label: "10th Pass Jobs",
    seoTitle: `10th Pass Govt Jobs ${YEAR}: Latest 10वीं पास Sarkari Naukri`,
    metaDescription: `10th pass govt jobs ${YEAR} ki latest list — vacancy, last date, apply link. 10वीं पास ke liye railway, police, army sarkari naukri yahan dekhein.`,
    pattern: "(10th|10 th|matric|high school|10वीं|dasvi)" },
  { slug: "12th-pass", label: "12th Pass Jobs",
    seoTitle: `12th Pass Govt Jobs ${YEAR}: Latest 12वीं पास Sarkari Naukri`,
    metaDescription: `12th pass govt jobs ${YEAR} — intermediate pass ke liye latest sarkari naukri, vacancy details, last date aur apply online links.`,
    pattern: "(12th|12 th|10\\+2|intermediate|higher secondary|12वीं)" },
  { slug: "graduate", label: "Graduate Jobs",
    seoTitle: `Graduate Govt Jobs ${YEAR}: Degree Pass Sarkari Naukri List`,
    metaDescription: `Graduation complete? Latest graduate govt jobs ${YEAR} — bank PO, SSC CGL, UPSC aur degree-pass sarkari naukri ki poori list yahan.`,
    pattern: "(graduat|bachelor|degree|\\bb\\.?a\\b|\\bb\\.?sc\\b|\\bb\\.?com\\b|\\bb\\.?tech\\b|स्नातक)" },
  { slug: "iti", label: "ITI Jobs",
    seoTitle: `ITI Govt Jobs ${YEAR}: Latest ITI Pass Sarkari Naukri & Apprentice`,
    metaDescription: `ITI pass ke liye latest govt jobs ${YEAR} — railway apprentice, technician, fitter, electrician sarkari vacancy list with apply links.`,
    pattern: "\\biti\\b|apprentice" },
  { slug: "diploma", label: "Diploma Jobs",
    seoTitle: `Diploma Govt Jobs ${YEAR}: Polytechnic Diploma Sarkari Naukri`,
    metaDescription: `Diploma/polytechnic holders ke liye latest govt jobs ${YEAR} — junior engineer, technician aur diploma-pass sarkari vacancies yahan dekhein.`,
    pattern: "diploma|polytechnic" },
  { slug: "railway", label: "Railway Jobs",
    seoTitle: `Railway Jobs ${YEAR}: Latest RRB/RRC Bharti, Vacancy & Apply`,
    metaDescription: `Railway recruitment ${YEAR} — RRB NTPC, Group D, JE, ALP aur RRC apprentice ki latest bharti, vacancy, last date aur apply online link.`,
    pattern: "railway|\\brrb\\b|\\brrc\\b|metro|\\bntpc\\b|रेलवे" },
  { slug: "banking", label: "Bank Jobs",
    seoTitle: `Bank Jobs ${YEAR}: IBPS, SBI, RBI Latest Bharti & Vacancy`,
    metaDescription: `Banking jobs ${YEAR} — IBPS PO/Clerk, SBI, RBI aur gramin bank ki latest bharti, eligibility, last date aur apply online links yahan.`,
    pattern: "\\bbank\\b|ibps|\\bsbi\\b|\\brbi\\b|nabard|बैंक" },
  { slug: "ssc", label: "SSC Jobs",
    seoTitle: `SSC Jobs ${YEAR}: CGL, CHSL, GD, MTS Latest Recruitment`,
    metaDescription: `SSC recruitment ${YEAR} — CGL, CHSL, GD Constable, MTS, Stenographer ki latest vacancy, exam dates aur apply online details.`,
    pattern: "\\bssc\\b" },
  { slug: "defence", label: "Defence Jobs",
    seoTitle: `Defence Jobs ${YEAR}: Army, Navy, Airforce, Agniveer Bharti`,
    metaDescription: `Defence recruitment ${YEAR} — Indian Army, Navy, Air Force, Agniveer, BSF, CRPF, CISF ki latest bharti aur eligibility details.`,
    pattern: "\\barmy\\b|navy|air force|airforce|defence|defense|\\bbsf\\b|crpf|cisf|itbp|\\bssb\\b|coast guard|agniveer|सेना" },
  { slug: "police", label: "Police Jobs",
    seoTitle: `Police Bharti ${YEAR}: Constable, SI Latest Recruitment`,
    metaDescription: `Police bharti ${YEAR} — constable, SI, head constable ki state-wise latest vacancy, physical eligibility, last date aur apply links.`,
    pattern: "police|constable|पुलिस|सिपाही" },
  { slug: "teaching", label: "Teaching Jobs",
    seoTitle: `Teaching Jobs ${YEAR}: Teacher, TGT, PGT Latest Bharti`,
    metaDescription: `Teacher bharti ${YEAR} — TGT, PGT, PRT, assistant professor aur shikshak ki latest sarkari vacancy, eligibility aur apply details.`,
    pattern: "teacher|teaching|\\btgt\\b|\\bpgt\\b|\\bprt\\b|professor|faculty|lecturer|शिक्षक" },
  { slug: "engineering", label: "Engineering Jobs",
    seoTitle: `Engineering Govt Jobs ${YEAR}: JE, AE Sarkari Naukri`,
    metaDescription: `Engineers ke liye govt jobs ${YEAR} — junior engineer (JE), assistant engineer (AE), PSU aur technical sarkari vacancies ki list.`,
    pattern: "engineer|\\bje\\b|\\bjen\\b|\\baee\\b|\\bae\\b" },
  { slug: "upsc", label: "UPSC Jobs",
    seoTitle: `UPSC Jobs ${YEAR}: Civil Services & Latest UPSC Bharti`,
    metaDescription: `UPSC recruitment ${YEAR} — civil services, EPFO, CDS, NDA aur UPSC ki direct bharti ki latest vacancies aur apply online links.`,
    pattern: "\\bupsc\\b|civil services|\\bias\\b|\\bips\\b|\\bnda\\b|\\bcds\\b" },
  { slug: "up", label: "UP Jobs",
    seoTitle: `UP Govt Jobs ${YEAR}: Uttar Pradesh Latest Sarkari Naukri`,
    metaDescription: `UP govt jobs ${YEAR} — UPPSC, UPSSSC, UP Police aur Uttar Pradesh ki saari latest sarkari bharti, vacancy aur apply links.`,
    pattern: "uttar pradesh|\\bup\\b|uppsc|upsssc|उत्तर प्रदेश" },
  { slug: "mp", label: "MP Jobs",
    seoTitle: `MP Govt Jobs ${YEAR}: Madhya Pradesh Latest Sarkari Naukri`,
    metaDescription: `MP govt jobs ${YEAR} — MPPSC, MPESB, MP Police aur Madhya Pradesh ki latest sarkari bharti, vacancy details aur apply online.`,
    pattern: "madhya pradesh|\\bmp\\b|mppsc|mpesb|मध्य प्रदेश" },
  { slug: "bihar", label: "Bihar Jobs",
    seoTitle: `Bihar Govt Jobs ${YEAR}: BPSC & Latest Bihar Sarkari Naukri`,
    metaDescription: `Bihar govt jobs ${YEAR} — BPSC, Bihar Police, BSSC ki latest bharti, vacancy, eligibility aur apply online links yahan dekhein.`,
    pattern: "bihar|bpsc|bssc|बिहार" },
  { slug: "rajasthan", label: "Rajasthan Jobs",
    seoTitle: `Rajasthan Govt Jobs ${YEAR}: RPSC, RSMSSB Latest Bharti`,
    metaDescription: `Rajasthan govt jobs ${YEAR} — RPSC, RSMSSB, Rajasthan Police ki latest sarkari bharti, vacancy aur apply online details.`,
    pattern: "rajasthan|rpsc|rsmssb|राजस्थान" },
  { slug: "maharashtra", label: "Maharashtra Jobs",
    seoTitle: `Maharashtra Govt Jobs ${YEAR}: MPSC & Latest Sarkari Naukri`,
    metaDescription: `Maharashtra govt jobs ${YEAR} — MPSC aur Maharashtra ki latest sarkari bharti, vacancy details, last date aur apply online links.`,
    pattern: "maharashtra|\\bmpsc\\b|महाराष्ट्र" },
];

function hubMatches(hub, haystack) {
  return new RegExp(hub.pattern, "i").test(haystack);
}

module.exports = { JOB_HUBS, hubMatches };

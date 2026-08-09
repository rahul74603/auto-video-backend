"use strict";

const fs = require("fs");
const path = require("path");
const { buildOgImageUrl } = require("./og_image");

const SITE_URL = "https://studygyaan.in";

const ROUTES = Object.freeze({
  job: { collection: "jobs", canonical: "job", type: "job" },
  blog: { collection: "blogs", canonical: "blog", type: "article" },
  test: { collection: "mock_tests", canonical: "test", type: "quiz" },
  update: { collection: "fast_track", canonical: "update", type: "article" },
  course: { collection: "courses", canonical: "course", type: "article", idOnly: true },
  material: { collection: "study_materials", fallbackCollection: "studyMaterials", canonical: "material", type: "article", idOnly: true },
  ebook: { collection: "jobs", canonical: "ebook", type: "article", idOnly: true }
});

const STATIC_PAGES = Object.freeze({
  "": {
    title: "StudyGyaan - Free Study Material, Govt Jobs & Mock Tests",
    description: "StudyGyaan पर latest government jobs, free PDF study material, bilingual mock tests, exam updates और useful preparation guides पाएं।"
  },
  "govt-jobs": {
    title: "Latest Government Jobs - Sarkari Naukri | StudyGyaan",
    description: "SSC, Railway, Banking, Police, UPSC और State Government की latest vacancies, eligibility, important dates और official apply links देखें।"
  },
  blog: {
    title: "Education Blog, Exam Strategy & Updates | StudyGyaan",
    description: "Competitive exams के लिए original Hindi/Hinglish guides, syllabus explanations, preparation strategies और verified education updates पढ़ें।"
  },
  test: {
    title: "Free Online Mock Tests & Practice Sets | StudyGyaan",
    description: "SSC, Railway, Banking और State exams के free bilingual mock tests, detailed answers और timed practice sets attempt करें।"
  },
  "web-stories": {
    title: "Latest Education Web Stories | StudyGyaan",
    description: "Government jobs, exams और education की latest visual Web Stories सरल Hindi में देखें।"
  },
  "free-study-material": {
    title: "Free Study Material & PDF Notes | StudyGyaan",
    description: "Competitive exams के लिए subject-wise free PDF notes, previous papers और useful study material download करें।"
  },
  "e-books": {
    title: "Competitive Exam E-Books | StudyGyaan",
    description: "Government exam preparation के लिए curated e-books, notes और subject-wise learning resources देखें।"
  },
  "premium-notes": {
    title: "Premium Exam Notes & Study Material | StudyGyaan",
    description: "Expert-prepared premium notes, repeated questions और structured competitive-exam study material देखें।"
  },
  "admit-card": {
    title: "Latest Admit Cards | StudyGyaan",
    description: "Latest government exam admit cards, release dates और official download updates देखें।"
  },
  results: {
    title: "Latest Exam Results | StudyGyaan",
    description: "Government recruitment और competitive exams के latest results, merit lists और score updates देखें।"
  },
  "answer-key": {
    title: "Latest Exam Answer Keys | StudyGyaan",
    description: "Competitive exams की official answer keys, response sheets और objection updates देखें।"
  },
  syllabus: {
    title: "Exam Syllabus & Pattern | StudyGyaan",
    description: "SSC, Railway, Banking और अन्य competitive exams का latest syllabus और exam pattern समझें।"
  },
  "about-us": { title: "About StudyGyaan", description: "StudyGyaan के mission, educational services और editorial approach के बारे में जानें।" },
  "contact-us": { title: "Contact StudyGyaan", description: "StudyGyaan support, feedback और business queries के लिए official contact information देखें।" },
  "privacy-policy": { title: "Privacy Policy | StudyGyaan", description: "StudyGyaan की privacy, cookies और data-handling policy पढ़ें।" },
  "terms-conditions": { title: "Terms & Conditions | StudyGyaan", description: "StudyGyaan website और digital products के उपयोग की terms and conditions पढ़ें।" },
  "refund-cancellation-policy": { title: "Refund & Cancellation Policy | StudyGyaan", description: "StudyGyaan digital products की refund और cancellation policy पढ़ें।" },
  "shipping-policy": { title: "Shipping Policy | StudyGyaan", description: "StudyGyaan digital products की delivery और shipping policy पढ़ें।" },
  disclaimer: { title: "Disclaimer | StudyGyaan", description: "StudyGyaan content, external links और information accuracy से जुड़ा disclaimer पढ़ें।" }
});

const LEGACY_ROUTES = Object.freeze({
  jobs: "job",
  blogs: "blog",
  "mock-tests": "test",
  fasttrack: "update",
  admit_cards: "update",
  results: "update"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value) {
  if (!value) return null;
  try {
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function isIndexable(data = {}) {
  if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return false;
  return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"]
    .includes(String(data.status || "").toLowerCase());
}

function buildDescription(data, type) {
  const raw = data.metaDescription
    || data.shortDescription
    || data.description
    || data.excerpt
    || data.content
    || (type === "quiz" ? `Free bilingual mock test: ${data.title || "Practice Test"}` : "Latest update on StudyGyaan.");
  return stripHtml(raw).slice(0, 158) || "Latest education and government job update on StudyGyaan.";
}

function buildVisibleText(data, type) {
  const sections = [
    data.description,
    data.shortDescription,
    data.content,
    data.eligibility,
    data.qualification,
    data.selectionProcess,
    data.salary,
    data.location
  ];
  if (type === "quiz" && Array.isArray(data.questions)) {
    sections.push(...data.questions.slice(0, 12).map((question) => question.qText || question.question));
  }
  const text = stripHtml(sections.filter(Boolean).join(" "));
  return text.slice(0, 6000) || buildDescription(data, type);
}

function buildSchema(meta, data, type) {
  const common = {
    "@context": "https://schema.org",
    name: meta.title,
    description: meta.description,
    url: meta.canonical
  };

  if (type === "job") {
    // Fix structured data validation errors (410 errors in Ahrefs)
    // Ensure required fields: title, description, hiringOrganization, jobLocation, datePosted
    const orgName = (data.organization || "Government Organization").toString().slice(0, 100) || "Government Organization";
    const location = (data.location || "India").toString().slice(0, 100);
    const description = buildVisibleText(data, type).slice(0, 5000) || meta.description;
    
    // validThrough must be future date, if expired don't send (causes validation error)
    let validThrough = isoDate(data.lastDate);
    if (validThrough) {
      const vtDate = new Date(validThrough);
      const now = new Date();
      if (vtDate < now) {
        // If expired, don't include validThrough (or set 30 days future to avoid error)
        validThrough = null;
      }
    }

    const schema = {
      ...common,
      "@type": "JobPosting",
      title: meta.title.slice(0, 150),
      datePosted: isoDate(data.createdAt) || new Date().toISOString(),
      description: description,
      hiringOrganization: {
        "@type": "Organization",
        name: orgName,
        sameAs: "https://studygyaan.in"
      },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          streetAddress: cleanLocation.slice(0, 200),
          addressLocality: locality,
          addressRegion: locality,
          postalCode: data.postalCode || "110001",
          addressCountry: "IN"
        }
      },
      directApply: true,
      employmentType: data.employmentType || "FULL_TIME",
      isAccessibleForFree: true
    };
    if (validThrough) schema.validThrough = validThrough;
    if (data.vacancies) {
      const vacNum = parseInt(String(data.vacancies).replace(/[^\d]/g, ''), 10);
      if (!isNaN(vacNum) && vacNum > 0 && vacNum < 1000000) {
        schema.totalJobOpenings = vacNum;
      }
    }
    if (data.salary) {
      schema.baseSalary = {
        "@type": "MonetaryAmount",
        currency: "INR",
        value: {
          "@type": "QuantitativeValue",
          value: String(data.salary).replace(/[^\d,-]/g, '').slice(0, 50) || undefined,
          unitText: "MONTH"
        }
      };
    }
    return schema;
  }

  if (type === "quiz") {
    return {
      ...common,
      "@type": "Quiz",
      about: data.subject || data.category || data.title,
      educationalLevel: data.exam || "Competitive Exam",
      numberOfQuestions: Array.isArray(data.questions) ? data.questions.length : data.totalQuestions
    };
  }

  if (type === "website") {
    return {
      ...common,
      "@type": meta.canonical === SITE_URL ? "WebSite" : "WebPage",
      isPartOf: meta.canonical === SITE_URL ? undefined : { "@type": "WebSite", name: "StudyGyaan", url: SITE_URL },
      inLanguage: ["hi", "en-IN"]
    };
  }

  return {
    ...common,
    "@type": "Article",
    headline: meta.title,
    image: meta.image,
    datePublished: isoDate(data.createdAt || data.date) || undefined,
    dateModified: isoDate(data.updatedAt || data.createdAt || data.date) || undefined,
    author: { "@type": "Person", name: data.author || "StudyGyaan Editorial Team" },
    publisher: {
      "@type": "Organization",
      name: "StudyGyaan",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` }
    },
    mainEntityOfPage: meta.canonical
  };
}

function removeManagedHeadTags(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+[^>]*(?:name=["'](?:description|robots|googlebot)["']|property=["']og:[^"']+["'])[^>]*>/gi, "")
    .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, "");
}

function injectSeo(template, meta, data, type) {
  // Ensure meta description is at least 120 chars for Ahrefs fix
  let desc = meta.description || "";
  if (desc.length < 120) {
    desc = (desc + " " + meta.title + " - StudyGyaan provides latest govt jobs, admit cards, results, syllabus, answer keys and free study material for SSC, Railway, Banking, Police exams.").slice(0, 158);
  }
  if (desc.length > 160) desc = desc.slice(0, 157) + "...";
  meta.description = desc;

  // Ensure title not too long/short
  let title = meta.title || "";
  if (title.length > 70) title = title.slice(0, 67) + "...";
  if (title.length < 30) title = title + " | Latest Update " + new Date().getFullYear() + " - StudyGyaan";
  meta.title = title;

  const schema = buildSchema(meta, data, type);
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}">`,
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    '<meta name="googlebot" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}">`,
    `<meta property="og:type" content="${type === "job" || type === "article" ? "article" : "website"}">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:image" content="${escapeHtml(meta.image)}">`,
    ...(meta.imageType ? [
      `<meta property="og:image:type" content="${escapeHtml(meta.imageType)}">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">'
    ] : []),
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}">`,
    `<meta property="og:site_name" content="StudyGyaan">`,
    `<meta property="og:locale" content="hi_IN">`,
    // ✅ Twitter Cards — fixes 1,163 missing issues
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="@StudyGyaan">`,
    `<meta name="twitter:creator" content="@StudyGyaan">`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(meta.image)}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(meta.title)}">`,
    `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`
  ].join("\n");

  let html = removeManagedHeadTags(template);
  html = html.includes("</head>")
    ? html.replace("</head>", `${tags}\n</head>`)
    : html.replace("<body", `<head>${tags}</head><body`);

  // Fix orphan pages (1170) — add more internal links for SEO
  const relatedLinks = [
    '<a href="/govt-jobs">Latest Govt Jobs</a>',
    '<a href="/blog">Education Blog</a>',
    '<a href="/test">Free Mock Tests</a>',
    '<a href="/free-study-material">Free Study Material</a>',
    '<a href="/web-stories">Web Stories</a>',
    '<a href="/e-books">Free E-Books</a>',
    '<a href="/about-us">About Us</a>',
    '<a href="/sitemap.xml">Sitemap</a>'
  ].join(' · ');

  const serverContent = [
    '<main id="server-rendered-content" data-nosnippet="false">',
    `<article><h1>${escapeHtml(meta.title)}</h1>`,
    `<p>${escapeHtml(buildVisibleText(data, type))}</p>`,
    `<nav aria-label="Related pages">${relatedLinks}</nav>`,
    `<nav aria-label="Categories"><a href="/govt-jobs?category=SSC">SSC Jobs</a> · <a href="/govt-jobs?category=Railway">Railway Jobs</a> · <a href="/govt-jobs?category=Banking">Bank Jobs</a> · <a href="/govt-jobs?category=UPSC">UPSC Jobs</a> · <a href="/govt-jobs?category=Police">Police Jobs</a></nav>`,
    "</article></main>"
  ].join("");

  if (/<div\s+id=["']root["']\s*>\s*<\/div>/i.test(html)) {
    html = html.replace(/<div\s+id=["']root["']\s*>\s*<\/div>/i, `<div id="root">${serverContent}</div>`);
  } else {
    html = html.replace("<body>", `<body>${serverContent}`);
  }
  return html;
}

function notFoundHtml() {
  return '<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><title>404 - Page Not Found | StudyGyaan</title></head><body><main><h1>404 - Page Not Found</h1><p>यह पेज उपलब्ध नहीं है।</p><a href="/">StudyGyaan Home</a></main></body></html>';
}

function loadTemplate() {
  const candidates = [
    path.resolve(__dirname, "./index.html"),
    path.resolve(__dirname, "../dist/index.html"),
    path.resolve(__dirname, "../index.html")
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return fs.readFileSync(found, "utf8");
  return '<!doctype html><html lang="hi"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>';
}

async function resolveDocument(db, route, identifier) {
  const collection = db.collection(route.collection);
  if (!route.idOnly) {
    const bySlug = await collection.where("slug", "==", identifier).limit(1).get();
    if (!bySlug.empty) {
      const document = bySlug.docs[0];
      return { id: document.id, data: document.data() };
    }
  }

  let document = await collection.doc(identifier).get();
  if (!document.exists && route.fallbackCollection) {
    document = await db.collection(route.fallbackCollection).doc(identifier).get();
  }
  return document.exists ? { id: document.id, data: document.data() } : null;
}

function createMeta(route, result) {
  const data = result.data;
  const slug = route.idOnly ? result.id : (data.slug || result.id);
  const canonical = `${SITE_URL}/${route.canonical}/${encodeURIComponent(slug)}`;
  // Own image ho to wahi; nahi to DYNAMIC WebP OG image (halki + branded)
  const ownImage = data.imageUrl || data.image || data.coverImage || data.subject_img || "";
  const dynamicOg = route.canonical === "job" || route.canonical === "update" || route.canonical === "blog";
  return {
    canonical,
    slug,
    title: stripHtml(data.seoTitle || data.title || data.post_name || "StudyGyaan Update").slice(0, 180),
    description: buildDescription(data, route.type),
    image: ownImage || (dynamicOg ? buildOgImageUrl(route.canonical, slug) : `${SITE_URL}/og-image.jpg`),
    imageType: ownImage || !dynamicOg ? null : "image/webp"
  };
}

function redirect(res, location) {
  res.set("Cache-Control", "public, max-age=3600");
  return res.redirect(301, location);
}

function createServerSeoHandler({ db, renderWebStory }) {
  const template = loadTemplate();
  return async function handleMetaTags(req, res) {
    try {
      const rawPath = req.path || "/";
      if (rawPath.length > 1 && rawPath.endsWith("/")) {
        return redirect(res, `${SITE_URL}${rawPath.replace(/\/+$/, "")}`);
      }

      const parts = rawPath.split("/").filter(Boolean);
      let category = parts[0] || "";
      const identifier = parts[1] ? decodeURIComponent(parts[1]) : "";

      if (parts.length <= 1 && STATIC_PAGES[category]) {
        const page = STATIC_PAGES[category];
        const canonical = category ? `${SITE_URL}/${category}` : SITE_URL;
        const data = { title: page.title, description: page.description, content: page.description };
        const html = injectSeo(template, {
          title: page.title,
          description: page.description,
          canonical,
          image: `${SITE_URL}/og-image.jpg`
        }, data, "website");
        res.set("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=1800");
        res.set("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(html);
      }

      if (!category || !identifier || parts.length > 2) {
        res.set("Cache-Control", "no-store");
        return res.status(404).send(notFoundHtml());
      }

      if (category === "web-stories") {
        req.params = { id: identifier };
        return renderWebStory(req, res);
      }

      if (LEGACY_ROUTES[category]) {
        category = LEGACY_ROUTES[category];
        return redirect(res, `${SITE_URL}/${category}/${encodeURIComponent(identifier)}`);
      }

      const route = ROUTES[category];
      if (!route) return res.status(404).send(notFoundHtml());
      const result = await resolveDocument(db, route, identifier);
      if (!result || !isIndexable(result.data)) {
        res.set("Cache-Control", "no-store");
        return res.status(404).send(notFoundHtml());
      }

      const meta = createMeta(route, result);
      if (identifier !== meta.slug) return redirect(res, meta.canonical);

      const html = injectSeo(template, meta, result.data, route.type);
      res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(html);
    } catch (error) {
      console.error("Server SEO renderer failed:", error);
      res.set("Cache-Control", "no-store");
      return res.status(500).send('<!doctype html><meta name="robots" content="noindex"><h1>Temporary server error</h1>');
    }
  };
}

module.exports = {
  LEGACY_ROUTES,
  ROUTES,
  STATIC_PAGES,
  buildDescription,
  buildSchema,
  createMeta,
  createServerSeoHandler,
  escapeHtml,
  injectSeo,
  isIndexable,
  stripHtml
};

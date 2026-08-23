/**
 * seo_meta.cjs — 🤖 BOT-SEO DATA GENERATOR (meta.php ke liye)
 * ============================================================
 * Firestore data se 3 JSON files banata hai jo meta.php (cPanel PHP) use karta hai:
 *
 *   seo-meta-jobs.json     → /job/... pages: FULL article HTML + JobPosting + FAQ schema
 *   seo-meta-updates.json  → /update/... pages: FULL article HTML + NewsArticle + FAQ schema
 *   seo-meta-pages.json    → blog/test/course/material/web-stories: preview meta (title/desc/image)
 *
 * SIRF PUBLISHED content included hota hai (draft/pending kabhi nahi).
 * generate.cjs isko call karta hai — alag workflow step ki zaroorat nahi.
 */

"use strict";

const SITE = "https://studygyaan.in";
const ORG_NAME = "StudyGyaan";
const LOGO = `${SITE}/logo.png`;
const DEFAULT_IMG = `${SITE}/og-image.jpg`;

// ---------- helpers ----------
function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s, n) {
  s = String(s || "").trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function toIso(t, fallback) {
  if (!t) return fallback || null;
  try {
    if (t.toDate) return t.toDate().toISOString();
    const d = new Date(t);
    return isNaN(d) ? (fallback || null) : d.toISOString();
  } catch {
    return fallback || null;
  }
}

const HINDI_MONTHS = {
  "जनवरी": 0, "फरवरी": 1, "मार्च": 2, "अप्रैल": 3, "मई": 4, "जून": 5,
  "जुलाई": 6, "अगस्त": 7, "सितंबर": 8, "सितम्बर": 8, "अक्टूबर": 9,
  "नवंबर": 10, "नवम्बर": 10, "दिसंबर": 11, "दिसम्बर": 11,
};

/** lastDate string ("15 July 2026", "15-07-2026", "15/07/2026", Hindi) → ISO ya null */
function parseLastDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  // Try native parse ("15 July 2026", ISO...)
  const d1 = new Date(s);
  if (!isNaN(d1) && d1.getFullYear() > 2000) return d1.toISOString().slice(0, 10);
  // dd-mm-yyyy ya dd/mm/yyyy
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  // Hindi month: "15 जुलाई 2026"
  const h = s.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
  if (h && HINDI_MONTHS[h[2]] !== undefined) {
    const d = new Date(Date.UTC(+h[3], HINDI_MONTHS[h[2]], +h[1]));
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  return null;
}

function isIndexableDocument(data = {}) {
  if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return false;
  const status = String(data.status || "").trim().toLowerCase();
  return !["draft", "pending", "rejected", "private", "archived", "deleted", "trash"].includes(status);
}

function hasUsefulTitle(data = {}) {
  return String(data.title || data.post_name || "").trim().length >= 5;
}

function faqSchema(faqs) {
  if (!Array.isArray(faqs) || !faqs.length) return null;
  const items = faqs
    .filter((f) => f && f.question && f.answer)
    .slice(0, 20)
    .map((f) => ({
      "@type": "Question",
      name: stripHtml(f.question),
      acceptedAnswer: { "@type": "Answer", text: stripHtml(f.answer) },
    }));
  if (!items.length) return null;
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items };
}

// ---------- main builder ----------
function buildMetaFiles(colls) {
  const jobs = {};
  const updates = {};
  const pages = {};

  // 🔗 INTERNAL LINKING POOLS — har bot-page ke end me related links jayenge
  // (Googlebot ko crawl-path milta hai → "Discovered/Crawled not indexed" fix)
  const jobPool = (colls.jobs || [])
    .filter(({ data }) => isIndexableDocument(data) && hasUsefulTitle(data) && (data.type || "").toUpperCase() !== "COURSE")
    .map(({ id, data }) => {
      const vt = parseLastDate(data.lastDate);
      return {
        slug: data.slug || id,
        title: stripHtml(data.title),
        category: String(data.category || "").toLowerCase(),
        expired: Boolean(vt && Date.parse(`${vt}T23:59:59+05:30`) < Date.now()),
      };
    });
  const activeJobPool = jobPool.filter((j) => !j.expired);

  const updatePool = (colls.fast_track || [])
    .filter(({ data }) => isIndexableDocument(data) && hasUsefulTitle(data))
    .slice(0, 40)
    .map(({ id, data }) => ({
      slug: data.slug || id,
      title: stripHtml(data.title),
      category: String(data.category || "").toLowerCase(),
    }));

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function pickRelated(pool, selfSlug, category, n) {
    const others = pool.filter((p) => p.slug !== selfSlug);
    const same = others.filter((p) => category && p.category === category);
    const rest = others.filter((p) => !same.includes(p));
    return [...same, ...rest].slice(0, n);
  }

  function relatedHtml(selfSlug, category) {
    const relJobs = pickRelated(activeJobPool, selfSlug, category, 5);
    const relUpdates = pickRelated(updatePool, selfSlug, category, 3);
    if (!relJobs.length && !relUpdates.length) return "";
    let html = `<h2>ये भी देखें (Related)</h2><ul>`;
    relJobs.forEach((j) => { html += `<li><a href="${SITE}/job/${esc(j.slug)}">${esc(j.title)}</a></li>`; });
    relUpdates.forEach((u) => { html += `<li><a href="${SITE}/update/${esc(u.slug)}">${esc(u.title)}</a></li>`; });
    html += `</ul><p><a href="${SITE}/govt-jobs">सभी Latest Govt Jobs</a> | <a href="${SITE}/test">Free Mock Tests</a> | <a href="${SITE}/blog">Blog</a></p>`;
    return html;
  }

  // ===== JOBS: full content + JobPosting schema =====
  (colls.jobs || []).forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    if ((data.type || "").toUpperCase() === "COURSE") return;
    const slug = data.slug || id;
    const path = `/job/${slug}`;
    const title = data.seoTitle || data.title;
    const desc = truncate(data.metaDescription || stripHtml(data.description), 160);
    const img = data.imageUrl || DEFAULT_IMG;
    const posted = toIso(data.createdAt) || new Date().toISOString();
    const validThrough = parseLastDate(data.lastDate);
    // 🗓️ EXPIRED? — Google guideline: expired bharti pe JobPosting schema NAHI
    // (warna "expired job posting" manual action ka risk). Banner + normal page.
    const isExpired = Boolean(
      validThrough && Date.parse(`${validThrough}T23:59:59+05:30`) < Date.now()
    );

    const jobPosting = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: stripHtml(data.title),
      description: data.description || `<p>${stripHtml(data.title)}</p>`,
      datePosted: posted.slice(0, 10),
      hiringOrganization: {
        "@type": "Organization",
        name: stripHtml(data.organization) || "Government of India",
        sameAs: data.officialSiteLink || undefined,
      },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: stripHtml(data.location) || "India",
          addressCountry: "IN",
        },
      },
      employmentType: "FULL_TIME",
      directApply: false,
      url: `${SITE}${path}`,
    };
    if (validThrough) jobPosting.validThrough = `${validThrough}T23:59:59+05:30`;
    if (data.totalPosts || data.vacancy) {
      jobPosting.totalJobOpenings = String(data.totalPosts || data.vacancy).replace(/[^\d]/g, "") || undefined;
    }

    const ld = [];
    if (!isExpired) ld.push(jobPosting);
    const faq = faqSchema(data.faqs);
    if (faq) ld.push(faq);

    // Expired pe bots ko bhi clear notice (content ke upar)
    const expiredBanner = isExpired
      ? `<p><strong>⚠️ यह भर्ती बंद हो चुकी है (Last Date: ${data.lastDate || 'N/A'}). नई सरकारी भर्तियों के लिए <a href="${SITE}/govt-jobs">StudyGyaan Govt Jobs</a> देखें।</strong></p>`
      : '';

    jobs[path] = {
      t: truncate(title, 70),
      d: desc,
      img,
      type: "article",
      content: expiredBanner + (data.description || "") + relatedHtml(slug, String(data.category || "").toLowerCase()),
      ld,
    };
  });

  // ===== FAST TRACK UPDATES: full content + NewsArticle schema =====
  (colls.fast_track || []).forEach(({ id, data }) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    const slug = data.slug || id;
    const path = `/update/${slug}`;
    const title = data.seoTitle || data.title;
    const body = data.description || data.content || "";
    const desc = truncate(data.metaDescription || stripHtml(body), 160);
    const img = data.imageUrl || DEFAULT_IMG;
    const posted = toIso(data.publishedAt || data.createdAt) || new Date().toISOString();
    const modified = toIso(data.updatedAt) || posted;

    const article = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: truncate(stripHtml(data.title), 110),
      image: [img],
      datePublished: posted,
      dateModified: modified,
      author: { "@type": "Organization", name: ORG_NAME, url: SITE },
      publisher: {
        "@type": "Organization",
        name: ORG_NAME,
        logo: { "@type": "ImageObject", url: LOGO },
      },
      mainEntityOfPage: `${SITE}${path}`,
    };

    const ld = [article];
    const faq = faqSchema(data.faqs);
    if (faq) ld.push(faq);

    updates[path] = {
      t: truncate(title, 70),
      d: desc,
      img,
      type: "article",
      content: body + relatedHtml(slug, String(data.category || "").toLowerCase()),
      ld,
    };
  });

  // ===== BAAKI PAGES: sirf preview meta (social bots ke liye) =====
  const addPage = (path, data, imgField) => {
    if (!isIndexableDocument(data) || !hasUsefulTitle(data)) return;
    pages[path] = {
      t: truncate(data.seoTitle || data.title, 70),
      d: truncate(data.metaDescription || stripHtml(data.description) || `${stripHtml(data.title)} - StudyGyaan`, 160),
      img: data[imgField] || DEFAULT_IMG,
      type: "article",
      ld: [],
    };
  };

  (colls.blogs || []).forEach(({ id, data }) => addPage(`/blog/${data.slug || id}`, data, "imageUrl"));
  (colls.mock_tests || []).forEach(({ id, data }) => addPage(`/test/${data.slug || id}`, data, "imageUrl"));
  (colls.web_stories || []).forEach(({ id, data }) => addPage(`/web-stories/${data.slug || id}`, data, "coverImage"));
  (colls.courses || []).forEach(({ id, data }) => addPage(`/course/${data.slug || id}`, data, "imageUrl"));
  [...(colls.study_materials || []), ...(colls.studyMaterials || [])].forEach(({ id, data }) =>
    addPage(`/material/${data.slug || id}`, data, "imageUrl")
  );

  return {
    "seo-meta-jobs.json": JSON.stringify(jobs),
    "seo-meta-updates.json": JSON.stringify(updates),
    "seo-meta-pages.json": JSON.stringify(pages),
  };
}

module.exports = { buildMetaFiles, parseLastDate };

/**
 * article_to_story.js — Article → Web Story AUTO-CONVERTER
 * ==========================================================
 * Har published JOB / FAST_TRACK / BLOG ka Discover-ready AMP web story
 * khud-ba-khud banata hai — bina kisi AI call ke, sirf article ke REAL
 * facts se (hallucination ka chance hi nahi).
 *
 * 3 entry points:
 *   1. Firestore trigger  → handleDocumentWritten()  (publish hote hi story)
 *   2. HTTP backfill      → POST /stories/backfill   (purane articles cover)
 *   3. Sitemap/Admin UX   → story doc deterministic id `story-{slug}` se
 *      banega, isliye dobara chalane pe duplicate KABHI nahi banega.
 */

const { plainText, escapeHtml } = require("./agents/article_agents/article_html_utils");
const { overlapsAny } = require("./agents/article_agents/title_utils");

// ---------------------------------------------------------------------------
// Static branded assets (repo `public/story-assets/` — dist ke saath site root pe)
// ---------------------------------------------------------------------------
const SITE = "https://studygyaan.in";
const STORY_ASSETS = {
    job: `${SITE}/story-assets/bg-job.jpg`,
    result: `${SITE}/story-assets/bg-result.jpg`,
    admit: `${SITE}/story-assets/bg-admit.jpg`,
    notice: `${SITE}/story-assets/bg-notice.jpg`,
    study: `${SITE}/story-assets/bg-study.jpg`,
    railway: `${SITE}/story-assets/bg-railway.jpg`,
    defence: `${SITE}/story-assets/bg-defence.jpg`,
    banking: `${SITE}/story-assets/bg-banking.jpg`,
    teaching: `${SITE}/story-assets/bg-teaching.jpg`,
    medical: `${SITE}/story-assets/bg-medical.jpg`,
    engineering: `${SITE}/story-assets/bg-engineering.jpg`,
    ssc: `${SITE}/story-assets/bg-ssc.jpg`,
    clerk: `${SITE}/story-assets/bg-clerk.jpg`,
    news: `${SITE}/story-assets/bg-news.jpg`,
    upsc: `${SITE}/story-assets/bg-upsc.jpg`
};
const PUBLISHER_LOGO = `${SITE}/story-assets/publisher-logo.png`;
const ASSET_WIDTH = 1080;
const ASSET_HEIGHT = 1440; // 3:4 — Google Discover portrait poster spec
const ASSET_TYPE = "image/jpeg";
const AUTO_STORY_VERSION = 1;
const BACKFILL_COLLECTIONS = ["jobs", "fast_track", "blogs"];

// Statuses jinki story kabhi nahi banani / rakhni
const BLOCKED_STATUS = new Set([
    "draft", "pending", "rejected", "private", "archived", "deleted", "trash"
]);

// ---------------------------------------------------------------------------
// 🔤 Small text helpers (har step edge-safe)
// ---------------------------------------------------------------------------
function cleanOne(value, maxLen) {
    if (value === undefined || value === null) return "";
    let text = String(value);
    if (text.includes("<")) text = plainText(text);
    text = text.replace(/\s+/g, " ").trim();
    // Statement-terminators / junk-only values reject
    if (!text || /^[-–—.,|/\\]+$/.test(text)) return "";
    const cap = maxLen || 80;
    if (text.length > cap) {
        text = text.slice(0, cap).replace(/\s+\S*$/, "").trim() + "…";
    }
    return text;
}

function firstNonEmpty(maxLen, ...values) {
    for (const value of values) {
        const cleaned = cleanOne(value, maxLen);
        if (cleaned && !/^(na|n\/a|none|-)$/i.test(cleaned)) return cleaned;
    }
    return "";
}

/** Discover title chhota rakho (~66 chars) — word boundary pe kaato. */
function shortenTitle(title) {
    const cleaned = cleanOne(title, 120) || "StudyGyaan Update";
    if (cleaned.length <= 66) return cleaned;
    const cut = cleaned.slice(0, 66).replace(/[|\-–—,:;.।\s]+\S*$/, "").trim();
    return cut.length >= 20 ? cut : cleaned.slice(0, 66).trim();
}

/** Deterministic story id — same article se hamesha same id (idempotent). */
function buildStoryId(articleSlug, docId) {
    const base = String(articleSlug || docId || "update")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-")
        .slice(0, 72)
        .replace(/^-+|-+$/g, "");
    return `story-${base || "update"}`;
}

/** Slug/docId se article ka public URL. */
function articleUrlFor(collectionName, data, docId) {
    const slug = cleanOne(data && data.slug, 120) || "";
    if (collectionName === "jobs") return `${SITE}/job/${slug || docId}`;
    if (collectionName === "fast_track") return `${SITE}/update/${slug || docId}`;
    return `${SITE}/blog/${slug || docId}`;
}

function yearFrom(data) {
    const text = [data && data.lastDate, data && data.examDate, data && data.updateDate, data && data.title]
        .filter(Boolean).join(" ");
    const match = text.match(/20\d{2}/);
    return match ? match[0] : String(new Date().getFullYear());
}

// ---------------------------------------------------------------------------
// 🎨 Theme + badge (cover image & discover badge ka decision)
// ---------------------------------------------------------------------------
function pickTheme(collectionName, data) {
    const text = `${(data && data.title) || ""} ${(data && data.category) || ""} ${(data && data.organization) || ""} ${(data && data.org) || ""}`.toLowerCase();
    if (/admit|hall[\s-]?ticket|एडमिट|प्रवेश[\s-]?पत्र/.test(text)) return "admit";
    if (/answer[\s-]?key|आंसर|उत्तर[\s-]?कुंजी|cut[\s-]?off|कट[\s-]?ऑफ|merit|counsell/.test(text)) return "notice";
    if (/result|रिजल्ट|परिणाम|scorecard|स्कोरकार्ड/.test(text)) return "result";
    if (/railway|rrb|ntpc|group[\s-]?d|alp|rpf/.test(text)) return "railway";
    if (/army|navy|air[\s-]?force|agniveer|police|constable|cisf|bsf|crpf|capf|defence|रक्षा|पुलिस/.test(text)) return "defence";
    if (/bank|ibps|sbi|rbi|po[\s\/]|probationary|credit[\s-]?officer/.test(text)) return "banking";
    if (/teacher|professor|tet|ctet|ugc|net$|lecturer|शिक्षक|adhyapak|TGT|PGT|PRT/i.test(text)) return "teaching";
    if (/nurse|nursing|medical|doctor|aiims|norcet|pharmacist|anm|gnm|health|स्वास्थ्य/.test(text)) return "medical";
    if (/engineer|technical|technician|\bje\b|\bme\b|\bee\b|iit|nit|polytechnic|iti/.test(text)) return "engineering";
    if (/ssc|cgl|chsl|mts|gd[\s-]?constable|stenographer/.test(text)) return "ssc";
    if (/upsc|ias|ips|irs|psc|civil[\s-]?services/.test(text)) return "upsc";
    if (/clerk|record[\s-]?keeper|secretariat|court|office[\s-]?assistant|\bldc\b|\budc\b/.test(text)) return "clerk";
    if (/apprentice|trainee|intern/.test(text)) return "engineering";
    if (/current[\s-]?affairs|news|editorial/.test(text)) return "news";
    if (collectionName === "jobs") return "job";
    if (collectionName === "blogs") return "study";
    return "notice";
}

// ---------------------------------------------------------------------------
// 🖼️ Uniqueness: source article ki ASLI photo → cover, nahi to theme asset.
// Sirf hamare khud ke (trusted) domains ki photos chalengi.
// ---------------------------------------------------------------------------
const OWN_IMAGE_HOST = /^(studygyaan\.in|firebasestorage\.googleapis\.com|storage\.googleapis\.com)$/;

function safeSourceImage(data) {
    const url = String(
        (data && (data.imageUrl || data.coverImage || data.featuredImage || data.image)) || ""
    ).trim();
    if (!/^https:\/\//i.test(url)) return null;
    try {
        const host = new URL(url).hostname;
        if (!OWN_IMAGE_HOST.test(host)) return null;
    } catch {
        return null;
    }
    const w = Number(data.imageWidth || data.coverImageWidth);
    const h = Number(data.imageHeight || data.coverImageHeight);
    return {
        url,
        width: (w >= 100 && w <= 5000) ? w : ASSET_WIDTH,
        height: (h >= 100 && h <= 5000) ? h : ASSET_HEIGHT,
        sourceImage: true
    };
}

/** Final cover decide karo: { url, width, height, type, sourceImage } */
function pickCoverImage(collectionName, data, theme) {
    const own = safeSourceImage(data);
    if (own) return { url: own.url, width: own.width, height: own.height, type: data.coverImageType || "image/jpeg", sourceImage: true };
    return { url: STORY_ASSETS[theme] || STORY_ASSETS.job, width: ASSET_WIDTH, height: ASSET_HEIGHT, type: ASSET_TYPE, sourceImage: false };
}

/** Ye URL hamara generated theme asset hai ya nahi (refresh-swap sirf inhi pe karenge) */
function isOurThemeCover(url) {
    return typeof url === "string" && url.includes("story-assets/bg-");
}

function badgeFor(storyType, theme, data, year) {
    if (storyType === "job") return `🏛️ SARKARI NAUKRI ${year}`;
    if (storyType === "blog") return "📝 NEW BLOG POST";
    if (theme === "result") return "📢 RESULT OUT";
    if (theme === "admit") return "🎫 ADMIT CARD";
    if (theme === "notice") return "🔔 OFFICIAL UPDATE";
    return "⚡ FAST UPDATE";
}

// ---------------------------------------------------------------------------
// ✨ Article text se REAL highlight sentences (hallucination-free)
// ---------------------------------------------------------------------------
function extractHighlights(articleHtml, limit) {
    const text = plainText(String(articleHtml || ""));
    if (!text) return [];
    const seen = new Set();
    const lines = text
        .split(/[\n\r]+|(?<=[।.!?])\s+/u)
        .map(s => cleanOne(s, 90))
        .filter(s => s && s.length >= 22 && !/^(https?:|www\.)/i.test(s))
        .filter(s => {
            const key = s.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    // Facts waali (digit/₹/%) lines pehle, phir baaki
    const factual = lines.filter(s => /\d|₹|%/.test(s));
    const picked = [...factual, ...lines.filter(s => !factual.includes(s))];
    return picked.slice(0, limit || 4).map(s => `• ${s}`);
}

// ---------------------------------------------------------------------------
// 📊 Slides builders — har slide sirf tab jab uska data REAL ho
// ---------------------------------------------------------------------------
function buildJobSlides(data, badge, highlights, year) {
    const org = firstNonEmpty(60, data.organization, data.org, data.deptName);
    const postTitle = firstNonEmpty(70, data.postName, data.title);
    const title = shortenTitle(data.title || (org ? `${org} Recruitment` : "Sarkari Naukri Update"));
    const vacancies = firstNonEmpty(24, data.vacancies, data.totalPosts);
    const qualification = firstNonEmpty(60, data.qualification, data.eligibility);
    const salary = firstNonEmpty(28, data.salary, data.payScale);
    const ageLimit = firstNonEmpty(28, data.ageLimit, data.age);
    const startDate = firstNonEmpty(24, data.startDate, data.applyStartDate);
    const lastDate = firstNonEmpty(24, data.lastDate, data.applyLastDate);
    const examDate = firstNonEmpty(24, data.examDate);
    const fee = firstNonEmpty(30, data.feeGen, data.applicationFee);

    const slides = [];
    slides.push({ type: "cover", title, subtitle: org || `Govt Job ${year}`, badge });

    // Key facts slide — kam se kam 2 real lines hon to
    const infoLines = [];
    if (org) infoLines.push(`🏛️ संगठन: ${org}`);
    if (postTitle && postTitle.toLowerCase() !== title.toLowerCase()) infoLines.push(`💼 पद: ${postTitle}`);
    if (vacancies) infoLines.push(`👥 पदों की संख्या: ${vacancies}`);
    if (qualification) infoLines.push(`🎓 योग्यता: ${qualification}`);
    if (salary) infoLines.push(`💰 सैलरी: ${salary}`);
    if (ageLimit) infoLines.push(`📏 आयु सीमा: ${ageLimit}`);
    if (infoLines.length >= 2) {
        slides.push({ type: "info", heading: "📋 मुख्य जानकारी", lines: infoLines.slice(0, 6) });
    }

    // Dates/fee stats — kam se kam 2 real stats hon to
    const stats = [];
    if (startDate) stats.push({ icon: "🟢", value: startDate, label: "Apply Start" });
    if (lastDate) stats.push({ icon: "🔴", value: lastDate, label: "Last Date" });
    if (examDate) stats.push({ icon: "📝", value: examDate, label: "Exam Date" });
    if (fee) stats.push({ icon: "💳", value: fee, label: "Form Fee" });
    if (stats.length >= 2) {
        slides.push({ type: "stats", heading: "🗓️ Important Dates", stats: stats.slice(0, 4) });
    }

    if (highlights.length) {
        slides.push({ type: "content", heading: "✅ जरूरी बातें", lines: highlights.slice(0, 4) });
    }

    slides.push({
        type: "content",
        heading: "🖥️ Apply ऐसे करें",
        lines: [
            "1️⃣ Official notification ध्यान से पढ़ें",
            "2️⃣ Eligibility + documents तैयार रखें",
            "3️⃣ Online form सही जानकारी से भरें",
            "4️⃣ Fee जमा करके final submit करें",
            "🔖 Form का print जरूर सहेजें"
        ]
    });

    slides.push({
        type: "cta",
        heading: "🚀 पूरी भर्ती की जानकारी",
        lines: [
            lastDate ? `⏳ Last Date: ${lastDate}` : "⏳ जल्दी Apply करें",
            "✅ Direct official apply link",
            "✅ Eligibility + syllabus details",
            "✅ Bilkul FREE — StudyGyaan.in"
        ],
        ctaText: "पूरी जानकारी पढ़ें"
    });
    return { slides, title };
}

function buildFastTrackSlides(data, badge, highlights, theme, year) {
    const org = firstNonEmpty(60, data.org, data.organization, data.board, data.university);
    const category = firstNonEmpty(40, data.category);
    const updateDate = firstNonEmpty(24, data.updateDate);
    const title = shortenTitle(data.title || "Latest Update");

    const slides = [];
    slides.push({ type: "cover", title, subtitle: org || category || `Update ${year}`, badge });

    const infoLines = [];
    if (org) infoLines.push(`🏛️ ${org}`);
    if (category) infoLines.push(`📁 Category: ${category}`);
    if (updateDate) infoLines.push(`📅 Update: ${updateDate}`);
    infoLines.push("🌐 Source: Official Website");
    infoLines.push("✅ Verified @ StudyGyaan.in");
    slides.push({ type: "info", heading: "📌 एक नज़र में", lines: infoLines.slice(0, 5) });

    if (highlights.length) {
        slides.push({ type: "content", heading: "✅ मुख्य बातें", lines: highlights.slice(0, 4) });
    }

    const howLines = theme === "result"
        ? [
            "1️⃣ Official website खोलें",
            "2️⃣ Result/Results सेक्शन में जाएं",
            "3️⃣ Roll Number / Hall Ticket डालें",
            "4️⃣ Scorecard download करके रखें",
            "🔖 Merit list का इंतज़ार करें"
        ]
        : [
            "1️⃣ Official website खोलें",
            "2️⃣ Candidate Login में जाएं",
            "3️⃣ Registration No. + DOB डालें",
            "4️⃣ Document download करें",
            "🖨️ Print — exam hall में जरूरी"
        ];
    slides.push({
        type: "content",
        heading: theme === "result" ? "🔍 Result ऐसे देखें" : "🎫 ऐसे Download करें",
        lines: howLines
    });

    slides.push({
        type: "cta",
        heading: "🚀 पूरी जानकारी एक क्लिक में",
        lines: [
            updateDate ? `📅 ${updateDate}` : "⚡ Fresh Update",
            "✅ Direct official link",
            "✅ Step-by-step process",
            "✅ FREE — StudyGyaan.in"
        ],
        ctaText: "पूरी Detail देखें"
    });
    return { slides, title };
}

function buildBlogSlides(data, badge, highlights, year) {
    const category = firstNonEmpty(40, data.category) || "Education";
    const author = firstNonEmpty(40, data.author, data.authorName) || "StudyGyaan Editorial Team";
    const title = shortenTitle(data.title || "StudyGyaan Blog");

    const slides = [];
    slides.push({ type: "cover", title, subtitle: category, badge });
    slides.push({
        type: "info",
        heading: "📌 About This Article",
        lines: [
            `📁 ${category}`,
            `✍️ ${author}`,
            "🌐 StudyGyaan.in",
            `📅 Updated for ${year}`
        ]
    });
    if (highlights.length) {
        slides.push({ type: "content", heading: "📰 Key Highlights", lines: highlights.slice(0, 4) });
    }
    if (highlights.length > 4) {
        slides.push({ type: "content", heading: "📋 और भी जानें", lines: highlights.slice(4, 8) });
    }
    slides.push({
        type: "cta",
        heading: "🚀 पूरा Article FREE पढ़ें",
        lines: [
            "✅ Easy Hindi explanation",
            "✅ Free PDF notes",
            "✅ Online mock tests",
            "✅ Daily updates"
        ],
        ctaText: "Read Full Article"
    });
    return { slides, title };
}

/** Discover ke liye min ~4 pages — thin article ho to ek evergreen slide pad karo. */
function padSlides(slides) {
    if (!Array.isArray(slides)) return [];
    if (slides.length >= 4) return slides;
    const filler = {
        type: "content",
        heading: "📲 StudyGyaan.in पर मिलेगा",
        lines: [
            "✅ Daily Sarkari Job alerts",
            "✅ Admit Card & Result updates",
            "✅ Free mock tests + PDF notes",
            "✅ सब कुछ बिल्कुल FREE"
        ]
    };
    const out = slides.slice();
    out.splice(Math.max(out.length - 1, 1), 0, filler); // CTA se pehle
    return out;
}

// ---------------------------------------------------------------------------
// 🧾 Full story document
// ---------------------------------------------------------------------------
function buildStoryDoc(collectionName, docId, data) {
    const storyType = collectionName === "jobs" ? "job"
        : collectionName === "fast_track" ? "fasttrack" : "blog";
    const theme = pickTheme(collectionName, data);
    const year = yearFrom(data);
    const badge = badgeFor(storyType, theme, data, year);
    const highlights = extractHighlights(data.articleHtml, storyType === "blog" ? 8 : 4);

    const built = storyType === "job"
        ? buildJobSlides(data, badge, highlights, year)
        : storyType === "fasttrack"
            ? buildFastTrackSlides(data, badge, highlights, theme, year)
            : buildBlogSlides(data, badge, highlights, year);

    const description = firstNonEmpty(160, data.metaDescription, data.shortInfo, data.description)
        || `${built.title} — StudyGyaan.in पर पूरी जानकारी हिंदी में।`;

    const cover = pickCoverImage(collectionName, data, theme);

    const doc = {
        title: built.title,
        slug: buildStoryId(data.slug, docId),
        description,
        storyType,
        theme,
        category: cleanOne(data.category, 60) || (storyType === "job" ? "Govt Job" : "Education"),
        slides: padSlides(built.slides),
        coverImage: cover.url,
        coverImageWidth: cover.width,
        coverImageHeight: cover.height,
        coverImageType: cover.type,
        coverFromSource: cover.sourceImage,
        applyLink: articleUrlFor(collectionName, data, docId),
        // Official key links bhi saath (CTA targets future ke liye)
        officialLink: firstNonEmpty(200, data.directLink, data.applyLink) || "",
        tags: ["studygyaan", storyType, theme, "sarkari"],
        autoGenerated: true,
        autoStoryVersion: AUTO_STORY_VERSION,
        sourceRef: { collection: collectionName, docId: String(docId) },
        sourceUrl: cleanOne(data.sourceUrl, 200) || "",
        status: "published",
        noIndex: false
    };
    return { storyId: doc.slug, doc };
}

// ---------------------------------------------------------------------------
// ✅ Eligibility — kis article ki story banani chahiye
// ---------------------------------------------------------------------------
function isStoryEligible(data) {
    if (!data || typeof data !== "object") return false;
    if (data.noIndex === true || data.deleted === true || data.isDeleted === true) return false;
    if (data.noAutoStory === true) return false; // escape hatch
    const status = String(data.status || "").trim().toLowerCase();
    if (BLOCKED_STATUS.has(status)) return false;
    const title = firstNonEmpty(80, data.title, data.post_name, data.postName);
    if (title.length < 8) return false;
    return true;
}

/** Publish transition check — views/edit har baar story nahi banayenge. */
function shouldCreateOnWrite(beforeData, afterData) {
    if (!afterData) return false; // doc delete hua
    if (afterData.storyCreated === true) return false; // already marked
    if (!isStoryEligible(afterData)) return false;
    const statusNow = String(afterData.status || "").trim().toLowerCase();
    if (beforeData) {
        const statusBefore = String(beforeData.status || "").trim().toLowerCase();
        const wasPublic = !BLOCKED_STATUS.has(statusBefore);
        const isPublic = !BLOCKED_STATUS.has(statusNow);
        if (wasPublic && isPublic) return false; // बस edit/view-update हुआ
    }
    return true;
}

// ---------------------------------------------------------------------------
// 🗄️ Firestore orchestration (db ko parameter se lo — unit-testable)
// ---------------------------------------------------------------------------
async function createStoryForArticle(db, FieldValue, collectionName, docId, data) {
    const { storyId, doc } = buildStoryDoc(collectionName, docId, data);
    const ref = db.collection("web_stories").doc(storyId);
    const existing = await ref.get();
    if (existing.exists) {
        return { created: false, reason: "exists", storyId };
    }
    await ref.set({ ...doc, createdAt: FieldValue.serverTimestamp() });
    // Source article pe mark — dobara trigger na kare (best-effort)
    try {
        await db.collection(collectionName).doc(docId).set(
            { storyCreated: true, storySlug: storyId },
            { merge: true }
        );
    } catch (markErr) {
        console.warn(`⚠️ auto-story mark failed (${collectionName}/${docId}): ${markErr.message}`);
    }
    return { created: true, storyId };
}

/** Firestore trigger handler factory. */
function handleDocumentWritten(db, FieldValue, collectionName, idParam) {
    return async (event) => {
        try {
            const beforeData = event.data && event.data.before ? event.data.before.data() : null;
            const afterSnap = event.data && event.data.after;
            if (!afterSnap || !afterSnap.exists) return null;
            const afterData = afterSnap.data();
            const docId = (event.params && event.params[idParam]) || afterSnap.id;

            if (!shouldCreateOnWrite(beforeData, afterData)) return null;

            const result = await createStoryForArticle(db, FieldValue, collectionName, docId, afterData);
            if (result.created) {
                console.log(`📱 AUTO-STORY: ${collectionName}/${docId} → /web-stories/${result.storyId}`);
            }
            return result;
        } catch (error) {
            // Story fail ho to publish kabhi block na ho — sirf log
            console.error(`❌ auto-story (${collectionName}):`, error.message || error);
            return null;
        }
    };
}

// ---------------------------------------------------------------------------
// 🧹 Draft cleanup — jo item PUBLISHED ho chuka, uska draft/source row delete.
//    (re-fetch loop me wahi item dubara "naya draft" banke nahi aayega)
// ---------------------------------------------------------------------------
async function cleanupSourceDrafts(db) {
    const report = { removed: [], errors: [] };

    // Published titles dono collections se
    const pools = { jobs: [], fast_track: [] };
    try {
        const jobsSnap = await db.collection("jobs").orderBy("createdAt", "desc").limit(120).get();
        for (const d of jobsSnap.docs) pools.jobs.push(d.data().title || "");
        const ftSnap = await db.collection("fast_track").orderBy("createdAt", "desc").limit(150).get();
        for (const d of ftSnap.docs) {
            const data = d.data();
            if (String(data.status || "").toLowerCase() !== "draft") {
                pools.fast_track.push(data.title || "");
            }
        }
    } catch (error) {
        report.errors.push(`published-scan: ${error.message}`);
        return report;
    }

    // fast_track DRAFT rows jinki published twin hai
    try {
        const ftAll = await db.collection("fast_track").orderBy("createdAt", "desc").limit(150).get();
        for (const d of ftAll.docs) {
            const data = d.data();
            if (String(data.status || "draft").toLowerCase() !== "draft") continue;
            if (overlapsAny(data.title || "", pools.fast_track).dup) {
                await db.collection("fast_track").doc(d.id).delete()
                    .then(() => report.removed.push(`fast_track/${d.id}`))
                    .catch(e => report.errors.push(`fast_track/${d.id}: ${e.message}`));
            }
        }
    } catch (error) {
        report.errors.push(`ft-scan: ${error.message}`);
    }

    // job_drafts rows jinki published jobs twin hai
    try {
        const jdAll = await db.collection("job_drafts").orderBy("createdAt", "desc").limit(80).get();
        for (const d of jdAll.docs) {
            const data = d.data();
            if (overlapsAny(data.title || "", pools.jobs).dup) {
                await db.collection("job_drafts").doc(d.id).delete()
                    .then(() => report.removed.push(`job_drafts/${d.id}`))
                    .catch(e => report.errors.push(`job_drafts/${d.id}: ${e.message}`));
            }
        }
    } catch (error) {
        // job_drafts me orderBy field na ho to unordered fallback
        try {
            const jdFallback = await db.collection("job_drafts").limit(80).get();
            for (const d of jdFallback.docs) {
                const data = d.data();
                if (overlapsAny(data.title || "", pools.jobs).dup) {
                    await db.collection("job_drafts").doc(d.id).delete()
                        .then(() => report.removed.push(`job_drafts/${d.id}`))
                        .catch(e => report.errors.push(`job_drafts/${d.id}: ${e.message}`));
                }
            }
        } catch (e2) {
            report.errors.push(`job_drafts-scan: ${e2.message}`);
        }
    }
    return report;
}

// ---------------------------------------------------------------------------
// ♻️ BACKFILL — purane published articles ki stories ek saath
// ---------------------------------------------------------------------------
async function backfillStories(db, FieldValue, options) {
    const perCollection = Math.min(Math.max(Number(options && options.limit) || 40, 1), 80);
    const archiveJunk = !options || options.archiveJunk !== false;
    const cleanupDrafts = !options || options.cleanupDrafts !== false;
    const report = { created: [], skippedExisting: 0, ineligible: 0, junkArchived: 0, coversRefreshed: 0, draftsCleaned: 0, errors: [] };

    for (const collectionName of BACKFILL_COLLECTIONS) {
        let snap;
        try {
            snap = await db.collection(collectionName)
                .orderBy("createdAt", "desc")
                .limit(perCollection)
                .get();
            // createdAt-missing purane docs orderBy me nahi aate — fallback unordered
            if (snap.empty) {
                snap = await db.collection(collectionName).limit(perCollection).get();
            }
        } catch (error) {
            report.errors.push(`${collectionName}: ${error.message}`);
            continue;
        }
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            if (data.storyCreated === true) { report.skippedExisting += 1; continue; }
            if (!isStoryEligible(data)) { report.ineligible += 1; continue; }
            try {
                const result = await createStoryForArticle(db, FieldValue, collectionName, docSnap.id, data);
                if (result.created) report.created.push(`${collectionName}/${docSnap.id} → ${result.storyId}`);
                else report.skippedExisting += 1;
            } catch (error) {
                report.errors.push(`${collectionName}/${docSnap.id}: ${error.message}`);
            }
        }
    }

    // 🖼️ Covers refresh: purani auto-stories (theme covers) ko source ki ASLI photo do
    if (options && options.refreshCovers) {
        try {
            const storiesSnap = await db.collection("web_stories").limit(250).get();
            for (const storySnap of storiesSnap.docs) {
                const story = storySnap.data();
                if (!story.autoGenerated || !story.sourceRef || !isOurThemeCover(story.coverImage)) continue;
                try {
                    const srcSnap = await db.collection(story.sourceRef.collection).doc(story.sourceRef.docId).get();
                    if (!srcSnap.exists) continue;
                    const theme = pickTheme(story.sourceRef.collection, srcSnap.data());
                    const fresh = pickCoverImage(story.sourceRef.collection, srcSnap.data(), theme);
                    if (fresh.url !== story.coverImage) {
                        await storySnap.ref.set({
                            coverImage: fresh.url,
                            coverImageWidth: fresh.width,
                            coverImageHeight: fresh.height,
                            coverImageType: fresh.type,
                            coverFromSource: fresh.sourceImage
                        }, { merge: true });
                        report.coversRefreshed += 1;
                    }
                } catch (error) {
                    report.errors.push(`coverRefresh/${storySnap.id}: ${error.message}`);
                }
            }
        } catch (error) {
            report.errors.push(`refreshCovers: ${error.message}`);
        }
    }

    // Junk stories (placeholder covers / slides-less purani auto-stories) noIndex
    if (archiveJunk) {
        try {
            const storiesSnap = await db.collection("web_stories")
                .orderBy("createdAt", "desc")
                .limit(200)
                .get();
            for (const storySnap of storiesSnap.docs) {
                const data = storySnap.data();
                if (data.noIndex === true) continue;
                const cover = String(data.coverImage || "");
                const junkCover = !cover || /via\.placeholder\.com|\/og-image\.jpe?g/.test(cover);
                const thinSlides = !Array.isArray(data.slides) || data.slides.length < 3;
                if (junkCover && thinSlides) {
                    await storySnap.ref.set({ noIndex: true, junkArchivedAt: new Date().toISOString() }, { merge: true });
                    report.junkArchived += 1;
                }
            }
        } catch (error) {
            report.errors.push(`junkArchive: ${error.message}`);
        }
    }

    // Published items ke stale drafts delete (re-fetch duplicate loop rokne ke liye)
    if (cleanupDrafts) {
        const clean = await cleanupSourceDrafts(db);
        report.draftsCleaned = clean.removed.length;
        report.cleanedDrafts = clean.removed;
        report.errors.push(...clean.errors);
    }
    return report;
}

/** Express handler — POST /stories/backfill  (body: { limit?, archiveJunk? }) */
function backfillHttpHandler(db, FieldValue) {
    return async (req, res) => {
        try {
            const body = req.body || {};
            const report = await backfillStories(db, FieldValue, {
                limit: body.limit,
                archiveJunk: body.archiveJunk,
                cleanupDrafts: body.cleanupDrafts
            });
            return res.json({ success: true, ...report });
        } catch (error) {
            console.error("❌ stories/backfill:", error);
            return res.status(500).json({ success: false, error: error.message || "Backfill failed" });
        }
    };
}

function registerStoryRoutes(app, db, FieldValue) {
    app.post("/stories/backfill", backfillHttpHandler(db, FieldValue));
}

module.exports = {
    STORY_ASSETS,
    PUBLISHER_LOGO,
    ASSET_WIDTH,
    ASSET_HEIGHT,
    cleanOne,
    shortenTitle,
    buildStoryId,
    pickTheme,
    pickCoverImage,
    safeSourceImage,
    isOurThemeCover,
    badgeFor,
    extractHighlights,
    buildStoryDoc,
    isStoryEligible,
    shouldCreateOnWrite,
    createStoryForArticle,
    handleDocumentWritten,
    cleanupSourceDrafts,
    backfillStories,
    backfillHttpHandler,
    registerStoryRoutes
};

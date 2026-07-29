"use strict";

/**
 * og_image.js — 🖼️ DYNAMIC OG IMAGE GENERATOR (WebP — HALKA, FAST)
 * =================================================================
 * Har job/update/blog page ke liye share-preview image on-the-fly banata hai:
 * branded gradient + category badge + title + org + StudyGyaan strip.
 *
 * Kyun WebP?  Quality wahi, size ~3-5x kam (space bachta hai — user rule).
 *
 * NOTE: OG render fonts me Devanagari glyphs nahi hote (tofu □□□), isliye
 * Hindi text pehle deterministic Latin transliteration se guzarta hai.
 *
 * sharp ko LAZY require karte hain — is file ko require karne pe heavy native
 * module load NAHI hota (server_seo_renderer bhi import kar sakta hai).
 */

const FUNCTIONS_BASE = "https://us-central1-studymaterial-406ad.cloudfunctions.net";
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const COLLECTION_BY_CANONICAL = {
    job: "jobs",
    update: "fast_track",
    blog: "blogs"
};

// 🎨 Type-wise branded themes (badges me sirf DejaVu-safe symbols — ★ ✓)
const OG_THEMES = {
    job: {
        badge: "★ SARKARI NAUKRI 2026",
        gradient: ["#1e3a8a", "#1d4ed8", "#3b82f6"],
        accent: "#facc15",
        subtitleFallback: "Latest Govt Job Notification"
    },
    update: {
        badge: "★ FAST UPDATE 2026",
        gradient: ["#14532d", "#15803d", "#22c55e"],
        accent: "#fef08a",
        subtitleFallback: "Result / Admit Card / Answer Key"
    },
    blog: {
        badge: "★ STUDY BLOG",
        gradient: ["#4c1d95", "#6d28d9", "#8b5cf6"],
        accent: "#fcd34d",
        subtitleFallback: "Free Notes + Preparation Guide"
    },
    default: {
        badge: "✓ STUDYGYAAN.IN",
        gradient: ["#0f172a", "#1e293b", "#334155"],
        accent: "#93c5fd",
        subtitleFallback: "Free Sarkari Updates"
    }
};

// ---------------------------------------------------------------------------
// 🔤 Devanagari → Latin transliteration (OG-font safe)
// ---------------------------------------------------------------------------
const DV_VOWELS = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri", "ऑ": "o"
};
const DV_MATRAS = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e"
};
const DV_CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h", "ळ": "l"
};
const DV_NUMERALS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };

/**
 * Devanagari including text ko Latin me badlo ("रिजल्ट घोषित" → "result ghoshit").
 * Complete conjuncts (क्ष, ज्ञ, त्र) barkhaar logical approximation se.
 */
function devanagariToLatin(text) {
    const input = String(text || "");
    if (!/[\u0900-\u097F]/.test(input)) return input; // fast path
    let out = "";
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (DV_CONSONANTS[ch]) {
            const next = input[i + 1];
            out += DV_CONSONANTS[ch];
            if (next === "्") continue;              // half letter — no inherent "a"
            if (next && DV_MATRAS[next]) continue;   // matra next iteration dega
            if (next === "़") continue;              // nukta
            // Schwa-deletion: word ka AAKHIRI consonant bina "a" ke bolte hain
            // ("रिजल्ट" → "rijalt", "rijalta" nahi)
            if (!next || !/[\u0900-\u097F]/.test(next)) continue;
            out += "a";                              // inherent vowel
        } else if (DV_MATRAS[ch]) {
            out += DV_MATRAS[ch];
        } else if (DV_VOWELS[ch]) {
            out += DV_VOWELS[ch];
        } else if (DV_NUMERALS[ch]) {
            out += DV_NUMERALS[ch];
        } else if (ch === "ं" || ch === "ँ") {
            out += "n";
        } else if (ch === "ः") {
            out += "h";
        } else if (ch === "्" || ch === "़") {
            out += ""; // virama/nukta — handled with consonant
        } else {
            out += ch;
        }
    }
    return out.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// 📝 Text helpers
// ---------------------------------------------------------------------------
function escapeXml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** Title ko max 3 lines me wrap karo (word boundary se). */
function wrapTitle(title, maxChars, maxLines) {
    const words = devanagariToLatin(String(title || "")).replace(/\s+/g, " ").trim().split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            current = word;
            if (lines.length >= maxLines) break;
        }
    }
    if (lines.length < maxLines && current) lines.push(current);
    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…?$/, "")}…`;
    }
    return lines.filter(Boolean).slice(0, maxLines);
}

function themeFor(canonicalType) {
    return OG_THEMES[canonicalType] || OG_THEMES.default;
}

// ---------------------------------------------------------------------------
// 🎨 SVG builder (1200x630 OG standard)
// ---------------------------------------------------------------------------
function buildOgSvg({ canonicalType, title, subtitle }) {
    const theme = themeFor(canonicalType);
    const [c1, c2, c3] = theme.gradient;
    const lines = wrapTitle(title || theme.subtitleFallback, 22, 3);
    const sub = devanagariToLatin(String(subtitle || theme.subtitleFallback)).slice(0, 40);
    const titleStartY = lines.length >= 3 ? 205 : lines.length === 2 ? 245 : 290;
    const badgeWidth = theme.badge.length * 22 + 56;

    const titleSpans = lines.map((line, idx) =>
        `<text x="80" y="${titleStartY + idx * 86}" font-family="DejaVu Sans, sans-serif" font-size="68" font-weight="bold" fill="#ffffff">${escapeXml(line)}</text>`
    ).join("");

    return `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="55%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <circle cx="1120" cy="70" r="220" fill="#ffffff" opacity="0.06"/>
  <circle cx="120" cy="590" r="180" fill="#ffffff" opacity="0.05"/>
  <rect x="80" y="58" rx="30" ry="30" width="${badgeWidth}" height="62" fill="#ffffff" opacity="0.16"/>
  <text x="108" y="100" font-family="DejaVu Sans, sans-serif" font-size="34" font-weight="bold" fill="${theme.accent}">${escapeXml(theme.badge)}</text>
  ${titleSpans}
  <text x="80" y="${titleStartY + lines.length * 86 + 4}" font-family="DejaVu Sans, sans-serif" font-size="36" font-weight="bold" fill="${theme.accent}">${escapeXml(sub)}</text>
  <rect x="0" y="${OG_HEIGHT - 74}" width="${OG_WIDTH}" height="74" fill="#0f172a" opacity="0.85"/>
  <text x="80" y="${OG_HEIGHT - 26}" font-family="DejaVu Sans, sans-serif" font-size="30" font-weight="bold" fill="#ffffff">StudyGyaan.in — Sarkari Updates • Mock Tests</text>
  <rect x="1020" y="${OG_HEIGHT - 58}" width="130" height="42" rx="21" fill="${theme.accent}"/>
  <text x="1085" y="${OG_HEIGHT - 29}" font-family="DejaVu Sans, sans-serif" font-size="26" font-weight="bold" fill="#0f172a" text-anchor="middle">FREE ✓</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// 🗄️ Firestore se title/org lao (type → collection map)
// ---------------------------------------------------------------------------
async function loadOgData(db, canonicalType, slugOrId) {
    const collectionName = COLLECTION_BY_CANONICAL[canonicalType];
    if (!collectionName || !slugOrId) return null;
    try {
        const snap = await db.collection(collectionName)
            .where("slug", "==", slugOrId)
            .limit(1)
            .get();
        if (snap && !snap.empty) {
            const data = snap.docs[0].data();
            return { title: data.title || "", subtitle: data.organization || data.org || data.category || "" };
        }
    } catch (error) {
        console.warn("og-image fetch:", error.message);
    }
    try {
        const docSnap = await db.collection(collectionName).doc(slugOrId).get();
        if (docSnap.exists) {
            const data = docSnap.data();
            return { title: data.title || "", subtitle: data.organization || data.org || data.category || "" };
        }
    } catch (error) {
        console.warn("og-image fetch(doc):", error.message);
    }
    return null;
}

// Instance-warm cache — same image dobara render nahi hoti (CPU bachao)
const ogCache = new Map();
const OG_CACHE_MAX = 150;

function cleanCanonical(value) {
    const clean = String(value || "job").toLowerCase().replace(/[^a-z]/g, "");
    return COLLECTION_BY_CANONICAL[clean] ? clean : "job";
}

/** Public OG URL — server_seo_renderer og:image fallback ke liye. */
function buildOgImageUrl(canonicalType, slugOrId) {
    const c = cleanCanonical(canonicalType);
    const s = encodeURIComponent(String(slugOrId || "").slice(0, 120));
    return `${FUNCTIONS_BASE}/jobOgImage?c=${c}&s=${s}`;
}

// ---------------------------------------------------------------------------
// 🌐 HTTP handler — GET /jobOgImage?c=job&s=<slug>
// ---------------------------------------------------------------------------
function createOgImageHandler(db) {
    return async (req, res) => {
        const canonicalType = cleanCanonical((req.query && req.query.c) || "job");
        const slugOrId = String((req.query && req.query.s) || "").slice(0, 120);
        const cacheKey = `${canonicalType}:${slugOrId || "generic"}`;
        try {
            let buffer = ogCache.get(cacheKey);
            if (!buffer) {
                const loaded = slugOrId ? await loadOgData(db, canonicalType, slugOrId) : null;
                const svg = buildOgSvg({
                    canonicalType,
                    title: (loaded && loaded.title) || "Latest Update 2026",
                    subtitle: loaded && loaded.subtitle
                });
                const sharp = require("sharp"); // lazy — sirf image request pe load
                buffer = await sharp(Buffer.from(svg))
                    .webp({ quality: 78 })
                    .toBuffer();
                if (ogCache.size >= OG_CACHE_MAX) ogCache.clear();
                ogCache.set(cacheKey, buffer);
            }
            res.set("Content-Type", "image/webp");
            res.set("Cache-Control", "public, max-age=86400, s-maxage=172800"); // 24h-48h CDN cache
            res.set("X-OG-Format", "webp");
            return res.status(200).send(buffer);
        } catch (error) {
            console.error("❌ og-image render:", error.message || error);
            // Fallback: branded generic image bhi nahi bani to plain text
            return res.status(500).send("og image error");
        }
    };
}

module.exports = {
    OG_WIDTH,
    OG_HEIGHT,
    buildOgImageUrl,
    buildOgSvg,
    wrapTitle,
    devanagariToLatin,
    createOgImageHandler,
    themeFor
};

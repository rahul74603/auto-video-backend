/**
 * og_svg.cjs — 🖼️ BRANDED OG/THUMB IMAGE GENERATOR (static, FREE)
 * ================================================================
 * ai_backend/og_image.js (Firebase Functions version) ka static pipeline port.
 * Har content page jo image ke bina hai uske liye branded 1200x630 image
 * banata hai: gradient + category badge + title (max 3 lines) + StudyGyaan strip.
 *
 * - Hindi text pehle deterministic Latin transliteration se guzarta hai
 *   (renderer fonts me Devanagari glyphs nahi hote — tofu □□□ se bachne ke liye)
 * - PNG render sharp se hota hai (libvips+librsvg bundled — GH runner par fast)
 * - sharp na mile to ImageMagick (`magick`/`convert`) try hota hai,
 *   wo bhi na mile to graceful skip (ogMap khali → fallback images use hongi)
 *
 * "use strict" CJS — generate.cjs direct require karta hai.
 */

"use strict";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// 🎨 Type-wise branded themes (badge me sirf renderer-safe symbols — ★ ✓)
const OG_THEMES = {
  blog: {
    badge: "★ STUDY BLOG",
    gradient: ["#4c1d95", "#6d28d9", "#8b5cf6"],
    accent: "#fcd34d",
    subtitleFallback: "Free Notes + Preparation Guide",
  },
  job: {
    badge: "★ SARKARI NAUKRI 2026",
    gradient: ["#1e3a8a", "#1d4ed8", "#3b82f6"],
    accent: "#facc15",
    subtitleFallback: "Latest Govt Job Notification",
  },
  update: {
    badge: "★ FAST UPDATE 2026",
    gradient: ["#14532d", "#15803d", "#22c55e"],
    accent: "#fef08a",
    subtitleFallback: "Result / Admit Card / Answer Key",
  },
  test: {
    badge: "★ MOCK TEST",
    gradient: ["#7c2d12", "#c2410c", "#f97316"],
    accent: "#fde68a",
    subtitleFallback: "Free Online Practice Set",
  },
  material: {
    badge: "★ STUDY MATERIAL",
    gradient: ["#134e4a", "#0f766e", "#14b8a6"],
    accent: "#ccfbf1",
    subtitleFallback: "Free PDF Notes Download",
  },
  course: {
    badge: "★ COURSE",
    gradient: ["#1e1b4b", "#3730a3", "#6366f1"],
    accent: "#e0e7ff",
    subtitleFallback: "Complete Preparation Course",
  },
  story: {
    badge: "★ WEB STORY",
    gradient: ["#831843", "#be185d", "#ec4899"],
    accent: "#fce7f3",
    subtitleFallback: "Visual Update — Swipe karo",
  },
  default: {
    badge: "✓ STUDYGYAAN.IN",
    gradient: ["#0f172a", "#1e293b", "#334155"],
    accent: "#93c5fd",
    subtitleFallback: "Free Sarkari Updates",
  },
};

// ---------------------------------------------------------------------------
// 🔤 Devanagari → Latin transliteration (OG-font safe)
// ---------------------------------------------------------------------------
const DV_VOWELS = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri", "ऑ": "o",
};
const DV_MATRAS = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e",
};
const DV_CONSONANTS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
};
const DV_NUMERALS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };

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
      // Schwa-deletion: word ka AAKHIRI consonant bina "a" ke
      if (!next || !/[\u0900-\u097F]/.test(next)) continue;
      out += "a";
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
      out += "";
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
// 🏷️ Deterministic file key (slug → safe unique name)
// ---------------------------------------------------------------------------
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function ogFileKey(type, slug, title = "") {
  const safe = String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "page";
  // title hash include — taaki title badalne par image regenerate ho
  return `${type}-${safe}-${fnv1a(`${type}:${slug}:${title}`)}`;
}

// ---------------------------------------------------------------------------
// 🖼️ SVG → PNG renderer (sharp → ImageMagick → skip)
// ---------------------------------------------------------------------------
async function renderSvgToPng(svg, outPngPath) {
  // 1) sharp (preferred — bundled librsvg, fast)
  try {
    const sharp = require("sharp");
    await sharp(Buffer.from(svg), { density: 96 })
      .resize(OG_WIDTH, OG_HEIGHT)
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toFile(outPngPath);
    return true;
  } catch { /* next */ }

  // 2) ImageMagick (magick ya convert)
  const { execFileSync } = require("child_process");
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const tmpSvg = path.join(os.tmpdir(), `og-${fnv1a(outPngPath)}.svg`);
  fs.writeFileSync(tmpSvg, svg, "utf8");
  for (const bin of ["magick", "convert"]) {
    try {
      execFileSync(bin, [tmpSvg, outPngPath], { timeout: 30000 });
      if (fs.existsSync(outPngPath) && fs.statSync(outPngPath).size > 1000) return true;
    } catch { /* next bin */ }
  }
  return false;
}

module.exports = {
  OG_WIDTH,
  OG_HEIGHT,
  OG_THEMES,
  buildOgSvg,
  themeFor,
  devanagariToLatin,
  wrapTitle,
  ogFileKey,
  renderSvgToPng,
};

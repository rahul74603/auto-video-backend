#!/usr/bin/env node
/**
 * repair_images.js — 🔧 DEAD FIREBASE STORAGE IMAGES REPAIR (one-time, FREE)
 * ==========================================================================
 * Problem: Feb 2026 se Firebase Storage Spark plan pe band (error 402).
 * Saare firebasestorage.googleapis.com / storage.googleapis.com images DEAD hain.
 *
 * Ye script:
 *   1. Har collection scan karta hai (blogs, jobs, web_stories, fast_track,
 *      mock_tests, courses, study_materials)
 *   2. Jis doc ka imageUrl/coverImage dead Firebase URL pe hai, uske liye
 *      naya branded OG-style image banata hai (sharp se, koi API nahi)
 *   3. cPanel pe upload karta hai (uploads/repaired/...)
 *   4. Firestore doc update kar deta hai
 *
 * Usage:
 *   node repair_images.js --dry-run   → sirf ginti dikhao, kuch change mat karo
 *   node repair_images.js             → asli repair
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (ya SERVICE_ACCOUNT_JSON), FTP_SERVER,
 *      FTP_USERNAME, FTP_PASSWORD
 */

"use strict";

try { require("dotenv").config(); } catch (e) { /* optional */ }

const admin = require("firebase-admin");

const DRY_RUN = process.argv.includes("--dry-run");

// ---------- Firebase init ----------
if (!admin.apps.length) {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    console.error("❌ FIREBASE_SERVICE_ACCOUNT ya SERVICE_ACCOUNT_JSON env missing!");
    process.exit(1);
  }
  const sa = JSON.parse(saJson);
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: sa.project_id || "studymaterial-406ad",
  });
}
const db = admin.firestore();

// ---------- Targets ----------
const TARGETS = [
  { coll: "blogs",           field: "imageUrl",   type: "blog" },
  { coll: "jobs",            field: "imageUrl",   type: "job" },
  { coll: "web_stories",     field: "coverImage", type: "story" },
  { coll: "fast_track",      field: "imageUrl",   type: "update" },
  { coll: "mock_tests",      field: "imageUrl",   type: "test" },
  { coll: "courses",         field: "imageUrl",   type: "course" },
  { coll: "study_materials", field: "imageUrl",   type: "material" },
];

function isDeadUrl(url) {
  if (typeof url !== "string") return false;
  return (
    url.includes("firebasestorage.googleapis.com") ||
    url.includes("storage.googleapis.com/studymaterial-406ad")
  );
}

// ---------- Image generator (branded OG style, no API needed) ----------
function fallbackSvg(title, subtitle) {
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  // Title ko ~30 chars ki lines me todo (max 3 lines)
  const words = String(title || "StudyGyaan").split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 30) {
      if (cur) lines.push(cur.trim());
      cur = w;
      if (lines.length === 3) break;
    } else cur = (cur + " " + w).trim();
  }
  if (cur && lines.length < 3) lines.push(cur.trim());
  const tspans = lines
    .map((l, i) => `<tspan x="600" dy="${i === 0 ? 0 : 72}">${esc(l)}</tspan>`)
    .join("");
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a237e"/>
      <stop offset="100%" stop-color="#0d47a1"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="40" y="40" width="1120" height="550" rx="24" fill="none" stroke="#ffffff33" stroke-width="3"/>
  <text x="600" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="58" font-weight="bold" fill="#ffffff">${tspans}</text>
  <text x="600" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="#ffd54f">${esc(subtitle || "StudyGyaan.in")}</text>
</svg>`;
}

async function makeImage(title, type) {
  const sharp = require("sharp");
  let svg;
  try {
    const { buildOgSvg } = require("./og_image");
    svg = buildOgSvg({
      canonicalType: type,
      title: String(title || "StudyGyaan").slice(0, 90),
      subtitle: "StudyGyaan - Sarkari Naukri & Exam Prep",
    });
  } catch (e) {
    svg = fallbackSvg(title, "StudyGyaan.in - Sarkari Naukri & Exam Prep");
  }
  try {
    return await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  } catch (e) {
    // og_image ka SVG fail hua to simple fallback SVG try karo
    const svg2 = fallbackSvg(title, "StudyGyaan.in");
    return await sharp(Buffer.from(svg2)).jpeg({ quality: 85 }).toBuffer();
  }
}

// ---------- Main ----------
(async () => {
  console.log(DRY_RUN ? "🧪 DRY RUN — kuch change nahi hoga, sirf report\n" : "🔧 REPAIR MODE — dead images replace honge\n");

  const { uploadBuffer } = require("./cpanel_storage");
  let totalDead = 0;
  let totalFixed = 0;
  let totalFailed = 0;

  for (const t of TARGETS) {
    let snap;
    try {
      snap = await db.collection(t.coll).limit(5000).get();
    } catch (e) {
      console.log(`⚠️ ${t.coll}: fetch error (${e.message}) — skip`);
      continue;
    }

    const deadDocs = [];
    snap.forEach((doc) => {
      const val = doc.data()[t.field];
      if (isDeadUrl(val)) deadDocs.push(doc);
    });

    console.log(`📂 ${t.coll}: ${snap.size} docs, ${deadDocs.length} dead ${t.field}`);
    totalDead += deadDocs.length;
    if (DRY_RUN || !deadDocs.length) continue;

    for (const doc of deadDocs) {
      const data = doc.data();
      try {
        const buffer = await makeImage(data.title || data.post_name || "StudyGyaan", t.type);
        const remote = `uploads/repaired/${t.coll}_${doc.id}.jpg`;
        const url = await uploadBuffer(buffer, remote);
        await doc.ref.update({ [t.field]: url });
        totalFixed++;
        console.log(`   ✅ ${doc.id} → ${url}`);
      } catch (e) {
        totalFailed++;
        console.log(`   ❌ ${doc.id}: ${e.message}`);
      }
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Dead images mile : ${totalDead}`);
  if (!DRY_RUN) {
    console.log(`Repair ho gaye   : ${totalFixed}`);
    console.log(`Fail hue         : ${totalFailed}`);
  } else {
    console.log(`(Dry run tha — repair ke liye bina --dry-run chalao)`);
  }
  process.exit(totalFailed > 0 ? 1 : 0);
})().catch((e) => {
  console.error("❌ FATAL:", e);
  process.exit(1);
});

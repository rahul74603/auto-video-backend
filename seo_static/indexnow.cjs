#!/usr/bin/env node
/**
 * StudyGyaan INDEXNOW SUBMITTER (100% FREE)
 * ------------------------------------------
 * generate.cjs ke banaye _urls.json se URLs padh ke IndexNow pe submit karta hai
 * (Bing, Yandex, Seznam + master endpoint — wahi 4 endpoints jo
 *  ai_backend/indexing_booster.js me the).
 *
 * Usage:
 *   node indexnow.cjs daily   → sirf last 3 din me update hue URLs submit
 *   node indexnow.cjs bulk    → SAARE URLs submit (max 10000) — pehli baar / kabhi kabhi
 *
 * Note: Google IndexNow support nahi karta — Google ke liye sitemap hi kaafi hai
 * (Search Console me sitemap.xml already submitted hai).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const SITE_URL = "https://studygyaan.in";
const SITE_HOST = "studygyaan.in";
const INDEXNOW_KEY = "9629c8c41fa94b898f83a53ecd320743";

const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
  "https://search.seznam.cz/indexnow",
  "https://yandex.com/indexnow",
];

const mode = (process.argv[2] || "daily").toLowerCase();
const urlsFile = path.resolve(__dirname, "../seo_out/_urls.json");

if (!fs.existsSync(urlsFile)) {
  console.error("❌ _urls.json nahi mila. Pehle generate.cjs chalao.");
  process.exit(1);
}

const all = JSON.parse(fs.readFileSync(urlsFile, "utf8"));
console.log(`📄 Total URLs available: ${all.length}`);

let toSubmit;
if (mode === "bulk") {
  toSubmit = all.slice(0, 10000).map((u) => u.url);
  console.log(`🚀 BULK MODE: ${toSubmit.length} URLs submit honge`);
} else {
  const cutoff = Date.now() - 3 * 24 * 3600 * 1000; // last 3 din
  toSubmit = all
    .filter((u) => {
      const d = new Date(u.lastmod || 0).getTime();
      return d >= cutoff;
    })
    .map((u) => u.url);
  console.log(`📅 DAILY MODE: last 3 din me ${toSubmit.length} URLs update hue`);
}

if (!toSubmit.length) {
  console.log("ℹ️ Kuch naya nahi hai submit karne ko. (Ye normal hai — koi error nahi.)");
  process.exit(0);
}

async function submitBatch(urls) {
  const payload = {
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
  const results = await Promise.allSettled(
    INDEXNOW_ENDPOINTS.map(async (endpoint) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
      return { endpoint, status: res.status };
    })
  );
  results.forEach((r) => {
    if (r.status === "fulfilled") {
      const ok = r.value.status >= 200 && r.value.status < 300;
      console.log(`   ${ok ? "✅" : "⚠️"} ${r.value.endpoint} → HTTP ${r.value.status}`);
    } else {
      console.log(`   ❌ ${r.reason && r.reason.message}`);
    }
  });
}

(async () => {
  const BATCH = 1000;
  for (let i = 0; i < toSubmit.length; i += BATCH) {
    const batch = toSubmit.slice(i, i + BATCH);
    console.log(`\n📦 Batch ${Math.floor(i / BATCH) + 1}: ${batch.length} URLs...`);
    await submitBatch(batch);
  }
  console.log(`\n🎉 IndexNow submission DONE — ${toSubmit.length} URLs, ${INDEXNOW_ENDPOINTS.length} endpoints.`);
  process.exit(0);
})().catch((e) => {
  console.error("❌ FATAL:", e);
  process.exit(1);
});

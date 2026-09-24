#!/usr/bin/env node
"use strict";

/**
 * GSC Export → SEO Intelligence JSON converter (zero-dependency).
 * ================================================================
 * Google Search Console ke Performance export (CSV) ko us JSON me badalta hai
 * jo "SEO Intelligence Runner" GitHub Actions workflow ke `gsc_json` input
 * me paste kiya ja sakta hai.
 *
 * USE (PowerShell, repo root se):
 *   node ai_backend/tools/gsc_export_to_json.js GSC_Export.csv
 *   node ai_backend/tools/gsc_export_to_json.js Queries.csv Pages.csv --limit 120
 *   node ai_backend/tools/gsc_export_to_json.js Pages.csv --out gsc.json
 *
 * GSC me export kaise karein:
 *   Search Console → Performance → Search results
 *   → date range "Last 3 months" → Export button → "Download CSV"
 *     (ya ZIP ho to extract karke Queries.csv / Pages.csv use karo)
 *
 * NOTES:
 *   - Pages.csv (page-level rows) sabse zyada useful hai — CTR opportunities
 *     page ke hisaab se banti hain.
 *   - Queries.csv rows me page nahi hota — unme page "/" maan liya jata hai
 *     (query-level CTR insight ke liye).
 *   - Output me sirf top-N rows (impressions ke hisaab se) jati hain taaki
 *     JSON workflow-input size limit (~64KB) me fit ho. Default 150.
 *   - Ye tool kuch bhi upload/publish nahi karta — sirf CSV padhta hai.
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const files = [];
  let limit = 150;
  let out = "";
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === "--limit") { limit = Math.max(1, Math.min(400, parseInt(argv[++i], 10) || 150)); continue; }
    if (a === "--out") { out = argv[++i] || ""; continue; }
    if (a === "--help" || a === "-h") { process.stdout.write(usage()); process.exit(0); }
    files.push(a);
  }
  return { files, limit, out };
}

function usage() {
  return [
    "GSC Export → SEO Intelligence JSON converter",
    "",
    "Usage:",
    "  node gsc_export_to_json.js <file.csv> [more.csv ...] [--limit N] [--out file.json]",
    "",
    "GSC: Performance → Search results → Export → Download CSV (ya ZIP extract).",
    "Output JSON ko SEO Intelligence Runner workflow ke 'gsc_json' input me paste karo.",
    "",
  ].join("\n");
}

// ---------- CSV parsing (quoted fields + delimiter sniffing) ----------
function sniffDelimiter(headerLine) {
  const counts = {
    ",": (headerLine.match(/,/g) || []).length,
    ";": (headerLine.match(/;/g) || []).length,
    "\t": (headerLine.match(/\t/g) || []).length,
  };
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ",";
}

function parseCsvLine(line, delim) {
  const row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  return row.map((c) => c.trim());
}

function headerKey(h) {
  return String(h || "").toLowerCase().replace(/[^a-z]/g, "");
}

const HEADER_ALIASES = {
  query: ["query", "topqueries", "topquery", "searchquery", "queries"],
  page: ["page", "toppages", "toppage", "landingpage", "url"],
  clicks: ["clicks"],
  impressions: ["impressions"],
  ctr: ["ctr"],
  position: ["position", "avgposition", "averageranking"],
};

function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const key = headerKey(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && map[field] === undefined) map[field] = idx;
    }
  });
  return map;
}

function toNumber(value) {
  if (value === undefined || value === null) return null;
  const cleaned = normalizeNumericString(value);
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// "1,234.56" (US) → 1234.56 | "1,67%" (EU decimal) → 1.67 | "9,1" → 9.1
function normalizeNumericString(value) {
  let s = String(value).trim().replace(/\s|%|₹/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, ""); // comma = thousands separator
  } else if (s.includes(",")) {
    // sirf comma: 3-3 digit ke groups (1,234 / 12,345,678) = thousands, warna decimal
    if (/^[+-]?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(/,/g, ".");
  }
  return s;
}

// GSC CTR "5.43%" ya "5.43" (percent) ya "0.0543" (fraction) — hamesha fraction nikalo
function toCtrFraction(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (raw === "" || raw === "-") return null;
  const isPercent = raw.includes("%");
  const cleaned = normalizeNumericString(raw);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (isPercent) return Math.round((n / 100) * 1e5) / 1e5;
  if (n > 1 && n <= 100) return Math.round((n / 100) * 1e5) / 1e5;
  if (n > 100) return null;
  return Math.round(n * 1e5) / 1e5;
}

function extractRowsFromCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];

  // Header line dhundo: pehli line jisme query/page/clicks jaisa column ho
  let headerIdx = -1;
  let colMap = null;
  let delim = ",";
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    delim = sniffDelimiter(lines[i]);
    const candidate = mapHeaders(parseCsvLine(lines[i], delim));
    if (candidate.clicks !== undefined && candidate.impressions !== undefined) {
      headerIdx = i;
      colMap = candidate;
      break;
    }
  }
  if (headerIdx === -1) {
    console.error(`⚠️ ${path.basename(filePath)}: koi GSC table header nahi mila (clicks+impressions chahiye) — skip`);
    return [];
  }

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delim);
    const get = (field) => (colMap[field] !== undefined ? cells[colMap[field]] : "");
    let query = get("query").replace(/\s+/g, " ").trim().slice(0, 200);
    let page = get("page").trim().slice(0, 300);
    const clicks = toNumber(get("clicks"));
    const impressions = toNumber(get("impressions"));
    const ctr = toCtrFraction(get("ctr"));
    const position = toNumber(get("position"));
    if (clicks === null || impressions === null) continue;
    if (!page && !query) continue;
    if (!page) page = "/"; // query-level row
    rows.push({ query, page, clicks: Math.round(clicks), impressions: Math.round(impressions), ctr, position });
  }
  return rows;
}

function main() {
  const { files, limit, out } = parseArgs(process.argv.slice(2));
  if (!files.length) {
    process.stderr.write(usage());
    process.exit(1);
  }

  let rows = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`⚠️ File nahi mili: ${f} — skip`);
      continue;
    }
    rows = rows.concat(extractRowsFromCsv(f));
  }

  // Valid rows only (ctr/position bhi chahiye — server bhi yahi mangta hai)
  rows = rows.filter((r) => r.ctr !== null && r.position !== null);

  // Dedupe (query+page pair)
  const seen = new Set();
  rows = rows.filter((r) => {
    const key = `${r.query}||${r.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Top-N by impressions (workflow input size limit ke liye)
  rows.sort((a, b) => b.impressions - a.impressions);
  rows = rows.slice(0, limit);

  const json = JSON.stringify(rows);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  const target = out || "stdout";

  if (out) {
    fs.writeFileSync(out, json, "utf8");
  } else {
    process.stdout.write(json);
  }
  console.error(`✅ ${rows.length} rows → ${target} (${kb} KB) — is JSON ko workflow ke 'gsc_json' input me paste karo`);
}

main();

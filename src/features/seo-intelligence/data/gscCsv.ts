/**
 * GSC Export → rows parser (browser-side, zero backend).
 * =======================================================
 * Google Search Console ke Performance CSV/ZIP export ko wahi normalized
 * rows me badalta hai jo SEO Intelligence pipeline (normalizeSearchConsoleRows)
 * samajhti hai. Admin panel ka "GSC ZIP Upload" button isi ko use karta hai —
 * data seedha admin ke browser se Firestore me jata hai (koi GitHub paste nahi).
 *
 * Handles: Pages.csv / Queries.csv / query+page pairs, quoted fields,
 * comma/semicolon/tab delimiter, US ("1,234.5") aur EU ("1,5") number formats,
 * CTR percent ("5.43%") → fraction (0.0543), BOM, preamble lines.
 */

import { unzipSync } from 'fflate';

export interface GscCsvRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
}

const HEADER_ALIASES: Record<string, string[]> = {
  query: ['query', 'topqueries', 'topquery', 'searchquery', 'queries'],
  page: ['page', 'toppages', 'toppage', 'landingpage', 'url'],
  clicks: ['clicks'],
  impressions: ['impressions'],
  ctr: ['ctr'],
  position: ['position', 'avgposition', 'averageranking'],
};

function headerKey(h: string): string {
  return String(h || '').toLowerCase().replace(/[^a-z]/g, '');
}

function mapHeaders(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const key = headerKey(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && map[field] === undefined) map[field] = idx;
    }
  });
  return map;
}

function sniffDelimiter(headerLine: string): string {
  const counts: Record<string, number> = {
    ',': (headerLine.match(/,/g) || []).length,
    ';': (headerLine.match(/;/g) || []).length,
    '\t': (headerLine.match(/\t/g) || []).length,
  };
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';
}

function parseCsvLine(line: string, delim: string): string[] {
  const row: string[] = [];
  let cur = '';
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
      row.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  return row.map((c) => c.trim());
}

// "1,234.56" (US) → 1234.56 | "1,67%" (EU decimal) → 1.67 | "9,1" → 9.1
function normalizeNumericString(value: unknown): string {
  let s = String(value ?? '').trim().replace(/\s|%|₹/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    if (/^[+-]?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(/,/g, '.');
  }
  return s;
}

function toNumber(value: unknown): number | null {
  const cleaned = normalizeNumericString(value);
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// GSC CTR "5.43%" ya "5.43" (percent) ya "0.0543" (fraction) — hamesha fraction
function toCtrFraction(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (raw === '' || raw === '-') return null;
  const isPercent = raw.includes('%');
  const n = Number(normalizeNumericString(raw));
  if (!Number.isFinite(n)) return null;
  const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
  if (isPercent) return round5(n / 100);
  if (n > 1 && n <= 100) return round5(n / 100);
  if (n > 100) return null;
  return round5(n);
}

/** Ek CSV file ka text → GSC rows (jaise export me hai). */
export function parseGscCsv(text: string): GscCsvRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];

  // Header line dhundo: pehli line jisme clicks+impressions dono columns hon
  let colMap: Record<string, number> | null = null;
  let delim = ',';
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    delim = sniffDelimiter(lines[i]);
    const candidate = mapHeaders(parseCsvLine(lines[i], delim));
    if (candidate.clicks !== undefined && candidate.impressions !== undefined) {
      colMap = candidate;
      lines.splice(0, i + 1); // header tak sab hata do
      break;
    }
  }
  if (!colMap) return [];

  const rows: GscCsvRow[] = [];
  for (const line of lines) {
    const cells = parseCsvLine(line, delim);
    const get = (field: string) => (colMap && colMap[field] !== undefined ? cells[colMap[field]] : '');
    const query = get('query').replace(/\s+/g, ' ').trim().slice(0, 200);
    const page = get('page').trim().slice(0, 300);
    const clicks = toNumber(get('clicks'));
    const impressions = toNumber(get('impressions'));
    if (clicks === null || impressions === null) continue;
    if (!page && !query) continue;
    rows.push({
      query,
      page: page || '/',
      clicks: Math.round(clicks),
      impressions: Math.round(impressions),
      ctr: toCtrFraction(get('ctr')),
      position: toNumber(get('position')),
    });
  }
  return rows;
}

/** ZIP bytes ke andar ki saari CSV files ka text (macOS junk skip). */
export function extractCsvTextsFromZip(data: ArrayBuffer): { name: string; text: string }[] {
  const entries = unzipSync(new Uint8Array(data));
  const decoder = new TextDecoder('utf-8');
  const out: { name: string; text: string }[] = [];
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith('/') || name.includes('__MACOSX') || name.startsWith('.')) continue;
    if (!name.toLowerCase().endsWith('.csv')) continue;
    out.push({ name, text: decoder.decode(bytes) });
  }
  return out;
}

/**
 * Admin ke upload kiye files (ZIP/CSV, ek ya kai) → combined GSC rows.
 * Dedupe (query+page), impressions ke hisaab se sort — capped at 300
 * (Firestore doc limit se bahut andar).
 */
export async function rowsFromGscFiles(files: File[]): Promise<GscCsvRow[]> {
  const rows: GscCsvRow[] = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.zip')) {
      const buf = await file.arrayBuffer();
      for (const csv of extractCsvTextsFromZip(buf)) {
        rows.push(...parseGscCsv(csv.text));
      }
    } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
      rows.push(...parseGscCsv(await file.text()));
    }
  }
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      const key = `${r.query}||${r.page}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 300);
}

"use strict";

/**
 * bulk_indexing.js — FAST INDEXING for 1900 pages (200 -> 1900)
 * ---------------------------------------------------------------
 * Problem: Only 200/1900 pages indexed, 1,170 orphan, 140 not in sitemap, 1,181 to IndexNow
 * Solution: Bulk submit all existing jobs/blogs/fast_track/tests/stories/courses to:
 *   1. Google Indexing API (for /job/ pages — JobPosting type)
 *   2. IndexNow (Bing, Yandex, Seznam, Naver — for all URLs)
 *   3. Sitemap ping (Google + Bing)
 * 
 * Usage:
 *   Local: node bulk_indexing.js --limit=500 --type=jobs
 *   Cloud Function: POST https://.../triggerBulkIndexing?limit=500&type=all&force=true
 *   GitHub Actions: workflow_dispatch with inputs
 * 
 * Env required:
 *   SERVICE_ACCOUNT_JSON (for Google Indexing API)
 *   INDEXNOW_KEY (optional, defaults to studygyaan-indexnow-key-2026)
 * 
 * Cost: Indexing API 200/day, IndexNow 10k/day
 * So run in batches: 200 Google + 1000 IndexNow per day
 */

// Load .env from multiple locations
try { require('dotenv').config(); } catch {}
try { require('dotenv').config({ path: '../.env' }); } catch {}
try { require('dotenv').config({ path: './.env' }); } catch {}

const admin = require('firebase-admin');
const axios = require('axios');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function initFirebase() {
  if (admin.apps.length) return;

  let saRaw = process.env.SERVICE_ACCOUNT_JSON;
  let fromFile = '';

  // Auto-load from common file locations if env var missing
  if (!saRaw) {
    const possiblePaths = [
      path.join(__dirname, 'service_account.json'),
      path.join(__dirname, 'service-account.json'),
      path.join(process.cwd(), 'service_account.json'),
      path.join(process.cwd(), 'service-account.json'),
      path.join(__dirname, '..', 'service_account.json'),
      path.join(__dirname, 'credentials.json'),
    ];
    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8');
          const parsed = JSON.parse(content);
          // Check if it's a service account (not OAuth client)
          if (parsed.type === 'service_account' && parsed.project_id) {
            saRaw = content;
            fromFile = p;
            console.log(`✅ Found service account file at: ${p} (project: ${parsed.project_id})`);
            break;
          }
        }
      } catch {}
    }
  }

  // Try GOOGLE_APPLICATION_CREDENTIALS
  if (!saRaw) {
    const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (gac && fs.existsSync(gac)) {
      try {
        const content = fs.readFileSync(gac, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed.type === 'service_account' && parsed.project_id) {
          saRaw = content;
          fromFile = gac;
          console.log(`✅ Found service account via GOOGLE_APPLICATION_CREDENTIALS: ${gac}`);
        }
      } catch {}
    }
  }

  if (!saRaw) {
    console.error(`
❌ SERVICE_ACCOUNT_JSON missing and no service_account.json file found!

Checked paths:
- ${path.join(__dirname, 'service_account.json')}
- ${path.join(__dirname, 'service-account.json')}
- ./service_account.json
- GOOGLE_APPLICATION_CREDENTIALS env var

How to fix:
1. Download from: https://console.firebase.google.com/project/studymaterial-406ad/settings/serviceaccounts/adminsdk
2. Save as: ai_backend/service_account.json
3. Then run: node bulk_indexing.js --limit=100 --type=jobs --no-google

If you have credentials.json (OAuth), that's different — you need service_account.json (service_account type).
`);
    throw new Error('SERVICE_ACCOUNT_JSON missing');
  }

  try {
    const creds = JSON.parse(saRaw);
    
    if (creds.project_id !== 'studymaterial-406ad') {
      console.warn(`⚠️ Warning: project_id is ${creds.project_id}, expected studymaterial-406ad. May cause PERMISSION_DENIED.`);
    }

    admin.initializeApp({ credential: admin.credential.cert(creds) });
    console.log(`✅ Firebase initialized for project: ${creds.project_id}${fromFile ? ` (from ${fromFile})` : ''}`);
  } catch (e) {
    console.error(`❌ Firebase init failed: ${e.message}`);
    throw e;
  }
}

initFirebase();

const db = admin.firestore();
const WEBSITE_URL = 'https://studygyaan.in';

// ---------- Google Indexing API ----------
async function getGoogleAuth() {
  const raw = process.env.SERVICE_ACCOUNT_JSON;
  // If env var missing but we loaded from file, try to read file again for auth
  let credsData = raw;
  if (!credsData) {
    const possiblePaths = [
      path.join(__dirname, 'service_account.json'),
      path.join(process.cwd(), 'service_account.json'),
    ];
    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          credsData = fs.readFileSync(p, 'utf8');
          break;
        }
      } catch {}
    }
  }
  
  if (!credsData) throw new Error('SERVICE_ACCOUNT_JSON missing for Google Indexing');
  
  let creds;
  try {
    creds = JSON.parse(credsData);
  } catch {
    // If it's a file path
    if (fs.existsSync(credsData)) {
      creds = JSON.parse(fs.readFileSync(credsData, 'utf8'));
    } else {
      throw new Error('Invalid SERVICE_ACCOUNT_JSON');
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/indexing']
  });
  const client = await auth.getClient();
  return client;
}

async function submitToGoogleIndexing(urls, type = 'URL_UPDATED') {
  const results = { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  try {
    const authClient = await getGoogleAuth();
    const indexing = google.indexing({ version: 'v3', auth: authClient });

    for (const url of urls) {
      if (!url.includes('/job/')) continue;
      if (results.attempted >= 180) {
        console.log('⏸️ Google Indexing daily quota reached (180), stopping');
        break;
      }
      try {
        await indexing.urlNotifications.publish({
          requestBody: { url, type }
        });
        results.attempted++;
        results.succeeded++;
        console.log(`✅ Google Indexed: ${url}`);
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        results.attempted++;
        results.failed++;
        const status = e.code || e.response?.status;
        if (status === 429) {
          console.log('⏸️ Google quota hit (429), stopping');
          break;
        }
        results.errors.push(`${url}: ${e.message}`);
        console.warn(`❌ Google failed for ${url}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('Google Auth failed:', e.message);
    results.errors.push(`Auth: ${e.message}`);
  }
  return results;
}

// ---------- IndexNow ----------
async function submitToIndexNow(urls) {
  const results = { attempted: 0, succeeded: 0, failed: 0 };
  const key = process.env.INDEXNOW_KEY || 'studygyaan-indexnow-key-2026';
  const batches = [];
  for (let i = 0; i < urls.length; i += 1000) {
    batches.push(urls.slice(i, i + 1000));
  }

  for (const batch of batches) {
    try {
      const payload = {
        host: 'studygyaan.in',
        key: key,
        keyLocation: `https://studygyaan.in/${key}.txt`,
        urlList: batch
      };
      const res = await axios.post('https://api.indexnow.org/indexnow', payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
        validateStatus: () => true
      });
      if (res.status === 200 || res.status === 202) {
        results.attempted += batch.length;
        results.succeeded += batch.length;
        console.log(`✅ IndexNow submitted ${batch.length} URLs (status ${res.status})`);
      } else {
        results.attempted += batch.length;
        results.failed += batch.length;
        console.warn(`❌ IndexNow failed status ${res.status}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error('IndexNow batch failed:', e.message);
      results.failed += batch.length;
    }
  }
  return results;
}

// ---------- Sitemap Ping ----------
async function pingSitemaps() {
  const sitemaps = [
    `${WEBSITE_URL}/sitemap.xml`,
    `${WEBSITE_URL}/sitemap-jobs.xml`,
    `${WEBSITE_URL}/sitemap-blogs.xml`,
    `${WEBSITE_URL}/sitemap-updates.xml`,
    `${WEBSITE_URL}/sitemap-tests.xml`,
    `${WEBSITE_URL}/sitemap-stories.xml`,
    `${WEBSITE_URL}/sitemap-courses.xml`,
  ];
  const results = [];
  for (const sitemapUrl of sitemaps) {
    try {
      await axios.get(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { timeout: 10000, validateStatus: () => true });
      await axios.get(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { timeout: 10000, validateStatus: () => true });
      results.push({ sitemap: sitemapUrl, pinged: true });
      console.log(`✅ Sitemap pinged: ${sitemapUrl}`);
    } catch (e) {
      results.push({ sitemap: sitemapUrl, pinged: false, error: e.message });
      console.warn(`❌ Sitemap ping failed ${sitemapUrl}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return results;
}

// ---------- Fetch all URLs ----------
async function fetchAllUrls(limitPerCollection = 1000, typeFilter = 'all') {
  const urls = [];
  const collections = [];
  if (typeFilter === 'all' || typeFilter === 'jobs') collections.push({ name: 'jobs', path: '/job/', limit: limitPerCollection });
  if (typeFilter === 'all' || typeFilter === 'blogs') collections.push({ name: 'blogs', path: '/blog/', limit: Math.min(limitPerCollection, 1000) });
  if (typeFilter === 'all' || typeFilter === 'fast_track') collections.push({ name: 'fast_track', path: '/update/', limit: limitPerCollection });
  if (typeFilter === 'all' || typeFilter === 'mock_tests') collections.push({ name: 'mock_tests', path: '/test/', limit: 1000 });
  if (typeFilter === 'all' || typeFilter === 'web_stories') collections.push({ name: 'web_stories', path: '/web-stories/', limit: 1000 });
  if (typeFilter === 'all' || typeFilter === 'courses') collections.push({ name: 'courses', path: '/course/', limit: 500 });

  for (const col of collections) {
    try {
      const snap = await db.collection(col.name).orderBy('createdAt', 'desc').limit(col.limit).get();
      snap.forEach(doc => {
        const data = doc.data();
        const status = String(data.status || '').toLowerCase();
        if (['draft', 'pending', 'rejected', 'private', 'archived', 'deleted', 'trash'].includes(status)) return;
        if (!data.title || String(data.title).trim().length < 5) return;
        const slug = data.slug || doc.id;
        urls.push(`${WEBSITE_URL}${col.path}${encodeURIComponent(slug)}`);
      });
      console.log(`📦 Fetched ${col.name}: ${snap.size} docs`);
    } catch (e) {
      console.warn(`Failed to fetch ${col.name}: ${e.message}`);
    }
  }
  const unique = [...new Set(urls)];
  console.log(`📊 Total unique URLs: ${unique.length} (from ${collections.length} collections)`);
  return unique;
}

// ---------- Main runner ----------
async function runBulkIndexing(options = {}) {
  const limit = Math.min(Number(options.limit) || 500, 2000);
  const type = options.type || 'all';
  const doGoogle = options.google !== false;
  const doIndexNow = options.indexnow !== false;
  const doSitemapPing = options.sitemapPing !== false;

  console.log(`🚀 Bulk Indexing Start — limit=${limit}, type=${type}, google=${doGoogle}, indexnow=${doIndexNow}`);

  const allUrls = await fetchAllUrls(limit, type);
  const urlsToProcess = allUrls.slice(0, limit);

  const report = {
    totalFetched: allUrls.length,
    totalToProcess: urlsToProcess.length,
    type,
    google: null,
    indexnow: null,
    sitemaps: null,
    startedAt: new Date().toISOString()
  };

  if (doSitemapPing) {
    report.sitemaps = await pingSitemaps();
  }
  if (doIndexNow) {
    report.indexnow = await submitToIndexNow(urlsToProcess);
  }
  if (doGoogle) {
    const jobUrls = urlsToProcess.filter(u => u.includes('/job/'));
    report.google = await submitToGoogleIndexing(jobUrls);
  }

  report.completedAt = new Date().toISOString();
  report.durationMs = new Date(report.completedAt) - new Date(report.startedAt);
  console.log('📊 Bulk Indexing Complete:', JSON.stringify(report, null, 2));
  return report;
}

// ---------- CLI ----------
if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = {};
  args.forEach(arg => {
    if (arg.startsWith('--limit=')) opts.limit = Number(arg.split('=')[1]);
    if (arg.startsWith('--type=')) opts.type = arg.split('=')[1];
    if (arg === '--no-google') opts.google = false;
    if (arg === '--no-indexnow') opts.indexnow = false;
    if (arg === '--no-sitemap') opts.sitemapPing = false;
  });
  runBulkIndexing(opts).then(report => {
    console.log('\n✅ Done');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });
}

module.exports = {
  runBulkIndexing,
  fetchAllUrls,
  submitToGoogleIndexing,
  submitToIndexNow,
  pingSitemaps
};

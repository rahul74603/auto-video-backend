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
 *   INDEXNOW_KEY (generate from https://www.indexnow.org/ — create key file at root)
 *   Or uses existing auto_indexer logic
 * 
 * Cost: Indexing API 200/day default quota, IndexNow 10k/day
 * So run in batches: 200 Google + 1000 IndexNow per day
 */

// Load .env from ai_backend folder and root
try { require('dotenv').config(); } catch {}
try { require('dotenv').config({ path: '../.env' }); } catch {}
try { require('dotenv').config({ path: './.env' }); } catch {}

const admin = require('firebase-admin');
const axios = require('axios');
const { google } = require('googleapis');

function initFirebase() {
  if (admin.apps.length) return;

  const saRaw = process.env.SERVICE_ACCOUNT_JSON;

  if (!saRaw) {
    console.error(`
❌ SERVICE_ACCOUNT_JSON missing!

How to fix:
1. Go to Firebase Console: https://console.firebase.google.com/project/studymaterial-406ad/settings/serviceaccounts/adminsdk
2. Click "Generate new private key" -> Download JSON file
3. Option A - Set as env variable (PowerShell):
   $env:SERVICE_ACCOUNT_JSON = (Get-Content -Raw .\service-account.json)
   node bulk_indexing.js --limit=500 --type=jobs

4. Option B - Put JSON file in ai_backend folder as service-account.json and set:
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\Rahul\auto-video-backend\ai_backend\service-account.json"

5. Option C - Create .env file in ai_backend folder with:
   SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"studymaterial-406ad",...}'

Current project will default to strategic-well-501911-f3 (wrong) if not set, causing PERMISSION_DENIED.
`);
    throw new Error('SERVICE_ACCOUNT_JSON missing - see instructions above');
  }

  try {
    let creds;
    // If it's a file path
    if (saRaw.trim().startsWith('{')) {
      creds = JSON.parse(saRaw);
    } else if (saRaw.endsWith('.json')) {
      const fs = require('fs');
      const content = fs.readFileSync(saRaw, 'utf8');
      creds = JSON.parse(content);
    } else {
      // Try to read as file path from GOOGLE_APPLICATION_CREDENTIALS
      const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (gac) {
        const fs = require('fs');
        const content = fs.readFileSync(gac, 'utf8');
        creds = JSON.parse(content);
      } else {
        throw new Error('SERVICE_ACCOUNT_JSON is not valid JSON and GOOGLE_APPLICATION_CREDENTIALS not set');
      }
    }

    if (creds.project_id !== 'studymaterial-406ad') {
      console.warn(`⚠️ Warning: Service account project_id is ${creds.project_id}, expected studymaterial-406ad. You may get PERMISSION_DENIED for strategic-well-501911-f3. Please download key from studymaterial-406ad project.`);
    }

    admin.initializeApp({ credential: admin.credential.cert(creds) });
    console.log(`✅ Firebase initialized for project: ${creds.project_id}`);
  } catch (e) {
    console.error(`❌ Firebase init failed: ${e.message}`);
    console.error(`   If you see PERMISSION_DENIED for strategic-well-501911-f3, you are using wrong project credentials.`);
    console.error(`   Download correct key from: https://console.firebase.google.com/project/studymaterial-406ad/settings/serviceaccounts/adminsdk`);
    throw e;
  }
}

initFirebase();


const db = admin.firestore();
const WEBSITE_URL = 'https://studygyaan.in';

// ---------- Google Indexing API ----------
async function getGoogleAuth() {
  const raw = process.env.SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('SERVICE_ACCOUNT_JSON missing');
  const creds = JSON.parse(raw);
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
      if (!url.includes('/job/')) continue; // Google Indexing API only for JobPosting / job pages
      if (results.attempted >= 180) { // Daily quota 200, keep buffer
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
        await new Promise(r => setTimeout(r, 500)); // 0.5s gap to avoid rate limit
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

// ---------- IndexNow (Bing, Yandex etc.) ----------
async function submitToIndexNow(urls) {
  const results = { attempted: 0, succeeded: 0, failed: 0 };

  // IndexNow needs a key — try to get from env or generate one
  // For StudyGyaan, key should be at https://studygyaan.in/<key>.txt
  const key = process.env.INDEXNOW_KEY || 'studygyaan-indexnow-key-2026';
  
  // IndexNow API: https://api.indexnow.org/indexnow
  // Can submit up to 10k URLs per day, 10k per request max
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
        console.warn(`❌ IndexNow failed status ${res.status}: ${JSON.stringify(res.data).slice(0,200)}`);
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
      // Ping Google
      await axios.get(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, { timeout: 10000, validateStatus: () => true });
      // Ping Bing
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

// ---------- Fetch all indexable URLs from Firestore ----------
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
        // Only indexable
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

  // Deduplicate
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
    // Google only for job pages, limited to 180/day
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

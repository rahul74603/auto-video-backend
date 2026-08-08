"use strict";

/**
 * ============================================================
 *  SOCIAL MEDIA ORCHESTRATOR — One-Click Multi-Platform Posting
 *  ------------------------------------------------------------
 *  User demand: "bas .env and github secrets me dale or kuch na karna pade and system chalne lage"
 *  
 *  This orchestrator:
 *    - Reads all creds from .env (local) and GitHub Secrets (Actions)
 *    - Checks automation guard (system_settings/automation) — respects Pause All
 *    - Posts to ALL enabled platforms in parallel:
 *      ✅ Telegram (already works)
 *      ✅ Facebook Page (FB_PAGE_ID + FB_PAGE_TOKEN)
 *      ✅ Twitter / X (TWITTER_API_KEY + SECRET + ACCESS_TOKEN + SECRET)
 *      ✅ LinkedIn (LINKEDIN_ACCESS_TOKEN + ORGANIZATION_ID)
 *      🔜 Instagram (via Facebook Graph API — needs FB + Instagram linked)
 *      🔜 YouTube Community (via YOUTUBE_TOKEN — for community posts)
 *    - Handles failures gracefully — one platform fail does not stop others
 *    - Returns summary for logging / Telegram summary
 * 
 *  Usage in code:
 *    const { postToAllPlatforms } = require('./social_media/social_orchestrator');
 *    await postToAllPlatforms({ type: 'JOB', data: job });
 *  
 *  Usage via GitHub Actions:
 *    Already integrated into auto_blog, govt_jobs, fast_track workflows via check_automation
 *  
 *  Env setup: Just add to ai_backend/.env and GitHub Secrets — no code change needed
 */

const { isAutomationEnabled } = require('../agents/automation_guard');

// Lazy loaders for posters (avoid hard crash if deps missing)
function safeRequire(path) {
  try {
    return require(path);
  } catch (e) {
    console.warn(`⚠️ Social poster ${path} not available: ${e.message}`);
    return null;
  }
}

async function postToAllPlatforms({ type, data, url, customMessage, db, FieldValue }) {
  const results = {
    attempted: [],
    succeeded: [],
    failed: [],
    skipped: [],
    startTime: Date.now()
  };

  // Check global automation guard
  if (db) {
    try {
      const globalGuard = await isAutomationEnabled(db, 'global');
      if (!globalGuard.enabled) {
        console.log(`⏸️ Social orchestrator skipped — ${globalGuard.reason}`);
        results.skipped.push({ platform: 'all', reason: globalGuard.reason });
        return results;
      }
    } catch (e) {
      console.warn('Automation guard check failed (continuing):', e.message);
    }
  }

  // Determine content
  let title = data?.title || 'StudyGyaan Update';
  let finalUrl = url || '';
  if (!finalUrl) {
    if (type === 'JOB') finalUrl = `https://studygyaan.in/job/${data.slug || data.id}`;
    else if (type === 'BLOG') finalUrl = `https://studygyaan.in/blog/${data.slug || data.id}`;
    else if (type === 'FAST_TRACK') finalUrl = `https://studygyaan.in/update/${data.slug || data.id}`;
    else finalUrl = 'https://studygyaan.in';
  }

  const message = customMessage || `${title}\n\n${finalUrl}`;

  // Define platforms with their feature keys and poster modules
  const platforms = [
    {
      key: 'fb_post',
      name: 'Facebook',
      modulePath: './facebook_poster',
      functionName: type === 'JOB' ? 'postJobToFacebook' : 'postToFacebook',
      fallbackFn: 'postToFacebook',
      enabled: true
    },
    {
      key: 'twitter',
      name: 'Twitter/X',
      modulePath: './twitter_poster',
      functionName: type === 'JOB' ? 'postJobToTwitter' : 'postToTwitter',
      fallbackFn: 'postToTwitter',
      enabled: true
    },
    {
      key: 'linkedin',
      name: 'LinkedIn',
      modulePath: './linkedin_poster',
      functionName: type === 'JOB' ? 'postJobToLinkedIn' : 'postToLinkedIn',
      fallbackFn: 'postToLinkedIn',
      enabled: true
    },
    {
      key: 'telegram',
      name: 'Telegram',
      modulePath: null, // Handled separately via existing govt_jobs telegram logic
      enabled: false // Skip here to avoid duplicate (already sent in govt_jobs)
    }
  ];

  // Run all platforms in parallel (but with error isolation)
  const promises = platforms.map(async (platform) => {
    if (!platform.enabled) {
      results.skipped.push({ platform: platform.name, reason: 'disabled or handled elsewhere' });
      return;
    }

    // Check per-feature automation guard
    if (db) {
      try {
        const guard = await isAutomationEnabled(db, platform.key);
        if (!guard.enabled) {
          console.log(`⏸️ ${platform.name} skipped — ${guard.reason}`);
          results.skipped.push({ platform: platform.name, reason: guard.reason });
          return;
        }
      } catch (e) {
        console.warn(`Guard check failed for ${platform.name}:`, e.message);
      }
    }

    results.attempted.push(platform.name);

    const poster = platform.modulePath ? safeRequire(platform.modulePath) : null;
    if (!poster) {
      results.failed.push({ platform: platform.name, reason: 'module not found' });
      return;
    }

    try {
      let result;
      const fn = poster[platform.functionName] || poster[platform.fallbackFn];
      if (!fn) {
        throw new Error(`Function ${platform.functionName} not found in ${platform.modulePath}`);
      }

      if (type === 'JOB' || type === 'BLOG' || type === 'FAST_TRACK') {
        result = await fn(data);
      } else {
        result = await fn(message, finalUrl);
      }

      if (result.sent) {
        results.succeeded.push({ platform: platform.name, id: result.id });
        console.log(`✅ ${platform.name} posted`);
      } else {
        results.failed.push({ platform: platform.name, reason: result.reason });
        console.log(`⏭️ ${platform.name} skipped: ${result.reason}`);
      }
    } catch (err) {
      console.error(`❌ ${platform.name} error:`, err.message);
      results.failed.push({ platform: platform.name, reason: err.message });
    }
  });

  await Promise.allSettled(promises);

  results.durationMs = Date.now() - results.startTime;
  results.summary = `${results.succeeded.length}/${results.attempted.length} platforms posted, ${results.failed.length} failed, ${results.skipped.length} skipped in ${results.durationMs}ms`;

  console.log(`📊 Social orchestrator: ${results.summary}`);

  return results;
}

/**
 * CLI runner for testing
 * Usage: node social_media/social_orchestrator.js JOB <jobId>
 */
if (require.main === module) {
  (async () => {
    const type = process.argv[2] || 'JOB';
    const id = process.argv[3] || 'test';
    console.log(`Testing social orchestrator for ${type} ${id}...`);
    
    // Mock data
    const mockData = {
      id,
      slug: id,
      title: `Test ${type} Title — StudyGyaan`,
      organization: 'Test Organization',
      lastDate: '31 Dec 2026',
      vacancies: '100',
      description: 'Test description'
    };

    const result = await postToAllPlatforms({ type, data: mockData });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })();
}

module.exports = {
  postToAllPlatforms
};

"use strict";

/**
 * Twitter / X Auto Poster
 * Posts job updates, blogs, results to Twitter/X automatically
 * 
 * Env required (put in .env and GitHub Secrets):
 *   TWITTER_API_KEY=
 *   TWITTER_API_SECRET=
 *   TWITTER_ACCESS_TOKEN=
 *   TWITTER_ACCESS_SECRET=
 *   # Optional for v2 with OAuth 2.0
 *   TWITTER_BEARER_TOKEN=
 *   TWITTER_CLIENT_ID=
 *   TWITTER_CLIENT_SECRET=
 * 
 * How to get keys:
 *   1. Go to https://developer.twitter.com -> Create Project & App
 *   2. Enable OAuth 1.0a + OAuth 2.0
 *   3. Generate Consumer Keys (API Key/Secret) and Access Token/Secret
 *   4. Set permissions to Read and Write
 */

const axios = require('axios');

function getTwitterCreds() {
  return {
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
    bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  };
}

function hasCreds(creds) {
  // Need either OAuth 1.0a (apiKey+secret+accessToken+secret) or Bearer
  const oAuth1 = creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret;
  const bearer = creds.bearerToken;
  return Boolean(oAuth1 || bearer);
}

/**
 * Post to Twitter/X using v2 API
 * For simplicity, we use OAuth 1.0a via twitter-api-v2 if available, fallback to raw API call
 */
async function postToTwitter(text, url, options = {}) {
  const creds = getTwitterCreds();
  
  if (!hasCreds(creds)) {
    console.log('⏭️ Twitter creds missing — skipping (set TWITTER_API_KEY etc. in .env)');
    return { sent: false, reason: 'no-creds' };
  }

  // Build tweet text — max 280 chars, but we want link + hashtags
  let tweetText = text;
  if (url && !tweetText.includes(url)) {
    // Reserve 23 chars for t.co link + space
    const maxTextLen = 280 - 24 - 10; // 10 for safety
    if (tweetText.length > maxTextLen) {
      tweetText = tweetText.slice(0, maxTextLen - 3) + '...';
    }
    tweetText = `${tweetText}\n\n${url}`;
  }

  // Add hashtags if provided
  if (options.hashtags && Array.isArray(options.hashtags) && options.hashtags.length) {
    const tags = options.hashtags.map(t => `#${String(t).replace(/[^A-Za-z0-9_]/g, '')}`).join(' ');
    if ((tweetText + ' ' + tags).length <= 280) {
      tweetText += ` ${tags}`;
    }
  }

  // Try using twitter-api-v2 library if installed
  try {
    // Dynamic import to avoid hard dependency
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({
      appKey: creds.apiKey,
      appSecret: creds.apiSecret,
      accessToken: creds.accessToken,
      accessSecret: creds.accessSecret,
    });
    const result = await client.v2.tweet(tweetText);
    console.log(`✅ Twitter posted: ${result.data.id} — ${tweetText.slice(0, 50)}...`);
    return { sent: true, id: result.data.id, text: tweetText };
  } catch (libErr) {
    // Fallback to manual OAuth? For now, try bearer token method (only works for app-only, can't tweet)
    // If twitter-api-v2 not installed or fails, try raw fetch with OAuth 1.0a header (simplified)
    console.warn(`Twitter library failed (${libErr.message}), trying raw API...`);

    // If bearer token only, we cannot tweet (need user context) — skip with reason
    if (!creds.apiKey || !creds.accessToken) {
      console.log('⏭️ Twitter needs OAuth 1.0a user context to tweet — skipping');
      return { sent: false, reason: 'needs-oauth1' };
    }

    // Raw API call with bearer + user - for simplicity, we'll fail gracefully and instruct
    try {
      // This is a placeholder — real OAuth 1.0a signing is complex
      // We recommend installing twitter-api-v2: npm install twitter-api-v2
      throw new Error('Install twitter-api-v2: npm install twitter-api-v2 in ai_backend');
    } catch (e) {
      console.error('❌ Twitter post failed:', e.message);
      return { sent: false, reason: e.message };
    }
  }
}

/**
 * Post job to Twitter
 */
async function postJobToTwitter(job) {
  const title = job.title || 'Latest Govt Job';
  const url = `https://studygyaan.in/job/${job.slug || job.id}`;
  const org = job.organization || 'Govt Dept';
  const lastDate = job.lastDate ? `Last Date: ${job.lastDate}` : 'Apply Soon';
  
  const text = `🚨 ${title}\n\n🏢 ${org}\n⏳ ${lastDate}\n\n📖 Details:`;
  
  return postToTwitter(text, url, {
    hashtags: ['SarkariNaukri', 'GovtJobs', 'StudyGyaan', (org.split(' ')[0] || 'Jobs').replace(/[^A-Za-z0-9]/g, '')]
  });
}

async function postBlogToTwitter(blog) {
  const title = blog.title || 'New Blog';
  const url = `https://studygyaan.in/blog/${blog.slug || blog.id}`;
  const text = `📝 ${title}\n\nRead now:`;
  return postToTwitter(text, url, { hashtags: ['StudyGyaan', 'Education', 'ExamTips'] });
}

module.exports = {
  getTwitterCreds,
  hasCreds,
  postToTwitter,
  postJobToTwitter,
  postBlogToTwitter
};

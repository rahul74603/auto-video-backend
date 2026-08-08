"use strict";

/**
 * Instagram Auto Poster (via Facebook Graph API)
 * Requires Facebook Page linked to Instagram Business Account
 * 
 * Env:
 *   FB_PAGE_ID=
 *   FB_PAGE_TOKEN=
 *   INSTAGRAM_ACCOUNT_ID= (IG User ID, get via /{page-id}?fields=instagram_business_account)
 * 
 * Note: Instagram posting via API only supports images/videos, not text-only
 * For job alerts, we post image + caption
 */

function getCreds() {
  return {
    pageId: process.env.FB_PAGE_ID || '',
    pageToken: process.env.FB_PAGE_TOKEN || '',
    igAccountId: process.env.INSTAGRAM_ACCOUNT_ID || process.env.FB_INSTAGRAM_ID || '',
  };
}

function hasCreds(c) {
  return Boolean(c.pageToken && c.igAccountId);
}

async function postToInstagram(caption, imageUrl) {
  const creds = getCreds();
  if (!hasCreds(creds)) {
    console.log('⏭️ Instagram creds missing — skipping (needs FB_PAGE_TOKEN + INSTAGRAM_ACCOUNT_ID)');
    return { sent: false, reason: 'no-creds' };
  }

  if (!imageUrl) {
    console.log('⏭️ Instagram needs imageUrl — skipping (text-only not supported via API)');
    return { sent: false, reason: 'needs-image' };
  }

  const axios = require('axios');
  
  try {
    // Step 1: Create container
    const containerRes = await axios.post(
      `https://graph.facebook.com/v19.0/${creds.igAccountId}/media`,
      {
        image_url: imageUrl,
        caption: caption.slice(0, 2200), // IG caption limit 2200
        access_token: creds.pageToken
      }
    );

    const creationId = containerRes.data.id;
    console.log(`📸 Instagram container created: ${creationId}`);

    // Step 2: Publish
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${creds.igAccountId}/media_publish`,
      {
        creation_id: creationId,
        access_token: creds.pageToken
      }
    );

    console.log(`✅ Instagram posted: ${publishRes.data.id}`);
    return { sent: true, id: publishRes.data.id };

  } catch (err) {
    console.error('❌ Instagram failed:', err.response?.data || err.message);
    return { sent: false, reason: err.message };
  }
}

async function postJobToInstagram(job) {
  const title = job.title || 'Latest Govt Job';
  const url = `https://studygyaan.in/job/${job.slug || job.id}`;
  const caption = `🚨 ${title}\n\n🏢 ${job.organization || ''}\n⏳ ${job.lastDate || 'Apply Soon'}\n\nLink in bio: ${url}\n\n#SarkariNaukri #GovtJobs #StudyGyaan`;
  // Use job image or default og image
  const imageUrl = job.imageUrl || 'https://studygyaan.in/og-image.jpg';
  return postToInstagram(caption, imageUrl);
}

module.exports = {
  getCreds,
  hasCreds,
  postToInstagram,
  postJobToInstagram
};

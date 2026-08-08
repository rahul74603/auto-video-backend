"use strict";

/**
 * Facebook Page Auto Poster (Improved)
 * Posts to Facebook Page via Graph API
 * 
 * Env:
 *   FB_PAGE_ID=
 *   FB_PAGE_TOKEN= (Page Access Token, long-lived, never expires if generated correctly)
 * 
 * How to get:
 *   1. developers.facebook.com -> Create App
 *   2. Add Facebook Login + Graph API
 *   3. Generate Page Token with permissions: pages_manage_posts, pages_read_engagement, publish_to_groups (if needed)
 *   4. Token never expires if you generate long-lived via API
 */

const axios = require('axios');

function getFBCreds() {
  return {
    pageId: process.env.FB_PAGE_ID || '',
    pageToken: process.env.FB_PAGE_TOKEN || '',
  };
}

function hasCreds(creds) {
  return Boolean(creds.pageId && creds.pageToken);
}

async function postToFacebook(message, linkUrl, options = {}) {
  const creds = getFBCreds();
  
  if (!hasCreds(creds)) {
    console.log('⏭️ FB creds missing — skipping');
    return { sent: false, reason: 'no-creds' };
  }

  let fullMessage = message;
  if (linkUrl && !fullMessage.includes(linkUrl)) {
    fullMessage = `${fullMessage}\n\n🔗 ${linkUrl}`;
  }

  // Add hashtags if provided
  if (options.hashtags && Array.isArray(options.hashtags)) {
    const tags = options.hashtags.map(t => `#${String(t).replace(/[^A-Za-z0-9_]/g, '')}`).join(' ');
    if ((fullMessage + ' ' + tags).length <= 2000) {
      fullMessage += `\n\n${tags}`;
    }
  }

  const url = `https://graph.facebook.com/v19.0/${creds.pageId}/feed`;

  try {
    const response = await axios.post(url, {
      message: fullMessage,
      link: linkUrl || undefined,
      access_token: creds.pageToken
    }, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data;
    if (data.id) {
      console.log(`✅ Facebook posted: ${data.id}`);
      return { sent: true, id: data.id, message: fullMessage };
    } else {
      console.error('❌ FB post failed:', data);
      return { sent: false, reason: JSON.stringify(data) };
    }
  } catch (err) {
    console.error('❌ FB error:', err.response?.data || err.message);
    return { sent: false, reason: err.message };
  }
}

async function postJobToFacebook(job) {
  const title = job.title || 'Latest Govt Job';
  const org = job.organization || 'Govt Department';
  const url = `https://studygyaan.in/job/${job.slug || job.id}`;
  const lastDate = job.lastDate ? `Last Date: ${job.lastDate}` : 'Apply Soon';
  
  const message = `🚨 New Job Alert!

📌 ${title}
🏢 ${org}
⏳ ${lastDate}
👥 ${job.vacancies ? job.vacancies + ' Posts' : 'Multiple Vacancies'}

📖 Full Details + Apply Link:
${url}

Join @studygyaan_official for daily updates!`;

  return postToFacebook(message, url, {
    hashtags: ['SarkariNaukri', 'GovtJobs', 'StudyGyaan']
  });
}

module.exports = {
  getFBCreds,
  hasCreds,
  postToFacebook,
  postJobToFacebook
};

"use strict";

/**
 * YouTube Community Post / Video Description Automation
 * For YouTube, we have two use cases:
 *   1. Community Post (text + image) on YouTube channel
 *   2. Video upload already handled via autoVideo.js / long_video.js
 * 
 * Env:
 *   YOUTUBE_CLIENT_ID=
 *   YOUTUBE_CLIENT_SECRET=
 *   YOUTUBE_REFRESH_TOKEN=
 *   YOUTUBE_CHANNEL_ID=
 *   # OR existing YOUTUBE_TOKEN (OAuth access token JSON)
 * 
 * Note: YouTube API quota is limited (10k units/day). Community posts cost ~50 units.
 * For now, this is a placeholder that logs and can be extended.
 */

function getCreds() {
  return {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || '',
    channelId: process.env.YOUTUBE_CHANNEL_ID || '',
    tokenJson: process.env.YOUTUBE_TOKEN || '',
  };
}

function hasCreds(c) {
  return Boolean((c.clientId && c.clientSecret && c.refreshToken) || c.tokenJson);
}

async function postToYouTubeCommunity(text, url) {
  const creds = getCreds();
  if (!hasCreds(creds)) {
    console.log('⏭️ YouTube creds missing — skipping (needs YOUTUBE_CLIENT_ID etc.)');
    return { sent: false, reason: 'no-creds' };
  }

  // TODO: Implement YouTube Community Post via API
  // YouTube Data API v3 does not have direct community post endpoint for all channels
  // It requires youtubePartner or specific access. For now, we log and skip.
  // Alternative: Use existing autoVideo.js to create Shorts video and upload

  console.log(`📺 YouTube Community Post (simulated): ${text.slice(0, 80)}... ${url}`);
  console.log('ℹ️ YouTube community posting requires YouTube Partner API — for now, video upload via autoVideo.js is used');

  return { sent: false, reason: 'not-implemented-yet-use-video-upload', simulated: true };
}

async function postJobToYouTube(job) {
  const title = job.title || 'Latest Govt Job';
  const url = `https://studygyaan.in/job/${job.slug || job.id}`;
  const text = `🚨 New Job: ${title}\n\nFull details: ${url}\n\n#SarkariNaukri #StudyGyaan`;
  return postToYouTubeCommunity(text, url);
}

module.exports = {
  getCreds,
  hasCreds,
  postToYouTubeCommunity,
  postJobToYouTube
};

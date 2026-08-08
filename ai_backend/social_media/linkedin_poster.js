"use strict";

/**
 * LinkedIn Auto Poster
 * Posts job updates, blogs to LinkedIn Company Page / Personal Profile
 * 
 * Env required (put in .env and GitHub Secrets):
 *   LINKEDIN_ACCESS_TOKEN=   (OAuth 2.0 access token, long-lived)
 *   LINKEDIN_ORGANIZATION_ID= (e.g., urn:li:organization:123456789 — for company page)
 *   # OR for personal profile:
 *   LINKEDIN_PERSON_ID=       (e.g., urn:li:person:xxxx)
 *   # Optional for token refresh:
 *   LINKEDIN_CLIENT_ID=
 *   LINKEDIN_CLIENT_SECRET=
 * 
 * How to get token:
 *   1. Create LinkedIn App at https://developer.linkedin.com/
 *   2. Request Products: Share on LinkedIn + Marketing Developer Platform (for company page)
 *   3. OAuth 2.0: Redirect URI, get code, exchange for access token
 *   4. For company page: get organization ID via https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee
 *   5. Token expires in 60 days — use refresh flow or regenerate
 * 
 * API Docs: https://learn.microsoft.com/en-us/linkedin/marketing/
 */

const axios = require('axios');

function getLinkedInCreds() {
  return {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN || '',
    orgId: process.env.LINKEDIN_ORGANIZATION_ID || '',
    personId: process.env.LINKEDIN_PERSON_ID || '',
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  };
}

function hasCreds(creds) {
  return Boolean(creds.accessToken && (creds.orgId || creds.personId));
}

async function postToLinkedIn(text, url, options = {}) {
  const creds = getLinkedInCreds();
  
  if (!hasCreds(creds)) {
    console.log('⏭️ LinkedIn creds missing — skipping (set LINKEDIN_ACCESS_TOKEN + ORG_ID)');
    return { sent: false, reason: 'no-creds' };
  }

  // Build LinkedIn post content
  const author = creds.orgId || creds.personId;
  if (!author) {
    return { sent: false, reason: 'no-author-id' };
  }

  // LinkedIn post body — supports 3000 chars
  let postText = text;
  if (url && !postText.includes(url)) {
    postText = `${postText}\n\n🔗 ${url}`;
  }

  if (options.hashtags && Array.isArray(options.hashtags)) {
    const tags = options.hashtags.map(t => `#${String(t).replace(/[^A-Za-z0-9_]/g, '')}`).join(' ');
    if ((postText + ' ' + tags).length <= 2800) {
      postText += `\n\n${tags}`;
    }
  }

  // Add StudyGyaan branding
  if (!postText.includes('StudyGyaan')) {
    postText += '\n\n— via StudyGyaan.in';
  }

  const payload = {
    author: author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: postText
        },
        shareMediaCategory: 'ARTICLE',
        media: url ? [
          {
            status: 'READY',
            description: {
              text: options.description || postText.slice(0, 200)
            },
            originalUrl: url,
            title: {
              text: options.title || 'StudyGyaan Update'
            }
          }
        ] : []
      }
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
  };

  try {
    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        timeout: 15000
      }
    );

    console.log(`✅ LinkedIn posted: ${response.data.id} — ${postText.slice(0, 50)}...`);
    return { sent: true, id: response.data.id, text: postText };

  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error(`❌ LinkedIn post failed (${status}):`, data || err.message);

    // Common errors
    if (status === 401) {
      console.error('🔑 LinkedIn token expired! Regenerate via OAuth flow. Token valid 60 days only.');
    }
    if (status === 403) {
      console.error('🚫 LinkedIn permissions missing — need w_member_social + w_organization_social');
    }

    return { sent: false, reason: err.message, status, data };
  }
}

async function postJobToLinkedIn(job) {
  const title = job.title || 'Latest Government Job';
  const org = job.organization || 'Government Department';
  const location = job.location || 'India';
  const vacancies = job.vacancies ? `${job.vacancies} vacancies` : 'Multiple vacancies';
  const lastDate = job.lastDate ? `Last Date: ${job.lastDate}` : '';

  const url = `https://studygyaan.in/job/${job.slug || job.id}`;

  const text = `🚨 New Government Job Alert!

📌 ${title}
🏢 ${org} | 📍 ${location}
👥 ${vacancies}
⏳ ${lastDate}

We are hiring! Check eligibility, salary, selection process and apply online.

#SarkariNaukri #GovernmentJobs #StudyGyaan #${org.split(' ')[0]}`;

  return postToLinkedIn(text, url, {
    title: title,
    description: `Apply for ${title} at ${org}. ${vacancies}, last date ${lastDate}`,
    hashtags: ['SarkariNaukri', 'GovtJobs', 'StudyGyaan', 'Hiring', 'IndiaJobs']
  });
}

async function postBlogToLinkedIn(blog) {
  const title = blog.title || 'New Article';
  const url = `https://studygyaan.in/blog/${blog.slug || blog.id}`;
  const text = `📝 New Article on StudyGyaan!

${title}

${(blog.description || '').slice(0, 200)}

Read full article and boost your exam preparation!

#StudyGyaan #Education #ExamTips #CompetitiveExams`;

  return postToLinkedIn(text, url, {
    title: title,
    description: blog.description || title,
    hashtags: ['StudyGyaan', 'Education', 'ExamPreparation']
  });
}

module.exports = {
  getLinkedInCreds,
  hasCreds,
  postToLinkedIn,
  postJobToLinkedIn,
  postBlogToLinkedIn
};

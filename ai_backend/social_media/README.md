# 🚀 Social Media Automation — StudyGyaan

One-click auto-posting to **Facebook, Twitter/X, LinkedIn, Instagram, YouTube** + Telegram.

> **User demand:** "bas .env and github secrets me dale or kuch na karna pade and system chalne lage"

Exactly that — just add keys in 2 places and system auto-starts.

---

## 📦 What was built?

### Backend (Cloud Functions — auto on job publish)
- `ai_backend/social_media/facebook_poster.js` — Improved Facebook Page poster
- `ai_backend/social_media/twitter_poster.js` — Twitter/X API v2 poster (needs twitter-api-v2 lib)
- `ai_backend/social_media/linkedin_poster.js` — LinkedIn Company/Page poster
- `ai_backend/social_media/instagram_poster.js` — Instagram via Facebook Graph API (needs image)
- `ai_backend/social_media/youtube_poster.js` — YouTube Community placeholder + video upload already via autoVideo.js
- `ai_backend/social_media/social_orchestrator.js` — **Master orchestrator** that posts to ALL enabled platforms in parallel, respects `system_settings/automation` Pause All

**Integration:** `ai_backend/govt_jobs.js` → `onJobPublishedNotify` now calls `postToAllPlatforms()` after Telegram. So when a job is published, it automatically posts to FB + Twitter + LinkedIn + Insta (if creds present).

### GitHub Actions (alternative / backup)
- `.github/workflows/auto_post_twitter.yml` — Posts to Twitter on `repository_dispatch: twitter_post` or manual
- `.github/workflows/auto_post_linkedin.yml` — Posts to LinkedIn
- `.github/workflows/auto_post_social_all.yml` — Posts to ALL (FB+Twitter+LinkedIn+Insta) on `social_media_post` or `govt_job_published` event

Both Cloud Functions AND GitHub Actions check automation guard — if you Pause All from Admin Panel, posting stops (0 cost).

---

## 🔑 Setup — Only 2 places, no code change

### 1️⃣ Local / Cloud Functions Env (`ai_backend/.env`)

Copy from `.env.example` and fill:

```bash
# Facebook (already exists)
FB_PAGE_ID=123456789
FB_PAGE_TOKEN=EAAJ... (long-lived page token)

# Twitter / X
TWITTER_API_KEY=xxxxx
TWITTER_API_SECRET=xxxxx
TWITTER_ACCESS_TOKEN=xxxxx-xxxxx
TWITTER_ACCESS_SECRET=xxxxx
TWITTER_BEARER_TOKEN=AAAA... (optional)

# LinkedIn
LINKEDIN_ACCESS_TOKEN=AQV8... (60 days valid)
LINKEDIN_ORGANIZATION_ID=urn:li:organization:123456789
# OR personal:
LINKEDIN_PERSON_ID=urn:li:person:abcd1234

# Instagram (via FB)
INSTAGRAM_ACCOUNT_ID=178414... (get via Graph API: /{page-id}?fields=instagram_business_account)

# YouTube (optional, for community)
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
YOUTUBE_CHANNEL_ID=UC...
```

**How to get each key — see `.env.example` comments** (links to developer portals).

### 2️⃣ GitHub Secrets (Repo Settings → Secrets and variables → Actions → New repository secret)

Add **same keys** there:

```
SERVICE_ACCOUNT_JSON
FIREBASE_SERVICE_ACCOUNT
GEMINI_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
FB_PAGE_ID
FB_PAGE_TOKEN
TWITTER_API_KEY
TWITTER_API_SECRET
TWITTER_ACCESS_TOKEN
TWITTER_ACCESS_SECRET
TWITTER_BEARER_TOKEN
LINKEDIN_ACCESS_TOKEN
LINKEDIN_ORGANIZATION_ID
LINKEDIN_PERSON_ID
INSTAGRAM_ACCOUNT_ID
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REFRESH_TOKEN
```

**That's it — no code change needed.** System auto-detects which creds are present and posts only to those platforms. Missing creds = skipped (no crash).

---

## 🧪 Test locally

```bash
cd ai_backend
npm install --legacy-peer-deps twitter-api-v2  # for Twitter (optional, fallback exists)

# Test Twitter
node -e "require('./social_media/twitter_poster').postJobToTwitter({title:'Test Job', organization:'SSC', id:'test123'}).then(console.log)"

# Test LinkedIn
node -e "require('./social_media/linkedin_poster').postJobToLinkedIn({title:'Test', organization:'SSC', id:'test'}).then(console.log)"

# Test All at once (orchestrator)
node social_media/social_orchestrator.js JOB test123
```

---

## 🔄 How auto-posting triggers

### Path 1 — Cloud Function (primary, instant)
```
Job published in Firestore (jobs/{jobId})
→ onJobPublishedNotify trigger (govt_jobs.js)
→ Telegram sent
→ postToAllPlatforms() called
   → Checks automation guard (Pause All?)
   → Posts to FB, Twitter, LinkedIn, Insta in parallel
   → Saves summary to job doc (socialPostedAt, socialSummary)
```

### Path 2 — GitHub Actions (backup / manual)
```
GitHub dispatch event: social_media_post (can be triggered from Cloud Function or manually)
→ auto_post_social_all.yml workflow
   → Checks automation guard
   → Runs social_orchestrator.js
   → Posts to all platforms
```

You can trigger manually: GitHub → Actions → Auto Post to All Social Media → Run workflow → Enter title + URL

---

## 🛑 Automation Control (Pause/Resume)

Admin Panel → **AUTOMATION** tab (red Power icon):

- **PAUSE ALL** → All social posting stops (0 API calls, 0 cost) — use when credits low / salary tak hold
- **Per-feature OFF** → Turn off only Twitter, or only LinkedIn, etc.
- **RESUME ALL** → One click, all back ON

Respects:
- `system_settings/automation` Firestore doc
- `isAutomationEnabled(db, 'fb_post')`, `twitter`, `linkedin`, etc.

---

## 📊 Monitoring

- Each job doc gets `socialPostedAt`, `socialSummary`, `socialSucceeded: ['Facebook', 'Twitter']`
- Telegram summary if enabled
- GitHub Actions logs show `✅ Facebook posted`, `✅ Twitter posted`, etc.

---

## 🔒 Security

- Keys never committed — only in `.env` (gitignored) and GitHub Secrets
- `.env.example` has placeholders only
- Cloud Functions secrets via `firebase functions:secrets:set`
- If token expires (LinkedIn 60 days, Twitter never, FB long-lived never), just regenerate and update in 2 places

---

## 🚧 Limitations & Next

- **Twitter:** Needs `twitter-api-v2` npm package for best results (`npm install twitter-api-v2` in ai_backend). Without it, fallback will instruct to install.
- **LinkedIn:** Token expires 60 days — need refresh flow (can build auto-refresh later)
- **Instagram:** Requires image URL — we use `og-image.jpg` or job image, text-only not supported via API
- **YouTube:** Community posts API limited — currently placeholder, video upload already works via `autoVideo.js`

Want YouTube Shorts auto-upload for jobs? That already exists via `autoVideo.js` → triggered in `govt_jobs.js` via `triggerGitHubVideoAction`.

---

## ✅ Checklist for you

- [ ] Add keys to `ai_backend/.env` (copy from `.env.example`)
- [ ] Add same keys to GitHub Secrets
- [ ] `cd ai_backend && npm install --legacy-peer-deps twitter-api-v2` (for Twitter)
- [ ] Deploy functions: `firebase deploy --only functions --project studymaterial-406ad`
- [ ] Test: Publish a test job or run workflow manually: Actions → Auto Post to All Social Media → Run
- [ ] Check Facebook Page, Twitter, LinkedIn — post should appear
- [ ] Use AUTOMATION tab to Pause/Resume when credits low

Done — system chal pdega, kuch aur code change nahi chahiye!

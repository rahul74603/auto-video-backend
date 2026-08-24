# 📋 StudyGyaan Workflow Guide

> Har workflow ka kaam, schedule, aur kaise manage karna hai.

---

## 🔴 CRITICAL — Ye CHAL RAHE HAIN (Touch Mat Karna)

### 1. 🎬 Video Dispatcher (Firestore Poller)
- **File:** `video_dispatcher.yml`
- **Kya karta hai:** JOB / FAST_TRACK / MOCK_TEST → Video generate → YouTube upload
- **Schedule:** Every 5 min + **INSTANT** jab publish karo (repository_dispatch)
- **Kaise trigger:** Auto (jab content publish ho) ya manual se GitHub Actions UI
- **Secrets needed:** SERVICE_ACCOUNT_JSON, GMAIL_CREDENTIALS, YOUTUBE_TOKEN
- **Note:** Ab jab bhi job/fast_track publish karo, video TURANT banegi (pehle 10-45 min lagta tha)

### 2. 🤖 AI Note Processor
- **File:** `note_processor.yml`
- **Kya karta hai:** PDF notes → process → upload to Firestore
- **Schedule:** Every hour
- **Secrets needed:** SERVICE_ACCOUNT_JSON, GEMINI_API_KEY

### 3. 💰 Automatic Payment Checker
- **File:** `payment_checker.yml`
- **Kya karta hai:** Pending payments check → approve/reject
- **Schedule:** Every hour
- **Secrets needed:** SERVICE_ACCOUNT_JSON, PAYMENT_GMAIL_TOKEN

### 4. 📝 StudyGyaan Auto Blogger
- **File:** `auto_blog.yml`
- **Kya karta hai:** AI-generated blog posts → review → publish
- **Schedule:** 3 times daily (5:30 AM, 11:00 AM, 4:30 PM IST)
- **Secrets needed:** SERVICE_ACCOUNT_JSON, GEMINI_API_KEY

### 5. 🧪 Auto Mock Test Generator
- **File:** `auto-mocktest-generator.yml`
- **Kya karta hai:** Mock test questions generate → Firestore
- **Schedule:** Every 2 hours
- **Secrets needed:** SERVICE_ACCOUNT_JSON, GEMINI_API_KEY

### 6.  Auto Mock Test Video Maker
- **File:** `mock_test_maker.yml`
- **Kya karta hai:** Mock test → Video generate → YouTube
- **Schedule:** 2 times daily (9 AM, 7 PM IST)
- **Secrets needed:** SERVICE_ACCOUNT_JSON, GMAIL_CREDENTIALS, YOUTUBE_TOKEN, TTS_KEY_JSON

### 7. 📰 Govt Jobs Scraper
- **File:** `govt_jobs_scraper.yml`
- **Kya karta hai:** 7 RSS sources → scrape jobs → quality check → Firestore
- **Schedule:** Every 3 hours
- **Secrets needed:** SERVICE_ACCOUNT_JSON, GEMINI_API_KEY, GH_TOKEN
- **Note:** Ye scraper video_dispatcher ko INSTANT trigger karta hai jab job publish ho

### 8.  Daily SEO - Sitemaps + IndexNow
- **File:** seo_static `workflow-seo-daily.yml.txt` (deploy via seo_static/generate.cjs)
- **Kya karta hai:** Sitemap generate → IndexNow ping → meta.php update
- **Schedule:** Daily at 12:30 AM IST
- **Secrets needed:** FTP credentials

### 9. 🤖 AI Article Drafts (Job + Fast Track)
- **File:** seo_static `workflow-ai-drafts.yml.txt`
- **Kya karta hai:** Job/Fast Track → AI article draft → admin review → publish
- **Schedule:** 3 times daily
- **Secrets needed:** SERVICE_ACCOUNT_JSON, GEMINI_API_KEY

### 10. 📄 PDF Generator
- **File:** `autpdf.yml`
- **Kya karta hai:** Content → PDF generate → cPanel upload
- **Schedule:** Daily
- **Secrets needed:** SERVICE_ACCOUNT_JSON, FTP credentials

### 11. 🌐 Auto Web Stories
- **File:** `web_stories.yml`
- **Kya karta hai:** Blog/Mock test → Web Story generate → publish
- **Schedule:** 3 times daily (10 AM, 12 PM, 9 PM IST)
- **Secrets needed:** SERVICE_ACCOUNT_JSON

---

##  OPTIONAL — Ye DISABLED Hain (Re-enable kar sakte ho)

| Workflow | File | Kya karta tha | Kyun disable |
|----------|------|---------------|-------------|
| Video Maker (Legacy) | `video_maker.yml` | Old video pipeline | Replaced by video_dispatcher |
| Branch Test | `video_dispatcher_branch_test.yml` | Testing only | Not needed in production |
| LinkedIn Poster | `auto_post_linkedin.yml` | LinkedIn auto-post | Never used |
| Twitter Poster | `auto_post_twitter.yml` | Twitter auto-post | Never used |
| Social All | `auto_post_social_all.yml` | Multi-platform post | Never used |
| Facebook Poster | `fb_post.yml` | Facebook auto-post | Never used |
| Telegram Alert | `telegram_alert.yml` | Telegram notifications | Never used |
| Fast Track Scraper | `fast_track.yml` | Separate fast track | Duplicate of video_dispatcher |
| Long Video Maker | `long_video_maker.yml` | Long-form videos | Never used |

### Re-enable karna hai to:
1. GitHub → Actions → Workflow pe click karo
2. `⋯` → **Enable workflow**

---

## 🔵 MAINTENANCE — Ye bhi hain

### CI (Continuous Integration)
- **File:** `ci.yml`
- **Kya karta hai:** Push pe lint + build + test run karta hai
- **Schedule:** Every push to main
- **Note:** Red dikhe to code me error hai — fix karo

### CodeQL (Security Scan)
- **File:** `codeql.yml`
- **Kya karta hai:** Security vulnerabilities scan
- **Schedule:** Every push + weekly
- **Note:** Slow hai (2 min) but important for security

### Deploy Firebase Functions
- **File:** `deploy.yml`
- **Kya karta hai:** Firebase Functions deploy
- **Trigger:** Manual only
- **Note:** Firebase use nahi karte ab — safe to ignore

---

## ⚡ INSTANT VIDEO — Kaise Kaam Karta Hai Ab

### Pehle (Problem):
```
Job Publish → Firestore
→ 10-45 min wait (cron lag)
→ Video Dispatcher picks up
→ Video renders
→ YouTube upload
```

### Ab (Solution):
```
Job Publish → Firestore + GitHub API trigger (SIMULTANEOUS)
→ Video Dispatcher INSTANTLY starts (30 sec me)
→ Video renders
→ YouTube upload
```

**Fallback:** Agar instant trigger fail ho jaye, 5-min cron safety net hai.

---

## 🛠️ Common Operations

### Video manually trigger karna:
1. GitHub → Actions → Video Dispatcher
2. "Run workflow" → kind=job ya fast_track → Run

### Automation pause karna:
- Firestore → `system_settings/automation` → `globalEnabled: false`
- Ya koi specific feature off karo

### Workflow disable/enable:
- GitHub → Actions → Workflow → `⋯` → Disable/Enable

### Video limit badhana:
- GitHub → Settings → Actions → Variables → `VIDEO_DISPATCH_LIMIT` change karo
- Default: 1 video per run, max: 5/day (YouTube quota)

---

## 📊 Workflow Summary

| Type | Count | Status |
|------|-------|--------|
| Active (chal rahe) | 11 | ✅ |
| Disabled | 9 | ️ |
| Maintenance | 3 | 🔧 |
| **Total** | **23** | |

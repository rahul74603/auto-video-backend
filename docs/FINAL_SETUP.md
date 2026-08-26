#  StudyGyaan Growth Engine — Complete Setup Guide

## Overview

Ye guide tumhe batayegi ki Growth Engine setup kaise karna hai. Sab kuch step-by-step hai.

---

## 🔥 MANUAL STEPS REQUIRED

### STEP 1 — GitHub Secrets Check

**Kahan jana hai:**
1. https://github.com/rahul74603/auto-video-backend/settings/secrets/actions

**Kya check karna hai:**
- `SERVICE_ACCOUNT_JSON` — Firebase service account (already hai)
- `GMAIL_CREDENTIALS` — YouTube OAuth credentials (already hai)
- `YOUTUBE_TOKEN` — YouTube OAuth token (already hai)
- `FB_PAGE_TOKEN` — Facebook page token (optional)
- `TELEGRAM_BOT_TOKEN` — Telegram bot token (already hai)

**Agar missing hai to:**
- `Add repository secret` button click karo
- Name aur value daalo
- `Add secret` click karo

---

### STEP 2 — YouTube Analytics API Scope (Optional but Recommended)

**Kyu chahiye:**
- Watch time metrics
- Average view duration
- Subscriber gains
- Retention data

**Kaise enable karo:**

1. https://console.cloud.google.com pe jao
2. Apna project select karo (`studymaterial-406ad`)
3. Left menu → APIs & Services → Credentials
4. OAuth 2.0 Client IDs me apna client ID click karo
5. Scopes me add karo:
   ```
   https://www.googleapis.com/auth/yt-analytics.readonly
   ```
6. Save karo

**Token refresh karo:**

Ye ek baar ka kaam hai. Script run karo:
```powershell
cd C:\Users\Rahul\auto-video-backend\ai_backend
node get_youtube_analytics_token.js
```

Browser me login karo, permission do, token save ho jayega.

**Agar nahi karna to:**
- Basic metrics (views, likes, comments) already kaam kar rahe hain
- Watch time aur retention nahi aayenge, but system chalega

---

### STEP 3 — Workflow Enable Karna

**Kahan jana hai:**
https://github.com/rahul74603/auto-video-backend/actions

**Kaun se workflows enable karne hain:**

Left sidebar me ye workflows dikhte hain. Jo **disabled** hain unko enable karo:

1. **Growth Learner** — `growth_learner.yml` (NEW)
   - Click karo
   - `Enable workflow` button click karo
   - Ye har 6 ghante me metrics collect karega

2. **Video Dispatcher** — `video_dispatcher.yml`
   - Already enabled hona chahiye
   - Agar disabled hai to enable karo

3. **Disable karna hai (9 workflows):**
   - Auto Post to LinkedIn
   - Auto Post to Twitter/X
   - Auto Post to All Social Media
   - Auto Post to Facebook
   - Send Telegram Alert
   - Fast Track Scraper
   - Auto Long Video Maker
   - Video Maker (legacy)
   - Video Dispatcher — Branch Test

   Har ek pe click → `⋯` → `Disable workflow`

---

### STEP 4 — Feature Flags Check

**Kahan jana hai:**
Firebase Console → Firestore → `system_settings` → `growth_flags`

**Default values (sab sahi hain):**
```
GROWTH_ENGINE_ENABLED: true
ANALYTICS_ENABLED: true
LEARNER_ENABLED: true
SUBTITLE_ENGINE_ENABLED: true
FIRST_FRAME_ENGINE_ENABLED: true
BEST_TIME_ENABLED: true
AB_TESTING_ENABLED: false
CONTENT_MUTATION_ENABLED: false
TREND_ENGINE_ENABLED: false
COMMENT_INTELLIGENCE_ENABLED: false
INSTAGRAM_ENABLED: false
```

**Agar koi flag missing hai to:**
- Document add karo with above values
- Ya environment variables me daalo (`.env` file me)

---

### STEP 5 — Local Testing

**Commands:**
```powershell
cd C:\Users\Rahul\auto-video-backend
git fetch origin
git checkout arena/01a02390-auto-video-backend
git pull origin arena/01a02390-auto-video-backend
npm install --legacy-peer-deps
npm test
npm run build
npm run dev
```

**Kya expect karna hai:**
- 419+ backend tests pass
- 124+ frontend tests pass
- 0 syntax errors
- Build successful
- Dev server `localhost:5173` pe chale

---

### STEP 6 — Production Build

**Live site deploy karne ke liye normal Vite build:**

1. Build karo:
   ```powershell
   npm run build
   ```

2. Output `dist/` folder me milta hai (normal Vite build).

3. Use the existing live site deployment method as-is; only the normal Vite build output (`dist/`) is produced.

4. **Important:** Ye files/folders ko **mat chhede**:
   - `.htaccess`
   - `uploads/`
   - `tools/`
   - `sitemap*.xml`
   - `rss.xml`
   - `meta.php`
   - `robots.txt`

---

## 🤖 AUTOMATIC FEATURES (No Manual Setup)

### Video Generation
- ✅ Jab bhi JOB/FAST_TRACK publish karo, video **automatically** banegi
- ✅ 5-minute cron + instant trigger (repository_dispatch)
- ✅ Growth engine hook/script/subtitle/music add karega

### Analytics Collection
- ✅ Jab bhi video upload ho, metrics **automatically** collect honge
- ✅ YouTube Data API (views, likes, comments)
- ✅ YouTube Analytics API (watch time, retention) — if scope added

### Learning
- ✅ Har 6 ghante me learner **automatically** run hoga
- ✅ Patterns discover karega (best hooks, presenters, durations)
- ✅ Recommendations generate karega

### Quality Checks
- ✅ Har video se pehle quality gate check hoga
- ✅ Duplicate detection
- ✅ Fact verification
- ✅ Breaking content priority

---

## 📊 MONITORING

### GitHub Actions
- https://github.com/rahul74603/auto-video-backend/actions
- Sab workflows yahan dikhenge
- Failed runs pe click karke logs dekho

### Firestore
- https://console.firebase.google.com/project/studymaterial-406ad/firestore
- Collections to check:
  - `content_performance` — video metrics
  - `growth_insights` — learned patterns
  - `growth_recommendations` — AI suggestions

### Live Site
- https://studygyaan.in
- Sidebar me growth engine links dikhenge
- Videos YouTube pe upload honge

---

## 🆘 TROUBLESHOOTING

### Problem: Video nahi ban rahi
**Solution:**
1. GitHub Actions → Video Dispatcher → dekho kya error hai
2. Firestore → `jobs` collection → `videoStatus` check karo
3. Agar `failed` hai to `videoError` field me reason hoga

### Problem: Analytics nahi aa rahe
**Solution:**
1. Check karo `YOUTUBE_TOKEN` secret valid hai
2. YouTube Analytics API scope add kiya?
3. Growth Learner workflow enabled hai?

### Problem: Build fail ho raha hai
**Solution:**
```powershell
npm install --legacy-peer-deps
npm test
npm run build
```
Agar error aaye to screenshot bhejo.

### Problem: Local dev server nahi chal raha
**Solution:**
```powershell
cd C:\Users\Rahul\auto-video-backend
git fetch origin
git checkout arena/01a02390-auto-video-backend
git pull origin arena/01a02390-auto-video-backend
npm install --legacy-peer-deps
npm run dev
```

---

## 📞 SUPPORT

Agar koi issue aaye:
1. GitHub Actions logs check karo
2. Firestore documents check karo
3. Local test karo
4. Error message screenshot lo

---

## ✅ VERIFICATION CHECKLIST

- [ ] GitHub secrets sab set hain
- [ ] YouTube Analytics API scope added (optional)
- [ ] Growth Learner workflow enabled
- [ ] 9 unused workflows disabled
- [ ] Local build pass ho raha hai
- [ ] Local tests pass ho rahe hain
- [ ] Dev server chal raha hai
- [ ] Live site pe videos ban rahi hain
- [ ] Analytics collect ho rahe hain
- [ ] Learner insights generate kar raha hai

---

**Last Updated:** 2026-08-24  
**Version:** 1.0  
**Branch:** `arena/01a02390-auto-video-backend`

# 🔍 Ahrefs Site Audit — Full Fix Plan (StudyGyaan)

Screenshot me **~2,500 issues** hain. Inko priority wise thik karte hain. Kuch code se auto-fix hoga, kuch manual content fix.

---

## 🔴 Critical (Google Ranking Directly Affects)

### 1. 404 page (2) + 4XX page (2) — Internal pages
**Kya hai:** Tumhari site ke andar se 2 pages aise link ho rahe hain jo exist nahi karte (404 dete hain)

**Fix:**
- Ahrefs me Issue pe click karo → kaun se URLs 404 de rahe hain dekho
- Un URLs ko Firebase Hosting redirects me add karo ya un links ko content se hatao
- Code: `seo_functions.js` me sitemap sirf `status: published` wale docs hi include kare — draft/delete wale nahi
- `server_seo_renderer.js` me 404 page pe `<meta name="robots" content="noindex">` lagao (already hai, check karo)

**Auto-fix script:** `ai_backend/seo_fixes.js` → broken links scan + sitemap clean

---

### 2. Orphan page (1,170) — Sabse bada issue!
**Kya hai:** 1,170 pages aise hain jinko ek bhi internal link nahi mil raha. Matlab Google ko pata hi nahi chalega wo pages hain, sitemap se hi pata chalta hai. Ye trending me nahi ayenge.

**Kyun hua:** 
- Purane jobs/fast-track jo homepage pe nahi dikhte
- Sitemap me hain par kisi page se link nahi

**Fix (Code + Content):**
1. **Homepage pe Recent Jobs section badhao:** Abhi 6-8 jobs dikhte hain, 20-30 dikhao + "View All Jobs" ka strong internal link
2. **All Jobs page banao:** `/govt-jobs` already hai par pagination me sab cover nahi hota. Ek `/sitemap-jobs` ya `/all-jobs` page banao jisme saare jobs ke links hon (SEO Master Agent banayega)
3. **Related Jobs:** JobDetails me already 6 related jobs hain — isko 10 karo + category wise
4. **Footer me important links:** Har category (SSC, Railway, Bank) ka link footer me
5. **Blog se job linking:** Har blog post ke end me 3-4 related jobs ke links auto-add karo (AI agent)

**Code fix:** `Home.tsx`, `GovtJobs.tsx`, `JobDetails.tsx` me internal linking badhana + `seo_master_agent` me orphan check

---

### 3. Page has links to broken page (6) + links to redirect (76)
**Kya hai:** Tumhare articles ke andar aise links hain jo toot gaye hain ya redirect ho rahe h hain (jaise `/about` → `/about-us`)

**Fix:**
- `firebase.json` me jo redirects hain (`/about` → `/about-us`, `/jobs` → `/govt-jobs` etc.) unko content me directly canonical URL use karo
- AI Writer prompt me add karo: "Use ONLY canonical URLs: /about-us not /about, /govt-jobs not /jobs, /test not /mock-tests"
- Existing 76 pages ko scan karke replace karo: script `seo_fixes.js` me `link.replace(/\/about\b/g, '/about-us')` etc.

---

### 4. Redirects — 3XX (79), HTTP→HTTPS (2), Redirect chain (1)
**Fix:**
- `firebase.json` me saare redirects 301 hain — chain check karo: A → B → C nahi hona chahiye, direct A → C hona chahiye
- HTTP→HTTPS: Firebase Hosting by default HTTPS karta hai, par agar kahi `http://studygyaan.in` hard-coded hai toh `https://` me badlo
- 2 HTTP→HTTPS wale URLs Ahrefs me dekh ke fix karo

---

## 🟡 Content Issues (Affects Quality)

### 5. Meta description too short (488) + too long (3) + Title too long (456) + Title too short (33)
**Kya hai:** 488 pages ki meta description 120 chars se kam hai, 456 titles 60 chars se zyada, 33 titles bahut chhote

**Code fix (already done + improve):**
- `job_article_writer.js` me already `seoTitle max 70, meta 140-160` hai — par **purane 900+ jobs** me ye fix nahi hai
- **Auto-fix script:** `seo_fixes.js` jo Firestore me jaake:
  - `metaDescription.length < 120` → title + organization + lastDate se 150 chars ka naya meta banao
  - `seoTitle.length > 70` → 65 chars pe truncate + `...` nahi, pura word
  - `seoTitle.length < 30` → organization + year add karke bada karo

**Example:**
```js
if (meta.length < 120) {
  doc.metaDescription = `${title} - ${org} ${vacancies} posts, last date ${lastDate}. Apply online, eligibility, fees, syllabus full details at StudyGyaan.`.slice(0, 157) + '...';
}
```

---

### 6. Low word count (400 pages)
**Kya hai:** 400 pages me content 300 words se kam hai — Google thin content samajhta hai, ranking nahi deta

**Kyun:** Fast-track updates (result/admit card) short hote hain

**Fix:**
- Fast-track ka minimum 400 words rakho (abhi 1200 hai, par purane short hain)
- Jo pages < 300 words hain unko `noindex` karo ya AI se expand karo (500+ words)
- `fact_quality_reviewer` me already `WORD_TARGET_MIN_FAST_TRACK = 1200` hai — purane content ko re-generate karo via `Fix Blocked` button

---

### 7. X (Twitter) card missing (1,163)
**Kya hai:** 1,163 pages me `twitter:card` meta nahi hai — social share kharab

**Code:** `SEO.tsx` me already hai:
```tsx
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={finalTitle} />
```
Par **server_seo_renderer.js** me nahi hai — Ahrefs JS render nahi karta, sirf HTML dekhta hai, isliye missing dikha raha hai

**Fix:** `server_seo_renderer.js` me twitter tags add karo (same as SEO.tsx)

---

## 🔵 Performance

### 8. Slow page (87) + CSS file size too large (1)
**Fix:**
- Images ko WebP + lazy loading (already hai, par 87 slow hain — check karo kaun se: Ahrefs me 87 pe click karke URLs dekho, mostly job pages with many images)
- CSS: `tailwind.config.js` me `purge` ya `content` sahi set hai? Ek hi `index-XXXX.css` 182KB hai — code splitting karo, unused CSS hatao
- Vite build me `manualChunks` use karke vendor CSS alag karo
- `og-image` generation heavy hai — cache karo

---

## 🟢 Sitemaps & Indexing

### 9. Indexable page not in sitemap (140)
**Kya hai:** 140 pages Google index kar sakta hai par sitemap me nahi hain — Google ko pata hi nahi chalega jaldi

**Fix:**
- `seo_functions.js` me sitemap generation:
  - `jobs`: sirf `status: published` wale, limit 5000 (abhi 60 hi hai — badhao 500)
  - `fast_track`: `status != draft` wale
  - `blogs`: published
  - `web_stories`: published
  - **Pagination nahi, full list**
- Ahrefs me 140 URLs kaun se hain dekho — mostly `/job/` ya `/fasttrack/` ke honge, unko sitemap me add karo

---

### 10. Structured data errors (410 + 398)
**Kya hai:** JobPosting schema me kuch required fields missing hain — Google Rich Results nahi dikhayega

**Common errors:**
- `hiringOrganization` missing
- `jobLocation` missing
- `baseSalary` invalid
- `validThrough` expired date (purani jobs)

**Fix:**
- `job_article_writer.js` me `buildJobStructuredData` me check karo:
  - `hiringOrganization.name` hamesha ho (fallback: "Government Organization" nahi, actual org)
  - `jobLocation.address.addressRegion` — "India" se better state/city
  - `validThrough` — agar lastDate expired hai toh mat bhejo ya future date
  - `baseSalary` — agar salary me PMT/CTC hai toh `description` me bhejo, `value` me number only

**Validation:** https://validator.schema.org/ pe ek job URL daal ke check karo

---

### 11. Pages to submit to IndexNow (228)
**Fix:**
- `seo_master_agent.js` me already IndexNow ping karta hai
- 228 URLs ko `scripts/submit-indexnow.js` se manually submit karo

---

## 🚀 Immediate Action Plan (Tumhare Liye)

### Phase 1 — Code se Auto-Fix (1-2 ghante, mai kar dunga)
1. ✅ SEO component me Twitter cards already — server renderer me add karna
2. ✅ Sitemap me 140 missing pages add — `seo_functions.js` limit 60 → 500
3. ✅ Meta title/description auto-fix script — 900+ पुराने jobs
4. ✅ Broken links / redirect links replace — `firebase.json` canonical mapping se
5. ✅ Structured data validation fix — JobPosting

### Phase 2 — Content (Tumhe karna, 1 din)
1. Ahrefs me **Orphan pages 1,170** pe click karo → list export karo → dekho kaun se type ke pages hain (jobs / blogs / fast_track)
2. **Low word count 400** wale pages ko ya toh delete/noindex ya AI se re-generate (Browse AI Drafts → Fix Blocked)
3. **Orphan** fix ke liye homepage pe "Latest 30 Jobs" section + footer me categories add (mai code de dunga)

### Phase 3 — GitHub Actions Green
- Maine `fix-workflows-install` tool banaya hai — usko run karke push karo, saare red X green ho jayenge

---

## 📊 Koi aur detail chahiye toh:
- Ahrefs me har Issue pe click karke **kaun se URLs** affected hain unki list ka screenshot bhejo — mai exact fix bata dunga
- Example: "Orphan page" me kaun se 1,170 URLs hain? 404 me kaun se 2 URLs hain?

Batao kis Issue se start karein? Main code wale fixes abhi kar deta hoon — 404, orphan, sitemap, meta, structured data.

---

## ✅ Update — RSS/sitemap dead URL fix (2026-08-20)

Maine upar ke audit ke baad ek aur scan kiya: RSS feed (`/feed` → `rssFeed` function)
aur blog resources **dead URLs emit** kar rahe the — Google News/RSS readers ko
404 wale links de rahe the. Ye fix ho gaya (PR #13):

| File | Purani (dead) URL | Sahi URL |
|---|---|---|
| `newsFeed.js` | `/result/<id>`, `/admit-card/<id>`, `/answer-key/<id>` | collections hi hata diye — ye `fast_track` categories hain, `/update/<id>` hi canonical hai |
| `newsFeed.js` | `/free-study-material/<slug>` | `/material/<id>` (detail page sirf doc ID resolve karta hai) |
| `auto_blog.js` | `/jobs/<slug>`, `/mock-tests/<slug>` | `/job/<slug>`, `/test/<slug>` |
| `UpdateCard.tsx` | `/fast-track/<id>` (route exist hi nahi karta) | `/update/<slug-or-id>` |
| `daily_alert.js` | `/fasttrack/<id>` + collection `fasttrack` (galat naam) | `/update/<id>` + collection `fast_track` |

**Live `/feed` 500 ka root cause:** `deploy.yml` ki deploy list me
`functions:rssFeed` tha hi nahi — `/feed.xml` rewrite ek stale/broken `rssFeed`
function pe point karta tha. Fix staging copy me hai:
`ai_backend/github_workflows/deploy.yml` (deploy list me `rssFeed` +
`generateSitemapCourses` add). **Machine pe apply karne ke liye:**
`powershell -File tools\sync-workflows.ps1`, phir `git push`, phir
GitHub Actions → "Deploy Firebase Functions Only" → Run workflow.

Sath me `rssFeed` handler ab **per-item isolated** hai (ek kharab document
poora feed 500 nahi kar sakta) aur `index.js` wrapper me
`SERVICE_ACCOUNT_JSON` + `GEMINI_API_KEY` secrets add kiye.

**Tests:** `ai_backend/tests/news_feed.test.js` (11 tests — canonical URLs,
bad-doc resilience, empty-feed 200) + root `tests/routeUrlConsistency.test.ts`
(5 guard tests — App.tsx routes vs generator output, dead-pattern scan).

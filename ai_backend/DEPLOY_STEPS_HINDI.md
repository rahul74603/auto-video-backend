# 🚀 VS Code Deployment Guide — StudyGyaan Video Automation

Sab kuch VS Code ke **Terminal** se ho jayega.
Terminal kholne ke liye: **Ctrl + `** (backtick) ya menu → Terminal → New Terminal.

---

## STEP 1 — Code local PC par laao

Agar repo pehle se aapke PC par hai:

```bash
cd path/to/auto-video-backend
git fetch origin
git checkout arena/01a01b18-auto-video-backend
git pull origin arena/01a01b18-auto-video-backend
```

Agar repo aapke PC par **nahi** hai (fresh clone):

```bash
git clone https://github.com/rahul74603/auto-video-backend.git
cd auto-video-backend
git checkout arena/01a01b18-auto-video-backend
```

### Check karo ki sab files aa gayi

```bash
ls ai_backend/video_state.js ai_backend/video_dispatcher.js
ls ai_backend/github_workflows/
```

Ye dikhna chahiye:

```
ai_backend/video_state.js
ai_backend/video_dispatcher.js

README.md  fast_track.yml  install.sh
mock_test_maker.yml  video_dispatcher.yml  video_maker.yml
```

---

## STEP 2 — Workflow files install karo (ek command)

Ye kaam bot nahi kar saka (GitHub App ke paas `workflows` permission nahi thi),
isliye aapko apne account se karna hai. Repo root se chalao:

```bash
bash ai_backend/github_workflows/install.sh
```

Output aisa aayega:

```
📋 Installing video workflow files...
   ✅ .github/workflows/video_dispatcher.yml
   ✅ .github/workflows/video_maker.yml
   ✅ .github/workflows/mock_test_maker.yml
   ✅ .github/workflows/fast_track.yml
🔍 Verifying...
   ✅ dispatcher schedule disabled (manual-only) — safe to install
```

**Windows PowerShell** me `bash` na chale to:

```powershell
Copy-Item ai_backend\github_workflows\video_dispatcher.yml .github\workflows\
Copy-Item ai_backend\github_workflows\video_maker.yml      .github\workflows\
Copy-Item ai_backend\github_workflows\mock_test_maker.yml  .github\workflows\
Copy-Item ai_backend\github_workflows\fast_track.yml       .github\workflows\
git add .github/workflows
```

> Tip: VS Code me **Git Bash** default terminal bana lo, phir saare `bash` commands chalenge.

---

## STEP 3 — Commit + push

```bash
git commit -m "Install billing-independent video dispatcher workflows"
git push origin arena/01a01b18-auto-video-backend
```

Aapke account ke paas permission hai, isliye ye push **chal jayega**.

---

## STEP 4 — GitHub Secrets check karo

GitHub → repo → **Settings → Secrets and variables → Actions**

**Zaroori (inke bina video nahi banega):**

| Secret | Kaam |
|---|---|
| `SERVICE_ACCOUNT_JSON` | Firestore padhna/likhna |
| `GMAIL_CREDENTIALS` | YouTube OAuth client |
| `YOUTUBE_TOKEN` | JOB + FAST TRACK upload |
| `YOUTUBE_TOKEN_SELF_TEST` | MOCK TEST upload |
| `TTS_KEY_JSON` | Hindi awaaz (TTS) |

**Optional (na ho to video phir bhi banega, bas wo step skip hoga):**
`FB_PAGE_ID`, `FB_PAGE_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`TELEGRAM_CHANNEL_LINK`, `TELEGRAM_CHANNEL_NAME`, `GEMINI_API_KEY`

**Naya (sirf agar purana FastTrack Cloud Function fallback chahiye):**
`FAST_TRACK_TRIGGER_TOKEN` — pehle ye token file me likha tha, ab secret me hai.

---

## STEP 5 — Pehla test (DRY RUN — kuch upload nahi hoga)

GitHub → **Actions** → left side me **🎬 Video Dispatcher (Firestore Poller)**
→ **Run workflow** button → defaults waise hi rehne do → **Run workflow**

Default already safe hain:

| Input | Default |
|---|---|
| `kind` | `all` |
| `limit` | `1` |
| `dry_run` | `true` ← kuch banega nahi |
| `privacy` | `unlisted` |

Log me aisa dikhega:

```
🧪 [dry-run] would process JOB <id> — <title>
🧪 [dry-run] would process FAST_TRACK <id> — <title>
🧪 [dry-run] would process MOCK_TEST <id> — <title>
```

Iska matlab: dispatcher Firestore padh pa raha hai aur sahi documents dhoond raha hai.
**Abhi tak koi video nahi bana.**

---

## STEP 6 — Teeno pipeline alag-alag test karo (unlisted)

Har baar **Run workflow**, aur ye set karo: `dry_run = false`, `privacy = unlisted`, `limit = 1`

### 6a. JOB
```
kind = job
```

### 6b. FAST TRACK
```
kind = fast_track
```

### 6c. MOCK TEST
```
kind = mock_test
```

Kisi ek particular document par test karna ho to `doc` field me uski Firestore
document ID daal do.

### Har test ke baad check karo

**Firestore me** (`jobs` / `fast_track` / `mock_tests` ka document):

```
videoStatus      = completed
videoYouTubeUrl  = https://youtu.be/xxxx
videoCompletedAt = <time>
```

**YouTube Studio me:** video **Unlisted** dikhna chahiye (public nahi).

Agar fail hua to document me reason milega:

```
videoStatus = failed        (ya upload_failed)
videoError  = <chhota saaf message>
```

---

## STEP 7 — LIVE karo (sirf jab teeno test pass ho jaayen)

Do kaam:

**1. Schedule chaalu karo** — `.github/workflows/video_dispatcher.yml` kholo,
line ~29-30 par ye do line se `#` hatao:

```yaml
  # schedule:
  #   - cron: '*/15 * * * *'
```

banao:

```yaml
  schedule:
    - cron: '*/15 * * * *'
```

**2. Privacy public karo** — usi file me:

```yaml
      privacy:
        default: 'unlisted'     # <-- isko 'public' kar do
```

Phir:

```bash
git add .github/workflows/video_dispatcher.yml
git commit -m "Enable video dispatcher schedule and public uploads"
git push origin arena/01a01b18-auto-video-backend
```

Ab har 15 minute me automatically check hoga aur naya published content
mila to video ban jayega — **bina Firebase billing ke**.

---

## Rozmarra ke useful commands

```bash
# Local par dekho kya pending hai (kuch banega nahi)
cd ai_backend
npm ci
node video_dispatcher.js --dry-run --kind=all

# Tests chalao
node --test tests/video_pipeline.test.js tests/video_dispatcher_integration.test.js
```

---

## Kuch fail ho jaye to

**Ek failed document dobara try karana hai?**
Firestore me us document se ye fields hata do / badal do:

```
videoStatus   -> delete
videoAttempts -> 0
videoError    -> delete
```

3 baar fail hone ke baad system khud retry band kar deta hai (taaki
Actions minutes waste na hon).

**Sab kuch band karna hai (emergency)?**
Firestore → `system_settings/automation` → `emergencyPause: true`

**Sirf video band karna hai?**
Usi doc me → `features.video_maker: false` (JOB + FAST TRACK)
aur `features.mock_test: false` (Mock Test)

---

## Yaad rakhne layak

- Firebase **Spark plan** par pura system chalega — billing enable karne ki zaroorat nahi.
- Sirf **Firestore** use hota hai, koi Cloud Function nahi.
- Ek run me **sirf 1 video** banta hai (Actions minutes bachane ke liye).
- Purana `repository_dispatch` path bhi chalu hai — duplicate video nahi banega,
  kyunki dono raste render se pehle document ko "claim" karte hain.
- GitHub Actions ke minutes **unlimited nahi** hain (private repo par monthly quota hota hai).

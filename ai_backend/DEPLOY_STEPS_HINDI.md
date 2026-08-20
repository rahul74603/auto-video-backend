# 🚀 VS Code Deployment Guide — StudyGyaan Video Automation

Sab kuch VS Code ke **Terminal** se ho jayega.
Terminal kholne ke liye: **Ctrl + `** (backtick) ya menu → Terminal → New Terminal.

---

## ⚠️ Pehle ye padho — Git refs kharab hain?

Agar in me se koi bhi error dikhe:

```
fatal: bad object refs/remotes/origin/arena/<id>
error: cannot lock ref ...: reference broken
error: ... cannot lock ref '...-auto-video-backend?': Invalid argument
```

### 🚨 Ek zaroori chetavani

**PowerShell me `Set-Content` se `.git\packed-refs` mat likhna.**
`Set-Content` Windows-style CRLF (`\r\n`) line endings likhta hai, lekin Git ko
LF (`\n`) chahiye. Uske baad har ref ke naam ke aakhir me ek chhupa hua `\r`
jud jata hai, jo terminal me `?` bankar dikhta hai:

```
cannot lock ref 'refs/remotes/origin/arena/019f7868-auto-video-backend?'
Unable to create '...019f7868-auto-video-backend?.lock': Invalid argument
```

Windows filename me `?` allowed nahi hai, isliye Git `.lock` file bana hi nahi
pata aur har fetch/prune fail ho jata hai.

**Agar ye galti ho chuki hai**, packed-refs ko LF me wapas likho:

```powershell
$p = ".git\packed-refs"
$t = [IO.File]::ReadAllText($p) -replace "`r`n", "`n" -replace "`r", "`n"
[IO.File]::WriteAllText($p, $t)
git remote prune origin
git fetch origin --prune
```

> `[IO.File]::WriteAllText` LF preserve karta hai — `Set-Content` nahi karta.

---

### ✅ Sabse aasan aur pakka hal — fresh clone

Refs zyada uljh jaayen to unhe sudharne me time lagta hai. Naya clone 1 minute
me ho jata hai aur guaranteed kaam karta hai:

```powershell
cd $HOME
git clone https://github.com/rahul74603/auto-video-backend.git auto-video-backend-new
cd auto-video-backend-new
git checkout arena/01a01b18-auto-video-backend

# purane folder se apni secret files copy karo (ye git me nahi hoti)
copy ..\auto-video-backend\ai_backend\.env                  ai_backend\.env
copy ..\auto-video-backend\ai_backend\credentials.json      ai_backend\credentials.json
copy ..\auto-video-backend\ai_backend\service_account.json  ai_backend\service_account.json
```

Phir VS Code me naya folder kholo: `code $HOME\auto-video-backend-new`

**Purana folder delete mat karo** — backup ke liye rehne do.

Ye sab automatically karne ke liye ek script bhi hai (naye clone ke andar
milegi, ya purane folder me pull hone ke baad):

```powershell
powershell -ExecutionPolicy Bypass -File ai_backend\github_workflows\fresh-setup.ps1
```

> Aapki `.env`, `credentials.json`, `service_account.json` gitignored hain —
> clone me apne aap nahi aatin, isliye upar wale copy commands zaroori hain.

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
isliye aapko apne account se karna hai.

### 🪟 Windows PowerShell (aap yahi use kar rahe ho)

```powershell
powershell -ExecutionPolicy Bypass -File ai_backend\github_workflows\install.ps1
```

> `bash: command not recognized` aaye to yahi PowerShell wali script use karo —
> Windows par Git ke saath `bash` hamesha install nahi hota.

### 🐧 Git Bash / Linux / Mac

```bash
bash ai_backend/github_workflows/install.sh
```

Dono ka output same hoga:

```
Installing video workflow files...
  OK  .github\workflows\video_dispatcher.yml
  OK  .github\workflows\video_maker.yml
  OK  .github\workflows\mock_test_maker.yml
  OK  .github\workflows\fast_track.yml
Verifying...
  OK  dispatcher schedule disabled (manual-only) - safe to install
```

### Ya bilkul manual (script chalana hi na ho to)

```powershell
Copy-Item ai_backend\github_workflows\video_dispatcher.yml .github\workflows\ -Force
Copy-Item ai_backend\github_workflows\video_maker.yml      .github\workflows\ -Force
Copy-Item ai_backend\github_workflows\mock_test_maker.yml  .github\workflows\ -Force
Copy-Item ai_backend\github_workflows\fast_track.yml       .github\workflows\ -Force
git add .github/workflows
```

---

## STEP 3 — Commit + push

```bash
git commit -m "Install billing-independent video dispatcher workflows"
git push origin arena/01a01b18-auto-video-backend
```

Aapke account ke paas permission hai, isliye ye push **chal jayega**.

---

## STEP 3.5 — Bina merge kiye test karna (RECOMMENDED)

GitHub Actions tab me "Run workflow" button sirf un workflows ka aata hai jo
**default branch (`main`)** par hon. Isliye jab tak PR merge nahi hota,
"🎬 Video Dispatcher" ka button nahi dikhega.

**Lekin merge ki zaroorat nahi.** `push` trigger kisi bhi branch par chalta hai,
isliye maine ek temporary test workflow bana diya hai jo control file push karne
par chalta hai.

### Kaise use karein

`ai_backend/.videotest` file kholo, values badlo, aur push kar do:

```
run=2                 <-- har naye test me ye number badhao
kind=job              <-- all | job | fast_track | mock_test
limit=1
dry_run=true          <-- true = kuch banega nahi, sirf report
privacy=unlisted
doc=                  <-- optional: ek hi document test karna ho to uski id
```

```powershell
git add ai_backend/.videotest
git commit -m "test: job dry run"
git push origin arena/01a01b18-auto-video-backend
```

Ab GitHub → **Actions** → "🧪 Video Dispatcher — Branch Test" me run dikhega.

### Teeno pipeline ek-ek karke

**1. Pehle dry run (kuch upload nahi hoga):**
```
run=1
kind=all
dry_run=true
```

**2. JOB:**
```
run=2
kind=job
dry_run=false
privacy=unlisted
```

**3. FAST TRACK:**
```
run=3
kind=fast_track
dry_run=false
privacy=unlisted
```

**4. MOCK TEST:**
```
run=4
kind=mock_test
dry_run=false
privacy=unlisted
```

Har baar `git add` → `commit` → `push`.

> **Safety:** is test workflow me `privacy=public` **allowed nahi hai** — public
> jaane ke liye PR merge karke asli dispatcher use karna hoga. `kind` ya
> `dry_run` me typo hoga to workflow saaf error dega, chupchaap galat pipeline
> nahi chalayega.

> Ye workflow sirf tab chalta hai jab `.videotest` file badle — normal code
> push par kabhi trigger nahi hoga.

---

## STEP 3.6 — PR merge (baad me, jab test pass ho jaayen)

**Zaroori baat:** GitHub Actions tab me sirf wahi workflows dikhte hain jo
**default branch (`main`)** par maujood hon. Abhi `video_dispatcher.yml` sirf
`arena/01a01b18-auto-video-backend` branch par hai, isliye:

- Actions list me "🎬 Video Dispatcher" **nahi** dikhega
- "Run workflow" button bhi nahi milega

Iska hal — PR merge karo:

**PR link:** https://github.com/rahul74603/auto-video-backend/pull/11

GitHub par PR kholo → **Merge pull request** dabao.

Ya command se:

```powershell
gh pr merge 11 --repo rahul74603/auto-video-backend --squash
```

Merge ke baad Actions tab refresh karo — ab "🎬 Video Dispatcher (Firestore
Poller)" dikhega aur "Run workflow" button aa jayega.

> Merge karna surakshit hai: dispatcher ka schedule band hai aur manual
> defaults `dry_run=true` + `privacy=unlisted` hain. Merge se koi video
> apne aap nahi banega.

**Merge ke baad ye 2 temporary files delete kar dena:**

```powershell
git rm .github/workflows/video_dispatcher_branch_test.yml ai_backend/.videotest
git commit -m "Remove temporary branch-test workflow"
git push
```

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

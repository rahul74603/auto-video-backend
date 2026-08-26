# 🎬 StudyGyaan Video Automation — Operator Guide

Billing-independent video automation for **JOB**, **FAST TRACK** and **MOCK TEST**.
Runs entirely on **GitHub Actions + FFmpeg**. Works while Firebase is on the **Spark**
plan with billing disabled — Firestore is the only Firebase service used.

---

## Architecture

```
Website / Admin publishes
        ↓
     Firestore                       (Spark plan — no billing needed)
        ↓
GitHub Actions video dispatcher      .github/workflows/video_dispatcher.yml
        ↓                            repository_dispatch + */5 fallback
ai_backend/video_dispatcher.js
        ↓  atomically claims the document (videoStatus: → processing)
Existing renderers + FFmpeg
   • autoVideo.js         → JOB + FAST_TRACK   (1080x1920 vertical)
   • mock_test_video.js   → MOCK_TEST          (1920x1080 horizontal)
        ↓
YouTube (required) · Facebook (optional) · Telegram (optional)
        ↓
Firestore videoStatus = completed
```

**Cloud Functions are NOT required.** The legacy path still works:

| Path | Trigger | Status |
|---|---|---|
| OLD | Cloud Function → `repository_dispatch` → `video_maker.yml` | Kept, still supported |
| NEW | Scheduled poller → `video_dispatcher.yml` | Primary, billing-independent |

Both call `video_state.claim()` before rendering, so **duplicates are impossible**
even if the old Firebase trigger starts working again.

---

## Firestore state machine

Written by `ai_backend/video_state.js` (additive — no existing field was removed).

```
(nothing) ──► processing ──► completed
                  │
                  ├────────► upload_failed   (video rendered, YouTube upload failed)
                  └────────► failed          (render failed)
```

| Field | Meaning |
|---|---|
| `videoStatus` | `queued` / `processing` / `completed` / `upload_failed` / `failed` |
| `videoTriggeredAt` | first time the item entered the queue |
| `videoStartedAt` | when a worker claimed it (also the lock timestamp) |
| `videoCompletedAt` | successful finish |
| `videoFailedAt` / `videoError` | last failure time and concise reason |
| `videoAttempts` | claim count — 3 failures = no more automatic retries |
| `videoLockId` / `videoWorker` | which run currently holds the claim |
| `videoYouTubeId` / `videoYouTubeUrl` | result |

Legacy fields still written for backward compatibility:
`videoTriggered`, `youtubeVideoId`, `youtubeVideoUrl`, `videoCreatedAt`, `mockVideoMade`.

### Selection rules

| Pipeline | Collection | Processed when |
|---|---|---|
| JOB | `jobs` | `type` is `JOB` or unset · has a title · status not draft/archived/etc · not a study-material row |
| FAST TRACK | `fast_track` | `status == "published"` · has a title |
| MOCK TEST | `mock_tests` | `mockVideoMade != true` · has questions · has title/subject |

Always skipped: already completed, currently locked by a live worker, failed 3×,
`videoExcluded` / `skipVideo` / `noVideo` set by an admin, or content published
older than the **1-day freshness window** (only freshly published content is
auto-rendered — legacy backlog and stale queued/failed docs are never picked up).
Docs with **no parseable timestamp** (`publishedAt` / `createdAt` / `updatedAt` all
missing or unparseable, e.g. `25-08-2026` style strings) are treated as backlog —
age unknown means *not fresh*, never *eligible forever*. Force such a doc manually
with `--doc=<id> --max-age-days=0`. The window is tunable at runtime via the
`VIDEO_MAX_AGE_DAYS` env var / repo variable or `--max-age-days` CLI flag
(a blank/unset value falls back to the built-in default, never to 0).

---

## Safety properties

* **Atomic claim** — `db.runTransaction()`; only one worker can move a document into `processing`.
* **Crash recovery** — a lock older than 45 minutes is treated as abandoned and retried.
* **Bounded work** — 1 video per run by default; never 50 parallel FFmpeg jobs.
* **Retry cap** — 3 attempts, then the document is left alone with `videoError` recorded.
* **Never a false success** — `completed` is written only after a real YouTube video id exists.
* **Facebook / Telegram optional** — missing credentials are logged and skipped, never fatal.
* **Fail-loud** — a Firestore scan error is reported and exits non-zero; videos are never silently skipped.

---

## Required GitHub Secrets

Already used by the existing workflows — nothing new is mandatory.

| Secret | Used for | Required |
|---|---|---|
| `SERVICE_ACCOUNT_JSON` | Firestore access | ✅ yes |
| `GMAIL_CREDENTIALS` | YouTube OAuth client | ✅ yes |
| `YOUTUBE_TOKEN` | JOB + FAST TRACK uploads | ✅ yes |
| `YOUTUBE_TOKEN_SELF_TEST` | MOCK TEST uploads | ✅ yes (mock tests) |
| `TTS_KEY_JSON` | Google Hindi TTS | ✅ yes |
| `FB_PAGE_ID`, `FB_PAGE_TOKEN` | Facebook | optional |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram | optional |
| `TELEGRAM_CHANNEL_LINK`, `TELEGRAM_CHANNEL_NAME` | branding in captions | optional |
| `GEMINI_API_KEY` | Fast Track **scraper** only | optional |
| `FAST_TRACK_TRIGGER_TOKEN` | legacy Cloud Function fallback only | optional |

> `FAST_TRACK_TRIGGER_TOKEN` replaces a token that used to be hardcoded in the
> workflow file. Add it only if you still want the legacy endpoint fallback.

---

## Manual operation

**Actions → 🎬 Video Dispatcher (Firestore Poller) → Run workflow**

| Input | Purpose |
|---|---|
| `kind` | `all` · `job` · `fast_track` · `mock_test` |
| `limit` | max videos this run (default `1`) |
| `dry_run` | `true` = report only, claim nothing |
| `doc` | force one Firestore document id |
| `privacy` | `unlisted` for safe testing without public spam |

Local equivalents:

```bash
cd ai_backend
node video_dispatcher.js --dry-run --kind=all        # see what is pending
node video_dispatcher.js --kind=job --limit=1
node video_dispatcher.js --kind=mock_test --doc=<id>
```

### Recommended first production test

1. Run with `dry_run = true` to confirm the dispatcher sees the right documents.
2. Run with `kind = job`, `limit = 1`, `privacy = unlisted`.
3. Check the Firestore document for `videoStatus: completed` and a YouTube URL.
4. Repeat for `fast_track` and `mock_test`, then drop the `privacy` override.

### Re-running a failed item

Clear the guard fields on the document:

```js
{ videoStatus: <delete>, videoAttempts: 0, videoError: <delete> }
```

---

## Pausing

The admin automation switch (`system_settings/automation`) still applies:

* `video_maker` → JOB + FAST TRACK videos
* `mock_test` → MOCK TEST videos
* `globalEnabled: false` or `emergencyPause: true` → everything stops

If the guard itself cannot be read the dispatcher **fails open** and logs the reason,
so a Firestore hiccup never permanently disables video generation.

---

## Cost reality

GitHub Actions minutes are **not unlimited** — private repositories have a monthly
quota (public repositories run free on standard runners). The schedule is every 15
minutes and each poll exits in seconds when nothing is pending; only actual renders
consume meaningful minutes. Keep `limit` low and let the queue drain across runs.

# 🧠 StudyGyaan Growth Engine — AI Self-Improving Video Platform

## Architecture Overview

```
CONTENT PUBLISHED (jobs/fast_track/mock_tests in Firestore)
      ↓
OPPORTUNITY DETECTION → opportunity_engine.js
      ↓
QUALITY GATE → quality_gate.js
      ↓
DUPLICATE CHECK → content_fingerprint.js
      ↓
HOOK GENERATION → hook_engine.js (10+ candidates per topic)
      ↓
HOOK SCORING → scoreHook() (clarity + relevance + curiosity + urgency + audienceFit + infoDensity)
      ↓
SCRIPT GENERATION → script_engine.js (hook → context → main value → facts → CTA)
      ↓
RETENTION EVALUATION → retention_engine.js
      ↓
CONTENT SCORE (0-100) → recommendation_engine.js
      ↓
VIDEO PLAN:
  - Duration → dynamic (15-60s based on content type)
  - Visual Style → visual_engine.js (8 style profiles)
  - Presenter → presenter_rotation.js (performance-based)
  - First Frame → first_frame_engine.js (fact-based)
  - Music → music_engine.js (with ducking)
  - Subtitles → subtitle_engine.js (keyword highlighting)
      ↓
PLATFORM PACKAGING → platform_packaging.js
  - YouTube: search-friendly title + hashtags
  - Instagram: short caption + hashtags
  - Facebook: share-friendly caption
  - Telegram: Markdown-formatted info + link
  - SEO: relevance-first keywords (no spam)
      ↓
DISTRIBUTION → video_dispatcher.js → autoVideo.js / mock_test_video.js
      ↓
ANALYTICS COLLECTION → analytics/collector.js
  - YouTube Data API (views, likes, comments)
  - Facebook Graph API (views, likes, shares)
  - Instagram Graph API (play_count, likes, comments)
      ↓
PERFORMANCE SCORING → analytics/scorer.js + normalizer.js
      ↓
SELF-LEARNING → analytics/learner.js
  - Best hook types per category
  - Best presenter per content type
  - Best duration per format
  - Best posting times
  - Pattern confidence thresholds
      ↓
NEXT CONTENT AUTOMATICALLY IMPROVES
```

## Modules

### Core Engine (`agents/growth/`)

| Module | Phase | Description |
|--------|-------|-------------|
| `orchestrator.js` | 50 | Main entry point, integrates all phases |
| `opportunity_engine.js` | 2 | Content opportunity detection from internal signals |
| `content_fingerprint.js` | 3 | Duplicate detection (EXACT/NEAR/RELATED/NEW) |
| `quality_gate.js` | 4, 30 | Fact quality gate before rendering |
| `script_engine.js` | 5 | Retention-optimized script generation |
| `hook_engine.js` | 6, 7 | Hook generation (10 types) + scoring |
| `retention_engine.js` | 8, 9 | Duration estimation + retention evaluation |
| `visual_engine.js` | 10 | Visual style profiles (8 profiles) |
| `presenter_rotation.js` | 11 | Performance-based presenter selection |
| `first_frame_engine.js` | 12 | Dynamic first frame from verified facts |
| `subtitle_engine.js` | 13 | Keyword-highlighted subtitle generation |
| `music_engine.js` | 14 | Optional background music with ducking |
| `breaking_mode.js` | 17 | Breaking content priority detection |
| `content_mutation.js` | 26 | Controlled topic angle variations |
| `comment_intelligence.js` | 27 | Comment classification for content gaps |
| `trend_detector.js` | 28 | Optional trend provider interface |
| `reach_predictor.js` | 29 | Reach prediction for prioritization |
| `platform_packaging.js` | 15, 16 | Platform-specific metadata + relevance SEO |
| `recommendation_engine.js` | 31 | Central decision engine |
| `feature_flags.js` | 46 | All features toggleable via env vars |
| `logger.js` | 35 | Structured observability (no secret leakage) |

### Analytics (`agents/growth/analytics/`)

| Module | Phase | Description |
|--------|-------|-------------|
| `collector.js` | 20 | Platform metric collection (never fakes data) |
| `normalizer.js` | 21 | Metric normalization + baselines |
| `scorer.js` | 21, 23 | Performance scoring + winner detection |
| `learner.js` | 24, 25, 37 | Self-learning + best-time + AI recommendations |

## Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `content_opportunities` | Detected content opportunities with scores |
| `content_fingerprints` | Deduplication fingerprints |
| `content_performance` | Per-platform metrics (views, retention, etc.) |
| `growth_insights` | Learned patterns from analytics |
| `growth_experiments` | A/B test tracking (controlled, rate-limited) |
| `growth_recommendations` | AI-generated actionable recommendations |
| `platform_posts` | Per-platform upload state (independent retry) |

## Feature Flags

All features are toggleable via environment variables. All default to safe values:

```bash
# Master switches
GROWTH_ENGINE_ENABLED=true
ANALYTICS_ENABLED=true
AB_TESTING_ENABLED=false        # Requires volume, off by default
TREND_ENGINE_ENABLED=false       # Requires external provider
BREAKING_MODE_ENABLED=true
COMMENT_INTELLIGENCE_ENABLED=false

# Sub-systems (all default true unless noted)
HOOK_ENGINE_ENABLED=true
SCRIPT_ENGINE_ENABLED=true
QUALITY_GATE_ENABLED=true
VISUAL_ENGINE_ENABLED=true
MUSIC_ENGINE_ENABLED=true
PRESENTER_ROTATION_ENABLED=true
FIRST_FRAME_ENABLED=true
SUBTITLE_ENGINE_ENABLED=true
CONTENT_MUTATION_ENABLED=false   # Experimental, off by default
REACH_PREDICTION_ENABLED=true
LEARNER_ENABLED=true
RECOMMENDATION_ENGINE_ENABLED=true
DUPLICATE_DETECTION_ENABLED=true
```

## Existing Systems Preserved

- ✅ JOB pipeline (video_state.js → autoVideo.js)
- ✅ FAST_TRACK pipeline (video_state.js → autoVideo.js)
- ✅ MOCK_TEST pipeline (video_state.js → mock_test_video.js)
- ✅ Atomic Firestore claim (no duplicate rendering)
- ✅ Stale lock recovery (45-min timeout)
- ✅ Retry limits (3 attempts max)
- ✅ TTS fallback (Google → Edge, billing-independent)
- ✅ YouTube upload adapter
- ✅ Facebook upload adapter
- ✅ Telegram integration
- ✅ Existing SEO (seo_static/)
- ✅ Automation guard (system_settings/automation kill switch)
- ✅ Daily YouTube quota guard
- ✅ Shorts cutoff enforcement
- ✅ GitHub Actions workflows (10-min polling)

## New Environment Variables

No new secrets required. Growth engine uses existing:
- `SERVICE_ACCOUNT_JSON` for Firestore access
- `YOUTUBE_TOKEN` for analytics collection
- `FB_PAGE_TOKEN` for Facebook/Instagram analytics
- `TELEGRAM_BOT_TOKEN` for Telegram

New feature flags are all optional with safe defaults.

## Testing

```bash
cd ai_backend
npm test                    # All 385 tests (324 existing + 61 new)
npm run check               # Syntax check all files
```

## Usage

### From Video Dispatcher (automatic)

The growth engine integrates into the existing video dispatcher flow. When `GROWTH_ENGINE_ENABLED=true` (default), every content piece goes through:

1. Opportunity detection
2. Quality gate
3. Duplicate check
4. Recommendation generation
5. Video plan creation

### Standalone

```javascript
const growth = require('./agents/growth/orchestrator');

const result = await growth.processContent(
    { title: 'SSC GD 2026', organization: 'SSC', vacancies: '5000', ... },
    { contentId: 'doc-id', db: firestoreDb, platform: 'youtube' }
);

if (result.processed) {
    console.log('Recommendation:', result.recommendation);
    // result.recommendation contains: hook, script, duration, visual style,
    // presenter, first frame, music, platform packaging, reach prediction, etc.
}
```

## Learning Safety

- Minimum sample sizes before patterns are trusted
- Confidence thresholds (0.6 minimum)
- Rolling 30-day window for analysis
- Maximum influence cap (one viral video can't shift system more than 30%)
- Category-level and platform-level baselines
- Predicted vs observed scores tracked separately

## Free-First Architecture

- No paid API dependencies for core functionality
- Firestore (free on Spark) for all state
- GitHub Actions (free for public repos) for execution
- FFmpeg for rendering (already existing)
- Edge TTS fallback (already existing)
- Optional: Google TTS (if billing enabled)
- Optional: External trend providers (if configured)

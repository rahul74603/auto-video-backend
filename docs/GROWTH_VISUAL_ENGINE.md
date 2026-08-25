# Growth Visual Engine Documentation

## Overview

The Growth Visual Engine adds dynamic AI-generated visuals, intelligent layouts, motion effects, and comprehensive quality controls to the StudyGyaan video generation pipeline.

## New Modules

### 1. AI Visual Engine (`ai_visual_engine.js`)

**Purpose:** Generate category-specific AI images for video backgrounds.

**Features:**
- Category-aware prompts (Police, Railway, Banking, SSC, etc.)
- Style modifiers for visual variety
- Placement-aware generation (presenter bottom/left/right/center)
- Automatic cleanup after render
- Cost controls (1 image per video, daily limits)

**Fallback Order:**
1. AI-generated image (when provider available)
2. Existing category visual
3. Existing background
4. Existing video template

**Provider:** Pollinations.ai (free, no API key required)

**Safety:**
- 30-second timeout
- 5MB file size limit
- 2 max retries
- Automatic cleanup
- Never puts factual job data in prompts

### 2. Layout Engine (`layout_engine.js`)

**Purpose:** Dynamic video composition with 10 predefined layouts.

**Layouts:**
- LAYOUT_A: Presenter Bottom (classic)
- LAYOUT_B: Presenter Left
- LAYOUT_C: Presenter Right
- LAYOUT_D: Full Visual (small presenter)
- LAYOUT_E: Vacancy Focus
- LAYOUT_F: Deadline Focus
- LAYOUT_G: Document Focus
- LAYOUT_H: Q&A Layout
- LAYOUT_I: Minimal Editorial
- LAYOUT_J: Breaking Update

**Selection Logic:**
- Category-based suitability
- Performance-weighted (when data available)
- Fatigue prevention (avoid recent layouts)
- Mobile-safe margins enforced

### 3. Motion Engine (`motion_engine.js`)

**Purpose:** Add controlled motion to AI images.

**Motion Profiles:**
- slow_zoom_in/out
- gentle_pan_right/up
- subtle_scale
- kinetic_opening (for breaking news)
- static_safe (for text-heavy content)

**Safety Rules:**
- Motion must support readability
- Never distracts from text
- Match motion to content urgency
- Validate for text density

### 4. Deadline Engine (`deadline_engine.js`)

**Purpose:** Track application deadlines and create urgency states.

**Urgency States:**
- OPEN
- NORMAL
- UPCOMING_DEADLINE (>14 days)
- 7_DAYS_LEFT
- 3_DAYS_LEFT
- 2_DAYS_LEFT
- TOMORROW
- TODAY
- CLOSED

**Safety Rules:**
- Max 3 reminders per job
- Minimum 7-day gap between reminders
- Different content angle each time
- Stop after deadline

### 5. FAQ Engine (`faq_engine.js`)

**Purpose:** Identify meaningful FAQs and create content opportunities.

**FAQ Topics:**
- qualification
- age_limit
- salary
- application_fee
- last_date
- selection_process
- documents_required
- apply_process
- vacancies
- exam_pattern
- eligibility
- job_location

**Priority Scoring:**
- Audience demand (high/medium/low)
- Data availability
- Already answered?
- Recently published?
- Content opportunity score

### 6. Content Angle Engine (`content_angle_engine.js`)

**Purpose:** Determine video perspective to avoid repetition.

**Angles:**
1. Basic Job Alert
2. Who Can Apply?
3. Eligibility Deep Dive
4. Age Limit Focus
5. Salary Focus
6. Selection Process
7. Application Process
8. Important Dates
9. Last Date Reminder
10. Documents Required
11. Exam Pattern
12. Vacancy Breakdown
13. Admit Card Update
14. Result Update
15. FAQ
16. Common Mistake
17. Quick Explanation

**Selection:**
- Data availability check
- Recent angle fatigue prevention
- Performance-weighted selection
- Priority-based random selection

### 7. Visual Fatigue Prevention (`visual_fatigue_prevention.js`)

**Purpose:** Track recent visual usage and prevent excessive repetition.

**Monitors:**
- Visual style
- Layout
- Presenter
- Hook type
- Content angle
- Opening pattern

**Diversity Score:**
- 0-100 scale
- Weighted combination of dimensions
- Recent history analysis (last 10 videos)
- Prevents same combination for many consecutive videos

### 8. CTA Engine (`cta_engine.js`)

**Purpose:** Generate context-aware calls-to-action.

**CTA Types:**
- apply_now
- download_now
- check_result
- read_more
- subscribe
- comment_question
- share
- visit_website
- join_telegram
- save_for_later
- deadline_urgency
- eligibility_check

**Positional CTAs:**
- Opening: subscribe, join_telegram
- Middle: read_more, eligibility_check
- Closing: apply_now, share, save_for_later

### 9. Mobile Quality Gate (`mobile_quality_gate.js`)

**Purpose:** Validate video composition for mobile readability.

**Validations:**
- Text width and font size
- Line count
- Safe margins
- Contrast
- Presenter overlap
- Subtitle overlap
- First-frame overlap
- CTA overlap
- Hindi line breaking
- English/Hindi mixed text
- Extreme long words
- Screen edge clipping

**Actions on Failure:**
- Try safe adjustment
- Fallback to existing safe template
- Never publish obviously broken frame

### 10. Content Similarity Detector (`content_similarity_detector.js`)

**Purpose:** Extended duplicate detection across multiple dimensions.

**Dimensions:**
- Script text
- Hook text
- Title
- Visual style
- Layout
- Content angle
- Image fingerprint

**Similarity Threshold:** 0.7 (70%)

**Actions:**
- Block near-identical content
- Suggest changes to reduce similarity
- Prevent spam-like flooding

### 11. Cost Control Engine (`cost_control_engine.js`)

**Purpose:** Prevent excessive spending on AI services.

**Budget Tiers:**
- Free: 50 images/day, 1 per video, 30s timeout
- Low-cost: 200 images/day, 2 per video, 45s timeout
- Premium: 1000 images/day, 5 per video, 60s timeout

**Features:**
- Daily usage tracking
- Per-video limits
- Image caching (24h for free tier)
- Duplicate prevention
- Monthly cost estimation
- Firestore-based tracking

## Feature Flags

All new features are controlled by feature flags in `feature_flags.js`:

```javascript
AI_VISUAL_ENABLED: false,              // Off by default (requires testing)
DYNAMIC_LAYOUT_ENABLED: true,          // On
VISUAL_FATIGUE_PREVENTION_ENABLED: true, // On
DEADLINE_ENGINE_ENABLED: true,         // On
FAQ_ENGINE_ENABLED: true,              // On
CONTENT_ANGLE_ENGINE_ENABLED: true,    // On
MOBILE_QUALITY_GATE_ENABLED: true,     // On
CTA_ENGINE_ENABLED: true,              // On
MOTION_ENGINE_ENABLED: true,           // On
COST_CONTROL_ENABLED: true,            // On
CONTENT_SIMILARITY_ENABLED: true,      // On
```

## Integration

All engines are integrated into `orchestrator.js` and called automatically during content processing.

### Processing Flow:

1. Content Similarity Check
2. Deadline Intelligence
3. FAQ Opportunity Detection
4. Content Angle Selection
5. Visual Fatigue Check
6. AI Visual Generation (if enabled)
7. Layout Selection
8. Motion Profile Selection
9. Recommendation Generation
10. CTA Generation
11. Mobile Quality Validation
12. Store Enhanced Opportunity

## Testing

All modules have comprehensive unit tests in `tests/growth_enhancements.test.js`.

**Test Coverage:**
- 26 new tests
- All passing
- Covers core functionality of each module

## Production Rollout

**Phase A (Current):**
- All feature flags available
- AI Visual OFF (requires testing)
- All other engines ON

**Phase B:**
- Enable AI Visual for small percentage
- Monitor quality and costs
- Gather feedback

**Phase C:**
- Full rollout based on Phase B results
- Enable AI Visual if quality is acceptable

## Cost Estimation

**Free Tier (Default):**
- 50 images/day max
- Pollinations.ai (free)
- Estimated monthly cost: $0

**Low-Cost Tier:**
- 200 images/day
- Mix of free + paid providers
- Estimated monthly cost: ~$2.40

**Premium Tier:**
- 1000 images/day
- Multiple providers
- Estimated monthly cost: ~$12.00

## Manual Setup

**NO MANUAL SETUP REQUIRED** for default configuration.

Optional: To enable AI Visual:
1. Set `AI_VISUAL_ENABLED=true` in feature flags
2. Monitor first 10 videos for quality
3. Adjust as needed

## Troubleshooting

**AI Visual not generating:**
- Check `AI_VISUAL_ENABLED` flag
- Check cost limits in Firestore
- Check network connectivity to Pollinations.ai

**Layout issues:**
- Check `DYNAMIC_LAYOUT_ENABLED` flag
- Review recent layout history
- Check mobile quality gate logs

**Deadline not working:**
- Verify `lastDate` field in job data
- Check date format (ISO 8601)
- Check `DEADLINE_ENGINE_ENABLED` flag

## Future Enhancements

- Multi-provider AI image generation
- Advanced motion profiles
- A/B testing for layouts
- Category-specific learning
- Visual performance tracking

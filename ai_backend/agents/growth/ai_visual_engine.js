'use strict';

/**
 * ai_visual_engine.js — Dynamic AI Visual Layer
 *
 * Generates category-aware, visually diverse AI images for video backgrounds.
 *
 * Design goals:
 * - A real visual scene engine, NOT a pile of extra prompt words.
 * - Each content item gets a stable visual fingerprint (type + documentId +
 *   slug + category + title + date).
 * - Scene / subject / camera / lighting / style / depth / mood / energy and
 *   presenter-safe-area are chosen deterministically from that fingerprint.
 * - Different content normally produces a different combination.
 * - The same content reproduces the same fingerprint/prompt/seed on retry.
 * - A lightweight recent-visual guard prevents immediate reuse of the same
 *   combination across recent videos, without randomness and without extra
 *   external services.
 * - AI images contain NO text, logos, watermarks, emblems or readable docs.
 *
 * Cache semantics (IMPORTANT):
 * - Same-run retry reuses the image written to the stable cache path because
 *   the ephemeral GitHub Actions workspace is still alive during the run.
 * - Cross-run reuse across INDEPENDENT GitHub Actions runners is NOT
 *   guaranteed: the AI image file lives only on the ephemeral runner
 *   filesystem, and the Firestore image_cache record only stores that
 *   ephemeral path. A new runner does not inherit the old file.
 *   Same-content deterministic prompt/seed is guaranteed; exact binary image
 *   reuse across independent GitHub Actions runners is not guaranteed.
 * - No paid persistent storage (Firebase Storage/Cloud Run) was added for
 *   this. If persistent binary reuse is required later it must be added as a
 *   separate, deliberate change.
 *
 * Fallback order (unchanged):
 * 1. AI-generated image (when provider available)
 * 2. Existing category visual
 * 3. Existing background
 * 4. Existing video template
 *
 * Cost guards (unchanged):
 * - Max 1 AI image per video
 * - Daily limit configurable
 * - Timeout 30 seconds
 * - Max retries 2
 * - File size limit 5MB
 * - Cleanup after render
 *
 * Safety:
 * - Never put factual job data in prompt
 * - Visual only, no authoritative text
 * - Graceful failure to existing system
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// -------------------------------------------------------------------------
// A. SCENE / ENVIRONMENT pools (per category + reusable Default pool)
// -------------------------------------------------------------------------
const SCENE_POOLS = {
    'POLICE': [
        'police academy training ground',
        'indoor police control room',
        'police parade preparation ground',
        'police recruitment physical training area',
        'police aspirant study corner',
        'police training obstacle course',
        'police briefing room',
        'police documentation desk',
        'police vehicle training yard',
        'night police training environment'
    ],
    'RAILWAY': [
        'modern railway station platform',
        'railway control room',
        'railway signal cabin',
        'railway tracks at sunrise',
        'railway engineering workshop',
        'train maintenance yard',
        'railway recruitment study desk',
        'locomotive cabin interior',
        'railway operations center',
        'passenger platform with train arriving'
    ],
    'BANKING': [
        'modern bank branch interior',
        'banking operations desk',
        'financial analyst workspace',
        'digital banking environment',
        'ATM banking service area',
        'corporate finance office',
        'banking exam preparation desk',
        'professional interview room',
        'fintech workspace with monitors',
        'business district financial office'
    ],
    'SSC': [
        'public library study environment',
        'student preparation desk with notes',
        'competitive exam coaching classroom',
        'examination hall with rows of desks',
        'group study session',
        'laptop-based preparation workspace',
        'books and notes workspace',
        'mock test environment',
        'competitive exam classroom',
        'early morning study scene'
    ],
    'DEFENCE': [
        'military training ground',
        'obstacle course field',
        'parade ground',
        'defence academy classroom',
        'physical training yard',
        'tactical training environment',
        'military briefing room',
        'outdoor endurance training route',
        'disciplined formation area',
        'sunrise training ground'
    ],
    'TEACHING': [
        'modern classroom with blackboard',
        'teacher training workshop',
        'school corridor with students',
        'education resource room',
        'lesson preparation desk',
        'bright school library',
        'exam review classroom',
        'digital smart classroom',
        'teachers staff room',
        'campus teaching block'
    ],
    'ENGINEERING': [
        'engineering laboratory',
        'technical workshop',
        'CAD design workspace',
        'campus robotics lab',
        'engineering drawing studio',
        'training center workshop floor',
        'industrial prototype lab',
        'computer lab with engineering software',
        'workshop with machine tools',
        'engineering campus in morning light'
    ],
    'UPSC': [
        'civil services study desk',
        'large reference library reading room',
        'upsc aspirant study corner',
        'coaching institute study hall',
        'essay preparation workspace',
        'current affairs study corner',
        'notes and newspaper workspace',
        'serious study room filled with books',
        'mock test practice desk',
        'early morning upsc study scene'
    ],
    'RESULT': [
        'student checking result on laptop',
        'result notification on phone',
        'family celebrating achievement',
        'student receiving certificate',
        'quiet emotional success moment',
        'friends celebrating together',
        'successful candidate preparing documents',
        'candidate looking at result screen',
        'academic achievement desk',
        'celebration outdoors'
    ],
    'ADMIT_CARD': [
        'candidate downloading admit card',
        'examination preparation desk',
        'exam center exterior',
        'candidate checking documents',
        'examination hall entrance',
        'ID and document verification desk',
        'printed admit card on desk',
        'student preparing exam materials',
        'candidate travelling to exam center',
        'exam morning preparation'
    ],
    'APPRENTICESHIP': [
        'industrial apprenticeship workshop',
        'vocational training center',
        'factory training floor',
        'apprentice learning machine operation',
        'technical hands-on training area',
        'workshop with welding stations',
        'manufacturing trainee workspace',
        'apprenticeship induction center',
        'engineering workshop training bay',
        'industrial training classroom'
    ],
    'SCHOLARSHIP': [
        'student receiving award certificate',
        'scholarship award ceremony',
        'student reviewing scholarship offer letter',
        'mentor guiding student on campus',
        'scholarship office interior',
        'student gratitude moment',
        'academic scholarship notice board',
        'university campus with scholarship stall',
        'student preparing scholarship application',
        'celebration with family after award'
    ],
    'FAST_TRACK': [
        'professional recruitment environment',
        'government office exterior',
        'candidate checking recruitment update',
        'application desk',
        'official paperwork workspace',
        'career opportunity scene',
        'interview preparation desk',
        'document verification center',
        'recruitment notice environment',
        'professional candidate workspace'
    ],
    'Default': [
        'public library study environment',
        'professional office environment',
        'digital learning workspace',
        'open campus corridor',
        'government office exterior',
        'modern classroom',
        'quiet reading desk',
        'interview preparation desk',
        'result checking screen',
        'training center environment'
    ]
};

// -------------------------------------------------------------------------
// B. SUBJECT / HUMAN ACTIVITY pools
// -------------------------------------------------------------------------
const SUBJECT_POOLS = {
    'POLICE': [
        'young Indian female police aspirant in training uniform doing a drill',
        'Indian male police trainee running an obstacle course',
        'Indian police officer briefing recruits in a briefing room',
        'young Indian police aspirant in casual clothes studying notes at a desk',
        'mixed group of Indian police aspirants in uniform marching in formation',
        'Indian female police constable candidate reviewing documents',
        'Indian male police aspirant practising physical training on a field',
        'Indian police training instructor demonstrating procedure to a small group',
        'young Indian police aspirant standing alert in a vehicle yard',
        'Indian police aspirant climbing a rope during an obstacle course'
    ],
    'RAILWAY': [
        'Indian female railway trainee reviewing digital control panels',
        'young Indian male railway apprentice working on train maintenance',
        'Indian railway operations staff monitoring train schedules',
        'Indian female aspirant studying railway exam notes on a platform bench',
        'Indian railway technician inspecting tracks',
        'young Indian male trainee working in a signal cabin',
        'Indian female railway candidate checking documents at a station desk',
        'Indian railway guard walking along a platform',
        'young Indian male recruit training inside a locomotive cabin',
        'Indian railway engineer inspecting a workshop machine'
    ],
    'BANKING': [
        'Indian female bank professional at an operations desk',
        'young Indian male banking aspirant preparing at a study desk',
        'Indian financial analyst reviewing charts on monitors',
        'mixed group of Indian banking candidates in a mock interview room',
        'Indian male bank employee at a customer service counter',
        'Indian female banking trainee in a modern branch',
        'young Indian male aspirant at a fintech workspace',
        'Indian banking candidate verifying documents at a service desk',
        'Indian female corporate finance professional in an office',
        'mixed Indian banking team in a business district office'
    ],
    'SSC': [
        'Indian female student in casual clothes reading at a library desk',
        'young Indian male student writing notes in a notebook',
        'mixed group of Indian competitive exam students in a coaching classroom',
        'Indian female student studying on a laptop',
        'young Indian male student in a quiet early morning study scene',
        'Indian student standing at a bookshelf choosing a reference book',
        'mixed Indian group taking a mock test in a classroom',
        'Indian female student reviewing printed notes',
        'young Indian male student underlining important lines',
        'Indian student walking into an exam hall with exam materials'
    ],
    'DEFENCE': [
        'Indian male defence aspirant in training uniform doing push-ups',
        'Indian female cadet standing in a parade formation',
        'young Indian male cadet on an obstacle course',
        'Indian defence instructor teaching in an academy classroom',
        'mixed group of Indian cadets on a fitness run',
        'Indian male soldier candidate in a briefing room',
        'Indian female cadet practising physical training',
        'young Indian cadet climbing a wall during training',
        'Indian defence aspirant standing at attention',
        'mixed Indian cadets marching in disciplined formation at sunrise'
    ],
    'TEACHING': [
        'Indian female teacher writing on a board',
        'young Indian male teacher in a bright classroom',
        'Indian teacher guiding a group of students',
        'Indian female education trainee preparing lesson notes',
        'Indian male teacher helping a student at a desk',
        'mixed group of Indian teacher trainees in a workshop',
        'Indian female teacher reviewing books in a resource room',
        'young Indian teacher in a smart classroom',
        'Indian education trainee organising teaching materials',
        'Indian teacher in an empty classroom preparing for class'
    ],
    'ENGINEERING': [
        'young Indian male engineering student working in a lab',
        'Indian female engineering student building a circuit board',
        'mixed Indian engineering students in a robotics lab',
        'Indian male engineering trainee at a CAD workstation',
        'Indian female trainee in a technical workshop',
        'Indian engineering student assembling a prototype',
        'young Indian male apprentice using machine tools',
        'Indian female engineering aspirant drawing in a studio',
        'mixed Indian engineering interns in a workshop',
        'Indian engineering student reviewing blueprints'
    ],
    'UPSC': [
        'Indian female upsc aspirant reading a thick book',
        'young Indian male aspirant writing in a study diary',
        'Indian upsc aspirant making notes from a newspaper',
        'Indian female aspirant sitting at a large study desk',
        'young Indian male aspirant reading in a reference library',
        'Indian aspirant discussing current affairs in a study group',
        'Indian female aspirant doing a timed mock test',
        'young Indian male aspirant studying at dawn',
        'Indian upsc aspirant surrounded by books',
        'Indian aspirant reviewing highlighted notes'
    ],
    'RESULT': [
        'Indian female student checking her result on a laptop',
        'young Indian male student reading a result notification on his phone',
        'Indian family celebrating a student exam success',
        'Indian female student receiving a certificate from a teacher',
        'young Indian male student in a quiet emotional moment looking at a screen',
        'mixed group of Indian friends celebrating results',
        'Indian female candidate organising her documents after success',
        'young Indian male candidate looking at a result screen in an office',
        'Indian student with result papers on an academic desk',
        'Indian family celebrating success outdoors'
    ],
    'ADMIT_CARD': [
        'Indian female candidate downloading an admit card on a laptop',
        'young Indian male candidate preparing exam materials at a desk',
        'Indian candidate walking toward an exam center building',
        'Indian female candidate checking her documents',
        'Indian candidates queuing at an examination hall entrance',
        'Indian ID verification staff checking a candidates documents',
        'printed admit card resting on a study desk',
        'Indian female student arranging exam-day supplies',
        'young Indian male candidate travelling to an exam center',
        'Indian candidate at an exam-center desk on the morning of the exam'
    ],
    'APPRENTICESHIP': [
        'young Indian male apprentice in a workshop using a machine',
        'Indian female apprentice learning welding',
        'mixed group of Indian apprentices in a vocational training center',
        'Indian male trainee working in an industrial workshop',
        'Indian female trainee measuring parts on a workbench',
        'young Indian apprentice following an instructor demonstration',
        'Indian apprentices assembling components at a training bay',
        'Indian female apprentice in a manufacturing class',
        'young Indian male trainee in a skill training workshop',
        'Indian apprentice standing beside an industrial machine with an instructor'
    ],
    'SCHOLARSHIP': [
        'Indian female student receiving a scholarship certificate',
        'young Indian male student holding a scholarship letter',
        'Indian student at a scholarship award ceremony',
        'Indian mentor congratulating a scholarship student',
        'Indian female student in a scholarship office',
        'young Indian male student reviewing scholarship offer documents',
        'Indian student sharing success with family',
        'Indian female student reading a scholarship notice on campus',
        'Indian student preparing a scholarship application at a table',
        'mixed Indian students at a scholarship informational desk'
    ],
    'FAST_TRACK': [
        'Indian female candidate checking a government recruitment update on a laptop',
        'young Indian male candidate at an application desk',
        'Indian recruitment staff at a document verification counter',
        'Indian professional reviewing an offer letter',
        'Indian candidate in an interview preparation room',
        'mixed Indian candidates at a government office',
        'Indian female aspirant filling an application form',
        'Indian male candidate reading a recruitment notice on a notice board',
        'Indian candidate walking toward a government office',
        'Indian professional at a career opportunity seminar'
    ],
    'Default': [
        'young Indian adult focused in a study or work environment',
        'Indian female professional reviewing documents',
        'Indian male student preparing notes',
        'mixed Indian group in a learning environment',
        'young Indian adult standing in a professional setting',
        'Indian student reading in a quiet library',
        'Indian female aspirant working on a laptop',
        'Indian professional in a clean office space'
    ]
};

// -------------------------------------------------------------------------
// C. CAMERA / COMPOSITION pool
// -------------------------------------------------------------------------
const CAMERA_POOL = [
    'wide establishing shot',
    'medium shot',
    'close-up with shallow depth of field',
    'over-the-shoulder shot',
    'low-angle shot',
    'slightly elevated angle',
    'side perspective',
    'diagonal composition',
    'centered composition',
    'rule-of-thirds composition',
    'foreground-depth composition'
];

// -------------------------------------------------------------------------
// D. LIGHTING pool
// -------------------------------------------------------------------------
const LIGHTING_POOL = [
    'morning natural light',
    'golden hour lighting',
    'bright daylight',
    'soft indoor light',
    'cool office light',
    'dramatic side lighting',
    'warm evening light',
    'overcast natural light',
    'cinematic rim lighting'
];

// -------------------------------------------------------------------------
// E. COLOR / MOOD + VISUAL ENERGY pools
// -------------------------------------------------------------------------
const MOOD_POOL = [
    'focused and determined mood',
    'bright and hopeful mood',
    'disciplined and professional mood',
    'calm and prepared mood',
    'energised and ambitious mood',
    'quietly emotional mood',
    'professional and trustworthy mood',
    'aspirational and motivated mood',
    'celebratory but restrained mood',
    'serious and exam-focused mood'
];

const ENERGY_POOL = [
    'calm low-energy composition',
    'moderate natural composition',
    'energetic dynamic composition'
];

// -------------------------------------------------------------------------
// F. VISUAL STYLE pool
// -------------------------------------------------------------------------
const STYLE_POOL = [
    'premium editorial photography',
    'documentary photography',
    'cinematic realism',
    'photojournalistic',
    'modern corporate photography',
    'realistic news photography',
    'cinematic commercial photography',
    'clean contemporary photography',
    'atmospheric documentary',
    'high-detail realistic photography'
];

// -------------------------------------------------------------------------
// G. DEPTH / BACKGROUND pool
// -------------------------------------------------------------------------
const DEPTH_POOL = [
    'layered depth with sharp foreground and softly blurred background',
    'clean depth with blurred midground and crisp subject',
    'deep environment perspective with natural bokeh',
    'shallow depth of field isolating the subject',
    'atmospheric haze creating layered distance',
    'crisp background elements framing the subject',
    'subtle motion blur in background elements',
    'open depth with long corridor perspective'
];

// -------------------------------------------------------------------------
// H. PRESENTATION / PRESENTER SAFE AREA pool
// -------------------------------------------------------------------------
const PRESENTATION_PROMPTS = {
    'bottom': [
        'visual focus in upper two-thirds, clean darker lower area reserved for presenter overlay',
        'key subject in upper two-thirds, empty stable lower band for presenter overlay',
        'strong visual in the top section, uncluttered lower third for presenter overlay'
    ],
    'left': [
        'visual focus on right side, clean darker left area reserved for presenter overlay',
        'subject weighted to the right, empty left third for presenter overlay'
    ],
    'right': [
        'visual focus on left side, clean darker right area reserved for presenter overlay',
        'subject weighted to the left, empty right third for presenter overlay'
    ],
    'center': [
        'balanced composition with clean darker lower-center area reserved for presenter overlay',
        'subject framed high and centered, calm lower-center band for presenter overlay'
    ]
};

// -------------------------------------------------------------------------
// Quality / negative instructions
// -------------------------------------------------------------------------
const QUALITY_INSTRUCTIONS = 'vertical 9:16 composition, highly detailed realistic photography, professional focal depth, natural skin tones';
const NEGATIVE_INSTRUCTIONS = 'no text, no typography, no readable words, no logos, no watermark, no fake government emblem, no fake document text, no UI text, no fake department names, no fake dates, no fake exam names, no fake application numbers';

// Backward-compatible category prompt map (strings). The visual system itself
// uses SCENE_POOLS/SUBJECT_POOLS; this export keeps the previous shape for any
// old consumer that reads CATEGORY_PROMPTS as a category -> prompt string.
const CATEGORY_PROMPTS = {};
for (const [key, scenes] of Object.entries(SCENE_POOLS)) {
    const subject = (SUBJECT_POOLS[key] || SUBJECT_POOLS.Default)[0] || '';
    CATEGORY_PROMPTS[key] = `${scenes[0] || ''}, ${subject}`;
}

// Backward-compatible style modifiers (kept exported for old tests)
const STYLE_MODIFIERS = [
    'cinematic color grading',
    'documentary style',
    'editorial photography',
    'photojournalistic',
    'clean minimal',
    'warm natural lighting',
    'cool professional tones',
    'high contrast dramatic',
    'soft diffused lighting'
];

// Backward-compatible placement prompts (kept exported for old tests)
const PLACEMENT_PROMPTS = {
    'bottom': PRESENTATION_PROMPTS.bottom[0],
    'left': PRESENTATION_PROMPTS.left[0],
    'right': PRESENTATION_PROMPTS.right[0],
    'center': PRESENTATION_PROMPTS.center[0]
};

// -------------------------------------------------------------------------
// Category helpers
// -------------------------------------------------------------------------
function normalizeCategory(category) {
    const c = String(category || 'Default').trim().toUpperCase().replace(/\s+/g, '_');
    if (c === 'FAST-TRACK' || c === 'JOB_UPDATE' || c === 'JOB_UPDATES' || c === 'RAPID_UPDATE') {
        return 'FAST_TRACK';
    }
    if (SCENE_POOLS[c]) return c;
    return 'Default';
}

function getScenePool(category) {
    return SCENE_POOLS[normalizeCategory(category)];
}

function getSubjectPool(category) {
    const normalized = normalizeCategory(category);
    return SUBJECT_POOLS[normalized] || SUBJECT_POOLS.Default;
}

// -------------------------------------------------------------------------
// Content-stable visual fingerprint / seed
// -------------------------------------------------------------------------
function visualFingerprint(content, documentIdOverride) {
    const type = String(content?.type || content?.contentType || 'content').toLowerCase().trim();
    const documentId = String(
        documentIdOverride || content?.documentId || content?.contentId || content?.id || content?.jobId || ''
    ).trim();
    const slug = String(content?.slug || content?.slugId || content?.titleSlug || '').trim();
    const category = String(content?.category || 'Default').toLowerCase().trim();
    const title = String(content?.title || content?.name || content?.topic || '').trim();
    const publishDate = String(
        content?.publishDate || content?.publishedAt || content?.createdAt || content?.date || ''
    ).trim();

    const canonical = [type, documentId, slug, category, title, publishDate].join('::');
    const hash = crypto.createHash('sha256').update(canonical).digest('hex');
    const seed = parseInt(hash.substring(0, 8), 16) >>> 0;

    return {
        hash,
        seed,
        canonical,
        type,
        documentId,
        slug,
        category,
        title,
        publishDate,
        cacheKey: `ai-${hash.substring(0, 24)}`
    };
}

/**
 * Deterministic 32-bit hash of a string (used for pool selection).
 */
function hashInt(value) {
    let h = 0;
    const str = String(value || '');
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h, 31) + str.charCodeAt(i);
        h = h >>> 0;
    }
    return h >>> 0;
}

function pickOne(list, visualHash, key) {
    if (!Array.isArray(list) || list.length === 0) return '';
    const index = hashInt(`${key}:${visualHash}`) % list.length;
    return list[index];
}

function getVariantHash(baseFingerprint, variant) {
    if (variant <= 0) return baseFingerprint.hash;
    return crypto.createHash('sha256')
        .update(`${baseFingerprint.hash}:visual-variant:${variant}`)
        .digest('hex');
}

function buildVariantPlan(baseFingerprint, variant, placement) {
    const vHash = getVariantHash(baseFingerprint, variant);
    const seed = parseInt(vHash.substring(0, 8), 16) >>> 0;
    const category = normalizeCategory(baseFingerprint.category);

    const scene = pickOne(SCENE_POOLS[category] || SCENE_POOLS.Default, vHash, 'scene');
    const subject = pickOne(getSubjectPool(baseFingerprint.category), vHash, 'subject');
    const camera = pickOne(CAMERA_POOL, vHash, 'camera');
    const lighting = pickOne(LIGHTING_POOL, vHash, 'lighting');
    const mood = pickOne(MOOD_POOL, vHash, 'mood');
    const energy = pickOne(ENERGY_POOL, vHash, 'energy');
    const style = pickOne(STYLE_POOL, vHash, 'style');
    const depth = pickOne(DEPTH_POOL, vHash, 'depth');
    const presentation = pickOne(
        PRESENTATION_PROMPTS[placement] || PRESENTATION_PROMPTS.bottom,
        vHash,
        'presentation'
    );

    const combinationKey = [
        'ai-visual', category, scene, subject, camera, lighting, style, depth, mood, energy, seed, variant
    ].join('::');

    const prompt = [
        scene,
        subject,
        camera,
        lighting,
        mood,
        energy,
        style,
        depth,
        presentation,
        QUALITY_INSTRUCTIONS,
        NEGATIVE_INSTRUCTIONS
    ].join(', ');

    return {
        fingerprint: baseFingerprint,
        category,
        variant,
        seed,
        scene,
        subject,
        camera,
        lighting,
        mood,
        energy,
        style,
        depth,
        presentation,
        prompt,
        combinationKey,
        cacheKey: `ai-${baseFingerprint.hash.substring(0, 24)}-v${variant}`
    };
}

/**
 * Build a complete deterministic visual plan for a content item.
 *
 * - Same content + no recent history => always the same plan.
 * - If the primary combination was used recently, deterministically walk to
 *   the next variant until a fresh combination is found (or maxVariants).
 * - Never uses randomness, so retries reproduce the same plan.
 *
 * @param {object} content
 * @param {object} options { placement, recentVisualHistory, maxVariants }
 * @returns {object} visual plan
 */
function buildVisualPlan(content, options = {}) {
    const baseFingerprint = visualFingerprint(content, options.contentId || options.documentId);
    const recentHistory = Array.isArray(options.recentVisualHistory) ? options.recentVisualHistory : [];
    const maxVariants = Number.isFinite(options.maxVariants) ? options.maxVariants : 12;
    const placement = options.placement || 'bottom';
    // A content item may safely re-use its own previously generated visual
    // combination (this is the retry/cache-reuse case). Only OTHER recent
    // content should push this item to a different variant.
    const sameContentId = options.contentId || baseFingerprint.documentId || baseFingerprint.cacheKey;

    let lastPlan = buildVariantPlan(baseFingerprint, maxVariants, placement);
    for (let variant = 0; variant < maxVariants; variant++) {
        const plan = buildVariantPlan(baseFingerprint, variant, placement);
        lastPlan = plan;
        const collides = recentHistory.some((item) => {
            if (!item) return false;
            // A content item may safely re-use its own previously generated
            // combination (retry/cache-reuse). Only the recorded contentId
            // grants that exemption; a matching fingerprint alone must NOT,
            // because a different content with the same digest would otherwise
            // silently reuse another video's visual.
            if (sameContentId && item.contentId === sameContentId) {
                return false;
            }
            const combo = item.combination || item.combinationKey;
            if (combo && combo === plan.combinationKey) return true;
            if (item.scene && item.seed && item.scene === plan.scene && Number(item.seed) === plan.seed) {
                return true;
            }
            return false;
        });
        if (!collides) return plan;
    }
    return lastPlan;
}

/**
 * Backward-compatible prompt generator (now powered by the full visual scene
 * engine). Kept so existing callers/tests do not need to change.
 */
function generatePrompt(jobData, options = {}) {
    const plan = buildVisualPlan(jobData, options);
    return plan.prompt;
}

/**
 * Hash string for deterministic, Firestore-safe identifiers.
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    // Firestore document IDs must be non-empty strings. The raw hash is a
    // (possibly negative) number — convert to a string and sanitize it so it
    // is a valid Firestore document path.
    return `ai-${Math.abs(hash).toString(36)}`;
}

/**
 * Build a Pollinations image URL. Always includes the deterministic seed when
 * one is supplied so the same content gets the same image even across retries.
 */
function buildImageUrl(prompt, options = {}) {
    const width = options.width || 720;
    const height = options.height || 1280;
    let url = `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt || ''))}?width=${width}&height=${height}&nologo=true`;

    const seed = options.seed;
    if (seed !== undefined && seed !== null && Number.isFinite(Number(seed))) {
        url += `&seed=${Math.abs(Math.trunc(Number(seed)))}`;
    }
    if (options.model) {
        url += `&model=${encodeURIComponent(String(options.model))}`;
    }
    return url;
}

/**
 * Generate AI image using free/low-cost provider
 *
 * Currently supports:
 * - Pollinations.ai (free, no API key required)
 *
 * Fallback: returns null on failure
 */
async function generateImage(prompt, options = {}) {
    const timeout = options.timeout || 30000; // 30 seconds default
    const outputPath = options.outputPath;

    if (!outputPath) {
        throw new Error('outputPath is required');
    }

    try {
        // Pollinations.ai - free image generation
        const imageUrl = buildImageUrl(prompt, options);
        const httpClient = options.httpClient || axios;

        const response = await httpClient({
            method: 'GET',
            url: imageUrl,
            responseType: 'arraybuffer',
            timeout: timeout,
            maxContentLength: 5 * 1024 * 1024 // 5MB limit
        });

        // Validate image
        const buffer = Buffer.from(response.data);

        if (buffer.length < 1000) {
            throw new Error('Image too small, likely invalid');
        }

        // Check if it's actually an image (magic bytes)
        const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;

        if (!isJpeg && !isPng) {
            throw new Error('Response is not a valid image');
        }

        // Save to disk
        fs.writeFileSync(outputPath, buffer);

        return {
            success: true,
            path: outputPath,
            size: buffer.length,
            provider: 'pollinations',
            url: imageUrl,
            seed: options.seed !== undefined ? Number(options.seed) : null
        };

    } catch (err) {
        console.log(`⚠️ AI image generation failed: ${err.message || err}`);

        // Cleanup partial file if exists
        if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
        }

        return {
            success: false,
            error: err.message || 'Unknown error',
            provider: 'pollinations'
        };
    }
}

// Stable cache directory for AI images. On GitHub Actions the runner is
// ephemeral, but WITHIN a single workflow run the workspace + GITHUB_WORKSPACE
// path persists across all jobs/steps. We place cached images under a
// deterministic folder so retries within the same run can reuse them.
// Across runs the directory is gone — that is expected; the cache is a best-
// effort local fallback, with Firestore as the canonical cache record.
function getStableCacheDir() {
    const base = process.env.GITHUB_WORKSPACE || os.tmpdir();
    const dir = path.join(base, '.ai_visual_cache');
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
    }
    return dir;
}

/**
 * Return a deterministic, content-stable path for a cached AI image.
 * Two calls with the same contentId + fingerprint yield the same path,
 * so retries in the same run find the file that was written earlier.
 */
function getStableCachePath(contentId, fingerprint) {
    const dir = getStableCacheDir();
    const safe = String(contentId || 'unknown').replace(/[^a-z0-9_-]+/gi, '-').substring(0, 80);
    const safeFp = String(fingerprint || 'default').substring(0, 40);
    return path.join(dir, `ai-visual-${safe}-${safeFp}.jpg`);
}

/**
 * Get temporary path for AI image (kept for backward compatibility with
 * callers that generate a throwaway image without caching).
 */
function getTempImagePath(jobId) {
    const tempDir = os.tmpdir();
    const filename = `ai-visual-${jobId}-${Date.now()}.jpg`;
    return path.join(tempDir, filename);
}

/**
 * Validate a cached image file is usable: exists, non-empty, and a valid JPEG.
 * Returns true only when the file can safely be used as a poster background.
 */
function validateImage(imagePath) {
    if (!imagePath || typeof imagePath !== 'string') return false;
    if (!fs.existsSync(imagePath)) return false;
    try {
        const stat = fs.statSync(imagePath);
        if (!stat.isFile() || stat.size < 100) return false; // corrupted/empty
        // Quick header check — JPEG starts with FF D8
        const fd = fs.openSync(imagePath, 'r');
        const header = Buffer.alloc(2);
        fs.readSync(fd, header, 0, 2, 0);
        fs.closeSync(fd);
        return header[0] === 0xFF && header[1] === 0xD8;
    } catch {
        return false;
    }
}

/**
 * Cleanup AI image after render
 */
function cleanupImage(imagePath) {
    if (imagePath && fs.existsSync(imagePath)) {
        try {
            fs.unlinkSync(imagePath);
            console.log(`🧹 AI visual cleaned: ${path.basename(imagePath)}`);
        } catch (err) {
            console.log(`⚠️ AI visual cleanup failed: ${err.message || err}`);
        }
    }
}

module.exports = {
    SCENE_POOLS,
    SUBJECT_POOLS,
    CAMERA_POOL,
    LIGHTING_POOL,
    MOOD_POOL,
    ENERGY_POOL,
    STYLE_POOL,
    DEPTH_POOL,
    PRESENTATION_PROMPTS,
    QUALITY_INSTRUCTIONS,
    NEGATIVE_INSTRUCTIONS,
    CATEGORY_PROMPTS,
    STYLE_MODIFIERS,
    PLACEMENT_PROMPTS,
    normalizeCategory,
    getScenePool,
    getSubjectPool,
    visualFingerprint,
    hashInt,
    buildVariantPlan,
    isCombinationRecentlyUsed: (recentHistory, plan) => (recentHistory || []).some(
        (item) => item && ((item.combination || item.combinationKey) === plan.combinationKey)
    ),
    buildVisualPlan,
    generatePrompt,
    buildImageUrl,
    generateImage,
    getTempImagePath,
    getStableCachePath,
    getStableCacheDir,
    validateImage,
    cleanupImage,
    hashString
};

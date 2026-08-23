#!/usr/bin/env node
/**
 * video_dispatcher.js — 🎬 Firebase-billing-independent video dispatcher
 * =====================================================================
 * Runs on GitHub Actions (see .github/workflows/video_dispatcher.yml).
 *
 * Flow (NO Firebase Cloud Functions involved):
 *   Website / admin publishes → Firestore
 *   → this poller reads Firestore with SERVICE_ACCOUNT_JSON
 *   → finds pending JOB / FAST_TRACK / MOCK_TEST documents
 *   → atomically claims one (videoStatus: queued → processing)
 *   → runs the EXISTING renderer (autoVideo.js / mock_test_video.js) with FFmpeg
 *   → YouTube / Facebook / Telegram
 *   → marks the document completed / upload_failed / failed
 *
 * Works on the Firebase Spark plan: only Firestore is used, which the service
 * account can access without billing.
 *
 * CLI:
 *   node video_dispatcher.js                     # process all kinds
 *   node video_dispatcher.js --kind=job          # job | fast_track | mock_test | all
 *   node video_dispatcher.js --limit=2           # max videos this run (default 1)
 *   node video_dispatcher.js --dry-run           # report only, claim nothing
 *   node video_dispatcher.js --doc=<id>          # force one document (with --kind)
 *   node video_dispatcher.js --scan-limit=200    # Firestore read budget per kind
 *
 * Env (all from GitHub Secrets — never hardcode):
 *   SERVICE_ACCOUNT_JSON  (required)
 *   GMAIL_CREDENTIALS, YOUTUBE_TOKEN, YOUTUBE_TOKEN_SELF_TEST, TTS_KEY_JSON
 *   FB_PAGE_ID, FB_PAGE_TOKEN                (optional — Facebook skipped if absent)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID     (optional — Telegram skipped if absent)
 *   VIDEO_PRIVACY_STATUS=unlisted            (optional — safe testing, PART 24)
 *
 * Exit codes: 0 = success / nothing to do, 1 = at least one hard failure.
 */

'use strict';

const admin = require('firebase-admin');
require('dotenv').config();

const V = require('./video_state');
const { STATUS, KIND } = V;

// Known project for this deployment. Used so logs never echo a value read out
// of the service-account credentials.
const DEFAULT_PROJECT_ID = 'studymaterial-406ad';

/* ------------------------------------------------------------------ */
/* CLI parsing                                                         */
/* ------------------------------------------------------------------ */

/**
 * VIDEO_MAX_AGE_DAYS from the environment, with a safe default.
 * GitHub Actions passes an unset repo variable as an empty string (""), and
 * Number("") === 0 would silently DISABLE the freshness guard — so a blank
 * value must fall back to the built-in default instead.
 */
function envMaxAgeDays() {
    const raw = process.env.VIDEO_MAX_AGE_DAYS;
    if (raw === undefined || raw === null || String(raw).trim() === '') return V.DEFAULT_MAX_AGE_DAYS;
    const n = Number(raw);
    return Number.isFinite(n) ? n : V.DEFAULT_MAX_AGE_DAYS;
}

function parseArgs(argv) {
    const args = {
        kind: 'all',
        limit: Number(process.env.VIDEO_DISPATCH_LIMIT || 1),
        scanLimit: Number(process.env.VIDEO_SCAN_LIMIT || 150),
        dryRun: false,
        doc: '',
        maxAgeDays: envMaxAgeDays(),
        // 🗓️ Shorts cutoff: is date se pehle publish hue job/fast_track pe
        // shorts kabhi nahi (admin rule 23 Aug 2026). Env se override/disable:
        // VIDEO_SHORTS_CUTOFF=0 → disabled
        shortsCutoffMs: (() => {
            const raw = process.env.VIDEO_SHORTS_CUTOFF;
            if (raw === '0') return 0;
            const parsed = Date.parse(raw || '2026-08-23T00:00:00+05:30');
            return Number.isFinite(parsed) ? parsed : 0;
        })()
    };
    for (const raw of argv) {
        const [key, value] = raw.replace(/^--/, '').split('=');
        switch (key) {
            case 'kind': args.kind = (value || 'all').toLowerCase(); break;
            case 'limit': args.limit = Math.max(1, Number(value) || 1); break;
            case 'scan-limit': args.scanLimit = Math.max(10, Number(value) || 150); break;
            case 'max-age-days': args.maxAgeDays = Number(value); break;
            case 'dry-run': args.dryRun = value === undefined ? true : value !== 'false'; break;
            case 'doc': args.doc = value || ''; break;
            default: break;
        }
    }
    if (!Number.isFinite(args.maxAgeDays)) args.maxAgeDays = V.DEFAULT_MAX_AGE_DAYS;
    return args;
}

const KIND_ALIASES = {
    job: KIND.JOB,
    jobs: KIND.JOB,
    fast_track: KIND.FAST_TRACK,
    fasttrack: KIND.FAST_TRACK,
    'fast-track': KIND.FAST_TRACK,
    mock_test: KIND.MOCK_TEST,
    mocktest: KIND.MOCK_TEST,
    'mock-test': KIND.MOCK_TEST,
    mock_tests: KIND.MOCK_TEST
};

function resolveKinds(kindArg) {
    if (!kindArg || kindArg === 'all') return [KIND.JOB, KIND.FAST_TRACK, KIND.MOCK_TEST];
    const resolved = kindArg
        .split(',')
        .map((part) => KIND_ALIASES[part.trim().toLowerCase()])
        .filter(Boolean);
    if (resolved.length === 0) throw new Error(`Unknown --kind value: ${kindArg}`);
    return [...new Set(resolved)];
}

/* ------------------------------------------------------------------ */
/* Firebase init                                                       */
/* ------------------------------------------------------------------ */

function initFirebase() {
    if (admin.apps.length) return admin.firestore();

    const raw = process.env.SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        throw new Error('SERVICE_ACCOUNT_JSON secret missing — dispatcher cannot read Firestore.');
    }

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(raw);
    } catch (err) {
        throw new Error('SERVICE_ACCOUNT_JSON is not valid JSON (check the GitHub Secret value).');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || DEFAULT_PROJECT_ID
    });

    // Log a fixed, known-safe identifier rather than anything read out of the
    // parsed service account. project_id itself is harmless, but echoing any
    // field of a credentials object into logs is the pattern that leaks keys
    // when someone later widens it (CodeQL js/clear-text-logging).
    const projectLabel = serviceAccount.project_id === DEFAULT_PROJECT_ID
        ? DEFAULT_PROJECT_ID
        : '(from service account)';
    console.log(`✅ Firebase Admin ready (project: ${projectLabel})`);
    return admin.firestore();
}

/* ------------------------------------------------------------------ */
/* Candidate scanning                                                  */
/* ------------------------------------------------------------------ */

/**
 * Read a bounded slice of a collection and return eligible candidates.
 * Ordering by createdAt is attempted first (newest content matters most);
 * if the index/field is missing we fall back to an unordered bounded read so a
 * temporary Firestore configuration problem never silently skips everything.
 */
async function scanCollection(db, kind, opts) {
    const collection = V.COLLECTION_BY_KIND[kind];
    const limit = opts.scanLimit;

    let snapshot;
    let orderedRead = true;
    try {
        snapshot = await db.collection(collection).orderBy('createdAt', 'desc').limit(limit).get();
        if (snapshot.empty) {
            orderedRead = false;
            snapshot = await db.collection(collection).limit(limit).get();
        }
    } catch (err) {
        console.log(`ℹ️ [${kind}] ordered read unavailable (${V.shortError(err, 120)}) — falling back to unordered scan`);
        orderedRead = false;
        snapshot = await db.collection(collection).limit(limit).get();
    }

    const candidates = [];
    const skipped = [];

    snapshot.docs.forEach((doc) => {
        const data = doc.data() || {};
        const verdict = V.evaluateCandidate(kind, data, opts);
        if (verdict.eligible) {
            candidates.push({ kind, collection, ref: doc.ref, id: doc.id, data });
        } else {
            skipped.push({ id: doc.id, title: data.title || data.subject || '(untitled)', reason: verdict.reason });
        }
    });

    // Retry-first ordering: previously failed (but not permanently) docs first,
    // then newest content. Keeps the queue moving without starving retries.
    candidates.sort((a, b) => {
        const aRetry = a.data.videoStatus === STATUS.FAILED || a.data.videoStatus === STATUS.UPLOAD_FAILED ? 1 : 0;
        const bRetry = b.data.videoStatus === STATUS.FAILED || b.data.videoStatus === STATUS.UPLOAD_FAILED ? 1 : 0;
        if (aRetry !== bRetry) return bRetry - aRetry;
        return V.publishedAtMs(b.data) - V.publishedAtMs(a.data);
    });

    console.log(`🔎 [${kind}] scanned ${snapshot.size} docs (${orderedRead ? 'ordered' : 'unordered'}) → ${candidates.length} pending`);
    if (candidates.length === 0 && skipped.length > 0) {
        skipped.slice(0, 5).forEach((s) => console.log(`   ⏭️ ${s.id} — ${s.title} — ${s.reason}`));
        if (skipped.length > 5) console.log(`   ⏭️ …and ${skipped.length - 5} more skipped`);
    }

    return candidates;
}

/* ------------------------------------------------------------------ */
/* Payload builders (match the existing repository_dispatch shape)     */
/* ------------------------------------------------------------------ */

function toStr(value) {
    return value === undefined || value === null ? '' : String(value);
}

function buildJobPayload(id, data) {
    return {
        id: toStr(id),
        slug: toStr(data.slug || id),
        title: toStr(data.title || 'Latest Govt Job'),
        category: toStr(data.category || 'Default'),
        type: 'JOB',
        startDate: toStr(data.startDate),
        lastDate: toStr(data.lastDate),
        updateDate: toStr(data.updateDate),
        organization: toStr(data.organization || data.org),
        vacancies: toStr(data.vacancies || data.totalVacancies)
    };
}

function buildFastTrackPayload(id, data) {
    return {
        id: toStr(id),
        slug: toStr(data.slug || id),
        title: toStr(data.title || 'Fast Track Update'),
        category: toStr(data.category || 'Default'),
        type: 'FAST_TRACK',
        updateDate: toStr(data.updateDate),
        organization: toStr(data.org || data.organization),
        directLink: toStr(data.directLink),
        shortInfo: toStr(data.shortInfo)
    };
}

/* ------------------------------------------------------------------ */
/* Processing                                                          */
/* ------------------------------------------------------------------ */

async function processJobLike(candidate, ctx) {
    const { kind, ref, id, data } = candidate;
    const payload = kind === KIND.JOB ? buildJobPayload(id, data) : buildFastTrackPayload(id, data);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🎬 ${kind} | doc=${id}`);
    console.log(`   title   : ${payload.title}`);
    console.log(`   slug    : ${payload.slug}`);
    console.log(`   category: ${payload.category}`);
    console.log(`${'─'.repeat(60)}`);

    // autoVideo.js is required lazily so a missing media dependency cannot break
    // the dispatcher's reporting for the other pipelines.
    const { generateAndUploadVideo } = require('./autoVideo');

    const result = await generateAndUploadVideo(payload, {
        db: ctx.db,
        admin,
        docRef: ref,
        collection: candidate.collection,
        managedState: true,
        privacyStatus: ctx.privacyStatus
    });

    // generateAndUploadVideo returns true (legacy) or a detail object.
    const detail = typeof result === 'object' && result !== null ? result : { success: result === true };
    if (detail.success) {
        console.log(`✅ ${kind} ${id} → ${detail.videoUrl || 'video uploaded'}`);
        return { ok: true, videoId: detail.videoId, videoUrl: detail.videoUrl };
    }

    const error = detail.error || 'Video engine returned failure';
    console.error(`❌ ${kind} ${id} failed: ${error}`);
    return { ok: false, error, uploadFailed: detail.uploadFailed === true };
}

async function processMockTest(candidate, ctx) {
    const { ref, id, data } = candidate;
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🎬 MOCK_TEST | doc=${id}`);
    console.log(`   title    : ${data.title || data.subject || '(untitled)'}`);
    console.log(`   questions: ${Array.isArray(data.questions) ? data.questions.length : 0}`);
    console.log(`${'─'.repeat(60)}`);

    const { generateMockTestVideo } = require('./mock_test_video');

    const result = await generateMockTestVideo({
        docId: id,
        docRef: ref,
        docData: data,
        managedState: true,
        privacyStatus: ctx.privacyStatus
    });

    const detail = typeof result === 'object' && result !== null ? result : { success: result === true };
    if (detail.success) {
        console.log(`✅ MOCK_TEST ${id} → ${detail.videoUrl || 'video uploaded'}`);
        return { ok: true, videoId: detail.videoId, videoUrl: detail.videoUrl };
    }

    const error = detail.error || 'Mock test engine returned failure';
    console.error(`❌ MOCK_TEST ${id} failed: ${error}`);
    return { ok: false, error, uploadFailed: detail.uploadFailed === true };
}

async function processCandidate(candidate, ctx) {
    const { kind, collection, ref, id } = candidate;

    const claimResult = await V.claim(ctx.db, admin, kind, ref, {
        runId: ctx.runId,
        worker: 'github-dispatcher',
        maxAgeDays: ctx.maxAgeDays,
        shortsCutoffMs: ctx.shortsCutoffMs
    });

    if (!claimResult.claimed) {
        console.log(`⏭️ [${kind}] ${id} not claimed — ${claimResult.reason}`);
        return { status: 'skipped', kind, id, reason: claimResult.reason };
    }

    console.log(`🔒 [${kind}] ${id} claimed (attempt ${claimResult.attempts}) by ${ctx.runId}`);

    try {
        const outcome = kind === KIND.MOCK_TEST
            ? await processMockTest(candidate, ctx)
            : await processJobLike(candidate, ctx);

        if (outcome.ok) {
            await V.markCompleted(ctx.db, admin, collection, ref, {
                videoId: outcome.videoId,
                videoUrl: outcome.videoUrl,
                extra: kind === KIND.MOCK_TEST ? { mockVideoMade: true } : {}
            });
            return { status: 'completed', kind, id, videoUrl: outcome.videoUrl };
        }

        await V.markFailed(ctx.db, admin, collection, ref, outcome.error, {
            uploadFailed: outcome.uploadFailed
        });
        return { status: outcome.uploadFailed ? 'upload_failed' : 'failed', kind, id, error: outcome.error };

    } catch (err) {
        console.error(`💥 [${kind}] ${id} threw: ${V.shortError(err)}`);
        if (err && err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
        await V.markFailed(ctx.db, admin, collection, ref, err).catch(() => {});
        return { status: 'failed', kind, id, error: V.shortError(err) };
    }
}

/* ------------------------------------------------------------------ */
/* Automation guard (PART 11)                                          */
/* ------------------------------------------------------------------ */

async function guardFor(db, kind) {
    const feature = kind === KIND.MOCK_TEST ? 'mock_test' : 'video_maker';
    try {
        const { isAutomationEnabled } = require('./agents/automation_guard');
        const result = await isAutomationEnabled(db, feature);
        return { enabled: result.enabled !== false, reason: result.reason, feature };
    } catch (err) {
        // Fail-safe with a loud log — never silently disable everything.
        console.log(`⚠️ automation_guard check failed for ${feature}: ${V.shortError(err, 140)} — continuing (fail-open)`);
        return { enabled: true, reason: 'guard unavailable (fail-open)', feature };
    }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const kinds = resolveKinds(args.kind);
    const runId = process.env.GITHUB_RUN_ID
        ? `gh-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
        : `local-${Date.now()}`;

    console.log('='.repeat(60));
    console.log('🎬 StudyGyaan Video Dispatcher (GitHub Actions · no Firebase billing)');
    console.log(`   run id     : ${runId}`);
    console.log(`   kinds      : ${kinds.join(', ')}`);
    console.log(`   limit      : ${args.limit} video(s) this run`);
    console.log(`   scan limit : ${args.scanLimit} docs per collection`);
    console.log(`   backlog    : ${args.maxAgeDays > 0 ? args.maxAgeDays + ' days' : 'disabled'}`);
    console.log(`   dry run    : ${args.dryRun}`);
    console.log('='.repeat(60));

    const db = initFirebase();
    const ctx = {
        db,
        runId,
        maxAgeDays: args.maxAgeDays,
        shortsCutoffMs: args.shortsCutoffMs,
        privacyStatus: process.env.VIDEO_PRIVACY_STATUS || ''
    };
    if (ctx.privacyStatus) console.log(`ℹ️ YouTube privacy override: ${ctx.privacyStatus}`);

    const results = [];
    let produced = 0;

    // YouTube allows ~5 uploads/day on the default API quota. Stop before
    // burning runner time on renders that would fail at the upload step (and
    // would consume each document's retry budget for no reason).
    const maxPerDay = V.dailyLimit();
    let uploadedToday = args.dryRun ? 0 : await V.getDailyCount(db);
    if (!args.dryRun && uploadedToday >= maxPerDay) {
        console.log(`\n🛑 Daily YouTube budget reached (${uploadedToday}/${maxPerDay}).`);
        console.log('   Baaki content agle din automatically process ho jayega.');
        console.log('   (VIDEO_DAILY_LIMIT repo variable se badal sakte ho)');
        console.log(`\n${'='.repeat(60)}`);
        return 0;
    }
    if (!args.dryRun) console.log(`📊 Today's uploads: ${uploadedToday}/${maxPerDay}`);

    // A dry run renders nothing, so the limit must not stop it from reporting.
    // Surveying every pipeline is the whole point of --dry-run.
    const surveyOnly = args.dryRun === true;

    for (const kind of kinds) {
        if (!surveyOnly && produced >= args.limit) {
            console.log(`\n🛑 Limit of ${args.limit} video(s) reached — remaining kinds deferred to the next run.`);
            break;
        }

        const guard = await guardFor(db, kind);
        if (!guard.enabled) {
            console.log(`\n⏸️ [${kind}] paused by automation guard (${guard.feature}): ${guard.reason}`);
            results.push({ status: 'paused', kind, reason: guard.reason });
            continue;
        }

        let candidates;
        try {
            if (args.doc) {
                const ref = db.collection(V.COLLECTION_BY_KIND[kind]).doc(args.doc);
                const snap = await ref.get();
                if (!snap.exists) {
                    console.log(`⚠️ [${kind}] --doc=${args.doc} not found in ${V.COLLECTION_BY_KIND[kind]}`);
                    results.push({ status: 'skipped', kind, id: args.doc, reason: 'document not found' });
                    continue;
                }
                candidates = [{ kind, collection: V.COLLECTION_BY_KIND[kind], ref, id: snap.id, data: snap.data() || {} }];
            } else {
                candidates = await scanCollection(db, kind, {
                    scanLimit: args.scanLimit,
                    maxAgeDays: args.maxAgeDays,
                    shortsCutoffMs: args.shortsCutoffMs
                });
            }
        } catch (err) {
            // Firestore unreachable / permission problem: fail loudly, never pretend "nothing to do".
            console.error(`❌ [${kind}] Firestore scan failed: ${V.shortError(err)}`);
            results.push({ status: 'error', kind, error: V.shortError(err) });
            continue;
        }

        // In a dry run show what the next few real runs would pick up, in order.
        let shownForKind = 0;

        for (const candidate of candidates) {
            if (!surveyOnly && produced >= args.limit) break;

            if (args.dryRun) {
                if (shownForKind >= args.limit) {
                    const rest = candidates.length - shownForKind;
                    if (rest > 0) console.log(`   …and ${rest} more ${kind} pending (queued for later runs)`);
                    break;
                }
                console.log(`🧪 [dry-run] would process ${kind} ${candidate.id} — ${candidate.data.title || candidate.data.subject || '(untitled)'}`);
                results.push({ status: 'dry-run', kind, id: candidate.id });
                shownForKind += 1;
                produced += 1;
                continue;
            }

            const outcome = await processCandidate(candidate, ctx);
            results.push(outcome);
            if (outcome.status !== 'skipped') produced += 1;

            if (outcome.status === 'completed') {
                await V.recordUpload(db, admin);
                uploadedToday += 1;
                if (uploadedToday >= maxPerDay) {
                    console.log(`\n🛑 Daily YouTube budget reached (${uploadedToday}/${maxPerDay}) — rukte hain.`);
                    break;
                }
            }
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 DISPATCHER SUMMARY');
    if (results.length === 0) {
        console.log('   nothing pending — all content already has videos ✅');
    } else {
        results.forEach((r) => {
            const label = `${r.kind || '-'}${r.id ? '/' + r.id : ''}`;
            const extra = r.videoUrl || r.error || r.reason || '';
            console.log(`   ${r.status.toUpperCase().padEnd(14)} ${label}${extra ? ' — ' + extra : ''}`);
        });
    }
    console.log('='.repeat(60));

    const hardFailures = results.filter((r) => r.status === 'failed' || r.status === 'upload_failed' || r.status === 'error');
    return hardFailures.length === 0 ? 0 : 1;
}

module.exports = {
    parseArgs,
    envMaxAgeDays,
    resolveKinds,
    buildJobPayload,
    buildFastTrackPayload,
    scanCollection,
    main
};

if (require.main === module) {
    main()
        .then((code) => process.exit(code))
        .catch((err) => {
            console.error('💥 Dispatcher fatal error:', V.shortError(err));
            if (err && err.stack) console.error(err.stack);
            process.exit(1);
        });
}

/**
 * auto_drafts.js — 🌅 ROZ SUBAH AUTO-DRAFTS MACHINE
 * ===================================================
 * Roz subah (ya manually trigger pe) system khud:
 *   1. job_drafts + fast_track drafts me se FRESH candidates chunta hai
 *   2. unke official source se AI article DRAFT banata hai (publish KABHI
 *      khud nahi — draft tak hi, guarantee)
 *   3. Telegram pe approve-card bhej deta hai — admin sirf ✅ dabaye
 *
 * Duplicate-protection built-in:
 *   - Jo title published jobs/fast_track me pehle se hai → source draft ko
 *     waheen DELETE kar diya jata hai (queue saaf rehti hai, loops nahi).
 *   - Jis item se auto-draft ban chuka → uspe `aiDrafted` mark (dobara nahi).
 *   - Fetch fail temp-error pe `aiDraftTries` counter — 3 tries ke baad skip.
 *
 * Deps injectable hain — unit tests me mocks lag jaate hain.
 */

const { overlapsAny } = require("./agents/article_agents/title_utils");
const { plainText } = require("./agents/article_agents/article_html_utils");
const { splitReviewIssues } = require("./agents/article_agents/article_repairer");

const JOBS_DRAFTS = "job_drafts";
const FAST_TRACK = "fast_track";
const DEFAULT_MAX_PER_RUN = 2;
const MAX_TRIES = 5;                 // create-side tries (cooldown ke beech)
// ⏱️ "jab tak thik na ho" retry machine — env se tune hoti hai:
//   AI_RETRY_COOLDOWN_MIN  → har retry ke beech ka gap (default 10 min)
//   AI_REPAIR_MAX_TRIES    → ek draft pe max repair cycles (default 20;
//                            har cycle me pipeline khud 3 writer-attempts leti hai)
const RETRY_COOLDOWN_MS = Math.max(2, Number(process.env.AI_RETRY_COOLDOWN_MIN) || 10) * 60 * 1000;
const REPAIR_MAX_TRIES = Math.max(1, Number(process.env.AI_REPAIR_MAX_TRIES) || 20);
const REPAIR_SCAN_LIMIT = 40;

/**
 * ⏱️ Kya ye item ABHI-ABHI try hua hai? (har 5-10 min me hi retry — user rule)
 * aiDraftLastTryAt ISO string ya Firestore timestamp dono chalta hai.
 */
function lastTryTooRecent(data) {
    const raw = data && data.aiDraftLastTryAt;
    if (!raw) return false;
    let ms = NaN;
    if (typeof raw === "object" && typeof raw.toDate === "function") ms = raw.toDate().getTime();
    else if (typeof raw === "object" && typeof raw.seconds === "number") ms = raw.seconds * 1000;
    else ms = new Date(raw).getTime();
    return Number.isFinite(ms) && (Date.now() - ms) < RETRY_COOLDOWN_MS;
}

// Apply-form portals — inhe source URL mat banao (digialm/eforms wagera)
const FORM_PORTAL_HINTS = [
    /digialm/i, /eforms/i, /onlineregistration/i,
    /form/i, /registrations?[\/.]/i, /cbexams\.com\/[A-Z]+\/register/i
];
function isFormPortalUrl(url) {
    return !!url && FORM_PORTAL_HINTS.some((re) => re.test(url));
}

/** job_drafts doc se best source URL (non-form pehle). */
function pickJobDraftUrl(data) {
    const candidates = [data.sourceUrl, data.officialLink, data.notificationLink, data.applyLink, data.link]
        .map(v => String(v || "").trim())
        .filter(v => /^https:\/\//i.test(v));
    return candidates.find(u => !isFormPortalUrl(u)) || candidates[0] || "";
}

// ---------------------------------------------------------------------------
// 🎯 Candidates selection (+ published twins ka auto-cleanup)
// ---------------------------------------------------------------------------
async function pickAutoDraftCandidates(db, options) {
    const maxItems = Math.max(1, Number(options && options.limit) || DEFAULT_MAX_PER_RUN);
    const report = { candidates: [], cleaned: [], errors: [] };

    // Published titles (duplicate shield) — dono target collections
    const publishedTitles = { jobs: [], fast_track: [] };
    try {
        const jobsPub = await db.collection("jobs").orderBy("createdAt", "desc").limit(80).get();
        jobsPub.forEach(d => publishedTitles.jobs.push(d.data().title || ""));
        const ftPub = await db.collection(FAST_TRACK).orderBy("createdAt", "desc").limit(80).get();
        ftPub.forEach(d => {
            const data = d.data();
            if (String(data.status || "").toLowerCase() !== "draft") {
                publishedTitles.fast_track.push(data.title || "");
            }
        });
    } catch (error) {
        report.errors.push(`published-scan: ${error.message}`);
    }

    const maybeCleanup = async (collectionName, docId, title) => {
        const pool = collectionName === JOBS_DRAFTS ? publishedTitles.jobs : publishedTitles.fast_track;
        const dup = overlapsAny(title, pool);
        if (dup.dup) {
            try {
                await db.collection(collectionName).doc(docId).delete();
                report.cleaned.push(`${collectionName}/${docId}`);
                return true;
            } catch (error) {
                report.errors.push(`cleanup/${collectionName}/${docId}: ${error.message}`);
            }
        }
        return false;
    };

    // ----- job_drafts -----
    try {
        const snap = await db.collection(JOBS_DRAFTS).orderBy("createdAt", "desc").limit(25).get();
        for (const docSnap of snap.docs) {
            if (report.candidates.length >= maxItems) break;
            const data = docSnap.data();
            if (data.aiDrafted === true) continue;
            if (Number(data.aiDraftTries || 0) >= MAX_TRIES) continue;
            if (lastTryTooRecent(data)) continue; // ⏱️ 10 min cooldown
            const title = plainText(String(data.title || "")).trim();
            if (title.length < 10) continue;
            if (await maybeCleanup(JOBS_DRAFTS, docSnap.id, title)) continue;
            report.candidates.push({
                collection: JOBS_DRAFTS,
                id: docSnap.id,
                type: "job",
                title,
                organization: String(data.organization || ""),
                category: String(data.category || ""),
                sourceUrl: pickJobDraftUrl(data)
            });
        }
    } catch (error) {
        report.errors.push(`job_drafts-scan: ${error.message}`);
    }

    // ----- fast_track drafts -----
    try {
        const snap = await db.collection(FAST_TRACK).orderBy("createdAt", "desc").limit(25).get();
        for (const docSnap of snap.docs) {
            if (report.candidates.length >= maxItems) break;
            const data = docSnap.data();
            if (String(data.status || "draft").toLowerCase() !== "draft") continue;
            if (data.aiDrafted === true) continue;
            if (Number(data.aiDraftTries || 0) >= MAX_TRIES) continue;
            if (lastTryTooRecent(data)) continue; // ⏱️ 10 min cooldown
            const title = plainText(String(data.title || "")).trim();
            if (title.length < 10) continue;
            if (await maybeCleanup(FAST_TRACK, docSnap.id, title)) continue;
            report.candidates.push({
                collection: FAST_TRACK,
                id: docSnap.id,
                type: "fast-track",
                title,
                organization: String(data.org || data.organization || ""),
                category: String(data.category || ""),
                sourceUrl: /^https:\/\//i.test(String(data.directLink || "")) ? String(data.directLink) : ""
            });
        }
    } catch (error) {
        report.errors.push(`fast_track-scan: ${error.message}`);
    }

    report.candidates = report.candidates.slice(0, maxItems);
    return report;
}

// ---------------------------------------------------------------------------
// 🧠 Ek candidate process karo
// ---------------------------------------------------------------------------
async function processCandidate(db, FieldValue, candidate, deps) {
    // 1) Source laao: direct URL → fail ho to internet-search fallback
    let source = null;
    let resolvedVia = "";
    if (candidate.sourceUrl) {
        try {
            source = await deps.fetchAndExtractSource(candidate.sourceUrl);
            resolvedVia = "direct";
        } catch (error) {
            console.warn(`auto-draft ${candidate.id}: direct fetch fail (${error.code || ""}): ${error.message}`);
        }
    }
    if (!source) {
        const query = `${candidate.title} ${candidate.organization}`.trim();
        source = await deps.searchAndFetchSource(query); // throws agar na mile
        resolvedVia = "search";
    }

    // 2) Duplicate-content context
    const cleanType = deps.cleanType;
    const existing = await deps.collectExistingContent(db, cleanType(candidate.type));

    // 3) Adaptive grounded pipeline in production; tests/legacy callers can
    // still inject the single pipeline. Either way mode:auto remains draft-only.
    const generateDraft = deps.runAdaptivePipeline || deps.runGeneratePipeline;
    const draft = await generateDraft({
        type: cleanType(candidate.type),
        sourceUrl: source.url,
        instructions: "",
        mode: "auto",
        source,
        existing
    });

    // 4) Draft save + origin mark
    const nowIso = new Date().toISOString();
    const payload = {
        ...draft,
        autoDraft: true,
        originRef: { collection: candidate.collection, id: candidate.id },
        autoResolvedVia: resolvedVia,
        aiDraftLastTryAt: nowIso, // ⏱️ repair cooldown yahin se shuru
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    };
    const ref = await db.collection(deps.DRAFT_COLLECTION).add(payload);
    await db.collection(candidate.collection).doc(candidate.id).set(
        { aiDrafted: true, aiDraftId: ref.id, aiDraftLastTryAt: nowIso },
        { merge: true }
    );

    // 5) Telegram — SIRF ready-to-publish pe (reviewStatus === 'passed')
    // Failed pe bilkul nahi — auto-repair machine har ~10 min me retry karegi
    const verdict = String(draft.reviewReport?.verdict || '').toLowerCase();
    const isDraftReady = (draft.reviewStatus === 'passed' || verdict === 'pass') && draft.reviewStale !== true && draft.publishBlocked !== true;
    if (isDraftReady && deps.notifyDraft && deps.creds) {
        await deps.notifyDraft(null, deps.creds, draft, ref.id, {
            label: "🌅 AUTO DRAFT READY",
            withButtons: deps.withButtons !== false
        }).catch(e => console.warn("auto-draft telegram:", e.message));
    } else {
        console.log(`[auto-draft] ${ref.id} not ready (reviewStatus=${draft.reviewStatus}) — telegram skipped, will auto-retry when ready`);
    }

    return { draftId: ref.id, resolvedVia, title: draft.title || candidate.title };
}

/** Mark failed try (MAX_TRIES ke baad item chhod diya jayega) + retry cooldown. */
async function markTryFailed(db, candidate, message) {
    try {
        await db.collection(candidate.collection).doc(candidate.id).set(
            {
                aiDraftTries: (Number(candidate.aiDraftTries) || 0) + 1,
                aiDraftLastError: String(message || "").slice(0, 200),
                aiDraftLastTryAt: new Date().toISOString()
            },
            { merge: true }
        );
    } catch {/* best-effort */}
}

/** Not-ready draft ki repair-fail mark (tries + cooldown). */
async function markRepairFailed(db, deps, draftId, current, message) {
    try {
        await db.collection(deps.DRAFT_COLLECTION).doc(draftId).set(
            {
                autoRepairTries: Number(current && current.autoRepairTries || 0) + 1,
                aiDraftLastError: String(message || "").slice(0, 200),
                aiDraftLastTryAt: new Date().toISOString()
            },
            { merge: true }
        );
    } catch {/* best-effort */}
}

// ---------------------------------------------------------------------------
// 🔧 REPAIR LOOP — jo draft "ready for publish" (reviewStatus:"passed") nahi
//    hua, use har retry-cycle me regenerate karo (pichli review issues ke saath)
// ---------------------------------------------------------------------------
async function pickRepairCandidates(db, deps, options) {
    const maxItems = Math.max(1, Number(options && options.limit) || 1);
    const report = { repairs: [], errors: [] };
    let snap;
    try {
        snap = await db.collection(deps.DRAFT_COLLECTION)
            .orderBy("createdAt", "desc")
            .limit(REPAIR_SCAN_LIMIT)
            .get();
    } catch (error) {
        report.errors.push(`repair-scan: ${error.message}`);
        return report;
    }
    for (const docSnap of snap.docs) {
        if (report.repairs.length >= maxItems) break;
        const data = docSnap.data();
        if (data.status === "published") continue;
        const ready = data.reviewStatus === "passed" && data.reviewStale !== true;
        if (ready) continue;                                        // ✅ ready — admin ka ✅ pending
        if (Number(data.autoRepairTries || 0) >= REPAIR_MAX_TRIES) continue;
        if (lastTryTooRecent(data)) continue;                       // ⏱️ cooldown gap
        if (!data.sourceUrl) continue;                              // regenerate ke liye source zaroori
        // ⭐ FATAL issues (duplicate/expired/speculative) retry se KABHI theek
        // nahi honge — unpe Gemini quota jalana bekaar hai. Writer-fixable
        // issues wale drafts hi repair queue me aate hain.
        const issues = Array.isArray(data.reviewReport && data.reviewReport.issues)
            ? data.reviewReport.issues
            : [];
        if (issues.length && splitReviewIssues(issues).fatal.length) continue;
        report.repairs.push(docSnap);
    }
    return report;
}

async function processRepair(db, FieldValue, docSnap, deps) {
    const current = docSnap.data();
    const draftId = docSnap.id;
    const type = deps.cleanType(current.articleType || (current.type === "JOB" ? "job" : "fast-track"));

    // Source: fresh fetch → snapshot → search (teen darwaze)
    let source = null;
    let resolvedVia = "";
    try {
        source = await deps.fetchAndExtractSource(current.sourceUrl);
        resolvedVia = "direct";
    } catch (fetchErr) {
        console.warn(`auto-repair ${draftId}: refetch fail (${fetchErr.code || ""}): ${fetchErr.message}`);
        if (current.sourceSnapshot) {
            source = { url: current.sourceUrl, ...current.sourceSnapshot };
            resolvedVia = "snapshot";
        }
        if (!source) {
            source = await deps.searchAndFetchSource(String(current.title || "").trim());
            resolvedVia = "search";
        }
    }
    if (!source || !source.text) {
        throw new Error("repair ke liye source material nahi mila");
    }

    const existing = await deps.collectExistingContent(db, type, { excludeDraftId: draftId });
    // ⭐ REGENERATE feedback loop — pichli failed review ke issues writer tak
    const feedbackIssues = current.reviewReport && Array.isArray(current.reviewReport.issues)
        ? current.reviewReport.issues
        : undefined;
    const generateDraft = deps.runAdaptivePipeline || deps.runGeneratePipeline;
    const fresh = await generateDraft({
        type,
        sourceUrl: current.sourceUrl,
        instructions: current.instructions || "",
        mode: "auto",
        source,
        existing,
        feedbackIssues
    });

    await db.collection(deps.DRAFT_COLLECTION).doc(draftId).set(
        {
            ...fresh,
            autoRepaired: true,
            autoRepairTries: Number(current.autoRepairTries || 0) + 1,
            aiDraftLastTryAt: new Date().toISOString(),
            version: Number(current.version || 1) + 1,
            updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
    );

    const ready = fresh.reviewStatus === "passed";
    if (ready && deps.notifyDraft && deps.creds) {
        await deps.notifyDraft(null, deps.creds, fresh, draftId, {
            label: "🔧 AUTO-REPAIR READY",
            withButtons: deps.withButtons !== false
        }).catch(e => console.warn("auto-repair telegram:", e.message));
    }
    return { draftId, ready, resolvedVia, title: fresh.title || current.title };
}

// ---------------------------------------------------------------------------
// 🏃 Main runner — 🔧 repairs pehle, 🌅 naye drafts baad me
// ---------------------------------------------------------------------------
async function runAutoDrafts(db, FieldValue, deps) {
    const report = { repaired: [], ready: [], created: [], skipped: [], cleaned: [], errors: [] };

    // 🔧 Phase 1: not-ready drafts ko retry karo (jab tak ready for publish na ho)
    const repairs = await pickRepairCandidates(db, deps, { limit: deps.repairLimit || 1 });
    report.errors.push(...repairs.errors);
    for (const docSnap of repairs.repairs) {
        try {
            const result = await processRepair(db, FieldValue, docSnap, deps);
            report.repaired.push(
                `${docSnap.id.slice(0, 14)}… → ${String(result.title).slice(0, 55)} (${result.ready ? "✅ READY" : "retry pending"}, ${result.resolvedVia})`
            );
            if (result.ready) report.ready.push(docSnap.id);
        } catch (error) {
            await markRepairFailed(db, deps, docSnap.id, docSnap.data(), error.message);
            report.skipped.push(`repair ${docSnap.id.slice(0, 12)}… — ${String(error.message || error).slice(0, 120)}`);
        }
    }

    // 🌅 Phase 2: fresh candidates se naye drafts banao
    const picked = await pickAutoDraftCandidates(db, { limit: deps.limit || DEFAULT_MAX_PER_RUN });
    report.cleaned.push(...picked.cleaned);
    report.errors.push(...picked.errors);

    for (const candidate of picked.candidates) {
        try {
            const result = await processCandidate(db, FieldValue, candidate, deps);
            report.created.push(`${candidate.collection}/${candidate.id} → ${result.title.slice(0, 60)}… (${result.resolvedVia})`);
        } catch (error) {
            await markTryFailed(db, candidate, error.message);
            report.skipped.push(`${candidate.title.slice(0, 50)}… — ${String(error.message || error).slice(0, 120)}`);
        }
    }
    return report;
}

/** Production deps assemble karke job chalao (scheduled/trigger se). */
async function runAutoDraftsJob(db, FieldValue, options) {
    const pipeline = require("./agents/article_agents/article_pipeline");
    const adaptive = require("./agents/article_agents/adaptive_article_orchestrator");
    const fetcher = require("./agents/article_agents/source_fetcher");
    const searcher = require("./agents/article_agents/web_searcher");
    const routes = require("./agents/article_agents/article_routes");
    const bot = require("./telegram_draft_bot");

    const deps = {
        runGeneratePipeline: pipeline.runGeneratePipeline,
        runAdaptivePipeline: adaptive.runAdaptivePipeline,
        fetchAndExtractSource: fetcher.fetchAndExtractSource,
        searchAndFetchSource: searcher.searchAndFetchSource,
        collectExistingContent: routes.collectExistingContent,
        cleanType: pipeline.cleanType,
        DRAFT_COLLECTION: pipeline.DRAFT_COLLECTION,
        notifyDraft: bot.notifyDraft,
        creds: bot.adminCredsFromEnv(),
        withButtons: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID),
        limit: (options && options.limit) || DEFAULT_MAX_PER_RUN,
        repairLimit: (options && options.repairLimit) || 1
    };
    return runAutoDrafts(db, FieldValue, deps);
}

module.exports = {
    isFormPortalUrl,
    pickJobDraftUrl,
    pickAutoDraftCandidates,
    processCandidate,
    pickRepairCandidates,
    processRepair,
    lastTryTooRecent,
    runAutoDrafts,
    runAutoDraftsJob,
    DEFAULT_MAX_PER_RUN,
    MAX_TRIES,
    REPAIR_MAX_TRIES,
    RETRY_COOLDOWN_MS
};

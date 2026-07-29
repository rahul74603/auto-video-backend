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

const JOBS_DRAFTS = "job_drafts";
const FAST_TRACK = "fast_track";
const DEFAULT_MAX_PER_RUN = 2;
const MAX_TRIES = 3;

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

    // 3) AI pipeline (auto mode = sirf draft, publish NEVER)
    const draft = await deps.runGeneratePipeline({
        type: cleanType(candidate.type),
        sourceUrl: source.url,
        instructions: "",
        mode: "auto",
        source,
        existing
    });

    // 4) Draft save + origin mark
    const payload = {
        ...draft,
        autoDraft: true,
        originRef: { collection: candidate.collection, id: candidate.id },
        autoResolvedVia: resolvedVia,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    };
    const ref = await db.collection(deps.DRAFT_COLLECTION).add(payload);
    await db.collection(candidate.collection).doc(candidate.id).set(
        { aiDrafted: true, aiDraftId: ref.id },
        { merge: true }
    );

    // 5) Telegram card (phone approve)
    if (deps.notifyDraft && deps.creds) {
        await deps.notifyDraft(null, deps.creds, draft, ref.id, {
            label: "🌅 AUTO DRAFT READY",
            withButtons: deps.withButtons !== false
        }).catch(e => console.warn("auto-draft telegram:", e.message));
    }

    return { draftId: ref.id, resolvedVia, title: draft.title || candidate.title };
}

/** Mark failed try (3 ke baad item chhod diya jayega). */
async function markTryFailed(db, candidate, message) {
    try {
        await db.collection(candidate.collection).doc(candidate.id).set(
            { aiDraftTries: (Number(candidate.aiDraftTries) || 0) + 1, aiDraftLastError: String(message || "").slice(0, 200) },
            { merge: true }
        );
    } catch {/* best-effort */}
}

// ---------------------------------------------------------------------------
// 🏃 Main runner
// ---------------------------------------------------------------------------
async function runAutoDrafts(db, FieldValue, deps) {
    const report = { created: [], skipped: [], cleaned: [], errors: [] };
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
    const fetcher = require("./agents/article_agents/source_fetcher");
    const searcher = require("./agents/article_agents/web_searcher");
    const routes = require("./agents/article_agents/article_routes");
    const bot = require("./telegram_draft_bot");

    const deps = {
        runGeneratePipeline: pipeline.runGeneratePipeline,
        fetchAndExtractSource: fetcher.fetchAndExtractSource,
        searchAndFetchSource: searcher.searchAndFetchSource,
        collectExistingContent: routes.collectExistingContent,
        cleanType: pipeline.cleanType,
        DRAFT_COLLECTION: pipeline.DRAFT_COLLECTION,
        notifyDraft: bot.notifyDraft,
        creds: bot.adminCredsFromEnv(),
        withButtons: Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID),
        limit: (options && options.limit) || DEFAULT_MAX_PER_RUN
    };
    return runAutoDrafts(db, FieldValue, deps);
}

module.exports = {
    isFormPortalUrl,
    pickJobDraftUrl,
    pickAutoDraftCandidates,
    processCandidate,
    runAutoDrafts,
    runAutoDraftsJob,
    DEFAULT_MAX_PER_RUN,
    MAX_TRIES
};

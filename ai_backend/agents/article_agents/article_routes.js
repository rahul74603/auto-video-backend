"use strict";

/**
 * =============================================================
 *  ARTICLE AGENT ROUTES — Generate / Preview / Regenerate /
 *  Apply / Publish (admin API — admin panel Gmail login ke peeche,
 *  tumhare existing /generate-blog jaisa open pattern)
 * =============================================================
 * Endpoints (registered on the shared express `api` app):
 *   POST /articles/generate    → fetch source → writer → reviewer → save draft
 *   POST /articles/preview     → render an existing draft (or an unsaved preview)
 *   POST /articles/regenerate  → re-run writer from stored source URL/snapshot
 *   POST /articles/apply       → save admin edits + re-run Fact & Quality review
 *   POST /articles/publish     → guarded write into jobs / fast_track
 *
 * Automatic mode guarantee: generation in mode:'auto' always stops at the
 * draft — publication happens only through /articles/publish with a passed
 * review. Failed review blocks publishing (HTTP 409).
 */

const admin = require("firebase-admin");
const {
  DRAFT_COLLECTION,
  cleanType,
  runGeneratePipeline,
  reReview,
  publishDraftRecord,
  sanitizeOriginRef
} = require("./article_pipeline");
const { fetchAndExtractSource, assertSafeSourceUrl } = require("./source_fetcher");
const { searchAndFetchSource, buildSearchQuery } = require("./web_searcher");
const { EDITORIAL_AUTHOR, ARTICLE_TYPES, isBlockedDomain } = require("./constants");
const { plainText } = require("./article_html_utils");

function ok(res, body) {
  return res.json({ success: true, ...body });
}

function fail(res, status, message, extra) {
  return res.status(status).json({ success: false, error: message, ...(extra || {}) });
}

const EXPECTED_CODES = new Set([
  "INVALID_SOURCE_URL",
  "SOURCE_FETCH_FAILED",
  "SOURCE_TOO_THIN",
  "SOURCE_NOT_ARTICLE_WORTHY",
  "UNKNOWN_ARTICLE_TYPE",
  "AI_NOT_CONFIGURED",
  "AI_RATE_LIMITED",
  "WRITER_BAD_JSON",
  "PUBLISH_BLOCKED",
  "ALREADY_PUBLISHED",
  "DRAFT_NOT_FOUND"
]);

function handleRouteError(res, error, context) {
  if (EXPECTED_CODES.has(error.code)) {
    console.warn(`⚠️ [articles:${context}] ${error.code}: ${error.message}`);
  } else {
    console.error(`❌ [articles:${context}]`, error);
  }
  switch (error.code) {
    case "INVALID_SOURCE_URL":
      return fail(res, 400, error.message);
    case "SOURCE_FETCH_FAILED":
    case "SOURCE_TOO_THIN":
    case "SOURCE_NOT_ARTICLE_WORTHY":
      return fail(res, 502, error.message);
    case "UNKNOWN_ARTICLE_TYPE":
      return fail(res, 400, error.message);
    case "AI_NOT_CONFIGURED":
      return fail(res, 503, error.message);
    case "AI_RATE_LIMITED":
      // Gemini rate-limit/overload — admin ko "bas thodi der baad dabao" hint
      return fail(res, 503, error.message);
    case "WRITER_BAD_JSON":
      return fail(res, 502, error.message);
    case "PUBLISH_BLOCKED":
      return fail(res, 409, error.message, { publishBlocked: true });
    case "ALREADY_PUBLISHED":
      return fail(res, 409, error.message, { alreadyPublished: true });
    case "DRAFT_NOT_FOUND":
      return fail(res, 404, error.message);
    default:
      return fail(res, 500, error.message);
  }
}

/** Collect titles/slugs/content snippets for the duplicate & stuffing guard.
 *  excludeDraftId: khud wali draft ko comparison se bahar rakhta hai —
 *  warna Apply/Regenerate pe draft apne aap se 1.00 match karke
 *  duplicate-content fail ho jaati hai (self-duplicate bug). */
async function collectExistingContent(db, articleType, { excludeDraftId = "" } = {}) {
  const existing = { titles: [], slugs: [], snippets: [] };
  const target = articleType === ARTICLE_TYPES.JOB ? "jobs" : "fast_track";
  try {
    const targets = await db.collection(target).orderBy("createdAt", "desc").limit(60).get().catch(() => null);
    (targets?.docs || []).forEach((doc) => {
      const data = doc.data() || {};
      if (data.title) existing.titles.push(data.title);
      if (data.slug) existing.slugs.push(data.slug);
      const snippet = data.description || data.shortInfo || "";
      if (snippet) existing.snippets.push(snippet);
    });
  } catch (e) {
    console.warn("existing-content: target listing failed:", e.message);
  }
  try {
    const drafts = await db.collection(DRAFT_COLLECTION).orderBy("createdAt", "desc").limit(60).get().catch(() => null);
    (drafts?.docs || []).forEach((doc) => {
      if (doc.id === excludeDraftId) return; // khud ke saath compare mat karo
      const data = doc.data() || {};
      if (data.status === "rejected") return;
      if (data.title) existing.titles.push(data.title);
      if (data.slug) existing.slugs.push(data.slug);
      if (data.articleHtml) existing.snippets.push(plainText(data.articleHtml).slice(0, 2500));
    });
  } catch (e) {
    console.warn("existing-content: draft listing failed:", e.message);
  }
  return existing;
}

function sanitizeEdits(edits) {
  const allowed = {};
  if (!edits || typeof edits !== "object") return allowed;
  const stringFields = ["title", "h1", "seoTitle", "metaDescription", "shortDescription", "articleHtml", "slug"];
  for (const field of stringFields) {
    if (typeof edits[field] === "string" && edits[field].trim()) {
      allowed[field] = field === "articleHtml" ? edits[field].slice(0, 60000) : edits[field].trim().slice(0, 2000);
    }
  }
  if (Array.isArray(edits.faqs)) {
    allowed.faqs = edits.faqs
      .map((f) => ({ question: String(f?.question || "").trim(), answer: String(f?.answer || "").trim() }))
      .filter((f) => f.question && f.answer)
      .slice(0, 12);
  }
  if (Array.isArray(edits.officialLinks)) {
    allowed.officialLinks = edits.officialLinks
      .map((l) => ({ label: String(l?.label || "").trim(), url: String(l?.url || "").trim() }))
      .filter((l) => l.url && /^https?:\/\//i.test(l.url) && !isBlockedDomain(l.url))
      .slice(0, 10);
  }
  if (edits.facts && typeof edits.facts === "object") {
    const facts = {};
    for (const [k, v] of Object.entries(edits.facts)) {
      if (typeof v === "string") facts[k] = v.slice(0, 600);
    }
    allowed.facts = facts;
  }
  return allowed;
}

function registerArticleAgentRoutes(app, db) {
  /* ---------------- GENERATE ---------------- */
  app.post("/articles/generate", async (req, res) => {

    try {
      const type = cleanType(req.body?.type);
      const sourceUrl = String(req.body?.sourceUrl || req.body?.url || "").trim();

      const mode = req.body?.mode === "auto" ? "auto" : "manual";
      let instructions = String(req.body?.instructions || "").slice(0, 1500);
      let pastedText = String(req.body?.sourceText || "").trim();

      // ZERO-UI paste-mode: purane admin UI me bhi instructions me
      // "PASTE: <copied text>" likhne par wahi pasted source maano.
      // (New UI ka amber box sourceText bhejta hai; ye sirf extra raasta hai.)
      if (!pastedText) {
        const m = instructions.match(/^([\s\S]*?)\s*PASTE\s*:\s*([\s\S]+)$/i);
        if (m && m[2].trim().length >= 400) {
          pastedText = m[2].trim();
          instructions = m[1].trim();
        }
      }

      // ⭐ SOURCE RESOLUTION — 4 level smart fallback:
      //   0. admin ne TEXT paste kiya ho (blocked/slow site ka manual raasta) → wahi use
      //   1. diya hua link theek hai → use hi karo
      //   2. link galat/patli/form-portal ho → agent KHUD internet search kare
      //   3. link diya hi na ho → instructions se search karke notification dhoondhe
      let source = null;
      let autoSearched = false;
      let searchQuery = "";
      let directError = null;

      if (pastedText) {
        // MANUAL-PASTE MODE: fetch/search skip — article pasted text pe grounded.
        // Grounding/review rules wahi rehte hain (source = pasted text).
        if (pastedText.length < 400) {
          return fail(
            res,
            400,
            "Pasted text bahut chhota hai (kam se kam 400 characters chahiye) — page/PDF se aur zyada text copy karke daalo"
          );
        }
        if (!sourceUrl) {
          return fail(
            res,
            400,
            "Text paste kiya hai to upar OFFICIAL notification link bhi daalo — article ke Links box ke liye zaroori hai"
          );
        }
        // Invalid/unsafe URL ho to INVALID_SOURCE_URL 400 (existing handler sambhalega)
        const parsed = assertSafeSourceUrl(sourceUrl);
        source = {
          ok: true,
          via: "manual-paste",
          url: parsed.toString(),
          pageTitle: instructions.replace(/^(job|fast\s*track)\s*:\s*/i, "").split("|")[0].trim().slice(0, 180),
          metaDescription: "",
          text: pastedText.slice(0, 60000),
          tables: [],
          links: [],
          fetchedAt: new Date().toISOString(),
          fetchedBytes: Buffer.byteLength(pastedText),
          status: 200
        };
      } else if (sourceUrl) {
        try {
          source = await fetchAndExtractSource(sourceUrl);
        } catch (e) {
          directError = e;
          console.warn(`generate: direct source fail (${e.code || e.message}) — web search fallback try ho raha hai`);
        }
      }

      if (!source) {
        searchQuery = buildSearchQuery(instructions, sourceUrl);
        if (!searchQuery) {
          // Na link chala, na search ke liye naam hai
          const message = directError
            ? directError.message
            : "Source URL daalo YA instructions me bharti ka naam likho — phir main khud internet se notification dhoondhunga";
          return fail(res, 400, message);
        }
        autoSearched = true;
        try {
          source = await searchAndFetchSource(searchQuery);
        } catch (searchErr) {
          if (directError) {
            // Direct link BHI nahi khula + search bhi fail — dono wajah saaf batao
            const err = new Error(
              `Diya hua link bhi nahi khula aur internet search se bhi "${searchQuery}" ke liye kuch kaam ka nahi mila. ` +
              `💡 Browser me link khud kholke confirm karo ki wahi DIRECT notification page/PDF hai (scanned/photo PDF nahi chalegi), phir dobara daalo. ` +
              `(link wala error: ${String(directError.message || directError).slice(0, 120)})`
            );
            err.code = searchErr.code || "SOURCE_FETCH_FAILED";
            throw err;
          }
          throw searchErr;
        }
      }

      const existing = await collectExistingContent(db, type);
      const draft = await runGeneratePipeline(
        { type, sourceUrl: source.url, instructions, mode, source, existing },
        {}
      );
      draft.autoSearched = autoSearched;
      draft.searchQuery = searchQuery;
      // ⭐ Origin pointer (JOBS AI draft row / Fast Track item) — publish hone par
      // ye source-record bhi auto-delete hoga (whitelist sirf job_drafts/fast_track).
      const originRef = sanitizeOriginRef(req.body?.originRef);
      if (originRef) draft.originRef = originRef;

      const docPayload = {
        ...draft,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      const ref = await db.collection(DRAFT_COLLECTION).add(docPayload);

      // 🔔 Telegram approve-card bhejo (phone se ✅/❌) — fail ho to generate
      // response kabhi block nahi hoga.
      try {
        const bot = require("../../telegram_draft_bot");
        await bot.notifyDraft(null, bot.adminCredsFromEnv(), draft, ref.id, { label: "🧠 AI DRAFT READY" });
      } catch (notifyErr) {
        console.warn("telegram draft notify:", notifyErr.message || notifyErr);
      }

      return ok(res, {
        draftId: ref.id,
        draft: { id: ref.id, ...draft },
        review: draft.reviewReport,
        // automatic mode: article stops here as a draft — nothing is published
        autoModeDraftOnly: mode === "auto",
        autoSearched,
        searchQuery,
        resolvedSourceUrl: source.url,
        authorName: EDITORIAL_AUTHOR
      });
    } catch (error) {
      return handleRouteError(res, error, "generate");
    }
  });

  /* ---------------- PREVIEW ---------------- */
  app.post("/articles/preview", async (req, res) => {

    try {
      const draftId = String(req.body?.draftId || "").trim();
      if (draftId) {
        const snap = await db.collection(DRAFT_COLLECTION).doc(draftId).get();
        if (!snap.exists) return fail(res, 404, "Draft not found");
        const draft = { id: snap.id, ...snap.data() };
        return ok(res, { draft, review: draft.reviewReport || null, previewHtml: draft.articleHtml || "" });
      }

      // Unsaved inline preview: generate but do NOT persist anything.
      const type = cleanType(req.body?.type);
      const sourceUrl = String(req.body?.sourceUrl || "").trim();
      if (!sourceUrl) return fail(res, 400, "Provide draftId or {type, sourceUrl}");
      const source = await fetchAndExtractSource(sourceUrl);
      const existing = await collectExistingContent(db, type);
      const draft = await runGeneratePipeline({
        type,
        sourceUrl,
        instructions: String(req.body?.instructions || "").slice(0, 1500),
        mode: req.body?.mode === "auto" ? "auto" : "manual",
        source,
        existing
      });
      return ok(res, { draft, review: draft.reviewReport, previewHtml: draft.articleHtml, unsaved: true });
    } catch (error) {
      return handleRouteError(res, error, "preview");
    }
  });

  /* ---------------- REGENERATE ---------------- */
  app.post("/articles/regenerate", async (req, res) => {

    try {
      const draftId = String(req.body?.draftId || "").trim();
      if (!draftId) return fail(res, 400, "draftId is required");

      const snap = await db.collection(DRAFT_COLLECTION).doc(draftId).get();
      if (!snap.exists) return fail(res, 404, "Draft not found");
      const current = snap.data();
      if (current.status === "published") {
        return fail(res, 409, "Published drafts cannot be regenerated — create a new one", { alreadyPublished: true });
      }

      const type = cleanType(current.articleType || (current.type === "JOB" ? "job" : "fast-track"));
      // Prefer a fresh fetch of the stored source URL; fall back to the snapshot.
      let source;
      try {
        source = await fetchAndExtractSource(current.sourceUrl);
      } catch (e) {
        console.warn("regenerate: refetch failed, using snapshot:", e.message);
        source = { url: current.sourceUrl, ...current.sourceSnapshot };
      }
      if (!source || !source.text) return fail(res, 502, "No source material available for regeneration");

      const instructions = String(req.body?.instructions ?? current.instructions ?? "").slice(0, 1500);
      const existing = await collectExistingContent(db, type, { excludeDraftId: draftId });
      // ⭐ REGENERATE feedback loop: pichli failed review ke issues writer tak pahunchao,
      // warna writer andher me wahi ungrounded claims dobara likhta hai (death-loop).
      const fresh = await runGeneratePipeline({
        type,
        sourceUrl: current.sourceUrl,
        instructions,
        mode: current.mode || "manual",
        source,
        existing,
        feedbackIssues: current.reviewReport?.issues
      });

      await db.collection(DRAFT_COLLECTION).doc(draftId).set(
        {
          ...fresh,
          version: Number(current.version || 1) + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // 🔔 Naye content ka fresh Telegram card (purane message stale ho gayi)
      try {
        const bot = require("../../telegram_draft_bot");
        await bot.notifyDraft(null, bot.adminCredsFromEnv(), fresh, draftId, { label: "🔄 DRAFT REGENERATED" });
      } catch (notifyErr) {
        console.warn("telegram draft notify (regenerate):", notifyErr.message || notifyErr);
      }

      return ok(res, {
        draftId,
        draft: { id: draftId, ...fresh, version: Number(current.version || 1) + 1 },
        review: fresh.reviewReport
      });
    } catch (error) {
      return handleRouteError(res, error, "regenerate");
    }
  });

  /* ---------------- APPLY (admin edits → re-review) ---------------- */
  app.post("/articles/apply", async (req, res) => {

    try {
      const draftId = String(req.body?.draftId || "").trim();
      if (!draftId) return fail(res, 400, "draftId is required");
      const edits = sanitizeEdits(req.body?.edits);
      if (!Object.keys(edits).length) return fail(res, 400, "No valid edits supplied");

      const snap = await db.collection(DRAFT_COLLECTION).doc(draftId).get();
      if (!snap.exists) return fail(res, 404, "Draft not found");
      const current = snap.data();
      if (current.status === "published") {
        return fail(res, 409, "Published drafts cannot be edited", { alreadyPublished: true });
      }

      const type = cleanType(current.articleType || (current.type === "JOB" ? "job" : "fast-track"));
      const merged = {
        h1: edits.h1 ?? current.h1,
        seoTitle: edits.seoTitle ?? current.seoTitle,
        metaDescription: edits.metaDescription ?? current.metaDescription,
        shortDescription: edits.shortDescription ?? current.shortDescription,
        slug: edits.slug ?? current.slug,
        contentHtml: edits.articleHtml ?? current.articleHtml,
        faqs: edits.faqs ?? current.faqs,
        facts: { ...(current.facts || {}), ...(edits.facts || {}) },
        officialLinks: edits.officialLinks ?? current.officialLinks,
        keywords: current.keywords,
        type: current.type
      };
      if (edits.title) merged.facts.title = edits.title;

      const source = { url: current.sourceUrl, ...(current.sourceSnapshot || {}) };
      if (!source.text) return fail(res, 500, "Stored source snapshot missing — regenerate instead");

      const existing = await collectExistingContent(db, type, { excludeDraftId: draftId });
      const { article, review } = reReview({ type, article: merged, sourceSnapshot: source, existing });

      const update = {
        title: article.facts.title || article.h1,
        h1: article.h1,
        slug: article.slug,
        seoTitle: article.seoTitle,
        metaDescription: article.metaDescription,
        shortDescription: article.shortDescription,
        articleHtml: article.contentHtml,
        faqs: article.faqs,
        facts: article.facts,
        officialLinks: article.officialLinks,
        structuredData: JSON.stringify(article.structuredData),
        wordCount: article.wordCount,
        reviewStatus: review.verdict === "pass" ? "passed" : "failed",
        reviewReport: review,
        publishBlocked: review.verdict !== "pass",
        reviewStale: false,
        authorName: EDITORIAL_AUTHOR,
        version: Number(current.version || 1) + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection(DRAFT_COLLECTION).doc(draftId).set(update, { merge: true });
      return ok(res, {
        draftId,
        draft: { id: draftId, ...current, ...update },
        review,
        reviewPassed: review.verdict === "pass"
      });
    } catch (error) {
      return handleRouteError(res, error, "apply");
    }
  });

  /* ---------------- PUBLISH (guarded) ---------------- */
  app.post("/articles/publish", async (req, res) => {

    try {
      const draftId = String(req.body?.draftId || "").trim();
      if (!draftId) return fail(res, 400, "draftId is required");

      const snap = await db.collection(DRAFT_COLLECTION).doc(draftId).get();
      if (!snap.exists) return fail(res, 404, "Draft not found");
      const draft = snap.data();

      // Hard gate + guarded write + draft/origin cleanup — shared with Telegram bot
      const { collection, docId: targetId, payload, originDeleted } =
        await publishDraftRecord(db, admin.firestore.FieldValue, draft, draftId);

      return ok(res, {
        draftId,
        published: true,
        draftDeleted: true,
        originDeleted,
        collection,
        docId: targetId,
        slug: payload.slug,
        authorName: payload.authorName
      });
    } catch (error) {
      return handleRouteError(res, error, "publish");
    }
  });
}

module.exports = { registerArticleAgentRoutes };

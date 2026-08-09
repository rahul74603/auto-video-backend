"use strict";

/**
 * Adaptive grounded generation.
 *
 * Unlike the old experimental "best-of-5" branch, this does not blindly run
 * up to fifteen Gemini calls. It starts with the normal balanced pipeline,
 * stops immediately on PASS or fatal/source issues, and tries conservative
 * alternatives only for writer-fixable failures. A bounded time/call budget
 * keeps /articles/generate inside the Cloud Function timeout.
 */

const { splitReviewIssues } = require("./article_repairer");

const STRATEGIES = Object.freeze([
  {
    id: "balanced",
    label: "Balanced grounded",
    temperature: 0.35,
    repairAttempts: 2,
    guidance: "Natural Hindi/Hinglish me likho, lekin har hard fact VERIFIED FACT SHEET aur source se hi lo."
  },
  {
    id: "conservative",
    label: "Zero-hallucination",
    temperature: 0.18,
    repairAttempts: 2,
    guidance:
      "ZERO-HALLUCINATION MODE: source me exact support na mile to number/date/amount ko chhod do aur " +
      "'Official Notification में देखें' likho. Completeness se pehle factual correctness ko priority do."
  },
  {
    id: "fact-complete",
    label: "Fact completeness",
    temperature: 0.25,
    repairAttempts: 1,
    guidance:
      "Source ki salary, vacancies, dates, organization, qualification aur official links ko dhyan se cover karo. " +
      "Koi value infer ya invent mat karo; sirf source se exact facts lo."
  }
]);

const STOP_ERROR_CODES = new Set(["AI_NOT_CONFIGURED", "AI_RATE_LIMITED", "SOURCE_NOT_ARTICLE_WORTHY"]);

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function reviewOf(draft) {
  return draft?.reviewReport || draft?.review || {};
}

function scoreDraft(draft) {
  const review = reviewOf(draft);
  const issues = Array.isArray(review.issues) ? review.issues : [];
  const { fatal } = splitReviewIssues(issues);
  const isPass =
    draft?.reviewStatus === "passed" || String(review.verdict || "").toLowerCase() === "pass";
  const baseScore = Number.isFinite(Number(review.score)) ? Number(review.score) : 0;
  const repairs = Math.max(1, Number(draft?.repairAttempts) || 1);

  return {
    rank: (isPass ? 1000 : 0) + baseScore - issues.length * 4 - fatal.length * 100 - repairs,
    isPass,
    baseScore,
    issueCount: issues.length,
    fatalCount: fatal.length,
    repairs,
    issues
  };
}

/**
 * @param {object} input same input as runGeneratePipeline
 * @param {object} deps injectable runGeneratePipeline/writer deps (tests)
 * @param {object} options maxStrategies + budgetMs
 */
async function runAdaptivePipeline(input, deps = {}, options = {}) {
  const runGeneratePipeline =
    deps.runGeneratePipeline || require("./article_pipeline").runGeneratePipeline;
  const maxStrategies = clampInt(
    options.maxStrategies ?? process.env.AI_ARTICLE_STRATEGIES,
    1,
    STRATEGIES.length,
    STRATEGIES.length
  );
  const budgetMs = clampInt(
    options.budgetMs ?? process.env.AI_ARTICLE_BUDGET_MS,
    30_000,
    270_000,
    225_000
  );
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const startedAt = now();
  const results = [];
  const errors = [];
  let best = null;
  let stoppedReason = "strategy-limit";

  for (const strategy of STRATEGIES.slice(0, maxStrategies)) {
    if (results.length && now() - startedAt >= budgetMs) {
      stoppedReason = "time-budget";
      break;
    }

    const bestIssues = best?.scored?.issues || [];
    const feedbackIssues = [
      ...(Array.isArray(input.feedbackIssues) ? input.feedbackIssues : []),
      ...bestIssues
    ].filter((value, index, all) => value && all.indexOf(value) === index).slice(0, 10);

    try {
      const draft = await runGeneratePipeline(
        {
          ...input,
          feedbackIssues,
          strategyGuidance: strategy.guidance
        },
        {
          ...(deps.pipelineDeps || {}),
          writerDeps: {
            ...(deps.writerDeps || deps.pipelineDeps?.writerDeps || {}),
            temperature: strategy.temperature
          },
          maxRepairAttempts: strategy.repairAttempts
        }
      );
      const scored = scoreDraft(draft);
      const result = { draft, strategy, scored };
      results.push(result);
      if (!best || scored.rank > best.scored.rank) best = result;

      console.log(
        `[article-adaptive] ${strategy.id}: ${scored.isPass ? "PASS" : "FAIL"} ` +
        `score=${scored.baseScore}, issues=${scored.issueCount}, repairs=${scored.repairs}`
      );

      if (scored.isPass) {
        stoppedReason = "review-passed";
        break;
      }
      if (scored.fatalCount) {
        stoppedReason = "fatal-review-issue";
        break;
      }
    } catch (error) {
      errors.push({ strategy: strategy.id, error });
      console.warn(`[article-adaptive] ${strategy.id} error:`, error.message || error);
      if (STOP_ERROR_CODES.has(error.code)) {
        stoppedReason = `error:${error.code}`;
        break;
      }
    }
  }

  if (!best) {
    const firstError = errors[0]?.error;
    if (firstError) throw firstError;
    const error = new Error("Adaptive article generation produced no draft");
    error.code = "WRITER_BAD_JSON";
    throw error;
  }

  const finalDraft = best.draft;
  // Persist only the admin's own instructions, never internal strategy text.
  finalDraft.instructions = String(input.instructions || "").slice(0, 1500);
  finalDraft.generationMeta = {
    engine: "adaptive-grounded-v1",
    maxStrategies,
    strategiesTried: results.length,
    bestStrategy: best.strategy.id,
    bestStrategyLabel: best.strategy.label,
    passedCount: results.filter((result) => result.scored.isPass).length,
    stoppedReason,
    durationMs: Math.max(0, now() - startedAt),
    outcomes: results.map((result) => ({
      strategy: result.strategy.id,
      verdict: result.scored.isPass ? "pass" : "fail",
      score: result.scored.baseScore,
      issueCount: result.scored.issueCount,
      repairAttempts: result.scored.repairs
    }))
  };
  finalDraft.repairLog = [
    `Adaptive: ${best.strategy.id} selected (${stoppedReason})`,
    ...(finalDraft.repairLog || [])
  ].slice(0, 15);

  return finalDraft;
}

module.exports = {
  runAdaptivePipeline,
  scoreDraft,
  STRATEGIES,
  STOP_ERROR_CODES
};

"use strict";

/**
 * ============================================================
 *  BEST-OF-5 AI ORCHESTRATOR — Best of Best AI Agent
 *  ------------------------------------------------------------
 *  User complaint: "kal se ek bhi correct nahi, sab failed"
 *  Old agent: 1 attempt + 3 self-heal retries, phir bhi fail ho jata tha
 *             kyunki hallucination (PMT salary, Indian numbers) pakda jata tha
 *  
 *  New Agent — 5 parallel smart attempts:
 *    1. Smart Facts Harvester: salary, dates, titles, vacancy, org sab pehchanta hai
 *       (Indian numbering 1,60,000 -> 160000, PMT/CTC/LPA support)
 *    2. 5 different writer strategies:
 *       - Attempt 1: Balanced (temp 0.35) — standard
 *       - Attempt 2: Conservative (temp 0.2) — less hallucination, more grounded
 *       - Attempt 3: Creative but cautious (temp 0.5) — better language
 *       - Attempt 4: Fact-focused (extra instruction: "sirf source ke facts likho")
 *       - Attempt 5: Short & precise (word aim lower, less chance of hallucination)
 *    3. Each attempt runs full pipeline: writer -> deterministic repair -> review
 *    4. Pick best:
 *       - If any PASS, pick highest score PASS (prefer least repair attempts)
 *       - If none PASS, pick highest score FAIL but with fixable issues (not fatal)
 *       - Save repair log for all
 *    5. Telegram only when best is PASS (no spam)
 *  
 *  Result: 1st attempt fail bhi ho to 2nd/3rd me PASS ho jata hai — user demand:
 *          "1st me nahi to 2nd ya 3rd me thik ho jana chahiye"
 */

const { runGeneratePipeline } = require("./article_pipeline");
const { splitReviewIssues } = require("./article_repairer");

const STRATEGIES = [
  {
    id: "balanced",
    temp: 0.35,
    extraInstruction: "",
    label: "Balanced-Grounded"
  },
  {
    id: "conservative",
    temp: 0.2,
    extraInstruction: "EXTRA STRICT: Sirf VERIFIED FACT SHEET ke numbers/dates likho. Koi doubt ho toh field khaali chhodo aur 'Official Notification में देखें' likho. Bilkul hallucination mat karo.",
    label: "Conservative-NoHallucination"
  },
  {
    id: "fact_focused",
    temp: 0.3,
    extraInstruction: "FOCUS: Salary, vacancy, dates, organization, qualification — ye 5 facts sabse important hain. Inhe source se EXACT copy karo. Baaki prose apne shabdon me.",
    label: "Fact-Focused"
  },
  {
    id: "creative_cautious",
    temp: 0.5,
    extraInstruction: "Write in engaging Hindi/Hinglish but keep all numbers 100% grounded. Use VERIFIED FACT SHEET only.",
    label: "Creative-Cautious"
  },
  {
    id: "short_precise",
    temp: 0.25,
    extraInstruction: "SHORT & PRECISE: 1600-1800 words aim, no extra fluff. Har section me sirf grounded facts. Jyada likhne se hallucination badhta hai, isliye chhota par sahi likho.",
    label: "Short-Precise"
  }
];

function scoreDraft(draft) {
  const review = draft.reviewReport || draft.review || {};
  const baseScore = typeof review.score === 'number' ? review.score : (review.verdict === 'pass' ? 90 : 0);
  const isPass = draft.reviewStatus === 'passed' || review.verdict === 'pass';
  const attempts = draft.repairAttempts || 1;
  const passedOn = draft.repairPassedOnAttempt || (isPass ? attempts : null);
  
  // Prefer PASS, then higher score, then fewer attempts, then more words (but not too many)
  let score = baseScore;
  if (isPass) score += 100; // PASS gets big bonus
  if (passedOn && passedOn <= 2) score += 10; // Early pass bonus
  if (attempts <= 2) score += 5;
  
  // Penalize fatal issues heavily
  const issues = review.issues || [];
  const { fatal } = splitReviewIssues(issues);
  if (fatal.length) score -= 50;
  
  return { score, isPass, baseScore, attempts, passedOn, fatalCount: fatal.length };
}

async function runBestOfN({ type, sourceUrl, instructions, mode, source, existing, feedbackIssues }, deps = {}, n = 5) {
  const strategies = STRATEGIES.slice(0, Math.min(n, STRATEGIES.length));
  
  console.log(`[best-ai] Starting best-of-${strategies.length} for ${type} — ${source?.url || sourceUrl}`);
  
  const results = [];
  
  // Run sequentially to avoid rate limits (parallel would be faster but hits Gemini quota)
  // We run 5 strategies one by one, each with its own self-healing loop (3 attempts internally)
  // Total: 5 * 3 = 15 writer calls worst case, but typically 5-8
  for (let i = 0; i < strategies.length; i++) {
    const strat = strategies[i];
    const combinedInstructions = [
      instructions || "",
      strat.extraInstruction ? `\n\n[STRATEGY ${strat.id.toUpperCase()}: ${strat.label}]\n${strat.extraInstruction}` : ""
    ].filter(Boolean).join('\n').slice(0, 1800);
    
    try {
      console.log(`[best-ai] Attempt ${i+1}/${strategies.length}: ${strat.label} (temp ${strat.temp})`);
      
      const draft = await runGeneratePipeline(
        {
          type,
          sourceUrl,
          instructions: combinedInstructions,
          mode,
          source,
          existing,
          feedbackIssues: i === 0 ? feedbackIssues : [...(feedbackIssues || []), ...(results[0]?.reviewReport?.issues || []).slice(0, 3)]
        },
        {
          ...deps,
          writerDeps: { ...(deps.writerDeps || {}), temperature: strat.temp },
          maxRepairAttempts: 3
        }
      );
      
      const scored = scoreDraft(draft);
      
      results.push({
        draft,
        strategy: strat,
        ...scored,
        attemptIndex: i
      });
      
      console.log(`[best-ai] ${strat.id}: ${scored.isPass ? '✅ PASS' : '❌ FAIL'} score=${scored.score} base=${scored.baseScore} attempts=${scored.attempts} fatal=${scored.fatalCount}`);
      
      // Early exit if we got a perfect PASS with high score on first 2 attempts
      if (scored.isPass && scored.baseScore >= 85 && i < 2) {
        console.log(`[best-ai] Early excellent PASS found — stopping early`);
        break;
      }
      
      // If we got PASS with score >= 80, no need to try all 5
      if (scored.isPass && scored.baseScore >= 80) {
        // Continue one more time to see if we can get even better, but not all 5
        if (i >= 2) break;
      }
      
    } catch (err) {
      console.warn(`[best-ai] ${strat.id} failed with error:`, err.message);
      results.push({
        draft: null,
        strategy: strat,
        score: -100,
        isPass: false,
        error: err.message,
        attemptIndex: i
      });
    }
  }
  
  // Pick best
  const validResults = results.filter(r => r.draft);
  if (!validResults.length) {
    // Do not hide the real source/AI failure behind a generic Best-of message.
    // The UI can now tell whether the link could not be read or the AI provider
    // was unavailable, and admins have a useful server log to act on.
    const reasons = results
      .filter((result) => result.error)
      .map((result) => `${result.strategy.id}: ${String(result.error).replace(/\s+/g, " ").slice(0, 220)}`)
      .slice(0, 3);
    const err = new Error(
      `Best-of-${strategies.length} all failed — no draft produced` +
      (reasons.length ? `. Actual failures: ${reasons.join(" | ")}` : "")
    );
    err.code = "BEST_OF_ALL_FAILED";
    err.attemptErrors = reasons;
    throw err;
  }
  
  // Sort by score descending
  validResults.sort((a, b) => b.score - a.score);
  
  const best = validResults[0];
  const passedResults = validResults.filter(r => r.isPass);
  
  console.log(`[best-ai] Best pick: ${best.strategy.id} (${best.strategy.label}) — ${best.isPass ? 'PASS' : 'FAIL'} score=${best.score}`);
  if (passedResults.length) {
    console.log(`[best-ai] ${passedResults.length}/${validResults.length} attempts PASSED`);
  } else {
    console.log(`[best-ai] 0/${validResults.length} passed — will return best FAIL for auto-retry queue`);
  }
  
  // Enhance draft with best-of metadata
  const finalDraft = best.draft;
  finalDraft.bestOfMeta = {
    totalStrategies: strategies.length,
    tried: results.length,
    passedCount: passedResults.length,
    bestStrategy: best.strategy.id,
    bestScore: best.score,
    allScores: validResults.map(r => ({
      strategy: r.strategy.id,
      score: r.score,
      isPass: r.isPass,
      baseScore: r.baseScore,
      attempts: r.attempts
    }))
  };
  
  // Merge repair logs
  finalDraft.repairLog = [
    `Best-of-${strategies.length}: picked ${best.strategy.id} (score ${best.score})`,
    ...(finalDraft.repairLog || []),
    ...validResults.slice(1, 3).map(r => `Other: ${r.strategy.id} score=${r.score} ${r.isPass ? 'PASS' : 'FAIL'}`)
  ].slice(0, 15);
  
  return finalDraft;
}

module.exports = {
  runBestOfN,
  STRATEGIES,
  scoreDraft
};

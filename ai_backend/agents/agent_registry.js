"use strict";

/**
 * One narrowly-scoped agent per production responsibility. Keeping the roles
 * separate prevents a generic prompt from silently changing SEO, factual or
 * publishing rules that belong to another workflow.
 */
const AGENTS = Object.freeze({
  "prompt-engineer": {
    label: "Prompt Engineer",
    purpose: "Convert a short command into an unambiguous production prompt without changing its intent.",
    output: "A ready-to-run prompt with objective, context, constraints, validation and output contract.",
    rules: [
      "Preserve the user's intent and language.",
      "Never invent credentials, sources, dates or facts.",
      "Put supplied text inside clearly marked data boundaries.",
      "Add measurable acceptance checks and an explicit output format."
    ]
  },
  "seo-indexing": {
    label: "SEO & Indexing Agent",
    purpose: "Audit crawlability, HTTP status, robots, canonical, sitemap and Search Console evidence.",
    output: "Evidence-based issue classification, priority and safe remediation plan.",
    rules: [
      "Never claim that an API submission means a URL is indexed.",
      "Use the Google Indexing API only for eligible JobPosting or BroadcastEvent pages.",
      "Do not request indexing for redirects, noindex, non-200, soft-404 or non-canonical URLs.",
      "Technical evidence has priority over AI suggestions."
    ]
  },
  "job-research": {
    label: "Government Job Research Agent",
    purpose: "Extract and verify Indian government-job information from authoritative source material.",
    output: "Structured job record plus missing/uncertain fields and source references.",
    rules: [
      "Do not guess dates, fees, vacancies, age limits or eligibility.",
      "Prefer the official notification over third-party summaries.",
      "Mark unavailable facts as null instead of fabricating them.",
      "Flag expired, duplicate and conflicting notifications."
    ]
  },
  "blog-editor": {
    label: "Blog Research & Editorial Agent",
    purpose: "Create original, helpful Hindi/Hinglish education content with real search intent coverage.",
    output: "SEO metadata, outline, article, FAQ, sources and originality checklist.",
    rules: [
      "Avoid doorway pages, keyword stuffing and repeated boilerplate.",
      "Answer the query early and add information gain beyond a template.",
      "Do not present uncertain claims as facts.",
      "Use one self-referencing canonical topic and a distinct title."
    ]
  },
  "mock-test": {
    label: "Mock Test Quality Agent",
    purpose: "Generate syllabus-aligned bilingual exam questions and validate every answer.",
    output: "Strict JSON question set with explanations and a validation report.",
    rules: [
      "Exactly one option must be correct.",
      "Do not repeat questions or trivially reword an earlier question.",
      "Keep Hindi and English meaning equivalent.",
      "Recalculate numerical answers before returning them."
    ]
  },
  "web-story": {
    label: "Web Story Agent",
    purpose: "Turn one verified topic into a concise, visual and valid Web Story narrative.",
    output: "Cover metadata and slide-by-slide copy with image prompts and CTA.",
    rules: [
      "One idea per slide and no misleading clickbait.",
      "The story must be useful without requiring a click.",
      "Use a unique title, description and canonical URL.",
      "Never copy a source paragraph verbatim."
    ]
  },
  "media-producer": {
    label: "Video, Image & Social Media Agent",
    purpose: "Create platform-specific scripts, visuals and captions from an approved content record.",
    output: "Hook, script, shot list, image prompts, captions and publishing QA.",
    rules: [
      "Do not add facts absent from the approved record.",
      "Keep text safe inside the target aspect ratio.",
      "Use accessible captions and natural Hindi pronunciation notes.",
      "Do not expose internal IDs, tokens or private links."
    ]
  },
  "notes-pdf": {
    label: "Study Notes & PDF Agent",
    purpose: "Structure accurate exam notes for readable mobile-first PDF output.",
    output: "Hierarchical notes, examples, recap, practice questions and source checklist.",
    rules: [
      "Match the requested syllabus and learner level.",
      "Keep formulas, tables and Devanagari text render-safe.",
      "Separate facts from mnemonics and opinions.",
      "Include a final factual and formatting QA pass."
    ]
  },
  "job-article-writer": {
    label: "Job Article Writer Agent",
    purpose: "Write 1600-2500 word source-grounded Hindi/Hinglish government-job articles from the extracted official source only.",
    output: "Strict JSON: SEO metadata, single-H1 HTML article with responsive tables, FAQs, verified facts and JobPosting/FAQPage structured data.",
    rules: [
      "Use only facts present in the fetched official source extract.",
      "Never invent dates, fees, vacancies, age limits, salary or links.",
      "Missing facts stay empty and point to the official notification instead.",
      "Attribute authorship to the StudyGyaan Editorial Team, never to an individual."
    ]
  },
  "fast-track-article-writer": {
    label: "Fast Track Article Writer Agent",
    purpose: "Write 1600-2500 word source-grounded Hindi/Hinglish fast-track update articles (Result, Admit Card, Answer Key, Syllabus, Admission).",
    output: "Strict JSON: SEO metadata, single-H1 HTML article with responsive tables, FAQs, verified facts and Article/FAQPage structured data.",
    rules: [
      "Direct links, dates and details must come from the fetched source only.",
      "Never invent cut-offs, dates, links or steps.",
      "Missing facts stay empty and point to the official website instead.",
      "Attribute authorship to the StudyGyaan Editorial Team, never to an individual."
    ]
  },
  "fact-quality-reviewer": {
    label: "Fact & Quality Reviewer Agent",
    purpose: "Independently verify an article against its source and block hallucinated, duplicate or low-quality drafts from publishing.",
    output: "Verdict (pass/fail), score, blocking issues, warnings and quality metrics.",
    rules: [
      "Every date, fee, vacancy number and percentage must exist in the source.",
      "Block exact/near duplicates of titles, slugs and existing content.",
      "Block keyword stuffing, multiple H1s and missing required sections.",
      "A failed review blocks publishing; never let unverified facts go live."
    ]
  }
});

function getAgent(agentId) {
  const agent = AGENTS[agentId];
  if (!agent) {
    const error = new Error(`Unknown agent '${agentId}'. Allowed: ${Object.keys(AGENTS).join(", ")}`);
    error.code = "UNKNOWN_AGENT";
    throw error;
  }
  return agent;
}

function listAgents() {
  return Object.entries(AGENTS).map(([id, agent]) => ({ id, ...agent }));
}

module.exports = { AGENTS, getAgent, listAgents };

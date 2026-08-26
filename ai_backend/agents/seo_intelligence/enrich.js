"use strict";

/**
 * Sync SEO enrichment applied at draft-build / publish-payload time.
 * No network, no secrets, no extra pages.
 */

const { detectExamFamily, detectContentKind, clusterId, hubForFamily } = require("./taxonomy");
const { classifySearchIntent, assessIntentAlignment } = require("./search_intent");
const { classifyJobLifecycle } = require("./job_lifecycle");
const { buildImageAlt } = require("./image_seo");
const { scoreDiscoverReadiness } = require("./discover");

function enrichContentDocument(input = {}) {
  const title = input.title || input.h1 || input.facts?.title || "";
  const facts = input.facts && typeof input.facts === "object" ? input.facts : {};
  const examFamily = detectExamFamily({
    title,
    category: facts.category || input.category,
    organization: facts.organization || facts.org || input.organization
  });
  const contentKind = detectContentKind({
    type: input.type || input.articleType,
    title,
    category: facts.category || input.category,
    h1: input.h1
  });
  const topicCluster = clusterId(examFamily, contentKind);
  const searchIntent = classifySearchIntent({ type: input.type, title, contentKind, category: facts.category });
  const intent = assessIntentAlignment({
    title: input.seoTitle || title,
    metaDescription: input.metaDescription,
    intent: searchIntent
  });
  const lifecycle = classifyJobLifecycle({
    type: input.type,
    lastDate: facts.lastDate || input.lastDate,
    startDate: facts.startDate || input.startDate
  });
  const imageAlt = buildImageAlt(title, contentKind);
  const discover = scoreDiscoverReadiness({
    title: input.seoTitle || title,
    hasImage: Boolean(input.imageUrl),
    wordCount: input.wordCount || 0,
    original: true
  });
  const sourceUrl = String(input.sourceUrl || "").trim();
  const hub = hubForFamily(examFamily);

  const out = {
    examFamily,
    contentKind,
    topicCluster,
    searchIntent,
    lifecycleStatus: lifecycle.status,
    lifecycleDays: lifecycle.daysUntilLastDate,
    includeJobPostingSchema: lifecycle.includeJobPostingSchema,
    sitemapPriority: lifecycle.sitemapPriority,
    imageAlt,
    discoverScore: discover.score,
    clusterHubUrl: hub.url,
    clusterHubName: hub.name,
    intentWarnings: intent.warnings,
    seoIntelligenceVersion: 1
  };
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    out.sourceCitation = { url: sourceUrl.slice(0, 500), label: "Official source", disclosed: true };
  }
  return out;
}

module.exports = { enrichContentDocument };

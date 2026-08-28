"use strict";

/**
 * After an approved apply, request discovery. Never claims the URL is indexed
 * or ranked. Reuses auto_indexer.notifyIndexing — no second sitemap generator.
 */

const { SITE_URL, notifyIndexing } = require("../../auto_indexer");

function absoluteUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return `${SITE_URL}${value}`;
  return "";
}

async function requestIndexingAfterApply(url, deps = {}) {
  const abs = absoluteUrl(url);
  if (!abs) {
    return { requested: false, claimedIndexed: false, skipped: "no-url" };
  }
  if (deps.dryRun || deps.skipNetwork) {
    return {
      requested: false,
      claimedIndexed: false,
      skipped: "dry-run",
      note: "Indexing request not sent. Sitemap/IndexNow ping is best-effort and does not mean Google indexed the page."
    };
  }
  try {
    const notify = deps.notify || notifyIndexing;
    const result = await notify(abs, deps.notifyDeps || {});
    return {
      requested: true,
      claimedIndexed: false,
      url: abs,
      engines: result,
      note: "Request sent to IndexNow/Google Indexing where supported. This is not proof of indexing or ranking."
    };
  } catch (error) {
    return {
      requested: false,
      claimedIndexed: false,
      error: error.message,
      note: "Indexing request failed. Page apply is not rolled back for indexing errors."
    };
  }
}

module.exports = {
  absoluteUrl,
  requestIndexingAfterApply
};

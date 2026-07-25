"use strict";

require("dotenv").config();
const { SEOIndexingAgent } = require("./agents/seo_indexing_agent");

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (const arg of argv) {
    if (arg === "--audit") options.mode = "audit";
    else if (arg === "--auto") options.mode = "auto";
    else if (arg.startsWith("--mode=")) options.mode = arg.slice(7);
    else if (arg.startsWith("--url=")) options.url = arg.slice(6);
    else if (arg.startsWith("--max=")) options.maxUrls = Number(arg.slice(6));
    else if (arg.startsWith("--output=")) options.outputPath = arg.slice(9);
  }
  return options;
}

async function runSitemapIndexing(options = {}) {
  const agent = new SEOIndexingAgent();
  const report = await agent.run(options);

  console.log("\n========== SEO & INDEXING AGENT REPORT ==========");
  console.log(`Mode:                    ${report.mode}`);
  console.log(`Sitemap unique URLs:     ${report.sitemap.unique}`);
  console.log(`URLs technically audited:${report.summary.audited}`);
  console.log(`Clean/indexable URLs:    ${report.summary.cleanIndexable}`);
  console.log(`Issues:                  ${JSON.stringify(report.summary.issueCounts)}`);
  console.log(`Inspection verdicts:     ${JSON.stringify(report.summary.searchConsoleVerdicts)}`);
  console.log(`Indexing API accepted:   ${report.indexingApi.accepted || 0} notification(s)`);
  console.log("IMPORTANT: API acceptance does not mean a page is indexed.");
  console.log(`Full report:             ${report.outputPath}`);
  console.log("=================================================\n");

  return report;
}

if (require.main === module) {
  runSitemapIndexing(parseArgs())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("SEO agent failed:", error.stack || error.message);
      process.exit(1);
    });
}

module.exports = { parseArgs, runSitemapIndexing };

"use strict";

const { auditPage } = require("./page_auditor");

function findingIdSet(audit) {
  return new Set((audit && audit.findings || []).map((item) => item.id).filter(Boolean));
}

function compareAudits(before, after) {
  const prev = findingIdSet(before);
  const next = findingIdSet(after);
  const fixed = [...prev].filter((id) => !next.has(id));
  const remaining = [...next];
  const introduced = remaining.filter((id) => !prev.has(id));
  return {
    beforeHealth: before && before.health ? before.health.score : null,
    afterHealth: after && after.health ? after.health.score : null,
    fixed,
    remaining,
    introduced,
    note: "Page SEO Health is a StudyGyaan diagnostic score, not a Google ranking score."
  };
}

function runReaudit(page, options = {}) {
  const after = auditPage(page, options);
  const comparison = compareAudits(options.beforeAudit || null, after);
  return { after, comparison };
}

module.exports = {
  compareAudits,
  runReaudit,
  findingIdSet
};

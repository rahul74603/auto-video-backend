"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeError,
  persistScanStatus,
  ingestGscJsonIfProvided,
  runSeoIntelligenceRunner,
  SETTINGS,
  SETTINGS_DOC,
  GSC_DOC
} = require("../run_seo_intelligence");

function fakeDb() {
  const writes = [];
  return {
    writes,
    collection(name) {
      return {
        doc(id) {
          return {
            async set(data, opts) {
              writes.push({ collection: name, id, data, opts });
            }
          };
        }
      };
    }
  };
}

const FieldValue = { serverTimestamp: () => "server-ts" };

test("SEO runner persists running and success status without Cloud Run", async () => {
  const db = fakeDb();
  const summary = await runSeoIntelligenceRunner({
    db,
    FieldValue,
    args: { dryRun: false, maxJobs: 5, actor: "arena", runId: "123", sha: "abc", gscJson: "", disableSummaryArtifact: true },
    deps: {
      checkConnections: async () => [{ name: "Firestore", ok: true }],
      checkContentFreshness: async () => ({ ok: true, stats: { recentJobs24h: 3 }, issues: [] }),
      runSeoIntelligence: async () => ({
        ok: true,
        generatedAt: "2026-08-26T00:00:00.000Z",
        durationMs: 10,
        lifecycle: { OPEN: 1 },
        recommendationCount: 2,
        searchConsole: { enabled: false, rowCount: 0 },
        topRecommendations: []
      })
    }
  });

  assert.equal(summary.ok, true);
  assert.ok(db.writes.some((w) => w.collection === SETTINGS && w.id === SETTINGS_DOC && w.data.lastStatus === "running"));
  const success = db.writes.find((w) => w.collection === SETTINGS && w.id === SETTINGS_DOC && w.data.lastStatus === "success");
  assert.ok(success, "success status write missing");
  assert.equal(success.data.runner, "github-actions");
  assert.equal(success.data.policy.autoPublish, false);
  assert.equal(success.data.policy.autoCreatePages, false);
  assert.equal(success.data.policy.inventFacts, false);
});

test("SEO runner persists sanitized failure status and rethrows", async () => {
  const db = fakeDb();
  await assert.rejects(
    runSeoIntelligenceRunner({
      db,
      FieldValue,
      args: { dryRun: false, maxJobs: 5, actor: "arena", runId: "123", sha: "abc", gscJson: "", disableSummaryArtifact: true },
      deps: {
        checkConnections: async () => [],
        checkContentFreshness: async () => ({ ok: true, stats: {}, issues: [] }),
        runSeoIntelligence: async () => {
          throw new Error('boom {"private_key":"super-secret","client_email":"bot@example.com"}');
        }
      }
    })
  );
  const failed = db.writes.find((w) => w.collection === SETTINGS && w.id === SETTINGS_DOC && w.data.lastStatus === "failed");
  assert.ok(failed, "failed status write missing");
  assert.match(failed.data.lastError.message, /\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(failed.data), /super-secret|bot@example\.com/);
});

test("secret redaction handles token-like keys and private keys", () => {
  const safe = sanitizeError({
    message: "Authorization: Bearer abc123 -----BEGIN PRIVATE KEY-----xyz-----END PRIVATE KEY-----",
    apiKey: "secret"
  });
  assert.doesNotMatch(JSON.stringify(safe), /abc123|xyz|secret/);
  assert.match(JSON.stringify(safe), /redacted/i);
});

test("GSC JSON import validates studygyaan rows and writes only sanitized rows", async () => {
  const db = fakeDb();
  const result = await ingestGscJsonIfProvided(db, FieldValue, {
    dryRun: false,
    actor: "admin@example.com",
    gscJson: JSON.stringify({ rows: [
      { query: "ssc", page: "https://studygyaan.in/job/ssc", clicks: 2, impressions: 200, ctr: 1.5, position: 8 },
      { query: "bad", page: "https://evil.example/x", clicks: 9, impressions: 9, ctr: 0.1, position: 1 }
    ] })
  });
  assert.equal(result.rowCount, 1);
  const write = db.writes.find((w) => w.collection === SETTINGS && w.id === GSC_DOC);
  assert.ok(write);
  assert.equal(write.data.rows.length, 1);
  assert.equal(write.data.rows[0].ctr, 0.015);
  assert.doesNotMatch(JSON.stringify(write.data), /private_key|token|SERVICE_ACCOUNT/);
});

test("persistScanStatus skips writes in dry-run mode", async () => {
  const db = fakeDb();
  await persistScanStatus(db, FieldValue, "running", { ok: true }, { dryRun: true });
  assert.equal(db.writes.length, 0);
});

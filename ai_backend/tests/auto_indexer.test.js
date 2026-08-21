"use strict";

/** Auto Indexer tests — publish pe Google/Bing ping (best-effort, kabhi block nahi). */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SITE_URL,
  INDEXNOW_KEY,
  AUTO_INDEX_COLLECTIONS,
  shouldIndex,
  notifyIndexNow,
  notifyGoogle,
  notifyIndexing,
  buildCreatedHandler,
  COLLECTION_URL_BUILDERS
} = require("../auto_indexer");

const SITE_HOST = "studygyaan.in";

/* ---------------- shouldIndex / URL mapping ---------------- */

test("shouldIndex: sab public collections allow, draft/archived skip", () => {
  for (const coll of AUTO_INDEX_COLLECTIONS) {
    assert.equal(shouldIndex(coll, { status: "published" }), true, `${coll} published`);
    assert.equal(shouldIndex(coll, { status: "approved" }), true, `${coll} approved`);
    assert.equal(shouldIndex(coll, {}), true, `${coll} no-status`);
    assert.equal(shouldIndex(coll, { status: "draft" }), false, `${coll} draft skip`);
  }
  assert.equal(shouldIndex("ai_article_drafts", { status: "published" }), false);
  assert.equal(shouldIndex("job_drafts", {}), false); // drafts kabhi index nahi
});

test("URL builders: har collection ka canonical path sahi banta hai", () => {
  assert.equal(COLLECTION_URL_BUILDERS.jobs("job-ssc-cgl-2026", { slug: "ssc-cgl-2026-recruitment" }), "/job/ssc-cgl-2026-recruitment");
  assert.equal(COLLECTION_URL_BUILDERS.jobs("job-abc", {}), "/job/job-abc");
  assert.equal(COLLECTION_URL_BUILDERS.fast_track("ft-hpsc-result-2026", {}), "/update/ft-hpsc-result-2026");
  assert.equal(COLLECTION_URL_BUILDERS.fast_track("ft-id", { slug: "ft-slug-2026" }), "/update/ft-slug-2026");
  assert.equal(COLLECTION_URL_BUILDERS.blogs("A6PZP3aolwUyJUqHla88", {}), "/blog/A6PZP3aolwUyJUqHla88");
  assert.equal(COLLECTION_URL_BUILDERS.web_stories("doc1", { slug: "railway-story-2026" }), "/web-stories/railway-story-2026");
  assert.equal(COLLECTION_URL_BUILDERS.mock_tests("m77", {}), "/test/m77");
});

/* ---------------- IndexNow ---------------- */

test("notifyIndexNow: sahi endpoint+payload submit hota hai", async () => {
  let seen = null;
  const fetch = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200 };
  };
  const out = await notifyIndexNow([`${SITE_URL}/job/x`], { fetch });
  assert.equal(out.submitted, 1);
  assert.equal(seen.url, "https://api.indexnow.org/indexnow");
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.host, SITE_HOST);
  assert.equal(body.key, INDEXNOW_KEY);
  assert.equal(body.keyLocation, `${SITE_URL}/${INDEXNOW_KEY}.txt`);
  assert.deepEqual(body.urlList, [`${SITE_URL}/job/x`]);
});

test("notifyIndexNow: khaali list pe skip, kuch bhi POST nahi hota", async () => {
  let called = false;
  const out = await notifyIndexNow([], { fetch: async () => { called = true; return { ok: true }; } });
  assert.equal(out.skipped, "no-urls");
  assert.equal(called, false);
});

/* ---------------- Google Indexing API ---------------- */

test("notifyGoogle: SA JSON env nahi to clean skip (kuch tootta nahi)", async () => {
  const out = await notifyGoogle(`${SITE_URL}/job/x`, { saJson: "", fetch: async () => ({ ok: true }) });
  assert.equal(out.skipped, "no-sa-json");
});

test("notifyGoogle: SA ho to JWT bearer ke saath URL_UPDATED publish hota hai (sirf /job/ URLs)", async () => {
  let seen = null;
  const fetch = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const fakeJwtLib = {
    JWT: class {
      constructor(opts) {
        assert.equal(opts.email, "idx@project.iam.gserviceaccount.com");
        assert.ok(opts.scopes.includes("https://www.googleapis.com/auth/indexing"));
      }
      authorize() {
        return Promise.resolve({ access_token: "ya29.fake-token" });
      }
    }
  };
  // Google Indexing API only accepts /job/ URLs (JobPosting) — non-job URLs are skipped
  const out = await notifyGoogle(`${SITE_URL}/job/ssc-gd-2026`, {
    saJson: JSON.stringify({ client_email: "idx@project.iam.gserviceaccount.com", private_key: "k" }),
    jwtLib: fakeJwtLib,
    fetch
  });
  assert.equal(out.notified, `${SITE_URL}/job/ssc-gd-2026`);
  assert.equal(seen.url, "https://indexing.googleapis.com/v3/urlNotifications:publish");
  assert.equal(seen.opts.headers.Authorization, "Bearer ya29.fake-token");
  assert.deepEqual(JSON.parse(seen.opts.body), { url: `${SITE_URL}/job/ssc-gd-2026`, type: "URL_UPDATED" });
});

test("notifyGoogle: non-job URLs (blog/test/story) ko skip karta hai — Google API sirf JobPosting accept karta hai", async () => {
  let called = false;
  const fetch = async () => { called = true; return { ok: true, status: 200, text: async () => "{}" }; };
  const out = await notifyGoogle(`${SITE_URL}/blog/abc`, {
    saJson: JSON.stringify({ client_email: "idx@project.iam.gserviceaccount.com", private_key: "k" }),
    jwtLib: { JWT: class { authorize() { return Promise.resolve({ access_token: "t" }); } } },
    fetch
  });
  assert.equal(out.skipped, "non-job-url");
  assert.equal(called, false, "non-job URL pe Google API call nahi hona chahiye");
});

test("notifyIndexing: dono engines fail ho jayein to bhi throw NAHI karta (best-effort)", async () => {
  const fetch = async () => {
    throw new Error("network down");
  };
  const out = await notifyIndexing(`${SITE_URL}/job/x`, {
    fetch,
    saJson: JSON.stringify({ client_email: "a@b.c", private_key: "k" }),
    jwtLib: { JWT: class { authorize() { return Promise.resolve({ access_token: "t" }); } } }
  });
  assert.ok(out.google.error, "google error report ho");
  assert.ok(out.indexnow.error, "indexnow error report ho");
});

/* ---------------- Firestore trigger handler ---------------- */

function fakeEvent(collectionDocId, data, refState) {
  const calls = [];
  return {
    data: {
      id: collectionDocId,
      data: () => data,
      ref: {
        set: async (obj, opts) => {
          calls.push([obj, opts]);
          refState.sets = calls;
        }
      }
    }
  };
}

test("handler: nayi published job pe notify + seoIndexNotifiedAt marker", async () => {
  const notified = [];
  const handler = buildCreatedHandler("jobs", {
    notify: async (url) => notified.push(url),
    fieldValue: { serverTimestamp: () => "TS" }
  });
  const ev = fakeEvent("job-ssc-2026", { slug: "ssc-cgl-2026-recruitment", status: "published" }, {});
  await handler(ev);
  assert.deepEqual(notified, [`${SITE_URL}/job/ssc-cgl-2026-recruitment`]);
});

test("handler: fast_track ka DRAFT item ping nahi karta (publish hone ka wait)", async () => {
  let pings = 0;
  const handler = buildCreatedHandler("fast_track", { notify: async () => { pings += 1; } });
  await handler(fakeEvent("ft-raw-1", { status: "draft" }, {}));
  assert.equal(pings, 0);
});

test("handler: web_story slug se Discover URL ping hota hai", async () => {
  const notified = [];
  const handler = buildCreatedHandler("web_stories", { notify: async (url) => notified.push(url) });
  await handler(fakeEvent("s1", { slug: "up-police-story" }, {}));
  assert.deepEqual(notified, [`${SITE_URL}/web-stories/up-police-story`]);
});

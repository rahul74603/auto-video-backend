"use strict";

/**
 * telegram_draft_bot.js + publishDraftRecord — approve-buttons flow ke tests.
 * Mock Telegram HTTP + mock Firestore se chalta hai (koi real call nahi).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDraftMessage,
    notifyDraft,
    handleWebhook,
    validDraftId
} = require("../telegram_draft_bot");
const { publishDraftRecord } = require("../agents/article_agents/article_pipeline");

// ---------------------------------------------------------------------
// 🔧 mocks
// ---------------------------------------------------------------------
function makeMockDb(seed = {}) {
    const store = new Map();
    Object.entries(seed).forEach(([key, value]) => store.set(key, value));
    const docRef = (collectionName, id) => ({
        async get() {
            const data = store.get(`${collectionName}/${id}`);
            return { exists: data !== undefined, data: () => data, id };
        },
        async set(data, options) {
            const key = `${collectionName}/${id}`;
            if (options && options.merge && store.has(key)) {
                store.set(key, { ...store.get(key), ...data });
            } else {
                store.set(key, data);
            }
        },
        async delete() {
            store.delete(`${collectionName}/${id}`);
        }
    });
    return {
        collection(name) { return { doc: (id) => docRef(name, id) }; },
        dump: () => Object.fromEntries(store.entries())
    };
}

function makeMockHttp() {
    const calls = [];
    return {
        calls,
        async post(url, body) {
            calls.push({ url, body });
            return { status: 200, data: { ok: true } };
        }
    };
}

const FieldValue = { serverTimestamp: () => "SERVER_TS" };
const CREDS = { token: "TEST_TOKEN", chatId: "12345" };

const PASSED_JOB_DRAFT = {
    title: "SPMCIL Deputy Manager Recruitment 2026 Apply Online 24 Posts",
    slug: "spmcil-dm-recruitment-2026",
    type: "JOB",
    articleType: "JOB",
    status: "draft",
    reviewStatus: "passed",
    reviewStale: false,
    reviewReport: { score: 92, issues: [] },
    wordCount: 1820,
    sourceUrl: "https://test.cbexams.com/EDPSU/SPMCIL/SPM/docs/Advt.pdf",
    metaDescription: "SPMCIL 24 manager posts — apply before 24 Aug 2026.",
    articleHtml: "<p>भर्ती की पूरी जानकारी यहाँ है।</p>"
};

function mockRes() {
    const out = { statusCode: null, body: null };
    return {
        out,
        status(c) { out.statusCode = c; return { json: (b) => { out.body = b; } }; },
        json(b) { out.statusCode = 200; out.body = b; }
    };
}

function mockCallbackReq(data, chatId = CREDS.chatId) {
    return {
        method: "POST",
        body: {
            callback_query: {
                id: "cq1",
                data,
                from: { id: Number(chatId) },
                message: { message_id: 77, text: "CARD", chat: { id: Number(chatId) } }
            }
        }
    };
}

// ---------------------------------------------------------------------
// Card building
// ---------------------------------------------------------------------
test("card — PASS draft pe PUBLISH/REJECT buttons, FAIL pe nahi", () => {
    const pass = buildDraftMessage(PASSED_JOB_DRAFT, "abc123");
    assert.equal(pass.canPublish, true);
    assert.deepEqual(
        pass.keyboard.inline_keyboard[0].map(b => b.callback_data),
        ["pub:abc123", "rej:abc123"]
    );
    assert.ok(pass.text.includes("SPMCIL Deputy Manager"));
    assert.ok(pass.text.includes("PASS"));
    assert.ok(pass.text.includes("92"));

    const fail = buildDraftMessage({ ...PASSED_JOB_DRAFT, reviewStatus: "failed", reviewReport: { score: 40, issues: ["dates:box-missing"] } }, "abc123");
    assert.equal(fail.canPublish, false);
    assert.equal(fail.keyboard, null);
    assert.ok(fail.text.includes("FAIL"));
    assert.ok(fail.text.includes("REGENERATE"));
});

test("card — HTML injection safe (title/source escaped)", () => {
    const msg = buildDraftMessage({ ...PASSED_JOB_DRAFT, title: "<b>Hack</b> & Co" }, "abc123");
    assert.ok(!msg.text.includes("<b>Hack</b> & Co"));
    assert.ok(msg.text.includes("&lt;b&gt;Hack&lt;/b&gt;"));
});

test("validDraftId — sirf safe ids", () => {
    assert.equal(validDraftId("abc123_X-Y"), true);
    assert.equal(validDraftId("a"), false);
    assert.equal(validDraftId("../evil"), false);
    assert.equal(validDraftId(""), false);
});

// ---------------------------------------------------------------------
// notifyDraft
// ---------------------------------------------------------------------
test("notifyDraft — keyboard ke saath sendMessage, no-creds pe skip", async () => {
    const http = makeMockHttp();
    const res = await notifyDraft(http, CREDS, PASSED_JOB_DRAFT, "abc123", { label: "🧠 AI DRAFT READY" });
    assert.equal(res.sent, true);
    assert.equal(http.calls.length, 1);
    assert.ok(http.calls[0].url.includes("/botTEST_TOKEN/sendMessage"));
    assert.equal(http.calls[0].body.chat_id, "12345");
    assert.ok(http.calls[0].body.reply_markup.inline_keyboard[0][0].callback_data === "pub:abc123");
    assert.ok(http.calls[0].body.text.includes("AI DRAFT READY"));

    const skipped = await notifyDraft(http, { token: "", chatId: "" }, PASSED_JOB_DRAFT, "abc123");
    assert.equal(skipped.sent, false);
});

// ---------------------------------------------------------------------
// publishDraftRecord (shared gate)
// ---------------------------------------------------------------------
test("publishDraftRecord — target write + draft delete + origin delete", async () => {
    const db = makeMockDb({
        "job_drafts/origin1": { title: "raw source row" },
        "ai_article_drafts/draftA1": PASSED_JOB_DRAFT
    });
    const result = await publishDraftRecord(db, FieldValue,
        { ...PASSED_JOB_DRAFT, originRef: { collection: "job_drafts", id: "origin1" } }, "draftA1");

    assert.equal(result.collection, "jobs");
    assert.equal(result.originDeleted, true);
    const dump = db.dump();
    assert.ok(dump["jobs/job-spmcil-dm-recruitment-2026"]);
    assert.equal(dump["jobs/job-spmcil-dm-recruitment-2026"].status, "published");
    assert.equal(dump["jobs/job-spmcil-dm-recruitment-2026"].createdAt, "SERVER_TS");
    assert.equal(dump["ai_article_drafts/draftA1"], undefined, "draft deleted");
    assert.equal(dump["job_drafts/origin1"], undefined, "origin deleted");
});

test("publishDraftRecord — failed review pe THROW, kuch bhi write nahi", async () => {
    const db = makeMockDb({ "ai_article_drafts/d2": { ...PASSED_JOB_DRAFT, reviewStatus: "failed" } });
    await assert.rejects(
        publishDraftRecord(db, FieldValue, { ...PASSED_JOB_DRAFT, reviewStatus: "failed" }, "d2"),
        (err) => err.code === "PUBLISH_BLOCKED"
    );
    const dump = db.dump();
    assert.ok(dump["ai_article_drafts/d2"], "draft intact");
    assert.equal(Object.keys(dump).filter(k => k.startsWith("jobs/")).length, 0);
});

// ---------------------------------------------------------------------
// Webhook — button click flows
// ---------------------------------------------------------------------
test("webhook GET — health ok", async () => {
    const handler = handleWebhook(makeMockDb(), FieldValue, makeMockHttp(), CREDS);
    const res = mockRes();
    await handler({ method: "GET", body: {} }, res);
    assert.equal(res.out.statusCode, 200);
    assert.equal(res.out.body.ok, true);
});

test("webhook ✅ PUBLISH — article live + draft delete + message edit", async () => {
    const db = makeMockDb({ "ai_article_drafts/draftA1": PASSED_JOB_DRAFT });
    const http = makeMockHttp();
    const handler = handleWebhook(db, FieldValue, http, CREDS);
    const res = mockRes();

    await handler(mockCallbackReq("pub:draftA1"), res);
    assert.equal(res.out.statusCode, 200);
    assert.equal(res.out.body.published, true);

    const dump = db.dump();
    assert.ok(dump["jobs/job-spmcil-dm-recruitment-2026"], "job published");
    assert.equal(dump["ai_article_drafts/draftA1"], undefined, "draft deleted");

    const answers = http.calls.filter(c => c.url.includes("answerCallbackQuery"));
    const edits = http.calls.filter(c => c.url.includes("editMessageText"));
    assert.equal(answers.length, 1);
    assert.ok(answers[0].body.text.includes("PUBLISHED"));
    assert.ok(edits.length >= 1);
    assert.ok(edits[0].body.text.includes("studygyaan.in/job/"));
});

test("webhook ❌ REJECT — draft delete, article KUCH publish nahi", async () => {
    const db = makeMockDb({ "ai_article_drafts/draftA1": PASSED_JOB_DRAFT });
    const http = makeMockHttp();
    const handler = handleWebhook(db, FieldValue, http, CREDS);
    const res = mockRes();

    await handler(mockCallbackReq("rej:draftA1"), res);
    assert.equal(res.out.body.rejected, true);
    const dump = db.dump();
    assert.equal(dump["ai_article_drafts/draftA1"], undefined);
    assert.equal(Object.keys(dump).filter(k => k.startsWith("jobs/")).length, 0);
});

test("webhook — dusre ka chat id ho to REFUSE (db untouched)", async () => {
    const db = makeMockDb({ "ai_article_drafts/draftA1": PASSED_JOB_DRAFT });
    const handler = handleWebhook(db, FieldValue, makeMockHttp(), CREDS);
    const res = mockRes();

    await handler(mockCallbackReq("pub:draftA1", "99999"), res);
    assert.equal(res.out.body.refused, true);
    const dump = db.dump();
    assert.ok(dump["ai_article_drafts/draftA1"], "draft intact");
});

test("webhook — already-deleted draft pe polite alreadyHandled", async () => {
    const db = makeMockDb();
    const handler = handleWebhook(db, FieldValue, makeMockHttp(), CREDS);
    const res = mockRes();

    await handler(mockCallbackReq("pub:gone123"), res);
    assert.equal(res.out.body.alreadyHandled, true);
});

test("webhook — failed-review draft publish nahi hota (blocked)", async () => {
    const db = makeMockDb({
        "ai_article_drafts/draftBB": { ...PASSED_JOB_DRAFT, reviewStatus: "failed" }
    });
    const handler = handleWebhook(db, FieldValue, makeMockHttp(), CREDS);
    const res = mockRes();

    await handler(mockCallbackReq("pub:draftBB"), res);
    assert.equal(res.out.body.blocked, "PUBLISH_BLOCKED");
    const dump = db.dump();
    assert.ok(dump["ai_article_drafts/draftBB"], "draft intact");
    assert.equal(Object.keys(dump).filter(k => k.startsWith("jobs/")).length, 0);
});

test("webhook — malformed callback ignore politely", async () => {
    const handler = handleWebhook(makeMockDb(), FieldValue, makeMockHttp(), CREDS);
    const res = mockRes();
    await handler(mockCallbackReq("huh?"), res);
    assert.equal(res.out.body.malformed, true);

    const res2 = mockRes();
    await handler({ method: "POST", body: { message: { text: "hi" } } }, res2);
    assert.equal(res2.out.body.ignored, true);
});

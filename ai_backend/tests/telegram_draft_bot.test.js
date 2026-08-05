"use strict";

/**
 * telegram_draft_bot.js + publishDraftRecord — approve-buttons flow ke tests.
 * Mock Telegram HTTP + mock Firestore se chalta hai (koi real call nahi).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    adminCredsFromEnv,
    buildDraftMessage,
    notifyDraft,
    handleWebhook,
    validDraftId
} = require("../telegram_draft_bot");

// ---------------------------------------------------------------------
// adminCredsFromEnv — PUBLIC vs PRIVATE channel separation
// ---------------------------------------------------------------------
test("adminCredsFromEnv — ADMIN id pe priority, fallback public id", () => {
    const backup = { ...process.env };
    try {
        process.env.TELEGRAM_BOT_TOKEN = "TOK";
        process.env.TELEGRAM_ADMIN_CHAT_ID = "-100999";
        process.env.TELEGRAM_CHAT_ID = "-100111";
        assert.deepEqual(adminCredsFromEnv(), { token: "TOK", chatId: "-100999" });

        delete process.env.TELEGRAM_ADMIN_CHAT_ID;
        assert.deepEqual(adminCredsFromEnv(), { token: "TOK", chatId: "-100111" });
    } finally {
        for (const k of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_CHAT_ID"]) {
            if (backup[k] === undefined) delete process.env[k];
            else process.env[k] = backup[k];
        }
    }
});
const { publishDraftRecord } = require("../agents/article_agents/article_pipeline");

// Webhook tests buttons-enable mode me chalte hain (admin id configured)
process.env.TELEGRAM_ADMIN_CHAT_ID = "-1009999";

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
test("card — PASS draft pe PUBLISH/EDIT/REJECT buttons, FAIL pe sirf EDIT/REJECT", () => {
    const pass = buildDraftMessage(PASSED_JOB_DRAFT, "abc123");
    assert.equal(pass.canPublish, true);
    // 3 buttons: PUBLISH (callback), EDIT (URL), REJECT (callback)
    const row = pass.keyboard.inline_keyboard[0];
    assert.equal(row.length, 3);
    assert.equal(row[0].callback_data, "pub:abc123");
    assert.ok(row[1].url.includes("editDraft=abc123"), "EDIT button studio deep-link hai");
    assert.equal(row[2].callback_data, "rej:abc123");
    assert.ok(pass.text.includes("SPMCIL Deputy Manager"));
    assert.ok(pass.text.includes("PASS"));
    assert.ok(pass.text.includes("92"));

    // FAIL draft — sirf EDIT + REJECT (PUBLISH button nahi kyunki review fail hai)
    const fail = buildDraftMessage({ ...PASSED_JOB_DRAFT, reviewStatus: "failed", reviewReport: { score: 40, issues: ["dates:box-missing"] } }, "abc123");
    assert.equal(fail.canPublish, false);
    assert.ok(fail.keyboard, "FAIL draft pe bhi keyboard aata hai (EDIT + REJECT)");
    const failRow = fail.keyboard.inline_keyboard[0];
    assert.equal(failRow.length, 2);
    assert.ok(failRow[0].url.includes("editDraft=abc123"), "FAIL pe bhi EDIT button");
    assert.equal(failRow[1].callback_data, "rej:abc123");
    assert.ok(fail.text.includes("FAIL"));
    assert.ok(fail.text.includes("Auto-Retry Machine"), "FAIL card ab retry-machine ka raasta batata hai");
});

test("card — self-heal attempts draft pe dikhte hain", () => {
    const msg = buildDraftMessage({ ...PASSED_JOB_DRAFT, repairAttempts: 3, repairPassedOnAttempt: 2 }, "abc123");
    assert.ok(msg.text.includes("🤖 Agent"));
    assert.ok(msg.text.includes("attempt 2/3"));
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

test("EDIT button — Telegram card me ✏️ EDIT URL button studio deep-link ke saath", () => {
    const msg = buildDraftMessage(PASSED_JOB_DRAFT, "draftX1");
    const editBtn = msg.keyboard.inline_keyboard[0].find(b => b.text.includes("EDIT"));
    assert.ok(editBtn, "EDIT button hai keyboard me");
    assert.ok(editBtn.url.includes("studygyaan.in/secret-admin"), "EDIT button admin panel ka URL hai");
    assert.ok(editBtn.url.includes("editDraft=draftX1"), "EDIT button me draftId deep-link param hai");
    assert.ok(editBtn.url.includes("tab=JOBS"), "EDIT button me tab switch param hai");
    assert.equal(editBtn.callback_data, undefined, "EDIT button URL button hai, callback nahi");
});

test("EDIT button — studio link card text me bhi draft-specific deep-link hai", () => {
    const msg = buildDraftMessage(PASSED_JOB_DRAFT, "draftY2");
    assert.ok(msg.text.includes("editDraft=draftY2"), "Card text me bhi studio deep-link");
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

test("buttons safety — withButtons:false pe PASS draft ke bhi keyboard nahi", () => {
    const msg = buildDraftMessage(PASSED_JOB_DRAFT, "abc123", { withButtons: false });
    assert.equal(msg.canPublish, true);
    assert.equal(msg.keyboard, null);
});

test("webhook — TELEGRAM_ADMIN_CHAT_ID missing ho to actions DISABLED", async () => {
    const backup = process.env.TELEGRAM_ADMIN_CHAT_ID;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    try {
        const db = makeMockDb({ "ai_article_drafts/draftA1": PASSED_JOB_DRAFT });
        const handler = handleWebhook(db, FieldValue, makeMockHttp(), CREDS);
        const res = mockRes();
        await handler(mockCallbackReq("pub:draftA1"), res);
        assert.equal(res.out.body.disabled, "TELEGRAM_ADMIN_CHAT_ID not set — approve buttons disabled");
        assert.ok(db.dump()["ai_article_drafts/draftA1"], "draft intact");
    } finally {
        process.env.TELEGRAM_ADMIN_CHAT_ID = backup;
    }
});

/**
 * telegram_draft_bot.js — TELEGRAM APPROVE BUTTONS 📲
 * =====================================================
 * AI draft bante hi Telegram pe card aata hai:
 *   [✅ PUBLISH]  → publishDraftRecord (same gate as studio publish button)
 *   [❌ REJECT]   → draft delete
 *
 * - Review FAIL draft pe PUBLISH button bhejte hi nahi — galti se bhi publish
 *   ho hi nahi sakta (server-side gate phir bhi re-check karta hai).
 * - Sirf अपने chat id ke callbacks accept hote hain.
 * - http client injected (default axios ke place pe) — unit-test friendly.
 *
 * One-time setup (user): Telegram webhook set karo:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<telegramDraftWebhook URL>
 */

const axios = require("axios");
const { publishDraftRecord } = require("./agents/article_agents/article_pipeline");

const DRAFT_COLLECTION = "ai_article_drafts";
const STUDIO_URL = "https://studygyaan.in/secret-admin";
const SITE = "https://studygyaan.in";
const TGM_BASE = "https://api.telegram.org";

// ---------------------------------------------------------------------------
// 🔧 small helpers
// ---------------------------------------------------------------------------
function escHtml(v) {
    return String(v === undefined || v === null ? "" : v)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function validDraftId(id) {
    return /^[A-Za-z0-9_-]{4,128}$/.test(String(id || ""));
}

function draftTypeLabel(draft) {
    const type = String(draft.type || draft.articleType || "").toUpperCase();
    return type === "JOB" ? "🏛️ JOB" : "⚡ FAST TRACK";
}

/** Env se ADMIN notification creds — PUBLIC channel alerts se alag.
 *  TELEGRAM_ADMIN_CHAT_ID (private channel/group) > TELEGRAM_CHAT_ID (fallback).
 *  Bot token wahi rehta hai — ek hi bot dono channels me ho sakta hai. */
function adminCredsFromEnv() {
    return {
        token: process.env.TELEGRAM_BOT_TOKEN || "",
        chatId: process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || ""
    };
}

/** Draft se Telegram card (text + keyboard) banao. */
function buildDraftCard(draft, opts) {
    const label = (opts && opts.label) || "AI DRAFT READY";
    const reviewPassed = draft.reviewStatus === "passed" && draft.reviewStale !== true;
    const score = draft.reviewReport && typeof draft.reviewReport.score === "number"
        ? draft.reviewReport.score : null;
    const issues = (draft.reviewReport && Array.isArray(draft.reviewReport.issues))
        ? draft.reviewReport.issues : [];
    const words = draft.wordCount || 0;
    const sourceHost = (() => {
        try { return new URL(draft.sourceUrl || "").hostname.replace(/^www\./, ""); }
        catch { return ""; }
    })();

    const lines = [
        `<b>${escHtml(label)} — ${draftTypeLabel(draft)}${score !== null ? ` ⭐${score}` : ""}</b>`,
        "",
        `<b>${escHtml(draft.title || "(no title)")}</b>`,
        "",
        reviewPassed
            ? `✅ Review: <b>PASS</b>${score !== null ? ` (${score}/100)` : ""}`
            : `❌ Review: <b>FAIL</b> — studio me REGENERATE dabao`,
        `⚠️ Issues: ${issues.length} | 📝 Words: ${words}`,
    ];
    if (sourceHost) lines.push(`🔗 Source: ${escHtml(sourceHost)}`);
    if (!reviewPassed && issues.length) {
        lines.push("", `<i>${escHtml(issues.slice(0, 2).join("; ")).slice(0, 180)}</i>`);
    }
    lines.push("", `<a href="${STUDIO_URL}">🛠️ Studio kholo</a>`);

    return { text: lines.join("\n"), canPublish: reviewPassed };
}

/** Final card — callback_data me draft id inject karke. */
function buildDraftMessage(draft, draftId, opts) {
    const card = buildDraftCard(draft, opts);
    let keyboard = null;
    if (card.canPublish) {
        keyboard = {
            inline_keyboard: [[
                { text: "✅ PUBLISH KARO", callback_data: `pub:${draftId}` },
                { text: "❌ REJECT", callback_data: `rej:${draftId}` }
            ]]
        };
    }
    return { text: card.text, canPublish: card.canPublish, keyboard };
}

// ---------------------------------------------------------------------------
// 📤 Notify — draft bante hi card bhejo (fire-and-forget friendly)
// ---------------------------------------------------------------------------
async function notifyDraft(http, creds, draft, draftId, opts) {
    const client = http || axios;
    if (!creds || !creds.token || !creds.chatId) return { sent: false, reason: "no-creds" };
    if (!validDraftId(draftId)) return { sent: false, reason: "bad-id" };

    const msg = buildDraftMessage(draft, draftId, opts);
    const body = {
        chat_id: creds.chatId,
        text: msg.text,
        parse_mode: "HTML",
        disable_web_page_preview: true
    };
    if (msg.keyboard) body.reply_markup = msg.keyboard;

    await client.post(`${TGM_BASE}/bot${creds.token}/sendMessage`, body, { timeout: 15000 });
    return { sent: true, canPublish: msg.canPublish };
}

// ---------------------------------------------------------------------------
// 🎛️ Webhook — button clicks handle karo
// ---------------------------------------------------------------------------
function handleWebhook(db, FieldValue, http, creds) {
    const client = http || axios;

    const answer = async (callbackId, text) => {
        await client.post(`${TGM_BASE}/bot${creds.token}/answerCallbackQuery`, {
            callback_query_id: String(callbackId), text: String(text).slice(0, 190)
        }, { timeout: 15000 }).catch(e => console.warn("answerCallback:", e.message));
    };

    const editMessage = async (chatId, messageId, text) => {
        await client.post(`${TGM_BASE}/bot${creds.token}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
        }, { timeout: 15000 }).catch(e => console.warn("editMessage:", e.message));
    };

    return async (req, res) => {
        if (req.method === "GET") {
            return res.status(200).json({ ok: true, hint: "Telegram Draft Bot webhook live" });
        }
        if (!creds || !creds.token || !creds.chatId) {
            return res.status(503).json({ ok: false, error: "TELEGRAM creds not configured" });
        }

        try {
            const cq = req.body && req.body.callback_query;
            if (!cq) {
                // normal message/update — ignore politely
                return res.status(200).json({ ok: true, ignored: true });
            }

            const fromChat = String((cq.message && cq.message.chat && cq.message.chat.id) || cq.from && cq.from.id || "");
            // Sirf apna chat — koi aur button na daba paye
            if (fromChat !== String(creds.chatId)) {
                await answer(cq.id, "⛔ Ye buttons sirf admin ke liye hain.");
                return res.status(200).json({ ok: true, refused: true });
            }

            const data = String(cq.data || "");
            const match = data.match(/^(pub|rej):([A-Za-z0-9_-]{2,128})$/);
            if (!match) {
                await answer(cq.id, "Purana/button samajh nahi aaya — studio se karo.");
                return res.status(200).json({ ok: true, malformed: true });
            }
            const action = match[1];
            const draftId = match[2];

            const snap = await db.collection(DRAFT_COLLECTION).doc(draftId).get();
            if (!snap.exists) {
                await answer(cq.id, "ℹ️ Ye draft publish/delete ho chuka hai.");
                if (cq.message) {
                    await editMessage(creds.chatId, cq.message.message_id,
                        `<s>${escHtml(cq.message.text || "")}</s>\n\n<b>ℹ️ Already handled.</b>`);
                }
                return res.status(200).json({ ok: true, alreadyHandled: true });
            }
            const draft = snap.data();
            const titleLine = escHtml(String(draft.title || draftId));

            if (action === "rej") {
                await db.collection(DRAFT_COLLECTION).doc(draftId).delete();
                await answer(cq.id, "🗑️ Draft rejected");
                if (cq.message) {
                    await editMessage(creds.chatId, cq.message.message_id,
                        `🗑️ <b>REJECTED</b>\n\n<s>${titleLine}</s>`);
                }
                return res.status(200).json({ ok: true, rejected: true, draftId });
            }

            // action === "pub" — same guarded publish as studio button
            try {
                const result = await publishDraftRecord(db, FieldValue, draft, draftId);
                const publicUrl = result.collection === "jobs"
                    ? `${SITE}/job/${result.payload.slug || result.docId}`
                    : `${SITE}/fasttrack/${result.docId}`;
                await answer(cq.id, "🎉 PUBLISHED! Site live ho gaya.");
                if (cq.message) {
                    await editMessage(creds.chatId, cq.message.message_id,
                        `✅ <b>PUBLISHED</b> — ${draftTypeLabel(draft)}\n\n${titleLine}\n\n` +
                        `🌐 <a href="${publicUrl}">${publicUrl}</a>\n` +
                        (result.originDeleted ? "🧹 source-record bhi saaf\n" : "") +
                        "📱 Web story + Google indexing ping backend se auto ho jayega.");
                }
                return res.status(200).json({ ok: true, published: true, draftId, docId: result.docId });
            } catch (pubErr) {
                const blocked = pubErr && (pubErr.code === "PUBLISH_BLOCKED" || pubErr.code === "ALREADY_PUBLISHED");
                if (blocked) {
                    await answer(cq.id, `🚫 ${String(pubErr.message).slice(0, 150)}`);
                    return res.status(200).json({ ok: true, blocked: pubErr.code });
                }
                throw pubErr;
            }
        } catch (error) {
            console.error("❌ telegram webhook:", error);
            // Telegram ko 200 hi do — varna wo retry-bomb karega
            return res.status(200).json({ ok: false, error: String(error.message || error) });
        }
    };
}

module.exports = {
    adminCredsFromEnv,
    buildDraftCard,
    buildDraftMessage,
    notifyDraft,
    handleWebhook,
    validDraftId
};

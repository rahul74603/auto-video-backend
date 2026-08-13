"use strict";

/**
 * ============================================================================
 * 💬 StudyGyaan AI Sathi — Conversational Search (RAG chatbot) via Vertex AI
 * ============================================================================
 * Is credit ke eligible SKU me se: "Generative AI Agents & Chatbots" aur
 * "Vertex AI Search (Q&A)" — yahan use hota hai.
 *
 * ConversationalSearchServiceClient.converseConversation aapke data store ke
 * content (jobs/blogs/articles) se GROUNDED answers deta hai — sources ke
 * saath. ConversationId se multi-turn chat maintain hoti hai.
 *
 * Graceful fail — VERTEX_NOT_CONFIGURED pe bhi existing program nahi toota.
 * ============================================================================
 */

const vc = require("./vertex_client");

function clientFactory() {
  const { ConversationalSearchServiceClient } = (() => {
    try {
      return require("@google-cloud/discoveryengine").v1;
    } catch {
      return {};
    }
  })();
  if (!ConversationalSearchServiceClient) vc.requireLibrary();
  return vc.clientFor(ConversationalSearchServiceClient);
}

function conversationPath(cfg, conversationId) {
  return `${vc.dataStorePath(cfg)}/conversations/${conversationId}`;
}

/**
 * Ek conversational turn (chat message) — grounded answer deta hai.
 * @param {{message:string, conversationId?:string}} input
 * @returns {Promise<{reply:string, sources:Array, conversationId:string, raw:object}>}
 */
async function chat({ message, conversationId } = {}) {
  if (!message || !String(message).trim()) {
    const err = new Error("message required");
    err.code = "BAD_REQUEST";
    throw err;
  }
  const client = clientFactory();
  const cfg = vc.config();

  const hasConversation = Boolean(conversationId);
  const name = hasConversation
    ? conversationPath(cfg, conversationId)
    : vc.dataStorePath(cfg) + "/conversations/-"; // server auto-creates

  const request = {
    name,
    query: { text: String(message).trim() },
    servingConfig: vc.servingConfigPath(cfg),
  };

  const [resp] = await client.converseConversation(request);
  const reply = resp.reply?.reply || resp.reply?.summary?.summaryText || "";
  const sources = (resp.reply?.groundingSources || resp.reply?.sources || [])
    .map((s, i) => ({ rank: i + 1, title: s.title, uri: s.uri }))
    .filter((s) => s.title || s.uri);

  return {
    reply,
    sources,
    conversationId: resp.conversation?.name || conversationId || "",
    raw: resp,
  };
}

module.exports = { chat };

"use strict";

/**
 * ============================================================================
 * 🧩 Vertex AI Agent Builder — shared client + config
 * ============================================================================
 * Is credit (₹91,785 ≈ $1,000 USD, valid till 2027-03-01) SIRF Google Cloud
 * ke "GenAI App Builder / Vertex AI Agent Builder" SKUs pe apply hota hai.
 * Standard Gemini API key / AI Studio us credit ko consume NAHI karta.
 *
 * Ye module @google-cloud/discoveryengine (Vertex AI Search + Conversational
 * agents / RAG + Grounding + Document ingestion) ko configure karta hai —
 * yahi wo SKUs hain jin par aapka credit chalta hai.
 *
 * # Required env (ai_backend/.env ya GitHub Secrets):
 *   SERVICE_ACCOUNT_JSON   (pehle se hai — isi se authenticate hota hai)
 *   VERTEX_PROJECT_ID      (Google Cloud project id)
 *   VERTEX_LOCATION        (default: global)
 *   VERTEX_DATA_STORE_ID   (Agent Builder me banaya hua data store)
 *   VERTEX_SERVING_CONFIG  (default: default_search)
 *   VERTEX_ENGINE_ID       (optional — Engine/Agent engine ke liye)
 *   VERTEX_GENERATIVE_MODEL(optional — grounding model, e.g. gemini-2.0-flash)
 *
 * Agar config nahi mili to functions NOT_CONFIGURED error dete hain — koi
 * crash nahi. Pura module gracefully fail hota hai taaki existing program na
 * toote.
 * ============================================================================
 */

const VERTEX_CODES = {
  NOT_CONFIGURED: "VERTEX_NOT_CONFIGURED",
  NOT_INSTALLED: "VERTEX_LIB_NOT_INSTALLED",
};

function envOr(key, def) {
  const v = process.env[key];
  return v !== undefined && String(v).trim() !== "" ? v : def;
}

function getCredentials() {
  const sa = envOr("SERVICE_ACCOUNT_JSON", "");
  if (sa) {
    try {
      const parsed = JSON.parse(sa);
      return { credentials: parsed, projectId: parsed.project_id || envOr("VERTEX_PROJECT_ID", "") };
    } catch {
      /* fall through to projectId-only */
    }
  }
  return { projectId: envOr("VERTEX_PROJECT_ID", "") };
}

function config() {
  return {
    projectId: envOr("VERTEX_PROJECT_ID", ""),
    location: envOr("VERTEX_LOCATION", "global"),
    dataStoreId: envOr("VERTEX_DATA_STORE_ID", ""),
    servingConfig: envOr("VERTEX_SERVING_CONFIG", "default_search"),
    engineId: envOr("VERTEX_ENGINE_ID", ""),
    generativeModel: envOr("VERTEX_GENERATIVE_MODEL", "gemini-2.0-flash"),
    creditBudgetInr: Number(envOr("VERTEX_CREDIT_BUDGET_INR", 91785)),
    // Conservative per-call cost estimates (₹) — billing asli amount ke aas-paas.
    // Inhe apne actual Cloud Billing se calibrate kar sakte ho.
    costSearchInr: Number(envOr("VERTEX_COST_SEARCH_INR", 0.02)),   // ₹ per Enterprise Search query
    costChatInr: Number(envOr("VERTEX_COST_CHAT_INR", 0.05)),       // ₹ per conversational request
    costGroundInr: Number(envOr("VERTEX_COST_GROUND_INR", 0.06)),   // ₹ per grounded generation
    costIngestInrPerDoc: Number(envOr("VERTEX_COST_INGEST_PER_DOC_INR", 0.005)), // ₹ per doc ingested
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.projectId && c.dataStoreId);
}

/** Human-readable config status (health check ke liye). */
function describeStatus() {
  const c = config();
  return {
    configured: isConfigured(),
    projectId: c.projectId || "(missing VERTEX_PROJECT_ID)",
    location: c.location,
    dataStoreId: c.dataStoreId || "(missing VERTEX_DATA_STORE_ID)",
    servingConfig: c.servingConfig,
    engineId: c.engineId || null,
    generativeModel: c.generativeModel,
    creditBudgetInr: c.creditBudgetInr,
    serviceAccountProvided: Boolean(envOr("SERVICE_ACCOUNT_JSON", "")),
  };
}

function requireLibrary() {
  try {
    return require("@google-cloud/discoveryengine");
  } catch {
    const err = new Error(
      "@google-cloud/discoveryengine not installed. Run: cd ai_backend && npm install @google-cloud/discoveryengine --ignore-scripts"
    );
    err.code = VERTEX_CODES.NOT_INSTALLED;
    throw err;
  }
}

/**
 * Data store serving config path (Vertex AI Search / RAG + chat).
 * projects/{project}/locations/{location}/collections/default_collection/dataStores/{ds}/servingConfigs/{sc}
 */
function servingConfigPath(cfg = config()) {
  return [
    "projects", cfg.projectId,
    "locations", cfg.location,
    "collections", "default_collection",
    "dataStores", cfg.dataStoreId,
    "servingConfigs", cfg.servingConfig,
  ].join("/");
}

/** Data store path (documents, conversations). */
function dataStorePath(cfg = config()) {
  return [
    "projects", cfg.projectId,
    "locations", cfg.location,
    "collections", "default_collection",
    "dataStores", cfg.dataStoreId,
  ].join("/");
}

/** Engine path (agent engine, optional). */
function enginePath(cfg = config()) {
  return [
    "projects", cfg.projectId,
    "locations", cfg.location,
    "collections", "default_collection",
    "engines", cfg.engineId,
  ].join("/");
}

/**
 * Thread-safe-ish client cache. Har client class ko ek singleton.
 * Auth: SERVICE_ACCOUNT_JSON (credentials) → default credentials (ADC) → projectId.
 */
const _clients = new Map();
function clientFor(ClientClass) {
  if (_clients.has(ClientClass)) return _clients.get(ClientClass);
  if (!isConfigured()) {
    const err = new Error(
      "Vertex AI Agent Builder not configured. Set VERTEX_PROJECT_ID & VERTEX_DATA_STORE_ID (and SERVICE_ACCOUNT_JSON)."
    );
    err.code = VERTEX_CODES.NOT_CONFIGURED;
    throw err;
  }
  const { credentials, projectId } = getCredentials();
  const options = { projectId };
  if (credentials) options.credentials = credentials;
  const client = new ClientClass(options);
  _clients.set(ClientClass, client);
  return client;
}

module.exports = {
  VERTEX_CODES,
  config,
  isConfigured,
  describeStatus,
  requireLibrary,
  servingConfigPath,
  dataStorePath,
  enginePath,
  clientFor,
};

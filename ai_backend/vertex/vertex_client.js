"use strict";

// .env ko load karo taaki CLI (node vertex/vertex_cli.js --health) bhi
// ai_backend/.env me likhi VALUES (VERTEX_PROJECT_ID, VERTEX_DATA_STORE_ID,
// SERVICE_ACCOUNT_JSON) ko padh sake. dotenv na ho to gracefully chalta rahe.
try {
  const path = require("path");
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
} catch { /* dotenv optional */ }

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

/**
 * Service account credentials dhundhta hai — in is order:
 *   1. env SERVICE_ACCOUNT_JSON (ek-line JSON ya raw multiline JSON string)
 *   2. ai_backend/service_account.json file (jiski baat tumne ki thi)
 *   3. GOOGLE_APPLICATION_CREDENTIALS file path
 * @returns {string} JSON string ya "" (nahi mila)
 */
function resolveServiceAccountJson() {
  const fromEnv = envOr("SERVICE_ACCOUNT_JSON", "");
  if (fromEnv) return fromEnv;
  const fs = require("fs");
  const path = require("path");
  const candidates = [
    path.join(__dirname, "..", "service_account.json"),
    path.join(__dirname, "..", "service-account.json"),
    envOr("GOOGLE_APPLICATION_CREDENTIALS", ""),
  ];
  for (const f of candidates) {
    if (f && fs.existsSync(f)) {
      try { return fs.readFileSync(f, "utf8"); } catch { /* try next */ }
    }
  }
  return "";
}

/** Parse karo — chaahe ek-line ho ya multiline JSON. */
function parseServiceAccount(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function getCredentials() {
  const raw = resolveServiceAccountJson();
  const parsed = parseServiceAccount(raw);
  if (parsed) {
    return { credentials: parsed, projectId: parsed.project_id || envOr("VERTEX_PROJECT_ID", "") };
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
    serviceAccountProvided: Boolean(resolveServiceAccountJson()),
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
 * Serving config path for search.
 * Agar VERTEX_ENGINE_ID set hai to ENGINE serving config use karo (Structured
 * data / app wale data stores me yahi sahi path hota hai):
 *   projects/{p}/locations/{l}/collections/default_collection/engines/{e}/servingConfigs/{sc}
 * Warna data store serving config.
 */
function servingConfigPath(cfg = config()) {
  if (cfg.engineId) {
    return [
      "projects", cfg.projectId,
      "locations", cfg.location,
      "collections", "default_collection",
      "engines", cfg.engineId,
      "servingConfigs", cfg.servingConfig,
    ].join("/");
  }
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

/**
 * Data store collection path (parent for creating data stores).
 */
function dataStoreParentPath(cfg = config()) {
  return [
    "projects", cfg.projectId,
    "locations", cfg.location,
    "collections", "default_collection",
  ].join("/");
}

/**
 * Naya data store banata hai via API — taaki type pe FULL control ho.
 * Console me "type" choose karne ka option nahi milta isliye ye rasta diya.
 * Unstructured data store = free-text search (jobs/blogs/content) ke liye.
 * @param {string} name — display name
 * @param {{projectId?:string,location?:string}} opts
 * @returns {Promise<{name:string, displayName:string, projectId:string, location:string}>}
 */
async function createDataStore(name, opts = {}) {
  const { DataStoreServiceClient } = requireLibrary().v1;
  const cfg = config();
  const projectId = opts.projectId || cfg.projectId;
  const location = opts.location || cfg.location;
  if (!projectId) {
    const err = new Error("VERTEX_PROJECT_ID required to create data store");
    err.code = VERTEX_CODES.NOT_CONFIGURED;
    throw err;
  }
  const client = clientFor(DataStoreServiceClient);
  const parent = [
    "projects", projectId,
    "locations", location,
    "collections", "default_collection",
  ].join("/");
  const storeId = `studygyaan-${Date.now()}`;
  const [operation] = await client.createDataStore({
    parent,
    dataStoreId: storeId,
    dataStore: {
      displayName: name,
      industryVertical: "GENERIC",
      solutionTypes: ["SOLUTION_TYPE_SEARCH"],
      // Unstructured store — content field (free text) searchable hone ke liye
      // CONTENT_REQUIRED hona chahiye (NO_CONTENT = structured/no-text store).
      contentConfig: "CONTENT_REQUIRED",
    },
  });
  const [resp] = await operation.promise();
  return {
    name: resp?.name || "",
    id: storeId,
    displayName: resp?.displayName || name,
    projectId,
    location,
  };
}

/**
 * Firebase Admin ko SERVICE_ACCOUNT_JSON se initialize karta hai (agar mila).
 * @returns {object|null} firestore ya null (fail pe)
 */
function firestore() {
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      const sa = resolveServiceAccountJson();
      const parsed = parseServiceAccount(sa);
      if (parsed) {
        try { admin.initializeApp({ credential: admin.credential.cert(parsed), projectId: parsed.project_id || envOr("VERTEX_PROJECT_ID", "") || undefined }); }
        catch { admin.initializeApp(); }
      } else {
        admin.initializeApp();
      }
    }
    return admin.firestore();
  } catch { return null; }
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
  dataStoreParentPath,
  createDataStore,
  clientFor,
  firestore,
};

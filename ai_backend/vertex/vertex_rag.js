"use strict";

/**
 * ============================================================================
 * 🔎 Vertex AI Search (Enterprise Search / RAG) + Document Ingestion
 * ============================================================================
 * Is credit ke eligible SKUs me se: "Vertex AI Search (Enterprise Search / RAG)"
 * aur "RAG & Grounding APIs" — dono yahan use hote hain.
 *
 *  - search()        : data store me grounded search (serving config pe)
 *  - ingestFromFirestore(): Firestore ke published jobs/blogs/articles ko
 *                          Vertex data store me import karta hai (billing SKU:
 *                          document ingestion) — isi se credit consume hota hai.
 *  - purgeDocuments() / listDocuments(): maintenance
 *
 * Sab functions graceful fail karte hain (VERTEX_NOT_CONFIGURED) — existing
 * program kabhi nahi tootega.
 * ============================================================================
 */

const { SearchServiceClient, DocumentServiceClient } = (() => {
  try {
    return require("@google-cloud/discoveryengine").v1;
  } catch {
    return {};
  }
})();
const vc = require("./vertex_client");

function ensureLib() {
  if (!SearchServiceClient || !DocumentServiceClient) vc.requireLibrary();
}

/**
 * Branch path — import/purge/list documents ko chahiye.
 * projects/{p}/locations/{l}/collections/default_collection/dataStores/{ds}/branches/default_branch
 */
function branchPath() {
  return `${vc.dataStorePath()}/branches/default_branch`;
}

/**
 * Vertex AI Search over StudyGyaan data store.
 * NOTE: Standard Edition compatible — extractive/enterprise features OFF
 * (aapka data store Standard Edition hai). Snippet document ke struct_data se
 * nikala jata hai.
 * @param {{query:string,pageSize?:number,filter?:string}} input
 * @returns {Promise<{answers:Array, total:number, raw:Array}>}
 */
async function search({ query, pageSize = 5, filter } = {}) {
  ensureLib();
  if (!query || !String(query).trim()) {
    const err = new Error("query required");
    err.code = "BAD_REQUEST";
    throw err;
  }
  const client = vc.clientFor(SearchServiceClient);
  const request = {
    servingConfig: vc.servingConfigPath(),
    query: { text: String(query).trim() },
    pageSize,
    // autoPaginate false taaki pageSize respect ho (warning nahi aaye)
    autoPaginate: false,
    contentSearchSpec: {
      searchResultMode: "DOCUMENT",
      snippetSpec: { returnSnippet: true },
    },
  };
  if (filter) request.filter = filter;

  const [resp] = await client.search(request);

  // derivedStructData ke fields ko {key: {stringValue}} format se nikalo.
  const flatten = (struct = {}) => {
    const out = {};
    const fields = struct.fields || struct;
    for (const [k, v] of Object.entries(fields || {})) {
      if (v && typeof v === "object") out[k] = v.stringValue || v.numberValue || "";
      else out[k] = v;
    }
    return out;
  };

  const answers = (resp.results || []).map((r, i) => {
    const d = flatten(r.document?.derivedStructData);
    return {
      rank: i + 1,
      id: r.document?.id,
      title: d.title || r.document?.name,
      url: d.link || d.url || "",
      snippet: (d.content || d.description || "").slice(0, 500),
      extractiveAnswer: null,
    };
  });
  return {
    answers,
    total: resp.totalSize != null ? Number(resp.totalSize) : answers.length,
    raw: resp.results || [],
  };
}

/** Build a Discovery Engine Document from a StudyGyaan record. */
function toVertexDocument({ id, title, url, content, schema, fields = {} }) {
  // struct_data ek plain object hona chahiye { field: value } — wrapper nahi.
  const structData = { title, link: url, content, ...fields };
  const doc = {
    id: String(id),
    structData,
  };
  if (schema) doc.schemaId = schema;
  return doc;
}

/**
 * Import a batch of inline documents into the data store.
 * Discovery Engine ek call me at most 100 inline documents leta hai, isliye
 * hum 100 ke chunks me import karte hain.
 * @param {Array} docs — toVertexDocument() output
 * @returns {Promise<{imported:number, operation:boolean, batches:number}>}
 */
async function importDocuments(docs = []) {
  ensureLib();
  if (!docs.length) return { imported: 0, operation: false, batches: 0 };
  const client = vc.clientFor(DocumentServiceClient);
  const parent = branchPath(); // import ko branch path chahiye

  const BATCH_SIZE = 100;
  const chunks = [];
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    chunks.push(docs.slice(i, i + BATCH_SIZE));
  }

  let imported = 0;
  for (const chunk of chunks) {
    const [operation] = await client.importDocuments({
      parent,
      inlineSource: { documents: chunk },
    });
    await operation?.promise?.().catch(() => {});
    imported += chunk.length;
  }

  return { imported, operation: true, batches: chunks.length };
}

/**
 * Purge (clear) data store — maintenance/red-ingest se pehle optional.
 * @param {{deleteAll?:boolean,docIds?:string[]}} opts
 */
async function purgeDocuments(opts = {}) {
  ensureLib();
  const client = vc.clientFor(DocumentServiceClient);
  const parent = vc.dataStorePath();
  const request = { parent, force: true };
  if (opts.deleteAll) request.deleteAll = true;
  else if (opts.docIds && opts.docIds.length) request.filter = `id in (${opts.docIds.map((d) => `"${d}"`).join(", ")})`;
  else return { purged: 0 };
  const [operation] = await client.purgeDocuments(request);
  const [resp] = await operation.promise();
  return { purged: Number(resp.purgeCount || 0) };
}

async function listDocuments(pageSize = 100) {
  ensureLib();
  const client = vc.clientFor(DocumentServiceClient);
  const [resp] = await client.listDocuments({ parent: branchPath(), pageSize });
  return (resp.documents || []).map((d) => ({ id: d.id, name: d.name }));
}

module.exports = { search, importDocuments, purgeDocuments, listDocuments, toVertexDocument, branchPath };

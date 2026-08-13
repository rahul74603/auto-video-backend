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
 * Grounded enterprise search over StudyGyaan data store.
 * @param {{query:string,pageSize?:number,filter?:string,returnExtractive?:boolean}} input
 * @returns {Promise<{answers:Array, total:number, raw:Array}>}
 */
async function search({ query, pageSize = 5, filter, returnExtractive = true } = {}) {
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
    contentSearchSpec: {
      searchResultMode: returnExtractive ? "CHUNKS" : "DOCUMENT",
      snippetSpec: { returnSnippet: true },
    },
  };
  if (filter) request.filter = filter;
  if (returnExtractive) {
    request.contentSearchSpec.extractiveContentSpec = { maxExtractiveAnswerCount: 2 };
  }

  const [resp] = await client.search(request);
  const answers = (resp.results || []).map((r, i) => {
    const struct = r.document?.derivedStructData || {};
    const fields = struct.fields || {};
    const pick = (k) => {
      const f = fields[k];
      return f ? f.stringValue || f.numberValue || JSON.stringify(f) : "";
    };
    const chunk = struct.chunks && struct.chunks[0];
    return {
      rank: i + 1,
      id: r.document?.id,
      title: pick("title") || r.document?.name,
      url: pick("link") || pick("url") || "",
      snippet: chunk ? chunk.content : (pick("content") || pick("description") || "").slice(0, 500),
      extractiveAnswer: chunk?.pageSpan ? chunk.content : null,
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
  const structData = { title, link: url, content, ...fields };
  const doc = {
    id: String(id),
    structData: { fields: structData },
  };
  if (schema) doc.schemaId = schema;
  return doc;
}

/**
 * Import a batch of inline documents into the data store.
 * @param {Array} docs — toVertexDocument() output
 * @returns {Promise<{imported:number, operation:boolean}>}
 */
async function importDocuments(docs = []) {
  ensureLib();
  if (!docs.length) return { imported: 0, operation: false };
  const client = vc.clientFor(DocumentServiceClient);
  const parent = vc.dataStorePath();
  const [operation] = await client.importDocuments({
    parent,
    inlineSource: { documents: docs },
  });
  // operation is a LRO; we fire-and-forget (operation handles async ingestion)
  await operation?.promise?.().catch(() => {});
  return { imported: docs.length, operation: true };
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
  const [resp] = await client.listDocuments({ parent: vc.dataStorePath(), pageSize });
  return (resp.documents || []).map((d) => ({ id: d.id, name: d.name }));
}

module.exports = { search, importDocuments, purgeDocuments, listDocuments, toVertexDocument };

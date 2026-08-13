"use strict";

/**
 * ============================================================================
 * 📥 StudyGyaan → Vertex AI data store ingestion (RAG corpus banane ke liye)
 * ============================================================================
 * Firestore ke published documents (jobs / blogs / fast_track / web_stories /
 * mock_tests) ko read karke Vertex data store me import karta hai. Document
 * ingestion bhi is credit ka eligible SKU hai — isliye ye isko consume karta
 * hai aur saath me assistant ko grounded corpus deta hai.
 *
 * `collectionMap` se baaki collections aasaan se add ho sakte hain.
 * ============================================================================
 */

const vrag = require("./vertex_rag");

/**
 * Firestore collection → how to build a Vertex document.
 * `content` chhota/structured rakha hai taaki chunking clean ho.
 */
const COLLECTION_MAP = {
  jobs: {
    label: "jobs",
    publishedOnly: true,
    fields: ["title", "slug", "qualification", "lastDate", "totalPosts", "applicationFee", "salary", "category"],
    makeDoc: (doc) => ({
      id: `job-${doc.id}`,
      title: doc.title || doc.jobTitle || "Job",
      url: `https://studygyaan.in/job/${doc.slug || doc.id}`,
      content: [
        doc.jobTitle || doc.title,
        doc.description || doc.eligibility || "",
        `Qualification: ${doc.qualification || "—"}`,
        `Last date: ${doc.lastDate || doc.lastDateStr || "—"}`,
        `Total posts: ${doc.totalPosts || "—"}`,
        `Salary: ${doc.salary || "—"}`,
        `Category: ${doc.category || "—"}`,
      ].filter(Boolean).join("\n"),
      fields: { jobType: "job", category: doc.category || "" },
    }),
  },
  blogs: {
    label: "blogs",
    publishedOnly: true,
    fields: ["title", "slug", "category", "tags", "seoTitle"],
    makeDoc: (doc) => ({
      id: `blog-${doc.id}`,
      title: doc.title || doc.seoTitle || "Blog",
      url: `https://studygyaan.in/blog/${doc.slug || doc.id}`,
      content: [doc.title, doc.excerpt || "", (doc.content || "").replace(/<[^>]+>/g, " ").slice(0, 3000)].filter(Boolean).join("\n"),
      fields: { jobType: "blog", category: doc.category || "" },
    }),
  },
  fast_track: {
    label: "fast_track",
    publishedOnly: true,
    fields: ["title", "slug", "subject", "exam"],
    makeDoc: (doc) => ({
      id: `fast-${doc.id}`,
      title: doc.title || "Fast Track",
      url: `https://studygyaan.in/fast-track/${doc.slug || doc.id}`,
      content: [doc.title, doc.subject || "", doc.exam || "", (doc.description || "")].filter(Boolean).join("\n"),
      fields: { jobType: "fast_track", subject: doc.subject || "" },
    }),
  },
};

/**
 * Ek collection ke published docs ko Vertex data store me import karta hai.
 * @returns {Promise<{imported:number, collection:string, spentInr:number}>}
 */
async function ingestCollection(db, collection, { limit = 200, dryRun = false } = {}) {
  const spec = COLLECTION_MAP[collection];
  if (!spec) throw new Error(`Unknown collection '${collection}'. Supported: ${Object.keys(COLLECTION_MAP).join(", ")}`);

  const q = db.collection(collection).orderBy("createdAt", "desc").limit(Math.min(limit, 500));
  const snap = await q.get();
  const docs = [];
  snap.forEach((s) => {
    const d = s.data();
    if (spec.publishedOnly && d.status && d.status !== "published" && d.published !== true) return;
    if (d.published === false) return;
    docs.push(vrag.toVertexDocument(spec.makeDoc(d)));
  });

  if (dryRun) return { collection, imported: docs.length, dryRun: true, docs };

  await vrag.importDocuments(docs);
  return { collection, imported: docs.length, dryRun: false };
}

/** Sab collections ingest (default). */
async function ingestAll(db, opts) {
  const summary = [];
  for (const collection of Object.keys(COLLECTION_MAP)) {
    try {
      summary.push(await ingestCollection(db, collection, opts));
    } catch (e) {
      summary.push({ collection, error: String(e?.message || e), imported: 0 });
    }
  }
  return summary;
}

module.exports = { ingestCollection, ingestAll, COLLECTION_MAP };

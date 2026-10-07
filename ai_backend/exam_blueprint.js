"use strict";

/**
 * exam_blueprint.js — 🎯 SYLLABUS-DRIVEN EXAM HIERARCHY (PHASE-3)
 * ================================================================
 * User rule: "Railway Special → Group D → pura syllabus/eligibility/physical
 * research karke folders + unke andar subject folders + unke andar question-type
 * sets". Ye module:
 *   1. FREE web search (web_searcher — DuckDuckGo/Bing, koi paid API nahi) se
 *      syllabus/pattern context jutata hai
 *   2. Gemini se structured BLUEPRINT banwata hai: subjects (sirf jo exam me
 *      aate hain) + har subject ke question-types + syllabus/eligibility/physical
 *   3. Firestore `exam_blueprints/{exam-section}` me cache (90 din) — roz re-research NAHI
 *   4. Course pack ke andar folder hierarchy ensure karta hai:
 *        "{Exam} Special {YEAR}" → "{Section}" → "{Subject}"  (year dynamic)
 *   5. Section folder me branded SYLLABUS doc save karta hai (ek baar) — users ko
 *      pattern/eligibility/physical sab dikhe, sets context me samajh aayein
 */

const { searchWeb } = require("./agents/article_agents/web_searcher");

const CURRENT_YEAR = () => new Date().getFullYear();
const BLUEPRINT_TTL_MS = 90 * 86400000; // 90 din

function seoSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Free research — fail ho to khali list (Gemini apne knowledge se chalega). */
async function researchExam(exam, section, search = searchWeb) {
  try {
    const res = await search(`${exam} ${section} syllabus exam pattern eligibility physical test subjects`);
    const list = Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results : [];
    return list.slice(0, 6).map((r) => `${r.title || ""} — ${r.snippet || r.text || ""}`.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Gemini → structured blueprint. JSON-only, no fabrication of facts. */
async function generateBlueprint({ exam, section, callJson, search = searchWeb } = {}) {
  const context = (await researchExam(exam, section, search)).join("\n");
  const prompt = [
    `You are an Indian govt-exam syllabus analyst. Exam: ${exam}. Section/Post: ${section}.`,
    context ? `Web research snippets (use only as hints):\n${context}\n` : "",
    `Return STRICT JSON only:`,
    `{`,
    `  "subjects": [ {"name": "Mathematics", "questionTypes": ["Percentage","Ratio","Time & Distance"] } ],`,
    `  "syllabus": { "written": ["...topics..."], "physical": ["...if applicable, else []"] },`,
    `  "eligibility": { "education": "...", "age": "...", "other": "..." }`,
    `}`,
    `Rules: subjects = ONLY those actually tested in this exam (e.g. Group D: Maths, Reasoning, General Science, General Knowledge, Hindi/English as applicable).`,
    `questionTypes = ONLY the types genuinely asked in that subject for this exam (3-8 each).`,
    `Do NOT invent facts; if unsure keep the field short and generic.`
  ].join("\n");

  const data = await callJson(prompt, { temperature: 0.2 });
  const subjects = Array.isArray(data?.subjects)
    ? data.subjects
        .filter((s) => s && String(s.name || "").trim())
        .map((s) => ({
          name: String(s.name).trim(),
          slug: seoSlug(s.name),
          questionTypes: (Array.isArray(s.questionTypes) ? s.questionTypes : [])
            .map((t) => String(t).trim())
            .filter(Boolean)
            .slice(0, 10),
        }))
    : [];
  return {
    exam: String(exam || "").trim(),
    section: String(section || "").trim(),
    subjects,
    syllabus: data?.syllabus && typeof data.syllabus === "object" ? data.syllabus : { written: [], physical: [] },
    eligibility: data?.eligibility && typeof data.eligibility === "object" ? data.eligibility : {},
  };
}

/** Cached blueprint — stale/missing ho tabhi research+AI (cost-safe). */
async function getOrBuildBlueprint({ db, exam, section, callJson } = {}) {
  const id = seoSlug(`${exam}-${section}`) || "blueprint";
  try {
    const snap = await db.collection("exam_blueprints").doc(id).get();
    if (snap.exists) {
      const d = snap.data() || {};
      const age = Date.now() - new Date(d.createdAt || 0).getTime();
      if (Array.isArray(d.subjects) && d.subjects.length && age < BLUEPRINT_TTL_MS) return d;
    }
  } catch {
    /* fall through to rebuild */
  }
  const bp = await generateBlueprint({ exam, section, callJson });
  const doc = { ...bp, createdAt: new Date().toISOString() };
  try {
    await db.collection("exam_blueprints").doc(id).set(doc);
  } catch {
    /* cache write fail = non-fatal */
  }
  return doc;
}

/** Idempotent folder ensure (title-match under parentId). Composite-query-free (index-safe). */
async function ensureFolder(db, packId, parentId, title) {
  const col = db.collection("courses").doc(packId).collection("content");
  const snap = await col.where("parentId", "==", parentId).limit(300).get();
  let found = null;
  snap.forEach((d) => {
    if (String(d.data().title || "").toLowerCase() === String(title).toLowerCase()) found = d.id;
  });
  if (found) return found;
  const ref = await col.add({
    title,
    type: "FOLDER",
    parentId,
    seoSlug: seoSlug(title),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

/**
 * "{Exam} Special {YEAR}" → section → subject folders.
 * @returns {{l1: string, l2: string, subjectFolders: Record<string,string>}}
 */
async function ensureHierarchy(db, packId, blueprint) {
  const year = CURRENT_YEAR();
  const l1 = await ensureFolder(db, packId, null, `${blueprint.exam} Special ${year}`);
  const l2 = await ensureFolder(db, packId, l1, blueprint.section);
  const subjectFolders = {};
  for (const s of blueprint.subjects || []) {
    subjectFolders[s.name] = await ensureFolder(db, packId, l2, s.name);
  }
  return { l1, l2, subjectFolders };
}

function renderSyllabusHtml(bp, year) {
  const esc = (s) =>
    String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const list = (arr) =>
    (Array.isArray(arr) && arr.length ? arr : ["(official notification se verify karein)"])
      .map((t) => `<li>${esc(t)}</li>`)
      .join("\n");
  const subj = (bp.subjects || [])
    .map(
      (s) =>
        `<h3>📘 ${esc(s.name)}</h3><ul>${(s.questionTypes || []).map((t) => `<li>${esc(t)}</li>`).join("\n") || "<li>—</li>"}</ul>`
    )
    .join("\n");
  const el = bp.eligibility || {};
  return [
    `<div class="syllabus-doc" style="font-family:sans-serif;line-height:1.7">`,
    `<h1>🎯 ${esc(bp.exam)} ${esc(bp.section)} — Complete Syllabus & Exam Pattern ${year}</h1>`,
    `<p>Is page me ${esc(bp.exam)} ${esc(bp.section)} ka subject-wise syllabus, question-types,`,
    ` eligibility aur physical requirements diye gaye hain — taaki aap pattern samajh kar`,
    ` niche diye practice sets sahi order me solve kar saken.</p>`,
    `<h2>📋 Eligibility</h2>`,
    `<ul><li><b>Education:</b> ${esc(el.education) || "—"}</li>`,
    `<li><b>Age:</b> ${esc(el.age) || "—"}</li>`,
    `<li><b>Other:</b> ${esc(el.other) || "—"}</li></ul>`,
    `<h2>✍️ Written Exam Syllabus (Subjects & Question Types)</h2>`,
    subj || "<p>—</p>",
    `<h2>🏃 Physical Test (if applicable)</h2><ul>${list((bp.syllabus || {}).physical)}</ul>`,
    `<h2>📚 Written Topics</h2><ul>${list((bp.syllabus || {}).written)}</ul>`,
    `<p style="color:#666;font-size:12px">⚠️ Ye AI-structured summary hai — final authority hamesha`,
    ` official notification hi hai. Practice sets isi syllabus ke question-types pe bante hain.</p>`,
    `</div>`,
  ].join("\n");
}

/** Section folder me ek baar syllabus doc (idempotent by topic). */
async function ensureSyllabusDoc(db, packId, sectionFolderId, bp) {
  const year = CURRENT_YEAR();
  const title = `${bp.exam} ${bp.section} Complete Syllabus ${year} — Pattern, Eligibility, Physical`;
  const snap = await db
    .collection("courses")
    .doc(packId)
    .collection("content")
    .where("parentId", "==", sectionFolderId)
    .limit(300)
    .get();
  let exists = false;
  snap.forEach((d) => {
    if (String(d.data().topic || "") === "syllabus-overview") exists = true;
  });
  if (exists) return null;
  const ref = await db.collection("courses").doc(packId).collection("content").add({
    title,
    type: "article",
    topic: "syllabus-overview",
    parentId: sectionFolderId,
    content: renderSyllabusHtml(bp, year),
    exam: bp.exam,
    subject: bp.section,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "published",
  });
  return ref.id;
}

module.exports = {
  seoSlug,
  researchExam,
  generateBlueprint,
  getOrBuildBlueprint,
  ensureFolder,
  ensureHierarchy,
  ensureSyllabusDoc,
  renderSyllabusHtml,
  CURRENT_YEAR,
};

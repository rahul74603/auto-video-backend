"use strict";

/**
 * Shared exam-family + content-kind taxonomy.
 * Used by internal linking, topic clusters, search intent, content gaps
 * and the SEO dashboard. Detection is conservative: unknown → OTHER/GENERAL.
 */

const EXAM_FAMILIES = Object.freeze([
  { id: "SSC", label: "SSC", re: /\b(ssc|cgl|chsl|cpo|steno|gd\b|mts\b|selection commission)\b/i },
  { id: "RAILWAY", label: "Railway", re: /\b(rrb|rrc|railway|ntpc|group\s*d|alp\b|je\b)\b/i },
  { id: "BANKING", label: "Banking", re: /\b(ibps|sbi|rbi|nabard|bank(ing)?|clerk|po\b|so\b)\b/i },
  { id: "POLICE", label: "Police", re: /\b(police|constable|si\b|haryana police|up police|mp police|delhi police)\b/i },
  { id: "UPSC", label: "UPSC", re: /\b(upsc|ias\b|ifs\b|nda\b|cds\b|capf|civil\s*service)\b/i },
  { id: "TEACHING", label: "Teaching", re: /\b(ctet|ugc\s*net|kvs|nvs|tgt|pgt|prt|teacher|assistant\s*professor|net\/jrf)\b/i },
  { id: "DEFENCE", label: "Defence", re: /\b(army|navy|air\s*force|afcat|territorial|agniveer)\b/i },
  { id: "MEDICAL", label: "Medical", re: /\b(neet|aiims|nursing|mbbs|nhm)\b/i },
  { id: "ENGINEERING", label: "Engineering", re: /\b(gate\b|jee\b|ies\b|engineering\s*service)\b/i },
  { id: "STATE", label: "State PSC", re: /\b(psc|hpsc|uppsc|mppsc|bpsc|rpsc|gpsc|kpsc|vyapam|patwari|ssc gd)\b/i }
]);

const CONTENT_KINDS = Object.freeze({
  JOB: "JOB",
  ADMIT_CARD: "ADMIT_CARD",
  RESULT: "RESULT",
  ANSWER_KEY: "ANSWER_KEY",
  SYLLABUS: "SYLLABUS",
  NEWS: "NEWS",
  BLOG: "BLOG",
  MOCK_TEST: "MOCK_TEST",
  MATERIAL: "MATERIAL",
  OTHER: "OTHER"
});

const KIND_FROM_FAST_TRACK = Object.freeze({
  result: CONTENT_KINDS.RESULT,
  "admit card": CONTENT_KINDS.ADMIT_CARD,
  "answer key": CONTENT_KINDS.ANSWER_KEY,
  syllabus: CONTENT_KINDS.SYLLABUS,
  admission: CONTENT_KINDS.NEWS,
  other: CONTENT_KINDS.OTHER
});

const CLUSTER_HUBS = Object.freeze({
  SSC: { name: "SSC Hub", url: "/govt-jobs?exam=SSC" },
  RAILWAY: { name: "Railway Hub", url: "/govt-jobs?exam=Railway" },
  BANKING: { name: "Banking Hub", url: "/govt-jobs?exam=Banking" },
  POLICE: { name: "Police Hub", url: "/govt-jobs?exam=Police" },
  UPSC: { name: "UPSC Hub", url: "/govt-jobs?exam=UPSC" },
  TEACHING: { name: "Teaching Hub", url: "/govt-jobs?exam=Teaching" },
  DEFENCE: { name: "Defence Hub", url: "/govt-jobs?exam=Defence" },
  MEDICAL: { name: "Medical Hub", url: "/govt-jobs?exam=Medical" },
  ENGINEERING: { name: "Engineering Hub", url: "/govt-jobs?exam=Engineering" },
  STATE: { name: "State Jobs Hub", url: "/govt-jobs" },
  GENERAL: { name: "Government Jobs", url: "/govt-jobs" }
});

const EXPECTED_CLUSTER_KINDS = Object.freeze([
  CONTENT_KINDS.JOB,
  CONTENT_KINDS.ADMIT_CARD,
  CONTENT_KINDS.RESULT,
  CONTENT_KINDS.SYLLABUS,
  CONTENT_KINDS.MOCK_TEST
]);

function blobOf(input) {
  if (!input) return "";
  if (typeof input === "string") return input;
  return [
    input.title,
    input.category,
    input.organization,
    input.org,
    input.exam,
    input.h1
  ]
    .filter(Boolean)
    .join(" ");
}

function detectExamFamily(input) {
  const blob = blobOf(input);
  if (!blob) return "GENERAL";
  for (const family of EXAM_FAMILIES) {
    if (family.re.test(blob)) return family.id;
  }
  return "GENERAL";
}

function detectContentKind(input) {
  const type = String(input?.type || input?.articleType || "").toUpperCase().replace(/-/g, "_");
  if (type === "MOCK_TEST" || type === "QUIZ") return CONTENT_KINDS.MOCK_TEST;
  if (type === "BLOG") return CONTENT_KINDS.BLOG;
  if (type === "MATERIAL" || type === "STUDY_MATERIAL") return CONTENT_KINDS.MATERIAL;

  const category = String(input?.category || input?.facts?.category || "").trim().toLowerCase();
  if (KIND_FROM_FAST_TRACK[category]) return KIND_FROM_FAST_TRACK[category];

  const title = String(input?.title || input?.h1 || "").toLowerCase();
  if (/\badmit\s*card\b|\bhall\s*ticket\b|\bcall\s*letter\b/.test(title)) return CONTENT_KINDS.ADMIT_CARD;
  if (/\banswer\s*key\b|\bresponse\s*sheet\b/.test(title)) return CONTENT_KINDS.ANSWER_KEY;
  if (/\bresult\b|\bmerit\s*list\b|\bcut[\s-]?off\b/.test(title)) return CONTENT_KINDS.RESULT;
  if (/\bsyllabus\b|\bexam\s*pattern\b/.test(title)) return CONTENT_KINDS.SYLLABUS;
  if (/\bmock\s*test\b|\bpractice\s*set\b/.test(title)) return CONTENT_KINDS.MOCK_TEST;
  if (type === "FAST_TRACK" || type === "FASTTRACK") return CONTENT_KINDS.NEWS;
  if (type === "JOB") return CONTENT_KINDS.JOB;
  return CONTENT_KINDS.OTHER;
}

function clusterId(examFamily, contentKind) {
  const family = examFamily || "GENERAL";
  const kind = contentKind || CONTENT_KINDS.OTHER;
  return `${family}:${kind}`;
}

function hubForFamily(examFamily) {
  return CLUSTER_HUBS[examFamily] || CLUSTER_HUBS.GENERAL;
}

function complementaryKinds(kind) {
  switch (kind) {
    case CONTENT_KINDS.JOB:
      return [CONTENT_KINDS.ADMIT_CARD, CONTENT_KINDS.SYLLABUS, CONTENT_KINDS.MOCK_TEST, CONTENT_KINDS.RESULT];
    case CONTENT_KINDS.ADMIT_CARD:
      return [CONTENT_KINDS.JOB, CONTENT_KINDS.SYLLABUS, CONTENT_KINDS.MOCK_TEST, CONTENT_KINDS.RESULT];
    case CONTENT_KINDS.RESULT:
      return [CONTENT_KINDS.JOB, CONTENT_KINDS.ADMIT_CARD, CONTENT_KINDS.ANSWER_KEY, CONTENT_KINDS.MOCK_TEST];
    case CONTENT_KINDS.ANSWER_KEY:
      return [CONTENT_KINDS.RESULT, CONTENT_KINDS.JOB, CONTENT_KINDS.MOCK_TEST];
    case CONTENT_KINDS.SYLLABUS:
      return [CONTENT_KINDS.MOCK_TEST, CONTENT_KINDS.JOB, CONTENT_KINDS.MATERIAL];
    case CONTENT_KINDS.MOCK_TEST:
      return [CONTENT_KINDS.SYLLABUS, CONTENT_KINDS.JOB, CONTENT_KINDS.MATERIAL];
    case CONTENT_KINDS.BLOG:
      return [CONTENT_KINDS.JOB, CONTENT_KINDS.MOCK_TEST, CONTENT_KINDS.SYLLABUS];
    default:
      return [CONTENT_KINDS.JOB, CONTENT_KINDS.MOCK_TEST];
  }
}

module.exports = {
  EXAM_FAMILIES,
  CONTENT_KINDS,
  CLUSTER_HUBS,
  EXPECTED_CLUSTER_KINDS,
  detectExamFamily,
  detectContentKind,
  clusterId,
  hubForFamily,
  complementaryKinds
};

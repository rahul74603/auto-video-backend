"use strict";

/**
 * Image SEO helpers. Never generate fake photos of people.
 * Alt text is derived from the page title / content kind only.
 */

function buildImageAlt(title, contentKind) {
  const clean = String(title || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110);
  if (!clean) return "StudyGyaan exam update";
  const kindLabel = {
    JOB: "government job notification",
    ADMIT_CARD: "admit card update",
    RESULT: "exam result update",
    ANSWER_KEY: "answer key update",
    SYLLABUS: "exam syllabus",
    MOCK_TEST: "mock test",
    BLOG: "education article"
  }[contentKind];
  if (!kindLabel) return `${clean} | StudyGyaan`;
  if (clean.toLowerCase().includes(kindLabel.split(" ")[0])) return `${clean} | StudyGyaan`;
  return `${clean} — ${kindLabel} | StudyGyaan`.slice(0, 125);
}

function isAcceptableImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(parsed.pathname) || /og-image|storage\.googleapis|firebasestorage|studygyaan\.in/i.test(value);
  } catch {
    return false;
  }
}

function findImagesMissingAlt(html) {
  const source = String(html || "");
  const missing = [];
  const re = /<img\b([^>]*?)>/gi;
  let match;
  while ((match = re.exec(source))) {
    const attrs = match[1] || "";
    if (/\balt\s*=\s*["'][^"']+["']/i.test(attrs)) continue;
    missing.push((attrs.match(/\bsrc\s*=\s*["']([^"']+)/i) || [])[1] || "unknown");
  }
  return missing.slice(0, 8);
}

module.exports = {
  buildImageAlt,
  isAcceptableImageUrl,
  findImagesMissingAlt
};

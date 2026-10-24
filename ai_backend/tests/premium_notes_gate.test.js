"use strict";
const test = require("node:test");
const assert = require("node:assert");
const {
  countQuestions,
  isAcceptableSetSize,
  parseQuestionBadges,
  sequentialRunLength,
  truncateToFirst25,
} = require("../premium_notes");

// Template-jaisa fixture: SECTION-2 wrapper + N cards (badge span + answer box)
function card(n) {
  return [
    "<!-- ★ QUESTION CARD (Repeat for Q.1 to Q.25) ★ -->",
    '<div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:16px;">',
    '  <div style="display:flex;gap:12px;">',
    `    <span style="background:#1e3a8a;color:white;">Q.${n}</span>`,
    `    <p>Question ${n} text here?</p>`,
    "  </div>",
    "  <div>✅ Answer: [B]</div>",
    "</div>",
    "<!-- ★ END QUESTION CARD - Repeat Q.2 to Q.25 ★ -->",
  ].join("\n");
}
function doc(n) {
  const cards = Array.from({ length: n }, (_, i) => card(i + 1)).join("\n");
  return `<div style="margin-bottom:24px;"><h2>📝 Practice Questions <span>Set 2 | 25 Qs</span></h2>\n${cards}\n</div>`;
}

test("parseQuestionBadges: template comments mask, sirf real badges", () => {
  const badges = parseQuestionBadges(doc(25));
  assert.equal(badges.length, 25);
  assert.deepEqual(badges.map((b) => b.n), Array.from({ length: 25 }, (_, i) => i + 1));
  // pos ORIGINAL string me valid: waha se Q.N padha ja sake
  const html = doc(25);
  for (const b of badges) {
    assert.ok(html.slice(b.pos, b.pos + 8).startsWith(`Q.${b.n}`), `pos valid for Q.${b.n}`);
  }
});

test("parseQuestionBadges: 'Q. 5' spacing bhi pakde", () => {
  const badges = parseQuestionBadges("<span>Q. 5</span>");
  assert.equal(badges.length, 1);
  assert.equal(badges[0].n, 5);
});

test("sequentialRunLength: clean 25 / overshoot 66 / answer-key repeat", () => {
  assert.equal(sequentialRunLength(parseQuestionBadges(doc(25))), 25);
  assert.equal(sequentialRunLength(parseQuestionBadges(doc(66))), 66);
  // 25 cards + answer-key me Q.1..Q.25 repeat → run phir bhi 25
  const withKey = doc(25) + "\n<div>Answer Key: " +
    Array.from({ length: 25 }, (_, i) => `Q.${i + 1}=B`).join(" ") + "</div>";
  assert.equal(sequentialRunLength(parseQuestionBadges(withKey)), 25);
  assert.equal(sequentialRunLength(parseQuestionBadges("<p>no badges</p>")), 0);
});

test("truncateToFirst25: 66-card overshoot → clean 25, balanced tags", () => {
  const html = doc(66);
  const out = truncateToFirst25(html, parseQuestionBadges(html));
  const badges = parseQuestionBadges(out);
  assert.equal(badges.length, 25);
  assert.equal(badges[24].n, 25);
  assert.ok(out.includes("Q.25</span>"), "Q.25 card poora rakha");
  assert.ok(!out.includes("Q.26</span>"), "Q.26+ discard");
  // trailing dangling nahi: </div> pe end, khula <div/<span tail me nahi
  assert.ok(out.trimEnd().endsWith("</div>"));
  assert.ok(!/<(div|span)[^>]*>\s*$/.test(out), "koi dangling open-tag nahi");
  // div balance: har khula div band
  const opens = (out.match(/<div[\s>]/g) || []).length;
  const closes = (out.match(/<\/div>/g) || []).length;
  assert.equal(opens, closes, `div balanced (${opens}/${closes})`);
});

test("truncateToFirst25: 25 ya kam pe no-op", () => {
  const html = doc(25);
  assert.equal(truncateToFirst25(html, parseQuestionBadges(html)), html);
});

test("truncateToFirst25: pathological input pe null (kachra nahi)", () => {
  const out = truncateToFirst25("<p>Q.1 adhoora</p>", [{ n: 1, pos: 3 }, { n: 26, pos: 3 }]);
  assert.equal(out, null);
});

test("legacy helpers intact: countQuestions + isAcceptableSetSize", () => {
  assert.equal(countQuestions(doc(25)) > 25, true); // raw: comments bhi ginta hai (legacy)
  assert.equal(isAcceptableSetSize(25), true);
  assert.equal(isAcceptableSetSize(20), true);
  assert.equal(isAcceptableSetSize(30), true);
  assert.equal(isAcceptableSetSize(19), false);
  assert.equal(isAcceptableSetSize(31), false);
});

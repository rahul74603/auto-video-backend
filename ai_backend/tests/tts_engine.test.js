"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tts = require("../tts_engine");

/* ------------------------------------------------------------------ */
/* Billing / availability detection                                    */
/* ------------------------------------------------------------------ */

test("the real Google billing error is recognised", () => {
  const real = new Error(
    "7 PERMISSION_DENIED: This API method requires billing to be enabled. " +
    "Please enable billing on project #544327120035 by visiting " +
    "https://console.developers.google.com/billing/enable?project=544327120035 then retry."
  );
  assert.equal(tts.isBillingError(real), true);
});

test("other Google availability failures also trigger the fallback", () => {
  assert.equal(tts.isBillingError(new Error("7 PERMISSION_DENIED: caller lacks permission")), true);
  assert.equal(tts.isBillingError(new Error("SERVICE_DISABLED: Cloud TTS API is disabled")), true);
  assert.equal(tts.isBillingError(new Error("Text-to-Speech API has not been used in project 123")), true);
});

test("unrelated errors are not misread as billing problems", () => {
  assert.equal(tts.isBillingError(new Error("ECONNRESET")), false);
  assert.equal(tts.isBillingError(new Error("invalid voice name")), false);
});

/* ------------------------------------------------------------------ */
/* Voice mapping                                                       */
/* ------------------------------------------------------------------ */

test("anchor gender maps to matching Google and Edge voices", () => {
  assert.equal(tts.genderOf("hi-IN-Neural2-A"), "female");
  assert.equal(tts.genderOf("hi-IN-Neural2-C"), "male");
  assert.equal(tts.genderOf("female"), "female");
  assert.equal(tts.genderOf("male"), "male");
  assert.equal(tts.genderOf("hi-IN-Neural2-B"), "neutral");

  // A female anchor must not get a male fallback voice.
  assert.equal(tts.EDGE_VOICES.female, "hi-IN-SwaraNeural");
  assert.equal(tts.EDGE_VOICES.male, "hi-IN-MadhurNeural");
  assert.notEqual(tts.EDGE_VOICES.female, tts.EDGE_VOICES.male);
});

test("every Edge fallback voice is an Indian Hindi voice", () => {
  Object.values(tts.EDGE_VOICES).forEach((v) => assert.match(v, /^hi-IN-/));
  Object.values(tts.GOOGLE_VOICES).forEach((v) => assert.match(v, /^hi-IN-/));
});

/* ------------------------------------------------------------------ */
/* Fallback behaviour (engines injected via _impl — no loader patching) */
/* ------------------------------------------------------------------ */

const BILLING_ERR = new Error(
  "7 PERMISSION_DENIED: This API method requires billing to be enabled."
);

function stubEngines({ googleThrows = null, edgeWrites = true } = {}) {
  const calls = { google: 0, edge: 0, edgeVoice: null, rate: null, gender: null };
  const realGoogle = tts._impl.google;
  const realEdge = tts._impl.edge;

  tts._impl.google = async (text, out) => {
    calls.google += 1;
    if (googleThrows) throw googleThrows;
    fs.writeFileSync(out, "google-audio");
    return { engine: "google", voice: "hi-IN-Neural2-A" };
  };

  tts._impl.edge = async (text, out, opts = {}) => {
    calls.edge += 1;
    calls.gender = opts.gender;
    calls.edgeVoice = opts.edgeVoice || tts.EDGE_VOICES[tts.genderOf(opts.gender || opts.googleVoice)];
    const rate = opts.speakingRate ? Math.round((opts.speakingRate - 1) * 100) : 0;
    calls.rate = `${rate >= 0 ? "+" : ""}${rate}%`;
    if (!edgeWrites) throw new Error("Edge TTS returned empty audio");
    fs.writeFileSync(out, "edge-audio");
    return { engine: "edge", voice: calls.edgeVoice };
  };

  return {
    calls,
    restore() { tts._impl.google = realGoogle; tts._impl.edge = realEdge; }
  };
}

function tmpFile() {
  return path.join(os.tmpdir(), `tts-test-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
}

test("Google is used when it works, and Edge is never called", async () => {
  process.env.TTS_KEY_JSON = "{}";
  delete process.env.TTS_ENGINE;
  const s = stubEngines();
  const out = tmpFile();
  try {
    const r = await tts.synthesize("नमस्ते", out, { googleVoice: "hi-IN-Neural2-A" });
    assert.equal(r.engine, "google");
    assert.equal(s.calls.google, 1);
    assert.equal(s.calls.edge, 0);
    assert.ok(fs.existsSync(out));
  } finally { s.restore(); try { fs.unlinkSync(out); } catch {} }
});

test("a billing failure falls back to Edge and still produces audio", async () => {
  process.env.TTS_KEY_JSON = "{}";
  delete process.env.TTS_ENGINE;
  const s = stubEngines({ googleThrows: BILLING_ERR });
  const out = tmpFile();
  try {
    const r = await tts.synthesize("नमस्ते", out, { googleVoice: "hi-IN-Neural2-A" });
    assert.equal(r.engine, "edge");
    assert.equal(s.calls.google, 1);
    assert.equal(s.calls.edge, 1);
    assert.ok(fs.existsSync(out), "fallback must still write the mp3");
    assert.ok(fs.statSync(out).size > 0);
  } finally { s.restore(); try { fs.unlinkSync(out); } catch {} }
});

test("the fallback keeps the anchor's gender", async () => {
  process.env.TTS_KEY_JSON = "{}";
  delete process.env.TTS_ENGINE;

  let s = stubEngines({ googleThrows: BILLING_ERR });
  let out = tmpFile();
  try {
    await tts.synthesize("नमस्ते", out, { googleVoice: "hi-IN-Neural2-C", gender: "male" });
    assert.equal(s.calls.edgeVoice, "hi-IN-MadhurNeural");
  } finally { s.restore(); try { fs.unlinkSync(out); } catch {} }

  s = stubEngines({ googleThrows: BILLING_ERR });
  out = tmpFile();
  try {
    await tts.synthesize("नमस्ते", out, { googleVoice: "hi-IN-Neural2-A", gender: "female" });
    assert.equal(s.calls.edgeVoice, "hi-IN-SwaraNeural");
  } finally { s.restore(); try { fs.unlinkSync(out); } catch {} }
});

test("TTS_ENGINE=edge skips Google entirely", async () => {
  process.env.TTS_KEY_JSON = "{}";
  process.env.TTS_ENGINE = "edge";
  const s = stubEngines();
  const out = tmpFile();
  try {
    const r = await tts.synthesize("नमस्ते", out, {});
    assert.equal(r.engine, "edge");
    assert.equal(s.calls.google, 0, "Google must not be called at all");
  } finally { s.restore(); delete process.env.TTS_ENGINE; try { fs.unlinkSync(out); } catch {} }
});

test("speakingRate is converted to Edge's percentage format", async () => {
  delete process.env.TTS_KEY_JSON;
  delete process.env.TTS_ENGINE;
  const s = stubEngines({ googleThrows: BILLING_ERR });
  const out = tmpFile();
  try {
    await tts.synthesize("नमस्ते", out, { speakingRate: 1.08 });
    assert.equal(s.calls.rate, "+8%");
  } finally { s.restore(); try { fs.unlinkSync(out); } catch {} }
});

test("an Edge failure propagates instead of silently succeeding", async () => {
  delete process.env.TTS_KEY_JSON;
  delete process.env.TTS_ENGINE;
  const s = stubEngines({ googleThrows: BILLING_ERR, edgeWrites: false });
  const out = tmpFile();
  try {
    await assert.rejects(() => tts.synthesize("नमस्ते", out, {}), /empty audio/);
  } finally { s.restore(); try { fs.unlinkSync(out); } catch {} }
});

test("empty text is rejected before any network call", async () => {
  await assert.rejects(() => tts.synthesize("", "/tmp/x.mp3", {}), /empty text/);
  await assert.rejects(() => tts.synthesize("   ", "/tmp/x.mp3", {}), /empty text/);
});

test("normalizeSpeechText turns studygyaan.in into StudyGyaan dot in without mutating the original", () => {
  const original = "Result check करने के लिए https://studygyaan.in visit करें। Details studygyaan.in पर।";
  const spoken = tts.normalizeSpeechText(original);
  assert.match(spoken, /StudyGyaan dot in/);
  assert.doesNotMatch(spoken, /https:\/\/studygyaan\.in/);
  assert.doesNotMatch(spoken, /\bstudygyaan\.in\b/i);
  assert.equal(original.includes("https://studygyaan.in"), true);
});

test("synthesize sends the spoken form to the engine, not the raw URL", async () => {
  process.env.TTS_KEY_JSON = "{}";
  delete process.env.TTS_ENGINE;
  const captured = { text: null };
  const realGoogle = tts._impl.google;
  const realEdge = tts._impl.edge;
  tts._impl.google = async (text, out) => {
    captured.text = text;
    fs.writeFileSync(out, "google-audio");
    return { engine: "google", voice: "hi-IN-Neural2-A" };
  };
  const out = tmpFile();
  try {
    await tts.synthesize("Check result at https://studygyaan.in", out, { googleVoice: "hi-IN-Neural2-A" });
    assert.match(captured.text, /StudyGyaan dot in/);
    assert.doesNotMatch(captured.text, /https:\/\/studygyaan\.in/);
  } finally {
    tts._impl.google = realGoogle;
    tts._impl.edge = realEdge;
    try { fs.unlinkSync(out); } catch {}
  }
});

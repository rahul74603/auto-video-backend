"use strict";

/**
 * Shared HTML utilities for the article agents.
 *  - ensureSingleH1: exactly one <h1>, converted from writer output
 *  - wrapTablesResponsive: every <table> inside an overflow-x wrapper
 *  - dropBlockedLinks: anchors pointing to blocked third-party domains are
 *    replaced by their plain text
 *  - sanitizeArticleHtml: removes scripts/styles/event-handlers
 *  - plainText / word counting helpers (Devanagari-aware)
 */

const cheerio = require("cheerio");
const { isBlockedDomain, OUR_SOCIAL_LINKS } = require("./constants");

function loadHtml(html) {
  return cheerio.load(`<div id="__root">${html || ""}</div>`, { decodeEntities: false });
}

function sanitizeArticleHtml(html) {
  const $ = loadHtml(html);
  $("#__root").find("script, style, iframe, noscript, object, embed, form, input, button").remove();
  $("#__root").find("*").each((_, el) => {
    const attribs = el.attribs || {};
    for (const name of Object.keys(attribs)) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on")) $(el).removeAttr(name);
      if (lower === "srcset") $(el).removeAttr(name);
      if (lower === "style" && /expression|javascript:/i.test(attribs[name])) $(el).removeAttr(name);
    }
  });
  return $("#__root").html() || "";
}

/**
 * Keep exactly one H1 (its text forced to desiredH1 when supplied).
 * Every additional H1 is demoted to H2. If none exists, one is prepended.
 */
function ensureSingleH1(html, desiredH1) {
  const $ = loadHtml(html);
  const h1s = $("#__root").find("h1");
  if (h1s.length === 0) {
    if (desiredH1) $("#__root").prepend(`<h1>${escapeHtml(desiredH1)}</h1>`);
  } else {
    let kept = false;
    h1s.each((_, el) => {
      if (!kept) {
        kept = true;
        if (desiredH1) $(el).text(desiredH1);
      } else {
        const inner = $(el).html() || "";
        $(el).replaceWith(`<h2>${inner}</h2>`);
      }
    });
  }
  return $("#__root").html() || "";
}

/** Wrap every bare <table> in a horizontally-scrollable responsive container. */
function wrapTablesResponsive(html) {
  const $ = loadHtml(html);
  $("#__root").find("table").each((_, el) => {
    const parent = $(el).parent();
    if (parent.hasClass("table-responsive")) return;
    $(el).addClass("ai-data-table");
    $(el).wrap('<div class="table-responsive" style="overflow-x:auto;-webkit-overflow-scrolling:touch;"></div>');
  });
  return $("#__root").html() || "";
}

/** Replace blocked-domain anchors with their text content. */
function dropBlockedLinks(html) {
  const $ = loadHtml(html);
  $("#__root").find("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (isBlockedDomain(href) || (href && !href.startsWith("http") && !href.startsWith("/") && !href.startsWith("#"))) {
      $(el).replaceWith($(el).text());
    }
  });
  return $("#__root").html() || "";
}

function normalizeArticleHtml(html, { h1 } = {}) {
  let out = sanitizeArticleHtml(html || "");
  out = ensureSingleH1(out, h1);
  out = wrapTablesResponsive(out);
  out = dropBlockedLinks(out);
  return out.trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainText(html) {
  const $ = loadHtml(html);
  return ($("#__root").text() || "").replace(/\s+/g, " ").trim();
}

/** Count meaningful word tokens (Latin + Devanagari letters/digits). */
function countWords(textOrHtml) {
  const text = textOrHtml.includes("<") ? plainText(textOrHtml) : String(textOrHtml || "");
  const tokens = text.split(/\s+/).filter((token) => /[A-Za-z0-9ऀ-ॿ]/.test(token.replace(/[.,;:!?'"()\-–—|/\\[\]{}%₹]+/g, "")));
  return tokens.length;
}

function countTags(html, tag) {
  const $ = loadHtml(html);
  return $("#__root").find(tag).length;
}

function listAnchorHrefs(html) {
  const $ = loadHtml(html);
  const hrefs = [];
  $("#__root").find("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (href) hrefs.push(href);
  });
  return hrefs;
}

/**
 * Deterministic "हमसे जुड़ें" section — har article ke end me EXACTLY hamare
 * apne channels lagte hain (YouTube/Telegram/WhatsApp/Facebook). Model se karwaya
 * nahi jaata taaki kabhi galat ya third-party link na aa jaye.
 */
const JOIN_US_MARKER = "ai-join-us-section";

function buildJoinUsHtml() {
  const items = OUR_SOCIAL_LINKS.map(
    (link) => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener nofollow">${escapeHtml(link.label)}</a></li>`
  ).join("");
  return (
    `<h2>StudyGyaan से जुड़ें — सबसे तेज़ Updates पाएं</h2>` +
    `<div class="${JOIN_US_MARKER}">` +
    `<p>Sarkari Job, Result, Admit Card और Fast Track की सबसे तेज़ updates सीधे अपने फ़ोन पर पाने के लिए ` +
    `StudyGyaan के official channels को अभी join करें:</p>` +
    `<ul class="ai-social-links">${items}</ul>` +
    `</div>`
  );
}

/** Purana join-us section hata kar naya lagata hai (idempotent — kabhi duplicate nahi). */
function appendJoinUsSection(html) {
  const $ = loadHtml(html || "");
  $("#__root").find(`h2`).each((_, el) => {
    const heading = ($(el).text() || "").toLowerCase();
    if (heading.includes("जुड़ें") || heading.includes("join studygyaan") || heading.includes("join us")) {
      const next = $(el).next();
      if (next.is(`.${JOIN_US_MARKER}`) || next.is("p,ul,div")) {
        const after = next.next();
        next.remove();
        if (after.is(`.${JOIN_US_MARKER}`) || after.is("ul")) after.remove();
      }
      $(el).remove();
    }
  });
  $("#__root").find(`.${JOIN_US_MARKER}`).remove();
  $("#__root").append(buildJoinUsHtml());
  return ($("#__root").html() || "").trim();
}

module.exports = {
  sanitizeArticleHtml,
  ensureSingleH1,
  wrapTablesResponsive,
  dropBlockedLinks,
  normalizeArticleHtml,
  escapeHtml,
  plainText,
  countWords,
  countTags,
  listAnchorHrefs,
  buildJoinUsHtml,
  appendJoinUsSection,
  JOIN_US_MARKER
};

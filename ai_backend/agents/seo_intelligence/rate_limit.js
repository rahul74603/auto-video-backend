"use strict";

/**
 * Lightweight express-rate-limit wrappers for SEO intelligence HTTP routes.
 * Reuses the existing `express-rate-limit` dependency (no new service).
 *
 * Cloud Functions instances are ephemeral; the store is capped so a burst of
 * distinct IPs cannot grow memory without bound. Auth is unchanged and still
 * required after the limiter.
 */

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const DEFAULT_MAX_KEYS = 400;

class CappedHitStore {
  constructor(maxKeys = DEFAULT_MAX_KEYS) {
    const parsed = Number(maxKeys);
    this.maxKeys = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : DEFAULT_MAX_KEYS;
    this.windowMs = 60 * 1000;
    this.hits = new Map();
  }

  init(options) {
    this.windowMs = Number(options.windowMs) || this.windowMs;
  }

  _now() {
    return Date.now();
  }

  _dropOldest() {
    if (this.hits.size < this.maxKeys) return;
    const oldest = this.hits.keys().next().value;
    if (oldest !== undefined) this.hits.delete(oldest);
  }

  async increment(key) {
    const now = this._now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetTime <= now) {
      entry = { totalHits: 0, resetTime: now + this.windowMs };
    }
    entry.totalHits += 1;
    if (!this.hits.has(key)) this._dropOldest();
    this.hits.delete(key);
    this.hits.set(key, entry);
    return { totalHits: entry.totalHits, resetTime: new Date(entry.resetTime) };
  }

  async decrement(key) {
    const entry = this.hits.get(key);
    if (entry && entry.totalHits > 0) entry.totalHits -= 1;
  }

  async resetKey(key) {
    this.hits.delete(key);
  }

  async resetAll() {
    this.hits.clear();
  }
}

function clientKey(req) {
  const forwarded = req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"]);
  const ip = String(req.ip || (typeof forwarded === "string" ? forwarded.split(",")[0] : "") || "unknown").trim();
  try {
    return ipKeyGenerator(ip);
  } catch {
    return ip.slice(0, 80) || "unknown";
  }
}

function createLimiter(options = {}) {
  const windowMs = Number(options.windowMs) || 10 * 60 * 1000;
  const limit = Math.max(1, Number(options.limit) || 20);
  const store = options.store || new CappedHitStore(options.maxKeys);
  return rateLimit({
    windowMs,
    limit,
    store,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: options.keyGenerator || clientKey,
    message: { success: false, error: "Too many SEO intelligence requests. Try again in a few minutes." },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false, default: false }
  });
}

function createSeoLimiters(overrides = {}) {
  return {
    readLimit: overrides.readLimit || createLimiter({ windowMs: 10 * 60 * 1000, limit: 30 }),
    runLimit: overrides.runLimit || createLimiter({ windowMs: 15 * 60 * 1000, limit: 4 }),
    ingestLimit: overrides.ingestLimit || createLimiter({ windowMs: 15 * 60 * 1000, limit: 8 })
  };
}

module.exports = {
  CappedHitStore,
  createLimiter,
  createSeoLimiters,
  clientKey
};

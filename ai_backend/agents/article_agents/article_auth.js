"use strict";

/**
 * Authentication guard for every /articles/* route.
 *
 * The admin page being hidden behind a client-side login is not sufficient:
 * callers can invoke a Cloud Function URL directly. Article generation costs
 * money and publishing mutates public collections, so the backend verifies a
 * Firebase ID token and an explicit admin allow-list. AGENT_ADMIN_TOKEN stays
 * available for trusted server-to-server tools.
 */

const crypto = require("crypto");

function safeEqual(actual, expected) {
  const a = Buffer.from(String(actual || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function bearerToken(req) {
  const authorization = String(req?.get?.("authorization") || "").trim();
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

function configuredAdminEmails(env = process.env) {
  return new Set(
    [env.ARTICLE_ADMIN_EMAILS, env.ADMIN_EMAIL]
      .filter(Boolean)
      .join(",")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * @returns {Promise<{ok: boolean, status?: number, error?: string, uid?: string, email?: string, via?: string}>}
 */
async function authorizeArticleRequest(req, deps = {}) {
  const env = deps.env || process.env;
  const configuredAgentToken = String(env.AGENT_ADMIN_TOKEN || "");
  const suppliedAgentToken = String(req?.get?.("x-agent-token") || "");

  // Trusted scheduled scripts / admin tooling may use the existing agent key.
  if (
    configuredAgentToken &&
    suppliedAgentToken &&
    safeEqual(suppliedAgentToken, configuredAgentToken)
  ) {
    return { ok: true, via: "agent-token" };
  }

  const idToken = bearerToken(req);
  if (!idToken) {
    return { ok: false, status: 401, error: "Admin sign-in required" };
  }

  const verifyIdToken = deps.verifyIdToken;
  if (typeof verifyIdToken !== "function") {
    return { ok: false, status: 503, error: "Article authentication is not configured" };
  }

  let decoded;
  try {
    decoded = await verifyIdToken(idToken);
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired admin session" };
  }

  const email = String(decoded?.email || "").trim().toLowerCase();
  const allowedEmails = configuredAdminEmails(env);
  const hasAdminClaim = decoded?.admin === true;

  if (!hasAdminClaim && allowedEmails.size === 0) {
    return {
      ok: false,
      status: 503,
      error: "Set ARTICLE_ADMIN_EMAILS (or an admin custom claim) before using AI Article Studio"
    };
  }
  if (!hasAdminClaim && (!email || !allowedEmails.has(email))) {
    return { ok: false, status: 403, error: "This account is not allowed to use AI Article Studio" };
  }

  return {
    ok: true,
    uid: String(decoded?.uid || decoded?.sub || ""),
    email,
    via: hasAdminClaim ? "admin-claim" : "email-allowlist"
  };
}

function createArticleAuthMiddleware(adminAuth, env = process.env) {
  return async function articleAuthMiddleware(req, res, next) {
    const auth = await authorizeArticleRequest(req, {
      env,
      verifyIdToken: (token) => adminAuth.verifyIdToken(token)
    });
    if (!auth.ok) {
      return res.status(auth.status || 401).json({ success: false, error: auth.error });
    }
    req.articleAdmin = auth;
    return next();
  };
}

module.exports = {
  authorizeArticleRequest,
  createArticleAuthMiddleware,
  configuredAdminEmails,
  bearerToken,
  safeEqual
};

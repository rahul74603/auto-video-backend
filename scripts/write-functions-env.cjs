#!/usr/bin/env node
"use strict";

/**
 * ============================================================
 *  CI .env WRITER — GitHub Secrets -> ai_backend/.env
 * ============================================================
 * deploy.yml isko `env:` ke through secrets deta hai (S_* prefixed).
 * 
 * ⚠️ KYUN simple heredoc nahi: SERVICE_ACCOUNT_JSON / GMAIL_CREDENTIALS
 * multi-line JSON hain — heredoc me real newlines aate hain -> dotenv
 * INVALID ("Invalid dotenv file"). Ye writer:
 *   - JSON secrets ko JSON.parse + JSON.stringify se SINGLE-LINE compact
 *     karta hai (value semantics same rehte hain)
 *   - non-JSON values me CR/LF ko \n escape me badalta hai
 *   - har entry `KEY=value` (single line) likhta hai
 * Secret values logs me KABHI print nahi hoti (sirf key-names).
 */

const fs = require("fs");
const path = require("path");

const KEYS = [
  ["TELEGRAM_BOT_TOKEN", "S_TELEGRAM_BOT_TOKEN"],
  ["TELEGRAM_CHAT_ID", "S_TELEGRAM_CHAT_ID"],
  ["TELEGRAM_ADMIN_CHAT_ID", "S_TELEGRAM_ADMIN_CHAT_ID"],
  ["GEMINI_API_KEY", "S_GEMINI_API_KEY"],
  ["GMAIL_CREDENTIALS", "S_GMAIL_CREDENTIALS"],
  ["SERVICE_ACCOUNT_JSON", "S_SERVICE_ACCOUNT_JSON"],
  ["AGENT_ADMIN_TOKEN", "S_AGENT_ADMIN_TOKEN"],
];

function safeValue(rawValue) {
  const value = String(rawValue || "");
  if (!value) return "";
  // JSON ho (multi-line service-account/gmail credentials) -> single-line compact
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
  } catch {
    /* not JSON — normal value */
  }
  // non-JSON: real newlines ko dotenv-safe \n escape me
  return value.replace(/\r/g, "").replace(/\n/g, "\\n");
}

const outPath = path.join(__dirname, "..", "ai_backend", ".env");
const lines = [];
const missing = [];
for (const [key, envName] of KEYS) {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") {
    missing.push(key);
    continue;
  }
  lines.push(`${key}=${safeValue(raw)}`);
}
fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.log(`✅ ai_backend/.env likh di (${lines.length} keys) — values logs me nahi jaati`);
if (missing.length) {
  console.warn(`⚠️ Missing secrets (empty likha jayega): ${missing.join(", ")}`);
}

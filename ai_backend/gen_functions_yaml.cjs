#!/usr/bin/env node
"use strict";

/**
 * ==============================================
 *  functions.yaml GENERATOR (deploy speed-fix)
 * ==============================================
 * firebase-tools deploy ke waqt PEHLE ai_backend/functions.yaml dhoondta
 * hai — file mile to user-code (index.js) load hi nahi hota. Bina iske
 * CLI sirf 10 second wait karta hai aur bhaari codebase (agents/video
 * modules) slow machines (Windows + antivirus) pe timeout ho jata hai:
 *   "User code failed to load. Cannot determine backend specification"
 *
 * KAB CHALANA: jab bhi functions add/change ho (naya export, secrets,
 * schedule) ya deploy "No function matches" de:
 *   1) ai_backend/package.json me "main" temporarily "index.js" karo
 *   2) node ai_backend/gen_functions_yaml.cjs
 *   3) "main" wapas "seo_export.js"
 *   4) functions.yaml commit kar do
 */

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const here = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));
if (pkg.main !== "index.js") {
  console.error('❌ Pehle ai_backend/package.json me "main": "index.js" set karo (regen ke baad wapas "seo_export.js")');
  process.exit(1);
}

const bin = path.join(here, "node_modules", ".bin", "firebase-functions");
if (!fs.existsSync(bin)) {
  console.error("❌ ai_backend/node_modules missing — pehle `npm install --legacy-peer-deps` chalao");
  process.exit(1);
}

const port = 8800 + Math.floor(Math.random() * 120);
const child = spawn(process.execPath, [bin, here], {
  cwd: here, // loader cwd-based resolve karta hai — repo-root se chala to root load karne lagta hai
  env: {
    ...process.env,
    PORT: String(port),
    FUNCTIONS_CONTROL_API: "true",
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || "studymaterial-406ad",
    FIREBASE_CONFIG: process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: "studymaterial-406ad" }),
  },
  stdio: ["ignore", "ignore", "inherit"],
});

// CLI ka timeout sirf 10s hai — humara apna loader 90s tak wait karta hai
// (slow Windows/antivirus machines ke liye).
const deadline = Date.now() + 90000;

function poll() {
  const req = http.get(`http://127.0.0.1:${port}/__/functions.yaml`, (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      if (res.statusCode !== 200 || !data.includes("specVersion")) return retry();
      fs.writeFileSync(path.join(here, "functions.yaml"), data, "utf8");
      const hasApi = data.includes('"entryPoint":"api"');
      console.log(`✅ functions.yaml likh di (${data.length} bytes) — api function: ${hasApi ? "INCLUDED ✅" : "⚠️ MISSING!"}`);
      child.kill("SIGKILL");
      process.exit(hasApi ? 0 : 1);
    });
  });
  req.on("error", retry);
  req.setTimeout(2000, () => req.destroy(new Error("poll-timeout")));
}

function retry() {
  if (Date.now() > deadline) {
    console.error("❌ 90s me functions.yaml nahi bana — upar ka error dekho (code load fail hua hai)");
    child.kill("SIGKILL");
    process.exit(1);
  }
  setTimeout(poll, 1000);
}

poll();

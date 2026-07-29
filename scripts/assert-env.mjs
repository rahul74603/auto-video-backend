#!/usr/bin/env node
/**
 * BUILD GUARD — Firebase web settings (VITE_FIREBASE_*) bina build rakhdo.
 *
 * Vite build ke waqt env values JS bundle me INLINE ho jaati hain.
 * Agar .env file machine pe missing/galat ho to bundle khaali settings ke
 * saath ban jaata hai aur LIVE SITE dead ho jaati hai (text-only screen).
 * Ye guard build ko pehle hi rok deta hai — adhoori zip kabhi na bane.
 */

import { readFileSync, existsSync } from "node:fs";

// CI (GitHub Actions — app-social-shell ke liye) ya explicit skip pe guard bypass.
// Real cPanel-ki-build PC pe hoti hai — wahi guard zaroori hai.
if (process.env.CI === "true" || process.env.SKIP_ENV_GUARD === "1") {
  console.log("⚠️  Build guard: CI/skip mode — env check bypass (y bundle cPanel pe upload mat karna!)");
  process.exit(0);
}

const REQUIRED = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

// .env* files se values padho (process.env bhi check hota hai — CI ke liye)
const envFiles = [".env", ".env.production", ".env.local", ".env.production.local"];
const fromFile = {};
for (const file of envFiles) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (match) fromFile[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const missing = REQUIRED.filter((key) => {
  const value = process.env[key] || fromFile[key];
  return !value || value === "undefined" || value.length < 6;
});

if (missing.length) {
  console.error(`
❌ BUILD ROK DIYA GAYA — Firebase web settings nahi mili!

Missing/empty: ${missing.join(", ")}

Kya karna hai:
  1. Project root me ".env" file banao (firebase console → project settings → web app config)
  2. Usme ye 6 lines daalo:
     VITE_FIREBASE_API_KEY=...
     VITE_FIREBASE_AUTH_DOMAIN=...
     VITE_FIREBASE_PROJECT_ID=...
     VITE_FIREBASE_STORAGE_BUCKET=...
     VITE_FIREBASE_MESSAGING_SENDER_ID=...
     VITE_FIREBASE_APP_ID=...
  3. Phir se: npm run build

(Alag machine/CI pe ho to inhe environment variables me set karo.)
Khaali settings wali build LIVE site tood deti hai — isliye guard ne roka. 🛡️
`);
  process.exit(1);
}

console.log("✅ Build guard: Firebase web settings OK — build aage badh raha hai.");

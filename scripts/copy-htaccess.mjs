#!/usr/bin/env node
/**
 * copy-htaccess.mjs — vite build ke baad public/.htaccess ko dist/ me copy karta hai.
 * (Vite dotfiles hamesha copy nahi karta; .htaccess cPanel deploy ke liye zaroori hai)
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "public/.htaccess");
const outDir = process.argv[2] || resolve(root, "dist");

if (!existsSync(src)) {
  console.warn("⚠️ public/.htaccess not found — skip");
  process.exit(0);
}

import { mkdirSync } from "node:fs";
mkdirSync(outDir, { recursive: true });
copyFileSync(src, resolve(outDir, ".htaccess"));
console.log("✅ .htaccess → dist/ copied");

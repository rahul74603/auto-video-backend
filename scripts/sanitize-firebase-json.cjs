/**
 * Pre-deploy sanitizer for Firebase functions deploy on Spark plan.
 * Run this BEFORE `firebase deploy`.
 * Writes a minimal firebase.json with ONLY functions config.
 */
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const targetPath = path.join(rootDir, "firebase.json");

const MINIMAL_CONFIG = {
  functions: [
    {
      source: "ai_backend",
      codebase: "default",
      ignore: [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local",
      ],
    },
  ],
};

fs.writeFileSync(targetPath, JSON.stringify(MINIMAL_CONFIG, null, 2) + "\n", "utf8");

const written = JSON.parse(fs.readFileSync(targetPath, "utf8"));
console.log("firebase.json overwritten successfully.");
console.log("Top-level keys:", Object.keys(written));

const forbiddenKeys = ["extensions", "dataconnect", "dataConnect"];
for (const k of forbiddenKeys) {
  if (k in written) {
    console.error("FAIL: forbidden key '" + k + "' still present!");
    process.exit(1);
  }
}
console.log("OK: firebase.json is clean and deploy-safe for Spark plan.");

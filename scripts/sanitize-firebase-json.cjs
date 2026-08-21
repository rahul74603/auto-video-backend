/**
 * Pre-deploy sanitizer for Firebase functions deploy on Spark plan.
 * Writes a minimal firebase.json with ONLY functions config.
 * Also removes any package-level "extensions" references that confuse old CLI.
 */
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

// 1. Overwrite root firebase.json with functions-only minimal config
const rootFbPath = path.join(rootDir, "firebase.json");
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
fs.writeFileSync(rootFbPath, JSON.stringify(MINIMAL_CONFIG, null, 2) + "\n", "utf8");
console.log("✅ Root firebase.json sanitized (functions-only).");

// 2. Sanitize ai_backend/package.json — remove any "extensions" key
const pkgPath = path.join(rootDir, "ai_backend", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
delete pkg.extensions;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
console.log("✅ ai_backend/package.json sanitized (extensions key removed).");

// 3. Verify
const written = JSON.parse(fs.readFileSync(rootFbPath, "utf8"));
const forbiddenKeys = ["extensions", "dataconnect", "dataConnect"];
for (const k of forbiddenKeys) {
  if (k in written) {
    console.error("❌ FAIL: forbidden key '" + k + "' in firebase.json!");
    process.exit(1);
  }
}
console.log("✅ All good. firebase.json keys:", Object.keys(written));

/**
 * Patch firebase-functions v7 build manifest to REMOVE the "extensions" key
 * so firebase-tools v12 accepts it on Spark plan (v12 doesn't know the
 * "extensions" build-spec key and throws "Unexpected key extensions").
 *
 * Run AFTER npm ci in ai_backend, BEFORE firebase deploy.
 */
const fs = require("fs");
const path = require("path");

const TARGET = path.join(
  __dirname,
  "..",
  "ai_backend",
  "node_modules",
  "firebase-functions",
  "lib",
  "runtime",
  "loader.js"
);

if (!fs.existsSync(TARGET)) {
  console.error("❌ loader.js not found. Run npm ci in ai_backend first.");
  process.exit(1);
}

let src = fs.readFileSync(TARGET, "utf8");
const origCount = src.split("\n").length;

// 1. Remove bare `extensions` property line from the stack object
src = src
  .split("\n")
  .filter((line) => {
    if (/^\s*extensions\s*,?\s*$/.test(line)) {
      console.log("   → removing extensions prop:", line.trim());
      return false;
    }
    return true;
  })
  .join("\n");

// 2. Null out EXTENSION trigger type constants so they never register extensions
src = src.replace(
  /FUNCTION:\s*"firebaseextensions\.v1beta\.function"/g,
  'FUNCTION: ""'
);
src = src.replace(
  /V2FUNCTION:\s*"firebaseextensions\.v1beta\.v2function"/g,
  'V2FUNCTION: ""'
);

fs.writeFileSync(TARGET, src, "utf8");
console.log(`✅ Patched loader.js (${origCount} → ${src.split("\n").length} lines)`);

// Verify
if (/^\s*extensions\s*,?\s*$/m.test(src)) {
  console.error("❌ extensions prop still present!");
  process.exit(1);
}
console.log("✅ Build manifest is now extensions-free — v12 CLI will accept it.");

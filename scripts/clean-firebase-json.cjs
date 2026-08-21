const fs = require("fs");
const path = require("path");
const TARGET = path.join(__dirname, "..", "firebase.json");
const MINIMAL = {
  functions: [
    {
      source: "ai_backend",
      codebase: "default",
      ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
    },
  ],
};
fs.writeFileSync(TARGET, JSON.stringify(MINIMAL, null, 2) + "\n", "utf8");
console.log("✅ firebase.json cleaned (functions-only for Spark)");
console.log(fs.readFileSync(TARGET, "utf8"));

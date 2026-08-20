#!/usr/bin/env bash
# =============================================================================
# StudyGyaan — Video workflow installer
#
# Copies the four video workflow files from ai_backend/github_workflows/
# into .github/workflows/ and commits them.
#
# Why this script exists: the Arena bot lacks the GitHub App `workflows`
# permission, so it could not push files under .github/workflows/. Your own
# GitHub account can.
#
# Usage (from the repository root):
#   bash ai_backend/github_workflows/install.sh
# =============================================================================
set -euo pipefail

FILES=(video_dispatcher.yml video_maker.yml mock_test_maker.yml fast_track.yml)
SRC="ai_backend/github_workflows"
DST=".github/workflows"

# --- sanity: must run from the repo root -------------------------------------
if [ ! -d .git ] || [ ! -d "$SRC" ]; then
  echo "❌ Repository root se chalao:  cd <repo> && bash $SRC/install.sh"
  exit 1
fi

mkdir -p "$DST"

echo "📋 Installing video workflow files..."
for f in "${FILES[@]}"; do
  if [ ! -f "$SRC/$f" ]; then
    echo "❌ Missing source file: $SRC/$f"
    exit 1
  fi
  cp "$SRC/$f" "$DST/$f"
  echo "   ✅ $DST/$f"
done

# --- verify the copies are byte-identical ------------------------------------
echo ""
echo "🔍 Verifying..."
for f in "${FILES[@]}"; do
  if diff -q "$SRC/$f" "$DST/$f" >/dev/null; then
    echo "   ✅ $f identical"
  else
    echo "   ❌ $f differs — aborting"
    exit 1
  fi
done

# --- safety check: dispatcher must ship disabled ------------------------------
if grep -qE "^\s*-\s*cron:" "$DST/video_dispatcher.yml"; then
  echo ""
  echo "   ⚠️  NOTE: video_dispatcher.yml ka schedule ACTIVE hai."
  echo "       Pehle unlisted test karo, tabhi live rakho."
else
  echo "   ✅ dispatcher schedule disabled (manual-only) — safe to install"
fi

echo ""
echo "📦 Staging..."
git add "$DST"

if git diff --cached --quiet; then
  echo "ℹ️  Kuch change nahi — files pehle se installed hain."
  exit 0
fi

git diff --cached --stat

echo ""
echo "✅ Ho gaya. Ab commit + push karo:"
echo ""
echo "    git commit -m \"Install billing-independent video dispatcher workflows\""
echo "    git push origin \$(git rev-parse --abbrev-ref HEAD)"
echo ""

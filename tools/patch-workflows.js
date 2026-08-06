/**
 * patch-workflows.js — One-click automation guard installer for GitHub Actions
 * Run from project root: node tools/patch-workflows.js
 * 
 * What it does:
 * - Adds 🛑 Check Automation Switch step to all cost-bearing workflows
 * - Makes later steps conditional on enabled == true
 * - Uses ai_backend/check_automation.js which reads Firestore system_settings/automation
 * 
 * Safe to run multiple times — skips if already patched.
 */

const fs = require('fs');
const path = require('path');

const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');

const mapping = {
  'auto_blog.yml': 'auto_blog',
  'auto-mocktest-generator.yml': 'mock_test',
  'mock_test_maker.yml': 'mock_test',
  'govt_jobs_scraper.yml': 'govt_jobs',
  'fast_track.yml': 'fast_track',
  'video_maker.yml': 'video_maker',
  'long_video_maker.yml': 'long_video',
  'web_stories.yml': 'web_stories',
  'daily_job_alert.yml': 'daily_alert',
  'fb_post.yml': 'fb_post',
  'google_indexing.yml': 'google_indexing',
  'payment_checker.yml': 'payment_checker',
  'note_processor.yml': 'note_processor',
  'autpdf.yml': 'pdf_gen',
  'telegram_alert.yml': 'telegram_drafts',
};

function createCheckStep(feature, hasAiBackendWorkdir) {
  if (hasAiBackendWorkdir) {
    return `      - name: 🛑 Check Automation Switch (${feature})
        id: automation_check
        env:
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
          FIREBASE_SERVICE_ACCOUNT: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          GOOGLE_APPLICATION_CREDENTIALS: \${{ secrets.GOOGLE_APPLICATION_CREDENTIALS }}
        run: |
          node check_automation.js ${feature} || STATUS=$?
          if [ "$STATUS" = "78" ]; then
            echo "enabled=false" >> $GITHUB_OUTPUT
            echo "⏸️ ${feature} paused — skipping workflow"
            exit 0
          else
            echo "enabled=true" >> $GITHUB_OUTPUT
          fi
`;
  } else {
    return `      - name: 🛑 Check Automation Switch (${feature})
        id: automation_check
        env:
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
          FIREBASE_SERVICE_ACCOUNT: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        working-directory: ai_backend
        run: |
          npm install --ignore-scripts --legacy-peer-deps axios firebase-admin 2>&1 | tail -n 5 || true
          node check_automation.js ${feature} || STATUS=$?
          if [ "$STATUS" = "78" ]; then
            echo "enabled=false" >> $GITHUB_OUTPUT
            echo "⏸️ ${feature} paused — skipping workflow"
          else
            echo "enabled=true" >> $GITHUB_OUTPUT
          fi
`;
  }
}

// Special handling for fast_track and telegram_alert (separate jobs)
function patchFastTrack(filePath) {
  const content = `
name: Fast Track Scraper

on:
  schedule:
    - cron: '30 20 * * *'  # रात 2:00 बजे IST
  workflow_dispatch: 

jobs:
  check-automation:
    runs-on: ubuntu-latest
    outputs:
      enabled: \${{ steps.automation_check.outputs.enabled }}
    steps:
      - name: 📥 Checkout Code
        uses: actions/checkout@v4

      - name: 🛑 Check Automation Switch (fast_track)
        id: automation_check
        env:
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
          FIREBASE_SERVICE_ACCOUNT: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        working-directory: ai_backend
        run: |
          npm install --ignore-scripts --legacy-peer-deps axios firebase-admin 2>&1 | tail -n 5 || true
          node check_automation.js fast_track || STATUS=$?
          if [ "$STATUS" = "78" ]; then
            echo "enabled=false" >> $GITHUB_OUTPUT
            echo "⏸️ fast_track paused — skipping workflow"
          else
            echo "enabled=true" >> $GITHUB_OUTPUT
          fi

  run-api:
    needs: check-automation
    if: needs.check-automation.outputs.enabled == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Fast Track API
        run: |
          curl -X GET "https://us-central1-studymaterial-406ad.cloudfunctions.net/triggerFastTrackUpdates" \\
          -H "x-gemini-key: \${{ secrets.GEMINI_API_KEY }}" \\
          -H "x-auth-token: StudyGyaan_FastTrack_786"
`;
  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
  console.log(`✅ Patched ${path.basename(filePath)} (special)`);
}

function patchTelegram(filePath) {
  const content = `
name: Send Telegram Alert

on:
  repository_dispatch:
    types: [send_telegram_alert]
  workflow_dispatch:

jobs:
  check-automation:
    runs-on: ubuntu-latest
    outputs:
      enabled: \${{ steps.automation_check.outputs.enabled }}
    steps:
      - name: 📥 Checkout Code
        uses: actions/checkout@v4

      - name: 🛑 Check Automation Switch (telegram_drafts)
        id: automation_check
        env:
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
          FIREBASE_SERVICE_ACCOUNT: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        working-directory: ai_backend
        run: |
          npm install --ignore-scripts --legacy-peer-deps axios firebase-admin 2>&1 | tail -n 5 || true
          node check_automation.js telegram_drafts || STATUS=$?
          if [ "$STATUS" = "78" ]; then
            echo "enabled=false" >> $GITHUB_OUTPUT
            echo "⏸️ telegram_drafts paused — skipping"
          else
            echo "enabled=true" >> $GITHUB_OUTPUT
          fi

  send_message:
    needs: check-automation
    if: needs.check-automation.outputs.enabled == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Send Telegram Message via GitHub Script
        uses: actions/github-script@v7
        env:
          BOT_TOKEN: \${{ secrets.TELEGRAM_BOT_TOKEN }}
          CHAT_ID: \${{ secrets.TELEGRAM_CHAT_ID }}
        with:
          script: |
            const payload = context.payload.client_payload;
            const jobData = payload.jobData;
            const docId = payload.docId;
            const type = payload.type; // 'JOB' or 'FAST_TRACK'

            const botToken = process.env.BOT_TOKEN;
            const chatId = process.env.CHAT_ID;

            if (!botToken || !chatId) {
                console.error("❌ GitHub Secrets (BOT_TOKEN or CHAT_ID) are missing!");
                return;
            }

            let title = jobData.title || 'Official Update';
            let url = \`https://studygyaan.in/\${type === 'JOB' ? 'job' : 'update'}/\${docId}\`;

            let message = \`🚨 <b>New Update Alert!</b> 🚨\\\\n\\\\n\` +
                          \`📌 <b>Title:</b> \${title}\\\\n\`;

            if (type === 'JOB') {
                message += \`🏢 <b>Dept:</b> \${jobData.organization || 'Govt Dept'}\\\\n\` +
                           \`🎓 <b>Qualification:</b> \${jobData.qualification || 'Check Details'}\\\\n\` +
                           \`⏳ <b>Last Date:</b> \${jobData.lastDate || 'Apply Soon'}\\\\n\\\\n\`;
            } else {
                message += \`\\\\n\`;
            }

            message += \`📖 <b>Full Details Here:</b>\\\\n\${url}\\\\n\\\\n\` +
                       \`🚀 <i>Join @studygyaan_official for updates!</i>\`;

            const apiUrl = \`https://api.telegram.org/bot\${botToken}/sendMessage\`;

            console.log(\`Sending message for: \${title}\`);

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: message,
                        parse_mode: 'HTML',
                        disable_web_page_preview: false
                    })
                });
                
                const result = await response.json();
                if (result.ok) {
                    console.log("✅ Telegram Message Sent Successfully via GitHub Actions!");
                } else {
                    console.error("❌ Telegram API Error:", result);
                }
            } catch(error) {
                console.error("❌ Fetch failed:", error);
            }
`;
  fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
  console.log(`✅ Patched ${path.basename(filePath)} (special)`);
}

function patchGeneric(filePath, feature) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('Check Automation Switch') || content.includes('check_automation')) {
    console.log(`⏭️  ${path.basename(filePath)} already patched — skip`);
    return;
  }

  const hasAiBackendWorkdir = content.includes('working-directory: ai_backend');
  const checkStep = createCheckStep(feature, hasAiBackendWorkdir);

  // Insert after checkout
  if (content.includes('actions/checkout@v4')) {
    // Find first checkout and insert after
    content = content.replace(/(uses:\s*actions\/checkout@v4[^\n]*\n)/, `$1\n${checkStep}\n`);
  } else {
    // Fallback: insert after jobs:
    content = content.replace(/(jobs:\s*\n)/, `$1  # 🛑 Automation guard\n${checkStep}\n`);
  }

  // Add if condition to all subsequent steps that have run: and no if:
  const lines = content.split('\n');
  let foundCheck = false;
  let output = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    output.push(line);
    if (line.includes('id: automation_check')) foundCheck = true;
    // After check, for each "- name:" that is followed soon by run: and no if:
    if (foundCheck && /^\s*- name:/.test(line) && !line.includes('Check Automation Switch')) {
      // Look ahead 10 lines
      const snippet = lines.slice(i, i + 10).join('\n');
      if (!snippet.includes('if:') && snippet.includes('run:')) {
        const indent = (line.match(/^(\s*)- name:/) || ['', '      '])[1] + '  ';
        output.push(`${indent}if: steps.automation_check.outputs.enabled == 'true'`);
      }
    }
  }

  fs.writeFileSync(filePath, output.join('\n'), 'utf8');
  console.log(`✅ Patched ${path.basename(filePath)} -> ${feature}`);
}

// MAIN
console.log('🔧 Patching workflows for automation guard...\n');

if (!fs.existsSync(workflowsDir)) {
  console.error('❌ .github/workflows folder not found!');
  process.exit(1);
}

const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml'));

for (const file of files) {
  const filePath = path.join(workflowsDir, file);

  // Skip CI, codeql, deploy, firebase_data — not cost-bearing
  if (['ci.yml', 'codeql.yml', 'deploy.yml', 'firebase_data.yml'].includes(file)) {
    console.log(`⏭️  ${file} skipped (not cost-bearing)`);
    continue;
  }

  if (file === 'fast_track.yml') {
    patchFastTrack(filePath);
    continue;
  }
  if (file === 'telegram_alert.yml') {
    patchTelegram(filePath);
    continue;
  }

  const feature = mapping[file] || 'global';
  patchGeneric(filePath, feature);
}

console.log('\n✅ All workflows patched! Now run:');
console.log('   git add .github/workflows/');
console.log('   git commit -m "ci: add automation guard"');
console.log('   git push origin arena/019fd293-auto-video-backend');

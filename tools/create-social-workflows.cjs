const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.github', 'workflows');

const files = {
  'auto_post_twitter.yml': `name: Auto Post to Twitter/X

on:
  repository_dispatch:
    types: [twitter_post, social_media_post]
  workflow_dispatch:
    inputs:
      title:
        description: 'Post title/message'
        required: false
        default: 'StudyGyaan Update'
      url:
        description: 'URL to share'
        required: false
        default: 'https://studygyaan.in'

jobs:
  check-automation:
    runs-on: ubuntu-latest
    outputs:
      enabled: \${{ steps.automation_check.outputs.enabled }}
    steps:
      - name: 📥 Checkout Code
        uses: actions/checkout@v4
      - name: 🛑 Check Automation Switch (twitter)
        id: automation_check
        env:
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
          FIREBASE_SERVICE_ACCOUNT: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        working-directory: ai_backend
        run: |
          npm install --ignore-scripts --legacy-peer-deps firebase-admin axios 2>&1 | tail -n 3 || true
          node check_automation.js twitter || STATUS=$?
          if [ "$STATUS" = "78" ]; then
            echo "enabled=false" >> $GITHUB_OUTPUT
            echo "⏸️ twitter paused — skipping"
          else
            echo "enabled=true" >> $GITHUB_OUTPUT
          fi

  post_to_twitter:
    needs: check-automation
    if: needs.check-automation.outputs.enabled == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ai_backend
    steps:
      - name: 📥 Checkout Code
        uses: actions/checkout@v4
      - name: ⚙️ Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: 📦 Install Dependencies
        run: npm install --ignore-scripts --legacy-peer-deps
      - name: 🐦 Post to Twitter/X
        env:
          TWITTER_API_KEY: \${{ secrets.TWITTER_API_KEY }}
          TWITTER_API_SECRET: \${{ secrets.TWITTER_API_SECRET }}
          TWITTER_ACCESS_TOKEN: \${{ secrets.TWITTER_ACCESS_TOKEN }}
          TWITTER_ACCESS_SECRET: \${{ secrets.TWITTER_ACCESS_SECRET }}
          TWITTER_BEARER_TOKEN: \${{ secrets.TWITTER_BEARER_TOKEN }}
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
        run: |
          node - << 'NODE'
          const jobData = {
            title: \`\${{ github.event.client_payload.jobData.title }}\` || process.env.INPUT_TITLE || 'StudyGyaan Update',
            slug: \`\${{ github.event.client_payload.jobData.slug }}\` || '',
            organization: \`\${{ github.event.client_payload.jobData.organization }}\` || '',
            lastDate: \`\${{ github.event.client_payload.jobData.lastDate }}\` || '',
            id: \`\${{ github.event.client_payload.jobData.id }}\` || 'test'
          };
          const { postJobToTwitter } = require('./social_media/twitter_poster');
          postJobToTwitter(jobData).then(r => {
            console.log('Twitter result:', r);
            process.exit(r.sent ? 0 : (r.reason === 'no-creds' ? 0 : 1));
          });
          NODE
`,

  'auto_post_linkedin.yml': `name: Auto Post to LinkedIn

on:
  repository_dispatch:
    types: [linkedin_post, social_media_post]
  workflow_dispatch:
    inputs:
      title:
        description: 'Post title'
        required: false
        default: 'StudyGyaan Update'
      url:
        description: 'URL to share'
        required: false
        default: 'https://studygyaan.in'

jobs:
  check-automation:
    runs-on: ubuntu-latest
    outputs:
      enabled: \${{ steps.automation_check.outputs.enabled }}
    steps:
      - name: 📥 Checkout Code
        uses: actions/checkout@v4
      - name: 🛑 Check Automation Switch (linkedin)
        id: automation_check
        env:
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
          FIREBASE_SERVICE_ACCOUNT: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        working-directory: ai_backend
        run: |
          npm install --ignore-scripts --legacy-peer-deps firebase-admin axios 2>&1 | tail -n 3 || true
          node check_automation.js linkedin || STATUS=$?
          if [ "$STATUS" = "78" ]; then
            echo "enabled=false" >> $GITHUB_OUTPUT
            echo "⏸️ linkedin paused — skipping"
          else
            echo "enabled=true" >> $GITHUB_OUTPUT
          fi

  post_to_linkedin:
    needs: check-automation
    if: needs.check-automation.outputs.enabled == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ai_backend
    steps:
      - name: 📥 Checkout Code
        uses: actions/checkout@v4
      - name: ⚙️ Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: 📦 Install Dependencies
        run: npm install --ignore-scripts --legacy-peer-deps
      - name: 💼 Post to LinkedIn
        env:
          LINKEDIN_ACCESS_TOKEN: \${{ secrets.LINKEDIN_ACCESS_TOKEN }}
          LINKEDIN_ORGANIZATION_ID: \${{ secrets.LINKEDIN_ORGANIZATION_ID }}
          LINKEDIN_PERSON_ID: \${{ secrets.LINKEDIN_PERSON_ID }}
          LINKEDIN_CLIENT_ID: \${{ secrets.LINKEDIN_CLIENT_ID }}
          LINKEDIN_CLIENT_SECRET: \${{ secrets.LINKEDIN_CLIENT_SECRET }}
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
        run: |
          node - << 'NODE'
          const jobData = {
            title: \`\${{ github.event.client_payload.jobData.title }}\` || 'StudyGyaan Update',
            slug: \`\${{ github.event.client_payload.jobData.slug }}\` || '',
            organization: \`\${{ github.event.client_payload.jobData.organization }}\` || 'Govt Dept',
            lastDate: \`\${{ github.event.client_payload.jobData.lastDate }}\` || '',
            vacancies: \`\${{ github.event.client_payload.jobData.vacancies }}\` || '',
            location: \`\${{ github.event.client_payload.jobData.location }}\` || 'India',
            id: \`\${{ github.event.client_payload.jobData.id }}\` || 'test'
          };
          const { postJobToLinkedIn } = require('./social_media/linkedin_poster');
          postJobToLinkedIn(jobData).then(r => {
            console.log('LinkedIn result:', r);
            process.exit(r.sent ? 0 : (r.reason === 'no-creds' ? 0 : 1));
          });
          NODE
`,

  'auto_post_social_all.yml': `name: Auto Post to All Social Media (FB + Twitter + LinkedIn + Instagram)

on:
  repository_dispatch:
    types: [social_media_post, all_social_post, govt_job_published]
  workflow_dispatch:
    inputs:
      title:
        description: 'Post title'
        required: false
        default: 'StudyGyaan - Latest Govt Jobs'
      url:
        description: 'URL to share'
        required: false
        default: 'https://studygyaan.in/govt-jobs'
      type:
        description: 'Content type (JOB, BLOG, FAST_TRACK)'
        required: false
        default: 'JOB'

jobs:
  check-automation:
    runs-on: ubuntu-latest
    outputs:
      enabled: \${{ steps.automation_check.outputs.enabled }}
    steps:
      - name: 📥 Checkout Code
        uses: actions/checkout@v4
      - name: 🛑 Check Automation Switch (global)
        id: automation_check
        env:
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
          FIREBASE_SERVICE_ACCOUNT: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        working-directory: ai_backend
        run: |
          npm install --ignore-scripts --legacy-peer-deps firebase-admin axios 2>&1 | tail -n 3 || true
          node check_automation.js global || STATUS=$?
          if [ "$STATUS" = "78" ]; then
            echo "enabled=false" >> $GITHUB_OUTPUT
            echo "⏸️ All social media paused — global OFF"
          else
            echo "enabled=true" >> $GITHUB_OUTPUT
          fi

  post_all_social:
    needs: check-automation
    if: needs.check-automation.outputs.enabled == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ai_backend
    steps:
      - name: 📥 Checkout Code
        uses: actions/checkout@v4
      - name: ⚙️ Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: 📦 Install Dependencies
        run: npm install --ignore-scripts --legacy-peer-deps
      - name: 🚀 Post to All Social Media
        env:
          FB_PAGE_ID: \${{ secrets.FB_PAGE_ID }}
          FB_PAGE_TOKEN: \${{ secrets.FB_PAGE_TOKEN }}
          TWITTER_API_KEY: \${{ secrets.TWITTER_API_KEY }}
          TWITTER_API_SECRET: \${{ secrets.TWITTER_API_SECRET }}
          TWITTER_ACCESS_TOKEN: \${{ secrets.TWITTER_ACCESS_TOKEN }}
          TWITTER_ACCESS_SECRET: \${{ secrets.TWITTER_ACCESS_SECRET }}
          TWITTER_BEARER_TOKEN: \${{ secrets.TWITTER_BEARER_TOKEN }}
          LINKEDIN_ACCESS_TOKEN: \${{ secrets.LINKEDIN_ACCESS_TOKEN }}
          LINKEDIN_ORGANIZATION_ID: \${{ secrets.LINKEDIN_ORGANIZATION_ID }}
          LINKEDIN_PERSON_ID: \${{ secrets.LINKEDIN_PERSON_ID }}
          INSTAGRAM_ACCOUNT_ID: \${{ secrets.INSTAGRAM_ACCOUNT_ID }}
          YOUTUBE_CLIENT_ID: \${{ secrets.YOUTUBE_CLIENT_ID }}
          YOUTUBE_CLIENT_SECRET: \${{ secrets.YOUTUBE_CLIENT_SECRET }}
          YOUTUBE_REFRESH_TOKEN: \${{ secrets.YOUTUBE_REFRESH_TOKEN }}
          SERVICE_ACCOUNT_JSON: \${{ secrets.SERVICE_ACCOUNT_JSON }}
          TELEGRAM_BOT_TOKEN: \${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: \${{ secrets.TELEGRAM_CHAT_ID }}
        run: |
          node - << 'NODE'
          const jobData = {
            title: \`\${{ github.event.client_payload.jobData.title }}\` || 'StudyGyaan Update',
            slug: \`\${{ github.event.client_payload.jobData.slug }}\` || '',
            organization: \`\${{ github.event.client_payload.jobData.organization }}\` || '',
            lastDate: \`\${{ github.event.client_payload.jobData.lastDate }}\` || '',
            vacancies: \`\${{ github.event.client_payload.jobData.vacancies }}\` || '',
            location: \`\${{ github.event.client_payload.jobData.location }}\` || 'India',
            description: \`\${{ github.event.client_payload.jobData.description }}\` || '',
            id: \`\${{ github.event.client_payload.jobData.id }}\` || 'test'
          };
          const type = \`\${{ github.event.client_payload.type }}\` || 'JOB';
          const { postToAllPlatforms } = require('./social_media/social_orchestrator');
          postToAllPlatforms({ type, data: jobData }).then(result => {
            console.log('📊 Final:', JSON.stringify(result, null, 2));
            process.exit(0);
          });
          NODE
`
};

for (const [name, content] of Object.entries(files)) {
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, content.trim() + '\n', 'utf8');
  console.log(`✅ Created ${name}`);
}
console.log('\nDone — now commit and push from your PC (has workflow permission):');
console.log('git add .github/workflows/auto_post_*.yml');
console.log('git commit -m "ci: add Twitter/LinkedIn/All social workflows"');
console.log('git push origin arena/019fd293-auto-video-backend');

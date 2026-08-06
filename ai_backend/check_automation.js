#!/usr/bin/env node
/**
 * check_automation.js — Used in GitHub Actions workflows
 * Checks Firestore automation_settings doc and exits
 * 
 * Usage:
 *   node ai_backend/check_automation.js auto_drafts
 *   node ai_backend/check_automation.js govt_jobs
 *   node ai_backend/check_automation.js global
 * 
 * Env required:
 *   FIREBASE_SERVICE_ACCOUNT (json string) OR GOOGLE_APPLICATION_CREDENTIALS
 *   Or relies on firebase-admin default
 * 
 * Exit codes:
 *   0 = enabled, continue workflow
 *   78 = disabled, should skip (neutral)
 *   1 = error
 */

const feature = process.argv[2] || 'global';

async function main() {
  const admin = require('firebase-admin');
  
  if (!admin.apps.length) {
    // Try to init from env
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(sa)
        });
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e.message);
        admin.initializeApp();
      }
    } else {
      admin.initializeApp();
    }
  }

  const db = admin.firestore();
  const { isAutomationEnabled } = require('./agents/automation_guard');

  try {
    const result = await isAutomationEnabled(db, feature);
    console.log(`Feature: ${feature}`);
    console.log(`Enabled: ${result.enabled}`);
    console.log(`Reason: ${result.reason}`);

    if (process.env.GITHUB_OUTPUT) {
      const fs = require('fs');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `enabled=${result.enabled}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `reason=${result.reason.replace(/\n/g, ' ')}\n`);
    }

    if (result.enabled) {
      process.exit(0);
    } else {
      // 78 is commonly used as "skip/neutral" in GH Actions
      console.log(`⏸️ Skipping ${feature} — automation paused`);
      process.exit(78);
    }
  } catch (err) {
    console.error('Error checking automation:', err);
    // On error, allow to run (fail-open) to avoid blocking production
    process.exit(0);
  }
}

main();

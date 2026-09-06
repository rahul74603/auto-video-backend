#!/usr/bin/env node
'use strict';

/**
 * growth_learner_run.js — Scheduled Learning Job
 * 
 * Runs periodically (via GitHub Actions cron) to:
 * 1. Collect available new metrics from platforms
 * 2. Normalize and score performance
 * 3. Run learner to discover patterns
 * 4. Store growth insights
 * 5. Generate AI recommendations
 * 
 * This is a separate script from the video dispatcher so learning
 * doesn't add latency to video generation.
 * 
 * Suggested schedule: every 6 hours
 * 
 * Env:
 *   SERVICE_ACCOUNT_JSON (required — for Firestore access)
 *   YOUTUBE_TOKEN (optional — for YouTube analytics)
 *   FB_PAGE_TOKEN (optional — for Facebook/Instagram analytics)
 */

const admin = require('firebase-admin');
require('dotenv').config();

const V = require('./video_state');
const learner = require('./agents/growth/analytics/learner');
const collector = require('./agents/growth/analytics/collector');
const scorer = require('./agents/growth/analytics/scorer');
const { logStructured } = require('./agents/growth/logger');

const DEFAULT_PROJECT_ID = 'studymaterial-406ad';

function initFirebase() {
    if (admin.apps.length) return admin.firestore();
    const raw = process.env.SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('SERVICE_ACCOUNT_JSON secret missing');
    let sa;
    try { sa = JSON.parse(raw); } catch { throw new Error('SERVICE_ACCOUNT_JSON is not valid JSON'); }
    admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: sa.project_id || DEFAULT_PROJECT_ID
    });
    console.log(`✅ Firebase initialized (project: ${sa.project_id || DEFAULT_PROJECT_ID})`);
    return admin.firestore();
}

async function collectNewMetrics(db) {
    console.log('\n📊 Step 1: Collecting new metrics...');
    
    // Find recent videos that need metric refresh
    const recentSnaps = await db.collection('content_performance')
        .orderBy('collectedAt', 'desc')
        .limit(50)
        .get();

    let collected = 0;
    for (const doc of recentSnaps.docs) {
        const data = doc.data();
        if (!data.platformVideoId) continue;
        
        // Refresh metrics at different stages: 1h, 24h, 48h, 7d
        const age = Date.now() - (data.collectedAt || 0);
        const refreshWindows = [
            1 * 60 * 60 * 1000,      // 1 hour
            24 * 60 * 60 * 1000,     // 24 hours
            48 * 60 * 60 * 1000,     // 48 hours
            7 * 24 * 60 * 60 * 1000  // 7 days
        ];
        
        const shouldRefresh = refreshWindows.some(w => Math.abs(age - w) < 30 * 60 * 1000);
        if (!shouldRefresh && age > 2 * 60 * 60 * 1000) continue; // Skip if not in a refresh window

        try {
            const result = await collector.collectPlatformMetrics(db, {
                platform: data.platform,
                platformVideoId: data.platformVideoId,
                contentId: data.contentId,
                publishedAt: data.publishedAt
            });
            if (result.collected) collected++;
        } catch (err) {
            console.log(`  ⚠️ ${data.platform}/${data.platformVideoId}: ${V.shortError(err, 80)}`);
        }
    }
    
    console.log(`  ✅ Collected/refreshed ${collected} metric records`);
    return collected;
}

async function scoreAllPerformance(db) {
    console.log('\n📈 Step 2: Scoring performance...');
    
    const snap = await db.collection('content_performance')
        .where('collectedAt', '>=', Date.now() - 30 * 24 * 60 * 60 * 1000)
        .limit(200)
        .get();

    if (snap.empty) {
        console.log('  ℹ️ No performance data to score');
        return 0;
    }

    // Compute baselines
    const allData = snap.docs.map(d => d.data());
    const baselines = scorer.computeBaselines(allData);
    console.log(`  📊 Baselines computed from ${allData.length} records`);

    // Score each record
    let scored = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.performanceScore) continue; // Already scored
        
        const result = scorer.scorePerformance(data, baselines);
        await doc.ref.update({
            performanceScore: result.performanceScore,
            normalizedScores: result.normalizedScores,
            scoredAt: Date.now()
        });
        scored++;
    }
    
    console.log(`  ✅ Scored ${scored} new records`);
    return scored;
}

async function runLearning(db) {
    console.log('\n🧠 Step 3: Running learner...');
    
    const result = await learner.analyzePatterns(db, { windowDays: 30 });
    
    if (result.patterns && result.patterns.length > 0) {
        console.log(`  ✅ Discovered ${result.patterns.length} patterns from ${result.sampleSize} samples`);
        for (const p of result.patterns) {
            console.log(`     ${p.patternType}: "${p.winningPattern}" (confidence: ${p.confidence}, n=${p.sampleSize})`);
        }
    } else {
        console.log('  ℹ️ No significant patterns yet (need more data)');
    }
    
    return result;
}

async function generateRecommendations(db) {
    console.log('\n💡 Step 4: Generating recommendations...');
    
    const recs = await learner.generateRecommendations(db);
    
    if (recs.length > 0) {
        console.log(`  ✅ ${recs.length} actionable recommendations:`);
        for (const r of recs.slice(0, 5)) {
            console.log(`     → ${r.action} (confidence: ${r.confidence}, n=${r.sampleSize})`);
        }
        
        // Store recommendations
        try {
            await db.collection('growth_recommendations').doc('latest').set({
                recommendations: recs,
                generatedAt: Date.now()
            }, { merge: true });
        } catch (err) {
            console.log(`  ⚠️ Store failed: ${V.shortError(err, 80)}`);
        }
    } else {
        console.log('  ℹ️ No actionable recommendations yet');
    }
    
    return recs;
}

async function main() {
    const runId = process.env.GITHUB_RUN_ID
        ? `learner-gh-${process.env.GITHUB_RUN_ID}`
        : `learner-${Date.now()}`;

    console.log('='.repeat(60));
    console.log('🧠 StudyGyaan Growth Learner (Scheduled Job)');
    console.log(`   run id: ${runId}`);
    console.log('='.repeat(60));

    const db = initFirebase();
    
    try {
        const collected = await collectNewMetrics(db);
        const scored = await scoreAllPerformance(db);
        const learning = await runLearning(db);
        const recs = await generateRecommendations(db);

        console.log(`\n${'='.repeat(60)}`);
        console.log('📊 LEARNING SUMMARY');
        console.log(`   Metrics collected: ${collected}`);
        console.log(`   Records scored: ${scored}`);
        console.log(`   Patterns found: ${(learning.patterns || []).length}`);
        console.log(`   Recommendations: ${recs.length}`);
        console.log('='.repeat(60));

        logStructured('info', 'learner_run_complete', {
            runId, collected, scored,
            patterns: (learning.patterns || []).length,
            recommendations: recs.length
        });

        return 0;
    } catch (err) {
        console.error(`💥 Learner fatal error: ${V.shortError(err)}`);
        logStructured('error', 'learner_run_failed', { runId, error: V.shortError(err) });
        return 1;
    }
}

if (require.main === module) {
    main()
        .then(code => process.exit(code))
        .catch(err => {
            console.error('💥 Fatal:', V.shortError(err));
            process.exit(1);
        });
}

module.exports = { main };

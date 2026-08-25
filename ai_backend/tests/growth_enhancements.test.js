'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Import new modules
const aiVisualEngine = require('../agents/growth/ai_visual_engine');
const layoutEngine = require('../agents/growth/layout_engine');
const deadlineEngine = require('../agents/growth/deadline_engine');
const faqEngine = require('../agents/growth/faq_engine');
const mobileQualityGate = require('../agents/growth/mobile_quality_gate');
const contentAngleEngine = require('../agents/growth/content_angle_engine');
const visualFatiguePrevention = require('../agents/growth/visual_fatigue_prevention');
const ctaEngine = require('../agents/growth/cta_engine');
const motionEngine = require('../agents/growth/motion_engine');
const costControlEngine = require('../agents/growth/cost_control_engine');
const contentSimilarityDetector = require('../agents/growth/content_similarity_detector');

test('AI Visual Engine - generates prompt from job data', () => {
    const jobData = {
        category: 'POLICE',
        slug: 'test-job-123'
    };
    
    const prompt = aiVisualEngine.generatePrompt(jobData);
    
    assert.ok(prompt.includes('police'));
    assert.ok(prompt.length > 50);
});

test('AI Visual Engine - cleanup removes file', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tempPath = path.join(os.tmpdir(), 'test-image-123.jpg');
    fs.writeFileSync(tempPath, 'test');
    
    assert.ok(fs.existsSync(tempPath));
    
    aiVisualEngine.cleanupImage(tempPath);
    
    assert.ok(!fs.existsSync(tempPath));
});

test('Layout Engine - selects layout based on category', () => {
    const jobData = {
        category: 'JOB',
        type: 'JOB'
    };
    
    const layout = layoutEngine.selectLayout(jobData);
    
    assert.ok(layout.key);
    assert.ok(layout.name);
    assert.ok(layout.presenterZone);
    assert.ok(layout.infoZone);
});

test('Layout Engine - prevents recent layout repetition', () => {
    const jobData = {
        category: 'JOB',
        type: 'JOB'
    };
    
    const recentLayouts = ['LAYOUT_A', 'LAYOUT_A', 'LAYOUT_A'];
    
    const layout = layoutEngine.selectLayout(jobData, recentLayouts);
    
    // Should avoid LAYOUT_A since it was used 3 times recently
    assert.notEqual(layout.key, 'LAYOUT_A');
});

test('Layout Engine - validates mobile safety', () => {
    const layout = layoutEngine.LAYOUTS['LAYOUT_A'];
    
    const validation = layoutEngine.validateMobileSafety(layout);
    
    assert.ok(validation.valid);
    assert.equal(validation.issues.length, 0);
});

test('Deadline Engine - calculates urgency correctly', () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const urgency = deadlineEngine.calculateUrgency(tomorrow.toISOString(), today);
    
    assert.equal(urgency.state, 'TOMORROW');
    assert.equal(urgency.daysLeft, 1);
    assert.equal(urgency.shouldRemind, true);
});

test('Deadline Engine - detects closed applications', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const urgency = deadlineEngine.calculateUrgency(yesterday.toISOString(), today);
    
    assert.equal(urgency.state, 'CLOSED');
    assert.equal(urgency.shouldRemind, false);
});

test('Deadline Engine - shouldCreateReminder respects limits', () => {
    const jobData = {
        lastDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow
    };
    
    const previousReminders = [
        { date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() },
        { date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
        { date: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString() }
    ];
    
    const result = deadlineEngine.shouldCreateReminder(jobData, previousReminders);
    
    assert.equal(result.shouldCreate, false);
    assert.ok(result.reason.includes('Max reminders'));
});

test('FAQ Engine - identifies available FAQs', () => {
    const jobData = {
        qualification: '10th Pass',
        ageLimit: '18-25',
        salary: 'Rs. 20,000',
        vacancies: '100'
    };
    
    const faqs = faqEngine.identifyFAQs(jobData);
    
    assert.ok(faqs.length > 0);
    assert.ok(faqs.some(f => f.topic === 'qualification'));
    assert.ok(faqs.some(f => f.topic === 'age_limit'));
});

test('FAQ Engine - selects best FAQ based on priority', () => {
    const jobData = {
        id: 'test-job-1',
        qualification: '10th Pass',
        lastDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    const previouslyPublished = [];
    
    const result = faqEngine.selectBestFAQ(jobData, previouslyPublished);
    
    assert.equal(result.selected, true);
    assert.ok(result.faq.topic);
});

test('Mobile Quality Gate - validates text', () => {
    const validText = 'This is a test';
    const result = mobileQualityGate.validateText(validText);
    
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
});

test('Mobile Quality Gate - detects long words', () => {
    const longWordText = 'This has a verylongwordthatshouldnotbehere';
    const result = mobileQualityGate.validateText(longWordText, { maxWordLength: 20 });
    
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0);
});

test('Mobile Quality Gate - detects zone overlap', () => {
    const zone1 = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
    const zone2 = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    
    const overlaps = mobileQualityGate.zonesOverlap(zone1, zone2);
    
    assert.equal(overlaps, true);
});

test('Content Angle Engine - identifies available angles', () => {
    const jobData = {
        title: 'Test Job',
        organization: 'Test Org',
        qualification: '10th Pass',
        vacancies: '100'
    };
    
    const angles = contentAngleEngine.identifyAvailableAngles(jobData);
    
    assert.ok(angles.length > 0);
    assert.ok(angles.some(a => a.key === 'basic_alert'));
});

test('Content Angle Engine - selects angle based on history', () => {
    const jobData = {
        title: 'Test Job',
        organization: 'Test Org',
        qualification: '10th Pass'
    };
    
    const recentAngles = ['basic_alert', 'basic_alert', 'basic_alert'];
    
    const angle = contentAngleEngine.selectBestAngle(jobData, recentAngles);
    
    assert.ok(angle.key);
    assert.notEqual(angle.key, 'basic_alert'); // Should avoid recent
});

test('Visual Fatigue Prevention - calculates diversity score', () => {
    const proposed = {
        visualStyle: 'editorial',
        layout: 'LAYOUT_A',
        presenter: 'presenter_1',
        hookType: 'urgency'
    };
    
    const recentHistory = [
        { visualStyle: 'editorial', layout: 'LAYOUT_A', presenter: 'presenter_1', hookType: 'urgency' },
        { visualStyle: 'editorial', layout: 'LAYOUT_A', presenter: 'presenter_1', hookType: 'urgency' }
    ];
    
    const diversity = visualFatiguePrevention.calculateDiversityScore(proposed, recentHistory);
    
    assert.ok(diversity.score >= 0);
    assert.ok(diversity.score <= 100);
});

test('Visual Fatigue Prevention - detects repetition', () => {
    const proposed = {
        visualStyle: 'editorial',
        layout: 'LAYOUT_A',
        presenter: 'presenter_1',
        hookType: 'urgency'
    };
    
    const recentHistory = [
        { visualStyle: 'editorial', layout: 'LAYOUT_A', presenter: 'presenter_1', hookType: 'urgency' },
        { visualStyle: 'editorial', layout: 'LAYOUT_A', presenter: 'presenter_1', hookType: 'urgency' },
        { visualStyle: 'editorial', layout: 'LAYOUT_A', presenter: 'presenter_1', hookType: 'urgency' }
    ];
    
    const wouldRepeat = visualFatiguePrevention.wouldCauseRepetition(proposed, recentHistory);
    
    assert.equal(wouldRepeat, true);
});

test('CTA Engine - selects CTA based on content type', () => {
    const cta = ctaEngine.selectCTA({
        contentType: 'JOB',
        contentAngle: 'basic_alert',
        urgencyLevel: 'medium'
    });
    
    assert.ok(cta.key);
    assert.ok(cta.template);
});

test('CTA Engine - generates positional CTAs', () => {
    const ctas = ctaEngine.generateVideoCTAs({
        contentType: 'JOB',
        contentAngle: 'basic_alert',
        urgencyLevel: 'medium'
    });
    
    assert.ok(ctas.opening);
    assert.ok(ctas.middle);
    assert.ok(ctas.closing);
});

test('Motion Engine - selects profile based on urgency', () => {
    const profile = motionEngine.selectMotionProfile('JOB', 'high');
    
    assert.ok(profile.name);
    assert.ok(profile.ffmpegFilter || profile.intensity === 'none');
});

test('Motion Engine - safe for text check', () => {
    const highTextProfile = motionEngine.MOTION_PROFILES['kinetic_opening'];
    const isSafe = motionEngine.isMotionSafeForText(highTextProfile, 'high');
    
    assert.equal(isSafe, false);
    
    const staticProfile = motionEngine.MOTION_PROFILES['static_safe'];
    const isStaticSafe = motionEngine.isMotionSafeForText(staticProfile, 'high');
    
    assert.equal(isStaticSafe, true);
});

test('Cost Control Engine - checks image generation limits', async () => {
    const result = await costControlEngine.checkImageGenerationAllowed(null, {
        budgetTier: 'free'
    });
    
    assert.equal(result.allowed, true);
    assert.ok(result.limits);
});

test('Cost Control Engine - estimates monthly cost', () => {
    const estimate = costControlEngine.estimateMonthlyCost(50, 'free');
    
    assert.ok(estimate.dailyImages);
    assert.ok(estimate.monthlyImages);
    assert.ok(estimate.monthlyCost);
});

test('Content Similarity Detector - calculates similarity', () => {
    const content1 = {
        script: 'This is a test script about government jobs',
        hook: 'New job alert',
        title: 'Government Job 2026',
        visualStyle: 'editorial',
        layout: 'LAYOUT_A'
    };
    
    const content2 = {
        script: 'This is a test script about government jobs',
        hook: 'New job alert',
        title: 'Government Job 2026',
        visualStyle: 'editorial',
        layout: 'LAYOUT_A'
    };
    
    const similarity = contentSimilarityDetector.calculateSimilarity(content1, content2);
    
    assert.ok(similarity.similarity > 0.8);
});

test('Content Similarity Detector - detects high similarity', () => {
    const newContent = {
        script: 'This is a test script',
        hook: 'Test hook',
        title: 'Test Title'
    };
    
    const existingContent = [
        {
            script: 'This is a test script',
            hook: 'Test hook',
            title: 'Test Title'
        }
    ];
    
    const result = contentSimilarityDetector.isTooSimilar(newContent, existingContent, {
        similarityThreshold: 0.7
    });
    
    assert.equal(result.isTooSimilar, true);
    assert.ok(result.highestSimilarity > 0.7);
});

test('Content Similarity Detector - suggests changes', () => {
    const newContent = {
        script: 'Test script',
        hook: 'Test hook'
    };
    
    const similarContent = [
        {
            content: { script: 'Test script', hook: 'Test hook' },
            similarity: 0.9,
            breakdown: { script: 0.95, hook: 0.95 }
        }
    ];
    
    const suggestions = contentSimilarityDetector.suggestChanges(newContent, similarContent);
    
    assert.ok(suggestions.length > 0);
    assert.ok(suggestions.some(s => s.dimension === 'script'));
});

console.log('✅ All growth enhancement tests defined');

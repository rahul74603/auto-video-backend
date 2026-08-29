'use strict';

/**
 * cta_engine.js — Context-Aware CTA Engine
 * 
 * Generates appropriate calls-to-action based on:
 * - Content type (job, admit card, result, etc.)
 * - Content angle (basic alert, FAQ, deadline reminder, etc.)
 * - Urgency level (normal, 7 days left, today, etc.)
 * - Audience intent (informational, action-required, etc.)
 * 
 * CTA categories:
 * 1. Apply Now - For active job postings
 * 2. Download Now - For admit cards
 * 3. Check Result - For results
 * 4. Read More - For detailed information
 * 5. Subscribe - For channel growth
 * 6. Comment Question - For engagement
 * 7. Share - For viral reach
 * 8. Visit Website - For traffic
 * 9. Join Telegram - For community
 * 10. Save for Later - For future reference
 * 
 * Each CTA is:
 * - Contextually relevant
 * - Action-oriented
 * - Not misleading
 * - Appropriate length
 * - Mobile-friendly
 */

const { detectContentIntent, forbidsApplyLanguage } = require('./content_intent');

const CTA_TEMPLATES = {
    'apply_now': {
        templates: [
            'अभी apply करें! Link description में है',
            'Apply now! Link in description',
            '🚀 Apply before last date',
            'Don\'t wait! Apply today',
            'अंतिम तिथि से पहले apply करें',
            'Last chance to apply',
            ' Hurry! Apply now'
        ],
        bestFor: ['JOB'],
        urgency: ['high', 'medium'],
        action: 'click_link'
    },
    
    'download_now': {
        templates: [
            'Admit card download करें! Link description में',
            'Download now! Link in description',
            '📥 Download your admit card',
            'Get your card now',
            'अभी download करें',
            'Download before exam date',
            '🎫 Card download link below'
        ],
        bestFor: ['ADMIT_CARD'],
        urgency: ['high', 'medium'],
        action: 'click_link'
    },
    
    'check_result': {
        templates: [
            'Result check करें! Link description में',
            'Check your result now',
            ' Result declared! Check now',
            'See if you\'re selected',
            'अपना result अभी देखें',
            'Check result on official site',
            '✅ Result link in description'
        ],
        bestFor: ['RESULT'],
        urgency: ['high', 'medium'],
        action: 'click_link'
    },
    
    'read_more': {
        templates: [
            'पूरी जानकारी description में',
            'Full details in description',
            'ℹ️ Read complete information',
            'Check description for details',
            'सारी details नीचे description में',
            'Complete info below',
            '📖 Read more in description'
        ],
        bestFor: ['JOB', 'FAQ', 'EDUCATIONAL'],
        urgency: ['low', 'medium'],
        action: 'read_description'
    },
    
    'subscribe': {
        templates: [
            'Subscribe करें daily updates के लिए',
            'Subscribe for daily job alerts',
            '🔔 Subscribe & hit bell icon',
            'Never miss an update! Subscribe',
            'Daily jobs के लिए subscribe करें',
            'Join our community! Subscribe',
            '📢 Subscribe for more'
        ],
        bestFor: ['ALL'],
        urgency: ['low'],
        action: 'subscribe'
    },
    
    'comment_question': {
        templates: [
            'सवाल हो तो comment में पूछें',
            'Any questions? Comment below',
            '❓ Ask in comments',
            'Comment your doubts',
            'अपना सवाल comment करें',
            'Drop your questions below',
            '💬 We\'ll answer in comments'
        ],
        bestFor: ['FAQ', 'EDUCATIONAL'],
        urgency: ['low'],
        action: 'comment'
    },
    
    'share': {
        templates: [
            'दोस्तों को share करें',
            'Share with friends who need this',
            '📤 Share this video',
            'Help others! Share now',
            'अपने दोस्तों को बताएं',
            'Share if this is useful',
            ' Tag someone who should know'
        ],
        bestFor: ['JOB', 'ADMIT_CARD', 'RESULT'],
        urgency: ['medium', 'high'],
        action: 'share'
    },
    
    'visit_website': {
        templates: [
            'Website visit करें: studygyaan.in',
            'Visit studygyaan.in for more',
            '🌐 Check our website',
            'More jobs on our site',
            'studygyaan.in पर और jobs',
            'Visit for complete information',
            '📱 Website link in description'
        ],
        bestFor: ['ALL'],
        urgency: ['low', 'medium'],
        action: 'visit_site'
    },
    
    'join_telegram': {
        templates: [
            'Telegram join करें: @studygyaan_official',
            'Join Telegram for instant alerts',
            '📲 Telegram channel join करें',
            'Get updates on Telegram',
            'Telegram पर fastest updates',
            'Join our Telegram community',
            '⚡ Telegram link in description'
        ],
        bestFor: ['ALL'],
        urgency: ['low'],
        action: 'join_telegram'
    },
    
    'save_for_later': {
        templates: [
            'Save कर लें future reference के लिए',
            'Save this for later',
            '🔖 Bookmark this video',
            'Save before you forget',
            'बाद में देखने के लिए save करें',
            'Keep this for future',
            '📌 Save for reference'
        ],
        bestFor: ['JOB', 'EDUCATIONAL', 'FAQ'],
        urgency: ['low'],
        action: 'save'
    },
    
    'deadline_urgency': {
        templates: [
            'Last date: {date} - अभी apply करें!',
            'Deadline: {date} - Don\'t miss out!',
            '⏰ Only {days} days left!',
            'Hurry! {days} days remaining',
            'आखिरी तारीख: {date}',
            'Last chance: {date}',
            '🚨 {days} days only!'
        ],
        bestFor: ['JOB'],
        urgency: ['high'],
        action: 'click_link',
        dynamic: true
    },
    
    'eligibility_check': {
        templates: [
            'Check करें आप eligible हैं या नहीं',
            'Verify your eligibility',
            '✅ Check if you qualify',
            'Are you eligible? Check now',
            'अपनी eligibility verify करें',
            'Check qualification criteria',
            '🎓 Eligibility details below'
        ],
        bestFor: ['JOB', 'WHO_CAN_APPLY'],
        urgency: ['medium'],
        action: 'read_description'
    }
};

/**
 * Select appropriate CTA based on context
 */
function selectCTA(options = {}) {
    const {
        contentType,
        contentAngle,
        urgencyLevel,
        audienceIntent,
        previousCTAs = []
    } = options;
    
    // Identify candidate CTAs
    const candidates = [];
    
    for (const [ctaKey, ctaInfo] of Object.entries(CTA_TEMPLATES)) {
        // Check if suitable for content type
        const isTypeMatch = ctaInfo.bestFor.includes('ALL') || 
                           ctaInfo.bestFor.includes(contentType) ||
                           ctaInfo.bestFor.includes(contentAngle);
        
        if (!isTypeMatch) {
            continue;
        }
        
        // Check urgency match
        const isUrgencyMatch = ctaInfo.urgency.includes(urgencyLevel) ||
                              ctaInfo.urgency.includes('low'); // Low urgency CTAs always work
        
        if (!isUrgencyMatch) {
            continue;
        }
        
        // Score the CTA
        let score = 0;

        if (ctaInfo.bestFor.includes(contentType) && contentType !== 'ALL') {
            score += 4;
        }
        
        // Prefer action-oriented CTAs for high urgency
        if (urgencyLevel === 'high' && ctaInfo.action === 'click_link') {
            score += 3;
        }
        
        // Prefer engagement CTAs for educational content
        if (contentAngle === 'FAQ' || contentAngle === 'EDUCATIONAL') {
            if (ctaInfo.action === 'comment' || ctaInfo.action === 'subscribe') {
                score += 2;
            }
        }
        
        // Prefer share CTAs for important updates
        if (urgencyLevel === 'high' && ctaInfo.action === 'share') {
            score += 2;
        }
        
        // Penalize recently used CTAs
        const recentUsage = previousCTAs.slice(-3).filter(c => c === ctaKey).length;
        score -= recentUsage * 2;
        
        candidates.push({
            key: ctaKey,
            ...ctaInfo,
            score
        });
    }
    
    // Sort by score
    candidates.sort((a, b) => b.score - a.score);
    
    // Pick from top 3 (exploration)
    const topCandidates = candidates.slice(0, 3);
    
    if (topCandidates.length === 0) {
        // Fallback to read_more
        return {
            key: 'read_more',
            ...CTA_TEMPLATES['read_more'],
            template: getRandomTemplate(CTA_TEMPLATES['read_more'].templates)
        };
    }
    
    // 🧠 LEARNED POLICY: learned CTA winner (Phase 10). Only CTAs that are
    // already valid candidates for this content can be selected — a learned
    // winner that is unsafe/mismatched for this intent is ignored
    // (never force a misleading CTA onto content).
    const decision = options.policyDecision;
    if (decision && decision.mode && decision.mode !== 'none') {
        const winner = decision.winner != null ? String(decision.winner) : null;
        const pool = candidates.map((c) => c.key);
        if (decision.mode === 'exploit' && winner && pool.includes(winner)) {
            const selected = candidates.find((c) => c.key === winner);
            return {
                key: selected.key,
                ...selected,
                template: getRandomTemplate(selected.templates),
                learningUsed: true,
                learningMode: 'exploit',
                exploration: false,
                learningReason: `learned best CTA (policy ${decision.policyVersion}, confidence ${decision.confidence}, n=${decision.sampleSize})`
            };
        }
        if (decision.mode === 'explore') {
            const alternatives = pool.filter((k) => k !== winner);
            if (alternatives.length > 0) {
                const key = alternatives[Math.floor(Math.random() * alternatives.length)];
                const selected = candidates.find((c) => c.key === key);
                return {
                    key: selected.key,
                    ...selected,
                    template: getRandomTemplate(selected.templates),
                    learningUsed: true,
                    learningMode: 'explore',
                    exploration: true,
                    learningReason: `controlled exploration of CTA (policy ${decision.policyVersion})`
                };
            }
        }
    }

    const selectedIndex = Math.floor(Math.random() * topCandidates.length);
    const selectedCTA = topCandidates[selectedIndex];
    
    // Get a random template
    const template = getRandomTemplate(selectedCTA.templates);
    
    return {
        key: selectedCTA.key,
        ...selectedCTA,
        template
    };
}

/**
 * Get random template from array
 */
function getRandomTemplate(templates) {
    const randomIndex = Math.floor(Math.random() * templates.length);
    return templates[randomIndex];
}

/**
 * Generate CTA text with dynamic values
 */
function generateCTAText(cta, jobData = {}) {
    let text = cta.template;
    
    // Replace dynamic placeholders
    if (cta.dynamic) {
        // Replace date
        if (jobData.lastDate) {
            text = text.replace('{date}', jobData.lastDate);
        }
        
        // Replace days left
        if (jobData.daysLeft !== undefined) {
            text = text.replace('{days}', jobData.daysLeft);
        }
    }
    
    return text;
}

function resolveCtaIntent(options = {}) {
    if (options.jobData) return detectContentIntent(options.jobData);
    return detectContentIntent({
        type: options.contentType,
        category: options.contentType,
        title: options.title
    });
}

function closingKeysForIntent(intent) {
    if (intent === 'RESULT') return ['check_result', 'share', 'visit_website'];
    if (intent === 'ADMIT_CARD') return ['download_now', 'share', 'visit_website'];
    if (intent === 'ANSWER_KEY') return ['check_result', 'read_more', 'share'];
    if (intent === 'SYLLABUS') return ['read_more', 'visit_website', 'share'];
    return ['apply_now', 'download_now', 'check_result', 'share', 'save_for_later'];
}

/**
 * Get CTA for specific position in video
 */
function getPositionalCTA(position, options = {}) {
    const intent = resolveCtaIntent(options);
    const positionPreferences = {
        'opening': ['subscribe', 'join_telegram'],
        'middle': forbidsApplyLanguage(intent)
            ? ['read_more', 'comment_question']
            : ['read_more', 'eligibility_check', 'comment_question'],
        'closing': closingKeysForIntent(intent)
    };
    
    const preferredKeys = positionPreferences[position] || ['read_more'];
    
    // Find matching CTA
    for (const key of preferredKeys) {
        if (key === 'apply_now' && forbidsApplyLanguage(intent)) continue;
        if (CTA_TEMPLATES[key]) {
            const cta = {
                key,
                ...CTA_TEMPLATES[key],
                template: getRandomTemplate(CTA_TEMPLATES[key].templates)
            };
            
            return generateCTAText(cta, options.jobData);
        }
    }
    
    return 'Description check करें';
}

/**
 * Generate multiple CTAs for a video
 */
function pickClosingCTA(options, intent, contentType) {
    if (forbidsApplyLanguage(intent)) {
        const keys = closingKeysForIntent(intent).filter((key) => CTA_TEMPLATES[key]);
        // Learned policy still applies, but only within the intent-safe keys.
        const decision = options.policyDecision;
        if (decision && decision.mode && decision.mode !== 'none') {
            const winner = decision.winner != null ? String(decision.winner) : null;
            if (decision.mode === 'exploit' && winner && keys.includes(winner)) {
                const info = CTA_TEMPLATES[winner];
                return {
                    key: winner,
                    ...info,
                    template: getRandomTemplate(info.templates),
                    learningUsed: true,
                    learningMode: 'exploit',
                    exploration: false,
                    learningReason: `learned best CTA (policy ${decision.policyVersion}, confidence ${decision.confidence}, n=${decision.sampleSize})`
                };
            }
            const alternatives = keys.filter((k) => k !== winner);
            if (decision.mode === 'explore' && alternatives.length > 0) {
                const key = alternatives[Math.floor(Math.random() * alternatives.length)];
                const info = CTA_TEMPLATES[key];
                return {
                    key,
                    ...info,
                    template: getRandomTemplate(info.templates),
                    learningUsed: true,
                    learningMode: 'explore',
                    exploration: true,
                    learningReason: `controlled exploration of CTA (policy ${decision.policyVersion})`
                };
            }
        }
        const key = keys[Math.floor(Math.random() * keys.length)] || 'read_more';
        const info = CTA_TEMPLATES[key];
        return {
            key,
            ...info,
            template: getRandomTemplate(info.templates)
        };
    }
    return selectCTA({
        contentType,
        contentAngle: options.contentAngle,
        urgencyLevel: options.urgencyLevel,
        policyDecision: options.policyDecision
    });
}

function generateVideoCTAs(options = {}) {
    const intent = resolveCtaIntent(options);
    const contentType = forbidsApplyLanguage(intent)
        ? intent
        : (options.contentType || intent || 'JOB');

    return {
        opening: getPositionalCTA('opening', { ...options, contentType }),
        middle: getPositionalCTA('middle', { ...options, contentType }),
        closing: pickClosingCTA(options, intent, contentType)
    };
}

module.exports = {
    CTA_TEMPLATES,
    selectCTA,
    generateCTAText,
    getPositionalCTA,
    generateVideoCTAs,
    getRandomTemplate
};

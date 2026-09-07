'use strict';

/**
 * cost_control_engine.js — Cost Control & Budget Management
 * 
 * Prevents excessive spending on AI services.
 * 
 * Controls:
 * - Daily image generation limit
 * - Per-video image generation limit
 * - Provider timeout
 * - Maximum retry count
 * - Image caching
 * - Duplicate prevention
 * - Fallback enforcement
 * 
 * Budget tiers:
 * 1. Free tier (default)
 * 2. Low-cost tier (optional)
 * 3. Premium tier (optional)
 * 
 * All costs tracked in Firestore.
 */

const COST_LIMITS = {
    'free': {
        dailyImageLimit: 50,
        perVideoImageLimit: 1,
        providerTimeout: 30000,
        maxRetries: 2,
        cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
        enabledProviders: ['pollinations']
    },
    
    'low_cost': {
        dailyImageLimit: 200,
        perVideoImageLimit: 2,
        providerTimeout: 45000,
        maxRetries: 3,
        cacheDuration: 12 * 60 * 60 * 1000, // 12 hours
        enabledProviders: ['pollinations', 'unsplash']
    },
    
    'premium': {
        dailyImageLimit: 1000,
        perVideoImageLimit: 5,
        providerTimeout: 60000,
        maxRetries: 5,
        cacheDuration: 6 * 60 * 60 * 1000, // 6 hours
        enabledProviders: ['pollinations', 'unsplash', 'dalle', 'midjourney']
    }
};

/**
 * Check if image generation is allowed
 */
async function checkImageGenerationAllowed(db, options = {}) {
    const {
        budgetTier = 'free',
        jobId
    } = options;
    
    const limits = COST_LIMITS[budgetTier] || COST_LIMITS['free'];
    
    if (!db) {
        // No DB = allow but with strict limits
        return {
            allowed: true,
            reason: 'No tracking - using conservative limits',
            limits
        };
    }
    
    try {
        // Get today's usage
        const today = new Date().toISOString().split('T')[0];
        const usageDoc = await db.collection('cost_tracking').doc(`images_${today}`).get();
        
        const todayUsage = usageDoc.exists ? usageDoc.data().count || 0 : 0;
        
        // Check daily limit
        if (todayUsage >= limits.dailyImageLimit) {
            return {
                allowed: false,
                reason: `Daily limit reached (${todayUsage}/${limits.dailyImageLimit})`,
                limits,
                currentUsage: todayUsage
            };
        }
        
        // Check per-video limit (if jobId provided)
        if (jobId) {
            const videoUsageDoc = await db.collection('cost_tracking').doc(`video_${jobId}`).get();
            const videoUsage = videoUsageDoc.exists ? videoUsageDoc.data().imageCount || 0 : 0;
            
            if (videoUsage >= limits.perVideoImageLimit) {
                return {
                    allowed: false,
                    reason: `Per-video limit reached (${videoUsage}/${limits.perVideoImageLimit})`,
                    limits,
                    currentUsage: videoUsage
                };
            }
        }
        
        return {
            allowed: true,
            reason: 'Within limits',
            limits,
            currentUsage: todayUsage
        };
        
    } catch (err) {
        console.log(`⚠️ Cost check failed: ${err.message || err}`);
        // Fail-safe: allow with conservative limits
        return {
            allowed: true,
            reason: 'Tracking error - using conservative limits',
            limits: COST_LIMITS['free']
        };
    }
}

/**
 * Log image generation for tracking
 */
async function logImageGeneration(db, options = {}) {
    const {
        jobId,
        provider,
        success,
        cost = 0
    } = options;
    
    if (!db) {
        return;
    }

    // Ensure admin is initialized before using FieldValue sentinels.
    // `admin` is a module-level variable lazily loaded by getAdmin(); calling
    // getAdmin() once here guarantees it is defined for all FieldValue usage
    // below, even on the very first call to logImageGeneration().
    const firebaseAdmin = getAdmin();
    const FieldValue = firebaseAdmin.firestore.FieldValue;

    try {
        const today = new Date().toISOString().split('T')[0];

        // Update daily count
        const dailyRef = db.collection('cost_tracking').doc(`images_${today}`);
        await dailyRef.set({
            count: FieldValue.increment(1),
            date: today,
            lastUpdated: FieldValue.serverTimestamp()
        }, { merge: true });

        // Update per-video count
        if (jobId) {
            const videoRef = db.collection('cost_tracking').doc(`video_${jobId}`);
            await videoRef.set({
                jobId,
                imageCount: FieldValue.increment(1),
                totalCost: FieldValue.increment(cost),
                lastUpdated: FieldValue.serverTimestamp()
            }, { merge: true });
        }

    } catch (err) {
        console.log(`️ Cost logging failed: ${err.message || err}`);
    }
}

/**
 * Check if image is cached
 */
async function checkImageCache(db, imageFingerprint, options = {}) {
    const {
        budgetTier = 'free'
    } = options;
    
    const limits = COST_LIMITS[budgetTier] || COST_LIMITS['free'];
    
    if (!db) {
        return {
            cached: false,
            reason: 'No cache available'
        };
    }
    
    try {
        const cacheDoc = await db.collection('image_cache').doc(imageFingerprint).get();
        
        if (!cacheDoc.exists) {
            return {
                cached: false,
                reason: 'Not in cache'
            };
        }
        
        const cacheData = cacheDoc.data();
        const cacheAge = Date.now() - cacheData.createdAt;
        
        if (cacheAge > limits.cacheDuration) {
            return {
                cached: false,
                reason: 'Cache expired'
            };
        }
        
        return {
            cached: true,
            path: cacheData.path,
            reason: `Cache hit (age: ${Math.round(cacheAge / 1000 / 60)} min)`
        };
        
    } catch (err) {
        console.log(`⚠️ Cache check failed: ${err.message || err}`);
        return {
            cached: false,
            reason: 'Cache error'
        };
    }
}

/**
 * Store image in cache
 */
async function storeImageInCache(db, imageFingerprint, imagePath, options = {}) {
    if (!db || !imageFingerprint || !imagePath) {
        return;
    }
    
    try {
        await db.collection('image_cache').doc(imageFingerprint).set({
            fingerprint: imageFingerprint,
            path: imagePath,
            createdAt: Date.now(),
            provider: options.provider || 'unknown'
        });
    } catch (err) {
        console.log(`⚠️ Cache storage failed: ${err.message || err}`);
    }
}

/**
 * Calculate estimated monthly cost
 */
function estimateMonthlyCost(dailyUsage, budgetTier = 'free') {
    const providerCosts = {
        'pollinations': 0, // Free
        'unsplash': 0, // Free (with attribution)
        'dalle': 0.02, // $0.02 per image
        'midjourney': 0.04 // $0.04 per image (approximate)
    };
    
    const limits = COST_LIMITS[budgetTier] || COST_LIMITS['free'];
    const dailyLimit = limits.dailyImageLimit;
    const actualDaily = Math.min(dailyUsage, dailyLimit);
    
    // Assume 80% pollinations (free), 20% paid
    const freeImages = actualDaily * 0.8;
    const paidImages = actualDaily * 0.2;
    
    const dailyCost = paidImages * providerCosts['dalle'];
    const monthlyCost = dailyCost * 30;
    
    return {
        dailyImages: actualDaily,
        monthlyImages: actualDaily * 30,
        dailyCost: dailyCost.toFixed(4),
        monthlyCost: monthlyCost.toFixed(2),
        budgetTier
    };
}

/**
 * Get cost control summary
 */
async function getCostSummary(db, options = {}) {
    const {
        budgetTier = 'free',
        daysToAnalyze = 7
    } = options;
    
    if (!db) {
        return {
            error: 'No database connection'
        };
    }
    
    try {
        const summary = {
            budgetTier,
            dailyLimit: COST_LIMITS[budgetTier].dailyImageLimit,
            periodDays: daysToAnalyze,
            totalImages: 0,
            totalCost: 0,
            dailyBreakdown: []
        };
        
        // Analyze last N days
        for (let i = 0; i < daysToAnalyze; i++) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split('T')[0];
            
            const usageDoc = await db.collection('cost_tracking').doc(`images_${dateStr}`).get();
            const count = usageDoc.exists ? usageDoc.data().count || 0 : 0;
            
            summary.totalImages += count;
            summary.dailyBreakdown.push({
                date: dateStr,
                count
            });
        }
        
        // Estimate cost
        const avgDaily = summary.totalImages / daysToAnalyze;
        const costEstimate = estimateMonthlyCost(avgDaily, budgetTier);
        
        summary.costEstimate = costEstimate;
        
        return summary;
        
    } catch (err) {
        console.log(`⚠️ Cost summary failed: ${err.message || err}`);
        return {
            error: err.message || 'Unknown error'
        };
    }
}

// Firestore admin (lazy load)
let admin;
function getAdmin() {
    if (!admin) {
        admin = require('firebase-admin');
    }
    return admin;
}

module.exports = {
    COST_LIMITS,
    checkImageGenerationAllowed,
    logImageGeneration,
    checkImageCache,
    storeImageInCache,
    estimateMonthlyCost,
    getCostSummary,
    getAdmin
};

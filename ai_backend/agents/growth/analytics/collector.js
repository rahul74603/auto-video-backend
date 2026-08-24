'use strict';

/**
 * analytics/collector.js — Performance Data Collection (Phase 20)
 * 
 * Collects platform metrics where APIs permit.
 * Never fakes metrics. If an API doesn't expose a metric, stores null.
 * 
 * Firestore collection: content_performance
 */

const flags = require('../feature_flags');

// Platform metric fields we'd like to collect (null if unavailable)
const METRIC_FIELDS = [
    'views', 'likes', 'comments', 'shares', 'saves',
    'watchTime', 'averageViewDuration', 'retention',
    'completionRate', 'rewatchRate', 'clickThroughRate',
    'followersGained'
];

async function collectPlatformMetrics(db, platformPost, opts = {}) {
    if (!flags.isEnabled('ANALYTICS_ENABLED')) {
        return { collected: false, reason: 'analytics disabled' };
    }

    if (!platformPost || !platformPost.platformVideoId) {
        return { collected: false, reason: 'no platform video id' };
    }

    const platform = platformPost.platform;
    const videoId = platformPost.platformVideoId;
    let metrics = {};

    try {
        switch (platform) {
            case 'youtube':
                metrics = await collectYouTube(videoId, opts);
                break;
            case 'facebook':
                metrics = await collectFacebook(videoId, opts);
                break;
            case 'instagram':
                metrics = await collectInstagram(videoId, opts);
                break;
            case 'telegram':
                metrics = await collectTelegram(videoId, opts);
                break;
            default:
                return { collected: false, reason: `unknown platform ${platform}` };
        }
    } catch (err) {
        console.log(`⚠️ analytics collection failed for ${platform}/${videoId}: ${err.message || err}`);
        return { collected: false, error: true, reason: err.message || 'collection failed' };
    }

    // Normalize: fill missing metrics with null (never fake them)
    const normalized = {};
    for (const field of METRIC_FIELDS) {
        normalized[field] = metrics[field] !== undefined ? metrics[field] : null;
    }
    normalized.platform = platform;
    normalized.platformVideoId = videoId;
    normalized.contentId = platformPost.contentId || '';
    normalized.collectedAt = Date.now();
    normalized.publishedAt = platformPost.publishedAt || null;

    // Store in Firestore
    if (db) {
        try {
            const docId = `${platform}_${videoId}`;
            await db.collection('content_performance').doc(docId).set(normalized, { merge: true });
        } catch (err) {
            console.log(`⚠️ analytics store failed: ${err.message || err}`);
        }
    }

    return { collected: true, metrics: normalized };
}

async function collectYouTube(videoId, opts = {}) {
    // YouTube Data API v3 — videos.list costs 1 unit
    // Requires OAuth token with youtube.readonly scope
    const tokenJson = process.env.YOUTUBE_TOKEN;
    if (!tokenJson) return {};

    try {
        const { google } = require('googleapis');
        const creds = JSON.parse(process.env.GMAIL_CREDENTIALS || '{}');
        const token = JSON.parse(tokenJson);
        const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
        const oauth = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
        oauth.setCredentials(token);
        const youtube = google.youtube({ version: 'v3', auth: oauth });

        const res = await youtube.videos.list({
            part: 'statistics,contentDetails',
            id: videoId
        });

        const item = res.data.items?.[0];
        if (!item) return {};

        const stats = item.statistics || {};
        const contentDetails = item.contentDetails || {};
        
        const result = {
            views: parseInt(stats.viewCount) || null,
            likes: parseInt(stats.likeCount) || null,
            comments: parseInt(stats.commentCount) || null,
            duration: contentDetails.duration || null  // ISO 8601 duration
        };

        // Try YouTube Analytics API for deeper metrics (requires yt-analytics.readonly scope)
        try {
            const ytAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth });
            const today = new Date().toISOString().split('T')[0];
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const analyticsRes = await ytAnalytics.reports.query({
                ids: 'channel==MINE',
                startDate: thirtyDaysAgo,
                endDate: today,
                metrics: 'views,watchTimeMinutes,averageViewDuration,averageViewPercentage,subscribersGained',
                filters: `video==${videoId}`,
                maxResults: 1
            });

            if (analyticsRes.data.rows && analyticsRes.data.rows.length > 0) {
                const row = analyticsRes.data.rows[0];
                result.watchTimeMinutes = row[1] || null;
                result.averageViewDuration = row[2] || null;
                result.averageViewPercentage = row[3] || null;
                result.subscribersGained = row[4] || null;
            }
        } catch (analyticsErr) {
            // YouTube Analytics API not available (scope issue or API not enabled)
            // Continue with Data API metrics only
            console.log(`️ YouTube Analytics API skipped: ${(analyticsErr.message || '').substring(0, 80)}`);
        }

        return result;
    } catch (err) {
        console.log(`⚠️ YouTube analytics failed: ${(err.message || '').substring(0, 100)}`);
        return {};
    }
}

async function collectFacebook(videoId, opts = {}) {
    const token = process.env.FB_PAGE_TOKEN;
    if (!token || !videoId) return {};
    
    try {
        const axios = require('axios');
        const res = await axios.get(
            `https://graph.facebook.com/v19.0/${videoId}?fields=views,likes,comments,shares`,
            { params: { access_token: token }, timeout: 10000 }
        );
        const data = res.data || {};
        return {
            views: data.views || null,
            likes: data.likes || null,
            comments: data.comments || null,
            shares: data.shares || null
        };
    } catch {
        return {};
    }
}

async function collectInstagram(videoId, opts = {}) {
    // Instagram Graph API requires Facebook page + IG account linked
    const token = process.env.FB_PAGE_TOKEN;
    if (!token || !videoId) return {};
    
    try {
        const axios = require('axios');
        const res = await axios.get(
            `https://graph.facebook.com/v19.0/${videoId}?fields=like_count,comments_count,share_count,play_count`,
            { params: { access_token: token }, timeout: 10000 }
        );
        const data = res.data || {};
        return {
            views: data.play_count || null,
            likes: data.like_count || null,
            comments: data.comments_count || null,
            shares: data.share_count || null
        };
    } catch {
        return {};
    }
}

async function collectTelegram(videoId, opts = {}) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return {};
    // Telegram Bot API doesn't expose view counts for channel posts easily
    // This is a placeholder for future implementation
    return {};
}

module.exports = {
    METRIC_FIELDS,
    collectPlatformMetrics,
    collectYouTube,
    collectFacebook,
    collectInstagram,
    collectTelegram
};

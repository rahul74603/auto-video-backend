'use strict';

/**
 * logger.js — Structured observability (Phase 35)
 * Every video gets a runId. Every stage gets a log entry.
 * Secrets are never logged. Structured JSON output for parsing.
 */

function sanitize(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const safe = {};
    for (const [k, v] of Object.entries(obj)) {
        const kl = k.toLowerCase();
        if (kl.includes('token') || kl.includes('password') || kl.includes('secret') || kl.includes('key') || kl.includes('credential')) {
            safe[k] = '[REDACTED]';
        } else if (typeof v === 'string' && v.length > 500) {
            safe[k] = v.substring(0, 500) + '...[truncated]';
        } else {
            safe[k] = v;
        }
    }
    return safe;
}

function logStructured(level, event, data = {}) {
    const entry = {
        ts: new Date().toISOString(),
        level,
        event,
        ...sanitize(data)
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

function createRunLogger(runId) {
    return {
        stage(stage, data = {}) {
            logStructured('info', 'stage', { runId, stage, ...data });
        },
        error(stage, err, data = {}) {
            const msg = err && err.message ? err.message : String(err);
            logStructured('error', 'error', { runId, stage, error: msg.substring(0, 300), ...data });
        },
        metric(name, value, data = {}) {
            logStructured('info', 'metric', { runId, metric: name, value, ...data });
        },
        summary(data = {}) {
            logStructured('info', 'summary', { runId, ...data });
        }
    };
}

module.exports = {
    logStructured,
    createRunLogger,
    sanitize
};

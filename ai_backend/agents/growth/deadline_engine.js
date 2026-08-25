'use strict';

const { normalizeDate } = require('./date_normalizer');

/**
 * deadline_engine.js — Deadline Intelligence Engine
 * 
 * Tracks application deadlines and creates meaningful urgency states.
 * 
 * Urgency states:
 * - OPEN: Application just started
 * - NORMAL: Application open, no urgency
 * - UPCOMING_DEADLINE: Deadline approaching (>14 days)
 * - 7_DAYS_LEFT: 7 days remaining
 * - 3_DAYS_LEFT: 3 days remaining
 * - 2_DAYS_LEFT: 2 days remaining
 * - TOMORROW: Last date is tomorrow
 * - TODAY: Last date is today
 * - CLOSED: Application closed
 * 
 * Safety rules:
 * - Never create fake urgency
 * - Always use verified dates from source data
 * - Stop generating reminders after deadline
 * - Meaningful content change between reminders (not repetitive)
 * - Maximum 3 reminder videos per job
 */

/**
 * Calculate deadline urgency state
 */
function calculateUrgency(lastDateStr, currentDate = new Date()) {
    if (!lastDateStr) {
        return {
            state: 'UNKNOWN',
            daysLeft: null,
            message: null,
            shouldRemind: false
        };
    }
    
    // Normalize date from various Indian formats to ISO (YYYY-MM-DD)
    const normalizedDate = normalizeDate(lastDateStr);
    
    if (!normalizedDate) {
        return {
            state: 'UNKNOWN',
            daysLeft: null,
            message: null,
            shouldRemind: false
        };
    }
    
    const lastDate = new Date(normalizedDate);
    
    if (isNaN(lastDate.getTime())) {
        return {
            state: 'UNKNOWN',
            daysLeft: null,
            message: null,
            shouldRemind: false
        };
    }
    
    // Normalize to start of day
    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);
    
    const lastDay = new Date(lastDate);
    lastDay.setHours(0, 0, 0, 0);
    
    const diffTime = lastDay - today;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Determine state
    let state;
    let message;
    let shouldRemind = false;
    let urgencyLevel = 0; // 0-10 scale
    
    if (daysLeft < 0) {
        state = 'CLOSED';
        message = 'Application Closed';
        shouldRemind = false;
        urgencyLevel = 0;
    } else if (daysLeft === 0) {
        state = 'TODAY';
        message = 'Last Date Today!';
        shouldRemind = true;
        urgencyLevel = 10;
    } else if (daysLeft === 1) {
        state = 'TOMORROW';
        message = 'Last Date Tomorrow!';
        shouldRemind = true;
        urgencyLevel = 9;
    } else if (daysLeft === 2) {
        state = '2_DAYS_LEFT';
        message = 'Only 2 Days Left!';
        shouldRemind = true;
        urgencyLevel = 8;
    } else if (daysLeft === 3) {
        state = '3_DAYS_LEFT';
        message = '3 Days Remaining';
        shouldRemind = true;
        urgencyLevel = 7;
    } else if (daysLeft <= 7) {
        state = '7_DAYS_LEFT';
        message = `${daysLeft} Days Left`;
        shouldRemind = true;
        urgencyLevel = 6;
    } else if (daysLeft <= 14) {
        state = 'UPCOMING_DEADLINE';
        message = 'Deadline Approaching';
        shouldRemind = true;
        urgencyLevel = 4;
    } else if (daysLeft <= 30) {
        state = 'NORMAL';
        message = 'Application Open';
        shouldRemind = false;
        urgencyLevel = 2;
    } else {
        state = 'OPEN';
        message = 'Application Started';
        shouldRemind = false;
        urgencyLevel = 1;
    }
    
    return {
        state,
        daysLeft,
        message,
        shouldRemind,
        urgencyLevel,
        lastDate: lastDateStr
    };
}

/**
 * Determine if a reminder video should be created
 * 
 * Rules:
 * - Max 3 reminders per job
 * - Meaningful time gap between reminders
 * - Different content angle each time
 */
function shouldCreateReminder(jobData, previousReminders = []) {
    const urgency = calculateUrgency(jobData.lastDate);
    
    // Don't remind if application is closed
    if (urgency.state === 'CLOSED') {
        return {
            shouldCreate: false,
            reason: 'Application closed'
        };
    }
    
    // Don't remind if no deadline
    if (!urgency.shouldRemind) {
        return {
            shouldCreate: false,
            reason: 'No urgency'
        };
    }
    
    // Check reminder count
    if (previousReminders.length >= 3) {
        return {
            shouldCreate: false,
            reason: 'Max reminders reached'
        };
    }
    
    // Check minimum gap between reminders (7 days)
    if (previousReminders.length > 0) {
        const lastReminder = previousReminders[previousReminders.length - 1];
        const lastReminderDate = new Date(lastReminder.date);
        const today = new Date();
        const daysSinceLastReminder = Math.ceil((today - lastReminderDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceLastReminder < 7) {
            return {
                shouldCreate: false,
                reason: `Too soon after last reminder (${daysSinceLastReminder} days)`
            };
        }
    }
    
    // Determine content angle for this reminder
    const angle = getReminderAngle(urgency.state, previousReminders.length);
    
    return {
        shouldCreate: true,
        urgency,
        angle,
        reminderNumber: previousReminders.length + 1
    };
}

/**
 * Get appropriate content angle for reminder
 */
function getReminderAngle(urgencyState, reminderCount) {
    const angles = {
        'TODAY': [
            'last_chance',
            'final_hours',
            'dont_miss'
        ],
        'TOMORROW': [
            'last_call',
            'final_reminder',
            'prepare_documents'
        ],
        '2_DAYS_LEFT': [
            'quick_apply',
            'documents_ready',
            'time_running_out'
        ],
        '3_DAYS_LEFT': [
            'apply_now',
            'check_eligibility',
            'process_overview'
        ],
        '7_DAYS_LEFT': [
            'week_remaining',
            'apply_this_week',
            'what_you_need'
        ],
        'UPCOMING_DEADLINE': [
            'deadline_approaching',
            'dont_procrastinate',
            'start_process'
        ]
    };
    
    const stateAngles = angles[urgencyState] || ['general_reminder'];
    
    // Rotate through angles based on reminder count
    const angleIndex = reminderCount % stateAngles.length;
    
    return stateAngles[angleIndex];
}

/**
 * Generate deadline-focused hook
 */
function generateDeadlineHook(urgency, jobData) {
    const hooks = {
        'TODAY': [
            `आज आखिरी दिन! ${jobData.organization} भर्ती के लिए अभी apply करें`,
            `Last Date Today! ${jobData.vacancies || ''} पदों का मौका`,
            ` TODAY is the LAST DAY to apply!`
        ],
        'TOMORROW': [
            `कल आखिरी दिन! ${jobData.organization} भर्ती`,
            `Tomorrow is the Last Date! Don't miss ${jobData.vacancies || ''} vacancies`,
            `⏰ Last chance tomorrow!`
        ],
        '2_DAYS_LEFT': [
            `सिर्फ 2 दिन बाकी! ${jobData.organization} apply करें`,
            `Only 2 days remaining for ${jobData.vacancies || ''} posts`,
            `⚠️ 2 Days Left!`
        ],
        '3_DAYS_LEFT': [
            `3 दिन में बंद होगी ${jobData.organization} भर्ती`,
            `3 days left to apply!`,
            ` Tick tock! 3 Days Remaining`
        ],
        '7_DAYS_LEFT': [
            `1 हफ्ता बाकी! ${jobData.organization} के लिए apply करें`,
            `7 days left for ${jobData.vacancies || ''} vacancies`,
            `📅 One Week Remaining!`
        ],
        'UPCOMING_DEADLINE': [
            `जल्दी apply करें! ${jobData.organization} भर्ती`,
            `Deadline approaching for ${jobData.organization}`,
            `🔔 Don't wait!`
        ]
    };
    
    const stateHooks = hooks[urgency.state] || hooks['UPCOMING_DEADLINE'];
    const randomIndex = Math.floor(Math.random() * stateHooks.length);
    
    return stateHooks[randomIndex];
}

/**
 * Check if job is still accepting applications
 */
function isActiveJob(jobData) {
    if (!jobData.lastDate) {
        return true; // No deadline = always active
    }
    
    const urgency = calculateUrgency(jobData.lastDate);
    return urgency.state !== 'CLOSED';
}

/**
 * Get days until deadline (human readable)
 */
function getDaysUntilDeadline(lastDateStr) {
    const urgency = calculateUrgency(lastDateStr);
    
    if (urgency.daysLeft === null) {
        return 'Unknown';
    }
    
    if (urgency.daysLeft < 0) {
        return `Closed ${Math.abs(urgency.daysLeft)} days ago`;
    }
    
    if (urgency.daysLeft === 0) {
        return 'Today';
    }
    
    if (urgency.daysLeft === 1) {
        return 'Tomorrow';
    }
    
    return `${urgency.daysLeft} days`;
}

module.exports = {
    calculateUrgency,
    shouldCreateReminder,
    getReminderAngle,
    generateDeadlineHook,
    isActiveJob,
    getDaysUntilDeadline
};

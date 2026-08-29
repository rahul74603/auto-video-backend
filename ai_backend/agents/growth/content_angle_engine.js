'use strict';

/**
 * content_angle_engine.js — Content Angle Selection Engine
 * 
 * Determines the angle/perspective for each video to avoid repetition.
 * 
 * Supported angles:
 * 1. Basic Job Alert - Standard announcement
 * 2. Who Can Apply? - Eligibility focused
 * 3. Eligibility Deep Dive - Detailed qualification
 * 4. Age Limit Focus - Age criteria
 * 5. Salary Focus - Pay details
 * 6. Selection Process - How selection works
 * 7. Application Process - How to apply
 * 8. Important Dates - Timeline
 * 9. Last Date Reminder - Urgency
 * 10. Documents Required - What to prepare
 * 11. Exam Pattern - Test structure
 * 12. Vacancy Breakdown - Post distribution
 * 13. Admit Card Update - Card release
 * 14. Result Update - Result announcement
 * 15. FAQ - Frequently asked question
 * 16. Common Mistake - What to avoid
 * 17. Quick Explanation - Brief overview
 * 
 * Angle selection based on:
 * - Job data availability
 * - Previous angle usage (prevent fatigue)
 * - Performance data (what works)
 * - Content type (breaking vs normal)
 * - Deadline urgency
 */

const { detectContentIntent, forbidsApplyLanguage } = require('./content_intent');

const ANGLE_DEFINITIONS = {
    'basic_alert': {
        name: 'Basic Job Alert',
        description: 'Standard job announcement',
        requiredData: ['title', 'organization'],
        priority: 5,
        bestFor: ['JOB'],
        hookStyle: 'announcement'
    },
    
    'who_can_apply': {
        name: 'Who Can Apply?',
        description: 'Eligibility focused content',
        requiredData: ['eligibility', 'qualification'],
        priority: 8,
        bestFor: ['JOB'],
        hookStyle: 'question'
    },
    
    'eligibility_deep': {
        name: 'Eligibility Deep Dive',
        description: 'Detailed qualification criteria',
        requiredData: ['qualification', 'eligibility'],
        priority: 7,
        bestFor: ['JOB', 'UPSC'],
        hookStyle: 'educational'
    },
    
    'age_limit': {
        name: 'Age Limit Focus',
        description: 'Age criteria explained',
        requiredData: ['ageLimit'],
        priority: 8,
        bestFor: ['JOB'],
        hookStyle: 'question'
    },
    
    'salary_focus': {
        name: 'Salary Focus',
        description: 'Pay details highlighted',
        requiredData: ['salary'],
        priority: 7,
        bestFor: ['JOB'],
        hookStyle: 'benefit'
    },
    
    'selection_process': {
        name: 'Selection Process',
        description: 'How selection works',
        requiredData: ['selectionProcess'],
        priority: 6,
        bestFor: ['JOB', 'UPSC', 'DEFENCE'],
        hookStyle: 'educational'
    },
    
    'application_process': {
        name: 'Application Process',
        description: 'How to apply step by step',
        requiredData: ['applyUrl'],
        priority: 7,
        bestFor: ['JOB'],
        hookStyle: 'instructional'
    },
    
    'important_dates': {
        name: 'Important Dates',
        description: 'Timeline of key dates',
        requiredData: ['startDate', 'lastDate'],
        priority: 6,
        bestFor: ['JOB'],
        hookStyle: 'informational'
    },
    
    'last_date_reminder': {
        name: 'Last Date Reminder',
        description: 'Deadline urgency',
        requiredData: ['lastDate'],
        priority: 9,
        bestFor: ['JOB'],
        hookStyle: 'urgency'
    },
    
    'documents_required': {
        name: 'Documents Required',
        description: 'What documents to prepare',
        requiredData: ['documentsRequired'],
        priority: 6,
        bestFor: ['JOB', 'ADMIT_CARD'],
        hookStyle: 'instructional'
    },
    
    'exam_pattern': {
        name: 'Exam Pattern',
        description: 'Test structure explained',
        requiredData: ['examPattern'],
        priority: 6,
        bestFor: ['JOB', 'UPSC', 'SSC', 'RAILWAY'],
        hookStyle: 'educational'
    },
    
    'vacancy_breakdown': {
        name: 'Vacancy Breakdown',
        description: 'Post distribution details',
        requiredData: ['vacancies', 'category'],
        priority: 7,
        bestFor: ['JOB'],
        hookStyle: 'informational'
    },
    
    'admit_card_update': {
        name: 'Admit Card Update',
        description: 'Card release announcement',
        requiredData: ['title'],
        priority: 9,
        bestFor: ['ADMIT_CARD'],
        hookStyle: 'breaking'
    },
    
    'result_update': {
        name: 'Result Update',
        description: 'Result announcement',
        requiredData: ['title'],
        priority: 10,
        bestFor: ['RESULT'],
        hookStyle: 'breaking'
    },

    'result_check': {
        name: 'Result Check',
        description: 'How to check the result',
        requiredData: ['title'],
        priority: 10,
        bestFor: ['RESULT'],
        hookStyle: 'instructional'
    },

    'official_result': {
        name: 'Official Result',
        description: 'Official result announcement',
        requiredData: ['title'],
        priority: 9,
        bestFor: ['RESULT'],
        hookStyle: 'breaking'
    },

    'scorecard': {
        name: 'Scorecard',
        description: 'Scorecard / marksheet check',
        requiredData: ['title'],
        priority: 8,
        bestFor: ['RESULT'],
        hookStyle: 'informational'
    },

    'merit_list': {
        name: 'Merit List',
        description: 'Merit / selection list',
        requiredData: ['title'],
        priority: 8,
        bestFor: ['RESULT'],
        hookStyle: 'informational'
    },

    'selection': {
        name: 'Selection List',
        description: 'Selection status',
        requiredData: ['title'],
        priority: 7,
        bestFor: ['RESULT'],
        hookStyle: 'informational'
    },

    'cutoff': {
        name: 'Cutoff',
        description: 'Cutoff marks',
        requiredData: ['title'],
        priority: 7,
        bestFor: ['RESULT'],
        hookStyle: 'informational'
    },

    'common_result_mistake': {
        name: 'Common Result Mistake',
        description: 'Mistakes while checking result',
        requiredData: ['title'],
        priority: 4,
        bestFor: ['RESULT'],
        hookStyle: 'warning'
    },

    'answer_key_update': {
        name: 'Answer Key Update',
        description: 'Answer key / objection window',
        requiredData: ['title'],
        priority: 10,
        bestFor: ['ANSWER_KEY'],
        hookStyle: 'breaking'
    },

    'syllabus_update': {
        name: 'Syllabus Update',
        description: 'Syllabus / exam pattern',
        requiredData: ['title'],
        priority: 9,
        bestFor: ['SYLLABUS'],
        hookStyle: 'informational'
    },
    
    'faq': {
        name: 'FAQ',
        description: 'Frequently asked question',
        requiredData: ['title'],
        priority: 7,
        bestFor: ['JOB', 'FAQ'],
        hookStyle: 'question'
    },
    
    'common_mistake': {
        name: 'Common Mistake',
        description: 'What to avoid',
        requiredData: ['title'],
        priority: 6,
        bestFor: ['JOB', 'EDUCATIONAL'],
        hookStyle: 'warning'
    },
    
    'quick_explanation': {
        name: 'Quick Explanation',
        description: 'Brief overview',
        requiredData: ['title'],
        priority: 5,
        bestFor: ['JOB', 'FAST_TRACK'],
        hookStyle: 'summary'
    }
};

/**
 * Identify available angles for a job
 */
function identifyAvailableAngles(jobData) {
    const availableAngles = [];
    const intent = detectContentIntent(jobData);
    const titleText = String(jobData.title || jobData.topic || '').toLowerCase();
    
    for (const [angleKey, angleInfo] of Object.entries(ANGLE_DEFINITIONS)) {
        // Check if all required data is available
        const hasAllData = angleInfo.requiredData.every(field => 
            jobData[field] !== undefined && 
            jobData[field] !== null && 
            jobData[field] !== ''
        );
        
        if (!hasAllData) continue;

        if (forbidsApplyLanguage(intent)) {
            if (!angleInfo.bestFor.includes(intent) && !angleInfo.bestFor.includes('ALL')) {
                continue;
            }
        } else {
            const exclusive = ['RESULT', 'ADMIT_CARD', 'ANSWER_KEY', 'SYLLABUS'];
            if (angleInfo.bestFor.length && angleInfo.bestFor.every((b) => exclusive.includes(b))) {
                continue;
            }
        }

        // Result announcements must not fall to "common mistake" copy unless
        // the content is actually about a mistake.
        if (angleKey === 'common_result_mistake' && !/mistake|error|गलती|wrong/.test(titleText)) {
            continue;
        }
        
        availableAngles.push({
            key: angleKey,
            ...angleInfo
        });
    }
    
    // Sort by priority (descending)
    availableAngles.sort((a, b) => b.priority - a.priority);
    
    return availableAngles;
}

/**
 * Select best angle based on history and performance
 */
function selectBestAngle(jobData, recentAngles = [], performanceData = null, opts = {}) {
    const availableAngles = identifyAvailableAngles(jobData);
    
    if (availableAngles.length === 0) {
        const intent = detectContentIntent(jobData);
        if (intent === 'RESULT') {
            return { key: 'result_update', ...ANGLE_DEFINITIONS.result_update };
        }
        if (intent === 'ADMIT_CARD') {
            return { key: 'admit_card_update', ...ANGLE_DEFINITIONS.admit_card_update };
        }
        if (intent === 'ANSWER_KEY') {
            return { key: 'answer_key_update', ...ANGLE_DEFINITIONS.answer_key_update };
        }
        if (intent === 'SYLLABUS') {
            return { key: 'syllabus_update', ...ANGLE_DEFINITIONS.syllabus_update };
        }
        return {
            key: 'basic_alert',
            ...ANGLE_DEFINITIONS['basic_alert']
        };
    }
    
    // 🧠 LEARNED POLICY: learned content-angle winner (Phase 11). The winner
    // must be an angle this content actually supports; otherwise the policy
    // is ignored and the safe freshness/priority logic runs.
    const decision = opts.policyDecision;
    if (decision && decision.mode && decision.mode !== 'none') {
        const winner = decision.winner != null ? String(decision.winner) : null;
        if (decision.mode === 'exploit' && winner) {
            const learned = availableAngles.find(a => a.key === winner);
            if (learned) {
                return {
                    ...learned,
                    learningUsed: true,
                    learningMode: 'exploit',
                    exploration: false,
                    learningReason: `learned best angle (policy ${decision.policyVersion}, confidence ${decision.confidence}, n=${decision.sampleSize})`
                };
            }
        }
        if (decision.mode === 'explore') {
            const alternatives = availableAngles.filter(a => a.key !== winner);
            if (alternatives.length > 0) {
                const pick = alternatives[Math.floor(Math.random() * alternatives.length)];
                return {
                    ...pick,
                    learningUsed: true,
                    learningMode: 'explore',
                    exploration: true,
                    learningReason: `controlled exploration of angle (policy ${decision.policyVersion})`
                };
            }
        }
    }

    // Prevent fatigue: avoid recently used angles
    const recentKeys = recentAngles.slice(-10); // Last 10 angles
    const freshAngles = availableAngles.filter(a => !recentKeys.includes(a.key));
    
    const candidatePool = freshAngles.length > 0 ? freshAngles : availableAngles;
    
    // If we have performance data, weight by performance
    if (performanceData && performanceData.length > 0) {
        const anglePerformance = {};
        
        performanceData.forEach(p => {
            const angle = p.contentAngle || 'basic_alert';
            if (!anglePerformance[angle]) {
                anglePerformance[angle] = { total: 0, count: 0 };
            }
            anglePerformance[angle].total += p.performanceScore || 0;
            anglePerformance[angle].count += 1;
        });
        
        // Score each candidate
        candidatePool.forEach(angle => {
            const perf = anglePerformance[angle.key];
            if (perf && perf.count >= 3) { // Minimum sample size
                angle.score = (perf.total / perf.count) * 0.4; // 40% weight to performance
            } else {
                angle.score = angle.priority * 0.5; // Default based on priority
            }
        });
        
        // Sort by score and pick from top candidates
        candidatePool.sort((a, b) => b.score - a.score);
        const topCandidates = candidatePool.slice(0, 5);
        
        // Random selection from top 5 (exploration)
        const selectedIndex = Math.floor(Math.random() * topCandidates.length);
        return topCandidates[selectedIndex];
    }
    
    // Random selection weighted by priority
    const totalPriority = candidatePool.reduce((sum, a) => sum + a.priority, 0);
    let randomValue = Math.random() * totalPriority;
    
    for (const angle of candidatePool) {
        randomValue -= angle.priority;
        if (randomValue <= 0) {
            return angle;
        }
    }
    
    return candidatePool[0];
}

/**
 * Generate angle-specific hook
 */
function generateAngleHook(angle, jobData) {
    const hooks = {
        'basic_alert': [
            `${jobData.organization} में ${jobData.vacancies || ''} पदों पर भर्ती`,
            `${jobData.organization} Recruitment ${jobData.vacancies || ''} Vacancies`,
            `📢 New Job Alert!`
        ],
        
        'who_can_apply': [
            `कौन apply कर सकता है ${jobData.organization} में?`,
            `Who can apply for ${jobData.organization}?`,
            `👤 Eligibility Criteria Explained`
        ],
        
        'age_limit': [
            `${jobData.organization} की age limit क्या है?`,
            `Age limit for ${jobData.organization}`,
            `👤 Age Criteria Revealed`
        ],
        
        'salary_focus': [
            `${jobData.organization} में salary कितनी है?`,
            `Salary in ${jobData.organization}`,
            ` Pay Scale Details`
        ],
        
        'last_date_reminder': [
            `जल्दी apply करें! ${jobData.organization} last date`,
            `Last date approaching for ${jobData.organization}`,
            `⏰ Don't Miss the Deadline!`
        ],
        
        'vacancy_breakdown': [
            `${jobData.organization} में कितनी vacancies हैं?`,
            `Total vacancies in ${jobData.organization}`,
            `📊 Vacancy Details`
        ],
        
        'admit_card_update': [
            `${jobData.organization} admit card जारी!`,
            `Admit Card Out for ${jobData.organization}`,
            `🎫 Download Now!`
        ],
        
        'result_update': [
            `${jobData.organization || jobData.title || 'Result'} result जारी!`,
            `Result Declared for ${jobData.organization || jobData.title || 'exam'}`,
            ` Check Your Result!`
        ],
        'result_check': [
            `${jobData.title || 'Result'} कैसे चेक करें?`,
            `Check result: ${jobData.title || ''}`,
            ` Result check करें`
        ],
        'official_result': [
            `${jobData.title || 'Official Result'} जारी`,
            `Official result: ${jobData.organization || jobData.title || ''}`,
            ` Official Result Out`
        ],
        'scorecard': [
            `${jobData.title || 'Result'} का scorecard देखें`,
            `Scorecard out: ${jobData.organization || ''}`,
            ` Scorecard Check`
        ],
        'merit_list': [
            `${jobData.title || 'Result'} merit list जारी`,
            `Merit list: ${jobData.organization || ''}`,
            ` Merit List Out`
        ],
        'selection': [
            `${jobData.title || 'Result'} selection list`,
            `Selection list: ${jobData.organization || ''}`,
            ` Selection List`
        ],
        'cutoff': [
            `${jobData.title || 'Result'} की cutoff क्या रही?`,
            `Cutoff: ${jobData.organization || ''}`,
            ` Cutoff Marks`
        ],
        'common_result_mistake': [
            `${jobData.title || 'Result'} चेक करते समय ये गलती मत करना`,
            `Common mistakes while checking ${jobData.title || 'result'}`,
            ` Result check mistakes`
        ],
        'answer_key_update': [
            `${jobData.organization || jobData.title || 'Answer Key'} answer key जारी!`,
            `Answer Key Out for ${jobData.organization || jobData.title || ''}`,
            ` Check Answer Key`
        ],
        'syllabus_update': [
            `${jobData.organization || jobData.title || 'Syllabus'} syllabus जारी`,
            `Syllabus update: ${jobData.organization || jobData.title || ''}`,
            ` New Syllabus`
        ],
        
        'faq': [
            `${jobData.organization} के बारे में अक्सर पूछे जाने वाले सवाल`,
            `FAQ: ${jobData.organization}`,
            `❓ Common Questions Answered`
        ],
        
        'exam_pattern': [
            `${jobData.organization} exam का pattern क्या है?`,
            `Exam pattern for ${jobData.organization}`,
            ` Exam Structure Explained`
        ],
        
        'application_process': [
            `${jobData.organization} में apply कैसे करें?`,
            `How to apply for ${jobData.organization}?`,
            `📝 Step by Step Guide`
        ],
        
        'documents_required': [
            `${jobData.organization} के लिए कौन से documents चाहिए?`,
            `Documents required for ${jobData.organization}`,
            `📄 What You Need`
        ],
        
        'selection_process': [
            `${jobData.organization} selection process क्या है?`,
            `Selection process for ${jobData.organization}`,
            `✅ How Selection Works`
        ],
        
        'important_dates': [
            `${jobData.organization} की important dates`,
            `Important dates for ${jobData.organization}`,
            `📅 Mark Your Calendar`
        ],
        
        'eligibility_deep': [
            `${jobData.organization} eligibility detailed explanation`,
            `Complete eligibility for ${jobData.organization}`,
            `🎓 Who Is Eligible?`
        ],
        
        'common_mistake': [
            `${jobData.organization} application में ये गलती मत करना`,
            `Common mistakes in ${jobData.organization} application`,
            `️ Avoid These Errors`
        ],
        
        'quick_explanation': [
            `${jobData.organization} भर्ती quick overview`,
            `Quick overview: ${jobData.organization}`,
            `⚡ Fast Facts`
        ]
    };
    
    const angleHooks = hooks[angle.key] || hooks['basic_alert'];
    const randomIndex = Math.floor(Math.random() * angleHooks.length);
    
    return angleHooks[randomIndex];
}

/**
 * Generate angle-specific script
 */
function generateAngleScript(angle, jobData) {
    const scripts = {
        'basic_alert': `${jobData.organization} में ${jobData.vacancies || ''} पदों पर भर्ती निकली है। Last date ${jobData.lastDate || 'check karein'}। Apply करने के लिए description में link है।`,
        
        'who_can_apply': `${jobData.eligibility || jobData.qualification || 'eligible'} candidates ${jobData.organization} में apply कर सकते हैं। Details description में हैं।`,
        
        'age_limit': `Age limit ${jobData.ageLimit || 'check karein'} hai. Is age ke candidates ${jobData.organization} ke liye eligible hain.`,
        
        'salary_focus': `Salary ${jobData.salary || 'details description mein'} hai. ${jobData.organization} mein ye pay scale milega.`,
        
        'last_date_reminder': `Last date ${jobData.lastDate || 'jaldi karein'} hai. ${jobData.organization} mein apply karne ke liye abhi action lein.`,
        
        'vacancy_breakdown': `Total ${jobData.vacancies || ''} vacancies hain ${jobData.organization} mein. Category-wise breakdown description mein hai.`,
        
        'admit_card_update': `${jobData.organization} ka admit card jari ho gaya hai. Download karne ke liye description mein link hai.`,
        
        'result_update': `${jobData.organization || jobData.title || 'Result'} ka result declare ho gaya hai. Check karne ke liye description mein link hai.`,
        'result_check': `${jobData.title || 'Result'} ka result abhi check karein. Scorecard aur merit list description mein hain.`,
        'official_result': `${jobData.title || 'Official result'} officially declare ho gaya hai. Official result description mein check karein.`,
        'scorecard': `${jobData.title || 'Result'} ka scorecard check karein. Marks description mein available hain.`,
        'merit_list': `${jobData.title || 'Result'} ki merit list aa gayi hai. Apna naam list mein check karein.`,
        'selection': `${jobData.title || 'Result'} ki selection list declare ho gayi hai. Selection status description mein hai.`,
        'cutoff': `${jobData.title || 'Result'} ki cutoff check karein. Details description mein hain.`,
        'common_result_mistake': `${jobData.title || 'Result'} check karte waqt ye common mistakes avoid karein. Details description mein hain.`,
        'answer_key_update': `${jobData.organization || jobData.title || 'Answer Key'} ki answer key jari ho gayi hai. Answers milayein aur objection window check karein.`,
        'syllabus_update': `${jobData.organization || jobData.title || 'Syllabus'} ka syllabus update ho gaya hai. Exam pattern description mein hai.`,
        
        'faq': `Aapke sawal ka jawab: ${jobData.title}. Details description mein hain.`,
        
        'exam_pattern': `Exam pattern ${jobData.examPattern || 'description mein'} hai. ${jobData.organization} ka selection process samjhein.`,
        
        'application_process': `${jobData.organization} mein apply karne ke liye description mein link hai. Online application process follow karein.`,
        
        'documents_required': `${jobData.documentsRequired || 'required documents'} chahiye ${jobData.organization} ke liye. Description mein details hain.`,
        
        'selection_process': `Selection process ${jobData.selectionProcess || 'description mein'} hai. ${jobData.organization} ka pura process janein.`,
        
        'important_dates': `Important dates: Start ${jobData.startDate || 'TBD'}, Last ${jobData.lastDate || 'TBD'}. Calendar mein mark karein.`,
        
        'eligibility_deep': `${jobData.eligibility || jobData.qualification || 'eligible'} candidates ${jobData.organization} mein apply kar sakte hain. Complete criteria description mein hai.`,
        
        'common_mistake': `${jobData.organization} application mein ye common mistakes avoid karein. Details description mein hain.`,
        
        'quick_explanation': `${jobData.organization} recruitment quick overview: ${jobData.vacancies || ''} vacancies, last date ${jobData.lastDate || 'TBD'}. Full details description mein.`
    };
    
    return scripts[angle.key] || scripts['basic_alert'];
}

module.exports = {
    ANGLE_DEFINITIONS,
    identifyAvailableAngles,
    selectBestAngle,
    generateAngleHook,
    generateAngleScript
};

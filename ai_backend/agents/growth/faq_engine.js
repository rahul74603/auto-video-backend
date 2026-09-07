'use strict';

/**
 * faq_engine.js — FAQ Content Engine
 * 
 * Identifies meaningful FAQs from job data and creates content opportunities.
 * 
 * Priority scoring based on:
 * - Audience demand (how often this question is asked)
 * - Data availability (do we have the answer?)
 * - Already answered? (prevent duplicates)
 * - Recently published? (prevent fatigue)
 * - Content opportunity score
 * 
 * Safety rules:
 * - Only generate FAQ if source data supports it
 * - Don't automatically generate all FAQs
 * - Use priority scoring
 * - Prevent repetitive content
 */

// Common FAQ topics for government jobs
const FAQ_TOPICS = {
    'qualification': {
        question: 'What is the qualification?',
        questionHindi: 'योग्यता क्या है?',
        priority: 9,
        dataField: 'qualification',
        audienceDemand: 'high'
    },
    
    'age_limit': {
        question: 'What is the age limit?',
        questionHindi: 'आयु सीमा क्या है?',
        priority: 9,
        dataField: 'ageLimit',
        audienceDemand: 'high'
    },
    
    'salary': {
        question: 'What is the salary?',
        questionHindi: 'वेतन कितना है?',
        priority: 8,
        dataField: 'salary',
        audienceDemand: 'high'
    },
    
    'application_fee': {
        question: 'What is the application fee?',
        questionHindi: 'आवेदन शुल्क कितना है?',
        priority: 7,
        dataField: 'applicationFee',
        audienceDemand: 'medium'
    },
    
    'last_date': {
        question: 'What is the last date?',
        questionHindi: 'आखिरी तारीख कब है?',
        priority: 8,
        dataField: 'lastDate',
        audienceDemand: 'high'
    },
    
    'selection_process': {
        question: 'What is the selection process?',
        questionHindi: 'चयन प्रक्रिया क्या है?',
        priority: 7,
        dataField: 'selectionProcess',
        audienceDemand: 'medium'
    },
    
    'documents_required': {
        question: 'What documents are required?',
        questionHindi: 'कौन से दस्तावेज चाहिए?',
        priority: 6,
        dataField: 'documentsRequired',
        audienceDemand: 'medium'
    },
    
    'apply_process': {
        question: 'How to apply?',
        questionHindi: 'कैसे आवेदन करें?',
        priority: 7,
        dataField: 'applyUrl',
        audienceDemand: 'high'
    },
    
    'vacancies': {
        question: 'How many vacancies?',
        questionHindi: 'कितनी vacancies हैं?',
        priority: 8,
        dataField: 'vacancies',
        audienceDemand: 'high'
    },
    
    'exam_pattern': {
        question: 'What is the exam pattern?',
        questionHindi: 'परीक्षा पैटर्न क्या है?',
        priority: 6,
        dataField: 'examPattern',
        audienceDemand: 'medium'
    },
    
    'eligibility': {
        question: 'Who can apply?',
        questionHindi: 'कौन apply कर सकता है?',
        priority: 8,
        dataField: 'eligibility',
        audienceDemand: 'high'
    },
    
    'job_location': {
        question: 'What is the job location?',
        questionHindi: 'नौकरी की जगह कहां है?',
        priority: 5,
        dataField: 'location',
        audienceDemand: 'low'
    }
};

/**
 * Identify available FAQs for a job
 */
function identifyFAQs(jobData) {
    const availableFAQs = [];
    
    for (const [topicKey, topicInfo] of Object.entries(FAQ_TOPICS)) {
        const dataField = topicInfo.dataField;
        
        // Check if we have the data
        const hasData = jobData[dataField] && 
                       jobData[dataField] !== '' && 
                       jobData[dataField] !== null &&
                       jobData[dataField] !== undefined;
        
        if (hasData) {
            availableFAQs.push({
                topic: topicKey,
                question: topicInfo.question,
                questionHindi: topicInfo.questionHindi,
                priority: topicInfo.priority,
                audienceDemand: topicInfo.audienceDemand,
                answer: jobData[dataField]
            });
        }
    }
    
    // Sort by priority (descending)
    availableFAQs.sort((a, b) => b.priority - a.priority);
    
    return availableFAQs;
}

/**
 * Calculate FAQ opportunity score
 */
function calculateFAQOpportunity(faq, jobData, previouslyPublished = []) {
    let score = faq.priority;
    
    // Boost for high audience demand
    if (faq.audienceDemand === 'high') {
        score += 2;
    } else if (faq.audienceDemand === 'medium') {
        score += 1;
    }
    
    // Check if already published
    const alreadyPublished = previouslyPublished.some(p => 
        p.jobId === jobData.id && p.faqTopic === faq.topic
    );
    
    if (alreadyPublished) {
        score -= 5; // Heavy penalty for duplicate
    }
    
    // Check recency of similar content
    const recentSimilar = previouslyPublished.filter(p => 
        p.jobId === jobData.id && 
        (Date.now() - new Date(p.date).getTime()) < 7 * 24 * 60 * 60 * 1000 // 7 days
    );
    
    if (recentSimilar.length > 0) {
        score -= 3; // Penalty for recent similar content
    }
    
    // Boost for urgent deadlines
    const urgency = require('./deadline_engine').calculateUrgency(jobData.lastDate);
    if (urgency.urgencyLevel >= 7) {
        score += 1;
    }
    
    return Math.max(0, score); // Minimum score is 0
}

/**
 * Select best FAQ to create content for
 */
function selectBestFAQ(jobData, previouslyPublished = [], minScore = 7) {
    const availableFAQs = identifyFAQs(jobData);
    
    if (availableFAQs.length === 0) {
        return {
            selected: false,
            reason: 'No FAQ data available'
        };
    }
    
    // Calculate opportunity scores
    const scoredFAQs = availableFAQs.map(faq => ({
        ...faq,
        opportunityScore: calculateFAQOpportunity(faq, jobData, previouslyPublished)
    }));
    
    // Sort by opportunity score
    scoredFAQs.sort((a, b) => b.opportunityScore - a.opportunityScore);
    
    const bestFAQ = scoredFAQs[0];
    
    // Check if score meets minimum threshold
    if (bestFAQ.opportunityScore < minScore) {
        return {
            selected: false,
            reason: `Score too low (${bestFAQ.opportunityScore} < ${minScore})`,
            bestScore: bestFAQ.opportunityScore
        };
    }
    
    // Check if already published recently
    const recentlyPublished = previouslyPublished.find(p => 
        p.jobId === jobData.id && 
        p.faqTopic === bestFAQ.topic &&
        (Date.now() - new Date(p.date).getTime()) < 14 * 24 * 60 * 60 * 1000 // 14 days
    );
    
    if (recentlyPublished) {
        return {
            selected: false,
            reason: 'Recently published',
            daysSincePublication: Math.ceil((Date.now() - new Date(recentlyPublished.date).getTime()) / (1000 * 60 * 60 * 24))
        };
    }
    
    return {
        selected: true,
        faq: bestFAQ,
        opportunityScore: bestFAQ.opportunityScore
    };
}

/**
 * Generate FAQ-focused hook
 */
function generateFAQHook(faq, jobData) {
    const hooks = {
        'qualification': [
            `${jobData.organization} में apply करने के लिए qualification क्या चाहिए?`,
            `What qualification do you need for ${jobData.organization}?`,
            `🎓 Eligibility Criteria Explained`
        ],
        
        'age_limit': [
            `${jobData.organization} भर्ती की age limit क्या है?`,
            `Age limit for ${jobData.organization} recruitment`,
            `👤 Who Can Apply? Age Criteria`
        ],
        
        'salary': [
            `${jobData.organization} में salary कितनी मिलेगी?`,
            `Salary in ${jobData.organization} job`,
            `💰 Salary Details Revealed`
        ],
        
        'vacancies': [
            `${jobData.organization} में कितनी vacancies हैं?`,
            `Total vacancies in ${jobData.organization}`,
            `📊 Vacancy Breakdown`
        ],
        
        'last_date': [
            `${jobData.organization} apply करने की last date कब है?`,
            `Last date for ${jobData.organization}`,
            ` Deadline Information`
        ],
        
        'apply_process': [
            `${jobData.organization} में apply कैसे करें?`,
            `How to apply for ${jobData.organization}?`,
            `📝 Application Process Step by Step`
        ],
        
        'eligibility': [
            `कौन apply कर सकता है ${jobData.organization} में?`,
            `Who can apply for ${jobData.organization}?`,
            `✅ Eligibility Criteria`
        ],
        
        'exam_pattern': [
            `${jobData.organization} exam का pattern क्या है?`,
            `Exam pattern for ${jobData.organization}`,
            ` Exam Structure Explained`
        ]
    };
    
    const topicHooks = hooks[faq.topic] || [
        `${faq.questionHindi} ${jobData.organization} में?`,
        faq.question,
        `ℹ️ Important Information`
    ];
    
    const randomIndex = Math.floor(Math.random() * topicHooks.length);
    
    return topicHooks[randomIndex];
}

/**
 * Generate FAQ-focused script
 */
function generateFAQScript(faq, jobData) {
    const scripts = {
        'qualification': `${faq.answer} qualification वाले candidates ${jobData.organization} में apply कर सकते हैं। पूरी जानकारी description में है।`,
        
        'age_limit': `Age limit ${faq.answer} है। इस उम्र के candidates ${jobData.organization} के लिए eligible हैं। Details description में हैं।`,
        
        'salary': `Salary ${faq.answer} है। ${jobData.organization} में यह वेतन मिलेगा। Complete details description में हैं।`,
        
        'vacancies': `Total ${faq.answer} vacancies हैं ${jobData.organization} में। Apply करने की last date description में check करें।`,
        
        'last_date': `Last date ${faq.answer} है। ${jobData.organization} में apply करने के लिए जल्दी करें। Details description में हैं।`,
        
        'apply_process': `${jobData.organization} में apply करने के लिए description में link है। Online application process follow करें।`,
        
        'eligibility': `${faq.answer} candidates ${jobData.organization} में apply कर सकते हैं। eligibility criteria description में detailed है।`,
        
        'exam_pattern': `Exam pattern ${faq.answer} है। ${jobData.organization} का selection process description में explain किया है।`
    };
    
    return scripts[faq.topic] || `${faq.questionHindi} ${jobData.organization} के लिए। Answer: ${faq.answer}. Details description में हैं।`;
}

module.exports = {
    FAQ_TOPICS,
    identifyFAQs,
    calculateFAQOpportunity,
    selectBestFAQ,
    generateFAQHook,
    generateFAQScript
};

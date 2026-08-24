'use strict';

/**
 * content_mutation.js — Content Mutation Engine (Phase 26)
 * 
 * If a content topic performed extremely well, allows controlled regeneration
 * with different angles. Never blindly duplicates the same video.
 */

const flags = require('./feature_flags');

const MUTATION_ASPECTS = {
    JOB: ['vacancy', 'eligibility', 'last_date', 'salary', 'exam_pattern', 'admit_card', 'result', 'application_process'],
    FAST_TRACK: ['update', 'correction', 'follow_up', 'detailed', 'comparison'],
    MOCK_TEST: ['same_subject_new_difficulty', 'related_topic', 'time_strategy', 'solution_explanation']
};

function generateMutations(content, opportunity, opts = {}) {
    if (!flags.isEnabled('CONTENT_MUTATION_ENABLED')) {
        return { mutations: [], reason: 'mutation disabled' };
    }

    const category = opportunity?.category || 'GENERAL';
    const contentType = content.type || 'JOB';
    const aspects = MUTATION_ASPECTS[contentType] || MUTATION_ASPECTS.JOB;

    const existingTopics = opts.existingTopics || [];
    const mutations = [];

    for (const aspect of aspects) {
        const topic = createMutationTopic(content, aspect);
        if (!topic) continue;

        // Skip if already covered
        if (existingTopics.includes(topic.normalizedTopic)) continue;

        mutations.push({
            originalContent: content.title || '',
            aspect,
            topic: topic.title,
            normalizedTopic: topic.normalizedTopic,
            recommendedFormat: topic.format,
            recommendedDuration: topic.duration,
            reason: `mutation from high-performing ${contentType} content on "${content.title}"`
        });
    }

    return { mutations, totalPossible: aspects.length };
}

function createMutationTopic(content, aspect) {
    const org = content.organization || '';
    const title = content.title || '';

    switch (aspect) {
        case 'vacancy':
            return {
                title: `${org} Vacancy Details — ${title}`,
                normalizedTopic: `${org.toLowerCase()}-vacancy`,
                format: 'JOB_ALERT',
                duration: 30
            };
        case 'eligibility':
            return {
                title: `${org} Eligibility — Who Can Apply?`,
                normalizedTopic: `${org.toLowerCase()}-eligibility`,
                format: 'EDUCATIONAL',
                duration: 40
            };
        case 'last_date':
            return {
                title: `${org} Last Date — Apply Before It's Too Late`,
                normalizedTopic: `${org.toLowerCase()}-last-date`,
                format: 'UPDATE',
                duration: 20
            };
        case 'salary':
            return {
                title: `${org} Salary & Benefits — Kitna Milega?`,
                normalizedTopic: `${org.toLowerCase()}-salary`,
                format: 'EDUCATIONAL',
                duration: 35
            };
        case 'exam_pattern':
            return {
                title: `${org} Exam Pattern & Syllabus — Full Guide`,
                normalizedTopic: `${org.toLowerCase()}-exam-pattern`,
                format: 'DETAILED',
                duration: 50
            };
        case 'admit_card':
            return {
                title: `${org} Admit Card — Download Kaise Kare`,
                normalizedTopic: `${org.toLowerCase()}-admit-card`,
                format: 'UPDATE',
                duration: 25
            };
        case 'result':
            return {
                title: `${org} Result — Check Kaise Kare`,
                normalizedTopic: `${org.toLowerCase()}-result`,
                format: 'BREAKING_SHORT',
                duration: 20
            };
        case 'application_process':
            return {
                title: `${org} Apply Online — Step by Step Guide`,
                normalizedTopic: `${org.toLowerCase()}-apply-online`,
                format: 'DETAILED',
                duration: 45
            };
        default:
            return null;
    }
}

module.exports = {
    generateMutations,
    createMutationTopic,
    MUTATION_ASPECTS
};

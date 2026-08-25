'use strict';

/**
 * ai_visual_engine.js — Dynamic AI Visual Layer
 * 
 * Generates category-aware AI images for video backgrounds.
 * 
 * Fallback order:
 * 1. AI-generated image (when provider available)
 * 2. Existing category visual
 * 3. Existing background
 * 4. Existing video template
 * 
 * Cost guards:
 * - Max 1 AI image per video
 * - Daily limit configurable
 * - Timeout 30 seconds
 * - Max retries 2
 * - File size limit 5MB
 * - Cleanup after render
 * 
 * Safety:
 * - Never put factual job data in prompt
 * - Visual only, no authoritative text
 * - Graceful failure to existing system
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Category-specific visual prompts
const CATEGORY_PROMPTS = {
    'POLICE': 'Indian police recruitment training ground, aspirant in uniform, energetic editorial photography, vertical composition, professional lighting, clean negative space on right side, realistic documentary style',
    
    'RAILWAY': 'Indian railway station platform, young student with books, railway recruitment atmosphere, editorial photography, vertical format, warm lighting, clean space for text overlay',
    
    'BANKING': 'Modern Indian bank office interior, young professional aspirant, financial career atmosphere, corporate editorial style, vertical composition, soft lighting, minimal clutter',
    
    'SSC': 'Indian student studying at desk with books, competitive exam preparation atmosphere, focused study environment, editorial photography, vertical format, natural lighting',
    
    'DEFENCE': 'Indian military training ground, disciplined aspirant, defence recruitment atmosphere, official editorial style, vertical composition, strong lighting, patriotic mood',
    
    'TEACHING': 'Indian classroom with teacher, education environment, teaching career atmosphere, warm editorial photography, vertical format, inspiring mood',
    
    'ENGINEERING': 'Engineering campus laboratory, technical student, professional education atmosphere, modern editorial style, vertical composition, clean aesthetic',
    
    'UPSC': 'Serious Indian student reading thick books, civil services preparation, intensive study atmosphere, editorial photography, vertical format, focused mood',
    
    'ADMIT_CARD': 'Official government document on table, examination hall atmosphere, important paperwork, editorial photography, vertical format, clean composition',
    
    'RESULT': 'Student celebrating achievement, result announcement atmosphere, success moment, editorial photography, vertical composition, joyful mood',
    
    'APPRENTICESHIP': 'Industrial workshop training environment, young trainee learning skills, vocational education atmosphere, editorial photography, vertical format',
    
    'SCHOLARSHIP': 'Student receiving award, educational support atmosphere, opportunity moment, editorial photography, vertical composition, inspiring mood',
    
    'Default': 'Indian student preparing for competitive exam, study environment, educational atmosphere, editorial photography, vertical composition, professional lighting'
};

// Visual style modifiers
const STYLE_MODIFIERS = [
    'cinematic color grading',
    'documentary style',
    'editorial photography',
    'photojournalistic',
    'clean minimal',
    'warm natural lighting',
    'cool professional tones',
    'high contrast dramatic',
    'soft diffused lighting'
];

// Placement requirements for presenter
const PLACEMENT_PROMPTS = {
    'bottom': 'important visual elements in upper two-thirds, clear space at bottom for presenter overlay',
    'left': 'visual focus on right side, clear space on left for presenter',
    'right': 'visual focus on left side, clear space on right for presenter',
    'center': 'balanced composition, clear space in center-bottom for presenter'
};

/**
 * Generate AI image prompt based on job data
 */
function generatePrompt(jobData, options = {}) {
    const category = jobData.category || 'Default';
    const basePrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS['Default'];
    
    // Add style modifier (deterministic based on job slug for consistency)
    const styleIndex = Math.abs(hashString(jobData.slug || 'default')) % STYLE_MODIFIERS.length;
    const styleModifier = STYLE_MODIFIERS[styleIndex];
    
    // Add placement requirement
    const placement = options.placement || 'bottom';
    const placementPrompt = PLACEMENT_PROMPTS[placement] || PLACEMENT_PROMPTS['bottom'];
    
    // Combine prompt
    const fullPrompt = `${basePrompt}, ${styleModifier}, ${placementPrompt}`;
    
    return fullPrompt;
}

/**
 * Hash string for deterministic style selection
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    // Firestore document IDs must be non-empty strings. The raw hash is a
    // (possibly negative) number — convert to a string and sanitize it so it
    // is a valid Firestore document path.
    return `ai-${Math.abs(hash).toString(36)}`;
}

/**
 * Generate AI image using free/low-cost provider
 * 
 * Currently supports:
 * - Pollinations.ai (free, no API key required)
 * 
 * Fallback: returns null on failure
 */
async function generateImage(prompt, options = {}) {
    const timeout = options.timeout || 30000; // 30 seconds default
    const outputPath = options.outputPath;
    
    if (!outputPath) {
        throw new Error('outputPath is required');
    }
    
    try {
        // Pollinations.ai - free image generation
        const encodedPrompt = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=720&height=1280&nologo=true`;
        
        const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'arraybuffer',
            timeout: timeout,
            maxContentLength: 5 * 1024 * 1024 // 5MB limit
        });
        
        // Validate image
        const buffer = Buffer.from(response.data);
        
        if (buffer.length < 1000) {
            throw new Error('Image too small, likely invalid');
        }
        
        // Check if it's actually an image (magic bytes)
        const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
        
        if (!isJpeg && !isPng) {
            throw new Error('Response is not a valid image');
        }
        
        // Save to disk
        fs.writeFileSync(outputPath, buffer);
        
        return {
            success: true,
            path: outputPath,
            size: buffer.length,
            provider: 'pollinations'
        };
        
    } catch (err) {
        console.log(`⚠️ AI image generation failed: ${err.message || err}`);
        
        // Cleanup partial file if exists
        if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch {}
        }
        
        return {
            success: false,
            error: err.message || 'Unknown error',
            provider: 'pollinations'
        };
    }
}

/**
 * Get temporary path for AI image
 */
function getTempImagePath(jobId) {
    const tempDir = os.tmpdir();
    const filename = `ai-visual-${jobId}-${Date.now()}.jpg`;
    return path.join(tempDir, filename);
}

/**
 * Cleanup AI image after render
 */
function cleanupImage(imagePath) {
    if (imagePath && fs.existsSync(imagePath)) {
        try {
            fs.unlinkSync(imagePath);
            console.log(`🧹 AI visual cleaned: ${path.basename(imagePath)}`);
        } catch (err) {
            console.log(`⚠️ AI visual cleanup failed: ${err.message || err}`);
        }
    }
}

module.exports = {
    CATEGORY_PROMPTS,
    STYLE_MODIFIERS,
    PLACEMENT_PROMPTS,
    generatePrompt,
    generateImage,
    getTempImagePath,
    cleanupImage,
    hashString
};

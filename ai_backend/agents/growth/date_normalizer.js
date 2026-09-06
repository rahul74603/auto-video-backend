'use strict';

/**
 * date_normalizer.js — Normalize Indian job dates to ISO format (YYYY-MM-DD)
 * 
 * Supports all common Indian date formats:
 * - 31 August 2026
 * - 31 Aug 2026
 * - 31-Aug-2026
 * - 31/08/2026
 * - 31-08-2026
 * - 31.08.2026
 * - 2026-08-31
 * - 31st August 2026
 * - 31 अगस्त 2026
 * - 14 सितंबर 2026
 * - etc.
 * 
 * Returns null if date cannot be parsed (never invents dates).
 */

const HINDI_MONTHS = {
    'जनवरी': 0, 'जन': 0,
    'फरवरी': 1, 'फर': 1,
    'मार्च': 2, 'मार्': 2,
    'अप्रैल': 3, 'अप्र': 3,
    'मई': 4,
    'जून': 5,
    'जुलाई': 6, 'जुल': 6,
    'अगस्त': 7, 'अग': 7,
    'सितंबर': 8, 'सित': 8,
    'अक्टूबर': 9, 'अक्ट': 9,
    'नवंबर': 10, 'नव': 10,
    'दिसंबर': 11, 'दिस': 11
};

const ENGLISH_MONTHS = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'sept': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
};

/**
 * Parse a date string in various Indian formats.
 * Returns ISO string (YYYY-MM-DD) or null if invalid.
 */
function normalizeDate(dateStr) {
    if (!dateStr) return null;
    
    // Already a Date object
    if (dateStr instanceof Date) {
        return isNaN(dateStr.getTime()) ? null : dateStr.toISOString().split('T')[0];
    }
    
    const str = String(dateStr).trim();
    
    // Try standard ISO parse first (2026-08-31)
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmyMatch) {
        const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    
    // DD Month YYYY (e.g., "31 August 2026", "14 September 2026")
    const dmyWordMatch = str.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/);
    if (dmyWordMatch) {
        const day = parseInt(dmyWordMatch[1]);
        const monthStr = dmyWordMatch[2].toLowerCase();
        const year = parseInt(dmyWordMatch[3]);
        const month = ENGLISH_MONTHS[monthStr];
        if (month !== undefined) {
            const d = new Date(year, month, day);
            return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
        }
    }
    
    // DD Month YYYY in Hindi (e.g., "14 सितंबर 2026", "31 अगस्त 2026")
    const hindiMatch = str.match(/^(\d{1,2})\s+([\u0900-\u097F]+)\s+(\d{4})$/);
    if (hindiMatch) {
        const day = parseInt(hindiMatch[1]);
        const monthStr = hindiMatch[2];
        const year = parseInt(hindiMatch[3]);
        const month = HINDI_MONTHS[monthStr];
        if (month !== undefined) {
            const d = new Date(year, month, day);
            return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
        }
    }
    
    // DD-Mon-YYYY (e.g., "31-Aug-2026")
    const dmyHyphenMatch = str.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
    if (dmyHyphenMatch) {
        const day = parseInt(dmyHyphenMatch[1]);
        const monthStr = dmyHyphenMatch[2].toLowerCase();
        const year = parseInt(dmyHyphenMatch[3]);
        const month = ENGLISH_MONTHS[monthStr];
        if (month !== undefined) {
            const d = new Date(year, month, day);
            return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
        }
    }
    
    // Try native Date.parse as last resort
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
    }
    
    return null;
}

module.exports = {
    normalizeDate,
    HINDI_MONTHS,
    ENGLISH_MONTHS
};

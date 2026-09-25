/**
 * JobPosting schema helpers — FACTUAL data only (koi fabrication nahi).
 * ====================================================================
 * Google GSC "Improve item appearance" warnings safely improve karne ke liye:
 *  - deriveAddressRegion: location text EXACT Indian state/UT se match ho tabhi
 *    region banta hai — warna undefined (field omit, fake nahi).
 *  - parseBaseSalary: sirf job.salary / job.payScale fields se STRICT numeric
 *    parse (range ya single), sanity bounds ke saath. Ambiguous ho to undefined.
 * Description/text scraping NAHI karte — sirf dedicated fields.
 */

const IN_STATES = new Set([
    'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'chattisgarh',
    'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala',
    'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
    'odisha', 'orissa', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana',
    'tripura', 'uttar pradesh', 'uttarakhand', 'uttaranchal', 'west bengal',
    'delhi', 'new delhi', 'jammu and kashmir', 'jammu & kashmir', 'ladakh', 'chandigarh',
    'puducherry', 'pondicherry', 'andaman and nicobar islands', 'andaman & nicobar islands',
    'dadra and nagar haveli and daman and diu', 'dadra & nagar haveli and daman & diu',
    'lakshadweep',
]);

// Sirf ye 2-letter codes standalone-token hote hain (UP/MP/HP) — word-boundary check
const IN_STATE_CODES = new Set(['up', 'mp', 'hp']);

function normState(text: string): string {
    return String(text || '').toLowerCase().replace(/[^a-z&\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Location text se FACTUAL addressRegion — exact state match, warna null. */
export function deriveAddressRegion(location: unknown): string | null {
    const raw = String(location || '').trim();
    if (!raw) return null;
    const whole = normState(raw);
    if (IN_STATES.has(whole)) return titleCaseState(whole);
    // comma-parts: "Varanasi, Uttar Pradesh" → last part
    const parts = raw.split(',').map((p) => normState(p)).filter(Boolean);
    for (const part of parts) {
        if (IN_STATES.has(part)) return titleCaseState(part);
    }
    // standalone state-codes: "UP Police Constable" / "Jobs in UP"
    for (const part of [whole, ...parts]) {
        const words = part.split(' ');
        const code = words.find((w) => IN_STATE_CODES.has(w));
        if (code) return titleCaseState(code);
    }
    return null;
}

function titleCaseState(s: string): string {
    const map: Record<string, string> = {
        'up': 'Uttar Pradesh', 'mp': 'Madhya Pradesh', 'hp': 'Himachal Pradesh',
        'delhi': 'Delhi', 'new delhi': 'Delhi',
    };
    if (map[s]) return map[s];
    return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export interface BaseSalaryLd {
    '@type': 'MonetaryAmount';
    currency: 'INR';
    value: {
        '@type': 'QuantitativeValue';
        unitText: 'MONTH';
        minValue?: number;
        maxValue?: number;
        value?: number;
    };
}

const MIN_MONTHLY = 3000;
const MAX_MONTHLY = 1000000;

/**
 * salary/payScale field se STRICT MonetaryAmount parse.
 * - "21,700 - 69,100" / "₹21700 to ₹69100" → range
 * - "₹21,700" → single
 * - "Pay Level 7" (koi 4+ digit figure nahi) → null (invent NAHI karte)
 * Bounds (₹3k-₹10l per month) ke bahar → null.
 */
export function parseBaseSalary(raw: unknown): BaseSalaryLd | null {
    const text = String(raw || '').replace(/[,\s]/g, '').replace(/₹/g, ' ');
    if (!text) return null;
    const range = text.match(/(\d{4,7})\s*(?:-|–|to|से)\s*(\d{4,7})/i);
    if (range) {
        const min = Number(range[1]);
        const max = Number(range[2]);
        if (min >= MIN_MONTHLY && max <= MAX_MONTHLY && min < max) {
            return {
                '@type': 'MonetaryAmount',
                currency: 'INR',
                value: { '@type': 'QuantitativeValue', unitText: 'MONTH', minValue: min, maxValue: max },
            };
        }
        return null;
    }
    const single = text.match(/(?:^|\D)(\d{4,7})(?:\D|$)/);
    if (single) {
        const value = Number(single[1]);
        if (value >= MIN_MONTHLY && value <= MAX_MONTHLY) {
            return {
                '@type': 'MonetaryAmount',
                currency: 'INR',
                value: { '@type': 'QuantitativeValue', unitText: 'MONTH', value },
            };
        }
    }
    return null;
}

import { describe, expect, it } from 'vitest';
import { deriveAddressRegion, parseBaseSalary } from '@/utils/jobSchemaFields';

describe('deriveAddressRegion (FACTUAL-only region)', () => {
    it('exact state name se region deta hai', () => {
        expect(deriveAddressRegion('Varanasi, Uttar Pradesh')).toBe('Uttar Pradesh');
        expect(deriveAddressRegion('Maharashtra')).toBe('Maharashtra');
        expect(deriveAddressRegion('New Delhi')).toBe('Delhi');
    });

    it('standalone state-codes (UP/MP/HP) handle karta hai', () => {
        expect(deriveAddressRegion('UP Police Constable')).toBe('Uttar Pradesh');
        expect(deriveAddressRegion('Jobs in MP')).toBe('Madhya Pradesh');
    });

    it('ambiguous/non-state location pe NULL (koi guess nahi)', () => {
        expect(deriveAddressRegion('All India')).toBeNull();
        expect(deriveAddressRegion('Across India')).toBeNull();
        expect(deriveAddressRegion('Varanasi')).toBeNull();
        expect(deriveAddressRegion('')).toBeNull();
        expect(deriveAddressRegion(undefined)).toBeNull();
    });

    it('UP word ke bina up-prefix words pe galat match nahi', () => {
        // "up" substring standalone hona chahiye — "Updates"/"Supreme" nahi
        expect(deriveAddressRegion('Supreme Court Update')).toBeNull();
    });
});

describe('parseBaseSalary (STRICT, no invention)', () => {
    it('range parse karta hai', () => {
        expect(parseBaseSalary('21,700 - 69,100')).toMatchObject({
            '@type': 'MonetaryAmount',
            currency: 'INR',
            value: { unitText: 'MONTH', minValue: 21700, maxValue: 69100 },
        });
        expect(parseBaseSalary('₹21700 to ₹69100')?.value).toMatchObject({ minValue: 21700, maxValue: 69100 });
    });

    it('single value parse karta hai', () => {
        expect(parseBaseSalary('₹21,700')?.value).toMatchObject({ value: 21700 });
    });

    it('pay-level / ambiguous text pe NULL (invent nahi karte)', () => {
        expect(parseBaseSalary('Pay Level 7')).toBeNull();
        expect(parseBaseSalary('As per rules')).toBeNull();
        expect(parseBaseSalary('')).toBeNull();
        expect(parseBaseSalary(undefined)).toBeNull();
    });

    it('sanity bounds ke bahar → NULL', () => {
        expect(parseBaseSalary('500')).toBeNull();          // too low
        expect(parseBaseSalary('9900000')).toBeNull();      // too high
        expect(parseBaseSalary('99 - 150')).toBeNull();     // below min range
    });
});

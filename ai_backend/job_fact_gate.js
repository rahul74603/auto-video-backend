// =========================================================
// 🛡️ JOB FACT GATE (2026-11-05) — Eric ki shart: "data real &
// latest chahiye, galat gadbad nahi; aur kuch bigadna mat."
//
// Gemini extraction ke baad, draft banne se PEHLE chalne wali
// jaanch: vacancies / fees / salary ke number asal scraped source
// text me sach me hain ya nahi. Jo number source me na mile, woh
// field khaali ho jata hai — galat number se khaali hamesha
// behtar hai (article writer khaali field par "aadhikarik
// notification dekho" likhta hai, galat dawa kabhi nahi banta).
// Tareekhon me source ki labeled tareekh (jo extractLabeledDate
// pehle se nikaalta hai) ko AI ke andaz par prathmikta milti hai.
//
// Ye module PURE hai (koi Firestore/network nahi) taaki akela
// test ho sake. Koi bhi andar ki galti par ORIGINAL data wapas
// jata hai — gate kabhi scraper ko rok nahi sakta.
// =========================================================

const DEV_DIGITS = '०१२३४५६७८९';

function normalizeText(s) {
    return String(s || '')
        .replace(/[०-९]/g, ch => String(DEV_DIGITS.indexOf(ch)))
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function indianGroup(n) {
    const s = String(n);
    if (s.length <= 3) return s;
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts = [];
    while (rest.length > 2) {
        parts.unshift(rest.slice(-2));
        rest = rest.slice(0, -2);
    }
    if (rest) parts.unshift(rest);
    return parts.join(',') + ',' + last3;
}

function numberForms(numStr) {
    const digits = String(numStr || '').replace(/\D/g, '');
    if (!digits) return [];
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n)) return [];
    return [...new Set([
        String(n),
        digits,
        indianGroup(n),
        n.toLocaleString('en-US'),
    ])];
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Number source me hai ya nahi — digit-boundary ke saath, taaki
// "500" galti se "15000" ke andar chipa na maan liya jaye.
function containsNumber(sourceNorm, numStr) {
    const forms = numberForms(numStr);
    if (!forms.length) return true; // number hi nahi — gate chup
    const flat = sourceNorm.replace(/,/g, '');
    return forms.some(f => {
        const re = new RegExp(`(?<![0-9])${escapeRegExp(f)}(?![0-9])`);
        return re.test(sourceNorm) || re.test(flat);
    });
}

function firstNumber(value) {
    const norm = String(value || '')
        .replace(/[०-९]/g, ch => String(DEV_DIGITS.indexOf(ch)));
    const m = norm.match(/\d[\d,]*\d|\d/);
    return m ? m[0] : '';
}

function allNumbers(value) {
    const norm = String(value || '')
        .replace(/[०-९]/g, ch => String(DEV_DIGITS.indexOf(ch)));
    return norm.match(/\d[\d,]*\d|\d+/g) || [];
}

const NUMBER_FIELDS = ['vacancies', 'feeGen', 'feeSCST', 'feeFemale', 'feeOBC'];

function verifyJobFacts(jobData, sourceText, labeled) {
    const notes = [];
    const data = { ...jobData };
    try {
        const src = normalizeText(sourceText);
        // Chhota/adhura source — number gate nahi lagega (galat-drop
        // ka risk galat-number se zyada bura hai Eric ke liye).
        if (src.length >= 400) {
            for (const f of NUMBER_FIELDS) {
                const v = String(data[f] || '').trim();
                if (!v) continue;
                const num = firstNumber(v);
                if (num && !containsNumber(src, num)) {
                    data[f] = '';
                    notes.push(`${f} '${v}' source me nahi mila — khaali kiya`);
                }
            }
            const sal = String(data.salary || '').trim();
            if (sal) {
                const big = allNumbers(sal)
                    .filter(x => x.replace(/\D/g, '').length >= 4);
                if (big.length && big.some(n => !containsNumber(src, n))) {
                    data.salary = '';
                    notes.push(`salary '${sal}' source se match nahi — khaali kiya`);
                }
            }
        }
        if (labeled) {
            for (const f of ['startDate', 'lastDate']) {
                const lv = String(labeled[f] || '').trim();
                if (lv && lv !== String(data[f] || '').trim()) {
                    notes.push(`${f}: AI ki '${data[f] || ''}' ki jagah source ki '${lv}'`);
                    data[f] = lv;
                }
            }
        }
    } catch (e) {
        return { data: jobData, notes: [] };
    }
    return { data, notes };
}

module.exports = {
    verifyJobFacts,
    _internals: { normalizeText, numberForms, containsNumber, firstNumber, allNumbers },
};

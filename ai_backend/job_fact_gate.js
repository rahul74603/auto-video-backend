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

// =========================================================
// 📅 FAST TRACK ke liye: updateDate ki jaanch. Fast Track me
// vacancies/fees hote hi nahi — wahan AI ki sabse badi gadbad
// tareekh me hoti hai (purani/galat saal wali result-date).
// Tareekh agar source text me kisi bhi format me na mile to
// khaali; jo tareekh samajh hi na aaye use haath nahi lagate.
// =========================================================
const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
    october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];

function parseDateParts(value) {
    const tx = normalizeText(value);
    let m = tx.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
    m = tx.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
    if (m) return { y: +m[3], mo: +m[2], d: +m[1] };
    m = tx.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(20\d{2})\b/);
    if (m && MONTHS[m[2]]) return { y: +m[3], mo: MONTHS[m[2]], d: +m[1] };
    m = tx.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/);
    if (m && MONTHS[m[1]]) return { y: +m[3], mo: MONTHS[m[1]], d: +m[2] };
    return null;
}

function dateForms({ y, mo, d }) {
    const p2 = n => String(n).padStart(2, '0');
    const mon = MONTH_NAMES[mo - 1];
    const mon3 = mon.slice(0, 3);
    return [
        `${d}/${mo}/${y}`, `${p2(d)}/${p2(mo)}/${y}`,
        `${d}-${mo}-${y}`, `${p2(d)}-${p2(mo)}-${y}`,
        `${d}.${mo}.${y}`, `${p2(d)}.${p2(mo)}.${y}`,
        `${y}-${p2(mo)}-${p2(d)}`,
        `${d} ${mon} ${y}`, `${d} ${mon3} ${y}`,
        `${mon} ${d}, ${y}`, `${mon3} ${d}, ${y}`,
        `${mon} ${d} ${y}`, `${mon3} ${d} ${y}`,
    ];
}

function verifyDateField(value, sourceText) {
    const v = String(value || '').trim();
    if (!v) return { value: v, note: '' };
    try {
        const parts = parseDateParts(v);
        if (!parts) return { value: v, note: '' };
        const src = normalizeText(sourceText);
        if (src.length < 100) return { value: v, note: '' };
        const ok = dateForms(parts).some(f => src.includes(f));
        return ok
            ? { value: v, note: '' }
            : { value: '', note: `updateDate '${v}' source me nahi mila — khaali kiya` };
    } catch (e) {
        return { value: v, note: '' };
    }
}

module.exports = {
    verifyJobFacts,
    verifyDateField,
    _internals: { normalizeText, numberForms, containsNumber, firstNumber, allNumbers, parseDateParts, dateForms },
};

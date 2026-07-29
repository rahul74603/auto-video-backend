/**
 * title_utils.js — Title normalization for duplicate detection.
 * Devanagari + Hinglish dono safe (unicode letter/number classes).
 */

/**
 * Title ko ek stable comparison-key me badlo ("SSC CGL 2026!" → "ssccgl2026").
 * NOTE: \p{M} (combining marks) bhi rakhte hain — Devanagari ki matraein
 * (ि, ी, ु...) marks hoti hain; unhe hatane se alag-alag Hindi titles
 * ek jaisi key ban jaate (false duplicates).
 */
function normalizeTitleKey(title) {
    return String(title || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\p{M}]+/gu, "")
        .trim();
}

/**
 * Kya do titles ek hi cheez hain?
 * - exact normalized match, YA
 * - ek doosre ko contain kare (sirf tab jab chhota wala ≥ 20 chars ho —
 *   chhote generic titles pe false-positive na ho)
 */
function titlesOverlap(a, b) {
    const ka = normalizeTitleKey(a);
    const kb = normalizeTitleKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    const [small, big] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
    return small.length >= 20 && big.includes(small);
}

/** Titles list ka normalized Set banao. */
function buildTitleSet(titles) {
    const set = new Set();
    for (const t of titles || []) {
        const key = normalizeTitleKey(t);
        if (key) set.add(key);
    }
    return set;
}

/** Set/list ke against title ka overlap check. */
function overlapsAny(title, existingTitles) {
    for (const other of existingTitles || []) {
        if (titlesOverlap(title, other)) return { dup: true, with: other };
    }
    return { dup: false };
}

module.exports = {
    normalizeTitleKey,
    titlesOverlap,
    buildTitleSet,
    overlapsAny
};

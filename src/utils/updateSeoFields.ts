/**
 * ============================================================
 *  UPDATE-PAGE SEO FIELD BUILDERS (shared)
 * ============================================================
 * /update (fast_track) pages ke seoTitle + metaDescription ka
 * EK HI source of truth — FastTrackDetails (render) aur Admin
 * FastTrackManager (bulk "Fix missing SEO") dono yahi use karte
 * hain, taaki do jagah alag-alag logic kabhi na bane.
 *
 * Rules:
 *  - Curated (DB me pehle se likha) value hamesha JEETEGI — kabhi
 *    overwrite nahi karte.
 *  - Derived values sirf doc ke apne fields se banti hain — koi
 *    fact invent nahi hota.
 */

const META_DESC_MAX = 160;

/** HTML tags hatao, whitespace collapse karo — meta tag ke liye safe text. */
export function stripHtmlToText(value: unknown): string {
    return String(value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * SEO title builder.
 * 1) seoTitle (curated) hai → wahi.
 * 2) warna title me category pehle se hai (jaise "...Admit Card 2026")
 *    → sirf `<title> | StudyGyaan` (duplication bug: pehle
 *    "<...> Admit Card 2026 - Admit Card 2026 | StudyGyaan" ban raha tha).
 * 3) warna `<title> - <category> | StudyGyaan`.
 */
export function buildUpdateSeoTitle(
    seoTitle: string | undefined,
    title: string | undefined,
    category: string | undefined,
): string {
    const curated = String(seoTitle || '').trim();
    if (curated) return curated;

    const rawTitle = String(title || '').trim() || 'Update';
    const rawCategory = String(category || '').trim();
    const titleHasCategory =
        rawCategory !== '' && rawTitle.toLowerCase().includes(rawCategory.toLowerCase());
    return titleHasCategory
        ? `${rawTitle} | StudyGyaan`
        : `${rawTitle}${rawCategory ? ` - ${rawCategory}` : ''} | StudyGyaan`;
}

/**
 * Meta description builder (preference order):
 * 1) metaDescription (curated, as-is)
 * 2) shortInfo (plain text)
 * 3) description HTML → tags strip → 160 chars
 * 4) generic title-based fallback
 */
export function buildUpdateMetaDescription(
    metaDescription: string | undefined,
    shortInfo: string | undefined,
    description: string | undefined,
    title: string | undefined,
): string {
    const curated = String(metaDescription || '').trim();
    if (curated) return curated;

    const short = String(shortInfo || '').trim();
    if (short) return short.slice(0, META_DESC_MAX);

    const fromHtml = stripHtmlToText(description);
    if (fromHtml) return fromHtml.slice(0, META_DESC_MAX);

    const rawTitle = String(title || '').trim() || 'Sarkari update';
    return `${rawTitle} — direct link, important dates aur official updates StudyGyaan.in par.`.slice(0, META_DESC_MAX);
}

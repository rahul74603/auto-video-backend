/**
 * ============================================================
 *  JOB-PAGE SEO FIELD BUILDERS (shared)
 * ============================================================
 * /job pages ke seoTitle + metaDescription ka EK source of truth —
 * JobDetails (render) aur Admin BROWSE tab ka "Fix missing SEO"
 * bulk gap-fill dono yahi use karte hain.
 *
 * Rules (updateSeoFields jaisa hi):
 *  - Curated (DB me pehle se likha) value hamesha JEETEGI.
 *  - Derived values sirf doc ke apne fields se — koi fact invent nahi.
 */
import { stripHtmlToText } from '@/utils/updateSeoFields';
import type { TimestampLike } from '@/types/firestore';

const META_DESC_MAX = 160;

/** Title/createdAt/current-year se "content year" nikalta hai (title year jeetega). */
export function getContentYear(job: { title?: string; createdAt?: TimestampLike } | null): string {
    const titleYear = String(job?.title || '').match(/\b20\d{2}\b/)?.[0];
    if (titleYear) return titleYear;
    try {
        const ts = job?.createdAt as { seconds?: number; toDate?: () => Date } | undefined;
        const value = ts?.seconds
            ? new Date(ts.seconds * 1000)
            : ts?.toDate
                ? ts.toDate()
                : new Date(job?.createdAt as string);
        if (!Number.isNaN(value.getTime())) return String(value.getFullYear());
    } catch { /* use current year */ }
    return String(new Date().getFullYear());
}

/**
 * Job SEO title builder:
 * 1) seoTitle (curated) → as-is.
 * 2) warna `<title>[ Year][ - N Vacancies] | StudyGyaan` — year/vacancies sirf
 *    tab jab title me pehle se na ho (dup-junk guard: "…Vacancy 2026 - Latest
 *    Vacancies" jaisa repetition kabhi nahi).
 */
export function buildJobSeoTitle(
    seoTitle: string | undefined,
    title: string | undefined,
    contentYear: string | undefined,
    vacancies: string | number | undefined,
): string {
    const curated = String(seoTitle || '').trim();
    if (curated) return curated;

    const rawTitle = String(title || '').trim() || 'Sarkari Job Update';
    const lower = rawTitle.toLowerCase();

    const year = String(contentYear || '').trim();
    const yearPart = year && !rawTitle.includes(year) ? ` ${year}` : '';

    const vac = String(vacancies ?? '').trim();
    const titleAlreadyVacancyish = /vacanc|posts?\b|भर्ती/.test(lower);
    const vacPart = !titleAlreadyVacancyish && vac ? ` - ${vac} Vacancies` : '';

    return `${rawTitle}${yearPart}${vacPart} | StudyGyaan`;
}

interface JobMetaCtx {
    title?: string;
    contentYear?: string;
    organization?: string;
    vacancies?: string | number;
    salary?: string;
    lastDate?: string;
}

/**
 * Job meta description builder (preference order):
 * 1) metaDescription (curated, as-is)
 * 2) shortInfo (plain text)
 * 3) description HTML → tags strip → 160 chars  (raw HTML meta me KABHI nahi)
 * 4) doc-facts se template fallback
 */
export function buildJobMetaDescription(
    metaDescription: string | undefined,
    shortInfo: string | undefined,
    description: string | undefined,
    ctx: JobMetaCtx,
): string {
    const curated = String(metaDescription || '').trim();
    if (curated) return curated;

    const short = String(shortInfo || '').trim();
    if (short) return short.slice(0, META_DESC_MAX);

    const fromHtml = stripHtmlToText(description);
    if (fromHtml) return fromHtml.slice(0, META_DESC_MAX);

    const title = String(ctx.title || '').trim() || 'Sarkari Job';
    const year = String(ctx.contentYear || '').trim();
    const org = String(ctx.organization || '').trim();
    const vac = String(ctx.vacancies ?? '').trim();
    const salary = String(ctx.salary || '').trim();
    const lastDate = String(ctx.lastDate || '').trim();
    return `Apply online for ${title} recruitment ${year}. ${org} - ${vac || 'Various'} vacancies. Check eligibility, salary ₹${salary || 'as per rules'}, last date ${lastDate || 'check notification'}.`.slice(0, META_DESC_MAX);
}

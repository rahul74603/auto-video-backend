/**
 * jobExpiry.ts — 🗓️ Job lastDate se expired check + date parser (shared util)
 * GovtJobs listing wali logic — JobDetails, JobHub, ExamCalendar sab use karte hain.
 */

/** "15-09-2026" / "2026-09-15" / "Sept 15, 2026" → Date | null */
export function parseJobDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const lower = String(dateStr).trim().toLowerCase();
    if (['soon', 'not specified', 'active', 'ongoing', 'n/a', ''].includes(lower)) return null;

    try {
        let parsedDate: Date | null = null;

        // Format 1: DD/MM/YYYY ya DD-MM-YYYY
        const indianFormat = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (indianFormat) {
            parsedDate = new Date(
                parseInt(indianFormat[3], 10),
                parseInt(indianFormat[2], 10) - 1,
                parseInt(indianFormat[1], 10)
            );
        }

        // Format 2: YYYY-MM-DD
        if (!parsedDate) {
            const isoFormat = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoFormat) {
                parsedDate = new Date(
                    parseInt(isoFormat[1], 10),
                    parseInt(isoFormat[2], 10) - 1,
                    parseInt(isoFormat[3], 10)
                );
            }
        }

        // Format 3: "June 30, 2026" / "30 June 2026"
        if (!parsedDate) {
            const textDate = new Date(dateStr);
            if (!isNaN(textDate.getTime())) parsedDate = textDate;
        }

        if (!parsedDate || isNaN(parsedDate.getTime())) return null;
        return parsedDate;
    } catch {
        return null;
    }
}

export function checkIsExpired(lastDateStr: string): boolean {
    const parsedDate = parseJobDate(lastDateStr);
    if (!parsedDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsedDate.setHours(0, 0, 0, 0);

    return parsedDate < today;
}

export type JobLifecycleStatus =
    | 'UPCOMING'
    | 'OPEN'
    | 'CLOSING_SOON'
    | 'CLOSED'
    | 'EXPIRED'
    | 'UNKNOWN';

export function classifyJobLifecycle(
    lastDateStr: string,
    startDateStr?: string,
    now: Date = new Date()
): { status: JobLifecycleStatus; daysUntilLastDate: number | null } {
    const last = parseJobDate(lastDateStr);
    if (!last) return { status: 'UNKNOWN', daysUntilLastDate: null };

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    last.setHours(0, 0, 0, 0);
    const daysUntilLastDate = Math.round((last.getTime() - today.getTime()) / 86400000);

    const start = startDateStr ? parseJobDate(startDateStr) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const daysUntilStart = start ? Math.round((start.getTime() - today.getTime()) / 86400000) : null;

    if (daysUntilLastDate > 7 && daysUntilStart !== null && daysUntilStart > 0) {
        return { status: 'UPCOMING', daysUntilLastDate };
    }
    if (daysUntilLastDate > 7) return { status: 'OPEN', daysUntilLastDate };
    if (daysUntilLastDate >= 0) return { status: 'CLOSING_SOON', daysUntilLastDate };
    if (daysUntilLastDate >= -30) return { status: 'CLOSED', daysUntilLastDate };
    return { status: 'EXPIRED', daysUntilLastDate };
}

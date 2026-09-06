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

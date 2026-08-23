/**
 * jobExpiry.ts — 🗓️ Job lastDate se expired check (shared util)
 * GovtJobs listing wali logic — ab JobDetails page bhi use karta hai.
 */
export function checkIsExpired(lastDateStr: string): boolean {
    if (!lastDateStr) return false;

    const lower = String(lastDateStr).trim().toLowerCase();

    if (
        lower === 'soon' ||
        lower === 'not specified' ||
        lower === 'active' ||
        lower === 'ongoing' ||
        lower === 'n/a' ||
        lower === ''
    ) return false;

    try {
        let parsedDate: Date | null = null;

        // Format 1: DD/MM/YYYY ya DD-MM-YYYY
        const indianFormat = lastDateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (indianFormat) {
            const day = parseInt(indianFormat[1], 10);
            const month = parseInt(indianFormat[2], 10) - 1;
            const year = parseInt(indianFormat[3], 10);
            parsedDate = new Date(year, month, day);
        }

        // Format 2: YYYY-MM-DD
        if (!parsedDate) {
            const isoFormat = lastDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoFormat) {
                const year = parseInt(isoFormat[1], 10);
                const month = parseInt(isoFormat[2], 10) - 1;
                const day = parseInt(isoFormat[3], 10);
                parsedDate = new Date(year, month, day);
            }
        }

        // Format 3: "June 30, 2026"
        if (!parsedDate) {
            const textDate = new Date(lastDateStr);
            if (!isNaN(textDate.getTime())) {
                parsedDate = textDate;
            }
        }

        if (!parsedDate || isNaN(parsedDate.getTime())) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        parsedDate.setHours(0, 0, 0, 0);

        return parsedDate < today;

    } catch {
        return false;
    }
}

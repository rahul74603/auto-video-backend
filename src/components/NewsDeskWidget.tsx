import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Activity, AlertTriangle, FileText, Rocket } from 'lucide-react';

/**
 * NewsDeskWidget — PHASE-2 item 5: automation health at a glance
 * ===============================================================
 * AdminSeoDashboard ke top pe chhota read-only card:
 *  - aaj publish hue jobs / fast-track updates
 *  - drafts queue (job_drafts)
 *  - source failures (sources collection, status=error — source_registry likhta hai)
 * Har query capped + try/catch — dashboard kabhi iski wajah se nahi rukega.
 */

interface NewsDeskStats {
    jobsToday: number;
    updatesToday: number;
    draftsQueue: number;
    sourcesError: number;
}

const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

const safeCount = async (fn: () => Promise<number>) => {
    try {
        return await fn();
    } catch {
        return -1;
    }
};

const NewsDeskWidget = () => {
    const [stats, setStats] = useState<NewsDeskStats | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const today = startOfToday();
            const [jobsToday, updatesToday, draftsQueue, sourcesError] = await Promise.all([
                safeCount(async () => (await getDocs(query(collection(db, 'jobs'), where('createdAt', '>=', today), limit(200)))).size),
                safeCount(async () => (await getDocs(query(collection(db, 'fast_track'), where('createdAt', '>=', today), limit(200)))).size),
                safeCount(async () => (await getDocs(query(collection(db, 'job_drafts'), limit(200)))).size),
                safeCount(async () => (await getDocs(query(collection(db, 'sources'), where('status', '==', 'error'), limit(100)))).size)
            ]);
            if (!cancelled) setStats({ jobsToday, updatesToday, draftsQueue, sourcesError });
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const fmt = (n: number) => (n < 0 ? '—' : String(n));

    const cards = [
        { icon: Rocket, label: 'Jobs published today', value: stats ? fmt(stats.jobsToday) : '…', tone: 'text-blue-600' },
        { icon: Activity, label: 'Updates published today', value: stats ? fmt(stats.updatesToday) : '…', tone: 'text-amber-600' },
        { icon: FileText, label: 'Drafts in queue', value: stats ? fmt(stats.draftsQueue) : '…', tone: 'text-purple-600' },
        { icon: AlertTriangle, label: 'Sources failing', value: stats ? fmt(stats.sourcesError) : '…', tone: 'text-red-600' }
    ];

    return (
        <div className="bg-white border rounded-[2rem] p-5 md:p-6 shadow-sm">
            <h2 className="text-sm font-black flex items-center gap-2 uppercase tracking-widest text-slate-500">
                News Desk — automation health
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                {cards.map((c) => (
                    <div key={c.label} className="border rounded-xl p-3">
                        <c.icon size={16} className={c.tone} />
                        <p className="text-2xl font-black mt-1">{c.value}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{c.label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default NewsDeskWidget;

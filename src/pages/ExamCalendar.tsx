/**
 * ExamCalendar — 📅 Sarkari Exam Calendar (auto-generated)
 * =========================================================
 * Jobs ke lastDate/examDate se khud banta hai:
 *   🔥 Is Hafte Ki Last Dates (urgency!)
 *   📅 Upcoming Last Dates (date-wise sorted)
 *   📝 Upcoming Exam Dates
 * Evergreen page — log bookmark karte hain, roz fresh.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { parseJobDate } from '@/utils/jobExpiry';
import SEO from '@/components/SEO';
import DynamicSidebar from '@/components/DynamicSidebar';
import { CalendarDays, Flame, FileText, Building2, ArrowRight, Users } from 'lucide-react';

type CalJob = {
    id: string;
    title: string;
    slug: string;
    organization: string;
    vacancies: string;
    lastDate: string;
    lastDateObj: Date | null;
    examDate: string;
    examDateObj: Date | null;
};

let calCache: { rows: CalJob[]; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;
const asStr = (v: unknown) => (typeof v === 'string' ? v : '');

async function fetchCalendarJobs(): Promise<CalJob[]> {
    if (calCache && Date.now() - calCache.at < CACHE_MS) return calCache.rows;
    const snap = await getDocs(query(collection(db, 'jobs'), orderBy('createdAt', 'desc'), limit(150)));
    const rows: CalJob[] = [];
    snap.docs.forEach((d) => {
        const j = d.data() as Record<string, unknown>;
        const type = asStr(j.type).toUpperCase();
        if (type && type !== 'JOB') return;
        if (j.isLive === false) return;
        const status = asStr(j.status).toLowerCase();
        if (['draft', 'pending', 'archived', 'deleted'].includes(status)) return;
        const title = asStr(j.title);
        if (!title) return;
        rows.push({
            id: d.id,
            title,
            slug: asStr(j.slug) || d.id,
            organization: asStr(j.organization),
            vacancies: asStr(j.vacancies),
            lastDate: asStr(j.lastDate),
            lastDateObj: parseJobDate(asStr(j.lastDate)),
            examDate: asStr(j.examDate),
            examDateObj: parseJobDate(asStr(j.examDate)),
        });
    });
    calCache = { rows, at: Date.now() };
    return rows;
}

const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const daysLeft = (d: Date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
};

const JobRow = ({ job, date, urgent }: { job: CalJob; date: Date; urgent?: boolean }) => {
    const left = daysLeft(date);
    return (
        <Link
            to={`/job/${job.slug}`}
            className={`group flex items-center gap-3 bg-white rounded-2xl border p-3.5 md:p-4 transition-all hover:shadow-lg ${urgent ? 'border-red-100 hover:border-red-300' : 'border-slate-100 hover:border-blue-200'}`}
        >
            <div className={`shrink-0 w-14 md:w-16 text-center rounded-xl py-2 ${urgent ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'}`}>
                <p className="text-lg md:text-xl font-black leading-none">{date.getDate()}</p>
                <p className="text-[9px] md:text-[10px] font-black uppercase">{date.toLocaleDateString('en-IN', { month: 'short' })}</p>
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-black text-slate-800 text-[12px] md:text-sm leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
                    {job.title}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[9px] md:text-[10px] font-bold text-slate-400">
                    {job.organization && <span className="flex items-center gap-1"><Building2 size={10} />{job.organization}</span>}
                    {job.vacancies && <span className="flex items-center gap-1 text-emerald-600"><Users size={10} />{job.vacancies} Posts</span>}
                    <span className={`font-black ${urgent ? 'text-red-500' : left <= 7 ? 'text-orange-500' : 'text-slate-400'}`}>
                        {left === 0 ? '⏰ AAJ LAST DATE!' : left === 1 ? '⏰ Kal last date' : `${left} din bache`}
                    </span>
                </div>
            </div>
            <ArrowRight size={15} className="shrink-0 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
        </Link>
    );
};

const ExamCalendar = () => {
    const [rows, setRows] = useState<CalJob[]>(calCache?.rows || []);
    const [loading, setLoading] = useState(!calCache);

    useEffect(() => {
        let cancelled = false;
        fetchCalendarJobs()
            .then((r) => { if (!cancelled) { setRows(r); setLoading(false); } })
            .catch(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const { thisWeek, upcoming, exams } = useMemo(() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const week = new Date(today.getTime() + 7 * 86400000);

        const withLast = rows
            .filter((j) => j.lastDateObj && j.lastDateObj >= today)
            .sort((a, b) => (a.lastDateObj!.getTime() - b.lastDateObj!.getTime()));

        return {
            thisWeek: withLast.filter((j) => j.lastDateObj! <= week),
            upcoming: withLast.filter((j) => j.lastDateObj! > week).slice(0, 25),
            exams: rows
                .filter((j) => j.examDateObj && j.examDateObj >= today)
                .sort((a, b) => (a.examDateObj!.getTime() - b.examDateObj!.getTime()))
                .slice(0, 15),
        };
    }, [rows]);

    const year = new Date().getFullYear();

    return (
        <div className="bg-slate-50 min-h-screen py-4 md:py-8">
            <SEO
                customTitle={`Sarkari Exam Calendar ${year}: Govt Job Last Dates & Exam Dates`}
                customDescription={`Sarkari exam calendar ${year} — is hafte ki last dates, upcoming govt job deadlines aur exam dates ek jagah. Roz auto-update hota hai.`}
            />
            <div className="max-w-6xl mx-auto px-3 md:px-4">
                {/* Header */}
                <div className="bg-gradient-to-br from-indigo-700 via-purple-800 to-slate-900 rounded-2xl md:rounded-[2rem] p-5 md:p-8 text-white mb-5 md:mb-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <CalendarDays size={110} aria-hidden="true" />
                    </div>
                    <p className="text-yellow-300 font-black text-[10px] md:text-xs uppercase tracking-widest mb-1.5">📅 StudyGyaan</p>
                    <h1 className="text-lg md:text-3xl font-black leading-tight">Sarkari Exam Calendar {year} — Last Dates & Exam Dates</h1>
                    <p className="mt-2 text-purple-100 text-[11px] md:text-sm font-bold">
                        {thisWeek.length} bhartiyon ki last date is hafte · Roz auto-update ✅
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        {loading ? (
                            <div className="py-16 flex flex-col items-center">
                                <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent mb-3"></div>
                                <p className="font-black text-blue-600 uppercase tracking-widest text-xs">Loading Calendar...</p>
                            </div>
                        ) : (
                            <>
                                {/* 🔥 This week */}
                                <section>
                                    <h2 className="text-sm md:text-lg font-black text-red-600 uppercase tracking-wide flex items-center gap-2 mb-3">
                                        <Flame size={18} /> Is Hafte Ki Last Dates — Jaldi Karo!
                                    </h2>
                                    {thisWeek.length ? (
                                        <div className="space-y-2.5">
                                            {thisWeek.map((j) => <JobRow key={j.id} job={j} date={j.lastDateObj!} urgent />)}
                                        </div>
                                    ) : (
                                        <p className="bg-white rounded-2xl border border-slate-100 p-5 text-xs font-bold text-slate-400">
                                            Is hafte koi last date nahi — niche upcoming dekho 👇
                                        </p>
                                    )}
                                </section>

                                {/* 📅 Upcoming */}
                                <section>
                                    <h2 className="text-sm md:text-lg font-black text-blue-700 uppercase tracking-wide flex items-center gap-2 mb-3">
                                        <CalendarDays size={18} /> Aane Wali Last Dates
                                    </h2>
                                    {upcoming.length ? (
                                        <div className="space-y-2.5">
                                            {upcoming.map((j) => <JobRow key={j.id} job={j} date={j.lastDateObj!} />)}
                                        </div>
                                    ) : (
                                        <p className="bg-white rounded-2xl border border-slate-100 p-5 text-xs font-bold text-slate-400">
                                            Abhi aur koi upcoming deadline nahi.
                                        </p>
                                    )}
                                </section>

                                {/* 📝 Exam dates */}
                                {exams.length > 0 && (
                                    <section>
                                        <h2 className="text-sm md:text-lg font-black text-emerald-700 uppercase tracking-wide flex items-center gap-2 mb-3">
                                            <FileText size={18} /> Upcoming Exam Dates
                                        </h2>
                                        <div className="space-y-2.5">
                                            {exams.map((j) => <JobRow key={`e-${j.id}`} job={j} date={j.examDateObj!} />)}
                                        </div>
                                    </section>
                                )}

                                <p className="text-[10px] font-bold text-slate-400 bg-white rounded-xl border border-slate-100 p-3">
                                    ℹ️ Dates official notifications se AI-extract hoti hain — apply se pehle official notification me confirm zaroor karein.
                                    Exact date: {fmtDate(new Date())} tak updated.
                                </p>
                            </>
                        )}
                    </div>

                    <aside className="space-y-4">
                        <DynamicSidebar />
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default ExamCalendar;

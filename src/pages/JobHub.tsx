/**
 * JobHub — 🎯 Programmatic SEO landing pages (/jobs/10th-pass, /jobs/mp ...)
 * ==========================================================================
 * Search intent wale pages: "10th pass govt job", "mp govt jobs" etc.
 * Jobs existing data se AUTO-FILTER — active pehle, expired dim.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { JOB_HUBS, findHub, hubMatches } from '@/config/jobHubs';
import { checkIsExpired } from '@/utils/jobExpiry';
import SEO from '@/components/SEO';
import DynamicSidebar from '@/components/DynamicSidebar';
import { Briefcase, CalendarDays, Building2, ArrowRight, Users } from 'lucide-react';
import { ROUTES } from '@/config/routes';

type HubJob = {
    id: string;
    title: string;
    slug: string;
    organization: string;
    lastDate: string;
    vacancies: string;
    expired: boolean;
};

/* Module-level cache — hub pages ke beech navigation pe re-fetch nahi */
let jobsCache: { rows: Array<Record<string, unknown> & { id: string }>; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

const asStr = (v: unknown) => (typeof v === 'string' ? v : '');

async function fetchJobsOnce() {
    if (jobsCache && Date.now() - jobsCache.at < CACHE_MS) return jobsCache.rows;
    const snap = await getDocs(query(collection(db, 'jobs'), orderBy('createdAt', 'desc'), limit(150)));
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    jobsCache = { rows, at: Date.now() };
    return rows;
}

const JobHub = () => {
    const { hubSlug = '' } = useParams();
    const hub = findHub(hubSlug);
    const [rows, setRows] = useState<Array<Record<string, unknown> & { id: string }>>(jobsCache?.rows || []);
    const [loading, setLoading] = useState(!jobsCache);

    useEffect(() => {
        let cancelled = false;
        fetchJobsOnce()
            .then((r) => { if (!cancelled) { setRows(r); setLoading(false); } })
            .catch(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const { active, expired } = useMemo(() => {
        if (!hub) return { active: [] as HubJob[], expired: [] as HubJob[] };
        const act: HubJob[] = [];
        const exp: HubJob[] = [];
        for (const j of rows) {
            const type = asStr(j.type).toUpperCase();
            if (type && type !== 'JOB') continue;
            if (j.isLive === false) continue;
            const status = asStr(j.status).toLowerCase();
            if (['draft', 'pending', 'archived', 'deleted'].includes(status)) continue;
            const title = asStr(j.title);
            if (!title) continue;
            const haystack = `${title} ${asStr(j.qualification)} ${asStr(j.location)} ${asStr(j.category)} ${asStr(j.organization)}`;
            if (!hubMatches(hub, haystack)) continue;
            const item: HubJob = {
                id: j.id,
                title,
                slug: asStr(j.slug) || j.id,
                organization: asStr(j.organization),
                lastDate: asStr(j.lastDate),
                vacancies: asStr(j.vacancies),
                expired: checkIsExpired(asStr(j.lastDate)),
            };
            (item.expired ? exp : act).push(item);
        }
        return { active: act, expired: exp.slice(0, 5) };
    }, [rows, hub]);

    if (!hub) return <Navigate to={ROUTES.govtJobs} replace />;

    const otherHubs = JOB_HUBS.filter((h) => h.slug !== hub.slug);

    return (
        <div className="bg-slate-50 min-h-screen py-4 md:py-8">
            <SEO customTitle={hub.seoTitle} customDescription={hub.metaDescription} />
            <div className="max-w-6xl mx-auto px-3 md:px-4">
                {/* Header */}
                <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 rounded-2xl md:rounded-[2rem] p-5 md:p-8 text-white mb-5 md:mb-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <Briefcase size={110} aria-hidden="true" />
                    </div>
                    <p className="text-yellow-300 font-black text-[10px] md:text-xs uppercase tracking-widest mb-1.5">
                        {hub.emoji} StudyGyaan Job Hub
                    </p>
                    <h1 className="text-lg md:text-3xl font-black leading-tight">{hub.h1}</h1>
                    <p className="mt-2 text-blue-100 text-[11px] md:text-sm font-bold">
                        {active.length} Active Bhartiyan · Roz auto-update hota hai ✅
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-8">
                    {/* Jobs list */}
                    <div className="lg:col-span-2 space-y-3 md:space-y-4">
                        {loading ? (
                            <div className="py-16 flex flex-col items-center">
                                <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent mb-3"></div>
                                <p className="font-black text-blue-600 uppercase tracking-widest text-xs">Loading Jobs...</p>
                            </div>
                        ) : active.length === 0 ? (
                            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100">
                                <p className="font-black text-slate-700">Abhi is category me koi active bharti nahi hai</p>
                                <Link to={ROUTES.govtJobs} className="inline-flex items-center gap-1 mt-3 text-blue-600 font-black text-sm hover:underline">
                                    Sabhi Latest Jobs Dekhein <ArrowRight size={14} />
                                </Link>
                            </div>
                        ) : (
                            active.map((job) => (
                                <Link
                                    key={job.id}
                                    to={ROUTES.job(job.slug)}
                                    className="group block bg-white rounded-2xl border border-slate-100 hover:border-blue-200 shadow-sm hover:shadow-lg transition-all p-4 md:p-5 relative overflow-hidden"
                                >
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 group-hover:w-1.5 transition-all" />
                                    <h2 className="font-black text-slate-800 text-sm md:text-base leading-snug group-hover:text-blue-700 transition-colors pr-6">
                                        {job.title}
                                    </h2>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5 text-[10px] md:text-xs font-bold text-slate-500">
                                        {job.organization && (
                                            <span className="flex items-center gap-1"><Building2 size={12} className="text-slate-400" />{job.organization}</span>
                                        )}
                                        {job.vacancies && (
                                            <span className="flex items-center gap-1 text-emerald-600"><Users size={12} />{job.vacancies} Posts</span>
                                        )}
                                        {job.lastDate && (
                                            <span className="flex items-center gap-1 text-orange-600"><CalendarDays size={12} />Last Date: {job.lastDate}</span>
                                        )}
                                    </div>
                                    <ArrowRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                                </Link>
                            ))
                        )}

                        {/* Recently closed (thin, dimmed) */}
                        {expired.length > 0 && (
                            <div className="pt-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Recently Band Hui Bhartiyan</p>
                                {expired.map((job) => (
                                    <Link key={job.id} to={ROUTES.job(job.slug)} className="block py-2 px-3 rounded-xl hover:bg-white text-[11px] md:text-xs font-bold text-slate-400 line-through decoration-slate-300">
                                        {job.title}
                                    </Link>
                                ))}
                            </div>
                        )}

                        {/* Other hubs — internal linking */}
                        <div className="bg-white rounded-2xl border border-slate-100 p-4 md:p-5 mt-4">
                            <p className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest mb-3">🎯 Dusri Categories Explore Karein</p>
                            <div className="flex flex-wrap gap-2">
                                <Link
                                    to={ROUTES.examCalendar}
                                    className="px-3 py-1.5 bg-purple-600 text-white rounded-xl text-[10px] md:text-xs font-black transition-all hover:bg-purple-700"
                                >
                                    📅 Exam Calendar
                                </Link>
                                {otherHubs.map((h) => (
                                    <Link
                                        key={h.slug}
                                        to={ROUTES.jobHub(h.slug)}
                                        className="px-3 py-1.5 bg-slate-50 hover:bg-blue-600 hover:text-white text-slate-600 rounded-xl text-[10px] md:text-xs font-black transition-all border border-slate-100"
                                    >
                                        {h.emoji} {h.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <aside className="space-y-4">
                        <DynamicSidebar />
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default JobHub;

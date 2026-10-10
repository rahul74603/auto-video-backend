import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    collection, query, where, orderBy, limit, getDocs,
    doc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { toDateSafe, type TimestampLike } from '@/types/firestore';
import { Zap, RefreshCw, Download, ExternalLink, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

/* =====================================================================
   ⚡ FAST TRACK DRAFTS — approval se PEHLE review queue
   USER (2026-10-10): "jobs scraper jaisa fast track bhi draft me dikhe,
   approval se pehle" → scraper jo drafts banata hai wo yahan JOBS AI tab
   me turant dikhte hain: Approve (publish) / Delete / Full manager kholo.
   ===================================================================== */

type FastTrackDraft = {
    id: string;
    title?: string;
    category?: string;
    shortInfo?: string;
    createdAt?: TimestampLike;
    status?: string;
};

// FastTrackManager wala hi manual-fetch endpoint (header auth)
const FETCH_URL = 'https://us-central1-studymaterial-406ad.cloudfunctions.net/fetchFastTrackUpdates';

const AdminFastTrackDrafts = () => {
    const [drafts, setDrafts] = useState<FastTrackDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [fetchingNew, setFetchingNew] = useState(false);
    const navigate = useNavigate();

    const loadDrafts = useCallback(async () => {
        const snap = await getDocs(query(
            collection(db, 'fast_track'),
            where('status', '==', 'draft'),
            orderBy('createdAt', 'desc'),
            limit(50),
        ));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }) as FastTrackDraft);
    }, []);

    useEffect(() => {
        let cancelled = false;
        loadDrafts()
            .then(data => { if (!cancelled) setDrafts(data); })
            .catch(err => {
                console.error('FastTrack drafts load error:', err);
                if (!cancelled) toast.error('Fast Track drafts load nahi hue');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [loadDrafts]);

    // ✅ APPROVE — seedha publish (FastTrackManager jaisa hi: status + publishedAt)
    const handleApprove = async (item: FastTrackDraft) => {
        if (!window.confirm(`Publish karein?\n"${item.title}"`)) return;
        setBusyId(item.id);
        try {
            await updateDoc(doc(db, 'fast_track', item.id), {
                status: 'published',
                publishedAt: serverTimestamp(),
            });
            setDrafts(prev => prev.filter(d => d.id !== item.id));
            toast.success('✅ Published! Site + Telegram pe chala gaya.');
        } catch (err) {
            console.error(err);
            toast.error('Approve fail hua');
        } finally {
            setBusyId(null);
        }
    };

    // 🗑️ DELETE
    const handleDelete = async (item: FastTrackDraft) => {
        if (!window.confirm(`Delete karein?\n"${item.title}"`)) return;
        setBusyId(item.id);
        try {
            await deleteDoc(doc(db, 'fast_track', item.id));
            setDrafts(prev => prev.filter(d => d.id !== item.id));
            toast.success('Draft deleted');
        } catch (err) {
            console.error(err);
            toast.error('Delete fail hua');
        } finally {
            setBusyId(null);
        }
    };

    // 📡 SCRAPER KO ABHI CHALAO — nayi drafts yahan aa jayengi
    const handleFetchNew = async () => {
        if (fetchingNew) return;
        setFetchingNew(true);
        try {
            const res = await fetch(FETCH_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-key': localStorage.getItem('sg_admin_token') || 'StudyGyaan_FastTrack_786',
                },
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`✅ ${data.count || 0} nayi updates mili — list refresh ho rahi hai`);
                setDrafts(await loadDrafts());
            } else {
                toast.error('⚠️ ' + (data.error || 'Fetch fail hua'));
            }
        } catch (err) {
            console.error(err);
            toast.error('Fetch error — baad me try karo');
        } finally {
            setFetchingNew(false);
        }
    };

    const openManager = () => navigate('/secret-admin', { state: { activeTab: 'FAST TRACK' } });

    return (
        <div className="bg-white rounded-[2rem] shadow-lg border border-amber-100 p-5 md:p-6 font-hindi">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                <div>
                    <h3 className="font-black text-slate-800 text-lg uppercase flex items-center gap-2">
                        <Zap size={18} className="text-amber-500" />
                        Fast Track Drafts
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                            {loading ? '…' : drafts.length} pending
                        </span>
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Scraper ne ye updates pakdi hain — approval se pehle review karo (jobs drafts jaisa)
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { setLoading(true); loadDrafts().then(setDrafts).catch(() => toast.error('Reload fail')).finally(() => setLoading(false)); }}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                    >
                        <RefreshCw size={12} /> Refresh
                    </button>
                    <button
                        onClick={handleFetchNew}
                        disabled={fetchingNew}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-100 transition-all disabled:opacity-50"
                    >
                        {fetchingNew ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        Nayi Updates Lao
                    </button>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-amber-500" /></div>
            ) : drafts.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-bold italic text-sm">
                    Koi fast track draft pending nahi — scraper chalne par yahan dikhegi ✅
                </div>
            ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {drafts.map(item => (
                        <div key={item.id} className="flex flex-col md:flex-row md:items-center gap-3 bg-amber-50/60 border border-amber-100 rounded-2xl p-4">
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-slate-800 text-sm truncate">{item.title || '(no title)'}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                                    {item.category || 'update'} · {toDateSafe(item.createdAt)?.toLocaleString() ?? 'abhi'}
                                </p>
                                {item.shortInfo && (
                                    <p className="text-xs text-slate-500 font-medium mt-1 line-clamp-2">{item.shortInfo}</p>
                                )}
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={() => handleApprove(item)}
                                    disabled={busyId === item.id}
                                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-green-600 text-white hover:bg-green-700 transition-all disabled:opacity-50"
                                >
                                    {busyId === item.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                    Approve
                                </button>
                                <button
                                    onClick={openManager}
                                    title="FAST TRACK tab me full edit karo"
                                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
                                >
                                    <ExternalLink size={12} /> Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(item)}
                                    disabled={busyId === item.id}
                                    className="p-2 rounded-xl bg-white text-red-500 border border-red-100 hover:bg-red-50 transition-all disabled:opacity-50"
                                    aria-label="Delete draft"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminFastTrackDrafts;

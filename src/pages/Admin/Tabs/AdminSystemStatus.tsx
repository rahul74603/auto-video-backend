import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Activity, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';

/* =====================================================================
   🟢 SYSTEM STATUS — "kab kya karta hai, chala ya nahi, farak pada ya nahi"
   USER (2026-10-07): "admin me kuch samajh nahi aata, learner/audit faltu
   pade hain" → ye tab har automation ko 1 line me dikhata hai:
   naam + kaam + aakhri run + result. Jo chalta hai ✅, jo kabhi nahi chala ❌.
   ===================================================================== */

type RowState = {
  key: string;
  name: string;
  kaam: string;           // plain Hindi: ye kya karta hai
  state: 'loading' | 'ok' | 'stale' | 'never';
  last?: string;          // "12 min pehle"
  detail?: string;        // result: kitne jobs/sets/errors
};

const timeAgo = (v: unknown): string | null => {
  let ms: number | null = null;
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') {
    ms = (v as { toDate: () => Date }).toDate().getTime();
  } else if (typeof v === 'string') {
    ms = Date.parse(v);
  } else if (typeof v === 'number') {
    ms = v;
  }
  if (!ms || Number.isNaN(ms)) return null;
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins} min pehle`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} ghante pehle`;
  return `${Math.round(mins / 1440)} din pehle`;
};

const minsOf = (v: unknown): number | null => {
  const t = timeAgo(v);
  if (!t) return null;
  if (t.includes('min')) return parseInt(t);
  if (t.includes('ghante')) return parseInt(t) * 60;
  if (t.includes('din')) return parseInt(t) * 1440;
  return 0;
};

const AdminSystemStatus = () => {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const next: RowState[] = [];
    const grab = async (coll: string, id: string) => {
      try {
        const s = await getDoc(doc(db, coll, id));
        return s.exists() ? (s.data() as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };

    const [scraper, fasttrack, sets, seo, growth, ftDrafts, radar] = await Promise.all([
      grab('system_configs', 'scraper_status'),
      grab('system_configs', 'fasttrack_status'),
      grab('system_settings', 'auto_premium_sets'),
      grab('system_settings', 'seo_intelligence'),
      grab('growth_insights', 'latest'),
      // ⚡ kitni fast track drafts approval ke intezar me hain (JOBS AI tab me review hoti hain)
      (async () => {
        try {
          const s = await getDocs(query(collection(db, 'fast_track'), where('status', '==', 'draft'), limit(100)));
          return s.size;
        } catch {
          return -1;
        }
      })(),
      grab('system_configs', 'trending_radar'),
    ]);

    // 1) Jobs scraper
    {
      const last = timeAgo(scraper?.lastRun);
      const m = minsOf(scraper?.lastRun);
      next.push({
        key: 'jobs',
        name: '🔎 Jobs Scraper',
        kaam: 'Sarkari sites se nayi jobs utha ke site + Telegram pe dalta hai',
        state: !scraper ? 'never' : m !== null && m > 60 * 36 ? 'stale' : 'ok',
        last: last || undefined,
        detail: scraper ? `${scraper.status ?? '—'} · last run me ${scraper.lastCount ?? 0} jobs check` : undefined,
      });
    }
    // 2) FastTrack
    {
      const last = timeAgo(fasttrack?.lastRun);
      const m = minsOf(fasttrack?.lastRun);
      next.push({
        key: 'ft',
        name: '⚡ FastTrack Updates',
        kaam: 'Result / Admit Card / Answer Key updates site + Telegram pe',
        // drafts pending = action chahiye → amber dikhe
        state: !fasttrack ? 'never' : (ftDrafts as number) > 0 || (m !== null && m > 60 * 36) ? 'stale' : 'ok',
        last: last || undefined,
        detail: fasttrack
          ? `last run me ${fasttrack.lastCount ?? 0} updates${(ftDrafts as number) >= 0 ? ` · 🟡 ${ftDrafts} draft(s) review pending (JOBS AI tab)` : ''}`
          : undefined,
      });
    }
    // 2.5) Trending Radar
    {
      const r = (radar ?? {}) as Record<string, unknown>;
      const last = timeAgo(r.lastRun);
      const m = minsOf(r.lastRun);
      const queueLen = Array.isArray(r.blogQueue) ? (r.blogQueue as unknown[]).length : 0;
      const topPick = Array.isArray(r.lastPicks) ? ((r.lastPicks as string[])[0] ?? '—') : '—';
      next.push({
        key: 'radar',
        name: '📡 Trending Radar',
        kaam: 'GSC + official feeds se trending topics khud dhundta hai, blog queue me daalta hai',
        state: !r.lastRun ? 'never' : m !== null && m > 60 * 30 ? 'stale' : 'ok',
        last: last || undefined,
        detail: r.lastRun ? `blog queue: ${queueLen} · top pick: ${topPick}` : undefined,
      });
    }
    // 3) Premium sets
    {
      const last = timeAgo(sets?.lastRunAt);
      const m = minsOf(sets?.lastRunAt);
      next.push({
        key: 'sets',
        name: '📦 Premium Sets (roz 2)',
        kaam: 'Har exam ke course me practice sets auto banata hai (1 per timer)',
        state: !sets?.lastRunAt ? 'never' : m !== null && m > 60 * 30 ? 'stale' : 'ok',
        last: last || undefined,
        detail: sets?.lastRunAt ? `${sets.lastSets ?? 0} set bane · ${sets.lastErrors ?? 0} errors · mode: ${sets.lastMode ?? 'exam'} · paid-lite fallback: ${sets.lastPaid ? 'HAAN (₹)' : 'nahi (free)'}` : undefined,
      });
    }
    // 4) SEO master
    {
      const last = timeAgo(seo?.lastRunAt);
      const m = minsOf(seo?.lastRunAt);
      next.push({
        key: 'seo',
        name: '🧠 SEO Master',
        kaam: 'Sitemaps / meta / OG refresh + site audits (6-hourly + daily)',
        state: !seo?.lastRunAt ? 'never' : m !== null && m > 60 * 30 ? 'stale' : 'ok',
        last: last || undefined,
        detail: seo?.lastRunAt ? 'last report Firestore seo_intelligence me' : undefined,
      });
    }
    // 5) Growth learner
    {
      const last = timeAgo(growth?.analyzedAt);
      const patterns = Array.isArray(growth?.patterns) ? (growth?.patterns as unknown[]).length : 0;
      next.push({
        key: 'growth',
        name: '📈 Growth Learner',
        kaam: 'YouTube performance dekh ke seekhta hai kya chalta hai (videos better banane)',
        state: !growth?.analyzedAt ? 'never' : patterns > 0 ? 'ok' : 'stale',
        last: last || undefined,
        detail: growth?.analyzedAt ? `${patterns} patterns seekhe` : 'abhi data jama ho raha hai (YouTube views aane ke baad seekhega)',
      });
    }

    setRows(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="p-2 md:p-3 rounded-xl bg-emerald-50 text-emerald-600"><Activity className="w-5 h-5 md:w-6 md:h-6" /></span>
          <div>
            <h2 className="font-black text-gray-800 text-base md:text-xl">System Status</h2>
            <p className="text-[10px] md:text-xs text-gray-400 font-bold">
              Har automation ek nazar me — kab chala, kya kiya. ❌ = kabhi nahi chala (deploy/setup baaki) · ⚠️ = kaafi der se nahi chala
            </p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-xl bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 shrink-0" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {rows.map((r) => (
        <div key={r.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 flex items-start md:items-center gap-3 md:gap-4">
          <div className="shrink-0 mt-0.5 md:mt-0">
            {r.state === 'loading' ? <RefreshCw className="w-5 h-5 text-gray-300 animate-spin" /> :
             r.state === 'ok' ? <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-emerald-500" /> :
             r.state === 'stale' ? <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-amber-500" /> :
             <XCircle className="w-5 h-5 md:w-6 md:h-6 text-red-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 md:gap-x-3">
              <h3 className="font-black text-gray-800 text-sm md:text-base">{r.name}</h3>
              {r.last && <span className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-wide">{r.last}</span>}
            </div>
            <p className="text-[11px] md:text-sm text-gray-500 font-medium">{r.kaam}</p>
            {r.detail && <p className="text-[10px] md:text-xs text-gray-400 font-bold mt-0.5">→ {r.detail}</p>}
            {r.state === 'never' && (
              <p className="text-[10px] md:text-xs text-red-400 font-bold mt-0.5">
                Abhi tak kabhi nahi chala — functions deploy / workflow setup baaki hai.
              </p>
            )}
          </div>
        </div>
      ))}

      {loading && rows.length === 0 && (
        <div className="text-center text-gray-400 font-bold text-xs py-10">Status padha ja raha hai…</div>
      )}
    </div>
  );
};

export default AdminSystemStatus;

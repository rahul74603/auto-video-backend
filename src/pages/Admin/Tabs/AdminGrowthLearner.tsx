import { useState, useEffect, useCallback } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, limit, query } from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
  Brain,
  RefreshCw,
  Target,
  Zap,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FlaskConical,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types — mirrors ai_backend/agents/growth/learning/policy_store.js   */
/* ------------------------------------------------------------------ */

interface PolicyDimension {
  dimension: string;
  platform: string;
  winningPattern: string;
  averagePerformanceScore?: number;
  sampleSize: number;
  recentSampleSize?: number;
  exploredSampleSize?: number;
  confidence: number;
  distinctBuckets?: number;
  margin?: number | null;
  targetSeconds?: number | null;
  category?: string | null;
  lastUpdatedIso?: string;
  minSamples?: number;
  confidenceThreshold?: number;
}

interface LearnedPolicy {
  version: string;
  generatedAt?: number;
  generatedAtIso?: string;
  generator?: string;
  exploitStrategy?: Record<string, number>;
  platforms: Record<string, { platform: string; dimensions: Record<string, PolicyDimension> }>;
  stats?: { patternCount?: number; platforms?: string[]; sourcePatternCount?: number };
}

interface Insight {
  patterns: Array<{
    patternType: string;
    platform: string;
    winningPattern: string;
    confidence: number;
    sampleSize: number;
    recentSampleSize?: number;
    exploredSampleSize?: number;
    averageScore?: number;
  }>;
  analyzedAt: number;
  sampleSize: number;
  windowDays?: number;
}

interface RecommendationItem {
  action: string;
  patternType: string;
  platform: string;
  confidence: number;
  sampleSize: number;
  reason: string;
}

interface PerfRecord {
  id: string;
  platform: string;
  collectedAt?: number;
  performanceScore?: number | null;
  learningUsed?: boolean;
  exploredDimensions?: string[];
  attribution: {
    hookType: boolean;
    presenter: boolean;
    visualStyle: boolean;
    duration: boolean;
    contentAngle: boolean;
    music: boolean;
    cta: boolean;
    category: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asPolicyDimension(dim: string, platform: string, value: unknown): PolicyDimension | null {
  if (!isPlainObject(value)) return null;
  return {
    dimension: dim,
    platform,
    winningPattern: typeof value.winningPattern === 'string' ? value.winningPattern : '—',
    averagePerformanceScore: typeof value.averagePerformanceScore === 'number' ? value.averagePerformanceScore : undefined,
    sampleSize: typeof value.sampleSize === 'number' ? value.sampleSize : 0,
    recentSampleSize: typeof value.recentSampleSize === 'number' ? value.recentSampleSize : 0,
    exploredSampleSize: typeof value.exploredSampleSize === 'number' ? value.exploredSampleSize : 0,
    confidence: typeof value.confidence === 'number' ? value.confidence : 0,
    distinctBuckets: typeof value.distinctBuckets === 'number' ? value.distinctBuckets : undefined,
    margin: typeof value.margin === 'number' ? value.margin : null,
    targetSeconds: typeof value.targetSeconds === 'number' ? value.targetSeconds : null,
    category: typeof value.category === 'string' ? value.category : null,
    lastUpdatedIso: typeof value.lastUpdatedIso === 'string' ? value.lastUpdatedIso : undefined,
    minSamples: typeof value.minSamples === 'number' ? value.minSamples : undefined,
    confidenceThreshold: typeof value.confidenceThreshold === 'number' ? value.confidenceThreshold : undefined,
  };
}

function parsePolicy(data: unknown): LearnedPolicy | null {
  if (!isPlainObject(data) || !isPlainObject(data.platforms)) return null;
  const platforms: LearnedPolicy['platforms'] = {};
  for (const [platformName, platformValue] of Object.entries(data.platforms)) {
    if (!isPlainObject(platformValue) || !isPlainObject(platformValue.dimensions)) continue;
    const dimensions: Record<string, PolicyDimension> = {};
    for (const [dimName, dimValue] of Object.entries(platformValue.dimensions)) {
      const parsed = asPolicyDimension(dimName, platformName, dimValue);
      if (parsed) dimensions[dimName] = parsed;
    }
    platforms[platformName] = { platform: platformName, dimensions };
  }
  return {
    version: typeof data.version === 'string' ? data.version : 'unknown',
    generatedAt: typeof data.generatedAt === 'number' ? data.generatedAt : undefined,
    generatedAtIso: typeof data.generatedAtIso === 'string' ? data.generatedAtIso : undefined,
    generator: typeof data.generator === 'string' ? data.generator : undefined,
    exploitStrategy: isPlainObject(data.exploitStrategy)
      ? (Object.fromEntries(
          Object.entries(data.exploitStrategy).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
        ) as Record<string, number>)
      : undefined,
    platforms,
    stats: isPlainObject(data.stats)
      ? {
          patternCount: typeof data.stats.patternCount === 'number' ? data.stats.patternCount : undefined,
          platforms: Array.isArray(data.stats.platforms)
            ? data.stats.platforms.filter((p): p is string => typeof p === 'string')
            : undefined,
        }
      : undefined,
  };
}

function fmtDate(ms: number | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function fmtConfidence(c: number): string {
  return `${Math.round(c * 100)}%`;
}

/* Applied dimensions = everything generation consumes. postTime is learned
   but the upload flow publishes immediately — shown as NOT applied. */
const NOT_APPLIED_DIMENSIONS = new Set(['postTime', 'category']);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function AdminGrowthLearner() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<LearnedPolicy | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [perf, setPerf] = useState<PerfRecord[]>([]);

  const fetchAll = useCallback(async () => {
    const [policySnap, insightSnap, recSnap, perfSnap] = await Promise.all([
        getDoc(doc(db, 'growth_policies', 'latest')),
        getDoc(doc(db, 'growth_insights', 'latest')),
        getDoc(doc(db, 'growth_recommendations', 'latest')),
        getDocs(query(collection(db, 'content_performance'), orderBy('collectedAt', 'desc'), limit(200))),
      ]);

      const parsedPolicy: LearnedPolicy | null = policySnap.exists() ? parsePolicy(policySnap.data()) : null;
      let parsedInsight: Insight | null = null;
      let parsedRecs: RecommendationItem[] = [];

      if (insightSnap.exists() && isPlainObject(insightSnap.data())) {
        const raw = insightSnap.data();
        parsedInsight = {
          patterns: Array.isArray(raw.patterns)
            ? raw.patterns
                .filter(isPlainObject)
                .map((p) => ({
                  patternType: typeof p.patternType === 'string' ? p.patternType : '',
                  platform: typeof p.platform === 'string' ? p.platform : '',
                  winningPattern: typeof p.winningPattern === 'string' ? p.winningPattern : '',
                  confidence: typeof p.confidence === 'number' ? p.confidence : 0,
                  sampleSize: typeof p.sampleSize === 'number' ? p.sampleSize : 0,
                  recentSampleSize: typeof p.recentSampleSize === 'number' ? p.recentSampleSize : 0,
                  exploredSampleSize: typeof p.exploredSampleSize === 'number' ? p.exploredSampleSize : 0,
                  averageScore: typeof p.averageScore === 'number' ? p.averageScore : undefined,
                }))
            : [],
          analyzedAt: typeof raw.analyzedAt === 'number' ? raw.analyzedAt : 0,
          sampleSize: typeof raw.sampleSize === 'number' ? raw.sampleSize : 0,
          windowDays: typeof raw.windowDays === 'number' ? raw.windowDays : undefined,
        };
      }

      if (recSnap.exists() && isPlainObject(recSnap.data())) {
        const raw = recSnap.data();
        parsedRecs = Array.isArray(raw.recommendations)
          ? raw.recommendations
              .filter(isPlainObject)
              .map((r) => ({
                action: typeof r.action === 'string' ? r.action : '',
                patternType: typeof r.patternType === 'string' ? r.patternType : '',
                platform: typeof r.platform === 'string' ? r.platform : '',
                confidence: typeof r.confidence === 'number' ? r.confidence : 0,
                sampleSize: typeof r.sampleSize === 'number' ? r.sampleSize : 0,
                reason: typeof r.reason === 'string' ? r.reason : '',
              }))
          : [];
      }

      const records: PerfRecord[] = perfSnap.docs.map((d) => {
        const raw = d.data();
        const meta = isPlainObject(raw.learningMeta) ? raw.learningMeta : {};
        return {
          id: d.id,
          platform: typeof raw.platform === 'string' ? raw.platform : '—',
          collectedAt: typeof raw.collectedAt === 'number' ? raw.collectedAt : undefined,
          performanceScore: typeof raw.performanceScore === 'number' ? raw.performanceScore : null,
          learningUsed: meta.used === true,
          exploredDimensions: Array.isArray(meta.exploredDimensions)
            ? meta.exploredDimensions.filter((x): x is string => typeof x === 'string')
            : [],
          attribution: {
            hookType: typeof raw.hookType === 'string' && raw.hookType.length > 0,
            presenter: typeof raw.presenter === 'string' && raw.presenter.length > 0,
            visualStyle: typeof raw.visualStyle === 'string' && raw.visualStyle.length > 0,
            duration: typeof raw.duration === 'number' && raw.duration > 0,
            contentAngle: typeof raw.contentAngle === 'string' && raw.contentAngle.length > 0,
            music: typeof raw.music === 'string' && raw.music.length > 0,
            cta: typeof raw.cta === 'string' && raw.cta.length > 0,
            category: typeof raw.category === 'string' && raw.category.length > 0,
          },
        };
      });
      return { policy: parsedPolicy, insight: parsedInsight, recommendations: parsedRecs, perf: records };
  }, []);

  const applyData = useCallback(
    (data: { policy: LearnedPolicy | null; insight: Insight | null; recommendations: RecommendationItem[]; perf: PerfRecord[] }) => {
      setPolicy(data.policy);
      setInsight(data.insight);
      setRecommendations(data.recommendations);
      setPerf(data.perf);
      setError(null);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchAll()
      .then((data) => {
        if (!cancelled) applyData(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load growth learner data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAll, applyData]);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchAll()
      .then(applyData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load growth learner data'))
      .finally(() => setLoading(false));
  }, [fetchAll, applyData]);

  /* ---- Derived honest stats ---- */
  const withLearning = perf.filter((p) => p.learningUsed).length;
  const withoutLearning = perf.filter((p) => !p.learningUsed).length;
  const explorationEvents = perf.reduce((sum, p) => sum + (p.exploredDimensions?.length ?? 0), 0);
  const attributed = perf.filter(
    (p) => p.attribution.hookType || p.attribution.presenter || p.attribution.duration,
  ).length;

  const allDimensions: PolicyDimension[] = policy
    ? Object.values(policy.platforms).flatMap((p) => Object.values(p.dimensions))
    : [];
  const appliedDimensions = allDimensions.filter((d) => !NOT_APPLIED_DIMENSIONS.has(d.dimension));

  /* Honest level display — never claim more than the data shows */
  let levelBadge = { label: 'LEVEL 0 — NO DATA', tone: 'bg-gray-100 text-gray-600', icon: <XCircle size={14} /> };
  if (insight && insight.patterns.length > 0 && !policy) {
    levelBadge = {
      label: 'LEVEL 1 — RECOMMENDATIONS ONLY (not applied)',
      tone: 'bg-amber-100 text-amber-700',
      icon: <AlertTriangle size={14} />,
    };
  }
  if (policy) {
    if (withLearning > 0) {
      levelBadge = {
        label: `LEVEL 3 — CLOSED-LOOP SELF-LEARNING (applied to ${withLearning} videos)`,
        tone: 'bg-green-100 text-green-700',
        icon: <CheckCircle2 size={14} />,
      };
    } else {
      levelBadge = {
        label: 'LEVEL 2 READY — POLICY STORED, NOT YET APPLIED',
        tone: 'bg-blue-100 text-blue-700',
        icon: <FlaskConical size={14} />,
      };
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-indigo-600" />
          <h2 className="text-lg font-black text-gray-800">Growth Self-Learning</h2>
          <span className={`px-2 py-1 rounded-full text-[10px] font-black flex items-center gap-1 ${levelBadge.tone}`}>
            {levelBadge.icon}
            {levelBadge.label}
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Target size={14} />}
          label="Policy version"
          value={policy ? policy.version.split('-').slice(1, 3).join(' ') : 'none'}
          sub={policy ? `updated ${fmtDate(policy.generatedAt)}` : 'no learned policy yet'}
        />
        <StatCard
          icon={<Zap size={14} />}
          label="Dimensions learned"
          value={policy ? String(allDimensions.length) : '0'}
          sub={policy ? `${appliedDimensions.length} applied in generation` : '—'}
        />
        <StatCard
          icon={<TrendingUp size={14} />}
          label="Videos using learning"
          value={String(withLearning)}
          sub={`${withoutLearning} without (recent ${perf.length})`}
          highlight={withLearning > 0}
        />
        <StatCard
          icon={<FlaskConical size={14} />}
          label="Exploration events"
          value={String(explorationEvents)}
          sub={insight ? `insights: ${insight.patterns.length} patterns / ${insight.sampleSize} samples` : 'no insights'}
        />
      </div>

      {/* Policy dimensions table */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-sm text-gray-800">Learned policy (growth_policies/latest)</h3>
          {insight && (
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <Clock size={10} /> last learner run: {fmtDate(insight.analyzedAt)}
            </span>
          )}
        </div>
        {allDimensions.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">
            No learned policy yet. The learner (every 6h) stores a policy once attributed performance data
            reaches the minimum sample size (5 per bucket, 2+ buckets compared).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-3">Dimension</th>
                  <th className="py-2 pr-3">Platform</th>
                  <th className="py-2 pr-3">Learned winner</th>
                  <th className="py-2 pr-3">Confidence</th>
                  <th className="py-2 pr-3">Samples</th>
                  <th className="py-2 pr-3">Recent</th>
                  <th className="py-2 pr-3">Explored</th>
                  <th className="py-2 pr-3">Avg score</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {allDimensions.map((d) => {
                  const notApplied = NOT_APPLIED_DIMENSIONS.has(d.dimension);
                  const belowMin = d.minSamples !== undefined && d.sampleSize < d.minSamples;
                  return (
                    <tr key={`${d.platform}-${d.dimension}`} className="border-b border-gray-50">
                      <td className="py-2 pr-3 font-bold text-gray-700">{d.dimension}</td>
                      <td className="py-2 pr-3 text-gray-500">{d.platform}</td>
                      <td className="py-2 pr-3 text-gray-800">
                        {d.winningPattern}
                        {d.dimension === 'duration' && d.targetSeconds ? ` (~${d.targetSeconds}s)` : ''}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            d.confidence >= 0.6 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {fmtConfidence(d.confidence)}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        {d.sampleSize}
                        {d.minSamples ? <span className="text-gray-300"> /{d.minSamples} min</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">{d.recentSampleSize}</td>
                      <td className="py-2 pr-3 text-gray-600">{d.exploredSampleSize}</td>
                      <td className="py-2 pr-3 text-gray-600">{d.averagePerformanceScore ?? '—'}</td>
                      <td className="py-2 pr-3">
                        {notApplied ? (
                          <span className="text-[10px] text-amber-600 font-bold" title="Upload flow publishes immediately — scheduling not implemented">
                            LEARNED · NOT APPLIED
                          </span>
                        ) : belowMin ? (
                          <span className="text-[10px] text-gray-400 font-bold">AWAITING DATA</span>
                        ) : (
                          <span className="text-[10px] text-green-600 font-bold">APPLIED</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attribution + application health */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="font-black text-sm text-gray-800 mb-2">Attribution coverage (recent {perf.length} records)</h3>
          <p className="text-[11px] text-gray-400 mb-2">
            Records with generation attribution are the only ones the learner may use. Missing attribution is
            never converted into fake values.
          </p>
          <div className="space-y-1">
            {(['hookType', 'presenter', 'visualStyle', 'duration', 'contentAngle', 'music', 'cta', 'category'] as const).map(
              (field) => {
                const count = perf.filter((p) => p.attribution[field]).length;
                const pct = perf.length ? Math.round((count / perf.length) * 100) : 0;
                return (
                  <div key={field} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 w-24 shrink-0">{field}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 50 ? 'bg-green-400' : pct > 0 ? 'bg-amber-400' : 'bg-gray-300'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-gray-500 w-14 text-right">
                      {count}/{perf.length}
                    </span>
                  </div>
                );
              },
            )}
            <p className="text-[11px] text-gray-400 pt-1">
              {attributed} of {perf.length} recent records carry attribution; historical records without it stay
              excluded from learning.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="font-black text-sm text-gray-800 mb-2">Learning application (recent videos)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-black text-green-700">{withLearning}</div>
              <div className="text-[10px] text-green-600 font-bold uppercase">Generated using learning</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-black text-gray-600">{withoutLearning}</div>
              <div className="text-[10px] text-gray-500 font-bold uppercase">Generated without learning</div>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            A video counts as “using learning” only when a persisted policy measurably changed its
            configuration (hook / duration / presenter / style / music / CTA / angle) — recorded at generation
            time, not inferred afterwards.
          </p>
        </div>
      </div>

      {/* Recommendations (honest labeling) */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="font-black text-sm text-gray-800 mb-1">
          Recommendations (reporting only)
        </h3>
        <p className="text-[11px] text-gray-400 mb-3">
          These are human-readable artifacts of the learner. The APPLIED artifact is the policy table above —
          recommendations alone never change videos.
        </p>
        {recommendations.length === 0 ? (
          <p className="text-xs text-gray-400 py-2 text-center">No recommendations yet.</p>
        ) : (
          <ul className="space-y-2">
            {recommendations.slice(0, 8).map((r, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-bold shrink-0">
                  {r.patternType} · {r.platform}
                </span>
                <span>
                  {r.action}{' '}
                  <span className="text-gray-400">
                    ({fmtConfidence(r.confidence)}, n={r.sampleSize})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center gap-1 text-gray-400 text-[10px] font-bold uppercase">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-black ${highlight ? 'text-green-700' : 'text-gray-800'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

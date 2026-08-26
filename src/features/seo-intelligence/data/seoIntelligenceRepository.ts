import { db } from '@/firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';

const SETTINGS_COLLECTION = 'system_settings';
const SEO_SETTINGS_DOC = 'seo_intelligence';
const GSC_DOC = 'seo_search_console';
const RECOMMENDATIONS_COLLECTION = 'seo_recommendations';

export const SEO_INTELLIGENCE_WORKFLOW_URL =
  'https://github.com/rahul74603/auto-video-backend/actions/workflows/seo_intelligence.yml';

export type SeoRecommendation = {
  id?: string;
  kind?: string;
  title?: string;
  reason?: string;
  suggestedAction?: string;
  examFamily?: string;
  page?: string;
  autoCreate?: boolean;
  priority?: number;
};

export type SearchConsoleRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SeoScanStatus = {
  runner?: string;
  lastStatus?: 'running' | 'success' | 'failed' | string;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  scanStartedAt?: string | null;
  scanDurationMs?: number | null;
  recommendationCount?: number;
  lastError?: { message?: string; name?: string; code?: string; status?: string } | null;
  github?: { actor?: string; runId?: string; sha?: string } | null;
};

export type SeoDashboard = {
  generatedAt?: string;
  freshness?: { ok?: boolean; stats?: Record<string, number>; issues?: string[] };
  connections?: Array<{ name: string; ok: boolean; error?: string }>;
  lifecycle?: Record<string, number>;
  gaps?: SeoRecommendation[];
  ctr?: SeoRecommendation[];
  recommendations?: SeoRecommendation[];
  searchConsole?: { enabled?: boolean; rowCount?: number; error?: string | null; source?: string; ingestedAt?: string | null };
  intelligence?: Record<string, unknown> | null;
  scan?: SeoScanStatus;
  policy?: { autoPublish?: boolean; autoCreatePages?: boolean; inventFacts?: boolean; hideAiUsage?: boolean };
};

function timestampToIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
    if (typeof maybe.seconds === 'number') return new Date(maybe.seconds * 1000).toISOString();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asRecommendations(snapshotDocs: Array<{ id: string; data: () => unknown }>): SeoRecommendation[] {
  return snapshotDocs.map((item) => ({ id: item.id, ...asRecord(item.data()) }) as SeoRecommendation);
}

function isStudyGyaanPage(page: unknown): boolean {
  const value = String(page || '').trim();
  if (!value) return false;
  if (value.startsWith('/')) return true;
  try {
    const url = new URL(value);
    return url.hostname === 'studygyaan.in' || url.hostname.endsWith('.studygyaan.in');
  } catch {
    return false;
  }
}

function asNonNegativeNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeCtr(value: unknown): number | null {
  const n = asNonNegativeNumber(value);
  if (n === null) return null;
  if (n > 1 && n <= 100) return n / 100;
  if (n > 1) return null;
  return n;
}

export function normalizeSearchConsoleRows(rows: unknown): SearchConsoleRow[] {
  const list = Array.isArray(rows) ? rows : [];
  const out: SearchConsoleRow[] = [];
  for (const row of list.slice(0, 500)) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const keys = Array.isArray(record.keys) ? record.keys : [];
    const queryText = String(record.query || keys[0] || '').trim().slice(0, 200);
    const page = String(record.page || keys[1] || '').trim().slice(0, 300);
    if (!page || !isStudyGyaanPage(page)) continue;
    const clicks = asNonNegativeNumber(record.clicks);
    const impressions = asNonNegativeNumber(record.impressions);
    const ctr = normalizeCtr(record.ctr);
    const position = asNonNegativeNumber(record.position);
    if (clicks === null || impressions === null || ctr === null || position === null) continue;
    if (position > 1000) continue;
    out.push({
      query: queryText,
      page,
      clicks: Math.round(clicks),
      impressions: Math.round(impressions),
      ctr,
      position,
    });
  }
  return out;
}

export function prepareSearchConsoleImport(rows: unknown): { rows: SearchConsoleRow[]; json: string; workflowUrl: string } {
  const normalized = normalizeSearchConsoleRows(rows);
  if (!normalized.length) {
    throw new Error('No valid studygyaan.in Search Console rows found');
  }
  return {
    rows: normalized,
    json: JSON.stringify({ rows: normalized }, null, 2),
    workflowUrl: SEO_INTELLIGENCE_WORKFLOW_URL,
  };
}

/**
 * Direct browser writes to the GSC Firestore snapshot are intentionally disabled
 * because this repository does not contain Firestore security rules to verify
 * that only the admin can write system_settings/seo_search_console. Use the
 * GitHub Actions workflow input instead; the runner writes with server-side
 * Firebase Admin credentials kept in GitHub Secrets.
 */
export async function ingestSearchConsoleRows(rows: Array<Record<string, unknown>>): Promise<number> {
  prepareSearchConsoleImport(rows);
  throw new Error('Direct browser GSC writes are disabled. Use the SEO Intelligence GitHub Actions workflow input.');
}

export function getSeoIntelligenceWorkflowUrl(): string {
  return SEO_INTELLIGENCE_WORKFLOW_URL;
}

export async function fetchSeoDashboard(): Promise<SeoDashboard> {
  const [settingsSnap, gscSnap, recSnap] = await Promise.all([
    getDoc(doc(db, SETTINGS_COLLECTION, SEO_SETTINGS_DOC)),
    getDoc(doc(db, SETTINGS_COLLECTION, GSC_DOC)),
    getDocs(query(collection(db, RECOMMENDATIONS_COLLECTION), orderBy('priority', 'desc'), limit(30))),
  ]);

  const settings = settingsSnap.exists() ? asRecord(settingsSnap.data()) : {};
  const gsc = gscSnap.exists() ? asRecord(gscSnap.data()) : {};
  const lastRun = asRecord(settings.lastRun);
  const recommendations = asRecommendations(recSnap.docs || []);
  const gscRows = Array.isArray(gsc.rows) ? gsc.rows : [];
  const runnerSearchConsole = asRecord(settings.searchConsole || lastRun.searchConsole);
  const lifecycle = asRecord(settings.lifecycleSummary || lastRun.lifecycle) as Record<string, number>;

  const scan: SeoScanStatus = {
    runner: typeof settings.runner === 'string' ? settings.runner : undefined,
    lastStatus: typeof settings.lastStatus === 'string' ? settings.lastStatus : undefined,
    lastRunAt: timestampToIso(settings.lastRunAt) || timestampToIso(lastRun.generatedAt),
    lastSuccessAt: timestampToIso(settings.lastSuccessAt),
    lastFailureAt: timestampToIso(settings.lastFailureAt),
    scanStartedAt: timestampToIso(settings.scanStartedAt),
    scanDurationMs: Number(settings.scanDurationMs || lastRun.durationMs || 0) || null,
    recommendationCount: Number(settings.recommendationCount || lastRun.recommendationCount || recommendations.length) || 0,
    lastError: settings.lastError && typeof settings.lastError === 'object' ? settings.lastError as SeoScanStatus['lastError'] : null,
    github: settings.github && typeof settings.github === 'object' ? settings.github as SeoScanStatus['github'] : null,
  };

  return {
    generatedAt: new Date().toISOString(),
    freshness: settings.freshness as SeoDashboard['freshness'] || null || undefined,
    connections: Array.isArray(settings.connections) ? settings.connections as SeoDashboard['connections'] : [],
    lifecycle,
    gaps: recommendations.filter((r) => r.kind === 'CONTENT_GAP').slice(0, 20),
    ctr: recommendations.filter((r) => r.kind === 'CTR').slice(0, 20),
    recommendations,
    searchConsole: {
      enabled: Boolean(gscRows.length || runnerSearchConsole.enabled),
      rowCount: gscRows.length || Number(runnerSearchConsole.rowCount || 0),
      error: typeof runnerSearchConsole.error === 'string' ? runnerSearchConsole.error : null,
      source: typeof gsc.source === 'string' ? gsc.source : undefined,
      ingestedAt: timestampToIso(gsc.ingestedAt),
    },
    intelligence: lastRun,
    scan,
    policy: {
      autoPublish: false,
      autoCreatePages: false,
      inventFacts: false,
      hideAiUsage: false,
    },
  };
}

export async function runSeoIntelligence(): Promise<Record<string, unknown>> {
  return {
    success: false,
    workflowUrl: SEO_INTELLIGENCE_WORKFLOW_URL,
    message: 'SEO scans run through GitHub Actions now; no browser Cloud Run API is required.',
  };
}

import { db } from '@/firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
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

export type SeoPageAuditFinding = {
  id?: string;
  dimension?: string;
  severity?: string;
  confidence?: string;
  evidence?: Record<string, unknown>;
  suggestedAction?: string;
  autoFixLevel?: string;
};

export type SeoPageAudit = {
  url?: string;
  contentType?: string;
  contentId?: string;
  auditedAt?: string;
  auditVersion?: number;
  health?: { score?: number; label?: string; note?: string };
  priority?: number;
  summary?: {
    mainOpportunity?: string;
    criticalCount?: number;
    highCount?: number;
    counts?: Record<string, number>;
  };
  findings?: SeoPageAuditFinding[];
  dimensionStatus?: Record<string, string | undefined>;
  mainOpportunity?: string;
  criticalCount?: number;
  highCount?: number;
};

export type SeoOptimizationProposal = {
  id?: string;
  url?: string;
  contentType?: string;
  contentId?: string;
  field?: string;
  oldValue?: unknown;
  proposedValue?: unknown;
  reason?: string;
  evidenceIds?: string[];
  severity?: string;
  confidence?: string;
  level?: 'A' | 'B' | 'C' | string;
  requiresReview?: boolean;
  status?: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed' | 'rolled_back' | string;
  applied?: boolean;
  snapshotId?: string | null;
  appliedAt?: string | null;
  rolledBackAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  auditVersion?: number;
  source?: string;
  htmlSource?: string;
  insufficientSource?: boolean;
  htmlRef?: string;
};

export type SeoGscInsight = {
  kind?: string;
  page?: string;
  query?: string;
  reason?: string;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export type SeoApplyHistoryItem = {
  proposalId?: string;
  status?: string;
  snapshotId?: string | null;
  at?: string;
  field?: string | null;
};

export type SeoOptimizationProposalSummary = {
  count?: number;
  max?: number;
  perPage?: number;
  byLevel?: Record<string, number>;
  byStatus?: Record<string, number>;
  storage?: string;
  preferredCollectionBlocked?: string;
  note?: string;
};

export type SeoPageAuditSummary = {
  count?: number;
  max?: number;
  auditVersion?: number;
  avgHealth?: number | null;
  blockerPages?: number;
  storage?: string;
  preferredCollectionBlocked?: string;
  note?: string;
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
  pageAudits?: SeoPageAudit[];
  pageAuditSummary?: SeoPageAuditSummary;
  optimizationProposals?: SeoOptimizationProposal[];
  optimizationProposalSummary?: SeoOptimizationProposalSummary;
  gscInsights?: { status?: string; reason?: string | null; insights?: SeoGscInsight[]; fabricated?: boolean };
  applyHistory?: SeoApplyHistoryItem[];
  searchConsole?: { enabled?: boolean; rowCount?: number; error?: string | null; source?: string; ingestedAt?: string | null };
  intelligence?: Record<string, unknown> | null;
  scan?: SeoScanStatus;
  policy?: { autoPublish?: boolean; autoCreatePages?: boolean; inventFacts?: boolean; hideAiUsage?: boolean; pageAuditApply?: boolean; optimizationApply?: boolean };
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
    pageAudits: Array.isArray(settings.pageAudits) ? settings.pageAudits as SeoPageAudit[] : [],
    pageAuditSummary: settings.pageAuditSummary && typeof settings.pageAuditSummary === 'object'
      ? settings.pageAuditSummary as SeoPageAuditSummary
      : undefined,
    optimizationProposals: Array.isArray(settings.optimizationProposals)
      ? settings.optimizationProposals as SeoOptimizationProposal[]
      : [],
    optimizationProposalSummary: settings.optimizationProposalSummary && typeof settings.optimizationProposalSummary === 'object'
      ? settings.optimizationProposalSummary as SeoOptimizationProposalSummary
      : undefined,
    gscInsights: settings.gscInsights && typeof settings.gscInsights === 'object'
      ? settings.gscInsights as SeoDashboard['gscInsights']
      : undefined,
    applyHistory: Array.isArray(settings.applyHistory) ? settings.applyHistory as SeoApplyHistoryItem[] : [],
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
      pageAuditApply: false,
      optimizationApply: false,
    },
  };
}

/**
 * Approve/reject a proposal status on the admin SEO settings doc only.
 * Never writes public content. Never sets applied=true. Does not apply the change.
 */
export async function setOptimizationProposalStatus(
  proposalId: string,
  status: 'approved' | 'rejected',
): Promise<SeoOptimizationProposal[]> {
  if (status !== 'approved' && status !== 'rejected') {
    throw new Error('Proposal status must be approved or rejected');
  }
  const id = String(proposalId || '').trim();
  if (!id) throw new Error('Proposal id is required');

  const ref = doc(db, SETTINGS_COLLECTION, SEO_SETTINGS_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('SEO intelligence settings document is missing');
  }
  const data = asRecord(snap.data());
  const current = Array.isArray(data.optimizationProposals) ? data.optimizationProposals as SeoOptimizationProposal[] : [];
  const next = current.map((item) => {
    if (!item || item.id !== id) return item;
    if (item.status !== 'pending') return item;
    return { ...item, status, applied: false, reviewedAt: new Date().toISOString() };
  });
  await setDoc(ref, { optimizationProposals: next, optimizationApply: false }, { merge: true });
  return next;
}

const CONTENT_COLLECTION_MAP: Record<string, string> = {
  BLOG: 'blogs',
  JOB: 'jobs',
  FAST_TRACK: 'fast_track',
  MOCK_TEST: 'mock_tests',
  STUDY_MATERIAL: 'study_materials',
  COURSE: 'courses',
  EBOOK: 'jobs',
  WEB_STORY: 'web_stories',
};

const APPLYABLE_FIELDS = new Set([
  'seoTitle', 'metaDescription', 'h1', 'authorName', 'imageAlt', 'faqs', 'relatedLinks', 'includeJobPostingSchema', 'schemaMarkup', 'howToApply', 'articleHtml',
]);

const SNAPSHOTS_COLLECTION = 'seo_apply_snapshots';
const BODIES_COLLECTION = 'seo_proposal_bodies';

function extractArticleHtml(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { articleHtml?: unknown }).articleHtml === 'string') {
    return (value as { articleHtml: string }).articleHtml;
  }
  return '';
}

function assertSafeArticleHtml(html: string): string {
  const value = String(html || '');
  if (!value.trim()) throw new Error('No articleHtml to apply');
  if (/<script|javascript:|vbscript:|<iframe|<object|<embed|\son[a-z]+\s*=/i.test(value)) {
    throw new Error('Proposed articleHtml failed the HTML safety check');
  }
  return value;
}

export async function fetchProposalArticleHtml(proposal: SeoOptimizationProposal): Promise<string> {
  const value = proposal.proposedValue;
  if (value && typeof value === 'object' && (value as { insufficientSource?: boolean }).insufficientSource) {
    throw new Error('Insufficient source — HTML was not generated');
  }
  const htmlRef = value && typeof value === 'object' ? String((value as { htmlRef?: string }).htmlRef || '') : '';
  if (htmlRef) {
    const snap = await getDoc(doc(db, BODIES_COLLECTION, htmlRef));
    if (snap.exists()) {
      const data = asRecord(snap.data());
      if (typeof data.articleHtml === 'string' && data.articleHtml.trim()) {
        return assertSafeArticleHtml(data.articleHtml);
      }
    }
  }
  return assertSafeArticleHtml(extractArticleHtml(value));
}

const FACT_FIELDS = new Set([
  'organization', 'vacancies', 'salary', 'qualification', 'eligibility', 'dates', 'lastDate', 'startDate', 'fees', 'fee', 'age', 'applyLink', 'notificationLink', 'officialSiteLink', 'directLink', 'advtNo', 'selectionProcess', 'questions', 'answers', 'officialFacts',
]);

function buildClientPatch(proposal: SeoOptimizationProposal, articleHtml?: string): Record<string, unknown> {
  const field = String(proposal.field || '');
  if (FACT_FIELDS.has(field)) throw new Error(`Fact field ${field} is locked`);
  if (field === 'contentPlan' || field === 'headingPlan' || field === 'contentTable' || field === 'howToApplySection') {
    throw new Error(`${field} is a review plan and is not auto-written into public HTML`);
  }
  if (proposal.level === 'C') throw new Error('Level C proposals are never applied');
  if (field === 'schemaMarkup' || field === 'includeJobPostingSchema') return { includeJobPostingSchema: false };
  if (field === 'relatedLinks') {
    const links = (Array.isArray(proposal.proposedValue) ? proposal.proposedValue : []).filter((item) => {
      const rec = item as { url?: string };
      return Boolean(rec && rec.url && rec.url.startsWith('/') && !rec.url.startsWith('//'));
    });
    return { relatedLinks: links };
  }
  if (field === 'articleHtml') {
    const html = articleHtml || extractArticleHtml(proposal.proposedValue);
    if (proposal.insufficientSource || (proposal.proposedValue && typeof proposal.proposedValue === 'object' && (proposal.proposedValue as { insufficientSource?: boolean }).insufficientSource)) {
      throw new Error('Insufficient source — articleHtml is not applied');
    }
    return { articleHtml: assertSafeArticleHtml(html) };
  }
  if (!APPLYABLE_FIELDS.has(field)) throw new Error(`Field ${field} is not allowlisted for apply`);
  return { [field]: proposal.proposedValue };
}

export function previewOptimizationProposal(proposal: SeoOptimizationProposal): {
  oldValue: unknown;
  proposedValue: unknown;
  applyable: boolean;
  reason: string;
} {
  try {
    if (proposal.status !== 'approved') {
      return { oldValue: proposal.oldValue, proposedValue: proposal.proposedValue, applyable: false, reason: 'Approve first. Approval does not write public content.' };
    }
    buildClientPatch(proposal);
    return { oldValue: proposal.oldValue, proposedValue: proposal.proposedValue, applyable: true, reason: 'Ready to apply allowlisted fields after snapshot.' };
  } catch (error) {
    return { oldValue: proposal.oldValue, proposedValue: proposal.proposedValue, applyable: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function applyOptimizationProposal(proposalId: string): Promise<SeoOptimizationProposal[]> {
  const id = String(proposalId || '').trim();
  if (!id) throw new Error('Proposal id is required');
  const settingsRef = doc(db, SETTINGS_COLLECTION, SEO_SETTINGS_DOC);
  const settingsSnap = await getDoc(settingsRef);
  if (!settingsSnap.exists()) throw new Error('SEO intelligence settings document is missing');
  const settings = asRecord(settingsSnap.data());
  const current = Array.isArray(settings.optimizationProposals) ? settings.optimizationProposals as SeoOptimizationProposal[] : [];
  const proposal = current.find((item) => item.id === id);
  if (!proposal) throw new Error('Proposal not found');
  if (proposal.status !== 'approved') throw new Error('Only approved proposals can be applied');
  const articleHtml = proposal.field === 'articleHtml' ? await fetchProposalArticleHtml(proposal) : undefined;
  const patch = buildClientPatch(proposal, articleHtml);
  const collectionName = CONTENT_COLLECTION_MAP[String(proposal.contentType || '').toUpperCase()];
  if (!collectionName || !proposal.contentId) throw new Error('Proposal is missing a public document mapping');

  const pageRef = doc(db, collectionName, proposal.contentId);
  const pageSnap = await getDoc(pageRef);
  const page = pageSnap.exists() ? asRecord(pageSnap.data()) : {};
  const oldValues: Record<string, unknown> = {};
  for (const field of Object.keys(patch)) oldValues[field] = page[field] ?? null;
  const snapshotId = `snap-${id}`.slice(0, 120);
  const at = new Date().toISOString();
  await setDoc(doc(db, SNAPSHOTS_COLLECTION, snapshotId), {
    id: snapshotId,
    proposalId: id,
    collection: collectionName,
    documentId: proposal.contentId,
    url: proposal.url || '',
    field: proposal.field,
    oldValues,
    newValues: patch,
    createdAt: at,
    actor: 'admin-dashboard',
    restored: false,
  });
  await setDoc(pageRef, { ...patch, seoAppliedAt: at, contentUpdatedAt: at }, { merge: true });
  const next = current.map((item) => item.id === id
    ? { ...item, status: 'applied', applied: true, snapshotId, appliedAt: at, lastError: null }
    : item);
  const history = [{ proposalId: id, status: 'applied', snapshotId, at, field: proposal.field }, ...(Array.isArray(settings.applyHistory) ? settings.applyHistory as SeoApplyHistoryItem[] : [])].slice(0, 20);
  await setDoc(settingsRef, { optimizationProposals: next, applyHistory: history, optimizationApply: false }, { merge: true });
  return next;
}

export async function rollbackOptimizationProposal(proposalId: string): Promise<SeoOptimizationProposal[]> {
  const id = String(proposalId || '').trim();
  const settingsRef = doc(db, SETTINGS_COLLECTION, SEO_SETTINGS_DOC);
  const settingsSnap = await getDoc(settingsRef);
  if (!settingsSnap.exists()) throw new Error('SEO intelligence settings document is missing');
  const settings = asRecord(settingsSnap.data());
  const current = Array.isArray(settings.optimizationProposals) ? settings.optimizationProposals as SeoOptimizationProposal[] : [];
  const proposal = current.find((item) => item.id === id);
  if (!proposal || !proposal.snapshotId) throw new Error('Applied proposal with snapshot is required for rollback');
  const snap = await getDoc(doc(db, SNAPSHOTS_COLLECTION, proposal.snapshotId));
  if (!snap.exists()) throw new Error('Snapshot not found');
  const snapshot = asRecord(snap.data());
  const collectionName = String(snapshot.collection || CONTENT_COLLECTION_MAP[String(proposal.contentType || '').toUpperCase()] || '');
  const documentId = String(snapshot.documentId || proposal.contentId || '');
  const oldValues = asRecord(snapshot.oldValues);
  const at = new Date().toISOString();
  await setDoc(doc(db, collectionName, documentId), { ...oldValues, seoRolledBackAt: at, contentUpdatedAt: at }, { merge: true });
  await setDoc(doc(db, SNAPSHOTS_COLLECTION, proposal.snapshotId), { restored: true, restoredAt: at }, { merge: true });
  const next = current.map((item) => item.id === id
    ? { ...item, status: 'rolled_back', applied: false, rolledBackAt: at }
    : item);
  const history = [{ proposalId: id, status: 'rolled_back', snapshotId: proposal.snapshotId, at, field: proposal.field }, ...(Array.isArray(settings.applyHistory) ? settings.applyHistory as SeoApplyHistoryItem[] : [])].slice(0, 20);
  await setDoc(settingsRef, { optimizationProposals: next, applyHistory: history, optimizationApply: false }, { merge: true });
  return next;
}

export async function runSeoIntelligence(): Promise<Record<string, unknown>> {
  return {
    success: false,
    workflowUrl: SEO_INTELLIGENCE_WORKFLOW_URL,
    message: 'SEO scans run through GitHub Actions now; no browser Cloud Run API is required.',
  };
}

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

const PLAN_ONLY_FIELDS = new Set([
  'contentPlan', 'headingPlan', 'contentTable', 'howToApplySection',
]);

export type SeoProposalCheck = {
  proposalId: string;
  page: string;
  contentType: string;
  field: string;
  oldValue: unknown;
  proposedValue: unknown;
  level: string;
  confidence: string;
  status: string;
  applyable: boolean;
  applyReason: string;
  approvable: boolean;
  approveReason: string;
  isFactField: boolean;
  isLevelC: boolean;
  requiresReview: boolean;
  articleHtmlApplyable: boolean | null;
  articleHtmlReason: string | null;
  hasDocumentMapping: boolean;
  blocked: boolean;
  blockedReason: string;
  category: 'ready' | 'needs_approval' | 'needs_review' | 'blocked' | 'applied' | 'rejected' | 'failed' | 'rolled_back';
};

export type SeoProposalCheckSummary = {
  total: number;
  readyToApply: number;
  needsApproval: number;
  needsReview: number;
  blocked: number;
  levelC: number;
  factFieldsBlocked: number;
  invalidMapping: number;
  alreadyApplied: number;
  rejected: number;
  failed: number;
  rolledBack: number;
};

export type SeoProposalBulkResult = {
  id: string;
  outcome: 'approved' | 'applied' | 'skipped' | 'failed';
  reason: string;
  snapshotId?: string | null;
  field?: string | null;
};

export type SeoApplySnapshot = {
  id?: string;
  proposalId?: string;
  collection?: string;
  documentId?: string;
  url?: string;
  field?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  createdAt?: string;
  restored?: boolean;
  restoredAt?: string;
};

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isSeoFactField(field?: string | null): boolean {
  return FACT_FIELDS.has(String(field || ''));
}

export function hasPublicDocumentMapping(proposal: SeoOptimizationProposal): boolean {
  const collectionName = CONTENT_COLLECTION_MAP[String(proposal.contentType || '').toUpperCase()];
  return Boolean(collectionName && proposal.contentId);
}

function inspectArticleHtml(proposal: SeoOptimizationProposal): { ok: boolean; reason: string } | null {
  if (String(proposal.field || '') !== 'articleHtml') return null;
  if (proposal.insufficientSource || (proposal.proposedValue && typeof proposal.proposedValue === 'object' && (proposal.proposedValue as { insufficientSource?: boolean }).insufficientSource)) {
    return { ok: false, reason: 'Insufficient source — articleHtml is not applied' };
  }
  const html = extractArticleHtml(proposal.proposedValue);
  const htmlRef = proposal.proposedValue && typeof proposal.proposedValue === 'object'
    ? String((proposal.proposedValue as { htmlRef?: string }).htmlRef || proposal.htmlRef || '')
    : String(proposal.htmlRef || '');
  if (!html.trim() && htmlRef) {
    return { ok: false, reason: 'HTML is stored by reference — use individual Check/Apply which loads seo_proposal_bodies' };
  }
  try {
    assertSafeArticleHtml(html);
    return { ok: true, reason: 'Proposed HTML passed the safety check' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function inspectSafety(proposal: SeoOptimizationProposal): { ok: boolean; reason: string } {
  try {
    buildClientPatch(proposal);
    return { ok: true, reason: 'Allowlisted field passed safety checks.' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function checkOptimizationProposal(proposal: SeoOptimizationProposal): SeoProposalCheck {
  const field = String(proposal.field || '');
  const status = String(proposal.status || 'pending');
  const isLevelC = proposal.level === 'C';
  const hasMapping = hasPublicDocumentMapping(proposal);
  const html = inspectArticleHtml(proposal);
  const safety = inspectSafety(proposal);
  const preview = previewOptimizationProposal(proposal);
  const blockedReason = !hasMapping
    ? 'Proposal is missing a public document mapping'
    : (!safety.ok ? safety.reason : (html && !html.ok ? html.reason : ''));
  const applyable = preview.applyable && hasMapping && !(html && !html.ok);
  const applyReason = applyable
    ? preview.reason
    : (blockedReason || preview.reason);
  let approveReason = 'Not pending.';
  let approvable = false;
  if (status !== 'pending') {
    approveReason = `Status is ${status}. Bulk safe-approve only changes pending proposals.`;
  } else if (isLevelC) {
    approveReason = 'Level C proposals are never bulk-approved.';
  } else if (FACT_FIELDS.has(field)) {
    approveReason = `Fact field ${field} is locked.`;
  } else if (PLAN_ONLY_FIELDS.has(field)) {
    approveReason = `${field} is a review plan and is not auto-approved.`;
  } else if (!hasMapping) {
    approveReason = 'Proposal is missing a public document mapping.';
  } else if (!APPLYABLE_FIELDS.has(field) && field !== 'schemaMarkup') {
    approveReason = safety.reason;
  } else if (html && !html.ok) {
    approveReason = html.reason;
  } else if (!safety.ok) {
    approveReason = safety.reason;
  } else if (proposal.requiresReview) {
    approveReason = 'Requires review — use individual Approve (status only). Bulk safe-approve skips review-required proposals.';
  } else {
    approvable = true;
    approveReason = 'Safe to approve. Approval does not write public content.';
  }

  let category: SeoProposalCheck['category'] = 'blocked';
  if (status === 'applied') category = 'applied';
  else if (status === 'rejected') category = 'rejected';
  else if (status === 'failed') category = 'failed';
  else if (status === 'rolled_back') category = 'rolled_back';
  else if (applyable) category = 'ready';
  else if (Boolean(blockedReason) || isLevelC || FACT_FIELDS.has(field) || PLAN_ONLY_FIELDS.has(field) || !hasMapping) category = 'blocked';
  else if (proposal.requiresReview || (status === 'pending' && !approvable)) category = 'needs_review';
  else if (status === 'pending') category = 'needs_approval';
  else category = 'blocked';

  return {
    proposalId: String(proposal.id || ''),
    page: String(proposal.url || proposal.contentId || ''),
    contentType: String(proposal.contentType || 'OTHER'),
    field,
    oldValue: proposal.oldValue,
    proposedValue: proposal.proposedValue,
    level: String(proposal.level || '—'),
    confidence: String(proposal.confidence || '—'),
    status,
    applyable,
    applyReason,
    approvable,
    approveReason,
    isFactField: FACT_FIELDS.has(field),
    isLevelC,
    requiresReview: Boolean(proposal.requiresReview),
    articleHtmlApplyable: html ? html.ok : null,
    articleHtmlReason: html ? html.reason : null,
    hasDocumentMapping: hasMapping,
    blocked: category === 'blocked',
    blockedReason: category === 'blocked' ? (blockedReason || applyReason || approveReason) : '',
    category,
  };
}

export function summarizeProposalChecks(items: SeoProposalCheck[]): SeoProposalCheckSummary {
  const summary: SeoProposalCheckSummary = {
    total: items.length,
    readyToApply: 0,
    needsApproval: 0,
    needsReview: 0,
    blocked: 0,
    levelC: 0,
    factFieldsBlocked: 0,
    invalidMapping: 0,
    alreadyApplied: 0,
    rejected: 0,
    failed: 0,
    rolledBack: 0,
  };
  for (const item of items) {
    if (item.category === 'ready') summary.readyToApply += 1;
    if (item.category === 'needs_approval') summary.needsApproval += 1;
    if (item.category === 'needs_review') summary.needsReview += 1;
    if (item.category === 'blocked') summary.blocked += 1;
    if (item.isLevelC) summary.levelC += 1;
    if (item.isFactField) summary.factFieldsBlocked += 1;
    if (!item.hasDocumentMapping) summary.invalidMapping += 1;
    if (item.category === 'applied') summary.alreadyApplied += 1;
    if (item.category === 'rejected') summary.rejected += 1;
    if (item.category === 'failed') summary.failed += 1;
    if (item.category === 'rolled_back') summary.rolledBack += 1;
  }
  return summary;
}

export function checkOptimizationProposals(proposals: SeoOptimizationProposal[]): {
  items: SeoProposalCheck[];
  summary: SeoProposalCheckSummary;
} {
  const items = (Array.isArray(proposals) ? proposals : []).map((item) => checkOptimizationProposal(item));
  return { items, summary: summarizeProposalChecks(items) };
}

function fieldGroup(field: string): string {
  if (field === 'relatedLinks') return 'internal-link';
  if (field === 'articleHtml') return 'articleHtml';
  if (FACT_FIELDS.has(field)) return 'factual';
  if (field === 'seoTitle' || field === 'metaDescription' || field === 'h1' || field === 'authorName' || field === 'imageAlt') return 'metadata';
  if (field === 'schemaMarkup' || field === 'includeJobPostingSchema') return 'schema';
  return 'other';
}

export function summarizeApplyPreview(items: SeoProposalCheck[]): Record<string, number> {
  const counts = {
    metadata: 0,
    'internal-link': 0,
    factual: 0,
    levelC: 0,
    articleHtml: 0,
    unsafeHtml: 0,
    other: 0,
  };
  for (const item of items) {
    if (item.isLevelC) counts.levelC += 1;
    if (item.articleHtmlApplyable === false) counts.unsafeHtml += 1;
    const group = fieldGroup(item.field);
    if (group === 'metadata') counts.metadata += 1;
    else if (group === 'internal-link') counts['internal-link'] += 1;
    else if (group === 'factual') counts.factual += 1;
    else if (group === 'articleHtml') counts.articleHtml += 1;
    else counts.other += 1;
  }
  return counts;
}

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

export async function fetchSeoApplySnapshot(snapshotId: string): Promise<SeoApplySnapshot> {
  const id = String(snapshotId || '').trim();
  if (!id) throw new Error('Snapshot id is required');
  const snap = await getDoc(doc(db, SNAPSHOTS_COLLECTION, id));
  if (!snap.exists()) throw new Error('Snapshot not found');
  return { id, ...asRecord(snap.data()) } as SeoApplySnapshot;
}

/**
 * Bulk-approve only pending proposals that pass the existing safety model.
 * Never writes public content. Never sets applied=true.
 * Fetches latest settings before writing so a stale admin list cannot clobber newer statuses.
 */
export async function approveOptimizationProposals(proposalIds: string[]): Promise<{
  proposals: SeoOptimizationProposal[];
  results: SeoProposalBulkResult[];
}> {
  const ids = uniqueIds(proposalIds);
  const ref = doc(db, SETTINGS_COLLECTION, SEO_SETTINGS_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('SEO intelligence settings document is missing');
  const data = asRecord(snap.data());
  const current = Array.isArray(data.optimizationProposals) ? data.optimizationProposals as SeoOptimizationProposal[] : [];
  const byId = new Map(current.map((item) => [String(item.id || ''), item]));
  const results: SeoProposalBulkResult[] = [];
  const approved = new Set<string>();
  for (const id of ids) {
    const proposal = byId.get(id);
    if (!proposal) {
      results.push({ id, outcome: 'failed', reason: 'Proposal not found in loaded SEO settings.' });
      continue;
    }
    const check = checkOptimizationProposal(proposal);
    if (!check.approvable) {
      results.push({ id, outcome: 'skipped', reason: check.approveReason, field: proposal.field });
      continue;
    }
    approved.add(id);
    results.push({
      id,
      outcome: 'approved',
      reason: 'Approved. Public content was not changed.',
      field: proposal.field,
    });
  }
  if (!approved.size) {
    return { proposals: current, results };
  }
  const at = new Date().toISOString();
  const next = current.map((item) => {
    if (!item.id || !approved.has(item.id) || item.status !== 'pending') return item;
    return { ...item, status: 'approved', applied: false, reviewedAt: at };
  });
  await setDoc(ref, { optimizationProposals: next, optimizationApply: false }, { merge: true });
  return { proposals: next, results };
}

/**
 * Apply approved proposals one-by-one using the existing snapshot-before-write path.
 * A failure does not abort the rest of the batch.
 * Matches backend applyBatch: Level B, Level C, articleHtml, facts, pending, and
 * missing mappings are never bulk-applied. Individual applyOptimizationProposal is unchanged.
 */
export async function applyOptimizationProposals(proposalIds: string[]): Promise<{
  proposals: SeoOptimizationProposal[];
  results: SeoProposalBulkResult[];
}> {
  const ids = uniqueIds(proposalIds);
  const settingsRef = doc(db, SETTINGS_COLLECTION, SEO_SETTINGS_DOC);
  const results: SeoProposalBulkResult[] = [];
  let latest: SeoOptimizationProposal[] = [];

  const readLatest = async () => {
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) throw new Error('SEO intelligence settings document is missing');
    const settings = asRecord(settingsSnap.data());
    latest = Array.isArray(settings.optimizationProposals) ? settings.optimizationProposals as SeoOptimizationProposal[] : [];
    return latest;
  };

  await readLatest();

  for (const id of ids) {
    const proposal = latest.find((item) => item.id === id);
    if (!proposal) {
      results.push({ id, outcome: 'failed', reason: 'Proposal not found in loaded SEO settings.' });
      continue;
    }
    if (proposal.field === 'articleHtml') {
      results.push({
        id,
        outcome: 'skipped',
        reason: 'articleHtml is never bulk-applied — use individual Apply after CHECK.',
        field: proposal.field,
      });
      continue;
    }
    if (proposal.level === 'B') {
      results.push({
        id,
        outcome: 'skipped',
        reason: 'level-B-not-batched — use individual Apply after CHECK.',
        field: proposal.field,
      });
      continue;
    }
    const preview = previewOptimizationProposal(proposal);
    const mapping = hasPublicDocumentMapping(proposal);
    if (!preview.applyable || !mapping) {
      results.push({
        id,
        outcome: 'skipped',
        reason: mapping ? preview.reason : 'Proposal is missing a public document mapping',
        field: proposal.field,
      });
      continue;
    }
    try {
      latest = await applyOptimizationProposal(id);
      const applied = latest.find((item) => item.id === id);
      if (applied?.status !== 'applied') {
        results.push({
          id,
          outcome: 'failed',
          reason: applied?.lastError || 'Apply did not mark the proposal as applied.',
          snapshotId: applied?.snapshotId || null,
          field: proposal.field,
        });
        continue;
      }
      results.push({
        id,
        outcome: 'applied',
        reason: 'Applied allowlisted fields after snapshot.',
        snapshotId: applied.snapshotId || null,
        field: proposal.field,
      });
    } catch (error) {
      results.push({
        id,
        outcome: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        field: proposal.field,
      });
      try {
        await readLatest();
      } catch {
        // Keep last known list so later iterations can still attempt apply.
      }
    }
  }

  return { proposals: latest, results };
}

export async function runSeoIntelligence(): Promise<Record<string, unknown>> {
  return {
    success: false,
    workflowUrl: SEO_INTELLIGENCE_WORKFLOW_URL,
    message: 'SEO scans run through GitHub Actions now; no browser Cloud Run API is required.',
  };
}

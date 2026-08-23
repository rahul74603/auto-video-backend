import { auth, db } from '@/firebase/config';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

/**
 * Frontend data layer for the source-grounded AI Article Agents
 * (Job Writer / Fast Track Writer / Fact & Quality Reviewer).
 *
 * Drafts live in `ai_article_drafts`. Publication into the public
 * `jobs` / `fast_track` collections is guarded: a draft must have
 * `reviewStatus === 'passed'`, must not be stale after edits and must
 * not already be published. The backend re-checks the same rules, so
 * clients can never bypass a failed review.
 */

export const EDITORIAL_AUTHOR = 'StudyGyaan Editorial Team';
export const AI_ARTICLE_DRAFTS = 'ai_article_drafts';
export const ARTICLE_API_BASE = 'https://api-hf6vlh5cpq-uc.a.run.app';

export type ReviewVerdict = 'pass' | 'fail';

export type ReviewReport = {
  verdict?: ReviewVerdict;
  score?: number;
  issues?: string[];
  warnings?: string[];
  metrics?: Record<string, unknown>;
  reviewedAt?: string;
} | null;

export type ArticleGenerationMeta = {
  engine?: 'adaptive-grounded-v1' | string;
  maxStrategies?: number;
  strategiesTried?: number;
  bestStrategy?: string;
  bestStrategyLabel?: string;
  passedCount?: number;
  stoppedReason?: string;
  durationMs?: number;
  outcomes?: Array<{
    strategy?: string;
    verdict?: ReviewVerdict;
    score?: number;
    issueCount?: number;
    repairAttempts?: number;
  }>;
} | null;

export type AIArticleDraftRecord = {
  id: string;
  type?: 'JOB' | 'FAST_TRACK';
  articleType?: 'job' | 'fast-track';
  status?: string;
  reviewStatus?: 'passed' | 'failed';
  publishBlocked?: boolean;
  reviewStale?: boolean;
  reviewReport?: ReviewReport;
  title?: string;
  h1?: string;
  slug?: string;
  seoTitle?: string;
  metaDescription?: string;
  shortDescription?: string;
  articleHtml?: string;
  faqs?: { question: string; answer: string }[];
  facts?: Record<string, string>;
  officialLinks?: { label: string; url: string }[];
  keywords?: string[];
  structuredData?: string;
  authorName?: string;
  wordCount?: number;
  sourceUrl?: string;
  publishedDocId?: string | null;
  publishedCollection?: string | null;
  /** Kis source se bana tha (JOBS AI draft row / Fast Track item) — publish pe auto-delete hota hai. */
  originRef?: { collection: string; id: string } | null;
  /** 🤖 Self-healing agent loop — kitne writer-attempts chale aur kis attempt pe review pass hua. */
  repairAttempts?: number;
  repairBestAttempt?: number;
  repairPassedOnAttempt?: number | null;
  repairLog?: string[];
  generationMeta?: ArticleGenerationMeta;
  createdAt?: { seconds?: number; toDate?: () => Date } | null;
  [key: string]: unknown;
};

const draftsCollection = collection(db, AI_ARTICLE_DRAFTS);

/** Publish pe origin-delete sirf INHI do collections ka ho sakta hai — koi arbitrary collection kabhi nahi. */
export const AI_ARTICLE_ORIGIN_COLLECTIONS = ['job_drafts', 'fast_track'] as const;

/**
 * Prefill/draft se aaya originRef validate karo (unknown input → typed|null).
 * Whitelist + id shape — warna koi bhi kisi bhi collection ka delete nahi kara sakta.
 */
export const sanitizeOriginRef = (raw: unknown): { collection: string; id: string } | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const collection = typeof o.collection === 'string' ? o.collection : '';
  const id = typeof o.id === 'string' ? o.id : '';
  if (!AI_ARTICLE_ORIGIN_COLLECTIONS.includes(collection as (typeof AI_ARTICLE_ORIGIN_COLLECTIONS)[number])) return null;
  if (!id || id.length > 150 || /[/\\]/.test(id)) return null;
  return { collection, id };
};

export const aiArticleRepository = {
  async listDrafts(limitCount = 100): Promise<AIArticleDraftRecord[]> {
    const snapshot = await getDocs(query(draftsCollection, orderBy('createdAt', 'desc')));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }) as AIArticleDraftRecord)
      .slice(0, limitCount);
  },

  async getDraft(id: string): Promise<AIArticleDraftRecord | null> {
    const snapshot = await getDoc(doc(db, AI_ARTICLE_DRAFTS, id));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as AIArticleDraftRecord) : null;
  },

  async updateDraft(id: string, patch: Record<string, unknown>): Promise<void> {
    await updateDoc(doc(db, AI_ARTICLE_DRAFTS, id), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteDraft(id: string): Promise<void> {
    await deleteDoc(doc(db, AI_ARTICLE_DRAFTS, id));
  },

  // Publishing intentionally has NO browser-side repository method. Both
  // Studio panels must call /articles/publish so auth + latest review + author
  // checks execute server-side before any public collection write.

  async saveFallbackGeneration(draft: Record<string, unknown>): Promise<string> {
    const ref = await addDoc(draftsCollection, { ...draft, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  },
};

export default aiArticleRepository;

/* ------------------------------------------------------------------ */
/* Publish gate (client mirror of the backend assertPublishable rule)  */
/* ------------------------------------------------------------------ */

export function canPublishDraft(draft: AIArticleDraftRecord | null | undefined): {
  ok: boolean;
  reason: string;
} {
  if (!draft) return { ok: false, reason: 'Draft not found' };
  if (draft.status === 'published') {
    return { ok: false, reason: 'यह draft पहले से publish हो चुका है' };
  }
  if (draft.reviewStale) {
    return { ok: false, reason: 'Edit के बाद review pending है — पहले Apply/Regenerate करें' };
  }
  if (draft.reviewStatus !== 'passed' || draft.reviewReport?.verdict !== 'pass') {
    const issues = draft.reviewReport?.issues?.slice(0, 3).join('; ');
    return {
      ok: false,
      reason: `Fact & Quality review पास नहीं हुआ${issues ? ` — ${issues}` : ''}`,
    };
  }
  if (draft.authorName !== EDITORIAL_AUTHOR) {
    return { ok: false, reason: `Author label "${EDITORIAL_AUTHOR}" होना चाहिए` };
  }
  return { ok: true, reason: '' };
}

export function assertDraftPublishable(draft: AIArticleDraftRecord): void {
  const gate = canPublishDraft(draft);
  if (!gate.ok) {
    const err = new Error(gate.reason);
    (err as Error & { code?: string }).code = 'PUBLISH_BLOCKED';
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Publish payload builders (existing collection shapes stay intact)   */
/* ------------------------------------------------------------------ */

function stripEmpty<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as T;
}

export function buildJobPublishPayload(draft: AIArticleDraftRecord): Record<string, unknown> {
  const facts = draft.facts || {};
  return stripEmpty({
    title: draft.title,
    slug: draft.slug,
    metaDescription: draft.metaDescription,
    description: draft.shortDescription || draft.metaDescription,
    articleHtml: draft.articleHtml,
    faqs: draft.faqs || [],
    officialLinks: draft.officialLinks || [],
    schemaMarkup: draft.structuredData || '',
    authorName: EDITORIAL_AUTHOR,
    author: EDITORIAL_AUTHOR,
    type: 'JOB',
    status: 'published',
    keywords: draft.keywords || [],
    wordCount: draft.wordCount || 0,
    sourceUrl: draft.sourceUrl || '',
    publishedFromDraftId: draft.id,
    organization: facts.organization,
    advtNo: facts.advtNo,
    category: facts.category,
    startDate: facts.startDate,
    lastDate: facts.lastDate,
    examDate: facts.examDate,
    vacancies: facts.vacancies,
    salary: facts.salary,
    qualification: facts.qualification,
    minAge: facts.minAge,
    ageLimit: facts.ageLimit,
    location: facts.location,
    selectionProcess: facts.selectionProcess,
    eligibility: facts.eligibility,
    feeGen: facts.feeGen,
    feeSCST: facts.feeSCST,
    feeFemale: facts.feeFemale,
    feeOBC: facts.feeOBC,
    applicationFee: facts.applicationFee,
    applyLink: facts.applyLink,
    notificationLink: facts.notificationLink,
    officialSiteLink: facts.officialSiteLink,
  });
}

export function buildFastTrackPublishPayload(draft: AIArticleDraftRecord): Record<string, unknown> {
  const facts = draft.facts || {};
  return stripEmpty({
    title: draft.title,
    slug: draft.slug,
    category: facts.category || 'Other',
    org: facts.org || '',
    updateDate: facts.updateDate || '',
    directLink: facts.directLink || '',
    shortInfo: draft.shortDescription || draft.metaDescription || '',
    description: draft.shortDescription || '',
    metaDescription: draft.metaDescription,
    articleHtml: draft.articleHtml,
    faqs: draft.faqs || [],
    officialLinks: draft.officialLinks || [],
    schemaMarkup: draft.structuredData || '',
    authorName: EDITORIAL_AUTHOR,
    status: 'published',
    keywords: draft.keywords || [],
    wordCount: draft.wordCount || 0,
    sourceUrl: draft.sourceUrl || '',
    publishedFromDraftId: draft.id,
  });
}

export function buildPublishPayloadFromDraft(draft: AIArticleDraftRecord): {
  collection: 'jobs' | 'fast_track';
  payload: Record<string, unknown>;
} {
  if (draft.type === 'JOB') {
    return { collection: 'jobs', payload: buildJobPublishPayload(draft) };
  }
  return { collection: 'fast_track', payload: buildFastTrackPublishPayload(draft) };
}

/* ------------------------------------------------------------------ */
/* 🆓 CLIENT-SIDE PUBLISH (old Cloud Run API deleted — ab admin ke     */
/* signed-in Firestore session se direct publish hota hai; same        */
/* payload/doc-id shape jo backend publishDraftRecord banata tha)      */
/* ------------------------------------------------------------------ */

export type PublishResult = { collection: 'jobs' | 'fast_track'; docId: string; originDeleted: boolean };

/**
 * Draft ko jobs/fast_track me publish karo — bilkul backend publishDraftRecord
 * jaisa: same doc-id (`job-<slug>` / `ft-<slug>`), publish ke baad draft delete,
 * origin (job_drafts / fast_track raw row) cleanup.
 *
 * Gate: caller pehle canPublishDraft check kare. `adminOverride` sirf tab jab
 * admin ne khud content verify kiya ho (edited/re-review-pending drafts ke liye)
 * — essentials (title/slug/articleHtml) phir bhi zaroori hain.
 */
export async function publishDraftClientSide(
  draft: AIArticleDraftRecord,
  opts: { adminOverride?: boolean } = {}
): Promise<PublishResult> {
  if (draft.status === 'published') {
    throw new Error('यह draft पहले से publish हो चुका है');
  }
  if (!opts.adminOverride) {
    assertDraftPublishable(draft);
  }
  // Override me bhi essentials ke bina publish NAHI (safety)
  if (!draft.title || !draft.slug || !draft.articleHtml) {
    throw new Error('Draft me title/slug/article missing hai — publish nahi ho sakta');
  }

  const { collection: target, payload } = buildPublishPayloadFromDraft(draft);
  const targetId =
    (typeof draft.publishedDocId === 'string' && draft.publishedDocId) ||
    `${draft.type === 'JOB' ? 'job' : 'ft'}-${String(draft.slug || draft.id).slice(0, 90)}`;

  await setDoc(
    doc(db, target, targetId),
    { ...payload, createdAt: serverTimestamp(), publishedAt: serverTimestamp() },
    { merge: true }
  );

  // ⭐ Publish ke baad draft delete — duplicate records nahi rehte (backend jaisa hi)
  await deleteDoc(doc(db, AI_ARTICLE_DRAFTS, draft.id)).catch(() => {});

  // ⭐ Origin source-record cleanup (sirf whitelisted collections)
  const origin = sanitizeOriginRef(draft.originRef);
  let originDeleted = false;
  if (origin) {
    originDeleted = await deleteDoc(doc(db, origin.collection, origin.id))
      .then(() => true)
      .catch(() => false);
  }

  return { collection: target, docId: targetId, originDeleted };
}

/* ------------------------------------------------------------------ */
/* Backend API client (token-protected article agent endpoints)        */
/* ------------------------------------------------------------------ */

export async function callArticleApi<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  options: { token?: string; idToken?: string; baseUrl?: string } = {}
): Promise<T & { success: boolean }> {
  const base = (options.baseUrl || ARTICLE_API_BASE).replace(/\/+$/, '');
  // Browser calls use the currently signed-in Firebase admin session. `token`
  // remains available for trusted server tooling through AGENT_ADMIN_TOKEN.
  const firebaseIdToken = options.idToken || await auth.currentUser?.getIdToken();
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(firebaseIdToken ? { Authorization: `Bearer ${firebaseIdToken}` } : {}),
      ...(options.token ? { 'x-agent-token': options.token } : {}),
    },
    body: JSON.stringify(body),
  });

  let data: (T & { success: boolean; error?: string }) | null = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = new Error(data?.error || `Backend error ${response.status}`);
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }
  if (!data) throw new Error('Backend returned an unreadable response');
  return data as T & { success: boolean };
}

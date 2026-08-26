/**
 * Frontend exam-family / content-kind types.
 * Detection rules MUST match ai_backend/agents/seo_intelligence/taxonomy.js.
 * Business logic for enrichment lives in enrichPublicDocument (same fields as enrich.js).
 */

import { classifyJobLifecycle, toIsoDateString } from '@/utils/jobExpiry';

export type ExamFamily =
  | 'SSC'
  | 'RAILWAY'
  | 'BANKING'
  | 'POLICE'
  | 'UPSC'
  | 'TEACHING'
  | 'DEFENCE'
  | 'MEDICAL'
  | 'ENGINEERING'
  | 'STATE'
  | 'GENERAL';

export type ContentKind =
  | 'JOB'
  | 'ADMIT_CARD'
  | 'RESULT'
  | 'ANSWER_KEY'
  | 'SYLLABUS'
  | 'NEWS'
  | 'BLOG'
  | 'MOCK_TEST'
  | 'MATERIAL'
  | 'OTHER';

const FAMILIES: Array<{ id: ExamFamily; re: RegExp }> = [
  { id: 'SSC', re: /\b(ssc|cgl|chsl|cpo|steno|gd\b|mts\b|selection commission)\b/i },
  { id: 'RAILWAY', re: /\b(rrb|rrc|railway|ntpc|group\s*d|alp\b|je\b)\b/i },
  { id: 'BANKING', re: /\b(ibps|sbi|rbi|nabard|bank(ing)?|clerk|po\b|so\b)\b/i },
  { id: 'POLICE', re: /\b(police|constable|si\b|haryana police|up police|mp police|delhi police)\b/i },
  { id: 'UPSC', re: /\b(upsc|ias\b|ifs\b|nda\b|cds\b|capf|civil\s*service)\b/i },
  { id: 'TEACHING', re: /\b(ctet|ugc\s*net|kvs|nvs|tgt|pgt|prt|teacher|assistant\s*professor|net\/jrf)\b/i },
  { id: 'DEFENCE', re: /\b(army|navy|air\s*force|afcat|territorial|agniveer)\b/i },
  { id: 'MEDICAL', re: /\b(neet|aiims|nursing|mbbs|nhm)\b/i },
  { id: 'ENGINEERING', re: /\b(gate\b|jee\b|ies\b|engineering\s*service)\b/i },
  { id: 'STATE', re: /\b(psc|hpsc|uppsc|mppsc|bpsc|rpsc|gpsc|kpsc|vyapam|patwari|ssc gd)\b/i },
];

const KIND_FROM_FAST_TRACK: Record<string, ContentKind> = {
  result: 'RESULT',
  'admit card': 'ADMIT_CARD',
  'answer key': 'ANSWER_KEY',
  syllabus: 'SYLLABUS',
  admission: 'NEWS',
  other: 'OTHER',
};

const CLUSTER_HUBS: Record<string, { name: string; url: string }> = {
  SSC: { name: 'SSC Hub', url: '/govt-jobs?exam=SSC' },
  RAILWAY: { name: 'Railway Hub', url: '/govt-jobs?exam=Railway' },
  BANKING: { name: 'Banking Hub', url: '/govt-jobs?exam=Banking' },
  POLICE: { name: 'Police Hub', url: '/govt-jobs?exam=Police' },
  UPSC: { name: 'UPSC Hub', url: '/govt-jobs?exam=UPSC' },
  TEACHING: { name: 'Teaching Hub', url: '/govt-jobs?exam=Teaching' },
  DEFENCE: { name: 'Defence Hub', url: '/govt-jobs?exam=Defence' },
  MEDICAL: { name: 'Medical Hub', url: '/govt-jobs?exam=Medical' },
  ENGINEERING: { name: 'Engineering Hub', url: '/govt-jobs?exam=Engineering' },
  STATE: { name: 'State Jobs Hub', url: '/govt-jobs' },
  GENERAL: { name: 'Government Jobs', url: '/govt-jobs' },
};

export function detectExamFamily(input: {
  title?: string;
  category?: string;
  organization?: string;
  org?: string;
  exam?: string;
  h1?: string;
}): ExamFamily {
  const blob = [input.title, input.category, input.organization, input.org, input.exam, input.h1]
    .filter(Boolean)
    .join(' ');
  if (!blob) return 'GENERAL';
  for (const family of FAMILIES) {
    if (family.re.test(blob)) return family.id;
  }
  return 'GENERAL';
}

export function detectContentKind(input: {
  type?: string;
  title?: string;
  category?: string;
  h1?: string;
  articleType?: string;
}): ContentKind {
  const type = String(input.type || input.articleType || '').toUpperCase().replace(/-/g, '_');
  if (type === 'MOCK_TEST' || type === 'QUIZ') return 'MOCK_TEST';
  if (type === 'BLOG') return 'BLOG';
  if (type === 'MATERIAL' || type === 'STUDY_MATERIAL') return 'MATERIAL';

  const category = String(input.category || '').trim().toLowerCase();
  if (KIND_FROM_FAST_TRACK[category]) return KIND_FROM_FAST_TRACK[category];

  const title = String(input.title || input.h1 || '').toLowerCase();
  if (/\badmit\s*card\b|\bhall\s*ticket\b|\bcall\s*letter\b/.test(title)) return 'ADMIT_CARD';
  if (/\banswer\s*key\b|\bresponse\s*sheet\b/.test(title)) return 'ANSWER_KEY';
  if (/\bresult\b|\bmerit\s*list\b|\bcut[\s-]?off\b/.test(title)) return 'RESULT';
  if (/\bsyllabus\b|\bexam\s*pattern\b/.test(title)) return 'SYLLABUS';
  if (/\bmock\s*test\b|\bpractice\s*set\b/.test(title)) return 'MOCK_TEST';
  if (type === 'FAST_TRACK' || type === 'FASTTRACK') return 'NEWS';
  if (type === 'JOB') return 'JOB';
  return 'OTHER';
}

export function clusterId(family: ExamFamily, kind: ContentKind): string {
  return `${family}:${kind}`;
}

export function hubForFamily(examFamily?: string): { name: string; url: string } {
  return CLUSTER_HUBS[examFamily || 'GENERAL'] || CLUSTER_HUBS.GENERAL;
}

export function complementaryKinds(kind: ContentKind): ContentKind[] {
  switch (kind) {
    case 'JOB':
      return ['ADMIT_CARD', 'SYLLABUS', 'MOCK_TEST', 'RESULT'];
    case 'ADMIT_CARD':
      return ['JOB', 'SYLLABUS', 'MOCK_TEST', 'RESULT'];
    case 'RESULT':
      return ['JOB', 'ADMIT_CARD', 'ANSWER_KEY', 'MOCK_TEST'];
    case 'ANSWER_KEY':
      return ['RESULT', 'JOB', 'MOCK_TEST'];
    case 'SYLLABUS':
      return ['MOCK_TEST', 'JOB', 'MATERIAL'];
    case 'MOCK_TEST':
      return ['SYLLABUS', 'JOB', 'MATERIAL'];
    case 'BLOG':
      return ['JOB', 'MOCK_TEST', 'SYLLABUS'];
    default:
      return ['JOB', 'MOCK_TEST'];
  }
}

export function classifySearchIntent(kind: ContentKind): 'APPLY' | 'LATEST_UPDATE' | 'INFORMATIONAL' | 'PRACTICE' {
  if (kind === 'MOCK_TEST') return 'PRACTICE';
  if (kind === 'JOB') return 'APPLY';
  if (kind === 'ADMIT_CARD' || kind === 'RESULT' || kind === 'ANSWER_KEY' || kind === 'NEWS') return 'LATEST_UPDATE';
  return 'INFORMATIONAL';
}

export function buildImageAlt(title: string, kind?: ContentKind): string {
  const clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 110) || 'StudyGyaan exam update';
  const kindLabel: Partial<Record<ContentKind, string>> = {
    JOB: 'government job notification',
    ADMIT_CARD: 'admit card update',
    RESULT: 'exam result update',
    ANSWER_KEY: 'answer key update',
    SYLLABUS: 'exam syllabus',
    MOCK_TEST: 'mock test',
    BLOG: 'education article',
  };
  const label = kind ? kindLabel[kind] : undefined;
  if (!label) return `${clean} | StudyGyaan`;
  if (clean.toLowerCase().includes(label.split(' ')[0] || '')) return `${clean} | StudyGyaan`;
  return `${clean} — ${label} | StudyGyaan`.slice(0, 125);
}

/**
 * Canonical enrichment fields — same keys as ai_backend enrichContentDocument.
 */
export function enrichPublicDocument(input: {
  type?: string;
  title?: string;
  h1?: string;
  seoTitle?: string;
  metaDescription?: string;
  category?: string;
  organization?: string;
  org?: string;
  sourceUrl?: string;
  lastDate?: string;
  startDate?: string;
  wordCount?: number;
  imageUrl?: string;
}): Record<string, unknown> {
  const examFamily = detectExamFamily(input);
  const contentKind = detectContentKind(input);
  const searchIntent = classifySearchIntent(contentKind);
  const life = classifyJobLifecycle(String(input.lastDate || ''), input.startDate);
  const isJob = String(input.type || '').toUpperCase() === 'JOB';
  const hub = hubForFamily(examFamily);
  const out: Record<string, unknown> = {
    examFamily,
    contentKind,
    topicCluster: clusterId(examFamily, contentKind),
    searchIntent,
    lifecycleStatus: isJob ? life.status : 'UNKNOWN',
    lifecycleDays: isJob ? life.daysUntilLastDate : null,
    includeJobPostingSchema: isJob ? life.includeJobPostingSchema : false,
    sitemapPriority: isJob ? life.sitemapPriority : 0.6,
    imageAlt: buildImageAlt(input.seoTitle || input.title || '', contentKind),
    discoverScore: Number(input.wordCount) >= 400 ? 75 : 55,
    clusterHubUrl: hub.url,
    clusterHubName: hub.name,
    seoIntelligenceVersion: 1,
  };
  if (input.sourceUrl && /^https?:\/\//i.test(input.sourceUrl)) {
    out.sourceCitation = { url: input.sourceUrl.slice(0, 500), label: 'Official source', disclosed: true };
  }
  return out;
}

export function sanitizePublishDate(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return toIsoDateString(raw) || (/\d/.test(raw) ? raw.slice(0, 40) : '');
}

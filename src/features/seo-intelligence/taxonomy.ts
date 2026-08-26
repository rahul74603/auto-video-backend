/** Frontend exam-family / content-kind helpers — mirrors backend taxonomy (no network). */

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
  { id: 'RAILWAY', re: /\b(rrb|rrc|railway|ntpc|group\s*d|alp\b)\b/i },
  { id: 'BANKING', re: /\b(ibps|sbi|rbi|nabard|bank(ing)?)\b/i },
  { id: 'POLICE', re: /\b(police|constable|si\b)\b/i },
  { id: 'UPSC', re: /\b(upsc|ias\b|nda\b|cds\b|capf)\b/i },
  { id: 'TEACHING', re: /\b(ctet|ugc\s*net|kvs|nvs|tgt|pgt|teacher|assistant\s*professor)\b/i },
  { id: 'DEFENCE', re: /\b(army|navy|air\s*force|afcat|agniveer)\b/i },
  { id: 'MEDICAL', re: /\b(neet|aiims|nursing|mbbs)\b/i },
  { id: 'ENGINEERING', re: /\b(gate\b|jee\b|ies\b)\b/i },
  { id: 'STATE', re: /\b(psc|hpsc|uppsc|mppsc|bpsc|rpsc|vyapam|patwari)\b/i },
];

export function detectExamFamily(input: { title?: string; category?: string; organization?: string; org?: string }): ExamFamily {
  const blob = [input.title, input.category, input.organization, input.org].filter(Boolean).join(' ');
  if (!blob) return 'GENERAL';
  for (const family of FAMILIES) {
    if (family.re.test(blob)) return family.id;
  }
  return 'GENERAL';
}

export function detectContentKind(input: { type?: string; title?: string; category?: string }): ContentKind {
  const type = String(input.type || '').toUpperCase().replace(/-/g, '_');
  if (type === 'MOCK_TEST') return 'MOCK_TEST';
  if (type === 'BLOG') return 'BLOG';
  const category = String(input.category || '').toLowerCase();
  if (category === 'result') return 'RESULT';
  if (category === 'admit card') return 'ADMIT_CARD';
  if (category === 'answer key') return 'ANSWER_KEY';
  if (category === 'syllabus') return 'SYLLABUS';
  const title = String(input.title || '').toLowerCase();
  if (/\badmit\s*card\b/.test(title)) return 'ADMIT_CARD';
  if (/\banswer\s*key\b/.test(title)) return 'ANSWER_KEY';
  if (/\bresult\b/.test(title)) return 'RESULT';
  if (/\bsyllabus\b/.test(title)) return 'SYLLABUS';
  if (type === 'JOB') return 'JOB';
  if (type === 'FAST_TRACK' || type === 'FASTTRACK') return 'NEWS';
  return 'OTHER';
}

export function clusterId(family: ExamFamily, kind: ContentKind): string {
  return `${family}:${kind}`;
}

export function classifySearchIntent(kind: ContentKind): 'APPLY' | 'LATEST_UPDATE' | 'INFORMATIONAL' | 'PRACTICE' {
  if (kind === 'MOCK_TEST') return 'PRACTICE';
  if (kind === 'JOB') return 'APPLY';
  if (kind === 'ADMIT_CARD' || kind === 'RESULT' || kind === 'ANSWER_KEY' || kind === 'NEWS') return 'LATEST_UPDATE';
  return 'INFORMATIONAL';
}

export function buildImageAlt(title: string, kind?: ContentKind): string {
  const clean = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 110) || 'StudyGyaan exam update';
  return kind ? `${clean} | StudyGyaan` : `${clean} | StudyGyaan`;
}

export function enrichPublicDocument(input: {
  type?: string;
  title?: string;
  category?: string;
  organization?: string;
  org?: string;
  sourceUrl?: string;
}): Record<string, unknown> {
  const examFamily = detectExamFamily(input);
  const contentKind = detectContentKind(input);
  const out: Record<string, unknown> = {
    examFamily,
    contentKind,
    topicCluster: clusterId(examFamily, contentKind),
    searchIntent: classifySearchIntent(contentKind),
    imageAlt: buildImageAlt(input.title || '', contentKind),
    seoIntelligenceVersion: 1,
  };
  if (input.sourceUrl && /^https?:\/\//i.test(input.sourceUrl)) {
    out.sourceCitation = { url: input.sourceUrl.slice(0, 500), label: 'Official source', disclosed: true };
  }
  return out;
}

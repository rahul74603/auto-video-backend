import { callArticleApi } from '@/features/ai-articles/data/aiArticleRepository';

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

export type SeoDashboard = {
  generatedAt?: string;
  freshness?: { ok?: boolean; stats?: Record<string, number>; issues?: string[] };
  connections?: Array<{ name: string; ok: boolean; error?: string }>;
  lifecycle?: Record<string, number>;
  gaps?: SeoRecommendation[];
  ctr?: SeoRecommendation[];
  recommendations?: SeoRecommendation[];
  searchConsole?: { enabled?: boolean; rowCount?: number; error?: string | null };
  intelligence?: Record<string, unknown> | null;
  policy?: { autoPublish?: boolean; autoCreatePages?: boolean; inventFacts?: boolean };
};

export async function fetchSeoDashboard(): Promise<SeoDashboard> {
  const res = await callArticleApi<{ dashboard: SeoDashboard }>('/seo/intelligence/dashboard', {});
  return res.dashboard || {};
}

export async function runSeoIntelligence(force = true): Promise<Record<string, unknown>> {
  const res = await callArticleApi<{ report: Record<string, unknown> }>('/seo/intelligence/run', { force });
  return res.report || {};
}

export async function ingestSearchConsoleRows(rows: Array<Record<string, unknown>>): Promise<number> {
  const res = await callArticleApi<{ ingested: number }>('/seo/intelligence/search-console/ingest', { rows });
  return Number(res.ingested) || 0;
}

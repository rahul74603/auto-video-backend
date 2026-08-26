/** Append-only update history — mirrors ai_backend/agents/seo_intelligence/update_history.js */

const TRACKED_FIELDS = [
  'title',
  'lastDate',
  'startDate',
  'examDate',
  'vacancies',
  'salary',
  'qualification',
  'applyLink',
  'directLink',
  'status',
  'updateDate',
] as const;

const MAX_ENTRIES = 30;

export type HistoryChange = { field: string; from: string; to: string };
export type HistoryEntry = { at: string; reason: string; changes: HistoryChange[] };

function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function snapshotFields(doc: Record<string, unknown> | null | undefined): Record<string, string> {
  const facts = doc?.facts && typeof doc.facts === 'object' ? (doc.facts as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const field of TRACKED_FIELDS) {
    out[field] = asText(doc?.[field] ?? facts[field]);
  }
  return out;
}

export function buildHistoryEntry(
  previousDoc: Record<string, unknown> | null | undefined,
  nextDoc: Record<string, unknown>,
  { at, reason }: { at?: string; reason?: string } = {}
): HistoryEntry {
  const prev = snapshotFields(previousDoc || {});
  const next = snapshotFields(nextDoc || {});
  const changes: HistoryChange[] = [];
  if (previousDoc) {
    for (const field of TRACKED_FIELDS) {
      const from = asText(prev[field]);
      const to = asText(next[field]);
      if (from === to) continue;
      changes.push({ field, from: from.slice(0, 180), to: to.slice(0, 180) });
    }
  }
  return {
    at: at || new Date().toISOString(),
    reason: reason || (previousDoc ? 'updated' : 'published'),
    changes,
  };
}

export function mergeUpdateHistory(existing: unknown, entry: HistoryEntry): HistoryEntry[] {
  const list = Array.isArray(existing) ? (existing as HistoryEntry[]).slice() : [];
  if (!entry || typeof entry !== 'object') return list.slice(-MAX_ENTRIES);
  if (entry.reason === 'updated' && (!entry.changes || !entry.changes.length)) {
    return list.slice(-MAX_ENTRIES);
  }
  const last = list[list.length - 1];
  if (
    last
    && last.reason === entry.reason
    && JSON.stringify(last.changes || []) === JSON.stringify(entry.changes || [])
  ) {
    return list.slice(-MAX_ENTRIES);
  }
  list.push({
    at: String(entry.at || new Date().toISOString()).slice(0, 40),
    reason: String(entry.reason || 'updated').slice(0, 40),
    changes: (entry.changes || []).slice(0, 12),
  });
  return list.slice(-MAX_ENTRIES);
}

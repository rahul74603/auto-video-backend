// =========================================================
// 🔎 Site Search — halka static index (/search-index.json)
// ---------------------------------------------------------
// Ye file roz ke SEO run (seo_static/generate.cjs) se banti hai aur
// FTP se site root par aati hai. Browser use EK baar load karke apne
// andar hi khojta hai — Firestore par koi query nahi jaati, isiliye
// search turant chalta hai aur purane collectionGroup wale tareeke
// ki tarah fail nahi hota.
// =========================================================

export type SearchKind = 'job' | 'update' | 'blog' | 'test' | 'material' | 'story' | 'course';

export interface SearchIndexItem {
  /** title */
  t: string;
  /** path, e.g. /job/ssc-gd-constable-2026 */
  u: string;
  /** kind */
  k: SearchKind;
  /** extra searchable text (organization / category / subject / last date) */
  s?: string;
}

let cache: Promise<SearchIndexItem[]> | null = null;

export function loadSearchIndex(): Promise<SearchIndexItem[]> {
  if (!cache) {
    cache = fetch('/search-index.json', { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`search-index ${r.status}`))))
      .then((j) => (Array.isArray(j?.items) ? (j.items as SearchIndexItem[]) : []))
      .catch(() => {
        cache = null; // fail ho to agli koshish par dobara try hoga
        return [] as SearchIndexItem[];
      });
  }
  return cache;
}

/**
 * Token-based khoj: query ke saare shabd (kam se kam 2 akshar wale)
 * title ya extra text me milne chahiye. Title me milna sabse zyada
 * score deta hai; index pehle se naye-pehle sorted hai, isliye barabar
 * score par nayi cheez upar rehti hai.
 */
export function searchIndexItems(
  items: SearchIndexItem[],
  rawQuery: string,
  limitN = 12,
): SearchIndexItem[] {
  const tokens = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (!tokens.length || !items.length) return [];

  const scored: { item: SearchIndexItem; score: number; idx: number }[] = [];
  items.forEach((item, idx) => {
    const title = item.t.toLowerCase();
    const extra = (item.s || '').toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (title.startsWith(tok)) score += 30;
      else if (title.includes(tok)) score += 25;
      else if (extra.includes(tok)) score += 10;
      else return; // koi token na mile to ye result nahi
    }
    // Lambey, varnanatmak title ko halka bonus — taaki sirf "Result" /
    // "Admit Card" naam ke khali stub asal results se upar na aayein
    if (item.t.length >= 40) score += 8;
    else if (item.t.length >= 25) score += 4;
    scored.push({ item, score, idx });
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, limitN).map((x) => x.item);
}

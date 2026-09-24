import { describe, expect, it, vi, beforeEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';

const { mockSetDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ type: 'collection', name })),
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({ collectionName, id })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: mockSetDoc,
  query: vi.fn((...args: unknown[]) => ({ type: 'query', args })),
  orderBy: vi.fn((field: string, direction?: string) => ({ field, direction })),
  limit: vi.fn((count: number) => ({ count })),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
}));

vi.mock('@/firebase/config', () => ({
  db: {},
  auth: {},
  storage: {},
  default: { name: '[DEFAULT]' },
}));

import { parseGscCsv, extractCsvTextsFromZip, rowsFromGscFiles } from '@/features/seo-intelligence/data/gscCsv';
import { ingestSearchConsoleRows } from '@/features/seo-intelligence/data/seoIntelligenceRepository';

const PAGES_CSV = [
  '\uFEFFTop pages,Clicks,Impressions,CTR,Position',
  '/job/up-police-bharti-2026/,120,4500,2.67%,4.2',
  '/blog/ssc-gd-syllabus/,80,3900,2.05%,6.8',
].join('\n');

const QUERIES_CSV = [
  'Top queries,Clicks,Impressions,CTR,Position',
  '"up police bharti 2026, apply online",450,12000,3.75%,3.1',
  'studygyaan,60,2000,3%,1.5',
].join('\n');

const EU_CSV = [
  'Top pages;Clicks;Impressions;CTR;Position',
  '/job/delhi-police/;5;300;1,67%;9,1',
].join('\n');

describe('gscCsv parser (browser GSC ZIP/CSV import)', () => {
  it('parses Pages.csv with percent CTR and BOM', () => {
    const rows = parseGscCsv(PAGES_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      query: '',
      page: '/job/up-police-bharti-2026/',
      clicks: 120,
      impressions: 4500,
      ctr: 0.0267,
      position: 4.2,
    });
  });

  it('parses quoted queries (Queries.csv)', () => {
    const rows = parseGscCsv(QUERIES_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0].query).toBe('up police bharti 2026, apply online');
    expect(rows[0].page).toBe('/');
    expect(rows[0].ctr).toBeCloseTo(0.0375, 5);
  });

  it('handles semicolon delimiter + EU decimal commas', () => {
    const rows = parseGscCsv(EU_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0].ctr).toBeCloseTo(0.0167, 5);
    expect(rows[0].position).toBe(9.1);
  });

  it('returns [] when no GSC header present', () => {
    expect(parseGscCsv('name,city\nrahul,bhopal')).toEqual([]);
  });

  it('unzips only CSV entries (skips macOS junk and dirs)', () => {
    const zip = zipSync({
      'Pages.csv': strToU8(PAGES_CSV),
      'Queries.csv': strToU8(QUERIES_CSV),
      '__MACOSX/._Pages.csv': strToU8('junk'),
      'notes.txt': strToU8('ignore me'),
    });
    const texts = extractCsvTextsFromZip(zip.buffer.slice(0) as ArrayBuffer);
    expect(texts.map((t) => t.name).sort()).toEqual(['Pages.csv', 'Queries.csv']);
  });

  it('rowsFromGscFiles: zip + loose csv combined, deduped, sorted by impressions, capped', async () => {
    const zip = zipSync({ 'Pages.csv': strToU8(PAGES_CSV) });
    const zipFile = new File([new Uint8Array(zip)], 'gsc.zip');
    const csvFile = new File([QUERIES_CSV], 'Queries.csv');
    const dupFile = new File([PAGES_CSV], 'Pages.csv'); // same rows as zip — dedupe check

    const rows = await rowsFromGscFiles([zipFile, csvFile, dupFile]);
    // 2 (pages) + 2 (queries) unique; duplicates removed; sorted impressions desc
    expect(rows).toHaveLength(4);
    expect(rows[0].page).toBe('/'); // queries row with 12000 impressions first
    expect(rows.map((r) => r.impressions)).toEqual([...rows.map((r) => r.impressions)].sort((a, b) => b - a));
  });
});

describe('ingestSearchConsoleRows (admin direct Firestore write)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
  });

  it('writes normalized rows with admin-upload source', async () => {
    const count = await ingestSearchConsoleRows([
      { query: 'ssc cgl apply', page: 'https://studygyaan.in/job/ssc-cgl-2026', clicks: 12, impressions: 800, ctr: 0.015, position: 8 },
      { query: '', page: '/job/up-police-bharti-2026/', clicks: 120, impressions: 4500, ctr: 0.0267, position: 4.2 },
    ]);
    expect(count).toBe(2);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [docRef, payload, opts] = mockSetDoc.mock.calls[0];
    expect(docRef).toMatchObject({ collectionName: 'system_settings', id: 'seo_search_console' });
    expect((payload as { rows: unknown[] }).rows).toHaveLength(2);
    expect((payload as { source: string }).source).toBe('admin-dashboard-upload');
    expect(opts).toMatchObject({ merge: true });
  });

  it('throws and does not write when no valid rows', async () => {
    await expect(ingestSearchConsoleRows([{ foo: 'bar' }])).rejects.toThrow(/No valid/i);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

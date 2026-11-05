// derivePageUrl fix ke focused tests — plain node.
// Chalane ke liye: node derive_url.test.js
const assert = require('assert');
const { buildChangeEvent, derivePageUrl, buildGscJoinKey } =
  require('./agents/seo_intelligence/change_events');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ok -', name); }
  catch (e) { console.error('FAIL -', name, '\n', e.message); process.exitCode = 1; }
}

t('mock_tests ka URL slug se banta hai', () => {
  assert.strictEqual(
    derivePageUrl('mock_tests', 'heat-thermodynamics-set'),
    'https://studygyaan.in/test/heat-thermodynamics-set');
});

t('baaki pakki routes bhi banti hain', () => {
  assert.strictEqual(derivePageUrl('blogs', 'mera-blog'), 'https://studygyaan.in/blog/mera-blog');
  assert.strictEqual(derivePageUrl('jobs', 'ssc-gd-2026'), 'https://studygyaan.in/job/ssc-gd-2026');
  assert.strictEqual(derivePageUrl('fast_track', 'cat-result'), 'https://studygyaan.in/update/cat-result');
});

t('study_materials par kuch nahi banta (route pakki nahi)', () => {
  assert.strictEqual(derivePageUrl('study_materials', 'abc123'), '');
  assert.strictEqual(derivePageUrl('unknown_col', 'x'), '');
  assert.strictEqual(derivePageUrl('mock_tests', ''), '');
});

t('event: pageUrl na mile to derive hota hai + join key banti hai', () => {
  const ev = buildChangeEvent({
    proposal: { id: 'p1', field: 'seoTitle' },
    collectionName: 'mock_tests',
    contentId: 'heat-thermodynamics-set',
    contentType: 'MOCK_TEST',
    field: 'seoTitle',
    oldValue: 'purana', newValue: 'naya',
    actor: 'test', source: 'test'
  });
  assert.strictEqual(ev.pageUrl, 'https://studygyaan.in/test/heat-thermodynamics-set');
  assert.strictEqual(ev.gscJoinKey, 'https://studygyaan.in/test/heat-thermodynamics-set');
});

t('event: di gayi pageUrl hamesha jeet-ti hai (derive nahi hota)', () => {
  const ev = buildChangeEvent({
    proposal: { id: 'p2', field: 'seoTitle' },
    collectionName: 'mock_tests',
    contentId: 'koi-slug',
    contentType: 'MOCK_TEST',
    pageUrl: 'https://studygyaan.in/test/asli-url',
    field: 'seoTitle',
    oldValue: 'a', newValue: 'b',
    actor: 'test', source: 'test'
  });
  assert.strictEqual(ev.pageUrl, 'https://studygyaan.in/test/asli-url');
  assert.strictEqual(ev.gscJoinKey, buildGscJoinKey('https://studygyaan.in/test/asli-url'));
});

console.log(`\n${passed} tests pass`);

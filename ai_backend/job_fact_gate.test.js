// job_fact_gate ke tests — plain node, koi framework nahi.
// Chalane ke liye: node job_fact_gate.test.js
const assert = require('assert');
const gate = require('./job_fact_gate');

let passed = 0;
function t(name, fn) {
    try { fn(); passed++; console.log('  ok -', name); }
    catch (e) { console.error('FAIL -', name, '\n', e.message); process.exitCode = 1; }
}

const SOURCE = `
Railway Recruitment Board RRB CEN 09/2026 Isolated Categories ki bharti.
Total Posts: 191. Junior Translator Hindi ke 79 pad, Lab Assistant ke 36 pad.
Application Fee: General / OBC candidates ke liye Rs. 500/- aur
SC / ST / Female candidates ke liye Rs. 250/- hai.
Salary: Level 7 ke liye Rs. 44900/- prati mah.
Application Start Date: 05/11/2026. Last Date to Apply: 04/12/2026.
Yogyata aur aayu seema ki poori jankari aadhikarik notification me di gayi hai.
Chayan prakriya me single stage CBT hoga jisme 100 prashn honge.
Aavedan sirf online madhyam se rrbapply.gov.in par hi kiya ja sakta hai.
`.repeat(2); // lambai > 400 pakki

t('sahi number rehte hain, galat girte hain', () => {
    const { data, notes } = gate.verifyJobFacts({
        vacancies: '200', feeGen: '₹500', feeSCST: '₹300',
        feeFemale: '₹250', salary: '₹44,900',
        lastDate: '05/12/2026', startDate: '05/11/2026',
    }, SOURCE, { lastDate: '04/12/2026', startDate: '05/11/2026' });
    assert.strictEqual(data.vacancies, '');       // 200 source me nahi
    assert.strictEqual(data.feeGen, '₹500');       // sahi
    assert.strictEqual(data.feeSCST, '');          // 300 galat (250 hai)
    assert.strictEqual(data.feeFemale, '₹250');    // sahi
    assert.strictEqual(data.salary, '₹44,900');    // sahi
    assert.ok(notes.length >= 3);
});

t('source ki labeled tareekh AI par jeet-ti hai', () => {
    const { data } = gate.verifyJobFacts(
        { lastDate: '05/12/2026' }, SOURCE,
        { lastDate: '04/12/2026', startDate: '' });
    assert.strictEqual(data.lastDate, '04/12/2026');
});

t('Indian grouping: 6,574 aur 6574 ek hi baat', () => {
    const src = 'TNPSC Group IV me kul 6574 pad hain. '.repeat(30);
    const { data } = gate.verifyJobFacts({ vacancies: '6,574' }, src, null);
    assert.strictEqual(data.vacancies, '6,574');
});

t('Devanagari ankon wala source bhi chalta hai', () => {
    const src = 'इस भर्ती में कुल पद १९१ हैं और शुल्क ५०० रुपये है। '.repeat(15);
    const { data } = gate.verifyJobFacts(
        { vacancies: '191', feeGen: '500' }, src, null);
    assert.strictEqual(data.vacancies, '191');
    assert.strictEqual(data.feeGen, '500');
});

t('boundary: 500 ko 15000 ke andar chipa nahi manenge', () => {
    const src = 'Is bharti me kul 15000 pad hain, vistar se padho. '.repeat(20);
    const { data } = gate.verifyJobFacts({ feeGen: '₹500' }, src, null);
    assert.strictEqual(data.feeGen, '');
});

t('chhota source — gate chup rehta hai, kuch nahi girta', () => {
    const { data } = gate.verifyJobFacts(
        { vacancies: '999', feeGen: '₹777' }, 'chhoti si khabar', null);
    assert.strictEqual(data.vacancies, '999');
    assert.strictEqual(data.feeGen, '₹777');
});

t('galat salary girti hai', () => {
    const { data } = gate.verifyJobFacts(
        { salary: '₹99,900 - ₹1,50,000' }, SOURCE, null);
    assert.strictEqual(data.salary, '');
});

t('khaali field par gate kuch nahi karta; null-safe hai', () => {
    const { data } = gate.verifyJobFacts(
        { vacancies: '', feeGen: null, salary: undefined }, SOURCE, null);
    assert.strictEqual(data.vacancies, '');
    const out = gate.verifyJobFacts({}, null, null);
    assert.deepStrictEqual(out.data, {});
});

console.log(`\n${passed} tests pass`);

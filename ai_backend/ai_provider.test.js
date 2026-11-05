// ai_provider ke tests — plain node, network nahi (sirf order
// aur fallback ka tark jaanchte hain).
// Chalane ke liye: node ai_provider.test.js
const assert = require('assert');
const { _internals } = require('./ai_provider');
const { pickOrder, runChain } = _internals;

let passed = 0;
function t(name, fn) {
    return Promise.resolve().then(fn).then(() => {
        passed++; console.log('  ok -', name);
    }).catch(e => {
        console.error('FAIL -', name, '\n', e.message);
        process.exitCode = 1;
    });
}

(async () => {
    await t('Groq OFF — hamesha sirf Gemini', () => {
        assert.deepStrictEqual(pickOrder(false, 0), ['gemini']);
        assert.deepStrictEqual(pickOrder(false, 7), ['gemini']);
    });

    await t('Groq ON — baari-baari primary (quota bantwara)', () => {
        assert.deepStrictEqual(pickOrder(true, 0), ['gemini', 'groq']);
        assert.deepStrictEqual(pickOrder(true, 1), ['groq', 'gemini']);
        assert.deepStrictEqual(pickOrder(true, 2), ['gemini', 'groq']);
    });

    await t('primary safal — fallback ko haath nahi', async () => {
        let groqCalled = false;
        const out = await runChain(['gemini', 'groq'], {
            gemini: async () => 'gemini-text',
            groq: async () => { groqCalled = true; return 'groq-text'; },
        });
        assert.strictEqual(out, 'gemini-text');
        assert.strictEqual(groqCalled, false);
    });

    await t('primary fail (quota) — dusra dimag sambhalta hai', async () => {
        const out = await runChain(['gemini', 'groq'], {
            gemini: async () => { throw new Error('429 quota'); },
            groq: async () => 'groq-text',
        });
        assert.strictEqual(out, 'groq-text');
    });

    await t('dono fail — pehla (primary ka) error hi upar jata hai', async () => {
        await assert.rejects(
            runChain(['groq', 'gemini'], {
                groq: async () => { throw new Error('groq-down'); },
                gemini: async () => { throw new Error('gemini-down'); },
            }),
            /groq-down/);
    });

    await t('akela Gemini fail — wahi purana vyavhaar', async () => {
        await assert.rejects(
            runChain(['gemini'], {
                gemini: async () => { throw new Error('gemini-429'); },
            }),
            /gemini-429/);
    });

    console.log(`\n${passed} tests pass`);
})();

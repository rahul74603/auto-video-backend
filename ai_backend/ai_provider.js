// =========================================================
// 🔀 AI PROVIDER CHAIN (2026-11-05) — Eric ki shart: "dono ke
// tokens aur free quota khatam na ho."
//
// Gemini aur Groq baari-baari primary bante hain, taaki kisi ek
// ka free quota pehle na mare. Ek fail ho (quota 429, network,
// kuch bhi) to dusra turant sambhalta hai — kaam rukta nahi.
//
// Groq sirf tab istemal hota hai jab:
//   (1) Firestore system_configs/scraper_flags me
//       groqChain === true ho, AUR
//   (2) GROQ_API_KEY env me maujud ho.
// OFF / key-na-ho / koi bhi galti par vyavhaar bilkul pehle
// jaisa — sirf Gemini, aur Gemini ka hi error upar jata hai.
// =========================================================

let _cfg = null;    // null = abhi tay nahi hua
let _counter = 0;   // baari-baari primary ke liye

async function ensureConfig() {
    if (_cfg) return _cfg;
    let groq = false;
    try {
        if (process.env.GROQ_API_KEY) {
            const admin = require('firebase-admin');
            if (admin.apps && admin.apps.length) {
                const snap = await admin.firestore()
                    .collection('system_configs').doc('scraper_flags').get();
                groq = !!(snap.exists && snap.data().groqChain === true);
            }
        }
    } catch (e) {
        groq = false;
    }
    _cfg = { groq };
    console.log(`🔀 ai-chain: Groq ${groq ? 'ON (baari-baari primary)' : 'OFF (sirf Gemini)'}`);
    return _cfg;
}

function pickOrder(groqOn, n) {
    if (!groqOn) return ['gemini'];
    return n % 2 === 0 ? ['gemini', 'groq'] : ['groq', 'gemini'];
}

// 2026-11-10: model-naam ROT — gemini-2.5-flash kuch keys par 404
// ("no longer available to new users") dene laga hai, isiliye ek naam
// par nirbhar nahi: naye naam pehle, purana aakhri me (jin keys par
// abhi chalta hai, wahan wahi chalega). maxTokens bhi ab Gemini ko
// milta hai (pehle ignore hota tha — lambe article kat sakte the).
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];

async function callGemini({ prompt, jsonMode, maxTokens }) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let lastErr = null;
    for (const name of GEMINI_MODELS) {
        try {
            const model = genAI.getGenerativeModel({
                model: name,
                generationConfig: {
                    ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
                    ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
                },
            });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (e) {
            lastErr = e;
            console.warn(`🔀 gemini model ${name} fail (${String(e.message || e).slice(0, 120)})`);
        }
    }
    throw lastErr;
}

// 2026-11-10: Groq ne llama-3.3-70b-versatile retire kar diya (404) —
// uski jagah ke naam openai/gpt-oss-120b (bada) aur gpt-oss-20b hain.
// gpt-oss models response_format ko 400 se reject karte hain, isiliye
// unke liye woh nahi bhejte — prompt JSON maangta hai aur caller
// jawab ko saaf karke parse karta hai.
const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

async function callGroq({ prompt, jsonMode, maxTokens }) {
    let lastErr = null;
    for (const name of GROQ_MODELS) {
        try {
            return await callGroqModel(name, { prompt, jsonMode, maxTokens });
        } catch (e) {
            lastErr = e;
            console.warn(`🔀 groq model ${name} fail (${String(e.message || e).slice(0, 120)})`);
        }
    }
    throw lastErr;
}

async function callGroqModel(modelName, { prompt, jsonMode, maxTokens }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: modelName,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: maxTokens || 4000,
                ...(jsonMode && !modelName.startsWith('openai/gpt-oss') ? { response_format: { type: 'json_object' } } : {}),
            }),
        });
        if (!res.ok) {
            throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
        }
        const data = await res.json();
        return data.choices[0].message.content;
    } finally {
        clearTimeout(timer);
    }
}

// order ke hisaab se ek-ek karke koshish; sab fail hon to
// PEHLA error upar — taaki purani error-vyavastha same rahe.
async function runChain(order, fns) {
    let firstErr = null;
    for (const name of order) {
        try {
            return await fns[name]();
        } catch (e) {
            if (!firstErr) firstErr = e;
            console.warn(`🔀 ${name} fail (${String(e.message || e).slice(0, 100)})${order.length > 1 ? ' — dusra dimag koshish karega' : ''}`);
        }
    }
    throw firstErr;
}

async function generateText({ prompt, jsonMode = false, maxTokens = 4000 }) {
    const cfg = await ensureConfig();
    const order = pickOrder(cfg.groq, _counter++);
    return runChain(order, {
        gemini: () => callGemini({ prompt, jsonMode, maxTokens }),
        groq:   () => callGroq({ prompt, jsonMode, maxTokens }),
    });
}

module.exports = { generateText, _internals: { pickOrder, runChain } };

// =========================================================
// 📲 SOCIAL EXTRA — Instagram Reels + Threads posting
// ---------------------------------------------------------
// Instagram aur Threads dono ko video_url ke roop me PUBLIC mp4 URL
// chahiye (woh khud video fetch karte hain) — pipeline ka render local
// file hota hai, isliye pehle getPublicVideoUrl() usi mp4 ko ek temp
// GitHub Release (tag: sg-media-temp) par asset bana kar uska
// browser_download_url deta hai. Publish ke baad asset
// cleanupTempVideoAsset() se delete ho jata hai (best-effort).
//
// Env (koi bhi missing ho to woh platform gracefully skip hota hai):
//   GITHUB_TOKEN            — temp release asset ke liye (Actions default token)
//   GITHUB_REPOSITORY       — owner/repo (Actions khud set karta hai)
//   IG_USER_ID              — Instagram professional account id
//   FB_PAGE_TOKEN           — Page token (Instagram isi se post hota hai)
//   THREADS_USER_ID         — Threads user id
//   THREADS_ACCESS_TOKEN    — Threads long-lived token
// =========================================================
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const FB_GRAPH = 'https://graph.facebook.com/v19.0';
const THREADS_GRAPH = 'https://graph.threads.net/v1.0';
const GH_API = 'https://api.github.com';
const TEMP_RELEASE_TAG = 'sg-media-temp';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 120000; // ~2 min max wait (task limit)

// Aakhiri uploaded temp asset — cleanup ke liye yaad rakho.
let lastTempAsset = null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Caption ko limit ke andar line-wise kaato — pehli line hamesha rehti hai
// (hook line wahi hoti hai), baaki lines tab tak judti hain jab tak limit
// ke andar hon. Pehli line hi limit se lambi ho to hard-cut.
function trimCaptionLines(text, limit) {
    const clean = String(text || '');
    if (clean.length <= limit) return clean;
    const kept = [];
    let used = 0;
    for (const line of clean.split('\n')) {
        if (kept.length === 0) {
            kept.push(line.slice(0, limit));
            used = kept[0].length;
            if (line.length > limit) break;
        } else if (used + line.length + 1 <= limit) {
            kept.push(line);
            used += line.length + 1;
        } else {
            break;
        }
    }
    return kept.join('\n');
}

// =========================================================
// 🔗 PUBLIC VIDEO URL — temp GitHub Release asset
// =========================================================
async function getPublicVideoUrl(localPath) {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY; // owner/repo
    if (!token || !repo) {
        console.log('⚠️ GITHUB_TOKEN / GITHUB_REPOSITORY नहीं मिला — public video URL skip।');
        return null;
    }
    if (!localPath || !fs.existsSync(localPath)) {
        console.log('⚠️ Video file नहीं मिली — public video URL skip।');
        return null;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    try {
        // Temp release — pehle se hai to wahi, warna bana lo.
        let release;
        try {
            const res = await axios.get(`${GH_API}/repos/${repo}/releases/tags/${TEMP_RELEASE_TAG}`, { headers });
            release = res.data;
        } catch (getErr) {
            if (!getErr.response || getErr.response.status !== 404) throw getErr;
            const res = await axios.post(`${GH_API}/repos/${repo}/releases`, {
                tag_name: TEMP_RELEASE_TAG,
                name: 'StudyGyaan Temp Media (auto)',
                body: 'Instagram/Threads posting ke liye temp video hosting — assets publish ke baad auto-delete ho jaate hain.',
                draft: false,
                prerelease: true
            }, { headers });
            release = res.data;
        }

        const assetName = `sg_${Date.now()}_${path.basename(localPath)}`.replace(/[^\w.\-]/g, '_');
        const upRes = await axios.post(
            `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
            fs.createReadStream(localPath),
            {
                headers: { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(localPath).size },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            }
        );

        lastTempAsset = { repo, assetId: upRes.data.id };
        console.log('🔗 Public video URL ready (temp release asset)।');
        return upRes.data.browser_download_url;
    } catch (err) {
        console.log('⚠️ Public video URL नहीं बन पाया:', err.response?.data?.message || err.message);
        return null;
    }
}

// Temp release asset delete karo (best-effort — fail ho to sirf log).
// assetId na do to aakhiri uploaded asset delete hota hai.
async function cleanupTempVideoAsset(assetId) {
    const token = process.env.GITHUB_TOKEN;
    const target = assetId
        ? { repo: process.env.GITHUB_REPOSITORY, assetId }
        : lastTempAsset;
    if (!token || !target || !target.repo || !target.assetId) return;
    try {
        await axios.delete(`${GH_API}/repos/${target.repo}/releases/assets/${target.assetId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        console.log('🧹 Temp release asset delete ho gaya।');
    } catch (err) {
        console.log('⚠️ Temp asset cleanup fail (ignore):', err.response?.data?.message || err.message);
    } finally {
        if (lastTempAsset && lastTempAsset.assetId === target.assetId) lastTempAsset = null;
    }
}

// Container status poll — FINISHED tak wait, ERROR/timeout par throw.
async function pollContainer(statusUrl, params, platformLabel) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let status = 'IN_PROGRESS';
    while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const st = await axios.get(statusUrl, { params });
        status = st.data.status_code || st.data.status;
        if (status === 'FINISHED' || status === 'PUBLISHED') return status;
        if (status === 'ERROR' || status === 'EXPIRED') {
            throw new Error(`${platformLabel} container fail state me gaya (status=${status})।`);
        }
    }
    throw new Error(`${platformLabel} container time par FINISHED नहीं हुआ (status=${status})।`);
}

// =========================================================
// 📸 INSTAGRAM REEL — Page token se (IG_USER_ID + FB_PAGE_TOKEN)
// =========================================================
async function postToInstagram({ videoUrl, caption }) {
    const IG_USER_ID = process.env.IG_USER_ID;
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
    if (!IG_USER_ID || !FB_PAGE_TOKEN) {
        console.log('⚠️ IG_USER_ID / FB_PAGE_TOKEN नहीं मिला — Instagram skip।');
        return null;
    }
    if (!videoUrl) {
        console.log('⚠️ Public video URL नहीं है — Instagram skip।');
        return null;
    }

    console.log('📸 Instagram Reel post शुरू...');
    const createRes = await axios.post(`${FB_GRAPH}/${IG_USER_ID}/media`, {
        media_type: 'REELS',
        video_url: videoUrl,
        caption: trimCaptionLines(caption, 2200), // IG caption limit
        access_token: FB_PAGE_TOKEN
    });
    const containerId = createRes.data.id;

    await pollContainer(
        `${FB_GRAPH}/${containerId}`,
        { fields: 'status_code', access_token: FB_PAGE_TOKEN },
        'Instagram'
    );

    const pubRes = await axios.post(`${FB_GRAPH}/${IG_USER_ID}/media_publish`, {
        creation_id: containerId,
        access_token: FB_PAGE_TOKEN
    });
    console.log('✅ Instagram Reel Live! ID: ' + pubRes.data.id);
    return pubRes.data.id;
}

// =========================================================
// 🧵 THREADS VIDEO — apna token (THREADS_USER_ID + THREADS_ACCESS_TOKEN)
// =========================================================
async function postToThreads({ videoUrl, caption }) {
    const THREADS_USER_ID = process.env.THREADS_USER_ID;
    const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
    if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
        console.log('⚠️ THREADS_USER_ID / THREADS_ACCESS_TOKEN नहीं मिला — Threads skip।');
        return null;
    }
    if (!videoUrl) {
        console.log('⚠️ Public video URL नहीं है — Threads skip।');
        return null;
    }

    console.log('🧵 Threads video post शुरू...');
    const createRes = await axios.post(`${THREADS_GRAPH}/${THREADS_USER_ID}/threads`, {
        media_type: 'VIDEO',
        video_url: videoUrl,
        text: trimCaptionLines(caption, 500), // Threads caption limit
        access_token: THREADS_ACCESS_TOKEN
    });
    const containerId = createRes.data.id;

    await pollContainer(
        `${THREADS_GRAPH}/${containerId}`,
        { fields: 'status', access_token: THREADS_ACCESS_TOKEN },
        'Threads'
    );

    const pubRes = await axios.post(`${THREADS_GRAPH}/${THREADS_USER_ID}/threads_publish`, {
        creation_id: containerId,
        access_token: THREADS_ACCESS_TOKEN
    });
    console.log('✅ Threads Post Live! ID: ' + pubRes.data.id);
    return pubRes.data.id;
}

module.exports = {
    getPublicVideoUrl,
    cleanupTempVideoAsset,
    postToInstagram,
    postToThreads,
    trimCaptionLines
};

#!/usr/bin/env node
/**
 * auto_publish_fasttrack.js — ⏰ Fast Track drafts ka auto-publish
 * =====================================================================
 * Eric ka order (2026-11-28): woh panel se manual publish karna bhool
 * jata hai, isliye har 4 ghante ek auto run lagega — fast_track me jo
 * draft pada ho woh apne aap publish ho jaye; draft na ho to run
 * chup-chaap khatam ho jaye.
 *
 * Publish ka matlab bilkul wahi hai jo admin panel karta hai:
 *   status: 'draft' -> 'published'  +  publishedAt: serverTimestamp()
 * Iske baad Firestore trigger (onFastTrackApprovedSendTelegram) khud
 * Telegram alert + video dispatch sambhalta hai — is script ko unse
 * koi lena-dena nahi.
 *
 * Suraksha:
 *  - system_settings/automation: globalEnabled !== true ya
 *    emergencyPause === true ho to kuch publish NAHI hoga.
 *  - Khali article wala draft (articleHtml/content/description teeno
 *    khali) publish NAHI hoga — Eric ka pakka niyam (2026-11-12):
 *    article kabhi khali nahi jana chahiye. Aisa draft skip + log hoga.
 *  - Ek run me zyada se zyada 10 drafts (scraper ke achanak bade batch
 *    se site par ek-saath flood rokne ke liye).
 *  - Har publish par autoPublished: true likha jata hai taaki panel me
 *    pehchana ja sake ki ye auto chala tha.
 *
 * Env: SERVICE_ACCOUNT_JSON (GitHub Secret) — अनिवार्य।
 * Exit: 0 = theek / kuch karne ko nahi, 1 = koi publish fail hua.
 */
'use strict';

const admin = require('firebase-admin');

const MAX_PER_RUN = 10;

function initAdmin() {
    const raw = process.env.SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('SERVICE_ACCOUNT_JSON secret missing.');
    let sa;
    try { sa = JSON.parse(raw); } catch (e) {
        throw new Error('SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    return admin.firestore();
}

function hasContent(d) {
    const html = (d.articleHtml || '').replace(/<[^>]*>/g, '').trim();
    const content = (d.content || '').trim();
    const desc = (d.description || d.shortInfo || '').trim();
    return html.length >= 100 || content.length >= 100 || desc.length >= 40;
}

async function main() {
    const db = initAdmin();

    // Kill-switch: Eric ka automation guard
    const autoSnap = await db.doc('system_settings/automation').get();
    const auto = autoSnap.exists ? autoSnap.data() : {};
    if (auto.globalEnabled !== true || auto.emergencyPause === true) {
        console.log('⏸️ Automation band hai (globalEnabled/emergencyPause) — kuch publish nahi hoga.');
        return;
    }

    const snap = await db.collection('fast_track')
        .where('status', '==', 'draft')
        .limit(MAX_PER_RUN)
        .get();

    if (snap.empty) {
        console.log('ℹ️ Koi draft nahi hai — kuch publish nahi hua.');
        return;
    }

    console.log(`📝 ${snap.size} draft mile.`);
    let published = 0, skipped = 0, failed = 0;

    for (const doc of snap.docs) {
        const d = doc.data();
        if (!hasContent(d)) {
            console.log(`⏭️ SKIP (khali article): ${doc.id} — ${d.title || ''}`);
            skipped++;
            continue;
        }
        try {
            await doc.ref.update({
                status: 'published',
                publishedAt: admin.firestore.FieldValue.serverTimestamp(),
                autoPublished: true,
                autoPublishedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`✅ PUBLISHED: ${d.title || doc.id}`);
            published++;
        } catch (e) {
            console.error(`❌ FAIL: ${doc.id} — ${e.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Natija: published=${published} skipped=${skipped} failed=${failed}`);
    if (failed > 0) process.exitCode = 1;
}

main().catch(e => { console.error('❌ Auto-publish fatal:', e.message); process.exit(1); });

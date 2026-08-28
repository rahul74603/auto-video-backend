"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "studymaterial-406ad";
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({
    projectId: "studymaterial-406ad",
    storageBucket: "studymaterial-406ad.firebasestorage.app"
});
delete process.env.GEMINI_API_KEY;
delete process.env.SERVICE_ACCOUNT_JSON;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

test("firebase-functions/v1 exposes the v1 firestore document API", () => {
    const functions = require("firebase-functions/v1");
    assert.equal(typeof functions.firestore.document, "function");
    assert.equal(typeof functions.https.onRequest, "function");
    const written = functions.firestore.document("fast_track/{docId}").onWrite;
    const created = functions.firestore.document("jobs/{jobId}").onCreate;
    assert.equal(typeof written, "function");
    assert.equal(typeof created, "function");
});

test("fast_track_updates.js loads without functions.firestore.document TypeError", () => {
    const mod = require("../fast_track_updates");
    assert.equal(typeof mod.onFastTrackApprovedSendTelegram, "function");
    assert.equal(typeof mod.runFastTrackLogic, "function");
    assert.equal(typeof mod.fetchFastTrackUpdates, "function");
    assert.equal(typeof mod.triggerFastTrackUpdates, "function");
});

test("govt_jobs.js loads without functions.firestore.document TypeError", () => {
    const mod = require("../govt_jobs");
    assert.equal(typeof mod.onJobPublishedNotify, "function");
    assert.equal(typeof mod.runJobScraper, "function");
    assert.equal(typeof mod.fetchLatestGovtJobs, "function");
});

test("scraper sources keep v1 trigger paths and do not rewrite collection names", () => {
    const fastTrack = fs.readFileSync(path.join(__dirname, "../fast_track_updates.js"), "utf8");
    const govtJobs = fs.readFileSync(path.join(__dirname, "../govt_jobs.js"), "utf8");
    assert.match(fastTrack, /require\("firebase-functions\/v1"\)/);
    assert.match(govtJobs, /require\("firebase-functions\/v1"\)/);
    assert.match(fastTrack, /onDocumentWritten\("fast_track\/\{docId\}"\)/);
    assert.match(govtJobs, /onDocumentCreated\("jobs\/\{jobId\}"\)/);
    assert.match(fastTrack, /exports\.onFastTrackApprovedSendTelegram/);
    assert.match(govtJobs, /exports\.onJobPublishedNotify/);
    assert.doesNotMatch(fastTrack, /require\("firebase-functions"\)/);
    assert.doesNotMatch(govtJobs, /require\("firebase-functions"\)/);
});

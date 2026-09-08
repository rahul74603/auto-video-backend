/**
 * cpanel_storage.js — 🆓 FREE image/file hosting on cPanel (via FTP)
 * ===================================================================
 * Firebase Storage Feb 2026 se Spark (free) plan pe BAND ho gaya (error 402).
 * Ye module uski jagah images ko cPanel pe upload karta hai:
 *
 *     https://studygyaan.in/uploads/...
 *
 * Env vars (GitHub secrets — wahi jo seo-daily.yml use karta hai):
 *   FTP_SERVER    e.g. server17213-10344.hostycare.online
 *   FTP_USERNAME  e.g. githubseo@studygyaan.in
 *   FTP_PASSWORD
 *
 * Usage:
 *   const { uploadBuffer } = require("./cpanel_storage");
 *   const url = await uploadBuffer(webpBuffer, "uploads/blog_images/x.webp");
 *   // → "https://studygyaan.in/uploads/blog_images/x.webp"
 */

"use strict";

const path = require("path");

const SITE_URL = "https://studygyaan.in";

/**
 * Buffer ko cPanel pe FTP se upload karo.
 * @param {Buffer} buffer - file data
 * @param {string} remotePath - e.g. "uploads/blog_images/abc.webp" (public_html ke relative)
 * @returns {Promise<string>} public URL
 */
async function uploadBuffer(buffer, remotePath) {
  const host = process.env.FTP_SERVER;
  const user = process.env.FTP_USERNAME;
  const password = process.env.FTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      "cPanel FTP config missing — FTP_SERVER / FTP_USERNAME / FTP_PASSWORD env set karo (GitHub secrets already bane hue hain, workflow ke env block me add karo)"
    );
  }

  const ftp = require("basic-ftp");
  const { Readable } = require("stream");

  const clean = String(remotePath).replace(/^\/+/, "");
  const dir = path.posix.dirname(clean);
  const base = path.posix.basename(clean);

  const client = new ftp.Client(30000);
  try {
    await client.access({ host, user, password, secure: false });
    if (dir && dir !== ".") {
      await client.ensureDir(dir); // banata bhi hai, cd bhi karta hai
    }
    await client.uploadFrom(Readable.from(buffer), base);
    return `${SITE_URL}/${clean}`;
  } finally {
    client.close();
  }
}

module.exports = { uploadBuffer, SITE_URL };

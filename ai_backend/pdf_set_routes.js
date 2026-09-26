"use strict";

/**
 * ==============================================
 *  PDF → SET ROUTES (Express)
 * ==============================================
 *   POST /pdf-set/extract  { pdfBase64, exam, subject }
 *     → questions preview (extract + rewrite + answer-guard)
 *   POST /pdf-set/publish  { packId, folderId, setNumber, exam, subject,
 *                            questions, title? }
 *     → PREMIUM content doc: courses/{packId}/content (paid course ke andar
 *       — free mock_tests me KUCH nahi jata, leak impossible)
 *
 * Mount: registerPdfSetRoutes(app, db, { authMiddleware }) — article_routes
 * wala hi pattern (AGENT_ADMIN_TOKEN / Firebase ID token via articleAuth).
 */

const express = require("express");
const admin = require("firebase-admin");
const {
  extractQuestionsFromPdf,
  rewriteExtractedQuestions,
} = require("./pdf_set_pipeline");
const { renderSetHtml, validateForPublish } = require("./pdf_set_builder");

const MAX_PDF_BASE64 = 14 * 1024 * 1024; // ~10MB PDF ka base64
const MAX_QUESTIONS = 300;

function registerPdfSetRoutes(app, db, { authMiddleware } = {}) {
  const protect =
    typeof authMiddleware === "function"
      ? authMiddleware
      : (_req, _res, next) => next();
  const router = express.Router();

  // ---------- EXTRACT ----------
  router.post("/pdf-set/extract", protect, async (req, res) => {
    try {
      const { pdfBase64, exam } = req.body || {};
      if (!pdfBase64 || String(pdfBase64).length < 100) {
        return res
          .status(400)
          .json({ success: false, error: "pdfBase64 required" });
      }
      if (String(pdfBase64).length > MAX_PDF_BASE64) {
        return res.status(413).json({
          success: false,
          error: "PDF bahut bada hai (max ~10MB). Chhote parts me bhejo.",
        });
      }

      const extracted = await extractQuestionsFromPdf({ pdfBase64, exam });
      const rewritten = await rewriteExtractedQuestions({
        questions: extracted,
        exam,
      });

      const reviewCount = rewritten.filter((q) => q.flag === "REVIEW").length;
      return res.json({
        success: true,
        questions: rewritten,
        stats: {
          extracted: extracted.length,
          rewritten: rewritten.length,
          needsReview: reviewCount,
        },
      });
    } catch (error) {
      console.error("pdf-set/extract failed:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ---------- PUBLISH ----------
  router.post("/pdf-set/publish", protect, async (req, res) => {
    try {
      const {
        packId,
        folderId,
        setNumber,
        exam,
        subject,
        questions,
        title,
        sourceNote,
      } = req.body || {};

      if (!packId) {
        return res
          .status(400)
          .json({ success: false, error: "packId (course) required" });
      }
      const num = Number(setNumber) || 1;
      const cleanQuestions = validateForPublish(questions);
      if (!cleanQuestions.length) {
        return res.status(400).json({
          success: false,
          error: "Koi valid publish-ready question nahi (qText + 4 options + answer chahiye)",
        });
      }
      if (cleanQuestions.length > MAX_QUESTIONS) {
        return res.status(400).json({
          success: false,
          error: `Max ${MAX_QUESTIONS} questions per set (mile ${cleanQuestions.length})`,
        });
      }

      // Course exist karta hai? (galat packId pe orphan content na bane)
      const courseSnap = await db.collection("courses").doc(packId).get();
      if (!courseSnap.exists) {
        return res
          .status(404)
          .json({ success: false, error: `Course ${packId} nahi mila` });
      }

      const subjectText = String(subject || exam || "Practice").trim();
      const docTitle =
        String(title || "").trim() ||
        `${subjectText} — Practice Set ${num} (PDF)`;

      const content = renderSetHtml({
        exam,
        subject: subjectText,
        setNumber: num,
        questions: cleanQuestions,
        sourceNote,
      });

      const docData = {
        title: docTitle,
        type: "article",
        content,
        parentId: folderId || null,
        setNumber: num,
        topic: subjectText,
        exam: String(exam || ""),
        subject: subjectText,
        subjectType: "pdf_import",
        source: "pdf_import",
        questionCount: cleanQuestions.length,
        reviewCount: cleanQuestions.filter((q) => q.flag === "REVIEW").length,
        branding: {
          website: "studygyaan.in",
          watermark: "StudyGyaan",
        },
        aiProvider: "gemini",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "published",
      };

      const docRef = await db
        .collection("courses")
        .doc(packId)
        .collection("content")
        .add(docData);

      return res.json({
        success: true,
        id: docRef.id,
        title: docTitle,
        setNumber: num,
        questionCount: cleanQuestions.length,
      });
    } catch (error) {
      console.error("pdf-set/publish failed:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.use(router);
}

module.exports = { registerPdfSetRoutes };

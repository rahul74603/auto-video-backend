/**
 * 📄 PDF/Image se text nikalne ka browser-side jugad (AI Article Studio).
 *
 * KYUN: kuch sarkari sites (jaise HPSC) humara cloud server block karti hain —
 * server se PDF fetch ho hi nahi pata. Aur kai notification PDFs SCANNED hoti
 * hain (photo), jinse Ctrl+C se text copy bhi nahi hota.
 *
 * JUGAAD: admin apne apne browser me PDF/Image upload kare — text yahin
 * nikal jayega (server ki zaroorat hi nahi), phir existing "Source Text"
 * paste flow se article banega.
 *
 *   1. Text-based PDF  → pdfjs se seedha text layer (fast)
 *   2. Scanned PDF     → har page canvas pe render → tesseract OCR
 *   3. Plain image     → seedha tesseract OCR
 *
 * Dono heavy libraries LAZY-LOAD hoti hain (dynamic import) — main bundle
 * halka rehta hai, ye sirf tab aati hain jab admin ye button dabaye.
 */

/** Ek page pe itne से kam printable chars mile to PDF ko "scanned/photo" maano. */
export const MIN_TEXT_CHARS_PER_PAGE = 40;

/** OCR ki safety limit — bahut badi scanned PDF browser ko hang na kar de. */
export const MAX_OCR_PAGES = 30;

/** Upload button ko support hone wali file extensions. */
const SUPPORTED_FILE_RE = /\.(pdf|png|jpe?g|webp|bmp)$/i;

/** Kya ye file extraction ke liye valid hai (PDF ya image)? */
export const isSupportedExtractFile = (fileName: string): boolean =>
  SUPPORTED_FILE_RE.test(fileName.trim());

/** Sirf PDF check — images ka flow alag hai. */
export const isPdfFile = (fileName: string): boolean => /\.pdf$/i.test(fileName.trim());

/**
 * Nikalne ke baad ka raw text saaf karo — CRLF/line-start-end spaces/
 * multi-space/blank-line spam normalize karo. OCR output hamesha noisy hota hai.
 */
export const cleanExtractedText = (raw: string): string =>
  raw
    .replace(/\r\n?/g, '\n') // CRLF → LF
    .replace(/^[ \t]+/gm, '') // line ki shuruaat ke spaces
    .replace(/[ \t]+\n/g, '\n') // line ke aakhir ke spaces
    .replace(/\n{3,}/g, '\n\n') // 3+ blank lines → 1 blank line
    .replace(/[ \t]{2,}/g, ' ') // multi-space → single space
    .trim();

/**
 * Kya nikala hua text itna patla hai ki PDF "scanned" maani jaye
 * (aur OCR pass chalana chahiye)?
 */
export const needsOcr = (text: string, pageCount: number): boolean =>
  text.replace(/\s/g, '').length / Math.max(pageCount, 1) < MIN_TEXT_CHARS_PER_PAGE;

/** Extraction progress — UI me status line dikhane ke liye. */
export interface ExtractProgress {
  stage: 'read' | 'ocr';
  page: number;
  totalPages: number;
}

export type ExtractProgressHandler = (progress: ExtractProgress) => void;

/** Tesseract worker type — heavy lib ko type-only import (bundle me nahi aata). */
type OcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;

/** Ek lazy tesseract worker banao (english — sarkari roll-lists mostly eng/digits). */
const createOcrWorker = async (): Promise<OcrWorker> => {
  const tesseract = await import('tesseract.js');
  return tesseract.createWorker('eng');
};

/** Plain image file ka OCR. */
const ocrImageFile = async (
  file: File,
  onProgress?: ExtractProgressHandler,
): Promise<string> => {
  const worker = await createOcrWorker();
  try {
    onProgress?.({ stage: 'ocr', page: 1, totalPages: 1 });
    const result = await worker.recognize(file);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
};

/** pdfjs instance ko worker-src ke saath ready karo (Vite asset URL se). */
const loadPdfJs = async (): Promise<typeof import('pdfjs-dist')> => {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  return pdfjs;
};

/**
 * PDF se text nikalo — pehle text layer try karo (fast, no OCR);
 * text bahut patla nikle (scanned/photo PDF) to har page render karke OCR.
 */
const extractFromPdf = async (
  file: File,
  onProgress?: ExtractProgressHandler,
): Promise<string> => {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const totalPages = doc.numPages;

    // ---- Pass 1: asli text layer (text-based PDF ke liye — kaafi fast) ----
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();
      pageTexts.push(text);
      page.cleanup();
      onProgress?.({ stage: 'read', page: pageNum, totalPages });
    }
    const joinedRaw = pageTexts.join('\n\n');
    if (!needsOcr(joinedRaw, totalPages)) {
      return cleanExtractedText(joinedRaw);
    }

    // ---- Pass 2: SCANNED/photo PDF — har page ko canvas pe render karke OCR ----
    const ocrTotal = Math.min(totalPages, MAX_OCR_PAGES);
    const worker = await createOcrWorker();
    const ocrPages: string[] = [];
    try {
      const canvas = document.createElement('canvas');
      for (let pageNum = 1; pageNum <= ocrTotal; pageNum += 1) {
        const page = await doc.getPage(pageNum);
        // 2x scale — OCR accuracy ke liye bada render zaroori hai
        const viewport = page.getViewport({ scale: 2 });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        page.cleanup();
        const result = await worker.recognize(canvas);
        ocrPages.push(result.data.text.trim());
        onProgress?.({ stage: 'ocr', page: pageNum, totalPages: ocrTotal });
      }
    } finally {
      await worker.terminate();
    }
    let out = cleanExtractedText(ocrPages.join('\n\n'));
    if (totalPages > ocrTotal) {
      out += `\n\n[ध्यान दें: PDF ke sirf pehle ${ocrTotal}/${totalPages} pages padhe gaye — baaki chahiye to unka text alag se box me jod do.]`;
    }
    return out;
  } finally {
    await loadingTask.destroy();
  }
};

/**
 * Admin ki upload ki hui file (PDF ya image) se saaf text nikalo.
 * Fail hone par Hinglish reason ke saath Error throw karta hai.
 */
export const extractTextFromFile = async (
  file: File,
  onProgress?: ExtractProgressHandler,
): Promise<string> => {
  if (!isSupportedExtractFile(file.name)) {
    throw new Error('Ye file type support nahi hoti — PDF ya image (PNG/JPG/WebP/BMP) upload karo.');
  }
  if (file.size === 0) {
    throw new Error('File khaali hai — dobara save karke upload karo.');
  }
  if (isPdfFile(file.name)) {
    return extractFromPdf(file, onProgress);
  }
  const text = await ocrImageFile(file, onProgress);
  return cleanExtractedText(text);
};

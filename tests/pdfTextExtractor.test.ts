import { describe, expect, it } from 'vitest';
import {
  cleanExtractedText,
  isPdfFile,
  isSupportedExtractFile,
  MAX_OCR_PAGES,
  MIN_TEXT_CHARS_PER_PAGE,
  needsOcr,
} from '../src/features/ai-articles/data/pdfTextExtractor';

describe('pdfTextExtractor — file type checks', () => {
  it('accepts PDF aur common image files', () => {
    expect(isSupportedExtractFile('notice.pdf')).toBe(true);
    expect(isSupportedExtractFile('roll-list.PDF')).toBe(true);
    expect(isSupportedExtractFile('photo.png')).toBe(true);
    expect(isSupportedExtractFile('scan.JPG')).toBe(true);
    expect(isSupportedExtractFile('page.jpeg')).toBe(true);
    expect(isSupportedExtractFile('clip.webp')).toBe(true);
    expect(isSupportedExtractFile('pic.bmp')).toBe(true);
  });

  it('rejects non-image/non-pdf files', () => {
    expect(isSupportedExtractFile('notes.txt')).toBe(false);
    expect(isSupportedExtractFile('sheet.xlsx')).toBe(false);
    expect(isSupportedExtractFile('movie.mp4')).toBe(false);
    expect(isSupportedExtractFile('no-extension')).toBe(false);
  });

  it('detects PDF separately from images', () => {
    expect(isPdfFile('a.pdf')).toBe(true);
    expect(isPdfFile('a.png')).toBe(false);
  });
});

describe('pdfTextExtractor — cleanExtractedText', () => {
  it('OCR noise ko saaf karta hai (CRLF, line spaces, blank-line spam, multi-space)', () => {
    const raw = 'Roll No   \r\n\r\n\r\n  1234    5678\r\nName\r\n\r\n\r\n  Rahul';
    expect(cleanExtractedText(raw)).toBe('Roll No\n\n1234 5678\nName\n\nRahul');
  });

  it('trims overall whitespace', () => {
    expect(cleanExtractedText('   hello   \n\n\n  ')).toBe('hello');
  });

  it('single blank line preserve karta hai', () => {
    expect(cleanExtractedText('a\n\nb')).toBe('a\n\nb');
  });
});

describe('pdfTextExtractor — needsOcr (scanned PDF detection)', () => {
  it('bahut patla text per page → OCR chahiye (scanned/photo PDF)', () => {
    expect(needsOcr('ab', 3)).toBe(true);
    expect(needsOcr('', 5)).toBe(true);
  });

  it('theek-thaak text per page → OCR ki zaroorat nahi (text PDF)', () => {
    expect(needsOcr('x'.repeat(500), 2)).toBe(false);
    expect(needsOcr('y'.repeat(MIN_TEXT_CHARS_PER_PAGE), 1)).toBe(false);
  });

  it('whitespace-only text ko asli text nahi maanta', () => {
    expect(needsOcr('   \n\n   ', 1)).toBe(true);
  });

  it('page count 0 pe bhi safe hai (division guard)', () => {
    expect(needsOcr('chhota', 0)).toBe(true);
  });
});

describe('pdfTextExtractor — thresholds sane hain', () => {
  it('constants meaningful range me hain', () => {
    expect(MIN_TEXT_CHARS_PER_PAGE).toBeGreaterThan(0);
    expect(MAX_OCR_PAGES).toBeGreaterThanOrEqual(10);
  });
});

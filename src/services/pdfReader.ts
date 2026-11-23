import type {ImportPageState, PageSendMode} from '../types.ts';
import {detectPrintedPageNumber} from './materialImport.ts';
import {
  getCachedPageImage,
  renderPdfPageToImages,
  type CachedPageImage,
} from './pageRenderer.ts';

export interface MathTextHealthReport {
  isGarbled: boolean;
  hasFormulaSignals: boolean;
  hasFigureCue: boolean;
  hasAnswerKeyCue: boolean;
  sendMode: PageSendMode;
  reasons: string[];
}

export interface PdfReadPageResult {
  pagePdf: number;
  pagePrinted?: string;
  text: string;
  state: ImportPageState;
  cachedImage: CachedPageImage | null;
}

export interface PdfDocumentReadResult {
  fileName: string;
  fileSha256: string;
  totalPages: number;
  startPage: number;
  endPage: number;
  readCount: number;
  imageUsedCount: number;
  errorCount: number;
  pages: PdfReadPageResult[];
  combinedText: string;
  summaryText_vi: string;
}

export type PdfInputSource = File | Uint8Array;

/**
 * Computes SHA-256 hex digest of a File or Uint8Array using WebCrypto (with deterministic FNV fallback).
 */
export async function computeSha256Hex(source: PdfInputSource): Promise<string> {
  const bytes =
    source instanceof Uint8Array
      ? new Uint8Array(source.slice())
      : new Uint8Array(await source.arrayBuffer());

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic 128-bit fallback for non-subtle test contexts
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[i] + ((i & 0xff) << 1);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}_${bytes.length}`;
}

/**
 * Detects whether a PDF page's extracted text layer has broken/missing math notation
 * or references figures, deciding whether to send image+text, image-only, or text-only to Gemini.
 */
export function analyzePageMathTextHealth(rawText: string): MathTextHealthReport {
  const text = (rawText ?? '').trim();
  const reasons: string[] = [];

  // 1. Scanned / sparse text
  if (text.length < 45) {
    reasons.push('Trang ít chữ hoặc ảnh quét (< 45 ký tự)');
  }

  // 2. Private Use Area (U+E000..U+F8FF) or Unicode replacement glyphs (broken MathType/Equation fonts)
  const puaMatches = text.match(/[\uE000-\uF8FF\uFFFD]/g) ?? [];
  if (puaMatches.length >= 2) {
    reasons.push(`Phát hiện ${puaMatches.length} ký tự font toán bị lỗi mã (Unicode PUA)`);
  }

  // 3. Figure cues ("như hình", "hình dưới", "hình vẽ", "hình bên")
  const hasFigureCue =
    /(?:như\s+hình|hình\s+dưới|hình\s+vẽ|hình\s+bên|xem\s+hình|hình\s+minh\s+họa)/i.test(text);
  if (hasFigureCue) {
    reasons.push('Có nhắc đến hình vẽ minh họa');
  }

  // 4. Math formula signals vs missing math symbols
  const hasMathKeywords =
    /(?:\bsin\b|\bcos\b|\btan\b|\bcot\b|tam\s+giác|định\s+l[íý]|diện\s+tích|bán\s+kính|đường\s+cao|góc\s+[A-Z]|cạnh\s+[a-zA-Z]{1,2}|côsin|heron|câu\s+\d+|bài\s+\d+)/i.test(
      text,
    );
  const hasStandardMathSymbols = /[∠^√≈π°⊥≤≥±·×÷∞∑]/.test(text);
  const hasMissingSymbolPatterns =
    /(?:goc\s+[A-Z]\s*=\s*\d+(?!\s*°)|(?:sin|cos|tan|cot)\s*\d+(?!\s*°)|\b[a-z]\s+2\s*[+\-=]|can\s+\d|phan\s+so|\?\s*=\s*\d|\b\d+\s*\?\s*\d)/i.test(
      text,
    ) || (hasMathKeywords && /\b\d{1,3}\s*(?:va|và|,)\s*\d{1,3}\b/i.test(text) && !hasStandardMathSymbols);

  if (hasMissingSymbolPatterns) {
    reasons.push('Thiếu ký hiệu toán học chuẩn (°, ∠, √, ^, phân số...)');
  }

  // 5. High ratio of non-alphanumeric / strange control symbols
  const nonWs = text.replace(/\s+/g, '');
  if (nonWs.length >= 30) {
    const strangeChars = nonWs.match(/[^0-9a-zA-ZÀ-ỹ.,;:!?()[\]{}"'–—\-+*/=<>°^√≈π⊥∠%]/g) ?? [];
    const ratio = strangeChars.length / nonWs.length;
    if (ratio > 0.12 && strangeChars.length >= 4) {
      reasons.push(`Tỉ lệ ký tự lạ cao (${Math.round(ratio * 100)}%)`);
    }
  }

  // 6. Answer-key / solution table cue
  const hasAnswerKeyCue =
    /(?:bảng\s+đáp\s+án|đáp\s+án\s+(?:tham\s+khảo|chi\s+tiết|phần|mã\s+đề)|hướng\s+dẫn\s+giải|lời\s+giải\s+chi\s+tiết|(?:câu\s+\d+\s+){3,})/i.test(
      text,
    );

  const hasFormulaSignals = hasMathKeywords || hasStandardMathSymbols || /[=+\-*/^√°]/.test(text);
  const isGarbled = reasons.length > 0;

  let sendMode: PageSendMode;
  if (text.length < 45) {
    sendMode = 'image_only';
  } else if (isGarbled || hasFormulaSignals) {
    // Default rule (Section 2.4): send BOTH image + text for every page with formulas or garbled text
    sendMode = 'image_and_text';
  } else {
    sendMode = 'text_only';
  }

  return {
    isGarbled,
    hasFormulaSignals,
    hasFigureCue,
    hasAnswerKeyCue,
    sendMode,
    reasons,
  };
}

/**
 * Formats the consistent PDF reading status banner required by Section 2.2:
 * "PDF {tổng} trang · Khoảng đọc {a}–{b} · Đã đọc {x}/{y} trang · {z} trang dùng ảnh · {w} trang lỗi"
 */
export function formatPdfStatusSummary(stats: {
  totalPages: number;
  startPage: number;
  endPage: number;
  readCount: number;
  imageUsedCount: number;
  errorCount: number;
}): string {
  const expectedCount = Math.max(0, stats.endPage - stats.startPage + 1);
  return `PDF ${stats.totalPages} trang · Khoảng đọc ${stats.startPage}–${stats.endPage} · Đã đọc ${stats.readCount}/${expectedCount} trang · ${stats.imageUsedCount} trang dùng ảnh · ${stats.errorCount} trang lỗi`;
}

/**
 * Safely opens a fresh Uint8Array copy of the PDF (never reusing a transferred/detached ArrayBuffer),
 * extracts BOTH text layer and rendered Canvas image per page, and always destroys the pdf.js worker task.
 */
export async function readPdfDocumentRange(
  source: PdfInputSource,
  options?: {
    fileName?: string;
    fileSha256?: string;
    startPage?: number;
    endPage?: number;
    renderImages?: boolean;
    onPageDone?: (pageResult: PdfReadPageResult, index: number, totalInRange: number) => void;
    signal?: AbortSignal;
  },
): Promise<PdfDocumentReadResult> {
  const fileName =
    options?.fileName ?? (source instanceof File ? source.name : 'tai-lieu.pdf');

  // CRITICAL (Section 2.1): ALWAYS acquire a brand-new Uint8Array copy so pdf.js worker
  // transfers never detach the caller's File or Uint8Array across repeated reads!
  const rawBytes =
    source instanceof Uint8Array
      ? new Uint8Array(source.slice())
      : new Uint8Array(await source.arrayBuffer());

  const fileSha256 = options?.fileSha256 || (await computeSha256Hex(rawBytes));

  const pdfjsLib = await import('pdfjs-dist');
  // Configure browser worker only when running in Vite/browser bundle
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
    } catch {
      // Non-Vite test environment
    }
  }

  // Pass an independent cloned Uint8Array to getDocument (pdf.js may transfer its backing buffer to worker)
  const docBytes = new Uint8Array(rawBytes.slice());
  const loadingTask = pdfjsLib.getDocument({
    data: docBytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdf: any = null;
  try {
    pdf = await loadingTask.promise;
    const totalPages: number = pdf.numPages;

    const requestedStart = Number.isFinite(options?.startPage) ? Math.floor(options!.startPage!) : 1;
    const requestedEnd = Number.isFinite(options?.endPage) ? Math.floor(options!.endPage!) : totalPages;
    const startPage = Math.max(1, Math.min(requestedStart, totalPages));
    const endPage = Math.max(startPage, Math.min(requestedEnd, totalPages));
    const totalInRange = endPage - startPage + 1;

    const pages: PdfReadPageResult[] = [];
    let readCount = 0;
    let imageUsedCount = 0;
    let errorCount = 0;
    const shouldRender = options?.renderImages !== false && typeof document !== 'undefined';

    for (let p = startPage; p <= endPage; p++) {
      if (options?.signal?.aborted) {
        throw new Error('Đã hủy đọc tệp PDF theo yêu cầu.');
      }

      try {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const rawLines = textContent.items
          .map((item: {str?: string}) => (typeof item?.str === 'string' ? item.str : ''))
          .join('\n');
        const text = textContent.items
          .map((item: {str?: string}) => (typeof item?.str === 'string' ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        const pagePrinted = detectPrintedPageNumber(rawLines);
        const health = analyzePageMathTextHealth(text);

        let cachedImage: CachedPageImage | null = null;
        if (shouldRender) {
          cachedImage =
            (await getCachedPageImage(fileSha256, p)) ??
            (await renderPdfPageToImages(page, fileSha256, p));
        }

        const usesImage =
          health.sendMode !== 'text_only' && Boolean(cachedImage?.imageBase64);
        if (usesImage) imageUsedCount += 1;
        readCount += 1;

        const state: ImportPageState = {
          pagePdf: p,
          pagePrinted,
          status: usesImage ? 'image_used' : 'read',
          sendMode: usesImage ? health.sendMode : 'text_only',
          textLength: text.length,
          mathGarbledReasons: health.reasons,
          hasFigureCue: health.hasFigureCue,
          hasAnswerKeyCue: health.hasAnswerKeyCue,
        };

        const resultItem: PdfReadPageResult = {
          pagePdf: p,
          pagePrinted,
          text,
          state,
          cachedImage,
        };
        pages.push(resultItem);
        options?.onPageDone?.(resultItem, p - startPage + 1, totalInRange);

        if (typeof page.cleanup === 'function') {
          page.cleanup();
        }
      } catch (pageErr) {
        errorCount += 1;
        console.error(`[pdfReader] Lỗi đọc trang ${p}:`, pageErr);
        const errState: ImportPageState = {
          pagePdf: p,
          status: 'error',
          sendMode: 'image_only',
          textLength: 0,
          mathGarbledReasons: [],
          hasFigureCue: false,
          hasAnswerKeyCue: false,
          errorMessage: 'Không đọc được trang này, hãy bấm "Thử lại trang này".',
        };
        const errResult: PdfReadPageResult = {
          pagePdf: p,
          text: '',
          state: errState,
          cachedImage: null,
        };
        pages.push(errResult);
        options?.onPageDone?.(errResult, p - startPage + 1, totalInRange);
      }
    }

    const combinedText = pages
      .map((pg) => {
        const tag = `[Trang PDF ${pg.pagePdf}${pg.pagePrinted ? ` | Trang in ${pg.pagePrinted}` : ''}${pg.state.sendMode !== 'text_only' ? ' | Gửi ảnh + chữ' : ''}]`;
        return `${tag}\n${pg.text || '(Trang ảnh — AI sẽ đọc từ ảnh trang)'}`;
      })
      .join('\n\n');

    const summaryText_vi = formatPdfStatusSummary({
      totalPages,
      startPage,
      endPage,
      readCount,
      imageUsedCount,
      errorCount,
    });

    return {
      fileName,
      fileSha256,
      totalPages,
      startPage,
      endPage,
      readCount,
      imageUsedCount,
      errorCount,
      pages,
      combinedText,
      summaryText_vi,
    };
  } finally {
    try {
      if (pdf && typeof pdf.cleanup === 'function') {
        await pdf.cleanup();
      }
      if (pdf && typeof pdf.destroy === 'function') {
        await pdf.destroy();
      }
    } catch {
      // Ignore cleanup error
    }
    try {
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        await loadingTask.destroy();
      }
    } catch {
      // Ignore loadingTask destroy error
    }
  }
}

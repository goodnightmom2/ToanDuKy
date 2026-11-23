import type {FigureBBox} from '../types.ts';

const IDB_NAME = 'toanduky_pdf_page_cache_v1';
const IDB_STORE = 'page_images';

export interface CachedPageImage {
  key: string; // `${sha256}:p${pagePdf}`
  sha256: string;
  pagePdf: number;
  imageBase64: string; // JPEG base64 without data: prefix (for Gemini)
  dataUrl: string; // Full data:image/jpeg;base64,... (for preview/crop)
  thumbDataUrl: string; // Small thumbnail for page strip
  width: number;
  height: number;
  savedAt: number;
}

const memoryImageCache = new Map<string, CachedPageImage>();

function makePageImageKey(sha256: string, pagePdf: number): string {
  return `${sha256 || 'mem'}:p${pagePdf}`;
}

function openImageDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, {keyPath: 'key'});
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveCachedPageImage(entry: Omit<CachedPageImage, 'key' | 'savedAt'>): Promise<CachedPageImage> {
  const full: CachedPageImage = {
    ...entry,
    key: makePageImageKey(entry.sha256, entry.pagePdf),
    savedAt: Date.now(),
  };
  memoryImageCache.set(full.key, full);
  const db = await openImageDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(full);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    db.close();
  }
  return full;
}

export async function getCachedPageImage(sha256: string, pagePdf: number): Promise<CachedPageImage | null> {
  const key = makePageImageKey(sha256, pagePdf);
  const inMem = memoryImageCache.get(key);
  if (inMem) return inMem;

  const db = await openImageDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const found = (req.result as CachedPageImage | undefined) ?? null;
        if (found) memoryImageCache.set(key, found);
        db.close();
        resolve(found);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function clearCachedPageImagesForFile(sha256: string): Promise<void> {
  const prefix = `${sha256}:`;
  for (const key of Array.from(memoryImageCache.keys())) {
    if (key.startsWith(prefix)) memoryImageCache.delete(key);
  }
  const db = await openImageDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          if (String(cursor.key).startsWith(prefix)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Renders a pdf.js PDFPageProxy to both a high-clarity JPEG (~1.6x scale) for Gemini multimodal
 * and a lightweight JPEG thumbnail (~0.26x scale) for the page strip UI.
 * Never persists images to Supabase; keeps them only in RAM + browser IndexedDB.
 */
export async function renderPdfPageToImages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfPage: any,
  sha256: string,
  pagePdf: number,
  options?: {scale?: number; quality?: number},
): Promise<CachedPageImage | null> {
  if (typeof document === 'undefined') return null;

  const scale = options?.scale ?? 2.2;
  const quality = options?.quality ?? 0.84;

  const viewport = pdfPage.getViewport({scale});
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({canvasContext: ctx, viewport, canvas}).promise;

  // Compress JPEG so payload stays <= 1.2 MB even on dense exam pages
  let q = quality;
  let dataUrl = canvas.toDataURL('image/jpeg', q);
  while (dataUrl.length > 1_550_000 && q > 0.45) {
    q -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', q);
  }
  const imageBase64 = dataUrl.split(',')[1] ?? '';

  // Create lightweight thumbnail (~140px wide)
  const thumbW = 140;
  const thumbScale = Math.min(1, thumbW / Math.max(1, canvas.width));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.max(1, Math.round(canvas.width * thumbScale));
  thumbCanvas.height = Math.max(1, Math.round(canvas.height * thumbScale));
  const tCtx = thumbCanvas.getContext('2d');
  if (tCtx) {
    tCtx.fillStyle = '#FFFFFF';
    tCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
    tCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.68);

  // Release canvas backing buffers promptly to avoid memory bloat on 20+ page PDFs
  const width = canvas.width;
  const height = canvas.height;
  canvas.width = 0;
  canvas.height = 0;
  thumbCanvas.width = 0;
  thumbCanvas.height = 0;

  return saveCachedPageImage({
    sha256,
    pagePdf,
    imageBase64,
    dataUrl,
    thumbDataUrl,
    width,
    height,
  });
}

/**
 * Crops a normalized figure_bbox (0..1) from a cached page image and compresses it
 * to <= 150 KB JPEG dataURL for optional private classroom storage when Admin approves.
 */
export async function cropFigureFromPageDataUrl(
  pageDataUrl: string,
  bbox: FigureBBox,
  maxBytes = 150 * 1024,
): Promise<{dataUrl: string; approxBytes: number} | null> {
  if (typeof document === 'undefined' || !pageDataUrl) return null;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = pageDataUrl;
  });
  if (!img || img.width <= 0 || img.height <= 0) return null;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  const x0 = clamp01(bbox.x);
  const y0 = clamp01(bbox.y);
  const w0 = Math.max(0.05, Math.min(1 - x0, clamp01(bbox.w)));
  const h0 = Math.max(0.05, Math.min(1 - y0, clamp01(bbox.h)));

  const sx = Math.round(x0 * img.width);
  const sy = Math.round(y0 * img.height);
  const sw = Math.max(16, Math.round(w0 * img.width));
  const sh = Math.max(16, Math.round(h0 * img.height));

  const maxDim = 920;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, Math.round(sw * scale));
  canvas.height = Math.max(16, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  let q = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', q);
  const maxDataUrlLen = Math.floor((maxBytes * 4) / 3);
  while (dataUrl.length > maxDataUrlLen && q > 0.3) {
    q -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', q);
  }
  const approxBytes = Math.round((dataUrl.length * 3) / 4);
  canvas.width = 0;
  canvas.height = 0;

  return {dataUrl, approxBytes};
}

import type {AnswerKeyEntry, ImportBatchRecord, QuestionItem} from '../types.ts';

const CACHE_STORAGE_KEY = 'tdk_ai_extract_cache_v2';
const MAX_CACHE_ENTRIES = 60;

export interface ExtractionCacheEntry {
  key: string;
  sha256: string;
  pageRange: string;
  promptVersion: string;
  model: string;
  items: QuestionItem[];
  answerKeys: AnswerKeyEntry[];
  savedAt: string;
}

const memoryExtractCache = new Map<string, ExtractionCacheEntry>();

function readCacheStore(): Record<string, ExtractionCacheEntry> {
  if (typeof localStorage === 'undefined') {
    return Object.fromEntries(memoryExtractCache.entries());
  }
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ExtractionCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCacheStore(map: Record<string, ExtractionCacheEntry>): void {
  const entries = Object.entries(map).sort(
    (a, b) => new Date(b[1].savedAt).getTime() - new Date(a[1].savedAt).getTime(),
  );
  const trimmed = Object.fromEntries(entries.slice(0, MAX_CACHE_ENTRIES));
  for (const [k, v] of Object.entries(trimmed)) {
    memoryExtractCache.set(k, v);
  }
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildExtractionCacheKey(params: {
  sha256: string;
  pageRange: string;
  promptVersion: string;
  model: string;
}): string {
  return `${params.sha256}::${params.pageRange}::${params.promptVersion}::${params.model}`;
}

export function getCachedExtractionResult(params: {
  sha256: string;
  pageRange: string;
  promptVersion: string;
  model: string;
}): ExtractionCacheEntry | null {
  if (!params.sha256) return null;
  const key = buildExtractionCacheKey(params);
  const inMem = memoryExtractCache.get(key);
  if (inMem) return inMem;
  const store = readCacheStore();
  const found = store[key] ?? null;
  if (found) memoryExtractCache.set(key, found);
  return found;
}

export function saveCachedExtractionResult(params: {
  sha256: string;
  pageRange: string;
  promptVersion: string;
  model: string;
  items: QuestionItem[];
  answerKeys: AnswerKeyEntry[];
}): ExtractionCacheEntry {
  const key = buildExtractionCacheKey(params);
  const entry: ExtractionCacheEntry = {
    key,
    sha256: params.sha256,
    pageRange: params.pageRange,
    promptVersion: params.promptVersion,
    model: params.model,
    items: params.items,
    answerKeys: params.answerKeys,
    savedAt: new Date().toISOString(),
  };
  memoryExtractCache.set(key, entry);
  const store = readCacheStore();
  store[key] = entry;
  writeCacheStore(store);
  return entry;
}

export function clearExtractionCache(): void {
  memoryExtractCache.clear();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(CACHE_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Estimates the number of Gemini API calls needed for a PDF page range,
 * subtracting any windows that are already present in the SHA-256 cache.
 */
export function estimateAiCallsForRange(params: {
  sha256: string;
  startPage: number;
  endPage: number;
  answerKeyPages: number[];
  promptVersion: string;
  model: string;
  windowSize?: number;
}): {
  totalWindows: number;
  cachedWindows: number;
  estimatedCalls: number;
  windows: Array<{pages: number[]; isAnswerKey: boolean; cached: boolean; rangeKey: string}>;
} {
  const winSize = Math.max(1, Math.min(3, params.windowSize ?? 2));
  const answerSet = new Set(params.answerKeyPages);
  const questionPages: number[] = [];
  const keyPages: number[] = [];

  for (let p = params.startPage; p <= params.endPage; p++) {
    if (answerSet.has(p)) {
      keyPages.push(p);
    } else {
      questionPages.push(p);
    }
  }

  const windows: Array<{pages: number[]; isAnswerKey: boolean; cached: boolean; rangeKey: string}> = [];

  // Group question pages in windows of 2–3 with 1-page overlap when needed
  let idx = 0;
  while (idx < questionPages.length) {
    const slice = questionPages.slice(idx, idx + winSize);
    const rangeKey = `q:${slice.join(',')}`;
    const cached = Boolean(
      getCachedExtractionResult({
        sha256: params.sha256,
        pageRange: rangeKey,
        promptVersion: params.promptVersion,
        model: params.model,
      }),
    );
    windows.push({pages: slice, isAnswerKey: false, cached, rangeKey});
    idx += winSize;
  }

  // Answer-key pages get 1 dedicated call per up to 3 pages
  for (let i = 0; i < keyPages.length; i += 3) {
    const slice = keyPages.slice(i, i + 3);
    const rangeKey = `ak:${slice.join(',')}`;
    const cached = Boolean(
      getCachedExtractionResult({
        sha256: params.sha256,
        pageRange: rangeKey,
        promptVersion: params.promptVersion,
        model: params.model,
      }),
    );
    windows.push({pages: slice, isAnswerKey: true, cached, rangeKey});
  }

  const cachedWindows = windows.filter((w) => w.cached).length;
  return {
    totalWindows: windows.length,
    cachedWindows,
    estimatedCalls: Math.max(0, windows.length - cachedWindows),
    windows,
  };
}

/**
 * Helper to create a clean serializable ImportBatchRecord (no binary PDF or page images inside).
 */
export function createEmptyImportBatch(params: {
  id: string;
  ownerUid: string;
  ownerName: string;
  fileName: string;
  fileSha256: string;
  driveFileId?: string;
  totalPages: number;
  startPage: number;
  endPage: number;
  classificationMode: ImportBatchRecord['classificationMode'];
}): ImportBatchRecord {
  const now = new Date().toISOString();
  return {
    id: params.id,
    ownerUid: params.ownerUid,
    ownerName: params.ownerName,
    fileName: params.fileName,
    fileSha256: params.fileSha256,
    driveFileId: params.driveFileId,
    totalPages: params.totalPages,
    startPage: params.startPage,
    endPage: params.endPage,
    classificationMode: params.classificationMode,
    status: 'reading',
    aiCallsUsed: 0,
    pagesState: [],
    extractedItems: [],
    answerKeys: [],
    patternMappings: {},
    createdAt: now,
    updatedAt: now,
  };
}

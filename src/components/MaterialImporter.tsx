import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Cloud,
  Crop,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  HardDriveUpload,
  HelpCircle,
  History,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LayoutGrid,
  PenLine,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  XCircle,
  ZoomIn,
} from 'lucide-react';
import {ERROR_CATALOG, SKILL_CLUSTER_LIST, STATIONS} from '../config.ts';
import {JOURNEY_MILESTONES} from '../journey.ts';
import {questionContainsMath, verifyQuestionMathLayers} from '../math/mathEngine.ts';
import {verifyQuestionWithSolvers} from '../math/solvers.ts';
import {
  computeQuestionFingerprint,
  computeSuggestedStations,
  findDuplicateMatch,
  PROMPT_VERSION,
  suggestTaxonomyForDocumentLabel,
} from '../math/taxonomy.ts';
import {
  applyAnswerKeysToDrafts,
  extractAnswerKeysViaAi,
  extractWindowViaAi,
  isEligibleForBatchApproval,
  parseAnswerKeyTableText,
  stitchAndDedupeExtractedDrafts,
} from '../services/aiExtractor.ts';
import {canEditSettingsOrUsers, dataService, generateId} from '../services/dataService.ts';
import {
  clearDriveToken,
  downloadDriveFileArrayBuffer,
  getActiveDriveToken,
  hasActiveDriveToken,
  listSupportedFilesInFolder,
  openGoogleDrivePicker,
  type DrivePickedItem,
} from '../services/drivePicker.ts';
import {
  createEmptyImportBatch,
  estimateAiCallsForRange,
} from '../services/importBatchService.ts';
import {
  clusterToDefaultStation,
  parseDocxDetailed,
  parseSection11Json,
} from '../services/materialImport.ts';
import {
  compressImageBytesToDataUrl,
  type DocxEmbeddedImage,
} from '../services/docxMathParser.ts';
import {
  cropFigureFromPageDataUrl,
  getCachedPageImage,
} from '../services/pageRenderer.ts';
import {
  computeSha256Hex,
  formatPdfStatusSummary,
  readPdfDocumentRange,
  type PdfDocumentReadResult,
  type PdfReadPageResult,
} from '../services/pdfReader.ts';
import type {
  AnswerKeyEntry,
  AppSettings,
  ClassificationMode,
  ClassRoom,
  ImportBatchRecord,
  MocId,
  QuestionItem,
  QuestionType,
  ReviewStatus,
  SkillCluster,
  StationId,
  UserAccount,
} from '../types.ts';
import {MathLatexEditor} from './MathLatexEditor.tsx';
import {MathText} from './MathText.tsx';

interface AiStatusInfo {
  configured: boolean;
  requiresPersonalKey?: boolean;
  usingPersonalKey?: boolean;
  keyError?: string;
  model: string;
  availableModels?: string[];
  dailyUsed: number;
  dailyLimit: number;
  remaining?: number;
  date?: string;
}

interface MaterialImporterProps {
  user: UserAccount;
  settings: AppSettings;
  classes: ClassRoom[];
  existingQuestions: QuestionItem[];
  onQuestionsChanged: () => void;
  onOpenSettingsTab: () => void;
  onOpenMissionSetsTab?: () => void;
}

const STEPPER_ITEMS = [
  {id: 1, label: '1. Tải tệp'},
  {id: 2, label: '2. Đọc nội dung'},
  {id: 3, label: '3. AI trích xuất'},
  {id: 4, label: '4. Phân dạng'},
  {id: 5, label: '5. Kiểm tra'},
  {id: 6, label: '6. Lưu ngân hàng'},
  {id: 7, label: '7. Phân bổ lớp'},
];

const QUESTION_TYPES: Array<{value: QuestionType; label: string}> = [
  {value: 'mcq', label: 'Trắc nghiệm 4 lựa chọn (mcq)'},
  {value: 'true_false_multi', label: 'Đúng/sai nhiều ý (true_false_multi)'},
  {value: 'numeric', label: 'Trả lời ngắn / số (numeric)'},
  {value: 'matching', label: 'Ghép cặp (matching)'},
  {value: 'fill_relation', label: 'Điền hệ thức (fill_relation)'},
  {value: 'error_spot', label: 'Tìm lỗi sai (error_spot)'},
];

const STATION_LIST: StationId[] = ['QS01', 'DD01', 'BS01', 'KV01', 'HT01'];
const ERROR_CODES = Object.keys(ERROR_CATALOG);

export const MaterialImporter: React.FC<MaterialImporterProps> = ({
  user,
  settings,
  classes,
  existingQuestions,
  onQuestionsChanged,
  onOpenSettingsTab,
  onOpenMissionSetsTab,
}) => {
  const isAdmin = canEditSettingsOrUsers(user);
  const taxonomy = React.useMemo(() => dataService.getTaxonomy(false), [existingQuestions.length]);
  const savedBatches = React.useMemo(() => dataService.getImportBatches(user), [user, existingQuestions.length]);
  const confidenceThreshold = settings.autoApproveConfidenceThreshold ?? 0.85;
  const hardPageModel = settings.aiHardPageModel?.trim() || 'gemini-2.5-pro';

  const [aiStatus, setAiStatus] = React.useState<AiStatusInfo | null>(null);
  const [selectedModelOverride, setSelectedModelOverride] = React.useState('');
  const personalKeyStorageKey = `toanduky_personal_gemini_key_${user.uid}`;
  const [personalApiKey, setPersonalApiKey] = React.useState<string>(() => {
    try {
      return localStorage.getItem(`toanduky_personal_gemini_key_${user.uid}`)?.trim() ?? '';
    } catch {
      return '';
    }
  });
  const [personalKeyInput, setPersonalKeyInput] = React.useState<string>(personalApiKey);
  const [showPersonalKey, setShowPersonalKey] = React.useState(false);
  const [showKeyGuide, setShowKeyGuide] = React.useState<boolean>(() => !isAdmin && !personalApiKey);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(personalKeyStorageKey)?.trim() ?? '';
      setPersonalApiKey(saved);
      setPersonalKeyInput(saved);
      setShowKeyGuide(!isAdmin && !saved);
    } catch {
      setPersonalApiKey('');
      setPersonalKeyInput('');
    }
  }, [personalKeyStorageKey, isAdmin]);
  const [showAdminByokBox, setShowAdminByokBox] = React.useState(false);
  const [testingKey, setTestingKey] = React.useState(false);
  const [keyBannerMsg, setKeyBannerMsg] = React.useState('');
  const [docxImages, setDocxImages] = React.useState<DocxEmbeddedImage[]>([]);
  const [manualCropDraftId, setManualCropDraftId] = React.useState<string | null>(null);
  const [cropRect, setCropRect] = React.useState({x: 0.12, y: 0.18, w: 0.76, h: 0.35});

  const activeModel =
    selectedModelOverride || aiStatus?.model || settings.aiModel?.trim() || 'gemini-2.5-flash-lite';
  const [autoRunAfterUpload, setAutoRunAfterUpload] = React.useState(true);
  const [previewZoom, setPreviewZoom] = React.useState<1 | 1.5 | 2>(1);
  const [showGalleryVerify, setShowGalleryVerify] = React.useState(false);
  const [classificationMode, setClassificationMode] = React.useState<ClassificationMode>('web_taxonomy');
  const [customPatternsText, setCustomPatternsText] = React.useState('');

  // Source file (kept as original File or cloned Uint8Array — NEVER reuses a detached ArrayBuffer!)
  const [pdfSourceFile, setPdfSourceFile] = React.useState<File | Uint8Array | null>(null);
  const [sourceName, setSourceName] = React.useState('Tài liệu Chương III');
  const [sourceSha256, setSourceSha256] = React.useState('');
  const [driveFileId, setDriveFileId] = React.useState<string | undefined>(undefined);

  const [pdfStartPage, setPdfStartPage] = React.useState(1);
  const [pdfEndPage, setPdfEndPage] = React.useState(12);
  const [pdfReadResult, setPdfReadResult] = React.useState<PdfDocumentReadResult | null>(null);
  const [importText, setImportText] = React.useState('');

  // Batch & Stepper state
  const [activeBatch, setActiveBatch] = React.useState<ImportBatchRecord | null>(null);
  const [stepperStep, setStepperStep] = React.useState(1);
  const [pendingConfirmRun, setPendingConfirmRun] = React.useState<{
    totalPagesInRange: number;
    estimatedCalls: number;
    cachedWindows: number;
    remainingQuota: number;
    readResult: PdfDocumentReadResult;
  } | null>(null);

  const [driveConnected, setDriveConnected] = React.useState(hasActiveDriveToken());
  const [driveFolderName, setDriveFolderName] = React.useState('');
  const [driveFolderFiles, setDriveFolderFiles] = React.useState<DrivePickedItem[]>([]);

  const [busy, setBusy] = React.useState(false);
  const [busyMessage, setBusyMessage] = React.useState('');
  const [statusMsg, setStatusMsg] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');
  const [showManualFallback, setShowManualFallback] = React.useState(false);
  const [showSavedBatches, setShowSavedBatches] = React.useState(false);

  // Extracted items, answer keys & review filters
  const [draftItems, setDraftItems] = React.useState<QuestionItem[]>([]);
  const [answerKeys, setAnswerKeys] = React.useState<AnswerKeyEntry[]>([]);
  const [examCodes, setExamCodes] = React.useState<string[]>([]);
  const [selectedExamCode, setSelectedExamCode] = React.useState('');
  const [patternMappings, setPatternMappings] = React.useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [expandedEditIds, setExpandedEditIds] = React.useState<Record<string, boolean>>({});
  const [duplicateDecisions, setDuplicateDecisions] = React.useState<Record<string, 'skip' | 'replace' | 'keep_both'>>({});
  const [reviewBucket, setReviewBucket] = React.useState<'chapter3' | 'out_of_chapter'>('chapter3');
  const [filterPattern, setFilterPattern] = React.useState<string>('ALL');
  const [filterFlag, setFilterFlag] = React.useState<'ALL' | 'flagged' | 'pass_only'>('ALL');
  const [pagePreviewCache, setPagePreviewCache] = React.useState<Record<number, string>>({});
  const [lastUpsertSummary, setLastUpsertSummary] = React.useState<{
    added: number;
    updated: number;
    skippedDuplicates: number;
    needsReview: number;
  } | null>(null);
  const [targetClassIds, setTargetClassIds] = React.useState<string[]>([]);
  const [lastSavedQuestionIds, setLastSavedQuestionIds] = React.useState<string[]>([]);
  const [quickAssignClassId, setQuickAssignClassId] = React.useState<string>(() => classes[0]?.id ?? '');
  const [quickAssignMocId, setQuickAssignMocId] = React.useState<MocId>(1);
  const [quickAssignBusy, setQuickAssignBusy] = React.useState(false);

  React.useEffect(() => {
    if (!quickAssignClassId && classes.length > 0) {
      setQuickAssignClassId(classes[0].id);
    }
  }, [classes, quickAssignClassId]);

  // Inline manual fallback form
  const [manualStem, setManualStem] = React.useState('');
  const [manualCluster, setManualCluster] = React.useState<SkillCluster>('SIN');
  const [manualStation, setManualStation] = React.useState<StationId>('BS01');
  const [manualLevel, setManualLevel] = React.useState<1 | 2 | 3 | 4>(2);
  const [manualNumericAns, setManualNumericAns] = React.useState('');
  const [manualUnit, setManualUnit] = React.useState('m');
  const [manualHint1, setManualHint1] = React.useState('');
  const [manualHint2, setManualHint2] = React.useState('');
  const [manualSolution, setManualSolution] = React.useState('');

  const abortRef = React.useRef<AbortController | null>(null);
  const driveConfigured = Boolean(settings.driveClientId?.trim() && settings.driveApiKey?.trim());

  const fetchAiStatus = React.useCallback(
    async (keyOverride?: string): Promise<AiStatusInfo | null> => {
      const effectiveKey = (keyOverride !== undefined ? keyOverride : personalApiKey).trim();
      try {
        const token = await dataService.getAccessToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (effectiveKey) headers['x-gemini-api-key'] = effectiveKey;
        const r = await fetch(
          `/api/ai/status?maxDaily=${encodeURIComponent(settings.aiDailyQuotaLimit)}`,
          {headers},
        );
        if (!r.ok) return null;
        const d = (await r.json()) as AiStatusInfo;
        setAiStatus(d);
        return d;
      } catch {
        return null;
      }
    },
    [personalApiKey, settings.aiDailyQuotaLimit],
  );

  React.useEffect(() => {
    void fetchAiStatus();
  }, [fetchAiStatus]);

  const handleSaveAndTestPersonalKey = async () => {
    const cleaned = personalKeyInput.trim();
    setKeyBannerMsg('');
    if (!cleaned) {
      setErrorMsg('Hãy dán Khóa Gemini API cá nhân (bắt đầu bằng "AIza...") trước khi lưu.');
      return;
    }
    if (cleaned.length < 20 || /\s/.test(cleaned)) {
      setErrorMsg('Khóa Gemini API chưa đúng định dạng (khóa hợp lệ bắt đầu bằng "AIza..." và không chứa khoảng trắng).');
      return;
    }
    setTestingKey(true);
    clearMessages();
    try {
      localStorage.setItem(personalKeyStorageKey, cleaned);
      setPersonalApiKey(cleaned);
      setSelectedModelOverride('');
      const st = await fetchAiStatus(cleaned);
      if (st?.configured) {
        setShowKeyGuide(false);
        setKeyBannerMsg(
          `Đã kết nối thành công Khóa Gemini API cá nhân! Tìm thấy ${st.availableModels?.length ?? 1} model khả dụng (${st.model}). Toàn bộ lượt trích xuất sẽ dùng tài nguyên Google AI Studio riêng của bạn.`,
        );
      } else {
        setErrorMsg(
          st?.keyError ||
            'Không xác minh được Khóa Gemini API này. Hãy kiểm tra lại khóa trên Google AI Studio (https://aistudio.google.com/apikey).',
        );
      }
    } finally {
      setTestingKey(false);
    }
  };

  const handleClearPersonalKey = () => {
    try {
      localStorage.removeItem(personalKeyStorageKey);
    } catch {
      // ignore storage failure
    }
    setPersonalApiKey('');
    setPersonalKeyInput('');
    setSelectedModelOverride('');
    setKeyBannerMsg('');
    if (!isAdmin) setShowKeyGuide(true);
    void fetchAiStatus('');
  };

  // Attach embedded .docx diagram images to extracted questions (exact figure_image_index first, then sequential fallback)
  const attachDocxImagesToDrafts = (
    items: QuestionItem[],
    images: DocxEmbeddedImage[],
  ): {items: QuestionItem[]; attachedCount: number} => {
    if (!images.length) return {items, attachedCount: 0};
    const usedIndexes = new Set<number>();
    let attachedCount = 0;

    // Pass 1: exact index matched by AI (`figure_image_index` from `[HÌNH_VẼ_k]`)
    const pass1 = items.map((q) => {
      if (q.figure_crop) {
        if (q.figure_image_index) usedIndexes.add(q.figure_image_index);
        attachedCount += 1;
        return {
          ...q,
          flags: (q.flags ?? []).filter((f) => f !== 'figure_missing' && f !== 'no_image'),
        };
      }
      if (typeof q.figure_image_index === 'number') {
        const match = images.find((im) => im.index === q.figure_image_index);
        if (match) {
          usedIndexes.add(match.index);
          attachedCount += 1;
          return {
            ...q,
            needs_figure: true,
            figure_crop: match.dataUrl,
            figure_crop_private: true,
            flags: (q.flags ?? []).filter((f) => f !== 'figure_missing' && f !== 'no_image'),
          };
        }
      }
      return q;
    });

    // Pass 2: sequential fallback for questions mentioning "hình vẽ" / needing figure that didn't get an index
    const remainingImages = images.filter((im) => !usedIndexes.has(im.index));
    let nextImgCursor = 0;
    const pass2 = pass1.map((q) => {
      if (q.figure_crop || nextImgCursor >= remainingImages.length) return q;
      const wantsFigure = Boolean(
        q.needs_figure ||
          (q.flags ?? []).includes('figure_missing') ||
          /(?:hình\s*vẽ|hình\s*bên|như\s*hình|hình\s*dưới|sơ\s*đồ)/i.test(q.stem_vi),
      );
      if (!wantsFigure) return q;
      const img = remainingImages[nextImgCursor++];
      attachedCount += 1;
      return {
        ...q,
        needs_figure: true,
        figure_image_index: img.index,
        figure_crop: img.dataUrl,
        figure_crop_private: true,
        flags: (q.flags ?? []).filter((f) => f !== 'figure_missing' && f !== 'no_image'),
      };
    });

    return {items: pass2, attachedCount};
  };

  // Automatically crop PDF figures (`figure_bbox`) right after AI extraction for both Admin & Teacher
  const autoCropPdfFiguresForDrafts = async (
    items: QuestionItem[],
    pages: PdfReadPageResult[],
    sha: string,
  ): Promise<{items: QuestionItem[]; croppedCount: number}> => {
    let croppedCount = 0;
    const out: QuestionItem[] = [];
    for (const q of items) {
      if (q.figure_crop || !q.figure_bbox) {
        out.push(q);
        continue;
      }
      const pageNum = q.figure_bbox.page || q.page_pdf;
      if (!pageNum) {
        out.push(q);
        continue;
      }
      const pageImg =
        pages.find((p) => p.pagePdf === pageNum)?.cachedImage?.dataUrl ??
        pagePreviewCache[pageNum] ??
        (sha ? (await getCachedPageImage(sha, pageNum))?.dataUrl : undefined);
      if (!pageImg) {
        out.push(q);
        continue;
      }
      const cropped = await cropFigureFromPageDataUrl(pageImg, q.figure_bbox, 150 * 1024);
      if (cropped) {
        croppedCount += 1;
        out.push({
          ...q,
          needs_figure: true,
          figure_crop: cropped.dataUrl,
          figure_crop_private: true,
          flags: (q.flags ?? []).filter((f) => f !== 'figure_missing'),
        });
      } else {
        out.push(q);
      }
    }
    return {items: out, croppedCount};
  };

  const clearMessages = () => {
    setStatusMsg('');
    setErrorMsg('');
  };

  const persistBatchSnapshot = (patch: Partial<ImportBatchRecord>, base?: ImportBatchRecord | null) => {
    const current = base ?? activeBatch;
    if (!current) return;
    const updated: ImportBatchRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setActiveBatch(updated);
    dataService.saveImportBatch(user, updated);
  };

  // Load cached page image previews when draft items or sha change
  React.useEffect(() => {
    if (!sourceSha256 || draftItems.length === 0) return;
    const neededPages = Array.from(
      new Set(
        draftItems
          .map((d) => d.page_pdf ?? d.figure_bbox?.page)
          .filter((p): p is number => typeof p === 'number' && p > 0),
      ),
    );
    for (const p of neededPages) {
      if (pagePreviewCache[p]) continue;
      void getCachedPageImage(sourceSha256, p).then((img) => {
        if (img?.dataUrl) {
          setPagePreviewCache((prev) => ({...prev, [p]: img.dataUrl}));
        }
      });
    }
  }, [sourceSha256, draftItems, pagePreviewCache]);

  const cancelRunningTask = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setBusyMessage('');
    persistBatchSnapshot({status: 'cancelled'});
    setStatusMsg('Đã dừng tiến trình. Các trang đã đọc & trích xuất vẫn được lưu trong lô nhập.');
  };

  // ---- PHASE 1: ROBUST PDF READING (ZERO DETACHED ARRAYBUFFER) ----
  const runPdfRead = async (
    source: File | Uint8Array,
    fileName: string,
    opts?: {startPage?: number; endPage?: number; driveId?: string; promptAutoExtract?: boolean},
  ) => {
    clearMessages();
    setBusy(true);
    setStepperStep(2);
    setBusyMessage(`Đang đọc từng trang PDF (${fileName})...`);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const sha = await computeSha256Hex(source);
      setSourceSha256(sha);

      const readRes = await readPdfDocumentRange(source, {
        fileName,
        fileSha256: sha,
        startPage: opts?.startPage ?? pdfStartPage,
        endPage: opts?.endPage ?? pdfEndPage,
        renderImages: true,
        signal: ctrl.signal,
        onPageDone: (pg, idx, total) => {
          setBusyMessage(`Đang đọc trang ${pg.pagePdf} (${idx}/${total})...`);
          if (pg.cachedImage?.dataUrl) {
            setPagePreviewCache((prev) => ({...prev, [pg.pagePdf]: pg.cachedImage!.dataUrl}));
          }
        },
      });

      setPdfReadResult(readRes);
      setPdfStartPage(readRes.startPage);
      setPdfEndPage(readRes.endPage);
      setImportText(readRes.combinedText);

      const batch = createEmptyImportBatch({
        id: generateId('batch'),
        ownerUid: user.uid,
        ownerName: user.displayName,
        fileName,
        fileSha256: sha,
        driveFileId: opts?.driveId ?? driveFileId,
        totalPages: readRes.totalPages,
        startPage: readRes.startPage,
        endPage: readRes.endPage,
        classificationMode,
      });
      batch.pagesState = readRes.pages.map((p) => p.state);
      batch.status = 'reading';
      setActiveBatch(batch);
      dataService.saveImportBatch(user, batch);

      setStatusMsg(
        `${readRes.summaryText_vi}. Tệp PDF gốc và ảnh trang chỉ lưu tạm trên máy để xử lý, KHÔNG ghi vào CSDL.`,
      );

      // Prepare AI quota confirmation modal if autoRun is enabled
      const answerKeyPages = readRes.pages
        .filter((p) => p.state.hasAnswerKeyCue)
        .map((p) => p.pagePdf);
      const est = estimateAiCallsForRange({
        sha256: sha,
        startPage: readRes.startPage,
        endPage: readRes.endPage,
        answerKeyPages,
        promptVersion: PROMPT_VERSION,
        model: activeModel,
        windowSize: 2,
      });

      const remaining = Math.max(
        0,
        (aiStatus?.dailyLimit ?? settings.aiDailyQuotaLimit) - (aiStatus?.dailyUsed ?? 0),
      );

      if (opts?.promptAutoExtract && autoRunAfterUpload) {
        setPendingConfirmRun({
          totalPagesInRange: readRes.endPage - readRes.startPage + 1,
          estimatedCalls: est.estimatedCalls,
          cachedWindows: est.cachedWindows,
          remainingQuota: remaining,
          readResult: readRes,
        });
      }
    } catch (err) {
      console.error('[MaterialImporter] PDF read error:', err);
      setErrorMsg(
        err instanceof Error && err.message.includes('hủy')
          ? err.message
          : 'Không thể đọc tệp PDF này. Vui lòng kiểm tra tệp không bị đặt mật khẩu rồi thử lại.',
      );
    } finally {
      setBusy(false);
      setBusyMessage('');
      abortRef.current = null;
    }
  };

  // ---- PHASE 2: MULTI-WINDOW AI EXTRACTION + ANSWER-KEY MERGE + MODE B MAPPING ----
  const executeFullAiExtraction = async (readRes: PdfDocumentReadResult, batchOverride?: ImportBatchRecord) => {
    clearMessages();
    if (!isAdmin && !personalApiKey.trim()) {
      setShowKeyGuide(true);
      setErrorMsg(
        'Giáo viên vui lòng nhập Khóa Gemini API cá nhân ở khung phía trên (xem Hướng dẫn 5 bước) để dùng tài nguyên AI riêng của mình.',
      );
      return;
    }
    setPendingConfirmRun(null);
    setBusy(true);
    setStepperStep(3);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const batchBase = batchOverride ?? activeBatch;
    let token = await dataService.getAccessToken();
    if (!token) {
      token = await dataService.getAccessToken(true);
    }
    const customPatterns = customPatternsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const answerPages = readRes.pages.filter((p) => p.state.hasAnswerKeyCue);
    const questionPages = readRes.pages.filter((p) => !p.state.hasAnswerKeyCue);
    const pagesToExtract = questionPages.length > 0 ? questionPages : readRes.pages;

    const updatedPagesState = [...readRes.pages.map((p) => ({...p.state}))];
    const collectedDrafts: QuestionItem[] = [];
    const collectedKeys: AnswerKeyEntry[] = [];
    const detectedExamCodes = new Set<string>();
    let aiCallsUsed = 0;
    let cacheHits = 0;
    let quotaStopped = false;

    try {
      // 1. Extract question pages in windows of 2 pages (with 1-page overlap when cut off)
      const WIN_SIZE = 2;
      let i = 0;
      while (i < pagesToExtract.length) {
        if (ctrl.signal.aborted) break;
        const winPages = pagesToExtract.slice(i, i + WIN_SIZE);
        const label = winPages.map((p) => p.pagePdf).join('–');
        setBusyMessage(`Đang trích xuất & phân dạng trang ${label} (${Math.min(pagesToExtract.length, i + WIN_SIZE)}/${pagesToExtract.length})...`);

        const res = await extractWindowViaAi({
          pages: winPages,
          fileName: readRes.fileName,
          fileSha256: readRes.fileSha256,
          driveFileId,
          batchId: batchBase?.id,
          accessToken: token,
          personalApiKey: personalApiKey.trim() || undefined,
          maxDaily: settings.aiDailyQuotaLimit,
          aiEnabled: settings.aiEnabled,
          classificationMode,
          taxonomy,
          customPatterns,
          model: activeModel,
          signal: ctrl.signal,
        });

        if (res.quota) {
          setAiStatus((prev) => ({
            ...prev,
            configured: prev?.configured ?? true,
            model: res.usedModel || prev?.model || activeModel,
            availableModels: prev?.availableModels,
            dailyUsed: res.quota!.used,
            dailyLimit: res.quota!.limit,
            remaining: res.quota!.remaining,
            date: res.quota!.date,
          }));
        }

        if (res.fromCache) {
          cacheHits += 1;
        } else if (!res.error) {
          aiCallsUsed += 1;
        }

        if (res.quotaExceeded) {
          quotaStopped = true;
          setErrorMsg(
            `Đã hết hạn mức AI hôm nay sau khi đọc xong ${collectedDrafts.length} câu. Tiến độ đã được lưu — bạn có thể tiếp tục vào ngày mai hoặc chuyển sang nhập tay.`,
          );
          break;
        }

        if (res.error) {
          for (const wp of winPages) {
            const st = updatedPagesState.find((s) => s.pagePdf === wp.pagePdf);
            if (st) {
              st.status = 'error';
              st.errorMessage = res.error;
            }
          }
        } else {
          collectedDrafts.push(...res.items);
          collectedKeys.push(...res.answerKeys);
          for (const wp of winPages) {
            const st = updatedPagesState.find((s) => s.pagePdf === wp.pagePdf);
            const pageItems = res.items.filter((it) => it.page_pdf === wp.pagePdf);
            if (st) {
              st.status = 'extracted';
              st.questionCount = pageItems.length;
              st.confidenceAvg =
                pageItems.length > 0
                  ? pageItems.reduce((acc, q) => acc + (q.confidence ?? 0.75), 0) / pageItems.length
                  : undefined;
            }
          }
        }

        // Overlap 1 page if last item of this window was cut off at page end
        const lastItem = res.items[res.items.length - 1];
        const hasCutOff = Boolean(lastItem?.flags?.includes('cut_off_at_page_end'));
        i += hasCutOff && winPages.length > 1 ? WIN_SIZE - 1 : WIN_SIZE;
      }

      // 2. Dedicated Answer-Key extraction call for pages detected as answer/solution tables
      if (!ctrl.signal.aborted && !quotaStopped && answerPages.length > 0) {
        setBusyMessage(`Đang đọc bảng đáp án / lời giải (${answerPages.length} trang)...`);
        const akRes = await extractAnswerKeysViaAi({
          pages: answerPages,
          fileSha256: readRes.fileSha256,
          accessToken: token,
          personalApiKey: personalApiKey.trim() || undefined,
          maxDaily: settings.aiDailyQuotaLimit,
          aiEnabled: settings.aiEnabled,
          model: activeModel,
          signal: ctrl.signal,
        });
        if (akRes.quota) {
          setAiStatus((prev) => ({
            ...prev,
            configured: prev?.configured ?? true,
            model: prev?.model ?? activeModel,
            availableModels: prev?.availableModels,
            dailyUsed: akRes.quota!.used,
            dailyLimit: akRes.quota!.limit,
            remaining: akRes.quota!.remaining,
            date: akRes.quota!.date,
          }));
        }
        if (!akRes.fromCache && !akRes.error) aiCallsUsed += 1;
        collectedKeys.push(...akRes.entries);
        for (const c of akRes.examCodes) detectedExamCodes.add(c);
        for (const ap of answerPages) {
          const st = updatedPagesState.find((s) => s.pagePdf === ap.pagePdf);
          if (st) st.status = 'extracted';
        }
      }

      // 3. Stitch cut-off questions, dedupe overlap windows, and merge answer keys
      setStepperStep(4);
      let stitched = stitchAndDedupeExtractedDrafts(collectedDrafts);

      // Also scan all extracted text locally for horizontal tables like "Câu 17 18 19 20"
      if (collectedKeys.length === 0) {
        const localTableKeys = parseAnswerKeyTableText(readRes.combinedText);
        if (localTableKeys.length > 0) collectedKeys.push(...localTableKeys);
      }

      const codesArr = Array.from(detectedExamCodes);
      setExamCodes(codesArr);
      const defaultCode = codesArr[0] ?? '';
      setSelectedExamCode(defaultCode);

      const merged = applyAnswerKeysToDrafts(stitched, collectedKeys, defaultCode || undefined);
      // Automatically crop figures from PDF pages for questions with `figure_bbox`
      const autoCropped = await autoCropPdfFiguresForDrafts(merged.items, readRes.pages, readRes.fileSha256);
      stitched = autoCropped.items;

      // Build Mode B pattern mapping suggestions
      const autoMap: Record<string, string> = {};
      for (const item of stitched) {
        if (item.source_pattern_label && !autoMap[item.source_pattern_label]) {
          autoMap[item.source_pattern_label] =
            item.pattern_id ?? suggestTaxonomyForDocumentLabel(item.source_pattern_label, taxonomy) ?? '';
        }
      }
      setPatternMappings(autoMap);
      setAnswerKeys(collectedKeys);
      setDraftItems(stitched);
      setSelectedIds(
        stitched
          .filter((d) => !(d.flags ?? []).includes('out_of_chapter') && d.pattern_id !== 'OUT-00')
          .map((d) => d.id),
      );
      setStepperStep(5);

      persistBatchSnapshot(
        {
          status: quotaStopped ? 'error' : 'reviewing',
          aiCallsUsed: (batchBase?.aiCallsUsed ?? 0) + aiCallsUsed,
          pagesState: updatedPagesState,
          extractedItems: stitched,
          answerKeys: collectedKeys,
          patternMappings: autoMap,
        },
        batchBase,
      );

      // Also refresh pdfReadResult page states
      setPdfReadResult((prev) =>
        prev
          ? {
              ...prev,
              pages: prev.pages.map((pg) => {
                const nextSt = updatedPagesState.find((s) => s.pagePdf === pg.pagePdf);
                return nextSt ? {...pg, state: nextSt} : pg;
              }),
            }
          : prev,
      );

      const outCount = stitched.filter(
        (d) => (d.flags ?? []).includes('out_of_chapter') || d.pattern_id === 'OUT-00',
      ).length;
      const verifiedCount = stitched.filter((d) => d.verified_by_code === 'pass').length;
      const failCount = stitched.filter((d) => d.verified_by_code === 'fail').length;
      const failedPages = updatedPagesState.filter((p) => p.status === 'error');
      const firstPageError = failedPages.find((p) => p.errorMessage)?.errorMessage;

      if (failedPages.length > 0 && stitched.length === 0) {
        setErrorMsg(
          `Không tách được câu hỏi nào (${failedPages.length}/${updatedPagesState.length} trang lỗi): ${
            firstPageError || 'Máy chủ AI tạm thời không phản hồi.'
          } Bạn có thể bấm "Thử lại" trên từng trang hoặc kiểm tra đăng nhập/hạn mức AI.`,
        );
      } else {
        if (failedPages.length > 0) {
          setErrorMsg(
            `Có ${failedPages.length} trang lỗi (${failedPages.map((p) => `Tr.${p.pagePdf}`).join(', ')}): ${
              firstPageError || 'Hãy bấm "Thử lại" ở từng trang bị lỗi.'
            }`,
          );
        }
        setStatusMsg(
          `Hoàn tất tách ${stitched.length} câu hỏi (${stitched.length - outCount} câu Chương III${outCount > 0 ? `, ${outCount} câu Ngoài chương` : ''}). ` +
            `Ghép đáp án: ${merged.matchedCount} câu · Code kiểm chứng khớp: ${verifiedCount}${failCount > 0 ? `, lệch: ${failCount}` : ''} · ` +
            `Đã dùng ${aiCallsUsed} lượt AI${cacheHits > 0 ? ` (tái dùng cache ${cacheHits} nhóm = 0 lượt)` : ''}.`,
        );
      }
    } finally {
      setBusy(false);
      setBusyMessage('');
      abortRef.current = null;
    }
  };

  // Retry a single page (optionally with stronger hard-page model!)
  const handleRetrySinglePage = async (pagePdf: number, useHardModel = false) => {
    if (!pdfReadResult) return;
    clearMessages();
    setBusy(true);
    setBusyMessage(
      `Đang đọc & trích xuất lại trang ${pagePdf}${useHardModel ? ` bằng model mạnh (${hardPageModel})` : ''}...`,
    );

    try {
      let targetPage: PdfReadPageResult | undefined = pdfReadResult.pages.find(
        (p) => p.pagePdf === pagePdf,
      );
      if (pdfSourceFile) {
        const singleRead = await readPdfDocumentRange(pdfSourceFile, {
          fileName: sourceName,
          fileSha256: sourceSha256,
          startPage: pagePdf,
          endPage: pagePdf,
          renderImages: true,
        });
        if (singleRead.pages[0]) targetPage = singleRead.pages[0];
      }
      if (!targetPage) {
        setErrorMsg(`Không tìm thấy dữ liệu trang ${pagePdf} để thử lại.`);
        return;
      }

      let token = await dataService.getAccessToken();
      if (!token) token = await dataService.getAccessToken(true);
      const res = await extractWindowViaAi({
        pages: [targetPage],
        fileName: sourceName,
        fileSha256: sourceSha256,
        driveFileId,
        batchId: activeBatch?.id,
        accessToken: token,
        personalApiKey: personalApiKey.trim() || undefined,
        maxDaily: settings.aiDailyQuotaLimit,
        aiEnabled: settings.aiEnabled,
        classificationMode,
        taxonomy,
        model: useHardModel ? hardPageModel : activeModel,
        useHardPageModel: useHardModel,
        bypassCache: true,
      });

      if (res.quota) {
        setAiStatus((prev) => ({
          ...prev,
          configured: prev?.configured ?? true,
          model: res.usedModel || prev?.model || activeModel,
          availableModels: prev?.availableModels,
          dailyUsed: res.quota!.used,
          dailyLimit: res.quota!.limit,
          remaining: res.quota!.remaining,
          date: res.quota!.date,
        }));
      }

      if (res.error) {
        setErrorMsg(`Trang ${pagePdf}: ${res.error}`);
        return;
      }

      const withoutOldPage = draftItems.filter((d) => d.page_pdf !== pagePdf);
      const croppedRetry = await autoCropPdfFiguresForDrafts(res.items, [targetPage], sourceSha256);
      const mergedDrafts = stitchAndDedupeExtractedDrafts([...withoutOldPage, ...croppedRetry.items]);
      const withKeys = applyAnswerKeysToDrafts(mergedDrafts, [...answerKeys, ...res.answerKeys], selectedExamCode || undefined);
      setDraftItems(withKeys.items);
      setPdfReadResult((prev) =>
        prev
          ? {
              ...prev,
              pages: prev.pages.map((pg) =>
                pg.pagePdf === pagePdf
                  ? {
                      ...pg,
                      state: {
                        ...pg.state,
                        status: 'extracted',
                        errorMessage: undefined,
                        questionCount: res.items.length,
                        usedHardModel: useHardModel,
                      },
                    }
                  : pg,
              ),
            }
          : prev,
      );
      persistBatchSnapshot({extractedItems: withKeys.items});
      setStatusMsg(`Đã trích xuất lại trang ${pagePdf}: thu được ${res.items.length} câu hỏi.`);
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  // Manual pasted text / DOCX extraction (with embedded DOCX figure auto-attachment!)
  const handleExtractPastedText = async () => {
    clearMessages();
    if (!importText.trim()) {
      setErrorMsg('Hãy dán văn bản đề bài Toán 10 Chương III hoặc tải tệp PDF/DOCX lên trước.');
      return;
    }
    if (!isAdmin && !personalApiKey.trim()) {
      setShowKeyGuide(true);
      setErrorMsg(
        'Giáo viên vui lòng nhập Khóa Gemini API cá nhân ở khung phía trên (xem Hướng dẫn 5 bước) để dùng tài nguyên AI riêng của mình.',
      );
      return;
    }
    if (pdfReadResult && pdfReadResult.pages.length > 0) {
      await executeFullAiExtraction(pdfReadResult);
      return;
    }

    setBusy(true);
    setStepperStep(3);
    setBusyMessage('Đang trích xuất & phân dạng từ văn bản...');
    try {
      let token = await dataService.getAccessToken();
      if (!token) token = await dataService.getAccessToken(true);

      // Split long Word/text documents into ~6,500-char chunks at question/paragraph boundaries
      const MAX_CHUNK = 6500;
      const chunks: string[] = [];
      if (importText.length <= MAX_CHUNK) {
        chunks.push(importText);
      } else {
        const lines = importText.split(/\r?\n/);
        let cur = '';
        for (const ln of lines) {
          const isQuestionStart = /^(?:Câu\s+\d+|Bài\s+\d+|\[Mức độ|PHẦN\s+[I123])/i.test(ln.trim());
          if (cur.length > 3500 && (isQuestionStart || cur.length + ln.length > MAX_CHUNK)) {
            chunks.push(cur.trim());
            cur = ln;
          } else {
            cur = cur ? `${cur}\n${ln}` : ln;
          }
        }
        if (cur.trim()) chunks.push(cur.trim());
      }

      const allItems: QuestionItem[] = [];
      const allKeys: AnswerKeyEntry[] = [];
      let lastErr = '';

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        setBusyMessage(
          chunks.length > 1
            ? `Đang trích xuất đoạn ${cIdx + 1}/${chunks.length} bằng AI...`
            : 'Đang trích xuất & phân dạng từ văn bản...',
        );
        const chunkText = chunks[cIdx];
        const sha = await computeSha256Hex(new TextEncoder().encode(chunkText));
        const res = await extractWindowViaAi({
          pages: [],
          pastedText: chunkText,
          fileName: sourceName,
          fileSha256: sha,
          driveFileId,
          accessToken: token,
          personalApiKey: personalApiKey.trim() || undefined,
          maxDaily: settings.aiDailyQuotaLimit,
          aiEnabled: settings.aiEnabled,
          classificationMode,
          taxonomy,
          model: activeModel,
          embeddedImages: docxImages.length > 0 ? docxImages : undefined,
        });
        if (res.quota) {
          setAiStatus((prev) => ({
            ...prev,
            configured: prev?.configured ?? true,
            model: res.usedModel || prev?.model || activeModel,
            availableModels: prev?.availableModels,
            dailyUsed: res.quota!.used,
            dailyLimit: res.quota!.limit,
            remaining: res.quota!.remaining,
            date: res.quota!.date,
          }));
        }
        if (res.error) {
          lastErr = res.error;
          if (res.quotaExceeded) break;
          continue;
        }
        allItems.push(...res.items);
        allKeys.push(...res.answerKeys);
      }

      if (allItems.length === 0 && lastErr) {
        setErrorMsg(lastErr);
        setShowManualFallback(true);
        return;
      }

      const deduped = stitchAndDedupeExtractedDrafts(allItems);
      if (allKeys.length === 0) {
        allKeys.push(...parseAnswerKeyTableText(importText));
      }
      const merged = applyAnswerKeysToDrafts(deduped, allKeys);
      const withDocxFigures = attachDocxImagesToDrafts(merged.items, docxImages);
      setAnswerKeys(allKeys);
      setDraftItems(withDocxFigures.items);
      setSelectedIds(withDocxFigures.items.filter((d) => d.pattern_id !== 'OUT-00').map((d) => d.id));
      setStepperStep(5);
      if (lastErr) {
        setErrorMsg(`Một phần văn bản gặp lỗi khi trích xuất: ${lastErr}`);
      } else if (withDocxFigures.items.length > 5) {
        setErrorMsg(
          `Lưu ý: Tệp vừa tải có ${withDocxFigures.items.length} câu hỏi (vượt khuyến nghị tối đa 5 câu/tệp). Để đảm bảo công thức LaTeX và hình vẽ chính xác nhất, những lần sau thầy/cô nên chia tệp tối đa 5 câu đổ lại.`,
        );
      }
      setStatusMsg(
        `Đã trích xuất ${withDocxFigures.items.length} câu từ văn bản (${chunks.length} đoạn)` +
          `${withDocxFigures.attachedCount > 0 ? ` · Tự động gắn ${withDocxFigures.attachedCount} hình vẽ minh họa từ tệp Word` : ''}. ` +
          `Thầy/cô hãy kiểm tra nhanh công thức & hình vẽ, chọn lớp áp dụng (nếu muốn) rồi bấm "Lưu & Duyệt ngay vào Ngân hàng".`,
      );
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  // Process uploaded local file OR Google Drive file
  const processUploadedFile = async (
    fileName: string,
    fileOrBytes: File | Uint8Array,
    pickedDriveId?: string,
  ) => {
    clearMessages();
    setSourceName(fileName);
    setDriveFileId(pickedDriveId);
    setPdfReadResult(null);
    setDocxImages([]);
    setPendingConfirmRun(null);
    setLastUpsertSummary(null);
    const lower = fileName.toLowerCase();

    if (lower.endsWith('.pdf')) {
      setPdfSourceFile(null);
      setErrorMsg(
        'Hệ thống hiện chỉ hỗ trợ tải lên 3 định dạng: .docx (Word), .json và .txt (mỗi tệp tối đa 5 câu hỏi đổ lại). Vui lòng tải tệp Word (.docx) hoặc dán nội dung đề ở mục 2.',
      );
      return;
    }

    if (!lower.endsWith('.docx') && !lower.endsWith('.json') && !lower.endsWith('.txt')) {
      setPdfSourceFile(null);
      setErrorMsg(
        `Định dạng tệp "${fileName}" chưa được hỗ trợ. Vui lòng chọn tệp .docx, .json hoặc .txt (tối đa 5 câu/tệp).`,
      );
      return;
    }

    setPdfSourceFile(null);
    const buf =
      fileOrBytes instanceof Uint8Array
        ? fileOrBytes.slice().buffer
        : await fileOrBytes.arrayBuffer();

    try {
      if (lower.endsWith('.json')) {
        const text = new TextDecoder('utf-8').decode(buf);
        const parsed = parseSection11Json(text, {sourceFileName: fileName, driveFileId: pickedDriveId});
        const enriched = parsed.items.map((q) => {
          const ver = verifyQuestionWithSolvers(q);
          return {
            ...q,
            fingerprint: computeQuestionFingerprint(q),
            code_verification: ver.code_verification,
            verified_by_code: ver.verified_by_code,
          };
        });
        setDraftItems(enriched);
        setSelectedIds(enriched.map((x) => x.id));
        setStepperStep(5);
        if (enriched.length > 5) {
          setErrorMsg(
            `Lưu ý: Tệp JSON có ${enriched.length} câu (khuyến nghị tối đa 5 câu/tệp để dễ rà soát và phân bổ cho từng lớp).`,
          );
        }
        setStatusMsg(`Đã đọc ${enriched.length} câu từ JSON (${fileName}). Kiểm tra nhanh rồi bấm "Lưu & Duyệt ngay vào Ngân hàng".`);
      } else if (lower.endsWith('.docx')) {
        setBusy(true);
        const docxRes = await parseDocxDetailed(buf);
        setImportText(docxRes.text);
        setDocxImages(docxRes.embeddedImages);
        setStepperStep(2);
        if (docxRes.warning_vi) {
          setErrorMsg(docxRes.warning_vi);
        }
        const formulaParts: string[] = [];
        if (docxRes.ommlCount > 0) formulaParts.push(`khôi phục ${docxRes.ommlCount} công thức Word OMML`);
        if (docxRes.oleDecodedCount > 0) {
          formulaParts.push(`giải mã ${docxRes.oleDecodedCount}/${docxRes.oleObjectCount} công thức MathType`);
        }
        if (docxRes.embeddedImages.length > 0) {
          formulaParts.push(`tách được ${docxRes.embeddedImages.length} hình vẽ minh họa`);
        }
        setStatusMsg(
          `Đã đọc tệp Word (${fileName}, ${docxRes.text.length} ký tự)` +
            (formulaParts.length > 0 ? ` — ${formulaParts.join(', ')}. ` : '. ') +
            'Bấm "Trích xuất & phân dạng bằng AI" bên dưới (hình vẽ sẽ tự động gắn vào từng câu hỏi).',
        );
      } else {
        const text = new TextDecoder('utf-8').decode(buf);
        setImportText(text);
        setStepperStep(2);
        setStatusMsg(`Đã nạp văn bản từ ${fileName} (${text.length} ký tự).`);
      }
    } catch (err) {
      console.error('[MaterialImporter] File parse error:', err);
      setErrorMsg(`Không thể đọc tệp ${fileName}. Vui lòng kiểm tra định dạng (.pdf, .docx, .json, .txt).`);
    } finally {
      setBusy(false);
    }
  };

  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processUploadedFile(file.name, file, undefined);
  };

  const handleReReadPdfRange = async () => {
    if (!pdfSourceFile) return;
    await runPdfRead(pdfSourceFile, sourceName, {
      startPage: pdfStartPage,
      endPage: pdfEndPage,
      promptAutoExtract: false,
    });
  };

  const handleOpenDrivePicker = async () => {
    clearMessages();
    if (!driveConfigured) {
      setErrorMsg('Chưa cấu hình Google OAuth Client ID hoặc Picker API Key trong Cài đặt Quản trị.');
      return;
    }
    setBusy(true);
    try {
      const {items, accessToken} = await openGoogleDrivePicker({
        clientId: settings.driveClientId!.trim(),
        apiKey: settings.driveApiKey!.trim(),
      });
      setDriveConnected(true);
      if (items.length === 0) return;
      const picked = items[0];
      if (picked.isFolder) {
        const files = await listSupportedFilesInFolder(picked.id, accessToken);
        setDriveFolderName(picked.name);
        setDriveFolderFiles(files);
        setStatusMsg(`Đã mở thư mục Google Drive "${picked.name}": ${files.length} tệp hỗ trợ.`);
      } else {
        setDriveFolderName('');
        setDriveFolderFiles([]);
        const buf = await downloadDriveFileArrayBuffer(picked.id, accessToken);
        await processUploadedFile(picked.name, new Uint8Array(buf), picked.id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không kết nối được Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadDriveFolderFile = async (fileItem: DrivePickedItem) => {
    clearMessages();
    const token = getActiveDriveToken();
    if (!token) {
      setErrorMsg('Phiên Google Drive đã hết hạn. Hãy bấm lại "Chọn từ Google Drive".');
      setDriveConnected(false);
      return;
    }
    setBusy(true);
    try {
      const buf = await downloadDriveFileArrayBuffer(fileItem.id, token);
      await processUploadedFile(fileItem.name, new Uint8Array(buf), fileItem.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải tệp từ Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  // Live edit any draft field with automatic solver re-verification
  const updateDraft = (id: string, updater: (prev: QuestionItem) => QuestionItem) => {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = updater(item);
        const ver = verifyQuestionWithSolvers(next);
        const flags = new Set(next.flags ?? []);
        if (ver.verified_by_code === 'pass') {
          flags.delete('answer_mismatch');
          flags.delete('unverifiable_by_code');
        } else if (ver.verified_by_code === 'fail') {
          flags.add('answer_mismatch');
        }
        return {
          ...next,
          code_verification: ver.code_verification,
          verified_by_code: ver.verified_by_code,
          flags: Array.from(flags),
          fingerprint: computeQuestionFingerprint(next),
          suggested_stations: computeSuggestedStations({
            topic: next.pattern_id === 'OUT-00' ? 'OUT' : next.cluster,
            patternId: next.pattern_id,
            level: next.level,
            taxonomy,
          }),
        };
      }),
    );
  };

  // Crop figure_bbox from cached PDF page image (works for BOTH Admin & Teacher, <= 150 KB)
  const handleUseCroppedFigure = async (
    item: QuestionItem,
    customBox?: {page: number; x: number; y: number; w: number; h: number},
  ) => {
    const targetBox = customBox ?? item.figure_bbox;
    if (!targetBox) return;
    const pageNum = targetBox.page || item.page_pdf || 1;
    const pageImg =
      pagePreviewCache[pageNum] ??
      (sourceSha256 ? (await getCachedPageImage(sourceSha256, pageNum))?.dataUrl : undefined);
    if (!pageImg) {
      setErrorMsg(`Chưa có ảnh trang ${pageNum} trong bộ nhớ tạm. Hãy đọc lại trang PDF để cắt hình.`);
      return;
    }
    const cropped = await cropFigureFromPageDataUrl(pageImg, targetBox, 150 * 1024);
    if (!cropped) return;
    updateDraft(item.id, (prev) => ({
      ...prev,
      needs_figure: true,
      figure_bbox: targetBox,
      figure_crop: cropped.dataUrl,
      figure_crop_private: true,
      flags: (prev.flags ?? []).filter((f) => f !== 'figure_missing' && f !== 'no_image'),
    }));
    setManualCropDraftId(null);
    setStatusMsg(
      `Đã gắn hình minh họa (${Math.round(cropped.approxBytes / 1024)} KB ≤ 150 KB) cho câu ${item.question_number ?? item.id}.`,
    );
  };

  const handleUploadFigureForDraft = async (itemId: string, file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const comp = await compressImageBytesToDataUrl(bytes, file.type || 'image/png', 140 * 1024);
      updateDraft(itemId, (prev) => ({
        ...prev,
        needs_figure: true,
        figure_crop: comp.dataUrl,
        figure_crop_private: true,
        flags: (prev.flags ?? []).filter((f) => f !== 'figure_missing' && f !== 'no_image'),
      }));
      setStatusMsg(`Đã tải & gắn hình minh họa (${Math.round(comp.approxBytes / 1024)} KB).`);
    } catch {
      setErrorMsg('Không thể đọc tệp ảnh vừa chọn. Hãy thử ảnh định dạng PNG hoặc JPG.');
    }
  };

  const handlePasteFigureForDraft = async (itemId: string) => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const ci of items) {
          const imgType = ci.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await ci.getType(imgType);
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const comp = await compressImageBytesToDataUrl(bytes, imgType, 140 * 1024);
            updateDraft(itemId, (prev) => ({
              ...prev,
              needs_figure: true,
              figure_crop: comp.dataUrl,
              figure_crop_private: true,
              flags: (prev.flags ?? []).filter((f) => f !== 'figure_missing' && f !== 'no_image'),
            }));
            setStatusMsg(`Đã dán hình minh họa từ Clipboard (${Math.round(comp.approxBytes / 1024)} KB).`);
            return;
          }
        }
      }
      setErrorMsg(
        'Chưa thấy ảnh trong Clipboard. Hãy chụp vùng hình vẽ (Win+Shift+S) rồi bấm lại "Dán ảnh" hoặc dùng nút "Tải ảnh".',
      );
    } catch {
      setErrorMsg('Trình duyệt chưa cấp quyền đọc Clipboard. Bạn hãy dùng nút "Tải ảnh" để chọn tệp hình vẽ.');
    }
  };

  // Commit selected/single drafts into question bank (direct approve for BOTH Admin & Teacher + awaited Supabase sync!)
  const commitDrafts = async (targetIds: string[], requestedStatus: ReviewStatus, batchApproveGuard = false) => {
    const rawTargets = draftItems.filter((d) => targetIds.includes(d.id));
    if (rawTargets.length === 0) return;

    clearMessages();
    const effectiveStatus: ReviewStatus =
      requestedStatus === 'rejected' && !isAdmin ? 'pending_teacher_review' : requestedStatus;
    let skippedByGuard = 0;

    const eligibleTargets =
      batchApproveGuard && effectiveStatus === 'approved'
        ? rawTargets.filter((q) => {
            const check = isEligibleForBatchApproval(q, confidenceThreshold);
            if (!check.eligible) skippedByGuard += 1;
            return check.eligible;
          })
        : rawTargets;

    if (eligibleTargets.length === 0) {
      setErrorMsg(
        `Không có câu nào đủ điều kiện lưu nhanh (${skippedByGuard} câu có cờ lỗi cú pháp LaTeX / thiếu đáp án / ngoài Chương III). Hãy mở "Sửa" trên từng câu để hoàn chỉnh rồi lưu.`,
      );
      return;
    }

    setBusy(true);
    setBusyMessage('Đang lưu câu hỏi vào ngân hàng & đồng bộ lên máy chủ...');

    let added = 0;
    let updated = 0;
    let skippedDuplicates = 0;
    let needsReview = 0;
    const committedIds = new Set<string>();
    const allSavedBankIds: string[] = [];
    const scopedClassIds = targetClassIds.length > 0 ? [...targetClassIds] : undefined;

    try {
      for (const item of eligibleTargets) {
        const dupAction = duplicateDecisions[item.id] ?? 'skip';
        const res = dataService.upsertImportedQuestions(user, [item], {
          targetStatus: effectiveStatus,
          duplicateAction: dupAction,
          targetClassIds: scopedClassIds,
          note:
            effectiveStatus === 'approved'
              ? `${isAdmin ? 'Admin' : 'Giáo viên'} lưu trực tiếp từ tệp (${sourceName})`
              : `Lưu bản nháp từ tệp (${sourceName})`,
        });
        added += res.added;
        updated += res.updated;
        skippedDuplicates += res.skippedDuplicates;
        needsReview += res.needsReview;
        allSavedBankIds.push(...res.savedIds);
        committedIds.add(item.id);
      }

      // Explicitly await Supabase cloud persistence so save errors are NEVER silently swallowed!
      const uniqueSavedIds = Array.from(new Set(allSavedBankIds));
      const syncRes =
        added > 0 || updated > 0
          ? await dataService.syncQuestionsToSupabase(uniqueSavedIds)
          : {ok: true, synced: 0};

      setLastUpsertSummary({added, updated, skippedDuplicates, needsReview: needsReview + skippedByGuard});
      if (effectiveStatus === 'approved' && uniqueSavedIds.length > 0) {
        setLastSavedQuestionIds(uniqueSavedIds);
        const firstSuggestedMoc = eligibleTargets.find((q) => (q.suggested_stations?.length ?? 0) > 0)
          ?.suggested_stations?.[0];
        if (firstSuggestedMoc) setQuickAssignMocId(firstSuggestedMoc);
        if (scopedClassIds && scopedClassIds.length === 1) {
          setQuickAssignClassId(scopedClassIds[0]);
        }
      }
      setDraftItems((prev) => prev.filter((d) => !committedIds.has(d.id)));
      setSelectedIds((prev) => prev.filter((id) => !committedIds.has(id)));
      setStepperStep(6);
      persistBatchSnapshot({
        status: draftItems.length - committedIds.size === 0 ? 'completed' : 'reviewing',
        extractedItems: draftItems.filter((d) => !committedIds.has(d.id)),
        summary: {added, updated, skippedDuplicates, needsReview: needsReview + skippedByGuard},
      });
      onQuestionsChanged();

      const classLabelText =
        scopedClassIds && scopedClassIds.length > 0
          ? ` · Phạm vi: ${scopedClassIds
              .map((cid) => classes.find((c) => c.id === cid)?.name ?? cid)
              .join(', ')}`
          : ' · Phạm vi: Dùng chung tất cả lớp';

      if (!syncRes.ok) {
        setErrorMsg(
          `Đã lưu cục bộ (${added} câu mới, ${updated} cập nhật) nhưng đồng bộ lên Supabase gặp lỗi: ${syncRes.error}. Vui lòng tải lại trang hoặc đăng nhập lại rồi thử đồng bộ.`,
        );
      }
      setStatusMsg(
        `${effectiveStatus === 'approved' ? 'Đã lưu & duyệt trực tiếp vào Ngân hàng' : 'Đã lưu ở trạng thái bản nháp'}: ` +
          `Thêm ${added} câu mới · cập nhật ${updated} câu · bỏ qua ${skippedDuplicates} câu trùng` +
          `${syncRes.ok && syncRes.synced > 0 ? ` · ✓ Đã đồng bộ ${syncRes.synced} câu lên máy chủ` : ''}` +
          `${classLabelText}` +
          `${skippedByGuard > 0 ? ` · giữ lại ${skippedByGuard} câu cần kiểm tra` : ''}.`,
      );
    } finally {
      setBusy(false);
      setBusyMessage('');
    }
  };

  const handleQuickAssignSavedToClass = async () => {
    if (!quickAssignClassId || lastSavedQuestionIds.length === 0) return;
    setQuickAssignBusy(true);
    setErrorMsg('');
    try {
      const targetClass = classes.find((c) => c.id === quickAssignClassId);
      const res = await dataService.assignQuestionsToClassMoc(user, {
        classId: quickAssignClassId,
        mocId: quickAssignMocId,
        questionIds: lastSavedQuestionIds,
        note: `Phân bổ ${lastSavedQuestionIds.length} câu từ ${sourceName} cho lớp ${targetClass?.name ?? quickAssignClassId}`,
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Không thể phân bổ câu hỏi cho lớp này.');
        return;
      }
      setStepperStep(7);
      onQuestionsChanged();
      setStatusMsg(
        `✓ Đã phân bổ & xuất bản ngay ${lastSavedQuestionIds.length} câu vào Mốc ${quickAssignMocId} riêng cho lớp ${targetClass?.name ?? quickAssignClassId} (phiên bản v${res.record?.version ?? 1}). Học sinh lớp này sẽ thấy ngay ở lượt làm bài mới!`,
      );
    } finally {
      setQuickAssignBusy(false);
    }
  };

  // Manual fallback form submit
  const handleManualAddDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualStem.trim()) return;
    const numericVal = Number(manualNumericAns.replace(',', '.'));
    const hasNum = manualNumericAns.trim() !== '' && Number.isFinite(numericVal);
    const draft: QuestionItem = {
      id: generateId('man'),
      stationId: manualStation,
      stage: 'practice',
      cluster: manualCluster,
      skill_ids: [manualCluster.toLowerCase()],
      level: manualLevel,
      type: 'numeric',
      stem_vi: manualStem.trim(),
      expected_answer: hasNum
        ? {rounded: numericVal, value: numericVal, decimal_places: 1, unit: manualUnit.trim()}
        : {},
      fixedUnitLabel: manualUnit.trim() || undefined,
      solution_vi: manualSolution.trim() || 'Áp dụng công thức Chương III rồi tính theo đơn vị độ (DEG).',
      anticipated_error_ids: ['E05'],
      hints_vi: [
        manualHint1.trim() || 'Xác định các cạnh và góc đã cho trong tam giác.',
        manualHint2.trim() || 'Lập hệ thức liên hệ rồi thay số cẩn thận.',
      ],
      review_status: 'pending_teacher_review',
      source_refs: [sourceName],
      is_adapted: true,
      source_file_name: sourceName,
      confidence: 1,
      ai_reason: 'Nhập tay dự phòng (không dùng lượt AI).',
      flags: ['no_image'],
    };
    const ver = verifyQuestionWithSolvers(draft);
    draft.code_verification = ver.code_verification;
    draft.verified_by_code = ver.verified_by_code;
    draft.fingerprint = computeQuestionFingerprint(draft);
    draft.suggested_stations = computeSuggestedStations({
      topic: manualCluster,
      level: manualLevel,
      taxonomy,
    });

    setDraftItems((prev) => [draft, ...prev]);
    setSelectedIds((prev) => [draft.id, ...prev]);
    setManualStem('');
    setManualNumericAns('');
    setManualHint1('');
    setManualHint2('');
    setManualSolution('');
    setStepperStep(5);
    setStatusMsg('Đã thêm 1 câu nhập tay vào danh sách đối chiếu. Bấm "Lưu & Duyệt ngay vào Ngân hàng" để đưa vào ngân hàng ngay.');
  };

  const quotaUsed = aiStatus?.dailyUsed ?? 0;
  const quotaLimit = aiStatus?.dailyLimit ?? settings.aiDailyQuotaLimit;
  const quotaPct = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0;
  const quotaExhausted = quotaUsed >= quotaLimit;

  const chapter3Drafts = draftItems.filter(
    (d) => !(d.flags ?? []).includes('out_of_chapter') && d.pattern_id !== 'OUT-00',
  );
  const outOfChapterDrafts = draftItems.filter(
    (d) => (d.flags ?? []).includes('out_of_chapter') || d.pattern_id === 'OUT-00',
  );

  const visibleDrafts = (reviewBucket === 'chapter3' ? chapter3Drafts : outOfChapterDrafts)
    .filter((d) => filterPattern === 'ALL' || (d.pattern_id ?? 'UNMAPPED') === filterPattern)
    .filter((d) => {
      if (filterFlag === 'pass_only') return d.verified_by_code === 'pass';
      if (filterFlag === 'flagged') {
        return (
          d.verified_by_code !== 'pass' ||
          (d.flags ?? []).some((f) => ['answer_mismatch', 'figure_missing', 'formula_uncertain', 'missing_answer'].includes(f))
        );
      }
      return true;
    });

  const uniqueDocLabels = Array.from(
    new Set(draftItems.map((d) => d.source_pattern_label).filter((s): s is string => Boolean(s))),
  );

  return (
    <div className="space-y-4">
      {/* 7-STEP PIPELINE STEPPER */}
      <div className="notebook-card p-3.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {STEPPER_ITEMS.map((st, idx) => {
            const done = stepperStep > st.id;
            const current = stepperStep === st.id;
            return (
              <React.Fragment key={st.id}>
                <div
                  className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold border flex items-center gap-1 ${
                    current
                      ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                      : done
                        ? 'bg-[#E6F6F3] text-[#145B4F] border-[#2E9C8A]'
                        : 'bg-[#FFFBF0] text-[#5B6B82] border-[#E5D3A8]'
                  }`}
                >
                  {done && <Check className="w-3 h-3" />}
                  {st.label}
                </div>
                {idx < STEPPER_ITEMS.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-[#CBB17D] shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* TOP HEADER + CONTROLS + AI QUOTA MONITOR */}
      <div className="notebook-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1 min-w-[260px]">
            <h2 className="font-display text-xl font-extrabold text-[#14284A]">
              Nhập học liệu 1 chạm: Word (.docx) / .json / .txt → AI tách câu &amp; hình vẽ → Phân bổ theo Lớp
            </h2>
            <p className="text-xs text-[#5B6B82]">
              {isAdmin ? (
                <>
                  Hỗ trợ <strong>.docx</strong> (tự giải mã Word OMML + MathType &amp; tách hình vẽ nhúng),{' '}
                  <strong>.json</strong>, <strong>.txt</strong> (<strong>tối đa 5 câu/tệp</strong>). Admin dùng khóa hệ thống Vercel hoặc khóa cá nhân.
                </>
              ) : (
                <>
                  Giáo viên nhập <strong>Khóa Gemini API cá nhân</strong> bên dưới (miễn phí tại Google AI Studio — dùng hạn mức của chính thầy/cô) để tải lên{' '}
                  <strong>.docx</strong>, <strong>.json</strong>, <strong>.txt</strong> (<strong>tối đa 5 câu/tệp</strong>),{' '}
                  <strong>lưu trực tiếp vào Ngân hàng không cần Admin duyệt</strong> và tự phân bổ riêng cho từng lớp của mình.
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <label className="inline-flex items-center gap-1.5 font-bold text-[#14284A] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRunAfterUpload}
                  onChange={(e) => setAutoRunAfterUpload(e.target.checked)}
                  className="accent-[#2E9C8A] w-4 h-4"
                />
                Tự động chạy sau khi tải lên (hiện hộp xác nhận lượt AI trước khi chạy)
              </label>
              {savedBatches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSavedBatches((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFF4D6] border border-[#D5B87E] font-bold text-[#14284A]"
                >
                  <History className="w-3.5 h-3.5 text-[#2E9C8A]" />
                  Lô nhập đã lưu ({savedBatches.length})
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminByokBox((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EEF6FF] border border-[#9EC5FE] font-bold text-[#14437A]"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {personalApiKey ? 'Đang dùng Khóa cá nhân' : 'Dùng Khóa Gemini cá nhân (tùy chọn)'}
                </button>
              )}
            </div>
          </div>

          <div className="min-w-[270px] p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#14284A]">
              <span>{aiStatus?.usingPersonalKey ? 'Tài nguyên AI cá nhân' : 'Hạn mức AI hôm nay'}</span>
              <span className={aiStatus?.usingPersonalKey ? 'text-[#1F7A6B]' : quotaExhausted ? 'text-[#B5650D]' : 'text-[#1F7A6B]'}>
                {aiStatus?.usingPersonalKey ? 'Khóa cá nhân ✓' : `${quotaUsed}/${quotaLimit} lượt`}
              </span>
            </div>
            {!aiStatus?.usingPersonalKey && (
              <div className="w-full h-2 rounded-full bg-[#EFE0BC] overflow-hidden">
                <div
                  className={`h-full transition-all ${quotaExhausted ? 'bg-[#D98A1F]' : 'bg-[#2E9C8A]'}`}
                  style={{width: `${quotaPct}%`}}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-3 text-[11px] text-[#5B6B82]">
              <span className="truncate">
                {aiStatus?.configured
                  ? `Model: ${activeModel} (${PROMPT_VERSION})`
                  : !isAdmin
                    ? 'Chưa nhập Khóa Gemini cá nhân'
                    : 'Chưa cấu hình GEMINI_API_KEY'}
              </span>
              <button
                type="button"
                onClick={() => void fetchAiStatus()}
                className="inline-flex items-center gap-1 font-bold text-[#14284A] hover:underline shrink-0 !min-h-[24px]"
              >
                <RefreshCw className="w-3 h-3" /> Cập nhật
              </button>
            </div>
            {aiStatus?.configured && aiStatus.availableModels && aiStatus.availableModels.length > 0 && (
              <div className="pt-1 flex items-center gap-1.5 text-[11px]">
                <label className="font-bold text-[#14284A] shrink-0">Đổi model:</label>
                <select
                  value={selectedModelOverride}
                  onChange={(e) => setSelectedModelOverride(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-white border border-[#D5B87E] text-[11px] font-bold text-[#14284A] !min-h-[28px]"
                >
                  <option value="">Tự động ({aiStatus.model} — ổn định nhất)</option>
                  {aiStatus.availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* TEACHER BYOK GEMINI API KEY + 5-STEP GUIDE PANEL */}
        {(!isAdmin || showAdminByokBox || Boolean(personalApiKey)) && (
          <div
            className={`p-4 rounded-2xl border-2 space-y-3 text-xs ${
              personalApiKey && aiStatus?.configured
                ? 'bg-[#F0FAF7] border-[#2E9C8A]'
                : 'bg-[#FFF9EB] border-[#E0A93B]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#1F7A6B]" />
                <span className="font-extrabold text-[#14284A] text-sm">
                  {isAdmin
                    ? 'Khóa Gemini API cá nhân (tùy chọn thay cho khóa hệ thống)'
                    : 'Khóa Gemini API cá nhân của Giáo viên (dùng tài nguyên riêng của thầy/cô)'}
                </span>
                {personalApiKey && aiStatus?.configured ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] text-[11px] font-extrabold">
                    ✓ Đã kết nối ({aiStatus.availableModels?.length ?? 1} model)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-[#FFF3DB] border border-[#D98A1F] text-[#8A5108] text-[11px] font-extrabold">
                    {personalApiKey ? 'Cần kiểm tra lại khóa' : 'Chưa kết nối'}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowKeyGuide((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#CBB17D] font-bold text-[#14284A] !min-h-[30px]"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[#2E9C8A]" />
                {showKeyGuide ? 'Ẩn hướng dẫn lấy API Key' : 'Hướng dẫn 5 bước lấy API Key miễn phí'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[240px]">
                <input
                  type={showPersonalKey ? 'text' : 'password'}
                  value={personalKeyInput}
                  onChange={(e) => setPersonalKeyInput(e.target.value)}
                  placeholder="Dán Khóa Gemini API của bạn tại đây (bắt đầu bằng AIza...)"
                  autoComplete="off"
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-mono text-[#14284A]"
                />
                <button
                  type="button"
                  onClick={() => setShowPersonalKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#5B6B82] hover:text-[#14284A]"
                  title={showPersonalKey ? 'Ẩn khóa' : 'Hiện khóa'}
                >
                  {showPersonalKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                disabled={testingKey}
                onClick={() => void handleSaveAndTestPersonalKey()}
                className="btn-tactile btn-jade text-xs py-2 px-3.5"
              >
                {testingKey ? 'Đang kiểm tra...' : 'Lưu & Kiểm tra khóa'}
              </button>
              {personalApiKey && (
                <button
                  type="button"
                  onClick={handleClearPersonalKey}
                  className="px-3 py-2 rounded-xl bg-white border border-[#E5A09B] text-[#99261B] font-bold text-xs !min-h-[36px]"
                >
                  Xóa khóa
                </button>
              )}
            </div>

            <p className="text-[11px] text-[#5B6B82]">
              🔒 Khóa API chỉ lưu cục bộ trên trình duyệt của chính thầy/cô (không lưu vào CSDL chung và không chia sẻ cho tài khoản khác). Toàn bộ lượt trích xuất AI sẽ dùng hạn mức miễn phí của tài khoản Google cá nhân của thầy/cô.
            </p>

            {keyBannerMsg && (
              <div className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] font-bold text-xs">
                ✓ {keyBannerMsg}
              </div>
            )}
            {aiStatus?.keyError && (
              <div className="p-2.5 rounded-xl bg-[#FCE8E6] border border-[#C8392B] text-[#99261B] font-bold text-xs">
                ⚠ {aiStatus.keyError}
              </div>
            )}

            {showKeyGuide && (
              <div className="p-3.5 rounded-xl bg-white border border-[#D9C293] space-y-2 text-xs text-[#1B2A41]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold text-[#14284A]">
                    Hướng dẫn 5 bước lấy Khóa Gemini API miễn phí (mất ~1 phút):
                  </p>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#14284A] text-[#FFFBF0] font-bold text-[11px] hover:opacity-90"
                  >
                    Mở Google AI Studio lấy API Key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
                  <li>
                    Bấm nút <strong>"Mở Google AI Studio lấy API Key"</strong> ở trên (hoặc vào địa chỉ{' '}
                    <code className="px-1 py-0.5 rounded bg-[#FAF5E8]">https://aistudio.google.com/apikey</code>) rồi đăng nhập bằng tài khoản <strong>Gmail cá nhân</strong> của thầy/cô.
                  </li>
                  <li>
                    Nếu lần đầu truy cập, tích đồng ý điều khoản của Google AI Studio và bấm <strong>Continue</strong>.
                  </li>
                  <li>
                    Bấm nút xanh <strong>"Create API key"</strong> (Tạo khóa API) ở góc trên bên phải màn hình.
                  </li>
                  <li>
                    Đặt tên tùy ý (ví dụ: <em>ToanDuKy</em>), chọn hoặc tạo dự án mới rồi bấm <strong>Create key</strong> → bấm nút <strong>Copy</strong> để sao chép chuỗi khóa (bắt đầu bằng <code className="px-1 py-0.5 rounded bg-[#FAF5E8]">AIza...</code>).
                  </li>
                  <li>
                    Quay lại trang này, dán chuỗi khóa vào ô bên trên rồi bấm <strong>"Lưu &amp; Kiểm tra khóa"</strong>. Khi thấy dấu <strong>✓ Đã kết nối</strong> màu xanh, thầy/cô có thể tải tệp Word (.docx), .json hoặc .txt (tối đa 5 câu/tệp), lưu trực tiếp vào ngân hàng và phân bổ riêng cho từng lớp của mình ở mục <strong>7. Set nhiệm vụ</strong>.
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Saved Import Batches drawer (resume after F5 / offline) */}
        {showSavedBatches && savedBatches.length > 0 && (
          <div className="p-3 rounded-2xl bg-[#FFFBF0] border border-[#D5B87E] space-y-2 text-xs">
            <p className="font-extrabold text-[#14284A]">Tiếp tục lô nhập gần đây (đã lưu trạng thái):</p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {savedBatches.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-white border border-[#E5D3A8]"
                >
                  <div>
                    <p className="font-bold text-[#14284A]">
                      {b.fileName} · Trang {b.startPage}–{b.endPage}/{b.totalPages} · {b.extractedItems.length} câu ·{' '}
                      <span className="text-[#1F7A6B]">{b.status}</span>
                    </p>
                    <p className="text-[11px] text-[#5B6B82]">
                      {new Date(b.updatedAt).toLocaleString('vi-VN')} · Đã dùng {b.aiCallsUsed} lượt AI
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveBatch(b);
                        setSourceName(b.fileName);
                        setSourceSha256(b.fileSha256);
                        setPdfStartPage(b.startPage);
                        setPdfEndPage(b.endPage);
                        setClassificationMode(b.classificationMode);
                        setDraftItems(b.extractedItems);
                        setAnswerKeys(b.answerKeys);
                        setPatternMappings(b.patternMappings ?? {});
                        setSelectedIds(b.extractedItems.filter((x) => x.pattern_id !== 'OUT-00').map((x) => x.id));
                        setStepperStep(b.extractedItems.length > 0 ? 5 : 2);
                        setShowSavedBatches(false);
                        setStatusMsg(`Đã khôi phục lô nhập "${b.fileName}" (${b.extractedItems.length} câu).`);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#2E9C8A] text-white font-bold"
                    >
                      Mở lại
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dataService.deleteImportBatch(user, b.id);
                        onQuestionsChanged();
                      }}
                      className="px-2 py-1 rounded-lg bg-[#FCE8E6] text-[#99261B] font-bold"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CLASSIFICATION MODE SELECTOR (Mode A vs Mode B) */}
        <div className="p-3.5 rounded-2xl bg-[#FFFBF0] border border-[#D9C293] space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-extrabold text-[#14284A] inline-flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#2E9C8A]" />
              Chế độ phân dạng bài khi trích xuất:
            </span>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                <input
                  type="radio"
                  name="classificationMode"
                  checked={classificationMode === 'web_taxonomy'}
                  onChange={() => setClassificationMode('web_taxonomy')}
                  className="accent-[#2E9C8A]"
                />
                Chế độ A: Theo danh mục dạng của web (mặc định)
              </label>
              <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                <input
                  type="radio"
                  name="classificationMode"
                  checked={classificationMode === 'document_patterns'}
                  onChange={() => setClassificationMode('document_patterns')}
                  className="accent-[#2E9C8A]"
                />
                Chế độ B: Theo dạng của tài liệu / giáo viên (có bảng ánh xạ)
              </label>
            </div>
          </div>
          {classificationMode === 'document_patterns' && (
            <textarea
              rows={2}
              value={customPatternsText}
              onChange={(e) => setCustomPatternsText(e.target.value)}
              placeholder="(Tùy chọn) Dán sẵn danh sách dạng bài riêng của bạn, mỗi dạng 1 dòng (vd: Dạng 1. Tính cạnh bằng định lí Côsin). Nếu để trống, AI tự lấy tiêu đề 'Dạng n...' trong PDF."
              className="w-full p-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
            />
          )}
        </div>

        {/* 3 INPUT SOURCES */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-3">
            {/* 1. Local Upload */}
            <div className="p-3.5 rounded-2xl bg-[#FFFBF0] border border-[#D9C293] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="local-material-upload"
                  className="text-xs font-extrabold text-[#14284A] inline-flex items-center gap-1.5"
                >
                  <HardDriveUpload className="w-4 h-4 text-[#2E9C8A]" />
                  1. Tải tệp từ máy (.docx, .json, .txt)
                </label>
                <span className="text-[11px] text-[#5B6B82]">
                  Nguồn: <strong>{sourceName}</strong>
                </span>
              </div>

              <input
                id="local-material-upload"
                type="file"
                accept=".docx,.json,.txt"
                onChange={handleLocalFileChange}
                className="block w-full text-xs file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:bg-[#14284A] file:text-[#FFFBF0] file:font-bold file:cursor-pointer"
              />

              <div className="p-2.5 rounded-xl bg-[#FFF4D6] border border-[#E0A93B] text-[11px] font-semibold text-[#6E4004] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#C27803] shrink-0 mt-0.5" />
                <div>
                  <strong>Lưu ý cho Giáo viên:</strong> Chỉ nhận 3 định dạng <strong>.docx (Word)</strong>,{' '}
                  <strong>.json</strong>, <strong>.txt</strong>. <strong>Mỗi lần tải tệp chỉ nên nhập tối đa 5 câu hỏi đổ lại</strong> để AI tách đề, giải mã công thức MathType/LaTeX và gắn hình vẽ minh họa chính xác nhất (nếu đề dài hơn, hãy tách thành từng tệp 3–5 câu).
                </div>
              </div>

              {/* Extracted DOCX embedded diagram thumbnails */}
              {docxImages.length > 0 && (
                <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A]/50 space-y-2 text-xs">
                  <p className="font-extrabold text-[#14284A] inline-flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#2E9C8A]" />
                    Đã tách tự động {docxImages.length} hình vẽ minh họa từ tệp Word (sẽ tự gắn vào từng câu khi AI trích xuất):
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {docxImages.map((img) => (
                      <div
                        key={img.id}
                        className="shrink-0 w-28 p-1.5 rounded-xl border border-[#2E9C8A] bg-white space-y-1 text-center"
                      >
                        <img
                          src={img.dataUrl}
                          alt={`Hình ${img.index}`}
                          className="w-full h-20 object-contain rounded bg-white"
                        />
                        <p className="text-[10px] font-extrabold text-[#145B4F]">
                          Hình {img.index} ({Math.round(img.approxBytes / 1024)} KB)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PDF Range Controls & Consistent Status Line */}
              {pdfReadResult && (
                <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A]/50 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-extrabold text-[#14284A]">
                      {formatPdfStatusSummary({
                        totalPages: pdfReadResult.totalPages,
                        startPage: pdfReadResult.startPage,
                        endPage: pdfReadResult.endPage,
                        readCount: pdfReadResult.readCount,
                        imageUsedCount: pdfReadResult.imageUsedCount,
                        errorCount: pdfReadResult.errorCount,
                      })}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label className="text-[11px] font-bold">Trang</label>
                      <input
                        type="number"
                        min={1}
                        max={pdfReadResult.totalPages}
                        value={pdfStartPage}
                        onChange={(e) => setPdfStartPage(Math.max(1, Number(e.target.value)))}
                        className="w-14 px-2 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-bold"
                      />
                      <label className="text-[11px] font-bold">đến</label>
                      <input
                        type="number"
                        min={pdfStartPage}
                        max={pdfReadResult.totalPages}
                        value={pdfEndPage}
                        onChange={(e) => setPdfEndPage(Math.max(pdfStartPage, Number(e.target.value)))}
                        className="w-14 px-2 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => void handleReReadPdfRange()}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-lg bg-[#14284A] text-white font-bold !min-h-[30px]"
                      >
                        Đọc lại
                      </button>
                    </div>
                  </div>

                  {/* Page Thumbnail Strip with per-page status & Retry */}
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {pdfReadResult.pages.map((pg) => (
                      <div
                        key={pg.pagePdf}
                        className={`shrink-0 w-28 p-1.5 rounded-xl border text-[10px] space-y-1 bg-white ${
                          pg.state.status === 'error'
                            ? 'border-[#C8392B] bg-[#FCE8E6]'
                            : pg.state.status === 'extracted'
                              ? 'border-[#2E9C8A]'
                              : 'border-[#D5B87E]'
                        }`}
                      >
                        {pg.cachedImage?.thumbDataUrl ? (
                          <img
                            src={pg.cachedImage.thumbDataUrl}
                            alt={`Trang ${pg.pagePdf}`}
                            className="w-full h-24 object-contain rounded border border-[#EFE0BC] bg-white"
                          />
                        ) : (
                          <div className="w-full h-24 rounded border border-dashed border-[#D5B87E] flex items-center justify-center text-[#5B6B82]">
                            Trang {pg.pagePdf}
                          </div>
                        )}
                        <div className="flex items-center justify-between font-extrabold text-[#14284A]">
                          <span>Tr. {pg.pagePdf}</span>
                          <span
                            className={
                              pg.state.status === 'error'
                                ? 'text-[#C8392B]'
                                : pg.state.status === 'extracted'
                                  ? 'text-[#1F7A6B]'
                                  : 'text-[#8A5108]'
                            }
                          >
                            {pg.state.status === 'error'
                              ? 'Lỗi'
                              : pg.state.status === 'extracted'
                                ? `${pg.state.questionCount ?? 0} câu`
                                : pg.state.sendMode !== 'text_only'
                                  ? 'Ảnh+Chữ'
                                  : 'Chữ'}
                          </span>
                        </div>
                        {pg.state.hasAnswerKeyCue && (
                          <span className="block px-1 py-0.5 rounded bg-[#FFF4D6] text-[#8A5108] font-bold text-center">
                            Bảng đáp án
                          </span>
                        )}
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRetrySinglePage(pg.pagePdf, false)}
                            className="flex-1 px-1 py-0.5 rounded bg-[#FFFBF0] border border-[#CBB17D] font-bold text-[#14284A] hover:bg-[#FFF4D6]"
                            title="Thử lại trang này"
                          >
                            Thử lại
                          </button>
                          {(pg.state.status === 'error' ||
                            (pg.state.confidenceAvg !== undefined && pg.state.confidenceAvg < 0.8)) && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRetrySinglePage(pg.pagePdf, true)}
                              className="px-1 py-0.5 rounded bg-[#14284A] text-white font-bold"
                              title={`Đọc lại bằng model mạnh (${hardPageModel})`}
                            >
                              Pro
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Manual Pasted Text Fallback */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="paste-material-textarea"
                  className="text-xs font-extrabold text-[#14284A] inline-flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4 text-[#2E9C8A]" />
                  2. Nội dung đề bài (xem trước công thức LaTeX hoặc dán trực tiếp tối đa 5 câu)
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Tên tài liệu..."
                  className="px-2.5 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-semibold w-48"
                />
              </div>

              <MathLatexEditor
                value={importText}
                onChange={setImportText}
                rows={4}
                placeholder="Dán nội dung đề Toán 10 Chương III vào đây (hỗ trợ xem trước KaTeX trực tiếp & nút Chuẩn hóa Unicode từ Word/PDF)..."
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || (!importText.trim() && !pdfReadResult) || quotaExhausted}
                  onClick={() => {
                    if (pdfReadResult) {
                      const answerKeyPages = pdfReadResult.pages
                        .filter((p) => p.state.hasAnswerKeyCue)
                        .map((p) => p.pagePdf);
                      const est = estimateAiCallsForRange({
                        sha256: pdfReadResult.fileSha256,
                        startPage: pdfReadResult.startPage,
                        endPage: pdfReadResult.endPage,
                        answerKeyPages,
                        promptVersion: PROMPT_VERSION,
                        model: activeModel,
                        windowSize: 2,
                      });
                      setPendingConfirmRun({
                        totalPagesInRange: pdfReadResult.endPage - pdfReadResult.startPage + 1,
                        estimatedCalls: est.estimatedCalls,
                        cachedWindows: est.cachedWindows,
                        remainingQuota: Math.max(0, quotaLimit - quotaUsed),
                        readResult: pdfReadResult,
                      });
                    } else {
                      void handleExtractPastedText();
                    }
                  }}
                  className="btn-tactile btn-jade text-xs py-2.5 px-4 flex-1 min-w-[220px]"
                >
                  <Sparkles className="w-4 h-4" />
                  {busy
                    ? busyMessage || 'Đang xử lý...'
                    : quotaExhausted
                      ? 'Đã hết lượt AI hôm nay'
                      : 'Trích xuất & phân dạng bằng AI'}
                </button>
                {busy && (
                  <button
                    type="button"
                    onClick={cancelRunningTask}
                    className="btn-tactile btn-amber text-xs py-2.5 px-3.5"
                  >
                    <Square className="w-3.5 h-3.5" /> Hủy
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowManualFallback((v) => !v)}
                  className="btn-tactile btn-paper text-xs py-2.5 px-3.5"
                >
                  <PenLine className="w-4 h-4" />
                  {showManualFallback ? 'Ẩn nhập tay' : 'Chuyển sang nhập tay'}
                </button>
              </div>
            </div>
          </div>

          {/* 3. Google Drive Picker */}
          <div className="lg:col-span-5 p-4 rounded-2xl bg-[#FFF4D6] border border-[#D5B87E] space-y-3 text-xs text-[#1B2A41]">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm text-[#14284A] inline-flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-[#2E9C8A]" />
                3. Google Drive Picker (chỉ đọc)
              </strong>
              <span
                className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                  driveConfigured
                    ? 'bg-[#E6F6F3] text-[#1F7A6B] border border-[#2E9C8A]'
                    : 'bg-[#FFFBF0] text-[#8A5108] border border-[#D98A1F]'
                }`}
              >
                {driveConfigured ? (driveConnected ? 'Đã kết nối' : 'Sẵn sàng') : 'Chưa cấu hình'}
              </span>
            </div>

            {driveConfigured ? (
              <div className="space-y-2.5">
                <p className="text-[#5B6B82]">
                  Chọn tệp Word (.docx), .json, .txt (tối đa 5 câu/tệp) hoặc thư mục từ Google Drive (chỉ quyền đọc, token chỉ lưu trong RAM).
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleOpenDrivePicker()}
                    className="btn-tactile btn-gold text-xs py-2 px-3.5 flex-1"
                  >
                    <FolderOpen className="w-4 h-4" /> Chọn từ Google Drive
                  </button>
                  {driveConnected && (
                    <button
                      type="button"
                      onClick={() => {
                        clearDriveToken();
                        setDriveConnected(false);
                        setDriveFolderFiles([]);
                      }}
                      className="btn-tactile btn-paper text-xs py-2 px-3"
                    >
                      Ngắt Drive
                    </button>
                  )}
                </div>
                {driveFolderFiles.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-white border border-[#D9C293] space-y-1.5 max-h-44 overflow-y-auto">
                    <p className="font-bold text-[#14284A]">
                      Thư mục &ldquo;{driveFolderName}&rdquo; ({driveFolderFiles.length} tệp):
                    </p>
                    {driveFolderFiles.map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 py-1 border-b border-[#EFE0BC] last:border-0">
                        <span className="truncate font-semibold text-[#14284A]">{f.name}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleLoadDriveFolderFile(f)}
                          className="px-2.5 py-1 rounded-lg bg-[#2E9C8A] text-white font-bold shrink-0"
                        >
                          Nạp
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[#5B6B82]">
                  Chưa thiết lập khóa Google Drive Picker. Thầy/cô có thể tải trực tiếp tệp <strong>.docx, .json, .txt</strong> từ máy tính ở mục 1 (tối đa 5 câu/tệp).
                </p>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={onOpenSettingsTab}
                    className="btn-tactile btn-paper text-xs py-2 px-3 w-full"
                  >
                    <Settings className="w-4 h-4" /> Mở mục Cài đặt (Admin)
                  </button>
                ) : (
                  <p className="text-[11px] font-semibold text-[#5B6B82] bg-white/80 p-2 rounded-lg border border-[#E5D3A8]">
                    Liên hệ Quản trị viên (Admin) nếu cần bật Google Drive Picker.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* AI QUOTA CONFIRMATION DIALOG BEFORE SPENDING CALLS */}
        {pendingConfirmRun && (
          <div className="p-4 rounded-2xl bg-[#EEF6FF] border-2 border-[#3B5F8F] space-y-2.5 text-xs">
            <p className="font-display text-base font-extrabold text-[#14284A]">
              Xác nhận chạy trích xuất tự động bằng AI
            </p>
            <p className="text-[#1B2A41]">
              Tệp <strong>{pendingConfirmRun.readResult.fileName}</strong> có{' '}
              <strong>{pendingConfirmRun.totalPagesInRange} trang</strong> trong khoảng đang chọn, dự kiến dùng khoảng{' '}
              <strong className="text-[#1F7A6B]">{pendingConfirmRun.estimatedCalls} lượt AI</strong>{' '}
              (còn lại <strong>{pendingConfirmRun.remainingQuota} lượt</strong> hôm nay
              {pendingConfirmRun.cachedWindows > 0
                ? ` · ${pendingConfirmRun.cachedWindows} nhóm trang đã có sẵn trong bộ nhớ đệm = 0 lượt`
                : ''}
              ). Tiếp tục?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void executeFullAiExtraction(pendingConfirmRun.readResult)}
                className="btn-tactile btn-jade text-xs py-2 px-4"
              >
                <Play className="w-3.5 h-3.5" /> Tiếp tục trích xuất &amp; phân dạng
              </button>
              <button
                type="button"
                onClick={() => setPendingConfirmRun(null)}
                className="btn-tactile btn-paper text-xs py-2 px-3"
              >
                Để sau (chỉnh khoảng trang trước)
              </button>
            </div>
          </div>
        )}

        {/* FEEDBACK BANNERS + QUICK PER-CLASS ASSIGNMENT AFTER SAVE */}
        {statusMsg && (
          <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#1F7A6B] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{statusMsg}</span>
              </div>
              {lastUpsertSummary && onOpenMissionSetsTab && (
                <button
                  type="button"
                  onClick={onOpenMissionSetsTab}
                  className="px-3 py-1.5 rounded-lg bg-[#14284A] text-[#FFFBF0] font-extrabold inline-flex items-center gap-1"
                >
                  Mở 7. Set nhiệm vụ theo lớp <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {lastSavedQuestionIds.length > 0 && classes.length > 0 && (
              <div className="p-3 rounded-xl bg-white border border-[#2E9C8A]/60 text-[#14284A] flex flex-wrap items-center gap-2">
                <span className="font-extrabold">
                  Phân bổ nhanh {lastSavedQuestionIds.length} câu vừa lưu vào lớp:
                </span>
                <select
                  value={quickAssignClassId}
                  onChange={(e) => setQuickAssignClassId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] text-xs font-extrabold text-[#14284A]"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      Lớp {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                <select
                  value={quickAssignMocId}
                  onChange={(e) => setQuickAssignMocId(Number(e.target.value) as MocId)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] text-xs font-extrabold text-[#14284A]"
                >
                  {JOURNEY_MILESTONES.map((m) => (
                    <option key={m.id} value={m.id}>
                      Mốc {m.id}: {m.city} ({m.clusters.join(', ')})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={quickAssignBusy || !quickAssignClassId}
                  onClick={() => void handleQuickAssignSavedToClass()}
                  className="btn-tactile btn-jade text-xs py-1.5 px-3"
                >
                  <Check className="w-3.5 h-3.5" />
                  {quickAssignBusy ? 'Đang gán...' : 'Gán & Xuất bản ngay cho lớp này'}
                </button>
              </div>
            )}
          </div>
        )}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-xs font-bold text-[#8A5108] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            {!showManualFallback && (
              <button
                type="button"
                onClick={() => setShowManualFallback(true)}
                className="px-3 py-1.5 rounded-lg bg-[#14284A] text-white font-bold"
              >
                Chuyển sang nhập tay
              </button>
            )}
          </div>
        )}
      </div>

      {/* MANUAL FALLBACK FORM */}
      {showManualFallback && (
        <form onSubmit={handleManualAddDraft} className="notebook-card p-5 space-y-3 border-2 border-[#2E9C8A]">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-extrabold text-[#14284A]">Nhập tay câu hỏi (Dự phòng)</h3>
            <button type="button" onClick={() => setShowManualFallback(false)} className="text-xs font-bold text-[#5B6B82]">
              Đóng
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <select
              value={manualCluster}
              onChange={(e) => {
                const cl = e.target.value as SkillCluster;
                setManualCluster(cl);
                setManualStation(clusterToDefaultStation(cl));
              }}
              className="px-2.5 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold"
            >
              {SKILL_CLUSTER_LIST.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={manualStation}
              onChange={(e) => setManualStation(e.target.value as StationId)}
              className="px-2.5 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold"
            >
              {STATION_LIST.map((st) => (
                <option key={st} value={st}>{st} — {STATIONS.find((s) => s.id === st)?.shortName}</option>
              ))}
            </select>
            <select
              value={manualLevel}
              onChange={(e) => setManualLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}
              className="px-2.5 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold"
            >
              {[1, 2, 3, 4].map((lv) => (
                <option key={lv} value={lv}>Mức {lv}</option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            required
            value={manualStem}
            onChange={(e) => setManualStem(e.target.value)}
            placeholder="Đề bài (hỗ trợ LaTeX trong $...$)"
            className="w-full p-2.5 rounded-xl bg-white border border-[#CBB17D] text-xs"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <input type="text" value={manualNumericAns} onChange={(e) => setManualNumericAns(e.target.value)} placeholder="Đáp án số" className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]" />
            <input type="text" value={manualUnit} onChange={(e) => setManualUnit(e.target.value)} placeholder="Đơn vị (m, °, m²)" className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]" />
            <input type="text" value={manualSolution} onChange={(e) => setManualSolution(e.target.value)} placeholder="Lời giải ngắn" className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <input type="text" value={manualHint1} onChange={(e) => setManualHint1(e.target.value)} placeholder="Gợi ý mức 1 (không lộ đáp án)" className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]" />
            <input type="text" value={manualHint2} onChange={(e) => setManualHint2(e.target.value)} placeholder="Gợi ý mức 2 (công thức)" className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]" />
          </div>
          <button type="submit" className="btn-tactile btn-jade text-xs py-2 px-4">
            Đưa vào danh sách duyệt
          </button>
        </form>
      )}

      {/* MODE B: PATTERN MAPPING PANEL (Document "Dạng n..." -> Web Taxonomy) */}
      {uniqueDocLabels.length > 0 && (
        <div className="notebook-card p-4 space-y-2.5 text-xs">
          <h3 className="font-display text-base font-extrabold text-[#14284A]">
            Ánh xạ dạng bài (Dạng trong tài liệu → Dạng trong web)
          </h3>
          <div className="space-y-2">
            {uniqueDocLabels.map((docLabel) => {
              const mappedId = patternMappings[docLabel] ?? '';
              return (
                <div key={docLabel} className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-[#FFFBF0] border border-[#E5D3A8]">
                  <span className="font-bold text-[#14284A] flex-1 min-w-[200px]">{docLabel}</span>
                  <ArrowRight className="w-4 h-4 text-[#2E9C8A] shrink-0" />
                  <select
                    value={mappedId}
                    onChange={(e) => {
                      const nextPid = e.target.value;
                      setPatternMappings((prev) => ({...prev, [docLabel]: nextPid}));
                      const pat = taxonomy.find((t) => t.id === nextPid);
                      setDraftItems((prev) =>
                        prev.map((q) =>
                          q.source_pattern_label === docLabel
                            ? {
                                ...q,
                                pattern_id: nextPid || null,
                                cluster: pat && pat.topic !== 'OUT' ? (pat.topic as SkillCluster) : q.cluster,
                                suggested_stations: computeSuggestedStations({
                                  topic: pat?.topic ?? q.cluster,
                                  patternId: nextPid || null,
                                  level: q.level,
                                  taxonomy,
                                }),
                              }
                            : q,
                        ),
                      );
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#CBB17D] font-bold text-[#14284A]"
                  >
                    <option value="">— Chưa ánh xạ (đề xuất dạng mới) —</option>
                    {taxonomy.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id} · {t.name}
                      </option>
                    ))}
                  </select>
                  {!mappedId && (
                    <button
                      type="button"
                      onClick={() => {
                        const created = dataService.proposeTaxonomyPattern(user, {
                          topic: 'MH',
                          name: docLabel,
                        });
                        if (created) {
                          setPatternMappings((prev) => ({...prev, [docLabel]: created.id}));
                          setStatusMsg(
                            isAdmin
                              ? `Đã thêm dạng mới "${created.name}" (${created.id}) vào danh mục.`
                              : `Đã gửi đề xuất dạng mới "${created.name}" chờ Admin chấp nhận.`,
                          );
                          onQuestionsChanged();
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#FFF4D6] border border-[#E0A93B] font-bold text-[#8A5108]"
                    >
                      + Đề xuất dạng mới
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MULTI-EXAM-CODE SELECTOR (when PDF answer key has multiple exam codes) */}
      {examCodes.length > 1 && (
        <div className="p-3 rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-extrabold text-[#14284A]">
            Bảng đáp án có nhiều mã đề ({examCodes.join(', ')}). Chọn mã đề cần ghép:
          </span>
          <div className="flex items-center gap-2">
            <select
              value={selectedExamCode}
              onChange={(e) => {
                const code = e.target.value;
                setSelectedExamCode(code);
                const merged = applyAnswerKeysToDrafts(draftItems, answerKeys, code);
                setDraftItems(merged.items);
                setStatusMsg(`Đã ghép lại đáp án theo Mã đề ${code}: khớp ${merged.matchedCount} câu.`);
              }}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#CBB17D] font-extrabold text-[#14284A]"
            >
              {examCodes.map((c) => (
                <option key={c} value={c}>Mã đề {c}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* SIDE-BY-SIDE REVIEW TABLE & BATCH ACTIONS */}
      {draftItems.length > 0 && (
        <div className="notebook-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5D3A8] pb-3">
            <div>
              <h3 className="font-display text-lg font-extrabold text-[#14284A]">
                Kiểm tra công thức, hình vẽ &amp; chọn lớp áp dụng ({draftItems.length} câu)
              </h3>
              <div className="flex flex-wrap gap-2 mt-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setReviewBucket('chapter3')}
                  className={`px-3 py-1 rounded-lg font-bold border ${
                    reviewBucket === 'chapter3'
                      ? 'bg-[#14284A] text-white border-[#14284A]'
                      : 'bg-white text-[#14284A] border-[#CBB17D]'
                  }`}
                >
                  Chương III ({chapter3Drafts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReviewBucket('out_of_chapter')}
                  className={`px-3 py-1 rounded-lg font-bold border ${
                    reviewBucket === 'out_of_chapter'
                      ? 'bg-[#8A5108] text-white border-[#8A5108]'
                      : 'bg-[#FFF5E2] text-[#8A5108] border-[#D98A1F]'
                  }`}
                >
                  Ngoài chương ({outOfChapterDrafts.length})
                </button>
                <select
                  value={filterPattern}
                  onChange={(e) => setFilterPattern(e.target.value)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-[#CBB17D] font-bold text-[#14284A]"
                >
                  <option value="ALL">Mọi dạng bài</option>
                  {taxonomy.map((t) => (
                    <option key={t.id} value={t.id}>{t.id} · {t.name}</option>
                  ))}
                </select>
                <select
                  value={filterFlag}
                  onChange={(e) => setFilterFlag(e.target.value as 'ALL' | 'flagged' | 'pass_only')}
                  className="px-2.5 py-1 rounded-lg bg-white border border-[#CBB17D] font-bold text-[#14284A]"
                >
                  <option value="ALL">Mọi kết quả kiểm chứng</option>
                  <option value="pass_only">✓ Đã kiểm bằng code</option>
                  <option value="flagged">⚠ Có cờ / cần xem lại</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleDrafts.length > 0 && visibleDrafts.every((d) => selectedIds.includes(d.id))}
                  onChange={(e) =>
                    setSelectedIds(e.target.checked ? visibleDrafts.map((d) => d.id) : [])
                  }
                  className="accent-[#2E9C8A]"
                />
                Chọn tất cả
              </label>

              <button
                type="button"
                disabled={busy || selectedIds.length === 0}
                onClick={() => void commitDrafts(selectedIds, 'approved', false)}
                className="btn-tactile btn-jade text-xs py-1.5 px-3.5"
                title="Lưu trực tiếp vào Ngân hàng ở trạng thái Đã duyệt (học sinh sử dụng được ngay, không cần chờ Admin duyệt)"
              >
                <Check className="w-4 h-4" />
                {busy ? 'Đang lưu...' : `Lưu & Duyệt ngay vào Ngân hàng (${selectedIds.length})`}
              </button>

              <button
                type="button"
                disabled={busy || selectedIds.length === 0}
                onClick={() => void commitDrafts(selectedIds, 'pending_teacher_review', false)}
                className="btn-tactile btn-paper text-xs py-1.5 px-3"
              >
                Lưu nháp ({selectedIds.length})
              </button>

              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowGalleryVerify((v) => !v)}
                    className="btn-tactile btn-gold text-xs py-1.5 px-3"
                    title="Mở chế độ thư viện đối chiếu 6 câu/màn hình"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    {showGalleryVerify ? 'Đóng thư viện 6 câu' : 'Thư viện đối chiếu 6 câu'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || selectedIds.length === 0}
                    onClick={() => void commitDrafts(selectedIds, 'rejected', false)}
                    className="px-3 py-1.5 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5108] text-xs font-bold"
                  >
                    Từ chối ({selectedIds.length})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* PER-CLASS TARGET SCOPE SELECTOR FOR THIS IMPORT BATCH */}
          {classes.length > 0 && (
            <div className="p-3 rounded-xl bg-[#F0FAF7] border border-[#2E9C8A]/50 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-[#14284A]">
                  Phạm vi phân bổ lớp học cho các câu sắp lưu:
                </span>
                <span className="text-[11px] font-semibold text-[#145B4F]">
                  {targetClassIds.length === 0
                    ? 'Đang chọn: Dùng chung (tất cả lớp đều dùng được)'
                    : `Đang chọn riêng cho ${targetClassIds.length} lớp`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTargetClassIds([])}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                    targetClassIds.length === 0
                      ? 'bg-[#14284A] text-white border-[#14284A]'
                      : 'bg-white text-[#14284A] border-[#CBB17D]'
                  }`}
                >
                  Dùng chung mọi lớp
                </button>
                {classes.map((c) => {
                  const active = targetClassIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setTargetClassIds((prev) =>
                          prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg font-bold border transition ${
                        active
                          ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                          : 'bg-white text-[#14284A] border-[#CBB17D]'
                      }`}
                    >
                      {active ? '✓ ' : ''}Lớp {c.name} ({c.code})
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[#5B6B82]">
                Mẹo: Chọn riêng lớp (ví dụ lớp hay sai lỗi E03 hoặc E05) để các câu này chỉ phục vụ học sinh lớp đó; hoặc để &ldquo;Dùng chung&rdquo; rồi gán từng lớp trong tab <strong>7. Set nhiệm vụ</strong>.
              </p>
            </div>
          )}

          {/* 6-Card Gallery Batch Eye-Check Mode (Section 6.4) */}
          {showGalleryVerify && (() => {
            const galleryCandidates = visibleDrafts
              .filter(
                (q) =>
                  q.math_verified !== true &&
                  q.verified_by_code === 'pass' &&
                  (q.confidence ?? 0) >= 0.95 &&
                  !(q.math_flags ?? []).some((f) =>
                    ['unbalanced_dollar', 'latex_syntax_error', 'numbers_mismatch', 'symbols_mismatch', 'formula_split'].includes(f),
                  ),
              )
              .slice(0, 6);
            return (
              <div className="p-4 rounded-2xl bg-[#EEF6FF] border-2 border-[#3B82F6] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-display text-base font-extrabold text-[#14284A]">
                      Thư viện đối chiếu nhanh (tối đa 6 câu/màn hình · độ tin cậy ≥ 95%, qua đủ 4 lớp kiểm tra)
                    </h4>
                    <p className="text-[11px] text-[#14437A]">
                      So sánh ảnh gốc với bản render KaTeX bên cạnh rồi bấm nút xác nhận để mở khóa duyệt hàng loạt.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={galleryCandidates.length === 0}
                    onClick={() => {
                      const ids = new Set(galleryCandidates.map((g) => g.id));
                      const now = new Date().toISOString();
                      setDraftItems((prev) =>
                        prev.map((d) =>
                          ids.has(d.id)
                            ? {
                                ...d,
                                math_verified: true,
                                math_verified_by: user.displayName,
                                math_verified_at: now,
                              }
                            : d,
                        ),
                      );
                      setStatusMsg(`Đã xác nhận đối chiếu công thức cho ${galleryCandidates.length} câu trong thư viện!`);
                    }}
                    className="btn-tactile btn-jade text-xs py-1.5 px-3"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Xác nhận đã đối chiếu {galleryCandidates.length} câu này
                  </button>
                </div>
                {galleryCandidates.length === 0 ? (
                  <p className="text-xs text-[#14437A] italic">
                    Không còn câu nào đạt ngưỡng tự động ≥ 95% chưa đối chiếu. Các câu còn lại vui lòng kiểm tra từng câu bên dưới.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {galleryCandidates.map((gc) => {
                      const gImg = gc.page_pdf ? pagePreviewCache[gc.page_pdf] : undefined;
                      return (
                        <div key={gc.id} className="p-2.5 rounded-xl bg-white border border-[#9EC5FE] grid grid-cols-2 gap-2 text-xs">
                          <div className="max-h-36 overflow-auto rounded border border-[#E5D3A8] bg-[#FAF5E8] p-1">
                            {gImg ? (
                              <img src={gImg} alt={`Trang ${gc.page_pdf}`} className="w-full object-contain" />
                            ) : (
                              <p className="text-[10px] text-[#5B6B82]">{gc.source_excerpt || '(Văn bản)'}</p>
                            )}
                          </div>
                          <div className="max-h-36 overflow-auto space-y-1">
                            <p className="font-extrabold text-[#14284A]">
                              Câu {gc.question_number ?? '?'} · {Math.round((gc.confidence ?? 0) * 100)}%
                            </p>
                            <MathText text={gc.stem_vi} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="space-y-4">
            {visibleDrafts.map((item, idx) => {
              const isSelected = selectedIds.includes(item.id);
              const dupMatch = findDuplicateMatch(item, existingQuestions);
              const isEditing = Boolean(expandedEditIds[item.id]);
              const batchCheck = isEligibleForBatchApproval(item, confidenceThreshold);
              const pageImgUrl = item.page_pdf ? pagePreviewCache[item.page_pdf] : undefined;
              const isOut = (item.flags ?? []).includes('out_of_chapter') || item.pattern_id === 'OUT-00';

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border-2 space-y-3 ${
                    item.verified_by_code === 'fail' || (item.flags ?? []).includes('figure_missing')
                      ? 'bg-[#FFF9EE] border-[#D98A1F]'
                      : 'bg-[#FFFBF0] border-[#D9C293]'
                  }`}
                >
                  {/* Header Metadata & Flags */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2 font-extrabold text-[#14284A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, item.id] : prev.filter((x) => x !== item.id),
                          )
                        }
                        className="accent-[#2E9C8A]"
                      />
                      <span>
                        #{idx + 1}
                        {item.part ? ` · Phần ${item.part}` : ''}
                        {item.question_number ? ` · Câu ${item.question_number}` : ''} ·{' '}
                        {item.pattern_id ?? 'Chưa gán dạng'} ({item.cluster}) · Mức {item.level} · {item.type}
                      </span>
                    </label>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.verified_by_code === 'pass' ? (
                        <span className="px-2 py-0.5 rounded bg-[#E6F6F3] border border-[#2E9C8A] font-bold text-[#145B4F]">
                          ✓ Đã kiểm bằng code
                        </span>
                      ) : item.verified_by_code === 'fail' ? (
                        <span className="px-2 py-0.5 rounded bg-[#FCE8E6] border border-[#C8392B] font-bold text-[#99261B]">
                          ⚠ Lệch đáp án
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-[#FFF4D6] border border-[#E0A93B] font-bold text-[#8A5108]">
                          Chưa kiểm được bằng code
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded bg-white border border-[#CBB17D] font-bold text-[#14284A]">
                        Tin cậy: {Math.round((item.confidence ?? 0.75) * 100)}%
                      </span>

                      <select
                        value={item.stationId}
                        onChange={(e) =>
                          updateDraft(item.id, (prev) => ({
                            ...prev,
                            stationId: e.target.value as StationId,
                          }))
                        }
                        title="Chọn trạm đích cho câu hỏi này"
                        className="px-2 py-0.5 rounded bg-white border border-[#2E9C8A] font-bold text-[#145B4F] !min-h-[26px]"
                      >
                        {STATION_LIST.map((stId) => (
                          <option key={stId} value={stId}>
                            Trạm {stId} · {STATIONS.find((s) => s.id === stId)?.shortName ?? stId}
                          </option>
                        ))}
                      </select>

                      {item.suggested_stations && item.suggested_stations.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-[#EEF6FF] border border-[#9EC5FE] font-bold text-[#14437A]">
                          Mốc gợi ý: {item.suggested_stations.map((m) => `Mốc ${m}`).join(', ')}
                        </span>
                      )}

                      {(item.flags ?? []).map((fl) => (
                        <span
                          key={fl}
                          className="px-2 py-0.5 rounded bg-[#FFF5E2] border border-[#D98A1F] font-bold text-[#8A5108]"
                        >
                          {fl}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Duplicate Match Resolution Bar */}
                  {dupMatch && (
                    <div className="p-2.5 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-xs space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-extrabold text-[#8A5108]">
                          {dupMatch.kind === 'exact'
                            ? `Trùng khớp hoàn toàn với câu [${dupMatch.existingQuestion.id}] trong Ngân hàng`
                            : `Gần giống (${Math.round(dupMatch.similarity * 100)}%) với câu [${dupMatch.existingQuestion.id}]`}
                        </span>
                        <select
                          value={duplicateDecisions[item.id] ?? 'skip'}
                          onChange={(e) =>
                            setDuplicateDecisions((prev) => ({
                              ...prev,
                              [item.id]: e.target.value as 'skip' | 'replace' | 'keep_both',
                            }))
                          }
                          className="px-2 py-1 rounded-lg bg-white border border-[#CBB17D] font-bold text-[#14284A]"
                        >
                          <option value="skip">Bỏ qua (không trùng)</option>
                          <option value="replace">Thay bản cũ (tạo phiên bản mới)</option>
                          <option value="keep_both">Giữ cả hai</option>
                        </select>
                      </div>
                      <p className="text-[11px] text-[#5B6B82] line-clamp-2">
                        <strong>Bản đang có:</strong> <MathText text={dupMatch.existingQuestion.stem_vi} />
                      </p>
                    </div>
                  )}

                  {/* Code Verification Detail */}
                  {item.code_verification && (
                    <div
                      className={`p-2 rounded-xl text-xs font-semibold ${
                        item.verified_by_code === 'pass'
                          ? 'bg-[#E6F6F3] text-[#145B4F]'
                          : item.verified_by_code === 'fail'
                            ? 'bg-[#FCE8E6] text-[#99261B]'
                            : 'bg-white border border-[#E5D3A8] text-[#5B6B82]'
                      }`}
                    >
                      {item.code_verification.note_vi}
                    </div>
                  )}

                  {/* SIDE-BY-SIDE COMPARISON: LEFT = PDF PAGE / FIGURE CROP, RIGHT = KATEX QUESTION */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-5 p-3 rounded-xl bg-white border border-[#E5D3A8] space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <p className="font-extrabold uppercase text-[#5B6B82]">
                          Trang gốc &amp; Hình vẽ {item.page_pdf ? `(PDF tr.${item.page_pdf}${item.page_printed ? ` · In tr.${item.page_printed}` : ''})` : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-1">
                          {pageImgUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewZoom((z) => (z === 1 ? 1.5 : z === 1.5 ? 2 : 1))
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] font-bold text-[#14284A]"
                              title="Phóng to ảnh trang gốc để soi chỉ số mũ/góc"
                            >
                              <ZoomIn className="w-3 h-3" /> {Math.round(previewZoom * 100)}%
                            </button>
                          )}
                          {item.figure_bbox && pageImgUrl && (
                            <button
                              type="button"
                              onClick={() => void handleUseCroppedFigure(item)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FFF4D6] border border-[#E0A93B] font-bold text-[#8A5108]"
                              title="Tự động cắt hình vẽ theo tọa độ AI phát hiện"
                            >
                              <Crop className="w-3 h-3" /> Cắt hình PDF
                            </button>
                          )}
                          {pageImgUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                if (manualCropDraftId === item.id) {
                                  setManualCropDraftId(null);
                                } else {
                                  setManualCropDraftId(item.id);
                                  setCropRect({
                                    x: item.figure_bbox?.x ?? 0.15,
                                    y: item.figure_bbox?.y ?? 0.18,
                                    w: item.figure_bbox?.w ?? 0.7,
                                    h: item.figure_bbox?.h ?? 0.3,
                                  });
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#EEF6FF] border border-[#9EC5FE] font-bold text-[#14437A]"
                              title="Chọn khung cắt hình vẽ thủ công từ trang PDF gốc"
                            >
                              <Crop className="w-3 h-3" /> {manualCropDraftId === item.id ? 'Đóng cắt' : 'Cắt tùy chọn'}
                            </button>
                          )}
                          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#E6F6F3] border border-[#2E9C8A] font-bold text-[#145B4F] cursor-pointer">
                            <Upload className="w-3 h-3" /> Tải ảnh
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f) void handleUploadFigureForDraft(item.id, f);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void handlePasteFigureForDraft(item.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] font-bold text-[#14284A]"
                            title="Chụp ảnh hình vẽ (Win+Shift+S) rồi bấm Dán ảnh"
                          >
                            <Clipboard className="w-3 h-3" /> Dán ảnh
                          </button>
                          {item.figure_crop && (
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft(item.id, (prev) => ({
                                  ...prev,
                                  figure_crop: undefined,
                                  figure_crop_private: undefined,
                                }))
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FCE8E6] border border-[#E5A09B] font-bold text-[#99261B]"
                            >
                              Xóa ảnh
                            </button>
                          )}
                          {pageImgUrl && !item.formula_image && (
                            <button
                              type="button"
                              onClick={async () => {
                                const bbox = item.question_bbox ?? item.figure_bbox ?? {page: item.page_pdf ?? 1, x: 0.04, y: 0.05, w: 0.92, h: 0.35};
                                const cropped = await cropFigureFromPageDataUrl(pageImgUrl, bbox, 150 * 1024);
                                if (cropped) {
                                  const kbSize = Math.round(cropped.approxBytes / 1024);
                                  updateDraft(item.id, (prev) => ({
                                    ...prev,
                                    formula_image: {
                                      dataUrl: cropped.dataUrl,
                                      alt: prev.stem_vi.slice(0, 140) || 'Ảnh công thức gốc (nội bộ lớp)',
                                      kbSize,
                                      privateClassOnly: true,
                                    },
                                  }));
                                  setStatusMsg(`Đã lưu ảnh cắt công thức an toàn (${kbSize} KB ≤ 150 KB) cho câu ${item.question_number ?? item.id}.`);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#EEF6FF] border border-[#9EC5FE] font-bold text-[#14437A]"
                              title="Phương án an toàn (Mục 6.6): dùng ảnh cắt biểu thức khi công thức quá phức tạp"
                            >
                              <Crop className="w-3 h-3" /> Ảnh công thức
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick picker for extracted DOCX images */}
                      {docxImages.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-[#FAF5E8] border border-[#E5D3A8]">
                          <span className="text-[10px] font-extrabold text-[#14284A]">Chọn hình từ tệp Word:</span>
                          {docxImages.map((img) => {
                            const activeImg = item.figure_crop === img.dataUrl;
                            return (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() =>
                                  updateDraft(item.id, (prev) => ({
                                    ...prev,
                                    needs_figure: true,
                                    figure_image_index: img.index,
                                    figure_crop: img.dataUrl,
                                    figure_crop_private: true,
                                    flags: (prev.flags ?? []).filter((f) => f !== 'figure_missing' && f !== 'no_image'),
                                  }))
                                }
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                                  activeImg
                                    ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                                    : 'bg-white text-[#14284A] border-[#CBB17D]'
                                }`}
                              >
                                <ImageIcon className="w-3 h-3" /> Hình {img.index}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Interactive Manual Cropper for PDF pages */}
                      {manualCropDraftId === item.id && pageImgUrl && (
                        <div className="p-2.5 rounded-xl bg-[#FFFBF0] border-2 border-[#2E9C8A] space-y-2">
                          <p className="text-[11px] font-extrabold text-[#14284A]">
                            Chỉnh khung đỏ bao quanh hình vẽ trên trang PDF rồi bấm Áp dụng:
                          </p>
                          <div className="relative w-full overflow-hidden rounded border border-[#CBB17D] bg-white">
                            <img src={pageImgUrl} alt="Chọn vùng cắt" className="w-full h-auto block" />
                            <div
                              className="absolute border-2 border-[#C8392B] bg-[#C8392B]/15 pointer-events-none"
                              style={{
                                left: `${cropRect.x * 100}%`,
                                top: `${cropRect.y * 100}%`,
                                width: `${cropRect.w * 100}%`,
                                height: `${cropRect.h * 100}%`,
                              }}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-[#14284A]">
                            <label>
                              Trái ({Math.round(cropRect.x * 100)}%)
                              <input
                                type="range"
                                min={0}
                                max={85}
                                value={Math.round(cropRect.x * 100)}
                                onChange={(e) => {
                                  const nx = Number(e.target.value) / 100;
                                  setCropRect((r) => ({...r, x: nx, w: Math.min(r.w, 1 - nx)}));
                                }}
                                className="w-full accent-[#2E9C8A]"
                              />
                            </label>
                            <label>
                              Trên ({Math.round(cropRect.y * 100)}%)
                              <input
                                type="range"
                                min={0}
                                max={85}
                                value={Math.round(cropRect.y * 100)}
                                onChange={(e) => {
                                  const ny = Number(e.target.value) / 100;
                                  setCropRect((r) => ({...r, y: ny, h: Math.min(r.h, 1 - ny)}));
                                }}
                                className="w-full accent-[#2E9C8A]"
                              />
                            </label>
                            <label>
                              Rộng ({Math.round(cropRect.w * 100)}%)
                              <input
                                type="range"
                                min={10}
                                max={Math.round((1 - cropRect.x) * 100)}
                                value={Math.round(cropRect.w * 100)}
                                onChange={(e) => setCropRect((r) => ({...r, w: Number(e.target.value) / 100}))}
                                className="w-full accent-[#2E9C8A]"
                              />
                            </label>
                            <label>
                              Cao ({Math.round(cropRect.h * 100)}%)
                              <input
                                type="range"
                                min={8}
                                max={Math.round((1 - cropRect.y) * 100)}
                                value={Math.round(cropRect.h * 100)}
                                onChange={(e) => setCropRect((r) => ({...r, h: Number(e.target.value) / 100}))}
                                className="w-full accent-[#2E9C8A]"
                              />
                            </label>
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setManualCropDraftId(null)}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#CBB17D] font-bold text-[#14284A]"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleUseCroppedFigure(item, {
                                  page: item.page_pdf ?? 1,
                                  ...cropRect,
                                })
                              }
                              className="px-3 py-1 rounded-lg bg-[#2E9C8A] text-white font-bold"
                            >
                              Áp dụng vùng cắt
                            </button>
                          </div>
                        </div>
                      )}

                      {item.figure_crop ? (
                        <div className="space-y-1">
                          <img
                            src={item.figure_crop}
                            alt="Hình vẽ minh họa câu hỏi"
                            className="w-full max-h-48 object-contain rounded-lg border border-[#2E9C8A] bg-white"
                          />
                          <p className="text-[10px] text-[#1F7A6B] font-bold">
                            ✓ Đã gắn hình minh họa (≤ 150 KB) — học sinh sẽ thấy đúng hình này khi làm bài.
                          </p>
                        </div>
                      ) : pageImgUrl ? (
                        <div className="max-h-64 overflow-auto rounded-lg border border-[#E5D3A8] bg-white">
                          <img
                            src={pageImgUrl}
                            alt={`Ảnh trang ${item.page_pdf}`}
                            style={{width: `${previewZoom * 100}%`, maxWidth: 'none'}}
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <p className="italic text-[#5B6B82] p-2 rounded-lg bg-[#FAF5E8]">
                          {item.source_excerpt || '(Trích xuất từ văn bản — có thể bấm "Tải ảnh" hoặc "Dán ảnh" ở trên để gắn hình vẽ)'}
                        </p>
                      )}

                      {item.source_pattern_label && (
                        <p className="text-[11px] text-[#14437A] font-bold">
                          Nhãn tài liệu: {item.source_pattern_label}
                        </p>
                      )}
                      {item.proposed_pattern && (
                        <p className="text-[11px] text-[#8A5108] font-bold">
                          Dạng mới AI đề xuất: {item.proposed_pattern}
                        </p>
                      )}
                    </div>

                    <div className="lg:col-span-7 p-3 rounded-xl bg-white border border-[#CBB17D] space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-extrabold uppercase text-[#1F7A6B]">
                          Bản hiển thị KaTeX (xem trước học viên)
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {questionContainsMath(item) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (item.math_verified) {
                                  updateDraft(item.id, (prev) => ({
                                    ...prev,
                                    math_verified: false,
                                    math_verified_by: undefined,
                                    math_verified_at: undefined,
                                  }));
                                  return;
                                }
                                const chk = verifyQuestionMathLayers(item, {
                                  referenceText: item.source_excerpt,
                                  doubleCheckText: item.double_check_text,
                                });
                                if (chk.syntaxErrors.length > 0) {
                                  setErrorMsg(`Chưa thể đối chiếu câu ${item.question_number ?? item.id}: ${chk.syntaxErrors.join(' | ')}`);
                                  return;
                                }
                                updateDraft(item.id, (prev) => ({
                                  ...prev,
                                  math_format: 'latex-1',
                                  math_verified: true,
                                  math_verified_by: user.displayName,
                                  math_verified_at: new Date().toISOString(),
                                  math_flags: chk.flags,
                                }));
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold ${
                                item.math_verified
                                  ? 'bg-[#E6F6F3] border-[#2E9C8A] text-[#145B4F]'
                                  : 'bg-[#EEF6FF] border-[#3B82F6] text-[#14437A]'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {item.math_verified ? 'Đã đối chiếu công thức ✓' : 'Đã đối chiếu công thức'}
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              disabled={questionContainsMath(item) && !item.math_verified}
                              title={
                                questionContainsMath(item) && !item.math_verified
                                  ? 'Hãy bấm "Đã đối chiếu công thức" trước khi duyệt trực tiếp vào Ngân hàng'
                                  : 'Duyệt trực tiếp câu này vào Ngân hàng câu hỏi'
                              }
                              onClick={() => commitDrafts([item.id], 'approved', false)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2E9C8A] text-white font-bold disabled:opacity-45"
                            >
                              <Check className="w-3.5 h-3.5" /> Duyệt vào Ngân hàng
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedEditIds((prev) => ({...prev, [item.id]: !prev[item.id]}))
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFF4D6] border border-[#E0A93B] text-[#14284A] font-bold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            {isEditing ? 'Thu gọn' : 'Sửa trực tiếp'}
                          </button>
                        </div>
                      </div>

                      {(item.math_flags ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(item.math_flags ?? []).map((mf) => (
                            <span
                              key={mf}
                              className="px-2 py-0.5 rounded-full bg-[#FCE8E6] border border-[#E5A09B] text-[#99261B] text-[10px] font-bold"
                            >
                              Cờ Toán: {mf}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="text-sm font-semibold text-[#14284A] leading-relaxed">
                        <MathText text={item.stem_vi} formulaImage={item.formula_image} />
                      </div>

                      {item.figure_crop ? (
                        <div className="p-2 rounded-xl bg-[#FFFBF0] border border-[#D9C293] flex justify-center">
                          <img
                            src={item.figure_crop}
                            alt="Hình minh họa học viên sẽ thấy"
                            className="max-h-48 w-auto max-w-full object-contain rounded-lg bg-white"
                          />
                        </div>
                      ) : item.needs_figure || (item.flags ?? []).includes('figure_missing') ? (
                        <div className="p-2.5 rounded-xl border border-dashed border-[#D98A1F] bg-[#FFF9EB] text-[11px] font-semibold text-[#8A5108]">
                          ⚠ Đề bài có nhắc đến hình vẽ nhưng chưa gắn ảnh. Hãy chọn hình từ tệp Word, bấm <strong>Cắt tùy chọn</strong> (PDF), hoặc bấm <strong>Tải ảnh / Dán ảnh</strong> ở khung bên trái.
                        </div>
                      ) : null}

                      {item.options && item.options.length > 0 && (
                        <ul className="space-y-1">
                          {item.options.map((o, oIdx) => {
                            const isCorrect = String(item.expected_answer.choice) === o.id;
                            return (
                              <li
                                key={o.id}
                                className={`px-2 py-1 rounded-lg ${
                                  isCorrect ? 'bg-[#E6F6F3] text-[#145B4F] font-bold' : 'text-[#5B6B82]'
                                }`}
                              >
                                {String.fromCharCode(65 + oIdx)}. <MathText text={o.label} />
                                {isCorrect ? ' ✓' : ''}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {item.statements && item.statements.length > 0 && (
                        <ul className="space-y-1">
                          {item.statements.map((s) => (
                            <li key={s.id} className="px-2 py-1 rounded-lg bg-[#FAF5E8] flex justify-between gap-2">
                              <span><strong>{s.id})</strong> <MathText text={s.label} /></span>
                              <span className={`font-extrabold ${s.isTrue ? 'text-[#145B4F]' : 'text-[#99261B]'}`}>
                                {s.isTrue ? 'Đúng' : 'Sai'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {item.type === 'numeric' && (
                        <p>
                          <strong>Đáp án chuẩn:</strong>{' '}
                          <code className="px-1.5 py-0.5 rounded bg-[#FAF5E8]">
                            {item.expected_answer.rounded ?? item.expected_answer.value ?? '(Chưa có)'}
                            {item.fixedUnitLabel ? ` ${item.fixedUnitLabel}` : ''}
                          </code>
                        </p>
                      )}

                      {item.solution_vi && (
                        <p className="text-[#1F7A6B]">
                          <strong>Lời giải:</strong> <MathText text={item.solution_vi} />
                        </p>
                      )}
                      <p className="text-[11px] text-[#5B6B82]">
                        <strong>Gợi ý 1:</strong> <MathText text={item.hints_vi[0] ?? '—'} /> ·{' '}
                        <strong>Gợi ý 2:</strong> <MathText text={item.hints_vi[1] ?? '—'} />
                      </p>
                    </div>
                  </div>

                  {/* INLINE EDITOR */}
                  {isEditing && (
                    <div className="p-3 rounded-xl bg-white border-2 border-[#2E9C8A]/50 space-y-2.5 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block font-bold mb-1">Dạng bài (pattern_id)</label>
                          <select
                            value={item.pattern_id ?? ''}
                            onChange={(e) => {
                              const pid = e.target.value;
                              const pat = taxonomy.find((t) => t.id === pid);
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                pattern_id: pid || null,
                                cluster: pat && pat.topic !== 'OUT' ? (pat.topic as SkillCluster) : prev.cluster,
                                flags:
                                  pid === 'OUT-00'
                                    ? Array.from(new Set([...(prev.flags ?? []), 'out_of_chapter']))
                                    : (prev.flags ?? []).filter((f) => f !== 'out_of_chapter'),
                              }));
                            }}
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D] font-bold"
                          >
                            <option value="">— Chưa gán —</option>
                            {taxonomy.map((t) => (
                              <option key={t.id} value={t.id}>{t.id} · {t.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Chủ đề</label>
                          <select
                            value={item.cluster}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({...prev, cluster: e.target.value as SkillCluster}))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D] font-bold"
                          >
                            {SKILL_CLUSTER_LIST.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Mức (1–4)</label>
                          <select
                            value={item.level}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({...prev, level: Number(e.target.value) as 1 | 2 | 3 | 4}))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D] font-bold"
                          >
                            {[1, 2, 3, 4].map((lv) => (
                              <option key={lv} value={lv}>Mức {lv}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Loại câu</label>
                          <select
                            value={item.type}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({...prev, type: e.target.value as QuestionType}))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D] font-bold"
                          >
                            {QUESTION_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <MathLatexEditor
                        label="Đề bài (LaTeX trong $...$ — sửa công thức sẽ đặt lại yêu cầu đối chiếu)"
                        value={item.stem_vi}
                        onChange={(nextStem) =>
                          updateDraft(item.id, (prev) => ({
                            ...prev,
                            stem_vi: nextStem,
                            math_verified: false,
                            math_verified_by: undefined,
                            math_verified_at: undefined,
                          }))
                        }
                        rows={2}
                        compact
                      />

                      {item.type === 'numeric' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold mb-1">Đáp án số</label>
                            <input
                              type="text"
                              value={String(item.expected_answer.rounded ?? item.expected_answer.value ?? '')}
                              onChange={(e) => {
                                const n = Number(e.target.value.replace(',', '.'));
                                updateDraft(item.id, (prev) => ({
                                  ...prev,
                                  expected_answer: {
                                    ...prev.expected_answer,
                                    rounded: Number.isFinite(n) ? n : undefined,
                                    value: Number.isFinite(n) ? n : undefined,
                                  },
                                  flags: Number.isFinite(n)
                                    ? (prev.flags ?? []).filter((f) => f !== 'missing_answer')
                                    : prev.flags,
                                }));
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                            />
                          </div>
                          <div>
                            <label className="block font-bold mb-1">Đơn vị</label>
                            <input
                              type="text"
                              value={item.fixedUnitLabel ?? ''}
                              onChange={(e) =>
                                updateDraft(item.id, (prev) => ({
                                  ...prev,
                                  fixedUnitLabel: e.target.value || undefined,
                                  expected_answer: {...prev.expected_answer, unit: e.target.value},
                                }))
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block font-bold mb-1">Lời giải chi tiết</label>
                        <textarea
                          rows={2}
                          value={item.solution_vi}
                          onChange={(e) => updateDraft(item.id, (prev) => ({...prev, solution_vi: e.target.value}))}
                          className="w-full p-2 rounded-lg border border-[#CBB17D]"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={item.hints_vi[0] ?? ''}
                          onChange={(e) =>
                            updateDraft(item.id, (prev) => ({...prev, hints_vi: [e.target.value, prev.hints_vi[1] ?? '']}))
                          }
                          placeholder="Gợi ý mức 1"
                          className="px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                        />
                        <input
                          type="text"
                          value={item.anticipated_error_ids.join(', ')}
                          onChange={(e) =>
                            updateDraft(item.id, (prev) => ({
                              ...prev,
                              anticipated_error_ids: e.target.value
                                .split(',')
                                .map((s) => s.trim().toUpperCase())
                                .filter((c) => ERROR_CODES.includes(c)),
                            }))
                          }
                          placeholder="Mã lỗi E01–E12"
                          className="px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Per-item Action Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap gap-2 items-center">
                      {isOut ? (
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft(item.id, (prev) => ({
                              ...prev,
                              pattern_id: null,
                              flags: (prev.flags ?? []).filter((f) => f !== 'out_of_chapter'),
                            }))
                          }
                          className="btn-tactile btn-gold text-xs py-1.5 px-3"
                        >
                          Đưa lại vào Chương III
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void commitDrafts([item.id], 'approved', false)}
                            className="btn-tactile btn-jade text-xs py-1.5 px-3"
                          >
                            <Check className="w-3.5 h-3.5" /> Lưu &amp; Duyệt ngay vào Ngân hàng
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void commitDrafts([item.id], 'pending_teacher_review', false)}
                            className="btn-tactile btn-paper text-xs py-1.5 px-3"
                          >
                            Lưu nháp
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void commitDrafts([item.id], 'rejected', false)}
                              className="px-3 py-1.5 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5108] text-xs font-bold inline-flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Từ chối
                            </button>
                          )}
                          {!batchCheck.eligible && (
                            <span className="text-[11px] font-semibold text-[#8A5108]">
                              <ShieldCheck className="w-3.5 h-3.5 inline mr-0.5" />
                              Lưu ý kiểm tra: {batchCheck.reason}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setDraftItems((prev) => prev.filter((x) => x.id !== item.id));
                        setSelectedIds((prev) => prev.filter((x) => x !== item.id));
                      }}
                      className="text-xs font-bold text-[#99261B] inline-flex items-center gap-1 hover:underline"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Bỏ khỏi nháp
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

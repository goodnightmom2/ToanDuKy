import React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  Edit3,
  FileText,
  FolderOpen,
  HardDriveUpload,
  PenLine,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import {ERROR_CATALOG, SKILL_CLUSTER_LIST, STATIONS} from '../config.ts';
import {verifyQuestionByCode} from '../math/verifier.ts';
import {dataService, generateId} from '../services/dataService.ts';
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
  clusterToDefaultStation,
  mapAiExtractedItemsToDrafts,
  parseDocxArrayBuffer,
  parsePdfArrayBuffer,
  parseSection11Json,
  type PdfExtractedPage,
  type PdfParseResult,
} from '../services/materialImport.ts';
import type {
  AppSettings,
  QuestionItem,
  QuestionType,
  ReviewStatus,
  SkillCluster,
  StationId,
  UserAccount,
} from '../types.ts';
import {MathText} from './MathText.tsx';

interface AiStatusInfo {
  configured: boolean;
  model: string;
  dailyUsed: number;
  dailyLimit: number;
  remaining?: number;
  date?: string;
}

interface MaterialImporterProps {
  user: UserAccount;
  settings: AppSettings;
  existingQuestions: QuestionItem[];
  onQuestionsChanged: () => void;
  onOpenSettingsTab: () => void;
}

const QUESTION_TYPES: Array<{value: QuestionType; label: string}> = [
  {value: 'numeric', label: 'Trả lời ngắn / số (numeric)'},
  {value: 'mcq', label: 'Trắc nghiệm 4 lựa chọn (mcq)'},
  {value: 'true_false_multi', label: 'Đúng/sai nhiều ý (true_false_multi)'},
  {value: 'matching', label: 'Ghép cặp (matching)'},
  {value: 'fill_relation', label: 'Điền hệ thức (fill_relation)'},
  {value: 'tap_diagram', label: 'Chạm hình (tap_diagram)'},
  {value: 'measurement', label: 'Đo đạc (measurement)'},
  {value: 'agree_explain', label: 'Đồng ý / giải thích (agree_explain)'},
  {value: 'error_spot', label: 'Tìm lỗi sai (error_spot)'},
];

const STATION_LIST: StationId[] = ['QS01', 'DD01', 'BS01', 'KV01', 'HT01'];
const ERROR_CODES = Object.keys(ERROR_CATALOG);

export const MaterialImporter: React.FC<MaterialImporterProps> = ({
  user,
  settings,
  existingQuestions,
  onQuestionsChanged,
  onOpenSettingsTab,
}) => {
  const [aiStatus, setAiStatus] = React.useState<AiStatusInfo | null>(null);
  const [sourceName, setSourceName] = React.useState('Tài liệu Chương III');
  const [driveFileId, setDriveFileId] = React.useState<string | undefined>(undefined);
  const [importText, setImportText] = React.useState('');
  const [pdfBuffer, setPdfBuffer] = React.useState<ArrayBuffer | null>(null);
  const [pdfStartPage, setPdfStartPage] = React.useState(1);
  const [pdfEndPage, setPdfEndPage] = React.useState(6);
  const [pdfInfo, setPdfInfo] = React.useState<PdfParseResult | null>(null);

  const [driveConnected, setDriveConnected] = React.useState(hasActiveDriveToken());
  const [driveFolderName, setDriveFolderName] = React.useState<string>('');
  const [driveFolderFiles, setDriveFolderFiles] = React.useState<DrivePickedItem[]>([]);

  const [busy, setBusy] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');
  const [showManualFallback, setShowManualFallback] = React.useState(false);

  const [draftItems, setDraftItems] = React.useState<QuestionItem[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [expandedEditIds, setExpandedEditIds] = React.useState<Record<string, boolean>>({});

  // Inline manual fallback form state
  const [manualStem, setManualStem] = React.useState('');
  const [manualCluster, setManualCluster] = React.useState<SkillCluster>('SIN');
  const [manualStation, setManualStation] = React.useState<StationId>('BS01');
  const [manualLevel, setManualLevel] = React.useState<1 | 2 | 3 | 4>(2);
  const [manualNumericAns, setManualNumericAns] = React.useState('');
  const [manualUnit, setManualUnit] = React.useState('m');
  const [manualHint1, setManualHint1] = React.useState('');
  const [manualHint2, setManualHint2] = React.useState('');
  const [manualSolution, setManualSolution] = React.useState('');
  const [manualPagePrinted, setManualPagePrinted] = React.useState('');
  const [manualPagePdf, setManualPagePdf] = React.useState('');

  const driveConfigured = Boolean(settings.driveClientId?.trim() && settings.driveApiKey?.trim());

  const fetchAiStatus = React.useCallback(() => {
    void dataService.getAccessToken().then((token) => {
      const headers: Record<string, string> = token ? {Authorization: `Bearer ${token}`} : {};
      return fetch(`/api/ai/status?maxDaily=${encodeURIComponent(settings.aiDailyQuotaLimit)}`, {
        headers,
      });
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AiStatusInfo | null) => {
        if (d) setAiStatus(d);
      })
      .catch(() => {});
  }, [settings.aiDailyQuotaLimit]);

  React.useEffect(() => {
    fetchAiStatus();
  }, [fetchAiStatus]);

  const clearMessages = () => {
    setStatusMsg('');
    setErrorMsg('');
  };

  // Process any loaded file (from local disk OR Google Drive)
  const processFileBuffer = async (
    fileName: string,
    arrayBuffer: ArrayBuffer,
    pickedDriveId?: string,
  ) => {
    clearMessages();
    setSourceName(fileName);
    setDriveFileId(pickedDriveId);
    setPdfInfo(null);
    setPdfBuffer(null);
    const lower = fileName.toLowerCase();

    try {
      if (lower.endsWith('.json')) {
        const text = new TextDecoder('utf-8').decode(arrayBuffer);
        const parsed = parseSection11Json(text, {
          sourceFileName: fileName,
          driveFileId: pickedDriveId,
        });
        setDraftItems(parsed.items);
        setSelectedIds(parsed.items.map((x) => x.id));
        const mismatchCount = parsed.items.filter(
          (x) => x.code_verification?.status === 'mismatch_flagged',
        ).length;
        const verifiedCount = parsed.items.filter(
          (x) => x.code_verification?.status === 'verified_match',
        ).length;
        setStatusMsg(
          `Đã đọc ${parsed.items.length} câu từ JSON (${fileName}${parsed.missionId ? ` · trạm ${parsed.missionId}` : ''}). ` +
            `Code tự giải khớp ${verifiedCount} câu${mismatchCount > 0 ? `, gắn cờ lệch ${mismatchCount} câu` : ''}. Tất cả ở trạng thái chờ duyệt (pending_teacher_review).`,
        );
      } else if (lower.endsWith('.docx')) {
        setBusy(true);
        const extracted = await parseDocxArrayBuffer(arrayBuffer);
        setImportText(extracted);
        setStatusMsg(
          `Đã tách văn bản từ Word (${fileName}, ${extracted.length} ký tự). Kiểm tra nội dung rồi bấm "Trích xuất câu hỏi bằng AI" hoặc chuyển sang nhập tay.`,
        );
      } else if (lower.endsWith('.pdf')) {
        setBusy(true);
        setPdfBuffer(arrayBuffer);
        const parsedPdf = await parsePdfArrayBuffer(arrayBuffer, {
          startPage: pdfStartPage,
          endPage: pdfEndPage,
          maxPages: 8,
        });
        setPdfInfo(parsedPdf);
        setImportText(parsedPdf.combinedText);
        setStatusMsg(
          `Đã đọc ${parsedPdf.extractedCount}/${parsedPdf.totalPages} trang PDF bằng pdf.js ` +
            `(${parsedPdf.scannedCount} trang ảnh quét sẵn sàng gửi Gemini đa phương thức). ` +
            `Tệp PDF gốc KHÔNG lưu vào CSDL — chỉ lưu tên tệp, số trang in/PDF và đoạn trích ngắn.`,
        );
      } else {
        const text = new TextDecoder('utf-8').decode(arrayBuffer);
        setImportText(text);
        setStatusMsg(`Đã nạp văn bản từ ${fileName} (${text.length} ký tự).`);
      }
    } catch (err) {
      setErrorMsg(
        `Không thể đọc tệp ${fileName}: ${err instanceof Error ? err.message : 'Định dạng chưa hợp lệ'}.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await processFileBuffer(file.name, buf, undefined);
    e.target.value = '';
  };

  const handleReReadPdfRange = async () => {
    if (!pdfBuffer) return;
    clearMessages();
    setBusy(true);
    try {
      const parsedPdf = await parsePdfArrayBuffer(pdfBuffer, {
        startPage: pdfStartPage,
        endPage: pdfEndPage,
        maxPages: 8,
      });
      setPdfInfo(parsedPdf);
      setImportText(parsedPdf.combinedText);
      setStatusMsg(
        `Đã đọc lại PDF từ trang ${pdfStartPage} đến ${Math.min(pdfEndPage, parsedPdf.totalPages)} ` +
          `(${parsedPdf.scannedCount} trang ảnh quét).`,
      );
    } catch (err) {
      setErrorMsg(
        `Lỗi đọc khoảng trang PDF: ${err instanceof Error ? err.message : 'Không xác định'}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDrivePicker = async () => {
    clearMessages();
    if (!driveConfigured) {
      setErrorMsg(
        'Thiếu Google OAuth Client ID hoặc Picker API Key trong Cài đặt Quản trị. Xem hướng dẫn 5 bước bên cạnh.',
      );
      return;
    }
    setBusy(true);
    try {
      const {items, accessToken} = await openGoogleDrivePicker({
        clientId: settings.driveClientId!.trim(),
        apiKey: settings.driveApiKey!.trim(),
      });
      setDriveConnected(true);
      if (items.length === 0) {
        setStatusMsg('Đã đóng Google Picker (chưa chọn tệp hoặc thư mục).');
        return;
      }
      const picked = items[0];
      if (picked.isFolder) {
        const files = await listSupportedFilesInFolder(picked.id, accessToken);
        setDriveFolderName(picked.name);
        setDriveFolderFiles(files);
        setStatusMsg(
          `Đã chọn thư mục Google Drive "${picked.name}": tìm thấy ${files.length} tệp hỗ trợ (.json, .docx, .pdf, .txt). Chọn tệp bên dưới để nạp.`,
        );
      } else {
        setDriveFolderName('');
        setDriveFolderFiles([]);
        const buf = await downloadDriveFileArrayBuffer(picked.id, accessToken);
        await processFileBuffer(picked.name, buf, picked.id);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể kết nối Google Drive Picker.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLoadDriveFolderFile = async (fileItem: DrivePickedItem) => {
    clearMessages();
    const token = getActiveDriveToken();
    if (!token) {
      setErrorMsg('Phiên Google Drive đã hết hạn trong bộ nhớ. Hãy bấm lại "Chọn từ Google Drive".');
      setDriveConnected(false);
      return;
    }
    setBusy(true);
    try {
      const buf = await downloadDriveFileArrayBuffer(fileItem.id, token);
      await processFileBuffer(fileItem.name, buf, fileItem.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải tệp từ Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectDrive = () => {
    clearDriveToken();
    setDriveConnected(false);
    setDriveFolderFiles([]);
    setDriveFolderName('');
    setStatusMsg('Đã xóa token Google Drive khỏi bộ nhớ tạm.');
  };

  const runAiExtract = async () => {
    clearMessages();
    const hasPdfPages = Boolean(pdfInfo && pdfInfo.pages.length > 0);
    if (!importText.trim() && !hasPdfPages) {
      setErrorMsg('Hãy tải tệp học liệu hoặc dán văn bản Toán 10 Chương III trước khi gọi AI.');
      return;
    }

    setBusy(true);
    try {
      const pagesPayload: PdfExtractedPage[] = hasPdfPages
        ? pdfInfo!.pages.map((p) => ({
            pagePdf: p.pagePdf,
            pagePrinted: p.pagePrinted,
            text: p.text,
            isScanned: p.isScanned,
            imageBase64: p.imageBase64,
            mimeType: p.mimeType,
          }))
        : [];

      const token = await dataService.getAccessToken();
      const resp = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({
          text: hasPdfPages ? '' : importText,
          pages: pagesPayload,
          sourceName,
          driveFileId,
          maxDaily: settings.aiDailyQuotaLimit,
          aiEnabled: settings.aiEnabled,
        }),
      });

      const data = (await resp.json()) as {
        items?: Array<Record<string, unknown>>;
        error?: string;
        quotaExceeded?: boolean;
        fallbackToManual?: boolean;
        quota?: {used: number; limit: number; remaining: number; date: string};
      };

      if (data.quota) {
        setAiStatus((prev) => ({
          configured: prev?.configured ?? true,
          model: prev?.model ?? 'gemini-4-hydrogen',
          dailyUsed: data.quota!.used,
          dailyLimit: data.quota!.limit,
          remaining: data.quota!.remaining,
          date: data.quota!.date,
        }));
      }

      if (!resp.ok) {
        setErrorMsg(data.error ?? 'Trích xuất AI chưa thành công.');
        if (data.quotaExceeded || data.fallbackToManual) {
          setShowManualFallback(true);
        }
        return;
      }

      const drafts = mapAiExtractedItemsToDrafts(data.items ?? [], {
        sourceFileName: sourceName,
        driveFileId,
      });

      setDraftItems(drafts);
      setSelectedIds(drafts.map((d) => d.id));
      const matched = drafts.filter((d) => d.code_verification?.status === 'verified_match').length;
      const mismatched = drafts.filter(
        (d) => d.code_verification?.status === 'mismatch_flagged',
      ).length;

      setStatusMsg(
        `AI đã trích xuất ${drafts.length} câu chuyển thể (mặc định pending_teacher_review). ` +
          `Code tự giải kiểm chứng: khớp ${matched} câu` +
          (mismatched > 0 ? `, CẢNH BÁO LỆCH ${mismatched} câu!` : '.') +
          ' Giáo viên hãy đối chiếu bản gốc và duyệt bên dưới.',
      );
    } catch {
      setErrorMsg(
        'Không kết nối được tới máy chủ AI. Giáo viên có thể chuyển sang nhập tay ngay bên dưới.',
      );
      setShowManualFallback(true);
    } finally {
      setBusy(false);
    }
  };

  // Live update of any draft field with automatic re-verification by code
  const updateDraft = (id: string, updater: (prev: QuestionItem) => QuestionItem) => {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = updater(item);
        return {
          ...updated,
          code_verification: verifyQuestionByCode(updated),
        };
      }),
    );
  };

  const applyCodeSolvedAnswer = (id: string) => {
    updateDraft(id, (item) => {
      const cv = item.code_verification;
      if (!cv || cv.roundedCodeValue === undefined) return item;
      return {
        ...item,
        expected_answer: {
          ...item.expected_answer,
          rounded: cv.roundedCodeValue,
          value: cv.roundedCodeValue,
          exact_numeric: cv.codeValue ?? cv.roundedCodeValue,
        },
      };
    });
  };

  const commitDrafts = (targetIds: string[], targetStatus: ReviewStatus) => {
    const toCommit = draftItems.filter((d) => targetIds.includes(d.id));
    if (toCommit.length === 0) return;

    const note =
      targetStatus === 'approved'
        ? 'Nhập học liệu & giáo viên duyệt trực tiếp'
        : targetStatus === 'rejected'
          ? 'Nhập học liệu & từ chối'
          : 'Nhập học liệu (chờ giáo viên duyệt)';

    for (const item of toCommit) {
      dataService.upsertQuestion(
        user,
        {
          ...item,
          review_status: targetStatus,
          reviewedBy: targetStatus !== 'pending_teacher_review' ? user.uid : undefined,
          reviewedAt:
            targetStatus !== 'pending_teacher_review' ? new Date().toISOString() : undefined,
        },
        note,
      );
    }

    setDraftItems((prev) => prev.filter((d) => !targetIds.includes(d.id)));
    setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    onQuestionsChanged();

    const label =
      targetStatus === 'approved'
        ? 'Đã DUYỆT (approved — hiển thị cho học viên)'
        : targetStatus === 'rejected'
          ? 'Đã TỪ CHỐI (rejected)'
          : 'Đã lưu vào Ngân hàng ở trạng thái CHỜ DUYỆT (pending_teacher_review)';
    setStatusMsg(`${label}: ${toCommit.length} câu hỏi.`);
  };

  const handleManualAddDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualStem.trim()) return;
    const numericVal = Number(manualNumericAns.replace(',', '.'));
    const hasNum = manualNumericAns.trim() !== '' && Number.isFinite(numericVal);

    const newDraft: QuestionItem = {
      id: generateId('man'),
      stationId: manualStation,
      stage: 'practice',
      cluster: manualCluster,
      skill_ids: [manualCluster.toLowerCase()],
      level: manualLevel,
      type: 'numeric',
      stem_vi: manualStem.trim(),
      expected_answer: hasNum
        ? {
            rounded: numericVal,
            value: numericVal,
            decimal_places: 1,
            unit: manualUnit.trim(),
          }
        : {value: 0, unit: manualUnit.trim()},
      fixedUnitLabel: manualUnit.trim() || undefined,
      solution_vi: manualSolution.trim() || 'Thay dữ kiện vào công thức Chương III rồi tính theo đơn vị độ.',
      anticipated_error_ids: ['E05'],
      hints_vi: [
        manualHint1.trim() || 'Xác định các cạnh và góc đã cho trong tam giác.',
        manualHint2.trim() || 'Lập hệ thức liên hệ giữa cạnh và góc đối diện rồi thay số.',
      ],
      review_status: 'pending_teacher_review',
      source_refs: [sourceName],
      is_adapted: true,
      source_file_name: sourceName,
      drive_file_id: driveFileId,
      page_pdf: manualPagePdf ? Number(manualPagePdf) : undefined,
      page_printed: manualPagePrinted.trim() || undefined,
      source_excerpt: importText.trim().slice(0, 220) || manualStem.trim().slice(0, 180),
      confidence: 1,
      ai_reason: 'Giáo viên nhập tay trực tiếp (không dùng lượt AI).',
    };
    newDraft.code_verification = verifyQuestionByCode(newDraft);

    setDraftItems((prev) => [newDraft, ...prev]);
    setSelectedIds((prev) => [newDraft.id, ...prev]);
    setManualStem('');
    setManualNumericAns('');
    setManualHint1('');
    setManualHint2('');
    setManualSolution('');
    setStatusMsg('Đã thêm 1 câu nhập tay vào danh sách đối chiếu (trạng thái pending_teacher_review).');
  };

  const quotaUsed = aiStatus?.dailyUsed ?? 0;
  const quotaLimit = aiStatus?.dailyLimit ?? settings.aiDailyQuotaLimit;
  const quotaPct = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0;
  const quotaExhausted = quotaUsed >= quotaLimit;

  const mismatchDraftsCount = draftItems.filter(
    (d) => d.code_verification?.status === 'mismatch_flagged',
  ).length;
  const verifiedDraftsCount = draftItems.filter(
    (d) => d.code_verification?.status === 'verified_match',
  ).length;

  return (
    <div className="space-y-4">
      {/* TOP HEADER + AI QUOTA MONITOR */}
      <div className="notebook-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-extrabold text-[#14284A]">
              Nhập học liệu Chương III (Google Drive / Máy tính / Dán văn bản + Gemini)
            </h2>
            <p className="text-xs text-[#5B6B82]">
              Hỗ trợ <strong>.json</strong> (schema Mục 11.1), <strong>.docx</strong> (mammoth),{' '}
              <strong>.pdf</strong> (pdf.js + gửi trang ảnh quét cho Gemini đa phương thức). Mặc định mọi câu vào{' '}
              <strong>pending_teacher_review</strong>; chỉ câu <strong>approved</strong> mới hiện với học viên. Không lưu nguyên tệp PDF vào CSDL.
            </p>
          </div>

          <div className="min-w-[260px] p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#14284A]">
              <span>Hạn mức AI hôm nay</span>
              <span className={quotaExhausted ? 'text-[#B5650D]' : 'text-[#1F7A6B]'}>
                {quotaUsed}/{quotaLimit} lượt
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#EFE0BC] overflow-hidden">
              <div
                className={`h-full transition-all ${quotaExhausted ? 'bg-[#D98A1F]' : 'bg-[#2E9C8A]'}`}
                style={{width: `${quotaPct}%`}}
              />
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] text-[#5B6B82]">
              <span className="truncate">
                {aiStatus?.configured
                  ? `Model: ${aiStatus.model}`
                  : 'Chưa cấu hình GEMINI_API_KEY'}
              </span>
              <button
                type="button"
                onClick={fetchAiStatus}
                className="inline-flex items-center gap-1 font-bold text-[#14284A] hover:underline shrink-0 !min-h-[24px]"
              >
                <RefreshCw className="w-3 h-3" /> Cập nhật
              </button>
            </div>
          </div>
        </div>

        {/* 3-COLUMN INPUT SOURCES */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT: LOCAL UPLOAD + PASTE TEXT (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="p-3.5 rounded-2xl bg-[#FFFBF0] border border-[#D9C293] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="local-material-upload"
                  className="text-xs font-extrabold text-[#14284A] inline-flex items-center gap-1.5"
                >
                  <HardDriveUpload className="w-4 h-4 text-[#2E9C8A]" />
                  1. Tải từ máy (.json, .docx, .pdf, .txt)
                </label>
                <span className="text-[11px] text-[#5B6B82]">
                  Nguồn hiện tại: <strong>{sourceName}</strong>
                  {driveFileId ? ` (Drive ID: ${driveFileId.slice(0, 10)}…)` : ''}
                </span>
              </div>

              <input
                id="local-material-upload"
                type="file"
                accept=".json,.docx,.pdf,.txt"
                onChange={handleLocalFileChange}
                className="block w-full text-xs file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:bg-[#14284A] file:text-[#FFFBF0] file:font-bold file:cursor-pointer"
              />

              {/* PDF Page Range Controls when a PDF is loaded */}
              {pdfInfo && (
                <div className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A]/40 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#14284A]">
                      PDF {pdfInfo.totalPages} trang · Đã đọc {pdfInfo.extractedCount} trang ·{' '}
                      {pdfInfo.scannedCount} trang ảnh quét
                    </span>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] font-bold">Trang PDF từ</label>
                      <input
                        type="number"
                        min={1}
                        max={pdfInfo.totalPages}
                        value={pdfStartPage}
                        onChange={(e) => setPdfStartPage(Math.max(1, Number(e.target.value)))}
                        className="w-14 px-2 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-bold"
                      />
                      <label className="text-[11px] font-bold">đến</label>
                      <input
                        type="number"
                        min={pdfStartPage}
                        max={pdfInfo.totalPages}
                        value={pdfEndPage}
                        onChange={(e) => setPdfEndPage(Math.max(pdfStartPage, Number(e.target.value)))}
                        className="w-14 px-2 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={handleReReadPdfRange}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-lg bg-[#14284A] text-white font-bold !min-h-[30px]"
                      >
                        Đọc lại
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#1F7A6B]">
                    Trang có ít chữ sẽ tự động chuyển thành ảnh gửi Gemini đa phương thức. Không lưu tệp PDF gốc vào CSDL.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="paste-material-textarea"
                  className="text-xs font-extrabold text-[#14284A] inline-flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4 text-[#2E9C8A]" />
                  2. Dán văn bản đề bài Chương III (hoặc chỉnh nội dung đã tách từ Word/PDF)
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  aria-label="Tên nguồn học liệu"
                  placeholder="Tên tài liệu / SGK / SBT..."
                  className="px-2.5 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-semibold w-52"
                />
              </div>

              <textarea
                id="paste-material-textarea"
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Dán đoạn bài tập Toán 10 Chương III (Tổng góc, Giá trị lượng giác 0°–180°, Định lý Côsin, Định lý Sin, Diện tích tam giác, Đo đạc thực tế) vào đây..."
                className="w-full p-3 rounded-xl bg-white border-2 border-[#CBB17D] text-xs leading-relaxed"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || (!importText.trim() && !pdfInfo) || quotaExhausted}
                  onClick={() => void runAiExtract()}
                  className="btn-tactile btn-jade text-xs py-2.5 px-4 flex-1 min-w-[220px]"
                >
                  <Sparkles className="w-4 h-4" />
                  {busy
                    ? 'Đang trích xuất & chuyển thể bằng Gemini...'
                    : quotaExhausted
                      ? 'Đã hết lượt AI hôm nay'
                      : 'Trích xuất câu hỏi bằng AI (Chờ duyệt)'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualFallback((v) => !v)}
                  className="btn-tactile btn-paper text-xs py-2.5 px-3.5"
                >
                  <PenLine className="w-4 h-4" />
                  {showManualFallback ? 'Ẩn form nhập tay' : 'Chuyển sang nhập tay'}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: GOOGLE DRIVE PICKER + 5-STEP GUIDE (5 cols) */}
          <div className="lg:col-span-5 p-4 rounded-2xl bg-[#FFF4D6] border border-[#D5B87E] space-y-3 text-xs text-[#1B2A41]">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm text-[#14284A] inline-flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-[#2E9C8A]" />
                3. Google Drive Picker (drive.readonly)
              </strong>
              <span
                className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                  driveConfigured
                    ? 'bg-[#E6F6F3] text-[#1F7A6B] border border-[#2E9C8A]'
                    : 'bg-[#FFFBF0] text-[#8A5108] border border-[#D98A1F]'
                }`}
              >
                {driveConfigured
                  ? driveConnected
                    ? 'Đã kết nối'
                    : 'Sẵn sàng'
                  : 'Chưa điền khóa'}
              </span>
            </div>

            {driveConfigured ? (
              <div className="space-y-2.5">
                <p className="text-[#5B6B82]">
                  Đã đọc Client ID và Picker API Key từ <strong>Cài đặt Quản trị</strong> (không hard-code). Hỗ trợ chọn{' '}
                  <strong>tệp đơn lẻ</strong> hoặc <strong>cả thư mục</strong> trên Google Drive (quyền chỉ đọc{' '}
                  <code>drive.readonly</code>, token chỉ giữ trong RAM).
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleOpenDrivePicker()}
                    className="btn-tactile btn-gold text-xs py-2 px-3.5 flex-1"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Chọn tệp / thư mục từ Google Drive
                  </button>
                  {driveConnected && (
                    <button
                      type="button"
                      onClick={handleDisconnectDrive}
                      className="btn-tactile btn-paper text-xs py-2 px-3"
                    >
                      Ngắt Drive
                    </button>
                  )}
                </div>

                {driveFolderFiles.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-white border border-[#D9C293] space-y-1.5 max-h-48 overflow-y-auto">
                    <p className="font-bold text-[#14284A]">
                      Tệp trong thư mục &ldquo;{driveFolderName}&rdquo; ({driveFolderFiles.length}):
                    </p>
                    {driveFolderFiles.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 py-1 border-b border-[#EFE0BC] last:border-0"
                      >
                        <span className="truncate font-semibold text-[#14284A]" title={f.name}>
                          {f.name}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleLoadDriveFolderFile(f)}
                          className="px-2.5 py-1 rounded-lg bg-[#2E9C8A] text-white font-bold shrink-0 !min-h-[28px]"
                        >
                          Nạp
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[#8A5108] font-semibold">
                  Chưa có <strong>Google OAuth Client ID</strong> hoặc <strong>Picker API Key</strong> trong Cài đặt. Làm theo 5 bước sau để kích hoạt (không cần sửa mã nguồn):
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[#5B6B82]">
                  <li>Mở Google Cloud Console của dự án, bật <strong>Google Drive API</strong> và <strong>Google Picker API</strong>.</li>
                  <li>Cấu hình OAuth Consent Screen với phạm vi tối thiểu <code>https://www.googleapis.com/auth/drive.readonly</code>.</li>
                  <li>Tạo <strong>OAuth 2.0 Client ID</strong> (Web application) và thêm đúng domain ứng dụng vào Authorized JavaScript origins.</li>
                  <li>Tạo <strong>API Key</strong> công khai (chỉ giới hạn cho Google Picker API và đúng domain).</li>
                  <li>Dán Client ID và API Key vào mục <strong>8. Cài đặt</strong> rồi quay lại bấm chọn tệp hoặc thư mục Drive.</li>
                </ol>
                <button
                  type="button"
                  onClick={onOpenSettingsTab}
                  className="btn-tactile btn-paper text-xs py-2 px-3 w-full"
                >
                  <Settings className="w-4 h-4" />
                  Mở mục 9. Cài đặt để nhập Client ID & API Key
                </button>
              </div>
            )}
          </div>
        </div>

        {/* FEEDBACK BANNERS */}
        {statusMsg && (
          <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#1F7A6B] flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{statusMsg}</span>
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
                className="px-3 py-1.5 rounded-lg bg-[#14284A] text-white font-bold !min-h-[32px]"
              >
                Chuyển sang nhập tay
              </button>
            )}
          </div>
        )}
      </div>

      {/* MANUAL FALLBACK ENTRY PANEL (ALWAYS AVAILABLE WHEN QUOTA EXHAUSTED / AI ERROR / USER CLICKS) */}
      {showManualFallback && (
        <form
          onSubmit={handleManualAddDraft}
          className="notebook-card p-5 space-y-3 border-2 border-[#2E9C8A]"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-extrabold text-[#14284A]">
                Nhập tay câu hỏi Chương III (Dự phòng khi không dùng AI)
              </h3>
              <p className="text-xs text-[#5B6B82]">
                Câu nhập tay vẫn được code tự giải đối chiếu và đưa vào danh sách chờ duyệt (pending_teacher_review).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualFallback(false)}
              className="text-xs font-bold text-[#5B6B82] hover:text-[#14284A]"
            >
              Đóng
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
            <div>
              <label className="block font-bold text-[#14284A] mb-1">Chủ đề (cluster)</label>
              <select
                value={manualCluster}
                onChange={(e) => {
                  const cl = e.target.value as SkillCluster;
                  setManualCluster(cl);
                  setManualStation(clusterToDefaultStation(cl));
                }}
                className="w-full px-2.5 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold"
              >
                {SKILL_CLUSTER_LIST.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-[#14284A] mb-1">Trạm</label>
              <select
                value={manualStation}
                onChange={(e) => setManualStation(e.target.value as StationId)}
                className="w-full px-2.5 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold"
              >
                {STATION_LIST.map((st) => (
                  <option key={st} value={st}>
                    {st} — {STATIONS.find((s) => s.id === st)?.shortName ?? st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-[#14284A] mb-1">Mức độ (1–4)</label>
              <select
                value={manualLevel}
                onChange={(e) => setManualLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}
                className="w-full px-2.5 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold"
              >
                {[1, 2, 3, 4].map((lv) => (
                  <option key={lv} value={lv}>
                    Mức {lv}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block font-bold text-[#14284A] mb-1">Trang in</label>
                <input
                  type="text"
                  value={manualPagePrinted}
                  onChange={(e) => setManualPagePrinted(e.target.value)}
                  placeholder="vd: 39"
                  className="w-full px-2 py-2 rounded-xl bg-white border border-[#CBB17D]"
                />
              </div>
              <div>
                <label className="block font-bold text-[#14284A] mb-1">Trang PDF</label>
                <input
                  type="number"
                  min={1}
                  value={manualPagePdf}
                  onChange={(e) => setManualPagePdf(e.target.value)}
                  placeholder="vd: 41"
                  className="w-full px-2 py-2 rounded-xl bg-white border border-[#CBB17D]"
                />
              </div>
            </div>
          </div>

          <textarea
            rows={2}
            required
            value={manualStem}
            onChange={(e) => setManualStem(e.target.value)}
            placeholder="Đề bài chuyển thể (hỗ trợ LaTeX trong $...$, ví dụ: Tam giác ABC có $a = 8\\text{ m}, b = 10\\text{ m}, C = 60^\\circ$. Tính cạnh $c$ đến 0,1 m.)"
            className="w-full p-2.5 rounded-xl bg-white border border-[#CBB17D] text-xs"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <input
              type="text"
              value={manualNumericAns}
              onChange={(e) => setManualNumericAns(e.target.value)}
              placeholder="Đáp án số (vd: 9,2)"
              className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]"
            />
            <input
              type="text"
              value={manualUnit}
              onChange={(e) => setManualUnit(e.target.value)}
              placeholder="Đơn vị (m, °, m²...)"
              className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]"
            />
            <input
              type="text"
              value={manualSolution}
              onChange={(e) => setManualSolution(e.target.value)}
              placeholder="Lời giải ngắn gọn..."
              className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <input
              type="text"
              value={manualHint1}
              onChange={(e) => setManualHint1(e.target.value)}
              placeholder="Gợi ý mức 1 (KHÔNG lộ đáp án)..."
              className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]"
            />
            <input
              type="text"
              value={manualHint2}
              onChange={(e) => setManualHint2(e.target.value)}
              placeholder="Gợi ý mức 2 (công thức / bước thế số)..."
              className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D]"
            />
          </div>

          <button type="submit" className="btn-tactile btn-jade text-xs py-2 px-4">
            Đưa vào danh sách đối chiếu (Chờ duyệt)
          </button>
        </form>
      )}

      {/* SIDE-BY-SIDE REVIEW & BATCH APPROVAL */}
      {draftItems.length > 0 && (
        <div className="notebook-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5D3A8] pb-3">
            <div>
              <h3 className="font-display text-lg font-extrabold text-[#14284A]">
                Màn duyệt đối chiếu Bản gốc ↔ Bản chuyển thể ({draftItems.length} câu nháp)
              </h3>
              <p className="text-xs text-[#5B6B82]">
                Code tự giải khớp: <strong className="text-[#1F7A6B]">{verifiedDraftsCount}</strong> ·{' '}
                Cờ lệch đáp án:{' '}
                <strong className={mismatchDraftsCount > 0 ? 'text-[#B5650D]' : 'text-[#5B6B82]'}>
                  {mismatchDraftsCount}
                </strong>{' '}
                · Đang chọn: <strong>{selectedIds.length}/{draftItems.length}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-bold flex items-center gap-1.5 mr-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.length === draftItems.length && draftItems.length > 0}
                  onChange={(e) =>
                    setSelectedIds(e.target.checked ? draftItems.map((d) => d.id) : [])
                  }
                  className="accent-[#2E9C8A]"
                />
                Chọn tất cả
              </label>

              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => commitDrafts(selectedIds, 'pending_teacher_review')}
                className="btn-tactile btn-paper text-xs py-1.5 px-3"
              >
                Lưu chờ duyệt ({selectedIds.length})
              </button>
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => commitDrafts(selectedIds, 'approved')}
                className="btn-tactile btn-jade text-xs py-1.5 px-3"
              >
                <Check className="w-4 h-4" />
                Duyệt hàng loạt ({selectedIds.length})
              </button>
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => commitDrafts(selectedIds, 'rejected')}
                className="px-3 py-1.5 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5108] text-xs font-bold !min-h-[36px] disabled:opacity-40"
              >
                Từ chối ({selectedIds.length})
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {draftItems.map((item, idx) => {
              const isSelected = selectedIds.includes(item.id);
              const isDuplicate = existingQuestions.some(
                (ex) =>
                  ex.id === item.id ||
                  ex.stem_vi.trim().toLowerCase() === item.stem_vi.trim().toLowerCase(),
              );
              const cv = item.code_verification ?? verifyQuestionByCode(item);
              const isEditing = Boolean(expandedEditIds[item.id]);
              const exp = item.expected_answer ?? {};
              const numericDisplay =
                exp.rounded ?? exp.value ?? exp.exact_numeric ?? exp.optional_value ?? '';

              return (
                <div
                  key={item.id}
                  data-testid={`import-draft-${idx}`}
                  className={`p-4 rounded-2xl border-2 space-y-3 ${
                    cv.status === 'mismatch_flagged'
                      ? 'bg-[#FFF9EE] border-[#D98A1F]'
                      : 'bg-[#FFFBF0] border-[#D9C293]'
                  }`}
                >
                  {/* Card Top Metadata Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2 font-extrabold text-[#14284A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked
                              ? [...prev, item.id]
                              : prev.filter((x) => x !== item.id),
                          )
                        }
                        className="accent-[#2E9C8A]"
                      />
                      <span>
                        #{idx + 1} · {item.id} · {item.cluster} · Trạm {item.stationId ?? 'BS01'} · Mức{' '}
                        {item.level} · {item.type}
                      </span>
                    </label>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[#FFF4D6] border border-[#E0A93B] font-bold text-[#8A5108]">
                        pending_teacher_review
                      </span>
                      {typeof item.confidence === 'number' && (
                        <span className="px-2 py-0.5 rounded bg-white border border-[#CBB17D] font-bold text-[#14284A]">
                          Độ tin cậy: {Math.round(item.confidence * 100)}%
                        </span>
                      )}
                      {isDuplicate && (
                        <span className="px-2 py-0.5 rounded bg-[#FFF5E2] border border-[#D98A1F] font-bold text-[#8A5108]">
                          Trùng ID/đề trong Ngân hàng
                        </span>
                      )}
                      {cv.hint1LeaksAnswer && (
                        <span className="px-2 py-0.5 rounded bg-[#FFF5E2] border border-[#D98A1F] font-bold text-[#8A5108]">
                          Cảnh báo: Gợi ý mức 1 lộ đáp án
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Code Verification Banner */}
                  <div
                    className={`p-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 ${
                      cv.status === 'verified_match'
                        ? 'bg-[#E6F6F3] border border-[#2E9C8A] text-[#1F7A6B]'
                        : cv.status === 'mismatch_flagged'
                          ? 'bg-[#FFF5E2] border-2 border-[#D98A1F] text-[#8A5108]'
                          : 'bg-white border border-[#D9C293] text-[#5B6B82]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {cv.status === 'verified_match' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : cv.status === 'mismatch_flagged' ? (
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span className="font-semibold">{cv.note_vi}</span>
                    </div>

                    {cv.status === 'mismatch_flagged' && cv.roundedCodeValue !== undefined && (
                      <button
                        type="button"
                        onClick={() => applyCodeSolvedAnswer(item.id)}
                        className="px-2.5 py-1 rounded-lg bg-[#14284A] text-white font-bold !min-h-[30px] shrink-0"
                      >
                        Dùng đáp án code tính ({cv.roundedCodeValue})
                      </button>
                    )}
                  </div>

                  {/* SIDE-BY-SIDE COMPARISON: LEFT = ORIGINAL, RIGHT = ADAPTED */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    {/* LEFT: ORIGINAL EXCERPT & PROVENANCE */}
                    <div className="lg:col-span-5 p-3 rounded-xl bg-white border border-[#E5D3A8] space-y-2 text-xs">
                      <p className="font-extrabold uppercase tracking-wide text-[#5B6B82]">
                        Bản gốc & Nguồn đối chiếu
                      </p>
                      <div className="space-y-1 text-[#1B2A41]">
                        <p>
                          <strong>Tệp nguồn:</strong> {item.source_file_name ?? 'Văn bản dán'}
                        </p>
                        {item.drive_file_id && (
                          <p className="break-all">
                            <strong>Drive File ID:</strong>{' '}
                            <code className="text-[11px]">{item.drive_file_id}</code>
                          </p>
                        )}
                        <p>
                          <strong>Trang in:</strong> {item.page_printed ?? '—'} ·{' '}
                          <strong>Trang PDF:</strong> {item.page_pdf ?? '—'}
                        </p>
                        <p>
                          <strong>Tham chiếu:</strong> {item.source_refs.join(', ')}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#FAF5E8] border border-[#E5D3A8] text-[#5B6B82]">
                        <p className="font-bold text-[#14284A] mb-1">Trích ngắn bản gốc:</p>
                        <p className="italic">{item.source_excerpt || '(Không có trích đoạn gốc)'}</p>
                      </div>
                      {item.ai_reason && (
                        <p className="text-[11px] text-[#5B6B82]">
                          <strong>Lý do phân loại / chuyển thể:</strong> {item.ai_reason}
                        </p>
                      )}
                    </div>

                    {/* RIGHT: ADAPTED PREVIEW */}
                    <div className="lg:col-span-7 p-3 rounded-xl bg-white border border-[#CBB17D] space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-extrabold uppercase tracking-wide text-[#1F7A6B]">
                          Bản chuyển thể (Xem trước học viên)
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedEditIds((prev) => ({...prev, [item.id]: !prev[item.id]}))
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFF4D6] border border-[#E0A93B] text-[#14284A] font-bold !min-h-[30px]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          {isEditing ? 'Thu gọn trình sửa' : 'Sửa mọi trường'}
                        </button>
                      </div>

                      <div className="text-sm font-semibold text-[#14284A] leading-relaxed">
                        <MathText text={item.stem_vi} />
                      </div>

                      {item.type === 'mcq' && item.options && item.options.length > 0 && (
                        <ul className="space-y-1 pl-1">
                          {item.options.map((o, oIdx) => {
                            const isCorrectOpt = String(item.expected_answer.choice) === o.id;
                            return (
                              <li
                                key={o.id}
                                className={`px-2 py-1 rounded-lg ${
                                  isCorrectOpt
                                    ? 'bg-[#E6F6F3] text-[#1F7A6B] font-bold'
                                    : 'text-[#5B6B82]'
                                }`}
                              >
                                {String.fromCharCode(65 + oIdx)}. <MathText text={o.label} />
                                {isCorrectOpt ? ' ✓' : ''}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {item.type !== 'mcq' && (
                        <p className="text-[#14284A]">
                          <strong>Đáp án chuẩn:</strong>{' '}
                          <code className="px-1.5 py-0.5 rounded bg-[#FAF5E8]">
                            {numericDisplay !== ''
                              ? `${numericDisplay}${item.fixedUnitLabel ? ` ${item.fixedUnitLabel}` : ''}`
                              : JSON.stringify(item.expected_answer)}
                          </code>
                        </p>
                      )}

                      <p className="text-[#1F7A6B]">
                        <strong>Lời giải:</strong> <MathText text={item.solution_vi} />
                      </p>
                      <div className="space-y-0.5 text-[#5B6B82]">
                        <p>
                          <strong>Gợi ý mức 1:</strong>{' '}
                          {item.hints_vi[0] ? <MathText text={item.hints_vi[0]} /> : '—'}
                        </p>
                        <p>
                          <strong>Gợi ý mức 2:</strong>{' '}
                          {item.hints_vi[1] ? <MathText text={item.hints_vi[1]} /> : '—'}
                        </p>
                      </div>
                      <p className="text-[11px] text-[#5B6B82]">
                        <strong>Kỹ năng:</strong> {item.skill_ids.join(', ')} ·{' '}
                        <strong>Mã lỗi dự kiến:</strong> {item.anticipated_error_ids.join(', ')}
                      </p>
                    </div>
                  </div>

                  {/* FULL-FIELD INLINE EDITOR */}
                  {isEditing && (
                    <div className="p-3.5 rounded-xl bg-white border-2 border-[#2E9C8A]/50 space-y-3 text-xs">
                      <p className="font-extrabold text-[#14284A]">
                        Chỉnh sửa đầy đủ trường câu hỏi (tự chạy lại code kiểm chứng ngay khi sửa)
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block font-bold mb-1">Chủ đề (topic)</label>
                          <select
                            value={item.cluster}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                cluster: e.target.value as SkillCluster,
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D] font-bold"
                          >
                            {SKILL_CLUSTER_LIST.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Trạm (station)</label>
                          <select
                            value={item.stationId ?? 'BS01'}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                stationId: e.target.value as StationId,
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D] font-bold"
                          >
                            {STATION_LIST.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Mức độ (1–4)</label>
                          <select
                            value={item.level}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                level: Number(e.target.value) as 1 | 2 | 3 | 4,
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D] font-bold"
                          >
                            {[1, 2, 3, 4].map((lv) => (
                              <option key={lv} value={lv}>
                                Mức {lv}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Dạng câu (type)</label>
                          <select
                            value={item.type}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                type: e.target.value as QuestionType,
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D] font-bold"
                          >
                            {QUESTION_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold mb-1">Đề bài chuyển thể (stem_vi)</label>
                        <textarea
                          rows={2}
                          value={item.stem_vi}
                          onChange={(e) =>
                            updateDraft(item.id, (prev) => ({...prev, stem_vi: e.target.value}))
                          }
                          className="w-full p-2 rounded-lg border border-[#CBB17D]"
                        />
                      </div>

                      {item.type === 'mcq' ? (
                        <div className="space-y-1.5">
                          <label className="block font-bold">Các phương án trắc nghiệm & đáp án đúng</label>
                          {(item.options ?? []).map((opt, oIdx) => (
                            <div key={opt.id} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct_${item.id}`}
                                checked={String(item.expected_answer.choice) === opt.id}
                                onChange={() =>
                                  updateDraft(item.id, (prev) => ({
                                    ...prev,
                                    expected_answer: {...prev.expected_answer, choice: opt.id},
                                  }))
                                }
                              />
                              <input
                                type="text"
                                value={opt.label}
                                onChange={(e) =>
                                  updateDraft(item.id, (prev) => ({
                                    ...prev,
                                    options: (prev.options ?? []).map((o, i) =>
                                      i === oIdx ? {...o, label: e.target.value} : o,
                                    ),
                                  }))
                                }
                                className="flex-1 px-2 py-1 rounded-lg border border-[#CBB17D]"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block font-bold mb-1">Đáp án số (rounded / value)</label>
                            <input
                              type="text"
                              value={String(numericDisplay)}
                              onChange={(e) => {
                                const parsedNum = Number(e.target.value.replace(',', '.'));
                                updateDraft(item.id, (prev) => ({
                                  ...prev,
                                  expected_answer: {
                                    ...prev.expected_answer,
                                    rounded: Number.isFinite(parsedNum) ? parsedNum : e.target.value,
                                    value: Number.isFinite(parsedNum) ? parsedNum : e.target.value,
                                  },
                                }));
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                            />
                          </div>
                          <div>
                            <label className="block font-bold mb-1">Số chữ số làm tròn</label>
                            <input
                              type="number"
                              min={0}
                              max={4}
                              value={Number(exp.decimal_places ?? 1)}
                              onChange={(e) =>
                                updateDraft(item.id, (prev) => ({
                                  ...prev,
                                  expected_answer: {
                                    ...prev.expected_answer,
                                    decimal_places: Number(e.target.value),
                                  },
                                }))
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                            />
                          </div>
                          <div>
                            <label className="block font-bold mb-1">Đơn vị hiển thị</label>
                            <input
                              type="text"
                              value={item.fixedUnitLabel ?? String(exp.unit ?? '')}
                              onChange={(e) =>
                                updateDraft(item.id, (prev) => ({
                                  ...prev,
                                  fixedUnitLabel: e.target.value || undefined,
                                  expected_answer: {
                                    ...prev.expected_answer,
                                    unit: e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block font-bold mb-1">Gợi ý mức 1 (KHÔNG lộ đáp án)</label>
                          <input
                            type="text"
                            value={item.hints_vi[0] ?? ''}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                hints_vi: [e.target.value, prev.hints_vi[1] ?? ''],
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Gợi ý mức 2</label>
                          <input
                            type="text"
                            value={item.hints_vi[1] ?? ''}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                hints_vi: [prev.hints_vi[0] ?? '', e.target.value],
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold mb-1">Lời giải chi tiết (solution_vi)</label>
                        <textarea
                          rows={2}
                          value={item.solution_vi}
                          onChange={(e) =>
                            updateDraft(item.id, (prev) => ({
                              ...prev,
                              solution_vi: e.target.value,
                            }))
                          }
                          className="w-full p-2 rounded-lg border border-[#CBB17D]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block font-bold mb-1">Kỹ năng (skill_ids, cách nhau dấu phẩy)</label>
                          <input
                            type="text"
                            value={item.skill_ids.join(', ')}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                skill_ids: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Mã lỗi (E01–E12)</label>
                          <input
                            type="text"
                            value={item.anticipated_error_ids.join(', ')}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                anticipated_error_ids: e.target.value
                                  .split(',')
                                  .map((s) => s.trim().toUpperCase())
                                  .filter((c) => ERROR_CODES.includes(c) || /^E\d\d$/.test(c)),
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Trang in</label>
                          <input
                            type="text"
                            value={item.page_printed ?? ''}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                page_printed: e.target.value || undefined,
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                          />
                        </div>
                        <div>
                          <label className="block font-bold mb-1">Trang PDF</label>
                          <input
                            type="number"
                            min={1}
                            value={item.page_pdf ?? ''}
                            onChange={(e) =>
                              updateDraft(item.id, (prev) => ({
                                ...prev,
                                page_pdf: e.target.value ? Number(e.target.value) : undefined,
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded-lg border border-[#CBB17D]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Per-item Action Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => commitDrafts([item.id], 'pending_teacher_review')}
                        className="btn-tactile btn-paper text-xs py-1.5 px-3"
                      >
                        Lưu chờ duyệt
                      </button>
                      <button
                        type="button"
                        onClick={() => commitDrafts([item.id], 'approved')}
                        className="btn-tactile btn-jade text-xs py-1.5 px-3"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Duyệt ngay (Approved)
                      </button>
                      <button
                        type="button"
                        onClick={() => commitDrafts([item.id], 'rejected')}
                        className="px-3 py-1.5 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5108] text-xs font-bold inline-flex items-center gap-1 !min-h-[34px]"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Từ chối
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftItems((prev) => prev.filter((x) => x.id !== item.id));
                        setSelectedIds((prev) => prev.filter((x) => x !== item.id));
                      }}
                      className="text-xs font-bold text-[#5B6B82] hover:text-[#14284A] inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Bỏ nháp
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

import mammoth from 'mammoth';
import type {
  MathVerificationParams,
  QuestionItem,
  QuestionType,
  SkillCluster,
  StationId,
} from '../types.ts';
import {verifyQuestionByCode} from '../math/verifier.ts';

export interface ImportProvenanceMeta {
  sourceFileName: string;
  driveFileId?: string;
}

export interface PdfExtractedPage {
  pagePdf: number;
  pagePrinted?: string;
  text: string;
  isScanned: boolean;
  imageBase64?: string;
  mimeType?: 'image/jpeg';
}

export interface PdfParseResult {
  totalPages: number;
  extractedCount: number;
  scannedCount: number;
  pages: PdfExtractedPage[];
  combinedText: string;
}

const VALID_CLUSTERS: SkillCluster[] = ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'];
const VALID_TYPES: QuestionType[] = [
  'mcq',
  'true_false_multi',
  'numeric',
  'matching',
  'fill_relation',
  'tap_diagram',
  'error_spot',
  'measurement',
  'agree_explain',
];
const VALID_STATIONS: StationId[] = ['QS01', 'DD01', 'BS01', 'KV01', 'HT01'];

export function clusterToDefaultStation(cluster: SkillCluster): StationId {
  switch (cluster) {
    case 'NEN':
    case 'LG':
      return 'QS01';
    case 'COS':
      return 'DD01';
    case 'SIN':
    case 'MH':
      return 'BS01';
    case 'DT':
      return 'KV01';
    default:
      return 'HT01';
  }
}

export function inferClusterFromSkills(skillIds: string[], stem = ''): SkillCluster {
  const joined = skillIds.join(' ').toLowerCase();
  if (joined.includes('trig') || /\b(sin|cos|tan|cot)\s*\d/i.test(stem) && !/tam giác|cạnh/i.test(stem)) {
    return 'LG';
  }
  if (joined.includes('cosine')) return 'COS';
  if (joined.includes('area') || joined.includes('heron')) return 'DT';
  if (
    joined.includes('survey_plan') ||
    joined.includes('measurement') ||
    joined.includes('interpretation')
  ) {
    return 'MH';
  }
  if (joined.includes('sine_law') || joined.includes('ratio_algebra')) {
    return 'SIN';
  }
  if (
    joined.includes('angle_sum') ||
    joined.includes('opposite_pair') ||
    joined.includes('units') ||
    joined.includes('rounding')
  ) {
    return 'NEN';
  }
  if (/côsin|cosin/i.test(stem)) return 'COS';
  if (/diện tích|heron/i.test(stem)) return 'DT';
  if (/định lý sin|sin\s*\(/i.test(stem)) return 'SIN';
  return 'NEN';
}

export function inferQuestionTypeFromExpectedAnswer(
  rawType: unknown,
  expectedAnswer: Record<string, unknown>,
  hasOptions: boolean,
): QuestionType {
  if (typeof rawType === 'string' && VALID_TYPES.includes(rawType as QuestionType)) {
    return rawType as QuestionType;
  }
  if (typeof expectedAnswer.vertex === 'string') return 'tap_diagram';
  if (
    typeof expectedAnswer.AB_m === 'number' &&
    typeof expectedAnswer.BAC_degree === 'number'
  ) {
    return 'measurement';
  }
  if (
    typeof expectedAnswer.left_angle_degree === 'number' &&
    typeof expectedAnswer.right_angle_degree === 'number'
  ) {
    return 'fill_relation';
  }
  if (typeof expectedAnswer.agree === 'boolean') return 'agree_explain';
  if (typeof expectedAnswer.choice === 'string' || typeof expectedAnswer.meaning === 'string') {
    return 'mcq';
  }
  const vals = Object.values(expectedAnswer);
  if (
    vals.length >= 2 &&
    vals.every((v) => typeof v === 'string' && /^[A-Z]$/.test(v))
  ) {
    return 'matching';
  }
  if (hasOptions) return 'mcq';
  return 'numeric';
}

function inferLevelFromStage(rawLevel: unknown, rawStage: unknown): 1 | 2 | 3 | 4 {
  if ([1, 2, 3, 4].includes(Number(rawLevel))) {
    return Number(rawLevel) as 1 | 2 | 3 | 4;
  }
  const stage = String(rawStage ?? '').toLowerCase();
  if (stage === 'foundation' || stage === 'remediation') return 1;
  if (stage === 'core') return 2;
  if (stage === 'independent') return 3;
  if (stage === 'boss') return 4;
  return 2;
}

function formatUnitLabel(rawUnit: unknown): string | undefined {
  if (typeof rawUnit !== 'string' || !rawUnit.trim()) return undefined;
  const u = rawUnit.trim();
  if (u.toLowerCase() === 'degree' || u.toLowerCase() === 'độ') return '°';
  return u;
}

function makeShortId(prefix: string, idx: number): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${Date.now().toString(36)}_${idx}_${rand}`;
}

/**
 * Parses a Section 11.1 JSON file (such as Hoc_lieu_BS01_cho_giao_vien_duyet.json)
 * into rich QuestionItem drafts, always defaulting to `pending_teacher_review`
 * and running deterministic code re-verification on every numeric question.
 */
export function parseSection11Json(
  rawText: string,
  meta: ImportProvenanceMeta,
): {
  missionId?: string;
  schemaVersion?: string;
  items: QuestionItem[];
} {
  const parsed = JSON.parse(rawText) as {
    schema_version?: string;
    mission_id?: string;
    items?: Array<Record<string, unknown>>;
  };

  const rawItems = Array.isArray(parsed.items)
    ? parsed.items
    : Array.isArray(parsed)
      ? (parsed as Array<Record<string, unknown>>)
      : [];

  const missionId =
    typeof parsed.mission_id === 'string' &&
    VALID_STATIONS.includes(parsed.mission_id as StationId)
      ? (parsed.mission_id as StationId)
      : undefined;

  const items: QuestionItem[] = rawItems.map((it, idx) => {
    const skillIds = Array.isArray(it.skill_ids)
      ? it.skill_ids.map((s) => String(s))
      : ['sine_law'];
    const stemVi = String(it.stem_vi ?? '').trim();
    const expectedAnswer =
      it.expected_answer && typeof it.expected_answer === 'object'
        ? (it.expected_answer as Record<string, unknown>)
        : {value: 0};

    const rawCluster = String(it.cluster ?? it.topic ?? '');
    const cluster: SkillCluster = VALID_CLUSTERS.includes(rawCluster as SkillCluster)
      ? (rawCluster as SkillCluster)
      : inferClusterFromSkills(skillIds, stemVi);

    const rawOpts = Array.isArray(it.options)
      ? it.options.map((opt, oIdx) =>
          typeof opt === 'string'
            ? {id: `opt_${oIdx}`, label: opt}
            : {
                id: String((opt as Record<string, unknown>).id ?? `opt_${oIdx}`),
                label: String((opt as Record<string, unknown>).label ?? ''),
                errorCode: (opt as Record<string, unknown>).errorCode
                  ? String((opt as Record<string, unknown>).errorCode)
                  : undefined,
              },
        )
      : undefined;

    const qType = inferQuestionTypeFromExpectedAnswer(
      it.type,
      expectedAnswer,
      Boolean(rawOpts && rawOpts.length >= 2),
    );
    const level = inferLevelFromStage(it.level, it.stage);

    const stationCandidate = String(it.stationId ?? it.station ?? missionId ?? '');
    const stationId: StationId = VALID_STATIONS.includes(stationCandidate as StationId)
      ? (stationCandidate as StationId)
      : clusterToDefaultStation(cluster);

    const hintsRaw = Array.isArray(it.hints_vi) ? it.hints_vi.map((h) => String(h)) : [];
    const hintsVi =
      hintsRaw.length >= 2
        ? hintsRaw.slice(0, 2)
        : hintsRaw.length === 1
          ? [hintsRaw[0], 'Kiểm tra lại bước lập công thức và đơn vị đo.']
          : ['Xác định các dữ kiện đã cho trong tam giác.', 'Lập hệ thức liên hệ rồi thay số cẩn thận.'];

    const sourceRefs = Array.isArray(it.source_refs)
      ? it.source_refs.map((r) => String(r))
      : [meta.sourceFileName];

    const pageMatch = sourceRefs.join(' ').match(/p(\d+(?:[_-]\d+)?)/i);
    const pagePrinted =
      typeof it.page_printed === 'string'
        ? it.page_printed
        : pageMatch
          ? pageMatch[1].replace('_', '–')
          : undefined;

    const stageVal = typeof it.stage === 'string' ? it.stage : undefined;
    const validStage =
      stageVal &&
      ['foundation', 'core', 'remediation', 'independent', 'boss', 'practice'].includes(stageVal)
        ? (stageVal as QuestionItem['stage'])
        : undefined;

    // Build interactive options automatically if M01/M06 came from Section 11.1 JSON without explicit options
    let options = rawOpts;
    if (qType === 'mcq' && (!options || options.length < 2)) {
      if (expectedAnswer.choice === 'AB_and_angles_BAC_ABC') {
        options = [
          {id: 'AB_and_angles_BAC_ABC', label: 'Đo độ dài AB trên bờ và hai góc ngắm ∠BAC, ∠ABC'},
          {id: 'AC_direct', label: 'Kéo thước trực tiếp qua sông để đo đoạn AC', errorCode: 'E03'},
          {id: 'BC_and_angle_C', label: 'Đo BC và góc C tại đỉnh bên kia sông', errorCode: 'E03'},
          {id: 'only_AB', label: 'Chỉ cần đo đoạn AB trên bờ', errorCode: 'E03'},
        ];
      } else if (expectedAnswer.meaning === 'distance_A_to_C') {
        options = [
          {id: 'distance_A_to_C', label: 'Khoảng cách theo đường ngắm xiên từ A đến C (chưa chắc là bề rộng vuông góc)'},
          {id: 'perpendicular_width', label: 'Luôn là bề rộng vuông góc của con sông', errorCode: 'E08'},
        ];
      }
    }

    const normalizedExpected =
      qType === 'mcq' && expectedAnswer.meaning && !expectedAnswer.choice
        ? {...expectedAnswer, choice: expectedAnswer.meaning}
        : expectedAnswer;

    const matchingPairs =
      qType === 'matching'
        ? {
            left: Object.keys(expectedAnswer),
            right: Array.from(new Set(Object.values(expectedAnswer).map(String))),
          }
        : undefined;

    const draft: QuestionItem = {
      id: typeof it.id === 'string' && it.id.trim() ? it.id.trim() : makeShortId('imp', idx),
      stationId,
      stage: validStage,
      cluster,
      skill_ids: skillIds,
      level,
      type: qType,
      stem_vi: stemVi,
      options,
      matchingPairs,
      expected_answer: normalizedExpected,
      fixedUnitLabel: qType === 'numeric' ? formatUnitLabel(expectedAnswer.unit) : undefined,
      solution_vi: String(it.solution_vi ?? ''),
      anticipated_error_ids: Array.isArray(it.anticipated_error_ids)
        ? it.anticipated_error_ids.map((e) => String(e))
        : ['E05'],
      hints_vi: hintsVi,
      // Mandatory default: pending_teacher_review (Section 12)
      review_status: 'pending_teacher_review',
      source_refs: sourceRefs,
      is_adapted: it.is_adapted !== false,
      hints_available_in_independent_mode: Boolean(it.hints_available_in_independent_mode ?? false),
      on_hint_request_during_independent:
        typeof it.on_hint_request_during_independent === 'string'
          ? it.on_hint_request_during_independent
          : 'ask_confirmation_then_change_to_practice',
      scoring_requires_teacher_approved_version: it.scoring_requires_teacher_approved_version !== false,
      source_file_name: meta.sourceFileName,
      drive_file_id: meta.driveFileId,
      page_pdf: typeof it.page_pdf === 'number' ? it.page_pdf : undefined,
      page_printed: pagePrinted,
      source_excerpt:
        typeof it.source_excerpt === 'string'
          ? it.source_excerpt.slice(0, 300)
          : stemVi.slice(0, 220),
      confidence: typeof it.confidence === 'number' ? it.confidence : 1,
      ai_reason:
        typeof it.ai_reason === 'string'
          ? it.ai_reason
          : `Nhập từ JSON chuẩn Mục 11.1 (${missionId ?? stationId}, giai đoạn ${stageVal ?? 'core'}).`,
    };

    draft.code_verification = verifyQuestionByCode(draft);
    return draft;
  });

  return {
    missionId,
    schemaVersion: parsed.schema_version,
    items,
  };
}

/**
 * Extracts raw text from a .docx file using mammoth.
 */
export async function parseDocxArrayBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  const res = await mammoth.extractRawText({arrayBuffer});
  return res.value.trim();
}

/**
 * Heuristic detector for printed textbook page number from header/footer lines.
 */
export function detectPrintedPageNumber(pageText: string): string | undefined {
  const lines = pageText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;

  const candidates = [lines[0], lines[lines.length - 1]];
  for (const line of candidates) {
    const explicit = line.match(/^(?:trang|tr\.?)\s*(\d{1,3})$/i);
    if (explicit) return explicit[1];
    const standalone = line.match(/^[-–—\s]*(\d{1,3})[-–—\s]*$/);
    if (standalone) {
      const n = Number(standalone[1]);
      if (n >= 1 && n <= 350) return standalone[1];
    }
  }
  return undefined;
}

/**
 * Reads a PDF in the browser using pdf.js (pdfjs-dist).
 * - Extracts text per page + detects printed page numbers.
 * - For scanned/image pages (< 40 chars of selectable text), renders the page to canvas
 *   as JPEG base64 so Gemini multimodal can read it.
 * - Never persists the raw PDF binary to any database.
 */
export async function parsePdfArrayBuffer(
  arrayBuffer: ArrayBuffer,
  options?: {startPage?: number; endPage?: number; maxPages?: number},
): Promise<PdfParseResult> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;

  const loadingTask = pdfjsLib.getDocument({data: new Uint8Array(arrayBuffer)});
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const start = Math.max(1, Math.min(options?.startPage ?? 1, totalPages));
  const maxPages = Math.max(1, Math.min(options?.maxPages ?? 8, 12));
  const end = Math.min(totalPages, options?.endPage ?? start + maxPages - 1, start + maxPages - 1);

  const pages: PdfExtractedPage[] = [];
  let scannedCount = 0;

  for (let p = start; p <= end; p++) {
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const pagePrinted = detectPrintedPageNumber(
      textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join('\n'),
    );

    const isScanned = text.length < 40;
    let imageBase64: string | undefined;

    if (isScanned && typeof document !== 'undefined') {
      scannedCount += 1;
      const viewport = page.getViewport({scale: 1.35});
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({canvasContext: ctx, viewport, canvas}).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        imageBase64 = dataUrl.split(',')[1];
      }
    }

    pages.push({
      pagePdf: p,
      pagePrinted,
      text,
      isScanned,
      imageBase64,
      mimeType: imageBase64 ? 'image/jpeg' : undefined,
    });
  }

  const combinedText = pages
    .map(
      (pg) =>
        `[Trang PDF ${pg.pagePdf}${pg.pagePrinted ? ` | Trang in ${pg.pagePrinted}` : ''}${pg.isScanned ? ' | Trang ảnh quét' : ''}]\n${pg.text || '(Trang ảnh quét — gửi ảnh cho Gemini đọc)'}`,
    )
    .join('\n\n');

  return {
    totalPages,
    extractedCount: pages.length,
    scannedCount,
    pages,
    combinedText,
  };
}

/**
 * Maps raw Gemini `/api/ai/extract` JSON items into verified QuestionItem drafts.
 * Always forces `review_status = 'pending_teacher_review'` and runs deterministic code verification.
 */
export function mapAiExtractedItemsToDrafts(
  rawItems: Array<Record<string, unknown>>,
  meta: ImportProvenanceMeta,
): QuestionItem[] {
  return rawItems.map((it, idx) => {
    const rawCluster = String(it.cluster ?? it.topic ?? 'SIN').toUpperCase();
    const cluster: SkillCluster = VALID_CLUSTERS.includes(rawCluster as SkillCluster)
      ? (rawCluster as SkillCluster)
      : 'SIN';

    const rawStation = String(it.stationId ?? it.station ?? '').toUpperCase();
    const stationId: StationId = VALID_STATIONS.includes(rawStation as StationId)
      ? (rawStation as StationId)
      : clusterToDefaultStation(cluster);

    const level = ([1, 2, 3, 4].includes(Number(it.level)) ? Number(it.level) : 2) as
      | 1
      | 2
      | 3
      | 4;

    const opts = Array.isArray(it.options)
      ? (it.options as string[])
          .filter((lbl) => typeof lbl === 'string' && lbl.trim().length > 0)
          .map((lbl, i) => ({id: `opt_${i}`, label: lbl.trim()}))
      : undefined;

    const rawType = String(it.type ?? '').toLowerCase();
    const isMcq =
      (rawType === 'mcq' || (rawType !== 'numeric' && Boolean(opts && opts.length >= 2))) &&
      Boolean(opts && opts.length >= 2);
    const qType: QuestionType = isMcq
      ? 'mcq'
      : VALID_TYPES.includes(rawType as QuestionType) && rawType !== 'mcq'
        ? (rawType as QuestionType)
        : 'numeric';

    const correctIdx = Number(it.correctOptionIndex ?? 0);
    const unitLabel = formatUnitLabel(it.unit);
    const hasNumeric =
      typeof it.numericAnswer === 'number' && Number.isFinite(it.numericAnswer);

    const expectedAnswer: Record<string, unknown> = isMcq
      ? {
          choice: `opt_${Math.max(0, Math.min(correctIdx, (opts?.length ?? 1) - 1))}`,
          ...(hasNumeric ? {value: Number(it.numericAnswer)} : {}),
        }
      : {
          rounded: hasNumeric ? Number(it.numericAnswer) : 0,
          value: hasNumeric ? Number(it.numericAnswer) : 0,
          decimal_places: Number.isFinite(Number(it.decimalPlaces))
            ? Math.max(0, Math.min(4, Number(it.decimalPlaces)))
            : 1,
          unit: unitLabel ?? '',
        };

    const hintsRaw = Array.isArray(it.hints_vi)
      ? (it.hints_vi as string[]).map((h) => String(h).trim()).filter(Boolean)
      : [];
    const hintsVi =
      hintsRaw.length >= 2
        ? hintsRaw.slice(0, 2)
        : hintsRaw.length === 1
          ? [hintsRaw[0], 'Thay các số đo đã cho vào hệ thức rồi tính cẩn thận theo đơn vị độ (DEG).']
          : [
              'Xác định rõ các cạnh và góc đã biết trong tam giác.',
              'Chọn đúng định lý (Côsin / Sin / diện tích) rồi thay số.',
            ];

    const skillIds =
      Array.isArray(it.skill_ids) && it.skill_ids.length > 0
        ? (it.skill_ids as string[]).map(String)
        : [cluster.toLowerCase()];

    const errorIds =
      Array.isArray(it.anticipated_error_ids) && it.anticipated_error_ids.length > 0
        ? (it.anticipated_error_ids as string[]).map(String)
        : ['E05'];

    const pagePdf =
      typeof it.page_pdf === 'number' && Number.isFinite(it.page_pdf) && it.page_pdf > 0
        ? Math.round(it.page_pdf)
        : undefined;
    const pagePrinted =
      it.page_printed !== undefined && String(it.page_printed).trim()
        ? String(it.page_printed).trim()
        : undefined;

    const sourceRefParts = [
      String(it.source_ref ?? meta.sourceFileName),
      pagePrinted ? `Tr. in ${pagePrinted}` : '',
      pagePdf ? `PDF tr. ${pagePdf}` : '',
    ].filter(Boolean);

    const mathParams =
      it.math_params && typeof it.math_params === 'object'
        ? (it.math_params as MathVerificationParams)
        : undefined;

    const draft: QuestionItem = {
      id: makeShortId('ai', idx),
      stationId,
      stage: 'practice',
      cluster,
      skill_ids: skillIds,
      level,
      type: qType,
      stem_vi: String(it.stem_vi ?? '').trim(),
      options: isMcq ? opts : undefined,
      expected_answer: expectedAnswer,
      fixedUnitLabel: !isMcq ? unitLabel : undefined,
      solution_vi: String(it.solution_vi ?? '').trim(),
      anticipated_error_ids: errorIds,
      hints_vi: hintsVi,
      review_status: 'pending_teacher_review',
      source_refs: [sourceRefParts.join(' · ')],
      is_adapted: true,
      hints_available_in_independent_mode: false,
      on_hint_request_during_independent: 'ask_confirmation_then_change_to_practice',
      scoring_requires_teacher_approved_version: true,
      source_file_name: meta.sourceFileName,
      drive_file_id: meta.driveFileId,
      page_pdf: pagePdf,
      page_printed: pagePrinted,
      source_excerpt: String(it.source_excerpt ?? '').trim().slice(0, 300),
      confidence:
        typeof it.confidence === 'number' && Number.isFinite(it.confidence)
          ? Math.max(0, Math.min(1, it.confidence))
          : 0.75,
      ai_reason: String(it.ai_reason ?? 'AI trích xuất và chuyển thể ngữ cảnh sang Chương III Toán 10.').trim(),
      math_params: mathParams,
    };

    draft.code_verification = verifyQuestionByCode(draft);
    return draft;
  });
}

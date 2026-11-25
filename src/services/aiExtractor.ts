import {verifyQuestionMathLayers} from '../math/mathEngine.ts';
import {verifyQuestionWithSolvers} from '../math/solvers.ts';
import {
  computeQuestionFingerprint,
  computeSuggestedStations,
  DEFAULT_TAXONOMY_PATTERNS,
  PROMPT_VERSION,
  suggestTaxonomyForDocumentLabel,
} from '../math/taxonomy.ts';
import type {
  AnswerKeyEntry,
  ClassificationMode,
  FigureBBox,
  FigureSpec,
  QuestionFlag,
  QuestionItem,
  QuestionType,
  SkillCluster,
  StationId,
  StructuredGivens,
  TaxonomyPattern,
  TaxonomyTopic,
} from '../types.ts';
import {
  getCachedExtractionResult,
  saveCachedExtractionResult,
} from './importBatchService.ts';
import {clusterToDefaultStation} from './materialImport.ts';
import type {DocxEmbeddedImage} from './docxMathParser.ts';
import type {PdfReadPageResult} from './pdfReader.ts';

export interface RawAiExtractedQuestion {
  number?: string;
  part?: string | null;
  source_pattern_label?: string;
  type?: string;
  stem_latex?: string;
  stem_vi?: string;
  options?: Array<{key?: string; text?: string} | string>;
  statements?: Array<{key?: string; text?: string; is_true?: boolean}>;
  expected_answer_key?: string;
  expected_numeric?: number;
  decimal_places?: number;
  unit?: string;
  solution_vi?: string;
  needs_figure?: boolean;
  figure_image_index?: number;
  figure_spec?: FigureSpec;
  figure_bbox?: FigureBBox;
  givens?: StructuredGivens;
  topic?: string;
  cluster?: string;
  pattern_id?: string | null;
  proposed_pattern?: string;
  level?: number;
  skill_ids?: string[];
  anticipated_error_ids?: string[];
  hints_vi?: string[];
  confidence?: number;
  ai_reason?: string;
  flags?: string[];
  page_pdf?: number;
  page_print?: string;
  source_excerpt?: string;
}

const VALID_CLUSTERS: SkillCluster[] = ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'];
const VALID_FLAGS: Set<string> = new Set([
  'formula_uncertain',
  'figure_missing',
  'cut_off_at_page_end',
  'cut_off_at_page_start',
  'no_image',
  'out_of_chapter',
  'answer_mismatch',
  'unverifiable_by_code',
  'missing_answer',
  'proposed_new_pattern',
]);

/**
 * Validates raw JSON payload returned from Gemini extraction against expected structure (Section 3.1).
 */
export function validateRawExtractionResponse(payload: unknown): {
  valid: boolean;
  items: RawAiExtractedQuestion[];
  answerKeys: AnswerKeyEntry[];
  error?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return {valid: false, items: [], answerKeys: [], error: 'Phản hồi JSON rỗng hoặc sai kiểu.'};
  }
  const obj = payload as Record<string, unknown>;
  if (!Array.isArray(obj.items)) {
    return {valid: false, items: [], answerKeys: [], error: 'Thiếu mảng items trong phản hồi AI.'};
  }
  const validItems: RawAiExtractedQuestion[] = [];
  for (const raw of obj.items) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as RawAiExtractedQuestion;
    const stem = String(it.stem_latex ?? it.stem_vi ?? '').trim();
    if (!stem) continue;
    validItems.push(it);
  }
  const answerKeys: AnswerKeyEntry[] = Array.isArray(obj.answer_key)
    ? (obj.answer_key as Array<Record<string, unknown>>)
        .filter((k) => k && typeof k === 'object' && String(k.number ?? '').trim() && String(k.answer ?? '').trim())
        .map((k) => ({
          number: String(k.number).trim(),
          part: k.part ? (String(k.part).trim().toUpperCase() as 'I' | 'II' | 'III') : null,
          examCode: k.examCode ? String(k.examCode).trim() : undefined,
          answer: String(k.answer).trim(),
          solution_vi: k.solution_vi ? String(k.solution_vi).trim() : undefined,
          pagePdf: typeof k.pagePdf === 'number' ? k.pagePdf : typeof k.page_pdf === 'number' ? k.page_pdf : undefined,
        }))
    : [];

  return {valid: true, items: validItems, answerKeys};
}

/**
 * Deterministic parser for common Vietnamese horizontal/vertical answer-key tables
 * (e.g. "Câu 17 18 19 20 21 22 | A B C D A B" or "1. A  2. B  3. C").
 * Used both for instant offline/unit parsing and as fallback alongside `/api/ai/answer-key`.
 */
export function parseAnswerKeyTableText(rawText: string): AnswerKeyEntry[] {
  const entries: AnswerKeyEntry[] = [];
  const seen = new Set<string>();
  let currentPart: 'I' | 'II' | 'III' | null = null;

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const partMatch = line.match(/phần\s+(III|II|I)\b/i);
    if (partMatch) {
      currentPart = partMatch[1].toUpperCase() as 'I' | 'II' | 'III';
    }

    // Horizontal table: "Câu 17 18 19 20 21 22" followed on next line (or after '|') by answers
    const horizHeader = line.match(/^câu\s+((?:\d+\s+){1,}\d+)(?:\s*\|\s*(.+))?$/i);
    if (horizHeader) {
      const nums = horizHeader[1].trim().split(/\s+/);
      const ansSource = horizHeader[2]?.trim() || lines[i + 1] || '';
      const ansTokens = ansSource
        .replace(/^(?:đáp\s*án|chọn)\s*[:|]?\s*/i, '')
        .trim()
        .split(/\s+/);
      if (ansTokens.length >= nums.length) {
        nums.forEach((num, idx) => {
          const ans = ansTokens[idx].replace(/[.,;]+$/, '');
          const key = `${currentPart ?? ''}:${num}`;
          if (!seen.has(key) && ans) {
            seen.add(key);
            entries.push({number: num, part: currentPart, answer: ans});
          }
        });
        if (!horizHeader[2] && i + 1 < lines.length) i += 1;
        continue;
      }
    }

    // Inline pairs: "Câu 1: A", "1. B", "17-C", "2. a-Đ, b-S, c-Đ, d-S"
    const tfMatch = line.match(/(?:câu\s*)?(\d{1,3})\s*[:.)-]\s*([a-d]\s*[:\-]?\s*[ĐDSđds](?:[\s,;]+[a-d]\s*[:\-]?\s*[ĐDSđds]){1,3})/i);
    if (tfMatch) {
      const num = tfMatch[1];
      const key = `${currentPart ?? 'II'}:${num}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({number: num, part: currentPart ?? 'II', answer: tfMatch[2].trim()});
      }
      continue;
    }

    const pairRegex = /(?:câu\s*)?(\d{1,3})\s*[:.)\-]\s*([ABCD]|-?\d+(?:[.,]\d+)?)/gi;
    let m: RegExpExecArray | null;
    while ((m = pairRegex.exec(line)) !== null) {
      const num = m[1];
      const ans = m[2].trim();
      const key = `${currentPart ?? ''}:${num}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({number: num, part: currentPart, answer: ans});
      }
    }
  }

  return entries;
}

function normalizeQuestionType(
  rawType: string | undefined,
  hasOptions: boolean,
  hasStatements: boolean,
): QuestionType {
  const t = (rawType ?? '').toLowerCase().trim();
  if (t === 'true_false_multi' || hasStatements) return 'true_false_multi';
  if (t === 'mcq' || (hasOptions && t !== 'short_numeric' && t !== 'numeric' && t !== 'error_spot')) {
    return 'mcq';
  }
  if (t === 'error_spot') return 'error_spot';
  if (t === 'matching') return 'matching';
  if (t === 'fill_relation') return 'fill_relation';
  if (t === 'short_numeric' || t === 'numeric') return 'numeric';
  if (hasOptions) return 'mcq';
  return 'numeric';
}

function normalizePart(raw?: string | null): 'I' | 'II' | 'III' | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase().replace(/^PHẦN\s*/i, '');
  if (u === 'I' || u === '1') return 'I';
  if (u === 'II' || u === '2') return 'II';
  if (u === 'III' || u === '3') return 'III';
  return null;
}

function formatUnit(raw?: string): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  const u = raw.trim();
  if (u.toLowerCase() === 'degree' || u.toLowerCase() === 'độ') return '°';
  return u;
}

/**
 * Converts validated raw AI extraction items into rich, backward-compatible QuestionItem drafts,
 * runs deterministic code solvers (`solvers.ts`), computes fingerprints & suggested stations,
 * and enforces `review_status = 'pending_teacher_review'`.
 */
export function mapV2ExtractedToQuestionDrafts(
  rawItems: RawAiExtractedQuestion[],
  meta: {
    fileName: string;
    fileSha256?: string;
    driveFileId?: string;
    batchId?: string;
    taxonomy?: TaxonomyPattern[];
    noImageMode?: boolean;
    embeddedImages?: DocxEmbeddedImage[];
  },
): QuestionItem[] {
  const taxonomy = meta.taxonomy ?? DEFAULT_TAXONOMY_PATTERNS;

  return rawItems.map((it, idx) => {
    const stem = String(it.stem_latex ?? it.stem_vi ?? '').trim();
    const rawTopic = String(it.topic ?? it.cluster ?? 'SIN').toUpperCase();
    const isOut = rawTopic === 'OUT' || String(it.pattern_id ?? '').toUpperCase() === 'OUT-00';
    const cluster: SkillCluster = VALID_CLUSTERS.includes(rawTopic as SkillCluster)
      ? (rawTopic as SkillCluster)
      : 'SIN';

    const level = ([1, 2, 3, 4].includes(Number(it.level)) ? Number(it.level) : 2) as 1 | 2 | 3 | 4;

    const options = Array.isArray(it.options) && it.options.length >= 2
      ? it.options
          .map((o, oIdx) => {
            if (typeof o === 'string') {
              return {id: String.fromCharCode(97 + oIdx), label: o.trim()};
            }
            const key = String(o.key ?? String.fromCharCode(65 + oIdx)).trim().toLowerCase();
            const id = ['a', 'b', 'c', 'd'].includes(key) ? key : String.fromCharCode(97 + oIdx);
            return {id, label: String(o.text ?? '').trim()};
          })
          .filter((o) => o.label.length > 0)
      : undefined;

    const statements = Array.isArray(it.statements) && it.statements.length >= 2
      ? it.statements
          .map((s, sIdx) => ({
            id: String(s.key ?? String.fromCharCode(97 + sIdx)).trim().toLowerCase(),
            label: String(s.text ?? '').trim(),
            isTrue: Boolean(s.is_true),
          }))
          .filter((s) => s.label.length > 0)
      : undefined;

    const qType = normalizeQuestionType(it.type, Boolean(options && options.length >= 2), Boolean(statements && statements.length >= 2));

    let expectedAnswer: Record<string, unknown> = {};
    let hasAnswer = false;

    if (qType === 'mcq' || qType === 'error_spot') {
      const ansKey = String(it.expected_answer_key ?? '').trim().toLowerCase();
      const matchedOpt = options?.find((o) => o.id === ansKey) ?? null;
      if (matchedOpt) {
        expectedAnswer = {choice: matchedOpt.id};
        hasAnswer = true;
      } else {
        expectedAnswer = {};
      }
    } else if (qType === 'true_false_multi' && statements) {
      const anyExplicit = it.statements?.some((s) => typeof s.is_true === 'boolean');
      if (anyExplicit) {
        expectedAnswer = {
          statements: Object.fromEntries(statements.map((s) => [s.id, s.isTrue])),
        };
        hasAnswer = true;
      }
    } else if (typeof it.expected_numeric === 'number' && Number.isFinite(it.expected_numeric)) {
      const dp = Number.isFinite(Number(it.decimal_places))
        ? Math.max(0, Math.min(4, Number(it.decimal_places)))
        : 1;
      expectedAnswer = {
        rounded: it.expected_numeric,
        value: it.expected_numeric,
        decimal_places: dp,
        unit: formatUnit(it.unit) ?? '',
      };
      hasAnswer = true;
    }

    const patternIdCandidate =
      isOut
        ? 'OUT-00'
        : it.pattern_id && taxonomy.some((t) => t.id === it.pattern_id)
          ? it.pattern_id
          : it.source_pattern_label
            ? suggestTaxonomyForDocumentLabel(it.source_pattern_label, taxonomy)
            : null;

    const topicForStations: TaxonomyTopic = isOut ? 'OUT' : cluster;
    const suggestedStations = computeSuggestedStations({
      topic: topicForStations,
      patternId: patternIdCandidate,
      level,
      taxonomy,
    });

    const stationId: StationId = clusterToDefaultStation(cluster);
    const part = normalizePart(it.part);
    const questionNumber = it.number ? String(it.number).trim() : undefined;

    const flagsSet = new Set<QuestionFlag>();
    if (Array.isArray(it.flags)) {
      for (const f of it.flags) {
        if (VALID_FLAGS.has(f)) flagsSet.add(f as QuestionFlag);
      }
    }
    if (meta.noImageMode) flagsSet.add('no_image');
    if (isOut) flagsSet.add('out_of_chapter');
    if (!hasAnswer) flagsSet.add('missing_answer');
    if (it.proposed_pattern && !patternIdCandidate) flagsSet.add('proposed_new_pattern');

    const embeddedMatch =
      typeof it.figure_image_index === 'number' && meta.embeddedImages?.length
        ? meta.embeddedImages.find((img) => img.index === it.figure_image_index)
        : undefined;

    const mentionsFigure = Boolean(
      it.needs_figure || embeddedMatch || /(?:như\s+hình|hình\s+dưới|hình\s+vẽ|hình\s+bên)/i.test(stem),
    );
    const hasFigureData = Boolean(embeddedMatch || it.figure_spec?.vertices?.length || it.figure_bbox);
    if (mentionsFigure && !hasFigureData) {
      flagsSet.add('figure_missing');
    }

    const hintsRaw = Array.isArray(it.hints_vi) ? it.hints_vi.map((h) => String(h).trim()).filter(Boolean) : [];
    const hintsVi =
      hintsRaw.length >= 2
        ? hintsRaw.slice(0, 2)
        : hintsRaw.length === 1
          ? [hintsRaw[0], 'Áp dụng công thức Hệ thức lượng trong tam giác và kiểm tra lại đơn vị.']
          : [
              'Xác định rõ các cạnh và góc đã cho trên tam giác.',
              'Chọn đúng định lí (Côsin / Sin / diện tích) rồi thay số ở chế độ độ (DEG).',
            ];

    const draft: QuestionItem = {
      id: `pdf_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      stationId,
      stage: 'practice',
      cluster,
      skill_ids:
        Array.isArray(it.skill_ids) && it.skill_ids.length > 0
          ? it.skill_ids.map(String)
          : [cluster.toLowerCase()],
      level,
      type: qType,
      stem_vi: stem,
      options,
      statements,
      expected_answer: expectedAnswer,
      fixedUnitLabel: qType === 'numeric' ? formatUnit(it.unit ?? it.givens?.unit) : undefined,
      solution_vi: String(it.solution_vi ?? '').trim(),
      anticipated_error_ids:
        Array.isArray(it.anticipated_error_ids) && it.anticipated_error_ids.length > 0
          ? it.anticipated_error_ids.map(String)
          : ['E05'],
      hints_vi: hintsVi,
      review_status: 'pending_teacher_review',
      source_refs: [
        [meta.fileName, it.page_print ? `Tr. in ${it.page_print}` : '', it.page_pdf ? `PDF tr. ${it.page_pdf}` : '']
          .filter(Boolean)
          .join(' · '),
      ],
      is_adapted: true,
      source_file_name: meta.fileName,
      drive_file_id: meta.driveFileId,
      page_pdf: typeof it.page_pdf === 'number' ? it.page_pdf : undefined,
      page_printed: it.page_print ? String(it.page_print).trim() : undefined,
      source_excerpt: String(it.source_excerpt ?? stem.slice(0, 180)).slice(0, 260),
      confidence:
        typeof it.confidence === 'number' && Number.isFinite(it.confidence)
          ? Math.max(0, Math.min(1, it.confidence))
          : 0.75,
      ai_reason: String(it.ai_reason ?? 'AI trích xuất và phân dạng từ PDF.').trim(),
      pattern_id: patternIdCandidate,
      proposed_pattern: it.proposed_pattern ? String(it.proposed_pattern).trim() : undefined,
      source_pattern_label: it.source_pattern_label ? String(it.source_pattern_label).trim() : undefined,
      part,
      question_number: questionNumber,
      source_ref: {
        file_name: meta.fileName,
        file_sha256: meta.fileSha256,
        drive_file_id: meta.driveFileId,
        page_pdf: typeof it.page_pdf === 'number' ? it.page_pdf : undefined,
        page_print: it.page_print ? String(it.page_print).trim() : undefined,
        question_number: questionNumber,
        part,
      },
      needs_figure: mentionsFigure,
      figure_image_index: typeof it.figure_image_index === 'number' ? it.figure_image_index : undefined,
      figure_spec: it.figure_spec,
      figure_bbox: it.figure_bbox,
      figure_crop: embeddedMatch?.dataUrl,
      figure_crop_private: embeddedMatch ? true : undefined,
      givens: it.givens,
      import_batch_id: meta.batchId,
      suggested_stations: suggestedStations,
    };

    // Run deterministic code verification (Appendix A solvers) + 4-layer math verification (Section 6.3)
    const ver = verifyQuestionWithSolvers(draft);
    draft.code_verification = ver.code_verification;
    draft.verified_by_code = ver.verified_by_code;
    if (ver.verified_by_code === 'fail') flagsSet.add('answer_mismatch');
    if (ver.verified_by_code === 'n/a' && !isOut) flagsSet.add('unverifiable_by_code');

    draft.math_format = 'latex-1';
    draft.stem_raw = stem;
    draft.math_verified = false;
    const mathLayers = verifyQuestionMathLayers(draft, {
      referenceText: it.source_excerpt ? String(it.source_excerpt) : undefined,
    });
    draft.math_flags = mathLayers.flags;
    if (mathLayers.syntaxErrors.length > 0 || mathLayers.flags.includes('numbers_mismatch')) {
      flagsSet.add('formula_uncertain');
    }

    draft.flags = Array.from(flagsSet);
    draft.fingerprint = computeQuestionFingerprint(draft);
    return draft;
  });
}

/**
 * Stitches questions split across two adjacent pages (`cut_off_at_page_end` + `cut_off_at_page_start`)
 * and removes overlap duplicates by `(part, question_number)` or `fingerprint`.
 */
export function stitchAndDedupeExtractedDrafts(items: QuestionItem[]): QuestionItem[] {
  const merged: QuestionItem[] = [];
  for (const item of items) {
    const prev = merged[merged.length - 1];
    const prevCutEnd = prev?.flags?.includes('cut_off_at_page_end');
    const currCutStart = item.flags?.includes('cut_off_at_page_start');

    if (
      prev &&
      prevCutEnd &&
      currCutStart &&
      (!item.question_number || !prev.question_number || item.question_number === prev.question_number)
    ) {
      const combinedStem = `${prev.stem_vi} ${item.stem_vi}`.replace(/\s+/g, ' ').trim();
      const combinedOptions =
        item.options && item.options.length > (prev.options?.length ?? 0)
          ? item.options
          : prev.options;
      const combinedStatements =
        item.statements && item.statements.length > (prev.statements?.length ?? 0)
          ? item.statements
          : prev.statements;
      const nextFlags = (prev.flags ?? []).filter(
        (f) => f !== 'cut_off_at_page_end' && f !== 'cut_off_at_page_start',
      );
      const stitched: QuestionItem = {
        ...prev,
        stem_vi: combinedStem,
        options: combinedOptions,
        statements: combinedStatements,
        figure_spec: prev.figure_spec ?? item.figure_spec,
        figure_bbox: prev.figure_bbox ?? item.figure_bbox,
        figure_crop: prev.figure_crop ?? item.figure_crop,
        figure_crop_private: prev.figure_crop_private ?? item.figure_crop_private,
        figure_image_index: prev.figure_image_index ?? item.figure_image_index,
        givens: prev.givens ?? item.givens,
        flags: nextFlags,
      };
      stitched.fingerprint = computeQuestionFingerprint(stitched);
      const ver = verifyQuestionWithSolvers(stitched);
      stitched.code_verification = ver.code_verification;
      stitched.verified_by_code = ver.verified_by_code;
      merged[merged.length - 1] = stitched;
      continue;
    }

    // Deduplicate overlap window items
    const duplicateIdx = merged.findIndex(
      (m) =>
        (m.fingerprint && item.fingerprint && m.fingerprint === item.fingerprint) ||
        (m.question_number &&
          item.question_number &&
          m.question_number === item.question_number &&
          (m.part ?? null) === (item.part ?? null)),
    );
    if (duplicateIdx >= 0) {
      // Keep whichever version has higher completeness (more options or higher confidence)
      const existing = merged[duplicateIdx];
      const existingScore =
        (existing.options?.length ?? 0) + (existing.statements?.length ?? 0) + (existing.confidence ?? 0);
      const candidateScore =
        (item.options?.length ?? 0) + (item.statements?.length ?? 0) + (item.confidence ?? 0);
      if (candidateScore > existingScore) {
        merged[duplicateIdx] = item;
      }
      continue;
    }

    merged.push(item);
  }
  return merged;
}

/**
 * Applies extracted `AnswerKeyEntry[]` (optionally filtered by examCode) onto extracted questions
 * matching `(part, question_number)`, then re-runs deterministic code verification!
 */
export function applyAnswerKeysToDrafts(
  drafts: QuestionItem[],
  answerKeys: AnswerKeyEntry[],
  selectedExamCode?: string,
): {items: QuestionItem[]; matchedCount: number} {
  if (answerKeys.length === 0) return {items: drafts, matchedCount: 0};

  const filteredKeys = selectedExamCode
    ? answerKeys.filter((k) => !k.examCode || k.examCode === selectedExamCode)
    : answerKeys;

  const findKey = (q: QuestionItem): AnswerKeyEntry | undefined => {
    if (!q.question_number) return undefined;
    const normNum = q.question_number.replace(/^câu\s*/i, '').trim();
    // Exact (part + number) first
    if (q.part) {
      const exact = filteredKeys.find(
        (k) => k.number.replace(/^câu\s*/i, '').trim() === normNum && k.part === q.part,
      );
      if (exact) return exact;
    }
    // Fallback by number alone when part is unspecified on either side
    return filteredKeys.find(
      (k) =>
        k.number.replace(/^câu\s*/i, '').trim() === normNum &&
        (!k.part || !q.part || k.part === q.part),
    );
  };

  let matchedCount = 0;
  const updated = drafts.map((q) => {
    const entry = findKey(q);
    if (!entry) return q;
    matchedCount += 1;

    let nextExpected = {...q.expected_answer};
    let nextStatements = q.statements;

    if ((q.type === 'mcq' || q.type === 'error_spot') && q.options) {
      const letter = entry.answer.trim().toLowerCase().charAt(0);
      if (['a', 'b', 'c', 'd'].includes(letter)) {
        nextExpected = {...nextExpected, choice: letter};
      }
    } else if (q.type === 'true_false_multi' && q.statements) {
      // Parse "a:Đ,b:S,c:Đ,d:S" or "Đ-S-Đ-S"
      const tfMap: Record<string, boolean> = {};
      const explicitPairs = Array.from(entry.answer.matchAll(/([a-d])\s*[:\-]?\s*([ĐDSđds])/gi));
      if (explicitPairs.length > 0) {
        for (const m of explicitPairs) {
          tfMap[m[1].toLowerCase()] = m[2].toUpperCase() !== 'S';
        }
      } else {
        const letters = entry.answer.match(/[ĐDSđds]/gi) ?? [];
        q.statements.forEach((s, idx) => {
          if (letters[idx]) tfMap[s.id] = letters[idx].toUpperCase() !== 'S';
        });
      }
      if (Object.keys(tfMap).length > 0) {
        nextStatements = q.statements.map((s) =>
          typeof tfMap[s.id] === 'boolean' ? {...s, isTrue: tfMap[s.id]} : s,
        );
        nextExpected = {
          statements: Object.fromEntries(nextStatements.map((s) => [s.id, s.isTrue])),
        };
      }
    } else {
      const parsedNum = Number(entry.answer.replace(',', '.').replace(/[^\d.+-]/g, ''));
      if (Number.isFinite(parsedNum)) {
        nextExpected = {
          ...nextExpected,
          rounded: parsedNum,
          value: parsedNum,
        };
      }
    }

    const nextQ: QuestionItem = {
      ...q,
      expected_answer: nextExpected,
      statements: nextStatements,
      solution_vi: entry.solution_vi || q.solution_vi,
      flags: (q.flags ?? []).filter((f) => f !== 'missing_answer' && f !== 'answer_mismatch'),
    };

    const ver = verifyQuestionWithSolvers(nextQ);
    nextQ.code_verification = ver.code_verification;
    nextQ.verified_by_code = ver.verified_by_code;
    if (ver.verified_by_code === 'fail') {
      nextQ.flags = Array.from(new Set([...(nextQ.flags ?? []), 'answer_mismatch']));
    }
    return nextQ;
  });

  return {items: updated, matchedCount};
}

/**
 * Helper: fetch with exponential backoff for HTTP 429 rate-limits (never retries quotaExceeded).
 */
async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let delayMs = 1200;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, init);
    if (resp.status !== 429 || attempt === maxRetries) {
      return resp;
    }
    // Check if daily quota is exhausted (do not retry quota exhaustion)
    const cloned = resp.clone();
    try {
      const body = (await cloned.json()) as {quotaExceeded?: boolean};
      if (body.quotaExceeded) return resp;
    } catch {
      // Non-JSON 429 -> transient rate limit, backoff & retry
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs *= 2;
  }
  return fetch(url, init);
}

export interface WindowExtractResult {
  items: QuestionItem[];
  answerKeys: AnswerKeyEntry[];
  fromCache: boolean;
  usedModel: string;
  quota?: {used: number; limit: number; remaining: number; date: string};
  quotaExceeded?: boolean;
  error?: string;
}

/**
 * Extracts questions from a window of 1–3 PDF pages (or pasted text), using SHA-256 cache first.
 */
export async function extractWindowViaAi(params: {
  pages: PdfReadPageResult[];
  pastedText?: string;
  fileName: string;
  fileSha256: string;
  driveFileId?: string;
  batchId?: string;
  accessToken: string | null;
  personalApiKey?: string;
  maxDaily: number;
  aiEnabled: boolean;
  classificationMode: ClassificationMode;
  taxonomy: TaxonomyPattern[];
  customPatterns?: string[];
  model: string;
  useHardPageModel?: boolean;
  bypassCache?: boolean;
  embeddedImages?: DocxEmbeddedImage[];
  signal?: AbortSignal;
}): Promise<WindowExtractResult> {
  const pageNums = params.pages.map((p) => p.pagePdf);
  const rangeKey =
    pageNums.length > 0 ? `q:${pageNums.join(',')}` : `txt:${params.fileSha256.slice(0, 12)}`;

  // 1. Check SHA-256 cache first (0 AI calls!)
  if (!params.bypassCache && params.fileSha256) {
    const cached = getCachedExtractionResult({
      sha256: params.fileSha256,
      pageRange: rangeKey,
      promptVersion: PROMPT_VERSION,
      model: params.model,
    });
    if (cached) {
      return {
        items: cached.items,
        answerKeys: cached.answerKeys,
        fromCache: true,
        usedModel: cached.model,
      };
    }
  }

  // 2. Call server `/api/ai/extract`
  const payloadPages = params.pages.map((pg) => ({
    pagePdf: pg.pagePdf,
    pagePrinted: pg.pagePrinted,
    text: pg.text,
    imageBase64: pg.state.sendMode !== 'text_only' ? pg.cachedImage?.imageBase64 : undefined,
    mimeType: 'image/jpeg',
    sendMode: pg.state.sendMode,
  }));

  const docxFiguresPayload = (params.embeddedImages ?? [])
    .slice(0, 4)
    .map((img) => {
      const commaIdx = img.dataUrl.indexOf(',');
      return {
        index: img.index,
        mimeType: img.mimeType || 'image/jpeg',
        imageBase64: commaIdx >= 0 ? img.dataUrl.slice(commaIdx + 1) : '',
      };
    })
    .filter((f) => f.imageBase64.length > 50);

  try {
    const resp = await fetchWithBackoff('/api/ai/extract', {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(params.accessToken ? {Authorization: `Bearer ${params.accessToken}`} : {}),
        ...(params.personalApiKey?.trim() ? {'x-gemini-api-key': params.personalApiKey.trim()} : {}),
      },
      body: JSON.stringify({
        text: params.pastedText ?? '',
        pages: payloadPages,
        docxFigures: docxFiguresPayload,
        sourceName: params.fileName,
        driveFileId: params.driveFileId,
        maxDaily: params.maxDaily,
        aiEnabled: params.aiEnabled,
        classificationMode: params.classificationMode,
        taxonomy: params.taxonomy
          .filter((t) => t.status !== 'hidden')
          .map((t) => ({id: t.id, topic: t.topic, name: t.name})),
        customPatterns: params.customPatterns ?? [],
        modelOverride: params.model,
        useHardPageModel: Boolean(params.useHardPageModel),
      }),
    });

    const rawBodyText = await resp.text();
    let data: {
      items?: unknown;
      answer_key?: unknown;
      model?: string;
      error?: string;
      diagnostic?: string;
      quotaExceeded?: boolean;
      quota?: {used: number; limit: number; remaining: number; date: string};
    } = {};
    try {
      data = rawBodyText ? (JSON.parse(rawBodyText) as typeof data) : {};
    } catch {
      // Non-JSON response (e.g., Vercel 413 Payload Too Large or 504 Gateway Timeout)
    }

    if (!resp.ok) {
      if (data.diagnostic) {
        console.error('[aiExtractor] Server diagnostic:', resp.status, data.diagnostic);
      }
      const fallbackMsg =
        resp.status === 413
          ? 'Ảnh nhóm trang PDF quá lớn (HTTP 413). Hãy thử bấm "Thử lại" từng trang riêng lẻ.'
          : resp.status === 504
            ? 'Máy chủ AI xử lý quá thời gian cho phép (HTTP 504). Hãy thử bấm "Thử lại" từng trang riêng lẻ.'
            : resp.status === 401
              ? 'Phiên đăng nhập đã hết hạn (HTTP 401). Hãy đăng xuất rồi đăng nhập lại tài khoản Quản trị/Giáo viên.'
              : `Chưa thể trích xuất nhóm trang này (HTTP ${resp.status}).`;
      return {
        items: [],
        answerKeys: [],
        fromCache: false,
        usedModel: params.model,
        quota: data.quota,
        quotaExceeded: data.quotaExceeded,
        error: data.error ?? fallbackMsg,
      };
    }

    const validated = validateRawExtractionResponse(data);
    if (!validated.valid) {
      return {
        items: [],
        answerKeys: [],
        fromCache: false,
        usedModel: data.model ?? params.model,
        quota: data.quota,
        error: validated.error,
      };
    }

    const drafts = mapV2ExtractedToQuestionDrafts(validated.items, {
      fileName: params.fileName,
      fileSha256: params.fileSha256,
      driveFileId: params.driveFileId,
      batchId: params.batchId,
      taxonomy: params.taxonomy,
      noImageMode:
        (payloadPages.length === 0 || payloadPages.every((p) => !p.imageBase64)) &&
        !(params.embeddedImages && params.embeddedImages.length > 0),
      embeddedImages: params.embeddedImages,
    });

    const usedModel = data.model ?? params.model;
    if (params.fileSha256 && drafts.length > 0) {
      saveCachedExtractionResult({
        sha256: params.fileSha256,
        pageRange: rangeKey,
        promptVersion: PROMPT_VERSION,
        model: usedModel,
        items: drafts,
        answerKeys: validated.answerKeys,
      });
    }

    return {
      items: drafts,
      answerKeys: validated.answerKeys,
      fromCache: false,
      usedModel,
      quota: data.quota,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        items: [],
        answerKeys: [],
        fromCache: false,
        usedModel: params.model,
        error: 'Đã hủy tiến trình trích xuất.',
      };
    }
    return {
      items: [],
      answerKeys: [],
      fromCache: false,
      usedModel: params.model,
      error: 'Không kết nối được tới máy chủ AI. Bạn có thể bấm thử lại khi có mạng.',
    };
  }
}

/**
 * Extracts answer keys from detected answer-key pages via `/api/ai/answer-key` + local table parser.
 */
export async function extractAnswerKeysViaAi(params: {
  pages: PdfReadPageResult[];
  fileSha256: string;
  accessToken: string | null;
  personalApiKey?: string;
  maxDaily: number;
  aiEnabled: boolean;
  model: string;
  signal?: AbortSignal;
}): Promise<{
  entries: AnswerKeyEntry[];
  examCodes: string[];
  fromCache: boolean;
  quota?: {used: number; limit: number; remaining: number; date: string};
  error?: string;
}> {
  const rangeKey = `ak:${params.pages.map((p) => p.pagePdf).join(',')}`;
  if (params.fileSha256) {
    const cached = getCachedExtractionResult({
      sha256: params.fileSha256,
      pageRange: rangeKey,
      promptVersion: PROMPT_VERSION,
      model: params.model,
    });
    if (cached && cached.answerKeys.length > 0) {
      const codes = Array.from(
        new Set(cached.answerKeys.map((k) => k.examCode).filter((c): c is string => Boolean(c))),
      );
      return {entries: cached.answerKeys, examCodes: codes, fromCache: true};
    }
  }

  // First try deterministic parser on clean text pages
  const localText = params.pages.map((p) => p.text).join('\n');
  const localEntries = parseAnswerKeyTableText(localText);

  try {
    const resp = await fetchWithBackoff('/api/ai/answer-key', {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(params.accessToken ? {Authorization: `Bearer ${params.accessToken}`} : {}),
        ...(params.personalApiKey?.trim() ? {'x-gemini-api-key': params.personalApiKey.trim()} : {}),
      },
      body: JSON.stringify({
        pages: params.pages.map((p) => ({
          pagePdf: p.pagePdf,
          pagePrinted: p.pagePrinted,
          text: p.text,
          imageBase64: p.cachedImage?.imageBase64,
          mimeType: 'image/jpeg',
        })),
        maxDaily: params.maxDaily,
        aiEnabled: params.aiEnabled,
      }),
    });

    const data = (await resp.json()) as {
      entries?: AnswerKeyEntry[];
      examCodes?: string[];
      error?: string;
      quota?: {used: number; limit: number; remaining: number; date: string};
    };

    if (!resp.ok) {
      return {
        entries: localEntries,
        examCodes: [],
        fromCache: false,
        quota: data.quota,
        error: localEntries.length > 0 ? undefined : data.error,
      };
    }

    const merged = (data.entries && data.entries.length > 0 ? data.entries : localEntries) ?? [];
    if (params.fileSha256 && merged.length > 0) {
      saveCachedExtractionResult({
        sha256: params.fileSha256,
        pageRange: rangeKey,
        promptVersion: PROMPT_VERSION,
        model: params.model,
        items: [],
        answerKeys: merged,
      });
    }
    return {
      entries: merged,
      examCodes: data.examCodes ?? [],
      fromCache: false,
      quota: data.quota,
    };
  } catch {
    return {
      entries: localEntries,
      examCodes: [],
      fromCache: false,
      error: localEntries.length > 0 ? undefined : 'Không đọc được bảng đáp án từ máy chủ AI.',
    };
  }
}

/**
 * Checks whether a question draft is eligible for one-click batch approval (Section 3.1, 3.3, 3.4).
 * Blocked if: out_of_chapter, figure_missing, answer_mismatch, missing_answer,
 * not verified_by_code === 'pass', or confidence < threshold (default 0.85).
 */
export function isEligibleForBatchApproval(
  q: QuestionItem,
  confidenceThreshold = 0.95,
): {eligible: boolean; reason?: string} {
  const flags = q.flags ?? [];
  const mathFlags = q.math_flags ?? [];
  if (flags.includes('out_of_chapter') || q.pattern_id === 'OUT-00') {
    return {eligible: false, reason: 'Câu ngoài Chương III'};
  }
  if (flags.includes('figure_missing')) {
    return {eligible: false, reason: 'Thiếu hình minh họa (figure_missing)'};
  }
  if (
    mathFlags.includes('unbalanced_dollar') ||
    mathFlags.includes('latex_syntax_error') ||
    mathFlags.includes('numbers_mismatch') ||
    mathFlags.includes('symbols_mismatch') ||
    mathFlags.includes('formula_split')
  ) {
    return {eligible: false, reason: `Có cờ lỗi công thức (${mathFlags.join(', ')})`};
  }
  if (flags.includes('answer_mismatch') || q.verified_by_code === 'fail') {
    return {eligible: false, reason: 'Lệch đáp án khi code kiểm chứng'};
  }
  if (flags.includes('missing_answer')) {
    return {eligible: false, reason: 'Chưa có đáp án'};
  }
  if (q.verified_by_code !== 'pass') {
    return {eligible: false, reason: 'Chưa kiểm chứng được bằng code'};
  }
  if (q.math_verified !== true) {
    return {eligible: false, reason: 'Chưa bấm "Đã đối chiếu công thức" (math_verified=false)'};
  }
  const minConf = Math.max(0.95, confidenceThreshold);
  if ((q.confidence ?? 0) < minConf) {
    return {
      eligible: false,
      reason: `Độ tin cậy ${Math.round((q.confidence ?? 0) * 100)}% < ${Math.round(minConf * 100)}%`,
    };
  }
  return {eligible: true};
}

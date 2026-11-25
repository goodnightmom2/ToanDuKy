import {
  AI_HARD_PAGE_MODEL,
  AI_MODEL,
  checkAndConsumeQuota,
  DAILY_QUOTA_DEFAULT,
  fixLatexControlChars,
  getGenAIClient,
  getQuotaStatus,
  jsonResponse,
  markModelTemporarilyUnavailable,
  PROMPT_VERSION,
  refundQuota,
  resolveApiKeyForCaller,
  resolveLiveModelChain,
  verifyRequestAuth,
} from '../_shared.ts';

interface ExtractPageInput {
  pagePdf: number;
  pagePrinted?: string;
  text?: string;
  imageBase64?: string;
  mimeType?: string;
  sendMode?: 'text_only' | 'image_and_text' | 'image_only';
}

interface TaxonomyPromptEntry {
  id: string;
  topic: string;
  name: string;
}

interface DocxFigureInput {
  index: number;
  mimeType?: string;
  imageBase64?: string;
}

interface ExtractBody {
  text?: string;
  pages?: ExtractPageInput[];
  docxFigures?: DocxFigureInput[];
  pdfBase64?: string;
  sourceName?: string;
  driveFileId?: string;
  maxDaily?: number;
  aiEnabled?: boolean;
  classificationMode?: 'web_taxonomy' | 'document_patterns';
  taxonomy?: TaxonomyPromptEntry[];
  customPatterns?: string[];
  modelOverride?: string;
  useHardPageModel?: boolean;
}

const APPENDIX_B_SYSTEM_PROMPT = `Bạn là trợ lý số hóa đề Toán THPT Việt Nam (${PROMPT_VERSION}, chuẩn latex-1). Bạn nhận ảnh và/hoặc văn bản của 1–3 trang đề Toán. Hãy tách TỪNG câu hỏi và CHỈ trả về JSON hợp lệ (không thêm giải thích hay markdown).
Quy tắc BẮT BUỘC:
(1) Chỉ dựa vào nội dung đang thấy, KHÔNG bịa đề hay tự sửa số liệu. ĐẶC BIỆT: nếu văn bản có ký hiệu "[CÔNG_THỨC_MATHTYPE]" (công thức chưa đọc được), TUYỆT ĐỐI KHÔNG tự bịa số liệu hay phương án thay thế — hãy giữ nguyên "[?]", thêm cờ "formula_uncertain" và hạ confidence xuống <= 0.4. Chỗ không chắc ghi vào flags ("formula_uncertain", "figure_missing", "cut_off_at_page_end", "cut_off_at_page_start") và hạ confidence. Thiếu đáp án -> expected_answer_key="", expected_numeric=null, thêm cờ "missing_answer".
(2) Chuẩn LaTeX Chương III (đặt trong $...$ hoặc $$...$$; chữ tiếng Việt để NGOÀI $...$):
    - Góc: $\\widehat{BAC}$, $\\widehat{A}$. Độ: $50^\\circ$.
    - Hàm lượng giác: $\\sin 60^\\circ$, $\\cos A$, $\\tan\\alpha$, $\\cot\\alpha$.
    - Phân số: $\\dfrac{AC}{\\sin 60^\\circ}$; Căn: $\\sqrt{3}$; Nhân: $\\cdot$; Tam giác: $\\triangle ABC$; Vuông góc: $AB\\perp CH$; Vectơ: $\\overrightarrow{AB}$.
    - Số thập phân kiểu Việt trong công thức bọc ngoặc nhọn: $55{,}3$; đơn vị ngắn: $55{,}3\\ \\mathrm{m}$, $259{,}8\\ \\mathrm{m}^2$, $0{,}75\\ \\mathrm{km}$.
    - Ví dụ chuẩn:
      • "AC = 60·sin60°/sin70° ≈ 55,3 m" → "$AC=\\dfrac{60\\sin 60^\\circ}{\\sin 70^\\circ}\\approx 55{,}3\\ \\mathrm{m}$"
      • "cosA = (b²+c²−a²)/(2bc)" → "$\\cos A=\\dfrac{b^2+c^2-a^2}{2bc}$"
(3) Nhận diện part ("I", "II", "III" hoặc ""), type ("mcq", "true_false_multi", "short_numeric", "matching", "fill_relation", "error_spot", "open_explain"), number (ví dụ "1", "17"), source_pattern_label ("Dạng n ...").
(4) Trắc nghiệm: options = [{"key":"A","text":"..."}, ...]; Đúng/sai 4 ý: statements = [{"key":"a","text":"...","is_true":true}, ...].
(5) HÌNH VẼ MINH HỌA (rất quan trọng với bài toán thực tế/vận dụng):
    - Nếu văn bản có dấu hiệu "[HÌNH_VẼ_1]", "[HÌNH_VẼ_2]"... thuộc câu nào: đặt needs_figure=true, điền "figure_image_index": 1 (số nguyên đúng theo chỉ số hình), và XÓA thẻ "[HÌNH_VẼ_...]" khỏi stem_latex.
    - Nếu đầu vào có ảnh trang PDF và câu hỏi có hình vẽ / sơ đồ (cây, tháp, đồi, tàu thuyền, sông, tam giác, "hình vẽ", "hình bên"): đặt needs_figure=true và BẮT BUỘC trả chính xác "figure_bbox": {"page": <số trang PDF>, "x": <0..1>, "y": <0..1>, "w": <0..1>, "h": <0..1>} bao trọn hình vẽ cùng các nhãn đỉnh/góc/số đo trên hình.
(6) Trích givens (a, b, c, A_deg, B_deg, C_deg, R, r, S, d, alpha_deg, beta_deg, trig_fn, trig_value, quadrant, target, unit, decimal_places) để máy tự giải kiểm chứng.
(7) Phân loại theo danh mục taxonomy kèm theo: topic ("NEN"|"LG"|"COS"|"SIN"|"DT"|"MH"|"OUT"), pattern_id, level (1–4), skill_ids, anticipated_error_ids (E01–E12), hints_vi đúng 2 mức (mức 1 KHÔNG lộ đáp án), confidence (0..1), ai_reason. Ngoài Chương III -> topic="OUT", pattern_id="OUT-00".
(8) Nếu trang có bảng "Đáp án / Lời giải": trả thêm mảng answer_key = [{"number":"1","part":"I","examCode":"","answer":"A","solution_vi":"...","page_pdf":1}].
(9) Lược đồ JSON BẮT BUỘC trả về:
{
  "items": [
    {
      "number": "1",
      "part": "I",
      "source_pattern_label": "",
      "type": "mcq",
      "stem_latex": "Cho tam giác $ABC$...",
      "options": [{"key": "A", "text": "$...$"}, {"key": "B", "text": "$...$"}],
      "statements": [],
      "expected_answer_key": "A",
      "expected_numeric": null,
      "decimal_places": 1,
      "unit": "m",
      "solution_vi": "...",
      "needs_figure": false,
      "figure_image_index": null,
      "figure_spec": null,
      "figure_bbox": null,
      "givens": {},
      "topic": "COS",
      "pattern_id": "COS-01",
      "proposed_pattern": "",
      "level": 2,
      "skill_ids": ["cos"],
      "anticipated_error_ids": ["E05"],
      "hints_vi": ["Gợi ý 1 không lộ đáp án", "Gợi ý 2"],
      "confidence": 0.9,
      "ai_reason": "...",
      "flags": [],
      "page_pdf": 1,
      "page_print": "",
      "source_excerpt": ""
    }
  ],
  "answer_key": []
}`;

function parseJsonLoose(raw: string): Record<string, unknown> {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Try locating outermost JSON object `{ ... }`
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1)) as Record<string, unknown>;
    }
    throw new Error('JSON_PARSE_FAILED');
  }
}

function normalizeFigureBBox(
  raw: unknown,
  fallbackPage?: number,
): {page: number; x: number; y: number; w: number; h: number} | undefined {
  if (!raw) return undefined;
  let x = 0;
  let y = 0;
  let w = 0;
  let h = 0;
  let page = Number.isFinite(fallbackPage) && (fallbackPage ?? 0) > 0 ? Math.round(fallbackPage!) : 1;

  if (Array.isArray(raw) && raw.length === 4 && raw.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    // Gemini standard [ymin, xmin, ymax, xmax] in 0..1000 or 0..1
    const [ymin, xmin, ymax, xmax] = raw as number[];
    const scale = Math.max(ymin, xmin, ymax, xmax) > 1.05 ? 1000 : 1;
    x = xmin / scale;
    y = ymin / scale;
    w = (xmax - xmin) / scale;
    h = (ymax - ymin) / scale;
  } else if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.page === 'number' && Number.isFinite(obj.page) && obj.page > 0) {
      page = Math.round(obj.page);
    }
    if (
      typeof obj.ymin === 'number' &&
      typeof obj.xmin === 'number' &&
      typeof obj.ymax === 'number' &&
      typeof obj.xmax === 'number'
    ) {
      const scale = Math.max(obj.ymin, obj.xmin, obj.ymax, obj.xmax) > 1.05 ? 1000 : 1;
      x = obj.xmin / scale;
      y = obj.ymin / scale;
      w = (obj.xmax - obj.xmin) / scale;
      h = (obj.ymax - obj.ymin) / scale;
    } else if (
      typeof obj.x === 'number' &&
      typeof obj.y === 'number' &&
      typeof obj.w === 'number' &&
      typeof obj.h === 'number'
    ) {
      const scale = Math.max(obj.x, obj.y, obj.w, obj.h) > 1.05 ? 1000 : 1;
      x = obj.x / scale;
      y = obj.y / scale;
      w = obj.w / scale;
      h = obj.h / scale;
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return undefined;
  if (w < 0.03 || h < 0.03) return undefined;

  // Add slight padding (1.5%) so vertex/angle labels right at the diagram edge are never clipped
  const pad = 0.015;
  const cx = Math.max(0, x - pad);
  const cy = Math.max(0, y - pad);
  const cw = Math.min(1 - cx, w + pad * 2);
  const ch = Math.min(1 - cy, h + pad * 2);
  return {
    page,
    x: Math.round(cx * 1000) / 1000,
    y: Math.round(cy * 1000) / 1000,
    w: Math.round(cw * 1000) / 1000,
    h: Math.round(ch * 1000) / 1000,
  };
}

function summarizeProviderError(rawMsg: string, usingPersonalKey = false): string {
  const m = rawMsg.toLowerCase();
  const safeSnippet = rawMsg
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[KEY]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (m.includes('api key') || m.includes('permission_denied') || m.includes('403') || m.includes('401')) {
    return usingPersonalKey
      ? `Khóa Gemini API cá nhân không hợp lệ hoặc bị hạn chế quyền trên Google AI Studio. Hãy kiểm tra lại khóa bắt đầu bằng "AIza...". (${safeSnippet})`
      : `Khóa GEMINI_API_KEY trên Vercel không hợp lệ hoặc bị hạn chế quyền. (${safeSnippet})`;
  }
  if (m.includes('503') || m.includes('unavailable') || m.includes('high demand') || m.includes('overloaded')) {
    return `Các model Gemini đang quá tải tạm thời (503 High Demand) trên Google AI Studio. Hãy chờ 30–60 giây rồi bấm "Thử lại" hoặc chọn model khác ở hộp trên. (${safeSnippet})`;
  }
  if (m.includes('resource_exhausted') || m.includes('quota') || m.includes('429')) {
    return usingPersonalKey
      ? `Khóa Gemini API cá nhân của bạn tạm chạm giới hạn tốc độ / hạn mức miễn phí (429). Hãy chờ 1 phút rồi thử lại. (${safeSnippet})`
      : `Tài khoản Google AI Studio (GEMINI_API_KEY) tạm chạm giới hạn tốc độ / hạn mức miễn phí (429). Hãy chờ 1 phút rồi thử lại. (${safeSnippet})`;
  }
  if (m.includes('404') || m.includes('not found')) {
    return `Không tìm thấy model Gemini khả dụng cho khóa API hiện tại. (${safeSnippet})`;
  }
  if (m.includes('too large') || m.includes('413')) {
    return `Dung lượng ảnh trang PDF quá lớn — hãy đọc khoảng trang nhỏ hơn. (${safeSnippet})`;
  }
  return `Máy chủ AI tạm thời không phản hồi cho nhóm trang này. (${safeSnippet})`;
}

export async function POST(request: Request): Promise<Response> {
  // Both Admin and Teacher can import materials, but Teachers MUST supply their own personal Gemini API key (BYOK)
  const auth = await verifyRequestAuth(request, {requireStaff: true});
  if (!auth.ok) {
    return jsonResponse({error: auth.error}, auth.status);
  }

  const keyRes = resolveApiKeyForCaller(request, auth.caller);
  if (!keyRes.ok) {
    return jsonResponse(
      {
        error: keyRes.error,
        requiresPersonalKey: keyRes.requiresPersonalKey,
        fallbackToManual: true,
      },
      keyRes.status,
    );
  }

  let body: ExtractBody = {};
  try {
    body = (await request.json()) as ExtractBody;
  } catch {
    return jsonResponse({error: 'Dữ liệu gửi lên vượt giới hạn hoặc không đúng định dạng JSON.'}, 400);
  }

  const {
    text = '',
    pages = [],
    docxFigures = [],
    pdfBase64 = '',
    sourceName = 'tai-lieu',
    driveFileId = '',
    maxDaily = DAILY_QUOTA_DEFAULT,
    aiEnabled = true,
    classificationMode = 'web_taxonomy',
    taxonomy = [],
    customPatterns = [],
    modelOverride = '',
    useHardPageModel = false,
  } = body;

  if (!aiEnabled) {
    return jsonResponse(
      {error: 'Trợ lý AI đang tắt trong Cài đặt. Vui lòng bật lại hoặc chuyển sang nhập tay.', fallbackToManual: true},
      403,
    );
  }

  const trimmedText = typeof text === 'string' ? text.trim().slice(0, 26000) : '';
  const validPages = Array.isArray(pages) ? pages.slice(0, 3) : [];
  const hasPages = validPages.length > 0;
  const hasPdf = typeof pdfBase64 === 'string' && pdfBase64.length > 100;

  if (!trimmedText && !hasPages && !hasPdf) {
    return jsonResponse({error: 'Chưa có văn bản hoặc ảnh trang PDF cần trích xuất.'}, 400);
  }

  const ai = getGenAIClient(keyRes.apiKey);
  if (!ai) {
    return jsonResponse(
      {
        error: 'Chưa có khóa GEMINI_API_KEY hợp lệ. Hãy nhập Khóa Gemini API cá nhân hoặc chuyển sang nhập tay.',
        fallbackToManual: true,
      },
      503,
    );
  }

  // Personal BYOK keys use the caller's own Google AI Studio quota and do NOT consume system quota
  const quotaStatusBefore = getQuotaStatus(maxDaily);
  const quota = keyRes.usingPersonalKey
    ? {ok: true, used: 0, limit: quotaStatusBefore.dailyLimit, date: quotaStatusBefore.date}
    : checkAndConsumeQuota(maxDaily);
  if (!quota.ok) {
    return jsonResponse(
      {
        error: `Đã hết hạn mức AI trong ngày (${quota.used}/${quota.limit} lượt). Tiến độ đã được lưu — bạn có thể tiếp tục vào ngày mai hoặc chuyển sang nhập tay.`,
        quotaExceeded: true,
        fallbackToManual: true,
        quota: {...quota, remaining: 0},
      },
      429,
    );
  }

  const taxonomySummary =
    Array.isArray(taxonomy) && taxonomy.length > 0
      ? taxonomy.map((t) => `${t.id} (${t.topic}): ${t.name}`).join('\n')
      : [
          'NEN-01..03 (NEN): Tổng ba góc, cạnh–góc đối diện, tam giác vuông/đổi đơn vị',
          'LG-01..04 (LG): Giá trị lượng giác 0°–180°, góc bù, dấu góc tù, hệ thức sin²+cos²=1',
          'COS-01..04 (COS): Định lí Côsin tìm cạnh, tìm góc, nhận dạng tam giác, thực tế',
          'SIN-01..03 (SIN): Định lí Sin tìm cạnh, tìm góc, bán kính ngoại tiếp R',
          'DT-01..05 (DT): Diện tích ½bc·sinA, Heron, S=pr, S=abc/4R, thực tế',
          'MH-01..06 (MH): Đo khoảng cách, đo chiều cao 2 góc ngắm, giải tam giác, chuyển động, tìm lỗi sai, tối ưu',
          'OUT-00 (OUT): Ngoài Chương III',
        ].join('\n');

  const modeNote =
    classificationMode === 'document_patterns'
      ? `Chế độ B (Theo dạng tài liệu/giáo viên): Ưu tiên giữ nhãn "Dạng n ..." trong tài liệu vào source_pattern_label${
          customPatterns.length > 0 ? ` hoặc chọn từ: ${customPatterns.join('; ')}` : ''
        }, đồng thời gợi ý pattern_id gần nhất trong taxonomy.`
      : 'Chế độ A (Theo danh mục dạng của web): Phân loại trực tiếp vào mã pattern_id trong taxonomy bên dưới.';

  const contents: Array<Record<string, unknown>> = [];
  const pageTextParts: string[] = [];

  if (hasPages) {
    for (const pg of validPages) {
      const header = `[Trang PDF ${pg.pagePdf}${pg.pagePrinted ? ` | Trang in ${pg.pagePrinted}` : ''}]`;
      const hasImg = Boolean(pg.imageBase64 && pg.imageBase64.length > 50);
      if (hasImg && pg.sendMode !== 'text_only') {
        contents.push({
          text: `${header} (Ảnh trang PDF${pg.text ? ' kèm lớp chữ đối chiếu bên dưới' : ''}):`,
        });
        contents.push({
          inlineData: {
            mimeType: pg.mimeType || 'image/jpeg',
            data: pg.imageBase64!.slice(0, 1_800_000),
          },
        });
      }
      if (pg.text && pg.text.trim() && pg.sendMode !== 'image_only') {
        pageTextParts.push(`${header}\n${pg.text.trim()}`);
      }
    }
  } else if (hasPdf) {
    contents.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBase64.slice(0, 3_000_000),
      },
    });
  }

  // Attach up to 4 extracted DOCX diagram images so Gemini sees numbers/labels on diagrams directly
  if (Array.isArray(docxFigures) && docxFigures.length > 0) {
    for (const fig of docxFigures.slice(0, 4)) {
      if (fig?.imageBase64 && fig.imageBase64.length > 50) {
        contents.push({
          text: `[HÌNH_VẼ_${fig.index}] (Ảnh hình vẽ minh họa tách từ tệp Word — dùng để đối chiếu đỉnh, góc, số đo trên hình):`,
        });
        contents.push({
          inlineData: {
            mimeType: fig.mimeType || 'image/jpeg',
            data: fig.imageBase64.slice(0, 800_000),
          },
        });
      }
    }
  }

  const combinedTextInput = [trimmedText, pageTextParts.join('\n\n')]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 26000);

  contents.push({
    text: `${APPENDIX_B_SYSTEM_PROMPT}\n\n${modeNote}\n\nDANH MỤC DẠNG (taxonomy):\n${taxonomySummary}\n\nNguồn tài liệu: ${String(sourceName).slice(0, 140)}${driveFileId ? ` (Drive ID: ${String(driveFileId).slice(0, 80)})` : ''}\n\nVăn bản trích xuất (nếu có):\n${combinedTextInput || '(Đọc trực tiếp từ các ảnh trang đính kèm ở trên)'}`,
  });

  const requestedModel = useHardPageModel
    ? (modelOverride.trim() || AI_HARD_PAGE_MODEL)
    : (modelOverride.trim() || AI_MODEL);
  const modelChain = await resolveLiveModelChain(requestedModel, useHardPageModel, keyRes.apiKey);

  const runWithFallbackChain = async (parts: Array<Record<string, unknown>>) => {
    const errors: string[] = [];
    for (const modelName of modelChain) {
      try {
        const resp = await ai.models.generateContent({
          model: modelName,
          contents: [{role: 'user', parts}],
          config: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        });
        const textOut = resp.text ?? '';
        if (textOut.trim()) {
          return {text: textOut, usedModel: modelName};
        }
        errors.push(`${modelName}: phản hồi rỗng`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[api/ai/extract] Model ${modelName} failed:`, msg);
        if (/503|unavailable|high demand|overloaded|429|resource_exhausted/i.test(msg)) {
          markModelTemporarilyUnavailable(modelName);
        }
        errors.push(`${modelName}: ${msg.slice(0, 140)}`);
        // If API key itself is invalid/unauthorized, stop trying other models immediately
        if (/api key|permission_denied|unauthenticated/i.test(msg)) {
          throw new Error(msg);
        }
      }
    }
    throw new Error(errors.join(' | ') || 'All Gemini models failed');
  };

  try {
    let {text: rawJson, usedModel} = await runWithFallbackChain(contents);

    // Parse with 1 automatic JSON-repair retry if malformed
    let parsed: {items?: Array<Record<string, unknown>>; answer_key?: Array<Record<string, unknown>>};
    try {
      parsed = parseJsonLoose(rawJson) as typeof parsed;
    } catch {
      const repairParts = [
        {
          text: `Đoạn JSON dưới đây bị lỗi cú pháp. Hãy sửa lại thành JSON hợp lệ dạng {"items": [...], "answer_key": [...]}, chỉ trả về JSON thuần:\n\n${rawJson.slice(0, 22000)}`,
        },
      ];
      const repaired = await runWithFallbackChain(repairParts);
      rawJson = repaired.text;
      usedModel = repaired.usedModel;
      parsed = parseJsonLoose(rawJson) as typeof parsed;
    }

    const rawItems = Array.isArray(parsed.items)
      ? parsed.items
      : Array.isArray((parsed as {questions?: unknown[]}).questions)
        ? ((parsed as {questions: Array<Record<string, unknown>>}).questions)
        : [];
    const rawAnswerKeys = Array.isArray(parsed.answer_key) ? parsed.answer_key : [];

    const cleanedItems = rawItems.map((item) => {
      const pagePdf = typeof item.page_pdf === 'number' && item.page_pdf > 0 ? Math.round(item.page_pdf) : validPages[0]?.pagePdf;
      const figIdx =
        typeof item.figure_image_index === 'number' && Number.isFinite(item.figure_image_index) && item.figure_image_index >= 1
          ? Math.round(item.figure_image_index)
          : undefined;
      return {
        ...item,
        stem_latex: fixLatexControlChars(item.stem_latex ?? item.stem_vi).replace(/\s*\[HÌNH_VẼ_\d+\]\s*/g, ' ').trim(),
        solution_vi: fixLatexControlChars(item.solution_vi),
        source_excerpt: fixLatexControlChars(item.source_excerpt),
        figure_bbox: normalizeFigureBBox(item.figure_bbox, pagePdf),
        figure_image_index: figIdx,
        hints_vi: Array.isArray(item.hints_vi)
          ? item.hints_vi.map((h) => fixLatexControlChars(h))
          : [],
        options: Array.isArray(item.options)
          ? item.options.map((o) =>
              typeof o === 'string'
                ? {key: '', text: fixLatexControlChars(o)}
                : {
                    key: String((o as Record<string, unknown>).key ?? ''),
                    text: fixLatexControlChars((o as Record<string, unknown>).text ?? (o as Record<string, unknown>).label),
                  },
            )
          : undefined,
        statements: Array.isArray(item.statements)
          ? item.statements.map((s) => ({
              key: String((s as Record<string, unknown>).key ?? (s as Record<string, unknown>).id ?? ''),
              text: fixLatexControlChars((s as Record<string, unknown>).text ?? (s as Record<string, unknown>).label),
              is_true:
                typeof (s as Record<string, unknown>).is_true === 'boolean'
                  ? Boolean((s as Record<string, unknown>).is_true)
                  : typeof (s as Record<string, unknown>).isTrue === 'boolean'
                    ? Boolean((s as Record<string, unknown>).isTrue)
                    : undefined,
            }))
          : undefined,
      };
    });

    const cleanedKeys = rawAnswerKeys.map((ak) => ({
      number: String(ak.number ?? '').trim(),
      part: ak.part ? String(ak.part).trim().toUpperCase() : null,
      examCode: ak.examCode ? String(ak.examCode).trim() : undefined,
      answer: fixLatexControlChars(ak.answer).trim(),
      solution_vi: ak.solution_vi ? fixLatexControlChars(ak.solution_vi).trim() : undefined,
      pagePdf: typeof ak.page_pdf === 'number' ? ak.page_pdf : undefined,
    }));

    return jsonResponse({
      promptVersion: PROMPT_VERSION,
      model: usedModel,
      usingPersonalKey: keyRes.usingPersonalKey,
      items: cleanedItems,
      answer_key: cleanedKeys,
      quota: {
        used: quota.used,
        limit: quota.limit,
        remaining: Math.max(0, quota.limit - quota.used),
        date: quota.date,
      },
    });
  } catch (err) {
    const refunded = keyRes.usingPersonalKey
      ? {used: 0, date: quota.date}
      : refundQuota();
    const rawErr = err instanceof Error ? err.message : String(err);
    console.error('[api/ai/extract] All models failed:', rawErr);
    return jsonResponse(
      {
        error: summarizeProviderError(rawErr, keyRes.usingPersonalKey),
        diagnostic: rawErr.slice(0, 240),
        fallbackToManual: true,
        quota: {
          used: refunded.used,
          limit: quota.limit,
          remaining: Math.max(0, quota.limit - refunded.used),
          date: refunded.date,
        },
      },
      502,
    );
  }
}

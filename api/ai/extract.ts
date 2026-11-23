import {
  AI_HARD_PAGE_MODEL,
  AI_MODEL,
  checkAndConsumeQuota,
  DAILY_QUOTA_DEFAULT,
  fixLatexControlChars,
  getGenAIClient,
  jsonResponse,
  PROMPT_VERSION,
  refundQuota,
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

interface ExtractBody {
  text?: string;
  pages?: ExtractPageInput[];
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
(1) Chỉ dựa vào nội dung đang thấy, KHÔNG bịa đề hay tự sửa số liệu; chỗ không chắc ghi vào flags ("formula_uncertain", "figure_missing", "cut_off_at_page_end", "cut_off_at_page_start") và hạ confidence. Thiếu đáp án -> expected_answer_key="", expected_numeric=null, thêm cờ "missing_answer".
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
(5) Nếu đề nhắc "như hình", "hình dưới", "hình vẽ": đặt needs_figure=true; ưu tiên figure_spec, nếu không mô tả được điền figure_bbox {"page":1,"x":0.1,"y":0.2,"w":0.4,"h":0.3}.
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

function summarizeProviderError(rawMsg: string): string {
  const m = rawMsg.toLowerCase();
  const safeSnippet = rawMsg
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[KEY]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (m.includes('api key') || m.includes('permission_denied') || m.includes('403') || m.includes('401')) {
    return `Khóa GEMINI_API_KEY trên Vercel không hợp lệ hoặc bị hạn chế quyền. (${safeSnippet})`;
  }
  if (m.includes('resource_exhausted') || m.includes('quota') || m.includes('429')) {
    return `Tài khoản Google AI Studio (GEMINI_API_KEY) tạm chạm giới hạn tốc độ / hạn mức (429). Hãy chờ 1 phút rồi thử lại. (${safeSnippet})`;
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
  const auth = await verifyRequestAuth(request, {requireStaff: true});
  if (!auth.ok) {
    return jsonResponse({error: auth.error}, auth.status);
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

  const ai = getGenAIClient();
  if (!ai) {
    return jsonResponse(
      {
        error: 'Máy chủ chưa cấu hình GEMINI_API_KEY. Hãy chuyển sang nhập tay hoặc nhập tệp JSON chuẩn.',
        fallbackToManual: true,
      },
      503,
    );
  }

  const quota = checkAndConsumeQuota(maxDaily);
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
  const modelChain = await resolveLiveModelChain(requestedModel, useHardPageModel);

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
        errors.push(`${modelName}: ${msg.slice(0, 160)}`);
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

    const cleanedItems = rawItems.map((item) => ({
      ...item,
      stem_latex: fixLatexControlChars(item.stem_latex ?? item.stem_vi),
      solution_vi: fixLatexControlChars(item.solution_vi),
      source_excerpt: fixLatexControlChars(item.source_excerpt),
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
    }));

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
    const refunded = refundQuota();
    const rawErr = err instanceof Error ? err.message : String(err);
    console.error('[api/ai/extract] All models failed:', rawErr);
    return jsonResponse(
      {
        error: summarizeProviderError(rawErr),
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

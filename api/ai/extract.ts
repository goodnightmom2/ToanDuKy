import {ThinkingLevel, Type} from '@google/genai';
import {
  AI_FALLBACK_MODEL,
  AI_HARD_PAGE_MODEL,
  AI_MODEL,
  checkAndConsumeQuota,
  DAILY_QUOTA_DEFAULT,
  fixLatexControlChars,
  getGenAIClient,
  jsonResponse,
  PROMPT_VERSION,
  refundQuota,
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

const APPENDIX_B_SYSTEM_PROMPT = `Bạn là trợ lý số hóa đề Toán THPT Việt Nam (${PROMPT_VERSION}). Bạn nhận ảnh và/hoặc văn bản của 1–3 trang PDF. Hãy tách TỪNG câu hỏi và chỉ trả về JSON đúng lược đồ, không thêm giải thích hay markdown.
Quy tắc:
(1) Chỉ dựa vào nội dung đang thấy, không bịa đề, số liệu hay đáp án; chỗ không chắc thì ghi vào flags ("formula_uncertain", "figure_missing", "cut_off_at_page_end", "cut_off_at_page_start") và hạ confidence. Nếu thiếu đáp án thì để expected_answer_key="" và expected_numeric=null, thêm cờ "missing_answer".
(2) Công thức viết bằng LaTeX trong $...$; giữ nguyên số, đơn vị, ký hiệu góc.
(3) Nhận diện part ("I", "II", "III" hoặc ""), type ("mcq", "true_false_multi", "short_numeric", "matching", "fill_relation", "error_spot", "open_explain"), number (ví dụ "1", "17"), và nếu có tiêu đề "Dạng n ..." thì ghi vào source_pattern_label.
(4) Trắc nghiệm: mỗi lựa chọn một phần tử options[{key, text}] (A, B, C, D); đúng/sai nhiều ý: mỗi ý a, b, c, d một phần tử statements[{key, text}].
(5) Nếu đề nhắc "như hình", "hình dưới", "hình vẽ": đặt needs_figure=true; ưu tiên mô tả hình thành figure_spec (đỉnh, cạnh, góc, nhãn), nếu không mô tả được thì điền figure_bbox (page, x, y, w, h trong khoảng 0..1).
(6) Với câu thuộc dạng có công thức Chương III, trích givens (a, b, c, A_deg, B_deg, C_deg, R, r, S, d, alpha_deg, beta_deg, trig_fn, trig_value, quadrant, target, unit, decimal_places, v1, v2, t, value, fromUnit, toUnit) để máy tự giải lại kiểm chứng.
(7) Phân loại bằng danh mục dạng (taxonomy) kèm theo: trả topic ("NEN"|"LG"|"COS"|"SIN"|"DT"|"MH"|"OUT"), pattern_id, level (1–4), skill_ids, anticipated_error_ids (E01–E12), hints_vi đúng 2 mức (mức 1 TUYỆT ĐỐI không lộ đáp án), confidence (0..1), ai_reason. Câu không thuộc Chương III "Hệ thức lượng trong tam giác" (vd: mệnh đề, tập hợp, bất phương trình, hàm số...) đặt topic="OUT", pattern_id="OUT-00". Nếu thuộc Chương III nhưng chưa khớp dạng nào thì đặt pattern_id="" và điền proposed_pattern (tên dạng mới đề xuất).
(8) Chỉ trang chứa "Đáp án / Lời giải / Hướng dẫn giải" mới trả answer_key: danh sách {number, part, examCode, answer, solution_vi}.
(9) Câu bị cắt giữa hai trang: trả phần đang thấy và gắn cờ "cut_off_at_page_end" hoặc "cut_off_at_page_start".`;

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyRequestAuth(request, {requireStaff: true});
  if (!auth.ok) {
    return jsonResponse({error: auth.error, fallbackToManual: true}, auth.status);
  }

  let body: ExtractBody = {};
  try {
    body = (await request.json()) as ExtractBody;
  } catch {
    return jsonResponse({error: 'Dữ liệu JSON không hợp lệ.'}, 400);
  }

  const {
    text = '',
    pages = [],
    pdfBase64 = '',
    sourceName = 'Tài liệu tải lên',
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
      {
        error: 'Trợ lý AI đang tắt trong mục Cài đặt Quản trị. Hãy bật lại hoặc chuyển sang nhập tay.',
        fallbackToManual: true,
      },
      403,
    );
  }

  const trimmedText = typeof text === 'string' ? text.trim().slice(0, 28000) : '';
  const validPages = Array.isArray(pages) ? pages.slice(0, 4) : [];
  const hasPages = validPages.length > 0;
  const hasPdf = typeof pdfBase64 === 'string' && pdfBase64.length > 20;

  if (!trimmedText && !hasPages && !hasPdf) {
    return jsonResponse(
      {error: 'Vui lòng cung cấp văn bản, trang PDF hoặc tài liệu cần trích xuất.'},
      400,
    );
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
          'NEN-01 (NEN): Tổng ba góc',
          'NEN-02 (NEN): Cạnh đối diện góc',
          'NEN-03 (NEN): Hệ thức tam giác vuông, đổi đơn vị, làm tròn',
          'LG-01..LG-04 (LG): Giá trị lượng giác 0°–180°, góc bù, dấu góc tù, hệ thức sin²+cos²=1',
          'COS-01..COS-04 (COS): Định lí Côsin tìm cạnh, tìm góc, nhận dạng tam giác, thực tế',
          'SIN-01..SIN-03 (SIN): Định lí Sin tìm cạnh, tìm góc, bán kính ngoại tiếp R',
          'DT-01..DT-05 (DT): Diện tích ½bc·sinA, Heron, S=pr, S=abc/4R, thực tế',
          'MH-01..MH-06 (MH): Đo khoảng cách, đo chiều cao 2 góc ngắm, giải tam giác, chuyển động, tìm lỗi sai, tối ưu',
          'OUT-00 (OUT): Ngoài Chương III',
        ].join('\n');

  const modeNote =
    classificationMode === 'document_patterns'
      ? `Chế độ B (Theo dạng tài liệu/giáo viên): Ưu tiên giữ đúng nhãn "Dạng n ..." trong tài liệu vào source_pattern_label${
          customPatterns.length > 0 ? ` hoặc chọn từ danh sách giáo viên cung cấp: ${customPatterns.join('; ')}` : ''
        }, đồng thời vẫn gợi ý pattern_id gần nhất trong taxonomy web.`
      : 'Chế độ A (Theo danh mục dạng của web): Phân loại trực tiếp vào mã pattern_id trong danh mục taxonomy bên dưới.';

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
            data: pg.imageBase64!.slice(0, 2_500_000),
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
        data: pdfBase64.slice(0, 3_500_000),
      },
    });
  }

  const combinedTextInput = [trimmedText, pageTextParts.join('\n\n')]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 28000);

  contents.push({
    text: `${APPENDIX_B_SYSTEM_PROMPT}\n\n${modeNote}\n\nDANH MỤC DẠNG (taxonomy):\n${taxonomySummary}\n\nNguồn tài liệu: ${String(sourceName).slice(0, 140)}${driveFileId ? ` (Drive ID: ${String(driveFileId).slice(0, 80)})` : ''}\n\nVăn bản trích xuất (nếu có):\n${combinedTextInput || '(Đọc trực tiếp từ các ảnh trang đính kèm ở trên)'}`,
  });

  const extractSchema = {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            number: {type: Type.STRING},
            part: {type: Type.STRING},
            source_pattern_label: {type: Type.STRING},
            type: {type: Type.STRING},
            stem_latex: {type: Type.STRING},
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: {type: Type.STRING},
                  text: {type: Type.STRING},
                },
                required: ['key', 'text'],
              },
            },
            statements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: {type: Type.STRING},
                  text: {type: Type.STRING},
                  is_true: {type: Type.BOOLEAN},
                },
                required: ['key', 'text'],
              },
            },
            expected_answer_key: {type: Type.STRING},
            expected_numeric: {type: Type.NUMBER},
            decimal_places: {type: Type.INTEGER},
            unit: {type: Type.STRING},
            solution_vi: {type: Type.STRING},
            needs_figure: {type: Type.BOOLEAN},
            figure_spec: {
              type: Type.OBJECT,
              properties: {
                vertices: {type: Type.ARRAY, items: {type: Type.STRING}},
                description: {type: Type.STRING},
                sides: {
                  type: Type.OBJECT,
                  properties: {
                    a: {type: Type.NUMBER},
                    b: {type: Type.NUMBER},
                    c: {type: Type.NUMBER},
                    AB: {type: Type.STRING},
                    BC: {type: Type.STRING},
                    AC: {type: Type.STRING},
                  },
                },
                angles: {
                  type: Type.OBJECT,
                  properties: {
                    A: {type: Type.NUMBER},
                    B: {type: Type.NUMBER},
                    C: {type: Type.NUMBER},
                  },
                },
              },
            },
            figure_bbox: {
              type: Type.OBJECT,
              properties: {
                page: {type: Type.INTEGER},
                x: {type: Type.NUMBER},
                y: {type: Type.NUMBER},
                w: {type: Type.NUMBER},
                h: {type: Type.NUMBER},
              },
            },
            givens: {
              type: Type.OBJECT,
              properties: {
                a: {type: Type.NUMBER},
                b: {type: Type.NUMBER},
                c: {type: Type.NUMBER},
                A_deg: {type: Type.NUMBER},
                B_deg: {type: Type.NUMBER},
                C_deg: {type: Type.NUMBER},
                R: {type: Type.NUMBER},
                r: {type: Type.NUMBER},
                S: {type: Type.NUMBER},
                d: {type: Type.NUMBER},
                alpha_deg: {type: Type.NUMBER},
                beta_deg: {type: Type.NUMBER},
                trig_fn: {type: Type.STRING},
                trig_value: {type: Type.NUMBER},
                quadrant: {type: Type.STRING},
                target: {type: Type.STRING},
                unit: {type: Type.STRING},
                decimal_places: {type: Type.INTEGER},
                v1: {type: Type.NUMBER},
                v2: {type: Type.NUMBER},
                t: {type: Type.NUMBER},
                value: {type: Type.NUMBER},
                fromUnit: {type: Type.STRING},
                toUnit: {type: Type.STRING},
              },
            },
            topic: {type: Type.STRING},
            pattern_id: {type: Type.STRING},
            proposed_pattern: {type: Type.STRING},
            level: {type: Type.INTEGER},
            skill_ids: {type: Type.ARRAY, items: {type: Type.STRING}},
            anticipated_error_ids: {type: Type.ARRAY, items: {type: Type.STRING}},
            hints_vi: {type: Type.ARRAY, items: {type: Type.STRING}},
            confidence: {type: Type.NUMBER},
            ai_reason: {type: Type.STRING},
            flags: {type: Type.ARRAY, items: {type: Type.STRING}},
            page_pdf: {type: Type.INTEGER},
            page_print: {type: Type.STRING},
            source_excerpt: {type: Type.STRING},
          },
          required: [
            'type',
            'stem_latex',
            'topic',
            'level',
            'skill_ids',
            'anticipated_error_ids',
            'hints_vi',
            'confidence',
            'ai_reason',
          ],
        },
      },
      answer_key: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            number: {type: Type.STRING},
            part: {type: Type.STRING},
            examCode: {type: Type.STRING},
            answer: {type: Type.STRING},
            solution_vi: {type: Type.STRING},
            page_pdf: {type: Type.INTEGER},
          },
          required: ['number', 'answer'],
        },
      },
    },
    required: ['items'],
  };

  const primaryModel = useHardPageModel
    ? (modelOverride.trim() || AI_HARD_PAGE_MODEL)
    : (modelOverride.trim() || AI_MODEL);

  const runModelOnce = async (parts: Array<Record<string, unknown>>, modelName: string) => {
    try {
      const resp = await ai.models.generateContent({
        model: modelName,
        contents: {parts},
        config: {
          responseMimeType: 'application/json',
          responseSchema: extractSchema,
        },
      });
      return {text: resp.text ?? '{"items":[]}', usedModel: modelName};
    } catch (err) {
      console.warn('[api/ai/extract] Fallback model triggered:', err instanceof Error ? err.message : err);
      const fallback = modelName === AI_FALLBACK_MODEL ? AI_MODEL : AI_FALLBACK_MODEL;
      const resp = await ai.models.generateContent({
        model: fallback,
        contents: {parts},
        config: {
          responseMimeType: 'application/json',
          responseSchema: extractSchema,
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
        },
      });
      return {text: resp.text ?? '{"items":[]}', usedModel: fallback};
    }
  };

  try {
    let {text: rawJson, usedModel} = await runModelOnce(contents, primaryModel);

    // Parse with 1 automatic JSON-repair retry if invalid (Section 3.1)
    let parsed: {items?: Array<Record<string, unknown>>; answer_key?: Array<Record<string, unknown>>};
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      const repairParts = [
        {
          text: `Đoạn JSON dưới đây bị lỗi cú pháp. Hãy sửa lại thành JSON hợp lệ đúng lược đồ {items: [...], answer_key: [...]}, không thêm markdown hay giải thích:\n\n${rawJson.slice(0, 24000)}`,
        },
      ];
      const repaired = await runModelOnce(repairParts, AI_MODEL);
      rawJson = repaired.text;
      usedModel = repaired.usedModel;
      parsed = JSON.parse(rawJson);
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
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
                  text: fixLatexControlChars((o as Record<string, unknown>).text),
                },
          )
        : undefined,
      statements: Array.isArray(item.statements)
        ? item.statements.map((s) => ({
            key: String((s as Record<string, unknown>).key ?? ''),
            text: fixLatexControlChars((s as Record<string, unknown>).text),
            is_true:
              typeof (s as Record<string, unknown>).is_true === 'boolean'
                ? Boolean((s as Record<string, unknown>).is_true)
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
    // Do NOT deduct quota on network / model error (Section 2.5)
    const refunded = refundQuota();
    console.error('[api/ai/extract] Error:', err);
    return jsonResponse(
      {
        error: 'Hệ thống AI tạm thời không phản hồi cho nhóm trang này. Bạn có thể bấm "Thử lại trang này" hoặc chuyển sang nhập tay.',
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

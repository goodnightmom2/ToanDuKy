import {ThinkingLevel, Type} from '@google/genai';
import {
  AI_FALLBACK_MODEL,
  AI_MODEL,
  checkAndConsumeQuota,
  DAILY_QUOTA_DEFAULT,
  fixLatexControlChars,
  getGenAIClient,
  jsonResponse,
  verifyRequestAuth,
} from '../_shared.ts';

interface ExtractPageInput {
  pagePdf: number;
  pagePrinted?: string;
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}

interface ExtractBody {
  text?: string;
  pages?: ExtractPageInput[];
  pdfBase64?: string;
  sourceName?: string;
  driveFileId?: string;
  maxDaily?: number;
  aiEnabled?: boolean;
}

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
  const validPages = Array.isArray(pages) ? pages.slice(0, 8) : [];
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
        error: `Đã hết hạn mức AI trong ngày (${quota.used}/${quota.limit} lượt). Vui lòng chuyển sang nhập tay hoặc tăng hạn mức trong Cài đặt.`,
        quotaExceeded: true,
        fallbackToManual: true,
        quota: {...quota, remaining: 0},
      },
      429,
    );
  }

  const instruction = [
    'Bạn là giáo viên Toán 10 THPT Việt Nam biên soạn học liệu cho game "Toán Du Ký" — CHỈ thuộc Chương III "Hệ thức lượng trong tam giác" (bộ Kết nối tri thức với cuộc sống).',
    'Nhiệm vụ: Trích xuất tối đa 8 câu hỏi Toán Chương III từ tài liệu bên dưới thành JSON chuẩn theo schema.',
    'QUY TẮC BẮT BUỘC:',
    '1. CHUYỂN THỂ (không chép nguyên văn dài): Viết lại đề ngắn gọn, rõ ràng theo ngữ cảnh khảo sát/đo đạc phù hợp học sinh lớp 10; chỉ giữ 1 đoạn trích ngắn (source_excerpt <= 180 ký tự) từ bản gốc để giáo viên đối chiếu.',
    '2. PHÂN LOẠI CHÍNH XÁC:',
    '   - cluster: CHỈ dùng 1 trong 6 mã: NEN (tổng góc, cặp cạnh-góc đối, đổi đơn vị, làm tròn), LG (giá trị lượng giác góc 0°–180°), COS (định lý côsin), SIN (định lý sin), DT (diện tích tam giác, Heron, bán kính R/r), MH (ứng dụng đo đạc thực tế).',
    '   - level: 1 (nền tảng), 2 (chuẩn), 3 (vận dụng), 4 (nâng cao/BOSS).',
    '   - type: "numeric" (ưu tiên cho bài tính toán ra số) hoặc "mcq" (nếu câu hỏi khái niệm/trắc nghiệm có 4 phương án khác nhau).',
    '   - stationId: NEN/LG -> "QS01", COS -> "DD01", SIN/MH -> "BS01", DT -> "KV01", tổng hợp -> "HT01".',
    '   - skill_ids: mảng kỹ năng tiếng Anh ngắn (vd: ["cosine_law"], ["sine_law", "rounding"], ["area_heron"], ["angle_sum"]).',
    '   - anticipated_error_ids: chọn mã lỗi phù hợp trong E01–E12.',
    '3. GỢI Ý 2 MỨC (hints_vi — đúng 2 phần tử):',
    '   - hints_vi[0] (Mức 1): định hướng bước đầu, TUYỆT ĐỐI KHÔNG lộ đáp án số hay kết quả cuối.',
    '   - hints_vi[1] (Mức 2): chỉ rõ công thức/phép biến đổi cần áp dụng.',
    '4. TÍNH TOÁN & THAM SỐ KIỂM CHỨNG CODE (math_params):',
    '   - Với mọi câu có đáp án số (numericAnswer), tính cẩn thận theo ĐƠN VỊ ĐỘ (DEG), giữ đủ chữ số trung gian rồi mới làm tròn đến decimalPlaces.',
    '   - Điền math_params.kind ("angle_sum" | "sine_law_side" | "cosine_law_side" | "cosine_law_angle" | "area_sas" | "area_heron" | "circumradius" | "ratio_solve" | "unit_convert" | "rounding" | "trig_expr" | "other") và các tham số số a, b, c, angleA, angleB, angleC, value, fromUnit, toUnit, decimalPlaces, expr để phần mềm tự giải lại bằng code kiểm tra lệch đáp án.',
    '5. ĐIỀN ĐẦY ĐỦ: confidence (0.0 đến 1.0), ai_reason (lý do phân loại & chuyển thể ngắn gọn), page_pdf (số trang PDF nếu có trong dấu [Trang PDF X]), page_printed (số trang in nếu có).',
    '6. KHÔNG gán công thức Toán cho nhân vật lịch sử. Số liệu thực tế ghi rõ là mô phỏng học tập. Dùng tiếng Việt có dấu chuẩn, công thức LaTeX gọn trong $...$.',
  ].join('\n');

  const contents: Array<Record<string, unknown>> = [];
  const pageTextParts: string[] = [];

  if (hasPages) {
    for (const pg of validPages) {
      const header = `[Trang PDF ${pg.pagePdf}${pg.pagePrinted ? ` | Trang in ${pg.pagePrinted}` : ''}]`;
      if (pg.imageBase64 && pg.imageBase64.length > 50) {
        contents.push({
          text: `${header} (Trang ảnh quét — hãy đọc nội dung Toán trong ảnh sau):`,
        });
        contents.push({
          inlineData: {
            mimeType: pg.mimeType || 'image/jpeg',
            data: pg.imageBase64.slice(0, 3_000_000),
          },
        });
      } else if (pg.text && pg.text.trim()) {
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
    text: `${instruction}\n\nNguồn tài liệu: ${String(sourceName).slice(0, 140)}${driveFileId ? ` (Drive ID: ${String(driveFileId).slice(0, 80)})` : ''}\n\nNội dung:\n${combinedTextInput || '(Xem các trang ảnh quét đính kèm ở trên)'}`,
  });

  const extractConfig = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              cluster: {type: Type.STRING},
              level: {type: Type.INTEGER},
              type: {type: Type.STRING},
              stationId: {type: Type.STRING},
              skill_ids: {type: Type.ARRAY, items: {type: Type.STRING}},
              stem_vi: {type: Type.STRING},
              options: {type: Type.ARRAY, items: {type: Type.STRING}},
              correctOptionIndex: {type: Type.INTEGER},
              numericAnswer: {type: Type.NUMBER},
              decimalPlaces: {type: Type.INTEGER},
              unit: {type: Type.STRING},
              solution_vi: {type: Type.STRING},
              hints_vi: {type: Type.ARRAY, items: {type: Type.STRING}},
              anticipated_error_ids: {type: Type.ARRAY, items: {type: Type.STRING}},
              confidence: {type: Type.NUMBER},
              ai_reason: {type: Type.STRING},
              source_excerpt: {type: Type.STRING},
              page_pdf: {type: Type.INTEGER},
              page_printed: {type: Type.STRING},
              source_ref: {type: Type.STRING},
              math_params: {
                type: Type.OBJECT,
                properties: {
                  kind: {type: Type.STRING},
                  a: {type: Type.NUMBER},
                  b: {type: Type.NUMBER},
                  c: {type: Type.NUMBER},
                  angleA: {type: Type.NUMBER},
                  angleB: {type: Type.NUMBER},
                  angleC: {type: Type.NUMBER},
                  value: {type: Type.NUMBER},
                  fromUnit: {type: Type.STRING},
                  toUnit: {type: Type.STRING},
                  decimalPlaces: {type: Type.INTEGER},
                  expr: {type: Type.STRING},
                },
              },
            },
            required: [
              'cluster',
              'level',
              'type',
              'stationId',
              'skill_ids',
              'stem_vi',
              'solution_vi',
              'hints_vi',
              'anticipated_error_ids',
              'confidence',
              'ai_reason',
              'source_excerpt',
            ],
          },
        },
      },
      required: ['items'],
    },
  };

  try {
    let usedModel = AI_MODEL;
    let response;
    try {
      response = await ai.models.generateContent({
        model: AI_MODEL,
        contents: {parts: contents},
        config: extractConfig,
      });
    } catch (primaryErr) {
      console.warn(
        '[api/ai/extract] Primary model fallback:',
        primaryErr instanceof Error ? primaryErr.message : primaryErr,
      );
      usedModel = AI_FALLBACK_MODEL;
      response = await ai.models.generateContent({
        model: usedModel,
        contents: {parts: contents},
        config: {
          ...extractConfig,
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
        },
      });
    }

    const raw = response.text ?? '{"items":[]}';
    const parsed = JSON.parse(raw) as {items?: Array<Record<string, unknown>>};
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return jsonResponse({
      model: usedModel,
      items: items.map((item) => ({
        ...item,
        stem_vi: fixLatexControlChars(item.stem_vi),
        solution_vi: fixLatexControlChars(item.solution_vi),
        source_excerpt: fixLatexControlChars(item.source_excerpt),
        hints_vi: Array.isArray(item.hints_vi)
          ? item.hints_vi.map((h) => fixLatexControlChars(h))
          : [],
        options: Array.isArray(item.options)
          ? item.options.map((o) => fixLatexControlChars(o))
          : undefined,
        review_status: 'pending_teacher_review',
        is_adapted: true,
      })),
      quota: {
        used: quota.used,
        limit: quota.limit,
        remaining: Math.max(0, quota.limit - quota.used),
        date: quota.date,
      },
    });
  } catch (err) {
    console.error('[api/ai/extract] Error:', err);
    const message = err instanceof Error ? err.message : 'Lỗi gọi dịch vụ AI.';
    return jsonResponse(
      {
        error: `Không trích xuất được bằng AI (${message}). Giáo viên có thể chuyển sang nhập tay ngay bên dưới.`,
        fallbackToManual: true,
        quota: {
          used: quota.used,
          limit: quota.limit,
          remaining: Math.max(0, quota.limit - quota.used),
          date: quota.date,
        },
      },
      502,
    );
  }
}

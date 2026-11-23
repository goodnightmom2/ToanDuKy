import {ThinkingLevel, Type} from '@google/genai';
import {
  AI_FALLBACK_MODEL,
  AI_MODEL,
  checkAndConsumeQuota,
  DAILY_QUOTA_DEFAULT,
  fixLatexControlChars,
  getGenAIClient,
  jsonResponse,
  refundQuota,
  verifyRequestAuth,
} from '../_shared.ts';

interface AnswerKeyPageInput {
  pagePdf: number;
  pagePrinted?: string;
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}

interface AnswerKeyBody {
  pages?: AnswerKeyPageInput[];
  text?: string;
  maxDaily?: number;
  aiEnabled?: boolean;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyRequestAuth(request, {requireStaff: true});
  if (!auth.ok) {
    return jsonResponse({error: auth.error}, auth.status);
  }

  let body: AnswerKeyBody = {};
  try {
    body = (await request.json()) as AnswerKeyBody;
  } catch {
    return jsonResponse({error: 'Dữ liệu JSON không hợp lệ.'}, 400);
  }

  const {pages = [], text = '', maxDaily = DAILY_QUOTA_DEFAULT, aiEnabled = true} = body;
  if (!aiEnabled) {
    return jsonResponse({error: 'Trợ lý AI đang tắt trong Cài đặt.'}, 403);
  }

  const validPages = Array.isArray(pages) ? pages.slice(0, 4) : [];
  const trimmedText = typeof text === 'string' ? text.trim().slice(0, 20000) : '';
  if (validPages.length === 0 && !trimmedText) {
    return jsonResponse({error: 'Chưa có trang bảng đáp án / lời giải.'}, 400);
  }

  const ai = getGenAIClient();
  if (!ai) {
    return jsonResponse({error: 'Máy chủ chưa cấu hình GEMINI_API_KEY.'}, 503);
  }

  const quota = checkAndConsumeQuota(maxDaily);
  if (!quota.ok) {
    return jsonResponse(
      {
        error: `Đã hết hạn mức AI trong ngày (${quota.used}/${quota.limit} lượt).`,
        quotaExceeded: true,
        quota: {...quota, remaining: 0},
      },
      429,
    );
  }

  const prompt = [
    'Bạn là trợ lý trích xuất BẢNG ĐÁP ÁN và LỜI GIẢI từ trang cuối đề thi Toán THPT Việt Nam.',
    'Hãy đọc kỹ mọi bảng đáp án (kể cả bảng ngang dạng "Câu 17 18 19 20 21 22 | A B C D...", bảng Phần I trắc nghiệm, Phần II Đúng/Sai a-Đ b-S c-Đ d-S, Phần III trả lời ngắn, hoặc hướng dẫn giải chi tiết).',
    'Nếu tài liệu có nhiều mã đề (vd: Mã đề 101, Mã đề 102), ghi rõ mã đề vào trường examCode và liệt kê tất cả vào examCodes.',
    'Với phần II đúng/sai, định dạng answer dạng "a:Đ,b:S,c:Đ,d:S". Với phần I trả "A"|"B"|"C"|"D". Với phần III trả số (vd "55,3").',
    'Chỉ trả JSON theo lược đồ, không bịa đáp án nếu không nhìn thấy.',
  ].join('\n');

  const parts: Array<Record<string, unknown>> = [];
  const textChunks: string[] = [];

  for (const pg of validPages) {
    const header = `[Trang PDF ${pg.pagePdf}${pg.pagePrinted ? ` | Trang in ${pg.pagePrinted}` : ''}]`;
    if (pg.imageBase64 && pg.imageBase64.length > 50) {
      parts.push({text: `${header} (Ảnh bảng đáp án / lời giải):`});
      parts.push({
        inlineData: {
          mimeType: pg.mimeType || 'image/jpeg',
          data: pg.imageBase64.slice(0, 2_500_000),
        },
      });
    }
    if (pg.text && pg.text.trim()) {
      textChunks.push(`${header}\n${pg.text.trim()}`);
    }
  }
  if (trimmedText) textChunks.push(trimmedText);
  parts.push({text: `${prompt}\n\nVăn bản trang đáp án:\n${textChunks.join('\n\n').slice(0, 20000)}`});

  const schema = {
    type: Type.OBJECT,
    properties: {
      examCodes: {type: Type.ARRAY, items: {type: Type.STRING}},
      entries: {
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
    required: ['entries'],
  };

  try {
    let response;
    try {
      response = await ai.models.generateContent({
        model: AI_MODEL,
        contents: {parts},
        config: {responseMimeType: 'application/json', responseSchema: schema},
      });
    } catch {
      response = await ai.models.generateContent({
        model: AI_FALLBACK_MODEL,
        contents: {parts},
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
        },
      });
    }

    const parsed = JSON.parse(response.text ?? '{"entries":[]}') as {
      examCodes?: string[];
      entries?: Array<Record<string, unknown>>;
    };

    const entries = (Array.isArray(parsed.entries) ? parsed.entries : []).map((e) => ({
      number: String(e.number ?? '').trim(),
      part: e.part ? (String(e.part).trim().toUpperCase() as 'I' | 'II' | 'III') : null,
      examCode: e.examCode ? String(e.examCode).trim() : undefined,
      answer: fixLatexControlChars(e.answer).trim(),
      solution_vi: e.solution_vi ? fixLatexControlChars(e.solution_vi).trim() : undefined,
      pagePdf: typeof e.page_pdf === 'number' ? e.page_pdf : undefined,
    }));

    const examCodes = Array.from(
      new Set([
        ...(Array.isArray(parsed.examCodes) ? parsed.examCodes.map((c) => String(c).trim()).filter(Boolean) : []),
        ...entries.map((e) => e.examCode).filter((c): c is string => Boolean(c)),
      ]),
    );

    return jsonResponse({
      examCodes,
      entries,
      quota: {
        used: quota.used,
        limit: quota.limit,
        remaining: Math.max(0, quota.limit - quota.used),
        date: quota.date,
      },
    });
  } catch (err) {
    const refunded = refundQuota();
    console.error('[api/ai/answer-key] Error:', err);
    return jsonResponse(
      {
        error: 'Chưa đọc được bảng đáp án tự động. Bạn có thể tự điền đáp án khi duyệt câu hỏi.',
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

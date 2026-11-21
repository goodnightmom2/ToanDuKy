import {
  AI_MODEL,
  checkAndConsumeQuota,
  DAILY_QUOTA_DEFAULT,
  getGenAIClient,
  jsonResponse,
} from '../_shared.ts';

interface ReviewOpenBody {
  stem?: string;
  expectedSolution?: string;
  studentExplanation?: string;
  maxDaily?: number;
}

export async function POST(request: Request): Promise<Response> {
  let body: ReviewOpenBody = {};
  try {
    body = (await request.json()) as ReviewOpenBody;
  } catch {
    return jsonResponse({error: 'Dữ liệu JSON không hợp lệ.'}, 400);
  }

  const {
    stem = '',
    expectedSolution = '',
    studentExplanation = '',
    maxDaily = DAILY_QUOTA_DEFAULT,
  } = body;

  const explanation =
    typeof studentExplanation === 'string' ? studentExplanation.trim().slice(0, 1500) : '';
  if (!explanation) {
    return jsonResponse({error: 'Thiếu phần giải thích của học viên.'}, 400);
  }

  const ai = getGenAIClient();
  if (!ai) {
    return jsonResponse({
      comment_vi:
        'Phần giải thích của em đã được ghi nhận để giáo viên đọc trực tiếp. Hãy kiểm tra lại bước lập luận và đơn vị đo nhé.',
      needs_teacher_review: true,
    });
  }

  const quota = checkAndConsumeQuota(maxDaily);
  if (!quota.ok) {
    return jsonResponse({
      comment_vi:
        'Đã hết lượt gợi ý AI trong ngày. Bài giải thích của em đã được lưu để giáo viên xem.',
      needs_teacher_review: true,
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: [
        'Bạn là giáo viên Toán lớp 10 thân thiện. Hãy nhận xét NGẮN GỌN (tối đa 2 câu) bằng tiếng Việt về lập luận mở của học viên.',
        'Nguyên tắc: KHÔNG chê bai, KHÔNG dùng từ yếu/kém/mất gốc, KHÔNG chấm lại đáp án số. Chỉ nêu 1 điểm hợp lý cụ thể và 1 gợi ý kiểm tra nếu thiếu ý.',
        `Đề bài: ${String(stem).slice(0, 600)}`,
        `Gợi ý lời giải chuẩn: ${String(expectedSolution).slice(0, 600)}`,
        `Lập luận học viên: ${explanation}`,
      ].join('\n'),
    });

    return jsonResponse({
      comment_vi:
        (response.text ?? '').trim() || 'Đã ghi nhận lập luận của em để giáo viên duyệt.',
      needs_teacher_review: true,
      quota,
    });
  } catch (err) {
    console.error('[api/ai/review-open] Error:', err);
    return jsonResponse({
      comment_vi: 'Lập luận của em đã được lưu an toàn để giáo viên xem và phản hồi.',
      needs_teacher_review: true,
    });
  }
}

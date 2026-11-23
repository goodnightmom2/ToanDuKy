import {
  AI_MODEL,
  checkAndConsumeQuota,
  DAILY_QUOTA_DEFAULT,
  getGenAIClient,
  jsonResponse,
  resolveLiveModelChain,
  verifyRequestAuth,
} from '../_shared.ts';

interface ReviewOpenBody {
  stem?: string;
  expectedSolution?: string;
  studentExplanation?: string;
  maxDaily?: number;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyRequestAuth(request);
  if (!auth.ok) {
    return jsonResponse({error: auth.error}, auth.status);
  }

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
      aiConfigured: false,
      comment_vi:
        '1. Điểm em làm đúng: Em đã trình bày lập luận riêng bằng ngôn ngữ của mình.\n2. Chỗ cần xem lại: Kiểm tra lại điều kiện góc (độ DEG), dấu của cos góc tù và đơn vị kết quả.\n3. Gợi ý bước tiếp theo: Hệ thống AI chưa nạp khóa trên máy chủ; bài lập luận đã được lưu để giáo viên góp ý trực tiếp.',
      needs_teacher_review: true,
    });
  }

  const quota = checkAndConsumeQuota(maxDaily);
  if (!quota.ok) {
    return jsonResponse({
      aiConfigured: true,
      comment_vi:
        'Đã hết lượt gợi ý AI trong ngày. Bài giải thích của em đã được lưu để giáo viên xem.',
      needs_teacher_review: true,
    });
  }

  try {
    const liveModels = await resolveLiveModelChain(AI_MODEL, false);
    const chosenModel = liveModels[0] ?? AI_MODEL;
    const response = await ai.models.generateContent({
      model: chosenModel,
      contents: [
        'Bạn là giáo viên Toán lớp 10 thân thiện. Hãy nhận xét lập luận mở của học sinh bằng tiếng Việt theo ĐÚNG 3 mục ngắn gọn (mỗi mục 1 câu):',
        '1. Điểm em làm đúng: ...',
        '2. Chỗ cần xem lại: ...',
        '3. Gợi ý bước tiếp theo: ...',
        'Nguyên tắc: KHÔNG chê bai, KHÔNG dùng từ yếu/kém/mất gốc, KHÔNG chấm lại đáp án số.',
        `Đề bài: ${String(stem).slice(0, 600)}`,
        `Gợi ý lời giải chuẩn: ${String(expectedSolution).slice(0, 600)}`,
        `Lập luận học viên: ${explanation}`,
      ].join('\n'),
    });

    return jsonResponse({
      aiConfigured: true,
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

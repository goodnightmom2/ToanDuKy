import {
  getGenAIClient,
  jsonResponse,
  markModelTemporarilyUnavailable,
  PROMPT_VERSION,
  resolveApiKeyForCaller,
  resolveLiveModelChain,
  verifyRequestAuth,
} from '../_shared.ts';

interface CandidateQuestionMeta {
  id: string;
  cluster: string;
  pattern_id?: string | null;
  level: number;
  type: string;
  errorIds: string[];
  stemPreview: string;
}

interface RecommendBody {
  studentCode: string; // Anonymized student code ONLY (never real name!)
  currentMoc?: number;
  errorCounts: Record<string, number>;
  skillSummary: Array<{
    cluster: string;
    state: string;
    verifyCorrect: number;
    practiceCorrect: number;
    totalAttempts: number;
  }>;
  candidates: CandidateQuestionMeta[];
}

const VALID_GENERATORS = [
  'GEN_COS_SIDE',
  'GEN_COS_ANGLE',
  'GEN_SIN_SIDE',
  'GEN_SIN_R',
  'GEN_AREA_SAS',
  'GEN_AREA_HERON',
  'GEN_HEIGHT',
  'GEN_TRIG_VALUES',
  'GEN_ANGLE_SUM',
  'GEN_OPP_PAIR',
  'GEN_UNITS',
  'GEN_ROUND',
  'GEN_ERROR_SPOT',
];

function buildDeterministicFallback(body: RecommendBody) {
  const sortedErrors = Object.entries(body.errorCounts ?? {})
    .filter(([code, cnt]) => code && code !== 'OTHER' && cnt > 0)
    .sort((a, b) => b[1] - a[1]);
  const topErrorCodes = sortedErrors.slice(0, 3).map(([c]) => c);

  const weakClusters = (body.skillSummary ?? [])
    .filter((s) => s.state === 'Cần ôn lại' || s.state === 'Đang luyện' || s.verifyCorrect === 0)
    .map((s) => s.cluster);

  const scored = (body.candidates ?? []).map((q) => {
    let score = 0;
    for (const ec of topErrorCodes) {
      if ((q.errorIds ?? []).includes(ec)) score += 5;
    }
    if (weakClusters.includes(q.cluster)) score += 3;
    if (q.level <= 2) score += 1;
    return {q, score};
  });
  scored.sort((a, b) => b.score - a.score);

  const recommendedIds = scored.slice(0, 3).map((x) => x.q.id);
  const topCluster = weakClusters[0] ?? scored[0]?.q.cluster ?? 'COS';
  const genByCluster: Record<string, string> = {
    NEN: 'GEN_ANGLE_SUM',
    LG: 'GEN_TRIG_VALUES',
    COS: 'GEN_COS_SIDE',
    SIN: 'GEN_SIN_SIDE',
    DT: 'GEN_AREA_HERON',
    MH: 'GEN_SIN_SIDE',
  };

  return {
    diagnosis_vi:
      topErrorCodes.length > 0
        ? `Học sinh (${body.studentCode}) đang lặp lỗi chủ yếu ở nhóm ${topErrorCodes.join(', ')}. Cần luyện lại bước nhận diện dữ kiện và lập đúng hệ thức trước khi tự giải kiểm chứng.`
        : `Học sinh (${body.studentCode}) cần củng cố thêm bài tập tự giải độc lập ở cụm ${topCluster} (chế độ không gợi ý).`,
    recommended_error_codes: topErrorCodes.length > 0 ? topErrorCodes : ['E05'],
    recommended_question_ids: recommendedIds,
    suggested_verify_generator_id: genByCluster[topCluster] ?? 'GEN_COS_SIDE',
    teacher_note_draft_vi:
      topErrorCodes.length > 0
        ? `Em làm lần lượt các câu bổ trợ để khắc phục lỗi ${topErrorCodes.join(', ')} (có thể xem gợi ý ở bước khó), sau đó tự giải độc lập bài kiểm chứng mới ở cuối phiếu.`
        : 'Em ôn lại hệ thức trọng tâm ở các câu bổ trợ rồi tự giải bài kiểm chứng mới không dùng gợi ý nhé.',
    ai_caveat_vi:
      'Đề xuất được tổng hợp từ dữ liệu ẩn danh để giáo viên tham khảo; giáo viên có toàn quyền chỉnh sửa và quyết định trước khi giao cho học sinh.',
    source: 'deterministic_fallback' as const,
  };
}

export async function POST(request: Request): Promise<Response> {
  const auth = await verifyRequestAuth(request, {requireStaff: true});
  if (!auth.ok) {
    return jsonResponse({error: auth.error}, auth.status);
  }

  let body: RecommendBody;
  try {
    body = (await request.json()) as RecommendBody;
  } catch {
    return jsonResponse({error: 'Dữ liệu gửi lên không đúng định dạng JSON.'}, 400);
  }

  const safeCode = String(body.studentCode ?? 'HS-ANON').trim().slice(0, 32);
  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 60) : [];
  if (candidates.length === 0) {
    return jsonResponse({error: 'Chưa có câu hỏi đã duyệt trong ngân hàng để đề xuất.'}, 400);
  }

  const fallback = buildDeterministicFallback({...body, studentCode: safeCode, candidates});
  const keyRes = resolveApiKeyForCaller(request, auth.caller);
  if (!keyRes.ok) {
    // Still return useful deterministic recommendation + clear note about personal Gemini key
    return jsonResponse({
      ...fallback,
      usedModel: 'rule_based',
      keyNotice: keyRes.error,
    });
  }

  const systemPrompt = `Bạn là trợ lý sư phạm Toán 10 Chương III — Hệ thức lượng trong tam giác (${PROMPT_VERSION}).
Quy tắc BẮT BUỘC:
1. Chỉ phân tích dựa trên dữ liệu ẨN DANH (mã học sinh, tần suất mã lỗi E01-E12, trạng thái 6 cụm kỹ năng) được cung cấp.
2. CHỈ được chọn "recommended_question_ids" nằm trong danh sách ID câu hỏi ĐÃ DUYỆT được cung cấp (từ 1 đến 3 câu phù hợp nhất để sửa lỗi học sinh đang vướng).
3. Chọn 1 mã "suggested_verify_generator_id" thuộc danh sách: ${VALID_GENERATORS.join(', ')} để hệ thống sinh bài kiểm chứng mới (dữ kiện mới, không gợi ý).
4. Không kết luận tuyệt đối về năng lực học sinh; nhấn mạnh đề xuất chỉ để giáo viên xem xét, điều chỉnh và quyết định giao bài.
5. CHỈ trả về JSON hợp lệ theo lược đồ:
{
  "diagnosis_vi": "Nhận định ngắn 2-3 câu về lỗi trọng tâm cần củng cố",
  "recommended_error_codes": ["E01", "E05"],
  "recommended_question_ids": ["id1", "id2"],
  "suggested_verify_generator_id": "GEN_COS_SIDE",
  "teacher_note_draft_vi": "Lời nhắn động viên & hướng dẫn 1-2 câu gửi học sinh"
}`;

  const userPayload = JSON.stringify({
    studentCode: safeCode,
    currentMoc: body.currentMoc ?? 1,
    errorCounts: body.errorCounts ?? {},
    skillSummary: body.skillSummary ?? [],
    approvedCandidates: candidates.map((c) => ({
      id: c.id,
      cluster: c.cluster,
      pattern_id: c.pattern_id ?? '',
      level: c.level,
      errorIds: c.errorIds,
      stemPreview: c.stemPreview.slice(0, 140),
    })),
  });

  const validIdSet = new Set(candidates.map((c) => c.id));
  const chain = await resolveLiveModelChain(undefined, false, keyRes.apiKey);
  const ai = getGenAIClient(keyRes.apiKey);
  if (!ai) {
    return jsonResponse({
      ...fallback,
      usedModel: 'rule_based_no_client',
    });
  }

  for (const modelName of chain.slice(0, 4)) {
    try {
      const resp = await ai.models.generateContent({
        model: modelName,
        contents: [{role: 'user', parts: [{text: userPayload}]}],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });
      const rawText = (resp.text ?? '').trim();
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned) as {
        diagnosis_vi?: string;
        recommended_error_codes?: string[];
        recommended_question_ids?: string[];
        suggested_verify_generator_id?: string;
        teacher_note_draft_vi?: string;
      };

      const validRecIds = Array.isArray(parsed.recommended_question_ids)
        ? parsed.recommended_question_ids.filter((id) => validIdSet.has(id)).slice(0, 4)
        : [];
      const finalRecIds = validRecIds.length > 0 ? validRecIds : fallback.recommended_question_ids;
      const genId =
        parsed.suggested_verify_generator_id && VALID_GENERATORS.includes(parsed.suggested_verify_generator_id)
          ? parsed.suggested_verify_generator_id
          : fallback.suggested_verify_generator_id;

      return jsonResponse({
        diagnosis_vi: (parsed.diagnosis_vi ?? '').trim() || fallback.diagnosis_vi,
        recommended_error_codes:
          Array.isArray(parsed.recommended_error_codes) && parsed.recommended_error_codes.length > 0
            ? parsed.recommended_error_codes.slice(0, 4)
            : fallback.recommended_error_codes,
        recommended_question_ids: finalRecIds,
        suggested_verify_generator_id: genId,
        teacher_note_draft_vi: (parsed.teacher_note_draft_vi ?? '').trim() || fallback.teacher_note_draft_vi,
        ai_caveat_vi: fallback.ai_caveat_vi,
        source: 'gemini_ai',
        usedModel: modelName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded/i.test(msg)) {
        markModelTemporarilyUnavailable(modelName);
      }
    }
  }

  return jsonResponse({
    ...fallback,
    usedModel: 'rule_based_fallback',
  });
}

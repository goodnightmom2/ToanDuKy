import React from 'react';
import {
  Check,
  CheckCircle2,
  ClipboardList,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {ERROR_CATALOG, SKILL_CLUSTER_LIST} from '../config.ts';
import {normalizeJourneyProgress} from '../journey.ts';
import {
  ALL_GENERATOR_IDS,
  createAttemptSeed,
  generateQuestion,
  type GeneratorId,
} from '../math/generators.ts';
import {dataService, generateId} from '../services/dataService.ts';
import type {
  AttemptRecord,
  QuestionItem,
  RemediationAssignment,
  UserAccount,
} from '../types.ts';
import {MathText} from './MathText.tsx';

interface StudentAiRemediationAdvisorProps {
  actor: UserAccount;
  student: UserAccount;
  studentAttempts: AttemptRecord[];
  questions: QuestionItem[];
  onAssigned: () => void;
}

interface AiRecommendationResult {
  diagnosis_vi: string;
  recommended_error_codes: string[];
  recommended_question_ids: string[];
  suggested_verify_generator_id: GeneratorId;
  teacher_note_draft_vi: string;
  ai_caveat_vi: string;
  source: 'gemini_ai' | 'deterministic_fallback';
  usedModel?: string;
  keyNotice?: string;
}

const GENERATOR_SHORT_LABELS: Record<GeneratorId, string> = {
  GEN_COS_SIDE: 'Định lý Côsin — Tìm cạnh',
  GEN_COS_ANGLE: 'Định lý Côsin — Tìm góc',
  GEN_SIN_SIDE: 'Định lý Sin — Tìm cạnh / đo khoảng cách',
  GEN_SIN_R: 'Định lý Sin — Bán kính ngoại tiếp R',
  GEN_AREA_SAS: 'Diện tích tam giác (½ab·sinC)',
  GEN_AREA_HERON: 'Diện tích tam giác (Heron)',
  GEN_HEIGHT: 'Đường cao tam giác',
  GEN_TRIG_VALUES: 'Giá trị lượng giác góc đặc biệt & góc bù',
  GEN_ANGLE_SUM: 'Tổng ba góc trong tam giác',
  GEN_OPP_PAIR: 'Cạnh đối diện – góc đối diện',
  GEN_UNITS: 'Quy đổi đơn vị đo',
  GEN_ROUND: 'Làm tròn kết quả',
  GEN_ERROR_SPOT: 'Tìm lỗi sai trong lời giải',
};

function isValidGeneratorId(id: string | undefined): id is GeneratorId {
  return Boolean(id && (ALL_GENERATOR_IDS as string[]).includes(id));
}

function buildLocalFallbackProposal(
  student: UserAccount,
  errorCounts: Record<string, number>,
  eligibleApproved: QuestionItem[],
): AiRecommendationResult {
  const localProposal = dataService.proposeRemediationForStudent(student.uid);
  const eligibleIdSet = new Set(eligibleApproved.map((q) => q.id));
  const remIds = localProposal.remediationQuestionIds.filter((id) => eligibleIdSet.has(id));
  const finalRemIds =
    remIds.length > 0 ? remIds : eligibleApproved.slice(0, 2).map((q) => q.id);

  const sortedErr = Object.entries(errorCounts)
    .filter(([code, cnt]) => code && code !== 'OTHER' && cnt > 0)
    .sort((a, b) => b[1] - a[1]);
  const topErrCodes =
    sortedErr.length > 0
      ? sortedErr.slice(0, 3).map(([code]) => code)
      : localProposal.targetErrorCodes;

  const firstCluster =
    eligibleApproved.find((q) => q.id === finalRemIds[0])?.cluster ?? 'COS';
  const genByCluster: Record<string, GeneratorId> = {
    NEN: 'GEN_ANGLE_SUM',
    LG: 'GEN_TRIG_VALUES',
    COS: 'GEN_COS_SIDE',
    SIN: 'GEN_SIN_SIDE',
    DT: 'GEN_AREA_HERON',
    MH: 'GEN_SIN_SIDE',
  };

  return {
    diagnosis_vi:
      sortedErr.length > 0
        ? `Hồ sơ ẩn danh (${student.studentCode}) ghi nhận lặp lỗi chủ yếu ở ${topErrCodes.join(', ')}. Nên giao 1–3 câu bổ trợ có gợi ý theo đúng cụm lỗi trước khi cho em tự giải 1 bài kiểm chứng dữ kiện mới (không gợi ý).`
        : `Hồ sơ ẩn danh (${student.studentCode}) hiện ít lỗi lặp lại; có thể giao 1–2 câu củng cố và 1 bài kiểm chứng độc lập để xác nhận mức thành thạo.`,
    recommended_error_codes: topErrCodes,
    recommended_question_ids: finalRemIds,
    suggested_verify_generator_id: genByCluster[firstCluster] ?? 'GEN_COS_SIDE',
    teacher_note_draft_vi: localProposal.suggestedNote,
    ai_caveat_vi:
      'Đề xuất được tổng hợp từ dữ liệu ẩn danh để giáo viên tham khảo; giáo viên xem xét, chỉnh sửa và quyết định trước khi giao cho học sinh.',
    source: 'deterministic_fallback',
    usedModel: 'rule_based_local',
  };
}

export const StudentAiRemediationAdvisor: React.FC<StudentAiRemediationAdvisorProps> = ({
  actor,
  student,
  studentAttempts,
  questions,
  onAssigned,
}) => {
  const [loading, setLoading] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const [proposal, setProposal] = React.useState<AiRecommendationResult | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = React.useState<string[]>([]);
  const [addQuestionId, setAddQuestionId] = React.useState('');
  const [verifyGenId, setVerifyGenId] = React.useState<GeneratorId>('GEN_COS_SIDE');
  const [verifySeed, setVerifySeed] = React.useState<number>(() => createAttemptSeed());
  const [worksheetTitle, setWorksheetTitle] = React.useState('');
  const [teacherNote, setTeacherNote] = React.useState('');
  const [statusMsg, setStatusMsg] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');
  const [localTick, setLocalTick] = React.useState(0);

  // Reset form when switching inspected student
  React.useEffect(() => {
    setProposal(null);
    setSelectedQuestionIds([]);
    setStatusMsg('');
    setErrorMsg('');
    setWorksheetTitle('');
    setTeacherNote('');
  }, [student.uid]);

  // Approved bank questions eligible for this student's class (global or scoped to student.classId)
  const eligibleApproved = React.useMemo(() => {
    return questions.filter((q) => {
      if (q.review_status !== 'approved') return false;
      if (!q.targetClassIds || q.targetClassIds.length === 0) return true;
      return Boolean(student.classId && q.targetClassIds.includes(student.classId));
    });
  }, [questions, student.classId]);

  const questionById = React.useMemo(() => {
    const map = new Map<string, QuestionItem>();
    for (const q of questions) map.set(q.id, q);
    return map;
  }, [questions]);

  const errorCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const att of studentAttempts) {
      if (!att.isCorrect) {
        const key = att.errorCode || 'OTHER';
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [studentAttempts]);

  const existingAssignments: RemediationAssignment[] = React.useMemo(
    () => dataService.getRemediationAssignments(student.uid),
    [student.uid, localTick],
  );

  // Live preview of the fresh parametric verify question (0-hint, different data)
  const verifyPreviewQuestion = React.useMemo(() => {
    return generateQuestion(verifyGenId, verifySeed);
  }, [verifyGenId, verifySeed]);

  const applyProposalToEditor = React.useCallback(
    (res: AiRecommendationResult) => {
      setProposal(res);
      setSelectedQuestionIds(res.recommended_question_ids);
      setVerifyGenId(res.suggested_verify_generator_id);
      setVerifySeed(createAttemptSeed());
      setWorksheetTitle(
        `Phiếu bổ trợ cá nhân · ${student.studentCode} (${res.recommended_error_codes.join(', ')})`,
      );
      setTeacherNote(res.teacher_note_draft_vi);
    },
    [student.studentCode],
  );

  const handleAnalyzeWithAi = async () => {
    setLoading(true);
    setStatusMsg('');
    setErrorMsg('');

    if (eligibleApproved.length === 0) {
      setErrorMsg('Ngân hàng chưa có câu hỏi đã duyệt phù hợp với lớp của học sinh.');
      setLoading(false);
      return;
    }

    try {
      const journey = normalizeJourneyProgress(student.journey);
      const skillSummary = SKILL_CLUSTER_LIST.map((cluster) => {
        const rec = student.skills[cluster];
        return {
          cluster,
          state: rec?.state ?? 'Chưa học',
          verifyCorrect: rec?.verifyCorrect ?? 0,
          practiceCorrect: rec?.practiceCorrect ?? 0,
          totalAttempts: rec?.totalAttempts ?? 0,
        };
      });

      // Strictly ANONYMIZED payload — NEVER send displayName or realNamePrivate!
      const topErrKeys = Object.entries(errorCounts)
        .filter(([k, v]) => k !== 'OTHER' && v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k);

      // Rank candidates so most relevant error/cluster items appear in top 50 sent to AI
      const rankedCandidates = [...eligibleApproved]
        .sort((a, b) => {
          const scoreA =
            a.anticipated_error_ids.filter((e) => topErrKeys.includes(e)).length * 4 +
            (a.level <= 2 ? 1 : 0);
          const scoreB =
            b.anticipated_error_ids.filter((e) => topErrKeys.includes(e)).length * 4 +
            (b.level <= 2 ? 1 : 0);
          return scoreB - scoreA;
        })
        .slice(0, 50)
        .map((q) => ({
          id: q.id,
          cluster: q.cluster,
          pattern_id: q.pattern_id ?? null,
          level: q.level,
          type: q.type,
          errorIds: q.anticipated_error_ids ?? [],
          stemPreview: q.stem_vi.slice(0, 140),
        }));

      let personalKey = '';
      try {
        personalKey = localStorage.getItem(`toanduky_personal_gemini_key_${actor.uid}`)?.trim() ?? '';
      } catch {
        personalKey = '';
      }

      const token = await dataService.getAccessToken();
      const headers: Record<string, string> = {'Content-Type': 'application/json'};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (personalKey) headers['x-gemini-api-key'] = personalKey;

      const resp = await fetch('/api/ai/recommend-remediation', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          studentCode: student.studentCode,
          currentMoc: journey.currentMoc,
          errorCounts,
          skillSummary,
          candidates: rankedCandidates,
        }),
      });

      if (!resp.ok) {
        const localFallback = buildLocalFallbackProposal(student, errorCounts, eligibleApproved);
        applyProposalToEditor(localFallback);
        setStatusMsg(
          'Đã tổng hợp đề xuất theo quy tắc chẩn đoán cục bộ (không kết nối được máy chủ AI). Giáo viên có thể chỉnh sửa trước khi giao.',
        );
        return;
      }

      const data = (await resp.json()) as {
        diagnosis_vi?: string;
        recommended_error_codes?: string[];
        recommended_question_ids?: string[];
        suggested_verify_generator_id?: string;
        teacher_note_draft_vi?: string;
        ai_caveat_vi?: string;
        source?: 'gemini_ai' | 'deterministic_fallback';
        usedModel?: string;
        keyNotice?: string;
      };

      const validSelected = (data.recommended_question_ids ?? []).filter((id) =>
        questionById.has(id),
      );
      const localFallback = buildLocalFallbackProposal(student, errorCounts, eligibleApproved);

      const finalResult: AiRecommendationResult = {
        diagnosis_vi: data.diagnosis_vi || localFallback.diagnosis_vi,
        recommended_error_codes:
          data.recommended_error_codes && data.recommended_error_codes.length > 0
            ? data.recommended_error_codes
            : localFallback.recommended_error_codes,
        recommended_question_ids:
          validSelected.length > 0 ? validSelected : localFallback.recommended_question_ids,
        suggested_verify_generator_id: isValidGeneratorId(data.suggested_verify_generator_id)
          ? data.suggested_verify_generator_id
          : localFallback.suggested_verify_generator_id,
        teacher_note_draft_vi: data.teacher_note_draft_vi || localFallback.teacher_note_draft_vi,
        ai_caveat_vi: data.ai_caveat_vi || localFallback.ai_caveat_vi,
        source: data.source ?? 'deterministic_fallback',
        usedModel: data.usedModel,
        keyNotice: data.keyNotice,
      };

      applyProposalToEditor(finalResult);
      setStatusMsg(
        finalResult.source === 'gemini_ai'
          ? `AI (${finalResult.usedModel ?? 'Gemini'}) đã phân tích hồ sơ ẩn danh ${student.studentCode} và chọn đề xuất từ ngân hàng đã duyệt.`
          : 'Đã tổng hợp đề xuất theo quy tắc sư phạm từ hồ sơ ẩn danh. Giáo viên có thể rà soát, thêm/bớt câu và bấm Giao phiếu.',
      );
    } catch {
      const localFallback = buildLocalFallbackProposal(student, errorCounts, eligibleApproved);
      applyProposalToEditor(localFallback);
      setStatusMsg(
        'Đã tổng hợp đề xuất theo quy tắc chẩn đoán cục bộ. Giáo viên xem xét và chỉnh sửa trước khi giao.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAssignWorksheet = async () => {
    setErrorMsg('');
    setStatusMsg('');
    if (selectedQuestionIds.length === 0) {
      setErrorMsg('Cần chọn ít nhất 1 câu hỏi bổ trợ đã duyệt trước khi giao phiếu.');
      return;
    }

    setAssigning(true);
    try {
      // 1. Materialize the fresh parametric Verify question as an approved question tagged BO_SINH_THAM_SO
      const now = new Date().toISOString();
      const freshVerifyId = generateId('q_ver');
      const freshVerifyQuestion: QuestionItem = {
        ...verifyPreviewQuestion,
        id: freshVerifyId,
        stage: 'independent',
        review_status: 'approved',
        math_format: 'latex-1',
        math_verified: true,
        math_verified_by: actor.displayName,
        math_verified_at: now,
        source_refs: ['BO_SINH_THAM_SO', verifyGenId, `seed_${verifySeed}`],
        createdBy: actor.displayName,
        createdByUid: actor.uid,
        reviewedBy: actor.displayName,
        reviewedAt: now,
        approved_by: actor.displayName,
        approved_at: now,
        targetClassIds: student.classId ? [student.classId] : undefined,
        version: 1,
      };

      dataService.upsertQuestion(actor, freshVerifyQuestion);
      await dataService.syncQuestionsToSupabase([freshVerifyId]);

      // 2. Assign closed-loop remediation worksheet (remediation practice + 0-hint verify)
      const targetErrorCodes =
        proposal?.recommended_error_codes && proposal.recommended_error_codes.length > 0
          ? proposal.recommended_error_codes
          : ['E05'];

      const res = dataService.assignRemediationWorksheet(actor, {
        studentUid: student.uid,
        title:
          worksheetTitle.trim() ||
          `Phiếu bổ trợ riêng · ${student.studentCode} (${targetErrorCodes.join(', ')})`,
        targetErrorCodes,
        remediationQuestionIds: selectedQuestionIds,
        verifyQuestionId: freshVerifyId,
        teacherNote: teacherNote.trim(),
      });

      if (!res.ok) {
        setErrorMsg(res.error ?? 'Không thể giao phiếu bổ trợ.');
        return;
      }

      setStatusMsg(
        `Đã giao phiếu bổ trợ (${selectedQuestionIds.length} câu bổ trợ + 1 bài kiểm chứng tham số mới [${freshVerifyId}]) cho ${student.displayName}. Học sinh sẽ thấy ngay ở mục Luyện tập!`,
      );
      setLocalTick((t) => t + 1);
      setVerifySeed(createAttemptSeed());
      onAssigned();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi giao phiếu bổ trợ.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-[#F4FBF9] border-2 border-[#2E9C8A] space-y-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-display text-base font-extrabold text-[#145B4F] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#18685B]" />
            Phân tích & Đề xuất Cá nhân hóa (AI + Giáo viên quyết định)
          </h4>
          <p className="text-[11px] text-[#355A52] mt-0.5 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#18685B] shrink-0" />
            <span>
              Chỉ gửi <strong>mã ẩn danh ({student.studentCode})</strong>, mã lỗi và cụm kỹ năng (tuyệt đối không gửi tên thật). Chỉ chọn câu <strong>đã duyệt</strong> + 1 bài kiểm chứng tham số mới.
            </span>
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleAnalyzeWithAi()}
          className="btn-tactile btn-jade text-xs py-2 px-3 shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {loading
            ? 'Đang phân tích hồ sơ ẩn danh...'
            : proposal
              ? 'Phân tích lại bằng AI'
              : 'AI phân tích & gợi ý phiếu bổ trợ'}
        </button>
      </div>

      {statusMsg && (
        <div className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] font-semibold">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-[#FDF0EC] border border-[#D4623F] text-[#9E3519] font-semibold">
          {errorMsg}
        </div>
      )}

      {proposal && (
        <div className="space-y-3 pt-1">
          {/* AI Diagnosis + Ethics caveat */}
          <div className="p-3 rounded-xl bg-white border border-[#BFE3DC] space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-[#14284A]">
                Nhận định gợi ý ({proposal.source === 'gemini_ai' ? `Gemini · ${proposal.usedModel}` : 'Quy tắc sư phạm'})
              </span>
              <div className="flex flex-wrap gap-1">
                {proposal.recommended_error_codes.map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 rounded-full bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5108] font-bold text-[10px]"
                    title={ERROR_CATALOG[code]?.label ?? code}
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[#23395B] leading-relaxed">{proposal.diagnosis_vi}</p>
            <p className="text-[11px] text-[#5B6B82] italic">{proposal.ai_caveat_vi}</p>
            {proposal.keyNotice && (
              <p className="text-[11px] text-[#8A5108] bg-[#FFF8EA] border border-[#E5C98B] rounded-lg px-2 py-1">
                Lưu ý khóa AI: {proposal.keyNotice} (Hệ thống đã dùng bộ quy tắc sư phạm dự phòng.)
              </p>
            )}
          </div>

          {/* Editable worksheet title + teacher note */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[#14284A] mb-1">
                Tên phiếu bổ trợ (Giáo viên có thể sửa)
              </label>
              <input
                type="text"
                value={worksheetTitle}
                onChange={(e) => setWorksheetTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#BFE3DC] text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#14284A] mb-1">
                Lời nhắn gửi học sinh (Chu kỳ 2)
              </label>
              <input
                type="text"
                value={teacherNote}
                onChange={(e) => setTeacherNote(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#BFE3DC] text-xs"
              />
            </div>
          </div>

          {/* Step A: Teacher-editable list of remediation questions (from approved bank) */}
          <div className="p-3 rounded-xl bg-white border border-[#D9C293] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-[#14284A]">
                Phần 1 — Câu bổ trợ có gợi ý ({selectedQuestionIds.length} câu đã chọn từ ngân hàng đã duyệt)
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  value={addQuestionId}
                  onChange={(e) => setAddQuestionId(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] text-[11px] max-w-[240px]"
                >
                  <option value="">+ Thêm câu đã duyệt khác...</option>
                  {eligibleApproved
                    .filter((q) => !selectedQuestionIds.includes(q.id))
                    .slice(0, 80)
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        [{q.id}] {q.cluster} · M{q.level} — {q.stem_vi.slice(0, 48)}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!addQuestionId}
                  onClick={() => {
                    if (addQuestionId && !selectedQuestionIds.includes(addQuestionId)) {
                      setSelectedQuestionIds((prev) => [...prev, addQuestionId]);
                      setAddQuestionId('');
                    }
                  }}
                  className="btn-tactile btn-paper text-[11px] py-1 px-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm
                </button>
              </div>
            </div>

            {selectedQuestionIds.length === 0 ? (
              <p className="text-[11px] text-[#9E3519]">
                Chưa chọn câu bổ trợ nào. Hãy thêm ít nhất 1 câu đã duyệt ở ô trên.
              </p>
            ) : (
              <div className="space-y-1.5">
                {selectedQuestionIds.map((qid, idx) => {
                  const q = questionById.get(qid);
                  return (
                    <div
                      key={qid}
                      className="p-2 rounded-lg bg-[#FFFBF2] border border-[#E5D3A8] flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className="font-extrabold text-[#14284A]">
                            Câu {idx + 1}: [{qid}]
                          </span>
                          {q && (
                            <>
                              <span className="px-1.5 py-0.5 rounded bg-[#E6F6F3] text-[#145B4F] font-bold text-[10px]">
                                {q.cluster} · M{q.level}
                              </span>
                              {q.anticipated_error_ids.slice(0, 3).map((e) => (
                                <span
                                  key={e}
                                  className="px-1.5 py-0.5 rounded bg-[#FFF5E2] text-[#8A5108] font-bold text-[10px]"
                                >
                                  {e}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                        {q && (
                          <div className="text-[11px] text-[#3B4C66]">
                            <MathText text={q.stem_vi} maxLength={160} />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedQuestionIds((prev) => prev.filter((id) => id !== qid))
                        }
                        className="p-1 rounded-lg hover:bg-[#FDF0EC] text-[#9E3519] shrink-0"
                        title="Bỏ câu này khỏi phiếu"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step B: Fresh Parametric Verify Question (0-hint, different data) */}
          <div className="p-3 rounded-xl bg-white border border-[#2E9C8A] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-[#145B4F]">
                Phần 2 — Bài kiểm chứng mới (Sinh tham số, khác dữ kiện, không gợi ý)
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={verifyGenId}
                  onChange={(e) => {
                    setVerifyGenId(e.target.value as GeneratorId);
                    setVerifySeed(createAttemptSeed());
                  }}
                  className="px-2 py-1 rounded-lg bg-[#F4FBF9] border border-[#2E9C8A] text-[11px] font-bold text-[#145B4F]"
                >
                  {ALL_GENERATOR_IDS.map((gid) => (
                    <option key={gid} value={gid}>
                      {gid} — {GENERATOR_SHORT_LABELS[gid]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setVerifySeed(createAttemptSeed())}
                  className="btn-tactile btn-paper text-[11px] py-1 px-2"
                >
                  <RefreshCw className="w-3 h-3" /> Sinh dữ kiện mới khác
                </button>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F9F4E7] border border-[#E5D3A8] space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-[#14284A] text-white font-bold">
                  BO_SINH_THAM_SO
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#E6F6F3] text-[#145B4F] font-bold">
                  {verifyPreviewQuestion.cluster} · M{verifyPreviewQuestion.level}
                </span>
                <span className="text-[#5B6B82]">Seed: {verifySeed}</span>
              </div>
              <div className="text-xs text-[#14284A]">
                <MathText text={verifyPreviewQuestion.stem_vi} />
              </div>
              {verifyPreviewQuestion.expected_answer.rounded !== undefined && (
                <div className="text-[11px] text-[#145B4F] font-semibold">
                  Đáp án chuẩn (tính bằng công thức Toán):{' '}
                  <code>{String(verifyPreviewQuestion.expected_answer.rounded)}</code>
                  {verifyPreviewQuestion.expected_answer.unit
                    ? ` ${String(verifyPreviewQuestion.expected_answer.unit)}`
                    : ''}
                </div>
              )}
            </div>
          </div>

          {/* Approve & Assign button */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-[#355A52]">
              Sau khi giao, phiếu sẽ hiển thị ngay trong mục <strong>Luyện tập</strong> của học sinh {student.displayName}.
            </span>
            <button
              type="button"
              disabled={assigning || selectedQuestionIds.length === 0}
              onClick={() => void handleAssignWorksheet()}
              className="btn-tactile btn-gold text-xs py-2 px-4"
            >
              <Send className="w-3.5 h-3.5" />
              {assigning
                ? 'Đang đồng bộ & giao phiếu...'
                : 'Duyệt & Giao phiếu bổ trợ + Bài kiểm chứng'}
            </button>
          </div>
        </div>
      )}

      {/* Existing remediation worksheets history (Cycle 1 -> Cycle 2 tracking) */}
      {existingAssignments.length > 0 && (
        <div className="pt-2 border-t border-[#BFE3DC] space-y-1.5">
          <p className="font-extrabold text-[#14284A] flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5 text-[#18685B]" />
            Lịch sử phiếu bổ trợ đã giao cho học sinh ({existingAssignments.length})
          </p>
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
            {existingAssignments.map((asgn) => {
              const badge =
                asgn.status === 'verified_passed'
                  ? {
                      text: '✓ Đã vượt qua kiểm chứng (Chu kỳ 2 đạt)',
                      cls: 'bg-[#E6F6F3] border-[#2E9C8A] text-[#145B4F]',
                    }
                  : asgn.status === 'remediation_done'
                    ? {
                        text: 'Đã xong câu bổ trợ · Chờ bài kiểm chứng',
                        cls: 'bg-[#FFF5E2] border-[#D98A1F] text-[#8A5108]',
                      }
                    : {
                        text: `Đã giao (${asgn.remediationCompletedIds.length}/${asgn.remediationQuestionIds.length} câu bổ trợ)`,
                        cls: 'bg-white border-[#CBB17D] text-[#4B5B73]',
                      };
              return (
                <div
                  key={asgn.id}
                  className="p-2.5 rounded-xl bg-white border border-[#D9E7E4] flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-bold text-[#14284A]">{asgn.title}</div>
                    <div className="text-[10px] text-[#5B6B82]">
                      Lỗi mục tiêu: {asgn.targetErrorCodes.join(', ')} · Câu bổ trợ:{' '}
                      {asgn.remediationQuestionIds.length} · Kiểm chứng: {asgn.verifyQuestionId} ·{' '}
                      {new Date(asgn.createdAt).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full border font-bold text-[10px] flex items-center gap-1 ${badge.cls}`}
                  >
                    {asgn.status === 'verified_passed' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    {badge.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Gift,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Swords,
} from 'lucide-react';
import {MathText} from '../components/MathText.tsx';
import {QuestionCard, type QuestionSubmissionPayload} from '../components/QuestionCard.tsx';
import {TriangleDiagram} from '../components/TriangleDiagram.tsx';
import {B_SLIDE_MAX, B_SLIDE_MIN, BOSSES, STATIONS_BY_ID} from '../config.ts';
import {
  buildMilestoneMissionQuestions,
  JOURNEY_MILESTONES_BY_ID,
  shouldSkipFoundationWarmup,
} from '../journey.ts';
import {
  BS01_COORDS,
  formatViNumber,
  getBS01OpenSurveyState,
  roundToPlaces,
} from '../math/geometry.ts';
import {computeT01Rubric, type T01RubricBreakdown} from '../math/grader.ts';
import {dataService} from '../services/dataService.ts';
import type {MocId, QuestionItem, QuestionMode, StationId, UserAccount} from '../types.ts';
import {soundEngine} from '../utils/audio.ts';

interface StationMissionProps {
  user: UserAccount;
  stationId: StationId;
  mocId?: MocId;
  initialStepIndex?: number;
  onUserUpdated: (user: UserAccount) => void;
  onMocPassed?: (passedMocId: MocId, allCompleted: boolean) => void;
  onBackToMap: () => void;
  onGoToBoss: () => void;
}

type BS01StepKey =
  | 'S01_INTRO'
  | 'S02_M01'
  | 'S03_M02'
  | 'S04_MODEL'
  | 'S05_M03'
  | 'S05_M04'
  | 'S05_M05'
  | 'S06_M06'
  | 'S08_T01'
  | 'S08_T02'
  | 'REPORT_OPEN_SURVEY';

const BS01_STEP_LIST: Array<{key: BS01StepKey; code: string; label: string; questionId?: string; mode?: QuestionMode}> = [
  {key: 'S01_INTRO', code: 'S01', label: 'Nhận nhiệm vụ'},
  {key: 'S02_M01', code: 'S02', label: 'Khảo sát (M01)', questionId: 'M01', mode: 'practice'},
  {key: 'S03_M02', code: 'S03', label: 'Đo dữ kiện (M02)', questionId: 'M02', mode: 'practice'},
  {key: 'S04_MODEL', code: 'S04', label: 'Lập mô hình 2D'},
  {key: 'S05_M03', code: 'S05a', label: 'Tính góc C (M03)', questionId: 'M03', mode: 'practice'},
  {key: 'S05_M04', code: 'S05b', label: 'Lập tỉ số Sin (M04)', questionId: 'M04', mode: 'practice'},
  {key: 'S05_M05', code: 'S05c', label: 'Tính AC (M05)', questionId: 'M05', mode: 'practice'},
  {key: 'S06_M06', code: 'S06', label: 'Diễn giải (M06)', questionId: 'M06', mode: 'practice'},
  {key: 'S08_T01', code: 'S08a', label: 'Tự giải T01', questionId: 'T01', mode: 'verify'},
  {key: 'S08_T02', code: 'S08b', label: 'Kiểm chứng T02', questionId: 'T02', mode: 'verify'},
  {key: 'REPORT_OPEN_SURVEY', code: 'Phiếu', label: 'Phiếu khảo sát & Mở rộng'},
];

export const StationMission: React.FC<StationMissionProps> = ({
  user,
  stationId,
  mocId,
  initialStepIndex = 0,
  onUserUpdated,
  onMocPassed,
  onBackToMap,
  onGoToBoss,
}) => {
  const activeMocId: MocId = mocId ?? (stationId === 'BS01' ? 6 : 1);
  const mocDef = JOURNEY_MILESTONES_BY_ID[activeMocId];
  const isBS01Mode = Boolean(mocDef.isBS01Full);
  const station = STATIONS_BY_ID[mocDef.stationId ?? stationId];
  const mocBoss = mocDef.bossId ? BOSSES[mocDef.bossId] : null;
  const skipWarmup = shouldSkipFoundationWarmup(activeMocId, user);
  const settings = dataService.getSettings();
  const allBank = React.useMemo(() => dataService.getQuestions(), []);

  // Personalized milestone mission deck (5 questions for Mốc 1–5, 7–8, 10; 6 questions for Mốc 9)
  const genericQuestions = React.useMemo(() => {
    if (isBS01Mode) return [];
    return buildMilestoneMissionQuestions({
      mocId: activeMocId,
      userId: user.uid,
      bank: allBank,
      allowPending: settings.allowPendingInTestMode,
      skills: user.skills,
      recentSessions: user.recentQuestionSessions,
      nonce: (user.recentQuestionSessions ?? []).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMocId, isBS01Mode, user.uid]);

  const [stepIdx, setStepIdx] = React.useState(initialStepIndex);
  const [stepCleared, setStepCleared] = React.useState(false);
  const usedSupportRef = React.useRef(false);

  // S07 Remediation overlay (Branch 1: R01->R02, Branch 2: R03->R04) or warm-up P01-P04
  const [subQueue, setSubQueue] = React.useState<QuestionItem[] | null>(null);
  const [subTitle, setSubTitle] = React.useState('');
  const [subIndex, setSubIndex] = React.useState(0);
  const [subCleared, setSubCleared] = React.useState(false);

  // T01 rubric + optional AI comment
  const [t01Rubric, setT01Rubric] = React.useState<T01RubricBreakdown | null>(null);
  const [t01AiComment, setT01AiComment] = React.useState<string>('');
  const [t01ExplanationSaved, setT01ExplanationSaved] = React.useState('');

  // Chest reward modal
  const [chestModal, setChestModal] = React.useState<{xp: number; toolName: string; landmark: string} | null>(null);

  // Open survey B-slider state (x in [50, 100])
  const [slideBx, setSlideBx] = React.useState(60);
  const openSurveyTri = React.useMemo(() => getBS01OpenSurveyState(slideBx), [slideBx]);

  const findQuestionById = (id: string): QuestionItem | undefined => allBank.find((q) => q.id === id);

  const handleRecordSubmission = async (payload: QuestionSubmissionPayload) => {
    let rubricScore: number | undefined;
    if (payload.question.id === 'T01' && payload.isCorrect) {
      const rubric = computeT01Rubric({
        angleCInput: '75',
        acInput: String(payload.answerRaw ?? ''),
        hasFixedUnit: Boolean(payload.question.fixedUnitLabel),
        explanation: payload.explanationText ?? '',
      });
      setT01Rubric(rubric);
      rubricScore = rubric.total;
      setT01ExplanationSaved(payload.explanationText ?? '');

      if (payload.explanationText && settings.aiEnabled) {
        try {
          const token = await dataService.getAccessToken();
          const resp = await fetch('/api/ai/review-open', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? {Authorization: `Bearer ${token}`} : {}),
            },
            body: JSON.stringify({
              stem: payload.question.stem_vi,
              expectedSolution: payload.question.solution_vi,
              studentExplanation: payload.explanationText,
              maxDaily: settings.aiDailyQuotaLimit,
            }),
          });
          if (resp.ok) {
            const data = (await resp.json()) as {comment_vi?: string};
            if (data.comment_vi) setT01AiComment(data.comment_vi);
          }
        } catch {
          // Optional AI review fails gracefully without affecting grading
        }
      }
    }

    if (payload.usedHint || payload.clickedDontKnow || payload.switchedToPractice) {
      usedSupportRef.current = true;
    }

    const {user: nextUser} = dataService.recordAttempt({
      userId: user.uid,
      studentCode: user.studentCode,
      isTestAccount: user.isTestAccount,
      questionId: payload.question.id,
      cluster: payload.question.cluster,
      stationId: station.id,
      mocId: activeMocId,
      mode: payload.mode,
      switchedToPractice: payload.switchedToPractice,
      seed: payload.question.seed,
      answerRaw: payload.answerRaw,
      isCorrect: payload.isCorrect,
      usedHint: payload.usedHint,
      clickedDontKnow: payload.clickedDontKnow,
      wrongCountOnQuestion: payload.wrongCountOnQuestion,
      errorCode: payload.errorCode,
      durationMs: payload.durationMs,
      rubricScore,
    });
    if (nextUser) onUserUpdated(nextUser);

    if (payload.isCorrect) {
      if (subQueue) {
        setSubCleared(true);
      } else {
        setStepCleared(true);
      }
    }
  };

  const handlePause = (draftAnswer: unknown, mode: QuestionMode) => {
    const updated = dataService.savePausedSession(user.uid, {
      kind: 'mission',
      stationId: station.id,
      mocId: activeMocId,
      stepIndex: stepIdx,
      savedAt: new Date().toISOString(),
      draftAnswer,
      mode,
    });
    if (updated) onUserUpdated(updated);
    onBackToMap();
  };

  const handleRebuttalSubmit = (data: {
    questionId: string;
    questionStem: string;
    studentAnswer: string;
    contestedFeedback: string;
    reasoning: string;
  }) => {
    dataService.submitRebuttal({
      userId: user.uid,
      studentCode: user.studentCode,
      displayName: user.displayName,
      ...data,
    });
  };

  const openRemediationBranch = (_q: QuestionItem, errorCode?: string) => {
    const isPairing = errorCode === 'E01' || errorCode === 'E04';
    const ids = isPairing ? ['R01', 'R02'] : ['R03', 'R04'];
    const items = ids.map(findQuestionById).filter((x): x is QuestionItem => Boolean(x));
    if (items.length === 0) return;
    setSubTitle(
      isPairing
        ? 'S07 Bổ trợ nhánh 1: Luyện ghép cặp cạnh–góc đối diện (R01 → R02)'
        : 'S07 Bổ trợ nhánh 2: Luyện biến đổi tỉ số & làm tròn (R03 → R04)',
    );
    setSubQueue(items);
    setSubIndex(0);
    setSubCleared(false);
  };

  const openWarmupFoundation = () => {
    const items = ['P01', 'P02', 'P03', 'P04']
      .map(findQuestionById)
      .filter((x): x is QuestionItem => Boolean(x));
    setSubTitle('Khởi động nền tảng (P01 → P04 · Tùy chọn)');
    setSubQueue(items);
    setSubIndex(0);
    setSubCleared(false);
  };

  const finishStationMission = () => {
    const res = dataService.recordMocMissionComplete(user.uid, activeMocId, {
      usedSupport: usedSupportRef.current,
    });
    if (res.user) {
      onUserUpdated(res.user);
    }
    if (res.newlyPassedMoc) {
      onMocPassed?.(activeMocId, res.newlyCompletedAll);
    }

    if (isBS01Mode) {
      dataService.saveSurveyReport({
        userId: user.uid,
        stationId: 'BS01',
        measuredAB: 60,
        measuredAngleA: 50,
        measuredAngleB: 60,
        computedAngleC: 70,
        computedAC: 55.3,
        t01RubricScore: t01Rubric?.total,
        t01Explanation: t01ExplanationSaved,
        t02Agreed: true,
      });
    }

    if (res.rewardGranted) {
      soundEngine.playChestOpen();
      setChestModal({
        xp: 35,
        toolName: mocDef.toolRewardId,
        landmark: `Mốc ${mocDef.id}: ${mocDef.city}`,
      });
    }
  };

  // ---- SUB-QUEUE VIEW (S07 Remediation or P01-P04 Warmup) ----
  if (subQueue) {
    const currentSub = subQueue[subIndex];
    return (
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="notebook-card-warm p-3.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase text-[#8A5108]">{subTitle}</p>
            <p className="text-sm font-bold text-[#14284A]">
              Câu {subIndex + 1}/{subQueue.length} · Hoàn thành xong sẽ quay lại đúng bước chính
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSubQueue(null)}
            className="btn-tactile btn-paper text-xs py-2 px-3"
          >
            Quay lại bước chính
          </button>
        </div>

        <QuestionCard
          question={currentSub}
          initialMode="practice"
          helpAfterWrong={settings.helpAfterWrong}
          onComplete={handleRecordSubmission}
          onPause={handlePause}
          onRebuttalSubmit={handleRebuttalSubmit}
        />

        {subCleared && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (subIndex < subQueue.length - 1) {
                  setSubIndex((i) => i + 1);
                  setSubCleared(false);
                } else {
                  setSubQueue(null);
                }
              }}
              className="btn-tactile btn-jade"
            >
              {subIndex < subQueue.length - 1 ? 'Sang câu bổ trợ tiếp theo →' : 'Hoàn thành bổ trợ · Về bước chính →'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- NON-BS01 MILESTONE MISSION (Mốc 1–5, 7–10) ----
  if (!isBS01Mode) {
    const isFinished = stepIdx >= genericQuestions.length;
    const currentQ = genericQuestions[stepIdx];
    const nextMocId = activeMocId < 10 ? ((activeMocId + 1) as MocId) : null;
    return (
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="notebook-card p-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase text-[#18685B]">
              Nhiệm vụ Mốc {mocDef.id} · {mocDef.city} ({mocDef.lessonRef})
            </p>
            <h1 className="font-display text-2xl font-extrabold text-[#14284A]">{mocDef.sceneName}</h1>
          </div>
          <button type="button" onClick={onBackToMap} className="btn-tactile btn-paper text-xs py-2 px-3">
            <ArrowLeft className="w-4 h-4" /> Bản đồ
          </button>
        </div>

        {!isFinished && currentQ ? (
          <>
            <div className="flex items-center gap-1.5">
              {genericQuestions.map((q, i) => (
                <div
                  key={`${q.id}-${i}`}
                  className={`h-2.5 flex-1 rounded-full border border-[#14284A]/25 ${
                    i < stepIdx ? 'bg-[#2E9C8A]' : i === stepIdx ? 'bg-[#E0A93B]' : 'bg-[#F7E7B8]'
                  }`}
                />
              ))}
            </div>
            <QuestionCard
              question={currentQ}
              initialMode={
                mocDef.independentFocus || stepIdx === genericQuestions.length - 1 ? 'verify' : 'practice'
              }
              helpAfterWrong={settings.helpAfterWrong}
              onComplete={handleRecordSubmission}
              onPause={handlePause}
              onRebuttalSubmit={handleRebuttalSubmit}
            />
            {stepCleared && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (stepIdx + 1 >= genericQuestions.length) {
                      finishStationMission();
                    }
                    setStepIdx((i) => i + 1);
                    setStepCleared(false);
                  }}
                  className="btn-tactile btn-jade"
                >
                  {stepIdx + 1 >= genericQuestions.length
                    ? `Hoàn thành nhiệm vụ Mốc ${mocDef.id}`
                    : 'Tiếp tục câu kế tiếp →'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="notebook-card p-6 text-center space-y-4">
            <div className="inline-block red-stamp px-4 py-1.5 text-sm">
              {mocBoss ? 'HOÀN THÀNH NHIỆM VỤ · MỞ BOSS' : `ĐÃ QUA MỐC ${mocDef.id}`}
            </div>
            <h2 className="font-display text-2xl font-extrabold text-[#14284A]">
              Em đã hoàn thành khảo sát tại Mốc {mocDef.id}: {mocDef.city}!
            </h2>
            <p className="text-sm text-[#5B6B82]">
              {mocBoss
                ? `Đài thử thách ${mocBoss.name} đã mở khóa! Hạ BOSS để ghi dấu hoàn thành Mốc ${mocDef.id} và mở mốc kế tiếp.`
                : nextMocId
                  ? `Tuyệt vời! Mốc ${nextMocId} (${JOURNEY_MILESTONES_BY_ID[nextMocId].city}) đã mở khóa trên bản đồ hành trình.`
                  : 'Em đã hoàn thành nhiệm vụ của mốc này!'}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {mocBoss && (
                <button type="button" onClick={onGoToBoss} className="btn-tactile btn-ink">
                  <Swords className="w-4 h-4 text-[#E0A93B]" /> Vào đấu BOSS: {mocBoss.name}
                </button>
              )}
              <button type="button" onClick={onBackToMap} className="btn-tactile btn-jade">
                {mocBoss ? 'Quay lại bản đồ' : 'Xem bước tiếp theo trên bản đồ →'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- FULL BS01 S01–S08 FLOW ----
  const safeStepIdx = Math.min(stepIdx, BS01_STEP_LIST.length - 1);
  const currentStep = BS01_STEP_LIST[safeStepIdx];
  const currentQuestion = currentStep.questionId ? findQuestionById(currentStep.questionId) : undefined;

  const advanceBS01 = () => {
    const nextIdx = safeStepIdx + 1;
    if (nextIdx === BS01_STEP_LIST.length - 1) {
      finishStationMission();
    }
    setStepIdx(Math.min(nextIdx, BS01_STEP_LIST.length - 1));
    setStepCleared(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      {/* Header + Step Progress Bar */}
      <div className="notebook-card p-4 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
              Mốc 6: Huế · Bến sông Hương (BS01 · S01–S08)
            </p>
            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#14284A]">
              {currentStep.code}: {currentStep.label}
            </h1>
          </div>
          <button type="button" onClick={onBackToMap} className="btn-tactile btn-paper text-xs py-2 px-3">
            <ArrowLeft className="w-4 h-4" /> Về bản đồ
          </button>
        </div>

        {/* Clickable step rail (non-punitive exploration) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {BS01_STEP_LIST.map((st, idx) => (
            <button
              key={st.key}
              type="button"
              onClick={() => {
                setStepIdx(idx);
                setStepCleared(false);
              }}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold border !min-h-[34px] ${
                idx === safeStepIdx
                  ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                  : idx < safeStepIdx
                    ? 'bg-[#E6F6F3] text-[#1F7A6B] border-[#2E9C8A]'
                    : 'bg-[#FFFBF0] text-[#5B6B82] border-[#D9C293]'
              }`}
            >
              {st.code}
            </button>
          ))}
        </div>
      </div>

      {/* S01 INTRO */}
      {currentStep.key === 'S01_INTRO' && (
        <div className="notebook-card p-5 space-y-4">
          <h2 className="font-display text-2xl font-extrabold text-[#14284A]">
            Nhiệm vụ BS01: Đo khoảng cách qua Bến sông Hương (mô phỏng)
          </h2>
          <p className="text-[15px] leading-relaxed text-[#1B2A41]">
            Em đứng tại bến sông (mô phỏng học tập). Điểm <strong>A</strong> và điểm <strong>B</strong> nằm cùng phía trên bờ nên có thể đi lại và đo trực tiếp. Điểm <strong>C</strong> là cột mốc bên kia sông không thể căng thước dây qua được.
          </p>
          <p className="text-[15px] leading-relaxed text-[#1B2A41]">
            Nhiệm vụ của em là đi qua đủ 8 bước: khảo sát phương án → đo đường đáy và hai góc ngắm → lập mô hình tam giác → áp dụng <strong>Định lý Sin</strong> tính khoảng cách <strong>AC</strong> → tự kiểm chứng với 2 tình huống mới (T01, T02 — có thể chuyển sang chế độ luyện nếu cần gợi ý).
          </p>

          {skipWarmup && (
            <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#145B4F]">
              ✓ Em đã có minh chứng kỹ năng nền tảng từ các mốc trước — bỏ qua khởi động P01–P04 và vào thẳng bước S02 nhé!
            </div>
          )}

          <TriangleDiagram
            vertices={['A', 'B', 'C']}
            coords={[BS01_COORDS.A, BS01_COORDS.B, BS01_COORDS.C]}
            labels={{AB: 'Trên bờ', AC: 'Cần tính'}}
            showRiverBank
          />

          <div className="flex flex-wrap gap-3 pt-1">
            <button type="button" onClick={advanceBS01} className="btn-tactile btn-jade flex-1">
              Bắt đầu bước S02 (Khảo sát M01) →
            </button>
            {!skipWarmup && (
              <button type="button" onClick={openWarmupFoundation} className="btn-tactile btn-amber">
                Ôn nhanh nền tảng (P01–P04)
              </button>
            )}
          </div>
        </div>
      )}

      {/* S04 2D MODELING */}
      {currentStep.key === 'S04_MODEL' && (
        <div className="notebook-card p-5 space-y-4">
          <h2 className="font-display text-2xl font-extrabold text-[#14284A]">
            S04: Chuyển dữ kiện thực địa sang mô hình tam giác 2D
          </h2>
          <p className="text-[15px] text-[#1B2A41] leading-relaxed">
            Từ số đo mô phỏng vừa ghi ở bước S03 (<MathText text="$AB = 60\text{ m}, \widehat{A} = 50^\circ, \widehat{B} = 60^\circ$" />), ta dựng tam giác $ABC$ phẳng trên mặt đất. Hãy thử bấm nút <strong>Xoay</strong> trên hình để thấy rằng dù nhìn từ hướng nào, độ dài các cạnh và số đo ba góc vẫn giữ nguyên!
          </p>
          <TriangleDiagram
            vertices={['A', 'B', 'C']}
            coords={[BS01_COORDS.A, BS01_COORDS.B, BS01_COORDS.C]}
            highlightSide={[0, 2]}
            labels={{AB: '60 m', AC: '?', A: '50°', B: '60°', C: '?'}}
            showRiverBank
          />
          <div className="p-3.5 rounded-xl bg-[#FFF4D6] border border-[#E0A93B] text-sm text-[#14284A]">
            <strong>Ghi nhớ trước khi giải:</strong>{' '}
            <MathText text="Để áp dụng Định lý Sin tìm $AC$, trước tiên ta cần biết góc đối diện cạnh $AB$ (chính là góc $\widehat{C}$)." />
          </div>
          <button type="button" onClick={advanceBS01} className="btn-tactile btn-jade w-full">
            Đã hiểu mô hình · Sang bước S05a (Tính góc C) →
          </button>
        </div>
      )}

      {/* QUESTION STEPS (S02, S03, S05a-c, S06, S08a-b) */}
      {currentQuestion && (
        <div className="space-y-4">
          <QuestionCard
            question={currentQuestion}
            initialMode={currentStep.mode ?? 'practice'}
            helpAfterWrong={settings.helpAfterWrong}
            onComplete={handleRecordSubmission}
            onPause={handlePause}
            onRequestEasier={openRemediationBranch}
            onRebuttalSubmit={handleRebuttalSubmit}
            requireExplanation={currentQuestion.id === 'T01'}
            showRiverBankDiagram={['M01', 'M02', 'M06'].includes(currentQuestion.id)}
          />

          {/* Show T01 10-point skill rubric separately from XP */}
          {currentQuestion.id === 'T01' && t01Rubric && (
            <div className="notebook-card-warm p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-extrabold text-[#14284A]">
                  Rubric đánh giá kỹ năng câu T01 (tách riêng với XP)
                </h3>
                <span className="px-3 py-1 rounded-xl bg-[#14284A] text-[#FFFBF0] font-extrabold text-sm tabular-nums">
                  {t01Rubric.total}/10 điểm kỹ năng
                </span>
              </div>
              <ul className="space-y-1.5 text-sm">
                {t01Rubric.items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-[#1B2A41]">
                    <span>
                      {it.achieved ? '✓ ' : '○ '}
                      {it.criterion}
                    </span>
                    <span className="font-bold tabular-nums shrink-0">
                      {it.points}/{it.max}
                    </span>
                  </li>
                ))}
              </ul>
              {t01AiComment && (
                <p className="p-3 rounded-xl bg-white border border-[#D9C293] text-xs text-[#1F3B63]">
                  <strong>Gợi ý nhận xét lập luận (chờ giáo viên đối chiếu):</strong> {t01AiComment}
                </p>
              )}
            </div>
          )}

          {stepCleared && (
            <div className="flex justify-end">
              <button type="button" onClick={advanceBS01} className="btn-tactile btn-jade">
                <CheckCircle2 className="w-5 h-5" />
                {safeStepIdx === BS01_STEP_LIST.length - 2
                  ? 'Hoàn tất & Xem Phiếu khảo sát →'
                  : 'Tiếp tục bước kế tiếp →'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* SURVEY REPORT + OPEN SURVEY MODE (B slides in [50, 100]) */}
      {currentStep.key === 'REPORT_OPEN_SURVEY' && (
        <div className="space-y-5">
          {/* Printable Survey Report */}
          <div className="notebook-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5D3A8] pb-3">
              <div>
                <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
                  Phiếu kết quả khảo sát mô phỏng · Trạm BS01
                </p>
                <h2 className="font-display text-2xl font-extrabold text-[#14284A]">
                  Bến sông Vàm Cỏ Đông
                </h2>
                <p className="text-xs text-[#5B6B82]">
                  Học viên: <strong>{user.displayName}</strong> · Mã nội bộ: {user.studentCode}
                </p>
              </div>
              <div className="flex items-center gap-2 no-print">
                <div className="red-stamp px-3 py-1 text-xs">HOÀN THÀNH</div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-tactile btn-paper text-xs py-2 px-3"
                >
                  <Printer className="w-4 h-4" /> In / Lưu phiếu
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-sm">
              <div className="p-3 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3]">
                <span className="text-xs text-[#5B6B82] block">Đường đáy AB</span>
                <strong className="text-[#14284A] tabular-nums">60 m</strong>
              </div>
              <div className="p-3 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3]">
                <span className="text-xs text-[#5B6B82] block">Hai góc ngắm</span>
                <strong className="text-[#14284A] tabular-nums">∠A = 50° · ∠B = 60°</strong>
              </div>
              <div className="p-3 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3]">
                <span className="text-xs text-[#5B6B82] block">Góc đối diện AB</span>
                <strong className="text-[#14284A] tabular-nums">∠C = 70°</strong>
              </div>
              <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A]">
                <span className="text-xs text-[#1F7A6B] block">Khoảng cách AC</span>
                <strong className="text-[#14284A] tabular-nums">≈ 55,3 m</strong>
              </div>
            </div>

            <p className="text-xs text-[#5B6B82]">
              <MathText text="Ghi chú hình học: $AC \approx 55,3\text{ m}$ là khoảng cách đường ngắm xiên từ $A$ đến $C$, khác với bề rộng vuông góc $CH \approx 42,4\text{ m}$. Số đo mang tính mô phỏng học tập." />
            </p>
          </div>

          {/* Open Survey Mode: Slide B along [50, 100] keeping A & C fixed */}
          <div className="notebook-card p-5 space-y-4 no-print">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-[#2E9C8A]" />
              <h3 className="font-display text-xl font-extrabold text-[#14284A]">
                Chế độ khảo sát mở: Thử đặt lại vị trí cọc B trên bờ
              </h3>
            </div>
            <p className="text-sm text-[#1B2A41]">
              Giữ cố định điểm <strong>A</strong> và điểm <strong>C</strong> bên kia sông, kéo thanh trượt để dời cọc <strong>B</strong> từ 50 m đến 100 m. Quan sát xem độ dài <strong>AB</strong> và các góc <strong>∠B, ∠C</strong> thay đổi ra sao, còn khoảng cách <strong>AC</strong> thì thế nào!
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-bold text-[#14284A]">
                <span>Vị trí cọc B trên bờ (AB):</span>
                <span className="tabular-nums text-[#2E9C8A]">{slideBx} m</span>
              </div>
              <input
                type="range"
                min={B_SLIDE_MIN}
                max={B_SLIDE_MAX}
                step={1}
                value={slideBx}
                onChange={(e) => setSlideBx(Number(e.target.value))}
                className="w-full accent-[#2E9C8A] h-3 cursor-pointer"
                aria-label="Kéo vị trí điểm B từ 50 đến 100 mét"
              />
              <div className="flex justify-between text-xs text-[#5B6B82] tabular-nums">
                <span>50 m</span>
                <span>60 m (Chuẩn)</span>
                <span>100 m</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <TriangleDiagram
                vertices={['A', 'B', 'C']}
                coords={[openSurveyTri.A, openSurveyTri.B, openSurveyTri.C]}
                highlightSide={[0, 2]}
                showPerpendicularH
                showRiverBank
                labels={{
                  AB: `${Math.round(openSurveyTri.AB)} m`,
                  AC: `${formatViNumber(openSurveyTri.AC, 1)} m`,
                  A: `${formatViNumber(openSurveyTri.angleA, 1)}°`,
                  B: `${formatViNumber(openSurveyTri.angleB, 1)}°`,
                  C: `${formatViNumber(openSurveyTri.angleC, 1)}°`,
                }}
              />

              <div className="space-y-2.5 text-sm">
                <div className="p-3 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3] space-y-1 tabular-nums">
                  <p>
                    Đường đáy thay đổi: <strong>AB = {formatViNumber(openSurveyTri.AB, 1)} m</strong>
                  </p>
                  <p>
                    Góc tại B thay đổi: <strong>∠B = {formatViNumber(openSurveyTri.angleB, 1)}°</strong>
                  </p>
                  <p>
                    Góc tại C thay đổi: <strong>∠C = {formatViNumber(openSurveyTri.angleC, 1)}°</strong>
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#E6F6F3] border-2 border-[#2E9C8A] tabular-nums">
                  <p className="text-xs font-bold text-[#1F7A6B] uppercase">Bất biến thực tế</p>
                  <p className="text-lg font-extrabold text-[#14284A]">
                    AC = {formatViNumber(roundToPlaces(openSurveyTri.AC, 1), 1)} m (không đổi!)
                  </p>
                  <p className="text-xs text-[#1B2A41] mt-1">
                    Dù chọn vị trí cọc B khác nhau trên bờ, Định lý Sin luôn cho cùng một khoảng cách AC.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSlideBx(60)}
                  className="btn-tactile btn-paper text-xs py-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Đặt lại B = 60 m
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2 border-t border-[#E5D3A8]">
              <button type="button" onClick={onGoToBoss} className="btn-tactile btn-ink flex-1">
                <Swords className="w-5 h-5 text-[#E0A93B]" />
                Vào đấu BOSS Thuồng Luồng Bến Sông
              </button>
              <button type="button" onClick={onBackToMap} className="btn-tactile btn-paper">
                Quay lại bản đồ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHEST01 Reward Modal */}
      {chestModal && (
        <div className="fixed inset-0 z-50 bg-[#14284A]/55 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="notebook-card max-w-md w-full p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] flex items-center justify-center">
              <Gift className="w-9 h-9 text-[#C8392B]" />
            </div>
            <h2 className="font-display text-2xl font-extrabold text-[#14284A]">
              Mở Rương Khảo Sát (CHEST01)!
            </h2>
            <p className="text-sm text-[#1B2A41]">
              Chúc mừng em hoàn thành nhiệm vụ trạm <strong>{chestModal.landmark}</strong>!
            </p>
            <div className="p-3.5 rounded-xl bg-[#FFF4D6] border border-[#E0A93B] text-sm font-bold text-[#14284A] space-y-1">
              <p className="flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#B9831E]" /> +{chestModal.xp} XP hành trình
              </p>
              <p>+ Thẻ Địa danh {chestModal.landmark}</p>
              <p>+ Công cụ khảo sát mới trong Túi đồ</p>
            </div>
            <button type="button" onClick={() => setChestModal(null)} className="btn-tactile btn-jade w-full">
              Nhận thưởng & Tiếp tục
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

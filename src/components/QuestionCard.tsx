import React from 'react';
import {
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  MessageSquareWarning,
  Pause,
} from 'lucide-react';
import {gradeQuestion, shouldOfferHelp} from '../math/grader.ts';
import type {GradeResult, QuestionItem, QuestionMode} from '../types.ts';
import {soundEngine} from '../utils/audio.ts';
import {MathText} from './MathText.tsx';
import {TriangleDiagram} from './TriangleDiagram.tsx';

export interface QuestionSubmissionPayload {
  question: QuestionItem;
  mode: QuestionMode;
  switchedToPractice: boolean;
  answerRaw: unknown;
  isCorrect: boolean;
  usedHint: boolean;
  clickedDontKnow: boolean;
  wrongCountOnQuestion: number;
  errorCode?: string;
  durationMs: number;
  explanationText?: string;
}

interface QuestionCardProps {
  question: QuestionItem;
  initialMode?: QuestionMode;
  helpAfterWrong?: number;
  onComplete: (payload: QuestionSubmissionPayload) => void;
  onPause?: (draftAnswer: unknown, mode: QuestionMode) => void;
  onRequestEasier?: (question: QuestionItem, errorCode?: string) => void;
  onRebuttalSubmit?: (data: {
    questionId: string;
    questionStem: string;
    studentAnswer: string;
    contestedFeedback: string;
    reasoning: string;
  }) => void;
  requireExplanation?: boolean;
  showRiverBankDiagram?: boolean;
  actionLabel?: string;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  initialMode = 'practice',
  helpAfterWrong = 2,
  onComplete,
  onPause,
  onRequestEasier,
  onRebuttalSubmit,
  requireExplanation = false,
  showRiverBankDiagram = false,
  actionLabel = 'Kiểm tra câu trả lời',
}) => {
  const [mode, setMode] = React.useState<QuestionMode>(initialMode);
  const [switchedToPractice, setSwitchedToPractice] = React.useState(false);
  const [startTime] = React.useState(() => Date.now());

  // Inputs by type
  const [textAnswer, setTextAnswer] = React.useState('');
  const [selectedChoice, setSelectedChoice] = React.useState('');
  const [trueFalseMap, setTrueFalseMap] = React.useState<Record<string, boolean>>({});
  const [matchingMap, setMatchingMap] = React.useState<Record<string, string>>({});
  const [fillLeft, setFillLeft] = React.useState<number | undefined>(undefined);
  const [fillRight, setFillRight] = React.useState<number | undefined>(undefined);
  const [measureAB, setMeasureAB] = React.useState('');
  const [measureA, setMeasureA] = React.useState('');
  const [measureB, setMeasureB] = React.useState('');
  const [unitAB, setUnitAB] = React.useState('m');
  const [unitA, setUnitA] = React.useState('°');
  const [unitB, setUnitB] = React.useState('°');
  const [surveyPoints, setSurveyPoints] = React.useState<string[]>([]);
  const [surveyPointWarn, setSurveyPointWarn] = React.useState('');
  const [tapeSlider, setTapeSlider] = React.useState(20);
  const [sightRayA, setSightRayA] = React.useState(15);
  const [sightRayB, setSightRayB] = React.useState(15);
  const [agreeChoice, setAgreeChoice] = React.useState<boolean | null>(null);
  const [agreeAngleC, setAgreeAngleC] = React.useState('');
  const [explanationText, setExplanationText] = React.useState('');

  // Pedagogical states
  const [wrongCount, setWrongCount] = React.useState(0);
  const [hintIndex, setHintIndex] = React.useState(-1);
  const [usedHint, setUsedHint] = React.useState(false);
  const [feedback, setFeedback] = React.useState<GradeResult | null>(null);
  const [dontKnowShown, setDontKnowShown] = React.useState(false);
  const [solved, setSolved] = React.useState(false);
  const [discriminationAsked, setDiscriminationAsked] = React.useState(false);

  // Modals
  const [showVerifyHintModal, setShowVerifyHintModal] = React.useState(false);
  const [showRebuttalModal, setShowRebuttalModal] = React.useState(false);
  const [rebuttalReasoning, setRebuttalReasoning] = React.useState('');
  const [rebuttalSent, setRebuttalSent] = React.useState(false);

  // Reset when question changes
  React.useEffect(() => {
    setMode(initialMode);
    setSwitchedToPractice(false);
    setTextAnswer('');
    setSelectedChoice('');
    setTrueFalseMap({});
    setMatchingMap({});
    setFillLeft(undefined);
    setFillRight(undefined);
    setMeasureAB('');
    setMeasureA('');
    setMeasureB('');
    setUnitAB('m');
    setUnitA('°');
    setUnitB('°');
    setSurveyPoints([]);
    setSurveyPointWarn('');
    setTapeSlider(20);
    setSightRayA(15);
    setSightRayB(15);
    setAgreeChoice(null);
    setAgreeAngleC('');
    setExplanationText('');
    setWrongCount(0);
    setHintIndex(-1);
    setUsedHint(false);
    setFeedback(null);
    setDontKnowShown(false);
    setSolved(false);
    setDiscriminationAsked(false);
    setShowVerifyHintModal(false);
    setShowRebuttalModal(false);
    setRebuttalReasoning('');
    setRebuttalSent(false);
  }, [question.id, initialMode]);

  const getCurrentResponse = (): unknown => {
    switch (question.type) {
      case 'mcq':
      case 'error_spot':
      case 'tap_diagram':
        return selectedChoice;
      case 'true_false_multi':
        return trueFalseMap;
      case 'matching':
        return matchingMap;
      case 'fill_relation':
        return {left: fillLeft, right: fillRight};
      case 'measurement':
        return {AB: measureAB, A: measureA, B: measureB, unitAB, unitA, unitB};
      case 'agree_explain':
        return {agree: agreeChoice, cAngle: agreeAngleC, explanation: explanationText};
      default:
        return textAnswer;
    }
  };

  const revealNextHint = () => {
    setUsedHint(true);
    setHintIndex((prev) => Math.min(question.hints_vi.length - 1, prev + 1));
    soundEngine.playGentleHint();
  };

  const handleHintClick = () => {
    if (mode === 'verify' && !usedHint) {
      setShowVerifyHintModal(true);
      return;
    }
    revealNextHint();
  };

  const confirmSwitchToPracticeForHint = () => {
    setShowVerifyHintModal(false);
    setMode('practice');
    setSwitchedToPractice(true);
    revealNextHint();
  };

  const handleDontKnow = () => {
    setDontKnowShown(true);
    setUsedHint(true);
    if (mode === 'verify') {
      setMode('practice');
      setSwitchedToPractice(true);
    }
    setHintIndex(0);
    soundEngine.playGentleHint();
    setFeedback({
      isCorrect: false,
      feedback_vi:
        'Không sao cả! Bấm "Em chưa biết" không tính là sai. Hãy xem gợi ý bước đầu bên dưới hoặc chọn "Bài dễ hơn" để làm quen trước nhé.',
    });
  };

  const handleCheck = () => {
    const raw = getCurrentResponse();
    const res = gradeQuestion(question, raw);
    setFeedback(res);

    if (res.isCorrect) {
      setSolved(true);
      soundEngine.playCorrect();
      onComplete({
        question,
        mode,
        switchedToPractice,
        answerRaw: raw,
        isCorrect: true,
        usedHint,
        clickedDontKnow: dontKnowShown,
        wrongCountOnQuestion: wrongCount,
        durationMs: Date.now() - startTime,
        explanationText: explanationText.trim() || undefined,
      });
    } else {
      const nextWrongs = wrongCount + 1;
      setWrongCount(nextWrongs);
      soundEngine.playGentleHint();
      if (res.needsDiscriminationE01) {
        setDiscriminationAsked(true);
      }
      onComplete({
        question,
        mode,
        switchedToPractice,
        answerRaw: raw,
        isCorrect: false,
        usedHint,
        clickedDontKnow: dontKnowShown,
        wrongCountOnQuestion: nextWrongs,
        errorCode: res.errorCode,
        durationMs: Date.now() - startTime,
        explanationText: explanationText.trim() || undefined,
      });
    }
  };

  const handleSendRebuttal = () => {
    if (!rebuttalReasoning.trim()) return;
    onRebuttalSubmit?.({
      questionId: question.id,
      questionStem: question.stem_vi,
      studentAnswer: JSON.stringify(getCurrentResponse()),
      contestedFeedback: feedback?.feedback_vi ?? 'Chưa có nhận xét',
      reasoning: rebuttalReasoning.trim(),
    });
    setRebuttalSent(true);
    setShowRebuttalModal(false);
    setRebuttalReasoning('');
  };

  const offerHelpBanner = !solved && shouldOfferHelp(wrongCount, helpAfterWrong);

  return (
    <div className="notebook-card p-4 sm:p-5 space-y-4">
      {/* Top metadata row: Mode + TEST status */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E5D3A8]">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span
            className={
              mode === 'verify'
                ? 'px-2.5 py-1 rounded-md bg-[#14284A] text-[#FFFBF0]'
                : 'px-2.5 py-1 rounded-md bg-[#E8F5F2] text-[#1F7A6B] border border-[#2E9C8A]/40'
            }
          >
            {mode === 'verify' ? 'Chế độ kiểm chứng (không gợi ý)' : 'Chế độ luyện tập'}
          </span>
          {switchedToPractice && (
            <span className="px-2 py-1 rounded-md bg-[#FFF4D6] text-[#8A5108] border border-[#E0A93B]">
              Đã chuyển sang Luyện tập (có hỗ trợ)
            </span>
          )}
          {question.review_status === 'pending_teacher_review' && (
            <span className="px-2 py-1 rounded-md bg-[#FFF3DB] text-[#8A5108] border border-[#D98A1F]">
              TEST · Chờ Admin duyệt
            </span>
          )}
        </div>
      </div>

      {/* Explicit allowed-tools rule strip distinguishing Practice vs Verify */}
      <p
        className={`text-[11px] font-semibold px-3 py-1.5 rounded-xl border ${
          mode === 'verify'
            ? 'bg-[#EEF3FA] border-[#B6C8E2] text-[#14284A]'
            : 'bg-[#F5FBF9] border-[#B8E2D8] text-[#1F7A6B]'
        }`}
      >
        {mode === 'verify'
          ? 'Quy tắc kiểm chứng: Chỉ dùng máy tính bỏ túi (chế độ độ DEG) và giấy nháp. Không mở gợi ý — nếu mở gợi ý, lượt này tự đổi nhãn sang "Làm được có hỗ trợ" và không tính tự giải độc lập.'
          : 'Quy tắc luyện tập: Em được xem gợi ý từng bước, bảng công thức và làm bài bổ trợ để hiểu chắc phương pháp.'}
      </p>

      {/* Question stem */}
      <div className="text-[17px] leading-relaxed font-medium text-[#14284A]">
        <MathText text={question.stem_vi} />
      </div>

      {/* Optional 2D geometric diagram */}
      {question.diagramData && (
        <TriangleDiagram
          vertices={question.diagramData.vertices}
          coords={question.diagramData.coords}
          highlightSide={question.diagramData.highlightSide}
          highlightAngleIndex={question.diagramData.highlightAngleIndex}
          showPerpendicularH={question.diagramData.showPerpendicularH}
          interactiveMode={question.diagramData.interactiveMode}
          labels={question.diagramData.labels}
          selectedVertex={selectedChoice}
          onSelectVertex={(v) => setSelectedChoice(v)}
          showRiverBank={showRiverBankDiagram}
        />
      )}

      {/* Input UI by question type */}
      {question.type === 'numeric' && (() => {
        const expectedUnitRaw = question.expected_answer?.unit
          ? String(question.expected_answer.unit)
          : '';
        const needsFreeUnit = Boolean(expectedUnitRaw && !question.fixedUnitLabel);
        const quickUnits = ['m', 'cm', 'km', 'm²', '°'];
        const applyQuickUnit = (u: string) => {
          const baseNum = textAnswer.trim().replace(/\s*[a-zA-ZÀ-ỹ°^2²]+$/, '').trim();
          setTextAnswer(baseNum ? `${baseNum} ${u}` : u);
        };
        return (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[#1F3B63]">
              Nhập kết quả của em (dùng dấu phẩy hoặc dấu chấm đều được):
            </label>
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                inputMode={needsFreeUnit ? 'text' : 'decimal'}
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={solved}
                placeholder={question.fixedUnitLabel ? 'Ví dụ: 55,3' : 'Ví dụ: 6,5 m'}
                className="flex-1 min-w-0 w-full px-3.5 py-3 rounded-xl bg-white border-2 border-[#CBB17D] text-lg font-bold text-[#14284A] tabular-nums"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !solved) handleCheck();
                }}
              />
              {question.fixedUnitLabel && (
                <span className="shrink-0 px-3.5 py-3 rounded-xl bg-[#FFF4D6] border-2 border-[#D5B87E] font-bold text-[#14284A] text-base sm:text-lg">
                  {question.fixedUnitLabel}
                </span>
              )}
            </div>
            {needsFreeUnit && !solved && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-[#5B6B82]">Chọn nhanh đơn vị:</span>
                {quickUnits.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => applyQuickUnit(u)}
                    className="px-3 py-1 rounded-lg bg-[#FFF4D6] border border-[#D5B87E] font-extrabold text-[#14284A] hover:bg-[#FCE8B2] !min-h-[34px]"
                  >
                    + {u}
                  </button>
                ))}
              </div>
            )}
            {requireExplanation && (
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-[#1F3B63]">
                  Giải thích ngắn cách tính (1–2 câu):
                </label>
                <textarea
                  rows={2}
                  value={explanationText}
                  onChange={(e) => setExplanationText(e.target.value)}
                  disabled={solved}
                  placeholder="Ví dụ: Em tính góc C = 75°, rồi ghép AC đối diện góc B = 60° theo Định lý Sin..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-sm text-[#14284A]"
                />
              </div>
            )}
          </div>
        );
      })()}

      {(question.type === 'mcq' || question.type === 'error_spot') && question.options && (
        <div className="space-y-2.5" role="radiogroup" aria-label="Các phương án trả lời">
          {question.options.map((opt, idx) => {
            const active = selectedChoice === opt.id;
            const letter = String.fromCharCode(65 + idx);
            return (
              <button
                key={opt.id}
                type="button"
                disabled={solved}
                onClick={() => setSelectedChoice(opt.id)}
                className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-all flex items-start gap-3 ${
                  active
                    ? 'bg-[#E6F6F3] border-[#2E9C8A] text-[#14284A] shadow-[0_3px_0_#1F7A6B]'
                    : 'bg-white border-[#D9C293] text-[#1B2A41] hover:bg-[#FFF8E6]'
                }`}
              >
                <span
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-extrabold border-2 ${
                    active
                      ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                      : 'bg-[#FFF4D6] text-[#14284A] border-[#CBB17D]'
                  }`}
                >
                  {letter}
                </span>
                <span className="pt-0.5 text-[15px] leading-snug">
                  <MathText text={opt.label} />
                </span>
              </button>
            );
          })}
          {(requireExplanation || question.type === 'error_spot') && (
            <div className="space-y-1.5 pt-2">
              <label className="block text-sm font-semibold text-[#1F3B63]">
                Giải thích lập luận của em (1–2 câu để AI góp ý 3 phần &amp; gửi giáo viên):
              </label>
              <textarea
                rows={2}
                value={explanationText}
                onChange={(e) => setExplanationText(e.target.value)}
                disabled={solved}
                placeholder="Ví dụ: Bạn An thay sai dấu của cos 120° vì 120° là góc tù nên cos 120° = -1/2..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-sm text-[#14284A]"
              />
            </div>
          )}
        </div>
      )}

      {question.type === 'true_false_multi' && question.statements && (
        <div className="space-y-2.5" aria-label="Câu hỏi đúng sai nhiều ý">
          <p className="text-xs font-semibold text-[#1F3B63]">
            Chọn <strong>Đúng</strong> hoặc <strong>Sai</strong> cho từng nhận định dưới đây:
          </p>
          {question.statements.map((stmt) => {
            const val = trueFalseMap[stmt.id];
            return (
              <div
                key={stmt.id}
                className="p-3 rounded-2xl bg-white border-2 border-[#D9C293] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-start gap-2.5 flex-1 text-[15px] leading-snug text-[#14284A]">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-[#FFF4D6] border-2 border-[#CBB17D] flex items-center justify-center text-xs font-extrabold uppercase">
                    {stmt.id}
                  </span>
                  <span className="pt-0.5">
                    <MathText text={stmt.label} />
                  </span>
                </div>
                <div className="flex gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={solved}
                    onClick={() => setTrueFalseMap((prev) => ({...prev, [stmt.id]: true}))}
                    aria-pressed={val === true}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border-2 !min-h-[38px] ${
                      val === true
                        ? 'bg-[#1D7A6A] text-white border-[#145B4F]'
                        : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
                    }`}
                  >
                    Đúng
                  </button>
                  <button
                    type="button"
                    disabled={solved}
                    onClick={() => setTrueFalseMap((prev) => ({...prev, [stmt.id]: false}))}
                    aria-pressed={val === false}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border-2 !min-h-[38px] ${
                      val === false
                        ? 'bg-[#E0A93B] text-[#14284A] border-[#8A5608]'
                        : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
                    }`}
                  >
                    Sai
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {question.type === 'tap_diagram' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[#1F3B63]">
            Đỉnh đang chọn:
          </span>
          {(question.diagramData?.vertices ?? ['A', 'B', 'C']).map((v) => (
            <button
              key={v}
              type="button"
              disabled={solved}
              onClick={() => setSelectedChoice(v)}
              className={`px-4 py-2 rounded-xl font-extrabold border-2 ${
                selectedChoice === v
                  ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                  : 'bg-white text-[#14284A] border-[#CBB17D]'
              }`}
            >
              Đỉnh {v}
            </button>
          ))}
        </div>
      )}

      {question.type === 'matching' && question.matchingPairs && (
        <div className="space-y-3">
          {question.matchingPairs.left.map((side) => (
            <div
              key={side}
              className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-white border-2 border-[#E2CFA3]"
            >
              <span className="font-bold text-[#14284A]">Cạnh {side} đối diện góc:</span>
              <div className="flex gap-2">
                {question.matchingPairs!.right.map((v) => {
                  const active = matchingMap[side] === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      disabled={solved}
                      onClick={() => setMatchingMap((prev) => ({...prev, [side]: v}))}
                      className={`px-4 py-2 rounded-xl font-bold border-2 ${
                        active
                          ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                          : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
                      }`}
                    >
                      ∠{v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {question.type === 'fill_relation' && question.fillRelationTemplate && (
        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-white border-2 border-[#D5B87E] flex flex-wrap items-center justify-center gap-4 text-lg font-bold text-[#14284A]">
            <div className="flex flex-col items-center">
              <span className="px-3 pb-1 border-b-2 border-[#14284A]">
                {question.fillRelationTemplate.leftNumerator}
              </span>
              <span className="pt-1 text-[#18685B]">
                sin({fillLeft !== undefined ? `${fillLeft}°` : '?'})
              </span>
            </div>
            <span className="text-2xl">=</span>
            <div className="flex flex-col items-center">
              <span className="px-3 pb-1 border-b-2 border-[#14284A]">
                {question.fillRelationTemplate.rightNumerator}
              </span>
              <span className="pt-1 text-[#8A5608]">
                sin({fillRight !== undefined ? `${fillRight}°` : '?'})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293]">
              <p className="text-xs font-bold text-[#1F7A6B] mb-2">
                Chọn góc cho mẫu số dưới {question.fillRelationTemplate.leftNumerator}:
              </p>
              <div className="flex gap-2 flex-wrap">
                {question.fillRelationTemplate.choices.map((deg) => (
                  <button
                    key={`l-${deg}`}
                    type="button"
                    disabled={solved}
                    onClick={() => setFillLeft(deg)}
                    className={`px-3.5 py-2 rounded-xl font-bold border-2 ${
                      fillLeft === deg
                        ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                        : 'bg-white text-[#14284A] border-[#CBB17D]'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293]">
              <p className="text-xs font-bold text-[#8A5A3B] mb-2">
                Chọn góc cho mẫu số dưới {question.fillRelationTemplate.rightNumerator}:
              </p>
              <div className="flex gap-2 flex-wrap">
                {question.fillRelationTemplate.choices.map((deg) => (
                  <button
                    key={`r-${deg}`}
                    type="button"
                    disabled={solved}
                    onClick={() => setFillRight(deg)}
                    className={`px-3.5 py-2 rounded-xl font-bold border-2 ${
                      fillRight === deg
                        ? 'bg-[#E0A93B] text-[#14284A] border-[#B9831E]'
                        : 'bg-white text-[#14284A] border-[#CBB17D]'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {question.type === 'measurement' && (() => {
        const expAB = Number(question.expected_answer.AB_m ?? 60);
        const expA = Number(question.expected_answer.BAC_degree ?? 50);
        const expB = Number(question.expected_answer.ABC_degree ?? 60);
        const bankSelected = surveyPoints.includes('A') && surveyPoints.includes('B');
        const tapeAligned = Math.abs(tapeSlider - expAB) <= 2;
        const rayAAligned = Math.abs(sightRayA - expA) <= 2;
        const rayBAligned = Math.abs(sightRayB - expB) <= 2;

        const togglePoint = (pt: 'A' | 'B' | 'C') => {
          if (pt === 'C') {
            setSurveyPointWarn(
              'Điểm C nằm bên kia sông nên không thể đi qua đặt thước dây trực tiếp (lỗi E03). Hãy chọn 2 cọc mốc A và B ở cùng bờ!',
            );
            soundEngine.playGentleHint();
            return;
          }
          setSurveyPointWarn('');
          setSurveyPoints((prev) =>
            prev.includes(pt) ? prev : [...prev, pt],
          );
          soundEngine.playStep();
        };

        return (
          <div className="space-y-3.5">
            {/* Step 1: Select accessible survey points on the riverbank */}
            <div className="p-3.5 rounded-2xl bg-[#FFFBF0] border-2 border-[#D9C293] space-y-2.5">
              <p className="text-xs font-extrabold uppercase text-[#1F7A6B]">
                Bước 1 · Chọn 2 điểm đặt thước dây trên bờ (không băng qua sông)
              </p>
              <div className="flex flex-wrap gap-2">
                {(['A', 'B', 'C'] as const).map((pt) => {
                  const chosen = surveyPoints.includes(pt);
                  return (
                    <button
                      key={pt}
                      type="button"
                      disabled={solved}
                      onClick={() => togglePoint(pt)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border-2 transition ${
                        chosen
                          ? 'bg-[#1D7A6A] text-white border-[#145B4F]'
                          : 'bg-white text-[#14284A] border-[#CBB17D] hover:bg-[#FFF4D6]'
                      }`}
                    >
                      Điểm {pt} {pt === 'C' ? '(bên kia sông)' : '(trên bờ)'} {chosen ? '✓' : ''}
                    </button>
                  );
                })}
              </div>
              {surveyPointWarn && (
                <p className="text-xs font-semibold text-[#8A5108] bg-[#FFF4D6] border border-[#E0A93B] rounded-xl px-3 py-2">
                  {surveyPointWarn}
                </p>
              )}

              {/* Interactive tape measure along bank AB */}
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#14284A]">
                  <span>Kéo thước dây từ A đến cọc B:</span>
                  <span
                    className={`px-2 py-0.5 rounded-md tabular-nums ${
                      bankSelected && tapeAligned
                        ? 'bg-[#E6F6F3] text-[#1F7A6B]'
                        : 'bg-[#FFF4D6] text-[#8A5108]'
                    }`}
                  >
                    Vạch thước: {tapeSlider} m {bankSelected && tapeAligned ? '· Khớp cọc B ✓' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  disabled={solved || !bankSelected}
                  value={tapeSlider}
                  onChange={(e) => setTapeSlider(Number(e.target.value))}
                  className="w-full accent-[#1D7A6A]"
                />
                {!bankSelected && (
                  <p className="text-[11px] text-[#5B6B82]">
                    Hãy chọn đủ hai điểm A và B trên bờ trước khi kéo thước đo đường đáy.
                  </p>
                )}
              </div>
            </div>

            {/* Step 2 & 3: Interactive sighting protractor rays at A and B */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#FFFBF0] border-2 border-[#D9C293] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-extrabold text-[#1F7A6B]">
                    Bước 2 · Xoay tia ngắm tại A → mục tiêu C
                  </p>
                  <span
                    className={`text-xs font-extrabold px-2 py-0.5 rounded-md tabular-nums ${
                      rayAAligned ? 'bg-[#E6F6F3] text-[#1F7A6B]' : 'bg-white text-[#14284A] border border-[#D9C293]'
                    }`}
                  >
                    {rayAAligned ? 'Trúng tâm C ✓' : 'Chưa trúng C'}
                  </span>
                </div>
                <svg viewBox="0 0 180 95" className="w-full h-24 bg-white rounded-xl border border-[#E5D3A8]">
                  <path d="M 20 82 A 70 70 0 0 1 160 82" fill="#FFF8E6" stroke="#CBB17D" strokeWidth="1.5" />
                  <line x1="20" y1="82" x2="160" y2="82" stroke="#14284A" strokeWidth="2.5" />
                  {/* Target C beacon at exact angle expA from A(90,82) */}
                  {(() => {
                    const tRad = (expA * Math.PI) / 180;
                    const tx = 90 + Math.cos(tRad) * 62;
                    const ty = 82 - Math.sin(tRad) * 62;
                    const rRad = (sightRayA * Math.PI) / 180;
                    const rx = 90 + Math.cos(rRad) * 68;
                    const ry = 82 - Math.sin(rRad) * 68;
                    return (
                      <>
                        <circle cx={tx} cy={ty} r="5.5" fill={rayAAligned ? '#1D7A6A' : '#D93829'} />
                        <text x={tx + 7} y={ty - 2} fontSize="10" fontWeight="800" fill="#8A2B22">C</text>
                        <line x1="90" y1="82" x2={rx} y2={ry} stroke="#2E9C8A" strokeWidth="2.5" strokeDasharray="4 3" />
                        <circle cx="90" cy="82" r="4" fill="#14284A" />
                        <text x="86" y="93" fontSize="10" fontWeight="800" fill="#14284A">A</text>
                        <text x="150" y="93" fontSize="10" fontWeight="800" fill="#14284A">B</text>
                      </>
                    );
                  })()}
                </svg>
                <input
                  type="range"
                  min={10}
                  max={170}
                  step={1}
                  disabled={solved}
                  value={sightRayA}
                  onChange={(e) => setSightRayA(Number(e.target.value))}
                  className="w-full accent-[#2E9C8A]"
                />
                <p className="text-[11px] font-semibold text-[#1F3B63] tabular-nums">
                  Thước đo góc tại A đang chỉ: <strong>{sightRayA}°</strong> (góc ngoài bù: {180 - sightRayA}°) — Hãy tự đọc góc trong ∠BAC và ghi vào ô bên dưới.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FFFBF0] border-2 border-[#D9C293] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-extrabold text-[#3B5F8F]">
                    Bước 3 · Xoay tia ngắm tại B → mục tiêu C
                  </p>
                  <span
                    className={`text-xs font-extrabold px-2 py-0.5 rounded-md tabular-nums ${
                      rayBAligned ? 'bg-[#E6F6F3] text-[#1F7A6B]' : 'bg-white text-[#14284A] border border-[#D9C293]'
                    }`}
                  >
                    {rayBAligned ? 'Trúng tâm C ✓' : 'Chưa trúng C'}
                  </span>
                </div>
                <svg viewBox="0 0 180 95" className="w-full h-24 bg-white rounded-xl border border-[#E5D3A8]">
                  <path d="M 20 82 A 70 70 0 0 1 160 82" fill="#FFF8E6" stroke="#CBB17D" strokeWidth="1.5" />
                  <line x1="20" y1="82" x2="160" y2="82" stroke="#14284A" strokeWidth="2.5" />
                  {(() => {
                    const tRad = ((180 - expB) * Math.PI) / 180;
                    const tx = 90 + Math.cos(tRad) * 62;
                    const ty = 82 - Math.sin(tRad) * 62;
                    const rRad = ((180 - sightRayB) * Math.PI) / 180;
                    const rx = 90 + Math.cos(rRad) * 68;
                    const ry = 82 - Math.sin(rRad) * 68;
                    return (
                      <>
                        <circle cx={tx} cy={ty} r="5.5" fill={rayBAligned ? '#1D7A6A' : '#D93829'} />
                        <text x={tx - 14} y={ty - 2} fontSize="10" fontWeight="800" fill="#8A2B22">C</text>
                        <line x1="90" y1="82" x2={rx} y2={ry} stroke="#3B5F8F" strokeWidth="2.5" strokeDasharray="4 3" />
                        <circle cx="90" cy="82" r="4" fill="#14284A" />
                        <text x="22" y="93" fontSize="10" fontWeight="800" fill="#14284A">A</text>
                        <text x="86" y="93" fontSize="10" fontWeight="800" fill="#14284A">B</text>
                      </>
                    );
                  })()}
                </svg>
                <input
                  type="range"
                  min={10}
                  max={170}
                  step={1}
                  disabled={solved}
                  value={sightRayB}
                  onChange={(e) => setSightRayB(Number(e.target.value))}
                  className="w-full accent-[#3B5F8F]"
                />
                <p className="text-[11px] font-semibold text-[#1F3B63] tabular-nums">
                  Thước đo góc tại B: góc trong <strong>{sightRayB}°</strong> · góc ngoài <strong>{180 - sightRayB}°</strong> — Tự ghi góc trong ∠ABC và đơn vị vào bảng.
                </p>
              </div>
            </div>

            {/* Step 4: Manual entry of readings + explicit unit selection */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-bold text-[#1F3B63]">Ghi độ dài đường đáy AB</label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Nhập số đo..."
                    value={measureAB}
                    onChange={(e) => setMeasureAB(e.target.value)}
                    disabled={solved}
                    className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] font-bold text-[#14284A]"
                  />
                  <select
                    aria-label="Đơn vị AB"
                    value={unitAB}
                    onChange={(e) => setUnitAB(e.target.value)}
                    disabled={solved}
                    className="px-2 py-2 rounded-xl bg-[#FFF4D6] border-2 border-[#CBB17D] text-xs font-extrabold text-[#14284A]"
                  >
                    <option value="m">m</option>
                    <option value="km">km</option>
                    <option value="°">°</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#1F3B63]">Ghi số đo góc ∠BAC</label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Nhập số đo..."
                    value={measureA}
                    onChange={(e) => setMeasureA(e.target.value)}
                    disabled={solved}
                    className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] font-bold text-[#14284A]"
                  />
                  <select
                    aria-label="Đơn vị góc BAC"
                    value={unitA}
                    onChange={(e) => setUnitA(e.target.value)}
                    disabled={solved}
                    className="px-2 py-2 rounded-xl bg-[#FFF4D6] border-2 border-[#CBB17D] text-xs font-extrabold text-[#14284A]"
                  >
                    <option value="°">°</option>
                    <option value="rad">rad</option>
                    <option value="m">m</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#1F3B63]">Ghi số đo góc ∠ABC</label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Nhập số đo..."
                    value={measureB}
                    onChange={(e) => setMeasureB(e.target.value)}
                    disabled={solved}
                    className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] font-bold text-[#14284A]"
                  />
                  <select
                    aria-label="Đơn vị góc ABC"
                    value={unitB}
                    onChange={(e) => setUnitB(e.target.value)}
                    disabled={solved}
                    className="px-2 py-2 rounded-xl bg-[#FFF4D6] border-2 border-[#CBB17D] text-xs font-extrabold text-[#14284A]"
                  >
                    <option value="°">°</option>
                    <option value="rad">rad</option>
                    <option value="m">m</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {question.type === 'agree_explain' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={solved}
              onClick={() => setAgreeChoice(true)}
              className={`btn-tactile ${agreeChoice === true ? 'btn-jade' : 'btn-paper'}`}
            >
              Đồng ý
            </button>
            <button
              type="button"
              disabled={solved}
              onClick={() => setAgreeChoice(false)}
              className={`btn-tactile ${agreeChoice === false ? 'btn-gold' : 'btn-paper'}`}
            >
              Không đồng ý
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#1F3B63] mb-1">
                Góc C tính được (°):
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={agreeAngleC}
                onChange={(e) => setAgreeAngleC(e.target.value)}
                disabled={solved}
                placeholder="Ví dụ: 70"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] font-bold text-[#14284A]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1F3B63] mb-1">
                Lý do ngắn gọn:
              </label>
              <input
                type="text"
                value={explanationText}
                onChange={(e) => setExplanationText(e.target.value)}
                disabled={solved}
                placeholder="Vì góc C = góc B = 70°..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-sm text-[#14284A]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Primary check button */}
      {!solved && (
        <button
          type="button"
          onClick={handleCheck}
          className="btn-tactile btn-jade w-full text-base"
        >
          <CheckCircle2 className="w-5 h-5" />
          {actionLabel}
        </button>
      )}

      {/* Progressive hints drawer */}
      {hintIndex >= 0 && (
        <div className="p-3.5 rounded-2xl bg-[#FFF6DC] border-2 border-[#E0A93B] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-[#8A5108]">
              Gợi ý bước {hintIndex + 1}/{question.hints_vi.length}
            </span>
            {hintIndex < question.hints_vi.length - 1 && (
              <button
                type="button"
                onClick={revealNextHint}
                className="text-xs font-bold text-[#1F7A6B] underline !min-h-[32px]"
              >
                Xem thêm gợi ý
              </button>
            )}
          </div>
          {question.hints_vi.slice(0, hintIndex + 1).map((h, i) => (
            <p key={i} className="text-sm text-[#14284A]">
              • <MathText text={h} />
            </p>
          ))}
        </div>
      )}

      {/* Feedback block (Jade for correct, warm Amber for wrong — NEVER flashing red) */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border-2 text-sm leading-relaxed ${
            feedback.isCorrect
              ? 'bg-[#E6F6F3] border-[#2E9C8A] text-[#14284A]'
              : 'bg-[#FFF5E2] border-[#D98A1F] text-[#5C3A06]'
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">
            <MathText text={feedback.feedback_vi} />
          </p>
          {feedback.isCorrect && (
            <p className="mt-1.5 text-xs text-[#1F7A6B]">
              Lời giải chuẩn: <MathText text={question.solution_vi} />
            </p>
          )}
        </div>
      )}

      {/* Discrimination check before classifying E01 */}
      {discriminationAsked && !solved && (
        <div className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D98A1F] text-xs text-[#5C3A06] space-y-2">
          <p className="font-bold">
            Để gợi ý sát hơn: bước vừa rồi em đang băn khoăn điều nào?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDiscriminationAsked(false);
                revealNextHint();
              }}
              className="px-3 py-1.5 rounded-lg bg-[#FFF4D6] border border-[#D98A1F] font-semibold !min-h-[36px]"
            >
              Chưa rõ đỉnh đối diện cạnh
            </button>
            <button
              type="button"
              onClick={() => setDiscriminationAsked(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#CBB17D] font-semibold !min-h-[36px]"
            >
              Em bấm nhầm / nhìn nhầm nhãn
            </button>
          </div>
        </div>
      )}

      {/* Gentle support invitation after HELP_AFTER_WRONG consecutive wrongs */}
      {offerHelpBanner && (
        <div className="p-3.5 rounded-2xl bg-[#FFF4D6] border-2 border-[#D98A1F] space-y-2">
          <p className="text-sm font-bold text-[#14284A]">
            Câu này đang hơi vướng một chút — em muốn chọn hỗ trợ nào?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleHintClick}
              className="btn-tactile btn-amber text-xs py-2 px-3"
            >
              Xem gợi ý cụ thể
            </button>
            {onRequestEasier && (
              <button
                type="button"
                onClick={() => onRequestEasier(question, feedback?.errorCode)}
                className="btn-tactile btn-paper text-xs py-2 px-3"
              >
                Thử bài dễ hơn (Bổ trợ)
              </button>
            )}
            {onPause && (
              <button
                type="button"
                onClick={() => onPause(getCurrentResponse(), mode)}
                className="btn-tactile btn-paper text-xs py-2 px-3"
              >
                Tạm dừng nghỉ một chút
              </button>
            )}
          </div>
        </div>
      )}

      {rebuttalSent && (
        <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-semibold text-[#1F7A6B]">
          Đã gửi phản biện của em để xem xét. Em không bị mất phần thưởng nào!
        </div>
      )}

      {/* Mandatory fixed 4-button helper row — always 1 easy-to-tap horizontal row even at 360px */}
      <div
        data-testid="helper-buttons-row"
        className="grid grid-cols-4 gap-1.5 sm:gap-2 pt-2.5 border-t border-[#E5D3A8]"
      >
        <button
          type="button"
          onClick={handleDontKnow}
          disabled={solved}
          aria-label="Em chưa biết"
          className="btn-tactile btn-paper flex-col sm:flex-row !gap-0.5 sm:!gap-1.5 !px-1 sm:!px-2.5 !py-1.5 sm:!py-2 !min-h-[50px] sm:!min-h-[44px] text-[10.5px] sm:text-xs leading-tight text-center"
        >
          <HelpCircle className="w-4 h-4 shrink-0 text-[#1F3B63]" />
          <span className="sm:hidden">Chưa biết</span>
          <span className="hidden sm:inline">Em chưa biết</span>
        </button>
        <button
          type="button"
          onClick={handleHintClick}
          disabled={solved}
          aria-label="Gợi ý"
          className="btn-tactile btn-amber flex-col sm:flex-row !gap-0.5 sm:!gap-1.5 !px-1 sm:!px-2.5 !py-1.5 sm:!py-2 !min-h-[50px] sm:!min-h-[44px] text-[10.5px] sm:text-xs leading-tight text-center"
        >
          <Lightbulb className="w-4 h-4 shrink-0" />
          <span>Gợi ý</span>
        </button>
        <button
          type="button"
          onClick={() => onPause?.(getCurrentResponse(), mode)}
          aria-label="Tạm dừng"
          className="btn-tactile btn-paper flex-col sm:flex-row !gap-0.5 sm:!gap-1.5 !px-1 sm:!px-2.5 !py-1.5 sm:!py-2 !min-h-[50px] sm:!min-h-[44px] text-[10.5px] sm:text-xs leading-tight text-center"
        >
          <Pause className="w-4 h-4 shrink-0 text-[#7C4E31]" />
          <span>Tạm dừng</span>
        </button>
        <button
          type="button"
          onClick={() => setShowRebuttalModal(true)}
          aria-label="Em muốn phản biện"
          className="btn-tactile btn-paper flex-col sm:flex-row !gap-0.5 sm:!gap-1.5 !px-1 sm:!px-2.5 !py-1.5 sm:!py-2 !min-h-[50px] sm:!min-h-[44px] text-[10.5px] sm:text-xs leading-tight text-center"
        >
          <MessageSquareWarning className="w-4 h-4 shrink-0 text-[#B6281C]" />
          <span className="sm:hidden">Phản biện</span>
          <span className="hidden sm:inline">Em muốn phản biện</span>
        </button>
      </div>

      {/* Verify-mode Hint Confirmation Modal */}
      {showVerifyHintModal && (
        <div
          className="fixed inset-0 z-50 bg-[#14284A]/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-hint-title"
        >
          <div className="notebook-card max-w-md w-full p-5 space-y-4">
            <h3 id="verify-hint-title" className="font-display text-xl font-bold text-[#14284A]">
              Chuyển sang chế độ luyện?
            </h3>
            <p className="text-sm text-[#1B2A41] leading-relaxed">
              <strong>Dùng gợi ý sẽ chuyển câu này sang chế độ luyện.</strong> Kết quả vẫn được ghi nhận bình thường, chỉ không tính là "Tự làm được (độc lập)" cho lượt này.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setShowVerifyHintModal(false)}
                className="btn-tactile btn-paper text-sm"
              >
                Đổi ý, giữ kiểm chứng
              </button>
              <button
                type="button"
                onClick={confirmSwitchToPracticeForHint}
                className="btn-tactile btn-gold text-sm"
              >
                Đồng ý xem gợi ý
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rebuttal Modal ("Em muốn phản biện") */}
      {showRebuttalModal && (
        <div
          className="fixed inset-0 z-50 bg-[#14284A]/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rebuttal-title"
        >
          <div className="notebook-card max-w-lg w-full p-5 space-y-3">
            <h3 id="rebuttal-title" className="font-display text-xl font-bold text-[#14284A]">
              Gửi phản biện tới giáo viên
            </h3>
            <p className="text-xs text-[#5B6B82]">
              Hệ thống sẽ lưu câu trả lời hiện tại, nhận xét đang tranh luận và lập luận của em để giáo viên duyệt lại. Gửi phản biện không làm mất điểm hay phần thưởng.
            </p>
            <textarea
              rows={4}
              value={rebuttalReasoning}
              onChange={(e) => setRebuttalReasoning(e.target.value)}
              placeholder="Trình bày cách giải hoặc lý do em cho rằng đáp án/nhận xét cần xem lại..."
              className="w-full p-3 rounded-xl bg-white border-2 border-[#CBB17D] text-sm text-[#14284A]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRebuttalModal(false)}
                className="btn-tactile btn-paper text-sm"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSendRebuttal}
                disabled={!rebuttalReasoning.trim()}
                className="btn-tactile btn-jade text-sm"
              >
                Gửi giáo viên xem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

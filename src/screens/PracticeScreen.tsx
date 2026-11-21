import React from 'react';
import {CheckCircle2, Dumbbell, RefreshCw} from 'lucide-react';
import {QuestionCard, type QuestionSubmissionPayload} from '../components/QuestionCard.tsx';
import {SKILL_CLUSTER_LIST, SKILL_CLUSTERS} from '../config.ts';
import {buildAdaptiveQuestionSet} from '../math/generators.ts';
import {dataService} from '../services/dataService.ts';
import type {QuestionItem, QuestionMode, SkillCluster, UserAccount} from '../types.ts';

interface PracticeScreenProps {
  user: UserAccount;
  onUserUpdated: (user: UserAccount) => void;
}

export const PracticeScreen: React.FC<PracticeScreenProps> = ({user, onUserUpdated}) => {
  const settings = dataService.getSettings();
  const [selectedCluster, setSelectedCluster] = React.useState<SkillCluster | 'ALL'>('ALL');
  const [levelFilter, setLevelFilter] = React.useState<1 | 2 | 3 | 4 | 'all'>('all');
  const [count, setCount] = React.useState<5 | 10>(5);
  const [sessionMode, setSessionMode] = React.useState<QuestionMode>('practice');

  const [questions, setQuestions] = React.useState<QuestionItem[] | null>(null);
  const [qIdx, setQIdx] = React.useState(0);
  const [currentCleared, setCurrentCleared] = React.useState(false);
  const [resultsLog, setResultsLog] = React.useState<
    Array<{id: string; cluster: SkillCluster; isCorrect: boolean; mode: QuestionMode}>
  >([]);

  const startSession = () => {
    const bank = dataService.getQuestions();
    const list = buildAdaptiveQuestionSet({
      count,
      clusters: selectedCluster === 'ALL' ? undefined : [selectedCluster],
      levelFilter,
      bank,
      allowPending: settings.allowPendingInTestMode,
      skills: user.skills,
      recentSessions: user.recentQuestionSessions,
    });
    dataService.recordSessionQuestionIds(
      user.uid,
      list.map((q) => q.id),
    );
    setQuestions(list);
    setQIdx(0);
    setCurrentCleared(false);
    setResultsLog([]);
  };

  const handleComplete = (payload: QuestionSubmissionPayload) => {
    const {user: updated} = dataService.recordAttempt({
      userId: user.uid,
      studentCode: user.studentCode,
      isTestAccount: user.isTestAccount,
      questionId: payload.question.id,
      cluster: payload.question.cluster,
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
    });
    if (updated) onUserUpdated(updated);

    if (payload.isCorrect) {
      setCurrentCleared(true);
      setResultsLog((prev) => [
        ...prev,
        {
          id: payload.question.id,
          cluster: payload.question.cluster,
          isCorrect: true,
          mode: payload.mode,
        },
      ]);
    }
  };

  if (!questions) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="notebook-card p-5 space-y-5">
          <div>
            <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
              Luyện kỹ năng Chương III
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#14284A]">
              Chọn bộ câu hỏi luyện tập ngẫu nhiên
            </h1>
            <p className="text-sm text-[#5B6B82] mt-1">
              Hệ thống ưu tiên các cụm đang luyện/cần ôn lại và tránh lặp câu trong 3 phiên gần nhất.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold text-[#14284A]">1. Chủ đề kỹ năng</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCluster('ALL')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border-2 ${
                  selectedCluster === 'ALL'
                    ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                    : 'bg-white text-[#14284A] border-[#D9C293]'
                }`}
              >
                Tổng hợp ưu tiên
              </button>
              {SKILL_CLUSTER_LIST.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSelectedCluster(code)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border-2 ${
                    selectedCluster === code
                      ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                      : 'bg-white text-[#14284A] border-[#D9C293]'
                  }`}
                >
                  {code} · {SKILL_CLUSTERS[code].shortTitle}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs font-bold text-[#14284A] mb-1.5">2. Mức độ</p>
              <select
                value={levelFilter}
                onChange={(e) =>
                  setLevelFilter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as 1 | 2 | 3 | 4))
                }
                className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-sm font-bold"
              >
                <option value="all">Tất cả mức (1–4)</option>
                <option value="1">Mức 1 · Nền tảng</option>
                <option value="2">Mức 2 · Cơ bản</option>
                <option value="3">Mức 3 · Vận dụng</option>
                <option value="4">Mức 4 · Kiểm chứng</option>
              </select>
            </div>
            <div>
              <p className="text-xs font-bold text-[#14284A] mb-1.5">3. Số câu</p>
              <div className="grid grid-cols-2 gap-2">
                {([5, 10] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={`py-2.5 rounded-xl font-bold text-sm border-2 ${
                      count === n
                        ? 'bg-[#E0A93B] text-[#14284A] border-[#B9831E]'
                        : 'bg-white text-[#14284A] border-[#D9C293]'
                    }`}
                  >
                    {n} câu
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-[#14284A] mb-1.5">4. Chế độ làm bài</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSessionMode('practice')}
                  className={`py-2.5 rounded-xl font-bold text-xs border-2 ${
                    sessionMode === 'practice'
                      ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                      : 'bg-white text-[#14284A] border-[#D9C293]'
                  }`}
                >
                  Luyện tập
                </button>
                <button
                  type="button"
                  onClick={() => setSessionMode('verify')}
                  className={`py-2.5 rounded-xl font-bold text-xs border-2 ${
                    sessionMode === 'verify'
                      ? 'bg-[#14284A] text-white border-[#14284A]'
                      : 'bg-white text-[#14284A] border-[#D9C293]'
                  }`}
                >
                  Kiểm chứng
                </button>
              </div>
            </div>
          </div>

          <button type="button" onClick={startSession} className="btn-tactile btn-jade w-full text-base">
            <Dumbbell className="w-5 h-5" />
            Bắt đầu bộ {count} câu mới
          </button>
        </div>
      </div>
    );
  }

  const finished = qIdx >= questions.length;
  const currentQ = questions[qIdx];

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-xl font-extrabold text-[#14284A]">
          Luyện kỹ năng · Câu {Math.min(qIdx + 1, questions.length)}/{questions.length}
        </h1>
        <button
          type="button"
          onClick={() => setQuestions(null)}
          className="btn-tactile btn-paper text-xs py-2 px-3"
        >
          Đổi cấu hình
        </button>
      </div>

      {!finished && currentQ ? (
        <>
          <div className="flex gap-1.5">
            {questions.map((q, i) => (
              <div
                key={q.id}
                className={`h-2.5 flex-1 rounded-full ${
                  i < qIdx ? 'bg-[#2E9C8A]' : i === qIdx ? 'bg-[#E0A93B]' : 'bg-[#F7E7B8]'
                }`}
              />
            ))}
          </div>
          <QuestionCard
            question={currentQ}
            initialMode={sessionMode}
            helpAfterWrong={settings.helpAfterWrong}
            onComplete={handleComplete}
            onPause={() => setQuestions(null)}
            onRebuttalSubmit={(data) =>
              dataService.submitRebuttal({
                userId: user.uid,
                studentCode: user.studentCode,
                displayName: user.displayName,
                ...data,
              })
            }
          />
          {currentCleared && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const next = qIdx + 1;
                  if (next >= questions.length) {
                    const award = dataService.awardOnce(
                      user.uid,
                      `practice_session_${Date.now().toString(36)}`,
                      {xp: 15},
                    );
                    if (award.user) onUserUpdated(award.user);
                  }
                  setQIdx(next);
                  setCurrentCleared(false);
                }}
                className="btn-tactile btn-jade"
              >
                <CheckCircle2 className="w-5 h-5" />
                {qIdx + 1 >= questions.length ? 'Xem tổng kết phiên luyện' : 'Câu tiếp theo →'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="notebook-card p-6 text-center space-y-4">
          <div className="inline-block red-stamp px-4 py-1 text-sm">HOÀN THÀNH PHIÊN</div>
          <h2 className="font-display text-2xl font-extrabold text-[#14284A]">
            Em đã hoàn thành trọn vẹn {questions.length} câu luyện tập!
          </h2>
          <p className="text-sm text-[#1B2A41]">
            Số câu tự làm ở chế độ kiểm chứng:{' '}
            <strong className="tabular-nums text-[#1F7A6B]">
              {resultsLog.filter((r) => r.mode === 'verify').length}
            </strong>{' '}
            · Số câu chế độ luyện tập:{' '}
            <strong className="tabular-nums text-[#B9831E]">
              {resultsLog.filter((r) => r.mode === 'practice').length}
            </strong>
          </p>
          <p className="text-xs text-[#5B6B82]">
            Gợi ý bước tiếp theo: Mở Sổ tiến độ để xem cụm kỹ năng nào em đã đạt "Tự làm được" và thử đấu BOSS tương ứng nhé.
          </p>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={startSession} className="btn-tactile btn-jade">
              <RefreshCw className="w-4 h-4" /> Sinh bộ đề mới hoàn toàn
            </button>
            <button type="button" onClick={() => setQuestions(null)} className="btn-tactile btn-paper">
              Chọn chủ đề khác
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

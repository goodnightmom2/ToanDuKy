import React from 'react';
import {CheckCircle2, ClipboardCheck, Dumbbell, FlaskConical, Lock, RefreshCw} from 'lucide-react';
import {ParametricLab} from '../components/ParametricLab.tsx';
import {QuestionCard, type QuestionSubmissionPayload} from '../components/QuestionCard.tsx';
import {ERROR_CATALOG, SKILL_CLUSTER_LIST, SKILL_CLUSTERS} from '../config.ts';
import {JOURNEY_MILESTONES, normalizeJourneyProgress} from '../journey.ts';
import {buildAdaptiveQuestionSet} from '../math/generators.ts';
import {dataService} from '../services/dataService.ts';
import type {
  QuestionItem,
  QuestionMode,
  RemediationAssignment,
  SkillCluster,
  UserAccount,
} from '../types.ts';

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
  const [activeAssignment, setActiveAssignment] = React.useState<RemediationAssignment | null>(null);
  const [verifyRetryNotice, setVerifyRetryNotice] = React.useState('');
  const [qIdx, setQIdx] = React.useState(0);
  const [currentCleared, setCurrentCleared] = React.useState(false);
  const [resultsLog, setResultsLog] = React.useState<
    Array<{id: string; cluster: SkillCluster; isCorrect: boolean; mode: QuestionMode}>
  >([]);
  const [tick, setTick] = React.useState(0);
  const [showParametricLab, setShowParametricLab] = React.useState(false);

  React.useEffect(() => {
    return dataService.subscribe(() => setTick((t) => t + 1));
  }, []);

  const myAssignments = React.useMemo(
    () => dataService.getRemediationAssignments(user.uid),
    [user.uid, tick],
  );

  // Unlock practice clusters progressively based on reached milestones; full free practice unlocks after Mốc 10
  const journey = React.useMemo(() => normalizeJourneyProgress(user.journey), [user.journey]);
  const freePracticeUnlocked = Boolean(
    journey.completedAt || journey.passedMoc.includes(10) || user.role !== 'student',
  );
  const unlockedClusterSet = React.useMemo(() => {
    if (freePracticeUnlocked) return new Set<SkillCluster>(SKILL_CLUSTER_LIST);
    const set = new Set<SkillCluster>(['NEN']);
    for (const m of JOURNEY_MILESTONES) {
      if (m.id <= journey.currentMoc || journey.passedMoc.includes(m.id)) {
        for (const c of m.clusters) set.add(c);
      }
    }
    return set;
  }, [freePracticeUnlocked, journey.currentMoc, journey.passedMoc]);

  const firstMocForCluster = (cluster: SkillCluster): number =>
    JOURNEY_MILESTONES.find((m) => m.clusters.includes(cluster))?.id ?? 1;

  const startSession = () => {
    const bank = dataService.getQuestionsForClass(user.classId);
    const targetClusters: SkillCluster[] =
      selectedCluster === 'ALL'
        ? Array.from(unlockedClusterSet)
        : unlockedClusterSet.has(selectedCluster)
          ? [selectedCluster]
          : Array.from(unlockedClusterSet);
    const list = buildAdaptiveQuestionSet({
      count,
      clusters: targetClusters,
      levelFilter,
      bank,
      allowPending: dataService.shouldAllowPendingForUser(user),
      skills: user.skills,
      recentSessions: user.recentQuestionSessions,
    });
    dataService.recordSessionQuestionIds(
      user.uid,
      list.map((q) => q.id),
    );
    setActiveAssignment(null);
    setVerifyRetryNotice('');
    setQuestions(list);
    setQIdx(0);
    setCurrentCleared(false);
    setResultsLog([]);
  };

  const startRemediationAssignment = (assignment: RemediationAssignment) => {
    const byId = new Map(dataService.getQuestions().map((q) => [q.id, q]));
    const remQs = assignment.remediationQuestionIds
      .map((id) => byId.get(id))
      .filter((q): q is QuestionItem => Boolean(q && q.review_status === 'approved'));
    const verifyQ = byId.get(assignment.verifyQuestionId);
    const fullList = verifyQ && verifyQ.review_status === 'approved' ? [...remQs, verifyQ] : remQs;
    if (fullList.length === 0) return;

    setActiveAssignment(assignment);
    setVerifyRetryNotice('');
    setQuestions(fullList);
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
      if (activeAssignment) {
        const isFinalVerify = payload.question.id === activeAssignment.verifyQuestionId && questions && qIdx === questions.length - 1;
        if (isFinalVerify) {
          const independentPass =
            payload.mode === 'verify' && !payload.usedHint && !payload.switchedToPractice;
          if (independentPass) {
            const nextRem = dataService.recordRemediationProgress(activeAssignment.id, {
              verifyPassed: true,
            });
            if (nextRem) setActiveAssignment(nextRem);
            setVerifyRetryNotice('');
          } else {
            setVerifyRetryNotice(
              'Em vừa hoàn thành câu cuối có dùng hỗ trợ nên chưa tính là "Tự giải độc lập". Em vẫn có thể kết thúc hoặc mở lại phiếu này để tự giải câu kiểm chứng không gợi ý.',
            );
          }
        } else {
          const nextRem = dataService.recordRemediationProgress(activeAssignment.id, {
            completedQuestionId: payload.question.id,
          });
          if (nextRem) setActiveAssignment(nextRem);
        }
      }
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
        {/* Teacher-approved individualized remediation worksheets */}
        {myAssignments.length > 0 && (
          <div className="notebook-card p-5 space-y-3 border-2 border-[#2E9C8A]">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[#1F7A6B]" />
              <h2 className="font-display text-xl font-extrabold text-[#14284A]">
                Phiếu bổ trợ riêng từ Giáo viên ({myAssignments.length})
              </h2>
            </div>
            <p className="text-xs text-[#5B6B82]">
              Giáo viên đã xem lỗi cụ thể của em, duyệt câu bổ trợ phù hợp và đính kèm 1 bài kiểm chứng mới (không gợi ý) ở bước cuối.
            </p>
            <div className="space-y-2.5">
              {myAssignments.map((rem) => {
                const isDone = rem.status === 'verified_passed';
                return (
                  <div
                    key={rem.id}
                    className={`p-3.5 rounded-2xl border-2 space-y-2 ${
                      isDone
                        ? 'bg-[#E6F6F3] border-[#2E9C8A]'
                        : 'bg-[#FFFBF0] border-[#E0A93B]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-extrabold text-sm text-[#14284A]">{rem.title}</p>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                          isDone
                            ? 'bg-[#1F7A6B] text-white'
                            : 'bg-[#FFF3DB] text-[#8A5108] border border-[#D98A1F]'
                        }`}
                      >
                        {isDone
                          ? 'Đã vượt qua kiểm chứng tự giải ✓'
                          : `${rem.remediationCompletedIds.length}/${rem.remediationQuestionIds.length} câu bổ trợ + 1 câu kiểm chứng`}
                      </span>
                    </div>
                    {rem.targetErrorCodes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {rem.targetErrorCodes.map((code) => (
                          <span
                            key={code}
                            className="px-2 py-0.5 rounded-md bg-white border border-[#D9C293] text-[11px] font-bold text-[#8A5108]"
                          >
                            {code}: {ERROR_CATALOG[code]?.subSkill ?? code}
                          </span>
                        ))}
                      </div>
                    )}
                    {rem.teacherNote && (
                      <p className="text-xs text-[#1F3B63]">{rem.teacherNote}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => startRemediationAssignment(rem)}
                      className={`btn-tactile text-xs py-2 px-4 ${isDone ? 'btn-paper' : 'btn-jade'}`}
                    >
                      {isDone ? 'Làm lại phiếu bổ trợ' : 'Bắt đầu làm phiếu bổ trợ ngay →'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="notebook-card p-5 space-y-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
                Luyện kỹ năng Chương III
              </p>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                  freePracticeUnlocked
                    ? 'bg-[#E6F6F3] text-[#1F7A6B] border border-[#2E9C8A]'
                    : 'bg-[#FFF4D6] text-[#8A5108] border border-[#E0A93B]'
                }`}
              >
                {freePracticeUnlocked
                  ? 'Luyện tự do toàn Chương III (Mức 1–4) đã mở ✓'
                  : `Đang mở ${unlockedClusterSet.size}/6 cụm theo tiến độ · Qua Mốc 10 mở tự do toàn chương`}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#14284A]">
              Chọn bộ câu hỏi luyện tập ngẫu nhiên
            </h1>
            <p className="text-sm text-[#5B6B82] mt-1">
              Hệ thống ưu tiên các cụm em đã mở khóa đang cần ôn lại và tránh lặp câu trong 3 phiên gần nhất.
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
                {freePracticeUnlocked ? 'Luyện tự do toàn Chương III' : 'Tổng hợp cụm đã mở'}
              </button>
              {SKILL_CLUSTER_LIST.map((code) => {
                const isUnlocked = unlockedClusterSet.has(code);
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={!isUnlocked}
                    onClick={() => setSelectedCluster(code)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border-2 inline-flex items-center gap-1.5 ${
                      !isUnlocked
                        ? 'bg-[#F1F5F9] text-[#94A3B8] border-[#CBD5E1] cursor-not-allowed'
                        : selectedCluster === code
                          ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                          : 'bg-white text-[#14284A] border-[#D9C293]'
                    }`}
                  >
                    {!isUnlocked && <Lock className="w-3.5 h-3.5" />}
                    {code} · {SKILL_CLUSTERS[code].shortTitle}
                    {!isUnlocked && ` (Mốc ${firstMocForCluster(code)})`}
                  </button>
                );
              })}
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

        {/* Optional Interactive Parametric Math Lab (Section 4.3c — Hình 7) */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowParametricLab((v) => !v)}
            className="btn-tactile btn-paper w-full text-xs py-2.5 px-4 flex items-center justify-center gap-2"
          >
            <FlaskConical className="w-4 h-4 text-[#2E9C8A]" />
            {showParametricLab
              ? 'Ẩn Phòng thí nghiệm tham số tương tác'
              : 'Mở Phòng thí nghiệm tham số tương tác (Côsin · Heron · Bến sông BS01)'}
          </button>
          {showParametricLab && <ParametricLab mode="student" />}
        </div>
      </div>
    );
  }

  const finished = qIdx >= questions.length;
  const currentQ = questions[qIdx];
  const isRemVerifyStep = Boolean(
    activeAssignment && currentQ && qIdx === questions.length - 1 && currentQ.id === activeAssignment.verifyQuestionId,
  );
  const effectiveInitialMode: QuestionMode = activeAssignment
    ? isRemVerifyStep
      ? 'verify'
      : 'practice'
    : sessionMode;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-extrabold text-[#14284A]">
            {activeAssignment
              ? isRemVerifyStep
                ? 'Phiếu bổ trợ · Bước cuối: Tự giải kiểm chứng (không gợi ý)'
                : `${activeAssignment.title} · Câu ${Math.min(qIdx + 1, questions.length)}/${questions.length}`
              : `Luyện kỹ năng · Câu ${Math.min(qIdx + 1, questions.length)}/${questions.length}`}
          </h1>
          {activeAssignment?.teacherNote && (
            <p className="text-xs text-[#1F7A6B] font-semibold mt-0.5">{activeAssignment.teacherNote}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setQuestions(null);
            setActiveAssignment(null);
          }}
          className="btn-tactile btn-paper text-xs py-2 px-3 shrink-0"
        >
          {activeAssignment ? 'Về danh sách' : 'Đổi cấu hình'}
        </button>
      </div>

      {verifyRetryNotice && (
        <div className="p-3 rounded-xl bg-[#FFF4D6] border-2 border-[#E0A93B] text-xs font-semibold text-[#8A5108]">
          {verifyRetryNotice}
        </div>
      )}

      {!finished && currentQ ? (
        <>
          <div className="flex gap-1.5">
            {questions.map((q, i) => (
              <div
                key={`${q.id}-${i}`}
                className={`h-2.5 flex-1 rounded-full ${
                  i < qIdx ? 'bg-[#2E9C8A]' : i === qIdx ? 'bg-[#E0A93B]' : 'bg-[#F7E7B8]'
                }`}
              />
            ))}
          </div>
          <QuestionCard
            question={currentQ}
            initialMode={effectiveInitialMode}
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

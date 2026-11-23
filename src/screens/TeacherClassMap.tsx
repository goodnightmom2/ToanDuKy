import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Compass,
  FastForward,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {JourneyMap} from '../components/JourneyMap.tsx';
import {MathText} from '../components/MathText.tsx';
import {ERROR_CATALOG, SKILL_CLUSTER_LIST, SKILL_CLUSTERS} from '../config.ts';
import {
  ALL_MOC_IDS,
  computeJourneyPercent,
  JOURNEY_MILESTONES,
  JOURNEY_MILESTONES_BY_ID,
  normalizeJourneyProgress,
} from '../journey.ts';
import {dataService} from '../services/dataService.ts';
import type {MocId, QuestionItem, SkillCluster, UserAccount} from '../types.ts';

interface TeacherClassMapProps {
  user: UserAccount;
  onOpenAdmin: (options?: {tab?: 'users' | 'classes' | 'bank' | 'reports'; cluster?: SkillCluster | 'ALL'}) => void;
  onRefreshApp: () => void;
}

export const TeacherClassMap: React.FC<TeacherClassMapProps> = ({
  user,
  onOpenAdmin,
  onRefreshApp,
}) => {
  const isAdmin = user.role === 'admin';
  const [tick, setTick] = React.useState(0);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('ALL');
  const [selectedMocId, setSelectedMocId] = React.useState<MocId>(1);
  const [inspectStudentUid, setInspectStudentUid] = React.useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = React.useState('');
  const [remDraftOpen, setRemDraftOpen] = React.useState(false);
  const [remTitle, setRemTitle] = React.useState('');
  const [remNote, setRemNote] = React.useState('');
  const [remTargetErrors, setRemTargetErrors] = React.useState<string[]>([]);
  const [remQuestionIds, setRemQuestionIds] = React.useState<string[]>([]);
  const [remVerifyId, setRemVerifyId] = React.useState('');
  const [remFeedback, setRemFeedback] = React.useState('');

  React.useEffect(() => {
    return dataService.subscribe(() => setTick((t) => t + 1));
  }, []);

  const settings = dataService.getSettings();
  const classes = React.useMemo(() => dataService.getScopedClasses(user), [tick, user]);
  const allStudents = React.useMemo(
    () =>
      dataService
        .getScopedUsers(user)
        .filter((u) => u.role === 'student' && !u.isTestAccount),
    [tick, user],
  );
  const filteredStudents = React.useMemo(() => {
    if (selectedClassId === 'ALL') return allStudents;
    return allStudents.filter((u) => u.classId === selectedClassId);
  }, [allStudents, selectedClassId]);

  const attempts = React.useMemo(
    () => dataService.getScopedAttempts(user, false),
    [tick, user],
  );
  const questions = React.useMemo(() => dataService.getQuestions(), [tick]);
  const questionById = React.useMemo(() => {
    const map = new Map<string, QuestionItem>();
    for (const q of questions) map.set(q.id, q);
    return map;
  }, [questions]);
  const classNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classes) map.set(c.id, c.name);
    return map;
  }, [classes]);

  // Group students by their current milestone (1..10)
  const studentsByMoc = React.useMemo(() => {
    const groups: Record<MocId, UserAccount[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
      10: [],
    };
    for (const s of filteredStudents) {
      const j = normalizeJourneyProgress(s.journey);
      const moc = j.currentMoc;
      groups[moc].push(s);
    }
    return groups;
  }, [filteredStudents]);

  const studentCountsByMoc = React.useMemo(() => {
    const counts: Partial<Record<MocId, number>> = {};
    for (const id of ALL_MOC_IDS) {
      counts[id] = studentsByMoc[id].length;
    }
    return counts;
  }, [studentsByMoc]);

  const completedAllCount = React.useMemo(
    () =>
      filteredStudents.filter((s) => normalizeJourneyProgress(s.journey).passedMoc.length >= 10)
        .length,
    [filteredStudents],
  );

  const selectedDef = JOURNEY_MILESTONES_BY_ID[selectedMocId];
  const studentsAtSelectedMoc = studentsByMoc[selectedMocId];
  const passedSelectedCount = React.useMemo(
    () =>
      filteredStudents.filter((s) =>
        normalizeJourneyProgress(s.journey).passedMoc.includes(selectedMocId),
      ).length,
    [filteredStudents, selectedMocId],
  );
  const primaryCluster = selectedDef.clusters[0] ?? 'NEN';

  const inspectedStudent = React.useMemo(
    () => (inspectStudentUid ? allStudents.find((s) => s.uid === inspectStudentUid) ?? null : null),
    [inspectStudentUid, allStudents],
  );

  const refresh = () => {
    setTick((t) => t + 1);
    onRefreshApp();
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-4">
      {/* Teacher / Admin Top Monitoring Header */}
      <div className="notebook-card p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
            {isAdmin ? 'Bản đồ giám sát toàn hệ thống (Admin)' : 'Bản đồ theo dõi lớp học (Giáo viên)'}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#14284A]">
            Xin chào, {user.displayName} — {filteredStudents.length} học sinh · {classes.length} lớp
          </h1>
          <p className="text-xs text-[#5B6B82]">
            Chạm vào từng cột mốc (1–10) trên bản đồ để xem danh sách học sinh đang ở mốc đó, chẩn đoán lỗi sai hoặc quản lý câu hỏi của mốc.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold text-[#14284A]"
          >
            <option value="ALL">
              {isAdmin ? `Tất cả lớp (${classes.length})` : `Tất cả lớp của tôi (${classes.length})`}
            </option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                Lớp {c.name} ({c.code})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onOpenAdmin({tab: 'users'})}
            className="btn-tactile btn-jade text-xs py-2 px-3"
          >
            <UserPlus className="w-4 h-4" /> Cấp tài khoản HS
          </button>

          <button
            type="button"
            onClick={() => onOpenAdmin({tab: 'bank'})}
            className="btn-tactile btn-gold text-xs py-2 px-3"
          >
            <Sparkles className="w-4 h-4" /> Quản lý câu hỏi
          </button>
        </div>
      </div>

      {noticeMsg && (
        <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#145B4F] flex items-center justify-between gap-2">
          <span>{noticeMsg}</span>
          <button type="button" onClick={() => setNoticeMsg('')} className="p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Split: Interactive Monitoring Map (left 8 cols) + Selected Milestone Student List (right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8 notebook-card p-2.5 sm:p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="font-display text-lg font-extrabold text-[#14284A] flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#2E9C8A] shrink-0" />
              Phân bố học sinh trên 10 mốc Chương III
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="px-2.5 py-1 rounded-lg bg-[#E6F6F3] text-[#145B4F] border border-[#9CD5CA]">
                Đã xong 10/10: {completedAllCount} HS
              </span>
            </div>
          </div>

          <JourneyMap
            journey={normalizeJourneyProgress(user.journey)}
            selectedMocId={selectedMocId}
            avatar={user.avatar}
            backgroundDataUrl={settings.mapBackgroundDataUrl}
            hasBakedLabels={settings.mapBackgroundHasBakedLabels ?? false}
            pinOverrides={settings.mapPinOverrides}
            reduceMotion={user.preferences.reduceMotion}
            onSelectMoc={setSelectedMocId}
            monitorMode={{
              studentCountsByMoc,
              totalStudents: filteredStudents.length,
              completedAllCount,
            }}
          />

          <p className="text-[11px] text-[#5B6B82] px-1">
            Con số trên mỗi ghim tròn là <strong>số lượng học sinh đang ở cột mốc đó</strong>. Nhấn trực tiếp vào cột mốc để xem danh sách chi tiết bên phải.
          </p>
        </div>

        {/* Right: Selected Milestone Roster & Question Bank Shortcut */}
        <div className="lg:col-span-4 space-y-3">
          <div className="notebook-card p-4 space-y-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-[#18685B]">
                  MỐC {selectedDef.id} · {selectedDef.city.toUpperCase()}
                </p>
                <h2 className="font-display text-xl font-extrabold text-[#14284A] leading-tight mt-0.5">
                  {selectedDef.sceneName}
                </h2>
                <p className="text-xs text-[#4B5B73] mt-1">
                  {selectedDef.lessonRef} · {selectedDef.mathTopics}
                </p>
              </div>
              <span className="shrink-0 px-3 py-1.5 rounded-xl bg-[#1E8E78] text-white font-display text-sm font-extrabold tabular-nums">
                {studentsAtSelectedMoc.length} HS
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3]">
                <span className="text-[#5B6B82] block">Đang ở mốc này</span>
                <strong className="text-[#14284A] text-base tabular-nums">
                  {studentsAtSelectedMoc.length} học sinh
                </strong>
              </div>
              <div className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#9CD5CA]">
                <span className="text-[#145B4F] block">Đã vượt qua mốc này</span>
                <strong className="text-[#145B4F] text-base tabular-nums">
                  {passedSelectedCount} học sinh
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenAdmin({tab: 'bank', cluster: primaryCluster})}
              className="btn-tactile btn-gold w-full text-xs py-2"
            >
              <BookOpen className="w-4 h-4" />
              Quản lý câu hỏi phần này ({selectedDef.clusters.join(', ')})
            </button>

            <div className="border-t border-[#E5D3A8] pt-3 space-y-2">
              <h3 className="font-display text-sm font-extrabold text-[#14284A] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#2E9C8A]" />
                Danh sách học sinh đang ở Mốc {selectedDef.id}
              </h3>

              {studentsAtSelectedMoc.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#FFFBF0] border border-dashed border-[#CBB17D] text-center text-xs text-[#5B6B82] space-y-2">
                  <p>Hiện chưa có học sinh nào đang dừng tại Mốc {selectedDef.id}: {selectedDef.city}.</p>
                  {filteredStudents.length === 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenAdmin({tab: 'users'})}
                      className="btn-tactile btn-jade text-xs py-1.5 px-3 mx-auto"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Cấp tài khoản học sinh ngay
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {studentsAtSelectedMoc.map((stu) => {
                    const j = normalizeJourneyProgress(stu.journey);
                    const stuAttempts = attempts.filter((a) => a.userId === stu.uid);
                    const wrongAttempts = stuAttempts.filter((a) => !a.isCorrect);
                    const lastErr = wrongAttempts.find((a) => a.errorCode)?.errorCode;
                    const passedAll = j.passedMoc.length >= 10;

                    return (
                      <div
                        key={stu.uid}
                        className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-extrabold text-[#14284A] truncate">
                              {stu.displayName}{' '}
                              <span className="font-normal text-[#5B6B82]">({stu.username})</span>
                            </p>
                            <p className="text-[11px] text-[#5B6B82]">
                              {stu.studentCode} · Lớp{' '}
                              <strong>{classNameById.get(stu.classId ?? '') ?? stu.classCode}</strong> ·{' '}
                              <strong className="text-[#14284A]">{stu.xp} XP</strong>
                            </p>
                          </div>
                          {passedAll && (
                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#1E8E78] text-white text-[10px] font-extrabold">
                              10/10 ✓
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                          <span className="text-[#4B5B73]">
                            {stuAttempts.length} lượt làm ·{' '}
                            <strong className={wrongAttempts.length > 0 ? 'text-[#B24A16]' : 'text-[#1F7A6B]'}>
                              {wrongAttempts.length} câu sai
                            </strong>
                          </span>
                          {lastErr && ERROR_CATALOG[lastErr] && (
                            <span className="text-[#8A5108] font-bold truncate max-w-[180px]" title={ERROR_CATALOG[lastErr].label}>
                              Lỗi gần nhất: {lastErr}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => setInspectStudentUid(stu.uid)}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#14284A] text-[#FFFBF0] font-bold flex items-center justify-center gap-1 !min-h-[32px]"
                          >
                            <BarChart3 className="w-3.5 h-3.5" /> Tiến độ &amp; Lỗi sai
                          </button>
                          {!passedAll && (
                            <button
                              type="button"
                              onClick={() => {
                                const res = dataService.adminUnlockNextMoc(user, stu.uid);
                                setNoticeMsg(
                                  res.ok
                                    ? `Đã mở mốc kế tiếp cho ${stu.displayName} (qua Mốc ${res.passedMocId} → Mốc ${res.unlockedMoc}).`
                                    : res.error ?? 'Không thể mở mốc kế tiếp.',
                                );
                                refresh();
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] font-bold flex items-center gap-1 !min-h-[32px]"
                              title="Hỗ trợ mở mốc kế tiếp cho học sinh"
                            >
                              <FastForward className="w-3.5 h-3.5" /> Mở tiếp
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 10-Milestone Summary Strip */}
      <section className="notebook-card-warm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base sm:text-lg font-extrabold text-[#14284A] flex items-center gap-1.5">
            <ShieldCheck className="w-5 h-5 text-[#2E9C8A]" />
            Tổng hợp số lượng học sinh theo từng cột mốc (1 → 10)
          </h2>
          <span className="text-xs font-semibold text-[#5B6B82]">
            Bấm vào bất kỳ mốc nào để lọc danh sách học sinh ở mốc đó
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {JOURNEY_MILESTONES.map((m) => {
            const count = studentsByMoc[m.id].length;
            const active = selectedMocId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMocId(m.id)}
                className={`text-left p-3 rounded-xl border-2 transition-colors flex items-center justify-between gap-2 ${
                  active
                    ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                    : count > 0
                      ? 'bg-[#E6F6F3] text-[#14284A] border-[#2E9C8A] hover:bg-[#D5F0EA]'
                      : 'bg-[#FFFBF0] text-[#4B5B73] border-[#D9C293] hover:bg-[#FFF4D6]'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-extrabold truncate">
                    Mốc {m.id}: {m.city}
                  </p>
                  <p className={`text-[10px] truncate ${active ? 'text-[#E2E8F0]' : 'text-[#5B6B82]'}`}>
                    {m.clusters.join(', ')}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                    active
                      ? 'bg-[#E0A93B] text-[#14284A]'
                      : count > 0
                        ? 'bg-[#1E8E78] text-white'
                        : 'bg-[#E5D3A8]/60 text-[#5B6B82]'
                  }`}
                >
                  {count} HS
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Student Progress & Error Diagnostics Modal */}
      {inspectedStudent && (() => {
        const j = normalizeJourneyProgress(inspectedStudent.journey);
        const stuAttempts = attempts.filter((a) => a.userId === inspectedStudent.uid);
        const wrongAttempts = stuAttempts.filter((a) => !a.isCorrect).reverse();
        const errCounts = new Map<string, number>();
        for (const a of wrongAttempts) {
          const code = a.errorCode || 'OTHER';
          errCounts.set(code, (errCounts.get(code) ?? 0) + 1);
        }
        const topErrors = Array.from(errCounts.entries()).sort((a, b) => b[1] - a[1]);

        return (
          <div
            className="fixed inset-0 z-50 bg-[#14284A]/60 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="notebook-card max-w-3xl w-full max-h-[90dvh] overflow-y-auto p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-[#E5D3A8] pb-3">
                <div>
                  <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
                    Hồ sơ chẩn đoán học tập · {inspectedStudent.studentCode}
                  </p>
                  <h3 className="font-display text-2xl font-extrabold text-[#14284A]">
                    {inspectedStudent.displayName} ({inspectedStudent.username})
                  </h3>
                  <p className="text-xs text-[#5B6B82]">
                    Lớp: <strong>{classNameById.get(inspectedStudent.classId ?? '') ?? inspectedStudent.classCode}</strong> ·{' '}
                    Đang ở: <strong>Mốc {j.currentMoc}/10 ({computeJourneyPercent(j)}%)</strong> ·{' '}
                    XP: <strong>{inspectedStudent.xp}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInspectStudentUid(null);
                    setRemDraftOpen(false);
                    setRemFeedback('');
                  }}
                  className="p-1.5 rounded-lg hover:bg-[#FFF4D6]"
                >
                  <X className="w-5 h-5 text-[#14284A]" />
                </button>
              </div>

              {/* 6 Skill Clusters */}
              <div className="space-y-2">
                <h4 className="font-display text-base font-extrabold text-[#14284A]">
                  1. Đánh giá 6 cụm kiến thức Chương III
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SKILL_CLUSTER_LIST.map((c) => {
                    const rec = inspectedStudent.skills[c];
                    const meta = SKILL_CLUSTERS[c];
                    const cWrong = wrongAttempts.filter((a) => a.cluster === c).length;
                    return (
                      <div key={c} className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-[#14284A]">
                            {c} · {meta.shortTitle}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFF3DB] text-[#8A5108] font-bold text-[11px]">
                            {rec.state}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5B6B82]">
                          Đúng tự lực: <strong>{rec.verifyCorrect}</strong> · Có hỗ trợ:{' '}
                          <strong>{rec.practiceCorrect}</strong> · Sai:{' '}
                          <strong className="text-[#B24A16]">{cWrong}</strong> · Tổng:{' '}
                          <strong>{rec.totalAttempts}</strong>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Errors */}
              <div className="space-y-2">
                <h4 className="font-display text-base font-extrabold text-[#14284A] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#D98A1F]" />
                  2. Các lỗi học sinh đang mắc ({wrongAttempts.length} lượt sai)
                </h4>
                {topErrors.length === 0 ? (
                  <p className="text-xs text-[#1F7A6B] p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A]">
                    Học sinh chưa có lượt làm sai nào được ghi nhận.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {topErrors.map(([code, count]) => {
                      const info = ERROR_CATALOG[code];
                      return (
                        <div key={code} className="p-3 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-[#8A5108]">
                              {code === 'OTHER'
                                ? 'Lỗi tính toán / sai đáp án'
                                : `${code} — ${info?.label ?? code}`}
                            </span>
                            <span className="font-extrabold text-[#B24A16] tabular-nums">{count} lần</span>
                          </div>
                          {info?.stepHint && (
                            <p className="text-[11px] text-[#5C3A06] mt-1">
                              <strong>Gợi ý ôn tập:</strong> {info.stepHint}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Wrong Attempts */}
              {wrongAttempts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-display text-base font-extrabold text-[#14284A]">
                    3. Chi tiết các câu làm sai gần nhất
                  </h4>
                  <div className="space-y-2">
                    {wrongAttempts.slice(0, 12).map((att) => {
                      const qItem = questionById.get(att.questionId);
                      const errInfo = att.errorCode ? ERROR_CATALOG[att.errorCode] : undefined;
                      return (
                        <div key={att.id} className="p-3 rounded-xl bg-white border border-[#E5D3A8] text-xs space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-extrabold text-[#14284A]">
                              Câu {att.questionId} · Cụm {att.cluster} ·{' '}
                              {att.mode === 'verify' ? 'Kiểm chứng' : 'Luyện tập'}
                            </span>
                            <span className="text-[11px] text-[#5B6B82]">
                              {new Date(att.createdAt).toLocaleString('vi-VN')}
                            </span>
                          </div>
                          {qItem?.stem_vi && (
                            <div className="text-[#4B5B73]">
                              <MathText text={qItem.stem_vi} maxLength={200} />
                            </div>
                          )}
                          <p>
                            <strong>Học sinh trả lời:</strong>{' '}
                            <span className="font-mono text-[#B24A16]">
                              {att.clickedDontKnow
                                ? '(Bấm "Em chưa biết")'
                                : typeof att.answerRaw === 'string' || typeof att.answerRaw === 'number'
                                  ? String(att.answerRaw)
                                  : JSON.stringify(att.answerRaw)}
                            </span>
                            {att.usedHint ? ' · (Đã xem gợi ý)' : ''}
                          </p>
                          {att.errorCode && (
                            <p className="text-[#8A5108] font-semibold">
                              <strong>Lỗi chẩn đoán:</strong> {att.errorCode}
                              {errInfo ? ` — ${errInfo.label}` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 4. Closed-loop Teacher-Approved Individualized Remediation Worksheet */}
              {(() => {
                const approvedQs = questions.filter((q) => q.review_status === 'approved');
                const studentRemList = dataService.getRemediationAssignments(inspectedStudent.uid);
                return (
                  <div className="space-y-3 pt-2 border-t-2 border-[#E5D3A8]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-display text-base font-extrabold text-[#14284A] flex items-center gap-1.5">
                        <ClipboardCheck className="w-4 h-4 text-[#1F7A6B]" />
                        4. Cá nhân hóa có Giáo viên duyệt: Giao phiếu bổ trợ &amp; kiểm chứng mới
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          const prop = dataService.proposeRemediationForStudent(inspectedStudent.uid);
                          setRemTargetErrors(prop.targetErrorCodes);
                          setRemQuestionIds(prop.remediationQuestionIds);
                          setRemVerifyId(prop.verifyQuestionId);
                          setRemTitle(prop.suggestedTitle);
                          setRemNote(prop.suggestedNote);
                          setRemFeedback('');
                          setRemDraftOpen(true);
                        }}
                        className="btn-tactile btn-gold text-xs py-1.5 px-3"
                      >
                        Đề xuất phiếu bổ trợ theo lỗi
                      </button>
                    </div>

                    {remFeedback && (
                      <p className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#1F7A6B]">
                        {remFeedback}
                      </p>
                    )}

                    {remDraftOpen && (
                      <div className="p-4 rounded-2xl bg-[#FFFBF0] border-2 border-[#2E9C8A] space-y-3 text-xs">
                        <p className="font-extrabold text-[#1F7A6B]">
                          Quy trình: Xem lỗi → Hệ thống đề xuất → Giáo viên sửa &amp; duyệt → Giao hoặc in phiếu → Học sinh nộp &amp; tự giải bài mới
                        </p>
                        <div className="space-y-1">
                          <label className="font-bold text-[#14284A]">Tiêu đề phiếu bổ trợ</label>
                          <input
                            type="text"
                            value={remTitle}
                            onChange={(e) => setRemTitle(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold text-[#14284A]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-bold text-[#14284A]">Lời dặn của Giáo viên (có thể chỉnh sửa)</label>
                          <textarea
                            rows={2}
                            value={remNote}
                            onChange={(e) => setRemNote(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-[#14284A]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <p className="font-bold text-[#14284A]">
                            Chọn câu hỏi bổ trợ đã kiểm duyệt ({remQuestionIds.length} câu):
                          </p>
                          <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 rounded-xl bg-white border border-[#E5D3A8]">
                            {approvedQs.slice(0, 30).map((q) => {
                              const checked = remQuestionIds.includes(q.id);
                              return (
                                <label
                                  key={q.id}
                                  className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-[#FFF8E6] cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setRemQuestionIds((prev) =>
                                        prev.includes(q.id)
                                          ? prev.filter((id) => id !== q.id)
                                          : [...prev, q.id],
                                      )
                                    }
                                    className="mt-0.5"
                                  />
                                  <span className="text-[11px] leading-snug text-[#14284A]">
                                    <strong>{q.id}</strong> ({q.cluster} · M{q.level} ·{' '}
                                    {q.anticipated_error_ids.join(',')})
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="font-bold text-[#14284A]">
                            Câu kiểm chứng mới ở bước cuối (chế độ không gợi ý):
                          </label>
                          <select
                            value={remVerifyId}
                            onChange={(e) => setRemVerifyId(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold text-[#14284A]"
                          >
                            {approvedQs.map((q) => (
                              <option key={q.id} value={q.id}>
                                {q.id} · Cụm {q.cluster} · Mức {q.level} ({q.anticipated_error_ids.join(', ')})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              const res = dataService.assignRemediationWorksheet(user, {
                                studentUid: inspectedStudent.uid,
                                title: remTitle,
                                targetErrorCodes: remTargetErrors,
                                remediationQuestionIds: remQuestionIds,
                                verifyQuestionId: remVerifyId,
                                teacherNote: remNote,
                              });
                              if (!res.ok) {
                                setRemFeedback(res.error ?? 'Chưa thể giao phiếu.');
                              } else {
                                setRemFeedback(
                                  `Đã duyệt và giao phiếu "${res.assignment?.title}" trực tiếp tới học sinh ${inspectedStudent.displayName} (đã đồng bộ máy chủ).`,
                                );
                                setRemDraftOpen(false);
                              }
                            }}
                            className="btn-tactile btn-jade text-xs py-2 px-3.5"
                          >
                            <Send className="w-3.5 h-3.5" /> Duyệt &amp; Giao phiếu cho học sinh
                          </button>
                          <button
                            type="button"
                            onClick={() => window.print()}
                            className="btn-tactile btn-paper text-xs py-2 px-3"
                          >
                            <Printer className="w-3.5 h-3.5" /> In / Xuất phiếu PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemDraftOpen(false)}
                            className="text-xs font-bold text-[#5B6B82] underline px-2"
                          >
                            Đóng khung soạn
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Assigned Worksheets Status List */}
                    {studentRemList.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-[#4B5B73]">
                          Phiếu bổ trợ đã giao cho {inspectedStudent.displayName} ({studentRemList.length}):
                        </p>
                        {studentRemList.map((rem) => (
                          <div
                            key={rem.id}
                            className="p-2.5 rounded-xl bg-white border border-[#E5D3A8] flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <p className="font-bold text-[#14284A]">{rem.title}</p>
                              <p className="text-[11px] text-[#5B6B82]">
                                Câu bổ trợ: {rem.remediationQuestionIds.join(', ')} · Kiểm chứng mới: {rem.verifyQuestionId}
                              </p>
                            </div>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                                rem.status === 'verified_passed'
                                  ? 'bg-[#E6F6F3] text-[#1F7A6B] border border-[#2E9C8A]'
                                  : rem.status === 'remediation_done'
                                    ? 'bg-[#E8F3FA] text-[#1F3B63]'
                                    : 'bg-[#FFF3DB] text-[#8A5108]'
                              }`}
                            >
                              {rem.status === 'verified_passed'
                                ? 'Đạt kiểm chứng tự giải ✓'
                                : rem.status === 'remediation_done'
                                  ? 'Đã xong bổ trợ · Chờ bài kiểm chứng'
                                  : `Đang làm (${rem.remediationCompletedIds.length}/${rem.remediationQuestionIds.length})`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

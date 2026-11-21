import React from 'react';
import {
  CheckCircle2,
  Compass,
  Crown,
  Lightbulb,
  Lock,
  MapPin,
  Play,
  RotateCcw,
  Sparkles,
  Swords,
  Trophy,
} from 'lucide-react';
import {Avatar} from '../components/Avatar.tsx';
import {RedSealStamp, WaveDivider} from '../components/HeritageMotifs.tsx';
import {JourneyMap} from '../components/JourneyMap.tsx';
import {BOSSES, computeJourneyLevel} from '../config.ts';
import {
  canChallengeMocBoss,
  canEnterMoc,
  computeJourneyPercent,
  isFreeModeUnlocked,
  JOURNEY_MILESTONES,
  JOURNEY_MILESTONES_BY_ID,
  normalizeJourneyProgress,
  shouldSkipFoundationWarmup,
} from '../journey.ts';
import {dataService} from '../services/dataService.ts';
import type {MocId, UserAccount} from '../types.ts';

interface AdventureMapProps {
  user: UserAccount;
  animateFromMoc?: MocId | null;
  celebrateAllComplete?: boolean;
  onAnimationDone?: () => void;
  onDismissCelebration?: () => void;
  onExploreMoc: (mocId: MocId) => void;
  onStartMission: (mocId: MocId) => void;
  onStartBoss: (mocId: MocId) => void;
  onResumePaused: () => void;
}

export const AdventureMap: React.FC<AdventureMapProps> = ({
  user,
  animateFromMoc = null,
  celebrateAllComplete = false,
  onAnimationDone,
  onDismissCelebration,
  onExploreMoc,
  onStartMission,
  onStartBoss,
  onResumePaused,
}) => {
  const settings = dataService.getSettings();
  const unlockAllDemo = Boolean(settings.journeyUnlockAllDemo);
  const journey = React.useMemo(() => normalizeJourneyProgress(user.journey), [user.journey]);
  const freeMode = isFreeModeUnlocked(journey);
  const journeyPercent = computeJourneyPercent(journey);
  const journeyLevel = computeJourneyLevel(user.xp, user.skills);

  const [selectedMocId, setSelectedMocId] = React.useState<MocId>(journey.currentMoc);

  // Keep selected milestone synced when student advances to a new milestone
  React.useEffect(() => {
    setSelectedMocId(journey.currentMoc);
  }, [journey.currentMoc]);

  const selectedDef = JOURNEY_MILESTONES_BY_ID[selectedMocId];
  const selectedStatus = journey.mocStatus[selectedMocId];
  const selectedPassed = journey.passedMoc.includes(selectedMocId);
  const selectedUnlocked = canEnterMoc(selectedMocId, journey, unlockAllDemo);
  const selectedBoss = selectedDef.bossId ? BOSSES[selectedDef.bossId] : null;
  const canFightBoss = selectedBoss
    ? canChallengeMocBoss(selectedMocId, journey, unlockAllDemo)
    : false;
  const skipWarmup = shouldSkipFoundationWarmup(selectedMocId, user);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-4">
      {/* Compact Student Header */}
      <div className="notebook-card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FFF4D6] border-2 border-[#D5B87E] flex items-center justify-center overflow-hidden shrink-0">
            <Avatar appearance={user.avatar} size={60} />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base sm:text-lg font-extrabold text-[#14284A] leading-tight truncate">
              {user.displayName}
            </p>
            <p className="text-xs font-semibold text-[#18685B]">
              Cấp {journeyLevel.level}: {journeyLevel.name} ·{' '}
              <span className="tabular-nums">{user.xp} XP</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#1F3B63]">
          {unlockAllDemo && (
            <span className="px-2.5 py-1 rounded-xl bg-[#FFF3DB] border border-[#D98A1F] text-[#8A5108]">
              Chế độ trình diễn (mở toàn bộ mốc)
            </span>
          )}
          {freeMode && (
            <span className="px-2.5 py-1 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Chế độ tự do
            </span>
          )}
          <div className="px-3 py-1.5 rounded-xl bg-[#FFF4D6] border border-[#D5B87E] tabular-nums">
            Hành trình: {journey.passedMoc.length}/10 mốc ({journeyPercent}%)
          </div>
        </div>
      </div>

      {/* Resume paused session card */}
      {user.pausedSession && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display font-bold text-[#14284A]">
              Em đang tạm dừng một phiên học — tiếp tục đúng chỗ vừa nghỉ nhé!
            </p>
            <p className="text-xs text-[#5B6B82]">
              {user.pausedSession.kind === 'boss'
                ? `Đấu BOSS tại ${
                    user.pausedSession.mocId
                      ? `Mốc ${user.pausedSession.mocId}: ${JOURNEY_MILESTONES_BY_ID[user.pausedSession.mocId].city}`
                      : `trạm ${user.pausedSession.stationId}`
                  }`
                : user.pausedSession.kind === 'mission'
                  ? `Nhiệm vụ tại ${
                      user.pausedSession.mocId
                        ? `Mốc ${user.pausedSession.mocId}: ${JOURNEY_MILESTONES_BY_ID[user.pausedSession.mocId].city}`
                        : `trạm ${user.pausedSession.stationId}`
                    } (bước ${user.pausedSession.stepIndex + 1})`
                  : 'Phiên luyện tập chủ đề'}
            </p>
          </div>
          <button type="button" onClick={onResumePaused} className="btn-tactile btn-gold text-sm">
            <RotateCcw className="w-4 h-4" />
            Tiếp tục ngay
          </button>
        </div>
      )}

      {/* Main Split: Interactive Vietnam 10-Milestone Map (left 8 cols) + Selected Milestone Card (right 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Full-bleed Adventure Map */}
        <div className="lg:col-span-8 notebook-card p-2.5 sm:p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h1 className="font-display text-lg sm:text-xl font-extrabold text-[#14284A] flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#2E9C8A] shrink-0" />
              Bản đồ Du Ký · Hành trình 10 mốc
            </h1>
            <p className="text-xs font-semibold text-[#18685B]">
              {freeMode
                ? 'Đã hoàn thành cả 10 mốc — Chế độ tự do đang mở!'
                : 'Đi theo lộ trình — hoàn thành mốc hiện tại để mở mốc kế tiếp'}
            </p>
          </div>

          <JourneyMap
            journey={journey}
            selectedMocId={selectedMocId}
            avatar={user.avatar}
            unlockAllDemo={unlockAllDemo}
            backgroundDataUrl={settings.mapBackgroundDataUrl}
            hasBakedLabels={settings.mapBackgroundHasBakedLabels ?? false}
            pinOverrides={settings.mapPinOverrides}
            reduceMotion={user.preferences.reduceMotion}
            animateFromMoc={animateFromMoc}
            onAnimationDone={onAnimationDone}
            onSelectMoc={setSelectedMocId}
          />

          <p className="text-[11px] text-[#5B6B82] px-1">
            Hành trình Nam → Bắc gồm 10 mốc học tập Chương III "Hệ thức lượng trong tam giác" (Toán 10 KNTT), hiển thị Biển Đông, Dãy núi Trường Sơn, Quần đảo Hoàng Sa và Quần đảo Trường Sa.
          </p>
        </div>

        {/* Right: Selected Milestone Detail Card */}
        <div className="lg:col-span-4 space-y-4">
          <div
            className="notebook-card p-4 sm:p-5 space-y-3.5"
            data-testid="milestone-detail-card"
            data-selected-moc={selectedMocId}
            data-selected-unlocked={selectedUnlocked ? 'true' : 'false'}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-[#18685B]">
                  MỐC {selectedDef.id} · {selectedDef.city.toUpperCase()}
                </p>
                <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#14284A] leading-tight mt-0.5">
                  {selectedDef.sceneName}
                </h2>
                <p className="text-xs font-semibold text-[#4B5B73] mt-1">
                  {selectedDef.lessonRef} · {selectedDef.levelLabel}
                </p>
              </div>
              {selectedPassed ? (
                <RedSealStamp
                  label="ĐÃ QUA"
                  sublabel={`MỐC ${selectedDef.id}`}
                  className="shrink-0"
                />
              ) : !selectedUnlocked ? (
                <span className="shrink-0 px-2.5 py-1 rounded-xl bg-[#F1F5F9] border border-[#CBD5E1] text-[#475569] text-xs font-extrabold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Đang khóa
                </span>
              ) : (
                <span className="shrink-0 px-2.5 py-1 rounded-xl bg-[#FFF4D6] border border-[#E0A93B] text-[#8A5108] text-xs font-extrabold">
                  Đang mở
                </span>
              )}
            </div>

            <WaveDivider />

            {/* Topics + Narrative */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-[#14284A] bg-[#FFF4D6] border border-[#E2CFA3] rounded-xl px-3 py-2">
                Nội dung Toán: <span className="font-semibold text-[#1F3B63]">{selectedDef.mathTopics}</span>
              </p>
              <p className="text-sm text-[#1B2A41] leading-relaxed font-map">
                {selectedDef.narrative_vi}
              </p>
            </div>

            {/* Short non-test preparation hint (Rule 3.7) */}
            {selectedUnlocked && selectedDef.prepHint_vi && (
              <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#9CD5CA] text-xs text-[#145B4F] space-y-1">
                <p className="font-extrabold flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-[#18685B] shrink-0" />
                  Gợi ý chuẩn bị trước mốc (không phải bài kiểm tra)
                </p>
                <p className="leading-relaxed text-[#1B2A41]">{selectedDef.prepHint_vi}</p>
                {skipWarmup && (
                  <p className="text-[11px] font-bold text-[#1F7A6B] pt-0.5">
                    ✓ Em đã có minh chứng nền tảng từ các mốc trước — có thể vào thẳng nhiệm vụ chính (không cần ôn lại bước khởi động).
                  </p>
                )}
              </div>
            )}

            {/* 2 Info Tiles: Mission & BOSS */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3]">
                <span className="text-[#5B6B82] block">Nhiệm vụ mốc</span>
                <strong className="text-[#14284A] block mt-0.5">
                  {selectedStatus?.missionCompleted
                    ? 'Đã hoàn thành ✓'
                    : selectedDef.isBS01Full
                      ? 'BS01 (S01–S08)'
                      : `${selectedDef.missionQuestionCount} câu khảo sát`}
                </strong>
              </div>
              <div className="p-2.5 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3]">
                <span className="text-[#5B6B82] block">BOSS mốc</span>
                <strong className="text-[#14284A] flex items-center gap-1 mt-0.5">
                  {!selectedBoss ? (
                    <span className="text-[#5B6B82]">Không có BOSS</span>
                  ) : selectedStatus?.bossDefeated ? (
                    <>
                      <Crown className="w-3.5 h-3.5 text-[#B9831E] shrink-0" /> Đã vượt qua
                    </>
                  ) : (
                    <span className="truncate">{selectedBoss.name}</span>
                  )}
                </strong>
              </div>
            </div>

            {/* Condition to pass */}
            <p className="text-[11px] font-semibold text-[#4B5B73]">
              Điều kiện qua mốc: <strong className="text-[#14284A]">{selectedDef.passCondition_vi}</strong>
            </p>

            {/* LOCKED PREVIEW vs UNLOCKED ACTION BUTTONS */}
            {!selectedUnlocked ? (
              <div
                className="p-4 rounded-2xl bg-[#F8FAFC] border-2 border-dashed border-[#94A3B8] text-center space-y-1.5"
                data-testid="locked-milestone-notice"
              >
                <div className="w-10 h-10 mx-auto rounded-full bg-[#E2E8F0] text-[#475569] flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <p className="font-display text-base font-extrabold text-[#14284A]">
                  Hoàn thành Mốc {selectedDef.id - 1} để mở
                </p>
                <p className="text-xs text-[#475569]">
                  Mốc {selectedDef.id} ({selectedDef.city}) chỉ mở sau khi em hoàn thành Mốc {selectedDef.id - 1}:{' '}
                  <strong>{JOURNEY_MILESTONES_BY_ID[(selectedDef.id - 1) as MocId].city}</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {selectedPassed && (
                  <p className="text-[11px] font-semibold text-[#18685B] bg-[#E6F6F3] px-3 py-1.5 rounded-lg border border-[#9CD5CA]">
                    Em đã vượt qua mốc này! Chọn "Ôn lại" để luyện thêm kỹ năng (không nhân đôi XP/phần thưởng).
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => onExploreMoc(selectedDef.id)}
                  className="btn-tactile btn-jade w-full text-sm sm:text-base"
                >
                  <MapPin className="w-5 h-5" />
                  Vào cảnh khám phá 2D
                </button>

                <button
                  type="button"
                  onClick={() => onStartMission(selectedDef.id)}
                  className="btn-tactile btn-gold w-full text-sm sm:text-base"
                >
                  <Play className="w-5 h-5" />
                  {selectedPassed
                    ? 'Ôn lại nhiệm vụ mốc'
                    : selectedDef.isBS01Full
                      ? 'Làm nhiệm vụ khảo sát S01–S08'
                      : `Làm nhiệm vụ mốc (${selectedDef.missionQuestionCount} câu)`}
                </button>

                {selectedBoss && (
                  <div className="space-y-1">
                    <button
                      type="button"
                      disabled={!canFightBoss}
                      onClick={() => onStartBoss(selectedDef.id)}
                      className={`btn-tactile w-full text-sm sm:text-base ${
                        canFightBoss
                          ? 'btn-ink'
                          : 'bg-[#E2E8F0] text-[#64748B] border-2 border-[#CBD5E1] cursor-not-allowed shadow-none'
                      }`}
                    >
                      {canFightBoss ? (
                        <Swords className="w-5 h-5 text-[#E0A93B]" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                      {selectedStatus?.bossDefeated
                        ? `Ôn lại BOSS: ${selectedBoss.name}`
                        : `Đấu BOSS: ${selectedBoss.name} (${selectedBoss.hitLevels.length} đòn)`}
                    </button>
                    {!canFightBoss && (
                      <p className="text-[11px] font-bold text-[#8A5108] text-center">
                        Hoàn thành nhiệm vụ để mở BOSS
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Read-only Vertical Journey Timeline (replaces old quick free-pick list) */}
      <section className="notebook-card-warm p-4 space-y-3" aria-label="Lộ trình 10 mốc theo thứ tự Nam đến Bắc">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base sm:text-lg font-extrabold text-[#14284A]">
            Lộ trình 10 mốc (Nam → Bắc · chỉ đọc tiến độ)
          </h2>
          <span className="text-xs font-semibold text-[#5B6B82]">
            Hoàn thành từng mốc để mở mốc kế tiếp · Không phạt khi sai
          </span>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="journey-timeline">
          {JOURNEY_MILESTONES.map((m) => {
            const passed = journey.passedMoc.includes(m.id);
            const current = !freeMode && journey.currentMoc === m.id;
            const unlocked = canEnterMoc(m.id, journey, unlockAllDemo);
            const active = selectedMocId === m.id;
            const boss = m.bossId ? BOSSES[m.bossId] : null;
            const bossDefeated = Boolean(journey.mocStatus[m.id]?.bossDefeated);

            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelectedMocId(m.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border-2 flex items-center justify-between gap-2 transition-colors ${
                    active
                      ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                      : passed
                        ? 'bg-[#E6F6F3] text-[#14284A] border-[#9CD5CA] hover:bg-[#D5F0EA]'
                        : current
                          ? 'bg-[#FFF4D6] text-[#14284A] border-[#E0A93B] hover:bg-[#FDEBC0]'
                          : 'bg-[#F8FAFC] text-[#64748B] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-extrabold border ${
                        passed
                          ? 'bg-[#1E8E78] text-white border-[#145B4F]'
                          : current
                            ? 'bg-[#E0A93B] text-[#14284A] border-[#8A5108]'
                            : unlocked
                              ? 'bg-[#FFFBF0] text-[#14284A] border-[#C9A86A]'
                              : 'bg-[#E2E8F0] text-[#64748B] border-[#94A3B8]'
                      }`}
                    >
                      {passed ? <CheckCircle2 className="w-4 h-4" /> : unlocked ? m.id : <Lock className="w-3.5 h-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-extrabold truncate">
                        Mốc {m.id}: {m.city} — <span className="font-semibold opacity-90">{m.sceneName}</span>
                      </p>
                      <p className={`text-[11px] truncate ${active ? 'text-[#E2E8F0]' : 'text-[#5B6B82]'}`}>
                        {m.lessonRef} · {m.levelLabel}
                        {boss ? ` · BOSS: ${boss.name}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-extrabold">
                    {bossDefeated && (
                      <Crown className={`w-3.5 h-3.5 ${active ? 'text-[#F7CE4E]' : 'text-[#B9831E]'}`} />
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-lg ${
                        passed
                          ? active
                            ? 'bg-[#2E9C8A] text-white'
                            : 'bg-[#1E8E78] text-white'
                          : current
                            ? 'bg-[#E0A93B] text-[#14284A]'
                            : unlocked
                              ? 'bg-[#FFF4D6] text-[#8A5108]'
                              : 'bg-[#E2E8F0] text-[#475569]'
                      }`}
                    >
                      {passed ? 'Đã qua' : current ? 'Hiện tại' : unlocked ? 'Mở' : 'Khóa'}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Celebration Modal when student completes all 10 milestones and unlocks Free Mode */}
      {celebrateAllComplete && (
        <div
          className="fixed inset-0 z-50 bg-[#14284A]/65 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Chúc mừng hoàn thành hành trình 10 mốc"
        >
          <div className="notebook-card max-w-md w-full p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] flex items-center justify-center">
              <Trophy className="w-9 h-9 text-[#B9831E]" />
            </div>
            <div className="flex justify-center">
              <RedSealStamp label="HOÀN THÀNH 10 MỐC" sublabel="CHẾ ĐỘ TỰ DO" />
            </div>
            <h2 className="font-display text-2xl font-extrabold text-[#14284A]">
              Chúc mừng em chinh phục trọn vẹn Toán Du Ký!
            </h2>
            <p className="text-sm text-[#1B2A41] leading-relaxed">
              Em đã vượt qua cả 10 mốc hành trình từ Tây Ninh đến Hà Giang và hoàn thành Chương III "Hệ thức lượng trong tam giác".{' '}
              <strong>Chế độ tự do</strong> đã mở — em có thể quay lại ôn tập bất kỳ mốc hay BOSS nào bất cứ lúc nào!
            </p>
            <button
              type="button"
              onClick={onDismissCelebration}
              className="btn-tactile btn-jade w-full"
            >
              Khám phá Chế độ tự do
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

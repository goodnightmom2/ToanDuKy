import React from 'react';
import {ArrowLeft, Crown, Gift, RefreshCw, Sparkles} from 'lucide-react';
import {Avatar} from '../components/Avatar.tsx';
import {BambooHpBar, BossSvg} from '../components/BossSvg.tsx';
import {CloudScroll, DongSonWatermark, RedSealStamp, WaveDivider} from '../components/HeritageMotifs.tsx';
import {QuestionCard, type QuestionSubmissionPayload} from '../components/QuestionCard.tsx';
import {BOSSES, computeBossRemainingHp, OUTFITS, STATIONS_BY_ID} from '../config.ts';
import {JOURNEY_MILESTONES_BY_ID} from '../journey.ts';
import {buildBossBattleDeck} from '../math/bankAnalysis.ts';
import {generateVariantForBossHit} from '../math/generators.ts';
import {resolveBossSetQuestions} from '../math/missionSetEngine.ts';
import {dataService} from '../services/dataService.ts';
import type {MocId, QuestionItem, QuestionMode, StationId, UserAccount} from '../types.ts';
import {soundEngine} from '../utils/audio.ts';

interface BossBattleProps {
  user: UserAccount;
  stationId: StationId;
  mocId?: MocId;
  initialHitIndex?: number;
  initialBossHp?: number;
  onUserUpdated: (user: UserAccount) => void;
  onMocPassed?: (passedMocId: MocId, allCompleted: boolean) => void;
  onBackToMap: () => void;
}

export const BossBattle: React.FC<BossBattleProps> = ({
  user,
  stationId,
  mocId,
  initialHitIndex = 0,
  initialBossHp = 100,
  onUserUpdated,
  onMocPassed,
  onBackToMap,
}) => {
  const activeMocId: MocId = mocId ?? (stationId === 'QS01' ? 2 : stationId === 'DD01' ? 4 : stationId === 'BS01' ? 6 : stationId === 'KV01' ? 8 : 10);
  const mocDef = JOURNEY_MILESTONES_BY_ID[activeMocId];
  const station = STATIONS_BY_ID[mocDef.stationId ?? stationId];
  const boss = BOSSES[mocDef.bossId ?? station.bossId];
  const settings = dataService.getSettings();
  const totalHits = boss.hitLevels.length;
  const usedSupportRef = React.useRef(false);

  const [hitIndex, setHitIndex] = React.useState(initialHitIndex);
  // Single source of truth: valid completed hits -> HP is deterministically derived (always 0% on final hit)
  const [completedHits, setCompletedHits] = React.useState(() =>
    initialBossHp <= 0.1 ? totalHits : Math.min(totalHits, Math.max(0, initialHitIndex)),
  );
  const bossHp = computeBossRemainingHp(boss.hitLevels, completedHits);
  const [deck, setDeck] = React.useState<QuestionItem[]>(() => {
    const prevIds = (user.recentQuestionSessions ?? []).slice(-1).flat();
    const bank = dataService.getQuestionsForClass(user.classId);
    const allowPending = dataService.shouldAllowPendingForUser(user);
    const built = buildBossBattleDeck({
      bossId: boss.id,
      bank,
      allowPending,
      previousRunIds: prevIds,
    });
    const publishedSet = dataService.getPublishedMissionSetForMoc(activeMocId, user.classId);
    if (publishedSet && publishedSet.bossSlots && publishedSet.bossSlots.length > 0) {
      const fromSet = resolveBossSetQuestions({
        missionSet: publishedSet,
        bank,
        userId: user.uid,
        recentSessions: user.recentQuestionSessions ?? [],
        nonce: (user.recentQuestionSessions ?? []).length,
      });
      if (fromSet.length >= boss.hitLevels.length) {
        return fromSet.slice(0, boss.hitLevels.length);
      }
      if (fromSet.length > 0) {
        const seen = new Set(fromSet.map((q) => q.id));
        const merged = [...fromSet];
        for (const fallbackQ of built.questions) {
          if (merged.length >= boss.hitLevels.length) break;
          if (!seen.has(fallbackQ.id)) {
            merged.push(fallbackQ);
            seen.add(fallbackQ.id);
          }
        }
        return merged;
      }
    }
    return built.questions;
  });
  const currentQuestion = deck[Math.min(hitIndex, deck.length - 1)];

  React.useEffect(() => {
    // Remember this battle's question IDs so the next battle differs
    const ids = deck.map((q) => q.id);
    if (ids.length > 0) {
      dataService.updateUser(user.uid, (u) => ({
        ...u,
        recentQuestionSessions: [...(u.recentQuestionSessions ?? []).slice(-2), ids],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boss.id]);

  const [hitCleared, setHitCleared] = React.useState(false);
  const [floatingDmg, setFloatingDmg] = React.useState<string | null>(null);
  const [bossRecoiling, setBossRecoiling] = React.useState(false);
  const [avatarFrame, setAvatarFrame] = React.useState<'idle' | 'measure' | 'celebrate'>('idle');
  const [battleWon, setBattleWon] = React.useState(initialBossHp <= 0.1);
  const [rewardInfo, setRewardInfo] = React.useState<{
    granted: boolean;
    outfitName: string;
    duplicateShard: boolean;
  } | null>(null);

  const isFinalHit = hitIndex === boss.hitLevels.length - 1;

  const swapVariantQuestion = () => {
    const cluster = boss.clusters[hitIndex % boss.clusters.length];
    const level = boss.hitLevels[hitIndex];
    const usedStems = new Set(deck.map((q) => q.stem_vi));
    let nextQ = generateVariantForBossHit(cluster, level);
    for (let i = 0; i < 8 && usedStems.has(nextQ.stem_vi); i++) {
      nextQ = generateVariantForBossHit(cluster, level);
    }
    setDeck((prev) => prev.map((q, idx) => (idx === hitIndex ? nextQ : q)));
    setHitCleared(false);
  };

  const handleComplete = (payload: QuestionSubmissionPayload) => {
    if (payload.usedHint || payload.clickedDontKnow || payload.switchedToPractice) {
      usedSupportRef.current = true;
    }

    const {user: updated} = dataService.recordAttempt({
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
    });
    if (updated) onUserUpdated(updated);

    if (payload.isCorrect) {
      const nextCompleted = Math.min(totalHits, Math.max(completedHits, hitIndex + 1));
      const prevHp = computeBossRemainingHp(boss.hitLevels, completedHits);
      const nextHp = computeBossRemainingHp(boss.hitLevels, nextCompleted);
      const exactDelta = Math.max(1, prevHp - nextHp);
      setCompletedHits(nextCompleted);
      setFloatingDmg(`-${exactDelta}% HP`);
      setBossRecoiling(true);
      setAvatarFrame('celebrate');
      setHitCleared(true);
      soundEngine.playBossHit();

      setTimeout(() => {
        setBossRecoiling(false);
        setFloatingDmg(null);
      }, 950);

      if (nextCompleted >= totalHits) {
        setBattleWon(true);
        soundEngine.playChestOpen();
        const outfit = OUTFITS.find((o) => o.id === boss.rewardOutfitId);
        const award = dataService.awardOnce(user.uid, `boss_defeat_${boss.id}`, {
          xp: 45,
          outfitId: boss.rewardOutfitId,
          heroCardId: boss.rewardHeroCardId,
          chestId: `CHEST01_BOSS_${boss.id}`,
        });
        const journeyRes = dataService.recordMocBossDefeat(user.uid, activeMocId, {
          usedSupport: usedSupportRef.current,
          bossId: boss.id,
        });
        if (journeyRes.user) onUserUpdated(journeyRes.user);
        if (journeyRes.newlyPassedMoc) {
          onMocPassed?.(activeMocId, journeyRes.newlyCompletedAll);
        }
        setRewardInfo({
          granted: award.granted,
          outfitName: outfit?.name ?? 'Trang phục anh hùng',
          duplicateShard: award.duplicateShardAdded,
        });
      }
    }
    // Note: wrong answer deals 0 damage and inflicts ZERO penalty on student!
  };

  const goNextHit = () => {
    const nextIdx = hitIndex + 1;
    if (nextIdx >= boss.hitLevels.length) return;
    setHitIndex(nextIdx);
    setHitCleared(false);
    setAvatarFrame('idle');
  };

  const handlePause = (draftAnswer: unknown, mode: QuestionMode) => {
    const updated = dataService.savePausedSession(user.uid, {
      kind: 'boss',
      stationId: station.id,
      mocId: activeMocId,
      bossId: boss.id,
      stepIndex: hitIndex,
      hitIndex,
      bossHp,
      savedAt: new Date().toISOString(),
      draftAnswer,
      mode,
    });
    if (updated) onUserUpdated(updated);
    onBackToMap();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold uppercase text-[#C8392B]">
            Đấu BOSS · Mốc {mocDef.id}: {mocDef.city} ({mocDef.sceneName})
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[#14284A]">{boss.name}</h1>
        </div>
        <button type="button" onClick={onBackToMap} className="btn-tactile btn-paper text-xs py-2 px-3">
          <ArrowLeft className="w-4 h-4" /> Về bản đồ
        </button>
      </div>

      {/* Arena Stage */}
      <div className="notebook-card p-3.5 sm:p-5 space-y-3.5 overflow-hidden">
        <BambooHpBar
          hpPercent={bossHp}
          totalHits={totalHits}
          completedHits={completedHits}
          bossName={boss.name}
        />

        <div className="relative rounded-2xl bg-gradient-to-b from-[#FFF4D6] via-[#F7F1D8] to-[#DCEBD5] border-2 border-[#D5B87E] p-3 sm:p-4 flex items-end justify-around gap-2 min-h-[196px] overflow-hidden">
          <DongSonWatermark
            size={210}
            opacity={0.13}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          />
          <CloudScroll width={84} className="absolute top-2 left-2 opacity-80" />
          <CloudScroll width={80} flip className="absolute top-3 right-2 opacity-80" />

          <div className="relative z-10 flex flex-col items-center max-w-[46%]">
            <Avatar
              appearance={user.avatar}
              view="side"
              frame={avatarFrame}
              size={134}
              className="max-w-full h-auto"
            />
            <span className="mt-1 px-2.5 py-0.5 rounded-lg bg-[#14284A] text-[#FFFBF0] text-xs font-bold truncate max-w-full">
              {user.displayName}
            </span>
          </div>

          <div className="relative z-10 flex flex-col items-center max-w-[50%]">
            {floatingDmg && (
              <span className="animate-float-damage absolute -top-6 font-display text-2xl font-extrabold text-[#C8392B] drop-shadow">
                {floatingDmg}
              </span>
            )}
            <BossSvg bossId={boss.id} recoiling={bossRecoiling} defeated={battleWon} size={152} />
            <span className="mt-1 px-2 py-0.5 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] text-[#14284A] text-[11px] sm:text-xs font-bold text-center leading-tight">
              {boss.subtitle}
            </span>
          </div>
        </div>

        <WaveDivider />

        <p className="text-xs text-[#4B5B73] text-center">
          Trả lời đúng đòn {hitIndex + 1}/{totalHits} sẽ giảm{' '}
          <strong className="text-[#99261B] tabular-nums">
            {Math.max(
              1,
              computeBossRemainingHp(boss.hitLevels, hitIndex) -
                computeBossRemainingHp(boss.hitLevels, hitIndex + 1),
            )}
            % HP
          </strong>{' '}
          (từ {computeBossRemainingHp(boss.hitLevels, hitIndex)}% → {computeBossRemainingHp(boss.hitLevels, hitIndex + 1)}%). Hoàn thành đủ {totalHits}/{totalHits} bước sẽ đưa HP BOSS về đúng 0%.
          {isFinalHit && ' (Đòn kết thúc chạy ở chế độ kiểm chứng không gợi ý.)'}
        </p>
      </div>

      {/* Victory or Active Hit Question */}
      {battleWon ? (
        <div className="notebook-card p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] flex items-center justify-center">
            <Crown className="w-9 h-9 text-[#8A5608]" />
          </div>
          <div className="flex justify-center">
            <RedSealStamp label="CHIẾN THẮNG BOSS" sublabel={boss.id} />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#14284A]">
            Em đã vượt qua {boss.name}!
          </h2>
          <p className="text-sm text-[#1B2A41] max-w-md mx-auto">
            {boss.flavorNote}
          </p>

          {rewardInfo && (
            <div className="max-w-md mx-auto p-4 rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] text-sm font-bold text-[#14284A] space-y-1.5">
              {rewardInfo.granted ? (
                <>
                  <p className="flex items-center justify-center gap-1.5 text-[#1F7A6B]">
                    <Gift className="w-4 h-4" /> Mở khóa Rương CHEST01 · +45 XP
                  </p>
                  <p className="flex items-center justify-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#B9831E]" />
                    Trang phục mới: {rewardInfo.outfitName}
                  </p>
                  <p className="text-xs font-normal text-[#5B6B82]">
                    (Trang phục cách điệu lấy cảm hứng lịch sử — đã thêm vào Túi đồ & Tủ nhân vật)
                  </p>
                </>
              ) : (
                <p>Em đã nhận thưởng lần đầu cho BOSS này trước đó. Lần đấu lại vẫn giúp củng cố kỹ năng Toán!</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button type="button" onClick={onBackToMap} className="btn-tactile btn-jade">
              Quay lại Bản đồ hành trình
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <QuestionCard
            question={currentQuestion}
            initialMode={isFinalHit ? 'verify' : 'practice'}
            helpAfterWrong={settings.helpAfterWrong}
            onComplete={handleComplete}
            onPause={handlePause}
            onRequestEasier={() => swapVariantQuestion()}
            onRebuttalSubmit={(data) =>
              dataService.submitRebuttal({
                userId: user.uid,
                studentCode: user.studentCode,
                displayName: user.displayName,
                ...data,
              })
            }
            actionLabel={`Tung đòn ${hitIndex + 1}/${boss.hitLevels.length}`}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={swapVariantQuestion}
              disabled={hitCleared}
              className="btn-tactile btn-paper text-xs py-2 px-3"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Đổi biến thể số liệu khác
            </button>

            {hitCleared && (
              <button type="button" onClick={goNextHit} className="btn-tactile btn-gold">
                Sang đòn tiếp theo ({hitIndex + 2}/{boss.hitLevels.length}) →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

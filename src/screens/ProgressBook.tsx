import React from 'react';
import {Award, BookOpen, CheckCircle2, Compass, TrendingUp} from 'lucide-react';
import {
  computeJourneyLevel,
  JOURNEY_LEVELS,
  SKILL_CLUSTER_LIST,
  SKILL_CLUSTERS,
} from '../config.ts';
import type {SkillState, UserAccount} from '../types.ts';

interface ProgressBookProps {
  user: UserAccount;
  onGoToPractice: () => void;
}

const STATE_STYLES: Record<SkillState, {bg: string; border: string; text: string}> = {
  'Chưa đủ dữ liệu': {bg: '#F4F1E8', border: '#CBB17D', text: '#5B6B82'},
  'Đang luyện': {bg: '#FFF4D6', border: '#E0A93B', text: '#8A5108'},
  'Làm được có hỗ trợ': {bg: '#E8F3FA', border: '#4FB0D0', text: '#1F3B63'},
  'Tự làm được': {bg: '#E6F6F3', border: '#2E9C8A', text: '#1F7A6B'},
  'Cần ôn lại': {bg: '#FFF5E2', border: '#D98A1F', text: '#8A5108'},
};

export const ProgressBook: React.FC<ProgressBookProps> = ({user, onGoToPractice}) => {
  const journey = computeJourneyLevel(user.xp, user.skills);
  const independentClusters = SKILL_CLUSTER_LIST.filter(
    (c) => user.skills[c]?.state === 'Tự làm được',
  );
  const practicingClusters = SKILL_CLUSTER_LIST.filter((c) => {
    const st = user.skills[c]?.state;
    return st === 'Đang luyện' || st === 'Làm được có hỗ trợ' || st === 'Cần ôn lại';
  });
  const nextSuggested =
    SKILL_CLUSTER_LIST.find((c) => user.skills[c]?.state === 'Cần ôn lại') ??
    SKILL_CLUSTER_LIST.find((c) => user.skills[c]?.state === 'Đang luyện') ??
    SKILL_CLUSTER_LIST.find((c) => user.skills[c]?.state === 'Chưa đủ dữ liệu') ??
    'SIN';

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">
      {/* Header */}
      <div className="notebook-card p-5 space-y-2">
        <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
          Sổ tiến độ kỹ năng Toán 10 · Chương III
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#14284A] flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-[#2E9C8A]" />
          Hồ sơ học tập của {user.displayName}
        </h1>
        <p className="text-xs text-[#5B6B82]">
          XP và trang phục ghi nhận nỗ lực hành trình, còn trạng thái "Tự làm được" chỉ ghi nhận khi em tự giải đúng ở chế độ kiểm chứng (không gợi ý) tại thời điểm gần nhất.
        </p>
      </div>

      {/* 3 Reflective Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="notebook-card p-4 space-y-1.5">
          <h2 className="font-display text-base font-extrabold text-[#1F7A6B] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Điều em vừa tự làm được
          </h2>
          <p className="text-sm text-[#1B2A41]">
            {independentClusters.length > 0
              ? independentClusters.map((c) => SKILL_CLUSTERS[c].shortTitle).join(', ')
              : 'Chưa có lượt kiểm chứng độc lập nào — hãy thử hoàn thành T01/T02 hoặc 1 phiên Kiểm chứng nhé.'}
          </p>
        </div>

        <div className="notebook-card p-4 space-y-1.5">
          <h2 className="font-display text-base font-extrabold text-[#8A5108] flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Điều đang luyện
          </h2>
          <p className="text-sm text-[#1B2A41]">
            {practicingClusters.length > 0
              ? practicingClusters.map((c) => SKILL_CLUSTERS[c].shortTitle).join(', ')
              : 'Em sẵn sàng bắt đầu từ cụm Nền tảng (NEN) hoặc Định lý Sin (BS01).'}
          </p>
        </div>

        <div className="notebook-card p-4 space-y-2">
          <h2 className="font-display text-base font-extrabold text-[#14284A] flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-[#2E9C8A]" />
            Bước tiếp theo gợi ý
          </h2>
          <p className="text-sm text-[#1B2A41]">
            Luyện cụm <strong>{SKILL_CLUSTERS[nextSuggested].title}</strong> ({nextSuggested}) với 5 câu ngẫu nhiên.
          </p>
          <button type="button" onClick={onGoToPractice} className="btn-tactile btn-jade text-xs py-2 w-full">
            Luyện ngay cụm {nextSuggested}
          </button>
        </div>
      </div>

      {/* 6 Skill Clusters Grid */}
      <div className="space-y-3">
        <h2 className="font-display text-xl font-extrabold text-[#14284A]">
          Trạng thái 6 cụm kỹ năng Chương III
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SKILL_CLUSTER_LIST.map((code) => {
            const meta = SKILL_CLUSTERS[code];
            const rec = user.skills[code];
            const style = STATE_STYLES[rec.state];
            return (
              <div key={code} className="notebook-card p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold text-[#5B6B82]">{code}</span>
                    <h3 className="font-display text-lg font-extrabold text-[#14284A] leading-tight">
                      {meta.title}
                    </h3>
                  </div>
                  <span
                    className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-extrabold border"
                    style={{
                      backgroundColor: style.bg,
                      borderColor: style.border,
                      color: style.text,
                    }}
                  >
                    {rec.state}
                  </span>
                </div>
                <p className="text-xs text-[#5B6B82]">{meta.description}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#1F3B63] pt-1 border-t border-[#E5D3A8] tabular-nums">
                  <span>Độc lập đúng: {rec.verifyCorrect}</span>
                  <span>Luyện tập đúng: {rec.practiceCorrect}</span>
                  <span>Tổng lượt: {rec.totalAttempts}</span>
                </div>
                {rec.recentNote && (
                  <p className="text-[11px] text-[#5B6B82]">Gần nhất: {rec.recentNote}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Journey Level Ladder (separate from skill mastery) */}
      <div className="notebook-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-extrabold text-[#14284A] flex items-center gap-2">
            <Award className="w-5 h-5 text-[#B9831E]" />
            Cấp hành trình hiện tại: Cấp {journey.level} — {journey.name}
          </h2>
          <span className="font-extrabold text-sm text-[#1F7A6B] tabular-nums">
            {user.xp} XP · {independentClusters.length}/6 cụm tự làm được
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {JOURNEY_LEVELS.map((lv) => {
            const reached = journey.level >= lv.level;
            return (
              <div
                key={lv.level}
                className={`p-3 rounded-xl border-2 text-xs ${
                  reached
                    ? 'bg-[#FFF4D6] border-[#E0A93B] text-[#14284A]'
                    : 'bg-white border-[#E5D3A8] text-[#5B6B82]'
                }`}
              >
                <p className="font-extrabold">
                  Cấp {lv.level}: {lv.name}
                </p>
                <p className="mt-0.5 tabular-nums">
                  Yêu cầu: ≥ {lv.minXp} XP & ≥ {lv.minIndependentClusters} cụm độc lập
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

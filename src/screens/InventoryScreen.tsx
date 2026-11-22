import React from 'react';
import {Backpack, Check, Compass, Lock, ScrollText, Shirt, Sparkles, Star} from 'lucide-react';
import {Avatar} from '../components/Avatar.tsx';
import {MathText} from '../components/MathText.tsx';
import {
  ACCESSORY_ITEMS,
  isAccessoryUnlocked,
  isOutfitUnlocked,
  LANDMARK_CARDS,
  OUTFITS,
  SKILL_CARDS,
  TOOL_ITEMS,
} from '../config.ts';
import {JOURNEY_MILESTONES, normalizeJourneyProgress} from '../journey.ts';
import type {AvatarAppearance, UserAccount} from '../types.ts';

interface InventoryScreenProps {
  user: UserAccount;
  onEquipOutfit: (outfitId: string) => void;
  onEquipAccessory?: (slot: 'headwear' | 'accessory' | 'cape' | 'badge', value: string) => void;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({
  user,
  onEquipOutfit,
  onEquipAccessory,
}) => {
  const [tab, setTab] = React.useState<'outfits' | 'accessories' | 'tools' | 'landmarks' | 'skills'>('outfits');
  const journey = normalizeJourneyProgress(user.journey);
  const reachedMocIds = new Set<number>([journey.currentMoc, ...journey.passedMoc]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">
      <div className="notebook-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#FFF4D6] border-2 border-[#D5B87E] flex items-center justify-center overflow-hidden shrink-0">
            <Avatar appearance={user.avatar} size={74} />
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase text-[#18685B]">Túi đồ & Bộ sưu tập</p>
            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#14284A] flex items-center gap-2">
              <Backpack className="w-5 h-5 text-[#8A5608] shrink-0" />
              Hành trang của {user.displayName}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="px-3 py-1.5 rounded-xl bg-[#FFF4D6] border border-[#E0A93B] text-[#14284A] tabular-nums">
            Mảnh nâng cấp: {user.inventory.upgradeShards}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-[#E6F6F3] border border-[#1D7A6A] text-[#145B4F] tabular-nums">
            Rương CHEST01 đã mở: {user.inventory.openedChests.length}
          </span>
        </div>
      </div>

      {/* Category tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          {id: 'outfits' as const, label: 'Trang phục', icon: Shirt},
          {id: 'accessories' as const, label: 'Phụ kiện', icon: Star},
          {id: 'tools' as const, label: 'Công cụ đo', icon: Compass},
          {id: 'landmarks' as const, label: 'Thẻ địa danh', icon: Sparkles},
          {id: 'skills' as const, label: 'Thẻ kiến thức', icon: ScrollText},
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`py-2.5 px-3 rounded-xl font-bold text-sm border-2 flex items-center justify-center gap-1.5 ${
                tab === t.id
                  ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                  : 'bg-[#FFFBF0] text-[#14284A] border-[#D5B87E]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'outfits' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {OUTFITS.map((outfit) => {
            const owned = isOutfitUnlocked(outfit, user);
            const equipped = owned && user.avatar.outfitId === outfit.id;
            return (
              <div key={outfit.id} className="notebook-card p-4 flex flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-extrabold text-[#14284A] flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border border-[#14284A]"
                        style={{backgroundColor: outfit.primaryA}}
                      />
                      {outfit.name}
                    </h2>
                    <p className="text-xs text-[#5B6B82] mt-1">{outfit.note}</p>
                  </div>
                  {!owned && <Lock className="w-4 h-4 text-[#8A5A3B] shrink-0" />}
                </div>
                <button
                  type="button"
                  disabled={!owned || equipped}
                  onClick={() => onEquipOutfit(outfit.id)}
                  className={`btn-tactile text-xs py-2 ${
                    equipped ? 'btn-jade' : owned ? 'btn-gold' : 'btn-paper'
                  }`}
                >
                  {equipped ? (
                    <>
                      <Check className="w-4 h-4" /> Đang mặc
                    </>
                  ) : owned ? (
                    'Mặc trang phục này'
                  ) : (
                    'Chưa mở khóa'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'accessories' && (
        <div className="space-y-3">
          <p className="text-xs text-[#5B6B82]">
            Phụ kiện mở khóa đều theo 6 Cấp hành trình (0 · 25 · 60 · 110 · 170 · 240 XP). Hiện em có{' '}
            <strong className="text-[#14284A] tabular-nums">{user.xp} XP</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACCESSORY_ITEMS.map((item) => {
              const unlocked = isAccessoryUnlocked(item, user);
              const equipped = unlocked && user.avatar[item.slot as keyof AvatarAppearance] === item.value;
              return (
                <div
                  key={item.id}
                  className={`notebook-card p-4 flex flex-col justify-between gap-2.5 ${unlocked ? '' : 'opacity-70'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-extrabold text-[#14284A]">{item.name}</h2>
                      <p className="text-xs text-[#5B6B82] mt-0.5">{item.note}</p>
                    </div>
                    {!unlocked && <Lock className="w-4 h-4 text-[#8A5A3B] shrink-0" />}
                  </div>
                  <button
                    type="button"
                    disabled={!unlocked || equipped || !onEquipAccessory}
                    onClick={() => onEquipAccessory?.(item.slot, item.value)}
                    className={`btn-tactile text-xs py-2 ${
                      equipped ? 'btn-jade' : unlocked ? 'btn-gold' : 'btn-paper'
                    }`}
                  >
                    {equipped ? (
                      <>
                        <Check className="w-4 h-4" /> Đang trang bị
                      </>
                    ) : unlocked ? (
                      'Trang bị ngay'
                    ) : (
                      `Cần ${item.xpRequired} XP`
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'tools' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOOL_ITEMS.map((tool) => {
            const owned = user.inventory.tools.includes(tool.id);
            return (
              <div
                key={tool.id}
                className={`notebook-card p-4 space-y-1.5 ${owned ? '' : 'opacity-65'}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-extrabold text-[#14284A]">{tool.name}</h2>
                  <span className="text-xs font-bold text-[#1F7A6B]">
                    {owned ? 'Đã sở hữu ✓' : 'Mở qua trạm'}
                  </span>
                </div>
                <p className="text-sm text-[#5B6B82]">{tool.desc}</p>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'landmarks' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LANDMARK_CARDS.map((lm) => {
            const owned = user.inventory.landmarkCards.includes(lm.id);
            return (
              <div key={lm.id} className={`notebook-card p-4 space-y-1.5 ${owned ? '' : 'opacity-65'}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-extrabold text-[#14284A]">{lm.title}</h2>
                  <span className="text-xs font-bold text-[#8A5A3B]">{lm.region}</span>
                </div>
                <p className="text-sm text-[#5B6B82]">{lm.note}</p>
                <p className="text-xs font-bold text-[#1F7A6B]">
                  {owned ? 'Đã sưu tầm ấn đỏ ✓' : 'Hoàn thành nhiệm vụ trạm để mở'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'skills' && (
        <div className="space-y-3">
          <p className="text-xs text-[#5B6B82]">
            Thẻ kiến thức &amp; phương pháp mở khóa khi em đặt chân tới cột mốc tương ứng (nhấn vào cột mốc trên Bản đồ để khám phá thêm).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SKILL_CARDS.map((card, idx) => {
              const linkedMoc = JOURNEY_MILESTONES.find((m) => m.skillCardId === card.id);
              const mocNum = linkedMoc?.id ?? idx + 1;
              const unlocked =
                reachedMocIds.has(mocNum) ||
                mocNum <= journey.currentMoc ||
                user.inventory.skillCards.includes(card.id);
              return (
                <div
                  key={card.id}
                  className={`notebook-card p-4 space-y-2 ${unlocked ? '' : 'opacity-65'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-lg font-extrabold text-[#14284A]">
                      {card.title}
                    </h2>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                        unlocked
                          ? 'bg-[#E6F6F3] text-[#1F7A6B]'
                          : 'bg-[#F1F5F9] text-[#64748B]'
                      }`}
                    >
                      {unlocked ? `Mốc ${mocNum} · Đã mở ✓` : `Mở ở Mốc ${mocNum}`}
                    </span>
                  </div>
                  {unlocked ? (
                    <div className="p-3 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3] text-center">
                      <MathText text={card.formula} />
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-dashed border-[#CBD5E1] text-center text-xs text-[#64748B] flex items-center justify-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Hoàn thành tới Mốc {mocNum} ({linkedMoc?.city ?? ''}) để mở thẻ tri thức này
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

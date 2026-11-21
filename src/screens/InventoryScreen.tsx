import React from 'react';
import {Backpack, Check, Compass, Lock, ScrollText, Shirt, Sparkles} from 'lucide-react';
import {Avatar} from '../components/Avatar.tsx';
import {MathText} from '../components/MathText.tsx';
import {LANDMARK_CARDS, OUTFITS, SKILL_CARDS, TOOL_ITEMS} from '../config.ts';
import type {UserAccount} from '../types.ts';

interface InventoryScreenProps {
  user: UserAccount;
  onEquipOutfit: (outfitId: string) => void;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({user, onEquipOutfit}) => {
  const [tab, setTab] = React.useState<'outfits' | 'tools' | 'landmarks' | 'skills'>('outfits');

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          {id: 'outfits' as const, label: 'Trang phục', icon: Shirt},
          {id: 'tools' as const, label: 'Công cụ đo', icon: Compass},
          {id: 'landmarks' as const, label: 'Thẻ địa danh', icon: Sparkles},
          {id: 'skills' as const, label: 'Thẻ công thức', icon: ScrollText},
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
            const owned = user.inventory.outfits.includes(outfit.id);
            const equipped = user.avatar.outfitId === outfit.id;
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SKILL_CARDS.map((card) => (
            <div key={card.id} className="notebook-card p-4 space-y-2">
              <h2 className="font-display text-lg font-extrabold text-[#14284A]">{card.title}</h2>
              <div className="p-3 rounded-xl bg-[#FFF4D6] border border-[#E2CFA3] text-center">
                <MathText text={card.formula} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import type {BossId} from '../types.ts';

interface BossSvgProps {
  bossId: BossId;
  recoiling?: boolean;
  defeated?: boolean;
  size?: number;
}

export const BossSvg: React.FC<BossSvgProps> = ({
  bossId,
  recoiling = false,
  defeated = false,
  size = 180,
}) => {
  const animClass = defeated
    ? 'opacity-45 scale-90 transition-all duration-500'
    : recoiling
      ? 'animate-hit-recoil'
      : 'animate-gentle-bob';

  return (
    <svg
      viewBox="0 0 220 200"
      width={size}
      height={Math.round((size * 200) / 220)}
      className={animClass}
      role="img"
      aria-label={`Linh vật thử thách ${bossId}`}
    >
      <ellipse cx="110" cy="184" rx="64" ry="12" fill="rgba(20,40,74,0.16)" />

      {bossId === 'B1' && (
        // Yêu Tinh Góc Khuất (friendly misty mountain spirit with protractor halo)
        <g>
          <path d="M52 108 A58 58 0 0 1 168 108" fill="none" stroke="#E0A93B" strokeWidth="6" strokeDasharray="6 4" />
          <path
            d="M58 158 Q46 100 72 64 Q110 34 148 64 Q174 100 162 158 Q138 144 122 162 Q110 144 98 162 Q82 144 58 158 Z"
            fill="#5C7FA8"
            stroke="#14284A"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <circle cx="88" cy="102" r="11" fill="#FFFBF0" stroke="#14284A" strokeWidth="3" />
          <circle cx="132" cy="102" r="11" fill="#FFFBF0" stroke="#14284A" strokeWidth="3" />
          <circle cx="90" cy="102" r="5" fill="#14284A" />
          <circle cx="130" cy="102" r="5" fill="#14284A" />
          <path d="M96 126 Q110 136 124 126" fill="none" stroke="#FFF4D6" strokeWidth="4" strokeLinecap="round" />
          <polygon points="110,22 96,48 124,48" fill="#E0A93B" stroke="#14284A" strokeWidth="3" />
        </g>
      )}

      {bossId === 'B2' && (
        // Hồ Ly Đường Vòng (folk-art lantern fox)
        <g>
          <path d="M148 148 Q198 134 190 88 Q174 102 156 126 Z" fill="#D98A1F" stroke="#14284A" strokeWidth="4" />
          <polygon points="68,78 56,34 94,58" fill="#D98A1F" stroke="#14284A" strokeWidth="4" strokeLinejoin="round" />
          <polygon points="152,78 164,34 126,58" fill="#D98A1F" stroke="#14284A" strokeWidth="4" strokeLinejoin="round" />
          <ellipse cx="110" cy="134" rx="46" ry="38" fill="#E0A93B" stroke="#14284A" strokeWidth="4" />
          <ellipse cx="110" cy="94" rx="46" ry="36" fill="#D98A1F" stroke="#14284A" strokeWidth="4" />
          <path d="M74 106 Q110 128 146 106 Q110 138 74 106 Z" fill="#FFFBF0" />
          <circle cx="92" cy="92" r="6" fill="#14284A" />
          <circle cx="128" cy="92" r="6" fill="#14284A" />
          <polygon points="110,104 104,98 116,98" fill="#14284A" />
          <rect x="44" y="118" width="18" height="26" rx="8" fill="#C8392B" stroke="#14284A" strokeWidth="3" />
          <line x1="53" y1="110" x2="53" y2="118" stroke="#14284A" strokeWidth="3" />
        </g>
      )}

      {bossId === 'B3' && (
        // Thuồng Luồng Vàm Cỏ (friendly Vietnamese river dragon-serpent)
        <g>
          <path d="M36 164 Q64 146 92 162 T148 162 T190 156" fill="none" stroke="#4FB0D0" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M52 152 Q62 84 104 72 Q152 62 162 118 Q166 156 124 160 Q82 164 52 152 Z"
            fill="#2E9C8A"
            stroke="#14284A"
            strokeWidth="4"
          />
          <path d="M84 58 L96 76 L112 52 L126 74 L142 56" fill="none" stroke="#E0A93B" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="110" cy="98" r="34" fill="#2E9C8A" stroke="#14284A" strokeWidth="4" />
          <circle cx="96" cy="94" r="9" fill="#FFFBF0" stroke="#14284A" strokeWidth="3" />
          <circle cx="126" cy="94" r="9" fill="#FFFBF0" stroke="#14284A" strokeWidth="3" />
          <circle cx="98" cy="94" r="4.5" fill="#14284A" />
          <circle cx="124" cy="94" r="4.5" fill="#14284A" />
          <path d="M96 112 Q111 122 126 112" fill="none" stroke="#FFF4D6" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M74 106 Q56 102 48 114" fill="none" stroke="#E0A93B" strokeWidth="4" strokeLinecap="round" />
          <path d="M146 106 Q164 102 172 114" fill="none" stroke="#E0A93B" strokeWidth="4" strokeLinecap="round" />
        </g>
      )}

      {bossId === 'B4' && (
        // Mộc Tinh Khu Vườn (ancient guardian tree spirit)
        <g>
          <circle cx="110" cy="68" r="48" fill="#5FAE5B" stroke="#14284A" strokeWidth="4" />
          <circle cx="72" cy="82" r="28" fill="#4B9647" stroke="#14284A" strokeWidth="4" />
          <circle cx="148" cy="82" r="28" fill="#4B9647" stroke="#14284A" strokeWidth="4" />
          <rect x="78" y="96" width="64" height="76" rx="22" fill="#8A5A3B" stroke="#14284A" strokeWidth="4" />
          <circle cx="96" cy="126" r="7" fill="#FFFBF0" stroke="#14284A" strokeWidth="3" />
          <circle cx="124" cy="126" r="7" fill="#FFFBF0" stroke="#14284A" strokeWidth="3" />
          <circle cx="96" cy="126" r="3" fill="#14284A" />
          <circle cx="124" cy="126" r="3" fill="#14284A" />
          <path d="M100 144 Q110 152 120 144" fill="none" stroke="#F7E7B8" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="98" cy="54" r="6" fill="#E0A93B" />
          <circle cx="128" cy="62" r="6" fill="#C8392B" />
        </g>
      )}

      {bossId === 'B5' && (
        // Rồng Tri Thức Thăng Long (golden imperial cloud dragon)
        <g>
          <circle cx="110" cy="96" r="62" fill="none" stroke="#E0A93B" strokeWidth="3" strokeDasharray="8 6" />
          <path
            d="M48 148 Q64 96 110 88 Q156 96 172 148 Q138 164 110 156 Q82 164 48 148 Z"
            fill="#C8392B"
            stroke="#14284A"
            strokeWidth="4"
          />
          <path d="M78 52 L92 70 L110 42 L128 70 L142 52" fill="#E0A93B" stroke="#14284A" strokeWidth="3.5" strokeLinejoin="round" />
          <ellipse cx="110" cy="96" rx="40" ry="34" fill="#E0A93B" stroke="#14284A" strokeWidth="4" />
          <circle cx="94" cy="92" r="8" fill="#FFFBF0" stroke="#14284A" strokeWidth="3" />
          <circle cx="126" cy="92" r="8" fill="#FFFBF0" stroke="#14284A" strokeWidth="3" />
          <circle cx="95" cy="92" r="4" fill="#14284A" />
          <circle cx="125" cy="92" r="4" fill="#14284A" />
          <path d="M96 110 Q110 120 124 110" fill="none" stroke="#14284A" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="110" cy="144" r="11" fill="#8FD3E6" stroke="#14284A" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
};

interface BambooHpBarProps {
  hpPercent: number;
  totalHits: number;
  completedHits: number;
  bossName: string;
}

export const BambooHpBar: React.FC<BambooHpBarProps> = ({
  hpPercent,
  totalHits,
  completedHits,
  bossName,
}) => {
  const clamped = Math.max(0, Math.min(100, hpPercent));

  return (
    <div className="w-full" data-testid="bamboo-hp-bar">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className="font-display font-extrabold text-[#14284A] text-base sm:text-lg leading-tight flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
            <path
              d="M4 18 C7 10 13 6 20 5 C18 12 13 17 4 18 Z"
              fill="#1D7A6A"
              stroke="#14284A"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M5 17 L16 8" stroke="#F7E7B8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {bossName}
        </span>
        <span className="tabular-nums font-extrabold text-xs sm:text-sm px-2.5 py-0.5 rounded-lg bg-[#FFF4D6] border border-[#D5B87E] text-[#99261B]">
          HP {Math.round(clamped)}% · Đòn {Math.min(completedHits, totalHits)}/{totalHits}
        </span>
      </div>

      {/* Thanh HP tre sơn mài (Lacquered Bamboo HP Bar) */}
      <div className="relative flex items-center">
        {/* Left brass cap */}
        <div
          className="w-3 h-9 rounded-l-lg border-2 border-[#3A1F12] shrink-0 z-10"
          style={{background: 'linear-gradient(180deg, #F4CA64 0%, #B9831E 60%, #7C5112 100%)'}}
          aria-hidden="true"
        />

        {/* Bamboo barrel track */}
        <div
          className="relative flex-1 h-8 -mx-0.5 bamboo-lacquer-track overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(clamped)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Thanh HP tre sơn mài của ${bossName}`}
        >
          {/* Vermilion lacquer HP fill */}
          <div
            className={`h-full transition-all duration-500 ease-out relative ${
              clamped > 40 ? 'bamboo-lacquer-fill' : 'bamboo-lacquer-fill-low'
            }`}
            style={{width: `${clamped}%`}}
          >
            {/* Top specular lacquer highlight */}
            <div className="absolute inset-x-0 top-1 h-1.5 bg-white/30 rounded-full mx-1" />
          </div>

          {/* Sculpted bamboo node rings (đốt tre) dividing each Boss hit */}
          <div className="absolute inset-0 flex pointer-events-none">
            {Array.from({length: totalHits}).map((_, idx) => (
              <div key={idx} className="flex-1 flex justify-end">
                {idx < totalHits - 1 && <div className="bamboo-node h-full" />}
              </div>
            ))}
          </div>
        </div>

        {/* Right brass cap */}
        <div
          className="w-3 h-9 rounded-r-lg border-2 border-[#3A1F12] shrink-0 z-10"
          style={{background: 'linear-gradient(180deg, #F4CA64 0%, #B9831E 60%, #7C5112 100%)'}}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

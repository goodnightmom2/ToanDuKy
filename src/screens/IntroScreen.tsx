import React from 'react';
import {Compass, Play} from 'lucide-react';
import {Avatar} from '../components/Avatar.tsx';
import {CloudScroll} from '../components/HeritageMotifs.tsx';
import {APP_NAME, DEFAULT_AVATAR, ORG_INFO} from '../config.ts';

interface IntroScreenProps {
  onStart: () => void;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({onStart}) => {
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStart]);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden flex flex-col justify-between paper-surface">
      {/* Atmospheric stylized Vàm Cỏ river valley & Đông Sơn parchment backdrop */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none fixed inset-0 w-full h-full opacity-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="skyWarm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFBF0" />
            <stop offset="55%" stopColor="#FFF2CE" />
            <stop offset="100%" stopColor="#F4DFAD" />
          </linearGradient>
          <linearGradient id="riverFlow" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stopColor="#8FD3E6" />
            <stop offset="50%" stopColor="#4FB0D0" />
            <stop offset="100%" stopColor="#2E9C8A" />
          </linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#skyWarm)" />

        {/* Subtle Đông Sơn bronze drum concentric watermark behind top crest */}
        <g transform="translate(720, 290)" opacity="0.14" stroke="#B9831E" fill="none">
          <circle r="270" strokeWidth="2" />
          <circle r="240" strokeWidth="1.5" strokeDasharray="8 8" />
          <circle r="195" strokeWidth="2" />
          <circle r="148" strokeWidth="1.5" strokeDasharray="4 10" />
          {Array.from({length: 16}).map((_, i) => {
            const ang = (i * Math.PI * 2) / 16;
            return (
              <line
                key={i}
                x1={Math.cos(ang) * 70}
                y1={Math.sin(ang) * 70}
                x2={Math.cos(ang) * 145}
                y2={Math.sin(ang) * 145}
                strokeWidth="2"
              />
            );
          })}
        </g>

        {/* Distant stylized mountains (Bà Đen silhouette) */}
        <path
          d="M0 640 Q220 510 420 590 Q620 430 860 560 Q1140 460 1440 600 L1440 900 L0 900 Z"
          fill="#DDE7D4"
        />
        <path
          d="M0 710 Q320 620 640 690 Q1020 610 1440 700 L1440 900 L0 900 Z"
          fill="#C9DFBD"
        />

        {/* Stylized Vàm Cỏ Đông river */}
        <path
          d="M-40 760 Q360 680 760 755 T1480 720 L1480 900 L-40 900 Z"
          fill="url(#riverFlow)"
          opacity="0.88"
        />
        <path
          d="M80 800 Q260 778 440 802 T860 800 T1320 792"
          fill="none"
          stroke="#FFFBF0"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />

        {/* Subtle geometric triangle survey sightlines on the valley */}
        <g stroke="#14284A" strokeWidth="2" strokeDasharray="6 6" opacity="0.35">
          <line x1="250" y1="815" x2="1120" y2="815" />
          <line x1="250" y1="815" x2="720" y2="630" />
          <line x1="1120" y1="815" x2="720" y2="630" />
        </g>
        <g fill="#14284A" opacity="0.55">
          <circle cx="250" cy="815" r="5" />
          <circle cx="1120" cy="815" r="5" />
          <circle cx="720" cy="630" r="5" />
        </g>
      </svg>

      {/* Main centered title lockup over calm parchment negative space */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-5 pt-8 pb-6 text-center max-w-3xl mx-auto">
        <div className="relative w-full flex items-center justify-center gap-2 sm:gap-5 mb-2">
          <CloudScroll width={96} className="hidden sm:block absolute -top-10 -left-14 opacity-75" />
          <CloudScroll width={92} flip className="hidden sm:block absolute -top-10 -right-14 opacity-75" />

          {/* Boy Explorer Chibi Mascot */}
          <div className="hidden sm:block animate-gentle-bob shrink-0">
            <Avatar appearance={DEFAULT_AVATAR} size={132} />
          </div>

          {/* Custom inline SVG Title Emblem */}
          <svg
            viewBox="0 0 460 150"
            className="w-full max-w-[340px] sm:max-w-[390px] h-auto"
            role="img"
            aria-label={APP_NAME}
          >
            {/* Protractor & compass crest */}
            <path
              d="M178 48 A52 52 0 0 1 282 48"
              fill="#FFF4D6"
              stroke="#14284A"
              strokeWidth="3.5"
            />
            <line x1="172" y1="48" x2="288" y2="48" stroke="#14284A" strokeWidth="3.5" strokeLinecap="round" />
            <polygon points="230,10 218,46 242,46" fill="#E0A93B" stroke="#14284A" strokeWidth="2.8" />
            <circle cx="230" cy="48" r="7" fill="#C8392B" stroke="#14284A" strokeWidth="2.5" />

            {/* Main wordmark */}
            <text
              x="230"
              y="108"
              textAnchor="middle"
              fontFamily="Baloo 2, sans-serif"
              fontSize="58"
              fontWeight="800"
              fill="#14284A"
              stroke="#FFFBF0"
              strokeWidth="6"
              paintOrder="stroke fill"
            >
              {APP_NAME}
            </text>
            <text
              x="230"
              y="138"
              textAnchor="middle"
              fontFamily="Noto Serif, serif"
              fontSize="16"
              fontStyle="italic"
              fontWeight="700"
              fill="#7C4E31"
            >
              Hệ thức lượng trong tam giác · Toán 10
            </text>
          </svg>

          {/* Girl Scholar Chibi Mascot */}
          <div className="hidden sm:block animate-gentle-bob shrink-0" style={{animationDelay: '0.6s'}}>
            <Avatar
              appearance={{
                ...DEFAULT_AVATAR,
                hairStyle: 'ponytail',
                outfitVariant: 'B',
                headwear: 'none',
              }}
              size={132}
            />
          </div>
        </div>

        {/* Compact mobile explorer duo above CTA */}
        <div className="flex sm:hidden items-end justify-center gap-3 mb-2">
          <Avatar appearance={DEFAULT_AVATAR} size={96} />
          <Avatar
            appearance={{
              ...DEFAULT_AVATAR,
              hairStyle: 'ponytail',
              outfitVariant: 'B',
              headwear: 'none',
            }}
            size={96}
          />
        </div>

        <p className="text-sm sm:text-lg text-[#14284A] max-w-lg leading-relaxed mb-6 font-medium">
          Khám phá 5 trạm địa danh Việt Nam, tự tay đo đạc bằng Toán học và vượt thử thách nhẹ nhàng — không phạt khi sai, luôn có gợi ý rõ từng bước.
        </p>

        {/* Primary CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="btn-tactile btn-jade w-full text-lg py-3.5 px-7"
          >
            <Play className="w-5 h-5 fill-current" />
            Bắt đầu hành trình
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs font-semibold text-[#4B5B73]">
          <span className="inline-flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-[#18685B]" />
            Nhấn Enter hoặc chạm để vào
          </span>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 px-4 py-3 text-center text-xs text-[#14284A]/85 bg-[#FFFBF0]/80 border-t border-[#D9C293] pb-safe">
        <p className="font-semibold">
          {ORG_INFO.chapterTitle}
        </p>
        <p className="text-[11px] text-[#5B6B82] mt-0.5">
          Số đo và bản đồ mang tính mô phỏng học tập.
        </p>
      </footer>
    </main>
  );
};

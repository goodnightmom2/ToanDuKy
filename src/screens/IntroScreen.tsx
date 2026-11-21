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
    <main className="relative min-h-dvh w-full overflow-hidden flex flex-col justify-between bg-[#146B8E]">
      {/* LAYER 0: Full-bleed illustrated Vietnam Map backdrop with ultra-gentle breathing motion */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <img
          src="/intro-bg.jpg"
          alt=""
          className="w-full h-full object-cover object-center animate-intro-breathe select-none"
          draggable={false}
        />

        {/* Subtle warm atmospheric tint so foreground stays balanced */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 48%, rgba(255, 250, 236, 0.14) 0%, rgba(12, 42, 68, 0.22) 100%)',
          }}
        />
      </div>

      {/* LAYER 1: Gentle rippling sea waves & sunlit ocean shimmer over East Sea & SW sea */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none fixed inset-0 w-full h-full mix-blend-screen"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="oceanSunGlint" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E6FBFF" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#8DE5F8" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#8DE5F8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sunlit ocean shimmer patches */}
        <g className="animate-sea-shimmer" style={{transformOrigin: '1040px 420px'}}>
          <ellipse cx="1040" cy="420" rx="185" ry="72" fill="url(#oceanSunGlint)" />
        </g>
        <g
          className="animate-sea-shimmer"
          style={{transformOrigin: '1120px 640px', animationDelay: '2.8s'}}
        >
          <ellipse cx="1120" cy="640" rx="160" ry="62" fill="url(#oceanSunGlint)" />
        </g>
        <g
          className="animate-sea-shimmer"
          style={{transformOrigin: '180px 700px', animationDelay: '1.6s'}}
        >
          <ellipse cx="180" cy="700" rx="145" ry="56" fill="url(#oceanSunGlint)" />
        </g>

        {/* Delicate animated ocean wave ripples — East Sea (right) */}
        <g
          fill="none"
          stroke="#ECFCFF"
          strokeLinecap="round"
          className="animate-sea-wave"
        >
          <path d="M880 340 Q912 332 944 340 T1008 340 T1072 340" strokeWidth="2.4" opacity="0.7" />
          <path d="M970 405 Q1002 397 1034 405 T1098 405 T1162 405" strokeWidth="2.2" opacity="0.62" />
          <path d="M930 515 Q965 506 1000 515 T1070 515 T1140 515" strokeWidth="2.5" opacity="0.68" />
          <path d="M1040 615 Q1075 607 1110 615 T1180 615 T1250 615" strokeWidth="2.2" opacity="0.58" />
          <path d="M895 720 Q930 711 965 720 T1035 720 T1105 720" strokeWidth="2.3" opacity="0.62" />
        </g>

        <g
          fill="none"
          stroke="#D7F7FF"
          strokeLinecap="round"
          className="animate-sea-wave-alt"
          style={{animationDelay: '1.8s'}}
        >
          <path d="M915 372 Q945 365 975 372 T1035 372" strokeWidth="1.8" opacity="0.58" />
          <path d="M1010 462 Q1042 454 1074 462 T1138 462" strokeWidth="2" opacity="0.62" />
          <path d="M960 568 Q994 560 1028 568 T1096 568" strokeWidth="1.9" opacity="0.56" />
          <path d="M1085 675 Q1118 667 1151 675 T1217 675" strokeWidth="2" opacity="0.55" />
          <path d="M950 785 Q985 777 1020 785 T1090 785" strokeWidth="2.1" opacity="0.58" />
        </g>

        {/* Delicate animated ocean wave ripples — Gulf of Thailand (bottom-left) */}
        <g
          fill="none"
          stroke="#ECFCFF"
          strokeLinecap="round"
          className="animate-sea-wave"
          style={{animationDelay: '1.1s'}}
        >
          <path d="M70 620 Q102 612 134 620 T198 620 T262 620" strokeWidth="2.3" opacity="0.65" />
          <path d="M110 688 Q144 680 178 688 T246 688 T314 688" strokeWidth="2.1" opacity="0.6" />
          <path d="M55 760 Q90 752 125 760 T195 760 T265 760" strokeWidth="2.4" opacity="0.64" />
        </g>
        <g
          fill="none"
          stroke="#D7F7FF"
          strokeLinecap="round"
          className="animate-sea-wave-alt"
          style={{animationDelay: '3.2s'}}
        >
          <path d="M140 652 Q172 645 204 652 T268 652" strokeWidth="1.8" opacity="0.54" />
          <path d="M90 726 Q124 719 158 726 T226 726" strokeWidth="1.9" opacity="0.52" />
          <path d="M165 815 Q200 807 235 815 T305 815" strokeWidth="2" opacity="0.55" />
        </g>
      </svg>

      {/* LAYER 2: Soft volumetric clouds drifting gently across sky edges */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        {/* Top-left drifting cloud bank */}
        <div
          className="absolute -top-12 -left-16 w-[46vw] max-w-[540px] h-44 rounded-full blur-2xl animate-cloud-drift-slow"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.28) 52%, rgba(255,255,255,0) 76%)',
          }}
        />
        {/* Mid-left wisp */}
        <div
          className="absolute top-[24%] -left-24 w-[38vw] max-w-[440px] h-36 rounded-full blur-2xl animate-cloud-drift-medium"
          style={{
            animationDelay: '4s',
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.22) 55%, rgba(255,255,255,0) 78%)',
          }}
        />
        {/* Top-right drifting cloud bank */}
        <div
          className="absolute -top-10 -right-20 w-[44vw] max-w-[520px] h-40 rounded-full blur-2xl animate-cloud-drift-reverse"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.24) 52%, rgba(255,255,255,0) 76%)',
          }}
        />
        {/* Mid-right sea mist cloud */}
        <div
          className="absolute top-[28%] -right-16 w-[34vw] max-w-[380px] h-32 rounded-full blur-2xl animate-cloud-drift-reverse"
          style={{
            animationDelay: '6.5s',
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.2) 52%, rgba(255,255,255,0) 78%)',
          }}
        />
        {/* Bottom-right soft cloud drift */}
        <div
          className="absolute bottom-8 -right-20 w-[40vw] max-w-[460px] h-36 rounded-full blur-2xl animate-cloud-drift-slow"
          style={{
            animationDelay: '9s',
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.22) 54%, rgba(255,255,255,0) 78%)',
          }}
        />
      </div>

      {/* Main centered title lockup over warm frosted parchment card so text pops crisply over the living map */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-5 pt-8 pb-6 text-center max-w-3xl mx-auto">
        <div className="relative w-full max-w-2xl rounded-3xl bg-[#FFFBF0]/82 backdrop-blur-md border-2 border-[#E6C785]/90 shadow-[0_14px_40px_rgba(12,32,58,0.32)] px-5 py-6 sm:px-8 sm:py-7 flex flex-col items-center">
          <div className="relative w-full flex items-center justify-center gap-2 sm:gap-5 mb-2">
            <CloudScroll width={88} className="hidden sm:block absolute -top-9 -left-8 opacity-80" />
            <CloudScroll width={84} flip className="hidden sm:block absolute -top-9 -right-8 opacity-80" />

            {/* Boy Explorer Chibi Mascot */}
            <div className="hidden sm:block animate-gentle-bob shrink-0">
              <Avatar appearance={DEFAULT_AVATAR} size={124} />
            </div>

            {/* Custom inline SVG Title Emblem */}
            <svg
              viewBox="0 0 460 150"
              className="w-full max-w-[320px] sm:max-w-[370px] h-auto"
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
                size={124}
              />
            </div>
          </div>

          {/* Compact mobile explorer duo above CTA */}
          <div className="flex sm:hidden items-end justify-center gap-3 mb-2">
            <Avatar appearance={DEFAULT_AVATAR} size={90} />
            <Avatar
              appearance={{
                ...DEFAULT_AVATAR,
                hairStyle: 'ponytail',
                outfitVariant: 'B',
                headwear: 'none',
              }}
              size={90}
            />
          </div>

          <p className="text-sm sm:text-base text-[#14284A] max-w-lg leading-relaxed mb-5 font-semibold">
            Khám phá 10 cột mốc địa danh Việt Nam, tự tay đo đạc bằng Toán học và vượt thử thách nhẹ nhàng — không phạt khi sai, luôn có gợi ý rõ từng bước.
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

          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-[#1F3B63]">
            <span className="inline-flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-[#18685B]" />
              Nhấn Enter hoặc chạm để vào
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 px-4 py-3 text-center text-xs text-[#14284A] bg-[#FFFBF0]/88 backdrop-blur-sm border-t border-[#D9C293] pb-safe">
        <p className="font-semibold">{ORG_INFO.chapterTitle}</p>
        <p className="text-[11px] text-[#4B5B73] mt-0.5">
          Số đo và bản đồ mang tính mô phỏng học tập.
        </p>
      </footer>
    </main>
  );
};

import React from 'react';
import {Compass, Play} from 'lucide-react';
import {Avatar} from '../components/Avatar.tsx';
import {APP_NAME, DEFAULT_AVATAR, ORG_INFO} from '../config.ts';

interface IntroScreenProps {
  onStart: () => void;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({onStart}) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    const vid = videoRef.current;
    if (vid) {
      vid.muted = true;
      void vid.play().catch(() => {
        // Fallback to poster if browser blocks autoplay
      });
    }
  }, []);

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
    <main className="relative min-h-dvh w-full overflow-hidden flex flex-col justify-between bg-[#0B2D48]">
      {/* LAYER 0: Full-bleed continuously looping background video with instant image poster fallback */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster="/intro-bg.jpg"
          className="w-full h-full object-cover object-center select-none"
        >
          <source src="/intro-bg.mp4" type="video/mp4" />
        </video>

        {/* Subtle cinematic edge vignette — keeps the bright Vietnam map & triangle vibrant */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 48%, rgba(6, 20, 38, 0.08) 0%, rgba(6, 20, 38, 0.34) 100%)',
          }}
        />
      </div>

      {/* Main centered title lockup over ultra-translucent glass frame so the animated map shines through */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-5 pt-8 pb-6 text-center max-w-3xl mx-auto">
        <div className="relative w-full max-w-2xl rounded-3xl bg-[#091D34]/36 backdrop-blur-[5px] border border-[#FFE6A3]/45 shadow-[0_14px_42px_rgba(4,15,30,0.45)] px-5 py-6 sm:px-8 sm:py-7 flex flex-col items-center">
          <div className="relative w-full flex items-center justify-center gap-2 sm:gap-5 mb-2">
            {/* Boy Explorer Chibi Mascot */}
            <div className="hidden sm:block animate-gentle-bob shrink-0 drop-shadow-[0_6px_12px_rgba(5,18,34,0.55)]">
              <Avatar appearance={DEFAULT_AVATAR} size={120} />
            </div>

            {/* Official App Logo Emblem */}
            <img
              src="/logo.png"
              alt={APP_NAME}
              className="w-52 sm:w-64 h-auto object-contain drop-shadow-[0_8px_18px_rgba(4,16,32,0.72)] select-none"
            />

            {/* Girl Scholar Chibi Mascot */}
            <div
              className="hidden sm:block animate-gentle-bob shrink-0 drop-shadow-[0_6px_12px_rgba(5,18,34,0.55)]"
              style={{animationDelay: '0.6s'}}
            >
              <Avatar
                appearance={{
                  ...DEFAULT_AVATAR,
                  hairStyle: 'ponytail',
                  outfitVariant: 'B',
                  headwear: 'none',
                }}
                size={120}
              />
            </div>
          </div>

          {/* Compact mobile explorer duo above CTA */}
          <div className="flex sm:hidden items-end justify-center gap-3 mb-2 drop-shadow-[0_4px_10px_rgba(5,18,34,0.55)]">
            <Avatar appearance={DEFAULT_AVATAR} size={88} />
            <Avatar
              appearance={{
                ...DEFAULT_AVATAR,
                hairStyle: 'ponytail',
                outfitVariant: 'B',
                headwear: 'none',
              }}
              size={88}
            />
          </div>

          <p className="text-sm sm:text-base text-[#F7FCFF] max-w-lg leading-relaxed mb-5 font-semibold drop-shadow-[0_1.5px_4px_rgba(4,16,32,0.95)]">
            Khám phá 10 cột mốc địa danh Việt Nam, tự tay đo đạc bằng Toán học và vượt thử thách nhẹ nhàng — không phạt khi sai, luôn có gợi ý rõ từng bước.
          </p>

          {/* Primary CTA — luminous warm amber-gold with deep ink text so it stands out sharply over green/blue map */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="btn-tactile w-full text-lg py-3.5 px-7 bg-gradient-to-b from-[#FAD04C] to-[#DF961C] hover:from-[#FFE072] hover:to-[#E8A328] text-[#0F2440] font-extrabold border-2 border-[#FFF3C4] shadow-[0_5px_0_#8C5208,0_10px_24px_rgba(6,20,38,0.5)] active:shadow-[0_2px_0_#8C5208]"
            >
              <Play className="w-5 h-5 fill-current" />
              Bắt đầu hành trình
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-[#EFF9FF] drop-shadow-[0_1px_3px_rgba(4,16,32,0.95)]">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#091D34]/45 border border-white/20">
              <Compass className="w-3.5 h-3.5 text-[#FAD04C]" />
              Nhấn Enter hoặc chạm để vào
            </span>
          </div>
        </div>
      </div>

      {/* Footer — translucent dark sapphire strip matching the glass intro theme */}
      <footer className="relative z-10 px-4 py-3 text-center text-xs text-[#F4FAFF] bg-[#091D34]/55 backdrop-blur-md border-t border-[#FFE6A3]/30 pb-safe">
        <p className="font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
          {ORG_INFO.chapterTitle}
        </p>
        <p className="text-[11px] text-[#CDE4F5] mt-0.5">
          Số đo và bản đồ mang tính mô phỏng học tập.
        </p>
      </footer>
    </main>
  );
};

import React from 'react';

interface MotifProps {
  className?: string;
}

/**
 * Họa tiết Trống đồng Đông Sơn (mặt trời 12 cánh + vòng tròn đồng tâm cách điệu)
 */
export const DongSonWatermark: React.FC<{className?: string; size?: number; opacity?: number}> = ({
  className = '',
  size = 240,
  opacity = 0.14,
}) => (
  <svg
    viewBox="0 0 240 240"
    width={size}
    height={size}
    className={`pointer-events-none select-none ${className}`}
    style={{opacity}}
    aria-hidden="true"
  >
    <g transform="translate(120,120)" stroke="#8A5608" fill="none">
      <circle r="112" strokeWidth="2.2" />
      <circle r="102" strokeWidth="1.4" strokeDasharray="5 5" />
      <circle r="86" strokeWidth="2" />
      <circle r="68" strokeWidth="1.4" strokeDasharray="3 7" />
      <circle r="48" strokeWidth="1.8" />
      <circle r="20" fill="#B9831E" fillOpacity="0.22" strokeWidth="2" />
      {Array.from({length: 12}).map((_, idx) => {
        const a = (idx * Math.PI * 2) / 12;
        const aLeft = a - 0.11;
        const aRight = a + 0.11;
        return (
          <path
            key={idx}
            d={`M ${Math.cos(aLeft) * 20} ${Math.sin(aLeft) * 20} L ${Math.cos(a) * 46} ${Math.sin(a) * 46} L ${Math.cos(aRight) * 20} ${Math.sin(aRight) * 20}`}
            fill="#B9831E"
            fillOpacity="0.2"
            strokeWidth="1.5"
          />
        );
      })}
      {Array.from({length: 16}).map((_, idx) => {
        const a = (idx * Math.PI * 2) / 16;
        return (
          <circle
            key={`dot-${idx}`}
            cx={Math.cos(a) * 94}
            cy={Math.sin(a) * 94}
            r="2.2"
            fill="#8A5608"
            stroke="none"
          />
        );
      })}
    </g>
  </svg>
);

/**
 * Họa tiết Sóng nước truyền thống Việt Nam (đường ngăn tinh tế giữa các vùng nội dung)
 */
export const WaveDivider: React.FC<MotifProps> = ({className = ''}) => (
  <svg
    viewBox="0 0 360 18"
    preserveAspectRatio="none"
    className={`w-full h-3.5 pointer-events-none select-none ${className}`}
    aria-hidden="true"
  >
    <path
      d="M0 11 Q15 3 30 11 T60 11 T90 11 T120 11 T150 11 T180 11 T210 11 T240 11 T270 11 T300 11 T330 11 T360 11"
      fill="none"
      stroke="#4FB0D0"
      strokeWidth="2.2"
      strokeLinecap="round"
      opacity="0.55"
    />
    <path
      d="M0 15 Q15 7 30 15 T60 15 T90 15 T120 15 T150 15 T180 15 T210 15 T240 15 T270 15 T300 15 T330 15 T360 15"
      fill="none"
      stroke="#1F7A6B"
      strokeWidth="1.4"
      strokeLinecap="round"
      opacity="0.32"
    />
  </svg>
);

/**
 * Họa tiết Mây cuộn truyền thống (dùng trang trí góc nền bản đồ, đấu trường BOSS, màn giới thiệu)
 */
export const CloudScroll: React.FC<{className?: string; flip?: boolean; width?: number}> = ({
  className = '',
  flip = false,
  width = 110,
}) => (
  <svg
    viewBox="0 0 120 44"
    width={width}
    height={Math.round((width * 44) / 120)}
    className={`pointer-events-none select-none ${className}`}
    style={flip ? {transform: 'scaleX(-1)'} : undefined}
    aria-hidden="true"
  >
    <path
      d="M12 32 C6 32 4 24 11 22 C13 14 24 12 31 17 C36 7 53 6 60 16 C68 11 81 15 83 24 C92 22 103 25 106 31 C111 31 114 34 112 36 L14 36 C11 36 10 34 12 32 Z"
      fill="#FFFBF0"
      fillOpacity="0.82"
      stroke="#C9A86A"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M28 28 C32 23 41 23 44 28 C46 31 43 33 40 31 M62 27 C67 22 76 23 78 28 C79 31 76 32 74 30"
      fill="none"
      stroke="#B9831E"
      strokeWidth="1.8"
      strokeLinecap="round"
      opacity="0.7"
    />
  </svg>
);

/**
 * Ấn đỏ truyền thống (dấu triện vuông bo góc viền kép màu son mài)
 */
export const RedSealStamp: React.FC<{label: string; sublabel?: string; className?: string}> = ({
  label,
  sublabel,
  className = '',
}) => (
  <div
    className={`red-stamp inline-flex flex-col items-center justify-center px-3 py-1.5 text-center leading-tight select-none ${className}`}
    role="status"
  >
    <span className="text-xs font-extrabold tracking-wider uppercase">{label}</span>
    {sublabel && <span className="text-[9px] font-bold tracking-widest opacity-90">{sublabel}</span>}
  </div>
);

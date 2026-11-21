import React from 'react';
import {MAP_VIEWBOX_HEIGHT, MAP_VIEWBOX_WIDTH} from '../journey.ts';

interface VietnamFallbackMapSvgProps {
  className?: string;
}

/**
 * Built-in high-craft stylized Vietnam map SVG (1024 x 572) used as automatic fallback
 * when no uploaded background image or /journey-map.jpg is available.
 * Explicitly displays Vietnam mainland, Trường Sơn ridge, Biển Đông, Phú Quốc, Côn Đảo,
 * Quần đảo Hoàng Sa (Việt Nam), and Quần đảo Trường Sa (Việt Nam).
 */
export const VietnamFallbackMapSvg: React.FC<VietnamFallbackMapSvgProps> = ({className}) => {
  return (
    <svg
      viewBox={`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`}
      className={className ?? 'w-full h-full block select-none'}
      role="img"
      aria-label="Bản đồ Việt Nam minh họa hành trình 10 mốc Toán Du Ký kèm Biển Đông, Quần đảo Hoàng Sa và Quần đảo Trường Sa"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="vnSeaGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6BD3DF" />
          <stop offset="45%" stopColor="#35A9C9" />
          <stop offset="100%" stopColor="#1B7FA8" />
        </linearGradient>
        <radialGradient id="vnSeaShallow" cx="54%" cy="54%" r="48%">
          <stop offset="0%" stopColor="#8DE5DF" stopOpacity="0.55" />
          <stop offset="65%" stopColor="#40B4CE" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#1B7FA8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vnLandMain" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#6BAE4B" />
          <stop offset="48%" stopColor="#7CC24F" />
          <stop offset="100%" stopColor="#589D3D" />
        </linearGradient>
        <linearGradient id="vnNeighborLand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8CC16B" />
          <stop offset="100%" stopColor="#649D4C" />
        </linearGradient>
        <linearGradient id="vnHighland" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4A8535" />
          <stop offset="100%" stopColor="#356827" />
        </linearGradient>
        <filter id="vnLandShadow" x="-8%" y="-8%" width="118%" height="118%">
          <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="#0F4663" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Biển Đông backdrop */}
      <rect width={MAP_VIEWBOX_WIDTH} height={MAP_VIEWBOX_HEIGHT} fill="url(#vnSeaGrad)" />
      <rect width={MAP_VIEWBOX_WIDTH} height={MAP_VIEWBOX_HEIGHT} fill="url(#vnSeaShallow)" />

      {/* Subtle sea wave lines */}
      <g stroke="#B8F0F8" strokeWidth="2" fill="none" opacity="0.32" strokeLinecap="round">
        <path d="M720 150 Q748 140 776 150 T832 150" />
        <path d="M760 225 Q790 215 820 225 T880 225" />
        <path d="M685 375 Q715 365 745 375 T805 375" />
        <path d="M745 450 Q775 440 805 450 T865 450" />
        <path d="M90 435 Q120 425 150 435 T210 435" />
      </g>

      {/* Surrounding regional landmass (stylized bright 3D terrain backdrop) */}
      <path
        d="M0 0 L680 0 Q645 65 595 92 L540 128 L520 180 L470 255 L465 360 L370 435 L250 470 L180 420 L95 365 L0 390 Z"
        fill="url(#vnNeighborLand)"
        opacity="0.88"
      />

      {/* Vietnam S-shaped mainland with elevated 3D relief */}
      <path
        d="M462 32
           Q510 18 572 34
           Q635 55 676 92
           Q695 112 666 136
           Q622 146 584 166
           Q552 184 536 218
           Q546 250 582 276
           Q632 308 656 346
           Q664 388 642 426
           Q608 452 554 468
           Q492 480 432 488
           Q376 502 328 524
           Q284 536 258 516
           Q248 492 278 468
           Q318 446 348 416
           Q364 378 394 344
           Q455 312 522 288
           Q536 258 504 226
           Q464 190 442 152
           Q412 110 426 66
           Q436 42 462 32 Z"
        fill="url(#vnLandMain)"
        stroke="#F6F2DA"
        strokeWidth="3.5"
        strokeLinejoin="round"
        filter="url(#vnLandShadow)"
      />

      {/* Dãy núi Trường Sơn stylized mountain ridge */}
      <g opacity="0.72">
        <path
          d="M464 176 Q492 214 528 248 Q562 282 586 322 Q594 360 572 394"
          fill="none"
          stroke="url(#vnHighland)"
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M472 182 L486 164 L498 184 M502 214 L516 196 L528 216 M532 248 L546 230 L558 250 M558 282 L572 264 L584 284 M574 322 L588 304 L600 324"
          fill="none"
          stroke="#2E5B23"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Stylized Rivers: Sông Hồng, Sông Hương, Sông Mê Kông */}
      <g fill="none" stroke="#53C3E0" strokeLinecap="round" opacity="0.82">
        {/* Sông Hồng */}
        <path d="M475 56 Q522 86 560 104 Q605 118 640 132" strokeWidth="4.5" />
        {/* Sông Mê Kông */}
        <path d="M276 238 Q352 292 384 366 Q396 426 374 474" strokeWidth="5.5" />
        <path d="M366 430 Q330 456 306 490" strokeWidth="4" />
        <path d="M376 440 Q406 462 426 486" strokeWidth="3.5" />
      </g>

      {/* Đảo Phú Quốc */}
      <g filter="url(#vnLandShadow)">
        <path
          d="M238 456 Q248 450 254 460 Q256 474 246 480 Q236 474 238 456 Z"
          fill="#68AE47"
          stroke="#F6F2DA"
          strokeWidth="2"
        />
      </g>
      <text
        x="212"
        y="476"
        textAnchor="end"
        fontFamily="'Be Vietnam Pro', sans-serif"
        fontSize="11.5"
        fontWeight="700"
        fill="#FFFFFF"
        stroke="#10496B"
        strokeWidth="2.6"
        paintOrder="stroke"
      >
        Đảo Phú Quốc
      </text>

      {/* Côn Đảo */}
      <g filter="url(#vnLandShadow)">
        <circle cx="424" cy="522" r="5" fill="#68AE47" stroke="#F6F2DA" strokeWidth="1.5" />
        <circle cx="433" cy="526" r="2.6" fill="#68AE47" stroke="#F6F2DA" strokeWidth="1" />
      </g>
      <text
        x="442"
        y="527"
        textAnchor="start"
        fontFamily="'Be Vietnam Pro', sans-serif"
        fontSize="11"
        fontWeight="700"
        fill="#FFFFFF"
        stroke="#10496B"
        strokeWidth="2.4"
        paintOrder="stroke"
      >
        Côn Đảo
      </text>

      {/* Quần đảo Hoàng Sa (Việt Nam) */}
      <g filter="url(#vnLandShadow)">
        <ellipse cx="835" cy="272" rx="14" ry="7" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.8" />
        <ellipse cx="868" cy="264" rx="10" ry="5" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.5" />
        <circle cx="888" cy="279" r="5.5" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.5" />
        <circle cx="822" cy="286" r="4" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.3" />
        <circle cx="858" cy="288" r="4.5" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.3" />
      </g>
      <text
        x="854"
        y="312"
        textAnchor="middle"
        fontFamily="'Baloo 2', 'Be Vietnam Pro', sans-serif"
        fontSize="14"
        fontWeight="800"
        fill="#FFFFFF"
        stroke="#0F4663"
        strokeWidth="3.2"
        paintOrder="stroke"
      >
        Quần đảo Hoàng Sa
      </text>
      <text
        x="854"
        y="327"
        textAnchor="middle"
        fontFamily="'Be Vietnam Pro', sans-serif"
        fontSize="11"
        fontWeight="700"
        fill="#FFF4D6"
        stroke="#0F4663"
        strokeWidth="2.4"
        paintOrder="stroke"
      >
        (Việt Nam)
      </text>

      {/* Quần đảo Trường Sa (Việt Nam) */}
      <g filter="url(#vnLandShadow)">
        <ellipse cx="882" cy="458" rx="12" ry="6" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.6" />
        <ellipse cx="905" cy="472" rx="10" ry="5" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.5" />
        <circle cx="860" cy="474" r="5" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.4" />
        <circle cx="892" cy="488" r="4.5" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.3" />
        <circle cx="870" cy="492" r="4" fill="#6BB14A" stroke="#F6F2DA" strokeWidth="1.3" />
      </g>
      <text
        x="878"
        y="514"
        textAnchor="middle"
        fontFamily="'Baloo 2', 'Be Vietnam Pro', sans-serif"
        fontSize="14"
        fontWeight="800"
        fill="#FFFFFF"
        stroke="#0F4663"
        strokeWidth="3.2"
        paintOrder="stroke"
      >
        Quần đảo Trường Sa
      </text>
      <text
        x="878"
        y="529"
        textAnchor="middle"
        fontFamily="'Be Vietnam Pro', sans-serif"
        fontSize="11"
        fontWeight="700"
        fill="#FFF4D6"
        stroke="#0F4663"
        strokeWidth="2.4"
        paintOrder="stroke"
      >
        (Việt Nam)
      </text>

      {/* Biển Đông & Dãy núi Trường Sơn labels */}
      <text
        x="808"
        y="374"
        textAnchor="middle"
        fontFamily="'Noto Serif', Georgia, serif"
        fontStyle="italic"
        fontSize="24"
        fontWeight="700"
        fill="#E9FAFF"
        stroke="#0D4B6E"
        strokeWidth="3.6"
        paintOrder="stroke"
      >
        Biển Đông
      </text>
      <text
        x="492"
        y="222"
        textAnchor="middle"
        transform="rotate(42 492 222)"
        fontFamily="'Baloo 2', 'Be Vietnam Pro', sans-serif"
        fontSize="14"
        fontWeight="800"
        fill="#FFFBF0"
        stroke="#274E1E"
        strokeWidth="3"
        paintOrder="stroke"
      >
        Dãy núi Trường Sơn
      </text>

      {/* Soft stylized clouds at corners */}
      <g fill="#FFFFFF" opacity="0.72">
        <ellipse cx="940" cy="44" rx="95" ry="34" />
        <ellipse cx="990" cy="90" rx="75" ry="30" />
        <ellipse cx="972" cy="535" rx="88" ry="38" />
        <ellipse cx="40" cy="240" rx="68" ry="30" opacity="0.6" />
        <ellipse cx="32" cy="542" rx="84" ry="34" opacity="0.55" />
      </g>
    </svg>
  );
};

import React from 'react';
import {OUTFITS} from '../config.ts';
import type {AvatarAppearance, AvatarFrame, AvatarView} from '../types.ts';

interface AvatarProps {
  appearance: AvatarAppearance;
  view?: AvatarView;
  frame?: AvatarFrame;
  size?: number;
  className?: string;
}

const INK = '#1E242B';

function getOutfitPalette(outfitId: string, variant: 'A' | 'B') {
  const found = OUTFITS.find((o) => o.id === outfitId) ?? OUTFITS[0];
  return {
    id: found.id,
    primary: variant === 'A' ? found.primaryA : found.primaryB,
    accent: variant === 'A' ? found.accentA : found.accentB,
    isHero: found.unlockType === 'boss',
    isDefaultExplorer: found.id === 'hoc_vien',
  };
}

/**
 * Checkered black-and-white Khăn rằn Nam Bộ pattern for SVG defs
 */
function buildKhanRanDefs(uid: string): string {
  return `
    <defs>
      <pattern id="kr-${uid}" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#F8F9FA" />
        <rect width="4" height="4" fill="#232830" />
        <rect x="4" y="4" width="4" height="4" fill="#232830" />
        <line x1="0" y1="4" x2="8" y2="4" stroke="#68727E" stroke-width="0.6" />
        <line x1="4" y1="0" x2="4" y2="8" stroke="#68727E" stroke-width="0.6" />
      </pattern>
      <linearGradient id="skinShade-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#B86B43" stop-opacity="0.08" />
      </linearGradient>
    </defs>
  `;
}

/**
 * Helper: 5-pointed golden star polygon centered at (cx, cy)
 */
function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

/**
 * Generates clean inner SVG markup for the layered Chibi Avatar (viewBox 0 0 220 300).
 * Faithfully matches the Toán Du Ký character design (Boy Explorer Variant A & Girl Scholar Variant B)
 * while keeping every layer modular: skin, hair, eyes, brows, mouth, outfit, variant, headwear, accessory, cape, badge.
 * Used by both <Avatar /> React component, AdventureMap SVG, and renderAvatarToCanvas().
 */
export function buildAvatarSvgMarkup(
  appearance: AvatarAppearance,
  view: AvatarView = 'front',
  frame: AvatarFrame = 'idle',
  patternUid = 'tdk',
): string {
  const palette = getOutfitPalette(appearance.outfitId, appearance.outfitVariant);
  const isGirlVariant = appearance.outfitVariant === 'B';
  const skin = appearance.skinTone || '#FFD0A8';
  const hair = appearance.hairColor || '#22262D';

  const bobY = frame === 'walk1' ? -5 : frame === 'walk2' ? -2 : frame === 'celebrate' ? -7 : 0;
  const leftLegY = frame === 'walk1' ? -6 : frame === 'walk2' ? 4 : 0;
  const rightLegY = frame === 'walk1' ? 4 : frame === 'walk2' ? -6 : 0;

  const isBack = view === 'back';
  const isSide = view === 'side';
  const headShiftX = isSide ? 4 : 0;

  const defs = buildKhanRanDefs(patternUid);

  // Layer 1: Soft ground shadow
  const layerShadow = `<ellipse cx="110" cy="287" rx="52" ry="9.5" fill="rgba(26,56,64,0.18)" />`;

  // Layer 2: Back Cape (if chosen)
  let layerCape = '';
  if (appearance.cape === 'khan_choang_ngoc') {
    layerCape = `<g transform="translate(0,${bobY})">
      <path d="M72 162 Q48 214 58 256 L162 256 Q172 214 148 162 Z" fill="#249488" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
      <path d="M64 246 Q110 256 156 246" fill="none" stroke="#F7D147" stroke-width="3" stroke-linecap="round" />
    </g>`;
  } else if (appearance.cape === 'ao_choang_vang') {
    layerCape = `<g transform="translate(0,${bobY})">
      <path d="M68 160 Q44 216 56 260 L164 260 Q176 216 152 160 Z" fill="#E6AE3A" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
      <path d="M62 250 Q110 260 158 250" fill="none" stroke="#C8392B" stroke-width="3" stroke-linecap="round" />
    </g>`;
  }

  // Layer 3: Explorer Backpack (behind torso in front/side view, centered on top in back view)
  const buildMiniNonLa = (x: number, y: number, rot: number) => `
    <g transform="translate(${x},${y}) rotate(${rot})">
      <path d="M-21 12 L0 -15 L21 12 Q0 18 -21 12 Z" fill="#EFE0B0" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" />
      <path d="M-15 8 Q0 13 15 8" fill="none" stroke="#B79856" stroke-width="1.5" />
      <path d="M-9 -1 Q0 3 9 -1" fill="none" stroke="#B79856" stroke-width="1.4" />
      <circle cx="-8" cy="7" r="2.8" fill="#E9594D" />
      <path d="M5 -3 L11 -3 M8 -6 L8 0" stroke="#368E58" stroke-width="2" stroke-linecap="round" />
    </g>
  `;

  const buildBackpackMarkup = (forBackView: boolean) => {
    if (isGirlVariant) {
      // Coral-pink school backpack with yellow front pocket, mini nón lá, ruler & pencil
      if (forBackView) {
        return `<g transform="translate(0,${bobY})">
          <!-- Ruler & pencil sticking out top-right -->
          <g transform="translate(142,158) rotate(22)">
            <rect x="-4" y="-22" width="10" height="32" rx="1.5" fill="#F4C451" stroke="${INK}" stroke-width="2.2" />
            <line x1="-4" y1="-15" x2="0" y2="-15" stroke="${INK}" stroke-width="1.4" />
            <line x1="-4" y1="-9" x2="1" y2="-9" stroke="${INK}" stroke-width="1.4" />
            <line x1="-4" y1="-3" x2="0" y2="-3" stroke="${INK}" stroke-width="1.4" />
          </g>
          <rect x="74" y="160" width="72" height="66" rx="18" fill="#EB6B96" stroke="${INK}" stroke-width="2.8" />
          <path d="M84 166 Q110 156 136 166" fill="none" stroke="#C54976" stroke-width="2.4" />
          <rect x="85" y="191" width="50" height="26" rx="9" fill="#F7D44C" stroke="${INK}" stroke-width="2.4" />
          <line x1="88" y1="199" x2="132" y2="199" stroke="${INK}" stroke-width="2" />
          ${buildMiniNonLa(146, 174, 24)}
        </g>`;
      }
      // Visible peeking behind right shoulder in front view, and cleanly mirrored behind left back in side view
      if (isSide) {
        return `<g transform="translate(0,${bobY})">
          <!-- Ruler sticking out behind shoulder -->
          <g transform="translate(52,182) rotate(-26)">
            <rect x="-4" y="-14" width="9" height="30" rx="1.5" fill="#F4C451" stroke="${INK}" stroke-width="2.2" />
            <line x1="-4" y1="-8" x2="0" y2="-8" stroke="${INK}" stroke-width="1.3" />
            <line x1="-4" y1="-2" x2="1" y2="-2" stroke="${INK}" stroke-width="1.3" />
          </g>
          <!-- Pink backpack tucked cleanly behind left back -->
          <path d="M84 158 Q56 160 52 184 L52 214 Q54 228 76 228 L86 224 Z" fill="#EB6B96" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
          <rect x="48" y="196" width="22" height="22" rx="7" fill="#F7D44C" stroke="${INK}" stroke-width="2.4" />
          ${buildMiniNonLa(58, 166, -24)}
        </g>`;
      }
      return `<g transform="translate(0,${bobY})">
        <!-- Ruler sticking out -->
        <g transform="translate(166,184) rotate(26)">
          <rect x="-4" y="-14" width="9" height="30" rx="1.5" fill="#F4C451" stroke="${INK}" stroke-width="2.2" />
          <line x1="-4" y1="-8" x2="0" y2="-8" stroke="${INK}" stroke-width="1.3" />
          <line x1="-4" y1="-2" x2="1" y2="-2" stroke="${INK}" stroke-width="1.3" />
          <line x1="-4" y1="4" x2="0" y2="4" stroke="${INK}" stroke-width="1.3" />
        </g>
        <!-- Pink backpack body peeking on right -->
        <path d="M132 158 Q162 158 166 184 L168 214 Q166 228 144 228 L132 224 Z" fill="#EB6B96" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
        <rect x="148" y="196" width="22" height="22" rx="7" fill="#F7D44C" stroke="${INK}" stroke-width="2.4" />
        <circle cx="152" cy="182" r="6" fill="#5BC5E0" stroke="${INK}" stroke-width="2" />
        ${buildMiniNonLa(158, 162, 24)}
      </g>`;
    }

    // Boy Explorer: Olive hiking backpack with rolled teal sleeping mat, mini nón lá & blue water bottle
    if (forBackView) {
      return `<g transform="translate(0,${bobY})">
        <!-- Rolled teal sleeping mat on top -->
        <rect x="68" y="146" width="84" height="22" rx="11" fill="#3B8493" stroke="${INK}" stroke-width="2.8" />
        <ellipse cx="76" cy="157" rx="5.5" ry="9" fill="#5CA8B6" stroke="${INK}" stroke-width="2.2" />
        <path d="M90 146 L90 168 M130 146 L130 168" stroke="${INK}" stroke-width="2.4" />
        <!-- Olive pack body -->
        <rect x="72" y="162" width="76" height="68" rx="16" fill="#7D8054" stroke="${INK}" stroke-width="2.8" />
        <rect x="82" y="192" width="56" height="28" rx="8" fill="#9A9B6B" stroke="${INK}" stroke-width="2.4" />
        <!-- Water bottle in left pocket -->
        <rect x="58" y="192" width="16" height="28" rx="6" fill="#7CC2E2" stroke="${INK}" stroke-width="2.4" />
        <rect x="62" y="187" width="8" height="6" rx="2" fill="#2E7D8B" stroke="${INK}" stroke-width="2" />
        ${buildMiniNonLa(68, 174, -26)}
      </g>`;
    }

    // Peeking neatly on left shoulder/hip (matches reference!)
    const shiftSide = isSide ? 'translate(8, 2)' : '';
    return `<g transform="translate(0,${bobY}) ${shiftSide}">
      <!-- Rolled teal sleeping mat behind shoulders -->
      <rect x="52" y="146" width="114" height="20" rx="10" fill="#3B8493" stroke="${INK}" stroke-width="2.8" />
      <ellipse cx="60" cy="156" rx="5" ry="8" fill="#5CA8B6" stroke="${INK}" stroke-width="2.2" />
      <!-- Olive backpack side -->
      <path d="M52 162 Q48 196 54 224 Q62 232 82 228 L86 164 Z" fill="#7D8054" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
      <!-- Blue water bottle in mesh pocket -->
      <rect x="44" y="194" width="17" height="26" rx="6" fill="#82C9E8" stroke="${INK}" stroke-width="2.4" />
      <rect x="48" y="189" width="9" height="6" rx="2" fill="#2C6E85" stroke="${INK}" stroke-width="2" />
      <path d="M44 206 L61 206 L60 220 Q52 224 45 220 Z" fill="#6F744B" stroke="${INK}" stroke-width="2.2" />
      <!-- Mini nón lá hanging on left pack -->
      ${buildMiniNonLa(54, 170, -28)}
    </g>`;
  };

  const layerBackpackBehind = !isBack ? buildBackpackMarkup(false) : '';

  // Layer 4: Back Hair Silhouette (twin pigtails for braid/ponytail, bob, bun)
  let layerBackHair = '';
  if (appearance.hairStyle === 'ponytail' || appearance.hairStyle === 'braid') {
    // Twin low pigtails matching Girl Scholar reference!
    layerBackHair = `<g transform="translate(${headShiftX},${bobY})">
      ${
        !isSide
          ? `<path d="M62 118 Q40 124 38 144 Q48 146 56 142 Q64 136 68 128 Z" fill="${hair}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
             <path d="M44 138 Q48 145 55 142" fill="none" stroke="#39404A" stroke-width="1.6" stroke-linecap="round" />
             <circle cx="62" cy="122" r="4.5" fill="#E9594D" stroke="${INK}" stroke-width="2" />`
          : `<path d="M66 118 Q42 126 42 148 Q56 148 68 134 Z" fill="${hair}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
             <circle cx="66" cy="122" r="4.5" fill="#E9594D" stroke="${INK}" stroke-width="2" />`
      }
      ${
        !isSide
          ? `<path d="M158 118 Q180 124 182 144 Q172 146 164 142 Q156 136 152 128 Z" fill="${hair}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
             <circle cx="158" cy="122" r="4.5" fill="#E9594D" stroke="${INK}" stroke-width="2" />`
          : ''
      }
      ${
        appearance.hairStyle === 'braid' && !isSide
          ? `<circle cx="46" cy="148" r="6" fill="${hair}" stroke="${INK}" stroke-width="2.4" />
             <circle cx="174" cy="148" r="6" fill="${hair}" stroke="${INK}" stroke-width="2.4" />`
          : ''
      }
    </g>`;
  } else if (appearance.hairStyle === 'bob') {
    layerBackHair = `<g transform="translate(${headShiftX},${bobY})">
      <path d="M56 96 Q48 144 68 156 L152 156 Q172 144 164 96 Z" fill="${hair}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
    </g>`;
  } else if (appearance.hairStyle === 'bun') {
    layerBackHair = `<g transform="translate(${headShiftX},${bobY})">
      <circle cx="110" cy="40" r="19" fill="${hair}" stroke="${INK}" stroke-width="2.8" />
      <path d="M94 52 Q110 44 126 52" fill="none" stroke="#E9594D" stroke-width="4" stroke-linecap="round" />
    </g>`;
  }

  // Layer 5: Legs, Socks & Footwear
  const bootColor = isGirlVariant ? '#238CA5' : '#8C5B38';
  const bootTrim = isGirlVariant ? '#FFFFFF' : '#6D4327';
  const soleColor = isGirlVariant ? '#F8F9FA' : '#503421';

  const layerLegs = `
    <g transform="translate(0,${bobY})">
      <!-- Left leg -->
      <g transform="translate(0,${leftLegY})">
        <rect x="85" y="226" width="16" height="36" rx="6" fill="${skin}" stroke="${INK}" stroke-width="2.6" />
        <!-- White crew sock -->
        <rect x="85" y="250" width="16" height="16" rx="3" fill="#FBFBF8" stroke="${INK}" stroke-width="2.4" />
        <line x1="86" y1="255" x2="100" y2="255" stroke="${isGirlVariant ? '#238CA5' : '#C8B89A'}" stroke-width="1.6" />
        <!-- Shoe / Boot -->
        <path d="M74 275 Q74 263 87 262 L103 262 Q106 274 103 280 Q88 283 75 280 Q73 278 74 275 Z" fill="${bootColor}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
        <path d="M74 277 Q88 282 103 278 L103 282 Q88 286 74 281 Z" fill="${soleColor}" stroke="${INK}" stroke-width="2.2" />
        <!-- Laces -->
        <line x1="84" y1="266" x2="93" y2="266" stroke="${bootTrim}" stroke-width="2" stroke-linecap="round" />
        <line x1="82" y1="270" x2="92" y2="270" stroke="${bootTrim}" stroke-width="2" stroke-linecap="round" />
      </g>
      <!-- Right leg -->
      <g transform="translate(0,${rightLegY})">
        <rect x="119" y="226" width="16" height="36" rx="6" fill="${skin}" stroke="${INK}" stroke-width="2.6" />
        <!-- White crew sock -->
        <rect x="119" y="250" width="16" height="16" rx="3" fill="#FBFBF8" stroke="${INK}" stroke-width="2.4" />
        <line x1="120" y1="255" x2="134" y2="255" stroke="${isGirlVariant ? '#238CA5' : '#C8B89A'}" stroke-width="1.6" />
        <!-- Shoe / Boot -->
        <path d="M117 262 L133 262 Q146 263 146 275 Q147 278 145 280 Q132 283 117 280 Q114 274 117 262 Z" fill="${bootColor}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
        <path d="M117 278 Q132 282 146 277 L146 281 Q132 286 117 282 Z" fill="${soleColor}" stroke="${INK}" stroke-width="2.2" />
        <!-- Laces -->
        <line x1="127" y1="266" x2="136" y2="266" stroke="${bootTrim}" stroke-width="2" stroke-linecap="round" />
        <line x1="128" y1="270" x2="138" y2="270" stroke="${bootTrim}" stroke-width="2" stroke-linecap="round" />
      </g>
    </g>
  `;

  // Layer 6: Shorts / Pleated Skirt
  const layerLowerWear = isGirlVariant
    ? `
      <!-- Dark slate-grey pleated skirt (Girl Scholar) -->
      <g transform="translate(0,${bobY})">
        <path d="M80 212 L140 212 L147 242 Q110 248 73 242 Z" fill="#525B66" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
        <line x1="94" y1="215" x2="90" y2="243" stroke="${INK}" stroke-width="2.2" />
        <line x1="110" y1="215" x2="110" y2="244" stroke="${INK}" stroke-width="2.2" />
        <line x1="126" y1="215" x2="130" y2="243" stroke="${INK}" stroke-width="2.2" />
      </g>
    `
    : `
      <!-- Olive-brown cargo shorts (Boy Explorer) -->
      <g transform="translate(0,${bobY})">
        <path d="M78 210 L142 210 L146 245 L114 245 L110 232 L106 245 L74 245 Z" fill="#8D845E" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
        <!-- Cargo side pockets -->
        <rect x="76" y="220" width="11" height="14" rx="2.5" fill="#7D7552" stroke="${INK}" stroke-width="2" />
        <rect x="133" y="220" width="11" height="14" rx="2.5" fill="#7D7552" stroke="${INK}" stroke-width="2" />
        <!-- Belt -->
        <rect x="78" y="208" width="64" height="7" rx="2" fill="#63583B" stroke="${INK}" stroke-width="2.2" />
        <rect x="105" y="207" width="10" height="9" rx="2" fill="#E0A93B" stroke="${INK}" stroke-width="2" />
      </g>
    `;

  // Layer 7: Torso, Arms & Outfit Details
  let layerOutfit = '';
  const showWavingRightArm = !isGirlVariant && !isBack && frame !== 'measure';
  const armWaveTilt = frame === 'celebrate' ? -12 : frame === 'walk1' ? 6 : frame === 'walk2' ? -6 : 0;

  if (palette.isDefaultExplorer && !isGirlVariant) {
    // BOY EXPLORER (Default Variant A): Red star tee + olive utility multi-pocket vest + checkered khăn rằn + waving hand + survey map!
    const mapProp =
      appearance.accessory === 'so_tay' && !isBack
        ? `
          <g transform="translate(45,232) rotate(-14)">
            <path d="M-24 -16 L-4 -12 L10 -17 L26 -11 L22 20 L6 15 L-8 20 L-26 14 Z" fill="#F5E6BE" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" />
            <!-- Green island shape -->
            <path d="M-12 -3 Q-2 -10 8 -2 Q15 4 4 10 Q-7 12 -14 5 Z" fill="#7BB661" stroke="${INK}" stroke-width="1.6" />
            <!-- Dashed trail & math symbols -->
            <path d="M-16 6 Q-4 2 8 -4" fill="none" stroke="#C8392B" stroke-width="1.6" stroke-dasharray="3 2" />
            <text x="-15" y="-5" font-size="8" font-weight="800" fill="${INK}">+</text>
            <text x="10" y="9" font-size="8" font-weight="800" fill="${INK}">×</text>
            <text x="12" y="-5" font-size="7" font-weight="800" fill="#1F7A6B">=</text>
          </g>
        `
        : '';

    const leftArm = `
      <g transform="rotate(${frame === 'walk1' ? 14 : frame === 'walk2' ? -10 : 0} 76 174)">
        <!-- Red short sleeve -->
        <path d="M78 164 L58 182 L68 194 L82 180 Z" fill="#E94B3C" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
        <!-- Forearm -->
        <path d="M62 188 L54 214 Q52 222 60 223 Q66 222 68 214 L73 192 Z" fill="${skin}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" />
        <!-- Hand -->
        <circle cx="58" cy="221" r="7.5" fill="${skin}" stroke="${INK}" stroke-width="2.4" />
        ${mapProp}
      </g>
    `;

    const rightArm = showWavingRightArm
      ? `
        <g transform="rotate(${armWaveTilt} 144 174)">
          <!-- Red short sleeve raised -->
          <path d="M138 164 L162 162 L162 178 L140 180 Z" fill="#E94B3C" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
          <!-- Raised waving forearm -->
          <path d="M158 167 L176 138 Q182 134 186 139 Q188 144 184 150 L165 178 Z" fill="${skin}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" />
          <!-- Expressive waving hand with fingers -->
          <g transform="translate(185,134) rotate(14)">
            <ellipse cx="0" cy="4" rx="7.5" ry="7" fill="${skin}" stroke="${INK}" stroke-width="2.4" />
            <line x1="-5" y1="-1" x2="-8" y2="-9" stroke="${INK}" stroke-width="4.2" stroke-linecap="round" />
            <line x1="-5" y1="-1" x2="-8" y2="-9" stroke="${skin}" stroke-width="1.8" stroke-linecap="round" />
            <line x1="-1" y1="-2" x2="-2" y2="-11" stroke="${INK}" stroke-width="4.2" stroke-linecap="round" />
            <line x1="-1" y1="-2" x2="-2" y2="-11" stroke="${skin}" stroke-width="1.8" stroke-linecap="round" />
            <line x1="3" y1="-1" x2="5" y2="-10" stroke="${INK}" stroke-width="4.2" stroke-linecap="round" />
            <line x1="3" y1="-1" x2="5" y2="-10" stroke="${skin}" stroke-width="1.8" stroke-linecap="round" />
            <line x1="6" y1="2" x2="11" y2="-4" stroke="${INK}" stroke-width="4" stroke-linecap="round" />
            <line x1="6" y1="2" x2="11" y2="-4" stroke="${skin}" stroke-width="1.6" stroke-linecap="round" />
          </g>
        </g>
      `
      : `
        <g transform="rotate(${frame === 'measure' ? -36 : frame === 'walk1' ? -12 : 10} 144 174)">
          <path d="M142 164 L162 182 L152 194 L138 180 Z" fill="#E94B3C" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
          <path d="M158 188 L166 214 Q168 222 160 223 Q154 222 152 214 L147 192 Z" fill="${skin}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" />
          <circle cx="162" cy="221" r="7.5" fill="${skin}" stroke="${INK}" stroke-width="2.4" />
          ${
            frame === 'measure'
              ? `<g transform="translate(166,210) rotate(-22)"><rect x="0" y="-4" width="36" height="9" rx="2" fill="#F4C451" stroke="${INK}" stroke-width="2.2"/><line x1="8" y1="-4" x2="8" y2="1" stroke="${INK}" stroke-width="1.6"/><line x1="18" y1="-4" x2="18" y2="1" stroke="${INK}" stroke-width="1.6"/><line x1="28" y1="-4" x2="28" y2="1" stroke="${INK}" stroke-width="1.6"/></g>`
              : ''
          }
        </g>
      `;

    layerOutfit = `
      <g transform="translate(0,${bobY})">
        ${leftArm}
        ${rightArm}
        <!-- Red base t-shirt -->
        <path d="M80 158 L140 158 L144 214 L76 214 Z" fill="#E94B3C" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
        <!-- Yellow 5-pointed star on chest -->
        ${!isBack ? `<polygon points="${starPoints(110, 192, 13, 5.5)}" fill="#F7D147" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" />` : ''}
        <!-- Olive khaki open utility vest (left & right panels) -->
        <path d="M76 156 L93 156 L93 214 L73 214 Z" fill="#A4A073" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
        <path d="M127 156 L144 156 L147 214 L127 214 Z" fill="#A4A073" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
        ${
          !isBack
            ? `
              <!-- Multi-pockets on vest -->
              <rect x="76" y="172" width="13" height="12" rx="2.5" fill="#908C60" stroke="${INK}" stroke-width="1.8" />
              <rect x="75" y="191" width="15" height="16" rx="2.5" fill="#908C60" stroke="${INK}" stroke-width="1.8" />
              <line x1="75" y1="196" x2="90" y2="196" stroke="${INK}" stroke-width="1.6" />
              <rect x="131" y="172" width="13" height="12" rx="2.5" fill="#908C60" stroke="${INK}" stroke-width="1.8" />
              <rect x="130" y="191" width="15" height="16" rx="2.5" fill="#908C60" stroke="${INK}" stroke-width="1.8" />
              <line x1="130" y1="196" x2="145" y2="196" stroke="${INK}" stroke-width="1.6" />
              <!-- Backpack shoulder straps -->
              <path d="M83 156 L83 172 M137 156 L137 172" stroke="#6B6D46" stroke-width="4.5" stroke-linecap="round" />
            `
            : `<rect x="76" y="156" width="68" height="58" rx="6" fill="#A4A073" stroke="${INK}" stroke-width="2.6" />`
        }
        <!-- Checkered Khăn rằn scarf around neck -->
        <path d="M84 152 Q110 164 136 152 L139 164 Q110 176 81 164 Z" fill="url(#kr-${patternUid})" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" />
        ${
          !isBack
            ? `
              <!-- Two dangling scarf tails -->
              <path d="M98 164 L90 192 L102 194 L108 168 Z" fill="url(#kr-${patternUid})" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" />
              <path d="M114 166 L124 190 L134 186 L124 163 Z" fill="url(#kr-${patternUid})" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" />
            `
            : ''
        }
      </g>
    `;
  } else if (palette.isDefaultExplorer && isGirlVariant) {
    // GIRL SCHOLAR (Variant B): Teal zip-up hoodie with '+' & '=' patches + yellow inner shirt + checkered khăn rằn + hugged yellow math notebook!
    const holdNotebook = appearance.accessory === 'so_tay' && !isBack;
    layerOutfit = `
      <g transform="translate(0,${bobY})">
        <!-- Back hood collar -->
        <path d="M74 156 Q110 146 146 156 L148 172 Q110 166 72 172 Z" fill="#16778E" stroke="${INK}" stroke-width="2.6" />
        <!-- Yellow inner top -->
        <rect x="94" y="158" width="32" height="56" fill="#F7D44C" stroke="${INK}" stroke-width="2.4" />
        <!-- Teal hoodie left & right jacket panels -->
        <path d="M76 158 L104 158 L104 215 L74 215 Z" fill="#1C9BB7" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
        <path d="M116 158 L144 158 L146 215 L116 215 Z" fill="#1C9BB7" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
        <!-- Hoodie bottom rib hem -->
        <rect x="74" y="207" width="72" height="9" rx="3" fill="#16778E" stroke="${INK}" stroke-width="2.4" />

        ${
          !holdNotebook
            ? `
              <!-- Regular arms when not hugging notebook -->
              <g transform="rotate(${frame === 'celebrate' ? -36 : frame === 'walk1' ? 12 : -8} 76 172)">
                <path d="M78 162 L58 194 Q56 206 66 208 L80 184 Z" fill="#1C9BB7" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
                <circle cx="62" cy="208" r="7" fill="${skin}" stroke="${INK}" stroke-width="2.4" />
              </g>
              <g transform="rotate(${frame === 'celebrate' ? 36 : frame === 'measure' ? -34 : frame === 'walk2' ? 12 : -6} 144 172)">
                <path d="M142 162 L162 194 Q164 206 154 208 L140 184 Z" fill="#1C9BB7" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
                <circle cx="158" cy="208" r="7" fill="${skin}" stroke="${INK}" stroke-width="2.4" />
                <!-- Green '+' & Coral '=' math patches on sleeve -->
                <circle cx="150" cy="180" r="6" fill="#63B86A" stroke="${INK}" stroke-width="1.8" />
                <path d="M147 180 L153 180 M150 177 L150 183" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />
                <circle cx="154" cy="194" r="6" fill="#EE6A52" stroke="${INK}" stroke-width="1.8" />
                <path d="M151 192.5 L157 192.5 M151 195.5 L157 195.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />
              </g>
            `
            : `
              <!-- Draped checkered khăn rằn scarf flowing slightly left -->
              <path d="M84 155 Q62 160 44 156 L50 178 Q68 172 88 168 Z" fill="url(#kr-${patternUid})" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" />
              <path d="M84 154 Q110 166 136 154 L138 166 Q110 176 82 166 Z" fill="url(#kr-${patternUid})" stroke="${INK}" stroke-width="2.2" />

              <!-- Yellow math notebook hugged against chest -->
              <g transform="translate(96,192) rotate(-6)">
                <rect x="-18" y="-22" width="36" height="44" rx="4" fill="#F7D44C" stroke="${INK}" stroke-width="2.5" />
                <line x1="-12" y1="-22" x2="-12" y2="22" stroke="${INK}" stroke-width="1.8" />
                <polygon points="4,-14 -1,-6 9,-6" fill="#4DB3D6" stroke="${INK}" stroke-width="1.4" />
                <circle cx="1" cy="4" r="7" fill="#F4A442" stroke="${INK}" stroke-width="1.4" />
                <path d="M-2 5 Q1 8 4 5" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" />
              </g>

              <!-- Both sleeves curving inward hugging the notebook -->
              <path d="M78 164 Q60 186 72 200 L98 202 L98 188 L82 184 Z" fill="#1C9BB7" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
              <ellipse cx="101" cy="195" rx="8" ry="6.5" fill="${skin}" stroke="${INK}" stroke-width="2.3" />
              <path d="M142 164 Q158 186 144 202 L116 204 L116 190 L134 186 Z" fill="#1C9BB7" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
              <ellipse cx="113" cy="197" rx="8" ry="6.5" fill="${skin}" stroke="${INK}" stroke-width="2.3" />

              <!-- Green '+' & Coral '=' math patches on right sleeve -->
              <circle cx="145" cy="179" r="6" fill="#63B86A" stroke="${INK}" stroke-width="1.8" />
              <path d="M142 179 L148 179 M145 176 L145 182" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />
              <circle cx="145" cy="193" r="6" fill="#EE6A52" stroke="${INK}" stroke-width="1.8" />
              <path d="M142 191.5 L148 191.5 M142 194.5 L148 194.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />
            `
        }
      </g>
    `;
  } else {
    // UNLOCKED XP & HERO OUTFITS (respecting exact outfit palette & hero sash/epaulettes)
    layerOutfit = `
      <g transform="translate(0,${bobY})">
        <!-- Left arm -->
        <g transform="rotate(${frame === 'celebrate' ? -38 : frame === 'walk1' ? 14 : -10} 76 172)">
          <path d="M78 162 L58 196 Q57 206 67 207 L82 182 Z" fill="${palette.primary}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
          <circle cx="62" cy="208" r="7.5" fill="${skin}" stroke="${INK}" stroke-width="2.4" />
        </g>
        <!-- Right arm -->
        <g transform="rotate(${frame === 'celebrate' ? 38 : frame === 'measure' ? -36 : frame === 'walk2' ? 14 : -8} 144 172)">
          <path d="M142 162 L162 196 Q163 206 153 207 L138 182 Z" fill="${palette.primary}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
          <circle cx="158" cy="208" r="7.5" fill="${skin}" stroke="${INK}" stroke-width="2.4" />
        </g>
        <!-- Tunic / Coat body -->
        <path d="M76 158 Q110 150 144 158 L148 216 Q110 224 72 216 Z" fill="${palette.primary}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
        <!-- Collar & diagonal sash -->
        <path d="M93 156 L110 182 L127 156" fill="none" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="74" y="198" width="72" height="9" rx="3.5" fill="${palette.accent}" stroke="${INK}" stroke-width="2.2" />
        ${
          palette.isHero
            ? `
              <path d="M72 162 Q110 153 148 162 L144 174 Q110 166 76 174 Z" fill="${palette.accent}" stroke="${INK}" stroke-width="2.2" />
              <polygon points="${starPoints(110, 184, 8, 3.6)}" fill="${palette.accent}" stroke="${INK}" stroke-width="1.6" />
            `
            : ''
        }
      </g>
    `;
  }

  // Layer 8: Neck, Ears & Soft Rounded Chibi Head
  const layerHead = `
    <g transform="translate(${headShiftX},${bobY})">
      <!-- Neck -->
      <rect x="101" y="144" width="18" height="16" rx="6" fill="${skin}" stroke="${INK}" stroke-width="2.4" />
      <!-- Ears -->
      ${!isSide ? `<ellipse cx="60" cy="108" rx="9" ry="11" fill="${skin}" stroke="${INK}" stroke-width="2.8" /><path d="M58 104 Q62 108 58 113" fill="none" stroke="#C98664" stroke-width="1.8" stroke-linecap="round"/>` : ''}
      <ellipse cx="160" cy="108" rx="9" ry="11" fill="${skin}" stroke="${INK}" stroke-width="2.8" />
      <path d="M162 104 Q158 108 162 113" fill="none" stroke="#C98664" stroke-width="1.8" stroke-linecap="round" />
      <!-- Rounded chibi face with gentle cheek fullness -->
      <path d="M62 100 C62 66 80 54 110 54 C140 54 158 66 158 100 C158 134 140 150 110 150 C80 150 62 134 62 100 Z" fill="${skin}" stroke="${INK}" stroke-width="3" />
      <path d="M64 100 C64 68 81 56 110 56 C139 56 156 68 156 100 C156 132 139 148 110 148 C81 148 64 132 64 100 Z" fill="url(#skinShade-${patternUid})" />
    </g>
  `;

  // Layer 9: Expressive Cartoon Face (Large Sclera+Pupil+Sparkle Eyes, Rosy Cheeks, Open D-Smile with Tongue)
  let layerFace = '';
  if (!isBack) {
    const ox = isSide ? 11 : 0;
    const leftEyeX = 88 + ox;
    const rightEyeX = 132 + ox;
    const noseX = 110 + ox;

    let eyesMarkup = '';
    if (appearance.eyeStyle === 'gentle') {
      eyesMarkup = `
        <path d="M${leftEyeX - 9} 107 Q${leftEyeX} 96 ${leftEyeX + 9} 107" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" />
        ${!isSide ? `<path d="M${rightEyeX - 9} 107 Q${rightEyeX} 96 ${rightEyeX + 9} 107" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" />` : ''}
      `;
    } else if (appearance.eyeStyle === 'sparkle') {
      eyesMarkup = `
        <ellipse cx="${leftEyeX}" cy="105" rx="9.2" ry="10.2" fill="#FFFFFF" stroke="${INK}" stroke-width="2.4" />
        <ellipse cx="${leftEyeX + 0.5}" cy="105.5" rx="6.5" ry="7.4" fill="${INK}" />
        <circle cx="${leftEyeX - 2.2}" cy="102" r="2.7" fill="#FFFFFF" />
        <circle cx="${leftEyeX + 2.6}" cy="108.5" r="1.5" fill="#F7D147" />
        ${
          !isSide
            ? `<ellipse cx="${rightEyeX}" cy="105" rx="9.2" ry="10.2" fill="#FFFFFF" stroke="${INK}" stroke-width="2.4" />
               <ellipse cx="${rightEyeX - 0.5}" cy="105.5" rx="6.5" ry="7.4" fill="${INK}" />
               <circle cx="${rightEyeX - 2.2}" cy="102" r="2.7" fill="#FFFFFF" />
               <circle cx="${rightEyeX + 2.6}" cy="108.5" r="1.5" fill="#F7D147" />`
            : ''
        }
      `;
    } else if (appearance.eyeStyle === 'focused') {
      eyesMarkup = `
        <ellipse cx="${leftEyeX}" cy="106" rx="8.5" ry="7.8" fill="#FFFFFF" stroke="${INK}" stroke-width="2.4" />
        <circle cx="${leftEyeX + 0.5}" cy="106" r="5.6" fill="${INK}" />
        <circle cx="${leftEyeX - 1.8}" cy="103.5" r="2.1" fill="#FFFFFF" />
        ${
          !isSide
            ? `<ellipse cx="${rightEyeX}" cy="106" rx="8.5" ry="7.8" fill="#FFFFFF" stroke="${INK}" stroke-width="2.4" />
               <circle cx="${rightEyeX - 0.5}" cy="106" r="5.6" fill="${INK}" />
               <circle cx="${rightEyeX - 1.8}" cy="103.5" r="2.1" fill="#FFFFFF" />`
            : ''
        }
      `;
    } else {
      // 'bright' — Signature large cartoon eyes from reference image!
      eyesMarkup = `
        <ellipse cx="${leftEyeX}" cy="105" rx="8.8" ry="9.8" fill="#FFFFFF" stroke="${INK}" stroke-width="2.3" />
        <ellipse cx="${leftEyeX + 0.6}" cy="105.5" rx="6.2" ry="7.2" fill="${INK}" />
        <circle cx="${leftEyeX - 1.8}" cy="102.2" r="2.6" fill="#FFFFFF" />
        <circle cx="${leftEyeX + 2.4}" cy="108.6" r="1.1" fill="#FFFFFF" />
        ${
          !isSide
            ? `<ellipse cx="${rightEyeX}" cy="105" rx="8.8" ry="9.8" fill="#FFFFFF" stroke="${INK}" stroke-width="2.3" />
               <ellipse cx="${rightEyeX - 0.6}" cy="105.5" rx="6.2" ry="7.2" fill="${INK}" />
               <circle cx="${rightEyeX - 1.8}" cy="102.2" r="2.6" fill="#FFFFFF" />
               <circle cx="${rightEyeX + 2.4}" cy="108.6" r="1.1" fill="#FFFFFF" />`
            : ''
        }
      `;
    }

    const browY = 90;
    const browsMarkup =
      appearance.browStyle === 'determined'
        ? `<path d="M${leftEyeX - 8} ${browY - 2} L${leftEyeX + 7} ${browY + 2}" stroke="${INK}" stroke-width="3" stroke-linecap="round" />
           ${!isSide ? `<path d="M${rightEyeX + 8} ${browY - 2} L${rightEyeX - 7} ${browY + 2}" stroke="${INK}" stroke-width="3" stroke-linecap="round" />` : ''}`
        : appearance.browStyle === 'arch'
          ? `<path d="M${leftEyeX - 8} ${browY + 1} Q${leftEyeX} ${browY - 5} ${leftEyeX + 7} ${browY}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" />
             ${!isSide ? `<path d="M${rightEyeX - 7} ${browY} Q${rightEyeX} ${browY - 5} ${rightEyeX + 8} ${browY + 1}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" />` : ''}`
          : `<path d="M${leftEyeX - 7} ${browY} Q${leftEyeX} ${browY - 2} ${leftEyeX + 7} ${browY}" fill="none" stroke="${INK}" stroke-width="2.7" stroke-linecap="round" />
             ${!isSide ? `<path d="M${rightEyeX - 7} ${browY} Q${rightEyeX} ${browY - 2} ${rightEyeX + 7} ${browY}" fill="none" stroke="${INK}" stroke-width="2.7" stroke-linecap="round" />` : ''}`;

    // Cute subtle nose dot/curve
    const noseMarkup = `<path d="M${noseX - 1.5} 114 Q${noseX} 116.5 ${noseX + 2.2} 114.5" fill="none" stroke="#B67656" stroke-width="2" stroke-linecap="round" />`;

    let mouthMarkup = `<path d="M${noseX - 11} 124 Q${noseX} 134 ${noseX + 11} 124" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" />`;
    if (appearance.mouthStyle === 'grin' || frame === 'celebrate') {
      // Open D-shaped happy smile with coral-pink tongue (exact reference style!)
      mouthMarkup = `
        <path d="M${noseX - 13} 122 Q${noseX} 125 ${noseX + 13} 122 Q${noseX + 11} 138 ${noseX} 138 Q${noseX - 11} 138 ${noseX - 13} 122 Z" fill="#9E3136" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" />
        <path d="M${noseX - 11} 123 Q${noseX} 125.5 ${noseX + 11} 123 L${noseX + 10} 126 Q${noseX} 128 ${noseX - 10} 126 Z" fill="#FFFFFF" />
        <ellipse cx="${noseX}" cy="134.5" rx="7.2" ry="3.4" fill="#FF8C8C" />
      `;
    } else if (appearance.mouthStyle === 'curious') {
      mouthMarkup = `<ellipse cx="${noseX}" cy="129" rx="4.8" ry="5.6" fill="#C94B4B" stroke="${INK}" stroke-width="2.4" />`;
    } else if (appearance.mouthStyle === 'proud') {
      mouthMarkup = `<path d="M${noseX - 9} 127 Q${noseX + 2} 133 ${noseX + 12} 123" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" />`;
    }

    layerFace = `
      <g transform="translate(${headShiftX},${bobY})">
        <!-- Warm oval rosy cheeks -->
        <ellipse cx="${leftEyeX - 10}" cy="119" rx="8.5" ry="4.8" fill="#FF9888" opacity="0.58" />
        ${!isSide ? `<ellipse cx="${rightEyeX + 10}" cy="119" rx="8.5" ry="4.8" fill="#FF9888" opacity="0.58" />` : ''}
        ${browsMarkup}
        ${eyesMarkup}
        ${noseMarkup}
        ${mouthMarkup}
      </g>
    `;
  }

  // Layer 10: Front / Top Hair (including Boy Explorer spiky bangs & Girl Scholar parted bangs + '+'/'×' hairpins)
  let layerFrontHair = '';
  if (isBack) {
    layerFrontHair = `
      <g transform="translate(${headShiftX},${bobY})">
        <path d="M58 104 C58 64 78 50 110 50 C142 50 162 64 162 104 C162 132 146 146 110 146 C74 146 58 132 58 104 Z" fill="${hair}" stroke="${INK}" stroke-width="3" />
      </g>
    `;
  } else if (appearance.hairStyle === 'spiky') {
    // Boy Explorer messy dark fringed bangs sticking out playfully around ears & forehead!
    layerFrontHair = `
      <g transform="translate(${headShiftX},${bobY})">
        <path d="M58 104 L52 94 L59 88 C58 62 78 48 110 48 C142 48 162 62 161 88 L168 94 L161 104 L156 96 L154 84 L144 92 L140 76 L126 89 L120 73 L105 88 L98 73 L85 88 L78 76 L67 92 L65 100 Z" fill="${hair}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
        <!-- Soft hair highlight sheen -->
        <path d="M84 62 Q104 54 126 60" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3" stroke-linecap="round" />
      </g>
    `;
  } else if (appearance.hairStyle === 'ponytail' || appearance.hairStyle === 'braid') {
    // Girl Scholar parted bangs + iconic yellow '+' and coral-red '×' math hairpins!
    layerFrontHair = `
      <g transform="translate(${headShiftX},${bobY})">
        <path d="M58 106 C56 62 78 48 110 48 C142 48 164 62 162 106 L156 100 C155 82 142 74 128 84 L118 72 C108 82 95 88 84 82 L76 74 C70 84 65 92 64 102 Z" fill="${hair}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
        <!-- Hair shine curve -->
        <path d="M76 66 Q94 56 112 60" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2.6" stroke-linecap="round" />
        <!-- Yellow '+' hairpin & Coral '×' hairpin on temple (visible in both front and side views!) -->
        <g transform="translate(${isSide ? 116 : 136},${isSide ? 66 : 68}) rotate(-12)">
          <path d="M-6 0 L6 0 M0 -6 L0 6" stroke="${INK}" stroke-width="6.5" stroke-linecap="round" />
          <path d="M-6 0 L6 0 M0 -6 L0 6" stroke="#F7D44C" stroke-width="3.4" stroke-linecap="round" />
        </g>
        <g transform="translate(${isSide ? 128 : 147},${isSide ? 78 : 80}) rotate(32)">
          <path d="M-5.5 0 L5.5 0 M0 -5.5 L0 5.5" stroke="${INK}" stroke-width="6" stroke-linecap="round" />
          <path d="M-5.5 0 L5.5 0 M0 -5.5 L0 5.5" stroke="#EE5A52" stroke-width="3.2" stroke-linecap="round" />
        </g>
      </g>
    `;
  } else {
    // Clean short / bob / bun front bangs
    layerFrontHair = `
      <g transform="translate(${headShiftX},${bobY})">
        <path d="M58 104 C58 62 78 48 110 48 C142 48 162 62 162 104 L156 96 C144 76 126 84 114 73 C100 84 82 78 65 96 Z" fill="${hair}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
        <path d="M84 60 Q110 53 132 61" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2.6" stroke-linecap="round" />
      </g>
    `;
  }

  // Layer 11: Headwear (Khaki+Teal yellow-star baseball cap, Nón lá, Khăn rằn headband, Vòng Đông Sơn)
  let layerHeadwear = '';
  if (appearance.headwear === 'mu_tham_hiem') {
    // Exact Khaki/Cream + Teal Baseball Cap with Golden 5-Pointed Star from reference image!
    layerHeadwear = isSide
      ? `
        <g transform="translate(${headShiftX},${bobY})">
          <!-- Side cap crown -->
          <path d="M56 76 C58 34 86 24 116 26 C142 28 156 44 156 66 Z" fill="#D9CEA8" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
          <path d="M56 76 C58 46 72 30 92 27 L88 70 Z" fill="#2E7D8B" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" />
          <!-- Top button -->
          <circle cx="104" cy="25" r="4" fill="#2E7D8B" stroke="${INK}" stroke-width="2.2" />
          <!-- Forward teal visor -->
          <path d="M104 62 Q152 50 184 64 Q166 76 112 72 Z" fill="#2E7D8B" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
          <!-- Star emblem near front -->
          <polygon points="${starPoints(134, 48, 10, 4.4)}" fill="#F7D147" stroke="${INK}" stroke-width="2" stroke-linejoin="round" />
        </g>
      `
      : `
        <g transform="translate(${headShiftX},${bobY}) rotate(-4 110 62)">
          <!-- Teal left/right cap side panels -->
          <path d="M56 72 C56 36 80 24 110 24 C140 24 164 36 164 72 Z" fill="#2E7D8B" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
          <!-- Cream-khaki front crown panel -->
          <path d="M74 68 C74 34 90 25 110 25 C130 25 146 34 146 68 Z" fill="#DDD2AE" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
          <!-- Cap top button -->
          <circle cx="110" cy="24" r="4" fill="#2E7D8B" stroke="${INK}" stroke-width="2.2" />
          <!-- Curved teal visor -->
          ${
            !isBack
              ? `<path d="M62 72 Q110 48 168 68 Q174 74 162 78 Q112 60 66 78 Q58 76 62 72 Z" fill="#2E7D8B" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round" />
                 <!-- Bright golden 5-pointed star -->
                 <polygon points="${starPoints(110, 46, 11.5, 5)}" fill="#F7D147" stroke="${INK}" stroke-width="2" stroke-linejoin="round" />`
              : `<rect x="92" y="64" width="36" height="8" rx="4" fill="#DDD2AE" stroke="${INK}" stroke-width="2.2" />`
          }
        </g>
      `;
  } else if (appearance.headwear === 'non_la') {
    layerHeadwear = `
      <g transform="translate(${headShiftX},${bobY})">
        <path d="M30 74 L110 14 L190 74 Q110 88 30 74 Z" fill="#F2DC9F" stroke="${INK}" stroke-width="3" stroke-linejoin="round" />
        <path d="M54 66 Q110 76 166 66" fill="none" stroke="#B9831E" stroke-width="2.2" />
        <path d="M78 46 Q110 54 142 46" fill="none" stroke="#B9831E" stroke-width="1.8" />
        <path d="M74 74 Q110 156 146 74" fill="none" stroke="#C8392B" stroke-width="2" opacity="0.7" />
      </g>
    `;
  } else if (appearance.headwear === 'khan_ran') {
    layerHeadwear = `
      <g transform="translate(${headShiftX},${bobY})">
        <path d="M56 76 Q110 60 164 76 L160 90 Q110 74 60 90 Z" fill="url(#kr-${patternUid})" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" />
      </g>
    `;
  } else if (appearance.headwear === 'vong_dong_son') {
    layerHeadwear = `
      <g transform="translate(${headShiftX},${bobY})">
        <path d="M58 76 Q110 60 162 76 L160 86 Q110 71 60 86 Z" fill="#E6AE3A" stroke="${INK}" stroke-width="2.6" />
        <circle cx="110" cy="72" r="9" fill="#C8392B" stroke="${INK}" stroke-width="2.4" />
        <polygon points="${starPoints(110, 72, 5.5, 2.5)}" fill="#FFFBF0" />
      </g>
    `;
  }

  // Layer 12: Accessories (glasses, binoculars, hanging compass, extra notebook for non-default outfits)
  let layerAccessory = '';
  if (appearance.accessory === 'kinh_tron' && !isBack) {
    const ox = isSide ? 11 : 0;
    layerAccessory = `
      <g transform="translate(${headShiftX},${bobY})">
        <circle cx="${88 + ox}" cy="105" r="14.5" fill="rgba(255,255,255,0.22)" stroke="${INK}" stroke-width="2.8" />
        ${
          !isSide
            ? `<circle cx="${132 + ox}" cy="105" r="14.5" fill="rgba(255,255,255,0.22)" stroke="${INK}" stroke-width="2.8" />
               <line x1="${102.5 + ox}" y1="105" x2="${117.5 + ox}" y2="105" stroke="${INK}" stroke-width="2.8" />`
            : ''
        }
      </g>
    `;
  } else if (appearance.accessory === 'ong_nhom' && !isBack) {
    layerAccessory = `
      <g transform="translate(0,${bobY})">
        <path d="M95 162 L98 182 M125 162 L122 182" stroke="${INK}" stroke-width="2" />
        <circle cx="101" cy="186" r="8.5" fill="#3B5F8F" stroke="${INK}" stroke-width="2.4" />
        <circle cx="119" cy="186" r="8.5" fill="#3B5F8F" stroke="${INK}" stroke-width="2.4" />
        <circle cx="101" cy="186" r="3.6" fill="#8FD3E6" />
        <circle cx="119" cy="186" r="3.6" fill="#8FD3E6" />
      </g>
    `;
  } else if (appearance.accessory === 'compa_deo' && !isBack) {
    layerAccessory = `
      <g transform="translate(0,${bobY})">
        <path d="M62 204 L53 232 M62 204 L71 232" stroke="#E0A93B" stroke-width="3.2" stroke-linecap="round" />
        <circle cx="62" cy="203" r="4.5" fill="${INK}" />
      </g>
    `;
  } else if (appearance.accessory === 'so_tay' && !palette.isDefaultExplorer && !isBack) {
    layerAccessory = `
      <g transform="translate(0,${bobY})">
        <rect x="148" y="196" width="24" height="30" rx="4" fill="#F7D44C" stroke="${INK}" stroke-width="2.5" />
        <line x1="153" y1="205" x2="167" y2="205" stroke="#1F7A6B" stroke-width="2" />
        <line x1="153" y1="213" x2="165" y2="213" stroke="#8A5A3B" stroke-width="2" />
      </g>
    `;
  }

  // Layer 13: Chest Badge (La bàn, Chim Lạc, Tam giác vàng) — subtle pin on right/left chest
  let layerBadge = '';
  if (appearance.badge !== 'none' && !isBack && !(palette.isDefaultExplorer && isGirlVariant && appearance.accessory === 'so_tay')) {
    const bx = palette.isDefaultExplorer && !isGirlVariant ? 135 : 126;
    const by = 178;
    const badgeColor =
      appearance.badge === 'chim_lac'
        ? '#F7D147'
        : appearance.badge === 'tam_giac_vang'
          ? '#FFF4D6'
          : '#8FD3E6';
    layerBadge = `
      <g transform="translate(0,${bobY})">
        <circle cx="${bx}" cy="${by}" r="7.5" fill="${badgeColor}" stroke="${INK}" stroke-width="2" />
        ${
          appearance.badge === 'tam_giac_vang'
            ? `<polygon points="${bx},${by - 4.5} ${bx - 4.5},${by + 3.5} ${bx + 4.5},${by + 3.5}" fill="#C8392B" />`
            : `<circle cx="${bx}" cy="${by}" r="2.6" fill="${INK}" />`
        }
      </g>
    `;
  }

  // In back view, render backpack on top of torso!
  const layerBackpackFront = isBack ? buildBackpackMarkup(true) : '';

  return `${defs}${layerShadow}${layerCape}${layerBackpackBehind}${layerBackHair}${layerLegs}${layerLowerWear}${layerOutfit}${layerBackpackFront}${layerHead}${layerFace}${layerFrontHair}${layerHeadwear}${layerAccessory}${layerBadge}`;
}

export const Avatar: React.FC<AvatarProps> = ({
  appearance,
  view = 'front',
  frame = 'idle',
  size = 120,
  className = '',
}) => {
  const reactId = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const markup = React.useMemo(
    () => buildAvatarSvgMarkup(appearance, view, frame, reactId || 'tdk'),
    [appearance, view, frame, reactId],
  );
  const width = Math.round((size * 220) / 300);

  return (
    <svg
      viewBox="0 0 220 300"
      width={width}
      height={size}
      className={className}
      role="img"
      aria-label="Nhân vật chibi học viên Toán Du Ký"
      dangerouslySetInnerHTML={{__html: markup}}
    />
  );
};

// Cached Image renderer so Canvas 2D draws the exact same avatar with zero lag and automatic cache invalidation
const spriteCache = new Map<string, HTMLImageElement>();

export function renderAvatarToCanvas(
  ctx: CanvasRenderingContext2D,
  appearance: AvatarAppearance,
  view: AvatarView,
  frame: AvatarFrame,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const key = `${JSON.stringify(appearance)}|${view}|${frame}`;
  let img = spriteCache.get(key);
  if (!img) {
    if (spriteCache.size > 60) {
      spriteCache.clear();
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 300" width="220" height="300">${buildAvatarSvgMarkup(appearance, view, frame, 'cvs')}</svg>`;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    spriteCache.set(key, image);
    img = image;
  }

  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x - width / 2, y - height, width, height);
  } else {
    ctx.save();
    ctx.fillStyle = '#1D7A6A';
    ctx.beginPath();
    ctx.arc(x, y - height * 0.45, width * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

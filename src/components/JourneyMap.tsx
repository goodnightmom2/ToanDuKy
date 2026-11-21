import React from 'react';
import {Check, Compass, Crown, Crosshair, FastForward, Lock, ZoomIn, ZoomOut} from 'lucide-react';
import {Avatar} from './Avatar.tsx';
import {VietnamFallbackMapSvg} from './VietnamFallbackMapSvg.tsx';
import {
  buildSegmentSvgPath,
  buildSmoothJourneySvgPath,
  canEnterMoc,
  computeJourneyPercent,
  getEffectivePinCoords,
  isFreeModeUnlocked,
  JOURNEY_MILESTONES,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
  normalizeJourneyProgress,
  pinPercentToSvgPoint,
} from '../journey.ts';
import type {AvatarAppearance, JourneyProgress, MapPinCoords, MocId} from '../types.ts';

interface JourneyMapProps {
  journey: JourneyProgress;
  selectedMocId: MocId;
  avatar: AvatarAppearance;
  unlockAllDemo?: boolean;
  backgroundDataUrl?: string;
  hasBakedLabels?: boolean;
  pinOverrides?: Partial<Record<MocId, MapPinCoords>>;
  reduceMotion?: boolean;
  /** When set (e.g. after passing moc N), animates the avatar walking from moc N to N+1 */
  animateFromMoc?: MocId | null;
  onAnimationDone?: () => void;
  onSelectMoc: (mocId: MocId) => void;
  /** Teacher/Admin monitoring mode: hides student avatar & locks, shows student counts per milestone */
  monitorMode?: {
    studentCountsByMoc: Partial<Record<MocId, number>>;
    totalStudents: number;
    completedAllCount?: number;
  };
}

const DEFAULT_PUBLIC_MAP_URL = '/journey-map.jpg';

/**
 * Computes optimal label alignment around each pin so no two pills collide on 1024x572
 * and baked labels in journey-map.jpg are cleanly masked without ghost text peeking out.
 */
function getLabelOffsetClass(mocId: MocId, isCurrent: boolean): string {
  switch (mocId) {
    case 1:
      // Covers baked "Cột mốc 1: Tây Ninh" banner centered directly beneath pin 1
      return isCurrent
        ? 'top-[94%] left-1/2 -translate-x-1/2 min-w-[128px] text-center'
        : 'top-[124%] left-1/2 -translate-x-1/2 min-w-[130px] text-center';
    case 2:
      return isCurrent
        ? 'top-[86%] left-[62%] -translate-x-1/2 min-w-[116px] text-center'
        : 'top-[112%] left-1/2 -translate-x-1/2 min-w-[66px] text-center';
    case 3:
      return 'top-[126%] left-[72%] -translate-x-1/2 min-w-[112px] text-center';
    case 4:
      return 'top-[54%] left-[108%] min-w-[82px] text-center';
    case 5:
      return 'top-[22%] left-[106%] min-w-[76px] text-center';
    case 6:
      return 'top-1/2 left-[112%] -translate-y-1/2 min-w-[54px] text-center';
    case 7:
      return 'top-[16%] left-[112%] min-w-[56px] text-center';
    case 8:
      return 'top-[8%] left-[102%] min-w-[86px] text-center';
    case 9:
      return 'top-1/2 left-[112%] -translate-y-1/2 min-w-[68px] text-center';
    case 10:
      return 'top-1/2 left-[112%] -translate-y-1/2 min-w-[78px] text-center';
    default:
      return 'top-[105%] left-1/2 -translate-x-1/2';
  }
}

export const JourneyMap: React.FC<JourneyMapProps> = ({
  journey: rawJourney,
  selectedMocId,
  avatar,
  unlockAllDemo = false,
  backgroundDataUrl,
  hasBakedLabels = false,
  pinOverrides,
  reduceMotion = false,
  animateFromMoc = null,
  onAnimationDone,
  onSelectMoc,
  monitorMode,
}) => {
  const isMonitor = Boolean(monitorMode);
  const journey = React.useMemo(() => normalizeJourneyProgress(rawJourney), [rawJourney]);
  const freeMode = isFreeModeUnlocked(journey);
  const percent = computeJourneyPercent(journey);
  const passedCount = journey.passedMoc.length;

  // Background fallback cascade: (a) uploaded dataUrl -> (b) /journey-map.jpg -> (c) SVG fallback
  const [bgTier, setBgTier] = React.useState<'uploaded' | 'public' | 'svg'>(() =>
    backgroundDataUrl ? 'uploaded' : 'public',
  );
  React.useEffect(() => {
    setBgTier(backgroundDataUrl ? 'uploaded' : 'public');
  }, [backgroundDataUrl]);

  const effectiveCoords = React.useMemo(
    () => getEffectivePinCoords(pinOverrides),
    [pinOverrides],
  );

  const svgPoints = React.useMemo(
    () => JOURNEY_MILESTONES.map((m) => pinPercentToSvgPoint(effectiveCoords[m.id])),
    [effectiveCoords],
  );

  const fullPathD = React.useMemo(() => buildSmoothJourneySvgPath(svgPoints), [svgPoints]);

  // Passed contiguous segment paths (i -> i+1 where milestone i+1 (1-based) is passed)
  const passedSegmentPaths = React.useMemo(() => {
    const segs: Array<{id: string; d: string}> = [];
    for (let i = 0; i < JOURNEY_MILESTONES.length - 1; i++) {
      const fromMoc = (i + 1) as MocId;
      if (journey.passedMoc.includes(fromMoc)) {
        segs.push({id: `seg-${fromMoc}`, d: buildSegmentSvgPath(svgPoints, i)});
      }
    }
    return segs;
  }, [journey.passedMoc, svgPoints]);

  // Next active segment pulsing gently toward currentMoc
  const activeUpcomingSegmentD = React.useMemo(() => {
    if (freeMode) return '';
    const idx = journey.currentMoc - 2; // segment from (currentMoc - 1) -> currentMoc
    if (idx >= 0 && idx < svgPoints.length - 1) {
      return buildSegmentSvgPath(svgPoints, idx);
    }
    // At Mốc 1 before anything passed, softly preview segment 1 -> 2
    if (journey.currentMoc === 1 && passedCount === 0) {
      return buildSegmentSvgPath(svgPoints, 0);
    }
    return '';
  }, [freeMode, journey.currentMoc, passedCount, svgPoints]);

  // ---- Walk animation along SVG path when newly passing a milestone ----
  const walkPathRef = React.useRef<SVGPathElement | null>(null);
  const [walkingPos, setWalkingPos] = React.useState<{xPct: number; yPct: number; progress: number} | null>(null);
  const [footsteps, setFootsteps] = React.useState<Array<{x: number; y: number; key: number}>>([]);
  const [animSegD, setAnimSegD] = React.useState<string>('');
  const animCancelRef = React.useRef(false);

  const skipWalkAnimation = React.useCallback(() => {
    animCancelRef.current = true;
    setWalkingPos(null);
    setFootsteps([]);
    setAnimSegD('');
    onAnimationDone?.();
  }, [onAnimationDone]);

  React.useEffect(() => {
    if (!animateFromMoc || animateFromMoc >= 10 || reduceMotion) {
      if (animateFromMoc && reduceMotion) {
        onAnimationDone?.();
      }
      return;
    }
    const segIdx = animateFromMoc - 1;
    const d = buildSegmentSvgPath(svgPoints, segIdx);
    if (!d) return;
    setAnimSegD(d);
    animCancelRef.current = false;

    let rafId = 0;
    const startTs = performance.now();
    const DURATION_MS = 1850;
    let lastStepTick = -1;

    const tick = (now: number) => {
      if (animCancelRef.current) return;
      const pathEl = walkPathRef.current;
      if (!pathEl) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const rawT = Math.min(1, (now - startTs) / DURATION_MS);
      // Smooth ease-in-out
      const t = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;
      const totalLen = pathEl.getTotalLength();
      const pt = pathEl.getPointAtLength(totalLen * t);
      setWalkingPos({
        xPct: (pt.x / MAP_VIEWBOX_WIDTH) * 100,
        yPct: (pt.y / MAP_VIEWBOX_HEIGHT) * 100,
        progress: t,
      });

      const stepTick = Math.floor(t * 7);
      if (stepTick > lastStepTick && stepTick < 7) {
        lastStepTick = stepTick;
        setFootsteps((prev) => [...prev.slice(-6), {x: pt.x, y: pt.y, key: stepTick}]);
      }

      if (rawT < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          if (!animCancelRef.current) {
            setWalkingPos(null);
            setFootsteps([]);
            setAnimSegD('');
            onAnimationDone?.();
          }
        }, 320);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [animateFromMoc, reduceMotion, svgPoints, onAnimationDone]);

  // ---- Responsive pan & pinch-zoom (mobile defaults zoomed around current milestone) ----
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const canvasStageRef = React.useRef<HTMLDivElement | null>(null);
  const [isMobileViewport, setIsMobileViewport] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const [zoom, setZoom] = React.useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 1.45 : 1,
  );
  const [pan, setPan] = React.useState<{x: number; y: number}>({x: 0, y: 0});

  const clampPan = React.useCallback((nx: number, ny: number, scale: number) => {
    const vp = viewportRef.current;
    const inner = canvasStageRef.current;
    if (!vp || !inner) return {x: 0, y: 0};
    const vpW = vp.clientWidth;
    const vpH = vp.clientHeight;
    const contentW = inner.offsetWidth * scale;
    const contentH = inner.offsetHeight * scale;
    const maxX = Math.max(0, (contentW - vpW) / 2);
    const maxY = Math.max(0, (contentH - vpH) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  }, []);

  const centerOnMoc = React.useCallback(
    (mocId: MocId, targetScale?: number) => {
      const inner = canvasStageRef.current;
      const scale = targetScale ?? (isMobileViewport ? 1.45 : 1);
      setZoom(scale);
      if (!inner || (!isMobileViewport && scale <= 1.01)) {
        setPan({x: 0, y: 0});
        return;
      }
      const pos = effectiveCoords[mocId];
      const w = inner.offsetWidth;
      const h = inner.offsetHeight;
      const targetX = (0.5 - pos.x / 100) * w * scale;
      const targetY = (0.5 - pos.y / 100) * h * scale;
      setPan(clampPan(targetX, targetY, scale));
    },
    [clampPan, effectiveCoords, isMobileViewport],
  );

  React.useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileViewport(mobile);
      if (!mobile) {
        setZoom(1);
        setPan({x: 0, y: 0});
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-center on current milestone on mobile initial mount or when currentMoc changes
  React.useEffect(() => {
    if (isMobileViewport) {
      // Wait 1 frame so inner stage offsetWidth is measured cleanly
      const id = requestAnimationFrame(() => centerOnMoc(journey.currentMoc, 1.45));
      return () => cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileViewport, journey.currentMoc]);

  // Pointer drag + two-finger pinch state
  const pointersRef = React.useRef<Map<number, {x: number; y: number}>>(new Map());
  const dragStartRef = React.useRef<{
    panX: number;
    panY: number;
    clientX: number;
    clientY: number;
    pinchDist: number;
    pinchZoom: number;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Allow direct button clicks to pass through when not dragging
    if ((e.target as HTMLElement).closest('button')) return;
    pointersRef.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
    e.currentTarget.setPointerCapture(e.pointerId);

    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 1) {
      dragStartRef.current = {
        panX: pan.x,
        panY: pan.y,
        clientX: e.clientX,
        clientY: e.clientY,
        pinchDist: 0,
        pinchZoom: zoom,
      };
    } else if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      dragStartRef.current = {
        panX: pan.x,
        panY: pan.y,
        clientX: (pts[0].x + pts[1].x) / 2,
        clientY: (pts[0].y + pts[1].y) / 2,
        pinchDist: Math.max(10, dist),
        pinchZoom: zoom,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId) || !dragStartRef.current) return;
    pointersRef.current.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const pts = Array.from(pointersRef.current.values());
    const start = dragStartRef.current;

    if (pts.length === 2 && start.pinchDist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const nextScale = Math.max(1, Math.min(2.6, start.pinchZoom * (dist / start.pinchDist)));
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      setZoom(nextScale);
      setPan(clampPan(start.panX + (midX - start.clientX), start.panY + (midY - start.clientY), nextScale));
    } else if (pts.length === 1 && (zoom > 1.01 || isMobileViewport)) {
      const dx = e.clientX - start.clientX;
      const dy = e.clientY - start.clientY;
      setPan(clampPan(start.panX + dx, start.panY + dy, zoom));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
    }
  };

  const adjustZoom = (delta: number) => {
    const next = Math.max(1, Math.min(2.6, Number((zoom + delta).toFixed(2))));
    setZoom(next);
    setPan((prev) => clampPan(prev.x, prev.y, next));
  };

  const currentPinPos = effectiveCoords[journey.currentMoc];
  const avatarPos = walkingPos ?? {
    xPct: Math.max(6, currentPinPos.x - 4.4),
    yPct: Math.max(8, currentPinPos.y - 3.2),
  };

  const showBakedMasks = bgTier !== 'svg' && hasBakedLabels;

  return (
    <div className="relative rounded-2xl border-2 border-[#C9A86A] overflow-hidden bg-[#2E94B9] shadow-md select-none">
      {/* Interactive Pan/Zoom Stage — Inner map ALWAYS preserves exact 16:9 (2048x1152) ratio */}
      <div
        ref={viewportRef}
        className="relative w-full h-[290px] sm:h-auto sm:aspect-[16/9] overflow-hidden touch-none flex items-center justify-center"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-testid="journey-map-stage"
      >
        <div
          ref={canvasStageRef}
          className="relative h-full w-auto sm:w-full sm:h-full aspect-[16/9] shrink-0 origin-center transition-transform duration-150 ease-out"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          }}
        >
          {/* LAYER 0: Map Background Priority (a) Uploaded -> (b) /journey-map.jpg -> (c) Built-in SVG */}
          {bgTier === 'uploaded' && backgroundDataUrl ? (
            <img
              src={backgroundDataUrl}
              alt="Bản đồ phiêu lưu Việt Nam Toán Du Ký"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover block pointer-events-none"
              draggable={false}
              onError={() => setBgTier('public')}
            />
          ) : bgTier === 'public' ? (
            <img
              src={DEFAULT_PUBLIC_MAP_URL}
              alt="Bản đồ phiêu lưu Việt Nam Toán Du Ký"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover block pointer-events-none"
              draggable={false}
              onError={() => setBgTier('svg')}
            />
          ) : (
            <VietnamFallbackMapSvg className="w-full h-full block pointer-events-none" />
          )}

          {/* LAYER 1: Sovereignty & Geography Labels (drawn crisply by software on clean text-free map) */}
          {bgTier !== 'svg' && (
            <div className="absolute inset-0 pointer-events-none z-10" aria-hidden="true">
              {/* Dãy núi Trường Sơn */}
              <span
                className={
                  showBakedMasks
                    ? 'sr-only'
                    : 'absolute left-[46.5%] top-[37.5%] -translate-x-1/2 -translate-y-1/2 rotate-[40deg] text-[#FFFDF5] font-display font-extrabold text-[8px] sm:text-[11px] tracking-wide whitespace-nowrap drop-shadow-[0_1.5px_2px_rgba(12,38,20,0.95)]'
                }
                data-sovereignty-label="truong-son"
              >
                Dãy núi Trường Sơn
              </span>

              {/* Biển Đông */}
              <span
                className={
                  showBakedMasks
                    ? 'sr-only'
                    : 'absolute left-[79.5%] top-[64.5%] -translate-x-1/2 -translate-y-1/2 text-[#E8FAFF] font-display italic font-extrabold text-xs sm:text-lg tracking-wider whitespace-nowrap drop-shadow-[0_2px_4px_rgba(10,56,88,0.85)]'
                }
                data-sovereignty-label="bien-dong"
              >
                Biển Đông
              </span>

              {/* Quần đảo Hoàng Sa */}
              <span
                className="absolute left-[85.5%] top-[54.8%] -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#12628D]/85 border border-[#8AE0F5]/55 text-white font-display font-extrabold text-[8px] sm:text-[10.5px] tracking-tight whitespace-nowrap shadow-sm"
                data-sovereignty-label="hoang-sa"
              >
                Quần đảo Hoàng Sa
              </span>

              {/* Quần đảo Trường Sa */}
              <span
                className="absolute left-[86.5%] top-[88.2%] -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#12628D]/88 border border-[#8AE0F5]/55 text-white font-display font-extrabold text-[8px] sm:text-[10.5px] tracking-tight whitespace-nowrap shadow-sm"
                data-sovereignty-label="truong-sa"
              >
                Quần đảo Trường Sa
              </span>

              {/* Phú Quốc & Côn Đảo subtle labels on clean map */}
              {!showBakedMasks && (
                <>
                  <span className="absolute left-[17.8%] top-[81.5%] -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[#145C84]/75 text-[#F0FCFF] font-display font-bold text-[7.5px] sm:text-[9.5px] whitespace-nowrap shadow-sm">
                    Phú Quốc
                  </span>
                  <span className="absolute left-[38.2%] top-[94.6%] -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-[#145C84]/75 text-[#F0FCFF] font-display font-bold text-[7.5px] sm:text-[9.5px] whitespace-nowrap shadow-sm">
                    Côn Đảo
                  </span>
                </>
              )}
            </div>
          )}

          {/* LAYER 2: 3-Layer Smooth Catmull-Rom SVG Route (1024 x 572) */}
          <svg
            viewBox={`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <filter id="goldRouteGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Layer 2a: Full route faint white dashed */}
            <path
              d={fullPathD}
              fill="none"
              stroke="rgba(255,251,240,0.62)"
              strokeWidth="4.5"
              strokeDasharray="7 8"
              strokeLinecap="round"
            />

            {/* Layer 2b: Passed segments glowing solid gold */}
            {passedSegmentPaths.map((seg) => (
              <g key={seg.id}>
                <path
                  d={seg.d}
                  fill="none"
                  stroke="rgba(244, 195, 67, 0.55)"
                  strokeWidth="9.5"
                  strokeLinecap="round"
                  filter="url(#goldRouteGlow)"
                />
                <path
                  d={seg.d}
                  fill="none"
                  stroke="#F7D05A"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* Layer 2c: Gently pulsing upcoming segment */}
            {activeUpcomingSegmentD && (
              <path
                d={activeUpcomingSegmentD}
                fill="none"
                stroke="#FFF0A6"
                strokeWidth="5.5"
                strokeDasharray="9 8"
                strokeLinecap="round"
                className={reduceMotion ? '' : 'animate-pulse'}
              />
            )}

            {/* Hidden measurement path + glowing trail during walk animation */}
            {animSegD && (
              <>
                <path ref={walkPathRef} d={animSegD} fill="none" stroke="transparent" strokeWidth="1" />
                <path
                  d={animSegD}
                  fill="none"
                  stroke="#FFE478"
                  strokeWidth="6.5"
                  strokeLinecap="round"
                  filter="url(#goldRouteGlow)"
                />
              </>
            )}

            {/* Footstep dots during walk animation */}
            {footsteps.map((fs, idx) => (
              <circle
                key={fs.key}
                cx={fs.x}
                cy={fs.y}
                r={4.2}
                fill="#FFFBF0"
                stroke="#B9831E"
                strokeWidth="1.6"
                opacity={0.35 + (idx / Math.max(1, footsteps.length)) * 0.65}
              />
            ))}
          </svg>

          {/* LAYER 3: 10 Interactive HTML <button> Milestone Pins */}
          <div className="absolute inset-0 z-20">
            {JOURNEY_MILESTONES.map((m) => {
              const pos = effectiveCoords[m.id];
              const isPassed = !isMonitor && journey.passedMoc.includes(m.id);
              const isCurrent = !isMonitor && !freeMode && journey.currentMoc === m.id;
              const isUnlocked = isMonitor || canEnterMoc(m.id, journey, unlockAllDemo);
              const isLocked = !isUnlocked;
              const isSelected = selectedMocId === m.id;
              const st = journey.mocStatus[m.id];
              const bossDefeated = Boolean(st?.bossDefeated);
              const stars = st?.skillStars ?? (isPassed ? 2 : 0);
              const monitorCount = monitorMode?.studentCountsByMoc[m.id] ?? 0;

              const stateText = isMonitor
                ? `${monitorCount} học sinh đang ở mốc này`
                : isPassed
                  ? 'đã vượt qua'
                  : isCurrent
                    ? 'mốc hiện tại'
                    : isUnlocked
                      ? 'đã mở khóa'
                      : `đang khóa, hoàn thành Mốc ${m.id - 1} để mở`;

              return (
                <div
                  key={m.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{left: `${pos.x}%`, top: `${pos.y}%`, zIndex: isCurrent ? 35 : isSelected ? 32 : monitorCount > 0 ? 26 : 22}}
                >
                  <button
                    type="button"
                    onClick={() => onSelectMoc(m.id)}
                    aria-label={`Mốc ${m.id}: ${m.city} (${stateText})`}
                    aria-pressed={isSelected}
                    data-moc-id={m.id}
                    data-moc-state={isMonitor ? 'monitor' : isPassed ? 'passed' : isCurrent ? 'current' : isUnlocked ? 'unlocked' : 'locked'}
                    className={`group relative flex flex-col items-center justify-center focus:outline-none focus-visible:ring-4 focus-visible:ring-[#E0A93B] rounded-full transition-transform !min-h-0 ${
                      isSelected ? 'scale-110' : 'hover:scale-105'
                    }`}
                  >
                    {/* Active selection halo */}
                    {isSelected && (
                      <span className="absolute -inset-2 rounded-full border-2 border-[#FFFBF0] bg-[#E0A93B]/35 pointer-events-none" />
                    )}

                    {/* PIN ICON BY STATE */}
                    {isMonitor ? (
                      /* Teacher Monitoring Pin: shows student count right inside the pin! */
                      <div
                        className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 shadow-[0_3px_8px_rgba(20,40,74,0.45)] flex flex-col items-center justify-center leading-none transition-colors ${
                          monitorCount > 0
                            ? 'bg-[#1E8E78] border-[#FFFBF0] text-white'
                            : 'bg-[#FFFBF0] border-[#14284A] text-[#14284A]'
                        }`}
                      >
                        <span className="font-display font-extrabold text-xs sm:text-sm tabular-nums">
                          {monitorCount}
                        </span>
                        <span className="text-[7px] sm:text-[8px] font-extrabold uppercase opacity-90">
                          HS
                        </span>
                        <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-[#14284A] border border-[#FFFBF0] text-[#F8D258] text-[8px] font-extrabold flex items-center justify-center">
                          {m.id}
                        </span>
                      </div>
                    ) : isCurrent ? (
                      /* Large golden teardrop pin with open book + compass + red flag */
                      <div
                        className={`relative flex items-center justify-center ${
                          reduceMotion ? '' : 'animate-bounce'
                        }`}
                        style={{animationDuration: '2.4s'}}
                      >
                        <svg
                          viewBox="0 0 64 74"
                          className="w-11 h-12 sm:w-14 sm:h-16 drop-shadow-[0_4px_6px_rgba(20,40,74,0.45)]"
                          aria-hidden="true"
                        >
                          {/* Red victory flag on top */}
                          <line x1="36" y1="4" x2="36" y2="20" stroke="#7A241B" strokeWidth="2.6" strokeLinecap="round" />
                          <path d="M36 5 L55 11 L36 16 Z" fill="#D93B2B" stroke="#7A241B" strokeWidth="1.4" />
                          {/* Golden teardrop outer shell */}
                          <path
                            d="M32 72 C32 72 8 50 8 33 C8 19.7 18.7 9 32 9 C45.3 9 56 19.7 56 33 C56 50 32 72 32 72 Z"
                            fill="#F4B731"
                            stroke="#7C450E"
                            strokeWidth="3"
                          />
                          {/* Warm ivory inner disc */}
                          <circle cx="32" cy="33" r="18.5" fill="#FFFBF0" stroke="#C87E1A" strokeWidth="2.2" />
                          {/* Open book icon */}
                          <path
                            d="M19 36 C23 32 28 32 32 35 C36 32 41 32 45 36 L43 44 C39 41 35 41 32 43 C29 41 25 41 21 44 Z"
                            fill="#A77AE6"
                            stroke="#14284A"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M21 35 C25 32 29 32 32 35 C35 32 39 32 43 35 L42 41 C38 39 35 39 32 41 C29 39 26 39 22 41 Z"
                            fill="#FFFBF0"
                            stroke="#14284A"
                            strokeWidth="1.2"
                          />
                          <line x1="32" y1="35" x2="32" y2="43" stroke="#14284A" strokeWidth="1.2" />
                          {/* Mini compass caliper */}
                          <path d="M36 22 L31 35 M36 22 L41 35" stroke="#1F6A8A" strokeWidth="2" strokeLinecap="round" />
                          <circle cx="36" cy="21" r="2.2" fill="#E0A93B" stroke="#14284A" strokeWidth="1" />
                        </svg>
                      </div>
                    ) : isPassed ? (
                      /* Passed emerald-gold pin with check + mini red seal + optional BOSS crown */
                      <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1E8E78] border-2 border-[#FFFBF0] shadow-[0_2px_6px_rgba(20,40,74,0.45)] flex items-center justify-center text-[#FFFBF0]">
                        <Check className="w-4 h-4 stroke-[3]" />
                        {/* Mini red seal corner badge */}
                        <span
                          className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#C8392B] border border-[#FFFBF0] text-[7px] font-extrabold flex items-center justify-center text-white"
                          title="Đã đóng dấu mốc"
                        >
                          {m.id}
                        </span>
                        {/* Tiny crown if BOSS defeated */}
                        {bossDefeated && (
                          <Crown className="w-3.5 h-3.5 text-[#F7CF4D] fill-[#F7CF4D] drop-shadow absolute -top-2.5 left-1/2 -translate-x-1/2" />
                        )}
                        {/* Mini skill stars */}
                        {stars > 0 && (
                          <span className="absolute -top-2 -right-3 text-[8px] leading-none text-[#FFE270] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                            {'★'.repeat(Math.min(3, stars))}
                          </span>
                        )}
                      </div>
                    ) : isUnlocked ? (
                      /* Unlocked (e.g. demo mode or free mode) */
                      <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#E0A93B] border-2 border-[#FFFBF0] shadow-md flex items-center justify-center text-[#14284A] font-display font-extrabold text-xs">
                        {m.id}
                      </div>
                    ) : (
                      /* Locked stone-grey pin with padlock */
                      <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#64748B]/90 border-2 border-[#E2E8F0] shadow flex items-center justify-center text-[#F8FAFC]">
                        <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                    )}

                    {/* PIN LABEL PILL (masks baked artwork labels cleanly when hasBakedLabels is true) */}
                    <span
                      className={`absolute ${getLabelOffsetClass(m.id, isCurrent)} whitespace-nowrap font-display font-extrabold leading-tight rounded-lg border shadow-sm transition-colors pointer-events-none ${
                        isMonitor
                          ? isSelected
                            ? 'px-2 py-0.5 text-[9px] sm:text-xs bg-[#F8C846] text-[#14284A] border-[#8A4F0B] shadow-md'
                            : monitorCount > 0
                              ? 'px-1.5 py-0.5 text-[8.5px] sm:text-[11px] bg-[#E6F6F3] text-[#145B4F] border-[#1E8E78]'
                              : 'px-1.5 py-0.5 text-[8.5px] sm:text-[10.5px] bg-[#FFFBF0]/92 text-[#14284A] border-[#C9A86A]'
                          : isCurrent
                            ? 'px-2 py-0.5 text-[9.5px] sm:text-xs bg-[#F8C846] text-[#14284A] border-[#8A4F0B] shadow-md'
                            : isPassed
                              ? 'px-1.5 py-0.5 text-[8.5px] sm:text-[11px] bg-[#FFFBF0] text-[#145B4F] border-[#2E9C8A]'
                              : isLocked
                                ? showBakedMasks
                                  ? 'px-1.5 py-0.5 text-[8.5px] sm:text-[10.5px] bg-[#F5F7FA] text-[#475569] border-[#94A3B8]'
                                  : 'px-1.5 py-0.5 text-[8.5px] sm:text-[10.5px] bg-[#FFFBF0]/82 text-[#475569] border-[#CBD5E1]'
                                : 'px-1.5 py-0.5 text-[8.5px] sm:text-[11px] bg-[#FFF4D6] text-[#14284A] border-[#B9831E]'
                      }`}
                    >
                      {isMonitor
                        ? `${m.id}. ${m.displayLabel}${monitorCount > 0 ? ` (${monitorCount})` : ''}`
                        : isCurrent
                          ? `Cột mốc ${m.id}: ${m.displayLabel}`
                          : isPassed
                            ? `${m.id}. ${m.displayLabel} ✓`
                            : `${m.id}. ${m.displayLabel}`}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* LAYER 4: Live Chibi Avatar standing beside current milestone (student mode only) */}
          {!isMonitor && (
            <div
              className="absolute z-30 pointer-events-none -translate-x-1/2 -translate-y-3/4 transition-[left,top] duration-300"
              style={{
                left: `${avatarPos.xPct}%`,
                top: `${avatarPos.yPct}%`,
              }}
              data-testid="journey-map-avatar"
            >
              <div className="relative flex flex-col items-center">
                <div className="w-10 h-12 sm:w-14 sm:h-16 drop-shadow-[0_3px_4px_rgba(20,40,74,0.45)]">
                  <Avatar
                    appearance={avatar}
                    view={walkingPos ? 'side' : 'front'}
                    frame={walkingPos ? (Math.floor(walkingPos.progress * 14) % 2 === 0 ? 'walk1' : 'walk2') : 'idle'}
                    size={56}
                    className="w-full h-full"
                  />
                </div>
                <span className="w-6 h-1.5 rounded-full bg-[#14284A]/35 -mt-1 blur-[0.5px]" />
              </div>
            </div>
          )}

          {/* LAYER 5: Top-Left HTML/CSS Wooden Sign Logo "Toán Du Ký" */}
          <div
            className="absolute left-[1.4%] top-[1.6%] z-30 pointer-events-none"
            style={showBakedMasks ? {width: '27.6%', height: '24.2%'} : undefined}
            data-testid="journey-map-logo"
          >
            <div className="relative w-full h-full rounded-xl sm:rounded-2xl bg-gradient-to-b from-[#9E5E2E] via-[#7A431C] to-[#53290E] border-[2.5px] border-[#EFC66C] shadow-[0_6px_14px_rgba(16,24,38,0.45)] px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-center gap-2 sm:gap-2.5 overflow-hidden">
              {/* Subtle wood grain lines */}
              <div
                className="absolute inset-0 opacity-18 pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(8deg, transparent, transparent 7px, #2B1204 7px, #2B1204 9px)',
                }}
              />
              {/* Inner golden bevel frame */}
              <div className="absolute inset-1 rounded-lg sm:rounded-xl border border-[#F7D782]/40 pointer-events-none" />
              {/* Corner brass rivets */}
              <span className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-[#F7CF65]" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#F7CF65]" />
              <span className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-[#F7CF65]" />
              <span className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#F7CF65]" />

              {/* Mini math emblem */}
              <div className="relative z-10 shrink-0 w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-[#FFF4D6] border-2 border-[#D59B38] flex flex-col items-center justify-center text-[#14284A] shadow-inner">
                <span className="font-display font-extrabold text-xs sm:text-base leading-none text-[#C8392B]">
                  △
                </span>
                <span className="font-display font-extrabold text-[7.5px] sm:text-[10px] leading-none text-[#14284A] mt-0.5">
                  sin·cos
                </span>
              </div>

              <div className="relative z-10 min-w-0 text-left">
                <p className="font-display font-extrabold text-base sm:text-2xl lg:text-[26px] leading-none tracking-tight text-[#FFF4D6] drop-shadow-[0_2px_0_#3A1B08] whitespace-nowrap">
                  Toán Du Ký
                </p>
                <p className="text-[8px] sm:text-[10.5px] font-extrabold text-[#F9DE8A] tracking-wide uppercase mt-1 whitespace-nowrap">
                  Hành trình 10 mốc
                </p>
              </div>
            </div>
          </div>

          {/* LAYER 6: Bottom-Left Compass + Real % Golden Progress Bar */}
          <div
            className="absolute left-[1%] bottom-[1%] z-20 pointer-events-none"
            style={{width: '25.2%', minWidth: '156px'}}
            data-testid="journey-progress-hud"
          >
            <div className="flex items-end gap-1 sm:gap-1.5">
              {/* Code-drawn brass compass medallion */}
              <div className="shrink-0 w-10 h-10 sm:w-13 sm:h-13 rounded-full bg-gradient-to-b from-[#F4CA64] to-[#A66A20] p-1 shadow-[0_4px_8px_rgba(20,40,74,0.45)] border border-[#5B350B] flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-[#FFF7DF] border border-[#8A5A2B] flex items-center justify-center relative">
                  <Compass className="w-5 h-5 sm:w-7 sm:h-7 text-[#14284A]" />
                  <span className="absolute top-0.5 text-[6px] sm:text-[7px] font-extrabold text-[#C8392B]">
                    B
                  </span>
                </div>
              </div>

              {/* Real % golden progress bar (or Class Summary HUD in Teacher Monitor Mode) */}
              <div className="flex-1 mb-0.5 bg-[#4B2B12]/95 border-2 border-[#E6B856] rounded-xl px-2 py-1 shadow-md">
                {isMonitor ? (
                  <>
                    <div className="flex items-center justify-between text-[8.5px] sm:text-[10px] font-extrabold text-[#FFF4D6] leading-none mb-1 tabular-nums">
                      <span>Giám sát lớp</span>
                      <span className="text-[#F8D258]">{monitorMode?.totalStudents ?? 0} HS</span>
                    </div>
                    <p className="text-[7.5px] sm:text-[9px] font-bold text-[#F9DE8A] leading-tight">
                      Chạm vào từng mốc để xem DS học sinh
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[8.5px] sm:text-[10px] font-extrabold text-[#FFF4D6] leading-none mb-1 tabular-nums">
                      <span>{freeMode ? 'Tự do' : 'Tiến độ'}</span>
                      <span className="text-[#F8D258]">
                        {percent}% ({passedCount}/10)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#2B1707] border border-[#8F6024] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#E09B24] via-[#F7CE4E] to-[#FFF2A6] transition-all duration-500"
                        style={{width: `${percent}%`}}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* FLOATING CONTROLS OUTSIDE TRANSFORM (Always crisp & tappable) */}
        <div className="absolute top-2 right-2 z-40 flex items-center gap-1.5">
          {walkingPos && (
            <button
              type="button"
              onClick={skipWalkAnimation}
              className="px-2.5 py-1.5 rounded-xl bg-[#14284A]/90 text-[#FFFBF0] border border-[#E0A93B] text-[11px] font-bold flex items-center gap-1 shadow !min-h-[34px]"
            >
              <FastForward className="w-3.5 h-3.5 text-[#F7CE4E]" />
              Bỏ qua hiệu ứng
            </button>
          )}
          <button
            type="button"
            onClick={() => centerOnMoc(journey.currentMoc, isMobileViewport ? 1.9 : 1)}
            className="px-2.5 py-1.5 rounded-xl bg-[#FFFBF0]/95 text-[#14284A] border border-[#C9A86A] text-[11px] font-bold flex items-center gap-1 shadow hover:bg-[#FFF4D6] !min-h-[34px]"
            title="Về vị trí hiện tại"
          >
            <Crosshair className="w-3.5 h-3.5 text-[#18685B]" />
            <span className="hidden sm:inline">Về vị trí hiện tại</span>
          </button>
          <div className="flex items-center rounded-xl bg-[#FFFBF0]/95 border border-[#C9A86A] shadow overflow-hidden">
            <button
              type="button"
              onClick={() => adjustZoom(-0.35)}
              disabled={zoom <= 1}
              aria-label="Thu nhỏ bản đồ"
              className="p-1.5 text-[#14284A] disabled:opacity-40 hover:bg-[#FFF4D6] !min-h-[34px] !min-w-[32px] flex items-center justify-center"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => adjustZoom(0.35)}
              disabled={zoom >= 2.6}
              aria-label="Phóng to bản đồ"
              className="p-1.5 text-[#14284A] disabled:opacity-40 hover:bg-[#FFF4D6] border-l border-[#E2CFA3] !min-h-[34px] !min-w-[32px] flex items-center justify-center"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* Mobile pan/zoom hint bar outside map canvas so bottom pins are never obscured */}
      {isMobileViewport && (
        <div className="px-3 py-1 bg-[#14284A]/92 text-[#FFFBF0] text-[10.5px] font-semibold text-center">
          Kéo & chụm 2 ngón để xem toàn bộ 10 mốc trên bản đồ
        </div>
      )}
    </div>
  );
};

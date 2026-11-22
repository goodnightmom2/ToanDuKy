import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Compass,
  Flag,
  Map as MapIcon,
  Swords,
} from 'lucide-react';
import {renderAvatarToCanvas} from '../components/Avatar.tsx';
import {BOSSES, STATIONS_BY_ID} from '../config.ts';
import {JOURNEY_MILESTONES_BY_ID} from '../journey.ts';
import {dataService} from '../services/dataService.ts';
import type {AvatarFrame, AvatarView, MocId, StationId, UserAccount} from '../types.ts';
import {soundEngine} from '../utils/audio.ts';

interface StationSceneProps {
  user: UserAccount;
  stationId: StationId;
  mocId?: MocId;
  onStartMission: () => void;
  onStartBoss: () => void;
  onBackToMap: () => void;
  onToggleEasyMove: () => void;
}

interface WorldRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'solid' | 'jumpable' | 'gate';
  label: string;
}

interface Hotspot {
  id: 'A' | 'B' | 'NPC' | 'BOSS';
  x: number;
  y: number;
  label: string;
  color: string;
}

const WORLD_W = 860;
const WORLD_H = 440;

const OBSTACLES: WorldRect[] = [
  {id: 'rock1', x: 310, y: 240, w: 46, h: 36, kind: 'solid', label: 'Đá ven bờ'},
  {id: 'log1', x: 430, y: 315, w: 54, h: 24, kind: 'jumpable', label: 'Khúc gỗ (nhảy qua)'},
  {id: 'gate1', x: 560, y: 268, w: 28, h: 74, kind: 'gate', label: 'Cổng Toán (có lối vòng phía dưới)'},
];

const HOTSPOTS: Hotspot[] = [
  {id: 'NPC', x: 115, y: 300, label: 'Thầy hướng dẫn', color: '#E0A93B'},
  {id: 'A', x: 220, y: 290, label: 'Điểm khảo sát A', color: '#2E9C8A'},
  {id: 'B', x: 660, y: 290, label: 'Điểm khảo sát B', color: '#3B5F8F'},
  {id: 'BOSS', x: 775, y: 290, label: 'Đài thử thách BOSS', color: '#C8392B'},
];

export const StationScene: React.FC<StationSceneProps> = ({
  user,
  stationId,
  mocId,
  onStartMission,
  onStartBoss,
  onBackToMap,
  onToggleEasyMove,
}) => {
  const station = STATIONS_BY_ID[stationId];
  const mocDef = mocId ? JOURNEY_MILESTONES_BY_ID[mocId] : null;
  const boss = mocDef
    ? mocDef.bossId
      ? BOSSES[mocDef.bossId]
      : null
    : BOSSES[station.bossId];
  const canFightBoss = mocId
    ? dataService.canUserChallengeMocBoss(user.uid, mocId)
    : Boolean(boss);
  const sceneTheme = mocDef?.sceneTheme ?? {
    skyTop: '#E8F0DA',
    hillColor: '#B8D4A4',
    waterColor: '#6CC2DC',
    groundColor: '#D9E5B8',
    trailColor: '#F7E7B8',
    farLabel: 'Điểm C (bên kia sông)',
    npcTitle: 'Người hướng dẫn',
  };
  const sceneTitle = mocDef ? `Mốc ${mocDef.id}: ${mocDef.city} — ${mocDef.sceneName}` : station.name;

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const keysRef = React.useRef<Set<string>>(new Set());
  const dpadRef = React.useRef<{dx: number; dy: number}>({dx: 0, dy: 0});
  const jumpQueuedRef = React.useRef(false);
  const avatarRef = React.useRef(user.avatar);
  avatarRef.current = user.avatar;

  const playerRef = React.useRef({
    x: 165,
    y: 318,
    z: 0, // jump altitude
    vz: 0,
    facing: 'front' as AvatarView,
    walkDist: 0,
    gateUnlocked: false,
  });

  const [nearbySpot, setNearbySpot] = React.useState<Hotspot | null>(null);
  const [npcDialogue, setNpcDialogue] = React.useState<string>(
    `Chào ${user.displayName}! Em đang ở ${sceneTitle}. Di chuyển tới Điểm A, Điểm B — hoặc bấm nút Làm nhiệm vụ bên dưới bất cứ lúc nào.`,
  );
  const [gateModalOpen, setGateModalOpen] = React.useState(false);
  const [gateChoice, setGateChoice] = React.useState('');

  // Reset keys on blur/visibility change to prevent stuck movement
  React.useEffect(() => {
    const clearInputs = () => {
      keysRef.current.clear();
      dpadRef.current = {dx: 0, dy: 0};
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space' && !e.repeat) {
        jumpQueuedRef.current = true;
      }
      if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) {
        triggerInteract();
      }
      keysRef.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', clearInputs);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', clearInputs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbySpot]);

  const jumpToHotspot = (spotId: Hotspot['id']) => {
    const spot = HOTSPOTS.find((h) => h.id === spotId);
    if (!spot) return;
    playerRef.current.x = spot.x;
    playerRef.current.y = Math.min(395, spot.y + 24);
    playerRef.current.z = 0;
    soundEngine.playStep();
    if (spotId === 'A') {
      setNpcDialogue('Em đã đến Điểm khảo sát A trên bờ! Bấm "Làm nhiệm vụ khảo sát" để đo góc và lập tam giác.');
    } else if (spotId === 'B') {
      setNpcDialogue('Em đã đến Điểm khảo sát B cách A đúng 60 m (mô phỏng). Từ đây có thể ngắm góc sang điểm C bên kia sông.');
    } else if (spotId === 'BOSS') {
      if (!boss) {
        setNpcDialogue('Mốc này không có BOSS — hoàn thành Nhiệm vụ mốc là em mở ngay mốc kế tiếp!');
      } else if (!canFightBoss) {
        setNpcDialogue(`Hoàn thành nhiệm vụ mốc trước để mở khóa đài thử thách ${boss.name}!`);
      } else {
        setNpcDialogue(`Em đang đứng trước đài thử thách ${boss.name}. Bấm "Vào đấu BOSS" khi sẵn sàng nhé!`);
      }
    }
  };

  const triggerInteract = () => {
    const p = playerRef.current;
    // Check Math Gate proximity
    const gate = OBSTACLES.find((o) => o.kind === 'gate');
    if (gate && !p.gateUnlocked && Math.hypot(p.x - (gate.x + gate.w / 2), p.y - (gate.y + gate.h / 2)) < 68) {
      setGateModalOpen(true);
      return;
    }
    if (!nearbySpot) return;
    if (nearbySpot.id === 'NPC') {
      const line = `Mẹo từ ${sceneTheme.npcTitle}: Em có thể đi vòng phía dưới Cổng Toán hoặc giải câu hỏi nhanh để mở cổng. Sai không bao giờ bị trừ điểm!`;
      setNpcDialogue(line);
    } else if (nearbySpot.id === 'A' || nearbySpot.id === 'B') {
      onStartMission();
    } else if (nearbySpot.id === 'BOSS') {
      if (!boss) {
        setNpcDialogue('Mốc này không có BOSS — hãy hoàn thành Nhiệm vụ mốc để đi tiếp!');
      } else if (!canFightBoss) {
        setNpcDialogue('Hoàn thành nhiệm vụ để mở BOSS nhé!');
      } else {
        onStartBoss();
      }
    }
  };

  // Main Canvas 2D ~30 fps throttled rAF loop with clamped dt
  React.useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let accumRender = 0;
    const TARGET_FRAME_MS = 1000 / 32; // Smooth ~30fps mobile target

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      // Update player movement
      const p = playerRef.current;
      const keys = keysRef.current;
      let dx = dpadRef.current.dx;
      let dy = dpadRef.current.dy;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;

      const len = Math.hypot(dx, dy);
      const speed = user.preferences.easyMove ? 210 : 165;
      if (len > 0.01) {
        dx /= len;
        dy /= len;
        const nextX = Math.max(36, Math.min(WORLD_W - 36, p.x + dx * speed * dt));
        // River occupies y < 218
        const nextY = Math.max(228, Math.min(WORLD_H - 22, p.y + dy * speed * dt));

        // Collision check against obstacles
        let blocked = false;
        for (const obs of OBSTACLES) {
          if (obs.kind === 'gate' && p.gateUnlocked) continue;
          if (obs.kind === 'jumpable' && p.z > 14) continue;
          const hitX = nextX + 16 > obs.x && nextX - 16 < obs.x + obs.w;
          const hitY = nextY > obs.y && nextY - 22 < obs.y + obs.h;
          if (hitX && hitY) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          p.x = nextX;
          p.y = nextY;
          p.walkDist += speed * dt;
        }
        p.facing = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'back' : 'front';
      }

      // Jump physics (edge-triggered)
      if (jumpQueuedRef.current && p.z === 0) {
        p.vz = 260;
        jumpQueuedRef.current = false;
        soundEngine.playStep();
      } else {
        jumpQueuedRef.current = false;
      }
      if (p.z > 0 || p.vz > 0) {
        p.z += p.vz * dt;
        p.vz -= 780 * dt;
        if (p.z <= 0) {
          p.z = 0;
          p.vz = 0;
        }
      }

      // Nearby hotspot detection
      let closest: Hotspot | null = null;
      let minDist = 72;
      for (const h of HOTSPOTS) {
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (d < minDist) {
          minDist = d;
          closest = h;
        }
      }
      setNearbySpot((prev) => (prev?.id === closest?.id ? prev : closest));

      accumRender += rawDt * 1000;
      if (accumRender < TARGET_FRAME_MS) return;
      accumRender = 0;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear & draw sky/far bank
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = sceneTheme.skyTop;
      ctx.fillRect(0, 0, WORLD_W, 120);

      // Far bank hills + Landmark C across the river
      ctx.fillStyle = sceneTheme.hillColor;
      ctx.beginPath();
      ctx.moveTo(0, 120);
      ctx.quadraticCurveTo(180, 48, 360, 105);
      ctx.quadraticCurveTo(540, 38, 720, 96);
      ctx.lineTo(WORLD_W, 85);
      ctx.lineTo(WORLD_W, 125);
      ctx.lineTo(0, 125);
      ctx.fill();

      // Point C marker on the opposite bank
      const cx = 468;
      const cy = 96;
      ctx.fillStyle = '#C8392B';
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFBF0';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#14284A';
      ctx.font = 'bold 14px "Be Vietnam Pro", sans-serif';
      ctx.fillText(sceneTheme.farLabel, cx - 72, cy - 18);

      // River strip
      ctx.fillStyle = sceneTheme.waterColor;
      ctx.fillRect(0, 120, WORLD_W, 96);
      ctx.strokeStyle = 'rgba(255,251,240,0.55)';
      ctx.lineWidth = 2.5;
      const waveShift = user.preferences.reduceMotion ? 0 : (now * 0.02) % 60;
      for (let wy = 142; wy <= 196; wy += 26) {
        ctx.beginPath();
        for (let wx = -60; wx < WORLD_W + 60; wx += 60) {
          ctx.moveTo(wx + waveShift, wy);
          ctx.quadraticCurveTo(wx + 15 + waveShift, wy - 5, wx + 30 + waveShift, wy);
        }
        ctx.stroke();
      }

      // Near bank grass & sandy survey trail
      ctx.fillStyle = sceneTheme.groundColor;
      ctx.fillRect(0, 216, WORLD_W, WORLD_H - 216);
      ctx.fillStyle = sceneTheme.trailColor;
      ctx.fillRect(0, 275, WORLD_W, 84);
      ctx.strokeStyle = '#CBB17D';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 275, WORLD_W, 84);

      // Dashed survey sightlines A-B-C
      ctx.save();
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(20,40,74,0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(220, 290);
      ctx.lineTo(660, 290);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Obstacles
      for (const obs of OBSTACLES) {
        if (obs.kind === 'gate' && p.gateUnlocked) continue;
        ctx.save();
        if (obs.kind === 'solid') {
          ctx.fillStyle = '#7E8A97';
          ctx.strokeStyle = '#14284A';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 12);
          ctx.fill();
          ctx.stroke();
        } else if (obs.kind === 'jumpable') {
          ctx.fillStyle = '#8A5A3B';
          ctx.strokeStyle = '#14284A';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8);
          ctx.fill();
          ctx.stroke();
        } else if (obs.kind === 'gate') {
          ctx.fillStyle = '#E0A93B';
          ctx.strokeStyle = '#14284A';
          ctx.lineWidth = 3;
          ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
          ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
          ctx.fillStyle = '#14284A';
          ctx.font = 'bold 11px "Be Vietnam Pro", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Cổng Toán', obs.x + obs.w / 2, obs.y - 8);
          ctx.fillStyle = '#1F7A6B';
          ctx.fillText('↓ Lối vòng mở', obs.x + obs.w / 2, obs.y + obs.h + 24);
          ctx.textAlign = 'left';
        }
        ctx.restore();
      }

      // Hotspots
      for (const h of HOTSPOTS) {
        ctx.save();
        ctx.fillStyle = h.color;
        ctx.strokeStyle = '#14284A';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFFBF0';
        ctx.font = 'bold 13px "Baloo 2", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(h.id === 'BOSS' ? 'B' : h.id === 'NPC' ? '?' : h.id, h.x, h.y + 5);

        // Draw crisp pill tag below the marker so player avatar standing above never covers the label
        ctx.font = 'bold 11px "Be Vietnam Pro", sans-serif';
        const tw = ctx.measureText(h.label).width + 14;
        ctx.fillStyle = 'rgba(255,251,240,0.92)';
        ctx.strokeStyle = '#CBB17D';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(h.x - tw / 2, h.y + 22, tw, 20, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#14284A';
        ctx.fillText(h.label, h.x, h.y + 36);
        ctx.restore();
      }

      // Shadow & Chibi Avatar rendered from unified SVG sprite cache
      ctx.save();
      ctx.fillStyle = 'rgba(20,40,74,0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const animFrame: AvatarFrame =
        len > 0.01 ? (Math.floor(p.walkDist / 24) % 2 === 0 ? 'walk1' : 'walk2') : 'idle';
      renderAvatarToCanvas(ctx, avatarRef.current, p.facing, animFrame, p.x, p.y - p.z, 62, 84);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [user.avatar, user.preferences.easyMove, user.preferences.reduceMotion]);

  const setDpad = (dx: number, dy: number) => {
    dpadRef.current = {dx, dy};
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3">
      {/* Top Scene Bar */}
      <div className="notebook-card p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold uppercase text-[#18685B]">
            Cảnh khám phá 2D · {mocDef ? `Mốc ${mocDef.id} · ${mocDef.city}` : station.region}
          </p>
          <h1 className="font-display text-xl font-extrabold text-[#14284A]">{sceneTitle}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleEasyMove}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 !min-h-[38px] ${
              user.preferences.easyMove
                ? 'bg-[#1D7A6A] text-white border-[#145B4F]'
                : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
            }`}
          >
            Di chuyển dễ: {user.preferences.easyMove ? 'BẬT' : 'TẮT'}
          </button>
          <button type="button" onClick={onBackToMap} className="btn-tactile btn-paper text-xs py-2 px-3">
            <MapIcon className="w-4 h-4" />
            Về bản đồ
          </button>
        </div>
      </div>

      {/* Isolated Canvas 2D Viewport (zero backdrop-filter!) */}
      <div ref={containerRef} className="notebook-card p-2 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={WORLD_W}
          height={WORLD_H}
          className="w-full h-auto block rounded-xl border border-[#CBB17D] bg-[#E8F0DA]"
        />
      </div>

      {/* Quick-Jump Bar + NPC Bubble */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7 notebook-card p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-[#14284A] leading-relaxed font-medium">{npcDialogue}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => jumpToHotspot('A')} className="btn-tactile btn-paper text-xs py-2 px-3">
              <Flag className="w-3.5 h-3.5 text-[#2E9C8A]" />
              Đi nhanh Điểm A
            </button>
            <button type="button" onClick={() => jumpToHotspot('B')} className="btn-tactile btn-paper text-xs py-2 px-3">
              <Flag className="w-3.5 h-3.5 text-[#3B5F8F]" />
              Đi nhanh Điểm B
            </button>
            <button type="button" onClick={onStartMission} className="btn-tactile btn-jade text-xs py-2 px-3.5">
              <Compass className="w-4 h-4" />
              Làm nhiệm vụ khảo sát
            </button>
            {boss && (
              <button
                type="button"
                disabled={!canFightBoss}
                onClick={onStartBoss}
                title={canFightBoss ? undefined : 'Hoàn thành nhiệm vụ để mở BOSS'}
                className={`btn-tactile text-xs py-2 px-3.5 ${
                  canFightBoss
                    ? 'btn-ink'
                    : 'bg-[#E2E8F0] text-[#64748B] border-2 border-[#CBD5E1] cursor-not-allowed shadow-none'
                }`}
              >
                <Swords className="w-4 h-4 text-[#E0A93B]" />
                {canFightBoss ? `Đấu BOSS (${boss.name})` : 'Hoàn thành nhiệm vụ để mở BOSS'}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Touch Controls (D-Pad + Jump + Interact) — clean fit at 360px */}
        <div className="lg:col-span-5 notebook-card-warm p-3 flex items-center justify-between gap-2.5">
          <div className="grid grid-cols-3 gap-1 w-[138px] shrink-0">
            <div />
            <button
              type="button"
              onPointerDown={() => setDpad(0, -1)}
              onPointerUp={() => setDpad(0, 0)}
              onPointerLeave={() => setDpad(0, 0)}
              className="btn-tactile btn-paper !p-0 w-11 h-11"
              aria-label="Đi lên"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
            <div />
            <button
              type="button"
              onPointerDown={() => setDpad(-1, 0)}
              onPointerUp={() => setDpad(0, 0)}
              onPointerLeave={() => setDpad(0, 0)}
              className="btn-tactile btn-paper !p-0 w-11 h-11"
              aria-label="Đi sang trái"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onPointerDown={() => setDpad(0, 1)}
              onPointerUp={() => setDpad(0, 0)}
              onPointerLeave={() => setDpad(0, 0)}
              className="btn-tactile btn-paper !p-0 w-11 h-11"
              aria-label="Đi xuống"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
            <button
              type="button"
              onPointerDown={() => setDpad(1, 0)}
              onPointerUp={() => setDpad(0, 0)}
              onPointerLeave={() => setDpad(0, 0)}
              className="btn-tactile btn-paper !p-0 w-11 h-11"
              aria-label="Đi sang phải"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={triggerInteract}
              className="btn-tactile btn-gold text-xs sm:text-sm w-full !px-2.5"
            >
              {nearbySpot ? `Mở: ${nearbySpot.label}` : 'Tương tác [E]'}
            </button>
            <button
              type="button"
              onClick={() => {
                jumpQueuedRef.current = true;
              }}
              className="btn-tactile btn-paper text-xs sm:text-sm w-full !px-2.5"
            >
              Nhảy [Space]
            </button>
          </div>
        </div>
      </div>

      {/* Optional Math Gate quick riddle modal */}
      {gateModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#14284A]/55 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="notebook-card max-w-md w-full p-5 space-y-3">
            <h2 className="font-display text-xl font-bold text-[#14284A]">Cổng Toán ven bờ</h2>
            <p className="text-sm text-[#1B2A41]">
              Trả lời nhanh để mở cổng và nhận thưởng <strong className="text-[#1F7A6B]">+5 XP khám phá</strong> (hoặc đóng để đi lối vòng phía dưới): Trong tam giác ABC, tổng ∠A + ∠B + ∠C bằng bao nhiêu độ?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {['90°', '180°', '360°'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setGateChoice(opt);
                    if (opt === '180°') {
                      playerRef.current.gateUnlocked = true;
                      const bonus = dataService.awardOnce(
                        user.uid,
                        `gate_bonus_moc_${mocId ?? 1}`,
                        {xp: 5},
                      );
                      soundEngine.playCorrect();
                      setGateModalOpen(false);
                      setNpcDialogue(
                        bonus.granted
                          ? 'Tuyệt vời! Em đã mở Cổng Toán thành công với tổng ba góc 180° và nhận thưởng +5 XP khám phá!'
                          : 'Em đã mở Cổng Toán thành công với tổng ba góc bằng 180°!',
                      );
                    } else {
                      soundEngine.playGentleHint();
                    }
                  }}
                  className="btn-tactile btn-paper text-sm"
                >
                  {opt}
                </button>
              ))}
            </div>
            {gateChoice && gateChoice !== '180°' && (
              <p className="text-xs font-semibold text-[#8A5108]">
                Gợi ý: Tổng ba góc của mọi tam giác phẳng luôn là 180°. Thử lại nhé!
              </p>
            )}
            <button type="button" onClick={() => setGateModalOpen(false)} className="btn-tactile btn-paper w-full text-xs">
              Đi lối vòng phía dưới
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

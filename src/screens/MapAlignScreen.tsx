import React from 'react';
import {ArrowLeft, CheckCircle2, MapPin, RotateCcw, Save} from 'lucide-react';
import {VietnamFallbackMapSvg} from '../components/VietnamFallbackMapSvg.tsx';
import {
  buildSmoothJourneySvgPath,
  getEffectivePinCoords,
  JOURNEY_MILESTONES,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
  pinPercentToSvgPoint,
} from '../journey.ts';
import {dataService} from '../services/dataService.ts';
import type {MapPinCoords, MocId, UserAccount} from '../types.ts';

interface MapAlignScreenProps {
  user: UserAccount;
  onBack: () => void;
  onSaved: () => void;
}

export const MapAlignScreen: React.FC<MapAlignScreenProps> = ({user, onBack, onSaved}) => {
  const settings = dataService.getSettings();
  const [coords, setCoords] = React.useState<Record<MocId, MapPinCoords>>(() =>
    getEffectivePinCoords(settings.mapPinOverrides),
  );
  const [draggingId, setDraggingId] = React.useState<MocId | null>(null);
  const [bgTier, setBgTier] = React.useState<'uploaded' | 'public' | 'svg'>(() =>
    settings.mapBackgroundDataUrl ? 'uploaded' : 'public',
  );
  const [statusMsg, setStatusMsg] = React.useState('');
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  const svgPoints = React.useMemo(
    () => JOURNEY_MILESTONES.map((m) => pinPercentToSvgPoint(coords[m.id])),
    [coords],
  );
  const pathD = React.useMemo(() => buildSmoothJourneySvgPath(svgPoints), [svgPoints]);

  const updateFromClientPoint = (mocId: MocId, clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const xPct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(2, Math.min(98, ((clientY - rect.top) / rect.height) * 100));
    setCoords((prev) => ({
      ...prev,
      [mocId]: {
        x: Number(xPct.toFixed(1)),
        y: Number(yPct.toFixed(1)),
      },
    }));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingId) return;
    updateFromClientPoint(draggingId, e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setDraggingId(null);
  };

  const handleResetDefaults = () => {
    setCoords(getEffectivePinCoords(undefined));
    setStatusMsg('Đã khôi phục tọa độ mặc định (bấm "Lưu tọa độ" để áp dụng).');
  };

  const handleSave = () => {
    const ok = dataService.adminSaveMapAlignment(user, coords);
    if (ok) {
      setStatusMsg('Đã lưu tọa độ 10 ghim bản đồ vào cài đặt hệ thống (settings/app).');
      onSaved();
    } else {
      setStatusMsg('Không thể lưu: tài khoản không có quyền quản trị viên.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
      <div className="notebook-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase text-[#18685B]">
            Quản trị · Công cụ căn chỉnh bản đồ (#/admin/map-align)
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[#14284A]">
            Căn chỉnh vị trí 10 ghim cột mốc
          </h1>
          <p className="text-xs text-[#5B6B82]">
            Kéo thả từng ghim trực tiếp trên bản đồ hoặc nhập số phần trăm (x%, y%) rồi bấm "Lưu tọa độ".
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleResetDefaults} className="btn-tactile btn-paper text-xs py-2 px-3">
            <RotateCcw className="w-4 h-4" /> Đặt lại mặc định
          </button>
          <button type="button" onClick={handleSave} className="btn-tactile btn-jade text-xs py-2 px-4">
            <Save className="w-4 h-4" /> Lưu tọa độ
          </button>
          <button type="button" onClick={onBack} className="btn-tactile btn-gold text-xs py-2 px-3">
            <ArrowLeft className="w-4 h-4" /> Quay lại Quản trị
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#145B4F] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Draggable Map Canvas */}
        <div className="lg:col-span-8 notebook-card p-3">
          <div
            ref={stageRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-full aspect-[16/9] rounded-2xl border-2 border-[#C9A86A] overflow-hidden bg-[#2E94B9] select-none touch-none"
          >
            {bgTier === 'uploaded' && settings.mapBackgroundDataUrl ? (
              <img
                src={settings.mapBackgroundDataUrl}
                alt="Nền bản đồ căn chỉnh"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover pointer-events-none"
                draggable={false}
                onError={() => setBgTier('public')}
              />
            ) : bgTier === 'public' ? (
              <img
                src="/journey-map.jpg"
                alt="Nền bản đồ căn chỉnh"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover pointer-events-none"
                draggable={false}
                onError={() => setBgTier('svg')}
              />
            ) : (
              <VietnamFallbackMapSvg className="w-full h-full pointer-events-none" />
            )}

            {/* Smooth route preview */}
            <svg
              viewBox={`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`}
              className="absolute inset-0 w-full h-full pointer-events-none"
              preserveAspectRatio="none"
            >
              <path
                d={pathD}
                fill="none"
                stroke="#F7CE4E"
                strokeWidth="4.5"
                strokeDasharray="8 6"
                strokeLinecap="round"
              />
            </svg>

            {/* 10 Draggable Pins */}
            {JOURNEY_MILESTONES.map((m) => {
              const pos = coords[m.id];
              const isDragging = draggingId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraggingId(m.id);
                    updateFromClientPoint(m.id, e.clientX, e.clientY);
                  }}
                  style={{left: `${pos.x}%`, top: `${pos.y}%`}}
                  aria-label={`Kéo ghim Mốc ${m.id}: ${m.city}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing !min-h-0 ${
                    isDragging ? 'z-40 scale-125' : 'z-20 hover:scale-110'
                  }`}
                >
                  <span className="w-7 h-7 rounded-full bg-[#C8392B] text-white border-2 border-[#FFFBF0] shadow-md font-display font-extrabold text-xs flex items-center justify-center">
                    {m.id}
                  </span>
                  <span className="mt-0.5 px-1.5 py-0.5 rounded bg-[#14284A]/90 text-[#FFFBF0] text-[9.5px] font-bold whitespace-nowrap pointer-events-none">
                    {m.displayLabel} ({pos.x}%, {pos.y}%)
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Numeric Coordinate Fine-Tune Table */}
        <div className="lg:col-span-4 notebook-card-warm p-4 space-y-2.5">
          <h2 className="font-display text-base font-extrabold text-[#14284A] flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#C8392B]" /> Tọa độ phần trăm (x%, y%)
          </h2>
          <div className="space-y-1.5">
            {JOURNEY_MILESTONES.map((m) => {
              const pos = coords[m.id];
              return (
                <div
                  key={m.id}
                  className="p-2 rounded-xl bg-[#FFFBF0] border border-[#D9C293] flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-bold text-[#14284A] truncate">
                    {m.id}. {m.displayLabel}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label className="flex items-center gap-1">
                      <span className="text-[10px] text-[#5B6B82]">x</span>
                      <input
                        type="number"
                        step={0.1}
                        min={2}
                        max={98}
                        value={pos.x}
                        onChange={(e) =>
                          setCoords((prev) => ({
                            ...prev,
                            [m.id]: {...prev[m.id], x: Number(e.target.value) || 0},
                          }))
                        }
                        className="w-16 px-1.5 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-bold tabular-nums"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="text-[10px] text-[#5B6B82]">y</span>
                      <input
                        type="number"
                        step={0.1}
                        min={2}
                        max={98}
                        value={pos.y}
                        onChange={(e) =>
                          setCoords((prev) => ({
                            ...prev,
                            [m.id]: {...prev[m.id], y: Number(e.target.value) || 0},
                          }))
                        }
                        className="w-16 px-1.5 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-bold tabular-nums"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

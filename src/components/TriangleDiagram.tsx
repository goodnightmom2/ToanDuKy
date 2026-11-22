import React from 'react';
import {RotateCcw, RotateCw} from 'lucide-react';
import {
  footOfPerpendicularCH,
  rotatePointXZ,
  solveTriangleFromCoords,
  type Vec3XZ,
} from '../math/geometry.ts';

interface TriangleDiagramProps {
  vertices: [string, string, string];
  coords: [Vec3XZ, Vec3XZ, Vec3XZ];
  highlightSide?: [number, number];
  highlightAngleIndex?: number;
  showPerpendicularH?: boolean;
  interactiveMode?: 'tap_vertex' | 'view_only' | 'measure';
  selectedVertex?: string;
  onSelectVertex?: (vertex: string) => void;
  labels?: {
    AB?: string;
    BC?: string;
    AC?: string;
    A?: string;
    B?: string;
    C?: string;
  };
  allowRotate?: boolean;
  showRiverBank?: boolean;
}

export const TriangleDiagram: React.FC<TriangleDiagramProps> = ({
  vertices,
  coords,
  highlightSide,
  highlightAngleIndex,
  showPerpendicularH = false,
  interactiveMode = 'view_only',
  selectedVertex,
  onSelectVertex,
  labels = {},
  allowRotate = true,
  showRiverBank = false,
}) => {
  const [yawDeg, setYawDeg] = React.useState(showRiverBank ? -18 : 0);
  const [view3d, setView3d] = React.useState(showRiverBank);
  const [pitchDeg, setPitchDeg] = React.useState(36);

  const solved = React.useMemo(
    () => solveTriangleFromCoords(coords[0], coords[1], coords[2]),
    [coords],
  );

  const projected = React.useMemo(() => {
    const rawPts: Vec3XZ[] = [coords[0], coords[1], coords[2]];
    const hFoot = footOfPerpendicularCH(coords[0], coords[1], coords[2]);

    const xs0 = rawPts.map((p) => p[0]);
    const zs0 = rawPts.map((p) => p[2]);
    const cx0 = (Math.min(...xs0) + Math.max(...xs0)) / 2;
    const cz0 = (Math.min(...zs0) + Math.max(...zs0)) / 2;
    const baseSpan = Math.max(
      Math.max(...xs0) - Math.min(...xs0),
      Math.max(...zs0) - Math.min(...zs0),
      1,
    );

    const w = 320;
    const h = 230;

    if (view3d) {
      // True 3D perspective projection (world x, y=elevation, z=depth)
      const yawRad = (yawDeg * Math.PI) / 180;
      const pitchRad = (pitchDeg * Math.PI) / 180;
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const cosP = Math.cos(pitchRad);
      const sinP = Math.sin(pitchRad);
      const camDist = baseSpan * 2.4;
      const focal = baseSpan * 2.15;
      const unitScale = 155 / baseSpan;

      const project3D = (wx: number, wy: number, wz: number): [number, number] => {
        const dx = wx - cx0;
        const dz = wz - cz0;
        // Rotate around vertical Y axis (yaw)
        const rx = dx * cosY - dz * sinY;
        const rz = dx * sinY + dz * cosY;
        // Tilt camera around X axis (pitch)
        const ry = wy * cosP - rz * sinP;
        const rz2 = wy * sinP + rz * cosP;
        const depth = Math.max(baseSpan * 0.45, camDist - rz2);
        const persp = focal / depth;
        return [w / 2 + rx * persp * unitScale, h / 2 + 24 - ry * persp * unitScale];
      };

      const pts3 = rawPts.map((p) => project3D(p[0], 0, p[2])) as [
        [number, number],
        [number, number],
        [number, number],
      ];
      const footH3 = project3D(hFoot[0], 0, hFoot[2]);
      const mastHeight = baseSpan * 0.24;
      const postHeight = baseSpan * 0.12;
      const mastTopC = project3D(rawPts[2][0], mastHeight, rawPts[2][2]);
      const postTopA = project3D(rawPts[0][0], postHeight, rawPts[0][2]);
      const postTopB = project3D(rawPts[1][0], postHeight, rawPts[1][2]);

      // Ground plane & river strip corners in 3D world space
      const padWorld = baseSpan * 0.42;
      const gx0 = Math.min(...xs0) - padWorld;
      const gx1 = Math.max(...xs0) + padWorld;
      const gzBank0 = Math.min(...zs0) - baseSpan * 0.18;
      const gzRiver0 = Math.min(...zs0) + baseSpan * 0.14;
      const gzRiver1 = Math.max(...zs0) - baseSpan * 0.12;
      const gzFar1 = Math.max(...zs0) + baseSpan * 0.24;

      const groundPoly = [
        project3D(gx0, 0, gzBank0),
        project3D(gx1, 0, gzBank0),
        project3D(gx1, 0, gzFar1),
        project3D(gx0, 0, gzFar1),
      ];
      const riverPoly = [
        project3D(gx0, -0.5, gzRiver0),
        project3D(gx1, -0.5, gzRiver0),
        project3D(gx1, -0.5, gzRiver1),
        project3D(gx0, -0.5, gzRiver1),
      ];

      return {
        pts: pts3,
        footH: footH3,
        mastTopC,
        postTopA,
        postTopB,
        groundPoly,
        riverPoly,
      };
    }

    const rotated = rawPts.map((p) => rotatePointXZ(p, yawDeg));
    const rotatedH = rotatePointXZ(hFoot, yawDeg);

    const all = showPerpendicularH ? [...rotated, rotatedH] : rotated;
    const xs = all.map((p) => p[0]);
    const zs = all.map((p) => p[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const span = Math.max(maxX - minX, maxZ - minZ, 1);

    const pad = 48;
    const scale = Math.min((w - pad * 2) / span, (h - pad * 2) / span);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const toSvg = (p: Vec3XZ): [number, number] => [
      w / 2 + (p[0] - cx) * scale,
      h / 2 - (p[2] - cz) * scale, // +Z points upward on map
    ];

    return {
      pts: rotated.map(toSvg) as [[number, number], [number, number], [number, number]],
      footH: toSvg(rotatedH),
      mastTopC: null as [number, number] | null,
      postTopA: null as [number, number] | null,
      postTopB: null as [number, number] | null,
      groundPoly: null as Array<[number, number]> | null,
      riverPoly: null as Array<[number, number]> | null,
    };
  }, [coords, yawDeg, pitchDeg, view3d, showPerpendicularH]);

  const [p0, p1, p2] = projected.pts;

  const midpoint = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];

  const midAB = midpoint(p0, p1);
  const midBC = midpoint(p1, p2);
  const midAC = midpoint(p0, p2);

  const centroid: [number, number] = [
    (p0[0] + p1[0] + p2[0]) / 3,
    (p0[1] + p1[1] + p2[1]) / 3,
  ];

  const outwardLabelPos = (pt: [number, number], dist = 20): [number, number] => {
    const dx = pt[0] - centroid[0];
    const dy = pt[1] - centroid[1];
    const len = Math.hypot(dx, dy) || 1;
    return [pt[0] + (dx / len) * dist, pt[1] + (dy / len) * dist];
  };

  const isHighlightedEdge = (i: number, j: number) =>
    highlightSide &&
    ((highlightSide[0] === i && highlightSide[1] === j) ||
      (highlightSide[0] === j && highlightSide[1] === i));

  return (
    <div className="notebook-card-warm p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold text-[#5B6B82]">
          {view3d
            ? 'Mô hình không gian 3D (xoay & nghiêng góc nhìn thực địa · số đo bất biến)'
            : 'Sơ đồ mặt bằng 2D (từ tọa độ hình học chuẩn · xoay góc nhìn không đổi số đo)'}
        </span>
        {allowRotate && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setView3d((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-extrabold !min-h-[34px] ${
                view3d
                  ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                  : 'bg-[#E6F6F3] text-[#145B4F] border-[#2E9C8A]'
              }`}
            >
              {view3d ? '3D · Về 2D' : 'Xem 3D'}
            </button>
            <button
              type="button"
              onClick={() => setYawDeg((d) => d - 18)}
              className="px-2 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] text-[#14284A] text-xs font-semibold flex items-center gap-1 !min-h-[34px]"
              aria-label="Xoay hình sang trái"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Xoay
            </button>
            <button
              type="button"
              onClick={() => setYawDeg((d) => d + 18)}
              className="px-2 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] text-[#14284A] text-xs font-semibold flex items-center gap-1 !min-h-[34px]"
              aria-label="Xoay hình sang phải"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            {view3d && (
              <button
                type="button"
                onClick={() => setPitchDeg((p) => (p >= 52 ? 22 : p + 14))}
                className="px-2 py-1 rounded-lg bg-[#FFF4D6] border border-[#D5B87E] text-[#14284A] text-xs font-bold !min-h-[34px]"
                aria-label="Đổi góc nghiêng camera 3D"
              >
                Nghiêng {pitchDeg}°
              </button>
            )}
          </div>
        )}
      </div>

      <svg
        viewBox="0 0 320 230"
        className="w-full max-w-[400px] mx-auto block select-none bg-gradient-to-b from-[#EDF7FB] to-[#FFFBF0] rounded-xl border border-[#E6D5AD]"
        role="img"
        aria-label={`Sơ đồ tam giác ${vertices.join('')}`}
      >
        {view3d && projected.groundPoly && (
          <g>
            <polygon
              points={projected.groundPoly.map((p) => p.join(',')).join(' ')}
              fill="#DCE9C6"
              stroke="#B2C894"
              strokeWidth="1.2"
            />
            {showRiverBank && projected.riverPoly && (
              <polygon
                points={projected.riverPoly.map((p) => p.join(',')).join(' ')}
                fill="#5BBCD8"
                fillOpacity="0.68"
                stroke="#2E96B8"
                strokeWidth="1.2"
              />
            )}
          </g>
        )}

        {!view3d && showRiverBank && (
          <g opacity="0.45">
            <rect x="0" y="62" width="320" height="86" fill="#8FD3E6" />
            <path d="M0 84 Q40 76 80 84 T160 84 T240 84 T320 84" fill="none" stroke="#4FB0D0" strokeWidth="2.5" />
            <path d="M0 124 Q40 116 80 124 T160 124 T240 124 T320 124" fill="none" stroke="#4FB0D0" strokeWidth="2.5" />
          </g>
        )}

        {/* 3D Vertical survey posts & target beacon mast at C */}
        {view3d && projected.mastTopC && projected.postTopA && projected.postTopB && (
          <g>
            <line x1={p0[0]} y1={p0[1]} x2={projected.postTopA[0]} y2={projected.postTopA[1]} stroke="#1F7A6B" strokeWidth="2.5" />
            <circle cx={projected.postTopA[0]} cy={projected.postTopA[1]} r="3.5" fill="#2E9C8A" />
            <line x1={p1[0]} y1={p1[1]} x2={projected.postTopB[0]} y2={projected.postTopB[1]} stroke="#3B5F8F" strokeWidth="2.5" />
            <circle cx={projected.postTopB[0]} cy={projected.postTopB[1]} r="3.5" fill="#3B5F8F" />
            <line x1={p2[0]} y1={p2[1]} x2={projected.mastTopC[0]} y2={projected.mastTopC[1]} stroke="#8A2B22" strokeWidth="3" />
            <polygon
              points={`${projected.mastTopC[0]},${projected.mastTopC[1]} ${projected.mastTopC[0] + 15},${projected.mastTopC[1] + 5} ${projected.mastTopC[0]},${projected.mastTopC[1] + 10}`}
              fill="#D93829"
            />
          </g>
        )}

        {/* Triangle fill */}
        <polygon
          points={`${p0[0]},${p0[1]} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`}
          fill="rgba(46,156,138,0.12)"
          stroke="none"
        />

        {/* Perpendicular CH if shown */}
        {showPerpendicularH && (
          <g>
            <line
              x1={p2[0]}
              y1={p2[1]}
              x2={projected.footH[0]}
              y2={projected.footH[1]}
              stroke="#C8392B"
              strokeWidth="2.4"
              strokeDasharray="6 4"
            />
            <circle cx={projected.footH[0]} cy={projected.footH[1]} r="4" fill="#C8392B" />
            <text
              x={projected.footH[0] + 6}
              y={projected.footH[1] + 15}
              fill="#C8392B"
              fontSize="12"
              fontWeight="700"
            >
              H (CH ⊥ AB)
            </text>
          </g>
        )}

        {/* Edges */}
        <line
          x1={p0[0]}
          y1={p0[1]}
          x2={p1[0]}
          y2={p1[1]}
          stroke={isHighlightedEdge(0, 1) ? '#D98A1F' : '#14284A'}
          strokeWidth={isHighlightedEdge(0, 1) ? 4.5 : 2.8}
          strokeLinecap="round"
        />
        <line
          x1={p1[0]}
          y1={p1[1]}
          x2={p2[0]}
          y2={p2[1]}
          stroke={isHighlightedEdge(1, 2) ? '#D98A1F' : '#14284A'}
          strokeWidth={isHighlightedEdge(1, 2) ? 4.5 : 2.8}
          strokeLinecap="round"
        />
        <line
          x1={p0[0]}
          y1={p0[1]}
          x2={p2[0]}
          y2={p2[1]}
          stroke={isHighlightedEdge(0, 2) ? '#D98A1F' : '#2E9C8A'}
          strokeWidth={isHighlightedEdge(0, 2) ? 4.5 : 3}
          strokeLinecap="round"
        />

        {/* Edge labels */}
        {labels.AB && (
          <text
            x={midAB[0]}
            y={midAB[1] + 16}
            textAnchor="middle"
            fill="#14284A"
            fontSize="12"
            fontWeight="700"
          >
            {labels.AB}
          </text>
        )}
        {labels.AC && (
          <text
            x={midAC[0] - 14}
            y={midAC[1] - 6}
            textAnchor="middle"
            fill="#1F7A6B"
            fontSize="12"
            fontWeight="700"
          >
            {labels.AC}
          </text>
        )}
        {labels.BC && (
          <text
            x={midBC[0] + 16}
            y={midBC[1] - 6}
            textAnchor="middle"
            fill="#14284A"
            fontSize="12"
            fontWeight="700"
          >
            {labels.BC}
          </text>
        )}

        {/* Vertices */}
        {projected.pts.map((pt, idx) => {
          const vName = vertices[idx];
          const [lx, ly] = outwardLabelPos(pt, 20);
          const isSelected = selectedVertex?.toUpperCase() === vName.toUpperCase();
          const isAngleHighlight = highlightAngleIndex === idx;
          const angleLabel = idx === 0 ? labels.A : idx === 1 ? labels.B : labels.C;
          const interactive = interactiveMode === 'tap_vertex';

          return (
            <g
              key={vName}
              className={interactive ? 'cursor-pointer' : ''}
              onClick={() => interactive && onSelectVertex?.(vName)}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? `Chọn đỉnh ${vName}` : undefined}
              onKeyDown={(e) => {
                if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelectVertex?.(vName);
                }
              }}
            >
              {interactive && <circle cx={pt[0]} cy={pt[1]} r="20" fill="transparent" />}
              {(isSelected || isAngleHighlight) && (
                <circle
                  cx={pt[0]}
                  cy={pt[1]}
                  r="14"
                  fill="rgba(224,169,59,0.35)"
                  stroke="#D98A1F"
                  strokeWidth="2.5"
                />
              )}
              <circle
                cx={pt[0]}
                cy={pt[1]}
                r={interactive ? 8 : 6}
                fill={isSelected ? '#2E9C8A' : '#14284A'}
                stroke="#FFFBF0"
                strokeWidth="2.5"
              />
              <text
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                fill="#14284A"
                fontSize="15"
                fontWeight="800"
              >
                {vName}
              </text>
              {angleLabel && (
                <text
                  x={(pt[0] * 2 + centroid[0]) / 3}
                  y={(pt[1] * 2 + centroid[1]) / 3 + 4}
                  textAnchor="middle"
                  fill="#B9831E"
                  fontSize="12"
                  fontWeight="700"
                >
                  {angleLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {yawDeg !== 0 && (
        <p className="text-[11px] text-[#5B6B82] text-center mt-1 tabular-nums">
          Góc xoay khung nhìn: {((yawDeg % 360) + 360) % 360}° · Số đo hình học không đổi: ∠{vertices[0]}={solved.angleA.toFixed(0)}°, ∠{vertices[1]}={solved.angleB.toFixed(0)}°, ∠{vertices[2]}={solved.angleC.toFixed(0)}°.
        </p>
      )}
    </div>
  );
};

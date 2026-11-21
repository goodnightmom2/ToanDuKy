import {B_SLIDE_MAX, B_SLIDE_MIN} from '../config.ts';

export type Vec3XZ = [number, number, number]; // [x, y=0, z]

// Single source of truth for BS01 geometry on XZ plane (Y = 0)
export const BS01_COORDS: {A: Vec3XZ; B: Vec3XZ; C: Vec3XZ} = {
  A: [0, 0, 0],
  B: [60, 0, 0],
  C: [35.543775927122866, 0, 42.35942265551226],
};

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function distanceXZ(p1: Vec3XZ, p2: Vec3XZ): number {
  const dx = p2[0] - p1[0];
  const dz = p2[2] - p1[2];
  return Math.hypot(dx, dz);
}

/**
 * Angle at vertex V formed by vectors (P - V) and (Q - V) on the XZ plane.
 */
export function angleDegAt(vertex: Vec3XZ, p: Vec3XZ, q: Vec3XZ): number {
  const ux = p[0] - vertex[0];
  const uz = p[2] - vertex[2];
  const vx = q[0] - vertex[0];
  const vz = q[2] - vertex[2];
  const lenU = Math.hypot(ux, uz);
  const lenV = Math.hypot(vx, vz);
  if (lenU < 1e-9 || lenV < 1e-9) return 0;
  const cosTheta = Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lenU * lenV)));
  return radToDeg(Math.acos(cosTheta));
}

export function triangleAreaXZ(a: Vec3XZ, b: Vec3XZ, c: Vec3XZ): number {
  const cross = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  return Math.abs(cross) / 2;
}

export interface TriangleValidation {
  valid: boolean;
  reason_vi?: string;
}

export function validateTrianglePoints(a: Vec3XZ, b: Vec3XZ, c: Vec3XZ): TriangleValidation {
  const ab = distanceXZ(a, b);
  const bc = distanceXZ(b, c);
  const ac = distanceXZ(a, c);
  if (ab < 1e-4 || bc < 1e-4 || ac < 1e-4) {
    return {
      valid: false,
      reason_vi: 'Có hai điểm trùng nhau nên không tạo thành tam giác khảo sát.',
    };
  }
  const area = triangleAreaXZ(a, b, c);
  if (area < 1e-3) {
    return {
      valid: false,
      reason_vi: 'Ba điểm A, B, C đang thẳng hàng (tam giác suy biến) nên không thể đo gián tiếp.',
    };
  }
  const angA = angleDegAt(a, b, c);
  const angB = angleDegAt(b, a, c);
  const angC = angleDegAt(c, a, b);
  if (angA < 2 || angB < 2 || angC < 2) {
    return {
      valid: false,
      reason_vi: 'Một góc quá nhỏ khiến phép ngắm thực địa không ổn định.',
    };
  }
  return {valid: true};
}

export interface SolvedTriangle {
  A: Vec3XZ;
  B: Vec3XZ;
  C: Vec3XZ;
  AB: number;
  BC: number;
  AC: number;
  angleA: number;
  angleB: number;
  angleC: number;
  area: number;
  footH: Vec3XZ; // Foot of perpendicular from C onto line AB
  perpendicularCH: number;
}

export function footOfPerpendicularCH(a: Vec3XZ, b: Vec3XZ, c: Vec3XZ): Vec3XZ {
  const abx = b[0] - a[0];
  const abz = b[2] - a[2];
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-9) return [a[0], 0, a[2]];
  const t = ((c[0] - a[0]) * abx + (c[2] - a[2]) * abz) / lenSq;
  return [a[0] + t * abx, 0, a[2] + t * abz];
}

export function solveTriangleFromCoords(a: Vec3XZ, b: Vec3XZ, c: Vec3XZ): SolvedTriangle {
  const AB = distanceXZ(a, b);
  const BC = distanceXZ(b, c);
  const AC = distanceXZ(a, c);
  const angleA = angleDegAt(a, b, c);
  const angleB = angleDegAt(b, a, c);
  const angleC = angleDegAt(c, a, b);
  const area = triangleAreaXZ(a, b, c);
  const footH = footOfPerpendicularCH(a, b, c);
  const perpendicularCH = distanceXZ(c, footH);
  return {A: a, B: b, C: c, AB, BC, AC, angleA, angleB, angleC, area, footH, perpendicularCH};
}

/**
 * Rotate point in XZ plane around origin to verify camera rotation invariance.
 */
export function rotatePointXZ(p: Vec3XZ, yawDeg: number): Vec3XZ {
  const r = degToRad(yawDeg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [p[0] * cos - p[2] * sin, 0, p[0] * sin + p[2] * cos];
}

/**
 * Build triangle coordinates from base AB = cLen and angles A, B (in degrees).
 */
export function buildTriangleFromBaseAndAngles(
  abLen: number,
  angleADeg: number,
  angleBDeg: number,
): SolvedTriangle | null {
  const angleCDeg = 180 - angleADeg - angleBDeg;
  if (abLen <= 0 || angleADeg <= 0 || angleBDeg <= 0 || angleCDeg <= 0) return null;
  const acLen = (abLen * Math.sin(degToRad(angleBDeg))) / Math.sin(degToRad(angleCDeg));
  const A: Vec3XZ = [0, 0, 0];
  const B: Vec3XZ = [abLen, 0, 0];
  const C: Vec3XZ = [acLen * Math.cos(degToRad(angleADeg)), 0, acLen * Math.sin(degToRad(angleADeg))];
  const check = validateTrianglePoints(A, B, C);
  if (!check.valid) return null;
  return solveTriangleFromCoords(A, B, C);
}

/**
 * Open Survey mode for BS01:
 * Point A=(0,0,0) and Point C stay fixed while Point B slides along bank x in [50, 100].
 * As B slides, AB and angles B, C change while AC remains strictly invariant!
 */
export function getBS01OpenSurveyState(bx: number): SolvedTriangle {
  const clampedBx = Math.max(B_SLIDE_MIN, Math.min(B_SLIDE_MAX, bx));
  const B: Vec3XZ = [clampedBx, 0, 0];
  return solveTriangleFromCoords(BS01_COORDS.A, B, BS01_COORDS.C);
}

export function roundToPlaces(value: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatViNumber(value: number, places = 1): string {
  const rounded = roundToPlaces(value, places);
  const str = places > 0 ? rounded.toFixed(places) : String(Math.round(rounded));
  return str.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1').replace('.', ',');
}

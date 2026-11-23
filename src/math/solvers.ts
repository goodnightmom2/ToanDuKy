import type {
  CodeVerificationResult,
  QuestionItem,
  StructuredGivens,
  VerifiedByCodeStatus,
} from '../types.ts';
import {degToRad, radToDeg, roundToPlaces} from './geometry.ts';
import {verifyQuestionByCode} from './verifier.ts';

export interface SolverOutcome {
  solved: boolean;
  value?: number;
  label_vi?: string;
  formula_vi?: string;
  unit?: string;
  note_vi: string;
}

const sinD = (deg: number) => Math.sin(degToRad(deg));
const cosD = (deg: number) => Math.cos(degToRad(deg));
const tanD = (deg: number) => Math.tan(degToRad(deg));

/**
 * Deterministic solver registry keyed by Appendix A `pattern_id` + structured `givens`.
 * Covers: NEN-01/03, LG-01..04, COS-01..04, SIN-01..03, DT-01..05, MH-01..04.
 * Unsolvable high-order proofs / optimization (MH-05, MH-06, NEN-02, OUT-00) explicitly return `solved: false`.
 */
export function solveByPatternAndGivens(
  patternId: string | null | undefined,
  givens?: StructuredGivens | null,
): SolverOutcome {
  if (!patternId || !givens) {
    return {solved: false, note_vi: 'Chưa có bộ giải hoặc thiếu số liệu cấu trúc (givens).'};
  }
  const g = givens;
  const pid = patternId.toUpperCase();

  switch (pid) {
    case 'NEN-01': {
      const angles = [g.A_deg, g.B_deg, g.C_deg].filter(
        (x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 180,
      );
      if (angles.length === 2) {
        const res = 180 - angles[0] - angles[1];
        if (res > 0) {
          return {
            solved: true,
            value: res,
            unit: '°',
            formula_vi: `180° − ${angles[0]}° − ${angles[1]}° = ${res}°`,
            note_vi: `Bộ giải NEN-01: góc còn lại = ${res}°.`,
          };
        }
      }
      break;
    }

    case 'NEN-03': {
      if (typeof g.value === 'number' && g.fromUnit && g.toUnit) {
        const f = g.fromUnit.toLowerCase();
        const t = g.toUnit.toLowerCase();
        if (f === 'km' && t === 'm') {
          return {
            solved: true,
            value: g.value * 1000,
            unit: 'm',
            formula_vi: `${g.value} × 1000`,
            note_vi: `Bộ giải NEN-03: quy đổi = ${g.value * 1000} m.`,
          };
        }
        if (f === 'm' && t === 'cm') {
          return {
            solved: true,
            value: g.value * 100,
            unit: 'cm',
            formula_vi: `${g.value} × 100`,
            note_vi: `Bộ giải NEN-03: quy đổi = ${g.value * 100} cm.`,
          };
        }
      }
      if (typeof g.value === 'number' && typeof g.decimal_places === 'number') {
        const r = roundToPlaces(g.value, g.decimal_places);
        return {
          solved: true,
          value: r,
          unit: g.unit,
          formula_vi: `Làm tròn ${g.value} đến ${g.decimal_places} chữ số thập phân`,
          note_vi: `Bộ giải NEN-03: làm tròn = ${r}.`,
        };
      }
      break;
    }

    case 'LG-01':
    case 'LG-02':
    case 'LG-03': {
      const ang = g.alpha_deg ?? g.A_deg ?? g.B_deg ?? g.C_deg;
      if (typeof ang === 'number' && g.trig_fn) {
        let val: number | undefined;
        if (g.trig_fn === 'sin') val = sinD(ang);
        else if (g.trig_fn === 'cos') val = cosD(ang);
        else if (g.trig_fn === 'tan' && Math.abs(ang - 90) > 1e-6) val = tanD(ang);
        else if (g.trig_fn === 'cot' && Math.abs(ang) > 1e-6 && Math.abs(ang - 180) > 1e-6) {
          val = 1 / tanD(ang);
        }
        if (val !== undefined && Number.isFinite(val)) {
          return {
            solved: true,
            value: val,
            formula_vi: `${g.trig_fn}(${ang}°)`,
            note_vi: `Bộ giải ${pid}: ${g.trig_fn}(${ang}°) ≈ ${roundToPlaces(val, 4)}.`,
          };
        }
      }
      break;
    }

    case 'LG-04': {
      if (g.trig_fn && typeof g.trig_value === 'number' && g.target) {
        const v = g.trig_value;
        const isObtuse = g.quadrant === 'obtuse';
        let sinV: number | undefined;
        let cosV: number | undefined;
        if (g.trig_fn === 'sin' && v >= 0 && v <= 1) {
          sinV = v;
          cosV = (isObtuse ? -1 : 1) * Math.sqrt(Math.max(0, 1 - v * v));
        } else if (g.trig_fn === 'cos' && v >= -1 && v <= 1) {
          cosV = v;
          sinV = Math.sqrt(Math.max(0, 1 - v * v));
        } else if (g.trig_fn === 'tan') {
          const cosAbs = 1 / Math.sqrt(1 + v * v);
          cosV = v < 0 || isObtuse ? -cosAbs : cosAbs;
          sinV = Math.abs(v * cosAbs);
        } else if (g.trig_fn === 'cot') {
          const sinAbs = 1 / Math.sqrt(1 + v * v);
          sinV = sinAbs;
          cosV = v * sinAbs;
        }
        if (sinV !== undefined && cosV !== undefined) {
          const tgt = g.target.toLowerCase();
          let out: number | undefined;
          if (tgt === 'sin') out = sinV;
          else if (tgt === 'cos') out = cosV;
          else if (tgt === 'tan' && Math.abs(cosV) > 1e-9) out = sinV / cosV;
          else if (tgt === 'cot' && Math.abs(sinV) > 1e-9) out = cosV / sinV;
          if (out !== undefined && Number.isFinite(out)) {
            return {
              solved: true,
              value: out,
              formula_vi: `sin²α + cos²α = 1 (${g.trig_fn}α = ${v}) → ${tgt}α`,
              note_vi: `Bộ giải LG-04: ${tgt}α ≈ ${roundToPlaces(out, 4)}.`,
            };
          }
        }
      }
      break;
    }

    case 'COS-01':
    case 'COS-04':
    case 'MH-04': {
      // Optional velocity × time conversion for MH-04
      let s1 = g.b;
      let s2 = g.c;
      if (pid === 'MH-04' && typeof g.v1 === 'number' && typeof g.v2 === 'number' && typeof g.t === 'number') {
        s1 = g.v1 * g.t;
        s2 = g.v2 * g.t;
      }
      const angA = g.A_deg ?? g.alpha_deg;
      if (typeof s1 === 'number' && typeof s2 === 'number' && typeof angA === 'number') {
        const res = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - 2 * s1 * s2 * cosD(angA)));
        return {
          solved: true,
          value: res,
          unit: g.unit ?? 'm',
          formula_vi: `√(${s1}² + ${s2}² − 2·${s1}·${s2}·cos(${angA}°))`,
          note_vi: `Bộ giải ${pid}: cạnh cần tìm ≈ ${roundToPlaces(res, 3)}.`,
        };
      }
      if (typeof g.a === 'number' && typeof g.b === 'number' && typeof g.C_deg === 'number') {
        const res = Math.sqrt(Math.max(0, g.a * g.a + g.b * g.b - 2 * g.a * g.b * cosD(g.C_deg)));
        return {
          solved: true,
          value: res,
          unit: g.unit ?? 'm',
          formula_vi: `√(${g.a}² + ${g.b}² − 2·${g.a}·${g.b}·cos(${g.C_deg}°))`,
          note_vi: `Bộ giải ${pid}: c ≈ ${roundToPlaces(res, 3)}.`,
        };
      }
      if (typeof g.a === 'number' && typeof g.c === 'number' && typeof g.B_deg === 'number') {
        const res = Math.sqrt(Math.max(0, g.a * g.a + g.c * g.c - 2 * g.a * g.c * cosD(g.B_deg)));
        return {
          solved: true,
          value: res,
          unit: g.unit ?? 'm',
          formula_vi: `√(${g.a}² + ${g.c}² − 2·${g.a}·${g.c}·cos(${g.B_deg}°))`,
          note_vi: `Bộ giải ${pid}: b ≈ ${roundToPlaces(res, 3)}.`,
        };
      }
      break;
    }

    case 'COS-02': {
      if (typeof g.a === 'number' && typeof g.b === 'number' && typeof g.c === 'number') {
        const t = (g.target ?? 'A').toUpperCase();
        const [opp, x, y] =
          t === 'B' ? [g.b, g.a, g.c] : t === 'C' ? [g.c, g.a, g.b] : [g.a, g.b, g.c];
        if (x + y > opp && x + opp > y && y + opp > x) {
          const cosVal = Math.max(-1, Math.min(1, (x * x + y * y - opp * opp) / (2 * x * y)));
          const deg = radToDeg(Math.acos(cosVal));
          return {
            solved: true,
            value: deg,
            unit: '°',
            formula_vi: `arccos((${x}² + ${y}² − ${opp}²)/(2·${x}·${y}))`,
            note_vi: `Bộ giải COS-02: góc ${t} ≈ ${roundToPlaces(deg, 2)}°.`,
          };
        }
      }
      break;
    }

    case 'COS-03': {
      if (typeof g.a === 'number' && typeof g.b === 'number' && typeof g.c === 'number') {
        const sorted = [g.a, g.b, g.c].sort((u, v) => u - v);
        if (sorted[0] + sorted[1] > sorted[2]) {
          const diff = sorted[0] * sorted[0] + sorted[1] * sorted[1] - sorted[2] * sorted[2];
          const label = Math.abs(diff) < 1e-6 ? 'vuông' : diff > 0 ? 'nhọn' : 'tù';
          return {
            solved: true,
            value: diff,
            label_vi: `Tam giác ${label}`,
            formula_vi: `${sorted[0]}² + ${sorted[1]}² ${diff > 0 ? '>' : diff < 0 ? '<' : '='} ${sorted[2]}²`,
            note_vi: `Bộ giải COS-03: tam giác ${label}.`,
          };
        }
      }
      break;
    }

    case 'SIN-01':
    case 'MH-01':
    case 'MH-03': {
      // Base c (=AB) + angles A, B -> find side opposite B (AC) or opposite A (BC)
      if (typeof g.c === 'number' && typeof g.A_deg === 'number' && typeof g.B_deg === 'number') {
        const C = typeof g.C_deg === 'number' ? g.C_deg : 180 - g.A_deg - g.B_deg;
        if (C > 0 && C < 180) {
          const tgt = (g.target ?? 'b').toLowerCase();
          const res =
            tgt === 'a' || tgt === 'bc'
              ? (g.c * sinD(g.A_deg)) / sinD(C)
              : (g.c * sinD(g.B_deg)) / sinD(C);
          return {
            solved: true,
            value: res,
            unit: g.unit ?? 'm',
            formula_vi: `${g.c}·sin(${tgt === 'a' || tgt === 'bc' ? g.A_deg : g.B_deg}°)/sin(${C}°)`,
            note_vi: `Bộ giải ${pid}: kết quả ≈ ${roundToPlaces(res, 3)}.`,
          };
        }
      }
      // Side a + angles A, B -> find b
      if (typeof g.a === 'number' && typeof g.A_deg === 'number' && typeof g.B_deg === 'number') {
        const res = (g.a * sinD(g.B_deg)) / sinD(g.A_deg);
        return {
          solved: true,
          value: res,
          unit: g.unit ?? 'm',
          formula_vi: `${g.a}·sin(${g.B_deg}°)/sin(${g.A_deg}°)`,
          note_vi: `Bộ giải ${pid}: b ≈ ${roundToPlaces(res, 3)}.`,
        };
      }
      // Side b + angles B, A -> find a
      if (typeof g.b === 'number' && typeof g.B_deg === 'number' && typeof g.A_deg === 'number') {
        const res = (g.b * sinD(g.A_deg)) / sinD(g.B_deg);
        return {
          solved: true,
          value: res,
          unit: g.unit ?? 'm',
          formula_vi: `${g.b}·sin(${g.A_deg}°)/sin(${g.B_deg}°)`,
          note_vi: `Bộ giải ${pid}: a ≈ ${roundToPlaces(res, 3)}.`,
        };
      }
      break;
    }

    case 'SIN-02': {
      if (typeof g.a === 'number' && typeof g.b === 'number' && typeof g.A_deg === 'number') {
        const sinB = (g.b * sinD(g.A_deg)) / g.a;
        if (sinB > 0 && sinB <= 1 + 1e-9) {
          const degB = radToDeg(Math.asin(Math.min(1, sinB)));
          return {
            solved: true,
            value: degB,
            unit: '°',
            formula_vi: `arcsin(${g.b}·sin(${g.A_deg}°)/${g.a})`,
            note_vi: `Bộ giải SIN-02: góc B ≈ ${roundToPlaces(degB, 2)}° (hoặc góc bù nếu thoả A + B < 180°).`,
          };
        }
      }
      break;
    }

    case 'SIN-03': {
      const pairs: Array<[number | undefined, number | undefined]> = [
        [g.a, g.A_deg],
        [g.b, g.B_deg],
        [g.c, g.C_deg],
      ];
      for (const [side, deg] of pairs) {
        if (typeof side === 'number' && typeof deg === 'number' && deg > 0 && deg < 180) {
          const R = side / (2 * sinD(deg));
          return {
            solved: true,
            value: R,
            unit: g.unit ?? 'm',
            formula_vi: `R = ${side} / (2·sin(${deg}°))`,
            note_vi: `Bộ giải SIN-03: R ≈ ${roundToPlaces(R, 3)}.`,
          };
        }
      }
      break;
    }

    case 'DT-01':
    case 'DT-05': {
      const triples: Array<[number | undefined, number | undefined, number | undefined]> = [
        [g.b, g.c, g.A_deg],
        [g.a, g.c, g.B_deg],
        [g.a, g.b, g.C_deg],
      ];
      for (const [s1, s2, ang] of triples) {
        if (typeof s1 === 'number' && typeof s2 === 'number' && typeof ang === 'number') {
          const S = 0.5 * s1 * s2 * sinD(ang);
          return {
            solved: true,
            value: S,
            unit: g.unit ?? 'm²',
            formula_vi: `½·${s1}·${s2}·sin(${ang}°)`,
            note_vi: `Bộ giải ${pid}: S ≈ ${roundToPlaces(S, 3)}.`,
          };
        }
      }
      // Fall through to Heron if 3 sides given in DT-05
      if (typeof g.a === 'number' && typeof g.b === 'number' && typeof g.c === 'number') {
        const p = (g.a + g.b + g.c) / 2;
        const prod = p * (p - g.a) * (p - g.b) * (p - g.c);
        if (prod > 0) {
          const S = Math.sqrt(prod);
          return {
            solved: true,
            value: S,
            unit: g.unit ?? 'm²',
            formula_vi: `Heron (p = ${p}): √(p(p−a)(p−b)(p−c))`,
            note_vi: `Bộ giải ${pid}: S ≈ ${roundToPlaces(S, 3)}.`,
          };
        }
      }
      break;
    }

    case 'DT-02': {
      if (typeof g.a === 'number' && typeof g.b === 'number' && typeof g.c === 'number') {
        const p = (g.a + g.b + g.c) / 2;
        const prod = p * (p - g.a) * (p - g.b) * (p - g.c);
        if (prod > 0) {
          const S = Math.sqrt(prod);
          return {
            solved: true,
            value: S,
            unit: g.unit ?? 'm²',
            formula_vi: `p = ${p}, S = √(${p}·(${p}−${g.a})·(${p}−${g.b})·(${p}−${g.c}))`,
            note_vi: `Bộ giải DT-02 (Heron): S ≈ ${roundToPlaces(S, 3)}.`,
          };
        }
      }
      break;
    }

    case 'DT-03': {
      if (typeof g.a === 'number' && typeof g.b === 'number' && typeof g.c === 'number') {
        const p = (g.a + g.b + g.c) / 2;
        const S = typeof g.S === 'number' ? g.S : Math.sqrt(Math.max(0, p * (p - g.a) * (p - g.b) * (p - g.c)));
        if (p > 0 && S > 0) {
          const r = S / p;
          return {
            solved: true,
            value: r,
            unit: g.unit ?? 'm',
            formula_vi: `r = S / p = ${roundToPlaces(S, 3)} / ${p}`,
            note_vi: `Bộ giải DT-03: r ≈ ${roundToPlaces(r, 3)}.`,
          };
        }
      }
      break;
    }

    case 'DT-04': {
      if (typeof g.a === 'number' && typeof g.b === 'number' && typeof g.c === 'number') {
        const prod = g.a * g.b * g.c;
        if (typeof g.R === 'number' && g.R > 0 && (g.target ?? 'S').toUpperCase() === 'S') {
          const S = prod / (4 * g.R);
          return {
            solved: true,
            value: S,
            unit: g.unit ?? 'm²',
            formula_vi: `S = (${g.a}·${g.b}·${g.c}) / (4·${g.R})`,
            note_vi: `Bộ giải DT-04: S ≈ ${roundToPlaces(S, 3)}.`,
          };
        }
        const p = (g.a + g.b + g.c) / 2;
        const S = typeof g.S === 'number' ? g.S : Math.sqrt(Math.max(0, p * (p - g.a) * (p - g.b) * (p - g.c)));
        if (S > 0) {
          const R = prod / (4 * S);
          return {
            solved: true,
            value: R,
            unit: g.unit ?? 'm',
            formula_vi: `R = (${g.a}·${g.b}·${g.c}) / (4·${roundToPlaces(S, 3)})`,
            note_vi: `Bộ giải DT-04: R ≈ ${roundToPlaces(R, 3)}.`,
          };
        }
      }
      break;
    }

    case 'MH-02': {
      // Two elevation angles alpha < beta separated by horizontal distance d:
      // h = d * sin(alpha) * sin(beta) / sin(beta - alpha)
      if (
        typeof g.d === 'number' &&
        g.d > 0 &&
        typeof g.alpha_deg === 'number' &&
        typeof g.beta_deg === 'number'
      ) {
        const small = Math.min(g.alpha_deg, g.beta_deg);
        const large = Math.max(g.alpha_deg, g.beta_deg);
        const diff = large - small;
        if (diff > 0.1 && large < 90 && small > 0) {
          const h = (g.d * sinD(small) * sinD(large)) / sinD(diff);
          return {
            solved: true,
            value: h,
            unit: g.unit ?? 'm',
            formula_vi: `h = ${g.d}·sin(${small}°)·sin(${large}°) / sin(${large}° − ${small}°)`,
            note_vi: `Bộ giải MH-02: h ≈ ${roundToPlaces(h, 3)}.`,
          };
        }
      }
      break;
    }

    default:
      break;
  }

  return {
    solved: false,
    note_vi: `Dạng ${pid} chưa có bộ giải số tự động hoặc thiếu dữ kiện — cần giáo viên xem kỹ.`,
  };
}

/**
 * Extracts a numeric value from a Vietnamese MCQ option label (including fractions and square roots like `7\sqrt{3}`).
 */
export function parseOptionNumericValue(label: string): number | null {
  const clean = label
    .replace(/\$|,/g, (m) => (m === ',' ? '.' : ''))
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\\circ|°|m²|m\^2|cm²|km|cm|m\b/gi, '')
    .trim();

  // Simple fraction \frac{a}{b}
  const fracMatch = clean.match(/^(-?\s*)\\frac\{(-?\d+(?:\.\d+)?)\}\{(-?\d+(?:\.\d+)?)\}$/);
  if (fracMatch) {
    const sign = fracMatch[1].includes('-') ? -1 : 1;
    const num = Number(fracMatch[2]);
    const den = Number(fracMatch[3]);
    if (den !== 0) return (sign * num) / den;
  }

  // Coefficient * sqrt(n) e.g. 14\sqrt{2} or \sqrt{39}
  const sqrtMatch = clean.match(/^(-?\d*(?:\.\d+)?)\\sqrt\{(\d+(?:\.\d+)?)\}$/);
  if (sqrtMatch) {
    const coef = sqrtMatch[1] === '' ? 1 : sqrtMatch[1] === '-' ? -1 : Number(sqrtMatch[1]);
    return coef * Math.sqrt(Number(sqrtMatch[2]));
  }

  // Plain decimal number
  const numMatch = clean.match(/^[+-]?\d+(?:\.\d+)?/);
  if (numMatch) {
    const v = Number(numMatch[0]);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/**
 * Unified verification combining `solvers.ts` (pattern_id + givens) and legacy `verifyQuestionByCode`.
 * Returns BOTH `code_verification` AND `verified_by_code` ('pass' | 'fail' | 'n/a').
 */
export function verifyQuestionWithSolvers(item: QuestionItem): {
  code_verification: CodeVerificationResult;
  verified_by_code: VerifiedByCodeStatus;
} {
  // 1. Try Appendix A solver registry first if pattern_id + givens are present
  if (item.pattern_id && item.givens) {
    const outcome = solveByPatternAndGivens(item.pattern_id, item.givens);
    if (outcome.solved && typeof outcome.value === 'number') {
      const dp =
        typeof item.givens.decimal_places === 'number'
          ? item.givens.decimal_places
          : typeof item.expected_answer?.decimal_places === 'number'
            ? Number(item.expected_answer.decimal_places)
            : 1;
      const roundedCode = roundToPlaces(outcome.value, dp);

      // Case A: MCQ — verify the chosen option matches the solver value
      if (item.type === 'mcq' && item.options && item.options.length > 0) {
        const chosenId = String(item.expected_answer?.choice ?? '');
        const chosenOpt = item.options.find((o) => o.id === chosenId);
        const optVal = chosenOpt ? parseOptionNumericValue(chosenOpt.label) : null;
        if (optVal !== null) {
          const tol = Math.max(0.06, Math.abs(outcome.value) * 0.01);
          const isMatch = Math.abs(optVal - outcome.value) <= tol || Math.abs(optVal - roundedCode) <= tol;
          return {
            verified_by_code: isMatch ? 'pass' : 'fail',
            code_verification: {
              status: isMatch ? 'verified_match' : 'mismatch_flagged',
              codeValue: roundToPlaces(outcome.value, 4),
              aiValue: optVal,
              roundedCodeValue: roundedCode,
              formula_vi: outcome.formula_vi,
              note_vi: isMatch
                ? `Đã kiểm bằng code (${item.pattern_id}): khớp phương án đúng (${outcome.formula_vi} ≈ ${roundedCode}).`
                : `CẢNH BÁO LỆCH ĐÁP ÁN (${item.pattern_id}): Phương án đang chọn = ${optVal}, nhưng code giải ra ${roundedCode} (${outcome.formula_vi}).`,
            },
          };
        }
      }

      // Case B: Numeric question
      const rawExpected =
        item.expected_answer?.rounded ??
        item.expected_answer?.value ??
        item.expected_answer?.exact_numeric;
      if (typeof rawExpected === 'number' && Number.isFinite(rawExpected)) {
        const tol = Math.max(Math.pow(10, -dp) * 0.55, 0.05);
        const isMatch = Math.abs(rawExpected - outcome.value) <= tol || Math.abs(rawExpected - roundedCode) <= tol;
        return {
          verified_by_code: isMatch ? 'pass' : 'fail',
          code_verification: {
            status: isMatch ? 'verified_match' : 'mismatch_flagged',
            codeValue: roundToPlaces(outcome.value, 4),
            aiValue: rawExpected,
            roundedCodeValue: roundedCode,
            formula_vi: outcome.formula_vi,
            note_vi: isMatch
              ? `Đã kiểm bằng code (${item.pattern_id}): khớp ${roundedCode} (${outcome.formula_vi}).`
              : `CẢNH BÁO LỆCH ĐÁP ÁN (${item.pattern_id}): Đáp án hiện tại = ${rawExpected}, nhưng code giải ra ${roundedCode} (${outcome.formula_vi}).`,
          },
        };
      }
    }
  }

  // 2. Fallback to existing deterministic verifier (`verifier.ts`)
  const legacy = verifyQuestionByCode(item);
  const status: VerifiedByCodeStatus =
    legacy.status === 'verified_match'
      ? 'pass'
      : legacy.status === 'mismatch_flagged'
        ? 'fail'
        : 'n/a';
  return {code_verification: legacy, verified_by_code: status};
}

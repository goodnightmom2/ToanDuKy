import type {CodeVerificationResult, MathVerificationParams, QuestionItem} from '../types.ts';
import {degToRad, radToDeg, roundToPlaces} from './geometry.ts';

function sinDeg(deg: number): number {
  return Math.sin(degToRad(deg));
}

function cosDeg(deg: number): number {
  return Math.cos(degToRad(deg));
}

function roundTo(value: number, places: number): number {
  return roundToPlaces(value, places);
}

function cosineLawSide(side1: number, side2: number, includedAngleDeg: number): number {
  const sq = side1 * side1 + side2 * side2 - 2 * side1 * side2 * cosDeg(includedAngleDeg);
  return Math.sqrt(Math.max(0, sq));
}

function cosineLawAngle(oppositeSide: number, side1: number, side2: number): number {
  const cosVal = Math.max(
    -1,
    Math.min(1, (side1 * side1 + side2 * side2 - oppositeSide * oppositeSide) / (2 * side1 * side2)),
  );
  return radToDeg(Math.acos(cosVal));
}

function triangleAreaSAS(side1: number, side2: number, includedAngleDeg: number): number {
  return 0.5 * side1 * side2 * sinDeg(includedAngleDeg);
}

function heronArea(a: number, b: number, c: number): number {
  const p = (a + b + c) / 2;
  const prod = p * (p - a) * (p - b) * (p - c);
  return Math.sqrt(Math.max(0, prod));
}

function parseViNum(raw: string): number {
  return Number(raw.replace(/\s+/g, '').replace(',', '.'));
}

function getExpectedNumericTarget(item: QuestionItem): {
  value: number;
  decimalPlaces: number;
} | null {
  const exp = item.expected_answer ?? {};
  const rawVal =
    exp.rounded ??
    exp.value ??
    exp.exact_numeric ??
    exp.optional_value ??
    exp.AC_m;

  if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
    const dp =
      typeof exp.decimal_places === 'number' && Number.isFinite(exp.decimal_places)
        ? Math.max(0, Math.min(4, exp.decimal_places))
        : inferDecimalPlaces(rawVal, item.stem_vi);
    return {value: rawVal, decimalPlaces: dp};
  }
  return null;
}

function inferDecimalPlaces(val: number, stem: string): number {
  if (/0[,.]01/.test(stem) || /hai chữ số thập phân|hàng phần trăm/i.test(stem)) return 2;
  if (/0[,.]1/.test(stem) || /một chữ số thập phân|hàng phần mười/i.test(stem)) return 1;
  if (/hàng đơn vị|số nguyên/i.test(stem)) return 0;
  const s = String(val);
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  return Math.min(3, s.length - dot - 1);
}

/**
 * Checks whether Hint Level 1 accidentally reveals the final numeric answer.
 */
export function checkHint1LeaksAnswer(item: QuestionItem, numericTarget?: number): boolean {
  const hint1 = (item.hints_vi?.[0] ?? '').trim();
  if (!hint1) return false;
  if (numericTarget === undefined || !Number.isFinite(numericTarget)) return false;

  // Avoid flagging trivial numbers like 0, 1, 2, 180, 90 that naturally appear in formulas
  const trivial = new Set([0, 1, 2, 3, 180, 90, 360, 100, 1000]);
  if (trivial.has(numericTarget)) return false;

  const dotStr = String(numericTarget);
  const commaStr = dotStr.replace('.', ',');
  const escapedDot = dotStr.replace('.', '\\.');
  const escapedComma = commaStr.replace(',', ',');
  const re = new RegExp(`(^|[^\\d.,])(${escapedDot}|${escapedComma})(?!(?:\\d|[.,]\\d))`);
  return re.test(hint1);
}

/**
 * Solves directly from structured math_params when supplied by AI extraction.
 */
function solveFromMathParams(
  params: MathVerificationParams,
): {value: number; formula_vi: string} | null {
  const {kind, a, b, c, angleA, angleB, angleC, value, fromUnit, toUnit, decimalPlaces, expr} = params;
  if (!kind || kind === 'other') return null;

  switch (kind) {
    case 'angle_sum': {
      const angles = [angleA, angleB, angleC].filter(
        (x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 180,
      );
      if (angles.length === 2) {
        const res = 180 - angles[0] - angles[1];
        if (res > 0) {
          return {
            value: res,
            formula_vi: `180° − ${angles[0]}° − ${angles[1]}° = ${res}°`,
          };
        }
      }
      return null;
    }

    case 'sine_law_side': {
      // Case 1: given known side `c` (e.g., AB) + angles A, B -> find AC (opposite B) or BC (opposite A)
      if (typeof c === 'number' && c > 0 && typeof angleA === 'number' && typeof angleB === 'number') {
        const angC = typeof angleC === 'number' && angleC > 0 ? angleC : 180 - angleA - angleB;
        if (angC > 0 && angC < 180) {
          // Default target is side opposite B (AC) if angleB provided
          const res = (c * sinDeg(angleB)) / sinDeg(angC);
          return {
            value: res,
            formula_vi: `c·sin(B)/sin(C) = ${c}·sin(${angleB}°)/sin(${angC}°)`,
          };
        }
      }
      // Case 2: given known side `a`, angleA, and angleB -> find side `b`
      if (typeof a === 'number' && a > 0 && typeof angleA === 'number' && typeof angleB === 'number') {
        const res = (a * sinDeg(angleB)) / sinDeg(angleA);
        return {
          value: res,
          formula_vi: `a·sin(B)/sin(A) = ${a}·sin(${angleB}°)/sin(${angleA}°)`,
        };
      }
      return null;
    }

    case 'cosine_law_side': {
      if (typeof b === 'number' && typeof c === 'number' && typeof angleA === 'number' && b > 0 && c > 0) {
        const res = cosineLawSide(b, c, angleA);
        return {
          value: res,
          formula_vi: `√(${b}² + ${c}² − 2·${b}·${c}·cos(${angleA}°))`,
        };
      }
      if (typeof a === 'number' && typeof b === 'number' && typeof angleC === 'number' && a > 0 && b > 0) {
        const res = cosineLawSide(a, b, angleC);
        return {
          value: res,
          formula_vi: `√(${a}² + ${b}² − 2·${a}·${b}·cos(${angleC}°))`,
        };
      }
      if (typeof a === 'number' && typeof c === 'number' && typeof angleB === 'number' && a > 0 && c > 0) {
        const res = cosineLawSide(a, c, angleB);
        return {
          value: res,
          formula_vi: `√(${a}² + ${c}² − 2·${a}·${c}·cos(${angleB}°))`,
        };
      }
      return null;
    }

    case 'cosine_law_angle': {
      if (
        typeof a === 'number' &&
        typeof b === 'number' &&
        typeof c === 'number' &&
        a > 0 &&
        b > 0 &&
        c > 0 &&
        a + b > c &&
        a + c > b &&
        b + c > a
      ) {
        // Angle opposite `a`
        const res = cosineLawAngle(a, b, c);
        return {
          value: res,
          formula_vi: `arccos((${b}² + ${c}² − ${a}²)/(2·${b}·${c}))`,
        };
      }
      return null;
    }

    case 'area_sas': {
      if (typeof a === 'number' && typeof b === 'number' && typeof angleC === 'number') {
        const res = triangleAreaSAS(a, b, angleC);
        return {value: res, formula_vi: `1/2 · ${a} · ${b} · sin(${angleC}°)`};
      }
      if (typeof b === 'number' && typeof c === 'number' && typeof angleA === 'number') {
        const res = triangleAreaSAS(b, c, angleA);
        return {value: res, formula_vi: `1/2 · ${b} · ${c} · sin(${angleA}°)`};
      }
      if (typeof a === 'number' && typeof c === 'number' && typeof angleB === 'number') {
        const res = triangleAreaSAS(a, c, angleB);
        return {value: res, formula_vi: `1/2 · ${a} · ${c} · sin(${angleB}°)`};
      }
      return null;
    }

    case 'area_heron': {
      if (
        typeof a === 'number' &&
        typeof b === 'number' &&
        typeof c === 'number' &&
        a + b > c &&
        a + c > b &&
        b + c > a
      ) {
        const res = heronArea(a, b, c);
        const p = (a + b + c) / 2;
        return {value: res, formula_vi: `Heron với p = ${p}: √(p(p−a)(p−b)(p−c))`};
      }
      return null;
    }

    case 'height_from_area': {
      if (typeof value === 'number' && typeof a === 'number' && a > 0) {
        return {value: (2 * value) / a, formula_vi: `h = 2·S / a = 2·${value} / ${a}`};
      }
      if (
        typeof a === 'number' &&
        typeof b === 'number' &&
        typeof c === 'number' &&
        a + b > c &&
        a + c > b &&
        b + c > a
      ) {
        const area = heronArea(a, b, c);
        return {value: (2 * area) / a, formula_vi: `h_a = 2·S_Heron / ${a}`};
      }
      return null;
    }

    case 'inradius_heron': {
      if (
        typeof a === 'number' &&
        typeof b === 'number' &&
        typeof c === 'number' &&
        a + b > c &&
        a + c > b &&
        b + c > a
      ) {
        const p = (a + b + c) / 2;
        const area = heronArea(a, b, c);
        return {value: area / p, formula_vi: `r = S / p = ${roundTo(area, 4)} / ${p}`};
      }
      return null;
    }

    case 'perp_height_sin': {
      if (typeof c === 'number' && c > 0 && typeof angleA === 'number' && typeof angleB === 'number') {
        const angC = typeof angleC === 'number' && angleC > 0 ? angleC : 180 - angleA - angleB;
        if (angC > 0 && angC < 180) {
          const ac = (c * sinDeg(angleB)) / sinDeg(angC);
          const ch = ac * sinDeg(angleA);
          return {
            value: ch,
            formula_vi: `CH = AC·sin(${angleA}°) = (${c}·sin(${angleB}°)/sin(${angC}°))·sin(${angleA}°)`,
          };
        }
      }
      return null;
    }

    case 'circumradius': {
      if (typeof a === 'number' && typeof angleA === 'number' && a > 0 && angleA > 0 && angleA < 180) {
        const res = a / (2 * sinDeg(angleA));
        return {value: res, formula_vi: `R = ${a} / (2·sin(${angleA}°))`};
      }
      return null;
    }

    case 'ratio_solve': {
      // x / sin(angleA) = a / sin(angleB)
      if (typeof a === 'number' && typeof angleA === 'number' && typeof angleB === 'number') {
        const res = (a * sinDeg(angleA)) / sinDeg(angleB);
        return {value: res, formula_vi: `${a}·sin(${angleA}°)/sin(${angleB}°)`};
      }
      return null;
    }

    case 'unit_convert': {
      if (typeof value === 'number' && fromUnit && toUnit) {
        const f = fromUnit.toLowerCase();
        const t = toUnit.toLowerCase();
        if (f === 'km' && t === 'm') return {value: value * 1000, formula_vi: `${value} × 1000`};
        if (f === 'm' && t === 'km') return {value: value / 1000, formula_vi: `${value} / 1000`};
        if (f === 'm' && t === 'cm') return {value: value * 100, formula_vi: `${value} × 100`};
        if (f === 'cm' && t === 'm') return {value: value / 100, formula_vi: `${value} / 100`};
      }
      return null;
    }

    case 'rounding': {
      if (typeof value === 'number') {
        const dp = typeof decimalPlaces === 'number' ? decimalPlaces : 1;
        return {value: roundTo(value, dp), formula_vi: `Làm tròn ${value} đến ${dp} chữ số thập phân`};
      }
      return null;
    }

    case 'trig_expr': {
      if (expr) {
        const evalRes = evaluateSimpleTrigExpression(expr);
        if (evalRes !== null) {
          return {value: evalRes, formula_vi: `Tính biểu thức lượng giác: ${expr}`};
        }
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Evaluates simple degree-based trig expressions such as:
 * "sin 60 độ trừ cos 30 độ", "sin(30) + cos(60)", "2*sin(30) + cos(120)", "cos 120°".
 */
function evaluateSimpleTrigExpression(raw: string): number | null {
  const normalized = raw
    .replace(/độ|°|\^\\circ|\\circ/gi, '')
    .replace(/\s+trừ\s+/gi, ' - ')
    .replace(/\s+cộng\s+/gi, ' + ')
    .replace(/\s+nhân\s+/gi, ' * ')
    .replace(/\s+chia\s+/gi, ' / ')
    .replace(/,/g, '.');

  // Match binary pattern: [coeff1] fn1(ang1) [op [coeff2] fn2(ang2)]
  const termRe = /([+-]?\s*\d*(?:\.\d+)?)?\s*\*?\s*(sin|cos|tan|cot)\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?/gi;
  const matches = Array.from(normalized.matchAll(termRe));
  if (matches.length === 0) return null;

  let total = 0;
  let lastIndex = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const prefixBetween = normalized.slice(lastIndex, m.index ?? 0);
    let sign = 1;
    if (i > 0 && /-\s*$/.test(prefixBetween.trim())) {
      sign = -1;
    }
    const coeffRaw = (m[1] ?? '').replace(/\s+/g, '');
    let coeff = 1;
    if (coeffRaw === '-') coeff = -1;
    else if (coeffRaw === '+' || coeffRaw === '') coeff = 1;
    else coeff = Number(coeffRaw);

    const fn = m[2].toLowerCase();
    const deg = Number(m[3]);
    let val = 0;
    if (fn === 'sin') val = sinDeg(deg);
    else if (fn === 'cos') val = cosDeg(deg);
    else if (fn === 'tan') {
      const c = cosDeg(deg);
      if (Math.abs(c) < 1e-12) return null;
      val = sinDeg(deg) / c;
    } else if (fn === 'cot') {
      const s = sinDeg(deg);
      if (Math.abs(s) < 1e-12) return null;
      val = cosDeg(deg) / s;
    }
    total += sign * coeff * val;
    lastIndex = (m.index ?? 0) + m[0].length;
  }

  if (Math.abs(total) < 1e-10) total = 0;
  return total;
}

/**
 * Pattern-based deterministic solver directly from Vietnamese Chapter III stem_vi.
 */
function solveFromStemText(item: QuestionItem): {value: number; formula_vi: string} | null {
  const stem = item.stem_vi
    .replace(/\$/g, ' ')
    .replace(/\\widehat\{([^}]+)\}/g, '$1')
    .replace(/\\angle\s*/g, '')
    .replace(/\^\\circ|\\circ/g, '°');

  // 1. Unit conversion: "Đổi 0,75 km sang mét"
  const kmToM = stem.match(/đổi\s+(\d+(?:[.,]\d+)?)\s*km\s+(?:sang|ra)\s*(?:m|mét)/i);
  if (kmToM) {
    const v = parseViNum(kmToM[1]);
    return {value: v * 1000, formula_vi: `${v} km × 1000 = ${v * 1000} m`};
  }
  const mToKm = stem.match(/đổi\s+(\d+(?:[.,]\d+)?)\s*(?:m|mét)\s+(?:sang|ra)\s*km/i);
  if (mToKm) {
    const v = parseViNum(mToKm[1]);
    return {value: v / 1000, formula_vi: `${v} m / 1000 = ${v / 1000} km`};
  }
  const mToCm = stem.match(/đổi\s+(\d+(?:[.,]\d+)?)\s*(?:m|mét)\s+(?:sang|ra)\s*cm/i);
  if (mToCm) {
    const v = parseViNum(mToCm[1]);
    return {value: v * 100, formula_vi: `${v} m × 100 = ${v * 100} cm`};
  }

  // 2. Direct rounding question: "Làm tròn ... 6,49 m đến 0,1 m"
  const roundMatch = stem.match(
    /làm tròn[^0-9]*(\d+[.,]\d+)\s*(?:m|cm|km)?\s*đến\s*(0[.,]0?1|hàng phần mười|hàng phần trăm)/i,
  );
  if (roundMatch) {
    const num = parseViNum(roundMatch[1]);
    const dp = /0[.,]01|phần trăm/i.test(roundMatch[2]) ? 2 : 1;
    return {value: roundTo(num, dp), formula_vi: `Làm tròn ${num} đến ${dp} chữ số thập phân`};
  }

  // 3. Ratio algebra: "x/sin30 = 12/sin90" or "x / sin(30°) = 12 / sin(90°)"
  const ratioMatch = stem.match(
    /[a-zA-Z]+\s*\/\s*sin\s*\(?\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ)?\s*\)?\s*=\s*(\d+(?:[.,]\d+)?)\s*\/\s*sin\s*\(?\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ)?\s*\)?/i,
  );
  if (ratioMatch) {
    const angNum = parseViNum(ratioMatch[1]);
    const k = parseViNum(ratioMatch[2]);
    const angDen = parseViNum(ratioMatch[3]);
    const res = (k * sinDeg(angNum)) / sinDeg(angDen);
    return {value: res, formula_vi: `x = ${k}·sin(${angNum}°)/sin(${angDen}°)`};
  }

  // 4. Special trig expression: "Tính sin 60 độ trừ cos 30 độ"
  if (/(sin|cos|tan|cot)\s*\(?\s*\d+/i.test(stem) && !/tam giác|cạnh|diện tích|bán kính/i.test(stem)) {
    const trigVal = evaluateSimpleTrigExpression(stem);
    if (trigVal !== null) {
      return {value: trigVal, formula_vi: `Tính giá trị lượng giác theo độ (DEG)`};
    }
  }

  // Extract triangle sides & angles from stem (supports AB = 8, "A, B cách nhau 50 m", "BAC = 55°", "ba cạnh là 7 m, 8 m và 9 m")
  const sideAB =
    stem.match(/\bAB\s*=\s*(\d+(?:[.,]\d+)?)/) ??
    stem.match(/\bA\s*(?:,|và)\s*B\s+cách nhau\s+(\d+(?:[.,]\d+)?)/i);
  const sideBC =
    stem.match(/\bBC\s*=\s*(\d+(?:[.,]\d+)?)/) ??
    stem.match(/\bB\s*(?:,|và)\s*C\s+cách nhau\s+(\d+(?:[.,]\d+)?)/i);
  const sideAC =
    stem.match(/\bAC\s*=\s*(\d+(?:[.,]\d+)?)/) ??
    stem.match(/\bA\s*(?:,|và)\s*C\s+cách nhau\s+(\d+(?:[.,]\d+)?)/i);
  const sideA = stem.match(/\ba\s*=\s*(\d+(?:[.,]\d+)?)/);
  const sideB = stem.match(/\bb\s*=\s*(\d+(?:[.,]\d+)?)/);
  const sideC = stem.match(/\bc\s*=\s*(\d+(?:[.,]\d+)?)/);

  const angA =
    stem.match(/(?:góc\s*)?\b(?:BAC|CAB|A)\s*(?:=|bằng)\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ)/i);
  const angB =
    stem.match(/(?:góc\s*)?\b(?:ABC|CBA|B)\s*(?:=|bằng)\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ)/i);
  const angC =
    stem.match(/(?:góc\s*)?\b(?:ACB|BCA|C)\s*(?:=|bằng)\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ)/i);

  let aVal = sideBC ? parseViNum(sideBC[1]) : sideA ? parseViNum(sideA[1]) : undefined;
  let bVal = sideAC ? parseViNum(sideAC[1]) : sideB ? parseViNum(sideB[1]) : undefined;
  let cVal = sideAB ? parseViNum(sideAB[1]) : sideC ? parseViNum(sideC[1]) : undefined;

  // Natural 3-side list: "ba cạnh (lần lượt) là 7 m, 8 m và 9 m"
  if (aVal === undefined && bVal === undefined && cVal === undefined) {
    const threeSides = stem.match(
      /ba cạnh[^0-9]*(\d+(?:[.,]\d+)?)\s*(?:m|cm|km)?\s*,\s*(\d+(?:[.,]\d+)?)\s*(?:m|cm|km)?\s*(?:,|và)\s*(\d+(?:[.,]\d+)?)/i,
    );
    if (threeSides) {
      aVal = parseViNum(threeSides[1]);
      bVal = parseViNum(threeSides[2]);
      cVal = parseViNum(threeSides[3]);
    } else if (
      item.math_params &&
      typeof item.math_params.a === 'number' &&
      typeof item.math_params.b === 'number' &&
      typeof item.math_params.c === 'number'
    ) {
      aVal = item.math_params.a;
      bVal = item.math_params.b;
      cVal = item.math_params.c;
    }
  }

  const AVal = angA ? parseViNum(angA[1]) : undefined;
  const BVal = angB ? parseViNum(angB[1]) : undefined;
  const CVal = angC ? parseViNum(angC[1]) : undefined;

  // 5. Angle sum: "Tìm góc R/C/A/B" when 2 angles are given and no side length is asked
  if (/tìm\s+góc|tính\s+góc|số đo góc/i.test(stem) && !(aVal && bVal && cVal)) {
    const allAngles = Array.from(stem.matchAll(/(?:=|bằng)\s*(\d+(?:[.,]\d+)?)\s*(?:°|độ)/gi)).map((m) =>
      parseViNum(m[1]),
    );
    if (allAngles.length === 2 && allAngles[0] + allAngles[1] < 180) {
      const res = 180 - allAngles[0] - allAngles[1];
      return {value: res, formula_vi: `180° − ${allAngles[0]}° − ${allAngles[1]}° = ${res}°`};
    }
  }

  // 6. Circumradius R: "bán kính đường tròn ngoại tiếp" or "tính R"
  if (/ngoại tiếp|tính\s+R\b|tìm\s+R\b/i.test(stem)) {
    if (aVal && AVal) {
      return {value: aVal / (2 * sinDeg(AVal)), formula_vi: `R = ${aVal}/(2·sin(${AVal}°))`};
    }
    if (bVal && BVal) {
      return {value: bVal / (2 * sinDeg(BVal)), formula_vi: `R = ${bVal}/(2·sin(${BVal}°))`};
    }
    if (cVal && CVal) {
      return {value: cVal / (2 * sinDeg(CVal)), formula_vi: `R = ${cVal}/(2·sin(${CVal}°))`};
    }
  }

  // 7. Area: SAS or Heron
  if (/diện tích|\bS\b/i.test(stem)) {
    if (aVal && bVal && CVal) {
      return {value: triangleAreaSAS(aVal, bVal, CVal), formula_vi: `S = 1/2·${aVal}·${bVal}·sin(${CVal}°)`};
    }
    if (bVal && cVal && AVal) {
      return {value: triangleAreaSAS(bVal, cVal, AVal), formula_vi: `S = 1/2·${bVal}·${cVal}·sin(${AVal}°)`};
    }
    if (aVal && cVal && BVal) {
      return {value: triangleAreaSAS(aVal, cVal, BVal), formula_vi: `S = 1/2·${aVal}·${cVal}·sin(${BVal}°)`};
    }
    if (aVal && bVal && cVal && aVal + bVal > cVal && aVal + cVal > bVal && bVal + cVal > aVal) {
      const p = (aVal + bVal + cVal) / 2;
      return {value: heronArea(aVal, bVal, cVal), formula_vi: `Heron (p=${p}): √(p(p−a)(p−b)(p−c))`};
    }
  }

  // 8. Law of Cosines — find angle from 3 sides
  if (aVal && bVal && cVal && aVal + bVal > cVal && aVal + cVal > bVal && bVal + cVal > aVal) {
    if (/góc\s*A|cos\s*A/i.test(stem)) {
      if (/cos\s*A/i.test(stem)) {
        const val = (bVal * bVal + cVal * cVal - aVal * aVal) / (2 * bVal * cVal);
        return {value: val, formula_vi: `cos(A) = (${bVal}²+${cVal}²−${aVal}²)/(2·${bVal}·${cVal})`};
      }
      return {value: cosineLawAngle(aVal, bVal, cVal), formula_vi: `arccos((${bVal}²+${cVal}²−${aVal}²)/(2·${bVal}·${cVal}))`};
    }
    if (/góc\s*B|cos\s*B/i.test(stem)) {
      return {value: cosineLawAngle(bVal, aVal, cVal), formula_vi: `arccos((${aVal}²+${cVal}²−${bVal}²)/(2·${aVal}·${cVal}))`};
    }
    if (/góc\s*C|cos\s*C/i.test(stem)) {
      return {value: cosineLawAngle(cVal, aVal, bVal), formula_vi: `arccos((${aVal}²+${bVal}²−${cVal}²)/(2·${aVal}·${bVal}))`};
    }
  }

  // 9. Law of Cosines — find side from 2 sides + included angle
  if (bVal && cVal && AVal && !aVal) {
    return {
      value: cosineLawSide(bVal, cVal, AVal),
      formula_vi: `√(${bVal}² + ${cVal}² − 2·${bVal}·${cVal}·cos(${AVal}°))`,
    };
  }
  if (aVal && cVal && BVal && !bVal) {
    return {
      value: cosineLawSide(aVal, cVal, BVal),
      formula_vi: `√(${aVal}² + ${cVal}² − 2·${aVal}·${cVal}·cos(${BVal}°))`,
    };
  }
  if (aVal && bVal && CVal && !cVal) {
    return {
      value: cosineLawSide(aVal, bVal, CVal),
      formula_vi: `√(${aVal}² + ${bVal}² − 2·${aVal}·${bVal}·cos(${CVal}°))`,
    };
  }

  // 10. Law of Sines — given AB (cVal) + angles A, B (and optionally C) -> find AC or BC
  if (cVal && AVal && BVal) {
    const computedC = CVal ?? 180 - AVal - BVal;
    if (computedC > 0 && computedC < 180) {
      if (/\bBC\b|tính\s+a\b/i.test(stem) && !/\bAC\b/i.test(stem)) {
        const res = (cVal * sinDeg(AVal)) / sinDeg(computedC);
        return {value: res, formula_vi: `BC = ${cVal}·sin(${AVal}°)/sin(${computedC}°)`};
      }
      const res = (cVal * sinDeg(BVal)) / sinDeg(computedC);
      return {value: res, formula_vi: `AC = ${cVal}·sin(${BVal}°)/sin(${computedC}°)`};
    }
  }
  if (aVal && AVal && BVal) {
    const res = (aVal * sinDeg(BVal)) / sinDeg(AVal);
    return {value: res, formula_vi: `b = ${aVal}·sin(${BVal}°)/sin(${AVal}°)`};
  }
  if (aVal && AVal && CVal) {
    const res = (aVal * sinDeg(CVal)) / sinDeg(AVal);
    return {value: res, formula_vi: `c = ${aVal}·sin(${CVal}°)/sin(${AVal}°)`};
  }

  return null;
}

/**
 * Independently re-solves a question in TypeScript code and compares against AI/JSON numeric answer.
 * Flags mismatches so teachers never approve hallucinated numeric answers.
 */
export function verifyQuestionByCode(item: QuestionItem): CodeVerificationResult {
  const target = getExpectedNumericTarget(item);
  const hint1LeaksAnswer = checkHint1LeaksAnswer(item, target?.value);

  if (!target) {
    return {
      status: 'unverifiable',
      note_vi:
        item.type === 'numeric'
          ? 'Chưa có đáp án số để code tự giải đối chiếu — giáo viên kiểm tra thủ công.'
          : 'Câu dạng phi số (trắc nghiệm/ghép cặp/sơ đồ) — giáo viên đối chiếu trực tiếp.',
      hint1LeaksAnswer,
    };
  }

  // Try structured math_params first, then Vietnamese stem solver
  const solved =
    (item.math_params ? solveFromMathParams(item.math_params) : null) ??
    solveFromStemText(item);

  if (!solved || !Number.isFinite(solved.value)) {
    return {
      status: 'unverifiable',
      aiValue: target.value,
      note_vi: `Chưa tự trích được công thức từ đề bài (đáp án đang lưu: ${target.value}) — giáo viên kiểm tra lại bằng máy tính.`,
      hint1LeaksAnswer,
    };
  }

  const roundedCode = roundTo(solved.value, target.decimalPlaces);
  const tolerance = Math.max(0.015, Math.pow(10, -target.decimalPlaces) * 0.55);
  const diffRounded = Math.abs(roundedCode - target.value);
  const diffExact = Math.abs(solved.value - target.value);

  if (diffRounded <= tolerance || diffExact <= tolerance) {
    return {
      status: 'verified_match',
      codeValue: solved.value,
      roundedCodeValue: roundedCode,
      aiValue: target.value,
      formula_vi: solved.formula_vi,
      note_vi: `Code tự giải khớp: ${roundedCode} (công thức: ${solved.formula_vi}).`,
      hint1LeaksAnswer,
    };
  }

  return {
    status: 'mismatch_flagged',
    codeValue: solved.value,
    roundedCodeValue: roundedCode,
    aiValue: target.value,
    formula_vi: solved.formula_vi,
    note_vi: `CẢNH BÁO LỆCH ĐÁP ÁN: Code tự tính được ${roundedCode} (chính xác ${roundTo(solved.value, 4)}), khác với đáp án AI/tệp là ${target.value}!`,
    hint1LeaksAnswer,
  };
}

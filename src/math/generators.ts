import type {QuestionItem, SkillCluster, SkillRecord} from '../types.ts';
import {
  buildTriangleFromBaseAndAngles,
  degToRad,
  formatViNumber,
  radToDeg,
  roundToPlaces,
} from './geometry.ts';

export type GeneratorId =
  | 'GEN_ANGLE_SUM'
  | 'GEN_OPP_PAIR'
  | 'GEN_TRIG_VALUES'
  | 'GEN_UNITS'
  | 'GEN_ROUND'
  | 'GEN_SIN_SIDE'
  | 'GEN_SIN_R'
  | 'GEN_COS_SIDE'
  | 'GEN_COS_ANGLE'
  | 'GEN_AREA_SAS'
  | 'GEN_AREA_HERON'
  | 'GEN_HEIGHT'
  | 'GEN_ERROR_SPOT';

export const ALL_GENERATOR_IDS: GeneratorId[] = [
  'GEN_ANGLE_SUM',
  'GEN_OPP_PAIR',
  'GEN_TRIG_VALUES',
  'GEN_UNITS',
  'GEN_ROUND',
  'GEN_SIN_SIDE',
  'GEN_SIN_R',
  'GEN_COS_SIDE',
  'GEN_COS_ANGLE',
  'GEN_AREA_SAS',
  'GEN_AREA_HERON',
  'GEN_HEIGHT',
  'GEN_ERROR_SPOT',
];

export function createAttemptSeed(): number {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] || 1337;
  }
  return Math.floor(Math.random() * 0xffffffff) || 1337;
}

/** Deterministic PRNG (Mulberry32) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pickOne<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeDistinctMcqOptions(
  correctVal: number,
  places: number,
  unit: string,
  candidates: Array<{val: number; errorCode: string}>,
  seed: number,
): Array<{id: string; label: string; errorCode?: string}> {
  const seen = new Set<string>();
  const correctLabel = `${formatViNumber(correctVal, places)}${unit ? ' ' + unit : ''}`;
  seen.add(correctLabel);
  const opts: Array<{id: string; label: string; errorCode?: string}> = [
    {id: 'correct', label: correctLabel},
  ];
  let idx = 1;
  for (const cand of candidates) {
    if (!Number.isFinite(cand.val) || cand.val <= 0) continue;
    const lbl = `${formatViNumber(cand.val, places)}${unit ? ' ' + unit : ''}`;
    if (!seen.has(lbl)) {
      seen.add(lbl);
      opts.push({id: `d${idx++}`, label: lbl, errorCode: cand.errorCode});
    }
    if (opts.length >= 4) break;
  }
  // Ensure 4 distinct options even in edge cases
  let bump = 1;
  while (opts.length < 4) {
    const fallbackVal = roundToPlaces(correctVal + bump * (places > 0 ? 0.5 : 2), places);
    const lbl = `${formatViNumber(fallbackVal, places)}${unit ? ' ' + unit : ''}`;
    if (!seen.has(lbl)) {
      seen.add(lbl);
      opts.push({id: `d${idx++}`, label: lbl, errorCode: 'E05'});
    }
    bump += 1;
  }
  return shuffleWithSeed(opts, seed);
}

const TRIANGLE_NAME_SETS: ReadonlyArray<[string, string, string]> = [
  ['A', 'B', 'C'],
  ['M', 'N', 'P'],
  ['D', 'E', 'F'],
  ['P', 'Q', 'R'],
  ['X', 'Y', 'Z'],
];

const SPECIAL_TRIG_BANK: ReadonlyArray<{
  expr: string;
  answer: string;
  distractors: Array<{label: string; errorCode: string}>;
  solution: string;
}> = [
  {
    expr: '\\sin 150^\\circ',
    answer: '$\\frac{1}{2}$',
    distractors: [
      {label: '$-\\frac{1}{2}$', errorCode: 'E06'},
      {label: '$\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
      {label: '$-\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
    ],
    solution: '$\\sin 150^\\circ = \\sin(180^\\circ - 30^\\circ) = \\sin 30^\\circ = \\frac{1}{2}$.',
  },
  {
    expr: '\\cos 135^\\circ',
    answer: '$-\\frac{\\sqrt{2}}{2}$',
    distractors: [
      {label: '$\\frac{\\sqrt{2}}{2}$', errorCode: 'E06'},
      {label: '$-\\frac{1}{2}$', errorCode: 'E06'},
      {label: '$-\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
    ],
    solution: '$\\cos 135^\\circ = -\\cos 45^\\circ = -\\frac{\\sqrt{2}}{2}$.',
  },
  {
    expr: '\\cos 150^\\circ',
    answer: '$-\\frac{\\sqrt{3}}{2}$',
    distractors: [
      {label: '$\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
      {label: '$-\\frac{1}{2}$', errorCode: 'E06'},
      {label: '$\\frac{1}{2}$', errorCode: 'E06'},
    ],
    solution: '$\\cos 150^\\circ = -\\cos 30^\\circ = -\\frac{\\sqrt{3}}{2}$.',
  },
  {
    expr: '\\sin 120^\\circ',
    answer: '$\\frac{\\sqrt{3}}{2}$',
    distractors: [
      {label: '$-\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
      {label: '$\\frac{1}{2}$', errorCode: 'E06'},
      {label: '$-\\frac{1}{2}$', errorCode: 'E06'},
    ],
    solution: '$\\sin 120^\\circ = \\sin 60^\\circ = \\frac{\\sqrt{3}}{2}$.',
  },
  {
    expr: '\\tan 135^\\circ',
    answer: '$-1$',
    distractors: [
      {label: '$1$', errorCode: 'E06'},
      {label: '$0$', errorCode: 'E06'},
      {label: '$-\\sqrt{3}$', errorCode: 'E06'},
    ],
    solution: '$\\tan 135^\\circ = -\\tan 45^\\circ = -1$.',
  },
  {
    expr: '\\cos 120^\\circ + \\sin 30^\\circ',
    answer: '$0$',
    distractors: [
      {label: '$1$', errorCode: 'E06'},
      {label: '$-1$', errorCode: 'E06'},
      {label: '$\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
    ],
    solution: '$\\cos 120^\\circ = -\\frac{1}{2}$ và $\\sin 30^\\circ = \\frac{1}{2}$ nên tổng bằng $0$.',
  },
  {
    expr: '\\sin 135^\\circ',
    answer: '$\\frac{\\sqrt{2}}{2}$',
    distractors: [
      {label: '$-\\frac{\\sqrt{2}}{2}$', errorCode: 'E06'},
      {label: '$\\frac{1}{2}$', errorCode: 'E06'},
      {label: '$\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
    ],
    solution: '$\\sin 135^\\circ = \\sin(180^\\circ - 45^\\circ) = \\sin 45^\\circ = \\frac{\\sqrt{2}}{2}$.',
  },
  {
    expr: '\\cos 120^\\circ',
    answer: '$-\\frac{1}{2}$',
    distractors: [
      {label: '$\\frac{1}{2}$', errorCode: 'E06'},
      {label: '$-\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
      {label: '$\\frac{\\sqrt{3}}{2}$', errorCode: 'E06'},
    ],
    solution: '$\\cos 120^\\circ = -\\cos 60^\\circ = -\\frac{1}{2}$.',
  },
  {
    expr: '\\tan 120^\\circ',
    answer: '$-\\sqrt{3}$',
    distractors: [
      {label: '$\\sqrt{3}$', errorCode: 'E06'},
      {label: '$-\\frac{\\sqrt{3}}{3}$', errorCode: 'E06'},
      {label: '$-1$', errorCode: 'E06'},
    ],
    solution: '$\\tan 120^\\circ = -\\tan 60^\\circ = -\\sqrt{3}$.',
  },
  {
    expr: '\\tan 150^\\circ',
    answer: '$-\\frac{\\sqrt{3}}{3}$',
    distractors: [
      {label: '$\\frac{\\sqrt{3}}{3}$', errorCode: 'E06'},
      {label: '$-\\sqrt{3}$', errorCode: 'E06'},
      {label: '$-\\frac{1}{2}$', errorCode: 'E06'},
    ],
    solution: '$\\tan 150^\\circ = -\\tan 30^\\circ = -\\frac{\\sqrt{3}}{3}$.',
  },
  {
    expr: '\\cot 135^\\circ',
    answer: '$-1$',
    distractors: [
      {label: '$1$', errorCode: 'E06'},
      {label: '$0$', errorCode: 'E06'},
      {label: '$-\\sqrt{3}$', errorCode: 'E06'},
    ],
    solution: '$\\cot 135^\\circ = -\\cot 45^\\circ = -1$.',
  },
  {
    expr: '\\cot 120^\\circ',
    answer: '$-\\frac{\\sqrt{3}}{3}$',
    distractors: [
      {label: '$\\frac{\\sqrt{3}}{3}$', errorCode: 'E06'},
      {label: '$-\\sqrt{3}$', errorCode: 'E06'},
      {label: '$-1$', errorCode: 'E06'},
    ],
    solution: '$\\cot 120^\\circ = -\\cot 60^\\circ = -\\frac{\\sqrt{3}}{3}$.',
  },
  {
    expr: '\\sin 120^\\circ - \\sin 60^\\circ',
    answer: '$0$',
    distractors: [
      {label: '$\\sqrt{3}$', errorCode: 'E06'},
      {label: '$-\\sqrt{3}$', errorCode: 'E06'},
      {label: '$1$', errorCode: 'E06'},
    ],
    solution: 'Hai góc $120^\\circ$ và $60^\\circ$ bù nhau nên $\\sin 120^\\circ = \\sin 60^\\circ$, hiệu bằng $0$.',
  },
  {
    expr: '\\cos 150^\\circ + \\cos 30^\\circ',
    answer: '$0$',
    distractors: [
      {label: '$\\sqrt{3}$', errorCode: 'E06'},
      {label: '$-\\sqrt{3}$', errorCode: 'E06'},
      {label: '$1$', errorCode: 'E06'},
    ],
    solution: 'Hai góc $150^\\circ$ và $30^\\circ$ bù nhau nên $\\cos 150^\\circ = -\\cos 30^\\circ$, tổng bằng $0$.',
  },
  {
    expr: '\\sin 90^\\circ + \\cos 180^\\circ',
    answer: '$0$',
    distractors: [
      {label: '$2$', errorCode: 'E06'},
      {label: '$1$', errorCode: 'E06'},
      {label: '$-1$', errorCode: 'E06'},
    ],
    solution: '$\\sin 90^\\circ = 1$ và $\\cos 180^\\circ = -1$ nên tổng bằng $0$.',
  },
  {
    expr: '2\\sin 150^\\circ + \\cos 180^\\circ',
    answer: '$0$',
    distractors: [
      {label: '$2$', errorCode: 'E06'},
      {label: '$-2$', errorCode: 'E06'},
      {label: '$1$', errorCode: 'E06'},
    ],
    solution: '$2\\sin 150^\\circ = 2\\cdot\\frac{1}{2} = 1$ và $\\cos 180^\\circ = -1$, tổng bằng $0$.',
  },
];

// Clean integer Heron triples (a, b, c, S)
const HERON_TRIPLES: ReadonlyArray<[number, number, number, number]> = [
  [13, 14, 15, 84],
  [5, 12, 13, 30],
  [7, 24, 25, 84],
  [10, 17, 21, 84],
  [11, 13, 20, 66],
  [6, 8, 10, 24],
  [9, 10, 17, 36],
  [15, 20, 25, 150],
];

export function generateQuestion(genId: GeneratorId, seedInput?: number): QuestionItem {
  const seed = seedInput ?? createAttemptSeed();
  const rng = mulberry32(seed);
  const qid = `${genId}_${seed}`;

  switch (genId) {
    case 'GEN_ANGLE_SUM': {
      const [v1, v2, v3] = pickOne(rng, TRIANGLE_NAME_SETS);
      const a1 = randInt(rng, 25, 85);
      const a2 = randInt(rng, 25, Math.min(85, 155 - a1));
      const a3 = 180 - a1 - a2;
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'NEN',
        skill_ids: ['angle_sum'],
        level: 1,
        type: 'numeric',
        stem_vi: `Tam giác $${v1}${v2}${v3}$ có $\\widehat{${v1}} = ${a1}^\\circ$ và $\\widehat{${v2}} = ${a2}^\\circ$. Tính $\\widehat{${v3}}$.`,
        expected_answer: {value: a3, rounded: a3, decimal_places: 0, unit: 'degree'},
        fixedUnitLabel: '°',
        solution_vi: `$\\widehat{${v3}} = 180^\\circ - ${a1}^\\circ - ${a2}^\\circ = ${a3}^\\circ$.`,
        anticipated_error_ids: ['E02'],
        hints_vi: ['Tổng ba góc trong một tam giác luôn bằng $180^\\circ$.', `Thực hiện $180 - (${a1} + ${a2})$.`],
        review_status: 'approved',
        source_refs: ['GEN_ANGLE_SUM'],
        is_adapted: true,
      };
    }

    case 'GEN_OPP_PAIR': {
      const verts = pickOne(rng, TRIANGLE_NAME_SETS);
      const targetIdx = randInt(rng, 0, 2);
      const other = [0, 1, 2].filter((i) => i !== targetIdx);
      const sideName = `${verts[other[0]]}${verts[other[1]]}`;
      const targetVertex = verts[targetIdx];
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'NEN',
        skill_ids: ['opposite_pair'],
        level: 1,
        type: 'tap_diagram',
        stem_vi: `Trong tam giác $${verts.join('')}$, góc nào đối diện cạnh $${sideName}$? (Chạm vào đỉnh đúng)`,
        expected_answer: {vertex: targetVertex},
        diagramData: {
          vertices: [verts[0], verts[1], verts[2]],
          coords: [
            [0, 0, 0],
            [55, 0, 0],
            [22, 0, 40],
          ],
          highlightSide: [other[0], other[1]],
          interactiveMode: 'tap_vertex',
        },
        solution_vi: `Đỉnh $${targetVertex}$ không thuộc cạnh $${sideName}$ nên $\\widehat{${targetVertex}}$ đối diện cạnh $${sideName}$.`,
        anticipated_error_ids: ['E01'],
        hints_vi: [`Xác định hai đầu mút của cạnh $${sideName}$.`, 'Đỉnh còn lại của tam giác là góc đối diện.'],
        review_status: 'approved',
        source_refs: ['GEN_OPP_PAIR'],
        is_adapted: true,
      };
    }

    case 'GEN_TRIG_VALUES': {
      const item = pickOne(rng, SPECIAL_TRIG_BANK);
      const options = shuffleWithSeed(
        [
          {id: 'correct', label: item.answer},
          ...item.distractors.map((d, i) => ({id: `d${i + 1}`, label: d.label, errorCode: d.errorCode})),
        ],
        seed,
      );
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'LG',
        skill_ids: ['trig_values'],
        level: 1,
        type: 'mcq',
        stem_vi: `Tính giá trị của biểu thức $${item.expr}$.`,
        options,
        expected_answer: {choice: 'correct'},
        solution_vi: item.solution,
        anticipated_error_ids: ['E06'],
        hints_vi: ['Nhớ lại bảng giá trị lượng giác góc đặc biệt và công thức hai góc bù nhau.'],
        review_status: 'approved',
        source_refs: ['GEN_TRIG_VALUES'],
        is_adapted: true,
      };
    }

    case 'GEN_UNITS': {
      const hyp = randInt(rng, 4, 24) * 2; // even integer 8..48 m
      const side = hyp / 2;
      const useSin = randInt(rng, 0, 1) === 0;
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'NEN',
        skill_ids: ['right_triangle_trig'],
        level: 1,
        type: 'numeric',
        stem_vi: useSin
          ? `Cho tam giác $ABC$ vuông tại $A$ có cạnh huyền $BC = ${hyp}\\text{ m}$ và $\\widehat{B} = 30^\\circ$. Tính độ dài cạnh góc vuông $AC$.`
          : `Cho tam giác $ABC$ vuông tại $A$ có cạnh huyền $BC = ${hyp}\\text{ m}$ và $\\widehat{B} = 60^\\circ$. Tính độ dài cạnh góc vuông $AB$.`,
        expected_answer: {value: side, rounded: side, decimal_places: 0, unit: 'm'},
        fixedUnitLabel: 'm',
        solution_vi: useSin
          ? `$AC = BC\\cdot\\sin 30^\\circ = ${hyp} \\cdot 0{,}5 = ${side}\\text{ m}$.`
          : `$AB = BC\\cdot\\cos 60^\\circ = ${hyp} \\cdot 0{,}5 = ${side}\\text{ m}$.`,
        anticipated_error_ids: ['E06', 'E01'],
        hints_vi: [
          useSin
            ? 'Trong tam giác vuông tại $A$, cạnh $AC$ đối diện góc $\\widehat{B}$ nên $AC = BC\\cdot\\sin B$.'
            : 'Trong tam giác vuông tại $A$, cạnh $AB$ kề góc $\\widehat{B}$ nên $AB = BC\\cdot\\cos B$.',
          useSin ? 'Thay $\\sin 30^\\circ = 0{,}5$ để tính.' : 'Thay $\\cos 60^\\circ = 0{,}5$ để tính.',
        ],
        review_status: 'approved',
        source_refs: ['GEN_UNITS'],
        is_adapted: true,
      };
    }

    case 'GEN_ROUND': {
      const a = randInt(rng, 6, 20) * 2; // 12..40 m
      const exactB = (a * Math.sin(degToRad(45))) / Math.sin(degToRad(30));
      const roundedB = roundToPlaces(exactB, 1);
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'NEN',
        skill_ids: ['sine_law', 'rounding'],
        level: 2,
        type: 'numeric',
        stem_vi: `Cho tam giác $ABC$ có cạnh $a = ${a}\\text{ m}$, $\\widehat{A} = 30^\\circ$ và $\\widehat{B} = 45^\\circ$. Tính độ dài cạnh $b$ (làm tròn đến $0{,}1\\text{ m}$).`,
        expected_answer: {exact_numeric: exactB, rounded: roundedB, decimal_places: 1, unit: 'm'},
        fixedUnitLabel: 'm',
        solution_vi: `Theo Định lí Sin: $b = \\frac{${a}\\sin 45^\\circ}{\\sin 30^\\circ} = ${a}\\sqrt{2} \\approx ${formatViNumber(roundedB, 1)}\\text{ m}$.`,
        anticipated_error_ids: ['E04', 'E05', 'E07'],
        hints_vi: [
          'Áp dụng Định lí Sin: $\\frac{a}{\\sin A} = \\frac{b}{\\sin B}$.',
          'Thay $\\sin 30^\\circ = 0{,}5$, $\\sin 45^\\circ = \\frac{\\sqrt{2}}{2}$ rồi làm tròn kết quả cuối đến $0{,}1\\text{ m}$.',
        ],
        review_status: 'approved',
        source_refs: ['GEN_ROUND'],
        is_adapted: true,
      };
    }

    case 'GEN_SIN_SIDE': {
      const ab = randInt(rng, 3, 12) * 10;
      const aDeg = randInt(rng, 35, 70);
      const bDeg = randInt(rng, 40, Math.min(75, 145 - aDeg));
      const cDeg = 180 - aDeg - bDeg;
      const exactAC = (ab * Math.sin(degToRad(bDeg))) / Math.sin(degToRad(cDeg));
      const roundedAC = roundToPlaces(exactAC, 1);
      const tri = buildTriangleFromBaseAndAngles(ab, aDeg, bDeg)!;
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'SIN',
        skill_ids: ['angle_sum', 'sine_law', 'rounding'],
        level: 3,
        type: 'numeric',
        stem_vi: `Khảo sát mô phỏng tam giác $ABC$ có $AB = ${ab}\\text{ m}, \\widehat{A} = ${aDeg}^\\circ, \\widehat{B} = ${bDeg}^\\circ$. Tính $AC$ làm tròn đến $0{,}1\\text{ m}$.`,
        expected_answer: {
          exact_numeric: exactAC,
          rounded: roundedAC,
          decimal_places: 1,
          unit: 'm',
        },
        fixedUnitLabel: 'm',
        diagramData: {
          vertices: ['A', 'B', 'C'],
          coords: [tri.A, tri.B, tri.C],
          highlightSide: [0, 2],
          interactiveMode: 'view_only',
          labels: {AB: `${ab} m`, AC: '?', A: `${aDeg}°`, B: `${bDeg}°`},
        },
        solution_vi: `$\\widehat{C} = ${cDeg}^\\circ$; $AC = \\frac{${ab}\\sin ${bDeg}^\\circ}{\\sin ${cDeg}^\\circ} \\approx ${formatViNumber(roundedAC, 1)}\\text{ m}$.`,
        anticipated_error_ids: ['E02', 'E04', 'E05', 'E07'],
        hints_vi: [
          `Bước 1: Tính góc đối diện cạnh $AB$: $\\widehat{C} = 180^\\circ - ${aDeg}^\\circ - ${bDeg}^\\circ$.`,
          'Bước 2: Áp dụng $\\frac{AC}{\\sin B} = \\frac{AB}{\\sin C}$, không làm tròn ở bước trung gian.',
        ],
        review_status: 'approved',
        source_refs: ['GEN_SIN_SIDE'],
        is_adapted: true,
      };
    }

    case 'GEN_SIN_R': {
      const angle = pickOne(rng, [30, 45, 60, 90, 120, 150] as const);
      const a = randInt(rng, 4, 24);
      const exactR = a / (2 * Math.sin(degToRad(angle)));
      const roundedR = roundToPlaces(exactR, 1);
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'SIN',
        skill_ids: ['sine_radius'],
        level: 2,
        type: 'numeric',
        stem_vi: `Tam giác $ABC$ có cạnh $a = ${a}\\text{ m}$ và góc đối diện $\\widehat{A} = ${angle}^\\circ$. Tính bán kính $R$ đường tròn ngoại tiếp (làm tròn đến $0{,}1\\text{ m}$).`,
        expected_answer: {exact_numeric: exactR, rounded: roundedR, decimal_places: 1, unit: 'm'},
        fixedUnitLabel: 'm',
        solution_vi: `$R = \\frac{a}{2\\sin A} = \\frac{${a}}{2\\sin ${angle}^\\circ} \\approx ${formatViNumber(roundedR, 1)}\\text{ m}$.`,
        anticipated_error_ids: ['E12', 'E06', 'E07'],
        hints_vi: ['Dùng công thức $\\frac{a}{\\sin A} = 2R$.', 'Nhớ chia $2$ để lấy bán kính $R$ chứ không phải đường kính $2R$.'],
        review_status: 'approved',
        source_refs: ['GEN_SIN_R'],
        is_adapted: true,
      };
    }

    case 'GEN_COS_SIDE': {
      const b = randInt(rng, 5, 16) * 5;
      const c = randInt(rng, 5, 16) * 5;
      const angleA = pickOne(rng, [60, 90, 120] as const);
      const exactA = Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(degToRad(angleA)));
      const roundedA = roundToPlaces(exactA, 1);
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'COS',
        skill_ids: ['cosine_law'],
        level: 2,
        type: 'numeric',
        stem_vi: `Tam giác khảo sát $ABC$ có $AB = ${c}\\text{ m}, AC = ${b}\\text{ m}$ và $\\widehat{A} = ${angleA}^\\circ$. Tính $BC$ (làm tròn đến $0{,}1\\text{ m}$).`,
        expected_answer: {exact_numeric: exactA, rounded: roundedA, decimal_places: 1, unit: 'm'},
        fixedUnitLabel: 'm',
        solution_vi: `$BC = \\sqrt{${c}^2 + ${b}^2 - 2\\cdot ${c}\\cdot ${b}\\cdot\\cos ${angleA}^\\circ} \\approx ${formatViNumber(roundedA, 1)}\\text{ m}$.`,
        anticipated_error_ids: ['E09', 'E10', 'E06', 'E07'],
        hints_vi: [
          'Dùng Định lý Côsin: $BC^2 = AB^2 + AC^2 - 2\\cdot AB\\cdot AC\\cdot\\cos A$.',
          'Chú ý dấu của $\\cos A$ nếu góc tù và đừng quên lấy căn bậc hai.',
        ],
        review_status: 'approved',
        source_refs: ['GEN_COS_SIDE'],
        is_adapted: true,
      };
    }

    case 'GEN_COS_ANGLE': {
      // Valid non-degenerate triangles with clean angles or 0.1 degree rounding
      const b = randInt(rng, 5, 12);
      const c = randInt(rng, 5, 12);
      const minA = Math.abs(b - c) + 2;
      const maxA = b + c - 2;
      const a = randInt(rng, minA, maxA);
      const cosA = (b * b + c * c - a * a) / (2 * b * c);
      const exactDeg = radToDeg(Math.acos(Math.max(-1, Math.min(1, cosA))));
      const roundedDeg = roundToPlaces(exactDeg, 1);
      const options = makeDistinctMcqOptions(
        roundedDeg,
        1,
        '°',
        [
          {val: roundToPlaces(180 - exactDeg, 1), errorCode: 'E06'},
          {val: roundToPlaces(Math.max(10, exactDeg - 14.5), 1), errorCode: 'E09'},
          {val: roundToPlaces(Math.min(165, exactDeg + 16.2), 1), errorCode: 'E09'},
        ],
        seed,
      );
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'COS',
        skill_ids: ['cosine_law'],
        level: 3,
        type: 'mcq',
        stem_vi: `Tam giác $ABC$ có ba cạnh $a = ${a}, b = ${b}, c = ${c}$. Số đo góc $\\widehat{A}$ (làm tròn đến $0{,}1^\\circ$) gần nhất với giá trị nào?`,
        options,
        expected_answer: {choice: 'correct', exact_numeric: exactDeg, rounded: roundedDeg},
        solution_vi: `$\\cos A = \\frac{${b}^2 + ${c}^2 - ${a}^2}{2\\cdot ${b}\\cdot ${c}} \\Rightarrow \\widehat{A} \\approx ${formatViNumber(roundedDeg, 1)}^\\circ$.`,
        anticipated_error_ids: ['E09', 'E06'],
        hints_vi: ['Áp dụng $\\cos A = \\frac{b^2 + c^2 - a^2}{2bc}$ rồi bấm $\\arccos$ ở chế độ độ (DEG).'],
        review_status: 'approved',
        source_refs: ['GEN_COS_ANGLE'],
        is_adapted: true,
      };
    }

    case 'GEN_AREA_SAS': {
      const a = randInt(rng, 4, 16) * 2;
      const b = randInt(rng, 4, 16) * 2;
      const angle = pickOne(rng, [30, 45, 60, 90, 120, 150] as const);
      const exactS = 0.5 * a * b * Math.sin(degToRad(angle));
      const roundedS = roundToPlaces(exactS, 1);
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'DT',
        skill_ids: ['area_sas'],
        level: 2,
        type: 'numeric',
        stem_vi: `Khu đất tam giác mô phỏng có hai cạnh $a = ${a}\\text{ m}, b = ${b}\\text{ m}$ và góc xen giữa $\\widehat{C} = ${angle}^\\circ$. Tính diện tích $S$ (làm tròn đến $0{,}1\\text{ m}^2$).`,
        expected_answer: {exact_numeric: exactS, rounded: roundedS, decimal_places: 1, unit: 'm²'},
        fixedUnitLabel: 'm²',
        solution_vi: `$S = \\frac{1}{2}\\cdot ${a}\\cdot ${b}\\cdot\\sin ${angle}^\\circ \\approx ${formatViNumber(roundedS, 1)}\\text{ m}^2$.`,
        anticipated_error_ids: ['E11', 'E06'],
        hints_vi: ['Công thức diện tích: $S = \\frac{1}{2}ab\\sin C$.', 'Đừng quên nhân với hệ số $\\frac{1}{2}$.'],
        review_status: 'approved',
        source_refs: ['GEN_AREA_SAS'],
        is_adapted: true,
      };
    }

    case 'GEN_AREA_HERON': {
      const [a0, b0, c0, s0] = pickOne(rng, HERON_TRIPLES);
      const scale = pickOne(rng, [1, 2] as const);
      const a = a0 * scale;
      const b = b0 * scale;
      const c = c0 * scale;
      const S = s0 * scale * scale;
      const p = (a + b + c) / 2;
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'DT',
        skill_ids: ['area_heron'],
        level: 3,
        type: 'numeric',
        stem_vi: `Tính diện tích khu vườn tam giác mô phỏng có ba cạnh $a = ${a}\\text{ m}, b = ${b}\\text{ m}, c = ${c}\\text{ m}$.`,
        expected_answer: {exact_numeric: S, rounded: S, decimal_places: 0, unit: 'm²'},
        fixedUnitLabel: 'm²',
        solution_vi: `Nửa chu vi $p = ${p}\\text{ m}$; $S = \\sqrt{${p}(${p}-${a})(${p}-${b})(${p}-${c})} = ${S}\\text{ m}^2$.`,
        anticipated_error_ids: ['E11'],
        hints_vi: [`Tính nửa chu vi $p = \\frac{${a}+${b}+${c}}{2}$.`, 'Áp dụng công thức Heron $S = \\sqrt{p(p-a)(p-b)(p-c)}$.'],
        review_status: 'approved',
        source_refs: ['GEN_AREA_HERON'],
        is_adapted: true,
      };
    }

    case 'GEN_HEIGHT': {
      const [a0, b0, c0, s0] = pickOne(rng, HERON_TRIPLES);
      const base = pickOne(rng, [a0, b0, c0] as const);
      const exactH = (2 * s0) / base;
      const roundedH = roundToPlaces(exactH, 1);
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'DT',
        skill_ids: ['height'],
        level: 3,
        type: 'numeric',
        stem_vi: `Tam giác mô phỏng có diện tích $S = ${s0}\\text{ m}^2$ và cạnh đáy dài $${base}\\text{ m}$. Tính độ dài đường cao tương ứng với cạnh đáy đó (làm tròn đến $0{,}1\\text{ m}$).`,
        expected_answer: {exact_numeric: exactH, rounded: roundedH, decimal_places: 1, unit: 'm'},
        fixedUnitLabel: 'm',
        solution_vi: `Từ $S = \\frac{1}{2} a h_a \\Rightarrow h_a = \\frac{2S}{a} = \\frac{2\\cdot ${s0}}{${base}} \\approx ${formatViNumber(roundedH, 1)}\\text{ m}$.`,
        anticipated_error_ids: ['E11', 'E07'],
        hints_vi: ['Từ $S = \\frac{1}{2} \\cdot \\text{đáy} \\cdot h$, suy ra $h = \\frac{2S}{\\text{đáy}}$.'],
        review_status: 'approved',
        source_refs: ['GEN_HEIGHT'],
        is_adapted: true,
      };
    }

    case 'GEN_ERROR_SPOT': {
      const abLen = pickOne(rng, [40, 50, 60, 70, 80, 90] as const);
      const bLen = pickOne(rng, [5, 6, 7, 8, 9] as const);
      const cLen = pickOne(rng, [7, 8, 9, 10, 12] as const);
      const diam = pickOne(rng, [16, 18, 20, 22, 24, 26, 28, 30] as const);
      const halfDiam = diam / 2;
      const areaProd = bLen * cLen;
      const templates = [
        {
          stem: `Trong tam giác $ABC$ ($AB = ${abLen}\\text{ m}, \\widehat{A} = 50^\\circ, \\widehat{B} = 60^\\circ, \\widehat{C} = 70^\\circ$), một bạn viết $\\frac{AC}{\\sin 50^\\circ} = \\frac{${abLen}}{\\sin 70^\\circ}$. Lỗi nằm ở đâu?`,
          correct: 'Ghép nhầm $AC$ với $\\widehat{A}=50^\\circ$; cạnh $AC$ phải đối diện góc $\\widehat{B}=60^\\circ$',
          wrong1: 'Ghép nhầm $AB$ với $\\widehat{C}=70^\\circ$',
          wrong2: 'Định lý Sin phải dùng $\\cos$ thay vì $\\sin$',
          err: 'E01',
          sol: `Cạnh $AC$ đối diện đỉnh $B$, nên đúng phải là $\\frac{AC}{\\sin 60^\\circ} = \\frac{${abLen}}{\\sin 70^\\circ}$.`,
        },
        {
          stem: `Tính $BC$ với $AB = ${bLen}, AC = ${cLen}, \\widehat{A} = 60^\\circ$, một bạn viết $BC^2 = ${bLen}^2 + ${cLen}^2 + 2\\cdot ${bLen}\\cdot ${cLen}\\cdot\\cos 60^\\circ$. Điểm cần sửa là gì?`,
          correct: `Dấu trước $2\\cdot ${bLen}\\cdot ${cLen}\\cdot\\cos 60^\\circ$ phải là dấu trừ ($-$)`,
          wrong1: 'Thiếu bình phương ở $\\cos 60^\\circ$',
          wrong2: 'Không cần nhân hệ số $2$',
          err: 'E09',
          sol: 'Định lý Côsin có dấu trừ: $BC^2 = AB^2 + AC^2 - 2\\cdot AB\\cdot AC\\cdot\\cos A$.',
        },
        {
          stem: `Biết $\\frac{a}{\\sin A} = ${diam}\\text{ m}$, một bạn kết luận bán kính đường tròn ngoại tiếp $R = ${diam}\\text{ m}$. Bạn cần kiểm tra bước nào?`,
          correct: `$\\frac{a}{\\sin A} = 2R$ nên bán kính $R = ${halfDiam}\\text{ m}$ chứ không phải $${diam}\\text{ m}$`,
          wrong1: `Phải nhân đôi $${diam}$ để được $R = ${diam * 2}\\text{ m}$`,
          wrong2: `Phải lấy căn bậc hai của $${diam}$`,
          err: 'E12',
          sol: `Theo Định lý Sin, $\\frac{a}{\\sin A} = 2R = ${diam} \\Rightarrow R = ${halfDiam}\\text{ m}$.`,
        },
        {
          stem: `Tính diện tích tam giác có hai cạnh $${bLen}\\text{ m}, ${cLen}\\text{ m}$ và góc xen giữa $30^\\circ$, một bạn tính $S = ${bLen}\\cdot ${cLen}\\cdot\\sin 30^\\circ = ${areaProd / 2}\\text{ m}^2$. Bước nào cần sửa?`,
          correct: `Thiếu hệ số $\\frac{1}{2}$ trong công thức $S = \\frac{1}{2}bc\\sin A$`,
          wrong1: 'Phải thay $\\sin 30^\\circ$ bằng $\\cos 30^\\circ$',
          wrong2: `Phải cộng hai cạnh $${bLen} + ${cLen}$ thay vì nhân`,
          err: 'E11',
          sol: `Công thức đúng là $S = \\frac{1}{2}\\cdot ${bLen}\\cdot ${cLen}\\cdot\\sin 30^\\circ = ${areaProd / 4}\\text{ m}^2$.`,
        },
        {
          stem: `Tính $a^2$ khi $b = ${bLen}, c = ${cLen}, \\widehat{A} = 120^\\circ$, một bạn thay $\\cos 120^\\circ = \\frac{1}{2}$ vào Định lý Côsin. Sai sót nằm ở đâu?`,
          correct: 'Góc $120^\\circ$ là góc tù nên $\\cos 120^\\circ = -\\frac{1}{2}$, không phải $\\frac{1}{2}$',
          wrong1: 'Phải dùng $\\sin 120^\\circ$ trong Định lý Côsin',
          wrong2: 'Không dùng được Định lý Côsin cho tam giác tù',
          err: 'E06',
          sol: 'Với góc tù $120^\\circ$, $\\cos 120^\\circ = -\\cos 60^\\circ = -\\frac{1}{2}$.',
        },
      ];
      const tpl = pickOne(rng, templates);
      const options = shuffleWithSeed(
        [
          {id: 'correct', label: tpl.correct},
          {id: 'd1', label: tpl.wrong1, errorCode: tpl.err},
          {id: 'd2', label: tpl.wrong2, errorCode: tpl.err},
        ],
        seed,
      );
      return {
        id: qid,
        generatorId: genId,
        seed,
        cluster: 'MH',
        skill_ids: ['error_spot'],
        level: 4,
        type: 'error_spot',
        stem_vi: tpl.stem,
        options,
        expected_answer: {choice: 'correct'},
        solution_vi: tpl.sol,
        anticipated_error_ids: [tpl.err],
        hints_vi: ['Đối chiếu lại công thức gốc trong Sổ tay Hệ thức lượng rồi so sánh từng hạng tử.'],
        review_status: 'approved',
        source_refs: ['GEN_ERROR_SPOT'],
        is_adapted: true,
      };
    }
  }
}

export const CLUSTER_TO_GENERATORS: Record<SkillCluster, GeneratorId[]> = {
  NEN: ['GEN_ANGLE_SUM', 'GEN_OPP_PAIR', 'GEN_UNITS', 'GEN_ROUND'],
  LG: ['GEN_TRIG_VALUES'],
  COS: ['GEN_COS_SIDE', 'GEN_COS_ANGLE'],
  SIN: ['GEN_SIN_SIDE', 'GEN_SIN_R'],
  DT: ['GEN_AREA_SAS', 'GEN_AREA_HERON', 'GEN_HEIGHT'],
  MH: ['GEN_SIN_SIDE', 'GEN_ERROR_SPOT'],
};

/**
 * Generates a fresh randomized set of questions for practice or BOSS battle.
 * Avoids repeating IDs from the last 3 sessions and prioritizes Đang luyện / Cần ôn lại clusters.
 */
export function buildAdaptiveQuestionSet(params: {
  count: number;
  clusters?: SkillCluster[];
  levelFilter?: 1 | 2 | 3 | 4 | 'all';
  bank: QuestionItem[];
  allowPending: boolean;
  skills?: Record<SkillCluster, SkillRecord>;
  recentSessions?: string[][];
}): QuestionItem[] {
  const recentSet = new Set((params.recentSessions ?? []).slice(-3).flat());
  let targetClusters: SkillCluster[] =
    params.clusters && params.clusters.length > 0
      ? [...params.clusters]
      : ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'];

  // Prioritize clusters needing practice or review when no specific cluster filter was locked
  if ((!params.clusters || params.clusters.length === 0) && params.skills) {
    const priority = targetClusters.filter(
      (c) => params.skills![c]?.state === 'Cần ôn lại' || params.skills![c]?.state === 'Đang luyện',
    );
    if (priority.length > 0) {
      targetClusters = [...priority, ...targetClusters.filter((c) => !priority.includes(c))];
    }
  }

  const eligibleBank = params.bank.filter((q) => {
    if (!params.allowPending && q.review_status !== 'approved') return false;
    if (q.review_status === 'rejected') return false;
    if (q.standalone === false) return false;
    if (!targetClusters.includes(q.cluster)) return false;
    if (params.levelFilter && params.levelFilter !== 'all' && q.level !== params.levelFilter) {
      return false;
    }
    if (recentSet.has(q.id)) return false;
    return true;
  });

  const chosen: QuestionItem[] = [];
  const shuffledBank = shuffleWithSeed(eligibleBank, createAttemptSeed());

  // Mix bank items (up to half) and fresh procedural variants so every session feels new
  const maxBank = Math.min(Math.floor(params.count / 2), shuffledBank.length);
  for (let i = 0; i < maxBank; i++) {
    const q = shuffledBank[i];
    chosen.push(
      q.options ? {...q, options: shuffleWithSeed(q.options, createAttemptSeed())} : q,
    );
  }

  // Fill remaining slots with fresh procedural generators
  let safety = 0;
  while (chosen.length < params.count && safety < 50) {
    safety += 1;
    const cluster = targetClusters[(chosen.length + safety) % targetClusters.length];
    const gens = CLUSTER_TO_GENERATORS[cluster];
    const genId = gens[(chosen.length + safety) % gens.length];
    const generated = generateQuestion(genId, createAttemptSeed() + safety * 7919);
    if (
      params.levelFilter &&
      params.levelFilter !== 'all' &&
      Math.abs(generated.level - params.levelFilter) > 1 &&
      safety < 20
    ) {
      continue;
    }
    chosen.push(generated);
  }

  return chosen;
}

export function generateVariantForBossHit(cluster: SkillCluster, level: 1 | 2 | 3 | 4): QuestionItem {
  const gens = CLUSTER_TO_GENERATORS[cluster];
  const seed = createAttemptSeed();
  const rng = mulberry32(seed);
  // Prefer higher-level generators for level 3-4
  const genId =
    level >= 3 && cluster === 'MH'
      ? pickOne(rng, ['GEN_ERROR_SPOT', 'GEN_SIN_SIDE'] as const)
      : pickOne(rng, gens);
  const q = generateQuestion(genId, seed);
  return {...q, level, stage: 'boss'};
}

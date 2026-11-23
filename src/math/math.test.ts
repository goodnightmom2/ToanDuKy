import assert from 'node:assert/strict';
import test from 'node:test';
import {DataService} from '../services/dataService.ts';
import type {QuestionItem} from '../types.ts';
import {
  compareNumberMultisets,
  evaluateSafeDegreeExpression,
  extractNumberTokens,
  formatVi,
  normalizeMath,
  renderKatexSafe,
  splitMath,
  verifyQuestionMathLayers,
} from './mathEngine.ts';
import {ALL_INITIAL_QUESTIONS} from './seedBank.ts';

class MemoryStore {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

export const APPENDIX_GOLDEN_TESTS: Array<{id: number; input: string; expected: string}> = [
  {id: 1, input: 'sin60° − cos30° = 0', expected: '$\\sin 60^\\circ-\\cos 30^\\circ=0$'},
  {id: 2, input: 'AC/sin60° = AB/sin70°', expected: '$\\dfrac{AC}{\\sin 60^\\circ}=\\dfrac{AB}{\\sin 70^\\circ}$'},
  {id: 3, input: 'AC = 60·sin60°/sin70° ≈ 55,3 m', expected: '$AC=\\dfrac{60\\sin 60^\\circ}{\\sin 70^\\circ}\\approx 55{,}3\\ \\mathrm{m}$'},
  {id: 4, input: 'a² = b² + c² − 2bc·cosA', expected: '$a^2=b^2+c^2-2bc\\cos A$'},
  {id: 5, input: 'cosA = (b²+c²−a²)/(2bc)', expected: '$\\cos A=\\dfrac{b^2+c^2-a^2}{2bc}$'},
  {id: 6, input: '∠BAC = 50°', expected: '$\\widehat{BAC}=50^\\circ$'},
  {id: 7, input: 'S = ½·20·30·sin60° = 150√3 ≈ 259,8 m²', expected: '$S=\\dfrac{1}{2}\\cdot 20\\cdot 30\\cdot\\sin 60^\\circ=150\\sqrt{3}\\approx 259{,}8\\ \\mathrm{m}^2$'},
  {id: 8, input: 'p = (13+14+15)/2 = 21', expected: '$p=\\dfrac{13+14+15}{2}=21$'},
  {id: 9, input: 'S = √(21·8·7·6) = 84', expected: '$S=\\sqrt{21\\cdot 8\\cdot 7\\cdot 6}=84$'},
  {id: 10, input: '0,75 km = 750 m', expected: '$0{,}75\\ \\mathrm{km}=750\\ \\mathrm{m}$'},
  {id: 11, input: 'x/sin30° = 12/sin90°', expected: '$\\dfrac{x}{\\sin 30^\\circ}=\\dfrac{12}{\\sin 90^\\circ}$'},
  {id: 12, input: 'AB = 10√13 ≈ 36,1 m', expected: '$AB=10\\sqrt{13}\\approx 36{,}1\\ \\mathrm{m}$'},
  {id: 13, input: 'sin(180° − α) = sinα', expected: '$\\sin(180^\\circ-\\alpha)=\\sin\\alpha$'},
  {id: 14, input: 'R = a/(2sinA)', expected: '$R=\\dfrac{a}{2\\sin A}$'},
  {id: 15, input: 'h = d·sinα·sinβ/sin(β − α)', expected: '$h=\\dfrac{d\\sin\\alpha\\sin\\beta}{\\sin(\\beta-\\alpha)}$'},
  {id: 16, input: 'tg α, cotg α', expected: '$\\tan\\alpha,\\ \\cot\\alpha$'},
  {id: 17, input: 'ΔABC có AB ⊥ CH', expected: '$\\triangle ABC$ có $AB\\perp CH$'},
  {id: 18, input: '→AB', expected: '$\\overrightarrow{AB}$'},
  {id: 19, input: 'C ≈ (35,543776; 0; 42,359423)', expected: '$C\\approx(35{,}543776;\\ 0;\\ 42{,}359423)$'},
  {
    id: 20,
    input: 'đu quay có đường kính 115 m … BC cách nhau 345 m … góc BAC nhỏ nhất',
    expected: 'đu quay có đường kính $115\\ \\mathrm{m}$ … $BC$ cách nhau $345\\ \\mathrm{m}$ … góc $\\widehat{BAC}$ nhỏ nhất',
  },
];

test('1. Golden tests (Phụ lục #1–#22) cho normalizeMath & splitMath', () => {
  for (const tc of APPENDIX_GOLDEN_TESTS) {
    const res = normalizeMath(tc.input);
    assert.equal(res.flags.length, 0, `Golden #${tc.id} có cờ lỗi: ${res.flags.join(',')}`);
    assert.equal(res.normalized, tc.expected, `Golden #${tc.id} lệch:\n  Got: ${res.normalized}\n  Exp: ${tc.expected}`);
  }
  // Golden #18 variant: vectơ AB
  assert.equal(normalizeMath('vectơ AB').normalized, '$\\overrightarrow{AB}$');

  // Golden #21: Unbalanced dollar -> unbalanced_dollar, NEVER guesses
  const unbal = splitMath('Tính cạnh $AC = 55,3 m');
  assert.equal(unbal.error, 'unbalanced_dollar');
  const normUnbal = normalizeMath('Tính cạnh $AC = 55,3 m');
  assert.ok(normUnbal.flags.includes('unbalanced_dollar'));
  assert.equal(normUnbal.changed, false);

  // Escaped \$ in text stays literal '$'
  const esc = splitMath('Giá vé là \\$50 và góc $\\widehat{A}=60^\\circ$.');
  assert.equal(esc.error, undefined);
  assert.equal(esc.segments[0].value, 'Giá vé là $50 và góc ');

  // Golden #22: Vietnamese decimal preserved as 55{,}3 (not 55.3 or 55, 3)
  const decRes = normalizeMath('AC ≈ 55,3 m');
  assert.ok(decRes.normalized.includes('55{,}3'));
  assert.ok(!decRes.normalized.includes('55.3'));
  assert.equal(formatVi(55.296, 1), '55,3');
});

test('2. KaTeX parse: toàn bộ LaTeX Phụ lục render không lỗi & có MathML không rỗng', () => {
  for (const tc of APPENDIX_GOLDEN_TESTS) {
    const split = splitMath(tc.expected);
    assert.equal(split.error, undefined, `splitMath lỗi ở Golden #${tc.id}`);
    for (const seg of split.segments) {
      if (seg.type !== 'text') {
        const k = renderKatexSafe(seg.value, {displayMode: seg.type === 'block', strictMode: true});
        assert.equal(k.ok, true, `KaTeX lỗi ở Golden #${tc.id}: ${k.rawError}`);
        assert.ok(k.html.includes('<math'), `Thiếu MathML ở Golden #${tc.id}`);
      }
    }
  }
});

test('3. Bảo toàn số (property-based trên 220 chuỗi sinh ngẫu nhiên)', () => {
  for (let i = 1; i <= 220; i++) {
    const a = (i * 7) % 97 + 1;
    const b = ((i * 13) % 83) + 2;
    const dec = `${a},${(i * 3) % 9 + 1}`;
    const deg = ((i * 11) % 150) + 10;
    const variants = [
      `Cho tam giác có cạnh ${dec} m và góc ${deg}°`,
      `AC = ${a}·sin${deg}°/sin${Math.min(170, deg + 5)}° ≈ ${dec} m`,
      `∠BAC = ${deg}° và S = ${b}√${(i % 17) + 2} ≈ ${dec} m²`,
    ];
    const sample = variants[i % variants.length];
    const res = normalizeMath(sample);
    const before = extractNumberTokens(sample);
    const after = extractNumberTokens(res.normalized);
    const cmp = compareNumberMultisets(before, after);
    assert.equal(cmp.match, true, `Lệch số ở mẫu #${i}: ${sample} -> ${res.normalized}`);
  }
});

test('4. Lớp kiểm tra (a)–(d) phát hiện thiếu số, thừa số, lệch ký hiệu, thiếu ngoặc }, đáp án sai', () => {
  const baseQ: QuestionItem = {
    ...ALL_INITIAL_QUESTIONS[0],
    id: 'layer_test_q',
    type: 'numeric',
    pattern_id: 'COS-02',
    givens: {a: 7, b: 8, c: 5},
    stem_vi: 'Tam giác $ABC$ có $a=7, b=8, c=5$. Tính góc $\\widehat{A}$.',
    expected_answer: {value: 60, rounded: 60, decimal_places: 1, unit: '°'},
  };

  // (a) Missing closing brace
  const badSyntax = verifyQuestionMathLayers({...baseQ, stem_vi: 'Tính $\\dfrac{a}{b$'});
  assert.ok(badSyntax.flags.includes('latex_syntax_error'));

  // (b) Missing / extra number vs reference text
  const missingNum = verifyQuestionMathLayers(baseQ, {
    referenceText: 'Tam giác ABC có a=7, b=8, c=5, d=12. Tính góc A.',
  });
  assert.ok(missingNum.flags.includes('numbers_mismatch'));
  assert.ok(missingNum.numberMismatch?.missing.includes('12'));

  // (c) Symbol mismatch vs double-check read
  const symDiff = verifyQuestionMathLayers(baseQ, {
    doubleCheckText: 'Tam giác ABC có a=7, b=8, c=5, góc 60° và √3.',
  });
  assert.ok(symDiff.flags.includes('symbols_mismatch'));

  // (d) Wrong answer vs solver
  const wrongAns = verifyQuestionMathLayers({
    ...baseQ,
    expected_answer: {value: 90, rounded: 90, decimal_places: 1, unit: '°'},
  });
  assert.equal(wrongAns.solverStatus, 'fail');
  assert.ok(wrongAns.flags.includes('answer_mismatch'));
});

test('5. Cổng duyệt math_verified=false không thể approved; sửa công thức reset về false', async () => {
  const svc = new DataService(new MemoryStore());
  await svc.setupFirstAdmin({username: 'adm_math', password: 'Password123', displayName: 'Admin'});
  const admin = svc.getCurrentUser()!;

  const q: QuestionItem = {
    ...ALL_INITIAL_QUESTIONS[0],
    id: 'math_gate_q1',
    stem_vi: 'Tính $\\sin 60^\\circ + \\cos 30^\\circ$.',
    review_status: 'pending_teacher_review',
    math_verified: false,
  };
  svc.upsertQuestion(admin, q, 'Tạo mới');

  // Cannot approve while math_verified === false
  assert.equal(svc.setQuestionReviewStatus(admin, ['math_gate_q1'], 'approved'), false);

  // Mark math verified -> now approval succeeds
  const vRes = svc.markQuestionMathVerified(admin, ['math_gate_q1'], true);
  assert.equal(vRes.ok, true);
  assert.equal(svc.setQuestionReviewStatus(admin, ['math_gate_q1'], 'approved'), true);

  // Editing the formula resets math_verified back to false
  const current = svc.getQuestions().find((x) => x.id === 'math_gate_q1')!;
  svc.upsertQuestion(admin, {...current, stem_vi: 'Tính $\\sin 45^\\circ + \\cos 45^\\circ$.'}, 'Sửa góc');
  const afterEdit = svc.getQuestions().find((x) => x.id === 'math_gate_q1')!;
  assert.equal(afterEdit.math_verified, false);
});

test('6. Bảo mật: chặn \\href, \\url, \\includegraphics, <script> và đánh giá biểu thức độ an toàn', () => {
  assert.equal(renderKatexSafe('\\href{javascript:alert(1)}{click}').ok, false);
  assert.equal(renderKatexSafe('\\url{https://evil.test}').ok, false);
  assert.equal(renderKatexSafe('\\includegraphics{x.png}').ok, false);
  assert.equal(renderKatexSafe('<script>alert(1)</script>').ok, false);

  const ev = evaluateSafeDegreeExpression('60*sin(60)/sin(70)');
  assert.equal(ev.valid, true);
  assert.ok(Math.abs((ev.value ?? 0) - 55.2963) < 1e-3);
  assert.ok(ev.previewLatex.includes('\\dfrac'));
});

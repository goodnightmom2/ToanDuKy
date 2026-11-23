import {JOURNEY_MILESTONES} from '../journey.ts';
import type {MocId, QuestionItem, SkillCluster, TaxonomyPattern, TaxonomyTopic} from '../types.ts';

export const PROMPT_VERSION = 'v2.1';

/**
 * 26 default Chapter III taxonomy patterns from Appendix A.
 * Used as default seed for LocalAdapter and fallback if remote taxonomy hasn't loaded yet.
 */
export const DEFAULT_TAXONOMY_PATTERNS: TaxonomyPattern[] = [
  {id: 'NEN-01', topic: 'NEN', name: 'Tổng ba góc, tìm góc còn lại', typical_levels: [1], suggested_mocs: [1], has_solver: true, solver_hint: '180 − A − B', sort_order: 10, status: 'active'},
  {id: 'NEN-02', topic: 'NEN', name: 'Cạnh đối diện góc', typical_levels: [1], suggested_mocs: [1], has_solver: false, solver_hint: 'Xác định đỉnh đối diện cạnh', sort_order: 20, status: 'active'},
  {id: 'NEN-03', topic: 'NEN', name: 'Hệ thức tam giác vuông, đổi đơn vị & làm tròn', typical_levels: [1], suggested_mocs: [1], has_solver: true, solver_hint: 'Quy đổi / làm tròn chuẩn / tam giác vuông', sort_order: 30, status: 'active'},
  {id: 'LG-01', topic: 'LG', name: 'Giá trị lượng giác góc đặc biệt', typical_levels: [1, 2], suggested_mocs: [2], has_solver: true, solver_hint: 'Tra bảng góc đặc biệt 0°–180°', sort_order: 40, status: 'active'},
  {id: 'LG-02', topic: 'LG', name: 'Góc bù: sin(180°−α)=sinα, cos(180°−α)=−cosα', typical_levels: [2], suggested_mocs: [2], has_solver: true, solver_hint: 'Áp dụng quan hệ góc bù', sort_order: 50, status: 'active'},
  {id: 'LG-03', topic: 'LG', name: 'Dấu của giá trị lượng giác, góc tù', typical_levels: [2], suggested_mocs: [2], has_solver: true, solver_hint: 'Xét dấu 0°–90° và 90°–180°', sort_order: 60, status: 'active'},
  {id: 'LG-04', topic: 'LG', name: 'Hệ thức sin²α+cos²α=1, tan, cot', typical_levels: [2, 3], suggested_mocs: [2], has_solver: true, solver_hint: 'Tính giá trị còn lại từ 1 giá trị lượng giác', sort_order: 70, status: 'active'},
  {id: 'COS-01', topic: 'COS', name: 'Cosin: tìm cạnh (hai cạnh + góc xen giữa)', typical_levels: [2], suggested_mocs: [3], has_solver: true, solver_hint: 'a = √(b² + c² − 2bc·cosA)', sort_order: 80, status: 'active'},
  {id: 'COS-02', topic: 'COS', name: 'Cosin: tìm góc (ba cạnh)', typical_levels: [2, 3], suggested_mocs: [4], has_solver: true, solver_hint: 'A = arccos((b² + c² − a²)/(2bc))', sort_order: 90, status: 'active'},
  {id: 'COS-03', topic: 'COS', name: 'Nhận dạng tam giác nhọn/vuông/tù', typical_levels: [3], suggested_mocs: [4], has_solver: true, solver_hint: 'So sánh a² với b² + c²', sort_order: 100, status: 'active'},
  {id: 'COS-04', topic: 'COS', name: 'Cosin trong bài toán thực tế (khoảng cách, hướng đi)', typical_levels: [3], suggested_mocs: [4], has_solver: true, solver_hint: 'Áp dụng Định lí Côsin từ givens', sort_order: 110, status: 'active'},
  {id: 'SIN-01', topic: 'SIN', name: 'Sin: tìm cạnh (một cạnh + hai góc)', typical_levels: [2, 3], suggested_mocs: [5], has_solver: true, solver_hint: 'b = a·sinB / sinA', sort_order: 120, status: 'active'},
  {id: 'SIN-02', topic: 'SIN', name: 'Sin: tìm góc, biện luận', typical_levels: [3], suggested_mocs: [5], has_solver: true, solver_hint: 'Kiểm miền góc 0° < B < 180° − A', sort_order: 130, status: 'active'},
  {id: 'SIN-03', topic: 'SIN', name: 'Bán kính đường tròn ngoại tiếp R', typical_levels: [2, 3], suggested_mocs: [5], has_solver: true, solver_hint: 'R = a / (2·sinA)', sort_order: 140, status: 'active'},
  {id: 'MH-01', topic: 'MH', name: 'Đo khoảng cách không tới được (đường đáy + hai góc)', typical_levels: [3], suggested_mocs: [6], has_solver: true, solver_hint: 'Tính góc thứ ba rồi dùng Định lí Sin', sort_order: 150, status: 'active'},
  {id: 'MH-03', topic: 'MH', name: 'Giải tam giác', typical_levels: [3], suggested_mocs: [6], has_solver: true, solver_hint: 'Kết hợp Định lí Côsin & Sin', sort_order: 160, status: 'active'},
  {id: 'DT-01', topic: 'DT', name: 'S = ½bc·sinA (hai cạnh + góc xen giữa)', typical_levels: [2, 3], suggested_mocs: [7], has_solver: true, solver_hint: '½·b·c·sinA', sort_order: 170, status: 'active'},
  {id: 'DT-02', topic: 'DT', name: 'Công thức Heron', typical_levels: [3], suggested_mocs: [8], has_solver: true, solver_hint: '√[p(p−a)(p−b)(p−c)]', sort_order: 180, status: 'active'},
  {id: 'DT-03', topic: 'DT', name: 'S = pr (bán kính nội tiếp)', typical_levels: [3, 4], suggested_mocs: [8], has_solver: true, solver_hint: 'r = S / p', sort_order: 190, status: 'active'},
  {id: 'DT-04', topic: 'DT', name: 'S = abc / (4R)', typical_levels: [3, 4], suggested_mocs: [8], has_solver: true, solver_hint: 'R = abc / (4S) hoặc S = abc / (4R)', sort_order: 200, status: 'active'},
  {id: 'DT-05', topic: 'DT', name: 'Diện tích trong bài toán thực tế / chia tam giác', typical_levels: [3, 4], suggested_mocs: [8, 9], has_solver: true, solver_hint: 'Tính diện tích từ givens', sort_order: 210, status: 'active'},
  {id: 'MH-02', topic: 'MH', name: 'Đo chiều cao bằng hai góc ngắm', typical_levels: [4], suggested_mocs: [9], has_solver: true, solver_hint: 'h = d·sinα·sinβ / sin(β−α)', sort_order: 220, status: 'active'},
  {id: 'MH-04', topic: 'MH', name: 'Chuyển động, hướng, vị trí (tàu, máy bay…)', typical_levels: [3, 4], suggested_mocs: [9], has_solver: true, solver_hint: 'Tính khoảng cách từ vận tốc, thời gian & góc', sort_order: 230, status: 'active'},
  {id: 'MH-05', topic: 'MH', name: 'Tìm lỗi sai, phản biện lời giải', typical_levels: [4], suggested_mocs: [9, 10], has_solver: false, solver_hint: 'Cần giáo viên thẩm định lập luận', sort_order: 240, status: 'active'},
  {id: 'MH-06', topic: 'MH', name: 'Bài tối ưu / vận dụng cao (góc nhìn, đu quay…)', typical_levels: [4], suggested_mocs: [10], has_solver: false, solver_hint: 'Chưa có bộ giải số — cần giáo viên duyệt', sort_order: 250, status: 'active'},
  {id: 'OUT-00', topic: 'OUT', name: 'Ngoài Chương III (Mệnh đề, tập hợp, BPT…)', typical_levels: [1], suggested_mocs: [], has_solver: false, solver_hint: 'Không đưa vào game', sort_order: 999, status: 'active'},
];

export const DEFAULT_TAXONOMY_BY_ID: Record<string, TaxonomyPattern> = Object.fromEntries(
  DEFAULT_TAXONOMY_PATTERNS.map((p) => [p.id, p]),
);

/**
 * Deterministic rule-based suggested milestones from (topic, pattern_id, level) + journey.ts.
 * Never delegates milestone assignment to the AI model (Section 3.2).
 */
export function computeSuggestedStations(params: {
  topic: TaxonomyTopic;
  patternId?: string | null;
  level: 1 | 2 | 3 | 4;
  taxonomy?: TaxonomyPattern[];
}): MocId[] {
  if (params.topic === 'OUT' || params.patternId === 'OUT-00') return [];
  const catalog = params.taxonomy ?? DEFAULT_TAXONOMY_PATTERNS;
  if (params.patternId) {
    const found = catalog.find((p) => p.id === params.patternId);
    if (found && found.suggested_mocs.length > 0) {
      return [...found.suggested_mocs];
    }
  }
  const cluster = params.topic as SkillCluster;
  const exact = JOURNEY_MILESTONES.filter(
    (m) => m.clusters.includes(cluster) && m.levels.includes(params.level),
  ).map((m) => m.id);
  if (exact.length > 0) return exact;

  const byCluster = JOURNEY_MILESTONES.filter((m) => m.clusters.includes(cluster)).map((m) => m.id);
  return byCluster.length > 0 ? byCluster : [1];
}

/**
 * Infers a best-guess pattern_id for legacy questions that predate taxonomy tagging.
 */
export function inferPatternIdForQuestion(q: QuestionItem): string {
  if (q.pattern_id) return q.pattern_id;
  const skills = q.skill_ids.join(' ').toLowerCase();
  const stem = q.stem_vi.toLowerCase();

  if (q.cluster === 'NEN') {
    if (skills.includes('opposite') || /đối diện/i.test(stem)) return 'NEN-02';
    if (skills.includes('angle_sum') || /180|tổng ba góc|tính\s*\\widehat/i.test(stem)) return 'NEN-01';
    return 'NEN-03';
  }
  if (q.cluster === 'LG') {
    if (/180.*-|bù nhau/i.test(stem)) return 'LG-02';
    if (/góc tù|dấu của/i.test(stem)) return 'LG-03';
    if (/sin\^2|tan|cot/i.test(stem)) return 'LG-04';
    return 'LG-01';
  }
  if (q.cluster === 'COS') {
    if (/nhọn|vuông|tù/i.test(stem) && /a\^2|c\^2/i.test(stem)) return 'COS-03';
    if (/tính góc|số đo góc|cos\s*[abc]/i.test(stem)) return 'COS-02';
    if (/tàu|máy bay|ngã tư|khúc cua|hải đăng|thực tế/i.test(stem)) return 'COS-04';
    return 'COS-01';
  }
  if (q.cluster === 'SIN') {
    if (/bán kính|ngoại tiếp|\b2r\b|\br\s*=/i.test(stem)) return 'SIN-03';
    if (/tìm góc|biện luận/i.test(stem)) return 'SIN-02';
    return 'SIN-01';
  }
  if (q.cluster === 'DT') {
    if (/nội tiếp|s\s*=\s*pr/i.test(stem)) return 'DT-03';
    if (/abc\/4r|4r/i.test(stem)) return 'DT-04';
    if (/heron|nửa chu vi/i.test(stem)) return 'DT-02';
    if (/thửa đất|khu vườn|chia tam giác/i.test(stem)) return 'DT-05';
    return 'DT-01';
  }
  if (q.type === 'error_spot' || /lỗi sai|phản biện/i.test(stem)) return 'MH-05';
  if (/chiều cao|hai góc ngắm|tháp|cây|ngọn núi/i.test(stem)) return 'MH-02';
  if (/vận tốc|tàu|máy bay|hải lí|km\/h/i.test(stem)) return 'MH-04';
  if (/tối ưu|nhỏ nhất|lớn nhất|đu quay/i.test(stem)) return 'MH-06';
  if (/bên kia sông|không tới được|đường đáy/i.test(stem)) return 'MH-01';
  return 'MH-03';
}

/**
 * Normalizes a question stem + options for exact duplicate detection & fuzzy similarity (Section 3.3).
 */
export function normalizeTextForFingerprint(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\widehat\{([^}]*)\}/g, '$1')
    .replace(/\\circ/g, 'deg')
    .replace(/\{,\}/g, '.')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[\s$\\{}^_.,;:!?()[\]"'–—-]+/g, '');
}

/**
 * Deterministic compact fingerprint for a question item.
 */
export function computeQuestionFingerprint(item: Pick<QuestionItem, 'stem_vi' | 'options' | 'statements'>): string {
  const optText = (item.options ?? []).map((o) => o.label).join('|');
  const stmtText = (item.statements ?? []).map((s) => s.label).join('|');
  const norm = normalizeTextForFingerprint(`${item.stem_vi}|${optText}|${stmtText}`);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < norm.length; i++) {
    const ch = norm.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `fp_${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Computes character-trigram Dice similarity (0..1) between two normalized Vietnamese math stems.
 */
export function computeStemSimilarity(stemA: string, stemB: string): number {
  const a = normalizeTextForFingerprint(stemA);
  const b = normalizeTextForFingerprint(stemB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return a === b ? 1 : 0;

  const trigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i <= s.length - 3; i++) {
      const g = s.slice(i, i + 3);
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return map;
  };

  const mapA = trigrams(a);
  const mapB = trigrams(b);
  let overlap = 0;
  for (const [g, countA] of mapA.entries()) {
    const countB = mapB.get(g) ?? 0;
    if (countB > 0) overlap += Math.min(countA, countB);
  }
  const total = a.length - 2 + (b.length - 2);
  return total > 0 ? (2 * overlap) / total : 0;
}

export interface DuplicateMatchInfo {
  kind: 'exact' | 'near';
  similarity: number;
  existingQuestion: QuestionItem;
}

/**
 * Checks a candidate draft against existing bank questions (exact fingerprint or >= 90% similarity).
 */
export function findDuplicateMatch(
  candidate: QuestionItem,
  existingBank: QuestionItem[],
): DuplicateMatchInfo | null {
  const fp = candidate.fingerprint || computeQuestionFingerprint(candidate);
  const sha = candidate.source_ref?.file_sha256;
  const qNum = candidate.source_ref?.question_number;
  const qPart = candidate.source_ref?.part ?? null;

  for (const ex of existingBank) {
    if (ex.id === candidate.id) {
      return {kind: 'exact', similarity: 1, existingQuestion: ex};
    }
    const exFp = ex.fingerprint || computeQuestionFingerprint(ex);
    if (exFp === fp) {
      return {kind: 'exact', similarity: 1, existingQuestion: ex};
    }
    // Idempotent match by (file_sha256 + question_number + part)
    if (
      sha &&
      qNum &&
      ex.source_ref?.file_sha256 === sha &&
      ex.source_ref?.question_number === qNum &&
      (ex.source_ref?.part ?? null) === qPart
    ) {
      return {kind: 'exact', similarity: 1, existingQuestion: ex};
    }
  }

  let bestNear: DuplicateMatchInfo | null = null;
  for (const ex of existingBank) {
    const sim = computeStemSimilarity(candidate.stem_vi, ex.stem_vi);
    if (sim >= 0.9 && (!bestNear || sim > bestNear.similarity)) {
      bestNear = {kind: 'near', similarity: sim, existingQuestion: ex};
    }
  }
  return bestNear;
}

/**
 * Suggests a web taxonomy pattern_id for a document's "Dạng n ..." label (Mode B mapping).
 */
export function suggestTaxonomyForDocumentLabel(
  label: string,
  taxonomy: TaxonomyPattern[] = DEFAULT_TAXONOMY_PATTERNS,
): string | null {
  const norm = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const rules: Array<[RegExp, string]> = [
    [/hai\s*goc\s*ngam|chieu\s*cao.*hai\s*diem|do\s*chieu\s*cao/, 'MH-02'],
    [/khong\s*toi\s*duoc|qua\s*song|khoang\s*cach.*hai\s*goc/, 'MH-01'],
    [/chuyen\s*dong|tau|may\s*bay|van\s*toc/, 'MH-04'],
    [/toi\s*uu|lon\s*nhat|nho\s*nhat|du\s*quay/, 'MH-06'],
    [/loi\s*sai|phan\s*bien/, 'MH-05'],
    [/giai\s*tam\s*giac/, 'MH-03'],
    [/heron/, 'DT-02'],
    [/noi\s*tiep|s\s*=\s*pr/, 'DT-03'],
    [/4r|abc/, 'DT-04'],
    [/dien\s*tich.*thuc\s*te|chia\s*tam\s*giac/, 'DT-05'],
    [/dien\s*tich/, 'DT-01'],
    [/ngoai\s*tiep|ban\s*kinh\s*r/, 'SIN-03'],
    [/sin.*tim\s*goc|bien\s*luan/, 'SIN-02'],
    [/dinh\s*l[iy]\s*sin|sin/, 'SIN-01'],
    [/nhan\s*dang\s*tam\s*giac|nhon.*vuong.*tu/, 'COS-03'],
    [/cosin.*thuc\s*te|co\s*sin.*thuc\s*te/, 'COS-04'],
    [/cosin.*tim\s*goc|ba\s*canh/, 'COS-02'],
    [/cosin|co\s*sin/, 'COS-01'],
    [/he\s*thuc.*sin|tan|cot/, 'LG-04'],
    [/dau.*luong\s*giac|goc\s*tu/, 'LG-03'],
    [/goc\s*bu|180/, 'LG-02'],
    [/gia\s*tri\s*luong\s*giac|goc\s*dac\s*biet/, 'LG-01'],
    [/tong\s*ba\s*goc/, 'NEN-01'],
    [/doi\s*dien/, 'NEN-02'],
    [/doi\s*don\s*vi|lam\s*tron|tam\s*giac\s*vuong/, 'NEN-03'],
    [/menh\s*de|tap\s*hop|bat\s*phuong\s*trinh|he\s*bat/, 'OUT-00'],
  ];

  for (const [re, pid] of rules) {
    if (re.test(norm) && taxonomy.some((t) => t.id === pid && t.status !== 'hidden')) {
      return pid;
    }
  }
  return null;
}

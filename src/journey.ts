import {buildAdaptiveQuestionSet, generateQuestion, type GeneratorId} from './math/generators.ts';
import type {
  BossId,
  JourneyProgress,
  MapPinCoords,
  MocId,
  MocStatusRecord,
  QuestionItem,
  SkillCluster,
  StationId,
  UserAccount,
} from './types.ts';

export const MAP_VIEWBOX_WIDTH = 1024;
export const MAP_VIEWBOX_HEIGHT = 572;

export const ALL_MOC_IDS: MocId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface MilestoneSceneTheme {
  skyTop: string;
  hillColor: string;
  waterColor: string;
  groundColor: string;
  trailColor: string;
  farLabel: string;
  npcTitle: string;
}

export interface JourneyMilestoneDef {
  id: MocId;
  city: string;
  sceneName: string;
  displayLabel: string; // e.g., "Tây Ninh"
  lessonRef: string;
  mathTopics: string;
  levelLabel: string;
  levels: Array<1 | 2 | 3 | 4>;
  clusters: SkillCluster[];
  missionQuestionCount: number;
  passCondition_vi: string;
  narrative_vi: string;
  prepHint_vi?: string;
  skippableFoundationCluster?: SkillCluster;
  bossId: BossId | null;
  stationId: StationId;
  isBS01Full?: boolean;
  independentFocus?: boolean;
  includeErrorSpot?: boolean;
  defaultPos: MapPinCoords; // Percentage on 1024x572
  skillCardId: string;
  landmarkCardId: string;
  toolRewardId: string;
  sceneTheme: MilestoneSceneTheme;
}

/**
 * Bảng 10 Mốc hành trình tuần tự (Nam → Bắc) — Chương III "Hệ thức lượng trong tam giác" (Toán 10 KNTT).
 * Có thể chỉnh trực tiếp trong tệp này; tọa độ ghim cũng có thể căn chỉnh tại #/admin/map-align.
 */
export const JOURNEY_MILESTONES: JourneyMilestoneDef[] = [
  {
    id: 1,
    city: 'Tây Ninh',
    sceneName: 'Chân núi Bà Đen',
    displayLabel: 'Tây Ninh',
    lessonRef: 'Bài 5 (mở đầu)',
    mathTopics: 'Cạnh đối diện góc, tổng ba góc, đổi đơn vị, làm tròn',
    levelLabel: 'Mức 1',
    levels: [1],
    clusters: ['NEN'],
    missionQuestionCount: 5,
    passCondition_vi: 'Xong 5 câu Nhiệm vụ mốc',
    narrative_vi:
      'Khởi hành dưới chân núi Bà Đen (mô phỏng học tập): nhận diện đúng cặp cạnh–góc đối diện, tính tổng ba góc trong tam giác, đổi đơn vị và làm tròn số đo chuẩn xác.',
    prepHint_vi:
      'Mẹo chuẩn bị nhanh: Tổng ba góc trong mọi tam giác phẳng luôn bằng 180°, và hai đầu mút của một cạnh chỉ ra đỉnh còn lại chính là góc đối diện.',
    bossId: null,
    stationId: 'QS01',
    defaultPos: {x: 37.5, y: 58},
    skillCardId: 'sk_angle_sum',
    landmarkCardId: 'lm_baden',
    toolRewardId: 'tool_ruler',
    sceneTheme: {
      skyTop: '#EDF4E1',
      hillColor: '#9CC086',
      waterColor: '#75C6DF',
      groundColor: '#D8E6B5',
      trailColor: '#F5E4B7',
      farLabel: 'Đỉnh núi Bà Đen (mô phỏng)',
      npcTitle: 'Hướng dẫn viên Núi Bà',
    },
  },
  {
    id: 2,
    city: 'Cần Thơ',
    sceneName: 'Chợ nổi Cái Răng',
    displayLabel: 'Cần Thơ',
    lessonRef: 'Bài 5',
    mathTopics: 'Giá trị lượng giác 0°–180°, góc bù, dùng máy tính chế độ độ',
    levelLabel: 'Mức 1–2',
    levels: [1, 2],
    clusters: ['LG'],
    missionQuestionCount: 5,
    passCondition_vi: 'Nhiệm vụ mốc + hạ BOSS 1',
    narrative_vi:
      'Ghé thăm chợ nổi sông nước (mô phỏng học tập): tra và tính giá trị sin, cos, tan, cot của góc nhọn lẫn góc tù (0°–180°), chú ý quy tắc hai góc bù nhau và chế độ độ (DEG).',
    prepHint_vi:
      'Gợi ý chuẩn bị: Hai góc bù nhau (tổng 180°) có cùng giá trị sin, nhưng giá trị cos đổi dấu (cos góc tù âm). Nhớ kiểm tra máy tính đang ở chế độ độ (D/DEG).',
    skippableFoundationCluster: 'NEN',
    bossId: 'B1',
    stationId: 'QS01',
    defaultPos: {x: 30.6, y: 80},
    skillCardId: 'sk_trig_supp',
    landmarkCardId: 'lm_cantho',
    toolRewardId: 'tool_protractor',
    sceneTheme: {
      skyTop: '#FFF4DA',
      hillColor: '#8FB97A',
      waterColor: '#56B8D4',
      groundColor: '#D6E4B0',
      trailColor: '#F7E5B4',
      farLabel: 'Thuyền mốc C bên kia sông',
      npcTitle: 'Người lái đò Cần Thơ',
    },
  },
  {
    id: 3,
    city: 'TP. Hồ Chí Minh',
    sceneName: 'Đường phố & công viên đô thị',
    displayLabel: 'TP. Hồ Chí Minh',
    lessonRef: 'Bài 6',
    mathTopics: 'Định lý cosin: tìm cạnh (chọn góc xen giữa)',
    levelLabel: 'Mức 2',
    levels: [2],
    clusters: ['COS'],
    missionQuestionCount: 5,
    passCondition_vi: 'Xong 5 câu Nhiệm vụ mốc',
    narrative_vi:
      'Khảo sát ngã tư và công viên đô thị (mô phỏng): vận dụng Định lý Côsin tính độ dài cạnh thứ ba khi biết hai cạnh kề và góc xen giữa.',
    prepHint_vi:
      'Gợi ý chuẩn bị: Với hai cạnh b, c và góc xen giữa A, ta có a² = b² + c² − 2bc·cos A. Sau khi tính a², đừng quên lấy căn bậc hai để ra độ dài cạnh a.',
    skippableFoundationCluster: 'LG',
    bossId: null,
    stationId: 'DD01',
    defaultPos: {x: 43, y: 76},
    skillCardId: 'sk_cos_side',
    landmarkCardId: 'lm_tphcm',
    toolRewardId: 'tool_tape',
    sceneTheme: {
      skyTop: '#E9F2FA',
      hillColor: '#9EB3C8',
      waterColor: '#66B9D8',
      groundColor: '#DDE2D1',
      trailColor: '#F5E7C3',
      farLabel: 'Tháp quan sát C (mô phỏng)',
      npcTitle: 'Kỹ sư đo đạc đô thị',
    },
  },
  {
    id: 4,
    city: 'Nha Trang',
    sceneName: 'Đường ven biển',
    displayLabel: 'Nha Trang',
    lessonRef: 'Bài 6',
    mathTopics: 'Định lý cosin: tìm góc từ ba cạnh; vận dụng',
    levelLabel: 'Mức 2–3',
    levels: [2, 3],
    clusters: ['COS'],
    missionQuestionCount: 5,
    passCondition_vi: 'Nhiệm vụ mốc + hạ BOSS 2',
    narrative_vi:
      'Dọc cung đường vịnh biển (mô phỏng): suy ra cos của góc từ độ dài ba cạnh tam giác để xác định góc nhọn, vuông hay tù và xử lý bài toán đo qua khúc cua.',
    prepHint_vi:
      'Gợi ý chuẩn bị: Từ hệ quả Định lý Côsin, cos A = (b² + c² − a²) / (2bc). Chú ý cạnh đối diện góc cần tìm luôn mang dấu trừ ở tử số.',
    skippableFoundationCluster: 'COS',
    bossId: 'B2',
    stationId: 'DD01',
    defaultPos: {x: 60.2, y: 71.3},
    skillCardId: 'sk_cos_law',
    landmarkCardId: 'lm_nhatrang',
    toolRewardId: 'tool_tape',
    sceneTheme: {
      skyTop: '#E3F6FC',
      hillColor: '#8EC4B4',
      waterColor: '#3BAAD1',
      groundColor: '#EFE4BE',
      trailColor: '#FFF0CB',
      farLabel: 'Hải đăng đảo C (mô phỏng)',
      npcTitle: 'Người gác hải đăng',
    },
  },
  {
    id: 5,
    city: 'Đà Nẵng',
    sceneName: 'Bờ sông Hàn',
    displayLabel: 'Đà Nẵng',
    lessonRef: 'Bài 6',
    mathTopics: 'Định lý sin: ghép cạnh–góc đối diện, tìm cạnh, bán kính ngoại tiếp R',
    levelLabel: 'Mức 2–3',
    levels: [2, 3],
    clusters: ['SIN'],
    missionQuestionCount: 5,
    passCondition_vi: 'Xong 5 câu Nhiệm vụ mốc',
    narrative_vi:
      'Tại bờ sông Hàn (mô phỏng): ghép chuẩn từng cặp cạnh với sin góc đối diện, tính cạnh còn thiếu và tìm bán kính đường tròn ngoại tiếp R.',
    prepHint_vi:
      'Gợi ý chuẩn bị: a / sin A = b / sin B = c / sin C = 2R. Nhớ chia đôi tỉ số a / sin A khi đề bài hỏi bán kính R (tránh nhầm với đường kính 2R).',
    skippableFoundationCluster: 'NEN',
    bossId: null,
    stationId: 'BS01',
    defaultPos: {x: 64, y: 49.8},
    skillCardId: 'sk_sin_law',
    landmarkCardId: 'lm_danang',
    toolRewardId: 'tool_theodolite',
    sceneTheme: {
      skyTop: '#E6F4FA',
      hillColor: '#92B8A6',
      waterColor: '#4CB2D4',
      groundColor: '#D6E6C4',
      trailColor: '#F6E8C2',
      farLabel: 'Nhịp cầu C bên kia sông',
      npcTitle: 'Kỹ sư cầu sông Hàn',
    },
  },
  {
    id: 6,
    city: 'Huế',
    sceneName: 'Bến sông Hương',
    displayLabel: 'Huế',
    lessonRef: 'Bài 6 (giải tam giác, đo khoảng cách)',
    mathTopics: '8 bước thực hành đo khoảng cách qua sông Hương, nhánh bổ trợ & bài tự giải độc lập',
    levelLabel: 'Mức 3',
    levels: [3],
    clusters: ['SIN', 'MH'],
    missionQuestionCount: 8,
    passCondition_vi: 'Hoàn thành 8 bước khảo sát qua sông + hạ BOSS 3',
    narrative_vi:
      'Mốc trọng tâm tại Bến sông Hương: thực hành đo khoảng cách AC tới điểm C bên kia sông (phân biệt với bề rộng vuông góc h) qua 8 bước khảo sát và lập phiếu kết quả.',
    prepHint_vi:
      'Gợi ý chuẩn bị: Đo đường đáy AB và hai góc A, B ngay trên bờ, tính góc C = 180° − A − B rồi áp dụng Định lý Sin để tìm AC.',
    skippableFoundationCluster: 'NEN',
    bossId: 'B3',
    stationId: 'BS01',
    isBS01Full: true,
    defaultPos: {x: 59.1, y: 42},
    skillCardId: 'sk_indirect_bs01',
    landmarkCardId: 'lm_hue',
    toolRewardId: 'tool_theodolite',
    sceneTheme: {
      skyTop: '#F3EDF7',
      hillColor: '#98BA9D',
      waterColor: '#5EB4CE',
      groundColor: '#D8E5B8',
      trailColor: '#F7E7B8',
      farLabel: 'Điểm C bên kia sông Hương',
      npcTitle: 'Người hướng dẫn Bến Sông',
    },
  },
  {
    id: 7,
    city: 'Vinh',
    sceneName: 'Khu vườn miền Trung',
    displayLabel: 'Vinh',
    lessonRef: 'Bài 6 (diện tích)',
    mathTopics: 'S = ½bc·sin A, đơn vị m²',
    levelLabel: 'Mức 2–3',
    levels: [2, 3],
    clusters: ['DT'],
    missionQuestionCount: 5,
    passCondition_vi: 'Xong 5 câu Nhiệm vụ mốc',
    narrative_vi:
      'Khảo sát khu vườn tam giác miền Trung (mô phỏng): vận dụng công thức diện tích S = ½bc·sin A và chú ý đổi đơn vị diện tích m² chính xác.',
    prepHint_vi:
      'Gợi ý chuẩn bị: Khi biết hai cạnh và góc xen giữa, đừng quên hệ số ½ trong công thức S = ½·b·c·sin A và đơn vị diện tích là m².',
    bossId: null,
    stationId: 'KV01',
    defaultPos: {x: 50.8, y: 29.4},
    skillCardId: 'sk_area_sas',
    landmarkCardId: 'lm_vinh',
    toolRewardId: 'tool_compass',
    sceneTheme: {
      skyTop: '#EFF6E4',
      hillColor: '#8FB876',
      waterColor: '#69BCD6',
      groundColor: '#CFE4A9',
      trailColor: '#F4E2B2',
      farLabel: 'Góc vườn C (mô phỏng)',
      npcTitle: 'Bác làm vườn miền Trung',
    },
  },
  {
    id: 8,
    city: 'Hải Phòng',
    sceneName: 'Khu đất ven biển',
    displayLabel: 'Hải Phòng',
    lessonRef: 'Bài 6 (diện tích)',
    mathTopics: 'Heron, S = pr, S = abc/4R; chọn công thức theo dữ kiện',
    levelLabel: 'Mức 3–4',
    levels: [3, 4],
    clusters: ['DT'],
    missionQuestionCount: 5,
    passCondition_vi: 'Nhiệm vụ mốc + hạ BOSS 4',
    narrative_vi:
      'Đo đạc khu đất cảng ven biển (mô phỏng): phối hợp công thức Heron, bán kính nội tiếp r (S = pr), ngoại tiếp R (S = abc/4R) và chọn đúng công thức theo dữ kiện đề bài.',
    prepHint_vi:
      'Gợi ý chuẩn bị: Tính nửa chu vi p = (a + b + c)/2 trước khi áp dụng Heron S = √[p(p−a)(p−b)(p−c)]; từ S suy ra đường cao h_a = 2S/a hoặc r = S/p.',
    skippableFoundationCluster: 'DT',
    bossId: 'B4',
    stationId: 'KV01',
    defaultPos: {x: 63, y: 22.4},
    skillCardId: 'sk_heron',
    landmarkCardId: 'lm_haiphong',
    toolRewardId: 'tool_compass',
    sceneTheme: {
      skyTop: '#E5F3F8',
      hillColor: '#88B4A4',
      waterColor: '#48A9C9',
      groundColor: '#D4E4BC',
      trailColor: '#F5E5B9',
      farLabel: 'Mốc cảng C (mô phỏng)',
      npcTitle: 'Kỹ sư trắc địa cảng',
    },
  },
  {
    id: 9,
    city: 'Hà Nội',
    sceneName: 'Sân vườn Hồ Gươm',
    displayLabel: 'Hà Nội',
    lessonRef: 'Bài 6 + cuối chương',
    mathTopics: 'Tổng hợp chọn sin/cosin/diện tích; mô hình hóa; đo chiều cao; phản biện',
    levelLabel: 'Mức 3–4',
    levels: [3, 4],
    clusters: ['COS', 'SIN', 'DT', 'MH'],
    missionQuestionCount: 6,
    passCondition_vi: 'Xong 6 câu Nhiệm vụ mốc',
    narrative_vi:
      'Hội tụ tại sân vườn Hồ Gươm (mô phỏng): phân tích dữ kiện để chọn nhanh Định lý Sin, Côsin hay Diện tích, mô hình hóa bài toán đo chiều cao và kiểm tra lập luận.',
    prepHint_vi:
      'Gợi ý chuẩn bị: Biết 2 cạnh + góc xen giữa hoặc 3 cạnh → nghĩ tới Côsin; biết cặp cạnh–góc đối diện → nghĩ tới Sin; hỏi diện tích/đường cao/r → dùng công thức S.',
    bossId: null,
    stationId: 'HT01',
    defaultPos: {x: 54.2, y: 17.1},
    skillCardId: 'sk_modeling',
    landmarkCardId: 'lm_hanoi',
    toolRewardId: 'tool_scroll',
    sceneTheme: {
      skyTop: '#FAF3E1',
      hillColor: '#8EB387',
      waterColor: '#56B2A6',
      groundColor: '#D6E4B7',
      trailColor: '#F6E4B5',
      farLabel: 'Tháp mốc C giữa hồ (mô phỏng)',
      npcTitle: 'Học giả Thăng Long',
    },
  },
  {
    id: 10,
    city: 'Hà Giang',
    sceneName: 'Cột mốc cực Bắc (lấy cảm hứng Lũng Cú)',
    displayLabel: 'Hà Giang',
    lessonRef: 'Bài tập cuối chương',
    mathTopics: 'Tự giải không gợi ý + câu tìm lỗi sai',
    levelLabel: 'Mức 4',
    levels: [4],
    clusters: ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'],
    missionQuestionCount: 5,
    passCondition_vi: 'Nhiệm vụ mốc + hạ BOSS 5 (chế độ kiểm chứng ở đòn cuối)',
    narrative_vi:
      'Chặng cuối tại Cột mốc cực Bắc (mô phỏng lấy cảm hứng Lũng Cú): tự giải tổng hợp Chương III, soi lỗi sai trong lời giải mẫu và đối đầu Rồng Tri Thức để mở Chế độ tự do!',
    prepHint_vi:
      'Gợi ý chuẩn bị: Đọc kỹ đơn vị, kiểm tra dấu của cos góc tù, kiểm tra bước khai căn và giữ đủ chữ số trung gian trước khi làm tròn kết quả cuối.',
    bossId: 'B5',
    stationId: 'HT01',
    independentFocus: true,
    includeErrorSpot: true,
    defaultPos: {x: 49.3, y: 8.4},
    skillCardId: 'sk_mastery',
    landmarkCardId: 'lm_hagiang',
    toolRewardId: 'tool_scroll',
    sceneTheme: {
      skyTop: '#E9F2FA',
      hillColor: '#6D9E7A',
      waterColor: '#5AAEC9',
      groundColor: '#C5DCAC',
      trailColor: '#F2E0B0',
      farLabel: 'Đài cờ cực Bắc C (mô phỏng)',
      npcTitle: 'Người giữ cột mốc cực Bắc',
    },
  },
];

export const JOURNEY_MILESTONES_BY_ID: Record<MocId, JourneyMilestoneDef> = {
  1: JOURNEY_MILESTONES[0],
  2: JOURNEY_MILESTONES[1],
  3: JOURNEY_MILESTONES[2],
  4: JOURNEY_MILESTONES[3],
  5: JOURNEY_MILESTONES[4],
  6: JOURNEY_MILESTONES[5],
  7: JOURNEY_MILESTONES[6],
  8: JOURNEY_MILESTONES[7],
  9: JOURNEY_MILESTONES[8],
  10: JOURNEY_MILESTONES[9],
};

export function createInitialJourneyProgress(): JourneyProgress {
  return {
    currentMoc: 1,
    passedMoc: [],
    mocStatus: {
      1: {
        mocId: 1,
        missionCompleted: false,
        bossDefeated: false,
        passed: false,
      },
    },
    completedAt: null,
    lastTransitionFrom: null,
    lastTransitionAt: null,
  };
}

export function normalizeJourneyProgress(raw?: JourneyProgress | null): JourneyProgress {
  if (!raw || typeof raw !== 'object') {
    return createInitialJourneyProgress();
  }
  const passedSet = new Set<MocId>();
  if (Array.isArray(raw.passedMoc)) {
    for (const id of raw.passedMoc) {
      if (ALL_MOC_IDS.includes(id as MocId)) passedSet.add(id as MocId);
    }
  }
  const mocStatus: Partial<Record<MocId, MocStatusRecord>> = {...(raw.mocStatus ?? {})};
  for (const id of passedSet) {
    const existing = mocStatus[id];
    mocStatus[id] = {
      mocId: id,
      missionCompleted: true,
      bossDefeated: JOURNEY_MILESTONES_BY_ID[id].bossId ? true : Boolean(existing?.bossDefeated),
      passed: true,
      passedAt: existing?.passedAt,
      usedSupport: existing?.usedSupport,
      skillStars: existing?.skillStars ?? 2,
      unlockedByAdmin: existing?.unlockedByAdmin,
    };
  }
  const passedMoc = ALL_MOC_IDS.filter((id) => passedSet.has(id));
  const nextUnpassed = ALL_MOC_IDS.find((id) => !passedSet.has(id)) ?? 10;
  const currentMoc: MocId =
    raw.currentMoc && ALL_MOC_IDS.includes(raw.currentMoc)
      ? Math.max(nextUnpassed, Math.min(10, raw.currentMoc)) === nextUnpassed
        ? raw.currentMoc
        : nextUnpassed
      : nextUnpassed;

  const allPassed = passedMoc.length === ALL_MOC_IDS.length;
  return {
    currentMoc: allPassed ? 10 : currentMoc,
    passedMoc,
    mocStatus,
    completedAt: allPassed ? (raw.completedAt ?? new Date().toISOString()) : null,
    lastTransitionFrom: raw.lastTransitionFrom ?? null,
    lastTransitionAt: raw.lastTransitionAt ?? null,
  };
}

/**
 * Checks whether all 10 milestones have been completed to unlock Free Mode ("Chế độ tự do").
 */
export function isFreeModeUnlocked(journey?: JourneyProgress | null): boolean {
  const j = normalizeJourneyProgress(journey);
  return j.passedMoc.length >= ALL_MOC_IDS.length || Boolean(j.completedAt);
}

/**
 * Mandatory sequential rule:
 * canEnter(n) = (n == 1) || passed[n - 1] || alreadyPassed[n] || freeMode || unlockAllDemo
 */
export function canEnterMoc(
  mocId: MocId,
  journey?: JourneyProgress | null,
  unlockAllDemo = false,
): boolean {
  if (unlockAllDemo) return true;
  if (mocId === 1) return true;
  const j = normalizeJourneyProgress(journey);
  if (isFreeModeUnlocked(j)) return true;
  if (j.passedMoc.includes(mocId)) return true;
  const prevMoc = (mocId - 1) as MocId;
  return j.passedMoc.includes(prevMoc);
}

/**
 * BOSS is locked until the milestone's mission has been completed (unless demo unlock-all or already defeated).
 */
export function canChallengeMocBoss(
  mocId: MocId,
  journey?: JourneyProgress | null,
  unlockAllDemo = false,
): boolean {
  const def = JOURNEY_MILESTONES_BY_ID[mocId];
  if (!def.bossId) return false;
  if (!canEnterMoc(mocId, journey, unlockAllDemo)) return false;
  if (unlockAllDemo) return true;
  const j = normalizeJourneyProgress(journey);
  const st = j.mocStatus[mocId];
  return Boolean(st?.missionCompleted || st?.bossDefeated || st?.passed);
}

export function evaluateMocPassed(mocId: MocId, st?: MocStatusRecord): boolean {
  if (!st) return false;
  const def = JOURNEY_MILESTONES_BY_ID[mocId];
  if (def.bossId) {
    return Boolean(st.missionCompleted && st.bossDefeated);
  }
  return Boolean(st.missionCompleted);
}

export function computeJourneyPercent(journey?: JourneyProgress | null): number {
  const j = normalizeJourneyProgress(journey);
  return Math.round((j.passedMoc.length / ALL_MOC_IDS.length) * 100);
}

/**
 * Applies milestone mission completion and advances currentMoc if all requirements of that milestone are satisfied.
 */
export function applyMocMissionCompleted(
  currentJourney: JourneyProgress | undefined,
  mocId: MocId,
  options?: {usedSupport?: boolean; nowIso?: string},
): {
  journey: JourneyProgress;
  newlyPassedMoc: boolean;
  newlyCompletedAll: boolean;
} {
  const now = options?.nowIso ?? new Date().toISOString();
  const base = normalizeJourneyProgress(currentJourney);
  const prevSt = base.mocStatus[mocId];
  const wasPassed = base.passedMoc.includes(mocId);
  const wasAllComplete = isFreeModeUnlocked(base);

  const nextSt: MocStatusRecord = {
    mocId,
    explored: true,
    missionCompleted: true,
    bossDefeated: Boolean(prevSt?.bossDefeated),
    passed: false,
    passedAt: prevSt?.passedAt,
    usedSupport: options?.usedSupport ?? prevSt?.usedSupport ?? false,
    skillStars: Math.max(prevSt?.skillStars ?? 0, options?.usedSupport ? 2 : 3),
    unlockedByAdmin: prevSt?.unlockedByAdmin,
  };
  nextSt.passed = evaluateMocPassed(mocId, nextSt) || wasPassed;
  if (nextSt.passed && !nextSt.passedAt) {
    nextSt.passedAt = now;
  }

  const nextPassedSet = new Set<MocId>(base.passedMoc);
  if (nextSt.passed) nextPassedSet.add(mocId);
  const passedMoc = ALL_MOC_IDS.filter((id) => nextPassedSet.has(id));
  const newlyPassedMoc = !wasPassed && nextSt.passed;
  const nextCurrentMoc = (ALL_MOC_IDS.find((id) => !nextPassedSet.has(id)) ?? 10) as MocId;
  const allComplete = passedMoc.length === ALL_MOC_IDS.length;
  const newlyCompletedAll = !wasAllComplete && allComplete;

  const mocStatus: Partial<Record<MocId, MocStatusRecord>> = {
    ...base.mocStatus,
    [mocId]: nextSt,
  };
  if (newlyPassedMoc && nextCurrentMoc !== mocId && !mocStatus[nextCurrentMoc]) {
    mocStatus[nextCurrentMoc] = {
      mocId: nextCurrentMoc,
      missionCompleted: false,
      bossDefeated: false,
      passed: false,
    };
  }

  return {
    journey: {
      currentMoc: nextCurrentMoc,
      passedMoc,
      mocStatus,
      completedAt: allComplete ? (base.completedAt ?? now) : null,
      lastTransitionFrom: newlyPassedMoc && mocId < 10 ? mocId : base.lastTransitionFrom ?? null,
      lastTransitionAt: newlyPassedMoc ? now : base.lastTransitionAt ?? null,
    },
    newlyPassedMoc,
    newlyCompletedAll,
  };
}

/**
 * Applies BOSS victory on a milestone and advances currentMoc when requirements are met.
 */
export function applyMocBossDefeated(
  currentJourney: JourneyProgress | undefined,
  mocId: MocId,
  options?: {usedSupport?: boolean; nowIso?: string},
): {
  journey: JourneyProgress;
  newlyPassedMoc: boolean;
  newlyCompletedAll: boolean;
} {
  const now = options?.nowIso ?? new Date().toISOString();
  const base = normalizeJourneyProgress(currentJourney);
  const prevSt = base.mocStatus[mocId];
  const wasPassed = base.passedMoc.includes(mocId);
  const wasAllComplete = isFreeModeUnlocked(base);

  const nextSt: MocStatusRecord = {
    mocId,
    explored: true,
    missionCompleted: Boolean(prevSt?.missionCompleted),
    bossDefeated: true,
    passed: false,
    passedAt: prevSt?.passedAt,
    usedSupport: options?.usedSupport ?? prevSt?.usedSupport ?? false,
    skillStars: Math.max(prevSt?.skillStars ?? 0, options?.usedSupport ? 2 : 3),
    unlockedByAdmin: prevSt?.unlockedByAdmin,
  };
  nextSt.passed = evaluateMocPassed(mocId, nextSt) || wasPassed;
  if (nextSt.passed && !nextSt.passedAt) {
    nextSt.passedAt = now;
  }

  const nextPassedSet = new Set<MocId>(base.passedMoc);
  if (nextSt.passed) nextPassedSet.add(mocId);
  const passedMoc = ALL_MOC_IDS.filter((id) => nextPassedSet.has(id));
  const newlyPassedMoc = !wasPassed && nextSt.passed;
  const nextCurrentMoc = (ALL_MOC_IDS.find((id) => !nextPassedSet.has(id)) ?? 10) as MocId;
  const allComplete = passedMoc.length === ALL_MOC_IDS.length;
  const newlyCompletedAll = !wasAllComplete && allComplete;

  const mocStatus: Partial<Record<MocId, MocStatusRecord>> = {
    ...base.mocStatus,
    [mocId]: nextSt,
  };
  if (newlyPassedMoc && nextCurrentMoc !== mocId && !mocStatus[nextCurrentMoc]) {
    mocStatus[nextCurrentMoc] = {
      mocId: nextCurrentMoc,
      missionCompleted: false,
      bossDefeated: false,
      passed: false,
    };
  }

  return {
    journey: {
      currentMoc: nextCurrentMoc,
      passedMoc,
      mocStatus,
      completedAt: allComplete ? (base.completedAt ?? now) : null,
      lastTransitionFrom: newlyPassedMoc && mocId < 10 ? mocId : base.lastTransitionFrom ?? null,
      lastTransitionAt: newlyPassedMoc ? now : base.lastTransitionAt ?? null,
    },
    newlyPassedMoc,
    newlyCompletedAll,
  };
}

/**
 * Admin helper to unlock the next milestone for a stuck student.
 */
export function applyAdminUnlockNextMoc(
  currentJourney: JourneyProgress | undefined,
  nowIso = new Date().toISOString(),
): {journey: JourneyProgress; unlockedMoc: MocId; passedMocId: MocId} {
  const base = normalizeJourneyProgress(currentJourney);
  const toPass = base.currentMoc;
  const nextPassedSet = new Set<MocId>(base.passedMoc);
  nextPassedSet.add(toPass);
  const passedMoc = ALL_MOC_IDS.filter((id) => nextPassedSet.has(id));
  const nextCurrent = (ALL_MOC_IDS.find((id) => !nextPassedSet.has(id)) ?? 10) as MocId;
  const allComplete = passedMoc.length === ALL_MOC_IDS.length;

  const prevSt = base.mocStatus[toPass];
  const mocStatus: Partial<Record<MocId, MocStatusRecord>> = {
    ...base.mocStatus,
    [toPass]: {
      mocId: toPass,
      explored: true,
      missionCompleted: true,
      bossDefeated: JOURNEY_MILESTONES_BY_ID[toPass].bossId ? true : Boolean(prevSt?.bossDefeated),
      passed: true,
      passedAt: prevSt?.passedAt ?? nowIso,
      skillStars: prevSt?.skillStars ?? 2,
      unlockedByAdmin: true,
    },
  };
  if (!mocStatus[nextCurrent]) {
    mocStatus[nextCurrent] = {
      mocId: nextCurrent,
      missionCompleted: false,
      bossDefeated: false,
      passed: false,
    };
  }

  return {
    journey: {
      currentMoc: nextCurrent,
      passedMoc,
      mocStatus,
      completedAt: allComplete ? (base.completedAt ?? nowIso) : null,
      lastTransitionFrom: toPass < 10 ? toPass : null,
      lastTransitionAt: nowIso,
    },
    passedMocId: toPass,
    unlockedMoc: nextCurrent,
  };
}

/**
 * Rule 3.7: Skip optional foundation warm-up (such as P01–P04 in BS01 / Mốc 6)
 * when the student already has sufficient foundation skill evidence from earlier milestones.
 */
export function shouldSkipFoundationWarmup(mocId: MocId, user: UserAccount): boolean {
  const def = JOURNEY_MILESTONES_BY_ID[mocId];
  const targetCluster = def.skippableFoundationCluster;
  if (!targetCluster) return false;
  const skill = user.skills[targetCluster];
  if (skill && (skill.state === 'Tự làm được' || skill.state === 'Làm được có hỗ trợ')) {
    return true;
  }
  const j = normalizeJourneyProgress(user.journey);
  if (mocId === 6 && j.passedMoc.includes(1) && j.passedMoc.includes(5)) {
    return true;
  }
  return false;
}

/**
 * Resolves effective pin coordinates for all 10 milestones (merging admin alignment overrides).
 */
export function getEffectivePinCoords(
  overrides?: Partial<Record<MocId, MapPinCoords>>,
): Record<MocId, MapPinCoords> {
  const out = {} as Record<MocId, MapPinCoords>;
  for (const m of JOURNEY_MILESTONES) {
    const ov = overrides?.[m.id];
    out[m.id] =
      ov && Number.isFinite(ov.x) && Number.isFinite(ov.y)
        ? {
            x: Math.max(2, Math.min(98, Number(ov.x.toFixed(1)))),
            y: Math.max(2, Math.min(98, Number(ov.y.toFixed(1)))),
          }
        : {...m.defaultPos};
  }
  return out;
}

/**
 * Converts percentage coords to SVG viewBox (1024 x 572) pixel coords.
 */
export function pinPercentToSvgPoint(pos: MapPinCoords): {x: number; y: number} {
  return {
    x: (pos.x / 100) * MAP_VIEWBOX_WIDTH,
    y: (pos.y / 100) * MAP_VIEWBOX_HEIGHT,
  };
}

/**
 * Computes cubic Bézier control points for Catmull-Rom segment i -> i+1 (tension = 0.5).
 */
export function getCatmullRomSegmentBezier(
  pts: Array<{x: number; y: number}>,
  i: number,
): {p0: {x: number; y: number}; cp1: {x: number; y: number}; cp2: {x: number; y: number}; p1: {x: number; y: number}} {
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[Math.min(pts.length - 1, i + 1)];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];
  const cp1 = {
    x: p1.x + (p2.x - p0.x) / 6,
    y: p1.y + (p2.y - p0.y) / 6,
  };
  const cp2 = {
    x: p2.x - (p3.x - p1.x) / 6,
    y: p2.y - (p3.y - p1.y) / 6,
  };
  return {p0: p1, cp1, cp2, p1: p2};
}

export function buildSegmentSvgPath(pts: Array<{x: number; y: number}>, i: number): string {
  if (i < 0 || i >= pts.length - 1) return '';
  const {p0, cp1, cp2, p1} = getCatmullRomSegmentBezier(pts, i);
  return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)}, ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
}

export function buildSmoothJourneySvgPath(pts: Array<{x: number; y: number}>, maxIndex?: number): string {
  if (pts.length === 0) return '';
  const last = Math.min(pts.length - 1, maxIndex ?? pts.length - 1);
  if (last <= 0) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < last; i++) {
    const {cp1, cp2, p1} = getCatmullRomSegmentBezier(pts, i);
    d += ` C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)}, ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Deterministic hash from student UID + milestone + run nonce so two different students
 * always receive distinct milestone mission question decks.
 */
function hashStringToSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1337;
}

/**
 * Builds the milestone mission deck (5 questions for Mốc 1–5, 7–8, 10; 6 questions for Mốc 9).
 * Uses parameterized generators + bank matching the milestone's clusters & levels,
 * personalized by student UID & session nonce so two accounts receive different sets.
 */
export function buildMilestoneMissionQuestions(params: {
  mocId: MocId;
  userId: string;
  bank: QuestionItem[];
  allowPending: boolean;
  skills: UserAccount['skills'];
  recentSessions: string[][];
  nonce?: number;
}): QuestionItem[] {
  const def = JOURNEY_MILESTONES_BY_ID[params.mocId];
  if (def.isBS01Full) return [];

  const count = def.missionQuestionCount;
  const baseSeed = hashStringToSeed(`${params.userId}|moc-${params.mocId}|${params.nonce ?? 0}`);

  // Prefer bank items matching BOTH milestone cluster AND milestone levels
  const levelSet = new Set(def.levels);
  const filteredBank = params.bank.filter(
    (q) =>
      def.clusters.includes(q.cluster) &&
      levelSet.has(q.level) &&
      q.standalone !== false &&
      (q.review_status === 'approved' || (params.allowPending && q.review_status === 'pending_teacher_review')),
  );

  // Pull a personalized seeded subset + generated variants so different students get different sets
  const result: QuestionItem[] = [];
  const usedStems = new Set<string>();
  const recentSet = new Set(params.recentSessions.slice(-3).flat());

  // Always inject fresh parameterized variants first so two accounts definitely diverge even on small banks
  const generatorMap: Record<MocId, GeneratorId[]> = {
    1: ['GEN_OPP_PAIR', 'GEN_ANGLE_SUM', 'GEN_UNITS', 'GEN_ROUND', 'GEN_ANGLE_SUM'],
    2: ['GEN_TRIG_VALUES', 'GEN_TRIG_VALUES', 'GEN_ANGLE_SUM'],
    3: ['GEN_COS_SIDE', 'GEN_COS_SIDE', 'GEN_COS_SIDE'],
    4: ['GEN_COS_ANGLE', 'GEN_COS_ANGLE', 'GEN_COS_SIDE'],
    5: ['GEN_SIN_SIDE', 'GEN_SIN_R', 'GEN_OPP_PAIR'],
    6: [],
    7: ['GEN_AREA_SAS', 'GEN_AREA_SAS', 'GEN_AREA_SAS'],
    8: ['GEN_AREA_HERON', 'GEN_SIN_R', 'GEN_AREA_HERON'],
    9: ['GEN_COS_SIDE', 'GEN_SIN_SIDE', 'GEN_AREA_SAS', 'GEN_HEIGHT', 'GEN_ERROR_SPOT'],
    10: ['GEN_ERROR_SPOT', 'GEN_HEIGHT', 'GEN_COS_ANGLE', 'GEN_AREA_HERON', 'GEN_ERROR_SPOT'],
  };

  const gens = generatorMap[params.mocId] ?? [];
  const genTarget = Math.min(gens.length, Math.max(2, Math.ceil(count * 0.6)));
  for (let i = 0; i < genTarget && result.length < count; i++) {
    const genId = gens[i % gens.length];
    let candidate = generateQuestion(genId, baseSeed + i * 7919);
    for (let attempt = 1; attempt <= 6 && usedStems.has(candidate.stem_vi); attempt++) {
      candidate = generateQuestion(genId, baseSeed + i * 7919 + attempt * 104729);
    }
    if (!usedStems.has(candidate.stem_vi)) {
      usedStems.add(candidate.stem_vi);
      result.push(candidate);
    }
  }

  // Fill remaining slots from milestone-matching bank items (rotated deterministically per student seed)
  const freshBankCandidates = filteredBank.filter((q) => !recentSet.has(q.id) && !usedStems.has(q.stem_vi));
  const pool = freshBankCandidates.length > 0 ? freshBankCandidates : filteredBank;
  if (pool.length > 0) {
    const startOffset = baseSeed % pool.length;
    for (let i = 0; i < pool.length && result.length < count; i++) {
      const q = pool[(startOffset + i) % pool.length];
      if (!usedStems.has(q.stem_vi)) {
        usedStems.add(q.stem_vi);
        result.push(q);
      }
    }
  }

  // Fallback via adaptive builder if still short
  if (result.length < count) {
    const extras = buildAdaptiveQuestionSet({
      count: count - result.length + 2,
      clusters: def.clusters,
      bank: params.bank,
      allowPending: params.allowPending,
      skills: params.skills,
      recentSessions: params.recentSessions,
    });
    for (const q of extras) {
      if (result.length >= count) break;
      if (!usedStems.has(q.stem_vi)) {
        usedStems.add(q.stem_vi);
        result.push(q);
      }
    }
  }

  return result.slice(0, count);
}

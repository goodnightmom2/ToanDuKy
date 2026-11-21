import type {
  AppSettings,
  AvatarAppearance,
  BossDefinition,
  BossId,
  SkillCluster,
  SkillRecord,
  StationDefinition,
  StationId,
  StationProgress,
} from './types.ts';

export const APP_NAME = 'Toán Du Ký';

export const ORG_INFO = {
  chapterTitle: 'Chương III: Hệ thức lượng trong tam giác (Toán 10 – Kết nối tri thức với cuộc sống)',
};

export const DEFAULT_HELP_AFTER_WRONG = 2;
export const B_SLIDE_MIN = 50;
export const B_SLIDE_MAX = 100;

export const DEFAULT_SETTINGS: AppSettings = {
  helpAfterWrong: DEFAULT_HELP_AFTER_WRONG,
  allowPendingInTestMode: true,
  aiEnabled: true,
  aiDailyQuotaLimit: 50,
  audioDefaultOn: false,
  journeyUnlockAllDemo: false,
  mapBackgroundHasBakedLabels: false,
};

export const SKILL_CLUSTERS: Record<
  SkillCluster,
  {code: SkillCluster; title: string; shortTitle: string; description: string; color: string}
> = {
  NEN: {
    code: 'NEN',
    title: 'Nền tảng tam giác & đơn vị',
    shortTitle: 'Nền tảng',
    description: 'Tổng ba góc trong tam giác, cặp cạnh–góc đối diện, đổi đơn vị và làm tròn.',
    color: '#2E9C8A',
  },
  LG: {
    code: 'LG',
    title: 'Giá trị lượng giác góc 0°–180°',
    shortTitle: 'Lượng giác',
    description: 'Tính và đối chiếu sin, cos, tan, cot cho góc nhọn và góc tù (0° đến 180°).',
    color: '#3B5F8F',
  },
  COS: {
    code: 'COS',
    title: 'Định lý Côsin',
    shortTitle: 'Định lý Côsin',
    description: 'Tính cạnh khi biết hai cạnh và góc xen giữa, hoặc tính góc khi biết ba cạnh.',
    color: '#B9831E',
  },
  SIN: {
    code: 'SIN',
    title: 'Định lý Sin',
    shortTitle: 'Định lý Sin',
    description: 'Lập tỉ số cạnh trên sin góc đối diện, tính cạnh và bán kính đường tròn ngoại tiếp R.',
    color: '#1F7A6B',
  },
  DT: {
    code: 'DT',
    title: 'Diện tích tam giác & đường cao',
    shortTitle: 'Diện tích',
    description: 'Áp dụng công thức S = 1/2 ab sin C, công thức Heron và tính đường cao.',
    color: '#5FAE5B',
  },
  MH: {
    code: 'MH',
    title: 'Mô hình hóa & khảo sát thực tế',
    shortTitle: 'Mô hình hóa',
    description: 'Chọn dữ kiện đo được, chuyển tình huống khảo sát sang tam giác và diễn giải kết quả.',
    color: '#8A5A3B',
  },
};

export const SKILL_CLUSTER_LIST: SkillCluster[] = ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'];

export interface JourneyLevelDef {
  level: number;
  name: string;
  minXp: number;
  minIndependentClusters: number;
  description: string;
}

export const JOURNEY_LEVELS: JourneyLevelDef[] = [
  {
    level: 1,
    name: 'Khởi hành',
    minXp: 0,
    minIndependentClusters: 0,
    description: 'Bắt đầu hành trình khảo sát và làm quen sơ đồ tam giác.',
  },
  {
    level: 2,
    name: 'Quan sát',
    minXp: 25,
    minIndependentClusters: 1,
    description: 'Nhận diện rõ đỉnh, cạnh đối diện và các góc trong tam giác.',
  },
  {
    level: 3,
    name: 'Đo đạc',
    minXp: 60,
    minIndependentClusters: 2,
    description: 'Ghi nhận dữ kiện đo hợp lệ và kiểm soát sai số làm tròn.',
  },
  {
    level: 4,
    name: 'Kết nối',
    minXp: 110,
    minIndependentClusters: 3,
    description: 'Kết nối linh hoạt định lý Sin, Côsin và giá trị lượng giác.',
  },
  {
    level: 5,
    name: 'Vận dụng',
    minXp: 170,
    minIndependentClusters: 4,
    description: 'Tự giải trọn vẹn bài toán đo gián tiếp không cần gợi ý.',
  },
  {
    level: 6,
    name: 'Kiến tạo',
    minXp: 240,
    minIndependentClusters: 5,
    description: 'Kiểm chứng, phản biện lập luận và xây dựng phương án khảo sát.',
  },
];

export function computeJourneyLevel(
  xp: number,
  skills: Record<SkillCluster, SkillRecord>,
): JourneyLevelDef {
  const independentCount = SKILL_CLUSTER_LIST.filter(
    (c) => skills[c]?.state === 'Tự làm được',
  ).length;
  let current = JOURNEY_LEVELS[0];
  for (const def of JOURNEY_LEVELS) {
    if (xp >= def.minXp && independentCount >= def.minIndependentClusters) {
      current = def;
    }
  }
  return current;
}

export const ERROR_CATALOG: Record<
  string,
  {code: string; label: string; stepHint: string}
> = {
  E01: {
    code: 'E01',
    label: 'Nhầm cặp cạnh – góc đối diện',
    stepHint: 'Hãy chạm vào hai đầu mút của cạnh trước, đỉnh còn lại chính là góc đối diện.',
  },
  E02: {
    code: 'E02',
    label: 'Chưa cộng/trừ đúng tổng 3 góc 180°',
    stepHint: 'Kiểm tra lại tổng ba góc trong tam giác luôn bằng 180°, rồi trừ hai góc đã biết.',
  },
  E03: {
    code: 'E03',
    label: 'Chọn dữ kiện không thể đo trực tiếp',
    stepHint: 'Kiểm tra xem học viên có thể đi tới điểm nào trên bờ mà không băng qua vật cản.',
  },
  E04: {
    code: 'E04',
    label: 'Lập chưa đúng tỉ số định lý Sin',
    stepHint: 'Mỗi tỉ số phải ghép đúng một cạnh với sin của góc đối diện chính cạnh đó.',
  },
  E05: {
    code: 'E05',
    label: 'Biến đổi đại số tỉ số chưa khớp',
    stepHint: 'Nhân hai vế với mẫu số chứa ẩn, kiểm tra phép nhân và chia trước khi bấm máy.',
  },
  E06: {
    code: 'E06',
    label: 'Nhầm giá trị lượng giác hoặc đơn vị góc (độ/rad)',
    stepHint: 'Kiểm tra máy tính đang ở chế độ độ (DEG) và đối chiếu lại bảng giá trị 0°–180°.',
  },
  E07: {
    code: 'E07',
    label: 'Làm tròn chưa đúng chữ số hoặc thiếu đơn vị',
    stepHint: 'Giữ nguyên giá trị trung gian, chỉ làm tròn ở kết quả cuối theo đúng hàng yêu cầu và ghi rõ đơn vị.',
  },
  E08: {
    code: 'E08',
    label: 'Diễn giải chưa khớp ý nghĩa hình học',
    stepHint: 'Đối chiếu đoạn vừa tính với hai đầu mút trên hình: đường ngắm xiên khác với đường vuông góc.',
  },
  E09: {
    code: 'E09',
    label: 'Quên dấu trừ hoặc hệ số 2 trong định lý Côsin',
    stepHint: 'Kiểm tra lại công thức $a^2 = b^2 + c^2 - 2bc\\cos A$, chú ý dấu trừ và số 2.',
  },
  E10: {
    code: 'E10',
    label: 'Quên khai căn bậc hai khi tính cạnh',
    stepHint: 'Giá trị vừa tính đang là bình phương độ dài cạnh ($a^2$), cần lấy căn bậc hai.',
  },
  E11: {
    code: 'E11',
    label: 'Nhầm nửa chu vi p hoặc thiếu hệ số 1/2 diện tích',
    stepHint: 'Kiểm tra nửa chu vi $p = \\frac{a+b+c}{2}$ và hệ số $\\frac{1}{2}$ trong $S = \\frac{1}{2}ab\\sin C$.',
  },
  E12: {
    code: 'E12',
    label: 'Nhầm đường kính 2R với bán kính R',
    stepHint: 'Định lý Sin cho $\\frac{a}{\\sin A} = 2R$; muốn tìm bán kính $R$ cần chia đôi kết quả.',
  },
};

export const BOSSES: Record<BossId, BossDefinition> = {
  B1: {
    id: 'B1',
    stationId: 'QS01',
    name: 'Yêu Tinh Góc Khuất',
    subtitle: 'Thử thách Nền tảng & Giá trị lượng giác',
    flavorNote: 'Sinh vật sương mù vui tính dưới chân núi Bà Đen, thích giấu các góc trong tam giác.',
    hitLevels: [1, 1, 1, 2, 2],
    rewardOutfitId: 'hero_ltk',
    rewardHeroCardId: 'card_hero_ltk',
    clusters: ['NEN', 'LG'],
  },
  B2: {
    id: 'B2',
    stationId: 'DD01',
    name: 'Hồ Ly Đường Vòng',
    subtitle: 'Thử thách Định lý Côsin',
    flavorNote: 'Hồ ly cầm đèn lồng trên đường làng Tây Ninh, thử tài đo khoảng cách qua khúc cua.',
    hitLevels: [1, 2, 2, 2, 3, 3],
    rewardOutfitId: 'hero_thd',
    rewardHeroCardId: 'card_hero_thd',
    clusters: ['COS'],
  },
  B3: {
    id: 'B3',
    stationId: 'BS01',
    name: 'Thuồng Luồng Bến Sông',
    subtitle: 'Thử thách Định lý Sin & Mô hình hóa',
    flavorNote: 'Thủy quái dân gian thân thiện trên dòng sông Hương, chỉ mở luồng khi đo đúng khoảng cách AC.',
    hitLevels: [2, 2, 2, 3, 3, 3, 4],
    rewardOutfitId: 'hero_qt',
    rewardHeroCardId: 'card_hero_qt',
    clusters: ['SIN', 'MH'],
  },
  B4: {
    id: 'B4',
    stationId: 'KV01',
    name: 'Mộc Tinh Khu Vườn',
    subtitle: 'Thử thách Diện tích tam giác',
    flavorNote: 'Cổ thụ giữ khu đất ven biển, yêu cầu tính diện tích thửa đất và chọn công thức chuẩn xác.',
    hitLevels: [2, 2, 3, 3, 3, 3, 4, 4],
    rewardOutfitId: 'hero_ntp',
    rewardHeroCardId: 'card_hero_ntp',
    clusters: ['DT'],
  },
  B5: {
    id: 'B5',
    stationId: 'HT01',
    name: 'Rồng Tri Thức',
    subtitle: 'Thử thách Tổng hợp Chương III & Phản biện',
    flavorNote: 'Linh vật rồng mây thanh lịch tại cột mốc cực Bắc, kiểm chứng bản lĩnh tổng hợp cả chương.',
    hitLevels: [3, 3, 3, 3, 3, 4, 4, 4, 4, 4],
    rewardOutfitId: 'hero_nambo',
    rewardHeroCardId: 'card_hero_nambo',
    clusters: ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'],
  },
};

export function computeBossHitDamages(levels: Array<1 | 2 | 3 | 4>): number[] {
  const sum = levels.reduce((acc, lv) => acc + lv, 0);
  if (sum <= 0) return [];
  return levels.map((lv) => (100 * lv) / sum);
}

export const STATIONS: StationDefinition[] = [
  {
    id: 'QS01',
    order: 1,
    name: 'Chân núi Bà Đen',
    region: 'Tây Ninh',
    shortName: 'Núi Bà Đen',
    subtitle: 'Trạm 1 · Nền tảng tam giác & Giá trị lượng giác',
    clusters: ['NEN', 'LG'],
    bossId: 'B1',
    mapX: 390,
    mapY: 960,
    landmarkCardId: 'lm_baden',
    toolRewardId: 'tool_protractor',
    hasFullMissionFlow: false,
    narrativeIntro:
      'Tại chân núi Bà Đen, học viên ôn lại tổng ba góc, cặp cạnh–góc đối diện và giá trị lượng giác góc từ 0° đến 180° để sẵn sàng khảo sát.',
  },
  {
    id: 'DD01',
    order: 2,
    name: 'Đường làng Tây Ninh',
    region: 'Tây Ninh',
    shortName: 'Đường làng',
    subtitle: 'Trạm 2 · Định lý Côsin đo qua khúc cua',
    clusters: ['COS'],
    bossId: 'B2',
    mapX: 465,
    mapY: 855,
    landmarkCardId: 'lm_tayninh',
    toolRewardId: 'tool_tape',
    hasFullMissionFlow: false,
    narrativeIntro:
      'Con đường làng có hồ nước chắn ngang. Dùng Định lý Côsin khi biết hai cạnh và góc xen giữa để ước lượng đoạn nối thẳng.',
  },
  {
    id: 'BS01',
    order: 3,
    name: 'Bến sông Vàm Cỏ Đông',
    region: 'Tây Ninh',
    shortName: 'Bến sông Vàm Cỏ',
    subtitle: 'Trạm 3 (Trọng tâm) · Định lý Sin & Khảo sát đo gián tiếp',
    clusters: ['SIN', 'MH'],
    bossId: 'B3',
    mapX: 540,
    mapY: 730,
    landmarkCardId: 'lm_vamco',
    toolRewardId: 'tool_theodolite',
    hasFullMissionFlow: true,
    narrativeIntro:
      'Điểm A và B nằm trên bờ tiếp cận được, điểm C bên kia sông Vàm Cỏ Đông. Thực hiện đủ 8 bước khảo sát mô phỏng để xác định khoảng cách AC.',
  },
  {
    id: 'KV01',
    order: 4,
    name: 'Khu vườn di sản miền Trung',
    region: 'Miền Trung',
    shortName: 'Vườn miền Trung',
    subtitle: 'Trạm 4 · Diện tích tam giác & công thức Heron',
    clusters: ['DT'],
    bossId: 'B4',
    mapX: 600,
    mapY: 500,
    landmarkCardId: 'lm_mientrung',
    toolRewardId: 'tool_compass',
    hasFullMissionFlow: false,
    narrativeIntro:
      'Khu vườn tam giác tại miền Trung cần tính diện tích trồng cây và chiều cao thửa đất mô phỏng bằng công thức diện tích và Heron.',
  },
  {
    id: 'HT01',
    order: 5,
    name: 'Điểm hẹn Hà Nội',
    region: 'Hà Nội',
    shortName: 'Hà Nội',
    subtitle: 'Trạm 5 · Tổng hợp Chương III & Phản biện toán học',
    clusters: ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'],
    bossId: 'B5',
    mapX: 490,
    mapY: 220,
    landmarkCardId: 'lm_hanoi',
    toolRewardId: 'tool_scroll',
    hasFullMissionFlow: false,
    narrativeIntro:
      'Hội tụ tại Thăng Long – Hà Nội, kết hợp toàn bộ Hệ thức lượng trong tam giác và kiểm tra lập luận của đồng đội.',
  },
];

export const STATIONS_BY_ID: Record<StationId, StationDefinition> = {
  QS01: STATIONS[0],
  DD01: STATIONS[1],
  BS01: STATIONS[2],
  KV01: STATIONS[3],
  HT01: STATIONS[4],
};

export interface HeroChipDef {
  id: string;
  name: string;
  bio: string;
  isLegend?: boolean;
}

export const HERO_NAME_CHIPS: HeroChipDef[] = [
  {id: 'h1', name: 'Hai Bà Trưng', bio: 'Biểu tượng ý chí tự chủ đầu công nguyên trong lịch sử Việt Nam.'},
  {id: 'h2', name: 'Bà Triệu', bio: 'Nhân vật kiên cường thế kỷ III gắn với câu nói cưỡi cơn gió mạnh.'},
  {id: 'h3', name: 'Ngô Quyền', bio: 'Vị vua mở ra thời kỳ độc lập tự chủ lâu dài năm 938.'},
  {id: 'h4', name: 'Đinh Bộ Lĩnh', bio: 'Người thống nhất đất nước và lập nên nhà nước Đại Cồ Việt.'},
  {id: 'h5', name: 'Lê Hoàn', bio: 'Vị vua thời Tiền Lê có công giữ vững biên cương Đại Cồ Việt.'},
  {id: 'h6', name: 'Lý Thường Kiệt', bio: 'Danh tướng thời Lý gắn liền với bài thơ Nam quốc sơn hà.'},
  {id: 'h7', name: 'Trần Hưng Đạo', bio: 'Quốc công tiết chế thời Trần, tác giả Hịch tướng sĩ.'},
  {id: 'h8', name: 'Trần Quốc Toản', bio: 'Thiếu niên anh hùng thời Trần với lá cờ thêu sáu chữ vàng.'},
  {id: 'h9', name: 'Lê Lợi', bio: 'Lãnh tụ khởi nghĩa Lam Sơn, sáng lập triều Hậu Lê.'},
  {id: 'h10', name: 'Nguyễn Trãi', bio: 'Danh nhân văn hóa thế giới, tác giả Bình Ngô đại cáo.'},
  {id: 'h11', name: 'Quang Trung', bio: 'Anh hùng áo vải Nguyễn Huệ với chiến thắng Ngọc Hồi – Đống Đa.'},
  {id: 'h12', name: 'Nguyễn Tri Phương', bio: 'Danh thần kiên trung thời Nguyễn trong công cuộc bảo vệ thành trì.'},
  {id: 'h13', name: 'Trương Định', bio: 'Thủ lĩnh phong trào kháng chiến tiêu biểu vùng Nam Bộ thế kỷ XIX.'},
  {id: 'h14', name: 'Nguyễn Trung Trực', bio: 'Anh hùng Nam Bộ gắn với chiến công trên sông Nhật Tảo.'},
  {id: 'h15', name: 'Phan Bội Châu', bio: 'Nhà yêu nước đầu thế kỷ XX khởi xướng phong trào Đông Du.'},
  {id: 'h16', name: 'Phan Châu Trinh', bio: 'Nhà duy tân đầu thế kỷ XX đề cao khai dân trí, chấn dân khí.'},
  {id: 'h17', name: 'Võ Thị Sáu', bio: 'Nữ anh hùng trẻ tuổi bất khuất quê Đất Đỏ.'},
  {id: 'h18', name: 'Kim Đồng', bio: 'Người đội trưởng đầu tiên của Đội Nhi đồng Cứu quốc.'},
  {
    id: 'h19',
    name: 'Thánh Gióng',
    bio: 'Nhân vật truyền thuyết dân gian Việt Nam biểu trưng sức mạnh cộng đồng.',
    isLegend: true,
  },
];

export interface OutfitDef {
  id: string;
  name: string;
  unlockType: 'default' | 'xp' | 'boss';
  xpRequired?: number;
  bossId?: BossId;
  primaryA: string;
  accentA: string;
  primaryB: string;
  accentB: string;
  note: string;
}

export const OUTFITS: OutfitDef[] = [
  {
    id: 'hoc_vien',
    name: 'Đồng phục Thám hiểm',
    unlockType: 'default',
    primaryA: '#E94B3C',
    accentA: '#A4A073',
    primaryB: '#1C9BB7',
    accentB: '#F7D44C',
    note: 'Trang phục mặc định năng động: Mẫu A (áo sao vàng + ghi-lê rêu) & Mẫu B (hoodie xanh ngọc).',
  },
  {
    id: 'ao_xanh_ngoc',
    name: 'Áo xanh ngọc',
    unlockType: 'xp',
    xpRequired: 0,
    primaryA: '#1F7A6B',
    accentA: '#8FD3E6',
    primaryB: '#2E9C8A',
    accentB: '#F7E7B8',
    note: 'Mở khóa ở mốc 0 XP.',
  },
  {
    id: 'ao_nang_phuong_nam',
    name: 'Áo nắng phương Nam',
    unlockType: 'xp',
    xpRequired: 30,
    primaryA: '#D98A1F',
    accentA: '#FFF4D6',
    primaryB: '#E0A93B',
    accentB: '#14284A',
    note: 'Mở khóa ở mốc 30 XP hành trình.',
  },
  {
    id: 'ao_cham_kham_pha',
    name: 'Áo chàm khám phá',
    unlockType: 'xp',
    xpRequired: 70,
    primaryA: '#14284A',
    accentA: '#E0A93B',
    primaryB: '#3B5F8F',
    accentB: '#8FD3E6',
    note: 'Mở khóa ở mốc 70 XP hành trình.',
  },
  {
    id: 'hero_ltk',
    name: 'Cảm hứng Lý Thường Kiệt',
    unlockType: 'boss',
    bossId: 'B1',
    primaryA: '#1F3B63',
    accentA: '#E0A93B',
    primaryB: '#2E9C8A',
    accentB: '#FFF4D6',
    note: 'Trang phục cách điệu lấy cảm hứng lịch sử. Mở khi hoàn thành BOSS B1.',
  },
  {
    id: 'hero_thd',
    name: 'Cảm hứng Trần Hưng Đạo',
    unlockType: 'boss',
    bossId: 'B2',
    primaryA: '#8A2B22',
    accentA: '#E0A93B',
    primaryB: '#14284A',
    accentB: '#E0A93B',
    note: 'Trang phục cách điệu lấy cảm hứng lịch sử. Mở khi hoàn thành BOSS B2.',
  },
  {
    id: 'hero_qt',
    name: 'Cảm hứng Quang Trung',
    unlockType: 'boss',
    bossId: 'B3',
    primaryA: '#C8392B',
    accentA: '#F7E7B8',
    primaryB: '#B9831E',
    accentB: '#14284A',
    note: 'Trang phục cách điệu lấy cảm hứng lịch sử. Mở khi hoàn thành BOSS B3.',
  },
  {
    id: 'hero_ntp',
    name: 'Cảm hứng Nguyễn Tri Phương',
    unlockType: 'boss',
    bossId: 'B4',
    primaryA: '#2C5E4F',
    accentA: '#E0A93B',
    primaryB: '#5B4636',
    accentB: '#F7E7B8',
    note: 'Trang phục cách điệu lấy cảm hứng lịch sử. Mở khi hoàn thành BOSS B4.',
  },
  {
    id: 'hero_nambo',
    name: 'Cảm hứng Anh hùng Nam Bộ',
    unlockType: 'boss',
    bossId: 'B5',
    primaryA: '#3B2F2F',
    accentA: '#D98A1F',
    primaryB: '#1F3B63',
    accentB: '#C8392B',
    note: 'Trang phục cách điệu lấy cảm hứng vùng Nam Bộ. Mở khi hoàn thành BOSS B5.',
  },
];

export const LANDMARK_CARDS = [
  {id: 'lm_baden', title: 'Chân núi Bà Đen', region: 'Tây Ninh', note: 'Mốc 1 · Khởi hành nền tảng tam giác và đơn vị đo.'},
  {id: 'lm_cantho', title: 'Chợ nổi Cần Thơ', region: 'Cần Thơ', note: 'Mốc 2 · Giá trị lượng giác góc 0°–180° và góc bù.'},
  {id: 'lm_tphcm', title: 'Đường phố TP. Hồ Chí Minh', region: 'TP. Hồ Chí Minh', note: 'Mốc 3 · Định lý Côsin tìm cạnh qua góc xen giữa.'},
  {id: 'lm_nhatrang', title: 'Đường ven biển Nha Trang', region: 'Nha Trang', note: 'Mốc 4 · Định lý Côsin tìm góc từ ba cạnh.'},
  {id: 'lm_danang', title: 'Bờ sông Hàn Đà Nẵng', region: 'Đà Nẵng', note: 'Mốc 5 · Định lý Sin và bán kính đường tròn ngoại tiếp R.'},
  {id: 'lm_hue', title: 'Bến sông Hương Huế', region: 'Huế', note: 'Mốc 6 · Đo khoảng cách không tới được (BS01 S01–S08).'},
  {id: 'lm_vinh', title: 'Khu vườn quê Vinh', region: 'Vinh', note: 'Mốc 7 · Công thức diện tích tam giác S = 1/2 bc sin A.'},
  {id: 'lm_haiphong', title: 'Khu đất ven biển Hải Phòng', region: 'Hải Phòng', note: 'Mốc 8 · Công thức Heron, S = pr và S = abc / 4R.'},
  {id: 'lm_hanoi', title: 'Sân vườn Hồ Gươm Hà Nội', region: 'Hà Nội', note: 'Mốc 9 · Tổng hợp chọn định lý, mô hình hóa & phản biện.'},
  {id: 'lm_hagiang', title: 'Cột mốc cực Bắc Hà Giang', region: 'Hà Giang', note: 'Mốc 10 · Chinh phục cuối chương & tìm lỗi sai.'},
  {id: 'lm_tayninh', title: 'Đường làng Tây Ninh', region: 'Tây Ninh', note: 'Thẻ địa danh mở rộng Định lý Côsin.'},
  {id: 'lm_vamco', title: 'Bến sông Vàm Cỏ Đông', region: 'Tây Ninh', note: 'Thẻ địa danh mở rộng Định lý Sin.'},
  {id: 'lm_mientrung', title: 'Khu vườn di sản miền Trung', region: 'Miền Trung', note: 'Thẻ địa danh mở rộng Diện tích tam giác.'},
];

export const TOOL_ITEMS = [
  {id: 'tool_ruler', name: 'Thước đo đường đáy', desc: 'Đo độ dài đoạn thẳng trên bờ (mô phỏng).'},
  {id: 'tool_protractor', name: 'Thước đo góc khảo sát', desc: 'Xác định góc ngắm giữa hai tia tại điểm đứng.'},
  {id: 'tool_tape', name: 'Cuộn dây đo khúc cua', desc: 'Hỗ trợ khảo sát khoảng cách theo Định lý Côsin.'},
  {id: 'tool_theodolite', name: 'Kính ngắm góc Bến Sông', desc: 'Công cụ ngắm điểm C bên kia sông.'},
  {id: 'tool_compass', name: 'Compa bản đồ di sản', desc: 'Hỗ trợ chia thửa đất tam giác.'},
  {id: 'tool_scroll', name: 'Sổ tay Hệ thức lượng', desc: 'Tóm tắt công thức Chương III đã duyệt.'},
];

export const SKILL_CARDS = [
  {id: 'sk_angle_sum', title: 'Tổng 3 góc & Đơn vị', formula: '$A + B + C = 180^\\circ$'},
  {id: 'sk_trig_supp', title: 'Giá trị lượng giác 0°–180°', formula: '$\\sin(180^\\circ-\\alpha)=\\sin\\alpha,\\ \\cos(180^\\circ-\\alpha)=-\\cos\\alpha$'},
  {id: 'sk_cos_side', title: 'Định lý Côsin (Tìm cạnh)', formula: '$a^2 = b^2 + c^2 - 2bc\\cos A$'},
  {id: 'sk_cos_law', title: 'Định lý Côsin (Tìm góc)', formula: '$\\cos A = \\frac{b^2 + c^2 - a^2}{2bc}$'},
  {id: 'sk_sin_law', title: 'Định lý Sin & Ngoại tiếp R', formula: '$\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C} = 2R$'},
  {id: 'sk_indirect_bs01', title: 'Đo khoảng cách gián tiếp', formula: '$AC = \\frac{AB \\cdot \\sin B}{\\sin(180^\\circ - A - B)}$'},
  {id: 'sk_area_sas', title: 'Diện tích (cạnh–góc–cạnh)', formula: '$S = \\frac{1}{2}bc\\sin A$'},
  {id: 'sk_heron', title: 'Heron, S = pr & S = abc/4R', formula: '$S = \\sqrt{p(p-a)(p-b)(p-c)},\\ p=\\frac{a+b+c}{2}$'},
  {id: 'sk_modeling', title: 'Tổng hợp & Mô hình hóa', formula: 'Chọn định lý Sin / Côsin / Diện tích theo dữ kiện'},
  {id: 'sk_mastery', title: 'Bản lĩnh cuối Chương III', formula: 'Tự giải độc lập & phản biện lỗi sai'},
];

export const DEFAULT_AVATAR: AvatarAppearance = {
  skinTone: '#FFD0A8',
  hairStyle: 'spiky',
  hairColor: '#22262D',
  eyeStyle: 'bright',
  browStyle: 'arch',
  mouthStyle: 'grin',
  outfitId: 'hoc_vien',
  outfitVariant: 'A',
  headwear: 'mu_tham_hiem',
  accessory: 'so_tay',
  cape: 'none',
  badge: 'la_ban',
};

export function createInitialSkills(): Record<SkillCluster, SkillRecord> {
  const now = new Date().toISOString();
  const make = (cluster: SkillCluster): SkillRecord => ({
    cluster,
    state: 'Chưa đủ dữ liệu',
    lastUpdated: now,
    practiceCorrect: 0,
    verifyCorrect: 0,
    totalAttempts: 0,
  });
  return {
    NEN: make('NEN'),
    LG: make('LG'),
    COS: make('COS'),
    SIN: make('SIN'),
    DT: make('DT'),
    MH: make('MH'),
  };
}

export function createInitialStations(): Record<StationId, StationProgress> {
  const make = (stationId: StationId): StationProgress => ({
    stationId,
    explored: false,
    missionCompleted: false,
    bossDefeated: false,
    openSurveyCompleted: false,
    currentStepIndex: 0,
    completedStepIds: [],
  });
  return {
    QS01: make('QS01'),
    DD01: make('DD01'),
    BS01: make('BS01'),
    KV01: make('KV01'),
    HT01: make('HT01'),
  };
}

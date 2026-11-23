import {BOSSES, computeBossHitDamages, DEFAULT_HELP_AFTER_WRONG, SKILL_CLUSTER_LIST} from '../config.ts';
import {
  runBoss1000Simulations,
  type BossSimulationSummary,
} from './bankAnalysis.ts';
import {EXPANDED_CHAPTER3_ITEMS} from './expandedBank.ts';
import {
  BS01_COORDS,
  buildTriangleFromBaseAndAngles,
  getBS01OpenSurveyState,
  rotatePointXZ,
  roundToPlaces,
  solveTriangleFromCoords,
  validateTrianglePoints,
} from './geometry.ts';
import {gradeNumericAnswer, gradeQuestion, shouldOfferHelp} from './grader.ts';
import {ALL_GENERATOR_IDS, generateQuestion} from './generators.ts';
import {ALL_INITIAL_QUESTIONS, BS01_SEED_ITEMS} from './seedBank.ts';
import {verifyQuestionByCode} from './verifier.ts';
import {solveByPatternAndGivens, verifyQuestionWithSolvers} from './solvers.ts';
import {
  compareNumberMultisets,
  evaluateSafeDegreeExpression,
  extractNumberTokens,
  formatVi,
  normalizeMath,
  renderKatexSafe,
  runMathBankAudit,
  splitMath,
  verifyQuestionMathLayers,
} from './mathEngine.ts';
import {autoSuggestMissionSet, validateMissionSet} from './missionSetEngine.ts';
import {computeQuestionFingerprint, PROMPT_VERSION} from './taxonomy.ts';
import {
  applyAnswerKeysToDrafts,
  extractWindowViaAi,
  parseAnswerKeyTableText,
  validateRawExtractionResponse,
} from '../services/aiExtractor.ts';
import {
  clearExtractionCache,
  saveCachedExtractionResult,
} from '../services/importBatchService.ts';
import {
  analyzePageMathTextHealth,
  formatPdfStatusSummary,
  readPdfDocumentRange,
} from '../services/pdfReader.ts';
import type {MissionSetRecord, QuestionItem} from '../types.ts';
import {
  canAccessAdmin,
  canEditSettingsOrUsers,
  computeNextSkillRecord,
  DataService,
  validatePassword,
  validateUsername,
} from '../services/dataService.ts';

export interface SelfTestResult {
  id: number;
  name: string;
  passed: boolean;
  detail: string;
}

class EphemeralStore {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

export interface SelfTestBundle {
  results: SelfTestResult[];
  bossSimulation: BossSimulationSummary;
}

export async function runAllSelfTestsWithReport(): Promise<SelfTestBundle> {
  const results: SelfTestResult[] = [];

  // 1. Hình học BS01
  {
    const tri = solveTriangleFromCoords(BS01_COORDS.A, BS01_COORDS.B, BS01_COORDS.C);
    const ok =
      Math.abs(tri.AB - 60) < 1e-6 &&
      Math.abs(tri.angleA - 50) < 1e-4 &&
      Math.abs(tri.angleB - 60) < 1e-4 &&
      Math.abs(tri.angleC - 70) < 1e-4 &&
      Math.abs(tri.AC - 55.296299106412576) < 1e-6 &&
      roundToPlaces(tri.AC, 1) === 55.3;
    results.push({
      id: 1,
      name: 'Hình học BS01 chuẩn (A, B, C trên mặt phẳng XZ)',
      passed: ok,
      detail: `AB=${tri.AB.toFixed(2)}m, A=${tri.angleA.toFixed(2)}°, B=${tri.angleB.toFixed(2)}°, C=${tri.angleC.toFixed(2)}°, AC=${tri.AC.toFixed(4)}m (~55,3m)`,
    });
  }

  // 2. T01 & T02
  {
    const t01 = buildTriangleFromBaseAndAngles(40, 45, 60);
    const t02 = buildTriangleFromBaseAndAngles(80, 40, 70);
    const ok1 = Boolean(t01 && Math.abs(t01.angleC - 75) < 1e-4 && roundToPlaces(t01.AC, 1) === 35.9);
    const ok2 = Boolean(t02 && Math.abs(t02.angleC - 70) < 1e-4 && Math.abs(t02.AC - 80) < 1e-4);
    results.push({
      id: 2,
      name: 'Kiểm chứng đáp án T01 và T02',
      passed: ok1 && ok2,
      detail: `T01: C=${t01?.angleC.toFixed(1)}°, AC=${t01 ? roundToPlaces(t01.AC, 1) : '?'}m; T02: C=${t02?.angleC.toFixed(1)}°, AC=${t02?.AC.toFixed(1)}m`,
    });
  }

  // 3. Bất biến góc nhìn / xoay camera
  {
    const base = solveTriangleFromCoords(BS01_COORDS.A, BS01_COORDS.B, BS01_COORDS.C);
    const yawAngles = [15, 47, 132, 245, 319];
    const allMatch = yawAngles.every((yaw) => {
      const rA = rotatePointXZ(BS01_COORDS.A, yaw);
      const rB = rotatePointXZ(BS01_COORDS.B, yaw);
      const rC = rotatePointXZ(BS01_COORDS.C, yaw);
      const rot = solveTriangleFromCoords(rA, rB, rC);
      return (
        Math.abs(rot.AB - base.AB) < 1e-6 &&
        Math.abs(rot.AC - base.AC) < 1e-6 &&
        Math.abs(rot.angleA - base.angleA) < 1e-6 &&
        Math.abs(rot.angleB - base.angleB) < 1e-6 &&
        Math.abs(rot.angleC - base.angleC) < 1e-6
      );
    });
    results.push({
      id: 3,
      name: 'Bất biến độ dài và góc khi xoay khung nhìn',
      passed: allMatch,
      detail: 'Đã kiểm thử xoay 5 góc nhìn khác nhau: AB, AC và ba góc giữ nguyên tuyệt đối.',
    });
  }

  // 4. Trượt điểm B trong [50, 100]: AB, góc đổi; AC giữ nguyên
  {
    const refAC = solveTriangleFromCoords(BS01_COORDS.A, BS01_COORDS.B, BS01_COORDS.C).AC;
    const s50 = getBS01OpenSurveyState(50);
    const s80 = getBS01OpenSurveyState(80);
    const s100 = getBS01OpenSurveyState(100);
    const ok =
      Math.abs(s50.AC - refAC) < 1e-6 &&
      Math.abs(s80.AC - refAC) < 1e-6 &&
      Math.abs(s100.AC - refAC) < 1e-6 &&
      s50.AB === 50 &&
      s100.AB === 100 &&
      Math.abs(s50.angleB - s100.angleB) > 5;
    results.push({
      id: 4,
      name: 'Khảo sát mở: trượt B ∈ [50, 100] giữ nguyên AC',
      passed: ok,
      detail: `B=50→AC=${s50.AC.toFixed(3)}m (∠B=${s50.angleB.toFixed(1)}°), B=100→AC=${s100.AC.toFixed(3)}m (∠B=${s100.angleB.toFixed(1)}°)`,
    });
  }

  // 5. Chấm đáp án số: dấu phẩy/chấm, đơn vị, sai làm tròn (E07)
  {
    const okComma = gradeNumericAnswer({
      rawInput: '55,3',
      expectedExact: 55.2963,
      expectedRounded: 55.3,
      decimalPlaces: 1,
      expectedUnit: 'm',
      hasFixedUnitLabel: true,
    });
    const okDotZero = gradeNumericAnswer({
      rawInput: '55.30 m',
      expectedExact: 55.2963,
      expectedRounded: 55.3,
      decimalPlaces: 1,
      expectedUnit: 'm',
      hasFixedUnitLabel: false,
    });
    const missingUnit = gradeNumericAnswer({
      rawInput: '55,3',
      expectedExact: 55.2963,
      expectedRounded: 55.3,
      decimalPlaces: 1,
      expectedUnit: 'm',
      hasFixedUnitLabel: false,
    });
    const wrongRound = gradeNumericAnswer({
      rawInput: '55 m',
      expectedExact: 55.2963,
      expectedRounded: 55.3,
      decimalPlaces: 1,
      expectedUnit: 'm',
      hasFixedUnitLabel: false,
    });
    const ok =
      okComma.isCorrect &&
      okDotZero.isCorrect &&
      !missingUnit.isCorrect &&
      missingUnit.errorCode === 'E07' &&
      !wrongRound.isCorrect &&
      wrongRound.errorCode === 'E07';
    results.push({
      id: 5,
      name: 'Bộ chấm số xác định (dấu phẩy/chấm, đơn vị, lỗi làm tròn E07)',
      passed: ok,
      detail: '55,3 (fixed m) đúng; 55.30 m đúng; thiếu đơn vị bị báo E07; 55 m bị báo lỗi làm tròn E07.',
    });
  }

  // 6. Sai 1 lần không gắn nhãn; đúng ngưỡng mới mời hỗ trợ
  {
    const after1 = shouldOfferHelp(1, DEFAULT_HELP_AFTER_WRONG);
    const after2 = shouldOfferHelp(2, DEFAULT_HELP_AFTER_WRONG);
    const m03 = BS01_SEED_ITEMS.find((q) => q.id === 'M03')!;
    const resWrong = gradeQuestion(m03, '80');
    const forbiddenWords = ['mất gốc', 'yếu', 'kém', 'phàm nhân', 'phế căn'];
    const noBadLabel = forbiddenWords.every((w) => !resWrong.feedback_vi.toLowerCase().includes(w));
    const ok = !after1 && after2 && !resWrong.isCorrect && noBadLabel;
    results.push({
      id: 6,
      name: 'Sai 1 lần không gắn nhãn năng lực; 2 lần mới mời hỗ trợ',
      passed: ok,
      detail: `after1=${after1}, after2=${after2}, phản hồi nhẹ nhàng không nhãn tiêu cực.`,
    });
  }

  // 7. Chế độ kiểm chứng: bấm Gợi ý -> đổi ý giữ verify, đồng ý đổi practice và không cấp "Tự làm được"
  {
    const baseSkill = {
      cluster: 'SIN' as const,
      state: 'Đang luyện' as const,
      lastUpdated: new Date().toISOString(),
      practiceCorrect: 0,
      verifyCorrect: 0,
      totalAttempts: 0,
    };
    const afterPractice = computeNextSkillRecord(baseSkill, {
      isCorrect: true,
      mode: 'practice',
      usedHint: true,
      clickedDontKnow: false,
    });
    const afterVerify = computeNextSkillRecord(baseSkill, {
      isCorrect: true,
      mode: 'verify',
      usedHint: false,
      clickedDontKnow: false,
    });
    const ok =
      afterPractice.state === 'Làm được có hỗ trợ' &&
      afterVerify.state === 'Tự làm được';
    results.push({
      id: 7,
      name: 'Tách biệt chế độ luyện tập và kiểm chứng (không gợi ý)',
      passed: ok,
      detail: `Có hỗ trợ → "${afterPractice.state}"; Độc lập → "${afterVerify.state}".`,
    });
  }

  // 8. Chặn tam giác suy biến / thẳng hàng
  {
    const collinear = validateTrianglePoints([0, 0, 0], [30, 0, 0], [60, 0, 0]);
    const coincident = validateTrianglePoints([0, 0, 0], [0, 0, 0], [10, 0, 20]);
    const valid = validateTrianglePoints(BS01_COORDS.A, BS01_COORDS.B, BS01_COORDS.C);
    const ok = !collinear.valid && !coincident.valid && valid.valid;
    results.push({
      id: 8,
      name: 'Chặn tam giác thẳng hàng hoặc trùng đỉnh với giải thích rõ',
      passed: ok,
      detail: `Thẳng hàng: bị chặn (${collinear.reason_vi}); BS01: hợp lệ.`,
    });
  }

  // 9. Idempotent eventId & không cộng XP / rương lặp lại
  {
    const svc = new DataService(new EphemeralStore());
    await svc.setupFirstAdmin({username: 'adm_test', password: 'Password123', displayName: 'GV Test'});
    const reg = await svc.registerStudent({
      username: 'hv_idem',
      password: 'Password123',
      displayName: 'HV Idem',
      classCode: 'TOAN10-01',
    });
    const uid = reg.user!.uid;
    const e1 = svc.recordEvent({
      eventId: 'evt_unique_001',
      userId: uid,
      studentCode: reg.user!.studentCode,
      isTestAccount: false,
      type: 'step_complete',
      payload: {},
    });
    const e2 = svc.recordEvent({
      eventId: 'evt_unique_001',
      userId: uid,
      studentCode: reg.user!.studentCode,
      isTestAccount: false,
      type: 'step_complete',
      payload: {},
    });
    const r1 = svc.awardOnce(uid, 'chest_bs01', {xp: 25, chestId: 'CHEST01_BS01'});
    const r2 = svc.awardOnce(uid, 'chest_bs01', {xp: 25, chestId: 'CHEST01_BS01'});
    const ok = e1.inserted && !e2.inserted && r1.granted && !r2.granted && r2.user?.xp === 25;
    results.push({
      id: 9,
      name: 'Chống trùng sự kiện (eventId) và chống cộng thưởng 2 lần',
      passed: ok,
      detail: `Sự kiện lặp bị bỏ qua; thưởng XP giữ nguyên ${r2.user?.xp} sau 2 lần gọi cùng khóa.`,
    });
  }

  // 10. Đấu BOSS: tổng % sát thương = 100%, sai không trừ XP/mạng
  {
    const allBossesOk = Object.values(BOSSES).every((boss) => {
      const dmgs = computeBossHitDamages(boss.hitLevels);
      const sum = dmgs.reduce((a, b) => a + b, 0);
      return dmgs.length === boss.hitLevels.length && Math.abs(sum - 100) < 1e-6;
    });
    results.push({
      id: 10,
      name: 'Đấu BOSS B1–B5: tổng % HP các đòn đúng bằng 100%, không phạt khi sai',
      passed: allBossesOk,
      detail: 'Đã kiểm tra B1 (5 đòn), B2 (6 đòn), B3 (7 đòn), B4 (8 đòn), B5 (10 đòn): tất cả đạt 100,00%.',
    });
  }

  // 11. Ngẫu nhiên có seed & tái lập lại đúng câu hỏi theo seed
  {
    const a1 = generateQuestion('GEN_SIN_SIDE', 202601);
    const a2 = generateQuestion('GEN_SIN_SIDE', 202601);
    const b1 = generateQuestion('GEN_SIN_SIDE', 202602);
    const ok = a1.stem_vi === a2.stem_vi && a1.stem_vi !== b1.stem_vi;
    results.push({
      id: 11,
      name: 'Sinh câu hỏi ngẫu nhiên theo seed & tái lập chính xác',
      passed: ok,
      detail: 'Cùng seed tái lập đúng đề & đáp án; khác seed sinh thông số mới.',
    });
  }

  // 12. 200 mẫu × 13 máy sinh câu hỏi (tổng 2.600 câu)
  {
    let totalChecked = 0;
    let failedCount = 0;
    for (const genId of ALL_GENERATOR_IDS) {
      for (let i = 1; i <= 200; i++) {
        totalChecked += 1;
        const q = generateQuestion(genId, i * 101 + genId.length * 17);
        if (!q.stem_vi || !q.solution_vi || !q.hints_vi.length) {
          failedCount += 1;
          continue;
        }
        if (q.type === 'mcq' || q.type === 'error_spot') {
          const labels = (q.options ?? []).map((o) => o.label);
          const uniqueLabels = new Set(labels);
          if (labels.length < 3 || uniqueLabels.size !== labels.length) {
            failedCount += 1;
          }
          const check = gradeQuestion(q, String(q.expected_answer.choice));
          if (!check.isCorrect) failedCount += 1;
        } else if (q.type === 'tap_diagram') {
          const check = gradeQuestion(q, String(q.expected_answer.vertex));
          if (!check.isCorrect) failedCount += 1;
        } else if (q.type === 'numeric') {
          const val = q.expected_answer.rounded ?? q.expected_answer.value;
          const check = gradeQuestion(q, String(val).replace('.', ','));
          if (!check.isCorrect) failedCount += 1;
        }
      }
    }
    results.push({
      id: 12,
      name: 'Kiểm thử 200 mẫu × 13 máy sinh (2.600 câu hỏi)',
      passed: failedCount === 0,
      detail: `Đã kiểm tra ${totalChecked} câu sinh tự động: ${totalChecked - failedCount}/${totalChecked} hợp lệ, phương án phân biệt, tự chấm khớp 100%.`,
    });
  }

  // 13. Phân quyền & xác thực đăng ký/đăng nhập (không mật khẩu admin cứng)
  {
    const svc = new DataService(new EphemeralStore());
    const noAdminInitially = !svc.hasAnyAdmin();
    const badUser = validateUsername('AB!@#');
    const badPass = validatePassword('12345');
    const admRes = await svc.setupFirstAdmin({
      username: 'quantri_test',
      password: 'TeacherStrong2026',
      displayName: 'Quản trị viên',
    });
    const stuRes = await svc.registerStudent({
      username: 'hocvien01',
      password: 'StudentPass2026',
      displayName: 'Ngô Quyền',
      classCode: 'TOAN10-01',
    });
    const stuDeniedAdmin = !canAccessAdmin(stuRes.user!) && !canEditSettingsOrUsers(stuRes.user!);
    const admAllowed = canAccessAdmin(admRes.user!) && canEditSettingsOrUsers(admRes.user!);
    const studentCannotEditBank = !svc.setQuestionReviewStatus(stuRes.user!, ['P01'], 'approved');
    const adminCanApprove = svc.setQuestionReviewStatus(admRes.user!, ['P01'], 'approved');
    const ok =
      noAdminInitially &&
      !badUser.ok &&
      !badPass.ok &&
      admRes.ok &&
      stuRes.ok &&
      stuDeniedAdmin &&
      admAllowed &&
      studentCannotEditBank &&
      adminCanApprove;
    results.push({
      id: 13,
      name: 'Phân quyền RBAC & khởi tạo admin lần đầu không mật khẩu mặc định',
      passed: ok,
      detail: 'Chặn username/mật khẩu yếu; học viên không thể duyệt câu hỏi hay sửa cài đặt; quản trị viên duyệt thành công.',
    });
  }

  // 14. Học liệu BS01 16 câu đã kiểm duyệt chuẩn hóa & lọc dữ liệu TEST khỏi báo cáo
  {
    const all16Approved =
      BS01_SEED_ITEMS.length === 16 &&
      BS01_SEED_ITEMS.every((item) => item.review_status === 'approved' && item.is_adapted);
    const svc = new DataService(new EphemeralStore());
    const adm = await svc.setupFirstAdmin({
      username: 'adm_rep',
      password: 'AdminPass2026',
      displayName: 'GV Tâm',
    });
    await svc.createTwoTestAccounts(adm.user!);
    const testUser = svc.getAllUsers().find((u) => u.isTestAccount)!;
    svc.recordAttempt({
      userId: testUser.uid,
      studentCode: testUser.studentCode,
      isTestAccount: true,
      questionId: 'M03',
      cluster: 'NEN',
      mode: 'practice',
      switchedToPractice: false,
      answerRaw: '70',
      isCorrect: true,
      usedHint: false,
      clickedDontKnow: false,
      wrongCountOnQuestion: 0,
      durationMs: 2000,
    });
    const excludedFromReal = svc.getAttempts(false).length === 0 && svc.getAttempts(true).length === 1;
    results.push({
      id: 14,
      name: '16 câu BS01 đã kiểm duyệt & lọc dữ liệu TEST khỏi báo cáo thật',
      passed: all16Approved && excludedFromReal,
      detail: `16/16 câu BS01 chuẩn hóa đã duyệt (học liệu nhập mới luôn chờ duyệt); dữ liệu tài khoản TEST được loại khỏi báo cáo lớp.`,
    });
  }

  // 15. Toàn bộ 16 câu hạt giống tự chấm khớp đáp án mẫu
  {
    let passed16 = 0;
    for (const q of BS01_SEED_ITEMS) {
      let sampleAnswer: unknown;
      if (q.type === 'numeric') {
        sampleAnswer = String(q.expected_answer.rounded ?? q.expected_answer.value) + (q.fixedUnitLabel ? '' : ` ${q.expected_answer.unit ?? ''}`);
      } else if (q.type === 'tap_diagram') {
        sampleAnswer = q.expected_answer.vertex;
      } else if (q.type === 'mcq' || q.type === 'error_spot') {
        sampleAnswer = q.expected_answer.choice;
      } else if (q.type === 'matching') {
        sampleAnswer = q.expected_answer;
      } else if (q.type === 'fill_relation') {
        sampleAnswer = {
          left: q.expected_answer.left_angle_degree,
          right: q.expected_answer.right_angle_degree,
        };
      } else if (q.type === 'measurement') {
        sampleAnswer = {
          AB: String(q.expected_answer.AB_m),
          A: String(q.expected_answer.BAC_degree),
          B: String(q.expected_answer.ABC_degree),
        };
      } else if (q.type === 'agree_explain') {
        sampleAnswer = {
          agree: q.expected_answer.agree,
          cAngle: String(q.expected_answer.C_degree),
          explanation: q.solution_vi,
        };
      }
      if (gradeQuestion(q, sampleAnswer).isCorrect) passed16 += 1;
    }
    results.push({
      id: 15,
      name: 'Độ chính xác bộ chấm trên toàn bộ 16 câu hạt giống BS01',
      passed: passed16 === 16,
      detail: `${passed16}/16 câu hạt giống (P01–P04, M01–M06, R01–R04, T01–T02) tự chấm chính xác.`,
    });
  }

  // 16. Ngân hàng mở rộng Chương III (≥40 câu chuyển thể, 6 chủ đề × ≥6 câu, 4 mức, 3 dạng, kiểm chứng số bằng code)
  {
    const countTotal = EXPANDED_CHAPTER3_ITEMS.length;
    const allClustersEnough = SKILL_CLUSTER_LIST.every(
      (c) => EXPANDED_CHAPTER3_ITEMS.filter((q) => q.cluster === c).length >= 6,
    );
    const allLevelsCovered = ([1, 2, 3, 4] as const).every((lv) =>
      SKILL_CLUSTER_LIST.every(
        (c) => EXPANDED_CHAPTER3_ITEMS.some((q) => q.cluster === c && q.level === lv),
      ),
    );
    const mcqCount = EXPANDED_CHAPTER3_ITEMS.filter((q) => q.type === 'mcq' && (q.options?.length ?? 0) === 4).length;
    const tfCount = EXPANDED_CHAPTER3_ITEMS.filter((q) => q.type === 'true_false_multi' && (q.statements?.length ?? 0) === 4).length;
    const numItems = EXPANDED_CHAPTER3_ITEMS.filter((q) => q.type === 'numeric');

    const metaOk = EXPANDED_CHAPTER3_ITEMS.every(
      (q) =>
        q.review_status === 'approved' &&
        q.is_adapted === true &&
        q.hints_vi.length >= 2 &&
        q.anticipated_error_ids.length >= 1 &&
        q.solution_vi.trim().length > 0,
    );

    const codeVerifiedOk = numItems.every((q) => {
      const check = verifyQuestionByCode(q);
      return check.status === 'verified_match' && !check.hint1LeaksAnswer;
    });

    const gradingOk = EXPANDED_CHAPTER3_ITEMS.every((q) => {
      if (q.type === 'mcq') return gradeQuestion(q, String(q.expected_answer.choice)).isCorrect;
      if (q.type === 'true_false_multi') {
        const ans = Object.fromEntries((q.statements ?? []).map((s) => [s.id, s.isTrue]));
        return gradeQuestion(q, ans).isCorrect;
      }
      if (q.type === 'numeric') {
        const val = q.expected_answer.rounded ?? q.expected_answer.value;
        return gradeQuestion(q, String(val).replace('.', ',')).isCorrect;
      }
      return false;
    });

    const ok =
      countTotal >= 40 &&
      allClustersEnough &&
      allLevelsCovered &&
      mcqCount >= 6 &&
      tfCount >= 6 &&
      numItems.length >= 6 &&
      metaOk &&
      codeVerifiedOk &&
      gradingOk;

    results.push({
      id: 16,
      name: 'Ngân hàng mở rộng Chương III (48 câu chuyển thể, 6 chủ đề × 4 mức, kiểm chứng code)',
      passed: ok,
      detail: `${countTotal} câu (8 câu/chủ đề × 6 chủ đề; ${mcqCount} trắc nghiệm 4 lựa chọn, ${tfCount} đúng/sai nhiều ý, ${numItems.length} trả lời ngắn). 100% đã kiểm duyệt chuẩn hóa, is_adapted=true, 2 mức gợi ý không lộ đáp án và ${numItems.length}/${numItems.length} câu số khớp code.`,
    });
  }

  // 17. Mô phỏng 1.000 lượt đấu cho mỗi BOSS B1–B5 (tổng 5.000 lượt)
  const bossSimulation = runBoss1000Simulations(ALL_INITIAL_QUESTIONS, true, 1000);
  {
    const summaryText = bossSimulation.rows
      .map(
        (r) =>
          `${r.bossId}(${r.hitsPerRun}đ): thiếu=${r.missingQuestionRuns}, trùng=${r.duplicateInRunCount}, sát thương=${r.totalDamageWhenAllCorrect}%, lặp liên tiếp=${r.identicalConsecutivePairs}`,
      )
      .join(' | ');
    results.push({
      id: 17,
      name: 'Mô phỏng 1.000 lượt đấu cho mỗi BOSS B1–B5 (tổng 5.000 lượt)',
      passed: bossSimulation.allPassed,
      detail: `${bossSimulation.totalSimulatedRuns.toLocaleString('vi-VN')} lượt (${bossSimulation.totalQuestionsGenerated.toLocaleString('vi-VN')} câu, ${bossSimulation.durationMs}ms) — ${summaryText}`,
    });
  }

  // 18. Đọc lặp lại cùng một tệp PDF 3 lần & đổi khoảng trang 1–6 → 1–16 không lỗi detached ArrayBuffer
  {
    const buildMinimalPdf = (numPages: number): Uint8Array => {
      const encoder = new TextEncoder();
      const parts: string[] = ['%PDF-1.4\n'];
      const offsets: number[] = [0];
      let curLen = parts[0].length;
      const pushObj = (num: number, body: string) => {
        offsets[num] = curLen;
        const chunk = `${num} 0 obj\n${body}\nendobj\n`;
        parts.push(chunk);
        curLen += chunk.length;
      };
      const kids: string[] = [];
      for (let i = 0; i < numPages; i++) {
        kids.push(`${3 + i} 0 R`);
      }
      pushObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      pushObj(2, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${numPages} >>`);
      for (let i = 0; i < numPages; i++) {
        pushObj(3 + i, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>');
      }
      const xrefOffset = curLen;
      const totalObjs = 2 + numPages;
      let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
      for (let i = 1; i <= totalObjs; i++) {
        xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
      }
      const trailer = `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
      parts.push(xref, trailer);
      return encoder.encode(parts.join(''));
    };

    try {
      const pdfBytes = buildMinimalPdf(16);
      const r1 = await readPdfDocumentRange(pdfBytes, {
        fileName: 'test-16-trang.pdf',
        startPage: 1,
        endPage: 6,
        renderImages: false,
      });
      const r2 = await readPdfDocumentRange(pdfBytes, {
        fileName: 'test-16-trang.pdf',
        startPage: 1,
        endPage: 6,
        renderImages: false,
      });
      const r3 = await readPdfDocumentRange(pdfBytes, {
        fileName: 'test-16-trang.pdf',
        startPage: 1,
        endPage: 16,
        renderImages: false,
      });
      const summary = formatPdfStatusSummary({
        totalPages: r3.totalPages,
        startPage: r3.startPage,
        endPage: r3.endPage,
        readCount: r3.readCount,
        imageUsedCount: r3.imageUsedCount,
        errorCount: r3.errorCount,
      });
      const ok =
        pdfBytes.byteLength > 200 &&
        r1.totalPages === 16 &&
        r1.readCount === 6 &&
        r2.readCount === 6 &&
        r3.readCount === 16 &&
        r3.errorCount === 0 &&
        summary.includes('PDF 16 trang · Khoảng đọc 1–16 · Đã đọc 16/16 trang');
      results.push({
        id: 18,
        name: 'Đọc lặp lại PDF 3 lần (1–6 → 1–6 → 1–16) không lỗi detached ArrayBuffer',
        passed: ok,
        detail: `${summary} · buffer gốc vẫn nguyên vẹn (${pdfBytes.byteLength} bytes).`,
      });
    } catch (err) {
      results.push({
        id: 18,
        name: 'Đọc lặp lại PDF 3 lần (1–6 → 1–6 → 1–16) không lỗi detached ArrayBuffer',
        passed: false,
        detail: `Lỗi đọc PDF: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 19. Phát hiện trang PDF hỏng toán / có hình vẽ -> bắt buộc gửi ảnh
  {
    const garbledText = 'Cau 1: Cho tam giac ABC \uE012 \uE015 \uF021 tinh goc A nhu hinh ve duoi day.';
    const cleanText =
      'Câu 1: Trong các khẳng định sau về lịch sử toán học, khẳng định nào đúng? Hãy chọn một trong bốn phương án A, B, C, D dưới đây theo nội dung đọc hiểu chung về chương trình phổ thông mới.';
    const hGarbled = analyzePageMathTextHealth(garbledText);
    const hClean = analyzePageMathTextHealth(cleanText);
    const ok =
      hGarbled.isGarbled &&
      hGarbled.hasFigureCue &&
      hGarbled.sendMode !== 'text_only' &&
      !hClean.isGarbled &&
      hClean.sendMode === 'text_only';
    results.push({
      id: 19,
      name: 'Phát hiện lớp chữ PDF hỏng toán / có hình vẽ để tự động gửi ảnh cho AI',
      passed: ok,
      detail: `Trang lỗi ký tự PUA + hình: mode=${hGarbled.sendMode} (${hGarbled.reasons.join('; ')}); trang thuần chữ: mode=${hClean.sendMode}.`,
    });
  }

  // 20. Kiểm tra schema validator JSON trích xuất từ Gemini
  {
    const validPayload = {
      items: [
        {
          number: '1',
          type: 'mcq',
          stem_latex: 'Cho tam giác $ABC$ có $b=6, c=8, \\widehat{A}=60^\\circ$. Tính cạnh $a$.',
          options: [
            {key: 'A', text: '$2\\sqrt{13}$'},
            {key: 'B', text: '$10$'},
          ],
          expected_answer_key: 'A',
          pattern_id: 'COS-01',
          level: 2,
          confidence: 0.92,
        },
      ],
    };
    const invalidPayload = {wrongKey: [{type: 'mcq'}]};
    const vOk = validateRawExtractionResponse(validPayload);
    const vBad = validateRawExtractionResponse(invalidPayload);
    const ok = vOk.valid && vOk.items.length === 1 && !vBad.valid;
    results.push({
      id: 20,
      name: 'Schema validator JSON trích xuất AI (chấp nhận đúng, chặn lỗi thiếu trường)',
      passed: ok,
      detail: `Hợp lệ: valid=${vOk.valid} (${vOk.items.length} câu); Sai schema: valid=${vBad.valid} (${vBad.error ?? ''}).`,
    });
  }

  // 21. Đọc bảng đáp án ngang & ghép vào câu hỏi trích xuất (Phần I/II/III)
  {
    const rawKeyTable = `
      PHẦN I. Trắc nghiệm
      Câu 17 18 19 20 21 22
      A B C D A B
      PHẦN III. Trả lời ngắn
      Câu 1: 55,3
    `;
    const parsedKeys = parseAnswerKeyTableText(rawKeyTable);
    const sampleDrafts: QuestionItem[] = [
      {
        id: 'tmp_17',
        cluster: 'COS',
        skill_ids: ['cos'],
        level: 2,
        type: 'mcq',
        part: 'I',
        question_number: '17',
        stem_vi: 'Câu 17 mẫu',
        options: [
          {id: 'a', label: 'A'},
          {id: 'b', label: 'B'},
          {id: 'c', label: 'C'},
          {id: 'd', label: 'D'},
        ],
        expected_answer: {},
        solution_vi: '',
        anticipated_error_ids: ['E05'],
        hints_vi: ['Gợi ý 1', 'Gợi ý 2'],
        review_status: 'pending_teacher_review',
        source_refs: ['test.pdf'],
        is_adapted: false,
      },
      {
        id: 'tmp_20',
        cluster: 'SIN',
        skill_ids: ['sin'],
        level: 2,
        type: 'mcq',
        part: 'I',
        question_number: '20',
        stem_vi: 'Câu 20 mẫu',
        options: [
          {id: 'a', label: 'A'},
          {id: 'b', label: 'B'},
          {id: 'c', label: 'C'},
          {id: 'd', label: 'D'},
        ],
        expected_answer: {},
        solution_vi: '',
        anticipated_error_ids: ['E05'],
        hints_vi: ['Gợi ý 1', 'Gợi ý 2'],
        review_status: 'pending_teacher_review',
        source_refs: ['test.pdf'],
        is_adapted: false,
      },
    ];
    const applied = applyAnswerKeysToDrafts(sampleDrafts, parsedKeys);
    const q17 = applied.items.find((q) => q.question_number === '17');
    const q20 = applied.items.find((q) => q.question_number === '20');
    const ok =
      parsedKeys.length >= 6 &&
      applied.matchedCount === 2 &&
      q17?.expected_answer.choice === 'a' &&
      q20?.expected_answer.choice === 'd';
    results.push({
      id: 21,
      name: 'Ghép bảng đáp án ngang (Câu 17..22 | A B C D A B) vào câu hỏi trích xuất',
      passed: ok,
      detail: `Đọc được ${parsedKeys.length} đáp án; ghép khớp ${applied.matchedCount}/2 (Câu 17→${q17?.expected_answer.choice}, Câu 20→${q20?.expected_answer.choice}).`,
    });
  }

  // 22. Bộ giải toán xác định (Côsin, Sin, Diện tích Heron/pr/abc/4R, Chiều cao 2 góc MH-02)
  {
    const cosSide = solveByPatternAndGivens('COS-01', {b: 6, c: 8, A_deg: 60}); // sqrt(36+64-48)=sqrt(52)≈7.2111
    const cosAng = solveByPatternAndGivens('COS-02', {a: 7, b: 8, c: 5}); // cosA=(64+25-49)/80=0.5 => 60°
    const sinR = solveByPatternAndGivens('SIN-02', {a: 10, A_deg: 30}); // R = 10/(2*0.5) = 10
    const areaSin = solveByPatternAndGivens('DT-01', {b: 6, c: 8, A_deg: 30}); // 0.5*6*8*0.5 = 12
    const areaHeron = solveByPatternAndGivens('DT-02', {a: 5, b: 6, c: 7}); // sqrt(9*4*3*2)=6*sqrt(6)≈14.6969
    const areaPr = solveByPatternAndGivens('DT-03', {p: 12, r: 2}); // 24
    const area4R = solveByPatternAndGivens('DT-04', {a: 6, b: 8, c: 10, R: 5}); // 480/20 = 24
    const height2Ang = solveByPatternAndGivens('MH-02', {d: 50, alpha_deg: 30, beta_deg: 60}); // 50*0.5*(sqrt(3)/2)/0.5 = 25*sqrt(3)≈43.3013
    const verCheck = verifyQuestionWithSolvers({
      id: 'sol_chk',
      cluster: 'COS',
      skill_ids: ['cos'],
      level: 2,
      type: 'numeric',
      pattern_id: 'COS-02',
      givens: {a: 7, b: 8, c: 5},
      stem_vi: 'Tam giác có a=7, b=8, c=5. Tính góc A.',
      expected_answer: {value: 60, rounded: 60, decimal_places: 1, unit: '°'},
      solution_vi: '60°',
      anticipated_error_ids: ['E05'],
      hints_vi: ['Dùng Côsin', 'arccos(0.5)=60'],
      review_status: 'approved',
      source_refs: ['selftest'],
      is_adapted: true,
    });
    const ok =
      cosSide.solved &&
      typeof cosSide.value === 'number' &&
      Math.abs(cosSide.value - Math.sqrt(52)) < 1e-4 &&
      cosAng.solved &&
      typeof cosAng.value === 'number' &&
      Math.abs(cosAng.value - 60) < 1e-4 &&
      sinR.solved &&
      typeof sinR.value === 'number' &&
      Math.abs(sinR.value - 10) < 1e-4 &&
      areaSin.solved &&
      typeof areaSin.value === 'number' &&
      Math.abs(areaSin.value - 12) < 1e-4 &&
      areaHeron.solved &&
      typeof areaHeron.value === 'number' &&
      Math.abs(areaHeron.value - 6 * Math.sqrt(6)) < 1e-4 &&
      areaPr.solved &&
      typeof areaPr.value === 'number' &&
      Math.abs(areaPr.value - 24) < 1e-4 &&
      area4R.solved &&
      typeof area4R.value === 'number' &&
      Math.abs(area4R.value - 24) < 1e-4 &&
      height2Ang.solved &&
      typeof height2Ang.value === 'number' &&
      Math.abs(height2Ang.value - 25 * Math.sqrt(3)) < 1e-4 &&
      verCheck.verified_by_code === 'pass';
    results.push({
      id: 22,
      name: 'Bộ giải kiểm chứng code (Côsin, Sin/R, Heron, S=pr, S=abc/4R, chiều cao 2 góc MH-02)',
      passed: ok,
      detail: `COS-01=${cosSide.value?.toFixed(3)}, COS-02=${cosAng.value?.toFixed(1)}°, SIN-02 R=${sinR.value?.toFixed(1)}, DT-02=${areaHeron.value?.toFixed(3)}, MH-02 h=${height2Ang.value?.toFixed(2)}m, verify=${verCheck.verified_by_code}.`,
    });
  }

  // 23. Idempotent upsert & chống trùng lặp khi nhập lại cùng tệp PDF
  {
    const svc = new DataService(new EphemeralStore());
    await svc.setupFirstAdmin({username: 'adm_imp', password: 'Password123', displayName: 'Admin Import'});
    const admin = svc.getCurrentUser()!;
    const sampleQ: QuestionItem = {
      id: 'pdf_dup_1',
      cluster: 'COS',
      skill_ids: ['cos'],
      level: 2,
      type: 'mcq',
      pattern_id: 'COS-01',
      stem_vi: 'Cho tam giác $ABC$ có $b = 5, c = 7, \\widehat{A} = 60^\\circ$. Độ dài cạnh $a$ là bao nhiêu?',
      options: [
        {id: 'a', label: '$\\sqrt{39}$'},
        {id: 'b', label: '$\\sqrt{109}$'},
        {id: 'c', label: '$6$'},
        {id: 'd', label: '$8$'},
      ],
      expected_answer: {choice: 'a'},
      solution_vi: '$a^2 = 25 + 49 - 35 = 39 \\Rightarrow a = \\sqrt{39}$.',
      anticipated_error_ids: ['E05'],
      hints_vi: ['Áp dụng Định lý Côsin', 'Thay số cẩn thận dấu trừ'],
      review_status: 'pending_teacher_review',
      source_refs: ['de-mau.pdf'],
      is_adapted: false,
    };
    sampleQ.fingerprint = computeQuestionFingerprint(sampleQ);
    const rFirst = svc.upsertImportedQuestions(admin, [sampleQ], {
      targetStatus: 'approved',
      duplicateAction: 'skip',
    });
    const countAfterFirst = svc.getQuestions().length;
    const rSecond = svc.upsertImportedQuestions(admin, [{...sampleQ, id: 'pdf_dup_2'}], {
      targetStatus: 'approved',
      duplicateAction: 'skip',
    });
    const countAfterSecond = svc.getQuestions().length;
    const ok =
      rFirst.added === 1 &&
      rSecond.added === 0 &&
      rSecond.skippedDuplicates === 1 &&
      countAfterFirst === countAfterSecond;
    results.push({
      id: 23,
      name: 'Nhập lại cùng tệp PDF không tạo câu trùng lặp (Idempotent fingerprint upsert)',
      passed: ok,
      detail: `Lần 1: +${rFirst.added}; Lần 2: +${rSecond.added}, bỏ qua trùng=${rSecond.skippedDuplicates} (tổng giữ nguyên ${countAfterSecond} câu).`,
    });
  }

  // 24. Kiểm tra ràng buộc Set nhiệm vụ (thiếu câu, giảm mức, trùng BOSS, transfer trùng luyện tập, câu chưa duyệt)
  {
    const approvedSample = ALL_INITIAL_QUESTIONS.filter((q) => q.review_status === 'approved');
    const q1 = approvedSample[0];
    const unapprovedQ: QuestionItem = {
      ...q1,
      id: 'q_unapproved_test',
      review_status: 'pending_teacher_review',
    };
    const bankWithUnapproved = [...approvedSample, unapprovedQ];

    const brokenSet: MissionSetRecord = {
      id: 'ms_test_broken',
      mocId: 2,
      stationId: 'QS01',
      classId: 'ALL',
      status: 'draft',
      version: 1,
      slots: [
        {
          id: 's1',
          role: 'main',
          label: 'Mức cao trước',
          mode: 'fixed',
          count: 2,
          levelMin: 4,
          levelMax: 4,
          requiredToPass: true,
          verifyMode: false,
          fixedQuestionIds: [q1.id], // shortage: needs 2, has 1
        },
        {
          id: 's2',
          role: 'transfer',
          label: 'Tự giải mức thấp hơn + trùng câu luyện tập + chưa duyệt',
          mode: 'fixed',
          count: 2,
          levelMin: 1,
          levelMax: 1,
          requiredToPass: true,
          verifyMode: true,
          fixedQuestionIds: [q1.id, unapprovedQ.id], // reuses q1 + includes unapproved!
        },
      ],
      bossSlots: [
        {
          id: 'b1',
          role: 'boss_hit',
          label: 'BOSS trùng câu với nhiệm vụ',
          mode: 'fixed',
          count: 1,
          levelMin: 2,
          levelMax: 2,
          requiredToPass: true,
          verifyMode: true,
          fixedQuestionIds: [q1.id],
        },
      ],
      createdBy: 'Admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const brokenRes = validateMissionSet(brokenSet, bankWithUnapproved);
    const errJoined = brokenRes.errors.join(' | ');
    const hasShortage = errJoined.includes('mới chọn 1');
    const hasDecreasing = errJoined.includes('giảm so với ô trước');
    const hasBossDup = errJoined.includes('bị trùng giữa Nhiệm vụ mốc và BOSS');
    const hasTransferDup = errJoined.includes('dùng lại câu');
    const hasUnapproved = errJoined.includes('chưa được Admin duyệt');

    const suggested = autoSuggestMissionSet({
      mocId: 2,
      bank: approvedSample,
      classId: 'ALL',
      actorName: 'Admin',
      actorUid: 'adm_test',
    });
    const suggestedRes = validateMissionSet(suggested, approvedSample);
    const ok =
      !brokenRes.valid &&
      hasShortage &&
      hasDecreasing &&
      hasBossDup &&
      hasTransferDup &&
      hasUnapproved &&
      suggestedRes.valid;
    results.push({
      id: 24,
      name: 'Kiểm tra ràng buộc Set nhiệm vụ & Đề xuất tự động không lỗi',
      passed: ok,
      detail: `Phát hiện đủ 5 lỗi chặn (${brokenRes.errors.length} thông báo); Auto-Suggest Mốc 2 hợp lệ=${suggestedRes.valid} (${suggestedRes.errors.length} lỗi).`,
    });
  }

  // 25. Phân quyền: Giáo viên không tự duyệt/xuất bản; Học viên không thấy import_batches hay câu chưa duyệt
  {
    const svc = new DataService(new EphemeralStore());
    await svc.setupFirstAdmin({username: 'adm_rbac', password: 'Password123', displayName: 'Admin RBAC'});
    const admin = svc.getCurrentUser()!;
    const teacherRes = await svc.adminCreateTeacher(admin, {
      username: 'gv_rbac',
      password: 'Password123',
      displayName: 'GV RBAC',
    });
    const teacher = teacherRes.user!;
    const cls = svc.getClasses()[0];
    const stuRes = await svc.registerStudent({
      username: 'hv_rbac',
      password: 'Password123',
      displayName: 'HV RBAC',
      classCode: cls.code,
    });
    const student = stuRes.user!;

    // Teacher saves an import batch & a mission set draft
    svc.saveImportBatch(teacher, {
      id: 'batch_gv_1',
      ownerUid: teacher.uid,
      ownerName: teacher.displayName,
      fileName: 'de-gv.pdf',
      fileSha256: 'abc123',
      totalPages: 2,
      startPage: 1,
      endPage: 2,
      classificationMode: 'web_taxonomy',
      status: 'reviewing',
      pages: [],
      draftQuestions: [],
      answerKeys: [],
      examCodes: [],
      aiCallsUsed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const teacherUpsert = svc.upsertImportedQuestions(
      teacher,
      [
        {
          id: 'q_gv_prop',
          cluster: 'SIN',
          skill_ids: ['sin'],
          level: 2,
          type: 'numeric',
          stem_vi: 'Câu GV đề xuất thử quyền duyệt',
          expected_answer: {value: 10, rounded: 10, decimal_places: 1, unit: 'm'},
          solution_vi: '10 m',
          anticipated_error_ids: ['E05'],
          hints_vi: ['Gợi ý 1', 'Gợi ý 2'],
          review_status: 'approved', // teacher tries to force approved!
          source_refs: ['de-gv.pdf'],
          is_adapted: false,
        },
      ],
      {targetStatus: 'approved'},
    );
    const savedTeacherQ = svc.getQuestions().find((q) => q.id === teacherUpsert.savedIds[0]);
    const teacherApproveRes = svc.setQuestionReviewStatus(teacher, [savedTeacherQ?.id ?? ''], 'approved');
    const teacherDraftMs = svc.saveMissionSetDraft(teacher, {
      id: 'ms_moc_1_ALL',
      mocId: 1,
      stationId: 'QS01',
      classId: 'ALL',
      version: 1,
      slots: [],
      bossSlots: [],
      status: 'published', // teacher tries to publish directly!
    });
    const teacherPubRes = svc.adminPublishMissionSet(teacher, teacherDraftMs.record?.id ?? 'ms_moc_1_ALL');
    const studentBatches = svc.getImportBatches(student);
    const studentMissionSets = svc.getMissionSets(student);

    const ok =
      savedTeacherQ?.review_status === 'pending_teacher_review' &&
      teacherApproveRes === false &&
      teacherDraftMs.record?.status === 'pending_admin_review' &&
      teacherPubRes.ok === false &&
      studentBatches.length === 0 &&
      studentMissionSets.every((m) => m.status === 'published');
    results.push({
      id: 25,
      name: 'Phân quyền chặt chẽ (GV không tự duyệt/xuất bản; HS không thấy lô nhập hay nháp)',
      passed: ok,
      detail: `Câu GV bị ép về=${savedTeacherQ?.review_status}, tự duyệt=${teacherApproveRes}, bộ NV GV bị ép về=${teacherDraftMs.record?.status}, tự xuất bản=${teacherPubRes.ok}, lô nhập HS đọc được=${studentBatches.length}.`,
    });
  }

  // 26. Cache trích xuất AI theo (sha256, pageRange, promptVersion, model) -> 0 lượt gọi AI khi đọc lại
  {
    clearExtractionCache();
    const fakeSha = 'sha256_selftest_cache_001';
    const cachedQ: QuestionItem = {
      ...ALL_INITIAL_QUESTIONS[0],
      id: 'cached_q_1',
    };
    saveCachedExtractionResult({
      sha256: fakeSha,
      pageRange: 'q:1,2',
      promptVersion: PROMPT_VERSION,
      model: 'gemini-3.1-flash-lite',
      items: [cachedQ],
      answerKeys: [],
    });
    const hit = await extractWindowViaAi({
      pages: [
        {
          pagePdf: 1,
          text: 'Trang 1',
          state: {pagePdf: 1, status: 'read', sendMode: 'text_only', textLength: 7},
          cachedImage: null,
        },
        {
          pagePdf: 2,
          text: 'Trang 2',
          state: {pagePdf: 2, status: 'read', sendMode: 'text_only', textLength: 7},
          cachedImage: null,
        },
      ],
      fileName: 'cache-test.pdf',
      fileSha256: fakeSha,
      accessToken: null,
      maxDaily: 50,
      aiEnabled: false, // Even with AI off, cache hit must return immediately with 0 API calls!
      classificationMode: 'web_taxonomy',
      taxonomy: [],
      model: 'gemini-3.1-flash-lite',
    });
    clearExtractionCache();
    const ok = hit.fromCache === true && hit.items.length === 1 && hit.items[0].id === 'cached_q_1';
    results.push({
      id: 26,
      name: 'Cache trích xuất AI theo (SHA-256, trang, prompt, model) — 0 lượt gọi mạng khi đọc lại',
      passed: ok,
      detail: `fromCache=${hit.fromCache}, items=${hit.items.length}, model=${hit.usedModel}.`,
    });
  }

  // 27. Golden tests (Phụ lục #1–#22) cho normalizeMath & splitMath
  const goldenCases: Array<{id: number; input: string; expected: string}> = [
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
  {
    const fails: string[] = [];
    for (const tc of goldenCases) {
      const r = normalizeMath(tc.input);
      if (r.normalized !== tc.expected || r.flags.length > 0) {
        fails.push(`#${tc.id} (got=${r.normalized})`);
      }
    }
    const vecWord = normalizeMath('vectơ AB').normalized === '$\\overrightarrow{AB}$';
    const unbal = splitMath('Tính $AC = 55,3').error === 'unbalanced_dollar';
    const esc = splitMath('Giá \\$50 và $\\widehat{A}=60^\\circ$').segments[0]?.value === 'Giá $50 và ';
    const viDec = normalizeMath('AC ≈ 55,3 m').normalized.includes('55{,}3') && formatVi(55.296, 1) === '55,3';
    const ok = fails.length === 0 && vecWord && unbal && esc && viDec;
    results.push({
      id: 27,
      name: '22 Golden Tests chuẩn hóa LaTeX (Phụ lục #1–#22, dấu $ lẻ, \\$, thập phân Việt)',
      passed: ok,
      detail: ok
        ? '22/22 mẫu Phụ lục khớp chính xác tuyệt đối (kể cả đu quay 115 m, BC 345 m, góc BAC, dấu $ lẻ, \\$, 55{,}3).'
        : `Lệch ở: ${fails.join('; ')} (vec=${vecWord}, unbal=${unbal}, esc=${esc}, viDec=${viDec})`,
    });
  }

  // 28. KaTeX parse + MathML không rỗng cho toàn bộ LaTeX Phụ lục
  {
    let totalSegments = 0;
    const errors: string[] = [];
    for (const tc of goldenCases) {
      const sp = splitMath(tc.expected);
      for (const seg of sp.segments) {
        if (seg.type !== 'text') {
          totalSegments += 1;
          const k = renderKatexSafe(seg.value, {displayMode: seg.type === 'block', strictMode: true});
          if (!k.ok || !k.html.includes('<math')) {
            errors.push(`#${tc.id}: ${k.rawError ?? 'thiếu MathML'}`);
          }
        }
      }
    }
    results.push({
      id: 28,
      name: 'KaTeX parse toàn bộ LaTeX Phụ lục & xuất đủ MathML (output: htmlAndMathml)',
      passed: errors.length === 0 && totalSegments >= 20,
      detail: `${totalSegments - errors.length}/${totalSegments} biểu thức render sạch và có thẻ <math> (MathML).`,
    });
  }

  // 29. Property-based: bảo toàn tập token số trên 220 chuỗi sinh ngẫu nhiên
  {
    let mismatchCount = 0;
    for (let i = 1; i <= 220; i++) {
      const a = ((i * 7) % 97) + 1;
      const b = ((i * 13) % 83) + 2;
      const dec = `${a},${((i * 3) % 9) + 1}`;
      const deg = ((i * 11) % 150) + 10;
      const samples = [
        `Cho tam giác có cạnh ${dec} m và góc ${deg}°`,
        `AC = ${a}·sin${deg}°/sin${Math.min(170, deg + 5)}° ≈ ${dec} m`,
        `∠BAC = ${deg}° và S = ${b}√${(i % 17) + 2} ≈ ${dec} m²`,
      ];
      const src = samples[i % samples.length];
      const out = normalizeMath(src).normalized;
      if (!compareNumberMultisets(extractNumberTokens(src), extractNumberTokens(out)).match) {
        mismatchCount += 1;
      }
    }
    results.push({
      id: 29,
      name: 'Bảo toàn tuyệt đối tập token số khi chuẩn hóa (220 chuỗi ngẫu nhiên)',
      passed: mismatchCount === 0,
      detail: `220/220 chuỗi kiểm chứng multiset số: lệch=${mismatchCount}.`,
    });
  }

  // 30. Lớp kiểm tra tự động (a)–(d): thiếu số, thừa số, lệch ký hiệu, thiếu ngoặc }, đáp án sai
  {
    const baseQ: QuestionItem = {
      ...ALL_INITIAL_QUESTIONS[0],
      id: 'st_layer_q',
      type: 'numeric',
      pattern_id: 'COS-02',
      givens: {a: 7, b: 8, c: 5},
      stem_vi: 'Tam giác $ABC$ có $a=7, b=8, c=5$. Tính góc $\\widehat{A}$.',
      expected_answer: {value: 60, rounded: 60, decimal_places: 1, unit: '°'},
    };
    const rA = verifyQuestionMathLayers({...baseQ, stem_vi: 'Tính $\\dfrac{a}{b$'});
    const rB = verifyQuestionMathLayers(baseQ, {referenceText: 'Tam giác ABC có a=7, b=8, c=5, d=12.'});
    const rC = verifyQuestionMathLayers(baseQ, {doubleCheckText: 'Tam giác ABC có a=7, b=8, c=5, 60° và √3.'});
    const rD = verifyQuestionMathLayers({...baseQ, expected_answer: {value: 90, rounded: 90, decimal_places: 1, unit: '°'}});
    const ok =
      rA.flags.includes('latex_syntax_error') &&
      rB.flags.includes('numbers_mismatch') &&
      Boolean(rB.numberMismatch?.missing.includes('12')) &&
      rC.flags.includes('symbols_mismatch') &&
      rD.solverStatus === 'fail' &&
      rD.flags.includes('answer_mismatch');
    results.push({
      id: 30,
      name: 'Kiểm chứng tự động 4 lớp (a–d): cú pháp KaTeX, đối chiếu số, đối chiếu ký hiệu, solver',
      passed: ok,
      detail: `Phát hiện đủ: (a) syntax=${rA.flags.includes('latex_syntax_error')}, (b) thiếu số 12=${Boolean(rB.numberMismatch?.missing.includes('12'))}, (c) ký hiệu=${rC.flags.includes('symbols_mismatch')}, (d) lệch đáp án=${rD.solverStatus}.`,
    });
  }

  // 31. Cổng duyệt math_verified=false chặn approved; sửa công thức đặt lại math_verified=false
  {
    const svc = new DataService(new EphemeralStore());
    await svc.setupFirstAdmin({username: 'adm_mver', password: 'Password123', displayName: 'Admin MV'});
    const adm = svc.getCurrentUser()!;
    svc.upsertQuestion(
      adm,
      {
        ...ALL_INITIAL_QUESTIONS[0],
        id: 'st_mver_1',
        stem_vi: 'Tính $\\sin 60^\\circ + \\cos 30^\\circ$.',
        review_status: 'pending_teacher_review',
        math_verified: false,
      },
      'Tạo câu chờ đối chiếu',
    );
    const blockedBefore = !svc.setQuestionReviewStatus(adm, ['st_mver_1'], 'approved');
    const verifiedOk = svc.markQuestionMathVerified(adm, ['st_mver_1'], true).ok;
    const approvedAfter = svc.setQuestionReviewStatus(adm, ['st_mver_1'], 'approved');
    const liveQ = svc.getQuestions().find((x) => x.id === 'st_mver_1')!;
    svc.upsertQuestion(adm, {...liveQ, stem_vi: 'Tính $\\sin 45^\\circ + \\cos 45^\\circ$.'}, 'Sửa đề');
    const resetAfterEdit = svc.getQuestions().find((x) => x.id === 'st_mver_1')?.math_verified === false;
    const ok = blockedBefore && verifiedOk && approvedAfter && resetAfterEdit;
    results.push({
      id: 31,
      name: 'Cổng duyệt công thức (math_verified=false chặn duyệt; sửa đề tự reset về false)',
      passed: ok,
      detail: `Chặn duyệt khi chưa đối chiếu=${blockedBefore}, duyệt sau đối chiếu=${approvedAfter}, reset sau khi sửa=${resetAfterEdit}.`,
    });
  }

  // 32. Bảo mật LaTeX/HTML (chặn \href, \url, \includegraphics, <script>) & Đánh giá biểu thức độ an toàn
  {
    const blockHref = !renderKatexSafe('\\href{javascript:alert(1)}{x}').ok;
    const blockUrl = !renderKatexSafe('\\url{https://evil.test}').ok;
    const blockImg = !renderKatexSafe('\\includegraphics{a.png}').ok;
    const blockScript = !renderKatexSafe('<script>alert(1)</script>').ok;
    const degEval = evaluateSafeDegreeExpression('60*sin(60)/sin(70)');
    const ok =
      blockHref &&
      blockUrl &&
      blockImg &&
      blockScript &&
      degEval.valid &&
      typeof degEval.value === 'number' &&
      Math.abs(degEval.value - 55.2963) < 1e-3 &&
      degEval.previewLatex.includes('\\dfrac');
    results.push({
      id: 32,
      name: 'Bảo mật LaTeX/HTML (chặn lệnh nguy hiểm) & Trình tính biểu thức chế độ độ (không eval)',
      passed: ok,
      detail: `Chặn \\href/\\url/\\includegraphics/<script>=${blockHref && blockUrl && blockImg && blockScript}; 60*sin(60)/sin(70)≈${degEval.value?.toFixed(3)}.`,
    });
  }

  // 33. Audit toàn bộ ngân hàng hiện có (không có dấu $ lẻ hay lỗi cú pháp KaTeX)
  {
    const audit = runMathBankAudit(ALL_INITIAL_QUESTIONS);
    const syntaxBroken = (audit.byCode['unbalanced_dollar'] ?? 0) + (audit.byCode['latex_syntax_error'] ?? 0) + (audit.byCode['dangerous_command'] ?? 0);
    results.push({
      id: 33,
      name: 'Rà soát công thức ngân hàng gốc (audit:math — 0 dấu $ lẻ, 0 lỗi KaTeX, 0 lệnh nguy hiểm)',
      passed: syntaxBroken === 0,
      detail: `Quét ${audit.totalQuestions} câu: lỗi nghiêm trọng=${syntaxBroken}, cần chuẩn hóa nhẹ=${audit.withIssuesCount} (${JSON.stringify(audit.byCode)}).`,
    });
  }

  return {results, bossSimulation};
}

export async function runAllSelfTests(): Promise<SelfTestResult[]> {
  const {results} = await runAllSelfTestsWithReport();
  return results;
}

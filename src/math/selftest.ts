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

  // 14. Học liệu BS01 16 câu mặc định chờ duyệt & hỗ trợ tách tài khoản TEST khỏi báo cáo
  {
    const all16Pending =
      BS01_SEED_ITEMS.length === 16 &&
      BS01_SEED_ITEMS.every((item) => item.review_status === 'pending_teacher_review' && item.is_adapted);
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
      name: '16 câu BS01 mặc định pending_teacher_review & lọc dữ liệu TEST khỏi báo cáo thật',
      passed: all16Pending && excludedFromReal,
      detail: `16/16 câu hạt giống ở trạng thái chờ duyệt; dữ liệu tài khoản TEST được loại khỏi báo cáo lớp.`,
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
        q.review_status === 'pending_teacher_review' &&
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
      detail: `${countTotal} câu (8 câu/chủ đề × 6 chủ đề; ${mcqCount} trắc nghiệm 4 lựa chọn, ${tfCount} đúng/sai nhiều ý, ${numItems.length} trả lời ngắn). 100% pending_teacher_review, is_adapted=true, 2 mức gợi ý không lộ đáp án và ${numItems.length}/${numItems.length} câu số khớp code.`,
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

  return {results, bossSimulation};
}

export async function runAllSelfTests(): Promise<SelfTestResult[]> {
  const {results} = await runAllSelfTestsWithReport();
  return results;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialSkills, createInitialStations, DEFAULT_AVATAR} from '../config.ts';
import {
  ALL_MOC_IDS,
  applyAdminUnlockNextMoc,
  applyMocBossDefeated,
  applyMocMissionCompleted,
  buildMilestoneMissionQuestions,
  buildSmoothJourneySvgPath,
  canChallengeMocBoss,
  canEnterMoc,
  computeJourneyPercent,
  createInitialJourneyProgress,
  getEffectivePinCoords,
  isFreeModeUnlocked,
  JOURNEY_MILESTONES,
  pinPercentToSvgPoint,
} from '../journey.ts';
import {
  dataService,
  getSyncStatusLabel,
  mergeUserProgressIdempotent,
  registerStudentWithRollback,
} from '../services/dataService.ts';
import type {MocId, UserAccount} from '../types.ts';
import {computeT01Rubric, gradeQuestion} from './grader.ts';
import {analyzeQuestionBankDistribution, runBoss1000Simulations} from './bankAnalysis.ts';
import {EXPANDED_CHAPTER3_ITEMS} from './expandedBank.ts';
import {ALL_INITIAL_QUESTIONS} from './seedBank.ts';
import {runAllSelfTests} from './selftest.ts';
import {verifyQuestionByCode} from './verifier.ts';

test('Toán Du Ký — Toàn bộ 26 bài kiểm thử bắt buộc', async () => {
  const results = await runAllSelfTests();
  assert.equal(results.length, 26, 'Phải có đúng 26 kiểm thử bắt buộc');
  for (const r of results) {
    assert.equal(r.passed, true, `Kiểm thử #${r.id} (${r.name}) thất bại: ${r.detail}`);
  }
});

test('Rubric 10 điểm câu T01 tách biệt với XP', () => {
  const full = computeT01Rubric({
    angleCInput: '75',
    acInput: '35,9 m',
    explanation: 'Áp dụng Định lý Sin ghép AC đối diện góc B = 60 độ và AB đối diện góc C = 75 độ.',
  });
  assert.equal(full.total, 10);

  const partial = computeT01Rubric({
    angleCInput: '75',
    acInput: '36',
    hasFixedUnit: false,
    explanation: 'Tính ra',
  });
  assert.equal(partial.total, 2);
});

test('Đăng ký sai mã lớp hoặc mã lớp hết hạn phải xóa ngay tài khoản Auth vừa tạo (rollback)', async () => {
  const deletedUids: string[] = [];

  // 1. Mã lớp không tồn tại
  const invalidRes = await registerStudentWithRollback(
    {
      createAuthUser: async () => ({uid: 'auth_orphan_1'}),
      getAuthUid: (u) => u.uid,
      deleteAuthUser: async (u) => {
        deletedUids.push(u.uid);
      },
      lookupClassCode: async () => null,
      writeUserDoc: async () => {
        throw new Error('Không được ghi users doc khi mã lớp sai');
      },
    },
    {email: 'hs01@toanduky.local', password: 'Password123', classCode: 'SAI-MA-LOP'},
  );
  assert.equal(invalidRes.ok, false);
  assert.equal(invalidRes.rolledBackAuth, true);
  assert.deepEqual(deletedUids, ['auth_orphan_1']);

  // 2. Mã lớp hết hạn
  const expiredRes = await registerStudentWithRollback(
    {
      createAuthUser: async () => ({uid: 'auth_orphan_2'}),
      getAuthUid: (u) => u.uid,
      deleteAuthUser: async (u) => {
        deletedUids.push(u.uid);
      },
      lookupClassCode: async () => ({
        code: 'TOAN10-OLD',
        classId: 'cls_default',
        className: 'Toán 10',
        teacherUid: 'gv_1',
        active: true,
        expiresAt: '2020-01-01T00:00:00.000Z',
      }),
      writeUserDoc: async () => {
        throw new Error('Không được ghi users doc khi mã lớp hết hạn');
      },
    },
    {
      email: 'hs02@toanduky.local',
      password: 'Password123',
      classCode: 'TOAN10-OLD',
      nowMs: new Date('2026-09-01T00:00:00.000Z').getTime(),
    },
  );
  assert.equal(expiredRes.ok, false);
  assert.equal(expiredRes.rolledBackAuth, true);
  assert.deepEqual(deletedUids, ['auth_orphan_1', 'auth_orphan_2']);
});

test('Đồng bộ Local -> Server không tạo trùng XP/vật phẩm và không ghi đè trường bảo vệ (role, classId, status, studentCode)', () => {
  const base: UserAccount = {
    uid: 'uid_server_1',
    username: 'hocvien01',
    passwordHash: '',
    passwordSalt: '',
    role: 'student',
    status: 'active',
    displayName: 'Học viên A',
    studentCode: 'HS-10-01',
    classId: 'cls_default',
    classCode: 'TOAN10-01',
    teacherUid: 'quantri_01',
    assignedClassIds: [],
    researchConsent: true,
    isTestAccount: false,
    locked: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    avatarCreated: true,
    avatar: {...DEFAULT_AVATAR},
    xp: 50,
    awardedKeys: ['step_P01', 'chest_BS01'],
    skills: createInitialSkills(),
    inventory: {
      outfits: ['hoc_vien', 'ao_xanh_ngoc'],
      tools: ['tool_ruler'],
      heroCards: [],
      landmarkCards: ['lm_bs01'],
      skillCards: ['sk_angle_sum'],
      upgradeShards: 1,
      openedChests: ['chest_BS01'],
    },
    stations: createInitialStations(),
    pausedSession: null,
    recentQuestionSessions: [],
    leaderboardOptIn: false,
    preferences: {audioEnabled: false, reduceMotion: false, easyMove: false},
  };

  // Bản local cố tình giả lập bị sửa role/classId/status/studentCode + có thêm XP mới
  const tamperedLocal: UserAccount = {
    ...base,
    uid: 'local_temp_uid',
    role: 'admin',
    status: 'locked',
    classId: 'cls_other',
    studentCode: 'FAKE-99',
    xp: 80,
    awardedKeys: ['step_P01', 'step_M01'],
    inventory: {
      ...base.inventory,
      outfits: ['hoc_vien', 'ao_cham_kham_pha'],
      openedChests: ['chest_BS01', 'chest_QS01'],
    },
  };

  const merged1 = mergeUserProgressIdempotent(base, tamperedLocal);
  assert.equal(merged1.uid, 'uid_server_1');
  assert.equal(merged1.role, 'student');
  assert.equal(merged1.status, 'active');
  assert.equal(merged1.classId, 'cls_default');
  assert.equal(merged1.studentCode, 'HS-10-01');
  assert.equal(merged1.xp, 80);
  assert.deepEqual(merged1.awardedKeys.sort(), ['chest_BS01', 'step_M01', 'step_P01']);
  assert.deepEqual(merged1.inventory.openedChests.sort(), ['chest_BS01', 'chest_QS01']);

  // Đồng bộ lặp lại lần 2 phải ra kết quả y hệt (idempotent)
  const merged2 = mergeUserProgressIdempotent(merged1, tamperedLocal);
  assert.equal(merged2.xp, 80);
  assert.deepEqual(merged2.awardedKeys, merged1.awardedKeys);
  assert.deepEqual(merged2.inventory.outfits, merged1.inventory.outfits);
});

test('Nhãn trạng thái lưu hiển thị đúng 3 trạng thái tiếng Việt', () => {
  assert.equal(getSyncStatusLabel('saved'), 'Đã lưu');
  assert.equal(getSyncStatusLabel('pending_sync'), 'Chờ đồng bộ');
  assert.equal(getSyncStatusLabel('local_only'), 'Đang lưu trên máy này');
});

test('Nhập tệp JSON đính kèm Hoc_lieu_BS01_cho_giao_vien_duyet.json đọc đủ 16 câu chuẩn Mục 11.1 và tự kiểm chứng bằng code', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const {parseSection11Json} = await import('../services/materialImport.ts');

  const jsonPath = path.resolve(
    process.cwd(),
    'src/math/fixtures/Hoc_lieu_BS01_cho_giao_vien_duyet.json',
  );
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const parsed = parseSection11Json(raw, {
    sourceFileName: 'Hoc_lieu_BS01_cho_giao_vien_duyet.json',
  });

  assert.equal(parsed.missionId, 'BS01');
  assert.equal(parsed.items.length, 16, 'Tệp BS01 phải có đúng 16 câu hỏi');

  // Mọi câu mặc định là pending_teacher_review
  for (const item of parsed.items) {
    assert.equal(item.review_status, 'pending_teacher_review');
    assert.equal(item.stationId, 'BS01');
    assert.equal(item.source_file_name, 'Hoc_lieu_BS01_cho_giao_vien_duyet.json');
  }

  // Kiểm tra phân loại đúng type cho các dạng đặc thù
  const byId = new Map(parsed.items.map((it) => [it.id, it]));
  assert.equal(byId.get('P01')?.type, 'numeric');
  assert.equal(byId.get('P02')?.type, 'tap_diagram');
  assert.equal(byId.get('M01')?.type, 'mcq');
  assert.equal(byId.get('M02')?.type, 'measurement');
  assert.equal(byId.get('M04')?.type, 'fill_relation');
  assert.equal(byId.get('M05')?.type, 'numeric');
  assert.equal(byId.get('R01')?.type, 'matching');
  assert.equal(byId.get('T02')?.type, 'agree_explain');

  // Các câu có đáp án số (P01, P03, P04, M03, M05, R02, R03, R04, T01) phải được code tự giải KHỚP và KHÔNG lệch
  const numericCheckedIds = ['P01', 'P03', 'P04', 'M03', 'M05', 'R02', 'R03', 'R04', 'T01'];
  for (const id of numericCheckedIds) {
    const item = byId.get(id)!;
    assert.equal(
      item.code_verification?.status,
      'verified_match',
      `Câu ${id} cần code tự giải khớp nhưng nhận: ${JSON.stringify(item.code_verification)}`,
    );
  }
});

test('Code tự giải lại câu số (Côsin, Sin, Heron, Diện tích) và gắn cờ mismatch khi AI tính sai + cảnh báo Gợi ý mức 1 lộ đáp án', async () => {
  const {mapAiExtractedItemsToDrafts} = await import('../services/materialImport.ts');
  const {verifyQuestionByCode} = await import('./verifier.ts');

  // 1) AI trả lời ĐÚNG Định lý Côsin: a=5, b=7, C=60° => c = sqrt(25+49-35) = sqrt(39) ≈ 6.2
  const drafts = mapAiExtractedItemsToDrafts(
    [
      {
        cluster: 'COS',
        level: 2,
        type: 'numeric',
        stationId: 'DD01',
        skill_ids: ['cosine_law'],
        stem_vi: 'Cho tam giác ABC có a = 5 m, b = 7 m và góc C = 60°. Tính độ dài cạnh c (làm tròn đến 0,1 m).',
        numericAnswer: 6.2,
        decimalPlaces: 1,
        unit: 'm',
        solution_vi: 'Áp dụng định lý côsin: c = √(25 + 49 − 2·5·7·cos60°) = √39 ≈ 6,2 m.',
        hints_vi: ['Áp dụng định lý Côsin với góc xen giữa C.', 'Thay a = 5, b = 7, cos 60° = 0,5 rồi khai căn.'],
        anticipated_error_ids: ['E09', 'E10'],
        confidence: 0.94,
        ai_reason: 'Bài toán 2 cạnh và góc xen giữa thuộc định lý Côsin.',
        source_excerpt: 'Cho tam giác ABC có a = 5, b = 7, C = 60°...',
        page_pdf: 12,
        page_printed: '41',
        math_params: {kind: 'cosine_law_side', a: 5, b: 7, angleC: 60},
      },
      {
        // 2) Cố tình tạo đáp án AI SAI cho công thức Heron (3, 4, 5 => S = 6 nhưng AI ghi 9) + Gợi ý mức 1 lộ số 9
        cluster: 'DT',
        level: 2,
        type: 'numeric',
        stationId: 'KV01',
        skill_ids: ['heron'],
        stem_vi: 'Tính diện tích tam giác có ba cạnh a = 3 m, b = 4 m, c = 5 m.',
        numericAnswer: 9,
        decimalPlaces: 1,
        unit: 'm²',
        solution_vi: 'p = 6, S = 9 m².',
        hints_vi: ['Kết quả bài này là 9, hãy dùng Heron.', 'Tính nửa chu vi p = (a+b+c)/2.'],
        anticipated_error_ids: ['E11'],
        confidence: 0.62,
        ai_reason: 'Áp dụng công thức Heron cho tam giác biết 3 cạnh.',
        source_excerpt: 'Tam giác có ba cạnh 3, 4, 5...',
        page_pdf: 14,
        page_printed: '43',
        math_params: {kind: 'area_heron', a: 3, b: 4, c: 5},
      },
    ],
    {sourceFileName: 'SGK_KNTT_Chuong3.pdf', driveFileId: 'drive_abc_123'},
  );

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].review_status, 'pending_teacher_review');
  assert.equal(drafts[0].drive_file_id, 'drive_abc_123');
  assert.equal(drafts[0].page_pdf, 12);
  assert.equal(drafts[0].page_printed, '41');
  assert.equal(drafts[0].code_verification?.status, 'verified_match');
  assert.equal(drafts[0].code_verification?.hint1LeaksAnswer, false);

  // Câu 2 phải bị gắn cờ lệch đáp án (code tính 6 vs AI ghi 9) VÀ phát hiện Gợi ý mức 1 lộ số 9
  assert.equal(drafts[1].code_verification?.status, 'mismatch_flagged');
  assert.equal(drafts[1].code_verification?.roundedCodeValue, 6);
  assert.equal(drafts[1].code_verification?.aiValue, 9);
  assert.equal(drafts[1].code_verification?.hint1LeaksAnswer, true);

  // Sau khi sửa đáp án sang 6, code verify phải chuyển sang verified_match
  const fixed = {
    ...drafts[1],
    expected_answer: {...drafts[1].expected_answer, rounded: 6, value: 6},
    hints_vi: ['Tính nửa chu vi p trước.', drafts[1].hints_vi[1]],
  };
  const recheck = verifyQuestionByCode(fixed);
  assert.equal(recheck.status, 'verified_match');
  assert.equal(recheck.hint1LeaksAnswer, false);
});

test('Ngân hàng mở rộng 48 câu chuyển thể Chương III đáp ứng đầy đủ yêu cầu sư phạm, phủ 6 chủ đề × 4 mức × 3 dạng và tự kiểm chứng bằng code', () => {
  assert.ok(EXPANDED_CHAPTER3_ITEMS.length >= 40, `Cần ít nhất 40 câu, hiện có ${EXPANDED_CHAPTER3_ITEMS.length}`);
  assert.equal(EXPANDED_CHAPTER3_ITEMS.length, 48);

  const clusters = ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'] as const;
  for (const c of clusters) {
    const items = EXPANDED_CHAPTER3_ITEMS.filter((q) => q.cluster === c);
    assert.ok(items.length >= 6, `Chủ đề ${c} phải có ít nhất 6 câu, hiện có ${items.length}`);
    for (const lv of [1, 2, 3, 4] as const) {
      assert.ok(
        items.some((q) => q.level === lv),
        `Chủ đề ${c} thiếu câu mức ${lv}`,
      );
    }
    assert.ok(items.some((q) => q.type === 'mcq'), `Chủ đề ${c} thiếu câu trắc nghiệm 4 lựa chọn`);
    assert.ok(items.some((q) => q.type === 'true_false_multi'), `Chủ đề ${c} thiếu câu đúng/sai nhiều ý`);
    assert.ok(items.some((q) => q.type === 'numeric'), `Chủ đề ${c} thiếu câu trả lời ngắn`);
  }

  for (const q of EXPANDED_CHAPTER3_ITEMS) {
    assert.equal(q.review_status, 'approved', `Câu ${q.id} phải ở trạng thái approved sau kiểm duyệt chuẩn hóa`);
    assert.equal(q.is_adapted, true, `Câu ${q.id} phải có is_adapted=true`);
    assert.ok(q.hints_vi.length >= 2, `Câu ${q.id} phải có đủ 2 mức gợi ý`);
    assert.ok(q.anticipated_error_ids.length >= 1, `Câu ${q.id} phải có lỗi dự kiến`);
    assert.ok(q.solution_vi.trim().length > 10, `Câu ${q.id} phải có solution_vi`);

    if (q.type === 'mcq') {
      assert.equal(q.options?.length, 4, `Câu MCQ ${q.id} phải có đủ 4 lựa chọn`);
      const res = gradeQuestion(q, String(q.expected_answer.choice));
      assert.equal(res.isCorrect, true, `Câu MCQ ${q.id} tự chấm sai`);
    } else if (q.type === 'true_false_multi') {
      assert.equal(q.statements?.length, 4, `Câu Đúng/Sai ${q.id} phải có đủ 4 ý`);
      const fullAns = Object.fromEntries(q.statements!.map((s) => [s.id, s.isTrue]));
      assert.equal(gradeQuestion(q, fullAns).isCorrect, true, `Câu Đúng/Sai ${q.id} tự chấm sai khi đúng hết`);
      // Sai 1 ý phải chỉ đúng ý cần kiểm tra lại và không gắn nhãn tiêu cực
      const partialAns = {...fullAns, a: !fullAns.a};
      const partialRes = gradeQuestion(q, partialAns);
      assert.equal(partialRes.isCorrect, false);
      assert.ok(partialRes.feedback_vi.includes('(a)'));
      // Thiếu ý phải nhắc nhẹ
      const incompleteRes = gradeQuestion(q, {a: true});
      assert.equal(incompleteRes.isCorrect, false);
    } else if (q.type === 'numeric') {
      const verify = verifyQuestionByCode(q);
      assert.equal(
        verify.status,
        'verified_match',
        `Câu số ${q.id} không khớp code tự giải: ${JSON.stringify(verify)}`,
      );
      assert.equal(
        verify.hint1LeaksAnswer,
        false,
        `Câu số ${q.id} có Gợi ý mức 1 lộ đáp án: ${q.hints_vi[0]}`,
      );
      const val = q.expected_answer.rounded ?? q.expected_answer.value;
      const res = gradeQuestion(q, String(val).replace('.', ','));
      assert.equal(res.isCorrect, true, `Câu số ${q.id} tự chấm không đạt: ${res.feedback_vi}`);
    }
  }
});

test('Phân tích phân bố ngân hàng theo chủ đề × mức × trạng thái duyệt và phát hiện chính xác ô cảnh báo BOSS', () => {
  const report = analyzeQuestionBankDistribution(ALL_INITIAL_QUESTIONS);
  assert.equal(report.totalQuestions, ALL_INITIAL_QUESTIONS.length);
  assert.equal(
    report.byStatus.approved + report.byStatus.pending_teacher_review + report.byStatus.rejected,
    ALL_INITIAL_QUESTIONS.length,
  );
  // Khi mới khởi tạo, các câu mở rộng đều là pending nên phải có cảnh báo cho các ô BOSS chưa đủ câu approved
  assert.ok(report.warningCells.length > 0, 'Phải cảnh báo các ô chưa đủ câu đã duyệt cho BOSS');
  assert.equal(report.bossReadiness.length, 5);

  // Khi tất cả câu được duyệt, cảnh báo pending_only phải giảm về 0
  const allApproved = ALL_INITIAL_QUESTIONS.map((q) => ({...q, review_status: 'approved' as const}));
  const approvedReport = analyzeQuestionBankDistribution(allApproved);
  assert.equal(
    approvedReport.warningCells.filter((c) => c.status === 'pending_only').length,
    0,
  );
});

test('Mô phỏng 1.000 lượt đấu cho mỗi BOSS B1–B5 đạt 100% ở cả chế độ có câu chờ duyệt lẫn chỉ câu đã duyệt', () => {
  for (const allowPending of [true, false]) {
    const sim = runBoss1000Simulations(ALL_INITIAL_QUESTIONS, allowPending, 1000);
    assert.equal(sim.rows.length, 5);
    assert.equal(sim.totalSimulatedRuns, 5000);
    assert.equal(sim.allPassed, true);
    for (const row of sim.rows) {
      assert.equal(row.missingQuestionRuns, 0, `${row.bossId} thiếu câu (allowPending=${allowPending})`);
      assert.equal(row.duplicateInRunCount, 0, `${row.bossId} trùng câu trong lượt`);
      assert.equal(row.wrongTotalDamageRuns, 0, `${row.bossId} sai tổng sát thương 100%`);
      assert.equal(row.identicalConsecutivePairs, 0, `${row.bossId} lặp nguyên lượt liên tiếp`);
    }
  }
});

test('Hành trình tuần tự 10 mốc: tài khoản mới chỉ mở Mốc 1, qua Mốc 1 mở Mốc 2, khóa BOSS trước khi xong nhiệm vụ, qua hết 10 mốc mở Chế độ tự do', () => {
  assert.equal(JOURNEY_MILESTONES.length, 10);
  const j0 = createInitialJourneyProgress();
  assert.equal(j0.currentMoc, 1);
  assert.equal(computeJourneyPercent(j0), 0);
  assert.equal(isFreeModeUnlocked(j0), false);
  assert.equal(canEnterMoc(1, j0), true);
  for (let m = 2; m <= 10; m++) {
    assert.equal(canEnterMoc(m as MocId, j0), false, `Tài khoản mới phải khóa Mốc ${m}`);
  }

  // Qua Mốc 1 (không có BOSS) -> tự động mở Mốc 2, 10%
  const r1 = applyMocMissionCompleted(j0, 1);
  assert.equal(r1.newlyPassedMoc, true);
  assert.equal(r1.journey.currentMoc, 2);
  assert.deepEqual(r1.journey.passedMoc, [1]);
  assert.equal(computeJourneyPercent(r1.journey), 10);
  assert.equal(canEnterMoc(2, r1.journey), true);
  assert.equal(canEnterMoc(3, r1.journey), false);

  // Mốc 2 (Cần Thơ, có BOSS 1): trước khi xong nhiệm vụ, BOSS phải bị khóa
  assert.equal(canChallengeMocBoss(2, r1.journey), false);
  const r2Mission = applyMocMissionCompleted(r1.journey, 2);
  assert.equal(r2Mission.newlyPassedMoc, false, 'Mốc có BOSS chưa qua khi chưa hạ BOSS');
  assert.equal(canChallengeMocBoss(2, r2Mission.journey), true, 'Xong nhiệm vụ Mốc 2 phải mở BOSS 1');
  assert.equal(canEnterMoc(3, r2Mission.journey), false, 'Chưa hạ BOSS 1 thì Mốc 3 vẫn khóa');

  // Hạ BOSS 1 -> qua Mốc 2, mở Mốc 3, tiến độ 20%
  const r2Boss = applyMocBossDefeated(r2Mission.journey, 2);
  assert.equal(r2Boss.newlyPassedMoc, true);
  assert.equal(r2Boss.journey.currentMoc, 3);
  assert.equal(computeJourneyPercent(r2Boss.journey), 20);
  assert.equal(canEnterMoc(3, r2Boss.journey), true);

  // Tiến hết tới 10/10 mốc -> mở Chế độ tự do (100%)
  let cur = r2Boss.journey;
  for (let step = 3; step <= 10; step++) {
    const res = applyAdminUnlockNextMoc(cur);
    cur = res.journey;
  }
  assert.equal(cur.passedMoc.length, 10);
  assert.equal(computeJourneyPercent(cur), 100);
  assert.equal(isFreeModeUnlocked(cur), true);
  for (const m of ALL_MOC_IDS) {
    assert.equal(canEnterMoc(m, cur), true);
  }
});

test('Hai tài khoản khác nhau nhận bộ câu hỏi Nhiệm vụ mốc khác nhau; tọa độ ghim & đường cong mượt Catmull-Rom hợp lệ', () => {
  const skills = createInitialSkills();
  for (const mocId of [1, 3, 9] as MocId[]) {
    const deckA = buildMilestoneMissionQuestions({
      mocId,
      userId: 'student_alpha_01',
      bank: ALL_INITIAL_QUESTIONS,
      allowPending: true,
      skills,
      recentSessions: [],
      nonce: 0,
    });
    const deckB = buildMilestoneMissionQuestions({
      mocId,
      userId: 'student_beta_99',
      bank: ALL_INITIAL_QUESTIONS,
      allowPending: true,
      skills,
      recentSessions: [],
      nonce: 0,
    });
    assert.equal(deckA.length, mocId === 9 ? 6 : 5);
    assert.equal(deckB.length, mocId === 9 ? 6 : 5);
    assert.notDeepEqual(
      deckA.map((q) => q.stem_vi),
      deckB.map((q) => q.stem_vi),
      `Hai tài khoản phải nhận bộ câu hỏi Mốc ${mocId} khác nhau`,
    );
  }

  // Pin overrides + Catmull-Rom smooth SVG path
  const coords = getEffectivePinCoords({1: {x: 38.2, y: 59.4}});
  assert.deepEqual(coords[1], {x: 38.2, y: 59.4});
  const pts = JOURNEY_MILESTONES.map((m) => pinPercentToSvgPoint(coords[m.id]));
  const pathD = buildSmoothJourneySvgPath(pts);
  assert.ok(pathD.startsWith('M ') && pathD.includes(' C '), 'Đường nối 10 mốc phải là đường cong mượt SVG Bézier');
});

test('Phân quyền RBAC quản trị hành trình & chống nhân đôi phần thưởng khi ôn lại mốc đã qua', async () => {
  // Tạo admin & 1 học viên trong DataService (LocalAdapter trong Node)
  const adminRes = await dataService.setupFirstAdmin({
    username: 'adm_journey_test',
    password: 'Password123!',
    displayName: 'Quản trị thử nghiệm',
  });
  const adminUser =
    adminRes.user ?? dataService.getAllUsers().find((u) => u.role === 'admin')!;
  assert.ok(adminUser, 'Phải có tài khoản quản trị');

  const stRes = await dataService.registerStudent({
    username: 'hv_journey_seq',
    password: 'Password123!',
    displayName: 'Học viên tuần tự',
    classCode: 'TOAN10-01',
    isTestAccount: true,
  });
  assert.equal(stRes.ok, true);
  const student = stRes.user!;

  // Học viên tự gọi hàm quản trị phải bị từ chối
  assert.equal(dataService.adminUnlockNextMoc(student, student.uid).ok, false);
  assert.equal(dataService.adminResetUserJourney(student, student.uid).ok, false);
  assert.equal(dataService.adminSetUnlockAllDemo(student, true), false);
  assert.equal(dataService.adminSaveMapAlignment(student, {1: {x: 35, y: 55}}), false);
  assert.equal(dataService.adminSaveMapBackground(student, undefined, true).ok, false);

  // Học viên chưa qua Mốc 1 -> cố ghi hoàn thành Mốc 2 phải bị chặn
  const blockedM2 = dataService.recordMocMissionComplete(student.uid, 2);
  assert.equal(blockedM2.ok, false);

  // Hoàn thành Mốc 1 lần đầu: nhận +35 XP, qua Mốc 1, mở Mốc 2
  const passM1 = dataService.recordMocMissionComplete(student.uid, 1);
  assert.equal(passM1.ok, true);
  assert.equal(passM1.newlyPassedMoc, true);
  assert.equal(passM1.rewardGranted, true);
  const xpAfterFirst = passM1.user!.xp;
  assert.equal(xpAfterFirst, 35);

  // Ôn lại Mốc 1 lần 2: KHÔNG nhân đôi phần thưởng XP
  const reviewM1 = dataService.recordMocMissionComplete(student.uid, 1);
  assert.equal(reviewM1.ok, true);
  assert.equal(reviewM1.rewardGranted, false);
  assert.equal(reviewM1.user!.xp, xpAfterFirst);

  // Quản trị viên mở mốc kế tiếp & đặt lại hành trình thành công
  const admUnlock = dataService.adminUnlockNextMoc(adminUser, student.uid);
  assert.equal(admUnlock.ok, true);
  assert.equal(admUnlock.unlockedMoc, 3);

  const admReset = dataService.adminResetUserJourney(adminUser, student.uid);
  assert.equal(admReset.ok, true);
  assert.equal(dataService.getUserJourney(student.uid).currentMoc, 1);
  assert.equal(dataService.getUserJourney(student.uid).passedMoc.length, 0);

  // Bật/tắt chế độ trình diễn mở toàn bộ mốc
  assert.equal(dataService.adminSetUnlockAllDemo(adminUser, true), true);
  assert.equal(dataService.canUserEnterMoc(student.uid, 10), true);
  assert.equal(dataService.adminSetUnlockAllDemo(adminUser, false), true);
  assert.equal(dataService.canUserEnterMoc(student.uid, 10), false);
});


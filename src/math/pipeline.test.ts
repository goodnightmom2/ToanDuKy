import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAnswerKeysToDrafts,
  extractWindowViaAi,
  parseAnswerKeyTableText,
  validateRawExtractionResponse,
} from '../services/aiExtractor.ts';
import {DataService} from '../services/dataService.ts';
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
import {autoSuggestMissionSet, validateMissionSet} from './missionSetEngine.ts';
import {ALL_INITIAL_QUESTIONS} from './seedBank.ts';
import {solveByPatternAndGivens, verifyQuestionWithSolvers} from './solvers.ts';
import {computeQuestionFingerprint, PROMPT_VERSION} from './taxonomy.ts';

class MemoryStore {
  private data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

function createMinimalPdfBytes(numPages: number): Uint8Array {
  const parts: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [0];
  let curLen = parts[0].length;
  const pushObj = (num: number, body: string) => {
    offsets[num] = curLen;
    const chunk = `${num} 0 obj\n${body}\nendobj\n`;
    parts.push(chunk);
    curLen += chunk.length;
  };
  const kids = Array.from({length: numPages}, (_, i) => `${3 + i} 0 R`);
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
  parts.push(
    xref,
    `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return new TextEncoder().encode(parts.join(''));
}

test('1. Đọc lặp lại PDF 3 lần và đổi khoảng 1–6 → 1–16 không lỗi detached ArrayBuffer', async () => {
  const bytes = createMinimalPdfBytes(16);
  const r1 = await readPdfDocumentRange(bytes, {startPage: 1, endPage: 6, renderImages: false});
  const r2 = await readPdfDocumentRange(bytes, {startPage: 1, endPage: 6, renderImages: false});
  const r3 = await readPdfDocumentRange(bytes, {startPage: 1, endPage: 16, renderImages: false});
  assert.equal(r1.totalPages, 16);
  assert.equal(r1.readCount, 6);
  assert.equal(r2.readCount, 6);
  assert.equal(r3.readCount, 16);
  assert.equal(r3.errorCount, 0);
  const summary = formatPdfStatusSummary({
    totalPages: r3.totalPages,
    startPage: r3.startPage,
    endPage: r3.endPage,
    readCount: r3.readCount,
    imageUsedCount: r3.imageUsedCount,
    errorCount: r3.errorCount,
  });
  assert.ok(summary.includes('PDF 16 trang · Khoảng đọc 1–16 · Đã đọc 16/16 trang'));
});

test('2. Phát hiện văn bản PDF hỏng toán / PUA / hình vẽ để ép gửi ảnh', () => {
  const bad = analyzePageMathTextHealth('Cho tam giac ABC \uE012 \uF010 nhu hinh ve ben duoi');
  assert.equal(bad.isGarbled, true);
  assert.equal(bad.hasFigureCue, true);
  assert.notEqual(bad.sendMode, 'text_only');

  const plain = analyzePageMathTextHealth(
    'Câu 1: Trong chương trình toán trung học phổ thông, phát biểu nào sau đây mô tả đúng mục tiêu học tập? Chọn một phương án thích hợp nhất trong bốn câu trả lời dưới đây.',
  );
  assert.equal(plain.isGarbled, false);
  assert.equal(plain.sendMode, 'text_only');
});

test('3. Schema validator JSON trích xuất AI chấp nhận đúng và từ chối lỗi', () => {
  const valid = validateRawExtractionResponse({
    items: [
      {
        number: '1',
        type: 'mcq',
        stem_latex: 'Cho $b=6, c=8, \\widehat{A}=60^\\circ$. Tính $a$.',
        options: [{key: 'A', text: '$2\\sqrt{13}$'}, {key: 'B', text: '$10$'}],
        expected_answer_key: 'A',
        pattern_id: 'COS-01',
        level: 2,
        confidence: 0.9,
      },
    ],
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.items.length, 1);

  const invalid = validateRawExtractionResponse({wrongKey: [{type: 'mcq'}]});
  assert.equal(invalid.valid, false);
});

test('4. Ghép bảng đáp án ngang (Câu 17..22 | A B C D A B) vào câu hỏi', () => {
  const keys = parseAnswerKeyTableText('PHẦN I\nCâu 17 18 19 20 21 22\nA B C D A B');
  assert.ok(keys.length >= 6);
  const draft: QuestionItem = {
    id: 'q19',
    cluster: 'SIN',
    skill_ids: ['sin'],
    level: 2,
    type: 'mcq',
    part: 'I',
    question_number: '19',
    stem_vi: 'Câu 19',
    options: [
      {id: 'a', label: 'A'},
      {id: 'b', label: 'B'},
      {id: 'c', label: 'C'},
      {id: 'd', label: 'D'},
    ],
    expected_answer: {},
    solution_vi: '',
    anticipated_error_ids: ['E05'],
    hints_vi: ['G1', 'G2'],
    review_status: 'pending_teacher_review',
    source_refs: ['de.pdf'],
    is_adapted: false,
  };
  const merged = applyAnswerKeysToDrafts([draft], keys);
  assert.equal(merged.matchedCount, 1);
  assert.equal(merged.items[0].expected_answer.choice, 'c');
});

test('5. Bộ giải toán kiểm chứng: Côsin, Sin/R, Diện tích (sin/Heron/pr/abc/4R), chiều cao 2 góc', () => {
  assert.ok(Math.abs((solveByPatternAndGivens('COS-01', {b: 6, c: 8, A_deg: 60})?.value ?? 0) - Math.sqrt(52)) < 1e-4);
  assert.ok(Math.abs((solveByPatternAndGivens('COS-02', {a: 7, b: 8, c: 5})?.value ?? 0) - 60) < 1e-4);
  assert.ok(Math.abs((solveByPatternAndGivens('SIN-02', {a: 10, A_deg: 30})?.value ?? 0) - 10) < 1e-4);
  assert.ok(Math.abs((solveByPatternAndGivens('DT-01', {b: 6, c: 8, A_deg: 30})?.value ?? 0) - 12) < 1e-4);
  assert.ok(Math.abs((solveByPatternAndGivens('DT-02', {a: 5, b: 6, c: 7})?.value ?? 0) - 6 * Math.sqrt(6)) < 1e-4);
  assert.ok(Math.abs((solveByPatternAndGivens('DT-03', {p: 12, r: 2})?.value ?? 0) - 24) < 1e-4);
  assert.ok(Math.abs((solveByPatternAndGivens('DT-04', {a: 6, b: 8, c: 10, R: 5})?.value ?? 0) - 24) < 1e-4);
  assert.ok(Math.abs((solveByPatternAndGivens('MH-02', {d: 50, alpha_deg: 30, beta_deg: 60})?.value ?? 0) - 25 * Math.sqrt(3)) < 1e-4);

  const check = verifyQuestionWithSolvers({
    ...ALL_INITIAL_QUESTIONS[0],
    type: 'numeric',
    pattern_id: 'COS-02',
    givens: {a: 7, b: 8, c: 5},
    expected_answer: {value: 60, rounded: 60, decimal_places: 1, unit: '°'},
  });
  assert.equal(check.status, 'pass');
});

test('6. Upsert idempotent theo fingerprint — nhập lại không tạo trùng', async () => {
  const svc = new DataService(new MemoryStore());
  await svc.setupFirstAdmin({username: 'adm_idemp', password: 'Password123', displayName: 'Admin'});
  const admin = svc.getCurrentUser()!;
  const q: QuestionItem = {
    ...ALL_INITIAL_QUESTIONS[0],
    id: 'imp_01',
    stem_vi: 'Tính cạnh $a$ của tam giác $ABC$ có $b=9, c=11, \\widehat{A}=60^\\circ$.',
    fingerprint: computeQuestionFingerprint('Tính cạnh $a$ của tam giác $ABC$ có $b=9, c=11, \\widehat{A}=60^\\circ$.'),
  };
  const r1 = svc.upsertImportedQuestions(admin, [q], {targetStatus: 'approved', duplicatePolicy: 'skip'});
  const r2 = svc.upsertImportedQuestions(admin, [{...q, id: 'imp_02'}], {targetStatus: 'approved', duplicatePolicy: 'skip'});
  assert.equal(r1.added, 1);
  assert.equal(r2.added, 0);
  assert.equal(r2.skippedDuplicates, 1);
});

test('7. Kiểm tra ràng buộc Set nhiệm vụ & Auto-Suggest không có lỗi chặn', () => {
  const approved = ALL_INITIAL_QUESTIONS.filter((q) => q.review_status === 'approved');
  const q1 = approved[0];
  const unapproved: QuestionItem = {...q1, id: 'pending_q_1', review_status: 'pending_teacher_review'};
  const badSet: MissionSetRecord = {
    id: 'ms_bad',
    mocId: 2,
    stationId: 'QS01',
    classId: 'ALL',
    status: 'draft',
    version: 1,
    slots: [
      {id: 's1', role: 'main', label: 'M4', mode: 'fixed', count: 2, levelMin: 4, levelMax: 4, requiredToPass: true, verifyMode: false, fixedQuestionIds: [q1.id]},
      {id: 's2', role: 'transfer', label: 'M1', mode: 'fixed', count: 2, levelMin: 1, levelMax: 1, requiredToPass: true, verifyMode: true, fixedQuestionIds: [q1.id, unapproved.id]},
    ],
    bossSlots: [{id: 'b1', role: 'boss_hit', label: 'B1', mode: 'fixed', count: 1, levelMin: 2, levelMax: 2, requiredToPass: true, verifyMode: true, fixedQuestionIds: [q1.id]}],
    createdBy: 'Admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const res = validateMissionSet(badSet, [...approved, unapproved]);
  const joined = res.errors.join(' | ');
  assert.equal(res.valid, false);
  assert.ok(joined.includes('mới chọn 1'));
  assert.ok(joined.includes('giảm so với ô trước'));
  assert.ok(joined.includes('bị trùng giữa Nhiệm vụ mốc và BOSS'));
  assert.ok(joined.includes('dùng lại câu'));
  assert.ok(joined.includes('chưa được Admin duyệt'));

  const auto = autoSuggestMissionSet({
    mocId: 2,
    bank: approved,
    classId: 'ALL',
    actorName: 'Admin',
    actorUid: 'adm_test',
  });
  assert.equal(validateMissionSet(auto, approved).valid, true);
});

test('8. Phân quyền: giáo viên không tự duyệt/xuất bản; học viên không thấy import_batches', async () => {
  const svc = new DataService(new MemoryStore());
  await svc.setupFirstAdmin({username: 'adm_perm', password: 'Password123', displayName: 'Admin'});
  const admin = svc.getCurrentUser()!;
  const teacher = (await svc.adminCreateTeacher(admin, {username: 'gv_perm', password: 'Password123', displayName: 'GV'})).user!;
  const cls = svc.getClasses()[0];
  const student = (await svc.registerStudent({username: 'hv_perm', password: 'Password123', displayName: 'HV', classCode: cls.code})).user!;

  const up = svc.upsertImportedQuestions(teacher, [{...ALL_INITIAL_QUESTIONS[0], id: 'gv_q_perm', stem_vi: 'Câu GV thử duyệt'}], {targetStatus: 'approved'});
  const saved = svc.getQuestions().find((q) => q.id === up.savedIds[0]);
  assert.equal(saved?.review_status, 'pending_teacher_review');
  assert.equal(svc.setQuestionReviewStatus(teacher, [saved!.id], 'approved'), false);

  const msDraft = svc.saveMissionSetDraft(teacher, {
    id: 'ms_moc_1_ALL',
    mocId: 1,
    stationId: 'QS01',
    classId: 'ALL',
    version: 1,
    slots: [],
    bossSlots: [],
    status: 'published',
  });
  assert.equal(msDraft.record?.status, 'pending_admin_review');
  assert.equal(svc.adminPublishMissionSet(teacher, msDraft.record!.id).ok, false);
  assert.equal(svc.getImportBatches(student).length, 0);
});

test('9. Cache trích xuất AI theo (sha256, pageRange, promptVersion, model) trả về từ cache với 0 lượt gọi mạng', async () => {
  clearExtractionCache();
  const sha = 'sha_pipeline_test_9';
  saveCachedExtractionResult({
    sha256: sha,
    pageRange: 'q:1',
    promptVersion: PROMPT_VERSION,
    model: 'gemini-3.1-flash-lite',
    items: [ALL_INITIAL_QUESTIONS[0]],
    answerKeys: [],
  });
  const res = await extractWindowViaAi({
    pages: [{pagePdf: 1, text: 'Test', state: {pagePdf: 1, status: 'read', sendMode: 'text_only', textLength: 4}, cachedImage: null}],
    fileName: 'test.pdf',
    fileSha256: sha,
    accessToken: null,
    maxDaily: 50,
    aiEnabled: false,
    classificationMode: 'web_taxonomy',
    taxonomy: [],
    model: 'gemini-3.1-flash-lite',
  });
  clearExtractionCache();
  assert.equal(res.fromCache, true);
  assert.equal(res.items.length, 1);
});

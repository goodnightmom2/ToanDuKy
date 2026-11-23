/**
 * Non-destructive dry-run / `--fix` math audit CLI (`npm run audit:math`).
 * Scans ALL built-in bank questions (`ALL_INITIAL_QUESTIONS`) for:
 * - unbalanced `$`, KaTeX syntax errors, leftover Unicode math, unbraced decimal commas,
 *   formula inside `\text{...}`, dangerous commands, and stray backslashes.
 * Never touches user or attempt records.
 */
import {normalizeQuestionMathSafely, runMathBankAudit} from '../src/math/mathEngine.ts';
import {ALL_INITIAL_QUESTIONS} from '../src/math/seedBank.ts';

const fixMode = process.argv.includes('--fix');
const summary = runMathBankAudit(ALL_INITIAL_QUESTIONS);

console.log('=== TOÁN DU KÝ — BÁO CÁO RÀ SOÁT CÔNG THỨC (audit:math) ===');
console.log(`Tổng số câu hỏi đã quét: ${summary.totalQuestions}`);
console.log(`Đạt chuẩn hoàn toàn:     ${summary.cleanCount}`);
console.log(`Cần lưu ý / có lỗi:      ${summary.withIssuesCount}`);
console.log('Phân loại lỗi:', JSON.stringify(summary.byCode, null, 2));

for (const rep of summary.reports.filter((r) => r.issueCount > 0)) {
  console.log(`\n[${rep.questionId}] (${rep.review_status}):`);
  for (const iss of rep.issues) {
    console.log(`  - ${iss.field} [${iss.code}]: ${iss.detail}`);
  }
  if (fixMode) {
    const q = ALL_INITIAL_QUESTIONS.find((item) => item.id === rep.questionId);
    if (q) {
      const fixed = normalizeQuestionMathSafely(q);
      console.log(
        `  => --fix dry preview: changed=${fixed.changed}, hasErrors=${fixed.hasErrors}, flags=[${fixed.flags.join(', ')}]`,
      );
    }
  }
}

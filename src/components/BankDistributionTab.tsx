import React from 'react';
import {AlertTriangle, CheckCircle2, Clock3, ShieldAlert} from 'lucide-react';
import {SKILL_CLUSTER_LIST, SKILL_CLUSTERS} from '../config.ts';
import {
  analyzeQuestionBankDistribution,
  QUESTION_LEVELS,
  type BankCellSummary,
} from '../math/bankAnalysis.ts';
import type {QuestionItem, SkillCluster} from '../types.ts';

interface BankDistributionTabProps {
  questions: QuestionItem[];
  onInspectCluster: (cluster: SkillCluster) => void;
}

const TYPE_LABELS: Record<string, string> = {
  mcq: 'Trắc nghiệm 4 lựa chọn',
  true_false_multi: 'Đúng/sai nhiều ý',
  numeric: 'Trả lời ngắn (số)',
  matching: 'Ghép cặp',
  fill_relation: 'Điền hệ thức Sin',
  tap_diagram: 'Chạm đỉnh trên hình',
  measurement: 'Đo đạc khảo sát',
  agree_explain: 'Đồng ý / giải thích',
  error_spot: 'Tìm lỗi sai',
};

export const BankDistributionTab: React.FC<BankDistributionTabProps> = ({
  questions,
  onInspectCluster,
}) => {
  const report = React.useMemo(() => analyzeQuestionBankDistribution(questions), [questions]);
  const [onlyWarnings, setOnlyWarnings] = React.useState(false);

  const pendingOnlyWarnings = report.warningCells.filter((c) => c.status === 'pending_only');
  const shortageWarnings = report.warningCells.filter((c) => c.status === 'shortage');

  const renderCell = (cell: BankCellSummary) => {
    const isShortage = cell.status === 'shortage';
    const isPendingOnly = cell.status === 'pending_only';
    const isOk = cell.status === 'sufficient';

    const cellTone = isShortage
      ? 'bg-[#FCE8E6] border-[#C8392B]'
      : isPendingOnly
        ? 'bg-[#FFF5E2] border-[#D98A1F]'
        : isOk
          ? 'bg-[#E6F6F3] border-[#2E9C8A]'
          : 'bg-[#FFFBF0] border-[#E5D3A8]';

    if (onlyWarnings && !isShortage && !isPendingOnly) {
      return (
        <div className="p-2 rounded-xl border border-dashed border-[#E5D3A8] text-center text-[11px] text-[#5B6B82]">
          Đủ / không cảnh báo
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onInspectCluster(cell.cluster)}
        title={cell.warning_vi ?? `Xem các câu ${cell.cluster} mức ${cell.level}`}
        className={`w-full text-left p-2.5 rounded-xl border-2 transition-colors hover:brightness-[0.98] ${cellTone}`}
      >
        <div className="flex items-center justify-between gap-1 text-xs font-extrabold text-[#14284A]">
          <span className="tabular-nums">Tổng: {cell.total}</span>
          {cell.bossRequired > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 text-[#14284A] tabular-nums">
              BOSS ≥ {cell.bossRequired}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
          <span className="font-bold text-[#145B4F]">Duyệt: {cell.approved}</span>
          <span className="font-bold text-[#8A5608]">Chờ: {cell.pending}</span>
          {cell.rejected > 0 && (
            <span className="font-bold text-[#99261B]">Hủy: {cell.rejected}</span>
          )}
        </div>

        {cell.demandingBosses.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold leading-tight">
            {isShortage ? (
              <span className="text-[#99261B] flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                Thiếu cho {cell.demandingBosses.join(', ')}
              </span>
            ) : isPendingOnly ? (
              <span className="text-[#8A5608] flex items-center gap-1">
                <Clock3 className="w-3 h-3 shrink-0" />
                Cần duyệt ({cell.demandingBosses.join(', ')})
              </span>
            ) : (
              <span className="text-[#145B4F] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                Đủ cho {cell.demandingBosses.join(', ')}
              </span>
            )}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4" data-testid="bank-distribution-panel">
      {/* Top KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="notebook-card p-3.5">
          <p className="text-[11px] font-bold text-[#4B5B73]">Tổng số câu</p>
          <p className="font-display text-2xl font-extrabold text-[#14284A] tabular-nums mt-0.5">
            {report.totalQuestions}
          </p>
        </div>
        <div className="notebook-card p-3.5">
          <p className="text-[11px] font-bold text-[#145B4F]">Đã duyệt (Approved)</p>
          <p className="font-display text-2xl font-extrabold text-[#145B4F] tabular-nums mt-0.5">
            {report.byStatus.approved}
          </p>
        </div>
        <div className="notebook-card p-3.5">
          <p className="text-[11px] font-bold text-[#8A5608]">Chờ giáo viên duyệt</p>
          <p className="font-display text-2xl font-extrabold text-[#8A5608] tabular-nums mt-0.5">
            {report.byStatus.pending_teacher_review}
          </p>
        </div>
        <div className="notebook-card p-3.5">
          <p className="text-[11px] font-bold text-[#99261B]">Từ chối (Rejected)</p>
          <p className="font-display text-2xl font-extrabold text-[#99261B] tabular-nums mt-0.5">
            {report.byStatus.rejected}
          </p>
        </div>
        <div className="notebook-card p-3.5 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-bold text-[#99261B]">Ô cảnh báo BOSS</p>
          <p className="font-display text-2xl font-extrabold text-[#99261B] tabular-nums mt-0.5">
            {report.warningCells.length}
          </p>
        </div>
      </div>

      {/* Warning banner */}
      {report.warningCells.length > 0 ? (
        <div className="p-4 rounded-2xl bg-[#FFF5E2] border-2 border-[#D98A1F] space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-[#5C3A06] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-[#8A5608] shrink-0" />
              Có {report.warningCells.length} ô (chủ đề × mức) chưa đủ câu đã duyệt cho BOSS B1–B5
            </p>
            <label className="text-xs font-bold text-[#14284A] flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWarnings}
                onChange={(e) => setOnlyWarnings(e.target.checked)}
                className="accent-[#1D7A6A]"
              />
              Chỉ nổi bật ô cảnh báo
            </label>
          </div>
          <p className="text-xs text-[#5C3A06]">
            • <strong>{pendingOnlyWarnings.length} ô</strong> đã có đủ câu tổng nhưng còn ở trạng thái <em>Chờ giáo viên duyệt</em> (duyệt xong sẽ đủ).{' '}
            • <strong>{shortageWarnings.length} ô</strong> còn thiếu số lượng câu trong ngân hàng tĩnh (khi đấu BOSS, hệ thống tự bổ sung bằng máy sinh tham số để không bao giờ thiếu câu).
          </p>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-[#E6F6F3] border-2 border-[#2E9C8A] text-sm font-bold text-[#145B4F] flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          Tất cả các ô (chủ đề × mức) phục vụ BOSS B1–B5 đều đã có đủ câu hỏi ĐÃ DUYỆT!
        </div>
      )}

      {/* Matrix: Cluster × Level × Review Status */}
      <div className="notebook-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#14284A]">
              Ma trận phân bố: Chủ đề × Mức độ × Trạng thái duyệt
            </h2>
            <p className="text-xs text-[#4B5B73]">
              Chạm vào một ô để mở nhanh danh sách câu hỏi thuộc chủ đề đó trong tab Ngân hàng.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="px-2 py-0.5 rounded bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F]">
              Đủ đã duyệt
            </span>
            <span className="px-2 py-0.5 rounded bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5608]">
              Cần duyệt thêm
            </span>
            <span className="px-2 py-0.5 rounded bg-[#FCE8E6] border border-[#C8392B] text-[#99261B]">
              Thiếu câu ngân hàng
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b-2 border-[#D5B87E] text-xs text-[#4B5B73]">
                <th className="py-2 pr-3 w-[170px]">Chủ đề Chương III</th>
                {QUESTION_LEVELS.map((lv) => (
                  <th key={lv} className="py-2 px-1.5 text-center">
                    Mức {lv}
                    <div className="text-[10px] font-semibold text-[#5B6B82] tabular-nums">
                      (D:{report.byLevel[lv].approved} · C:{report.byLevel[lv].pending})
                    </div>
                  </th>
                ))}
                <th className="py-2 pl-2 text-right w-[120px]">Tổng chủ đề</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5D3A8]">
              {SKILL_CLUSTER_LIST.map((cluster) => {
                const info = SKILL_CLUSTERS[cluster];
                const rowSum = report.byCluster[cluster];
                return (
                  <tr key={cluster}>
                    <td className="py-2.5 pr-3 align-top">
                      <p className="font-extrabold text-sm text-[#14284A]">
                        {cluster} · {info.shortTitle}
                      </p>
                      <p className="text-[11px] text-[#4B5B73] leading-snug">{info.title}</p>
                    </td>
                    {QUESTION_LEVELS.map((lv) => (
                      <td key={lv} className="py-2 px-1.5 align-top">
                        {renderCell(report.matrix[cluster][lv])}
                      </td>
                    ))}
                    <td className="py-2.5 pl-2 align-top text-right tabular-nums">
                      <p className="font-display text-lg font-extrabold text-[#14284A]">
                        {rowSum.total}
                      </p>
                      <p className="text-[11px] font-bold text-[#145B4F]">
                        Duyệt: {rowSum.approved}
                      </p>
                      <p className="text-[11px] font-bold text-[#8A5608]">
                        Chờ: {rowSum.pending}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Distribution by Question Type */}
      <div className="notebook-card p-4 space-y-2.5">
        <h3 className="font-display text-base font-extrabold text-[#14284A]">
          Phân bố theo định dạng câu hỏi
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(report.byType)
            .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
            .map(([type, count]) => (
              <div
                key={type}
                className="px-3 py-1.5 rounded-xl bg-[#FFFBF0] border border-[#D9C293] text-xs font-bold text-[#14284A] tabular-nums"
              >
                {TYPE_LABELS[type] ?? type}: <span className="text-[#145B4F]">{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Per-BOSS Readiness Summary */}
      <div className="notebook-card p-4 space-y-3">
        <h3 className="font-display text-base font-extrabold text-[#14284A]">
          Kiểm tra độ sẵn sàng cho từng BOSS (B1–B5)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b-2 border-[#D5B87E] text-[#4B5B73]">
                <th className="py-2 pr-3">BOSS</th>
                <th className="py-2 pr-3">Chủ đề</th>
                <th className="py-2 pr-3">Yêu cầu đòn (M1–M4)</th>
                <th className="py-2 pr-3">Đủ duyệt / Chờ duyệt</th>
                <th className="py-2">Cảnh báo & ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5D3A8]">
              {report.bossReadiness.map((b) => (
                <tr key={b.bossId}>
                  <td className="py-2.5 pr-3 font-extrabold text-[#14284A]">
                    {b.bossId} · {b.bossName}
                  </td>
                  <td className="py-2.5 pr-3 font-bold text-[#1F3B63]">{b.clusters.join(', ')}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    <strong>{b.totalHits} đòn</strong> (M1:{b.levelDemands[1]} · M2:{b.levelDemands[2]} · M3:
                    {b.levelDemands[3]} · M4:{b.levelDemands[4]})
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    <span className="font-bold text-[#145B4F]">{b.approvedAvailable} duyệt</span> ·{' '}
                    <span className="font-bold text-[#8A5608]">{b.pendingAvailable} chờ</span>
                  </td>
                  <td className="py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded font-bold mr-1.5 ${
                        b.status === 'sufficient'
                          ? 'bg-[#E6F6F3] text-[#145B4F]'
                          : b.status === 'pending_only'
                            ? 'bg-[#FFF5E2] text-[#8A5608]'
                            : 'bg-[#FCE8E6] text-[#99261B]'
                      }`}
                    >
                      {b.status === 'sufficient'
                        ? 'Sẵn sàng'
                        : b.status === 'pending_only'
                          ? 'Chờ duyệt'
                          : 'Thiếu ngân hàng'}
                    </span>
                    <span className="text-[#4B5B73]">{b.note_vi}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

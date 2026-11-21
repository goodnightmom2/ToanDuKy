import React from 'react';
import {ArrowLeft, CheckCircle2, PlayCircle, XCircle} from 'lucide-react';
import type {BossSimulationSummary} from '../math/bankAnalysis.ts';
import {runAllSelfTestsWithReport, type SelfTestResult} from '../math/selftest.ts';

interface SelfTestScreenProps {
  onBack?: () => void;
  embedded?: boolean;
}

export const SelfTestScreen: React.FC<SelfTestScreenProps> = ({onBack, embedded = false}) => {
  const [results, setResults] = React.useState<SelfTestResult[]>([]);
  const [bossSim, setBossSim] = React.useState<BossSimulationSummary | null>(null);
  const [running, setRunning] = React.useState(true);

  const execute = React.useCallback(async () => {
    setRunning(true);
    const {results: out, bossSimulation} = await runAllSelfTestsWithReport();
    setResults(out);
    setBossSim(bossSimulation);
    setRunning(false);
  }, []);

  React.useEffect(() => {
    void execute();
  }, [execute]);

  const passedCount = results.filter((r) => r.passed).length;
  const allPassed = results.length > 0 && passedCount === results.length && Boolean(bossSim?.allPassed);

  return (
    <div className={embedded ? 'space-y-4' : 'max-w-4xl mx-auto px-4 py-6 space-y-4'}>
      <div className="notebook-card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase text-[#18685B]">
            Bộ tự kiểm tra tự động (#/selftest)
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[#14284A]">
            {results.length || 17} bài kiểm thử bắt buộc của Toán Du Ký
          </h1>
          <p className="text-xs text-[#4B5B73] mt-0.5">
            Bao gồm kiểm thử 200 mẫu × 13 máy sinh (2.600 câu hỏi), 48 câu chuyển thể Chương III, hình học BS01, bộ chấm số, RBAC và mô phỏng 1.000 lượt/BOSS B1–B5.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void execute()} disabled={running} className="btn-tactile btn-gold text-xs py-2 px-3.5">
            <PlayCircle className="w-4 h-4" />
            {running ? 'Đang chạy...' : 'Chạy lại kiểm thử'}
          </button>
          {onBack && !embedded && (
            <button type="button" onClick={onBack} className="btn-tactile btn-paper text-xs py-2 px-3">
              <ArrowLeft className="w-4 h-4" /> Quay lại
            </button>
          )}
        </div>
      </div>

      {!running && (
        <div
          className={`p-4 rounded-2xl border-2 font-bold text-base flex items-center justify-between ${
            allPassed
              ? 'bg-[#E6F6F3] border-[#2E9C8A] text-[#145B4F]'
              : 'bg-[#FFF5E2] border-[#D98A1F] text-[#8A5108]'
          }`}
        >
          <span>
            Kết quả tổng hợp: {passedCount}/{results.length} bài kiểm thử đạt yêu cầu
          </span>
          <span className="tabular-nums font-extrabold">
            {allPassed ? 'ĐẠT 100%' : 'CẦN KIỂM TRA'}
          </span>
        </div>
      )}

      {/* Detailed 1,000-run simulation table per BOSS B1–B5 */}
      {!running && bossSim && (
        <div className="notebook-card p-4 space-y-3" data-testid="boss-simulation-report">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[#14284A]">
                Kết quả mô phỏng {bossSim.runsPerBoss.toLocaleString('vi-VN')} lượt đấu / mỗi BOSS (B1–B5)
              </h2>
              <p className="text-xs text-[#4B5B73]">
                Tổng cộng <strong>{bossSim.totalSimulatedRuns.toLocaleString('vi-VN')} lượt đấu</strong> ({bossSim.totalQuestionsGenerated.toLocaleString('vi-VN')} câu hỏi) trong {bossSim.durationMs} ms · Kiểm tra liên tiếp cho cùng một học viên.
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                bossSim.allPassed ? 'bg-[#E6F6F3] text-[#145B4F]' : 'bg-[#FCE8E6] text-[#99261B]'
              }`}
            >
              {bossSim.allPassed ? '5/5 BOSS ĐẠT' : 'CÓ LỖI'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b-2 border-[#D5B87E] text-[#4B5B73]">
                  <th className="py-2 pr-3">BOSS</th>
                  <th className="py-2 pr-3">Số đòn</th>
                  <th className="py-2 pr-3">Lượt mô phỏng</th>
                  <th className="py-2 pr-3">Thiếu câu</th>
                  <th className="py-2 pr-3">Trùng trong lượt</th>
                  <th className="py-2 pr-3">Tổng sát thương</th>
                  <th className="py-2 pr-3">Trùng lượt liên tiếp</th>
                  <th className="py-2">Kết luận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5D3A8] tabular-nums">
                {bossSim.rows.map((row) => (
                  <tr key={row.bossId}>
                    <td className="py-2 pr-3 font-extrabold text-[#14284A]">
                      {row.bossId} · {row.bossName}
                    </td>
                    <td className="py-2 pr-3 font-bold">{row.hitsPerRun}</td>
                    <td className="py-2 pr-3 font-bold">{row.runs.toLocaleString('vi-VN')}</td>
                    <td className={`py-2 pr-3 font-bold ${row.missingQuestionRuns === 0 ? 'text-[#145B4F]' : 'text-[#99261B]'}`}>
                      {row.missingQuestionRuns}
                    </td>
                    <td className={`py-2 pr-3 font-bold ${row.duplicateInRunCount === 0 ? 'text-[#145B4F]' : 'text-[#99261B]'}`}>
                      {row.duplicateInRunCount}
                    </td>
                    <td className={`py-2 pr-3 font-bold ${row.wrongTotalDamageRuns === 0 ? 'text-[#145B4F]' : 'text-[#99261B]'}`}>
                      {row.totalDamageWhenAllCorrect.toFixed(0)}% (lỗi: {row.wrongTotalDamageRuns})
                    </td>
                    <td className={`py-2 pr-3 font-bold ${row.identicalConsecutivePairs === 0 ? 'text-[#145B4F]' : 'text-[#99261B]'}`}>
                      {row.identicalConsecutivePairs}/{row.runs - 1}
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded font-extrabold ${
                          row.passed ? 'bg-[#E6F6F3] text-[#145B4F]' : 'bg-[#FCE8E6] text-[#99261B]'
                        }`}
                      >
                        {row.passed ? 'ĐẠT' : 'LỖI'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {results.map((r) => (
          <div key={r.id} className="notebook-card p-3.5 flex items-start gap-3">
            {r.passed ? (
              <CheckCircle2 className="w-5 h-5 text-[#18685B] shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-[#C8392B] shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-[#14284A]">
                #{r.id}. {r.name}
              </p>
              <p className="text-xs text-[#4B5B73] mt-0.5 break-words">{r.detail}</p>
            </div>
            <span
              className={`shrink-0 px-2.5 py-0.5 rounded-lg text-xs font-extrabold ${
                r.passed ? 'bg-[#E6F6F3] text-[#145B4F]' : 'bg-[#FCE8E6] text-[#99261B]'
              }`}
            >
              {r.passed ? 'ĐẠT' : 'LỖI'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

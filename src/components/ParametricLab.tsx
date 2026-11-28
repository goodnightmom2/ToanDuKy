import React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FlaskConical,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  ALL_GENERATOR_IDS,
  createAttemptSeed,
  evaluateBs01Parametric,
  evaluateCosineLawParametric,
  evaluateHeronParametric,
  generateParametricVariants,
  generateQuestion,
  TABLE8_COSINE_VARIANTS,
  type GeneratorId,
} from '../math/generators.ts';
import {formatViNumber, roundToPlaces} from '../math/geometry.ts';
import {gradeNumericAnswer} from '../math/grader.ts';
import {dataService} from '../services/dataService.ts';
import type {ClassRoom, QuestionItem, UserAccount} from '../types.ts';
import {MathText} from './MathText.tsx';

type LabModelKind = 'cosine' | 'heron' | 'bs01';

const GENERATOR_LABELS: Record<GeneratorId, string> = {
  GEN_COS_SIDE: 'Định lý Côsin — Tìm cạnh (2 cạnh + góc xen giữa)',
  GEN_COS_ANGLE: 'Định lý Côsin — Tìm góc (3 cạnh)',
  GEN_SIN_SIDE: 'Định lý Sin — Đo khoảng cách / tìm cạnh',
  GEN_SIN_R: 'Định lý Sin — Bán kính đường tròn ngoại tiếp R',
  GEN_AREA_SAS: 'Diện tích tam giác — Công thức ½ab·sinC',
  GEN_AREA_HERON: 'Diện tích tam giác — Công thức Heron',
  GEN_HEIGHT: 'Đường cao tam giác từ diện tích',
  GEN_TRIG_VALUES: 'Giá trị lượng giác góc 0°–180° & góc bù',
  GEN_ANGLE_SUM: 'Tổng ba góc trong tam giác',
  GEN_OPP_PAIR: 'Nhận diện cạnh – góc đối diện',
  GEN_UNITS: 'Quy đổi đơn vị đo độ dài / diện tích',
  GEN_ROUND: 'Làm tròn số thập phân theo yêu cầu',
  GEN_ERROR_SPOT: 'Tìm lỗi sai trong lời giải mẫu',
};

const SIX_STEP_PIPELINE = [
  '1. Chọn dạng & mức',
  '2. Sinh bộ tham số t ∈ D',
  '3. Kiểm điều kiện hợp lệ',
  '4. Tính y = f(t)',
  '5. Tạo đề, hình & gợi ý',
  '6. Kiểm tính thống nhất',
];

interface ParametricLabProps {
  mode: 'student' | 'teacher';
  user?: UserAccount;
  classes?: ClassRoom[];
  onSavedToBank?: () => void;
}

function projectTrianglePoints(
  pts: Array<[number, number]>,
  width = 440,
  height = 200,
  pad = 36,
): Array<[number, number]> {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = (width - drawW) / 2;
  const offsetY = (height - drawH) / 2;
  return pts.map(([x, y]) => [
    offsetX + (x - minX) * scale,
    height - (offsetY + (y - minY) * scale),
  ]);
}

export const ParametricLab: React.FC<ParametricLabProps> = ({
  mode,
  user,
  classes = [],
  onSavedToBank,
}) => {
  const [subTab, setSubTab] = React.useState<'lab' | 'studio'>(mode === 'teacher' ? 'studio' : 'lab');
  const [model, setModel] = React.useState<LabModelKind>('cosine');

  // Cosine parameters (defaults to Hình 7 & Table 8 Variant 1: b=5, c=8, A=60° -> a=7)
  const [cosB, setCosB] = React.useState(5);
  const [cosC, setCosC] = React.useState(8);
  const [cosA, setCosA] = React.useState(60);

  // Heron parameters (defaults to Table 15: 5, 12, 13 -> S=30, r=2, R=6.5)
  const [herA, setHerA] = React.useState(5);
  const [herB, setHerB] = React.useState(12);
  const [herC, setHerC] = React.useState(13);

  // BS01 indirect river measurement parameters (defaults to Hình 6 & Table 15: AB=60m, α=45°, β=60° -> CH≈38.04m)
  const [bsAb, setBsAb] = React.useState(60);
  const [bsAlpha, setBsAlpha] = React.useState(45);
  const [bsBeta, setBsBeta] = React.useState(60);

  // Mini self-verification challenge inside interactive lab (closes practice -> verify loop)
  const [verifyQ, setVerifyQ] = React.useState<QuestionItem | null>(null);
  const [verifyInput, setVerifyInput] = React.useState('');
  const [verifyFeedback, setVerifyFeedback] = React.useState<{ok: boolean; text: string} | null>(null);

  // Teacher 6-step Variant Studio state
  const [studioGenId, setStudioGenId] = React.useState<GeneratorId>('GEN_COS_SIDE');
  const [studioCount, setStudioCount] = React.useState<number>(4);
  const [studioVariants, setStudioVariants] = React.useState<QuestionItem[]>(() =>
    generateParametricVariants('GEN_COS_SIDE', 4, 20261128),
  );
  const [studioTargetClassId, setStudioTargetClassId] = React.useState<string>(() =>
    classes.length > 0 && user?.role === 'teacher' ? classes[0].id : 'ALL',
  );
  const [studioSavedIds, setStudioSavedIds] = React.useState<Record<string, boolean>>({});
  const [studioMsg, setStudioMsg] = React.useState('');
  const [studioErr, setStudioErr] = React.useState('');
  const [studioSavingId, setStudioSavingId] = React.useState<string | null>(null);

  const cosEval = React.useMemo(() => evaluateCosineLawParametric(cosB, cosC, cosA), [cosB, cosC, cosA]);
  const herEval = React.useMemo(() => evaluateHeronParametric(herA, herB, herC), [herA, herB, herC]);
  const bsEval = React.useMemo(() => evaluateBs01Parametric(bsAb, bsAlpha, bsBeta), [bsAb, bsAlpha, bsBeta]);

  const handleLaunchSelfVerify = () => {
    const targetGen: GeneratorId =
      model === 'cosine' ? 'GEN_COS_SIDE' : model === 'heron' ? 'GEN_AREA_HERON' : 'GEN_SIN_SIDE';
    const q = generateQuestion(targetGen, createAttemptSeed());
    setVerifyQ(q);
    setVerifyInput('');
    setVerifyFeedback(null);
  };

  const handleCheckSelfVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyQ) return;
    const exp = verifyQ.expected_answer;
    const res = gradeNumericAnswer({
      rawInput: verifyInput,
      expectedExact: typeof exp.exact_numeric === 'number' ? exp.exact_numeric : undefined,
      expectedRounded: Number(exp.rounded ?? exp.value ?? 0),
      decimalPlaces: typeof exp.decimal_places === 'number' ? exp.decimal_places : 1,
      expectedUnit: typeof exp.unit === 'string' ? exp.unit : verifyQ.fixedUnitLabel,
      hasFixedUnitLabel: Boolean(verifyQ.fixedUnitLabel),
    });
    setVerifyFeedback({ok: res.isCorrect, text: res.feedback_vi});
  };

  const handleRegenerateVariants = (genId = studioGenId, cnt = studioCount) => {
    setStudioMsg('');
    setStudioErr('');
    setStudioSavedIds({});
    setStudioVariants(generateParametricVariants(genId, cnt, createAttemptSeed()));
  };

  const handleSaveVariantToBank = async (variant: QuestionItem) => {
    if (!user) return;
    setStudioSavingId(variant.id);
    setStudioMsg('');
    setStudioErr('');
    try {
      const now = new Date().toISOString();
      const targetClassIds =
        studioTargetClassId && studioTargetClassId !== 'ALL' ? [studioTargetClassId] : undefined;
      const toSave: QuestionItem = {
        ...variant,
        review_status: 'approved',
        reviewedBy: user.displayName,
        reviewedAt: now,
        approved_by: user.displayName,
        approved_at: now,
        createdBy: user.displayName,
        createdByUid: user.uid,
        targetClassIds,
        math_format: 'latex-1',
        math_verified: true,
        math_verified_by: user.displayName,
        math_verified_at: now,
        source_refs: ['BO_SINH_THAM_SO', variant.generatorId ?? studioGenId],
      };
      dataService.upsertQuestion(
        user,
        toSave,
        `Sinh từ Xưởng tham số hóa (${variant.generatorId ?? studioGenId}, seed=${variant.seed ?? 0})`,
      );
      const syncRes = await dataService.syncQuestionsToSupabase([toSave.id]);
      setStudioSavedIds((prev) => ({...prev, [variant.id]: true}));
      onSavedToBank?.();
      if (!syncRes.ok) {
        setStudioErr(`Đã lưu biến thể cục bộ nhưng chưa đồng bộ được Supabase: ${syncRes.error}`);
      } else {
        const clsName =
          studioTargetClassId === 'ALL'
            ? 'Ngân hàng chung mọi lớp'
            : `riêng lớp ${classes.find((c) => c.id === studioTargetClassId)?.name ?? studioTargetClassId}`;
        setStudioMsg(
          `✓ Đã lưu & đồng bộ biến thể [${toSave.id}] (seed ${toSave.seed}) vào ${clsName}.`,
        );
      }
    } finally {
      setStudioSavingId(null);
    }
  };

  const renderSvgDiagram = () => {
    if (model === 'cosine') {
      if (!cosEval.valid || !cosEval.coords) {
        return (
          <div className="h-[200px] rounded-xl bg-[#FCE8E6] border border-[#E5A09B] flex flex-col items-center justify-center p-4 text-center text-xs text-[#99261B] font-bold gap-1.5">
            <AlertTriangle className="w-6 h-6" />
            <span>{cosEval.reason_vi}</span>
          </div>
        );
      }
      const [pA, pB, pC] = projectTrianglePoints([cosEval.coords.A, cosEval.coords.B, cosEval.coords.C]);
      const midAB = [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2 + 16];
      const midAC = [(pA[0] + pC[0]) / 2 - 20, (pA[1] + pC[1]) / 2];
      const midBC = [(pB[0] + pC[0]) / 2 + 22, (pB[1] + pC[1]) / 2 - 4];
      return (
        <svg viewBox="0 0 440 200" className="w-full h-[200px] bg-white rounded-xl border border-[#E5D3A8]">
          <polygon
            points={`${pA[0]},${pA[1]} ${pB[0]},${pB[1]} ${pC[0]},${pC[1]}`}
            fill="#E6F6F3"
            stroke="#14284A"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <circle cx={pA[0]} cy={pA[1]} r="4.5" fill="#14284A" />
          <circle cx={pB[0]} cy={pB[1]} r="4.5" fill="#14284A" />
          <circle cx={pC[0]} cy={pC[1]} r="4.5" fill="#14284A" />
          <text x={pA[0] - 14} y={pA[1] + 14} fontSize="13" fontWeight="800" fill="#14284A">A</text>
          <text x={pB[0] + 8} y={pB[1] + 14} fontSize="13" fontWeight="800" fill="#14284A">B</text>
          <text x={pC[0] - 4} y={pC[1] - 10} fontSize="13" fontWeight="800" fill="#14284A">C</text>
          <text x={pA[0] + 14} y={pA[1] - 8} fontSize="11" fontWeight="700" fill="#B9831E">{cosA}°</text>
          <text x={midAB[0]} y={midAB[1]} textAnchor="middle" fontSize="12" fontWeight="700" fill="#14284A">
            c = {cosC}
          </text>
          <text x={midAC[0]} y={midAC[1]} textAnchor="middle" fontSize="12" fontWeight="700" fill="#14284A">
            b = {cosB}
          </text>
          <text x={midBC[0]} y={midBC[1]} textAnchor="middle" fontSize="12" fontWeight="800" fill="#1F7A6B">
            a = {cosEval.exactText ?? formatViNumber(roundToPlaces(cosEval.aExact ?? 0, 2), 2)}
          </text>
        </svg>
      );
    }

    if (model === 'heron') {
      if (!herEval.valid || !herEval.coords) {
        return (
          <div className="h-[200px] rounded-xl bg-[#FCE8E6] border border-[#E5A09B] flex flex-col items-center justify-center p-4 text-center text-xs text-[#99261B] font-bold gap-1.5">
            <AlertTriangle className="w-6 h-6" />
            <span>{herEval.reason_vi}</span>
          </div>
        );
      }
      const [pA, pB, pC] = projectTrianglePoints([herEval.coords.A, herEval.coords.B, herEval.coords.C]);
      return (
        <svg viewBox="0 0 440 200" className="w-full h-[200px] bg-white rounded-xl border border-[#E5D3A8]">
          <polygon
            points={`${pA[0]},${pA[1]} ${pB[0]},${pB[1]} ${pC[0]},${pC[1]}`}
            fill="#FFF4D6"
            stroke="#14284A"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <circle cx={pA[0]} cy={pA[1]} r="4" fill="#14284A" />
          <circle cx={pB[0]} cy={pB[1]} r="4" fill="#14284A" />
          <circle cx={pC[0]} cy={pC[1]} r="4" fill="#14284A" />
          <text x={pA[0] - 14} y={pA[1] + 14} fontSize="13" fontWeight="800" fill="#14284A">A</text>
          <text x={pB[0] + 8} y={pB[1] + 14} fontSize="13" fontWeight="800" fill="#14284A">B</text>
          <text x={pC[0] - 4} y={pC[1] - 10} fontSize="13" fontWeight="800" fill="#14284A">C</text>
          <text x={(pA[0] + pB[0]) / 2} y={(pA[1] + pB[1]) / 2 + 16} textAnchor="middle" fontSize="12" fontWeight="700" fill="#14284A">
            c = {herC}
          </text>
          <text x={(pA[0] + pC[0]) / 2 - 18} y={(pA[1] + pC[1]) / 2} textAnchor="middle" fontSize="12" fontWeight="700" fill="#14284A">
            b = {herB}
          </text>
          <text x={(pB[0] + pC[0]) / 2 + 18} y={(pB[1] + pC[1]) / 2} textAnchor="middle" fontSize="12" fontWeight="700" fill="#14284A">
            a = {herA}
          </text>
          <text
            x={(pA[0] + pB[0] + pC[0]) / 3}
            y={(pA[1] + pB[1] + pC[1]) / 3 + 4}
            textAnchor="middle"
            fontSize="12"
            fontWeight="800"
            fill="#1F7A6B"
          >
            S = {formatViNumber(roundToPlaces(herEval.area ?? 0, 2), 2)}
          </text>
        </svg>
      );
    }

    // BS01 River Model
    if (!bsEval.valid || !bsEval.coords) {
      return (
        <div className="h-[200px] rounded-xl bg-[#FCE8E6] border border-[#E5A09B] flex flex-col items-center justify-center p-4 text-center text-xs text-[#99261B] font-bold gap-1.5">
          <AlertTriangle className="w-6 h-6" />
          <span>{bsEval.reason_vi}</span>
        </div>
      );
    }
    const [pA, pB, pC, pH] = projectTrianglePoints([
      bsEval.coords.A,
      bsEval.coords.B,
      bsEval.coords.C,
      bsEval.coords.H,
    ]);
    return (
      <svg viewBox="0 0 440 200" className="w-full h-[200px] bg-white rounded-xl border border-[#E5D3A8]">
        <polygon
          points={`${pA[0]},${pA[1]} ${pB[0]},${pB[1]} ${pC[0]},${pC[1]}`}
          fill="#EBF5FF"
          stroke="#14284A"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <line
          x1={pC[0]}
          y1={pC[1]}
          x2={pH[0]}
          y2={pH[1]}
          stroke="#D98A1F"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <circle cx={pA[0]} cy={pA[1]} r="4" fill="#14284A" />
        <circle cx={pB[0]} cy={pB[1]} r="4" fill="#14284A" />
        <circle cx={pC[0]} cy={pC[1]} r="4" fill="#14284A" />
        <circle cx={pH[0]} cy={pH[1]} r="3.5" fill="#D98A1F" />
        <text x={pA[0] - 14} y={pA[1] + 14} fontSize="13" fontWeight="800" fill="#14284A">A</text>
        <text x={pB[0] + 8} y={pB[1] + 14} fontSize="13" fontWeight="800" fill="#14284A">B</text>
        <text x={pC[0] - 4} y={pC[1] - 10} fontSize="13" fontWeight="800" fill="#14284A">C</text>
        <text x={pH[0] - 4} y={pH[1] + 14} fontSize="12" fontWeight="800" fill="#B9831E">H</text>
        <text x={(pA[0] + pB[0]) / 2} y={pA[1] + 17} textAnchor="middle" fontSize="11" fontWeight="700" fill="#14284A">
          AB = {bsAb} m
        </text>
        <text x={pC[0] + 6} y={(pC[1] + pH[1]) / 2} fontSize="11" fontWeight="800" fill="#B9831E">
          CH ≈ {formatViNumber(roundToPlaces(bsEval.ch ?? 0, 2), 2)} m
        </text>
      </svg>
    );
  };

  return (
    <div className="notebook-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5D3A8] pb-3">
        <div>
          <h3 className="font-display text-lg font-extrabold text-[#14284A] inline-flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-[#2E9C8A]" />
            Bộ sinh đề theo tham số có kiểm soát (Mục 4.3c)
          </h3>
          <p className="text-xs text-[#5B6B82]">
            Miền tham số hợp lệ <MathText text="$D$" />, bộ tham số <MathText text="$\mathbf{t} \in D$" /> và hàm tính đáp án độc lập <MathText text="$y = f(\mathbf{t})$" /> kèm kiểm tra sai số <MathText text="$|x - y| \le \varepsilon$" />.
          </p>
        </div>
        {mode === 'teacher' && (
          <div className="inline-flex rounded-xl border border-[#CBB17D] overflow-hidden bg-white text-xs font-extrabold">
            <button
              type="button"
              onClick={() => setSubTab('studio')}
              className={`px-3 py-1.5 ${subTab === 'studio' ? 'bg-[#14284A] text-white' : 'text-[#14284A]'}`}
            >
              Xưởng sinh biến thể (6 bước)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('lab')}
              className={`px-3 py-1.5 ${subTab === 'lab' ? 'bg-[#2E9C8A] text-white' : 'text-[#14284A]'}`}
            >
              Mô phỏng tương tác (Hình 7)
            </button>
          </div>
        )}
      </div>

      {/* 6-step visual strip matching Image 2 */}
      <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
        {SIX_STEP_PIPELINE.map((step) => (
          <span
            key={step}
            className="px-2.5 py-1 rounded-lg bg-[#FFFBF0] border border-[#D9C293] text-[#14284A]"
          >
            {step}
          </span>
        ))}
      </div>

      {subTab === 'lab' ? (
        <div className="space-y-4">
          {/* Model Switcher */}
          <div className="flex flex-wrap gap-2 text-xs">
            {(
              [
                {id: 'cosine', label: 'Định lý Côsin (Bảng 8 · Hình 7)'},
                {id: 'heron', label: 'Công thức Heron (a, b, c → S, r, R)'},
                {id: 'bs01', label: 'Đo gián tiếp Bến sông BS01'},
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setModel(tab.id);
                  setVerifyQ(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold border transition ${
                  model === tab.id
                    ? 'bg-[#14284A] text-white border-[#14284A]'
                    : 'bg-white text-[#14284A] border-[#CBB17D]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-6 space-y-2.5">
              {renderSvgDiagram()}

              {/* Live Formula + Domain Badge */}
              <div className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-[#14284A]">Công thức tính độc lập:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-extrabold text-[11px] ${
                      (model === 'cosine' ? cosEval.valid : model === 'heron' ? herEval.valid : bsEval.valid)
                        ? 'bg-[#E6F6F3] text-[#145B4F] border border-[#2E9C8A]'
                        : 'bg-[#FCE8E6] text-[#99261B] border border-[#C8392B]'
                    }`}
                  >
                    {(model === 'cosine' ? cosEval.valid : model === 'heron' ? herEval.valid : bsEval.valid)
                      ? '✓ Dữ kiện hợp lệ (t ∈ D)'
                      : '⚠ Vi phạm miền D'}
                  </span>
                </div>

                <div className="text-sm text-[#14284A] overflow-x-auto">
                  <MathText
                    text={`$${
                      model === 'cosine'
                        ? cosEval.formulaLatex
                        : model === 'heron'
                          ? herEval.formulaLatex
                          : bsEval.formulaLatex
                    }$`}
                  />
                </div>

                {model === 'cosine' && cosEval.valid && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#EFE0BC]">
                    <span className="text-[#5B6B82]">Đáp án chính xác &amp; thập phân:</span>
                    <span className="font-extrabold text-base text-[#1F7A6B]">
                      {cosEval.exactLatex ? (
                        <>
                          <MathText text={`$${cosEval.exactLatex}$`} />{' '}
                          <span className="text-xs font-bold text-[#5B6B82]">
                            (≈ {formatViNumber(cosEval.aRounded ?? 0, 4)})
                          </span>
                        </>
                      ) : (
                        formatViNumber(cosEval.aRounded ?? 0, 4)
                      )}
                    </span>
                  </div>
                )}

                {model === 'heron' && herEval.valid && (
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#EFE0BC] text-center">
                    <div className="p-1.5 rounded-lg bg-white border border-[#E5D3A8]">
                      <div className="text-[10px] text-[#5B6B82]">Diện tích S</div>
                      <div className="font-extrabold text-[#1F7A6B]">
                        {formatViNumber(roundToPlaces(herEval.area ?? 0, 2), 2)}
                      </div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-white border border-[#E5D3A8]">
                      <div className="text-[10px] text-[#5B6B82]">Nội tiếp r</div>
                      <div className="font-extrabold text-[#14284A]">
                        {formatViNumber(roundToPlaces(herEval.inradius ?? 0, 2), 2)}
                      </div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-white border border-[#E5D3A8]">
                      <div className="text-[10px] text-[#5B6B82]">Ngoại tiếp R</div>
                      <div className="font-extrabold text-[#14284A]">
                        {formatViNumber(roundToPlaces(herEval.circumradius ?? 0, 2), 2)}
                      </div>
                    </div>
                  </div>
                )}

                {model === 'bs01' && bsEval.valid && (
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#EFE0BC] text-center">
                    <div className="p-1.5 rounded-lg bg-white border border-[#E5D3A8]">
                      <div className="text-[10px] text-[#5B6B82]">Cạnh AC</div>
                      <div className="font-extrabold text-[#14284A]">
                        {formatViNumber(roundToPlaces(bsEval.ac ?? 0, 2), 2)} m
                      </div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-white border border-[#E5D3A8]">
                      <div className="text-[10px] text-[#5B6B82]">Cạnh BC</div>
                      <div className="font-extrabold text-[#14284A]">
                        {formatViNumber(roundToPlaces(bsEval.bc ?? 0, 2), 2)} m
                      </div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-white border border-[#E5D3A8]">
                      <div className="text-[10px] text-[#5B6B82]">Khoảng cách CH</div>
                      <div className="font-extrabold text-[#1F7A6B]">
                        {formatViNumber(roundToPlaces(bsEval.ch ?? 0, 2), 2)} m
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sliders & Presets */}
            <div className="lg:col-span-6 space-y-3 text-xs">
              {model === 'cosine' && (
                <div className="p-3.5 rounded-xl bg-white border border-[#D9C293] space-y-3">
                  <label className="block space-y-1">
                    <div className="flex justify-between font-bold text-[#14284A]">
                      <span>Cạnh b</span>
                      <span>{cosB}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={cosB}
                      onChange={(e) => setCosB(Number(e.target.value))}
                      className="w-full accent-[#2E9C8A]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between font-bold text-[#14284A]">
                      <span>Cạnh c</span>
                      <span>{cosC}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={cosC}
                      onChange={(e) => setCosC(Number(e.target.value))}
                      className="w-full accent-[#2E9C8A]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between font-bold text-[#14284A]">
                      <span>Góc xen giữa A (0° &lt; A &lt; 180°)</span>
                      <span>{cosA}°</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={180}
                      step={5}
                      value={cosA}
                      onChange={(e) => setCosA(Number(e.target.value))}
                      className="w-full accent-[#D98A1F]"
                    />
                  </label>

                  <div className="pt-2 border-t border-[#EFE0BC] space-y-1.5">
                    <p className="font-extrabold text-[#14284A]">4 biến thể chuẩn Bảng 8 (bấm thử nhanh):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TABLE8_COSINE_VARIANTS.map((v) => (
                        <button
                          key={v.variant}
                          type="button"
                          onClick={() => {
                            setCosB(v.b);
                            setCosC(v.c);
                            setCosA(v.angleA);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] font-bold text-[#14284A] hover:bg-[#FFF4D6]"
                        >
                          #{v.variant}: ({v.b}, {v.c}, {v.angleA}°) → {v.expectedText}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCosA(180)}
                        className="px-2.5 py-1 rounded-lg bg-[#FCE8E6] border border-[#E5A09B] font-bold text-[#99261B]"
                      >
                        Thử suy biến (A=180°)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {model === 'heron' && (
                <div className="p-3.5 rounded-xl bg-white border border-[#D9C293] space-y-3">
                  {[
                    {label: 'Cạnh a', val: herA, set: setHerA},
                    {label: 'Cạnh b', val: herB, set: setHerB},
                    {label: 'Cạnh c', val: herC, set: setHerC},
                  ].map((item) => (
                    <label key={item.label} className="block space-y-1">
                      <div className="flex justify-between font-bold text-[#14284A]">
                        <span>{item.label}</span>
                        <span>{item.val}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        value={item.val}
                        onChange={(e) => item.set(Number(e.target.value))}
                        className="w-full accent-[#2E9C8A]"
                      />
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#EFE0BC]">
                    <button
                      type="button"
                      onClick={() => {
                        setHerA(5);
                        setHerB(12);
                        setHerC(13);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#E6F6F3] border border-[#2E9C8A] font-bold text-[#145B4F]"
                    >
                      Chuẩn Bảng 15: (5, 12, 13)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHerA(2);
                        setHerB(3);
                        setHerC(5);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#FCE8E6] border border-[#E5A09B] font-bold text-[#99261B]"
                    >
                      Thử suy biến Bảng 15: (2, 3, 5)
                    </button>
                  </div>
                </div>
              )}

              {model === 'bs01' && (
                <div className="p-3.5 rounded-xl bg-white border border-[#D9C293] space-y-3">
                  <label className="block space-y-1">
                    <div className="flex justify-between font-bold text-[#14284A]">
                      <span>Đoạn chuẩn bờ sông AB (m)</span>
                      <span>{bsAb} m</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={150}
                      step={5}
                      value={bsAb}
                      onChange={(e) => setBsAb(Number(e.target.value))}
                      className="w-full accent-[#2E9C8A]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between font-bold text-[#14284A]">
                      <span>Góc quan sát tại A (α)</span>
                      <span>{bsAlpha}°</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={120}
                      step={5}
                      value={bsAlpha}
                      onChange={(e) => setBsAlpha(Number(e.target.value))}
                      className="w-full accent-[#D98A1F]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between font-bold text-[#14284A]">
                      <span>Góc quan sát tại B (β)</span>
                      <span>{bsBeta}°</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={120}
                      step={5}
                      value={bsBeta}
                      onChange={(e) => setBsBeta(Number(e.target.value))}
                      className="w-full accent-[#D98A1F]"
                    />
                  </label>
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#EFE0BC]">
                    <button
                      type="button"
                      onClick={() => {
                        setBsAb(60);
                        setBsAlpha(45);
                        setBsBeta(60);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#E6F6F3] border border-[#2E9C8A] font-bold text-[#145B4F] inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Khôi phục chuẩn Hình 6 (60m, 45°, 60°)
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Self-Verify Challenge */}
              <div className="p-3.5 rounded-xl bg-[#F0FAF7] border border-[#2E9C8A]/60 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-[#14284A] inline-flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-[#1F7A6B]" />
                    Kiểm chứng khả năng tự giải trên dữ kiện mới
                  </span>
                  <button
                    type="button"
                    onClick={handleLaunchSelfVerify}
                    className="btn-tactile btn-jade text-xs py-1 px-3"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Sinh bài mới (0 gợi ý)
                  </button>
                </div>

                {verifyQ ? (
                  <form onSubmit={handleCheckSelfVerify} className="space-y-2 pt-1">
                    <div className="p-2.5 rounded-lg bg-white border border-[#D9C293] text-[#14284A] font-semibold">
                      <MathText text={verifyQ.stem_vi} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={verifyInput}
                        onChange={(e) => setVerifyInput(e.target.value)}
                        placeholder={`Nhập đáp án (ví dụ: 5√3, sqrt(67) hoặc số thập phân)${verifyQ.fixedUnitLabel ? ` (${verifyQ.fixedUnitLabel})` : ''}`}
                        className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-white border border-[#CBB17D] text-xs font-bold"
                      />
                      <button type="submit" className="btn-tactile btn-gold text-xs py-1.5 px-3">
                        Kiểm tra (|x − y| ≤ ε)
                      </button>
                    </div>
                    {verifyFeedback && (
                      <div
                        className={`p-2 rounded-lg text-xs font-bold ${
                          verifyFeedback.ok
                            ? 'bg-[#E6F6F3] text-[#145B4F] border border-[#2E9C8A]'
                            : 'bg-[#FFF5E2] text-[#8A5108] border border-[#D98A1F]'
                        }`}
                      >
                        {verifyFeedback.text}
                      </div>
                    )}
                  </form>
                ) : (
                  <p className="text-[11px] text-[#5B6B82]">
                    Sau khi quan sát quy luật tham số, bấm <strong>“Sinh bài mới”</strong> để tự giải trên bộ số khác. Hệ thống chấp nhận cả biểu thức căn thức (<code>5√3</code>, <code>sqrt(67)</code>) lẫn số làm tròn theo sai số <MathText text="$\varepsilon$" />.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* TEACHER 6-STEP PARAMETRIC VARIANT STUDIO */
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-end gap-2.5 p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293]">
            <label className="flex-1 min-w-[220px] space-y-1">
              <span className="font-extrabold text-[#14284A]">Chọn bộ sinh đề tham số (13 bộ lõi):</span>
              <select
                value={studioGenId}
                onChange={(e) => {
                  const nextGen = e.target.value as GeneratorId;
                  setStudioGenId(nextGen);
                  handleRegenerateVariants(nextGen, studioCount);
                }}
                className="w-full px-2.5 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold text-[#14284A]"
              >
                {ALL_GENERATOR_IDS.map((gid) => (
                  <option key={gid} value={gid}>
                    {gid} · {GENERATOR_LABELS[gid]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="font-extrabold text-[#14284A] block">Số biến thể:</span>
              <select
                value={studioCount}
                onChange={(e) => {
                  const nextCnt = Number(e.target.value);
                  setStudioCount(nextCnt);
                  handleRegenerateVariants(studioGenId, nextCnt);
                }}
                className="px-2.5 py-2 rounded-xl bg-white border border-[#CBB17D] font-bold text-[#14284A]"
              >
                {[3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} biến thể</option>
                ))}
              </select>
            </label>

            {classes.length > 0 && (
              <label className="space-y-1">
                <span className="font-extrabold text-[#14284A] block">Phạm vi lưu lớp:</span>
                <select
                  value={studioTargetClassId}
                  onChange={(e) => setStudioTargetClassId(e.target.value)}
                  className="px-2.5 py-2 rounded-xl bg-white border border-[#2E9C8A] font-bold text-[#14284A]"
                >
                  <option value="ALL">Dùng chung mọi lớp</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      Riêng lớp {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => handleRegenerateVariants()}
              className="btn-tactile btn-gold text-xs py-2 px-3.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sinh bộ biến thể mới
            </button>
          </div>

          {studioMsg && (
            <div className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {studioMsg}
            </div>
          )}
          {studioErr && (
            <div className="p-2.5 rounded-xl bg-[#FCE8E6] border border-[#C8392B] text-[#99261B] font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {studioErr}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-[#D9C293] bg-white">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="bg-[#FFF4D6] border-b border-[#D9C293] text-[#14284A]">
                  <th className="py-2 px-2.5 w-16">Biến thể</th>
                  <th className="py-2 px-2.5">Đề bài sinh từ tham số (LaTeX)</th>
                  <th className="py-2 px-2.5 w-44">Đáp án kiểm chứng</th>
                  <th className="py-2 px-2.5 w-28">Mã lỗi</th>
                  <th className="py-2 px-2.5 w-36 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE0BC]">
                {studioVariants.map((v, idx) => {
                  const exp = v.expected_answer;
                  const ansDisplay =
                    v.type === 'mcq'
                      ? v.options?.find((o) => o.id === String(exp.choice))?.label ?? String(exp.choice ?? '')
                      : `${exp.rounded ?? exp.value ?? ''}${v.fixedUnitLabel ? ` ${v.fixedUnitLabel}` : ''}`;
                  const saved = Boolean(studioSavedIds[v.id]);
                  return (
                    <tr key={v.id} className="align-top">
                      <td className="py-2.5 px-2.5 font-extrabold text-[#14284A]">
                        #{idx + 1}
                        <div className="text-[10px] font-mono text-[#5B6B82]">seed:{v.seed}</div>
                      </td>
                      <td className="py-2.5 px-2.5 text-[#14284A]">
                        <MathText text={v.stem_vi} />
                      </td>
                      <td className="py-2.5 px-2.5 font-bold text-[#145B4F]">
                        <MathText text={String(ansDisplay)} />
                      </td>
                      <td className="py-2.5 px-2.5 font-bold text-[#8A5108]">
                        {v.anticipated_error_ids.join(', ')}
                      </td>
                      <td className="py-2.5 px-2.5 text-right">
                        {saved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E6F6F3] text-[#145B4F] font-bold">
                            <Check className="w-3.5 h-3.5" /> Đã lưu
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!user || studioSavingId === v.id}
                            onClick={() => void handleSaveVariantToBank(v)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#14284A] text-white font-bold hover:opacity-90 disabled:opacity-50"
                          >
                            {studioSavingId === v.id ? 'Đang lưu...' : '+ Lưu vào Ngân hàng'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[#5B6B82]">
            Ghi chú theo chuẩn Đề cương (Mục 4.3d): Các biến thể lưu từ Xưởng tham số hóa luôn được gắn nguồn <code>BO_SINH_THAM_SO</code> để quản lý tách biệt với câu hỏi kiểm duyệt độc lập.
          </p>
        </div>
      )}
    </div>
  );
};

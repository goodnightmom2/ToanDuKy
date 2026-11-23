import {AlertTriangle, CheckCircle2, Sparkles, Wand2} from 'lucide-react';
import React from 'react';
import {
  auditMathField,
  normalizeMath,
  renderKatexSafe,
  splitMath,
} from '../math/mathEngine.ts';
import {MathText} from './MathText.tsx';

interface MathLatexEditorProps {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  compact?: boolean;
  showTemplates?: boolean;
}

const TOOLBAR_SNIPPETS: Array<{label: string; insert: string; title: string}> = [
  {label: 'a/b', insert: '$\\dfrac{a}{b}$', title: 'Phân số'},
  {label: '√', insert: '$\\sqrt{}$', title: 'Căn bậc hai'},
  {label: '∠', insert: '$\\widehat{BAC}$', title: 'Ký hiệu góc'},
  {label: '°', insert: '^\\circ', title: 'Ký hiệu độ'},
  {label: 'sin', insert: '\\sin ', title: 'Hàm sin'},
  {label: 'cos', insert: '\\cos ', title: 'Hàm cos'},
  {label: 'tan', insert: '\\tan ', title: 'Hàm tan'},
  {label: 'cot', insert: '\\cot ', title: 'Hàm cot'},
  {label: '→AB', insert: '$\\overrightarrow{AB}$', title: 'Vectơ'},
  {label: '≈', insert: '\\approx ', title: 'Xấp xỉ'},
  {label: '≤', insert: '\\le ', title: 'Nhỏ hơn hoặc bằng'},
  {label: '≥', insert: '\\ge ', title: 'Lớn hơn hoặc bằng'},
  {label: '⊥', insert: '\\perp ', title: 'Vuông góc'},
  {label: '△', insert: '$\\triangle ABC$', title: 'Tam giác'},
  {label: 'm', insert: '\\ \\mathrm{m}', title: 'Đơn vị mét'},
  {label: 'm²', insert: '\\ \\mathrm{m}^2', title: 'Đơn vị mét vuông'},
  {label: 'km', insert: '\\ \\mathrm{km}', title: 'Đơn vị ki-lô-mét'},
  {label: 'cm', insert: '\\ \\mathrm{cm}', title: 'Đơn vị xăng-ti-mét'},
  {label: '{,}', insert: '{,}', title: 'Dấu phẩy thập phân chuẩn LaTeX'},
];

const FORMULA_TEMPLATES: Array<{label: string; latex: string}> = [
  {label: 'ĐL Côsin', latex: '$a^2=b^2+c^2-2bc\\cos A$'},
  {label: 'ĐL Sin', latex: '$\\dfrac{a}{\\sin A}=\\dfrac{b}{\\sin B}=\\dfrac{c}{\\sin C}=2R$'},
  {label: 'S = ½bc·sinA', latex: '$S=\\dfrac{1}{2}bc\\sin A$'},
  {label: 'Heron', latex: '$S=\\sqrt{p(p-a)(p-b)(p-c)}$'},
];

export const MathLatexEditor: React.FC<MathLatexEditorProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Nhập nội dung (công thức đặt trong $...$, ví dụ: Cho $\\triangle ABC$ có $\\widehat{A}=60^\\circ$...)',
  rows = 3,
  compact = false,
  showTemplates = true,
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [normPreview, setNormPreview] = React.useState<{
    before: string;
    after: string;
    flags: string[];
  } | null>(null);
  const [pasteHint, setPasteHint] = React.useState(false);

  const liveDiagnostics = React.useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!value.trim()) return {errors, warnings};

    const split = splitMath(value);
    if (split.error === 'unbalanced_dollar') {
      errors.push(`Thiếu dấu $ đóng (dấu $ lẻ tại vị trí ký tự ${(split.errorIndex ?? 0) + 1}).`);
      return {errors, warnings};
    }

    split.segments.forEach((seg, idx) => {
      if (seg.type !== 'text') {
        const res = renderKatexSafe(seg.value, {displayMode: seg.type === 'block', strictMode: true});
        if (!res.ok) {
          errors.push(`Công thức #${idx + 1}: ${res.error_vi ?? res.rawError}`);
        }
      }
    });

    const audit = auditMathField('editor', value);
    for (const iss of audit) {
      if (iss.code === 'unicode_math_leftover' || iss.code === 'unbraced_vi_decimal') {
        if (!warnings.includes(iss.detail)) warnings.push(iss.detail);
      }
    }
    return {errors, warnings};
  }, [value]);

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const handlePreviewNormalize = () => {
    const res = normalizeMath(value);
    if (res.flags.length > 0) {
      setNormPreview({before: value, after: value, flags: res.flags});
      return;
    }
    if (!res.changed) {
      setNormPreview(null);
      setPasteHint(false);
      return;
    }
    setNormPreview({before: value, after: res.normalized, flags: []});
  };

  return (
    <div className="space-y-1.5 text-xs">
      {label && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="font-bold text-[#14284A]">{label}</label>
          <div className="flex items-center gap-1.5">
            {liveDiagnostics.errors.length === 0 && value.trim() && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#145B4F]">
                <CheckCircle2 className="w-3.5 h-3.5" /> Cú pháp LaTeX hợp lệ
              </span>
            )}
            <button
              type="button"
              onClick={handlePreviewNormalize}
              className="px-2 py-1 rounded-lg bg-[#FFF4D6] border border-[#D5B87E] font-bold text-[#8A5108] inline-flex items-center gap-1 !min-h-[28px] hover:bg-[#FCE8B2]"
              title="Chuẩn hóa ký tự Unicode toán (∠, °, √, ², sin60°, dấu phẩy thập phân) sang LaTeX chuẩn"
            >
              <Wand2 className="w-3 h-3" /> Chuẩn hóa
            </button>
          </div>
        </div>
      )}

      {/* Quick-insert toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-[#FFFBF0] border border-[#D9C293]">
        {TOOLBAR_SNIPPETS.map((item) => (
          <button
            key={item.label}
            type="button"
            title={item.title}
            onClick={() => insertAtCursor(item.insert)}
            className="px-2 py-0.5 rounded-md bg-white border border-[#D9C293] hover:bg-[#FFF4D6] text-[11px] font-bold text-[#14284A] !min-h-[26px]"
          >
            {item.label}
          </button>
        ))}
        {showTemplates && !compact && (
          <>
            <span className="text-[#CBB17D] mx-0.5">|</span>
            {FORMULA_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => insertAtCursor(tpl.latex)}
                className="px-2 py-0.5 rounded-md bg-[#E6F6F3] border border-[#9CD5CA] hover:bg-[#D2EFE9] text-[11px] font-bold text-[#145B4F] !min-h-[26px]"
              >
                + {tpl.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Side-by-side editor & live KaTeX preview */}
      <div className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-2' : 'md:grid-cols-2'} gap-2`}>
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setNormPreview(null);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData?.getData('text') ?? '';
            if (/[∠°√²³−×≈≤≥≠⊥△Δ]/.test(pasted)) {
              setPasteHint(true);
            }
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A] font-mono text-xs leading-relaxed"
        />
        <div className="p-2.5 rounded-xl bg-[#FFFBF0] border-2 border-[#E5D3A8] text-sm text-[#14284A] overflow-x-auto min-h-[68px]">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#5B6B82] mb-1">
            Xem trước trực tiếp (&lt;MathText&gt;)
          </p>
          {value.trim() ? (
            <MathText text={value} />
          ) : (
            <span className="text-xs italic text-[#7A8799]">Công thức hiển thị tại đây...</span>
          )}
        </div>
      </div>

      {/* Paste auto-suggest normalization banner */}
      {pasteHint && !normPreview && (
        <div className="p-2 rounded-xl bg-[#FFF4D6] border border-[#E0A93B] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8A5108]">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Phát hiện ký hiệu toán Unicode từ Word/PDF vừa dán. Bạn có muốn chuẩn hóa sang LaTeX chuẩn không?
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handlePreviewNormalize}
              className="px-2.5 py-1 rounded-lg bg-[#14284A] text-white font-bold !min-h-[26px]"
            >
              Xem trước chuẩn hóa
            </button>
            <button
              type="button"
              onClick={() => setPasteHint(false)}
              className="px-2 py-1 rounded-lg bg-white border border-[#CBB17D] font-bold !min-h-[26px]"
            >
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      {/* Normalization preview diff before applying */}
      {normPreview && (
        <div className="p-2.5 rounded-xl bg-[#EEF6FF] border border-[#9EC5FE] space-y-1.5 text-[11px]">
          {normPreview.flags.length > 0 ? (
            <p className="font-bold text-[#99261B]">
              Không thể tự chuẩn hóa do phát hiện cờ: {normPreview.flags.join(', ')}. Vui lòng kiểm tra lại dấu $ hoặc số liệu.
            </p>
          ) : (
            <>
              <p className="font-extrabold text-[#14437A]">Xem trước sau khi chuẩn hóa (đã kiểm tra bảo toàn 100% số liệu):</p>
              <div className="p-2 rounded-lg bg-white border border-[#CBD5E1] font-mono text-[11px] break-words">
                {normPreview.after}
              </div>
              <div className="p-2 rounded-lg bg-[#FFFBF0] border border-[#E5D3A8] text-xs">
                <MathText text={normPreview.after} />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange(normPreview.after);
                    setNormPreview(null);
                    setPasteHint(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-[#2E9C8A] text-white font-bold !min-h-[28px]"
                >
                  Áp dụng chuẩn hóa
                </button>
                <button
                  type="button"
                  onClick={() => setNormPreview(null)}
                  className="px-3 py-1 rounded-lg bg-white border border-[#CBB17D] font-bold !min-h-[28px]"
                >
                  Hủy
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Live Vietnamese syntax error & warning display */}
      {liveDiagnostics.errors.length > 0 && (
        <div className="p-2 rounded-xl bg-[#FCE8E6] border border-[#E5A09B] text-[11px] text-[#99261B] space-y-0.5">
          {liveDiagnostics.errors.map((err, i) => (
            <p key={i} className="flex items-start gap-1 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{err}</span>
            </p>
          ))}
        </div>
      )}
      {liveDiagnostics.errors.length === 0 && liveDiagnostics.warnings.length > 0 && (
        <div className="p-2 rounded-xl bg-[#FFF5E2] border border-[#E0A93B] text-[11px] text-[#8A5108] space-y-0.5">
          {liveDiagnostics.warnings.map((w, i) => (
            <p key={i}>• Gợi ý chuẩn hóa: {w}</p>
          ))}
        </div>
      )}
    </div>
  );
};

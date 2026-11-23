import {AlertTriangle} from 'lucide-react';
import React from 'react';
import {
  DANGEROUS_HTML_REGEX,
  mathToVietnameseSpeech,
  renderKatexSafe,
  sanitizePlainText,
  splitMath,
  truncateMathSafely,
} from '../math/mathEngine.ts';
import type {FormulaImageFallback} from '../types.ts';

interface MathTextProps {
  text: string;
  className?: string;
  maxLength?: number;
  formulaImage?: FormulaImageFallback;
  showErrorTooltip?: boolean;
}

// Track KaTeX webfont readiness once per session to prevent broken-glyph flash (Section 3)
let katexFontsReadyGlobal =
  typeof document === 'undefined' ||
  !('fonts' in document) ||
  document.fonts.check('16px KaTeX_Main');

function useKatexFontsReady(): boolean {
  const [ready, setReady] = React.useState<boolean>(katexFontsReadyGlobal);

  React.useEffect(() => {
    if (katexFontsReadyGlobal) return;
    if (typeof document === 'undefined' || !('fonts' in document)) {
      katexFontsReadyGlobal = true;
      setReady(true);
      return;
    }
    if (document.fonts.check('16px KaTeX_Main')) {
      katexFontsReadyGlobal = true;
      setReady(true);
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        katexFontsReadyGlobal = true;
        setReady(true);
      }
    }, 650);
    document.fonts.ready
      .then(() => {
        if (!cancelled) {
          katexFontsReadyGlobal = true;
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          katexFontsReadyGlobal = true;
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return ready;
}

const MathTextInner: React.FC<MathTextProps> = ({
  text,
  className = '',
  maxLength,
  formulaImage,
  showErrorTooltip = true,
}) => {
  const fontsReady = useKatexFontsReady();
  const displaySource = React.useMemo(() => {
    const raw = String(text ?? '');
    return maxLength && maxLength > 0 ? truncateMathSafely(raw, maxLength) : raw;
  }, [text, maxLength]);

  const parsed = React.useMemo(() => splitMath(displaySource), [displaySource]);
  const ariaSpeech = React.useMemo(
    () => (displaySource.includes('$') ? mathToVietnameseSpeech(displaySource) : undefined),
    [displaySource],
  );

  // If safe cropped image fallback is explicitly provided for an un-OCRable formula (Section 6.6)
  if (formulaImage?.dataUrl) {
    return (
      <span className={`inline-flex flex-col gap-1.5 max-w-full ${className}`}>
        {displaySource && (
          <span className="sr-only">{ariaSpeech || sanitizePlainText(displaySource)}</span>
        )}
        <img
          src={formulaImage.dataUrl}
          alt={formulaImage.alt || 'Công thức toán học (ảnh đối chiếu)'}
          className="max-w-full h-auto rounded-lg border border-[#D9C293] bg-white p-1"
          loading="lazy"
        />
      </span>
    );
  }

  // Unbalanced `$`: NEVER guess — render clean grey warning pill with verbatim text (Section 2 & 3)
  if (parsed.error === 'unbalanced_dollar') {
    const safeRaw = sanitizePlainText(displaySource);
    return (
      <span
        className={`inline-flex flex-wrap items-center gap-1 px-2 py-0.5 rounded-lg bg-[#ECEFF4] border border-[#CBD5E1] text-[#334155] font-mono text-xs max-w-full break-words ${className}`}
        title={
          showErrorTooltip
            ? 'Cảnh báo: Công thức có dấu $ mở nhưng chưa đóng (unbalanced_dollar).'
            : undefined
        }
      >
        <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0" aria-hidden="true" />
        <span>{safeRaw}</span>
      </span>
    );
  }

  return (
    <span
      className={`math-text-root ${className}`}
      aria-label={ariaSpeech}
    >
      {parsed.segments.map((seg, idx) => {
        if (seg.type === 'text') {
          const clean = DANGEROUS_HTML_REGEX.test(seg.value)
            ? sanitizePlainText(seg.value)
            : seg.value;
          return <React.Fragment key={idx}>{clean}</React.Fragment>;
        }

        if (!fontsReady) {
          return (
            <span
              key={idx}
              aria-hidden="true"
              className="inline-block align-baseline mx-0.5 px-2 py-0.5 rounded bg-[#F7E7B8]/70 text-transparent select-none animate-pulse text-xs"
            >
              {seg.value.slice(0, 12)}
            </span>
          );
        }

        const rendered = renderKatexSafe(seg.value, {displayMode: seg.type === 'block'});
        if (!rendered.ok) {
          return (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-[#ECEFF4] border border-[#CBD5E1] text-[#334155] font-mono text-xs align-baseline max-w-full overflow-x-auto"
              title={showErrorTooltip ? rendered.error_vi : undefined}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0" aria-hidden="true" />
              <code>{seg.value}</code>
            </span>
          );
        }

        if (seg.type === 'block') {
          return (
            <span
              key={idx}
              className="math-block-scroll block my-2 text-center overflow-x-auto max-w-full py-0.5"
              // Safe: rendered strictly by KaTeX with trust:false & dangerous-command blocklist
              dangerouslySetInnerHTML={{__html: rendered.html}}
            />
          );
        }

        return (
          <span
            key={idx}
            className="math-inline-wrap inline-block align-baseline mx-0.5 max-w-full overflow-x-auto overflow-y-hidden align-middle"
            // Safe: rendered strictly by KaTeX with trust:false & dangerous-command blocklist
            dangerouslySetInnerHTML={{__html: rendered.html}}
          />
        );
      })}
    </span>
  );
};

export const MathText = React.memo(MathTextInner);
MathText.displayName = 'MathText';

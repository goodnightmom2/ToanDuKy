import katex from 'katex';
import type {MathFlag, QuestionItem} from '../types.ts';
import {verifyQuestionWithSolvers} from './solvers.ts';

export type MathSegmentType = 'text' | 'inline' | 'block';

export interface MathSegment {
  type: MathSegmentType;
  value: string;
}

export interface SplitMathResult {
  segments: MathSegment[];
  error?: 'unbalanced_dollar';
  errorIndex?: number;
}

export interface NormalizeMathResult {
  normalized: string;
  changed: boolean;
  flags: MathFlag[];
  numberDiff?: {missing: string[]; extra: string[]};
}

export interface KatexRenderResult {
  ok: boolean;
  html: string;
  error_vi?: string;
  rawError?: string;
  blockedCommand?: string;
}

export interface MathAuditIssue {
  field: string;
  code:
    | 'unbalanced_dollar'
    | 'latex_syntax_error'
    | 'unicode_math_leftover'
    | 'unbraced_vi_decimal'
    | 'dangerous_command'
    | 'formula_in_text_cmd'
    | 'stray_backslash';
  detail: string;
}

export interface QuestionMathAuditReport {
  questionId: string;
  review_status: QuestionItem['review_status'];
  math_verified: boolean;
  issueCount: number;
  issues: MathAuditIssue[];
}

export interface BankMathAuditSummary {
  totalQuestions: number;
  cleanCount: number;
  withIssuesCount: number;
  byCode: Record<string, number>;
  reports: QuestionMathAuditReport[];
}

export interface FourLayerMathVerification {
  passed: boolean;
  flags: MathFlag[];
  syntaxErrors: string[];
  numberMismatch?: {missing: string[]; extra: string[]};
  symbolMismatch?: string[];
  solverStatus: 'pass' | 'fail' | 'n/a';
  solverNote?: string;
}

/**
 * Shared KaTeX macros declared in ONE place (Section 3).
 * Never overrides KaTeX built-ins like \deg.
 */
export const KATEX_SHARED_MACROS: Record<string, string> = {
  '\\dgr': '^\\circ',
  '\\tg': '\\tan',
  '\\cotg': '\\cot',
};

/**
 * Dangerous KaTeX / HTML commands forbidden in untrusted PDF/AI content (Section 3 & 10.6).
 */
export const DANGEROUS_LATEX_REGEX =
  /\\(?:href|url|includegraphics|htmlClass|htmlStyle|htmlData|htmlId|htmlExtension|def|gdef|edef|xdef|let|futurelet)\b/i;

export const DANGEROUS_HTML_REGEX = /<\s*(?:script|iframe|object|embed|svg|img|style|link)\b|on[a-z]+\s*=|javascript:/i;

const UNICODE_MATH_LEFTOVER_REGEX = /[∠°²³⁴⁵⁶⁷⁸⁹⁰√−×≈≤≥≠⊥∥△Δππαβγθφ½¼¾→]/;

/**
 * Standard Vietnamese number formatter (Section 3):
 * - Comma decimal separator
 * - NO thousands separator for regular numbers
 * - Avoids "-0"
 */
export function formatVi(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  const factor = Math.pow(10, Math.max(0, decimals));
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  const safeVal = Object.is(rounded, -0) || Math.abs(rounded) < 1e-12 ? 0 : rounded;
  if (decimals <= 0) return String(Math.round(safeVal));
  const fixed = safeVal.toFixed(decimals).replace(/\.?0+$/, '');
  return fixed.replace('.', ',');
}

/**
 * Splits text into `{type: "text" | "inline" | "block", value}` segments (Section 2).
 * - Handles `$$...$$`, `$...$`, and escaped `\$` (literal `$` in text).
 * - NEVER guesses on unbalanced `$`: returns `error: 'unbalanced_dollar'`.
 */
export function splitMath(input: string): SplitMathResult {
  const text = String(input ?? '');
  const segments: MathSegment[] = [];
  let buf = '';
  let i = 0;

  const flushText = () => {
    if (buf.length > 0) {
      segments.push({type: 'text', value: buf});
      buf = '';
    }
  };

  while (i < text.length) {
    // Escaped dollar `\$` in plain text -> literal '$'
    if (text[i] === '\\' && text[i + 1] === '$') {
      buf += '$';
      i += 2;
      continue;
    }

    if (text[i] === '$') {
      const isBlock = text[i + 1] === '$';
      const delimLen = isBlock ? 2 : 1;
      const openPos = i;
      i += delimLen;

      // Scan forward for matching closing delimiter (respecting `\$` inside math)
      let mathBuf = '';
      let closed = false;
      while (i < text.length) {
        if (text[i] === '\\' && text[i + 1] === '$') {
          mathBuf += '\\$';
          i += 2;
          continue;
        }
        if (isBlock) {
          if (text[i] === '$' && text[i + 1] === '$') {
            closed = true;
            i += 2;
            break;
          }
        } else {
          if (text[i] === '$' && text[i + 1] !== '$') {
            closed = true;
            i += 1;
            break;
          }
          if (text[i] === '$' && text[i + 1] === '$') {
            // Unmatched single $ ran into $$
            break;
          }
        }
        mathBuf += text[i];
        i += 1;
      }

      if (!closed) {
        return {
          segments: [{type: 'text', value: text}],
          error: 'unbalanced_dollar',
          errorIndex: openPos,
        };
      }

      flushText();
      segments.push({
        type: isBlock ? 'block' : 'inline',
        value: mathBuf.trim(),
      });
      continue;
    }

    buf += text[i];
    i += 1;
  }

  flushText();
  return {segments};
}

/**
 * Safely truncates text containing `$...$` / `$$...$$` so a formula is NEVER sliced in half!
 */
export function truncateMathSafely(text: string, maxChars: number): string {
  const src = String(text ?? '');
  if (src.length <= maxChars) return src;
  const split = splitMath(src);
  if (split.error) {
    return `${src.slice(0, maxChars).trimEnd()}…`;
  }
  let out = '';
  let visibleLen = 0;
  for (const seg of split.segments) {
    if (seg.type === 'text') {
      const remain = maxChars - visibleLen;
      if (remain <= 0) break;
      if (seg.value.length <= remain) {
        out += seg.value;
        visibleLen += seg.value.length;
      } else {
        out += `${seg.value.slice(0, remain).trimEnd()}…`;
        return out;
      }
    } else {
      const approxLen = Math.min(24, seg.value.length);
      if (visibleLen + approxLen > maxChars && out.length > 0) {
        return `${out.trimEnd()}…`;
      }
      out += seg.type === 'block' ? `$$${seg.value}$$` : `$${seg.value}$`;
      visibleLen += approxLen;
    }
  }
  return out.length < src.length ? `${out.trimEnd()}…` : out;
}

/**
 * Sanitizes untrusted plain text (strips HTML tags & script vectors; React escapes text nodes,
 * and this helper guarantees no raw HTML ever sneaks through).
 */
export function sanitizePlainText(raw: string): string {
  return String(raw ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '');
}

/**
 * Translates common KaTeX ParseError messages into clear Vietnamese hints for teachers (Section 7).
 */
export function translateKatexErrorVi(rawMsg: string): string {
  const msg = String(rawMsg ?? '');
  if (/Expected '\}'/i.test(msg)) return 'Thiếu dấu ngoặc nhọn đóng `}` trong công thức.';
  if (/Unexpected end of input/i.test(msg)) return 'Công thức kết thúc đột ngột (thường do thiếu `}` hoặc thiếu đối số sau lệnh).';
  if (/Undefined control sequence/i.test(msg)) {
    const cmd = msg.match(/Undefined control sequence:\s*(\\[a-zA-Z]+)/i)?.[1] ?? '';
    return `Lệnh LaTeX không hợp lệ hoặc gõ sai chính tả${cmd ? `: ${cmd}` : ''}.`;
  }
  if (/Double superscript/i.test(msg)) return 'Lặp dấu mũ `^` liên tiếp (hãy bọc trong ngoặc nhọn `{...}`).';
  if (/Double subscript/i.test(msg)) return 'Lặp chỉ số dưới `_` liên tiếp (hãy bọc trong ngoặc nhọn `{...}`).';
  if (/Extra \}/i.test(msg)) return 'Thừa dấu ngoặc nhọn đóng `}`.';
  if (/Missing \\right/i.test(msg)) return 'Có `\\left` nhưng thiếu `\\right` tương ứng.';
  if (/Extra \\right/i.test(msg)) return 'Có `\\right` nhưng thiếu `\\left` tương ứng.';
  return `Lỗi cú pháp LaTeX: ${msg.replace(/^KaTeX parse error:\s*/i, '')}`;
}

// LRU-style render cache to avoid re-running KaTeX on identical expressions
const katexRenderCache = new Map<string, KatexRenderResult>();
const MAX_KATEX_CACHE = 600;

/**
 * Converts Unicode combining accents/hats/arrows inside a LaTeX math segment
 * (e.g. `CAD\u0302` -> `\widehat{CAD}`, `AB\u20D7` -> `\overrightarrow{AB}`)
 * and strips any remaining orphan combining marks so KaTeX never throws ParseError.
 */
export function sanitizeCombiningMarksInLatex(rawLatex: string): string {
  return String(rawLatex ?? '')
    .replace(/([A-Za-z]{1,4})\s*[\u0302\u0306\u030c\u02c6\u2322\u2323\u0311]/g, '\\widehat{$1}')
    .replace(/([A-Za-z]{1,4})\s*[\u20d7\u20d6\u20e1]/g, '\\overrightarrow{$1}')
    .replace(/([A-Za-z]{1,4})\s*[\u0304\u0305]/g, '\\overline{$1}')
    .replace(/[\u0300-\u036f\u20d0-\u20ff]/g, '');
}

/**
 * Renders a single LaTeX expression securely via KaTeX with:
 * - `trust: false`, `maxSize: 10`, `maxExpand: 200`, `output: 'htmlAndMathml'`
 * - Dangerous command blocklist (`\href`, `\url`, `\includegraphics`, `\htmlClass`, ...)
 * - Always checks syntax cleanly (in strict/validation mode or display mode)
 */
export function renderKatexSafe(
  latex: string,
  options?: {displayMode?: boolean; strictMode?: boolean},
): KatexRenderResult {
  const displayMode = Boolean(options?.displayMode);
  const strictMode = Boolean(options?.strictMode);
  const trimmed = sanitizeCombiningMarksInLatex(String(latex ?? '')).trim();

  if (!trimmed) {
    return {ok: true, html: ''};
  }

  const dangerMatch = trimmed.match(DANGEROUS_LATEX_REGEX);
  if (dangerMatch) {
    return {
      ok: false,
      html: '',
      blockedCommand: dangerMatch[0],
      error_vi: `Lệnh không được phép vì lý do an toàn: ${dangerMatch[0]}`,
      rawError: `Blocked command ${dangerMatch[0]}`,
    };
  }
  if (DANGEROUS_HTML_REGEX.test(trimmed)) {
    return {
      ok: false,
      html: '',
      blockedCommand: '<html/script>',
      error_vi: 'Nội dung chứa thẻ HTML/script không được phép.',
      rawError: 'Blocked HTML/script in formula',
    };
  }

  const cacheKey = `${displayMode ? 'B' : 'I'}|${strictMode ? 'S' : 'D'}|${trimmed}`;
  const cached = katexRenderCache.get(cacheKey);
  if (cached) return cached;

  try {
    const html = katex.renderToString(trimmed, {
      displayMode,
      throwOnError: true, // Catch error ourselves so UI displays clean grey warning box instead of red KaTeX text
      strict: strictMode ? 'warn' : 'ignore',
      trust: false,
      maxSize: 10,
      maxExpand: 200,
      output: 'htmlAndMathml',
      macros: {...KATEX_SHARED_MACROS},
    });
    const res: KatexRenderResult = {ok: true, html};
    if (katexRenderCache.size >= MAX_KATEX_CACHE) {
      const firstKey = katexRenderCache.keys().next().value;
      if (firstKey) katexRenderCache.delete(firstKey);
    }
    katexRenderCache.set(cacheKey, res);
    return res;
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err);
    const res: KatexRenderResult = {
      ok: false,
      html: '',
      rawError,
      error_vi: translateKatexErrorVi(rawError),
    };
    return res;
  }
}

/**
 * Extracts normalized numeric token multiset from plain text or LaTeX (Section 5 & 6.3b).
 * - Handles `55{,}3`, `55,3`, `55.3` -> `'55.3'`
 * - Handles Unicode superscripts `²` -> `'2'`, `³` -> `'3'`, and `½` -> `['1', '2']`
 * - Ignores trailing `.0` only when comparing exact canonical strings? No — preserves exact digits
 *   except normalizing decimal comma to dot so `55,3` == `55{,}3` == `55.3`!
 */
export function extractNumberTokens(input: string): string[] {
  const s = String(input ?? '')
    .replace(/½/g, ' 1 2 ')
    .replace(/¼/g, ' 1 4 ')
    .replace(/¾/g, ' 3 4 ')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/(\d)\{,\}(\d)/g, '$1.$2')
    .replace(/(\d),(\d)/g, '$1.$2');

  const matches = s.match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.map((tok) => tok.trim()).sort();
}

export function compareNumberMultisets(
  sourceTokens: string[],
  targetTokens: string[],
): {match: boolean; missing: string[]; extra: string[]} {
  const counts = new Map<string, number>();
  for (const t of sourceTokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const extra: string[] = [];
  for (const t of targetTokens) {
    const c = counts.get(t) ?? 0;
    if (c > 0) {
      counts.set(t, c - 1);
    } else {
      extra.push(t);
    }
  }
  const missing: string[] = [];
  for (const [tok, remain] of counts.entries()) {
    for (let i = 0; i < remain; i++) missing.push(tok);
  }
  return {
    match: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

export interface SymbolSignature {
  degrees: number;
  sqrts: number;
  fracs: number;
  angles: number;
  vertices: string[];
}

export function extractSymbolSignature(input: string): SymbolSignature {
  const s = String(input ?? '');
  const degrees = (s.match(/\^\s*\{?\s*\\circ\s*\}?|°|\\dgr\b/g) ?? []).length;
  const sqrts = (s.match(/\\sqrt\b|√/g) ?? []).length;
  const fracs = (s.match(/\\d?frac\b/g) ?? []).length;
  const angles = (s.match(/\\widehat\b|\\angle\b|\\hat\b|∠/g) ?? []).length;

  // Extract geometric vertex labels (single uppercase letters or triangle names like ABC, BAC, CH, AB)
  const stripped = s
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\b(?:PHẦN|CÂU|BÀI|DẠNG|MỨC|SIN|COS|TAN|COT|DEG|RAD|PDF|TEST|BOSS)\b/gi, ' ');
  const vertexMatches = stripped.match(/\b[A-HJ-Z]{1,3}\b/g) ?? [];
  const vertices = Array.from(
    new Set(
      vertexMatches
        .flatMap((tok) => tok.split(''))
        .filter((ch) => /[ABCDEFGHMNOPQR]/.test(ch)),
    ),
  ).sort();

  return {degrees, sqrts, fracs, angles, vertices};
}

export function compareSymbolSignatures(
  refSig: SymbolSignature,
  candSig: SymbolSignature,
): string[] {
  const diffs: string[] = [];
  if (refSig.degrees !== candSig.degrees) {
    diffs.push(`Ký hiệu độ (°): gốc ${refSig.degrees} ≠ trích xuất ${candSig.degrees}`);
  }
  if (refSig.sqrts !== candSig.sqrts) {
    diffs.push(`Ký hiệu căn (√): gốc ${refSig.sqrts} ≠ trích xuất ${candSig.sqrts}`);
  }
  if (refSig.fracs !== candSig.fracs) {
    diffs.push(`Số phân số (\\dfrac): gốc ${refSig.fracs} ≠ trích xuất ${candSig.fracs}`);
  }
  if (refSig.angles !== candSig.angles) {
    diffs.push(`Ký hiệu góc (\\widehat): gốc ${refSig.angles} ≠ trích xuất ${candSig.angles}`);
  }
  const refV = refSig.vertices.join(',');
  const candV = candSig.vertices.join(',');
  if (refV !== candV) {
    diffs.push(`Tên đỉnh hình học: gốc [${refV}] ≠ trích xuất [${candV}]`);
  }
  return diffs;
}

/**
 * Helper: transforms raw math body (inside `$...$`) into canonical Chapter III LaTeX (Section 4).
 */
function normalizeMathInner(rawMath: string): string {
  let s = sanitizeCombiningMarksInLatex(rawMath).trim();

  // 1. Unicode dashes / operators / symbols
  s = s
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '\\cdot ')
    .replace(/·/g, '\\cdot ')
    .replace(/≈/g, '\\approx ')
    .replace(/≤/g, '\\le ')
    .replace(/≥/g, '\\ge ')
    .replace(/≠/g, '\\ne ')
    .replace(/⊥/g, '\\perp ')
    .replace(/∥/g, '\\parallel ')
    .replace(/π/g, '\\pi ')
    .replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ')
    .replace(/γ/g, '\\gamma ')
    .replace(/Δ/g, '\\triangle ')
    .replace(/△/g, '\\triangle ');

  // 2. Unicode fractions
  s = s
    .replace(/½/g, '\\dfrac{1}{2}')
    .replace(/¼/g, '\\dfrac{1}{4}')
    .replace(/¾/g, '\\dfrac{3}{4}');

  // 3. Unicode superscripts & subscripts
  s = s
    .replace(/([A-Za-z0-9)\]}])²/g, '$1^2')
    .replace(/([A-Za-z0-9)\]}])³/g, '$1^3')
    .replace(/([A-Za-z0-9)\]}])⁴/g, '$1^4')
    .replace(/₀/g, '_0')
    .replace(/₁/g, '_1')
    .replace(/₂/g, '_2')
    .replace(/₃/g, '_3');

  // 4. Angles: ∠BAC, \angle BAC, \hat{A} -> \widehat{...}
  s = s
    .replace(/∠\s*([A-Z]{1,3})\b/g, '\\widehat{$1}')
    .replace(/\\angle\s*\{?([A-Z]{1,3})\}?/g, '\\widehat{$1}')
    .replace(/\\hat\s*\{([A-Z]{1,3})\}/g, '\\widehat{$1}');

  // 5. Vectors: →AB -> \overrightarrow{AB}
  s = s.replace(/→\s*([A-Z]{2})\b/g, '\\overrightarrow{$1}');

  // 6. Square roots: √(expr) -> \sqrt{expr}, √13 -> \sqrt{13}
  s = s
    .replace(/√\s*\(([^()]+)\)/g, '\\sqrt{$1}')
    .replace(/√\s*(\d+(?:[.,]\d+)?|[a-zA-Z]+)/g, '\\sqrt{$1}');

  // 7. Vietnamese trig aliases & spacing: tg -> \tan, cotg -> \cot, sin60° -> \sin 60^\circ, ABsinC -> AB\sin C
  s = s
    .replace(/(^|[^\\a-zA-Z])cotg(?=\s|[^a-zA-Z]|$)/g, '$1\\cot ')
    .replace(/(^|[^\\a-zA-Z])tg(?=\s|[^a-zA-Z]|$)/g, '$1\\tan ')
    .replace(/(^|[^\\a-z])(sin|cos|tan|cot)(?=\s*[\d(A-Zαβγ\\^])/g, '$1\\$2 ')
    .replace(/([a-z])(sin|cos|tan|cot)(?=\s*[\d(A-Zαβγ\\^])/g, '$1\\$2 ');

  // Clean trig power/arg spacing: \sin 60° -> \sin 60^\circ, \sin \alpha -> \sin\alpha
  s = s
    .replace(/(\d+)\s*°/g, '$1^\\circ')
    .replace(/°/g, '^\\circ')
    .replace(/\\(sin|cos|tan|cot)\s+\(/g, '\\$1(')
    .replace(/\\(sin|cos|tan|cot)\s+\\(alpha|beta|gamma|theta|pi)\b/g, '\\$1\\$2');

  // 8. Multiply star between numbers/symbols -> \cdot
  s = s.replace(/(\d|\})\s*\*\s*(\d|\\|[a-zA-Z])/g, '$1\\cdot $2');

  // 9. Remove unnecessary \cdot right before trig/variable when canonical (e.g. 2bc\cdot \cos A -> 2bc\cos A, 60\cdot \sin -> 60\sin, d\cdot \sin -> d\sin)
  s = s
    .replace(/([a-zA-Z0-9])\s*\\cdot\s*\\(sin|cos|tan|cot)\b/g, (m, prev, fn) => {
      // Keep \cdot when preceded by a numeric chain like `30\cdot\sin 60^\circ` ONLY if previous char was preceded by \cdot (Golden #7: `1/2\cdot 20\cdot 30\cdot\sin 60^\circ`)
      // Wait: check Golden #3 `60·sin60°` -> `60\sin 60^\circ` vs Golden #7 `½·20·30·sin60°` -> `\dfrac{1}{2}\cdot 20\cdot 30\cdot\sin 60^\circ`!
      return `${prev}\\cdot \\${fn}`;
    });

  // 10. Parenthesized & trig fraction conversions:
  // (expr)/(expr) -> \dfrac{expr}{expr}
  s = s.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, '\\dfrac{$1}{$2}');
  // (expr)/denom -> \dfrac{expr}{denom}
  s = s.replace(
    /\(([^()]+)\)\s*\/\s*(\\[a-zA-Z]+(?:\{[^}]+\}|\s*\d+\^\\circ|\([^()]+\)|\\[a-zA-Z]+)?|[A-Za-z0-9]+(?:\^[0-9]+)?)/g,
    '\\dfrac{$1}{$2}',
  );
  // num/(expr) -> \dfrac{num}{expr}
  s = s.replace(
    /(\\[a-zA-Z]+(?:\{[^}]+\}|\s*\d+\^\\circ|\([^()]+\))?|[A-Za-z0-9]+(?:\^[0-9]+)?)\s*\/\s*\(([^()]+)\)/g,
    '\\dfrac{$1}{$2}',
  );
  // Complex numerator with trig/cdot over trig/atom: e.g. `60\cdot \sin 60^\circ/\sin 70^\circ` or `d\cdot \sin\alpha\cdot \sin\beta/\sin(\beta-\alpha)`
  s = s.replace(
    /((?:(?:\d+|[A-Za-z]+)(?:\s*\\cdot\s*)?)*\\(?:sin|cos|tan|cot)(?:\([^()]+\)|\s*\d+\^\\circ|\\[a-zA-Z]+|\s+[A-Z])(?:\s*\\cdot\s*\\(?:sin|cos|tan|cot)(?:\([^()]+\)|\s*\d+\^\\circ|\\[a-zA-Z]+|\s+[A-Z]))*)\s*\/\s*(\\(?:sin|cos|tan|cot)(?:\([^()]+\)|\s*\d+\^\\circ|\\[a-zA-Z]+|\s+[A-Z])|[A-Za-z0-9]+)/g,
    (_, num: string, den: string) => {
      const compactNum = num.replace(/\s*\\cdot\s*/g, '');
      return `\\dfrac{${compactNum.trim()}}{${den.trim()}}`;
    },
  );
  // Simple atom / trig or atom / atom: `AC/\sin 60^\circ` -> `\dfrac{AC}{\sin 60^\circ}`
  s = s.replace(
    /([A-Za-z0-9]+)\s*\/\s*(\\(?:sin|cos|tan|cot)(?:\([^()]+\)|\s*\d+\^\\circ|\\[a-zA-Z]+|\s+[A-Z]))/g,
    '\\dfrac{$1}{$2}',
  );

  // Clean `2bc\cdot \cos A` -> `2bc\cos A` (letter immediately followed by \cdot \cos|\sin|\tan|\cot)
  s = s.replace(/([a-zA-Z])\s*\\cdot\s*\\(sin|cos|tan|cot)\b/g, '$1\\$2');
  // Clean `2\sin A` (inside `\dfrac{a}{2\sin A}`)
  s = s.replace(/(\d)\s*\\(sin|cos|tan|cot)\b/g, '$1\\$2');

  // 11. Vietnamese decimal comma inside math: `55,3` -> `55{,}3` (never double-wrap `{,}`)
  s = s.replace(/(\d),(\d)/g, '$1{,}$2');

  // Remove stray spaces before punctuation/closing paren introduced by symbol expansion (e.g. `\alpha )` -> `\alpha)`)
  s = s
    .replace(/\s+\)/g, ')')
    .replace(/\(\s+/g, '(')
    .replace(/\s+,/g, ',')
    .replace(/\s+;/g, ';');

  // 12. Coordinate semicolons: `(35{,}54; 0; 42{,}36)` -> `(35{,}54;\ 0;\ 42{,}36)`
  s = s.replace(/;\s+/g, ';\\ ');
  // Comma list separation inside math (not decimal): `\tan\alpha, \cot\alpha` -> `\tan\alpha,\ \cot\alpha`
  s = s.replace(/,\s+(?=\\|[A-Za-z])/g, ',\\ ');

  // 13. Units inside math: `55{,}3 m²` -> `55{,}3\ \mathrm{m}^2`, `0{,}75 km` -> `0{,}75\ \mathrm{km}`
  s = s
    .replace(/(\d|\})\s*(?:\\mathrm\{)?(km|cm|dm|mm|m)\}?(\^2|²)/g, '$1\\ \\mathrm{$2}^2')
    .replace(/(\d|\})\s+(km|cm|dm|mm|m)(?=\b|$|[^a-zA-Z])/g, '$1\\ \\mathrm{$2}');

  // 14. Normalize clean tight spacing around =, +, -, \approx, \le, \ge, \ne, \perp, \cdot
  s = s
    .replace(/\s*=\s*/g, '=')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\\approx\s*/g, '\\approx ')
    .replace(/\s*\\perp\s*/g, '\\perp ')
    .replace(/\s*\\le\s*/g, '\\le ')
    .replace(/\s*\\ge\s*/g, '\\ge ')
    .replace(/\s*\\ne\s*/g, '\\ne ')
    .replace(/\s*\\cdot\s*/g, '\\cdot ')
    .replace(/\\cdot\s+\\(sin|cos|tan|cot)/g, '\\cdot\\$1')
    .replace(/\\approx\s+\(/g, '\\approx(')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return s;
}

/**
 * Deterministic math normalizer (Section 5 — ZERO AI):
 * - If text already contains `$...$` / `$$...$$`, normalizes each math segment and wraps leftover inline math tokens in text segments.
 * - If text has NO `$...$`:
 *   - Pure math expression lines (Golden #1–#16, #18–#19) -> wraps cleanly as `$...$`.
 *   - Mixed Vietnamese prose + math (Golden #17, #20) -> keeps Vietnamese prose OUTSIDE `$...$`, wraps only mathematical expressions/measurements/angles inside `$...$`.
 * - Strictly preserves the numeric token multiset; if any number is altered, refuses to apply and flags `numbers_mismatch`.
 */
export function normalizeMath(rawInput: string): NormalizeMathResult {
  const input = String(rawInput ?? '');
  if (!input.trim()) {
    return {normalized: input, changed: false, flags: []};
  }

  // 1. Check unbalanced `$` first — NEVER guess! (Golden #21)
  const split = splitMath(input);
  if (split.error === 'unbalanced_dollar') {
    return {
      normalized: input,
      changed: false,
      flags: ['unbalanced_dollar'],
    };
  }

  const beforeNumbers = extractNumberTokens(input);

  const normalizeTextSegment = (txt: string): string => {
    let out = txt;

    // Special exact-phrase vector notation: `→AB` or `vectơ AB` -> `$\overrightarrow{AB}$` (Golden #18)
    out = out.replace(/(?:→\s*|vectơ\s+)([A-Z]{2})\b/gi, (_, seg: string) => `$\\overrightarrow{${seg.toUpperCase()}}$`);

    // Triangle symbol + vertices: `ΔABC` or `△ABC` -> `$\triangle ABC$` (Golden #17)
    out = out.replace(/[Δ△]\s*([A-Z]{3})\b/g, '$\\triangle $1$');

    // Perpendicular / parallel relation between segments: `AB ⊥ CH` -> `$AB\perp CH$`
    out = out.replace(/\b([A-Z]{2})\s*[⊥]\s*([A-Z]{2})\b/g, (_, a: string, b: string) => `$${a}\\perp ${b}$`);
    out = out.replace(/\b([A-Z]{2})\s*[∥]\s*([A-Z]{2})\b/g, (_, a: string, b: string) => `$${a}\\parallel ${b}$`);

    // Explicit angle notation: `∠BAC = 50°` or `∠BAC` or `góc BAC` (Golden #6 & #20)
    out = out.replace(/∠\s*([A-Z]{1,3})\s*=\s*(\d+(?:[.,]\d+)?)\s*°/g, (_, a, d) => {
      return `$\\widehat{${a}}=${d.replace(',', '{,}')}^\\circ$`;
    });
    out = out.replace(/∠\s*([A-Z]{1,3})\b/g, '$\\widehat{$1}$');
    out = out.replace(/\b(góc)\s+([A-Z]{3})\b/gi, '$1 $\\widehat{$2}$');

    // Standalone measurement with unit in Vietnamese prose: `115 m`, `345 m`, `55,3 m²`, `0,75 km` (Golden #20)
    out = out.replace(
      /(^|[\s(])(\d+(?:[.,]\d+)?)\s*(km|cm|dm|mm|m)(²|\^2)?(?=$|[\s.,;:)?!…])/g,
      (match, lead: string, num: string, unit: string, sq?: string) => {
        const numLatex = num.replace(',', '{,}');
        const unitLatex = sq ? `\\mathrm{${unit}}^2` : `\\mathrm{${unit}}`;
        return `${lead}$${numLatex}\\ ${unitLatex}$`;
      },
    );

    // Standalone degree number in prose: `50°` -> `$50^\circ$`
    out = out.replace(/(^|[\s(])(\d+(?:[.,]\d+)?)\s*°/g, (_, lead: string, num: string) => {
      return `${lead}$${num.replace(',', '{,}')}^\\circ$`;
    });

    // Standalone uppercase geometric segment / line names in Vietnamese prose: `BC cách nhau` -> `$BC$ cách nhau` (Golden #20)
    // Only wrap 2-3 uppercase letters that aren't common Vietnamese/acronym words
    out = out.replace(
      /(^|[\s(…])([A-HJ-Z]{2})(?=\s+(?:cách|bằng|có|là|và|vuông|song|dài|ngắn|nằm|tạo|đối))/g,
      (_, lead: string, seg: string) => `${lead}$${seg}$`,
    );

    // Inline Unicode square root in prose: `√3`, `√(21·8)`
    out = out.replace(/√\s*\(([^()]+)\)/g, (_, inner: string) => `$\\sqrt{${normalizeMathInner(inner)}}$`);
    out = out.replace(/√\s*(\d+)/g, '$\\sqrt{$1}$');

    // Inline trig in prose: `sin60°`, `cos 30°`, `tg α`
    out = out.replace(
      /\b(sin|cos|tan|cot|tg|cotg)\s*(\d+(?:[.,]\d+)?°|[αβγ])/g,
      (m) => `$${normalizeMathInner(m)}$`,
    );

    return out;
  };

  // Detect whether the whole input (with NO existing `$`) is a standalone math expression (Golden #1–#16, #18–#19)
  const hasExistingMath = split.segments.some((seg) => seg.type !== 'text');
  let candidate = '';

  if (!hasExistingMath) {
    // Check if the string contains Vietnamese prose words (accented Vietnamese letters or multi-letter lowercase words other than math funcs/units)
    const strippedMathWords = input
      .replace(/\b(?:sin|cos|tan|cot|tg|cotg|km|cm|dm|mm|m|vectơ)\b/gi, ' ')
      .replace(/[αβγπΔ△∠°²³⁴√−–—×·≈≤≥≠⊥∥½¼¾→()[\]{},.;:+=*/^0-9\s-]/g, ' ');
    const proseWords = strippedMathWords
      .split(/\s+/)
      .filter((w) => w.length >= 2 && /[a-zàáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/.test(w))
      .filter((w) => !/^[a-z]{1,2}$/i.test(w) || /^(có|và|là|từ|đến|với|của|cho|tính|góc|tại|một|hai|ba)$/i.test(w))
      .filter((w) => !/^[a-z](?:[a-z])?(?:sin|cos|tan|cot)/i.test(w));

    const hasMathOperatorOrSymbol =
      /[=≈≤≥≠√°∠²³½¼¾⊥∥→/]|(?:\b(?:sin|cos|tan|cot|tg|cotg|vectơ)\b)/i.test(input);

    if (hasMathOperatorOrSymbol && proseWords.length === 0) {
      // Special case: `vectơ AB` standalone -> `$\overrightarrow{AB}$`
      const vecOnly = input.trim().match(/^(?:→\s*|vectơ\s+)([A-Z]{2})$/i);
      if (vecOnly) {
        candidate = `$\\overrightarrow{${vecOnly[1].toUpperCase()}}$`;
      } else {
        candidate = `$${normalizeMathInner(input)}$`;
      }
    } else {
      candidate = normalizeTextSegment(input);
    }
  } else {
    candidate = split.segments
      .map((seg) => {
        if (seg.type === 'text') {
          return normalizeTextSegment(seg.value);
        }
        const inner = normalizeMathInner(seg.value);
        return seg.type === 'block' ? `$$${inner}$$` : `$${inner}$`;
      })
      .join('');
  }

  // Verify number multiset preservation (Section 5.1 & Golden #22)
  const afterNumbers = extractNumberTokens(candidate);
  const numCmp = compareNumberMultisets(beforeNumbers, afterNumbers);
  if (!numCmp.match) {
    return {
      normalized: input,
      changed: false,
      flags: ['numbers_mismatch'],
      numberDiff: {missing: numCmp.missing, extra: numCmp.extra},
    };
  }

  // Verify every produced math segment parses cleanly in KaTeX
  const postSplit = splitMath(candidate);
  if (postSplit.error) {
    return {
      normalized: input,
      changed: false,
      flags: ['unbalanced_dollar'],
    };
  }
  for (const seg of postSplit.segments) {
    if (seg.type !== 'text') {
      const check = renderKatexSafe(seg.value, {displayMode: seg.type === 'block'});
      if (!check.ok) {
        return {
          normalized: input,
          changed: false,
          flags: ['latex_syntax_error'],
        };
      }
    }
  }

  return {
    normalized: candidate,
    changed: candidate !== input,
    flags: [],
  };
}

/**
 * Audits a single string field for math issues (Section 5.2).
 */
export function auditMathField(field: string, text: string): MathAuditIssue[] {
  const issues: MathAuditIssue[] = [];
  const src = String(text ?? '');
  if (!src.trim()) return issues;

  if (DANGEROUS_HTML_REGEX.test(src) || DANGEROUS_LATEX_REGEX.test(src)) {
    issues.push({
      field,
      code: 'dangerous_command',
      detail: 'Chứa lệnh hoặc thẻ HTML không an toàn.',
    });
  }

  const split = splitMath(src);
  if (split.error === 'unbalanced_dollar') {
    issues.push({
      field,
      code: 'unbalanced_dollar',
      detail: `Dấu $ lẻ tại vị trí ký tự ${split.errorIndex ?? 0}.`,
    });
    return issues;
  }

  for (const seg of split.segments) {
    if (seg.type === 'text') {
      const uni = seg.value.match(UNICODE_MATH_LEFTOVER_REGEX);
      if (uni) {
        issues.push({
          field,
          code: 'unicode_math_leftover',
          detail: `Còn ký tự toán Unicode ngoài $...$: "${uni[0]}"`,
        });
      }
      if (/\\(?!\$)[a-zA-Z]+/.test(seg.value)) {
        issues.push({
          field,
          code: 'stray_backslash',
          detail: 'Có lệnh LaTeX nằm ngoài cặp dấu $...$.',
        });
      }
    } else {
      const kRes = renderKatexSafe(seg.value, {displayMode: seg.type === 'block', strictMode: true});
      if (!kRes.ok) {
        issues.push({
          field,
          code: 'latex_syntax_error',
          detail: kRes.error_vi ?? kRes.rawError ?? 'Lỗi cú pháp KaTeX',
        });
      }
      if (/\d,\d/.test(seg.value)) {
        issues.push({
          field,
          code: 'unbraced_vi_decimal',
          detail: 'Dấu phẩy thập phân trong công thức chưa bọc `{,}`.',
        });
      }
      if (/\\text\{[^}]*(?:=|\\sin|\\cos|\\tan|\\sqrt|\^|_)/.test(seg.value)) {
        issues.push({
          field,
          code: 'formula_in_text_cmd',
          detail: 'Có ký hiệu công thức nằm bên trong \\text{...}.',
        });
      }
      if (/[°∠√²³≈≤≥≠⊥]/.test(seg.value)) {
        issues.push({
          field,
          code: 'unicode_math_leftover',
          detail: 'Còn ký tự Unicode toán bên trong $...$ (cần đổi sang lệnh LaTeX chuẩn).',
        });
      }
    }
  }

  return issues;
}

/**
 * Dry-run math audit across a single QuestionItem (Section 5.2).
 */
export function auditQuestionMath(q: QuestionItem): QuestionMathAuditReport {
  const issues: MathAuditIssue[] = [];
  issues.push(...auditMathField('stem_vi', q.stem_vi));
  (q.options ?? []).forEach((o, i) => {
    issues.push(...auditMathField(`options[${i}]`, o.label));
  });
  (q.statements ?? []).forEach((s) => {
    issues.push(...auditMathField(`statements.${s.id}`, s.label));
  });
  (q.hints_vi ?? []).forEach((h, i) => {
    issues.push(...auditMathField(`hints[${i}]`, h));
  });
  if (q.solution_vi) {
    issues.push(...auditMathField('solution_vi', q.solution_vi));
  }

  return {
    questionId: q.id,
    review_status: q.review_status,
    math_verified: q.math_verified ?? q.review_status === 'approved',
    issueCount: issues.length,
    issues,
  };
}

/**
 * Dry-run `audit:math` across an entire question bank (Section 5.2).
 * NEVER mutates any question!
 */
export function runMathBankAudit(questions: QuestionItem[]): BankMathAuditSummary {
  const reports = questions.map(auditQuestionMath);
  const byCode: Record<string, number> = {};
  let withIssuesCount = 0;

  for (const rep of reports) {
    if (rep.issueCount > 0) withIssuesCount += 1;
    for (const iss of rep.issues) {
      byCode[iss.code] = (byCode[iss.code] ?? 0) + 1;
    }
  }

  return {
    totalQuestions: questions.length,
    cleanCount: questions.length - withIssuesCount,
    withIssuesCount,
    byCode,
    reports,
  };
}

/**
 * Non-destructive normalization pass for a single QuestionItem (for `--fix` mode):
 * - Preserves original stem in `stem_raw` (if not already stored)
 * - Runs deterministic `normalizeMath` on stem, options, statements, hints, solution
 * - If ANY field fails number preservation or syntax check -> sets `math_verified = false` & records `math_flags`
 */
export function normalizeQuestionMathSafely(q: QuestionItem): {
  updated: QuestionItem;
  changed: boolean;
  hasErrors: boolean;
  flags: MathFlag[];
} {
  const flags = new Set<MathFlag>(q.math_flags ?? []);
  let changed = false;

  const applyField = (val: string): string => {
    const res = normalizeMath(val);
    res.flags.forEach((f) => flags.add(f));
    if (res.changed) {
      changed = true;
      return res.normalized;
    }
    return val;
  };

  const nextStem = applyField(q.stem_vi);
  const nextOptions = q.options?.map((o) => ({...o, label: applyField(o.label)}));
  const nextStatements = q.statements?.map((s) => ({...s, label: applyField(s.label)}));
  const nextHints = q.hints_vi.map((h) => applyField(h));
  const nextSolution = q.solution_vi ? applyField(q.solution_vi) : q.solution_vi;

  // Post-check syntax & unbalanced dollar
  const postAudit = auditQuestionMath({
    ...q,
    stem_vi: nextStem,
    options: nextOptions,
    statements: nextStatements,
    hints_vi: nextHints,
    solution_vi: nextSolution,
  });

  const criticalIssues = postAudit.issues.filter(
    (i) => i.code === 'unbalanced_dollar' || i.code === 'latex_syntax_error' || i.code === 'dangerous_command',
  );
  if (criticalIssues.length > 0) {
    criticalIssues.forEach((ci) => {
      if (ci.code === 'unbalanced_dollar') flags.add('unbalanced_dollar');
      if (ci.code === 'latex_syntax_error') flags.add('latex_syntax_error');
    });
  }

  const hasErrors =
    flags.has('numbers_mismatch') ||
    flags.has('latex_syntax_error') ||
    flags.has('unbalanced_dollar') ||
    criticalIssues.length > 0;

  const updated: QuestionItem = {
    ...q,
    stem_raw: q.stem_raw ?? (changed ? q.stem_vi : undefined),
    stem_vi: nextStem,
    options: nextOptions,
    statements: nextStatements,
    hints_vi: nextHints,
    solution_vi: nextSolution,
    math_format: 'latex-1',
    math_flags: Array.from(flags),
    math_verified: hasErrors ? false : q.math_verified,
  };

  return {
    updated,
    changed,
    hasErrors,
    flags: Array.from(flags),
  };
}

/**
 * 4-Layer Automatic Math Verification (Section 6.3 a-d):
 * (a) KaTeX strict syntax parse across stem/options/statements/solution
 * (b) Multiset number token comparison vs reference PDF text layer and/or independent double-read
 * (c) Symbol signature comparison (degrees, sqrts, fracs, angles, vertex letters) vs double-read
 * (d) Deterministic math solver verification (`verifyQuestionWithSolvers`)
 */
export function verifyQuestionMathLayers(
  question: QuestionItem,
  options?: {
    referenceText?: string;
    doubleCheckText?: string;
  },
): FourLayerMathVerification {
  const flags = new Set<MathFlag>(question.math_flags ?? []);
  const syntaxErrors: string[] = [];

  // (a) KaTeX syntax check across all math fields
  const fieldsToCheck: Array<{name: string; text: string}> = [
    {name: 'Đề bài', text: question.stem_vi},
    ...(question.options ?? []).map((o, idx) => ({name: `Phương án ${String.fromCharCode(65 + idx)}`, text: o.label})),
    ...(question.statements ?? []).map((s) => ({name: `Ý ${s.id})`, text: s.label})),
    ...(question.solution_vi ? [{name: 'Lời giải', text: question.solution_vi}] : []),
  ];

  for (const f of fieldsToCheck) {
    const split = splitMath(f.text);
    if (split.error === 'unbalanced_dollar') {
      flags.add('unbalanced_dollar');
      syntaxErrors.push(`${f.name}: dấu $ mở không đóng (lẻ).`);
      continue;
    }
    for (const seg of split.segments) {
      if (seg.type !== 'text') {
        const res = renderKatexSafe(seg.value, {displayMode: seg.type === 'block', strictMode: true});
        if (!res.ok) {
          flags.add('latex_syntax_error');
          syntaxErrors.push(`${f.name}: ${res.error_vi ?? res.rawError}`);
        }
      }
    }
  }

  // (b) Number multiset comparison against trusted reference text / double-read
  let numberMismatch: {missing: string[]; extra: string[]} | undefined;
  const fullExtractedText = [
    question.stem_vi,
    ...(question.options ?? []).map((o) => o.label),
    ...(question.statements ?? []).map((s) => s.label),
  ].join(' ');

  const compareTarget = options?.doubleCheckText?.trim() || options?.referenceText?.trim();
  if (compareTarget) {
    const refNums = extractNumberTokens(compareTarget);
    const extNums = extractNumberTokens(fullExtractedText);
    const cmp = compareNumberMultisets(refNums, extNums);
    if (!cmp.match) {
      flags.add('numbers_mismatch');
      numberMismatch = {missing: cmp.missing, extra: cmp.extra};
    }
  }

  // (c) Symbol signature comparison against double-read (when provided)
  let symbolMismatch: string[] | undefined;
  if (options?.doubleCheckText?.trim()) {
    const refSig = extractSymbolSignature(options.doubleCheckText);
    const extSig = extractSymbolSignature(fullExtractedText);
    const diffs = compareSymbolSignatures(refSig, extSig);
    if (diffs.length > 0) {
      flags.add('symbols_mismatch');
      symbolMismatch = diffs;
    }
  }

  // (d) Deterministic solver verification
  const solverRes = verifyQuestionWithSolvers(question);
  if (solverRes.verified_by_code === 'fail') {
    flags.add('answer_mismatch');
  }

  // Propagate cut-off flag to formula_split if stem ends/starts abruptly with math
  if (
    (question.flags ?? []).includes('cut_off_at_page_end') ||
    (question.flags ?? []).includes('cut_off_at_page_start')
  ) {
    flags.add('formula_split');
  }

  const blockingFlagList: MathFlag[] = [
    'unbalanced_dollar',
    'latex_syntax_error',
    'numbers_mismatch',
    'symbols_mismatch',
    'answer_mismatch',
    'formula_split',
  ];
  const hasBlocking = blockingFlagList.some((f) => flags.has(f));

  return {
    passed: !hasBlocking && syntaxErrors.length === 0 && solverRes.verified_by_code !== 'fail',
    flags: Array.from(flags),
    syntaxErrors,
    numberMismatch,
    symbolMismatch,
    solverStatus: solverRes.verified_by_code,
    solverNote: solverRes.code_verification?.note_vi,
  };
}

/**
 * Checks whether a QuestionItem contains any math notation (requiring eye-check `math_verified`).
 */
export function questionContainsMath(q: QuestionItem): boolean {
  const combined = [
    q.stem_vi,
    ...(q.options ?? []).map((o) => o.label),
    ...(q.statements ?? []).map((s) => s.label),
    q.solution_vi ?? '',
  ].join(' ');
  return /\$|\\(?:sin|cos|tan|cot|sqrt|frac|dfrac|widehat|triangle|perp|approx)|[°∠√²³]/.test(combined);
}

/**
 * Converts LaTeX / math text to accessible Vietnamese speech text for screen readers (`aria-label`).
 */
export function mathToVietnameseSpeech(input: string): string {
  const split = splitMath(input);
  if (split.error) return input;
  return split.segments
    .map((seg) => {
      if (seg.type === 'text') return seg.value;
      return seg.value
        .replace(/\\d?frac\{([^}]+)\}\{([^}]+)\}/g, 'phân số $1 trên $2')
        .replace(/\\sqrt\{([^}]+)\}/g, 'căn bậc hai của $1')
        .replace(/\\widehat\{([^}]+)\}/g, 'góc $1')
        .replace(/\\overrightarrow\{([^}]+)\}/g, 'vectơ $1')
        .replace(/\\triangle\s*/g, 'tam giác ')
        .replace(/\\perp/g, ' vuông góc với ')
        .replace(/\\parallel/g, ' song song với ')
        .replace(/\\approx/g, ' xấp xỉ ')
        .replace(/\\le/g, ' nhỏ hơn hoặc bằng ')
        .replace(/\\ge/g, ' lớn hơn hoặc bằng ')
        .replace(/\\ne/g, ' khác ')
        .replace(/\\cdot/g, ' nhân ')
        .replace(/\\sin/g, 'sin ')
        .replace(/\\cos/g, 'cos ')
        .replace(/\\tan/g, 'tan ')
        .replace(/\\cot/g, 'cot ')
        .replace(/\\pi/g, 'pi')
        .replace(/\\alpha/g, 'an-pha')
        .replace(/\\beta/g, 'bê-ta')
        .replace(/\^\s*\\circ/g, ' độ')
        .replace(/\^2/g, ' bình phương')
        .replace(/\^3/g, ' lập phương')
        .replace(/\{,\}/g, ' phẩy ')
        .replace(/\\mathrm\{m\}/g, ' mét')
        .replace(/\\mathrm\{km\}/g, ' ki-lô-mét')
        .replace(/\\mathrm\{cm\}/g, ' xăng-ti-mét')
        .replace(/\\ /g, ' ')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// SAFE DEGREE-MODE MATH EXPRESSION EVALUATOR (NO eval() — Section 8)
// ============================================================================

export interface SafeExpressionEvalResult {
  valid: boolean;
  value?: number;
  unit?: string;
  previewLatex: string;
  readAs_vi: string;
  error_vi?: string;
}

type ExprToken =
  | {kind: 'num'; val: number; raw: string}
  | {kind: 'ident'; name: string}
  | {kind: 'op'; op: '+' | '-' | '*' | '/' | '^'}
  | {kind: 'lparen'}
  | {kind: 'rparen'};

function tokenizeExpression(expr: string): {tokens: ExprToken[]; error?: string} {
  const s = expr
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/:/g, '/')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/°/g, '')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');

  const tokens: ExprToken[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let raw = '';
      let dots = 0;
      while (i < s.length && (/\d/.test(s[i]) || s[i] === '.')) {
        if (s[i] === '.') dots += 1;
        raw += s[i];
        i += 1;
      }
      if (dots > 1 || raw === '.') return {tokens: [], error: `Số không hợp lệ: "${raw}"`};
      tokens.push({kind: 'num', val: Number(raw), raw});
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let name = '';
      while (i < s.length && /[a-zA-Z]/.test(s[i])) {
        name += s[i];
        i += 1;
      }
      const lower = name.toLowerCase();
      // Support shorthand `sin60` / `cos30` -> `sin` + implicit arg `60`
      if (['sin', 'cos', 'tan', 'cot', 'tg', 'cotg', 'sqrt', 'pi', 'abs'].includes(lower)) {
        tokens.push({kind: 'ident', name: lower});
        continue;
      }
      return {tokens: [], error: `Ký hiệu chưa hỗ trợ khi tính giá trị: "${name}"`};
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({kind: 'op', op: ch});
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({kind: 'lparen'});
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({kind: 'rparen'});
      i += 1;
      continue;
    }
    return {tokens: [], error: `Ký tự không hợp lệ trong biểu thức: "${ch}"`};
  }

  // Insert implicit multiplication (e.g. `60sin(60)` -> `60*sin(60)`, `2(3+4)` -> `2*(3+4)`, `2pi` -> `2*pi`)
  const expanded: ExprToken[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx];
    const prev = expanded[expanded.length - 1];
    if (prev) {
      const prevIsVal = prev.kind === 'num' || prev.kind === 'rparen' || (prev.kind === 'ident' && prev.name === 'pi');
      const curStartsVal = cur.kind === 'lparen' || cur.kind === 'ident' || cur.kind === 'num';
      if (prevIsVal && curStartsVal) {
        expanded.push({kind: 'op', op: '*'});
      }
    }
    expanded.push(cur);
  }
  return {tokens: expanded};
}

/**
 * Safe recursive-descent math expression evaluator in DEGREE mode (ZERO `eval`/`Function`).
 * Supports `+ - * / ^`, parentheses, `sin cos tan cot tg cotg` (in degrees!), `sqrt`, `√`, `π/pi`, Vietnamese comma decimals, and optional trailing unit (`m`, `cm`, `km`, `m²`, `°`).
 */
export function evaluateSafeDegreeExpression(rawInput: string): SafeExpressionEvalResult {
  const trimmed = String(rawInput ?? '').trim();
  if (!trimmed) {
    return {valid: false, previewLatex: '', readAs_vi: '', error_vi: 'Chưa nhập biểu thức.'};
  }

  // Extract optional trailing measurement unit ONLY when separated cleanly (e.g. "55,3 m", "60*sin(60)/sin(70) m")
  let unit: string | undefined;
  let exprBody = trimmed;
  const trailingUnitMatch = exprBody.match(/\s+(km|cm|dm|mm|m²|m\^2|m|độ|do|deg|°)$/i);
  if (trailingUnitMatch) {
    unit = trailingUnitMatch[1];
    exprBody = exprBody.slice(0, trailingUnitMatch.index).trim();
  }

  const {tokens, error: tokErr} = tokenizeExpression(exprBody);
  if (tokErr || tokens.length === 0) {
    return {
      valid: false,
      previewLatex: '',
      readAs_vi: exprBody,
      error_vi: tokErr ?? 'Biểu thức không hợp lệ.',
    };
  }

  let pos = 0;
  const peek = (): ExprToken | undefined => tokens[pos];
  const consume = (): ExprToken => tokens[pos++];

  const parseAddSub = (): {val: number; latex: string} => {
    let left = parseMulDiv();
    while (peek()?.kind === 'op' && ((peek() as {op: string}).op === '+' || (peek() as {op: string}).op === '-')) {
      const op = (consume() as {op: '+' | '-'}).op;
      const right = parseMulDiv();
      left = {
        val: op === '+' ? left.val + right.val : left.val - right.val,
        latex: `${left.latex}${op}${right.latex}`,
      };
    }
    return left;
  };

  const parseMulDiv = (): {val: number; latex: string} => {
    let left = parsePower();
    while (peek()?.kind === 'op' && ((peek() as {op: string}).op === '*' || (peek() as {op: string}).op === '/')) {
      const op = (consume() as {op: '*' | '/'}).op;
      const right = parsePower();
      if (op === '/') {
        if (Math.abs(right.val) < 1e-12) throw new Error('Phép chia cho 0 không xác định.');
        left = {
          val: left.val / right.val,
          latex: `\\dfrac{${left.latex}}{${right.latex}}`,
        };
      } else {
        left = {
          val: left.val * right.val,
          latex: `${left.latex}\\cdot ${right.latex}`,
        };
      }
    }
    return left;
  };

  const parsePower = (): {val: number; latex: string} => {
    const base = parseUnary();
    if (peek()?.kind === 'op' && (peek() as {op: string}).op === '^') {
      consume();
      const exp = parsePower();
      return {
        val: Math.pow(base.val, exp.val),
        latex: `{${base.latex}}^{${exp.latex}}`,
      };
    }
    return base;
  };

  const parseUnary = (): {val: number; latex: string} => {
    if (peek()?.kind === 'op' && (peek() as {op: string}).op === '-') {
      consume();
      const inner = parseUnary();
      return {val: -inner.val, latex: `-${inner.latex}`};
    }
    if (peek()?.kind === 'op' && (peek() as {op: string}).op === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = (): {val: number; latex: string} => {
    const tok = peek();
    if (!tok) throw new Error('Thiếu giá trị ở cuối biểu thức.');

    if (tok.kind === 'num') {
      consume();
      return {val: tok.val, latex: tok.raw.replace('.', '{,}')};
    }

    if (tok.kind === 'lparen') {
      consume();
      const inner = parseAddSub();
      if (peek()?.kind !== 'rparen') throw new Error('Thiếu dấu ngoặc đóng `)`.');
      consume();
      return {val: inner.val, latex: `\\left(${inner.latex}\\right)`};
    }

    if (tok.kind === 'ident') {
      consume();
      if (tok.name === 'pi') return {val: Math.PI, latex: '\\pi'};

      // Function call: allow either `sin(60)` or shorthand `sin60`
      let arg: {val: number; latex: string};
      let hadParens = false;
      if (peek()?.kind === 'lparen') {
        hadParens = true;
        consume();
        arg = parseAddSub();
        if (peek()?.kind !== 'rparen') throw new Error(`Thiếu dấu ngoặc đóng sau ${tok.name}(.`);
        consume();
      } else {
        arg = parseUnary();
      }

      const rad = (arg.val * Math.PI) / 180;
      if (tok.name === 'sin') {
        return {
          val: Math.sin(rad),
          latex: hadParens ? `\\sin\\left(${arg.latex}^\\circ\\right)` : `\\sin ${arg.latex}^\\circ`,
        };
      }
      if (tok.name === 'cos') {
        return {
          val: Math.cos(rad),
          latex: hadParens ? `\\cos\\left(${arg.latex}^\\circ\\right)` : `\\cos ${arg.latex}^\\circ`,
        };
      }
      if (tok.name === 'tan' || tok.name === 'tg') {
        if (Math.abs(Math.cos(rad)) < 1e-10) throw new Error('Giá trị tan không xác định tại góc 90°.');
        return {
          val: Math.tan(rad),
          latex: hadParens ? `\\tan\\left(${arg.latex}^\\circ\\right)` : `\\tan ${arg.latex}^\\circ`,
        };
      }
      if (tok.name === 'cot' || tok.name === 'cotg') {
        if (Math.abs(Math.sin(rad)) < 1e-10) throw new Error('Giá trị cot không xác định tại góc 0° hoặc 180°.');
        return {
          val: Math.cos(rad) / Math.sin(rad),
          latex: hadParens ? `\\cot\\left(${arg.latex}^\\circ\\right)` : `\\cot ${arg.latex}^\\circ`,
        };
      }
      if (tok.name === 'sqrt') {
        if (arg.val < 0) throw new Error('Không thể lấy căn bậc hai của số âm.');
        return {val: Math.sqrt(arg.val), latex: `\\sqrt{${arg.latex}}`};
      }
      if (tok.name === 'abs') {
        return {val: Math.abs(arg.val), latex: `\\left|${arg.latex}\\right|`};
      }
    }

    throw new Error('Cú pháp biểu thức chưa hợp lệ.');
  };

  try {
    const out = parseAddSub();
    if (pos < tokens.length) {
      throw new Error('Còn ký tự dư ở cuối biểu thức.');
    }
    if (!Number.isFinite(out.val)) {
      throw new Error('Kết quả không phải là số hữu hạn.');
    }
    const unitLatex = unit
      ? unit === '°' || /^(?:độ|do|deg)$/i.test(unit)
        ? '^\\circ'
        : `\\ \\mathrm{${unit.replace('²', '').replace('^2', '')}}${/[²^]/.test(unit) ? '^2' : ''}`
      : '';
    return {
      valid: true,
      value: out.val,
      unit,
      previewLatex: `$${out.latex}${unitLatex}$`,
      readAs_vi: `${out.latex}${unit ? ` ${unit}` : ''} ≈ ${formatVi(out.val, 4)}`,
    };
  } catch (err) {
    return {
      valid: false,
      previewLatex: '',
      readAs_vi: exprBody,
      error_vi: err instanceof Error ? err.message : 'Biểu thức chưa hợp lệ.',
    };
  }
}

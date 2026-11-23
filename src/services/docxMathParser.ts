import mammoth from 'mammoth';

export interface DocxMathParseResult {
  text: string;
  ommlCount: number;
  oleObjectCount: number;
  imageCount: number;
  hasMissingMathTypeEquations: boolean;
  warning_vi?: string;
}

interface ZipEntryMeta {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/**
 * Minimal, zero-dependency ZIP central-directory reader for .docx files in the browser.
 */
function listZipEntries(bytes: Uint8Array): ZipEntryMeta[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Locate End of Central Directory (0x06054b50) scanning backwards (up to 65 KB comment)
  const minOffset = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return [];

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntryMeta[] = [];

  for (let i = 0; i < totalEntries && offset + 46 <= bytes.length; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntryText(bytes: Uint8Array, entry: ZipEntryMeta): Promise<string | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lh = entry.localHeaderOffset;
  if (lh + 30 > bytes.length || view.getUint32(lh, true) !== 0x04034b50) return null;
  const nameLen = view.getUint16(lh + 26, true);
  const extraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + nameLen + extraLen;
  const raw = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return new TextDecoder('utf-8').decode(raw);
  }
  if (entry.compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    void writer.write(new Uint8Array(raw));
    void writer.close();
    const outBuf = await new Response(ds.readable).arrayBuffer();
    return new TextDecoder('utf-8').decode(outBuf);
  }
  return null;
}

function getLocalName(node: Element): string {
  return node.localName || node.nodeName.replace(/^[^:]+:/, '');
}

function getDirectChild(parent: Element, localName: string): Element | null {
  for (let i = 0; i < parent.children.length; i++) {
    const ch = parent.children[i];
    if (getLocalName(ch) === localName) return ch;
  }
  return null;
}

function getDirectChildren(parent: Element, localName: string): Element[] {
  const list: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const ch = parent.children[i];
    if (getLocalName(ch) === localName) list.push(ch);
  }
  return list;
}

function normalizeOmmlTextToken(raw: string): string {
  return raw
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '\\cdot ')
    .replace(/·/g, '\\cdot ')
    .replace(/°/g, '^\\circ')
    .replace(/≈/g, '\\approx ')
    .replace(/≤/g, '\\le ')
    .replace(/≥/g, '\\ge ')
    .replace(/≠/g, '\\ne ')
    .replace(/⊥/g, '\\perp ')
    .replace(/∥/g, '\\parallel ')
    .replace(/△|Δ/g, '\\triangle ')
    .replace(/∠/g, '\\angle ')
    .replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ')
    .replace(/γ/g, '\\gamma ')
    .replace(/π/g, '\\pi ')
    .replace(/∞/g, '\\infty ')
    .replace(/±/g, '\\pm ')
    .replace(/(\d),(\d)/g, '$1{,}$2');
}

/**
 * Recursively converts a Word OMML (`<m:oMath>`) XML node into clean KaTeX-compatible LaTeX.
 */
function ommlNodeToLatex(node: Element): string {
  const tag = getLocalName(node);

  switch (tag) {
    case 't': {
      return normalizeOmmlTextToken(node.textContent ?? '');
    }

    case 'f': {
      const num = getDirectChild(node, 'num');
      const den = getDirectChild(node, 'den');
      const numTex = num ? ommlChildrenToLatex(num).trim() : '';
      const denTex = den ? ommlChildrenToLatex(den).trim() : '';
      return `\\dfrac{${numTex}}{${denTex}}`;
    }

    case 'rad': {
      const deg = getDirectChild(node, 'deg');
      const base = getDirectChild(node, 'e');
      const degTex = deg ? ommlChildrenToLatex(deg).trim() : '';
      const baseTex = base ? ommlChildrenToLatex(base).trim() : '';
      return degTex ? `\\sqrt[${degTex}]{${baseTex}}` : `\\sqrt{${baseTex}}`;
    }

    case 'sSup': {
      const e = getDirectChild(node, 'e');
      const sup = getDirectChild(node, 'sup');
      const baseTex = e ? ommlChildrenToLatex(e).trim() : '';
      const supTex = sup ? ommlChildrenToLatex(sup).trim() : '';
      return `${baseTex}^{${supTex}}`;
    }

    case 'sSub': {
      const e = getDirectChild(node, 'e');
      const sub = getDirectChild(node, 'sub');
      const baseTex = e ? ommlChildrenToLatex(e).trim() : '';
      const subTex = sub ? ommlChildrenToLatex(sub).trim() : '';
      return `${baseTex}_{${subTex}}`;
    }

    case 'sSubSup': {
      const e = getDirectChild(node, 'e');
      const sub = getDirectChild(node, 'sub');
      const sup = getDirectChild(node, 'sup');
      const baseTex = e ? ommlChildrenToLatex(e).trim() : '';
      const subTex = sub ? ommlChildrenToLatex(sub).trim() : '';
      const supTex = sup ? ommlChildrenToLatex(sup).trim() : '';
      return `${baseTex}_{${subTex}}^{${supTex}}`;
    }

    case 'acc': {
      const pr = getDirectChild(node, 'accPr');
      const chrEl = pr ? getDirectChild(pr, 'chr') : null;
      const chr = chrEl?.getAttribute('m:val') ?? chrEl?.getAttribute('val') ?? '^';
      const e = getDirectChild(node, 'e');
      const inner = e ? ommlChildrenToLatex(e).trim() : '';
      if (chr === '→' || chr === '\u20D7') return `\\overrightarrow{${inner}}`;
      if (chr === '¯' || chr === '\u0304' || chr === '_') return `\\overline{${inner}}`;
      return `\\widehat{${inner}}`;
    }

    case 'bar': {
      const e = getDirectChild(node, 'e');
      const inner = e ? ommlChildrenToLatex(e).trim() : '';
      return `\\overline{${inner}}`;
    }

    case 'd': {
      const pr = getDirectChild(node, 'dPr');
      const begEl = pr ? getDirectChild(pr, 'begChr') : null;
      const endEl = pr ? getDirectChild(pr, 'endChr') : null;
      const beg = begEl?.getAttribute('m:val') ?? begEl?.getAttribute('val') ?? '(';
      const end = endEl?.getAttribute('m:val') ?? endEl?.getAttribute('val') ?? ')';
      const items = getDirectChildren(node, 'e').map((el) => ommlChildrenToLatex(el).trim());
      // System of equations (`{` with empty right delimiter)
      if (beg === '{' && (!end || end === ' ')) {
        return `\\begin{cases}${items.join(' \\\\ ')}\\end{cases}`;
      }
      const leftDelim = beg === '{' ? '\\{' : beg || '.';
      const rightDelim = end === '}' ? '\\}' : end || '.';
      return `\\left${leftDelim}${items.join(', ')}\\right${rightDelim}`;
    }

    case 'func': {
      const fName = getDirectChild(node, 'fName');
      const e = getDirectChild(node, 'e');
      const fnRaw = fName ? ommlChildrenToLatex(fName).trim().toLowerCase() : '';
      const argTex = e ? ommlChildrenToLatex(e).trim() : '';
      if (['sin', 'cos', 'tan', 'cot', 'log', 'ln', 'lim'].includes(fnRaw)) {
        return `\\${fnRaw} ${argTex}`;
      }
      if (fnRaw === 'tg') return `\\tan ${argTex}`;
      if (fnRaw === 'cotg') return `\\cot ${argTex}`;
      return `${fnRaw} ${argTex}`;
    }

    case 'm': {
      const rows = getDirectChildren(node, 'mr').map((mr) =>
        getDirectChildren(mr, 'e')
          .map((cell) => ommlChildrenToLatex(cell).trim())
          .join(' & '),
      );
      return rows.join(' \\\\ ');
    }

    case 'nary': {
      const pr = getDirectChild(node, 'naryPr');
      const chrEl = pr ? getDirectChild(pr, 'chr') : null;
      const chr = chrEl?.getAttribute('m:val') ?? chrEl?.getAttribute('val') ?? '∑';
      const sub = getDirectChild(node, 'sub');
      const sup = getDirectChild(node, 'sup');
      const e = getDirectChild(node, 'e');
      const op = chr === '∫' ? '\\int' : '\\sum';
      const subTex = sub ? `_{${ommlChildrenToLatex(sub).trim()}}` : '';
      const supTex = sup ? `^{${ommlChildrenToLatex(sup).trim()}}` : '';
      const bodyTex = e ? ommlChildrenToLatex(e).trim() : '';
      return `${op}${subTex}${supTex} ${bodyTex}`;
    }

    case 'fPr':
    case 'radPr':
    case 'sSupPr':
    case 'sSubPr':
    case 'sSubSupPr':
    case 'accPr':
    case 'dPr':
    case 'rPr':
    case 'mPr':
    case 'naryPr':
    case 'ctrlPr':
    case 'oMathParaPr':
      return '';

    default:
      return ommlChildrenToLatex(node);
  }
}

function ommlChildrenToLatex(parent: Element): string {
  let out = '';
  for (let i = 0; i < parent.children.length; i++) {
    out += ommlNodeToLatex(parent.children[i]);
  }
  return out;
}

/**
 * Extracts text AND Word OMML equations (`<m:oMath>`) as `$LaTeX$` from a `.docx` ArrayBuffer,
 * while accurately detecting embedded MathType OLE objects (`oleObject*.bin`) that mammoth silently strips.
 */
export async function parseDocxWithMath(arrayBuffer: ArrayBuffer): Promise<DocxMathParseResult> {
  const bytes = new Uint8Array(arrayBuffer.slice(0));
  let ommlCount = 0;
  let oleObjectCount = 0;
  let imageCount = 0;

  try {
    const entries = listZipEntries(bytes);
    const docEntry = entries.find((e) => e.name === 'word/document.xml');
    const embeddingCount = entries.filter((e) => /^word\/embeddings\//i.test(e.name)).length;
    imageCount = entries.filter((e) => /^word\/media\//i.test(e.name)).length;

    if (docEntry && typeof DOMParser !== 'undefined') {
      const xmlText = await readZipEntryText(bytes, docEntry);
      if (xmlText) {
        const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        const parseErr = doc.getElementsByTagName('parsererror')[0];
        if (!parseErr) {
          const paragraphs = Array.from(doc.getElementsByTagName('*')).filter(
            (el) => getLocalName(el) === 'p',
          );
          const lines: string[] = [];

          const walkInline = (el: Element): string => {
            const tag = getLocalName(el);
            if (tag === 't') return el.textContent ?? '';
            if (tag === 'tab') return ' ';
            if (tag === 'br' || tag === 'cr') return '\n';
            if (tag === 'oMathPara') {
              ommlCount += 1;
              const inner = ommlChildrenToLatex(el).replace(/\s{2,}/g, ' ').trim();
              return inner ? ` $$${inner}$$ ` : '';
            }
            if (tag === 'oMath') {
              ommlCount += 1;
              const inner = ommlChildrenToLatex(el).replace(/\s{2,}/g, ' ').trim();
              return inner ? ` $${inner}$ ` : '';
            }
            if (tag === 'object' || tag === 'OLEObject') {
              oleObjectCount += 1;
              return ' [CÔNG_THỨC_MATHTYPE] ';
            }
            if (tag === 'pPr' || tag === 'rPr' || tag === 'fldChar' || tag === 'instrText' || tag === 'txbxContent') {
              return '';
            }
            let buf = '';
            for (let i = 0; i < el.children.length; i++) {
              buf += walkInline(el.children[i]);
            }
            return buf;
          };

          for (const p of paragraphs) {
            // Skip nested paragraphs inside math/drawing textboxes already walked? Walk top-level body & table cells
            const line = walkInline(p)
              .replace(/[ \t]{2,}/g, ' ')
              .trim();
            if (line) lines.push(line);
          }

          oleObjectCount = Math.max(oleObjectCount, embeddingCount);
          const text = lines.join('\n').trim();
          const hasMissingMathTypeEquations = oleObjectCount > 0 && ommlCount === 0;
          const warning_vi = hasMissingMathTypeEquations
            ? `Phát hiện ${oleObjectCount} công thức MathType dạng đối tượng nhúng (OLE) trong tệp Word — Word không lưu văn bản cho MathType nên vị trí công thức sẽ bị trống ([CÔNG_THỨC_MATHTYPE]). Để trích xuất chính xác 100% công thức & hình vẽ: mở tệp Word → Lưu thành PDF (File → Save As → PDF) rồi tải tệp PDF lên mục 1!`
            : undefined;

          if (text.length > 0) {
            return {
              text,
              ommlCount,
              oleObjectCount,
              imageCount,
              hasMissingMathTypeEquations,
              warning_vi,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[docxMathParser] Falling back to mammoth:', err);
  }

  // Fallback to mammoth if XML/ZIP decompression failed
  const res = await mammoth.extractRawText({arrayBuffer});
  const raw = res.value.trim();
  // Detect suspicious empty formula gaps like "Tam giác  có  và ." or "A. . B. ."
  const gapMatches = raw.match(/(?:^|\s)[A-D]\.\s*\./g) ?? [];
  const hasGaps = gapMatches.length >= 2;
  return {
    text: raw,
    ommlCount: 0,
    oleObjectCount: hasGaps ? gapMatches.length : 0,
    imageCount,
    hasMissingMathTypeEquations: hasGaps,
    warning_vi: hasGaps
      ? 'Tệp Word này có nhiều công thức MathType/ảnh nhúng bị trống khi tách chữ. Hãy lưu tệp Word thành PDF (File → Save As → PDF) rồi tải PDF lên để AI đọc trực tiếp từ ảnh trang!'
      : undefined,
  };
}

import mammoth from 'mammoth';
import {decodeMathTypeOleToLatex, decodeMathTypeWmfToLatex} from './mathtypeDecoder.ts';

export interface DocxEmbeddedImage {
  index: number; // 1-based index matching [HÌNH_VẼ_k] marker in extracted text
  id: string;
  fileName: string;
  dataUrl: string;
  mimeType: string;
  approxBytes: number;
}

export interface DocxMathParseResult {
  text: string;
  ommlCount: number;
  oleObjectCount: number;
  oleDecodedCount: number;
  imageCount: number;
  embeddedImages: DocxEmbeddedImage[];
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

async function readZipEntryBytes(bytes: Uint8Array, entry: ZipEntryMeta): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lh = entry.localHeaderOffset;
  if (lh + 30 > bytes.length || view.getUint32(lh, true) !== 0x04034b50) return null;
  const nameLen = view.getUint16(lh + 26, true);
  const extraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + nameLen + extraLen;
  const raw = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return raw.slice();
  }
  if (entry.compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    void writer.write(new Uint8Array(raw));
    void writer.close();
    const outBuf = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(outBuf);
  }
  return null;
}

async function readZipEntryText(bytes: Uint8Array, entry: ZipEntryMeta): Promise<string | null> {
  const raw = await readZipEntryBytes(bytes, entry);
  return raw ? new TextDecoder('utf-8').decode(raw) : null;
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

function getAttrByLocalName(el: Element, localName: string): string | null {
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    const ln = a.localName || a.name.replace(/^[^:]+:/, '');
    if (ln === localName) return a.value;
  }
  return null;
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

function ommlNodeToLatex(node: Element): string {
  const tag = getLocalName(node);

  switch (tag) {
    case 't':
      return normalizeOmmlTextToken(node.textContent ?? '');

    case 'f': {
      const num = getDirectChild(node, 'num');
      const den = getDirectChild(node, 'den');
      return `\\dfrac{${num ? ommlChildrenToLatex(num).trim() : ''}}{${den ? ommlChildrenToLatex(den).trim() : ''}}`;
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
      return `${e ? ommlChildrenToLatex(e).trim() : ''}^{${sup ? ommlChildrenToLatex(sup).trim() : ''}}`;
    }

    case 'sSub': {
      const e = getDirectChild(node, 'e');
      const sub = getDirectChild(node, 'sub');
      return `${e ? ommlChildrenToLatex(e).trim() : ''}_{${sub ? ommlChildrenToLatex(sub).trim() : ''}}`;
    }

    case 'sSubSup': {
      const e = getDirectChild(node, 'e');
      const sub = getDirectChild(node, 'sub');
      const sup = getDirectChild(node, 'sup');
      return `${e ? ommlChildrenToLatex(e).trim() : ''}_{${sub ? ommlChildrenToLatex(sub).trim() : ''}}^{${sup ? ommlChildrenToLatex(sup).trim() : ''}}`;
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
      return `\\overline{${e ? ommlChildrenToLatex(e).trim() : ''}}`;
    }

    case 'd': {
      const pr = getDirectChild(node, 'dPr');
      const begEl = pr ? getDirectChild(pr, 'begChr') : null;
      const endEl = pr ? getDirectChild(pr, 'endChr') : null;
      const beg = begEl?.getAttribute('m:val') ?? begEl?.getAttribute('val') ?? '(';
      const end = endEl?.getAttribute('m:val') ?? endEl?.getAttribute('val') ?? ')';
      const items = getDirectChildren(node, 'e').map((el) => ommlChildrenToLatex(el).trim());
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

function mimeTypeFromMediaPath(path: string): string | null {
  const low = path.toLowerCase();
  if (low.endsWith('.png')) return 'image/png';
  if (low.endsWith('.jpg') || low.endsWith('.jpeg')) return 'image/jpeg';
  if (low.endsWith('.webp')) return 'image/webp';
  if (low.endsWith('.gif')) return 'image/gif';
  if (low.endsWith('.bmp')) return 'image/bmp';
  if (low.endsWith('.svg')) return 'image/svg+xml';
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Compresses any extracted raster/SVG image bytes into a crisp <= 140 KB white-backed JPEG/PNG dataURL
 * suitable for student display on mobile & Supabase payload persistence.
 */
export async function compressImageBytesToDataUrl(
  rawBytes: Uint8Array,
  mimeType: string,
  maxBytes = 140 * 1024,
  maxWidth = 760,
): Promise<{dataUrl: string; approxBytes: number}> {
  const rawDataUrl = `data:${mimeType};base64,${bytesToBase64(rawBytes)}`;
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {dataUrl: rawDataUrl, approxBytes: rawBytes.length};
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
        const w = Math.max(24, Math.round(img.naturalWidth * scale));
        const h = Math.max(24, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({dataUrl: rawDataUrl, approxBytes: rawBytes.length});
          return;
        }
        // Clean white backdrop so transparent PNG line-art diagrams always have crisp contrast
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        let quality = 0.88;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let approxBytes = Math.round((dataUrl.length * 3) / 4);
        while (approxBytes > maxBytes && quality > 0.45) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          approxBytes = Math.round((dataUrl.length * 3) / 4);
        }
        resolve({dataUrl, approxBytes});
      } catch {
        resolve({dataUrl: rawDataUrl, approxBytes: rawBytes.length});
      }
    };
    img.onerror = () => resolve({dataUrl: rawDataUrl, approxBytes: rawBytes.length});
    img.src = rawDataUrl;
  });
}

function normalizeRelTarget(target: string): string {
  const clean = target.replace(/^\/+/, '').replace(/^\.\.\//, '');
  return clean.startsWith('word/') ? clean : `word/${clean}`;
}

/**
 * Extracts text, Word OMML equations (`<m:oMath>`), decoded MathType OLE equations (`oleObject*.bin`),
 * AND embedded diagram images (`word/media/*` referenced by `<w:drawing>` / non-OLE `<w:pict>`)
 * directly from a `.docx` ArrayBuffer in the browser.
 */
export async function parseDocxWithMath(arrayBuffer: ArrayBuffer): Promise<DocxMathParseResult> {
  const bytes = new Uint8Array(arrayBuffer.slice(0));
  let ommlCount = 0;
  let oleObjectCount = 0;
  let oleDecodedCount = 0;
  let imageCount = 0;
  const embeddedImages: DocxEmbeddedImage[] = [];

  try {
    const entries = listZipEntries(bytes);
    const entryByName = new Map<string, ZipEntryMeta>();
    for (const e of entries) {
      entryByName.set(e.name.toLowerCase(), e);
    }

    const docEntry = entryByName.get('word/document.xml');
    const relsEntry = entryByName.get('word/_rels/document.xml.rels');
    const embeddingCount = entries.filter((e) => /^word\/embeddings\//i.test(e.name)).length;
    imageCount = entries.filter((e) => /^word\/media\//i.test(e.name)).length;

    // 1. Parse document relationships (`rId -> word/media/...` or `word/embeddings/...`)
    const relMap = new Map<string, string>();
    if (relsEntry && typeof DOMParser !== 'undefined') {
      const relsXml = await readZipEntryText(bytes, relsEntry);
      if (relsXml) {
        const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
        const relEls = Array.from(relsDoc.getElementsByTagName('*')).filter(
          (el) => getLocalName(el) === 'Relationship',
        );
        for (const rel of relEls) {
          const id = rel.getAttribute('Id');
          const target = rel.getAttribute('Target');
          if (id && target) {
            relMap.set(id, normalizeRelTarget(target));
          }
        }
      }
    }

    // 2. Pre-decode all MathType / Equation 3.0 OLE binaries (`word/embeddings/*`) AND WMF comment fallbacks (`word/media/*.wmf`)
    const decodedOleByTarget = new Map<string, string>();
    for (const e of entries) {
      if (/^word\/embeddings\//i.test(e.name)) {
        const oleRaw = await readZipEntryBytes(bytes, e);
        if (!oleRaw) continue;
        const latex = decodeMathTypeOleToLatex(oleRaw);
        if (latex) {
          decodedOleByTarget.set(e.name.toLowerCase(), latex);
        }
      } else if (/^word\/media\/.+\.wmf$/i.test(e.name)) {
        const wmfRaw = await readZipEntryBytes(bytes, e);
        if (!wmfRaw) continue;
        const latex = decodeMathTypeWmfToLatex(wmfRaw);
        if (latex) {
          decodedOleByTarget.set(e.name.toLowerCase(), latex);
        }
      }
    }

    // 3. Pre-load & compress browser-renderable diagram images (`word/media/*.png|jpg|jpeg|webp|gif|bmp|svg`)
    const compressedImageByTarget = new Map<string, {dataUrl: string; mimeType: string; approxBytes: number; fileName: string}>();
    for (const e of entries) {
      if (!/^word\/media\//i.test(e.name)) continue;
      const mime = mimeTypeFromMediaPath(e.name);
      if (!mime) continue; // skip WMF/EMF previews used only by MathType OLE
      const imgBytes = await readZipEntryBytes(bytes, e);
      if (!imgBytes || imgBytes.length < 120) continue;
      const compressed = await compressImageBytesToDataUrl(imgBytes, mime);
      compressedImageByTarget.set(e.name.toLowerCase(), {
        dataUrl: compressed.dataUrl,
        mimeType: mime,
        approxBytes: compressed.approxBytes,
        fileName: e.name.split('/').pop() || e.name,
      });
    }

    const assignedImageIndexByTarget = new Map<string, number>();
    const registerDiagramTarget = (targetPath: string): number | null => {
      const key = targetPath.toLowerCase();
      const media = compressedImageByTarget.get(key);
      if (!media) return null;
      const existingIdx = assignedImageIndexByTarget.get(key);
      if (existingIdx) return existingIdx;
      const nextIdx = embeddedImages.length + 1;
      assignedImageIndexByTarget.set(key, nextIdx);
      embeddedImages.push({
        index: nextIdx,
        id: `docx_img_${nextIdx}`,
        fileName: media.fileName,
        dataUrl: media.dataUrl,
        mimeType: media.mimeType,
        approxBytes: media.approxBytes,
      });
      return nextIdx;
    };

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

          const findDescendant = (root: Element, targetTag: string): Element | null => {
            const all = root.getElementsByTagName('*');
            for (let i = 0; i < all.length; i++) {
              if (getLocalName(all[i]) === targetTag) return all[i];
            }
            return null;
          };

          const tryDecodeOleContainer = (container: Element): string | null => {
            const oleEl = findDescendant(container, 'OLEObject');
            const rId = oleEl ? getAttrByLocalName(oleEl, 'id') : null;
            const target = rId ? relMap.get(rId) : undefined;
            const decodedFromOle = target ? decodedOleByTarget.get(target.toLowerCase()) : undefined;
            if (decodedFromOle) return decodedFromOle;

            // Fallback: check `<v:imagedata r:id="..."/>` pointing to a MathType `.wmf` preview
            const imgData = findDescendant(container, 'imagedata');
            const imgRId = imgData ? getAttrByLocalName(imgData, 'id') : null;
            const imgTarget = imgRId ? relMap.get(imgRId) : undefined;
            const decodedFromWmf = imgTarget ? decodedOleByTarget.get(imgTarget.toLowerCase()) : undefined;
            return decodedFromWmf ?? null;
          };

          const walkInline = (el: Element): string => {
            const tag = getLocalName(el);
            if (tag === 't') return el.textContent ?? '';
            if (tag === 'tab') return ' ';
            if (tag === 'br' || tag === 'cr') return '\n';
            if (tag === 'AlternateContent') {
              // Walk <mc:Choice> only if present to avoid duplicating equations/drawings in <mc:Fallback>
              const choice = getDirectChild(el, 'Choice');
              if (choice) return walkInline(choice);
            }
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
            if (tag === 'object') {
              oleObjectCount += 1;
              const decoded = tryDecodeOleContainer(el);
              if (decoded) {
                oleDecodedCount += 1;
                return ` $${decoded}$ `;
              }
              return ' [CÔNG_THỨC_MATHTYPE] ';
            }
            if (tag === 'drawing') {
              const blip = findDescendant(el, 'blip');
              const rId = blip ? getAttrByLocalName(blip, 'embed') || getAttrByLocalName(blip, 'link') : null;
              const target = rId ? relMap.get(rId) : undefined;
              if (target) {
                const idx = registerDiagramTarget(target);
                if (idx) return ` [HÌNH_VẼ_${idx}] `;
              }
              return '';
            }
            if (tag === 'pict') {
              if (findDescendant(el, 'OLEObject')) {
                oleObjectCount += 1;
                const decoded = tryDecodeOleContainer(el);
                if (decoded) {
                  oleDecodedCount += 1;
                  return ` $${decoded}$ `;
                }
                return ' [CÔNG_THỨC_MATHTYPE] ';
              }
              const imgData = findDescendant(el, 'imagedata');
              const rId = imgData ? getAttrByLocalName(imgData, 'id') : null;
              const target = rId ? relMap.get(rId) : undefined;
              if (target) {
                // Might also be a standalone MathType WMF equation pasted without OLEObject!
                const wmfLatex = decodedOleByTarget.get(target.toLowerCase());
                if (wmfLatex) {
                  oleObjectCount += 1;
                  oleDecodedCount += 1;
                  return ` $${wmfLatex}$ `;
                }
                const idx = registerDiagramTarget(target);
                if (idx) return ` [HÌNH_VẼ_${idx}] `;
              }
              return '';
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
            const line = walkInline(p)
              .replace(/[ \t]{2,}/g, ' ')
              .trim();
            if (line) lines.push(line);
          }

          // Catch any unreferenced raster images in word/media/ that weren't inside a walked drawing tag
          for (const [targetKey] of compressedImageByTarget.entries()) {
            if (!assignedImageIndexByTarget.has(targetKey)) {
              registerDiagramTarget(targetKey);
            }
          }

          oleObjectCount = Math.max(oleObjectCount, embeddingCount);
          const text = lines.join('\n').trim();
          const undecodedCount = Math.max(0, oleObjectCount - oleDecodedCount);
          const hasMissingMathTypeEquations = undecodedCount > 0 && text.includes('[CÔNG_THỨC_MATHTYPE]');
          const warning_vi = hasMissingMathTypeEquations
            ? `Đã giải mã được ${oleDecodedCount}/${oleObjectCount} công thức MathType, còn ${undecodedCount} công thức chưa đọc rõ ([CÔNG_THỨC_MATHTYPE]). Để đạt độ chính xác 100%, thầy/cô có thể lưu tệp Word thành PDF (File → Save As → PDF) rồi tải PDF lên mục 1.`
            : undefined;

          if (text.length > 0) {
            return {
              text,
              ommlCount,
              oleObjectCount,
              oleDecodedCount,
              imageCount: embeddedImages.length || imageCount,
              embeddedImages,
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
  const gapMatches = raw.match(/(?:^|\s)[A-D]\.\s*\./g) ?? [];
  const hasGaps = gapMatches.length >= 2;
  return {
    text: raw,
    ommlCount: 0,
    oleObjectCount: hasGaps ? gapMatches.length : 0,
    oleDecodedCount: 0,
    imageCount: embeddedImages.length || imageCount,
    embeddedImages,
    hasMissingMathTypeEquations: hasGaps,
    warning_vi: hasGaps
      ? 'Tệp Word này có nhiều công thức MathType/ảnh nhúng bị trống khi tách chữ. Hãy lưu tệp Word thành PDF (File → Save As → PDF) rồi tải PDF lên để AI đọc trực tiếp từ ảnh trang!'
      : undefined,
  };
}

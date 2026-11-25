/**
 * Pure-TypeScript OLE2 Compound Binary File (CFB) + MathType MTEF v5/v3 decoder.
 * Decodes `word/embeddings/oleObject*.bin` (`Equation Native` stream) inside `.docx` files
 * directly into clean KaTeX-compatible LaTeX in the browser — zero dependencies.
 */

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDOFCHAIN = 0xfffffffe;
const MAXREGSECT = 0xfffffffa;

function readRegularChain(
  bytes: Uint8Array,
  fat: Uint32Array,
  startSector: number,
  sectorSize: number,
  maxBytes: number,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let sec = startSector;
  let total = 0;
  const visited = new Set<number>();
  while (sec <= MAXREGSECT && !visited.has(sec) && total < maxBytes) {
    visited.add(sec);
    const offset = (sec + 1) * sectorSize;
    if (offset >= bytes.length) break;
    const take = Math.min(sectorSize, bytes.length - offset, maxBytes - total);
    chunks.push(bytes.subarray(offset, offset + take));
    total += take;
    if (sec >= fat.length) break;
    sec = fat[sec];
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function readMiniChain(
  miniStream: Uint8Array,
  miniFat: Uint32Array,
  startSector: number,
  miniSectorSize: number,
  streamSize: number,
): Uint8Array {
  const out = new Uint8Array(streamSize);
  let sec = startSector;
  let pos = 0;
  const visited = new Set<number>();
  while (sec <= MAXREGSECT && !visited.has(sec) && pos < streamSize) {
    visited.add(sec);
    const offset = sec * miniSectorSize;
    if (offset >= miniStream.length) break;
    const take = Math.min(miniSectorSize, miniStream.length - offset, streamSize - pos);
    out.set(miniStream.subarray(offset, offset + take), pos);
    pos += take;
    if (sec >= miniFat.length) break;
    sec = miniFat[sec];
  }
  return out.subarray(0, pos);
}

/**
 * Extracts the raw `Equation Native` stream from an OLE2 Compound File (`oleObject*.bin`).
 */
function extractEquationNativeStream(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 512) return null;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== CFB_MAGIC[i]) return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = view.getUint16(30, true);
  const miniSectorShift = view.getUint16(32, true);
  if (sectorShift < 7 || sectorShift > 16 || miniSectorShift < 4 || miniSectorShift > 12) return null;

  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;
  const firstDirSector = view.getUint32(48, true);
  const miniStreamCutoff = view.getUint32(56, true) || 4096;
  const firstMiniFatSector = view.getUint32(60, true);
  const numMiniFatSectors = view.getUint32(64, true);
  const firstDifatSector = view.getUint32(68, true);
  const numDifatSectors = view.getUint32(72, true);

  // Collect FAT sector IDs from header DIFAT (109 entries at offset 76) + extended DIFAT chain
  const fatSectorIds: number[] = [];
  for (let i = 0; i < 109; i++) {
    const sid = view.getUint32(76 + i * 4, true);
    if (sid <= MAXREGSECT) fatSectorIds.push(sid);
  }
  let difatSec = firstDifatSector;
  const visitedDifat = new Set<number>();
  for (let d = 0; d < numDifatSectors && difatSec <= MAXREGSECT && !visitedDifat.has(difatSec); d++) {
    visitedDifat.add(difatSec);
    const off = (difatSec + 1) * sectorSize;
    if (off + sectorSize > bytes.length) break;
    const entriesPerSec = sectorSize / 4 - 1;
    for (let i = 0; i < entriesPerSec; i++) {
      const sid = view.getUint32(off + i * 4, true);
      if (sid <= MAXREGSECT) fatSectorIds.push(sid);
    }
    difatSec = view.getUint32(off + entriesPerSec * 4, true);
  }

  // Assemble FAT table
  const fatEntriesPerSec = sectorSize / 4;
  const fat = new Uint32Array(fatSectorIds.length * fatEntriesPerSec);
  for (let i = 0; i < fatSectorIds.length; i++) {
    const off = (fatSectorIds[i] + 1) * sectorSize;
    if (off + sectorSize > bytes.length) continue;
    for (let j = 0; j < fatEntriesPerSec; j++) {
      fat[i * fatEntriesPerSec + j] = view.getUint32(off + j * 4, true);
    }
  }

  // Read Directory stream
  const dirBytes = readRegularChain(bytes, fat, firstDirSector, sectorSize, 256 * 1024);
  if (dirBytes.length < 128) return null;
  const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);

  let rootStart = ENDOFCHAIN;
  let rootSize = 0;
  let eqStart = ENDOFCHAIN;
  let eqSize = 0;

  const entryCount = Math.floor(dirBytes.length / 128);
  for (let i = 0; i < entryCount; i++) {
    const base = i * 128;
    const objType = dirBytes[base + 66];
    if (objType === 0) continue;
    const nameByteLen = Math.min(64, dirView.getUint16(base + 64, true));
    let name = '';
    for (let k = 0; k + 1 < nameByteLen - 2; k += 2) {
      const ch = dirView.getUint16(base + k, true);
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    const startSec = dirView.getUint32(base + 116, true);
    const sizeLow = dirView.getUint32(base + 120, true);

    if (objType === 5) {
      rootStart = startSec;
      rootSize = sizeLow;
    } else if (objType === 2 && name.toLowerCase() === 'equation native') {
      eqStart = startSec;
      eqSize = sizeLow;
    }
  }

  if (eqStart > MAXREGSECT || eqSize <= 0) return null;

  if (eqSize < miniStreamCutoff && rootStart <= MAXREGSECT && rootSize > 0 && firstMiniFatSector <= MAXREGSECT) {
    const miniStream = readRegularChain(bytes, fat, rootStart, sectorSize, rootSize);
    const miniFatRaw = readRegularChain(
      bytes,
      fat,
      firstMiniFatSector,
      sectorSize,
      Math.max(1, numMiniFatSectors) * sectorSize,
    );
    const mfView = new DataView(miniFatRaw.buffer, miniFatRaw.byteOffset, miniFatRaw.byteLength);
    const miniFat = new Uint32Array(Math.floor(miniFatRaw.length / 4));
    for (let i = 0; i < miniFat.length; i++) {
      miniFat[i] = mfView.getUint32(i * 4, true);
    }
    return readMiniChain(miniStream, miniFat, eqStart, miniSectorSize, eqSize);
  }

  return readRegularChain(bytes, fat, eqStart, sectorSize, eqSize);
}

/**
 * Maps a MathType MTCode (UTF-16 codepoint / MathType private-use codepoint) to KaTeX LaTeX.
 */
function mtCodeToLatex(code: number): string {
  // Standard ASCII printable
  if (code >= 0x20 && code <= 0x7e) {
    const ch = String.fromCharCode(code);
    if (ch === '{') return '\\{';
    if (ch === '}') return '\\}';
    if (ch === '%') return '\\%';
    if (ch === '$') return '\\$';
    if (ch === '&') return '\\&';
    if (ch === '#') return '\\#';
    return ch;
  }

  switch (code) {
    case 0x00a0:
    case 0x2009:
    case 0x200a:
    case 0x2002:
    case 0x2003:
      return ' ';
    case 0x00b0:
      return '^\\circ';
    case 0x00b1:
      return '\\pm ';
    case 0x00b7:
    case 0x22c5:
    case 0x2219:
      return '\\cdot ';
    case 0x00d7:
      return '\\times ';
    case 0x00f7:
      return '\\div ';
    case 0x2032:
      return "'";
    case 0x2033:
      return "''";
    case 0x2190:
      return '\\leftarrow ';
    case 0x2192:
      return '\\rightarrow ';
    case 0x2194:
      return '\\leftrightarrow ';
    case 0x21d0:
      return '\\Leftarrow ';
    case 0x21d2:
      return '\\Rightarrow ';
    case 0x21d4:
      return '\\Leftrightarrow ';
    case 0x2208:
      return '\\in ';
    case 0x2209:
      return '\\notin ';
    case 0x2212:
    case 0x2013:
    case 0x2014:
      return '-';
    case 0x221e:
      return '\\infty ';
    case 0x2220:
    case 0x2221:
      return '\\angle ';
    case 0x2225:
      return '\\parallel ';
    case 0x2236:
      return ':';
    case 0x2248:
      return '\\approx ';
    case 0x2260:
      return '\\ne ';
    case 0x2261:
      return '\\equiv ';
    case 0x2264:
    case 0x2a7d:
      return '\\le ';
    case 0x2265:
    case 0x2a7e:
      return '\\ge ';
    case 0x22a5:
      return '\\perp ';
    case 0x25b3:
    case 0x0394:
      return '\\triangle ';
    // Greek letters
    case 0x03b1:
      return '\\alpha ';
    case 0x03b2:
      return '\\beta ';
    case 0x03b3:
      return '\\gamma ';
    case 0x03b4:
      return '\\delta ';
    case 0x03b5:
    case 0x03f5:
      return '\\varepsilon ';
    case 0x03b8:
    case 0x03d1:
      return '\\theta ';
    case 0x03bb:
      return '\\lambda ';
    case 0x03bc:
      return '\\mu ';
    case 0x03c0:
      return '\\pi ';
    case 0x03c1:
      return '\\rho ';
    case 0x03c3:
      return '\\sigma ';
    case 0x03c6:
    case 0x03d5:
      return '\\varphi ';
    case 0x03c9:
      return '\\omega ';
    case 0x03a0:
      return '\\Pi ';
    case 0x03a3:
      return '\\Sigma ';
    case 0x03a9:
      return '\\Omega ';
    // MathType private-use spaces/operators (0xEB00..0xEF0F)
    case 0xef01:
    case 0xef02:
    case 0xef03:
    case 0xef04:
    case 0xef05:
      return ' ';
    default:
      if (code >= 0x00c0 && code <= 0x1ef9) {
        return String.fromCharCode(code);
      }
      return '';
  }
}

class MtefReader {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;
  private ver = 5;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private eof(): boolean {
    return this.pos >= this.buf.length;
  }

  private readU8(): number {
    if (this.pos >= this.buf.length) return 0;
    return this.buf[this.pos++];
  }

  private readU16(): number {
    if (this.pos + 2 > this.buf.length) {
      this.pos = this.buf.length;
      return 0;
    }
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  private readMtefUint(): number {
    const b = this.readU8();
    return b === 0xff ? this.readU16() : b;
  }

  private skipCString(): void {
    while (this.pos < this.buf.length) {
      if (this.buf[this.pos++] === 0) break;
    }
  }

  private skipNudge(): void {
    const dx = this.readU8();
    const dy = this.readU8();
    if (dx === 128 && dy === 128) {
      this.pos = Math.min(this.buf.length, this.pos + 4);
    }
  }

  private skipRuler(): void {
    const nStops = this.readU8();
    this.pos = Math.min(this.buf.length, this.pos + nStops * 3);
  }

  private skipEqnPrefs(): void {
    // MTEF 5 EQN_PREFS: options byte + 3 arrays (sizes, spaces, styles)
    this.readU8(); // options
    // Sizes array: count byte + count dimension entries (each nibbled, terminated by 0xF)
    this.skipDimensionArray();
    // Spaces array: count byte + count dimension entries
    this.skipDimensionArray();
    // Styles array: count byte + entries (if fontDefIndex !== 0, followed by charStyle byte)
    const nStyles = this.readU8();
    for (let i = 0; i < nStyles && !this.eof(); i++) {
      const fd = this.readMtefUint();
      if (fd !== 0) this.readU8();
    }
  }

  private skipDimensionArray(): void {
    const count = this.readU8();
    let seen = 0;
    let high = true;
    let curByte = 0;
    while (seen < count && !this.eof()) {
      let nib: number;
      if (high) {
        curByte = this.readU8();
        nib = (curByte >> 4) & 0x0f;
        high = false;
      } else {
        nib = curByte & 0x0f;
        high = true;
      }
      if (nib === 0x0f) {
        seen += 1;
      }
    }
  }

  private readEmbellishments(): number[] {
    const list: number[] = [];
    while (!this.eof()) {
      const tag = this.readU8();
      if (tag === 0) break;
      if (tag === 6) {
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        list.push(this.readU8());
      } else {
        // Unexpected tag inside embell list; rewind 1 byte and stop
        this.pos -= 1;
        break;
      }
    }
    return list;
  }

  private applyEmbellishments(base: string, embells: number[]): string {
    let out = base;
    for (const e of embells) {
      if (e === 2) out = `${out}'`;
      else if (e === 3) out = `${out}''`;
      else if (e === 4) out = `${out}'''`;
      else if (e === 6) out = `\\dot{${out}}`;
      else if (e === 7) out = `\\ddot{${out}}`;
      else if (e === 10 || e === 11) out = `\\widehat{${out}}`;
      else if (e === 12 || e === 13 || e === 14) out = `\\overrightarrow{${out}}`;
      else if (e === 16) out = `\\widetilde{${out}}`;
      else if (e === 17) out = `\\overline{${out}}`;
    }
    return out;
  }

  private readTemplate(depth: number): string {
    const opts = this.readU8();
    if (opts & 0x01) this.skipNudge();
    const selector = this.readU8();
    let variation = this.readU8();
    if (variation & 0x80) {
      const v2 = this.readU8();
      variation = (variation & 0x7f) | (v2 << 8);
    }
    this.readU8(); // template-specific options

    const slots: string[] = [];
    while (!this.eof()) {
      const peek = this.buf[this.pos];
      if (peek === 0) {
        this.pos += 1;
        break;
      }
      slots.push(this.readRecord(depth + 1));
    }

    const s0 = (slots[0] ?? '').trim();
    const s1 = (slots[1] ?? '').trim();
    const s2 = (slots[2] ?? '').trim();

    switch (selector) {
      case 0: // tmANGLE
        return `\\left\\langle ${s0} \\right\\rangle`;
      case 1: // tmPAREN
        return `\\left(${s0}\\right)`;
      case 2: // tmBRACE
        if ((variation & 0x03) === 1) {
          return `\\begin{cases}${s0}\\end{cases}`;
        }
        return `\\left\\{${s0}\\right\\}`;
      case 3: // tmBRACK
        return `\\left[${s0}\\right]`;
      case 4: // tmBAR
        return `\\left|${s0}\\right|`;
      case 5: // tmDBAR
        return `\\left\\|${s0}\\right\\|`;
      case 13: // tmROOT
        return s1 ? `\\sqrt[${s1}]{${s0}}` : `\\sqrt{${s0}}`;
      case 14: // tmFRACT
        return `\\dfrac{${s0}}{${s1}}`;
      case 15: // tmUBAR
        return `\\underline{${s0}}`;
      case 16: // tmOBAR
        return `\\overline{${s0}}`;
      case 17: // tmARROW
      case 34: // tmVEC
        return `\\overrightarrow{${s0}}`;
      case 18: // tmINTEG
        return `\\int${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;
      case 19: // tmSUM
        return `\\sum${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;
      case 20: // tmPROD
        return `\\prod${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;
      case 26: // tmLIM
        return `\\lim${s1 ? `_{${s1}}` : ''} ${s0}`;
      case 30: // tmSUB
        return `_{${s0 || s1}}`;
      case 31: // tmSUP
        return `^{${s1 || s0}}`;
      case 32: // tmSUBSUP
        return `${s0 ? `_{${s0}}` : ''}${s1 ? `^{${s1}}` : ''}`;
      case 35: // tmTILDE
        return `\\widetilde{${s0}}`;
      case 36: // tmHAT
      case 37: // tmARC
        return `\\widehat{${s0}}`;
      default:
        return slots.filter(Boolean).join(' ');
    }
  }

  private readRecord(depth: number): string {
    if (depth > 32 || this.eof()) return '';
    const tag = this.readU8();

    switch (tag) {
      case 0: // END
        return '';

      case 1: {
        // LINE
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        if (opts & 0x02) this.pos = Math.min(this.buf.length, this.pos + 2); // line spacing
        if (opts & 0x08) {
          // inline RULER record (tag 7 follows)
          if (this.buf[this.pos] === 7) {
            this.pos += 1;
            this.skipRuler();
          }
        }
        if (opts & 0x04) return ''; // xfNULL (empty slot, no END byte!)
        let out = '';
        while (!this.eof()) {
          if (this.buf[this.pos] === 0) {
            this.pos += 1;
            break;
          }
          out += this.readRecord(depth + 1);
        }
        return out;
      }

      case 2: {
        // CHAR
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        this.readU8(); // typeface
        let mtcode = 0;
        if (!(opts & 0x10)) {
          mtcode = this.readU16();
        }
        if (opts & 0x04) this.readU8(); // 8-bit font position
        if (opts & 0x08) this.readU16(); // 16-bit font position
        let ch = mtcode ? mtCodeToLatex(mtcode) : '';
        if (opts & 0x02) {
          const embells = this.readEmbellishments();
          if (ch) ch = this.applyEmbellishments(ch, embells);
        }
        return ch;
      }

      case 3: // TMPL
        return this.readTemplate(depth);

      case 4: {
        // PILE
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        this.readU8(); // halign
        this.readU8(); // valign
        if (opts & 0x08 && this.buf[this.pos] === 7) {
          this.pos += 1;
          this.skipRuler();
        }
        const rows: string[] = [];
        while (!this.eof()) {
          if (this.buf[this.pos] === 0) {
            this.pos += 1;
            break;
          }
          const r = this.readRecord(depth + 1).trim();
          if (r) rows.push(r);
        }
        return rows.join(' \\\\ ');
      }

      case 5: {
        // MATRIX
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        this.readU8(); // valign
        this.readU8(); // h_just
        this.readU8(); // v_just
        const rows = this.readU8();
        const cols = this.readU8();
        const rowPartBytes = Math.ceil((rows + 1) / 4);
        const colPartBytes = Math.ceil((cols + 1) / 4);
        this.pos = Math.min(this.buf.length, this.pos + rowPartBytes + colPartBytes);
        const cells: string[] = [];
        while (!this.eof()) {
          if (this.buf[this.pos] === 0) {
            this.pos += 1;
            break;
          }
          cells.push(this.readRecord(depth + 1).trim());
        }
        if (rows <= 0 || cols <= 0) return cells.join(' ');
        const lines: string[] = [];
        for (let r = 0; r < rows; r++) {
          lines.push(cells.slice(r * cols, (r + 1) * cols).join(' & '));
        }
        return lines.join(' \\\\ ');
      }

      case 6: {
        // Stray EMBELL
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        this.readU8();
        return '';
      }

      case 7: // RULER
        this.skipRuler();
        return '';

      case 8: // FONT_STYLE_DEF
        this.readMtefUint();
        this.readU8();
        return '';

      case 9: {
        // SIZE
        const lsize = this.readU8();
        if (lsize === 101) this.readU16();
        else if (lsize === 100) {
          this.readU8();
          this.readU16();
        } else {
          this.readU8();
        }
        return '';
      }

      case 10:
      case 11:
      case 12:
      case 13:
      case 14:
        return '';

      case 15: // COLOR
        this.readMtefUint();
        return '';

      case 16: {
        // COLOR_DEF
        const opts = this.readU8();
        const nVals = opts & 0x01 ? 4 : 3;
        this.pos = Math.min(this.buf.length, this.pos + nVals * 2);
        if (opts & 0x04) this.skipCString();
        return '';
      }

      case 17: // FONT_DEF
        this.readMtefUint();
        this.skipCString();
        return '';

      case 18: // EQN_PREFS
        this.skipEqnPrefs();
        return '';

      case 19: // ENCODING_DEF
        this.skipCString();
        return '';

      default:
        // Unknown or future record (>= 100): abort cleanly to avoid desync garbage
        this.pos = this.buf.length;
        return '';
    }
  }

  public decode(): string | null {
    if (this.buf.length < 8) return null;
    this.ver = this.readU8();
    if (this.ver !== 5) {
      // MTEF v3 fallback is less common; return null cleanly so caller can warn
      return null;
    }
    // platform, product, prodVer, prodSubVer
    this.pos += 4;
    // null-terminated application key (e.g., "DSMT4\0" or "DSMT6\0" or "DSMT7\0")
    this.skipCString();
    // equation options byte
    this.readU8();

    let out = '';
    while (!this.eof()) {
      const peek = this.buf[this.pos];
      if (peek === 0) break;
      out += this.readRecord(0);
    }

    const cleaned = out
      .replace(/\s+/g, ' ')
      // Normalize trig functions written as plain chars in MathType (Safari-safe without lookbehind)
      .replace(/(^|[^\\a-zA-Z])(sin|cos|tan|cot)\b/g, '$1\\$2 ')
      .replace(/(^|[^\\a-zA-Z])tg\b/g, '$1\\tan ')
      .replace(/(^|[^\\a-zA-Z])cotg\b/g, '$1\\cot ')
      // Normalize Vietnamese decimal comma inside formulas: 16,78 -> 16{,}78
      .replace(/(\d),(\d)/g, '$1{,}$2')
      // Normalize degree superscript written as ^0 or ^{0} right after a number in Vietnamese MathType docs (e.g. 40^0 -> 40^\circ)
      .replace(/(\d)\s*\^\s*\{?\s*0\s*\}?(?!\d)/g, '$1^\\circ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}

/**
 * Decodes a MathType OLE2 binary (`word/embeddings/oleObject*.bin`) into clean KaTeX LaTeX.
 * Returns `null` if not a valid MathType MTEF v5 equation.
 */
export function decodeMathTypeOleToLatex(oleBytes: Uint8Array): string | null {
  try {
    const eqStream = extractEquationNativeStream(oleBytes);
    if (!eqStream || eqStream.length < 34) return null;
    const hdrView = new DataView(eqStream.buffer, eqStream.byteOffset, eqStream.byteLength);
    const cbHdr = hdrView.getUint16(0, true);
    if (cbHdr < 16 || cbHdr >= eqStream.length) return null;
    const mtefPayload = eqStream.subarray(cbHdr);
    const reader = new MtefReader(mtefPayload);
    return reader.decode();
  } catch {
    return null;
  }
}

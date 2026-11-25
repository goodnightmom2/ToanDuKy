/**
 * Pure-TypeScript OLE2 Compound Binary File (CFB) + MathType MTEF v5 & MTEF v3 (Equation 3.0)
 * + WMF Comment fallback decoder.
 * Decodes `word/embeddings/oleObject*.bin` and `word/media/image*.wmf` inside `.docx` files
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
  if (bytes.length < 256) return null;
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
    if (off + 4 > bytes.length) break;
    const entriesPerSec = Math.floor(Math.min(sectorSize, bytes.length - off) / 4) - 1;
    for (let i = 0; i < entriesPerSec; i++) {
      const sid = view.getUint32(off + i * 4, true);
      if (sid <= MAXREGSECT) fatSectorIds.push(sid);
    }
    if (off + entriesPerSec * 4 + 4 <= bytes.length) {
      difatSec = view.getUint32(off + entriesPerSec * 4, true);
    } else {
      break;
    }
  }

  const fatEntriesPerSec = sectorSize / 4;
  const fat = new Uint32Array(Math.max(1, fatSectorIds.length) * fatEntriesPerSec);
  fat.fill(0xffffffff);
  for (let i = 0; i < fatSectorIds.length; i++) {
    const off = (fatSectorIds[i] + 1) * sectorSize;
    if (off >= bytes.length) continue;
    const availEntries = Math.min(fatEntriesPerSec, Math.floor((bytes.length - off) / 4));
    for (let j = 0; j < availEntries; j++) {
      fat[i * fatEntriesPerSec + j] = view.getUint32(off + j * 4, true);
    }
  }

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
    const cleanName = name.replace(/^[\x00-\x1f]+/, '').trim().toLowerCase();

    if (objType === 5) {
      rootStart = startSec;
      rootSize = sizeLow;
    } else if (
      objType === 2 &&
      (cleanName === 'equation native' || cleanName === 'contents' || cleanName === 'ole10native')
    ) {
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

const SYMBOL_LOWER_GREEK: Record<string, string> = {
  a: '\\alpha ',
  b: '\\beta ',
  g: '\\gamma ',
  d: '\\delta ',
  e: '\\varepsilon ',
  z: '\\zeta ',
  h: '\\eta ',
  q: '\\theta ',
  i: '\\iota ',
  k: '\\kappa ',
  l: '\\lambda ',
  m: '\\mu ',
  n: '\\nu ',
  x: '\\xi ',
  o: 'o',
  p: '\\pi ',
  r: '\\rho ',
  s: '\\sigma ',
  t: '\\tau ',
  u: '\\upsilon ',
  f: '\\varphi ',
  c: '\\chi ',
  y: '\\psi ',
  w: '\\omega ',
  v: '\\varpi ',
  j: '\\varphi ',
};

const SYMBOL_UPPER_GREEK: Record<string, string> = {
  G: '\\Gamma ',
  D: '\\triangle ',
  Q: '\\Theta ',
  L: '\\Lambda ',
  X: '\\Xi ',
  P: '\\Pi ',
  S: '\\Sigma ',
  U: '\\Upsilon ',
  F: '\\Phi ',
  Y: '\\Psi ',
  W: '\\Omega ',
};

function symbolByteToLatex(b: number, isGreekLower: boolean, isGreekUpper: boolean): string {
  if (b >= 0x20 && b <= 0x7e) {
    const ch = String.fromCharCode(b);
    if (isGreekLower && SYMBOL_LOWER_GREEK[ch]) return SYMBOL_LOWER_GREEK[ch];
    if (isGreekUpper && SYMBOL_UPPER_GREEK[ch]) return SYMBOL_UPPER_GREEK[ch];
    if (ch === 'D' && !isGreekLower) return '\\triangle ';
    if (ch === '^') return '\\perp ';
    if (ch === '*') return '\\ast ';
    if (ch === '-') return '-';
    return asciiCharToLatex(ch);
  }

  switch (b) {
    case 0xa0:
      return ' ';
    case 0xa3:
      return '\\le ';
    case 0xa4:
      return '/';
    case 0xa5:
      return '\\infty ';
    case 0xab:
      return '\\leftrightarrow ';
    case 0xac:
      return '\\leftarrow ';
    case 0xae:
      return '\\rightarrow ';
    case 0xb0:
      return '^\\circ';
    case 0xb1:
      return '\\pm ';
    case 0xb2:
      return "''";
    case 0xb3:
      return '\\ge ';
    case 0xb4:
      return '\\times ';
    case 0xb5:
      return '\\propto ';
    case 0xb7:
    case 0xd7:
      return '\\cdot ';
    case 0xb8:
      return '\\div ';
    case 0xb9:
      return '\\ne ';
    case 0xba:
      return '\\equiv ';
    case 0xbb:
      return '\\approx ';
    case 0xc4:
      return '\\otimes ';
    case 0xc5:
      return '\\oplus ';
    case 0xc6:
      return '\\varnothing ';
    case 0xc7:
      return '\\cap ';
    case 0xc8:
      return '\\cup ';
    case 0xcc:
      return '\\subset ';
    case 0xcd:
      return '\\subseteq ';
    case 0xce:
      return '\\in ';
    case 0xcf:
      return '\\notin ';
    case 0xd0:
      return '\\angle ';
    case 0xd6:
      return '\\sqrt{}';
    case 0xdb:
      return '\\Leftrightarrow ';
    case 0xdc:
      return '\\Leftarrow ';
    case 0xde:
      return '\\Rightarrow ';
    case 0xe0:
      return '\\diamond ';
    default:
      return '';
  }
}

function asciiCharToLatex(ch: string): string {
  if (ch === '{') return '\\{';
  if (ch === '}') return '\\}';
  if (ch === '%') return '\\%';
  if (ch === '$') return '\\$';
  if (ch === '&') return '\\&';
  if (ch === '#') return '\\#';
  return ch;
}

/**
 * Maps a MathType MTCode / font codepoint to KaTeX LaTeX, taking into account
 * the style/font (fnLCGREEK=4, fnUCGREEK=5, fnSYMBOL=6, or explicit Symbol font).
 */
function mtCodeToLatex(
  code: number,
  styleOrFont: {fnStyle: number; fontName: string},
): string {
  const fontLow = styleOrFont.fontName.toLowerCase();
  const isSymbolFont =
    styleOrFont.fnStyle === 4 ||
    styleOrFont.fnStyle === 5 ||
    styleOrFont.fnStyle === 6 ||
    fontLow.includes('symbol');
  const isGreekLower = styleOrFont.fnStyle === 4;
  const isGreekUpper = styleOrFont.fnStyle === 5;

  // Windows Symbol-charset Private Use Area (0xF020..0xF0FF)
  if (code >= 0xf020 && code <= 0xf0ff) {
    const low = code & 0xff;
    if (isSymbolFont) {
      return symbolByteToLatex(low, isGreekLower, isGreekUpper);
    }
    if (low >= 0x20 && low <= 0x7e) {
      return asciiCharToLatex(String.fromCharCode(low));
    }
    return symbolByteToLatex(low, false, false);
  }

  // Standard 8-bit Symbol font codes in MTEF v3 (when fnStyle is 4, 5, or 6)
  if (isSymbolFont && code >= 0x20 && code <= 0xff) {
    // Only use Symbol table if it's Greek/high-byte/special ('D' -> \triangle in fnUCGREEK/fnSYMBOL)
    if (isGreekLower || isGreekUpper || code >= 0x80 || code === 0x44 || code === 0x5e) {
      const sym = symbolByteToLatex(code, isGreekLower, isGreekUpper);
      if (sym) return sym;
    }
  }

  if (code >= 0x20 && code <= 0x7e) {
    return asciiCharToLatex(String.fromCharCode(code));
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
    case 0x2206:
      return '\\triangle ';
    // Greek Unicode
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
    case 0xef08:
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
  private platform = 1; // 1 = Windows, 0 = Mac
  private fontDefs: string[] = ['']; // 1-indexed FONT_DEF names

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
    const v = this.view.getUint16(this.pos, this.platform !== 0);
    this.pos += 2;
    return v;
  }

  private readI16(): number {
    if (this.pos + 2 > this.buf.length) {
      this.pos = this.buf.length;
      return 0;
    }
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  private readMtefUint(): number {
    const b = this.readU8();
    return b === 0xff ? this.readU16() : b;
  }

  private readMtefSint(): number {
    const b = this.readU8();
    return b === 0xff ? this.readI16() : b - 128;
  }

  private readCString(): string {
    const start = this.pos;
    while (this.pos < this.buf.length) {
      if (this.buf[this.pos] === 0) break;
      this.pos++;
    }
    const str = new TextDecoder('utf-8', {fatal: false}).decode(this.buf.subarray(start, this.pos));
    if (this.pos < this.buf.length && this.buf[this.pos] === 0) this.pos++;
    return str;
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
    this.readU8(); // options
    this.skipDimensionArray();
    this.skipDimensionArray();
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

  private readEmbellishmentsV5(): number[] {
    const list: number[] = [];
    while (!this.eof()) {
      const tag = this.readU8();
      if (tag === 0) break;
      if (tag === 6) {
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        list.push(this.readU8());
      } else if (tag >= 100) {
        const skip = this.readMtefUint();
        this.pos = Math.min(this.buf.length, this.pos + skip);
      } else {
        this.pos -= 1;
        break;
      }
    }
    return list;
  }

  private readEmbellishmentsV3(): number[] {
    const list: number[] = [];
    while (!this.eof()) {
      const raw = this.readU8();
      if (raw === 0) break;
      if ((raw & 0x0f) === 6) {
        const opts = (raw >> 4) & 0x0f;
        if (opts & 0x08) this.skipNudge();
        list.push(this.readU8());
      } else {
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

  private formatTemplate(selector: number, variation: number, slots: string[]): string {
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

  private resolveStyleAndFont(signedTf: number): {fnStyle: number; fontName: string} {
    if (signedTf > 0) {
      return {fnStyle: signedTf, fontName: ''};
    }
    const idx = -signedTf;
    return {fnStyle: 0, fontName: this.fontDefs[idx] ?? ''};
  }

  private readRecordV5(depth: number): string {
    if (depth > 40 || this.eof()) return '';
    const tag = this.readU8();

    if (tag >= 100) {
      // MTEF v5 future/extension record: length-prefixed! Skip cleanly and continue!
      const payloadLen = this.readMtefUint();
      this.pos = Math.min(this.buf.length, this.pos + payloadLen);
      return '';
    }

    switch (tag) {
      case 0:
        return '';

      case 1: {
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        if (opts & 0x02) this.pos = Math.min(this.buf.length, this.pos + 2);
        if (opts & 0x08 && this.buf[this.pos] === 7) {
          this.pos += 1;
          this.skipRuler();
        }
        if (opts & 0x04) return '';
        let out = '';
        while (!this.eof()) {
          if (this.buf[this.pos] === 0) {
            this.pos += 1;
            break;
          }
          out += this.readRecordV5(depth + 1);
        }
        return out;
      }

      case 2: {
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        const signedTf = this.readMtefSint();
        let mtcode = 0;
        let fontPos = 0;
        if (!(opts & 0x10)) {
          mtcode = this.readU16();
        }
        if (opts & 0x04) fontPos = this.readU8();
        if (opts & 0x08) fontPos = this.readU16();
        const effectiveCode = mtcode || fontPos;
        let ch = effectiveCode ? mtCodeToLatex(effectiveCode, this.resolveStyleAndFont(signedTf)) : '';
        if (opts & 0x02) {
          const embells = this.readEmbellishmentsV5();
          if (ch) ch = this.applyEmbellishments(ch, embells);
        }
        return ch;
      }

      case 3: {
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        const selector = this.readU8();
        let variation = this.readU8();
        if (variation & 0x80) {
          const v2 = this.readU8();
          variation = (variation & 0x7f) | (v2 << 8);
        }
        this.readU8(); // template options
        const slots: string[] = [];
        while (!this.eof()) {
          if (this.buf[this.pos] === 0) {
            this.pos += 1;
            break;
          }
          slots.push(this.readRecordV5(depth + 1));
        }
        return this.formatTemplate(selector, variation, slots);
      }

      case 4: {
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        this.readU8();
        this.readU8();
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
          const r = this.readRecordV5(depth + 1).trim();
          if (r) rows.push(r);
        }
        return rows.join(' \\\\ ');
      }

      case 5: {
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        this.readU8();
        this.readU8();
        this.readU8();
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
          cells.push(this.readRecordV5(depth + 1).trim());
        }
        if (rows <= 0 || cols <= 0) return cells.join(' ');
        const lines: string[] = [];
        for (let r = 0; r < rows; r++) {
          lines.push(cells.slice(r * cols, (r + 1) * cols).join(' & '));
        }
        return lines.join(' \\\\ ');
      }

      case 6: {
        const opts = this.readU8();
        if (opts & 0x01) this.skipNudge();
        this.readU8();
        return '';
      }

      case 7:
        this.skipRuler();
        return '';

      case 8:
        this.readMtefUint();
        this.readU8();
        return '';

      case 9: {
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

      case 15:
        this.readMtefUint();
        return '';

      case 16: {
        const opts = this.readU8();
        const nVals = opts & 0x01 ? 4 : 3;
        this.pos = Math.min(this.buf.length, this.pos + nVals * 2);
        if (opts & 0x04) this.readCString();
        return '';
      }

      case 17: {
        // FONT_DEF: enc_def_index + null-terminated font name
        this.readMtefUint();
        const fontName = this.readCString();
        this.fontDefs.push(fontName);
        return '';
      }

      case 18:
        this.skipEqnPrefs();
        return '';

      case 19:
        this.readCString();
        return '';

      default:
        this.pos = this.buf.length;
        return '';
    }
  }

  /**
   * MTEF v3 (Microsoft Equation 3.0 / MathType 3.x) record reader.
   * Record type is low nibble `raw & 0x0F`, options are high nibble `(raw >> 4) & 0x0F`.
   */
  private readRecordV3(depth: number): string {
    if (depth > 40 || this.eof()) return '';
    const raw = this.readU8();
    const recType = raw & 0x0f;
    const opts = (raw >> 4) & 0x0f;

    switch (recType) {
      case 0:
        return '';

      case 1: {
        // LINE (v3: 0x08=nudge, 0x04=ruler, 0x02=lspace, 0x01=null)
        if (opts & 0x08) this.skipNudge();
        if (opts & 0x02) this.pos = Math.min(this.buf.length, this.pos + 2);
        if (opts & 0x04 && (this.buf[this.pos] & 0x0f) === 7) {
          this.pos += 1;
          this.skipRuler();
        }
        if (opts & 0x01) return '';
        let out = '';
        while (!this.eof()) {
          if (this.buf[this.pos] === 0) {
            this.pos += 1;
            break;
          }
          out += this.readRecordV3(depth + 1);
        }
        return out;
      }

      case 2: {
        // CHAR (v3: 0x08=nudge, 0x02=embell; 1-byte typeface + 16-bit char on Windows / 8-bit on Mac)
        if (opts & 0x08) this.skipNudge();
        const rawTf = this.readU8();
        const signedTf = rawTf - 128;
        const code = this.platform === 0 ? this.readU8() : this.readU16();
        let ch = code ? mtCodeToLatex(code, this.resolveStyleAndFont(signedTf)) : '';
        if (opts & 0x02) {
          const embells = this.readEmbellishmentsV3();
          if (ch) ch = this.applyEmbellishments(ch, embells);
        }
        return ch;
      }

      case 3: {
        // TMPL (v3: 0x08=nudge; 1-byte selector, 1-byte variation, 1-byte options)
        if (opts & 0x08) this.skipNudge();
        const selector = this.readU8();
        const variation = this.readU8();
        this.readU8(); // template options
        const slots: string[] = [];
        while (!this.eof()) {
          if (this.buf[this.pos] === 0) {
            this.pos += 1;
            break;
          }
          slots.push(this.readRecordV3(depth + 1));
        }
        return this.formatTemplate(selector, variation, slots);
      }

      case 4: {
        if (opts & 0x08) this.skipNudge();
        this.readU8();
        this.readU8();
        if (opts & 0x04 && (this.buf[this.pos] & 0x0f) === 7) {
          this.pos += 1;
          this.skipRuler();
        }
        const rows: string[] = [];
        while (!this.eof()) {
          if (this.buf[this.pos] === 0) {
            this.pos += 1;
            break;
          }
          const r = this.readRecordV3(depth + 1).trim();
          if (r) rows.push(r);
        }
        return rows.join(' \\\\ ');
      }

      case 5: {
        if (opts & 0x08) this.skipNudge();
        this.readU8();
        this.readU8();
        this.readU8();
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
          cells.push(this.readRecordV3(depth + 1).trim());
        }
        if (rows <= 0 || cols <= 0) return cells.join(' ');
        const lines: string[] = [];
        for (let r = 0; r < rows; r++) {
          lines.push(cells.slice(r * cols, (r + 1) * cols).join(' & '));
        }
        return lines.join(' \\\\ ');
      }

      case 6: {
        if (opts & 0x08) this.skipNudge();
        this.readU8();
        return '';
      }

      case 7:
        this.skipRuler();
        return '';

      case 8: {
        // FONT in MTEF v3: tface (1..n), style, null-terminated font name
        const tface = this.readU8();
        this.readU8(); // style
        const fontName = this.readCString();
        if (tface > 0 && tface < 64) {
          this.fontDefs[tface] = fontName;
        }
        return '';
      }

      case 9: {
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

      default:
        this.pos = this.buf.length;
        return '';
    }
  }

  public decode(): string | null {
    if (this.buf.length < 6) return null;
    this.ver = this.readU8();
    this.platform = this.readU8();

    let out = '';
    if (this.ver === 5) {
      // product, prodVer, prodSubVer
      this.pos += 3;
      // null-terminated application key (e.g., "DSMT4\0", "DSMT6\0", "DSMT7\0")
      this.readCString();
      // equation options byte
      this.readU8();

      while (!this.eof()) {
        if (this.buf[this.pos] === 0) break;
        out += this.readRecordV5(0);
      }
    } else if (this.ver >= 1 && this.ver <= 4) {
      // MTEF v3 (Equation Editor 3.0): product, prodVer, prodSubVer (3 bytes), then records immediately!
      this.pos += 3;
      while (!this.eof()) {
        if (this.buf[this.pos] === 0) break;
        out += this.readRecordV3(0);
      }
    } else {
      return null;
    }

    const cleaned = out
      .replace(/\s+/g, ' ')
      // Normalize trig functions written as plain chars in MathType (Safari-safe without lookbehind)
      .replace(/(^|[^\\a-zA-Z])(sin|cos|tan|cot)\b/g, '$1\\$2 ')
      .replace(/(^|[^\\a-zA-Z])tg\b/g, '$1\\tan ')
      .replace(/(^|[^\\a-zA-Z])cotg\b/g, '$1\\cot ')
      // Normalize Vietnamese decimal comma inside formulas: 16,78 -> 16{,}78
      .replace(/(\d),(\d)/g, '$1{,}$2')
      // Normalize degree superscript written as ^0 or ^{0} right after a number in Vietnamese MathType docs
      .replace(/(\d)\s*\^\s*\{?\s*0\s*\}?(?!\d)/g, '$1^\\circ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}

export function decodeRawMtefBytes(mtefPayload: Uint8Array): string | null {
  try {
    const reader = new MtefReader(mtefPayload);
    return reader.decode();
  } catch {
    return null;
  }
}

/**
 * Decodes a MathType / Equation 3.0 OLE2 binary (`word/embeddings/*.bin`) into clean KaTeX LaTeX.
 */
export function decodeMathTypeOleToLatex(oleBytes: Uint8Array): string | null {
  try {
    const eqStream = extractEquationNativeStream(oleBytes);
    if (eqStream && eqStream.length >= 16) {
      const hdrView = new DataView(eqStream.buffer, eqStream.byteOffset, eqStream.byteLength);
      const cbHdr = hdrView.getUint16(0, true);
      if (cbHdr >= 16 && cbHdr < eqStream.length) {
        const res = decodeRawMtefBytes(eqStream.subarray(cbHdr));
        if (res) return res;
      }
    }

    // Fallback: scan raw bytes for embedded MTEF v5 ("DSMT") signature
    for (let i = 5; i + 8 < oleBytes.length; i++) {
      if (
        oleBytes[i] === 0x44 && // 'D'
        oleBytes[i + 1] === 0x53 && // 'S'
        oleBytes[i + 2] === 0x4d && // 'M'
        oleBytes[i + 3] === 0x54 && // 'T'
        oleBytes[i - 5] === 5
      ) {
        const res = decodeRawMtefBytes(oleBytes.subarray(i - 5));
        if (res) return res;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback decoder for MathType preview metafiles (`word/media/image*.wmf`) which embed MTEF
 * inside `AppsMFCC` chunked comments or `"MathType\0"` comments!
 */
export function decodeMathTypeWmfToLatex(wmfBytes: Uint8Array): string | null {
  try {
    // 1. Check for MathType 6/7 `AppsMFCC` chunked comment blocks and reassemble data
    const chunks: Array<{index: number; data: Uint8Array}> = [];
    for (let i = 0; i + 28 < wmfBytes.length; i++) {
      if (
        wmfBytes[i] === 0x41 && // 'A'
        wmfBytes[i + 1] === 0x70 && // 'p'
        wmfBytes[i + 2] === 0x70 && // 'p'
        wmfBytes[i + 3] === 0x73 && // 's'
        wmfBytes[i + 4] === 0x4d && // 'M'
        wmfBytes[i + 5] === 0x46 && // 'F'
        wmfBytes[i + 6] === 0x43 && // 'C'
        wmfBytes[i + 7] === 0x43 // 'C'
      ) {
        const v = new DataView(wmfBytes.buffer, wmfBytes.byteOffset + i, wmfBytes.byteLength - i);
        const dataLen = v.getUint32(16, true);
        let sigEnd = 24;
        while (sigEnd < 80 && i + sigEnd < wmfBytes.length && wmfBytes[i + sigEnd] !== 0) {
          sigEnd++;
        }
        const sig = new TextDecoder('ascii').decode(wmfBytes.subarray(i + 24, i + sigEnd));
        if (sig.toLowerCase().includes('mathtype') && dataLen > 0 && i + sigEnd + 1 + dataLen <= wmfBytes.length) {
          chunks.push({
            index: chunks.length,
            data: wmfBytes.subarray(i + sigEnd + 1, i + sigEnd + 1 + dataLen),
          });
        }
      }
    }
    if (chunks.length > 0) {
      const total = chunks.reduce((s, c) => s + c.data.length, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        merged.set(c.data, off);
        off += c.data.length;
      }
      const res = decodeRawMtefBytes(merged);
      if (res) return res;
    }

    // 2. Direct `"MathType\0"` WMF comment (MTEF v3 / MathType 4–5)
    for (let i = 0; i + 16 < wmfBytes.length; i++) {
      if (
        wmfBytes[i] === 0x4d && // 'M'
        wmfBytes[i + 1] === 0x61 && // 'a'
        wmfBytes[i + 2] === 0x74 && // 't'
        wmfBytes[i + 3] === 0x68 && // 'h'
        wmfBytes[i + 4] === 0x54 && // 'T'
        wmfBytes[i + 5] === 0x79 && // 'y'
        wmfBytes[i + 6] === 0x70 && // 'p'
        wmfBytes[i + 7] === 0x65 && // 'e'
        wmfBytes[i + 8] === 0x00
      ) {
        const res = decodeRawMtefBytes(wmfBytes.subarray(i + 9));
        if (res) return res;
      }
    }
    return null;
  } catch {
    return null;
  }
}

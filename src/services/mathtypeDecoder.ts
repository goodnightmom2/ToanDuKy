/**
 * Pure-TypeScript OLE2 Compound Binary File (CFB) + MathType MTEF v5 & MTEF v3 (Equation 3.0)
 * + WMF/EMF Comment & GDI Text fallback decoder.
 * Decodes `word/embeddings/oleObject*.bin` and `word/media/image*.{wmf,emf}` inside `.docx` files
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

interface CfbStreamEntry {
  name: string;
  priority: number;
  data: Uint8Array;
}

/**
 * Extracts all stream objects (`objType === 2`) from an OLE2 Compound File (`oleObject*.bin`),
 * ordered with `'equation native'` first so auxiliary streams never shadow the equation stream.
 */
function extractAllCfbStreams(bytes: Uint8Array): CfbStreamEntry[] {
  if (bytes.length < 256) return [];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== CFB_MAGIC[i]) return [];
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = view.getUint16(30, true);
  const miniSectorShift = view.getUint16(32, true);
  if (sectorShift < 7 || sectorShift > 16 || miniSectorShift < 4 || miniSectorShift > 12) return [];

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
  if (dirBytes.length < 128) return [];
  const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);

  let rootStart = ENDOFCHAIN;
  let rootSize = 0;
  const rawStreams: Array<{name: string; startSec: number; sizeLow: number; priority: number}> = [];

  const entryCount = Math.floor(dirBytes.length / 128);
  for (let i = 0; i < entryCount; i++) {
    const base = i * 128;
    const objType = dirBytes[base + 66];
    if (objType === 0) continue;
    const nameByteLen = Math.min(64, dirView.getUint16(base + 64, true));
    let name = '';
    for (let k = 0; k + 1 < nameByteLen; k += 2) {
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
    } else if (objType === 2 && startSec <= MAXREGSECT && sizeLow > 0 && sizeLow <= 2 * 1024 * 1024) {
      let priority = 50;
      if (cleanName === 'equation native') priority = 1;
      else if (cleanName.includes('equation') || cleanName.includes('mathtype')) priority = 2;
      else if (cleanName === 'contents') priority = 3;
      else if (cleanName === 'ole10native' || cleanName === 'package') priority = 4;
      else if (cleanName.includes('compobj') || cleanName.includes('objinfo')) priority = 90;
      rawStreams.push({name: cleanName, startSec, sizeLow, priority});
    }
  }

  if (rawStreams.length === 0) return [];
  rawStreams.sort((a, b) => a.priority - b.priority);

  let miniStream: Uint8Array | null = null;
  let miniFat: Uint32Array | null = null;
  if (rootStart <= MAXREGSECT && rootSize > 0 && firstMiniFatSector <= MAXREGSECT) {
    miniStream = readRegularChain(bytes, fat, rootStart, sectorSize, rootSize);
    const miniFatRaw = readRegularChain(
      bytes,
      fat,
      firstMiniFatSector,
      sectorSize,
      Math.max(1, numMiniFatSectors) * sectorSize,
    );
    const mfView = new DataView(miniFatRaw.buffer, miniFatRaw.byteOffset, miniFatRaw.byteLength);
    miniFat = new Uint32Array(Math.floor(miniFatRaw.length / 4));
    for (let i = 0; i < miniFat.length; i++) {
      miniFat[i] = mfView.getUint32(i * 4, true);
    }
  }

  const out: CfbStreamEntry[] = [];
  for (const s of rawStreams) {
    let data: Uint8Array;
    if (s.sizeLow < miniStreamCutoff && miniStream && miniFat) {
      data = readMiniChain(miniStream, miniFat, s.startSec, miniSectorSize, s.sizeLow);
    } else {
      data = readRegularChain(bytes, fat, s.startSec, sectorSize, s.sizeLow);
    }
    if (data.length > 0) {
      out.push({name: s.name, priority: s.priority, data});
    }
  }
  return out;
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
  V: '\\varsigma ',
  J: '\\vartheta ',
};

const SYMBOL_UPPER_GREEK: Record<string, string> = {
  A: 'A',
  B: 'B',
  G: '\\Gamma ',
  D: '\\triangle ',
  E: 'E',
  Z: 'Z',
  H: 'H',
  Q: '\\Theta ',
  I: 'I',
  K: 'K',
  L: '\\Lambda ',
  M: 'M',
  N: 'N',
  X: '\\Xi ',
  O: 'O',
  P: '\\Pi ',
  R: 'P',
  S: '\\Sigma ',
  T: 'T',
  U: '\\Upsilon ',
  F: '\\Phi ',
  C: 'X',
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
    if (ch === '~') return '\\sim ';
    if (ch === '@') return '\\cong ';
    if (ch === '-') return '-';
    return asciiCharToLatex(ch);
  }

  switch (b) {
    case 0xa0:
      return ' ';
    case 0xa2:
      return "'";
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
    case 0xad:
      return '\\uparrow ';
    case 0xae:
      return '\\rightarrow ';
    case 0xaf:
      return '\\downarrow ';
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
    case 0xb6:
      return '\\partial ';
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
    case 0xbc:
      return '\\ldots ';
    case 0xc0:
      return '\\aleph ';
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
    case 0xc9:
      return '\\supset ';
    case 0xca:
      return '\\supseteq ';
    case 0xcb:
      return '\\not\\subset ';
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
    case 0xd1:
      return '\\nabla ';
    case 0xd5:
      return '\\prod ';
    case 0xd6:
      return '\\sqrt{}';
    case 0xd9:
      return '\\land ';
    case 0xda:
      return '\\lor ';
    case 0xdb:
      return '\\Leftrightarrow ';
    case 0xdc:
      return '\\Leftarrow ';
    case 0xdd:
      return '\\Uparrow ';
    case 0xde:
      return '\\Rightarrow ';
    case 0xdf:
      return '\\Downarrow ';
    case 0xe0:
      return '\\diamond ';
    case 0xe1:
      return '\\langle ';
    case 0xe5:
      return '\\sum ';
    case 0xf1:
      return '\\rangle ';
    case 0xf2:
      return '\\int ';
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
 * the style/font (fnLCGREEK=4, fnUCGREEK=5, fnSYMBOL=6, or explicit Symbol font/charset).
 */
function mtCodeToLatex(
  code: number,
  styleOrFont: {fnStyle: number; fontName: string; isSymbolCharset?: boolean},
): string {
  const fontLow = styleOrFont.fontName.toLowerCase();
  const isSymbolFont =
    styleOrFont.fnStyle === 4 ||
    styleOrFont.fnStyle === 5 ||
    styleOrFont.fnStyle === 6 ||
    Boolean(styleOrFont.isSymbolCharset) ||
    fontLow.includes('symbol');
  const isMtExtra = fontLow.includes('extra');
  const isGreekLower = styleOrFont.fnStyle === 4;
  const isGreekUpper = styleOrFont.fnStyle === 5;

  // MT Extra common single-byte glyphs (8-bit or 0xF000+ PUA)
  const lowByte = code & 0xff;
  if (isMtExtra && (code <= 0xff || (code >= 0xf020 && code <= 0xf0ff))) {
    if (lowByte === 0x4c || lowByte === 0x6c) return '\\ell ';
    if (lowByte === 0x72 || lowByte === 0x76) return '\\overrightarrow{}';
    if (lowByte === 0x43) return '\\cdots ';
    if (lowByte === 0x44) return '\\ddots ';
    if (lowByte === 0x4d) return '\\mp ';
  }

  // Windows Symbol-charset Private Use Area (0xF020..0xF0FF)
  if (code >= 0xf020 && code <= 0xf0ff) {
    const low = code & 0xff;
    if (isSymbolFont) {
      const sym = symbolByteToLatex(low, isGreekLower, isGreekUpper);
      if (sym) return sym;
    }
    if (low >= 0x20 && low <= 0x7e) {
      return asciiCharToLatex(String.fromCharCode(low));
    }
    return symbolByteToLatex(low, false, false);
  }

  // Standard 8-bit Symbol font codes in MTEF v3 / fontPos fallback
  if (isSymbolFont && code >= 0x20 && code <= 0xff) {
    if (isGreekLower || isGreekUpper || code >= 0x80 || code === 0x44 || code === 0x5e || code === 0x7e || code === 0x40) {
      const sym = symbolByteToLatex(code, isGreekLower, isGreekUpper);
      if (sym) return sym;
    }
  }

  if (code >= 0x20 && code <= 0x7e) {
    return asciiCharToLatex(String.fromCharCode(code));
  }

  // Ignore standalone Unicode combining marks (used in ornament slots of tmHAT/tmARC/tmVEC)
  if ((code >= 0x0300 && code <= 0x036f) || (code >= 0x20d0 && code <= 0x20ff) || code === 0x02c6 || code === 0x02dc) {
    return '';
  }

  switch (code) {
    case 0x00a0:
    case 0x2000:
    case 0x2001:
    case 0x2002:
    case 0x2003:
    case 0x2004:
    case 0x2005:
    case 0x2006:
    case 0x2007:
    case 0x2008:
    case 0x2009:
    case 0x200a:
    case 0x200b:
    case 0x202f:
    case 0x205f:
      return ' ';
    case 0x00b0:
    case 0x00ba:
    case 0x02da:
      return '^\\circ';
    case 0x2218:
      return '\\circ ';
    case 0x00b1:
      return '\\pm ';
    case 0x2213:
      return '\\mp ';
    case 0x00b2:
      return '^2';
    case 0x00b3:
      return '^3';
    case 0x00b9:
      return '^1';
    case 0x00bc:
      return '\\dfrac{1}{4}';
    case 0x00bd:
      return '\\dfrac{1}{2}';
    case 0x00be:
      return '\\dfrac{3}{4}';
    case 0x00b7:
    case 0x22c5:
    case 0x2219:
    case 0x2022:
      return '\\cdot ';
    case 0x00d7:
      return '\\times ';
    case 0x00f7:
      return '\\div ';
    case 0x2018:
    case 0x2019:
    case 0x2032:
      return "'";
    case 0x201c:
    case 0x201d:
    case 0x2033:
      return "''";
    case 0x2034:
      return "'''";
    case 0x2026:
      return '\\ldots ';
    case 0x22ef:
      return '\\cdots ';
    case 0x22ee:
      return '\\vdots ';
    case 0x22f1:
      return '\\ddots ';
    case 0x2102:
      return '\\mathbb{C}';
    case 0x210d:
      return '\\mathbb{H}';
    case 0x2113:
      return '\\ell ';
    case 0x2115:
      return '\\mathbb{N}';
    case 0x2119:
      return '\\mathbb{P}';
    case 0x211a:
      return '\\mathbb{Q}';
    case 0x211d:
      return '\\mathbb{R}';
    case 0x2124:
      return '\\mathbb{Z}';
    case 0x2190:
      return '\\leftarrow ';
    case 0x2191:
      return '\\uparrow ';
    case 0x2192:
      return '\\rightarrow ';
    case 0x2193:
      return '\\downarrow ';
    case 0x2194:
      return '\\leftrightarrow ';
    case 0x21d0:
      return '\\Leftarrow ';
    case 0x21d1:
      return '\\Uparrow ';
    case 0x21d2:
      return '\\Rightarrow ';
    case 0x21d3:
      return '\\Downarrow ';
    case 0x21d4:
      return '\\Leftrightarrow ';
    case 0x2200:
      return '\\forall ';
    case 0x2202:
      return '\\partial ';
    case 0x2203:
      return '\\exists ';
    case 0x2204:
      return '\\nexists ';
    case 0x2205:
    case 0x00d8:
    case 0x00f8:
      return '\\varnothing ';
    case 0x2207:
      return '\\nabla ';
    case 0x2208:
      return '\\in ';
    case 0x2209:
      return '\\notin ';
    case 0x220b:
      return '\\ni ';
    case 0x220f:
      return '\\prod ';
    case 0x2211:
      return '\\sum ';
    case 0x2212:
    case 0x2010:
    case 0x2011:
    case 0x2012:
    case 0x2013:
    case 0x2014:
      return '-';
    case 0x2215:
    case 0x2044:
      return '/';
    case 0x2216:
      return '\\setminus ';
    case 0x2217:
      return '\\ast ';
    case 0x221a:
      return '\\sqrt{}';
    case 0x221d:
      return '\\propto ';
    case 0x221e:
      return '\\infty ';
    case 0x221f:
      return '90^\\circ';
    case 0x2220:
    case 0x2221:
    case 0x2222:
    case 0x22be:
      return '\\angle ';
    case 0x2223:
      return '\\mid ';
    case 0x2224:
      return '\\nmid ';
    case 0x2225:
      return '\\parallel ';
    case 0x2226:
      return '\\nparallel ';
    case 0x2227:
      return '\\land ';
    case 0x2228:
      return '\\lor ';
    case 0x2229:
      return '\\cap ';
    case 0x222a:
      return '\\cup ';
    case 0x222b:
      return '\\int ';
    case 0x2234:
      return '\\therefore ';
    case 0x2235:
      return '\\because ';
    case 0x2236:
      return ':';
    case 0x223c:
      return '\\sim ';
    case 0x2243:
      return '\\simeq ';
    case 0x2245:
      return '\\cong ';
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
    case 0x226a:
      return '\\ll ';
    case 0x226b:
      return '\\gg ';
    case 0x2282:
      return '\\subset ';
    case 0x2283:
      return '\\supset ';
    case 0x2284:
      return '\\not\\subset ';
    case 0x2286:
      return '\\subseteq ';
    case 0x2287:
      return '\\supseteq ';
    case 0x2295:
      return '\\oplus ';
    case 0x2297:
      return '\\otimes ';
    case 0x22a5:
      return '\\perp ';
    case 0x25b2:
    case 0x25b3:
    case 0x25b4:
    case 0x25b5:
    case 0x25bd:
    case 0x0394:
    case 0x2206:
      return '\\triangle ';
    case 0x25cb:
    case 0x25ef:
      return '\\circ ';
    case 0x27e8:
    case 0x2329:
      return '\\langle ';
    case 0x27e9:
    case 0x232a:
      return '\\rangle ';
    // Greek Unicode (complete uppercase & lowercase)
    case 0x0393:
      return '\\Gamma ';
    case 0x0398:
      return '\\Theta ';
    case 0x039b:
      return '\\Lambda ';
    case 0x039e:
      return '\\Xi ';
    case 0x03a0:
      return '\\Pi ';
    case 0x03a3:
      return '\\Sigma ';
    case 0x03a5:
      return '\\Upsilon ';
    case 0x03a6:
      return '\\Phi ';
    case 0x03a8:
      return '\\Psi ';
    case 0x03a9:
      return '\\Omega ';
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
    case 0x03b6:
      return '\\zeta ';
    case 0x03b7:
      return '\\eta ';
    case 0x03b8:
    case 0x03d1:
      return '\\theta ';
    case 0x03b9:
      return '\\iota ';
    case 0x03ba:
      return '\\kappa ';
    case 0x03bb:
      return '\\lambda ';
    case 0x03bc:
      return '\\mu ';
    case 0x03bd:
      return '\\nu ';
    case 0x03be:
      return '\\xi ';
    case 0x03c0:
      return '\\pi ';
    case 0x03c1:
      return '\\rho ';
    case 0x03c2:
    case 0x03c3:
      return '\\sigma ';
    case 0x03c4:
      return '\\tau ';
    case 0x03c5:
      return '\\upsilon ';
    case 0x03c6:
    case 0x03d5:
      return '\\varphi ';
    case 0x03c7:
      return '\\chi ';
    case 0x03c8:
      return '\\psi ';
    case 0x03c9:
      return '\\omega ';
    // MathType private-use spaces/operators/symbols (0xE900..0xEF9F)
    case 0xe90b:
    case 0xe98f:
      return '\\triangle ';
    case 0xe922:
    case 0xe924:
      return '\\parallel ';
    case 0xe932:
    case 0xe933:
      return '\\angle ';
    case 0xeb01:
    case 0xeb02:
    case 0xef00:
    case 0xef01:
    case 0xef02:
    case 0xef03:
    case 0xef04:
    case 0xef05:
    case 0xef06:
    case 0xef07:
    case 0xef08:
      return ' ';
    default:
      // Actual Latin Extended & Vietnamese precomposed letters only (excludes 0x0250..0x036F modifiers/combining marks!)
      if ((code >= 0x00c0 && code <= 0x024f) || (code >= 0x1e00 && code <= 0x1ef9)) {
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
  private fontCharsets: number[] = [0]; // 1-indexed FONT charsets (2 = SYMBOL_CHARSET)

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
    const v = this.view.getInt16(this.pos, this.platform !== 0);
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
      else if (e === 5) out = `'${out}`;
      else if (e === 6) out = `\\dot{${out}}`;
      else if (e === 7) out = `\\ddot{${out}}`;
      else if (e === 8) out = `\\dddot{${out}}`;
      else if (e === 9) out = `${out}^\\circ`;
      else if (e === 10 || e === 11 || e === 21 || e === 22) out = `\\widehat{${out}}`;
      else if (e === 12 || e === 14 || e === 20) out = `\\overrightarrow{${out}}`;
      else if (e === 13 || e === 19) out = `\\overleftarrow{${out}}`;
      else if (e === 15 || e === 24) out = `\\overleftrightarrow{${out}}`;
      else if (e === 16) out = `\\widetilde{${out}}`;
      else if (e === 17) out = `\\overline{${out}}`;
      else if (e === 18) out = `\\underline{${out}}`;
    }
    return out;
  }

  /**
   * Formats MTEF template records using the exact Design Science MTEF selector enum (0..37):
   *  0=tmANGLE, 1=tmPAREN, 2=tmBRACE, 3=tmBRACK, 4=tmBAR, 5=tmDBAR, 6=tmFLOOR, 7=tmCEILING,
   *  8=tmOBRACK, 9=tmINTERVAL, 10=tmROOT, 11=tmFRACT, 12=tmUBAR, 13=tmOBAR, 14=tmARROW,
   * 15=tmINTEG, 16=tmSUM, 17=tmPROD, 18=tmCOPROD, 19=tmUNION, 20=tmINTER, 21=tmINTOP,
   * 22=tmSUMOP, 23=tmLIM, 24=tmHBRACE, 25=tmHBRACK, 26=tmLDIV, 27=tmSUB, 28=tmSUP,
   * 29=tmSUBSUP, 30=tmDIRAC, 31=tmVEC, 32=tmTILDE, 33=tmHAT, 34=tmARC, 35=tmJSTATUS,
   * 36=tmSTRIKE, 37=tmBOX.
   */
  private formatTemplate(selector: number, variation: number, slots: string[]): string {
    const s0 = (slots[0] ?? '').trim();
    const s1 = (slots[1] ?? '').trim();
    const s2 = (slots[2] ?? '').trim();
    const fenceBits = variation & 0x03;

    switch (selector) {
      case 0: // tmANGLE
        if (fenceBits === 1) return `\\left\\langle ${s0}\\right.`;
        if (fenceBits === 2) return `\\left.${s0}\\right\\rangle`;
        return `\\left\\langle ${s0} \\right\\rangle`;

      case 1: // tmPAREN
        if (fenceBits === 1) return `\\left(${s0}\\right.`;
        if (fenceBits === 2) return `\\left.${s0}\\right)`;
        return `\\left(${s0}\\right)`;

      case 2: // tmBRACE
        if (fenceBits === 1) {
          return `\\begin{cases}${s0}\\end{cases}`;
        }
        if (fenceBits === 2) {
          return `\\left.${s0}\\right\\}`;
        }
        return `\\left\\{${s0}\\right\\}`;

      case 3: // tmBRACK (supports Vietnamese "OR" equation systems with single left `[`)
        if (fenceBits === 1) {
          return s0.includes('\\\\')
            ? `\\left[\\begin{array}{l}${s0}\\end{array}\\right.`
            : `\\left[${s0}\\right.`;
        }
        if (fenceBits === 2) return `\\left.${s0}\\right]`;
        return `\\left[${s0}\\right]`;

      case 4: // tmBAR
        if (fenceBits === 1) return `\\left|${s0}\\right.`;
        if (fenceBits === 2) return `\\left.${s0}\\right|`;
        return `\\left|${s0}\\right|`;

      case 5: // tmDBAR
        if (fenceBits === 1) return `\\left\\|${s0}\\right.`;
        if (fenceBits === 2) return `\\left.${s0}\\right\\|`;
        return `\\left\\|${s0}\\right\\|`;

      case 6: // tmFLOOR
        return `\\left\\lfloor ${s0} \\right\\rfloor`;

      case 7: // tmCEILING
        return `\\left\\lceil ${s0} \\right\\rceil`;

      case 8: // tmOBRACK
        return `\\left[${s0}\\right]`;

      case 9: {
        // tmINTERVAL: unmatched/mixed interval fences (], [), ][, ()
        const leftMap = ['(', ')', '[', ']'];
        const rightMap = ['(', ')', '[', ']'];
        const lCh = leftMap[variation & 0x03] ?? '(';
        const rCh = rightMap[(variation >> 4) & 0x03] ?? ')';
        return `\\left${lCh}${s0}\\right${rCh}`;
      }

      case 10: // tmROOT (s0 = radicand, s1 = optional index)
        return s1 ? `\\sqrt[${s1}]{${s0}}` : `\\sqrt{${s0}}`;

      case 11: // tmFRACT (s0 = numerator, s1 = denominator)
        return `\\dfrac{${s0}}{${s1}}`;

      case 12: // tmUBAR
        return `\\underline{${s0}}`;

      case 13: // tmOBAR (segment bar over AB)
        return `\\overline{${s0}}`;

      case 14: // tmARROW (s0 = main slot, s1 = arrow glyph box — ignore s1!)
        if ((variation & 0x03) === 1) return `\\overleftarrow{${s0}}`;
        if ((variation & 0x03) === 2) return `\\overleftrightarrow{${s0}}`;
        return `\\overrightarrow{${s0}}`;

      case 15: // tmINTEG
      case 21: // tmINTOP
        return `\\int${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;

      case 16: // tmSUM
      case 22: // tmSUMOP
        return `\\sum${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;

      case 17: // tmPROD
        return `\\prod${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;

      case 18: // tmCOPROD
        return `\\coprod${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;

      case 19: // tmUNION
        return `\\bigcup${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;

      case 20: // tmINTER
        return `\\bigcap${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} ${s0}`;

      case 23: {
        // tmLIM: s0 is typically "lim", s1 is lower limit, s2 is upper limit
        if (/^\\?lim$/i.test(s0)) {
          return `\\lim${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} `;
        }
        const op = s0 || '\\lim';
        return `${op}${s1 ? `_{${s1}}` : ''}${s2 ? `^{${s2}}` : ''} `;
      }

      case 24: // tmHBRACE
        return variation & 0x01 ? `\\overbrace{${s0}}^{${s1}}` : `\\underbrace{${s0}}_{${s1}}`;

      case 25: // tmHBRACK
        return variation & 0x01 ? `\\overbrace{${s0}}^{${s1}}` : `\\underbrace{${s0}}_{${s1}}`;

      case 26: // tmLDIV
        return s1 ? `\\dfrac{${s0}}{${s1}}` : s0;

      case 27: {
        // tmSUB
        const sub = s0 || s1;
        return sub ? `_{${sub}}` : '';
      }

      case 28: {
        // tmSUP (handles degree superscripts like ^\circ cleanly without double ^^)
        const sup = s0 || s1;
        if (!sup) return '';
        if (sup === '^\\circ' || sup === '\\circ') return '^\\circ';
        return `^{${sup}}`;
      }

      case 29: {
        // tmSUBSUP
        const supPart =
          !s1 ? '' : s1 === '^\\circ' || s1 === '\\circ' ? '^\\circ' : `^{${s1}}`;
        return `${s0 ? `_{${s0}}` : ''}${supPart}`;
      }

      case 30: // tmDIRAC
        return `\\left\\langle ${s0} \\middle| ${s1} \\right\\rangle`;

      case 31: // tmVEC (s0 = main slot, s1 = vector arrow ornament — ignore s1!)
        if (variation & 0x01) return `\\overleftarrow{${s0}}`;
        if (variation & 0x02) return `\\overleftrightarrow{${s0}}`;
        return `\\overrightarrow{${s0}}`;

      case 32: // tmTILDE (s0 = main slot, s1 = tilde ornament — ignore s1!)
        return `\\widetilde{${s0}}`;

      case 33: // tmHAT (s0 = angle vertices e.g. CAD, s1 = U+0302 ornament — ignore s1!)
      case 34: // tmARC (s0 = angle/arc vertices e.g. CAD, s1 = arc ornament — ignore s1!)
        return `\\widehat{${s0}}`;

      case 35: // tmJSTATUS
        return `\\overleftrightarrow{${s0}}`;

      case 36: // tmSTRIKE
      case 37: // tmBOX
        return s0;

      default:
        return slots.filter(Boolean).join(' ');
    }
  }

  private resolveStyleAndFontV5(signedTf: number): {fnStyle: number; fontName: string; isSymbolCharset?: boolean} {
    if (signedTf > 0) {
      return {fnStyle: signedTf, fontName: ''};
    }
    const idx = -signedTf;
    return {
      fnStyle: 0,
      fontName: this.fontDefs[idx] ?? '',
      isSymbolCharset: this.fontCharsets[idx] === 2,
    };
  }

  private resolveStyleAndFontV3(rawTf: number): {fnStyle: number; fontName: string; isSymbolCharset?: boolean} {
    // In MTEF v3: rawTf > 128 => fnStyle = rawTf - 128; rawTf in 1..128 => explicit 1-based FONT tface!
    if (rawTf > 128) {
      return {fnStyle: rawTf - 128, fontName: ''};
    }
    return {
      fnStyle: 0,
      fontName: this.fontDefs[rawTf] ?? '',
      isSymbolCharset: this.fontCharsets[rawTf] === 2,
    };
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
        if (opts & 0x08) {
          if (this.buf[this.pos] === 7) this.pos += 1;
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
        const styleInfo = this.resolveStyleAndFontV5(signedTf);
        let ch = mtcode ? mtCodeToLatex(mtcode, styleInfo) : '';
        // Crucial fallback: if mtcode was in MathType's proprietary PUA (0xE000..0xEFFF) and unmapped,
        // fall back to the 8-bit/16-bit font glyph position!
        if (!ch && fontPos) {
          ch = mtCodeToLatex(fontPos, styleInfo);
        }
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
        if (opts & 0x08) {
          if (this.buf[this.pos] === 7) this.pos += 1;
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
        const encIdx = this.readMtefUint();
        const fontName = this.readCString();
        this.fontDefs.push(fontName);
        this.fontCharsets.push(encIdx === 2 || fontName.toLowerCase().includes('symbol') ? 2 : 0);
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
   * Record type is low nibble `raw & 0x0F`, options are high nibble `(raw >> 4) & 0x0F`:
   *   0x01 = xfNULL (tag & 0x10)
   *   0x02 = xfRULER / xfEMBELL (tag & 0x20)
   *   0x04 = xfLSPACE (tag & 0x40)
   *   0x08 = xfLMOVE / nudge (tag & 0x80)
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
        // LINE (v3: 0x08=xfLMOVE, 0x04=xfLSPACE [2 bytes], 0x02=xfRULER, 0x01=xfNULL)
        if (opts & 0x08) this.skipNudge();
        if (opts & 0x04) this.pos = Math.min(this.buf.length, this.pos + 2);
        if (opts & 0x02) {
          if ((this.buf[this.pos] & 0x0f) === 7) this.pos += 1;
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
        // CHAR (v3: 0x08=xfLMOVE, 0x02=xfEMBELL; 1-byte typeface + 16-bit char on Win v3 / 8-bit on Mac or v1-2)
        if (opts & 0x08) this.skipNudge();
        const rawTf = this.readU8();
        const code = this.ver < 3 || this.platform === 0 ? this.readU8() : this.readU16();
        let ch = code ? mtCodeToLatex(code, this.resolveStyleAndFontV3(rawTf)) : '';
        if (opts & 0x02) {
          const embells = this.readEmbellishmentsV3();
          if (ch) ch = this.applyEmbellishments(ch, embells);
        }
        return ch;
      }

      case 3: {
        // TMPL (v3: 0x08=xfLMOVE; 1-byte selector, 1-byte variation, 1-byte options)
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
        // PILE (v3: 0x08=xfLMOVE, 0x04=xfLSPACE [2 bytes], 0x02=xfRULER; halign + valign)
        if (opts & 0x08) this.skipNudge();
        if (opts & 0x04) this.pos = Math.min(this.buf.length, this.pos + 2);
        this.readU8(); // halign
        this.readU8(); // valign
        if (opts & 0x02) {
          if ((this.buf[this.pos] & 0x0f) === 7) this.pos += 1;
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
        // FONT in MTEF v3: tface (1..n), charset/style (2 = SYMBOL_CHARSET), null-terminated font name
        const tface = this.readU8();
        const charset = this.readU8();
        const fontName = this.readCString();
        if (tface > 0 && tface < 128) {
          this.fontDefs[tface] = fontName;
          this.fontCharsets[tface] = charset;
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

      case 15: {
        // COLOR / COLOR_DEF in MTEF v3.5+
        if (opts & 0x01) {
          this.pos = Math.min(this.buf.length, this.pos + 6);
        } else {
          this.readU8();
        }
        return '';
      }

      default:
        this.pos = this.buf.length;
        return '';
    }
  }

  public decode(): string | null {
    if (this.buf.length < 6) return null;
    this.ver = this.readU8();
    this.platform = this.readU8();
    if (this.platform !== 0 && this.platform !== 1) return null;

    let out = '';
    if (this.ver === 5) {
      // product, prodVer, prodSubVer
      this.pos += 3;
      // null-terminated application key (e.g., "DSMT4\0", "DSMT6\0", "DSMT7\0", "MTSM\0")
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

    const cleaned = postCleanDecodedLatex(out);
    return cleaned.length > 0 ? cleaned : null;
  }
}

function postCleanDecodedLatex(raw: string): string {
  return raw
    // Convert any leftover combining circumflex/breve/arc after angle vertices into \widehat{...}
    .replace(/([A-Za-z]{1,4})\s*[\u0302\u0306\u030c\u02c6\u2322\u2323\u0311]/g, '\\widehat{$1}')
    .replace(/([A-Za-z]{1,4})\s*[\u20d7\u20d6\u20e1]/g, '\\overrightarrow{$1}')
    .replace(/([A-Za-z]{1,4})\s*[\u0304\u0305]/g, '\\overline{$1}')
    // Strip any remaining orphan Unicode combining marks so KaTeX never throws ParseError
    .replace(/[\u0300-\u036f\u20d0-\u20ff]/g, '')
    .replace(/\s+/g, ' ')
    // Normalize Vietnamese trig aliases & unspaced trig functions (e.g. ABsinC -> AB\sin C, 50sin85^\circ -> 50\sin 85^\circ)
    .replace(/(^|[^\\a-zA-Z])cotg(?=\s*(?:\d|[A-Z]|\\|\(|\^|[abcxyzt]\b|$))/g, '$1\\cot ')
    .replace(/(^|[^\\a-zA-Z])tg(?=\s*(?:\d|[A-Z]|\\|\(|\^|[abcxyzt]\b|$))/g, '$1\\tan ')
    .replace(/(^|[^\\])(arcsin|arccos|arctan)(?=\s*(?:\d|[A-Z]|\\|\(|\^|[abcxyzt]\b|$))/g, '$1\\$2 ')
    .replace(/(^|[^\\a-z])(sin|cos|tan|cot)(?=\s*(?:\d|[A-Z]|\\|\(|\^|[abcxyzt]\b|$))/g, '$1\\$2 ')
    // Also catch lowercase side variables right before trig: e.g. `2bccosA` -> `2bc\cos A`, `bsinC` -> `b\sin C`
    .replace(/([a-z])(sin|cos|tan|cot)(?=\s*(?:\d|[A-Z]|\\|\(|\^|$))/g, '$1\\$2 ')
    // Normalize Vietnamese decimal comma inside formulas: 16,78 -> 16{,}78
    .replace(/(\d),(\d)/g, '$1{,}$2')
    // Normalize degree superscript written as ^0 or ^{0} right after a number in Vietnamese MathType docs
    .replace(/(\d)\s*\^\s*\{?\s*0\s*\}?(?!\d)/g, '$1^\\circ')
    // Avoid accidental double degree `^\circ^\circ` or `^{^\circ}`
    .replace(/\^\{\^\\circ\}/g, '^\\circ')
    .replace(/(\^\\circ)\s*\^\\circ/g, '$1')
    // Format trailing short length/area units cleanly (`24 m` / `408{,}71m` -> `408{,}71\ \mathrm{m}`)
    .replace(/(\d)\s*(km|cm|dm|mm|m)\^2(?=$|[.,;)])/g, '$1\\ \\mathrm{$2}^2')
    .replace(/(\d)\s*(km|cm|dm|mm|m)(?=$|[.,;)])/g, '$1\\ \\mathrm{$2}')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function decodeRawMtefBytes(mtefPayload: Uint8Array): string | null {
  try {
    const reader = new MtefReader(mtefPayload);
    return reader.decode();
  } catch {
    return null;
  }
}

function scanBufferForEmbeddedMtef(buf: Uint8Array): string | null {
  // 1. Scan for MTEF v5 header (`05 [00|01] prod ver sub "DSMT"|"MTSM"|"Math"`)
  for (let i = 5; i + 6 < buf.length; i++) {
    const isDsmt =
      buf[i] === 0x44 && buf[i + 1] === 0x53 && buf[i + 2] === 0x4d && buf[i + 3] === 0x54; // "DSMT"
    const isMtsm =
      buf[i] === 0x4d && buf[i + 1] === 0x54 && buf[i + 2] === 0x53 && buf[i + 3] === 0x4d; // "MTSM"
    if ((isDsmt || isMtsm) && buf[i - 5] === 5 && (buf[i - 4] === 0 || buf[i - 4] === 1)) {
      const res = decodeRawMtefBytes(buf.subarray(i - 5));
      if (res) return res;
    }
  }

  // 2. Scan for MTEF v3 header (`03 01 01 03 ...` followed by valid initial record 8/9/10/1)
  for (let i = 0; i + 8 < buf.length; i++) {
    if (
      buf[i] === 3 &&
      (buf[i + 1] === 1 || buf[i + 1] === 0) &&
      buf[i + 2] <= 3 &&
      buf[i + 3] >= 1 &&
      buf[i + 3] <= 7 &&
      buf[i + 4] <= 10
    ) {
      const firstRec = buf[i + 5] & 0x0f;
      if (firstRec === 10 || firstRec === 8 || firstRec === 9 || firstRec === 1) {
        const res = decodeRawMtefBytes(buf.subarray(i));
        if (res) return res;
      }
    }
  }
  return null;
}

/**
 * Decodes a MathType / Equation 3.0 OLE2 binary (`word/embeddings/*.bin`) into clean KaTeX LaTeX.
 */
export function decodeMathTypeOleToLatex(oleBytes: Uint8Array): string | null {
  try {
    const streams = extractAllCfbStreams(oleBytes);
    for (const s of streams) {
      if (s.data.length >= 6) {
        // 1. Standard EQNOLEFILEHDR (`cbHdr` uint16 at offset 0, typically 28 = 0x001C)
        if (s.data.length >= 16) {
          const hdrView = new DataView(s.data.buffer, s.data.byteOffset, s.data.byteLength);
          const cbHdr = hdrView.getUint16(0, true);
          if (cbHdr >= 14 && cbHdr < s.data.length) {
            const res = decodeRawMtefBytes(s.data.subarray(cbHdr));
            if (res) return res;
          }
        }
        // 2. Raw MTEF stream starting directly at offset 0
        if (s.data[0] >= 1 && s.data[0] <= 5 && (s.data[1] === 0 || s.data[1] === 1)) {
          const res = decodeRawMtefBytes(s.data);
          if (res) return res;
        }
        // 3. Scan inside reassembled stream (handles Ole10Native / Package wrappers)
        const scanned = scanBufferForEmbeddedMtef(s.data);
        if (scanned) return scanned;

        // 4. Check WMF/EMF comment inside stream
        const wmfRes = decodeMathTypeWmfToLatex(s.data);
        if (wmfRes) return wmfRes;
      }
    }

    // Fallback: scan raw bytes directly
    const rawScanned = scanBufferForEmbeddedMtef(oleBytes);
    if (rawScanned) return rawScanned;

    return decodeMathTypeWmfToLatex(oleBytes);
  } catch {
    return null;
  }
}

/**
 * Safe WMF `META_EXTTEXTOUT` / `META_TEXTOUT` reader used ONLY when a WMF equation preview
 * has no embedded MTEF comment AND contains no fraction/radical line geometry.
 */
function decodeSimpleWmfTextRecords(wmfBytes: Uint8Array): string | null {
  try {
    if (wmfBytes.length < 24) return null;
    const v = new DataView(wmfBytes.buffer, wmfBytes.byteOffset, wmfBytes.byteLength);
    let pos = 0;
    // Skip 22-byte Aldus Placeable WMF header (`0x9AC6CDD7`) if present
    if (v.getUint32(0, true) === 0x9ac6cdd7) {
      pos = 22;
    }
    if (pos + 18 > wmfBytes.length) return null;
    const mtType = v.getUint16(pos, true);
    const mtHeaderSize = v.getUint16(pos + 2, true);
    if ((mtType !== 1 && mtType !== 2) || mtHeaderSize !== 9) return null;
    pos += mtHeaderSize * 2;

    const gdiObjects: Array<{kind: 'font' | 'other'; isSymbol?: boolean; height?: number} | undefined> = [];
    const allocSlot = (obj: {kind: 'font' | 'other'; isSymbol?: boolean; height?: number}) => {
      const hole = gdiObjects.findIndex((x) => x === undefined);
      if (hole >= 0) gdiObjects[hole] = obj;
      else gdiObjects.push(obj);
    };

    let curIsSymbol = false;
    let hasGeometryLines = false;
    const runs: Array<{x: number; y: number; tex: string}> = [];
    const win1258 = new TextDecoder('windows-1252', {fatal: false});

    let guard = 0;
    while (pos + 6 <= wmfBytes.length && guard++ < 4000) {
      const rdSizeWords = v.getUint32(pos, true);
      const rdFunc = v.getUint16(pos + 4, true);
      if (rdFunc === 0x0000 || rdSizeWords < 3) break;
      const byteLen = rdSizeWords * 2;
      if (pos + byteLen > wmfBytes.length) break;
      const parm = pos + 6;

      if (
        rdFunc === 0x0213 || // META_LINETO
        rdFunc === 0x0325 || // META_POLYLINE
        rdFunc === 0x0324 || // META_POLYGON
        rdFunc === 0x0538 // META_POLYPOLYGON
      ) {
        hasGeometryLines = true;
        break;
      } else if (rdFunc === 0x02fb && byteLen >= 24) {
        // META_CREATEFONTINDIRECT
        const lfHeight = Math.abs(v.getInt16(parm, true));
        const lfCharSet = wmfBytes[parm + 13];
        let faceEnd = parm + 18;
        const maxFace = Math.min(pos + byteLen, parm + 50);
        while (faceEnd < maxFace && wmfBytes[faceEnd] !== 0) faceEnd++;
        const face = new TextDecoder('ascii', {fatal: false})
          .decode(wmfBytes.subarray(parm + 18, faceEnd))
          .toLowerCase();
        allocSlot({
          kind: 'font',
          isSymbol: lfCharSet === 2 || face.includes('symbol'),
          height: lfHeight,
        });
      } else if (
        rdFunc === 0x02fa || // META_CREATEPENINDIRECT
        rdFunc === 0x02fc || // META_CREATEBRUSHINDIRECT
        rdFunc === 0x00f7 || // META_CREATEPALETTE
        rdFunc === 0x01f9 || // META_CREATEPATTERNBRUSH
        rdFunc === 0x06ff // META_CREATEREGION
      ) {
        allocSlot({kind: 'other'});
      } else if (rdFunc === 0x01f0 && byteLen >= 8) {
        // META_DELETEOBJECT
        const idx = v.getUint16(parm, true);
        delete gdiObjects[idx];
      } else if (rdFunc === 0x012d && byteLen >= 8) {
        // META_SELECTOBJECT
        const idx = v.getUint16(parm, true);
        const obj = gdiObjects[idx];
        if (obj?.kind === 'font') {
          curIsSymbol = Boolean(obj.isSymbol);
        }
      } else if (rdFunc === 0x0a32 && byteLen >= 14) {
        // META_EXTTEXTOUT
        const y = v.getInt16(parm, true);
        const x = v.getInt16(parm + 2, true);
        const strLen = v.getUint16(parm + 4, true);
        const fwOpts = v.getUint16(parm + 6, true);
        const strOff = parm + 8 + (fwOpts & 0x0006 ? 8 : 0);
        if (strLen > 0 && strOff + strLen <= pos + byteLen) {
          let tex = '';
          const slice = wmfBytes.subarray(strOff, strOff + strLen);
          if (curIsSymbol) {
            for (let k = 0; k < slice.length; k++) {
              tex += symbolByteToLatex(slice[k], false, false);
            }
          } else {
            const decoded = win1258.decode(slice);
            for (const ch of decoded) {
              tex += mtCodeToLatex(ch.charCodeAt(0), {fnStyle: 0, fontName: ''});
            }
          }
          if (tex) runs.push({x, y, tex});
        }
      }
      pos += byteLen;
    }

    if (hasGeometryLines || runs.length === 0) return null;
    runs.sort((a, b) => a.x - b.x);
    const joined = postCleanDecodedLatex(runs.map((r) => r.tex).join(''));
    return joined.length > 0 ? joined : null;
  } catch {
    return null;
  }
}

/**
 * Fallback decoder for MathType preview metafiles (`word/media/image*.{wmf,emf}`) which embed MTEF
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

    // 2. Direct `"MathType\0"` WMF/EMF comment (MTEF v3 / MathType 4–5)
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

    // 3. Safe simple WMF text fallback (single symbols/variables/measurements without fraction/radical lines)
    return decodeSimpleWmfTextRecords(wmfBytes);
  } catch {
    return null;
  }
}

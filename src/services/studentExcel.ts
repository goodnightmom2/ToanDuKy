import * as XLSX from 'xlsx';

export const DEFAULT_BULK_STUDENT_PASSWORD = '11111111';

export interface BulkStudentDraftRow {
  stt: number;
  displayName: string;
  username: string;
  password: string;
  classId: string;
  className: string;
  classCode: string;
}

export interface BulkCreatedStudentRow {
  stt: number;
  studentCode: string;
  displayName: string;
  className: string;
  classCode: string;
  username: string;
  password: string;
  status: 'created' | 'failed';
  error?: string;
}

/**
 * Strips Vietnamese diacritics (including đ/Đ) into ASCII lowercase.
 */
export function stripVietnameseDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function toAsciiSlug(input: string): string {
  return stripVietnameseDiacritics(input).replace(/[^a-z0-9]/g, '');
}

/**
 * Generates a unique, readable username combining the student's name and class code
 * (e.g. "Nguyễn Văn An" + "10A1" -> "nguyenvanan_10a1" or "annv_toan10a1"),
 * always satisfying /^[a-z0-9._-]{3,24}$/.
 */
export function generateStudentUsername(
  displayName: string,
  classCode: string,
  takenUsernames: Set<string>,
): string {
  const classSlug = toAsciiSlug(classCode).slice(0, 10) || 'lop10';
  const nameWords = stripVietnameseDiacritics(displayName)
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let nameSlug = nameWords.join('');
  if (!nameSlug) nameSlug = 'hs';

  // Prefer full name + "_" + classSlug if <= 22 chars; otherwise givenName + initials + "_" + classSlug
  let base = `${nameSlug}_${classSlug}`;
  if (base.length > 22 && nameWords.length >= 2) {
    const givenName = nameWords[nameWords.length - 1];
    const initials = nameWords
      .slice(0, -1)
      .map((w) => w[0] ?? '')
      .join('');
    base = `${givenName}${initials}_${classSlug}`;
  }
  if (base.length > 22) {
    const maxNameLen = Math.max(3, 21 - classSlug.length);
    base = `${nameSlug.slice(0, maxNameLen)}_${classSlug}`;
  }
  if (base.length < 3) {
    base = `hs_${classSlug}`.slice(0, 22);
  }

  let candidate = base.slice(0, 24);
  let counter = 2;
  while (takenUsernames.has(candidate)) {
    const suffix = String(counter);
    candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`;
    counter += 1;
  }
  takenUsernames.add(candidate);
  return candidate;
}

/**
 * Downloads a ready-to-use Excel (.xlsx) template for teachers to paste their class roster.
 */
export function downloadStudentTemplateXlsx(className: string, classCode: string): void {
  const sampleRows = [
    {
      'STT': 1,
      'Họ và tên học sinh': 'Nguyễn Văn An',
      'Tên đăng nhập (để trống tự tạo)': '',
      'Mật khẩu (mặc định 11111111)': DEFAULT_BULK_STUDENT_PASSWORD,
    },
    {
      'STT': 2,
      'Họ và tên học sinh': 'Trần Thị Bích Ngọc',
      'Tên đăng nhập (để trống tự tạo)': '',
      'Mật khẩu (mặc định 11111111)': DEFAULT_BULK_STUDENT_PASSWORD,
    },
    {
      'STT': 3,
      'Họ và tên học sinh': 'Lê Hoàng Minh',
      'Tên đăng nhập (để trống tự tạo)': '',
      'Mật khẩu (mặc định 11111111)': DEFAULT_BULK_STUDENT_PASSWORD,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [{wch: 6}, {wch: 30}, {wch: 30}, {wch: 28}];

  const noteWs = XLSX.utils.aoa_to_sheet([
    ['HƯỚNG DẪN NHẬP DANH SÁCH HỌC SINH TOÁN DU KÝ'],
    [`Lớp đang chọn: ${className} (Mã lớp: ${classCode})`],
    ['1. Bạn chỉ cần điền cột "Họ và tên học sinh" (hoặc dán từ bảng điểm vnEdu/SMAS có cột "Họ đệm" và "Tên").'],
    ['2. Cột "Tên đăng nhập" để trống — hệ thống tự tạo tự động theo Tên + Mã lớp (không dấu, không trùng).'],
    [`3. Cột "Mật khẩu" để trống hoặc giữ nguyên sẽ tự đặt mật khẩu mặc định là ${DEFAULT_BULK_STUDENT_PASSWORD}.`],
    ['4. Lưu tệp (.xlsx) rồi tải lên mục Cấp tài khoản hàng loạt để cấp ngay cho cả lớp.'],
  ]);
  noteWs['!cols'] = [{wch: 92}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh_sach_HS');
  XLSX.utils.book_append_sheet(wb, noteWs, 'Huong_dan');

  const safeCode = toAsciiSlug(classCode || className) || 'lop';
  XLSX.writeFile(wb, `Mau_nhap_hoc_sinh_${safeCode}.xlsx`);
}

function normalizeHeader(raw: unknown): string {
  return stripVietnameseDiacritics(String(raw ?? ''))
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses an uploaded .xlsx, .xls, or .csv roster file into ready-to-provision student rows.
 * Supports both single "Họ và tên" column AND vnEdu/SMAS split "Họ đệm" + "Tên" columns.
 */
export async function parseStudentExcelFile(
  file: File,
  targetClass: {id: string; name: string; code: string},
  existingUsernames: Iterable<string>,
): Promise<{rows: BulkStudentDraftRow[]; error?: string}> {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, {type: 'array'});
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return {rows: [], error: 'Tệp Excel trống, không tìm thấy trang tính nào.'};
    }
    const ws = wb.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {header: 1, defval: ''});
    if (matrix.length === 0) {
      return {rows: [], error: 'Trang tính không có dữ liệu học sinh.'};
    }

    // Locate header row within first 10 rows
    let headerRowIdx = -1;
    let fullNameCol = -1;
    let surnameCol = -1;
    let givenNameCol = -1;
    let usernameCol = -1;
    let passwordCol = -1;

    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;
      let foundFull = -1;
      let foundSur = -1;
      let foundGiven = -1;
      let foundUser = -1;
      let foundPass = -1;

      for (let c = 0; c < row.length; c++) {
        const h = normalizeHeader(row[c]);
        if (!h) continue;
        if (
          h.includes('ho va ten') ||
          h.includes('ho ten') ||
          h === 'ten hoc sinh' ||
          h === 'hoc sinh' ||
          h === 'displayname' ||
          h === 'full name'
        ) {
          foundFull = c;
        } else if (h.includes('ho dem') || h === 'ho' || h === 'ho lot') {
          foundSur = c;
        } else if (h === 'ten' || h === 'ten goi') {
          foundGiven = c;
        } else if (
          h.includes('ten dang nhap') ||
          h.includes('tai khoan') ||
          h === 'username'
        ) {
          foundUser = c;
        } else if (h.includes('mat khau') || h === 'password') {
          foundPass = c;
        }
      }

      if (foundFull >= 0 || (foundSur >= 0 && foundGiven >= 0) || foundGiven >= 0) {
        headerRowIdx = r;
        fullNameCol = foundFull;
        surnameCol = foundSur;
        givenNameCol = foundGiven;
        usernameCol = foundUser;
        passwordCol = foundPass;
        break;
      }
    }

    // Fallback if no header found: assume col 1 (or col 0 if col 1 empty) is full name
    const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
    if (headerRowIdx < 0) {
      const firstRow = matrix[0] ?? [];
      fullNameCol = firstRow.length >= 2 && /^\d+$/.test(String(firstRow[0]).trim()) ? 1 : 0;
    }

    const taken = new Set<string>(
      Array.from(existingUsernames).map((u) => u.trim().toLowerCase()),
    );
    const rows: BulkStudentDraftRow[] = [];

    for (let r = startRow; r < matrix.length; r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;

      let displayName = '';
      if (fullNameCol >= 0) {
        displayName = String(row[fullNameCol] ?? '').trim();
      } else if (surnameCol >= 0 && givenNameCol >= 0) {
        displayName = `${String(row[surnameCol] ?? '').trim()} ${String(row[givenNameCol] ?? '').trim()}`.trim();
      } else if (givenNameCol >= 0) {
        displayName = String(row[givenNameCol] ?? '').trim();
      }

      if (!displayName || displayName.length < 2) continue;

      const rawUser = usernameCol >= 0 ? String(row[usernameCol] ?? '').trim().toLowerCase() : '';
      let username = '';
      if (rawUser && /^[a-z0-9._-]{3,24}$/.test(rawUser) && !taken.has(rawUser)) {
        username = rawUser;
        taken.add(username);
      } else {
        username = generateStudentUsername(displayName, targetClass.code, taken);
      }

      const rawPass = passwordCol >= 0 ? String(row[passwordCol] ?? '').trim() : '';
      const password = rawPass.length >= 8 ? rawPass : DEFAULT_BULK_STUDENT_PASSWORD;

      rows.push({
        stt: rows.length + 1,
        displayName,
        username,
        password,
        classId: targetClass.id,
        className: targetClass.name,
        classCode: targetClass.code,
      });
    }

    if (rows.length === 0) {
      return {
        rows: [],
        error: 'Không tìm thấy dòng họ tên học sinh hợp lệ nào trong tệp Excel. Hãy tải tệp mẫu để đúng định dạng cột.',
      };
    }

    return {rows};
  } catch (err) {
    return {
      rows: [],
      error: `Không thể đọc tệp Excel: ${err instanceof Error ? err.message : 'Định dạng không hợp lệ'}.`,
    };
  }
}

/**
 * Exports a formatted Excel (.xlsx) sheet of student accounts & passwords for a class.
 */
export function exportStudentAccountsXlsx(
  rows: BulkCreatedStudentRow[],
  className: string,
  classCode: string,
): void {
  const sheetData = rows.map((r, idx) => ({
    'STT': idx + 1,
    'Mã học sinh': r.studentCode,
    'Họ và tên học sinh': r.displayName,
    'Lớp': r.className,
    'Mã lớp': r.classCode,
    'Tên đăng nhập': r.username,
    'Mật khẩu': r.password,
    'Trạng thái': r.status === 'created' ? 'Đã cấp tài khoản' : `Lỗi: ${r.error ?? 'Chưa tạo'}`,
  }));

  const ws = XLSX.utils.json_to_sheet(sheetData);
  ws['!cols'] = [
    {wch: 6},
    {wch: 16},
    {wch: 28},
    {wch: 14},
    {wch: 14},
    {wch: 24},
    {wch: 18},
    {wch: 24},
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tai_khoan_HS');
  const safeCode = toAsciiSlug(classCode || className) || 'lop';
  XLSX.writeFile(wb, `Tai_khoan_hoc_sinh_${safeCode}.xlsx`);
}

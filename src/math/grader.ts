import {ERROR_CATALOG} from '../config.ts';
import type {GradeResult, QuestionItem} from '../types.ts';
import {formatViNumber, roundToPlaces} from './geometry.ts';

export interface ParsedNumericInput {
  valid: boolean;
  value?: number;
  unit?: string;
  rawDecimals?: number;
}

const UNIT_ALIASES: Record<string, string> = {
  m: 'm',
  met: 'm',
  mét: 'm',
  km: 'km',
  cm: 'cm',
  dm: 'dm',
  'm2': 'm²',
  'm^2': 'm²',
  'm²': 'm²',
  'cm2': 'cm²',
  'cm^2': 'cm²',
  'cm²': 'cm²',
  '°': 'degree',
  do: 'degree',
  độ: 'degree',
  deg: 'degree',
  degree: 'degree',
};

export function normalizeUnit(rawUnit?: string): string {
  if (!rawUnit) return '';
  const cleaned = rawUnit.trim().toLowerCase().replace(/\s+/g, '');
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

/**
 * Parses Vietnamese/international numeric strings with optional unit.
 * Examples: "55,3 m", "55.30", "70 độ", "70°", "750m", "0,5".
 */
export function parseVietnameseNumber(raw: string): ParsedNumericInput {
  const trimmed = raw.trim();
  if (!trimmed) return {valid: false};

  // Match signed decimal (comma or dot) followed by optional whitespace and optional unit
  const match = trimmed.match(/^([+-]?\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ỹ°^2²]*)$/);
  if (!match) return {valid: false};

  const numPart = match[1].replace(',', '.');
  const unitPart = match[2] ? normalizeUnit(match[2]) : undefined;
  const val = Number(numPart);
  if (!Number.isFinite(val)) return {valid: false};

  const dotIdx = numPart.indexOf('.');
  const rawDecimals = dotIdx >= 0 ? numPart.length - dotIdx - 1 : 0;

  return {
    valid: true,
    value: val,
    unit: unitPart,
    rawDecimals,
  };
}

export interface NumericGradeOptions {
  rawInput: string;
  expectedExact?: number;
  expectedRounded: number;
  decimalPlaces?: number;
  expectedUnit?: string;
  hasFixedUnitLabel?: boolean;
}

/**
 * Deterministic numeric grader:
 * - Normalizes comma and dot decimals.
 * - Checks unit separately (required if expectedUnit is present and input does not have a fixed unit label).
 * - Enforces rounding accuracy based on decimalPlaces (e.g., 55 vs 55.3 triggers E07).
 */
export function gradeNumericAnswer(opts: NumericGradeOptions): GradeResult {
  const parsed = parseVietnameseNumber(opts.rawInput);
  if (!parsed.valid || parsed.value === undefined) {
    return {
      isCorrect: false,
      errorCode: 'E07',
      feedback_vi:
        'Em hãy nhập một giá trị số hợp lệ (có thể dùng dấu phẩy hoặc dấu chấm, ví dụ 55,3).',
    };
  }

  const targetUnit = normalizeUnit(opts.expectedUnit);
  const givenUnit = normalizeUnit(parsed.unit);

  // Check unit mismatch or missing unit on free input
  if (targetUnit) {
    if (givenUnit && givenUnit !== targetUnit) {
      return {
        isCorrect: false,
        errorCode: 'E07',
        feedback_vi: `Đơn vị em nhập chưa khớp với đơn vị yêu cầu (${displayUnit(targetUnit)}). Hãy kiểm tra lại đơn vị đo.`,
      };
    }
    if (!givenUnit && !opts.hasFixedUnitLabel) {
      return {
        isCorrect: false,
        errorCode: 'E07',
        feedback_vi: `Em đã ghi số đo nhưng còn thiếu đơn vị (${displayUnit(targetUnit)}). Hãy bổ sung đơn vị rồi kiểm tra lại.`,
      };
    }
  }

  const places = opts.decimalPlaces ?? 0;
  const expected = roundToPlaces(opts.expectedRounded, places);
  const tolerance = places > 0 ? Math.pow(10, -(places + 2)) : 1e-4;
  const diff = Math.abs(parsed.value - expected);

  if (diff <= tolerance) {
    return {
      isCorrect: true,
      feedback_vi: `Chính xác! Em đã tính và làm tròn đúng kết quả ${formatViNumber(expected, places)}${targetUnit ? ' ' + displayUnit(targetUnit) : ''}.`,
    };
  }

  // Detect rounding mistake (close to exact/rounded value, e.g. 55 instead of 55.3, or 55.29 instead of 55.3)
  const exactRef = opts.expectedExact ?? opts.expectedRounded;
  const roundingBand = places > 0 ? Math.pow(10, -(places - 1)) * 0.6 : 1.1;
  if (Math.abs(parsed.value - exactRef) <= roundingBand) {
    return {
      isCorrect: false,
      errorCode: 'E07',
      feedback_vi: `Giá trị em tính đã rất gần đáp án, nhưng bước làm tròn chưa khớp yêu cầu (${places === 1 ? 'đến hàng phần mười 0,1' : places === 2 ? 'đến hàng phần trăm 0,01' : 'làm tròn số nguyên'}). Hãy kiểm tra chữ số kế tiếp rồi làm tròn lại.`,
    };
  }

  return {
    isCorrect: false,
    errorCode: 'E05',
    feedback_vi:
      'Kết quả số chưa khớp. Hãy kiểm tra lại công thức đã lập, chế độ độ (DEG) trên máy tính và phép tính cuối.',
  };
}

export function displayUnit(unit: string): string {
  if (unit === 'degree') return '°';
  return unit;
}

/**
 * Deterministic help invitation rule:
 * 1 wrong -> specific hint only, NEVER labels student.
 * >= helpAfterWrong consecutive wrongs -> invites help (Gợi ý / Bài dễ hơn / Tạm dừng).
 */
export function shouldOfferHelp(consecutiveWrongs: number, helpAfterWrong: number): boolean {
  return consecutiveWrongs >= Math.max(1, helpAfterWrong);
}

/**
 * Master deterministic grader for all question types.
 */
export function gradeQuestion(question: QuestionItem, response: unknown): GradeResult {
  const exp = question.expected_answer;

  if (question.type === 'mcq' || question.type === 'error_spot') {
    const selectedId = typeof response === 'string' ? response : '';
    const expectedChoice = String(exp.choice ?? exp.optionId ?? '');
    if (!selectedId) {
      return {
        isCorrect: false,
        feedback_vi: 'Em hãy chọn một phương án trước khi kiểm tra.',
      };
    }
    if (selectedId === expectedChoice) {
      return {
        isCorrect: true,
        feedback_vi: `Em đã chọn đúng phương án phù hợp. ${question.solution_vi}`,
      };
    }
    const chosenOpt = question.options?.find((o) => o.id === selectedId);
    const errCode = chosenOpt?.errorCode ?? question.anticipated_error_ids[0];
    const hint = errCode && ERROR_CATALOG[errCode] ? ERROR_CATALOG[errCode].stepHint : question.hints_vi[0];
    return {
      isCorrect: false,
      errorCode: errCode,
      feedback_vi: hint || 'Phương án này chưa khớp với dữ kiện. Hãy đối chiếu lại hình vẽ và thử lại.',
    };
  }

  if (question.type === 'true_false_multi') {
    const answerMap = (response ?? {}) as Record<string, boolean | undefined>;
    const statements = question.statements ?? [];
    const expectedMap = (exp.statements as Record<string, boolean> | undefined) ??
      Object.fromEntries(statements.map((s) => [s.id, s.isTrue]));
    const keys = statements.length > 0 ? statements.map((s) => s.id) : Object.keys(expectedMap);

    const unanswered = keys.filter((k) => typeof answerMap[k] !== 'boolean');
    if (unanswered.length > 0) {
      return {
        isCorrect: false,
        feedback_vi: `Em hãy chọn Đúng hoặc Sai cho đủ tất cả các ý (${unanswered.map((k) => k + ')').join(', ')}) trước khi kiểm tra.`,
      };
    }

    const wrongKeys = keys.filter((k) => Boolean(answerMap[k]) !== Boolean(expectedMap[k]));
    if (wrongKeys.length === 0) {
      return {
        isCorrect: true,
        feedback_vi: `Chính xác! Em đã đánh giá đúng cả ${keys.length} nhận định (${keys.join(', ')}).`,
      };
    }

    const correctCount = keys.length - wrongKeys.length;
    const firstWrongStmt = statements.find((s) => s.id === wrongKeys[0]);
    const errCode = firstWrongStmt?.errorCode ?? question.anticipated_error_ids[0];
    const hint = errCode && ERROR_CATALOG[errCode] ? ERROR_CATALOG[errCode].stepHint : question.hints_vi[0];
    return {
      isCorrect: false,
      errorCode: errCode,
      feedback_vi: `Em đã xác định đúng ${correctCount}/${keys.length} ý. Hãy kiểm tra lại nhận định ${wrongKeys.map((k) => `(${k})`).join(', ')}: ${hint ?? 'đối chiếu lại dữ kiện đề bài rồi thử lại.'}`,
    };
  }

  if (question.type === 'tap_diagram') {
    const selectedVertex = typeof response === 'string' ? response.trim().toUpperCase() : '';
    const expectedVertex = String(exp.vertex ?? '').toUpperCase();
    if (!selectedVertex) {
      return {
        isCorrect: false,
        feedback_vi: 'Em hãy chạm vào một đỉnh trên tam giác.',
      };
    }
    if (selectedVertex === expectedVertex) {
      return {
        isCorrect: true,
        feedback_vi: `Em đã chạm đúng đỉnh ${expectedVertex} đối diện cạnh đã nêu.`,
      };
    }
    return {
      isCorrect: false,
      errorCode: 'E01',
      needsDiscriminationE01: true,
      feedback_vi: `Đỉnh ${selectedVertex} đang là đầu mút của cạnh đã cho. Hãy chạm vào đỉnh không nằm trên cạnh đó rồi thử lại.`,
    };
  }

  if (question.type === 'matching') {
    const mapping = (response ?? {}) as Record<string, string>;
    const expectedEntries = Object.entries(exp);
    const allAnswered = expectedEntries.every(([k]) => Boolean(mapping[k]));
    if (!allAnswered) {
      return {
        isCorrect: false,
        feedback_vi: 'Em hãy ghép đủ tất cả các cặp cạnh và góc đối diện trước khi kiểm tra.',
      };
    }
    const wrongPairs = expectedEntries.filter(
      ([k, v]) => String(mapping[k]).toUpperCase() !== String(v).toUpperCase(),
    );
    if (wrongPairs.length === 0) {
      return {
        isCorrect: true,
        feedback_vi: 'Em đã ghép đúng toàn bộ các cặp cạnh với góc đối diện tương ứng.',
      };
    }
    const firstWrongSide = wrongPairs[0][0];
    return {
      isCorrect: false,
      errorCode: 'E01',
      needsDiscriminationE01: true,
      feedback_vi: `Kiểm tra lại cặp của cạnh ${firstWrongSide}: đỉnh đối diện là đỉnh không nằm trong tên cạnh ${firstWrongSide}.`,
    };
  }

  if (question.type === 'fill_relation') {
    const r = (response ?? {}) as {left?: number; right?: number};
    const expLeft = Number(exp.left_angle_degree);
    const expRight = Number(exp.right_angle_degree);
    if (r.left === undefined || r.right === undefined) {
      return {
        isCorrect: false,
        feedback_vi: 'Em hãy chọn đủ cả hai góc vào ô dấu hỏi trong tỉ số định lý Sin.',
      };
    }
    if (Number(r.left) === expLeft && Number(r.right) === expRight) {
      return {
        isCorrect: true,
        feedback_vi: `Em đã ghép đúng AC với góc B (${expLeft}°) và AB với góc C (${expRight}°).`,
      };
    }
    if (Number(r.left) === expRight && Number(r.right) === expLeft) {
      return {
        isCorrect: false,
        errorCode: 'E01',
        needsDiscriminationE01: true,
        feedback_vi:
          'Hai góc đang bị đổi chỗ cho nhau. Hãy chạm đỉnh đối diện đoạn AC và đỉnh đối diện đoạn AB rồi thử lại.',
      };
    }
    return {
      isCorrect: false,
      errorCode: 'E04',
      feedback_vi:
        'Tỉ số định lý Sin cần đặt sin của góc đối diện ngay dưới mỗi cạnh. Kiểm tra lại góc đối diện AC và AB.',
    };
  }

  if (question.type === 'measurement') {
    const r = (response ?? {}) as {AB?: string; A?: string; B?: string};
    const pAB = parseVietnameseNumber(String(r.AB ?? ''));
    const pA = parseVietnameseNumber(String(r.A ?? ''));
    const pB = parseVietnameseNumber(String(r.B ?? ''));
    const expAB = Number(exp.AB_m);
    const expA = Number(exp.BAC_degree);
    const expB = Number(exp.ABC_degree);
    if (!pAB.valid || !pA.valid || !pB.valid) {
      return {
        isCorrect: false,
        errorCode: 'E07',
        feedback_vi: 'Em hãy dùng công cụ đo và điền đủ 3 số đo AB, góc BAC và góc ABC.',
      };
    }
    const okAB = Math.abs((pAB.value ?? 0) - expAB) <= 0.1;
    const okA = Math.abs((pA.value ?? 0) - expA) <= 0.1;
    const okB = Math.abs((pB.value ?? 0) - expB) <= 0.1;
    if (okAB && okA && okB) {
      return {
        isCorrect: true,
        feedback_vi: `Em đã ghi đúng đầy đủ ba dữ kiện khảo sát: AB = ${expAB} m, góc BAC = ${expA}°, góc ABC = ${expB}°.`,
      };
    }
    const wrongParts: string[] = [];
    if (!okAB) wrongParts.push('độ dài AB');
    if (!okA) wrongParts.push('góc BAC');
    if (!okB) wrongParts.push('góc ABC');
    return {
      isCorrect: false,
      errorCode: 'E01',
      feedback_vi: `Hãy kiểm tra lại số đo ở mục: ${wrongParts.join(', ')} bằng cách đối chiếu hai tia tạo góc trên hình.`,
    };
  }

  if (question.type === 'agree_explain') {
    const r = (response ?? {}) as {agree?: boolean | null; cAngle?: string; explanation?: string};
    if (r.agree === null || r.agree === undefined) {
      return {
        isCorrect: false,
        feedback_vi: 'Em hãy chọn "Đồng ý" hoặc "Không đồng ý" trước khi kiểm tra.',
      };
    }
    const expectedAgree = Boolean(exp.agree);
    const expectedC = Number(exp.C_degree);
    const parsedC = parseVietnameseNumber(String(r.cAngle ?? ''));
    if (r.agree === expectedAgree && (!exp.C_degree || (parsedC.valid && Math.abs((parsedC.value ?? 0) - expectedC) < 0.1))) {
      return {
        isCorrect: true,
        feedback_vi: `Em đã kiểm chứng đúng góc C = ${expectedC}° = góc B nên tam giác cân tại A, suy ra AC = AB = ${exp.AC_m} m.`,
      };
    }
    if (r.agree === expectedAgree && exp.C_degree && (!parsedC.valid || Math.abs((parsedC.value ?? 0) - expectedC) >= 0.1)) {
      return {
        isCorrect: false,
        errorCode: 'E02',
        feedback_vi: 'Nhận định đồng ý đúng hướng rồi, nhưng em hãy tính lại góc C = 180° − A − B để chứng minh rõ ràng hơn.',
      };
    }
    return {
      isCorrect: false,
      errorCode: 'E08',
      feedback_vi: 'Hãy tính góc C từ tổng ba góc 180° trước, rồi so sánh góc C với góc B.',
    };
  }

  // Default: numeric
  const rawInput = typeof response === 'string' ? response : String(response ?? '');
  const expectedRounded = Number(exp.rounded ?? exp.value);
  const expectedExact = exp.exact_numeric !== undefined ? Number(exp.exact_numeric) : expectedRounded;
  const decimalPlaces = exp.decimal_places !== undefined ? Number(exp.decimal_places) : 0;
  const expectedUnit = exp.unit ? String(exp.unit) : undefined;

  return gradeNumericAnswer({
    rawInput,
    expectedExact,
    expectedRounded,
    decimalPlaces,
    expectedUnit,
    hasFixedUnitLabel: Boolean(question.fixedUnitLabel),
  });
}

export interface T01RubricBreakdown {
  total: number; // out of 10
  items: Array<{criterion: string; points: number; max: number; achieved: boolean}>;
}

/**
 * 10-point skill rubric for T01 (separate from XP):
 * AB = 40 m, A = 45°, B = 60° -> C = 75°, AC ≈ 35.9 m.
 */
export function computeT01Rubric(params: {
  angleCInput: string;
  acInput: string;
  hasFixedUnit?: boolean;
  explanation: string;
}): T01RubricBreakdown {
  const cParsed = parseVietnameseNumber(params.angleCInput);
  const cOk = Boolean(cParsed.valid && Math.abs((cParsed.value ?? 0) - 75) <= 0.1);

  const acParsed = parseVietnameseNumber(params.acInput);
  const acValueOk = Boolean(acParsed.valid && Math.abs((acParsed.value ?? 0) - 35.9) <= 0.05);
  const acUnitOk = Boolean(
    params.hasFixedUnit || (acParsed.valid && normalizeUnit(acParsed.unit) === 'm'),
  );

  const normExp = params.explanation.toLowerCase();
  const mentionsSineOrPair =
    normExp.includes('sin') || normExp.includes('đối diện') || normExp.includes('60') || normExp.includes('75');
  const mentionsMeaning = normExp.trim().length >= 15;

  const items = [
    {
      criterion: 'Tính đúng góc còn lại C = 180° − 45° − 60° = 75°',
      points: cOk ? 2 : 0,
      max: 2,
      achieved: cOk,
    },
    {
      criterion: 'Nêu được hướng ghép cặp cạnh–góc đối diện / Định lý Sin',
      points: mentionsSineOrPair ? 3 : 0,
      max: 3,
      achieved: mentionsSineOrPair,
    },
    {
      criterion: 'Tính và làm tròn đúng AC ≈ 35,9 đến hàng phần mười',
      points: acValueOk ? 3 : 0,
      max: 3,
      achieved: acValueOk,
    },
    {
      criterion: 'Ghi đúng đơn vị đo (m) và giải thích ngắn gọn rõ ý',
      points: (acUnitOk ? 1 : 0) + (mentionsMeaning ? 1 : 0),
      max: 2,
      achieved: acUnitOk && mentionsMeaning,
    },
  ];

  const total = items.reduce((sum, it) => sum + it.points, 0);
  return {total, items};
}

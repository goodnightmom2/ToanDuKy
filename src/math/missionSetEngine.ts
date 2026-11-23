import {BOSSES} from '../config.ts';
import {JOURNEY_MILESTONES_BY_ID} from '../journey.ts';
import type {
  MissionSetRecord,
  MissionSlot,
  MocId,
  QuestionItem,
  SkillCluster,
  TaxonomyPattern,
  UserAccount,
} from '../types.ts';
import {mulberry32, shuffleWithSeed} from './generators.ts';
import {DEFAULT_TAXONOMY_PATTERNS, inferPatternIdForQuestion} from './taxonomy.ts';

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1337;
}

/**
 * Returns approved standalone questions matching a slot's filters (excluding OUT-00 and non-standalone items).
 */
export function getEligibleBankForSlot(
  slot: MissionSlot,
  bank: QuestionItem[],
  allowPending = false,
): QuestionItem[] {
  const approvedPool = bank.filter(
    (q) =>
      q.standalone !== false &&
      q.pattern_id !== 'OUT-00' &&
      !(q.flags ?? []).includes('out_of_chapter') &&
      (q.review_status === 'approved' || (allowPending && q.review_status === 'pending_teacher_review')),
  );

  if (slot.mode === 'fixed') {
    const idSet = new Set(slot.fixedQuestionIds);
    return approvedPool.filter((q) => idSet.has(q.id));
  }

  const f = slot.filter ?? {};
  return approvedPool.filter((q) => {
    if (slot.role === 'boss_hit' && q.type === 'measurement') return false;
    if (f.clusters && f.clusters.length > 0 && !f.clusters.includes(q.cluster)) return false;
    if (f.patternIds && f.patternIds.length > 0) {
      const qPat = inferPatternIdForQuestion(q);
      if (!f.patternIds.includes(qPat)) return false;
    }
    const minLv = f.minLevel ?? slot.levelMin;
    const maxLv = f.maxLevel ?? slot.levelMax;
    if (q.level < minLv || q.level > maxLv) return false;
    if (f.types && f.types.length > 0 && !f.types.includes(q.type)) return false;
    return true;
  });
}

export interface SlotCoverageMetrics {
  slotId: string;
  available: number;
  needed: number;
  patternDiversity: number;
  sufficient: boolean;
  recommendedHealthy: boolean; // available >= 3 * needed for random mode
}

export function computeSlotCoverage(slot: MissionSlot, bank: QuestionItem[]): SlotCoverageMetrics {
  const matched = getEligibleBankForSlot(slot, bank, false);
  const patterns = new Set(matched.map((q) => inferPatternIdForQuestion(q)));
  const available = matched.length;
  const needed = Math.max(1, slot.count);
  return {
    slotId: slot.id,
    available,
    needed,
    patternDiversity: patterns.size,
    sufficient: available >= needed,
    recommendedHealthy: slot.mode === 'fixed' ? available >= needed : available >= needed * 3,
  };
}

/**
 * Deterministic rule-based Auto-Suggest for a milestone (Section 4):
 * - Matches milestone's clusters & levelRange (never leaks later-chapter patterns into early milestones)
 * - Strictly non-decreasing difficulty across slots
 * - Covers >= 2–3 distinct patterns where available
 * - Prefers `random` slots with filters so students draw diverse questions
 * - Generates matching BOSS slots from `BOSSES[mocDef.bossId].hitLevels`
 * - Preserves BS01 (Mốc 6) core S01–S08 flow by scoping editable slots to its practice/transfer/BOSS pool
 */
export function autoSuggestMissionSet(params: {
  mocId: MocId;
  classId?: string;
  bank: QuestionItem[];
  taxonomy?: TaxonomyPattern[];
  actorName: string;
  actorUid: string;
}): MissionSetRecord {
  const def = JOURNEY_MILESTONES_BY_ID[params.mocId];
  const taxonomy = params.taxonomy ?? DEFAULT_TAXONOMY_PATTERNS;
  const classId = params.classId || 'ALL';
  const now = new Date().toISOString();

  // Only patterns allowed at or before this milestone (prevents cosine/sine appearing in Mốc 1!)
  const allowedPatterns = taxonomy
    .filter(
      (p) =>
        p.status === 'active' &&
        p.topic !== 'OUT' &&
        def.clusters.includes(p.topic as SkillCluster) &&
        (p.suggested_mocs.length === 0 || p.suggested_mocs.some((m) => m <= params.mocId)),
    )
    .map((p) => p.id);

  const sortedLevels = [...def.levels].sort((a, b) => a - b);
  const minLv = sortedLevels[0] ?? 1;
  const maxLv = sortedLevels[sortedLevels.length - 1] ?? minLv;

  const slots: MissionSlot[] = [];

  if (def.isBS01Full) {
    // BS01 (Mốc 6): keep core S01-S08 flow intact; configure random practice & independent transfer slots
    slots.push(
      {
        id: `slot_m${params.mocId}_practice`,
        role: 'practice',
        label: 'Luyện bổ trợ thêm (Bốc ngẫu nhiên ngoài S01–S08)',
        mode: 'random',
        count: 2,
        levelMin: 2,
        levelMax: 3,
        requiredToPass: false,
        verifyMode: false,
        fixedQuestionIds: [],
        filter: {
          clusters: ['SIN', 'MH'],
          patternIds: allowedPatterns.length > 0 ? allowedPatterns : undefined,
          minLevel: 2,
          maxLevel: 3,
        },
      },
      {
        id: `slot_m${params.mocId}_transfer`,
        role: 'transfer',
        label: 'Tự giải kiểm chứng bổ sung (không gợi ý)',
        mode: 'random',
        count: 1,
        levelMin: 3,
        levelMax: 4,
        requiredToPass: true,
        verifyMode: true,
        fixedQuestionIds: [],
        filter: {
          clusters: ['SIN', 'MH'],
          minLevel: 3,
          maxLevel: 4,
        },
      },
    );
  } else {
    const totalCount = def.missionQuestionCount;
    const warmupCount = 1;
    const transferCount = 1;
    const mainCount = Math.max(1, totalCount - warmupCount - transferCount);

    // Split allowed patterns across slots to encourage >= 2-3 pattern diversity
    const warmupPats = allowedPatterns.length >= 2 ? allowedPatterns.slice(0, Math.ceil(allowedPatterns.length / 2)) : allowedPatterns;
    const mainPats = allowedPatterns;

    slots.push(
      {
        id: `slot_m${params.mocId}_warmup`,
        role: 'warmup',
        label: 'Ô 1 · Khởi động nhận diện',
        mode: 'random',
        count: warmupCount,
        levelMin: minLv,
        levelMax: minLv,
        requiredToPass: true,
        verifyMode: false,
        fixedQuestionIds: [],
        filter: {
          clusters: [...def.clusters],
          patternIds: warmupPats.length > 0 ? warmupPats : undefined,
          minLevel: minLv,
          maxLevel: minLv,
        },
      },
      {
        id: `slot_m${params.mocId}_main`,
        role: 'main',
        label: 'Ô 2 · Nhiệm vụ trọng tâm (tăng dần mức)',
        mode: 'random',
        count: mainCount,
        levelMin: minLv,
        levelMax: maxLv,
        requiredToPass: true,
        verifyMode: false,
        fixedQuestionIds: [],
        filter: {
          clusters: [...def.clusters],
          patternIds: mainPats.length > 0 ? mainPats : undefined,
          minLevel: minLv,
          maxLevel: maxLv,
        },
      },
      {
        id: `slot_m${params.mocId}_transfer`,
        role: 'transfer',
        label: 'Ô 3 · Tự giải kiểm chứng (không gợi ý)',
        mode: 'random',
        count: transferCount,
        levelMin: maxLv,
        levelMax: maxLv,
        requiredToPass: true,
        verifyMode: true,
        fixedQuestionIds: [],
        filter: {
          clusters: [...def.clusters],
          minLevel: maxLv,
          maxLevel: maxLv,
        },
      },
    );
  }

  // BOSS slots matching exact hitLevels from config.ts BOSSES
  const bossSlots: MissionSlot[] = [];
  if (def.bossId) {
    const boss = BOSSES[def.bossId];
    // Group consecutive identical hitLevels into clean BOSS slots
    let idx = 0;
    let groupNum = 1;
    while (idx < boss.hitLevels.length) {
      const lv = boss.hitLevels[idx];
      let run = 1;
      while (idx + run < boss.hitLevels.length && boss.hitLevels[idx + run] === lv) {
        run += 1;
      }
      bossSlots.push({
        id: `boss_${boss.id}_g${groupNum}`,
        role: 'boss_hit',
        label: `Đòn BOSS ${idx + 1}${run > 1 ? `–${idx + run}` : ''} (Mức ${lv})`,
        mode: 'random',
        count: run,
        levelMin: lv,
        levelMax: lv,
        requiredToPass: true,
        verifyMode: idx + run === boss.hitLevels.length, // Final blow in verify mode
        fixedQuestionIds: [],
        filter: {
          clusters: [...boss.clusters],
          minLevel: lv,
          maxLevel: lv,
        },
      });
      idx += run;
      groupNum += 1;
    }
  }

  return {
    id: `ms_moc_${params.mocId}_${classId}`,
    mocId: params.mocId,
    stationId: def.stationId,
    classId,
    status: 'draft',
    version: 1,
    slots,
    bossSlots,
    notes: `Tự động đề xuất theo cấu trúc Mốc ${params.mocId} (${def.city} — ${def.mathTopics}).`,
    createdBy: params.actorName,
    createdByUid: params.actorUid,
    createdAt: now,
    updatedAt: now,
  };
}

export interface MissionSetValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalAvailable: number;
  totalNeeded: number;
  patternDiversity: number;
}

/**
 * Validates a MissionSet before publishing (Section 4):
 * - Every slot has enough `approved` questions (blocks unapproved / rejected / OUT-00)
 * - Difficulty levels do not decrease along main mission slots
 * - No fixed question overlap between mission slots and BOSS slots of the same milestone
 * - `transfer` slot does not reuse any fixed question from `warmup`/`main`/`practice`
 */
export function validateMissionSet(
  missionSet: MissionSetRecord,
  bank: QuestionItem[],
): MissionSetValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bankById = new Map(bank.map((q) => [q.id, q]));

  const allMissionFixedIds = new Set<string>();
  const nonTransferFixedIds = new Set<string>();
  const allBossFixedIds = new Set<string>();
  const allMatchedIds = new Set<string>();
  const allPatterns = new Set<string>();
  let totalNeeded = 0;

  if (missionSet.slots.length === 0) {
    errors.push('Bộ nhiệm vụ phải có ít nhất 1 ô câu hỏi.');
  }

  // 1. Check mission slots
  let prevMaxLevel: number | null = null;
  for (const slot of missionSet.slots) {
    totalNeeded += Math.max(1, slot.count);

    // Non-decreasing difficulty across ordered mission slots
    if (prevMaxLevel !== null && slot.levelMax < prevMaxLevel) {
      errors.push(
        `Ô "${slot.label}" có mức tối đa (${slot.levelMax}) giảm so với ô trước (Mức ${prevMaxLevel}). Thứ tự độ khó phải không giảm dần.`,
      );
    }
    prevMaxLevel = Math.max(prevMaxLevel ?? 1, slot.levelMin);

    if (slot.mode === 'fixed') {
      if (slot.fixedQuestionIds.length < slot.count) {
        errors.push(
          `Ô cố định "${slot.label}" cần ${slot.count} câu nhưng mới chọn ${slot.fixedQuestionIds.length} câu.`,
        );
      }
      for (const qId of slot.fixedQuestionIds) {
        const q = bankById.get(qId);
        if (!q) {
          errors.push(`Ô "${slot.label}" tham chiếu câu [${qId}] không tồn tại trong Ngân hàng.`);
          continue;
        }
        if (q.review_status !== 'approved') {
          errors.push(`Câu [${qId}] trong ô "${slot.label}" chưa được Admin duyệt (chỉ dùng câu Đã duyệt).`);
        }
        if (q.pattern_id === 'OUT-00' || (q.flags ?? []).includes('out_of_chapter')) {
          errors.push(`Câu [${qId}] trong ô "${slot.label}" thuộc nhóm Ngoài chương (OUT-00).`);
        }
        if (slot.role === 'transfer' && nonTransferFixedIds.has(qId)) {
          errors.push(
            `Ô tự giải kiểm chứng "${slot.label}" dùng lại câu [${qId}] đã xuất hiện ở ô luyện tập trước đó.`,
          );
        }
        if (slot.role !== 'transfer') {
          nonTransferFixedIds.add(qId);
        }
        allMissionFixedIds.add(qId);
        allMatchedIds.add(qId);
        allPatterns.add(inferPatternIdForQuestion(q));
      }
    } else {
      const matched = getEligibleBankForSlot(slot, bank, false);
      for (const q of matched) {
        allMatchedIds.add(q.id);
        allPatterns.add(inferPatternIdForQuestion(q));
      }
      if (matched.length < slot.count) {
        errors.push(
          `Ô ngẫu nhiên "${slot.label}" thiếu câu đã duyệt: hiện có ${matched.length}/${slot.count} câu khớp bộ lọc.`,
        );
      } else if (matched.length < slot.count * 2) {
        warnings.push(
          `Ô "${slot.label}" mới có ${matched.length} câu cho ${slot.count} lượt bốc (khuyến nghị ≥ ${slot.count * 3} câu để mỗi học viên nhận đề khác nhau).`,
        );
      }
    }
  }

  // 2. Check BOSS slots & cross-overlap with mission slots
  for (const bSlot of missionSet.bossSlots) {
    totalNeeded += Math.max(1, bSlot.count);
    if (bSlot.mode === 'fixed') {
      if (bSlot.fixedQuestionIds.length < bSlot.count) {
        errors.push(`Ô BOSS "${bSlot.label}" cần ${bSlot.count} câu nhưng mới chọn ${bSlot.fixedQuestionIds.length} câu.`);
      }
      for (const qId of bSlot.fixedQuestionIds) {
        const q = bankById.get(qId);
        if (!q || q.review_status !== 'approved') {
          errors.push(`Ô BOSS "${bSlot.label}" chứa câu [${qId}] chưa được duyệt hoặc không tồn tại.`);
          continue;
        }
        if (allMissionFixedIds.has(qId)) {
          errors.push(`Câu [${qId}] bị trùng giữa Nhiệm vụ mốc và BOSS trong cùng Mốc ${missionSet.mocId}.`);
        }
        allBossFixedIds.add(qId);
        allMatchedIds.add(qId);
        allPatterns.add(inferPatternIdForQuestion(q));
      }
    } else {
      const matched = getEligibleBankForSlot(bSlot, bank, false);
      for (const q of matched) {
        allMatchedIds.add(q.id);
        allPatterns.add(inferPatternIdForQuestion(q));
      }
      if (matched.length < bSlot.count) {
        warnings.push(
          `Ô BOSS "${bSlot.label}" có ${matched.length}/${bSlot.count} câu tĩnh (trận đấu sẽ tự bổ sung biến thể tham số nếu thiếu).`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalAvailable: allMatchedIds.size,
    totalNeeded,
    patternDiversity: allPatterns.size,
  };
}

/**
 * Runtime deck resolver for `StationMission.tsx` reading a published `MissionSetRecord`.
 * - Shuffles MCQ options per student seed even on `fixed` slots
 * - Avoids recently answered questions & prioritizes skills currently in 'Đang luyện' / 'Cần ôn lại'
 * - Returns `QuestionItem[]` alongside per-question verifyMode flags
 */
export function resolveMissionSetQuestions(params: {
  missionSet: MissionSetRecord;
  userId: string;
  bank: QuestionItem[];
  skills: UserAccount['skills'];
  recentSessions: string[][];
  nonce?: number;
}): {questions: QuestionItem[]; verifyFlags: boolean[]} {
  const baseSeed = hashSeed(
    `${params.userId}|ms-${params.missionSet.id}|v${params.missionSet.version}|${params.nonce ?? 0}`,
  );
  const recentSet = new Set(params.recentSessions.slice(-3).flat());
  const usedIds = new Set<string>();
  const usedStems = new Set<string>();
  const questions: QuestionItem[] = [];
  const verifyFlags: boolean[] = [];

  const shuffleMcqOptions = (q: QuestionItem, seed: number): QuestionItem => {
    if (q.type !== 'mcq' || !q.options || q.options.length < 2) return q;
    return {
      ...q,
      options: shuffleWithSeed(q.options, seed),
    };
  };

  params.missionSet.slots.forEach((slot, slotIdx) => {
    const slotSeed = baseSeed ^ ((slotIdx + 1) * 2654435761);
    const rng = mulberry32(slotSeed >>> 0);
    const eligible = getEligibleBankForSlot(slot, params.bank, false);

    if (slot.mode === 'fixed') {
      for (const qId of slot.fixedQuestionIds.slice(0, slot.count)) {
        const found = eligible.find((q) => q.id === qId);
        if (found && !usedIds.has(found.id)) {
          usedIds.add(found.id);
          usedStems.add(found.stem_vi);
          questions.push(shuffleMcqOptions(found, Math.floor(rng() * 1e9)));
          verifyFlags.push(Boolean(slot.verifyMode));
        }
      }
      return;
    }

    // Random slot: prioritize skills needing practice + fresh (not in recentSessions)
    const fresh = eligible.filter(
      (q) => !usedIds.has(q.id) && !usedStems.has(q.stem_vi) && !recentSet.has(q.id),
    );
    const fallback = eligible.filter((q) => !usedIds.has(q.id) && !usedStems.has(q.stem_vi));
    const pool = fresh.length >= slot.count ? fresh : fallback;

    // Sort priority: skills in 'Cần ôn lại' / 'Đang luyện' first, then deterministic seeded shuffle
    const shuffled = shuffleWithSeed(pool, slotSeed >>> 0);
    shuffled.sort((a, b) => {
      const aNeed = ['Cần ôn lại', 'Đang luyện'].includes(params.skills[a.cluster]?.state) ? 0 : 1;
      const bNeed = ['Cần ôn lại', 'Đang luyện'].includes(params.skills[b.cluster]?.state) ? 0 : 1;
      return aNeed - bNeed;
    });

    let addedForSlot = 0;
    for (const q of shuffled) {
      if (addedForSlot >= slot.count) break;
      if (usedIds.has(q.id) || usedStems.has(q.stem_vi)) continue;
      usedIds.add(q.id);
      usedStems.add(q.stem_vi);
      questions.push(shuffleMcqOptions(q, Math.floor(rng() * 1e9)));
      verifyFlags.push(Boolean(slot.verifyMode));
      addedForSlot += 1;
    }
  });

  return {questions, verifyFlags};
}

/**
 * Runtime BOSS deck resolver reading `missionSet.bossSlots` if published.
 */
export function resolveBossSetQuestions(params: {
  missionSet: MissionSetRecord;
  userId: string;
  bank: QuestionItem[];
  recentSessions: string[][];
  nonce?: number;
}): QuestionItem[] {
  if (!params.missionSet.bossSlots || params.missionSet.bossSlots.length === 0) return [];
  const baseSeed = hashSeed(
    `${params.userId}|boss-${params.missionSet.id}|v${params.missionSet.version}|${params.nonce ?? 0}`,
  );
  const recentSet = new Set(params.recentSessions.slice(-2).flat());
  const usedIds = new Set<string>();
  const usedStems = new Set<string>();
  const deck: QuestionItem[] = [];

  params.missionSet.bossSlots.forEach((slot, idx) => {
    const slotSeed = (baseSeed ^ ((idx + 11) * 2246822519)) >>> 0;
    const eligible = getEligibleBankForSlot(slot, params.bank, false);
    if (slot.mode === 'fixed') {
      for (const qId of slot.fixedQuestionIds.slice(0, slot.count)) {
        const found = eligible.find((q) => q.id === qId);
        if (found && !usedIds.has(found.id)) {
          usedIds.add(found.id);
          usedStems.add(found.stem_vi);
          deck.push(found);
        }
      }
      return;
    }
    const fresh = eligible.filter((q) => !usedIds.has(q.id) && !usedStems.has(q.stem_vi) && !recentSet.has(q.id));
    const pool = fresh.length >= slot.count ? fresh : eligible.filter((q) => !usedIds.has(q.id) && !usedStems.has(q.stem_vi));
    const picked = shuffleWithSeed(pool, slotSeed).slice(0, slot.count);
    for (const q of picked) {
      usedIds.add(q.id);
      usedStems.add(q.stem_vi);
      deck.push(q);
    }
  });

  return deck;
}

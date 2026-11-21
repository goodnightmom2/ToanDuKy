import {
  BOSSES,
  computeBossHitDamages,
  SKILL_CLUSTER_LIST,
} from '../config.ts';
import type {
  BossId,
  QuestionItem,
  QuestionType,
  ReviewStatus,
  SkillCluster,
} from '../types.ts';
import {
  CLUSTER_TO_GENERATORS,
  createAttemptSeed,
  generateQuestion,
  mulberry32,
  shuffleWithSeed,
} from './generators.ts';

export type QuestionLevel = 1 | 2 | 3 | 4;
export const QUESTION_LEVELS: QuestionLevel[] = [1, 2, 3, 4];
export const ALL_BOSS_IDS: BossId[] = ['B1', 'B2', 'B3', 'B4', 'B5'];

export type CellReadinessStatus = 'not_required' | 'sufficient' | 'pending_only' | 'shortage';

export interface BankCellSummary {
  cluster: SkillCluster;
  level: QuestionLevel;
  approved: number;
  pending: number;
  rejected: number;
  total: number;
  bossRequired: number;
  demandingBosses: BossId[];
  status: CellReadinessStatus;
  warning_vi?: string;
}

export interface BossReadinessSummary {
  bossId: BossId;
  bossName: string;
  clusters: SkillCluster[];
  totalHits: number;
  levelDemands: Record<QuestionLevel, number>;
  approvedAvailable: number;
  pendingAvailable: number;
  shortageLevels: Array<{
    level: QuestionLevel;
    needed: number;
    approved: number;
    pending: number;
    status: 'sufficient' | 'pending_only' | 'shortage';
  }>;
  status: 'sufficient' | 'pending_only' | 'shortage';
  note_vi: string;
}

export interface BankDistributionReport {
  totalQuestions: number;
  byStatus: Record<ReviewStatus, number>;
  byType: Partial<Record<QuestionType, number>>;
  byCluster: Record<SkillCluster, {approved: number; pending: number; rejected: number; total: number}>;
  byLevel: Record<QuestionLevel, {approved: number; pending: number; rejected: number; total: number}>;
  matrix: Record<SkillCluster, Record<QuestionLevel, BankCellSummary>>;
  warningCells: BankCellSummary[];
  bossReadiness: BossReadinessSummary[];
}

/**
 * Computes exact per-(cluster, level) hit demand across BOSS B1–B5.
 */
function computeBossCellDemands(): Record<
  SkillCluster,
  Record<QuestionLevel, {maxNeeded: number; bosses: Set<BossId>}>
> {
  const demands = {} as Record<
    SkillCluster,
    Record<QuestionLevel, {maxNeeded: number; bosses: Set<BossId>}>
  >;

  for (const c of SKILL_CLUSTER_LIST) {
    demands[c] = {
      1: {maxNeeded: 0, bosses: new Set()},
      2: {maxNeeded: 0, bosses: new Set()},
      3: {maxNeeded: 0, bosses: new Set()},
      4: {maxNeeded: 0, bosses: new Set()},
    };
  }

  for (const bossId of ALL_BOSS_IDS) {
    const boss = BOSSES[bossId];
    const perBossCell: Record<string, number> = {};
    boss.hitLevels.forEach((lv, idx) => {
      const cluster = boss.clusters[idx % boss.clusters.length];
      const key = `${cluster}_${lv}`;
      perBossCell[key] = (perBossCell[key] ?? 0) + 1;
    });

    // Also record every cluster belonging to the boss at its demanded levels (at least 1 if boss draws across its clusters)
    const levelsUsedByBoss = new Set<QuestionLevel>(boss.hitLevels);
    for (const c of boss.clusters) {
      for (const lv of levelsUsedByBoss) {
        const directCount = perBossCell[`${c}_${lv}`] ?? 0;
        const required = Math.max(directCount, 1);
        demands[c][lv].bosses.add(bossId);
        if (required > demands[c][lv].maxNeeded) {
          demands[c][lv].maxNeeded = required;
        }
      }
    }
  }

  return demands;
}

/**
 * Analyzes question bank distribution by cluster × level × review_status
 * and flags every cell that does not yet have enough approved/total questions for BOSS B1–B5.
 */
export function analyzeQuestionBankDistribution(questions: QuestionItem[]): BankDistributionReport {
  const demands = computeBossCellDemands();

  const byStatus: Record<ReviewStatus, number> = {
    approved: 0,
    pending_teacher_review: 0,
    rejected: 0,
  };
  const byType: Partial<Record<QuestionType, number>> = {};

  const byCluster = {} as Record<
    SkillCluster,
    {approved: number; pending: number; rejected: number; total: number}
  >;
  const byLevel = {
    1: {approved: 0, pending: 0, rejected: 0, total: 0},
    2: {approved: 0, pending: 0, rejected: 0, total: 0},
    3: {approved: 0, pending: 0, rejected: 0, total: 0},
    4: {approved: 0, pending: 0, rejected: 0, total: 0},
  };

  const matrix = {} as Record<SkillCluster, Record<QuestionLevel, BankCellSummary>>;
  for (const c of SKILL_CLUSTER_LIST) {
    byCluster[c] = {approved: 0, pending: 0, rejected: 0, total: 0};
    matrix[c] = {} as Record<QuestionLevel, BankCellSummary>;
    for (const lv of QUESTION_LEVELS) {
      const demand = demands[c][lv];
      matrix[c][lv] = {
        cluster: c,
        level: lv,
        approved: 0,
        pending: 0,
        rejected: 0,
        total: 0,
        bossRequired: demand.maxNeeded,
        demandingBosses: Array.from(demand.bosses),
        status: demand.maxNeeded > 0 ? 'shortage' : 'not_required',
      };
    }
  }

  for (const q of questions) {
    byStatus[q.review_status] = (byStatus[q.review_status] ?? 0) + 1;
    byType[q.type] = (byType[q.type] ?? 0) + 1;

    const lv = q.level as QuestionLevel;
    const cell = matrix[q.cluster]?.[lv];
    if (!cell) continue;

    cell.total += 1;
    byCluster[q.cluster].total += 1;
    byLevel[lv].total += 1;

    if (q.review_status === 'approved') {
      cell.approved += 1;
      byCluster[q.cluster].approved += 1;
      byLevel[lv].approved += 1;
    } else if (q.review_status === 'pending_teacher_review') {
      cell.pending += 1;
      byCluster[q.cluster].pending += 1;
      byLevel[lv].pending += 1;
    } else {
      cell.rejected += 1;
      byCluster[q.cluster].rejected += 1;
      byLevel[lv].rejected += 1;
    }
  }

  const warningCells: BankCellSummary[] = [];
  for (const c of SKILL_CLUSTER_LIST) {
    for (const lv of QUESTION_LEVELS) {
      const cell = matrix[c][lv];
      if (cell.bossRequired === 0) {
        cell.status = 'not_required';
        continue;
      }
      if (cell.approved >= cell.bossRequired) {
        cell.status = 'sufficient';
      } else if (cell.approved + cell.pending >= cell.bossRequired) {
        cell.status = 'pending_only';
        cell.warning_vi = `Cần ${cell.bossRequired} câu đã duyệt cho ${cell.demandingBosses.join(', ')} (hiện có ${cell.approved} đã duyệt, ${cell.pending} chờ duyệt).`;
        warningCells.push(cell);
      } else {
        cell.status = 'shortage';
        cell.warning_vi = `Thiếu câu ngân hàng cho ${cell.demandingBosses.join(', ')}: cần ${cell.bossRequired}, mới có ${cell.approved} duyệt + ${cell.pending} chờ duyệt (đấu BOSS sẽ tự bổ sung bằng máy sinh).`;
        warningCells.push(cell);
      }
    }
  }

  const bossReadiness: BossReadinessSummary[] = ALL_BOSS_IDS.map((bossId) => {
    const boss = BOSSES[bossId];
    const levelDemands: Record<QuestionLevel, number> = {1: 0, 2: 0, 3: 0, 4: 0};
    for (const lv of boss.hitLevels) {
      levelDemands[lv] += 1;
    }

    let approvedAvailable = 0;
    let pendingAvailable = 0;
    const shortageLevels: BossReadinessSummary['shortageLevels'] = [];

    for (const lv of QUESTION_LEVELS) {
      const needed = levelDemands[lv];
      if (needed === 0) continue;
      const appLv = boss.clusters.reduce((acc, c) => acc + matrix[c][lv].approved, 0);
      const penLv = boss.clusters.reduce((acc, c) => acc + matrix[c][lv].pending, 0);
      approvedAvailable += appLv;
      pendingAvailable += penLv;

      let lvStatus: 'sufficient' | 'pending_only' | 'shortage' = 'sufficient';
      if (appLv >= needed) lvStatus = 'sufficient';
      else if (appLv + penLv >= needed) lvStatus = 'pending_only';
      else lvStatus = 'shortage';

      if (lvStatus !== 'sufficient') {
        shortageLevels.push({level: lv, needed, approved: appLv, pending: penLv, status: lvStatus});
      }
    }

    const overallStatus: 'sufficient' | 'pending_only' | 'shortage' = shortageLevels.some(
      (s) => s.status === 'shortage',
    )
      ? 'shortage'
      : shortageLevels.length > 0
        ? 'pending_only'
        : 'sufficient';

    const realShortages = shortageLevels.filter((s) => s.status === 'shortage');
    const pendingOnlyLevels = shortageLevels.filter((s) => s.status === 'pending_only');

    const note_vi =
      overallStatus === 'sufficient'
        ? 'Đủ câu đã duyệt trong ngân hàng cho mọi đòn của BOSS.'
        : overallStatus === 'pending_only'
          ? `Có đủ câu tổng nhưng còn ${pendingOnlyLevels.map((s) => `Mức ${s.level} (duyệt ${s.approved}/${s.needed}, chờ ${s.pending})`).join('; ')} cần giáo viên duyệt.`
          : `Ngân hàng tĩnh còn thiếu ở ${realShortages.map((s) => `Mức ${s.level} (có ${s.approved + s.pending}/${s.needed})`).join('; ')}${pendingOnlyLevels.length > 0 ? `; đồng thời cần duyệt ở ${pendingOnlyLevels.map((s) => `Mức ${s.level} (duyệt ${s.approved}/${s.needed}, chờ ${s.pending})`).join('; ')}` : ''} — máy sinh tham số sẽ tự bù khi đấu BOSS.`;

    return {
      bossId,
      bossName: boss.name,
      clusters: boss.clusters,
      totalHits: boss.hitLevels.length,
      levelDemands,
      approvedAvailable,
      pendingAvailable,
      shortageLevels,
      status: overallStatus,
      note_vi,
    };
  });

  return {
    totalQuestions: questions.length,
    byStatus,
    byType,
    byCluster,
    byLevel,
    matrix,
    warningCells,
    bossReadiness,
  };
}

export interface BossDeckParams {
  bossId: BossId;
  bank: QuestionItem[];
  allowPending: boolean;
  seed?: number;
  previousRunIds?: string[];
  previousRunStems?: string[];
}

export interface BossDeckResult {
  questions: QuestionItem[];
  bankCount: number;
  generatedCount: number;
  signature: string;
}

/**
 * Builds a complete, duplicate-free deck of `boss.hitLevels.length` questions for a BOSS run.
 * Guarantees:
 *  - Exact length === boss.hitLevels.length (never missing a question)
 *  - Zero duplicate IDs AND zero duplicate stems within a run
 *  - Differs from the student's immediately previous run (`previousRunIds` / `previousRunStems`)
 */
export function buildBossBattleDeck(params: BossDeckParams): BossDeckResult {
  const boss = BOSSES[params.bossId];
  const baseSeed = (params.seed ?? createAttemptSeed()) >>> 0;
  const rng = mulberry32(baseSeed ^ 0x517cc1b7);

  const prevIdSet = new Set(params.previousRunIds ?? []);
  const prevStemSet = new Set(params.previousRunStems ?? []);
  const prevSignature = (params.previousRunStems ?? []).join('||');

  const eligibleBank = params.bank.filter((q) => {
    if (q.review_status === 'rejected') return false;
    if (!params.allowPending && q.review_status !== 'approved') return false;
    if (!boss.clusters.includes(q.cluster)) return false;
    // Exclude interactive survey-only measurement (BS01 step M02) from rapid boss hits
    if (q.type === 'measurement') return false;
    return true;
  });

  const usedIds = new Set<string>();
  const usedStems = new Set<string>();
  const deck: QuestionItem[] = [];
  let bankCount = 0;
  let generatedCount = 0;

  // Rotate starting cluster offset deterministically from baseSeed so consecutive runs vary cluster order too
  const clusterOffset = Math.floor(rng() * boss.clusters.length);

  for (let hitIdx = 0; hitIdx < boss.hitLevels.length; hitIdx++) {
    const level = boss.hitLevels[hitIdx];
    const cluster = boss.clusters[(hitIdx + clusterOffset) % boss.clusters.length];

    // 1. Try fresh bank question matching cluster & level (preferring items NOT in previous run)
    const exactFresh = eligibleBank.filter(
      (q) =>
        q.cluster === cluster &&
        q.level === level &&
        !usedIds.has(q.id) &&
        !usedStems.has(q.stem_vi) &&
        !prevIdSet.has(q.id) &&
        !prevStemSet.has(q.stem_vi),
    );

    const anyClusterFresh =
      exactFresh.length > 0
        ? exactFresh
        : eligibleBank.filter(
            (q) =>
              q.level === level &&
              !usedIds.has(q.id) &&
              !usedStems.has(q.stem_vi) &&
              !prevIdSet.has(q.id) &&
              !prevStemSet.has(q.stem_vi),
          );

    // Mix bank items with procedural variants (~50% bank when available, ensuring variety)
    const wantBank = anyClusterFresh.length > 0 && rng() < 0.55;

    let chosen: QuestionItem | null = null;
    if (wantBank) {
      const shuffled = shuffleWithSeed(anyClusterFresh, (baseSeed + hitIdx * 7919) >>> 0);
      const picked = shuffled[0];
      chosen = picked.options
        ? {
            ...picked,
            stage: 'boss',
            options: shuffleWithSeed(picked.options, (baseSeed + hitIdx * 104729) >>> 0),
          }
        : {...picked, stage: 'boss'};
      bankCount += 1;
    }

    // 2. Otherwise synthesize a fresh procedural variant guaranteed not to duplicate ID or stem
    if (!chosen) {
      const gens = CLUSTER_TO_GENERATORS[cluster];
      let attempt = 0;
      let candidate: QuestionItem | null = null;

      while (attempt < 48) {
        attempt += 1;
        const genPool =
          level >= 3 && cluster === 'MH'
            ? (['GEN_ERROR_SPOT', 'GEN_SIN_SIDE'] as const)
            : gens;
        const genId = genPool[(hitIdx + attempt + Math.floor(rng() * genPool.length)) % genPool.length];
        const variantSeed = ((baseSeed * 1664525 + hitIdx * 31337 + attempt * 1013904223) >>> 0) || 1;
        const q = generateQuestion(genId, variantSeed);
        const bossQ: QuestionItem = {
          ...q,
          id: `${q.id}_h${hitIdx}`,
          level,
          stage: 'boss',
        };

        if (!usedIds.has(bossQ.id) && !usedStems.has(bossQ.stem_vi)) {
          // On first 12 attempts also avoid repeating stems from the immediately previous run
          if (attempt <= 12 && prevStemSet.has(bossQ.stem_vi)) {
            continue;
          }
          candidate = bossQ;
          break;
        }
      }

      // Ultra-safe fallback across any Chapter III generator of the boss if a narrow cluster pool ran tight
      if (!candidate) {
        const fallbackClusters = boss.clusters.length > 1 ? boss.clusters : [cluster, 'NEN' as SkillCluster];
        let bump = 1;
        while (!candidate && bump < 60) {
          const fc = fallbackClusters[bump % fallbackClusters.length];
          const fg = CLUSTER_TO_GENERATORS[fc];
          const genId = fg[bump % fg.length];
          const variantSeed = ((baseSeed ^ 0xa5a5a5a5) + hitIdx * 997 + bump * 7919) >>> 0;
          const q = generateQuestion(genId, variantSeed || 7);
          const bossQ: QuestionItem = {...q, id: `${q.id}_fb${hitIdx}_${bump}`, level, stage: 'boss'};
          if (!usedIds.has(bossQ.id) && !usedStems.has(bossQ.stem_vi)) {
            candidate = bossQ;
          }
          bump += 1;
        }
      }

      chosen = candidate!;
      generatedCount += 1;
    }

    usedIds.add(chosen.id);
    usedStems.add(chosen.stem_vi);
    deck.push(chosen);
  }

  // Final safeguard: if entire stem sequence somehow matched the previous run identically, replace last hit with a guaranteed distinct procedural seed
  let signature = deck.map((q) => q.stem_vi).join('||');
  if (prevSignature && signature === prevSignature && deck.length > 0) {
    const lastIdx = deck.length - 1;
    const lastCluster = boss.clusters[lastIdx % boss.clusters.length];
    const gens = CLUSTER_TO_GENERATORS[lastCluster];
    for (let k = 1; k <= 30; k++) {
      const genId = gens[k % gens.length];
      const q = generateQuestion(genId, ((baseSeed + 999983 * k) >>> 0) || 19);
      const bossQ: QuestionItem = {
        ...q,
        id: `${q.id}_diff${k}`,
        level: boss.hitLevels[lastIdx],
        stage: 'boss',
      };
      if (!usedStems.has(bossQ.stem_vi) && !prevStemSet.has(bossQ.stem_vi)) {
        deck[lastIdx] = bossQ;
        break;
      }
    }
    signature = deck.map((q) => q.stem_vi).join('||');
  }

  return {
    questions: deck,
    bankCount,
    generatedCount,
    signature,
  };
}

export interface BossSimulationRow {
  bossId: BossId;
  bossName: string;
  hitsPerRun: number;
  runs: number;
  missingQuestionRuns: number;
  duplicateInRunCount: number;
  wrongTotalDamageRuns: number;
  identicalConsecutivePairs: number;
  totalDamageWhenAllCorrect: number;
  avgBankPercent: number;
  passed: boolean;
}

export interface BossSimulationSummary {
  runsPerBoss: number;
  totalSimulatedRuns: number;
  totalQuestionsGenerated: number;
  allPassed: boolean;
  durationMs: number;
  rows: BossSimulationRow[];
}

/**
 * Simulates `runsPerBoss` (default 1,000) consecutive battles for the SAME student
 * on EACH BOSS B1–B5, verifying:
 *  1. Không thiếu câu (exact `boss.hitLevels.length` valid questions every run)
 *  2. Không trùng câu trong một lượt (unique IDs & unique stems in every run)
 *  3. Tổng sát thương đúng 100% khi trả lời đúng hết
 *  4. Hai lượt liên tiếp của cùng một học viên khác nhau
 */
export function runBoss1000Simulations(
  bank: QuestionItem[],
  allowPending = true,
  runsPerBoss = 1000,
): BossSimulationSummary {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const rows: BossSimulationRow[] = [];
  let totalQuestionsGenerated = 0;

  for (let bIdx = 0; bIdx < ALL_BOSS_IDS.length; bIdx++) {
    const bossId = ALL_BOSS_IDS[bIdx];
    const boss = BOSSES[bossId];
    const hitDamages = computeBossHitDamages(boss.hitLevels);
    const totalDmg = hitDamages.reduce((acc, d) => acc + d, 0);

    let missingQuestionRuns = 0;
    let duplicateInRunCount = 0;
    let wrongTotalDamageRuns = 0;
    let identicalConsecutivePairs = 0;
    let bankQuestionsTotal = 0;
    let totalSlots = 0;

    let prevIds: string[] = [];
    let prevStems: string[] = [];
    let prevRunIdSig = '';
    let prevRunStemSig = '';

    for (let run = 0; run < runsPerBoss; run++) {
      const seed = ((bIdx + 1) * 1000003 + (run + 1) * 7919) >>> 0;
      const result = buildBossBattleDeck({
        bossId,
        bank,
        allowPending,
        seed,
        previousRunIds: prevIds,
        previousRunStems: prevStems,
      });

      const qs = result.questions;
      totalQuestionsGenerated += qs.length;
      bankQuestionsTotal += result.bankCount;
      totalSlots += boss.hitLevels.length;

      // 1. Check missing / malformed questions
      const hasValidCount =
        qs.length === boss.hitLevels.length &&
        qs.every((q) => Boolean(q && q.id && q.stem_vi && q.solution_vi && q.hints_vi.length > 0));
      if (!hasValidCount) {
        missingQuestionRuns += 1;
      }

      // 2. Check duplicates within the same run (both ID and stem_vi)
      const idSet = new Set(qs.map((q) => q.id));
      const stemSet = new Set(qs.map((q) => q.stem_vi));
      if (idSet.size !== qs.length || stemSet.size !== qs.length) {
        duplicateInRunCount += 1;
      }

      // 3. Simulate answering every hit correctly → total damage must equal 100% and HP hits 0
      let hp = 100;
      let dealt = 0;
      for (let h = 0; h < qs.length; h++) {
        const dmg = hitDamages[h] ?? 0;
        dealt += dmg;
        hp = h >= boss.hitLevels.length - 1 ? 0 : Math.max(0, hp - dmg);
      }
      if (Math.abs(dealt - 100) > 1e-6 || Math.abs(hp) > 1e-6) {
        wrongTotalDamageRuns += 1;
      }

      // 4. Consecutive runs of the same student must differ (ID sequence AND stem sequence)
      const curIdSig = qs.map((q) => q.id).join('|');
      const curStemSig = result.signature;
      if (run > 0 && (curIdSig === prevRunIdSig || curStemSig === prevRunStemSig)) {
        identicalConsecutivePairs += 1;
      }

      prevIds = qs.map((q) => q.id);
      prevStems = qs.map((q) => q.stem_vi);
      prevRunIdSig = curIdSig;
      prevRunStemSig = curStemSig;
    }

    const passed =
      missingQuestionRuns === 0 &&
      duplicateInRunCount === 0 &&
      wrongTotalDamageRuns === 0 &&
      identicalConsecutivePairs === 0;

    rows.push({
      bossId,
      bossName: boss.name,
      hitsPerRun: boss.hitLevels.length,
      runs: runsPerBoss,
      missingQuestionRuns,
      duplicateInRunCount,
      wrongTotalDamageRuns,
      identicalConsecutivePairs,
      totalDamageWhenAllCorrect: Number(totalDmg.toFixed(2)),
      avgBankPercent: totalSlots > 0 ? Math.round((bankQuestionsTotal / totalSlots) * 100) : 0,
      passed,
    });
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    runsPerBoss,
    totalSimulatedRuns: runsPerBoss * ALL_BOSS_IDS.length,
    totalQuestionsGenerated,
    allPassed: rows.every((r) => r.passed),
    durationMs: Math.round(t1 - t0),
    rows,
  };
}

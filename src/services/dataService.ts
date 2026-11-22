import type {SupabaseClient} from '@supabase/supabase-js';
import {
  createInitialSkills,
  createInitialStations,
  DEFAULT_AVATAR,
  DEFAULT_SETTINGS,
  ERROR_CATALOG,
  OUTFITS,
} from '../config.ts';
import {
  ALL_MOC_IDS,
  applyAdminUnlockNextMoc,
  applyMocBossDefeated,
  applyMocMissionCompleted,
  canChallengeMocBoss,
  canEnterMoc,
  createInitialJourneyProgress,
  JOURNEY_MILESTONES_BY_ID,
  normalizeJourneyProgress,
} from '../journey.ts';
import {ALL_INITIAL_QUESTIONS} from '../math/seedBank.ts';
import {
  createEphemeralSupabaseClient,
  defaultSupabaseConfig,
  initSupabaseClient,
  isSupabaseConfigValid,
  testSupabaseConnection,
  toAuthEmail,
  type SupabasePublicConfig,
} from '../supabase.ts';
import type {
  AccountStatus,
  AppSettings,
  AttemptRecord,
  AvatarAppearance,
  BossId,
  ClassRoom,
  JourneyProgress,
  LearningEvent,
  MapPinCoords,
  MocId,
  PausedSession,
  QuestionItem,
  QuestionMode,
  RebuttalRecord,
  RemediationAssignment,
  ReviewStatus,
  SkillCluster,
  SkillRecord,
  SkillState,
  StationId,
  SurveyReportRecord,
  SyncResult,
  SyncStatus,
  UserAccount,
  UserRole,
} from '../types.ts';
import {clearDriveToken} from './drivePicker.ts';

export const USERNAME_REGEX = /^[a-z0-9._-]{3,24}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(username: string): {ok: boolean; message?: string} {
  const normalized = username.trim().toLowerCase();
  if (USERNAME_REGEX.test(normalized) || (normalized.length <= 64 && EMAIL_REGEX.test(normalized))) {
    return {ok: true};
  }
  return {
    ok: false,
    message: 'Tên đăng nhập dài 3–24 ký tự (a-z, 0-9, . _ -) hoặc địa chỉ email hợp lệ.',
  };
}

export function validatePassword(password: string): {ok: boolean; message?: string} {
  if (password.length < 8) {
    return {ok: false, message: 'Mật khẩu cần tối thiểu 8 ký tự để bảo vệ tài khoản.'};
  }
  return {ok: true};
}

export function getSyncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'saved':
      return 'Đã lưu';
    case 'pending_sync':
      return 'Chờ đồng bộ';
    case 'local_only':
    default:
      return 'Đang lưu trên máy này';
  }
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const input = `${salt}::toanduky::${password}`;
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback hash for non-subtle test contexts
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv_${(h >>> 0).toString(16)}`;
}

export function generateSalt(): string {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const arr = new Uint8Array(12);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function canAccessAdmin(user: UserAccount | null): boolean {
  return Boolean(user && (user.role === 'admin' || user.role === 'teacher'));
}

export function canEditSettingsOrUsers(user: UserAccount | null): boolean {
  return Boolean(user && user.role === 'admin');
}

/**
 * Compute updated skill state respecting pedagogical principle #5 & #6:
 * - "Tự làm được" is ONLY awarded on verified independent success (mode === 'verify' && !usedHint).
 * - Practice / assisted success grants at most "Làm được có hỗ trợ".
 */
export function computeNextSkillRecord(
  current: SkillRecord,
  attempt: {
    isCorrect: boolean;
    mode: QuestionMode;
    usedHint: boolean;
    clickedDontKnow: boolean;
    switchedToPractice?: boolean;
  },
): SkillRecord {
  const now = new Date().toISOString();
  const totalAttempts = current.totalAttempts + 1;
  let practiceCorrect = current.practiceCorrect;
  let verifyCorrect = current.verifyCorrect;
  let state: SkillState = current.state;
  let recentNote = current.recentNote;

  if (attempt.clickedDontKnow) {
    state = current.state === 'Chưa đủ dữ liệu' ? 'Đang luyện' : current.state;
    recentNote = 'Đang tìm hiểu khái niệm cơ bản';
  } else if (attempt.isCorrect) {
    if (attempt.mode === 'verify' && !attempt.usedHint && !attempt.switchedToPractice) {
      verifyCorrect += 1;
      state = 'Tự làm được';
      recentNote = 'Vừa tự giải đúng trong chế độ kiểm chứng (tại thời điểm hiện tại)';
    } else {
      practiceCorrect += 1;
      if (current.state !== 'Tự làm được') {
        state = 'Làm được có hỗ trợ';
      }
      recentNote = 'Làm đúng trong chế độ luyện tập / có gợi ý';
    }
  } else {
    if (current.state === 'Tự làm được') {
      state = 'Cần ôn lại';
      recentNote = 'Cần ôn lại bước vừa vướng';
    } else if (current.state === 'Chưa đủ dữ liệu') {
      state = 'Đang luyện';
      recentNote = 'Đang luyện bước đầu';
    }
  }

  return {
    ...current,
    state,
    lastUpdated: now,
    practiceCorrect,
    verifyCorrect,
    totalAttempts,
    recentNote,
  };
}

/**
 * Pure idempotent merge of local learning progress into remote user profile.
 * Strictly preserves remote immutable identity/role/class/status fields and avoids duplicate XP/items.
 */
export function mergeUserProgressIdempotent(remote: UserAccount, local: UserAccount): UserAccount {
  const unionStr = (a: string[] = [], b: string[] = []) => Array.from(new Set([...a, ...b]));

  const mergedAwardedKeys = unionStr(remote.awardedKeys, local.awardedKeys);
  const mergedXp = Math.max(remote.xp ?? 0, local.xp ?? 0);

  const mergedInventory = {
    outfits: unionStr(remote.inventory?.outfits, local.inventory?.outfits),
    tools: unionStr(remote.inventory?.tools, local.inventory?.tools),
    heroCards: unionStr(remote.inventory?.heroCards, local.inventory?.heroCards),
    landmarkCards: unionStr(remote.inventory?.landmarkCards, local.inventory?.landmarkCards),
    skillCards: unionStr(remote.inventory?.skillCards, local.inventory?.skillCards),
    upgradeShards: Math.max(remote.inventory?.upgradeShards ?? 0, local.inventory?.upgradeShards ?? 0),
    openedChests: unionStr(remote.inventory?.openedChests, local.inventory?.openedChests),
  };

  const stationIds: StationId[] = ['QS01', 'DD01', 'BS01', 'KV01', 'HT01'];
  const mergedStations = {...createInitialStations(), ...remote.stations};
  for (const sid of stationIds) {
    const rSt = remote.stations?.[sid] ?? mergedStations[sid];
    const lSt = local.stations?.[sid];
    if (!lSt) continue;
    mergedStations[sid] = {
      stationId: sid,
      explored: Boolean(rSt.explored || lSt.explored),
      missionCompleted: Boolean(rSt.missionCompleted || lSt.missionCompleted),
      bossDefeated: Boolean(rSt.bossDefeated || lSt.bossDefeated),
      openSurveyCompleted: Boolean(rSt.openSurveyCompleted || lSt.openSurveyCompleted),
      currentStepIndex: Math.max(rSt.currentStepIndex ?? 0, lSt.currentStepIndex ?? 0),
      completedStepIds: unionStr(rSt.completedStepIds, lSt.completedStepIds),
    };
  }

  const skillRank: Record<SkillState, number> = {
    'Chưa đủ dữ liệu': 0,
    'Đang luyện': 1,
    'Cần ôn lại': 2,
    'Làm được có hỗ trợ': 3,
    'Tự làm được': 4,
  };
  const clusters: SkillCluster[] = ['NEN', 'LG', 'COS', 'SIN', 'DT', 'MH'];
  const mergedSkills = {...createInitialSkills(), ...remote.skills};
  for (const c of clusters) {
    const rSk = remote.skills?.[c] ?? mergedSkills[c];
    const lSk = local.skills?.[c];
    if (!lSk) continue;
    const latest =
      new Date(lSk.lastUpdated || 0).getTime() >= new Date(rSk.lastUpdated || 0).getTime()
        ? lSk
        : rSk;
    const bestState = skillRank[lSk.state] > skillRank[rSk.state] ? lSk.state : rSk.state;
    mergedSkills[c] = {
      cluster: c,
      state: latest.state === 'Cần ôn lại' ? 'Cần ôn lại' : bestState,
      lastUpdated: latest.lastUpdated || rSk.lastUpdated,
      practiceCorrect: Math.max(rSk.practiceCorrect ?? 0, lSk.practiceCorrect ?? 0),
      verifyCorrect: Math.max(rSk.verifyCorrect ?? 0, lSk.verifyCorrect ?? 0),
      totalAttempts: Math.max(rSk.totalAttempts ?? 0, lSk.totalAttempts ?? 0),
      recentNote: latest.recentNote ?? rSk.recentNote,
    };
  }

  const rJourney = normalizeJourneyProgress(remote.journey);
  const lJourney = normalizeJourneyProgress(local.journey);
  const mergedPassedSet = new Set<MocId>([...rJourney.passedMoc, ...lJourney.passedMoc]);
  const mergedMocStatus: JourneyProgress['mocStatus'] = {...rJourney.mocStatus};
  for (const id of ALL_MOC_IDS) {
    const rs = rJourney.mocStatus[id];
    const ls = lJourney.mocStatus[id];
    if (!rs && !ls) continue;
    mergedMocStatus[id] = {
      mocId: id,
      explored: Boolean(rs?.explored || ls?.explored),
      missionCompleted: Boolean(rs?.missionCompleted || ls?.missionCompleted),
      bossDefeated: Boolean(rs?.bossDefeated || ls?.bossDefeated),
      passed: Boolean(rs?.passed || ls?.passed || mergedPassedSet.has(id)),
      passedAt: rs?.passedAt ?? ls?.passedAt,
      usedSupport: rs?.usedSupport ?? ls?.usedSupport,
      skillStars: Math.max(rs?.skillStars ?? 0, ls?.skillStars ?? 0) || undefined,
      unlockedByAdmin: Boolean(rs?.unlockedByAdmin || ls?.unlockedByAdmin),
    };
  }
  const mergedJourney = normalizeJourneyProgress({
    currentMoc: Math.max(rJourney.currentMoc, lJourney.currentMoc) as MocId,
    passedMoc: ALL_MOC_IDS.filter((id) => mergedPassedSet.has(id)),
    mocStatus: mergedMocStatus,
    completedAt: rJourney.completedAt ?? lJourney.completedAt,
    lastTransitionFrom: lJourney.lastTransitionFrom ?? rJourney.lastTransitionFrom ?? null,
    lastTransitionAt: lJourney.lastTransitionAt ?? rJourney.lastTransitionAt ?? null,
  });

  return {
    ...remote,
    // Protected fields strictly kept from remote:
    uid: remote.uid,
    role: remote.role,
    status: remote.status ?? (remote.locked ? 'locked' : 'active'),
    locked: remote.locked,
    classId: remote.classId,
    classCode: remote.classCode,
    studentCode: remote.studentCode,
    isTestAccount: remote.isTestAccount,
    teacherUid: remote.teacherUid,
    assignedClassIds: remote.assignedClassIds,
    createdAt: remote.createdAt,
    // Merge safe student-editable fields:
    displayName: remote.displayName || local.displayName,
    avatarCreated: Boolean(remote.avatarCreated || local.avatarCreated),
    avatar: local.avatarCreated ? local.avatar : remote.avatar,
    xp: mergedXp,
    awardedKeys: mergedAwardedKeys,
    inventory: mergedInventory,
    stations: mergedStations,
    journey: mergedJourney,
    skills: mergedSkills,
    pausedSession: local.pausedSession ?? remote.pausedSession,
    recentQuestionSessions:
      local.recentQuestionSessions?.length >= (remote.recentQuestionSessions?.length ?? 0)
        ? local.recentQuestionSessions.slice(-3)
        : (remote.recentQuestionSessions ?? []).slice(-3),
    leaderboardOptIn: local.leaderboardOptIn ?? remote.leaderboardOptIn,
    preferences: {...remote.preferences, ...local.preferences},
  };
}

export interface ClassCodeLookupDoc {
  code: string;
  classId: string;
  className: string;
  teacherUid: string;
  active: boolean;
  expiresAt?: string;
  expiresAtMs?: number;
}

export interface RegistrationRollbackDeps<TAuthUser> {
  createAuthUser: (email: string, password: string) => Promise<TAuthUser>;
  getAuthUid: (user: TAuthUser) => string;
  deleteAuthUser: (user: TAuthUser) => Promise<void>;
  lookupClassCode: (code: string) => Promise<ClassCodeLookupDoc | null>;
  writeUserDoc: (uid: string, lookup: ClassCodeLookupDoc) => Promise<UserAccount>;
}

/**
 * Pure orchestration helper for student registration with rollback.
 */
export async function registerStudentWithRollback<TAuthUser>(
  deps: RegistrationRollbackDeps<TAuthUser>,
  params: {email: string; password: string; classCode: string; nowMs?: number},
): Promise<{ok: boolean; user?: UserAccount; rolledBackAuth?: boolean; error?: string}> {
  let authUser: TAuthUser;
  try {
    authUser = await deps.createAuthUser(params.email, params.password);
  } catch (err) {
    return {
      ok: false,
      rolledBackAuth: false,
      error: err instanceof Error ? err.message : 'Không thể tạo tài khoản đăng nhập.',
    };
  }

  const normalizedCode = params.classCode.trim().toUpperCase();
  const nowMs = params.nowMs ?? Date.now();

  try {
    const lookup = await deps.lookupClassCode(normalizedCode);
    const expiredByIso = Boolean(lookup?.expiresAt && new Date(lookup.expiresAt).getTime() < nowMs);
    const expiredByMs = Boolean(lookup?.expiresAtMs && lookup.expiresAtMs < nowMs);

    if (!lookup || !lookup.active || expiredByIso || expiredByMs) {
      await deps.deleteAuthUser(authUser);
      return {
        ok: false,
        rolledBackAuth: true,
        error:
          expiredByIso || expiredByMs
            ? `Mã lớp "${normalizedCode}" đã hết hạn. Tài khoản vừa tạo đã được xóa tự động — hãy xin mã lớp mới từ giáo viên.`
            : `Mã lớp "${normalizedCode}" không tồn tại. Tài khoản vừa tạo đã được xóa tự động — hãy hỏi giáo viên mã lớp đúng.`,
      };
    }

    const createdUser = await deps.writeUserDoc(deps.getAuthUid(authUser), lookup);
    return {ok: true, user: createdUser, rolledBackAuth: false};
  } catch (err) {
    try {
      await deps.deleteAuthUser(authUser);
    } catch {
      // Best effort rollback
    }
    return {
      ok: false,
      rolledBackAuth: true,
      error: `Không thể hoàn tất đăng ký (${err instanceof Error ? err.message : 'Lỗi máy chủ'}). Tài khoản vừa tạo đã được thu hồi.`,
    };
  }
}

// =============================================================================
// Postgres Row <-> TypeScript Model Mappers
// =============================================================================

function rowToUser(row: Record<string, unknown>): UserAccount {
  const locked = Boolean(row.locked || row.status === 'locked');
  const rawInv = (row.inventory ?? {}) as Partial<UserAccount['inventory']>;
  const rawPrefs = (row.preferences ?? {}) as Partial<UserAccount['preferences']>;
  return {
    uid: String(row.uid ?? ''),
    username: String(row.username ?? ''),
    passwordHash: '',
    passwordSalt: '',
    role: (row.role as UserRole) ?? 'student',
    status: locked ? 'locked' : ((row.status as AccountStatus) ?? 'active'),
    displayName: String(row.display_name ?? 'Học viên khám phá'),
    realNamePrivate: row.real_name_private ? String(row.real_name_private) : undefined,
    studentCode: String(row.student_code ?? 'HS-10-01'),
    classId: String(row.class_id ?? 'cls_default'),
    classCode: String(row.class_code ?? 'TOAN10-01'),
    teacherUid: String(row.teacher_uid ?? row.uid ?? ''),
    assignedClassIds: Array.isArray(row.assigned_class_ids)
      ? (row.assigned_class_ids as string[])
      : [],
    researchConsent: Boolean(row.research_consent),
    isTestAccount: Boolean(row.is_test_account),
    locked,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    avatarCreated: Boolean(row.avatar_created),
    avatar: {...DEFAULT_AVATAR, ...((row.avatar as Partial<AvatarAppearance>) ?? {})},
    xp: Number(row.xp ?? 0),
    awardedKeys: Array.isArray(row.awarded_keys) ? (row.awarded_keys as string[]) : [],
    skills: {...createInitialSkills(), ...((row.skills as Record<SkillCluster, SkillRecord>) ?? {})},
    inventory: {
      outfits: rawInv.outfits ?? ['hoc_vien'],
      tools: rawInv.tools ?? ['tool_ruler'],
      heroCards: rawInv.heroCards ?? [],
      landmarkCards: rawInv.landmarkCards ?? [],
      skillCards: rawInv.skillCards ?? ['sk_angle_sum'],
      upgradeShards: rawInv.upgradeShards ?? 0,
      openedChests: rawInv.openedChests ?? [],
    },
    stations: {...createInitialStations(), ...((row.stations as Record<StationId, UserAccount['stations'][StationId]>) ?? {})},
    journey: normalizeJourneyProgress(row.journey as Partial<JourneyProgress> | undefined),
    pausedSession: (row.paused_session as PausedSession | null) ?? null,
    recentQuestionSessions: Array.isArray(row.recent_question_sessions)
      ? (row.recent_question_sessions as string[][])
      : [],
    leaderboardOptIn: Boolean(row.leaderboard_opt_in),
    preferences: {
      audioEnabled: rawPrefs.audioEnabled ?? false,
      reduceMotion: rawPrefs.reduceMotion ?? false,
      easyMove: rawPrefs.easyMove ?? false,
    },
  };
}

function userToRow(user: UserAccount): Record<string, unknown> {
  const status: AccountStatus = user.locked ? 'locked' : (user.status ?? 'active');
  return {
    uid: user.uid,
    username: user.username,
    role: user.role,
    status,
    locked: status === 'locked',
    display_name: user.displayName,
    real_name_private: user.realNamePrivate ?? null,
    student_code: user.studentCode,
    class_id: user.classId || 'cls_default',
    class_code: user.classCode || 'TOAN10-01',
    teacher_uid: user.teacherUid || user.uid,
    assigned_class_ids: user.assignedClassIds ?? [],
    research_consent: Boolean(user.researchConsent),
    is_test_account: Boolean(user.isTestAccount),
    avatar_created: Boolean(user.avatarCreated),
    avatar: user.avatar,
    xp: user.xp ?? 0,
    awarded_keys: user.awardedKeys ?? [],
    skills: user.skills,
    inventory: user.inventory,
    stations: user.stations,
    journey: normalizeJourneyProgress(user.journey),
    paused_session: user.pausedSession ?? null,
    recent_question_sessions: (user.recentQuestionSessions ?? []).slice(-3),
    leaderboard_opt_in: Boolean(user.leaderboardOptIn),
    preferences: user.preferences,
    created_at: user.createdAt,
  };
}

function userProgressUpdatePatch(user: UserAccount): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    avatar_created: Boolean(user.avatarCreated),
    avatar: user.avatar,
    xp: user.xp ?? 0,
    awarded_keys: user.awardedKeys ?? [],
    skills: user.skills,
    inventory: user.inventory,
    stations: user.stations,
    journey: normalizeJourneyProgress(user.journey),
    paused_session: user.pausedSession ?? null,
    recent_question_sessions: (user.recentQuestionSessions ?? []).slice(-3),
    leaderboard_opt_in: Boolean(user.leaderboardOptIn),
    preferences: user.preferences,
  };
  if (user.role !== 'student') {
    patch.display_name = user.displayName;
  }
  return patch;
}

function rowToClass(row: Record<string, unknown>): ClassRoom {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    codeExpiresAt: row.code_expires_at ? String(row.code_expires_at) : undefined,
    teacherUid: String(row.teacher_uid),
    archived: Boolean(row.archived),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function classToRow(cls: ClassRoom): Record<string, unknown> {
  return {
    id: cls.id,
    name: cls.name,
    code: cls.code,
    code_expires_at: cls.codeExpiresAt ?? null,
    teacher_uid: cls.teacherUid,
    archived: Boolean(cls.archived),
    created_at: cls.createdAt,
  };
}

function questionToRow(q: QuestionItem): Record<string, unknown> {
  return {
    id: q.id,
    station_id: q.stationId ?? null,
    stage: q.stage ?? null,
    cluster: q.cluster,
    level: q.level,
    type: q.type,
    review_status: q.review_status,
    payload: q,
    updated_at: new Date().toISOString(),
  };
}

function rowToQuestion(row: Record<string, unknown>): QuestionItem | null {
  const payload = row.payload as QuestionItem | undefined;
  if (!payload || !payload.id) return null;
  return {
    ...payload,
    review_status: (row.review_status as ReviewStatus) ?? payload.review_status,
  };
}

function attemptToRow(a: AttemptRecord): Record<string, unknown> {
  return {
    id: a.id,
    user_id: a.userId,
    student_code: a.studentCode,
    class_id: a.classId || 'cls_default',
    teacher_uid: a.teacherUid || a.userId,
    is_test_account: Boolean(a.isTestAccount),
    question_id: a.questionId,
    question_version: a.questionVersion ?? 1,
    question_snapshot: a.questionSnapshot ?? null,
    cluster: a.cluster,
    station_id: a.stationId ?? null,
    moc_id: a.mocId ?? null,
    mode: a.mode,
    switched_to_practice: Boolean(a.switchedToPractice),
    seed: a.seed ?? null,
    answer_raw: a.answerRaw ?? null,
    is_correct: Boolean(a.isCorrect),
    used_hint: Boolean(a.usedHint),
    clicked_dont_know: Boolean(a.clickedDontKnow),
    wrong_count_on_question: a.wrongCountOnQuestion ?? 0,
    error_code: a.errorCode ?? null,
    duration_ms: a.durationMs ?? 0,
    rubric_score: a.rubricScore ?? null,
    created_at: a.createdAt,
  };
}

function rowToAttempt(row: Record<string, unknown>): AttemptRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    studentCode: String(row.student_code),
    classId: row.class_id ? String(row.class_id) : undefined,
    teacherUid: row.teacher_uid ? String(row.teacher_uid) : undefined,
    isTestAccount: Boolean(row.is_test_account),
    questionId: String(row.question_id),
    questionVersion: typeof row.question_version === 'number' ? row.question_version : 1,
    questionSnapshot: row.question_snapshot ? String(row.question_snapshot) : undefined,
    cluster: row.cluster as SkillCluster,
    stationId: (row.station_id as StationId | null) ?? undefined,
    mocId: (row.moc_id as MocId | null) ?? undefined,
    mode: row.mode as QuestionMode,
    switchedToPractice: Boolean(row.switched_to_practice),
    seed: typeof row.seed === 'number' ? row.seed : undefined,
    answerRaw: row.answer_raw,
    isCorrect: Boolean(row.is_correct),
    usedHint: Boolean(row.used_hint),
    clickedDontKnow: Boolean(row.clicked_dont_know),
    wrongCountOnQuestion: Number(row.wrong_count_on_question ?? 0),
    errorCode: row.error_code ? String(row.error_code) : undefined,
    durationMs: Number(row.duration_ms ?? 0),
    rubricScore: typeof row.rubric_score === 'number' ? row.rubric_score : undefined,
    createdAt: String(row.created_at),
  };
}

function eventToRow(e: LearningEvent): Record<string, unknown> {
  return {
    event_id: e.eventId,
    user_id: e.userId,
    student_code: e.studentCode,
    class_id: e.classId || 'cls_default',
    teacher_uid: e.teacherUid || e.userId,
    is_test_account: Boolean(e.isTestAccount),
    type: e.type,
    payload: e.payload ?? {},
    created_at: e.createdAt,
  };
}

function rowToEvent(row: Record<string, unknown>): LearningEvent {
  return {
    eventId: String(row.event_id),
    userId: String(row.user_id),
    studentCode: String(row.student_code),
    classId: row.class_id ? String(row.class_id) : undefined,
    teacherUid: row.teacher_uid ? String(row.teacher_uid) : undefined,
    isTestAccount: Boolean(row.is_test_account),
    type: row.type as LearningEvent['type'],
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    synced: true,
  };
}

function rebuttalToRow(r: RebuttalRecord): Record<string, unknown> {
  return {
    id: r.id,
    user_id: r.userId,
    student_code: r.studentCode,
    class_id: r.classId || 'cls_default',
    teacher_uid: r.teacherUid || r.userId,
    display_name: r.displayName,
    question_id: r.questionId,
    question_stem: r.questionStem,
    student_answer: r.studentAnswer,
    contested_feedback: r.contestedFeedback,
    reasoning: r.reasoning,
    status: r.status,
    teacher_reply: r.teacherReply ?? null,
    created_at: r.createdAt,
    reviewed_at: r.reviewedAt ?? null,
  };
}

function rowToRebuttal(row: Record<string, unknown>): RebuttalRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    studentCode: String(row.student_code),
    classId: row.class_id ? String(row.class_id) : undefined,
    teacherUid: row.teacher_uid ? String(row.teacher_uid) : undefined,
    displayName: String(row.display_name),
    questionId: String(row.question_id),
    questionStem: String(row.question_stem),
    studentAnswer: String(row.student_answer),
    contestedFeedback: String(row.contested_feedback),
    reasoning: String(row.reasoning),
    status: row.status as RebuttalRecord['status'],
    teacherReply: row.teacher_reply ? String(row.teacher_reply) : undefined,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
  };
}

function reportToRow(r: SurveyReportRecord): Record<string, unknown> {
  return {
    id: r.id,
    user_id: r.userId,
    student_code: r.studentCode ?? null,
    class_id: r.classId || 'cls_default',
    teacher_uid: r.teacherUid || r.userId,
    station_id: r.stationId,
    measured_ab: r.measuredAB,
    measured_angle_a: r.measuredAngleA,
    measured_angle_b: r.measuredAngleB,
    computed_angle_c: r.computedAngleC,
    computed_ac: r.computedAC,
    t01_rubric_score: r.t01RubricScore ?? null,
    t01_explanation: r.t01Explanation ?? null,
    t02_agreed: r.t02Agreed ?? null,
    open_survey_note: r.openSurveyNote ?? null,
    created_at: r.createdAt,
  };
}

function rowToReport(row: Record<string, unknown>): SurveyReportRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    studentCode: row.student_code ? String(row.student_code) : undefined,
    classId: row.class_id ? String(row.class_id) : undefined,
    teacherUid: row.teacher_uid ? String(row.teacher_uid) : undefined,
    stationId: row.station_id as StationId,
    measuredAB: Number(row.measured_ab),
    measuredAngleA: Number(row.measured_angle_a),
    measuredAngleB: Number(row.measured_angle_b),
    computedAngleC: Number(row.computed_angle_c),
    computedAC: Number(row.computed_ac),
    t01RubricScore: typeof row.t01_rubric_score === 'number' ? row.t01_rubric_score : undefined,
    t01Explanation: row.t01_explanation ? String(row.t01_explanation) : undefined,
    t02Agreed: typeof row.t02_agreed === 'boolean' ? row.t02_agreed : undefined,
    openSurveyNote: row.open_survey_note ? String(row.open_survey_note) : undefined,
    createdAt: String(row.created_at),
  };
}

function settingsToRow(s: AppSettings): Record<string, unknown> {
  return {
    id: 'global',
    help_after_wrong: s.helpAfterWrong,
    allow_pending_in_test_mode: Boolean(s.allowPendingInTestMode),
    ai_enabled: Boolean(s.aiEnabled),
    ai_daily_quota_limit: s.aiDailyQuotaLimit,
    audio_default_on: Boolean(s.audioDefaultOn),
    drive_client_id: null,
    drive_api_key: null,
    journey_unlock_all_demo: Boolean(s.journeyUnlockAllDemo),
    map_background_data_url: s.mapBackgroundDataUrl ?? null,
    map_background_has_baked_labels: Boolean(s.mapBackgroundHasBakedLabels),
    map_pin_overrides: s.mapPinOverrides ?? {},
    updated_at: new Date().toISOString(),
  };
}

function rowToSettingsPatch(row: Record<string, unknown>): Partial<AppSettings> {
  return {
    helpAfterWrong: typeof row.help_after_wrong === 'number' ? row.help_after_wrong : undefined,
    allowPendingInTestMode:
      typeof row.allow_pending_in_test_mode === 'boolean'
        ? row.allow_pending_in_test_mode
        : undefined,
    aiEnabled: typeof row.ai_enabled === 'boolean' ? row.ai_enabled : undefined,
    aiDailyQuotaLimit:
      typeof row.ai_daily_quota_limit === 'number' ? row.ai_daily_quota_limit : undefined,
    audioDefaultOn: typeof row.audio_default_on === 'boolean' ? row.audio_default_on : undefined,
    driveClientId: row.drive_client_id ? String(row.drive_client_id) : undefined,
    driveApiKey: row.drive_api_key ? String(row.drive_api_key) : undefined,
    journeyUnlockAllDemo:
      typeof row.journey_unlock_all_demo === 'boolean' ? row.journey_unlock_all_demo : undefined,
    mapBackgroundDataUrl: row.map_background_data_url
      ? String(row.map_background_data_url)
      : undefined,
    mapBackgroundHasBakedLabels:
      typeof row.map_background_has_baked_labels === 'boolean'
        ? row.map_background_has_baked_labels
        : undefined,
    mapPinOverrides:
      row.map_pin_overrides && typeof row.map_pin_overrides === 'object'
        ? (row.map_pin_overrides as Partial<Record<MocId, MapPinCoords>>)
        : undefined,
  };
}

function mapSupabaseAuthError(err: {message?: string; status?: number} | null | undefined): {
  fallbackRecommended: boolean;
  message: string;
} {
  const raw = (err?.message ?? '').toLowerCase();
  if (raw.includes('failed to fetch') || raw.includes('network')) {
    return {
      fallbackRecommended: true,
      message: 'Không có kết nối mạng tới máy chủ hệ thống.',
    };
  }
  if (raw.includes('already registered') || raw.includes('already been registered')) {
    return {
      fallbackRecommended: false,
      message: 'Tên đăng nhập này đã được đăng ký. Hãy chọn tên khác hoặc chuyển sang Đăng nhập.',
    };
  }
  if (raw.includes('email not confirmed')) {
    return {
      fallbackRecommended: false,
      message: 'Tài khoản chưa được kích hoạt. Vui lòng liên hệ quản trị viên.',
    };
  }
  if (raw.includes('invalid login credentials')) {
    return {
      fallbackRecommended: false,
      message: 'Tên đăng nhập hoặc mật khẩu chưa đúng.',
    };
  }
  if (raw.includes('password') && raw.includes('weak')) {
    return {
      fallbackRecommended: false,
      message: 'Mật khẩu cần tối thiểu 8 ký tự.',
    };
  }
  if (raw.includes('rate limit') || err?.status === 429) {
    return {
      fallbackRecommended: false,
      message: 'Thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.',
    };
  }
  return {
    fallbackRecommended: false,
    message: err?.message || 'Lỗi xác thực tài khoản.',
  };
}

function remediationToRow(r: RemediationAssignment): Record<string, unknown> {
  return {
    id: r.id,
    student_uid: r.studentUid,
    student_code: r.studentCode,
    student_name: r.studentName,
    teacher_uid: r.teacherUid,
    class_id: r.classId,
    title: r.title,
    target_error_codes: r.targetErrorCodes,
    remediation_question_ids: r.remediationQuestionIds,
    verify_question_id: r.verifyQuestionId,
    teacher_note: r.teacherNote,
    status: r.status,
    remediation_completed_ids: r.remediationCompletedIds,
    verify_passed: Boolean(r.verifyPassed),
    created_at: r.createdAt,
    completed_at: r.completedAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

function rowToRemediation(row: Record<string, unknown>): RemediationAssignment {
  return {
    id: String(row.id),
    studentUid: String(row.student_uid),
    studentCode: String(row.student_code ?? ''),
    studentName: String(row.student_name ?? ''),
    teacherUid: String(row.teacher_uid),
    classId: String(row.class_id ?? 'cls_default'),
    title: String(row.title ?? 'Phiếu bổ trợ Toán 10'),
    targetErrorCodes: Array.isArray(row.target_error_codes)
      ? (row.target_error_codes as string[])
      : [],
    remediationQuestionIds: Array.isArray(row.remediation_question_ids)
      ? (row.remediation_question_ids as string[])
      : [],
    verifyQuestionId: String(row.verify_question_id ?? ''),
    teacherNote: String(row.teacher_note ?? ''),
    status: (row.status as RemediationAssignment['status']) ?? 'assigned',
    remediationCompletedIds: Array.isArray(row.remediation_completed_ids)
      ? (row.remediation_completed_ids as string[])
      : [],
    verifyPassed: Boolean(row.verify_passed),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  };
}

export interface StorageSchema {
  users: UserAccount[];
  currentUid: string | null;
  classes: ClassRoom[];
  questions: QuestionItem[];
  attempts: AttemptRecord[];
  events: LearningEvent[];
  rebuttals: RebuttalRecord[];
  reports: SurveyReportRecord[];
  remediationAssignments?: RemediationAssignment[];
  settings: AppSettings;
  syncedAttemptIds?: string[];
  syncedRebuttalIds?: string[];
  syncedReportIds?: string[];
  dirtyUserUids?: string[];
}

const STORAGE_KEY = 'toan_du_ky_db_v2';

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

function createInitialDb(): StorageSchema {
  const now = new Date().toISOString();
  return {
    users: [],
    currentUid: null,
    classes: [
      {
        id: 'cls_default',
        name: 'Toán 10',
        code: 'TOAN10-01',
        teacherUid: 'pending_admin',
        createdAt: now,
      },
    ],
    questions: ALL_INITIAL_QUESTIONS.map((q) => ({...q, version: 1, versionHistory: []})),
    attempts: [],
    events: [],
    rebuttals: [],
    reports: [],
    remediationAssignments: [],
    settings: {...DEFAULT_SETTINGS},
    syncedAttemptIds: [],
    syncedRebuttalIds: [],
    syncedReportIds: [],
    dirtyUserUids: [],
  };
}

export interface DataServiceOptions {
  enableSupabase?: boolean;
}

export class DataService {
  private store: KeyValueStore;
  private db: StorageSchema;
  private supabase: SupabaseClient | null = null;
  private authUnsubscribe: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private supabaseConfigured = false;
  private supabaseSignedInUid: string | null = null;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private remoteSetupExists: boolean | null = null;
  private lastCloudWriteFailed = false;
  public adapterMode: 'local' | 'supabase' = 'local';
  public lastNotice = '';

  constructor(customStore?: KeyValueStore, options?: DataServiceOptions) {
    this.store =
      customStore ??
      (typeof window !== 'undefined' && window.localStorage ? window.localStorage : new MemoryStore());
    this.db = this.load();

    const runtimeConfig = this.resolveSupabaseConfig();
    const shouldEnableSupabase =
      options?.enableSupabase ??
      (!customStore && typeof window !== 'undefined' && isSupabaseConfigValid(runtimeConfig));

    if (shouldEnableSupabase) {
      this.tryInitSupabase();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
        if (this.isSupabaseAuthenticated() && this.getPendingSyncCount() > 0) {
          void this.syncLocalDataToServer();
        }
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });
    }
  }

  private resolveSupabaseConfig(): Partial<SupabasePublicConfig> {
    const overrideUrl = this.db.settings.supabaseUrl?.trim();
    const overrideKey = this.db.settings.supabasePublishableKey?.trim();
    if (overrideUrl && overrideKey) {
      return {url: overrideUrl, publishableKey: overrideKey};
    }
    return defaultSupabaseConfig;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber error
      }
    }
  }

  private load(): StorageSchema {
    try {
      const raw = this.store.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = createInitialDb();
        this.save(fresh);
        return fresh;
      }
      const parsed = JSON.parse(raw) as Partial<StorageSchema>;
      const fresh = createInitialDb();
      const merged: StorageSchema = {
        users: Array.isArray(parsed.users)
          ? parsed.users.map((u) => ({
              ...u,
              status: u.locked ? 'locked' : (u.status ?? 'active'),
              classId: u.classId || 'cls_default',
              teacherUid: u.teacherUid || 'pending_admin',
              assignedClassIds: u.assignedClassIds ?? [],
              journey: normalizeJourneyProgress(u.journey),
            }))
          : fresh.users,
        currentUid: parsed.currentUid ?? null,
        classes:
          Array.isArray(parsed.classes) && parsed.classes.length > 0 ? parsed.classes : fresh.classes,
        questions: (() => {
          if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
            return fresh.questions;
          }
          const existingIds = new Set(parsed.questions.map((q) => q.id));
          const missingSeeds = fresh.questions.filter((q) => !existingIds.has(q.id));
          return missingSeeds.length > 0 ? [...parsed.questions, ...missingSeeds] : parsed.questions;
        })(),
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        rebuttals: Array.isArray(parsed.rebuttals) ? parsed.rebuttals : [],
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        remediationAssignments: Array.isArray(parsed.remediationAssignments)
          ? parsed.remediationAssignments
          : [],
        settings: {...DEFAULT_SETTINGS, ...(parsed.settings ?? {})},
        syncedAttemptIds: Array.isArray(parsed.syncedAttemptIds) ? parsed.syncedAttemptIds : [],
        syncedRebuttalIds: Array.isArray(parsed.syncedRebuttalIds) ? parsed.syncedRebuttalIds : [],
        syncedReportIds: Array.isArray(parsed.syncedReportIds) ? parsed.syncedReportIds : [],
        dirtyUserUids: Array.isArray(parsed.dirtyUserUids) ? parsed.dirtyUserUids : [],
      };
      return merged;
    } catch {
      const fresh = createInitialDb();
      this.save(fresh);
      return fresh;
    }
  }

  private save(next: StorageSchema): void {
    this.db = next;
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors in constrained environments
    }
    this.notify();
  }

  private tryInitSupabase(): void {
    try {
      if (this.authUnsubscribe) {
        this.authUnsubscribe();
        this.authUnsubscribe = null;
      }
      const cfg = this.resolveSupabaseConfig();
      const client = initSupabaseClient(cfg);
      if (client) {
        this.supabase = client;
        this.supabaseConfigured = true;
        this.adapterMode = 'supabase';

        // Eagerly check setup state on startup so new devices land directly on Login
        void this.checkFirstAdminSetupAsync();

        // Check existing session on startup
        void client.auth.getSession().then(({data}) => {
          const uid = data.session?.user?.id ?? null;
          this.supabaseSignedInUid = uid;
          if (uid) {
            this.adapterMode = 'supabase';
            void this.hydrateUserFromSupabase(uid);
          }
          this.notify();
        });

        const {
          data: {subscription},
        } = client.auth.onAuthStateChange((_event, session) => {
          const uid = session?.user?.id ?? null;
          this.supabaseSignedInUid = uid;
          if (uid) {
            this.adapterMode = 'supabase';
            void this.hydrateUserFromSupabase(uid);
          }
          this.notify();
        });
        this.authUnsubscribe = () => subscription.unsubscribe();
      } else {
        this.supabase = null;
        this.supabaseConfigured = false;
        this.adapterMode = 'local';
      }
    } catch {
      this.supabase = null;
      this.supabaseConfigured = false;
      this.adapterMode = 'local';
    }
  }

  isSupabaseConfigured(): boolean {
    return this.supabaseConfigured && Boolean(this.supabase);
  }

  isSupabaseAuthenticated(): boolean {
    return Boolean(this.isSupabaseConfigured() && this.supabaseSignedInUid);
  }

  getPendingSyncCount(): number {
    const user = this.getCurrentUser();
    const userIdSet = new Set<string>();
    if (user) {
      userIdSet.add(user.uid);
      for (const u of this.db.users) {
        if (u.username === user.username) userIdSet.add(u.uid);
      }
    }
    const syncedAtt = new Set(this.db.syncedAttemptIds ?? []);
    const syncedReb = new Set(this.db.syncedRebuttalIds ?? []);
    const syncedRep = new Set(this.db.syncedReportIds ?? []);

    const unsyncedEvents = this.db.events.filter(
      (e) => !e.synced && (!user || userIdSet.has(e.userId)),
    ).length;
    const unsyncedAttempts = this.db.attempts.filter(
      (a) => !syncedAtt.has(a.id) && (!user || userIdSet.has(a.userId)),
    ).length;
    const unsyncedRebuttals = this.db.rebuttals.filter(
      (r) => !syncedReb.has(r.id) && (!user || userIdSet.has(r.userId)),
    ).length;
    const unsyncedReports = this.db.reports.filter(
      (r) => !syncedRep.has(r.id) && (!user || userIdSet.has(r.userId)),
    ).length;
    const dirtyProfile =
      user && (this.db.dirtyUserUids ?? []).some((uid) => userIdSet.has(uid)) ? 1 : 0;

    return unsyncedEvents + unsyncedAttempts + unsyncedRebuttals + unsyncedReports + dirtyProfile;
  }

  getSyncStatus(): SyncStatus {
    if (!this.isSupabaseAuthenticated()) {
      return 'local_only';
    }
    if (!this.isOnline || this.lastCloudWriteFailed || this.getPendingSyncCount() > 0) {
      return 'pending_sync';
    }
    return 'saved';
  }

  getSyncStatusLabel(): string {
    return getSyncStatusLabel(this.getSyncStatus());
  }

  private markUserDirty(uid: string): void {
    const set = new Set(this.db.dirtyUserUids ?? []);
    set.add(uid);
    this.db = {...this.db, dirtyUserUids: Array.from(set)};
  }

  private clearUserDirty(uid: string): void {
    const next = (this.db.dirtyUserUids ?? []).filter((id) => id !== uid);
    this.save({...this.db, dirtyUserUids: next});
  }

  async testSupabaseConnection(): Promise<{ok: boolean; message: string}> {
    const res = await testSupabaseConnection(this.resolveSupabaseConfig());
    return {ok: res.ok, message: res.message};
  }

  /** @deprecated Alias kept for backward compatibility */
  async testFirebaseConnection(): Promise<{ok: boolean; message: string}> {
    return this.testSupabaseConnection();
  }

  // ---- HYDRATION FROM SUPABASE ----

  private async hydrateUserFromSupabase(uid: string): Promise<UserAccount | null> {
    if (!this.supabase) return null;
    try {
      const {data, error} = await this.supabase
        .from('users')
        .select('*')
        .eq('uid', uid)
        .maybeSingle();

      if (error || !data) return null;
      const remoteUser = rowToUser(data as Record<string, unknown>);

      const existingIdx = this.db.users.findIndex((u) => u.uid === uid);
      const nextUsers = [...this.db.users];
      if (existingIdx >= 0) {
        nextUsers[existingIdx] = mergeUserProgressIdempotent(remoteUser, nextUsers[existingIdx]);
      } else {
        nextUsers.push(remoteUser);
      }

      this.save({
        ...this.db,
        users: nextUsers,
        currentUid: uid,
      });

      await this.hydrateCollectionsForRole(remoteUser);
      this.lastNotice = '';
      if (this.getPendingSyncCount() > 0) {
        void this.syncLocalDataToServer();
      }
      return this.getCurrentUser();
    } catch (err) {
      console.error('[Supabase] hydrateUser error:', err);
      return null;
    }
  }

  private async hydrateCollectionsForRole(user: UserAccount): Promise<void> {
    if (!this.supabase) return;
    const sb = this.supabase;

    // 1. Global settings (+ staff-only integration settings for Admin/Teacher)
    try {
      const isStaff = user.role === 'admin' || user.role === 'teacher';
      const [setRes, staffSetRes] = await Promise.all([
        sb.from('app_settings').select('*').eq('id', 'global').maybeSingle(),
        isStaff
          ? sb.from('staff_settings').select('*').eq('id', 'global').maybeSingle()
          : Promise.resolve({data: null}),
      ]);
      const definedPatch: Partial<AppSettings> = {};
      if (setRes.data) {
        const patch = rowToSettingsPatch(setRes.data as Record<string, unknown>);
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined && k !== 'driveClientId' && k !== 'driveApiKey') {
            (definedPatch as Record<string, unknown>)[k] = v;
          }
        }
      }
      if (isStaff && staffSetRes.data) {
        const sRow = staffSetRes.data as Record<string, unknown>;
        definedPatch.driveClientId = sRow.drive_client_id ? String(sRow.drive_client_id) : undefined;
        definedPatch.driveApiKey = sRow.drive_api_key ? String(sRow.drive_api_key) : undefined;
      } else if (!isStaff) {
        definedPatch.driveClientId = undefined;
        definedPatch.driveApiKey = undefined;
      }
      this.save({
        ...this.db,
        settings: {...this.db.settings, ...definedPatch},
      });
    } catch {
      // Ignore if offline
    }

    // 2. Questions (RLS automatically scopes by role & test mode)
    try {
      const {data: qRows} = await sb.from('questions').select('*');
      if (Array.isArray(qRows) && qRows.length > 0) {
        const remoteMap = new Map<string, QuestionItem>();
        for (const q of this.db.questions) remoteMap.set(q.id, q);
        for (const row of qRows) {
          const item = rowToQuestion(row as Record<string, unknown>);
          if (item?.id) remoteMap.set(item.id, item);
        }
        this.save({...this.db, questions: Array.from(remoteMap.values())});
      }
    } catch (err) {
      console.error('[Supabase] hydrate questions error:', err);
    }

    // 3. Role-scoped users, classes, attempts, learning_events, rebuttals, survey_reports
    // Strictly REPLACE cached collections with RLS-scoped server rows (keeping ONLY unsynced own records)
    // to prevent cross-account data leakage on shared classroom computers.
    try {
      const mergeById = <T extends {id: string}>(localArr: T[], remoteArr: T[]): T[] => {
        const map = new Map<string, T>();
        for (const item of localArr) map.set(item.id, item);
        for (const item of remoteArr) map.set(item.id, item);
        return Array.from(map.values());
      };

      const isStaff = user.role === 'admin' || user.role === 'teacher';
      const [uRes, cRes, aRes, eRes, rebRes, repRes, remRes] = await Promise.all([
        isStaff ? sb.from('users').select('*') : Promise.resolve({data: null}),
        sb.from('classes').select('*'),
        sb.from('attempts').select('*'),
        sb.from('learning_events').select('*'),
        sb.from('rebuttals').select('*'),
        sb.from('survey_reports').select('*'),
        sb.from('remediation_assignments').select('*').order('created_at', {ascending: false}),
      ]);

      const syncedAttSet = new Set(this.db.syncedAttemptIds ?? []);
      const syncedRebSet = new Set(this.db.syncedRebuttalIds ?? []);
      const syncedRepSet = new Set(this.db.syncedReportIds ?? []);
      const dirtyUsersSet = new Set(this.db.dirtyUserUids ?? []);

      // Keep ONLY current user (+ any unsynced dirty local copy of current user) and RLS-returned users
      const userMap = new Map<string, UserAccount>();
      const localSelf = this.db.users.find((u) => u.uid === user.uid);
      userMap.set(user.uid, localSelf && dirtyUsersSet.has(user.uid) ? mergeUserProgressIdempotent(user, localSelf) : user);
      if (Array.isArray(uRes.data)) {
        for (const row of uRes.data) {
          const ru = rowToUser(row as Record<string, unknown>);
          if (!ru.uid) continue;
          const prev = userMap.get(ru.uid);
          userMap.set(ru.uid, prev && dirtyUsersSet.has(ru.uid) ? mergeUserProgressIdempotent(ru, prev) : ru);
        }
      }

      const remoteClasses = Array.isArray(cRes.data)
        ? cRes.data.map((r) => rowToClass(r as Record<string, unknown>))
        : [];
      const remoteAttempts = Array.isArray(aRes.data)
        ? aRes.data.map((r) => rowToAttempt(r as Record<string, unknown>))
        : [];
      const remoteEvents = Array.isArray(eRes.data)
        ? eRes.data.map((r) => rowToEvent(r as Record<string, unknown>))
        : [];
      const remoteRebuttals = Array.isArray(rebRes.data)
        ? rebRes.data.map((r) => rowToRebuttal(r as Record<string, unknown>))
        : [];
      const remoteReports = Array.isArray(repRes.data)
        ? repRes.data.map((r) => rowToReport(r as Record<string, unknown>))
        : [];
      const remoteRemediations = Array.isArray(remRes.data)
        ? remRes.data.map((r) => rowToRemediation(r as Record<string, unknown>))
        : [];

      const ownUnsyncedAttempts = this.db.attempts.filter(
        (a) => a.userId === user.uid && !syncedAttSet.has(a.id),
      );
      const ownUnsyncedEvents = this.db.events.filter((e) => e.userId === user.uid && !e.synced);
      const ownUnsyncedRebuttals = this.db.rebuttals.filter(
        (r) => r.userId === user.uid && !syncedRebSet.has(r.id),
      );
      const ownUnsyncedReports = this.db.reports.filter(
        (r) => r.userId === user.uid && !syncedRepSet.has(r.id),
      );

      const evMap = new Map<string, LearningEvent>();
      for (const ev of ownUnsyncedEvents) evMap.set(ev.eventId, ev);
      for (const ev of remoteEvents) evMap.set(ev.eventId, ev);

      this.save({
        ...this.db,
        users: Array.from(userMap.values()),
        classes: remoteClasses,
        attempts: mergeById(ownUnsyncedAttempts, remoteAttempts),
        events: Array.from(evMap.values()),
        rebuttals: mergeById(ownUnsyncedRebuttals, remoteRebuttals),
        reports: mergeById(ownUnsyncedReports, remoteReports),
        remediationAssignments: remoteRemediations,
        syncedAttemptIds: remoteAttempts.map((a) => a.id),
        syncedRebuttalIds: remoteRebuttals.map((r) => r.id),
        syncedReportIds: remoteReports.map((r) => r.id),
      });
    } catch (err) {
      console.error('[Supabase] hydrate collections error:', err);
    }
  }

  // ---- AUTH & USERS ----

  hasAnyAdmin(): boolean {
    if (this.remoteSetupExists !== null) {
      return this.remoteSetupExists;
    }
    // In cloud Supabase mode, default to true (Login screen) until the server explicitly
    // confirms zero setup rows — prevents new devices or logged-out browsers from losing Login.
    if (this.isSupabaseConfigured()) {
      return true;
    }
    return this.db.users.some((u) => u.role === 'admin');
  }

  async checkFirstAdminSetupAsync(): Promise<boolean> {
    if (this.supabase && this.isOnline) {
      try {
        const {data, error} = await this.supabase
          .from('app_setup')
          .select('id')
          .eq('id', 'setup')
          .maybeSingle();
        if (!error) {
          this.remoteSetupExists = Boolean(data);
          this.notify();
          return this.remoteSetupExists;
        }
        // Network/RLS error must NOT lock users out of the Login screen
        return this.remoteSetupExists ?? true;
      } catch {
        return this.remoteSetupExists ?? true;
      }
    }
    if (this.isSupabaseConfigured()) {
      return this.remoteSetupExists ?? true;
    }
    return this.db.users.some((u) => u.role === 'admin');
  }

  getCurrentUser(): UserAccount | null {
    if (!this.db.currentUid) return null;
    return this.db.users.find((u) => u.uid === this.db.currentUid) ?? null;
  }

  getAllUsers(): UserAccount[] {
    return [...this.db.users];
  }

  async setupFirstAdmin(params: {
    username: string;
    password: string;
    displayName: string;
  }): Promise<{ok: boolean; user?: UserAccount; error?: string; notice?: string}> {
    const uCheck = validateUsername(params.username);
    if (!uCheck.ok) return {ok: false, error: uCheck.message};
    const pCheck = validatePassword(params.password);
    if (!pCheck.ok) return {ok: false, error: pCheck.message};

    const normalized = params.username.trim().toLowerCase();
    const now = new Date().toISOString();

    // 1. Try SupabaseAdapter (Email/Password Auth + atomic bootstrap_first_admin RPC)
    if (this.isSupabaseConfigured() && this.supabase && this.isOnline) {
      try {
        const {data: existingSetup} = await this.supabase
          .from('app_setup')
          .select('id')
          .eq('id', 'setup')
          .maybeSingle();
        if (existingSetup) {
          this.remoteSetupExists = true;
          this.notify();
          return {
            ok: false,
            error: 'Hệ thống đã có tài khoản quản trị viên đầu tiên trên máy chủ.',
          };
        }

        const {data: authData, error: signUpErr} = await this.supabase.auth.signUp({
          email: toAuthEmail(normalized),
          password: params.password,
        });

        if (signUpErr) {
          const mapped = mapSupabaseAuthError(signUpErr);
          if (!mapped.fallbackRecommended) {
            return {ok: false, error: mapped.message};
          }
          this.lastNotice = `${mapped.message} Đã chuyển sang LocalAdapter (lưu trên máy này).`;
        } else if (!authData.session || !authData.user) {
          return {
            ok: false,
            error:
              'Supabase đang bật "Confirm email". Vui lòng vào Supabase Dashboard → Authentication → Providers → Email và tắt "Confirm email" để tạo tài khoản quản trị bằng tên đăng nhập.',
          };
        } else {
          const initialProfile = {
            avatar: {...DEFAULT_AVATAR, outfitId: 'hoc_vien'},
            skills: createInitialSkills(),
            inventory: {
              outfits: ['hoc_vien'],
              tools: ['tool_ruler', 'tool_protractor'],
              heroCards: [],
              landmarkCards: [],
              skillCards: [],
              upgradeShards: 0,
              openedChests: [],
            },
            stations: createInitialStations(),
            journey: createInitialJourneyProgress(),
            preferences: {audioEnabled: false, reduceMotion: false, easyMove: false},
          };

          const {data: createdRow, error: rpcErr} = await this.supabase.rpc('bootstrap_first_admin', {
            p_username: normalized,
            p_display_name: params.displayName.trim() || 'Quản trị viên',
            p_initial_profile: initialProfile,
          });

          if (rpcErr || !createdRow) {
            await this.supabase.auth.signOut();
            return {
              ok: false,
              error: rpcErr?.message || 'Không thể khởi tạo quản trị viên trên máy chủ.',
            };
          }

          const adminUser: UserAccount = rowToUser(createdRow as Record<string, unknown>);

          // Best-effort seed initial questions to Supabase
          void this.seedQuestionsToSupabase(this.db.questions);

          this.remoteSetupExists = true;
          this.supabaseSignedInUid = adminUser.uid;
          this.adapterMode = 'supabase';
          this.lastCloudWriteFailed = false;

          const nextClasses = this.db.classes.map((c) =>
            c.id === 'cls_default' || c.teacherUid === 'pending_admin'
              ? {...c, teacherUid: adminUser.uid}
              : c,
          );
          this.save({
            ...this.db,
            users: [...this.db.users.filter((u) => u.uid !== adminUser.uid), adminUser],
            classes: nextClasses,
            currentUid: adminUser.uid,
          });
          return {ok: true, user: adminUser};
        }
      } catch (err) {
        const mapped = mapSupabaseAuthError(err instanceof Error ? {message: err.message} : null);
        return {
          ok: false,
          error: `${mapped.message} Vui lòng kiểm tra kết nối mạng và thử lại (hệ thống lớp học không tạo tài khoản cục bộ tách rời).`,
        };
      }
    }

    if (this.isSupabaseConfigured()) {
      return {
        ok: false,
        error: 'Thiết bị đang ngoại tuyến — chưa thể khởi tạo tài khoản quản trị lên máy chủ. Vui lòng kết nối mạng và thử lại.',
      };
    }

    // 2. LocalAdapter Fallback
    if (this.db.users.some((u) => u.role === 'admin')) {
      return {ok: false, error: 'Hệ thống trên máy này đã có tài khoản quản trị viên.'};
    }
    if (this.db.users.some((u) => u.username === normalized)) {
      return {ok: false, error: 'Tên đăng nhập đã tồn tại.'};
    }

    const salt = generateSalt();
    const hash = await hashPassword(params.password, salt);
    const uid = generateId('adm');
    const adminUser: UserAccount = {
      uid,
      username: normalized,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      status: 'active',
      displayName: params.displayName.trim() || 'Quản trị viên',
      studentCode: 'GV-ADMIN-01',
      classId: 'cls_default',
      classCode: 'TOAN10-01',
      teacherUid: uid,
      assignedClassIds: ['cls_default'],
      researchConsent: false,
      isTestAccount: false,
      locked: false,
      createdAt: now,
      avatarCreated: true,
      avatar: {...DEFAULT_AVATAR, outfitId: 'hoc_vien'},
      xp: 0,
      awardedKeys: [],
      skills: createInitialSkills(),
      inventory: {
        outfits: ['hoc_vien'],
        tools: ['tool_ruler', 'tool_protractor'],
        heroCards: [],
        landmarkCards: [],
        skillCards: [],
        upgradeShards: 0,
        openedChests: [],
      },
      stations: createInitialStations(),
      journey: createInitialJourneyProgress(),
      pausedSession: null,
      recentQuestionSessions: [],
      leaderboardOptIn: false,
      preferences: {audioEnabled: false, reduceMotion: false, easyMove: false},
    };

    const nextClasses = this.db.classes.map((c) =>
      c.teacherUid === 'pending_admin' ? {...c, teacherUid: uid} : c,
    );
    this.adapterMode = 'local';
    this.save({
      ...this.db,
      users: [...this.db.users, adminUser],
      classes: nextClasses,
      currentUid: uid,
      dirtyUserUids: Array.from(new Set([...(this.db.dirtyUserUids ?? []), uid])),
    });
    return {ok: true, user: adminUser, notice: this.lastNotice || undefined};
  }

  private async seedQuestionsToSupabase(questions: QuestionItem[]): Promise<void> {
    if (!this.supabase || !this.isSupabaseAuthenticated()) return;
    try {
      const rows = questions.slice(0, 150).map(questionToRow);
      await this.supabase.from('questions').upsert(rows, {onConflict: 'id'});
    } catch {
      // Non-blocking seed
    }
  }

  async registerStudent(params: {
    username: string;
    password: string;
    displayName: string;
    classCode: string;
    researchConsent?: boolean;
    isTestAccount?: boolean;
    role?: UserRole;
  }): Promise<{ok: boolean; user?: UserAccount; error?: string; notice?: string}> {
    const uCheck = validateUsername(params.username);
    if (!uCheck.ok) return {ok: false, error: uCheck.message};
    const pCheck = validatePassword(params.password);
    if (!pCheck.ok) return {ok: false, error: pCheck.message};

    const normalized = params.username.trim().toLowerCase();
    const clsCode = params.classCode.trim().toUpperCase();
    const now = new Date().toISOString();

    // 1. SupabaseAdapter Student Self-Registration (pre-validates classCode before creating Auth user)
    if (!params.isTestAccount && this.isSupabaseConfigured() && this.supabase && this.isOnline) {
      try {
        const {data: codeCheck, error: codeErr} = await this.supabase.rpc('validate_class_code', {
          p_code: clsCode,
        });

        if (codeErr) {
          const mapped = mapSupabaseAuthError(codeErr);
          if (!mapped.fallbackRecommended) {
            return {ok: false, error: mapped.message};
          }
          this.lastNotice = `${mapped.message} Đã chuyển sang LocalAdapter (lưu trên máy này).`;
        } else {
          const check = (codeCheck ?? {}) as {valid?: boolean; expired?: boolean};
          if (!check.valid) {
            return {
              ok: false,
              error: check.expired
                ? `Mã lớp "${clsCode}" đã hết hạn. Hãy xin mã lớp mới từ giáo viên.`
                : `Mã lớp "${clsCode}" không tồn tại. Hãy hỏi giáo viên mã lớp đúng.`,
            };
          }

          const {data: authData, error: signUpErr} = await this.supabase.auth.signUp({
            email: toAuthEmail(normalized),
            password: params.password,
          });

          if (signUpErr) {
            const mapped = mapSupabaseAuthError(signUpErr);
            if (!mapped.fallbackRecommended) {
              return {ok: false, error: mapped.message};
            }
            this.lastNotice = `${mapped.message} Đã chuyển sang LocalAdapter (lưu trên máy này).`;
          } else if (!authData.session || !authData.user) {
            return {
              ok: false,
              error:
                'Supabase đang bật "Confirm email". Quản trị viên hãy tắt "Confirm email" trong Supabase Dashboard → Authentication → Providers → Email.',
            };
          } else {
            const initialProfile = {
              avatar: {...DEFAULT_AVATAR},
              skills: createInitialSkills(),
              inventory: {
                outfits: ['hoc_vien'],
                tools: ['tool_ruler'],
                heroCards: [],
                landmarkCards: [],
                skillCards: ['sk_angle_sum'],
                upgradeShards: 0,
                openedChests: [],
              },
              stations: createInitialStations(),
              journey: createInitialJourneyProgress(),
              preferences: {
                audioEnabled: this.db.settings.audioDefaultOn,
                reduceMotion: false,
                easyMove: false,
              },
            };

            const {data: createdRow, error: rpcErr} = await this.supabase.rpc(
              'register_student_profile',
              {
                p_username: normalized,
                p_display_name: params.displayName.trim() || 'Học viên khám phá',
                p_class_code: clsCode,
                p_research_consent: Boolean(params.researchConsent),
                p_initial_profile: initialProfile,
              },
            );

            if (rpcErr || !createdRow) {
              await this.supabase.auth.signOut();
              return {
                ok: false,
                error: rpcErr?.message || 'Không thể hoàn tất hồ sơ học viên trên máy chủ.',
              };
            }

            const createdUser: UserAccount = rowToUser(createdRow as Record<string, unknown>);

            this.supabaseSignedInUid = createdUser.uid;
            this.adapterMode = 'supabase';
            this.lastCloudWriteFailed = false;
            this.save({
              ...this.db,
              users: [...this.db.users.filter((u) => u.uid !== createdUser.uid), createdUser],
              currentUid: createdUser.uid,
            });
            void this.hydrateCollectionsForRole(createdUser);
            return {ok: true, user: createdUser};
          }
        }
      } catch (err) {
        const mapped = mapSupabaseAuthError(err instanceof Error ? {message: err.message} : null);
        return {
          ok: false,
          error: `${mapped.message} Vui lòng kiểm tra kết nối mạng và thử lại (hệ thống lớp học không tạo tài khoản cục bộ tách rời).`,
        };
      }
    }

    if (!params.isTestAccount && this.isSupabaseConfigured()) {
      return {
        ok: false,
        error: 'Thiết bị đang ngoại tuyến — chưa thể đăng ký tài khoản lên máy chủ lớp học. Vui lòng kết nối mạng và thử lại.',
      };
    }

    // 2. LocalAdapter Fallback (or Admin creating TEST accounts)
    if (this.db.users.some((u) => u.username === normalized)) {
      return {ok: false, error: 'Tên đăng nhập này đã có người dùng. Em hãy chọn tên khác.'};
    }

    const matchedClass = this.db.classes.find((c) => c.code.toUpperCase() === clsCode);
    if (!matchedClass && !params.isTestAccount) {
      return {
        ok: false,
        error: `Không tìm thấy mã lớp "${clsCode}". Hãy kiểm tra lại mã lớp (ví dụ: TOAN10-01).`,
      };
    }
    if (matchedClass?.codeExpiresAt && new Date(matchedClass.codeExpiresAt).getTime() < Date.now()) {
      return {ok: false, error: 'Mã lớp đã hết hạn. Hãy xin mã lớp mới.'};
    }

    const salt = generateSalt();
    const hash = await hashPassword(params.password, salt);
    const uid = generateId('usr');
    const className = matchedClass?.name ?? 'TOAN10';
    const classId = matchedClass?.id ?? 'cls_default';
    const teacherUid = matchedClass?.teacherUid ?? this.getCurrentUser()?.uid ?? 'pending_admin';
    const countInClass =
      this.db.users.filter((u) => u.classCode === (matchedClass?.code ?? clsCode) && u.role === 'student')
        .length + 1;
    const padded = String(countInClass).padStart(2, '0');
    const studentCode = params.isTestAccount ? `TEST-${className}-${padded}` : `HS-${className}-${padded}`;

    const newUser: UserAccount = {
      uid,
      username: normalized,
      passwordHash: hash,
      passwordSalt: salt,
      role: params.role ?? 'student',
      status: 'active',
      displayName: params.displayName.trim() || 'Học viên khám phá',
      studentCode,
      classId,
      classCode: matchedClass?.code ?? clsCode,
      teacherUid,
      assignedClassIds: [],
      researchConsent: Boolean(params.researchConsent),
      isTestAccount: Boolean(params.isTestAccount),
      locked: false,
      createdAt: now,
      avatarCreated: Boolean(params.isTestAccount),
      avatar: {...DEFAULT_AVATAR},
      xp: 0,
      awardedKeys: [],
      skills: createInitialSkills(),
      inventory: {
        outfits: ['hoc_vien', 'ao_xanh_ngoc'],
        tools: ['tool_ruler'],
        heroCards: [],
        landmarkCards: [],
        skillCards: ['sk_angle_sum'],
        upgradeShards: 0,
        openedChests: [],
      },
      stations: createInitialStations(),
      journey: createInitialJourneyProgress(),
      pausedSession: null,
      recentQuestionSessions: [],
      leaderboardOptIn: false,
      preferences: {
        audioEnabled: this.db.settings.audioDefaultOn,
        reduceMotion: false,
        easyMove: false,
      },
    };

    if (!params.isTestAccount) {
      this.adapterMode = 'local';
    }
    this.save({
      ...this.db,
      users: [...this.db.users, newUser],
      currentUid: params.isTestAccount ? this.db.currentUid : uid,
      dirtyUserUids: Array.from(new Set([...(this.db.dirtyUserUids ?? []), uid])),
    });
    if (params.isTestAccount && this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('users')
        .upsert(userToRow(newUser), {onConflict: 'uid'})
        .then(({error}) => {
          if (!error) this.clearUserDirty(uid);
        });
    }
    return {ok: true, user: newUser, notice: this.lastNotice || undefined};
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ok: boolean; user?: UserAccount; error?: string; notice?: string}> {
    const normalized = username.trim().toLowerCase();

    // 1. Try Supabase Email/Password Auth first
    if (this.isSupabaseConfigured() && this.supabase && this.isOnline) {
      try {
        const {data, error} = await this.supabase.auth.signInWithPassword({
          email: toAuthEmail(normalized),
          password,
        });

        if (!error && data.user) {
          const uid = data.user.id;
          this.supabaseSignedInUid = uid;
          this.adapterMode = 'supabase';

          const hydrated = await this.hydrateUserFromSupabase(uid);
          if (!hydrated) {
            await this.supabase.auth.signOut();
            this.supabaseSignedInUid = null;
            return {
              ok: false,
              error: 'Không tìm thấy hồ sơ người dùng trên CSDL Supabase. Vui lòng liên hệ giáo viên.',
            };
          }
          if (hydrated.locked || hydrated.status === 'locked') {
            await this.supabase.auth.signOut();
            this.supabaseSignedInUid = null;
            return {ok: false, error: 'Tài khoản này đang tạm khóa. Vui lòng liên hệ giáo viên.'};
          }

          // Security: never persist password hashes into browser localStorage in Supabase mode
          this.save({
            ...this.db,
            users: this.db.users.map((u) =>
              u.uid === uid ? {...u, passwordHash: '', passwordSalt: ''} : u,
            ),
            currentUid: uid,
          });

          this.recordEvent({
            eventId: generateId('evt_login'),
            userId: hydrated.uid,
            studentCode: hydrated.studentCode,
            classId: hydrated.classId,
            teacherUid: hydrated.teacherUid,
            isTestAccount: hydrated.isTestAccount,
            type: 'login',
            payload: {role: hydrated.role, adapter: 'supabase'},
          });
          return {ok: true, user: this.getCurrentUser() ?? hydrated};
        }

        const mapped = mapSupabaseAuthError(error);
        return {
          ok: false,
          error: mapped.fallbackRecommended
            ? `${mapped.message} Vui lòng kiểm tra kết nối mạng và thử lại (hệ thống lớp học không tự tách dữ liệu cục bộ).`
            : mapped.message,
        };
      } catch (err) {
        const mapped = mapSupabaseAuthError(err instanceof Error ? {message: err.message} : null);
        return {
          ok: false,
          error: `${mapped.message} Vui lòng kiểm tra kết nối mạng và thử lại.`,
        };
      }
    }

    if (this.isSupabaseConfigured()) {
      return {
        ok: false,
        error: 'Thiết bị đang ngoại tuyến — không thể đăng nhập vào máy chủ lớp học. Vui lòng kết nối mạng và thử lại.',
      };
    }

    // 2. LocalAdapter Login
    const user = this.db.users.find((u) => u.username === normalized);
    if (!user) {
      return {ok: false, error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.'};
    }
    if (user.locked || user.status === 'locked') {
      return {ok: false, error: 'Tài khoản này đang tạm khóa. Vui lòng liên hệ giáo viên.'};
    }
    const candidateHash = await hashPassword(password, user.passwordSalt);
    if (candidateHash !== user.passwordHash) {
      return {ok: false, error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.'};
    }
    this.adapterMode = 'local';
    this.save({...this.db, currentUid: user.uid});
    this.recordEvent({
      eventId: generateId('evt_login'),
      userId: user.uid,
      studentCode: user.studentCode,
      classId: user.classId,
      teacherUid: user.teacherUid,
      isTestAccount: user.isTestAccount,
      type: 'login',
      payload: {role: user.role, adapter: 'local'},
    });
    return {ok: true, user};
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.supabase) return null;
    try {
      const {data} = await this.supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  logout(): void {
    clearDriveToken();
    const wasSupabaseMode = this.isSupabaseConfigured();
    if (this.supabase) {
      void this.supabase.auth.signOut();
    }
    this.supabaseSignedInUid = null;

    if (wasSupabaseMode) {
      // Security: scrub all synced cloud profiles, student data & staff integration keys
      // from browser localStorage on logout to protect shared classroom computers.
      const syncedAtt = new Set(this.db.syncedAttemptIds ?? []);
      const syncedReb = new Set(this.db.syncedRebuttalIds ?? []);
      const syncedRep = new Set(this.db.syncedReportIds ?? []);
      const fresh = createInitialDb();
      this.save({
        ...fresh,
        currentUid: null,
        attempts: this.db.attempts.filter((a) => !syncedAtt.has(a.id)),
        events: this.db.events.filter((e) => !e.synced),
        rebuttals: this.db.rebuttals.filter((r) => !syncedReb.has(r.id)),
        reports: this.db.reports.filter((r) => !syncedRep.has(r.id)),
        settings: {
          ...fresh.settings,
          supabaseUrl: this.db.settings.supabaseUrl,
          supabasePublishableKey: this.db.settings.supabasePublishableKey,
        },
      });
      return;
    }

    this.save({...this.db, currentUid: null});
  }

  // ---- SYNC LOCAL ADAPTER DATA TO SUPABASE (ZERO DUPLICATES) ----

  async syncLocalDataToServer(): Promise<SyncResult> {
    const empty: SyncResult = {
      ok: false,
      syncedUser: false,
      syncedEvents: 0,
      syncedAttempts: 0,
      syncedRebuttals: 0,
      syncedReports: 0,
      skippedDuplicates: 0,
      message: '',
    };

    if (!this.isSupabaseConfigured() || !this.supabase) {
      return {
        ...empty,
        message: 'Hệ thống đang hoạt động ở chế độ lưu tạm trên máy.',
      };
    }
    if (!this.isOnline) {
      return {
        ...empty,
        message: 'Thiết bị đang ngoại tuyến. Dữ liệu sẽ tự động đồng bộ ngay khi có mạng trở lại.',
      };
    }

    const {data: sessionData} = await this.supabase.auth.getSession();
    const authUser = sessionData.session?.user ?? (await this.supabase.auth.getUser()).data.user;
    if (!authUser) {
      return {
        ...empty,
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng xuất và đăng nhập lại để tiếp tục đồng bộ.',
      };
    }
    this.supabaseSignedInUid = authUser.id;

    const sb = this.supabase;
    const authUid = authUser.id;
    const currentLocal = this.getCurrentUser();
    const localAliases = new Set<string>([authUid]);
    if (currentLocal) {
      localAliases.add(currentLocal.uid);
      for (const u of this.db.users) {
        if (u.username === currentLocal.username) localAliases.add(u.uid);
      }
    }

    let syncedUser = false;
    let syncedEvents = 0;
    let syncedAttempts = 0;
    let syncedRebuttals = 0;
    let syncedReports = 0;
    let skippedDuplicates = 0;

    try {
      // 1. Merge and upload UserAccount without violating protected fields or duplicating XP
      const {data: remoteRow, error: fetchErr} = await sb
        .from('users')
        .select('*')
        .eq('uid', authUid)
        .maybeSingle();

      if (fetchErr || !remoteRow) {
        return {
          ...empty,
          message: 'Không tìm thấy hồ sơ tài khoản trên máy chủ để đồng bộ.',
        };
      }

      const remoteUser = rowToUser(remoteRow as Record<string, unknown>);
      let mergedUser = remoteUser;
      for (const u of this.db.users) {
        if (localAliases.has(u.uid)) {
          mergedUser = mergeUserProgressIdempotent(mergedUser, u);
        }
      }

      const {error: updUserErr} = await sb
        .from('users')
        .update(userProgressUpdatePatch(mergedUser))
        .eq('uid', authUid);
      if (updUserErr) throw new Error(updUserErr.message);
      syncedUser = true;

      const scope = {
        userId: authUid,
        studentCode: mergedUser.studentCode,
        classId: mergedUser.classId || 'cls_default',
        teacherUid: mergedUser.teacherUid || authUid,
      };

      // 2. Sync Events by deterministic event_id (ignoreDuplicates)
      const nextEvents = [...this.db.events];
      const unsyncedEventRows: Array<{idx: number; row: Record<string, unknown>}> = [];
      for (let i = 0; i < nextEvents.length; i++) {
        const ev = nextEvents[i];
        if (!localAliases.has(ev.userId)) continue;
        if (ev.synced) {
          skippedDuplicates += 1;
          continue;
        }
        unsyncedEventRows.push({idx: i, row: eventToRow({...ev, ...scope, synced: true})});
      }
      if (unsyncedEventRows.length > 0) {
        const {error} = await sb
          .from('learning_events')
          .upsert(
            unsyncedEventRows.map((x) => x.row),
            {onConflict: 'event_id', ignoreDuplicates: true},
          );
        if (error) throw new Error(error.message);
        for (const item of unsyncedEventRows) {
          nextEvents[item.idx] = {...nextEvents[item.idx], ...scope, synced: true};
          syncedEvents += 1;
        }
      }

      // 3. Sync Attempts by deterministic id
      const syncedAttSet = new Set(this.db.syncedAttemptIds ?? []);
      const nextAttempts = [...this.db.attempts];
      const unsyncedAttemptRows: Array<{idx: number; id: string; row: Record<string, unknown>}> = [];
      for (let i = 0; i < nextAttempts.length; i++) {
        const att = nextAttempts[i];
        if (!localAliases.has(att.userId)) continue;
        if (syncedAttSet.has(att.id)) {
          skippedDuplicates += 1;
          continue;
        }
        unsyncedAttemptRows.push({idx: i, id: att.id, row: attemptToRow({...att, ...scope})});
      }
      if (unsyncedAttemptRows.length > 0) {
        const {error} = await sb
          .from('attempts')
          .upsert(
            unsyncedAttemptRows.map((x) => x.row),
            {onConflict: 'id', ignoreDuplicates: true},
          );
        if (error) throw new Error(error.message);
        for (const item of unsyncedAttemptRows) {
          syncedAttSet.add(item.id);
          nextAttempts[item.idx] = {...nextAttempts[item.idx], ...scope};
          syncedAttempts += 1;
        }
      }

      // 4. Sync Rebuttals by deterministic id
      const syncedRebSet = new Set(this.db.syncedRebuttalIds ?? []);
      const nextRebuttals = [...this.db.rebuttals];
      const unsyncedRebRows: Array<{idx: number; id: string; row: Record<string, unknown>}> = [];
      for (let i = 0; i < nextRebuttals.length; i++) {
        const reb = nextRebuttals[i];
        if (!localAliases.has(reb.userId)) continue;
        if (syncedRebSet.has(reb.id)) {
          skippedDuplicates += 1;
          continue;
        }
        unsyncedRebRows.push({
          idx: i,
          id: reb.id,
          row: rebuttalToRow({...reb, ...scope, status: 'pending'}),
        });
      }
      if (unsyncedRebRows.length > 0) {
        const {error} = await sb
          .from('rebuttals')
          .upsert(
            unsyncedRebRows.map((x) => x.row),
            {onConflict: 'id', ignoreDuplicates: true},
          );
        if (error) throw new Error(error.message);
        for (const item of unsyncedRebRows) {
          syncedRebSet.add(item.id);
          nextRebuttals[item.idx] = {...nextRebuttals[item.idx], ...scope};
          syncedRebuttals += 1;
        }
      }

      // 5. Sync Survey Reports by deterministic id
      const syncedRepSet = new Set(this.db.syncedReportIds ?? []);
      const nextReports = [...this.db.reports];
      const unsyncedRepRows: Array<{idx: number; id: string; row: Record<string, unknown>}> = [];
      for (let i = 0; i < nextReports.length; i++) {
        const rep = nextReports[i];
        if (!localAliases.has(rep.userId)) continue;
        if (syncedRepSet.has(rep.id)) {
          skippedDuplicates += 1;
          continue;
        }
        unsyncedRepRows.push({idx: i, id: rep.id, row: reportToRow({...rep, ...scope})});
      }
      if (unsyncedRepRows.length > 0) {
        const {error} = await sb
          .from('survey_reports')
          .upsert(
            unsyncedRepRows.map((x) => x.row),
            {onConflict: 'id', ignoreDuplicates: true},
          );
        if (error) throw new Error(error.message);
        for (const item of unsyncedRepRows) {
          syncedRepSet.add(item.id);
          nextReports[item.idx] = {...nextReports[item.idx], ...scope};
          syncedReports += 1;
        }
      }

      // 6. Staff sync classes, class_codes, questions & settings
      if (mergedUser.role === 'admin' || mergedUser.role === 'teacher') {
        const staffClasses = this.db.classes.filter(
          (c) => mergedUser.role === 'admin' || c.teacherUid === authUid,
        );
        if (staffClasses.length > 0) {
          await sb.from('classes').upsert(
            staffClasses.map((cls) =>
              classToRow({
                ...cls,
                teacherUid: cls.teacherUid === 'pending_admin' ? authUid : cls.teacherUid,
              }),
            ),
            {onConflict: 'id'},
          );
          await sb.from('class_codes').upsert(
            staffClasses.map((cls) => ({
              code: cls.code.toUpperCase(),
              class_id: cls.id,
              class_name: cls.name,
              teacher_uid: cls.teacherUid === 'pending_admin' ? authUid : cls.teacherUid,
              active: true,
              expires_at: cls.codeExpiresAt ?? null,
            })),
            {onConflict: 'code'},
          );
        }
        if (this.db.questions.length > 0) {
          const questionsToPush =
            mergedUser.role === 'admin'
              ? this.db.questions
              : this.db.questions.filter(
                  (q) =>
                    q.review_status === 'pending_teacher_review' &&
                    q.proposedByUid === authUid,
                );
          if (questionsToPush.length > 0) {
            await sb
              .from('questions')
              .upsert(questionsToPush.map(questionToRow), {onConflict: 'id'});
          }
        }
        if (mergedUser.role === 'admin') {
          await sb
            .from('app_settings')
            .upsert(settingsToRow(this.db.settings), {onConflict: 'id'});
        }
      }

      this.lastCloudWriteFailed = false;
      const cleanedUsers = this.db.users.map((u) => (u.uid === authUid ? {...u, ...mergedUser} : u));
      if (!cleanedUsers.some((u) => u.uid === authUid)) {
        cleanedUsers.push({...mergedUser, passwordHash: '', passwordSalt: ''});
      }

      this.save({
        ...this.db,
        users: cleanedUsers,
        currentUid: authUid,
        events: nextEvents,
        attempts: nextAttempts,
        rebuttals: nextRebuttals,
        reports: nextReports,
        syncedAttemptIds: Array.from(syncedAttSet),
        syncedRebuttalIds: Array.from(syncedRebSet),
        syncedReportIds: Array.from(syncedRepSet),
        dirtyUserUids: (this.db.dirtyUserUids ?? []).filter((id) => !localAliases.has(id)),
      });

      this.lastNotice = '';
      this.lastCloudWriteFailed = false;
      const totalNew = syncedEvents + syncedAttempts + syncedRebuttals + syncedReports;
      const message =
        totalNew > 0
          ? `Đã đồng bộ thành công hồ sơ và ${totalNew} bản ghi mới lên máy chủ.`
          : 'Tất cả dữ liệu đã được đồng bộ đầy đủ với máy chủ.';

      return {
        ok: true,
        syncedUser,
        syncedEvents,
        syncedAttempts,
        syncedRebuttals,
        syncedReports,
        skippedDuplicates,
        message,
      };
    } catch (err) {
      this.lastCloudWriteFailed = true;
      this.notify();
      return {
        ...empty,
        message: `Đồng bộ chưa hoàn tất: ${err instanceof Error ? err.message : 'Lỗi kết nối hoặc phân quyền'}. Dữ liệu vẫn an toàn ở trạng thái "Chờ đồng bộ".`,
      };
    }
  }

  // ---- USER UPDATES & REWARDS ----

  private syncUserToSupabase(user: UserAccount, fullAdminUpdate = false): void {
    if (!this.supabase || !this.isSupabaseAuthenticated() || !this.isOnline) return;
    const patch = fullAdminUpdate ? userToRow(user) : userProgressUpdatePatch(user);
    void this.supabase
      .from('users')
      .update(patch)
      .eq('uid', user.uid)
      .then(({error}) => {
        if (error) {
          this.lastCloudWriteFailed = true;
          console.error('[Supabase] user update error:', error.message);
          this.notify();
        } else {
          this.lastCloudWriteFailed = false;
          this.clearUserDirty(user.uid);
        }
      });
  }

  updateUser(
    uid: string,
    updater: (u: UserAccount) => UserAccount,
    options?: {adminFullSync?: boolean},
  ): UserAccount | null {
    const idx = this.db.users.findIndex((u) => u.uid === uid);
    if (idx < 0) return null;
    const updated = updater(this.db.users[idx]);
    const unlockedByXp = OUTFITS.filter(
      (o) => o.unlockType === 'xp' && (o.xpRequired ?? 0) <= updated.xp,
    ).map((o) => o.id);
    const mergedOutfits = Array.from(new Set([...updated.inventory.outfits, ...unlockedByXp]));
    const status: AccountStatus = updated.locked ? 'locked' : 'active';
    const finalUser: UserAccount = {
      ...updated,
      status,
      inventory: {...updated.inventory, outfits: mergedOutfits},
    };
    const nextUsers = [...this.db.users];
    nextUsers[idx] = finalUser;
    this.markUserDirty(uid);
    this.save({...this.db, users: nextUsers});
    this.syncUserToSupabase(finalUser, Boolean(options?.adminFullSync));
    return finalUser;
  }

  saveAvatar(uid: string, displayName: string, avatar: AvatarAppearance): UserAccount | null {
    const updated = this.updateUser(uid, (u) => ({
      ...u,
      // Keep teacher-assigned / registered student name intact so teachers can always recognize students
      displayName: u.role === 'student' ? u.displayName : displayName.trim() || u.displayName,
      avatar: {...avatar},
      avatarCreated: true,
    }));
    if (updated) {
      this.recordEvent({
        eventId: generateId('evt_avatar'),
        userId: uid,
        studentCode: updated.studentCode,
        classId: updated.classId,
        teacherUid: updated.teacherUid,
        isTestAccount: updated.isTestAccount,
        type: 'avatar_saved',
        payload: {displayName: updated.displayName, outfitId: avatar.outfitId},
      });
    }
    return updated;
  }

  awardOnce(
    uid: string,
    awardKey: string,
    reward: {
      xp?: number;
      outfitId?: string;
      toolId?: string;
      heroCardId?: string;
      landmarkCardId?: string;
      skillCardId?: string;
      chestId?: string;
    },
  ): {granted: boolean; user: UserAccount | null; duplicateShardAdded: boolean} {
    const existing = this.db.users.find((u) => u.uid === uid);
    if (!existing) return {granted: false, user: null, duplicateShardAdded: false};
    if (existing.awardedKeys.includes(awardKey)) {
      return {granted: false, user: existing, duplicateShardAdded: false};
    }

    let duplicateShardAdded = false;
    const updated = this.updateUser(uid, (u) => {
      const inv = {...u.inventory};
      if (reward.outfitId) {
        if (inv.outfits.includes(reward.outfitId)) {
          inv.upgradeShards += 1;
          duplicateShardAdded = true;
        } else {
          inv.outfits = [...inv.outfits, reward.outfitId];
        }
      }
      if (reward.toolId && !inv.tools.includes(reward.toolId)) {
        inv.tools = [...inv.tools, reward.toolId];
      }
      if (reward.heroCardId) {
        if (inv.heroCards.includes(reward.heroCardId)) {
          inv.upgradeShards += 1;
          duplicateShardAdded = true;
        } else {
          inv.heroCards = [...inv.heroCards, reward.heroCardId];
        }
      }
      if (reward.landmarkCardId && !inv.landmarkCards.includes(reward.landmarkCardId)) {
        inv.landmarkCards = [...inv.landmarkCards, reward.landmarkCardId];
      }
      if (reward.skillCardId && !inv.skillCards.includes(reward.skillCardId)) {
        inv.skillCards = [...inv.skillCards, reward.skillCardId];
      }
      if (reward.chestId && !inv.openedChests.includes(reward.chestId)) {
        inv.openedChests = [...inv.openedChests, reward.chestId];
      }

      return {
        ...u,
        xp: u.xp + (reward.xp ?? 0),
        awardedKeys: [...u.awardedKeys, awardKey],
        inventory: inv,
      };
    });

    return {granted: true, user: updated, duplicateShardAdded};
  }

  savePausedSession(uid: string, session: PausedSession | null): UserAccount | null {
    return this.updateUser(uid, (u) => ({...u, pausedSession: session}));
  }

  // ---- IDEMPOTENT EVENTS & ATTEMPTS ----

  private resolveScope(userId: string): {classId: string; teacherUid: string; studentCode: string} {
    const u = this.db.users.find((x) => x.uid === userId);
    return {
      classId: u?.classId || 'cls_default',
      teacherUid: u?.teacherUid || userId,
      studentCode: u?.studentCode || 'HS-10-00',
    };
  }

  recordEvent(input: Omit<LearningEvent, 'createdAt' | 'synced'>): {inserted: boolean} {
    if (this.db.events.some((e) => e.eventId === input.eventId)) {
      return {inserted: false};
    }
    const scope = this.resolveScope(input.userId);
    const ev: LearningEvent = {
      ...input,
      classId: input.classId || scope.classId,
      teacherUid: input.teacherUid || scope.teacherUid,
      studentCode: input.studentCode || scope.studentCode,
      createdAt: new Date().toISOString(),
      synced: false,
    };
    this.save({...this.db, events: [...this.db.events, ev]});

    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('learning_events')
        .upsert(eventToRow(ev), {onConflict: 'event_id', ignoreDuplicates: true})
        .then(({error}) => {
          if (error) {
            this.lastCloudWriteFailed = true;
            this.notify();
          } else {
            this.lastCloudWriteFailed = false;
            this.save({
              ...this.db,
              events: this.db.events.map((e) =>
                e.eventId === ev.eventId ? {...e, synced: true} : e,
              ),
            });
          }
        });
    }
    return {inserted: true};
  }

  recordAttempt(
    attemptInput: Omit<AttemptRecord, 'id' | 'createdAt'>,
    eventId?: string,
  ): {attempt: AttemptRecord; user: UserAccount | null} {
    const scope = this.resolveScope(attemptInput.userId);
    const matchedQ = this.db.questions.find((q) => q.id === attemptInput.questionId);
    const attempt: AttemptRecord = {
      ...attemptInput,
      id: generateId('att'),
      questionVersion: attemptInput.questionVersion ?? matchedQ?.version ?? 1,
      questionSnapshot:
        attemptInput.questionSnapshot ??
        (matchedQ ? matchedQ.stem_vi.replace(/\s+/g, ' ').trim().slice(0, 140) : undefined),
      classId: attemptInput.classId || scope.classId,
      teacherUid: attemptInput.teacherUid || scope.teacherUid,
      studentCode: attemptInput.studentCode || scope.studentCode,
      createdAt: new Date().toISOString(),
    };

    const nextAttempts = [...this.db.attempts, attempt];
    this.save({...this.db, attempts: nextAttempts});

    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('attempts')
        .upsert(attemptToRow(attempt), {onConflict: 'id', ignoreDuplicates: true})
        .then(({error}) => {
          if (error) {
            this.lastCloudWriteFailed = true;
            this.notify();
          } else {
            this.lastCloudWriteFailed = false;
            this.save({
              ...this.db,
              syncedAttemptIds: Array.from(
                new Set([...(this.db.syncedAttemptIds ?? []), attempt.id]),
              ),
            });
          }
        });
    }

    const updatedUser = this.updateUser(attempt.userId, (u) => {
      const currentSkill = u.skills[attempt.cluster];
      const nextSkill = computeNextSkillRecord(currentSkill, {
        isCorrect: attempt.isCorrect,
        mode: attempt.mode,
        usedHint: attempt.usedHint,
        clickedDontKnow: attempt.clickedDontKnow,
        switchedToPractice: attempt.switchedToPractice,
      });
      return {
        ...u,
        skills: {
          ...u.skills,
          [attempt.cluster]: nextSkill,
        },
      };
    });

    this.recordEvent({
      eventId: eventId ?? `evt_att_${attempt.id}`,
      userId: attempt.userId,
      studentCode: attempt.studentCode,
      classId: attempt.classId,
      teacherUid: attempt.teacherUid,
      isTestAccount: attempt.isTestAccount,
      type: 'attempt_submit',
      payload: {
        questionId: attempt.questionId,
        cluster: attempt.cluster,
        mode: attempt.mode,
        isCorrect: attempt.isCorrect,
        usedHint: attempt.usedHint,
        clickedDontKnow: attempt.clickedDontKnow,
        errorCode: attempt.errorCode ?? null,
        durationMs: attempt.durationMs,
        seed: attempt.seed ?? null,
      },
    });

    return {attempt, user: updatedUser};
  }

  recordSessionQuestionIds(uid: string, ids: string[]): void {
    this.updateUser(uid, (u) => {
      const next = [...u.recentQuestionSessions, ids].slice(-3);
      return {...u, recentQuestionSessions: next};
    });
  }

  // ---- REBUTTALS & SURVEY REPORTS ----

  submitRebuttal(input: Omit<RebuttalRecord, 'id' | 'status' | 'createdAt'>): RebuttalRecord {
    const scope = this.resolveScope(input.userId);
    const rec: RebuttalRecord = {
      ...input,
      id: generateId('reb'),
      classId: input.classId || scope.classId,
      teacherUid: input.teacherUid || scope.teacherUid,
      studentCode: input.studentCode || scope.studentCode,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.save({...this.db, rebuttals: [rec, ...this.db.rebuttals]});
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('rebuttals')
        .upsert(rebuttalToRow(rec), {onConflict: 'id', ignoreDuplicates: true})
        .then(({error}) => {
          if (error) {
            this.lastCloudWriteFailed = true;
            this.notify();
          } else {
            this.lastCloudWriteFailed = false;
            this.save({
              ...this.db,
              syncedRebuttalIds: Array.from(
                new Set([...(this.db.syncedRebuttalIds ?? []), rec.id]),
              ),
            });
          }
        });
    }
    return rec;
  }

  getRebuttals(): RebuttalRecord[] {
    return [...this.db.rebuttals];
  }

  replyRebuttal(
    actor: UserAccount,
    rebuttalId: string,
    status: RebuttalRecord['status'],
    teacherReply: string,
  ): boolean {
    if (!canAccessAdmin(actor)) return false;
    let updatedRec: RebuttalRecord | null = null;
    const reviewedAt = new Date().toISOString();
    const next = this.db.rebuttals.map((r) => {
      if (r.id !== rebuttalId) return r;
      updatedRec = {...r, status, teacherReply, reviewedAt};
      return updatedRec;
    });
    this.save({...this.db, rebuttals: next});
    if (updatedRec && this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('rebuttals')
        .update({status, teacher_reply: teacherReply, reviewed_at: reviewedAt})
        .eq('id', rebuttalId);
    }
    return true;
  }

  saveSurveyReport(input: Omit<SurveyReportRecord, 'id' | 'createdAt'>): SurveyReportRecord {
    const scope = this.resolveScope(input.userId);
    const rec: SurveyReportRecord = {
      ...input,
      id: generateId('rep'),
      studentCode: input.studentCode || scope.studentCode,
      classId: input.classId || scope.classId,
      teacherUid: input.teacherUid || scope.teacherUid,
      createdAt: new Date().toISOString(),
    };
    this.save({...this.db, reports: [rec, ...this.db.reports]});
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('survey_reports')
        .upsert(reportToRow(rec), {onConflict: 'id', ignoreDuplicates: true})
        .then(({error}) => {
          if (error) {
            this.lastCloudWriteFailed = true;
            this.notify();
          } else {
            this.lastCloudWriteFailed = false;
            this.save({
              ...this.db,
              syncedReportIds: Array.from(new Set([...(this.db.syncedReportIds ?? []), rec.id])),
            });
          }
        });
    }
    return rec;
  }

  getSurveyReports(userId?: string): SurveyReportRecord[] {
    if (!userId) return [...this.db.reports];
    return this.db.reports.filter((r) => r.userId === userId);
  }

  /**
   * Real students NEVER see pending_teacher_review questions (enforced on both RLS and client).
   * Only explicit TEST accounts with setting enabled may preview unapproved drafts.
   */
  shouldAllowPendingForUser(user?: UserAccount | null): boolean {
    if (!user) return false;
    return Boolean(user.isTestAccount && this.db.settings.allowPendingInTestMode);
  }

  // ---- INDIVIDUALIZED REMEDIATION WORKSHEETS (TEACHER-APPROVED CLOSED LOOP) ----

  getRemediationAssignments(studentUid?: string): RemediationAssignment[] {
    const list = this.db.remediationAssignments ?? [];
    const filtered = studentUid ? list.filter((r) => r.studentUid === studentUid) : list;
    return [...filtered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  proposeRemediationForStudent(studentUid: string): {
    targetErrorCodes: string[];
    remediationQuestionIds: string[];
    verifyQuestionId: string;
    suggestedTitle: string;
    suggestedNote: string;
  } {
    const stu = this.db.users.find((u) => u.uid === studentUid);
    const wrongAttempts = this.db.attempts.filter(
      (a) => a.userId === studentUid && !a.isCorrect && a.errorCode,
    );
    const errFreq = new Map<string, number>();
    for (const att of wrongAttempts) {
      if (att.errorCode) {
        errFreq.set(att.errorCode, (errFreq.get(att.errorCode) ?? 0) + 1);
      }
    }
    const topErrors = Array.from(errFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code]) => code);
    const targetErrorCodes = topErrors.length > 0 ? topErrors : ['E01', 'E04'];

    const approvedBank = this.db.questions.filter((q) => q.review_status === 'approved');
    const attemptedIds = new Set(
      this.db.attempts.filter((a) => a.userId === studentUid).map((a) => a.questionId),
    );

    const matchingRem = approvedBank.filter((q) =>
      q.anticipated_error_ids.some((e) => targetErrorCodes.includes(e)),
    );
    const remPreferred = [
      ...matchingRem.filter((q) => q.stage === 'remediation' || q.level <= 2),
      ...matchingRem.filter((q) => q.stage !== 'remediation' && q.level > 2),
    ];
    const remediationQuestionIds: string[] = [];
    for (const q of remPreferred) {
      if (!remediationQuestionIds.includes(q.id) && remediationQuestionIds.length < 3) {
        remediationQuestionIds.push(q.id);
      }
    }
    for (const q of approvedBank) {
      if (!remediationQuestionIds.includes(q.id) && remediationQuestionIds.length < 2) {
        remediationQuestionIds.push(q.id);
      }
    }

    const verifyCandidates = matchingRem.filter(
      (q) => !remediationQuestionIds.includes(q.id) && q.level >= 2,
    );
    const freshVerify =
      verifyCandidates.find((q) => !attemptedIds.has(q.id)) ??
      verifyCandidates[0] ??
      approvedBank.find((q) => !remediationQuestionIds.includes(q.id)) ??
      approvedBank[0];

    const errorNames = targetErrorCodes
      .map((code) => `${code} (${ERROR_CATALOG[code]?.subSkill ?? code})`)
      .join(', ');

    return {
      targetErrorCodes,
      remediationQuestionIds,
      verifyQuestionId: freshVerify?.id ?? 'T01',
      suggestedTitle: `Phiếu bổ trợ riêng · ${stu?.displayName ?? 'Học sinh'} (${targetErrorCodes.join(', ')})`,
      suggestedNote: `Khắc phục trọng tâm: ${errorNames}. Em làm lần lượt câu bổ trợ có gợi ý, sau đó tự giải 1 bài kiểm chứng mới (không dùng gợi ý) ở bước cuối.`,
    };
  }

  assignRemediationWorksheet(
    actor: UserAccount,
    input: {
      studentUid: string;
      title: string;
      targetErrorCodes: string[];
      remediationQuestionIds: string[];
      verifyQuestionId: string;
      teacherNote: string;
    },
  ): {ok: boolean; assignment?: RemediationAssignment; error?: string} {
    if (!canAccessAdmin(actor)) {
      return {ok: false, error: 'Chỉ Giáo viên hoặc Quản trị viên mới được giao phiếu bổ trợ.'};
    }
    const student = this.db.users.find((u) => u.uid === input.studentUid);
    if (!student) {
      return {ok: false, error: 'Không tìm thấy tài khoản học sinh.'};
    }
    if (
      actor.role === 'teacher' &&
      !this.getScopedUsers(actor).some((u) => u.uid === student.uid)
    ) {
      return {ok: false, error: 'Bạn chỉ được giao phiếu cho học sinh thuộc lớp mình quản lý.'};
    }

    const approvedSet = new Set(
      this.db.questions.filter((q) => q.review_status === 'approved').map((q) => q.id),
    );
    const validRemIds = input.remediationQuestionIds.filter((id) => approvedSet.has(id));
    if (validRemIds.length === 0 || !approvedSet.has(input.verifyQuestionId)) {
      return {
        ok: false,
        error: 'Phiếu bổ trợ chỉ được chọn các câu hỏi đã kiểm duyệt (approved) và phải có ít nhất 1 câu bổ trợ + 1 câu kiểm chứng mới.',
      };
    }

    const assignment: RemediationAssignment = {
      id: generateId('rem'),
      studentUid: student.uid,
      studentCode: student.studentCode,
      studentName: student.displayName,
      teacherUid: actor.uid,
      classId: student.classId ?? 'cls_default',
      title: input.title.trim() || `Phiếu bổ trợ · ${input.targetErrorCodes.join(', ')}`,
      targetErrorCodes: input.targetErrorCodes,
      remediationQuestionIds: validRemIds,
      verifyQuestionId: input.verifyQuestionId,
      teacherNote: input.teacherNote.trim(),
      status: 'assigned',
      remediationCompletedIds: [],
      verifyPassed: false,
      createdAt: new Date().toISOString(),
    };

    const nextList = [assignment, ...(this.db.remediationAssignments ?? [])];
    this.save({...this.db, remediationAssignments: nextList});

    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('remediation_assignments')
        .upsert(remediationToRow(assignment), {onConflict: 'id'});
    }

    return {ok: true, assignment};
  }

  recordRemediationProgress(
    assignmentId: string,
    params: {completedQuestionId?: string; verifyPassed?: boolean},
  ): RemediationAssignment | null {
    const list = this.db.remediationAssignments ?? [];
    const target = list.find((r) => r.id === assignmentId);
    if (!target) return null;

    const completedIds = new Set(target.remediationCompletedIds);
    if (params.completedQuestionId) {
      completedIds.add(params.completedQuestionId);
    }
    const remAllDone = target.remediationQuestionIds.every((id) => completedIds.has(id));
    const verifyPassed = Boolean(target.verifyPassed || params.verifyPassed);
    const status: RemediationAssignment['status'] = verifyPassed
      ? 'verified_passed'
      : remAllDone
        ? 'remediation_done'
        : 'assigned';

    const updated: RemediationAssignment = {
      ...target,
      remediationCompletedIds: Array.from(completedIds),
      verifyPassed,
      status,
      completedAt: verifyPassed ? target.completedAt ?? new Date().toISOString() : target.completedAt,
    };

    this.save({
      ...this.db,
      remediationAssignments: list.map((r) => (r.id === assignmentId ? updated : r)),
    });

    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('remediation_assignments')
        .update({
          remediation_completed_ids: updated.remediationCompletedIds,
          verify_passed: updated.verifyPassed,
          status: updated.status,
          completed_at: updated.completedAt ?? null,
        })
        .eq('id', updated.id);
    }

    return updated;
  }

  // ---- QUESTIONS BANK ----

  getQuestions(): QuestionItem[] {
    return [...this.db.questions];
  }

  getPlayableQuestionsForStation(stationId: StationId): QuestionItem[] {
    const allowPending = this.db.settings.allowPendingInTestMode;
    return this.db.questions.filter(
      (q) =>
        q.stationId === stationId &&
        q.review_status !== 'rejected' &&
        (allowPending || q.review_status === 'approved'),
    );
  }

  upsertQuestion(actor: UserAccount, question: QuestionItem, editNote = 'Cập nhật nội dung'): boolean {
    if (!canAccessAdmin(actor)) return false;
    const isAdminActor = canEditSettingsOrUsers(actor);
    const existingIdx = this.db.questions.findIndex((q) => q.id === question.id);
    const nextList = [...this.db.questions];
    const now = new Date().toISOString();
    let savedQuestion: QuestionItem;

    if (!isAdminActor) {
      // Teacher path: every addition, edit, or replacement MUST wait for Admin approval.
      // Live approved/existing questions are NEVER overwritten directly by a teacher.
      const sanitizedBase: QuestionItem = {
        ...question,
        review_status: 'pending_teacher_review',
        reviewedBy: undefined,
        reviewedAt: undefined,
      };
      if (existingIdx >= 0) {
        const prev = nextList[existingIdx];
        const isOwnPendingDraft =
          prev.review_status === 'pending_teacher_review' &&
          prev.proposedByUid === actor.uid;
        if (isOwnPendingDraft) {
          savedQuestion = {
            ...sanitizedBase,
            id: prev.id,
            version: prev.version ?? 1,
            versionHistory: prev.versionHistory ?? [],
            createdBy: prev.createdBy ?? actor.displayName,
            replacesQuestionId: prev.replacesQuestionId,
            proposedAction: prev.proposedAction ?? 'create',
            proposedBy: actor.displayName,
            proposedByUid: actor.uid,
            proposedAt: now,
            proposedNote: editNote,
          };
          nextList[existingIdx] = savedQuestion;
        } else {
          // Editing/replacing an existing bank question → create a separate pending proposal
          savedQuestion = {
            ...sanitizedBase,
            id: generateId('prop'),
            version: (prev.version ?? 1) + 1,
            versionHistory: prev.versionHistory ?? [],
            createdBy: prev.createdBy,
            replacesQuestionId: prev.id,
            proposedAction: prev.stem_vi.trim() !== sanitizedBase.stem_vi.trim() ? 'replace' : 'edit',
            proposedBy: actor.displayName,
            proposedByUid: actor.uid,
            proposedAt: now,
            proposedNote: editNote,
          };
          nextList.unshift(savedQuestion);
        }
      } else {
        savedQuestion = {
          ...sanitizedBase,
          version: 1,
          versionHistory: [],
          createdBy: actor.displayName,
          proposedAction: 'create',
          proposedBy: actor.displayName,
          proposedByUid: actor.uid,
          proposedAt: now,
          proposedNote: editNote,
        };
        nextList.unshift(savedQuestion);
      }
    } else if (existingIdx >= 0) {
      const prev = nextList[existingIdx];
      const nextVersion = (prev.version ?? 1) + 1;
      const history = [
        ...(prev.versionHistory ?? []),
        {
          version: prev.version ?? 1,
          editedAt: now,
          editedBy: actor.displayName,
          note: editNote,
          stem_vi: prev.stem_vi,
        },
      ];
      savedQuestion = {...question, version: nextVersion, versionHistory: history};
      nextList[existingIdx] = savedQuestion;
    } else {
      savedQuestion = {...question, version: 1, versionHistory: [], createdBy: actor.displayName};
      nextList.unshift(savedQuestion);
    }

    this.save({...this.db, questions: nextList});
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase.from('questions').upsert(questionToRow(savedQuestion), {onConflict: 'id'});
    }
    return true;
  }

  setQuestionReviewStatus(
    actor: UserAccount,
    questionIds: string[],
    status: ReviewStatus,
  ): boolean {
    if (!canEditSettingsOrUsers(actor)) return false;
    const idSet = new Set(questionIds);
    const now = new Date().toISOString();
    const updatedQuestions: QuestionItem[] = [];
    const proposalIdsToDelete: string[] = [];

    const workingList = [...this.db.questions];

    for (const qId of idSet) {
      const idx = workingList.findIndex((q) => q.id === qId);
      if (idx < 0) continue;
      const item = workingList[idx];

      // If Admin approves a teacher's edit/replace proposal, apply it onto the target live question
      if (status === 'approved' && item.replacesQuestionId) {
        const targetIdx = workingList.findIndex((t) => t.id === item.replacesQuestionId);
        if (targetIdx >= 0) {
          const target = workingList[targetIdx];
          const nextVersion = (target.version ?? 1) + 1;
          const history = [
            ...(target.versionHistory ?? []),
            {
              version: target.version ?? 1,
              editedAt: now,
              editedBy: item.proposedBy ? `${item.proposedBy} (Admin ${actor.displayName} duyệt)` : actor.displayName,
              note: item.proposedNote || 'Admin chấp nhận đề xuất chỉnh sửa/thay thế của giáo viên',
              stem_vi: target.stem_vi,
            },
          ];
          const {
            replacesQuestionId: _rId,
            proposedAction: _pAct,
            proposedBy: _pBy,
            proposedByUid: _pUid,
            proposedAt: _pAt,
            proposedNote: _pNote,
            ...cleanProposal
          } = item;
          const mergedTarget: QuestionItem = {
            ...target,
            ...cleanProposal,
            id: target.id,
            review_status: 'approved',
            reviewedBy: actor.displayName,
            reviewedAt: now,
            version: nextVersion,
            versionHistory: history,
          };
          workingList[targetIdx] = mergedTarget;
          updatedQuestions.push(mergedTarget);
          proposalIdsToDelete.push(item.id);
          continue;
        }
      }

      const upd: QuestionItem = {
        ...item,
        review_status: status,
        reviewedBy: actor.displayName,
        reviewedAt: now,
      };
      workingList[idx] = upd;
      updatedQuestions.push(upd);
    }

    const deleteSet = new Set(proposalIdsToDelete);
    const finalQuestions =
      deleteSet.size > 0 ? workingList.filter((q) => !deleteSet.has(q.id)) : workingList;

    this.save({...this.db, questions: finalQuestions});
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      if (updatedQuestions.length > 0) {
        void this.supabase
          .from('questions')
          .upsert(updatedQuestions.map(questionToRow), {onConflict: 'id'});
      }
      if (proposalIdsToDelete.length > 0) {
        void this.supabase.from('questions').delete().in('id', proposalIdsToDelete);
      }
    }
    return true;
  }

  deleteQuestion(actor: UserAccount, questionId: string): boolean {
    if (!canEditSettingsOrUsers(actor)) return false;
    this.save({...this.db, questions: this.db.questions.filter((q) => q.id !== questionId)});
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase.from('questions').delete().eq('id', questionId);
    }
    return true;
  }

  // ---- CLASSES, ADMIN USERS, SETTINGS ----

  getClasses(): ClassRoom[] {
    return [...this.db.classes];
  }

  toggleUserLock(
    actor: UserAccount,
    targetUid: string,
  ): {ok: boolean; locked?: boolean; error?: string} {
    if (!canAccessAdmin(actor)) {
      return {ok: false, error: 'Không có quyền khóa tài khoản.'};
    }
    const target = this.db.users.find((u) => u.uid === targetUid);
    if (!target) return {ok: false, error: 'Không tìm thấy tài khoản.'};
    if (target.uid === actor.uid) {
      return {ok: false, error: 'Không thể tự khóa tài khoản của chính mình.'};
    }
    if (actor.role === 'teacher') {
      if (target.role !== 'student' || !this.isManagedByTeacher(actor, target.classId, target.teacherUid)) {
        return {ok: false, error: 'Giáo viên chỉ được khóa/mở khóa học sinh lớp mình quản lý.'};
      }
    }
    const nextLocked = !target.locked;
    const nextStatus: AccountStatus = nextLocked ? 'locked' : 'active';
    this.save({
      ...this.db,
      users: this.db.users.map((u) =>
        u.uid === targetUid ? {...u, locked: nextLocked, status: nextStatus} : u,
      ),
    });
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('users')
        .update({locked: nextLocked, status: nextStatus, updated_at: new Date().toISOString()})
        .eq('uid', targetUid);
    }
    return {ok: true, locked: nextLocked};
  }

  updateStudentDisplayName(
    actor: UserAccount,
    targetUid: string,
    newDisplayName: string,
  ): {ok: boolean; error?: string} {
    if (!canAccessAdmin(actor)) return {ok: false, error: 'Không có quyền sửa tên.'};
    const trimmed = newDisplayName.trim();
    if (trimmed.length < 2) return {ok: false, error: 'Tên hiển thị cần ít nhất 2 ký tự.'};
    const target = this.db.users.find((u) => u.uid === targetUid);
    if (!target) return {ok: false, error: 'Không tìm thấy tài khoản.'};
    if (
      actor.role === 'teacher' &&
      (target.role !== 'student' || !this.isManagedByTeacher(actor, target.classId, target.teacherUid))
    ) {
      return {ok: false, error: 'Giáo viên chỉ được sửa tên học sinh lớp mình quản lý.'};
    }
    this.save({
      ...this.db,
      users: this.db.users.map((u) =>
        u.uid === targetUid ? {...u, displayName: trimmed} : u,
      ),
    });
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('users')
        .update({display_name: trimmed, updated_at: new Date().toISOString()})
        .eq('uid', targetUid);
    }
    return {ok: true};
  }

  async resetUserPasswordViaServer(
    actor: UserAccount,
    targetUid: string,
    newPassword: string,
  ): Promise<{ok: boolean; message: string}> {
    if (!canAccessAdmin(actor)) {
      return {ok: false, message: 'Không có quyền đặt lại mật khẩu.'};
    }
    const pCheck = validatePassword(newPassword);
    if (!pCheck.ok) return {ok: false, message: pCheck.message ?? 'Mật khẩu chưa hợp lệ.'};

    if (!this.isSupabaseConfigured()) {
      const salt = generateSalt();
      const hash = await hashPassword(newPassword, salt);
      this.save({
        ...this.db,
        users: this.db.users.map((u) =>
          u.uid === targetUid ? {...u, passwordHash: hash, passwordSalt: salt} : u,
        ),
      });
      return {ok: true, message: 'Đã đặt lại mật khẩu cục bộ thành công.'};
    }

    try {
      const token = await this.getAccessToken();
      const resp = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({targetUid, newPassword}),
      });
      const data = (await resp.json()) as {ok?: boolean; message?: string; error?: string};
      if (!resp.ok || !data.ok) {
        return {ok: false, message: data.error ?? 'Chưa thể đặt lại mật khẩu.'};
      }
      return {ok: true, message: data.message ?? 'Đã đặt lại mật khẩu thành công.'};
    } catch {
      return {ok: false, message: 'Lỗi mạng khi gọi máy chủ đặt lại mật khẩu.'};
    }
  }

  renameClass(actor: UserAccount, classId: string, newName: string): {ok: boolean; error?: string} {
    if (!canAccessAdmin(actor)) return {ok: false, error: 'Không có quyền sửa lớp.'};
    const trimmed = newName.trim();
    if (trimmed.length < 2) return {ok: false, error: 'Tên lớp cần ít nhất 2 ký tự.'};
    const cls = this.db.classes.find((c) => c.id === classId);
    if (!cls) return {ok: false, error: 'Không tìm thấy lớp học.'};
    if (actor.role === 'teacher' && !this.isManagedByTeacher(actor, cls.id, cls.teacherUid)) {
      return {ok: false, error: 'Giáo viên chỉ được sửa lớp mình phụ trách.'};
    }
    const updated: ClassRoom = {...cls, name: trimmed};
    this.save({
      ...this.db,
      classes: this.db.classes.map((c) => (c.id === classId ? updated : c)),
    });
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase.from('classes').update({name: trimmed}).eq('id', classId);
    }
    return {ok: true};
  }

  reassignClassTeacher(
    actor: UserAccount,
    classId: string,
    newTeacherUid: string,
  ): {ok: boolean; error?: string} {
    if (!canEditSettingsOrUsers(actor)) {
      return {ok: false, error: 'Chỉ Quản trị viên mới được chuyển giáo viên phụ trách lớp.'};
    }
    const cls = this.db.classes.find((c) => c.id === classId);
    if (!cls) return {ok: false, error: 'Không tìm thấy lớp học.'};
    const updated: ClassRoom = {...cls, teacherUid: newTeacherUid};
    this.save({
      ...this.db,
      classes: this.db.classes.map((c) => (c.id === classId ? updated : c)),
    });
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase.from('classes').update({teacher_uid: newTeacherUid}).eq('id', classId);
    }
    return {ok: true};
  }

  toggleArchiveClass(
    actor: UserAccount,
    classId: string,
  ): {ok: boolean; archived?: boolean; error?: string} {
    if (!canAccessAdmin(actor)) return {ok: false, error: 'Không có quyền lưu trữ lớp.'};
    const cls = this.db.classes.find((c) => c.id === classId);
    if (!cls) return {ok: false, error: 'Không tìm thấy lớp học.'};
    if (actor.role === 'teacher' && !this.isManagedByTeacher(actor, cls.id, cls.teacherUid)) {
      return {ok: false, error: 'Giáo viên chỉ được lưu trữ lớp mình phụ trách.'};
    }
    const nextArchived = !cls.archived;
    this.save({
      ...this.db,
      classes: this.db.classes.map((c) =>
        c.id === classId ? {...c, archived: nextArchived} : c,
      ),
    });
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase.from('classes').update({archived: nextArchived}).eq('id', classId);
    }
    return {ok: true, archived: nextArchived};
  }

  private isManagedByTeacher(teacher: UserAccount, classId?: string, teacherUid?: string): boolean {
    if (teacher.role === 'admin') return true;
    if (teacher.role !== 'teacher') return false;
    if (teacherUid === teacher.uid) return true;
    if (classId && (teacher.assignedClassIds ?? []).includes(classId)) return true;
    return this.db.classes.some((c) => c.id === classId && c.teacherUid === teacher.uid);
  }

  /**
   * Role-scoped classes: Admin sees all; Teacher sees ONLY their own/assigned classes.
   */
  getScopedClasses(actor: UserAccount): ClassRoom[] {
    if (actor.role === 'admin') return [...this.db.classes];
    if (actor.role === 'teacher') {
      return this.db.classes.filter((c) => this.isManagedByTeacher(actor, c.id, c.teacherUid));
    }
    return this.db.classes.filter((c) => c.id === actor.classId);
  }

  /**
   * Role-scoped users: Admin sees all; Teacher sees ONLY students in their own classes
   * (never other teachers or admins).
   */
  getScopedUsers(actor: UserAccount): UserAccount[] {
    if (actor.role === 'admin') return [...this.db.users];
    if (actor.role === 'teacher') {
      return this.db.users.filter(
        (u) => u.role === 'student' && this.isManagedByTeacher(actor, u.classId, u.teacherUid),
      );
    }
    return this.db.users.filter((u) => u.uid === actor.uid);
  }

  getScopedAttempts(actor: UserAccount, includeTest = false): AttemptRecord[] {
    const base = this.getAttempts(includeTest);
    if (actor.role === 'admin') return base;
    if (actor.role === 'teacher') {
      return base.filter((a) => this.isManagedByTeacher(actor, a.classId, a.teacherUid));
    }
    return base.filter((a) => a.userId === actor.uid);
  }

  getScopedEvents(actor: UserAccount, includeTest = false): LearningEvent[] {
    const base = this.getEvents(includeTest);
    if (actor.role === 'admin') return base;
    if (actor.role === 'teacher') {
      return base.filter((e) => this.isManagedByTeacher(actor, e.classId, e.teacherUid));
    }
    return base.filter((e) => e.userId === actor.uid);
  }

  getScopedRebuttals(actor: UserAccount): RebuttalRecord[] {
    if (actor.role === 'admin') return [...this.db.rebuttals];
    if (actor.role === 'teacher') {
      return this.db.rebuttals.filter((r) => this.isManagedByTeacher(actor, r.classId, r.teacherUid));
    }
    return this.db.rebuttals.filter((r) => r.userId === actor.uid);
  }

  createClass(actor: UserAccount, name: string, code: string, expiresAt?: string): ClassRoom | null {
    if (!canAccessAdmin(actor)) return null;
    const upperCode = code.trim().toUpperCase();
    const cls: ClassRoom = {
      id: generateId('cls'),
      name: name.trim(),
      code: upperCode,
      codeExpiresAt: expiresAt || undefined,
      teacherUid: actor.uid,
      createdAt: new Date().toISOString(),
    };
    this.save({...this.db, classes: [...this.db.classes, cls]});
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      const sb = this.supabase;
      void sb
        .from('classes')
        .upsert(classToRow(cls), {onConflict: 'id'})
        .then(() =>
          sb.from('class_codes').upsert(
            {
              code: upperCode,
              class_id: cls.id,
              class_name: cls.name,
              teacher_uid: actor.uid,
              active: true,
              expires_at: expiresAt || null,
            },
            {onConflict: 'code'},
          ),
        );
    }
    return cls;
  }

  regenerateClassCode(actor: UserAccount, classId: string): string | null {
    if (!canAccessAdmin(actor)) return null;
    const targetCls = this.db.classes.find((c) => c.id === classId);
    if (!targetCls) return null;
    if (actor.role === 'teacher' && !this.isManagedByTeacher(actor, targetCls.id, targetCls.teacherUid)) {
      return null;
    }
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    let oldCode = '';
    let nextCode = '';
    let updatedClass: ClassRoom | null = null;
    const next = this.db.classes.map((c) => {
      if (c.id !== classId) return c;
      oldCode = c.code;
      nextCode = `${c.name.replace(/\s+/g, '')}-${suffix}`;
      updatedClass = {...c, code: nextCode};
      return updatedClass;
    });
    this.save({...this.db, classes: next});
    if (updatedClass && this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      const cls: ClassRoom = updatedClass;
      const sb = this.supabase;
      void sb.from('classes').upsert(classToRow(cls), {onConflict: 'id'});
      if (oldCode) {
        void sb.from('class_codes').update({active: false}).eq('code', oldCode.toUpperCase());
      }
      void sb.from('class_codes').upsert(
        {
          code: nextCode.toUpperCase(),
          class_id: cls.id,
          class_name: cls.name,
          teacher_uid: cls.teacherUid,
          active: true,
          expires_at: cls.codeExpiresAt ?? null,
        },
        {onConflict: 'code'},
      );
    }
    return nextCode || null;
  }

  async adminCreateTeacher(
    actor: UserAccount,
    params: {username: string; password: string; displayName: string},
  ): Promise<{ok: boolean; user?: UserAccount; error?: string}> {
    if (!canEditSettingsOrUsers(actor)) {
      return {ok: false, error: 'Chỉ quản trị viên mới có quyền tạo tài khoản giáo viên.'};
    }
    const uCheck = validateUsername(params.username);
    if (!uCheck.ok) return {ok: false, error: uCheck.message};
    const pCheck = validatePassword(params.password);
    if (!pCheck.ok) return {ok: false, error: pCheck.message};

    const normalized = params.username.trim().toLowerCase();
    const displayName = params.displayName.trim() || 'Giáo viên Toán';
    const now = new Date().toISOString();

    const initialProfile = {
      avatar: {...DEFAULT_AVATAR, outfitId: 'hoc_vien'},
      skills: createInitialSkills(),
      inventory: {
        outfits: ['hoc_vien'],
        tools: ['tool_ruler', 'tool_protractor'],
        heroCards: [],
        landmarkCards: [],
        skillCards: [],
        upgradeShards: 0,
        openedChests: [],
      },
      stations: createInitialStations(),
      journey: createInitialJourneyProgress(),
      preferences: {audioEnabled: false, reduceMotion: false, easyMove: false},
    };

    // 1. Supabase mode: create auth user on ephemeral client so Admin stays logged in
    if (this.isSupabaseConfigured() && this.supabase && this.isOnline) {
      try {
        const ephemeral = createEphemeralSupabaseClient(this.resolveSupabaseConfig());
        if (!ephemeral) {
          return {ok: false, error: 'Không khởi tạo được kết nối Supabase.'};
        }
        const {data: authData, error: signUpErr} = await ephemeral.auth.signUp({
          email: toAuthEmail(normalized),
          password: params.password,
        });
        if (signUpErr || !authData.user) {
          return {ok: false, error: mapSupabaseAuthError(signUpErr).message};
        }

        const {data: createdRow, error: rpcErr} = await this.supabase.rpc(
          'admin_create_teacher_profile',
          {
            p_target_uid: authData.user.id,
            p_username: normalized,
            p_display_name: displayName,
            p_initial_profile: initialProfile,
          },
        );
        if (rpcErr || !createdRow) {
          return {
            ok: false,
            error: rpcErr?.message || 'Không thể lưu hồ sơ giáo viên trên Supabase.',
          };
        }

        const teacherUser: UserAccount = rowToUser(createdRow as Record<string, unknown>);
        this.save({
          ...this.db,
          users: [...this.db.users.filter((u) => u.uid !== teacherUser.uid), teacherUser],
        });
        return {ok: true, user: teacherUser};
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Lỗi tạo tài khoản giáo viên trên Supabase.',
        };
      }
    }

    // 2. LocalAdapter fallback
    if (this.db.users.some((u) => u.username === normalized)) {
      return {ok: false, error: 'Tên đăng nhập này đã tồn tại.'};
    }
    const salt = generateSalt();
    const hash = await hashPassword(params.password, salt);
    const uid = generateId('gv');
    const teacherCount = this.db.users.filter((u) => u.role === 'teacher').length + 1;
    const teacherUser: UserAccount = {
      uid,
      username: normalized,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'teacher',
      status: 'active',
      displayName,
      studentCode: `GV-${String(teacherCount).padStart(2, '0')}`,
      classId: 'cls_teacher',
      classCode: 'GIAO-VIEN',
      teacherUid: uid,
      assignedClassIds: [],
      researchConsent: false,
      isTestAccount: false,
      locked: false,
      createdAt: now,
      avatarCreated: true,
      avatar: initialProfile.avatar,
      xp: 0,
      awardedKeys: [],
      skills: initialProfile.skills,
      inventory: initialProfile.inventory,
      stations: initialProfile.stations,
      journey: initialProfile.journey,
      pausedSession: null,
      recentQuestionSessions: [],
      leaderboardOptIn: false,
      preferences: initialProfile.preferences,
    };
    this.save({
      ...this.db,
      users: [...this.db.users, teacherUser],
    });
    return {ok: true, user: teacherUser};
  }

  /**
   * Allows a Teacher (for their own classes) or Admin (for any class) to directly
   * issue a student login account and assign the student straight into that class.
   */
  async staffCreateStudent(
    actor: UserAccount,
    params: {username: string; password: string; displayName: string; classId: string},
  ): Promise<{ok: boolean; user?: UserAccount; error?: string}> {
    if (!canAccessAdmin(actor)) {
      return {ok: false, error: 'Chỉ giáo viên hoặc quản trị viên mới có quyền cấp tài khoản học sinh.'};
    }
    const uCheck = validateUsername(params.username);
    if (!uCheck.ok) return {ok: false, error: uCheck.message};
    const pCheck = validatePassword(params.password);
    if (!pCheck.ok) return {ok: false, error: pCheck.message};

    const cls = this.db.classes.find((c) => c.id === params.classId);
    if (!cls) {
      return {ok: false, error: 'Vui lòng chọn một lớp hợp lệ (hãy tạo lớp ở tab Lớp trước nếu chưa có).'};
    }
    if (actor.role === 'teacher' && !this.isManagedByTeacher(actor, cls.id, cls.teacherUid)) {
      return {ok: false, error: 'Giáo viên chỉ được cấp tài khoản cho học sinh thuộc lớp mình phụ trách.'};
    }

    const normalized = params.username.trim().toLowerCase();
    const displayName = params.displayName.trim() || 'Học viên khám phá';
    const now = new Date().toISOString();

    const initialProfile = {
      avatar: {...DEFAULT_AVATAR},
      skills: createInitialSkills(),
      inventory: {
        outfits: ['hoc_vien', 'ao_xanh_ngoc'],
        tools: ['tool_ruler'],
        heroCards: [],
        landmarkCards: [],
        skillCards: ['sk_angle_sum'],
        upgradeShards: 0,
        openedChests: [],
      },
      stations: createInitialStations(),
      journey: createInitialJourneyProgress(),
      preferences: {
        audioEnabled: this.db.settings.audioDefaultOn,
        reduceMotion: false,
        easyMove: false,
      },
    };

    // 1. Supabase mode: signUp on ephemeral client so Teacher/Admin stays logged in
    if (this.isSupabaseConfigured() && this.supabase && this.isOnline) {
      try {
        // Ensure class exists on server before binding student
        await this.supabase.from('classes').upsert(classToRow(cls), {onConflict: 'id'});

        const ephemeral = createEphemeralSupabaseClient(this.resolveSupabaseConfig());
        if (!ephemeral) {
          return {ok: false, error: 'Không khởi tạo được kết nối Supabase.'};
        }
        const {data: authData, error: signUpErr} = await ephemeral.auth.signUp({
          email: toAuthEmail(normalized),
          password: params.password,
        });
        if (signUpErr || !authData.user) {
          return {ok: false, error: mapSupabaseAuthError(signUpErr).message};
        }

        const {data: createdRow, error: rpcErr} = await this.supabase.rpc(
          'staff_create_student_profile',
          {
            p_target_uid: authData.user.id,
            p_username: normalized,
            p_display_name: displayName,
            p_class_id: cls.id,
            p_initial_profile: initialProfile,
          },
        );
        if (rpcErr || !createdRow) {
          return {
            ok: false,
            error: rpcErr?.message || 'Không thể lưu hồ sơ học sinh vào lớp trên Supabase.',
          };
        }

        const studentUser: UserAccount = rowToUser(createdRow as Record<string, unknown>);
        this.save({
          ...this.db,
          users: [...this.db.users.filter((u) => u.uid !== studentUser.uid), studentUser],
        });
        return {ok: true, user: studentUser};
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Lỗi cấp tài khoản học sinh trên Supabase.',
        };
      }
    }

    // 2. LocalAdapter fallback
    if (this.db.users.some((u) => u.username === normalized)) {
      return {ok: false, error: 'Tên đăng nhập này đã tồn tại.'};
    }
    const salt = generateSalt();
    const hash = await hashPassword(params.password, salt);
    const uid = generateId('usr');
    const countInClass =
      this.db.users.filter((u) => u.classId === cls.id && u.role === 'student').length + 1;
    const studentUser: UserAccount = {
      uid,
      username: normalized,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'student',
      status: 'active',
      displayName,
      studentCode: `HS-${cls.name}-${String(countInClass).padStart(2, '0')}`,
      classId: cls.id,
      classCode: cls.code,
      teacherUid: cls.teacherUid,
      assignedClassIds: [],
      researchConsent: false,
      isTestAccount: false,
      locked: false,
      createdAt: now,
      avatarCreated: false,
      avatar: initialProfile.avatar,
      xp: 0,
      awardedKeys: [],
      skills: initialProfile.skills,
      inventory: initialProfile.inventory,
      stations: initialProfile.stations,
      journey: initialProfile.journey,
      pausedSession: null,
      recentQuestionSessions: [],
      leaderboardOptIn: false,
      preferences: initialProfile.preferences,
    };
    this.save({
      ...this.db,
      users: [...this.db.users, studentUser],
    });
    return {ok: true, user: studentUser};
  }

  async staffBulkCreateStudents(
    actor: UserAccount,
    params: {
      classId: string;
      students: Array<{displayName: string; username: string; password: string}>;
    },
  ): Promise<{
    ok: boolean;
    error?: string;
    createdCount: number;
    failedCount: number;
    results: Array<{
      stt: number;
      studentCode: string;
      displayName: string;
      className: string;
      classCode: string;
      username: string;
      password: string;
      status: 'created' | 'failed';
      error?: string;
      uid?: string;
    }>;
  }> {
    if (!canAccessAdmin(actor)) {
      return {
        ok: false,
        error: 'Chỉ Quản trị viên hoặc Giáo viên mới có quyền cấp tài khoản hàng loạt.',
        createdCount: 0,
        failedCount: params.students.length,
        results: [],
      };
    }

    const cls = this.db.classes.find((c) => c.id === params.classId);
    if (!cls) {
      return {
        ok: false,
        error: 'Không tìm thấy lớp học đã chọn.',
        createdCount: 0,
        failedCount: params.students.length,
        results: [],
      };
    }
    if (actor.role === 'teacher' && !this.isManagedByTeacher(actor, cls.id, cls.teacherUid)) {
      return {
        ok: false,
        error: 'Giáo viên chỉ được cấp học sinh vào các lớp mình phụ trách.',
        createdCount: 0,
        failedCount: params.students.length,
        results: [],
      };
    }

    const initialProfile = {
      avatar: {...DEFAULT_AVATAR},
      skills: createInitialSkills(),
      inventory: {
        outfits: ['hoc_vien'],
        tools: ['tool_ruler', 'tool_protractor'],
        heroCards: [],
        landmarkCards: [],
        skillCards: ['sk_angle_sum'],
        upgradeShards: 0,
        openedChests: [],
      },
      stations: createInitialStations(),
      journey: createInitialJourneyProgress(),
      preferences: {
        audioEnabled: this.db.settings.audioDefaultOn,
        reduceMotion: false,
        easyMove: false,
      },
    };

    // 1. Supabase mode: use dedicated server API (Auth Admin API -> zero public signup rate limits)
    if (this.isSupabaseConfigured() && this.supabase && this.isOnline) {
      try {
        const token = await this.getAccessToken();
        const resp = await fetch('/api/admin/bulk-create-students', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
          },
          body: JSON.stringify({
            classId: cls.id,
            students: params.students,
            initialProfile,
          }),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          error?: string;
          createdCount?: number;
          failedCount?: number;
          results?: Array<{
            stt: number;
            studentCode: string;
            displayName: string;
            className: string;
            classCode: string;
            username: string;
            password: string;
            status: 'created' | 'failed';
            error?: string;
            userRow?: Record<string, unknown>;
          }>;
        };

        if (!resp.ok || !data.ok || !Array.isArray(data.results)) {
          return {
            ok: false,
            error: data.error ?? 'Không thể cấp tài khoản hàng loạt trên máy chủ.',
            createdCount: 0,
            failedCount: params.students.length,
            results: [],
          };
        }

        const newUsers: UserAccount[] = [];
        const cleanResults = data.results.map((r) => {
          let uid: string | undefined;
          if (r.status === 'created' && r.userRow) {
            const mapped = rowToUser(r.userRow);
            if (mapped.uid) {
              uid = mapped.uid;
              newUsers.push(mapped);
            }
          }
          return {
            stt: r.stt,
            studentCode: r.studentCode,
            displayName: r.displayName,
            className: r.className,
            classCode: r.classCode,
            username: r.username,
            password: r.password,
            status: r.status,
            error: r.error,
            uid,
          };
        });

        if (newUsers.length > 0) {
          const newUidSet = new Set(newUsers.map((u) => u.uid));
          this.save({
            ...this.db,
            users: [...this.db.users.filter((u) => !newUidSet.has(u.uid)), ...newUsers],
          });
        }

        return {
          ok: true,
          createdCount: data.createdCount ?? newUsers.length,
          failedCount: data.failedCount ?? 0,
          results: cleanResults,
        };
      } catch (err) {
        return {
          ok: false,
          error: `Lỗi kết nối máy chủ khi cấp hàng loạt: ${err instanceof Error ? err.message : 'Lỗi mạng'}.`,
          createdCount: 0,
          failedCount: params.students.length,
          results: [],
        };
      }
    }

    // 2. LocalAdapter fallback (offline / local mode)
    const results: Array<{
      stt: number;
      studentCode: string;
      displayName: string;
      className: string;
      classCode: string;
      username: string;
      password: string;
      status: 'created' | 'failed';
      error?: string;
      uid?: string;
    }> = [];
    let createdCount = 0;
    for (let i = 0; i < params.students.length; i++) {
      const s = params.students[i];
      const res = await this.staffCreateStudent(actor, {
        displayName: s.displayName,
        username: s.username,
        password: s.password,
        classId: cls.id,
      });
      if (res.ok && res.user) {
        createdCount += 1;
        results.push({
          stt: i + 1,
          studentCode: res.user.studentCode,
          displayName: res.user.displayName,
          className: cls.name,
          classCode: cls.code,
          username: res.user.username,
          password: s.password,
          status: 'created',
          uid: res.user.uid,
        });
      } else {
        results.push({
          stt: i + 1,
          studentCode: '',
          displayName: s.displayName,
          className: cls.name,
          classCode: cls.code,
          username: s.username,
          password: s.password,
          status: 'failed',
          error: res.error ?? 'Chưa tạo được',
        });
      }
    }
    return {
      ok: true,
      createdCount,
      failedCount: results.length - createdCount,
      results,
    };
  }

  adminSetUserRole(actor: UserAccount, targetUid: string, role: UserRole): boolean {
    if (!canEditSettingsOrUsers(actor)) return false;
    this.updateUser(targetUid, (u) => ({...u, role}), {adminFullSync: true});
    return true;
  }

  adminToggleLockUser(actor: UserAccount, targetUid: string): boolean {
    if (!canEditSettingsOrUsers(actor)) return false;
    this.updateUser(
      targetUid,
      (u) => {
        const nextLocked = !u.locked;
        return {...u, locked: nextLocked, status: nextLocked ? 'locked' : 'active'};
      },
      {adminFullSync: true},
    );
    return true;
  }

  async adminResetPassword(
    actor: UserAccount,
    targetUid: string,
    newPassword: string,
  ): Promise<{ok: boolean; error?: string}> {
    if (!canEditSettingsOrUsers(actor)) return {ok: false, error: 'Không đủ quyền quản trị.'};
    const pCheck = validatePassword(newPassword);
    if (!pCheck.ok) return {ok: false, error: pCheck.message};
    const salt = generateSalt();
    const hash = await hashPassword(newPassword, salt);
    this.updateUser(targetUid, (u) => ({...u, passwordSalt: salt, passwordHash: hash}));
    return {ok: true};
  }

  async createTwoTestAccounts(actor: UserAccount): Promise<{ok: boolean; created: string[]; error?: string}> {
    if (!canEditSettingsOrUsers(actor)) {
      return {ok: false, created: [], error: 'Chỉ quản trị viên mới có thể tạo tài khoản TEST.'};
    }
    const created: string[] = [];
    const pairs = [
      {username: 'test_hv01', displayName: 'Học viên TEST 01'},
      {username: 'test_hv02', displayName: 'Học viên TEST 02'},
    ];
    for (const p of pairs) {
      if (!this.db.users.some((u) => u.username === p.username)) {
        const res = await this.registerStudent({
          username: p.username,
          password: 'TestUser@2026',
          displayName: p.displayName,
          classCode: this.db.classes[0]?.code ?? 'TOAN10-01',
          isTestAccount: true,
        });
        if (res.ok) created.push(`${p.username} (mật khẩu: TestUser@2026)`);
      }
    }
    return {ok: true, created};
  }

  // ---- 10-MILESTONE SEQUENTIAL JOURNEY PROGRESS & RBAC CONTROLS ----

  getUserJourney(uid: string): JourneyProgress {
    const u = this.db.users.find((x) => x.uid === uid);
    return normalizeJourneyProgress(u?.journey);
  }

  canUserEnterMoc(uid: string, mocId: MocId): boolean {
    const u = this.db.users.find((x) => x.uid === uid);
    if (!u) return false;
    return canEnterMoc(mocId, u.journey, Boolean(this.db.settings.journeyUnlockAllDemo));
  }

  canUserChallengeMocBoss(uid: string, mocId: MocId): boolean {
    const u = this.db.users.find((x) => x.uid === uid);
    if (!u) return false;
    return canChallengeMocBoss(mocId, u.journey, Boolean(this.db.settings.journeyUnlockAllDemo));
  }

  recordMocMissionComplete(
    uid: string,
    mocId: MocId,
    options?: {usedSupport?: boolean},
  ): {
    ok: boolean;
    user: UserAccount | null;
    newlyPassedMoc: boolean;
    newlyCompletedAll: boolean;
    rewardGranted: boolean;
    error?: string;
  } {
    const existing = this.db.users.find((x) => x.uid === uid);
    if (!existing) {
      return {
        ok: false,
        user: null,
        newlyPassedMoc: false,
        newlyCompletedAll: false,
        rewardGranted: false,
        error: 'Không tìm thấy học viên.',
      };
    }
    if (!this.canUserEnterMoc(uid, mocId)) {
      return {
        ok: false,
        user: existing,
        newlyPassedMoc: false,
        newlyCompletedAll: false,
        rewardGranted: false,
        error: `Mốc ${mocId} chưa mở. Hãy hoàn thành Mốc ${mocId - 1} trước.`,
      };
    }

    const def = JOURNEY_MILESTONES_BY_ID[mocId];
    const alreadyPassed = normalizeJourneyProgress(existing.journey).passedMoc.includes(mocId);

    let rewardGranted = false;
    if (!alreadyPassed) {
      const award = this.awardOnce(uid, `moc_mission_${mocId}`, {
        xp: 35,
        toolId: def.toolRewardId,
        landmarkCardId: def.landmarkCardId,
        skillCardId: def.skillCardId,
        chestId: `CHEST_MOC_${mocId}`,
      });
      rewardGranted = award.granted;
    }

    const latestBefore = this.db.users.find((x) => x.uid === uid) ?? existing;
    const {journey, newlyPassedMoc, newlyCompletedAll} = applyMocMissionCompleted(
      latestBefore.journey,
      mocId,
      {usedSupport: options?.usedSupport},
    );

    const updated = this.updateUser(uid, (u) => ({
      ...u,
      pausedSession: null,
      journey,
      stations: {
        ...u.stations,
        [def.stationId]: {
          ...u.stations[def.stationId],
          explored: true,
          missionCompleted: true,
        },
      },
    }));

    if (updated) {
      if (newlyPassedMoc) {
        this.recordEvent({
          eventId: `journey_moc_passed_${uid}_${mocId}`,
          userId: uid,
          studentCode: updated.studentCode,
          isTestAccount: updated.isTestAccount,
          type: 'journey_moc_passed',
          payload: {mocId, city: def.city, trigger: 'mission', usedSupport: Boolean(options?.usedSupport)},
        });
      }
      if (newlyCompletedAll) {
        this.recordEvent({
          eventId: `journey_all_completed_${uid}`,
          userId: uid,
          studentCode: updated.studentCode,
          isTestAccount: updated.isTestAccount,
          type: 'journey_all_completed',
          payload: {completedAt: journey.completedAt},
        });
      }
    }

    return {
      ok: true,
      user: updated,
      newlyPassedMoc,
      newlyCompletedAll,
      rewardGranted,
    };
  }

  recordMocBossDefeat(
    uid: string,
    mocId: MocId,
    options?: {usedSupport?: boolean; bossId?: BossId},
  ): {
    ok: boolean;
    user: UserAccount | null;
    newlyPassedMoc: boolean;
    newlyCompletedAll: boolean;
    error?: string;
  } {
    const existing = this.db.users.find((x) => x.uid === uid);
    if (!existing) {
      return {
        ok: false,
        user: null,
        newlyPassedMoc: false,
        newlyCompletedAll: false,
        error: 'Không tìm thấy học viên.',
      };
    }
    if (!this.canUserChallengeMocBoss(uid, mocId)) {
      return {
        ok: false,
        user: existing,
        newlyPassedMoc: false,
        newlyCompletedAll: false,
        error: 'Cần hoàn thành nhiệm vụ của mốc này trước khi hạ BOSS.',
      };
    }

    const def = JOURNEY_MILESTONES_BY_ID[mocId];
    const {journey, newlyPassedMoc, newlyCompletedAll} = applyMocBossDefeated(
      existing.journey,
      mocId,
      {usedSupport: options?.usedSupport},
    );

    if (newlyPassedMoc) {
      this.awardOnce(uid, `moc_pass_cards_${mocId}`, {
        landmarkCardId: def.landmarkCardId,
        skillCardId: def.skillCardId,
      });
    }

    const updated = this.updateUser(uid, (u) => ({
      ...u,
      pausedSession: null,
      journey,
      stations: {
        ...u.stations,
        [def.stationId]: {
          ...u.stations[def.stationId],
          bossDefeated: true,
        },
      },
    }));

    if (updated) {
      if (newlyPassedMoc) {
        this.recordEvent({
          eventId: `journey_moc_passed_${uid}_${mocId}`,
          userId: uid,
          studentCode: updated.studentCode,
          isTestAccount: updated.isTestAccount,
          type: 'journey_moc_passed',
          payload: {mocId, city: def.city, trigger: 'boss', bossId: options?.bossId ?? def.bossId},
        });
      }
      if (newlyCompletedAll) {
        this.recordEvent({
          eventId: `journey_all_completed_${uid}`,
          userId: uid,
          studentCode: updated.studentCode,
          isTestAccount: updated.isTestAccount,
          type: 'journey_all_completed',
          payload: {completedAt: journey.completedAt},
        });
      }
    }

    return {ok: true, user: updated, newlyPassedMoc, newlyCompletedAll};
  }

  adminUnlockNextMoc(
    actor: UserAccount,
    targetUid: string,
  ): {ok: boolean; user?: UserAccount; passedMocId?: MocId; unlockedMoc?: MocId; error?: string} {
    if (!canAccessAdmin(actor)) {
      return {ok: false, error: 'Chỉ quản trị viên hoặc giáo viên mới có quyền mở mốc kế tiếp.'};
    }
    const target = this.db.users.find((u) => u.uid === targetUid);
    if (!target) {
      return {ok: false, error: 'Không tìm thấy tài khoản học viên.'};
    }
    if (
      actor.role === 'teacher' &&
      target.teacherUid !== actor.uid &&
      !(actor.assignedClassIds ?? []).includes(target.classId ?? '')
    ) {
      return {ok: false, error: 'Giáo viên chỉ được thao tác trên học viên thuộc lớp được giao.'};
    }

    const {journey, passedMocId, unlockedMoc} = applyAdminUnlockNextMoc(target.journey);
    const updated = this.updateUser(targetUid, (u) => ({
      ...u,
      journey,
    }));

    if (updated) {
      this.recordEvent({
        eventId: generateId(`adm_unlock_${targetUid}_${passedMocId}`),
        userId: targetUid,
        studentCode: updated.studentCode,
        isTestAccount: updated.isTestAccount,
        type: 'admin_unlock_next_moc',
        payload: {
          actorUid: actor.uid,
          actorRole: actor.role,
          passedMocId,
          unlockedMoc,
        },
      });
    }

    return {ok: true, user: updated ?? undefined, passedMocId, unlockedMoc};
  }

  adminResetUserJourney(
    actor: UserAccount,
    targetUid: string,
  ): {ok: boolean; user?: UserAccount; error?: string} {
    if (!canAccessAdmin(actor)) {
      return {ok: false, error: 'Chỉ quản trị viên hoặc giáo viên mới có quyền đặt lại hành trình.'};
    }
    const target = this.db.users.find((u) => u.uid === targetUid);
    if (!target) {
      return {ok: false, error: 'Không tìm thấy tài khoản học viên.'};
    }
    if (
      actor.role === 'teacher' &&
      target.teacherUid !== actor.uid &&
      !(actor.assignedClassIds ?? []).includes(target.classId ?? '')
    ) {
      return {ok: false, error: 'Giáo viên chỉ được đặt lại hành trình cho học viên thuộc lớp được giao.'};
    }

    const freshJourney = createInitialJourneyProgress();
    const updated = this.updateUser(targetUid, (u) => ({
      ...u,
      journey: freshJourney,
      pausedSession: null,
    }));

    if (updated) {
      this.recordEvent({
        eventId: generateId(`adm_reset_journey_${targetUid}`),
        userId: targetUid,
        studentCode: updated.studentCode,
        isTestAccount: updated.isTestAccount,
        type: 'admin_reset_journey',
        payload: {actorUid: actor.uid, actorRole: actor.role},
      });
    }

    return {ok: true, user: updated ?? undefined};
  }

  adminSetUnlockAllDemo(actor: UserAccount, enabled: boolean): boolean {
    if (!canEditSettingsOrUsers(actor)) return false;
    return this.updateSettings(actor, {journeyUnlockAllDemo: enabled});
  }

  adminSaveMapAlignment(
    actor: UserAccount,
    overrides: Partial<Record<MocId, MapPinCoords>>,
  ): boolean {
    if (!canEditSettingsOrUsers(actor)) return false;
    return this.updateSettings(actor, {mapPinOverrides: overrides});
  }

  adminSaveMapBackground(
    actor: UserAccount,
    dataUrl: string | undefined,
    hasBakedLabels: boolean,
  ): {ok: boolean; error?: string} {
    if (!canEditSettingsOrUsers(actor)) {
      return {ok: false, error: 'Chỉ quản trị viên mới có quyền thay đổi ảnh nền bản đồ.'};
    }
    if (dataUrl && dataUrl.length > 1_250_000) {
      return {
        ok: false,
        error: 'Ảnh nén vẫn vượt giới hạn lưu trữ (≤ 900 KB JPEG). Hãy chọn ảnh nhẹ hơn.',
      };
    }
    const ok = this.updateSettings(actor, {
      mapBackgroundDataUrl: dataUrl,
      mapBackgroundHasBakedLabels: hasBakedLabels,
    });
    return {ok};
  }

  getSettings(): AppSettings {
    return {...this.db.settings};
  }

  updateSettings(actor: UserAccount, patch: Partial<AppSettings>): boolean {
    if (!canEditSettingsOrUsers(actor)) return false;
    const nextSettings: AppSettings = {...this.db.settings, ...patch};
    this.save({...this.db, settings: nextSettings});
    if (patch.supabaseUrl !== undefined || patch.supabasePublishableKey !== undefined) {
      this.tryInitSupabase();
    }
    if (this.supabase && this.isSupabaseAuthenticated() && this.isOnline) {
      void this.supabase
        .from('app_settings')
        .upsert(settingsToRow(nextSettings), {onConflict: 'id'});
      if (patch.driveClientId !== undefined || patch.driveApiKey !== undefined) {
        void this.supabase.from('staff_settings').upsert(
          {
            id: 'global',
            drive_client_id: nextSettings.driveClientId ?? null,
            drive_api_key: nextSettings.driveApiKey ?? null,
            updated_at: new Date().toISOString(),
          },
          {onConflict: 'id'},
        );
      }
    }
    return true;
  }

  getAttempts(includeTest = false): AttemptRecord[] {
    return includeTest ? [...this.db.attempts] : this.db.attempts.filter((a) => !a.isTestAccount);
  }

  getEvents(includeTest = false): LearningEvent[] {
    return includeTest ? [...this.db.events] : this.db.events.filter((e) => !e.isTestAccount);
  }

  exportAttemptsCsv(includeTest = false): string {
    const rows = this.getAttempts(includeTest);
    const header = [
      'studentCode',
      'questionId',
      'questionVersion',
      'seed',
      'questionSnapshot',
      'cluster',
      'mode',
      'switchedToPractice',
      'isCorrect',
      'usedHint',
      'clickedDontKnow',
      'errorCode',
      'durationMs',
      'rubricScore',
      'createdAt',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.studentCode,
          r.questionId,
          r.questionVersion ?? 1,
          r.seed ?? '',
          r.questionSnapshot ?? '',
          r.cluster,
          r.mode,
          r.switchedToPractice,
          r.isCorrect,
          r.usedHint,
          r.clickedDontKnow,
          r.errorCode ?? '',
          r.durationMs,
          r.rubricScore ?? '',
          r.createdAt,
        ]
          .map(escape)
          .join(','),
      ),
    ];
    return lines.join('\n');
  }
}

export const dataService = new DataService();

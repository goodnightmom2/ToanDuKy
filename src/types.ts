export type UserRole = 'student' | 'teacher' | 'admin';

export type AccountStatus = 'active' | 'locked';

export type SyncStatus = 'saved' | 'pending_sync' | 'local_only';

export interface SyncResult {
  ok: boolean;
  syncedUser: boolean;
  syncedEvents: number;
  syncedAttempts: number;
  syncedRebuttals: number;
  syncedReports: number;
  skippedDuplicates: number;
  message: string;
}

export type SkillCluster = 'NEN' | 'LG' | 'COS' | 'SIN' | 'DT' | 'MH';

export type SkillState =
  | 'Chưa đủ dữ liệu'
  | 'Đang luyện'
  | 'Làm được có hỗ trợ'
  | 'Tự làm được'
  | 'Cần ôn lại';

export type QuestionMode = 'practice' | 'verify';

export type ReviewStatus = 'approved' | 'pending_teacher_review' | 'rejected';

export type QuestionType =
  | 'mcq'
  | 'true_false_multi'
  | 'numeric'
  | 'matching'
  | 'fill_relation'
  | 'tap_diagram'
  | 'error_spot'
  | 'measurement'
  | 'agree_explain';

export type StationId = 'QS01' | 'DD01' | 'BS01' | 'KV01' | 'HT01';

export type BossId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5';

export type MocId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface MapPinCoords {
  x: number; // Percentage 0..100 on 1024x572 map
  y: number; // Percentage 0..100 on 1024x572 map
}

export interface MocStatusRecord {
  mocId: MocId;
  explored?: boolean;
  missionCompleted: boolean;
  bossDefeated: boolean;
  passed: boolean;
  passedAt?: string;
  usedSupport?: boolean;
  skillStars?: number; // 1..3 derived purely from support/independent evidence, never blocks pass
  unlockedByAdmin?: boolean;
}

export interface JourneyProgress {
  currentMoc: MocId;
  passedMoc: MocId[];
  mocStatus: Partial<Record<MocId, MocStatusRecord>>;
  completedAt: string | null;
  lastTransitionFrom?: MocId | null;
  lastTransitionAt?: string | null;
}

export type AvatarView = 'front' | 'back' | 'side';

export type AvatarFrame = 'idle' | 'walk1' | 'walk2' | 'measure' | 'celebrate';

export interface AvatarAppearance {
  skinTone: string;
  hairStyle: 'short' | 'bob' | 'ponytail' | 'bun' | 'spiky' | 'braid';
  hairColor: string;
  eyeStyle: 'bright' | 'gentle' | 'focused' | 'sparkle';
  browStyle: 'soft' | 'arch' | 'determined';
  mouthStyle: 'smile' | 'grin' | 'curious' | 'proud';
  outfitId: string;
  outfitVariant: 'A' | 'B';
  headwear: 'none' | 'non_la' | 'khan_ran' | 'mu_tham_hiem' | 'vong_dong_son';
  accessory: 'none' | 'kinh_tron' | 'compa_deo' | 'ong_nhom' | 'so_tay';
  cape: 'none' | 'khan_choang_ngoc' | 'ao_choang_vang';
  badge: 'none' | 'la_ban' | 'chim_lac' | 'tam_giac_vang';
}

export interface SkillRecord {
  cluster: SkillCluster;
  state: SkillState;
  lastUpdated: string;
  practiceCorrect: number;
  verifyCorrect: number;
  totalAttempts: number;
  recentNote?: string;
}

export interface InventoryState {
  outfits: string[];
  tools: string[];
  heroCards: string[];
  landmarkCards: string[];
  skillCards: string[];
  upgradeShards: number;
  openedChests: string[];
}

export interface StationProgress {
  stationId: StationId;
  explored: boolean;
  missionCompleted: boolean;
  bossDefeated: boolean;
  openSurveyCompleted?: boolean;
  currentStepIndex: number;
  completedStepIds: string[];
}

export interface PausedSession {
  kind: 'mission' | 'boss' | 'practice';
  stationId?: StationId;
  mocId?: MocId;
  bossId?: BossId;
  stepIndex: number;
  hitIndex?: number;
  bossHp?: number;
  questionIds?: string[];
  savedAt: string;
  draftAnswer?: unknown;
  mode?: QuestionMode;
}

export interface UserAccount {
  uid: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  status?: AccountStatus;
  displayName: string; // Hero nickname or teacher name
  realNamePrivate?: string; // Never exposed publicly
  studentCode: string; // e.g., HS-10-01
  classId?: string; // e.g., cls_default
  classCode: string;
  teacherUid?: string; // Assigned class teacher UID for scoped Firestore reads
  assignedClassIds?: string[]; // For teachers/admins
  researchConsent: boolean;
  isTestAccount: boolean;
  locked: boolean;
  createdAt: string;
  avatarCreated: boolean;
  avatar: AvatarAppearance;
  xp: number;
  awardedKeys: string[];
  skills: Record<SkillCluster, SkillRecord>;
  inventory: InventoryState;
  stations: Record<StationId, StationProgress>;
  journey?: JourneyProgress;
  pausedSession: PausedSession | null;
  recentQuestionSessions: string[][]; // Last 3 sessions question IDs
  leaderboardOptIn: boolean;
  preferences: {
    audioEnabled: boolean;
    reduceMotion: boolean;
    easyMove: boolean;
  };
}

export interface ClassRoom {
  id: string;
  name: string;
  code: string;
  codeExpiresAt?: string;
  teacherUid: string;
  archived?: boolean;
  createdAt: string;
}

export interface QuestionVersion {
  version: number;
  editedAt: string;
  editedBy: string;
  note: string;
  stem_vi: string;
}

export interface CodeVerificationResult {
  status: 'verified_match' | 'mismatch_flagged' | 'unverifiable';
  codeValue?: number;
  aiValue?: number;
  roundedCodeValue?: number;
  formula_vi?: string;
  note_vi: string;
  hint1LeaksAnswer?: boolean;
}

export interface MathVerificationParams {
  kind?:
    | 'angle_sum'
    | 'sine_law_side'
    | 'cosine_law_side'
    | 'cosine_law_angle'
    | 'area_sas'
    | 'area_heron'
    | 'height_from_area'
    | 'inradius_heron'
    | 'perp_height_sin'
    | 'circumradius'
    | 'ratio_solve'
    | 'unit_convert'
    | 'rounding'
    | 'trig_expr'
    | 'other';
  a?: number;
  b?: number;
  c?: number;
  angleA?: number;
  angleB?: number;
  angleC?: number;
  value?: number;
  fromUnit?: string;
  toUnit?: string;
  decimalPlaces?: number;
  expr?: string;
  target?: 'a' | 'b' | 'c';
}

export interface QuestionItem {
  id: string;
  stationId?: StationId;
  stage?: 'foundation' | 'core' | 'remediation' | 'independent' | 'boss' | 'practice';
  cluster: SkillCluster;
  skill_ids: string[];
  level: 1 | 2 | 3 | 4;
  type: QuestionType;
  stem_vi: string;
  options?: Array<{
    id: string;
    label: string;
    errorCode?: string;
  }>;
  statements?: Array<{
    id: string;
    label: string;
    isTrue: boolean;
    errorCode?: string;
  }>;
  expected_answer: Record<string, unknown>;
  solution_vi: string;
  anticipated_error_ids: string[];
  hints_vi: string[];
  review_status: ReviewStatus;
  source_refs: string[];
  is_adapted: boolean;
  hints_available_in_independent_mode?: boolean;
  on_hint_request_during_independent?: string;
  scoring_requires_teacher_approved_version?: boolean;
  fixedUnitLabel?: string; // If present, numeric input shows unit label so bare number is accepted
  diagramData?: {
    vertices: [string, string, string];
    coords: [[number, number, number], [number, number, number], [number, number, number]];
    highlightSide?: [number, number];
    highlightAngleIndex?: number;
    showPerpendicularH?: boolean;
    interactiveMode?: 'tap_vertex' | 'view_only' | 'measure';
    labels?: {
      AB?: string;
      BC?: string;
      AC?: string;
      A?: string;
      B?: string;
      C?: string;
    };
  };
  matchingPairs?: {
    left: string[];
    right: string[];
  };
  fillRelationTemplate?: {
    leftNumerator: string;
    rightNumerator: string;
    choices: number[];
  };
  generatorId?: string;
  seed?: number;
  standalone?: boolean; // false for sequential story items (e.g. BS01 M01-M06) excluded from standalone random pools
  version?: number;
  versionHistory?: QuestionVersion[];
  createdBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  // Section 12 import provenance, AI rationale & deterministic code verification
  source_file_name?: string;
  drive_file_id?: string;
  page_pdf?: number;
  page_printed?: string;
  source_excerpt?: string;
  confidence?: number;
  ai_reason?: string;
  math_params?: MathVerificationParams;
  code_verification?: CodeVerificationResult;
}

export interface AttemptRecord {
  id: string;
  userId: string;
  studentCode: string;
  classId?: string;
  teacherUid?: string;
  isTestAccount: boolean;
  questionId: string;
  questionVersion?: number;
  questionSnapshot?: string;
  cluster: SkillCluster;
  stationId?: StationId;
  mocId?: MocId;
  mode: QuestionMode;
  switchedToPractice: boolean;
  seed?: number;
  answerRaw: unknown;
  isCorrect: boolean;
  usedHint: boolean;
  clickedDontKnow: boolean;
  wrongCountOnQuestion: number;
  errorCode?: string;
  durationMs: number;
  rubricScore?: number; // For T01 10-point skill rubric
  createdAt: string;
}

export interface LearningEvent {
  eventId: string;
  userId: string;
  studentCode: string;
  classId?: string;
  teacherUid?: string;
  isTestAccount: boolean;
  type:
    | 'login'
    | 'avatar_saved'
    | 'station_enter'
    | 'step_complete'
    | 'attempt_submit'
    | 'hint_used'
    | 'mode_switch_practice'
    | 'dont_know'
    | 'rebuttal_submitted'
    | 'boss_hit'
    | 'boss_defeated'
    | 'chest_opened'
    | 'paused'
    | 'resumed'
    | 'open_survey_tested'
    | 'journey_moc_passed'
    | 'journey_all_completed'
    | 'admin_unlock_next_moc'
    | 'admin_reset_journey';
  payload: Record<string, unknown>;
  createdAt: string;
  synced: boolean;
}

export interface RebuttalRecord {
  id: string;
  userId: string;
  studentCode: string;
  classId?: string;
  teacherUid?: string;
  displayName: string;
  questionId: string;
  questionStem: string;
  studentAnswer: string;
  contestedFeedback: string;
  reasoning: string;
  status: 'pending' | 'reviewed' | 'accepted_revision';
  teacherReply?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface SurveyReportRecord {
  id: string;
  userId: string;
  studentCode?: string;
  classId?: string;
  teacherUid?: string;
  stationId: StationId;
  measuredAB: number;
  measuredAngleA: number;
  measuredAngleB: number;
  computedAngleC: number;
  computedAC: number;
  t01RubricScore?: number;
  t01Explanation?: string;
  t02Agreed?: boolean;
  openSurveyNote?: string;
  createdAt: string;
}

export interface AppSettings {
  helpAfterWrong: number;
  allowPendingInTestMode: boolean;
  aiEnabled: boolean;
  aiDailyQuotaLimit: number;
  audioDefaultOn: boolean;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  driveClientId?: string;
  driveApiKey?: string;
  journeyUnlockAllDemo?: boolean;
  mapBackgroundDataUrl?: string;
  mapBackgroundHasBakedLabels?: boolean;
  mapPinOverrides?: Partial<Record<MocId, MapPinCoords>>;
}

export interface BossDefinition {
  id: BossId;
  stationId: StationId;
  name: string;
  subtitle: string;
  flavorNote: string;
  hitLevels: Array<1 | 2 | 3 | 4>;
  rewardOutfitId: string;
  rewardHeroCardId: string;
  clusters: SkillCluster[];
}

export interface StationDefinition {
  id: StationId;
  order: number;
  name: string;
  region: string;
  shortName: string;
  subtitle: string;
  clusters: SkillCluster[];
  bossId: BossId;
  mapX: number; // 0..1000 SVG coordinate
  mapY: number; // 0..1200 SVG coordinate
  landmarkCardId: string;
  toolRewardId: string;
  hasFullMissionFlow: boolean;
  narrativeIntro: string;
}

export interface RemediationAssignment {
  id: string;
  studentUid: string;
  studentCode: string;
  studentName: string;
  teacherUid: string;
  classId: string;
  title: string;
  targetErrorCodes: string[];
  remediationQuestionIds: string[];
  verifyQuestionId: string;
  teacherNote: string;
  status: 'assigned' | 'remediation_done' | 'verified_passed';
  remediationCompletedIds: string[];
  verifyPassed: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface GradeResult {
  isCorrect: boolean;
  feedback_vi: string;
  errorCode?: string;
  detailStep_vi?: string;
  needsDiscriminationE01?: boolean;
}

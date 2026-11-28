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
    mathFontScale?: 'normal' | 'large';
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

export type QuestionFlag =
  | 'formula_uncertain'
  | 'figure_missing'
  | 'cut_off_at_page_end'
  | 'cut_off_at_page_start'
  | 'no_image'
  | 'out_of_chapter'
  | 'answer_mismatch'
  | 'unverifiable_by_code'
  | 'missing_answer'
  | 'proposed_new_pattern';

export type MathFlag =
  | 'unbalanced_dollar'
  | 'latex_syntax_error'
  | 'numbers_mismatch'
  | 'symbols_mismatch'
  | 'answer_mismatch'
  | 'formula_split'
  | 'formula_uncertain'
  | 'unicode_math_leftover'
  | 'unbraced_vi_decimal';

export interface FormulaImageFallback {
  dataUrl: string;
  alt: string;
  kbSize?: number;
  privateClassOnly?: boolean;
}

export type VerifiedByCodeStatus = 'pass' | 'fail' | 'n/a';

export interface FigureBBox {
  page: number;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  w: number; // 0..1 normalized
  h: number; // 0..1 normalized
}

export interface FigureSpec {
  vertices?: [string, string, string];
  sides?: {a?: number; b?: number; c?: number; AB?: string; BC?: string; AC?: string};
  angles?: {A?: number; B?: number; C?: number};
  labels?: Record<string, string>;
  description?: string;
}

export interface StructuredGivens {
  a?: number;
  b?: number;
  c?: number;
  A_deg?: number;
  B_deg?: number;
  C_deg?: number;
  R?: number;
  r?: number;
  S?: number;
  d?: number;
  alpha_deg?: number;
  beta_deg?: number;
  trig_fn?: 'sin' | 'cos' | 'tan' | 'cot';
  trig_value?: number;
  quadrant?: 'acute' | 'obtuse';
  target?: string;
  unit?: string;
  decimal_places?: number;
  v1?: number;
  v2?: number;
  t?: number;
  value?: number;
  fromUnit?: string;
  toUnit?: string;
}

export interface SourceRefMeta {
  file_name: string;
  file_sha256?: string;
  drive_file_id?: string;
  page_pdf?: number;
  page_print?: string;
  question_number?: string;
  part?: 'I' | 'II' | 'III' | null;
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
  createdByUid?: string;
  targetClassIds?: string[]; // Empty/undefined = shared across all classes; non-empty = targeted to specific classIds
  reviewedBy?: string;
  reviewedAt?: string;
  // Teacher change-proposal metadata (requires Admin acceptance before applying to live bank)
  replacesQuestionId?: string;
  proposedAction?: 'create' | 'edit' | 'replace';
  proposedBy?: string;
  proposedByUid?: string;
  proposedAt?: string;
  proposedNote?: string;
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
  // Extended PDF import pipeline & taxonomy metadata (100% backward-compatible)
  pattern_id?: string | null;
  proposed_pattern?: string;
  source_pattern_label?: string;
  source_ref?: SourceRefMeta;
  part?: 'I' | 'II' | 'III' | null;
  question_number?: string;
  needs_figure?: boolean;
  figure_image_index?: number;
  figure_spec?: FigureSpec;
  figure_bbox?: FigureBBox;
  figure_crop?: string; // Compressed JPEG/PNG dataURL <= 150 KB for real-world/applied diagram questions
  figure_crop_private?: boolean;
  givens?: StructuredGivens;
  verified_by_code?: VerifiedByCodeStatus;
  import_batch_id?: string;
  fingerprint?: string;
  flags?: QuestionFlag[];
  suggested_stations?: MocId[];
  approved_by?: string;
  approved_at?: string;
  // Math rendering, normalization & verification standard (`latex-1`, 100% additive)
  math_format?: 'latex-1';
  math_verified?: boolean;
  math_verified_by?: string;
  math_verified_at?: string;
  math_flags?: MathFlag[];
  stem_raw?: string;
  formula_image?: FormulaImageFallback;
  question_bbox?: FigureBBox;
  double_check_text?: string;
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
  aiModel?: string;
  aiHardPageModel?: string;
  autoApproveConfidenceThreshold?: number;
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

export type TaxonomyTopic = SkillCluster | 'OUT';

export interface TaxonomyPattern {
  id: string;
  topic: TaxonomyTopic;
  name: string;
  typical_levels: Array<1 | 2 | 3 | 4>;
  suggested_mocs: MocId[];
  has_solver: boolean;
  solver_hint: string;
  sort_order: number;
  status: 'active' | 'proposed' | 'hidden';
  proposed_by?: string;
  proposed_by_uid?: string;
  merged_into?: string;
  created_at?: string;
  updated_at?: string;
}

export type PageSendMode = 'text_only' | 'image_and_text' | 'image_only';

export type ImportPageStatus = 'pending' | 'read' | 'image_used' | 'extracted' | 'error';

export interface ImportPageState {
  pagePdf: number;
  pagePrinted?: string;
  status: ImportPageStatus;
  sendMode: PageSendMode;
  textLength: number;
  mathGarbledReasons: string[];
  hasFigureCue: boolean;
  hasAnswerKeyCue: boolean;
  errorMessage?: string;
  questionCount?: number;
  confidenceAvg?: number;
  usedHardModel?: boolean;
}

export interface AnswerKeyEntry {
  number: string;
  part?: 'I' | 'II' | 'III' | null;
  examCode?: string;
  answer: string;
  solution_vi?: string;
  pagePdf?: number;
}

export type ClassificationMode = 'web_taxonomy' | 'document_patterns';

export interface ImportBatchRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  fileName: string;
  fileSha256: string;
  driveFileId?: string;
  totalPages: number;
  startPage: number;
  endPage: number;
  classificationMode: ClassificationMode;
  customPatternList?: string[];
  status: 'pending' | 'reading' | 'extracting' | 'reviewing' | 'completed' | 'cancelled' | 'error';
  aiCallsUsed: number;
  pagesState: ImportPageState[];
  extractedItems: QuestionItem[];
  answerKeys: AnswerKeyEntry[];
  patternMappings: Record<string, string>; // source_pattern_label -> taxonomy pattern_id
  summary?: {
    added?: number;
    updated?: number;
    skippedDuplicates?: number;
    needsReview?: number;
    outOfChapter?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type MissionSlotRole = 'warmup' | 'main' | 'practice' | 'boss_hit' | 'transfer';
export type MissionSlotMode = 'fixed' | 'random';
export type MissionSetStatus = 'draft' | 'pending_admin_review' | 'published';

export interface MissionSlotFilter {
  clusters?: SkillCluster[];
  patternIds?: string[];
  minLevel?: 1 | 2 | 3 | 4;
  maxLevel?: 1 | 2 | 3 | 4;
  types?: QuestionType[];
}

export interface MissionSlot {
  id: string;
  role: MissionSlotRole;
  label: string;
  mode: MissionSlotMode;
  count: number;
  levelMin: 1 | 2 | 3 | 4;
  levelMax: 1 | 2 | 3 | 4;
  requiredToPass: boolean;
  verifyMode: boolean;
  fixedQuestionIds: string[];
  filter?: MissionSlotFilter;
}

export interface MissionSetRecord {
  id: string; // e.g. "ms_moc_1_ALL" or "ms_moc_1_<classId>"
  mocId: MocId;
  stationId: StationId;
  classId: string; // 'ALL' or specific classId
  status: MissionSetStatus;
  version: number;
  slots: MissionSlot[];
  bossSlots: MissionSlot[];
  notes: string;
  createdBy: string;
  createdByUid: string;
  publishedBy?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MissionSetVersionRecord {
  id: string;
  missionSetId: string;
  mocId: MocId;
  stationId: StationId;
  classId: string;
  version: number;
  slots: MissionSlot[];
  bossSlots: MissionSlot[];
  notes: string;
  publishedBy: string;
  publishedAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: 'question' | 'taxonomy' | 'import_batch' | 'mission_set';
  entityId: string;
  detail: Record<string, unknown>;
  createdAt: string;
}


export interface GradeResult {
  isCorrect: boolean;
  feedback_vi: string;
  errorCode?: string;
  detailStep_vi?: string;
  needsDiscriminationE01?: boolean;
}

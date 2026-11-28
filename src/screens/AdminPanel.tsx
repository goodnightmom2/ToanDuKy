import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookMarked,
  Check,
  Download,
  Eye,
  FastForward,
  FileSearch,
  FileUp,
  FlaskConical,
  Image as ImageIcon,
  LayoutGrid,
  Lock,
  MapPin,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {BankDistributionTab} from '../components/BankDistributionTab.tsx';
import {MaterialImporter} from '../components/MaterialImporter.tsx';
import {MathLatexEditor} from '../components/MathLatexEditor.tsx';
import {MathText} from '../components/MathText.tsx';
import {MissionSetTab} from '../components/MissionSetTab.tsx';
import {ParametricLab} from '../components/ParametricLab.tsx';
import {StudentAiRemediationAdvisor} from '../components/StudentAiRemediationAdvisor.tsx';
import {ERROR_CATALOG, SKILL_CLUSTER_LIST, SKILL_CLUSTERS} from '../config.ts';
import {
  ALL_MOC_IDS,
  computeJourneyPercent,
  JOURNEY_MILESTONES_BY_ID,
  normalizeJourneyProgress,
} from '../journey.ts';
import {questionContainsMath, runMathBankAudit} from '../math/mathEngine.ts';
import {inferPatternIdForQuestion} from '../math/taxonomy.ts';
import {
  canEditSettingsOrUsers,
  dataService,
  generateId,
} from '../services/dataService.ts';
import {compressImageBytesToDataUrl} from '../services/docxMathParser.ts';
import {
  DEFAULT_BULK_STUDENT_PASSWORD,
  downloadStudentTemplateXlsx,
  exportStudentAccountsXlsx,
  generateStudentUsername,
  parseStudentExcelFile,
  type BulkCreatedStudentRow,
  type BulkStudentDraftRow,
} from '../services/studentExcel.ts';
import type {
  MissionSetRecord,
  MocId,
  QuestionItem,
  QuestionType,
  ReviewStatus,
  SkillCluster,
  TaxonomyPattern,
  UserAccount,
  UserRole,
} from '../types.ts';
import {SelfTestScreen} from './SelfTestScreen.tsx';

interface AdminPanelProps {
  user: UserAccount;
  initialTab?: AdminTab;
  initialBankCluster?: SkillCluster | 'ALL';
  onExitAdmin: () => void;
  onPreviewAsStudent: () => void;
  onPreviewMocAsStudent?: (mocId: MocId, draftOverride?: MissionSetRecord) => void;
  onOpenMapAlign?: () => void;
  onRefreshApp: () => void;
}

export type AdminTab =
  | 'overview'
  | 'users'
  | 'classes'
  | 'bank'
  | 'distribution'
  | 'import'
  | 'missions'
  | 'reports'
  | 'rebuttals'
  | 'settings'
  | 'selftest';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  user,
  initialTab,
  initialBankCluster,
  onExitAdmin,
  onPreviewAsStudent,
  onPreviewMocAsStudent,
  onOpenMapAlign,
  onRefreshApp,
}) => {
  const isAdmin = canEditSettingsOrUsers(user);
  const sanitizeTabForRole = React.useCallback(
    (candidate?: AdminTab): AdminTab => {
      const next = candidate ?? 'overview';
      if (!isAdmin && (next === 'settings' || next === 'selftest')) {
        return 'overview';
      }
      return next;
    },
    [isAdmin],
  );
  const [tab, setTab] = React.useState<AdminTab>(() => sanitizeTabForRole(initialTab));
  const [tick, setTick] = React.useState(0);
  const refresh = () => {
    setTick((t) => t + 1);
    onRefreshApp();
  };

  React.useEffect(() => {
    if (initialTab) setTab(sanitizeTabForRole(initialTab));
  }, [initialTab, sanitizeTabForRole]);

  // Derived role-scoped data (Admin sees all; Teacher sees ONLY own classes & students)
  const users = React.useMemo(() => dataService.getScopedUsers(user), [tick, user]);
  const classes = React.useMemo(() => dataService.getScopedClasses(user), [tick, user]);
  const questions = React.useMemo(() => dataService.getQuestions(), [tick]);
  const rebuttals = React.useMemo(() => dataService.getScopedRebuttals(user), [tick, user]);
  const settings = React.useMemo(() => dataService.getSettings(), [tick]);

  // Users tab states
  const [userSearch, setUserSearch] = React.useState('');
  const [userClassFilter, setUserClassFilter] = React.useState<string>('ALL');
  const [userRoleFilter, setUserRoleFilter] = React.useState<'ALL' | UserRole>('ALL');
  const [inspectStudentUid, setInspectStudentUid] = React.useState<string | null>(null);
  const [showCreateTeacher, setShowCreateTeacher] = React.useState(false);
  const [teacherDisplayName, setTeacherDisplayName] = React.useState('');
  const [teacherUsername, setTeacherUsername] = React.useState('');
  const [teacherPassword, setTeacherPassword] = React.useState('');
  const [creatingTeacher, setCreatingTeacher] = React.useState(false);
  const [showCreateStudent, setShowCreateStudent] = React.useState(false);
  const [studentProvisionMode, setStudentProvisionMode] = React.useState<'single' | 'bulk_excel'>('bulk_excel');
  const [stuDisplayName, setStuDisplayName] = React.useState('');
  const [stuUsername, setStuUsername] = React.useState('');
  const [stuPassword, setStuPassword] = React.useState(DEFAULT_BULK_STUDENT_PASSWORD);
  const [stuClassId, setStuClassId] = React.useState<string>(() => classes[0]?.id ?? '');
  const [creatingStudent, setCreatingStudent] = React.useState(false);
  const [bulkDraftRows, setBulkDraftRows] = React.useState<BulkStudentDraftRow[]>([]);
  const [bulkParsing, setBulkParsing] = React.useState(false);
  const [bulkCreating, setBulkCreating] = React.useState(false);
  const [bulkProgress, setBulkProgress] = React.useState<{done: number; total: number} | null>(null);
  const [bulkError, setBulkError] = React.useState('');
  const [bulkNeedsRelogin, setBulkNeedsRelogin] = React.useState(false);
  const [lastBulkCreated, setLastBulkCreated] = React.useState<BulkCreatedStudentRow[]>([]);
  const [issuedPassByUid, setIssuedPassByUid] = React.useState<Record<string, string>>({});
  const [testAccMsg, setTestAccMsg] = React.useState('');
  const [resetTargetUid, setResetTargetUid] = React.useState<string | null>(null);
  const [resetNewPass, setResetNewPass] = React.useState('');

  React.useEffect(() => {
    if (!stuClassId && classes.length > 0) {
      setStuClassId(classes[0].id);
    }
  }, [classes, stuClassId]);

  // Class tab states
  const [newClassName, setNewClassName] = React.useState('');
  const [newClassCode, setNewClassCode] = React.useState('');

  // Bank tab states
  const [bankFilterCluster, setBankFilterCluster] = React.useState<SkillCluster | 'ALL'>(
    initialBankCluster ?? 'ALL',
  );
  React.useEffect(() => {
    if (initialBankCluster) setBankFilterCluster(initialBankCluster);
  }, [initialBankCluster]);
  const [bankFilterStatus, setBankFilterStatus] = React.useState<ReviewStatus | 'ALL'>('ALL');
  const [bankFilterPattern, setBankFilterPattern] = React.useState<string>('ALL');
  const [bankFilterLevel, setBankFilterLevel] = React.useState<number | 'ALL'>('ALL');
  const [bankFilterType, setBankFilterType] = React.useState<QuestionType | 'ALL'>('ALL');
  const [bankFilterSource, setBankFilterSource] = React.useState<string>('ALL');
  const [bankSearch, setBankSearch] = React.useState('');
  const [showTaxonomyPanel, setShowTaxonomyPanel] = React.useState(false);
  const [showMathAuditPanel, setShowMathAuditPanel] = React.useState(false);
  const [showParametricStudio, setShowParametricStudio] = React.useState(false);
  const [newTaxTopic, setNewTaxTopic] = React.useState<TaxonomyPattern['topic']>('COS');
  const [newTaxName, setNewTaxName] = React.useState('');
  const [mergeSourceId, setMergeSourceId] = React.useState('');
  const [mergeTargetId, setMergeTargetId] = React.useState('');
  const taxonomyList = React.useMemo(() => dataService.getTaxonomy(isAdmin), [tick, isAdmin]);
  const [selectedQIds, setSelectedQIds] = React.useState<string[]>([]);
  const [previewQuestion, setPreviewQuestion] = React.useState<QuestionItem | null>(null);
  const [manualStem, setManualStem] = React.useState('');
  const [manualCluster, setManualCluster] = React.useState<SkillCluster>('SIN');
  const [manualLevel, setManualLevel] = React.useState<1 | 2 | 3 | 4>(2);
  const [manualType, setManualType] = React.useState<'numeric' | 'mcq' | 'true_false_multi' | 'error_spot'>('numeric');
  const [manualErrorCode, setManualErrorCode] = React.useState('E05');
  const [manualOptA, setManualOptA] = React.useState('');
  const [manualOptB, setManualOptB] = React.useState('');
  const [manualOptC, setManualOptC] = React.useState('');
  const [manualOptD, setManualOptD] = React.useState('');
  const [manualNumericAns, setManualNumericAns] = React.useState('');
  const [manualUnit, setManualUnit] = React.useState('m');
  const [manualSolution, setManualSolution] = React.useState('');
  const [manualHint, setManualHint] = React.useState('');
  const [editingQuestion, setEditingQuestion] = React.useState<QuestionItem | null>(null);
  const [editQStem, setEditQStem] = React.useState('');
  const [editQSolution, setEditQSolution] = React.useState('');
  const [editQHint, setEditQHint] = React.useState('');
  const [editQNote, setEditQNote] = React.useState('');
  const [editQFigureCrop, setEditQFigureCrop] = React.useState('');
  const [bankActionMsg, setBankActionMsg] = React.useState('');

  // Reports tab states
  const [includeTestInReport, setIncludeTestInReport] = React.useState(false);
  const [reportClassFilter, setReportClassFilter] = React.useState<string>('ALL');
  const allScopedAttempts = React.useMemo(
    () => dataService.getScopedAttempts(user, true),
    [tick, user],
  );
  const attempts = React.useMemo(() => {
    const base = dataService.getScopedAttempts(user, includeTestInReport);
    if (reportClassFilter === 'ALL') return base;
    return base.filter((a) => a.classId === reportClassFilter);
  }, [tick, user, includeTestInReport, reportClassFilter]);
  const events = React.useMemo(
    () => dataService.getScopedEvents(user, includeTestInReport),
    [tick, user, includeTestInReport],
  );

  // Rebuttals reply map
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});

  // Settings local draft
  const [helpAfterWrong, setHelpAfterWrong] = React.useState(settings.helpAfterWrong);
  const [allowPending, setAllowPending] = React.useState(settings.allowPendingInTestMode);
  const [journeyUnlockAllDemo, setJourneyUnlockAllDemo] = React.useState(
    Boolean(settings.journeyUnlockAllDemo),
  );
  const [mapHasBakedLabels, setMapHasBakedLabels] = React.useState(
    settings.mapBackgroundHasBakedLabels ?? true,
  );
  const [mapUploadBusy, setMapUploadBusy] = React.useState(false);
  const [mapUploadMsg, setMapUploadMsg] = React.useState('');
  const [aiEnabled, setAiEnabled] = React.useState(settings.aiEnabled);
  const [aiQuota, setAiQuota] = React.useState(settings.aiDailyQuotaLimit);
  const [aiModel, setAiModel] = React.useState(settings.aiModel ?? 'gemini-2.5-flash');
  const [aiHardPageModel, setAiHardPageModel] = React.useState(
    settings.aiHardPageModel ?? 'gemini-2.5-pro',
  );
  const [autoApproveThreshold, setAutoApproveThreshold] = React.useState(
    settings.autoApproveConfidenceThreshold ?? 0.85,
  );
  const [supabaseUrl, setSupabaseUrl] = React.useState(settings.supabaseUrl ?? '');
  const [supabasePublishableKey, setSupabasePublishableKey] = React.useState(
    settings.supabasePublishableKey ?? '',
  );
  const [driveClientId, setDriveClientId] = React.useState(settings.driveClientId ?? '');
  const [driveApiKey, setDriveApiKey] = React.useState(settings.driveApiKey ?? '');
  const [settingsMsg, setSettingsMsg] = React.useState('');

  const handleCompressAndSaveMapImage = async (file: File) => {
    setMapUploadBusy(true);
    setMapUploadMsg('');
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Không thể đọc tệp ảnh này.'));
        el.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);

      const maxW = 1440;
      const scale = Math.min(1, maxW / Math.max(1, img.width));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Trình duyệt không hỗ trợ nén ảnh Canvas.');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Iteratively compress JPEG so binary size <= 650 KB (dataURL <= 900 KB, safe for Firestore 1 MiB limit)
      let quality = 0.86;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 880_000 && quality > 0.35) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      const approxKb = Math.round((dataUrl.length * 0.75) / 1024);
      const res = dataService.adminSaveMapBackground(user, dataUrl, mapHasBakedLabels);
      if (res.ok) {
        setMapUploadMsg(`Đã nén JPEG (${approxKb} KB ≤ 900 KB) và lưu ảnh nền bản đồ mới!`);
        refresh();
      } else {
        setMapUploadMsg(res.error ?? 'Không thể lưu ảnh nền bản đồ.');
      }
    } catch (err) {
      setMapUploadMsg(err instanceof Error ? err.message : 'Lỗi xử lý ảnh nền bản đồ.');
    } finally {
      setMapUploadBusy(false);
    }
  };

  const downloadCsv = (filename: string, content: string) => {
    const blob = new Blob(['\uFEFF' + content], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const realStudents = users.filter((u) => u.role === 'student' && !u.isTestAccount);
  const teachersList = users.filter((u) => u.role === 'teacher');
  const pendingQuestionsCount = questions.filter((q) => q.review_status === 'pending_teacher_review').length;
  const pendingRebuttalsCount = rebuttals.filter((r) => r.status === 'pending').length;
  const inspectedStudent = React.useMemo(
    () => (inspectStudentUid ? users.find((u) => u.uid === inspectStudentUid) ?? null : null),
    [inspectStudentUid, users],
  );
  const questionById = React.useMemo(() => {
    const map = new Map<string, QuestionItem>();
    for (const q of questions) map.set(q.id, q);
    return map;
  }, [questions]);
  const classNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classes) map.set(c.id, c.name);
    return map;
  }, [classes]);

  const tabs: Array<{id: AdminTab; label: string; icon: React.ComponentType<{className?: string}>}> = [
    {id: 'overview', label: '1. Tổng quan', icon: ShieldCheck},
    {id: 'users', label: isAdmin ? '2. Người dùng & GV' : '2. Học sinh của tôi', icon: Users},
    {id: 'classes', label: isAdmin ? '3. Lớp & mã' : `3. Lớp của tôi (${classes.length})`, icon: BookMarked},
    {id: 'bank', label: `4. Ngân hàng (${questions.length})`, icon: Sparkles},
    {id: 'distribution', label: '5. Phân bố ngân hàng', icon: LayoutGrid},
    {id: 'import', label: '6. Nhập học liệu', icon: FileUp},
    {id: 'missions', label: '7. Set nhiệm vụ', icon: Target},
    {id: 'reports', label: '8. Báo cáo & Lỗi sai', icon: BarChart3},
    {id: 'rebuttals', label: `9. Phản biện (${pendingRebuttalsCount})`, icon: MessageSquareWarning},
    ...(isAdmin
      ? [
          {id: 'settings' as const, label: '10. Cài đặt', icon: Settings},
          {id: 'selftest' as const, label: '11. Tự kiểm tra', icon: Check},
        ]
      : []),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      {/* Top Admin Header */}
      <div className="notebook-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
            Khu Quản trị &amp; Duyệt học liệu · {user.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'}
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[#14284A]">
            Bảng điều hành Toán Du Ký — {user.displayName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onPreviewAsStudent} className="btn-tactile btn-gold text-xs py-2 px-3.5">
            <Eye className="w-4 h-4" /> Xem như học viên
          </button>
          <button type="button" onClick={onExitAdmin} className="btn-tactile btn-paper text-xs py-2 px-3">
            <ArrowLeft className="w-4 h-4" /> Về Bản đồ lớp
          </button>
        </div>
      </div>

      {/* 9 Tabs rail */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border-2 flex items-center gap-1.5 ${
                active
                  ? 'bg-[#14284A] text-[#FFFBF0] border-[#14284A]'
                  : 'bg-[#FFFBF0] text-[#14284A] border-[#D5B87E]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="notebook-card p-4">
              <p className="text-xs font-bold text-[#5B6B82]">
                {isAdmin ? 'Học viên thật (toàn hệ thống)' : 'Học sinh thuộc các lớp của tôi'}
              </p>
              <p className="font-display text-3xl font-extrabold text-[#14284A] tabular-nums mt-1">
                {realStudents.length}
              </p>
              <p className="text-[11px] text-[#5B6B82] mt-1">
                {isAdmin ? `${teachersList.length} giáo viên · ${classes.length} lớp` : `${classes.length} lớp đang phụ trách`}
              </p>
            </div>
            <div className="notebook-card p-4">
              <p className="text-xs font-bold text-[#5B6B82]">Câu hỏi chờ duyệt</p>
              <p className="font-display text-3xl font-extrabold text-[#B9831E] tabular-nums mt-1">
                {pendingQuestionsCount}
              </p>
            </div>
            <div className="notebook-card p-4">
              <p className="text-xs font-bold text-[#5B6B82]">Lượt làm bài thật</p>
              <p className="font-display text-3xl font-extrabold text-[#1F7A6B] tabular-nums mt-1">
                {dataService.getScopedAttempts(user, false).length}
              </p>
            </div>
            <div className="notebook-card p-4">
              <p className="text-xs font-bold text-[#5B6B82]">Phản biện chờ xem</p>
              <p className="font-display text-3xl font-extrabold text-[#C8392B] tabular-nums mt-1">
                {pendingRebuttalsCount}
              </p>
            </div>
          </div>

          <div className="notebook-card p-5 space-y-2 text-sm text-[#1B2A41]">
            <h2 className="font-display text-lg font-extrabold text-[#14284A]">
              {isAdmin ? 'Phân quyền & Quy trình vận hành' : 'Không gian quản lý lớp học của Giáo viên'}
            </h2>
            {isAdmin ? (
              <>
                <p>
                  • <strong>Quản trị viên (Admin):</strong> Tạo &amp; quản lý tài khoản giáo viên ở tab <strong>2. Người dùng &amp; GV</strong>, kiểm duyệt mọi câu hỏi/học liệu do giáo viên đề xuất ở tab <strong>4. Ngân hàng</strong>, theo dõi mọi lớp học và cấu hình hệ thống.
                </p>
                <p>
                  • <strong>Giáo viên:</strong> Tự tạo lớp học, cấp tài khoản học sinh hàng loạt, theo dõi tiến độ &amp; lỗi sai lớp mình phụ trách. Mọi thao tác thêm mới, chỉnh sửa hoặc thay thế câu hỏi/tài liệu của giáo viên đều đi qua bước <strong>Admin chấp nhận</strong>.
                </p>
              </>
            ) : (
              <>
                <p>
                  • Bạn có thể tạo nhiều lớp học ở tab <strong>3. Lớp của tôi</strong> và cấp tài khoản hàng loạt bằng Excel ở tab <strong>2. Học sinh của tôi</strong>.
                </p>
                <p>
                  • Ở tab <strong>2. Học sinh của tôi</strong>, bấm nút <strong>Tiến độ &amp; Lỗi sai</strong> bên cạnh từng học sinh để xem chi tiết mốc đang học, trạng thái 6 cụm kỹ năng, các câu làm sai và mã lỗi cụ thể (E01–E12).
                </p>
                <p>
                  • Ở tab <strong>6. Nhập học liệu</strong>, bạn có thể nhập <strong>Khóa Gemini API cá nhân</strong> (dùng hạn mức miễn phí Google AI Studio của riêng mình) để tách câu hỏi &amp; hình vẽ từ tệp PDF/Word, sau đó phân bổ câu hỏi vào từng trạm/mốc ở tab <strong>7. Set nhiệm vụ</strong>. Mọi đề xuất thêm/sửa câu hỏi trong Ngân hàng chung đều được chuyển tới <strong>Admin duyệt</strong> trước khi hiển thị cho học sinh.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: USERS */}
      {tab === 'users' && (
        <div className="notebook-card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Tìm theo mã HS, tên đăng nhập hoặc biệt danh..."
              className="flex-1 min-w-[200px] px-3.5 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-sm"
            />
            <select
              value={userClassFilter}
              onChange={(e) => setUserClassFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold"
            >
              <option value="ALL">
                {isAdmin ? 'Tất cả lớp' : `Tất cả lớp của tôi (${classes.length})`}
              </option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Lớp {c.name} ({c.code})
                </option>
              ))}
            </select>
            {isAdmin && (
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value as 'ALL' | UserRole)}
                className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold"
              >
                <option value="ALL">Mọi vai trò</option>
                <option value="teacher">Chỉ Giáo viên</option>
                <option value="student">Chỉ Học viên</option>
                <option value="admin">Chỉ Quản trị</option>
              </select>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateStudent((v) => !v);
                  setShowCreateTeacher(false);
                }}
                className="btn-tactile btn-jade text-xs py-2 px-3"
              >
                <UserPlus className="w-4 h-4" /> Cấp tài khoản Học sinh
              </button>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateTeacher((v) => !v);
                      setShowCreateStudent(false);
                    }}
                    className="btn-tactile btn-ink text-xs py-2 px-3"
                  >
                    <UserPlus className="w-4 h-4 text-[#E0A93B]" /> Tạo tài khoản Giáo viên
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await dataService.createTwoTestAccounts(user);
                      setTestAccMsg(
                        res.created.length > 0
                          ? `Đã tạo tài khoản TEST: ${res.created.join(' | ')}`
                          : '2 tài khoản TEST (test_hv01, test_hv02) đã tồn tại sẵn.',
                      );
                      refresh();
                    }}
                    className="btn-tactile btn-gold text-xs py-2 px-3"
                  >
                    <Plus className="w-4 h-4" /> Tạo 2 tài khoản TEST
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  const targetCls =
                    userClassFilter !== 'ALL'
                      ? classes.find((c) => c.id === userClassFilter)
                      : classes.find((c) => c.id === stuClassId) ?? classes[0];
                  const classStudents = users.filter(
                    (u) =>
                      u.role === 'student' &&
                      !u.isTestAccount &&
                      (userClassFilter === 'ALL' ||
                        u.classId === userClassFilter ||
                        u.classCode === targetCls?.code),
                  );
                  const exportRows: BulkCreatedStudentRow[] = classStudents.map((u, idx) => ({
                    stt: idx + 1,
                    studentCode: u.studentCode,
                    displayName: u.displayName,
                    className: classNameById.get(u.classId ?? '') ?? u.classCode,
                    classCode: u.classCode,
                    username: u.username,
                    password:
                      issuedPassByUid[u.uid] ?? `${DEFAULT_BULK_STUDENT_PASSWORD} (mặc định nếu chưa đổi)`,
                    status: 'created',
                  }));
                  if (exportRows.length === 0) {
                    setTestAccMsg('Chưa có học sinh nào trong bộ lọc lớp hiện tại để xuất Excel.');
                    return;
                  }
                  exportStudentAccountsXlsx(
                    exportRows,
                    targetCls?.name ?? 'Tat_ca_lop',
                    targetCls?.code ?? 'TOAN10',
                  );
                }}
                className="btn-tactile btn-gold text-xs py-2 px-3"
              >
                <Download className="w-4 h-4" /> Xuất Excel tài khoản (.xlsx)
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    const csv = [
                      'studentCode,username,displayName,role,classCode,xp,isTestAccount,locked',
                      ...users.map(
                        (u) =>
                          `"${u.studentCode}","${u.username}","${u.displayName}","${u.role}","${u.classCode}",${u.xp},${u.isTestAccount},${u.locked}`,
                      ),
                    ].join('\n');
                    downloadCsv('toan-du-ky-nguoi-dung.csv', csv);
                  }}
                  className="btn-tactile btn-paper text-xs py-2 px-3"
                >
                  <Download className="w-4 h-4" /> Xuất CSV
                </button>
              )}
            </div>
          </div>

          {showCreateStudent && (
            <div className="p-4 rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-extrabold text-[#14284A]">
                  Cấp tài khoản Học sinh &amp; đưa trực tiếp vào lớp bạn quản lý
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateStudent(false)}
                  className="p-1 text-[#14284A]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {classes.length === 0 ? (
                <div className="text-xs text-[#8A5108] space-y-2">
                  <p>
                    Bạn chưa có lớp học nào. Hãy tạo ít nhất 1 lớp ở tab <strong>3. Lớp của tôi</strong> trước khi cấp tài khoản cho học sinh.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('classes')}
                    className="btn-tactile btn-jade text-xs py-1.5 px-3"
                  >
                    <Plus className="w-3.5 h-3.5" /> Đi tới tạo lớp ngay
                  </button>
                </div>
              ) : (() => {
                const selectedCls = classes.find((c) => c.id === stuClassId) ?? classes[0];
                return (
                  <div className="space-y-3">
                    {/* Sub-mode switcher: Bulk Excel vs Single */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex rounded-xl bg-white p-1 border border-[#D5B87E] gap-1">
                        <button
                          type="button"
                          onClick={() => setStudentProvisionMode('bulk_excel')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${
                            studentProvisionMode === 'bulk_excel'
                              ? 'bg-[#14284A] text-[#FFFBF0]'
                              : 'text-[#14284A] hover:bg-[#FFF4D6]'
                          }`}
                        >
                          Cấp hàng loạt từ Excel (.xlsx)
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentProvisionMode('single')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${
                            studentProvisionMode === 'single'
                              ? 'bg-[#14284A] text-[#FFFBF0]'
                              : 'text-[#14284A] hover:bg-[#FFF4D6]'
                          }`}
                        >
                          Cấp từng học sinh
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-[#14284A]">Lớp nhận học sinh:</span>
                        <select
                          value={selectedCls.id}
                          onChange={(e) => {
                            const nextClsId = e.target.value;
                            setStuClassId(nextClsId);
                            const nextCls = classes.find((c) => c.id === nextClsId);
                            if (nextCls && bulkDraftRows.length > 0) {
                              const taken = new Set(users.map((u) => u.username.toLowerCase()));
                              setBulkDraftRows((prev) =>
                                prev.map((r) => ({
                                  ...r,
                                  classId: nextCls.id,
                                  className: nextCls.name,
                                  classCode: nextCls.code,
                                  username: generateStudentUsername(r.displayName, nextCls.code, taken),
                                })),
                              );
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-extrabold text-[#14284A]"
                        >
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              Lớp {c.name} ({c.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {studentProvisionMode === 'bulk_excel' ? (
                      <div className="p-3.5 rounded-2xl bg-white border border-[#D9C293] space-y-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <p className="font-extrabold text-[#14284A]">
                              Nhập file Excel danh sách học sinh{' '}
                              {selectedCls.name.toLowerCase().startsWith('lớp')
                                ? selectedCls.name
                                : `Lớp ${selectedCls.name}`}{' '}
                              (Mã lớp: {selectedCls.code})
                            </p>
                            <p className="text-[11px] text-[#5B6B82]">
                              Tự động tạo tên đăng nhập theo <strong>Tên HS + Mã lớp</strong>, mật khẩu mặc định{' '}
                              <strong className="text-[#1F7A6B]">{DEFAULT_BULK_STUDENT_PASSWORD}</strong> (hỗ trợ cả file mẫu và file xuất từ vnEdu/SMAS có cột Họ đệm + Tên).
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => downloadStudentTemplateXlsx(selectedCls.name, selectedCls.code)}
                              className="btn-tactile btn-paper text-xs py-1.5 px-3"
                            >
                              <Download className="w-3.5 h-3.5" /> Tải file Excel mẫu (.xlsx)
                            </button>
                            <label className="btn-tactile btn-jade text-xs py-1.5 px-3 cursor-pointer">
                              <FileUp className="w-3.5 h-3.5" />
                              {bulkParsing ? 'Đang đọc file...' : 'Chọn file Excel (.xlsx/.csv)'}
                              <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  setBulkParsing(true);
                                  setBulkError('');
                                  const parsed = await parseStudentExcelFile(
                                    file,
                                    selectedCls,
                                    users.map((u) => u.username),
                                  );
                                  setBulkParsing(false);
                                  if (parsed.error) {
                                    setBulkError(parsed.error);
                                    setBulkDraftRows([]);
                                  } else {
                                    setBulkDraftRows(parsed.rows);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        {bulkError && (
                          <div className="p-2.5 rounded-xl bg-[#FCE8E6] border border-[#C8392B] text-[#99261B] font-semibold flex flex-wrap items-center justify-between gap-2">
                            <span>{bulkError}</span>
                            {bulkNeedsRelogin && (
                              <button
                                type="button"
                                onClick={() => {
                                  dataService.logout();
                                  window.location.reload();
                                }}
                                className="px-3 py-1 rounded-lg bg-[#99261B] text-white text-xs font-extrabold shrink-0"
                              >
                                Đăng xuất để đăng nhập lại
                              </button>
                            )}
                          </div>
                        )}

                        {bulkDraftRows.length > 0 && (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-extrabold text-[#1F7A6B]">
                                Xem trước {bulkDraftRows.length} học sinh sẵn sàng cấp vào Lớp {selectedCls.name} ({selectedCls.code}):
                              </p>
                              <button
                                type="button"
                                onClick={() => setBulkDraftRows([])}
                                className="text-[11px] font-bold text-[#B24A16] underline"
                              >
                                Xóa danh sách xem trước
                              </button>
                            </div>
                            <div className="max-h-56 overflow-y-auto rounded-xl border border-[#E5D3A8]">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-[#FFF8E6] sticky top-0">
                                  <tr className="border-b border-[#D5B87E] text-[#5B6B82]">
                                    <th className="py-1.5 px-2">STT</th>
                                    <th className="py-1.5 px-2">Họ và tên học sinh</th>
                                    <th className="py-1.5 px-2">Tên đăng nhập (tự tạo)</th>
                                    <th className="py-1.5 px-2">Mật khẩu</th>
                                    <th className="py-1.5 px-2 text-right">Bỏ</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#EFE3C4]">
                                  {bulkDraftRows.map((row, idx) => (
                                    <tr key={`${row.stt}-${idx}`}>
                                      <td className="py-1.5 px-2 font-bold tabular-nums">{idx + 1}</td>
                                      <td className="py-1.5 px-2 font-semibold text-[#14284A]">
                                        <input
                                          type="text"
                                          value={row.displayName}
                                          onChange={(e) =>
                                            setBulkDraftRows((prev) =>
                                              prev.map((r, i) =>
                                                i === idx ? {...r, displayName: e.target.value} : r,
                                              ),
                                            )
                                          }
                                          className="w-full px-2 py-1 rounded border border-[#E5D3A8] text-xs font-semibold"
                                        />
                                      </td>
                                      <td className="py-1.5 px-2">
                                        <input
                                          type="text"
                                          value={row.username}
                                          onChange={(e) =>
                                            setBulkDraftRows((prev) =>
                                              prev.map((r, i) =>
                                                i === idx
                                                  ? {...r, username: e.target.value.trim().toLowerCase()}
                                                  : r,
                                              ),
                                            )
                                          }
                                          className="w-full px-2 py-1 rounded border border-[#E5D3A8] font-mono text-xs text-[#1F7A6B]"
                                        />
                                      </td>
                                      <td className="py-1.5 px-2 font-mono font-bold text-[#14284A]">
                                        {row.password}
                                      </td>
                                      <td className="py-1.5 px-2 text-right">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setBulkDraftRows((prev) => prev.filter((_, i) => i !== idx))
                                          }
                                          className="text-[#B24A16] hover:underline font-bold"
                                        >
                                          ×
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={bulkCreating}
                                onClick={async () => {
                                  setBulkCreating(true);
                                  setBulkError('');
                                  setBulkNeedsRelogin(false);
                                  setBulkProgress({done: 0, total: bulkDraftRows.length});
                                  const res = await dataService.staffBulkCreateStudents(user, {
                                    classId: selectedCls.id,
                                    students: bulkDraftRows.map((r) => ({
                                      displayName: r.displayName,
                                      username: r.username,
                                      password: r.password,
                                    })),
                                    onProgress: (done, total) => setBulkProgress({done, total}),
                                  });
                                  setBulkCreating(false);
                                  setBulkProgress(null);
                                  if (!res.ok) {
                                    setBulkError(res.error ?? 'Chưa thể cấp tài khoản hàng loạt.');
                                    setBulkNeedsRelogin(Boolean(res.needsRelogin));
                                    if (res.results.length > 0) {
                                      setLastBulkCreated(res.results);
                                      refresh();
                                    }
                                    return;
                                  }
                                  const createdMap: Record<string, string> = {};
                                  for (const item of res.results) {
                                    if (item.status === 'created' && item.uid) {
                                      createdMap[item.uid] = item.password;
                                    }
                                  }
                                  setIssuedPassByUid((prev) => ({...prev, ...createdMap}));
                                  setLastBulkCreated(res.results);
                                  setBulkDraftRows([]);
                                  setTestAccMsg(
                                    `Đã cấp thành công ${res.createdCount}/${res.results.length} tài khoản học sinh vào ${selectedCls.name.toLowerCase().startsWith('lớp') ? selectedCls.name : `Lớp ${selectedCls.name}`} (${selectedCls.code})${res.failedCount > 0 ? ` · ${res.failedCount} dòng lỗi` : ''}. Bấm "Xuất bảng Excel tài khoản & mật khẩu" bên dưới để lưu gửi lớp!`,
                                  );
                                  refresh();
                                }}
                                className="btn-tactile btn-jade text-xs py-2 px-4"
                              >
                                <UserPlus className="w-4 h-4" />
                                {bulkCreating
                                  ? bulkProgress
                                    ? `Đang cấp ${bulkProgress.done}/${bulkProgress.total} học sinh lên máy chủ...`
                                    : `Đang cấp ${bulkDraftRows.length} tài khoản lên máy chủ...`
                                  : `Xác nhận cấp hàng loạt (${bulkDraftRows.length} học sinh)`}
                              </button>
                            </div>
                          </div>
                        )}

                        {lastBulkCreated.length > 0 && (
                          <div className="p-3 rounded-xl bg-[#E6F6F3] border-2 border-[#2E9C8A] space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-extrabold text-[#145B4F]">
                                Kết quả vừa cấp: {lastBulkCreated.filter((r) => r.status === 'created').length}/{lastBulkCreated.length} tài khoản thành công
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  exportStudentAccountsXlsx(
                                    lastBulkCreated,
                                    lastBulkCreated[0]?.className ?? selectedCls.name,
                                    lastBulkCreated[0]?.classCode ?? selectedCls.code,
                                  )
                                }
                                className="btn-tactile btn-gold text-xs py-1.5 px-3"
                              >
                                <Download className="w-3.5 h-3.5" /> Xuất bảng Excel tài khoản &amp; mật khẩu (.xlsx)
                              </button>
                            </div>
                            <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-[#9CD5CA]">
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead className="bg-[#F0FAF8] sticky top-0">
                                  <tr className="border-b border-[#9CD5CA] text-[#145B4F]">
                                    <th className="py-1 px-2">STT</th>
                                    <th className="py-1 px-2">Họ tên</th>
                                    <th className="py-1 px-2">Tên đăng nhập</th>
                                    <th className="py-1 px-2">Mật khẩu</th>
                                    <th className="py-1 px-2">Kết quả</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E2F2EE]">
                                  {lastBulkCreated.map((r) => (
                                    <tr key={`${r.stt}-${r.username}`}>
                                      <td className="py-1 px-2 tabular-nums">{r.stt}</td>
                                      <td className="py-1 px-2 font-semibold">{r.displayName}</td>
                                      <td className="py-1 px-2 font-mono font-bold text-[#14284A]">{r.username}</td>
                                      <td className="py-1 px-2 font-mono">{r.password}</td>
                                      <td className="py-1 px-2 font-bold">
                                        {r.status === 'created' ? (
                                          <span className="text-[#1F7A6B]">Đã cấp ✓</span>
                                        ) : (
                                          <span className="text-[#B24A16]">{r.error ?? 'Lỗi'}</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={stuDisplayName}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setStuDisplayName(nextVal);
                              if (nextVal.trim().length >= 2) {
                                const taken = new Set(users.map((u) => u.username.toLowerCase()));
                                setStuUsername(generateStudentUsername(nextVal, selectedCls.code, taken));
                              }
                            }}
                            placeholder="Họ và tên học sinh (vd: Nguyễn Văn An)"
                            className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                          />
                          <input
                            type="text"
                            value={stuUsername}
                            onChange={(e) => setStuUsername(e.target.value)}
                            placeholder="Tên đăng nhập (tự tạo theo tên + mã lớp)"
                            className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-mono"
                          />
                          <input
                            type="text"
                            value={stuPassword}
                            onChange={(e) => setStuPassword(e.target.value)}
                            placeholder={`Mật khẩu mặc định ${DEFAULT_BULK_STUDENT_PASSWORD}`}
                            className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-mono"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={creatingStudent}
                            onClick={async () => {
                              setCreatingStudent(true);
                              const chosenPass = stuPassword.trim() || DEFAULT_BULK_STUDENT_PASSWORD;
                              const res = await dataService.staffCreateStudent(user, {
                                displayName: stuDisplayName,
                                username: stuUsername,
                                password: chosenPass,
                                classId: selectedCls.id,
                              });
                              setCreatingStudent(false);
                              if (res.ok && res.user) {
                                setIssuedPassByUid((prev) => ({...prev, [res.user!.uid]: chosenPass}));
                                const clsName = classNameById.get(res.user.classId ?? '') ?? res.user.classCode;
                                setTestAccMsg(
                                  `Đã cấp tài khoản cho "${res.user.displayName}" vào Lớp ${clsName} — Tên đăng nhập: ${res.user.username} | Mật khẩu: ${chosenPass}`,
                                );
                                setStuDisplayName('');
                                setStuUsername('');
                                setStuPassword(DEFAULT_BULK_STUDENT_PASSWORD);
                                refresh();
                              } else {
                                setTestAccMsg(res.error ?? 'Không thể cấp tài khoản học sinh.');
                              }
                            }}
                            className="btn-tactile btn-jade text-xs py-2 px-4"
                          >
                            {creatingStudent ? 'Đang tạo...' : 'Xác nhận cấp tài khoản'}
                          </button>
                          <span className="text-[11px] text-[#5C3A06]">
                            Tự động gợi ý tên đăng nhập theo Tên + Mã lớp và đặt mật khẩu mặc định <strong>{DEFAULT_BULK_STUDENT_PASSWORD}</strong>.
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {isAdmin && showCreateTeacher && (
            <div className="p-4 rounded-2xl bg-[#E6F6F3] border-2 border-[#2E9C8A] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-extrabold text-[#14284A]">
                  Tạo tài khoản Giáo viên mới (chỉ quản lý học sinh &amp; lớp của riêng mình)
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateTeacher(false)}
                  className="p-1 text-[#14284A]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={teacherDisplayName}
                  onChange={(e) => setTeacherDisplayName(e.target.value)}
                  placeholder="Tên hiển thị (vd: Cô Lan - Toán 10)"
                  className="px-3 py-2 rounded-xl bg-white border border-[#2E9C8A] text-xs"
                />
                <input
                  type="text"
                  value={teacherUsername}
                  onChange={(e) => setTeacherUsername(e.target.value)}
                  placeholder="Tên đăng nhập (vd: gv_lan)"
                  className="px-3 py-2 rounded-xl bg-white border border-[#2E9C8A] text-xs"
                />
                <input
                  type="password"
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  placeholder="Mật khẩu (tối thiểu 8 ký tự)"
                  className="px-3 py-2 rounded-xl bg-white border border-[#2E9C8A] text-xs"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={creatingTeacher}
                  onClick={async () => {
                    setCreatingTeacher(true);
                    const res = await dataService.adminCreateTeacher(user, {
                      displayName: teacherDisplayName,
                      username: teacherUsername,
                      password: teacherPassword,
                    });
                    setCreatingTeacher(false);
                    if (res.ok && res.user) {
                      setTestAccMsg(
                        `Đã tạo tài khoản Giáo viên "${res.user.displayName}" (đăng nhập: ${res.user.username}). Giáo viên đăng nhập xong có thể tự tạo nhiều lớp ở tab Lớp của tôi.`,
                      );
                      setTeacherDisplayName('');
                      setTeacherUsername('');
                      setTeacherPassword('');
                      setShowCreateTeacher(false);
                      refresh();
                    } else {
                      setTestAccMsg(res.error ?? 'Không thể tạo tài khoản giáo viên.');
                    }
                  }}
                  className="btn-tactile btn-jade text-xs py-2 px-4"
                >
                  {creatingTeacher ? 'Đang tạo...' : 'Xác nhận tạo Giáo viên'}
                </button>
                <span className="text-[11px] text-[#145B4F]">
                  Tài khoản quản trị của bạn vẫn giữ đăng nhập sau khi tạo.
                </span>
              </div>
            </div>
          )}

          {testAccMsg && (
            <p className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#1F7A6B]">
              {testAccMsg}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#D5B87E] text-[#5B6B82]">
                  <th className="py-2 pr-3">Mã</th>
                  <th className="py-2 pr-3">Tên đăng nhập</th>
                  <th className="py-2 pr-3">Biệt danh / Tên</th>
                  <th className="py-2 pr-3">Lớp</th>
                  <th className="py-2 pr-3">Vai trò</th>
                  <th className="py-2 pr-3">Tiến độ &amp; Lỗi sai</th>
                  <th className="py-2 pr-3">XP</th>
                  <th className="py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5D3A8]">
                {users
                  .filter((u) => {
                    if (userClassFilter !== 'ALL' && u.classId !== userClassFilter) return false;
                    if (isAdmin && userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
                    const q = userSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      u.username.includes(q) ||
                      u.studentCode.toLowerCase().includes(q) ||
                      u.displayName.toLowerCase().includes(q) ||
                      u.classCode.toLowerCase().includes(q)
                    );
                  })
                  .map((u) => {
                    const j = normalizeJourneyProgress(u.journey);
                    const stuAttempts = allScopedAttempts.filter((a) => a.userId === u.uid);
                    const wrongAttempts = stuAttempts.filter((a) => !a.isCorrect);
                    return (
                      <tr key={u.uid}>
                        <td className="py-2.5 pr-3 font-bold tabular-nums">
                          {u.studentCode}{' '}
                          {u.isTestAccount && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FFF3DB] text-[#8A5108]">TEST</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">{u.username}</td>
                        <td className="py-2.5 pr-3 font-semibold">{u.displayName}</td>
                        <td className="py-2.5 pr-3 text-[#4B5B73]">
                          {u.role === 'student'
                            ? classNameById.get(u.classId ?? '') ?? u.classCode
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-3">
                          {isAdmin && u.uid !== user.uid ? (
                            <select
                              value={u.role}
                              onChange={(e) => {
                                dataService.adminSetUserRole(user, u.uid, e.target.value as UserRole);
                                refresh();
                              }}
                              className="px-2 py-1 rounded-lg bg-white border border-[#CBB17D] text-xs font-bold"
                            >
                              <option value="student">Học viên</option>
                              <option value="teacher">Giáo viên</option>
                              <option value="admin">Quản trị</option>
                            </select>
                          ) : (
                            <span className="font-bold uppercase">
                              {u.role === 'teacher' ? 'Giáo viên' : u.role === 'admin' ? 'Quản trị' : 'Học viên'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums">
                          <div className="font-bold text-[#18685B]">
                            Mốc {j.currentMoc}/10 ({j.passedMoc.length} qua · {computeJourneyPercent(j)}%)
                          </div>
                          {u.role === 'student' && (
                            <div className="text-[11px] text-[#5B6B82]">
                              {stuAttempts.length} lượt ·{' '}
                              <span className={wrongAttempts.length > 0 ? 'font-bold text-[#B24A16]' : ''}>
                                {wrongAttempts.length} câu sai
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums font-bold">{u.xp}</td>
                        <td className="py-2.5 flex flex-wrap gap-1.5">
                          {u.role === 'student' && (
                            <button
                              type="button"
                              onClick={() => setInspectStudentUid(u.uid)}
                              className="px-2 py-1 rounded-lg bg-[#14284A] text-[#FFFBF0] font-bold flex items-center gap-1 !min-h-[32px]"
                            >
                              <BarChart3 className="w-3 h-3" />
                              Tiến độ &amp; Lỗi sai
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const res = dataService.adminUnlockNextMoc(user, u.uid);
                              setTestAccMsg(
                                res.ok
                                  ? `Đã mở mốc kế tiếp cho ${u.displayName} (qua Mốc ${res.passedMocId} → mở Mốc ${res.unlockedMoc}).`
                                  : res.error ?? 'Không thể mở mốc kế tiếp.',
                              );
                              refresh();
                            }}
                            className="px-2 py-1 rounded-lg bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] font-bold flex items-center gap-1 !min-h-[32px]"
                          >
                            <FastForward className="w-3 h-3" />
                            Mở mốc kế tiếp
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const res = dataService.adminResetUserJourney(user, u.uid);
                              setTestAccMsg(
                                res.ok
                                  ? `Đã đặt lại hành trình của ${u.displayName} về Mốc 1.`
                                  : res.error ?? 'Không thể đặt lại hành trình.',
                              );
                              refresh();
                            }}
                            className="px-2 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] font-bold flex items-center gap-1 !min-h-[32px]"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Đặt lại hành trình
                          </button>
                          {u.uid !== user.uid && (isAdmin || u.role === 'student') && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextName = window.prompt(
                                    `Sửa tên hiển thị cho ${u.username}:`,
                                    u.displayName,
                                  );
                                  if (nextName !== null) {
                                    const res = dataService.updateStudentDisplayName(user, u.uid, nextName);
                                    setTestAccMsg(
                                      res.ok ? `Đã cập nhật tên thành "${nextName.trim()}".` : (res.error ?? 'Lỗi'),
                                    );
                                    refresh();
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] font-bold !min-h-[32px]"
                              >
                                Sửa tên
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const res = dataService.toggleUserLock(user, u.uid);
                                  setTestAccMsg(
                                    res.ok
                                      ? res.locked
                                        ? `Đã tạm khóa tài khoản ${u.displayName} (giữ nguyên lịch sử điểm).`
                                        : `Đã mở khóa tài khoản ${u.displayName}.`
                                      : (res.error ?? 'Lỗi'),
                                  );
                                  refresh();
                                }}
                                className="px-2 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] font-bold flex items-center gap-1 !min-h-[32px]"
                              >
                                {u.locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                {u.locked ? 'Mở khóa' : 'Khóa'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setResetTargetUid(u.uid);
                                  setResetNewPass('');
                                }}
                                className="px-2 py-1 rounded-lg bg-[#FFF4D6] border border-[#E0A93B] font-bold !min-h-[32px]"
                              >
                                Đặt lại MK
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {resetTargetUid && (
            <div className="p-3 rounded-xl bg-[#FFF4D6] border border-[#D98A1F] flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={resetNewPass}
                onChange={(e) => setResetNewPass(e.target.value)}
                placeholder="Mật khẩu mới (≥ 8 ký tự)"
                className="px-3 py-1.5 rounded-lg bg-white border border-[#CBB17D] text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  const res = await dataService.resetUserPasswordViaServer(user, resetTargetUid, resetNewPass);
                  setTestAccMsg(res.message);
                  if (res.ok) setResetTargetUid(null);
                }}
                className="btn-tactile btn-jade text-xs py-1.5 px-3"
              >
                Lưu MK mới
              </button>
              <button
                type="button"
                onClick={() => setResetTargetUid(null)}
                className="btn-tactile btn-paper text-xs py-1.5 px-3"
              >
                Hủy
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CLASSES */}
      {tab === 'classes' && (
        <div className="notebook-card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Tên lớp (ví dụ: Lớp 10A)"
              className="px-3.5 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-sm"
            />
            <input
              type="text"
              value={newClassCode}
              onChange={(e) => setNewClassCode(e.target.value)}
              placeholder="Mã lớp (ví dụ: TOAN10-02)"
              className="px-3.5 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-sm uppercase font-bold"
            />
            <button
              type="button"
              onClick={() => {
                if (!newClassName.trim() || !newClassCode.trim()) return;
                dataService.createClass(user, newClassName, newClassCode);
                setNewClassName('');
                setNewClassCode('');
                refresh();
              }}
              className="btn-tactile btn-jade text-sm"
            >
              <Plus className="w-4 h-4" /> Tạo lớp mới
            </button>
          </div>

          <div className="space-y-2">
            {classes.length === 0 ? (
              <p className="text-xs text-[#5B6B82] p-4 rounded-xl bg-[#FFFBF0] border border-[#D9C293]">
                Bạn chưa tạo lớp nào. Hãy nhập tên lớp (vd: <strong>10A1</strong>) và mã lớp (vd: <strong>TOAN10A1</strong>) ở trên — một giáo viên có thể tạo nhiều lớp khác nhau!
              </p>
            ) : (
              classes.map((cls) => {
                const owner = users.find((u) => u.uid === cls.teacherUid);
                const studentCount = users.filter(
                  (u) =>
                    (u.classId === cls.id || u.classCode === cls.code) &&
                    u.role === 'student' &&
                    !u.isTestAccount,
                ).length;
                return (
                  <div
                    key={cls.id}
                    className="p-3.5 rounded-xl bg-[#FFFBF0] border-2 border-[#D9C293] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-display text-lg font-extrabold text-[#14284A]">
                        Lớp {cls.name}{' '}
                        {cls.archived && (
                          <span className="ml-1 px-2 py-0.5 rounded-full bg-[#E2E8F0] text-[#475569] text-[11px] font-bold">
                            Đã lưu trữ
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#5B6B82]">
                        Mã tham gia: <strong className="text-[#1F7A6B]">{cls.code}</strong> · Sĩ số:{' '}
                        <strong className="tabular-nums">{studentCount}</strong>
                        {isAdmin && owner ? ` · Phụ trách: ${owner.displayName}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {isAdmin && teachersList.length > 0 && (
                        <select
                          aria-label={`Đổi giáo viên phụ trách lớp ${cls.name}`}
                          value={cls.teacherUid}
                          onChange={(e) => {
                            const res = dataService.reassignClassTeacher(user, cls.id, e.target.value);
                            if (res.ok) refresh();
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-white border border-[#CBB17D] text-xs font-bold text-[#14284A]"
                        >
                          <option value={user.uid}>GV: {user.displayName}</option>
                          {teachersList.map((t) => (
                            <option key={t.uid} value={t.uid}>
                              GV: {t.displayName} ({t.username})
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setUserClassFilter(cls.id);
                          setTab('users');
                        }}
                        className="btn-tactile btn-gold text-xs py-2 px-3"
                      >
                        <Users className="w-3.5 h-3.5" /> Xem học sinh
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextName = window.prompt('Nhập tên mới cho lớp:', cls.name);
                          if (nextName !== null) {
                            const res = dataService.renameClass(user, cls.id, nextName);
                            if (res.ok) refresh();
                          }
                        }}
                        className="btn-tactile btn-paper text-xs py-2 px-3"
                      >
                        Sửa tên
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          dataService.regenerateClassCode(user, cls.id);
                          refresh();
                        }}
                        className="btn-tactile btn-paper text-xs py-2 px-3"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Đổi mã
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          dataService.toggleArchiveClass(user, cls.id);
                          refresh();
                        }}
                        className="btn-tactile btn-paper text-xs py-2 px-3"
                      >
                        {cls.archived ? 'Khôi phục' : 'Lưu trữ'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 4: QUESTION BANK */}
      {tab === 'bank' && (
        <div className="space-y-4">
          {!isAdmin && (
            <div className="p-3.5 rounded-2xl bg-[#E6F6F3] border-2 border-[#2E9C8A] text-xs font-semibold text-[#145B4F] flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#1F7A6B]" />
              <span>
                <strong>Quyền chủ động của Giáo viên:</strong> Thầy/cô có thể <strong>thêm trực tiếp câu hỏi vào Ngân hàng mà không cần chờ Admin duyệt</strong>, tự chỉnh sửa câu hỏi của mình và <strong>phân bổ bộ câu hỏi riêng cho từng lớp</strong> tại tab <strong>7. Set nhiệm vụ</strong> dựa theo lỗi sai của học sinh từng lớp.
              </span>
            </div>
          )}

          {isAdmin && pendingQuestionsCount > 0 && (
            <div className="p-3.5 rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] text-xs text-[#8A5108] flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#B9831E] shrink-0" />
                Có <strong>{pendingQuestionsCount}</strong> câu hỏi / đề xuất do Giáo viên hoặc Nhập liệu gửi lên đang chờ Admin xét duyệt.
              </span>
              <button
                type="button"
                onClick={() =>
                  setBankFilterStatus((prev) =>
                    prev === 'pending_teacher_review' ? 'ALL' : 'pending_teacher_review',
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-[#14284A] text-[#FFFBF0] font-bold !min-h-[32px]"
              >
                {bankFilterStatus === 'pending_teacher_review'
                  ? 'Hiện tất cả câu hỏi'
                  : `Lọc ${pendingQuestionsCount} câu chờ duyệt`}
              </button>
            </div>
          )}

          {bankActionMsg && (
            <div className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#145B4F] flex items-center justify-between gap-2">
              <span>{bankActionMsg}</span>
              <button type="button" onClick={() => setBankActionMsg('')} className="p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Filters, Stats & Batch approve */}
          {(() => {
            const sourceNames = Array.from(
              new Set(
                questions
                  .map((q) => q.source_ref?.file_name || q.source_file_name || q.source_refs[0] || '')
                  .filter(Boolean),
              ),
            ).sort();
            const approvedCount = questions.filter((q) => q.review_status === 'approved').length;
            const verifiedPassCount = questions.filter((q) => q.verified_by_code === 'pass').length;
            const verifiedFailCount = questions.filter((q) => q.verified_by_code === 'fail').length;
            const patternCounts = new Map<string, number>();
            for (const q of questions) {
              const pid = q.pattern_id || inferPatternIdForQuestion(q);
              patternCounts.set(pid, (patternCounts.get(pid) ?? 0) + 1);
            }

            return (
              <div className="space-y-3">
                {/* Summary stats strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#FFFBF0] border border-[#D9C293]">
                    <p className="text-[11px] text-[#5B6B82]">Tổng câu hỏi</p>
                    <p className="font-display text-xl font-extrabold text-[#14284A] tabular-nums">{questions.length}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A]">
                    <p className="text-[11px] text-[#145B4F]">Đã duyệt</p>
                    <p className="font-display text-xl font-extrabold text-[#145B4F] tabular-nums">{approvedCount}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#FFF4D6] border border-[#E0A93B]">
                    <p className="text-[11px] text-[#8A5108]">Chờ Admin duyệt</p>
                    <p className="font-display text-xl font-extrabold text-[#8A5108] tabular-nums">{pendingQuestionsCount}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#EEF6FF] border border-[#9EC5FE]">
                    <p className="text-[11px] text-[#14437A]">Code kiểm chứng khớp</p>
                    <p className="font-display text-xl font-extrabold text-[#14437A] tabular-nums">{verifiedPassCount}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#FDECEC] border border-[#E5A09B]">
                    <p className="text-[11px] text-[#A82A2A]">Lệch kiểm chứng</p>
                    <p className="font-display text-xl font-extrabold text-[#A82A2A] tabular-nums">{verifiedFailCount}</p>
                  </div>
                </div>

                <div className="notebook-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2 flex-1">
                      <input
                        type="text"
                        value={bankSearch}
                        onChange={(e) => setBankSearch(e.target.value)}
                        placeholder="Tìm theo mã câu, đề bài, dạng..."
                        className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs min-w-[180px] flex-1"
                      />
                      <select
                        value={bankFilterCluster}
                        onChange={(e) => setBankFilterCluster(e.target.value as SkillCluster | 'ALL')}
                        className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold"
                      >
                        <option value="ALL">Tất cả 6 cụm</option>
                        {SKILL_CLUSTER_LIST.map((c) => (
                          <option key={c} value={c}>
                            {c} · {SKILL_CLUSTERS[c].shortTitle}
                          </option>
                        ))}
                      </select>
                      <select
                        value={bankFilterPattern}
                        onChange={(e) => setBankFilterPattern(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold max-w-[220px]"
                      >
                        <option value="ALL">Mọi dạng toán ({taxonomyList.length})</option>
                        {taxonomyList.map((pat) => (
                          <option key={pat.id} value={pat.id}>
                            {pat.id} · {pat.name} ({patternCounts.get(pat.id) ?? 0})
                          </option>
                        ))}
                      </select>
                      <select
                        value={bankFilterLevel}
                        onChange={(e) =>
                          setBankFilterLevel(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
                        }
                        className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold"
                      >
                        <option value="ALL">Mọi mức</option>
                        <option value={1}>Mức 1</option>
                        <option value={2}>Mức 2</option>
                        <option value={3}>Mức 3</option>
                        <option value={4}>Mức 4</option>
                      </select>
                      <select
                        value={bankFilterType}
                        onChange={(e) => setBankFilterType(e.target.value as QuestionType | 'ALL')}
                        className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold"
                      >
                        <option value="ALL">Mọi kiểu câu</option>
                        <option value="mcq">Trắc nghiệm</option>
                        <option value="true_false_multi">Đúng/Sai 4 ý</option>
                        <option value="numeric">Đáp án số</option>
                        <option value="matching">Ghép cặp</option>
                        <option value="fill_relation">Điền hệ thức</option>
                        <option value="error_spot">Tìm lỗi sai</option>
                      </select>
                      <select
                        value={bankFilterSource}
                        onChange={(e) => setBankFilterSource(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold max-w-[190px]"
                      >
                        <option value="ALL">Mọi nguồn tệp</option>
                        {sourceNames.map((src) => (
                          <option key={src} value={src}>
                            {src}
                          </option>
                        ))}
                      </select>
                      <select
                        value={bankFilterStatus}
                        onChange={(e) => setBankFilterStatus(e.target.value as ReviewStatus | 'ALL')}
                        className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold"
                      >
                        <option value="ALL">Mọi trạng thái</option>
                        <option value="pending_teacher_review">Chờ Admin duyệt</option>
                        <option value="approved">Đã duyệt</option>
                        <option value="rejected">Từ chối</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5D3A8]">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTaxonomyPanel((v) => !v)}
                        className="btn-tactile btn-paper text-xs py-1.5 px-3"
                      >
                        <Tags className="w-3.5 h-3.5 text-[#18685B]" />
                        {showTaxonomyPanel ? 'Ẩn Danh mục dạng' : `Quản lý Danh mục dạng (${taxonomyList.length})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMathAuditPanel((v) => !v)}
                        className="btn-tactile btn-paper text-xs py-1.5 px-3"
                      >
                        <FileSearch className="w-3.5 h-3.5 text-[#8A5108]" />
                        {showMathAuditPanel ? 'Ẩn Rà soát công thức' : 'Rà soát công thức (audit:math)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowParametricStudio((v) => !v)}
                        className={`btn-tactile text-xs py-1.5 px-3 ${showParametricStudio ? 'btn-jade' : 'btn-paper'}`}
                      >
                        <FlaskConical className={`w-3.5 h-3.5 ${showParametricStudio ? 'text-white' : 'text-[#18685B]'}`} />
                        {showParametricStudio ? 'Ẩn Xưởng sinh đề tham số' : 'Xưởng sinh đề tham số (6 bước)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('missions')}
                        className="btn-tactile btn-paper text-xs py-1.5 px-3"
                      >
                        <Target className="w-3.5 h-3.5 text-[#14284A]" /> Sang Set nhiệm vụ
                      </button>
                    </div>

                    {isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={selectedQIds.length === 0}
                          onClick={() => {
                            const selectedObjs = questions.filter((q) => selectedQIds.includes(q.id));
                            const unverifiedCount = selectedObjs.filter(
                              (q) => questionContainsMath(q) && q.math_verified === false,
                            ).length;
                            const ok = dataService.setQuestionReviewStatus(user, selectedQIds, 'approved');
                            setBankActionMsg(
                              unverifiedCount > 0
                                ? `Đã bỏ qua ${unverifiedCount} câu Toán chưa bấm "Đã đối chiếu công thức" (math_verified=false). ${ok ? 'Các câu hợp lệ khác đã được duyệt.' : 'Vui lòng đối chiếu công thức trước khi duyệt.'}`
                                : `Admin đã chấp nhận ${selectedQIds.length} câu hỏi / đề xuất.`,
                            );
                            setSelectedQIds([]);
                            refresh();
                          }}
                          className="btn-tactile btn-jade text-xs py-2 px-3"
                        >
                          <Check className="w-4 h-4" /> Duyệt đã chọn ({selectedQIds.length})
                        </button>
                        <button
                          type="button"
                          disabled={pendingQuestionsCount === 0}
                          onClick={() => {
                            const eligiblePending = questions
                              .filter(
                                (q) =>
                                  q.review_status === 'pending_teacher_review' &&
                                  (!questionContainsMath(q) || q.math_verified !== false),
                              )
                              .map((q) => q.id);
                            if (eligiblePending.length === 0) {
                              setBankActionMsg(
                                'Không có câu chờ duyệt nào đủ điều kiện: các câu có Toán bắt buộc phải bấm "Đã đối chiếu công thức" trước khi duyệt.',
                              );
                              return;
                            }
                            dataService.setQuestionReviewStatus(user, eligiblePending, 'approved');
                            setBankActionMsg(
                              `Admin đã chấp nhận ${eligiblePending.length}/${pendingQuestionsCount} mục chờ duyệt đủ điều kiện đối chiếu công thức.`,
                            );
                            refresh();
                          }}
                          className="btn-tactile btn-gold text-xs py-2 px-3"
                        >
                          Duyệt câu chờ đã đối chiếu ({pendingQuestionsCount})
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Collapsible 6-Step Parametric Variant Studio + Interactive Lab (Section 4.3c / Table 8 / Figure 7) */}
                {showParametricStudio && (
                  <ParametricLab
                    mode="teacher"
                    user={user}
                    classes={classes}
                    onSavedToBank={refresh}
                  />
                )}

                {/* Collapsible Dry-Run Math Audit & Safe --fix Panel (Section 5.2) */}
                {showMathAuditPanel && (() => {
                  const audit = runMathBankAudit(questions);
                  const flaggedReports = audit.reports.filter((r) => r.issueCount > 0);
                  return (
                    <div className="notebook-card-warm p-4 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-display text-base font-extrabold text-[#14284A]">
                            Báo cáo Rà soát công thức (audit:math — chạy khô, không sửa dữ liệu)
                          </h3>
                          <p className="text-[11px] text-[#5B6B82]">
                            Tổng quét: <strong>{audit.totalQuestions}</strong> câu · Đạt chuẩn:{' '}
                            <strong className="text-[#145B4F]">{audit.cleanCount}</strong> · Cần lưu ý:{' '}
                            <strong className="text-[#B45309]">{audit.withIssuesCount}</strong>. Chế độ chuẩn hóa luôn lưu bản gốc vào <code>stem_raw</code> và không ảnh hưởng dữ liệu học sinh.
                          </p>
                        </div>
                        {isAdmin && audit.withIssuesCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const fixRes = dataService.adminRunMathAuditFix(
                                user,
                                flaggedReports.map((r) => r.questionId),
                              );
                              setBankActionMsg(
                                `Đã chạy chuẩn hóa an toàn (--fix): quét ${fixRes.totalScanned} câu, chuẩn hóa ${fixRes.normalizedCount} câu (đã giữ nguyên stem_raw), gắn cờ xem lại ${fixRes.flaggedCount} câu.`,
                              );
                              refresh();
                            }}
                            className="btn-tactile btn-jade text-xs py-1.5 px-3"
                          >
                            Áp dụng chuẩn hóa (--fix, bảo toàn stem_raw)
                          </button>
                        )}
                      </div>

                      {Object.keys(audit.byCode).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(audit.byCode).map(([code, cnt]) => (
                            <span
                              key={code}
                              className="px-2 py-0.5 rounded-full bg-white border border-[#D9C293] font-bold text-[#8A5108]"
                            >
                              {code}: {cnt}
                            </span>
                          ))}
                        </div>
                      )}

                      {flaggedReports.length === 0 ? (
                        <p className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] font-bold">
                          ✓ 100% câu hỏi hiện tại đạt chuẩn LaTeX KaTeX, không có dấu $ lẻ hay ký tự lỗi!
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                          {flaggedReports.slice(0, 40).map((rep) => (
                            <div
                              key={rep.questionId}
                              className="p-2 rounded-xl bg-white border border-[#E5D3A8] flex flex-wrap items-start justify-between gap-2"
                            >
                              <div>
                                <span className="font-extrabold text-[#14284A] mr-1.5">[{rep.questionId}]</span>
                                <span className="text-[11px] text-[#8A5108]">
                                  {rep.issues.map((iss) => `${iss.field}: ${iss.detail}`).join(' · ')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Collapsible Taxonomy Catalog Manager (26 Appendix A patterns + Admin CRUD/Merge) */}
                {showTaxonomyPanel && (
                  <div className="notebook-card-warm p-4 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-extrabold text-[#14284A]">
                          Danh mục dạng toán Chương III (Phụ lục A — {taxonomyList.length} dạng)
                        </h3>
                        <p className="text-[11px] text-[#5B6B82]">
                          {isAdmin
                            ? 'Admin có thể thêm, duyệt dạng đề xuất, ẩn hoặc gộp dạng trùng lặp.'
                            : 'Giáo viên có thể xem danh sách dạng chuẩn và đề xuất thêm dạng mới (chờ Admin duyệt).'}
                        </p>
                      </div>
                    </div>

                    {/* Add / Propose new pattern */}
                    <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-white border border-[#D9C293]">
                      <select
                        value={newTaxTopic}
                        onChange={(e) => setNewTaxTopic(e.target.value as TaxonomyPattern['topic'])}
                        className="px-2.5 py-1.5 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] font-bold"
                      >
                        <option value="NEN">NEN</option>
                        <option value="LG">LG</option>
                        <option value="COS">COS</option>
                        <option value="SIN">SIN</option>
                        <option value="DT">DT</option>
                        <option value="MH">MH</option>
                        <option value="OUT">OUT</option>
                      </select>
                      <input
                        type="text"
                        value={newTaxName}
                        onChange={(e) => setNewTaxName(e.target.value)}
                        placeholder="Tên dạng mới (ví dụ: Ứng dụng đo chiều cao có góc hạ)"
                        className="flex-1 min-w-[200px] px-2.5 py-1.5 rounded-lg bg-white border border-[#CBB17D]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newTaxName.trim()) return;
                          const created = dataService.proposeTaxonomyPattern(user, {
                            topic: newTaxTopic,
                            name: newTaxName.trim(),
                          });
                          if (created) {
                            setNewTaxName('');
                            setBankActionMsg(
                              isAdmin
                                ? `Đã thêm dạng mới ${created.id}: ${created.name}.`
                                : `Đã gửi đề xuất dạng mới ${created.id} chờ Admin duyệt.`,
                            );
                            refresh();
                          }
                        }}
                        className="btn-tactile btn-jade text-xs py-1.5 px-3"
                      >
                        <Plus className="w-3.5 h-3.5" /> {isAdmin ? 'Thêm dạng mới' : 'Đề xuất dạng mới'}
                      </button>
                    </div>

                    {/* Admin Merge tool */}
                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-white border border-[#D9C293]">
                        <span className="font-bold text-[#14284A]">Gộp dạng:</span>
                        <select
                          value={mergeSourceId}
                          onChange={(e) => setMergeSourceId(e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-[#CBB17D] max-w-[220px]"
                        >
                          <option value="">Chọn dạng nguồn (sẽ ẩn)...</option>
                          {taxonomyList.filter((t) => t.status !== 'hidden').map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.id} · {t.name} ({patternCounts.get(t.id) ?? 0})
                            </option>
                          ))}
                        </select>
                        <span>→</span>
                        <select
                          value={mergeTargetId}
                          onChange={(e) => setMergeTargetId(e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-[#CBB17D] max-w-[220px]"
                        >
                          <option value="">Chọn dạng đích...</option>
                          {taxonomyList.filter((t) => t.status === 'active' && t.id !== mergeSourceId).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.id} · {t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId}
                          onClick={() => {
                            if (dataService.adminMergeTaxonomyPattern(user, mergeSourceId, mergeTargetId)) {
                              setBankActionMsg(`Đã gộp dạng ${mergeSourceId} vào ${mergeTargetId}.`);
                              setMergeSourceId('');
                              setMergeTargetId('');
                              refresh();
                            }
                          }}
                          className="btn-tactile btn-gold text-xs py-1.5 px-3"
                        >
                          Thực hiện gộp
                        </button>
                      </div>
                    )}

                    {/* Pattern list */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {taxonomyList.map((pat) => {
                        const qCnt = patternCounts.get(pat.id) ?? 0;
                        return (
                          <div
                            key={pat.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                              pat.status === 'proposed'
                                ? 'bg-[#FFF3DB] border-[#D98A1F]'
                                : pat.status === 'hidden'
                                  ? 'bg-[#F4F4F4] border-[#CCCCCC] opacity-70'
                                  : 'bg-white border-[#E5D3A8]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="font-extrabold text-[#14284A]">{pat.id}</span>
                                <span className="px-1.5 py-0.5 rounded bg-[#FFF4D6] text-[10px] font-bold">
                                  {qCnt} câu
                                </span>
                                {pat.has_solver && (
                                  <span className="px-1.5 py-0.5 rounded bg-[#E6F6F3] text-[#145B4F] text-[10px] font-bold">
                                    Có solver
                                  </span>
                                )}
                                {pat.status === 'proposed' && (
                                  <span className="px-1.5 py-0.5 rounded bg-[#FDECEC] text-[#A82A2A] text-[10px] font-bold">
                                    Chờ duyệt
                                  </span>
                                )}
                                {pat.status === 'hidden' && (
                                  <span className="px-1.5 py-0.5 rounded bg-[#E2E8F0] text-[#475569] text-[10px] font-bold">
                                    Đã ẩn
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#14284A] truncate">{pat.name}</p>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-1 shrink-0">
                                {pat.status !== 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      dataService.adminUpsertTaxonomyPattern(user, {...pat, status: 'active'});
                                      refresh();
                                    }}
                                    className="px-2 py-1 rounded bg-[#2E9C8A] text-white text-[10px] font-bold"
                                  >
                                    Kích hoạt
                                  </button>
                                )}
                                {pat.status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      dataService.adminUpsertTaxonomyPattern(user, {...pat, status: 'hidden'});
                                      refresh();
                                    }}
                                    className="px-2 py-1 rounded bg-[#FFFBF0] border border-[#CBB17D] text-[10px] font-bold"
                                  >
                                    Ẩn
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Manual add question form (supports 4 question types + level + E01–E12 error code) */}
          <div className="notebook-card-warm p-4 space-y-2.5">
            <h2 className="font-display text-base font-extrabold text-[#14284A]">
              {isAdmin
                ? 'Thêm câu hỏi mới (mặc định Chờ duyệt)'
                : 'Đề xuất thêm câu hỏi mới (Chờ Admin chấp nhận)'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select
                value={manualCluster}
                onChange={(e) => setManualCluster(e.target.value as SkillCluster)}
                className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-bold"
              >
                {SKILL_CLUSTER_LIST.map((c) => (
                  <option key={c} value={c}>
                    {c} · {SKILL_CLUSTERS[c].shortTitle}
                  </option>
                ))}
              </select>
              <select
                value={manualLevel}
                onChange={(e) => setManualLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}
                className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-bold"
              >
                <option value={1}>Mức 1 (Nhận biết)</option>
                <option value={2}>Mức 2 (Thông hiểu)</option>
                <option value={3}>Mức 3 (Vận dụng)</option>
                <option value={4}>Mức 4 (Vận dụng cao)</option>
              </select>
              <select
                value={manualType}
                onChange={(e) =>
                  setManualType(e.target.value as 'numeric' | 'mcq' | 'true_false_multi' | 'error_spot')
                }
                className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-bold"
              >
                <option value="numeric">Đáp án số</option>
                <option value="mcq">Trắc nghiệm 4 lựa chọn</option>
                <option value="true_false_multi">Đúng / Sai nhiều ý</option>
                <option value="error_spot">Tìm lỗi sai lời giải</option>
              </select>
              <select
                value={manualErrorCode}
                onChange={(e) => setManualErrorCode(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-bold"
              >
                {Object.values(ERROR_CATALOG).map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.code} · {e.subSkill}
                  </option>
                ))}
              </select>
            </div>
            <MathLatexEditor
              label="Nội dung đề bài (hỗ trợ KaTeX trong $...$, có thanh công cụ & chuẩn hóa)"
              value={manualStem}
              onChange={setManualStem}
              rows={2}
              compact
            />
            {manualType === 'numeric' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={manualNumericAns}
                  onChange={(e) => setManualNumericAns(e.target.value)}
                  placeholder="Đáp án số (ví dụ: 55.3)"
                  className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                />
                <input
                  type="text"
                  value={manualUnit}
                  onChange={(e) => setManualUnit(e.target.value)}
                  placeholder="Đơn vị (m, °, m²)"
                  className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={manualOptA}
                  onChange={(e) => setManualOptA(e.target.value)}
                  placeholder={manualType === 'true_false_multi' ? 'Ý a) (Mặc định Đúng)' : 'Phương án A (Đáp án ĐÚNG)'}
                  className="px-3 py-2 rounded-xl bg-white border border-[#2E9C8A] text-xs"
                />
                <input
                  type="text"
                  value={manualOptB}
                  onChange={(e) => setManualOptB(e.target.value)}
                  placeholder={manualType === 'true_false_multi' ? 'Ý b) (Mặc định Đúng)' : 'Phương án B (Nhiễu)'}
                  className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                />
                <input
                  type="text"
                  value={manualOptC}
                  onChange={(e) => setManualOptC(e.target.value)}
                  placeholder={manualType === 'true_false_multi' ? 'Ý c) (Mặc định Sai)' : 'Phương án C (Nhiễu)'}
                  className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                />
                <input
                  type="text"
                  value={manualOptD}
                  onChange={(e) => setManualOptD(e.target.value)}
                  placeholder={manualType === 'true_false_multi' ? 'Ý d) (Mặc định Sai)' : 'Phương án D (Nhiễu)'}
                  className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={manualHint}
                onChange={(e) => setManualHint(e.target.value)}
                placeholder="Gợi ý từng bước"
                className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
              />
              <input
                type="text"
                value={manualSolution}
                onChange={(e) => setManualSolution(e.target.value)}
                placeholder="Lời giải ngắn"
                className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
              />
            </div>
            {(() => {
              const submitManualQuestion = async (directApprove: boolean) => {
                if (!manualStem.trim()) return;
                const nowIso = new Date().toISOString();
                const effectiveApproved = directApprove;
                const baseItem: QuestionItem = {
                  id: generateId(isAdmin ? 'adm' : 'gv'),
                  cluster: manualCluster,
                  skill_ids: [manualCluster.toLowerCase()],
                  level: manualLevel,
                  type: manualType,
                  stem_vi: manualStem.trim(),
                  expected_answer: {},
                  solution_vi: manualSolution.trim() || 'Đối chiếu lời giải cùng giáo viên.',
                  anticipated_error_ids: [manualErrorCode],
                  hints_vi: [
                    manualHint.trim() || 'Kiểm tra lại công thức và đơn vị đo.',
                    'Thực hiện lần lượt từng bước biến đổi rồi đối chiếu kết quả.',
                  ],
                  review_status: effectiveApproved ? 'approved' : 'pending_teacher_review',
                  reviewedBy: effectiveApproved ? user.displayName : undefined,
                  reviewedAt: effectiveApproved ? nowIso : undefined,
                  approved_by: effectiveApproved ? user.displayName : undefined,
                  approved_at: effectiveApproved ? nowIso : undefined,
                  createdBy: user.displayName,
                  createdByUid: user.uid,
                  math_format: 'latex-1',
                  math_verified: effectiveApproved ? true : false,
                  math_verified_by: effectiveApproved ? user.displayName : undefined,
                  math_verified_at: effectiveApproved ? nowIso : undefined,
                  source_refs: [isAdmin ? 'ADMIN_BIEN_SOAN' : 'GV_BIEN_SOAN'],
                  is_adapted: false,
                };
                if (manualType === 'numeric') {
                  const num = Number(manualNumericAns.replace(',', '.'));
                  if (!Number.isFinite(num)) {
                    setBankActionMsg('Vui lòng nhập đáp án số hợp lệ trước khi lưu.');
                    return;
                  }
                  baseItem.expected_answer = {rounded: num, value: num, decimal_places: 1, unit: manualUnit};
                  baseItem.fixedUnitLabel = manualUnit || undefined;
                  baseItem.solution_vi = manualSolution.trim() || `Đáp án là ${num} ${manualUnit}.`;
                } else if (manualType === 'true_false_multi') {
                  const stmts = [
                    {id: 'a', label: manualOptA.trim() || 'Nhận định a', isTrue: true, errorCode: manualErrorCode},
                    {id: 'b', label: manualOptB.trim() || 'Nhận định b', isTrue: true, errorCode: manualErrorCode},
                    {id: 'c', label: manualOptC.trim() || 'Nhận định c', isTrue: false, errorCode: manualErrorCode},
                    {id: 'd', label: manualOptD.trim() || 'Nhận định d', isTrue: false, errorCode: manualErrorCode},
                  ];
                  baseItem.statements = stmts;
                  baseItem.expected_answer = {statements: {a: true, b: true, c: false, d: false}};
                } else {
                  if (!manualOptA.trim() || !manualOptB.trim()) {
                    setBankActionMsg('Vui lòng nhập ít nhất Phương án A (đúng) và Phương án B.');
                    return;
                  }
                  baseItem.options = [
                    {id: 'a', label: manualOptA.trim()},
                    {id: 'b', label: manualOptB.trim(), errorCode: manualErrorCode},
                    ...(manualOptC.trim() ? [{id: 'c', label: manualOptC.trim(), errorCode: manualErrorCode}] : []),
                    ...(manualOptD.trim() ? [{id: 'd', label: manualOptD.trim(), errorCode: manualErrorCode}] : []),
                  ];
                  baseItem.expected_answer = {choice: 'a'};
                }
                dataService.upsertQuestion(
                  user,
                  baseItem,
                  effectiveApproved
                    ? `${isAdmin ? 'Admin' : 'Giáo viên'} thêm trực tiếp vào ngân hàng (đã duyệt)`
                    : 'Lưu câu hỏi nháp',
                );
                const syncRes = await dataService.syncQuestionsToSupabase([baseItem.id]);
                setBankActionMsg(
                  !syncRes.ok
                    ? `Đã lưu cục bộ nhưng chưa đồng bộ lên máy chủ: ${syncRes.error}`
                    : effectiveApproved
                      ? '✓ Đã thêm trực tiếp câu hỏi mới vào Ngân hàng và đồng bộ lên máy chủ (sẵn sàng dùng ngay trong Set nhiệm vụ theo lớp & game).'
                      : 'Đã lưu câu hỏi nháp vào ngân hàng.',
                );
                setManualStem('');
                setManualNumericAns('');
                setManualOptA('');
                setManualOptB('');
                setManualOptC('');
                setManualOptD('');
                setManualSolution('');
                setManualHint('');
                refresh();
              };

              return (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void submitManualQuestion(true)}
                    className="btn-tactile btn-jade text-xs py-2 px-4"
                  >
                    <Plus className="w-4 h-4" /> Thêm &amp; Duyệt ngay vào Ngân hàng
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitManualQuestion(false)}
                    className="btn-tactile btn-paper text-xs py-2 px-4"
                  >
                    Lưu nháp
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Question List */}
          <div className="space-y-2">
            {questions
              .filter((q) => bankFilterCluster === 'ALL' || q.cluster === bankFilterCluster)
              .filter((q) => bankFilterStatus === 'ALL' || q.review_status === bankFilterStatus)
              .filter((q) => bankFilterLevel === 'ALL' || q.level === bankFilterLevel)
              .filter((q) => bankFilterType === 'ALL' || q.type === bankFilterType)
              .filter((q) => {
                if (bankFilterPattern === 'ALL') return true;
                const pid = q.pattern_id || inferPatternIdForQuestion(q);
                return pid === bankFilterPattern;
              })
              .filter((q) => {
                if (bankFilterSource === 'ALL') return true;
                const src = q.source_ref?.file_name || q.source_file_name || q.source_refs[0] || '';
                return src === bankFilterSource;
              })
              .filter((q) => {
                const kw = bankSearch.trim().toLowerCase();
                if (!kw) return true;
                const pid = (q.pattern_id || inferPatternIdForQuestion(q)).toLowerCase();
                return (
                  q.id.toLowerCase().includes(kw) ||
                  q.stem_vi.toLowerCase().includes(kw) ||
                  pid.includes(kw) ||
                  (q.source_pattern_label ?? '').toLowerCase().includes(kw)
                );
              })
              .map((q) => {
                const checked = selectedQIds.includes(q.id);
                const resolvedPatternId = q.pattern_id || inferPatternIdForQuestion(q);
                const isOwnPending =
                  !isAdmin &&
                  q.review_status === 'pending_teacher_review' &&
                  q.proposedByUid === user.uid;
                const isReplaceProposal = Boolean(q.replacesQuestionId);
                return (
                  <div
                    key={q.id}
                    className={`notebook-card p-3.5 space-y-2 ${
                      isReplaceProposal ? 'border-2 border-[#D98A1F] bg-[#FFFBF2]' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label className="flex items-start gap-2 cursor-pointer flex-1">
                        {isAdmin && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedQIds((prev) =>
                                e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id),
                              )
                            }
                            className="mt-1 w-4 h-4 accent-[#2E9C8A]"
                          />
                        )}
                        <div className="text-sm text-[#14284A]">
                          <span className="font-extrabold mr-1.5">[{q.id}]</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#FFF4D6] text-xs font-bold mr-1.5">
                            {q.cluster} · Mức {q.level}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-[#EEF6FF] text-[#14437A] text-xs font-bold mr-1.5">
                            {resolvedPatternId}
                          </span>
                          {q.verified_by_code === 'pass' && (
                            <span className="px-1.5 py-0.5 rounded bg-[#E6F6F3] text-[#145B4F] text-xs font-bold mr-1.5">
                              ✓ Code khớp
                            </span>
                          )}
                          {q.verified_by_code === 'fail' && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FCE8E6] text-[#C8392B] text-xs font-bold mr-1.5">
                              ⚠ Lệch code
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              q.review_status === 'approved'
                                ? 'bg-[#E6F6F3] text-[#1F7A6B]'
                                : q.review_status === 'rejected'
                                  ? 'bg-[#FCE8E6] text-[#C8392B]'
                                  : 'bg-[#FFF3DB] text-[#8A5108]'
                            }`}
                          >
                            {q.review_status === 'approved'
                              ? 'Đã duyệt'
                              : q.review_status === 'rejected'
                                ? 'Từ chối'
                                : 'Chờ Admin duyệt'}
                          </span>
                          {q.targetClassIds && q.targetClassIds.length > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#E6F6F3] border border-[#2E9C8A] text-[#145B4F] text-xs font-bold">
                              Riêng lớp:{' '}
                              {q.targetClassIds
                                .map((cid) => classes.find((c) => c.id === cid)?.name ?? cid)
                                .join(', ')}
                            </span>
                          )}
                          {isReplaceProposal && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#FFF0D1] border border-[#D98A1F] text-[#8A5108] text-xs font-extrabold">
                              Đề xuất sửa/thay thế câu [{q.replacesQuestionId}]
                              {q.proposedBy ? ` · GV ${q.proposedBy}` : ''}
                            </span>
                          )}
                          {!isReplaceProposal && q.proposedBy && q.review_status === 'pending_teacher_review' && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#EEF6FF] border border-[#9EC5FE] text-[#14437A] text-xs font-bold">
                              Đề xuất bởi GV {q.proposedBy}
                            </span>
                          )}
                          {q.proposedNote && q.review_status === 'pending_teacher_review' && (
                            <p className="text-[11px] text-[#8A5108] font-semibold mt-1">
                              Ghi chú đề xuất: {q.proposedNote}
                            </p>
                          )}
                          <div className="mt-1">
                            <MathText text={q.stem_vi} formulaImage={q.formula_image} />
                          </div>
                          {questionContainsMath(q) && q.math_verified === false && (
                            <p className="mt-1 text-[11px] font-bold text-[#99261B]">
                              ⚠ Chưa đối chiếu công thức (math_verified=false) — cần kiểm tra bản render rồi bấm "Đã đối chiếu công thức" trước khi duyệt.
                            </p>
                          )}
                        </div>
                      </label>

                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewQuestion(q)}
                          className="px-2.5 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] text-xs font-bold !min-h-[34px]"
                        >
                          Xem trước
                        </button>
                        {questionContainsMath(q) && q.math_verified === false && (
                          <button
                            type="button"
                            onClick={() => {
                              const res = dataService.markQuestionMathVerified(user, [q.id], true);
                              setBankActionMsg(
                                res.ok
                                  ? `Đã xác nhận đối chiếu công thức cho câu [${q.id}] (math_verified=true).`
                                  : `Không thể xác nhận câu [${q.id}]: công thức vẫn còn lỗi cú pháp KaTeX hoặc dấu $ lẻ.`,
                              );
                              refresh();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#EEF6FF] border border-[#3B82F6] text-[#14437A] text-xs font-bold !min-h-[34px]"
                          >
                            ✓ Đã đối chiếu công thức
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuestion(q);
                            setEditQStem(q.stem_vi);
                            setEditQSolution(q.solution_vi);
                            setEditQHint(q.hints_vi[0] ?? '');
                            setEditQNote(q.proposedNote ?? '');
                            setEditQFigureCrop(q.figure_crop ?? '');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#FFF4D6] border border-[#E0A93B] text-xs font-bold !min-h-[34px]"
                        >
                          {isAdmin
                            ? `Sửa (v${(q.version ?? 1) + 1})`
                            : isOwnPending
                              ? 'Sửa bản chờ duyệt'
                              : 'Đề xuất sửa / thay thế'}
                        </button>
                        {isAdmin && q.review_status !== 'approved' && (
                          <button
                            type="button"
                            disabled={questionContainsMath(q) && q.math_verified === false}
                            title={
                              questionContainsMath(q) && q.math_verified === false
                                ? 'Bấm "Đã đối chiếu công thức" trước khi duyệt câu có Toán'
                                : undefined
                            }
                            onClick={() => {
                              const ok = dataService.setQuestionReviewStatus(user, [q.id], 'approved');
                              setBankActionMsg(
                                !ok
                                  ? `Câu [${q.id}] chưa được đối chiếu công thức (math_verified=false) nên chưa thể duyệt.`
                                  : isReplaceProposal
                                    ? `Admin đã chấp nhận & áp dụng bản thay thế cho câu [${q.replacesQuestionId}].`
                                    : `Admin đã duyệt câu [${q.id}].`,
                              );
                              refresh();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#2E9C8A] text-white text-xs font-bold !min-h-[34px] disabled:opacity-45"
                          >
                            {isReplaceProposal ? 'Chấp nhận & áp dụng' : 'Duyệt'}
                          </button>
                        )}
                        {isAdmin && q.review_status !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() => {
                              dataService.setQuestionReviewStatus(user, [q.id], 'rejected');
                              setBankActionMsg(
                                isReplaceProposal
                                  ? `Admin đã từ chối đề xuất thay thế câu [${q.replacesQuestionId}]. Bản gốc vẫn giữ nguyên.`
                                  : `Admin đã chuyển câu [${q.id}] sang ngừng dùng.`,
                              );
                              refresh();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5108] text-xs font-bold !min-h-[34px]"
                          >
                            {isReplaceProposal ? 'Từ chối đề xuất' : 'Ngừng dùng'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {editingQuestion && (
            <div className="fixed inset-0 z-50 bg-[#14284A]/55 flex items-center justify-center p-4" role="dialog" aria-modal="true">
              <div className="notebook-card max-w-2xl w-full max-h-[90dvh] overflow-y-auto p-5 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-extrabold text-[#14284A]">
                    {isAdmin
                      ? `Chỉnh sửa câu ${editingQuestion.id} → tạo phiên bản v${(editingQuestion.version ?? 1) + 1}`
                      : `Đề xuất chỉnh sửa / thay thế câu ${editingQuestion.replacesQuestionId ?? editingQuestion.id}`}
                  </h3>
                  <button type="button" onClick={() => setEditingQuestion(null)} className="p-1.5">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-[#5B6B82]">
                  {isAdmin
                    ? `Bản cũ v${editingQuestion.version ?? 1} vẫn được giữ trong lịch sử phiên bản. Lưu ý: sửa công thức sẽ đặt lại trạng thái "Chưa đối chiếu công thức" để xác nhận lại.`
                    : 'Bản gốc đang hoạt động sẽ được giữ nguyên. Đề xuất chỉnh sửa/thay thế của bạn sẽ được gửi vào hàng chờ để Quản trị viên (Admin) xem xét và chấp nhận.'}
                </p>
                <MathLatexEditor
                  label="Nội dung đề bài (LaTeX + Xem trước trực tiếp)"
                  value={editQStem}
                  onChange={setEditQStem}
                  rows={3}
                />
                <div className="space-y-1">
                  <label className="font-bold text-[#14284A]">Gợi ý bước đầu</label>
                  <input
                    type="text"
                    value={editQHint}
                    onChange={(e) => setEditQHint(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-[#14284A]"
                  />
                </div>
                <MathLatexEditor
                  label="Lời giải mẫu (LaTeX + Xem trước trực tiếp)"
                  value={editQSolution}
                  onChange={setEditQSolution}
                  rows={2}
                  compact
                  showTemplates={false}
                />
                <div className="space-y-1.5 p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="font-bold text-[#14284A]">Hình minh họa đề bài (tùy chọn — cho câu thực tế/hình vẽ)</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label className="px-2.5 py-1 rounded-lg bg-white border border-[#CBB17D] font-bold text-[#14284A] cursor-pointer">
                        Tải ảnh hình vẽ
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            const bytes = new Uint8Array(await f.arrayBuffer());
                            const comp = await compressImageBytesToDataUrl(bytes, f.type || 'image/png', 140 * 1024);
                            setEditQFigureCrop(comp.dataUrl);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            if (navigator.clipboard?.read) {
                              const items = await navigator.clipboard.read();
                              for (const ci of items) {
                                const imgType = ci.types.find((t) => t.startsWith('image/'));
                                if (imgType) {
                                  const blob = await ci.getType(imgType);
                                  const bytes = new Uint8Array(await blob.arrayBuffer());
                                  const comp = await compressImageBytesToDataUrl(bytes, imgType, 140 * 1024);
                                  setEditQFigureCrop(comp.dataUrl);
                                  return;
                                }
                              }
                            }
                            setBankActionMsg('Chưa thấy ảnh trong bộ nhớ tạm (Clipboard). Hãy chụp ảnh hình vẽ (Win+Shift+S) rồi bấm lại hoặc dùng nút "Tải ảnh hình vẽ".');
                          } catch {
                            setBankActionMsg('Trình duyệt chưa cấp quyền đọc Clipboard. Bạn hãy dùng nút "Tải ảnh hình vẽ".');
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#EEF6FF] border border-[#9EC5FE] font-bold text-[#14437A]"
                      >
                        Dán ảnh (Clipboard)
                      </button>
                      {editQFigureCrop && (
                        <button
                          type="button"
                          onClick={() => setEditQFigureCrop('')}
                          className="px-2 py-1 rounded-lg bg-[#FCE8E6] border border-[#E5A09B] font-bold text-[#99261B]"
                        >
                          Xóa ảnh
                        </button>
                      )}
                    </div>
                  </div>
                  {editQFigureCrop ? (
                    <div className="p-2 rounded-lg bg-white border border-[#E5D3A8] flex justify-center">
                      <img
                        src={editQFigureCrop}
                        alt="Hình minh họa câu hỏi"
                        className="max-h-44 w-auto object-contain rounded"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#5B6B82]">
                      Chưa gắn hình minh họa. Với bài toán thực tế có hình vẽ (cây, tháp, đồi, sông...), bạn có thể tải ảnh hoặc chụp màn hình rồi bấm Dán ảnh.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#14284A]">Ghi chú lý do sửa / thay thế</label>
                  <input
                    type="text"
                    value={editQNote}
                    onChange={(e) => setEditQNote(e.target.value)}
                    placeholder="Ví dụ: Sửa ký hiệu góc cho chuẩn SGK"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-[#14284A]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingQuestion(null)}
                    className="btn-tactile btn-paper text-xs py-2 px-3"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editQStem.trim()) return;
                      const updatedItem: QuestionItem = {
                        ...editingQuestion,
                        stem_vi: editQStem.trim(),
                        solution_vi: editQSolution.trim() || editingQuestion.solution_vi,
                        hints_vi: [editQHint.trim() || editingQuestion.hints_vi[0] || '', ...editingQuestion.hints_vi.slice(1)],
                        figure_crop: editQFigureCrop || undefined,
                        figure_crop_private: editQFigureCrop ? true : undefined,
                        flags: editQFigureCrop
                          ? (editingQuestion.flags ?? []).filter((f) => f !== 'figure_missing')
                          : editingQuestion.flags,
                      };
                      dataService.upsertQuestion(
                        user,
                        updatedItem,
                        editQNote.trim() ||
                          (isAdmin ? 'Admin chỉnh sửa nội dung' : 'Giáo viên cập nhật câu hỏi'),
                      );
                      const isOwn =
                        isAdmin ||
                        (editingQuestion.createdByUid ?? editingQuestion.proposedByUid ?? '') === user.uid;
                      if (isOwn) {
                        const syncRes = await dataService.syncQuestionsToSupabase([editingQuestion.id]);
                        setBankActionMsg(
                          syncRes.ok
                            ? `✓ Đã lưu & đồng bộ phiên bản mới cho câu [${editingQuestion.id}].`
                            : `Đã lưu cục bộ nhưng chưa đồng bộ được lên Supabase: ${syncRes.error}`,
                        );
                      } else {
                        setBankActionMsg(
                          `✓ Đã tạo bản sao riêng đã duyệt từ câu [${editingQuestion.id}] để sử dụng cho lớp của bạn (bản gốc vẫn giữ nguyên).`,
                        );
                      }
                      setEditingQuestion(null);
                      refresh();
                    }}
                    className="btn-tactile btn-jade text-xs py-2 px-4"
                  >
                    {isAdmin || (editingQuestion.createdByUid ?? editingQuestion.proposedByUid ?? '') === user.uid
                      ? 'Lưu phiên bản mới'
                      : 'Tạo bản riêng cho lớp'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {previewQuestion && (
            <div className="fixed inset-0 z-50 bg-[#14284A]/55 flex items-center justify-center p-4" role="dialog" aria-modal="true">
              <div className="notebook-card max-w-lg w-full p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-extrabold text-[#14284A]">
                    Xem trước câu {previewQuestion.id} (v{previewQuestion.version ?? 1})
                  </h3>
                  <button type="button" onClick={() => setPreviewQuestion(null)} className="p-1.5">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] text-sm space-y-2">
                  <MathText text={previewQuestion.stem_vi} />
                  {previewQuestion.figure_crop && (
                    <div className="p-2 rounded-lg bg-white border border-[#E5D3A8] flex justify-center">
                      <img
                        src={previewQuestion.figure_crop}
                        alt="Hình minh họa đề bài"
                        className="max-h-52 w-auto object-contain rounded"
                      />
                    </div>
                  )}
                </div>
                {previewQuestion.options && previewQuestion.options.length > 0 && (
                  <div className="space-y-1 text-xs">
                    {previewQuestion.options.map((opt, idx) => (
                      <div key={opt.id} className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E5D3A8]">
                        <strong>{String.fromCharCode(65 + idx)}.</strong> <MathText text={opt.label} />
                        {previewQuestion.expected_answer.choice === opt.id && (
                          <span className="ml-1.5 text-[#145B4F] font-extrabold">(Đáp án đúng)</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {previewQuestion.statements && previewQuestion.statements.length > 0 && (
                  <div className="space-y-1 text-xs">
                    {previewQuestion.statements.map((st) => (
                      <div key={st.id} className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E5D3A8] flex justify-between gap-2">
                        <span>
                          <strong>{st.id})</strong> <MathText text={st.label} />
                        </span>
                        <span className={`shrink-0 font-extrabold ${st.isTrue ? 'text-[#145B4F]' : 'text-[#8A5608]'}`}>
                          {st.isTrue ? 'Đúng' : 'Sai'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {previewQuestion.code_verification && (
                  <p className="text-xs font-bold text-[#145B4F]">
                    Kiểm chứng code: {previewQuestion.code_verification.note_vi}
                  </p>
                )}
                <p className="text-xs text-[#1F7A6B]">
                  <strong>Lời giải:</strong> <MathText text={previewQuestion.solution_vi} />
                </p>
                <div className="text-xs text-[#5B6B82] space-y-1">
                  <p>
                    <strong>Nguồn:</strong> {previewQuestion.source_refs.join(', ')}
                  </p>
                  {previewQuestion.hints_vi.map((hint, idx) => (
                    <p key={idx}>
                      <strong>Gợi ý mức {idx + 1}:</strong> <MathText text={hint} />
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: BANK DISTRIBUTION */}
      {tab === 'distribution' && (
        <BankDistributionTab
          questions={questions}
          onInspectCluster={(cluster) => {
            setBankFilterCluster(cluster);
            setBankFilterStatus('ALL');
            setTab('bank');
          }}
        />
      )}

      {/* TAB 6: IMPORT MATERIALS (ADMIN + TEACHER WITH PERSONAL GEMINI API KEY) */}
      {tab === 'import' && (
        <MaterialImporter
          user={user}
          settings={settings}
          classes={classes}
          existingQuestions={questions}
          onQuestionsChanged={refresh}
          onOpenSettingsTab={() => setTab('settings')}
          onOpenMissionSetsTab={() => setTab('missions')}
        />
      )}

      {/* TAB 7: SET NHIỆM VỤ THEO TRẠM / MỐC */}
      {tab === 'missions' && (
        <MissionSetTab
          user={user}
          classes={classes}
          questions={questions}
          attempts={attempts}
          onRefresh={refresh}
          onPreviewMocAsStudent={onPreviewMocAsStudent}
        />
      )}

      {/* TAB 7: CLASS REPORTS & ERROR DIAGNOSTICS */}
      {tab === 'reports' && (() => {
        const wrongAttempts = attempts.filter((a) => !a.isCorrect);
        const errorCounts = new Map<string, number>();
        for (const a of wrongAttempts) {
          const code = a.errorCode || 'OTHER';
          errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1);
        }
        const sortedErrors = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1]);

        return (
          <div className="notebook-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-extrabold text-[#14284A]">
                  Báo cáo tiến độ &amp; chẩn đoán lỗi sai theo lớp
                </h2>
                <p className="text-xs text-[#5B6B82]">
                  Mẫu số: <strong>{attempts.length} lượt làm bài</strong> ({wrongAttempts.length} lượt chưa đúng) ·{' '}
                  <strong>{events.length} sự kiện gốc</strong> (
                  {includeTestInReport ? 'gồm cả tài khoản TEST' : 'đã loại bỏ tài khoản TEST'}).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={reportClassFilter}
                  onChange={(e) => setReportClassFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold"
                >
                  <option value="ALL">
                    {isAdmin ? 'Tất cả lớp' : `Tất cả lớp của tôi (${classes.length})`}
                  </option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      Lớp {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                <label className="text-xs font-bold flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={includeTestInReport}
                    onChange={(e) => setIncludeTestInReport(e.target.checked)}
                    className="accent-[#2E9C8A]"
                  />
                  Hiện cả dữ liệu TEST
                </label>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        'toan-du-ky-bao-cao-luot-lam.csv',
                        dataService.exportAttemptsCsv(includeTestInReport),
                      )
                    }
                    className="btn-tactile btn-jade text-xs py-2 px-3"
                  >
                    <Download className="w-4 h-4" /> Xuất CSV lượt làm
                  </button>
                )}
              </div>
            </div>

            {sortedErrors.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-[#FFF5E2] border border-[#D98A1F] space-y-2">
                <p className="text-xs font-extrabold text-[#8A5108] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Các lỗi học sinh hay mắc trong phạm vi đang lọc:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sortedErrors.slice(0, 6).map(([code, count]) => {
                    const info = ERROR_CATALOG[code];
                    return (
                      <div
                        key={code}
                        className="p-2.5 rounded-xl bg-white border border-[#E5D3A8] text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-[#14284A]">
                            {code === 'OTHER' ? 'Lỗi tính toán / chưa phân loại' : `${code} · ${info?.label ?? code}`}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#FFF3DB] text-[#8A5108] font-extrabold tabular-nums">
                            {count} lượt
                          </span>
                        </div>
                        {info?.stepHint && (
                          <p className="text-[11px] text-[#5B6B82] mt-1">{info.stepHint}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#D5B87E] text-[#5B6B82]">
                    <th className="py-2 pr-3">Mã HS</th>
                    <th className="py-2 pr-3">Câu</th>
                    <th className="py-2 pr-3">Cụm</th>
                    <th className="py-2 pr-3">Chế độ</th>
                    <th className="py-2 pr-3">Kết quả</th>
                    <th className="py-2 pr-3">Chi tiết lỗi mắc phải</th>
                    <th className="py-2">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5D3A8]">
                  {attempts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-[#5B6B82]">
                        Chưa có lượt làm bài nào trong bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    attempts.slice(-50).reverse().map((att) => {
                      const errInfo = att.errorCode ? ERROR_CATALOG[att.errorCode] : undefined;
                      return (
                        <tr key={att.id}>
                          <td className="py-2 pr-3 font-bold tabular-nums">
                            <button
                              type="button"
                              onClick={() => setInspectStudentUid(att.userId)}
                              className="underline text-[#14284A] hover:text-[#1F7A6B]"
                              title="Xem chi tiết tiến độ & lỗi sai của học sinh này"
                            >
                              {att.studentCode}
                            </button>
                          </td>
                          <td className="py-2 pr-3 font-semibold">{att.questionId}</td>
                          <td className="py-2 pr-3 font-bold">{att.cluster}</td>
                          <td className="py-2 pr-3">
                            {att.mode === 'verify' ? 'Kiểm chứng' : 'Luyện tập'}
                            {att.switchedToPractice ? ' (đã đổi)' : ''}
                          </td>
                          <td className="py-2 pr-3 font-bold">
                            {att.isCorrect ? (
                              <span className="text-[#1F7A6B]">Đúng</span>
                            ) : (
                              <span className="text-[#B24A16]">
                                Chưa đúng{att.clickedDontKnow ? ' (Em chưa biết)' : ''}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            {att.errorCode ? (
                              <span>
                                <strong>{att.errorCode}</strong>
                                {errInfo ? ` — ${errInfo.label}` : ''}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 tabular-nums">{Math.round(att.durationMs / 1000)}s</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* TAB 7: REBUTTALS */}
      {tab === 'rebuttals' && (
        <div className="space-y-3">
          {rebuttals.length === 0 ? (
            <div className="notebook-card p-6 text-center text-sm text-[#5B6B82]">
              Chưa có phản biện nào từ học viên. Khi học viên bấm "Em muốn phản biện", lập luận sẽ xuất hiện tại đây.
            </div>
          ) : (
            rebuttals.map((r) => (
              <div key={r.id} className="notebook-card p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#14284A]">
                    {r.studentCode} ({r.displayName}) · Câu {r.questionId}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#FFF4D6] font-bold text-[#8A5108]">
                    {r.status === 'pending'
                      ? 'Chờ phản hồi'
                      : r.status === 'accepted_revision'
                        ? 'Đã tiếp thu sửa câu'
                        : 'Đã giải đáp'}
                  </span>
                </div>
                <p className="text-xs text-[#5B6B82]">
                  <strong>Đề bài:</strong> <MathText text={r.questionStem} />
                </p>
                <p className="text-sm text-[#14284A] p-2.5 rounded-xl bg-[#FFFBF0] border border-[#D9C293]">
                  <strong>Lập luận học viên:</strong> {r.reasoning}
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={replyDrafts[r.id] ?? r.teacherReply ?? ''}
                    onChange={(e) => setReplyDrafts((prev) => ({...prev, [r.id]: e.target.value}))}
                    placeholder="Phản hồi của giáo viên..."
                    className="flex-1 min-w-[220px] px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      dataService.replyRebuttal(user, r.id, 'reviewed', replyDrafts[r.id] ?? 'Đã xem và trao đổi cùng em.');
                      refresh();
                    }}
                    className="btn-tactile btn-jade text-xs py-1.5 px-3"
                  >
                    Đánh dấu đã giải đáp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dataService.replyRebuttal(
                        user,
                        r.id,
                        'accepted_revision',
                        replyDrafts[r.id] ?? 'Cảm ơn em! Giáo viên đã ghi nhận để điều chỉnh câu hỏi.',
                      );
                      refresh();
                    }}
                    className="btn-tactile btn-gold text-xs py-1.5 px-3"
                  >
                    Tiếp thu sửa câu
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 9: SETTINGS (Admin only) */}
      {tab === 'settings' && isAdmin && (
        <div className="notebook-card p-5 space-y-4">
          <h2 className="font-display text-xl font-extrabold text-[#14284A]">
            Cài đặt hệ thống & Kết nối dữ liệu
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#14284A]">
                Ngưỡng mời hỗ trợ (HELP_AFTER_WRONG)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={helpAfterWrong}
                onChange={(e) => setHelpAfterWrong(Number(e.target.value))}
                disabled={!isAdmin}
                className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-sm font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#14284A]">
                Hạn mức lượt AI / ngày (máy chủ)
              </label>
              <input
                type="number"
                min={5}
                max={500}
                value={aiQuota}
                onChange={(e) => setAiQuota(Number(e.target.value))}
                disabled={!isAdmin}
                className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-sm font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#14284A]">
                Model AI mặc định (trích xuất PDF nhanh)
              </label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                disabled={!isAdmin}
                placeholder="gemini-2.5-flash"
                className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#14284A]">
                Model AI trang khó (công thức/hình phức tạp)
              </label>
              <input
                type="text"
                value={aiHardPageModel}
                onChange={(e) => setAiHardPageModel(e.target.value)}
                disabled={!isAdmin}
                placeholder="gemini-2.5-pro"
                className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#14284A]">
                Ngưỡng tin cậy duyệt hàng loạt (mặc định 0.85)
              </label>
              <input
                type="number"
                min={0.5}
                max={1}
                step={0.05}
                value={autoApproveThreshold}
                onChange={(e) => setAutoApproveThreshold(Number(e.target.value))}
                disabled={!isAdmin}
                className="w-full px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-sm font-bold"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm font-semibold text-[#14284A]">
            <input
              type="checkbox"
              checked={allowPending}
              onChange={(e) => setAllowPending(e.target.checked)}
              disabled={!isAdmin}
              className="w-4 h-4 accent-[#2E9C8A]"
            />
            Chế độ thử câu chưa duyệt (TEST) — cho phép học viên chạy thử câu có nhãn TEST
          </label>

          <label className="flex items-center gap-2.5 text-sm font-semibold text-[#14284A]">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              disabled={!isAdmin}
              className="w-4 h-4 accent-[#2E9C8A]"
            />
            Bật trợ lý AI phía máy chủ (chỉ trích xuất & nhận xét mở, không chấm số)
          </label>

          <label className="flex items-center gap-2.5 text-sm font-semibold text-[#14284A]">
            <input
              type="checkbox"
              checked={journeyUnlockAllDemo}
              onChange={(e) => {
                const next = e.target.checked;
                setJourneyUnlockAllDemo(next);
                if (isAdmin) {
                  dataService.adminSetUnlockAllDemo(user, next);
                  setSettingsMsg(
                    next
                      ? 'Đã bật "Mở toàn bộ mốc (trình diễn)" — học viên có thể vào thử cả 10 mốc.'
                      : 'Đã tắt chế độ trình diễn — khôi phục khóa tuần tự Mốc 1 → 10.',
                  );
                  refresh();
                }
              }}
              disabled={!isAdmin}
              className="w-4 h-4 accent-[#2E9C8A]"
            />
            Mở toàn bộ mốc (trình diễn) — tạm mở cả 10 mốc để giới thiệu hoặc kiểm thử nhanh
          </label>

          {/* Map Background & Pin Alignment Settings */}
          <div className="p-4 rounded-2xl bg-[#FFF4D6] border-2 border-[#D5B87E] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-extrabold text-[#14284A] flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-[#18685B]" /> Ảnh nền bản đồ & Căn chỉnh 10 ghim
              </h3>
              {isAdmin && onOpenMapAlign && (
                <button
                  type="button"
                  onClick={onOpenMapAlign}
                  className="btn-tactile btn-gold text-xs py-1.5 px-3"
                >
                  <MapPin className="w-3.5 h-3.5" /> Căn chỉnh ghim bản đồ (#/admin/map-align)
                </button>
              )}
            </div>

            <p className="text-xs text-[#4B5B73]">
              Thứ tự ưu tiên nền bản đồ: <strong>(1)</strong> Ảnh tải lên tại đây (tự nén JPEG ≤ 900 KB) →{' '}
              <strong>(2)</strong> Tệp <code>public/journey-map.jpg</code> → <strong>(3)</strong> Bản đồ SVG tích hợp.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <div className="w-44 aspect-[1024/572] rounded-xl overflow-hidden border-2 border-[#C9A86A] bg-[#2E94B9] shrink-0">
                <img
                  src={settings.mapBackgroundDataUrl || '/journey-map.jpg'}
                  alt="Xem trước ảnh nền bản đồ"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-[220px] space-y-2">
                <p className="text-xs font-bold text-[#14284A]">
                  Đang dùng:{' '}
                  <span className="text-[#18685B]">
                    {settings.mapBackgroundDataUrl
                      ? 'Ảnh nền do quản trị viên tải lên'
                      : 'Ảnh nền mặc định (/journey-map.jpg)'}
                  </span>
                </p>

                <label className="flex items-center gap-2 text-xs font-semibold text-[#14284A]">
                  <input
                    type="checkbox"
                    checked={mapHasBakedLabels}
                    disabled={!isAdmin}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setMapHasBakedLabels(val);
                      if (isAdmin) {
                        dataService.adminSaveMapBackground(user, settings.mapBackgroundDataUrl, val);
                        refresh();
                      }
                    }}
                    className="w-4 h-4 accent-[#2E9C8A]"
                  />
                  Ảnh nền đã có sẵn chữ/logo (bật lớp phủ bảng gỗ "Toán Du Ký" & nhãn đè sạch)
                </label>

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="btn-tactile btn-jade text-xs py-1.5 px-3 cursor-pointer">
                      <FileUp className="w-3.5 h-3.5" />
                      {mapUploadBusy ? 'Đang nén ảnh...' : 'Tải ảnh nền bản đồ mới'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={mapUploadBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleCompressAndSaveMapImage(f);
                          e.target.value = '';
                        }}
                        className="sr-only"
                      />
                    </label>

                    {settings.mapBackgroundDataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          dataService.adminSaveMapBackground(user, undefined, true);
                          setMapHasBakedLabels(true);
                          setMapUploadMsg('Đã khôi phục ảnh nền mặc định (/journey-map.jpg).');
                          refresh();
                        }}
                        className="btn-tactile btn-paper text-xs py-1.5 px-3"
                      >
                        Khôi phục ảnh mặc định
                      </button>
                    )}
                  </div>
                )}

                {mapUploadMsg && <p className="text-xs font-bold text-[#1F7A6B]">{mapUploadMsg}</p>}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FFFBF0] border border-[#D9C293] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-[#14284A]">
                Trạng thái lưu: <strong className="text-[#1F7A6B]">{dataService.getSyncStatusLabel()}</strong> ·
                Adapter:{' '}
                <strong>
                  {dataService.adapterMode === 'supabase'
                    ? 'SupabaseAdapter (PostgreSQL)'
                    : 'LocalAdapter (dự phòng trên máy này)'}
                </strong>
              </span>
              <span className="text-[#5B6B82]">
                Chưa đồng bộ: <strong>{dataService.getPendingSyncCount()}</strong> mục
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="setting-sb-url" className="block text-xs font-bold text-[#14284A]">
                  Supabase Project URL (mặc định đọc từ VITE_SUPABASE_URL; điền nếu muốn ghi đè):
                </label>
                <input
                  id="setting-sb-url"
                  type="text"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="https://xxxx.supabase.co"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="setting-sb-key" className="block text-xs font-bold text-[#14284A]">
                  Supabase Publishable Key (mặc định đọc từ VITE_SUPABASE_PUBLISHABLE_KEY):
                </label>
                <input
                  id="setting-sb-key"
                  type="text"
                  value={supabasePublishableKey}
                  onChange={(e) => setSupabasePublishableKey(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="sb_publishable_..."
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-mono"
                />
              </div>
            </div>
            {/* Google Drive Picker & OAuth (drive.readonly) settings — never hard-coded */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E5D3A8]">
              <div className="space-y-1">
                <label
                  htmlFor="setting-drive-client-id"
                  className="block text-xs font-bold text-[#14284A]"
                >
                  Google OAuth Client ID (Google Drive Picker — scope drive.readonly)
                </label>
                <input
                  id="setting-drive-client-id"
                  type="text"
                  value={driveClientId}
                  onChange={(e) => setDriveClientId(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="xxxxxxxx.apps.googleusercontent.com"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="setting-drive-api-key"
                  className="block text-xs font-bold text-[#14284A]"
                >
                  Google Picker API Key (chỉ dùng phía trình duyệt cho Google Picker)
                </label>
                <input
                  id="setting-drive-api-key"
                  type="text"
                  value={driveApiKey}
                  onChange={(e) => setDriveApiKey(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    dataService.updateSettings(user, {
                      helpAfterWrong,
                      allowPendingInTestMode: allowPending,
                      journeyUnlockAllDemo,
                      mapBackgroundHasBakedLabels: mapHasBakedLabels,
                      aiEnabled,
                      aiDailyQuotaLimit: aiQuota,
                      aiModel: aiModel.trim() || 'gemini-3.1-flash-lite',
                      aiHardPageModel: aiHardPageModel.trim() || 'gemini-2.5-pro',
                      autoApproveConfidenceThreshold: Math.min(1, Math.max(0.5, autoApproveThreshold)),
                      supabaseUrl: supabaseUrl.trim() || undefined,
                      supabasePublishableKey: supabasePublishableKey.trim() || undefined,
                      driveClientId: driveClientId.trim() || undefined,
                      driveApiKey: driveApiKey.trim() || undefined,
                    });
                    setSettingsMsg('Đã lưu cài đặt hệ thống (gồm Supabase, bản đồ & Google Drive Picker).');
                    refresh();
                  }}
                  className="btn-tactile btn-jade text-xs py-2 px-4"
                >
                  Lưu cài đặt
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const res = await dataService.testSupabaseConnection();
                  setSettingsMsg(res.message);
                }}
                className="btn-tactile btn-paper text-xs py-2 px-4"
              >
                Kiểm tra kết nối Supabase
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await dataService.syncLocalDataToServer();
                  setSettingsMsg(res.message);
                  refresh();
                }}
                className="btn-tactile btn-gold text-xs py-2 px-4"
              >
                Đồng bộ dữ liệu trên máy lên máy chủ
              </button>
            </div>
            {settingsMsg && (
              <p className="text-xs font-bold text-[#1F7A6B]">{settingsMsg}</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 10: SELF TEST (Admin only) */}
      {tab === 'selftest' && isAdmin && <SelfTestScreen embedded />}

      {/* STUDENT PROGRESS & ERROR DIAGNOSTICS MODAL */}
      {inspectedStudent && (() => {
        const j = normalizeJourneyProgress(inspectedStudent.journey);
        const stuAttempts = allScopedAttempts.filter((a) => a.userId === inspectedStudent.uid);
        const wrongAttempts = stuAttempts.filter((a) => !a.isCorrect).reverse();
        const errCounts = new Map<string, number>();
        for (const a of wrongAttempts) {
          const code = a.errorCode || 'OTHER';
          errCounts.set(code, (errCounts.get(code) ?? 0) + 1);
        }
        const topErrors = Array.from(errCounts.entries()).sort((a, b) => b[1] - a[1]);

        return (
          <div
            className="fixed inset-0 z-50 bg-[#14284A]/60 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="notebook-card max-w-3xl w-full max-h-[90dvh] overflow-y-auto p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-[#E5D3A8] pb-3">
                <div>
                  <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
                    Hồ sơ chẩn đoán học tập · {inspectedStudent.studentCode}
                  </p>
                  <h3 className="font-display text-2xl font-extrabold text-[#14284A]">
                    {inspectedStudent.displayName} ({inspectedStudent.username})
                  </h3>
                  <p className="text-xs text-[#5B6B82]">
                    Lớp: <strong>{classNameById.get(inspectedStudent.classId ?? '') ?? inspectedStudent.classCode}</strong> ·{' '}
                    Hành trình: <strong>Mốc {j.currentMoc}/10 ({computeJourneyPercent(j)}%)</strong> ·{' '}
                    XP: <strong>{inspectedStudent.xp}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectStudentUid(null)}
                  className="p-1.5 rounded-lg hover:bg-[#FFF4D6]"
                >
                  <X className="w-5 h-5 text-[#14284A]" />
                </button>
              </div>

              {/* 1. 10-Milestone Journey Progress */}
              <div className="space-y-2">
                <h4 className="font-display text-base font-extrabold text-[#14284A]">
                  1. Tiến độ hành trình 10 mốc ({j.passedMoc.length}/10 đã vượt qua)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {ALL_MOC_IDS.map((mocId) => {
                    const def = JOURNEY_MILESTONES_BY_ID[mocId];
                    const passed = j.passedMoc.includes(mocId);
                    const current = j.currentMoc === mocId && !passed;
                    return (
                      <div
                        key={mocId}
                        className={`p-2 rounded-xl border text-[11px] ${
                          passed
                            ? 'bg-[#E6F6F3] border-[#2E9C8A] text-[#145B4F]'
                            : current
                              ? 'bg-[#FFF4D6] border-[#E0A93B] text-[#8A5108]'
                              : 'bg-white border-[#E5D3A8] text-[#7A8799]'
                        }`}
                      >
                        <p className="font-extrabold">
                          Mốc {mocId}: {def.city}
                        </p>
                        <p>{passed ? 'Đã hoàn thành' : current ? 'Đang học' : 'Chưa mở'}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. 6 Skill Clusters */}
              <div className="space-y-2">
                <h4 className="font-display text-base font-extrabold text-[#14284A]">
                  2. Đánh giá 6 cụm kiến thức Chương III
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SKILL_CLUSTER_LIST.map((c) => {
                    const rec = inspectedStudent.skills[c];
                    const meta = SKILL_CLUSTERS[c];
                    const cWrong = wrongAttempts.filter((a) => a.cluster === c).length;
                    return (
                      <div
                        key={c}
                        className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-[#14284A]">
                            {c} · {meta.shortTitle}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              rec.state === 'Tự làm được'
                                ? 'bg-[#E6F6F3] text-[#145B4F]'
                                : rec.state === 'Cần ôn lại'
                                  ? 'bg-[#FDECEC] text-[#A82A2A]'
                                  : 'bg-[#FFF3DB] text-[#8A5108]'
                            }`}
                          >
                            {rec.state}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5B6B82]">
                          Đúng tự lực: <strong>{rec.verifyCorrect}</strong> · Có hỗ trợ:{' '}
                          <strong>{rec.practiceCorrect}</strong> · Sai: <strong className="text-[#B24A16]">{cWrong}</strong> · Tổng:{' '}
                          <strong>{rec.totalAttempts}</strong>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Top Errors */}
              <div className="space-y-2">
                <h4 className="font-display text-base font-extrabold text-[#14284A]">
                  3. Các lỗi học sinh đang mắc ({wrongAttempts.length} lượt chưa đúng)
                </h4>
                {topErrors.length === 0 ? (
                  <p className="text-xs text-[#1F7A6B] p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A]">
                    Học sinh chưa có lượt làm sai nào được ghi nhận.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {topErrors.map(([code, count]) => {
                      const info = ERROR_CATALOG[code];
                      return (
                        <div
                          key={code}
                          className="p-3 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-[#8A5108]">
                              {code === 'OTHER'
                                ? 'Lỗi tính toán / sai đáp án (chưa gắn mã E01–E12)'
                                : `${code} — ${info?.label ?? code}`}
                            </span>
                            <span className="font-extrabold text-[#B24A16] tabular-nums">
                              {count} lần
                            </span>
                          </div>
                          {info?.stepHint && (
                            <p className="text-[11px] text-[#5C3A06] mt-1">
                              <strong>Gợi ý ôn tập:</strong> {info.stepHint}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3.5 AI Personalization & Human-in-the-Loop Remediation Worksheet (Section 4.5 / Table 11) */}
              <StudentAiRemediationAdvisor
                actor={user}
                student={inspectedStudent}
                studentAttempts={stuAttempts}
                questions={questions}
                onAssigned={refresh}
              />

              {/* 4. Detailed Wrong Attempts */}
              {wrongAttempts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-display text-base font-extrabold text-[#14284A]">
                    4. Chi tiết các câu làm sai gần nhất
                  </h4>
                  <div className="space-y-2">
                    {wrongAttempts.slice(0, 15).map((att) => {
                      const qItem = questionById.get(att.questionId);
                      const errInfo = att.errorCode ? ERROR_CATALOG[att.errorCode] : undefined;
                      return (
                        <div
                          key={att.id}
                          className="p-3 rounded-xl bg-white border border-[#E5D3A8] text-xs space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-extrabold text-[#14284A]">
                              Câu {att.questionId} · Cụm {att.cluster} ·{' '}
                              {att.mode === 'verify' ? 'Kiểm chứng' : 'Luyện tập'}
                            </span>
                            <span className="text-[11px] text-[#5B6B82]">
                              {new Date(att.createdAt).toLocaleString('vi-VN')}
                            </span>
                          </div>
                          {qItem?.stem_vi && (
                            <div className="text-[#4B5B73]">
                              <MathText text={qItem.stem_vi} maxLength={200} />
                            </div>
                          )}
                          <p>
                            <strong>Học sinh trả lời:</strong>{' '}
                            <span className="font-mono text-[#B24A16]">
                              {att.clickedDontKnow
                                ? '(Bấm "Em chưa biết")'
                                : typeof att.answerRaw === 'string' || typeof att.answerRaw === 'number'
                                  ? String(att.answerRaw)
                                  : JSON.stringify(att.answerRaw)}
                            </span>
                            {att.usedHint ? ' · (Đã xem gợi ý)' : ''}
                          </p>
                          {att.errorCode && (
                            <p className="text-[#8A5108] font-semibold">
                              <strong>Lỗi chẩn đoán:</strong> {att.errorCode}
                              {errInfo ? ` — ${errInfo.label}` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

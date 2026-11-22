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
  FileUp,
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
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {BankDistributionTab} from '../components/BankDistributionTab.tsx';
import {MaterialImporter} from '../components/MaterialImporter.tsx';
import {MathText} from '../components/MathText.tsx';
import {ERROR_CATALOG, SKILL_CLUSTER_LIST, SKILL_CLUSTERS} from '../config.ts';
import {
  ALL_MOC_IDS,
  computeJourneyPercent,
  JOURNEY_MILESTONES_BY_ID,
  normalizeJourneyProgress,
} from '../journey.ts';
import {
  canEditSettingsOrUsers,
  dataService,
  generateId,
} from '../services/dataService.ts';
import type {
  QuestionItem,
  ReviewStatus,
  SkillCluster,
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
  onOpenMapAlign,
  onRefreshApp,
}) => {
  const isAdmin = canEditSettingsOrUsers(user);
  const [tab, setTab] = React.useState<AdminTab>(initialTab ?? 'overview');
  const [tick, setTick] = React.useState(0);
  const refresh = () => {
    setTick((t) => t + 1);
    onRefreshApp();
  };

  React.useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

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
  const [stuDisplayName, setStuDisplayName] = React.useState('');
  const [stuUsername, setStuUsername] = React.useState('');
  const [stuPassword, setStuPassword] = React.useState('');
  const [stuClassId, setStuClassId] = React.useState<string>(() => classes[0]?.id ?? '');
  const [creatingStudent, setCreatingStudent] = React.useState(false);
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
    {id: 'reports', label: '7. Báo cáo & Lỗi sai', icon: BarChart3},
    {id: 'rebuttals', label: `8. Phản biện (${pendingRebuttalsCount})`, icon: MessageSquareWarning},
    ...(isAdmin
      ? [
          {id: 'settings' as const, label: '9. Cài đặt', icon: Settings},
          {id: 'selftest' as const, label: '10. Tự kiểm tra', icon: Check},
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
                  • <strong>Quản trị viên (Admin):</strong> Tạo & quản lý tài khoản giáo viên ở tab <strong>2. Người dùng & GV</strong>, theo dõi mọi lớp học và cấu hình hệ thống.
                </p>
                <p>
                  • <strong>Giáo viên:</strong> Mỗi giáo viên có thể tự tạo nhiều lớp ở tab <strong>3. Lớp & mã</strong>, chỉ xem và theo dõi tiến độ / lỗi sai của học sinh thuộc lớp mình phụ trách (tách biệt hoàn toàn với giáo viên khác bằng bảo mật RLS trên Supabase).
                </p>
              </>
            ) : (
              <>
                <p>
                  • Bạn có thể tạo nhiều lớp học ở tab <strong>3. Lớp của tôi</strong> (mỗi lớp có mã tham gia riêng cho học sinh đăng ký).
                </p>
                <p>
                  • Ở tab <strong>2. Học sinh của tôi</strong>, bấm nút <strong>Tiến độ &amp; Lỗi sai</strong> bên cạnh từng học sinh để xem chi tiết mốc đang học, trạng thái 6 cụm kỹ năng, các câu làm sai và mã lỗi cụ thể (E01–E12).
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
            </div>
          </div>

          {showCreateStudent && (
            <div className="p-4 rounded-2xl bg-[#FFF4D6] border-2 border-[#E0A93B] space-y-3">
              <div className="flex items-center justify-between gap-2">
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
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <select
                      value={stuClassId}
                      onChange={(e) => setStuClassId(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs font-bold text-[#14284A]"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          Lớp {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={stuDisplayName}
                      onChange={(e) => setStuDisplayName(e.target.value)}
                      placeholder="Tên/Biệt danh HS (vd: Minh Anh 10A1)"
                      className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                    />
                    <input
                      type="text"
                      value={stuUsername}
                      onChange={(e) => setStuUsername(e.target.value)}
                      placeholder="Tên đăng nhập (vd: hs_minhanh)"
                      className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                    />
                    <input
                      type="password"
                      value={stuPassword}
                      onChange={(e) => setStuPassword(e.target.value)}
                      placeholder="Mật khẩu cấp cho HS (≥ 8 ký tự)"
                      className="px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={creatingStudent}
                      onClick={async () => {
                        setCreatingStudent(true);
                        const chosenPass = stuPassword;
                        const res = await dataService.staffCreateStudent(user, {
                          displayName: stuDisplayName,
                          username: stuUsername,
                          password: chosenPass,
                          classId: stuClassId || classes[0].id,
                        });
                        setCreatingStudent(false);
                        if (res.ok && res.user) {
                          const clsName = classNameById.get(res.user.classId ?? '') ?? res.user.classCode;
                          setTestAccMsg(
                            `Đã cấp tài khoản cho "${res.user.displayName}" vào Lớp ${clsName} — Tên đăng nhập: ${res.user.username} | Mật khẩu: ${chosenPass}`,
                          );
                          setStuDisplayName('');
                          setStuUsername('');
                          setStuPassword('');
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
                      Học sinh được thêm thẳng vào lớp đã chọn và xuất hiện ngay trên Bản đồ lớp của bạn.
                    </span>
                  </div>
                </>
              )}
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
          {/* Filters & Batch approve */}
          <div className="notebook-card p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
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
                value={bankFilterStatus}
                onChange={(e) => setBankFilterStatus(e.target.value as ReviewStatus | 'ALL')}
                className="px-3 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-xs font-bold"
              >
                <option value="ALL">Mọi trạng thái</option>
                <option value="pending_teacher_review">Chờ giáo viên duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="rejected">Từ chối</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={selectedQIds.length === 0}
                onClick={() => {
                  dataService.setQuestionReviewStatus(user, selectedQIds, 'approved');
                  setSelectedQIds([]);
                  refresh();
                }}
                className="btn-tactile btn-jade text-xs py-2 px-3"
              >
                <Check className="w-4 h-4" /> Duyệt đã chọn ({selectedQIds.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  const allPending = questions
                    .filter((q) => q.review_status === 'pending_teacher_review')
                    .map((q) => q.id);
                  dataService.setQuestionReviewStatus(user, allPending, 'approved');
                  refresh();
                }}
                className="btn-tactile btn-gold text-xs py-2 px-3"
              >
                Duyệt toàn bộ câu chờ ({pendingQuestionsCount})
              </button>
            </div>
          </div>

          {/* Manual add question form (supports 4 question types + level + E01–E12 error code) */}
          <div className="notebook-card-warm p-4 space-y-2.5">
            <h2 className="font-display text-base font-extrabold text-[#14284A]">
              Thêm câu hỏi mới (mặc định Chờ duyệt)
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
            <input
              type="text"
              value={manualStem}
              onChange={(e) => setManualStem(e.target.value)}
              placeholder="Đề bài (hỗ trợ KaTeX trong $...$, ví dụ: Tính $AC$ biết...)"
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
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
            <button
              type="button"
              onClick={() => {
                if (!manualStem.trim()) return;
                const baseItem: QuestionItem = {
                  id: generateId('gv'),
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
                  review_status: 'pending_teacher_review',
                  source_refs: ['GV_BIEN_SOAN'],
                  is_adapted: false,
                };
                if (manualType === 'numeric') {
                  const num = Number(manualNumericAns.replace(',', '.'));
                  if (!Number.isFinite(num)) return;
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
                  if (!manualOptA.trim() || !manualOptB.trim()) return;
                  baseItem.options = [
                    {id: 'a', label: manualOptA.trim()},
                    {id: 'b', label: manualOptB.trim(), errorCode: manualErrorCode},
                    ...(manualOptC.trim() ? [{id: 'c', label: manualOptC.trim(), errorCode: manualErrorCode}] : []),
                    ...(manualOptD.trim() ? [{id: 'd', label: manualOptD.trim(), errorCode: manualErrorCode}] : []),
                  ];
                  baseItem.expected_answer = {choice: 'a'};
                }
                dataService.upsertQuestion(user, baseItem, 'Giáo viên tạo thủ công');
                setManualStem('');
                setManualNumericAns('');
                setManualOptA('');
                setManualOptB('');
                setManualOptC('');
                setManualOptD('');
                setManualSolution('');
                setManualHint('');
                refresh();
              }}
              className="btn-tactile btn-jade text-xs py-2 px-4"
            >
              <Plus className="w-4 h-4" /> Lưu vào ngân hàng (Chờ duyệt)
            </button>
          </div>

          {/* Question List */}
          <div className="space-y-2">
            {questions
              .filter((q) => bankFilterCluster === 'ALL' || q.cluster === bankFilterCluster)
              .filter((q) => bankFilterStatus === 'ALL' || q.review_status === bankFilterStatus)
              .map((q) => {
                const checked = selectedQIds.includes(q.id);
                return (
                  <div key={q.id} className="notebook-card p-3.5 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label className="flex items-start gap-2 cursor-pointer flex-1">
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
                        <div className="text-sm text-[#14284A]">
                          <span className="font-extrabold mr-1.5">[{q.id}]</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#FFF4D6] text-xs font-bold mr-1.5">
                            {q.cluster} · Mức {q.level}
                          </span>
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
                                : 'Chờ duyệt'}
                          </span>
                          <div className="mt-1">
                            <MathText text={q.stem_vi} />
                          </div>
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
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuestion(q);
                            setEditQStem(q.stem_vi);
                            setEditQSolution(q.solution_vi);
                            setEditQHint(q.hints_vi[0] ?? '');
                            setEditQNote('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#FFF4D6] border border-[#E0A93B] text-xs font-bold !min-h-[34px]"
                        >
                          Sửa (v{(q.version ?? 1) + 1})
                        </button>
                        {q.review_status !== 'approved' && (
                          <button
                            type="button"
                            onClick={() => {
                              dataService.setQuestionReviewStatus(user, [q.id], 'approved');
                              refresh();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#2E9C8A] text-white text-xs font-bold !min-h-[34px]"
                          >
                            Duyệt
                          </button>
                        )}
                        {q.review_status !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() => {
                              dataService.setQuestionReviewStatus(user, [q.id], 'rejected');
                              refresh();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5108] text-xs font-bold !min-h-[34px]"
                          >
                            Ngừng dùng
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
              <div className="notebook-card max-w-lg w-full p-5 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-extrabold text-[#14284A]">
                    Chỉnh sửa câu {editingQuestion.id} → tạo phiên bản v{(editingQuestion.version ?? 1) + 1}
                  </h3>
                  <button type="button" onClick={() => setEditingQuestion(null)} className="p-1.5">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-[#5B6B82]">
                  Bản cũ v{editingQuestion.version ?? 1} vẫn được giữ trong lịch sử phiên bản để bảo toàn minh chứng bài làm trước đó.
                </p>
                <div className="space-y-1">
                  <label className="font-bold text-[#14284A]">Nội dung đề bài</label>
                  <textarea
                    rows={3}
                    value={editQStem}
                    onChange={(e) => setEditQStem(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-[#14284A]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#14284A]">Gợi ý bước đầu</label>
                  <input
                    type="text"
                    value={editQHint}
                    onChange={(e) => setEditQHint(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-[#14284A]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#14284A]">Lời giải mẫu</label>
                  <textarea
                    rows={2}
                    value={editQSolution}
                    onChange={(e) => setEditQSolution(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-[#14284A]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#14284A]">Ghi chú lý do sửa</label>
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
                    onClick={() => {
                      if (!editQStem.trim()) return;
                      dataService.upsertQuestion(
                        user,
                        {
                          ...editingQuestion,
                          stem_vi: editQStem.trim(),
                          solution_vi: editQSolution.trim() || editingQuestion.solution_vi,
                          hints_vi: [editQHint.trim() || editingQuestion.hints_vi[0] || '', ...editingQuestion.hints_vi.slice(1)],
                        },
                        editQNote.trim() || 'Giáo viên chỉnh sửa nội dung',
                      );
                      setEditingQuestion(null);
                      refresh();
                    }}
                    className="btn-tactile btn-jade text-xs py-2 px-4"
                  >
                    Lưu phiên bản mới
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
                <div className="p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] text-sm">
                  <MathText text={previewQuestion.stem_vi} />
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

      {/* TAB 6: IMPORT MATERIALS */}
      {tab === 'import' && (
        <MaterialImporter
          user={user}
          settings={settings}
          existingQuestions={questions}
          onQuestionsChanged={refresh}
          onOpenSettingsTab={() => setTab('settings')}
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
                              <MathText text={qItem.stem_vi.slice(0, 200)} />
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

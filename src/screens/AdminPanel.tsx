import React from 'react';
import {
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
  Users,
  X,
} from 'lucide-react';
import {BankDistributionTab} from '../components/BankDistributionTab.tsx';
import {MaterialImporter} from '../components/MaterialImporter.tsx';
import {MathText} from '../components/MathText.tsx';
import {SKILL_CLUSTER_LIST, SKILL_CLUSTERS} from '../config.ts';
import {normalizeJourneyProgress} from '../journey.ts';
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
  onExitAdmin: () => void;
  onPreviewAsStudent: () => void;
  onOpenMapAlign?: () => void;
  onRefreshApp: () => void;
}

type AdminTab =
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
  onExitAdmin,
  onPreviewAsStudent,
  onOpenMapAlign,
  onRefreshApp,
}) => {
  const isAdmin = canEditSettingsOrUsers(user);
  const [tab, setTab] = React.useState<AdminTab>('overview');
  const [tick, setTick] = React.useState(0);
  const refresh = () => {
    setTick((t) => t + 1);
    onRefreshApp();
  };

  // Derived data
  const users = React.useMemo(() => dataService.getAllUsers(), [tick]);
  const classes = React.useMemo(() => dataService.getClasses(), [tick]);
  const questions = React.useMemo(() => dataService.getQuestions(), [tick]);
  const rebuttals = React.useMemo(() => dataService.getRebuttals(), [tick]);
  const settings = React.useMemo(() => dataService.getSettings(), [tick]);

  // Users tab states
  const [userSearch, setUserSearch] = React.useState('');
  const [testAccMsg, setTestAccMsg] = React.useState('');
  const [resetTargetUid, setResetTargetUid] = React.useState<string | null>(null);
  const [resetNewPass, setResetNewPass] = React.useState('');

  // Class tab states
  const [newClassName, setNewClassName] = React.useState('');
  const [newClassCode, setNewClassCode] = React.useState('');

  // Bank tab states
  const [bankFilterCluster, setBankFilterCluster] = React.useState<SkillCluster | 'ALL'>('ALL');
  const [bankFilterStatus, setBankFilterStatus] = React.useState<ReviewStatus | 'ALL'>('ALL');
  const [selectedQIds, setSelectedQIds] = React.useState<string[]>([]);
  const [previewQuestion, setPreviewQuestion] = React.useState<QuestionItem | null>(null);
  const [manualStem, setManualStem] = React.useState('');
  const [manualCluster, setManualCluster] = React.useState<SkillCluster>('SIN');
  const [manualNumericAns, setManualNumericAns] = React.useState('');
  const [manualUnit, setManualUnit] = React.useState('m');
  const [manualSolution, setManualSolution] = React.useState('');
  const [manualHint, setManualHint] = React.useState('');

  // Reports tab states
  const [includeTestInReport, setIncludeTestInReport] = React.useState(false);
  const attempts = React.useMemo(
    () => dataService.getAttempts(includeTestInReport),
    [tick, includeTestInReport],
  );
  const events = React.useMemo(
    () => dataService.getEvents(includeTestInReport),
    [tick, includeTestInReport],
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
  const pendingQuestionsCount = questions.filter((q) => q.review_status === 'pending_teacher_review').length;
  const pendingRebuttalsCount = rebuttals.filter((r) => r.status === 'pending').length;

  const tabs: Array<{id: AdminTab; label: string; icon: React.ComponentType<{className?: string}>}> = [
    {id: 'overview', label: '1. Tổng quan', icon: ShieldCheck},
    {id: 'users', label: '2. Người dùng', icon: Users},
    {id: 'classes', label: '3. Lớp & mã', icon: BookMarked},
    {id: 'bank', label: `4. Ngân hàng (${questions.length})`, icon: Sparkles},
    {id: 'distribution', label: '5. Phân bố ngân hàng', icon: LayoutGrid},
    {id: 'import', label: '6. Nhập học liệu', icon: FileUp},
    {id: 'reports', label: '7. Báo cáo lớp', icon: BarChart3},
    {id: 'rebuttals', label: `8. Phản biện (${pendingRebuttalsCount})`, icon: MessageSquareWarning},
    {id: 'settings', label: '9. Cài đặt', icon: Settings},
    {id: 'selftest', label: '10. Tự kiểm tra', icon: Check},
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      {/* Top Admin Header */}
      <div className="notebook-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
            Khu Quản trị & Duyệt học liệu (M11) · {user.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'}
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
            <ArrowLeft className="w-4 h-4" /> Về giao diện học
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
              <p className="text-xs font-bold text-[#5B6B82]">Học viên thật (trừ TEST)</p>
              <p className="font-display text-3xl font-extrabold text-[#14284A] tabular-nums mt-1">
                {realStudents.length}
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
                {dataService.getAttempts(false).length}
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
              Lưu ý quy trình duyệt học liệu
            </h2>
            <p>
              • Toàn bộ 16 câu hạt giống trạm BS01 (P01–P04, M01–M06, R01–R04, T01–T02) mặc định ở trạng thái <strong>Chờ giáo viên duyệt</strong>. Giáo viên có thể mở tab <strong>4. Ngân hàng</strong> để xem trước công thức KaTeX và bấm duyệt đơn lẻ hoặc hàng loạt.
            </p>
            <p>
              • Dữ liệu từ tài khoản TEST tự động được tách riêng khỏi <strong>6. Báo cáo lớp</strong> và tệp xuất CSV.
            </p>
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
              className="flex-1 min-w-[220px] px-3.5 py-2 rounded-xl bg-white border-2 border-[#CBB17D] text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
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

          {testAccMsg && (
            <p className="p-3 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-xs font-bold text-[#1F7A6B]">
              {testAccMsg}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#D5B87E] text-[#5B6B82]">
                  <th className="py-2 pr-3">Mã HS</th>
                  <th className="py-2 pr-3">Tên đăng nhập</th>
                  <th className="py-2 pr-3">Biệt danh</th>
                  <th className="py-2 pr-3">Vai trò</th>
                  <th className="py-2 pr-3">Hành trình</th>
                  <th className="py-2 pr-3">XP</th>
                  <th className="py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5D3A8]">
                {users
                  .filter((u) => {
                    const q = userSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      u.username.includes(q) ||
                      u.studentCode.toLowerCase().includes(q) ||
                      u.displayName.toLowerCase().includes(q)
                    );
                  })
                  .map((u) => {
                    const j = normalizeJourneyProgress(u.journey);
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
                            <span className="font-bold uppercase">{u.role}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums font-bold text-[#18685B]">
                          Mốc {j.currentMoc}/10 ({j.passedMoc.length} qua)
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums font-bold">{u.xp}</td>
                        <td className="py-2.5 flex flex-wrap gap-1.5">
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
                          {isAdmin && u.uid !== user.uid && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  dataService.adminToggleLockUser(user, u.uid);
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
                  const res = await dataService.adminResetPassword(user, resetTargetUid, resetNewPass);
                  setTestAccMsg(res.ok ? 'Đã đặt lại mật khẩu thành công.' : (res.error ?? 'Lỗi'));
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
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="p-3.5 rounded-xl bg-[#FFFBF0] border-2 border-[#D9C293] flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="font-display text-lg font-extrabold text-[#14284A]">Lớp {cls.name}</p>
                  <p className="text-xs text-[#5B6B82]">
                    Mã tham gia: <strong className="text-[#1F7A6B]">{cls.code}</strong> · Sĩ số đã đăng ký:{' '}
                    <strong className="tabular-nums">
                      {users.filter((u) => u.classCode === cls.code && u.role === 'student' && !u.isTestAccount).length}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    dataService.regenerateClassCode(user, cls.id);
                    refresh();
                  }}
                  className="btn-tactile btn-paper text-xs py-2 px-3"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Đổi mã lớp
                </button>
              </div>
            ))}
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

          {/* Manual add question quick form */}
          <div className="notebook-card-warm p-4 space-y-2.5">
            <h2 className="font-display text-base font-extrabold text-[#14284A]">
              Thêm nhanh câu hỏi số học (mặc định chờ duyệt)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
            <input
              type="text"
              value={manualStem}
              onChange={(e) => setManualStem(e.target.value)}
              placeholder="Đề bài (hỗ trợ KaTeX trong $...$, ví dụ: Tính $AC$ biết...)"
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#CBB17D] text-xs"
            />
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
                const num = Number(manualNumericAns.replace(',', '.'));
                if (!manualStem.trim() || !Number.isFinite(num)) return;
                dataService.upsertQuestion(
                  user,
                  {
                    id: generateId('gv'),
                    cluster: manualCluster,
                    skill_ids: [manualCluster.toLowerCase()],
                    level: 2,
                    type: 'numeric',
                    stem_vi: manualStem.trim(),
                    expected_answer: {rounded: num, value: num, decimal_places: 1, unit: manualUnit},
                    fixedUnitLabel: manualUnit || undefined,
                    solution_vi: manualSolution.trim() || `Đáp án là ${num} ${manualUnit}.`,
                    anticipated_error_ids: ['E05'],
                    hints_vi: [manualHint.trim() || 'Kiểm tra lại công thức và đơn vị đo.'],
                    review_status: 'pending_teacher_review',
                    source_refs: ['GV_BIEN_SOAN'],
                    is_adapted: false,
                  },
                  'Giáo viên tạo thủ công',
                );
                setManualStem('');
                setManualNumericAns('');
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

                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewQuestion(q)}
                          className="px-2.5 py-1 rounded-lg bg-[#FFFBF0] border border-[#CBB17D] text-xs font-bold !min-h-[34px]"
                        >
                          Xem trước
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
                            Từ chối
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

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

      {/* TAB 6: CLASS REPORTS (by internal code HS-xxx, explicit denominators, excluding TEST) */}
      {tab === 'reports' && (
        <div className="notebook-card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[#14284A]">
                Báo cáo học tập theo mã học viên (không công khai tên thật)
              </h2>
              <p className="text-xs text-[#5B6B82]">
                Mẫu số hiện tại: <strong>{attempts.length} lượt làm bài</strong> ·{' '}
                <strong>{events.length} sự kiện gốc</strong> (
                {includeTestInReport ? 'gồm cả tài khoản TEST' : 'đã loại bỏ tài khoản TEST'}).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#D5B87E] text-[#5B6B82]">
                  <th className="py-2 pr-3">Mã HS</th>
                  <th className="py-2 pr-3">Câu</th>
                  <th className="py-2 pr-3">Cụm</th>
                  <th className="py-2 pr-3">Chế độ</th>
                  <th className="py-2 pr-3">Kết quả</th>
                  <th className="py-2 pr-3">Mã lỗi</th>
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
                  attempts.slice(-40).reverse().map((att) => (
                    <tr key={att.id}>
                      <td className="py-2 pr-3 font-bold tabular-nums">{att.studentCode}</td>
                      <td className="py-2 pr-3">{att.questionId}</td>
                      <td className="py-2 pr-3 font-bold">{att.cluster}</td>
                      <td className="py-2 pr-3">
                        {att.mode === 'verify' ? 'Kiểm chứng' : 'Luyện tập'}
                        {att.switchedToPractice ? ' (đã đổi)' : ''}
                      </td>
                      <td className="py-2 pr-3 font-bold">
                        {att.isCorrect ? (
                          <span className="text-[#1F7A6B]">Đúng</span>
                        ) : (
                          <span className="text-[#8A5108]">Chưa đúng</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{att.errorCode ?? '—'}</td>
                      <td className="py-2 tabular-nums">{Math.round(att.durationMs / 1000)}s</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {/* TAB 8: SETTINGS */}
      {tab === 'settings' && (
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

      {/* TAB 9: SELF TEST */}
      {tab === 'selftest' && <SelfTestScreen embedded />}
    </div>
  );
};

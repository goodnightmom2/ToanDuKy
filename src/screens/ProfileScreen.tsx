import React from 'react';
import {CloudUpload, LogOut, Palette, ShieldCheck, Sliders, Volume2, VolumeX} from 'lucide-react';
import {Avatar} from '../components/Avatar.tsx';
import {ORG_INFO} from '../config.ts';
import {canAccessAdmin, dataService, getSyncStatusLabel} from '../services/dataService.ts';
import type {SyncStatus, UserAccount} from '../types.ts';

interface ProfileScreenProps {
  user: UserAccount;
  onEditAvatar: () => void;
  onUpdatePreferences: (patch: Partial<UserAccount['preferences']>) => void;
  onToggleLeaderboard: () => void;
  onOpenAdmin: () => void;
  onOpenSelfTest: () => void;
  onLogout: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onEditAvatar,
  onUpdatePreferences,
  onToggleLeaderboard,
  onOpenAdmin,
  onOpenSelfTest,
  onLogout,
}) => {
  const isStaff = canAccessAdmin(user);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(() => dataService.getSyncStatus());
  const [pendingCount, setPendingCount] = React.useState<number>(() =>
    dataService.getPendingSyncCount(),
  );
  const [syncBusy, setSyncBusy] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState('');

  React.useEffect(() => {
    return dataService.subscribe(() => {
      setSyncStatus(dataService.getSyncStatus());
      setPendingCount(dataService.getPendingSyncCount());
    });
  }, []);

  const handleSyncToServer = async () => {
    setSyncBusy(true);
    setSyncMsg('');
    const res = await dataService.syncLocalDataToServer();
    setSyncBusy(false);
    setSyncMsg(res.message);
    setSyncStatus(dataService.getSyncStatus());
    setPendingCount(dataService.getPendingSyncCount());
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
      <div className="notebook-card p-5 flex flex-col sm:flex-row items-center gap-5">
        <div className="p-3 rounded-2xl bg-[#FFF4D6] border-2 border-[#D5B87E]">
          <Avatar appearance={user.avatar} size={148} />
        </div>
        <div className="flex-1 text-center sm:text-left space-y-2">
          <p className="text-xs font-extrabold uppercase text-[#2E9C8A]">
            {user.role === 'admin'
              ? 'Quản trị viên / Giáo viên'
              : user.role === 'teacher'
                ? 'Giáo viên'
                : 'Học viên Toán Du Ký'}
          </p>
          <h1 className="font-display text-2xl font-extrabold text-[#14284A]">
            {user.displayName}
          </h1>
          <p className="text-xs text-[#5B6B82]">
            Tên đăng nhập: <strong>{user.username}</strong> · Mã nội bộ: <strong>{user.studentCode}</strong> · Lớp: <strong>{user.classCode}</strong>
          </p>
          <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1">
            <button type="button" onClick={onEditAvatar} className="btn-tactile btn-gold text-sm">
              <Palette className="w-4 h-4" /> Chỉnh sửa nhân vật
            </button>
            {isStaff && (
              <button type="button" onClick={onOpenAdmin} className="btn-tactile btn-ink text-sm">
                <ShieldCheck className="w-4 h-4 text-[#E0A93B]" /> Mở khu Quản trị (M11)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Accessibility & Comfort Settings */}
      <div className="notebook-card p-5 space-y-3">
        <h2 className="font-display text-xl font-extrabold text-[#14284A] flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#2E9C8A]" />
          Cài đặt trải nghiệm học tập
        </h2>

        <div className="divide-y divide-[#E5D3A8]">
          <div className="py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-[#14284A] flex items-center gap-1.5">
                {user.preferences.audioEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#2E9C8A]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-[#5B6B82]" />
                )}
                Âm thanh phản hồi nhẹ (mặc định TẮT)
              </p>
              <p className="text-xs text-[#5B6B82]">Chuông nhẹ khi trả lời đúng, mở rương hoặc bấm bước đo.</p>
            </div>
            <button
              type="button"
              onClick={() => onUpdatePreferences({audioEnabled: !user.preferences.audioEnabled})}
              className={`px-4 py-2 rounded-xl font-bold text-xs border-2 ${
                user.preferences.audioEnabled
                  ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                  : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
              }`}
            >
              {user.preferences.audioEnabled ? 'Đang BẬT' : 'Đang TẮT'}
            </button>
          </div>

          <div className="py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-[#14284A]">Giảm chuyển động</p>
              <p className="text-xs text-[#5B6B82]">Tắt hiệu ứng rung/nổi để đọc công thức Toán êm mắt hơn.</p>
            </div>
            <button
              type="button"
              onClick={() => onUpdatePreferences({reduceMotion: !user.preferences.reduceMotion})}
              className={`px-4 py-2 rounded-xl font-bold text-xs border-2 ${
                user.preferences.reduceMotion
                  ? 'bg-[#14284A] text-white border-[#14284A]'
                  : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
              }`}
            >
              {user.preferences.reduceMotion ? 'Đang BẬT' : 'Đang TẮT'}
            </button>
          </div>

          <div className="py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-[#14284A]">Di chuyển dễ trong cảnh 2D</p>
              <p className="text-xs text-[#5B6B82]">Tăng tốc độ bước đi nhân vật khi khám phá trạm.</p>
            </div>
            <button
              type="button"
              onClick={() => onUpdatePreferences({easyMove: !user.preferences.easyMove})}
              className={`px-4 py-2 rounded-xl font-bold text-xs border-2 ${
                user.preferences.easyMove
                  ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                  : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
              }`}
            >
              {user.preferences.easyMove ? 'Đang BẬT' : 'Đang TẮT'}
            </button>
          </div>

          <div className="py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-[#14284A]">Tự chọn hiện biệt danh ở bảng hành trình</p>
              <p className="text-xs text-[#5B6B82]">Không bao giờ hiển thị họ tên thật hay xếp hạng yếu/kém.</p>
            </div>
            <button
              type="button"
              onClick={onToggleLeaderboard}
              className={`px-4 py-2 rounded-xl font-bold text-xs border-2 ${
                user.leaderboardOptIn
                  ? 'bg-[#2E9C8A] text-white border-[#1F7A6B]'
                  : 'bg-[#FFFBF0] text-[#14284A] border-[#CBB17D]'
              }`}
            >
              {user.leaderboardOptIn ? 'Có hiện biệt danh' : 'Ẩn riêng tư'}
            </button>
          </div>
        </div>
      </div>

      {/* Cloud Firestore & LocalAdapter Sync Status + Logout */}
      <div className="notebook-card-warm p-4 space-y-2.5 text-xs text-[#5B6B82]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-[#14284A]">
            Trạng thái lưu trữ:{' '}
            <span
              className={
                syncStatus === 'saved' ? 'text-[#1F7A6B]' : 'text-[#8A5108]'
              }
            >
              {getSyncStatusLabel(syncStatus)}
            </span>{' '}
            · Chế độ:{' '}
            {dataService.adapterMode === 'supabase'
              ? 'SupabaseAdapter (PostgreSQL)'
              : 'LocalAdapter (dự phòng trên máy này)'}
            {pendingCount > 0 ? ` · ${pendingCount} mục chưa đồng bộ` : ''}
          </p>
        </div>
        {dataService.lastNotice && (
          <p className="p-2.5 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-[#8A5108] font-semibold">
            {dataService.lastNotice}
          </p>
        )}
        {syncMsg && (
          <p className="p-2.5 rounded-xl bg-[#E6F6F3] border border-[#2E9C8A] text-[#1F7A6B] font-semibold">
            {syncMsg}
          </p>
        )}
        <p>
          Tính năng giai đoạn sau (Đang phát triển): Nhận dạng giọng nói · Cổng phụ huynh · Cảnh khám phá 3D.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={syncBusy}
            onClick={() => void handleSyncToServer()}
            className="btn-tactile btn-jade text-xs py-2 px-3.5"
          >
            <CloudUpload className="w-4 h-4" />
            {syncBusy ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu trên máy lên máy chủ'}
          </button>
          <button type="button" onClick={onOpenSelfTest} className="btn-tactile btn-paper text-xs py-2 px-3">
            Chạy Tự kiểm tra (#/selftest)
          </button>
          <button type="button" onClick={onLogout} className="btn-tactile btn-amber text-xs py-2 px-3.5">
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>
        </div>
      </div>

      <footer className="text-center text-xs text-[#5B6B82] pt-2">
        {ORG_INFO.chapterTitle}
      </footer>
    </div>
  );
};

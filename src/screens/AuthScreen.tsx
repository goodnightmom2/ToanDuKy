import React from 'react';
import {KeyRound, LogIn, Shield, UserPlus} from 'lucide-react';
import {APP_NAME, ORG_INFO} from '../config.ts';
import {dataService} from '../services/dataService.ts';
import type {UserAccount} from '../types.ts';

interface AuthScreenProps {
  onAuthenticated: (user: UserAccount) => void;
  onBackToIntro: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({onAuthenticated, onBackToIntro}) => {
  const [needsAdminSetup, setNeedsAdminSetup] = React.useState<boolean>(
    () => !dataService.isSupabaseConfigured() && !dataService.hasAnyAdmin(),
  );
  const [tab, setTab] = React.useState<'setup_admin' | 'login' | 'register'>(() =>
    !dataService.isSupabaseConfigured() && !dataService.hasAnyAdmin() ? 'setup_admin' : 'login',
  );

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [classCode, setClassCode] = React.useState('TOAN10-01');
  const [researchConsent, setResearchConsent] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // Check Firestore /config/setup on mount to know whether first admin already exists on server
  React.useEffect(() => {
    let active = true;
    void dataService.checkFirstAdminSetupAsync().then((hasAdmin) => {
      if (!active) return;
      const needs = !hasAdmin;
      setNeedsAdminSetup(needs);
      setTab((prev) => {
        if (!needs && prev === 'setup_admin') return 'login';
        if (needs && prev === 'login') return 'setup_admin';
        return prev;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu nhập lại chưa khớp.');
      return;
    }
    setBusy(true);
    const res = await dataService.setupFirstAdmin({
      username,
      password,
      displayName,
    });
    setBusy(false);
    if (!res.ok || !res.user) {
      setErrorMsg(res.error ?? 'Không thể tạo tài khoản quản trị.');
      return;
    }
    onAuthenticated(res.user);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusy(true);
    const res = await dataService.login(username, password);
    setBusy(false);
    if (!res.ok || !res.user) {
      setErrorMsg(res.error ?? 'Đăng nhập chưa thành công.');
      return;
    }
    onAuthenticated(res.user);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu nhập lại chưa khớp.');
      return;
    }
    setBusy(true);
    const res = await dataService.registerStudent({
      username,
      password,
      displayName,
      classCode,
      researchConsent,
    });
    setBusy(false);
    if (!res.ok || !res.user) {
      setErrorMsg(res.error ?? 'Đăng ký chưa thành công.');
      return;
    }
    onAuthenticated(res.user);
  };

  return (
    <div className="min-h-dvh paper-surface flex flex-col justify-between px-4 py-6">
      <div className="max-w-md w-full mx-auto space-y-5">
        <div className="text-center space-y-1">
          <button
            type="button"
            onClick={onBackToIntro}
            className="text-xs font-bold text-[#5B6B82] hover:text-[#14284A] underline !min-h-[34px]"
          >
            ← Quay lại màn hình giới thiệu
          </button>
          <img
            src="/logo.png"
            alt={APP_NAME}
            className="w-24 h-24 mx-auto object-contain drop-shadow-md pt-1 select-none"
          />
          <h1 className="font-display text-3xl font-extrabold text-[#14284A]">{APP_NAME}</h1>
          <p className="text-sm text-[#5B6B82]">
            {tab === 'setup_admin'
              ? 'Thiết lập tài khoản quản trị viên lần đầu'
              : 'Đăng nhập hoặc đăng ký tài khoản học sinh'}
          </p>
        </div>

        {/* Mode switcher — Login is ALWAYS available on every device */}
        <div
          className={`grid gap-2 p-1.5 rounded-2xl bg-[#F7E7B8] border border-[#D5B87E] ${
            needsAdminSetup ? 'grid-cols-3' : 'grid-cols-2'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg('');
            }}
            className={`rounded-xl py-2 text-sm font-bold transition ${
              tab === 'login'
                ? 'bg-[#14284A] text-[#FFFBF0]'
                : 'text-[#14284A] hover:bg-[#FFFBF0]/60'
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg('');
            }}
            className={`rounded-xl py-2 text-sm font-bold transition ${
              tab === 'register'
                ? 'bg-[#1D7A6A] text-white'
                : 'text-[#14284A] hover:bg-[#FFFBF0]/60'
            }`}
          >
            Đăng ký Học sinh
          </button>
          {needsAdminSetup && (
            <button
              type="button"
              onClick={() => {
                setTab('setup_admin');
                setErrorMsg('');
              }}
              className={`rounded-xl py-2 text-xs sm:text-sm font-bold transition ${
                tab === 'setup_admin'
                  ? 'bg-[#B9831E] text-white'
                  : 'text-[#14284A] hover:bg-[#FFFBF0]/60'
              }`}
            >
              Khởi tạo Quản trị
            </button>
          )}
        </div>

        {tab === 'setup_admin' && (
          <form onSubmit={handleSetupAdmin} className="notebook-card p-5 space-y-4">
            <div className="p-3 rounded-xl bg-[#FFF4D6] border border-[#D98A1F] text-xs text-[#5C3A06] leading-relaxed">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <Shield className="w-4 h-4 text-[#B9831E]" />
                Bảo mật khởi tạo lần đầu
              </p>
              Ứng dụng không dùng mật khẩu quản trị mặc định. Giáo viên phụ trách hãy tạo tài khoản quản trị đầu tiên tại đây.
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="adm-name">
                Tên hiển thị quản trị viên
              </label>
              <input
                id="adm-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Quản trị viên"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="adm-user">
                Tên đăng nhập (a-z, 0-9, . _ -)
              </label>
              <input
                id="adm-user"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="quantri01"
                autoComplete="username"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="adm-pass">
                Mật khẩu (tối thiểu 8 ký tự)
              </label>
              <input
                id="adm-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="adm-pass2">
                Nhập lại mật khẩu
              </label>
              <input
                id="adm-pass2"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
              />
            </div>

            {errorMsg && (
              <p className="p-3 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-sm font-semibold text-[#8A5108]">
                {errorMsg}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-tactile btn-ink w-full">
              <KeyRound className="w-5 h-5" />
              Tạo tài khoản Quản trị đầu tiên
            </button>
          </form>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="notebook-card p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="login-user">
                Tên đăng nhập
              </label>
              <input
                id="login-user"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ví dụ: hocvien01"
                autoComplete="username"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="login-pass">
                Mật khẩu
              </label>
              <input
                id="login-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
              />
            </div>

            {errorMsg && (
              <p className="p-3 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-sm font-semibold text-[#8A5108]">
                {errorMsg}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-tactile btn-jade w-full">
              <LogIn className="w-5 h-5" />
              Đăng nhập
            </button>

            <button
              type="button"
              disabled
              className="btn-tactile btn-paper w-full text-sm opacity-70"
            >
              Đăng nhập bằng Google (Đang phát triển)
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegister} className="notebook-card p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="reg-nick">
                Họ và tên học sinh (hiển thị cố định trong lớp)
              </label>
              <input
                id="reg-nick"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn An"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="reg-user">
                Tên đăng nhập (3–24 ký tự: a-z, 0-9, . _ -)
              </label>
              <input
                id="reg-user"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="hocvien01"
                autoComplete="username"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-bold text-[#14284A]" htmlFor="reg-pass">
                  Mật khẩu (≥ 8 ký tự)
                </label>
                <input
                  id="reg-pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-[#14284A]" htmlFor="reg-pass2">
                  Nhập lại mật khẩu
                </label>
                <input
                  id="reg-pass2"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] text-[#14284A]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-[#14284A]" htmlFor="reg-class">
                Mã lớp (giáo viên cung cấp)
              </label>
              <input
                id="reg-class"
                type="text"
                required
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                placeholder="TOAN10-01"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-[#CBB17D] font-bold uppercase text-[#14284A]"
              />
              <p className="text-xs text-[#5B6B82]">Mã lớp mẫu mặc định là: <strong>TOAN10-01</strong></p>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FFFBF0] border border-[#D9C293] text-xs text-[#1B2A41] cursor-pointer">
              <input
                type="checkbox"
                checked={researchConsent}
                onChange={(e) => setResearchConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#2E9C8A]"
              />
              <span>
                Đồng ý ghi nhận dữ liệu học tập ẩn danh (theo mã học viên, không lộ tên thật) để hỗ trợ ôn tập Chương III. (Không bắt buộc)
              </span>
            </label>

            {errorMsg && (
              <p className="p-3 rounded-xl bg-[#FFF5E2] border border-[#D98A1F] text-sm font-semibold text-[#8A5108]">
                {errorMsg}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-tactile btn-jade w-full">
              <UserPlus className="w-5 h-5" />
              Tạo tài khoản và tạo nhân vật
            </button>
          </form>
        )}
      </div>

      <footer className="text-center text-xs text-[#5B6B82] pt-6 pb-safe">
        {APP_NAME} · {ORG_INFO.chapterTitle}
      </footer>
    </div>
  );
};

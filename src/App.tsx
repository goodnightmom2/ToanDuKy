import React from 'react';
import {
  Backpack,
  BookOpen,
  CheckCircle2,
  CloudUpload,
  Compass,
  Dumbbell,
  EyeOff,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {APP_NAME, ORG_INFO} from './config.ts';
import {JOURNEY_MILESTONES_BY_ID} from './journey.ts';
import {AdminPanel} from './screens/AdminPanel.tsx';
import {AdventureMap} from './screens/AdventureMap.tsx';
import {AuthScreen} from './screens/AuthScreen.tsx';
import {AvatarCreator} from './screens/AvatarCreator.tsx';
import {BossBattle} from './screens/BossBattle.tsx';
import {IntroScreen} from './screens/IntroScreen.tsx';
import {InventoryScreen} from './screens/InventoryScreen.tsx';
import {MapAlignScreen} from './screens/MapAlignScreen.tsx';
import {PracticeScreen} from './screens/PracticeScreen.tsx';
import {ProfileScreen} from './screens/ProfileScreen.tsx';
import {ProgressBook} from './screens/ProgressBook.tsx';
import {SelfTestScreen} from './screens/SelfTestScreen.tsx';
import {StationMission} from './screens/StationMission.tsx';
import {StationScene} from './screens/StationScene.tsx';
import {
  canAccessAdmin,
  canEditSettingsOrUsers,
  dataService,
  getSyncStatusLabel,
} from './services/dataService.ts';
import type {AvatarAppearance, MocId, StationId, SyncStatus, UserAccount} from './types.ts';
import {soundEngine} from './utils/audio.ts';

type AppRoute =
  | 'intro'
  | 'auth'
  | 'avatar_create'
  | 'map'
  | 'scene'
  | 'mission'
  | 'boss'
  | 'practice'
  | 'inventory'
  | 'progress'
  | 'profile'
  | 'admin'
  | 'map_align'
  | 'selftest';

function AppInner() {
  const [user, setUser] = React.useState<UserAccount | null>(() => dataService.getCurrentUser());
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(() => dataService.getSyncStatus());
  const [pendingSyncCount, setPendingSyncCount] = React.useState<number>(() =>
    dataService.getPendingSyncCount(),
  );
  const [syncBusy, setSyncBusy] = React.useState(false);
  const [syncBannerMsg, setSyncBannerMsg] = React.useState('');

  const [route, setRoute] = React.useState<AppRoute>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#/selftest') return 'selftest';
      if (window.location.hash === '#/admin/map-align') {
        const current = dataService.getCurrentUser();
        if (current && canEditSettingsOrUsers(current)) return 'map_align';
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        const current = dataService.getCurrentUser();
        if (current) return current.avatarCreated ? 'map' : 'avatar_create';
        return 'auth';
      }
    }
    return 'intro';
  });

  const [activeStation, setActiveStation] = React.useState<StationId>('QS01');
  const [activeMocId, setActiveMocId] = React.useState<MocId>(1);
  const [animateFromMoc, setAnimateFromMoc] = React.useState<MocId | null>(null);
  const [celebrateAllComplete, setCelebrateAllComplete] = React.useState(false);
  const [missionStartStep, setMissionStartStep] = React.useState(0);
  const [bossStartHit, setBossStartHit] = React.useState(0);
  const [bossStartHp, setBossStartHp] = React.useState(100);
  const [previewingAsStudent, setPreviewingAsStudent] = React.useState(false);

  // Subscribe to DataService changes (Firebase Auth hydration, save status, pending sync count, journey updates)
  React.useEffect(() => {
    const updateFromService = () => {
      setSyncStatus(dataService.getSyncStatus());
      setPendingSyncCount(dataService.getPendingSyncCount());
      const latest = dataService.getCurrentUser();
      setUser((prev) => {
        if (!latest && !prev) return prev;
        if (!latest) return null;
        if (
          !prev ||
          prev.uid !== latest.uid ||
          prev.xp !== latest.xp ||
          prev.avatarCreated !== latest.avatarCreated ||
          prev.role !== latest.role ||
          prev.displayName !== latest.displayName ||
          JSON.stringify(prev.avatar) !== JSON.stringify(latest.avatar) ||
          JSON.stringify(prev.journey) !== JSON.stringify(latest.journey)
        ) {
          return latest;
        }
        return prev;
      });
    };
    const unsubscribe = dataService.subscribe(updateFromService);
    return unsubscribe;
  }, []);

  const handleQuickSync = async () => {
    setSyncBusy(true);
    setSyncBannerMsg('');
    const res = await dataService.syncLocalDataToServer();
    setSyncBusy(false);
    setSyncBannerMsg(res.message);
    const latest = dataService.getCurrentUser();
    if (latest) setUser(latest);
    setSyncStatus(dataService.getSyncStatus());
    setPendingSyncCount(dataService.getPendingSyncCount());
  };

  // Sync hash changes (#/selftest, #/admin/map-align)
  React.useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#/selftest') {
        setRoute('selftest');
      } else if (window.location.hash === '#/admin/map-align') {
        const current = dataService.getCurrentUser();
        if (current && canEditSettingsOrUsers(current)) {
          setRoute('map_align');
        }
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Sync document.body.dataset.state & accessibility preferences
  React.useEffect(() => {
    document.body.dataset.state = route === 'intro' ? 'title' : 'playing';
  }, [route]);

  React.useEffect(() => {
    const audioOn = user?.preferences.audioEnabled ?? false;
    const reduceMotion = user?.preferences.reduceMotion ?? false;
    soundEngine.setEnabled(audioOn);
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [user?.preferences.audioEnabled, user?.preferences.reduceMotion]);

  const navigate = (next: AppRoute) => {
    if (next === 'selftest') {
      window.location.hash = '#/selftest';
    } else if (next === 'map_align') {
      window.location.hash = '#/admin/map-align';
    } else if (
      window.location.hash === '#/selftest' ||
      window.location.hash === '#/admin/map-align'
    ) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setRoute(next);
    window.scrollTo({top: 0, behavior: 'auto'});
  };

  const handleStartFromIntro = () => {
    if (user) {
      navigate(user.avatarCreated ? 'map' : 'avatar_create');
    } else {
      navigate('auth');
    }
  };

  const handleAuthenticated = (loggedIn: UserAccount) => {
    setUser(loggedIn);
    if (loggedIn.role === 'admin' && !loggedIn.avatarCreated) {
      navigate('admin');
    } else if (loggedIn.role === 'admin' && loggedIn.username) {
      // Admin starts in map or can open admin immediately; if brand new admin, show admin panel right away
      navigate('admin');
    } else {
      navigate(loggedIn.avatarCreated ? 'map' : 'avatar_create');
    }
  };

  const handleSaveAvatar = (displayName: string, appearance: AvatarAppearance) => {
    if (!user) return;
    const updated = dataService.saveAvatar(user.uid, displayName, appearance);
    if (updated) setUser(updated);
    navigate('map');
  };

  const handleResumePaused = () => {
    if (!user?.pausedSession) return;
    const p = user.pausedSession;
    if (p.mocId) {
      setActiveMocId(p.mocId);
      setActiveStation(JOURNEY_MILESTONES_BY_ID[p.mocId].stationId);
    } else if (p.stationId) {
      setActiveStation(p.stationId);
    }
    if (p.kind === 'mission') {
      setMissionStartStep(p.stepIndex);
      navigate('mission');
    } else if (p.kind === 'boss') {
      setBossStartHit(p.hitIndex ?? 0);
      setBossStartHp(p.bossHp ?? 100);
      navigate('boss');
    } else {
      navigate('practice');
    }
  };

  const handleMocPassed = (passedMocId: MocId, allCompleted: boolean) => {
    if (passedMocId < 10) {
      setAnimateFromMoc(passedMocId);
    }
    if (allCompleted) {
      setCelebrateAllComplete(true);
    }
  };

  const showMainShell =
    Boolean(user) &&
    !['intro', 'auth', 'selftest', 'avatar_create'].includes(route);

  const isStaff = canAccessAdmin(user) && !previewingAsStudent;

  return (
    <div className="min-h-dvh paper-surface flex flex-col">
      {/* 3-State Save & Sync Status Bar: Đã lưu / Chờ đồng bộ / Đang lưu trên máy này */}
      {showMainShell && (
        <div
          className={`border-b px-3 py-1.5 text-xs font-semibold flex flex-wrap items-center justify-center gap-2 no-print ${
            syncStatus === 'saved'
              ? 'bg-[#E6F6F3] border-[#9CD5CA] text-[#1F7A6B]'
              : syncStatus === 'pending_sync'
                ? 'bg-[#FFF4D6] border-[#D98A1F] text-[#8A5108]'
                : 'bg-[#FFF4D6] border-[#D5B87E] text-[#8A5108]'
          }`}
          data-sync-status={syncStatus}
        >
          <span className="inline-flex items-center gap-1.5">
            {syncStatus === 'saved' ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : syncStatus === 'pending_sync' ? (
              <RefreshCw className="w-3.5 h-3.5" />
            ) : (
              <HardDrive className="w-3.5 h-3.5" />
            )}
            <span>
              Trạng thái lưu: <strong>{getSyncStatusLabel(syncStatus)}</strong>
              {syncStatus === 'pending_sync' && pendingSyncCount > 0
                ? ` (${pendingSyncCount} mục)`
                : ''}
            </span>
          </span>

          {(syncStatus === 'pending_sync' || (syncStatus === 'local_only' && pendingSyncCount > 0)) && (
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => void handleQuickSync()}
              className="px-2.5 py-0.5 rounded-lg bg-[#14284A] text-[#FFFBF0] text-[11px] font-bold inline-flex items-center gap-1 !min-h-[28px]"
            >
              <CloudUpload className="w-3 h-3" />
              {syncBusy ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu trên máy lên máy chủ'}
            </button>
          )}

          {syncBannerMsg && (
            <span className="text-[11px] font-bold underline decoration-dotted">{syncBannerMsg}</span>
          )}
        </div>
      )}

      {/* Preview-as-student banner for Admin/Teacher */}
      {showMainShell && previewingAsStudent && canAccessAdmin(user) && (
        <div className="bg-[#14284A] text-[#FFFBF0] px-4 py-2 flex items-center justify-between text-xs font-bold no-print">
          <span>Đang xem ứng dụng dưới góc nhìn Học viên</span>
          <button
            type="button"
            onClick={() => {
              setPreviewingAsStudent(false);
              navigate('admin');
            }}
            className="px-3 py-1 rounded-lg bg-[#E0A93B] text-[#14284A] font-extrabold flex items-center gap-1 !min-h-[32px]"
          >
            <EyeOff className="w-3.5 h-3.5" /> Quay lại Quản trị
          </button>
        </div>
      )}

      {/* Desktop Top Navigation Bar (hidden on Intro/Auth/Mobile) */}
      {showMainShell && user && (
        <header className="hidden md:block bg-[#FFFBF0] border-b-2 border-[#D5B87E] sticky top-0 z-30 no-print">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate('map')}
              className="font-display text-2xl font-extrabold text-[#14284A] flex items-center gap-2 !min-h-[40px]"
            >
              <Compass className="w-6 h-6 text-[#2E9C8A]" />
              {APP_NAME}
            </button>

            <nav className="flex items-center gap-1.5" aria-label="Điều hướng chính">
              {[
                {id: 'map' as const, label: 'Bản đồ', icon: Compass},
                {id: 'practice' as const, label: 'Luyện tập', icon: Dumbbell},
                {id: 'inventory' as const, label: 'Túi đồ', icon: Backpack},
                {id: 'progress' as const, label: 'Tiến độ', icon: BookOpen},
                {id: 'profile' as const, label: 'Hồ sơ', icon: UserIcon},
              ].map((item) => {
                const Icon = item.icon;
                const active =
                  route === item.id ||
                  (item.id === 'map' && ['scene', 'mission', 'boss'].includes(route));
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    className={`px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition ${
                      active
                        ? 'bg-[#14284A] text-[#FFFBF0]'
                        : 'text-[#14284A] hover:bg-[#FFF4D6]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}

              {isStaff && (
                <button
                  type="button"
                  onClick={() => navigate('admin')}
                  className={`px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 border-2 ${
                    route === 'admin'
                      ? 'bg-[#E0A93B] text-[#14284A] border-[#B9831E]'
                      : 'bg-[#FFF4D6] text-[#14284A] border-[#D5B87E]'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Quản trị
                </button>
              )}
            </nav>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div className={showMainShell ? 'flex-1 pb-24 md:pb-8' : 'flex-1'}>
        {route === 'intro' && (
          <IntroScreen
            onStart={handleStartFromIntro}
            onOpenSelfTest={() => navigate('selftest')}
          />
        )}

        {route === 'selftest' && (
          <SelfTestScreen onBack={() => navigate(user ? 'map' : 'intro')} />
        )}

        {route === 'auth' && (
          <AuthScreen
            onAuthenticated={handleAuthenticated}
            onBackToIntro={() => navigate('intro')}
          />
        )}

        {route === 'avatar_create' && user && (
          <AvatarCreator
            user={user}
            onSave={handleSaveAvatar}
            onCancel={user.avatarCreated ? () => navigate('profile') : undefined}
          />
        )}

        {route === 'map' && user && (
          <AdventureMap
            user={user}
            animateFromMoc={animateFromMoc}
            celebrateAllComplete={celebrateAllComplete}
            onAnimationDone={() => setAnimateFromMoc(null)}
            onDismissCelebration={() => setCelebrateAllComplete(false)}
            onExploreMoc={(mocId) => {
              if (!dataService.canUserEnterMoc(user.uid, mocId)) return;
              setActiveMocId(mocId);
              setActiveStation(JOURNEY_MILESTONES_BY_ID[mocId].stationId);
              navigate('scene');
            }}
            onStartMission={(mocId) => {
              if (!dataService.canUserEnterMoc(user.uid, mocId)) return;
              setActiveMocId(mocId);
              setActiveStation(JOURNEY_MILESTONES_BY_ID[mocId].stationId);
              setMissionStartStep(0);
              navigate('mission');
            }}
            onStartBoss={(mocId) => {
              if (!dataService.canUserChallengeMocBoss(user.uid, mocId)) return;
              setActiveMocId(mocId);
              setActiveStation(JOURNEY_MILESTONES_BY_ID[mocId].stationId);
              setBossStartHit(0);
              setBossStartHp(100);
              navigate('boss');
            }}
            onResumePaused={handleResumePaused}
          />
        )}

        {route === 'scene' && user && (
          <StationScene
            user={user}
            stationId={activeStation}
            mocId={activeMocId}
            onStartMission={() => {
              setMissionStartStep(0);
              navigate('mission');
            }}
            onStartBoss={() => {
              if (!dataService.canUserChallengeMocBoss(user.uid, activeMocId)) return;
              setBossStartHit(0);
              setBossStartHp(100);
              navigate('boss');
            }}
            onBackToMap={() => navigate('map')}
            onToggleEasyMove={() => {
              const updated = dataService.updateUser(user.uid, (u) => ({
                ...u,
                preferences: {...u.preferences, easyMove: !u.preferences.easyMove},
              }));
              if (updated) setUser(updated);
            }}
          />
        )}

        {route === 'mission' && user && (
          <StationMission
            user={user}
            stationId={activeStation}
            mocId={activeMocId}
            initialStepIndex={missionStartStep}
            onUserUpdated={setUser}
            onMocPassed={handleMocPassed}
            onBackToMap={() => navigate('map')}
            onGoToBoss={() => {
              if (!dataService.canUserChallengeMocBoss(user.uid, activeMocId)) return;
              setBossStartHit(0);
              setBossStartHp(100);
              navigate('boss');
            }}
          />
        )}

        {route === 'boss' && user && (
          <BossBattle
            user={user}
            stationId={activeStation}
            mocId={activeMocId}
            initialHitIndex={bossStartHit}
            initialBossHp={bossStartHp}
            onUserUpdated={setUser}
            onMocPassed={handleMocPassed}
            onBackToMap={() => navigate('map')}
          />
        )}

        {route === 'practice' && user && (
          <PracticeScreen user={user} onUserUpdated={setUser} />
        )}

        {route === 'inventory' && user && (
          <InventoryScreen
            user={user}
            onEquipOutfit={(outfitId) => {
              const updated = dataService.updateUser(user.uid, (u) => ({
                ...u,
                avatar: {...u.avatar, outfitId},
              }));
              if (updated) setUser(updated);
            }}
          />
        )}

        {route === 'progress' && user && (
          <ProgressBook user={user} onGoToPractice={() => navigate('practice')} />
        )}

        {route === 'profile' && user && (
          <ProfileScreen
            user={user}
            onEditAvatar={() => navigate('avatar_create')}
            onUpdatePreferences={(patch) => {
              const updated = dataService.updateUser(user.uid, (u) => ({
                ...u,
                preferences: {...u.preferences, ...patch},
              }));
              if (updated) setUser(updated);
            }}
            onToggleLeaderboard={() => {
              const updated = dataService.updateUser(user.uid, (u) => ({
                ...u,
                leaderboardOptIn: !u.leaderboardOptIn,
              }));
              if (updated) setUser(updated);
            }}
            onOpenAdmin={() => {
              setPreviewingAsStudent(false);
              navigate('admin');
            }}
            onOpenSelfTest={() => navigate('selftest')}
            onLogout={() => {
              dataService.logout();
              setUser(null);
              setPreviewingAsStudent(false);
              navigate('intro');
            }}
          />
        )}

        {route === 'admin' && user && canAccessAdmin(user) && (
          <AdminPanel
            user={user}
            onExitAdmin={() => navigate('map')}
            onPreviewAsStudent={() => {
              setPreviewingAsStudent(true);
              navigate('map');
            }}
            onOpenMapAlign={() => {
              if (canEditSettingsOrUsers(user)) navigate('map_align');
            }}
            onRefreshApp={() => {
              const latest = dataService.getCurrentUser();
              if (latest) setUser(latest);
            }}
          />
        )}

        {route === 'map_align' && user && canEditSettingsOrUsers(user) && (
          <MapAlignScreen
            user={user}
            onBack={() => navigate('admin')}
            onSaved={() => {
              const latest = dataService.getCurrentUser();
              if (latest) setUser(latest);
            }}
          />
        )}
      </div>

      {/* Subtle Desktop Footer inside shell */}
      {showMainShell && (
        <footer className="hidden md:block text-center py-3 text-xs text-[#5B6B82] border-t border-[#E5D3A8] no-print">
          {APP_NAME} · {ORG_INFO.chapterTitle}
        </footer>
      )}

      {/* Mobile 5-Tab Bottom Navigation Bar (safe-area, >= 44px targets) */}
      {showMainShell && user && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#FFFBF0] border-t-2 border-[#D5B87E] pb-safe no-print"
          aria-label="Thanh điều hướng điện thoại"
        >
          <div className="grid grid-cols-5 px-1 pt-1">
            {[
              {id: 'map' as const, label: 'Bản đồ', icon: Compass},
              {id: 'practice' as const, label: 'Luyện', icon: Dumbbell},
              {id: 'inventory' as const, label: 'Túi đồ', icon: Backpack},
              {id: 'progress' as const, label: 'Tiến độ', icon: BookOpen},
              {id: 'profile' as const, label: 'Hồ sơ', icon: UserIcon},
            ].map((item) => {
              const Icon = item.icon;
              const active =
                route === item.id ||
                (item.id === 'map' && ['scene', 'mission', 'boss'].includes(route));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[11px] font-bold ${
                    active ? 'text-[#145B4F] bg-[#E6F6F3]' : 'text-[#4B5B73]'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-0.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

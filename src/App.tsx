import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import AdminLogin from './pages/AdminLogin';
import Portal from './pages/Portal';
import Home from './pages/Home';
import ExerciseSetup from './pages/ExerciseSetup';
import ExerciseSession from './pages/ExerciseSession';
import Result from './pages/Result';
import Admin from './pages/Admin';
import ExamSetup from './pages/ExamSetup';
import ExamSession from './pages/ExamSession';
import Stats from './pages/Stats';
import Growth from './pages/Growth';
import ReleaseNotes from './pages/ReleaseNotes';
import Account from './pages/Account';
import Others from './pages/Others';
import About from './pages/About';
import Practice from './pages/Practice';
import ServiceEncyclopedia from './pages/ServiceEncyclopedia';
import DailyServiceRevealModal from './components/DailyServiceRevealModal';
import ConfirmDelete from './pages/ConfirmDelete';
import { API_ENDPOINT } from './constants';
import { getCached, setCached } from './utils/cache';

Amplify.configure(awsExports);

// ── 日めくりサービス解放（どの画面でも・アプリ起動時に実行） ──────────────────
function DailyServiceUnlocker({ onNewUnlock }: { onNewUnlock: (svc: any) => void }) {
  const { user } = useAuth();

  useEffect(() => {
    const uid = user?.userId ?? 'guest';
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cacheKey = `daily_service_${uid}_${jstDate}`;

    // 旧共有キー → ユーザー別キーへの移行
    if (localStorage.getItem(`encyclopediaUnlocked_${uid}`) === null) {
      const shared = localStorage.getItem('encyclopediaUnlocked');
      if (shared !== null) localStorage.setItem(`encyclopediaUnlocked_${uid}`, shared);
      const sharedDate = localStorage.getItem('encyclopediaUnlockDate');
      if (sharedDate !== null) localStorage.setItem(`encyclopediaUnlockDate_${uid}`, sharedDate);
      const sharedTodayId = localStorage.getItem('encyclopediaTodayServiceId');
      if (sharedTodayId !== null) localStorage.setItem(`encyclopediaTodayServiceId_${uid}`, sharedTodayId);
    }

    const isNewDay = localStorage.getItem(`encyclopediaUnlockDate_${uid}`) !== jstDate;

    const unlock = (svc: any) => {
      try {
        const stored = JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}');
        stored[svc.serviceId] = svc;
        localStorage.setItem('encyclopediaServices', JSON.stringify(stored));
        const unlocked = JSON.parse(localStorage.getItem(`encyclopediaUnlocked_${uid}`) ?? '{}');
        if (!(svc.serviceId in unlocked)) {
          unlocked[svc.serviceId] = jstDate;
          localStorage.setItem(`encyclopediaUnlocked_${uid}`, JSON.stringify(unlocked));
        }
        localStorage.setItem(`encyclopediaUnlockDate_${uid}`, jstDate);
        localStorage.setItem(`encyclopediaTodayServiceId_${uid}`, svc.serviceId);
        window.dispatchEvent(new CustomEvent('encyclopediaUpdated'));
      } catch {}
    };

    const syncToServer = (userId: string) => {
      try {
        const local: Record<string, string> = JSON.parse(localStorage.getItem(`encyclopediaUnlocked_${uid}`) ?? '{}');
        const unlockDate = localStorage.getItem(`encyclopediaUnlockDate_${uid}`);
        const todayServiceId = localStorage.getItem(`encyclopediaTodayServiceId_${uid}`);
        fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks?userId=${encodeURIComponent(userId)}`)
          .then(r => r.ok ? r.json() : { unlocks: {} })
          .then(data => {
            const merged: Record<string, string> = { ...(data.unlocks ?? {}), ...local };
            localStorage.setItem(`encyclopediaUnlocked_${uid}`, JSON.stringify(merged));
            window.dispatchEvent(new CustomEvent('encyclopediaUpdated'));
            return fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, unlocks: merged, unlockDate, todayServiceId }),
            });
          })
          .catch(() => {});
      } catch {}
    };

    // 今日すでに解放済みならサーバー同期だけ行う
    if (!isNewDay) {
      if (user) syncToServer(user.userId);
      return;
    }

    // キャッシュがあればそれを使って解放
    const cached = getCached<any>(cacheKey);
    if (cached !== null) {
      unlock(cached);
      if (isNewDay) onNewUnlock(cached);
      if (user) syncToServer(user.userId);
      return;
    }

    // APIから取得して解放（ログイン済みならuserIdを渡してユーザー別サービスを取得）
    const apiUrl = user?.userId
      ? `${API_ENDPOINT}/daily-service?userId=${encodeURIComponent(user.userId)}`
      : `${API_ENDPOINT}/daily-service`;
    fetch(apiUrl)
      .then(r => r.json())
      .then(d => {
        const s = d.service ?? null;
        if (!s) return;
        setCached(cacheKey, s, 60 * 60 * 1000);
        unlock(s);
        onNewUnlock(s);
        if (user) syncToServer(user.userId);
      })
      .catch(() => {});
  }, [user?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg-main)', gap: 28,
        animation: 'sherpa-fade-in 0.2s ease-out',
      }}>
        <img src="/mugen-icon.png" alt="AWS資格無限ノック" style={{ width: 'auto', height: 56, objectFit: 'contain' }} />
        <div className="sherpa-spinner" />
      </div>
    );
  }
  return <>{children}</>;
}

// BrowserRouter 内で useNavigate が使えるように内部コンポーネントに分離
function AppInner() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [revealService, setRevealService] = useState<any>(null);

  return (
    <>
      <DailyServiceUnlocker onNewUnlock={setRevealService} />
      <AuthGate>
        <Routes>
          <Route path="/" element={<Portal />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/aws/" element={<Layout><Home /></Layout>} />
          <Route path="/aws/exercise/setup" element={<Layout><ExerciseSetup /></Layout>} />
          <Route path="/aws/exercise/session" element={<Layout><ExerciseSession /></Layout>} />
          <Route path="/aws/result" element={<Layout><Result /></Layout>} />
          <Route path="/aws/exam/setup" element={<Layout><ExamSetup /></Layout>} />
          <Route path="/aws/exam/session" element={<Layout><ExamSession /></Layout>} />
          <Route path="/aws/practice" element={<Layout><Practice /></Layout>} />
          <Route path="/aws/encyclopedia" element={<Layout><ServiceEncyclopedia /></Layout>} />
          <Route path="/aws/growth" element={<Layout><Growth /></Layout>} />
          <Route path="/aws/release-notes" element={<Layout><ReleaseNotes /></Layout>} />
          <Route path="/aws/others" element={<Layout><Others /></Layout>} />
          <Route path="/about" element={<Layout><About /></Layout>} />
          <Route path="/confirm-delete" element={<ConfirmDelete />} />
          <Route path="/admin" element={
            <AdminRoute><AdminLayout><Admin /></AdminLayout></AdminRoute>
          } />
          <Route path="/aws/stats" element={
            <PrivateRoute><Layout><Stats /></Layout></PrivateRoute>
          } />
          <Route path="/account" element={
            <PrivateRoute><Account /></PrivateRoute>
          } />
        </Routes>
      </AuthGate>

      {revealService && (
        <DailyServiceRevealModal
          service={revealService}
          lang={lang}
          onClose={() => setRevealService(null)}
          onNavigateEncyclopedia={() => {
            setRevealService(null);
            navigate('/aws/encyclopedia');
          }}
          onStartExercise={() => {
            setRevealService(null);
            navigate('/aws/');
          }}
        />
      )}
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
    <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <AppInner />
      </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;

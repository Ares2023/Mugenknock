import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { API_ENDPOINT } from './constants';
import { getCached, setCached } from './utils/cache';
import { LanguageProvider } from './contexts/LanguageContext';
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

Amplify.configure(awsExports);

// 日めくりAWSサービスの解放をアプリ起動時に行う（どの画面からでも解放されるようにする）
function DailyServiceUnlocker() {
  const { user } = useAuth();

  useEffect(() => {
    const jstDate = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cacheKey = `daily_service_${jstDate}`;

    const unlock = (svc: any) => {
      try {
        const stored = JSON.parse(localStorage.getItem('encyclopediaServices') ?? '{}');
        stored[svc.serviceId] = svc;
        localStorage.setItem('encyclopediaServices', JSON.stringify(stored));
        const unlocked = JSON.parse(localStorage.getItem('encyclopediaUnlocked') ?? '{}');
        if (!(svc.serviceId in unlocked)) {
          unlocked[svc.serviceId] = jstDate;
          localStorage.setItem('encyclopediaUnlocked', JSON.stringify(unlocked));
        }
        localStorage.setItem('encyclopediaUnlockDate', jstDate);
        localStorage.setItem('encyclopediaTodayServiceId', svc.serviceId);
        window.dispatchEvent(new CustomEvent('encyclopediaUpdated'));
      } catch {}
    };

    const syncToServer = (userId: string) => {
      try {
        const local: Record<string, string> = JSON.parse(localStorage.getItem('encyclopediaUnlocked') ?? '{}');
        const unlockDate = localStorage.getItem('encyclopediaUnlockDate');
        const todayServiceId = localStorage.getItem('encyclopediaTodayServiceId');
        fetch(`${API_ENDPOINT}/users/me/encyclopedia-unlocks?userId=${encodeURIComponent(userId)}`)
          .then(r => r.ok ? r.json() : { unlocks: {} })
          .then(data => {
            const merged: Record<string, string> = { ...(data.unlocks ?? {}), ...local };
            localStorage.setItem('encyclopediaUnlocked', JSON.stringify(merged));
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
    if (localStorage.getItem('encyclopediaUnlockDate') === jstDate) {
      if (user) syncToServer(user.userId);
      return;
    }

    // キャッシュがあればそれを使って解放
    const cached = getCached<any>(cacheKey);
    if (cached !== null) {
      unlock(cached);
      if (user) syncToServer(user.userId);
      return;
    }

    // APIから取得して解放
    fetch(`${API_ENDPOINT}/daily-service`)
      .then(r => r.json())
      .then(d => {
        const s = d.service ?? null;
        if (!s) return;
        setCached(cacheKey, s, 60 * 60 * 1000);
        unlock(s);
        if (user) syncToServer(user.userId);
      })
      .catch(() => {});
  }, [user?.userId]);

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

function App() {
  return (
    <ThemeProvider>
    <LanguageProvider>
    <AuthProvider>
      <DailyServiceUnlocker />
      <AuthGate>
      <BrowserRouter>
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
      </BrowserRouter>
      </AuthGate>
    </AuthProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;

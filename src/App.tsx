import React from 'react';
import { HelmetProvider } from 'react-helmet-async';
import ErrorBoundary from './components/ErrorBoundary';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import MyPage from './pages/MyPage';
import Growth from './pages/Growth';
import ReleaseNotes from './pages/ReleaseNotes';
import Account from './pages/Account';
import Others from './pages/Others';
import About from './pages/About';
import Practice from './pages/Practice';
import ServiceEncyclopedia from './pages/ServiceEncyclopedia';
import PublicEncyclopedia from './pages/PublicEncyclopedia';
import SampleQuiz from './pages/SampleQuiz';
import ConfirmDelete from './pages/ConfirmDelete';
import ExamDashboard from './pages/ExamDashboard';

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
        <img src="/mugen-icon.png" alt="無限ノック" style={{ width: 'auto', height: 56, objectFit: 'contain' }} />
        <div className="sherpa-spinner" />
      </div>
    );
  }
  return <>{children}</>;
}

function TargetExamRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user && !localStorage.getItem(`targetExam_${user.userId}`)) {
    return <Navigate to="/aws/" replace />;
  }
  return <>{children}</>;
}


// BrowserRouter 内で useNavigate が使えるように内部コンポーネントに分離
function AppInner() {
  const { lang } = useLanguage();

  return (
    <>
      <AuthGate>
        <Routes>
          <Route path="/" element={<Portal />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/aws/" element={<Layout><Home /></Layout>} />
          <Route path="/aws/exercise/setup" element={<TargetExamRoute><Layout><ExerciseSetup /></Layout></TargetExamRoute>} />
          <Route path="/aws/exercise/session" element={<TargetExamRoute><Layout><ExerciseSession /></Layout></TargetExamRoute>} />
          <Route path="/aws/result" element={<TargetExamRoute><Layout><Result /></Layout></TargetExamRoute>} />
          <Route path="/aws/exam/setup" element={<TargetExamRoute><Layout><ExamSetup /></Layout></TargetExamRoute>} />
          <Route path="/aws/exam/session" element={<TargetExamRoute><Layout><ExamSession /></Layout></TargetExamRoute>} />
          <Route path="/aws/practice" element={<TargetExamRoute><Layout><Practice /></Layout></TargetExamRoute>} />
          <Route path="/aws/encyclopedia" element={<TargetExamRoute><Layout><ServiceEncyclopedia /></Layout></TargetExamRoute>} />
          <Route path="/aws/growth" element={<TargetExamRoute><Layout><Growth /></Layout></TargetExamRoute>} />
          <Route path="/aws/release-notes" element={<TargetExamRoute><Layout><ReleaseNotes /></Layout></TargetExamRoute>} />
          <Route path="/aws/others" element={<TargetExamRoute><Layout><Others /></Layout></TargetExamRoute>} />
          <Route path="/aws/exam-dashboard" element={<TargetExamRoute><ExamDashboard /></TargetExamRoute>} />
          <Route path="/encyclopedia" element={<PublicEncyclopedia />} />
          <Route path="/sample" element={<SampleQuiz />} />
          <Route path="/sample/:exam" element={<SampleQuiz />} />
          <Route path="/about" element={<Layout><About /></Layout>} />
          <Route path="/confirm-delete" element={<ConfirmDelete />} />
          <Route path="/admin" element={
            <AdminRoute><AdminLayout><Admin /></AdminLayout></AdminRoute>
          } />
          <Route path="/aws/stats" element={
            <PrivateRoute><TargetExamRoute><Layout><Stats /></Layout></TargetExamRoute></PrivateRoute>
          } />
          <Route path="/aws/mypage" element={
            <PrivateRoute><TargetExamRoute><Layout><MyPage /></Layout></TargetExamRoute></PrivateRoute>
          } />
          <Route path="/account" element={
            <PrivateRoute><Account /></PrivateRoute>
          } />
        </Routes>
      </AuthGate>

    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <HelmetProvider>
    <BrowserRouter>
    <AuthProvider>
    <ThemeProvider>
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
    </ThemeProvider>
    </AuthProvider>
    </BrowserRouter>
    </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import AdminLogin from './pages/AdminLogin';
import Home from './pages/Home';
import QuestionList from './pages/QuestionList';
import ExerciseSetup from './pages/ExerciseSetup';
import ExerciseSession from './pages/ExerciseSession';
import Result from './pages/Result';
import Admin from './pages/Admin';
import ExamSetup from './pages/ExamSetup';
import ExamSession from './pages/ExamSession';
import Stats from './pages/Stats';
import Growth from './pages/Growth';
import Architecture from './pages/Architecture';
import ReleaseNotes from './pages/ReleaseNotes';
import Account from './pages/Account';

Amplify.configure(awsExports);

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
        <img src="/logo_sherpa_image_t.png" alt="Sherpa" style={{ width: 72, height: 72, objectFit: 'contain' }} />
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
      <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/" element={<Layout><Home /></Layout>} />
          <Route path="/questions" element={<Layout><QuestionList /></Layout>} />
          <Route path="/exercise/setup" element={<Layout><ExerciseSetup /></Layout>} />
          <Route path="/exercise/session" element={<Layout><ExerciseSession /></Layout>} />
          <Route path="/result" element={<Layout><Result /></Layout>} />
          <Route path="/exam/setup" element={<Layout><ExamSetup /></Layout>} />
          <Route path="/exam/session" element={<Layout><ExamSession /></Layout>} />
          <Route path="/growth" element={<Layout><Growth /></Layout>} />
          <Route path="/architecture" element={<Layout><Architecture /></Layout>} />
          <Route path="/release-notes" element={<Layout><ReleaseNotes /></Layout>} />
          <Route path="/admin" element={
            <AdminRoute><AdminLayout><Admin /></AdminLayout></AdminRoute>
          } />
          <Route path="/stats" element={
            <PrivateRoute><Layout><Stats /></Layout></PrivateRoute>
          } />
          <Route path="/account" element={
            <PrivateRoute><Layout><Account /></Layout></PrivateRoute>
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

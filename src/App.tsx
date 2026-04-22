import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Home from './pages/Home';
import QuestionList from './pages/QuestionList';
import ExerciseSetup from './pages/ExerciseSetup';
import ExerciseSession from './pages/ExerciseSession';
import Result from './pages/Result';
import Admin from './pages/Admin';
import ExamSetup from './pages/ExamSetup';
import ExamSession from './pages/ExamSession';
import Stats from './pages/Stats';
import Architecture from './pages/Architecture';
import ReleaseNotes from './pages/ReleaseNotes';

Amplify.configure(awsExports);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Layout><Home /></Layout>} />
          <Route path="/questions" element={<Layout><QuestionList /></Layout>} />
          <Route path="/exercise/setup" element={<Layout><ExerciseSetup /></Layout>} />
          <Route path="/exercise/session" element={<Layout><ExerciseSession /></Layout>} />
          <Route path="/result" element={<Layout><Result /></Layout>} />
          <Route path="/exam/setup" element={<Layout><ExamSetup /></Layout>} />
          <Route path="/exam/session" element={<Layout><ExamSession /></Layout>} />
          <Route path="/architecture" element={<Layout><Architecture /></Layout>} />
          <Route path="/release-notes" element={<Layout><ReleaseNotes /></Layout>} />
          <Route path="/admin" element={
            <PrivateRoute><Layout><Admin /></Layout></PrivateRoute>
          } />
          <Route path="/stats" element={
            <PrivateRoute><Layout><Stats /></Layout></PrivateRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

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

Amplify.configure(awsExports);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <PrivateRoute>
              <Layout><Home /></Layout>
            </PrivateRoute>
          } />
          <Route path="/questions" element={
            <Layout><QuestionList /></Layout>
          } />
          <Route path="/exercise/setup" element={
            <PrivateRoute>
              <Layout><ExerciseSetup /></Layout>
            </PrivateRoute>
          } />
          <Route path="/exercise/session" element={
            <PrivateRoute>
              <Layout><ExerciseSession /></Layout>
            </PrivateRoute>
          } />
          <Route path="/result" element={
            <PrivateRoute>
              <Layout><Result /></Layout>
            </PrivateRoute>
          } />
          <Route path="/admin" element={
            <PrivateRoute>
              <Layout><Admin /></Layout>
            </PrivateRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

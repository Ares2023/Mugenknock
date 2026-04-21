import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/LoginPage';
import Home from './pages/Home';
import QuestionList from './pages/QuestionList';
import ExerciseSetup from './pages/ExerciseSetup';
import ExerciseSession from './pages/ExerciseSession';
import Result from './pages/Result';

Amplify.configure(awsExports);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/questions" element={<QuestionList />} />
          <Route path="/" element={
            <PrivateRoute><Home /></PrivateRoute>
          } />
          <Route path="/exercise/setup" element={
            <PrivateRoute><ExerciseSetup /></PrivateRoute>
          } />
          <Route path="/exercise/session" element={
            <PrivateRoute><ExerciseSession /></PrivateRoute>
          } />
          <Route path="/result" element={
            <PrivateRoute><Result /></PrivateRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

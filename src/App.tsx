import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import QuestionList from './pages/QuestionList';
import Home from './pages/Home';
import ExerciseSetup from './pages/ExerciseSetup';
import ExerciseSession from './pages/ExerciseSession';
import Result from './pages/Result';

Amplify.configure(awsExports);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/questions" element={<QuestionList />} />
        <Route path="/exercise/setup" element={<ExerciseSetup />} />
        <Route path="/exercise/session" element={<ExerciseSession />} />
        <Route path="/result" element={<Result />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

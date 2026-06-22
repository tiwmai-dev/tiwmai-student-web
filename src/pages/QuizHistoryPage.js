import React from 'react';
import QuizAnalysisPage from './QuizAnalysisPage';

const QuizHistoryPage = ({ user }) => {
  return <QuizAnalysisPage user={user} initialTab="history" />;
};

export default QuizHistoryPage;

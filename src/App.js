import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import './styles/App.css';
import AuthCallbackPage from './pages/AuthCallbackPage';
import HomePage from './pages/HomePage';
import LegalPage from './pages/LegalPage';
import DashboardPage from './pages/DashboardPage';
import StudentRankingPage from './pages/StudentRankingPage';
import CoursePage from './pages/CoursePage';
import PaymentPage from './pages/PaymentPage';
import PaymentHistoryPage from './pages/PaymentHistoryPage';
import LessonPage from './pages/LessonPage';
import QuizHistoryPage from './pages/QuizHistoryPage';
import QuizAnalysisPage from './pages/QuizAnalysisPage';
import MockExamPage from './pages/MockExamPage';
import ChatTutorPage from './pages/ChatTutorPage';
import AuthModal from './components/AuthModal';
import StudentOnboardingModal from './components/StudentOnboardingModal';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoading from './components/PageLoading';
import LandingFooter from './components/LandingFooter';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { trackPageView } from './utils/analytics';

const DISPLAY_SETTINGS_KEY = 'student_display_preferences_v1';

const applyStoredDisplaySettings = () => {
  try {
    const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const fontSize = ['small', 'medium', 'large'].includes(parsed?.fontSize)
      ? parsed.fontSize
      : 'medium';
    const theme = ['light', 'dark'].includes(parsed?.theme)
      ? parsed.theme
      : 'light';
    document.documentElement.setAttribute('data-student-font-size', fontSize);
    document.documentElement.setAttribute('data-student-theme', theme);
    document.documentElement.setAttribute(
      'data-student-reduced-motion',
      parsed?.reduceMotion ? 'true' : 'false'
    );
  } catch (_) {
    document.documentElement.setAttribute('data-student-font-size', 'medium');
    document.documentElement.setAttribute('data-student-theme', 'light');
    document.documentElement.setAttribute('data-student-reduced-motion', 'false');
  }
};

// Main app component that uses auth context
function AuthRouteStateHandler({ onShowAuth }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const authMode = location.state?.authMode;
    if (authMode !== 'login' && authMode !== 'register') return;

    onShowAuth(authMode);
    navigate(location.pathname, {
      replace: true,
      state: {
        ...location.state,
        authMode: undefined,
      },
    });
  }, [location.pathname, location.state, navigate, onShowAuth]);

  return null;
}

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

function AppFooter({ user }) {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  const isLegalPage = location.pathname === '/terms' || location.pathname === '/privacy';

  if (!user && isLandingPage) return null;
  if (user || isLegalPage) return <LandingFooter />;

  return <footer className="app-footer">T&P AITech Co, Ltd.</footer>;
}

function AppContent() {
  const { user, isBootstrapping, saveOnboardingProfile } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');

  useEffect(() => {
    applyStoredDisplaySettings();
  }, []);

  const handleShowAuth = (mode = 'login') => {
    setAuthModalMode(mode);
    setShowAuthModal(true);
  };

  const handleCloseAuth = () => {
    setShowAuthModal(false);
  };

  const isOnboardingRequired = Boolean(user) && user?.onboarding?.status === 'incomplete';

  const handleCompleteOnboarding = async (payload) => {
    return await saveOnboardingProfile(payload);
  };

  const renderProtected = (element, loadingLabel = 'กำลังโหลด...') => {
    if (isBootstrapping) return <PageLoading label={loadingLabel} />;
    return user ? element : <Navigate to="/" replace />;
  };
  return (
    <div className={`App ${user ? 'app-auth' : 'app-guest'}`}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AnalyticsRouteTracker />
        <AuthRouteStateHandler onShowAuth={handleShowAuth} />
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route 
            path="/login" element={<Navigate to="/" replace />} />
          <Route 
            path="/dashboard" 
            element={renderProtected(<DashboardPage user={user} />, 'กำลังโหลดแดชบอร์ด...')} 
          />
          <Route
            path="/terms"
            element={<LegalPage onShowAuth={handleShowAuth} documentType="terms" />}
          />
          <Route
            path="/privacy"
            element={<LegalPage onShowAuth={handleShowAuth} documentType="privacy" />}
          />
          <Route
            path="/ranking"
            element={renderProtected(<StudentRankingPage user={user} />, 'กำลังโหลดอันดับ...')}
          />
          <Route
            path="/payment-history"
            element={renderProtected(<PaymentHistoryPage user={user} />, 'กำลังโหลดประวัติการชำระเงิน...')}
          />
          <Route
            path="/chat"
            element={renderProtected(<ChatTutorPage user={user} />, 'กำลังโหลดห้องแชท...')}
          />
          <Route 
            path="/course/:courseId" 
            element={renderProtected(<CoursePage user={user} />, 'กำลังโหลดคอร์ส...')} 
          />
          <Route
            path="/course/:courseId/payment"
            element={renderProtected(<PaymentPage user={user} />, 'กำลังโหลดข้อมูลคอร์ส...')}
          />
          <Route 
            path="/course/:courseId/lesson/:lessonId" 
            element={renderProtected(<LessonPage user={user} />, 'กำลังโหลดบทเรียน...')} 
          />
          <Route
            path="/course/:courseId/mock-exam/:quizId"
            element={renderProtected(<MockExamPage user={user} />, 'กำลังโหลดแบบทดสอบ...')}
          />
          <Route
            path="/course/:courseId/mock-exam/:quizId/analysis"
            element={renderProtected(<QuizAnalysisPage user={user} />, 'กำลังโหลดผลวิเคราะห์...')}
          />
          <Route
            path="/course/:courseId/lesson/:lessonId/quiz/:quizId/analysis"
            element={renderProtected(<QuizAnalysisPage user={user} />, 'กำลังโหลดผลวิเคราะห์...')}
          />
          <Route
            path="/course/:courseId/lesson/:lessonId/quiz/:quizId/history"
            element={renderProtected(<QuizHistoryPage user={user} />, 'กำลังโหลดประวัติแบบทดสอบ...')} 
          />
          <Route 
            path="/" 
            element={
              isBootstrapping
                ? <PageLoading label="กำลังโหลด..." />
                : (user ? <Navigate to="/dashboard" replace /> : <HomePage onShowAuth={handleShowAuth} />)
            } 
          />
        </Routes>
        <AppFooter user={user} />
      </Router>

      <AuthModal
        isOpen={showAuthModal}
        onClose={handleCloseAuth}
        initialMode={authModalMode}
      />
      <StudentOnboardingModal
        isOpen={isOnboardingRequired}
        initialProfile={user?.onboarding?.profile}
        onComplete={handleCompleteOnboarding}
      />
    </div>
  );
}

// Main App component with AuthProvider
function App() {
  return (
    <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

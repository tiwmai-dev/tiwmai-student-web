import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import ErrorBoundary from '../components/ErrorBoundary';
import QuizInterface from '../components/QuizInterface';
import { secureAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { extractQuestionContextText } from '../utils/questionContext';

const MockExamLoadingSkeleton = () => (
  <div
    className="mock-exam-loading-shell"
    role="status"
    aria-live="polite"
    aria-label="กำลังโหลดแบบทดสอบจำลอง"
  >
    <div className="mock-exam-loading-stage" aria-hidden="true">
      <div className="mock-exam-loading-stage-head">
        <span className="mock-exam-loading-skeleton chip short" />
        <span className="mock-exam-loading-skeleton line w-46" />
        <span className="mock-exam-loading-skeleton line w-68" />
      </div>

      <div className="mock-exam-loading-toolbar">
        <span className="mock-exam-loading-skeleton chip" />
        <span className="mock-exam-loading-skeleton chip short" />
        <span className="mock-exam-loading-skeleton line w-18 right" />
      </div>

      <div className="mock-exam-loading-body">
        <aside className="mock-exam-loading-sidebar">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <span key={`mock-exam-loading-nav-${index}`} className="mock-exam-loading-skeleton nav-chip" />
          ))}
        </aside>

        <section className="mock-exam-loading-main">
          <span className="mock-exam-loading-skeleton line w-30" />
          <span className="mock-exam-loading-skeleton line w-94 tall" />
          <span className="mock-exam-loading-skeleton line w-80" />

          <div className="mock-exam-loading-options">
            {[0, 1, 2, 3].map((index) => (
              <div key={`mock-exam-loading-option-${index}`} className="mock-exam-loading-option">
                <span className="mock-exam-loading-skeleton choice-dot" />
                <div className="mock-exam-loading-option-copy">
                  <span className="mock-exam-loading-skeleton line w-82" />
                  <span className="mock-exam-loading-skeleton line w-58" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mock-exam-loading-footer">
        <span className="mock-exam-loading-skeleton button ghost" />
        <span className="mock-exam-loading-skeleton button" />
      </div>
    </div>
  </div>
);

const MockExamPage = ({ user }) => {
  const { courseId, quizId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialQuiz, setInitialQuiz] = useState(null);
  const [courseName, setCourseName] = useState('');

  const handleSelectHeaderTab = (tab) => {
    if (tab === 'browse') {
      navigate('/dashboard', { state: { activeTab: 'browse' } });
      return;
    }
    if (tab === 'analysis') {
      navigate('/dashboard', { state: { activeTab: 'analysis' } });
      return;
    }
    navigate('/dashboard');
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const userId = (user?.user_id || user?.id || user?.username || user?.studentId || '').toString();
        const data = await secureAPI.courseAPI.getQuizById(quizId, {
          userId: userId || undefined,
          courseId: courseId || undefined,
        });
        let enrolledCourses = [];
        if (userId) {
          try {
            enrolledCourses = await secureAPI.courseAPI.getUserCourses(userId);
          } catch (courseError) {
            console.warn('Failed to load enrolled courses for mock exam breadcrumb:', courseError);
          }
        }
        // Normalize to QuizInterface shape
        const rawQuestions = Array.isArray(data?.questions) ? data.questions : [];
        const matchedCourse = Array.isArray(enrolledCourses)
          ? enrolledCourses.find((item) => String(item?.id || item?.course_id || '') === String(courseId))
          : null;
        const resolvedCourseName = (
          matchedCourse?.name
          || matchedCourse?.title
          || data?.course_name
          || data?.course_title
          || data?.courseName
          || ''
        ).toString().trim();
        const toIndex = (val, optionsLen) => {
          if (typeof val === 'number') return Math.max(0, Math.min(optionsLen - 1, val));
          const s = String(val || '').trim().toLowerCase();
          const map = { 'a':0,'ก':0,'1':0,'b':1,'ข':1,'2':1,'c':2,'ค':2,'3':2,'d':3,'ง':3,'4':3 };
          if (s in map) return map[s];
          const m = s.match(/(\d+)/);
          if (m) {
            const n = parseInt(m[1], 10) - 1;
            if (!Number.isNaN(n)) return Math.max(0, Math.min(optionsLen - 1, n));
          }
          return 0;
        };
        const normalized = {
          id: data.quiz_id || data.id || quizId,
          title: data.title || 'ข้อสอบจำลอง',
          description: data.description || '',
          timeLimit: (data.duration_minutes && Number(data.duration_minutes)) || 20,
          questions: rawQuestions.map((q, idx) => {
            const options = Array.isArray(q.choices) ? q.choices : (Array.isArray(q.options) ? q.options : []);
            return {
              ...q,
              id: q.id || `q${idx+1}`,
              context: extractQuestionContextText(q),
              question: q.question || q.text || '',
              options,
              correctAnswer: toIndex(q.correct_answer ?? q.correctAnswer ?? q.answer_index, options.length),
              explanation: q.explanation || ''
            };
          })
        };
        setCourseName(resolvedCourseName);
        setInitialQuiz(normalized);
        setError(null);
      } catch (e) {
        console.error('Failed to load practice exam:', e);
        setError('ไม่พบข้อสอบจำลองหรือไม่สามารถโหลดได้');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [courseId, quizId, user]);

  return (
    <ErrorBoundary>
      <div className="course-page">
        <Header user={user} onLogout={logout} activeTab="courses" onSelectTab={handleSelectHeaderTab} />

        <section className="course-hero lesson-breadcrumb-hero mock-exam-breadcrumb-hero">
          <div className="course-hero-inner mock-exam-hero-inner">
            <div className="course-breadcrumb">
              <Link className="course-breadcrumb-link" to="/dashboard">หน้าแรก</Link>
              <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
              <Link className="course-breadcrumb-link" to={`/course/${courseId}`}>{courseName || 'คอร์สเรียน'}</Link>
              <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
              <span className="course-breadcrumb-item">ข้อสอบจำลอง</span>
              <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
              <span className="course-breadcrumb-current">{initialQuiz?.title || 'กำลังโหลดข้อสอบ'}</span>
            </div>
          </div>
        </section>

        <div className="course-content mock-exam-content">
          {loading ? (
            <MockExamLoadingSkeleton />
          ) : error ? (
            <div className="error-state">{error}</div>
          ) : (
            <div className="mock-exam-stage">
              <div className="mock-exam-stage-body">
                <QuizInterface
                  course={{ id: courseId, name: courseName || '' }}
                  lessonId={null}
                  user={user}
                  initialQuiz={initialQuiz}
                  onBackToCourse={() => navigate(`/course/${courseId}`)}
                  hideHints
                  hideDifficulty
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default MockExamPage;

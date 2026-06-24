import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import ErrorBoundary from '../components/ErrorBoundary';
import ChatInterface from '../components/ChatInterface';
import QuizInterface from '../components/QuizInterface';
import ExamRecommendation from '../components/ExamRecommendation';
import ExamCard from '../components/ExamCard';
import { secureAPI } from '../utils/api';
import { saveLatestLessonActivity, readLatestLessonActivity } from '../utils/learningActivity';
import { extractQuestionContextText } from '../utils/questionContext';
import { buildQuizRecommendation } from '../utils/quizRecommendation';
import { trackEvent } from '../utils/analytics';

const LessonLoadingBlock = ({ className = '' }) => (
  <span className={`lesson-loading-skeleton ${className}`} aria-hidden="true" />
);

const LessonQuizCardSkeleton = () => (
  <article className="lesson-loading-card" aria-hidden="true">
    <div className="lesson-loading-card-head">
      <div className="lesson-loading-card-title">
        <LessonLoadingBlock className="line tall w-72" />
        <LessonLoadingBlock className="line w-46" />
      </div>
      <div className="lesson-loading-chip-row compact">
        <LessonLoadingBlock className="chip short" />
        <LessonLoadingBlock className="chip" />
      </div>
    </div>
    <div className="lesson-loading-card-body">
      <div className="lesson-loading-card-copy">
        <LessonLoadingBlock className="line w-38" />
        <LessonLoadingBlock className="line w-58" />
        <div className="lesson-loading-button-row">
          <LessonLoadingBlock className="button" />
          <LessonLoadingBlock className="button ghost" />
        </div>
      </div>
      <div className="lesson-loading-score">
        <LessonLoadingBlock className="circle" />
        <LessonLoadingBlock className="line w-68" />
        <LessonLoadingBlock className="line w-52" />
      </div>
    </div>
  </article>
);

const LessonQuizListSkeleton = ({ count = 4, inline = false }) => {
  const cards = Array.from({ length: count }).map((_, index) => (
    <LessonQuizCardSkeleton key={`lesson-quiz-loading-${index}`} />
  ));

  if (inline) return cards;

  return (
    <div className="exam-grid lesson-loading-grid" role="status" aria-label="กำลังโหลดแบบทดสอบ">
      {cards}
    </div>
  );
};

const LessonPageLoadingSkeleton = () => (
  <div className="lessons-tab lesson-loading-shell" role="status" aria-live="polite" aria-busy="true" aria-label="กำลังโหลดบทเรียน">
    <div className="lessons-header lesson-loading-header">
      <LessonLoadingBlock className="line heading w-34" />
      <LessonLoadingBlock className="line w-62" />
    </div>

    <section className="exam-section lesson-loading-section">
      <div className="exam-section-header lesson-loading-section-head">
        <LessonLoadingBlock className="line tall w-24" />
        <LessonLoadingBlock className="line w-44" />
      </div>
      <div className="lesson-loading-recommendation">
        <div className="lesson-loading-recommendation-copy">
          <LessonLoadingBlock className="line w-28" />
          <LessonLoadingBlock className="line heading w-58" />
          <LessonLoadingBlock className="line w-78" />
          <div className="lesson-loading-chip-row">
            <LessonLoadingBlock className="chip" />
            <LessonLoadingBlock className="chip wide" />
            <LessonLoadingBlock className="chip" />
          </div>
          <LessonLoadingBlock className="line w-34" />
        </div>
        <div className="lesson-loading-recommendation-side">
          <LessonLoadingBlock className="media" />
          <LessonLoadingBlock className="button full" />
        </div>
      </div>
    </section>

    <section className="exam-section lesson-loading-section">
      <div className="exam-section-header lesson-loading-section-head">
        <LessonLoadingBlock className="line tall w-22" />
        <LessonLoadingBlock className="line w-52" />
      </div>
      <div className="lesson-loading-toolbar">
        <LessonLoadingBlock className="field" />
        <LessonLoadingBlock className="field" />
        <LessonLoadingBlock className="field" />
      </div>
      <LessonQuizListSkeleton count={4} />
      <div className="lesson-loading-pagination">
        <LessonLoadingBlock className="line w-28" />
        <div className="lesson-loading-button-row">
          <LessonLoadingBlock className="button ghost" />
          <LessonLoadingBlock className="button ghost" />
        </div>
      </div>
    </section>
  </div>
);

const LessonPage = ({ user }) => {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [split, setSplit] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [chatContext, setChatContext] = useState(null);
  const [resultsByQuiz, setResultsByQuiz] = useState({}); // { [quizId]: { attempts, latestScore, lastAt, list: [] } }
  const [quizSearch, setQuizSearch] = useState('');
  const [quizSearchDebounced, setQuizSearchDebounced] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [sortOption, setSortOption] = useState('difficulty_asc');
  const [quizPage, setQuizPage] = useState(1);
  const quizPageSize = 12;
  const [courseTitle, setCourseTitle] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [pagedQuizzes, setPagedQuizzes] = useState([]);
  const [recommendationQuizzes, setRecommendationQuizzes] = useState([]);
  const [quizPagination, setQuizPagination] = useState({
    page: 1,
    page_size: 12,
    total_pages: 1,
    total_filtered: 0,
    has_next: false,
    has_prev: false,
  });
  const chatRef = useRef();
  const quizRef = useRef();
  const lessonViewTrackedRef = useRef(null);

  const handleSelectHeaderTab = (tab) => {
    if (tab === 'ranking') {
      navigate('/ranking');
      return;
    }
    if (tab === 'my-courses') {
      navigate('/dashboard', { state: { activeTab: 'my-courses' } });
      return;
    }
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

  const clampDifficultyStars = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 3;
    return Math.min(5, Math.max(1, Math.round(n)));
  };

  const normalizeDifficultyScore = (value) => {
    if (typeof value === 'number') {
      if (value >= 1 && value <= 5) return clampDifficultyStars(value);
      if (value <= 1) return 2;
      if (value === 2) return 3;
      if (value >= 3) return 4;
    }
    const raw = String(value || '').toLowerCase();
    if (['easy', 'ง่าย', 'low', 'เบา'].includes(raw)) return 2;
    if (['medium', 'กลาง', 'mid', 'normal', 'ปานกลาง'].includes(raw)) return 3;
    if (['hard', 'ยาก', 'high'].includes(raw)) return 4;
    return 3;
  };

  // Helper: fetch history for a single quiz (used by UI)
  const getUserId = () => (
    user?.user_id
    || user?.id
    || user?.username
    || user?.studentId
    || ''
  ).toString();
  const loadResultsForQuiz = async (qid) => {
    if (!qid) return;
    const userId = getUserId();
    try {
      const res = await secureAPI.courseAPI.getQuizResults(userId, qid);
      const list = Array.isArray(res?.results) ? res.results : [];
      const latest = list[0] || null;
      setResultsByQuiz(prev => ({
        ...prev,
        [qid]: {
          attempts: list.length,
          latestScore: latest?.score ?? null,
          lastAt: latest?.submitted_at ?? null,
          list,
        }
      }));
    } catch (_) { /* silent */ }
  };

  const loadResultsForQuizzes = async (quizzes) => {
    const userId = getUserId();
    try {
      const ids = (Array.isArray(quizzes) ? quizzes : [])
        .map(q => (typeof q === 'string' ? q : (q.id || q.quiz_id)))
        .filter(Boolean);
      if (!ids.length) return;
      const idSet = new Set(ids.map((qid) => String(qid)));
      const resultPayload = await secureAPI.courseAPI.getUserQuizResults(userId, {
        courseId: courseId || undefined,
      });
      const groupedResults = (Array.isArray(resultPayload?.results) ? resultPayload.results : []).reduce((acc, item) => {
        const qid = String(item?.quiz_id || '').trim();
        if (!qid || !idSet.has(qid)) {
          return acc;
        }
        if (!acc[qid]) {
          acc[qid] = [];
        }
        acc[qid].push(item);
        return acc;
      }, {});
      const asMap = ids.reduce((acc, qid) => {
        const normalizedId = String(qid);
        const list = Array.isArray(groupedResults[normalizedId]) ? groupedResults[normalizedId] : [];
        const latest = list[0] || null;
        acc[normalizedId] = {
          attempts: list.length,
          latestScore: latest?.score ?? null,
          lastAt: latest?.submitted_at ?? null,
          list,
        };
        return acc;
      }, {});
      setResultsByQuiz(prev => ({ ...prev, ...asMap }));
    } catch (_) {}
  };

  useEffect(() => {
    const normalizeLesson = (l) => {
      const raw = Array.isArray(l?.quizzes) ? l.quizzes : (Array.isArray(l?.selected_quizzes) ? l.selected_quizzes : []);
      const normalized = raw.map((q, idx) => {
        if (typeof q === 'string') {
          return { id: q, title: `แบบทดสอบ ${idx + 1}`, questions: 0 };
        }
        const id = q?.id || q?.quiz_id || q?.document_id || null;
        const title = q?.title || q?.name || `แบบทดสอบ ${idx + 1}`;
        const qCount = Array.isArray(q?.questions) ? q.questions.length : (Number.isInteger(q?.questions) ? q.questions : (q?.total_questions || 0));
        const questionDifficultyAvg = Array.isArray(q?.questions) && q.questions.length
          ? (
            q.questions
              .map(item => Number(item?.difficulty ?? item?.level ?? 0))
              .filter(value => Number.isFinite(value) && value > 0)
              .reduce((sum, value, _, arr) => sum + (value / arr.length), 0)
          )
          : null;
        const effectiveDifficulty = q?.difficulty_avg ?? q?.difficulty ?? q?.level ?? questionDifficultyAvg ?? '';
        return {
          id,
          title,
          questions: qCount,
          purpose: q?.purpose || q?.type || q?.goal || '',
          difficulty: effectiveDifficulty,
          difficultyScore: normalizeDifficultyScore(effectiveDifficulty),
          estimatedMinutes: q?.estimated_minutes || q?.estimatedMinutes || q?.time_limit || q?.timeLimit || null,
          topic: q?.topic || q?.subject || q?.category || '',
          selection_reasons: q?.selection_reasons || q?.reasons || q?.pick_reasons || [],
        };
      });
      return { ...l, quizzes: normalized };
    };

    // loadResultsForQuiz is defined at component scope for use in UI

    const load = async () => {
      try {
        setLoading(true);
        // Try direct lesson endpoint first
        try {
          const res = await secureAPI.courseAPI.getLessonById(lessonId);
          const l = res.lesson || res;
          if (l) {
            const normalized = normalizeLesson(l);
            setLesson(normalized);
            setError(null);
            return;
          }
        } catch (e) {
          // fall through to fallback
        }

        // Fallback: fetch course lessons and locate this lesson
        try {
          const list = await secureAPI.courseAPI.getCourseLessons(courseId, {
            userId: getUserId(),
          });
          const lessons = Array.isArray(list?.lessons) ? list.lessons : [];
          const found = lessons.find((x) => (x.id || x.lesson_id) === lessonId);
          if (found) {
            const normalized = normalizeLesson(found);
            setLesson(normalized);
            setError(null);
            return;
          }
        } catch (_) {}

        setError('ไม่สามารถโหลดบทเรียนได้');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [lessonId, courseId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuizSearchDebounced(quizSearch.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [quizSearch]);

  useEffect(() => {
    const lessonKey = `${courseId}:${lessonId}`;
    if (!lesson || !courseId || !lessonId || lessonViewTrackedRef.current === lessonKey) return;
    lessonViewTrackedRef.current = lessonKey;
    trackEvent('lesson_start', {
      course_id: courseId,
      lesson_id: lessonId,
    });
  }, [courseId, lesson, lessonId]);

  useEffect(() => {
    setQuizPage(1);
  }, [quizSearchDebounced, difficultyFilter, sortOption, lessonId, courseId]);

  useEffect(() => {
    let isActive = true;

    const loadRecommendationQuizzes = async () => {
      if (!courseId || !lesson) return;
      const lessonQuizIds = Array.from(new Set(
        (Array.isArray(lesson?.quizzes) ? lesson.quizzes : [])
          .map((quiz) => (typeof quiz === 'string' ? quiz : (quiz?.id || quiz?.quiz_id || quiz?.document_id)))
          .filter(Boolean)
      ));
      if (!lessonQuizIds.length) {
        setRecommendationQuizzes([]);
        return;
      }

      try {
        const allQuizzes = [];
        let page = 1;
        let totalPages = 1;
        do {
          const response = await secureAPI.courseAPI.getQuizzesByCourse(courseId, {
            userId: getUserId(),
            quizIds: lessonQuizIds,
            page,
            pageSize: 100,
            sort: 'latest',
          });
          const rows = Array.isArray(response?.quizzes) ? response.quizzes : [];
          allQuizzes.push(...rows.filter(
            (quiz) => String(quiz?.document_type || '').toLowerCase() !== 'mock_exam'
          ));
          totalPages = Math.max(1, Number(response?.total_pages) || 1);
          page += 1;
        } while (page <= totalPages);

        if (!isActive) return;
        setRecommendationQuizzes(allQuizzes);
        loadResultsForQuizzes(allQuizzes);
      } catch (err) {
        console.error('Load recommendation quizzes failed', err);
        if (isActive) setRecommendationQuizzes([]);
      }
    };

    loadRecommendationQuizzes();
    return () => {
      isActive = false;
    };
  }, [courseId, lesson]);

  useEffect(() => {
    let isActive = true;

    const loadPagedQuizzes = async () => {
      if (!courseId || !lesson) return;
      setListLoading(true);
      try {
        const lessonQuizIds = Array.from(new Set(
          (Array.isArray(lesson?.quizzes) ? lesson.quizzes : [])
            .map((q) => (typeof q === 'string' ? q : (q?.id || q?.quiz_id || q?.document_id)))
            .filter(Boolean)
        ));
        if (!lessonQuizIds.length) {
          if (!isActive) return;
          setPagedQuizzes([]);
          setQuizPagination({
            page: 1,
            page_size: quizPageSize,
            total_pages: 1,
            total_filtered: 0,
            has_next: false,
            has_prev: false,
          });
          return;
        }
        const response = await secureAPI.courseAPI.getQuizzesByCourse(courseId, {
          userId: getUserId(),
          q: quizSearchDebounced || undefined,
          difficulty: difficultyFilter !== 'all' ? difficultyFilter : undefined,
          sort: sortOption,
          page: quizPage,
          pageSize: quizPageSize,
          quizIds: lessonQuizIds,
        });
        const raw = Array.isArray(response?.quizzes)
          ? response.quizzes.filter((q) => String(q?.document_type || '').toLowerCase() !== 'mock_exam')
          : [];
        const normalized = raw.map((q, idx) => {
          const questionDifficultyAvg = Array.isArray(q?.questions) && q.questions.length
            ? (
              q.questions
                .map(item => Number(item?.difficulty ?? item?.level ?? 0))
                .filter(value => Number.isFinite(value) && value > 0)
                .reduce((sum, value, _, arr) => sum + (value / arr.length), 0)
            )
            : null;
          const effectiveDifficulty = q?.difficulty_avg ?? q?.difficulty ?? q?.level ?? questionDifficultyAvg ?? '';
          return {
            id: q.quiz_id || q.id || q.document_id || `q-${idx}`,
            title: q.title || q.name || `แบบทดสอบ ${idx + 1}`,
            questions: q.total_questions || (Array.isArray(q.questions) ? q.questions.length : 0),
            total_questions: q.total_questions || (Array.isArray(q.questions) ? q.questions.length : 0),
            purpose: q?.purpose || q?.type || q?.goal || '',
            difficulty: effectiveDifficulty,
            difficultyScore: normalizeDifficultyScore(effectiveDifficulty),
            topic: q?.topic || q?.subject || q?.category || '',
            selection_reasons: q?.selection_reasons || q?.reasons || q?.pick_reasons || [],
            quiz_id: q.quiz_id || q.id || q.document_id || null,
          };
        });

        if (!isActive) return;

        setPagedQuizzes(normalized);
        setQuizPagination({
          page: Number(response?.page) || 1,
          page_size: Number(response?.page_size) || quizPageSize,
          total_pages: Number(response?.total_pages) || 1,
          total_filtered: Number(response?.total_filtered) || normalized.length,
          has_next: Boolean(response?.has_next),
          has_prev: Boolean(response?.has_prev),
        });
        if (normalized.length) {
          loadResultsForQuizzes(normalized);
        }
      } catch (err) {
        console.error('Load paged quizzes failed', err);
        if (!isActive) return;
        setPagedQuizzes([]);
        setQuizPagination({
          page: 1,
          page_size: quizPageSize,
          total_pages: 1,
          total_filtered: 0,
          has_next: false,
          has_prev: false,
        });
      } finally {
        if (isActive) setListLoading(false);
      }
    };

    loadPagedQuizzes();

    return () => {
      isActive = false;
    };
  }, [courseId, lesson, quizSearchDebounced, difficultyFilter, sortOption, quizPage, quizPageSize]);

  const startQuiz = async (qRef) => {
    const id = typeof qRef === 'string' ? qRef : (qRef.id || qRef.quiz_id);
    const useLocal = Array.isArray(qRef?.questions) && qRef.questions.length > 0;
    try {
      
      let data = null;
      if (useLocal) {
        data = qRef;
      } else {
        // Try direct fetch by id
        try {
          data = await secureAPI.courseAPI.getQuizById(id, {
            userId: getUserId(),
            courseId,
          });
        } catch (_) {
          // Fallback to course-level list and pick by id
          try {
            const list = await secureAPI.courseAPI.getQuizzesByCourse(courseId, {
              userId: getUserId(),
              quizIds: [id],
              pageSize: 1,
            });
            const qs = Array.isArray(list?.quizzes) ? list.quizzes : [];
            data = qs.find((x) => (x.quiz_id || x.id) === id) || null;
          } catch (_) {}
        }
      }

      if (!data) throw new Error('quiz_not_found');

      const questions = Array.isArray(data.questions)
        ? data.questions
        : (Array.isArray(data.questions_data) ? data.questions_data : []);

      // Helper to normalize the correct answer index
      const normalizeCorrectIndex = (qq, options) => {
        const cand = qq.correct_index ?? qq.correctAnswer ?? qq.correct_answer ?? qq.answer_index ?? qq.correct;
        if (typeof cand === 'number' && !Number.isNaN(cand)) {
          const max = Math.max(0, Math.min((options?.length || 1) - 1, cand));
          return max;
        }
        if (typeof cand === 'string') {
          const s = String(cand).trim().toLowerCase();
          const map = { 'a':0, 'ก':0, '1':0, 'b':1, 'ข':1, '2':1, 'c':2, 'ค':2, '3':2, 'd':3, 'ง':3, '4':3 };
          if (s in map) return map[s];
          const idxByText = (options || []).findIndex(o => String(o).trim().toLowerCase() === s);
          if (idxByText >= 0) return idxByText;
          const m = s.match(/(\d+)/);
          if (m) {
            const n = parseInt(m[1], 10) - 1;
            if (n >= 0 && n < (options?.length || 0)) return n;
          }
        }
        return -1; // avoid defaulting to first option
      };

      const normalizedQuestions = questions.map((qq, idx) => {
        const options = qq.choices || qq.options || [];
        return {
          id: qq.id || `q${idx+1}`,
          context: extractQuestionContextText(qq),
          question: qq.question || qq.text || '',
          options,
          correctAnswer: normalizeCorrectIndex(qq, options),
          explanation: qq.explanation || qq.rationale || qq.solution || qq.explain || qq.answer_explanation || qq.answerExplanation || '',
          difficulty: qq.difficulty ?? qq.level ?? qq.difficulty_score ?? null,
          difficultyScore: normalizeDifficultyScore(qq.difficulty ?? qq.level ?? qq.difficulty_score),
        };
      });

      const avgDifficulty = normalizedQuestions.length
        ? clampDifficultyStars(
            normalizedQuestions.reduce((sum, qItem) => sum + (qItem.difficultyScore || 3), 0) / normalizedQuestions.length
          )
        : normalizeDifficultyScore(data.difficulty_avg ?? data.difficulty ?? qRef?.difficulty);

      const normalized = {
        id: data.quiz_id || data.id || id,
        title: data.title || data.name || 'แบบทดสอบ',
        description: data.description || '',
        totalQuestions: data.total_questions || questions.length || 0,
        difficultyScore: avgDifficulty,
        completed: false,
        questions: normalizedQuestions
      };
      setSelectedQuiz(normalized);
      setSplit(true);
    } catch (e) {
      console.error('Start quiz failed', e);
      // Show gentle inline error rather than alert, keep page usable
      setError('ไม่สามารถเปิดแบบทดสอบได้');
      setTimeout(() => setError(null), 2500);
    }
  };

  const getDifficulty = (value) => {
    const stars = normalizeDifficultyScore(value);
    if (stars <= 2) return { label: 'ง่าย', className: 'easy', stars };
    if (stars === 3) return { label: 'ปานกลาง', className: 'medium', stars };
    return { label: 'ยาก', className: 'hard', stars };
  };

  const getDifficultyBucket = (value) => {
    const stars = normalizeDifficultyScore(value);
    if (stars <= 2) return 'easy';
    if (stars === 3) return 'medium';
    return 'hard';
  };

  const clampPercent = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const percent = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
    return Math.max(0, Math.min(100, Math.round(percent)));
  };

  const getStatsForQuiz = (quiz) => (
    resultsByQuiz[quiz?.id]
    || resultsByQuiz[quiz?.quiz_id]
    || { attempts: 0, latestScore: null, lastAt: null, list: [] }
  );

  const quizzesRaw = Array.isArray(pagedQuizzes) ? pagedQuizzes : [];
  const quizzes = quizzesRaw.filter((quiz) => {
    if (difficultyFilter === 'all') return true;
    return getDifficultyBucket(quiz?.difficultyScore ?? quiz?.difficulty) === difficultyFilter;
  });
  const hasActiveFilters = Boolean(quizSearchDebounced) || difficultyFilter !== 'all';
  const recommendation = buildQuizRecommendation({
    quizzes: recommendationQuizzes,
    resultsByQuiz,
  });
  const recommendedQuiz = recommendation?.quiz || null;
  const recommendedTopic = recommendation?.topic || 'บทเรียนนี้';
  const hasHistory = Boolean(recommendation?.hasHistory);
  const getQuizStatusBadges = (quiz, stats) => {
    const badges = [];
    const latestScore = clampPercent(stats.latestScore);
    const recommendedId = recommendedQuiz?.id || recommendedQuiz?.quiz_id || recommendedQuiz?.document_id;
    const quizId = quiz?.id || quiz?.quiz_id || quiz?.document_id;
    const isRecommended = recommendedId && quizId && String(recommendedId) === String(quizId);

    if (isRecommended) {
      badges.push({ key: 'recommended', label: 'แนะนำ', tone: 'recommended' });
    } else if (latestScore != null && latestScore < 70 && (stats.attempts || 0) > 0) {
      badges.push({ key: 'review', label: 'ควรทบทวน', tone: 'review' });
    }
    return badges.slice(0, 2);
  };
  const latestActivity = readLatestLessonActivity({ user });
  const latestActivityCourseTitle =
    latestActivity && String(latestActivity.courseId) === String(courseId)
      ? String(latestActivity.courseName || '').trim()
      : '';
  const breadcrumbCourseTitle =
    lesson?.course_name ||
    lesson?.courseName ||
    lesson?.course_title ||
    lesson?.course?.name ||
    lesson?.course?.title ||
    courseTitle ||
    latestActivityCourseTitle ||
    'คอร์ส';

  useEffect(() => {
    let isActive = true;
    const run = async () => {
      if (!user || !courseId) return;
      try {
        const toCourseList = (payload) => {
          if (Array.isArray(payload)) return payload;
          if (Array.isArray(payload?.courses)) return payload.courses;
          if (Array.isArray(payload?.data)) return payload.data;
          if (Array.isArray(payload?.items)) return payload.items;
          return [];
        };
        const getCourseTitle = (course) =>
          String(course?.name || course?.title || course?.course_name || '').trim();
        const matchesCourse = (course) =>
          String(course?.id || course?.course_id || course?.courseId || '') === String(courseId);
        const userId = getUserId();
        let title = '';

        const localEnrolledCourses = Array.isArray(user?.enrolledCourses) ? user.enrolledCourses : [];
        const localFound = localEnrolledCourses.find(matchesCourse);
        title = getCourseTitle(localFound);

        if (!title && userId) {
          const response = await secureAPI.courseAPI.getUserCourses(userId);
          const courses = toCourseList(response);
          const found = courses.find(matchesCourse);
          title = getCourseTitle(found);
        }

        // Fallback for cases where enrolled-courses payload is missing/stale.
        if (!title) {
          const allCoursesRes = await secureAPI.courseAPI.getAllCourses();
          const allCourses = toCourseList(allCoursesRes);
          const foundInAll = allCourses.find(matchesCourse);
          title = getCourseTitle(foundInAll);
        }

        if (isActive) setCourseTitle(title);
      } catch (_) {
        if (isActive) setCourseTitle('');
      }
    };
    run();
    return () => {
      isActive = false;
    };
  }, [user, courseId]);

  useEffect(() => {
    if (!user || !courseId || !lessonId) return;
    saveLatestLessonActivity({
      user,
      courseId,
      lessonId,
      courseName: lesson?.course_name || lesson?.courseName || '',
      lessonTitle: lesson?.title || '',
    });
  }, [user, courseId, lessonId, lesson?.title, lesson?.course_name, lesson?.courseName]);

  if (!user) return <Navigate to="/" replace />;

  return (
    <ErrorBoundary>
      <div className="course-page">
        <Header user={user} onLogout={() => {}} activeTab="courses" onSelectTab={handleSelectHeaderTab} />

        <section className="course-hero lesson-breadcrumb-hero">
          <div className="course-hero-inner">
            <div className="course-breadcrumb">
              <Link className="course-breadcrumb-link" to="/dashboard">หน้าแรก</Link>
              <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
              <Link className="course-breadcrumb-link" to={`/course/${courseId}`}>{breadcrumbCourseTitle}</Link>
              <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
              <span className="course-breadcrumb-current">{lesson?.title || 'บทเรียน'}</span>
            </div>
          </div>
        </section>

        <div className="course-content">
          {loading ? (
            <LessonPageLoadingSkeleton />
          ) : error ? (
            <div className="error-state">{error}</div>
          ) : split && selectedQuiz ? (
            <div className="split-screen">
              <div className="left-panel">
                <QuizInterface
                  ref={quizRef}
                  course={{ id: courseId, name: '' }}
                  lessonId={lessonId}
                  user={user}
                  initialQuiz={selectedQuiz}
                  onAddAiMessage={(payload) => chatRef.current?.addAiMessage(payload)}
                  onBackToCourse={() => {
                    setSplit(false);
                  }}
                  onQuestionChange={(qtext) => setChatContext(qtext || null)}
                  onResultStored={async (quizId) => {
                    // After submit, stay on results view; refresh stats in background
                    try { await loadResultsForQuiz(quizId); } catch (_) {}
                  }}
                />
              </div>
              <div className="right-panel">
                <ChatInterface
                  ref={chatRef}
                  course={{ id: courseId }}
                  user={user}
                  context={chatContext}
                  showEnergyBanner={false}
                  onSuggestionSelect={(payload) => quizRef.current?.handleUnderstandingResponse(payload)}
                  onAiResponse={(payload) => quizRef.current?.handleAiResponseReceived(payload)}
                />
              </div>
            </div>
          ) : (
            <div className="lessons-tab">
              <div className="lessons-header">
                <h3>📝 แบบทดสอบในบทเรียน</h3>
                <p>{lesson?.description || ''}</p>
              </div>

              <section className="exam-section">
                <div className="exam-section-header">
                  <h4>แนะนำสำหรับคุณ</h4>
                  <p>ค่อย ๆ ไต่ระดับ และสลับทบทวนชุดที่คะแนนยังต่ำ</p>
                </div>
                {recommendedQuiz ? (
                  <ExamRecommendation
                    quiz={recommendedQuiz}
                    hasHistory={hasHistory}
                    topic={recommendedTopic}
                    difficulty={recommendedQuiz ? getDifficulty(
                      recommendedQuiz.difficultyScore
                      ?? recommendedQuiz.difficulty_avg
                      ?? recommendedQuiz.difficulty
                    ) : null}
                    recommendation={recommendation}
                    onStart={() => recommendedQuiz && startQuiz(recommendedQuiz)}
                  />
                ) : (
                  <div className="exam-inline-empty" role="status">
                    <h3>ยังไม่มีแบบทดสอบแนะนำ</h3>
                    <p>บทเรียนนี้ยังไม่มีข้อมูลแบบทดสอบเพียงพอสำหรับสร้างคำแนะนำ</p>
                  </div>
                )}
              </section>

              <section className="exam-section">
                <div className="exam-section-header">
                  <h4>แบบทดสอบทั้งหมด</h4>
                  <p>ค้นหา กรอง และเรียงลำดับได้ รองรับรายการจำนวนมาก</p>
                </div>
                <div className="exam-toolbar">
                  <input
                    type="text"
                    className="exam-toolbar-field exam-toolbar-search"
                    placeholder="ค้นหาชื่อแบบทดสอบ..."
                    value={quizSearch}
                    onChange={(e) => setQuizSearch(e.target.value)}
                  />
                  <select
                    className="exam-toolbar-field exam-toolbar-select"
                    value={difficultyFilter}
                    onChange={(e) => setDifficultyFilter(e.target.value)}
                  >
                    <option value="all">ทุกระดับความยาก</option>
                    <option value="easy">ง่าย</option>
                    <option value="medium">ปานกลาง</option>
                    <option value="hard">ยาก</option>
                  </select>
                  <select
                    className="exam-toolbar-field exam-toolbar-select"
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value)}
                  >
                    <option value="difficulty_asc">ง่าย -> ยาก</option>
                    <option value="difficulty_desc">ยาก -> ง่าย</option>
                    <option value="title_asc">ชื่อ ก-ฮ</option>
                    <option value="title_desc">ชื่อ ฮ-ก</option>
                    <option value="latest">ล่าสุด</option>
                    <option value="oldest">เก่าสุด</option>
                    <option value="questions_desc">จำนวนข้อมาก -> น้อย</option>
                    <option value="questions_asc">จำนวนข้อน้อย -> มาก</option>
                  </select>
                </div>
                <div
                  className="exam-grid"
                  role={listLoading ? 'status' : undefined}
                  aria-label={listLoading ? 'กำลังโหลดแบบทดสอบ' : undefined}
                  aria-busy={listLoading ? 'true' : undefined}
                >
                  {listLoading ? (
                    <LessonQuizListSkeleton count={4} inline />
                  ) : quizzes.length ? quizzes.map((q) => {
                    const stats = getStatsForQuiz(q);
                    const attempts = stats.attempts || 0;
                    const latestScore = clampPercent(stats.latestScore);
                    const difficulty = getDifficulty(q.difficultyScore ?? q.difficulty);
                    const questionCount = Number.isInteger(q?.total_questions)
                      ? q.total_questions
                      : (Array.isArray(q?.questions) ? q.questions.length : (Number.isInteger(q?.questions) ? q.questions : 0));

                    return (
                      <ExamCard
                        key={q.id || q.title}
                        quiz={q}
                        attempts={attempts}
                        latestScore={latestScore}
                        difficulty={difficulty}
                        questionCount={questionCount}
                        statusBadges={getQuizStatusBadges(q, stats)}
                        onStart={() => startQuiz(q)}
                        onView={() => navigate(`/course/${courseId}/lesson/${lessonId}/quiz/${q.id}/analysis`)}
                      />
                    );
                  }) : (
                    <div className="exam-inline-empty" role="status">
                      <h3>{hasActiveFilters ? 'ไม่พบแบบทดสอบตามเงื่อนไข' : 'ยังไม่มีแบบทดสอบในบทเรียนนี้'}</h3>
                      <p>
                        {hasActiveFilters
                          ? 'ลองล้างคำค้นหรือเปลี่ยนตัวกรอง แล้วค้นหาอีกครั้ง'
                          : 'เมื่อมีแบบทดสอบ ระบบจะแสดงรายการที่นี่ทันที'}
                      </p>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          className="exam-secondary-btn"
                          onClick={() => {
                            setQuizSearch('');
                            setDifficultyFilter('all');
                            setSortOption('difficulty_asc');
                            setQuizPage(1);
                          }}
                        >
                          ล้างตัวกรอง
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="exam-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                  <div style={{ color: '#64748b', fontSize: 14 }}>
                    ทั้งหมด {quizPagination.total_filtered} รายการ • หน้า {quizPagination.page}/{quizPagination.total_pages}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="exam-secondary-btn"
                      disabled={!quizPagination.has_prev || listLoading}
                      onClick={() => setQuizPage((prev) => Math.max(1, prev - 1))}
                    >
                      ก่อนหน้า
                    </button>
                    <button
                      type="button"
                      className="exam-secondary-btn"
                      disabled={!quizPagination.has_next || listLoading}
                      onClick={() => setQuizPage((prev) => prev + 1)}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default LessonPage;

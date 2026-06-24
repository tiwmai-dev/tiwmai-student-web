import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useParams, Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Hash,
  Info,
  Languages,
  ShieldCheck,
  Target,
  User,
} from 'lucide-react';
import Header from '../components/Header';
import QuizInterface from '../components/QuizInterface';
import ChatInterface from '../components/ChatInterface';
import ConfirmActionDialog from '../components/ConfirmActionDialog';
import PageLoading from '../components/PageLoading';
import ErrorBoundary from '../components/ErrorBoundary';
import MathText from '../components/MathText';
import { secureAPI } from '../utils/api';
import { getCourseSubjectLabel } from '../utils/courseLabels';
import { getApiDateTimeMs, parseApiDate } from '../utils/dateTime';
import { useAuth } from '../contexts/AuthContext';
import { saveLatestLessonActivity } from '../utils/learningActivity';
import { extractQuestionContextText } from '../utils/questionContext';
import { trackEvent } from '../utils/analytics';

const formatThaiDateTime = (value) => {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatThaiMonthYear = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const getRemainingTimeInfo = (expiresAt, nowTimestamp = Date.now()) => {
  if (!expiresAt) {
    return {
      totalHours: null,
      label: '-',
    };
  }
  const expiresAtTs = getApiDateTimeMs(expiresAt);
  if (Number.isNaN(expiresAtTs)) {
    return {
      totalHours: null,
      label: '-',
    };
  }

  const diffMs = expiresAtTs - nowTimestamp;
  if (diffMs <= 0) {
    return {
      totalHours: 0,
      label: 'หมดอายุแล้ว',
    };
  }

  const totalMinutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.max(0, Math.floor(diffMs / (60 * 60 * 1000)));

  if (days > 0) {
    return {
      totalHours,
      label: `${days} วัน ${hours} ชั่วโมง`,
    };
  }

  if (hours > 0) {
    return {
      totalHours,
      label: `${hours} ชั่วโมง ${minutes} นาที`,
    };
  }

  return {
    totalHours,
    label: `${minutes} นาที`,
  };
};

const isCourseExpiredRecord = (record) => {
  if (!record || typeof record !== 'object') return false;
  if (Boolean(record?.is_expired)) return true;
  const expiresAt = record?.expires_at;
  if (!expiresAt) return false;
  const expiresAtTs = getApiDateTimeMs(expiresAt);
  if (Number.isNaN(expiresAtTs)) return false;
  return expiresAtTs < Date.now();
};

const isTrialEnrollmentRecord = (record) => {
  if (!record || typeof record !== 'object') return false;
  const source = String(record?.enrollment_source || '').toLowerCase().trim();
  const type = String(record?.enrollment_type || '').toLowerCase().trim();
  return Boolean(record?.trial_consumed_at || record?.trial_expires_at || record?.is_trial)
    || source === 'trial'
    || type === 'trial';
};

const extractLessonQuizRefs = (lesson) => {
  const rawList = [
    ...(Array.isArray(lesson?.quizzes) ? lesson.quizzes : []),
    ...(Array.isArray(lesson?.selected_quizzes) ? lesson.selected_quizzes : []),
    ...(Array.isArray(lesson?.selectedQuizzes) ? lesson.selectedQuizzes : []),
  ];
  return rawList
    .map((quiz) => (
      typeof quiz === 'string'
        ? quiz
        : (quiz?.quiz_id || quiz?.id || quiz?.document_id || quiz?.quizId)
    ))
    .map((quizId) => String(quizId || '').trim())
    .filter(Boolean);
};

const buildCourseQuizAliasMap = (courseQuizzes = []) => {
  const aliasMap = new Map();
  (Array.isArray(courseQuizzes) ? courseQuizzes : []).forEach((quiz) => {
    const canonicalId = String(
      quiz?.quiz_id || quiz?.id || quiz?.document_id || quiz?.quizId || ''
    ).trim();
    if (!canonicalId) return;
    [
      quiz?.quiz_id,
      quiz?.id,
      quiz?.document_id,
      quiz?.quizId,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .forEach((aliasId) => {
        aliasMap.set(aliasId, canonicalId);
      });
  });
  return aliasMap;
};

const resolveQuizAlias = (quizId, aliasMap) => {
  const normalizedId = String(quizId || '').trim();
  if (!normalizedId) return '';
  return aliasMap.get(normalizedId) || normalizedId;
};

const resolveStudentUserId = (sourceUser) => (
  sourceUser?.user_id
  || sourceUser?.id
  || sourceUser?.studentId
  || sourceUser?.username
  || 'anonymous'
).toString();

const toCourseList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.courses)) return payload.courses;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const UNKNOWN_TOPIC_LABEL = 'ไม่ระบุหัวข้อ';
const MOCK_EXAMS_PER_PAGE = 6;
const mockExamTitleCollator = new Intl.Collator('th', {
  numeric: true,
  sensitivity: 'base',
});

const normalizeTopicLabel = (value) => String(value || '').trim();

const normalizeMockExamDisplayTitle = (title, fallbackIndex = 0) => {
  const rawTitle = String(title || '').trim() || `ข้อสอบจำลองที่ ${fallbackIndex + 1}`;
  return rawTitle
    .replace(/^แบบทดสอบจำลอง/, 'ข้อสอบจำลอง')
    .replace(/^แบบทดสอบ/, 'ข้อสอบจำลอง');
};

const uniqueLabels = (labels = []) => {
  const seen = new Set();
  return labels
    .map(normalizeTopicLabel)
    .filter(Boolean)
    .filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getCourseTopicLabels = (sourceCourse) => {
  if (!sourceCourse || typeof sourceCourse !== 'object') return [];
  const contentItemTopics = Array.isArray(sourceCourse?.content_items)
    ? sourceCourse.content_items.map((item) => item?.title)
    : [];
  const explicitTopics = Array.isArray(sourceCourse?.topics)
    ? sourceCourse.topics
    : [];
  const lessonTopics = Array.isArray(sourceCourse?.lessons)
    ? sourceCourse.lessons.map((lesson) => lesson?.title)
    : [];
  return uniqueLabels([
    ...contentItemTopics,
    ...explicitTopics,
    ...lessonTopics,
  ]);
};

const resolveCourseTopicLabel = (questionInsight, courseTopicLabels = []) => {
  const rawTopic = normalizeTopicLabel(
    questionInsight?.course_topic
    || questionInsight?.topic_tag
    || questionInsight?.topic
    || questionInsight?.category
  );
  const hasKnownRawTopic = rawTopic && rawTopic !== UNKNOWN_TOPIC_LABEL;
  const labels = uniqueLabels(courseTopicLabels);
  if (labels.length === 0) {
    return hasKnownRawTopic ? rawTopic : UNKNOWN_TOPIC_LABEL;
  }

  const rawTopicKey = rawTopic.toLowerCase();
  const exact = hasKnownRawTopic
    ? labels.find((label) => label.toLowerCase() === rawTopicKey)
    : null;
  if (exact) return exact;

  const searchableParts = [
    hasKnownRawTopic ? rawTopic : '',
    questionInsight?.question_text,
    questionInsight?.question_context_text,
    questionInsight?.explanation,
    questionInsight?.source_quiz_title,
    questionInsight?.quiz_title,
  ];
  const searchableText = searchableParts
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean)
    .join(' ');

  const matched = labels.find((label) => {
    const key = label.toLowerCase();
    if (!key) return false;
    if (hasKnownRawTopic && (rawTopicKey.includes(key) || key.includes(rawTopicKey))) return true;
    return searchableText.includes(key);
  });
  if (matched) return matched;

  return hasKnownRawTopic ? rawTopic : UNKNOWN_TOPIC_LABEL;
};

const sanitizePracticeSetFromNavigation = (practiceSet) => {
  if (!practiceSet || typeof practiceSet !== 'object') return null;
  const questions = Array.isArray(practiceSet.questions)
    ? practiceSet.questions
      .map((question, index) => {
        const options = Array.isArray(question?.options)
          ? question.options
          : (Array.isArray(question?.choices) ? question.choices : []);
        const correctAnswer = Number(question?.correctAnswer ?? question?.correct_answer ?? question?.correct_index);
        if (!options.length || !Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
          return null;
        }
        return {
          id: question?.id || `ai-practice-${index + 1}`,
          context: question?.context || null,
          question: String(question?.question || question?.text || `ข้อ ${index + 1}`).trim(),
          options,
          correctAnswer,
          explanation: question?.explanation || '',
          difficulty: question?.difficulty ?? null,
          topic: String(question?.topic || question?.topic_tag || question?.topicTag || '').trim() || null,
          topic_tag: String(question?.topic_tag || question?.topicTag || question?.topic || '').trim() || null,
          quizTitle: String(question?.quizTitle || question?.quiz_title || '').trim() || null,
          quiz_title: String(question?.quiz_title || question?.quizTitle || '').trim() || null,
        };
      })
      .filter(Boolean)
    : [];

  if (questions.length === 0) return null;
  return {
    id: practiceSet.id || `ai-practice-${Date.now()}`,
    title: practiceSet.title || 'ฝึกซ้ำจากข้อที่พลาด',
    description: practiceSet.description || 'สร้างจากข้อที่ระบบแนะนำให้ทบทวน',
    totalQuestions: questions.length,
    timeLimit: Math.max(10, Number(practiceSet.timeLimit) || questions.length * 2),
    completed: false,
    questions,
  };
};

const CoursePage = ({ user }) => {
  const { logout } = useAuth();
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode = new URLSearchParams(location?.search || '').get('view');
  const forcePaymentDetails = Boolean(location?.state?.forcePaymentDetails) || viewMode === 'payment';
  const renewCourseTarget = {
    pathname: `/course/${courseId}`,
    search: '?view=payment',
    state: { forcePaymentDetails: true, fromRenew: true },
  };
  const [course, setCourse] = useState(null);
  const [mockExams, setMockExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEnrolledCourse, setIsEnrolledCourse] = useState(false);
  const [hasActiveEnrollment, setHasActiveEnrollment] = useState(false);
  const [trialStarting, setTrialStarting] = useState(false);
  const [trialStartDialog, setTrialStartDialog] = useState(null);
  const [activeTab, setActiveTab] = useState('lessons'); // Default to lessons tab
  const [mockExamPage, setMockExamPage] = useState(1);
  const [expandedLessonId, setExpandedLessonId] = useState(null);
  const [lessonQuizzes, setLessonQuizzes] = useState({});
  const [splitView, setSplitView] = useState(false);
  const [selectedQuizForSplit, setSelectedQuizForSplit] = useState(null);
  const [practiceStartDialog, setPracticeStartDialog] = useState(null);
  const [splitChatContext, setSplitChatContext] = useState(null);
  const [practiceResults, setPracticeResults] = useState([]);
  const [practiceStats, setPracticeStats] = useState({ attempts: 0, avg: 0, best: 0, lastAt: null, lastScore: 0 });
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisSourceType, setAnalysisSourceType] = useState('lesson');
  const [analysisScope, setAnalysisScope] = useState('');
  const [analysisTopic, setAnalysisTopic] = useState('all');
  const [priorityQuestionIndex, setPriorityQuestionIndex] = useState(0);
  const [trendDifficultyView, setTrendDifficultyView] = useState('easy');
  const [exerciseProgress, setExerciseProgress] = useState({ completed: 0, total: 0 });
  const [lessonExerciseProgress, setLessonExerciseProgress] = useState({});
  const [analysisLlmSummary, setAnalysisLlmSummary] = useState({
    loading: false,
    error: null,
    summaryParagraph: '',
    recommendations: [],
    recommendationCards: [],
    model: '',
    generatedAt: null,
    isFallback: false,
  });

  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const analysisSummaryRequestRef = useRef(0);
  const loadingTimeoutRef = useRef(null);
  const aiPracticeSetOpenedRef = useRef(null);
  const splitChatRef = useRef(null);
  const splitQuizRef = useRef(null);
  const courseViewTrackedRef = useRef(null);
  const courseSubjectLabel = getCourseSubjectLabel(course, 'วิชา');
  const hasConsumedTrial = useMemo(() => {
    const records = [
      ...(Array.isArray(user?.enrolledCourses) ? user.enrolledCourses : []),
      course,
      course?.enrollment,
    ].filter(Boolean);
    return records.some(isTrialEnrollmentRecord);
  }, [course, user?.enrolledCourses]);
  const canRequestTrialFromDetail = Boolean(course && !hasActiveEnrollment && !hasConsumedTrial);
  const trialDetailButtonLabel = trialStarting ? 'กำลังเปิดทดลองเรียน…' : 'ทดลองเรียน';

  useEffect(() => {
    if (!course || !courseId || courseViewTrackedRef.current === courseId) return;
    courseViewTrackedRef.current = courseId;
    trackEvent('view_item', {
      currency: 'THB',
      value: Number(course?.price || course?.price_thb || 0),
      items: [{
        item_id: courseId,
        item_name: course?.name || course?.title || 'Course',
        item_category: course?.category || course?.subject || undefined,
      }],
    });
  }, [course, courseId]);

  const handleSelectHeaderTab = (tab) => {
    if (tab === 'ranking') {
      navigate('/ranking');
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

  useEffect(() => {
    const requestedTab = location?.state?.activeTab;
    if (requestedTab === 'analysis' || requestedTab === 'mock_exams' || requestedTab === 'lessons') {
      setActiveTab(requestedTab);
    }
  }, [location?.state?.activeTab]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 60000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    // Clear any existing timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    
    // Keep slow requests alive; forcing an error here caused the page to briefly
    // show a timeout before the same request completed successfully.
    loadingTimeoutRef.current = setTimeout(() => {
      console.warn('Course data is still loading after 30 seconds');
    }, 30000);
    
    // Try multiple user ID fields and also handle case where user object exists but no specific ID
    if (user && (user?.id || user?.studentId || user?.username)) {
      loadCourseData();
    } else if (user) {
      console.warn('User exists but no stable ID found, loading course data with fallback user context');
      loadCourseData();
    } else {
      console.warn('No user found, setting loading to false');
      clearTimeout(loadingTimeoutRef.current);
      setLoading(false);
    }
    
    // Cleanup function
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [courseId, user?.user_id, user?.id, user?.studentId, user?.username, user?.enrolledCourses, forcePaymentDetails]);

  const loadCourseData = async () => {
    const normalizeCourseId = (value) => (value == null ? '' : String(value));
    const targetCourseId = normalizeCourseId(courseId);
    const normalizeCourse = (raw = {}) => {
      const numericPrice = Number(raw?.price ?? raw?.price_thb ?? raw?.tuition);
      return {
        ...raw,
        id: normalizeCourseId(raw?.id || raw?.course_id || raw?._id || targetCourseId),
        name: raw?.name || raw?.title || 'คอร์สเรียน',
        description: raw?.description || '',
        instructor: raw?.instructor || raw?.teacher_name || raw?.teacher || raw?.owner_name || 'อาจารย์ระบบ',
        category: raw?.category || raw?.subject || 'ทั่วไป',
        price: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : 0,
      };
    };
    try {
      setLoading(true);
      const userId = resolveStudentUserId(user);
      let overview = null;
      const overviewUserId = userId && userId !== 'anonymous' ? userId : undefined;
      try {
        overview = await secureAPI.courseAPI.getCourseLearningOverview(targetCourseId, {
          userId: overviewUserId,
        });
      } catch (overviewError) {
        const message = String(overviewError?.message || '').toUpperCase();
        const canRetryPublic =
          overviewUserId &&
          (message.includes('401') ||
            message.includes('403') ||
            message.includes('COURSE_ACCESS_DENIED') ||
            message.includes('COURSE_EXPIRED'));
        if (!canRetryPublic) throw overviewError;
        overview = await secureAPI.courseAPI.getCourseLearningOverview(targetCourseId);
      }

      const overviewCourse = overview?.course ? normalizeCourse(overview.course) : null;
      if (!overviewCourse) {
        setCourse(null);
        setMockExams([]);
        setIsEnrolledCourse(false);
        setHasActiveEnrollment(false);
        return;
      }

      const enrollment = overview?.enrollment || overviewCourse?.enrollment || null;
      const baseCourse = normalizeCourse({
        ...overviewCourse,
        ...(enrollment || {}),
        enrollment,
      });
      const enrolled = Boolean(enrollment || baseCourse?.enrollment_id);
      const enrolledCourseExpired = isCourseExpiredRecord({
        ...baseCourse,
        ...(enrollment || {}),
      });
      const showEnrolledLearningView = enrolled && !forcePaymentDetails;
      const activeEnrollment = enrolled && !enrolledCourseExpired;
      const lessons = Array.isArray(overview?.lessons) ? overview.lessons : [];
      const courseLevelQuizzes = Array.isArray(overview?.quizzes) ? overview.quizzes : [];
      const regularQuizzes = courseLevelQuizzes.filter((q) => (q.document_type || '').toLowerCase() !== 'mock_exam');
      const onlyMocks = courseLevelQuizzes.filter((q) => (q.document_type || '').toLowerCase() === 'mock_exam');

      setIsEnrolledCourse(showEnrolledLearningView);
      setHasActiveEnrollment(activeEnrollment);
      setCourse({
        ...baseCourse,
        lessons,
        quizzes: regularQuizzes,
        allCourseQuizzes: courseLevelQuizzes,
        quizResults: Array.isArray(overview?.quiz_results) ? overview.quiz_results : [],
      });
      setMockExams(onlyMocks);
    } catch (error) {
      console.warn('Learning overview failed; falling back to legacy course loading.', error);
      try {
        const userId = resolveStudentUserId(user);
        const localEnrolledCourses = Array.isArray(user?.enrolledCourses) ? user.enrolledCourses : [];
        let enrolledCourses = localEnrolledCourses;
        if (userId && userId !== 'anonymous') {
          try {
            enrolledCourses = toCourseList(await secureAPI.courseAPI.getUserCourses(userId));
          } catch (fetchErr) {
            console.warn('Failed to refresh enrolled courses for detail page', fetchErr);
            enrolledCourses = localEnrolledCourses;
          }
        }

        const enrolledCourse = enrolledCourses.find(
          (item) => normalizeCourseId(item?.id || item?.course_id || item?._id) === targetCourseId
        );
        const enrolled = Boolean(enrolledCourse);
        const showEnrolledLearningView = enrolled && !forcePaymentDetails;

        let baseCourse = enrolledCourse ? normalizeCourse(enrolledCourse) : null;
        if (!baseCourse) {
          try {
            const allCoursesRes = await secureAPI.courseAPI.getAllCourses();
            const allCourses = Array.isArray(allCoursesRes?.courses) ? allCoursesRes.courses : [];
            const found = allCourses.find(
              (item) => normalizeCourseId(item?.id || item?.course_id || item?._id) === targetCourseId
            );
            if (found) baseCourse = normalizeCourse(found);
          } catch (fetchErr) {
            console.warn('Failed to load all courses for detail page', fetchErr);
          }
        }

        if (!baseCourse) {
          setCourse(null);
          setMockExams([]);
          setIsEnrolledCourse(false);
          setHasActiveEnrollment(false);
          return;
        }

        const enrolledCourseExpired = isCourseExpiredRecord(baseCourse);
        const activeEnrollment = enrolled && !enrolledCourseExpired;
        const protectedCourseUserId = showEnrolledLearningView && !enrolledCourseExpired ? userId : undefined;
        const [lessonsResult, courseQuizResult, enrolledQuizResult] = await Promise.allSettled([
          secureAPI.courseAPI.getCourseLessons(targetCourseId, { userId: protectedCourseUserId }),
          secureAPI.courseAPI.getQuizzesByCourse(targetCourseId, {
            userId: protectedCourseUserId,
            pageSize: 100,
            sort: 'difficulty_asc',
          }),
          showEnrolledLearningView ? secureAPI.courseAPI.getCourseQuizzes(userId, targetCourseId) : Promise.resolve({ quizzes: [] }),
        ]);

        const lessons = lessonsResult.status === 'fulfilled' && Array.isArray(lessonsResult.value?.lessons)
          ? lessonsResult.value.lessons
          : [];
        const courseLevelQuizzes = courseQuizResult.status === 'fulfilled' && Array.isArray(courseQuizResult.value?.quizzes)
          ? courseQuizResult.value.quizzes
          : [];
        const quizzes = enrolledQuizResult.status === 'fulfilled' && Array.isArray(enrolledQuizResult.value?.quizzes)
          ? enrolledQuizResult.value.quizzes
          : [];
        const onlyMocks = courseLevelQuizzes.filter((q) => (q.document_type || '').toLowerCase() === 'mock_exam');

        setIsEnrolledCourse(showEnrolledLearningView);
        setHasActiveEnrollment(activeEnrollment);
        setCourse({
          ...baseCourse,
          lessons,
          quizzes,
          allCourseQuizzes: courseLevelQuizzes,
        });
        setMockExams(onlyMocks);
      } catch (fallbackError) {
        console.error('Failed to load course data:', fallbackError);
        if (fallbackError.name === 'TypeError' || fallbackError.message.includes('fetch')) {
          setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
        } else if (String(fallbackError?.message || '').includes('COURSE_EXPIRED')) {
          setError('คอร์สนี้หมดอายุแล้ว กรุณาต่ออายุคอร์สเพื่อเรียนต่อ');
        } else {
          setError('เกิดข้อผิดพลาดในการโหลดข้อมูลคอร์ส');
        }

        setCourse(null);
        setHasActiveEnrollment(false);
      }
    } finally {
      // Clear timeout since loading completed
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      setLoading(false);
    }
  };

  const toggleLessonExpand = async (lesson) => {
    const lessonId = lesson.id || lesson.lesson_id;
    if (!lessonId) return;
    setExpandedLessonId(prev => (prev === lessonId ? null : lessonId));
    if (expandedLessonId !== lessonId) {
      const rawQuizzes = [
        ...(Array.isArray(lesson?.quizzes) ? lesson.quizzes : []),
        ...(Array.isArray(lesson?.selected_quizzes) ? lesson.selected_quizzes : []),
        ...(Array.isArray(lesson?.selectedQuizzes) ? lesson.selectedQuizzes : []),
      ];
      if (!lessonQuizzes[lessonId]) {
        try {
          const currentUserId = getUserId();
          const targetCourseId = (course?.id || course?.course_id || courseId || '').toString();
          const detailed = await Promise.all(rawQuizzes.map(async (q) => {
            const qid = typeof q === 'string' ? q : (q.id || q.quiz_id || q.document_id);
            if (!qid) return null;
            try {
              const data = await secureAPI.courseAPI.getQuizById(qid, {
                userId: currentUserId,
                courseId: targetCourseId || undefined,
              });
              const questions = Array.isArray(data.questions) ? data.questions : (data.questions_data || []);
              // Normalize correct answer index from various possible fields
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
                // Unknown: avoid defaulting to A
                return -1;
              };

              return {
                id: data.quiz_id || data.id || qid,
                title: data.title || data.name || `แบบทดสอบ`,
                description: data.description || '',
                totalQuestions: data.total_questions || questions.length || 0,
                timeLimit: 20,
                completed: false,
                questions: questions.map((qq, idx) => {
                  const options = qq.choices || qq.options || [];
                  return {
                    id: qq.id || `q${idx+1}`,
                    context: extractQuestionContextText(qq),
                    question: qq.question || qq.text || '',
                    options,
                    correctAnswer: normalizeCorrectIndex(qq, options),
                    explanation: qq.explanation || qq.rationale || qq.solution || qq.explain || qq.answer_explanation || qq.answerExplanation || ''
                  };
                })
              };
            } catch (e) {
              console.warn('Failed to load quiz', qid, e);
              return null;
            }
          }));
          setLessonQuizzes(prev => ({ ...prev, [lessonId]: detailed.filter(Boolean) }));
        } catch (e) {
          console.warn('Failed to load lesson quizzes', e);
        }
      }
    }
  };

  const openSplitWithQuiz = (quiz) => {
    setSplitChatContext(null);
    setSelectedQuizForSplit(quiz);
    setSplitView(true);
  };
  const requestPracticeSplitStart = (quiz) => {
    if (!quiz) return;
    const practiceTitle = String(quiz?.title || quiz?.name || 'แบบฝึก').trim() || 'แบบฝึก';
    const totalQuestions = Number(quiz?.totalQuestions);
    const questionCount = Number.isFinite(totalQuestions) && totalQuestions > 0
      ? Math.round(totalQuestions)
      : (Array.isArray(quiz?.questions) ? quiz.questions.length : 0);
    setPracticeStartDialog({
      quiz,
      title: 'ยืนยันเริ่มทำแบบฝึก',
      message: `คุณกำลังจะเริ่มทำ "${practiceTitle}" จำนวน ${questionCount} ข้อ\nต้องการดำเนินการต่อหรือไม่?`,
    });
  };
  const handleConfirmPracticeSplitStart = () => {
    if (!practiceStartDialog?.quiz) {
      setPracticeStartDialog(null);
      return;
    }
    openSplitWithQuiz(practiceStartDialog.quiz);
    setPracticeStartDialog(null);
  };

  const handleRequestTrialStart = () => {
    if (!course || !canRequestTrialFromDetail || trialStarting) return;
    const courseName = String(course?.name || course?.title || 'คอร์สนี้').trim();
    setTrialStartDialog({
      title: `ยืนยันเริ่มทดลองเรียน "${courseName}"`,
      message:
        'รายละเอียดทดลองเรียน:\n' +
        '• ใช้สิทธิ์ได้ 1 ครั้งต่อบัญชี\n' +
        '• ใช้งานได้ 1 วัน (24 ชั่วโมง) นับจากกดยืนยัน\n' +
        '• เมื่อครบเวลา ระบบจะปิดสิทธิ์เข้าเรียนอัตโนมัติ\n' +
        '• เมื่อยืนยันแล้ว จะไม่สามารถทดลองเรียนซ้ำได้\n\n' +
        'ต้องการดำเนินการต่อหรือไม่?',
    });
  };

  const handleConfirmTrialStart = async () => {
    if (!course || !canRequestTrialFromDetail || trialStarting) return;
    const targetCourseId = String(course?.course_id || course?.id || courseId || '').trim();
    const userId = getUserId();
    if (!targetCourseId || !userId || userId === 'anonymous') {
      alert('ไม่พบข้อมูลผู้ใช้สำหรับเริ่มทดลองเรียน กรุณาเข้าสู่ระบบใหม่');
      return;
    }

    try {
      setTrialStarting(true);
      await secureAPI.courseAPI.enroll(userId, targetCourseId, { mode: 'trial' });
      setTrialStartDialog(null);
      navigate(`/course/${targetCourseId}`, { replace: true, state: { activeTab: 'lessons' } });
    } catch (e) {
      const message = String(e?.message || '');
      if (message.includes('TRIAL_ALREADY_USED')) {
        alert('บัญชีนี้ใช้สิทธิ์ทดลองเรียนไปแล้ว (ทดลองได้ 1 ครั้งต่อผู้ใช้)');
      } else if (message.includes('TRIAL_NOT_ALLOWED')) {
        alert('คอร์สนี้ไม่สามารถทดลองเรียนซ้ำได้');
      } else {
        alert('เปิดทดลองเรียนไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setTrialStarting(false);
    }
  };

  const closeSplit = () => {
    setSplitView(false);
    setSelectedQuizForSplit(null);
    setSplitChatContext(null);
  };

  useEffect(() => {
    const practiceSet = sanitizePracticeSetFromNavigation(location?.state?.practiceSet);
    if (!practiceSet) return;
    if (aiPracticeSetOpenedRef.current === practiceSet.id) return;
    aiPracticeSetOpenedRef.current = practiceSet.id;
    setActiveTab('analysis');
    setSplitChatContext(null);
    setSelectedQuizForSplit(practiceSet);
    setSplitView(true);
  }, [location?.state?.practiceSet]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    loadCourseData();
  };

  const getUserId = () => resolveStudentUserId(user);
  const normalizeDifficultyStars = (value) => {
    if (value == null || value === '') return 3;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      if (numeric >= 1 && numeric <= 5) return Math.min(5, Math.max(1, Math.round(numeric)));
      if (numeric <= 1) return 2;
      if (numeric === 2) return 3;
      if (numeric >= 3) return 4;
    }
    const raw = String(value).trim().toLowerCase();
    if (['easy', 'ง่าย', 'low', 'beginner', 'เบา'].includes(raw)) return 2;
    if (['hard', 'ยาก', 'high', 'advanced'].includes(raw)) return 4;
    return 3;
  };

  const normalizeDifficultyBucket = (value) => {
    const stars = normalizeDifficultyStars(value);
    if (stars <= 2) return 'easy';
    if (stars >= 4) return 'hard';
    return 'medium';
  };

  const loadPracticeAnalysis = async () => {
    const lessons = Array.isArray(course?.lessons) ? course.lessons : [];
    const courseQuizzes = Array.isArray(course?.allCourseQuizzes) ? course.allCourseQuizzes : [];
    if (!lessons.length && !courseQuizzes.length) {
      setPracticeResults([]);
      setPracticeStats({ attempts: 0, avg: 0, best: 0, lastAt: null, lastScore: 0 });
      setAnalysisLoading(false);
      setAnalysisError(null);
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const quizContext = new Map();
      const courseQuizAliasMap = buildCourseQuizAliasMap(courseQuizzes);
      const lessonQuizIds = lessons
        .flatMap((lesson) => {
          const lessonId = (lesson?.id || lesson?.lesson_id || lesson?._id || '').toString();
          const lessonTitle = lesson?.title || 'ไม่ระบุหัวข้อ';
          const list = extractLessonQuizRefs(lesson);
          return list.map((rawQuizId) => {
            const qid = resolveQuizAlias(rawQuizId, courseQuizAliasMap);
            if (qid) {
              quizContext.set(qid, {
                lessonId,
                learningPath: lessonTitle,
                difficulty: null,
                sourceType: 'lesson',
              });
            }
            return qid;
          });
        })
        .filter(Boolean);
      const fallbackLessonQuizIds = lessonQuizIds.length === 0
        ? courseQuizzes
            .filter((quiz) => (quiz?.document_type || '').toLowerCase() !== 'mock_exam')
            .map((quiz) => {
              const qid = resolveQuizAlias(
                quiz?.quiz_id || quiz?.id || quiz?.document_id || '',
                courseQuizAliasMap
              );
              if (!qid) return null;
              if (!quizContext.has(qid)) {
                quizContext.set(qid, {
                  lessonId: null,
                  learningPath: quiz?.title || 'แบบฝึกหัด',
                  difficulty: quiz?.difficulty || quiz?.level || null,
                  sourceType: 'lesson',
                });
              }
              return qid;
            })
            .filter(Boolean)
        : [];
      const mockQuizIds = courseQuizzes
        .filter((quiz) => (quiz?.document_type || '').toLowerCase() === 'mock_exam')
        .map((quiz) => {
          const qid = resolveQuizAlias(
            quiz?.quiz_id || quiz?.id || quiz?.document_id || '',
            courseQuizAliasMap
          );
          if (!qid) return null;
          // Force mock exam context even if this quiz also appears in lesson.quizzes
          quizContext.set(qid, {
            lessonId: null,
            learningPath: quiz?.title || 'ข้อสอบจำลอง',
            difficulty: quiz?.difficulty || quiz?.level || null,
            sourceType: 'mock_exam',
          });
          return qid;
        })
        .filter(Boolean);

      const uniqueQuizIds = Array.from(new Set([
        ...lessonQuizIds,
        ...fallbackLessonQuizIds,
        ...mockQuizIds,
      ]));
      if (uniqueQuizIds.length === 0) {
        setPracticeResults([]);
        setPracticeStats({ attempts: 0, avg: 0, best: 0, lastAt: null, lastScore: 0 });
        return;
      }

      const userId = getUserId();
      const targetCourseId = (course?.id || course?.course_id || courseId || '').toString();
      const allowProtectedCourseAccess = !isCourseExpiredRecord(course);
      const quizMetaById = new Map();
      courseQuizzes.forEach((quiz) => {
        const normalizedQuizId = resolveQuizAlias(
          quiz?.quiz_id || quiz?.id || quiz?.document_id || quiz?.quizId || '',
          courseQuizAliasMap
        );
        if (normalizedQuizId) {
          quizMetaById.set(normalizedQuizId, quiz);
        }
      });

      const missingQuizIds = uniqueQuizIds.filter((qid) => !quizMetaById.has(qid));
      if (missingQuizIds.length > 0) {
        const missingMetas = await Promise.all(missingQuizIds.map(async (qid) => {
          try {
            const quizMeta = await secureAPI.courseAPI.getQuizById(qid, {
              userId: allowProtectedCourseAccess ? userId : undefined,
              courseId: targetCourseId || undefined,
            });
            return [qid, quizMeta];
          } catch (_) {
            return [qid, null];
          }
        }));
        missingMetas.forEach(([qid, quizMeta]) => {
          if (qid && quizMeta) {
            quizMetaById.set(qid, quizMeta);
          }
        });
      }

      const allowedQuizIds = new Set(uniqueQuizIds.map((qid) => String(qid)));
      const resultPayload = await secureAPI.courseAPI.getUserQuizResults(userId, {
        courseId: targetCourseId || undefined,
      });
      const resultsByQuizId = (Array.isArray(resultPayload?.results) ? resultPayload.results : []).reduce((acc, item) => {
        const normalizedQuizId = resolveQuizAlias(item?.quiz_id, courseQuizAliasMap);
        if (!normalizedQuizId || !allowedQuizIds.has(normalizedQuizId)) {
          return acc;
        }
        if (!acc[normalizedQuizId]) {
          acc[normalizedQuizId] = [];
        }
        acc[normalizedQuizId].push({
          ...item,
          quiz_id: normalizedQuizId,
        });
        return acc;
      }, {});

      const fetched = uniqueQuizIds.map((qid) => {
        try {
          const quizMeta = quizMetaById.get(qid) || null;
          const list = Array.isArray(resultsByQuizId[qid]) ? resultsByQuizId[qid] : [];
          if (list.length === 0) return [];
          const meta = quizContext.get(qid);
          const title = quizMeta?.title || quizMeta?.name || meta?.learningPath || 'แบบฝึกหัด';
          const difficultyBucket = normalizeDifficultyBucket(
            quizMeta?.difficulty || quizMeta?.level || meta?.difficulty
          );
          const quizQuestions = Array.isArray(quizMeta?.questions)
            ? quizMeta.questions
            : (Array.isArray(quizMeta?.questions_data) ? quizMeta.questions_data : []);

          const normalizeCorrectIndex = (question) => {
            const options = question?.choices || question?.options || [];
            if (!Array.isArray(options) || options.length === 0) return -1;
            const candidate = question?.correct_index ?? question?.correctAnswer ?? question?.correct_answer ?? question?.answer_index ?? question?.correct;
            if (typeof candidate === 'number' && !Number.isNaN(candidate)) {
              return Math.max(0, Math.min(options.length - 1, candidate));
            }
            if (typeof candidate === 'string') {
              const v = candidate.trim().toLowerCase();
              const map = { a: 0, '1': 0, ก: 0, b: 1, '2': 1, ข: 1, c: 2, '3': 2, ค: 2, d: 3, '4': 3, ง: 3 };
              if (v in map) return map[v];
              const exactIdx = options.findIndex((opt) => String(opt).trim().toLowerCase() === v);
              if (exactIdx >= 0) return exactIdx;
            }
            // Keep behavior consistent with exam-taking page where unknown answer key falls back to first choice.
            return 0;
          };

          return list.map((r) => {
            const totalQuestions = Math.max(1, Number(r?.total_questions) || quizQuestions.length || 1);
            const timeSpentSeconds = Math.max(0, Number(r?.time_spent_seconds) || 0);
            const answers = Array.isArray(r?.answers) ? r.answers : [];
            const perQuestionTimeSeconds = (r?.per_question_time_seconds && typeof r.per_question_time_seconds === 'object')
              ? r.per_question_time_seconds
              : {};
            const perQuestionTimes = Object.values(perQuestionTimeSeconds)
              .map((v) => Number(v))
              .filter((v) => Number.isFinite(v) && v > 0);
            const avgSecPerQuestion = perQuestionTimes.length > 0
              ? Math.round(perQuestionTimes.reduce((sum, v) => sum + v, 0) / perQuestionTimes.length)
              : null;
            const confidenceByQuestion = (r?.confidence_by_question && typeof r.confidence_by_question === 'object')
              ? r.confidence_by_question
              : {};

            let confidentTotal = 0;
            let confidentCorrect = 0;
            let confidentWrong = 0;
            let notConfidentTotal = 0;
            let notConfidentCorrect = 0;
            const questionInsights = [];

            quizQuestions.forEach((question, index) => {
              const qidFromMeta = String(question?.id || `q${index + 1}`);
              const confidenceValue = String(confidenceByQuestion[qidFromMeta] || '').trim().toLowerCase();
              const rawAnswer = answers[index];
              let normalizedAnswer = null;
              if (typeof rawAnswer === 'number' && Number.isInteger(rawAnswer) && rawAnswer >= 0) {
                normalizedAnswer = rawAnswer;
              } else if (typeof rawAnswer === 'string') {
                const trimmed = rawAnswer.trim();
                if (/^\d+$/.test(trimmed)) {
                  normalizedAnswer = Number(trimmed);
                }
              }
              const correctIdx = normalizeCorrectIndex(question);
              const isCorrect = correctIdx >= 0
                ? (normalizedAnswer != null ? normalizedAnswer === correctIdx : false)
                : null;
              const sec = Math.max(0, Number(perQuestionTimeSeconds[qidFromMeta] || 0));
              const qText = String(question?.question || question?.text || question?.prompt || `ข้อ ${index + 1}`).trim();
              const options = Array.isArray(question?.choices)
                ? question.choices
                : (Array.isArray(question?.options) ? question.options : []);
              const explanation = String(
                question?.explanation ||
                question?.rationale ||
                question?.solution ||
                question?.explain ||
                question?.answer_explanation ||
                question?.answerExplanation ||
                ''
              ).trim();

              questionInsights.push({
                question_id: qidFromMeta,
                question_index: index + 1,
                question_text: qText,
                question_context_text: extractQuestionContextText(question) || null,
                sec_per_question: sec,
                confidence: confidenceValue || null,
                is_correct: isCorrect,
                options,
                correct_answer_index: correctIdx,
                explanation,
                difficulty: question?.difficulty ?? null,
                topic_tag: String(
                  question?.topic_tag
                  || question?.topicTag
                  || question?.topic
                  || question?.category
                  || quizMeta?.topic_tag
                  || quizMeta?.topicTag
                  || quizMeta?.topic
                  || quizMeta?.category
                  || ''
                ).trim() || UNKNOWN_TOPIC_LABEL,
              });

              if (confidenceValue === 'confident') {
                confidentTotal += 1;
                if (isCorrect === true) confidentCorrect += 1;
                if (isCorrect === false) confidentWrong += 1;
              }
              if (confidenceValue === 'not_confident') {
                notConfidentTotal += 1;
                if (isCorrect === true) notConfidentCorrect += 1;
              }
            });

            return {
              ...r,
              quiz_id: qid,
              quiz_title: title,
              learning_path: meta?.learningPath || title,
              lesson_id: meta?.lessonId || (r?.lesson_id ? String(r.lesson_id) : null),
              source_type: meta?.sourceType || ((quizMeta?.document_type || '').toLowerCase() === 'mock_exam' ? 'mock_exam' : 'lesson'),
              difficulty_bucket: difficultyBucket,
              avg_sec_per_question: avgSecPerQuestion,
              total_time_spent_seconds: timeSpentSeconds,
              confident_total: confidentTotal,
              confident_correct: confidentCorrect,
              confident_wrong: confidentWrong,
              not_confident_total: notConfidentTotal,
              not_confident_correct: notConfidentCorrect,
              question_insights: questionInsights,
            };
          });
        } catch (_) {
          return [];
        }
      });

      const flat = fetched.flat().sort((a, b) => {
        const at = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
        const bt = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
        return bt - at;
      });

      const attempts = flat.length;
      const avg = attempts ? Math.round(flat.reduce((sum, r) => sum + (r.score || 0), 0) / attempts) : 0;
      const best = attempts ? Math.max(...flat.map((r) => r.score || 0)) : 0;
      const lastAt = attempts ? flat[0]?.submitted_at : null;
      const lastScore = attempts ? flat[0]?.score || 0 : 0;

      setPracticeResults(flat);
      setPracticeStats({ attempts, avg, best, lastAt, lastScore });
    } catch (e) {
      setAnalysisError('ไม่สามารถโหลดข้อมูลวิเคราะห์นักเรียนได้');
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'analysis' || activeTab === 'mock_exams') {
      loadPracticeAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, course?.lessons?.length, course?.allCourseQuizzes?.length]);

  const mockExamAttemptStats = practiceResults.reduce((acc, row) => {
    if ((row?.source_type || '').toLowerCase() !== 'mock_exam') return acc;
    const quizId = String(row?.quiz_id || '').trim();
    if (!quizId) return acc;
    if (!acc[quizId]) {
      acc[quizId] = {
        attempts: 0,
        latestScore: null,
        latestAt: 0,
      };
    }
    acc[quizId].attempts += 1;
    const submittedAt = row?.submitted_at ? new Date(row.submitted_at).getTime() : 0;
    if (submittedAt >= acc[quizId].latestAt) {
      acc[quizId].latestAt = submittedAt;
      acc[quizId].latestScore = Number.isFinite(Number(row?.score)) ? Math.max(0, Math.min(100, Number(row.score))) : null;
    }
    return acc;
  }, {});
  const sortedMockExams = useMemo(() => (
    Array.isArray(mockExams)
      ? mockExams
          .map((quiz, index) => ({ quiz, index }))
          .sort((a, b) => {
            const titleCompare = mockExamTitleCollator.compare(
              normalizeMockExamDisplayTitle(a.quiz?.title, a.index),
              normalizeMockExamDisplayTitle(b.quiz?.title, b.index)
            );
            if (titleCompare !== 0) return titleCompare;
            const aId = String(a.quiz?.quiz_id || a.quiz?.id || a.quiz?.document_id || '').trim();
            const bId = String(b.quiz?.quiz_id || b.quiz?.id || b.quiz?.document_id || '').trim();
            return mockExamTitleCollator.compare(aId, bId);
          })
          .map(({ quiz }) => quiz)
      : []
  ), [mockExams]);
  const mockExamTotalPages = Math.max(1, Math.ceil(sortedMockExams.length / MOCK_EXAMS_PER_PAGE));
  const mockExamPageStart = (mockExamPage - 1) * MOCK_EXAMS_PER_PAGE;
  const paginatedMockExams = sortedMockExams.slice(
    mockExamPageStart,
    mockExamPageStart + MOCK_EXAMS_PER_PAGE
  );

  useEffect(() => {
    setMockExamPage(1);
  }, [mockExams]);

  useEffect(() => {
    setMockExamPage((currentPage) => Math.min(Math.max(1, currentPage), mockExamTotalPages));
  }, [mockExamTotalPages]);

  const hasPracticeData = practiceStats.attempts > 0;
  const courseQuizAliasMap = buildCourseQuizAliasMap(
    Array.isArray(course?.allCourseQuizzes) ? course.allCourseQuizzes : []
  );
  const lessonOptions = Array.isArray(course?.lessons)
    ? course.lessons.map((lesson, idx) => ({
        id: (lesson?.id || lesson?.lesson_id || lesson?._id || `lesson-${idx}`).toString(),
        title: lesson?.title || `บทเรียนที่ ${idx + 1}`,
        quizIds: Array.from(new Set(
          extractLessonQuizRefs(lesson)
            .map((quizId) => resolveQuizAlias(quizId, courseQuizAliasMap))
            .filter(Boolean)
        )),
      }))
    : [];
  const mockExamOptions = Array.isArray(sortedMockExams)
    ? sortedMockExams
        .map((quiz, idx) => {
          const qid = (quiz?.quiz_id || quiz?.id || quiz?.document_id || '').toString();
          if (!qid) return null;
          return {
            id: qid,
            title: normalizeMockExamDisplayTitle(quiz?.title, idx),
            quizIds: [qid],
          };
        })
        .filter(Boolean)
    : [];
  const analysisOptions = analysisSourceType === 'mock_exam' ? mockExamOptions : lessonOptions;
  useEffect(() => {
    if (analysisSourceType === 'mock_exam') return;
    if (!analysisOptions.length) {
      if (analysisScope !== '') setAnalysisScope('');
      return;
    }
    const exists = analysisOptions.some((item) => item.id === analysisScope);
    if (!exists) {
      setAnalysisScope(analysisOptions[0].id);
    }
  }, [analysisSourceType, analysisScope, analysisOptions]);
  const analysisQuizMap = new Map(analysisOptions.map((item) => [item.id, new Set(item.quizIds)]));
  const activeScope = analysisOptions.find((item) => item.id === analysisScope) || null;
  const hasAnyLessonQuizMapping = lessonOptions.some(
    (item) => Array.isArray(item.quizIds) && item.quizIds.length > 0
  );
  const hasAnyLessonScopedResult = practiceResults.some((row) => String(row?.lesson_id || '').trim().length > 0);
  const hasLessonTypeAttempts = practiceResults.some(
    (row) => (row?.source_type || '').toLowerCase() !== 'mock_exam'
  );
  const hasUnscopedLessonAttempts = (
    analysisSourceType === 'lesson'
    && hasLessonTypeAttempts
    && !hasAnyLessonQuizMapping
    && !hasAnyLessonScopedResult
  );
  const canUseGlobalLessonFallback = (
    analysisSourceType === 'lesson'
    && lessonOptions.length <= 1
    && !hasAnyLessonQuizMapping
    && !hasAnyLessonScopedResult
  );
  const filteredResults = analysisSourceType === 'mock_exam'
    ? practiceResults.filter((r) => r?.source_type === 'mock_exam')
    : activeScope
      ? practiceResults.filter((r) => {
          if ((r?.source_type || '').toLowerCase() === 'mock_exam') return false;
          const activeScopeId = String(activeScope.id || '').trim();
          const rowLessonId = String(r?.lesson_id || '').trim();
          if (rowLessonId && activeScopeId && rowLessonId === activeScopeId) {
            return true;
          }
          const scopedQuizIds = analysisQuizMap.get(activeScope.id);
          if (scopedQuizIds && scopedQuizIds.size > 0) {
            return scopedQuizIds.has(r.quiz_id);
          }
          return canUseGlobalLessonFallback;
        })
      : [];
  const courseTopicLabels = useMemo(() => getCourseTopicLabels(course), [course]);
  const resolveAnalysisQuestionTopic = (item) => resolveCourseTopicLabel(item, courseTopicLabels);
  const mockTopicOptions = analysisSourceType === 'mock_exam'
    ? Array.from(new Set(
      filteredResults.flatMap((attempt) => (
        Array.isArray(attempt?.question_insights)
          ? attempt.question_insights.map(resolveAnalysisQuestionTopic).filter(Boolean)
          : []
      ))
    )).sort((a, b) => a.localeCompare(b, 'th'))
    : [];
  useEffect(() => {
    if (analysisSourceType !== 'mock_exam') {
      if (analysisTopic !== 'all') setAnalysisTopic('all');
      return;
    }
    if (analysisTopic === 'all') return;
    if (!mockTopicOptions.includes(analysisTopic)) {
      setAnalysisTopic('all');
    }
  }, [analysisSourceType, analysisTopic, mockTopicOptions]);
  const filteredResultsByTopic = analysisSourceType === 'mock_exam' && analysisTopic !== 'all'
    ? filteredResults
        .map((attempt) => {
          const scopedQuestions = (Array.isArray(attempt?.question_insights) ? attempt.question_insights : [])
            .filter((item) => resolveAnalysisQuestionTopic(item) === analysisTopic);
          if (scopedQuestions.length === 0) return null;
          const answeredQuestions = scopedQuestions.filter((item) => item?.is_correct === true || item?.is_correct === false);
          const correctCount = answeredQuestions.filter((item) => item?.is_correct === true).length;
          const confidentQuestions = scopedQuestions.filter((item) => item?.confidence === 'confident');
          const confidentCorrect = confidentQuestions.filter((item) => item?.is_correct === true).length;
          const confidentWrong = confidentQuestions.filter((item) => item?.is_correct === false).length;
          const notConfidentQuestions = scopedQuestions.filter((item) => item?.confidence === 'not_confident');
          const notConfidentCorrect = notConfidentQuestions.filter((item) => item?.is_correct === true).length;
          const validSec = scopedQuestions
            .map((item) => Number(item?.sec_per_question))
            .filter((value) => Number.isFinite(value) && value > 0);
          const avgSec = validSec.length > 0
            ? Math.round(validSec.reduce((sum, value) => sum + value, 0) / validSec.length)
            : 0;
          return {
            ...attempt,
            score: answeredQuestions.length > 0 ? Math.round((correctCount / answeredQuestions.length) * 100) : 0,
            avg_sec_per_question: avgSec,
            confident_total: confidentQuestions.length,
            confident_correct: confidentCorrect,
            confident_wrong: confidentWrong,
            not_confident_total: notConfidentQuestions.length,
            not_confident_correct: notConfidentCorrect,
            question_insights: scopedQuestions,
          };
        })
        .filter(Boolean)
    : filteredResults;
  const hasFilteredData = filteredResultsByTopic.length > 0;
  const analysisScopeLabel = activeScope?.title || (analysisSourceType === 'mock_exam' ? 'แบบทดสอบที่เลือก' : 'บทเรียนที่เลือก');
  const calcStats = (list) => {
    const attempts = list.length;
    if (!attempts) return { attempts: 0, avg: 0, best: 0, lastAt: null, lastScore: 0 };
    const avg = Math.round(list.reduce((sum, r) => sum + (r.score || 0), 0) / attempts);
    const best = Math.max(...list.map((r) => r.score || 0));
    const lastAt = list[0]?.submitted_at || null;
    const lastScore = list[0]?.score || 0;
    return { attempts, avg, best, lastAt, lastScore };
  };
  const summaryIsPlaceholder = !hasFilteredData;
  const summaryStats = summaryIsPlaceholder
    ? { attempts: 4, avg: 68, best: 82, lastScore: 74, lastAt: null }
    : calcStats(filteredResultsByTopic);

  const getScoreTone = (value) => {
    if (value >= 80) return 'good';
    if (value >= 60) return 'mid';
    return 'low';
  };
  const getScoreLabel = (value) => {
    if (value >= 80) return 'ดี';
    if (value >= 60) return 'เฝ้าระวัง';
    return 'ต้องเร่งแก้';
  };

  const scopedResults = summaryIsPlaceholder ? [] : filteredResultsByTopic;
  const learningPathFallback = activeScope ? [{ key: activeScope.id, label: activeScope.title, scores: [] }] : [];
  const learningPathMap = scopedResults.reduce((acc, row) => {
    const key = row?.learning_path || row?.quiz_title || 'ไม่ระบุหัวข้อ';
    if (!acc.has(key)) acc.set(key, { key, label: key, scores: [] });
    acc.get(key).scores.push({
      score: Number(row?.score) || 0,
      submittedAt: row?.submitted_at ? new Date(row.submitted_at).getTime() : 0,
    });
    return acc;
  }, new Map());
  learningPathFallback.forEach((item) => {
    if (!learningPathMap.has(item.label)) {
      learningPathMap.set(item.label, item);
    }
  });
  const learningPathRows = Array.from(learningPathMap.values()).map((item) => {
    const scores = item.scores || [];
    const attempts = scores.length;
    const avg = attempts ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / attempts) : 0;
    const recentScores = [...scores].sort((a, b) => a.submittedAt - b.submittedAt).slice(-4).map((s) => s.score);
    const last = recentScores.length ? recentScores[recentScores.length - 1] : 0;
    const prev = recentScores.length > 1 ? recentScores[recentScores.length - 2] : null;
    const delta = prev == null ? 0 : last - prev;
    return {
      label: item.label,
      avg,
      attempts,
      recentScores,
      last,
      delta,
    };
  }).sort((a, b) => b.avg - a.avg);

  const difficultyBuckets = ['easy', 'medium', 'hard'];
  const difficultyLabel = {
    easy: 'ง่าย',
    medium: 'ปานกลาง',
    hard: 'ยาก',
  };
  const trendAccentColor = '#3567bd';
  const difficultyMap = scopedResults.reduce((acc, row) => {
    const bucket = difficultyBuckets.includes(row?.difficulty_bucket) ? row.difficulty_bucket : 'medium';
    const current = acc.get(bucket) || { total: 0, attempts: 0 };
    current.total += Number(row?.score) || 0;
    current.attempts += 1;
    acc.set(bucket, current);
    return acc;
  }, new Map());
  const difficultyRows = difficultyBuckets.map((bucket) => {
    const value = difficultyMap.get(bucket) || { total: 0, attempts: 0 };
    const avg = value.attempts ? Math.round(value.total / value.attempts) : 0;
    return {
      key: bucket,
      label: difficultyLabel[bucket],
      avg,
      attempts: value.attempts,
    };
  });

  const overallScore = summaryIsPlaceholder ? 78 : Math.max(0, Math.min(100, summaryStats.avg || 0));
  const overallRadius = 54;
  const overallCircumference = 2 * Math.PI * overallRadius;
  const overallOffset = overallCircumference * (1 - overallScore / 100);
  const subjectRows = (learningPathRows.length ? learningPathRows : [
    { label: 'คณิตศาสตร์', avg: 72, attempts: 3 },
    { label: 'วิทยาศาสตร์', avg: 64, attempts: 3 },
    { label: 'สังคมศึกษา', avg: 81, attempts: 2 },
    { label: 'ภาษาอังกฤษ', avg: 69, attempts: 2 },
  ]).slice(0, 4);

  const progressEntries = summaryIsPlaceholder
    ? [54, 60, 67, 74, 81].map((score, idx) => ({
      score,
      submittedAt: new Date(Date.now() - (4 - idx) * 24 * 60 * 60 * 1000).toISOString(),
    }))
    : scopedResults
      .slice()
      .sort((a, b) => {
        const at = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
        const bt = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
        return at - bt;
      })
      .slice(-5)
      .map((r) => ({
        score: Math.max(0, Math.min(100, Number(r?.score) || 0)),
        submittedAt: r?.submitted_at || null,
      }));
  const hasEnoughProgressData = progressEntries.length >= 3;
  const progressMy = progressEntries.map((row) => row.score);
  const progressClass = progressMy.map((value, idx) => Math.max(0, Math.min(100, Math.round(value * 0.82 + 8 + idx))));
  const progressLabels = progressEntries.map((row) => {
    if (!row.submittedAt) return '-';
    const date = new Date(row.submittedAt);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' });
  });
  const progressMax = Math.max(0, ...progressMy, ...progressClass);
  const progressAxisMax = progressMax <= 35 ? 40 : progressMax <= 60 ? 70 : 100;
  const progressTicks = [0, 25, 50, 75, 100].map((p) => Math.round((progressAxisMax * p) / 100));

  const buildLinePoints = (arr) => {
    const safeCount = Math.max(2, arr.length);
    const span = 308;
    const startX = 28;
    return arr.map((value, idx) => {
      const x = safeCount === 1 ? startX : startX + (idx * span) / (safeCount - 1);
      const y = 144 - (Math.max(0, Math.min(progressAxisMax, value)) / progressAxisMax) * 110;
      return { x, y, value };
    });
  };
  const myPoints = buildLinePoints(progressMy);
  const classPoints = buildLinePoints(progressClass);
  const myPolyline = myPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');
  const classPolyline = classPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');
  const myLastPoint = myPoints[myPoints.length - 1] || null;
  const classLastPoint = classPoints[classPoints.length - 1] || null;
  const progressDelta = progressMy.length >= 2
    ? Math.round(progressMy[progressMy.length - 1] - progressMy[progressMy.length - 2])
    : 0;
  const progressVsBaseline = (myLastPoint && classLastPoint)
    ? Math.round(myLastPoint.value - classLastPoint.value)
    : 0;
  const progressInsight = !hasEnoughProgressData
    ? 'ข้อมูลยังน้อย (น้อยกว่า 3 ครั้ง) แนวโน้มยังไม่เสถียร ควรทำแบบฝึกเพิ่ม'
    : `แนวโน้มล่าสุด ${progressDelta >= 0 ? '+' : ''}${progressDelta}% และ${progressVsBaseline >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'}ค่าเทียบ ${Math.abs(progressVsBaseline)}%`;

  const gradeTemplate = [
    { key: 'A', min: 80, max: 101, color: '#3b82f6' },
    { key: 'B', min: 70, max: 80, color: '#ef4444' },
    { key: 'C', min: 60, max: 70, color: '#facc15' },
    { key: 'D', min: 50, max: 60, color: '#22c55e' },
    { key: 'F', min: -1, max: 50, color: '#f97316' },
  ];
  const gradeSource = summaryIsPlaceholder ? [92, 78, 63, 55, 47, 82, 71, 66, 88, 59] : scopedResults.map((r) => Number(r?.score) || 0);
  const gradeTotal = gradeSource.length || 1;
  const gradeRows = gradeTemplate.map((g) => {
    const count = gradeSource.filter((score) => score >= g.min && score < g.max).length;
    const percent = Math.round((count / gradeTotal) * 100);
    return { ...g, count, percent };
  });
  const failPercent = gradeRows.find((row) => row.key === 'F')?.percent || 0;
  const gradeHealth = failPercent >= 80 ? 'critical' : failPercent >= 50 ? 'warn' : 'ok';
  const gradeInsight = gradeHealth === 'critical'
    ? 'สถานะวิกฤต: คะแนนส่วนใหญ่อยู่ระดับ F ควรเริ่มทบทวนพื้นฐานทันที'
    : gradeHealth === 'warn'
      ? 'สถานะเสี่ยง: คะแนนระดับ F ยังสูง ควรเสริมบทเรียนแกนหลัก'
      : 'แนวโน้มดี: สัดส่วนคะแนนต่ำลดลงแล้ว';
  const donutSegments = (() => {
    let cumulative = 0;
    return gradeRows.map((row) => {
      const value = row.percent;
      const start = cumulative;
      cumulative += value;
      return {
        ...row,
        dash: `${value} ${100 - value}`,
        offset: 25 - start,
      };
    });
  })();
  const baselineScore = summaryIsPlaceholder
    ? 65
    : Math.round(progressClass.reduce((sum, value) => sum + value, 0) / Math.max(1, progressClass.length));
  const scoreDiff = overallScore - baselineScore;
  const performanceTone = getScoreTone(overallScore);
  const performanceLabel = getScoreLabel(overallScore);
  const performanceMessage = scoreDiff >= 0
    ? `สูงกว่าค่าเทียบ ${scoreDiff}%`
    : `ต่ำกว่าค่าเทียบ ${Math.abs(scoreDiff)}%`;

  const lastUpdatedLabel = summaryStats.lastAt ? new Date(summaryStats.lastAt).toLocaleString() : 'ยังไม่มีข้อมูลล่าสุด';
  const lessons = Array.isArray(course?.lessons) ? course.lessons : [];
  const allCourseQuizzes = Array.isArray(course?.allCourseQuizzes) ? course.allCourseQuizzes : [];
  const toQuizQuestionList = (quiz) => {
    if (Array.isArray(quiz?.questions)) return quiz.questions;
    if (Array.isArray(quiz?.questions_data)) return quiz.questions_data;
    return [];
  };
  const toQuizQuestionCount = (quiz) => {
    const explicit = Number(
      quiz?.total_questions
      ?? quiz?.question_count
      ?? quiz?.quiz_count
      ?? quiz?.questions_count
    );
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return toQuizQuestionList(quiz).length;
  };
  const allCourseQuizAliasMap = buildCourseQuizAliasMap(allCourseQuizzes);
  const quizMetaById = new Map();
  allCourseQuizzes.forEach((quiz) => {
    const normalizedQuizId = resolveQuizAlias(
      quiz?.quiz_id || quiz?.id || quiz?.document_id || quiz?.quizId || '',
      allCourseQuizAliasMap
    );
    if (normalizedQuizId) {
      quizMetaById.set(normalizedQuizId, quiz);
    }
  });
  const lessonQuizCount = lessons.reduce((sum, lesson) => {
    return sum + extractLessonQuizRefs(lesson).length;
  }, 0);
  const tutorDetail = String(course?.detail || course?.target_profile || '').trim();
  const tutorDescription = String(course?.description || '').trim();
  const courseLevelLabel = String(
    course?.grade_level
    || course?.level
    || course?.grade
    || course?.difficulty
    || ''
  ).trim();
  const normalizedCourseLevelLabel = courseLevelLabel || 'ไม่ระบุระดับ';
  const normalizedInstructorName = String(
    course?.instructor || course?.teacher_name || course?.teacher || course?.owner_name || ''
  ).trim() || 'ไม่ระบุผู้สอน';
  const topicQuestionCountMap = new Map();
  allCourseQuizzes.forEach((quiz) => {
    const quizQuestionCount = toQuizQuestionCount(quiz);
    const questionList = toQuizQuestionList(quiz);
    if (questionList.length > 0) {
      questionList.forEach((question) => {
        const topic = String(
          question?.topic_tag
          || question?.topicTag
          || question?.topic
          || question?.category
          || ''
        ).trim();
        if (!topic) return;
        topicQuestionCountMap.set(topic, (topicQuestionCountMap.get(topic) || 0) + 1);
      });
      return;
    }

    const quizTopic = String(
      quiz?.topic_tag || quiz?.topicTag || quiz?.topic || quiz?.category || ''
    ).trim();
    if (!quizTopic || quizQuestionCount <= 0) return;
    topicQuestionCountMap.set(quizTopic, (topicQuestionCountMap.get(quizTopic) || 0) + quizQuestionCount);
  });
  const topicQuestionRows = Array.from(topicQuestionCountMap.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count);
  const lessonOverviewRows = lessons
    .map((lesson, index) => {
      const lessonTitle = String(lesson?.title || '').trim() || `บทเรียนที่ ${index + 1}`;
      const lessonDescription = String(lesson?.description || lesson?.summary || '').trim();
      const lessonQuizIds = Array.from(new Set(
        extractLessonQuizRefs(lesson)
          .map((quizId) => resolveQuizAlias(quizId, allCourseQuizAliasMap))
          .filter(Boolean)
      ));
      const questionCount = lessonQuizIds.reduce((sum, quizId) => {
        const quiz = quizMetaById.get(quizId);
        return sum + toQuizQuestionCount(quiz);
      }, 0);
      return {
        title: lessonTitle,
        description: lessonDescription,
        questionCount,
      };
    })
    .filter((item) => item.title || item.description || item.questionCount > 0);
  const tutorContentItems = Array.isArray(course?.content_items) && course.content_items.length > 0
    ? course.content_items
        .map((item) => ({
          title: String(item?.title || '').trim(),
          description: String(item?.description || '').trim(),
          questionCount: Number(item?.question_count ?? item?.questions ?? item?.count ?? 0),
        }))
        .filter((item) => item.title || item.description)
    : (Array.isArray(course?.topics)
      ? course.topics
          .map((topic) => String(topic || '').trim())
          .filter(Boolean)
          .map((topic) => ({ title: topic, description: '', questionCount: 0 }))
      : []);
  const formatQuestionCountLabel = (value) => (
    Number.isFinite(Number(value)) && Number(value) > 0
      ? `${Number(value).toLocaleString('th-TH')} ข้อ`
      : 'ยังไม่ระบุ'
  );
  const overviewSourceRows = tutorContentItems.length > 0
    ? tutorContentItems
    : (topicQuestionRows.length > 0
      ? topicQuestionRows.map((item) => ({
          title: item.title,
          description: '',
          questionCount: item.count,
        }))
      : lessonOverviewRows);
  const overviewTopicRows = overviewSourceRows
    .slice(0, 4)
    .map((item, index) => {
      const title = String(item?.title || '').trim() || `หัวข้อที่ ${index + 1}`;
      const explicitCount = Number(item?.questionCount ?? item?.question_count ?? item?.questions ?? item?.count);
      const inferredCountFromTopic = topicQuestionCountMap.get(title) || 0;
      const resolvedCount = Number.isFinite(explicitCount) && explicitCount > 0
        ? explicitCount
        : inferredCountFromTopic;
      return {
        title,
        description: String(item?.description || '').trim(),
        questionCount: formatQuestionCountLabel(resolvedCount),
      };
    });
  const courseExerciseIds = new Set(
    allCourseQuizzes
      .filter((quiz) => String(quiz?.document_type || 'manual').trim().toLowerCase() !== 'mock_exam')
      .map((quiz, index) => String(
        quiz?.quiz_id || quiz?.id || quiz?.document_id || quiz?.quizId || `exercise-${index}`
      ).trim())
      .filter(Boolean)
  );
  const totalExerciseCount = courseExerciseIds.size > 0 ? courseExerciseIds.size : lessonQuizCount;
  const totalExerciseLabel = totalExerciseCount > 0
    ? `${totalExerciseCount.toLocaleString('th-TH')} ชุด`
    : 'ยังไม่มีแบบฝึกหัด';
  const coursePriceRaw = Number(course?.price ?? course?.price_thb ?? course?.tuition);
  const coursePriceLabel = Number.isFinite(coursePriceRaw) && coursePriceRaw > 0
    ? `${coursePriceRaw.toLocaleString('th-TH')} บาท`
    : (Number.isFinite(coursePriceRaw) && coursePriceRaw === 0 ? 'ฟรี' : 'ยังไม่ระบุราคา');
  const coursePriceValueLabel = Number.isFinite(coursePriceRaw) && coursePriceRaw > 0
    ? coursePriceRaw.toLocaleString('th-TH')
    : coursePriceLabel;
  const coursePriceUnitLabel = Number.isFinite(coursePriceRaw) && coursePriceRaw > 0 ? 'บาท' : '';
  const courseUpdatedAt = course?.updated_at || course?.updatedAt || course?.last_updated || course?.modified_at || course?.created_at || null;
  const courseUpdatedLabel = formatThaiMonthYear(courseUpdatedAt);
  const courseUpdatedDisplayLabel = courseUpdatedLabel === '-' ? 'ยังไม่ระบุ' : courseUpdatedLabel;
  const automaticCourseFormatLabel = lessons.length > 0 && (allCourseQuizzes.length > 0 || lessonQuizCount > 0)
    ? 'แบบฝึกหัด + ข้อสอบจำลอง + AI ผู้ช่วย'
    : lessons.length > 0
      ? 'เน้นบทเรียนพร้อมแบบฝึก'
      : (allCourseQuizzes.length > 0 || lessonQuizCount > 0)
        ? 'เน้นแบบฝึกหัดและข้อสอบ'
        : 'รออัปเดตรายละเอียด';
  const courseFormatLabel = String(
    course?.course_format || course?.format || ''
  ).trim() || automaticCourseFormatLabel;
  const completedExercises = exerciseProgress.completed;
  const totalExercises = exerciseProgress.total || lessonQuizCount;
  const exerciseProgressPercent = totalExercises > 0
    ? Math.round((completedExercises / totalExercises) * 100)
    : 0;
  const completedMockExams = new Set(
    practiceResults
      .filter((row) => row?.source_type === 'mock_exam' && row?.quiz_id)
      .map((row) => String(row.quiz_id))
  ).size;
  const totalMockExams = mockExamOptions.length;
  const courseExpiresAt = course?.expires_at || null;
  const remainingTimeInfo = getRemainingTimeInfo(courseExpiresAt, currentTimestamp);
  const courseIsExpired = isCourseExpiredRecord(course);
  const hasExpiryInfo = Boolean(courseExpiresAt);
  const expiryAlertTone = hasExpiryInfo && remainingTimeInfo.totalHours != null
    ? (
      remainingTimeInfo.totalHours <= 72
        ? 'danger'
        : (remainingTimeInfo.totalHours <= 168 ? 'warning' : 'normal')
    )
    : 'normal';
  const expiryRemainingText = hasExpiryInfo
    ? `⏳ เหลือเวลาเรียนอีก: ${remainingTimeInfo.label}`
    : 'คอร์สนี้ไม่มีวันหมดอายุ';
  const expiryDateText = hasExpiryInfo
    ? `📅 หมดอายุ ${formatThaiDateTime(courseExpiresAt)}`
    : '';
  const mockExamProgressPercent = totalMockExams > 0
    ? Math.round((completedMockExams / totalMockExams) * 100)
    : 0;
  const activeLessonProgress = analysisSourceType === 'lesson' && activeScope
    ? (lessonExerciseProgress[String(activeScope.id)] || null)
    : null;
  const lessonProgressCompleted = activeLessonProgress?.completed ?? 0;
  const lessonProgressTotal = activeLessonProgress?.total
    ?? (activeScope ? (Array.isArray(activeScope.quizIds) ? activeScope.quizIds.length : 0) : 0);
  const lessonProgressPercent = lessonProgressTotal > 0
    ? Math.round((lessonProgressCompleted / lessonProgressTotal) * 100)
    : 0;
  const analysisProgressCompleted = analysisSourceType === 'mock_exam' ? completedMockExams : lessonProgressCompleted;
  const analysisProgressTotal = analysisSourceType === 'mock_exam' ? totalMockExams : lessonProgressTotal;
  const analysisProgressPercent = analysisSourceType === 'mock_exam' ? mockExamProgressPercent : lessonProgressPercent;
  const analysisProgressLabel = analysisSourceType === 'mock_exam' ? 'ข้อสอบจำลองทั้งหมด' : 'แบบฝึกในบทเรียนนี้';
  const hasOnlyMockExamData = analysisSourceType === 'lesson' && analysisProgressTotal === 0 && totalMockExams > 0;
  const analysisRows = summaryIsPlaceholder ? [] : filteredResultsByTopic;
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentSevenRows = analysisRows.filter((row) => {
    const t = row?.submitted_at ? new Date(row.submitted_at).getTime() : 0;
    return t >= sevenDaysAgo;
  });
  const accuracy7d = recentSevenRows.length
    ? Math.round(recentSevenRows.reduce((sum, row) => sum + (Number(row?.score) || 0), 0) / recentSevenRows.length)
    : 0;
  const avgSecPerQuestion = analysisRows.length
    ? (() => {
      const valid = analysisRows
        .map((row) => Number(row?.avg_sec_per_question))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (valid.length === 0) return 0;
      return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
    })()
    : 0;
  const confidenceSummary = analysisRows.reduce((acc, row) => {
    acc.confidentTotal += Number(row?.confident_total) || 0;
    acc.confidentCorrect += Number(row?.confident_correct) || 0;
    acc.confidentWrong += Number(row?.confident_wrong) || 0;
    acc.notConfidentTotal += Number(row?.not_confident_total) || 0;
    acc.notConfidentCorrect += Number(row?.not_confident_correct) || 0;
    return acc;
  }, { confidentTotal: 0, confidentCorrect: 0, confidentWrong: 0, notConfidentTotal: 0, notConfidentCorrect: 0 });
  const confidenceCalibration = confidenceSummary.confidentTotal > 0
    ? Math.round((confidenceSummary.confidentCorrect / confidenceSummary.confidentTotal) * 100)
    : 0;
  const confidentWrongRate = confidenceSummary.confidentTotal > 0
    ? Math.round((confidenceSummary.confidentWrong / confidenceSummary.confidentTotal) * 100)
    : 0;

  const recentFiveAttempts = analysisRows
    .slice()
    .sort((a, b) => {
      const at = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const bt = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return bt - at;
    })
    .slice(0, 5);
  const latestAttempt = recentFiveAttempts[0] || null;
  const latestTopPriorityQuestions = recentFiveAttempts
    .flatMap((attempt) => {
      const attemptQuestions = Array.isArray(attempt?.question_insights) ? attempt.question_insights : [];
      return attemptQuestions.map((item) => {
        const isConfidentWrong = item?.confidence === 'confident' && item?.is_correct === false;
        const wrongPenalty = item?.is_correct === false ? 40 : 0;
        const confidentWrongPenalty = isConfidentWrong ? 45 : 0;
        const speedPenalty = Math.min(25, Math.max(0, (Number(item?.sec_per_question) || 0) - avgSecPerQuestion));
        const priority = confidentWrongPenalty + wrongPenalty + speedPenalty;
        return {
          ...item,
          priority,
          isConfidentWrong,
          source_quiz_title: attempt?.quiz_title || 'แบบฝึกหัด',
          source_submitted_at: attempt?.submitted_at || null,
        };
      });
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);
  const activePriorityQuestion = latestTopPriorityQuestions.length > 0
    ? latestTopPriorityQuestions[Math.max(0, Math.min(priorityQuestionIndex, latestTopPriorityQuestions.length - 1))]
    : null;
  const latestTopPracticeQuestions = latestTopPriorityQuestions.filter((item) => (
    Array.isArray(item?.options)
    && item.options.length >= 2
    && Number.isInteger(item?.correct_answer_index)
    && item.correct_answer_index >= 0
    && item.correct_answer_index < item.options.length
  ));
  const topPracticeQuiz = latestTopPracticeQuestions.length > 0
    ? {
      id: `latest-top10-recent5-${latestAttempt?.quiz_id || 'practice'}-${latestAttempt?.submitted_at || 'now'}`,
      title: 'ฝึกซ้ำ 10 ข้อที่ควรทบทวน',
      description: 'สร้างจากข้อที่ระบบจัดอันดับให้ทบทวนจาก 5 ครั้งล่าสุด',
      totalQuestions: latestTopPracticeQuestions.length,
      timeLimit: Math.max(10, latestTopPracticeQuestions.length * 2),
      questions: latestTopPracticeQuestions.map((item, idx) => ({
        id: item.question_id || `review-${idx + 1}`,
        context: item.question_context || item.question_context_text || null,
        question: String(item.question_text || `ข้อ ${idx + 1}`),
        options: item.options,
        correctAnswer: item.correct_answer_index,
        explanation: item.explanation || '',
        difficulty: item.difficulty,
        topic: String(item.topic || item.topic_tag || '').trim() || null,
        topic_tag: String(item.topic_tag || item.topic || '').trim() || null,
        quizTitle: String(item.quiz_title || item.source_quiz_title || '').trim() || null,
        quiz_title: String(item.quiz_title || item.source_quiz_title || '').trim() || null,
      })),
    }
    : null;

  useEffect(() => {
    setPriorityQuestionIndex((prev) => {
      if (latestTopPriorityQuestions.length === 0) return 0;
      if (prev < 0) return 0;
      if (prev >= latestTopPriorityQuestions.length) return latestTopPriorityQuestions.length - 1;
      return prev;
    });
  }, [latestTopPriorityQuestions.length]);

  const questionDifficultyInsights = analysisRows
    .flatMap((row) => (Array.isArray(row?.question_insights) ? row.question_insights : []))
    .map((item) => ({
      ...item,
      difficulty_bucket: normalizeDifficultyBucket(item?.difficulty),
    }));

  const difficultyPerformance = difficultyBuckets.map((bucket) => {
    const questions = questionDifficultyInsights.filter((row) => row?.difficulty_bucket === bucket);
    const answeredQuestions = questions.filter((row) => row?.is_correct === true || row?.is_correct === false);
    const attempts = answeredQuestions.length;
    const accuracy = attempts
      ? Math.round((answeredQuestions.filter((row) => row?.is_correct === true).length / attempts) * 100)
      : 0;
    const validSec = questions
      .map((row) => Number(row?.sec_per_question))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgSec = validSec.length
      ? Math.round(validSec.reduce((sum, value) => sum + value, 0) / validSec.length)
      : 0;
    const confidentAnswered = questions.filter(
      (row) => row?.confidence === 'confident' && (row?.is_correct === true || row?.is_correct === false)
    );
    const confidentTotal = confidentAnswered.length;
    const confidentWrong = confidentAnswered.filter((row) => row?.is_correct === false).length;
    const wrongRate = confidentTotal ? Math.round((confidentWrong / confidentTotal) * 100) : 0;
    const confidenceMatchRate = confidentTotal ? Math.max(0, 100 - wrongRate) : 0;
    const status = attempts === 0
      ? 'ยังไม่มีข้อมูล'
      : (accuracy >= 75 && wrongRate < 20
        ? 'ดี'
        : (accuracy >= 55 ? 'เฝ้าระวัง' : 'เร่งด่วน'));
    return {
      key: bucket,
      label: difficultyLabel[bucket],
      attempts,
      accuracy,
      avgSec,
      wrongRate,
      confidenceMatchRate,
      status,
    };
  });

  const trendEntries = analysisRows
    .slice()
    .sort((a, b) => {
      const at = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const bt = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return at - bt;
    })
    .slice(-30)
    .flatMap((row) => {
      const submittedAtTs = row?.submitted_at ? new Date(row.submitted_at).getTime() : 0;
      const questionRows = Array.isArray(row?.question_insights) ? row.question_insights : [];
      return difficultyBuckets.map((bucket) => {
        const bucketQuestions = questionRows.filter((item) => (
          normalizeDifficultyBucket(item?.difficulty) === bucket
          && (item?.is_correct === true || item?.is_correct === false)
        ));
        if (bucketQuestions.length === 0) return null;
        const correctCount = bucketQuestions.filter((item) => item?.is_correct === true).length;
        const secValues = bucketQuestions
          .map((item) => Number(item?.sec_per_question))
          .filter((value) => Number.isFinite(value) && value > 0);
        const avgSec = secValues.length > 0
          ? Math.round(secValues.reduce((sum, value) => sum + value, 0) / secValues.length)
          : null;
        return {
          ts: submittedAtTs,
          score: Math.round((correctCount / bucketQuestions.length) * 100),
          sec: avgSec,
          difficulty: bucket,
          label: row?.submitted_at
            ? new Date(row.submitted_at).toLocaleString('th-TH', {
              day: '2-digit',
              month: '2-digit'
            })
            : '-',
        };
      }).filter(Boolean);
    })
    .filter((entry) => entry.ts > 0);

  const trendViewOptions = [
    { key: 'easy', label: 'ง่าย' },
    { key: 'medium', label: 'ปานกลาง' },
    { key: 'hard', label: 'ยาก' },
  ];
  const mockTopicAccuracyRows = analysisSourceType === 'mock_exam'
    ? (() => {
      const topicMap = new Map();
      analysisRows.forEach((row) => {
        const questionRows = Array.isArray(row?.question_insights) ? row.question_insights : [];
        questionRows.forEach((item) => {
          if (!(item?.is_correct === true || item?.is_correct === false)) return;
          const topic = resolveAnalysisQuestionTopic(item);
          const current = topicMap.get(topic) || { topic, total: 0, correct: 0 };
          current.total += 1;
          if (item?.is_correct === true) current.correct += 1;
          topicMap.set(topic, current);
        });
      });
      return Array.from(topicMap.values())
        .map((entry) => ({
          ...entry,
          accuracy: entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0,
        }))
        .sort((a, b) => {
          if (a.topic === UNKNOWN_TOPIC_LABEL) return 1;
          if (b.topic === UNKNOWN_TOPIC_LABEL) return -1;
          return a.topic.localeCompare(b.topic, 'th');
        });
    })()
    : [];
  const mockOverallAttemptRows = analysisSourceType === 'mock_exam'
    ? analysisRows
        .slice()
        .sort((a, b) => {
          const at = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
          const bt = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
          return at - bt;
        })
        .slice(-12)
        .map((row, idx) => ({
          id: row?.result_id || `attempt-${idx}`,
          score: Math.max(0, Math.min(100, Number(row?.score) || 0)),
          attemptLabel: `ครั้งที่ ${idx + 1}`,
          quizTitle: String(row?.quiz_title || row?.learning_path || 'ข้อสอบจำลอง').trim(),
          dateLabel: row?.submitted_at
            ? new Date(row.submitted_at).toLocaleDateString('th-TH', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
            })
            : '-',
        }))
    : [];
  const trendSeriesRows = trendEntries
    .filter((entry) => entry.difficulty === trendDifficultyView)
    .sort((a, b) => a.ts - b.ts)
    .slice(-10)
    .map((entry, idx) => ({
      ...entry,
      attemptLabel: `ครั้งที่ ${idx + 1}`,
      dateLabel: entry.ts
        ? new Date(entry.ts).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        })
        : '-',
    }));
  const trendSeriesSummaryRows = trendEntries
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .slice(-10)
    .map((entry, idx) => ({
      ...entry,
      attemptLabel: `ครั้งที่ ${idx + 1}`,
      dateLabel: entry.ts
        ? new Date(entry.ts).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        })
        : '-',
    }));

  const trendChart = (() => {
    const width = 960;
    const height = 360;
    const left = 54;
    const right = 20;
    const top = 18;
    const bottom = 48;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;

    const maxValue = 100;
    const valueRange = 100;

    const xFor = (index) => {
      const count = Math.max(1, trendSeriesRows.length);
      const slot = innerWidth / count;
      return left + (slot * index) + (slot / 2);
    };
    const barWidth = Math.max(24, Math.min(52, (innerWidth / Math.max(1, trendSeriesRows.length)) * 0.55));
    const yFor = (value) => top + ((maxValue - value) / valueRange) * innerHeight;

    const yTicks = [0, 25, 50, 75, 100];

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      innerWidth,
      innerHeight,
      yFor,
      xFor,
      barWidth,
      yTicks,
    };
  })();
  const mockTopicChart = (() => {
    const width = 960;
    const height = 360;
    const left = 54;
    const right = 20;
    const top = 18;
    const bottom = 58;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const yFor = (value) => top + ((100 - Math.max(0, Math.min(100, value))) / 100) * innerHeight;
    const xFor = (index) => {
      const count = Math.max(1, mockTopicAccuracyRows.length);
      const slot = innerWidth / count;
      return left + (slot * index) + (slot / 2);
    };
    const barWidth = Math.max(22, Math.min(64, (innerWidth / Math.max(1, mockTopicAccuracyRows.length)) * 0.58));
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      innerWidth,
      innerHeight,
      yFor,
      xFor,
      barWidth,
      yTicks: [0, 25, 50, 75, 100],
    };
  })();
  const mockOverallChart = (() => {
    const width = 960;
    const height = 360;
    const left = 54;
    const right = 20;
    const top = 18;
    const bottom = 58;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const yFor = (value) => top + ((100 - Math.max(0, Math.min(100, value))) / 100) * innerHeight;
    const xFor = (index) => {
      const count = Math.max(1, mockOverallAttemptRows.length);
      const slot = innerWidth / count;
      return left + (slot * index) + (slot / 2);
    };
    const barWidth = Math.max(22, Math.min(64, (innerWidth / Math.max(1, mockOverallAttemptRows.length)) * 0.58));
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      innerWidth,
      innerHeight,
      yFor,
      xFor,
      barWidth,
      yTicks: [0, 25, 50, 75, 100],
    };
  })();
  const mockOverallPoints = mockOverallAttemptRows.map((row, idx) => ({
    x: mockOverallChart.xFor(idx),
    y: mockOverallChart.yFor(row.score),
    score: row.score,
    label: row.attemptLabel,
    quizTitle: row.quizTitle,
    dateLabel: row.dateLabel,
  }));
  const mockOverallPolyline = mockOverallPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');
  const mockOverallAreaPath = mockOverallPoints.length > 1
    ? `M ${mockOverallPoints[0].x} ${mockOverallChart.top + mockOverallChart.innerHeight} L ${mockOverallPolyline} L ${mockOverallPoints[mockOverallPoints.length - 1].x} ${mockOverallChart.top + mockOverallChart.innerHeight} Z`
    : '';
  const weakestDifficulty = [...difficultyPerformance]
    .filter((row) => row.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  const weakestMockTopic = mockTopicAccuracyRows.length > 0
    ? [...mockTopicAccuracyRows].sort((a, b) => a.accuracy - b.accuracy)[0]
    : null;
  const focusTopicLabel = weakestMockTopic ? weakestMockTopic.topic : 'ยังไม่มีข้อมูล';
  const focusTopicMeta = weakestMockTopic
    ? `Accuracy ${weakestMockTopic.accuracy}% (${weakestMockTopic.correct}/${weakestMockTopic.total})`
    : 'รอผลการทำข้อสอบจำลองเพิ่ม';
  const summaryTrendSourceRows = analysisSourceType === 'mock_exam' ? mockOverallAttemptRows : trendSeriesSummaryRows;
  const recentTrendRows = summaryTrendSourceRows.slice(-5);
  const scoreDeltaLatest = recentTrendRows.length >= 2
    ? recentTrendRows[recentTrendRows.length - 1].score - recentTrendRows[recentTrendRows.length - 2].score
    : 0;
  const timeDeltaLatest = recentTrendRows.length >= 2
    && Number.isFinite(Number(recentTrendRows[recentTrendRows.length - 1].sec))
    && Number.isFinite(Number(recentTrendRows[recentTrendRows.length - 2].sec))
    ? Number(recentTrendRows[recentTrendRows.length - 1].sec) - Number(recentTrendRows[recentTrendRows.length - 2].sec)
    : null;
  const aiProgressLabel = scoreDeltaLatest >= 5
    ? 'พัฒนาการดีขึ้นชัดเจน'
    : scoreDeltaLatest >= 1
      ? 'พัฒนาการดีขึ้นเล็กน้อย'
      : scoreDeltaLatest <= -5
        ? 'คะแนนมีแนวโน้มลดลงชัดเจน'
        : scoreDeltaLatest < 0
        ? 'คะแนนมีแนวโน้มลดลงเล็กน้อย'
          : 'คะแนนยังทรงตัว';
  const AI_RECOMMENDATION_SECTIONS = [
    { label: 'วิเคราะห์แนวโน้มคะแนน' },
  ];
  const stripAiRecommendationPrefix = (line) => {
    let text = String(line || '').trim().replace(/^[•-]\s*/, '').trim();
    AI_RECOMMENDATION_SECTIONS.forEach((section) => {
      if (text.startsWith(section.label)) {
        text = text.slice(section.label.length).trim().replace(/^[:：-]\s*/, '').trim();
      }
    });
    return text;
  };
  const analysisSummaryPlan = AI_RECOMMENDATION_SECTIONS.map((section) => section.label);
  const trendRowsForSummary = summaryTrendSourceRows
    .slice(-6)
    .map((row) => ({
      attempt_label: row.attemptLabel,
      date_label: row.dateLabel,
      score_pct: row.score,
    }));
  const focusAreaSummary = analysisSourceType === 'mock_exam'
    ? (weakestMockTopic
      ? {
        type: 'topic',
        label: weakestMockTopic.topic,
        accuracy_pct: weakestMockTopic.accuracy,
        attempts_count: weakestMockTopic.total,
        note: focusTopicMeta,
      }
      : {
        type: 'topic',
        label: null,
        accuracy_pct: 0,
        attempts_count: 0,
        note: 'ยังไม่มีข้อมูล topic เพียงพอ',
      })
    : (weakestDifficulty
      ? {
        type: 'difficulty',
        label: weakestDifficulty.label,
        accuracy_pct: weakestDifficulty.accuracy,
        attempts_count: weakestDifficulty.attempts,
        note: `มั่นใจตรงจริง ${weakestDifficulty.confidenceMatchRate}%`,
      }
      : {
        type: 'difficulty',
        label: null,
        accuracy_pct: 0,
        attempts_count: 0,
        note: 'ยังไม่มีข้อมูลระดับความยากเพียงพอ',
      });
  const prioritySampleRows = latestTopPriorityQuestions.slice(0, 10);
  const priorityWrongQuestions = prioritySampleRows.filter((item) => item?.is_correct === false).length;
  const priorityConfidentWrongQuestions = prioritySampleRows.filter((item) => item?.isConfidentWrong).length;
  const prioritySlowQuestions = avgSecPerQuestion > 0
    ? prioritySampleRows.filter((item) => Number(item?.sec_per_question) > avgSecPerQuestion).length
    : 0;
  const priorityAverageTimeSec = prioritySampleRows.length > 0
    ? Math.round(
      prioritySampleRows.reduce((sum, item) => sum + Math.max(0, Number(item?.sec_per_question) || 0), 0)
      / prioritySampleRows.length
    )
    : 0;
  const analysisSummaryPayload = hasFilteredData
    ? {
      analysis_plan: analysisSummaryPlan,
      context: {
        analysis_source_type: analysisSourceType,
        scope_label: analysisScopeLabel,
        topic_filter: analysisTopic !== 'all' ? analysisTopic : null,
      },
      metrics: {
        attempts_total: summaryStats.attempts,
        average_score_pct: summaryStats.avg,
        latest_score_pct: summaryStats.lastScore,
        accuracy_7d_pct: accuracy7d,
        average_time_per_question_sec: avgSecPerQuestion,
        confident_wrong_rate_pct: confidentWrongRate,
      },
      recent_trend: {
        direction_label: aiProgressLabel,
        score_delta_pct: scoreDeltaLatest,
        time_delta_sec_per_question: Number.isFinite(timeDeltaLatest) ? timeDeltaLatest : null,
        attempts: trendRowsForSummary,
      },
      focus_area: focusAreaSummary,
      priority_patterns: {
        sampled_questions: prioritySampleRows.length,
        wrong_questions: priorityWrongQuestions,
        confident_wrong_questions: priorityConfidentWrongQuestions,
        slow_questions: prioritySlowQuestions,
        average_time_sec: priorityAverageTimeSec,
      },
    }
    : null;
  const analysisSummarySignature = analysisSummaryPayload
    ? JSON.stringify(analysisSummaryPayload)
    : '';

  useEffect(() => {
    if (activeTab !== 'analysis' || !analysisSummaryPayload) {
      setAnalysisLlmSummary((prev) => (
        prev.loading
        || prev.error
        || prev.summaryParagraph
        || prev.recommendations.length > 0
        || prev.model
        || prev.generatedAt
        || prev.isFallback
          ? {
            loading: false,
            error: null,
            summaryParagraph: '',
            recommendations: [],
            recommendationCards: [],
            model: '',
            generatedAt: null,
            isFallback: false,
          }
          : prev
      ));
      return;
    }

    let cancelled = false;
    const requestId = analysisSummaryRequestRef.current + 1;
    analysisSummaryRequestRef.current = requestId;

    setAnalysisLlmSummary((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    const loadLlmSummary = async () => {
      try {
        const currentUserId = getUserId();
        const targetCourseId = (course?.id || course?.course_id || courseId || '').toString();
        if (!currentUserId || !targetCourseId) {
          throw new Error('MISSING_USER_OR_COURSE');
        }

        const response = await secureAPI.courseAPI.getStudentAnalysisSummary(
          currentUserId,
          targetCourseId,
          analysisSummaryPayload,
        );
        if (cancelled || requestId !== analysisSummaryRequestRef.current) return;

        const summaryParagraph = String(response?.summary_paragraph || '').trim();
        const recommendations = Array.isArray(response?.recommendations)
          ? response.recommendations
              .map((item) => String(item || '').trim())
              .filter(Boolean)
              .slice(0, 3)
          : [];
        const recommendationCards = Array.isArray(response?.recommendation_cards)
          ? response.recommendation_cards
              .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const title = String(item.title || '').trim();
                const evidence = String(item.evidence || '').trim();
                const action = String(item.action || '').trim();
                const note = String(item.note || '').trim();
                if (!title && !evidence && !action && !note) return null;
                return { title, evidence, action, note };
              })
              .filter(Boolean)
              .slice(0, 3)
          : [];

        setAnalysisLlmSummary({
          loading: false,
          error: null,
          summaryParagraph,
          recommendations,
          recommendationCards,
          model: String(response?.model || '').trim(),
          generatedAt: response?.generated_at || null,
          isFallback: Boolean(response?.is_fallback),
        });
      } catch (_) {
        if (cancelled || requestId !== analysisSummaryRequestRef.current) return;
        setAnalysisLlmSummary({
          loading: false,
          error: 'ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้',
          summaryParagraph: '',
          recommendations: [],
          recommendationCards: [],
          model: '',
          generatedAt: null,
          isFallback: true,
        });
      }
    };

    loadLlmSummary();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    analysisSummarySignature,
    course?.id,
    course?.course_id,
    courseId,
    user?.id,
    user?.studentId,
    user?.username,
    user?.user_id,
  ]);

  const analysisTargetAccuracy = Math.min(95, Math.max(70, accuracy7d > 0 ? accuracy7d + 10 : summaryStats.avg));
  const analysisActionUnit = analysisSourceType === 'mock_exam' ? 'ข้อสอบจำลองอีก 1 ชุด' : 'แบบฝึกเพิ่มอีก 5-10 ข้อ';
  const analysisEvidenceMetrics = [
    { key: 'latest', label: 'ล่าสุด', value: `${summaryStats.lastScore}%` },
    { key: 'average', label: 'เฉลี่ย', value: `${summaryStats.avg}%` },
  ];
  const fallbackAnalysisSummary = hasFilteredData
    ? `จากข้อมูล ${summaryStats.attempts} ครั้งล่าสุด คะแนนเฉลี่ยอยู่ที่ ${summaryStats.avg}% คะแนนล่าสุด ${summaryStats.lastScore}% และ Accuracy 7 วัน ${accuracy7d}%`
    : '';
  const fallbackRecommendationCards = [
    {
      title: scoreDeltaLatest > 0
        ? 'คะแนนล่าสุดเริ่มดีขึ้นจากรอบก่อน'
        : (scoreDeltaLatest < 0 ? 'คะแนนล่าสุดแผ่วลงจากรอบก่อน' : 'คะแนนยังทรงตัว ต้องเก็บรอบเพิ่ม'),
      evidence: `Accuracy 7 วัน ${accuracy7d}% | ล่าสุด ${summaryStats.lastScore}% | เฉลี่ย ${summaryStats.avg}%`,
      action: summaryStats.attempts < 3
        ? `ทำ${analysisActionUnit}เพิ่มอีก 2 รอบเพื่อให้แนวโน้มชัดขึ้น`
        : (scoreDeltaLatest < 0
          ? `ย้อนดูข้อที่ผิดจากรอบล่าสุด แล้วทำ${analysisActionUnit}ภายใน 1-2 วัน`
          : `รักษาจังหวะและพยายามดัน Accuracy 7 วันให้เกิน ${analysisTargetAccuracy}%`),
      note: stripAiRecommendationPrefix(analysisLlmSummary.recommendations[0] || ''),
    },
  ];
  const aiRecommendationDisplayRows = AI_RECOMMENDATION_SECTIONS
    .map((section, idx) => {
      const remoteCard = analysisLlmSummary.recommendationCards[idx] || {};
      const fallbackCard = fallbackRecommendationCards[idx] || {};
      const title = String(remoteCard.title || fallbackCard.title || '').trim();
      const evidence = String(remoteCard.evidence || fallbackCard.evidence || '').trim();
      const action = String(remoteCard.action || fallbackCard.action || '').trim();
      const note = String(remoteCard.note || fallbackCard.note || '').trim();
      if (!title && !evidence && !action && !note) return null;
      return {
        key: section.label,
        idx,
        sectionLabel: section.label,
        title,
        evidence,
        evidenceMetrics: analysisEvidenceMetrics,
        action,
        note,
      };
    })
    .filter(Boolean);

  useEffect(() => {
    const loadExerciseProgress = async () => {
      const sourceLessons = Array.isArray(course?.lessons) ? course.lessons : [];
      const localCourseQuizAliasMap = buildCourseQuizAliasMap(
        Array.isArray(course?.allCourseQuizzes) ? course.allCourseQuizzes : []
      );
      const resolveLessonId = (lesson) => lesson?.id || lesson?.lesson_id || lesson?._id;
      const quizIds = Array.from(new Set(
        sourceLessons.flatMap((lesson) => (
          extractLessonQuizRefs(lesson).map((quizId) => resolveQuizAlias(quizId, localCourseQuizAliasMap))
        )).filter(Boolean)
      ));

      if (quizIds.length === 0) {
        setLessonExerciseProgress((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        setExerciseProgress((prev) => (
          prev.completed === 0 && prev.total === 0
            ? prev
            : { completed: 0, total: 0 }
        ));
        return;
      }

      const userId = getUserId();
      const targetCourseId = (course?.id || course?.course_id || courseId || '').toString();
      let completionMap = {};
      try {
        const resultPayload = await secureAPI.courseAPI.getUserQuizResults(userId, {
          courseId: targetCourseId || undefined,
        });
        const attemptedQuizIds = new Set(
          (Array.isArray(resultPayload?.results) ? resultPayload.results : [])
            .map((item) => resolveQuizAlias(item?.quiz_id, localCourseQuizAliasMap))
            .filter(Boolean)
            .map((quizId) => String(quizId))
        );
        completionMap = Object.fromEntries(
          quizIds.map((quizId) => [String(quizId), attemptedQuizIds.has(String(quizId))])
        );
      } catch (_) {
        completionMap = Object.fromEntries(
          quizIds.map((quizId) => [String(quizId), false])
        );
      }

      const progressByLesson = sourceLessons.reduce((acc, lesson) => {
        const lessonId = resolveLessonId(lesson);
        if (!lessonId) return acc;
        const lessonQuizIds = Array.from(new Set(
          extractLessonQuizRefs(lesson)
            .map((quizId) => resolveQuizAlias(quizId, localCourseQuizAliasMap))
            .filter(Boolean)
            .map((qid) => String(qid))
        ));
        const total = lessonQuizIds.length;
        const completed = total > 0
          ? lessonQuizIds.filter((qid) => Boolean(completionMap[qid])).length
          : 0;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        acc[String(lessonId)] = { completed, total, percent };
        return acc;
      }, {});
      setLessonExerciseProgress((prev) => {
        const prevSerialized = JSON.stringify(prev);
        const nextSerialized = JSON.stringify(progressByLesson);
        return prevSerialized === nextSerialized ? prev : progressByLesson;
      });

      const completed = Object.values(completionMap).filter(Boolean).length;
      setExerciseProgress((prev) => (
        prev.completed === completed && prev.total === quizIds.length
          ? prev
          : { completed, total: quizIds.length }
      ));
    };

    loadExerciseProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, user?.id, user?.studentId, user?.username, user?.user_id, course?.lessons, course?.allCourseQuizzes]);

  if (loading) {
    return <PageLoading label="กำลังโหลดคอร์ส..." />;
  }

  if (!course) {
    const hasLoadError = Boolean(error);
    const isConnectionError = String(error || '').includes('เชื่อมต่อ');

    return (
      <ErrorBoundary>
        <div className="course-not-found">
          <Header user={user} onLogout={logout} activeTab="courses" onSelectTab={handleSelectHeaderTab} />
          <div 
            className="not-found-content" 
            style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              maxWidth: '600px',
              margin: '0 auto'
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem', fontWeight: 700, color: '#64748b' }}>
              {hasLoadError ? '!' : '404'}
            </div>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#1f2937' }}>
              {hasLoadError
                ? (isConnectionError ? 'เกิดปัญหาการเชื่อมต่อ' : 'เกิดข้อผิดพลาดในการโหลดคอร์ส')
                : 'ไม่พบคอร์สที่คุณค้นหา'}
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '1.125rem' }}>
              {hasLoadError ? error : 'คอร์สนี้อาจไม่มีอยู่ หรือคุณไม่มีสิทธิ์ในการเข้าถึง'}
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link 
                to="/dashboard" 
                className="back-button"
                style={{
                  background: '#4ecdc4',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '1rem',
                  fontWeight: '500',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                ← กลับไปยังหน้าแรก
              </Link>
              
              <button 
                onClick={handleRetry}
                style={{
                  background: 'white',
                  color: '#4ecdc4',
                  border: '1px solid #4ecdc4',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                ลองโหลดใหม่
              </button>
            </div>
            
            <div style={{ marginTop: '3rem', padding: '1.5rem', background: '#f9fafb', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#374151' }}>
                คำแนะนำ
              </h3>
              <ul style={{ textAlign: 'left', color: '#6b7280', lineHeight: '1.6' }}>
                <li>ตรวจสอบว่าลิงก์ถูกต้อง</li>
                <li>ลองรีเฟรชหน้าเว็บ</li>
                <li>ติดต่ออาจารย์ผู้สอนเพื่อเชิญเข้าร่วมคอร์ส</li>
                <li>ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต</li>
              </ul>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  const sortedLessons = [...lessons].sort((a, b) => {
    const aOrder = Number(a?.order);
    const bOrder = Number(b?.order);
    return (Number.isFinite(aOrder) ? aOrder : 0) - (Number.isFinite(bOrder) ? bOrder : 0);
  });
  const nextLesson = sortedLessons.find((lesson) => lesson?.status !== 'completed') || sortedLessons[0];
  const getLessonId = (lesson) => lesson?.id || lesson?.lesson_id;
  const openLesson = (lesson) => {
    if (!isEnrolledCourse) {
      alert('กรุณาเลือกแพ็กเกจและลงทะเบียนก่อนเริ่มเรียน');
      return;
    }
    if (courseIsExpired) {
      alert('คอร์สนี้หมดอายุแล้ว กรุณาต่ออายุคอร์สก่อนเข้าเรียน');
      return;
    }
    const lessonId = getLessonId(lesson);
    if (!lessonId) return;
    saveLatestLessonActivity({
      user,
      courseId,
      lessonId,
      courseName: course?.name || course?.title || '',
      lessonTitle: lesson?.title || '',
    });
    navigate(`/course/${courseId}/lesson/${lessonId}`);
  };
  const nextLessonId = getLessonId(nextLesson);
  const continueHref = isEnrolledCourse && !courseIsExpired && nextLessonId
    ? `/course/${courseId}/lesson/${nextLessonId}`
    : null;
  const isPracticeSplitView = Boolean(isEnrolledCourse && splitView && selectedQuizForSplit);
  const courseBannerImageUrl = course?.image_url || course?.imageUrl || '';
  const courseCardImageUrl = course?.thumbnail_url || course?.thumbnailUrl || courseBannerImageUrl || course?.preview_image_url || course?.previewImageUrl || '';
  const coursePreviewImageUrl = course?.preview_image_url || course?.previewImageUrl || courseBannerImageUrl || courseCardImageUrl || '';
  const coursePurchasePreviewImageUrl = course?.purchase_preview_image_url || course?.purchasePreviewImageUrl || coursePreviewImageUrl;

  return (
    <ErrorBoundary>
    <div className="course-page">
      <Header user={user} onLogout={logout} activeTab="courses" onSelectTab={handleSelectHeaderTab} />
      
      {!isPracticeSplitView ? (
      <section className={`course-hero ${!isEnrolledCourse ? 'course-hero-payment-mode' : ''}`}>
        <div className="course-hero-inner">
          {isEnrolledCourse ? (
            <div className="course-breadcrumb">
              <Link className="course-breadcrumb-link" to="/dashboard">หน้าแรก</Link>
              <span className="course-breadcrumb-separator" aria-hidden="true">/</span>
              <span className="course-breadcrumb-current">{course.name}</span>
            </div>
          ) : null}
          
          {isEnrolledCourse ? (
            <div className="course-hero-grid">
              <div className="course-hero-main">
                <div className="course-title-row">
                  <div className="course-cover" aria-hidden="true">
                    {coursePreviewImageUrl ? (
                      <img src={coursePreviewImageUrl} alt={course?.name || 'รูปคอร์ส'} decoding="async" />
                    ) : (
                      <span className="course-cover-fallback">COURSE</span>
                    )}
                  </div>
                  <div className="course-title-block">
                    <h1>{course.name}</h1>
                    <p>{course.description || 'เตรียมตัวให้พร้อมกับบทเรียนที่ออกแบบมาเป็นขั้นตอน'}</p>
                  </div>
                </div>
                
                <div className="course-meta-row">
                  <span className="course-chip">ผู้สอน: {course.instructor || 'อาจารย์ประจำรายวิชา'}</span>
                  <span className="course-chip">วิชา: {courseSubjectLabel}</span>
                </div>
                
                <div className="course-actions-row">
                  {continueHref ? (
                    <Link
                      className="course-primary-action"
                      to={continueHref}
                      onClick={() => {
                        if (nextLessonId) {
                          saveLatestLessonActivity({
                            user,
                            courseId,
                            lessonId: nextLessonId,
                            courseName: course?.name || course?.title || '',
                            lessonTitle: nextLesson?.title || '',
                          });
                        }
                      }}
                    >
                      เริ่มเรียนต่อ
                    </Link>
                  ) : (
                    <Link className="course-primary-action" to={renewCourseTarget}>
                      {courseIsExpired ? 'ต่ออายุคอร์ส' : 'สมัครและเริ่มเรียน'}
                    </Link>
                  )}
                  <Link className="course-ghost-action" to="/dashboard">
                    กลับแดชบอร์ด
                  </Link>
                </div>
                
                <div className="course-stats-row">
                  <div className="course-stat-card">
                    <span className="course-stat-label">บทเรียน</span>
                    <strong className="course-stat-value">{lessons.length}</strong>
                  </div>
                  <div className="course-stat-card">
                    <span className="course-stat-label">แบบทดสอบ</span>
                    <strong className="course-stat-value">{lessonQuizCount}</strong>
                  </div>
                  <div className="course-stat-card">
                    <span className="course-stat-label">ข้อสอบจำลอง</span>
                    <strong className="course-stat-value">{mockExams.length}</strong>
                  </div>
                </div>

              </div>

              <aside className="course-progress-card">
                  <div className="progress-ring" style={{ '--progress': exerciseProgressPercent }}>
                    <span>{exerciseProgressPercent}%</span>
                  </div>
                  <div className="progress-content">
                    <span className="progress-label">ความคืบหน้าแบบฝึกหัด</span>
                    <p className={`course-expiry-banner ${expiryAlertTone}`}>
                      <span className="course-expiry-line">{expiryRemainingText}</span>
                      {hasExpiryInfo ? (
                        <span className="course-expiry-line">{expiryDateText}</span>
                      ) : null}
                    </p>
                    <div className="progress-summary-grid">
                      <div className="progress-summary-item">
                        <span>เสร็จแล้ว</span>
                        <strong>{completedExercises}</strong>
                      </div>
                      <div className="progress-summary-item">
                        <span>ทั้งหมด</span>
                        <strong>{totalExercises}</strong>
                      </div>
                    </div>
                    <div className="progress-summary-track" aria-hidden="true">
                      <span style={{ width: `${exerciseProgressPercent}%` }} />
                    </div>
                    {continueHref ? (
                      <Link
                        className="course-primary-action small"
                        to={continueHref}
                        onClick={() => {
                          if (nextLessonId) {
                            saveLatestLessonActivity({
                              user,
                              courseId,
                              lessonId: nextLessonId,
                              courseName: course?.name || course?.title || '',
                              lessonTitle: nextLesson?.title || '',
                            });
                          }
                        }}
                      >
                        ต่อจากบทล่าสุด
                      </Link>
                    ) : (
                      <Link className="course-primary-action small" to={renewCourseTarget}>
                        {courseIsExpired ? 'ต่ออายุคอร์ส' : 'สมัครและเริ่มเรียน'}
                      </Link>
                    )}
                  </div>
              </aside>
            </div>
          ) : (
            <div className="course-hero-payment-layout">
              <Link className="course-hero-payment-back-link" to="/dashboard" state={{ activeTab: 'browse' }}>
                <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" />
                <span>กลับไปเลือกคอร์ส</span>
              </Link>
              <div className="course-hero-payment-panel">
                <div className="course-hero-payment-media">
                  {coursePurchasePreviewImageUrl ? (
                    <img src={coursePurchasePreviewImageUrl} alt={course?.name || 'รูปคอร์ส'} decoding="async" />
                  ) : (
                    <div className="course-hero-payment-fallback">
                      <BookOpen size={62} strokeWidth={1.7} aria-hidden="true" />
                    </div>
                  )}
                  <span className="course-hero-payment-subject-chip">{courseSubjectLabel}</span>
                </div>
                <div className="course-hero-payment-side">
                  <span className="course-hero-payment-label">คอร์ส</span>
                  <h1>{course.name}</h1>
                  <p className="course-hero-payment-description">
                    {tutorDescription || tutorDetail || 'ยังไม่มีรายละเอียดคอร์ส'}
                  </p>
                  <div className="course-hero-payment-feature-row" aria-label="จุดเด่นคอร์ส">
                    <article className="course-hero-payment-feature-card">
                      <span className="course-hero-payment-feature-icon" aria-hidden="true">
                        <Target size={18} strokeWidth={2.1} />
                      </span>
                      <div>
                        <strong>บทเรียนทั้งหมด</strong>
                        <span>{lessons.length > 0 ? `${lessons.length.toLocaleString('th-TH')} บท` : 'รออัปเดต'}</span>
                      </div>
                    </article>
                    <article className="course-hero-payment-feature-card">
                      <span className="course-hero-payment-feature-icon" aria-hidden="true">
                        <BarChart3 size={18} strokeWidth={2.1} />
                      </span>
                      <div>
                        <strong>จำนวนแบบฝึกหัดทั้งหมด</strong>
                        <span>{totalExerciseLabel}</span>
                      </div>
                    </article>
                    <article className="course-hero-payment-feature-card">
                      <span className="course-hero-payment-feature-icon" aria-hidden="true">
                        <CheckCircle2 size={18} strokeWidth={2.1} />
                      </span>
                      <div>
                        <strong>อัปเดตล่าสุด</strong>
                        <span>{courseUpdatedDisplayLabel}</span>
                      </div>
                    </article>
                  </div>
                </div>
                <div className="course-hero-payment-actions">
                  <div className="course-hero-payment-price-block">
                    <span>เริ่มต้นเพียง</span>
                    <strong>
                      <span className="course-hero-payment-price-value">{coursePriceValueLabel}</span>
                      {coursePriceUnitLabel ? (
                        <span className="course-hero-payment-price-unit">{coursePriceUnitLabel}</span>
                      ) : null}
                    </strong>
                  </div>
                  <Link
                    className="course-hero-payment-button"
                    to={hasActiveEnrollment ? `/course/${courseId}` : `/course/${courseId}/payment`}
                  >
                    <span>{hasActiveEnrollment ? 'ไปที่คอร์ส' : 'ชำระเงิน'}</span>
                    <ChevronRight size={20} strokeWidth={2.4} aria-hidden="true" />
                  </Link>
                  {canRequestTrialFromDetail ? (
                    <button
                      type="button"
                      className="course-hero-payment-button trial"
                      onClick={handleRequestTrialStart}
                      disabled={trialStarting}
                    >
                      <span>{trialDetailButtonLabel}</span>
                    </button>
                  ) : null}
                  <p className="course-hero-payment-secure-note">
                    <ShieldCheck size={18} strokeWidth={2.1} aria-hidden="true" />
                    <span>รับประกันข้อมูลปลอดภัย</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      ) : null}

      {!isEnrolledCourse ? (
        <section className="course-content course-content-preview">
          <div className="course-overview">
            <div className="course-overview-grid">
              <div className="course-overview-main">
                <h2>รายละเอียดคอร์ส</h2>
                <h3 className="course-overview-subhead">เนื้อหาที่ออกข้อสอบ</h3>
                <div className="course-overview-content-list">
                  {overviewTopicRows.length > 0 ? overviewTopicRows.map((item, idx) => (
                    <article className="course-overview-content-item" key={`content-${idx}`}>
                      <span className={`course-overview-content-item-icon tone-${idx % 5}`} aria-hidden="true">
                        <FileText size={17} strokeWidth={2} />
                      </span>
                      <div className="course-overview-content-item-body">
                        <strong>{item.title || `หัวข้อที่ ${idx + 1}`}</strong>
                        <p>{item.description || 'หัวข้อนี้พร้อมใช้งานเมื่อมีข้อมูลคอร์สเพิ่มเติม'}</p>
                      </div>
                    </article>
                  )) : (
                    <article className="course-overview-content-item">
                      <span className="course-overview-content-item-icon tone-0" aria-hidden="true">
                        <FileText size={17} strokeWidth={2} />
                      </span>
                      <div className="course-overview-content-item-body">
                        <strong>ยังไม่มีหัวข้อที่เปิดเผยในตอนนี้</strong>
                        <p>เมื่อผู้สอนเผยแพร่หัวข้อ/ข้อสอบ ระบบจะแสดงรายละเอียดจากข้อมูลจริงทันที</p>
                      </div>
                    </article>
                  )}
                </div>
                {tutorDetail ? (
                  <div className="course-overview-intro" role="note">
                    <Info size={20} strokeWidth={2.4} aria-hidden="true" />
                    <p>{tutorDetail}</p>
                  </div>
                ) : null}
              </div>
              <aside className="course-overview-side">
                <div className="course-overview-metric">
                  <div className="course-overview-metric-icon" aria-hidden="true">
                    <FileText size={17} strokeWidth={2.1} />
                  </div>
                  <div>
                    <strong>รูปแบบ</strong>
                    <span>{courseFormatLabel}</span>
                  </div>
                </div>
                <div className="course-overview-metric">
                  <div className="course-overview-metric-icon violet" aria-hidden="true">
                    <Hash size={17} strokeWidth={2.1} />
                  </div>
                  <div>
                    <strong>จำนวนแบบฝึกหัดทั้งหมด</strong>
                    <span>{totalExerciseLabel}</span>
                  </div>
                </div>
                <div className="course-overview-metric">
                  <div className="course-overview-metric-icon sky" aria-hidden="true">
                    <User size={17} strokeWidth={2.1} />
                  </div>
                  <div>
                    <strong>ผู้สอน</strong>
                    <span>{normalizedInstructorName}</span>
                  </div>
                </div>
                <div className="course-overview-metric">
                  <div className="course-overview-metric-icon orange" aria-hidden="true">
                    <Languages size={17} strokeWidth={2.1} />
                  </div>
                  <div>
                    <strong>ระดับ</strong>
                    <span>{normalizedCourseLevelLabel}</span>
                  </div>
                </div>
                <div className="course-overview-metric">
                  <div className="course-overview-metric-icon blue" aria-hidden="true">
                    <Clock size={17} strokeWidth={2.1} />
                  </div>
                  <div>
                    <strong>อัปเดตล่าสุด</strong>
                    <span>{courseUpdatedDisplayLabel}</span>
                  </div>
                </div>
                <div className="course-overview-metric">
                  <div className="course-overview-metric-icon teal" aria-hidden="true">
                    <ShieldCheck size={17} strokeWidth={2.1} />
                  </div>
                  <div>
                    <strong>รับประกัน</strong>
                    <span>ข้อมูลปลอดภัย ไม่แชร์ข้อมูลส่วนตัว</span>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>
      ) : null}

      {isEnrolledCourse ? (
      <>
      {!splitView ? (
        <div className="course-tabs course-tabs-row" style={{ maxWidth: 1100 }}>
          <div className="course-tabs-left">
            <button
              className={`course-tab ${activeTab === 'lessons' ? 'active' : ''}`}
              onClick={() => setActiveTab('lessons')}
              type="button"
            >
              บทเรียนในคอร์ส
            </button>
            <button
              className={`course-tab ${activeTab === 'mock_exams' ? 'active' : ''}`}
              onClick={() => setActiveTab('mock_exams')}
              type="button"
            >
              ข้อสอบจำลอง
            </button>
            {isEnrolledCourse ? (
              <button
                className={`course-tab ${activeTab === 'analysis' ? 'active' : ''}`}
                onClick={() => setActiveTab('analysis')}
                type="button"
              >
                วิเคราะห์นักเรียน
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="course-content">
        {splitView && selectedQuizForSplit ? (
          <div className="split-screen">
            <div className="left-panel">
              <QuizInterface
                ref={splitQuizRef}
                course={{ id: courseId, name: course?.name || course?.title || 'คอร์สเรียน' }}
                user={user}
                initialQuiz={selectedQuizForSplit}
                hideHints
                onAddAiMessage={(payload) => splitChatRef.current?.addAiMessage(payload)}
                onBackToCourse={closeSplit}
                onQuestionChange={(payload) => setSplitChatContext(payload || null)}
                onResultStored={async () => {
                  await loadPracticeAnalysis();
                }}
              />
            </div>
            <div className="right-panel">
              <ChatInterface
                ref={splitChatRef}
                course={{ id: courseId, name: course?.name || course?.title || 'คอร์สเรียน' }}
                user={user}
                context={splitChatContext}
                showEnergyBanner={false}
                onSuggestionSelect={(payload) => splitQuizRef.current?.handleUnderstandingResponse(payload)}
                onAiResponse={(payload) => splitQuizRef.current?.handleAiResponseReceived(payload)}
              />
            </div>
          </div>
        ) : (
        <>
        {activeTab === 'lessons' && (
          <div className="lessons-tab">
            <div className="lessons-header">
              <h3>เส้นทางบทเรียน</h3>
              <p>เรียนตามลำดับบทอย่างเป็นขั้นตอน พร้อมแบบฝึกหัดประจำบท</p>
            </div>

            {Array.isArray(course?.lessons) && course.lessons.length > 0 ? (
              <div className="learning-path">
                {sortedLessons.map((lesson, index) => {
                  const lessonId = getLessonId(lesson);
                  const computedLessonProgress = lessonId ? lessonExerciseProgress[String(lessonId)] : null;
                  const quizzesCount = Array.isArray(lesson?.quizzes)
                    ? lesson.quizzes.length
                    : (Number.isInteger(lesson?.quizzes) ? lesson.quizzes : 0);
                  const rawLessonProgress = Number(
                    (computedLessonProgress?.total > 0
                      ? computedLessonProgress.percent
                      : null) ??
                    lesson?.progress_percent ??
                    lesson?.progress ??
                    lesson?.completion_percent ??
                    (lesson?.status === 'completed' ? 100 : 0)
                  );
                  const lessonProgressPercent = Number.isFinite(rawLessonProgress)
                    ? Math.max(0, Math.min(100, Math.round(rawLessonProgress)))
                    : 0;
                  const isCompleted = lessonProgressPercent >= 100 || lesson?.status === 'completed';
                  const lessonStatusClass = isCompleted
                    ? 'done'
                    : lessonProgressPercent > 0
                      ? 'in-progress'
                      : 'pending';
                  const ringRadius = 22;
                  const ringCircumference = 2 * Math.PI * ringRadius;
                  const ringOffset = ringCircumference - ((lessonProgressPercent / 100) * ringCircumference);
                  return (
                    <article
                      key={lessonId || index}
                      className={`lesson-card ${isCompleted ? 'completed' : ''}`}
                      onClick={() => openLesson(lesson)}
                      style={{ cursor: 'pointer', '--delay': `${index * 70}ms` }}
                    >
                      <div className="lesson-step">
                        <div className="lesson-index">{index + 1}</div>
                        <div
                          className={`lesson-progress-ring ${lessonStatusClass}`}
                          role="progressbar"
                          aria-label={`ความคืบหน้าบทเรียน ${lesson.title}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={lessonProgressPercent}
                        >
                          <svg viewBox="0 0 56 56" aria-hidden="true">
                            <circle
                              className="lesson-progress-ring-track"
                              cx="28"
                              cy="28"
                              r={ringRadius}
                            />
                            <circle
                              className="lesson-progress-ring-fill"
                              cx="28"
                              cy="28"
                              r={ringRadius}
                              style={{
                                strokeDasharray: ringCircumference,
                                strokeDashoffset: ringOffset,
                              }}
                            />
                          </svg>
                          <span>{lessonProgressPercent}%</span>
                        </div>
                      </div>
                      
                      <div className="lesson-body">
                        <div className="lesson-top">
                          <h4>{lesson.title}</h4>
                          <div className="lesson-pills">
                            <span className="lesson-pill">{quizzesCount} แบบฝึกหัด</span>
                            <span className="lesson-pill">
                              ทำแล้ว {computedLessonProgress?.completed ?? 0}/{computedLessonProgress?.total ?? quizzesCount}
                            </span>
                          </div>
                        </div>
                        <p className="lesson-description">{lesson.description || 'ไม่มีคำอธิบาย'}</p>
                        <div className="lesson-actions">
                          <button
                            className="course-primary-action small"
                            onClick={(event) => {
                              event.stopPropagation();
                              openLesson(lesson);
                            }}
                            type="button"
                          >
                            เริ่มบทเรียน
                          </button>
                          <button
                            className="course-ghost-action small"
                            onClick={(event) => {
                              event.stopPropagation();
                              openLesson(lesson);
                            }}
                            type="button"
                          >
                            ดูรายละเอียด
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon minimal" aria-hidden="true" />
                <h3>ยังไม่มีบทเรียนในคอร์สนี้</h3>
                <p>บทเรียนจะปรากฏที่นี่เมื่อผู้สอนเพิ่มเนื้อหา</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'mock_exams' && (
        <div className="lessons-tab" style={{ marginTop: 0 }}>
          <div className="mock-exam-column">
            <div className="lessons-header">
              <h3>ข้อสอบจำลอง</h3>
              <p>สนามฝึกซ้อมข้อสอบแบบเต็มชุด พร้อมจับเวลา</p>
            </div>

            {sortedMockExams.length > 0 ? (
              <>
              <div className="mock-exam-grid">
                {paginatedMockExams.map((q, index) => {
                  const sortedIndex = mockExamPageStart + index;
                  const displayTitle = normalizeMockExamDisplayTitle(q?.title, sortedIndex);
                  const examDescription = String(q?.description || '').trim();
                  const examPrompt = String(q?.extra_prompt || '').trim();
                  const examDetails = String(q?.exam_details || '').trim();
                  const quizId = String(q?.quiz_id || q?.id || '').trim();
                  const totalQuestions = q.total_questions || (Array.isArray(q.questions) ? q.questions.length : 0);
                  const attemptStat = quizId ? mockExamAttemptStats[quizId] : null;
                  const latestScore = attemptStat?.latestScore;
                  const totalAttempts = attemptStat?.attempts || 0;
                  const reasons = (
                    Array.isArray(q?.selection_reasons) ? q.selection_reasons
                      : Array.isArray(q?.reasons) ? q.reasons
                        : Array.isArray(q?.pick_reasons) ? q.pick_reasons
                          : []
                  )
                    .map((item) => String(item || '').trim())
                    .filter((item) => item && !/(?:ความยาก|ระดับ(?:ง่าย|ปานกลาง|ยาก)|\b(?:easy|medium|hard)\b)/i.test(item))
                    .slice(0, 3);
                  const summaryText = examDescription || 'ฝึกทำข้อสอบเสมือนการสอบจริง พร้อมประเมินผลทันที';
                  const supportText = examDetails
                    ? `โครงสร้างข้อสอบ: ${examDetails}`
                    : examPrompt
                      ? `คำสั่งพิเศษ: ${examPrompt}`
                      : '';
                  const scoreText = latestScore != null ? `คะแนนล่าสุด ${Math.round(latestScore)}%` : 'คำนวณคะแนนอัตโนมัติ';
                  const attemptText = totalAttempts > 0 ? `ทำแล้ว ${totalAttempts} ครั้ง` : 'ยังไม่เคยทำข้อสอบชุดนี้';
                  return (
                  <article
                    key={q.quiz_id || index}
                    className="mock-exam-card"
                    onClick={() => {
                      if (!isEnrolledCourse) {
                        alert('กรุณาเลือกแพ็กเกจและลงทะเบียนก่อนเริ่มทำข้อสอบ');
                        return;
                      }
                      const qid = q.quiz_id || q.id;
                      if (qid) navigate(`/course/${courseId}/mock-exam/${qid}`);
                    }}
                    style={{ cursor: 'pointer', '--delay': `${index * 70}ms` }}
                  >
                    <div className="mock-exam-card-top">
                      <span className="mock-exam-badge">{reasons.length > 0 ? 'แนะนำสำหรับคุณ' : 'ข้อสอบจำลอง'}</span>
                    </div>
                    <div className="mock-exam-title-row">
                      <div className="mock-exam-icon" aria-hidden="true">
                        <FileText size={24} strokeWidth={2.2} />
                      </div>
                      <div className="mock-exam-title-copy">
                        <h4>{displayTitle || 'ข้อสอบจำลอง'}</h4>
                        <p className="mock-exam-summary">{summaryText}</p>
                        {supportText ? <p className="mock-exam-support-text">{supportText}</p> : null}
                        {reasons.length > 0 ? <p className="mock-exam-reason-note">{reasons[0]}</p> : null}
                      </div>
                    </div>
                    <div className="mock-exam-meta-list">
                      <div className="mock-exam-meta-item">
                        <FileText size={15} aria-hidden="true" />
                        <span>{totalQuestions} ข้อ</span>
                      </div>
                      <div className="mock-exam-meta-item">
                        <Clock size={15} aria-hidden="true" />
                        <span>{q.duration_minutes ? `${q.duration_minutes} นาที` : 'ไม่กำหนดเวลา'}</span>
                      </div>
                      <div className="mock-exam-meta-item">
                        <Target size={15} aria-hidden="true" />
                        <span>{scoreText}</span>
                      </div>
                    </div>
                    <p className="mock-exam-attempt-note">{attemptText}</p>
                    <button
                      className="course-primary-action small mock-exam-start-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!isEnrolledCourse) {
                          alert('กรุณาเลือกแพ็กเกจและลงทะเบียนก่อนเริ่มทำข้อสอบ');
                          return;
                        }
                        const qid = q.quiz_id || q.id;
                        if (qid) navigate(`/course/${courseId}/mock-exam/${qid}`);
                      }}
                      type="button"
                    >
                      เริ่มทำข้อสอบ
                    </button>
                    <button
                      className="course-ghost-action small mock-exam-analysis-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!isEnrolledCourse) {
                          alert('กรุณาเลือกแพ็กเกจและลงทะเบียนก่อนดูผลวิเคราะห์');
                          return;
                        }
                        const qid = q.quiz_id || q.id;
                        if (qid) navigate(`/course/${courseId}/mock-exam/${qid}/analysis`);
                      }}
                      type="button"
                    >
                      ดูผลการสอบ
                    </button>
                  </article>
                  );
                })}
              </div>
              {mockExamTotalPages > 1 ? (
                <nav className="mock-exam-pagination" aria-label="หน้าข้อสอบจำลอง">
                  <button
                    className="mock-exam-page-button"
                    type="button"
                    onClick={() => setMockExamPage((page) => Math.max(1, page - 1))}
                    disabled={mockExamPage <= 1}
                  >
                    ก่อนหน้า
                  </button>
                  <span className="mock-exam-page-status">
                    หน้า {mockExamPage.toLocaleString('th-TH')} / {mockExamTotalPages.toLocaleString('th-TH')}
                  </span>
                  <button
                    className="mock-exam-page-button"
                    type="button"
                    onClick={() => setMockExamPage((page) => Math.min(mockExamTotalPages, page + 1))}
                    disabled={mockExamPage >= mockExamTotalPages}
                  >
                    ถัดไป
                  </button>
                </nav>
              ) : null}
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon minimal" aria-hidden="true" />
                <h3>ยังไม่มีข้อสอบจำลอง</h3>
                <p>ผู้สอนยังไม่ได้เพิ่มข้อสอบจำลองสำหรับคอร์สนี้</p>
              </div>
            )}
          </div>
        </div>
        )}

        {activeTab === 'analysis' && (
          <div className="lessons-tab analysis-layout compact-dashboard simple-quick" style={{ marginTop: 0 }}>
            <div className="analysis-main">
              <div className="lessons-header analysis-header">
                <div>
                  <h3>วิเคราะห์นักเรียน</h3>
                  <p>สรุปแบบย่อในหน้าเดียว</p>
                </div>
                <div className="analysis-controls">
                  <div className={`analysis-filter ${analysisSourceType === 'mock_exam' ? 'analysis-filter-hidden' : ''}`}>
                    <label htmlFor="analysis-scope">บทเรียน</label>
                    <select
                      id="analysis-scope"
                      value={analysisScope}
                      onChange={(event) => setAnalysisScope(event.target.value)}
                      disabled={!analysisOptions.length || analysisSourceType === 'mock_exam'}
                    >
                      {analysisOptions.length === 0 ? (
                        <option value="">ยังไม่มีบทเรียน</option>
                      ) : analysisOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                    ))}
                  </select>
                </div>
                  <div className="analysis-last-updated">
                    <span>อัปเดตล่าสุด</span>
                    <strong>{lastUpdatedLabel}</strong>
                  </div>
                  <div className="analysis-filter analysis-type-filter">
                    <label>ประเภทวิเคราะห์</label>
                    <div className="analysis-source-toggle" role="tablist" aria-label="เลือกประเภทการวิเคราะห์">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={analysisSourceType === 'lesson'}
                        className={analysisSourceType === 'lesson' ? 'active' : ''}
                        onClick={() => setAnalysisSourceType('lesson')}
                      >
                        บทเรียน
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={analysisSourceType === 'mock_exam'}
                        className={analysisSourceType === 'mock_exam' ? 'active' : ''}
                        onClick={() => setAnalysisSourceType('mock_exam')}
                      >
                        ข้อสอบจำลอง
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {analysisLoading ? (
                <div className="analysis-loading-shell" role="status" aria-live="polite" aria-label="กำลังโหลดข้อมูลวิเคราะห์">
                  <div className="analysis-loading-kpis">
                    {[0, 1, 2, 3].map((item) => (
                      <div className="analysis-loading-kpi-card" key={`analysis-loading-kpi-${item}`}>
                        <span className="analysis-loading-skeleton line w-32" />
                        <span className="analysis-loading-skeleton line tall w-44" />
                        <span className="analysis-loading-skeleton line w-28" />
                      </div>
                    ))}
                  </div>
                  <div className="analysis-loading-panel">
                    <div className="analysis-loading-panel-head">
                      <span className="analysis-loading-skeleton chip" />
                      <span className="analysis-loading-skeleton line w-38" />
                    </div>
                    <span className="analysis-loading-skeleton line w-72" />
                    <span className="analysis-loading-skeleton line w-58" />
                    <div className="analysis-loading-summary-list">
                      {[0, 1].map((item) => (
                        <div className="analysis-loading-summary-item" key={`analysis-loading-summary-${item}`}>
                          <span className="analysis-loading-skeleton avatar" />
                          <div className="analysis-loading-summary-copy">
                            <span className="analysis-loading-skeleton line w-40" />
                            <span className="analysis-loading-skeleton line w-68" />
                            <span className="analysis-loading-skeleton line w-52" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="analysis-loading-panel tall">
                    <div className="analysis-loading-panel-head">
                      <span className="analysis-loading-skeleton line w-32" />
                      <span className="analysis-loading-skeleton chip short" />
                    </div>
                    <span className="analysis-loading-skeleton chart" />
                  </div>
                </div>
              ) : null}

              {analysisError ? (
                <div className="analysis-card analysis-error-card">
                  <div className="analysis-card-header">
                    <h3>โหลดข้อมูลไม่สำเร็จ</h3>
                    <p>{analysisError}</p>
                  </div>
                </div>
              ) : null}

              {!analysisLoading && !analysisError && !analysisOptions.length ? (
                <div className="analysis-empty-soft">
                  <h4>{analysisSourceType === 'mock_exam' ? 'ยังไม่มีข้อสอบจำลองสำหรับการวิเคราะห์' : 'ยังไม่มีบทเรียนสำหรับการวิเคราะห์'}</h4>
                  <p>
                    {analysisSourceType === 'mock_exam'
                      ? 'รอผู้สอนเพิ่มข้อสอบจำลองก่อน แล้วข้อมูลวิเคราะห์จะแสดงที่หน้านี้'
                      : 'รอผู้สอนเพิ่มบทเรียนก่อน แล้วข้อมูลวิเคราะห์จะแสดงที่หน้านี้'}
                  </p>
                </div>
              ) : null}

              {!analysisLoading && !analysisError && analysisOptions.length > 0 && !hasFilteredData ? (
                <div className="analysis-empty-soft">
                  <h4>
                    {analysisSourceType === 'mock_exam'
                      ? 'ยังไม่มีข้อมูลพอสำหรับข้อสอบจำลองนี้'
                      : 'ยังไม่มีข้อมูลพอสำหรับบทเรียนนี้'}
                  </h4>
                  <p>
                    {analysisSourceType === 'mock_exam'
                      ? (analysisTopic !== 'all'
                        ? 'ยังไม่มีผลลัพธ์ในหัวข้อที่เลือก ลองเปลี่ยนหัวข้อหรือทำข้อสอบเพิ่ม'
                        : 'เริ่มทำข้อสอบจำลองที่เลือกก่อน เพื่อให้ระบบวิเคราะห์ได้แม่นขึ้น')
                      : (hasOnlyMockExamData
                        ? 'คอร์สนี้ยังไม่มีแบบฝึกที่ผูกกับบทเรียน แต่มีข้อสอบจำลอง ให้สลับไปแท็บ "ข้อสอบจำลอง" เพื่อดูผลวิเคราะห์'
                        : hasUnscopedLessonAttempts
                        ? 'พบผลแบบฝึกเดิมที่ยังไม่ผูกกับบทเรียนนี้ ให้เริ่มทำแบบฝึกจากบทเรียนที่เลือกอีก 1 ครั้งเพื่อแยกผลได้ถูกต้อง'
                        : 'ทำแบบฝึกหัดในบทเรียนที่เลือกก่อน เพื่อให้ระบบวิเคราะห์ได้แม่นขึ้น')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab(analysisSourceType === 'mock_exam' ? 'mock_exams' : 'lessons')}
                  >
                    {analysisSourceType === 'mock_exam' ? 'เริ่มทำข้อสอบจำลอง' : 'เริ่มทำแบบฝึก 10 ข้อ'}
                  </button>
                </div>
              ) : null}

              {!analysisLoading && !analysisError && analysisOptions.length > 0 && hasFilteredData ? (
                  <div className="analysis-redesign">
                    <section className="analysis-kpi-grid">
                      <article className="analysis-card analysis-kpi-card">
                        <span>ความคืบหน้า</span>
                        <strong>{analysisProgressCompleted}/{analysisProgressTotal}</strong>
                        <small>{analysisProgressPercent}% ของ{analysisProgressLabel}</small>
                      </article>
                      <article className="analysis-card analysis-kpi-card">
                        <span>Accuracy 7 วัน</span>
                        <strong>{accuracy7d}%</strong>
                        <small>{recentSevenRows.length} ครั้งล่าสุด</small>
                      </article>
                      <article className="analysis-card analysis-kpi-card">
                        <span>เวลาเฉลี่ยต่อข้อ</span>
                        <strong>{avgSecPerQuestion} วินาที</strong>
                        <small>ยิ่งต่ำยิ่งดี</small>
                      </article>
                      {analysisSourceType === 'mock_exam' ? (
                        <article className="analysis-card analysis-kpi-card">
                          <span>Topic ที่ควรโฟกัส</span>
                          <strong>{focusTopicLabel}</strong>
                          <small>{focusTopicMeta}</small>
                        </article>
                      ) : null}
                      {analysisSourceType !== 'mock_exam' ? (
                        <article className="analysis-card analysis-kpi-card">
                          <span>ความมั่นใจแม่นยำ</span>
                          <strong>{confidenceCalibration}%</strong>
                          <small>มั่นใจแต่ผิด {confidentWrongRate}%</small>
                        </article>
                      ) : null}
                    </section>

                    <section className="analysis-card analysis-ai-summary-card">
                      <div className="analysis-ai-head">
                        <div className="analysis-card-header">
                          <h3>แนะนำโดยผู้ช่วยอัจฉริยะ</h3>
                        </div>
                      </div>
                      {analysisLlmSummary.loading ? (
                        <div className="analysis-ai-loading-minimal" role="status" aria-live="polite" aria-label="AI กำลังวิเคราะห์">
                          <span className="analysis-ai-loading-dot" />
                          <span className="analysis-ai-loading-dot" />
                          <span className="analysis-ai-loading-dot" />
                        </div>
                      ) : (
                        <>
                          {(analysisLlmSummary.summaryParagraph || fallbackAnalysisSummary) ? (
                            <p className="analysis-ai-summary-text">
                              {analysisLlmSummary.summaryParagraph || fallbackAnalysisSummary}
                            </p>
                          ) : null}
                          {aiRecommendationDisplayRows.length > 0 ? (
                            <div className="analysis-ai-summary-list">
                              {aiRecommendationDisplayRows.map((item) => (
                                <div className="analysis-ai-summary-item" key={`ai-summary-${item.key}`}>
                                  <div className="analysis-ai-summary-kicker">
                                    <span className="analysis-ai-dot" aria-hidden="true" />
                                    <span>{item.sectionLabel}</span>
                                  </div>
                                  <div className="analysis-ai-summary-copy">
                                    <strong>{item.title}</strong>
                                    {Array.isArray(item.evidenceMetrics) && item.evidenceMetrics.length > 0 ? (
                                      <div className="analysis-ai-summary-metric-group">
                                        <p className="analysis-ai-summary-metric-label">
                                          จากข้อมูลล่าสุด
                                        </p>
                                        <div className="analysis-ai-summary-metrics">
                                          {item.evidenceMetrics.map((metric) => (
                                            <div className="analysis-ai-summary-metric" key={`${item.key}-${metric.key}`}>
                                              <span>{metric.label}</span>
                                              <strong>{metric.value}</strong>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : item.evidence ? (
                                      <p>
                                        <b>ข้อมูลล่าสุด:</b> {item.evidence}
                                      </p>
                                    ) : null}
                                    {item.action ? (
                                      <p className="analysis-ai-summary-action">
                                        <b>แนะนำให้ทำต่อ:</b> {item.action}
                                      </p>
                                    ) : null}
                                    {item.note ? (
                                      <p className="analysis-ai-summary-note">
                                        {item.note}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </section>

                    {analysisSourceType !== 'mock_exam' ? (
                      <section className="analysis-card analysis-difficulty-card">
                        <div className="analysis-card-header">
                          <h3>จุดแข็งแยกตามระดับโจทย์</h3>
                          <p>วัดจากข้อมูลรายข้อ เพื่อเห็นจุดที่ต้องเสริมในระดับ ง่าย / ปานกลาง / ยาก</p>
                        </div>
                        <div className="analysis-difficulty-grid">
                          {difficultyPerformance.map((row) => (
                            <article className="analysis-difficulty-item" key={row.key}>
                              <div className="analysis-difficulty-head">
                                <strong>{row.label}</strong>
                                <span className={`analysis-status-chip ${row.status === 'ดี' ? 'good' : row.status === 'เฝ้าระวัง' ? 'mid' : row.status === 'ยังไม่มีข้อมูล' ? 'neutral' : 'risk'}`}>
                                  {row.status}
                                </span>
                              </div>
                              <div className="analysis-difficulty-metric">
                                <span>ความแม่นยำ {row.accuracy}%</span>
                                <div className="analysis-meter"><i style={{ width: `${Math.max(4, row.accuracy)}%` }} /></div>
                              </div>
                              <div className="analysis-difficulty-metric">
                                <span>มั่นใจตรงจริง {row.confidenceMatchRate}%</span>
                                <div className="analysis-meter"><i style={{ width: `${Math.max(4, row.confidenceMatchRate)}%` }} /></div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <section className="analysis-card analysis-trend-card">
                      <div className="analysis-card-header">
                        <h3>{analysisSourceType === 'mock_exam' ? 'Accuracy แยกตามหัวข้อคอร์ส' : 'ภาพรวมพัฒนาการตามระดับโจทย์'}</h3>
                        {analysisSourceType !== 'mock_exam' ? (
                          <div className="analysis-trend-granularity" role="tablist" aria-label="เลือกระดับความยาก">
                            {trendViewOptions.map((option) => (
                              <button
                                key={`trend-difficulty-${option.key}`}
                                type="button"
                                role="tab"
                                aria-selected={trendDifficultyView === option.key}
                                className={`analysis-trend-granularity-btn ${trendDifficultyView === option.key ? 'active' : ''}`}
                                onClick={() => setTrendDifficultyView(option.key)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {analysisSourceType === 'mock_exam' ? (
                        mockTopicAccuracyRows.length > 0 ? (
                          <div className="analysis-trend-simple">
                            <div className="analysis-trend-legend">
                              <span>
                                <i style={{ background: '#0ea5e9' }} />
                                Accuracy ตามหัวข้อ
                              </span>
                            </div>
                            <div className="analysis-trend-chart-wrap">
                              <svg
                                className="analysis-trend-chart comparison-lines"
                                viewBox={`0 0 ${mockTopicChart.width} ${mockTopicChart.height}`}
                                role="img"
                                aria-label="กราฟแท่งเปอร์เซ็นต์ Accuracy ของแต่ละหัวข้อคอร์ส"
                              >
                                {mockTopicChart.yTicks.map((tick) => {
                                  const y = mockTopicChart.yFor(tick);
                                  return (
                                    <g key={`mock-topic-ytick-${tick}`}>
                                      <line
                                        x1={mockTopicChart.left}
                                        y1={y}
                                        x2={mockTopicChart.width - mockTopicChart.right}
                                        y2={y}
                                        className="line-grid"
                                      />
                                      <text x="16" y={y + 5} className="trend-axis">{tick}%</text>
                                    </g>
                                  );
                                })}
                                {mockTopicAccuracyRows.map((row, idx) => {
                                  const x = mockTopicChart.xFor(idx);
                                  const y = mockTopicChart.yFor(row.accuracy);
                                  const barHeight = Math.max(2, (mockTopicChart.top + mockTopicChart.innerHeight) - y);
                                  const displayTopic = row.topic.length > 14 ? `${row.topic.slice(0, 14)}...` : row.topic;
                                  return (
                                    <g key={`mock-topic-${row.topic}-${idx}`}>
                                      <rect
                                        x={x - (mockTopicChart.barWidth / 2)}
                                        y={y}
                                        width={mockTopicChart.barWidth}
                                        height={barHeight}
                                        rx="4"
                                        fill="#0ea5e9"
                                        opacity="0.9"
                                      >
                                        <title>{`${row.topic} • Accuracy ${row.accuracy}% (${row.correct}/${row.total})`}</title>
                                      </rect>
                                      <text
                                        x={x}
                                        y={Math.max(16, y - 6)}
                                        textAnchor="middle"
                                        className="trend-axis"
                                      >
                                        {row.accuracy}%
                                      </text>
                                      <text
                                        x={x}
                                        y={mockTopicChart.height - 14}
                                        textAnchor="middle"
                                        className="trend-axis"
                                      >
                                        {displayTopic}
                                      </text>
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>
                            <div className="analysis-trend-legend" style={{ marginTop: 14 }}>
                              <span>
                                <i style={{ background: '#0f766e' }} />
                                แนวโน้มคะแนนต่อครั้งที่ทำข้อสอบจำลอง
                              </span>
                            </div>
                            {mockOverallAttemptRows.length > 0 ? (
                              <div className="analysis-trend-chart-wrap">
                                <svg
                                  className="analysis-trend-chart comparison-lines"
                                  viewBox={`0 0 ${mockOverallChart.width} ${mockOverallChart.height}`}
                                  role="img"
                                  aria-label="กราฟเส้นเปอร์เซ็นต์ความถูกต้องต่อครั้งที่ทำข้อสอบจำลอง"
                                >
                                  {mockOverallChart.yTicks.map((tick) => {
                                    const y = mockOverallChart.yFor(tick);
                                    return (
                                      <g key={`mock-overall-line-ytick-${tick}`}>
                                        <line
                                          x1={mockOverallChart.left}
                                          y1={y}
                                          x2={mockOverallChart.width - mockOverallChart.right}
                                          y2={y}
                                          className="line-grid"
                                        />
                                        <text x="16" y={y + 5} className="trend-axis">{tick}%</text>
                                      </g>
                                    );
                                  })}
                                  {mockOverallAreaPath ? (
                                    <path d={mockOverallAreaPath} fill="rgba(15, 118, 110, 0.12)" stroke="none" />
                                  ) : null}
                                  {mockOverallPolyline ? (
                                    <polyline
                                      points={mockOverallPolyline}
                                      fill="none"
                                      stroke="#0f766e"
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  ) : null}
                                  {mockOverallPoints.map((pt, idx) => (
                                    <g key={`mock-overall-point-${idx}`}>
                                      <circle cx={pt.x} cy={pt.y} r="4" fill="#0f766e">
                                        <title>{`${pt.quizTitle} • ${pt.dateLabel} • ${pt.score}%`}</title>
                                      </circle>
                                      <text x={pt.x} y={Math.max(16, pt.y - 8)} textAnchor="middle" className="trend-axis">
                                        {pt.score}%
                                      </text>
                                      <text x={pt.x} y={mockOverallChart.height - 14} textAnchor="middle" className="trend-axis">
                                        {pt.label}
                                      </text>
                                    </g>
                                  ))}
                                </svg>
                              </div>
                            ) : (
                              <p className="analysis-muted">ยังไม่มีข้อมูลผลสอบจำลองสำหรับแสดงแนวโน้มรายครั้ง</p>
                            )}
                          </div>
                        ) : (
                          <p className="analysis-muted">ยังไม่มีข้อมูลรายหัวข้อคอร์สสำหรับข้อสอบจำลอง</p>
                        )
                      ) : trendSeriesRows.length > 0 ? (
                        <div className="analysis-trend-simple">
                          <div className="analysis-trend-chart-wrap">
                            <svg
                              className="analysis-trend-chart comparison-lines"
                              viewBox={`0 0 ${trendChart.width} ${trendChart.height}`}
                              role="img"
                              aria-label={`กราฟแท่ง accuracy ระดับ${difficultyLabel[trendDifficultyView]} แยกตามครั้งที่ทำ`}
                            >
                              {trendChart.yTicks.map((tick) => {
                                const y = trendChart.yFor(tick);
                                return (
                                  <g key={`trend-ytick-${tick}`}>
                                    <line
                                      x1={trendChart.left}
                                      y1={y}
                                      x2={trendChart.width - trendChart.right}
                                      y2={y}
                                      className="line-grid"
                                    />
                                    <text x="16" y={y + 5} className="trend-axis">{tick}%</text>
                                  </g>
                                );
                              })}

                              {trendSeriesRows.map((row, idx) => {
                                const x = trendChart.xFor(idx);
                                const y = trendChart.yFor(row.score);
                                const barHeight = Math.max(2, (trendChart.top + trendChart.innerHeight) - y);
                                return (
                                  <g key={`trend-group-${row.ts}`}>
                                    <rect
                                      x={x - (trendChart.barWidth / 2)}
                                      y={y}
                                      width={trendChart.barWidth}
                                      height={barHeight}
                                      rx="4"
                                      fill={trendAccentColor}
                                      opacity="0.9"
                                    >
                                      <title>{`${row.dateLabel} • Accuracy ${row.score}%`}</title>
                                    </rect>
                                    <circle
                                      cx={x}
                                      cy={y}
                                      r="3.2"
                                      fill="#ffffff"
                                      stroke={trendAccentColor}
                                      strokeWidth="2"
                                    >
                                      <title>{`${row.dateLabel} • Accuracy ${row.score}%`}</title>
                                    </circle>
                                    <text
                                      x={x}
                                      y={trendChart.height - 14}
                                      textAnchor="middle"
                                      className="trend-axis"
                                    >
                                      {row.attemptLabel}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        </div>
                      ) : (
                        <p className="analysis-muted">ต้องมีอย่างน้อย 1 ครั้งเพื่อแสดงแนวโน้ม</p>
                      )}
                    </section>

                    <section className="analysis-card analysis-priority-card">
                      <div className="analysis-card-header">
                        <h3>10 ข้อที่ควรทบทวนก่อน (5 ครั้งล่าสุด)</h3>
                      </div>
                      <div className="analysis-priority-list">
                        {activePriorityQuestion ? (
                          <div className="analysis-priority-item" key={`${activePriorityQuestion.question_id || priorityQuestionIndex}`}>
                            <span className="rank">{priorityQuestionIndex + 1}</span>
                            <div>
                              <strong>
                                ข้อ {activePriorityQuestion.question_index}: <MathText text={String(activePriorityQuestion.question_text || '')} inline />
                              </strong>
                              <p>
                                เวลา {activePriorityQuestion.sec_per_question || 0}s
                                {' • '}
                                {activePriorityQuestion.is_correct === true ? 'ตอบถูก' : activePriorityQuestion.is_correct === false ? 'ตอบผิด' : 'ไม่ทราบผล'}
                                {' • '}
                                {activePriorityQuestion.confidence === 'confident' ? 'มั่นใจ' : activePriorityQuestion.confidence === 'not_confident' ? 'ไม่มั่นใจ' : 'ไม่ระบุความมั่นใจ'}
                                {activePriorityQuestion.isConfidentWrong ? ' • มั่นใจผิด' : ''}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="analysis-muted">ยังไม่มีข้อมูลรายข้อจาก 5 ครั้งล่าสุด</p>
                        )}
                      </div>
                      <div className="analysis-priority-actions">
                        <button
                          type="button"
                          className="course-ghost-action small"
                          onClick={() => setPriorityQuestionIndex((prev) => Math.max(0, prev - 1))}
                          disabled={latestTopPriorityQuestions.length <= 1 || priorityQuestionIndex <= 0}
                        >
                          ก่อนหน้า
                        </button>
                        <button
                          type="button"
                          className="course-ghost-action small"
                          onClick={() => setPriorityQuestionIndex((prev) => Math.min(latestTopPriorityQuestions.length - 1, prev + 1))}
                          disabled={latestTopPriorityQuestions.length <= 1 || priorityQuestionIndex >= latestTopPriorityQuestions.length - 1}
                        >
                          ถัดไป
                        </button>
                        <button
                          type="button"
                          className="course-primary-action small"
                          onClick={() => {
                            if (topPracticeQuiz) {
                              requestPracticeSplitStart(topPracticeQuiz);
                            }
                          }}
                          disabled={!topPracticeQuiz}
                        >
                          ฝึกซ้ำ 10 ข้อนี้
                        </button>
                        {!topPracticeQuiz ? (
                          <p className="analysis-muted">ยังสร้างแบบฝึกซ้ำไม่ได้ เพราะบางข้อไม่มีตัวเลือกหรือเฉลยครบ</p>
                        ) : (
                          <p className="analysis-muted">กดเพื่อเปิดแบบฝึกซ้ำทันที พร้อมบันทึกผลเหมือนแบบฝึกปกติ</p>
                        )}
                      </div>
                    </section>
                  </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Quizzes/Chat moved to LessonPage */}
        </>
        )}
      </div>
      <ConfirmActionDialog
        open={Boolean(practiceStartDialog)}
        title={practiceStartDialog?.title || 'ยืนยันเริ่มทำแบบฝึก'}
        message={practiceStartDialog?.message || ''}
        confirmText="เริ่มทำ"
        cancelText="ยกเลิก"
        onConfirm={handleConfirmPracticeSplitStart}
        onClose={() => setPracticeStartDialog(null)}
      />
      <ConfirmActionDialog
        open={Boolean(trialStartDialog)}
        title={trialStartDialog?.title || 'ยืนยันเริ่มทดลองเรียน'}
        message={trialStartDialog?.message || ''}
        confirmText="OK"
        cancelText="ยกเลิก"
        onConfirm={handleConfirmTrialStart}
        onClose={() => setTrialStartDialog(null)}
      />
      </>
      ) : null}
    </div>
    </ErrorBoundary>
  );
};

export default CoursePage;

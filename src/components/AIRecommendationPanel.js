import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Play,
  Puzzle,
  Sparkles,
  Target,
  Trophy,
  TriangleAlert,
} from 'lucide-react';
import { secureAPI } from '../utils/api';
import bannerImage from '../assets/images/illustrations/auth-login-banner.webp';
import ConfirmActionDialog from './ConfirmActionDialog';

const clampPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const toNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const normalizeSpacing = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const truncateText = (value, maxLength = 120) => {
  const text = normalizeSpacing(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
};

const WEAK_TOPIC_CHART_COLORS = ['#3f77ec', '#7cc8a9', '#f0bd5d', '#ef8f8a', '#8d7cf6'];

const getPracticeQuestionCount = (practiceSet) => {
  const explicitTotal = Number(practiceSet?.totalQuestions);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return Math.round(explicitTotal);
  }
  if (Array.isArray(practiceSet?.questions)) {
    return practiceSet.questions.length;
  }
  return 0;
};

const resolveUserId = (user) => (
  user?.user_id
  || user?.id
  || user?.studentId
  || user?.username
  || null
);

const formatThaiDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const normalizeDifficultyKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'medium';
  if (
    raw === 'easy'
    || raw === 'ง่าย'
    || raw === 'beginner'
    || raw === 'low'
  ) return 'easy';
  if (
    raw === 'hard'
    || raw === 'ยาก'
    || raw === 'advanced'
    || raw === 'high'
  ) return 'hard';
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (numeric <= 2) return 'easy';
    if (numeric >= 4) return 'hard';
    return 'medium';
  }
  return 'medium';
};

const blendLessonScore = (row) => {
  const lessonScore = Number.isFinite(Number(row?.scoreSplit?.lesson))
    ? clampPercent(row.scoreSplit.lesson)
    : null;
  const mockScore = Number.isFinite(Number(row?.scoreSplit?.mockExam))
    ? clampPercent(row.scoreSplit.mockExam)
    : null;
  if (lessonScore != null && mockScore != null) return Math.round((lessonScore + mockScore) / 2);
  if (lessonScore != null) return lessonScore;
  if (mockScore != null) return mockScore;
  return null;
};

const toTrendRows = (selectedCourse, userResultRows) => {
  const dashboardRows = Array.isArray(selectedCourse?.attemptRows) ? selectedCourse.attemptRows : [];
  if (dashboardRows.length > 0) {
    return dashboardRows
      .map((row, index) => ({
        id: row?.id || `dashboard-attempt-${index + 1}`,
        score: clampPercent(row?.score),
        label: String(row?.label || `ครั้งที่ ${index + 1}`),
        submittedAt: row?.submittedAt || null,
      }))
      .slice(-7);
  }

  return (Array.isArray(userResultRows) ? userResultRows : [])
    .slice(0, 7)
    .map((item, index) => {
      const totalQuestions = Math.max(0, toNumber(item?.total_questions));
      const correctCount = Math.max(0, toNumber(item?.correct_count));
      const score = totalQuestions > 0
        ? clampPercent((correctCount / totalQuestions) * 100)
        : clampPercent(item?.score);
      const date = item?.submitted_at ? new Date(item.submitted_at) : null;
      const label = date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' })
        : `ครั้งที่ ${index + 1}`;
      return {
        id: item?.result_id || item?.id || `result-${index + 1}`,
        score,
        label,
        submittedAt: item?.submitted_at || null,
      };
    })
    .reverse();
};

const parseMissedQuestions = (result) => {
  const totalQuestions = Math.max(0, toNumber(result?.total_questions));
  const correctCount = Math.max(0, toNumber(result?.correct_count));
  if (totalQuestions > 0) {
    return Math.max(0, totalQuestions - correctCount);
  }
  return 0;
};

const getQuizQuestions = (quiz) => {
  if (Array.isArray(quiz?.questions)) return quiz.questions;
  if (Array.isArray(quiz?.questions_data)) return quiz.questions_data;
  return [];
};

const normalizeCorrectIndex = (question, options = []) => {
  const candidate = question?.correct_index
    ?? question?.correctAnswer
    ?? question?.correct_answer
    ?? question?.answer_index
    ?? question?.correct
    ?? question?.answer;

  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate >= 0 && candidate < options.length ? Math.round(candidate) : -1;
  }

  if (typeof candidate === 'string') {
    const raw = candidate.trim().toLowerCase();
    const labelMap = {
      a: 0, '1': 0, ก: 0,
      b: 1, '2': 1, ข: 1,
      c: 2, '3': 2, ค: 2,
      d: 3, '4': 3, ง: 3,
    };
    if (raw in labelMap && labelMap[raw] < options.length) return labelMap[raw];
    const exactIdx = options.findIndex((option) => String(option).trim().toLowerCase() === raw);
    if (exactIdx >= 0) return exactIdx;
    const numericMatch = raw.match(/(\d+)/);
    if (numericMatch) {
      const parsed = Number(numericMatch[1]) - 1;
      if (parsed >= 0 && parsed < options.length) return parsed;
    }
  }

  return -1;
};

const normalizeAnswerIndex = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const labelMap = { a: 0, ก: 0, b: 1, ข: 1, c: 2, ค: 2, d: 3, ง: 3 };
    const lower = trimmed.toLowerCase();
    if (lower in labelMap) return labelMap[lower];
  }
  return null;
};

const getAnswerForQuestion = (result, question, index) => {
  const answers = result?.answers;
  if (Array.isArray(answers)) return normalizeAnswerIndex(answers[index]);
  if (answers && typeof answers === 'object') {
    const questionId = String(question?.id || `q${index + 1}`);
    return normalizeAnswerIndex(answers[questionId]);
  }
  return null;
};

const getQuestionText = (question, fallbackIndex) => String(
  question?.question || question?.text || question?.prompt || `ข้อ ${fallbackIndex + 1}`
).trim();

const getQuestionOptions = (question) => {
  if (Array.isArray(question?.choices)) return question.choices;
  if (Array.isArray(question?.options)) return question.options;
  return [];
};

const getQuestionExplanation = (question) => String(
  question?.explanation
  || question?.rationale
  || question?.solution
  || question?.explain
  || question?.answer_explanation
  || question?.answerExplanation
  || ''
).trim();

const getQuestionTopic = (question) => String(
  question?.topic_tag || question?.topicTag || question?.topic || question?.subject_tag || ''
).trim() || 'ไม่ระบุหัวข้อ';

const makePracticeQuestion = (row, index) => ({
  id: row.questionId || `ai-review-${index + 1}`,
  question: row.questionText || `ข้อ ${index + 1}`,
  context: row.context || null,
  options: row.options,
  correctAnswer: row.correctAnswer,
  explanation: row.explanation || '',
  difficulty: row.difficulty ?? null,
  topic: row.topic || null,
  topic_tag: row.topic || null,
  quizTitle: row.quizTitle || null,
  quiz_title: row.quizTitle || null,
});

const buildPracticeSet = ({ key, title, subtitle, tone, rows }) => {
  const practiceRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => (
      Array.isArray(row?.options)
      && row.options.length >= 2
      && Number.isInteger(row?.correctAnswer)
      && row.correctAnswer >= 0
      && row.correctAnswer < row.options.length
    ))
    .slice(0, 10);
  const resolvedTitle = practiceRows.length > 0
    ? String(title || '').replace(/\b10\s*ข้อ/g, `${practiceRows.length} ข้อ`)
    : title;

  return {
    key,
    title: resolvedTitle,
    subtitle,
    tone,
    count: practiceRows.length,
    questions: practiceRows.map(makePracticeQuestion),
    practiceSet: practiceRows.length > 0
      ? {
        id: `ai-${key}-${Date.now()}`,
        title: resolvedTitle,
        description: subtitle,
        totalQuestions: practiceRows.length,
        timeLimit: Math.max(10, practiceRows.length * 2),
        questions: practiceRows.map(makePracticeQuestion),
      }
      : null,
  };
};

const buildSingleQuestionPracticeSet = (row) => {
  if (
    !row
    || !Array.isArray(row?.options)
    || row.options.length < 2
    || !Number.isInteger(row?.correctAnswer)
    || row.correctAnswer < 0
    || row.correctAnswer >= row.options.length
  ) {
    return null;
  }

  return {
    id: `ai-review-question-${row.id}`,
    title: `ทบทวนข้อ ${row.questionIndex || 1}`,
    description: 'ดูโจทย์และช้อยส์ แล้วลองทำข้อนี้อีกครั้ง',
    totalQuestions: 1,
    timeLimit: 10,
    questions: [makePracticeQuestion(row, 0)],
  };
};

const buildReviewFocusPracticeSet = (rows) => {
  const questions = (Array.isArray(rows) ? rows : [])
    .map((row) => row?.practiceSet?.questions?.[0])
    .filter(Boolean)
    .slice(0, 3);

  if (questions.length === 0) return null;

  const questionIds = questions.map((question, index) => question?.id || index + 1).join('-');

  return {
    id: `ai-review-focus-${questionIds}`,
    title: `ทบทวน ${questions.length} ข้อที่ควรโฟกัส`,
    description: 'ดูโจทย์และช้อยส์ครบชุด แล้วลองทำทุกข้ออีกครั้ง',
    totalQuestions: questions.length,
    timeLimit: Math.max(10, questions.length * 3),
    questions,
  };
};

const getPracticeRecommendationDescription = (card, courseInsights) => {
  const wrongQuestions = Array.isArray(courseInsights?.wrongQuestions)
    ? courseInsights.wrongQuestions
    : [];
  const weakTopics = Array.isArray(courseInsights?.weakTopics)
    ? courseInsights.weakTopics
    : [];
  const topQuestion = wrongQuestions[0] || null;
  const topTopic = weakTopics[0] || null;
  const topicLabel = String(topQuestion?.topic || topTopic?.topic || '').trim();
  const cardKey = String(card?.key || '').trim();

  if (cardKey === 'recent-mistakes') {
    return topicLabel
      ? `ชุดทบทวนข้อที่พลาดล่าสุด เน้นเรื่อง ${topicLabel}`
      : 'ชุดทบทวนข้อที่พลาดล่าสุด เพื่อกลับมาเช็กความเข้าใจอีกครั้ง';
  }

  if (cardKey === 'weak-topic') {
    return topicLabel
      ? `ชุดฝึกหัวข้อ ${topicLabel} เพื่อเสริมจุดที่ยังไม่แม่น`
      : 'ชุดฝึกหัวข้อที่ยังไม่แม่นจากผลการทำข้อสอบล่าสุด';
  }

  if (topicLabel) {
    return `ชุดโจทย์ท้าทายที่เกี่ยวกับ ${topicLabel} และแนวที่เคยใช้เวลานาน`;
  }
  return 'ชุดโจทย์ท้าทายสำหรับเช็กความพร้อมก่อนขยับระดับ';
};

const aggregateQuestionInsights = (quizzes, results) => {
  const quizById = new Map();
  (Array.isArray(quizzes) ? quizzes : []).forEach((quiz) => {
    const ids = [
      quiz?.quiz_id,
      quiz?.id,
      quiz?.document_id,
      quiz?.quizId,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    ids.forEach((id) => quizById.set(id, quiz));
  });

  const recentFiveResultIds = new Set(
    (Array.isArray(results) ? results : [])
      .slice(0, 5)
      .map((result, index) => String(result?.result_id || result?.id || `result-${index}`))
  );
  const questionMap = new Map();
  const latestWrongRows = [];
  const allAnsweredRows = [];
  const difficultyBuckets = {
    easy: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    hard: { correct: 0, total: 0 },
  };

  (Array.isArray(results) ? results : []).forEach((result, resultIndex) => {
    const quizId = String(result?.quiz_id || '').trim();
    const quiz = quizById.get(quizId);
    const questions = getQuizQuestions(quiz);
    if (!quiz || questions.length === 0) return;

    const resultId = String(result?.result_id || result?.id || `result-${resultIndex}`);
    const submittedAt = result?.submitted_at || result?.created_at || null;
    const quizTitle = String(
      result?.quiz_title || result?.quiz_name || quiz?.title || quiz?.name || 'แบบฝึกหัด'
    ).trim();
    const perQuestionTimes = result?.per_question_time_seconds && typeof result.per_question_time_seconds === 'object'
      ? result.per_question_time_seconds
      : {};
    const confidenceByQuestion = result?.confidence_by_question && typeof result.confidence_by_question === 'object'
      ? result.confidence_by_question
      : {};

    questions.forEach((question, index) => {
      const questionId = String(question?.id || `q${index + 1}`);
      const options = getQuestionOptions(question);
      const correctAnswer = normalizeCorrectIndex(question, options);
      const answer = getAnswerForQuestion(result, question, index);
      const isAnswered = answer != null;
      const isCorrect = isAnswered && correctAnswer >= 0 ? answer === correctAnswer : null;
      const timeSpent = Math.max(0, toNumber(perQuestionTimes[questionId]));
      const confidence = String(confidenceByQuestion[questionId] || '').trim().toLowerCase();
      const baseRow = {
        id: `${quizId}-${questionId}`,
        quizId,
        resultId,
        questionId,
        questionIndex: index + 1,
        questionText: getQuestionText(question, index),
        context: question?.context || question?.question_context || null,
        options,
        correctAnswer,
        explanation: getQuestionExplanation(question),
        difficulty: question?.difficulty
          ?? question?.level
          ?? question?.difficulty_score
          ?? quiz?.difficulty_avg
          ?? quiz?.difficulty
          ?? quiz?.level_difficulty
          ?? quiz?.difficulty_level
          ?? quiz?.level
          ?? null,
        topic: getQuestionTopic(question),
        quizTitle,
        submittedAt,
        timeSpent,
        confidence,
        isConfidentWrong: confidence === 'confident' && isCorrect === false,
        isRecentFive: recentFiveResultIds.has(resultId),
      };

      if (isAnswered) {
        const difficultyBucket = normalizeDifficultyKey(baseRow.difficulty);
        difficultyBuckets[difficultyBucket].total += 1;
        difficultyBuckets[difficultyBucket].correct += isCorrect === true ? 1 : 0;
        allAnsweredRows.push({ ...baseRow, isCorrect });
      }
      if (isCorrect !== false) return;

      if (baseRow.isRecentFive) latestWrongRows.push(baseRow);

      const current = questionMap.get(baseRow.id) || {
        ...baseRow,
        wrongCount: 0,
        latestSubmittedAt: submittedAt,
        recentWrongCount: 0,
        totalTimeSpent: 0,
        attempts: 0,
      };
      current.wrongCount += 1;
      current.recentWrongCount += baseRow.isRecentFive ? 1 : 0;
      current.totalTimeSpent += timeSpent;
      current.attempts += 1;
      current.latestSubmittedAt = submittedAt || current.latestSubmittedAt;
      current.isConfidentWrong = current.isConfidentWrong || baseRow.isConfidentWrong;
      questionMap.set(baseRow.id, current);
    });
  });

  const wrongQuestions = Array.from(questionMap.values())
    .map((row) => ({
      ...row,
      avgTimeSpent: row.attempts > 0 ? Math.round(row.totalTimeSpent / row.attempts) : 0,
      priority: (row.recentWrongCount * 35)
        + (row.wrongCount * 25)
        + (row.isConfidentWrong ? 30 : 0)
        + Math.min(20, Math.round((row.totalTimeSpent || 0) / 30)),
    }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      const at = a.latestSubmittedAt ? new Date(a.latestSubmittedAt).getTime() : 0;
      const bt = b.latestSubmittedAt ? new Date(b.latestSubmittedAt).getTime() : 0;
      return bt - at;
    });

  const topicMap = new Map();
  wrongQuestions.forEach((row) => {
    const current = topicMap.get(row.topic) || {
      id: row.topic,
      topic: row.topic,
      wrongCount: 0,
      questionCount: 0,
      rows: [],
    };
    current.wrongCount += row.wrongCount;
    current.questionCount += 1;
    current.rows.push(row);
    topicMap.set(row.topic, current);
  });
  const weakTopics = Array.from(topicMap.values())
    .sort((a, b) => {
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      return b.questionCount - a.questionCount;
    })
    .slice(0, 5);

  const recentWrongPracticeRows = [
    ...latestWrongRows,
    ...wrongQuestions,
  ].filter((row, index, arr) => arr.findIndex((candidate) => candidate.id === row.id) === index);
  const weakestTopicRows = weakTopics[0]?.rows || [];
  const slowOrConfidentRows = wrongQuestions
    .slice()
    .sort((a, b) => {
      if (Number(b.isConfidentWrong) !== Number(a.isConfidentWrong)) {
        return Number(b.isConfidentWrong) - Number(a.isConfidentWrong);
      }
      if ((b.avgTimeSpent || 0) !== (a.avgTimeSpent || 0)) return (b.avgTimeSpent || 0) - (a.avgTimeSpent || 0);
      return b.priority - a.priority;
    });
  const hardChallengeRows = slowOrConfidentRows
    .filter((row) => normalizeDifficultyKey(row?.difficulty) === 'hard');

  return {
    wrongQuestions,
    weakTopics,
    difficultyScore: {
      easy: difficultyBuckets.easy.total > 0
        ? Math.round((difficultyBuckets.easy.correct / difficultyBuckets.easy.total) * 100)
        : null,
      medium: difficultyBuckets.medium.total > 0
        ? Math.round((difficultyBuckets.medium.correct / difficultyBuckets.medium.total) * 100)
        : null,
      hard: difficultyBuckets.hard.total > 0
        ? Math.round((difficultyBuckets.hard.correct / difficultyBuckets.hard.total) * 100)
        : null,
    },
    answeredQuestionCount: allAnsweredRows.length,
    recommendedPracticeSets: [
      buildPracticeSet({
        key: 'recent-mistakes',
        title: 'ฝึกซ้ำ 10 ข้อที่พลาดล่าสุด',
        subtitle: 'จากข้อผิดใน 5 ครั้งล่าสุด',
        tone: 'easy',
        rows: recentWrongPracticeRows,
      }),
      buildPracticeSet({
        key: 'weak-topic',
        title: 'เก็บหัวข้ออ่อน 10 ข้อ',
        subtitle: weakTopics[0]?.topic ? `เน้น ${weakTopics[0].topic}` : 'จากหัวข้อที่ผิดบ่อยที่สุด',
        tone: 'medium',
        rows: [...weakestTopicRows, ...wrongQuestions],
      }),
      buildPracticeSet({
        key: 'level-up',
        title: 'รวมโจทย์ท้าทาย',
        subtitle: 'คัดเฉพาะโจทย์ยากที่เคยพลาด ทำช้า หรือมั่นใจแต่พลาด',
        tone: 'hard',
        rows: hardChallengeRows,
      }),
    ],
  };
};

const AIRecommendationPanel = ({
  user,
  courses = [],
  selectedCourseId,
  onSelectedCourseIdChange,
  loading = false,
  onBrowseCourses,
  onOpenCourseTab,
  onOpenCourseAnalysis,
}) => {
  const [courseInsights, setCourseInsights] = useState({
    loading: false,
    latestWrongCount: 0,
    mockExamCount: 0,
    bucketCounts: { easy: 0, medium: 0, hard: 0 },
    difficultyScore: { easy: null, medium: null, hard: null },
    weakAttempts: [],
    wrongQuestions: [],
    weakTopics: [],
    recommendedPracticeSets: [],
    answeredQuestionCount: 0,
    recentResultRows: [],
  });
  const [practiceStartDialog, setPracticeStartDialog] = useState(null);
  const [recommendationSlideIndex, setRecommendationSlideIndex] = useState(0);

  const resolvedUserId = useMemo(() => resolveUserId(user), [user]);
  const selectedCourse = useMemo(() => {
    if (!Array.isArray(courses) || courses.length === 0) return null;
    const found = courses.find((course) => String(course?.id || course?.course_id) === String(selectedCourseId || ''));
    return found || courses[0] || null;
  }, [courses, selectedCourseId]);

  const lessonRows = useMemo(() => {
    const rows = Array.isArray(selectedCourse?.lessonRows) ? selectedCourse.lessonRows : [];
    return rows
      .map((row, index) => {
        const score = blendLessonScore(row);
        return {
          id: row?.id || `lesson-${index + 1}`,
          name: String(row?.name || `บทเรียน ${index + 1}`),
          score,
        };
      });
  }, [selectedCourse]);

  const lessonWeakRows = useMemo(() => {
    return lessonRows
      .filter((row) => Number.isFinite(row.score))
      .sort((a, b) => a.score - b.score);
  }, [lessonRows]);

  const lessonRecommendationRows = useMemo(() => {
    return [...lessonRows].sort((a, b) => {
      const aHasScore = Number.isFinite(a.score);
      const bHasScore = Number.isFinite(b.score);
      if (aHasScore && bHasScore) return a.score - b.score;
      if (aHasScore) return -1;
      if (bHasScore) return 1;
      return 0;
    });
  }, [lessonRows]);

  const trendRows = useMemo(
    () => toTrendRows(selectedCourse, courseInsights.recentResultRows),
    [selectedCourse, courseInsights.recentResultRows]
  );

  const weakTopic = lessonWeakRows[0] || null;
  const weakQuestionTopics = Array.isArray(courseInsights.weakTopics)
    ? courseInsights.weakTopics.map((row, index) => ({
      id: row?.id || row?.topic || `weak-topic-${index + 1}`,
      topic: row?.topic || row?.name || 'ไม่ระบุหัวข้อ',
      wrongCount: Math.max(0, toNumber(row?.wrongCount, row?.wrong_count)),
      questionCount: Math.max(0, toNumber(row?.questionCount, row?.question_count)),
    }))
    : [];
  const fallbackTopicRows = Array.isArray(selectedCourse?.topicRows)
    ? selectedCourse.topicRows
        .map((row, index) => {
          const total = Math.max(0, toNumber(row?.total));
          const correct = Math.max(0, toNumber(row?.correct));
          return {
            id: row?.id || row?.topic || `course-topic-${index + 1}`,
            topic: row?.topic || row?.name || 'ไม่ระบุหัวข้อ',
            wrongCount: Math.max(0, total - correct),
            questionCount: total,
          };
        })
        .sort((a, b) => {
          if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
          if (b.questionCount !== a.questionCount) return b.questionCount - a.questionCount;
          return String(a.topic || '').localeCompare(String(b.topic || ''), 'th');
        })
    : [];
  const nextWeakTopics = (weakQuestionTopics.length > 0 ? weakQuestionTopics : fallbackTopicRows).slice(0, 5);
  const weakTopicTotal = nextWeakTopics.reduce((sum, row) => {
    const value = Number(row?.wrongCount);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
  let weakTopicChartCursor = 0;
  const weakTopicChartRows = nextWeakTopics.map((row, index) => {
    const rawValue = Number(row?.wrongCount);
    const value = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0;
    const percent = weakTopicTotal > 0 ? Math.round((value / weakTopicTotal) * 100) : 0;
    const start = weakTopicChartCursor;
    weakTopicChartCursor += weakTopicTotal > 0 ? (value / weakTopicTotal) * 100 : 0;
    return {
      ...row,
      chartColor: WEAK_TOPIC_CHART_COLORS[index % WEAK_TOPIC_CHART_COLORS.length],
      chartPercent: percent,
      chartStart: start,
      chartEnd: weakTopicChartCursor,
      chartValue: value,
    };
  });
  const weakTopicPieBackground = weakTopicChartRows.length > 0 && weakTopicTotal > 0
    ? `conic-gradient(${weakTopicChartRows.map((row) => `${row.chartColor} ${row.chartStart}% ${row.chartEnd}%`).join(', ')})`
    : '#edf3fb';
  const focusTopicLabel = weakQuestionTopics[0]?.topic || weakTopic?.name || null;
  const focusLessonRows = lessonRecommendationRows;
  const panelDifficultyScore = courseInsights.difficultyScore || {};
  const courseDifficultyScore = selectedCourse?.difficultyScore || {};
  const difficultyRows = [
    { key: 'easy', label: 'ง่าย', score: panelDifficultyScore.easy ?? courseDifficultyScore.easy },
    { key: 'medium', label: 'ปานกลาง', score: panelDifficultyScore.medium ?? courseDifficultyScore.medium },
    { key: 'hard', label: 'ยาก', score: panelDifficultyScore.hard ?? courseDifficultyScore.hard },
  ].map((row) => ({
    ...row,
    score: Number.isFinite(Number(row.score)) ? clampPercent(row.score) : null,
  }));
  const hasDifficultyData = difficultyRows.some((row) => row.score != null);
  const questionReviewRows = (Array.isArray(courseInsights.wrongQuestions) ? courseInsights.wrongQuestions : [])
    .map((row) => {
      const reasonParts = [];
      if (Number(row?.wrongCount) > 0) reasonParts.push(`ผิด ${row.wrongCount} ครั้ง`);
      if (Number(row?.recentWrongCount) > 0) reasonParts.push('พลาดใน 5 ครั้งล่าสุด');
      if ((row?.avgTimeSpent || 0) >= 90) reasonParts.push('ใช้เวลานาน');
      if (row?.isConfidentWrong) reasonParts.push('มั่นใจแต่ตอบผิด');
      const practiceSet = buildSingleQuestionPracticeSet(row);
      return {
        id: `question-${row.id}`,
        type: 'question',
        title: row.topic || 'ไม่ระบุหัวข้อ',
        detail: `ข้อ ${row.questionIndex}: ${truncateText(row.questionText, 72)}`,
        reason: reasonParts.join(' • ') || 'ควรทบทวนก่อนทำรอบถัดไป',
        pill: reasonParts[0] || 'ทบทวน',
        practiceSet,
      };
    })
    .filter((row) => row.practiceSet)
    .slice(0, 3);
  const reviewFocusRows = questionReviewRows.length > 0
    ? questionReviewRows
    : focusLessonRows.map((row) => ({
      id: `lesson-review-${row.id}`,
      type: 'lesson',
      title: row.name,
      detail: Number.isFinite(row.score) ? 'บทเรียนคะแนนต่ำสุดจากข้อมูลที่มี' : 'บทเรียนที่ยังไม่มีผลการทำแบบฝึก',
      reason: Number.isFinite(row.score) ? `คะแนน ${clampPercent(row.score)}%` : 'ยังไม่มีคะแนน',
      pill: Number.isFinite(row.score) ? `${clampPercent(row.score)}%` : '-',
    }));
  const reviewFocusPracticeSet = buildReviewFocusPracticeSet(questionReviewRows);
  const hasAnyAttempt = trendRows.length > 0 || (Array.isArray(selectedCourse?.attemptRows) && selectedCourse.attemptRows.length > 0);
  const hasAnyWeakLesson = lessonWeakRows.length > 0;
  const hasAnyData = hasAnyAttempt || hasAnyWeakLesson;
  const hasWrongQuestions = Array.isArray(courseInsights.wrongQuestions) && courseInsights.wrongQuestions.length > 0;
  const updateLabel = courseInsights.recentResultRows[0]?.submitted_at || selectedCourse?.lastActivity;

  useEffect(() => {
    let cancelled = false;
    if (!selectedCourse || !resolvedUserId) {
      setCourseInsights({
        loading: false,
        latestWrongCount: 0,
        mockExamCount: 0,
        bucketCounts: { easy: 0, medium: 0, hard: 0 },
        difficultyScore: { easy: null, medium: null, hard: null },
        weakAttempts: [],
        wrongQuestions: [],
        weakTopics: [],
        recommendedPracticeSets: [],
        answeredQuestionCount: 0,
        recentResultRows: [],
      });
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      const courseId = String(selectedCourse?.id || selectedCourse?.course_id || '').trim();
      if (!courseId) return;

      setCourseInsights((prev) => ({ ...prev, loading: true }));

      try {
        const [quizResponse, resultResponse] = await Promise.all([
          secureAPI.courseAPI.getQuizzesByCourse(courseId, { userId: resolvedUserId, pageSize: 300 }),
          secureAPI.courseAPI.getUserQuizResults(resolvedUserId, { courseId }),
        ]);

        if (cancelled) return;

        const quizzes = Array.isArray(quizResponse?.quizzes) ? quizResponse.quizzes : [];
        const resultRows = Array.isArray(resultResponse?.results) ? resultResponse.results : [];
        const sortedResults = [...resultRows].sort((a, b) => {
          const aTime = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
          const bTime = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
          return bTime - aTime;
        });

        const mockExamCount = quizzes.filter(
          (quiz) => String(quiz?.document_type || '').trim().toLowerCase() === 'mock_exam'
        ).length;

        const bucketCounts = quizzes.reduce((acc, quiz) => {
          const bucket = normalizeDifficultyKey(
            quiz?.difficulty_avg
            ?? quiz?.difficulty
            ?? quiz?.level_difficulty
            ?? quiz?.difficulty_level
            ?? quiz?.level
          );
          const count = Math.max(0, toNumber(quiz?.total_questions, Array.isArray(quiz?.questions) ? quiz.questions.length : 0));
          acc[bucket] += count > 0 ? count : 1;
          return acc;
        }, { easy: 0, medium: 0, hard: 0 });

        const latestResult = sortedResults[0] || null;
        const latestWrongCount = latestResult ? parseMissedQuestions(latestResult) : 0;
        const questionInsights = aggregateQuestionInsights(quizzes, sortedResults);

        const weakAttempts = questionInsights.wrongQuestions.slice(0, 3);

        setCourseInsights({
          loading: false,
          latestWrongCount,
          mockExamCount,
          bucketCounts,
          difficultyScore: questionInsights.difficultyScore,
          weakAttempts,
          wrongQuestions: questionInsights.wrongQuestions,
          weakTopics: questionInsights.weakTopics,
          recommendedPracticeSets: questionInsights.recommendedPracticeSets,
          answeredQuestionCount: questionInsights.answeredQuestionCount,
          recentResultRows: sortedResults,
        });
      } catch (_) {
        if (cancelled) return;
        setCourseInsights({
          loading: false,
          latestWrongCount: 0,
          mockExamCount: 0,
          bucketCounts: { easy: 0, medium: 0, hard: 0 },
          difficultyScore: { easy: null, medium: null, hard: null },
          weakAttempts: [],
          wrongQuestions: [],
          weakTopics: [],
          recommendedPracticeSets: [],
          answeredQuestionCount: 0,
          recentResultRows: [],
        });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedCourse, resolvedUserId]);

  const recommendedCards = useMemo(() => {
    const sets = Array.isArray(courseInsights.recommendedPracticeSets)
      ? courseInsights.recommendedPracticeSets
      : [];
    return sets.length > 0 ? sets : [];
  }, [courseInsights.recommendedPracticeSets]);
  const hasRecommendedPractice = recommendedCards.some((card) => card.count > 0);
  const recommendationSlideCount = recommendedCards.length;
  const activeRecommendationIndex = recommendationSlideCount > 0
    ? Math.max(0, Math.min(recommendationSlideIndex, recommendationSlideCount - 1))
    : 0;
  const activeRecommendationCard = recommendationSlideCount > 0
    ? recommendedCards[activeRecommendationIndex]
    : null;

  useEffect(() => {
    setRecommendationSlideIndex((prev) => {
      if (recommendationSlideCount <= 0) return 0;
      if (prev < 0) return 0;
      if (prev >= recommendationSlideCount) return recommendationSlideCount - 1;
      return prev;
    });
  }, [recommendationSlideCount]);

  const isRecommendationDataLoading = loading || (
    Boolean(selectedCourse && resolvedUserId)
    && courseInsights.loading
  );
  const requestPracticeStart = (practiceSet) => {
    if (!practiceSet || !selectedCourse) return;
    const practiceTitle = String(practiceSet?.title || 'แบบฝึก').trim() || 'แบบฝึก';
    const questionCount = getPracticeQuestionCount(practiceSet);
    setPracticeStartDialog({
      course: selectedCourse,
      practiceSet,
      title: 'ยืนยันเริ่มทำแบบฝึก',
      message: `คุณกำลังจะเริ่มทำ "${practiceTitle}" จำนวน ${questionCount} ข้อ\nต้องการดำเนินการต่อหรือไม่?`,
    });
  };
  const handleConfirmPracticeStart = () => {
    if (!practiceStartDialog?.course || !practiceStartDialog?.practiceSet) {
      setPracticeStartDialog(null);
      return;
    }
    onOpenCourseAnalysis?.(
      practiceStartDialog.course,
      { practiceSet: practiceStartDialog.practiceSet }
    );
    setPracticeStartDialog(null);
  };
  if (isRecommendationDataLoading) {
    return (
      <section
        className="ai-recommend-panel ai-recommend-loading"
        aria-label="กำลังโหลดแผนฝึกแนะนำ"
        aria-busy="true"
      >
        <header className="ai-recommend-header ai-recommend-loading-header" aria-hidden="true">
          <div className="ai-recommend-loading-copy">
            <span className="ai-recommend-skeleton line h-14 w-22" />
            <span className="ai-recommend-skeleton line h-28 w-34" />
          </div>
          <div className="ai-recommend-loading-controls">
            <span className="ai-recommend-skeleton line h-12 w-18" />
            <span className="ai-recommend-skeleton block h-42 w-260" />
            <span className="ai-recommend-skeleton chip h-42 w-190" />
          </div>
        </header>

        <div className="ai-recommend-top-grid" aria-hidden="true">
          <article className="ai-card ai-recommend-loading-card">
            <div className="ai-recommend-loading-hero">
              <span className="ai-recommend-skeleton line h-12 w-30" />
              <span className="ai-recommend-skeleton line h-30 w-58" />
              <span className="ai-recommend-skeleton line h-12 w-84" />
              <span className="ai-recommend-skeleton line h-12 w-78" />
              <span className="ai-recommend-skeleton chip h-36 w-38" />
              <div className="ai-recommend-loading-actions">
                <span className="ai-recommend-skeleton button h-40 w-34" />
                <span className="ai-recommend-skeleton button h-40 w-24" />
              </div>
              <span className="ai-recommend-skeleton block ai-recommend-hero-image-skeleton" />
            </div>
          </article>

          <article className="ai-card ai-recommend-loading-card">
            <div className="ai-recommend-loading-stack">
              <span className="ai-recommend-skeleton line h-22 w-38" />
              <span className="ai-recommend-skeleton line h-12 w-86" />
              <span className="ai-recommend-skeleton line h-12 w-68" />
              <span className="ai-recommend-skeleton line h-12 w-74" />
              <span className="ai-recommend-skeleton line h-12 w-62" />
            </div>
          </article>
        </div>

        <div className="ai-recommend-weak-grid" aria-hidden="true">
          {[
            'ai-difficulty-card',
            'ai-mistake-card',
            'ai-topic-card',
          ].map((cardClass, index) => (
            <article key={`ai-loading-weak-${index}`} className={`ai-card ai-recommend-loading-card ${cardClass}`}>
              <div className="ai-recommend-loading-stack">
                <span className="ai-recommend-skeleton line h-20 w-46" />
                <span className="ai-recommend-skeleton line h-12 w-78" />
                <span className="ai-recommend-skeleton line h-12 w-86" />
                <span className="ai-recommend-skeleton line h-12 w-70" />
              </div>
            </article>
          ))}
        </div>

      </section>
    );
  }

  if (!Array.isArray(courses) || courses.length === 0) {
    return (
      <section className="ai-recommend-panel ai-recommend-empty-state">
        <header className="my-courses-header ai-recommend-empty-header">
          <div>
            <h2>แผนฝึกแนะนำ</h2>
            <p>วิเคราะห์จุดอ่อนและแนะนำแผนฝึกจากคอร์สของคุณ</p>
          </div>
        </header>

        <div className="my-courses-empty">
          <h3>ยังไม่มีคอร์สที่ลงทะเบียน</h3>
          <p>เริ่มเลือกคอร์สเพื่อให้ระบบวิเคราะห์และแนะนำแผนฝึกให้คุณ</p>
          <button type="button" onClick={onBrowseCourses}>สำรวจคอร์สทั้งหมด</button>
        </div>
      </section>
    );
  }

  if (!selectedCourse) {
    return null;
  }

  return (
    <section className="ai-recommend-panel" aria-label="แดชบอร์ดแผนฝึกแนะนำ">
      <div className="ai-recommend-shell">
        <header className="ai-recommend-header">
          <div className="ai-recommend-title-block">
            <p className="ai-recommend-kicker">
              <Target size={16} strokeWidth={2.2} aria-hidden="true" />
              แนะนำ
            </p>
            <h2>แผนฝึกเฉพาะตัว</h2>
            <p className="ai-recommend-subtitle">วิเคราะห์จุดอ่อนส่วนตัว พร้อมแผนฝึกที่เหมาะกับคุณ</p>
          </div>
          <div className="ai-recommend-controls">
            <label className="ai-recommend-course-select">
              <span>คอร์ส</span>
              <select
                value={String(selectedCourse?.id || selectedCourse?.course_id || '')}
                onChange={(event) => onSelectedCourseIdChange?.(event.target.value)}
                aria-label="เลือกคอร์สสำหรับดูคำแนะนำ"
              >
                {courses.map((course, index) => {
                  const id = String(course?.id || course?.course_id || `course-${index + 1}`);
                  const name = String(course?.name || course?.title || `คอร์ส ${index + 1}`);
                  return (
                    <option key={`ai-course-${id}`} value={id}>{name}</option>
                  );
                })}
              </select>
            </label>
            <div className="ai-recommend-updated">
              <Clock3 size={17} strokeWidth={2.2} aria-hidden="true" />
              <span>อัปเดตล่าสุด {formatThaiDateTime(updateLabel)}</span>
            </div>
          </div>
        </header>

        {!hasAnyData ? (
          <div className="ai-recommend-empty">
            <h3>ยังไม่มีข้อมูลผลการทำแบบฝึกในคอร์สนี้</h3>
            <p>เริ่มทำบทเรียนหรือแบบทดสอบอย่างน้อย 1 ครั้ง เพื่อให้ระบบสรุปจุดที่ควรโฟกัส</p>
            <button
              type="button"
              onClick={() => onOpenCourseTab?.(selectedCourse, 'lessons')}
            >
              เริ่มฝึกในคอร์สนี้
            </button>
          </div>
        ) : (
          <>
            <div className="ai-recommend-top-grid">
            <article className="ai-card ai-hero-card">
              <div className="ai-hero-layout">
                <div className="ai-hero-copy">
                  <p className="ai-card-kicker ai-hero-kicker">
                    <Target size={15} strokeWidth={2.2} aria-hidden="true" />
                    โฟกัสหัวข้อนี้
                  </p>
                  <h3>{focusTopicLabel || (hasWrongQuestions ? 'ฝึกเพิ่มจากข้อที่พลาดล่าสุด' : 'รักษาความแม่นยำจากรอบล่าสุด')}</h3>
                  <p className="ai-hero-summary">
                    {hasWrongQuestions
                      ? `จากผลล่าสุด คุณพลาดไป ${courseInsights.latestWrongCount} ข้อ ควรทบทวนจุดที่อ่อนก่อนทำชุดถัดไป`
                      : 'ยังไม่พบข้อผิดที่สร้างชุดฝึกซ้ำได้จากข้อมูลล่าสุด ให้ทำแบบฝึกต่อเพื่อเก็บสถิติให้ละเอียดขึ้น'}
                  </p>
                  <div className="ai-hero-alert">
                    <TriangleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>{hasWrongQuestions ? `พลาดล่าสุด ${courseInsights.latestWrongCount} ข้อ` : 'ยังไม่พบข้อผิดจากข้อมูลรายข้อ'}</span>
                  </div>
                  <div className="ai-hero-actions">
                    <button
                      type="button"
                      className="ai-primary-btn"
                      onClick={() => {
                        const firstPracticeSet = recommendedCards.find((card) => card.practiceSet)?.practiceSet;
                        if (firstPracticeSet) {
                          requestPracticeStart(firstPracticeSet);
                          return;
                        }
                        onOpenCourseAnalysis?.(selectedCourse);
                      }}
                    >
                      <Play size={16} strokeWidth={2.2} aria-hidden="true" />
                      เริ่มฝึกหัวข้อนี้เลย
                    </button>
                    <button
                      type="button"
                      className="ai-ghost-btn"
                      onClick={() => onOpenCourseAnalysis?.(selectedCourse)}
                    >
                      ดูรายละเอียด
                    </button>
                  </div>
                </div>
                <div className="ai-hero-media" aria-hidden="true">
                  <img src={bannerImage} alt="" />
                </div>
              </div>
            </article>

            <article className="ai-card ai-recommend-practice-card">
              <div className="ai-recommend-practice-head">
                <div>
                  <p className="ai-card-kicker">
                    <Sparkles size={16} strokeWidth={2.2} aria-hidden="true" />
                    น้องติวขอแนะนำ
                  </p>
                  <h4>เริ่มจากชุดนี้ก่อน</h4>
                </div>
              </div>
              {hasRecommendedPractice && activeRecommendationCard ? (
                <div className="ai-recommend-practice-slider" aria-label="น้องติวขอแนะนำ">
                  <div className="ai-recommend-practice-body">
                    <div className="ai-recommend-practice-list">
                      {recommendedCards.map((card, index) => {
                        const ExerciseIcon = card.tone === 'easy'
                          ? FileText
                          : (card.tone === 'medium' ? Puzzle : Trophy);
                        const isActive = index === activeRecommendationIndex;
                        const description = getPracticeRecommendationDescription(card, courseInsights);
                        return (
                          <article
                            key={card.key}
                            className={`ai-recommend-practice-item ${card.tone}${isActive ? ' active' : ''}`}
                            aria-hidden={!isActive}
                          >
                            <div className={`ai-exercise-icon ${card.tone}`}>
                              <ExerciseIcon size={24} strokeWidth={2} aria-hidden="true" />
                            </div>
                            <div className="ai-recommend-practice-copy">
                              <h5>{card.title}</h5>
                              <p>{card.subtitle}</p>
                            </div>
                            <strong>
                              {card.count > 0 ? card.count : 'รอข้อมูลเพิ่ม'}
                              {card.count > 0 ? <small>ข้อ</small> : null}
                            </strong>
                            <div className="ai-recommend-practice-description">
                              <p>{description}</p>
                            </div>
                            <button
                              type="button"
                              className={`ai-exercise-btn ${card.tone}`}
                              disabled={!card.practiceSet}
                              onClick={() => requestPracticeStart(card.practiceSet)}
                            >
                              <Play size={14} strokeWidth={2.2} aria-hidden="true" />
                              เริ่มทำ
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                  <div className={`ai-recommend-practice-controls${recommendationSlideCount > 1 ? '' : ' single'}`}>
                    {recommendationSlideCount > 1 ? (
                      <button
                        type="button"
                        className="ai-recommend-practice-nav-btn"
                        onClick={() => {
                          setRecommendationSlideIndex((prev) => (
                            prev <= 0 ? recommendationSlideCount - 1 : prev - 1
                          ));
                        }}
                        aria-label="ดูโจทย์แนะนำก่อนหน้า"
                      >
                        <ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
                      </button>
                    ) : null}
                    <div className="ai-recommend-practice-meta">
                      <span>{activeRecommendationIndex + 1} / {recommendationSlideCount}</span>
                      <div className="ai-recommend-practice-dots" aria-hidden="true">
                        {recommendedCards.map((card, index) => (
                          <i
                            key={`recommend-dot-${card.key}`}
                            className={index === activeRecommendationIndex ? 'active' : ''}
                          />
                        ))}
                      </div>
                    </div>
                    {recommendationSlideCount > 1 ? (
                      <button
                        type="button"
                        className="ai-recommend-practice-nav-btn"
                        onClick={() => {
                          setRecommendationSlideIndex((prev) => (
                            prev >= recommendationSlideCount - 1 ? 0 : prev + 1
                          ));
                        }}
                        aria-label="ดูโจทย์แนะนำถัดไป"
                      >
                        <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="ai-recommend-practice-empty">
                  <h4>ยังไม่มีข้อผิดที่สร้างชุดฝึกซ้ำได้</h4>
                  <p>ทำแบบฝึกเพิ่มอีกครั้ง ระบบจะคัดข้อที่พลาดจริงมาเป็นชุดฝึกให้ทันที</p>
                  <button type="button" onClick={() => onOpenCourseTab?.(selectedCourse, 'lessons')}>
                    เริ่มทำแบบฝึก
                  </button>
                </div>
              )}
            </article>
          </div>

            <div className="ai-recommend-weak-grid">
            <article className="ai-card ai-difficulty-card">
              <div className="ai-block-head">
                <h4>
                  <BarChart3 size={22} strokeWidth={2} aria-hidden="true" />
                  <span>คะแนนเฉลี่ยตามความยากง่าย</span>
                </h4>
              </div>
              {hasDifficultyData ? (
                <div className="ai-difficulty-list">
                  {difficultyRows.map((row) => {
                    const score = row.score == null ? 0 : clampPercent(row.score);
                    return (
                      <div key={`difficulty-${row.key}`} className={`ai-difficulty-item ${row.key}`}>
                        <div className="ai-difficulty-label-row">
                          <span>{row.label}</span>
                          <strong>{row.score == null ? '-' : `${row.score}%`}</strong>
                        </div>
                        <div className="ai-difficulty-track" aria-hidden="true">
                          <i style={{ width: `${score}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="ai-muted">ยังไม่มีข้อมูลคะแนนตามระดับความยากง่าย</p>
              )}
            </article>

            <article className="ai-card ai-mistake-card">
              <div className="ai-block-head">
                <h4>
                  <ClipboardList size={22} strokeWidth={2} aria-hidden="true" />
                  <span>จุดที่ควรทบทวน</span>
                </h4>
                {reviewFocusPracticeSet ? (
                  <button
                    type="button"
                    className="ai-review-action-btn ai-review-action-btn-main"
                    onClick={() => requestPracticeStart(reviewFocusPracticeSet)}
                    title="กดเพื่อดูโจทย์และช้อยส์ แล้วทำทุกข้อที่แนะนำ"
                  >
                    ดูโจทย์และช้อยส์
                  </button>
                ) : null}
              </div>
              {reviewFocusRows.length > 0 ? (
                <ul className="ai-list">
                  {reviewFocusRows.map((row) => (
                    <li key={`review-focus-${row.id}`} className="ai-review-focus-item">
                      <div className="ai-list-main">
                        <span>{row.title}</span>
                        <small className="ai-review-detail">{row.detail}</small>
                        <small className="ai-review-reason">{row.reason}</small>
                      </div>
                      <strong className="ai-count-pill">{row.pill}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ai-muted">ยังไม่มีข้อมูลจุดทบทวนจากผลล่าสุด</p>
              )}
            </article>

            <article className="ai-card ai-topic-card">
              <div className="ai-block-head">
                <h4>
                  <Target size={22} strokeWidth={2} aria-hidden="true" />
                  <span>หัวข้อที่ผิดบ่อย</span>
                </h4>
              </div>
              {weakTopicChartRows.length > 0 ? (
                <div className="ai-topic-chart-wrap">
                  <div
                    className="ai-topic-pie"
                    style={{ background: weakTopicPieBackground }}
                    role="img"
                    aria-label={`กราฟวงกลมหัวข้อที่ผิดบ่อย ${weakTopicChartRows.map((row) => `${row.topic || row.name} ${row.chartPercent}%`).join(', ')}`}
                  >
                    <span>รวม</span>
                    <strong>{weakTopicTotal > 0 ? Math.round(weakTopicTotal) : '-'}</strong>
                    <small>ครั้ง</small>
                  </div>
                  <ul className="ai-topic-chart-list">
                    {weakTopicChartRows.map((row, index) => (
                      <li key={`weak-topic-${row.id}`}>
                        <i style={{ backgroundColor: row.chartColor }} aria-hidden="true" />
                        <div className="ai-list-main">
                          <span>{row.topic || row.name}</span>
                          <small>{`ผิด ${Math.max(0, toNumber(row?.wrongCount, row?.wrong_count))} ครั้ง`}</small>
                        </div>
                        <strong>{row.chartPercent}%</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="ai-muted">ยังไม่มีข้อมูลระดับหัวข้อ</p>
              )}
            </article>
            </div>

          </>
        )}
      </div>

      <ConfirmActionDialog
        open={Boolean(practiceStartDialog)}
        title={practiceStartDialog?.title || 'ยืนยันเริ่มทำแบบฝึก'}
        message={practiceStartDialog?.message || ''}
        confirmText="เริ่มทำ"
        cancelText="ยกเลิก"
        onConfirm={handleConfirmPracticeStart}
        onClose={() => setPracticeStartDialog(null)}
      />

    </section>
  );
};

export default AIRecommendationPanel;

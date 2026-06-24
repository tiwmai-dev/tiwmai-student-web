import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { secureAPI } from '../utils/api';
import { startEngagementTracker } from '../utils/engagementTracking';
import { extractQuestionContextText } from '../utils/questionContext';
import { trackEvent } from '../utils/analytics';
import MathText from './MathText';

const QuizSubmitDialog = ({ config, onConfirm, onClose }) => {
  if (!config) return null;

  return (
    <div className="quiz-dialog-overlay" onClick={onClose}>
      <div
        className="quiz-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="quiz-dialog-title">{config.title}</h3>
        <p className="quiz-dialog-message">{config.message}</p>
        <div className="quiz-dialog-actions">
          <button
            type="button"
            className="quiz-dialog-btn secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="quiz-dialog-btn primary"
            onClick={onConfirm}
            autoFocus
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

const getQuestionSharedContext = (question = {}) => extractQuestionContextText(question);

const QuizInterface = forwardRef(({ course, user, lessonId = null, onBackToCourse, initialQuiz = null, onResultStored, onQuestionChange, hideHints = false, hideDifficulty = false, onAddAiMessage }, ref) => {
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [firstAnswers, setFirstAnswers] = useState({});
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [submittedAnswers, setSubmittedAnswers] = useState({});
  const [awaitingUnderstanding, setAwaitingUnderstanding] = useState({});
  const [awaitingExplanationHelp, setAwaitingExplanationHelp] = useState({});
  const [questionConfidence, setQuestionConfidence] = useState({});
  const [firstQuestionConfidence, setFirstQuestionConfidence] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [showDetailedReview, setShowDetailedReview] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitDialogConfig, setSubmitDialogConfig] = useState(null);
  const questionStartAtRef = useRef(null);
  const questionTimesRef = useRef({});
  const autoSubmitRef = useRef(false);
  const isMockExam = lessonId == null;

  const totalTimeSeconds = Math.max(0, Math.round((Number(selectedQuiz?.timeLimit) || 0) * 60));
  const remainingSeconds = (isMockExam && totalTimeSeconds > 0)
    ? Math.max(0, totalTimeSeconds - elapsedSeconds)
    : elapsedSeconds;
  const timerDisplaySeconds = isMockExam && totalTimeSeconds > 0 ? remainingSeconds : elapsedSeconds;
  const isTimerWarning = isMockExam && totalTimeSeconds > 0 && remainingSeconds <= 60;
  const timeSpentSeconds = isMockExam && totalTimeSeconds > 0
    ? Math.min(elapsedSeconds, totalTimeSeconds)
    : elapsedSeconds;

  const normalizeQuizQuestions = (quiz) => {
    const rawQuestions = Array.isArray(quiz?.questions) ? quiz.questions : [];
    if (rawQuestions.length === 0) {
      return { ...quiz, questions: [] };
    }

    const parseQuestionOrder = (question, fallbackIndex) => {
      const candidates = [
        question?.order,
        question?.question_order,
        question?.questionNo,
        question?.question_no,
        question?.sequence,
        question?.index,
      ];
      for (const value of candidates) {
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) return n;
      }
      const idText = String(question?.id || '').trim().toLowerCase();
      const idMatch = idText.match(/^(?:q|question[-_ ]?)?(\d+)$/);
      if (idMatch) {
        const n = Number(idMatch[1]);
        if (Number.isInteger(n) && n > 0) return n;
      }
      return fallbackIndex + 1;
    };

    const withMeta = rawQuestions.map((question, index) => ({
      ...question,
      __originIndex: index,
      __order: parseQuestionOrder(question, index),
    }));

    const shouldSortByOrder = withMeta.some((item) => item.__order !== item.__originIndex + 1);
    const ordered = shouldSortByOrder
      ? [...withMeta].sort((a, b) => (a.__order - b.__order) || (a.__originIndex - b.__originIndex))
      : withMeta;

    const usedIds = new Set();
    const normalizedQuestions = ordered.map((question, index) => {
      const baseId = String(question?.id || '').trim() || `q${index + 1}`;
      let uniqueId = baseId;
      let suffix = 2;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(uniqueId);
      return {
        ...question,
        id: uniqueId,
      };
    });

    return { ...quiz, questions: normalizedQuestions };
  };

  // Timer effect (count up from 0, no time limit)
  useEffect(() => {
    let timer;
    if (quizStarted && !showResults) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [quizStarted, showResults]);

  // Track engagement minutes only while actively doing quiz/exam.
  useEffect(() => {
    if (!user || !quizStarted || showResults) return undefined;
    return startEngagementTracker({ user });
  }, [user, quizStarted, showResults]);

  const startQuiz = (quiz) => {
    const normalizedQuiz = normalizeQuizQuestions(quiz);
    trackEvent('quiz_start', {
      course_id: course?.id || course?.course_id,
      lesson_id: lessonId || undefined,
      quiz_id: normalizedQuiz?.id || normalizedQuiz?.quiz_id || normalizedQuiz?.document_id,
      quiz_type: isMockExam ? 'mock_exam' : 'lesson_quiz',
      question_count: normalizedQuiz?.questions?.length || 0,
    });
    setSelectedQuiz(normalizedQuiz);
    setCurrentQuestion(0);
    setAnswers({});
    setFirstAnswers({});
    setRevealedAnswers({});
    setSubmittedAnswers({});
    setAwaitingUnderstanding({});
    setAwaitingExplanationHelp({});
    setQuestionConfidence({});
    setFirstQuestionConfidence({});
    setShowResults(false);
    setShowDetailedReview(false);
    setQuizStarted(true);
    setElapsedSeconds(0);
    setSubmitDialogConfig(null);
    autoSubmitRef.current = false;
    questionTimesRef.current = {};
    questionStartAtRef.current = Date.now();
  };

  const commitCurrentQuestionTime = () => {
    if (!quizStarted || showResults || !selectedQuiz) return;
    const question = selectedQuiz?.questions?.[currentQuestion];
    if (!question?.id) return;
    const now = Date.now();
    const startedAt = questionStartAtRef.current || now;
    const elapsedSinceQuestionStart = Math.max(0, Math.floor((now - startedAt) / 1000));
    if (elapsedSinceQuestionStart > 0) {
      questionTimesRef.current = {
        ...questionTimesRef.current,
        [question.id]: (questionTimesRef.current[question.id] || 0) + elapsedSinceQuestionStart,
      };
    }
    questionStartAtRef.current = now;
  };

  const isCurrentQuestionNavigationLocked = () => {
    const currentQuestionId = selectedQuiz?.questions?.[currentQuestion]?.id;
    return Boolean(
      currentQuestionId
      && (
        awaitingUnderstanding[currentQuestionId]
        || awaitingExplanationHelp[currentQuestionId]
      )
    );
  };

  const goToQuestion = (targetIndex) => {
    if (isCurrentQuestionNavigationLocked()) return;

    const maxIndex = (selectedQuiz?.questions?.length || 1) - 1;
    const safeIndex = Math.max(0, Math.min(maxIndex, targetIndex));
    if (safeIndex === currentQuestion) return;
    commitCurrentQuestionTime();
    setCurrentQuestion(safeIndex);
    questionStartAtRef.current = Date.now();
  };

  // Auto-start quiz when provided via props, but only once per quiz id
  const autoStartRef = useRef({ startedForId: null });
  useEffect(() => {
    if (initialQuiz && Array.isArray(initialQuiz?.questions)) {
      const initId = initialQuiz.id || initialQuiz.quiz_id || null;
      if (!selectedQuiz && autoStartRef.current.startedForId !== initId) {
        startQuiz(initialQuiz);
        autoStartRef.current.startedForId = initId;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuiz, selectedQuiz]);

  const buildExplanationChatMessage = (question, userAnswerIndex) => {
    const options = Array.isArray(question?.options) ? question.options : [];
    const hasCorrect = typeof question?.correctAnswer === 'number'
      && question.correctAnswer >= 0
      && question.correctAnswer < options.length;
    const isCorrect = hasCorrect && userAnswerIndex === question.correctAnswer;
    const correctText = hasCorrect ? options[question.correctAnswer] : '';
    const userText = typeof userAnswerIndex === 'number'
      && userAnswerIndex >= 0
      && userAnswerIndex < options.length
      ? options[userAnswerIndex]
      : '';

    const lines = [];
    if (!hasCorrect) {
      lines.push('ℹ️ ยังไม่มีเฉลยในระบบสำหรับข้อนี้');
    } else {
      lines.push(isCorrect ? '✅ ถูกต้องค่ะ!' : '❌ ยังไม่ถูกนะคะ');
      lines.push(
        `เฉลยคือข้อ ${String.fromCharCode(65 + question.correctAnswer)}${correctText ? `: ${correctText}` : ''}`
      );
      if (!isCorrect && typeof userAnswerIndex === 'number') {
        lines.push(
          `คำตอบของคุณ: ${String.fromCharCode(65 + userAnswerIndex)}${userText ? `: ${userText}` : ''}`
        );
      }
    }
    if (question?.explanation) {
      lines.push(`💡 คำอธิบาย: ${question.explanation}`);
    }
    lines.push('เข้าใจเฉลยไหม?');
    return lines.join('\n\n');
  };

  const selectAnswer = (questionId, answerIndex) => {
    if (submittedAnswers[questionId]) return;
    if (answers[questionId] === answerIndex) return;

    setAnswers(prev => ({
      ...prev,
      [questionId]: answerIndex
    }));
  };

  const confirmAnswer = (questionId) => {
    if (submittedAnswers[questionId]) return;
    const userAnswerIndex = answers[questionId];
    if (userAnswerIndex === undefined) return;

    const q = selectedQuiz?.questions?.find((item) => item.id === questionId);
    if (!q) return;

    setFirstAnswers(prev => (
      Object.prototype.hasOwnProperty.call(prev, questionId)
        ? prev
        : { ...prev, [questionId]: userAnswerIndex }
    ));
    setSubmittedAnswers(prev => ({ ...prev, [questionId]: true }));
    setRevealedAnswers(prev => ({ ...prev, [questionId]: true }));

    if (typeof onAddAiMessage === 'function') {
      setAwaitingUnderstanding(prev => ({ ...prev, [questionId]: true }));
      onAddAiMessage({
        content: buildExplanationChatMessage(q, userAnswerIndex),
        suggestions: [
          { id: 'understood', label: 'เข้าใจแล้ว', payload: { questionId, understood: true } },
          { id: 'not_understood', label: 'ยังไม่เข้าใจ', payload: { questionId, understood: false } },
        ],
      });
      return;
    }
  };

  const nextQuestion = () => {
    if (isCurrentQuestionNavigationLocked()) return;

    if (currentQuestion < (selectedQuiz?.questions?.length || 0) - 1) {
      goToQuestion(currentQuestion + 1);
    }
  };

  const prevQuestion = () => {
    if (isCurrentQuestionNavigationLocked()) return;

    if (currentQuestion > 0) {
      goToQuestion(currentQuestion - 1);
    }
  };

  // Rich question context for chat evaluation (question + expected answer + student's selected choice)
  const getCurrentQuestionContext = () => {
    const q = selectedQuiz?.questions?.[currentQuestion];
    if (!q) return null;

    const questionText = q.question || q.text || q.prompt || q.title || '';
    const sharedContext = getQuestionSharedContext(q);
    const options = Array.isArray(q.options) ? q.options : [];
    const hasCorrectIndex = typeof q.correctAnswer === 'number'
      && q.correctAnswer >= 0
      && q.correctAnswer < options.length;
    const userAnswerIndex = typeof answers[q.id] === 'number' ? answers[q.id] : null;
    const userAnswerText = userAnswerIndex != null && userAnswerIndex >= 0 && userAnswerIndex < options.length
      ? options[userAnswerIndex]
      : null;
    const answerSubmittedForQuestion = Boolean(
      submittedAnswers[q.id]
      || (answers[q.id] !== undefined && answers[q.id] !== null)
    );
    const answerRevealedForQuestion = Boolean(revealedAnswers[q.id]);

    return {
      question_id: q.id || `q-${currentQuestion + 1}`,
      question_index: currentQuestion + 1,
      question_text: questionText,
      question_context_text: sharedContext || null,
      context: sharedContext || null,
      options,
      correct_answer_index: hasCorrectIndex ? q.correctAnswer : null,
      correct_answer_text: hasCorrectIndex ? options[q.correctAnswer] : null,
      explanation: q.explanation || null,
      user_answer_index: userAnswerIndex,
      user_answer_text: userAnswerText,
      question_confidence: questionConfidence[q.id] || null,
      is_user_answer_correct: (hasCorrectIndex && userAnswerIndex != null) ? userAnswerIndex === q.correctAnswer : null,
      answer_submitted_for_question: answerSubmittedForQuestion,
      answer_revealed_for_question: answerRevealedForQuestion,
      quiz_submitted: Boolean(showResults),
      allow_direct_answer: Boolean(showResults || answerRevealedForQuestion),
      allow_retry_after_ai_response: Boolean(
        !showResults
        && !answerRevealedForQuestion
        && awaitingExplanationHelp[q.id]
      ),
    };
  };

  // Notify parent about question context changes
  useEffect(() => {
    if (typeof onQuestionChange === 'function' && selectedQuiz && Array.isArray(selectedQuiz.questions)) {
      try {
        onQuestionChange(getCurrentQuestionContext());
      } catch (_) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuiz, currentQuestion, answers, submittedAnswers, revealedAnswers, questionConfidence, showResults]);

  const handleSubmitQuiz = async () => {
    if (autoSubmitRef.current && showResults) return;
    setSubmitDialogConfig(null);
    commitCurrentQuestionTime();
    const totalQuestions = selectedQuiz?.questions?.length || 0;
    const correctAnswers = selectedQuiz?.questions?.reduce((count, question) => {
      const scoredAnswer = Object.prototype.hasOwnProperty.call(firstAnswers, question.id)
        ? firstAnswers[question.id]
        : answers[question.id];
      return scoredAnswer === question.correctAnswer ? count + 1 : count;
    }, 0) || 0;
    
    const score = Math.round((correctAnswers / totalQuestions) * 100);
    
    // Update quiz as completed with score
    setSelectedQuiz(prev => ({
      ...prev,
      completed: true,
      score: score
    }));
    
    setShowResults(true);
    setQuizStarted(false);

    // Persist result history (best-effort)
    try {
      const userId = user?.user_id || user?.id || user?.studentId || user?.username || 'student_demo';
      const orderedAnswers = (selectedQuiz?.questions || []).map(q => (
        Object.prototype.hasOwnProperty.call(firstAnswers, q.id)
          ? firstAnswers[q.id]
          : answers[q.id]
      ));
      const timeSpent = timeSpentSeconds;
      const quizId = selectedQuiz?.id || selectedQuiz?.quiz_id || selectedQuiz?.document_id;
      const perQuestionTimeMap = (selectedQuiz?.questions || []).reduce((acc, q) => {
        acc[q.id] = Math.max(0, Number(questionTimesRef.current[q.id] || 0));
        return acc;
      }, {});
      const confidenceByQuestion = (selectedQuiz?.questions || []).reduce((acc, q) => {
        acc[q.id] = firstQuestionConfidence[q.id] || questionConfidence[q.id] || null;
        return acc;
      }, {});
      const resp = await secureAPI.courseAPI.submitQuizAnswers(userId, quizId, {
        answers: orderedAnswers,
        time_spent_seconds: Math.max(0, timeSpent),
        per_question_time_seconds: perQuestionTimeMap,
        confidence_by_question: confidenceByQuestion,
        total_questions: totalQuestions,
        correct_count: correctAnswers,
        score,
        course_id: course?.id || course?.course_id || undefined,
        lesson_id: lessonId || undefined,
      });
      trackEvent('quiz_submit', {
        course_id: course?.id || course?.course_id,
        lesson_id: lessonId || undefined,
        quiz_id: quizId,
        quiz_type: isMockExam ? 'mock_exam' : 'lesson_quiz',
        score_percent: score,
        question_count: totalQuestions,
        correct_count: correctAnswers,
        duration_seconds: Math.max(0, timeSpent),
      });
      if (onResultStored) {
        try { onResultStored(quizId, resp); } catch (_) {}
      }
    } catch (e) {
      // Non-blocking: log only
      console.warn('Failed to store quiz result history', e);
    }
  };

  const resetQuiz = () => {
    setSelectedQuiz(null);
    setCurrentQuestion(0);
    setAnswers({});
    setFirstAnswers({});
    setRevealedAnswers({});
    setSubmittedAnswers({});
    setAwaitingUnderstanding({});
    setAwaitingExplanationHelp({});
    setQuestionConfidence({});
    setFirstQuestionConfidence({});
    setShowResults(false);
    setShowDetailedReview(false);
    setQuizStarted(false);
    setElapsedSeconds(0);
    setSubmitDialogConfig(null);
    autoSubmitRef.current = false;
    questionTimesRef.current = {};
    questionStartAtRef.current = null;
  };

  useEffect(() => {
    if (!isMockExam || totalTimeSeconds <= 0) return undefined;
    if (!quizStarted || showResults) return undefined;
    if (elapsedSeconds < totalTimeSeconds) return undefined;
    if (autoSubmitRef.current) return undefined;
    autoSubmitRef.current = true;
    handleSubmitQuiz();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds, totalTimeSeconds, isMockExam, quizStarted, showResults]);

  useEffect(() => {
    if (!submitDialogConfig) return undefined;
    const handleDialogEscape = (event) => {
      if (event.key === 'Escape') {
        setSubmitDialogConfig(null);
      }
    };
    document.addEventListener('keydown', handleDialogEscape);
    return () => document.removeEventListener('keydown', handleDialogEscape);
  }, [submitDialogConfig]);

  const requestSubmitQuiz = () => {
    const totalQuestions = selectedQuiz?.questions?.length || 0;
    const answeredCount = Object.keys(answers).length;
    const unansweredCount = Math.max(0, totalQuestions - answeredCount);
    const confirmText = unansweredCount > 0
      ? `คุณตอบแล้ว ${answeredCount}/${totalQuestions} ข้อ\nยังเหลือ ${unansweredCount} ข้อที่ยังไม่ตอบ\n\nยืนยันส่งคำตอบทั้งหมดตอนนี้ใช่ไหม?`
      : 'ยืนยันส่งคำตอบทั้งหมดตอนนี้ใช่ไหม?';
    setSubmitDialogConfig({
      title: 'ยืนยันการส่งคำตอบ',
      message: confirmText,
    });
  };

  const handleUnderstandingResponse = ({ questionId, understood }) => {
    if (!selectedQuiz || !questionId) return;
    if (!awaitingUnderstanding[questionId]) return;

    setAwaitingUnderstanding(prev => ({ ...prev, [questionId]: false }));
    setQuestionConfidence(prev => ({
      ...prev,
      [questionId]: understood ? 'understood' : 'needs_help',
    }));
    setFirstQuestionConfidence(prev => (
      Object.prototype.hasOwnProperty.call(prev, questionId)
        ? prev
        : {
            ...prev,
            [questionId]: understood ? 'understood' : 'needs_help',
          }
    ));

    if (understood) {
      if (typeof onAddAiMessage === 'function') {
        const q = selectedQuiz?.questions?.find((item) => item.id === questionId);
        const userAnswerIndex = answers[questionId];
        const hasCorrect = typeof q?.correctAnswer === 'number';
        const isCorrect = hasCorrect && userAnswerIndex === q.correctAnswer;
        onAddAiMessage({
          content: isCorrect
            ? 'เก่งมากค่ะ! เข้าใจแล้วดีใจด้วย 🎉 พร้อมไปข้อถัดไปได้เลย'
            : 'ดีมากค่ะที่เข้าใจเฉลยแล้ว 💪 ไปต่อข้อถัดไปได้เลยนะ',
        });
      }
      return;
    }

    setAwaitingExplanationHelp(prev => ({ ...prev, [questionId]: true }));
    if (typeof onAddAiMessage === 'function') {
      onAddAiMessage({
        content: 'ไม่เป็นไรค่ะ ไม่เข้าใจตรงไหนบ้าง? พิมพ์บอกได้เลย เดี๋ยวช่วยอธิบายเพิ่มให้',
      });
    }
  };

  const handleAiResponseReceived = ({ questionId, hideUserBubble }) => {
    if (hideUserBubble) return;

    const fallbackQuestionId = selectedQuiz?.questions?.[currentQuestion]?.id;
    const targetQuestionId = questionId || fallbackQuestionId;
    if (!targetQuestionId || !awaitingExplanationHelp[targetQuestionId]) return;

    setAwaitingExplanationHelp(prev => ({ ...prev, [targetQuestionId]: false }));
  };

  useImperativeHandle(ref, () => ({
    handleUnderstandingResponse,
    handleAiResponseReceived
  }));

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const parsePartNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    const text = String(value || '').trim();
    if (!text) return null;
    const direct = text.match(/^\d+$/);
    if (direct) return Number.parseInt(direct[0], 10);
    const pattern = text.match(/(?:part|section|ตอนที่|ส่วนที่|ชุดที่)\s*(\d+)/i);
    if (pattern) return Number.parseInt(pattern[1], 10);
    return null;
  };

  const normalizePartLabel = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const resolveQuestionPartMeta = (question, index) => {
    const partNumber = parsePartNumber(
      question?.part
      ?? question?.part_no
      ?? question?.part_number
      ?? question?.section_no
      ?? question?.section_number
      ?? question?.group_no
      ?? question?.group_number
    );

    const explicitLabel = normalizePartLabel(
      question?.part_title
      || question?.part_name
      || question?.part_label
      || question?.section_title
      || question?.sectionTitle
      || question?.section_label
      || question?.section
      || question?.group_label
      || question?.group_name
    );

    const contextText = normalizePartLabel(
      question?.context
      || question?.question_context
      || question?.questionContext
      || question?.shared_context
      || ''
    );
    const firstContextLine = contextText
      ? contextText.split('\n').map((line) => normalizePartLabel(line)).find(Boolean) || ''
      : '';
    const contextPartNumber = parsePartNumber(firstContextLine);
    const topicTag = normalizePartLabel(
      question?.topic_tag || question?.topicTag || question?.topic || ''
    );

    const resolvedPartNumber = partNumber ?? contextPartNumber;
    let label = explicitLabel;
    let bucketType = 'custom';

    if (!label && resolvedPartNumber != null) {
      label = `Part ${resolvedPartNumber}`;
      bucketType = 'part-number';
    } else if (!label && topicTag) {
      label = topicTag;
      bucketType = 'topic-tag';
    } else if (!label) {
      label = 'Part 1';
      bucketType = 'fallback';
    }

    const normalizedLabelKey = label.toLowerCase().replace(/\s+/g, ' ').trim();
    const key = resolvedPartNumber != null
      ? `part:${resolvedPartNumber}:${normalizedLabelKey}`
      : `label:${normalizedLabelKey}`;

    return {
      key,
      label,
      order: resolvedPartNumber != null ? resolvedPartNumber : Number.POSITIVE_INFINITY,
      firstIndex: index,
      bucketType,
    };
  };

  const getDifficultyMeta = (difficultyValue) => {
    const normalized = typeof difficultyValue === 'string'
      ? difficultyValue.toLowerCase().trim()
      : difficultyValue;
    const numeric = Number(normalized);

    if (normalized === 'easy' || numeric === 1 || numeric === 2) {
      return { label: 'ง่าย', className: 'question-difficulty-easy' };
    }
    if (normalized === 'hard' || numeric >= 4) {
      return { label: 'ยาก', className: 'question-difficulty-hard' };
    }
    if (normalized === 'medium' || numeric === 3) {
      return { label: 'ปานกลาง', className: 'question-difficulty-medium' };
    }

    return null;
  };

  if (!selectedQuiz) {
    return (
      <div className="quiz-interface">
        <div className="quiz-header">
          <h3>📝 แบบทดสอบ</h3>
          <p>เลือกแบบทดสอบที่คุณต้องการทำ</p>
        </div>

        <div className="quiz-list">
          {course?.quizzes?.length > 0 ? course.quizzes.map((quiz) => (
            <div key={quiz.id} className="quiz-card">
              <div className="quiz-card-header">
                <h4>{quiz.title}</h4>
                {quiz.completed && (
                  <div className="quiz-score">
                    คะแนน: {quiz.score}%
                  </div>
                )}
              </div>
              
              <p className="quiz-description">{quiz.description}</p>
              
              <div className="quiz-stats">
                <div className="stat-item">
                  <span className="stat-icon">❓</span>
                  <span>{quiz.totalQuestions} คำถาม</span>
                </div>
                <div className="stat-item">
                  <span className="stat-icon">⏰</span>
                  <span>ไม่จำกัดเวลา</span>
                </div>
                <div className="stat-item">
                  <span className="stat-icon">📊</span>
                  <span>{quiz.completed ? 'เสร็จสิ้น' : 'ยังไม่ทำ'}</span>
                </div>
              </div>

              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startQuiz(quiz);
                }}
                className={`quiz-start-button ${quiz.completed ? 'completed' : ''}`}
                type="button"
              >
                {quiz.completed ? '🔄 ทำใหม่' : '▶️ เริ่มทำ'}
              </button>
            </div>
          )) : (
            <div className="no-quizzes">
              <p>ยังไม่มีแบบทดสอบในคอร์สนี้</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showResults) {
    const totalQuestions = selectedQuiz?.questions?.length || 0;
    const correctAnswers = selectedQuiz?.questions?.reduce((count, question) => {
      const scoredAnswer = Object.prototype.hasOwnProperty.call(firstAnswers, question.id)
        ? firstAnswers[question.id]
        : answers[question.id];
      return scoredAnswer === question.correctAnswer ? count + 1 : count;
    }, 0) || 0;
    const scorePercent = Number(selectedQuiz?.score || 0);
    const ringRadius = 60;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringOffset = ringCircumference - ((Math.max(0, Math.min(100, scorePercent)) / 100) * ringCircumference);
    const quizId = selectedQuiz?.id || selectedQuiz?.quiz_id || selectedQuiz?.document_id;
    const courseId = course?.id || course?.course_id || course?.courseId;
    const historyHref = courseId && lessonId && quizId
      ? `/course/${courseId}/lesson/${lessonId}/quiz/${quizId}/history`
      : null;
    const canToggleDetailedReview = Array.isArray(selectedQuiz?.questions) && selectedQuiz.questions.length > 0;
    const partScoreRows = (() => {
      if (!isMockExam || !Array.isArray(selectedQuiz?.questions) || selectedQuiz.questions.length === 0) {
        return [];
      }
      const partMap = new Map();
      selectedQuiz.questions.forEach((question, questionIndex) => {
        const meta = resolveQuestionPartMeta(question, questionIndex);
        const options = Array.isArray(question?.options) ? question.options : [];
        const userAnswerIndex = Object.prototype.hasOwnProperty.call(firstAnswers, question.id)
          ? firstAnswers[question.id]
          : answers[question.id];
        const hasUserAnswer = Number.isInteger(userAnswerIndex)
          && userAnswerIndex >= 0
          && userAnswerIndex < options.length;
        const hasCorrectAnswer = Number.isInteger(question?.correctAnswer)
          && question.correctAnswer >= 0
          && question.correctAnswer < options.length;
        const isCorrect = hasUserAnswer && hasCorrectAnswer && userAnswerIndex === question.correctAnswer;
        const current = partMap.get(meta.key) || {
          key: meta.key,
          label: meta.label,
          order: meta.order,
          firstIndex: meta.firstIndex,
          bucketType: meta.bucketType,
          total: 0,
          answered: 0,
          correct: 0,
        };
        current.total += 1;
        if (hasUserAnswer) current.answered += 1;
        if (isCorrect) current.correct += 1;
        if (questionIndex < current.firstIndex) current.firstIndex = questionIndex;
        if (meta.order < current.order) current.order = meta.order;
        partMap.set(meta.key, current);
      });
      return Array.from(partMap.values())
        .map((part) => ({
          ...part,
          scorePercent: part.total > 0 ? Math.round((part.correct / part.total) * 100) : 0,
          unanswered: Math.max(0, part.total - part.answered),
        }))
        .sort((left, right) => {
          if (left.order !== right.order) return left.order - right.order;
          return left.firstIndex - right.firstIndex;
        });
    })();
    
    return (
      <div className="quiz-interface">
        <div className="quiz-results">
          <div className="results-header">
            <h3>📊 ผลการทำแบบทดสอบ</h3>
            <h4>{selectedQuiz.title}</h4>
          </div>

          <div className="score-display">
            <div className="score-ring-card" aria-label={`คะแนน ${scorePercent} เปอร์เซ็นต์`}>
              <svg className="score-ring" viewBox="0 0 160 160" role="img" aria-hidden="true">
                <circle className="score-ring-track" cx="80" cy="80" r={ringRadius} />
                <circle
                  className="score-ring-progress"
                  cx="80"
                  cy="80"
                  r={ringRadius}
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <div className="score-ring-center">
                <span className="score-percentage">{scorePercent}%</span>
                <small>คะแนนรวม</small>
              </div>
            </div>
            <div className="score-details">
              <div className="score-detail-card">
                <span>ตอบถูก</span>
                <strong>{correctAnswers}/{totalQuestions} ข้อ</strong>
              </div>
              <div className="score-detail-card">
                <span>เวลาที่ใช้</span>
                <strong>{formatTime(timeSpentSeconds)}</strong>
              </div>
              {isMockExam && totalTimeSeconds > 0 && (
                <div className="score-detail-card">
                  <span>เวลาที่เหลือ</span>
                  <strong>{formatTime(Math.max(0, totalTimeSeconds - timeSpentSeconds))}</strong>
                </div>
              )}
            </div>
          </div>

          {isMockExam && partScoreRows.length > 0 && (
            <section className="score-part-breakdown" aria-label="คะแนนรายพาร์ต">
              <div className="score-part-breakdown-header">
                <h4>🧩 คะแนนแยกแต่ละ Part</h4>
                <span>{partScoreRows.length} พาร์ต</span>
              </div>
              <div className="score-part-grid">
                {partScoreRows.map((part, idx) => (
                  <article key={part.key} className="score-part-card">
                    <div className="score-part-card-header">
                      <strong className="score-part-label">
                        {part.bucketType === 'topic-tag' ? `หัวข้อ: ${part.label}` : part.label}
                      </strong>
                      <span className="score-part-percent">{part.scorePercent}%</span>
                    </div>
                    <p className="score-part-meta">
                      {part.correct}/{part.total} ข้อถูก
                      {part.unanswered > 0 ? ` • ยังไม่ตอบ ${part.unanswered} ข้อ` : ''}
                    </p>
                    <div className="score-part-track" aria-hidden="true">
                      <span style={{ width: `${part.scorePercent}%` }} />
                    </div>
                    <small className="score-part-index">Part {idx + 1}</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="answer-review">
            <h4>✅ เฉลยแบบทีละข้อ</h4>
            <p>{hideHints ? 'เฉลยและคำอธิบายแสดงในแชทน้องติวหลังกดยืนยันคำตอบ' : 'ระบบแสดงเฉลยหลังกดยืนยันคำตอบในแต่ละข้อ'}</p>
          </div>

          <div className="results-actions">
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onBackToCourse) {
                  onBackToCourse();
                } else {
                  resetQuiz();
                }
              }} 
              className="back-button"
              type="button"
            >
              {onBackToCourse ? '← กลับไปยังคอร์ส' : '← กลับไปเลือกแบบทดสอบ'}
            </button>
            {canToggleDetailedReview && (
              <button
                onClick={() => setShowDetailedReview((prev) => !prev)}
                className="history-button"
                type="button"
              >
                {showDetailedReview ? '🙈 ซ่อนข้อที่ถูก/ผิด' : '✅ ดูข้อที่ถูก/ผิด'}
              </button>
            )}
            {historyHref && (
              <button
                onClick={() => {
                  window.location.href = historyHref;
                }}
                className="history-button"
                type="button"
              >
                📜 ดูประวัติการทำ
              </button>
            )}
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startQuiz(selectedQuiz);
              }} 
              className="retry-button"
              type="button"
            >
              🔄 ทำใหม่
            </button>
          </div>

          {showDetailedReview && (
            <div className="results-question-review-list">
              {selectedQuiz.questions.map((question, index) => {
                const options = Array.isArray(question?.options) ? question.options : [];
                const userAnswerIndex = Object.prototype.hasOwnProperty.call(firstAnswers, question.id)
                  ? firstAnswers[question.id]
                  : answers[question.id];
                const hasCorrectAnswer = Number.isInteger(question?.correctAnswer)
                  && question.correctAnswer >= 0
                  && question.correctAnswer < options.length;
                const hasUserAnswer = Number.isInteger(userAnswerIndex)
                  && userAnswerIndex >= 0
                  && userAnswerIndex < options.length;
                const isQuestionCorrect = hasCorrectAnswer && hasUserAnswer && userAnswerIndex === question.correctAnswer;
                const statusText = hasCorrectAnswer
                  ? (isQuestionCorrect ? '✅ ถูกต้อง' : '❌ ไม่ถูกต้อง')
                  : 'ℹ️ ยังไม่มีเฉลย';
                const userAnswerText = hasUserAnswer ? options[userAnswerIndex] : null;
                const correctAnswerText = hasCorrectAnswer ? options[question.correctAnswer] : null;

                return (
                  <article key={question.id || `question-${index}`} className="question-result">
                    <div className="question-header">
                      <span className={`question-status ${hasCorrectAnswer ? (isQuestionCorrect ? 'correct' : 'incorrect') : 'neutral'}`}>
                        {statusText}
                      </span>
                      <span className="question-number">ข้อที่ {index + 1}</span>
                    </div>
                    <p className="question-text">
                      <MathText text={question.question || ''} inline />
                    </p>

                    {(question.image_url || question.imageUrl) ? (
                      <div className="question-figure-preview inline">
                        <img
                          src={question.image_url || question.imageUrl}
                          alt={`รูปประกอบคำถามที่ ${index + 1}`}
                          className="question-figure-image"
                        />
                      </div>
                    ) : null}

                    <div className="options-review">
                      {options.map((option, optionIndex) => {
                        const isSelected = hasUserAnswer && optionIndex === userAnswerIndex;
                        const isCorrectOption = hasCorrectAnswer && optionIndex === question.correctAnswer;
                        return (
                          <div
                            key={`${question.id || index}-option-${optionIndex}`}
                            className={`option-review${isCorrectOption ? ' correct-answer' : ''}${isSelected ? ' user-answer' : ''}`}
                          >
                            <span className="option-label">{String.fromCharCode(65 + optionIndex)}.</span>
                            <MathText text={option} inline />
                            {isSelected && isCorrectOption && <span className="correct-mark">✓</span>}
                            {isSelected && !isCorrectOption && <span className="wrong-mark">✗</span>}
                            {!isSelected && isCorrectOption && <span className="correct-mark">✓</span>}
                          </div>
                        );
                      })}
                    </div>

                    <div className="answer-review-meta">
                      <p>
                        คำตอบที่ใช้คิดคะแนน:{' '}
                        <strong>
                          {hasUserAnswer
                            ? `${String.fromCharCode(65 + userAnswerIndex)}${userAnswerText ? `: ${userAnswerText}` : ''}`
                            : 'ไม่ได้เลือกคำตอบ'}
                        </strong>
                      </p>
                      <p>
                        เฉลย:{' '}
                        <strong>
                          {hasCorrectAnswer
                            ? `${String.fromCharCode(65 + question.correctAnswer)}${correctAnswerText ? `: ${correctAnswerText}` : ''}`
                            : 'ยังไม่กำหนดเฉลย'}
                        </strong>
                      </p>
                    </div>

                    {question.explanation ? (
                      <div className="explanation">
                        <strong>💡 คำอธิบาย</strong>
                        <MathText text={question.explanation} />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const question = selectedQuiz?.questions?.[currentQuestion];
  const isSplitMode = typeof onAddAiMessage === 'function';
  const progress = selectedQuiz?.questions?.length ? ((currentQuestion + 1) / selectedQuiz.questions.length) * 100 : 0;
  const isRevealed = question ? !!revealedAnswers[question.id] : false;
  const userAnswer = question ? answers[question.id] : undefined;
  const correctIndex = question ? question.correctAnswer : undefined;
  const hasCorrect = question && typeof correctIndex === 'number'
    && correctIndex >= 0
    && correctIndex < (question.options?.length || 0);
  const isCorrect = question ? (hasCorrect && userAnswer === question.correctAnswer) : false;
  const correctText = hasCorrect ? question.options?.[correctIndex] : '';
  const userText = question && typeof userAnswer === 'number' ? question.options?.[userAnswer] : '';
  const difficultyMeta = getDifficultyMeta(question?.difficulty);
  const isNavigationLocked = Boolean(
    question?.id
    && (
      awaitingUnderstanding[question.id]
      || awaitingExplanationHelp[question.id]
    )
  );
  const isAnswerConfirmed = Boolean(question?.id && submittedAnswers[question.id]);
  if (!question) {
    return (
      <div className="quiz-interface">
        <div className="quiz-error">
          <p>ไม่พบคำถามในแบบทดสอบนี้</p>
          <button onClick={resetQuiz} className="back-button">
            ← กลับไปเลือกแบบทดสอบ
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="quiz-interface">
      <div className="quiz-progress">
        {onBackToCourse && (
          <div className="quiz-top-actions">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBackToCourse();
              }}
              className="back-to-course-button"
              type="button"
            >
              ← กลับไปยังคอร์ส
            </button>
          </div>
        )}
        <div className="quiz-info">
          <div className="quiz-title-row">
            <div className="quiz-title-copy">
              <h3>{selectedQuiz.title}</h3>
              <div className="quiz-meta">
                <span>ข้อ {currentQuestion + 1} / {selectedQuiz?.questions?.length || 0}</span>
                <span className={`timer ${isTimerWarning ? 'warning' : ''}`}>
                  ⏱️ {formatTime(timerDisplaySeconds)}
                </span>
              </div>
            </div>
            <div className="quiz-top-side">
              <button
                onClick={requestSubmitQuiz}
                className="submit-nav-button top-card"
                type="button"
              >
                ส่งคำตอบ
              </button>
            </div>
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{width: `${progress}%`}}></div>
        </div>
      </div>

      <div className="question-container">
      <div className="question-header">
        <div className="question-meta-badges">
          <span className="question-number">คำถามที่ {currentQuestion + 1}</span>
          {!hideDifficulty && difficultyMeta && (
            <span className={`question-difficulty ${difficultyMeta.className}`}>
              ระดับ: {difficultyMeta.label}
            </span>
          )}
        </div>
      </div>

      <h4 className="question-text"><MathText text={question.question} inline /></h4>

      {(question.image_url || question.imageUrl) ? (
        <div className="question-figure-preview inline">
          <img
            src={question.image_url || question.imageUrl}
            alt={`รูปประกอบคำถามที่ ${currentQuestion + 1}`}
            className="question-figure-image"
          />
        </div>
      ) : null}

        <div className="options-container">
          {question?.options?.map((option, index) => (
            <button
              key={index}
              onClick={() => selectAnswer(question.id, index)}
              disabled={isAnswerConfirmed}
              className={`option-button ${
                answers[question.id] === index ? 'selected' : ''
              } ${
                isRevealed && hasCorrect && index === question.correctAnswer ? 'correct' : ''
              } ${
                isRevealed && hasCorrect && answers[question.id] === index && index !== question.correctAnswer ? 'incorrect' : ''
              }`}
            >
              <span className="option-label">
                {String.fromCharCode(65 + index)}.
              </span>
              <span className="option-text"><MathText text={option} inline /></span>
              {answers[question.id] === index && (
                <span className="selected-mark">
                  {isRevealed && hasCorrect && index !== question.correctAnswer ? '✗' : '✓'}
                </span>
              )}
            </button>
          ))}
        </div>

        {!isAnswerConfirmed ? (
          <div className="question-submit-row">
            <button
              type="button"
              className="submit-answer-button"
              disabled={answers[question.id] === undefined}
              onClick={() => confirmAnswer(question.id)}
            >
              ยืนยันคำตอบ
            </button>
          </div>
        ) : null}

        {isSplitMode && (awaitingUnderstanding[question.id] || awaitingExplanationHelp[question.id]) && (
          <div className="answer-actions">
            {awaitingUnderstanding[question.id] && (
              <span className="answer-status">เลือกว่าเข้าใจเฉลยหรือไม่ในแชทด้านขวา</span>
            )}
            {awaitingExplanationHelp[question.id] && (
              <span className="answer-status warning">พิมพ์ในแชทว่าไม่เข้าใจตรงไหน</span>
            )}
          </div>
        )}

        {isRevealed && !isSplitMode && (
          <div className={`answer-feedback ${isCorrect ? 'correct' : 'incorrect'}`}>
            <div className="answer-feedback-title">
              {!hasCorrect ? 'ℹ️ ยังไม่มีเฉลย' : (isCorrect ? '✅ ถูกต้อง' : '❌ ไม่ถูกต้อง')}
            </div>
            <div className="answer-feedback-detail">
              {hasCorrect
                ? `เฉลยคือข้อ ${String.fromCharCode(65 + question.correctAnswer)}${correctText ? `: ${correctText}` : ''}`
                : 'เฉลยยังไม่ถูกกำหนดในระบบ'}
            </div>
            {hasCorrect && typeof userAnswer === 'number' && userAnswer !== question.correctAnswer && (
              <div className="answer-feedback-user">
                คำตอบของคุณ: {String.fromCharCode(65 + userAnswer)}
                {userText ? `: ${userText}` : ''}
              </div>
            )}
            {question.explanation && (
              <div className="answer-explanation">
                <strong>💡 คำอธิบาย:</strong>
                <MathText text={question.explanation} />
              </div>
            )}
          </div>
        )}

      </div>

      <div className="quiz-navigation">
        <div className={`nav-buttons ${isSplitMode ? 'split-mode' : ''}`}>
          <div className="nav-buttons-main">
            <button
              onClick={prevQuestion}
              disabled={currentQuestion === 0 || isNavigationLocked}
              className="nav-button prev"
            >
              ก่อนหน้า
            </button>

            <div className={`question-indicators-shell ${isSplitMode ? 'centered' : ''}`}>
              <div className="question-indicators question-indicators-inline">
                {selectedQuiz?.questions?.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToQuestion(index)}
                    className={`indicator ${
                      index === currentQuestion ? 'current' : ''
                    } ${
                      answers[selectedQuiz?.questions?.[index]?.id] !== undefined ? 'answered' : ''
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="nav-buttons-right">
              {currentQuestion < (selectedQuiz?.questions?.length || 0) - 1 ? (
                <button
                  onClick={nextQuestion}
                  className="nav-button next"
                  disabled={isNavigationLocked}
                >
                  ถัดไป
                </button>
              ) : (
                <button className="nav-button next" disabled>
                  ข้อสุดท้าย
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      <QuizSubmitDialog
        config={submitDialogConfig}
        onConfirm={handleSubmitQuiz}
        onClose={() => setSubmitDialogConfig(null)}
      />
      
    </div>
  );
});

export default QuizInterface;

import React, { useEffect, useMemo, useState } from 'react';
import { readDailyEngagementMinutes } from '../utils/engagementTracking';

const DEFAULT_TARGET_SCORE = 75;
const TARGET_SCORE_STORAGE_KEY = 'student_course_target_score_v1';
const SCORE_CHART_WIDTH = 560;
const SCORE_CHART_HEIGHT = 300;
const SCORE_CHART_PADDING = { top: 20, right: 20, bottom: 56, left: 54 };
const SCORE_CHART_POINT_INSET = 16;
const SCORE_CHART_TICK_LABEL_GAP = 7;
const TIME_CHART_WIDTH = 560;
const TIME_CHART_HEIGHT = 300;
const TIME_CHART_PADDING = { top: 20, right: 20, bottom: 56, left: 54 };
const TIME_TICK_CANDIDATES = [5, 10, 15, 20, 30, 45, 60, 90, 120];

const toNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));
const clampTargetScore = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TARGET_SCORE;
  return Math.max(1, Math.min(100, Math.round(parsed)));
};

const getTargetScoreStorageKey = (user, courseId) => {
  const userId = String(user?.user_id || user?.id || user?.studentId || user?.username || 'anonymous').trim();
  const normalizedCourseId = String(courseId || 'all').trim();
  return `${TARGET_SCORE_STORAGE_KEY}:${userId || 'anonymous'}:${normalizedCourseId || 'all'}`;
};

const toSubjectLabel = (course) => {
  const raw = course?.subject || course?.category || course?.subject_name || course?.group || 'วิชาพื้นฐาน';
  const text = String(raw || '').trim();
  if (!text) return 'วิชาพื้นฐาน';
  if (text.toLowerCase() === 'general') return 'วิชาพื้นฐาน';
  return text;
};

const getCourseName = (course) => {
  const raw = course?.name || course?.title || course?.course_name || course?.courseTitle || '';
  return String(raw || '').trim() || 'คอร์สไม่มีชื่อ';
};

const parseLessonOrder = (lesson, fallbackIndex = 0) => {
  const explicitOrder = Number(lesson?.order ?? lesson?.lessonOrder ?? lesson?.lesson_order);
  if (Number.isFinite(explicitOrder) && explicitOrder > 0) return explicitOrder;

  const name = String(lesson?.name || lesson?.title || '').trim();
  const match = name.match(/(\d+)/);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallbackIndex + 1;
};

const truncateLabel = (value, max = 14) => {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const toShortDateLabel = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

const getAttemptDateValue = (row) => (
  row?.attemptedAt
  || row?.completedAt
  || row?.submittedAt
  || row?.submitted_at
  || row?.updatedAt
  || row?.updated_at
  || row?.createdAt
  || row?.created_at
  || row?.date
);

const getAttemptTimestamp = (row) => {
  const explicitTimestamp = toNumber(
    row?.attemptedAtMs,
    row?.completedAtMs,
    row?.submittedAtMs,
    row?.createdAtMs,
    row?.timestamp
  );
  if (explicitTimestamp > 0) return explicitTimestamp;

  const dateValue = getAttemptDateValue(row);
  const parsed = dateValue ? new Date(dateValue).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const ensureUniquePointLabels = (points = [], max = 12) => {
  const seen = new Map();
  return points.map((point, index) => {
    const base = String(point?.label || '').trim() || `ครั้งที่ ${index + 1}`;
    const nextCount = (seen.get(base) || 0) + 1;
    seen.set(base, nextCount);
    const label = nextCount > 1 ? `${base} (${nextCount})` : base;
    return {
      ...point,
      label: truncateLabel(label, max),
    };
  });
};

const normalizeLessonRows = (courseRow) => {
  if (!courseRow || !Array.isArray(courseRow.lessonRows)) return [];
  return courseRow.lessonRows
    .map((lesson, index) => {
      const lessonScore = Number.isFinite(lesson?.scoreSplit?.lesson)
        ? clampPercent(lesson.scoreSplit.lesson)
        : null;
      const mockExamScore = Number.isFinite(lesson?.scoreSplit?.mockExam)
        ? clampPercent(lesson.scoreSplit.mockExam)
        : null;
      const blendedScore = Number.isFinite(lessonScore) && Number.isFinite(mockExamScore)
        ? Math.round((lessonScore + mockExamScore) / 2)
        : (Number.isFinite(lessonScore) ? lessonScore : mockExamScore);
      return {
        id: lesson?.id || `${courseRow.id}-lesson-${index + 1}`,
        name: String(lesson?.name || '').trim() || `บทเรียน ${index + 1}`,
        order: parseLessonOrder(lesson, index),
        lessonScore,
        mockExamScore,
        score: Number.isFinite(blendedScore) ? clampPercent(blendedScore) : null,
        minutes: Math.max(0, Math.round(toNumber(lesson?.minutes))),
      };
    })
    .sort((a, b) => {
      const orderDiff = a.order - b.order;
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name, 'th');
    });
};

const buildScoreTrend = (courseRows = [], selectedCourseRow = null) => {
  const attemptPointsRaw = (Array.isArray(selectedCourseRow?.attemptRows) ? selectedCourseRow.attemptRows : [])
    .filter((row) => Number.isFinite(row?.score))
    .map((row, index) => ({
      ...row,
      sortTimestamp: getAttemptTimestamp(row),
      sortSequence: toNumber(row?.attemptIndex, row?.sequence, index + 1),
    }))
    .sort((a, b) => {
      if (a.sortTimestamp > 0 && b.sortTimestamp > 0) return a.sortTimestamp - b.sortTimestamp;
      if (a.sortTimestamp > 0) return -1;
      if (b.sortTimestamp > 0) return 1;
      return a.sortSequence - b.sortSequence;
    })
    .slice(-7)
    .map((row, index) => ({
      id: row?.id || `attempt-${index + 1}`,
      label: toShortDateLabel(getAttemptDateValue(row)) || row?.label || `ครั้งที่ ${row?.attemptIndex || index + 1}`,
      value: clampPercent(row?.score),
    }));
  const attemptPoints = ensureUniquePointLabels(attemptPointsRaw, 12);

  if (attemptPoints.length > 0) {
    return {
      mode: 'attempt',
      points: attemptPoints,
    };
  }

  const lessonPoints = normalizeLessonRows(selectedCourseRow)
    .filter((row) => Number.isFinite(row.score))
    .slice(-7)
    .map((row) => ({
      id: row.id,
      label: truncateLabel(row.name, 12),
      value: row.score,
    }));

  if (lessonPoints.length > 0) {
    return {
      mode: 'lesson',
      points: lessonPoints,
    };
  }

  const fallbackRow = selectedCourseRow || courseRows[0] || null;
  const fallback = fallbackRow
    ? [{
      id: fallbackRow.id,
      label: truncateLabel(fallbackRow.name, 12),
      value: clampPercent(fallbackRow.averageScore),
    }]
    : [];

  return {
    mode: 'course',
    points: fallback,
  };
};

const buildScoreLineChart = (points = [], targetScore = DEFAULT_TARGET_SCORE) => {
  const safePoints = Array.isArray(points) ? points : [];
  const innerWidth = SCORE_CHART_WIDTH - SCORE_CHART_PADDING.left - SCORE_CHART_PADDING.right;
  const plotWidth = Math.max(0, innerWidth - (SCORE_CHART_POINT_INSET * 2));
  const innerHeight = SCORE_CHART_HEIGHT - SCORE_CHART_PADDING.top - SCORE_CHART_PADDING.bottom;
  const axisY = SCORE_CHART_PADDING.top + innerHeight;
  const axisX1 = SCORE_CHART_PADDING.left;
  const axisX2 = SCORE_CHART_WIDTH - SCORE_CHART_PADDING.right;
  const ticks = [0, 25, 50, 75, 100].map((value) => ({
    value,
    y: axisY - ((value / 100) * innerHeight),
  }));

  const plotPoints = safePoints.map((point, index) => {
    const ratio = safePoints.length <= 1 ? 0.5 : index / (safePoints.length - 1);
    const x = SCORE_CHART_PADDING.left + SCORE_CHART_POINT_INSET + (ratio * plotWidth);
    const safeValue = clampPercent(point?.value);
    const y = axisY - ((safeValue / 100) * innerHeight);
    const isFirst = index === 0;
    const isLast = index === safePoints.length - 1;
    const isNearTick = ticks.some((tick) => Math.abs(tick.value - safeValue) <= SCORE_CHART_TICK_LABEL_GAP);
    const valueLabelAnchor = isFirst && safePoints.length > 1 ? 'start' : (isLast && safePoints.length > 1 ? 'end' : 'middle');
    const valueLabelDx = isFirst && safePoints.length > 1 ? 8 : (isLast && safePoints.length > 1 ? -8 : 0);
    return {
      x,
      y,
      value: safeValue,
      valueLabelX: x + valueLabelDx,
      valueLabelY: Math.max(SCORE_CHART_PADDING.top + 12, y - (isNearTick ? 16 : 10)),
      valueLabelAnchor,
      label: point?.label || '-',
      key: point?.id || `${index}`,
    };
  });

  const polyline = plotPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPath = plotPoints.length > 1
    ? `M ${plotPoints[0].x} ${axisY} L ${plotPoints.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${plotPoints[plotPoints.length - 1].x} ${axisY} Z`
    : '';
  const safeTargetScore = clampTargetScore(targetScore);
  const targetY = axisY - ((safeTargetScore / 100) * innerHeight);

  return {
    ticks,
    axisY,
    axisX1,
    axisX2,
    targetScore: safeTargetScore,
    targetY,
    areaPath,
    points: plotPoints,
    polyline,
  };
};

const buildTimeBarChart = (series = []) => {
  const items = (Array.isArray(series) ? series : []).slice(-10);
  const innerWidth = TIME_CHART_WIDTH - TIME_CHART_PADDING.left - TIME_CHART_PADDING.right;
  const innerHeight = TIME_CHART_HEIGHT - TIME_CHART_PADDING.top - TIME_CHART_PADDING.bottom;
  const axisY = TIME_CHART_PADDING.top + innerHeight;
  const values = items.map((item) => Math.max(0, Math.round(toNumber(item?.minutes))));
  const maxValueRaw = Math.max(0, ...values);
  const roughTickStep = maxValueRaw > 0 ? maxValueRaw / 5 : 4;
  const tickStep = TIME_TICK_CANDIDATES.find((candidate) => candidate >= roughTickStep)
    || Math.max(5, Math.ceil(roughTickStep / 30) * 30);
  const normalizedMax = maxValueRaw > 0 ? Math.ceil(maxValueRaw / tickStep) * tickStep : tickStep * 4;
  const maxValue = Math.max(tickStep * 4, normalizedMax);
  const tickCount = Math.round(maxValue / tickStep);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = index * tickStep;
    return {
      value,
      y: axisY - ((value / maxValue) * innerHeight),
    };
  });

  const bandWidth = items.length > 0 ? innerWidth / items.length : innerWidth;
  const barWidth = Math.max(14, Math.min(34, bandWidth * 0.62));
  const peakMinutes = Math.max(0, ...values);
  const valueLabelThreshold = Math.max(8, Math.round(maxValueRaw * 0.45));
  const bars = items.map((item, index) => {
    const minutes = values[index];
    const ratio = maxValue > 0 ? minutes / maxValue : 0;
    const height = minutes > 0 ? Math.max(4, ratio * innerHeight) : 0;
    const x = TIME_CHART_PADDING.left + (index * bandWidth) + ((bandWidth - barWidth) / 2);
    const y = axisY - height;
    const isToday = Boolean(item?.isToday);
    const isPeak = peakMinutes > 0 && minutes === peakMinutes;
    return {
      x,
      y,
      width: barWidth,
      height,
      label: item?.label || '-',
      minutes,
      isToday,
      isPeak,
      showValueLabel: minutes > 0 && (isPeak || isToday || minutes >= valueLabelThreshold),
      key: `${item?.label || index}-${index}`,
    };
  });

  return {
    ticks,
    bars,
    axisY,
    axisX1: TIME_CHART_PADDING.left,
    axisX2: TIME_CHART_WIDTH - TIME_CHART_PADDING.right,
    latestBar: bars[bars.length - 1] || null,
  };
};

const SubjectOverviewPanel = ({ user, courses = [], onBrowseCourses, loading = false }) => {
  const [timeCursor, setTimeCursor] = useState(() => Date.now());
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [targetScore, setTargetScore] = useState(DEFAULT_TARGET_SCORE);
  const [targetScoreDraft, setTargetScoreDraft] = useState(String(DEFAULT_TARGET_SCORE));

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimeCursor(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const overview = useMemo(() => {
    const consistencySeries = readDailyEngagementMinutes({ user, days: 10, nowMs: timeCursor });
    const rows = courses
      .map((course, index) => {
        const id = course?.id || course?.course_id || `course-${index}`;
        return {
          id,
          name: getCourseName(course),
          subject: toSubjectLabel(course),
          totalQuizzes: Math.max(0, Math.round(toNumber(course?.totalQuizzes, course?.total_quizzes, course?.quiz_count))),
          completedQuizzes: Math.max(0, Math.round(toNumber(course?.completedQuizzes, course?.completed_quizzes))),
          totalQuestions: Math.max(0, Math.round(toNumber(course?.totalQuestions, course?.total_questions))),
          completedQuestions: Math.max(0, Math.round(toNumber(course?.completedQuestions, course?.completed_questions))),
          averageScore: clampPercent(toNumber(course?.averageScore, course?.avg_score)),
          progress: clampPercent(toNumber(course?.progress)),
          minutesThisWeek: Math.max(0, Math.round(toNumber(course?.minutesThisWeek, course?.minutes_this_week, course?.minutesSpent))),
          scoreSplit: {
            lesson: Number.isFinite(course?.scoreSplit?.lesson) ? clampPercent(course.scoreSplit.lesson) : null,
            mockExam: Number.isFinite(course?.scoreSplit?.mockExam) ? clampPercent(course.scoreSplit.mockExam) : null,
          },
          lessonRows: Array.isArray(course?.lessonRows) ? course.lessonRows : [],
          attemptRows: Array.isArray(course?.attemptRows) ? course.attemptRows : [],
          topicRows: Array.isArray(course?.topicRows) ? course.topicRows : [],
          topicRowsByLesson: Array.isArray(course?.topicRowsByLesson) ? course.topicRowsByLesson : [],
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore);

    return {
      rows,
      consistencySeries,
    };
  }, [courses, timeCursor, user]);

  const selectedCourseRow = useMemo(
    () => overview.rows.find((row) => String(row.id) === String(selectedCourseId)) || overview.rows[0] || null,
    [overview.rows, selectedCourseId]
  );
  const selectedCourseStorageKey = useMemo(
    () => getTargetScoreStorageKey(user, selectedCourseRow?.id),
    [selectedCourseRow?.id, user]
  );

  useEffect(() => {
    if (!overview.rows.length) {
      setSelectedCourseId('');
      return;
    }
    const hasCurrent = overview.rows.some((row) => String(row.id) === String(selectedCourseId));
    if (!hasCurrent) setSelectedCourseId(String(overview.rows[0].id));
  }, [overview.rows, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseRow?.id) {
      setTargetScore(DEFAULT_TARGET_SCORE);
      setTargetScoreDraft(String(DEFAULT_TARGET_SCORE));
      return;
    }
    try {
      const storedValue = window.localStorage.getItem(selectedCourseStorageKey);
      const nextTargetScore = storedValue ? clampTargetScore(storedValue) : DEFAULT_TARGET_SCORE;
      setTargetScore(nextTargetScore);
      setTargetScoreDraft(String(nextTargetScore));
    } catch (_) {
      setTargetScore(DEFAULT_TARGET_SCORE);
      setTargetScoreDraft(String(DEFAULT_TARGET_SCORE));
    }
  }, [selectedCourseRow?.id, selectedCourseStorageKey]);

  const scoreTrend = useMemo(
    () => buildScoreTrend(overview.rows, selectedCourseRow),
    [overview.rows, selectedCourseRow]
  );
  const scoreChart = useMemo(
    () => buildScoreLineChart(scoreTrend.points, targetScore),
    [scoreTrend.points, targetScore]
  );
  const timeChart = useMemo(
    () => buildTimeBarChart(overview.consistencySeries),
    [overview.consistencySeries]
  );

  const lessonScoreRows = useMemo(
    () => normalizeLessonRows(selectedCourseRow)
      .map((row) => ({
        id: row.id,
        label: row.name,
        score: Number.isFinite(row.lessonScore) ? row.lessonScore : null,
      })),
    [selectedCourseRow]
  );

  const courseAverage = selectedCourseRow ? clampPercent(selectedCourseRow.averageScore) : 0;
  const totalQuestions = selectedCourseRow?.totalQuestions || 0;
  const correctQuestions = Math.min(totalQuestions, selectedCourseRow?.completedQuestions || 0);
  const wrongQuestions = Math.max(0, totalQuestions - correctQuestions);
  const totalQuizzes = selectedCourseRow?.totalQuizzes || 0;
  const completedQuizzes = Math.min(totalQuizzes, selectedCourseRow?.completedQuizzes || 0);
  const remainingQuizzes = Math.max(0, totalQuizzes - completedQuizzes);
  const scoreSplitAverage = selectedCourseRow
    ? [selectedCourseRow.scoreSplit.lesson, selectedCourseRow.scoreSplit.mockExam]
      .filter((value) => Number.isFinite(value))
    : [];
  const overallAccuracy = totalQuestions > 0
    ? clampPercent((correctQuestions / totalQuestions) * 100)
    : (scoreSplitAverage.length > 0
      ? clampPercent(scoreSplitAverage.reduce((sum, value) => sum + value, 0) / scoreSplitAverage.length)
      : courseAverage);
  const goalGap = targetScore - courseAverage;
  const scoreDelta = scoreChart.points.length >= 2
    ? scoreChart.points[scoreChart.points.length - 1].value - scoreChart.points[scoreChart.points.length - 2].value
    : 0;
  const peakTimeBar = timeChart.bars.find((bar) => bar.isPeak) || null;
  const handleTargetScoreSave = () => {
    const nextTargetScore = clampTargetScore(targetScoreDraft);
    setTargetScore(nextTargetScore);
    setTargetScoreDraft(String(nextTargetScore));
    if (!selectedCourseRow?.id) return;
    try {
      window.localStorage.setItem(selectedCourseStorageKey, String(nextTargetScore));
    } catch (_) {
      // Ignore storage failures; the current in-memory goal still works for this session.
    }
  };

  if (loading) {
    return (
      <section className="subject-overview subject-overview-loading" aria-label="กำลังโหลดรายงานผลการทำแบบฝึกหัด">
        <header className="subject-overview-head">
          <div>
            <h2>รายงานผลการทำแบบฝึกหัด</h2>
            <p>สรุปภาพรวมการฝึกและพัฒนาการของคุณ</p>
          </div>
        </header>

        <div className="overview-filter-row">
          <div className="subject-overview-skeleton-line w-44 h-20" />
          <div className="subject-overview-skeleton-line w-32 h-30" />
        </div>

        <div className="overview-quick-status">
          {Array.from({ length: 4 }, (_, index) => (
            <article className="quick-status-card" key={`overview-loading-kpi-${index}`} aria-hidden="true">
              <div className="subject-overview-skeleton-line w-38" />
              <div className="subject-overview-skeleton-line w-28 h-28" />
              <div className="subject-overview-skeleton-line w-58" />
            </article>
          ))}
        </div>

        <div className="overview-visual-layer">
          {Array.from({ length: 2 }, (_, index) => (
            <article className="subject-chart-card" key={`overview-loading-chart-${index}`} aria-hidden="true">
              <div className="subject-overview-skeleton-line w-44 h-20" />
              <div className="subject-overview-skeleton-line w-62" />
              <div className="subject-overview-skeleton-chart" />
            </article>
          ))}
        </div>

        <div className="course-progress-grid">
          {Array.from({ length: 2 }, (_, index) => (
            <article className="course-progress-card" key={`overview-loading-bottom-${index}`} aria-hidden="true">
              <div className="subject-overview-skeleton-line w-40 h-22" />
              <div className="subject-overview-skeleton-line w-62" />
              <div className="subject-overview-skeleton-progress" />
              <div className="subject-overview-skeleton-line w-72" />
              <div className="subject-overview-skeleton-line w-58" />
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (!overview.rows.length) {
    return (
      <section className="subject-overview subject-overview-no-courses">
        <header className="my-courses-header subject-overview-head">
          <div>
            <h2>รายงานผล</h2>
            <p>ภาพรวมผลการทำแบบฝึกหัดและพัฒนาการของคุณ</p>
          </div>
        </header>

        <div className="my-courses-empty">
          <h3>ยังไม่มีคอร์สที่ลงทะเบียน</h3>
          <p>เริ่มเลือกคอร์สเพื่อดูรายงานผลการทำแบบฝึกหัด</p>
          <button type="button" onClick={onBrowseCourses}>สำรวจคอร์สทั้งหมด</button>
        </div>
      </section>
    );
  }

  return (
    <section className="subject-overview" aria-label="รายงานผลการทำแบบฝึกหัด">
      <header className="subject-overview-head">
        <div>
          <h2>รายงานผลการทำแบบฝึกหัด</h2>
          <p>สรุปภาพรวมการทำแบบฝึกหัดและพัฒนาการของคุณ</p>
        </div>
      </header>

      <div className="overview-filter-row">
        <label className="subject-chart-course-filter">
          <span>คอร์สที่กำลังดูรายงานผล:</span>
          <select
            value={selectedCourseRow?.id ? String(selectedCourseRow.id) : ''}
            onChange={(event) => setSelectedCourseId(event.target.value)}
            aria-label="เลือกคอร์สที่ต้องการดูรายงานผล"
          >
            {overview.rows.map((row) => (
              <option key={`report-course-${row.id}`} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overview-quick-status">
        <article className="quick-status-card kpi-summary-card">
          <span>คะแนนเฉลี่ย</span>
          <div className="kpi-main-row">
            <strong>{courseAverage}%</strong>
            <div className="kpi-donut kpi-donut-green" style={{ '--value': courseAverage }}>
              <span>{courseAverage}%</span>
            </div>
          </div>
          <p>{scoreDelta >= 0 ? 'แนวโน้มดีขึ้น' : 'แนวโน้มชะลอลง'} {scoreDelta >= 0 ? '+' : ''}{scoreDelta}%</p>
        </article>

        <article className="quick-status-card kpi-summary-card">
          <span>ทำข้อสอบทั้งหมด</span>
          <strong>{totalQuestions} ข้อ</strong>
          <div className="kpi-sub-row">
            <b className="good">ถูกต้อง {correctQuestions}</b>
            <b className="bad">ผิด {wrongQuestions}</b>
          </div>
          <p>{completedQuizzes} จาก {totalQuizzes} ชุดที่มีคะแนน</p>
        </article>

        <article className="quick-status-card kpi-summary-card">
          <span>ชุดที่ทำทั้งหมด</span>
          <strong>{totalQuizzes} ชุด</strong>
          <div className="kpi-sub-row">
            <b className="good">เสร็จสิ้น {completedQuizzes}</b>
            <b>ยังไม่เสร็จ {remainingQuizzes}</b>
          </div>
          <p>{selectedCourseRow?.subject || 'วิชาพื้นฐาน'}</p>
        </article>

        <article className="quick-status-card kpi-summary-card">
          <span>ความแม่นยำโดยรวม</span>
          <div className="kpi-main-row">
            <strong>{overallAccuracy}%</strong>
            <div className="kpi-donut kpi-donut-blue" style={{ '--value': overallAccuracy }}>
              <span>{overallAccuracy}%</span>
            </div>
          </div>
          <p>คำนวณจากผลลัพธ์ที่มีข้อมูลล่าสุด</p>
        </article>
      </div>

      <div className="overview-visual-layer">
        <article className="subject-chart-card">
          <div className="subject-chart-head">
            <h3>พัฒนาการของคะแนน</h3>
            <p>
              {scoreTrend.mode === 'attempt'
                ? 'อิงจากผลการทำชุดข้อสอบแต่ละครั้ง (ล่าสุด 7 ครั้ง)'
                : scoreTrend.mode === 'lesson'
                  ? 'อิงจากบทเรียนล่าสุดในคอร์สที่เลือก'
                  : 'อิงจากคะแนนเฉลี่ยของคอร์สที่ลงทะเบียน'}
            </p>
          </div>
          <div className="course-metric-chart-wrap">
            <svg
              className="course-metric-chart report-score-chart"
              viewBox={`0 0 ${SCORE_CHART_WIDTH} ${SCORE_CHART_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              aria-label="กราฟพัฒนาการของคะแนน"
            >
              <defs>
                <linearGradient id="course-metric-area-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4a87ee" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#4a87ee" stopOpacity="0.04" />
                </linearGradient>
              </defs>
              {scoreChart.ticks.map((tick) => (
                <g key={`score-tick-${tick.value}`}>
                  <line
                    x1={scoreChart.axisX1}
                    y1={tick.y}
                    x2={scoreChart.axisX2}
                    y2={tick.y}
                    className="course-metric-grid-line"
                  />
                  <text x={scoreChart.axisX1 - 8} y={tick.y + 4} className="course-metric-y-tick">
                    {tick.value}%
                  </text>
                </g>
              ))}
              <line
                x1={scoreChart.axisX1}
                y1={scoreChart.axisY}
                x2={scoreChart.axisX2}
                y2={scoreChart.axisY}
                className="course-metric-axis-line"
              />
              <line
                x1={scoreChart.axisX1}
                y1={scoreChart.targetY}
                x2={scoreChart.axisX2}
                y2={scoreChart.targetY}
                className="course-metric-target-line"
              />
              <text x={scoreChart.axisX2 - 6} y={scoreChart.targetY - 6} textAnchor="end" className="course-metric-target-label">
                เป้าหมาย {scoreChart.targetScore}%
              </text>
              {scoreChart.areaPath ? (
                <path d={scoreChart.areaPath} className="course-metric-area" />
              ) : null}
              {scoreChart.polyline ? (
                <polyline points={scoreChart.polyline} className="course-metric-line" />
              ) : null}
              {scoreChart.points.map((point, index) => (
                <g key={`score-point-${point.key}`}>
                  <line
                    x1={point.x}
                    y1={point.y}
                    x2={point.x}
                    y2={scoreChart.axisY}
                    className="course-metric-drop-line"
                  />
                  {index === scoreChart.points.length - 1 ? (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="9"
                      className="course-metric-point-halo"
                    />
                  ) : null}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={index === scoreChart.points.length - 1 ? 5 : 4}
                    className={`course-metric-point ${index === scoreChart.points.length - 1 ? 'latest' : ''}`}
                  />
                  <text
                    x={point.valueLabelX}
                    y={point.valueLabelY}
                    textAnchor={point.valueLabelAnchor}
                    className="course-metric-value"
                  >
                    {point.value}%
                  </text>
                  <text x={point.x} y={scoreChart.axisY + 24} textAnchor="middle" className="course-metric-x-label">
                    {point.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </article>

        <article className="subject-chart-card">
          <div className="subject-chart-head">
            <h3>เวลาที่ใช้ต่อวัน (เฉลี่ย)</h3>
            <p>ย้อนหลัง 10 วัน • ไฮไลต์วันที่ใช้เวลาสูงสุดและวันนี้</p>
          </div>
          <div className="consistency-trend-chart-wrap">
            <svg
              className="consistency-trend-chart report-time-chart"
              viewBox={`0 0 ${TIME_CHART_WIDTH} ${TIME_CHART_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              aria-label="กราฟเวลาใช้งานย้อนหลัง 10 วัน"
            >
              {timeChart.ticks.map((tick) => (
                <g key={`time-tick-${tick.value}`}>
                  <line
                    x1={timeChart.axisX1}
                    y1={tick.y}
                    x2={timeChart.axisX2}
                    y2={tick.y}
                    className="consistency-grid-line"
                  />
                  <text x={timeChart.axisX1 - 8} y={tick.y + 4} className="consistency-y-tick">
                    {tick.value}
                  </text>
                </g>
              ))}
              <line
                x1={timeChart.axisX1}
                y1={timeChart.axisY}
                x2={timeChart.axisX2}
                y2={timeChart.axisY}
                className="consistency-axis-line"
              />
              {timeChart.bars.map((bar) => (
                <g key={`time-bar-${bar.key}`}>
                  {bar.height > 0 ? (
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx="5"
                      className={`consistency-bar ${bar.isPeak ? 'peak' : ''} ${bar.isToday ? 'today' : ''}`}
                    >
                      <title>{`${bar.label}: ${bar.minutes} นาที`}</title>
                    </rect>
                  ) : null}
                  {bar.showValueLabel ? (
                    <text
                      x={bar.x + (bar.width / 2)}
                      y={bar.y - 8}
                      textAnchor="middle"
                      className={`consistency-bar-value ${bar.isPeak ? 'peak' : ''} ${bar.isToday ? 'today' : ''}`}
                    >
                      {bar.minutes}
                    </text>
                  ) : null}
                  <text x={bar.x + (bar.width / 2)} y={timeChart.axisY + 24} textAnchor="middle" className={`consistency-x-tick ${bar.isToday ? 'today' : ''}`}>
                    {bar.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="time-chart-meta">
            <span>สูงสุด: {peakTimeBar ? `${peakTimeBar.minutes} นาที` : '0 นาที'}</span>
            <span>ล่าสุด: {timeChart.latestBar ? `${timeChart.latestBar.minutes} นาที` : '0 นาที'}</span>
          </div>
        </article>
      </div>

      <div className="course-progress-grid report-bottom-grid">
        <article className="course-progress-card">
          <div className="course-progress-head">
            <h3>ความแม่นยำรายบท</h3>
          </div>
          {lessonScoreRows.length > 0 ? (
            <div className="report-topic-list">
              {lessonScoreRows.map((row) => (
                <div className="report-topic-row" key={`lesson-score-${row.id}`}>
                  <span>{row.label}</span>
                  <div className="report-topic-track" aria-hidden="true">
                    <i style={{ width: `${Number.isFinite(row.score) ? Math.max(4, row.score) : 0}%` }} />
                  </div>
                  <strong>{Number.isFinite(row.score) ? `${row.score}%` : '-'}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="report-empty-note">คอร์สนี้ยังไม่มีคะแนนแบบฝึกหัดรายบทเพียงพอสำหรับสรุปเปอร์เซ็นต์</p>
          )}
        </article>

        <article className="course-progress-card">
          <div className="course-progress-head goal-progress-head">
            <h3>เป้าหมายของคุณ</h3>
            <label className="goal-score-control">
              <span>คะแนนเป้าหมาย</span>
              <input
                type="number"
                min="1"
                max="100"
                value={targetScoreDraft}
                onChange={(event) => setTargetScoreDraft(event.target.value)}
                aria-label="ตั้งคะแนนเป้าหมาย"
              />
              <b>%</b>
            </label>
            <button type="button" className="goal-score-save" onClick={handleTargetScoreSave}>
              Save
            </button>
          </div>
          <p className="goal-target-text">ทำให้ได้ {targetScore}% ภายในสิ้นเดือน</p>
          <div className="goal-progress-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(4, courseAverage)}%` }} />
          </div>
          <div className="goal-progress-meta">
            <strong>{courseAverage}%</strong>
            <span>
              {goalGap > 0
                ? `เหลืออีก ${goalGap}% เพื่อไปถึงเป้าหมาย`
                : `เกินเป้าหมาย ${Math.abs(goalGap)}% แล้ว`}
            </span>
          </div>
          <p className="report-empty-note">
            {goalGap > 0
              ? `แนะนำทำแบบฝึกเพิ่มอย่างน้อย ${Math.max(1, remainingQuizzes)} ชุด`
              : 'รักษาความสม่ำเสมอเพื่อคงผลลัพธ์'}
          </p>
        </article>
      </div>
    </section>
  );
};

export default SubjectOverviewPanel;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Atom, CalendarDays, CheckCircle2, Filter, Heart, Search, SlidersHorizontal } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import DashboardHeader from '../components/DashboardHeader';
import StatsOrOnboarding from '../components/StatsOrOnboarding';
import LoadingSkeleton from '../components/LoadingSkeleton';
import SubjectOverviewPanel from '../components/SubjectOverviewPanel';
import AIRecommendationPanel from '../components/AIRecommendationPanel';
import StudentSettingsPage from '../components/StudentSettingsPage';
import CourseCard from '../components/BrowseCourseCard';
import defaultCourseCoverImage from '../assets/images/illustrations/dashboard_logo.webp';
import { courseAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { readLatestLessonActivity } from '../utils/learningActivity';
import { trackEvent } from '../utils/analytics';

const normalizeText = (value) => (value || '').toString().toLowerCase().trim();
const STUDENT_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api/v1';
const STUDENT_API_ORIGIN = (() => {
  try {
    return new URL(STUDENT_API_BASE_URL).origin;
  } catch (_) {
    return '';
  }
})();

const truncateText = (value, max = 26) => {
  const text = (value || '').toString().trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const toDurationBucket = (minutes) => {
  if (!minutes || Number.isNaN(minutes)) return null;
  if (minutes < 30) return '<30';
  if (minutes < 60) return '30-60';
  if (minutes < 120) return '60-120';
  return '120+';
};

const isCourseExpiredRecord = (record) => {
  if (!record || typeof record !== 'object') return false;
  if (Boolean(record?.is_expired)) return true;
  const expiresAt = record?.expires_at || record?.trial_expires_at;
  if (!expiresAt) return false;
  const expiresAtTs = new Date(expiresAt).getTime();
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

const isPaidEnrollmentRecord = (record) => {
  if (!record || typeof record !== 'object') return false;
  const source = String(record?.enrollment_source || '').toLowerCase().trim();
  const type = String(record?.enrollment_type || '').toLowerCase().trim();
  const status = String(record?.payment_status || record?.status || '').toLowerCase().trim();
  const paidAmount = Number(record?.paid_amount_thb);
  const hasPaymentHistory = Array.isArray(record?.payment_history) && record.payment_history.some((event) => (
    String(event?.payment_status || '').toLowerCase().trim() === 'succeeded'
    || String(event?.payment_intent_id || '').trim()
    || Number.isFinite(Number(event?.paid_amount_thb))
  ));
  return source === 'payment'
    || source === 'paid'
    || type === 'payment'
    || type === 'paid'
    || status === 'paid'
    || status === 'succeeded'
    || String(record?.payment_intent_id || '').trim()
    || String(record?.paid_at || '').trim()
    || Number.isFinite(paidAmount)
    || hasPaymentHistory;
};

const toDifficultyLabel = (value) => {
  if (!value) return null;
  if (typeof value === 'number') {
    if (value <= 1) return 'ง่าย';
    if (value === 2) return 'กลาง';
    return 'ยาก';
  }
  const text = normalizeText(value);
  if (text.includes('easy') || text.includes('ง่าย')) return 'ง่าย';
  if (text.includes('hard') || text.includes('ยาก') || text.includes('advanced')) return 'ยาก';
  if (text.includes('medium') || text.includes('กลาง') || text.includes('intermediate')) return 'กลาง';
  return null;
};

const toDifficultyLabelFromQuiz = (quiz) => {
  const direct = toDifficultyLabel(
    quiz?.difficulty_avg
    ?? quiz?.difficulty
    ?? quiz?.level_difficulty
    ?? quiz?.difficulty_level
    ?? quiz?.level
  );
  if (direct) return direct;

  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const numericDifficulties = questions
    .map((question) => Number(question?.difficulty))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (numericDifficulties.length === 0) return null;

  const avg = numericDifficulties.reduce((sum, value) => sum + value, 0) / numericDifficulties.length;
  if (avg <= 2) return 'ง่าย';
  if (avg >= 4) return 'ยาก';
  return 'กลาง';
};

const detectQuizKind = (payload) => {
  const text = [
    payload?.title,
    payload?.name,
    payload?.quiz_type,
    payload?.type,
    payload?.purpose,
    payload?.description,
    payload?.document_type,
    Array.isArray(payload?.tags) ? payload.tags.join(' ') : payload?.tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    text.includes('mock_exam') ||
    text.includes('mock exam') ||
    text.includes('แบบทดสอบจำลอง')
  ) {
    return 'mock_exam';
  }

  if (
    text.includes('exam') ||
    text.includes('test') ||
    text.includes('สอบ') ||
    text.includes('o-net') ||
    text.includes('onet') ||
    text.includes('pretest') ||
    text.includes('posttest') ||
    text.includes('midterm') ||
    text.includes('final')
  ) {
    return 'lesson';
  }
  return 'lesson';
};

const DEFAULT_SUBJECT_LABEL = 'ทั่วไป';
const DEFAULT_SUBJECT_OPTIONS = [
  'คณิตศาสตร์',
  'ภาษาอังกฤษ',
  'วิทยาศาสตร์',
  'ฟิสิกส์',
  'เคมี',
  'ชีววิทยา',
  'ภาษาไทย',
  'สังคมศึกษา',
];
const EDUCATION_LEVEL_OPTIONS = ['ประถม', 'มัธยมต้น', 'มัธยมปลาย'];
const PURPOSE_OPTIONS = ['เนื้อหา', 'สอบเข้า'];
const GRADE_LEVEL_OPTIONS = [
  'ประถม', 'มัธยมต้น', 'มัธยมปลาย',
  'ป1', 'ป2', 'ป3', 'ป4', 'ป5', 'ป6', 'ม1', 'ม2', 'ม3', 'ม4', 'ม5', 'ม6',
];

const CATEGORY_TO_SUBJECT = {
  math: 'คณิตศาสตร์',
  science: 'วิทยาศาสตร์',
  language: 'ภาษาไทย',
  social: 'สังคม',
  general: DEFAULT_SUBJECT_LABEL,
};

const normalizeGradeValue = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.includes('ประถม')) return 'ประถม';
  if (text.includes('มัธยมต้น')) return 'มัธยมต้น';
  if (text.includes('มัธยมปลาย')) return 'มัธยมปลาย';
  const normalized = text.replace(/\./g, '').replace(/\s+/g, '');
  const match = normalized.match(/(ป[1-6]|ม[1-6])/i);
  if (!match) return null;
  return match[1].replace('p', 'ป').replace('m', 'ม');
};

const parseGradesFromText = (value) => {
  const text = String(value || '');
  const matches = text.match(/ป[1-6]|ม[1-6]/g) || [];
  return Array.from(
    new Set(
      matches
        .map((item) => normalizeGradeValue(item))
        .filter((item) => item && GRADE_LEVEL_OPTIONS.includes(item))
    )
  );
};

const normalizeSubjectValue = (value) => {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_SUBJECT_LABEL;
  const lowered = text.toLowerCase();
  if (lowered.includes('social') || text.includes('สังคม')) return 'สังคมศึกษา';
  if (lowered.includes('physics') || text.includes('ฟิสิกส์')) return 'ฟิสิกส์';
  if (lowered.includes('chem') || text.includes('เคมี')) return 'เคมี';
  if (lowered.includes('bio') || text.includes('ชีว')) return 'ชีววิทยา';
  if (lowered.includes('english') || text.includes('อังกฤษ')) return 'ภาษาอังกฤษ';
  if (lowered.includes('math') || text.includes('คณิต')) return 'คณิตศาสตร์';
  if (lowered.includes('science') || text.includes('วิทย')) return 'วิทยาศาสตร์';
  if (text.includes('ไทย')) return 'ภาษาไทย';
  return text;
};

const toEducationLevel = (grade) => {
  const normalized = normalizeGradeValue(grade);
  if (!normalized) return null;
  if (normalized === 'ประถม') return 'ประถม';
  if (normalized === 'มัธยมต้น') return 'มัธยมต้น';
  if (normalized === 'มัธยมปลาย') return 'มัธยมปลาย';
  if (normalized.startsWith('ป')) return 'ประถม';
  if (['ม1', 'ม2', 'ม3'].includes(normalized)) return 'มัธยมต้น';
  if (['ม4', 'ม5', 'ม6'].includes(normalized)) return 'มัธยมปลาย';
  return null;
};

const extractPurposes = (course, tags = []) => {
  const raw = [
    course?.purpose,
    course?.goal,
    course?.target,
    course?.exam,
    course?.target_audience,
    course?.description,
    tags.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    raw.includes('สอบเข้า') ||
    raw.includes('entrance') ||
    raw.includes('onet') ||
    raw.includes('o-net') ||
    raw.includes('สอวน') ||
    raw.includes('ค่าย 1')
  ) {
    return ['สอบเข้า'];
  }
  return ['เนื้อหา'];
};

const toArray = (payload, key) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};

const toNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const DASHBOARD_TIME_ZONE = 'Asia/Bangkok';

const formatDayKeyFromUtcDate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toLocalDayKey = (value) => {
  let parsedDate = null;

  if (value instanceof Date) {
    parsedDate = Number.isFinite(value.getTime()) ? value : null;
  } else {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      const fromMilliseconds = new Date(numericValue);
      parsedDate = Number.isFinite(fromMilliseconds.getTime()) ? fromMilliseconds : null;
    } else {
      const textValue = String(value || '').trim();
      if (textValue) {
        const fromText = new Date(textValue);
        parsedDate = Number.isFinite(fromText.getTime()) ? fromText : null;
      }
    }
  }

  if (!parsedDate) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: DASHBOARD_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(parsedDate);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (_) {
    // Fall through to runtime-local formatting when Intl time zone support is unavailable.
  }

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysToDayKey = (dayKey, days) => {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  return formatDayKeyFromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
};

const getWeekdayIndexFromDayKey = (dayKey) => {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return 0;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const normalizeCourseImageCandidate = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;

  if (/^data:image\//i.test(text) || /^blob:/i.test(text)) {
    return text;
  }

  if (text.startsWith('//')) {
    return `https:${text}`;
  }

  const normalizeUploadsPath = (pathText) => {
    if (!pathText) return null;
    const withLeadingSlash = pathText.startsWith('/') ? pathText : `/${pathText}`;
    if (!/^\/uploads\//i.test(withLeadingSlash)) return null;
    return STUDENT_API_ORIGIN
      ? `${STUDENT_API_ORIGIN}${withLeadingSlash}`
      : withLeadingSlash;
  };

  if (/^https?:\/\//i.test(text)) {
    try {
      const parsed = new URL(text);
      const uploadsFromAbsolute = normalizeUploadsPath(parsed.pathname);
      if (uploadsFromAbsolute) {
        return `${uploadsFromAbsolute}${parsed.search || ''}${parsed.hash || ''}`;
      }
      return text;
    } catch (_) {
      return text;
    }
  }

  const uploadsFromRelative = normalizeUploadsPath(text.replace(/^\.?\//, ''));
  if (uploadsFromRelative) return uploadsFromRelative;

  if (text.startsWith('/')) {
    return text;
  }

  const hasPathLikePattern =
    /[\\/]/.test(text) || /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i.test(text);
  if (!hasPathLikePattern) return null;

  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)) {
    return `https://${text}`;
  }

  return `/${text.replace(/^\.?\//, '')}`;
};

const resolveCourseImageUrl = (course) => {
  if (!course || typeof course !== 'object') return null;
  const candidates = [
    course.thumbnail_url,
    course.thumbnailUrl,
    course.image_url,
    course.imageUrl,
    course.cover_image,
    course.coverImage,
    course.image,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeCourseImageCandidate(candidate);
    if (normalized) return normalized;
  }
  return null;
};

const getFocusSuggestion = (score) => {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  if (safeScore < 35) return 'ทบทวนพื้นฐานก่อน แล้วค่อยเพิ่มโจทย์ประยุกต์';
  if (safeScore < 60) return 'ฝึกโจทย์ระดับกลางเพิ่มอีกเล็กน้อยเพื่อให้แม่นขึ้น';
  if (safeScore < 80) return 'เริ่มทำชุดจับเวลาเพื่อเพิ่มความคล่องในการทำข้อสอบ';
  return 'รักษาความต่อเนื่อง และลองเพิ่มความยากขึ้นอีกระดับ';
};

const formatPercentTickLabel = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(1).replace(/\.0$/, '');
};

const normalizeLessonId = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

const formatThaiDate = (date) => {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch (_) {
    return '';
  }
};

const formatThaiShortDate = (date) => {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch (_) {
    return '';
  }
};

const normalizeTrendSeriesLabels = (series = []) => {
  const normalized = series.map((item, index) => {
    const label = String(item?.label || '').trim();
    return {
      ...item,
      label: label || `ครั้งที่ ${index + 1}`,
    };
  });

  const labelCounts = normalized.reduce((acc, item) => {
    const label = String(item?.label || '').trim();
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const hasDuplicateLabels = normalized.some((item) => labelCounts[String(item?.label || '').trim()] > 1);

  if (!hasDuplicateLabels) return normalized;

  return normalized.map((item, index) => ({
    ...item,
    label: `ครั้งที่ ${index + 1}`,
  }));
};

const getLessonName = (lesson, fallbackIndex = 0) => {
  const raw = lesson?.title || lesson?.name || lesson?.lesson_name || lesson?.topic || '';
  const text = String(raw || '').trim();
  return text || `บทเรียน ${fallbackIndex + 1}`;
};

const getAttemptStats = (item) => {
  const totalQuestions = Math.max(0, toNumber(item?.total_questions));
  const correctCount = Math.max(0, toNumber(item?.correct_count));
  if (totalQuestions > 0) {
    const boundedCorrect = Math.min(correctCount, totalQuestions);
    return {
      total: totalQuestions,
      correct: boundedCorrect,
      accuracy: (boundedCorrect / totalQuestions) * 100,
    };
  }

  const score = Number(item?.score);
  if (Number.isFinite(score)) {
    const boundedScore = Math.max(0, Math.min(100, score));
    return {
      total: 1,
      correct: boundedScore / 100,
      accuracy: boundedScore,
    };
  }
  return null;
};

const toTopicLabel = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const resolveQuestionTopicLabel = (question, fallback = 'ไม่ระบุหัวข้อ') => (
  toTopicLabel(
    question?.topic_tag,
    question?.topicTag,
    question?.topic,
    question?.subject_tag,
    question?.subject,
    question?.category
  ) || fallback
);

const sorters = {
  popular: (a, b) => (b.rating || 0) - (a.rating || 0),
  newest: (a, b) => b.updatedAt - a.updatedAt,
  durationAsc: (a, b) => (a.durationMinutes || 0) - (b.durationMinutes || 0),
  difficultyAsc: (a, b) => a.difficultyRank - b.difficultyRank,
};

const SearchBar = ({ value, onChange, onClear, inputRef }) => (
  <div className="course-search-bar" role="search">
    <div className="search-field">
      <Search className="search-icon" size={21} strokeWidth={2} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        placeholder="ค้นหาด้วยชื่อคอร์ส / วิชา / ระดับชั้น / เป้าหมาย…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="ค้นหาคอร์ส"
      />
      {value ? (
        <button type="button" className="search-clear" onClick={onClear} aria-label="ล้างคำค้นหา">
          ล้าง
        </button>
      ) : null}
    </div>
  </div>
);

const BrowseFilters = ({
  selectedEducationLevels,
  selectedPurposes,
  selectedSubjects,
  onToggleEducationLevel,
  onTogglePurpose,
  onToggleSubject,
  educationLevels,
  purposes,
  subjects,
  onClear
}) => {
  return (
    <aside className="filter-panel">
      <div className="filter-panel-header">
        <h3><Filter size={16} strokeWidth={2.2} aria-hidden="true" />ตัวกรอง</h3>
        <button type="button" className="filter-clear-link" onClick={onClear}>
          ล้างตัวกรอง
        </button>
      </div>
    <div className="browse-filters">
      <div className="browse-filter-group">
        <h4 className="browse-filter-title">ระดับการศึกษา</h4>
        <div className="browse-checkbox-list">
          {educationLevels.map((level) => {
            const checked = selectedEducationLevels.includes(level);
            return (
              <label key={level} className={`browse-checkbox-item ${checked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleEducationLevel(level)}
                />
                <span>{level}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="browse-filter-group">
        <h4 className="browse-filter-title">จุดประสงค์</h4>
        <div className="browse-checkbox-list">
          {purposes.map((purpose) => {
            const checked = selectedPurposes.includes(purpose);
            return (
              <label key={purpose} className={`browse-checkbox-item ${checked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onTogglePurpose(purpose)}
                />
                <span>{purpose}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="browse-filter-group">
        <h4 className="browse-filter-title">วิชา</h4>
        <div className="browse-checkbox-list">
          {subjects.map((subject) => {
            const checked = selectedSubjects.includes(subject);
            return (
              <label key={subject} className={`browse-checkbox-item ${checked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSubject(subject)}
                />
                <span>{subject}</span>
              </label>
            );
          })}
        </div>
      </div>

      <button type="button" className="browse-filter-clear" onClick={onClear}>
        ล้างตัวกรอง
      </button>
    </div>
  </aside>
  );
};

const EmptyStates = ({ type }) => {
  if (type === 'empty') {
    return (
      <div className="browse-empty-state">
        <div className="browse-empty-icon">📚</div>
        <h3>ยังไม่มีคอร์สในระบบ</h3>
        <p>โปรดติดต่อผู้สอนเพื่อสร้างคอร์ส</p>
      </div>
    );
  }

  return (
    <div className="browse-empty-state">
      <div className="browse-empty-icon">🔍</div>
      <h3>ไม่พบคอร์สที่ตรงกับเงื่อนไข</h3>
      <p>ลองเปลี่ยนคำค้นหาแล้วค้นหาอีกครั้ง</p>
    </div>
  );
};

const DashboardDialogModal = ({ config, onConfirm, onClose }) => {
  if (!config) return null;
  const isConfirm = config.type === 'confirm';

  return (
    <div className="dashboard-dialog-overlay" onClick={onClose}>
      <div
        className="dashboard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="dashboard-dialog-title">{config.title}</h3>
        <p className="dashboard-dialog-message">{config.message}</p>
        <div className="dashboard-dialog-actions">
          {isConfirm ? (
            <button
              type="button"
              className="dashboard-dialog-btn secondary"
              onClick={onClose}
            >
              {config.cancelText || 'ยกเลิก'}
            </button>
          ) : null}
          <button
            type="button"
            className="dashboard-dialog-btn primary"
            onClick={onConfirm}
            autoFocus
          >
            {config.confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

const MyCoursesSkeleton = () => (
  <div className="my-courses-skeleton" role="status" aria-live="polite" aria-label="กำลังโหลดข้อมูลคอร์สของฉัน">
    <div className="my-course-card-grid my-course-card-grid-skeleton" aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={`my-course-card-skeleton-${index}`} className="my-course-card my-course-card-skeleton">
          <div className="my-course-card-head">
            <span className="my-course-skeleton-line title" />
            <span className="my-course-skeleton-line chip" />
          </div>
          <span className="my-course-skeleton-line text-md" />
          <div className="my-course-skeleton-progress" />
          <span className="my-course-skeleton-line text-sm" />
        </div>
      ))}
    </div>

    <article className="my-course-overview my-course-overview-skeleton" aria-hidden="true">
      <span className="my-course-skeleton-line heading" />
      <div className="my-course-kpi-grid">
        {[0, 1, 2, 3].map((index) => (
          <div key={`my-course-kpi-skeleton-${index}`} className="my-kpi-card my-kpi-card-skeleton">
            <span className="my-course-skeleton-line text-sm" />
            <span className="my-course-skeleton-line value" />
          </div>
        ))}
      </div>

      <div className="my-course-bottom-grid">
        <div className="my-course-chart-card my-course-chart-card-skeleton">
          <div className="my-course-chart-head">
            <span className="my-course-skeleton-line text-md" />
            <span className="my-course-skeleton-line range-chip" />
          </div>
          <div className="my-course-skeleton-chart" />
        </div>

        <div className="my-course-focus-card my-course-focus-card-skeleton">
          <span className="my-course-skeleton-line text-md" />
          <span className="my-course-skeleton-line text-lg" />
          <span className="my-course-skeleton-line text-md" />
          <div className="my-course-skeleton-media" />
          <span className="my-course-skeleton-button" />
        </div>
      </div>
    </article>
  </div>
);

const ContinueCourseSkeleton = () => (
  <div className="dashboard-continue-card dashboard-continue-card-skeleton" role="status" aria-live="polite" aria-label="กำลังโหลดบทเรียนที่เรียนต่อ">
    <div className="continue-course-icon continue-course-icon-skeleton" aria-hidden="true">
      <span className="dashboard-skeleton-line continue-icon-line" />
    </div>
    <div className="continue-main continue-main-skeleton" aria-hidden="true">
      <span className="dashboard-skeleton-line continue-label-line" />
      <span className="dashboard-skeleton-line continue-title-line" />
      <span className="dashboard-skeleton-line continue-subtitle-line" />
      <div className="continue-progress-row continue-progress-row-skeleton">
        <span className="dashboard-skeleton-line continue-badge-line" />
        <span className="dashboard-skeleton-line continue-track-line" />
        <span className="dashboard-skeleton-line continue-percent-line" />
      </div>
    </div>
    <span className="dashboard-skeleton-line continue-action-line" aria-hidden="true" />
  </div>
);

const DashboardPage = ({ user, onShowAuth }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(user ? 'courses' : 'browse');
  const [selectedMyCourseId, setSelectedMyCourseId] = useState(null);
  const [selectedAiCourseId, setSelectedAiCourseId] = useState(null);
  const [allCourses, setAllCourses] = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [enrolling, setEnrolling] = useState({});
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedEducationLevels, setSelectedEducationLevels] = useState([]);
  const [selectedPurposes, setSelectedPurposes] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [enrolledCoursesState, setEnrolledCoursesState] = useState(
    Array.isArray(user?.enrolledCourses) ? user.enrolledCourses : []
  );
  const [liveCourseStats, setLiveCourseStats] = useState({});
  const [liveStatsResolved, setLiveStatsResolved] = useState(false);
  const searchInputRef = useRef(null);
  const dialogResolverRef = useRef(null);
  const [dialogConfig, setDialogConfig] = useState(null);
  const [myCourseFocusImageLoadFailed, setMyCourseFocusImageLoadFailed] = useState(false);
  // Ensure enrolledCourses is always an array
  const enrolledCourses = useMemo(
    () => (Array.isArray(enrolledCoursesState) ? enrolledCoursesState : []),
    [enrolledCoursesState]
  );
  const enrichedEnrolledCourses = useMemo(() => {
    return enrolledCourses.map((course) => {
      const id = course?.id || course?.course_id;
      if (!id) return course;
      const live = liveCourseStats[id];
      if (!live) return course;

      return {
        ...course,
        progress: toNumber(live.progress, course?.progress),
        totalQuizzes: toNumber(live.totalQuizzes, course?.totalQuizzes, course?.total_quizzes),
        completedQuizzes: toNumber(live.completedQuizzes, course?.completedQuizzes, course?.completed_quizzes),
        totalQuestions: toNumber(live.totalQuestions, course?.totalQuestions, course?.total_questions),
        completedQuestions: toNumber(live.completedQuestions, course?.completedQuestions, course?.completed_questions),
        totalLessons: toNumber(live.totalLessons, course?.totalLessons, course?.lessons_count, course?.lesson_count),
        completedLessons: toNumber(live.completedLessons, course?.completedLessons, course?.completedLessonsCount),
        minutesThisWeek: toNumber(live.minutesThisWeek, course?.minutesThisWeek, course?.minutes_this_week, course?.minutesSpent),
        lastActivity: live.lastActivity || course?.lastActivity || course?.last_activity,
        averageScore: toNumber(live.averageScore, course?.averageScore),
        difficultyScore: live.difficultyScore || course?.difficultyScore || null,
        scoreSplit: live.scoreSplit || course?.scoreSplit || null,
        lessonRows: Array.isArray(live.lessonRows) ? live.lessonRows : (Array.isArray(course?.lessonRows) ? course.lessonRows : []),
        attemptRows: Array.isArray(live.attemptRows) ? live.attemptRows : (Array.isArray(course?.attemptRows) ? course.attemptRows : []),
        topicRows: Array.isArray(live.topicRows) ? live.topicRows : (Array.isArray(course?.topicRows) ? course.topicRows : []),
        topicRowsByLesson: Array.isArray(live.topicRowsByLesson)
          ? live.topicRowsByLesson
          : (Array.isArray(course?.topicRowsByLesson) ? course.topicRowsByLesson : []),
        learningActivityDays: Array.isArray(live.learningActivityDays)
          ? live.learningActivityDays
          : (Array.isArray(course?.learningActivityDays) ? course.learningActivityDays : []),
      };
    });
  }, [enrolledCourses, liveCourseStats]);
  const displayName = user?.onboarding?.profile?.nickname || user?.name || user?.given_name || '';
  const resolvedUserId = useMemo(() => {
    const candidates = [user?.user_id, user?.id, user?.studentId, user?.username]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return candidates[0] || null;
  }, [user?.user_id, user?.id, user?.studentId, user?.username]);
  const hasCourses = enrichedEnrolledCourses.length > 0;
  const hasProgress = enrichedEnrolledCourses.some(
    (course) => (course?.progress || 0) > 0 || (course?.completedQuizzes || 0) > 0
  );
  const isNewUser = !hasProgress;
  const shouldLoadLiveStats = ['courses', 'my-courses', 'browse', 'analysis', 'ai-recommend'].includes(activeTab);
  const statsLoading = user != null && !liveStatsResolved;
  const handleRequireAuth = useCallback((mode = 'login') => {
    if (onShowAuth) {
      onShowAuth(mode);
      return;
    }
    navigate('/');
  }, [navigate, onShowAuth]);

  const isEnrolled = (courseId) => {
    const normalizedCourseId = String(courseId || '').trim();
    return enrichedEnrolledCourses.some((course) => {
      const enrolledCourseId = String(course?.id || course?.course_id || '').trim();
      return enrolledCourseId && enrolledCourseId === normalizedCourseId;
    });
  };

  const loadAllCourses = useCallback(async () => {
    try {
      setLoadingAll(true);
      const data = await courseAPI.getAllCourses();
      const list = Array.isArray(data?.courses) ? data.courses : [];
      setAllCourses(list);
    } catch (e) {
      console.error('Failed to load all courses', e);
      setAllCourses([]);
    } finally {
      setLoadingAll(false);
    }
  }, []);

  const closeDialog = useCallback((result = false) => {
    if (dialogResolverRef.current) {
      dialogResolverRef.current(result);
      dialogResolverRef.current = null;
    }
    setDialogConfig(null);
  }, []);

  const openConfirmDialog = useCallback((payload = {}) => {
    return new Promise((resolve) => {
      dialogResolverRef.current = resolve;
      setDialogConfig({
        type: 'confirm',
        title: payload.title || 'ยืนยันการดำเนินการ',
        message: payload.message || '',
        confirmText: payload.confirmText || 'ตกลง',
        cancelText: payload.cancelText || 'ยกเลิก',
      });
    });
  }, []);

  const openInfoDialog = useCallback((payload = {}) => {
    dialogResolverRef.current = null;
    setDialogConfig({
      type: 'info',
      title: payload.title || 'แจ้งเตือน',
      message: payload.message || '',
      confirmText: payload.confirmText || 'OK',
    });
  }, []);

  const handleStartTrial = useCallback(async (course) => {
    let courseId = null;
    try {
      if (!user) {
        handleRequireAuth('login');
        return;
      }
      if (!resolvedUserId) {
        throw new Error('Unable to resolve user id');
      }
      courseId = course.course_id || course.id;
      const courseName = String(course?.name || course?.title || 'คอร์สนี้').trim();
      const confirmed = await openConfirmDialog(
        {
          title: `ยืนยันเริ่มทดลองเรียน "${courseName}"`,
          message:
            'รายละเอียดทดลองเรียน:\n' +
            '• ใช้สิทธิ์ได้ 1 ครั้งต่อบัญชี\n' +
            '• ใช้งานได้ 1 วัน (24 ชั่วโมง) นับจากกดยืนยัน\n' +
            '• เมื่อครบเวลา ระบบจะปิดสิทธิ์เข้าเรียนอัตโนมัติ\n' +
            '• เมื่อยืนยันแล้ว จะไม่สามารถทดลองเรียนซ้ำได้\n\n' +
            'ต้องการดำเนินการต่อหรือไม่?',
          confirmText: 'OK',
          cancelText: 'ยกเลิก',
        }
      );
      if (!confirmed) {
        return;
      }
      setEnrolling(prev => ({ ...prev, [courseId]: true }));
      await courseAPI.enroll(resolvedUserId, courseId, { mode: 'trial' });
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + (24 * 60 * 60 * 1000));
      // Optimistically append trial enrollment.
      const enrolled = {
        id: courseId,
        name: course.name,
        description: course.description,
        instructor: 'อาจารย์ระบบ',
        category: course.category || 'ทั่วไป',
        progress: 0,
        totalQuizzes: course.quiz_count || 0,
        completedQuizzes: 0,
        totalQuestions: 0,
        completedQuestions: 0,
        lastActivity: 'เริ่มทดลองเรียน',
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        enrollment_source: 'trial',
        enrollment_type: 'trial',
        trial_consumed_at: startedAt.toISOString(),
        trial_expires_at: expiresAt.toISOString(),
        is_trial: true,
        color: '#4ecdc4',
        image: '📚',
      };
      setEnrolledCoursesState((prev) => {
        if (prev.some((item) => String(item?.id || item?.course_id) === String(courseId))) {
          return prev;
        }
        return [...prev, enrolled];
      });
      setActiveTab('courses');
    } catch (e) {
      const message = String(e?.message || '');
      if (message.includes('TRIAL_ALREADY_USED')) {
        openInfoDialog({
          title: 'ไม่สามารถทดลองเรียนได้',
          message: 'บัญชีนี้ใช้สิทธิ์ทดลองเรียนไปแล้ว (ทดลองได้ 1 ครั้งต่อผู้ใช้)',
          confirmText: 'OK',
        });
        return;
      }
      if (message.includes('TRIAL_NOT_ALLOWED')) {
        openInfoDialog({
          title: 'ไม่สามารถทดลองเรียนได้',
          message: 'คอร์สนี้ไม่สามารถทดลองเรียนซ้ำได้',
          confirmText: 'OK',
        });
        return;
      }
      openInfoDialog({
        title: 'เกิดข้อผิดพลาด',
        message: 'เปิดทดลองเรียนไม่สำเร็จ กรุณาลองใหม่',
        confirmText: 'OK',
      });
    } finally {
      if (courseId) {
        setEnrolling(prev => ({ ...prev, [courseId]: false }));
      }
    }
  }, [handleRequireAuth, openConfirmDialog, openInfoDialog, resolvedUserId, user]);

  useEffect(() => {
    return () => {
      if (dialogResolverRef.current) {
        dialogResolverRef.current(false);
        dialogResolverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!dialogConfig) return undefined;
    const handleDialogEscape = (event) => {
      if (event.key === 'Escape') {
        closeDialog(false);
      }
    };
    document.addEventListener('keydown', handleDialogEscape);
    return () => document.removeEventListener('keydown', handleDialogEscape);
  }, [closeDialog, dialogConfig]);

  useEffect(() => {
    setEnrolledCoursesState(Array.isArray(user?.enrolledCourses) ? user.enrolledCourses : []);
  }, [user?.user_id, user?.id, user?.studentId, user?.username, user?.enrolledCourses]);

  useEffect(() => {
    const userId = resolvedUserId;
    if (!shouldLoadLiveStats) {
      setLiveStatsResolved(true);
      return;
    }

    if (!userId) {
      setLiveCourseStats({});
      setLiveStatsResolved(true);
      return;
    }

    let cancelled = false;
    setLiveStatsResolved(false);
    const run = async () => {
      try {
        try {
          const summary = await courseAPI.getDashboardLearningSummary(userId, {
            courseLimit: 50,
          });
          const summaryCourses = Array.isArray(summary?.courses) ? summary.courses : [];
          const summaryStats = summary?.course_stats && typeof summary.course_stats === 'object'
            ? summary.course_stats
            : {};
          if (!cancelled) {
            setEnrolledCoursesState(summaryCourses);
            setLiveCourseStats(summaryStats);
            setLiveStatsResolved(true);
          }
          return;
        } catch (summaryError) {
          console.warn('Dashboard learning summary unavailable; falling back to legacy stats loading.', summaryError);
          if (process.env.NODE_ENV === 'production') {
            if (!cancelled) {
              setLiveCourseStats({});
              setLiveStatsResolved(true);
            }
            return;
          }
        }

        let fallbackCourses = [];
        try {
          const enrolledData = await courseAPI.getUserCourses(userId);
          fallbackCourses = Array.isArray(enrolledData) ? enrolledData : [];
          if (!cancelled) {
            setEnrolledCoursesState(fallbackCourses);
          }
        } catch (enrollmentError) {
          console.error('Failed to sync enrolled courses during dashboard fallback', enrollmentError);
          fallbackCourses = [];
        }

        if (fallbackCourses.length === 0) {
          if (!cancelled) {
            setLiveCourseStats({});
            setLiveStatsResolved(true);
          }
          return;
        }

        const candidateUserIds = Array.from(
          new Set(
            [user?.user_id, user?.id, user?.studentId, user?.username]
              .map((value) => String(value || '').trim())
              .filter(Boolean)
          )
        );
        const accessUserId = userId || candidateUserIds[0] || '';

        const loadQuizResultsForUser = async () => {
          for (const candidateId of candidateUserIds) {
            try {
              const response = await courseAPI.getUserQuizResults(candidateId);
              const results = toArray(response, 'results');
              if (results.length > 0) {
                return results;
              }
            } catch (error) {
              console.warn(`Failed to load quiz results for identifier: ${candidateId}`, error);
            }
          }
          return [];
        };

        const [allResults, courseEntries] = await Promise.all([
          loadQuizResultsForUser(),
          Promise.all(
            fallbackCourses.map(async (course) => {
              const courseId = course?.id || course?.course_id;
              if (!courseId) return null;
              const courseExpired = isCourseExpiredRecord(course);
              const protectedAccessUserId = courseExpired ? undefined : (accessUserId || undefined);

              const runWithOptionalUserAccess = async (requestWithUser, requestWithoutUser) => {
                if (!protectedAccessUserId) {
                  return requestWithoutUser();
                }
                try {
                  return await requestWithUser();
                } catch (error) {
                  const errorMessage = String(error?.message || '').toUpperCase();
                  const shouldRetryWithoutUser =
                    errorMessage.includes('401') ||
                    errorMessage.includes('403') ||
                    errorMessage.includes('COURSE_ACCESS_DENIED') ||
                    errorMessage.includes('COURSE_EXPIRED') ||
                    errorMessage.includes('COULD NOT VALIDATE CREDENTIALS');
                  if (!shouldRetryWithoutUser) {
                    throw error;
                  }
                  return requestWithoutUser();
                }
              };

              const [quizzesResult, lessonsResult] = await Promise.allSettled([
                runWithOptionalUserAccess(
                  () => courseAPI.getQuizzesByCourse(courseId, {
                    userId: protectedAccessUserId,
                    pageSize: 200,
                    sort: 'latest',
                  }),
                  () => courseAPI.getQuizzesByCourse(courseId, {
                    pageSize: 200,
                    sort: 'latest',
                  })
                ),
                runWithOptionalUserAccess(
                  () => courseAPI.getCourseLessons(courseId, {
                    userId: protectedAccessUserId,
                  }),
                  () => courseAPI.getCourseLessons(courseId)
                ),
              ]);

              const allCourseQuizzes = quizzesResult.status === 'fulfilled'
                ? toArray(quizzesResult.value, 'quizzes')
                : [];
              const regularQuizzes = allCourseQuizzes.filter(
                (quiz) => String(quiz?.document_type || '').toLowerCase() !== 'mock_exam'
              );
              const lessons = lessonsResult.status === 'fulfilled'
                ? toArray(lessonsResult.value, 'lessons')
                : [];
              const lessonRows = [...lessons]
                .sort((a, b) => {
                  const aOrder = Number(a?.order);
                  const bOrder = Number(b?.order);
                  const left = Number.isFinite(aOrder) ? aOrder : 0;
                  const right = Number.isFinite(bOrder) ? bOrder : 0;
                  return left - right;
                })
                .map((lesson, lessonIndex) => {
                  const lessonId = normalizeLessonId(lesson?.id || lesson?.lesson_id);
                  if (!lessonId) return null;
                  return {
                    id: lessonId,
                    name: getLessonName(lesson, lessonIndex),
                    order: Number.isFinite(Number(lesson?.order)) ? Number(lesson?.order) : (lessonIndex + 1),
                  };
                })
                .filter(Boolean);
              const lessonNameById = lessonRows.reduce((acc, lesson) => {
                acc[lesson.id] = lesson.name;
                return acc;
              }, {});
              const quizToLessonId = {};
              lessons.forEach((lesson) => {
                const lessonId = normalizeLessonId(lesson?.id || lesson?.lesson_id);
                if (!lessonId) return;
                const quizRefs = [
                  ...(Array.isArray(lesson?.quizzes) ? lesson.quizzes : []),
                  ...(Array.isArray(lesson?.selected_quizzes) ? lesson.selected_quizzes : []),
                  ...(Array.isArray(lesson?.selectedQuizzes) ? lesson.selectedQuizzes : []),
                ];
                quizRefs.forEach((quiz) => {
                  const ids = [quiz?.quiz_id, quiz?.id, quiz?.document_id];
                  ids.forEach((rawId) => {
                    const quizId = String(rawId || '').trim();
                    if (quizId) {
                      quizToLessonId[quizId] = lessonId;
                    }
                  });
                });
              });

              return {
                courseId,
                totalLessons: lessons.length,
                lessonRows,
                lessonNameById,
                quizToLessonId,
                quizIds: allCourseQuizzes
                  .map((quiz) => quiz?.quiz_id || quiz?.id || quiz?.document_id)
                  .filter(Boolean),
                quizDifficultyById: regularQuizzes.reduce((acc, quiz) => {
                  const quizId = quiz?.quiz_id || quiz?.id || quiz?.document_id;
                  if (!quizId) return acc;
                  acc[String(quizId)] = toDifficultyLabelFromQuiz(quiz);
                  return acc;
                }, {}),
                quizKindById: regularQuizzes.reduce((acc, quiz) => {
                  const quizId = quiz?.quiz_id || quiz?.id || quiz?.document_id;
                  if (!quizId) return acc;
                  acc[String(quizId)] = detectQuizKind(quiz);
                  return acc;
                }, {}),
                quizTopicById: allCourseQuizzes.reduce((acc, quiz) => {
                  const quizId = quiz?.quiz_id || quiz?.id || quiz?.document_id;
                  if (!quizId) return acc;
                  const topicLabel = toTopicLabel(
                    quiz?.topic_tag,
                    quiz?.topicTag,
                    quiz?.topic,
                    quiz?.category,
                    quiz?.subject
                  );
                  if (topicLabel) {
                    acc[String(quizId)] = topicLabel;
                  }
                  return acc;
                }, {}),
                allQuizKindById: allCourseQuizzes.reduce((acc, quiz) => {
                  const quizId = quiz?.quiz_id || quiz?.id || quiz?.document_id;
                  if (!quizId) return acc;
                  acc[String(quizId)] = detectQuizKind(quiz);
                  return acc;
                }, {}),
                totalQuizzes: regularQuizzes.length,
              };
            })
          ),
        ]);
        const stats = {};
        const weekStartMs = Date.now() - (7 * 24 * 60 * 60 * 1000);

        courseEntries
          .filter(Boolean)
          .forEach((entry) => {
            const normalizedCourseId = String(entry.courseId || '');
            const allowedQuizIds = new Set((entry.quizIds || []).map((id) => String(id)));
            const courseResults = allResults.filter((item) => {
              const resultCourseId = String(item?.course_id || '');
              const resultQuizId = String(item?.quiz_id || '');
              if (resultCourseId && resultCourseId === normalizedCourseId) return true;
              if (resultQuizId && allowedQuizIds.has(resultQuizId)) return true;
              return false;
            });
            const timeSpentSecondsThisWeek = courseResults.reduce((sum, item) => {
              const seconds = Math.max(
                0,
                toNumber(item?.time_spent_seconds, item?.total_time_spent_seconds)
              );
              if (seconds <= 0) return sum;

              const rawTimestamp = item?.submitted_at || item?.updated_at || item?.created_at;
              const timestampMs = rawTimestamp ? new Date(rawTimestamp).getTime() : NaN;
              const isRecent = !Number.isFinite(timestampMs) || timestampMs >= weekStartMs;
              return isRecent ? sum + seconds : sum;
            }, 0);
            const attemptedQuizIds = new Set(
              courseResults
                .map((item) => item?.quiz_id)
                .filter(Boolean)
            );
            const questionAttempts = courseResults.reduce(
              (sum, item) => sum + toNumber(item?.total_questions),
              0
            );
            const correctAnswers = courseResults.reduce(
              (sum, item) => sum + toNumber(item?.correct_count),
              0
            );
            const attemptedLessonIds = new Set();
            const difficultyBuckets = {
              easy: { correct: 0, total: 0 },
              medium: { correct: 0, total: 0 },
              hard: { correct: 0, total: 0 },
            };
            const scoreBuckets = {
              lesson: { correct: 0, total: 0 },
              mockExam: { correct: 0, total: 0 },
            };
            const topicBuckets = {};
            const lessonTopicBuckets = {};
            const addTopicStat = (bucket, topicLabel, total, correct) => {
              if (!bucket[topicLabel]) {
                bucket[topicLabel] = { topic: topicLabel, total: 0, correct: 0 };
              }
              bucket[topicLabel].total += total;
              bucket[topicLabel].correct += correct;
            };
            const addLessonTopicStat = (lessonId, topicLabel, total, correct) => {
              const groupKey = lessonId || '__unassigned__';
              const lessonMeta = (entry.lessonRows || []).find((lesson) => lesson.id === lessonId);
              if (!lessonTopicBuckets[groupKey]) {
                lessonTopicBuckets[groupKey] = {
                  lessonId: lessonId || null,
                  lessonName: (lessonId && entry.lessonNameById?.[lessonId]) || 'ไม่ระบุบท',
                  lessonOrder: lessonMeta?.order ?? Number.MAX_SAFE_INTEGER,
                  topics: {},
                };
              }
              addTopicStat(lessonTopicBuckets[groupKey].topics, topicLabel, total, correct);
            };
            let scoredAttemptCount = 0;
            const lessonBuckets = {};
            (entry.lessonRows || []).forEach((lesson) => {
              lessonBuckets[lesson.id] = {
                id: lesson.id,
                name: lesson.name,
                order: lesson.order,
                minutes: 0,
                lesson: { correct: 0, total: 0 },
                mockExam: { correct: 0, total: 0 },
              };
            });
            courseResults.forEach((item) => {
              const attemptStats = getAttemptStats(item);
              if (!attemptStats) return;
              scoredAttemptCount += 1;
              const totalQuestions = attemptStats.total;
              const correctCount = attemptStats.correct;

              const mappedDifficulty = entry.quizDifficultyById?.[String(item?.quiz_id)] ||
                toDifficultyLabel(item?.difficulty || item?.level_difficulty || item?.difficulty_level);
              const bucketKey = mappedDifficulty === 'ง่าย'
                ? 'easy'
                : mappedDifficulty === 'ยาก'
                ? 'hard'
                : mappedDifficulty === 'กลาง'
                ? 'medium'
                : null;
              if (bucketKey) {
                difficultyBuckets[bucketKey].total += totalQuestions;
                difficultyBuckets[bucketKey].correct += correctCount;
              }

              const kind = entry.allQuizKindById?.[String(item?.quiz_id)] || detectQuizKind(item);
              const kindKey = kind === 'mock_exam' ? 'mockExam' : 'lesson';
              const isLessonPractice = kindKey === 'lesson';
              scoreBuckets[kindKey].total += totalQuestions;
              scoreBuckets[kindKey].correct += correctCount;

              const explicitLessonId = normalizeLessonId(item?.lesson_id || item?.lessonId);
              const quizMappedLessonId = normalizeLessonId(entry.quizToLessonId?.[String(item?.quiz_id || '')]);
              const mappedLessonId = explicitLessonId && entry.lessonNameById?.[explicitLessonId]
                ? explicitLessonId
                : (quizMappedLessonId || explicitLessonId);
              const hasKnownLesson = Boolean(mappedLessonId && lessonBuckets[mappedLessonId]);

              const fallbackTopicLabel = toTopicLabel(
                item?.topic_tag,
                item?.topicTag,
                item?.topic,
                item?.subject_tag,
                entry.quizTopicById?.[String(item?.quiz_id || '')]
              ) || 'ไม่ระบุหัวข้อ';
              const questionInsights = Array.isArray(item?.question_insights) ? item.question_insights : [];
              const answeredQuestionInsights = questionInsights.filter(
                (question) => question?.is_correct === true || question?.is_correct === false
              );
              if (answeredQuestionInsights.length > 0) {
                answeredQuestionInsights.forEach((question) => {
                  const topicLabel = resolveQuestionTopicLabel(question, fallbackTopicLabel);
                  const correctValue = question?.is_correct === true ? 1 : 0;
                  addTopicStat(topicBuckets, topicLabel, 1, correctValue);
                  if (isLessonPractice && hasKnownLesson) {
                    addLessonTopicStat(mappedLessonId, topicLabel, 1, correctValue);
                  }
                });
              } else if (totalQuestions > 0) {
                addTopicStat(topicBuckets, fallbackTopicLabel, totalQuestions, correctCount);
                if (isLessonPractice && hasKnownLesson) {
                  addLessonTopicStat(mappedLessonId, fallbackTopicLabel, totalQuestions, correctCount);
                }
              }

              if (hasKnownLesson) {
                attemptedLessonIds.add(mappedLessonId);
                lessonBuckets[mappedLessonId][kindKey].total += totalQuestions;
                lessonBuckets[mappedLessonId][kindKey].correct += correctCount;

                const seconds = Math.max(0, toNumber(item?.time_spent_seconds, item?.total_time_spent_seconds));
                if (seconds > 0) {
                  lessonBuckets[mappedLessonId].minutes += (seconds / 60);
                }
              }
            });
            const lessonRows = Object.values(lessonBuckets)
              .sort((a, b) => {
                const orderDiff = (a.order || 0) - (b.order || 0);
                if (orderDiff !== 0) return orderDiff;
                return String(a.name || '').localeCompare(String(b.name || ''), 'th');
              })
              .map((lesson) => ({
                id: lesson.id,
                name: lesson.name,
                scoreSplit: {
                  lesson: lesson.lesson.total > 0
                    ? Math.round((lesson.lesson.correct / lesson.lesson.total) * 100)
                    : null,
                  mockExam: lesson.mockExam.total > 0
                    ? Math.round((lesson.mockExam.correct / lesson.mockExam.total) * 100)
                    : null,
                },
                minutes: lesson.minutes > 0 ? Math.round(lesson.minutes) : 0,
              }));
            const attemptRows = courseResults
              .map((item, index) => {
                const attemptStats = getAttemptStats(item);
                if (!attemptStats || attemptStats.total <= 0) return null;
                const submittedAtRaw = item?.submitted_at || item?.updated_at || item?.created_at || null;
                const submittedAtMs = submittedAtRaw ? new Date(submittedAtRaw).getTime() : NaN;
                const safeScore = Math.max(
                  0,
                  Math.min(100, Math.round((attemptStats.correct / attemptStats.total) * 100))
                );
                return {
                  id: `${entry.courseId}-${item?.result_id || item?.id || item?.quiz_id || index}`,
                  score: safeScore,
                  submittedAt: submittedAtRaw || null,
                  submittedAtMs: Number.isFinite(submittedAtMs) ? submittedAtMs : 0,
                  quizTitle: String(item?.quiz_title || item?.quiz_name || item?.title || '').trim(),
                  sequence: index + 1,
                };
              })
              .filter(Boolean)
              .sort((a, b) => {
                if (a.submittedAtMs > 0 && b.submittedAtMs > 0) return a.submittedAtMs - b.submittedAtMs;
                if (a.submittedAtMs > 0) return -1;
                if (b.submittedAtMs > 0) return 1;
                return a.sequence - b.sequence;
              })
              .map((row, index) => {
                const label = row.submittedAtMs > 0
                  ? new Date(row.submittedAtMs).toLocaleDateString('th-TH', {
                    day: '2-digit',
                    month: '2-digit',
                  })
                  : `ครั้งที่ ${index + 1}`;
                return {
                  ...row,
                  label,
                  attemptIndex: index + 1,
                };
              });
            const topicRows = Object.values(topicBuckets)
              .filter((topic) => topic.total > 0)
              .map((topic) => ({
                id: `${entry.courseId}-${topic.topic}`,
                topic: topic.topic,
                total: topic.total,
                correct: topic.correct,
                accuracy: Math.round((topic.correct / topic.total) * 100),
              }))
              .sort((a, b) => {
                const volumeDiff = b.total - a.total;
                if (volumeDiff !== 0) return volumeDiff;
                if (a.topic === 'ไม่ระบุหัวข้อ') return 1;
                if (b.topic === 'ไม่ระบุหัวข้อ') return -1;
                return String(a.topic || '').localeCompare(String(b.topic || ''), 'th');
              });
            const topicRowsByLesson = Object.values(lessonTopicBuckets)
              .map((group) => {
                const topics = Object.values(group.topics || {})
                  .filter((topic) => topic.total > 0)
                  .map((topic) => ({
                    id: `${entry.courseId}-${group.lessonId || 'unassigned'}-${topic.topic}`,
                    topic: topic.topic,
                    total: topic.total,
                    correct: topic.correct,
                    accuracy: Math.round((topic.correct / topic.total) * 100),
                  }))
                  .sort((a, b) => {
                    const volumeDiff = b.total - a.total;
                    if (volumeDiff !== 0) return volumeDiff;
                    if (a.topic === 'ไม่ระบุหัวข้อ') return 1;
                    if (b.topic === 'ไม่ระบุหัวข้อ') return -1;
                    return String(a.topic || '').localeCompare(String(b.topic || ''), 'th');
                  });
                return {
                  lessonId: group.lessonId,
                  lessonName: group.lessonName,
                  lessonOrder: group.lessonOrder,
                  topics,
                };
              })
              .filter((group) => group.topics.length > 0)
              .sort((a, b) => {
                const orderDiff = (a.lessonOrder || Number.MAX_SAFE_INTEGER) - (b.lessonOrder || Number.MAX_SAFE_INTEGER);
                if (orderDiff !== 0) return orderDiff;
                return String(a.lessonName || '').localeCompare(String(b.lessonName || ''), 'th');
              });
            const difficultyScore = {
              easy: difficultyBuckets.easy.total > 0
                ? Math.round((difficultyBuckets.easy.correct / difficultyBuckets.easy.total) * 100)
                : null,
              medium: difficultyBuckets.medium.total > 0
                ? Math.round((difficultyBuckets.medium.correct / difficultyBuckets.medium.total) * 100)
                : null,
              hard: difficultyBuckets.hard.total > 0
                ? Math.round((difficultyBuckets.hard.correct / difficultyBuckets.hard.total) * 100)
                : null,
            };
            const totalDifficultyQuestions =
              difficultyBuckets.easy.total + difficultyBuckets.medium.total + difficultyBuckets.hard.total;
            const totalDifficultyCorrect =
              difficultyBuckets.easy.correct + difficultyBuckets.medium.correct + difficultyBuckets.hard.correct;
            const scoreSplit = {
              lesson: scoreBuckets.lesson.total > 0
                ? Math.round((scoreBuckets.lesson.correct / scoreBuckets.lesson.total) * 100)
                : null,
              mockExam: scoreBuckets.mockExam.total > 0
                ? Math.round((scoreBuckets.mockExam.correct / scoreBuckets.mockExam.total) * 100)
                : null,
            };
            const completedQuizzes = attemptedQuizIds.size;
            const totalQuizzes = entry.totalQuizzes;
            const progress = totalQuizzes > 0
              ? Math.round((completedQuizzes / totalQuizzes) * 100)
              : toNumber(
                  fallbackCourses.find((course) => String(course?.id || course?.course_id) === String(entry.courseId))?.progress
                );
            const lastSubmittedAt = courseResults
              .map((item) => item?.submitted_at)
              .filter(Boolean)
              .sort()
              .slice(-1)[0];

            stats[entry.courseId] = {
              totalLessons: entry.totalLessons,
              completedLessons: attemptedLessonIds.size,
              totalQuizzes,
              completedQuizzes,
              totalQuestions: questionAttempts > 0 ? questionAttempts : scoredAttemptCount,
              completedQuestions: questionAttempts > 0 ? correctAnswers : scoredAttemptCount,
              lessonRows,
              attemptRows,
              topicRows,
              topicRowsByLesson,
              minutesThisWeek: timeSpentSecondsThisWeek > 0
                ? Math.ceil(timeSpentSecondsThisWeek / 60)
                : 0,
              progress: Math.max(0, Math.min(100, progress)),
              averageScore: totalDifficultyQuestions > 0
                ? Math.round((totalDifficultyCorrect / totalDifficultyQuestions) * 100)
                : (questionAttempts > 0 ? Math.round((correctAnswers / questionAttempts) * 100) : 0),
              difficultyScore,
              scoreSplit,
              lastActivity: lastSubmittedAt || null,
            };
          });

        if (!cancelled) {
          setLiveCourseStats(stats);
          setLiveStatsResolved(true);
        }
      } catch (error) {
        console.error('Failed to load live course stats for dashboard analysis:', error);
        if (!cancelled) {
          setLiveStatsResolved(true);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [shouldLoadLiveStats, resolvedUserId, user?.user_id, user?.id, user?.studentId, user?.username]);

  useEffect(() => {
    const shortcutHandler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcutHandler);
    return () => window.removeEventListener('keydown', shortcutHandler);
  }, []);

  useEffect(() => {
    if (searchParams.toString()) {
      setActiveTab('browse');
      if (allCourses.length === 0) loadAllCourses();
    }
  }, [searchParams, allCourses.length, loadAllCourses]);

  useEffect(() => {
    if (activeTab === 'browse' && allCourses.length === 0) {
      loadAllCourses();
    }
  }, [activeTab, allCourses.length, loadAllCourses]);

  useEffect(() => {
    if (activeTab === 'my-courses' && enrichedEnrolledCourses.length > 0 && allCourses.length === 0) {
      loadAllCourses();
    }
  }, [activeTab, enrichedEnrolledCourses.length, allCourses.length, loadAllCourses]);

  useEffect(() => {
    const requestedTab = location.state?.activeTab;
    if (!requestedTab) return;
    if (requestedTab === 'browse') {
      setActiveTab('browse');
      if (allCourses.length === 0) loadAllCourses();
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (requestedTab === 'analysis') {
      setActiveTab('analysis');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (requestedTab === 'ai-recommend') {
      setActiveTab('ai-recommend');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (requestedTab === 'my-courses') {
      setActiveTab('my-courses');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (requestedTab === 'settings') {
      setActiveTab('settings');
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (requestedTab === 'courses') {
      setActiveTab('courses');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, allCourses.length, loadAllCourses]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [
    searchQuery,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    const qParam = searchParams.get('q') || '';

    setSearchInput((prev) => (prev === qParam ? prev : qParam));
    setSearchQuery((prev) => (prev === qParam ? prev : qParam));
  }, [
    searchParams,
  ]);

  const getNextCourse = () => {
    return (
      enrichedEnrolledCourses.find((course) => (course?.progress || 0) > 0) ||
      enrichedEnrolledCourses[0] ||
      null
    );
  };

  const nextCourse = getNextCourse();
  const nextLessonTitle =
    nextCourse?.nextLessonTitle ||
    nextCourse?.next_lesson_title ||
    nextCourse?.nextLesson ||
    nextCourse?.next_lesson ||
    'บทเรียนถัดไป';
  const nextCourseTitle = nextCourse?.name || nextCourse?.title || 'คอร์สเรียน';
  const nextCourseSubject = String(nextCourse?.subject || nextCourse?.category || '').trim();
  const nextCourseGrade = String(nextCourse?.grade || nextCourse?.target_profile || '').trim();
  const continueTopLabel = [nextCourseGrade, nextCourseSubject].filter(Boolean).join(' ') || 'คอร์สที่กำลังเรียน';
  const nextCourseCompletedLessons = Math.max(0, Math.round(Number(nextCourse?.completedLessons || 0)));
  const nextCourseTotalLessons = Math.max(1, Math.round(Number(nextCourse?.totalLessons || 0)));
  const nextCourseProgressPercent = Math.max(0, Math.min(100, Math.round(Number(nextCourse?.progress || 0))));
  const activeCourseLabel = hasCourses ? truncateText(nextCourseTitle, 24) : 'ยังไม่มีคอร์สที่ลงทะเบียน';

  const heroHeadline = hasCourses
    ? 'อีกนิดเดียว เก่งขึ้นแน่นอน!'
    : 'เริ่มสร้างความมั่นใจจากคอร์สแรกของคุณ';
  const heroMessage = hasCourses
    ? 'ลองทำแบบฝึกหัดเพิ่มเติม เพื่อทบทวนความเข้าใจและเพิ่มคะแนน'
    : 'เลือกวิชาที่อยากพัฒนาก่อน แล้วเริ่มได้ทันที';

  const stats = useMemo(() => {
    const minutesThisWeek = enrichedEnrolledCourses.reduce(
      (sum, course) =>
        sum +
        (course?.minutesThisWeek ||
          course?.minutes_this_week ||
          course?.minutesSpent ||
          0),
      0
    );
    const completedQuizzes = enrichedEnrolledCourses.reduce(
      (sum, course) => sum + (course?.completedQuizzes || 0),
      0
    );
    const totalQuizzes = enrichedEnrolledCourses.reduce(
      (sum, course) => sum + toNumber(course?.totalQuizzes, course?.total_quizzes, course?.quiz_count),
      0
    );
    const completedLessons = enrichedEnrolledCourses.reduce(
      (sum, course) => sum + toNumber(course?.completedLessons, course?.completedLessonsCount),
      0
    );
    const totalLessons = enrichedEnrolledCourses.reduce(
      (sum, course) => sum + toNumber(course?.totalLessons, course?.lessons_count, course?.lesson_count),
      0
    );
    const averageProgress = enrichedEnrolledCourses.length
      ? Math.round(
          enrichedEnrolledCourses.reduce((sum, course) => sum + (course?.progress || 0), 0) /
            enrichedEnrolledCourses.length
        )
      : 0;
    const exerciseScores = enrichedEnrolledCourses
      .map((course) => Number(course?.scoreSplit?.lesson))
      .filter((score) => Number.isFinite(score));
    const averageExerciseScore = exerciseScores.length
      ? Math.round(exerciseScores.reduce((sum, score) => sum + score, 0) / exerciseScores.length)
      : 0;
    const activeDayKeys = new Set();
    const addActiveDay = (value) => {
      const dayKey = toLocalDayKey(value);
      if (dayKey) {
        activeDayKeys.add(dayKey);
      }
    };

    enrichedEnrolledCourses.forEach((course) => {
      const attempts = Array.isArray(course?.attemptRows) ? course.attemptRows : [];
      attempts.forEach((attempt) => {
        const submittedAtMs = Number(attempt?.submittedAtMs);
        addActiveDay(
          Number.isFinite(submittedAtMs) && submittedAtMs > 0
            ? submittedAtMs
            : attempt?.submittedAt
        );
      });
      if (Array.isArray(course?.learningActivityDays)) {
        course.learningActivityDays.forEach(addActiveDay);
      }
      addActiveDay(course?.lastActivity || course?.last_activity);
    });

    const latestLessonActivity = readLatestLessonActivity({ user });
    if (Array.isArray(latestLessonActivity?.activityDays)) {
      latestLessonActivity.activityDays.forEach(addActiveDay);
    } else {
      addActiveDay(latestLessonActivity?.updatedAt);
    }

    const todayKey = toLocalDayKey(new Date());
    const yesterdayKey = addDaysToDayKey(todayKey, -1);
    const hasTodayActivity = Boolean(todayKey && activeDayKeys.has(todayKey));
    const hasYesterdayActivity = Boolean(
      !hasTodayActivity && yesterdayKey && activeDayKeys.has(yesterdayKey)
    );

    let streakDays = 0;
    let cursorKey = hasTodayActivity
      ? todayKey
      : hasYesterdayActivity
        ? yesterdayKey
        : null;

    while (cursorKey) {
      if (!activeDayKeys.has(cursorKey)) break;
      streakDays += 1;
      cursorKey = addDaysToDayKey(cursorKey, -1);
    }

    const weekStartKey = addDaysToDayKey(todayKey, -((getWeekdayIndexFromDayKey(todayKey) + 6) % 7));
    const weekActivity = WEEKDAY_LABELS.map((label, index) => {
      const dayKey = addDaysToDayKey(weekStartKey, index);
      const isActive = Boolean(dayKey && activeDayKeys.has(dayKey));
      const isToday = Boolean(dayKey && dayKey === todayKey);
      return {
        label,
        dayKey,
        isActive,
        isToday,
      };
    });

    return {
      minutesThisWeek,
      completedQuizzes,
      totalQuizzes,
      completedLessons,
      totalLessons,
      averageProgress,
      averageExerciseScore,
      hasExerciseScore: exerciseScores.length > 0,
      consistency: {
        streakDays,
        hasTodayActivity,
        weekActivity,
      },
    };
  }, [enrichedEnrolledCourses, user]);
  const statsUpdatedLabel = useMemo(() => {
    try {
      const timeLabel = new Intl.DateTimeFormat('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());
      return `อัปเดตล่าสุด วันนี้ ${timeLabel}`;
    } catch (_) {
      return 'อัปเดตล่าสุด วันนี้';
    }
  }, []);

  useEffect(() => {
    if (enrichedEnrolledCourses.length === 0) {
      setSelectedMyCourseId(null);
      return;
    }
    const hasSelected = enrichedEnrolledCourses.some(
      (course) => String(course?.id || course?.course_id) === String(selectedMyCourseId || '')
    );
    if (hasSelected) return;
    const defaultCourse = enrichedEnrolledCourses.find((course) => (course?.progress || 0) > 0) || enrichedEnrolledCourses[0];
    setSelectedMyCourseId(defaultCourse?.id || defaultCourse?.course_id || null);
  }, [enrichedEnrolledCourses, selectedMyCourseId]);

  useEffect(() => {
    if (enrichedEnrolledCourses.length === 0) {
      setSelectedAiCourseId(null);
      return;
    }
    const hasSelected = enrichedEnrolledCourses.some(
      (course) => String(course?.id || course?.course_id) === String(selectedAiCourseId || '')
    );
    if (hasSelected) return;
    const defaultCourse = enrichedEnrolledCourses.find((course) => (course?.progress || 0) > 0) || enrichedEnrolledCourses[0];
    setSelectedAiCourseId(defaultCourse?.id || defaultCourse?.course_id || null);
  }, [enrichedEnrolledCourses, selectedAiCourseId]);

  const handlePrimaryCTA = () => {
    trackEvent('click_primary_cta', { source: 'hero' });
    if (!hasCourses) {
      setActiveTab('browse');
      if (allCourses.length === 0) loadAllCourses();
      return;
    }

    const nextCourseId = String(nextCourse?.id || nextCourse?.course_id || '').trim();
    const latestFromStorage = readLatestLessonActivity({ user });
    const latestCourseId = String(latestFromStorage?.courseId || '').trim();
    if (
      nextCourseId &&
      latestCourseId === nextCourseId &&
      latestFromStorage?.lessonId
    ) {
      navigate(`/course/${latestFromStorage.courseId}/lesson/${latestFromStorage.lessonId}`);
      return;
    }

    if (nextCourseId) {
      navigate(`/course/${nextCourseId}`);
    }
  };

  const handleBrowseCourses = () => {
    trackEvent('click_browse_courses');
    setActiveTab('browse');
    if (allCourses.length === 0) loadAllCourses();
  };

  const handleSelectTab = (tab) => {
    if (tab === 'browse') {
      handleBrowseCourses();
      return;
    }
    if (tab === 'ranking') {
      navigate('/ranking');
      return;
    }
    if (tab === 'analysis') {
      setActiveTab('analysis');
      return;
    }
    if (tab === 'ai-recommend') {
      setActiveTab('ai-recommend');
      return;
    }
    if (tab === 'my-courses') {
      setActiveTab('my-courses');
      return;
    }
    if (tab === 'settings') {
      setActiveTab('settings');
      return;
    }
    setActiveTab('courses');
  };

  const handleCourseStart = (course) => {
    if (!course) return;
    trackEvent('click_continue_course', { course_id: course.id || course.course_id });
    if (!user) {
      handleRequireAuth('login');
      return;
    }
    navigate(`/course/${course.id || course.course_id}`);
  };

  const handleCourseAnalysis = (course, options = {}) => {
    const courseId = course?.id || course?.course_id;
    if (!courseId) return;
    trackEvent('click_course_analysis', { course_id: courseId });
    if (!user) {
      handleRequireAuth('login');
      return;
    }
    navigate(`/course/${courseId}`, {
      state: {
        activeTab: 'analysis',
        ...(options?.practiceSet ? { practiceSet: options.practiceSet } : {}),
      },
    });
  };

  const handleOpenCourseTab = (course, tab = 'lessons') => {
    const courseId = course?.id || course?.course_id;
    if (!courseId) return;
    if (!user) {
      handleRequireAuth('login');
      return;
    }
    if (tab === 'analysis') {
      handleCourseAnalysis(course);
      return;
    }
    navigate(`/course/${courseId}`, { state: { activeTab: tab } });
  };

  const enrolledCourseMap = useMemo(() => {
    const map = new Map();
    enrichedEnrolledCourses.forEach((course) => {
      [
        course?.course_id,
        course?.id,
        course?._id,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((id) => map.set(id, course));
    });
    return map;
  }, [enrichedEnrolledCourses]);

  const hasConsumedTrial = useMemo(() => (
    enrichedEnrolledCourses.some(isTrialEnrollmentRecord)
  ), [enrichedEnrolledCourses]);

  const normalizedCourses = useMemo(() => {
    return allCourses.map((course) => {
      const id = String(course.course_id || course.id || '').trim();
      const enrolled = enrolledCourseMap.get(id);
      const rawTags = course.tags || course.tag || course.course_tags || [];
      const parsedTags = Array.isArray(rawTags)
        ? rawTags
        : rawTags
        ? rawTags.split(',').map((tag) => tag.trim())
        : [];
      const tags = parsedTags
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => {
          const lowered = item.toLowerCase();
          if (lowered === 'general' || lowered === 'basic' || lowered === 'ทั่วไป') {
            return DEFAULT_SUBJECT_LABEL;
          }
          return item;
        });
      const normalizedTags = tags.map((tag) => normalizeSubjectValue(tag));
      const subjectFromTags = normalizedTags.find((tag) => DEFAULT_SUBJECT_OPTIONS.includes(tag));
      const mappedCategory = CATEGORY_TO_SUBJECT[String(course.category || '').toLowerCase()] || null;
      const subject = normalizeSubjectValue(String(
        subjectFromTags ||
        course.subject ||
        mappedCategory ||
        course.subject_name ||
        DEFAULT_SUBJECT_LABEL
      ).trim());

      const gradeCandidates = [
        normalizeGradeValue(course.grade),
        normalizeGradeValue(course.exam),
        normalizeGradeValue(course.target),
        normalizeGradeValue(course.level),
        ...parseGradesFromText(course.target_profile),
        ...tags.map((tag) => normalizeGradeValue(tag)),
      ].filter(Boolean);
      const grade = gradeCandidates.find((item) => GRADE_LEVEL_OPTIONS.includes(item)) || 'ทั่วไป';
      const educationLevel = toEducationLevel(grade);
      const purposes = extractPurposes(course, tags);
      const difficulty = toDifficultyLabel(course.difficulty || course.level_difficulty) || 'กลาง';
      const durationMinutes = Number(
        course.duration ||
          course.total_duration ||
          course.total_minutes ||
          course.duration_minutes ||
          course.minutes
      );
      const durationBucket = toDurationBucket(durationMinutes);
      const lessonsCount =
        course.lessons_count ||
        course.lesson_count ||
        enrolled?.lessons_count ||
        enrolled?.totalLessons ||
        course.total_lessons ||
        0;
      const completedLessons =
        enrolled?.completedLessons ||
        enrolled?.completedLessonsCount ||
        enrolled?.completedQuizzes ||
        0;
      const progressPercent = enrolled?.progress
        ? Math.min(100, Math.max(0, Math.round(enrolled.progress)))
        : lessonsCount
        ? Math.min(100, Math.round((completedLessons / lessonsCount) * 100))
        : null;
      const progressText =
        lessonsCount && progressPercent !== null
          ? `ทำแล้ว ${Math.min(completedLessons, lessonsCount)}/${lessonsCount}`
          : null;
      if (!tags.length) {
        tags.push(DEFAULT_SUBJECT_LABEL);
      }
      const updatedAt = new Date(course.updated_at || course.updatedAt || course.created_at || Date.now());
      const teacher = course.teacher_name || course.instructor || course.teacher || enrolled?.instructor || enrolled?.teacher_name || 'อาจารย์ระบบ';
      const ratingValue = Number(course.rating || course.average_rating);
      const rating = Number.isNaN(ratingValue) ? null : ratingValue;
      const difficultyRank = difficulty === 'ง่าย' ? 1 : difficulty === 'กลาง' ? 2 : 3;
      const rawPrice = course.price ?? course.price_thb ?? course.tuition ?? null;
      const parsedPrice = rawPrice === null || rawPrice === undefined || rawPrice === ''
        ? null
        : Number(rawPrice);
      const isFree = !Number.isFinite(parsedPrice) || parsedPrice <= 0;
      const imageUrl = (course.thumbnail_url || course.thumbnailUrl || course.image_url || course.imageUrl || '').toString().trim() || null;
      const isPaidEnrollment = Boolean(enrolled && isPaidEnrollmentRecord(enrolled));

      return {
        id,
        raw: course,
        title: course.name || course.title || 'คอร์สไม่มีชื่อ',
        subject,
        grade,
        educationLevel,
        purposes,
        description: course.description || 'คอร์สนี้ช่วยปูพื้นฐานและเสริมความมั่นใจในการทำข้อสอบ',
        lessonsCount,
        durationMinutes: Number.isNaN(durationMinutes) ? null : durationMinutes,
        durationBucket,
        durationLabel: durationMinutes ? `${durationMinutes} นาที` : null,
        difficulty,
        difficultyRank,
        tags,
        updatedAt,
        teacher,
        rating,
        progressText,
        progressPercent,
        isEnrolled: Boolean(enrolled),
        isPurchased: isPaidEnrollment,
        canStart: Boolean(enrolled),
        audienceLabel: course.target_audience || course.audience || grade,
        imageUrl,
        price: isFree ? 0 : parsedPrice,
        priceLabel: isFree ? 'ฟรี' : `${parsedPrice.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`,
        recommendedScore: 0,
        trialUsed: hasConsumedTrial,
        onStartTrial: handleStartTrial,
        isEnrolling: Boolean(enrolling[course.course_id || course.id]),
      };
    });
  }, [allCourses, enrolledCourseMap, enrolling, handleStartTrial, hasConsumedTrial]);
  const normalizedCourseById = useMemo(() => {
    const map = new Map();
    normalizedCourses.forEach((course) => {
      const id = String(course?.id || '').trim();
      if (id) map.set(id, course);
    });
    return map;
  }, [normalizedCourses]);

  const filteredCourses = useMemo(() => {
    return normalizedCourses
      .map((course) => {
        const text = normalizeText(
          [
            course.title,
            course.subject,
            course.grade,
            course.educationLevel,
            course.purposes.join(' '),
            course.teacher,
            course.tags.join(' ')
          ].join(' ')
        );
        return { ...course, searchText: text };
      })
      .filter((course) => {
        if (searchQuery && !course.searchText.includes(normalizeText(searchQuery))) return false;
        if (selectedEducationLevels.length > 0 && !selectedEducationLevels.some((level) => normalizeText(level) === normalizeText(course.educationLevel))) return false;
        if (selectedPurposes.length > 0 && !selectedPurposes.some((purpose) => course.purposes.some((item) => normalizeText(item) === normalizeText(purpose)))) return false;
        if (selectedSubjects.length > 0 && !selectedSubjects.some((subject) => normalizeText(subject) === normalizeText(course.subject))) return false;
        return true;
      })
      .sort(sorters.newest);
  }, [
    normalizedCourses,
    searchQuery,
    selectedEducationLevels,
    selectedPurposes,
    selectedSubjects,
  ]);

  const availableSubjects = useMemo(() => {
    return DEFAULT_SUBJECT_OPTIONS.slice();
  }, []);

  const availableEducationLevels = useMemo(() => {
    return EDUCATION_LEVEL_OPTIONS.slice();
  }, []);

  const availablePurposes = useMemo(() => {
    return PURPOSE_OPTIONS.slice();
  }, []);

  const todayLabel = useMemo(() => formatThaiDate(new Date()), []);

  const handleOpenCourse = (courseId, startImmediately = false) => {
    if (!courseId) return;
    if (!user) {
      handleRequireAuth('login');
      return;
    }
    const enrolled = isEnrolled(courseId);
    if (startImmediately && enrolled) {
      navigate(`/course/${courseId}`);
      return;
    }
    navigate(`/course/${courseId}?view=payment`, { state: { forcePaymentDetails: true, fromBrowse: true } });
  };

  const selectedMyCourse = useMemo(() => {
    const selected = enrichedEnrolledCourses.find(
      (course) => String(course?.id || course?.course_id) === String(selectedMyCourseId || '')
    );
    return selected || enrichedEnrolledCourses[0] || null;
  }, [enrichedEnrolledCourses, selectedMyCourseId]);
  const selectedMyCourseImageUrl = useMemo(() => {
    const courseId = String(selectedMyCourse?.id || selectedMyCourse?.course_id || '').trim();
    if (courseId) {
      const fromCatalog = normalizedCourseById.get(courseId);
      const catalogImage = resolveCourseImageUrl(fromCatalog?.raw || fromCatalog);
      if (catalogImage) return catalogImage;
    }

    return resolveCourseImageUrl(selectedMyCourse);
  }, [normalizedCourseById, selectedMyCourse]);
  useEffect(() => {
    setMyCourseFocusImageLoadFailed(false);
  }, [selectedMyCourseImageUrl, selectedMyCourse?.id, selectedMyCourse?.course_id]);
  const showMyCourseFocusImage = Boolean(selectedMyCourseImageUrl) && !myCourseFocusImageLoadFailed;
  const myCourseFocusDisplayImageUrl = showMyCourseFocusImage
    ? selectedMyCourseImageUrl
    : defaultCourseCoverImage;
  const selectedMyCourseCatalog = useMemo(() => {
    const courseId = String(selectedMyCourse?.id || selectedMyCourse?.course_id || '').trim();
    if (!courseId) return null;
    return normalizedCourseById.get(courseId) || null;
  }, [normalizedCourseById, selectedMyCourse]);
  const selectedMyCourseTitle = String(
    selectedMyCourse?.name || selectedMyCourse?.title || 'คอร์สเรียน'
  ).trim();
  const selectedMyCourseSubject = normalizeSubjectValue(String(
    selectedMyCourseCatalog?.subject ||
    selectedMyCourse?.subject ||
    selectedMyCourse?.category ||
    selectedMyCourse?.subject_name ||
    DEFAULT_SUBJECT_LABEL
  ).trim());
  const selectedMyCourseGrade = normalizeGradeValue(
    selectedMyCourseCatalog?.grade ||
    selectedMyCourse?.grade ||
    selectedMyCourse?.target_profile ||
    selectedMyCourse?.targetProfile ||
    selectedMyCourse?.target_audience ||
    selectedMyCourse?.audience ||
    ''
  ) || 'ทั่วไป';
  const selectedMyCourseDescription = String(
    selectedMyCourseCatalog?.description ||
    selectedMyCourse?.description ||
    'คอร์สปูพื้นฐานและเทคนิคการทำโจทย์แบบเป็นขั้นตอน'
  ).trim();
  const selectedMyCourseTeacher = String(
    selectedMyCourseCatalog?.teacher ||
    selectedMyCourse?.teacher_name ||
    selectedMyCourse?.instructor ||
    selectedMyCourse?.teacher ||
    'ทีมผู้สอน'
  ).trim();
  const selectedMyCourseLessonsCount = Math.max(
    0,
    Math.round(
      Number(
        selectedMyCourse?.totalLessons ||
        selectedMyCourse?.lessons_count ||
        selectedMyCourse?.lesson_count ||
        selectedMyCourseCatalog?.lessonsCount ||
        0
      )
    )
  );
  const selectedMyCourseShortDescription = truncateText(selectedMyCourseDescription, 66);

  const myCourseTrendSeries = useMemo(() => {
    const attemptRows = Array.isArray(selectedMyCourse?.attemptRows) ? selectedMyCourse.attemptRows : [];
    const attemptScores = normalizeTrendSeriesLabels(
      attemptRows
        .filter((row) => Number.isFinite(row?.score))
        .slice(-7)
        .map((row, index) => ({
          value: Math.max(0, Math.min(100, Math.round(Number(row.score)))),
          label: row?.label || row?.submittedAt
            ? formatThaiShortDate(new Date(row?.submittedAt || Date.now()))
            : `ครั้งที่ ${index + 1}`,
        }))
    );

    if (attemptScores.length >= 2) {
      return attemptScores;
    }

    const lessonRows = Array.isArray(selectedMyCourse?.lessonRows) ? selectedMyCourse.lessonRows : [];
    const rowScores = normalizeTrendSeriesLabels(
      lessonRows
        .map((lesson, index) => {
          const lessonScore = Number.isFinite(lesson?.scoreSplit?.lesson) ? Number(lesson.scoreSplit.lesson) : null;
          const mockScore = Number.isFinite(lesson?.scoreSplit?.mockExam) ? Number(lesson.scoreSplit.mockExam) : null;
          const values = [lessonScore, mockScore].filter((value) => Number.isFinite(value));
          if (!values.length) return null;
          return {
            value: Math.max(0, Math.min(100, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length))),
            label: String(lesson?.name || `บทเรียน ${index + 1}`).trim(),
          };
        })
        .filter(Boolean)
        .slice(-7)
    );

    return rowScores;
  }, [selectedMyCourse]);

  const myCourseTrendChart = useMemo(() => {
    const width = 760;
    const height = 260;
    const padding = { top: 28, right: 24, bottom: 46, left: 52 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const yTickValues = [0, 25, 50, 75, 100];
    const domainMin = 0;
    const domainMax = 100;
    const yForValue = (value) => {
      const safeValue = Math.max(domainMin, Math.min(domainMax, Number(value) || 0));
      if (!Number.isFinite(domainMax - domainMin) || domainMax === domainMin) {
        return padding.top + (innerHeight / 2);
      }
      const ratio = (safeValue - domainMin) / (domainMax - domainMin);
      return padding.top + innerHeight - (ratio * innerHeight);
    };

    const points = myCourseTrendSeries.map((item, index) => {
      const ratio = myCourseTrendSeries.length <= 1 ? 0 : index / (myCourseTrendSeries.length - 1);
      const x = padding.left + (ratio * innerWidth);
      const y = yForValue(item.value);
      return { ...item, x, y };
    });
    const linePath = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
    const areaBaseY = yForValue(domainMin);
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x} ${areaBaseY} L ${points[0].x} ${areaBaseY} Z`
      : '';
    const yTicks = yTickValues.map((value) => ({ value, y: yForValue(value) }));
    return {
      width,
      height,
      padding,
      points,
      linePath,
      areaPath,
      yTicks,
    };
  }, [myCourseTrendSeries]);
  const hasMyCourseTrendData = myCourseTrendSeries.length >= 2;

  const myCourseFocusLesson = useMemo(() => {
    const rows = Array.isArray(selectedMyCourse?.lessonRows) ? selectedMyCourse.lessonRows : [];
    if (rows.length === 0) return null;
    const withScore = rows.map((lesson, index) => {
      const lessonScoreRaw = Number.isFinite(lesson?.scoreSplit?.lesson) ? Number(lesson.scoreSplit.lesson) : null;
      const mockScoreRaw = Number.isFinite(lesson?.scoreSplit?.mockExam) ? Number(lesson.scoreSplit.mockExam) : null;
      const values = [lessonScoreRaw, mockScoreRaw].filter((item) => Number.isFinite(item));
      const score = values.length ? Math.round(values.reduce((sum, item) => sum + item, 0) / values.length) : 100;
      return {
        id: lesson?.id || `lesson-${index}`,
        name: lesson?.name || `บทเรียน ${index + 1}`,
        score,
        lessonScore: Number.isFinite(lessonScoreRaw) ? Math.round(lessonScoreRaw) : null,
        mockScore: Number.isFinite(mockScoreRaw) ? Math.round(mockScoreRaw) : null,
        minutes: Math.max(0, Math.round(Number(lesson?.minutes || 0))),
        suggestion: getFocusSuggestion(score),
      };
    });
    withScore.sort((a, b) => a.score - b.score);
    return withScore[0] || null;
  }, [selectedMyCourse]);

  const myCourseKpis = useMemo(() => {
    const avgScore = Math.max(0, Math.min(100, Math.round(Number(selectedMyCourse?.averageScore || 0))));
    const difficulty = selectedMyCourse?.difficultyScore || {};
    const difficultyValues = [difficulty.easy, difficulty.medium, difficulty.hard]
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    const accuracy = difficultyValues.length
      ? Math.round(difficultyValues.reduce((sum, item) => sum + item, 0) / difficultyValues.length)
      : avgScore;
    return {
      avgScore,
      accuracy,
      totalQuizzes: Math.max(0, Math.round(Number(selectedMyCourse?.completedQuizzes || 0))),
      minutes: Math.max(0, Math.round(Number(selectedMyCourse?.minutesThisWeek || selectedMyCourse?.minutes_this_week || 0))),
    };
  }, [selectedMyCourse]);

  const isAiRecommendEmptyState = activeTab === 'ai-recommend' && !statsLoading && enrichedEnrolledCourses.length === 0;

  return (
    <div className="dashboard-page">
      <Header
        user={user}
        onLogout={logout}
        onShowAuth={onShowAuth}
        activeTab={user ? activeTab : undefined}
        onSelectTab={user ? handleSelectTab : undefined}
      />
      
      <main className={`dashboard-main ${activeTab === 'ai-recommend' ? 'ai-recommend-dashboard-main' : ''} ${isAiRecommendEmptyState ? 'ai-recommend-empty-dashboard-main' : ''}`}>
        <div className="dashboard-container">
          {user ? (
            <>
              {activeTab === 'courses' && (
                <>
                  <section className="dashboard-greeting-row">
                    <div>
                      <h1>สวัสดีครับ {displayName || 'ผู้ใช้'} 👋</h1>
                      <p>วันนี้พร้อมเรียนรู้และพัฒนาตัวเองแล้วนะ!</p>
                    </div>
                    <div className="dashboard-date-pill">
                      <CalendarDays size={18} strokeWidth={2.1} aria-hidden="true" />
                      <span>{todayLabel}</span>
                    </div>
                  </section>

                  <DashboardHeader
                    headline={heroHeadline}
                    message={heroMessage}
                    activeCourseLabel={activeCourseLabel}
                    averageProgress={stats.averageProgress}
                    completedQuizCount={stats.completedQuizzes}
                    onStartNow={handlePrimaryCTA}
                    loading={statsLoading}
                  />
                </>
              )}

              {/* Tab Content */}
              {activeTab === 'courses' && (
                <>
                  <StatsOrOnboarding
                    isNewUser={isNewUser}
                    stats={stats}
                    loading={statsLoading}
                    updatedLabel={statsUpdatedLabel}
                  />

                  <section className="dashboard-continue-section">
                    <h2>เรียนต่อจากเดิม</h2>
                    {statsLoading ? (
                      <ContinueCourseSkeleton />
                    ) : nextCourse ? (
                      <div className="dashboard-continue-card">
                        <div className="continue-course-icon" aria-hidden="true">
                          <Atom size={42} strokeWidth={2.1} />
                        </div>
                        <div className="continue-main">
                          <p className="continue-top-label">{continueTopLabel}</p>
                          <h3>{nextLessonTitle || 'บทเรียนถัดไป'}</h3>
                          <p className="continue-subtitle">{nextCourseTitle}</p>
                          <div className="continue-progress-row">
                            <div className="continue-progress-meta">
                              <span className="continue-badge">กำลังเรียน</span>
                              <p>กำลังทำ {Math.min(nextCourseCompletedLessons, nextCourseTotalLessons)} จาก {nextCourseTotalLessons} บท</p>
                            </div>
                            <div className="continue-progress-track">
                              <span style={{ width: `${nextCourseProgressPercent > 0 ? Math.max(4, nextCourseProgressPercent) : 0}%` }} />
                            </div>
                            <strong>{nextCourseProgressPercent}%</strong>
                          </div>
                        </div>
                        <button type="button" className="continue-action-btn" onClick={() => handleCourseStart(nextCourse)}>
                          เรียนต่อ →
                        </button>
                      </div>
                    ) : (
                      <div className="dashboard-continue-empty">
                        <p>ยังไม่มีคอร์สที่ลงทะเบียน</p>
                        <button type="button" onClick={handleBrowseCourses}>สำรวจคอร์สทั้งหมด</button>
                      </div>
                    )}
                  </section>

                </>
              )}

              {activeTab === 'my-courses' && (
                <section className="my-courses-section" aria-label="คอร์สของฉัน">
                  <header className="my-courses-header">
                    <div>
                      <h2>คอร์สของฉัน</h2>
                      <p>ภาพรวมการเรียนรู้ในแต่ละคอร์ส</p>
                    </div>
                  </header>

                  {statsLoading ? (
                    <MyCoursesSkeleton />
                  ) : enrichedEnrolledCourses.length === 0 ? (
                    <div className="my-courses-empty">
                      <h3>ยังไม่มีคอร์สที่ลงทะเบียน</h3>
                      <p>เริ่มเลือกคอร์สเพื่อดูความคืบหน้าและผลการเรียน</p>
                      <button type="button" onClick={handleBrowseCourses}>สำรวจคอร์สทั้งหมด</button>
                    </div>
                  ) : (
                    <>
                      <div className="my-course-card-grid">
                        {enrichedEnrolledCourses.map((course) => {
                          const courseId = course?.id || course?.course_id;
                          const active = String(courseId) === String(selectedMyCourse?.id || selectedMyCourse?.course_id || '');
                          const progress = Math.max(0, Math.min(100, Math.round(Number(course?.progress || 0))));
                          const totalQuizzes = Math.max(0, Math.round(toNumber(
                            course?.totalQuizzes,
                            course?.total_quizzes,
                            course?.quiz_count
                          )));
                          const completedQuizzes = Math.max(0, Math.round(toNumber(
                            course?.completedQuizzes,
                            course?.completed_quizzes
                          )));
                          return (
                            <button
                              key={courseId}
                              type="button"
                              className={`my-course-card ${active ? 'active' : ''}`}
                              onClick={() => setSelectedMyCourseId(courseId)}
                            >
                              <div className="my-course-card-head">
                                <h3>{course?.name || course?.title || 'คอร์สเรียน'}</h3>
                                <span className="my-course-status">{progress > 0 ? 'กำลังเรียน' : 'ยังไม่ได้เริ่ม'}</span>
                              </div>
                              <p>ความคืบหน้า {progress}%</p>
                              <div className="my-course-progress-track"><span style={{ width: `${progress}%` }} /></div>
                              <small>เรียนไปแล้ว {Math.min(completedQuizzes, totalQuizzes)} / {totalQuizzes} แบบฝึกหัด</small>
                            </button>
                          );
                        })}
                      </div>

                      <article className="my-course-overview">
                        <h3>ภาพรวมของคอร์ส: {selectedMyCourse?.name || selectedMyCourse?.title || 'คอร์สเรียน'}</h3>
                        <div className="my-course-kpi-grid">
                          <div className="my-kpi-card">
                            <span>คะแนนเฉลี่ย</span>
                            <strong>{myCourseKpis.avgScore}%</strong>
                          </div>
                          <div className="my-kpi-card">
                            <span>ความแม่นยำ</span>
                            <strong>{myCourseKpis.accuracy}%</strong>
                          </div>
                          <div className="my-kpi-card">
                            <span>ทำข้อสอบทั้งหมด</span>
                            <strong>{myCourseKpis.totalQuizzes} ชุด</strong>
                          </div>
                          <div className="my-kpi-card">
                            <span>เวลาเรียนสัปดาห์นี้</span>
                            <strong>{myCourseKpis.minutes} นาที</strong>
                          </div>
                        </div>

                        <div className="my-course-bottom-grid">
                          <div className="my-course-chart-card">
                            <div className="my-course-chart-head">
                              <h4>พัฒนาการของคะแนน</h4>
                              <button type="button" className="my-course-chart-range">
                                7 วันที่ผ่านมา ▼
                              </button>
                            </div>
                            {hasMyCourseTrendData ? (
                              <div className="my-course-chart">
                                <svg
                                  className="my-course-chart-svg"
                                  viewBox={`0 0 ${myCourseTrendChart.width} ${myCourseTrendChart.height}`}
                                  role="img"
                                  aria-label="กราฟพัฒนาการของคะแนนใน 7 วันที่ผ่านมา"
                                >
                                  <defs>
                                    <linearGradient id="my-course-area-gradient" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#4d88e8" stopOpacity="0.22" />
                                      <stop offset="100%" stopColor="#4d88e8" stopOpacity="0.04" />
                                    </linearGradient>
                                  </defs>

                                  {myCourseTrendChart.yTicks.map((tick) => (
                                    <g key={`tick-${tick.value}`}>
                                      <line
                                        x1={myCourseTrendChart.padding.left}
                                        x2={myCourseTrendChart.width - myCourseTrendChart.padding.right}
                                        y1={tick.y}
                                        y2={tick.y}
                                        className="my-course-chart-grid"
                                      />
                                      <text
                                        x={myCourseTrendChart.padding.left - 12}
                                        y={tick.y + 4}
                                        className="my-course-chart-y-label"
                                      >
                                        {formatPercentTickLabel(tick.value)}%
                                      </text>
                                    </g>
                                  ))}

                                  {myCourseTrendChart.areaPath ? (
                                    <path d={myCourseTrendChart.areaPath} fill="url(#my-course-area-gradient)" />
                                  ) : null}
                                  {myCourseTrendChart.linePath ? (
                                    <path d={myCourseTrendChart.linePath} className="my-course-chart-line" />
                                  ) : null}

                                  {myCourseTrendChart.points.map((point) => (
                                    <g key={`point-${point.label}-${point.value}`}>
                                      <circle cx={point.x} cy={point.y} r="5" className="my-course-chart-point" />
                                      <text x={point.x} y={point.y - 12} className="my-course-chart-value">
                                        {point.value}%
                                      </text>
                                      <text
                                        x={point.x}
                                        y={myCourseTrendChart.height - 10}
                                        className="my-course-chart-x-label"
                                      >
                                        {point.label}
                                      </text>
                                    </g>
                                  ))}
                                </svg>
                              </div>
                            ) : (
                              <div className="my-course-chart-empty">ยังไม่มีข้อมูลจริงเพียงพอสำหรับกราฟพัฒนาการ</div>
                            )}
                          </div>

                          <div className="my-course-focus-card">
                            <article className="my-course-focus-course-card">
                              <div className={`course-card-cover my-course-focus-cover ${showMyCourseFocusImage ? '' : 'placeholder'}`}>
                                <img
                                  src={myCourseFocusDisplayImageUrl}
                                  alt={`รูปคอร์ส ${selectedMyCourseTitle}`}
                                  loading="lazy"
                                  onError={() => setMyCourseFocusImageLoadFailed(true)}
                                />
                                <span className="my-course-focus-favorite" aria-hidden="true">
                                  <Heart size={18} strokeWidth={2.2} />
                                </span>
                              </div>

                              <div className="course-card-header my-course-focus-header">
                                <div>
                                  <h3>{selectedMyCourseTitle}</h3>
                                  <p className="course-card-desc">{selectedMyCourseShortDescription}</p>
                                </div>
                              </div>

                              <div className="course-badges">
                                <span className="browse-badge subject">{selectedMyCourseSubject}</span>
                                <span className="browse-badge grade">{selectedMyCourseGrade}</span>
                                {myCourseFocusLesson ? (
                                  <span className="course-highlight-badge">ความแม่นยำ {myCourseFocusLesson.score}%</span>
                                ) : null}
                              </div>

                              <div className="course-stats my-course-focus-stats">
                                <div>
                                  <span><CalendarDays size={14} strokeWidth={2} aria-hidden="true" />{selectedMyCourseLessonsCount || '—'} บทเรียน</span>
                                </div>
                                <div>
                                  <span><SlidersHorizontal size={14} strokeWidth={2} aria-hidden="true" />เหมาะสำหรับ {selectedMyCourseGrade || 'ทุกระดับ'}</span>
                                </div>
                              </div>

                              <div className="course-teacher my-course-focus-teacher">
                                <span className="course-teacher-avatar" aria-hidden="true">
                                  {String(selectedMyCourseTeacher || 'ทีม').charAt(0)}
                                </span>
                                <span>{selectedMyCourseTeacher || 'ทีมผู้สอน'}</span>
                                <CheckCircle2 size={15} strokeWidth={2.5} aria-hidden="true" />
                              </div>

                              <button type="button" onClick={() => handleCourseStart(selectedMyCourse)}>
                                {myCourseFocusLesson ? 'ฝึกเพิ่มเลย' : 'เข้าสู่คอร์ส'}
                              </button>
                            </article>
                          </div>
                        </div>
                      </article>
                    </>
                  )}
                </section>
              )}

              {activeTab === 'browse' && (
                <section className="browse-section">
                  <header className="browse-header-row">
                    <div>
                      <h2>สำรวจคอร์สทั้งหมด</h2>
                      <p>ค้นหาคอร์สที่ใช่ เพื่อการเรียนรู้ที่สนุกและได้ผล</p>
                    </div>
                  </header>

                  <SearchBar
                    value={searchInput}
                    onChange={setSearchInput}
                    onClear={() => setSearchInput('')}
                    inputRef={searchInputRef}
                  />

                  <div className="browse-layout">
                    <BrowseFilters
                      selectedEducationLevels={selectedEducationLevels}
                      selectedPurposes={selectedPurposes}
                      selectedSubjects={selectedSubjects}
                      onToggleEducationLevel={(level) => {
                        setSelectedEducationLevels((prev) => (
                          prev.includes(level)
                            ? prev.filter((item) => item !== level)
                            : [...prev, level]
                        ));
                      }}
                      onTogglePurpose={(purpose) => {
                        setSelectedPurposes((prev) => (
                          prev.includes(purpose)
                            ? prev.filter((item) => item !== purpose)
                            : [...prev, purpose]
                        ));
                      }}
                      onToggleSubject={(subject) => {
                        setSelectedSubjects((prev) => (
                          prev.includes(subject)
                            ? prev.filter((item) => item !== subject)
                            : [...prev, subject]
                        ));
                      }}
                      educationLevels={availableEducationLevels}
                      purposes={availablePurposes}
                      subjects={availableSubjects}
                      onClear={() => {
                        setSelectedEducationLevels([]);
                        setSelectedPurposes([]);
                        setSelectedSubjects([]);
                      }}
                    />

                    <div className="course-results">
                      {loadingAll ? (
                        <LoadingSkeleton type="card" count={6} />
                      ) : allCourses.length === 0 ? (
                        <EmptyStates type="empty" />
                      ) : filteredCourses.length === 0 ? (
                        <EmptyStates type="no-results" />
                      ) : (
                        <div className="course-results-grid">
                          {filteredCourses.map((course) => (
                            <CourseCard
                              key={course.id}
                              course={course}
                              onOpenCourse={handleOpenCourse}
                              requiresAuth={!user}
                              onRequireAuth={handleRequireAuth}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'analysis' && (
                <SubjectOverviewPanel
                  user={user}
                  courses={enrichedEnrolledCourses}
                  loading={statsLoading}
                  onBrowseCourses={handleBrowseCourses}
                  onViewCourseAnalysis={handleCourseAnalysis}
                />
              )}

              {activeTab === 'ai-recommend' && (
                <AIRecommendationPanel
                  user={user}
                  courses={enrichedEnrolledCourses}
                  selectedCourseId={selectedAiCourseId}
                  onSelectedCourseIdChange={setSelectedAiCourseId}
                  loading={statsLoading}
                  onBrowseCourses={handleBrowseCourses}
                  onOpenCourseTab={handleOpenCourseTab}
                  onOpenCourseAnalysis={handleCourseAnalysis}
                />
              )}

              {activeTab === 'settings' && (
                <StudentSettingsPage user={user} />
              )}
            </>
          ) : (
            <section className="dashboard-welcome" aria-label="แนะนำแพลตฟอร์ม">
              <div className="welcome-hero">
                <div className="welcome-content">
                  <p className="welcome-kicker">ยินดีต้อนรับสู่แพลตฟอร์ม</p>
                  <h2>ผู้ช่วยสอนด้วย AI ที่ช่วยวางแผนการเรียนแบบตรงเป้า</h2>
                  <p>
                    เรียนได้เป็นระบบ ติดตามความคืบหน้า และรับคำแนะนำที่เหมาะกับเป้าหมายของคุณ
                    เพื่อพัฒนาทักษะและเตรียมสอบได้อย่างมั่นใจ
                  </p>
                  <div className="welcome-actions">
                    <button
                      type="button"
                      className="welcome-btn solid"
                      onClick={() => onShowAuth('login')}
                    >
                      เข้าสู่ระบบเพื่อเริ่มเรียน
                    </button>
                    <button
                      type="button"
                      className="welcome-btn outline"
                      onClick={() => onShowAuth('register')}
                    >
                      ลงทะเบียน
                    </button>
                  </div>
                </div>
                <div className="welcome-features">
                  <div className="welcome-feature-card">
                    <h3>แผนการเรียนเฉพาะตัว</h3>
                    <p>AI ช่วยวิเคราะห์จุดแข็ง-จุดอ่อน และจัดลำดับบทเรียนให้เหมาะกับคุณ</p>
                  </div>
                  <div className="welcome-feature-card">
                    <h3>ติดตามผลแบบเรียลไทม์</h3>
                    <p>ดูความคืบหน้า คะแนน และสถิติสำคัญเพื่อปรับแผนได้ทันที</p>
                  </div>
                  <div className="welcome-feature-card">
                    <h3>คอร์สครบทุกเป้าหมาย</h3>
                    <p>รวมคอร์สตามวิชา ระดับชั้น และเป้าหมายการสอบไว้ในที่เดียว</p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      <DashboardDialogModal
        config={dialogConfig}
        onConfirm={() => closeDialog(true)}
        onClose={() => closeDialog(false)}
      />

    </div>
  );
};

export default DashboardPage;

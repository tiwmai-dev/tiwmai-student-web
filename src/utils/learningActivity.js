import { secureAPI } from './api';
import { resolveStudentUserId } from './userIdentity';

const LAST_LESSON_ACTIVITY_KEY = 'student_last_lesson_activity_v1';
const MAX_ACTIVITY_DAYS = 90;
const ACTIVITY_TIME_ZONE = 'Asia/Bangkok';
const REMOTE_SYNC_DEDUPE_MS = 60 * 1000;
const recentRemoteSyncs = new Map();

const getUserKey = (user) => resolveStudentUserId(user);

const toLocalDayKey = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ACTIVITY_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (_) {
    // Fall through to runtime-local formatting when Intl time zone support is unavailable.
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const readStoredActivity = (userKey) => {
  try {
    const raw = localStorage.getItem(LAST_LESSON_ACTIVITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userKey !== userKey) return null;
    return parsed;
  } catch (_) {
    return null;
  }
};

export const saveLatestLessonActivity = ({
  user,
  courseId,
  lessonId,
  courseName,
  lessonTitle,
}) => {
  const userKey = getUserKey(user);
  if (!userKey || !courseId || !lessonId) return;

  const updatedAt = Date.now();
  const todayKey = toLocalDayKey(updatedAt);
  const previous = readStoredActivity(userKey);
  const previousDays = Array.isArray(previous?.activityDays) ? previous.activityDays : [];
  const activityDays = Array.from(
    new Set([todayKey, ...previousDays].filter(Boolean).map(String))
  )
    .sort()
    .slice(-MAX_ACTIVITY_DAYS);

  const payload = {
    userKey,
    courseId: String(courseId),
    lessonId: String(lessonId),
    courseName: courseName || '',
    lessonTitle: lessonTitle || '',
    updatedAt,
    activityDays,
  };

  try {
    localStorage.setItem(LAST_LESSON_ACTIVITY_KEY, JSON.stringify(payload));
  } catch (_) {
    // Ignore storage write failures to keep navigation uninterrupted.
  }

  const remoteSyncKey = `${userKey}:${String(courseId)}:${String(lessonId)}:${todayKey}`;
  const lastRemoteSyncAt = recentRemoteSyncs.get(remoteSyncKey) || 0;
  if (Date.now() - lastRemoteSyncAt < REMOTE_SYNC_DEDUPE_MS) return;
  recentRemoteSyncs.set(remoteSyncKey, Date.now());

  secureAPI.courseAPI.recordLearningActivity(userKey, {
    courseId,
    lessonId,
    activityDay: todayKey,
    activityDays,
  }).catch(() => {
    // Local activity is still retained; remote sync will be retried on the next lesson open.
  });
};

export const readLatestLessonActivity = ({ user }) => {
  const userKey = getUserKey(user);
  if (!userKey) return null;

  try {
    const parsed = readStoredActivity(userKey);
    if (
      !parsed ||
      !parsed.courseId ||
      !parsed.lessonId
    ) {
      return null;
    }

    const fallbackDay = parsed.updatedAt ? toLocalDayKey(parsed.updatedAt) : null;
    const activityDays = Array.from(
      new Set(
        (Array.isArray(parsed.activityDays) ? parsed.activityDays : [])
          .concat(fallbackDay || [])
          .filter(Boolean)
          .map(String)
      )
    ).sort();

    return {
      userKey: parsed.userKey,
      courseId: String(parsed.courseId),
      lessonId: String(parsed.lessonId),
      courseName: parsed.courseName || '',
      lessonTitle: parsed.lessonTitle || '',
      updatedAt: parsed.updatedAt || null,
      activityDays,
    };
  } catch (_) {
    return null;
  }
};

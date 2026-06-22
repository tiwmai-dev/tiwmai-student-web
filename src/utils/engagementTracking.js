const DAILY_ENGAGEMENT_KEY = 'student_daily_engagement_ms_v1';
const KEEP_DAYS = 45;

const pad2 = (value) => String(value).padStart(2, '0');

const toUserKey = (user) =>
  (user?.id || user?.studentId || user?.username || user?.user_id || '').toString();

const toDateKey = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const toLabel = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return `${pad2(day)}/${pad2(month)}`;
};

const readStore = () => {
  try {
    const raw = localStorage.getItem(DAILY_ENGAGEMENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

const writeStore = (payload) => {
  try {
    localStorage.setItem(DAILY_ENGAGEMENT_KEY, JSON.stringify(payload));
  } catch (_) {
    // Keep user flow uninterrupted when storage is unavailable.
  }
};

const splitRangeByDay = (startMs, endMs) => {
  const chunks = [];
  let cursor = Number(startMs);
  const end = Number(endMs);

  if (!Number.isFinite(cursor) || !Number.isFinite(end) || end <= cursor) {
    return chunks;
  }

  while (cursor < end) {
    const current = new Date(cursor);
    const nextDay = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();
    const chunkEnd = Math.min(end, nextDay);
    const delta = chunkEnd - cursor;
    if (delta > 0) {
      chunks.push({
        dateKey: toDateKey(cursor),
        ms: delta,
      });
    }
    cursor = chunkEnd;
  }

  return chunks;
};

const pruneOldEntries = (byDate) => {
  const threshold = Date.now() - (KEEP_DAYS * 24 * 60 * 60 * 1000);
  const next = {};
  Object.entries(byDate || {}).forEach(([dateKey, ms]) => {
    const time = new Date(`${dateKey}T00:00:00`).getTime();
    if (Number.isFinite(time) && time >= threshold) {
      next[dateKey] = Number(ms) || 0;
    }
  });
  return next;
};

export const recordEngagementRange = ({ user, startMs, endMs }) => {
  const userKey = toUserKey(user);
  if (!userKey) return;

  const chunks = splitRangeByDay(startMs, endMs);
  if (!chunks.length) return;

  const store = readStore();
  const userEntry = store[userKey] && typeof store[userKey] === 'object'
    ? store[userKey]
    : { byDate: {}, updatedAt: Date.now() };
  const byDate = { ...(userEntry.byDate || {}) };

  chunks.forEach(({ dateKey, ms }) => {
    byDate[dateKey] = (Number(byDate[dateKey]) || 0) + ms;
  });

  store[userKey] = {
    byDate: pruneOldEntries(byDate),
    updatedAt: Date.now(),
  };
  writeStore(store);
};

export const readDailyEngagementMinutes = ({ user, days = 10, nowMs = Date.now() }) => {
  const userKey = toUserKey(user);
  if (!userKey) return [];

  const safeDays = Math.max(1, Math.floor(Number(days) || 10));
  const store = readStore();
  const byDate = store?.[userKey]?.byDate || {};
  const today = new Date(nowMs);

  return Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - (safeDays - 1 - index));
    const dateKey = toDateKey(date.getTime());
    const ms = Number(byDate?.[dateKey]) || 0;
    const minutes = Math.max(0, Math.round(ms / 60000));
    return {
      dateKey,
      label: toLabel(dateKey),
      minutes,
      isToday: index === safeDays - 1,
    };
  });
};

export const startEngagementTracker = ({ user, tickMs = 15000 }) => {
  const userKey = toUserKey(user);
  if (!userKey || typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let activeSince = document.visibilityState === 'visible' ? Date.now() : null;

  const flush = () => {
    if (!activeSince) return;
    const now = Date.now();
    if (now > activeSince) {
      recordEngagementRange({ user, startMs: activeSince, endMs: now });
    }
    activeSince = now;
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      activeSince = Date.now();
      return;
    }
    flush();
    activeSince = null;
  };

  const onPageHide = () => {
    flush();
    activeSince = null;
  };

  const intervalId = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    flush();
  }, Math.max(5000, Number(tickMs) || 15000));

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    flush();
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
  };
};

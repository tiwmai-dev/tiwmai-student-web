import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CreditCard,
  FileText,
  Info,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Scale,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { secureAPI } from '../utils/api';
import { parseApiDate } from '../utils/dateTime';
import { resolveStudentUserId } from '../utils/userIdentity';

const SETTINGS_SECTIONS = [
  { key: 'account', label: 'บัญชีของฉัน', icon: User },
  { key: 'payment-history', label: 'ประวัติชำระเงิน', icon: CreditCard },
  { key: 'display', label: 'การแสดงผล', icon: Monitor },
  { key: 'ai-quota', label: 'โควตา AI', icon: Sparkles },
  { key: 'about', label: 'เกี่ยวกับ', icon: Info },
];
const DISPLAY_SETTINGS_KEY = 'student_display_preferences_v1';
const AVATAR_STORAGE_KEY = 'student_avatar_preview_v1';
const AVATAR_UPDATED_EVENT = 'student-avatar-updated';
const APP_VERSION = process.env.REACT_APP_VERSION || '1.0.0';

const GRADE_OPTIONS = ['ประถมต้น', 'ประถมปลาย', 'มัธยมต้น', 'มัธยมปลาย'];
const FONT_SIZE_OPTIONS = [
  { value: 'small', label: 'ตัวอักษรเล็ก (Small)' },
  { value: 'medium', label: 'ตัวอักษรปกติ (Medium)' },
  { value: 'large', label: 'ตัวอักษรใหญ่ (Large)' },
];
const THEME_OPTIONS = [
  { value: 'light', label: 'โหมดสว่าง', icon: Sun },
  { value: 'dark', label: 'โหมดมืด', icon: Moon },
];
const DEFAULT_SUBJECTS = ['คณิตศาสตร์'];
const DEFAULT_GOAL = 'daily_practice';
const GOAL_OPTIONS = [
  { value: 'daily_practice', label: 'ทบทวนบทเรียนรายวัน' },
  { value: 'exam_preparation', label: 'เตรียมสอบวัดผล' },
  { value: 'learn_ahead', label: 'เรียนรู้ล่วงหน้า' },
];
const DEFAULT_DISPLAY_SETTINGS = {
  fontSize: 'medium',
  theme: 'light',
  reduceMotion: false,
};

const clampAge = (value) => Math.max(5, Math.min(100, Number(value) || 12));
const pickFirstText = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
};

const getAvatarStorageKey = (user) => {
  const identity = pickFirstText(
    user?.user_id,
    user?.id,
    user?.studentId,
    user?.username,
    user?.email,
    'anonymous'
  );
  return `${AVATAR_STORAGE_KEY}:${identity}`;
};

const pickAvatarUrl = (profile, user) => pickFirstText(
  profile?.avatar_url,
  user?.avatar_url,
  profile?.avatar_data_url,
  user?.avatar_data_url
);

const normalizeDisplaySettings = (rawValue) => {
  const fontSize = FONT_SIZE_OPTIONS.some((option) => option.value === rawValue?.fontSize)
    ? rawValue.fontSize
    : DEFAULT_DISPLAY_SETTINGS.fontSize;
  const theme = THEME_OPTIONS.some((option) => option.value === rawValue?.theme)
    ? rawValue.theme
    : DEFAULT_DISPLAY_SETTINGS.theme;
  return {
    fontSize,
    theme,
    reduceMotion: Boolean(rawValue?.reduceMotion),
  };
};

const getAiQuotaResetAt = (usageDate, explicitResetAt) => {
  const explicitText = String(explicitResetAt || '').trim();
  if (explicitText) {
    const explicitDate = new Date(explicitText);
    if (!Number.isNaN(explicitDate.getTime())) return explicitDate.toISOString();
  }

  const text = String(usageDate || '').trim();
  if (!text) return '';

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1)).toISOString();
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  )).toISOString();
};

const normalizeAiQuotaStatus = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const asNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const dailyLimit = Math.max(0, asNumber(payload.daily_limit_thb, 0));
  const used = Math.max(0, asNumber(payload.used_thb, 0));
  const remaining = Math.max(0, asNumber(payload.remaining_thb, Math.max(0, dailyLimit - used)));
  const percent = dailyLimit > 0
    ? (remaining / dailyLimit) * 100
    : asNumber(payload.remaining_percent, 0);
  const remainingPercent = Math.max(0, Math.min(100, asNumber(payload.remaining_percent, percent)));
  return {
    userId: String(payload.user_id || '').trim() || null,
    remainingPercent,
    usedPercent: Math.max(0, Math.min(100, 100 - remainingPercent)),
    isExhausted: Boolean(payload.is_exhausted),
    requestCount: Math.max(0, Math.round(asNumber(payload.request_count, 0))),
    usageDate: String(payload.usage_date || '').trim(),
    resetAt: getAiQuotaResetAt(
      payload.usage_date,
      payload.reset_at || payload.reset_at_utc || payload.next_reset_at
    ),
    limitSource: String(payload.limit_source || '').trim(),
  };
};

const formatAiDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(date);
  } catch (_) {
    return value;
  }
};

const formatThaiDateTime = (value) => {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch (_) {
    return '-';
  }
};

const formatAiQuotaResetDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  try {
    const formatted = new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Bangkok',
    }).format(date);
    return `${formatted} น.`;
  } catch (_) {
    return '-';
  }
};

const formatThaiDate = (value) => {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
    }).format(date);
  } catch (_) {
    return '-';
  }
};

const formatCurrencyTHB = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '-';
  return `${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;
};

const formatOrderReference = (row) => {
  const orderId = String(row?.order_id || '').trim();
  if (orderId) return orderId;
  const paymentIntentId = String(row?.payment_intent_id || '').trim();
  if (!paymentIntentId) return '-';
  if (paymentIntentId.length <= 14) return paymentIntentId;
  return `${paymentIntentId.slice(0, 8)}...${paymentIntentId.slice(-4)}`;
};

const applyDisplaySettings = (settings) => {
  const normalized = normalizeDisplaySettings(settings);
  const root = document.documentElement;
  root.setAttribute('data-student-font-size', normalized.fontSize);
  root.setAttribute('data-student-theme', normalized.theme);
  root.setAttribute(
    'data-student-reduced-motion',
    normalized.reduceMotion ? 'true' : 'false'
  );
};

const StudentSettingsPage = ({ user }) => {
  const { saveOnboardingProfile, uploadAvatar, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef(null);
  const refreshUserRef = useRef(refreshUser);
  const accountRefreshKeyRef = useRef('');
  const aiQuotaAutoLoadedKeyRef = useRef('');
  const aiQuotaLoadingRef = useRef(false);
  const paymentHistoryAutoLoadedKeyRef = useRef('');
  const paymentHistoryLoadingRef = useRef(false);
  const profile = useMemo(() => user?.onboarding?.profile || {}, [user?.onboarding?.profile]);
  const fallbackName = pickFirstText(user?.given_name, user?.name, user?.username, user?.studentId, 'ผู้ใช้');
  const email = pickFirstText(user?.email, user?.email_address, user?.mail, '-');
  const [activeSection, setActiveSection] = useState('account');
  const [nickname, setNickname] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState(DEFAULT_GOAL);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [accountStatusMessage, setAccountStatusMessage] = useState('');
  const [displayStatusMessage, setDisplayStatusMessage] = useState('');
  const [fontSize, setFontSize] = useState(DEFAULT_DISPLAY_SETTINGS.fontSize);
  const [theme, setTheme] = useState(DEFAULT_DISPLAY_SETTINGS.theme);
  const [reduceMotion, setReduceMotion] = useState(DEFAULT_DISPLAY_SETTINGS.reduceMotion);
  const [savedDisplaySettings, setSavedDisplaySettings] = useState(DEFAULT_DISPLAY_SETTINGS);
  const [aboutGeneratedAt, setAboutGeneratedAt] = useState('');
  const [aiQuota, setAiQuota] = useState(null);
  const [aiQuotaLoading, setAiQuotaLoading] = useState(false);
  const [aiQuotaStatusMessage, setAiQuotaStatusMessage] = useState('');
  const [paymentHistoryRows, setPaymentHistoryRows] = useState([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryStatusMessage, setPaymentHistoryStatusMessage] = useState('');
  const [paymentHistoryError, setPaymentHistoryError] = useState('');
  const avatarStorageKey = getAvatarStorageKey(user);
  const accountRefreshKey = pickFirstText(
    user?.user_id,
    user?.id,
    user?.studentId,
    user?.username,
    user?.email
  );

  useEffect(() => {
    refreshUserRef.current = refreshUser;
  }, [refreshUser]);

  useEffect(() => {
    setNickname(pickFirstText(profile?.nickname, user?.name, user?.given_name, user?.username));
    setGradeLevel(
      pickFirstText(profile?.grade_level, user?.grade_level, user?.gradeLevel, GRADE_OPTIONS[2])
    );
    setPrimaryGoal(
      GOAL_OPTIONS.some((option) => option.value === profile?.primary_goal)
        ? profile.primary_goal
        : DEFAULT_GOAL
    );
    setAccountStatusMessage('');
  }, [
    profile?.grade_level,
    profile?.nickname,
    profile?.primary_goal,
    user?.given_name,
    user?.grade_level,
    user?.gradeLevel,
    user?.name,
    user?.username,
  ]);

  useEffect(() => {
    const storedProfileAvatar = pickAvatarUrl(profile, user);
    if (storedProfileAvatar) {
      setAvatarPreview(storedProfileAvatar);
      try {
        localStorage.setItem(avatarStorageKey, storedProfileAvatar);
        window.dispatchEvent(new CustomEvent(AVATAR_UPDATED_EVENT, {
          detail: { avatar: storedProfileAvatar, storageKey: avatarStorageKey },
        }));
      } catch (error) {
        console.warn('Failed to cache profile avatar:', error);
      }
      return;
    }

    try {
      const storedAvatar = localStorage.getItem(avatarStorageKey);
      if (storedAvatar) {
        setAvatarPreview(storedAvatar);
      }
    } catch (error) {
      console.warn('Failed to read local avatar preview:', error);
    }
  }, [
    avatarStorageKey,
    profile,
    profile?.avatar_data_url,
    profile?.avatar_url,
    user,
    user?.avatar_data_url,
    user?.avatar_url,
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : DEFAULT_DISPLAY_SETTINGS;
      const normalized = normalizeDisplaySettings(parsed);
      setFontSize(normalized.fontSize);
      setTheme(normalized.theme);
      setReduceMotion(normalized.reduceMotion);
      setSavedDisplaySettings(normalized);
      applyDisplaySettings(normalized);
    } catch (error) {
      console.warn('Failed to read display settings:', error);
      applyDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
    }
  }, []);

  useEffect(() => {
    try {
      const label = new Intl.DateTimeFormat('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date());
      setAboutGeneratedAt(label);
    } catch (_) {
      setAboutGeneratedAt('ล่าสุด');
    }
  }, []);

  useEffect(() => {
    if (!accountRefreshKey || accountRefreshKeyRef.current === accountRefreshKey) return;
    accountRefreshKeyRef.current = accountRefreshKey;

    let mounted = true;
    const run = async () => {
      setIsRefreshing(true);
      const result = await refreshUserRef.current();
      if (!mounted) return;
      if (!result?.success) {
        setAccountStatusMessage(result?.error || 'ไม่สามารถโหลดข้อมูลล่าสุดได้');
      }
      setIsRefreshing(false);
    };
    run();
    return () => {
      mounted = false;
    };
  }, [accountRefreshKey]);

  const canSaveAccount = useMemo(() => {
    return nickname.trim().length > 0 && gradeLevel.trim().length > 0 && !isRefreshing;
  }, [gradeLevel, isRefreshing, nickname]);

  const canSaveDisplay = useMemo(() => {
    return (
      fontSize !== savedDisplaySettings.fontSize
      || theme !== savedDisplaySettings.theme
      || reduceMotion !== savedDisplaySettings.reduceMotion
    );
  }, [
    fontSize,
    reduceMotion,
    savedDisplaySettings.fontSize,
    savedDisplaySettings.reduceMotion,
    savedDisplaySettings.theme,
    theme,
  ]);

  const studentUserId = (
    user?.user_id
    || user?.id
    || user?.studentId
    || user?.username
    || ''
  ).toString().trim();
  const paymentHistoryUserId = useMemo(() => resolveStudentUserId(user), [user]);

  const loadAiQuota = useCallback(async ({ silent = false } = {}) => {
    if (!studentUserId) {
      setAiQuota(null);
      setAiQuotaStatusMessage('ไม่พบรหัสผู้ใช้สำหรับโหลดโควตา AI');
      return;
    }
    if (aiQuotaLoadingRef.current) return;
    aiQuotaLoadingRef.current = true;
    setAiQuotaLoading(true);
    setAiQuotaStatusMessage('');
    try {
      const status = await secureAPI.chatAPI.getEnergyStatus(studentUserId);
      setAiQuota(normalizeAiQuotaStatus(status));
      if (!silent) {
        setAiQuotaStatusMessage('อัปเดตสถานะแล้ว');
      }
    } catch (error) {
      console.warn('Failed to load AI quota:', error);
      setAiQuotaStatusMessage('ไม่สามารถโหลดโควตา AI ได้');
    } finally {
      aiQuotaLoadingRef.current = false;
      setAiQuotaLoading(false);
    }
  }, [studentUserId]);

  const loadPaymentHistory = useCallback(async ({ silent = false } = {}) => {
    if (!paymentHistoryUserId) {
      setPaymentHistoryRows([]);
      setPaymentHistoryStatusMessage('ไม่พบรหัสผู้ใช้สำหรับโหลดประวัติชำระเงิน');
      setPaymentHistoryError('');
      return;
    }
    if (paymentHistoryLoadingRef.current) return;
    paymentHistoryLoadingRef.current = true;
    setPaymentHistoryLoading(true);
    setPaymentHistoryStatusMessage('');
    setPaymentHistoryError('');
    try {
      const payload = await secureAPI.courseAPI.getPaymentHistory(paymentHistoryUserId);
      setPaymentHistoryRows(Array.isArray(payload?.rows) ? payload.rows : []);
      if (!silent) {
        setPaymentHistoryStatusMessage('อัปเดตประวัติชำระเงินแล้ว');
      }
    } catch (error) {
      console.warn('Failed to load payment history:', error);
      setPaymentHistoryRows([]);
      setPaymentHistoryError(error?.message || 'โหลดประวัติชำระเงินไม่สำเร็จ');
    } finally {
      paymentHistoryLoadingRef.current = false;
      setPaymentHistoryLoading(false);
    }
  }, [paymentHistoryUserId]);

  const avatarInitial = useMemo(() => {
    const text = pickFirstText(nickname, profile?.nickname, user?.name, fallbackName);
    return String(text).trim().charAt(0).toUpperCase() || 'U';
  }, [fallbackName, nickname, profile?.nickname, user?.name]);

  useEffect(() => {
    if (activeSection !== 'ai-quota') return;
    if (!studentUserId) return;
    const loadKey = `ai-quota:${studentUserId}`;
    if (aiQuotaAutoLoadedKeyRef.current === loadKey) return;
    aiQuotaAutoLoadedKeyRef.current = loadKey;
    loadAiQuota({ silent: true });
  }, [activeSection, loadAiQuota, studentUserId]);

  useEffect(() => {
    if (activeSection !== 'payment-history') return;
    if (!paymentHistoryUserId) return;
    const loadKey = `payment-history:${paymentHistoryUserId}`;
    if (paymentHistoryAutoLoadedKeyRef.current === loadKey) return;
    paymentHistoryAutoLoadedKeyRef.current = loadKey;
    loadPaymentHistory({ silent: true });
  }, [activeSection, loadPaymentHistory, paymentHistoryUserId]);

  const handleUploadAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const buildProfilePayload = useCallback((avatarData = {}) => ({
    nickname: nickname.trim(),
    grade_level: gradeLevel,
    age: clampAge(profile?.age),
    interested_subjects: Array.isArray(profile?.interested_subjects) && profile.interested_subjects.length > 0
      ? profile.interested_subjects
      : DEFAULT_SUBJECTS,
    primary_goal: primaryGoal,
    avatar_url: avatarData.avatar_url || profile?.avatar_url || user?.avatar_url || null,
    avatar_storage_path: avatarData.avatar_storage_path || profile?.avatar_storage_path || null,
    avatar_bucket: avatarData.avatar_bucket || profile?.avatar_bucket || null,
    avatar_data_url: null,
  }), [
    gradeLevel,
    nickname,
    primaryGoal,
    profile?.age,
    profile?.avatar_bucket,
    profile?.avatar_storage_path,
    profile?.avatar_url,
    profile?.interested_subjects,
    user?.avatar_url,
  ]);

  const cacheAvatarPreview = (avatarUrl) => {
    setAvatarPreview(avatarUrl);
    try {
      localStorage.setItem(avatarStorageKey, avatarUrl);
      window.dispatchEvent(new CustomEvent(AVATAR_UPDATED_EVENT, {
        detail: { avatar: avatarUrl, storageKey: avatarStorageKey },
      }));
    } catch (error) {
      console.error('Failed to persist local avatar preview:', error);
    }
  };

  const persistAvatarFile = async (file) => {
    if (!canSaveAccount || isSaving) {
      setAccountStatusMessage('กรอกข้อมูลบัญชีให้ครบก่อนอัปโหลดรูปโปรไฟล์');
      return;
    }

    setIsSaving(true);
    setAccountStatusMessage('กำลังอัปโหลดรูปโปรไฟล์...');
    const uploadResult = await uploadAvatar(file);
    if (!uploadResult?.success) {
      setIsSaving(false);
      setAccountStatusMessage(uploadResult?.error || 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ');
      return;
    }

    const avatarData = {
      avatar_url: uploadResult.data?.avatar_url,
      avatar_storage_path: uploadResult.data?.avatar_storage_path,
      avatar_bucket: uploadResult.data?.avatar_bucket,
    };
    if (avatarData.avatar_url) {
      cacheAvatarPreview(avatarData.avatar_url);
    }

    setAccountStatusMessage('กำลังบันทึกรูปในบัญชี...');
    const result = await saveOnboardingProfile(buildProfilePayload(avatarData));
    setIsSaving(false);
    setAccountStatusMessage(
      result?.success ? 'อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว' : (result?.error || 'บันทึกรูปโปรไฟล์ไม่สำเร็จ')
    );
  };

  const handleAvatarSelected = (event) => {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setAccountStatusMessage('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    if (file.size > 1024 * 1024) {
      setAccountStatusMessage('รูปโปรไฟล์ต้องมีขนาดไม่เกิน 1MB');
      return;
    }

    persistAvatarFile(file);
  };

  const handleSaveProfile = async () => {
    if (!canSaveAccount || isSaving) return;
    setIsSaving(true);
    setAccountStatusMessage('');

    const result = await saveOnboardingProfile(buildProfilePayload());
    setIsSaving(false);
    setAccountStatusMessage(
      result?.success ? 'บันทึกข้อมูลเรียบร้อยแล้ว' : (result?.error || 'บันทึกข้อมูลไม่สำเร็จ')
    );
  };

  const handleSaveDisplay = () => {
    const nextSettings = normalizeDisplaySettings({ fontSize, theme, reduceMotion });
    try {
      localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(nextSettings));
      applyDisplaySettings(nextSettings);
      setSavedDisplaySettings(nextSettings);
      setDisplayStatusMessage('บันทึกการตั้งค่าการแสดงผลแล้ว');
    } catch (error) {
      console.error('Failed to save display settings:', error);
      setDisplayStatusMessage('ไม่สามารถบันทึกการตั้งค่าได้');
    }
  };

  const handleResetDisplay = () => {
    setFontSize(DEFAULT_DISPLAY_SETTINGS.fontSize);
    setTheme(DEFAULT_DISPLAY_SETTINGS.theme);
    setReduceMotion(DEFAULT_DISPLAY_SETTINGS.reduceMotion);
    localStorage.removeItem(DISPLAY_SETTINGS_KEY);
    applyDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
    setSavedDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
    setDisplayStatusMessage('รีเซ็ตการแสดงผลเป็นค่าเริ่มต้นแล้ว');
  };

  const handleLogoutFromSettings = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await logout();
    navigate('/', { replace: true });
  };

  const renderAccountSection = () => {
    return (
      <>
        <h2>บัญชีของฉัน</h2>

        <div className="settings-profile-row">
          <div className="settings-avatar-wrap">
            {avatarPreview ? (
              <img src={avatarPreview} alt="รูปโปรไฟล์" className="settings-avatar-image" />
            ) : (
              <span className="settings-avatar">{avatarInitial}</span>
            )}
            <button
              type="button"
              className="settings-avatar-camera"
              onClick={handleUploadAvatarClick}
              aria-label="อัปโหลดรูปโปรไฟล์"
            >
              <Camera size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="settings-hidden-input"
              onChange={handleAvatarSelected}
            />
          </div>
          <div className="settings-profile-copy">
            <strong>{nickname || fallbackName}</strong>
            <span>{email}</span>
          </div>
          <button type="button" className="settings-secondary-action" onClick={handleUploadAvatarClick}>
            เปลี่ยนรูปโปรไฟล์
          </button>
        </div>

        <div className="settings-divider" />

        <section className="settings-form-section">
          <h3>ข้อมูลส่วนตัว</h3>
          <div className="settings-form-grid">
            <label className="settings-field">
              <span>ชื่อเล่น</span>
              <input
                type="text"
                value={nickname}
                maxLength={50}
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>

            <label className="settings-field">
              <span>อีเมล</span>
              <input type="email" value={email} readOnly />
            </label>

            <label className="settings-field">
              <span>ระดับชั้น</span>
              <select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)}>
                {GRADE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>เป้าหมายหลัก</span>
              <select value={primaryGoal} onChange={(event) => setPrimaryGoal(event.target.value)}>
                {GOAL_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="settings-save-row">
            {accountStatusMessage ? <span className="settings-status-message">{accountStatusMessage}</span> : null}
            <button
              type="button"
              className="settings-save-button"
              onClick={handleSaveProfile}
              disabled={!canSaveAccount || isSaving}
            >
              {isRefreshing ? 'กำลังโหลดข้อมูล...' : (isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล')}
            </button>
          </div>
        </section>
      </>
    );
  };

  const renderDisplaySection = () => {
    return (
      <>
        <h2>การแสดงผล</h2>
        <section className="settings-form-section">
          <h3>ขนาดตัวอักษร</h3>
          <p className="settings-section-copy">ตั้งค่าขนาดตัวอักษรทั้งระบบให้เหมาะกับการอ่านของคุณ</p>
          <div className="settings-choice-grid" role="radiogroup" aria-label="ขนาดตัวอักษร">
            {FONT_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={fontSize === option.value}
                className={`settings-choice-button ${fontSize === option.value ? 'active' : ''}`}
                onClick={() => setFontSize(option.value)}
              >
                <Scale size={16} strokeWidth={2} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="settings-divider" />

        <section className="settings-form-section">
          <h3>ธีมสี</h3>
          <p className="settings-section-copy">เลือกธีมสีของหน้าผู้เรียนให้เหมาะกับสภาพแสง</p>
          <div className="settings-choice-grid settings-theme-grid" role="radiogroup" aria-label="ธีมสี">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === option.value}
                  className={`settings-choice-button ${theme === option.value ? 'active' : ''}`}
                  onClick={() => setTheme(option.value)}
                >
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="settings-divider" />

        <section className="settings-form-section">
          <h3>การเคลื่อนไหว</h3>
          <p className="settings-section-copy">ลดเอฟเฟกต์การเคลื่อนไหวเพื่อความสบายตา</p>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(event) => setReduceMotion(event.target.checked)}
            />
            <span>ลดแอนิเมชันในหน้าเว็บ</span>
          </label>

          <div className="settings-save-row">
            {displayStatusMessage ? <span className="settings-status-message">{displayStatusMessage}</span> : null}
            <button
              type="button"
              className="settings-secondary-action"
              onClick={handleResetDisplay}
            >
              รีเซ็ตค่าเริ่มต้น
            </button>
            <button
              type="button"
              className="settings-save-button"
              onClick={handleSaveDisplay}
              disabled={!canSaveDisplay}
            >
              บันทึกการแสดงผล
            </button>
          </div>
        </section>
      </>
    );
  };

  const renderAiQuotaSection = () => {
    const remainingPercent = Math.max(0, Math.min(100, Number(aiQuota?.remainingPercent ?? 100)));
    const isExhausted = Boolean(aiQuota?.isExhausted);
    const limitSourceLabel = aiQuota?.limitSource === 'user_override'
      ? 'กำหนดเฉพาะบัญชี'
      : 'ค่าเริ่มต้นของระบบ';
    const resetDateTimeLabel = formatAiQuotaResetDateTime(aiQuota?.resetAt);

    return (
      <>
        <h2>โควตา AI</h2>

        <section className="settings-form-section ai-quota-section">
          <div className={`ai-quota-overview ${isExhausted ? 'exhausted' : ''}`}>
            <div className="ai-quota-main">
              <span className="ai-quota-kicker">สถานะการใช้งานวันนี้</span>
              <strong>{aiQuotaLoading ? 'กำลังโหลด...' : `${Math.round(remainingPercent)}%`}</strong>
              <p>{isExhausted ? 'โควตาวันนี้หมดแล้ว' : 'โควตา AI ที่เหลือสำหรับวันนี้'}</p>
            </div>
            <div className="ai-quota-meter" aria-label={`เหลือ ${Math.round(remainingPercent)} เปอร์เซ็นต์`}>
              <div
                className="ai-quota-meter-track"
                style={{ '--ai-quota-fill': `${remainingPercent}%` }}
              />
              <div className="ai-quota-meter-labels">
                <span>เหลือ {Math.round(remainingPercent)}%</span>
              </div>
            </div>
          </div>

          <div className="settings-info-grid ai-quota-info-grid">
            <div className="settings-info-card">
              <span>สถานะ</span>
              <strong>{isExhausted ? 'หมดแล้ว' : 'พร้อมใช้งาน'}</strong>
            </div>
            <div className="settings-info-card">
              <span>โควตาคงเหลือ</span>
              <strong>{Math.round(remainingPercent)}%</strong>
            </div>
            <div className="settings-info-card">
              <span>จำนวนคำขอวันนี้</span>
              <strong>{aiQuota?.requestCount ?? 0} ครั้ง</strong>
            </div>
            <div className="settings-info-card">
              <span>วันที่ใช้งาน</span>
              <strong>{formatAiDate(aiQuota?.usageDate)}</strong>
            </div>
            <div className="settings-info-card">
              <span>แหล่งที่มาของโควตา</span>
              <strong>{limitSourceLabel}</strong>
            </div>
            <div className="settings-info-card">
              <span>รีเซ็ตโควตา</span>
              <strong>{resetDateTimeLabel}</strong>
              <small>เวลาไทย</small>
            </div>
          </div>

          <div className="settings-save-row">
            {aiQuotaStatusMessage ? <span className="settings-status-message">{aiQuotaStatusMessage}</span> : null}
            <button
              type="button"
              className="settings-secondary-action"
              onClick={() => loadAiQuota()}
              disabled={aiQuotaLoading}
            >
              <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
              <span>{aiQuotaLoading ? 'กำลังอัปเดต...' : 'อัปเดตสถานะ'}</span>
            </button>
          </div>
        </section>
      </>
    );
  };

  const renderPaymentHistorySection = () => {
    const skeletonRows = Array.from({ length: 4 });
    const skeletonColumns = ['w-20', 'w-24', 'w-44', 'w-24', 'w-24', 'w-18', 'w-24', 'chip', 'w-18'];

    return (
      <>
        <h2>ประวัติชำระเงิน</h2>

        <section className="settings-form-section settings-payment-history-section" aria-busy={paymentHistoryLoading}>
          <div className="settings-payment-history-header">
            <div>
              <h3>รายการชำระเงิน</h3>
              <p className="settings-section-copy">
                ตรวจสอบคอร์ส แพ็กเกจ สถานะ และวันที่หมดอายุจากการชำระเงินของคุณ
              </p>
            </div>
            <span>{paymentHistoryRows.length} รายการ</span>
          </div>

          {paymentHistoryLoading ? (
            <div className="payment-history-table-wrap settings-payment-history-table-wrap" role="status" aria-label="กำลังโหลดประวัติชำระเงิน">
              <table className="payment-history-table settings-payment-history-table payment-history-skeleton-table">
                <thead>
	                  <tr>
	                    <th><span className="payment-history-skeleton line w-20" /></th>
	                    <th><span className="payment-history-skeleton line w-24" /></th>
	                    <th><span className="payment-history-skeleton line w-36" /></th>
	                    <th><span className="payment-history-skeleton line w-24" /></th>
	                    <th><span className="payment-history-skeleton line w-24" /></th>
	                    <th><span className="payment-history-skeleton line w-20" /></th>
	                    <th><span className="payment-history-skeleton line w-24" /></th>
	                    <th><span className="payment-history-skeleton line w-18" /></th>
	                    <th><span className="payment-history-skeleton line w-18" /></th>
	                  </tr>
                </thead>
                <tbody>
                  {skeletonRows.map((_, rowIndex) => (
                    <tr key={`payment-history-skeleton-${rowIndex}`}>
                      {skeletonColumns.map((columnClass, columnIndex) => (
                        <td key={`${rowIndex}-${columnClass}-${columnIndex}`}>
                          <span className={`payment-history-skeleton ${columnClass === 'chip' ? 'chip' : `line ${columnClass}`}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!paymentHistoryLoading && paymentHistoryError ? (
            <p className="payment-history-empty">{paymentHistoryError}</p>
          ) : null}

          {!paymentHistoryLoading && !paymentHistoryError ? (
            <div className="payment-history-table-wrap settings-payment-history-table-wrap">
              {paymentHistoryRows.length === 0 ? (
                <p className="payment-history-empty">ยังไม่มีประวัติชำระเงิน</p>
              ) : (
                <table className="payment-history-table settings-payment-history-table">
                  <thead>
	                    <tr>
	                      <th>วันที่ชำระ</th>
	                      <th>เลขคำสั่งซื้อ</th>
	                      <th>คอร์ส</th>
	                      <th>เริ่มเรียน</th>
	                      <th>หมดอายุ</th>
	                      <th>แพ็กเกจ</th>
	                      <th>จำนวนเงิน</th>
	                      <th>สถานะ</th>
	                      <th>ใบเสร็จ</th>
	                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistoryRows.map((row, index) => {
                      const planLabel = String(row?.plan_label || '').trim();
                      const durationMonths = Number(row?.duration_months);
                      const planText = planLabel
                        || (Number.isFinite(durationMonths) && durationMonths > 0 ? `${durationMonths} เดือน` : '-');
	                      const statusText = String(row?.payment_status || '').trim().toLowerCase() === 'succeeded'
	                        ? 'สำเร็จ'
	                        : (row?.payment_status || 'รอตรวจสอบ');

	                      return (
	                        <tr key={`${row?.enrollment_id || row?.payment_intent_id || row?.course_id || 'payment'}-${index}`}>
	                          <td>{formatThaiDateTime(row?.paid_at || row?.enrolled_at)}</td>
	                          <td className="payment-order-cell">{formatOrderReference(row)}</td>
	                          <td>{row?.course_name || '-'}</td>
	                          <td>{formatThaiDate(row?.started_at || row?.enrolled_at)}</td>
	                          <td>{formatThaiDate(row?.expires_at)}</td>
                          <td>{planText}</td>
                          <td>{formatCurrencyTHB(row?.paid_amount_thb)}</td>
                          <td>
                            <span className={`payment-status-chip ${statusText === 'สำเร็จ' ? 'success' : 'pending'}`}>
	                              {statusText}
	                            </span>
	                          </td>
	                          <td>
	                            {row?.receipt_url ? (
	                              <a
	                                className="payment-receipt-link"
	                                href={row.receipt_url}
	                                target="_blank"
	                                rel="noopener noreferrer"
	                              >
	                                เปิด
	                              </a>
	                            ) : (
	                              <span className="payment-receipt-empty">-</span>
	                            )}
	                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          <div className="settings-save-row">
            {paymentHistoryStatusMessage ? (
              <span className="settings-status-message">{paymentHistoryStatusMessage}</span>
            ) : null}
            <button
              type="button"
              className="settings-secondary-action"
              onClick={() => loadPaymentHistory()}
              disabled={paymentHistoryLoading}
            >
              <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
              <span>{paymentHistoryLoading ? 'กำลังอัปเดต...' : 'อัปเดตประวัติ'}</span>
            </button>
          </div>
        </section>
      </>
    );
  };

  const renderAboutSection = () => {
    return (
      <>
        <h2>เกี่ยวกับ</h2>
        <section className="settings-form-section">
          <h3>ข้อมูลระบบ</h3>
          <div className="settings-info-grid">
            <div className="settings-info-card">
              <span>ชื่อผู้ใช้</span>
              <strong>{nickname || fallbackName}</strong>
            </div>
            <div className="settings-info-card">
              <span>อีเมล</span>
              <strong>{email}</strong>
            </div>
            <div className="settings-info-card">
              <span>เวอร์ชันแอป</span>
              <strong>{APP_VERSION}</strong>
            </div>
            <div className="settings-info-card">
              <span>อัปเดตข้อมูล</span>
              <strong>{aboutGeneratedAt}</strong>
            </div>
          </div>
        </section>

        <div className="settings-divider" />

        <section className="settings-form-section">
          <h3>เอกสารและความช่วยเหลือ</h3>
          <div className="settings-link-grid">
            <Link className="settings-secondary-action settings-link-action" to="/terms">
              <FileText size={16} strokeWidth={2} aria-hidden="true" />
              <span>ข้อกำหนดการใช้งาน</span>
            </Link>
            <Link className="settings-secondary-action settings-link-action" to="/privacy">
              <Info size={16} strokeWidth={2} aria-hidden="true" />
              <span>นโยบายความเป็นส่วนตัว</span>
            </Link>
          </div>
        </section>

        <div className="settings-divider" />

        <section className="settings-action-row">
          <div>
            <h3>ออกจากระบบ</h3>
            <p>ออกจากระบบบัญชีนี้บนอุปกรณ์ปัจจุบัน</p>
          </div>
          <button
            type="button"
            className="settings-danger-action"
            onClick={handleLogoutFromSettings}
            disabled={isLoggingOut}
          >
            <LogOut size={18} strokeWidth={2} aria-hidden="true" />
            <span>{isLoggingOut ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}</span>
          </button>
        </section>
      </>
    );
  };

  const renderSectionContent = () => {
    if (activeSection === 'payment-history') return renderPaymentHistorySection();
    if (activeSection === 'display') return renderDisplaySection();
    if (activeSection === 'ai-quota') return renderAiQuotaSection();
    if (activeSection === 'about') return renderAboutSection();
    return renderAccountSection();
  };

  return (
    <section className="student-settings-page" aria-label="ตั้งค่า">
      <header className="student-settings-header">
        <h1>ตั้งค่า</h1>
        <p>จัดการบัญชีและการตั้งค่าของคุณ</p>
      </header>

      <div className="student-settings-layout">
        <aside className="settings-side-panel" aria-label="เมนูตั้งค่า">
          <nav className="settings-section-nav">
            {SETTINGS_SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`settings-section-button ${activeSection === item.key ? 'active' : ''}`}
                  onClick={() => setActiveSection(item.key)}
                >
                  <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

        </aside>

        <article className="settings-account-card">{renderSectionContent()}</article>
      </div>
    </section>
  );
};

export default StudentSettingsPage;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { secureAPI } from '../utils/api';
import { getApiDateTimeMs } from '../utils/dateTime';
import { resolveStudentUserId } from '../utils/userIdentity';
import { trackEvent, trackEventOnce } from '../utils/analytics';
import promptPayLogo from '../assets/images/logos/prompt-pay-logo.png';

const STUDENT_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api/v1';
const STUDENT_API_ORIGIN = (() => {
  try {
    return new URL(STUDENT_API_BASE_URL).origin;
  } catch (_) {
    return '';
  }
})();

const stripeClientCache = {};
let stripeScriptPromise = null;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ensureStripeScript = async () => {
  if (window.Stripe) return;
  if (!stripeScriptPromise) {
    stripeScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('โหลด Stripe.js ไม่สำเร็จ'));
      document.body.appendChild(script);
    });
  }
  await stripeScriptPromise;
};

const getStripeClient = async (publishableKey) => {
  const key = (publishableKey || '').trim();
  if (!key) return null;
  await ensureStripeScript();
  if (!window.Stripe) return null;
  if (!stripeClientCache[key]) {
    stripeClientCache[key] = window.Stripe(key);
  }
  return stripeClientCache[key];
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
    course.preview_image_url,
    course.previewImageUrl,
    course.image_url,
    course.imageUrl,
    course.thumbnail_url,
    course.thumbnailUrl,
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

const resolveDefaultEmail = (user) => {
  const candidates = [
    user?.email,
    user?.username,
    user?.studentId,
    user?.user_id,
    user?.id,
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (EMAIL_REGEX.test(text)) return text;
  }
  return '';
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

const toCourseList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.courses)) return payload.courses;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const normalizeTextList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const isMockExamQuiz = (quiz) => {
  if (!quiz || typeof quiz !== 'object') return false;
  const tags = Array.isArray(quiz?.tags) ? quiz.tags.join(' ') : '';
  const text = [
    quiz?.document_type,
    quiz?.quiz_type,
    quiz?.type,
    quiz?.purpose,
    quiz?.title,
    quiz?.name,
    tags,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  return text.includes('mock_exam') || text.includes('mock exam') || text.includes('ข้อสอบจำลอง') || text.includes('แบบทดสอบจำลอง');
};

const formatSetCount = (count) => {
  const numeric = Number(count);
  const resolved = Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0;
  return `${resolved.toLocaleString('th-TH')} ชุด`;
};

const PaymentPage = ({ user }) => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { logout, refreshUser } = useAuth();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccessDetails, setPaymentSuccessDetails] = useState(null);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [error, setError] = useState('');
  const [isEnrolledCourse, setIsEnrolledCourse] = useState(false);
  const [isRenewalFlow, setIsRenewalFlow] = useState(false);
  const [activePaymentIntentId, setActivePaymentIntentId] = useState('');
  const [checkingPaymentStatus, setCheckingPaymentStatus] = useState(false);
  const [quizTypeCounts, setQuizTypeCounts] = useState({ exercise: null, mockExam: null });
  const checkingPaymentStatusRef = useRef(false);

  const userId = resolveStudentUserId(user);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const normalizeCourseId = (value) => (value == null ? '' : String(value));
        const targetCourseId = normalizeCourseId(courseId);
        const normalizeCourse = (raw = {}) => {
          const numericPrice = Number(raw?.price ?? raw?.price_thb ?? raw?.tuition);
          const rawPlans = Array.isArray(raw?.pricing_plans) ? raw.pricing_plans : [];
          const normalizedPlans = rawPlans
            .map((plan, idx) => {
              const planPrice = Number(plan?.price);
              if (!Number.isFinite(planPrice) || planPrice < 0) return null;
              const durationMonths = Number(plan?.duration_months);
              const label = String(plan?.label || '').trim();
              return {
                id: `plan-${idx + 1}`,
                label: label || (Number.isFinite(durationMonths) && durationMonths > 0 ? `${durationMonths} เดือน` : `แพ็กเกจ ${idx + 1}`),
                durationMonths: Number.isFinite(durationMonths) && durationMonths > 0 ? durationMonths : null,
                price: Math.round(planPrice * 100) / 100,
              };
            })
            .filter(Boolean);
          return {
            ...raw,
            id: normalizeCourseId(raw?.id || raw?.course_id || raw?._id || targetCourseId),
            name: raw?.name || raw?.title || 'คอร์สเรียน',
            description: raw?.description || '',
            instructor: raw?.instructor || raw?.teacher_name || raw?.teacher || raw?.owner_name || 'อาจารย์ระบบ',
            category: raw?.category || raw?.subject || 'วิชาทั่วไป',
            price: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : 0,
            pricingPlans: normalizedPlans,
          };
        };

        const localEnrolledCourses = Array.isArray(user?.enrolledCourses) ? user.enrolledCourses : [];
        let enrolledCourses = localEnrolledCourses;
        if (userId) {
          try {
            enrolledCourses = toCourseList(await secureAPI.courseAPI.getUserCourses(userId));
          } catch (_) {
            enrolledCourses = localEnrolledCourses;
          }
        }

        const enrolledCourse = enrolledCourses.find(
          (item) => normalizeCourseId(item?.id || item?.course_id || item?._id) === targetCourseId
        ) || null;

        const enrolledCourseNormalized = enrolledCourse ? normalizeCourse(enrolledCourse) : null;
        let catalogCourseNormalized = null;
        try {
          const allCoursesRes = await secureAPI.courseAPI.getAllCourses();
          const allCourses = Array.isArray(allCoursesRes?.courses) ? allCoursesRes.courses : [];
          const found = allCourses.find(
            (item) => normalizeCourseId(item?.id || item?.course_id || item?._id) === targetCourseId
          );
          if (found) catalogCourseNormalized = normalizeCourse(found);
        } catch (_) {
          // Fall back to enrolled course snapshot when catalog fetch fails.
        }

        let baseCourse = catalogCourseNormalized || enrolledCourseNormalized;
        if (catalogCourseNormalized && enrolledCourseNormalized) {
          const latestPlans = Array.isArray(catalogCourseNormalized.pricingPlans)
            && catalogCourseNormalized.pricingPlans.length > 0
            ? catalogCourseNormalized.pricingPlans
            : enrolledCourseNormalized.pricingPlans;
          baseCourse = {
            ...enrolledCourseNormalized,
            ...catalogCourseNormalized,
            pricingPlans: latestPlans,
          };
        }

        const isExpiredEnrollment = isCourseExpiredRecord(enrolledCourseNormalized || baseCourse);
        setCourse(baseCourse);
        setSelectedPlanIndex(0);
        setQuizTypeCounts({ exercise: null, mockExam: null });
        setIsEnrolledCourse(Boolean(enrolledCourse) && !isExpiredEnrollment);
        setIsRenewalFlow(Boolean(enrolledCourse) && isExpiredEnrollment);

      } catch (err) {
        setError(err?.message || 'โหลดข้อมูลคอร์สไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [courseId, user, userId]);

  useEffect(() => {
    const courseKey = course?.id;
    if (!courseKey) {
      setQuizTypeCounts({ exercise: null, mockExam: null });
      return undefined;
    }

    let cancelled = false;
    const loadQuizTypeCounts = async () => {
      try {
        let page = 1;
        let totalPages = 1;
        const allQuizzes = [];
        do {
          const quizzesRes = await secureAPI.courseAPI.getQuizzesByCourse(courseKey, {
            page,
            pageSize: 100,
            sort: 'latest',
          });
          const pageQuizzes = Array.isArray(quizzesRes?.quizzes) ? quizzesRes.quizzes : [];
          allQuizzes.push(...pageQuizzes);
          totalPages = Math.max(1, Number(quizzesRes?.total_pages) || 1);
          page += 1;
        } while (!cancelled && page <= totalPages);

        if (cancelled) return;
        const mockExam = allQuizzes.filter(isMockExamQuiz).length;
        const exercise = Math.max(0, allQuizzes.length - mockExam);
        setQuizTypeCounts({ exercise, mockExam });
      } catch (_) {
        // Keep course-level fallback counts when quiz listing is unavailable.
      }
    };

    setQuizTypeCounts({ exercise: null, mockExam: null });
    loadQuizTypeCounts();

    return () => {
      cancelled = true;
    };
  }, [course?.id]);

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

  const purchaseOptions = useMemo(() => {
    const plans = Array.isArray(course?.pricingPlans) ? course.pricingPlans : [];
    if (plans.length > 0) return plans;
    const price = Number(course?.price || 0);
    return [{
      id: 'default',
      label: 'แพ็กเกจหลัก',
      durationMonths: null,
      price: Number.isFinite(price) ? price : 0,
    }];
  }, [course]);

  const selectedOption = purchaseOptions[selectedPlanIndex] || purchaseOptions[0] || null;
  const courseImageUrl = useMemo(() => resolveCourseImageUrl(course), [course]);
  const lessonHighlights = useMemo(() => {
    const contentItems = Array.isArray(course?.content_items) ? course.content_items : [];
    if (contentItems.length > 0) {
      return contentItems
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (!item || typeof item !== 'object') return '';
          return String(item?.title || item?.description || '').trim();
        })
        .filter(Boolean)
        .slice(0, 4);
    }
    const topics = Array.isArray(course?.topics) ? course.topics : [];
    if (topics.length > 0) {
      return topics.map((topic) => String(topic || '').trim()).filter(Boolean).slice(0, 4);
    }
    return [
      'วิเคราะห์จุดอ่อนรายบทเพื่อจัดลำดับการฝึก',
      'AI อธิบายวิธีทำเฉพาะจุดที่ยังพลาดบ่อย',
      'สรุปแนวข้อผิดพลาดและบทที่ควรทบทวนต่อ',
    ];
  }, [course]);

  const benefitItems = useMemo(() => {
    const items = normalizeTextList(course?.benefits ?? course?.benefits_text);
    if (items.length > 0) return items;
    return [
      'แบบฝึกหัดสำหรับทบทวนรายบท',
      'ข้อสอบจำลองสำหรับเตรียมสอบจริง',
      'AI วิเคราะห์ผลและแนะนำจุดที่ควรฝึกต่อ',
    ];
  }, [course]);

  const exerciseCountLabel = useMemo(() => {
    const courseExerciseCount = Number(
      course?.exercise_count
      ?? course?.exerciseCount
      ?? course?.practice_count
      ?? course?.practiceCount
    );
    const totalQuizCount = Number(course?.totalQuizzes ?? course?.total_quizzes ?? course?.quiz_count);
    const mockExamCount = Number(course?.mock_exam_count ?? course?.mockExamCount);
    const fallback = Number.isFinite(courseExerciseCount)
      ? courseExerciseCount
      : Number.isFinite(totalQuizCount)
        ? Math.max(0, totalQuizCount - (Number.isFinite(mockExamCount) ? mockExamCount : 0))
        : 0;
    return formatSetCount(quizTypeCounts.exercise ?? fallback);
  }, [course, quizTypeCounts.exercise]);

  const mockExamCountLabel = useMemo(() => {
    const fallback = Number(course?.mock_exam_count ?? course?.mockExamCount);
    return formatSetCount(quizTypeCounts.mockExam ?? (Number.isFinite(fallback) ? fallback : 0));
  }, [course, quizTypeCounts.mockExam]);

  const selectedPriceLabel = useMemo(() => {
    const selectedPrice = Number(selectedOption?.price || 0);
    return selectedPrice > 0 ? `${selectedPrice.toLocaleString('th-TH')} บาท` : 'ฟรี';
  }, [selectedOption]);

  const resolvePendingStatusMessage = useCallback((status) => {
    const normalizedStatus = String(status || '').toLowerCase();
    if (normalizedStatus === 'processing' || normalizedStatus === 'requires_action') {
      return 'สร้าง QR PromptPay แล้ว กรุณาสแกนเพื่อชำระเงิน จากนั้นระบบจะตรวจสถานะให้อัตโนมัติ';
    }
    if (normalizedStatus === 'requires_payment_method') {
      return 'ยังไม่พบการชำระเงิน กรุณาสแกน QR อีกครั้ง แล้วกดตรวจสอบสถานะ';
    }
    if (normalizedStatus === 'succeeded') {
      return 'ชำระเงินสำเร็จแล้ว กำลังเปิดสิทธิ์คอร์ส...';
    }
    if (normalizedStatus === 'canceled') {
      return 'รายการชำระเงินถูกยกเลิก กรุณากดชำระเงินใหม่';
    }
    return `สถานะการชำระเงิน: ${status || 'รอตรวจสอบ'}`;
  }, []);

  const syncPaymentStatus = useCallback(async (paymentIntentId, options = {}) => {
    if (!userId || !courseId || !paymentIntentId) return null;
    const confirmResult = await secureAPI.courseAPI.confirmPromptPayPayment(
      userId,
      courseId,
      paymentIntentId
    );
    const stripeStatus = String(confirmResult?.payment_status || '').toLowerCase();

    if (confirmResult?.enrolled) {
      const transactionId = String(
        confirmResult?.payment_intent_id || confirmResult?.transaction_id || paymentIntentId
      ).trim();
      const value = Number(confirmResult?.amount_thb ?? confirmResult?.amount ?? selectedOption?.price ?? 0);
      trackEventOnce('purchase', transactionId, {
        transaction_id: transactionId,
        currency: 'THB',
        value: Number.isFinite(value) ? value : 0,
        payment_type: 'promptpay',
        items: [{
          item_id: courseId,
          item_name: course?.name || course?.title || 'Course',
          item_category: course?.category || course?.subject || undefined,
          item_variant: selectedOption?.label || undefined,
          price: Number(selectedOption?.price || 0),
          quantity: 1,
        }],
      });
      await refreshUser();
      setIsEnrolledCourse(true);
      setIsRenewalFlow(false);
      setPaymentSuccessDetails({});
      setPaymentStatus('ชำระเงินเรียบร้อย เปิดสิทธิ์คอร์สแล้ว');
      setPaymentError('');
      setActivePaymentIntentId('');
      return confirmResult;
    }

    if (!options?.silent) {
      setPaymentStatus(resolvePendingStatusMessage(stripeStatus));
    }
    return confirmResult;
  }, [course, courseId, refreshUser, resolvePendingStatusMessage, selectedOption, userId]);

  useEffect(() => {
    if (!activePaymentIntentId || isEnrolledCourse) return undefined;

    let attempts = 0;
    const maxAttempts = 24; // 24 * 5s = 2 minutes
    const intervalId = window.setInterval(async () => {
      if (checkingPaymentStatusRef.current) return;
      if (attempts >= maxAttempts) {
        window.clearInterval(intervalId);
        return;
      }

      attempts += 1;
      checkingPaymentStatusRef.current = true;
      try {
        await syncPaymentStatus(activePaymentIntentId, { silent: true });
      } catch (_) {
        // Ignore polling errors and allow manual checks from the user.
      } finally {
        checkingPaymentStatusRef.current = false;
      }
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activePaymentIntentId, isEnrolledCourse, syncPaymentStatus]);

  const handleCheckPaymentStatus = async () => {
    if (!activePaymentIntentId) return;
    try {
      setCheckingPaymentStatus(true);
      setPaymentError('');
      setPaymentStatus('กำลังตรวจสอบสถานะการชำระเงิน...');
      await syncPaymentStatus(activePaymentIntentId);
    } catch (err) {
      setPaymentError(err?.message || 'ไม่สามารถตรวจสอบสถานะการชำระเงินได้ กรุณาลองใหม่');
    } finally {
      setCheckingPaymentStatus(false);
    }
  };

  const handlePay = async () => {
    if (!userId || !courseId) return;
    try {
      setCheckoutLoading(true);
      setPaymentError('');
      setPaymentSuccessDetails(null);
      setPaymentStatus('กำลังสร้างรายการชำระเงิน...');
      setActivePaymentIntentId('');

      if (!selectedOption || Number(selectedOption.price || 0) <= 0) {
        throw new Error('ไม่พบราคาที่ชำระได้สำหรับคอร์สนี้');
      }

      trackEvent('begin_checkout', {
        currency: 'THB',
        value: Number(selectedOption.price),
        payment_type: 'promptpay',
        items: [{
          item_id: courseId,
          item_name: course?.name || course?.title || 'Course',
          item_category: course?.category || course?.subject || undefined,
          item_variant: selectedOption.label || undefined,
          price: Number(selectedOption.price),
          quantity: 1,
        }],
      });

      const createResult = await secureAPI.courseAPI.createPromptPayIntent(
        userId,
        courseId,
        {
          amountThb: Number(selectedOption.price),
          planLabel: selectedOption.label,
          durationMonths: selectedOption.durationMonths,
        }
      );
      const paymentIntentId = String(createResult?.payment_intent_id || '').trim();
      const clientSecret = String(createResult?.client_secret || '').trim();
      const publishableKey = String(createResult?.publishable_key || '').trim();
      if (!paymentIntentId || !clientSecret || !publishableKey) {
        throw new Error('ไม่สามารถเริ่มการชำระเงินได้');
      }

      setPaymentStatus('กำลังเปิด QR PromptPay...');

      const stripe = await getStripeClient(publishableKey);
      if (!stripe) {
        throw new Error('โหลด Stripe ไม่สำเร็จ');
      }

      const accountEmail = resolveDefaultEmail(user);
      const paymentMethod = accountEmail
        ? { billing_details: { email: accountEmail } }
        : {};
      const { error: stripeError, paymentIntent } = await stripe.confirmPromptPayPayment(
        clientSecret,
        { payment_method: paymentMethod }
      );

      if (stripeError) {
        throw new Error(stripeError.message || 'การชำระเงินไม่สำเร็จ');
      }

      const latestIntentId = String(paymentIntent?.id || paymentIntentId).trim();
      setActivePaymentIntentId(latestIntentId);
      await syncPaymentStatus(latestIntentId);
    } catch (err) {
      setPaymentError(err?.message || 'ไม่สามารถชำระเงินได้ กรุณาลองใหม่');
      setPaymentStatus('');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const paymentLoadingSkeleton = (
    <section className="course-payment-shell course-payment-shell-skeleton" aria-label="กำลังโหลดข้อมูลคอร์ส" aria-busy="true">
      <div className="course-payment-skeleton-line course-payment-skeleton-back-link" />
      <div className="course-payment-grid">
        <article className="course-payment-order-card course-payment-skeleton-panel">
          <div className="course-payment-skeleton-line h-30 w-34" />
          <div className="course-payment-order-item-main">
            <div className="course-payment-skeleton-block course-payment-skeleton-media" />
            <div className="course-payment-skeleton-stack">
              <div className="course-payment-skeleton-chip" />
              <div className="course-payment-skeleton-line h-26 w-72" />
              <div className="course-payment-skeleton-line h-16 w-100" />
              <div className="course-payment-skeleton-line h-16 w-60" />
            </div>
          </div>
          <div className="course-payment-skeleton-metrics">
            <div className="course-payment-skeleton-metric" />
            <div className="course-payment-skeleton-divider" />
            <div className="course-payment-skeleton-metric" />
          </div>
          <div className="course-payment-skeleton-stack">
            <div className="course-payment-skeleton-line h-24 w-42" />
            <div className="course-payment-skeleton-list-item" />
            <div className="course-payment-skeleton-list-item w-92" />
            <div className="course-payment-skeleton-list-item w-88" />
          </div>
          <div className="course-payment-skeleton-ai" />
        </article>

        <aside className="course-payment-method-card course-payment-skeleton-panel">
          <div className="course-payment-skeleton-line h-30 w-28" />
          <div className="course-payment-skeleton-banner" />
          <div className="course-payment-skeleton-price-row">
            <div className="course-payment-skeleton-line h-22 w-22" />
            <div className="course-payment-skeleton-line h-32 w-28" />
          </div>
          <div className="course-payment-skeleton-plan" />
          <div className="course-payment-skeleton-plan" />
          <div className="course-payment-skeleton-plan" />
          <div className="course-payment-skeleton-total" />
          <div className="course-payment-skeleton-line h-16 w-44" />
          <div className="course-payment-skeleton-button" />
          <div className="course-payment-skeleton-button secondary" />
          <div className="course-payment-skeleton-line h-14 w-62 centered" />
        </aside>
      </div>
      <section className="course-payment-benefits course-payment-benefits-skeleton" aria-hidden="true">
        <article className="course-payment-benefit-skeleton" />
        <article className="course-payment-benefit-skeleton" />
        <article className="course-payment-benefit-skeleton" />
      </section>
    </section>
  );

  return (
    <div className="course-payment-page">
      <Header user={user} onLogout={logout} activeTab="courses" onSelectTab={handleSelectHeaderTab} />

      <main className="course-payment-main">
        {loading ? paymentLoadingSkeleton : null}
        {!loading && error ? <p className="course-payment-status error">{error}</p> : null}
        {!loading && !error && !course ? <p className="course-payment-status">ไม่พบข้อมูลคอร์ส</p> : null}

        {!loading && !error && course ? (
          <section className="course-payment-shell">
            <Link className="course-payment-back-link" to="/dashboard" state={{ activeTab: 'browse' }}>
              <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" />
              <span>กลับไปเลือกชุดฝึก</span>
            </Link>
            <div className="course-payment-grid">
              <article className="course-payment-order-card">
                <h2>สรุปการสั่งซื้อ</h2>
                <div className="course-payment-order-item-main">
                  <div className="course-payment-order-media">
                    {courseImageUrl ? (
                      <img src={courseImageUrl} alt={course?.name || 'รูปคอร์ส'} loading="lazy" decoding="async" />
                    ) : (
                      <div className="course-payment-media-fallback" aria-hidden="true">
                        <FileText size={44} strokeWidth={1.7} />
                      </div>
                    )}
                  </div>
                  <div className="course-payment-order-info">
                    <span className="course-payment-order-badge">ชุดฝึก</span>
                    <h3>{course?.name}</h3>
                    <p>{course?.description || 'คอร์สออนไลน์พร้อมแบบฝึกหัดและแบบทดสอบในระบบ'}</p>
                  </div>
                </div>

                <div className="course-payment-summary-metrics">
                  <div className="course-payment-summary-metric">
                    <span className="course-payment-summary-icon" aria-hidden="true">
                      <ClipboardCheck size={18} strokeWidth={2} />
                    </span>
                    <div>
                      <p>สิ่งที่ได้รับ</p>
                      <ul className="course-payment-benefit-list">
                        {benefitItems.map((item, index) => (
                          <li key={`payment-benefit-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="course-payment-summary-divider" aria-hidden="true" />
                  <div className="course-payment-summary-metric">
                    <span className="course-payment-summary-icon" aria-hidden="true">
                      <BarChart3 size={18} strokeWidth={2} />
                    </span>
                    <div>
                      <p>จำนวนแบบฝึกหัด และข้อสอบจำลอง</p>
                      <div className="course-payment-count-list">
                        <span>
                          <small>แบบฝึกหัด</small>
                          <strong>{exerciseCountLabel}</strong>
                        </span>
                        <span>
                          <small>ข้อสอบจำลอง</small>
                          <strong>{mockExamCountLabel}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="course-payment-learning-box">
                  <p>ครอบคลุมเนื้อหา</p>
                  <ul>
                    {lessonHighlights.map((item, index) => (
                      <li key={`lesson-highlight-${index}`}>
                        <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="course-payment-ai-box">
                  <Sparkles size={19} strokeWidth={2.1} aria-hidden="true" />
                  <div>
                    <strong>AI วิเคราะห์จุดอ่อน</strong>
                    <p>ระบบจะวิเคราะห์และแนะนำบทที่ควรฝึกให้คุณอัตโนมัติ</p>
                  </div>
                </div>
              </article>

              <aside className="course-payment-method-card">
                <h2>ชำระเงิน</h2>
                <div className="course-payment-promptpay-banner">
                  <img src={promptPayLogo} alt="PromptPay" />
                  <div>
                    <p>PromptPay</p>
                    <span>สแกนจ่ายผ่านแอปธนาคาร</span>
                  </div>
                  <ChevronRight size={20} strokeWidth={2.1} aria-hidden="true" />
                </div>

                <div className="course-payment-price-box">
                  <span>แพ็กเกจสมาชิก</span>
                </div>

                {purchaseOptions.length > 1 ? (
                  <div className="course-payment-plan-list">
                    {purchaseOptions.map((plan, index) => {
                      const planPrice = Number(plan?.price || 0);
                      const selected = index === selectedPlanIndex;
                      return (
                        <button
                          type="button"
                          key={`${plan?.id || plan?.label || 'plan'}-${index}`}
                          className={`course-payment-plan-item ${selected ? 'selected' : ''}`}
                          onClick={() => setSelectedPlanIndex(index)}
                          disabled={checkoutLoading}
                        >
                          <span>{plan?.label || 'แพ็กเกจ'}</span>
                          <strong>{planPrice > 0 ? `${planPrice.toLocaleString('th-TH')} บาท` : 'ฟรี'}</strong>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="course-payment-total-row">
                  <span>ยอดชำระทั้งหมด</span>
                  <strong>{selectedPriceLabel}</strong>
                </div>

                {paymentSuccessDetails ? (
                  <div className="course-payment-success-panel">
                    <div>
                      <p>ชำระเงินสำเร็จ</p>
                    </div>
                    <div className="course-payment-success-actions">
                      <Link className="course-payment-primary" to={`/course/${courseId}`}>
                        เข้าสู่คอร์ส
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="course-payment-method-actions">
                    {isEnrolledCourse ? (
                    <>
                      <Link className="course-payment-primary" to={`/course/${courseId}`}>
                        เข้าสู่คอร์ส
                      </Link>
                      <p className="course-payment-access-note">
                        บัญชีนี้มีสิทธิ์คอร์สแล้ว กดเข้าสู่คอร์สได้ทันที
                      </p>
                    </>
                    ) : (
                      <button
                        type="button"
                        className="course-payment-primary"
                        onClick={handlePay}
                        disabled={checkoutLoading}
                      >
                        <Lock size={18} strokeWidth={2.2} aria-hidden="true" />
                        {checkoutLoading
                          ? 'กำลังชำระเงิน...'
                          : (isRenewalFlow ? `ชำระเงิน ${selectedPriceLabel}` : `ชำระเงิน ${selectedPriceLabel}`)}
                      </button>
                    )}
                    {!isEnrolledCourse && activePaymentIntentId ? (
                      <button
                        type="button"
                        className="course-payment-secondary"
                        onClick={handleCheckPaymentStatus}
                        disabled={checkoutLoading || checkingPaymentStatus}
                      >
                        {checkingPaymentStatus ? 'กำลังตรวจสอบ...' : 'ตรวจสอบสถานะการชำระเงิน'}
                      </button>
                    ) : null}
                  </div>
                )}
                <p className="course-payment-secure-note">
                  <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
                  <span>ข้อมูลของคุณปลอดภัย ไม่เก็บข้อมูลบัตรเครดิต</span>
                </p>
              </aside>
            </div>

            <section className="course-payment-benefits" aria-label="จุดเด่นระบบ">
              <article className="course-payment-benefit">
                <Target size={28} strokeWidth={1.9} aria-hidden="true" />
                <div>
                  <h3>ฝึกตรงจุด</h3>
                  <p>โจทย์พิเศษตามระดับของคุณ</p>
                </div>
              </article>
              <article className="course-payment-benefit">
                <Brain size={28} strokeWidth={1.9} aria-hidden="true" />
                <div>
                  <h3>AI วิเคราะห์</h3>
                  <p>บอกจุดอ่อนและแนะนำการฝึก</p>
                </div>
              </article>
              <article className="course-payment-benefit">
                <TrendingUp size={28} strokeWidth={1.9} aria-hidden="true" />
                <div>
                  <h3>พัฒนาต่อเนื่อง</h3>
                  <p>ติดตามความก้าวหน้าได้ตลอดเวลา</p>
                </div>
              </article>
            </section>
            {paymentStatus ? <p className="course-payment-share-status">{paymentStatus}</p> : null}
            {paymentError ? <p className="course-payment-status error">{paymentError}</p> : null}
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default PaymentPage;

import React from 'react';
import { BarChart3, Cpu, ShieldCheck, TrendingUp } from 'lucide-react';
import Header from '../components/Header';
import CourseCard from '../components/BrowseCourseCard';
import aiCardMascotImage from '../assets/images/illustrations/ai-analysis-mascot.webp';
import heroAiWeaknessImage from '../assets/images/illustrations/hero-ai-weakness.webp';
import heroMockExamImage from '../assets/images/illustrations/hero-mock-exam.webp';
import heroDashboardImage from '../assets/images/illustrations/hero-dashboard.webp';
import heroParentTrackingImage from '../assets/images/illustrations/hero-parent-tracking.webp';
import landingParentPhoneImage from '../assets/images/illustrations/landing-parent-phone.webp';
import landingTrustMascotImage from '../assets/images/illustrations/landing-trust-mascot.webp';
import landingDashboardPreviewImage from '../assets/images/illustrations/landing-dashboard-preview.webp';
import landingLearningDashboardImage from '../assets/images/illustrations/landing-learning-dashboard.webp';
import landingQuizAiAssistantImage from '../assets/images/illustrations/landing-quiz-ai-assistant.webp';
import step1Image from '../assets/images/onboarding/step1_3_step1.webp';
import step2Image from '../assets/images/onboarding/step1_3_step2.webp';
import step3Image from '../assets/images/onboarding/step1_3_step3.webp';
import LandingFooter from '../components/LandingFooter';
import { courseAPI } from '../utils/api';

const landingDashboardSlides = [
  {
    src: landingDashboardPreviewImage,
    alt: 'ตัวอย่างแดชบอร์ดวิเคราะห์ผล คะแนนเฉลี่ย ความแม่นยำ จุดอ่อน และ Mock Exam',
  },
  {
    src: landingLearningDashboardImage,
    alt: 'ตัวอย่างหน้าแดชบอร์ดความคืบหน้าในการเรียนและคอร์สที่กำลังเรียน',
  },
  {
    src: landingQuizAiAssistantImage,
    alt: 'ตัวอย่างหน้าทำข้อสอบพร้อมผู้ช่วย AI อธิบายคำตอบ',
  },
];

const landingCourseTabs = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'primary', label: 'ประถมศึกษา' },
  { id: 'lower-secondary', label: 'มัธยมต้น' },
  { id: 'entrance-m1', label: 'สอบเข้า ม.1' },
  { id: 'entrance-m4', label: 'สอบเข้า ม.4' },
];

const landingNavItems = [
  { type: 'anchor', label: 'AI น้องติว', href: '#landing-ai' },
  { type: 'anchor', label: 'คอร์สเรียน', href: '#landing-exams' },
  { type: 'anchor', label: 'วิธีเริ่มเรียน', href: '#landing-workflow' },
  { type: 'anchor', label: 'คำถามที่พบบ่อย', href: '#landing-faq' },
];

const normalizeCourseText = (value) => String(value || '').trim();

const getCourseTags = (course) => {
  const rawTags = course?.tags || course?.tag || course?.course_tags || [];
  if (Array.isArray(rawTags)) return rawTags.map(normalizeCourseText).filter(Boolean);
  return String(rawTags || '')
    .split(',')
    .map(normalizeCourseText)
    .filter(Boolean);
};

const normalizeCourseSubject = (course) => {
  const text = [
    course?.subject,
    course?.subject_name,
    course?.category,
    course?.title,
    course?.name,
    getCourseTags(course).join(' '),
  ].join(' ').toLowerCase();

  if (text.includes('english') || text.includes('อังกฤษ')) return 'ภาษาอังกฤษ';
  if (text.includes('math') || text.includes('คณิต')) return 'คณิตศาสตร์';
  if (text.includes('science') || text.includes('วิทย')) return 'วิทยาศาสตร์';
  if (text.includes('thai') || text.includes('ไทย')) return 'ภาษาไทย';
  if (text.includes('social') || text.includes('สังคม')) return 'สังคมศึกษา';
  return 'ทั่วไป';
};

const normalizeCourseGrade = (course) => {
  const text = [
    course?.grade,
    course?.grade_level,
    course?.level,
    course?.target_profile,
    course?.target_audience,
    course?.title,
    course?.name,
    getCourseTags(course).join(' '),
  ].join(' ');

  if (text.includes('ประถม')) return 'ประถม';
  if (text.includes('มัธยมต้น')) return 'มัธยมต้น';
  if (text.includes('มัธยมปลาย')) return 'มัธยมปลาย';
  const normalized = text.replace(/\./g, '').replace(/\s+/g, '');
  const match = normalized.match(/(ป[1-6]|ม[1-6])/i);
  if (match) return match[1].replace('p', 'ป').replace('m', 'ม');
  return 'ทั่วไป';
};

const getCoursePrice = (course) => {
  const pricingPlans = Array.isArray(course?.pricing_plans)
    ? course.pricing_plans
    : Array.isArray(course?.pricingPlans)
      ? course.pricingPlans
      : [];
  const planPrices = pricingPlans
    .map((plan) => Number(plan?.price ?? plan?.amount ?? plan?.price_thb))
    .filter((price) => Number.isFinite(price) && price > 0);
  const directPrice = Number(course?.price ?? course?.price_thb ?? course?.tuition);
  const candidates = [
    ...planPrices,
    ...(Number.isFinite(directPrice) && directPrice > 0 ? [directPrice] : []),
  ];
  if (!candidates.length) return 0;
  return Math.min(...candidates);
};

const normalizeLandingCourse = (course) => {
  const id = normalizeCourseText(course?.course_id || course?.id || course?._id);
  const subject = normalizeCourseSubject(course);
  const grade = normalizeCourseGrade(course);
  const lessonsCount =
    course?.lessons_count ||
    course?.lesson_count ||
    course?.total_lessons ||
    (Array.isArray(course?.content_items) ? course.content_items.length : 0) ||
    (Array.isArray(course?.lessons) ? course.lessons.length : 0);
  const price = getCoursePrice(course);
  const imageUrl = normalizeCourseText(
    course?.thumbnail_url ||
    course?.thumbnailUrl ||
    course?.image_url ||
    course?.imageUrl ||
    course?.preview_image_url ||
    course?.previewImageUrl
  );

  return {
    id,
    raw: course,
    title: course?.name || course?.title || 'คอร์สไม่มีชื่อ',
    subject,
    grade,
    description: course?.description || course?.structure_summary || 'คอร์สเตรียมสอบพร้อมแบบฝึกหัดและข้อสอบจำลอง',
    lessonsCount,
    teacher: course?.teacher_name || course?.instructor || course?.teacher || 'ทีมผู้สอน',
    rating: Number.isFinite(Number(course?.rating || course?.average_rating))
      ? Number(course?.rating || course?.average_rating)
      : null,
    canStart: false,
    isPurchased: false,
    imageUrl,
    price,
    priceLabel: price > 0 ? `${price.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท` : 'ฟรี',
    tags: getCourseTags(course),
    searchText: [
      course?.name,
      course?.title,
      course?.description,
      course?.target_profile,
      course?.target_audience,
      subject,
      grade,
      getCourseTags(course).join(' '),
    ].join(' ').toLowerCase(),
  };
};

const courseMatchesLandingTab = (course, tabId) => {
  if (tabId === 'all') return true;
  const searchText = course?.searchText || '';
  const grade = course?.grade || '';
  if (tabId === 'primary') return grade.includes('ประถม') || grade.startsWith('ป') || searchText.includes('ประถม');
  if (tabId === 'lower-secondary') return grade.includes('มัธยมต้น') || ['ม1', 'ม2', 'ม3'].includes(grade) || searchText.includes('มัธยมต้น');
  if (tabId === 'entrance-m1') return searchText.includes('สอบเข้า') && (searchText.includes('ม.1') || searchText.includes('ม1'));
  if (tabId === 'entrance-m4') return searchText.includes('สอบเข้า') && (searchText.includes('ม.4') || searchText.includes('ม4'));
  return true;
};

const HomePage = ({ onShowAuth }) => {
  const [openFaqIndexes, setOpenFaqIndexes] = React.useState(() => new Set());
  const [activeDashboardSlide, setActiveDashboardSlide] = React.useState(0);
  const [activeCourseTab, setActiveCourseTab] = React.useState('all');
  const [landingCourses, setLandingCourses] = React.useState([]);
  const [coursesLoading, setCoursesLoading] = React.useState(true);
  const [coursesError, setCoursesError] = React.useState('');

  React.useEffect(() => {
    const slideInterval = window.setInterval(() => {
      setActiveDashboardSlide((currentSlide) => (
        (currentSlide + 1) % landingDashboardSlides.length
      ));
    }, 4500);

    return () => window.clearInterval(slideInterval);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadCourses = async () => {
      setCoursesLoading(true);
      setCoursesError('');
      try {
        const response = await courseAPI.getAllCourses();
        if (cancelled) return;
        const courses = Array.isArray(response?.courses) ? response.courses : [];
        setLandingCourses(
          courses
            .map(normalizeLandingCourse)
            .filter((course) => course.id)
        );
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load landing courses', error);
        setLandingCourses([]);
        setCoursesError('โหลดคอร์สไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    };

    loadCourses();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleLandingCourses = React.useMemo(() => (
    landingCourses
      .filter((course) => courseMatchesLandingTab(course, activeCourseTab))
      .slice(0, 4)
  ), [activeCourseTab, landingCourses]);

  const heroFeatures = [
    { iconSrc: heroAiWeaknessImage, title: 'AI ผู้ช่วยตะลุยโจทย์' },
    { iconSrc: heroMockExamImage, title: 'Mock Exam เสมือนจริง' },
    { iconSrc: heroDashboardImage, title: 'Dashboard พัฒนาการ' },
    { iconSrc: heroParentTrackingImage, title: 'ผู้ปกครองติดตามผลได้' },
  ];

  const trustFeatures = [
    { Icon: Cpu, title: 'AI วิเคราะห์จุดอ่อนอัตโนมัติ' },
    { Icon: BarChart3, title: 'ผลการเรียนได้ทุกเวลา' },
    { Icon: TrendingUp, title: 'ติดตามพัฒนาการเป็นรายวิชา' },
    { Icon: ShieldCheck, title: 'ปลอดภัย เชื่อถือได้' },
  ];

  const workflow = [
    {
      title: 'เลือกคอร์สเรียน',
      description: 'ค้นหาคอร์สตามวิชา ระดับ และเป้าหมายที่ต้องการ',
      assetSrc: step1Image,
      assetAlt: 'ค้นหาคอร์สเรียนที่เหมาะกับผู้เรียน',
    },
    {
      title: 'ชำระค่าเรียน',
      description: 'ยืนยันการสมัครและชำระเงินเพื่อเริ่มเรียนได้ทันที',
      assetSrc: step2Image,
      assetAlt: 'ขั้นตอนการชำระเงินเพื่อเริ่มเรียน',
    },
    {
      title: 'ฝึกโจทย์กับ AI น้องติว',
      description: 'ทำแบบฝึกหัดและตะลุยโจทย์ พร้อมคำแนะนำที่เข้าใจง่ายทุกข้อ',
      assetSrc: step3Image,
      assetAlt: 'ฝึกโจทย์พร้อมผู้ช่วยอัจฉริยะ',
    },
  ];

  const faqItems = [
    {
      question: 'มีทดลองเรียนฟรีไหม?',
      answer:
        'มี สามารถทดลองเรียนฟรีได้ 1 ครั้งต่อบัญชี เป็นเวลา 24 ชั่วโมงนับจากเริ่มทดลองเรียน',
    },
    {
      question: 'ระบบนี้ต่างจากการทำข้อสอบทั่วไปที่ผู้เรียนทำแล้วเห็นแค่คะแนนอย่างไร?',
      answer:
        'นอกจากให้ฝึกโจทย์ ระบบยังมี AI ช่วยอธิบายวิธีคิด และสรุปผลวิเคราะห์คะแนนเพื่อชี้จุดที่ควรพัฒนาอย่างเป็นขั้นตอน',
    },
    {
      question: 'AI จะเฉลยคำตอบให้ทันที หรือช่วยแนะนำวิธีคิดก่อนให้ผู้เรียนลองทำเอง?',
      answer:
        'AI เน้นแนะนำแนวคิดและขั้นตอนแก้โจทย์ เพื่อให้ผู้เรียนเข้าใจและทำเองได้ ไม่เน้นการให้คำตอบลัดแบบไม่เรียนรู้',
    },
    {
      question: 'ผู้ปกครองสามารถติดตามผลการเรียนและรู้ได้ไหมว่าควรช่วยเสริมเรื่องไหน?',
      answer:
        'ได้ สามารถดูภาพรวมคะแนน แนวโน้มผลลัพธ์ และหัวข้อที่ลูกควรฝึกเพิ่ม เพื่อช่วยวางแผนการเรียนต่อร่วมกัน',
    },
    {
      question: 'เหมาะกับผู้เรียนระดับไหน และใช้ได้ทั้งทบทวนบทเรียนกับเตรียมสอบหรือไม่?',
      answer:
        'เหมาะกับผู้เรียนที่ต้องการฝึกแบบมีโครงสร้าง ทั้งการทบทวนรายบทและการเตรียมสอบด้วยข้อสอบจำลอง',
    },
  ];

  const toggleFaq = (index) => {
    setOpenFaqIndexes((currentIndexes) => {
      const nextIndexes = new Set(currentIndexes);

      if (nextIndexes.has(index)) {
        nextIndexes.delete(index);
      } else {
        nextIndexes.add(index);
      }

      return nextIndexes;
    });
  };

  const handleAuth = (mode) => {
    if (typeof onShowAuth === 'function') {
      onShowAuth(mode);
    }
  };

  const scrollToPackages = () => {
    document.getElementById('landing-exams')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="home-page">
      <div className="landing-promo-bar">
        <span className="landing-promo-copy">ช่วยลูกเตรียมสอบอย่างมั่นใจ | TEWMai เริ่มต้นเพียง 190 บาท/เดือน</span>
        <button type="button" className="landing-promo-button" onClick={() => handleAuth('register')}>
          เริ่มใช้ฟรี 7 วัน
        </button>
      </div>

      <Header user={null} onShowAuth={handleAuth} showLandingNav landingNavItems={landingNavItems} />

      <main className="landing-main">
        <section className="landing-section landing-hero" aria-label="แนะนำระบบติวด้วย AI">
          <div className="landing-hero-layout">
            <div className="landing-hero-copy">
              <h1>
                ตะลุยข้อสอบ
                <span>อย่างมั่นใจ</span>
              </h1>
              <p className="landing-hero-description">
                AI วิเคราะห์จุดอ่อน พร้อมจัดแดชบอร์ดพัฒนาการแบบรายบุคคล
                ฝึกข้อสอบจริง Mock Exam และ Dashboard สำหรับนักเรียนและผู้ปกครอง
              </p>
              <div className="landing-hero-actions">
                <button type="button" className="landing-cta solid" onClick={() => handleAuth('register')}>
                  ทดลองฟรี 7 วัน
                </button>
                <button type="button" className="landing-cta outline" onClick={scrollToPackages}>
                  ดูตัวอย่างเลย
                </button>
              </div>
              <div className="landing-mini-features" aria-label="ฟีเจอร์หลัก">
                {heroFeatures.map((item) => (
                  <article className="landing-mini-feature" key={item.title}>
                    <img src={item.iconSrc} alt="" aria-hidden="true" />
                    <span>{item.title}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="landing-dashboard-card">
              <div className="landing-dashboard-slider">
                {landingDashboardSlides.map((slide, index) => (
                  <img
                    className={index === activeDashboardSlide ? 'is-active' : ''}
                    src={slide.src}
                    alt={slide.alt}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    aria-hidden={index !== activeDashboardSlide}
                    key={slide.src}
                  />
                ))}
              </div>
              <div className="landing-dashboard-dots" aria-label="ตัวอย่างหน้าจอระบบ">
                {landingDashboardSlides.map((slide, index) => (
                  <button
                    className={index === activeDashboardSlide ? 'is-active' : ''}
                    type="button"
                    aria-label={`ดูตัวอย่างที่ ${index + 1}`}
                    aria-pressed={index === activeDashboardSlide}
                    onClick={() => setActiveDashboardSlide(index)}
                    key={slide.src}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-trust-band" aria-label="เหตุผลที่ผู้ปกครองไว้วางใจ">
          <div className="landing-family-panel">
            <div className="landing-family-visual" aria-hidden="true">
              <img src={landingTrustMascotImage} alt="" />
            </div>
            <div className="landing-trust-content">
              <h2>ทำไมผู้ปกครองถึงไว้วางใจ TEWMai</h2>
              <div className="landing-trust-grid">
                {trustFeatures.map((item) => (
                  <article className="landing-trust-item" key={item.title}>
                    <span className="landing-trust-icon" aria-hidden="true">
                      <item.Icon size={34} strokeWidth={2.2} />
                    </span>
                    <span>{item.title}</span>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="landing-ai" className="landing-section landing-feature-cards" aria-label="ฟีเจอร์สำหรับผู้เรียนและผู้ปกครอง">
          <article className="landing-feature-card ai">
            <div>
              <h2>AI ช่วยวิเคราะห์และแนะนำ</h2>
              <ul className="landing-check-list">
                <li>วิเคราะห์จุดแข็งและจุดอ่อน</li>
                <li>แนะนำหัวข้อที่ควรทบทวน</li>
                <li>จัดลำดับข้อสอบตามความจำเป็น</li>
                <li>พัฒนาการแม่นยำขึ้นเรื่อย ๆ</li>
              </ul>
            </div>
            <div className="landing-ai-visual">
              <img src={aiCardMascotImage} alt="ตัวอย่างผู้ช่วย AI แนะนำการฝึกโจทย์" loading="lazy" />
            </div>
          </article>

          <article className="landing-feature-card parent">
            <div>
              <h2>
                <span className="landing-heading-line">ผู้ปกครองติดตามได้ง่าย</span>
                <span className="landing-heading-line landing-nowrap">ทุกที่ ทุกเวลา</span>
              </h2>
              <ul className="landing-check-list">
                <li>ดูคะแนนและสถิติทันที</li>
                <li>ดูจุดอ่อนรายข้อ</li>
                <li>เช็กการทำได้ในแต่ละวิชา</li>
                <li>เห็นพัฒนาชัดเจนการรายสัปดาห์</li>
              </ul>
            </div>
            <div className="landing-phone-mock" aria-hidden="true">
              <img src={landingParentPhoneImage} alt="" loading="lazy" />
            </div>
            <span className="landing-parent-heart" aria-hidden="true" />
          </article>
        </section>

        <section id="landing-exams" className="landing-section landing-packages" aria-label="คอร์สเรียนยอดนิยม">
          <div className="landing-section-title">
            <h2>คอร์สเรียนยอดนิยม</h2>
            <div className="landing-package-tabs" aria-label="หมวดคอร์สเรียน">
              {landingCourseTabs.map((tab) => (
                <button
                  className={activeCourseTab === tab.id ? 'active' : ''}
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveCourseTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {coursesLoading ? (
            <div className="landing-course-status" role="status">กำลังโหลดคอร์ส...</div>
          ) : coursesError ? (
            <div className="landing-course-status error" role="alert">{coursesError}</div>
          ) : visibleLandingCourses.length > 0 ? (
            <div className="landing-course-grid browse-section">
              {visibleLandingCourses.map((course, index) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  highlight={index === 0}
                  requiresAuth
                  onRequireAuth={handleAuth}
                  showTrialAction={false}
                />
              ))}
            </div>
          ) : (
            <div className="landing-course-status">ยังไม่มีคอร์สในหมวดนี้</div>
          )}
        </section>

        <section id="landing-workflow" className="landing-section landing-workflow" aria-label="ขั้นตอนการใช้งาน">
          <div className="landing-section-head">
            <h2>เริ่มเรียนได้ใน 3 ขั้นตอน</h2>
          </div>
          <div className="landing-workflow-track">
            {workflow.map((item, index) => (
              <article className="landing-workflow-card" key={item.title}>
                <span className={`landing-workflow-number step-${index + 1}`}>{index + 1}</span>
                <div className="landing-workflow-image">
                  <img src={item.assetSrc} alt={item.assetAlt} loading="lazy" />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="landing-faq" className="landing-section landing-faq" aria-label="คำถามที่พบบ่อย">
          <div className="landing-faq-shell">
            <div className="landing-faq-intro">
              <h2>
                <span className="landing-nowrap">คำถามที่พบบ่อย</span>
              </h2>
            </div>
            <div className="landing-faq-list">
              {faqItems.map((item, index) => (
                <article
                  className={`landing-faq-item${openFaqIndexes.has(index) ? ' is-open' : ''}`}
                  key={item.question}
                >
                  <button
                    type="button"
                    className="landing-faq-trigger"
                    aria-expanded={openFaqIndexes.has(index)}
                    aria-controls={`landing-faq-answer-${index}`}
                    onClick={() => toggleFaq(index)}
                  >
                    {item.question}
                  </button>
                  <div
                    id={`landing-faq-answer-${index}`}
                    className="landing-faq-answer"
                    aria-hidden={!openFaqIndexes.has(index)}
                  >
                    <div className="landing-faq-answer-inner">
                      <p>{item.answer}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
};

export default HomePage;

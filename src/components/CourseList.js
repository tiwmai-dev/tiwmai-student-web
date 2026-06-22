import React from 'react';
import { Link } from 'react-router-dom';
import EmptyState from './EmptyState';
import { getCourseSubjectLabel, normalizeCourseLabel } from '../utils/courseLabels';
import { parseApiDate } from '../utils/dateTime';

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

const extractGradeLabel = (course) => {
  const directGrade = normalizeGradeValue(course?.grade || course?.level);
  if (directGrade) return directGrade;

  const tags = Array.isArray(course?.tags)
    ? course.tags
    : Array.isArray(course?.course_tags)
      ? course.course_tags
      : [];

  for (const tag of tags) {
    const normalized = normalizeGradeValue(tag);
    if (normalized) return normalized;
  }

  return 'ทั่วไป';
};

const toDifficultyLabel = (value) => {
  if (!value) return null;
  if (typeof value === 'number') {
    if (value <= 1) return 'ง่าย';
    if (value === 2) return 'กลาง';
    return 'ยาก';
  }
  const text = String(value).toLowerCase().trim();
  if (text.includes('easy') || text.includes('ง่าย')) return 'ง่าย';
  if (text.includes('hard') || text.includes('ยาก') || text.includes('advanced')) return 'ยาก';
  if (text.includes('medium') || text.includes('กลาง') || text.includes('intermediate')) return 'กลาง';
  return null;
};

const formatThaiDate = (value) => {
  if (!value) return '-';
  const date = parseApiDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(date);
};

const getRemainingTimeLabel = (expiresAt) => {
  if (!expiresAt) return '-';
  const expiry = parseApiDate(expiresAt);
  if (!expiry) return '-';
  const diffMs = expiry.getTime() - Date.now();
  if (diffMs <= 0) return 'หมดอายุแล้ว';

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} วัน ${hours} ชั่วโมง`;
  if (hours > 0) return `${hours} ชั่วโมง ${minutes} นาที`;
  return `${minutes} นาที`;
};

const getExpiryTone = (course, expiresAt) => {
  if (Boolean(course?.is_expired)) return 'expired';
  if (!expiresAt) return 'normal';
  const expiry = parseApiDate(expiresAt);
  if (!expiry) return 'normal';
  const diffMs = expiry.getTime() - Date.now();
  if (diffMs <= 0) return 'expired';
  if (diffMs <= (72 * 60 * 60 * 1000)) return 'expiring-soon';
  return 'normal';
};

const normalizeInsightText = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'ฝึกต่อเนื่องวันละนิดเพื่อรักษาความสม่ำเสมอ';
  return text.replace(/^แนะนำ\s*[:：-]?\s*/i, '').trim();
};

const CourseList = ({ courses, onStartCourse, onViewCourse, onBrowseCourses }) => {
  if (!courses.length) {
    return (
      <EmptyState onPrimaryClick={onBrowseCourses} />
    );
  }

  return (
    <div className="courses-grid">
      {courses.map((course) => {
        const progress = Number(course.progress || 0);
        const isInProgress = progress > 0 || (course.completedQuizzes || 0) > 0;
        const totalLessons = course.totalLessons || course.total_lessons;
        const courseId = course.id || course.course_id;
        const aiInsightRaw = course.aiInsight || course.ai_insight || course.ai_recommendation;
        const aiInsight = normalizeInsightText(aiInsightRaw);
        const imageUrl = course.thumbnailUrl || course.thumbnail_url || course.imageUrl || course.image_url || '';
        const hasImage = typeof imageUrl === 'string' && /^(https?:\/\/|\/|data:image\/)/i.test(imageUrl);
        const categoryLabel = normalizeCourseLabel(course.category, 'ทั่วไป');
        const subjectLabel = getCourseSubjectLabel(course, categoryLabel || 'ทั่วไป');
        const gradeLabel = extractGradeLabel(course);
        const lessonsLabel = totalLessons || course.lessonsCount || course.lessons_count || '—';
        const difficultyLabel =
          course.difficultyLabel ||
          course.difficulty_label ||
          toDifficultyLabel(course.difficulty || course.level_difficulty || course.difficulty_level) ||
          'กลาง';
        const normalizedSubjectLabel = String(subjectLabel || '').trim().toLowerCase();
        const normalizedGradeLabel = String(gradeLabel || '').trim().toLowerCase();
        const showSubjectBadge = normalizedSubjectLabel && normalizedSubjectLabel !== 'general' && normalizedSubjectLabel !== 'ทั่วไป';
        const showGradeBadge = normalizedGradeLabel && normalizedGradeLabel !== 'ทั่วไป';
        const teacherLabel = course.instructor || course.teacher_name || course.teacher || 'อาจารย์ระบบ';
        const startedAt = course.started_at || course.enrolled_at || null;
        const expiresAt = course.expires_at || null;
        const remainingTime = getRemainingTimeLabel(expiresAt);
        const expiryTone = getExpiryTone(course, expiresAt);
        const isExpired = expiryTone === 'expired';
        const showBadge = Boolean(aiInsightRaw) && !isExpired;
        const primaryLabel = isExpired
          ? 'ต่ออายุคอร์ส'
          : (isInProgress ? '▶ เริ่มเรียนต่อ' : '▶ เริ่มฝึก');
        const handleOpenCourse = () => onStartCourse(course);
        const handleCardKeyDown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenCourse();
          }
        };

        return (
          <article
            key={courseId}
            className={`course-card-new course-card-enrolled ${showBadge ? 'highlight' : ''} ${expiryTone}`}
            role="link"
            tabIndex={0}
            onClick={handleOpenCourse}
            onKeyDown={handleCardKeyDown}
            aria-label={`เข้าเรียนคอร์ส ${course.name}`}
            style={{ cursor: 'pointer' }}
          >
            <div className="course-card-cover">
              {hasImage ? (
                <img src={imageUrl} alt={course.name} loading="lazy" decoding="async" width="800" height="300" />
              ) : (
                <div className="course-card-cover-fallback">{categoryLabel}</div>
              )}
            </div>
            <div className="course-card-content">
              <div className="course-card-header">
                <div>
                  <h3>{course.name}</h3>
                  <p className="course-card-desc">{course.description}</p>
                </div>
                <div className="course-card-meta">
                  {showBadge ? <span className="course-highlight-badge">แนะนำสำหรับคุณ</span> : null}
                </div>
              </div>

              <div className="course-badges">
                {showSubjectBadge ? <span className="browse-badge subject">{subjectLabel}</span> : null}
              </div>

              <div className="course-stats">
                <div>
                  <span>จำนวนบทเรียน</span>
                  <strong>{lessonsLabel}</strong>
                </div>
                <div>
                  <span>ระดับความยาก</span>
                  <strong>{difficultyLabel}</strong>
                </div>
                <div>
                  <span>เหมาะสำหรับ</span>
                  <strong>{showGradeBadge ? gradeLabel : '-'}</strong>
                </div>
              </div>
              <div className="course-card-footer">
                <div className="course-teacher">👨‍🏫 {teacherLabel}</div>
                <div className="course-next-action">เริ่มเรียน: {formatThaiDate(startedAt)} | จบคอร์ส: {formatThaiDate(expiresAt)}</div>
                <div className="course-ai-insight">แนวทางฝึก: {aiInsight}</div>
              </div>
            </div>
            <div className="course-card-actions">
              <div className="browse-actions">
                <Link
                  to={`/course/${courseId}`}
                  className="browse-action primary"
                  onClick={(event) => {
                    event.stopPropagation();
                    onViewCourse && onViewCourse(course);
                  }}
                >
                  ดูรายละเอียด
                </Link>
                <button
                  type="button"
                  className={`browse-action secondary ${isExpired ? 'expired' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartCourse(course);
                  }}
                  title={isExpired ? 'คอร์สหมดอายุแล้ว กดเพื่อต่ออายุคอร์ส' : 'เริ่มเรียนทันที'}
                >
                  {primaryLabel}
                </button>
              </div>
              <div className={`course-expiry-note ${expiryTone}`}>
                {isExpired
                  ? '⌛ คอร์สนี้หมดอายุแล้ว'
                  : `🕒 เหลือเวลาเรียนอีก: ${remainingTime}`}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default CourseList;

import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, Heart, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

const BrowseCourseCard = ({
  course,
  onOpenCourse,
  compact = false,
  highlight = false,
  requiresAuth,
  onRequireAuth,
  showTrialAction = true,
}) => {
  const {
    id,
    raw,
    title,
    subject,
    grade,
    description,
    lessonsCount,
    rating,
    teacher,
    canStart,
    isEnrolled,
    isPurchased,
    trialUsed,
    isEnrolling,
    imageUrl,
    priceLabel,
    onStartTrial,
  } = course;
  const isHighlighted = highlight || course?.isRecommended || (course?.recommendedScore || 0) >= 0.85;
  const [isCoverLoaded, setIsCoverLoaded] = useState(!imageUrl);
  const [hasCoverError, setHasCoverError] = useState(false);
  const coverImageRef = useRef(null);

  useEffect(() => {
    setIsCoverLoaded(!imageUrl);
    setHasCoverError(false);
  }, [id, imageUrl]);

  useEffect(() => {
    if (!imageUrl) return;
    const image = coverImageRef.current;
    if (!image || !image.complete) return;
    if (image.naturalWidth > 0) {
      setIsCoverLoaded(true);
    } else {
      setHasCoverError(true);
      setIsCoverLoaded(true);
    }
  }, [imageUrl]);

  const handleOpen = (startImmediately = false) => {
    if (requiresAuth) {
      onRequireAuth?.('login');
      return;
    }
    onOpenCourse?.(id, startImmediately);
  };

  const showCoverImage = Boolean(imageUrl) && !hasCoverError;
  const showCoverSkeleton = showCoverImage && !isCoverLoaded;
  const canRequestTrial = showTrialAction && !isEnrolled && !canStart && !trialUsed;
  const trialLabel = requiresAuth
    ? 'เข้าสู่ระบบก่อน'
    : isEnrolling
      ? 'กำลังเปิดทดลองเรียน...'
      : 'ทดลองเรียน';
  const handleCardKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen(false);
    }
  };

  return (
    <article
      className={`course-card-new ${compact ? 'compact' : ''} ${isHighlighted ? 'highlight' : ''}`}
      role="link"
      tabIndex={0}
      onClick={() => handleOpen(false)}
      onKeyDown={handleCardKeyDown}
      aria-label={`ดูรายละเอียดคอร์ส ${title}`}
    >
      <div className={`course-card-cover ${showCoverSkeleton ? 'is-loading' : ''}`}>
        {showCoverSkeleton ? <span className="course-card-cover-skeleton" aria-hidden="true" /> : null}
        {showCoverImage ? (
          <img
            ref={coverImageRef}
            src={imageUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            width="800"
            height="300"
            className={`course-card-cover-image ${isCoverLoaded ? 'is-visible' : ''}`}
            onLoad={() => setIsCoverLoaded(true)}
            onError={() => {
              setHasCoverError(true);
              setIsCoverLoaded(true);
            }}
          />
        ) : (
          <div className="course-card-cover-fallback">{subject || 'คอร์ส'}</div>
        )}
        {isPurchased ? <span className="course-enrolled-badge">ซื้อแล้ว</span> : null}
        <button
          type="button"
          className="course-favorite-btn"
          aria-label="บันทึกคอร์ส"
          onClick={(event) => event.stopPropagation()}
        >
          <Heart size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div className="course-card-header">
        <div>
          <h3>{title}</h3>
          <p className="course-card-desc">{description}</p>
        </div>
        <div className="course-card-meta">
          {rating ? <span className="browse-course-rating">★ {rating.toFixed(1)}</span> : null}
        </div>
      </div>
      <div className="course-badges">
        <span className="browse-badge subject">{subject}</span>
      </div>
      <div className="course-stats">
        <div>
          <span><CalendarDays size={14} strokeWidth={2} aria-hidden="true" />{lessonsCount || '-'} บทเรียน</span>
        </div>
        <div>
          <span><SlidersHorizontal size={14} strokeWidth={2} aria-hidden="true" />เหมาะสำหรับ {grade || 'ทุกระดับ'}</span>
        </div>
      </div>
      <div className="course-card-footer">
        <div className="course-teacher">
          <span className="course-teacher-avatar" aria-hidden="true">{String(teacher || 'ทีม').charAt(0)}</span>
          <span>{teacher || 'ทีมผู้สอน'}</span>
          <CheckCircle2 size={15} strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="browse-actions">
          <Link
            to={`/course/${id}?view=payment`}
            state={{ forcePaymentDetails: true, fromBrowse: true }}
            className="browse-action primary"
            onClick={(event) => {
              event.stopPropagation();
              if (requiresAuth) {
                event.preventDefault();
                onRequireAuth?.('login');
                return;
              }
              event.preventDefault();
              onOpenCourse?.(id, false);
            }}
          >
            ดูรายละเอียด
          </Link>
          {!canRequestTrial ? (
            <button
              type="button"
              className={`browse-action secondary ${canStart ? '' : 'disabled'}`}
              onClick={(event) => {
                event.stopPropagation();
                if (canStart) handleOpen(true);
              }}
              disabled={!canStart}
              aria-disabled={!canStart}
              title={canStart ? 'เริ่มเรียนทันที' : 'ซื้อคอร์สก่อนเพื่อเริ่มเรียน'}
            >
              เริ่มเรียน
            </button>
          ) : null}
          {canRequestTrial ? (
            <button
              type="button"
              className="browse-action tertiary"
              onClick={(event) => {
                event.stopPropagation();
                if (requiresAuth) {
                  onRequireAuth?.('login');
                  return;
                }
                onStartTrial?.(raw || course);
              }}
              disabled={isEnrolling}
            >
              {trialLabel}
            </button>
          ) : null}
        </div>
        <span className="browse-course-price course-price-footer">
          {priceLabel === 'ฟรี' || !priceLabel ? 'ฟรี' : `เริ่มต้น ${priceLabel}`}
        </span>
      </div>
    </article>
  );
};

export default BrowseCourseCard;

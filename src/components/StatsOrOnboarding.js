import React from 'react';
import { Progress } from 'antd';
import { Clock3 } from 'lucide-react';
import fireIcon from '../assets/images/icons/fire_icon.webp';

const clampPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
};

const formatMinutes = (minutes) => {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const remain = safeMinutes % 60;
  if (hours > 0 && remain > 0) return `${hours} ชม. ${remain} นาที`;
  if (hours > 0) return `${hours} ชม.`;
  return `${remain} นาที`;
};

const StatsOrOnboarding = ({ isNewUser, stats, loading, updatedLabel }) => {
  if (loading) {
    return (
      <section className="stats-section">
        <div className="stats-grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="stat-card skeleton-card" aria-hidden="true">
              <div className="skeleton-line"></div>
              <div className="skeleton-line short"></div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const progressValue = clampPercent(stats.averageProgress);
  const hasExerciseScore = Boolean(stats.hasExerciseScore);
  const understandingValue = hasExerciseScore ? clampPercent(stats.averageExerciseScore) : 0;
  const understandingLabel = !hasExerciseScore
    ? 'ยังไม่มีข้อมูล'
    : understandingValue >= 80
      ? 'เข้าใจดีมาก'
      : understandingValue >= 60
        ? 'เข้าใจดี'
        : understandingValue >= 40
          ? 'พอใช้'
          : 'ต้องฝึกเพิ่ม';
  const understandingNote = hasExerciseScore
    ? 'เฉลี่ยจากคะแนนฝึกหัด'
    : 'ทำแบบฝึกหัดเพื่อเริ่มวัดผล';
  const consistency = stats?.consistency && typeof stats.consistency === 'object'
    ? stats.consistency
    : {};
  const streakDays = Math.max(0, Math.round(Number(consistency?.streakDays) || 0));
  const completedQuizzes = Math.max(0, Math.round(Number(stats.completedQuizzes) || 0));
  const totalQuizzes = Math.max(0, Math.round(Number(stats.totalQuizzes) || 0));
  const visibleCompletedQuizzes = totalQuizzes > 0
    ? Math.min(completedQuizzes, totalQuizzes)
    : completedQuizzes;
  const minutesThisWeek = Math.max(0, Math.round(Number(stats.minutesThisWeek) || 0));
  const formatPercent = (percent) => `${Math.round(Number(percent) || 0)}%`;
  const weekLabels = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const weekActivity = Array.isArray(consistency?.weekActivity) && consistency.weekActivity.length === 7
    ? consistency.weekActivity
    : weekLabels.map((label) => ({
      label,
      dayKey: label,
      isActive: false,
      isToday: false,
    }));
  const hasTodayActivity = Boolean(consistency?.hasTodayActivity);
  const consistencyMessage = streakDays > 0
    ? (hasTodayActivity ? 'ยอดเยี่ยม! รักษาไว้ให้ดีนะ' : 'ทำต่อวันนี้เพื่อรักษาสถิติต่อเนื่อง')
    : 'เริ่มฝึกวันนี้เพื่อสร้างสถิติต่อเนื่อง';

  return (
    <section className="stats-section">
      <div className="stats-grid">
        <div className="stat-card stat-card-time">
          <h3 className="stat-card-title">ความคืบหน้าในการเรียน</h3>
          <Progress
            className="stat-progress-circle"
            type="circle"
            percent={progressValue}
            size={96}
            strokeWidth={8}
            strokeColor="#4f8df5"
            railColor="#edf2f8"
            format={formatPercent}
          />
          <div className="stat-content">
            <p className="stat-time-summary">
              {minutesThisWeek > 0
                ? `เรียนไปแล้ว ${formatMinutes(minutesThisWeek)}`
                : isNewUser
                  ? 'เริ่มบทแรกเพื่อเก็บความคืบหน้า'
                  : `เรียนไปแล้ว ${completedQuizzes} ชุด`}
            </p>
            <p className="stat-time-goal">
              {totalQuizzes > 0
                ? `จากแบบฝึกทั้งหมด ${visibleCompletedQuizzes}/${totalQuizzes} ชุด`
                : 'กำลังสร้างความสม่ำเสมอในการเรียน'}
            </p>
            <div className="stat-update-row">
              <Clock3 size={15} strokeWidth={2} aria-hidden="true" />
              <span>{updatedLabel || 'อัปเดตล่าสุด วันนี้'}</span>
            </div>
          </div>
        </div>
        <div className="stat-card stat-card-quiz">
          <h3 className="stat-card-title">ระดับความเข้าใจ</h3>
          <Progress
            className="stat-progress-circle"
            type="circle"
            percent={understandingValue}
            size={96}
            strokeWidth={8}
            strokeColor="#ff8f3d"
            railColor="#edf2f8"
            format={formatPercent}
          />
          <div className="stat-content">
            <strong>{understandingValue}%</strong>
            <p>{understandingLabel}</p>
            <small>{understandingNote}</small>
            {hasExerciseScore ? (
              <span className="stat-improve-badge">อัปเดตจากผลฝึกหัด</span>
            ) : null}
          </div>
        </div>
        <div className="stat-card stat-card-progress">
          <h3 className="stat-card-title">ความสม่ำเสมอ</h3>
          <div className="stat-icon" aria-hidden="true">
            <img src={fireIcon} alt="" className="stat-fire-icon" />
          </div>
          <div className="stat-content stat-consistency-content">
            <div className="stat-consistency-headline">
              <strong>{streakDays}</strong>
              <span>วัน</span>
            </div>
            <p>ความสม่ำเสมอในการฝึก</p>
            <small>{consistencyMessage}</small>
            <div className="stat-streak-week" aria-label="สรุปการฝึกรายวัน">
              {weekActivity.map((day, index) => (
                <span
                  key={`day-${day.dayKey || day.label || index}`}
                  className={[
                    'stat-streak-day',
                    day?.isActive ? 'active' : '',
                    day?.isToday ? 'today' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <small>{day?.label || weekLabels[index] || '-'}</small>
                  <i>{day?.isActive ? '●' : '-'}</i>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StatsOrOnboarding;

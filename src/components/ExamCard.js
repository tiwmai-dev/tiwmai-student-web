import React from 'react';

const ExamCard = ({
  quiz,
  attempts,
  latestScore,
  difficulty,
  questionCount,
  statusBadges = [],
  onStart,
  onView,
}) => {
  const normalizedPower = latestScore == null ? null : Math.max(0, Math.min(100, Math.round(Number(latestScore))));
  const displayPower = normalizedPower ?? 0;
  const hasAttempts = attempts > 0;
  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - displayPower / 100);
  const handleCardKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onStart?.();
    }
  };

  return (
    <div
      className="exam-card"
      role="button"
      tabIndex={0}
      onClick={() => onStart?.()}
      onKeyDown={handleCardKeyDown}
      aria-label={`เริ่มทำ ${quiz.title || 'แบบทดสอบ'}`}
    >
      <div className="exam-card-header">
        <h4>{quiz.title || 'แบบทดสอบ'}</h4>
        <div className="exam-badges">
          {statusBadges.map((badge) => (
            <span key={badge.key || badge.label} className={`badge badge-status ${badge.tone || ''}`}>
              {badge.label}
            </span>
          ))}
          {difficulty && <span className={`badge badge-difficulty ${difficulty.className}`}>{difficulty.label}</span>}
        </div>
      </div>

      <div className="exam-body">
        <div className="exam-left">
          {difficulty && (
            <div className={`exam-difficulty difficulty-${difficulty.className}`} aria-label={`ระดับความยาก ${difficulty.stars} ดาว`}>
              <span className="star-row">
                {'★'.repeat(difficulty.stars)}{'☆'.repeat(5 - difficulty.stars)}
              </span>
              <span className="difficulty-text">{difficulty.label}</span>
            </div>
          )}

          <div className="exam-meta">
            <span>❓ {questionCount || 0} ข้อ</span>
            <span>📝 ทำแล้ว {attempts} ครั้ง</span>
          </div>

          <div className="exam-actions">
            <button
              type="button"
              className="exam-primary-btn"
              onClick={(event) => {
                event.stopPropagation();
                onStart?.();
              }}
            >
              ▶ เริ่ม
            </button>
            <button
              type="button"
              className="exam-secondary-btn"
              onClick={(event) => {
                event.stopPropagation();
                onView?.();
              }}
            >
              ดูผลการเรียน
            </button>
          </div>
        </div>

        <div className="exam-power-panel" aria-label={`คะแนนล่าสุด ${displayPower} เปอร์เซ็นต์`}>
          <div className="exam-power">
            <div className="exam-power-ring" role="img" aria-label={`Progress ring ${displayPower} percent`}>
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle className="exam-power-ring-bg" cx="32" cy="32" r={ringRadius} />
                <circle
                  className="exam-power-ring-value"
                  cx="32"
                  cy="32"
                  r={ringRadius}
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <strong className="exam-power-ring-text">{displayPower}%</strong>
            </div>
            <div className="exam-power-copy">
              <span>คะแนนล่าสุด</span>
              <small>{hasAttempts ? 'ผลล่าสุด' : 'ยังไม่มีผลล่าสุด'}</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamCard;

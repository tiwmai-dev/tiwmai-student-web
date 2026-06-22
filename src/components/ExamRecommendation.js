import React from 'react';
import bannerImage from '../assets/images/illustrations/auth-login-banner.webp';

const ExamRecommendation = ({
  quiz,
  hasHistory,
  topic,
  difficulty,
  recommendation,
  onStart,
}) => {
  if (!quiz) return null;

  const summary = recommendation?.summary
    || (hasHistory
      ? `เหมาะกับคุณเพราะช่วยทบทวน ${topic}`
      : 'เหมาะกับคุณเพราะเป็นจุดเริ่มต้นสำหรับวัดระดับบทนี้');

  return (
    <div className="ai-recommendation" role="region" aria-label="คำแนะนำแบบทดสอบ">
      <div className="ai-recommendation-content">
        <div className="ai-recommendation-title">แนะนำให้ทำตอนนี้</div>
        <h3>แนะนำ: {quiz.title}</h3>
        {difficulty && (
          <div className={`exam-difficulty difficulty-${difficulty.className}`} style={{ margin: '8px 0 2px' }}>
            <span className="star-row">
              {'★'.repeat(difficulty.stars)}{'☆'.repeat(5 - difficulty.stars)}
            </span>
            <span className="difficulty-text">{difficulty.label}</span>
          </div>
        )}
        <p>{summary}</p>
      </div>
      <div className="ai-recommendation-side">
        <img
          src={bannerImage}
          alt=""
          aria-hidden="true"
          className="ai-recommendation-illustration"
        />
        <button type="button" className="ai-recommendation-btn" onClick={onStart}>
          ▶ เริ่มทดสอบ
        </button>
      </div>
    </div>
  );
};

export default ExamRecommendation;

import React from 'react';

const ExamEmptyState = ({ onRequestAI }) => (
  <div className="exam-empty-state">
    <div className="exam-empty-icon" aria-hidden="true">📝</div>
    <h3>ยังไม่มีแบบทดสอบ</h3>
    <p>ให้ AI สร้างแบบทดสอบที่เหมาะกับคุณได้ทันที</p>
    <button type="button" className="exam-primary-btn" onClick={onRequestAI}>
      ให้ AI สร้างแบบทดสอบให้ฉัน
    </button>
  </div>
);

export default ExamEmptyState;

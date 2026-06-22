import React from 'react';

const EmptyState = ({ onPrimaryClick, onSecondaryClick }) => (
  <div className="empty-state">
    <div className="empty-state-icon" aria-hidden="true">📚</div>
    <h3>ยังไม่มีคอร์สในรายการ</h3>
    <p>เริ่มต้นด้วยการสำรวจคอร์สที่สนใจ แล้วกดลงทะเบียนเพื่อเริ่มเรียนได้ทันที</p>
    <div className="empty-state-actions">
      {onPrimaryClick ? (
        <button type="button" className="primary-cta-btn" onClick={onPrimaryClick}>
          สำรวจคอร์ส
        </button>
      ) : null}
      {onSecondaryClick ? (
        <button type="button" className="secondary-cta-btn" onClick={onSecondaryClick}>
          ดูคอร์สยอดนิยม
        </button>
      ) : null}
    </div>
  </div>
);

export default EmptyState;

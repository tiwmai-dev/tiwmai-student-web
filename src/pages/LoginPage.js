import React from 'react';
import LoginForm from '../components/LoginForm';

const LoginPage = ({ onShowAuth }) => {
  return (
    <div className="auth-landing">
      <div className="auth-landing-content">
        <div className="auth-hero">
          <h1 className="auth-title">ผู้ช่วยเรียนด้วย AI</h1>
          <h2 className="auth-subtitle">เรียนรู้แบบฝึกหัดและข้อสอบ พร้อมคำอธิบายทันที</h2>
          <p className="auth-description">
            ออกแบบสำหรับนักเรียนไทย ใช้งานง่าย ช่วยโฟกัสจุดที่ต้องพัฒนาในแต่ละบท
          </p>
          <ul className="auth-features">
            <li className="feature-item">
              <span className="feature-icon" aria-hidden="true">🎯</span>
              <div>
                <h3>เลือกคอร์สที่ตรงเป้าหมาย</h3>
                <p>ค้นหาตามวิชาและระดับชั้นเพื่อเริ่มเรียนได้ทันที</p>
              </div>
            </li>
            <li className="feature-item">
              <span className="feature-icon" aria-hidden="true">📝</span>
              <div>
                <h3>ฝึกทำข้อสอบแบบปรับตามจุดอ่อน</h3>
                <p>แบบฝึกหัดอัจฉริยะช่วยเสริมตรงจุด</p>
              </div>
            </li>
            <li className="feature-item">
              <span className="feature-icon" aria-hidden="true">📈</span>
              <div>
                <h3>ดูความก้าวหน้าแบบรายบท</h3>
                <p>ติดตามพัฒนาการและวางแผนได้ชัดเจน</p>
              </div>
            </li>
          </ul>
        </div>
        
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>เข้าสู่ระบบนักเรียน</h2>
            <p>เริ่มต้นการเรียนรู้ที่ไม่เหมือนใคร</p>
          </div>
          {/* Keep login inline for faster completion; registration stays a secondary action. */}
          <LoginForm
            onSwitchToRegister={() => onShowAuth('register')}
          />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

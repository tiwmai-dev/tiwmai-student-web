import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import logoImage from '../assets/images/logos/tewmai_logo.webp';

const LandingFooter = () => {
  return (
    <section className="landing-section landing-footer site-landing-footer" aria-label="ส่วนท้ายหน้าเว็บไซต์">
      <div className="landing-footer-main">
        <div className="landing-footer-col landing-footer-brand">
          <div className="landing-footer-brand-head">
            <img src={logoImage} alt="TEWMai" className="landing-footer-logo" />
          </div>
          <p>
            แพลตฟอร์มติวแบบฝึกหัดและข้อสอบอัจฉริยะ
            พร้อมผู้ช่วย AI และแดชบอร์ดวิเคราะห์คะแนนเพื่อพัฒนาการเรียนอย่างต่อเนื่อง
          </p>
        </div>
        <div className="landing-footer-col">
          <h4>บริการของเรา</h4>
          <ul>
            <li>คลังแบบฝึกหัด</li>
            <li>ข้อสอบจำลอง</li>
            <li>AI ช่วยคิดระหว่างทำโจทย์</li>
            <li>วิเคราะห์ผลคะแนนรายบุคคล</li>
          </ul>
        </div>
        <div className="landing-footer-col">
          <h4>ช่วยเหลือ</h4>
          <ul>
            <li><Link to="/terms">เงื่อนไขการใช้งาน</Link></li>
            <li><Link to="/privacy">นโยบายความเป็นส่วนตัว</Link></li>
          </ul>
        </div>
        <div className="landing-footer-col">
          <h4>ติดต่อเรา</h4>
          <div className="landing-contact-links">
            <a
              href="mailto:support@tewmai.com"
              className="landing-contact-link email"
              aria-label="ส่งอีเมลถึง TEWMai"
              title="support@tewmai.com"
            >
              <span className="landing-contact-icon">
                <Mail aria-hidden="true" />
              </span>
              <span>support@tewmai.com</span>
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61589338483839"
              className="landing-contact-link facebook"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook TEWMai - ติวอัจฉริยะด้วย AI"
              title="Facebook TEWMai - ติวอัจฉริยะด้วย AI"
            >
              <span className="landing-contact-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M13.7 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5H17V3.6c-.8-.1-1.6-.2-2.4-.2-2.4 0-4.1 1.5-4.1 4.2v2.3H7.8V13h2.7v8h3.2Z" />
                </svg>
              </span>
              <span>TEWMai - ติวอัจฉริยะด้วย AI</span>
            </a>
          </div>
        </div>
        <div className="landing-footer-meta">
          <div className="landing-footer-legal-links">
            <Link to="/terms">เงื่อนไขการใช้งาน</Link>
            <span aria-hidden="true">•</span>
            <Link to="/privacy">นโยบายความเป็นส่วนตัว</Link>
          </div>
          <p className="landing-footer-copy">© {new Date().getFullYear()} TEWMai</p>
        </div>
      </div>
    </section>
  );
};

export default LandingFooter;

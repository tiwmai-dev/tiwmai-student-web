import React, { useState, useEffect, useCallback } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import loginBannerImage from '../assets/images/illustrations/auth-login-banner.webp';

const BrandWordmark = () => (
  <span className="auth-modal-brand" aria-label="TEWMai">
    <span className="auth-modal-brand-tew">TEW</span>
    <span className="auth-modal-brand-mai">Mai</span>
  </span>
);

const AuthModal = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState(initialMode);
  const isRegisterMode = mode === 'register';
  const isThemedMode = mode === 'login' || mode === 'register';

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, isOpen]);

  const handleSwitchToLogin = () => {
    setMode('login');
  };

  const handleSwitchToRegister = () => {
    setMode('register');
  };

  const handleClose = useCallback(() => {
    setMode('login');
    onClose();
  }, [onClose]);

  // Handle click outside modal
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleClose, isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div className={`auth-modal ${isThemedMode ? 'login-mode' : ''}`}>
        <button 
          className="auth-modal-close"
          onClick={handleClose}
          type="button"
          aria-label="ปิดหน้าต่างเข้าสู่ระบบ"
        >
          ×
        </button>

        {isThemedMode ? (
          <>
            <aside className="auth-modal-welcome" aria-hidden="true">
              <div className="auth-modal-welcome-visual">
                <img src={loginBannerImage} alt="" />
              </div>
              <h3>
                {isRegisterMode ? (
                  <>
                    เริ่มต้นกับ <BrandWordmark />
                  </>
                ) : (
                  <>
                    ยินดีต้อนรับสู่ <BrandWordmark />
                  </>
                )}
              </h3>
              <p>
                {isRegisterMode
                  ? 'ลงทะเบียนเพื่อปลดล็อกบทเรียนแบบเฉพาะตัว ติดตามพัฒนาการ และฝึกโจทย์ได้ต่อเนื่องทุกวัน'
                  : 'AI ผู้ช่วยส่วนตัวสำหรับการเรียนของคุณ เรียนรู้ได้ง่ายขึ้น พัฒนาได้อย่างตรงจุด'}
              </p>
            </aside>

            <div className="auth-modal-content">
              {isRegisterMode ? (
                <RegisterForm
                  onSwitchToLogin={handleSwitchToLogin}
                />
              ) : (
                <LoginForm 
                  onSwitchToRegister={handleSwitchToRegister}
                  onClose={handleClose}
                  showHeader
                />
              )}
            </div>
          </>
        ) : (
          <div className="auth-modal-content">
            <RegisterForm 
              onSwitchToLogin={handleSwitchToLogin}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;

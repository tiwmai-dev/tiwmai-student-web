import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const DUPLICATE_EMAIL_MESSAGE = 'อีเมลนี้ถูกใช้สมัครบัญชีแล้ว';
const DUPLICATE_USERNAME_MESSAGE = 'ชื่อผู้ใช้นี้ถูกใช้แล้ว';

const isDuplicateEmailError = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('email already exists')
    || normalized.includes('already registered')
    || normalized.includes(DUPLICATE_EMAIL_MESSAGE);
};

const isDuplicateUsernameError = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('username already exists')
    || normalized.includes(DUPLICATE_USERNAME_MESSAGE);
};

const RegisterForm = ({ onSwitchToLogin = () => {} }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    given_name: '',
    family_name: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  
  const { register, resendVerificationEmail, startOAuthLogin, isLoading, error } = useAuth();

  const handleChange = (e) => {
    if (formError) {
      setFormError('');
    }
    if (fieldErrors[e.target.name]) {
      setFieldErrors((prev) => ({
        ...prev,
        [e.target.name]: '',
      }));
    }
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      return 'รหัสผ่านไม่ตรงกัน';
    }
    
    if (formData.password.length < 8) {
      return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return 'รูปแบบอีเมลไม่ถูกต้อง';
    }

    if (formData.username.length < 3) {
      return 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร';
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    
    const registerData = {
      username: formData.username,
      email: formData.email,
      password: formData.password,
      given_name: formData.given_name || undefined,
      family_name: formData.family_name || undefined,
    };
    
    const result = await register(registerData);
    
    if (result.success) {
      setRegisteredEmail(result.email || formData.email);
      setEmailVerificationRequired(Boolean(result.emailVerificationRequired));
      setResendMessage('');
      setSuccess(true);
    } else if (isDuplicateEmailError(result.error)) {
      setFieldErrors((prev) => ({
        ...prev,
        email: DUPLICATE_EMAIL_MESSAGE,
      }));
    } else if (isDuplicateUsernameError(result.error)) {
      setFieldErrors((prev) => ({
        ...prev,
        username: DUPLICATE_USERNAME_MESSAGE,
      }));
    }
  };

  const handleGoogleRegister = () => {
    setFormError('');
    setFieldErrors({});
    startOAuthLogin('Google');
  };

  const handleResendVerification = async () => {
    setResendMessage('');
    const result = await resendVerificationEmail(registeredEmail || formData.email);
    if (result.success) {
      setResendMessage(result.message || 'ส่งอีเมลยืนยันแล้ว กรุณาตรวจสอบกล่องจดหมาย');
    }
  };

  if (success) {
    if (emailVerificationRequired) {
      const verificationEmail = registeredEmail || formData.email;

      return (
        <div className="auth-form register-auth-form">
          <div
            className="email-verification-panel"
            role="status"
            aria-live="polite"
          >
            <div className="email-verification-header">
              <div className="email-verification-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              </div>
              <h2>กรุณายืนยันอีเมล</h2>
              <p className="email-verification-lead">
                สมัครสมาชิกสำเร็จแล้ว ขั้นตอนสุดท้ายคือยืนยันอีเมลเพื่อเปิดใช้งานบัญชี
              </p>
            </div>

            <div className="email-verification-card">
              <span className="email-verification-card-label">ส่งลิงก์ยืนยันไปที่</span>
              <strong className="email-verification-email">{verificationEmail}</strong>
            </div>

            <ul className="email-verification-steps">
              <li>เปิดกล่องจดหมายและกดลิงก์ยืนยัน</li>
              <li>หากไม่เจอ ให้ตรวจโฟลเดอร์ Spam / Junk</li>
              <li>หลังยืนยันแล้ว กลับมาเข้าสู่ระบบได้ทันที</li>
            </ul>

            {resendMessage && (
              <p className="email-verification-feedback" role="status">
                {resendMessage}
              </p>
            )}

            <div className="email-verification-actions">
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="auth-submit-btn"
              >
                ไปหน้าเข้าสู่ระบบ
              </button>
              <button
                type="button"
                onClick={handleResendVerification}
                className="auth-secondary-btn email-verification-resend-btn"
                disabled={isLoading}
              >
                {isLoading ? 'กำลังส่งอีเมล...' : 'ส่งอีเมลยืนยันอีกครั้ง'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="auth-form register-auth-form">
        <div className="success-message" role="status" aria-live="polite">
          <div className="success-icon" aria-hidden="true">✓</div>
          <h2>สร้างบัญชีนักเรียนสำเร็จ</h2>
          <p>บัญชีของคุณได้ถูกสร้างเรียบร้อยแล้ว</p>
          <p>กำลังไปหน้าเข้าสู่ระบบ...</p>
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="auth-submit-btn"
          >
            ไปหน้าเข้าสู่ระบบเลย
          </button>
        </div>
      </div>
    );
  }

  const emailErrorId = fieldErrors.email ? 'register-email-error' : undefined;
  const usernameErrorId = fieldErrors.username ? 'register-username-error' : undefined;
  const generalError = isDuplicateEmailError(error) || isDuplicateUsernameError(error)
    ? ''
    : (error || formError);

  return (
    <div className="auth-form register-auth-form">
      <div className="auth-header">
        <h2>สร้างบัญชีนักเรียน</h2>
        <p>สร้างบัญชีเพื่อเริ่มเรียนกับ AI Teaching Assistant</p>
      </div>

      {generalError && (
        <div className="error-message" role="alert" aria-live="polite">
          <span className="error-icon" aria-hidden="true">❌</span>
          {generalError}
        </div>
      )}

      <button
        type="button"
        className="oauth-button google"
        onClick={handleGoogleRegister}
        disabled={isLoading}
      >
        <span className="oauth-icon" aria-hidden="true">G</span>
        สมัครด้วย Google
      </button>

      <div className="oauth-divider">
        <span>หรือสร้างบัญชีด้วยอีเมล</span>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="given_name">ชื่อ (ไม่บังคับ)</label>
            <div className="auth-input-shell">
              <span className="auth-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21a8 8 0 1 0-16 0" />
                  <circle cx="12" cy="8" r="4" />
                </svg>
              </span>
              <input
                type="text"
                id="given_name"
                name="given_name"
                value={formData.given_name}
                onChange={handleChange}
                placeholder="ชื่อ"
                disabled={isLoading}
                autoComplete="given-name"
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="family_name">นามสกุล (ไม่บังคับ)</label>
            <div className="auth-input-shell">
              <span className="auth-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21a8 8 0 1 0-16 0" />
                  <circle cx="12" cy="8" r="4" />
                </svg>
              </span>
              <input
                type="text"
                id="family_name"
                name="family_name"
                value={formData.family_name}
                onChange={handleChange}
                placeholder="นามสกุล"
                disabled={isLoading}
                autoComplete="family-name"
              />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="username">ชื่อผู้ใช้ *</label>
          <div className="auth-input-shell">
            <span className="auth-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21a8 8 0 1 0-16 0" />
                <circle cx="12" cy="8" r="4" />
              </svg>
            </span>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="ชื่อผู้ใช้ (อย่างน้อย 3 ตัวอักษร)"
              required
              disabled={isLoading}
              minLength={3}
              autoComplete="username"
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={usernameErrorId}
            />
          </div>
          {fieldErrors.username && (
            <p className="field-error" id={usernameErrorId} role="alert">
              {fieldErrors.username}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="email">อีเมล *</label>
          <div className="auth-input-shell">
            <span className="auth-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </span>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="example@email.com"
              required
              disabled={isLoading}
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={emailErrorId}
            />
          </div>
          {fieldErrors.email && (
            <p className="field-error" id={emailErrorId} role="alert">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="password">รหัสผ่าน *</label>
          <div className="auth-input-shell password-input-container">
            <span className="auth-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"
              required
              disabled={isLoading}
              minLength={8}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
              aria-pressed={showPassword}
            >
              {showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            </button>
          </div>
          <p className="input-helper">รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร</p>
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">ยืนยันรหัสผ่าน *</label>
          <div className="auth-input-shell password-input-container">
            <span className="auth-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="ยืนยันรหัสผ่าน"
              required
              disabled={isLoading}
              minLength={8}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isLoading}
              aria-pressed={showConfirmPassword}
            >
              {showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className={`auth-submit-btn ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="spinner-small"></div>
              กำลังสร้างบัญชี...
            </>
          ) : (
            'สร้างบัญชีนักเรียน'
          )}
        </button>

        <p className="auth-privacy">
          เมื่อสมัครแล้วถือว่ายอมรับ{' '}
          <a href="/terms" className="auth-link">
            ข้อกำหนดการใช้งาน
          </a>{' '}
          และ{' '}
          <a href="/privacy" className="auth-link">
            นโยบายความเป็นส่วนตัว
          </a>
        </p>

        <button
          type="button"
          className="auth-secondary-btn"
          onClick={onSwitchToLogin}
          disabled={isLoading}
        >
          มีบัญชีอยู่แล้ว เข้าสู่ระบบ
        </button>
      </form>

      <div className="auth-footer">
        <div className="auth-support-links">
          <a className="auth-link" href="/terms">
            ข้อกำหนดการใช้งาน
          </a>
          <a className="auth-link" href="/support">
            ติดต่อแอดมิน/ครูผู้สอน
          </a>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;

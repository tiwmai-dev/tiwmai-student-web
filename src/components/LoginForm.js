import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginForm = ({ onSwitchToRegister, onClose, showHeader = false }) => {
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
    rememberMe: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [oauthInProgress, setOauthInProgress] = useState(false);
  const [suppressValidation, setSuppressValidation] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  
  const { login, resendVerificationEmail, startOAuthLogin, isLoading, error } = useAuth();
  const showDemoLogin = useMemo(
    () => process.env.NODE_ENV !== 'production' && process.env.REACT_APP_ENABLE_DEMO_LOGIN === 'true',
    []
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === 'checkbox' ? checked : value;
    setFormData({
      ...formData,
      [name]: nextValue,
    });
    if (suppressValidation) {
      setSuppressValidation(false);
    }
    if (touched[name]) {
      setErrors((prev) => ({ ...prev, [name]: validateField(name, nextValue) }));
    }
  };

  const validateField = (name, value) => {
    if (name === 'identifier') {
      if (!value.trim()) {
        return 'กรุณากรอกอีเมลหรือชื่อผู้ใช้';
      }
    }

    if (name === 'password') {
      if (!value.trim()) {
        return 'กรุณากรอกรหัสผ่าน';
      }
      if (value.length < 8) {
        return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
      }
    }

    return '';
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (suppressValidation) {
      return;
    }
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const validateForm = () => {
    const nextErrors = {
      identifier: validateField('identifier', formData.identifier),
      password: validateField('password', formData.password),
    };

    setErrors(nextErrors);
    setTouched({ identifier: true, password: true });

    return !nextErrors.identifier && !nextErrors.password;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const result = await login(formData.identifier, formData.password, formData.rememberMe);
    
    if (result.success) {
      onClose && onClose();
    }
  };

  const handleDemoLogin = async () => {
    const demoCredentials = { identifier: 'demo', password: 'password' };
    setFormData((prev) => ({ ...prev, ...demoCredentials, rememberMe: false }));
    setTouched((prev) => ({ ...prev, identifier: true, password: true }));
    setErrors((prev) => ({ ...prev, identifier: '', password: '' }));

    // Demo login stays opt-in and only appears in non-production builds.
    const result = await login(demoCredentials.identifier, demoCredentials.password, false);
    if (result.success) {
      onClose && onClose();
    }
  };

  const handleGoogleLogin = async () => {
    setSuppressValidation(true);
    setTouched({});
    setErrors({});
    setOauthInProgress(true);
    const result = await startOAuthLogin('Google');
    if (!result?.success) {
      setOauthInProgress(false);
    }
  };

  const identifierError = !oauthInProgress && touched.identifier ? errors.identifier : '';
  const passwordError = !oauthInProgress && touched.password ? errors.password : '';
  const passwordHelperId = 'student-password-helper';
  const passwordErrorId = passwordError ? 'student-password-error' : undefined;
  const identifierErrorId = identifierError ? 'student-identifier-error' : undefined;
  const passwordAriaDescribedBy = [passwordHelperId, passwordErrorId].filter(Boolean).join(' ');
  const isEmailNotVerifiedError = String(error || '').includes('ยืนยันอีเมล');
  const canResendVerification = isEmailNotVerifiedError && formData.identifier.includes('@');

  const handleResendVerification = async () => {
    setResendMessage('');
    const result = await resendVerificationEmail(formData.identifier.trim());
    if (result.success) {
      setResendMessage(result.message || 'ส่งอีเมลยืนยันแล้ว กรุณาตรวจสอบกล่องจดหมาย');
    }
  };

  return (
    <div className="auth-form login-auth-form">
      {showHeader && (
        <div className="auth-header">
          <h2>เข้าสู่ระบบนักเรียน</h2>
          <p>เข้าสู่ระบบเพื่อเรียนกับ AI Teaching Assistant</p>
        </div>
      )}
      {error && (
        <div className="error-message" role="alert" aria-live="polite">
          <span className="error-icon" aria-hidden="true">❌</span>
          {error}
        </div>
      )}

      {canResendVerification && (
        <div className="verification-resend-panel">
          {resendMessage && (
            <p className="verification-resend-message" role="status">{resendMessage}</p>
          )}
          <button
            type="button"
            className="auth-secondary-btn"
            onClick={handleResendVerification}
            disabled={isLoading}
          >
            {isLoading ? 'กำลังส่งอีเมล...' : 'ส่งอีเมลยืนยันอีกครั้ง'}
          </button>
        </div>
      )}

      <button
        type="button"
        className="oauth-button google"
        onMouseDown={() => setSuppressValidation(true)}
        onClick={handleGoogleLogin}
        disabled={isLoading}
      >
        <span className="oauth-icon" aria-hidden="true">G</span>
        เข้าสู่ระบบด้วย Google
      </button>

      <div className="oauth-divider">
        <span>หรือเข้าสู่ระบบด้วยอีเมล</span>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="student-identifier">อีเมลหรือชื่อผู้ใช้</label>
          <div className="auth-input-shell">
            <span className="auth-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21a8 8 0 1 0-16 0" />
                <circle cx="12" cy="8" r="4" />
              </svg>
            </span>
            <input
              type="text"
              id="student-identifier"
              name="identifier"
              value={formData.identifier}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="กรอกอีเมลหรือชื่อผู้ใช้"
              required
              autoComplete="username"
              autoFocus
              disabled={isLoading}
              aria-invalid={Boolean(identifierError)}
              aria-describedby={identifierErrorId || undefined}
            />
          </div>
          {identifierError && (
            <p className="field-error" id={identifierErrorId} role="alert">
              {identifierError}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="student-password">รหัสผ่าน</label>
          <div className="auth-input-shell password-input-container">
            <span className="auth-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              id="student-password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="กรอกรหัสผ่าน"
              required
              minLength={8}
              autoComplete="current-password"
              disabled={isLoading}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordAriaDescribedBy}
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
          <p className="input-helper" id={passwordHelperId}>
            รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร
          </p>
          {passwordError && (
            <p className="field-error" id={passwordErrorId} role="alert">
              {passwordError}
            </p>
          )}
        </div>

        <div className="auth-form-row">
          <label className="checkbox-field">
            <input
              type="checkbox"
              name="rememberMe"
              checked={formData.rememberMe}
              onChange={handleChange}
              disabled={isLoading}
            />
            จำฉันไว้
          </label>
          <a className="auth-link" href="/forgot-password">
            ลืมรหัสผ่าน?
          </a>
        </div>

        <button
          type="submit"
          className={`auth-submit-btn ${isLoading ? 'loading' : ''}`}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="spinner-small"></div>
              กำลังเข้าสู่ระบบ...
            </>
          ) : (
            'เข้าสู่ระบบ'
          )}
        </button>
        <p className="auth-privacy">
          เราเก็บข้อมูลเพื่อพัฒนาการเรียนเท่านั้น{' '}
          <a href="/privacy" className="auth-link">
            นโยบายความเป็นส่วนตัว
          </a>
        </p>

        <button
          type="button"
          className="auth-secondary-btn"
          onClick={onSwitchToRegister}
          disabled={isLoading}
        >
          สร้างบัญชีใหม่
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

      {showDemoLogin && (
        <details className="auth-demo">
          <summary>โหมดทดลอง</summary>
          <p>เข้าถึงบัญชีตัวอย่างเพื่อทดลองใช้งานระบบ</p>
          <button
            type="button"
            className="auth-demo-btn"
            onClick={handleDemoLogin}
            disabled={isLoading}
          >
            เข้าสู่ระบบแบบทดลอง
          </button>
        </details>
      )}
    </div>
  );
};

export default LoginForm;

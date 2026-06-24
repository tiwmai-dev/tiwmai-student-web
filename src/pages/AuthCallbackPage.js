import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageLoading from '../components/PageLoading';

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const { completeOAuthLogin, completeOAuthTokenLogin } = useAuth();
  const [message, setMessage] = useState('กำลังเชื่อมต่อบัญชี Google...');
  const [isLoading, setIsLoading] = useState(true);
  const hasHandledCallback = useRef(false);

  useEffect(() => {
    if (hasHandledCallback.current) return;
    hasHandledCallback.current = true;

    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
    );
    const code = queryParams.get('code');
    const state = queryParams.get('state') || hashParams.get('state');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const providerToken = hashParams.get('provider_token');
    const providerRefreshToken = hashParams.get('provider_refresh_token');
    const tokenType = hashParams.get('token_type');
    const expiresIn = hashParams.get('expires_in');
    const confirmationType = hashParams.get('type');
    const isEmailConfirmation = confirmationType === 'signup'
      || confirmationType === 'email'
      || confirmationType === 'email_change';

    setMessage(
      isEmailConfirmation ? 'กำลังยืนยันอีเมล...' : 'กำลังเชื่อมต่อบัญชี Google...'
    );

    if (!code && !accessToken) {
      setMessage('ไม่พบรหัสยืนยันจากระบบ');
      setIsLoading(false);
      return;
    }

    const handleCallback = async () => {
      try {
        let result;
        if (accessToken) {
          result = await completeOAuthTokenLogin({
            access_token: accessToken,
            refresh_token: refreshToken || undefined,
            provider_token: providerToken || undefined,
            provider_refresh_token: providerRefreshToken || undefined,
            token_type: tokenType || 'Bearer',
            expires_in: expiresIn ? Number(expiresIn) : undefined,
          });
        } else {
          result = await completeOAuthLogin(code, state);
        }
        if (result.success) {
          window.history.replaceState({}, document.title, window.location.pathname);
          navigate('/dashboard', { replace: true });
        } else {
          setMessage(
            result.error
              || (isEmailConfirmation ? 'ยืนยันอีเมลไม่สำเร็จ' : 'เชื่อมต่อบัญชีไม่สำเร็จ')
          );
          setIsLoading(false);
        }
      } catch (error) {
        setMessage(isEmailConfirmation ? 'ยืนยันอีเมลไม่สำเร็จ' : 'เชื่อมต่อบัญชีไม่สำเร็จ');
        setIsLoading(false);
      }
    };

    handleCallback();
  }, [completeOAuthLogin, completeOAuthTokenLogin, navigate]);

  if (isLoading) {
    return <PageLoading label={message} />;
  }

  return (
    <div className="auth-callback">
      <div className="auth-callback-card">
        <p>{message}</p>
        <button
          type="button"
          className="auth-secondary-btn"
          onClick={() => navigate('/', { replace: true })}
        >
          กลับไปหน้าเข้าสู่ระบบ
        </button>
      </div>
    </div>
  );
};

export default AuthCallbackPage;

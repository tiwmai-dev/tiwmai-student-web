import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { setAnalyticsUser, trackEvent } from '../utils/analytics';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api/v1';
const ONBOARDING_STATUS = {
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  UNKNOWN: 'unknown',
};
const UNKNOWN_ONBOARDING = {
  status: ONBOARDING_STATUS.UNKNOWN,
  completed: null,
  profile: null,
};
const POST_LOGIN_METADATA_TIMEOUT_MS = 8000;
const ONBOARDING_RETRY_INTERVAL_MS = 10000;
const AUTH_SESSION_INVALID_CODE = 'AUTH_SESSION_INVALID';
const ACCESS_TOKEN_KEY = 'student_access_token';
const REFRESH_TOKEN_KEY = 'student_refresh_token';
const ID_TOKEN_KEY = 'student_id_token';

const createKnownOnboarding = (completed, profile = null) => ({
  status: completed ? ONBOARDING_STATUS.COMPLETE : ONBOARDING_STATUS.INCOMPLETE,
  completed,
  profile: profile || null,
});

const parseOnboardingResponse = (data) => {
  if (data?.onboarding_completed === true) {
    return createKnownOnboarding(true, data?.onboarding_profile);
  }
  if (data?.onboarding_completed === false) {
    return createKnownOnboarding(false, data?.onboarding_profile);
  }
  return UNKNOWN_ONBOARDING;
};

const mergeUserWithStableOnboarding = (previousUser, nextUser) => {
  if (!previousUser || !nextUser) return nextUser;

  const previousOnboarding = previousUser.onboarding;
  const nextOnboarding = nextUser.onboarding || UNKNOWN_ONBOARDING;
  const wasCompleted = previousOnboarding?.status === ONBOARDING_STATUS.COMPLETE
    || previousOnboarding?.completed === true;
  const nextIsUnknown = nextOnboarding.status === ONBOARDING_STATUS.UNKNOWN;

  if (!wasCompleted || !nextIsUnknown) {
    return nextUser;
  }

  return {
    ...nextUser,
    name: previousOnboarding?.profile?.nickname || previousUser.name || nextUser.name,
    onboarding: previousOnboarding,
  };
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = POST_LOGIN_METADATA_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const formatApiError = (data, fallback) => {
  const detail = data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => item?.msg || item?.message || item?.detail)
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join(', ');
    }
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message;
  }
  return fallback;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [error, setError] = useState(null);
  const refreshInFlightRef = useRef(null);
  const getStudentOnboardingRef = useRef(null);

  useEffect(() => {
    const analyticsUserId = user?.user_id || user?.id || user?.studentId || null;
    setAnalyticsUser(analyticsUserId);
  }, [user?.user_id, user?.id, user?.studentId]);

  const clearStoredAuth = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ID_TOKEN_KEY);
  };

  const storeTokens = (tokenData) => {
    if (tokenData?.access_token) {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokenData.access_token);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }

    if (tokenData?.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokenData.refresh_token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }

    if (tokenData?.id_token) {
      localStorage.setItem(ID_TOKEN_KEY, tokenData.id_token);
    } else {
      localStorage.removeItem(ID_TOKEN_KEY);
    }
  };

  const buildAuthHeaders = (token, headers = {}) => ({
    ...headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': headers['Content-Type'] || 'application/json',
  });

  const markSessionInvalid = () => {
    const authError = new Error('Authentication session is invalid');
    authError.code = AUTH_SESSION_INVALID_CODE;
    clearStoredAuth();
    setUser(null);
    return authError;
  };

  const refreshStoredSession = async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      return null;
    }

    refreshInFlightRef.current = (async () => {
      const response = await fetch(`${API_BASE_URL}/student/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: storedRefreshToken }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.access_token) {
        clearStoredAuth();
        setUser(null);
        return null;
      }

      storeTokens(data);
      return data.access_token;
    })();

    try {
      return await refreshInFlightRef.current;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    } finally {
      refreshInFlightRef.current = null;
    }
  };

  const fetchWithAuthRetry = async (url, options = {}, token, timeoutMs = POST_LOGIN_METADATA_TIMEOUT_MS) => {
    const requestWithToken = (requestToken) => {
      const headers = buildAuthHeaders(requestToken, options.headers || {});
      if (options.body instanceof FormData) {
        delete headers['Content-Type'];
      }
      return fetchWithTimeout(
        url,
        {
          ...options,
          headers,
        },
        timeoutMs
      );
    };

    let response = await requestWithToken(token);
    if (response.status !== 401 && response.status !== 403) {
      return response;
    }

    const refreshedToken = await refreshStoredSession();
    if (!refreshedToken) {
      throw markSessionInvalid();
    }

    response = await requestWithToken(refreshedToken);
    if (response.status === 401 || response.status === 403) {
      throw markSessionInvalid();
    }

    return response;
  };

  const getStudentOnboarding = async (token) => {
    try {
      const response = await fetchWithAuthRetry(
        `${API_BASE_URL}/student/auth/onboarding-profile`,
        {},
        token
      );

      if (!response.ok) {
        return UNKNOWN_ONBOARDING;
      }

      const data = await response.json();
      return parseOnboardingResponse(data);
    } catch (error) {
      if (error?.code === AUTH_SESSION_INVALID_CODE) {
        throw error;
      }
      if (error?.name === 'AbortError') {
        return UNKNOWN_ONBOARDING;
      }
      console.error('Failed to load onboarding profile:', error);
      return UNKNOWN_ONBOARDING;
    }
  };

  useEffect(() => {
    getStudentOnboardingRef.current = getStudentOnboarding;
  });

  const enrichUserData = async (token, userInfo) => {
    try {
      const onboarding = await getStudentOnboarding(token);
      const profile = onboarding?.profile || null;
      const fallbackName = userInfo?.given_name || userInfo?.username || 'นักเรียน';

      return {
        ...userInfo,
        name: profile?.nickname || fallbackName,
        avatar_url: profile?.avatar_url || userInfo?.avatar_url,
        studentId: userInfo?.student_id || userInfo?.username || userInfo?.user_id,
        onboarding,
        // Course-aware pages load fresh enrollment data after auth bootstrap.
        enrolledCourses: []
      };
    } catch (error) {
      if (error?.code === AUTH_SESSION_INVALID_CODE) {
        throw error;
      }
      console.error('Failed to enrich user data:', error);
      return {
        ...userInfo,
        name: userInfo?.given_name || userInfo?.username || 'นักเรียน',
        studentId: userInfo?.student_id || userInfo?.username || userInfo?.user_id,
        onboarding: UNKNOWN_ONBOARDING,
        enrolledCourses: []
      };
    }
  };

  const loadAuthenticatedUser = async (
    token,
    {
      clearOnFailure = true,
      finishBootstrapping = false,
    } = {}
  ) => {
    try {
      const response = await fetchWithAuthRetry(
        `${API_BASE_URL}/student/auth/me`,
        {},
        token
      );

      if (!response.ok) {
        if (clearOnFailure) {
          clearStoredAuth();
          setUser(null);
        }
        return null;
      }

      const userData = await response.json();
      const activeToken = localStorage.getItem(ACCESS_TOKEN_KEY) || token;
      const fullUserData = await enrichUserData(activeToken, userData);
      setUser((prev) => mergeUserWithStableOnboarding(prev, fullUserData));
      return fullUserData;
    } catch (loadError) {
      console.error('Token validation failed:', loadError);
      if (clearOnFailure) {
        clearStoredAuth();
        setUser(null);
      }
      return null;
    } finally {
      if (finishBootstrapping) {
        setIsBootstrapping(false);
      }
    }
  };

  // Check if user is authenticated on app load
  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
      validateToken(token);
    } else {
      setIsBootstrapping(false);
    }
  }, []);

  const validateToken = async (token) => {
    await loadAuthenticatedUser(token, { finishBootstrapping: true });
  };

  const login = async (username, password) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/student/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        storeTokens(data);

        const fullUserData = await enrichUserData(data.access_token, data.user);
        setUser(fullUserData);
        setAnalyticsUser(fullUserData?.user_id || fullUserData?.id || fullUserData?.studentId);
        trackEvent('login', { method: 'password' });
        return { success: true, user: fullUserData };
      } else {
        const errorMessage = formatApiError(data, 'Login failed');
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = 'Network error. Please check your connection.';
      clearStoredAuth();
      setUser(null);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/student/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok) {
        trackEvent('sign_up', { method: 'password' });
        return { success: true, message: data.message };
      } else {
        const errorMessage = formatApiError(data, 'Registration failed');
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      if (error?.code === AUTH_SESSION_INVALID_CODE) {
        const errorMessage = 'Authentication session is invalid';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
      const errorMessage = 'Network error. Please check your connection.';
      clearStoredAuth();
      setUser(null);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const startOAuthLogin = async (provider = 'Google') => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/student/auth/oauth/authorize?provider=${encodeURIComponent(provider)}`
      );
      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.detail || 'OAuth initialization failed';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      if (data.state) {
        sessionStorage.setItem('student_oauth_state', data.state);
      }
      window.location.assign(data.authorization_url);
      return { success: true };
    } catch (error) {
      if (error?.code === AUTH_SESSION_INVALID_CODE) {
        const errorMessage = 'Authentication session is invalid';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
      const errorMessage = 'Network error. Please check your connection.';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const completeOAuthLogin = async (code, state) => {
    setError(null);
    setIsLoading(true);
    try {
      const storedState = sessionStorage.getItem('student_oauth_state');
      if (state && storedState && state !== storedState) {
        const errorMessage = 'OAuth state mismatch';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      const response = await fetch(`${API_BASE_URL}/student/auth/oauth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, state }),
      });

      const data = await response.json();

      if (response.ok) {
        storeTokens(data);
        const fullUserData = await enrichUserData(data.access_token, data.user);
        setUser(fullUserData);
        sessionStorage.removeItem('student_oauth_state');
        setAnalyticsUser(fullUserData?.user_id || fullUserData?.id || fullUserData?.studentId);
        trackEvent('login', { method: 'google' });
        return { success: true, user: fullUserData };
      }

      const errorMessage = data.detail || 'OAuth login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } catch (error) {
      const errorMessage = 'Network error. Please check your connection.';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const completeOAuthTokenLogin = async (tokenData = {}) => {
    setError(null);
    setIsLoading(true);
    try {
      if (!tokenData.access_token) {
        const errorMessage = 'Missing OAuth access token';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      let sessionResponse;
      let sessionData = {};
      try {
        sessionResponse = await fetch(`${API_BASE_URL}/student/auth/oauth/session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(tokenData),
        });
        sessionData = await sessionResponse.json().catch(() => ({}));
      } catch (sessionError) {
        console.error('OAuth session normalization failed:', sessionError);
        const errorMessage = 'Unable to establish secure OAuth session';
        clearStoredAuth();
        setUser(null);
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      if (!sessionResponse?.ok) {
        const errorMessage = sessionData?.detail || 'OAuth session normalization failed';
        clearStoredAuth();
        setUser(null);
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      if (!sessionData?.access_token || !sessionData?.user) {
        const errorMessage = 'OAuth session is missing required credentials';
        clearStoredAuth();
        setUser(null);
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      storeTokens(sessionData);
      const fullUserData = await enrichUserData(sessionData.access_token, sessionData.user);
      setUser(fullUserData);
      sessionStorage.removeItem('student_oauth_state');
      setAnalyticsUser(fullUserData?.user_id || fullUserData?.id || fullUserData?.studentId);
      trackEvent('login', { method: 'google' });
      return { success: true, user: fullUserData };
    } catch (error) {
      const errorMessage = 'Network error. Please check your connection.';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/student/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      // Always clear local storage and state
      clearStoredAuth();
      setUser(null);
      setAnalyticsUser(null);
      setError(null);
    }
  };

  const refreshUser = async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    const refreshedUser = await loadAuthenticatedUser(token, { clearOnFailure: false });
    if (!refreshedUser) {
      return { success: false, error: 'Failed to refresh user' };
    }

    return { success: true, user: refreshedUser };
  };

  const refreshToken = async () => {
    const refreshedToken = await refreshStoredSession();

    if (!refreshedToken) {
      logout();
      return false;
    }

    return true;
  };

  const saveOnboardingProfile = async (payload) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetchWithAuthRetry(
        `${API_BASE_URL}/student/auth/onboarding-profile`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
        token
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data?.detail || 'ไม่สามารถบันทึกข้อมูลได้' };
      }

      setUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          name: data?.onboarding_profile?.nickname || prev.name,
          avatar_url: data?.onboarding_profile?.avatar_url || prev.avatar_url,
          onboarding: createKnownOnboarding(data?.onboarding_completed !== false, data?.onboarding_profile || payload),
        };
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to save onboarding profile:', error);
      return { success: false, error: 'เกิดข้อผิดพลาดของเครือข่าย' };
    }
  };

  const uploadAvatar = async (file) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }
    if (!file) {
      return { success: false, error: 'กรุณาเลือกรูปโปรไฟล์' };
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetchWithAuthRetry(
        `${API_BASE_URL}/student/auth/avatar`,
        {
          method: 'POST',
          body: formData,
        },
        token,
        30000
      );

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: formatApiError(data, 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ') };
      }

      setUser((prev) => {
        if (!prev) return prev;
        const previousProfile = prev.onboarding?.profile || {};
        return {
          ...prev,
          avatar_url: data.avatar_url || prev.avatar_url,
          onboarding: {
            ...(prev.onboarding || UNKNOWN_ONBOARDING),
            profile: {
              ...previousProfile,
              avatar_url: data.avatar_url || previousProfile.avatar_url,
              avatar_storage_path: data.avatar_storage_path || previousProfile.avatar_storage_path,
              avatar_bucket: data.avatar_bucket || previousProfile.avatar_bucket,
              avatar_data_url: null,
            },
          },
        };
      });

      return { success: true, data };
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      return { success: false, error: 'เกิดข้อผิดพลาดระหว่างอัปโหลดรูป' };
    }
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // Auto-refresh token before it expires
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      refreshToken();
    }, 25 * 60 * 1000); // Refresh every 25 minutes (tokens expire in 30 minutes)

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const refreshOnResume = () => {
      if (document.visibilityState === 'visible') {
        refreshToken();
      }
    };

    window.addEventListener('focus', refreshOnResume);
    document.addEventListener('visibilitychange', refreshOnResume);

    return () => {
      window.removeEventListener('focus', refreshOnResume);
      document.removeEventListener('visibilitychange', refreshOnResume);
    };
  }, [user]);

  useEffect(() => {
    if (user?.onboarding?.status !== ONBOARDING_STATUS.UNKNOWN) return undefined;

    let isCancelled = false;
    const retryOnboarding = async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token || !getStudentOnboardingRef.current) return;

      try {
        const onboarding = await getStudentOnboardingRef.current(token);
        if (isCancelled || onboarding.status === ONBOARDING_STATUS.UNKNOWN) return;

        setUser((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            name: onboarding.profile?.nickname || prev.name,
            onboarding,
          };
        });
      } catch (error) {
        if (error?.code !== AUTH_SESSION_INVALID_CODE) {
          console.error('Failed to retry onboarding profile:', error);
        }
      }
    };

    const retryId = setInterval(retryOnboarding, ONBOARDING_RETRY_INTERVAL_MS);
    return () => {
      isCancelled = true;
      clearInterval(retryId);
    };
  }, [user?.onboarding?.status, user?.user_id]);

  const value = {
    user,
    isLoading,
    isBootstrapping,
    error,
    login,
    register,
    startOAuthLogin,
    completeOAuthLogin,
    completeOAuthTokenLogin,
    logout,
    refreshUser,
    refreshToken,
    saveOnboardingProfile,
    uploadAvatar,
    getAuthHeaders,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

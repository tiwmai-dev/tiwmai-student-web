export const ACCESS_TOKEN_KEY = 'student_access_token';
export const REFRESH_TOKEN_KEY = 'student_refresh_token';
export const ID_TOKEN_KEY = 'student_id_token';

const TOKEN_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, ID_TOKEN_KEY];

export const getActiveTokenStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (sessionStorage.getItem(ACCESS_TOKEN_KEY)) {
    return sessionStorage;
  }

  if (localStorage.getItem(ACCESS_TOKEN_KEY)) {
    return localStorage;
  }

  return null;
};

export const getStoredAccessToken = () => getActiveTokenStorage()?.getItem(ACCESS_TOKEN_KEY) || null;

export const getStoredRefreshToken = () => getActiveTokenStorage()?.getItem(REFRESH_TOKEN_KEY) || null;

export const isRememberMeSession = () => getActiveTokenStorage() === localStorage;

export const clearStoredAuthTokens = () => {
  if (typeof window === 'undefined') {
    return;
  }

  TOKEN_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

export const storeAuthTokens = (tokenData, { rememberMe = true } = {}) => {
  if (typeof window === 'undefined') {
    return;
  }

  const storage = rememberMe ? localStorage : sessionStorage;
  const otherStorage = rememberMe ? sessionStorage : localStorage;

  TOKEN_KEYS.forEach((key) => otherStorage.removeItem(key));

  if (tokenData?.access_token) {
    storage.setItem(ACCESS_TOKEN_KEY, tokenData.access_token);
  } else {
    storage.removeItem(ACCESS_TOKEN_KEY);
  }

  if (tokenData?.refresh_token) {
    storage.setItem(REFRESH_TOKEN_KEY, tokenData.refresh_token);
  } else {
    storage.removeItem(REFRESH_TOKEN_KEY);
  }

  if (tokenData?.id_token) {
    storage.setItem(ID_TOKEN_KEY, tokenData.id_token);
  } else {
    storage.removeItem(ID_TOKEN_KEY);
  }
};

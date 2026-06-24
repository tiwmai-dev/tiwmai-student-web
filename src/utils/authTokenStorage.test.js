import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  clearStoredAuthTokens,
  getActiveTokenStorage,
  getStoredAccessToken,
  getStoredRefreshToken,
  isRememberMeSession,
  storeAuthTokens,
} from './authTokenStorage';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('authTokenStorage', () => {
  test('stores persistent tokens in localStorage when rememberMe is true', () => {
    storeAuthTokens(
      { access_token: 'access', refresh_token: 'refresh', id_token: 'id' },
      { rememberMe: true }
    );

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh');
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(isRememberMeSession()).toBe(true);
  });

  test('stores session-only tokens in sessionStorage when rememberMe is false', () => {
    storeAuthTokens(
      { access_token: 'access', refresh_token: 'refresh', id_token: 'id' },
      { rememberMe: false }
    );

    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access');
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh');
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(isRememberMeSession()).toBe(false);
  });

  test('switches storage mode and clears the previous storage', () => {
    storeAuthTokens({ access_token: 'persistent' }, { rememberMe: true });
    storeAuthTokens({ access_token: 'temporary' }, { rememberMe: false });

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe('temporary');
    expect(getStoredAccessToken()).toBe('temporary');
    expect(getStoredRefreshToken()).toBeNull();
    expect(getActiveTokenStorage()).toBe(sessionStorage);
  });

  test('clearStoredAuthTokens removes tokens from both storages', () => {
    storeAuthTokens({ access_token: 'access', refresh_token: 'refresh' }, { rememberMe: true });
    clearStoredAuthTokens();

    expect(getStoredAccessToken()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
  });
});

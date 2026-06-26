import posthog from 'posthog-js';

const getPosthogKey = () => process.env.REACT_APP_POSTHOG_KEY?.trim();
const getPosthogHost = () => process.env.REACT_APP_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
const APP_TYPE = 'student';
const ENVIRONMENT = process.env.REACT_APP_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'unknown';
const SENSITIVE_QUERY_PARAMS = new Set([
  'access_token',
  'code',
  'email',
  'id_token',
  'provider_refresh_token',
  'provider_token',
  'refresh_token',
  'state',
  'token',
]);

let previousPageLocation = '';
let isInitialized = false;

const canTrack = () => (
  isInitialized
  && typeof window !== 'undefined'
);

const compactParams = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
);

const sanitizePath = (path = '/') => {
  try {
    const url = new URL(path, window.location.origin);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return `${url.pathname}${url.search}`;
  } catch (_) {
    return String(path || '/').split('#')[0];
  }
};

export const initializeAnalytics = () => {
  const posthogKey = getPosthogKey();
  if (!posthogKey || typeof window === 'undefined') return;

  posthog.init(posthogKey, {
    api_host: getPosthogHost(),
    capture_pageview: false,
    person_profiles: 'identified_only',
    autocapture: false,
  });
  isInitialized = true;
};

export const trackPageView = (path) => {
  if (!canTrack()) return;

  const pagePath = sanitizePath(path);
  const pageLocation = `${window.location.origin}${pagePath}`;
  trackEvent('page_view', {
    page_location: pageLocation,
    page_path: pagePath,
    page_title: document.title,
    page_referrer: previousPageLocation || document.referrer || undefined,
  });
  previousPageLocation = pageLocation;
};

export const trackEvent = (eventName, params = {}) => {
  if (!canTrack() || !eventName) return;

  posthog.capture(eventName, compactParams({
    ...params,
    app_type: APP_TYPE,
    environment: ENVIRONMENT,
  }));
};

export const trackEventOnce = (eventName, uniqueKey, params = {}) => {
  if (!uniqueKey || typeof window === 'undefined') return;
  const storageKey = `analytics_event_once:${eventName}:${uniqueKey}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, '1');
  } catch (_) {
    // Analytics should never block the product flow when storage is unavailable.
  }
  trackEvent(eventName, params);
};

export const setAnalyticsUser = (userId, properties = {}) => {
  if (!canTrack()) return;

  if (userId) {
    const userProperties = compactParams(properties);
    posthog.identify(String(userId), Object.keys(userProperties).length ? userProperties : undefined);
    return;
  }

  posthog.reset();
};

const MEASUREMENT_ID = process.env.REACT_APP_GA_MEASUREMENT_ID?.trim();
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

const canTrack = () => (
  Boolean(MEASUREMENT_ID)
  && typeof window !== 'undefined'
  && typeof window.gtag === 'function'
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
  if (!MEASUREMENT_ID || typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    app_type: APP_TYPE,
    environment: ENVIRONMENT,
    debug_mode: ENVIRONMENT === 'staging',
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
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

  window.gtag('event', eventName, compactParams({
    ...params,
    app_type: APP_TYPE,
    environment: ENVIRONMENT,
  }));
};

export const trackEventOnce = (eventName, uniqueKey, params = {}) => {
  if (!uniqueKey || typeof window === 'undefined') return;
  const storageKey = `ga4_event_once:${eventName}:${uniqueKey}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, '1');
  } catch (_) {
    // Analytics should never block the product flow when storage is unavailable.
  }
  trackEvent(eventName, params);
};

export const setAnalyticsUser = (userId) => {
  if (!canTrack()) return;

  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    user_id: userId ? String(userId) : null,
  });
};

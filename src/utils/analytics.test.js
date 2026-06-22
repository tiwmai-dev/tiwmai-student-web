const loadAnalytics = () => {
  jest.resetModules();
  process.env.REACT_APP_GA_MEASUREMENT_ID = 'G-TEST123';
  process.env.REACT_APP_ENVIRONMENT = 'staging';
  window.gtag = jest.fn();
  window.sessionStorage.clear();
  return require('./analytics');
};

afterEach(() => {
  delete process.env.REACT_APP_GA_MEASUREMENT_ID;
  delete process.env.REACT_APP_ENVIRONMENT;
  delete window.gtag;
  window.sessionStorage.clear();
});

test('adds shared parameters and removes sensitive query parameters from page views', () => {
  const { trackPageView } = loadAnalytics();

  trackPageView('/auth/callback?code=secret&view=payment');

  expect(window.gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({
    app_type: 'student',
    environment: 'staging',
    page_path: '/auth/callback?view=payment',
  }));
});

test('tracks a once-only event once per session', () => {
  const { trackEventOnce } = loadAnalytics();

  trackEventOnce('purchase', 'pi_123', { transaction_id: 'pi_123' });
  trackEventOnce('purchase', 'pi_123', { transaction_id: 'pi_123' });

  expect(window.gtag).toHaveBeenCalledTimes(1);
});

test('updates user id without emitting an automatic page view', () => {
  const { setAnalyticsUser } = loadAnalytics();

  setAnalyticsUser('user-123');

  expect(window.gtag).toHaveBeenCalledWith('config', 'G-TEST123', {
    send_page_view: false,
    user_id: 'user-123',
  });
});

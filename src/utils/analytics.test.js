jest.mock('posthog-js', () => ({
  init: jest.fn(),
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
}));

describe('analytics', () => {
  let analytics;
  let posthog;

  beforeEach(() => {
    jest.resetModules();
    process.env.REACT_APP_POSTHOG_KEY = 'phc_test_key';
    process.env.REACT_APP_ENVIRONMENT = 'staging';
    window.sessionStorage.clear();
    posthog = require('posthog-js');
    analytics = require('./analytics');
    analytics.initializeAnalytics();
  });

  afterEach(() => {
    delete process.env.REACT_APP_POSTHOG_KEY;
    delete process.env.REACT_APP_POSTHOG_HOST;
    delete process.env.REACT_APP_ENVIRONMENT;
    window.sessionStorage.clear();
    jest.clearAllMocks();
  });

  test('adds shared parameters and removes sensitive query parameters from page views', () => {
    analytics.trackPageView('/auth/callback?code=secret&view=payment');

    expect(posthog.capture).toHaveBeenCalledWith('page_view', expect.objectContaining({
      app_type: 'student',
      environment: 'staging',
      page_path: '/auth/callback?view=payment',
    }));
  });

  test('tracks a once-only event once per session', () => {
    analytics.trackEventOnce('purchase', 'pi_123', { transaction_id: 'pi_123' });
    analytics.trackEventOnce('purchase', 'pi_123', { transaction_id: 'pi_123' });

    expect(posthog.capture).toHaveBeenCalledTimes(1);
  });

  test('identifies users and resets when logged out', () => {
    analytics.setAnalyticsUser('user-123');
    analytics.setAnalyticsUser(null);

    expect(posthog.identify).toHaveBeenCalledWith('user-123');
    expect(posthog.reset).toHaveBeenCalledTimes(1);
  });
});

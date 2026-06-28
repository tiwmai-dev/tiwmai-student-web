jest.mock('@sentry/react', () => ({
  setUser: jest.fn(),
  captureException: jest.fn(),
}));

describe('monitoring', () => {
  let monitoring;
  let Sentry;

  beforeEach(() => {
    jest.resetModules();
    process.env.REACT_APP_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    Sentry = require('@sentry/react');
    monitoring = require('./monitoring');
  });

  afterEach(() => {
    delete process.env.REACT_APP_SENTRY_DSN;
    jest.clearAllMocks();
  });

  test('identifies users and clears user context on logout', () => {
    monitoring.setMonitoringUser('user-123', {
      email: 'student@example.com',
      name: 'Student Name',
    });
    monitoring.setMonitoringUser(null);

    expect(Sentry.setUser).toHaveBeenNthCalledWith(1, {
      id: 'user-123',
      email: 'student@example.com',
      username: 'Student Name',
    });
    expect(Sentry.setUser).toHaveBeenNthCalledWith(2, null);
  });

  test('does nothing when Sentry is disabled', () => {
    delete process.env.REACT_APP_SENTRY_DSN;
    jest.resetModules();
    monitoring = require('./monitoring');

    monitoring.setMonitoringUser('user-123');
    monitoring.captureException(new Error('ignored'));

    expect(Sentry.setUser).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

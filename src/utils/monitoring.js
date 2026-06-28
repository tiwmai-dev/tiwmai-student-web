import * as Sentry from '@sentry/react';

const getSentryDsn = () => process.env.REACT_APP_SENTRY_DSN?.trim();

export const isSentryEnabled = () => Boolean(getSentryDsn());

export const setMonitoringUser = (userId, properties = {}) => {
  if (!isSentryEnabled()) return;

  if (userId) {
    Sentry.setUser({
      id: String(userId),
      email: properties.email || undefined,
      username: properties.name || undefined,
    });
    return;
  }

  Sentry.setUser(null);
};

export const captureException = (error, context = {}) => {
  if (!isSentryEnabled()) return;
  Sentry.captureException(error, context);
};

import * as Sentry from '@sentry/react';
import React from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

const getSentryDsn = () => process.env.REACT_APP_SENTRY_DSN?.trim();

const getSentryRelease = () => process.env.REACT_APP_SENTRY_RELEASE?.trim() || undefined;

const getSentryEnvironment = () => (
  process.env.REACT_APP_SENTRY_ENVIRONMENT?.trim()
  || process.env.REACT_APP_ENVIRONMENT?.trim()
  || process.env.NODE_ENV
  || 'unknown'
);

const getTracePropagationTargets = () => {
  const targets = ['localhost', /^\/api\//];
  const apiBaseUrl = process.env.REACT_APP_API_BASE_URL?.trim();

  if (apiBaseUrl) {
    try {
      targets.push(new URL(apiBaseUrl).origin);
    } catch (_) {
      // Ignore invalid API base URLs during local setup.
    }
  }

  return targets;
};

const getTracesSampleRate = (environment) => {
  if (environment === 'production') return 0.1;
  if (environment === 'staging') return 0.2;
  return 1.0;
};

const getReplaySessionSampleRate = (environment) => (
  environment === 'production' ? 0.05 : 0.1
);

const sentryDsn = getSentryDsn();

if (sentryDsn) {
  const environment = getSentryEnvironment();

  Sentry.init({
    dsn: sentryDsn,
    environment,
    release: getSentryRelease(),
    sendDefaultPii: process.env.REACT_APP_SENTRY_SEND_DEFAULT_PII !== 'false',
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: getTracesSampleRate(environment),
    tracePropagationTargets: getTracePropagationTargets(),
    replaysSessionSampleRate: getReplaySessionSampleRate(environment),
    replaysOnErrorSampleRate: 1.0,
    initialScope: {
      tags: {
        app_type: 'student',
      },
    },
  });
}

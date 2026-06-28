const getSentryRelease = () => (
  process.env.REACT_APP_SENTRY_RELEASE?.trim()
  || process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  || undefined
);

const getSentryEnvironment = () => (
  process.env.REACT_APP_SENTRY_ENVIRONMENT?.trim()
  || process.env.REACT_APP_ENVIRONMENT?.trim()
  || process.env.VERCEL_ENV
  || process.env.NODE_ENV
  || 'unknown'
);

const shouldUploadSourceMaps = () => Boolean(
  process.env.SENTRY_AUTH_TOKEN
  && process.env.SENTRY_ORG
  && process.env.SENTRY_PROJECT
  && getSentryRelease()
);

module.exports = {
  getSentryRelease,
  getSentryEnvironment,
  shouldUploadSourceMaps,
};

const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');
const {
  getSentryEnvironment,
  getSentryRelease,
  shouldUploadSourceMaps,
} = require('./scripts/sentry-build-config');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      if (env === 'production') {
        webpackConfig.devtool = 'hidden-source-map';
      }

      return webpackConfig;
    },
    plugins: {
      add: shouldUploadSourceMaps()
        ? [
            sentryWebpackPlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              release: {
                name: getSentryRelease(),
                deploy: {
                  env: getSentryEnvironment(),
                },
              },
              sourcemaps: {
                filesToDeleteAfterUpload: ['**/*.map'],
              },
              telemetry: false,
            }),
          ]
        : [],
    },
  },
};

# PostHog post-wizard report

The wizard completed a deep integration of PostHog analytics into this React Router v6 student web application. PostHog was already partially integrated — `posthog-js` installed, `initializeAnalytics()` wired into `index.js`, and page-view tracking in `App.js`. The wizard extended the existing integration with richer user identification, additional business-critical events, and native error capture.

**Changes made:**

| File | Change |
|------|--------|
| `src/utils/analytics.js` | Extended `setAnalyticsUser` to accept and forward optional person properties (`email`, `name`) on each `posthog.identify()` call |
| `src/contexts/AuthContext.js` | Added `logout` event on sign-out; `oauth_login_started` event when Google OAuth flow begins; `onboarding_complete` event with nickname/avatar metadata when onboarding profile is saved; passed `email`/`name` to `setAnalyticsUser` in all three login paths (password, Google callback, Google token) |
| `src/pages/CoursePage.js` | Added `trial_start` event with `course_id`, `course_name`, `course_category` when a student confirms a free trial enrollment |
| `src/pages/ChatTutorPage.js` | Added `ai_tutor_opened` event (once per session per user) when the AI tutor chat page mounts |
| `src/components/ErrorBoundary.js` | Added `posthog.captureException()` in `componentDidCatch` to send full stack traces to PostHog Error Tracking alongside the existing `exception` event |

**Events summary:**

| Event name | Description | File |
|---|---|---|
| `logout` | User logs out of their account | `src/contexts/AuthContext.js` |
| `oauth_login_started` | User initiates OAuth (Google) login flow | `src/contexts/AuthContext.js` |
| `onboarding_complete` | User completes onboarding profile setup after registration | `src/contexts/AuthContext.js` |
| `trial_start` | User starts a free trial enrollment for a course | `src/pages/CoursePage.js` |
| `ai_tutor_opened` | User opens the AI tutor chat page (once per session) | `src/pages/ChatTutorPage.js` |

**Pre-existing events (already in codebase, not modified):**

| Event name | Description | File |
|---|---|---|
| `login` | User logs in (password or Google) | `src/contexts/AuthContext.js` |
| `sign_up` | User registers a new account | `src/contexts/AuthContext.js` |
| `begin_checkout` | User initiates PromptPay payment | `src/pages/PaymentPage.js` |
| `purchase` | Payment confirmed and course access granted | `src/pages/PaymentPage.js` |
| `view_item` | User views a course detail page | `src/pages/CoursePage.js` |
| `quiz_start` | User starts a quiz or mock exam | `src/components/QuizInterface.js` |
| `quiz_submit` | User submits a completed quiz | `src/components/QuizInterface.js` |
| `exception` | React error caught by ErrorBoundary | `src/components/ErrorBoundary.js` |
| `page_view` | Client-side route navigation | `src/App.js` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) dashboard](https://us.posthog.com/project/485953/dashboard/1760775)
- [Sign-ups over time](https://us.posthog.com/project/485953/insights/0Rveuk6m)
- [Signup to purchase conversion funnel](https://us.posthog.com/project/485953/insights/S0kpKHr8)
- [Quiz completions over time](https://us.posthog.com/project/485953/insights/bIYPiunw)
- [Login methods breakdown](https://us.posthog.com/project/485953/insights/m1JKqmZi)
- [Course view to checkout conversion](https://us.posthog.com/project/485953/insights/k3pRphGf)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures (check `src/utils/analytics.test.js` and `src/utils/authTokenStorage.test.js`).
- [ ] Add `REACT_APP_POSTHOG_KEY` and `REACT_APP_POSTHOG_HOST` to `.env.example` and any CI/CD environment configuration so collaborators know what to set.
- [ ] Wire source-map upload into CI so production stack traces de-minify (the app ships a minified CRA bundle — use `posthog-cli sourcemap` or a Sentry-style upload step in your build pipeline).
- [ ] Confirm the returning-visitor path also calls `identify` — the current bootstrap flow in `AuthContext` calls `loadAuthenticatedUser` on app load, which sets the user state and triggers the `useEffect` that calls `setAnalyticsUser`. Verify this runs before any tracked events on return visits.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

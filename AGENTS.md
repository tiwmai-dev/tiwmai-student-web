# AGENTS.md

## Repository Scope

This repository is the Tiwmai student frontend.

Expected stack:
- React 18
- Create React App / `react-scripts`
- React Router
- Ant Design and local CSS/components
- Build output in `build/`
- Deployment target: Vercel

Keep this repository focused on the student web experience. Do not add backend
API implementation, tutor web screens, admin dashboards, workers, database
migrations, or infrastructure services here.

## Frontend Boundary

- Student frontend talks to the backend through `REACT_APP_API_BASE_URL`.
- Do not hardcode `localhost`, staging, or production API hosts in components.
- Use a small API utility layer for shared request behavior instead of copying
  fetch logic across pages.
- Keep authentication/session behavior consistent with the backend student auth
  endpoints.
- Do not expose service-role keys, private API keys, Stripe private keys, or
  backend-only secrets in any frontend environment variable.
- Only `REACT_APP_*` variables are available to Create React App at build time.

## Environment

Expected local `.env` shape:

```env
REACT_APP_API_BASE_URL=http://localhost:8000/api/v1
REACT_APP_POSTHOG_KEY=
REACT_APP_POSTHOG_HOST=https://us.i.posthog.com
REACT_APP_ENVIRONMENT=local
```

For production on Vercel:

```env
REACT_APP_API_BASE_URL=https://your-api-domain.com/api/v1
REACT_APP_POSTHOG_KEY=
REACT_APP_POSTHOG_HOST=https://us.i.posthog.com
REACT_APP_ENVIRONMENT=production
```

Never commit `.env` files with real values. Keep `.env.example` current when
adding or renaming variables.

## Local Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm start
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

If `npm test` enters watch mode, use a non-watch CI-compatible invocation when
needed:

```bash
CI=true npm test -- --watchAll=false
```

## Vercel Deployment

Use these Vercel settings:

- Framework Preset: Create React App
- Build Command: `npm run build`
- Output Directory: `build`
- Install Command: `npm install`

For SPA routing, keep `vercel.json` equivalent to:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Do not depend on the `proxy` field in `package.json` for production. It only
helps local development.

## UI And Code Conventions

- Preserve existing visual language and layout unless the task asks for a UI
  redesign.
- Keep pages user-facing and complete. Avoid placeholder screens unless the
  task explicitly asks for a placeholder.
- Prefer existing components, utilities, and CSS patterns before adding new
  dependencies.
- Do not introduce a new UI framework without explicit approval.
- Keep student-facing Thai copy natural and consistent with the existing app.
- Make loading, empty, and error states clear for API-backed views.

## Verification

Before considering a frontend change done, run:

```bash
npm run build
```

Run targeted tests when changing behavior with existing tests, and add tests
for risky shared utilities or authentication/payment/course access flows.

If build or tests cannot be run, report the exact command and failure reason.

## Change Discipline

- Keep changes scoped to the student frontend.
- Do not edit backend contracts unless the task explicitly includes the API
  repo.
- When an API contract appears wrong or missing, document the required backend
  change instead of silently hardcoding a frontend workaround.
- Search for existing API calls before changing request or response handling.
- Avoid committing generated `build/` output unless the repository explicitly
  tracks it.

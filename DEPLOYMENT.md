# EdgeTrace Deployment Notes

This document covers the production configuration required before opening EdgeTrace to beta users.

For the current private beta deployment plan, use:

- Frontend: Vercel
- Backend API: Railway
- Database: Neon Postgres
- Auth: Clerk
- Billing: Stripe

Operational runbook: [docs/private-beta-runbook.md](docs/private-beta-runbook.md)

## Required Production Environment

Server:

```env
NODE_ENV=production
AUTH_MODE=clerk
CLERK_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
STRIPE_ADVANCED_PRICE_ID=
FRONTEND_URL=https://your-domain.com
APP_URL=https://your-domain.com
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://user:password@host:5432/edgetrace
# Optional only when DATABASE_PROVIDER=sqlite:
# EDGETRACE_DB_PATH=/persistent/data/edgetrace.sqlite
```

Frontend:

```env
VITE_AUTH_MODE=clerk
VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_BASE_URL=
```

`VITE_API_BASE_URL` can stay empty if the frontend and API are deployed on the same origin. Set it only when the API is hosted on a different origin.

## Clerk Setup

1. Create a Clerk application.
2. Add the deployed EdgeTrace domain to allowed origins/redirect URLs.
3. Set `VITE_CLERK_PUBLISHABLE_KEY` for the frontend.
4. Set `CLERK_SECRET_KEY` for the backend.
5. Do not enable mock auth in production. `AUTH_MODE` and `VITE_AUTH_MODE` must be `clerk`.

## Stripe Setup

1. Create Stripe products for Pro and Advanced.
2. Create recurring monthly prices for each plan.
3. Set:

```env
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ADVANCED_PRICE_ID=price_...
```

4. Set `STRIPE_SECRET_KEY` from Stripe test/live mode as appropriate.
5. Never expose `STRIPE_SECRET_KEY` to the frontend.

## Stripe Webhook Setup

Production endpoint:

```text
https://your-domain.com/api/stripe/webhook
```

Required events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_failed
```

Copy the endpoint signing secret into:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

For local testing:

```bash
stripe listen --forward-to localhost:4000/api/stripe/webhook
```

## Database Notes

EdgeTrace supports two persistence providers:

- `DATABASE_PROVIDER=sqlite` for local development and local beta testing.
- `DATABASE_PROVIDER=postgres` for production deployment.

Local SQLite setup:

```env
DATABASE_PROVIDER=sqlite
EDGETRACE_DB_PATH=/persistent/data/edgetrace.sqlite
```

Do not use SQLite with ephemeral storage unless losing reports is acceptable.

Production Postgres setup:

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://user:password@host:5432/edgetrace
```

Production deployment now requires `DATABASE_PROVIDER=postgres`; the server fails startup in production if it is configured for SQLite.

The Postgres adapter creates the required tables with `CREATE TABLE IF NOT EXISTS` on startup. JSON fields are stored as text for compatibility with the current SQLite schema.

Current migration caveat: this release does not migrate existing SQLite rows into Postgres. For production, start with an empty Postgres database or plan a later export/import or one-time migration script.

## Managed Postgres Test

Use any managed Postgres provider that returns a standard Postgres connection string. EdgeTrace does not require a provider-specific database feature.

Generic setup:

1. Create a new Postgres database/project.
2. Copy the pooled or direct connection string.
3. Set:

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://...
```

4. Run:

```bash
npm run test:db:postgres
```

Provider notes:

- Neon: create a project and use the connection string from the dashboard. Use the pooled URL for serverless-style deployment if your host opens many short-lived connections.
- Supabase: create a project and use the database connection string from Project Settings. Use a pooled connection string if deploying to serverless infrastructure.
- Railway: create a PostgreSQL service and copy `DATABASE_URL` from the service variables.
- Render: create a PostgreSQL instance and copy the external database URL for local testing or the internal URL when the app is hosted on Render.
- Fly Postgres: create a Fly Postgres cluster and use the connection string exposed to the app. For local validation, proxy or expose a connection string according to Fly's current Postgres instructions.

The smoke test creates only rows prefixed with `postgres-smoke-test-`, reads them back, and deletes them. It never logs `DATABASE_URL`.

Manual runtime checklist against managed Postgres:

1. Set `DATABASE_PROVIDER=postgres`.
2. Set `DATABASE_URL`.
3. Start the app.
4. Sign in.
5. Upload `public/sample-trades.csv`.
6. Run diagnostics.
7. Create a collection.
8. Create a saved comparison.
9. Restart the server.
10. Confirm reports, collections, and comparisons persist.
11. Confirm another user cannot see the first user's records.
12. Confirm Stripe webhook plan updates write to the same Postgres-backed `user_profiles` row.

## Local Commands

```bash
npm run dev
npm run validate:env
npm run build
npm run test:imports
npm run test:smoke
npm run test:db:postgres
npm run test:e2e
```

Backend production start command:

```bash
npm run start:server
```

Public backend health check:

```text
/api/health
```

`npm run test:all` runs validation, build, imports, smoke, and e2e tests.

`npm run test:db:postgres` requires both `DATABASE_PROVIDER=postgres` and `DATABASE_URL`.

`npm run test:all:postgres` runs validation, build, imports, smoke, and the managed Postgres smoke test. It intentionally does not run Playwright against Postgres.

## Security Notes

- Rotate any Stripe or Clerk secrets that were shared during development.
- Do not commit `.env.local`.
- Production refuses mock auth.
- Production ignores `x-edgetrace-user-id`.
- Production CORS is restricted to `FRONTEND_URL` or `APP_URL`.
- Webhook verification requires `STRIPE_WEBHOOK_SECRET`.
- Avoid logging trade rows, raw CSV content, broker account data, Clerk tokens, or Stripe secrets.

## Manual Billing Checklist

1. Sign up/sign in with Clerk.
2. Open Pricing.
3. Upgrade to Pro using Stripe test checkout.
4. Confirm the Stripe webhook updates the local plan to Pro.
5. Open Billing Portal.
6. Cancel the subscription.
7. Confirm the webhook downgrades the plan to Free.
8. Confirm Free limits apply again.

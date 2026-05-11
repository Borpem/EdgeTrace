# EdgeTrace Private Beta Runbook

This runbook is for the first private beta deployment. It intentionally avoids new product work and focuses on getting real users through the activation path.

## Chosen Stack

- Frontend: Vercel
- Backend API: Railway
- Database: Neon Postgres
- Auth: Clerk
- Billing: Stripe

Railway was chosen for the backend because the current app is an Express API with long-running server semantics. Vercel should host only the Vite frontend.

## Production URLs

Fill these in after deployment:

```text
Frontend URL:
Backend URL:
Stripe webhook URL: <Backend URL>/api/stripe/webhook
```

## Environment Variables

### Railway Backend

```env
NODE_ENV=production
AUTH_MODE=clerk
DATABASE_PROVIDER=postgres
DATABASE_URL=
CLERK_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
STRIPE_ADVANCED_PRICE_ID=
FRONTEND_URL=https://your-vercel-domain.vercel.app
APP_URL=https://your-vercel-domain.vercel.app
```

Do not set `VITE_*` variables on Railway unless needed for a build check. Do not set mock auth in production.

### Vercel Frontend

```env
VITE_AUTH_MODE=clerk
VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_BASE_URL=https://your-railway-backend.up.railway.app
```

Do not set `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET` in Vercel.

### Neon

Use the Neon pooled Postgres connection string for `DATABASE_URL` unless Railway connection limits require a direct URL.

## Deploy Backend on Railway

1. Create a Railway project.
2. Connect the EdgeTrace repository.
3. Select the backend service root as the repository root.
4. Confirm Railway uses `railway.json`.
5. Add all Railway backend environment variables.
6. Deploy.
7. Open:

```text
https://your-backend-url/api/health
```

Expected response:

```json
{
  "ok": true,
  "service": "edgetrace-api",
  "databaseProvider": "postgres",
  "authMode": "clerk",
  "billingConfigured": true
}
```

## Deploy Frontend on Vercel

1. Create a Vercel project.
2. Connect the EdgeTrace repository.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add Vercel frontend environment variables.
7. Deploy.
8. Confirm route refresh works on:

```text
/pricing
/login
/signup
/app/dashboard
```

## Configure Clerk

In Clerk production:

1. Add the Vercel frontend origin to allowed origins.
2. Add redirect URLs:

```text
https://your-vercel-domain.vercel.app
https://your-vercel-domain.vercel.app/login
https://your-vercel-domain.vercel.app/signup
https://your-vercel-domain.vercel.app/app/dashboard
```

3. Confirm the frontend uses the production publishable key.
4. Confirm the backend uses the matching production secret key.

## Configure Stripe

1. Confirm Pro and Advanced monthly recurring prices exist.
2. Set the price IDs in Railway:

```env
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ADVANCED_PRICE_ID=price_...
```

3. Create a production webhook endpoint:

```text
https://your-backend-url/api/stripe/webhook
```

4. Select these events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_failed
```

5. Copy the webhook signing secret into Railway as `STRIPE_WEBHOOK_SECRET`.

## Production Smoke Test

Run this manually against the deployed app:

1. Open the frontend URL.
2. Sign up with a new Clerk user.
3. Confirm login redirects into `/app/dashboard`.
4. Open Analyze Trades.
5. Upload `public/sample-trades.csv`.
6. Create the first diagnostic report.
7. Confirm the dashboard opens and shows the success/trust sections.
8. Create or open a second non-demo report as a Free user.
9. Confirm deeper sections are preview-gated.
10. Open Pricing.
11. Upgrade to Pro through Stripe Checkout.
12. Confirm the Stripe webhook updates `/api/me` to plan `pro`.
13. Create a strategy set.
14. Add reports to the strategy set.
15. Open `/app/how-it-works`.
16. Open Billing Portal.
17. Cancel the test subscription if using test mode.
18. Confirm plan downgrades after webhook delivery.

## Activation Events To Watch

Primary value event:

- `created_first_report`

Core funnel:

- `signup`
- `upload_page_opened`
- `csv_uploaded`
- `import_source_detected`
- `diagnostics_started`
- `diagnostic_report_created`
- `created_first_report`
- `dashboard_opened`
- `drilldown_opened`
- `pricing_page_opened`
- `checkout_started`
- `checkout_completed`

The current app stores product events in `user_events`. For beta review, query counts by `event_name`, conversion from signup to `created_first_report`, and time-to-first-report.

## Beta User Plan

Recruit 5-10 users who match the target profile:

- Active discretionary traders with broker CSV history.
- Traders who already review trades in spreadsheets or journals.
- Users willing to screen share during first upload.

Suggested interview flow:

1. Ask them what broker/export they use before they open the app.
2. Watch them sign up without coaching.
3. Watch whether they find Analyze Trades.
4. Watch whether they trust import confidence and mapping.
5. Ask them to explain the dashboard diagnosis in their own words.
6. Ask what they would inspect next.
7. Ask whether they would upload a second report to compare.
8. Ask what would make Pro worth paying for.

## Fix Policy During Beta

Fix only activation blockers:

- Signup/login failure.
- CSV upload failure.
- Misleading import confidence.
- Report creation failure.
- Dashboard cannot explain what happened.
- Paywall blocks the wrong thing.
- Stripe plan does not update.
- Critical layout issue preventing workflow completion.

Avoid new features until the first-user activation path is stable.

## Known Deployment Risks

- Existing local SQLite data is not migrated to Neon.
- Stripe webhook delivery must be verified in the Stripe dashboard after deployment.
- Clerk production keys must match the Clerk app configured with the Vercel origin.
- `DATABASE_URL` should not be logged or copied into frontend env vars.
- If using Stripe test mode in beta, user payment flows are validation-only.

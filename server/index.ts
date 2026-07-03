import cors from "cors";
import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { getAllowedFrontendOrigins, validateServerEnvironment } from "./env";
import {
  addReportToCollection,
  archiveDiagnosticReport,
  countBillableReports,
  countCollections,
  countSavedComparisons,
  createCollection,
  createSavedComparison,
  cleanupDemoData,
  DEFAULT_USER_ID,
  deleteCollection,
  deleteCollectionReviewState,
  deleteDiagnosticReport,
  deleteSavedComparison,
  getDatabaseProviderName,
  getDiagnosticReport,
  getCollection,
  getActivationSummary,
  getOrCreateUserProfile,
  listFeedback,
  getSavedComparison,
  initDb,
  listBenchmarkReports,
  listDiagnosticReports,
  listCollections,
  listCollectionReviewStates,
  listSavedComparisons,
  removeReportFromCollection,
  reorderCollectionReports,
  saveDiagnosticReport,
  saveFeedback,
  trackUserEvent,
  updateCollection,
  upsertCollectionReviewState,
  updateSavedComparison,
  updateDiagnosticReport,
  updateFeedbackStatus,
  updateUserPlan
} from "./db";
import {
  constructStripeWebhookEvent,
  confirmCheckoutSessionForUser,
  createBillingPortalSession,
  createCheckoutSession,
  createSubscriptionCancellationSession,
  handleCheckoutSessionCompleted,
  handleInvoicePaymentFailed,
  isStripeConfigured,
  isStripeWebhookConfigured,
  normalizePaidPlan,
  syncUserBillingFromStripe,
  updateUserPlanFromSubscription
} from "./stripe";
import { runDiagnostics } from "../src/lib/diagnostics";
import { describeNormalizationIssue, normalizeTrades } from "../src/lib/normalize";
import {
  canCreateCollection,
  canCreateReport,
  canCreateSavedComparison,
  canUseFeature,
  canUseBrokerAdapter,
  getPlanConfig
} from "../src/lib/entitlements";
import { normalizePlanId } from "../src/lib/plans";
import type { FeedbackItem, FeedbackStatus, ImportProvenance } from "../src/types";
import {
  planUpgradeResponse,
  sanitizeCollectionForUser,
  sanitizeReportForUser
} from "./entitlements";
import { buildAggregateBenchmarkSnapshot } from "./aggregateBenchmarks";

const { authMode } = validateServerEnvironment();
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const isProduction = process.env.NODE_ENV === "production";
const allowedFrontendOrigins = getAllowedFrontendOrigins();
const MAX_UPLOAD_ROWS = 75_000;
const MAX_DIAGNOSTIC_TRADES = 75_000;
const MAX_HTML_UPLOAD_CHARS = 3_000_000;

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(
  createRateLimiter({
    name: "public",
    windowMs: 60_000,
    maxRequests: isProduction ? 240 : 1200
  })
);
app.use(
  cors({
    origin: isProduction ? productionCorsOrigin : true,
    credentials: true
  })
);
app.use(
  "/api/stripe/webhook",
  createRateLimiter({
    name: "stripe-webhook",
    windowMs: 60_000,
    maxRequests: 120
  })
);
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!isStripeWebhookConfigured()) {
    res.status(503).json({
      error: "BILLING_NOT_CONFIGURED",
      message: "Stripe webhook handling is not configured in this environment."
    });
    return;
  }

  try {
    const event = constructStripeWebhookEvent(req.body as Buffer, req.get("stripe-signature"));
    console.info(`[stripe] Handling webhook event ${event.type}.`);

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await updateUserPlanFromSubscription(event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        console.info(`[stripe] Ignored unsupported webhook event ${event.type}.`);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    res.status(400).json({
      error: "WEBHOOK_VERIFICATION_FAILED",
      message: isProduction ? "Stripe webhook could not be verified." : err instanceof Error ? err.message : "Stripe webhook could not be verified."
    });
  }
});
const jsonBodyErrorHandler: express.ErrorRequestHandler = (err, _req, res, next) => {
  if (!err) {
    next();
    return;
  }

  if (isPayloadTooLargeError(err)) {
    res.status(413).json({
      error: "UPLOAD_TOO_LARGE",
      message: "This upload is too large to process in one request. Export a smaller date range and try again."
    });
    return;
  }

  if (isJsonSyntaxError(err)) {
    res.status(400).json({
      error: "INVALID_JSON_BODY",
      message: "The upload request could not be read. Refresh the page and try the import again."
    });
    return;
  }

  next(err);
};
app.use("/api", requireJsonForMutatingRequests);
app.use(express.json({ limit: "25mb" }));
app.use(jsonBodyErrorHandler);

app.get("/api/health", (_req, res) => {
  if (isProduction) {
    res.json({
      ok: true,
      service: "edgetrace-api",
      gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || ""
    });
    return;
  }

  res.json({
    ok: true,
    service: "edgetrace-api",
    databaseProvider: getDatabaseProviderName(),
    authMode,
    authConfigured: authMode === "mock" || Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY),
    clerkPublishableConfigured: Boolean(process.env.CLERK_PUBLISHABLE_KEY),
    billingConfigured: isStripeConfigured(),
    billingApiVersion: "stripe-checkout-v2",
    gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || ""
  });
});

type EdgeTraceRequest = express.Request & { edgeTraceUserId?: string };

if (authMode === "clerk") {
  app.use(
    clerkMiddleware({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY
    })
  );
}

function productionCorsOrigin(origin: string | undefined, callback: (error: Error | null, origin?: boolean | string) => void) {
  if (!origin) {
    callback(null, false);
    return;
  }

  const normalizedOrigin = origin.replace(/\/$/, "");
  if (allowedFrontendOrigins.includes(normalizedOrigin) || isAllowedVercelDeploymentOrigin(normalizedOrigin)) {
    callback(null, normalizedOrigin);
    return;
  }

  callback(new Error(`Origin ${normalizedOrigin} is not allowed by CORS.`));
}

async function requireEdgeTraceUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (authMode === "mock") {
    if (isProduction) {
      res.status(500).json({ error: "INVALID_AUTH_CONFIGURATION" });
      return;
    }
    const header = req.get("x-edgetrace-user-id");
    const userId = header?.trim() || DEFAULT_USER_ID;
    (req as EdgeTraceRequest).edgeTraceUserId = userId;
    try {
      await getOrCreateUserProfile(userId, { email: "demo@edgetrace.local", name: "Demo Analyst" });
    } catch (err) {
      console.error("[auth] Unable to prepare mock user profile", err);
      res.status(500).json({
        error: "ACCOUNT_PROFILE_FAILED",
        message: accountProfileErrorMessage(req)
      });
      return;
    }
    next();
    return;
  }

  let auth: ReturnType<typeof getAuth>;
  try {
    auth = getAuth(req);
  } catch {
    res.status(401).json({
      error: "Unauthorized",
      message: "Sign in again before running diagnostics."
    });
    return;
  }

  const userId = auth.userId ?? "";
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (req as EdgeTraceRequest).edgeTraceUserId = userId;
  const claims = auth.sessionClaims as Record<string, unknown> | undefined;
  try {
    await prepareAuthenticatedUserProfile(userId, claims);
  } catch (err) {
    console.error(`[auth] Unable to prepare profile for user=${userId}`, err);
    res.status(500).json({
      error: "ACCOUNT_PROFILE_FAILED",
      message: accountProfileErrorMessage(req)
    });
    return;
  }
  next();
}

function isAllowedVercelDeploymentOrigin(origin: string) {
  return /^https:\/\/edge-trace-[a-z0-9-]+-edge-trace-s-projects\.vercel\.app$/i.test(origin);
}

function isPayloadTooLargeError(err: unknown) {
  if (typeof err !== "object" || err === null) return false;
  const maybeError = err as { type?: unknown; status?: unknown };
  return maybeError.type === "entity.too.large" || maybeError.status === 413;
}

function isJsonSyntaxError(err: unknown) {
  return err instanceof SyntaxError && typeof err === "object" && err !== null && "body" in err;
}

function isServerAuthMisconfigured() {
  return authMode === "clerk" && !process.env.CLERK_PUBLISHABLE_KEY;
}

function getDebugRequestId(req: express.Request) {
  const header = req.get("x-debug-request-id")?.trim();
  return header || `server-${randomUUID()}`;
}

function isReportsDebugRequest(req: express.Request) {
  return !isProduction || Boolean(req.get("x-debug-request-id")) || req.query.debugReports === "1";
}

function isReportDeleteRequest(req: express.Request) {
  if (req.method === "POST" && req.path === "/api/reports/archive") return true;
  return req.method === "DELETE" && /^\/api\/diagnostics\/[^/]+$/.test(req.path);
}

function sanitizeDebugException(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown server exception";
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "sk_[redacted]")
    .replace(/pk_(?:test|live)_[A-Za-z0-9]+/g, "pk_[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]")
    .slice(0, 500);
}

function apiErrorHandler(
  err: unknown,
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) {
  const debugRequestId = getDebugRequestId(req);
  console.error(`[api] Unhandled request error ${req.method} ${req.originalUrl || req.path} request=${debugRequestId}`, err);
  if (res.headersSent) return;
  res.setHeader("x-debug-request-id", debugRequestId);
  if (isServerAuthMisconfigured()) {
    res.status(500).json({
      error: "AUTH_CONFIGURATION_ERROR",
      message: "Server authentication is missing CLERK_PUBLISHABLE_KEY. Add it to the backend environment and redeploy."
    });
    return;
  }
  if (req.path.startsWith("/api/billing")) {
    res.status(500).json({
      error: "BILLING_INTERNAL_ERROR",
      message: "The billing service hit an internal error. Try again in a moment."
    });
    return;
  }
  if (req.method === "GET" && req.path === "/api/diagnostics") {
    res.status(500).json({
      error: "REPORTS_LIST_FAILED",
      message: "Reports could not be loaded. Refresh the page and try again.",
      debugRequestId,
      ...(isReportsDebugRequest(req)
        ? {
            debugHint: isProduction
              ? "Check Railway logs for this debugRequestId."
              : err instanceof Error
                ? err.message
                : "Unknown diagnostics route exception"
          }
        : {})
    });
    return;
  }
  if (isReportDeleteRequest(req)) {
    res.status(500).json({
      error: "REPORT_DELETE_FAILED",
      message: "Unable to delete report. Refresh the reports page and try again.",
      debugRequestId,
      ...(isReportsDebugRequest(req)
        ? {
            debugHint: sanitizeDebugException(err)
          }
        : {})
    });
    return;
  }
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "The EdgeTrace service hit an internal error. Try again in a moment."
  });
}

function getUserId(req: express.Request) {
  return (req as EdgeTraceRequest).edgeTraceUserId ?? "";
}

function parseAdminList(...names: string[]) {
  return names
    .flatMap((name) => (process.env[name] ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

async function isAdminRequest(req: express.Request) {
  const userId = getUserId(req);
  if (!userId) return false;
  const profile = await getOrCreateUserProfile(userId);
  const allowedIds = parseAdminList("EDGETRACE_ADMIN_USER_IDS", "ADMIN_USER_IDS");
  const allowedEmails = parseAdminList("EDGETRACE_ADMIN_EMAILS", "ADMIN_EMAILS").map((email) => email.toLowerCase());
  if (!isProduction && allowedIds.length === 0 && allowedEmails.length === 0 && userId === DEFAULT_USER_ID) {
    return true;
  }
  return allowedIds.includes(userId) || Boolean(profile.email && allowedEmails.includes(profile.email.toLowerCase()));
}

function sanitizeFeedbackType(value: unknown): "bug" | "suggestion" | "other" {
  return value === "bug" || value === "suggestion" || value === "other" ? value : "other";
}

function sanitizeFeedbackStatus(value: unknown): FeedbackStatus | null {
  if (value === "new" || value === "reviewed" || value === "closed") return value;
  return null;
}

function sanitizeFeedbackText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+\n/g, "\n").trim().slice(0, maxLength) : "";
}

app.use(
  "/api",
  createRateLimiter({
    name: "api",
    windowMs: 60_000,
    maxRequests: isProduction ? 120 : 1200
  }),
  requireEdgeTraceUser
);
app.use(
  "/api/events",
  createRateLimiter({
    name: "events",
    windowMs: 60_000,
    maxRequests: isProduction ? 60 : 600,
    preferUserKey: true
  })
);
app.use(
  ["/api/trades/upload", "/api/diagnostics/run"],
  createRateLimiter({
    name: "imports",
    windowMs: 15 * 60_000,
    maxRequests: isProduction ? 30 : 300,
    preferUserKey: true
  })
);
app.use(
  "/api/billing",
  createRateLimiter({
    name: "billing",
    windowMs: 10 * 60_000,
    maxRequests: isProduction ? 20 : 200,
    preferUserKey: true
  })
);

app.get("/api/me", async (req, res) => {
  try {
    const profile = isStripeConfigured()
      ? await syncUserBillingFromStripe(getUserId(req))
      : await getOrCreateUserProfile(getUserId(req));
    res.json({
      profile: {
        ...profile,
        billingConfigured: isStripeConfigured()
      }
    });
  } catch (err) {
    console.error(`[account] Unable to load profile for user=${getUserId(req)}`, err);
    res.status(422).json({
      error: "PROFILE_LOAD_FAILED",
      message: safeApiErrorMessage(err, "Account profile could not be loaded. Refresh the page and try again.")
    });
  }
});

app.get("/api/me/activation", async (req, res) => {
  try {
    res.json(await getActivationSummary(getUserId(req)));
  } catch (err) {
    console.error(`[activation] Unable to load activation summary for user=${getUserId(req)}`, err);
    res.status(422).json({
      error: "ACTIVATION_SUMMARY_FAILED",
      message: safeApiErrorMessage(err, "Workflow progress could not be loaded.")
    });
  }
});

app.post("/api/events", async (req, res) => {
  const eventName = sanitizeEventName(req.body?.eventName);
  if (!eventName) {
    res.status(400).json({
      error: "INVALID_EVENT_NAME",
      message: "Event name is required."
    });
    return;
  }

  try {
    const event = await trackUserEvent(getUserId(req), {
      eventName,
      properties: sanitizeEventProperties(req.body?.properties)
    });
    res.status(201).json({ event });
  } catch {
    res.status(422).json({
      error: "EVENT_NOT_STORED",
      message: "Activation event could not be stored."
    });
  }
});

app.post("/api/feedback", async (req, res) => {
  const message = sanitizeFeedbackText(req.body?.message, 4000);
  if (message.length < 5) {
    res.status(400).json({
      error: "INVALID_FEEDBACK",
      message: "Feedback needs a short description before it can be submitted."
    });
    return;
  }

  try {
    const profile = await getOrCreateUserProfile(getUserId(req));
    const feedback = await saveFeedback(getUserId(req), {
      type: sanitizeFeedbackType(req.body?.type),
      message,
      pageUrl: sanitizeFeedbackText(req.body?.pageUrl, 800),
      userAgent: sanitizeFeedbackText(req.body?.userAgent || req.get("user-agent"), 500),
      userEmail: profile.email,
      userName: profile.name
    });
    await trackUserEvent(getUserId(req), { eventName: "feedback_submitted", properties: { type: feedback.type } });
    res.status(201).json({ feedback });
  } catch (err) {
    console.error(`[feedback] Unable to store feedback for user=${getUserId(req)}`, err);
    res.status(422).json({
      error: "FEEDBACK_NOT_STORED",
      message: safeApiErrorMessage(err, "Feedback could not be submitted. Try again in a moment.")
    });
  }
});

app.get("/api/admin/me", async (req, res) => {
  res.json({ isAdmin: await isAdminRequest(req) });
});

app.get("/api/admin/feedback", async (req, res) => {
  if (!(await isAdminRequest(req))) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  res.json({ feedback: await enrichFeedbackContacts(await listFeedback()) });
});

app.patch("/api/admin/feedback/:id", async (req, res) => {
  if (!(await isAdminRequest(req))) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  const status = sanitizeFeedbackStatus(req.body?.status);
  if (!status) {
    res.status(400).json({
      error: "INVALID_FEEDBACK_STATUS",
      message: "Feedback status must be new, reviewed, or closed."
    });
    return;
  }

  const feedback = await updateFeedbackStatus(String(req.params.id ?? ""), status);
  if (!feedback) {
    res.status(404).json({ error: "FEEDBACK_NOT_FOUND" });
    return;
  }
  const [enrichedFeedback] = await enrichFeedbackContacts([feedback]);
  res.json({ feedback: enrichedFeedback ?? feedback });
});

app.patch("/api/me/plan", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({
      error: "PLAN_CHANGE_DISABLED",
      message: "Plan changes are not available from this development endpoint in production."
    });
    return;
  }

  const planId = normalizePlanId(typeof req.body?.planId === "string" ? req.body.planId : undefined);
  res.json({ profile: { ...(await updateUserPlan(getUserId(req), planId)), billingConfigured: isStripeConfigured() } });
});

app.post("/api/billing/create-checkout-session", async (req, res) => {
  let stage = "validate_request";
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({
        error: "BILLING_NOT_CONFIGURED",
        stage,
        message: "Billing is not configured in this environment."
      });
      return;
    }

    const planId = normalizePaidPlan(req.body?.planId);
    if (!planId) {
      res.status(400).json({
        error: "INVALID_PLAN",
        stage,
        message: "Checkout is currently available for the Pro review plan."
      });
      return;
    }

    const userId = getUserId(req);
    stage = "create_stripe_checkout_session";
    console.info(`[billing] Checkout session request user=${userId} plan=${planId}.`);
    const session = await createCheckoutSession(userId, planId, getRequestOrigin(req));
    if (!session.url) {
      res.status(502).json({
        error: "CHECKOUT_SESSION_FAILED",
        stage,
        message: "Stripe did not return a checkout URL."
      });
      return;
    }
    stage = "track_checkout_started";
    await trackUserEvent(userId, { eventName: "checkout_started", properties: { planId } });
    res.json({ url: session.url });
  } catch (err) {
    console.error(`[billing] Checkout session creation failed at ${stage}`, err);
    res.status(422).json({
      error: "CHECKOUT_SESSION_FAILED",
      stage,
      message: billingApiErrorMessage(err, "Checkout could not start. Check the billing configuration and try again.")
    });
  }
});

app.post("/api/billing/confirm-checkout-session", async (req, res) => {
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  if (!sessionId) {
    res.status(400).json({
      error: "INVALID_CHECKOUT_SESSION",
      message: "Checkout session id is required."
    });
    return;
  }

  try {
    const profile = await confirmCheckoutSessionForUser(getUserId(req), sessionId);
    res.json({ profile: { ...profile, billingConfigured: isStripeConfigured() } });
  } catch (err) {
    console.error("[billing] Checkout confirmation failed", err);
    res.status(422).json({
      error: "CHECKOUT_CONFIRMATION_FAILED",
      message: billingApiErrorMessage(err, "Checkout completed, but the plan could not be refreshed yet.")
    });
  }
});

app.post("/api/billing/create-portal-session", async (req, res) => {
  let stage = "validate_request";
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({
        error: "BILLING_NOT_CONFIGURED",
        stage,
        message: "Billing is not configured in this environment."
      });
      return;
    }

    stage = "create_stripe_portal_session";
    const session = await createBillingPortalSession(getUserId(req), getRequestOrigin(req));
    stage = "track_billing_portal_opened";
    await trackUserEvent(getUserId(req), { eventName: "billing_portal_opened" });
    res.json({ url: session.url });
  } catch (err) {
    console.error(`[billing] Billing portal creation failed at ${stage}`, err);
    res.status(422).json({
      error: "BILLING_PORTAL_FAILED",
      stage,
      message: billingApiErrorMessage(err, "Unable to open billing portal.")
    });
  }
});

app.post("/api/billing/create-cancel-session", async (req, res) => {
  let stage = "validate_request";
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({
        error: "BILLING_NOT_CONFIGURED",
        stage,
        message: "Billing is not configured in this environment."
      });
      return;
    }

    stage = "create_stripe_cancel_session";
    const session = await createSubscriptionCancellationSession(getUserId(req), getRequestOrigin(req));
    stage = "track_billing_cancellation_opened";
    await trackUserEvent(getUserId(req), { eventName: "billing_cancellation_opened" });
    res.json({ url: session.url });
  } catch (err) {
    console.error(`[billing] Cancellation portal creation failed at ${stage}`, err);
    res.status(422).json({
      error: "BILLING_CANCELLATION_FAILED",
      stage,
      message: billingApiErrorMessage(err, "Unable to open subscription cancellation.")
    });
  }
});

app.post("/api/trades/upload", (req, res) => {
  const validationError = validateTradeUploadBody(req.body);
  if (validationError) {
    res.status(400).json(validationError);
    return;
  }

  const rows = typeof req.body?.html === "string" ? [{ sourceType: "html", content: req.body.html }] : Array.isArray(req.body?.rows) ? req.body.rows : [];
  const normalizedTrades = normalizeTrades(rows);
  res.json({
    normalizedTrades,
    rejectedRows: rows.length - normalizedTrades.length,
    warning: normalizedTrades.length === 0 ? describeNormalizationIssue(rows) : undefined
  });
});

app.post("/api/diagnostics/run", async (req, res) => {
  const userId = getUserId(req);
  const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];
  const validationError = validateDiagnosticsBody(req.body, trades);
  if (validationError) {
    res.status(400).json(validationError);
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name : "";
  const isDemo = !isProduction && (req.body?.isDemo === true || isDemoName(name));
  const brokerId = typeof req.body?.brokerId === "string" ? req.body.brokerId : "generic_csv";
  const importProvenance = sanitizeImportProvenance(req.body?.importProvenance);
  const plan = getPlanConfig((await getOrCreateUserProfile(userId)).planId);
  const existingBillableReportCount = await countBillableReports(userId);

  if (!isDemo && !canUseBrokerAdapter(plan, brokerId)) {
    res.status(403).json({
      error: "PLAN_LIMIT_REACHED",
      message: "This import source is not available on your current plan."
    });
    return;
  }

  if (!isDemo && !canCreateReport(plan, existingBillableReportCount)) {
    res.status(403).json({
      error: "PLAN_LIMIT_REACHED",
      message: "This workspace has reached its report limit."
    });
    return;
  }

  const id = randomUUID();
  const result = { ...runDiagnostics(id, trades), importProvenance };
  const savedResult = await saveDiagnosticReport(userId, result, req.body?.name);
  await trackUserEvent(userId, {
    eventName: "diagnostic_report_created",
    properties: {
      reportId: savedResult.id,
      brokerId,
      tradeCount: savedResult.metrics.totalTrades,
      isDemo
    }
  });
  if (!isDemo && existingBillableReportCount === 0) {
    await trackUserEvent(userId, {
      eventName: "created_first_report",
      properties: {
        reportId: savedResult.id,
        brokerId,
        tradeCount: savedResult.metrics.totalTrades
      }
    });
  }
  res.json(await sanitizeReportForUser(userId, savedResult));
});

app.get("/api/diagnostics", async (req, res) => {
  const debugRequestId = getDebugRequestId(req);
  const debugEnabled = isReportsDebugRequest(req);
  res.setHeader("x-debug-request-id", debugRequestId);
  console.info(
    `[diagnostics] list entry request=${debugRequestId} userPresent=${Boolean(getUserId(req))} db=${getDatabaseProviderName()} debug=${debugEnabled}`
  );
  try {
    const reports = await listDiagnosticReports(getUserId(req));
    console.info(`[diagnostics] list success request=${debugRequestId} reportCount=${reports.length}`);
    res.json({ reports });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown reports list exception";
    console.error(`[diagnostics] list failed request=${debugRequestId} userPresent=${Boolean(getUserId(req))} message=${message}`, err);
    res.status(422).json({
      error: "REPORTS_LIST_FAILED",
      message: safeApiErrorMessage(err, "Reports could not be loaded. Refresh the page and try again."),
      debugRequestId,
      ...(debugEnabled ? { debugHint: isProduction ? "Check Railway logs for this debugRequestId." : message } : {})
    });
  }
});

app.post("/api/reports/archive", async (req, res) => {
  const debugRequestId = getDebugRequestId(req);
  const debugEnabled = isReportsDebugRequest(req);
  res.setHeader("x-debug-request-id", debugRequestId);
  const reportId = typeof req.body?.reportId === "string" ? req.body.reportId.trim() : "";
  console.info(
    `[diagnostics] archive entry request=${debugRequestId} userPresent=${Boolean(getUserId(req))} reportPresent=${Boolean(reportId)} debug=${debugEnabled}`
  );
  if (!reportId) {
    res.status(400).json({
      error: "REPORT_ID_REQUIRED",
      message: "Select a report before deleting it.",
      debugRequestId
    });
    return;
  }

  try {
    const deleted = await archiveDiagnosticReport(getUserId(req), reportId);
    if (!deleted) {
      res.status(404).json({
        error: "DIAGNOSTICS_NOT_FOUND",
        message: "Report not found or already deleted.",
        debugRequestId
      });
      return;
    }
    console.info(`[diagnostics] archive success request=${debugRequestId}`);
    res.json({ deleted: true, debugRequestId });
  } catch (err) {
    const archiveMessage = err instanceof Error ? err.message : "Unknown report archive exception";
    console.error(`[diagnostics] archive failed request=${debugRequestId} message=${archiveMessage}`, err);
    try {
      const hardDeleted = await deleteDiagnosticReport(getUserId(req), reportId);
      if (hardDeleted) {
        console.info(`[diagnostics] archive fallback hard delete success request=${debugRequestId}`);
        res.json({ deleted: true, mode: "hard_delete_fallback", debugRequestId });
        return;
      }
    } catch (fallbackErr) {
      const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : "Unknown hard delete fallback exception";
      console.error(`[diagnostics] archive fallback hard delete failed request=${debugRequestId} message=${fallbackMessage}`, fallbackErr);
    }
    res.status(422).json({
      error: "REPORT_DELETE_FAILED",
      message: safeApiErrorMessage(err, "Unable to delete report. Refresh the reports page and try again."),
      debugRequestId,
      ...(debugEnabled ? { debugHint: isProduction ? "Check Railway logs for this debugRequestId." : archiveMessage } : {})
    });
  }
});

app.get("/api/diagnostics/:id/benchmarks", async (req, res) => {
  try {
    const userId = getUserId(req);
    const plan = getPlanConfig((await getOrCreateUserProfile(userId)).planId);
    if (!canUseFeature(plan, "aggregate_benchmarks")) {
      res.status(403).json(planUpgradeResponse("aggregate_benchmarks"));
      return;
    }

    const result = await getDiagnosticReport(userId, req.params.id);
    if (!result) {
      res.status(404).json({ error: "Diagnostics not found" });
      return;
    }

    const benchmarkReports = await listBenchmarkReports();
    res.json(buildAggregateBenchmarkSnapshot(result, benchmarkReports));
  } catch (err) {
    console.error(`[benchmarks] Unable to build aggregate benchmarks for report=${String(req.params.id ?? "")}`, err);
    res.status(422).json({
      error: "BENCHMARKS_UNAVAILABLE",
      message: safeApiErrorMessage(err, "Aggregate benchmarks could not be loaded.")
    });
  }
});

app.get("/api/diagnostics/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await getDiagnosticReport(userId, req.params.id);
    if (!result) {
      res.status(404).json({ error: "Diagnostics not found" });
      return;
    }
    res.json(await sanitizeReportForUser(userId, result));
  } catch {
    res.status(422).json({ error: "Stored diagnostics report could not be read" });
  }
});

app.patch("/api/diagnostics/:id", async (req, res) => {
  try {
    if (req.body?.deleteReport === true) {
      const deleted = await archiveDiagnosticReport(getUserId(req), String(req.params.id ?? ""));
      if (!deleted) {
        res.status(404).json({
          error: "DIAGNOSTICS_NOT_FOUND",
          message: "Report not found or already deleted."
        });
        return;
      }
      res.json({ deleted: true });
      return;
    }

    const updated = await updateDiagnosticReport(getUserId(req), String(req.params.id ?? ""), {
      name: typeof req.body?.name === "string" ? req.body.name : undefined,
      notes: typeof req.body?.notes === "string" ? req.body.notes : undefined,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : undefined,
      strategyLabel: typeof req.body?.strategyLabel === "string" ? req.body.strategyLabel : undefined,
      reportType: typeof req.body?.reportType === "string" ? req.body.reportType : undefined
    });

    if (!updated) {
      res.status(404).json({ error: "Diagnostics not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error(`[diagnostics] Report details update failed for report=${String(req.params.id ?? "")} user=${getUserId(req)}`, err);
    res.status(422).json({
      error: "REPORT_UPDATE_FAILED",
      message: safeApiErrorMessage(err, "Report details could not be updated. Refresh the reports page and try again.")
    });
  }
});

app.delete("/api/diagnostics/:id", async (req, res) => {
  await handleDeleteDiagnosticReport(req, res, { emptySuccess: true });
});

app.post("/api/diagnostics/:id/delete", async (req, res) => {
  await handleDeleteDiagnosticReport(req, res, { emptySuccess: false });
});

async function handleDeleteDiagnosticReport(req: express.Request, res: express.Response, options: { emptySuccess: boolean }) {
  const reportId = String(req.params.id ?? "");
  const debugRequestId = getDebugRequestId(req);
  const debugEnabled = isReportsDebugRequest(req);
  res.setHeader("x-debug-request-id", debugRequestId);
  console.info(
    `[diagnostics] hard delete entry request=${debugRequestId} userPresent=${Boolean(getUserId(req))} reportPresent=${Boolean(reportId)} debug=${debugEnabled}`
  );
  try {
    const deleted = await deleteDiagnosticReport(getUserId(req), reportId);
    if (!deleted) {
      res.status(404).json({
        error: "DIAGNOSTICS_NOT_FOUND",
        message: "Report not found or already deleted.",
        debugRequestId
      });
      return;
    }
    console.info(`[diagnostics] hard delete success request=${debugRequestId}`);
    if (options.emptySuccess) {
      res.status(204).send();
      return;
    }
    res.json({ deleted: true, debugRequestId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown hard delete exception";
    console.error(`[diagnostics] hard delete failed request=${debugRequestId} message=${message}`, err);
    res.status(422).json({
      error: "REPORT_DELETE_FAILED",
      message: safeApiErrorMessage(err, "Unable to delete report. Remove it from strategy sets or saved comparisons and try again."),
      debugRequestId,
      ...(debugEnabled ? { debugHint: isProduction ? "Check Railway logs for this debugRequestId." : message } : {})
    });
  }
}

app.delete("/api/demo-data", async (req, res) => {
  res.json(await cleanupDemoData(getUserId(req)));
});

app.get("/api/collections", async (req, res) => {
  try {
    res.json({ collections: await listCollections(getUserId(req)) });
  } catch (err) {
    console.error(`[collections] Unable to list collections for user=${getUserId(req)}`, err);
    res.status(422).json({
      error: "COLLECTIONS_LIST_FAILED",
      message: safeApiErrorMessage(err, "Strategy sets could not be loaded.")
    });
  }
});

app.post("/api/collections", async (req, res) => {
  const userId = getUserId(req);
  const name = typeof req.body?.name === "string" ? req.body.name : "Untitled Collection";
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
  const isDemo = !isProduction && (isDemoName(name) || tags.map(String).some((tag: string) => tag.toLowerCase() === "demo"));
  const plan = getPlanConfig((await getOrCreateUserProfile(userId)).planId);

  if (!isDemo && !canCreateCollection(plan, await countCollections(userId))) {
    res.status(403).json({
      error: "PLAN_LIMIT_REACHED",
      message: "This workspace has reached its strategy set limit."
    });
    return;
  }

  const collection = await createCollection(userId, {
      name,
      description: typeof req.body?.description === "string" ? req.body.description : "",
      tags
    });
  await trackUserEvent(userId, {
    eventName: "strategy_set_created",
    properties: { collectionId: collection.id, isDemo }
  });
  res.status(201).json(collection);
});

app.get("/api/collections/:id", async (req, res) => {
  const userId = getUserId(req);
  const collection = await getCollection(userId, req.params.id);
  if (!collection) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }
  res.json(await sanitizeCollectionForUser(userId, collection));
});

app.patch("/api/collections/:id", async (req, res) => {
  const collection = await updateCollection(getUserId(req), req.params.id, {
    name: typeof req.body?.name === "string" ? req.body.name : undefined,
    description: typeof req.body?.description === "string" ? req.body.description : undefined,
    tags: Array.isArray(req.body?.tags) ? req.body.tags : undefined
  });
  if (!collection) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }
  res.json(collection);
});

app.delete("/api/collections/:id", async (req, res) => {
  if (!(await deleteCollection(getUserId(req), req.params.id))) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }
  res.status(204).send();
});

app.post("/api/collections/:id/reports", async (req, res) => {
  const userId = getUserId(req);
  const collection = await addReportToCollection(userId, req.params.id, req.body?.reportId);
  if (!collection) {
    res.status(404).json({ error: "Collection or report not found" });
    return;
  }
  await trackUserEvent(userId, {
    eventName: "report_added_to_strategy_set",
    properties: { collectionId: req.params.id, reportId: String(req.body?.reportId ?? "") }
  });
  res.json(await sanitizeCollectionForUser(userId, collection));
});

app.delete("/api/collections/:id/reports/:reportId", async (req, res) => {
  if (!(await removeReportFromCollection(getUserId(req), req.params.id, req.params.reportId))) {
    res.status(404).json({ error: "Collection report link not found" });
    return;
  }
  res.status(204).send();
});

app.patch("/api/collections/:id/reports/order", async (req, res) => {
  const userId = getUserId(req);
  const reportIds = Array.isArray(req.body?.reportIds) ? req.body.reportIds.map(String) : [];
  const collection = await reorderCollectionReports(userId, req.params.id, reportIds);
  if (!collection) {
    res.status(404).json({ error: "Collection not found" });
    return;
  }
  res.json(await sanitizeCollectionForUser(userId, collection));
});

app.get("/api/collections/:id/review-states", async (req, res) => {
  res.json({ reviewStates: await listCollectionReviewStates(getUserId(req), req.params.id) });
});

app.patch("/api/collections/:id/review-states", async (req, res) => {
  if (typeof req.body?.previousReportId !== "string" || typeof req.body?.currentReportId !== "string") {
    res.status(400).json({ error: "previousReportId and currentReportId are required" });
    return;
  }
  const state = await upsertCollectionReviewState(getUserId(req), req.params.id, {
    previousReportId: req.body.previousReportId,
    currentReportId: req.body.currentReportId,
    status: typeof req.body?.status === "string" ? req.body.status : "open",
    note: typeof req.body?.note === "string" ? req.body.note : undefined
  });
  if (!state) {
    res.status(404).json({ error: "Collection or reports not found" });
    return;
  }
  res.json(state);
});

app.delete("/api/collections/:id/review-states", async (req, res) => {
  if (typeof req.body?.previousReportId !== "string" || typeof req.body?.currentReportId !== "string") {
    res.status(400).json({ error: "previousReportId and currentReportId are required" });
    return;
  }
  if (!(await deleteCollectionReviewState(getUserId(req), req.params.id, req.body.previousReportId, req.body.currentReportId))) {
    res.status(404).json({ error: "Review state not found" });
    return;
  }
  res.status(204).send();
});

app.get("/api/saved-comparisons", async (req, res) => {
  res.json({ comparisons: await listSavedComparisons(getUserId(req)) });
});

app.post("/api/saved-comparisons", async (req, res) => {
  const userId = getUserId(req);
  const name = typeof req.body?.name === "string" ? req.body.name : "Saved Comparison";
  const isDemo = !isProduction && isDemoName(name);
  const plan = getPlanConfig((await getOrCreateUserProfile(userId)).planId);

  if (!isDemo && !canCreateSavedComparison(plan, await countSavedComparisons(userId))) {
    res.status(403).json({
      error: "PLAN_LIMIT_REACHED",
      message: "This workspace has reached its saved comparison limit."
    });
    return;
  }

  const comparison = await createSavedComparison(userId, {
      name,
      description: typeof req.body?.description === "string" ? req.body.description : "",
      reportAId: String(req.body?.reportAId ?? ""),
      reportBId: String(req.body?.reportBId ?? ""),
      dimension: typeof req.body?.dimension === "string" ? req.body.dimension : undefined,
      groupKey: typeof req.body?.groupKey === "string" ? req.body.groupKey : undefined
    });
  if (!comparison) {
    res.status(404).json({ error: "Reports not found" });
    return;
  }
  await trackUserEvent(userId, {
    eventName: "saved_comparison_created",
    properties: {
      comparisonId: comparison.id,
      reportAId: comparison.reportAId,
      reportBId: comparison.reportBId,
      isDemo
    }
  });
  res.status(201).json(comparison);
});

app.get("/api/saved-comparisons/:id", async (req, res) => {
  const comparison = await getSavedComparison(getUserId(req), req.params.id);
  if (!comparison) {
    res.status(404).json({ error: "Saved comparison not found" });
    return;
  }
  res.json(comparison);
});

app.patch("/api/saved-comparisons/:id", async (req, res) => {
  const comparison = await updateSavedComparison(getUserId(req), req.params.id, {
    name: typeof req.body?.name === "string" ? req.body.name : undefined,
    description: typeof req.body?.description === "string" ? req.body.description : undefined,
    reportAId: typeof req.body?.reportAId === "string" ? req.body.reportAId : undefined,
    reportBId: typeof req.body?.reportBId === "string" ? req.body.reportBId : undefined,
    dimension: typeof req.body?.dimension === "string" ? req.body.dimension : undefined,
    groupKey: typeof req.body?.groupKey === "string" ? req.body.groupKey : undefined
  });
  if (!comparison) {
    res.status(404).json({ error: "Saved comparison not found" });
    return;
  }
  res.json(comparison);
});

app.delete("/api/saved-comparisons/:id", async (req, res) => {
  if (!(await deleteSavedComparison(getUserId(req), req.params.id))) {
    res.status(404).json({ error: "Saved comparison not found" });
    return;
  }
  res.status(204).send();
});

app.use(apiErrorHandler);

await initDb();
console.info(`[db] Database provider: ${getDatabaseProviderName()}`);

app.listen(port, () => {
  console.log(`EdgeTrace API listening on http://localhost:${port}`);
});

function isDemoName(name: string) {
  return name.startsWith("Demo Report") || name.startsWith("ORB Demo");
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

type UserContactIdentity = {
  email?: string;
  name?: string;
};

async function prepareAuthenticatedUserProfile(userId: string, claims: Record<string, unknown> | undefined) {
  const claimIdentity = getSessionClaimIdentity(claims);
  let profile = await getOrCreateUserProfile(userId, claimIdentity);
  if (profile.email && profile.name) return profile;

  const clerkIdentity = await getClerkUserIdentity(userId);
  if (!clerkIdentity.email && !clerkIdentity.name) return profile;

  profile = await getOrCreateUserProfile(userId, {
    email: profile.email || claimIdentity.email || clerkIdentity.email,
    name: profile.name || claimIdentity.name || clerkIdentity.name
  });
  return profile;
}

function getSessionClaimIdentity(claims: Record<string, unknown> | undefined): UserContactIdentity {
  return {
    email: firstString(claims?.email, claims?.email_address, claims?.primary_email_address),
    name: firstString(claims?.name, claims?.full_name)
  };
}

async function enrichFeedbackContacts(feedback: FeedbackItem[]) {
  if (feedback.length === 0) return feedback;

  const cache = new Map<string, UserContactIdentity>();
  const enriched: FeedbackItem[] = [];

  for (const item of feedback) {
    if (item.userEmail && item.userName) {
      enriched.push(item);
      continue;
    }

    const identity = await getFeedbackContactIdentity(item.userId, cache);
    enriched.push({
      ...item,
      userEmail: item.userEmail || identity.email || "",
      userName: item.userName || identity.name || ""
    });
  }

  return enriched;
}

async function getFeedbackContactIdentity(userId: string, cache: Map<string, UserContactIdentity>) {
  if (cache.has(userId)) return cache.get(userId) ?? {};

  const profile = await getOrCreateUserProfile(userId);
  const profileIdentity = {
    email: profile.email || undefined,
    name: profile.name || undefined
  };
  if (profileIdentity.email && profileIdentity.name) {
    cache.set(userId, profileIdentity);
    return profileIdentity;
  }

  const clerkIdentity = await getClerkUserIdentity(userId);
  const identity = {
    email: profileIdentity.email || clerkIdentity.email,
    name: profileIdentity.name || clerkIdentity.name
  };
  cache.set(userId, identity);
  return identity;
}

async function getClerkUserIdentity(userId: string): Promise<UserContactIdentity> {
  if (authMode !== "clerk" || !process.env.CLERK_SECRET_KEY) return {};

  try {
    const user = await clerkClient.users.getUser(userId);
    const email = firstString(
      user.primaryEmailAddress?.emailAddress,
      user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress,
      user.emailAddresses[0]?.emailAddress
    );
    const name = firstString(
      user.fullName,
      [user.firstName, user.lastName].filter(Boolean).join(" "),
      user.username
    );
    return { email, name };
  } catch (err) {
    console.warn(`[auth] Unable to resolve Clerk contact for user=${userId}: ${sanitizeDebugException(err)}`);
    return {};
  }
}
function safeApiErrorMessage(err: unknown, fallback: string) {
  if (isProduction) return fallback;
  return err instanceof Error ? err.message : fallback;
}

function accountProfileErrorMessage(req: express.Request) {
  return req.path.startsWith("/billing")
    ? "Billing could not start because your EdgeTrace account profile could not be loaded. Refresh and try again."
    : "Your EdgeTrace account profile could not be loaded. Refresh and try again.";
}

function billingApiErrorMessage(err: unknown, fallback: string) {
  const details = stripeErrorDetails(err);
  if (details.code === "resource_missing" && /price/i.test(details.message)) {
    return "The configured Pro Stripe price ID could not be found. Check STRIPE_PRO_PRICE_ID and make sure it matches the Stripe key mode.";
  }
  if (details.code === "resource_missing" && /customer/i.test(details.message)) {
    return "Stripe could not verify the saved billing link for this account. Refresh account details, then try again.";
  }
  if (/No Stripe customer exists/i.test(details.message)) {
    return "No Stripe billing customer is linked to this account yet. Use Upgrade to Pro to start checkout, or refresh after checkout completes.";
  }
  if (/live customer or subscription linked/i.test(details.message)) {
    return "Stripe could not verify the saved billing link for this account. Refresh account details, then try again.";
  }
  if (/billing portal|customer portal|portal configuration|No configuration provided/i.test(details.message)) {
    return "Stripe Customer Portal is not configured yet. Enable the customer portal in Stripe to manage billing.";
  }
  if (details.code === "resource_missing") {
    return "Stripe could not find a configured billing resource. Check the Pro price and customer configuration.";
  }
  if (details.code === "invalid_api_key" || details.statusCode === 401 || details.type === "StripeAuthenticationError") {
    return "The Stripe secret key is invalid or unavailable. Check STRIPE_SECRET_KEY in the backend environment.";
  }
  if (details.type === "StripeConnectionError") {
    return "Stripe could not be reached from the backend. Try again in a moment.";
  }
  if (details.message && !isProduction) return details.message;
  return fallback;
}

function stripeErrorDetails(err: unknown) {
  if (!err || typeof err !== "object") return { message: "" };
  const input = err as {
    type?: string;
    code?: string;
    message?: string;
    statusCode?: number;
    raw?: { type?: string; code?: string; message?: string };
  };
  return {
    type: input.type ?? input.raw?.type ?? "",
    code: input.code ?? input.raw?.code ?? "",
    message: input.message ?? input.raw?.message ?? "",
    statusCode: input.statusCode ?? 0
  };
}

function getRequestOrigin(req: express.Request) {
  if (isProduction) return allowedFrontendOrigins[0];
  return req.get("origin") || `${req.protocol}://${req.get("host")}`;
}

function sanitizeEventName(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function sanitizeEventProperties(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizePropertyObject(value as Record<string, unknown>, 0);
}

function sanitizeImportProvenance(value: unknown): ImportProvenance | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const output = {
    originalFilename: safeProvenanceString(input.originalFilename, 180),
    importedAt: safeProvenanceString(input.importedAt, 80) || new Date().toISOString(),
    detectedSource: safeProvenanceString(input.detectedSource, 120),
    selectedSource: safeProvenanceString(input.selectedSource, 120),
    brokerId: safeProvenanceString(input.brokerId, 80),
    brokerDisplayName: safeProvenanceString(input.brokerDisplayName, 120),
    detectionConfidence: safeProvenanceNumber(input.detectionConfidence, 0, 100),
    confidenceLabel: safeConfidenceLabel(input.confidenceLabel),
    mappedFieldsCount: safeProvenanceNumber(input.mappedFieldsCount, 0, 500),
    normalizedTradeCount: safeProvenanceNumber(input.normalizedTradeCount, 0, 1_000_000),
    excludedRowCount: safeProvenanceNumber(input.excludedRowCount, 0, 1_000_000),
    warningCount: safeProvenanceNumber(input.warningCount, 0, 500),
    warnings: safeStringArray(input.warnings, 12, 240),
    missingRequiredFields: safeStringArray(input.missingRequiredFields, 12, 80),
    costsDetected: typeof input.costsDetected === "boolean" ? input.costsDetected : undefined,
    rMultipleDetected: typeof input.rMultipleDetected === "boolean" ? input.rMultipleDetected : undefined,
    reconstructionEnabled: typeof input.reconstructionEnabled === "boolean" ? input.reconstructionEnabled : undefined,
    reconstructionSummary: sanitizeReconstructionSummary(input.reconstructionSummary)
  };

  const compact = Object.fromEntries(Object.entries(output).filter(([, item]) => item !== undefined && item !== "")) as Partial<ImportProvenance>;
  const serialized = JSON.stringify(compact);
  return serialized.length > 12_000 || !compact.importedAt ? undefined : (compact as ImportProvenance);
}

function sanitizeReconstructionSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  return {
    rawExecutions: safeProvenanceNumber(input.rawExecutions, 0, 1_000_000),
    completedTrades: safeProvenanceNumber(input.completedTrades, 0, 1_000_000),
    openPositions: safeProvenanceNumber(input.openPositions, 0, 100_000),
    partialExits: safeProvenanceNumber(input.partialExits, 0, 1_000_000),
    positionFlips: safeProvenanceNumber(input.positionFlips, 0, 1_000_000),
    warnings: safeStringArray(input.warnings, 10, 220)
  };
}

function safeProvenanceString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength) : undefined;
}

function safeProvenanceNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(min, Math.min(max, number));
}

function safeStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => safeProvenanceString(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function safeConfidenceLabel(value: unknown) {
  return value === "Ready" || value === "Review Recommended" || value === "Blocked" ? value : undefined;
}

function sanitizePropertyObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth > 2) return {};
  const output: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 30)) {
    const key = rawKey.trim().slice(0, 60);
    if (!key || isSensitiveEventProperty(key)) continue;
    const sanitized = sanitizePropertyValue(rawValue, depth + 1);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function sanitizePropertyValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 240);
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizePropertyValue(item, depth)).filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return sanitizePropertyObject(value as Record<string, unknown>, depth);
  }
  return undefined;
}

function isSensitiveEventProperty(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.endsWith("count")) return false;
  return /(trade|trades|row|rows|csv|html|token|secret|password|account|execution|sourceexecution|brokerexecution|payment|card)/i.test(
    key
  );
}

type RateLimitOptions = {
  name: string;
  windowMs: number;
  maxRequests: number;
  preferUserKey?: boolean;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function createRateLimiter(options: RateLimitOptions): express.RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${options.name}:${rateLimitIdentity(req, options.preferUserKey)}`;
    const existingBucket = rateLimitBuckets.get(key);
    const bucket = !existingBucket || existingBucket.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : existingBucket;
    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);

    if (bucket.count > options.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "RATE_LIMITED",
        message: "Too many requests. Wait a moment and try again."
      });
      return;
    }

    if (rateLimitBuckets.size > 20_000 && Math.random() < 0.02) pruneRateLimitBuckets(now);
    next();
  };
}

function rateLimitIdentity(req: express.Request, preferUserKey = false) {
  const userId = preferUserKey ? getUserId(req) : "";
  if (userId) return `user:${userId}`;
  const forwardedFor = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwardedFor || req.ip || "unknown"}`;
}

function pruneRateLimitBuckets(now: number) {
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function requireJsonForMutatingRequests(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  const contentLength = Number(req.get("content-length") || 0);
  if (contentLength === 0) {
    next();
    return;
  }

  if (!req.is("application/json")) {
    res.status(415).json({
      error: "UNSUPPORTED_MEDIA_TYPE",
      message: "API requests with a body must use application/json."
    });
    return;
  }

  next();
}

function validateTradeUploadBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      error: "INVALID_UPLOAD_BODY",
      message: "Upload body must include rows or html."
    };
  }

  const input = body as Record<string, unknown>;
  if (typeof input.html === "string") {
    if (input.html.length > MAX_HTML_UPLOAD_CHARS) {
      return {
        error: "UPLOAD_TOO_LARGE",
        message: "This HTML export is too large to process in one request. Export a smaller date range and try again."
      };
    }
    return null;
  }

  if (!Array.isArray(input.rows)) {
    return {
      error: "INVALID_UPLOAD_BODY",
      message: "Upload body must include rows or html."
    };
  }

  if (input.rows.length > MAX_UPLOAD_ROWS) {
    return {
      error: "UPLOAD_TOO_LARGE",
      message: "This upload has too many rows to process in one request. Export a smaller date range and try again."
    };
  }

  return null;
}

function validateDiagnosticsBody(body: unknown, trades: unknown[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      error: "INVALID_DIAGNOSTICS_BODY",
      message: "Diagnostics body must include a trades array."
    };
  }

  if (!Array.isArray((body as Record<string, unknown>).trades)) {
    return {
      error: "INVALID_DIAGNOSTICS_BODY",
      message: "Diagnostics body must include a trades array."
    };
  }

  if (trades.length > MAX_DIAGNOSTIC_TRADES) {
    return {
      error: "UPLOAD_TOO_LARGE",
      message: "This report has too many trades to process in one request. Export a smaller date range and try again."
    };
  }

  const name = (body as Record<string, unknown>).name;
  if (typeof name === "string" && name.length > 180) {
    return {
      error: "INVALID_REPORT_NAME",
      message: "Report name must be 180 characters or fewer."
    };
  }

  return null;
}

function securityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Content-Security-Policy", contentSecurityPolicy());
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
}

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://js.stripe.com https://va.vercel-scripts.com",
    "connect-src 'self' https://edgetrace-production.up.railway.app https://*.clerk.accounts.dev https://*.clerk.com https://api.clerk.com https://*.stripe.com https://api.stripe.com https://vitals.vercel-insights.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com",
    "form-action 'self' https://*.stripe.com",
    "upgrade-insecure-requests"
  ].join("; ");
}

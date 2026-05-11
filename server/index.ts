import cors from "cors";
import express from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { getAllowedFrontendOrigin, validateServerEnvironment } from "./env";
import {
  addReportToCollection,
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
  getSavedComparison,
  initDb,
  listDiagnosticReports,
  listCollections,
  listCollectionReviewStates,
  listSavedComparisons,
  removeReportFromCollection,
  reorderCollectionReports,
  saveDiagnosticReport,
  trackUserEvent,
  updateCollection,
  upsertCollectionReviewState,
  updateSavedComparison,
  updateDiagnosticReport,
  updateUserPlan
} from "./db";
import {
  constructStripeWebhookEvent,
  createBillingPortalSession,
  createCheckoutSession,
  handleCheckoutSessionCompleted,
  handleInvoicePaymentFailed,
  isStripeConfigured,
  isStripeWebhookConfigured,
  normalizePaidPlan,
  updateUserPlanFromSubscription
} from "./stripe";
import { runDiagnostics } from "../src/lib/diagnostics";
import { describeNormalizationIssue, normalizeTrades } from "../src/lib/normalize";
import {
  canCreateCollection,
  canCreateReport,
  canCreateSavedComparison,
  canUseBrokerAdapter,
  getPlanConfig
} from "../src/lib/entitlements";
import { normalizePlanId } from "../src/lib/plans";
import type { ImportProvenance } from "../src/types";
import {
  sanitizeCollectionForUser,
  sanitizeReportForUser
} from "./entitlements";

const { authMode } = validateServerEnvironment();
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const isProduction = process.env.NODE_ENV === "production";
const allowedFrontendOrigin = getAllowedFrontendOrigin();

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(
  cors({
    origin: isProduction ? allowedFrontendOrigin : true,
    credentials: true
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
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "edgetrace-api",
    databaseProvider: getDatabaseProviderName(),
    authMode,
    billingConfigured: isStripeConfigured()
  });
});

type EdgeTraceRequest = express.Request & { edgeTraceUserId?: string };

if (authMode === "clerk") {
  app.use(clerkMiddleware());
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
    await getOrCreateUserProfile(userId, { email: "demo@edgetrace.local", name: "Demo Analyst" });
    next();
    return;
  }

  const auth = getAuth(req);
  const { userId } = auth;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (req as EdgeTraceRequest).edgeTraceUserId = userId;
  const claims = auth.sessionClaims as Record<string, unknown> | undefined;
  await getOrCreateUserProfile(userId, {
    email: firstString(claims?.email, claims?.email_address, claims?.primary_email_address),
    name: firstString(claims?.name, claims?.full_name)
  });
  next();
}

function getUserId(req: express.Request) {
  return (req as EdgeTraceRequest).edgeTraceUserId ?? "";
}

app.use("/api", requireEdgeTraceUser);

app.get("/api/me", async (req, res) => {
  res.json({
    profile: {
      ...(await getOrCreateUserProfile(getUserId(req))),
      billingConfigured: isStripeConfigured()
    }
  });
});

app.get("/api/me/activation", async (req, res) => {
  res.json(await getActivationSummary(getUserId(req)));
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
  if (!isStripeConfigured()) {
    res.status(503).json({
      error: "BILLING_NOT_CONFIGURED",
      message: "Billing is not configured in this environment."
    });
    return;
  }

  const planId = normalizePaidPlan(req.body?.planId);
  if (!planId) {
    res.status(400).json({
      error: "INVALID_PLAN",
      message: "Checkout is available for Pro and Advanced plans."
    });
    return;
  }

  try {
    const session = await createCheckoutSession(getUserId(req), planId, getRequestOrigin(req));
    if (!session.url) {
      res.status(502).json({
        error: "CHECKOUT_SESSION_FAILED",
        message: "Stripe did not return a checkout URL."
      });
      return;
    }
    await trackUserEvent(getUserId(req), { eventName: "checkout_started", properties: { planId } });
    res.json({ url: session.url });
  } catch (err) {
    res.status(422).json({
      error: "CHECKOUT_SESSION_FAILED",
      message: safeApiErrorMessage(err, "Unable to create checkout session.")
    });
  }
});

app.post("/api/billing/create-portal-session", async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(503).json({
      error: "BILLING_NOT_CONFIGURED",
      message: "Billing is not configured in this environment."
    });
    return;
  }

  try {
    const session = await createBillingPortalSession(getUserId(req), getRequestOrigin(req));
    await trackUserEvent(getUserId(req), { eventName: "billing_portal_opened" });
    res.json({ url: session.url });
  } catch (err) {
    res.status(422).json({
      error: "BILLING_PORTAL_FAILED",
      message: safeApiErrorMessage(err, "Unable to open billing portal.")
    });
  }
});

app.post("/api/trades/upload", (req, res) => {
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
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  const isDemo = !isProduction && (req.body?.isDemo === true || isDemoName(name));
  const brokerId = typeof req.body?.brokerId === "string" ? req.body.brokerId : "generic_csv";
  const importProvenance = sanitizeImportProvenance(req.body?.importProvenance);
  const plan = getPlanConfig((await getOrCreateUserProfile(userId)).planId);
  const existingBillableReportCount = await countBillableReports(userId);

  if (!isDemo && !canUseBrokerAdapter(plan, brokerId)) {
    res.status(403).json({
      error: "PLAN_LIMIT_REACHED",
      message: "Free plan supports generic CSV imports only. Upgrade to analyze broker-specific CSV exports."
    });
    return;
  }

  if (!isDemo && !canCreateReport(plan, existingBillableReportCount)) {
    res.status(403).json({
      error: "PLAN_LIMIT_REACHED",
      message: "Free plan includes 1 full report and preview access to additional reports. Upgrade for unlimited full diagnostics."
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
  res.json({ reports: await listDiagnosticReports(getUserId(req)) });
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
    const updated = await updateDiagnosticReport(getUserId(req), req.params.id, {
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
  } catch {
    res.status(422).json({ error: "Report details could not be updated" });
  }
});

app.delete("/api/diagnostics/:id", async (req, res) => {
  const deleted = await deleteDiagnosticReport(getUserId(req), req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Diagnostics not found" });
    return;
  }
  res.status(204).send();
});

app.delete("/api/demo-data", async (req, res) => {
  res.json(await cleanupDemoData(getUserId(req)));
});

app.get("/api/collections", async (req, res) => {
  res.json({ collections: await listCollections(getUserId(req)) });
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
      message: "Free plan allows 1 collection. Upgrade to create more."
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
      message: "Free plan allows 1 saved comparison. Upgrade to save more comparisons."
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

function safeApiErrorMessage(err: unknown, fallback: string) {
  if (isProduction) return fallback;
  return err instanceof Error ? err.message : fallback;
}

function getRequestOrigin(req: express.Request) {
  if (isProduction) return allowedFrontendOrigin;
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

function securityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
}

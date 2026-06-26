import type {
  CollectionInput,
  CollectionReviewState,
  CollectionReviewStateInput,
  DiagnosticsResult,
  ActivationSummary,
  FeedbackInput,
  FeedbackItem,
  FeedbackStatus,
  NormalizedTrade,
  ReportCollectionDetail,
  ReportCollectionSummary,
  ReportSummary,
  ReportUpdateInput,
  SavedComparison,
  SavedComparisonInput,
  UserProfile,
  PlanId,
  ImportProvenance,
  AggregateBenchmarkSnapshot
} from "../types";
import { runDiagnostics } from "./diagnostics";
import { describeNormalizationIssue, normalizeTrades } from "./normalize";

const DEFAULT_USER_ID = "local-demo-user";
const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const API_BASE_URL = shouldUseSameOriginApi() ? "" : CONFIGURED_API_BASE_URL;
let currentUserId = DEFAULT_USER_ID;
let currentAuthMode: "mock" | "clerk" = "mock";
let accessTokenProvider: (() => Promise<string | null>) | undefined;

export type ReportsDebugEvent = {
  timestamp: string;
  label: string;
  details?: Record<string, unknown>;
};

const REPORTS_DEBUG_EVENT = "edgetrace:reports-debug";

export function setApiUserId(userId: string | null | undefined) {
  currentUserId = userId?.trim() || DEFAULT_USER_ID;
}

export function setApiAuth(input: {
  userId?: string | null;
  authMode?: "mock" | "clerk";
  getAccessToken?: () => Promise<string | null>;
}) {
  currentUserId = input.userId?.trim() || DEFAULT_USER_ID;
  currentAuthMode = input.authMode ?? "mock";
  accessTokenProvider = input.getAccessToken;
}

async function apiHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const headers: Record<string, string> = { ...(extra as Record<string, string> | undefined) };
  const token = accessTokenProvider ? await accessTokenProvider() : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (currentAuthMode === "mock") {
    headers["x-edgetrace-user-id"] = currentUserId;
  }

  return headers;
}

export function isReportsDebugEnabled() {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("debugReports") === "1" ||
    import.meta.env.VITE_REPORTS_DEBUG === "1"
  );
}

export function emitReportsDebug(label: string, details?: Record<string, unknown>) {
  if (!isReportsDebugEnabled()) return;
  const event: ReportsDebugEvent = {
    timestamp: new Date().toISOString(),
    label,
    details: sanitizeReportsDebugDetails(details)
  };
  console.info("[reports-debug]", event);
  window.dispatchEvent(new CustomEvent<ReportsDebugEvent>(REPORTS_DEBUG_EVENT, { detail: event }));
}

export function subscribeReportsDebug(listener: (event: ReportsDebugEvent) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<ReportsDebugEvent>).detail);
  window.addEventListener(REPORTS_DEBUG_EVENT, handler);
  return () => window.removeEventListener(REPORTS_DEBUG_EVENT, handler);
}

async function readApiError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  return readApiErrorText(text, fallback);
}

function readApiErrorText(text: string, fallback: string) {
  if (!text) return fallback;
  if (isHtmlErrorBody(text)) return fallback;
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    return body.message || body.error || fallback;
  } catch {
    return text;
  }
}

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function shouldUseSameOriginApi() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "www.edgetrace.app" ||
    hostname === "edgetrace.app" ||
    hostname === "edge-trace.vercel.app" ||
    /^edge-trace-[a-z0-9-]+-edge-trace-s-projects\.vercel\.app$/i.test(hostname)
  );
}

export async function getMe() {
  const response = await fetch(apiUrl("/api/me"), { headers: await apiHeaders() });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to load account profile"));
  return response.json() as Promise<{ profile: UserProfile }>;
}

export async function getActivationSummary() {
  const response = await fetch(apiUrl("/api/me/activation"), { headers: await apiHeaders() });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to load activation summary"));
  return response.json() as Promise<ActivationSummary>;
}

export async function postUserEvent(eventName: string, properties?: Record<string, unknown>) {
  const response = await fetch(apiUrl("/api/events"), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ eventName, properties })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to track event"));
  return response.json() as Promise<{ event: { id: string; eventName: string; createdAt: string } }>;
}

export async function submitFeedback(input: FeedbackInput) {
  const response = await fetch(apiUrl("/api/feedback"), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to submit feedback"));
  return response.json() as Promise<{ feedback: FeedbackItem }>;
}

export async function getAdminStatus() {
  const response = await fetch(apiUrl("/api/admin/me"), { headers: await apiHeaders() });
  if (!response.ok) return { isAdmin: false };
  return response.json() as Promise<{ isAdmin: boolean }>;
}

export async function listAdminFeedback() {
  const response = await fetch(apiUrl("/api/admin/feedback"), { headers: await apiHeaders() });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to load feedback"));
  return response.json() as Promise<{ feedback: FeedbackItem[] }>;
}

export async function updateAdminFeedbackStatus(id: string, status: FeedbackStatus) {
  const response = await fetch(apiUrl(`/api/admin/feedback/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to update feedback"));
  return response.json() as Promise<{ feedback: FeedbackItem }>;
}

export async function updateMyPlan(planId: PlanId) {
  const response = await fetch(apiUrl("/api/me/plan"), {
    method: "PATCH",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ planId })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to update plan"));
  return response.json() as Promise<{ profile: UserProfile }>;
}

export async function createCheckoutSession(planId: Exclude<PlanId, "free">) {
  const response = await fetch(apiUrl("/api/billing/create-checkout-session"), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ planId })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to create checkout session"));
  return response.json() as Promise<{ url: string }>;
}

export async function confirmCheckoutSession(sessionId: string) {
  const response = await fetch(apiUrl("/api/billing/confirm-checkout-session"), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sessionId })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Checkout completed, but the plan could not be refreshed yet."));
  return response.json() as Promise<{ profile: UserProfile }>;
}

export async function createBillingPortalSession() {
  const response = await fetch(apiUrl("/api/billing/create-portal-session"), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" })
  });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to open billing portal"));
  return response.json() as Promise<{ url: string }>;
}

export async function uploadTrades(rows: unknown[]) {
  const normalizedTrades = normalizeTrades(rows);
  return {
    normalizedTrades,
    rejectedRows: rows.length - normalizedTrades.length,
    warning: normalizedTrades.length === 0 ? describeNormalizationIssue(rows) : undefined
  };
}

export async function uploadHtmlTrades(html: string) {
  const rows = [{ sourceType: "html", content: html }];
  const normalizedTrades = normalizeTrades(rows);
  return {
    normalizedTrades,
    rejectedRows: rows.length - normalizedTrades.length,
    warning: normalizedTrades.length === 0 ? describeNormalizationIssue(rows) : undefined
  };
}

export async function runTradeDiagnostics(
  trades: NormalizedTrade[],
  name?: string,
  options?: { brokerId?: string; isDemo?: boolean; importProvenance?: ImportProvenance }
) {
  const response = await fetch(apiUrl("/api/diagnostics/run"), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ trades, name, ...options })
  });
  if (!response.ok) {
    const message = await readApiError(response, "Unable to run diagnostics");
    if (shouldUseLocalDiagnosticsFallback(response)) {
      return createLocalDiagnosticReport(trades, name, options);
    }
    throw new Error(message);
  }
  return response.json() as Promise<DiagnosticsResult>;
}

function shouldUseLocalDiagnosticsFallback(response: Response) {
  return response.status >= 500;
}

function createLocalDiagnosticReport(
  trades: NormalizedTrade[],
  name?: string,
  options?: { importProvenance?: ImportProvenance }
): DiagnosticsResult {
  const now = new Date().toISOString();
  return {
    ...runDiagnostics(createLocalReportId(), trades),
    name: name?.trim() || "Diagnostic Report",
    createdAt: now,
    updatedAt: now,
    importProvenance: options?.importProvenance,
    accessLevel: "full",
    lockedSections: [],
    notes: "Generated locally because the diagnostics service returned an internal error."
  };
}

function createLocalReportId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `local-${crypto.randomUUID()}`
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isHtmlErrorBody(text: string) {
  return /^\s*(?:<!doctype html|<html|<pre>)/i.test(text) || /<pre>\s*Internal Server Error\s*<\/pre>/i.test(text);
}

function createDebugRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `reports-${crypto.randomUUID()}`;
  return `reports-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function summarizeReportsApiBody(text: string) {
  if (!text) return { empty: true };
  if (isHtmlErrorBody(text)) {
    return { type: "html_error", length: text.length, preview: text.slice(0, 120) };
  }
  try {
    const body = JSON.parse(text) as {
      reports?: unknown[];
      error?: unknown;
      message?: unknown;
      debugRequestId?: unknown;
      debugHint?: unknown;
    };
    return {
      type: Array.isArray(body.reports) ? "reports" : "json",
      reportCount: Array.isArray(body.reports) ? body.reports.length : undefined,
      error: typeof body.error === "string" ? body.error : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
      debugRequestId: typeof body.debugRequestId === "string" ? body.debugRequestId : undefined,
      debugHint: typeof body.debugHint === "string" ? body.debugHint : undefined
    };
  } catch {
    return { type: "text", length: text.length, preview: text.slice(0, 160) };
  }
}

function sanitizeReportsDebugDetails(details: Record<string, unknown> | undefined) {
  if (!details) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (isReportsDebugSensitiveKey(key)) continue;
    if (isDebugPrimitive(value)) {
      output[key] = value;
    } else if (Array.isArray(value)) {
      output[key] = value.slice(0, 20).map((item) => (isDebugPrimitive(item) ? item : "[object]"));
    } else if (value && typeof value === "object") {
      output[key] = sanitizeReportsDebugDetails(value as Record<string, unknown>);
    }
  }
  return output;
}

function isDebugPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value);
}

function isReportsDebugSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  if (normalized === "userid" || normalized === "user_id" || normalized === "accountid" || normalized === "account_id") return true;
  return /(token|secret|password|authorization|clerk|stripe|payment|card|raw|csv|trade|execution)/i.test(normalized);
}

export async function listReports() {
  const debugEnabled = isReportsDebugEnabled();
  const debugRequestId = debugEnabled ? createDebugRequestId() : undefined;
  const endpoint = "/api/diagnostics";
  emitReportsDebug("GET /api/diagnostics request started", {
    endpoint,
    method: "GET",
    debugRequestId
  });
  try {
    const response = await fetch(apiUrl(endpoint), {
      headers: await apiHeaders(debugRequestId ? { "x-debug-request-id": debugRequestId } : undefined)
    });
    const text = await response.text().catch(() => "");
    const bodySummary = summarizeReportsApiBody(text);
    emitReportsDebug("GET /api/diagnostics response received", {
      endpoint,
      method: "GET",
      status: response.status,
      ok: response.ok,
      debugRequestId: response.headers.get("x-debug-request-id") || debugRequestId,
      bodySummary
    });

    if (!response.ok) {
      const message = readApiErrorText(text, "Unable to load reports");
      const error = new Error(import.meta.env.DEV ? `GET /api/diagnostics failed: ${message}` : message);
      emitReportsDebug("GET /api/diagnostics thrown error", {
        endpoint,
        method: "GET",
        status: response.status,
        debugRequestId,
        errorName: error.name,
        errorMessage: error.message,
        bodySummary
      });
      throw error;
    }

    const parsed = text ? (JSON.parse(text) as { reports?: ReportSummary[] }) : { reports: [] };
    emitReportsDebug("GET /api/diagnostics reports parsed", {
      endpoint,
      method: "GET",
      debugRequestId,
      reportCount: Array.isArray(parsed.reports) ? parsed.reports.length : 0
    });
    return parsed as { reports: ReportSummary[] };
  } catch (err) {
    emitReportsDebug("GET /api/diagnostics request failed", {
      endpoint,
      method: "GET",
      debugRequestId,
      thrownErrorName: err instanceof Error ? err.name : typeof err,
      thrownErrorMessage: err instanceof Error ? err.message : "Unknown reports request failure"
    });
    throw err;
  }
}

export async function getReport(id: string) {
  const response = await fetch(apiUrl(`/api/diagnostics/${id}`), { headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to load report");
  return response.json() as Promise<DiagnosticsResult>;
}

export async function getReportBenchmarks(id: string) {
  const response = await fetch(apiUrl(`/api/diagnostics/${id}/benchmarks`), { headers: await apiHeaders() });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to load aggregate benchmarks"));
  return response.json() as Promise<AggregateBenchmarkSnapshot>;
}

export async function deleteReport(id: string) {
  const debugEnabled = isReportsDebugEnabled();
  const debugRequestId = debugEnabled ? createDebugRequestId() : undefined;
  const endpoint = "/api/reports/archive";
  emitReportsDebug("POST /api/reports/archive request started", {
    endpoint,
    method: "POST",
    debugRequestId
  });
  const response = await fetch(apiUrl(endpoint), {
    method: "POST",
    headers: await apiHeaders({
      "Content-Type": "application/json",
      ...(debugRequestId ? { "x-debug-request-id": debugRequestId } : {})
    }),
    body: JSON.stringify({ reportId: id })
  });
  if (response.ok) {
    emitReportsDebug("POST /api/reports/archive succeeded", {
      endpoint,
      method: "POST",
      status: response.status,
      debugRequestId: response.headers.get("x-debug-request-id") || debugRequestId
    });
    return;
  }

  const archiveText = await response.text().catch(() => "");
  const archiveMessage = readApiErrorText(archiveText, "Unable to delete report");
  emitReportsDebug("POST /api/reports/archive failed", {
    endpoint,
    method: "POST",
    status: response.status,
    debugRequestId: response.headers.get("x-debug-request-id") || debugRequestId,
    bodySummary: summarizeReportsApiBody(archiveText),
    errorMessage: archiveMessage
  });

  if (shouldTryLegacyDeleteFallback(response.status, archiveMessage)) {
    await deleteReportWithLegacyEndpoint(id, debugRequestId);
    return;
  }

  throw new Error(archiveMessage);
}

async function deleteReportWithLegacyEndpoint(id: string, parentDebugRequestId: string | undefined) {
  const endpoint = `/api/diagnostics/${encodeURIComponent(id)}`;
  const debugRequestId = parentDebugRequestId ? `${parentDebugRequestId}-fallback` : undefined;
  emitReportsDebug("DELETE /api/diagnostics/:id fallback request started", {
    endpoint: "/api/diagnostics/:id",
    method: "DELETE",
    debugRequestId
  });
  const response = await fetch(apiUrl(endpoint), {
    method: "DELETE",
    headers: await apiHeaders(debugRequestId ? { "x-debug-request-id": debugRequestId } : undefined)
  });
  if (response.ok) {
    emitReportsDebug("DELETE /api/diagnostics/:id fallback succeeded", {
      endpoint: "/api/diagnostics/:id",
      method: "DELETE",
      status: response.status,
      debugRequestId: response.headers.get("x-debug-request-id") || debugRequestId
    });
    return;
  }

  const text = await response.text().catch(() => "");
  const message = readApiErrorText(text, "Unable to delete report");
  emitReportsDebug("DELETE /api/diagnostics/:id fallback failed", {
    endpoint: "/api/diagnostics/:id",
    method: "DELETE",
    status: response.status,
    debugRequestId: response.headers.get("x-debug-request-id") || debugRequestId,
    bodySummary: summarizeReportsApiBody(text),
    errorMessage: message
  });
  throw new Error(message);
}

function shouldTryLegacyDeleteFallback(status: number, message: string) {
  return status >= 500 || /EdgeTrace service hit an internal error|internal error/i.test(message);
}

export async function updateReportDetails(id: string, input: ReportUpdateInput) {
  const response = await fetch(apiUrl(`/api/diagnostics/${id}`), {
    method: "PATCH",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Unable to update report details");
  return response.json() as Promise<ReportSummary>;
}

export async function listCollections() {
  const response = await fetch(apiUrl("/api/collections"), { headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to load collections");
  return response.json() as Promise<{ collections: ReportCollectionSummary[] }>;
}

export async function createCollection(input: CollectionInput) {
  const response = await fetch(apiUrl("/api/collections"), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to create collection"));
  return response.json() as Promise<ReportCollectionSummary>;
}

export async function getCollection(id: string) {
  const response = await fetch(apiUrl(`/api/collections/${id}`), { headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to load collection");
  return response.json() as Promise<ReportCollectionDetail>;
}

export async function updateCollection(id: string, input: Partial<CollectionInput>) {
  const response = await fetch(apiUrl(`/api/collections/${id}`), {
    method: "PATCH",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Unable to update collection");
  return response.json() as Promise<ReportCollectionSummary>;
}

export async function deleteCollection(id: string) {
  const response = await fetch(apiUrl(`/api/collections/${id}`), { method: "DELETE", headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to delete collection");
}

export async function addReportToCollection(collectionId: string, reportId: string) {
  const response = await fetch(apiUrl(`/api/collections/${collectionId}/reports`), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ reportId })
  });
  if (!response.ok) throw new Error("Unable to add report to collection");
  return response.json() as Promise<ReportCollectionDetail>;
}

export async function removeReportFromCollection(collectionId: string, reportId: string) {
  const response = await fetch(apiUrl(`/api/collections/${collectionId}/reports/${reportId}`), {
    method: "DELETE",
    headers: await apiHeaders()
  });
  if (!response.ok) throw new Error("Unable to remove report from collection");
}

export async function reorderCollectionReports(collectionId: string, reportIds: string[]) {
  const response = await fetch(apiUrl(`/api/collections/${collectionId}/reports/order`), {
    method: "PATCH",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ reportIds })
  });
  if (!response.ok) throw new Error("Unable to reorder collection reports");
  return response.json() as Promise<ReportCollectionDetail>;
}

export async function getCollectionReviewStates(collectionId: string) {
  const response = await fetch(apiUrl(`/api/collections/${collectionId}/review-states`), { headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to load review states");
  return response.json() as Promise<{ reviewStates: CollectionReviewState[] }>;
}

export async function updateCollectionReviewState(collectionId: string, input: CollectionReviewStateInput) {
  const response = await fetch(apiUrl(`/api/collections/${collectionId}/review-states`), {
    method: "PATCH",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Unable to update review state");
  return response.json() as Promise<CollectionReviewState>;
}

export async function deleteCollectionReviewState(
  collectionId: string,
  previousReportId: string,
  currentReportId: string
) {
  const response = await fetch(apiUrl(`/api/collections/${collectionId}/review-states`), {
    method: "DELETE",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ previousReportId, currentReportId })
  });
  if (!response.ok) throw new Error("Unable to clear review state");
}

export async function listSavedComparisons() {
  const response = await fetch(apiUrl("/api/saved-comparisons"), { headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to load saved comparisons");
  return response.json() as Promise<{ comparisons: SavedComparison[] }>;
}

export async function createSavedComparison(input: SavedComparisonInput) {
  const response = await fetch(apiUrl("/api/saved-comparisons"), {
    method: "POST",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await readApiError(response, "Unable to save comparison"));
  return response.json() as Promise<SavedComparison>;
}

export async function updateSavedComparison(id: string, input: Partial<SavedComparisonInput>) {
  const response = await fetch(apiUrl(`/api/saved-comparisons/${id}`), {
    method: "PATCH",
    headers: await apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Unable to update saved comparison");
  return response.json() as Promise<SavedComparison>;
}

export async function deleteSavedComparison(id: string) {
  const response = await fetch(apiUrl(`/api/saved-comparisons/${id}`), { method: "DELETE", headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to delete saved comparison");
}

export async function cleanupDemoData() {
  const response = await fetch(apiUrl("/api/demo-data"), { method: "DELETE", headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to clean up demo data");
  return response.json() as Promise<{
    deletedReports: number;
    deletedCollections: number;
    deletedSavedComparisons: number;
  }>;
}

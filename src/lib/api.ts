import type {
  CollectionInput,
  CollectionReviewState,
  CollectionReviewStateInput,
  DiagnosticsResult,
  ActivationSummary,
  NormalizedTrade,
  ReportCollectionDetail,
  ReportCollectionSummary,
  ReportSummary,
  ReportUpdateInput,
  SavedComparison,
  SavedComparisonInput,
  UserProfile,
  PlanId,
  ImportProvenance
} from "../types";
import { runDiagnostics } from "./diagnostics";
import { describeNormalizationIssue, normalizeTrades } from "./normalize";

const DEFAULT_USER_ID = "local-demo-user";
const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const API_BASE_URL = shouldUseSameOriginApi() ? "" : CONFIGURED_API_BASE_URL;
let currentUserId = DEFAULT_USER_ID;
let currentAuthMode: "mock" | "clerk" = "mock";
let accessTokenProvider: (() => Promise<string | null>) | undefined;

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

async function readApiError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
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

export async function listReports() {
  const response = await fetch(apiUrl("/api/diagnostics"), { headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to load reports");
  return response.json() as Promise<{ reports: ReportSummary[] }>;
}

export async function getReport(id: string) {
  const response = await fetch(apiUrl(`/api/diagnostics/${id}`), { headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to load report");
  return response.json() as Promise<DiagnosticsResult>;
}

export async function deleteReport(id: string) {
  const response = await fetch(apiUrl(`/api/diagnostics/${id}`), { method: "DELETE", headers: await apiHeaders() });
  if (!response.ok) throw new Error("Unable to delete report");
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

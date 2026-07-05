import { postUserEvent } from "./api";

const ANONYMOUS_ID_KEY = "edgetrace.analyticsId";
let analyticsContext: Record<string, unknown> = {};

export function setAnalyticsContext(context: Record<string, unknown>) {
  analyticsContext = sanitizeClientProperties(context) ?? {};
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  const anonymousId = getAnonymousId();
  void postUserEvent(eventName, buildEventProperties(properties), { anonymousId }).catch(() => {
    // Activation analytics must never block the product workflow.
  });
}

function buildEventProperties(properties: Record<string, unknown> | undefined) {
  return sanitizeClientProperties({
    ...analyticsContext,
    route: typeof window === "undefined" ? "" : window.location.pathname,
    referrer: safeReferrer(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    ...properties
  });
}

function getAnonymousId() {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(ANONYMOUS_ID_KEY, next);
    return next;
  } catch {
    return "unavailable";
  }
}

function safeReferrer() {
  if (typeof document === "undefined" || !document.referrer) return "";
  try {
    const referrer = new URL(document.referrer);
    return `${referrer.origin}${referrer.pathname}`.slice(0, 180);
  } catch {
    return "";
  }
}

function sanitizeClientProperties(properties: Record<string, unknown> | undefined) {
  if (!properties) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (isSensitiveKey(key)) continue;
    if (isPrimitive(value)) output[key] = value;
  }
  return output;
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.endsWith("count")) return false;
  return /(trades?|rows?|csv|html|token|secret|password|account|execution|sourceexecution|brokerexecution|payment|card|symbol|pnl|quantity|notes?|strategy|reportcontent)/i.test(
    key
  );
}

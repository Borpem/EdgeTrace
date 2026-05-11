import { postUserEvent } from "./api";

export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  void postUserEvent(eventName, sanitizeClientProperties(properties)).catch(() => {
    // Activation analytics must never block the product workflow.
  });
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
  return /(trades?|rows?|csv|html|token|secret|password|account|execution|sourceexecution|brokerexecution|payment|card)/i.test(
    key
  );
}

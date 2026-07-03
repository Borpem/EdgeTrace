export type FeatureIntroId = "upload" | "reports" | "collections" | "compare";

export type FeatureIntroContent = {
  id: FeatureIntroId;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
};

export const featureIntros: Record<FeatureIntroId, FeatureIntroContent> = {
  upload: {
    id: "upload",
    eyebrow: "Import Trades",
    title: "Turn a broker export into an EdgeTrace report.",
    body: "Use this page to upload trade history, confirm the detected broker format, review field mappings, and create a diagnostic report.",
    bullets: [
      "Upload CSV, HTML, or supported broker exports.",
      "Check mapping warnings before running diagnostics.",
      "Create the report that powers your dashboard, reports, compare, and strategy-set workflows."
    ]
  },
  reports: {
    id: "reports",
    eyebrow: "Reports",
    title: "Find and reopen every diagnostic report.",
    body: "Use Reports as your saved report library. Search, filter, edit report details, open dashboards, add reports to sets, or start a comparison.",
    bullets: [
      "Open a report to review the dashboard again.",
      "Filter by report type, strategy label, tags, or notes.",
      "Use saved reports as the source for compare and strategy sets."
    ]
  },
  collections: {
    id: "collections",
    eyebrow: "Strategy Sets",
    title: "Group related reports into strategy iterations.",
    body: "Use Strategy Sets to organize reports that belong to the same setup, system, or improvement cycle so you can review change over time.",
    bullets: [
      "Create a set for each strategy or playbook.",
      "Add related reports from the Reports page or set workspace.",
      "Track whether each iteration is improving or introducing new leaks."
    ]
  },
  compare: {
    id: "compare",
    eyebrow: "Compare",
    title: "Compare two reports to see what changed.",
    body: "Use Compare to place two diagnostic reports side by side and identify the metrics, segments, and behavior shifts behind improvement or regression.",
    bullets: [
      "Pick two reports from your saved library.",
      "Review metric deltas, attribution changes, and segment movement.",
      "Save useful comparisons for follow-up review."
    ]
  }
};

export function featureIntroStorageKey(userId: string) {
  return `edgetrace.featureIntros.${userId}`;
}

export function readHiddenFeatureIntros(userId: string): FeatureIntroId[] {
  try {
    const raw = window.localStorage.getItem(featureIntroStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { hidden?: unknown };
    return Array.isArray(parsed.hidden) ? parsed.hidden.filter(isFeatureIntroId) : [];
  } catch {
    return [];
  }
}

export function isFeatureIntroHidden(userId: string, featureId: FeatureIntroId) {
  return readHiddenFeatureIntros(userId).includes(featureId);
}

export function hideFeatureIntroForUser(userId: string, featureId: FeatureIntroId) {
  const hidden = Array.from(new Set([...readHiddenFeatureIntros(userId), featureId]));
  window.localStorage.setItem(featureIntroStorageKey(userId), JSON.stringify({ hidden }));
}

function isFeatureIntroId(value: unknown): value is FeatureIntroId {
  return value === "upload" || value === "reports" || value === "collections" || value === "compare";
}

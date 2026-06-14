export type PlanId = "free" | "pro" | "advanced";

export type FeatureKey =
  | "broker_imports"
  | "reconstruction_audit"
  | "export_audit"
  | "collection_attribution"
  | "review_workspace"
  | "saved_comparisons"
  | "collections"
  | "full_report_access"
  | "preview_reports"
  | "advanced_attribution"
  | "full_drilldowns"
  | "full_compare"
  | "strategy_sets"
  | "audit_exports"
  | "strategy_health_monitoring"
  | "review_cadence"
  | "aggregate_benchmarks";

export type PlanLimits = {
  maxReports: number | "unlimited";
  maxFullReports: number | "unlimited";
  maxCollections: number | "unlimited";
  maxSavedComparisons: number | "unlimited";
  brokerAdapters: "generic_csv" | "all";
};

export type PlanConfig = {
  id: PlanId;
  displayName: string;
  monthlyPriceLabel: string;
  description: string;
  limits: PlanLimits;
  features: Record<FeatureKey, boolean | "limited">;
  featureBullets: string[];
};

export const planConfigs: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    displayName: "Free",
    monthlyPriceLabel: "$0",
    description: "Core reporting and analysis.",
    limits: {
      maxReports: "unlimited",
      maxFullReports: "unlimited",
      maxCollections: "unlimited",
      maxSavedComparisons: "unlimited",
      brokerAdapters: "all"
    },
    features: {
      broker_imports: true,
      reconstruction_audit: true,
      export_audit: true,
      collection_attribution: true,
      review_workspace: true,
      saved_comparisons: true,
      collections: true,
      full_report_access: true,
      preview_reports: true,
      advanced_attribution: true,
      full_drilldowns: true,
      full_compare: true,
      strategy_sets: true,
      audit_exports: true,
      strategy_health_monitoring: true,
      review_cadence: false,
      aggregate_benchmarks: false
    },
    featureBullets: [
      "Unlimited full diagnostic reports",
      "Broker and generic CSV imports",
      "Full attribution, drilldowns, and compare",
      "Strategy sets, reconstruction audit, and exports",
      "Strategy health monitoring"
    ]
  },
  pro: {
    id: "pro",
    displayName: "Pro",
    monthlyPriceLabel: "$9.99/month",
    description: "Recurring reviews, alerts, and benchmark drift.",
    limits: {
      maxReports: "unlimited",
      maxFullReports: "unlimited",
      maxCollections: "unlimited",
      maxSavedComparisons: "unlimited",
      brokerAdapters: "all"
    },
    features: {
      broker_imports: true,
      reconstruction_audit: true,
      export_audit: true,
      collection_attribution: true,
      review_workspace: true,
      saved_comparisons: true,
      collections: true,
      full_report_access: true,
      preview_reports: true,
      advanced_attribution: true,
      full_drilldowns: true,
      full_compare: true,
      strategy_sets: true,
      audit_exports: true,
      strategy_health_monitoring: true,
      review_cadence: true,
      aggregate_benchmarks: true
    },
    featureBullets: [
      "Everything in Free",
      "Weekly Edge Review loop",
      "Regression alerts",
      "Benchmark drift tracking",
      "Next-review checklist",
      "Process score"
    ]
  },
  advanced: {
    id: "advanced",
    displayName: "Advanced",
    monthlyPriceLabel: "Legacy",
    description: "Legacy access with every paid review feature.",
    limits: {
      maxReports: "unlimited",
      maxFullReports: "unlimited",
      maxCollections: "unlimited",
      maxSavedComparisons: "unlimited",
      brokerAdapters: "all"
    },
    features: {
      broker_imports: true,
      reconstruction_audit: true,
      export_audit: true,
      collection_attribution: true,
      review_workspace: true,
      saved_comparisons: true,
      collections: true,
      full_report_access: true,
      preview_reports: true,
      advanced_attribution: true,
      full_drilldowns: true,
      full_compare: true,
      strategy_sets: true,
      audit_exports: true,
      strategy_health_monitoring: true,
      review_cadence: true,
      aggregate_benchmarks: true
    },
    featureBullets: [
      "Everything in Free",
      "Weekly Edge Review loop",
      "Regression alerts",
      "Benchmark drift tracking",
      "Next-review checklist",
      "Process score"
    ]
  }
};

export const planOrder: PlanId[] = ["free", "pro"];

export function normalizePlanId(planId: string | null | undefined): PlanId {
  return planId === "pro" || planId === "advanced" ? planId : "free";
}

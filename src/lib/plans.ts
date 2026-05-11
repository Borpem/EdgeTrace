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
  | "recurring_reviews"
  | "regression_alerts"
  | "edge_stability_score";

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
    description: "Validate the diagnostic workflow with lightweight strategy analysis.",
    limits: {
      maxReports: "unlimited",
      maxFullReports: 1,
      maxCollections: 1,
      maxSavedComparisons: 1,
      brokerAdapters: "generic_csv"
    },
    features: {
      broker_imports: false,
      reconstruction_audit: false,
      export_audit: false,
      collection_attribution: false,
      review_workspace: false,
      saved_comparisons: false,
      collections: "limited",
      full_report_access: "limited",
      preview_reports: true,
      advanced_attribution: false,
      full_drilldowns: false,
      full_compare: false,
      strategy_sets: false,
      audit_exports: false,
      strategy_health_monitoring: false,
      recurring_reviews: false,
      regression_alerts: false,
      edge_stability_score: false
    },
    featureBullets: [
      "1 full diagnostic report",
      "Preview access to additional reports",
      "Generic CSV imports",
      "Basic top-level diagnostics",
      "Upgrade preview for deeper attribution"
    ]
  },
  pro: {
    id: "pro",
    displayName: "Pro",
    monthlyPriceLabel: "Coming soon",
    description: "For active traders reviewing broker imports and strategy iterations.",
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
      recurring_reviews: false,
      regression_alerts: false,
      edge_stability_score: false
    },
    featureBullets: [
      "Unlimited full diagnostic reports",
      "All supported broker CSV imports",
      "Full attribution and drilldowns",
      "Compare reports and strategy sets",
      "Reconstruction audit",
      "Exports",
      "Strategy health monitoring"
    ]
  },
  advanced: {
    id: "advanced",
    displayName: "Advanced",
    monthlyPriceLabel: "Coming soon",
    description: "Reserved for deeper attribution, API access, and team research workflows.",
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
      recurring_reviews: true,
      regression_alerts: true,
      edge_stability_score: true
    },
    featureBullets: [
      "Everything in Pro",
      "Regression alerts",
      "Recurring strategy reviews",
      "Edge stability score",
      "Future API access",
      "Future team and priority support"
    ]
  }
};

export const planOrder: PlanId[] = ["free", "pro", "advanced"];

export function normalizePlanId(planId: string | null | undefined): PlanId {
  return planId === "pro" || planId === "advanced" ? planId : "free";
}

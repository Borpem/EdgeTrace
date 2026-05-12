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
    description: "Explore the first diagnostic.",
    limits: {
      maxReports: "unlimited",
      maxFullReports: 1,
      maxCollections: 1,
      maxSavedComparisons: 1,
      brokerAdapters: "all"
    },
    features: {
      broker_imports: true,
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
      "Supported broker and generic CSV imports",
      "Preview deeper insights after first report",
      "Limited report history"
    ]
  },
  pro: {
    id: "pro",
    displayName: "Pro",
    monthlyPriceLabel: "$19/month",
    description: "Full strategy workflow.",
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
      "Full attribution and drilldowns",
      "Compare reports",
      "Strategy sets",
      "Reconstruction audit",
      "Exports",
      "Strategy health monitoring"
    ]
  },
  advanced: {
    id: "advanced",
    displayName: "Advanced",
    monthlyPriceLabel: "Coming Soon",
    description: "Continuous strategy intelligence.",
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
      "Recurring strategy reviews",
      "Regression alerts",
      "Edge stability score",
      "Future team/API/priority import support"
    ]
  }
};

export const planOrder: PlanId[] = ["free", "pro", "advanced"];

export function normalizePlanId(planId: string | null | undefined): PlanId {
  return planId === "pro" || planId === "advanced" ? planId : "free";
}

import { normalizePlanId, planConfigs, type FeatureKey, type PlanConfig, type PlanId } from "./plans";
import type { DiagnosticsResult, ReportSummary } from "../types";

export type ReportAccessLevel = "full" | "preview" | "locked";

export function getPlanConfig(planId: string | null | undefined): PlanConfig {
  return planConfigs[normalizePlanId(planId)];
}

export function canCreateReport(plan: PlanConfig | PlanId, currentReportCount: number) {
  const config = typeof plan === "string" ? getPlanConfig(plan) : plan;
  return underLimit(currentReportCount, config.limits.maxReports);
}

export function isFirstFullReportAvailable(plan: PlanConfig | PlanId, fullReportCount: number) {
  const config = typeof plan === "string" ? getPlanConfig(plan) : plan;
  return underLimit(fullReportCount, config.limits.maxFullReports);
}

export function canCreateCollection(plan: PlanConfig | PlanId, currentCollectionCount: number) {
  const config = typeof plan === "string" ? getPlanConfig(plan) : plan;
  return underLimit(currentCollectionCount, config.limits.maxCollections);
}

export function canCreateSavedComparison(plan: PlanConfig | PlanId, currentSavedComparisonCount: number) {
  const config = typeof plan === "string" ? getPlanConfig(plan) : plan;
  return underLimit(currentSavedComparisonCount, config.limits.maxSavedComparisons);
}

export function canUseBrokerAdapter(plan: PlanConfig | PlanId, brokerId: string | null | undefined) {
  const config = typeof plan === "string" ? getPlanConfig(plan) : plan;
  if (!brokerId || brokerId === "generic_csv") return true;
  return config.limits.brokerAdapters === "all";
}

export function canUseFeature(plan: PlanConfig | PlanId, featureKey: FeatureKey) {
  const config = typeof plan === "string" ? getPlanConfig(plan) : plan;
  return config.features[featureKey] === true || config.features[featureKey] === "limited";
}

export function canViewAdvancedAttribution(plan: PlanConfig | PlanId) {
  return canUseFeature(plan, "advanced_attribution");
}

export function canViewFullDrilldown(plan: PlanConfig | PlanId) {
  return canUseFeature(plan, "full_drilldowns");
}

export function canUseStrategyMonitoring(plan: PlanConfig | PlanId) {
  return canUseFeature(plan, "strategy_health_monitoring");
}

export function canViewFullReport(plan: PlanConfig | PlanId, reportIndex = 0, report?: ReportSummary | DiagnosticsResult) {
  return getReportAccessLevel(plan, reportIndex, report) === "full";
}

export function getReportAccessLevel(
  plan: PlanConfig | PlanId,
  reportIndex = 0,
  report?: ReportSummary | DiagnosticsResult
): ReportAccessLevel {
  const config = typeof plan === "string" ? getPlanConfig(plan) : plan;
  if (report && "accessLevel" in report && report.accessLevel) return report.accessLevel;
  if (isDemoReport(report)) return "full";
  if (config.features.full_report_access === true) return "full";
  if (config.features.preview_reports === true) {
    return underLimit(reportIndex, config.limits.maxFullReports) ? "full" : "preview";
  }
  return underLimit(reportIndex, config.limits.maxFullReports) ? "full" : "locked";
}

export function formatLimit(limit: number | "unlimited") {
  return limit === "unlimited" ? "Unlimited" : String(limit);
}

function underLimit(currentCount: number, limit: number | "unlimited") {
  return limit === "unlimited" || currentCount < limit;
}

function isDemoReport(report?: ReportSummary | DiagnosticsResult) {
  if (!report) return false;
  return (
    report.name?.startsWith("Demo Report") ||
    report.name?.startsWith("ORB Demo") ||
    report.strategyLabel === "ORB Demo Strategy" ||
    (report.tags ?? []).some((tag) => tag.toLowerCase() === "demo")
  );
}

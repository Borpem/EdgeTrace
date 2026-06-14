import {
  getOrCreateUserProfile,
  listDiagnosticReports
} from "./db";
import { getPlanConfig, type ReportAccessLevel } from "../src/lib/entitlements";
import type { DiagnosticsResult, NormalizedTrade, ReportCollectionDetail, ReportSummary } from "../src/types";
import type { FeatureKey, PlanId } from "../src/lib/plans";

export type EntitlementFeature = FeatureKey | "full_drilldowns" | "reconstruction_audit" | "audit_exports" | "full_compare";

export async function getUserPlan(userId: string) {
  const profile = await getOrCreateUserProfile(userId);
  return getPlanConfig(profile.planId);
}

export async function getReportOrdinalForUser(userId: string, reportId: string) {
  const reports = await listDiagnosticReports(userId);
  const orderedBillableReports = reports
    .filter((report) => !isDemoReport(report))
    .sort((a, b) => safeTime(a.createdAt) - safeTime(b.createdAt));
  return orderedBillableReports.findIndex((report) => report.id === reportId);
}

export async function getReportAccessLevel(
  userId: string,
  report: DiagnosticsResult | ReportSummary
): Promise<ReportAccessLevel> {
  if (isDemoReport(report)) return "full";
  const plan = await getUserPlan(userId);
  if (plan.features.full_report_access === true) return "full";
  const ordinal = await getReportOrdinalForUser(userId, report.id);
  const fullLimit = plan.limits.maxFullReports;
  if (fullLimit === "unlimited") return "full";
  if (ordinal >= 0 && ordinal < fullLimit) return "full";
  return plan.features.preview_reports ? "preview" : "locked";
}

export async function canAccessFullReport(userId: string, report: DiagnosticsResult | ReportSummary) {
  return (await getReportAccessLevel(userId, report)) === "full";
}

export async function canAccessFeature(userId: string, featureKey: EntitlementFeature) {
  const plan = await getUserPlan(userId);
  return plan.features[featureKey as FeatureKey] === true;
}

export async function sanitizeReportForUser(userId: string, report: DiagnosticsResult) {
  const plan = await getUserPlan(userId);
  const accessLevel = await getReportAccessLevel(userId, report);
  const sanitized = sanitizeReportForAccess(report, accessLevel);
  if (accessLevel === "full" && plan.features.full_drilldowns !== true) {
    return {
      ...sanitized,
      trades: [],
      lockedSections: [...new Set([...(sanitized.lockedSections ?? []), ...previewLockedSections()])],
      upgradeMessage: "Upgrade to Pro to unlock EdgeTrace review features."
    };
  }
  return sanitized;
}

export async function sanitizeCollectionForUser(userId: string, collection: ReportCollectionDetail) {
  const sanitizedReports = await Promise.all(
    (collection.fullReports ?? []).map((report) => sanitizeReportForUser(userId, report))
  );
  return {
    ...collection,
    fullReports: sanitizedReports
  };
}

export function sanitizeReportForAccess(report: DiagnosticsResult, accessLevel: ReportAccessLevel): DiagnosticsResult {
  if (accessLevel === "full") {
    return {
      ...report,
      accessLevel,
      lockedSections: []
    };
  }

  const lockedSections = previewLockedSections();
  if (accessLevel === "locked") {
    return {
      id: report.id,
      name: report.name,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      notes: report.notes,
      tags: report.tags ?? [],
      strategyLabel: report.strategyLabel,
      reportType: report.reportType,
      importProvenance: report.importProvenance,
      metrics: report.metrics,
      insights: report.insights?.slice(0, 1) ?? [],
      trades: [],
      charts: emptyCharts(),
      accessLevel,
      lockedSections,
      upgradeMessage: "Upgrade to Pro to unlock EdgeTrace review features."
    };
  }

  return {
    ...report,
    insights: report.insights?.slice(0, 2) ?? [],
    trades: [],
    charts: {
      equityCurve: sampleChart(report.charts?.equityCurve ?? [], 16),
      pnlBySymbol: (report.charts?.pnlBySymbol ?? []).slice(0, 3),
      pnlByHour: (report.charts?.pnlByHour ?? []).slice(0, 3)
    },
    accessLevel,
    lockedSections,
    upgradeMessage: "Preview unlocked. Upgrade to Pro to unlock EdgeTrace review features."
  };
}

export function planUpgradeResponse(feature: EntitlementFeature, requiredPlan: PlanId = "pro", message?: string) {
  return {
    error: "PLAN_UPGRADE_REQUIRED",
    feature,
    requiredPlan,
    message: message ?? upgradeMessageForFeature(feature, requiredPlan)
  };
}

export function upgradeMessageForFeature(feature: EntitlementFeature, _requiredPlan: PlanId = "pro") {
  const messages: Partial<Record<EntitlementFeature, string>> = {
    full_drilldowns: "Full drilldowns are included on Free.",
    reconstruction_audit: "Reconstruction audit is included on Free.",
    audit_exports: "Audit exports are included on Free.",
    full_compare: "Report compare is included on Free.",
    strategy_health_monitoring: "Strategy health monitoring is included on Free.",
    review_cadence: "Upgrade to Pro to unlock the weekly Edge Review loop.",
    aggregate_benchmarks: "Upgrade to Pro to unlock aggregate benchmark intelligence."
  };
  return messages[feature] ?? "Upgrade to Pro to unlock this feature.";
}

function previewLockedSections() {
  return [
    "full_trades",
    "full_charts",
    "full_breakdowns",
    "full_drilldowns",
    "reconstruction_audit",
    "audit_exports",
    "source_execution_ids",
    "position_paths"
  ];
}

function sampleChart<T>(rows: T[], maxRows: number) {
  if (rows.length <= maxRows) return rows;
  const step = Math.ceil(rows.length / maxRows);
  return rows.filter((_, index) => index % step === 0).slice(0, maxRows);
}

function emptyCharts() {
  return {
    equityCurve: [],
    pnlBySymbol: [],
    pnlByHour: []
  };
}

function isDemoReport(report?: { name?: string; strategyLabel?: string; tags?: string[] }) {
  if (!report) return false;
  return (
    report.name?.startsWith("Demo Report") ||
    report.name?.startsWith("ORB Demo") ||
    report.strategyLabel === "ORB Demo Strategy" ||
    (report.tags ?? []).some((tag) => tag.toLowerCase() === "demo")
  );
}

function safeTime(value: string | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

export function stripPremiumTradeLineage(trade: NormalizedTrade): NormalizedTrade {
  const {
    sourceExecutionIds: _sourceExecutionIds,
    reconstructionWarnings: _reconstructionWarnings,
    brokerExecutionId: _brokerExecutionId,
    positionPath: _positionPath,
    ...safeTrade
  } = trade;
  return safeTrade;
}

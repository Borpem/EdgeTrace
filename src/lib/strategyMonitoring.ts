import type { ReportCollectionDetail, ReportSummary } from "../types";
import { buildCollectionAnalytics, costDragPct, type TrendDirection } from "./collectionAnalytics";
import { detectStrategyRegressions, type RegressionSignal } from "./regressionDetection";

export type StrategyHealthStatus = "improving" | "stable" | "watchlist" | "degrading" | "insufficient_data";

export type StrategyMonitoringOutput = {
  strategySetId: string;
  strategySetName: string;
  latestReportId?: string;
  healthStatus: StrategyHealthStatus;
  trendDirection: TrendDirection;
  primaryMonitoringInsight: string;
  regressionFlags: RegressionSignal[];
  improvementFlags: string[];
  bestHistoricalReport?: ReportSummary;
  currentVsBestSummary: string;
  edgeStabilityScore?: number;
  edgeStabilityBand: "Stable" | "Watchlist" | "Fragile" | "Unstable" | "Insufficient Data";
  trendMetrics: Array<{ label: string; direction: TrendDirection; latestValue?: number; firstValue?: number }>;
};

export function buildStrategyMonitoring(collection: ReportCollectionDetail): StrategyMonitoringOutput {
  const analytics = buildCollectionAnalytics(collection);
  const regressionFlags = detectStrategyRegressions(collection);
  const latest = analytics.latestReport;
  const bestHistoricalReport = analytics.bestReportByExpectancy ?? analytics.bestReportByNetPnl;
  const edgeStabilityScore = calculateEdgeStabilityScore(collection);
  const healthStatus = classifyHealthStatus(analytics.trendDirection, regressionFlags, analytics.reportCount);
  const improvementFlags = buildImprovementFlags(analytics.trends);

  return {
    strategySetId: collection.id,
    strategySetName: collection.name,
    latestReportId: latest?.id,
    healthStatus,
    trendDirection: analytics.trendDirection,
    primaryMonitoringInsight: buildMonitoringInsight(healthStatus, analytics.primaryCollectionInsight, regressionFlags),
    regressionFlags,
    improvementFlags,
    bestHistoricalReport,
    currentVsBestSummary: buildCurrentVsBestSummary(latest, bestHistoricalReport),
    edgeStabilityScore,
    edgeStabilityBand: stabilityBand(edgeStabilityScore),
    trendMetrics: analytics.trends.map((trend) => ({
      label: trend.label,
      direction: trend.direction,
      latestValue: trend.latestValue,
      firstValue: trend.firstValue
    }))
  };
}

function classifyHealthStatus(
  trendDirection: TrendDirection,
  regressions: RegressionSignal[],
  reportCount: number
): StrategyHealthStatus {
  if (reportCount < 2) return "insufficient_data";
  if (regressions.some((regression) => regression.severity === "high")) return "degrading";
  if (regressions.length) return "watchlist";
  if (trendDirection === "improving") return "improving";
  if (trendDirection === "degrading") return "degrading";
  return "stable";
}

function buildMonitoringInsight(status: StrategyHealthStatus, fallback: string, regressions: RegressionSignal[]) {
  if (status === "insufficient_data") return "Add another report to start monitoring whether this strategy is improving or degrading.";
  if (regressions[0]) return regressions[0].explanation;
  if (status === "stable") return "The latest reports are not showing a major regression signal. Continue monitoring cost drag and R capture.";
  return fallback;
}

function buildImprovementFlags(trends: ReturnType<typeof buildCollectionAnalytics>["trends"]) {
  return trends
    .filter((trend) => trend.direction === "improving")
    .map((trend) => `${trend.label} is improving`)
    .slice(0, 4);
}

function buildCurrentVsBestSummary(latest?: ReportSummary, best?: ReportSummary) {
  if (!latest || !best) return "Insufficient data to compare the current iteration against the best historical report.";
  if (latest.id === best.id) return "The latest report is currently the best historical iteration by expectancy.";
  const expectancyDelta = latest.expectancy - best.expectancy;
  return `Latest expectancy is ${expectancyDelta.toFixed(2)} versus ${best.name}.`;
}

function calculateEdgeStabilityScore(collection: ReportCollectionDetail) {
  const reports = collection.reports;
  if (reports.length < 3) return undefined;
  let score = 78;
  score -= variancePenalty(reports.map((report) => report.expectancy), 30);
  score -= variancePenalty(reports.map((report) => report.averageRealizedR ?? 0), 18);
  score -= variancePenalty(reports.map((report) => costDragPct(report) ?? 0), 24);
  const latest = reports[reports.length - 1];
  if (latest.expectancy < 0) score -= 12;
  if ((latest.averageRealizedR ?? 0) < 0) score -= 10;
  if ((costDragPct(latest) ?? 0) > 0.35) score -= 10;
  if (reports.length >= 5) score += 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function variancePenalty(values: number[], maxPenalty: number) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length < 2) return 0;
  const average = valid.reduce((total, value) => total + value, 0) / valid.length;
  const variance = valid.reduce((total, value) => total + Math.pow(value - average, 2), 0) / valid.length;
  return Math.min(maxPenalty, Math.sqrt(variance) * maxPenalty);
}

function stabilityBand(score: number | undefined): StrategyMonitoringOutput["edgeStabilityBand"] {
  if (score === undefined) return "Insufficient Data";
  if (score >= 78) return "Stable";
  if (score >= 58) return "Watchlist";
  if (score >= 35) return "Fragile";
  return "Unstable";
}

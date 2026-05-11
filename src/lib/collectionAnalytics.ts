import type { ReportCollectionDetail, ReportSummary } from "../types";

export type TrendDirection = "improving" | "degrading" | "mixed" | "flat" | "insufficient_data";
export type TrendConfidence = "high" | "medium" | "low" | "insufficient_data";

export type CollectionTrendMetric = {
  key: "netPnl" | "expectancy" | "totalCosts" | "costDragPct" | "averageRealizedR" | "winRate" | "profitFactor";
  label: string;
  direction: TrendDirection;
  confidence: TrendConfidence;
  firstValue?: number;
  latestValue?: number;
  firstHalfAverage?: number;
  secondHalfAverage?: number;
};

export type CollectionAnalytics = {
  reportCount: number;
  totalTradesAcrossReports: number;
  latestReport?: ReportSummary;
  bestReportByNetPnl?: ReportSummary;
  bestReportByExpectancy?: ReportSummary;
  worstReportByNetPnl?: ReportSummary;
  worstReportByExpectancy?: ReportSummary;
  averageWinRate?: number;
  averageExpectancy?: number;
  averageNetPnl?: number;
  averageCostDrag?: number;
  averageRealizedR?: number;
  trendDirection: TrendDirection;
  trendConfidence: TrendConfidence;
  healthScore: number;
  healthBand: string;
  primaryCollectionInsight: string;
  warningFlags: string[];
  trends: CollectionTrendMetric[];
  chartRows: Array<{
    iteration: string;
    reportName: string;
    netPnl: number;
    expectancy: number;
    totalCosts: number;
    costDragPct?: number;
    averageRealizedR?: number;
    winRate: number;
    profitFactor?: number;
  }>;
};

export function buildCollectionAnalytics(collection: ReportCollectionDetail): CollectionAnalytics {
  const reports = [...collection.reports];
  const reportCount = reports.length;
  const latestReport = reports[reportCount - 1];
  const trends = [
    buildTrend("netPnl", "Net PnL", reports, (report) => report.netPnl, false),
    buildTrend("expectancy", "Expectancy", reports, (report) => report.expectancy, false),
    buildTrend("totalCosts", "Total Costs", reports, (report) => report.totalCosts, true),
    buildTrend("costDragPct", "Cost Drag", reports, costDragPct, true),
    buildTrend("averageRealizedR", "Average R", reports, (report) => report.averageRealizedR, false),
    buildTrend("winRate", "Win Rate", reports, (report) => report.winRate, false),
    buildTrend("profitFactor", "Profit Factor", reports, (report) => report.profitFactor, false)
  ];

  const expectancyTrend = trendFor(trends, "expectancy");
  const netPnlTrend = trendFor(trends, "netPnl");
  const costDragTrend = trendFor(trends, "costDragPct");
  const averageRTrend = trendFor(trends, "averageRealizedR");

  const trendDirection = summarizeDirection([expectancyTrend, netPnlTrend, costDragTrend, averageRTrend]);
  const trendConfidence = summarizeConfidence([expectancyTrend, netPnlTrend, costDragTrend, averageRTrend], reportCount);
  const healthScore = calculateHealthScore({
    reportCount,
    latestReport,
    expectancyTrend,
    netPnlTrend,
    costDragTrend,
    averageRTrend
  });

  const warningFlags = buildWarnings(reports, trends);

  return {
    reportCount,
    totalTradesAcrossReports: sum(reports.map((report) => report.totalTrades)),
    latestReport,
    bestReportByNetPnl: maxBy(reports, (report) => report.netPnl),
    bestReportByExpectancy: maxBy(reports, (report) => report.expectancy),
    worstReportByNetPnl: minBy(reports, (report) => report.netPnl),
    worstReportByExpectancy: minBy(reports, (report) => report.expectancy),
    averageWinRate: average(reports.map((report) => report.winRate)),
    averageExpectancy: average(reports.map((report) => report.expectancy)),
    averageNetPnl: average(reports.map((report) => report.netPnl)),
    averageCostDrag: average(reports.map(costDragPct).filter(isNumber)),
    averageRealizedR: average(reports.map((report) => report.averageRealizedR).filter(isNumber)),
    trendDirection,
    trendConfidence,
    healthScore,
    healthBand: healthBand(healthScore),
    primaryCollectionInsight: buildPrimaryInsight(reportCount, expectancyTrend, netPnlTrend, costDragTrend, averageRTrend, latestReport),
    warningFlags,
    trends,
    chartRows: reports.map((report, index) => ({
      iteration: `#${index + 1}`,
      reportName: report.name,
      netPnl: report.netPnl,
      expectancy: report.expectancy,
      totalCosts: report.totalCosts,
      costDragPct: costDragPct(report),
      averageRealizedR: report.averageRealizedR,
      winRate: report.winRate,
      profitFactor: report.profitFactor
    }))
  };
}

export function costDragPct(report: ReportSummary): number | undefined {
  if (report.totalCosts === 0) return undefined;
  if (report.grossPnl <= 0) return undefined;
  return report.totalCosts / report.grossPnl;
}

function buildTrend(
  key: CollectionTrendMetric["key"],
  label: string,
  reports: ReportSummary[],
  read: (report: ReportSummary) => number | undefined,
  lowerIsBetter: boolean
): CollectionTrendMetric {
  const values = reports.map(read).filter(isNumber);
  if (values.length < 2) return { key, label, direction: "insufficient_data", confidence: "insufficient_data" };
  const firstValue = values[0];
  const latestValue = values[values.length - 1];
  const midpoint = Math.ceil(values.length / 2);
  const firstHalfAverage = average(values.slice(0, midpoint));
  const secondHalfAverage = average(values.slice(midpoint));
  if (!isNumber(firstHalfAverage) || !isNumber(secondHalfAverage)) {
    return { key, label, direction: "insufficient_data", confidence: "insufficient_data", firstValue, latestValue };
  }

  const firstToLatest = classifyChange(firstValue, latestValue, lowerIsBetter);
  const halfToHalf = classifyChange(firstHalfAverage, secondHalfAverage, lowerIsBetter);
  const direction = firstToLatest === halfToHalf ? firstToLatest : firstToLatest === "flat" ? halfToHalf : halfToHalf === "flat" ? firstToLatest : "mixed";
  const confidence: TrendConfidence = values.length >= 4 && direction !== "mixed" ? "high" : values.length >= 3 ? "medium" : "low";
  return { key, label, direction, confidence, firstValue, latestValue, firstHalfAverage, secondHalfAverage };
}

function classifyChange(first: number, latest: number, lowerIsBetter: boolean): TrendDirection {
  const tolerance = Math.max(Math.abs(first) * 0.03, 0.0001);
  if (Math.abs(latest - first) <= tolerance) return "flat";
  const improved = lowerIsBetter ? latest < first : latest > first;
  return improved ? "improving" : "degrading";
}

function summarizeDirection(trends: CollectionTrendMetric[]): TrendDirection {
  if (trends.every((trend) => trend.direction === "insufficient_data")) return "insufficient_data";
  const improving = trends.filter((trend) => trend.direction === "improving").length;
  const degrading = trends.filter((trend) => trend.direction === "degrading").length;
  if (improving >= 3 && degrading === 0) return "improving";
  if (degrading >= 2 && improving === 0) return "degrading";
  if (improving === 0 && degrading === 0) return "flat";
  return "mixed";
}

function summarizeConfidence(trends: CollectionTrendMetric[], reportCount: number): TrendConfidence {
  if (reportCount < 2) return "insufficient_data";
  const usable = trends.filter((trend) => trend.confidence !== "insufficient_data");
  if (usable.length < 2) return "low";
  if (reportCount >= 4 && usable.filter((trend) => trend.confidence === "high").length >= 2) return "high";
  if (reportCount >= 3) return "medium";
  return "low";
}

function calculateHealthScore(input: {
  reportCount: number;
  latestReport?: ReportSummary;
  expectancyTrend: CollectionTrendMetric;
  netPnlTrend: CollectionTrendMetric;
  costDragTrend: CollectionTrendMetric;
  averageRTrend: CollectionTrendMetric;
}) {
  let score = 50;
  if (input.expectancyTrend.direction === "improving") score += 15;
  if (input.netPnlTrend.direction === "improving") score += 15;
  if (input.costDragTrend.direction === "improving") score += 10;
  if (input.averageRTrend.direction === "improving") score += 10;
  if ((input.latestReport?.netPnl ?? 0) > 0) score += 10;
  if ((input.latestReport?.expectancy ?? 0) > 0) score += 10;
  if (input.reportCount >= 3) score += 10;
  if (input.expectancyTrend.direction === "degrading") score -= 15;
  if (input.netPnlTrend.direction === "degrading") score -= 15;
  if (input.costDragTrend.direction === "degrading") score -= 10;
  if ((input.latestReport?.netPnl ?? 0) < 0) score -= 10;
  if ((input.latestReport?.expectancy ?? 0) < 0) score -= 10;
  if (input.reportCount < 2) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function healthBand(score: number) {
  if (score >= 80) return "Strong Improvement";
  if (score >= 60) return "Constructive";
  if (score >= 40) return "Mixed / Needs Review";
  if (score >= 20) return "Deteriorating";
  return "Structurally Weak";
}

function buildPrimaryInsight(
  reportCount: number,
  expectancyTrend: CollectionTrendMetric,
  netPnlTrend: CollectionTrendMetric,
  costDragTrend: CollectionTrendMetric,
  averageRTrend: CollectionTrendMetric,
  latestReport?: ReportSummary
) {
  if (reportCount < 2) return "This collection has too few reports to determine a reliable strategy trend.";
  if (expectancyTrend.direction === "improving" && costDragTrend.direction === "improving") {
    return "This collection shows improving expectancy and lower cost drag across recent reports, suggesting the strategy iteration is becoming more efficient after costs.";
  }
  if (netPnlTrend.direction === "improving" && costDragTrend.direction === "degrading") {
    return "Net PnL improved, but cost drag increased, suggesting gains may be less efficient after execution costs.";
  }
  if (averageRTrend.direction === "improving" && (latestReport?.expectancy ?? 0) < 0) {
    return "The latest report improved R capture but still has negative expectancy.";
  }
  if (expectancyTrend.direction === "degrading" || netPnlTrend.direction === "degrading") {
    return "This collection shows deterioration in core performance metrics. Review the weakest reports and cost-heavy segments before extending this iteration.";
  }
  return "This collection shows mixed signals. Review expectancy, cost drag, and R capture together before treating the strategy iteration as improved.";
}

function buildWarnings(reports: ReportSummary[], trends: CollectionTrendMetric[]) {
  const warnings: string[] = [];
  if (reports.length < 2) warnings.push("At least two reports are needed for trend analysis.");
  if (reports.length < 3) warnings.push("Trend confidence is limited until the collection has three or more reports.");
  if (trendFor(trends, "costDragPct").direction === "degrading") warnings.push("Cost drag is increasing across this collection.");
  if ((reports[reports.length - 1]?.expectancy ?? 0) < 0) warnings.push("The latest report has negative expectancy.");
  return warnings;
}

function trendFor(trends: CollectionTrendMetric[], key: CollectionTrendMetric["key"]) {
  return trends.find((trend) => trend.key === key) as CollectionTrendMetric;
}

function maxBy(reports: ReportSummary[], read: (report: ReportSummary) => number) {
  return reports.reduce<ReportSummary | undefined>((best, report) => (!best || read(report) > read(best) ? report : best), undefined);
}

function minBy(reports: ReportSummary[], read: (report: ReportSummary) => number) {
  return reports.reduce<ReportSummary | undefined>((worst, report) => (!worst || read(report) < read(worst) ? report : worst), undefined);
}

function average(values: number[]) {
  const valid = values.filter(isNumber);
  if (valid.length === 0) return undefined;
  return sum(valid) / valid.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

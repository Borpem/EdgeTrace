import type { DiagnosticsResult, ReportCollectionDetail, ReportSummary } from "../types";
import { costDragPct } from "./collectionAnalytics";

export type RegressionSignal = {
  severity: "low" | "medium" | "high";
  title: string;
  explanation: string;
  recommendedAction: string;
  relatedReportIds?: string[];
  relatedSegment?: string;
};

export function detectStrategyRegressions(collection: ReportCollectionDetail): RegressionSignal[] {
  const reports = collection.reports;
  if (reports.length < 2) return [];
  const previous = reports[reports.length - 2];
  const latest = reports[reports.length - 1];
  const best = reports.reduce((winner, report) => (report.expectancy > winner.expectancy ? report : winner), reports[0]);
  const signals: RegressionSignal[] = [];

  if (latest.expectancy < previous.expectancy - Math.max(Math.abs(previous.expectancy) * 0.15, 0.05)) {
    signals.push({
      severity: latest.expectancy < 0 ? "high" : "medium",
      title: "Expectancy deterioration",
      explanation: `Latest expectancy fell from ${formatNumber(previous.expectancy)} to ${formatNumber(latest.expectancy)}.`,
      recommendedAction: "Compare the latest report against the previous iteration and inspect weak segments first.",
      relatedReportIds: [previous.id, latest.id]
    });
  }

  const previousCostDrag = costDragPct(previous);
  const latestCostDrag = costDragPct(latest);
  if (isNumber(previousCostDrag) && isNumber(latestCostDrag) && latestCostDrag > previousCostDrag + 0.08) {
    signals.push({
      severity: latestCostDrag > previousCostDrag + 0.18 ? "high" : "medium",
      title: "Cost drag increased",
      explanation: `Cost drag rose from ${formatPercent(previousCostDrag)} to ${formatPercent(latestCostDrag)}.`,
      recommendedAction: "Inspect cost-heavy symbols, order sizing, and execution quality before extending this iteration.",
      relatedReportIds: [previous.id, latest.id]
    });
  }

  if (
    isNumber(previous.averageRealizedR) &&
    isNumber(latest.averageRealizedR) &&
    latest.averageRealizedR < previous.averageRealizedR - 0.15
  ) {
    signals.push({
      severity: latest.averageRealizedR < 0 ? "high" : "medium",
      title: "R capture weakened",
      explanation: `Average realized R moved from ${formatNumber(previous.averageRealizedR)}R to ${formatNumber(latest.averageRealizedR)}R.`,
      recommendedAction: "Review losing trade size, stop discipline, and whether winners are being cut too early.",
      relatedReportIds: [previous.id, latest.id]
    });
  }

  if (Math.abs(latest.winRate - previous.winRate) < 0.04 && isNumber(previous.averageRealizedR) && isNumber(latest.averageRealizedR) && latest.averageRealizedR < previous.averageRealizedR - 0.12) {
    signals.push({
      severity: "medium",
      title: "Stable win rate, weaker payoff",
      explanation: "Win rate stayed similar while R capture weakened, suggesting payoff quality rather than hit rate is driving deterioration.",
      recommendedAction: "Inspect average win/loss balance and the largest losing trades in the latest report.",
      relatedReportIds: [previous.id, latest.id]
    });
  }

  const concentrationDelta = largeLossConcentration(latest, collection.fullReports) - largeLossConcentration(previous, collection.fullReports);
  if (concentrationDelta > 0.12) {
    signals.push({
      severity: concentrationDelta > 0.25 ? "high" : "medium",
      title: "Large-loss concentration worsened",
      explanation: "A larger share of losses is concentrated in the worst losing trade.",
      recommendedAction: "Review the largest losing trades and check whether one scenario is dominating downside.",
      relatedReportIds: [previous.id, latest.id]
    });
  }

  if (best.id !== latest.id && latest.expectancy < best.expectancy - Math.max(Math.abs(best.expectancy) * 0.2, 0.08)) {
    signals.push({
      severity: latest.netPnl < best.netPnl ? "high" : "medium",
      title: "Current iteration trails best report",
      explanation: `The latest report is materially below ${best.name} by expectancy.`,
      recommendedAction: "Compare the current report with the best historical report and identify what changed.",
      relatedReportIds: [best.id, latest.id]
    });
  }

  return signals.slice(0, 6);
}

function largeLossConcentration(report: ReportSummary, fullReports?: DiagnosticsResult[]) {
  const fullReport = fullReports?.find((item) => item.id === report.id);
  const losses = fullReport?.trades.map((trade) => trade.netPnl).filter((value) => value < 0).map(Math.abs) ?? [];
  if (!losses.length) return 0;
  return Math.max(...losses) / losses.reduce((total, value) => total + value, 0);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value: number) {
  return value.toFixed(2);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

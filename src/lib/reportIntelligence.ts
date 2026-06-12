import {
  buildBreakdown,
  findLargestLeak,
  type BreakdownDimension,
  type BreakdownRow
} from "./breakdowns";
import { classifyCostDrag, numericCostDrag } from "./costDrag";
import { normalizePortfolioMetrics } from "./diagnostics";
import type { DiagnosticsResult } from "../types";

export type MetricStatus = "healthy" | "warning" | "weak" | "neutral";

export type NextBestInspection = {
  title: string;
  reason: string;
  dimension: BreakdownDimension;
  group: string;
  metric: string;
};

export type ReportIntelligence = {
  strategyHealthScore: number;
  healthBand: "Healthy" | "Watchlist" | "Unstable" | "High Risk" | "Structurally Weak";
  primaryDiagnosis:
    | "Healthy"
    | "Watchlist"
    | "Cost Drag Problem"
    | "Negative Expectancy"
    | "Poor R Capture"
    | "Large Loss Problem"
    | "Insufficient Data";
  primaryExplanation: string;
  primaryLeak: {
    title: string;
    explanation: string;
    supportingMetric: string;
    recommendedInspection: string;
  };
  costDragLabel: string;
  nextBestInspections: NextBestInspection[];
  keyMetricStatuses: Record<"netPnl" | "expectancy" | "averageR" | "costDrag" | "profitFactor" | "winRate", MetricStatus>;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function buildReportIntelligence(report: DiagnosticsResult): ReportIntelligence {
  const trades = Array.isArray(report.trades) ? report.trades : [];
  const reportToAnalyze = { ...report, trades, metrics: normalizePortfolioMetrics(report.metrics, trades) };
  const costDrag = classifyCostDrag({
    grossPnl: reportToAnalyze.metrics.grossPnl,
    totalCosts: reportToAnalyze.metrics.totalCosts,
    totalTrades: reportToAnalyze.metrics.totalTrades
  });
  const costDragPct = numericCostDrag(costDrag);
  const largestLossRatio = largestLossToAverageLossRatio(reportToAnalyze);
  const allBreakdowns = buildAllBreakdowns(reportToAnalyze);
  const worstSegment = allBreakdowns
    .flatMap(({ dimension, rows }) => rows.map((row) => ({ dimension, row })))
    .sort((a, b) => a.row.netPnl - b.row.netPnl)[0];

  const strategyHealthScore = scoreReport(reportToAnalyze, costDragPct, largestLossRatio);
  const healthBand = scoreBand(strategyHealthScore);
  const primaryDiagnosis = diagnose(reportToAnalyze, costDragPct, largestLossRatio);
  const primaryLeak = buildPrimaryLeak(reportToAnalyze, costDrag, costDragPct, largestLossRatio, worstSegment);

  return {
    strategyHealthScore,
    healthBand,
    primaryDiagnosis,
    primaryExplanation: explanationForDiagnosis(primaryDiagnosis, reportToAnalyze, costDrag),
    primaryLeak,
    costDragLabel: costDrag.label,
    nextBestInspections: buildNextBestInspections(reportToAnalyze, allBreakdowns),
    keyMetricStatuses: {
      netPnl: reportToAnalyze.metrics.netPnl > 0 ? "healthy" : "weak",
      expectancy: reportToAnalyze.metrics.expectancy > 0 ? "healthy" : "weak",
      averageR:
        reportToAnalyze.metrics.averageRealizedR === undefined
          ? "neutral"
          : reportToAnalyze.metrics.averageRealizedR >= 0.5
            ? "healthy"
            : reportToAnalyze.metrics.averageRealizedR >= 0.2
              ? "warning"
              : "weak",
      costDrag:
        costDrag.type !== "percentage"
          ? costDrag.type === "pre_cost_unprofitable"
            ? "weak"
            : "neutral"
          : costDrag.value <= 0.2
            ? "healthy"
            : costDrag.value <= 0.4
              ? "warning"
              : "weak",
      profitFactor:
        reportToAnalyze.metrics.profitFactor >= 1.5
          ? "healthy"
          : reportToAnalyze.metrics.profitFactor >= 1
            ? "warning"
            : "weak",
      winRate:
        reportToAnalyze.metrics.winRate >= 0.5 ? "healthy" : reportToAnalyze.metrics.winRate >= 0.45 ? "warning" : "weak"
    }
  };
}

function scoreReport(report: DiagnosticsResult, costDragPct: number | undefined, largestLossRatio: number) {
  let score = 100;
  if (report.metrics.netPnl < 0) score -= 30;
  if (report.metrics.expectancy < 0) score -= 25;
  if (report.metrics.grossPnl > 0 && report.metrics.netPnl < 0) score -= 20;
  if (costDragPct !== undefined && costDragPct > 0.4) score -= 15;
  if ((report.metrics.averageRealizedR ?? 1) < 0.2) score -= 15;
  if (report.metrics.profitFactor < 1) score -= 15;
  if (report.metrics.winRate < 0.45) score -= 10;
  if (largestLossRatio > 3) score -= 10;
  if (report.metrics.totalTrades < 20) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function scoreBand(score: number): ReportIntelligence["healthBand"] {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Watchlist";
  if (score >= 40) return "Unstable";
  if (score >= 20) return "High Risk";
  return "Structurally Weak";
}

function diagnose(
  report: DiagnosticsResult,
  costDragPct: number | undefined,
  largestLossRatio: number
): ReportIntelligence["primaryDiagnosis"] {
  if (report.metrics.totalTrades < 5) return "Insufficient Data";
  if (report.metrics.grossPnl > 0 && report.metrics.netPnl < 0) return "Cost Drag Problem";
  if (report.metrics.netPnl < 0 && report.metrics.expectancy < 0) return "Negative Expectancy";
  if ((report.metrics.averageRealizedR ?? 1) < 0.2) return "Poor R Capture";
  if (largestLossRatio > 3) return "Large Loss Problem";
  if (costDragPct !== undefined && costDragPct > 0.4) return "Cost Drag Problem";
  if (report.metrics.netPnl > 0 && report.metrics.expectancy > 0 && report.metrics.profitFactor >= 1) return "Healthy";
  return "Watchlist";
}

function explanationForDiagnosis(
  diagnosis: ReportIntelligence["primaryDiagnosis"],
  report: DiagnosticsResult,
  costDrag: ReturnType<typeof classifyCostDrag>
) {
  if (diagnosis === "Cost Drag Problem") {
    return `EdgeTrace classifies this report as Cost Drag Problem. Gross performance is ${currency.format(report.metrics.grossPnl)}, but execution costs are materially reducing realized profitability.`;
  }
  if (diagnosis === "Negative Expectancy") {
    return "EdgeTrace classifies this report as Negative Expectancy. The average trade is losing money after costs.";
  }
  if (diagnosis === "Poor R Capture") {
    return "EdgeTrace classifies this report as Poor R Capture. The strategy is not capturing enough reward relative to planned risk.";
  }
  if (diagnosis === "Large Loss Problem") {
    return "EdgeTrace classifies this report as Loss Concentration. One or two losses are disproportionately damaging performance.";
  }
  if (diagnosis === "Insufficient Data") {
    return "EdgeTrace classifies this report as Insufficient Data. More trades are needed before segment-level conclusions are reliable.";
  }
  if (diagnosis === "Healthy") {
    return `EdgeTrace classifies this report as Healthy. Net performance, expectancy, and profit factor are positive, with cost drag currently classified as ${costDrag.label}.`;
  }
  return "EdgeTrace classifies this report as Watchlist. The report is not structurally broken, but at least one key diagnostic metric needs inspection.";
}

function buildPrimaryLeak(
  report: DiagnosticsResult,
  costDrag: ReturnType<typeof classifyCostDrag>,
  costDragPct: number | undefined,
  largestLossRatio: number,
  worstSegment: { dimension: BreakdownDimension; row: BreakdownRow } | undefined
): ReportIntelligence["primaryLeak"] {
  if (report.metrics.grossPnl > 0 && report.metrics.netPnl < 0) {
    return {
      title: "Primary Leak: Cost Drag",
      explanation: `Gross PnL is positive, but costs consume ${costDrag.label} of gross gains. Inspect high-cost symbols and time buckets first.`,
      supportingMetric: `Costs: ${currency.format(report.metrics.totalCosts)}`,
      recommendedInspection: "Start with highest cost-drag segments."
    };
  }
  if (report.metrics.netPnl < 0 && report.metrics.expectancy < 0) {
    return {
      title: "Primary Leak: Negative Expectancy",
      explanation: "The average trade is losing money after costs, so the strategy needs edge-level review before execution refinements.",
      supportingMetric: `Expectancy: ${currency.format(report.metrics.expectancy)}`,
      recommendedInspection: "Inspect the weakest symbol and time bucket."
    };
  }
  if ((report.metrics.averageRealizedR ?? 1) < 0.2) {
    return {
      title: "Primary Leak: Poor R Capture",
      explanation: "Average realized R is very low, indicating weak reward capture relative to planned risk.",
      supportingMetric: `Average R: ${number.format(report.metrics.averageRealizedR ?? 0)}`,
      recommendedInspection: "Inspect symbols with low realized R."
    };
  }
  if (largestLossRatio > 3) {
    return {
      title: "Primary Leak: Large Loss Concentration",
      explanation: "One or two losses are large enough to materially distort report performance.",
      supportingMetric: `Largest loss / avg loss: ${number.format(largestLossRatio)}x`,
      recommendedInspection: "Inspect largest-loss symbols and time buckets."
    };
  }
  if (worstSegment && worstSegment.row.netPnl < 0) {
    return {
      title: "Primary Leak: Segment Concentration",
      explanation: `${worstSegment.row.group} is the weakest segment and accounts for a disproportionate share of losses.`,
      supportingMetric: `Segment net PnL: ${currency.format(worstSegment.row.netPnl)}`,
      recommendedInspection: `Inspect ${worstSegment.row.group}.`
    };
  }
  return {
    title: "Primary Leak: No Dominant Leak Detected",
    explanation: "No single cost, expectancy, R-capture, loss, or segment issue dominates this report.",
    supportingMetric: `Cost drag: ${costDrag.label}`,
    recommendedInspection: "Review breakdowns for smaller recurring inefficiencies."
  };
}

function buildNextBestInspections(
  report: DiagnosticsResult,
  allBreakdowns: Array<{ dimension: BreakdownDimension; rows: BreakdownRow[] }>
) {
  const candidates: NextBestInspection[] = [];

  allBreakdowns.forEach(({ dimension, rows }) => {
    const worst = findLargestLeak(rows);
    if (worst) {
      candidates.push({
        title: `Inspect ${worst.group}`,
        reason: `${dimensionLabel(dimension)} with weakest net PnL`,
        dimension,
        group: worst.group,
        metric: currency.format(worst.netPnl)
      });
    }

    const highestCost = [...rows]
      .filter((row) => row.costDrag.type === "percentage")
      .sort((a, b) => (b.costDragPct ?? 0) - (a.costDragPct ?? 0))[0];
    if (highestCost) {
      candidates.push({
        title: `Inspect ${highestCost.group}`,
        reason: `${dimensionLabel(dimension)} with highest cost drag`,
        dimension,
        group: highestCost.group,
        metric: highestCost.costDrag.label
      });
    }
  });

  return candidates
    .filter((candidate, index, list) => list.findIndex((item) => item.dimension === candidate.dimension && item.group === candidate.group) === index)
    .slice(0, report.metrics.totalTrades < 5 ? 1 : 3);
}

function buildAllBreakdowns(report: DiagnosticsResult) {
  const dimensions: BreakdownDimension[] = ["symbol", "strategy", "timeOfDay"];
  return dimensions.map((dimension) => ({ dimension, rows: buildBreakdown(report.trades, dimension) }));
}

function largestLossToAverageLossRatio(report: DiagnosticsResult) {
  const losses = report.trades.map((trade) => trade.netPnl).filter((value) => value < 0);
  if (!losses.length) return 0;
  const largestLoss = Math.abs(Math.min(...losses));
  const averageLoss = Math.abs(losses.reduce((total, value) => total + value, 0) / losses.length);
  return averageLoss > 0 ? largestLoss / averageLoss : 0;
}

function dimensionLabel(dimension: BreakdownDimension) {
  if (dimension === "timeOfDay") return "time bucket";
  return dimension;
}

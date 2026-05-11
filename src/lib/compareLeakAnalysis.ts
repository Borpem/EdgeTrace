import {
  buildBreakdown,
  groupForDimension,
  type BreakdownDimension,
  type BreakdownRow
} from "./breakdowns";
import { numericCostDrag } from "./costDrag";
import type { DiagnosticsResult, NormalizedTrade } from "../types";

export type CompareLeakInsight = {
  id: string;
  title: string;
  message: string;
  severity: "critical" | "warning" | "info";
};

export function segmentTrades(
  report: DiagnosticsResult,
  dimension: BreakdownDimension,
  group: string
) {
  return report.trades.filter((trade) => groupForDimension(trade, dimension) === group);
}

export function segmentSummary(
  trades: NormalizedTrade[],
  dimension: BreakdownDimension
): BreakdownRow | undefined {
  return buildBreakdown(trades, dimension)[0];
}

export function tradeLevelDeltas(tradesA: NormalizedTrade[], tradesB: NormalizedTrade[]) {
  const winnersA = tradesA.filter((trade) => trade.netPnl > 0).length;
  const winnersB = tradesB.filter((trade) => trade.netPnl > 0).length;
  const losersA = tradesA.filter((trade) => trade.netPnl < 0).length;
  const losersB = tradesB.filter((trade) => trade.netPnl < 0).length;
  const avgNetA = average(tradesA.map((trade) => trade.netPnl));
  const avgNetB = average(tradesB.map((trade) => trade.netPnl));
  const avgCostA = average(tradesA.map((trade) => trade.estimatedCosts));
  const avgCostB = average(tradesB.map((trade) => trade.estimatedCosts));

  return {
    additionalWinners: winnersB - winnersA,
    additionalLosers: losersB - losersA,
    averageTradeImprovement: avgNetB - avgNetA,
    averageCostChange: avgCostB - avgCostA
  };
}

export function compareSegmentLeaks(
  summaryA: BreakdownRow | undefined,
  summaryB: BreakdownRow | undefined,
  tradesA: NormalizedTrade[],
  tradesB: NormalizedTrade[]
) {
  const insights: CompareLeakInsight[] = [];
  if (!summaryA || !summaryB) {
    return [
      {
        id: "segment-presence",
        title: "Segment Availability Shift",
        severity: "info",
        message: "This segment appears in only one selected report, so attribution should be treated as directional."
      }
    ] satisfies CompareLeakInsight[];
  }

  const costA = numericCostDrag(summaryA.costDrag);
  const costB = numericCostDrag(summaryB.costDrag);
  const expectancyDelta = summaryB.expectancy - summaryA.expectancy;
  const rDelta = (summaryB.averageRealizedR ?? 0) - (summaryA.averageRealizedR ?? 0);
  const netToGrossDelta = (summaryB.netToGrossPct ?? 0) - (summaryA.netToGrossPct ?? 0);

  if (costA !== undefined && costB !== undefined && costB < costA - 0.05) {
    insights.push({
      id: "cost-improvement",
      title: "Cost Improvement",
      severity: "info",
      message: "Report B reduced execution cost drag materially relative to Report A."
    });
  }

  if (expectancyDelta > 1 && rDelta > 0.1) {
    insights.push({
      id: "expectancy-r-improvement",
      title: "Expectancy Improvement",
      severity: "info",
      message: "Report B improved expectancy primarily through stronger average R capture."
    });
  }

  if (summaryB.winRate <= summaryA.winRate + 0.02 && expectancyDelta < -1) {
    insights.push({
      id: "win-rate-deterioration",
      title: "Win Rate Deterioration",
      severity: "warning",
      message: "Report B has lower expectancy despite similar win rate, suggesting weaker reward/risk efficiency."
    });
  }

  if (lossConcentration(summaryB) < lossConcentration(summaryA) - 0.15) {
    insights.push({
      id: "loss-concentration-improvement",
      title: "Loss Concentration Improvement",
      severity: "info",
      message: "Large-loss concentration declined in Report B."
    });
  }

  if (summaryB.netPnl < summaryA.netPnl && netToGrossDelta < -0.1) {
    insights.push({
      id: "segment-degradation",
      title: "Segment Degradation",
      severity: "warning",
      message: "This segment deteriorated primarily due to weaker net-to-gross conversion."
    });
  }

  if (highCostLosingTrades(tradesB) < highCostLosingTrades(tradesA)) {
    insights.push({
      id: "trade-quality-shift",
      title: "Trade Quality Shift",
      severity: "info",
      message: "Report B contains fewer high-cost losing trades in this segment."
    });
  }

  if (summaryB.costDrag.type === "pre_cost_unprofitable") {
    insights.push({
      id: "pre-cost-unprofitable",
      title: "Pre-Cost Structural Weakness",
      severity: "critical",
      message: "Report B is pre-cost unprofitable in this segment, so execution costs are not the primary issue."
    });
  }

  if (!insights.length) {
    insights.push({
      id: "no-dominant-driver",
      title: "No Dominant Attribution Driver",
      severity: "info",
      message: "The selected segment changed, but no single cost, R, win-rate, or conversion driver dominates the attribution."
    });
  }

  return insights;
}

export function improvementAttribution(
  summaryA: BreakdownRow | undefined,
  summaryB: BreakdownRow | undefined,
  tradesA: NormalizedTrade[],
  tradesB: NormalizedTrade[]
) {
  if (!summaryA || !summaryB) return ["Segment availability changed between reports."];
  const changes: string[] = [];
  const avgWinDelta = summaryB.averageWin - summaryA.averageWin;
  const avgCostDelta = average(tradesB.map((trade) => trade.estimatedCosts)) - average(tradesA.map((trade) => trade.estimatedCosts));
  const rDelta = (summaryB.averageRealizedR ?? 0) - (summaryA.averageRealizedR ?? 0);
  const netToGrossDelta = (summaryB.netToGrossPct ?? 0) - (summaryA.netToGrossPct ?? 0);

  if (avgWinDelta > 1) changes.push("Improved average winner size.");
  if (avgCostDelta < -0.5) changes.push("Lower average execution costs.");
  if (lossConcentration(summaryB) < lossConcentration(summaryA) - 0.15) changes.push("Fewer outsized losses.");
  if (rDelta > 0.1) changes.push("Improved R capture.");
  if (summaryB.totalTrades < summaryA.totalTrades) changes.push("Lower trade frequency.");
  if (netToGrossDelta > 0.05) changes.push("Improved conversion efficiency.");
  if (summaryB.netPnl < summaryA.netPnl && avgCostDelta > 0.5) changes.push("Higher costs contributed to deterioration.");

  return changes.length ? changes : ["No single measured driver explains most of the change."];
}

export function compareCharts(tradesA: NormalizedTrade[], tradesB: NormalizedTrade[]) {
  return {
    netPnl: [
      { report: "Report A", netPnl: sum(tradesA.map((trade) => trade.netPnl)) },
      { report: "Report B", netPnl: sum(tradesB.map((trade) => trade.netPnl)) }
    ],
    costDrag: [
      { report: "Report A", costDrag: tradeCostDragPct(tradesA) * 100 },
      { report: "Report B", costDrag: tradeCostDragPct(tradesB) * 100 }
    ],
    rDistribution: mergeRDistributions(tradesA, tradesB),
    equity: buildEquityOverlay(tradesA, tradesB)
  };
}

function highCostLosingTrades(trades: NormalizedTrade[]) {
  return trades.filter((trade) => trade.netPnl < 0 && trade.estimatedCosts > Math.abs(trade.netPnl) * 0.2).length;
}

function lossConcentration(summary: BreakdownRow) {
  if (summary.averageLoss === 0 || summary.netPnl >= 0) return 0;
  return Math.abs(summary.averageLoss) / Math.max(Math.abs(summary.netPnl), 1);
}

function tradeCostDragPct(trades: NormalizedTrade[]) {
  const grossPnl = sum(trades.map((trade) => trade.grossPnl));
  const costs = sum(trades.map((trade) => trade.estimatedCosts));
  return grossPnl > 0 ? costs / grossPnl : 0;
}

function mergeRDistributions(tradesA: NormalizedTrade[], tradesB: NormalizedTrade[]) {
  const buckets = ["< -1R", "-1R to 0", "0 to 0.5R", "0.5R to 1R", "> 1R", "N/A"];
  return buckets.map((bucket) => ({
    bucket,
    "Report A": tradesA.filter((trade) => rBucket(trade.realizedR) === bucket).length,
    "Report B": tradesB.filter((trade) => rBucket(trade.realizedR) === bucket).length
  }));
}

function buildEquityOverlay(tradesA: NormalizedTrade[], tradesB: NormalizedTrade[]) {
  const length = Math.max(tradesA.length, tradesB.length);
  let equityA = 0;
  let equityB = 0;
  return Array.from({ length }, (_, index) => {
    equityA += tradesA[index]?.netPnl ?? 0;
    equityB += tradesB[index]?.netPnl ?? 0;
    return { trade: index + 1, "Report A": equityA, "Report B": equityB };
  });
}

function rBucket(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  if (value < -1) return "< -1R";
  if (value < 0) return "-1R to 0";
  if (value < 0.5) return "0 to 0.5R";
  if (value < 1) return "0.5R to 1R";
  return "> 1R";
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

import {
  buildBreakdown,
  groupForDimension,
  timeOfDayBucket,
  type BreakdownDimension,
  type BreakdownRow
} from "./breakdowns";
import type { DiagnosticsResult, NormalizedTrade } from "../types";

export type LeakInsight = {
  id: string;
  title: string;
  message: string;
  severity: "critical" | "warning" | "info";
};

export type PatternInsight = {
  label: string;
  value: string;
};

export function getSegmentTrades(
  trades: NormalizedTrade[],
  dimension: BreakdownDimension,
  group: string
) {
  return trades.filter((trade) => groupForDimension(trade, dimension) === group);
}

export function getSegmentSummary(
  trades: NormalizedTrade[],
  dimension: BreakdownDimension,
  group: string
) {
  return buildBreakdown(getSegmentTrades(trades, dimension, group), dimension)[0];
}

export function analyzeSegmentLeaks(
  report: DiagnosticsResult,
  dimension: BreakdownDimension,
  group: string,
  summary: BreakdownRow,
  segmentTrades: NormalizedTrade[]
) {
  const insights: LeakInsight[] = [];
  const reportRows = buildBreakdown(report.trades, dimension);
  const otherRows = reportRows.filter((row) => row.group !== group);
  const restNetPnl = otherRows.reduce((total, row) => total + row.netPnl, 0);
  const largestLosses = [...segmentTrades].sort((a, b) => a.netPnl - b.netPnl).slice(0, 2);
  const lossDamage = Math.abs(
    largestLosses.filter((trade) => trade.netPnl < 0).reduce((total, trade) => total + trade.netPnl, 0)
  );
  const totalAbsLoss = Math.abs(
    segmentTrades.filter((trade) => trade.netPnl < 0).reduce((total, trade) => total + trade.netPnl, 0)
  );

  if (summary.costDrag.type === "pre_cost_unprofitable") {
    insights.push({
      id: "pre-cost-unprofitable",
      title: "Structurally Unprofitable",
      severity: "critical",
      message: "This segment appears structurally unprofitable even before execution friction."
    });
  }

  if (summary.costDrag.type === "percentage" && summary.costDrag.value > 0.25) {
    insights.push({
      id: "cost-drag",
      title: "Cost Drag Leak",
      severity: "warning",
      message: "Execution costs are consuming a large percentage of this segment's edge."
    });
  }

  if (summary.averageRealizedR !== undefined && summary.averageRealizedR < 0.25) {
    insights.push({
      id: "low-r-capture",
      title: "Low R Capture",
      severity: "warning",
      message: "This segment is not capturing sufficient reward relative to planned risk."
    });
  }

  if (totalAbsLoss > 0 && lossDamage / totalAbsLoss >= 0.6 && largestLosses.length > 0) {
    insights.push({
      id: "loss-concentration",
      title: "Large Loss Concentration",
      severity: "critical",
      message: "A small number of outsized losses are materially damaging this segment."
    });
  }

  if (summary.grossPnl > 0 && summary.netPnl <= summary.grossPnl * 0.5) {
    insights.push({
      id: "low-net-conversion",
      title: "Low Net Conversion",
      severity: "warning",
      message: "This segment generates gains before costs but converts poorly into realized profitability."
    });
  }

  if (summary.winRate >= 0.65 && summary.expectancy < 5) {
    insights.push({
      id: "win-rate-dependency",
      title: "Win Rate Dependency",
      severity: "info",
      message: "This segment appears dependent on maintaining a very high win rate."
    });
  }

  if (dimension === "timeOfDay" && summary.netPnl < 0 && summary.netPnl < restNetPnl) {
    insights.push({
      id: "time-bucket-weakness",
      title: "Time Bucket Weakness",
      severity: "warning",
      message: "This time bucket underperforms relative to the rest of the report."
    });
  }

  if (!insights.length) {
    insights.push({
      id: "no-major-leak",
      title: "No Dominant Leak Detected",
      severity: "info",
      message: "This segment does not show a single dominant leak across costs, R capture, or loss concentration."
    });
  }

  return insights;
}

export function detectSegmentPatterns(segmentTrades: NormalizedTrade[]) {
  const largestWinner = [...segmentTrades].sort((a, b) => b.netPnl - a.netPnl)[0];
  const largestLoser = [...segmentTrades].sort((a, b) => a.netPnl - b.netPnl)[0];
  const bucketRows = buildBreakdown(segmentTrades, "timeOfDay");
  const bestBucket = [...bucketRows].sort((a, b) => b.netPnl - a.netPnl)[0];
  const worstBucket = [...bucketRows].sort((a, b) => a.netPnl - b.netPnl)[0];

  return [
    { label: "Most Common Symbol", value: mostCommon(segmentTrades.map((trade) => trade.symbol)) },
    { label: "Most Common Strategy", value: mostCommon(segmentTrades.map((trade) => trade.strategy || "Unspecified")) },
    { label: "Average Hold Duration", value: averageHoldDuration(segmentTrades) },
    { label: "Largest Winner", value: largestWinner ? `${largestWinner.symbol} ${formatSigned(largestWinner.netPnl)}` : "N/A" },
    { label: "Largest Loser", value: largestLoser ? `${largestLoser.symbol} ${formatSigned(largestLoser.netPnl)}` : "N/A" },
    { label: "Best Time Bucket", value: bestBucket ? `${bestBucket.group} ${formatSigned(bestBucket.netPnl)}` : "N/A" },
    { label: "Worst Time Bucket", value: worstBucket ? `${worstBucket.group} ${formatSigned(worstBucket.netPnl)}` : "N/A" }
  ] satisfies PatternInsight[];
}

export function buildSegmentCharts(segmentTrades: NormalizedTrade[]) {
  let equity = 0;
  const equityCurve = segmentTrades.map((trade, index) => {
    equity += trade.netPnl;
    return { trade: index + 1, equity };
  });

  const rDistribution = new Map<string, number>();
  segmentTrades.forEach((trade) => {
    const bucket = rBucket(trade.realizedR);
    rDistribution.set(bucket, (rDistribution.get(bucket) ?? 0) + 1);
  });

  const costDrag = segmentTrades.map((trade, index) => ({
    trade: index + 1,
    costs: trade.estimatedCosts,
    grossPnl: trade.grossPnl,
    costDragPct: trade.grossPnl > 0 ? (trade.estimatedCosts / trade.grossPnl) * 100 : 0
  }));

  return {
    equityCurve,
    rDistribution: [...rDistribution.entries()].map(([bucket, count]) => ({ bucket, count })),
    costDrag
  };
}

function mostCommon(values: string[]) {
  if (!values.length) return "N/A";
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function averageHoldDuration(trades: NormalizedTrade[]) {
  const durations = trades
    .map((trade) => {
      if (!trade.exitTime) return undefined;
      const entry = new Date(trade.entryTime).getTime();
      const exit = new Date(trade.exitTime).getTime();
      if (Number.isNaN(entry) || Number.isNaN(exit) || exit < entry) return undefined;
      return (exit - entry) / 60000;
    })
    .filter((value): value is number => value !== undefined);

  if (!durations.length) return "N/A";
  const average = durations.reduce((total, value) => total + value, 0) / durations.length;
  return `${average.toFixed(0)} min`;
}

function rBucket(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  if (value < -1) return "< -1R";
  if (value < 0) return "-1R to 0";
  if (value < 0.5) return "0 to 0.5R";
  if (value < 1) return "0.5R to 1R";
  return "> 1R";
}

function formatSigned(value: number) {
  return `${value >= 0 ? "+" : ""}$${value.toFixed(2)}`;
}

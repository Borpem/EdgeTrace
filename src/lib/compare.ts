import type { DiagnosticsResult } from "../types";
import { classifyCostDrag, numericCostDrag } from "./costDrag";

export type MetricDirection = "higher" | "lower" | "neutral";
export type ComparisonStatus = "Improved" | "Degraded" | "Flat" | "Insufficient data";

export type ComparisonMetric = {
  key: string;
  label: string;
  valueA?: number;
  valueB?: number;
  labelA?: string;
  labelB?: string;
  delta?: number;
  deltaPct?: number;
  status: ComparisonStatus;
  direction: MetricDirection;
  format: "currency" | "number" | "percent";
};

export const costDragPct = (report: DiagnosticsResult) =>
  numericCostDrag(
    classifyCostDrag({
      grossPnl: report.metrics.grossPnl,
      totalCosts: report.metrics.totalCosts,
      totalTrades: report.metrics.totalTrades
    })
  );

export const netToGrossPct = (report: DiagnosticsResult) =>
  report.metrics.grossPnl !== 0 ? report.metrics.netPnl / report.metrics.grossPnl : undefined;

const averageLossMagnitude = (report: DiagnosticsResult) =>
  report.metrics.averageLoss < 0 ? Math.abs(report.metrics.averageLoss) : undefined;

const finiteValue = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value) ? undefined : value;

function statusFor(valueA: number | undefined, valueB: number | undefined, direction: MetricDirection) {
  if (valueA === undefined || valueB === undefined) return "Insufficient data";
  const delta = valueB - valueA;
  const tolerance = Math.max(Math.abs(valueA), Math.abs(valueB), 1) * 0.005;
  if (Math.abs(delta) <= tolerance || direction === "neutral") return "Flat";
  if (direction === "higher") return delta > 0 ? "Improved" : "Degraded";
  return delta < 0 ? "Improved" : "Degraded";
}

function buildMetric(
  key: string,
  label: string,
  valueA: number | undefined,
  valueB: number | undefined,
  direction: MetricDirection,
  format: ComparisonMetric["format"]
): ComparisonMetric {
  const safeA = finiteValue(valueA);
  const safeB = finiteValue(valueB);
  const delta = safeA === undefined || safeB === undefined ? undefined : safeB - safeA;
  const deltaPct =
    delta === undefined || safeA === undefined || safeA === 0 ? undefined : delta / Math.abs(safeA);

  return {
    key,
    label,
    valueA: safeA,
    valueB: safeB,
    delta,
    deltaPct,
    status: statusFor(safeA, safeB, direction),
    direction,
    format
  };
}

function buildCostDragMetric(reportA: DiagnosticsResult, reportB: DiagnosticsResult): ComparisonMetric {
  const stateA = classifyCostDrag({
    grossPnl: reportA.metrics.grossPnl,
    totalCosts: reportA.metrics.totalCosts,
    totalTrades: reportA.metrics.totalTrades
  });
  const stateB = classifyCostDrag({
    grossPnl: reportB.metrics.grossPnl,
    totalCosts: reportB.metrics.totalCosts,
    totalTrades: reportB.metrics.totalTrades
  });
  return {
    ...buildMetric("costDragPct", "Cost Drag %", numericCostDrag(stateA), numericCostDrag(stateB), "lower", "percent"),
    labelA: stateA.label,
    labelB: stateB.label
  };
}

export function buildComparisonMetrics(reportA: DiagnosticsResult, reportB: DiagnosticsResult) {
  return [
    buildMetric(
      "totalTrades",
      "Total Trades",
      reportA.metrics.totalTrades,
      reportB.metrics.totalTrades,
      "neutral",
      "number"
    ),
    buildMetric("winRate", "Win Rate", reportA.metrics.winRate, reportB.metrics.winRate, "higher", "percent"),
    buildMetric("grossPnl", "Gross PnL", reportA.metrics.grossPnl, reportB.metrics.grossPnl, "higher", "currency"),
    buildMetric("totalCosts", "Total Costs", reportA.metrics.totalCosts, reportB.metrics.totalCosts, "lower", "currency"),
    buildMetric("netPnl", "Net PnL", reportA.metrics.netPnl, reportB.metrics.netPnl, "higher", "currency"),
    buildMetric(
      "expectancy",
      "Expectancy",
      reportA.metrics.expectancy,
      reportB.metrics.expectancy,
      "higher",
      "currency"
    ),
    buildMetric(
      "averageRealizedR",
      "Average Realized R",
      reportA.metrics.averageRealizedR,
      reportB.metrics.averageRealizedR,
      "higher",
      "number"
    ),
    buildMetric(
      "profitFactor",
      "Profit Factor",
      reportA.metrics.profitFactor,
      reportB.metrics.profitFactor,
      "higher",
      "number"
    ),
    buildCostDragMetric(reportA, reportB),
    buildMetric(
      "netToGrossPct",
      "Net-to-Gross Conversion",
      netToGrossPct(reportA),
      netToGrossPct(reportB),
      "higher",
      "percent"
    ),
    buildMetric(
      "averageLossMagnitude",
      "Average Loss Magnitude",
      averageLossMagnitude(reportA),
      averageLossMagnitude(reportB),
      "lower",
      "currency"
    )
  ];
}

export function buildInterpretation(metrics: ComparisonMetric[]) {
  const byKey = new Map(metrics.map((metric) => [metric.key, metric]));
  const expectancy = byKey.get("expectancy");
  const costDrag = byKey.get("costDragPct");
  const grossPnl = byKey.get("grossPnl");
  const netToGross = byKey.get("netToGrossPct");
  const winRate = byKey.get("winRate");
  const realizedR = byKey.get("averageRealizedR");

  if (expectancy?.status === "Improved" && costDrag?.status === "Improved") {
    return "Report B shows improved expectancy and lower cost drag, suggesting the strategy iteration improved after-cost performance.";
  }

  if (grossPnl?.status === "Improved" && netToGross?.status === "Degraded") {
    return "Report B has higher gross PnL but weaker net-to-gross conversion, suggesting execution costs are eroding more of the edge.";
  }

  if (winRate?.status === "Degraded" && expectancy?.status === "Improved") {
    return "Report B shows lower win rate but stronger expectancy, suggesting better reward/risk capture.";
  }

  if (realizedR?.status === "Improved" && expectancy?.status === "Improved") {
    return "Report B shows stronger R behavior and expectancy, suggesting better reward capture across the selected trade set.";
  }

  if (expectancy?.status === "Degraded" || netToGross?.status === "Degraded") {
    return "Report B shows weaker after-cost performance on one or more core health metrics. Review execution costs, loss size, and reward capture before treating the iteration as improved.";
  }

  return "The selected reports are broadly similar across the core diagnostics. The available data does not show a dominant improvement or regression.";
}

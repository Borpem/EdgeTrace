import type { BreakdownDimension } from "./breakdowns";
import { buildBreakdown } from "./breakdowns";
import { costDragPct } from "./collectionAnalytics";
import type { DiagnosticsResult, ReportCollectionDetail, ReportSummary } from "../types";

export type ChangeClassification = "improved" | "degraded" | "mixed" | "flat" | "insufficient_data";
export type ChangeDriver =
  | "trade_selection"
  | "cost_reduction"
  | "cost_increase"
  | "r_capture_improvement"
  | "r_capture_deterioration"
  | "win_rate_change"
  | "large_loss_reduction"
  | "large_loss_increase"
  | "segment_mix_shift"
  | "insufficient_data";
export type ChangeConfidence = "high" | "medium" | "low" | "insufficient_data";

export type IterationChangeSummary = {
  previousReportId: string;
  currentReportId: string;
  previousReportName: string;
  currentReportName: string;
  iteration: number;
  netPnlDelta: number;
  expectancyDelta: number;
  costDelta: number;
  costDragDelta?: number;
  averageRDelta?: number;
  winRateDelta: number;
  profitFactorDelta?: number;
  largeLossConcentrationDelta?: number;
  tradeCountDelta: number;
  primaryChangeDriver: ChangeDriver;
  secondaryChangeDrivers: ChangeDriver[];
  changeClassification: ChangeClassification;
  confidence: ChangeConfidence;
  explanation: string;
  recommendedAction: string;
  segmentShift?: {
    dimension: BreakdownDimension;
    group: string;
    netPnlDelta: number;
    expectancyDelta?: number;
  };
};

export function buildIterationChangeAttribution(collection: ReportCollectionDetail): IterationChangeSummary[] {
  const fullById = new Map((collection.fullReports ?? []).map((report) => [report.id, report]));
  return collection.reports.slice(1).map((current, index) => {
    const previous = collection.reports[index];
    return compareIterations(previous, current, fullById.get(previous.id), fullById.get(current.id), index + 2);
  });
}

function compareIterations(
  previous: ReportSummary,
  current: ReportSummary,
  previousFull: DiagnosticsResult | undefined,
  currentFull: DiagnosticsResult | undefined,
  iteration: number
): IterationChangeSummary {
  const netPnlDelta = current.netPnl - previous.netPnl;
  const expectancyDelta = current.expectancy - previous.expectancy;
  const costDelta = current.totalCosts - previous.totalCosts;
  const previousCostDrag = costDragPct(previous);
  const currentCostDrag = costDragPct(current);
  const costDragDelta =
    previousCostDrag === undefined || currentCostDrag === undefined ? undefined : currentCostDrag - previousCostDrag;
  const averageRDelta =
    previous.averageRealizedR === undefined || current.averageRealizedR === undefined
      ? undefined
      : current.averageRealizedR - previous.averageRealizedR;
  const profitFactorDelta =
    previous.profitFactor === undefined || current.profitFactor === undefined
      ? undefined
      : current.profitFactor - previous.profitFactor;
  const largeLossConcentrationDelta =
    previousFull && currentFull
      ? largestLossConcentration(currentFull) - largestLossConcentration(previousFull)
      : undefined;
  const segmentShift = previousFull && currentFull ? findLargestSegmentShift(previousFull, currentFull) : undefined;
  const primaryChangeDriver = selectPrimaryDriver({
    netPnlDelta,
    expectancyDelta,
    costDragDelta,
    averageRDelta,
    winRateDelta: current.winRate - previous.winRate,
    largeLossConcentrationDelta,
    tradeCountDelta: current.totalTrades - previous.totalTrades,
    segmentShift,
    hasFullData: Boolean(previousFull && currentFull)
  });
  const secondaryChangeDrivers = selectSecondaryDrivers(primaryChangeDriver, {
    costDragDelta,
    averageRDelta,
    winRateDelta: current.winRate - previous.winRate,
    largeLossConcentrationDelta,
    segmentShift
  });
  const changeClassification = classifyChange(netPnlDelta, expectancyDelta, costDragDelta);
  const confidence = classifyConfidence(previousFull, currentFull, segmentShift, previous, current);

  const summary: IterationChangeSummary = {
    previousReportId: previous.id,
    currentReportId: current.id,
    previousReportName: previous.name,
    currentReportName: current.name,
    iteration,
    netPnlDelta,
    expectancyDelta,
    costDelta,
    costDragDelta,
    averageRDelta,
    winRateDelta: current.winRate - previous.winRate,
    profitFactorDelta,
    largeLossConcentrationDelta,
    tradeCountDelta: current.totalTrades - previous.totalTrades,
    primaryChangeDriver,
    secondaryChangeDrivers,
    changeClassification,
    confidence,
    explanation: "",
    recommendedAction: "",
    segmentShift
  };

  return {
    ...summary,
    explanation: buildExplanation(summary),
    recommendedAction: buildRecommendedAction(summary)
  };
}

function selectPrimaryDriver(input: {
  netPnlDelta: number;
  expectancyDelta: number;
  costDragDelta?: number;
  averageRDelta?: number;
  winRateDelta: number;
  largeLossConcentrationDelta?: number;
  tradeCountDelta: number;
  segmentShift?: IterationChangeSummary["segmentShift"];
  hasFullData: boolean;
}): ChangeDriver {
  if (!input.hasFullData && input.netPnlDelta === 0 && input.expectancyDelta === 0) return "insufficient_data";
  if (input.netPnlDelta > 0 && (input.costDragDelta ?? 0) < -0.05) return "cost_reduction";
  if (input.netPnlDelta < 0 && (input.costDragDelta ?? 0) > 0.05) return "cost_increase";
  if (input.expectancyDelta > 0.05 && (input.averageRDelta ?? 0) > 0.05) return "r_capture_improvement";
  if (input.expectancyDelta < -0.05 && (input.averageRDelta ?? 0) < -0.05) return "r_capture_deterioration";
  if ((input.largeLossConcentrationDelta ?? 0) < -0.08 && input.netPnlDelta > 0) return "large_loss_reduction";
  if ((input.largeLossConcentrationDelta ?? 0) > 0.08 && input.netPnlDelta < 0) return "large_loss_increase";
  if (input.segmentShift && Math.abs(input.segmentShift.netPnlDelta) >= Math.max(25, Math.abs(input.netPnlDelta) * 0.45)) {
    return "segment_mix_shift";
  }
  if (Math.abs(input.tradeCountDelta) >= Math.max(3, Math.abs(input.tradeCountDelta) * 0.25)) return "trade_selection";
  if (Math.abs(input.winRateDelta) > 0.08) return "win_rate_change";
  return input.netPnlDelta >= 0 ? "trade_selection" : "segment_mix_shift";
}

function selectSecondaryDrivers(primary: ChangeDriver, input: {
  costDragDelta?: number;
  averageRDelta?: number;
  winRateDelta: number;
  largeLossConcentrationDelta?: number;
  segmentShift?: IterationChangeSummary["segmentShift"];
}) {
  const drivers: ChangeDriver[] = [];
  if ((input.costDragDelta ?? 0) < -0.05) drivers.push("cost_reduction");
  if ((input.costDragDelta ?? 0) > 0.05) drivers.push("cost_increase");
  if ((input.averageRDelta ?? 0) > 0.05) drivers.push("r_capture_improvement");
  if ((input.averageRDelta ?? 0) < -0.05) drivers.push("r_capture_deterioration");
  if ((input.largeLossConcentrationDelta ?? 0) < -0.08) drivers.push("large_loss_reduction");
  if ((input.largeLossConcentrationDelta ?? 0) > 0.08) drivers.push("large_loss_increase");
  if (Math.abs(input.winRateDelta) > 0.08) drivers.push("win_rate_change");
  if (input.segmentShift) drivers.push("segment_mix_shift");
  return [...new Set(drivers.filter((driver) => driver !== primary))].slice(0, 3);
}

function classifyChange(netPnlDelta: number, expectancyDelta: number, costDragDelta?: number): ChangeClassification {
  const positive = [netPnlDelta > 1, expectancyDelta > 0.05, (costDragDelta ?? 0) < -0.03].filter(Boolean).length;
  const negative = [netPnlDelta < -1, expectancyDelta < -0.05, (costDragDelta ?? 0) > 0.03].filter(Boolean).length;
  if (positive >= 2 && negative === 0) return "improved";
  if (negative >= 2 && positive === 0) return "degraded";
  if (positive === 0 && negative === 0) return "flat";
  return "mixed";
}

function classifyConfidence(
  previousFull: DiagnosticsResult | undefined,
  currentFull: DiagnosticsResult | undefined,
  segmentShift: IterationChangeSummary["segmentShift"],
  previous: ReportSummary,
  current: ReportSummary
): ChangeConfidence {
  if (!previous || !current) return "insufficient_data";
  if (previousFull && currentFull && previous.totalTrades >= 10 && current.totalTrades >= 10 && segmentShift) return "high";
  if (previousFull && currentFull) return "medium";
  return "low";
}

function largestLossConcentration(report: DiagnosticsResult) {
  const losses = report.trades.filter((trade) => trade.netPnl < 0).map((trade) => Math.abs(trade.netPnl));
  const totalLosses = losses.reduce((total, loss) => total + loss, 0);
  if (totalLosses === 0) return 0;
  return Math.max(...losses) / totalLosses;
}

function findLargestSegmentShift(previous: DiagnosticsResult, current: DiagnosticsResult) {
  const dimensions: BreakdownDimension[] = ["symbol", "setup", "timeOfDay"];
  return dimensions
    .flatMap((dimension) => {
      const previousRows = new Map(buildBreakdown(previous.trades, dimension).map((row) => [row.group, row]));
      const currentRows = new Map(buildBreakdown(current.trades, dimension).map((row) => [row.group, row]));
      return [...new Set([...previousRows.keys(), ...currentRows.keys()])].map((group) => {
        const previousRow = previousRows.get(group);
        const currentRow = currentRows.get(group);
        return {
          dimension,
          group,
          netPnlDelta: (currentRow?.netPnl ?? 0) - (previousRow?.netPnl ?? 0),
          expectancyDelta:
            previousRow && currentRow ? currentRow.expectancy - previousRow.expectancy : currentRow?.expectancy ?? previousRow?.expectancy
        };
      });
    })
    .sort((a, b) => Math.abs(b.netPnlDelta) - Math.abs(a.netPnlDelta))[0];
}

function buildExplanation(summary: IterationChangeSummary) {
  const driver = formatDriver(summary.primaryChangeDriver);
  if (summary.changeClassification === "improved") {
    return `${summary.currentReportName} improved vs ${summary.previousReportName} primarily from ${driver}. Net PnL changed by ${formatCurrency(summary.netPnlDelta)} and expectancy changed by ${formatCurrency(summary.expectancyDelta)}.`;
  }
  if (summary.changeClassification === "degraded") {
    return `${summary.currentReportName} degraded vs ${summary.previousReportName} primarily from ${driver}. Net PnL changed by ${formatCurrency(summary.netPnlDelta)} and average R changed by ${formatNumber(summary.averageRDelta)}.`;
  }
  if (summary.changeClassification === "mixed") {
    return `${summary.currentReportName} was mixed vs ${summary.previousReportName}: ${driver} was the largest detected driver, but the core signals conflict.`;
  }
  if (summary.changeClassification === "flat") {
    return `${summary.currentReportName} was broadly flat vs ${summary.previousReportName}; no single change materially moved expectancy or net PnL.`;
  }
  return `There is insufficient data to attribute the change from ${summary.previousReportName} to ${summary.currentReportName}.`;
}

function buildRecommendedAction(summary: IterationChangeSummary) {
  if (summary.primaryChangeDriver === "segment_mix_shift" && summary.segmentShift) {
    return `Inspect ${summary.segmentShift.dimension} "${summary.segmentShift.group}" before approving this iteration.`;
  }
  if (summary.primaryChangeDriver === "cost_increase" || summary.primaryChangeDriver === "cost_reduction") {
    return "Compare execution costs and cost-heavy segments between these reports.";
  }
  if (summary.primaryChangeDriver.includes("large_loss")) return "Review the largest losing trades and loss concentration in both reports.";
  if (summary.primaryChangeDriver.includes("r_capture")) return "Inspect realized R distribution and exit quality between these reports.";
  return "Open the pair in Compare and review breakdown deltas by symbol, setup, and time of day.";
}

export function formatDriver(driver: ChangeDriver) {
  return driver.replace(/_/g, " ");
}

function formatCurrency(value: number | undefined) {
  if (value === undefined) return "N/A";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}$${Math.abs(value).toFixed(2)}`;
}

function formatNumber(value: number | undefined) {
  if (value === undefined) return "N/A";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}`;
}

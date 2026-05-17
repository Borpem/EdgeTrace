import type { NormalizedTrade } from "../types";
import { classifyCostDrag, costDragSortValue, type CostDragState } from "./costDrag";

export type BreakdownDimension = "symbol" | "strategy" | "timeOfDay";

export type BreakdownRow = {
  group: string;
  totalTrades: number;
  winRate: number;
  grossPnl: number;
  totalCosts: number;
  netPnl: number;
  expectancy: number;
  averageRealizedR?: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  costDragPct?: number;
  costDrag: CostDragState;
  netToGrossPct?: number;
};

export type BreakdownComparisonRow = {
  group: string;
  status: "Improved" | "Degraded" | "Flat" | "New" | "Missing";
  reportANetPnl?: number;
  reportBNetPnl?: number;
  netPnlDelta?: number;
  reportAExpectancy?: number;
  reportBExpectancy?: number;
  expectancyDelta?: number;
  reportACostDragPct?: number;
  reportBCostDragPct?: number;
  reportACostDragLabel: string;
  reportBCostDragLabel: string;
  costDragDelta?: number;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const average = (values: number[]) => (values.length ? sum(values) / values.length : 0);

export const breakdownLabels: Record<BreakdownDimension, string> = {
  symbol: "Symbol",
  strategy: "Strategy",
  timeOfDay: "Time of Day"
};

export function timeOfDayBucket(entryTime: string) {
  const date = new Date(entryTime);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 9 * 60 + 30) return "Pre-market";
  if (minutes < 10 * 60 + 30) return "Open 09:30-10:30";
  if (minutes < 14 * 60) return "Midday 10:30-14:00";
  if (minutes < 16 * 60) return "Power Hour 14:00-16:00";
  return "After-hours";
}

export function groupForDimension(trade: NormalizedTrade, dimension: BreakdownDimension) {
  if (dimension === "symbol") return trade.symbol || "Unspecified";
  if (dimension === "strategy") return trade.strategy?.trim() || "Unspecified";
  return timeOfDayBucket(trade.entryTime);
}

export function buildBreakdown(trades: NormalizedTrade[], dimension: BreakdownDimension) {
  const grouped = new Map<string, NormalizedTrade[]>();

  trades.forEach((trade) => {
    const group = groupForDimension(trade, dimension);
    grouped.set(group, [...(grouped.get(group) ?? []), trade]);
  });

  return [...grouped.entries()]
    .map(([group, groupTrades]): BreakdownRow => {
      const wins = groupTrades.filter((trade) => trade.netPnl > 0);
      const losses = groupTrades.filter((trade) => trade.netPnl < 0);
      const grossPnl = sum(groupTrades.map((trade) => trade.grossPnl));
      const totalCosts = sum(groupTrades.map((trade) => trade.estimatedCosts));
      const netPnl = sum(groupTrades.map((trade) => trade.netPnl));
      const grossProfit = sum(wins.map((trade) => trade.netPnl));
      const grossLoss = Math.abs(sum(losses.map((trade) => trade.netPnl)));
      const realizedRs = groupTrades
        .map((trade) => trade.realizedR)
        .filter((value): value is number => value !== undefined);

      return {
        group,
        totalTrades: groupTrades.length,
        winRate: groupTrades.length ? wins.length / groupTrades.length : 0,
        grossPnl,
        totalCosts,
        netPnl,
        expectancy: groupTrades.length ? netPnl / groupTrades.length : 0,
        averageRealizedR: realizedRs.length ? average(realizedRs) : undefined,
        averageWin: average(wins.map((trade) => trade.netPnl)),
        averageLoss: average(losses.map((trade) => trade.netPnl)),
        profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss,
        costDragPct: grossPnl > 0 ? totalCosts / grossPnl : undefined,
        costDrag: classifyCostDrag({
          grossPnl,
          totalCosts,
          totalTrades: groupTrades.length,
          minTrades: 2
        }),
        netToGrossPct: grossPnl !== 0 ? netPnl / grossPnl : undefined
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl);
}

export function findLargestLeak(rows: BreakdownRow[]) {
  if (!rows.length) return undefined;

  return [...rows].sort((a, b) => {
    const netComparison = a.netPnl - b.netPnl;
    if (netComparison !== 0) return netComparison;
    return costDragSortValue(b.costDrag) - costDragSortValue(a.costDrag);
  })[0];
}

export function findStrongestSegment(rows: BreakdownRow[]) {
  if (!rows.length) return undefined;

  return [...rows].sort((a, b) => {
    const expectancyComparison = b.expectancy - a.expectancy;
    if (expectancyComparison !== 0) return expectancyComparison;
    return b.netPnl - a.netPnl;
  })[0];
}

export function compareBreakdowns(
  rowsA: BreakdownRow[],
  rowsB: BreakdownRow[]
): BreakdownComparisonRow[] {
  const mapA = new Map(rowsA.map((row) => [row.group, row]));
  const mapB = new Map(rowsB.map((row) => [row.group, row]));
  const groups = [...new Set([...mapA.keys(), ...mapB.keys()])];

  return groups
    .map((group) => {
      const rowA = mapA.get(group);
      const rowB = mapB.get(group);
      const netPnlDelta =
        rowA && rowB ? rowB.netPnl - rowA.netPnl : rowB ? rowB.netPnl : rowA ? -rowA.netPnl : undefined;
      const expectancyDelta =
        rowA && rowB ? rowB.expectancy - rowA.expectancy : rowB ? rowB.expectancy : rowA ? -rowA.expectancy : undefined;
      const costDragDelta =
        rowA?.costDragPct === undefined || rowB?.costDragPct === undefined
          ? undefined
          : rowB.costDragPct - rowA.costDragPct;

      return {
        group,
        status: comparisonStatus(rowA, rowB, netPnlDelta, expectancyDelta, costDragDelta),
        reportANetPnl: rowA?.netPnl,
        reportBNetPnl: rowB?.netPnl,
        netPnlDelta,
        reportAExpectancy: rowA?.expectancy,
        reportBExpectancy: rowB?.expectancy,
        expectancyDelta,
        reportACostDragPct: rowA?.costDragPct,
        reportBCostDragPct: rowB?.costDragPct,
        reportACostDragLabel: rowA?.costDrag.label ?? "Missing",
        reportBCostDragLabel: rowB?.costDrag.label ?? "Missing",
        costDragDelta
      };
    })
    .sort((a, b) => Math.abs(b.netPnlDelta ?? 0) - Math.abs(a.netPnlDelta ?? 0));
}

function comparisonStatus(
  rowA: BreakdownRow | undefined,
  rowB: BreakdownRow | undefined,
  netPnlDelta: number | undefined,
  expectancyDelta: number | undefined,
  costDragDelta: number | undefined
): BreakdownComparisonRow["status"] {
  if (!rowA && rowB) return "New";
  if (rowA && !rowB) return "Missing";
  if (netPnlDelta === undefined || expectancyDelta === undefined) return "Flat";

  const materialMove = Math.abs(netPnlDelta) > 1 || Math.abs(expectancyDelta) > 0.25;
  if (!materialMove) return "Flat";
  const costImproved = costDragDelta === undefined || costDragDelta <= 0;
  if (netPnlDelta > 0 && expectancyDelta >= 0 && costImproved) return "Improved";
  if (netPnlDelta < 0 || expectancyDelta < 0 || (costDragDelta ?? 0) > 0.05) return "Degraded";
  return "Flat";
}

export function buildBreakdownInterpretation(rows: BreakdownComparisonRow[], dimensionLabel: string) {
  const improved = rows.filter((row) => row.status === "Improved");
  const degraded = rows.filter((row) => row.status === "Degraded");

  const topImproved = [...improved].sort((a, b) => (b.netPnlDelta ?? 0) - (a.netPnlDelta ?? 0))[0];
  const topDegraded = [...degraded].sort((a, b) => (a.netPnlDelta ?? 0) - (b.netPnlDelta ?? 0))[0];

  if (topImproved && (!topDegraded || Math.abs(topImproved.netPnlDelta ?? 0) >= Math.abs(topDegraded.netPnlDelta ?? 0))) {
    const costText = (topImproved.costDragDelta ?? 0) < 0 ? " and cost drag declined" : "";
    return `Most of the improvement came from ${dimensionLabel} "${topImproved.group}", where net PnL and expectancy increased${costText}.`;
  }

  if (topDegraded) {
    const costText = (topDegraded.costDragDelta ?? 0) > 0 ? " and cost drag increased" : "";
    return `The strategy degraded primarily in ${dimensionLabel} "${topDegraded.group}", where net PnL fell${costText}.`;
  }

  const newGroup = rows.find((row) => row.status === "New");
  if (newGroup) {
    return `${dimensionLabel} "${newGroup.group}" appears only in Report B. Review it separately before attributing the full comparison change to strategy improvement.`;
  }

  return `No single ${dimensionLabel.toLowerCase()} group explains most of the change between the selected reports.`;
}

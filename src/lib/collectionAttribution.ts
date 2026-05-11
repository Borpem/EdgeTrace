import type { BreakdownDimension, BreakdownRow } from "./breakdowns";
import { buildBreakdown, groupForDimension } from "./breakdowns";
import type { DiagnosticsResult, NormalizedTrade, ReportCollectionDetail } from "../types";

export type AttributionTrend = "improving" | "degrading" | "mixed" | "flat" | "insufficient_data";

export type CollectionAttributionRow = {
  dimension: BreakdownDimension;
  group: string;
  appearances: number;
  totalTrades: number;
  firstReportName?: string;
  latestReportName?: string;
  firstNetPnl?: number;
  latestNetPnl?: number;
  netPnlDelta?: number;
  firstExpectancy?: number;
  latestExpectancy?: number;
  expectancyDelta?: number;
  firstCostDrag?: number;
  latestCostDrag?: number;
  costDragDelta?: number;
  firstAverageR?: number;
  latestAverageR?: number;
  averageRDelta?: number;
  trendDirection: AttributionTrend;
  interpretation: string;
  perReport: CollectionAttributionPoint[];
  latestTrades: NormalizedTrade[];
};

export type CollectionAttributionPoint = {
  reportId: string;
  reportName: string;
  iteration: number;
  totalTrades: number;
  netPnl: number;
  expectancy: number;
  costDrag?: number;
  averageRealizedR?: number;
};

export type CollectionAttribution = {
  rowsByDimension: Record<BreakdownDimension, CollectionAttributionRow[]>;
  improvementDrivers: CollectionAttributionRow[];
  degradationDrivers: CollectionAttributionRow[];
};

export function buildCollectionAttribution(collection: ReportCollectionDetail): CollectionAttribution {
  const reports = collection.fullReports ?? [];
  const dimensions: BreakdownDimension[] = ["symbol", "setup", "strategy", "timeOfDay"];
  const rowsByDimension = Object.fromEntries(
    dimensions.map((dimension) => [dimension, buildDimensionRows(reports, dimension)])
  ) as Record<BreakdownDimension, CollectionAttributionRow[]>;

  const allRows = dimensions.flatMap((dimension) => rowsByDimension[dimension]);
  return {
    rowsByDimension,
    improvementDrivers: [...allRows]
      .filter((row) => row.trendDirection === "improving")
      .sort((a, b) => driverScore(b) - driverScore(a))
      .slice(0, 3),
    degradationDrivers: [...allRows]
      .filter((row) => row.trendDirection === "degrading")
      .sort((a, b) => driverScore(a) - driverScore(b))
      .slice(0, 3)
  };
}

export function getAttributionRow(
  collection: ReportCollectionDetail,
  dimension: BreakdownDimension,
  group: string
) {
  return buildCollectionAttribution(collection).rowsByDimension[dimension].find((row) => row.group === group);
}

function buildDimensionRows(reports: DiagnosticsResult[], dimension: BreakdownDimension): CollectionAttributionRow[] {
  const breakdowns = reports.map((report, index) => ({
    report,
    iteration: index + 1,
    rows: buildBreakdown(report.trades, dimension)
  }));
  const groups = [...new Set(breakdowns.flatMap(({ rows }) => rows.map((row) => row.group)))];

  return groups
    .map((group) => {
      const appearances = breakdowns
        .map(({ report, iteration, rows }) => {
          const row = rows.find((item) => item.group === group);
          return row ? toPoint(report, iteration, row) : undefined;
        })
        .filter((point): point is CollectionAttributionPoint => Boolean(point));
      const first = appearances[0];
      const latest = appearances[appearances.length - 1];
      const latestReport = latest ? reports.find((report) => report.id === latest.reportId) : undefined;
      const latestTrades = latestReport?.trades.filter((trade) => groupForDimension(trade, dimension) === group) ?? [];
      const row: CollectionAttributionRow = {
        dimension,
        group,
        appearances: appearances.length,
        totalTrades: sum(appearances.map((point) => point.totalTrades)),
        firstReportName: first?.reportName,
        latestReportName: latest?.reportName,
        firstNetPnl: first?.netPnl,
        latestNetPnl: latest?.netPnl,
        netPnlDelta: delta(first?.netPnl, latest?.netPnl),
        firstExpectancy: first?.expectancy,
        latestExpectancy: latest?.expectancy,
        expectancyDelta: delta(first?.expectancy, latest?.expectancy),
        firstCostDrag: first?.costDrag,
        latestCostDrag: latest?.costDrag,
        costDragDelta: delta(first?.costDrag, latest?.costDrag),
        firstAverageR: first?.averageRealizedR,
        latestAverageR: latest?.averageRealizedR,
        averageRDelta: delta(first?.averageRealizedR, latest?.averageRealizedR),
        trendDirection: classifyTrend(appearances),
        interpretation: "",
        perReport: appearances,
        latestTrades
      };
      return { ...row, interpretation: interpretAttribution(row) };
    })
    .sort((a, b) => Math.abs(b.netPnlDelta ?? 0) - Math.abs(a.netPnlDelta ?? 0));
}

function toPoint(report: DiagnosticsResult, iteration: number, row: BreakdownRow): CollectionAttributionPoint {
  return {
    reportId: report.id,
    reportName: report.name ?? `Report ${iteration}`,
    iteration,
    totalTrades: row.totalTrades,
    netPnl: row.netPnl,
    expectancy: row.expectancy,
    costDrag: row.costDragPct,
    averageRealizedR: row.averageRealizedR
  };
}

function classifyTrend(points: CollectionAttributionPoint[]): AttributionTrend {
  if (points.length < 2) return "insufficient_data";
  const first = points[0];
  const latest = points[points.length - 1];
  const netDelta = latest.netPnl - first.netPnl;
  const expectancyDelta = latest.expectancy - first.expectancy;
  const costDelta = latest.costDrag === undefined || first.costDrag === undefined ? 0 : latest.costDrag - first.costDrag;
  const rDelta =
    latest.averageRealizedR === undefined || first.averageRealizedR === undefined
      ? 0
      : latest.averageRealizedR - first.averageRealizedR;
  const positiveSignals = [netDelta > 1, expectancyDelta > 0.05, costDelta < -0.03, rDelta > 0.05].filter(Boolean).length;
  const negativeSignals = [netDelta < -1, expectancyDelta < -0.05, costDelta > 0.03, rDelta < -0.05].filter(Boolean).length;
  if (positiveSignals >= 2 && negativeSignals === 0) return "improving";
  if (negativeSignals >= 2 && positiveSignals === 0) return "degrading";
  if (positiveSignals === 0 && negativeSignals === 0) return "flat";
  return "mixed";
}

function interpretAttribution(row: CollectionAttributionRow) {
  if (row.trendDirection === "insufficient_data") return `${row.group} has too little collection history for attribution.`;
  if (row.trendDirection === "improving") {
    if ((row.expectancyDelta ?? 0) > 0.05) return `${row.group} improved primarily through stronger expectancy.`;
    if ((row.costDragDelta ?? 0) < -0.03) return `${row.group} improved with lower cost drag across the collection.`;
    return `${row.group} is contributing positively to collection improvement.`;
  }
  if (row.trendDirection === "degrading") {
    if ((row.costDragDelta ?? 0) > 0.03) return `${row.group} degraded mainly from higher cost drag.`;
    if ((row.expectancyDelta ?? 0) < -0.05) return `${row.group} degraded mainly from weaker expectancy.`;
    return `${row.group} is contributing to collection degradation.`;
  }
  if (row.trendDirection === "mixed") return `${row.group} shows mixed attribution signals across reports.`;
  return `${row.group} is broadly flat across this collection.`;
}

function driverScore(row: CollectionAttributionRow) {
  return (row.netPnlDelta ?? 0) + (row.expectancyDelta ?? 0) * 100 - (row.costDragDelta ?? 0) * 100;
}

function delta(first: number | undefined, latest: number | undefined) {
  if (first === undefined || latest === undefined) return undefined;
  return latest - first;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

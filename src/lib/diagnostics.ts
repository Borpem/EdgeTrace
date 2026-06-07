import type { DiagnosticsResult, InsightCard, NormalizedTrade, PortfolioMetrics } from "../types";

export const NO_LOSS_PROFIT_FACTOR = 99;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const average = (values: number[]) => (values.length ? sum(values) / values.length : 0);

export function calculateMetrics(trades: NormalizedTrade[]): PortfolioMetrics {
  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);
  const grossPnl = sum(trades.map((trade) => trade.grossPnl));
  const totalCosts = sum(trades.map((trade) => trade.estimatedCosts));
  const netPnl = sum(trades.map((trade) => trade.netPnl));
  const grossProfit = sum(wins.map((trade) => trade.netPnl));
  const grossLoss = Math.abs(sum(losses.map((trade) => trade.netPnl)));
  const realizedRs = trades
    .map((trade) => trade.realizedR)
    .filter((value): value is number => value !== undefined);

  return {
    totalTrades: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    grossPnl,
    totalCosts,
    netPnl,
    averageWin: average(wins.map((trade) => trade.netPnl)),
    averageLoss: average(losses.map((trade) => trade.netPnl)),
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? NO_LOSS_PROFIT_FACTOR : 0) : grossProfit / grossLoss,
    expectancy: trades.length ? netPnl / trades.length : 0,
    grossExpectancy: trades.length ? grossPnl / trades.length : 0,
    averageRealizedR: realizedRs.length ? average(realizedRs) : undefined
  };
}

export function normalizePortfolioMetrics(
  metrics: Partial<PortfolioMetrics> | null | undefined,
  trades: NormalizedTrade[] = []
): PortfolioMetrics {
  const recalculated = calculateMetrics(trades);

  return {
    totalTrades: finiteMetric(metrics?.totalTrades, recalculated.totalTrades),
    winRate: finiteMetric(metrics?.winRate, recalculated.winRate),
    grossPnl: finiteMetric(metrics?.grossPnl, recalculated.grossPnl),
    totalCosts: finiteMetric(metrics?.totalCosts, recalculated.totalCosts),
    netPnl: finiteMetric(metrics?.netPnl, recalculated.netPnl),
    averageWin: finiteMetric(metrics?.averageWin, recalculated.averageWin),
    averageLoss: finiteMetric(metrics?.averageLoss, recalculated.averageLoss),
    profitFactor: realMetric(metrics?.profitFactor, recalculated.profitFactor),
    expectancy: finiteMetric(metrics?.expectancy, recalculated.expectancy),
    grossExpectancy: finiteMetric(metrics?.grossExpectancy, recalculated.grossExpectancy),
    averageRealizedR: optionalFiniteMetric(metrics?.averageRealizedR, recalculated.averageRealizedR)
  };
}

function finiteMetric(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function realMetric(value: unknown, fallback: number) {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

function optionalFiniteMetric(value: unknown, fallback: number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

export function generateInsights(metrics: PortfolioMetrics): InsightCard[] {
  const insights: InsightCard[] = [];
  const positiveProfitBase = metrics.grossPnl > 0 ? metrics.grossPnl : 0;

  if (metrics.grossExpectancy > 0 && metrics.expectancy < 0) {
    insights.push({
      id: "cost-flip",
      severity: "critical",
      title: "Cost Drag Reverses Edge",
      message: "The strategy appears viable before costs but loses its edge after execution costs."
    });
  }

  if (positiveProfitBase > 0 && metrics.totalCosts / positiveProfitBase > 0.2) {
    insights.push({
      id: "material-costs",
      severity: "warning",
      title: "Execution Costs Are Material",
      message: "Execution costs are materially reducing profitability."
    });
  }

  if (metrics.averageRealizedR !== undefined && metrics.averageRealizedR < 0.25) {
    insights.push({
      id: "low-r-capture",
      severity: "warning",
      title: "Low Reward Capture",
      message: "The strategy is not capturing enough reward relative to planned risk."
    });
  }

  if (!insights.length) {
    insights.push({
      id: "baseline",
      severity: "info",
      title: "No Dominant Breakdown Detected",
      message: "The uploaded trades do not show a single obvious cost, expectancy, or R-multiple failure mode."
    });
  }

  return insights;
}

function buildCharts(trades: NormalizedTrade[]) {
  let equity = 0;
  const equityCurve = trades.map((trade, index) => {
    equity += trade.netPnl;
    return { trade: index + 1, equity };
  });

  const bySymbol = new Map<string, number>();
  const byHour = new Map<string, number>();

  trades.forEach((trade) => {
    bySymbol.set(trade.symbol, (bySymbol.get(trade.symbol) ?? 0) + trade.netPnl);
    const hour = new Date(trade.entryTime).getHours();
    const hourLabel = Number.isFinite(hour) ? `${String(hour).padStart(2, "0")}:00` : "Unknown";
    byHour.set(hourLabel, (byHour.get(hourLabel) ?? 0) + trade.netPnl);
  });

  return {
    equityCurve,
    pnlBySymbol: [...bySymbol.entries()].map(([symbol, pnl]) => ({ symbol, pnl })),
    pnlByHour: [...byHour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, pnl]) => ({ hour, pnl }))
  };
}

export function runDiagnostics(id: string, trades: NormalizedTrade[]): DiagnosticsResult {
  const metrics = calculateMetrics(trades);
  return {
    id,
    metrics,
    insights: generateInsights(metrics),
    trades,
    charts: buildCharts(trades)
  };
}

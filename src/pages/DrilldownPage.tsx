import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { breakdownLabels, type BreakdownDimension } from "../lib/breakdowns";
import type { CostDragState } from "../lib/costDrag";
import { NO_LOSS_PROFIT_FACTOR } from "../lib/diagnostics";
import {
  analyzeSegmentLeaks,
  buildSegmentCharts,
  detectSegmentPatterns,
  getSegmentSummary,
  getSegmentTrades
} from "../lib/leakAnalysis";
import { PaywallGate } from "../components/PaywallGate";
import { TableContainer } from "../components/ui/Primitives";
import { canViewFullDrilldown, getPlanConfig } from "../lib/entitlements";
import type { DiagnosticsResult, NormalizedTrade, UserProfile } from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type TradeSortKey =
  | "symbol"
  | "side"
  | "entryTime"
  | "exitTime"
  | "grossPnl"
  | "estimatedCosts"
  | "netPnl"
  | "realizedR"
  | "strategy";

type SegmentTone = "red" | "yellow" | "green" | "blue" | "gray";

export function DrilldownPage({
  result,
  dimension,
  group,
  profile,
  onBack
}: {
  result: DiagnosticsResult;
  dimension: BreakdownDimension;
  group: string;
  profile?: UserProfile | null;
  onBack: () => void;
}) {
  const [sortKey, setSortKey] = useState<TradeSortKey>("netPnl");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const segmentTrades = useMemo(
    () => getSegmentTrades(result.trades, dimension, group),
    [dimension, group, result.trades]
  );
  const summary = useMemo(
    () => getSegmentSummary(result.trades, dimension, group),
    [dimension, group, result.trades]
  );
  const leakInsights = useMemo(
    () => (summary ? analyzeSegmentLeaks(result, dimension, group, summary, segmentTrades) : []),
    [dimension, group, result, segmentTrades, summary]
  );
  const patterns = useMemo(() => detectSegmentPatterns(segmentTrades), [segmentTrades]);
  const charts = useMemo(() => buildSegmentCharts(segmentTrades), [segmentTrades]);
  const signedEquityCurve = useMemo(() => splitSignedEquityCurve(charts.equityCurve), [charts.equityCurve]);

  const sortedTrades = useMemo(() => {
    return [...segmentTrades].sort((a, b) => {
      const left = a[sortKey] ?? "";
      const right = b[sortKey] ?? "";
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [segmentTrades, sortDirection, sortKey]);

  const sort = (key: TradeSortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection(key === "netPnl" ? "asc" : "desc");
    }
  };

  const plan = getPlanConfig(profile?.planId);
  const drilldownsLocked =
    !canViewFullDrilldown(plan) ||
    (result.lockedSections ?? []).includes("full_drilldowns") ||
    result.accessLevel === "preview" ||
    result.accessLevel === "locked";

  if (drilldownsLocked) {
    return (
      <main className="EdgeTrace-shell py-10">
        <button className="mb-6 inline-flex items-center gap-2 text-sm text-accent" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <PaywallGate
          feature="full_drilldowns"
          accessLevel="locked"
          title="Upgrade to Pro to unlock full drilldowns."
          description="Pro shows the exact symbols, strategies, time windows, and trades behind the primary leak."
        />
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="EdgeTrace-shell py-10">
        <button className="mb-6 inline-flex items-center gap-2 text-sm text-accent" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <section className="EdgeTrace-card p-8">
          <p className="font-semibold">Segment not found</p>
          <p className="mt-2 text-sm text-muted">The selected segment is not available in this report.</p>
        </section>
      </main>
    );
  }

  const metrics: Array<{ label: string; value: string; tone: SegmentTone }> = [
    { label: "Total Trades", value: String(summary.totalTrades), tone: "gray" },
    { label: "Win Rate", value: percent.format(summary.winRate), tone: winRateTone(summary.winRate) },
    { label: "Gross PnL", value: currency.format(summary.grossPnl), tone: signedTone(summary.grossPnl) },
    { label: "Total Costs", value: currency.format(summary.totalCosts), tone: summary.totalCosts > 0 ? "yellow" : "gray" },
    { label: "Net PnL", value: currency.format(summary.netPnl), tone: signedTone(summary.netPnl) },
    { label: "Expectancy", value: currency.format(summary.expectancy), tone: signedTone(summary.expectancy) },
    { label: "Average R", value: formatNumber(summary.averageRealizedR), tone: rTone(summary.averageRealizedR) },
    { label: "Profit Factor", value: formatProfitFactor(summary.profitFactor), tone: profitFactorTone(summary.profitFactor) },
    { label: "Cost Drag", value: summary.costDrag.label, tone: costDragTone(summary.costDrag) },
    { label: "Net/Gross", value: formatPercent(summary.netToGrossPct), tone: netToGrossTone(summary.netToGrossPct) }
  ];

  return (
    <main className="EdgeTrace-shell py-10">
      <button className="mb-6 inline-flex items-center gap-2 text-sm text-accent" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <section className="EdgeTrace-page-header mb-6">
        <h1 className="max-w-5xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-6xl">{group}</h1>
        <p className="mt-5 max-w-4xl text-base leading-7 text-muted">
          {breakdownLabels[dimension]} segment from {result.name ?? "current report"}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {metrics.map(({ label, value, tone }) => (
          <div key={label} className={`EdgeTrace-card-soft EdgeTrace-drilldown-stripe tone-${tone} p-5`}>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
            <p className={`mt-3 text-xl font-semibold ${toneTextClass(tone)}`}>{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {leakInsights.map((insight) => (
          <div
            key={insight.id}
            className={`EdgeTrace-card EdgeTrace-drilldown-stripe ${
              insight.severity === "critical" ? "tone-red" : insight.severity === "warning" ? "tone-yellow" : "tone-gray"
            } p-5`}
          >
            <p className="text-sm font-semibold">{insight.title}</p>
            <p className="mt-3 text-sm leading-6 text-muted">{insight.message}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {patterns.map((pattern) => (
          <div key={pattern.label} className={`EdgeTrace-card-soft EdgeTrace-drilldown-stripe tone-${patternTone(pattern.label, pattern.value)} p-5`}>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">{pattern.label}</p>
            <p className={`mt-3 text-lg font-semibold ${patternValueClass(pattern.label, pattern.value)}`}>{pattern.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-3">
        <ChartPanel title="Segment Equity Curve">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={signedEquityCurve}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="trade" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip
                formatter={(value) => [formatTooltipCurrency(value), "Equity"]}
                contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }}
              />
              <Line
                type="monotone"
                dataKey="positiveEquity"
                stroke="#6fc78a"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4, fill: "#6fc78a", stroke: "#07111d", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="negativeEquity"
                stroke="#f45b72"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4, fill: "#f45b72", stroke: "#07111d", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Realized R Distribution">
          <RealizedRDistributionChart data={charts.rDistribution} />
        </ChartPanel>
        <ChartPanel title="Trade Cost Drag %">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.costDrag}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="trade" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip
                formatter={(value) => [formatTooltipPercent(value), "Cost drag"]}
                contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }}
              />
              <Bar dataKey="costDragPct" name="Cost drag" radius={[3, 3, 0, 0]} maxBarSize={42}>
                {charts.costDrag.map((entry) => (
                  <Cell key={entry.trade} fill={getCostDragFill(entry.costDragPct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <TableContainer className="mt-8">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-panel text-left text-muted">
            <tr>
              {[
                ["symbol", "Symbol"],
                ["side", "Side"],
                ["entryTime", "Entry Time"],
                ["exitTime", "Exit Time"],
                ["grossPnl", "Gross PnL"],
                ["estimatedCosts", "Costs"],
                ["netPnl", "Net PnL"],
                ["realizedR", "R"],
                ["strategy", "Strategy"]
              ].map(([key, label]) => (
                <th key={key} className="px-4 py-3 font-medium">
                  <button onClick={() => sort(key as TradeSortKey)}>{label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sortedTrades.map((trade) => (
              <tr key={trade.id}>
                <td className="px-4 py-3 font-medium">{trade.symbol}</td>
                <td className="px-4 py-3 text-muted">{trade.side}</td>
                <td className="px-4 py-3 text-muted">{trade.entryTime}</td>
                <td className="px-4 py-3 text-muted">{trade.exitTime ?? "N/A"}</td>
                <td className={`px-4 py-3 ${signedTextClass(trade.grossPnl)}`}>{currency.format(trade.grossPnl)}</td>
                <td className={`px-4 py-3 ${trade.estimatedCosts > 0 ? "text-warning" : "text-muted"}`}>
                  {currency.format(trade.estimatedCosts)}
                </td>
                <td className={`px-4 py-3 ${signedTextClass(trade.netPnl)}`}>
                  {currency.format(trade.netPnl)}
                </td>
                <td className={`px-4 py-3 ${toneTextClass(rTone(trade.realizedR))}`}>{formatNumber(trade.realizedR)}</td>
                <td className="px-4 py-3 text-muted">{trade.strategy ?? "Unspecified"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableContainer>
    </main>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="EdgeTrace-card p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
      {children}
    </div>
  );
}

function splitSignedEquityCurve(data: Array<{ trade: number; equity: number }>) {
  return data.map((point) => ({
    ...point,
    positiveEquity: point.equity >= 0 ? point.equity : undefined,
    negativeEquity: point.equity < 0 ? point.equity : undefined
  }));
}

function signedTone(value: number | undefined): SegmentTone {
  if (typeof value !== "number" || !Number.isFinite(value)) return "gray";
  if (value > 0) return "green";
  if (value < 0) return "red";
  return "gray";
}

function winRateTone(value: number | undefined): SegmentTone {
  if (typeof value !== "number" || !Number.isFinite(value)) return "gray";
  if (value >= 0.55) return "green";
  if (value >= 0.4) return "yellow";
  return "red";
}

function rTone(value: number | undefined): SegmentTone {
  if (typeof value !== "number" || !Number.isFinite(value)) return "gray";
  if (value >= 1) return "green";
  if (value > 0) return "yellow";
  return "red";
}

function profitFactorTone(value: number | undefined): SegmentTone {
  if (typeof value !== "number" || Number.isNaN(value)) return "gray";
  if (value === Infinity || value >= NO_LOSS_PROFIT_FACTOR || value >= 1.5) return "green";
  if (value >= 1) return "yellow";
  return "red";
}

function costDragTone(costDrag: CostDragState): SegmentTone {
  if (costDrag.type === "pre_cost_unprofitable") return "red";
  if (costDrag.type === "percentage") {
    if (costDrag.value <= 0.03) return "green";
    if (costDrag.value <= 0.12) return "yellow";
    return "red";
  }
  return "gray";
}

function netToGrossTone(value: number | undefined): SegmentTone {
  if (typeof value !== "number" || !Number.isFinite(value)) return "gray";
  if (value <= 0.25) return "green";
  if (value <= 0.6) return "yellow";
  return "red";
}

function toneTextClass(tone: SegmentTone) {
  if (tone === "red") return "text-loss";
  if (tone === "yellow") return "text-warning";
  if (tone === "green") return "text-profit";
  if (tone === "blue") return "text-accent";
  return "text-ink";
}

function signedTextClass(value: number | undefined) {
  return toneTextClass(signedTone(value));
}

function patternTone(label: string, value: string): SegmentTone {
  const normalized = `${label} ${value}`.toLowerCase();
  if (normalized.includes("loser") || normalized.includes("worst") || normalized.includes("-$")) return "red";
  if (normalized.includes("winner") || normalized.includes("best")) return "green";
  return "gray";
}

function patternValueClass(label: string, value: string) {
  return toneTextClass(patternTone(label, value));
}

function getCostDragFill(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "#8fa0ad";
  if (value <= 3) return "#6fc78a";
  if (value <= 12) return "#e2b84a";
  return "#f45b72";
}

function RealizedRDistributionChart({ data }: { data: Array<{ bucket: string; count: number }> }) {
  const hasOnlyUnavailableR = data.length === 1 && data[0]?.bucket === "N/A";

  if (!data.length || hasOnlyUnavailableR) {
    const tradeCount = data[0]?.count ?? 0;
    return (
      <div className="grid h-[260px] place-items-center border border-line bg-black/20 px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-ink">R data unavailable</p>
          <p className="mt-2 max-w-xs text-sm leading-6 text-muted">
            {tradeCount > 0
              ? `${tradeCount} trade${tradeCount === 1 ? "" : "s"} did not include realized R values.`
              : "This segment does not include realized R values."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barCategoryGap="42%" margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#243B64" strokeOpacity={0.35} vertical={false} />
        <XAxis dataKey="bucket" stroke="#9CA8C7" tickLine={false} axisLine={{ stroke: "#385264" }} />
        <YAxis allowDecimals={false} stroke="#9CA8C7" tickLine={false} axisLine={{ stroke: "#385264" }} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.035)" }}
          contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={54}>
          {data.map((entry) => (
            <Cell key={entry.bucket} fill={getRBucketFill(entry.bucket)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function getRBucketFill(bucket: string) {
  if (bucket === "N/A") return "#8fa0ad";
  if (bucket.includes("-") || bucket.includes("<")) return "#e65f73";
  return "#73c98f";
}

function formatNumber(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  return number.format(value);
}

function formatProfitFactor(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  if (value === Infinity || value >= NO_LOSS_PROFIT_FACTOR) return "No losses";
  if (!Number.isFinite(value)) return "N/A";
  return number.format(value);
}

function formatPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  return percent.format(value);
}

function formatTooltipPercent(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return "N/A";
  return `${number.format(numericValue)}%`;
}

function formatTooltipCurrency(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return "N/A";
  return currency.format(numericValue);
}

import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { breakdownLabels, type BreakdownDimension } from "../lib/breakdowns";
import {
  analyzeSegmentLeaks,
  buildSegmentCharts,
  detectSegmentPatterns,
  getSegmentSummary,
  getSegmentTrades
} from "../lib/leakAnalysis";
import { PaywallGate } from "../components/PaywallGate";
import type { DiagnosticsResult, NormalizedTrade } from "../types";

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
  | "strategy"
  | "setup";

export function DrilldownPage({
  result,
  dimension,
  group,
  onBack
}: {
  result: DiagnosticsResult;
  dimension: BreakdownDimension;
  group: string;
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

  if ((result.lockedSections ?? []).includes("full_drilldowns") || result.accessLevel === "preview" || result.accessLevel === "locked") {
    return (
      <main className="EdgeTrace-shell py-10">
        <button className="mb-6 inline-flex items-center gap-2 text-sm text-accent" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <PaywallGate
          feature="full_drilldowns"
          accessLevel="locked"
          title="Upgrade to Pro to unlock full drilldowns."
          description="Pro shows the exact symbols, setups, time windows, and trades behind the primary leak."
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
        <section className="rounded-lg border border-line bg-panel p-8">
          <p className="font-semibold">Segment not found</p>
          <p className="mt-2 text-sm text-muted">The selected segment is not available in this report.</p>
        </section>
      </main>
    );
  }

  const metrics = [
    ["Total Trades", String(summary.totalTrades)],
    ["Win Rate", percent.format(summary.winRate)],
    ["Gross PnL", currency.format(summary.grossPnl)],
    ["Total Costs", currency.format(summary.totalCosts)],
    ["Net PnL", currency.format(summary.netPnl)],
    ["Expectancy", currency.format(summary.expectancy)],
    ["Average R", formatNumber(summary.averageRealizedR)],
    ["Profit Factor", formatNumber(summary.profitFactor)],
    ["Cost Drag", summary.costDrag.label],
    ["Net/Gross", formatPercent(summary.netToGrossPct)]
  ];

  return (
    <main className="EdgeTrace-shell py-10">
      <button className="mb-6 inline-flex items-center gap-2 text-sm text-accent" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <section className="mb-8 border-y border-white/[0.1] py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Drill-through Analysis</p>
        <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[1] tracking-[-0.055em] text-ink md:text-6xl">{group}</h1>
        <p className="mt-5 max-w-4xl text-base leading-7 text-muted">
          {breakdownLabels[dimension]} segment from {result.name ?? "current report"}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-panel p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
            <p className="mt-3 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {leakInsights.map((insight) => (
          <div
            key={insight.id}
            className={`rounded-lg border bg-panel p-5 ${
              insight.severity === "critical"
                ? "border-loss/70"
                : insight.severity === "warning"
                  ? "border-warning/70"
                  : "border-line"
            }`}
          >
            <p className="text-sm font-semibold">{insight.title}</p>
            <p className="mt-3 text-sm leading-6 text-muted">{insight.message}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {patterns.map((pattern) => (
          <div key={pattern.label} className="rounded-lg border border-line bg-panel p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">{pattern.label}</p>
            <p className="mt-3 text-lg font-semibold">{pattern.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-3">
        <ChartPanel title="Segment Equity Curve">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={charts.equityCurve}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="trade" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Line type="monotone" dataKey="equity" stroke="#45D5FF" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Realized R Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.rDistribution}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="bucket" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Bar dataKey="count" fill="#3E8BFF" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Trade Cost Drag %">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.costDrag}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="trade" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Bar dataKey="costDragPct" fill="#FFB84D" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <section className="mt-8 overflow-x-auto rounded-lg border border-line">
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
                ["strategy", "Strategy"],
                ["setup", "Setup"]
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
                <td className="px-4 py-3">{currency.format(trade.grossPnl)}</td>
                <td className="px-4 py-3 text-warning">{currency.format(trade.estimatedCosts)}</td>
                <td className={trade.netPnl >= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>
                  {currency.format(trade.netPnl)}
                </td>
                <td className="px-4 py-3 text-muted">{formatNumber(trade.realizedR)}</td>
                <td className="px-4 py-3 text-muted">{trade.strategy ?? "Unspecified"}</td>
                <td className="px-4 py-3 text-muted">{trade.setup ?? "Unspecified"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
      {children}
    </div>
  );
}

function formatNumber(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  return number.format(value);
}

function formatPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  return percent.format(value);
}

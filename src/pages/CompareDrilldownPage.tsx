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
  compareCharts,
  compareSegmentLeaks,
  improvementAttribution,
  segmentSummary,
  segmentTrades,
  tradeLevelDeltas
} from "../lib/compareLeakAnalysis";
import { createManualPair, pairTrades, type MatchedTradePair } from "../lib/tradePairing";
import { PaywallGate } from "../components/PaywallGate";
import type { DiagnosticsResult, NormalizedTrade } from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type TradeSortKey =
  | "entryTime"
  | "symbol"
  | "side"
  | "netPnl"
  | "grossPnl"
  | "estimatedCosts"
  | "realizedR"
  | "setup"
  | "strategy";
type TradeFilterMode = "all" | "winners" | "losers" | "highCost" | "largeLoss";
type MatchConfidenceFilter = "all" | "high" | "mediumPlus" | "low";
type MatchReviewFilter = "active" | "approved" | "auto" | "rejected" | "manually_matched";

export function CompareDrilldownPage({
  reportA,
  reportB,
  dimension,
  group,
  onBack
}: {
  reportA: DiagnosticsResult;
  reportB: DiagnosticsResult;
  dimension: BreakdownDimension;
  group: string;
  onBack: () => void;
}) {
  const [sortKey, setSortKey] = useState<TradeSortKey>("entryTime");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState({
    symbol: "",
    side: "",
    setup: "",
    strategy: "",
    mode: "all" as TradeFilterMode
  });
  const [matchConfidenceFilter, setMatchConfidenceFilter] = useState<MatchConfidenceFilter>("all");
  const [matchReviewFilter, setMatchReviewFilter] = useState<MatchReviewFilter>("active");
  const [showRejected, setShowRejected] = useState(false);
  const [reviewStates, setReviewStates] = useState<Record<string, MatchedTradePair["reviewState"]>>({});
  const [manualPairs, setManualPairs] = useState<MatchedTradePair[]>([]);
  const [manualAId, setManualAId] = useState("");
  const [manualBId, setManualBId] = useState("");

  const tradesA = segmentTrades(reportA, dimension, group);
  const tradesB = segmentTrades(reportB, dimension, group);
  const summaryA = segmentSummary(tradesA, dimension);
  const summaryB = segmentSummary(tradesB, dimension);
  const tradeDeltas = tradeLevelDeltas(tradesA, tradesB);
  const insights = compareSegmentLeaks(summaryA, summaryB, tradesA, tradesB);
  const attribution = improvementAttribution(summaryA, summaryB, tradesA, tradesB);
  const charts = compareCharts(tradesA, tradesB);
  const pairing = useMemo(() => pairTrades(tradesA, tradesB), [tradesA, tradesB]);
  const reviewedAutoPairs = useMemo(
    () =>
      pairing.matched.map((pair) => ({
        ...pair,
        reviewState: reviewStates[pairKey(pair)] ?? pair.reviewState
      })),
    [pairing.matched, reviewStates]
  );
  const allReviewPairs = useMemo(() => [...reviewedAutoPairs, ...manualPairs], [manualPairs, reviewedAutoPairs]);
  const activePairs = useMemo(
    () => allReviewPairs.filter((pair) => pair.reviewState !== "rejected"),
    [allReviewPairs]
  );
  const filteredMatches = useMemo(
    () => filterMatchedPairs(allReviewPairs, matchConfidenceFilter, matchReviewFilter, showRejected),
    [allReviewPairs, matchConfidenceFilter, matchReviewFilter, showRejected]
  );
  const auditedSummary = useMemo(
    () => buildAuditedSummary(allReviewPairs, activePairs, tradesA.length, tradesB.length),
    [activePairs, allReviewPairs, tradesA.length, tradesB.length]
  );
  const auditedAttribution = useMemo(
    () => buildAuditedAttribution(activePairs, auditedSummary),
    [activePairs, auditedSummary]
  );
  const unmatchedA = useMemo(
    () => unmatchedTradesForManual(pairing.onlyA, reviewedAutoPairs, manualPairs, "A"),
    [manualPairs, pairing.onlyA, reviewedAutoPairs]
  );
  const unmatchedB = useMemo(
    () => unmatchedTradesForManual(pairing.onlyB, reviewedAutoPairs, manualPairs, "B"),
    [manualPairs, pairing.onlyB, reviewedAutoPairs]
  );
  const filteredA = useMemo(
    () => sortTrades(filterTrades(tradesA, filters), sortKey, sortDirection),
    [filters, sortDirection, sortKey, tradesA]
  );
  const filteredB = useMemo(
    () => sortTrades(filterTrades(tradesB, filters), sortKey, sortDirection),
    [filters, sortDirection, sortKey, tradesB]
  );
  const filterOptions = useMemo(() => buildFilterOptions([...tradesA, ...tradesB]), [tradesA, tradesB]);

  const metrics = [
    ["Total Trades", summaryA?.totalTrades, summaryB?.totalTrades, "number"],
    ["Win Rate", summaryA?.winRate, summaryB?.winRate, "percent"],
    ["Gross PnL", summaryA?.grossPnl, summaryB?.grossPnl, "currency"],
    ["Total Costs", summaryA?.totalCosts, summaryB?.totalCosts, "currency"],
    ["Net PnL", summaryA?.netPnl, summaryB?.netPnl, "currency"],
    ["Expectancy", summaryA?.expectancy, summaryB?.expectancy, "currency"],
    ["Average R", summaryA?.averageRealizedR, summaryB?.averageRealizedR, "number"],
    ["Profit Factor", summaryA?.profitFactor, summaryB?.profitFactor, "number"],
    ["Cost Drag", summaryA?.costDrag.label, summaryB?.costDrag.label, "label"],
    ["Net/Gross", summaryA?.netToGrossPct, summaryB?.netToGrossPct, "percent"]
  ] as const;

  if (
    reportA.accessLevel === "preview" ||
    reportA.accessLevel === "locked" ||
    reportB.accessLevel === "preview" ||
    reportB.accessLevel === "locked" ||
    (reportA.lockedSections ?? []).includes("full_drilldowns") ||
    (reportB.lockedSections ?? []).includes("full_drilldowns")
  ) {
    return (
      <main className="EdgeTrace-shell py-10">
        <button className="mb-6 inline-flex items-center gap-2 text-sm text-accent" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Compare
        </button>
        <PaywallGate
          feature="full_compare"
          accessLevel="locked"
          title="Upgrade to Pro to unlock comparison drilldowns."
          description="Pro shows the exact segment and trade-level changes between two diagnostic reports."
        />
      </main>
    );
  }

  return (
    <main className="EdgeTrace-shell py-10">
      <button className="mb-6 inline-flex items-center gap-2 text-sm text-accent" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Compare
      </button>

      <section className="mb-8 border-y border-white/[0.1] py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Compare Drill-through</p>
        <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[1] tracking-[-0.055em] text-ink md:text-6xl">{group}</h1>
        <p className="mt-5 max-w-4xl text-base leading-7 text-muted">
          {breakdownLabels[dimension]} attribution between {reportA.name ?? "Report A"} and{" "}
          {reportB.name ?? "Report B"}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ReportHeader title="Report A" report={reportA} />
        <ReportHeader title="Report B" report={reportB} />
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, valueA, valueB, format]) => (
          <MetricDeltaCard
            key={label}
            label={label}
            valueA={valueA}
            valueB={valueB}
            format={format}
            lowerIsBetter={label === "Total Costs" || label === "Cost Drag"}
          />
        ))}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <MiniStat label="Additional Winners" value={signedNumber(tradeDeltas.additionalWinners)} />
        <MiniStat label="Additional Losers" value={signedNumber(tradeDeltas.additionalLosers)} />
        <MiniStat label="Avg Trade Improvement" value={signedCurrency(tradeDeltas.averageTradeImprovement)} />
        <MiniStat label="Avg Cost Change" value={signedCurrency(tradeDeltas.averageCostChange)} />
      </section>

      <section className="mt-8 rounded-lg border border-line bg-panel p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">What Changed?</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-md border border-accent/50 bg-accent/10 px-4 py-3 text-sm text-accent">
            {auditedAttribution}
          </div>
          {attribution.map((item) => (
            <div key={item} className="rounded-md border border-line bg-graphite px-4 py-3 text-sm">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <MiniStat label="Active Matches" value={number.format(auditedSummary.activeCount)} />
        <MiniStat label="Auto Matches" value={number.format(auditedSummary.autoCount)} />
        <MiniStat label="Approved" value={number.format(auditedSummary.approvedCount)} />
        <MiniStat label="Rejected" value={number.format(auditedSummary.rejectedCount)} />
        <MiniStat label="Manual" value={number.format(auditedSummary.manualCount)} />
        <MiniStat label="Avg Confidence" value={`${number.format(auditedSummary.averageConfidence)}%`} />
        <MiniStat label="Coverage" value={percent.format(auditedSummary.coverage)} />
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-4">
        <MiniStat label="Removed Net PnL" value={currency.format(pairing.summary.removedNetPnl)} />
        <MiniStat label="Added Net PnL" value={currency.format(pairing.summary.addedNetPnl)} />
        <MiniStat label="Avg Removed Trade" value={currency.format(pairing.summary.averageRemovedNetPnl)} />
        <MiniStat label="Avg Added Trade" value={currency.format(pairing.summary.averageAddedNetPnl)} />
      </section>

      <section className="mt-4 rounded-lg border border-line bg-panel p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Audit Summary</p>
        <p className="mt-3 text-sm leading-6 text-muted">
          Attribution recalculated using audited matches. Rejected matches were excluded from this analysis.
          Manual matches were included as user-reviewed pairs. Coverage is active matched pairs divided by the
          larger segment trade count.
        </p>
      </section>

      <section
        className={`mt-4 rounded-lg border p-5 ${
          pairing.summary.lowConfidenceCount > 0
            ? "border-warning/70 bg-warning/10 text-warning"
            : "border-accent/60 bg-accent/10 text-accent"
        }`}
      >
        {pairing.summary.lowConfidenceCount > 0
          ? "Some trade pairs are low-confidence heuristic matches. Treat attribution from these pairs as directional, not definitive."
          : "Most matched trades have strong pairing confidence."}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {insights.map((insight) => (
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

      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <ChartPanel title="Net PnL Comparison">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.netPnl}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="report" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Bar dataKey="netPnl" fill="#3DDC97" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Cost Drag Comparison">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.costDrag}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="report" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Bar dataKey="costDrag" fill="#FFB84D" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Realized R Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.rDistribution}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="bucket" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Bar dataKey="Report A" fill="#3E8BFF" />
              <Bar dataKey="Report B" fill="#45D5FF" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Equity Curve Overlay">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={charts.equity}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="trade" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Line type="monotone" dataKey="Report A" stroke="#3E8BFF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Report B" stroke="#45D5FF" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <details className="mt-8 rounded-lg border border-line bg-panel p-5" open>
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Filters and Sorting
        </summary>
        <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-7">
          <SelectControl
            label="Symbol"
            value={filters.symbol}
            options={filterOptions.symbols}
            onChange={(value) => setFilters((current) => ({ ...current, symbol: value }))}
          />
          <SelectControl
            label="Side"
            value={filters.side}
            options={["long", "short"]}
            onChange={(value) => setFilters((current) => ({ ...current, side: value }))}
          />
          <SelectControl
            label="Setup"
            value={filters.setup}
            options={filterOptions.setups}
            onChange={(value) => setFilters((current) => ({ ...current, setup: value }))}
          />
          <SelectControl
            label="Strategy"
            value={filters.strategy}
            options={filterOptions.strategies}
            onChange={(value) => setFilters((current) => ({ ...current, strategy: value }))}
          />
          <SelectControl
            label="Mode"
            value={filters.mode}
            options={["all", "winners", "losers", "highCost", "largeLoss"]}
            labels={{
              all: "All trades",
              winners: "Winners only",
              losers: "Losers only",
              highCost: "High-cost only",
              largeLoss: "Large-loss only"
            }}
            onChange={(value) => setFilters((current) => ({ ...current, mode: value as TradeFilterMode }))}
          />
          <SelectControl
            label="Sort"
            value={`${sortKey}:${sortDirection}`}
            options={[
              "entryTime:asc",
              "symbol:asc",
              "side:asc",
              "netPnl:desc",
              "grossPnl:desc",
              "estimatedCosts:desc",
              "realizedR:desc",
              "setup:asc",
              "strategy:asc"
            ]}
            labels={{
              "entryTime:asc": "Entry time",
              "symbol:asc": "Symbol",
              "side:asc": "Side",
              "netPnl:desc": "Net PnL",
              "grossPnl:desc": "Gross PnL",
              "estimatedCosts:desc": "Costs",
              "realizedR:desc": "Realized R",
              "setup:asc": "Setup",
              "strategy:asc": "Strategy"
            }}
            onChange={(value) => {
              const [nextKey, nextDirection] = value.split(":") as [TradeSortKey, "asc" | "desc"];
              setSortKey(nextKey);
              setSortDirection(nextDirection);
            }}
          />
          <SelectControl
            label="Match Quality"
            value={matchConfidenceFilter}
            options={["all", "high", "mediumPlus", "low"]}
            labels={{
              all: "All matches",
              high: "High only",
              mediumPlus: "Medium+ only",
              low: "Low only"
            }}
            onChange={(value) => setMatchConfidenceFilter(value as MatchConfidenceFilter)}
          />
          <SelectControl
            label="Review State"
            value={matchReviewFilter}
            options={["active", "approved", "auto", "rejected", "manually_matched"]}
            labels={{
              active: "All active",
              approved: "Approved only",
              auto: "Auto only",
              rejected: "Rejected only",
              manually_matched: "Manual only"
            }}
            onChange={(value) => setMatchReviewFilter(value as MatchReviewFilter)}
          />
          <label className="flex items-end gap-2 pb-3 text-sm text-muted">
            <input
              type="checkbox"
              checked={showRejected}
              onChange={(event) => setShowRejected(event.target.checked)}
            />
            Show rejected
          </label>
        </div>
      </details>

      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <TradeTable title="Report A Trades" trades={filteredA} />
        <TradeTable title="Report B Trades" trades={filteredB} />
      </section>

      <details className="mt-8 rounded-lg border border-line bg-panel p-5" open>
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Matched Trade Analysis
        </summary>
        <div className="mt-5 overflow-x-auto rounded-lg border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-panel text-left text-muted">
              <tr>
                {[
                  "Symbol",
                  "Side",
                  "Setup",
                  "Strategy",
                  "A Net PnL",
                  "B Net PnL",
                  "Net Delta",
                  "A Cost",
                  "B Cost",
                  "Cost Delta",
                  "A R",
                  "B R",
                  "R Delta",
                  "Entry Delta",
                  "Exit Delta",
                  "Confidence",
                  "Why Matched",
                  "Review",
                  "Actions",
                  "Classification"
                ].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredMatches.map((pair) => (
                <MatchedPairRow
                  key={pairKey(pair)}
                  pair={pair}
                  onReviewChange={(state) => {
                    if (pair.reviewState === "manually_matched") {
                      setManualPairs((current) =>
                        current.map((manualPair) =>
                          pairKey(manualPair) === pairKey(pair)
                            ? { ...manualPair, reviewState: state === "rejected" ? "rejected" : "manually_matched" }
                            : manualPair
                        )
                      );
                    } else {
                      setReviewStates((current) => ({ ...current, [pairKey(pair)]: state }));
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="mt-8 rounded-lg border border-line bg-panel p-5" open>
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-muted">
          Create Manual Match
        </summary>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <SelectControl
            label="Unmatched Report A Trade"
            value={manualAId}
            options={unmatchedA.map((trade) => trade.id)}
            labels={Object.fromEntries(unmatchedA.map((trade) => [trade.id, manualTradeLabel(trade)]))}
            onChange={setManualAId}
          />
          <SelectControl
            label="Unmatched Report B Trade"
            value={manualBId}
            options={unmatchedB.map((trade) => trade.id)}
            labels={Object.fromEntries(unmatchedB.map((trade) => [trade.id, manualTradeLabel(trade)]))}
            onChange={setManualBId}
          />
          <button
            className="EdgeTrace-compact-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!manualAId || !manualBId}
            onClick={() => {
              const tradeA = unmatchedA.find((trade) => trade.id === manualAId);
              const tradeB = unmatchedB.find((trade) => trade.id === manualBId);
              if (!tradeA || !tradeB) return;
              setManualPairs((current) => [...current, createManualPair(tradeA, tradeB)]);
              setManualAId("");
              setManualBId("");
            }}
          >
            Match selected trades
          </button>
        </div>
      </details>
    </main>
  );
}

function ReportHeader({ title, report }: { title: string; report: DiagnosticsResult }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{title}</p>
      <p className="mt-2 text-xl font-semibold">{report.name ?? title}</p>
      <p className="mt-1 text-sm text-muted">{report.createdAt ? new Date(report.createdAt).toLocaleString() : "No date"}</p>
    </div>
  );
}

function MetricDeltaCard({
  label,
  valueA,
  valueB,
  format,
  lowerIsBetter
}: {
  label: string;
  valueA: number | string | undefined;
  valueB: number | string | undefined;
  format: "currency" | "number" | "percent" | "label";
  lowerIsBetter: boolean;
}) {
  const numericA = typeof valueA === "number" && Number.isFinite(valueA) ? valueA : undefined;
  const numericB = typeof valueB === "number" && Number.isFinite(valueB) ? valueB : undefined;
  const delta = numericA === undefined || numericB === undefined ? undefined : numericB - numericA;
  const status = deltaStatus(delta, lowerIsBetter);
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
        <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>{status}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricSmall label="A" value={formatValue(valueA, format)} />
        <MetricSmall label="B" value={formatValue(valueB, format)} />
      </div>
      <p className="mt-3 text-sm text-muted">Delta: {delta === undefined ? "Insufficient data" : formatValue(delta, format, true)}</p>
    </div>
  );
}

function TradeTable({ title, trades }: { title: string; trades: NormalizedTrade[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <div className="border-b border-line bg-panel px-4 py-3 text-sm font-semibold">{title}</div>
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-panel text-left text-muted">
          <tr>
            {["Symbol", "Side", "Entry Time", "Gross PnL", "Net PnL", "R", "Costs", "Strategy", "Setup"].map((label) => (
              <th key={label} className="px-4 py-3 font-medium">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {trades.map((trade) => (
            <tr key={trade.id}>
              <td className="px-4 py-3 font-medium">{trade.symbol}</td>
              <td className="px-4 py-3 text-muted">{trade.side}</td>
              <td className="px-4 py-3 text-muted">{trade.entryTime}</td>
              <td className="px-4 py-3">{currency.format(trade.grossPnl)}</td>
              <td className={trade.netPnl >= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>{currency.format(trade.netPnl)}</td>
              <td className="px-4 py-3 text-muted">{formatNumber(trade.realizedR)}</td>
              <td className="px-4 py-3 text-warning">{currency.format(trade.estimatedCosts)}</td>
              <td className="px-4 py-3 text-muted">{trade.strategy ?? "Unspecified"}</td>
              <td className="px-4 py-3 text-muted">{trade.setup ?? "Unspecified"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchedPairRow({
  pair,
  onReviewChange
}: {
  pair: MatchedTradePair;
  onReviewChange: (state: MatchedTradePair["reviewState"]) => void;
}) {
  return (
    <tr className={pair.reviewState === "rejected" ? "opacity-50" : ""}>
      <td className="px-4 py-3 font-medium">{pair.tradeA.symbol}</td>
      <td className="px-4 py-3 text-muted">{pair.tradeA.side}</td>
      <td className="px-4 py-3 text-muted">{pair.tradeA.setup ?? pair.tradeB.setup ?? "Unspecified"}</td>
      <td className="px-4 py-3 text-muted">{pair.tradeA.strategy ?? pair.tradeB.strategy ?? "Unspecified"}</td>
      <td className="px-4 py-3">{currency.format(pair.tradeA.netPnl)}</td>
      <td className="px-4 py-3">{currency.format(pair.tradeB.netPnl)}</td>
      <td className={pair.netPnlDelta >= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>
        {signedCurrency(pair.netPnlDelta)}
      </td>
      <td className="px-4 py-3 text-warning">{currency.format(pair.tradeA.estimatedCosts)}</td>
      <td className="px-4 py-3 text-warning">{currency.format(pair.tradeB.estimatedCosts)}</td>
      <td className={pair.costDelta <= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>
        {signedCurrency(pair.costDelta)}
      </td>
      <td className="px-4 py-3 text-muted">{formatNumber(pair.tradeA.realizedR)}</td>
      <td className="px-4 py-3 text-muted">{formatNumber(pair.tradeB.realizedR)}</td>
      <td className={(pair.realizedRDelta ?? 0) >= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>
        {pair.realizedRDelta === undefined ? "N/A" : signedNumber(pair.realizedRDelta)}
      </td>
      <td className="px-4 py-3 text-muted">{formatNumber(pair.entryPriceDelta)}</td>
      <td className="px-4 py-3 text-muted">{formatNumber(pair.exitPriceDelta)}</td>
      <td className="px-4 py-3">
        <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${confidenceClass(pair.confidenceLabel)}`}>
          {pair.confidenceLabel} {pair.confidenceScore}
        </span>
      </td>
      <td className="px-4 py-3 text-muted">
        <details>
          <summary className="cursor-pointer text-accent">{compactReasons(pair.matchReasons)}</summary>
          <div className="mt-2 min-w-64 rounded-md border border-line bg-graphite p-3 text-xs leading-5 text-muted">
            <p>Report A entry: {pair.tradeA.entryTime}</p>
            <p>Report B entry: {pair.tradeB.entryTime}</p>
            <p>Symbol match: {yesNo(pair.audit.symbolMatch)}</p>
            <p>Side match: {yesNo(pair.audit.sideMatch)}</p>
            <p>Setup match: {yesNo(pair.audit.setupMatch)}</p>
            <p>Strategy match: {yesNo(pair.audit.strategyMatch)}</p>
            <p>Time bucket match: {yesNo(pair.audit.timeBucketMatch)}</p>
            <p>Report A bucket: {pair.audit.reportATimeBucket}</p>
            <p>Report B bucket: {pair.audit.reportBTimeBucket}</p>
            <p>
              Entry difference:{" "}
              {pair.audit.entryTimeDifferenceMinutes === undefined
                ? "Unknown"
                : `${number.format(pair.audit.entryTimeDifferenceMinutes)} min`}
            </p>
          </div>
        </details>
      </td>
      <td className="px-4 py-3 text-muted">{reviewLabel(pair.reviewState)}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {pair.reviewState === "auto" && (
            <>
              <ActionButton label="Approve" onClick={() => onReviewChange("approved")} />
              <ActionButton label="Reject" tone="loss" onClick={() => onReviewChange("rejected")} />
            </>
          )}
          {pair.reviewState === "approved" && (
            <>
              <ActionButton label="Undo" onClick={() => onReviewChange("auto")} />
              <ActionButton label="Reject" tone="loss" onClick={() => onReviewChange("rejected")} />
            </>
          )}
          {pair.reviewState === "rejected" && (
            <ActionButton
              label="Restore"
              onClick={() => onReviewChange(pair.confidenceLabel === "Manual" ? "manually_matched" : "auto")}
            />
          )}
          {pair.reviewState === "manually_matched" && (
            <ActionButton label="Reject" tone="loss" onClick={() => onReviewChange("rejected")} />
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-muted">{pair.classifications.join(", ")}</td>
    </tr>
  );
}

function ActionButton({
  label,
  tone = "accent",
  onClick
}: {
  label: string;
  tone?: "accent" | "loss";
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-md border px-2 py-1 text-xs ${
        tone === "loss"
          ? "border-loss/60 text-loss hover:bg-loss/10"
          : "border-accent/60 text-accent hover:bg-accent/10"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SelectControl({
  label,
  value,
  options,
  labels,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.16em] text-muted">{label}</span>
      <select
        className="mt-2 w-full rounded-md border border-line bg-graphite px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-3 text-xl font-semibold">{value}</p>
    </div>
  );
}

function MetricSmall({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function formatValue(value: number | string | undefined, format: "currency" | "number" | "percent" | "label", signed = false) {
  if (typeof value === "string") return value;
  if (value === undefined || !Number.isFinite(value)) return "Insufficient data";
  const prefix = signed && value > 0 ? "+" : "";
  if (format === "currency") return `${prefix}${currency.format(value)}`;
  if (format === "percent") return `${prefix}${percent.format(value)}`;
  return `${prefix}${number.format(value)}`;
}

function formatNumber(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  return number.format(value);
}

function deltaStatus(delta: number | undefined, lowerIsBetter: boolean) {
  if (delta === undefined) return "Insufficient data";
  if (Math.abs(delta) < 0.005) return "Flat";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "Improved" : "Degraded";
}

function statusClass(status: string) {
  if (status === "Improved") return "border-accent/70 bg-accent/10 text-accent";
  if (status === "Degraded") return "border-loss/70 bg-loss/10 text-loss";
  if (status === "Flat") return "border-line bg-graphite text-muted";
  return "border-warning/70 bg-warning/10 text-warning";
}

function signedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${number.format(value)}`;
}

function signedCurrency(value: number) {
  return `${value > 0 ? "+" : ""}${currency.format(value)}`;
}

function buildFilterOptions(trades: NormalizedTrade[]) {
  return {
    symbols: unique(trades.map((trade) => trade.symbol)),
    setups: unique(trades.map((trade) => trade.setup ?? "Unspecified")),
    strategies: unique(trades.map((trade) => trade.strategy ?? "Unspecified"))
  };
}

function filterTrades(
  trades: NormalizedTrade[],
  filters: {
    symbol: string;
    side: string;
    setup: string;
    strategy: string;
    mode: TradeFilterMode;
  }
) {
  const medianCost = median(trades.map((trade) => trade.estimatedCosts));
  const losingTrades = trades.filter((trade) => trade.netPnl < 0);
  const averageLoss = losingTrades.length
    ? losingTrades.reduce((total, trade) => total + trade.netPnl, 0) / losingTrades.length
    : 0;

  return trades.filter((trade) => {
    if (filters.symbol && trade.symbol !== filters.symbol) return false;
    if (filters.side && trade.side !== filters.side) return false;
    if (filters.setup && (trade.setup ?? "Unspecified") !== filters.setup) return false;
    if (filters.strategy && (trade.strategy ?? "Unspecified") !== filters.strategy) return false;
    if (filters.mode === "winners" && trade.netPnl <= 0) return false;
    if (filters.mode === "losers" && trade.netPnl >= 0) return false;
    if (filters.mode === "highCost" && trade.estimatedCosts <= medianCost) return false;
    if (filters.mode === "largeLoss" && !(averageLoss < 0 && trade.netPnl < averageLoss * 2)) return false;
    return true;
  });
}

function sortTrades(trades: NormalizedTrade[], sortKey: TradeSortKey, sortDirection: "asc" | "desc") {
  return [...trades].sort((a, b) => {
    const left = a[sortKey] ?? "";
    const right = b[sortKey] ?? "";
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
    return sortDirection === "asc" ? comparison : -comparison;
  });
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function unique(values: string[]) {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function filterMatchedPairs(
  pairs: MatchedTradePair[],
  confidenceFilter: MatchConfidenceFilter,
  reviewFilter: MatchReviewFilter,
  showRejected: boolean
) {
  return pairs.filter((pair) => {
    if (!showRejected && pair.reviewState === "rejected" && reviewFilter !== "rejected") return false;
    if (confidenceFilter === "high" && pair.confidenceLabel !== "High") return false;
    if (confidenceFilter === "mediumPlus" && pair.confidenceLabel === "Low") return false;
    if (confidenceFilter === "low" && pair.confidenceLabel !== "Low") return false;
    if (reviewFilter === "active" && pair.reviewState === "rejected") return false;
    if (reviewFilter !== "active" && pair.reviewState !== reviewFilter) return false;
    return true;
  });
}

function confidenceClass(label: MatchedTradePair["confidenceLabel"]) {
  if (label === "High") return "border-accent/70 bg-accent/10 text-accent";
  if (label === "Medium") return "border-warning/70 bg-warning/10 text-warning";
  return "border-loss/70 bg-loss/10 text-loss";
}

function compactReasons(reasons: string[]) {
  return reasons
    .join(", ")
    .replace("Same symbol, Same side", "Same symbol, side")
    .replace("Same setup, Same strategy", "Same setup, strategy")
    .replace("Entry times within 30 minutes", "entry within 30m")
    .replace("Entry times within 60 minutes", "entry within 60m");
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function pairKey(pair: MatchedTradePair) {
  return `${pair.tradeA.id}::${pair.tradeB.id}`;
}

function reviewLabel(state: MatchedTradePair["reviewState"]) {
  if (state === "manually_matched") return "Manual";
  if (state === "approved") return "Approved";
  if (state === "rejected") return "Rejected";
  return "Auto";
}

function buildAuditedSummary(
  allPairs: MatchedTradePair[],
  activePairs: MatchedTradePair[],
  reportATradeCount: number,
  reportBTradeCount: number
) {
  const possiblePairs = Math.max(reportATradeCount, reportBTradeCount, 1);
  return {
    activeCount: activePairs.length,
    autoCount: allPairs.filter((pair) => pair.reviewState === "auto").length,
    approvedCount: allPairs.filter((pair) => pair.reviewState === "approved").length,
    rejectedCount: allPairs.filter((pair) => pair.reviewState === "rejected").length,
    manualCount: allPairs.filter((pair) => pair.reviewState === "manually_matched").length,
    averageConfidence: activePairs.length
      ? activePairs.reduce((total, pair) => total + pair.confidenceScore, 0) / activePairs.length
      : 0,
    coverage: activePairs.length / possiblePairs
  };
}

function buildAuditedAttribution(
  activePairs: MatchedTradePair[],
  summary: ReturnType<typeof buildAuditedSummary>
) {
  if (!activePairs.length) {
    return "Attribution recalculated using audited matches. No active matched pairs remain, so pair-level attribution is unavailable.";
  }

  const netDelta = activePairs.reduce((total, pair) => total + pair.netPnlDelta, 0);
  const costDelta = activePairs.reduce((total, pair) => total + pair.costDelta, 0);
  const rDeltas = activePairs
    .map((pair) => pair.realizedRDelta)
    .filter((value): value is number => value !== undefined);
  const averageRDelta = rDeltas.length ? rDeltas.reduce((total, value) => total + value, 0) / rDeltas.length : 0;
  const auditText = [
    "Attribution recalculated using audited matches.",
    summary.rejectedCount > 0 ? "Rejected matches were excluded from this analysis." : "",
    summary.manualCount > 0 ? "Manual matches were included as user-reviewed pairs." : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (costDelta < 0 && Math.abs(costDelta) > Math.abs(netDelta) * 0.25) {
    return `${auditText} Active matched trades improved mostly through lower execution costs.`;
  }
  if (averageRDelta > 0.1) {
    return `${auditText} Active matched trades improved mostly through better R-multiple capture.`;
  }
  if (netDelta > 0) {
    return `${auditText} Active matched trades show better net results after review.`;
  }
  if (netDelta < 0) {
    return `${auditText} Active matched trades deteriorated after review.`;
  }
  return `${auditText} Active matched trades are broadly flat after review.`;
}

function unmatchedTradesForManual(
  originalOnly: NormalizedTrade[],
  autoPairs: MatchedTradePair[],
  manualPairs: MatchedTradePair[],
  side: "A" | "B"
) {
  const rejectedTrades = autoPairs
    .filter((pair) => pair.reviewState === "rejected")
    .map((pair) => (side === "A" ? pair.tradeA : pair.tradeB));
  const usedManualIds = new Set(
    manualPairs
      .filter((pair) => pair.reviewState !== "rejected")
      .map((pair) => (side === "A" ? pair.tradeA.id : pair.tradeB.id))
  );

  return [...originalOnly, ...rejectedTrades].filter((trade) => !usedManualIds.has(trade.id));
}

function manualTradeLabel(trade: NormalizedTrade) {
  return `${trade.symbol} ${trade.side} ${trade.entryTime} ${currency.format(trade.netPnl)}`;
}

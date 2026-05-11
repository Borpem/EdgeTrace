import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { breakdownLabels, type BreakdownDimension } from "../lib/breakdowns";
import { getCollection } from "../lib/api";
import { getAttributionRow } from "../lib/collectionAttribution";
import type { ReportCollectionDetail } from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export function CollectionAttributionPage({
  collectionId,
  dimension,
  group,
  onBack
}: {
  collectionId: string;
  dimension: BreakdownDimension;
  group: string;
  onBack: () => void;
}) {
  const [collection, setCollection] = useState<ReportCollectionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getCollection(collectionId)
      .then(setCollection)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load attribution"));
  }, [collectionId]);

  const attribution = useMemo(
    () => (collection ? getAttributionRow(collection, dimension, group) : undefined),
    [collection, dimension, group]
  );

  return (
    <main className="EdgeTrace-shell py-10">
      <button className="mb-6 text-sm text-muted hover:text-accent" onClick={onBack}>
        Back to Strategy Set
      </button>
      {error && <div className="mb-5 rounded-md border border-loss/60 bg-loss/10 p-4 text-loss">{error}</div>}
      {!collection || !attribution ? (
        <section className="rounded-lg border border-line bg-panel p-8">
          <p className="font-semibold">Attribution data is unavailable</p>
          <p className="mt-2 text-sm text-muted">This strategy set may need reports with trade-level data.</p>
        </section>
      ) : (
        <>
          <section className="border-y border-white/[0.1] py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Strategy Set Attribution</p>
            <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[1] tracking-[-0.055em] text-ink md:text-6xl">
              {breakdownLabels[dimension]}: {group}
            </h1>
            <p className="mt-5 max-w-4xl text-base leading-7 text-muted">{attribution.interpretation}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <Metric label="Reports Seen" value={String(attribution.appearances)} />
              <Metric label="Total Trades" value={String(attribution.totalTrades)} />
              <Metric label="Net Delta" value={formatCurrency(attribution.netPnlDelta)} tone={(attribution.netPnlDelta ?? 0) >= 0 ? "accent" : "loss"} />
              <Metric label="Trend" value={attribution.trendDirection.replace("_", " ")} />
            </div>
          </section>

          <section className="mt-8 grid gap-4 xl:grid-cols-3">
            <AttributionChart title="Expectancy Over Reports" data={attribution.perReport} dataKey="expectancy" format="currency" />
            <AttributionChart title="Net PnL Over Reports" data={attribution.perReport} dataKey="netPnl" format="currency" />
            <AttributionChart title="Cost Drag Over Reports" data={attribution.perReport} dataKey="costDrag" format="percent" />
          </section>

          <section className="mt-8 rounded-lg border border-line bg-panel p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Per-Report Metrics</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-line text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Iteration</th>
                    <th className="px-3 py-2 font-medium">Report</th>
                    <th className="px-3 py-2 font-medium">Trades</th>
                    <th className="px-3 py-2 font-medium">Net PnL</th>
                    <th className="px-3 py-2 font-medium">Expectancy</th>
                    <th className="px-3 py-2 font-medium">Cost Drag</th>
                    <th className="px-3 py-2 font-medium">Average R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {attribution.perReport.map((point) => (
                    <tr key={point.reportId}>
                      <td className="px-3 py-2 text-muted">#{point.iteration}</td>
                      <td className="px-3 py-2 font-medium">{point.reportName}</td>
                      <td className="px-3 py-2">{point.totalTrades}</td>
                      <td className={point.netPnl >= 0 ? "px-3 py-2 text-accent" : "px-3 py-2 text-loss"}>{currency.format(point.netPnl)}</td>
                      <td className="px-3 py-2">{currency.format(point.expectancy)}</td>
                      <td className="px-3 py-2 text-warning">{point.costDrag === undefined ? "N/A" : percent.format(point.costDrag)}</td>
                      <td className="px-3 py-2 text-muted">{point.averageRealizedR?.toFixed(2) ?? "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8 rounded-lg border border-line bg-panel p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">
              Latest Report Trades Driving This Segment
            </p>
            {attribution.latestTrades.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No latest-report trades are available for this group.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Symbol</th>
                      <th className="px-3 py-2 font-medium">Side</th>
                      <th className="px-3 py-2 font-medium">Entry Time</th>
                      <th className="px-3 py-2 font-medium">Setup</th>
                      <th className="px-3 py-2 font-medium">Strategy</th>
                      <th className="px-3 py-2 font-medium">Costs</th>
                      <th className="px-3 py-2 font-medium">Net PnL</th>
                      <th className="px-3 py-2 font-medium">R</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {attribution.latestTrades.map((trade) => (
                      <tr key={trade.id}>
                        <td className="px-3 py-2 font-medium">{trade.symbol}</td>
                        <td className="px-3 py-2 text-muted">{trade.side}</td>
                        <td className="px-3 py-2 text-muted">{trade.entryTime}</td>
                        <td className="px-3 py-2 text-muted">{trade.setup ?? "Unspecified"}</td>
                        <td className="px-3 py-2 text-muted">{trade.strategy ?? "Unspecified"}</td>
                        <td className="px-3 py-2 text-warning">{currency.format(trade.estimatedCosts)}</td>
                        <td className={trade.netPnl >= 0 ? "px-3 py-2 text-accent" : "px-3 py-2 text-loss"}>{currency.format(trade.netPnl)}</td>
                        <td className="px-3 py-2 text-muted">{trade.realizedR?.toFixed(2) ?? "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function AttributionChart({
  title,
  data,
  dataKey,
  format
}: {
  title: string;
  data: Array<Record<string, string | number | undefined>>;
  dataKey: string;
  format: "currency" | "percent";
}) {
  return (
    <div className="EdgeTrace-card p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
          <XAxis dataKey="iteration" stroke="#9CA8C7" />
          <YAxis stroke="#9CA8C7" />
          <Tooltip
            contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }}
            formatter={(value) => (format === "currency" ? currency.format(Number(value)) : percent.format(Number(value)))}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.reportName ?? ""}
          />
          <Line type="monotone" dataKey={dataKey} stroke="#45D5FF" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "accent" | "loss" }) {
  return (
    <div className="rounded-md border border-line bg-graphite px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-semibold capitalize ${tone === "accent" ? "text-accent" : tone === "loss" ? "text-loss" : ""}`}>{value}</p>
    </div>
  );
}

function formatCurrency(value: number | undefined) {
  return value === undefined ? "N/A" : currency.format(value);
}

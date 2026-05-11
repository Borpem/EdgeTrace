import { useMemo, useState } from "react";
import {
  buildReconstructionAuditCsvRows,
  buildReconstructionAuditJson,
  downloadCsv,
  downloadJson,
  reconstructionAuditFilename,
  reconstructionTradeFilename
} from "../lib/exportUtils";
import { PaywallGate } from "../components/PaywallGate";
import type { DiagnosticsResult, NormalizedTrade } from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export function ReconstructionAuditPage({
  result,
  onBack
}: {
  result: DiagnosticsResult;
  onBack: () => void;
}) {
  const [expandedTradeId, setExpandedTradeId] = useState<string>();
  const reconstructedTrades = useMemo(
    () => result.trades.filter((trade) => trade.reconstructionMethod || trade.sourceExecutionIds?.length),
    [result.trades]
  );

  const totals = useMemo(
    () => ({
      trades: reconstructedTrades.length,
      executions: new Set(reconstructedTrades.flatMap((trade) => trade.sourceExecutionIds ?? [])).size,
      costs: reconstructedTrades.reduce((sum, trade) => sum + (trade.totalAllocatedCosts ?? trade.estimatedCosts), 0),
      warnings: new Set(reconstructedTrades.flatMap((trade) => trade.reconstructionWarnings ?? [])).size
    }),
    [reconstructedTrades]
  );

  if (
    result.accessLevel === "preview" ||
    result.accessLevel === "locked" ||
    (result.lockedSections ?? []).includes("reconstruction_audit")
  ) {
    return (
      <main className="EdgeTrace-shell py-10">
        <PaywallGate
          feature="reconstruction_audit"
          accessLevel="locked"
          title="Upgrade to review reconstruction lineage."
          description="Reconstruction audit shows which source executions created each completed trade and enables audit exports."
        />
        <button className="EdgeTrace-secondary-button mt-5" onClick={onBack}>
          Back to Dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="EdgeTrace-shell py-10">
      <section className="mb-8 flex flex-col gap-6 border-y border-white/[0.1] py-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Reconstruction Audit</p>
          <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[1] tracking-[-0.055em] text-ink md:text-6xl">{result.name ?? "Diagnostic report"}</h1>
          <p className="mt-5 max-w-4xl text-base leading-7 text-muted">
            Inspect how IBKR execution records were converted into completed trades.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reconstructedTrades.length > 0 && (
            <>
              <button
                className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
                onClick={() => downloadCsv(reconstructionAuditFilename(result, "csv"), buildReconstructionAuditCsvRows(result, reconstructedTrades))}
              >
                Download audit CSV
              </button>
              <button
                className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
                onClick={() => downloadJson(reconstructionAuditFilename(result, "json"), buildReconstructionAuditJson(result, reconstructedTrades))}
              >
                Download audit JSON
              </button>
            </>
          )}
          <button className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-accent" onClick={onBack}>
            Back to Dashboard
          </button>
        </div>
      </section>

      {!reconstructedTrades.length ? (
        <section className="rounded-lg border border-line bg-panel p-8">
          <h2 className="text-xl font-semibold">No reconstruction audit data is available for this report.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Reports created from generic CSVs or direct execution analysis do not include reconstruction metadata.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <AuditStat label="Reconstructed Trades" value={totals.trades} />
            <AuditStat label="Source Executions" value={totals.executions} />
            <AuditStat label="Allocated Costs" value={currency.format(totals.costs)} />
            <AuditStat label="Warning Types" value={totals.warnings} />
          </section>
          <p className="mt-3 text-sm text-muted">Exports are generated locally from the saved report data.</p>

          <section className="mt-6 overflow-x-auto rounded-lg border border-line">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-panel text-left text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Trade</th>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium">Entry Time</th>
                  <th className="px-4 py-3 font-medium">Exit Time</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Avg Entry</th>
                  <th className="px-4 py-3 font-medium">Avg Exit</th>
                  <th className="px-4 py-3 font-medium">Gross PnL</th>
                  <th className="px-4 py-3 font-medium">Entry Costs</th>
                  <th className="px-4 py-3 font-medium">Exit Costs</th>
                  <th className="px-4 py-3 font-medium">Total Costs</th>
                  <th className="px-4 py-3 font-medium">Net PnL</th>
                  <th className="px-4 py-3 font-medium">Entry Execs</th>
                  <th className="px-4 py-3 font-medium">Exit Execs</th>
                  <th className="px-4 py-3 font-medium">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {reconstructedTrades.map((trade) => (
                  <AuditRow
                    key={trade.id}
                    trade={trade}
                    expanded={expandedTradeId === trade.id}
                    onToggle={() => setExpandedTradeId(expandedTradeId === trade.id ? undefined : trade.id)}
                    report={result}
                  />
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function AuditRow({
  trade,
  expanded,
  onToggle,
  report
}: {
  trade: NormalizedTrade;
  expanded: boolean;
  onToggle: () => void;
  report: DiagnosticsResult;
}) {
  const warnings = trade.reconstructionWarnings ?? [];
  const sourceExecutionIds = trade.sourceExecutionIds ?? [];
  return (
    <>
      <tr className="cursor-pointer hover:bg-line/30" onClick={onToggle}>
        <td className="px-4 py-3 text-accent">{expanded ? "Hide" : "Review"}</td>
        <td className="px-4 py-3 font-medium">{trade.symbol}</td>
        <td className="px-4 py-3 text-muted">{trade.side}</td>
        <td className="px-4 py-3 text-muted">{trade.entryTime}</td>
        <td className="px-4 py-3 text-muted">{trade.exitTime ?? "N/A"}</td>
        <td className="px-4 py-3">{number.format(trade.quantity)}</td>
        <td className="px-4 py-3">{currency.format(trade.averageEntryPrice ?? trade.entryPrice)}</td>
        <td className="px-4 py-3">{trade.averageExitPrice === undefined ? "N/A" : currency.format(trade.averageExitPrice)}</td>
        <td className="px-4 py-3">{currency.format(trade.grossPnl)}</td>
        <td className="px-4 py-3 text-warning">{currency.format(trade.allocatedEntryCosts ?? 0)}</td>
        <td className="px-4 py-3 text-warning">{currency.format(trade.allocatedExitCosts ?? 0)}</td>
        <td className="px-4 py-3 text-warning">{currency.format(trade.totalAllocatedCosts ?? trade.estimatedCosts)}</td>
        <td className={trade.netPnl >= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>
          {currency.format(trade.netPnl)}
        </td>
        <td className="px-4 py-3 text-muted">{trade.entryExecutionCount ?? "N/A"}</td>
        <td className="px-4 py-3 text-muted">{trade.exitExecutionCount ?? "N/A"}</td>
        <td className="px-4 py-3 text-muted">{warnings.length}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={16} className="bg-graphite px-4 py-5">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
              <div className="rounded-lg border border-line bg-panel p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-semibold">Audit Detail</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent"
                      onClick={(event) => {
                        event.stopPropagation();
                        downloadCsv(reconstructionTradeFilename(trade, "csv"), buildReconstructionAuditCsvRows(report, [trade]));
                      }}
                    >
                      Export this trade CSV
                    </button>
                    <button
                      className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent"
                      onClick={(event) => {
                        event.stopPropagation();
                        downloadJson(reconstructionTradeFilename(trade, "json"), buildReconstructionAuditJson(report, [trade]));
                      }}
                    >
                      Export this trade JSON
                    </button>
                  </div>
                </div>
                <Detail label="Source execution IDs" value={sourceExecutionIds.join(", ") || "N/A"} />
                <Detail label="Reconstruction method" value={trade.reconstructionMethod ?? "N/A"} />
                <Detail label="Entry / exit executions" value={`${trade.entryExecutionCount ?? "N/A"} / ${trade.exitExecutionCount ?? "N/A"}`} />
                <Detail label="Allocated entry costs" value={currency.format(trade.allocatedEntryCosts ?? 0)} />
                <Detail label="Allocated exit costs" value={currency.format(trade.allocatedExitCosts ?? 0)} />
                <Detail label="Total allocated costs" value={currency.format(trade.totalAllocatedCosts ?? trade.estimatedCosts)} />
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">Warnings</p>
                  {warnings.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-warning">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">No reconstruction warnings for this trade.</p>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="min-w-full divide-y divide-line text-sm">
                  <thead className="bg-panel text-left text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Execution Time</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 font-medium">Position Before</th>
                      <th className="px-3 py-2 font-medium">Position After</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(trade.positionPath ?? []).map((step, index) => (
                      <tr key={`${step.executionTime}-${index}`}>
                        <td className="px-3 py-2 text-muted">{step.executionTime}</td>
                        <td className="px-3 py-2">{step.action}</td>
                        <td className="px-3 py-2">{number.format(step.quantity)}</td>
                        <td className="px-3 py-2">{currency.format(step.price)}</td>
                        <td className="px-3 py-2 text-muted">{number.format(step.positionBefore)}</td>
                        <td className="px-3 py-2 text-muted">{number.format(step.positionAfter)}</td>
                        <td className="px-3 py-2 text-accent">{step.role}</td>
                      </tr>
                    ))}
                    {!trade.positionPath?.length && (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-muted">
                          No position path metadata available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AuditStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 break-words text-sm">{value}</p>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
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
import { AddToStrategySetDialog } from "../components/AddToStrategySetDialog";
import { DisclosurePanel } from "../components/DisclosurePanel";
import { CommandPath } from "../components/onboarding/CommandPath";
import { PaywallGate } from "../components/PaywallGate";
import { formatReportType, ReportDetailsEditor } from "../components/ReportDetailsEditor";
import { TableContainer } from "../components/ui/Primitives";
import { MetricFlowGraphic } from "../components/visuals/MetricFlowGraphic";
import { trackEvent } from "../lib/analytics";
import { getActivationSummary } from "../lib/api";
import {
  breakdownLabels,
  buildBreakdown,
  findLargestLeak,
  findStrongestSegment,
  type BreakdownDimension,
  type BreakdownRow
} from "../lib/breakdowns";
import { costDragSortValue } from "../lib/costDrag";
import { canUseFeature, canViewFullDrilldown, getPlanConfig, getReportAccessLevel } from "../lib/entitlements";
import { buildReportIntelligence, type MetricStatus } from "../lib/reportIntelligence";
import type { ActivationSummary, DiagnosticsResult, NormalizedTrade, ReportSummary, UserProfile } from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type SortKey = keyof Pick<NormalizedTrade, "symbol" | "side" | "entryTime" | "grossPnl" | "netPnl" | "realizedR">;
type BreakdownSortKey =
  | "totalTrades"
  | "winRate"
  | "netPnl"
  | "expectancy"
  | "averageRealizedR"
  | "costDragPct";
type DashboardTab = "overview" | "breakdown" | "charts" | "trades";

export function DashboardPage({
  result,
  profile,
  onDrillDown,
  onReconstructionAudit,
  onReportUpdated,
  onCompareReport,
  onViewReports,
  onCreateReport,
  reportJustCreated,
  onDismissCreatedBanner,
  demoMode,
  onExitDemo
}: {
  result: DiagnosticsResult;
  profile?: UserProfile | null;
  onDrillDown?: (selection: { dimension: BreakdownDimension; group: string }) => void;
  onReconstructionAudit?: () => void;
  onReportUpdated?: (report: ReportSummary) => void;
  onCompareReport?: (reportId: string) => void;
  onViewReports?: () => void;
  onCreateReport?: () => void;
  reportJustCreated?: boolean;
  onDismissCreatedBanner?: () => void;
  demoMode?: boolean;
  onExitDemo?: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("entryTime");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [breakdownDimension, setBreakdownDimension] = useState<BreakdownDimension>("symbol");
  const [breakdownSortKey, setBreakdownSortKey] = useState<BreakdownSortKey>("netPnl");
  const [breakdownSortDirection, setBreakdownSortDirection] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isAddingToStrategySet, setIsAddingToStrategySet] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [activation, setActivation] = useState<ActivationSummary | null>(null);
  const [calculationOpen, setCalculationOpen] = useState(false);
  const trades = Array.isArray(result.trades) ? result.trades : [];
  const charts = result.charts ?? { equityCurve: [], pnlBySymbol: [], pnlByHour: [] };
  const metrics = result.metrics ?? {
    totalTrades: trades.length,
    winRate: 0,
    grossPnl: 0,
    totalCosts: 0,
    netPnl: 0,
    averageWin: 0,
    averageLoss: 0,
    profitFactor: 0,
    expectancy: 0,
    grossExpectancy: 0,
    averageRealizedR: undefined
  };
  const safeResult = useMemo(() => ({ ...result, trades, charts, metrics }), [charts, metrics, result, trades]);

  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      const left = a[sortKey] ?? "";
      const right = b[sortKey] ?? "";
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [sortDirection, sortKey, trades]);

  const breakdownRows = useMemo(() => {
    return buildBreakdown(trades, breakdownDimension).sort((a, b) => {
      const left =
        breakdownSortKey === "costDragPct" ? costDragSortValue(a.costDrag) : (a[breakdownSortKey] ?? -Infinity);
      const right =
        breakdownSortKey === "costDragPct" ? costDragSortValue(b.costDrag) : (b[breakdownSortKey] ?? -Infinity);
      const comparison = left - right;
      return breakdownSortDirection === "asc" ? comparison : -comparison;
    });
  }, [breakdownDimension, breakdownSortDirection, breakdownSortKey, trades]);

  const largestLeak = useMemo(() => findLargestLeak(breakdownRows), [breakdownRows]);
  const strongestSegment = useMemo(() => findStrongestSegment(breakdownRows), [breakdownRows]);
  const intelligence = useMemo(() => buildReportIntelligence(safeResult), [safeResult]);
  const plan = getPlanConfig(profile?.planId);
  const reportAccessLevel = getReportAccessLevel(
    plan,
    reportJustCreated || activation?.firstReportCreatedAt === result.createdAt ? 0 : 1,
    result
  );
  const canInspectFullDrilldown = reportAccessLevel === "full" && canViewFullDrilldown(plan);
  const fullAttributionAccess =
    canInspectFullDrilldown && !(result.lockedSections ?? []).some((section) => ["full_breakdowns", "full_drilldowns"].includes(section));
  const fullTradeAccess =
    reportAccessLevel === "full" && !(result.lockedSections ?? []).some((section) => ["full_trades"].includes(section));
  const canViewReconstructionAudit = reportAccessLevel === "full" && canUseFeature(plan, "reconstruction_audit");
  const hasReconstructionAudit = useMemo(
    () => trades.some((trade) => trade.reconstructionMethod || trade.sourceExecutionIds?.length),
    [trades]
  );
  const primaryInspection = intelligence.nextBestInspections[0];
  const provenance = result.importProvenance;
  const costsIncluded = provenance?.costsDetected ?? (trades.some((trade) => getTradeCosts(trade) > 0) || metrics.totalCosts > 0);
  const rValuesAvailable =
    provenance?.rMultipleDetected ?? (trades.some((trade) => typeof trade.realizedR === "number") || metrics.averageRealizedR !== undefined);
  const reconstructionUsed = provenance?.reconstructionEnabled ?? hasReconstructionAudit;
  const firstReportReady =
    Boolean(reportJustCreated) &&
    (activation ? !activation.firstReportCreatedAt || activation.firstReportCreatedAt === result.createdAt : true);
  const calculationRows = provenance
    ? [
        ["Source file", provenance.originalFilename ?? "Unavailable"],
        ["Broker/import source", provenance.brokerDisplayName ?? provenance.selectedSource ?? provenance.detectedSource ?? "Unavailable"],
        [
          "Import confidence",
          `${provenance.confidenceLabel ?? "Unavailable"}${
            typeof provenance.detectionConfidence === "number" ? ` · ${Math.round(provenance.detectionConfidence)}%` : ""
          }`
        ],
        ["Trades analyzed", String(provenance.normalizedTradeCount ?? metrics.totalTrades ?? trades.length)],
        ["Rows excluded", String(provenance.excludedRowCount ?? 0)],
        ["Costs detected", provenance.costsDetected ? "Yes" : "No"],
        ["R-multiple available", provenance.rMultipleDetected ? "Yes" : "No"],
        ["Reconstruction used", provenance.reconstructionEnabled ? "Yes" : "No"],
        ["Warnings", String(provenance.warningCount ?? provenance.warnings?.length ?? 0)],
        ["Created timestamp", result.createdAt ? new Date(result.createdAt).toLocaleString() : "Unavailable"]
      ]
    : [
        ["Import provenance", "Import provenance was not stored for this older report."],
        ["Trades analyzed", String(metrics.totalTrades ?? trades.length)],
        ["Costs included", costsIncluded ? "Yes" : "No"],
        ["R values", rValuesAvailable ? "Imported or calculated from available risk data" : "Unavailable from this import"],
        ["Execution reconstruction", hasReconstructionAudit ? "Yes" : "No"],
        ["Report timestamp", result.createdAt ? new Date(result.createdAt).toLocaleString() : "Unavailable"],
        ["Report source", hasReconstructionAudit ? "Broker execution records reconstructed into trades" : "Uploaded completed trade records"]
      ];

  useEffect(() => {
    let active = true;
    void getActivationSummary()
      .then((summary) => {
        if (active) setActivation(summary);
      })
      .catch(() => {
        if (active) setActivation(null);
      });
    return () => {
      active = false;
    };
  }, [result.id]);

  const inspectPrimarySegment = () => {
    if (!primaryInspection) return;
    if (!canInspectFullDrilldown) {
      window.history.pushState(null, "", "/pricing");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    trackEvent("drilldown_opened", {
      reportId: result.id,
      dimension: primaryInspection.dimension,
      group: primaryInspection.group
    });
    onDrillDown?.({ dimension: primaryInspection.dimension, group: primaryInspection.group });
  };

  const workflowAction = useMemo(() => {
    if (!activation?.hasClickedDrilldown && primaryInspection) {
      return {
        title: "Inspect the weakest segment",
        why: "Drilldowns show the exact trades behind the primary leak.",
        button: "Inspect Weakest Segment",
        action: inspectPrimarySegment
      };
    }
    if (!activation?.hasCreatedComparison && onCompareReport) {
      return {
        title: "Compare this report",
        why: "Comparisons show whether changes improved or degraded performance.",
        button: "Compare This Report",
        action: () => onCompareReport(result.id)
      };
    }
    if (!activation?.hasCreatedCollection) {
      return {
        title: "Add to strategy set",
        why: "Strategy sets track performance across related iterations.",
        button: "Add to Strategy Set",
        action: () => setIsAddingToStrategySet(true)
      };
    }
    return undefined;
  }, [activation, onCompareReport, primaryInspection, result.id]);

  const metricCards: Array<[string, string, MetricStatus]> = [
    ["Net PnL", currency.format(metrics.netPnl), intelligence.keyMetricStatuses.netPnl],
    ["Expectancy", currency.format(metrics.expectancy), intelligence.keyMetricStatuses.expectancy],
    ["Average R", metrics.averageRealizedR?.toFixed(2) ?? "Unavailable", intelligence.keyMetricStatuses.averageR],
    ["Cost Drag", intelligence.costDragLabel, intelligence.keyMetricStatuses.costDrag],
    ["Profit Factor", formatNumber(metrics.profitFactor), intelligence.keyMetricStatuses.profitFactor],
    ["Win Rate", percent.format(metrics.winRate), intelligence.keyMetricStatuses.winRate]
  ];

  const sort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortBreakdown = (key: BreakdownSortKey) => {
    if (breakdownSortKey === key) {
      setBreakdownSortDirection(breakdownSortDirection === "asc" ? "desc" : "asc");
    } else {
      setBreakdownSortKey(key);
      setBreakdownSortDirection("desc");
    }
  };

  return (
    <main className="EdgeTrace-shell py-10">
      <section className="EdgeTrace-page-header mb-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <h1 className="max-w-5xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-6xl">
              {result.name ?? "Diagnostic Report"}
            </h1>
            <p className="mt-5 max-w-4xl text-base leading-7 text-muted">
              A report is a single diagnostic analysis generated from one uploaded trade file. This summary-first readout
              keeps detailed breakdowns one click away.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="border border-white/[0.12] px-2.5 py-1 text-xs text-muted">
                {formatReportType(result.reportType)}
              </span>
              {result.strategyLabel && (
                <span className="border border-accent/50 px-2.5 py-1 text-xs text-accent">
                  {result.strategyLabel}
                </span>
              )}
              {(result.tags ?? []).slice(0, 4).map((tag) => (
                <span key={tag} className="border border-white/[0.12] px-2.5 py-1 text-xs text-muted">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {onCompareReport && (
                <button className="EdgeTrace-compact-primary" onClick={() => onCompareReport(result.id)}>
                  Compare This Report
                </button>
              )}
              <button className="EdgeTrace-compact-secondary" onClick={() => setIsAddingToStrategySet(true)}>
                Add to Strategy Set
              </button>
              {onViewReports && (
                <button className="EdgeTrace-compact-secondary" onClick={onViewReports}>
                  View All Reports
                </button>
              )}
              {onCreateReport && (
                <button className="border-b border-transparent py-2 text-sm font-semibold text-muted hover:border-white/20 hover:text-ink" onClick={onCreateReport}>
                  Create New Report
                </button>
              )}
            </div>
          </div>

          <div className="EdgeTrace-card-soft p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Current Report</p>
            <div className="mt-4 border border-white/[0.12] bg-black/30 px-4 py-3">
              <p className="truncate text-sm font-semibold text-ink">{result.name ?? result.id}</p>
              <p className="mt-1 text-xs text-muted">
                {result.createdAt ? new Date(result.createdAt).toLocaleString() : "Date unavailable"}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="EdgeTrace-compact-primary" onClick={() => setIsEditingDetails(true)}>
                Edit Details
              </button>
              {hasReconstructionAudit && (
                <button
                  className="EdgeTrace-compact-secondary"
                  onClick={() => {
                    if (!canViewReconstructionAudit) {
                      window.history.pushState(null, "", "/pricing");
                      window.dispatchEvent(new PopStateEvent("popstate"));
                      return;
                    }
                    trackEvent("reconstruction_audit_opened", { reportId: result.id });
                    onReconstructionAudit?.();
                  }}
                >
                  Audit
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {reportJustCreated && (
        <section className="mt-6 border border-profit/35 bg-profit/[0.08] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-profit">Report Created</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-ink">
                Diagnostic report created successfully.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Start with the primary diagnosis, then inspect the recommended segment.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="EdgeTrace-command-button"
                onClick={() => document.getElementById("primary-diagnosis")?.scrollIntoView({ behavior: "smooth", block: "center" })}
              >
                View Primary Diagnosis
              </button>
              {onDismissCreatedBanner && (
                <button className="EdgeTrace-compact-secondary" onClick={onDismissCreatedBanner}>
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {firstReportReady && (
        <section className="mt-6 border border-cyan/35 bg-cyan/[0.06] p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">First Report</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-ink">Your first report is ready.</h2>
              <ol className="mt-3 grid gap-2 text-sm leading-6 text-muted md:grid-cols-3">
                <li>1. Review the primary diagnosis.</li>
                <li>2. Inspect the weakest segment.</li>
                <li>3. Create another report later to compare progress.</li>
              </ol>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="EdgeTrace-command-button" onClick={inspectPrimarySegment} disabled={!primaryInspection}>
                Inspect Weakest Segment
              </button>
              {onCreateReport && (
                <button className="EdgeTrace-compact-secondary" onClick={onCreateReport}>
                  Create Another Report
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {(!costsIncluded || !rValuesAvailable || hasReconstructionAudit) && (
        <section className="mt-6 grid gap-3 md:grid-cols-3">
          {!costsIncluded && (
            <ReportWarning message="Cost data was not detected. Net performance may be overstated." />
          )}
          {!rValuesAvailable && (
            <ReportWarning message="R-multiple analysis is limited because stop/risk data was not available." />
          )}
          {reconstructionUsed && (
            <ReportWarning message="This report uses reconstructed trades from execution records. Review the reconstruction audit if results look unexpected." />
          )}
        </section>
      )}

      <section
        id="primary-diagnosis"
        className="EdgeTrace-card relative mt-8 scroll-mt-28 overflow-hidden p-6 shadow-[0_28px_100px_-76px_rgba(88,214,255,0.82)] md:p-8"
        data-testid="dashboard-health-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(88,214,255,0.12),transparent_25rem),radial-gradient(circle_at_4%_100%,rgba(255,184,77,0.08),transparent_22rem)]" />
        <div className="relative grid gap-8 xl:grid-cols-[320px_minmax(0,1fr)_360px] xl:items-stretch">
          <aside className="border-b border-white/[0.08] pb-6 xl:border-b-0 xl:border-r xl:pr-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">Strategy Health</p>
            <p className={`mt-5 text-8xl font-semibold leading-none tracking-[-0.08em] ${scoreClass(intelligence.strategyHealthScore)}`}>
              {intelligence.strategyHealthScore}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">{intelligence.healthBand}</p>
            <p className="mt-4 text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
            <div className="mt-6 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts.equityCurve}>
                  <CartesianGrid stroke="#272727" strokeOpacity={0.45} vertical={false} />
                  <XAxis dataKey="trade" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "#101010", border: "1px solid #272727" }}
                    formatter={(value) => [formatTooltipCurrency(value), "Equity"]}
                  />
                  <Line type="monotone" dataKey="equity" stroke="#58D6FF" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </aside>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning">Primary Diagnosis</p>
            <h2 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.03] tracking-[-0.055em] text-ink md:text-5xl">
              {intelligence.primaryDiagnosis}
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted">{intelligence.primaryLeak.explanation}</p>
            <div className="mt-7 max-w-3xl border-l border-warning/45 pl-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Supporting Metric</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">
                {intelligence.primaryLeak.supportingMetric}
              </p>
            </div>
          </div>

          <aside className="border-t border-white/[0.08] pt-6 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">Next Inspection</p>
            {primaryInspection ? (
              <>
                <h3 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.045em] text-ink">
                  {primaryInspection.title}
                </h3>
                <p className="mt-4 text-sm leading-6 text-muted">{primaryInspection.reason}</p>
                <p className="mt-4 text-sm font-semibold text-cyan">{primaryInspection.metric}</p>
                <button className="EdgeTrace-command-button mt-6 w-full" onClick={inspectPrimarySegment}>
                  Inspect this segment
                </button>
              </>
            ) : (
              <>
                <h3 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.045em] text-ink">
                  No drilldown priority yet
                </h3>
                <p className="mt-4 text-sm leading-6 text-muted">
                  This report does not have enough segment evidence for a confident next inspection.
                </p>
              </>
            )}
          </aside>
        </div>
      </section>

      <section className="hidden">
        <button
          className="flex w-full items-center justify-between gap-4 p-4 text-left"
          type="button"
          onClick={() => setCalculationOpen((current) => !current)}
        >
          <div>
            <p className="text-sm font-semibold text-ink">How this report was calculated</p>
            <p className="mt-1 text-xs text-muted">
              {metrics.totalTrades ?? trades.length} trades analyzed · Costs {costsIncluded ? "included" : "not detected"} · R values{" "}
              {rValuesAvailable ? "available" : "limited"}
            </p>
          </div>
          <span className="text-sm font-semibold text-cyan">{calculationOpen ? "Hide" : "Show"}</span>
        </button>
        {calculationOpen && (
          <div className="border-t border-white/[0.1] p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {calculationRows.map(([label, value]) => (
                <div key={label} className="border border-white/[0.08] bg-black/25 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
                  <p className="mt-1 text-sm text-ink">{value}</p>
                </div>
              ))}
            </div>
            {provenance?.reconstructionSummary && (
              <div className="mt-3 border border-white/[0.08] bg-black/25 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Reconstruction summary</p>
                <p className="mt-1 text-sm leading-6 text-ink">
                  {provenance.reconstructionSummary.rawExecutions ?? 0} executions ·{" "}
                  {provenance.reconstructionSummary.completedTrades ?? 0} completed trades ·{" "}
                  {provenance.reconstructionSummary.openPositions ?? 0} open positions excluded ·{" "}
                  {provenance.reconstructionSummary.partialExits ?? 0} partial exits ·{" "}
                  {provenance.reconstructionSummary.positionFlips ?? 0} flips
                </p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              EdgeTrace stores normalized diagnostics and import metadata, not the original raw CSV.
            </p>
          </div>
        )}
      </section>

      <DisclosurePanel
        className="hidden"
        compact
        title="What cost drag and R capture mean"
        subtitle="Open for metric definitions."
      >
        <div className="grid gap-3 text-sm leading-6 text-muted md:grid-cols-2">
          <p>Cost drag estimates how much execution costs reduce gross performance before it reaches net results.</p>
          <p>R capture measures realized reward relative to risk when risk data is available or can be inferred.</p>
        </div>
      </DisclosurePanel>

      <CommandPath
        className="hidden"
        context="report"
        onAnalyze={onCreateReport}
        onDashboard={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onInspectLeak={inspectPrimarySegment}
        onCompare={() => onCompareReport?.(result.id)}
        onCreateStrategySet={() => setIsAddingToStrategySet(true)}
      />

      <section className="hidden">
        <div
          className="EdgeTrace-card relative overflow-hidden p-7 md:p-8"
          data-testid="dashboard-health-card-legacy"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_28%,rgba(61,220,151,0.13),transparent_17rem)]" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy Health</p>
            <div className="mt-7 flex flex-col gap-7 md:flex-row md:items-end">
              <div>
                <p className={`text-8xl font-semibold leading-none tracking-[-0.08em] ${scoreClass(intelligence.strategyHealthScore)}`}>
                  {intelligence.strategyHealthScore}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">{intelligence.healthBand}</p>
              </div>
              <p className="max-w-3xl pb-1 text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
            </div>
            <div className="mt-8 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts.equityCurve}>
                  <CartesianGrid stroke="#272727" strokeOpacity={0.7} vertical={false} />
                  <XAxis dataKey="trade" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "#101010", border: "1px solid #272727" }}
                    formatter={(value) => [formatTooltipCurrency(value), "Equity"]}
                  />
                  <Line type="monotone" dataKey="equity" stroke="#58D6FF" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div id="primary-diagnosis-legacy" className="EdgeTrace-card scroll-mt-28 p-7 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">Primary Diagnosis</p>
          <h2 className="mt-7 text-3xl font-semibold tracking-[-0.055em] text-ink">{intelligence.primaryDiagnosis}</h2>
          <p className="mt-5 text-sm leading-6 text-muted">{intelligence.primaryLeak.explanation}</p>
          <div className="mt-8 border border-white/[0.1] bg-black/24 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Supporting Metric</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">
              {intelligence.primaryLeak.supportingMetric}
            </p>
          </div>
          {primaryInspection && (
            <button
              className="EdgeTrace-recommended mt-4 w-full border border-white/[0.1] bg-black/24 p-5 text-left hover:border-accent/70"
              onClick={inspectPrimarySegment}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Next Inspection</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">{primaryInspection.title}</p>
              <p className="mt-1 text-sm text-muted">{primaryInspection.reason}</p>
            </button>
          )}
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        <DashboardSummaryCard
          label="After-cost performance"
          value={currency.format(metrics.netPnl)}
          detail={`Expectancy ${currency.format(metrics.expectancy)} per trade`}
          tone={metrics.netPnl >= 0 ? "text-profit" : "text-loss"}
        />
        <DashboardSummaryCard
          label="Execution friction"
          value={intelligence.costDragLabel}
          detail={`Total costs ${currency.format(metrics.totalCosts)}`}
          tone={intelligence.keyMetricStatuses.costDrag === "weak" ? "text-warning" : "text-cyan"}
        />
        <DashboardSummaryCard
          label="Trade quality"
          value={metrics.averageRealizedR !== undefined ? `${number.format(metrics.averageRealizedR)}R` : "N/A"}
          detail={`Win rate ${percent.format(metrics.winRate)} · PF ${formatNumber(metrics.profitFactor)}`}
          tone="text-ink"
        />
      </section>

      <section className="mt-7 border border-cyan/18 bg-cyan/[0.035] p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">Recommended next steps</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-ink">What should happen next?</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Start with the recommended inspection, then compare or organize this report once the primary leak is understood.
            </p>
          </div>
          {workflowAction && (
            <button className="EdgeTrace-command-button shrink-0" onClick={workflowAction.action}>
              {workflowAction.button}
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {primaryInspection && (
            <button
              className="border border-cyan/25 bg-black/22 p-4 text-left hover:border-cyan/60"
              onClick={inspectPrimarySegment}
            >
              <p className="font-semibold text-ink">Inspect weakest segment</p>
              <p className="mt-1 text-sm leading-6 text-muted">{primaryInspection.title}</p>
              <p className="mt-2 text-sm text-cyan">{primaryInspection.metric}</p>
            </button>
          )}
          {onCompareReport && (
            <button
              className="border border-white/[0.08] bg-black/18 p-4 text-left hover:border-accent/55"
              onClick={() => onCompareReport(result.id)}
            >
              <p className="font-semibold text-ink">Compare this report</p>
              <p className="mt-1 text-sm leading-6 text-muted">See what improved, degraded, or leaked versus another report.</p>
              <p className="mt-2 text-sm text-accent">Open comparison</p>
            </button>
          )}
          <button
            className="border border-white/[0.08] bg-black/18 p-4 text-left hover:border-accent/55"
            onClick={() => setIsAddingToStrategySet(true)}
          >
            <p className="font-semibold text-ink">Add to strategy set</p>
            <p className="mt-1 text-sm leading-6 text-muted">Group this report with related iterations for monitoring.</p>
            <p className="mt-2 text-sm text-accent">Organize iteration</p>
          </button>
          {hasReconstructionAudit && (
            <button
              className="border border-white/[0.08] bg-black/18 p-4 text-left hover:border-accent/55"
              onClick={() => {
                trackEvent("reconstruction_audit_opened", { reportId: result.id });
                onReconstructionAudit?.();
              }}
            >
              <p className="font-semibold text-ink">Review reconstruction audit</p>
              <p className="mt-1 text-sm leading-6 text-muted">Confirm which broker executions formed each completed trade.</p>
              <p className="mt-2 text-sm text-accent">Audit lineage</p>
            </button>
          )}
        </div>
      </section>

      <CommandPath
        className="mt-5"
        context="report"
        onAnalyze={onCreateReport}
        onDashboard={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onInspectLeak={inspectPrimarySegment}
        onCompare={() => onCompareReport?.(result.id)}
        onCreateStrategySet={() => setIsAddingToStrategySet(true)}
      />

      <section className="mt-10 flex flex-wrap gap-2 border-b border-white/[0.08]">
        {(["overview", "breakdown", "charts", "trades"] as DashboardTab[]).map((tab) => (
          <button
            key={tab}
            className={`border-b px-3 pb-3 pt-1 text-sm font-semibold capitalize ${
              activeTab === tab ? "border-cyan text-ink" : "border-transparent text-muted hover:border-white/20 hover:text-ink"
            }`}
            onClick={() => {
              setActiveTab(tab);
              trackEvent("report_tab_opened", { reportId: result.id, tab });
            }}
          >
            {tab}
          </button>
        ))}
      </section>

      {activeTab === "overview" && (
        <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div className="border border-white/[0.1] bg-white/[0.025] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Primary Leak</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">{intelligence.primaryLeak.title}</h2>
            <p className="mt-4 text-sm leading-6 text-muted">{intelligence.primaryLeak.explanation}</p>
            <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
              <MetricMini label="Supporting Metric" value={intelligence.primaryLeak.supportingMetric} />
              <MetricMini label="Recommended Next Step" value={intelligence.primaryLeak.recommendedInspection} />
            </div>
          </div>

          <div className="grid gap-3">
            <MetricFlowGraphic />
            <section className="border border-white/[0.08] bg-white/[0.018]">
              <button
                className="flex w-full items-center justify-between gap-4 p-4 text-left"
                type="button"
                onClick={() => setCalculationOpen((current) => !current)}
              >
                <div>
                  <p className="text-sm font-semibold text-ink">How this report was calculated</p>
                  <p className="mt-1 text-xs text-muted">
                    {metrics.totalTrades ?? trades.length} trades analyzed · Costs {costsIncluded ? "included" : "not detected"} · R values{" "}
                    {rValuesAvailable ? "available" : "limited"}
                  </p>
                </div>
                <span className="text-sm font-semibold text-cyan">{calculationOpen ? "Hide" : "Show"}</span>
              </button>
              {calculationOpen && (
                <div className="border-t border-white/[0.08] p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    {calculationRows.map(([label, value]) => (
                      <div key={label} className="border border-white/[0.06] bg-black/20 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
                        <p className="mt-1 text-sm text-ink">{value}</p>
                      </div>
                    ))}
                  </div>
                  {provenance?.reconstructionSummary && (
                    <div className="mt-3 border border-white/[0.06] bg-black/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Reconstruction summary</p>
                      <p className="mt-1 text-sm leading-6 text-ink">
                        {provenance.reconstructionSummary.rawExecutions ?? 0} executions ·{" "}
                        {provenance.reconstructionSummary.completedTrades ?? 0} completed trades ·{" "}
                        {provenance.reconstructionSummary.openPositions ?? 0} open positions excluded ·{" "}
                        {provenance.reconstructionSummary.partialExits ?? 0} partial exits ·{" "}
                        {provenance.reconstructionSummary.positionFlips ?? 0} flips
                      </p>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-muted">
                    EdgeTrace stores normalized diagnostics and import metadata, not the original raw CSV.
                  </p>
                </div>
              )}
            </section>
            <DisclosurePanel compact title="What cost drag and R capture mean" subtitle="Metric definitions.">
              <div className="grid gap-3 text-sm leading-6 text-muted md:grid-cols-2">
                <p>Cost drag estimates how much execution costs reduce gross performance before it reaches net results.</p>
                <p>R capture measures realized reward relative to risk when risk data is available or can be inferred.</p>
              </div>
            </DisclosurePanel>
          </div>
        </section>
      )}

      {activeTab === "charts" && (
      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <ChartPanel title="Equity Curve">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={charts.equityCurve}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="trade" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip
                contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }}
                formatter={(value) => [formatTooltipCurrency(value), "Equity"]}
              />
              <Line type="monotone" dataKey="equity" stroke="#45D5FF" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="PnL by Symbol">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.pnlBySymbol}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="symbol" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Bar dataKey="pnl" fill="#3E8BFF" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="PnL by Time of Day">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts.pnlByHour}>
              <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
              <XAxis dataKey="hour" stroke="#9CA8C7" />
              <YAxis stroke="#9CA8C7" />
              <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
              <Bar dataKey="pnl" fill="#FFB84D" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>
      )}

      {activeTab === "breakdown" && (
      <PaywallGate
        feature="advanced_attribution"
        accessLevel={fullAttributionAccess ? "full" : "preview"}
        title="Upgrade to Pro to unlock the full attribution breakdown."
        description="EdgeTrace detected a performance leak. Pro shows which symbols, setups, and time windows contributed most."
      >
      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-accent">Strategy Health</p>
            <h2 className="mt-2 text-2xl font-semibold">Breakdown analytics</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["symbol", "setup", "strategy", "timeOfDay"] as BreakdownDimension[]).map((dimension) => (
              <button
                key={dimension}
                className={`rounded-md border px-4 py-2 text-sm ${
                  breakdownDimension === dimension
                    ? "border-accent text-accent"
                    : "border-line text-ink hover:border-accent"
                }`}
                onClick={() => {
                  setBreakdownDimension(dimension);
                  setBreakdownSortKey("netPnl");
                  setBreakdownSortDirection("desc");
                }}
              >
                {breakdownLabels[dimension]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <SegmentCard
            title="Largest Leak"
            row={largestLeak}
            tone="loss"
            onSelect={(row) => {
              trackEvent("drilldown_opened", { reportId: result.id, dimension: breakdownDimension, group: row.group });
              onDrillDown?.({ dimension: breakdownDimension, group: row.group });
            }}
          />
          <SegmentCard
            title="Strongest Segment"
            row={strongestSegment}
            tone="accent"
            onSelect={(row) => {
              trackEvent("drilldown_opened", { reportId: result.id, dimension: breakdownDimension, group: row.group });
              onDrillDown?.({ dimension: breakdownDimension, group: row.group });
            }}
          />
        </div>

        <TableContainer>
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-panel text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{breakdownLabels[breakdownDimension]}</th>
                {[
                  ["totalTrades", "Trades"],
                  ["winRate", "Win Rate"],
                  ["netPnl", "Net PnL"],
                  ["expectancy", "Expectancy"],
                  ["averageRealizedR", "Avg R"],
                  ["costDragPct", "Cost Drag"]
                ].map(([key, label]) => (
                  <th key={key} className="px-4 py-3 font-medium">
                    <button onClick={() => sortBreakdown(key as BreakdownSortKey)}>{label}</button>
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Gross PnL</th>
                <th className="px-4 py-3 font-medium">Costs</th>
                <th className="px-4 py-3 font-medium">Avg Win</th>
                <th className="px-4 py-3 font-medium">Avg Loss</th>
                <th className="px-4 py-3 font-medium">Profit Factor</th>
                <th className="px-4 py-3 font-medium">Net/Gross</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {breakdownRows.map((row) => (
                <tr
                  key={row.group}
                  className="cursor-pointer hover:bg-line/30"
                  onClick={() => {
                    trackEvent("drilldown_opened", { reportId: result.id, dimension: breakdownDimension, group: row.group });
                    onDrillDown?.({ dimension: breakdownDimension, group: row.group });
                  }}
                >
                  <td className="px-4 py-3 font-medium">{row.group}</td>
                  <td className="px-4 py-3 text-muted">{row.totalTrades}</td>
                  <td className="px-4 py-3">{percent.format(row.winRate)}</td>
                  <td className={row.netPnl >= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>
                    {currency.format(row.netPnl)}
                  </td>
                  <td className="px-4 py-3">{currency.format(row.expectancy)}</td>
                  <td className="px-4 py-3 text-muted">{formatNumber(row.averageRealizedR)}</td>
                  <td className="px-4 py-3 text-warning">{row.costDrag.label}</td>
                  <td className="px-4 py-3">{currency.format(row.grossPnl)}</td>
                  <td className="px-4 py-3 text-warning">{currency.format(row.totalCosts)}</td>
                  <td className="px-4 py-3 text-accent">{currency.format(row.averageWin)}</td>
                  <td className="px-4 py-3 text-loss">{currency.format(row.averageLoss)}</td>
                  <td className="px-4 py-3 text-muted">{formatNumber(row.profitFactor)}</td>
                  <td className="px-4 py-3 text-muted">{formatPercent(row.netToGrossPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableContainer>
      </section>
      </PaywallGate>
      )}

      {activeTab === "trades" && (
      <PaywallGate
        feature="full_report_access"
        accessLevel={fullTradeAccess ? "full" : "preview"}
        title="Upgrade to Pro to unlock the full trade-level report."
        description="Preview reports show top-level diagnostics. Pro unlocks every normalized trade behind the attribution."
      >
      <TableContainer className="mt-8">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-panel text-left text-muted">
            <tr>
              {[
                ["symbol", "Symbol"],
                ["side", "Side"],
                ["entryTime", "Entry Time"],
                ["grossPnl", "Gross PnL"],
                ["netPnl", "Net PnL"],
                ["realizedR", "R"]
              ].map(([key, label]) => (
                <th key={key} className="px-4 py-3 font-medium">
                  <button onClick={() => sort(key as SortKey)}>{label}</button>
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
                <td className="px-4 py-3">{currency.format(trade.grossPnl)}</td>
                <td className={trade.netPnl >= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>
                  {currency.format(trade.netPnl)}
                </td>
                <td className="px-4 py-3 text-muted">{trade.realizedR?.toFixed(2) ?? "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableContainer>
      </PaywallGate>
      )}

      {isEditingDetails && (
        <ReportDetailsEditor
          report={result}
          onCancel={() => setIsEditingDetails(false)}
          onSaved={(updated) => {
            setIsEditingDetails(false);
            onReportUpdated?.(updated);
          }}
        />
      )}
      {isAddingToStrategySet && (
        <AddToStrategySetDialog
          report={result}
          onCancel={() => setIsAddingToStrategySet(false)}
          onSaved={() => setIsAddingToStrategySet(false)}
        />
      )}
      {demoMode && (
        <DemoTour
          step={demoStep}
          onNext={() => setDemoStep((current) => Math.min(current + 1, demoSteps.length - 1))}
          onBack={() => setDemoStep((current) => Math.max(current - 1, 0))}
          onExit={onExitDemo}
        />
      )}
    </main>
  );
}

function ReportWarning({ message }: { message: string }) {
  return (
    <div className="border border-warning/40 bg-warning/[0.08] p-4 text-sm leading-6 text-warning">
      {message}
    </div>
  );
}

function getTradeCosts(trade: NormalizedTrade) {
  return Math.abs((trade.commission ?? 0) + (trade.fees ?? 0) + (trade.estimatedCosts ?? 0) + (trade.totalAllocatedCosts ?? 0));
}

const demoSteps = [
  {
    title: "This is the strategy health score.",
    text: "It compresses net PnL, expectancy, cost drag, R capture, profit factor, win rate, and loss concentration into one diagnostic readout."
  },
  {
    title: "This is the primary issue EdgeTrace detected.",
    text: "The diagnosis tells you whether the main problem is costs, expectancy, R capture, large losses, or segment concentration."
  },
  {
    title: "These are the most important metrics.",
    text: "The strip keeps attention on net PnL, expectancy, average R, cost drag, profit factor, and win rate."
  },
  {
    title: "These recommended paths tell you where to inspect next.",
    text: "Click a recommended segment to drill into the exact trades and patterns driving the issue."
  },
  {
    title: "Drilldowns show the exact trades causing the issue.",
    text: "A drilldown explains segment metrics, leak rules, patterns, and the underlying trades."
  },
  {
    title: "Compare reports to see whether a strategy improved or degraded.",
    text: "Use Compare and Strategy Sets after you have multiple reports from strategy iterations."
  }
];

function DemoTour({
  step,
  onNext,
  onBack,
  onExit
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onExit?: () => void;
}) {
  const current = demoSteps[step];
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-accent/70 bg-panel p-5 shadow-2xl">
      <p className="text-xs uppercase tracking-[0.18em] text-accent">Demo Guide {step + 1} / {demoSteps.length}</p>
      <h2 className="mt-2 text-lg font-semibold">{current.title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{current.text}</p>
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <button className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:border-accent" onClick={onExit}>
          Exit Demo
        </button>
        <div className="flex gap-2">
          <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent disabled:opacity-40" disabled={step === 0} onClick={onBack}>
            Back
          </button>
          {step === demoSteps.length - 1 ? (
            <button className="EdgeTrace-compact-primary px-3 py-1.5 text-xs" onClick={onExit}>
              Finish
            </button>
          ) : (
            <button className="EdgeTrace-compact-primary px-3 py-1.5 text-xs" onClick={onNext}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SegmentCard({
  title,
  row,
  tone,
  onSelect
}: {
  title: string;
  row: BreakdownRow | undefined;
  tone: "accent" | "loss";
  onSelect?: (row: BreakdownRow) => void;
}) {
  return (
    <button
      className={`rounded-lg border bg-panel p-5 text-left ${
        tone === "accent" ? "border-accent/50" : "border-loss/50"
      } ${row ? "hover:border-accent" : ""}`}
      disabled={!row}
      onClick={() => row && onSelect?.(row)}
    >
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{title}</p>
      {row ? (
        <>
          <p className="mt-3 text-xl font-semibold">{row.group}</p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <MetricMini label="Net PnL" value={currency.format(row.netPnl)} />
            <MetricMini label="Expectancy" value={currency.format(row.expectancy)} />
            <MetricMini label="Cost Drag" value={row.costDrag.label} />
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">No segment data available.</p>
      )}
    </button>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function DashboardSummaryCard({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="border-t border-white/[0.1] bg-white/[0.018] px-1 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={`mt-4 text-4xl font-semibold tracking-[-0.06em] ${tone}`}>{value}</p>
      <p className="mt-3 text-sm text-muted">{detail}</p>
    </div>
  );
}

function scoreClass(score: number) {
  if (score >= 80) return "text-accent";
  if (score >= 60) return "text-warning";
  return "text-loss";
}

function metricStatusClass(status: MetricStatus) {
  if (status === "healthy") return "border-accent/50";
  if (status === "warning") return "border-warning/60";
  if (status === "weak") return "border-loss/60";
  return "border-line";
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="EdgeTrace-card p-5">
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

function formatTooltipCurrency(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return String(value ?? "N/A");
  return currency.format(numericValue);
}

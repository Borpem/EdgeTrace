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
import { PaywallGate } from "../components/PaywallGate";
import { formatReportType, ReportDetailsEditor } from "../components/ReportDetailsEditor";
import { TableContainer } from "../components/ui/Primitives";
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
  const reportTitle = result.name ?? "Diagnostic Report";
  const reportCreatedLabel = result.createdAt ? new Date(result.createdAt).toLocaleString() : "Date unavailable";

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
      <section className="mb-5 border-b border-white/[0.07] pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-white/[0.12] px-2.5 py-1 text-xs text-muted">
                {formatReportType(result.reportType)}
              </span>
              {result.strategyLabel && (
                <span className="border border-accent/50 px-2.5 py-1 text-xs text-accent">
                  {result.strategyLabel}
                </span>
              )}
              {(result.tags ?? []).slice(0, 3).map((tag) => (
                <span key={tag} className="border border-white/[0.12] px-2.5 py-1 text-xs text-muted">
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="mt-3 truncate text-2xl font-semibold leading-tight tracking-[-0.04em] text-ink md:text-3xl">
              {reportTitle}
            </h1>
            <p className="mt-1 text-sm text-muted">{reportCreatedLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="EdgeTrace-compact-secondary" onClick={() => setIsEditingDetails(true)}>
              Edit Details
            </button>
            {onViewReports && (
              <button className="EdgeTrace-compact-secondary" onClick={onViewReports}>
                Switch Report
              </button>
            )}
            {onCreateReport && (
              <button className="EdgeTrace-compact-secondary" onClick={onCreateReport}>
                New Report
              </button>
            )}
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

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0">
          <nav className="mb-4 flex flex-wrap gap-5 border-b border-white/[0.06]">
            {(["overview", "breakdown", "charts", "trades"] as DashboardTab[]).map((tab) => (
              <button
                key={tab}
                className={`border-b pb-3 pt-1 text-sm font-semibold capitalize ${
                  activeTab === tab ? "border-white/45 text-ink" : "border-transparent text-muted/80 hover:border-white/20 hover:text-ink"
                }`}
                onClick={() => {
                  setActiveTab(tab);
                  trackEvent("report_tab_opened", { reportId: result.id, tab });
                }}
              >
                {tab}
              </button>
            ))}
          </nav>

      <section
        id="primary-diagnosis"
        className="EdgeTrace-card relative scroll-mt-28 overflow-hidden p-6 shadow-[0_28px_100px_-82px_rgba(88,214,255,0.7)] md:p-8"
        data-testid="dashboard-health-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(88,214,255,0.1),transparent_26rem),radial-gradient(circle_at_4%_100%,rgba(255,184,77,0.055),transparent_24rem)]" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">Current Diagnosis</p>
          <h2 className="mt-4 max-w-5xl text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-ink md:text-7xl">
              {intelligence.primaryDiagnosis}
          </h2>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted">{intelligence.primaryLeak.explanation}</p>

          <div className="mt-8 grid gap-6 border-t border-white/[0.07] pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan">Inspect next</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-ink">
                {primaryInspection ? primaryInspection.title : intelligence.primaryLeak.recommendedInspection}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {primaryInspection ? primaryInspection.reason : intelligence.primaryLeak.supportingMetric}
              </p>
            </div>
            <div className="border-l border-white/[0.08] pl-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Why it matters</p>
              <p className="mt-3 text-xl font-semibold leading-7 tracking-[-0.035em] text-ink">
                {intelligence.primaryLeak.supportingMetric}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-7 border-t border-white/[0.07] pt-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Strategy Health</p>
              <div className="mt-3 flex items-end gap-4">
                <p className={`text-8xl font-semibold leading-none tracking-[-0.08em] ${scoreClass(intelligence.strategyHealthScore)}`}>
                  {intelligence.strategyHealthScore}
                </p>
                <div className="pb-2">
                  <p className="text-xl font-semibold tracking-[-0.04em] text-ink">{intelligence.healthBand}</p>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
                </div>
              </div>
            </div>
            <div className="h-40 opacity-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts.equityCurve}>
                  <CartesianGrid stroke="#272727" strokeOpacity={0.25} vertical={false} />
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

          <div className="mt-8 grid gap-6 border-y border-white/[0.07] py-5 md:grid-cols-3">
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
          </div>
        </div>
      </section>

        </div>

        <aside className="EdgeTrace-card-soft p-5 shadow-[0_24px_80px_-72px_rgba(88,214,255,0.45)] xl:sticky xl:top-6">
          <div className="border-b border-white/[0.07] pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Operational sidebar</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Action rail</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Keep the analysis on the left. Use this rail for workflow actions.</p>
          </div>

          <div className="mt-5">
          {primaryInspection && (
            <button className="group text-left" onClick={inspectPrimarySegment}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan">Inspect next</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink group-hover:text-cyan">
                Inspect {primaryInspection.title}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">{primaryInspection.reason}</p>
              <p className="mt-3 text-sm font-semibold text-cyan">{primaryInspection.metric}</p>
            </button>
          )}
          <button className="EdgeTrace-command-button mt-5 w-full justify-center" onClick={inspectPrimarySegment} disabled={!primaryInspection}>
            Inspect this segment
          </button>
          </div>

          <div className="mt-6 grid gap-4 border-t border-white/[0.07] pt-5 text-sm">
            {onCompareReport && (
              <button className="text-left text-muted hover:text-ink" onClick={() => onCompareReport(result.id)}>
                <span className="font-semibold text-ink">Compare this report</span>
                <span className="block mt-1 leading-6">Check whether the leak improved or degraded versus another report.</span>
              </button>
            )}
            <button className="text-left text-muted hover:text-ink" onClick={() => setIsAddingToStrategySet(true)}>
              <span className="font-semibold text-ink">Add to strategy set</span>
              <span className="block mt-1 leading-6">Group this report with related iterations for monitoring.</span>
            </button>
            {hasReconstructionAudit && (
              <button
                className="text-left text-muted hover:text-ink"
                onClick={() => {
                  trackEvent("reconstruction_audit_opened", { reportId: result.id });
                  onReconstructionAudit?.();
                }}
              >
                <span className="font-semibold text-ink">Review reconstruction audit</span>
                <span className="block mt-1 leading-6">Confirm which executions formed each completed trade.</span>
              </button>
            )}
          </div>

          <div className="mt-6 grid gap-2 border-t border-white/[0.07] pt-5">
            <button className="EdgeTrace-compact-secondary justify-center" onClick={() => setIsEditingDetails(true)}>
              Edit details
            </button>
            {onViewReports && (
              <button className="EdgeTrace-compact-secondary justify-center" onClick={onViewReports}>
                Report library
              </button>
            )}
          </div>
        </aside>
      </section>

      <section className="mt-6 border-t border-white/[0.07] pt-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Supporting detail area</p>
            <h2 className="mt-2 text-2xl font-semibold capitalize tracking-[-0.04em] text-ink">{activeTab}</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted">
            Tertiary analysis, provenance, charts, and trade-level records live here after the main read.
          </p>
        </div>
      </section>

      {activeTab === "overview" && (
        <section className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
          <div className="border-t border-white/[0.06] pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Supporting leak context</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">{intelligence.primaryLeak.title}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">{intelligence.primaryLeak.explanation}</p>
            <div className="mt-6 grid gap-5 text-sm md:grid-cols-2">
              <MetricMini label="Supporting Metric" value={intelligence.primaryLeak.supportingMetric} />
              <MetricMini label="Recommended Next Step" value={intelligence.primaryLeak.recommendedInspection} />
            </div>
          </div>

          <div className="grid gap-5 text-sm text-muted">
            <section className="border-t border-white/[0.05] pt-5">
              <button
                className="flex w-full items-center justify-between gap-4 text-left"
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
                <span className="text-sm font-semibold text-muted hover:text-ink">{calculationOpen ? "Hide" : "Show"}</span>
              </button>
              {calculationOpen && (
                <div className="mt-5 border-t border-white/[0.05] pt-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    {calculationRows.map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
                        <p className="mt-1 text-sm text-ink">{value}</p>
                      </div>
                    ))}
                  </div>
                  {provenance?.reconstructionSummary && (
                    <div className="mt-5 border-t border-white/[0.05] pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Reconstruction summary</p>
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
            <section className="border-t border-white/[0.05] pt-5">
              <p className="text-sm font-semibold text-ink">Metric definitions</p>
              <div className="mt-3 grid gap-4 text-sm leading-6 text-muted md:grid-cols-2">
                <p>Cost drag estimates how much execution costs reduce gross performance before it reaches net results.</p>
                <p>R capture measures realized reward relative to risk when risk data is available or can be inferred.</p>
              </div>
            </section>
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
    <div className="px-1 py-1">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-3 text-3xl font-semibold tracking-[-0.055em] ${tone}`}>{value}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
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

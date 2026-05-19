import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Compass,
  Layers3,
  LineChart as TrendIcon,
  Search,
  TrendingDown,
  TrendingUp,
  UploadCloud
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CommandPath } from "../components/onboarding/CommandPath";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { BreakdownDimension } from "../lib/breakdowns";
import { getCollection, getReport, listCollections, listReports } from "../lib/api";
import { buildReportIntelligence, type MetricStatus } from "../lib/reportIntelligence";
import type { DiagnosticsResult, ReportCollectionDetail, ReportCollectionSummary, ReportSummary } from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const preciseCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const emptyCharts = { equityCurve: [], pnlBySymbol: [], pnlByHour: [] };

type TrendDirection = "improving" | "degrading" | "stable" | "insufficient";

type ReportLike = {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  strategyLabel?: string;
  totalTrades: number;
  winRate: number;
  grossPnl: number;
  totalCosts: number;
  netPnl: number;
  expectancy: number;
  averageRealizedR?: number;
  profitFactor?: number;
};

type AttentionItem = {
  title: string;
  body: string;
  metric: string;
  severity: "critical" | "warning" | "info";
  icon: ReactNode;
  actionLabel: string;
  onAction: () => void;
};

type RecentChangeMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "negative" | "neutral" | "warning";
};

export function StrategyDashboardPage({
  selectedReport,
  onOpenReport,
  onDrillDown,
  onUpload,
  onReports
}: {
  selectedReport?: DiagnosticsResult | null;
  onOpenReport: (result: DiagnosticsResult) => void;
  onDrillDown: (result: DiagnosticsResult, selection: { dimension: BreakdownDimension; group: string }) => void;
  onUpload: () => void;
  onReports: () => void;
}) {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [collections, setCollections] = useState<ReportCollectionSummary[]>([]);
  const [topCollection, setTopCollection] = useState<ReportCollectionDetail | null>(null);
  const [activeReport, setActiveReport] = useState<DiagnosticsResult | null>(selectedReport ?? null);
  const [selectedId, setSelectedId] = useState(selectedReport?.id ?? "");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSupportingAnalysis, setShowSupportingAnalysis] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [reportsResponse, collectionsResponse] = await Promise.all([
          listReports(),
          listCollections().catch(() => ({ collections: [] as ReportCollectionSummary[] }))
        ]);
        if (cancelled) return;

        const sortedReports = sortReportsByUpdated(reportsResponse.reports ?? []);
        const sortedCollections = sortCollectionsByActivity(collectionsResponse.collections ?? []);
        setReports(sortedReports);
        setCollections(sortedCollections);

        const topCollectionSummary = sortedCollections[0];
        if (topCollectionSummary) {
          getCollection(topCollectionSummary.id)
            .then((detail) => {
              if (!cancelled) setTopCollection(detail);
            })
            .catch(() => {
              if (!cancelled) setTopCollection(null);
            });
        } else {
          setTopCollection(null);
        }

        const targetId = selectedReport?.id || selectedId || sortedReports[0]?.id || "";
        if (!targetId) {
          setActiveReport(null);
          setSelectedId("");
          return;
        }

        if (selectedReport?.id === targetId) {
          setActiveReport(selectedReport);
          setSelectedId(targetId);
          return;
        }

        const report = await getReport(targetId);
        if (!cancelled) {
          setActiveReport(report);
          setSelectedId(report.id);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load strategy dashboard");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id]);

  const safeReport = useMemo(() => {
    if (!activeReport) return null;
    const trades = Array.isArray(activeReport.trades) ? activeReport.trades : [];
    const charts = activeReport.charts ?? emptyCharts;
    const metrics = activeReport.metrics ?? {
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

    return { ...activeReport, trades, charts, metrics };
  }, [activeReport]);

  const intelligence = useMemo(() => (safeReport ? buildReportIntelligence(safeReport) : null), [safeReport]);
  const activeReportLike = useMemo(() => (safeReport ? reportLikeFromDiagnostics(safeReport) : null), [safeReport]);
  const chronologicalReports = useMemo(() => [...reports].sort((a, b) => safeTime(a.createdAt) - safeTime(b.createdAt)), [reports]);
  const recentReports = useMemo(() => reports.slice(0, 5), [reports]);
  const latestSummary = chronologicalReports[chronologicalReports.length - 1];
  const priorSummary = chronologicalReports[chronologicalReports.length - 2];
  const activeTrend = useMemo(() => {
    if (!activeReportLike) return "insufficient";
    const index = chronologicalReports.findIndex((report) => report.id === activeReportLike.id);
    const previous = index > 0 ? chronologicalReports[index - 1] : undefined;
    return trendDirection(activeReportLike, previous);
  }, [activeReportLike, chronologicalReports]);
  const recentChange = useMemo(() => buildRecentChange(latestSummary, priorSummary), [latestSummary, priorSummary]);
  const monitoring = useMemo(() => buildStrategySetMonitoring(topCollection), [topCollection]);

  const handleSelectReport = async (id: string) => {
    setSelectedId(id);
    setIsLoading(true);
    setError("");
    try {
      const report = await getReport(id);
      setActiveReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load report");
    } finally {
      setIsLoading(false);
    }
  };

  const openDetailedReport = async (id: string) => {
    setError("");
    try {
      onOpenReport(await getReport(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open report");
    }
  };

  const openStrategySets = (collectionId?: string) => {
    navigateWithinApp(collectionId ? `/app/collections/${collectionId}` : "/app/collections");
  };

  if (isLoading && !safeReport) {
    return (
      <main className="EdgeTrace-shell py-10">
        <section className="EdgeTrace-page-header">
          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-[-0.035em] text-ink md:text-6xl">
            Loading dashboard
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
            EdgeTrace is loading the latest diagnostic report and strategy activity.
          </p>
        </section>
      </main>
    );
  }

  if (!safeReport || !intelligence || !activeReportLike) {
    return (
      <main className="EdgeTrace-shell py-10">
        <section className="EdgeTrace-page-header">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <h1 className="max-w-5xl text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-ink md:text-6xl">
                Dashboard
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
                Start with your first diagnostic report to see what worked, what leaked, and where to inspect next.
              </p>
              {error && <p className="mt-4 text-sm text-loss">{error}</p>}
              <div className="mt-7 flex flex-wrap gap-3">
                <button className="EdgeTrace-primary-button" onClick={onUpload}>
                  Analyze Trades
                </button>
                <button className="EdgeTrace-secondary-button" onClick={onReports}>
                  View Reports
                </button>
              </div>
            </div>
            <div className="EdgeTrace-card-soft p-5">
              <UploadCloud className="text-cyan" size={30} strokeWidth={1.6} />
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-ink">
                Start with your first diagnostic report.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Upload completed trade history to generate diagnostics, attribution, and monitoring workflows.
              </p>
            </div>
          </div>
        </section>
        <CommandPath className="mt-6" context="dashboard_empty" onAnalyze={onUpload} onDashboard={onReports} />
      </main>
    );
  }

  const metrics = safeReport.metrics;
  const charts = safeReport.charts;
  const primaryInspection = intelligence.nextBestInspections[0];
  const inspectionTitle = primaryInspection?.title ?? intelligence.primaryLeak.recommendedInspection;
  const inspectionReason = primaryInspection?.reason ?? intelligence.primaryLeak.supportingMetric;
  const attentionItems = buildAttentionItems({
    report: safeReport,
    reports,
    chronologicalReports,
    intelligence,
    onInspect: primaryInspection
      ? () => onDrillDown(safeReport, { dimension: primaryInspection.dimension, group: primaryInspection.group })
      : undefined,
    onOpenActiveReport: () => onOpenReport(safeReport),
    onOpenReport: (id) => void openDetailedReport(id)
  });

  return (
    <main className="EdgeTrace-shell py-7">
      <section className="EdgeTrace-card-soft mb-5 overflow-visible p-4 md:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-5xl">
              Strategy command center
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              Current diagnosis, priority inspection, report activity, and monitoring context in one operational view.
            </p>
          </div>

          <div className="EdgeTrace-dashboard-cell grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Report focus</span>
              <select
                className="mt-2 w-full border border-white/[0.1] bg-black/35 px-4 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-cyan"
                value={selectedId}
                onChange={(event) => void handleSelectReport(event.target.value)}
              >
                {reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <button className="EdgeTrace-command-button" onClick={onUpload}>
                Analyze Trades
              </button>
              <button className="EdgeTrace-compact-secondary" onClick={onReports}>
                View Reports
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="mb-5 border border-loss/50 bg-loss/10 p-4 text-sm text-loss">{error}</div>}

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px] 2xl:items-start">
        <div className="grid min-w-0 gap-5">
          <section
            className="EdgeTrace-card relative overflow-hidden p-4 shadow-[0_24px_80px_-70px_rgba(88,214,255,0.48)] md:p-6"
            data-testid="dashboard-health-card"
          >
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_86%_0%,rgba(88,214,255,0.08),transparent_30rem),radial-gradient(circle_at_8%_100%,rgba(255,184,77,0.035),transparent_26rem)]" />
            <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Focused report</p>
                    <h2 className="mt-2 truncate text-2xl font-semibold tracking-[-0.045em] text-ink md:text-3xl">
                      {safeReport.name ?? "Diagnostic report"}
                    </h2>
                    <p className="mt-2 text-xs text-muted">{formatDate(safeReport.updatedAt || safeReport.createdAt)}</p>
                  </div>
                  <TrendBadge trend={activeTrend} />
                </div>

                <div className="py-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Current diagnosis</p>
                  <h3 className={`mt-3 max-w-4xl text-4xl font-semibold leading-[0.98] tracking-[-0.055em] md:text-6xl ${diagnosisTextClass(intelligence.primaryDiagnosis)}`}>
                    {intelligence.primaryDiagnosis}
                  </h3>
                  <p className="mt-4 max-w-3xl text-[15px] leading-7 text-muted">{intelligence.primaryLeak.explanation}</p>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.72fr)]">
                  <button
                    className="EdgeTrace-dashboard-cell border-warning/35 p-4 text-left shadow-[0_18px_52px_-46px_rgba(255,184,77,0.5)] transition hover:border-warning/70"
                    onClick={() =>
                      primaryInspection
                        ? onDrillDown(safeReport, { dimension: primaryInspection.dimension, group: primaryInspection.group })
                        : onOpenReport(safeReport)
                    }
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warning">Primary next step</p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-ink">{inspectionTitle}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{inspectionReason}</p>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-warning">
                      Inspect now <ArrowRight size={15} />
                    </span>
                  </button>

                  <div className="EdgeTrace-dashboard-cell p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Primary leak</p>
                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-ink">{intelligence.primaryLeak.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{intelligence.primaryLeak.supportingMetric}</p>
                  </div>
                </div>
              </div>

              <aside className="EdgeTrace-dashboard-cell flex flex-col p-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Strategy health</p>
                  <div className="mt-4 flex items-end gap-4">
                    <p className={`text-7xl font-semibold leading-none tracking-[-0.065em] ${scoreClass(intelligence.strategyHealthScore)}`}>
                      {intelligence.strategyHealthScore}
                    </p>
                    <p className="pb-2 text-lg font-semibold tracking-[-0.03em] text-ink">{intelligence.healthBand}</p>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
                </div>
                <div className="mt-6 min-h-36 flex-1">
                  {charts.equityCurve.length ? (
                    <ResponsiveContainer width="100%" height={155}>
                      <RechartsLineChart data={charts.equityCurve}>
                        <CartesianGrid stroke="#272727" strokeOpacity={0.34} vertical={false} />
                        <XAxis dataKey="trade" hide />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ background: "#101010", border: "1px solid #272727" }}
                          formatter={(value) => [formatTooltipCurrency(value), "Equity"]}
                        />
                        <Line type="monotone" dataKey="equity" stroke="#58D6FF" strokeWidth={3} dot={false} />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="EdgeTrace-dashboard-cell flex h-36 items-center justify-center text-xs text-muted">
                      Equity curve unavailable
                    </div>
                  )}
                </div>
              </aside>
            </div>

            <div className="relative z-10 mt-5">
              <button
                className="EdgeTrace-analysis-reveal w-full px-4 py-4 text-left md:px-5"
                type="button"
                aria-expanded={showSupportingAnalysis}
                onClick={() => setShowSupportingAnalysis((value) => !value)}
              >
                <span className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <span>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan">Recommended next view</span>
                    <span className="mt-2 block text-lg font-semibold tracking-[-0.035em] text-ink">
                      {showSupportingAnalysis ? "Hide supporting analysis" : "Open supporting analysis"}
                    </span>
                  </span>
                  <span className="mt-3 flex items-center gap-3 text-sm font-semibold text-cyan md:mt-0">
                    Decision metrics, change history, and report activity
                    <ArrowRight className={`transition ${showSupportingAnalysis ? "rotate-90" : ""}`} size={17} />
                  </span>
                </span>
              </button>

              {showSupportingAnalysis && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                  <BriefMetric label="Net PnL" value={currency.format(metrics.netPnl)} detail={`${metrics.totalTrades} trades`} status={intelligence.keyMetricStatuses.netPnl} />
                  <BriefMetric label="Expectancy" value={currency.format(metrics.expectancy)} detail="After-cost average" status={intelligence.keyMetricStatuses.expectancy} />
                  <BriefMetric label="Cost Drag" value={intelligence.costDragLabel} detail={currency.format(metrics.totalCosts)} status={intelligence.keyMetricStatuses.costDrag} />
                  <BriefMetric label="R Capture" value={metrics.averageRealizedR === undefined ? "Unavailable" : `${number.format(metrics.averageRealizedR)}R`} detail="Risk conversion" status={intelligence.keyMetricStatuses.averageR} />
                  <BriefMetric label="Win Rate" value={percent.format(metrics.winRate)} detail="Closed trades" status={metrics.winRate >= 0.5 ? "healthy" : metrics.winRate >= 0.4 ? "warning" : "weak"} />
                  <BriefMetric label="Profit Factor" value={number.format(metrics.profitFactor)} detail="Gross win/loss" status={metrics.profitFactor >= 1.5 ? "healthy" : metrics.profitFactor >= 1 ? "warning" : "weak"} />
                </div>
              )}
            </div>
          </section>

          {showSupportingAnalysis && (
            <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
              <ChangeMatrix change={recentChange} className="mt-0" />
              <RecentReportsPanel
                reports={recentReports}
                activeReportId={safeReport.id}
                onFocus={(id) => void handleSelectReport(id)}
                onOpen={(id) => void openDetailedReport(id)}
                onReports={onReports}
              />
            </div>
          )}
        </div>

        <aside className="grid gap-5 2xl:sticky 2xl:top-6">
          <section className="EdgeTrace-card-soft p-4 shadow-[0_20px_68px_-64px_rgba(255,184,77,0.26)]">
            <div className="EdgeTrace-dashboard-cell p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Action queue</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Needs inspection</h2>
              <p className="mt-2 text-sm leading-6 text-muted">Highest-value paths from summary diagnosis to concrete trades.</p>
            </div>

            <div className="mt-3 grid gap-2.5">
              {attentionItems.slice(0, 5).map((item, index) => (
                <RailPriorityItem key={`${item.title}-${index}`} item={item} index={index + 1} />
              ))}
            </div>

            <div className="EdgeTrace-dashboard-cell mt-3 grid gap-2 p-3">
              <button className="EdgeTrace-command-button justify-center" onClick={() => onOpenReport(safeReport)}>
                Open focused report <ArrowRight size={16} />
              </button>
              <button className="EdgeTrace-compact-secondary justify-center" onClick={onUpload}>
                Analyze trades
              </button>
            </div>
          </section>

          <StrategySetPanel
            monitoring={monitoring}
            collections={collections}
            onOpenStrategySet={(id) => openStrategySets(id)}
            onCreateStrategySet={() => openStrategySets()}
          />
        </aside>
      </section>
    </main>
  );
}

function BriefMetric({
  label,
  value,
  detail,
  status
}: {
  label: string;
  value: string;
  detail: string;
  status: MetricStatus;
}) {
  return (
    <div className="EdgeTrace-dashboard-cell p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted">{label}</p>
        <StatusDot status={status} />
      </div>
      <p className={`mt-2.5 text-xl font-semibold tracking-[-0.035em] ${metricTextClass(status)}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}

function ChangeMatrix({ change, className = "mt-5" }: { change: ReturnType<typeof buildRecentChange>; className?: string }) {
  return (
    <section className={`EdgeTrace-dashboard-cell p-5 ${className}`}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-violet">Change analysis</p>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.035em] text-ink">{change.driver}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{change.summary}</p>
        </div>
        <div className="flex lg:justify-end">
          <TrendBadge trend={change.direction} />
        </div>
      </div>
      <div className="mt-5 grid gap-x-5 gap-y-4 md:grid-cols-4">
        {change.metrics.map((metric) => (
          <DeltaCard key={metric.label} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function DeltaCard({ metric }: { metric: RecentChangeMetric }) {
  return (
    <div className={`EdgeTrace-dashboard-cell border-l-2 p-3.5 ${deltaBorderClass(metric.tone)}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted">{metric.label}</p>
      <p className={`mt-2.5 text-xl font-semibold tracking-[-0.04em] ${deltaTextClass(metric.tone)}`}>{metric.value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{metric.detail}</p>
    </div>
  );
}

function RailPriorityItem({ item, index }: { item: AttentionItem; index: number }) {
  return (
    <button className="EdgeTrace-dashboard-cell group w-full p-3.5 text-left transition hover:border-cyan/30 hover:bg-cyan/[0.026]" onClick={item.onAction}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border text-[11px] font-semibold ${attentionBadgeClass(item.severity)}`}>
          {index}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink group-hover:text-cyan">{item.title}</span>
            <span className={`border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.11em] ${attentionBadgeClass(item.severity)}`}>
              {item.metric}
            </span>
          </span>
          <span className="mt-2 block text-sm leading-6 text-muted">{item.body}</span>
          <span className="mt-2 block text-xs font-semibold text-cyan">{item.actionLabel}</span>
        </span>
      </div>
    </button>
  );
}

function RecentReportsPanel({
  reports,
  activeReportId,
  onFocus,
  onOpen,
  onReports
}: {
  reports: ReportSummary[];
  activeReportId: string;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
  onReports: () => void;
}) {
  return (
    <section className="EdgeTrace-card-soft min-w-0 p-5 shadow-[0_18px_64px_-62px_rgba(88,214,255,0.24)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Research library snapshot</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Report activity</h2>
          <p className="mt-2 text-sm text-muted">Recent diagnostics for confirming whether the current read is isolated or repeating.</p>
        </div>
        <button className="EdgeTrace-compact-secondary" onClick={onReports}>
          View all reports
        </button>
      </div>
      <div className="EdgeTrace-dashboard-cell mt-5 min-w-0 overflow-x-auto p-0">
        <div className="hidden min-w-[900px] grid-cols-[minmax(180px,1.2fr)_72px_104px_104px_104px_minmax(150px,0.8fr)_88px] border-b border-white/[0.055] bg-black/20 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-muted 2xl:grid">
          <span>Report</span>
          <span>Health</span>
          <span>Net PnL</span>
          <span>Expectancy</span>
          <span>Cost Drag</span>
          <span>Diagnosis</span>
          <span>Action</span>
        </div>
        <div className="divide-y divide-white/[0.045]">
          {reports.map((report) => (
            <RecentReportRow
              key={report.id}
              report={report}
              active={report.id === activeReportId}
              onFocus={() => onFocus(report.id)}
              onOpen={() => onOpen(report.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentReportRow({
  report,
  active,
  onFocus,
  onOpen
}: {
  report: ReportSummary;
  active: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const score = scoreReportSummary(report);
  const diagnosis = diagnosisFromSummary(report);
  const costDrag = costDragRatio(report);
  return (
    <div
      className={`grid min-w-0 gap-x-4 gap-y-3 px-5 py-4 transition sm:grid-cols-2 lg:grid-cols-3 2xl:min-w-[900px] 2xl:grid-cols-[minmax(180px,1.2fr)_72px_104px_104px_104px_minmax(150px,0.8fr)_88px] 2xl:items-center ${
        active ? "bg-cyan/[0.03]" : "hover:bg-white/[0.018]"
      }`}
    >
      <button className="min-w-0 text-left sm:col-span-2 lg:col-span-3 2xl:col-span-1" onClick={onFocus}>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <p className="min-w-0 max-w-full flex-1 truncate text-sm font-semibold text-ink">{report.name}</p>
          {active && (
            <span className="w-fit shrink-0 border border-white/[0.14] bg-white/[0.045] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">
              Focused
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">{formatDate(report.createdAt)}</p>
      </button>
      <ReportStat label="Health" value={String(score)} tone={score >= 70 ? "cyan" : score >= 45 ? "warning" : "loss"} />
      <ReportStat label="Net PnL" value={currency.format(report.netPnl)} tone={report.netPnl >= 0 ? "cyan" : "loss"} />
      <ReportStat label="Expectancy" value={currency.format(report.expectancy)} tone={report.expectancy >= 0 ? "cyan" : "loss"} />
      <ReportStat
        label="Cost Drag"
        value={costDrag === undefined ? "Unavailable" : percent.format(costDrag)}
        tone={costDrag === undefined ? "neutral" : costDrag > 0.4 ? "loss" : costDrag > 0.2 ? "warning" : "cyan"}
      />
      <p className="min-w-0 text-sm font-semibold text-ink sm:col-span-2 lg:col-span-1 2xl:col-span-1">{diagnosis}</p>
      <button className="EdgeTrace-compact-secondary justify-center sm:col-span-2 lg:col-span-1 2xl:col-span-1" onClick={onOpen}>
        Open
      </button>
    </div>
  );
}

function StrategySetPanel({
  monitoring,
  collections,
  onOpenStrategySet,
  onCreateStrategySet
}: {
  monitoring: ReturnType<typeof buildStrategySetMonitoring>;
  collections: ReportCollectionSummary[];
  onOpenStrategySet: (id: string) => void;
  onCreateStrategySet: () => void;
}) {
  return (
    <section className="EdgeTrace-card-soft relative overflow-hidden p-5 shadow-[0_18px_64px_-62px_rgba(120,97,255,0.25)] md:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(120,97,255,0.04),transparent_18rem)]" />
      <div className="relative">
        <div className="EdgeTrace-dashboard-cell flex items-start justify-between gap-4 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">Strategy monitoring</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Strategy set monitoring</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use this after the current report read to track related diagnostics as strategy iterations.
            </p>
          </div>
          <Layers3 className="text-violet" size={26} strokeWidth={1.6} />
        </div>

        {monitoring.collection ? (
          <div className="mt-4">
            <div className="EdgeTrace-dashboard-cell border-violet/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet">Top strategy set</p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.035em] text-ink">{monitoring.collection.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{monitoring.summary}</p>
                </div>
                <TrendBadge trend={monitoring.direction} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniStatus label="Confidence" value={monitoring.confidence} />
                <MiniStatus label="Latest iteration" value={monitoring.latestIteration} />
                <MiniStatus label="Reports" value={String(monitoring.collection.reportCount)} />
              </div>
              <button className="EdgeTrace-command-button mt-4" onClick={() => onOpenStrategySet(monitoring.collection!.id)}>
                Open strategy set <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="EdgeTrace-dashboard-cell mt-4 p-4">
            <p className="text-lg font-semibold tracking-[-0.03em] text-ink">Create a Strategy Set to track iterations over time.</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Once you have related reports, strategy sets show whether changes are improving performance or creating new leakage.
            </p>
            <button className="EdgeTrace-compact-primary mt-5" onClick={onCreateStrategySet}>
              Create Strategy Set
            </button>
          </div>
        )}

        {collections.length > 1 && (
          <div className="mt-4 grid gap-2">
            {collections.slice(1, 3).map((collection) => (
              <button
                key={collection.id}
                className="EdgeTrace-dashboard-cell flex items-center justify-between gap-3 px-4 py-3 text-left hover:border-violet/30"
                onClick={() => onOpenStrategySet(collection.id)}
              >
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{collection.name}</span>
                <span className="text-xs text-muted">{collection.reportCount} reports</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="EdgeTrace-dashboard-cell p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function ReportStat({ label, value, tone }: { label: string; value: string; tone: "cyan" | "warning" | "loss" | "neutral" }) {
  const toneClass =
    tone === "cyan" ? "text-cyan" : tone === "warning" ? "text-warning" : tone === "loss" ? "text-loss" : "text-muted";
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted 2xl:hidden">{label}</p>
      <p className={`mt-1 break-words font-semibold 2xl:mt-0 2xl:whitespace-nowrap ${toneClass}`}>{value}</p>
    </div>
  );
}

function TrendBadge({ trend }: { trend: TrendDirection }) {
  const Icon = trend === "degrading" ? TrendingDown : trend === "insufficient" ? BarChart3 : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-2 border px-2.5 py-1 text-xs font-semibold ${trendClass(trend)}`}>
      <Icon size={14} />
      {trendLabel(trend)}
    </span>
  );
}

function StatusDot({ status }: { status: MetricStatus }) {
  return <span className={`mt-1 h-2.5 w-2.5 ${statusDotClass(status)}`} />;
}

function buildAttentionItems({
  report,
  reports,
  chronologicalReports,
  intelligence,
  onInspect,
  onOpenActiveReport,
  onOpenReport
}: {
  report: DiagnosticsResult;
  reports: ReportSummary[];
  chronologicalReports: ReportSummary[];
  intelligence: ReturnType<typeof buildReportIntelligence>;
  onInspect?: () => void;
  onOpenActiveReport: () => void;
  onOpenReport: (id: string) => void;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const inspections = intelligence.nextBestInspections.slice(0, 2);
  const highestCostDragReport = [...reports]
    .filter((item) => costDragRatio(item) !== undefined)
    .sort((a, b) => (costDragRatio(b) ?? -1) - (costDragRatio(a) ?? -1))[0];
  const weakestExpectancyReport = [...reports].sort((a, b) => a.expectancy - b.expectancy)[0];
  const largestLossReport = [...reports].sort((a, b) => a.netPnl - b.netPnl)[0];
  const latestReport = chronologicalReports[chronologicalReports.length - 1];
  const previousReport = chronologicalReports[chronologicalReports.length - 2];

  inspections.forEach((inspection, index) => {
    items.push({
      title: inspection.title,
      body:
        index === 0
          ? "This segment is the fastest path from summary diagnosis to concrete trades."
          : "This secondary segment may explain whether the leak is isolated or broader.",
      metric: inspection.metric,
      severity: index === 0 && intelligence.strategyHealthScore < 45 ? "critical" : "warning",
      icon: <Search size={22} strokeWidth={1.7} />,
      actionLabel: index === 0 && onInspect ? "Inspect segment" : "Open report",
      onAction: index === 0 && onInspect ? onInspect : onOpenActiveReport
    });
  });

  if (highestCostDragReport && (costDragRatio(highestCostDragReport) ?? 0) > 0.2) {
    items.push({
      title: "Largest cost drag source",
      body: `${highestCostDragReport.name} has the strongest execution friction signal in the report library.`,
      metric: percent.format(costDragRatio(highestCostDragReport) ?? 0),
      severity: (costDragRatio(highestCostDragReport) ?? 0) > 0.4 ? "critical" : "warning",
      icon: <Compass size={22} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: () => onOpenReport(highestCostDragReport.id)
    });
  }

  if (weakestExpectancyReport && weakestExpectancyReport.expectancy < 0) {
    items.push({
      title: "Weakest expectancy",
      body: `${weakestExpectancyReport.name} has the weakest after-cost outcome per trade.`,
      metric: currency.format(weakestExpectancyReport.expectancy),
      severity: "critical",
      icon: <AlertTriangle size={22} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: () => onOpenReport(weakestExpectancyReport.id)
    });
  }

  if (largestLossReport && largestLossReport.netPnl < 0) {
    items.push({
      title: "Largest loss concentration",
      body: `${largestLossReport.name} is the report most likely to need loss concentration review.`,
      metric: currency.format(largestLossReport.netPnl),
      severity: "warning",
      icon: <TrendIcon size={22} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: () => onOpenReport(largestLossReport.id)
    });
  }

  if (latestReport && previousReport && trendDirection(latestReport, previousReport) === "degrading") {
    items.push({
      title: "Latest report is degrading",
      body: `${latestReport.name} moved lower versus ${previousReport.name}.`,
      metric: "Watchlist",
      severity: "warning",
      icon: <TrendingDown size={22} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: () => onOpenReport(latestReport.id)
    });
  }

  if (!items.some((item) => item.title === "R capture is weak") && intelligence.keyMetricStatuses.averageR === "weak") {
    items.push({
      title: "R capture is weak",
      body: "Trades are not converting available risk into enough realized reward.",
      metric: report.metrics.averageRealizedR === undefined ? "Unavailable" : `${number.format(report.metrics.averageRealizedR)}R`,
      severity: "warning",
      icon: <TrendIcon size={22} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: onOpenActiveReport
    });
  }

  if (!items.length) {
    items.push({
      title: "No urgent leak flagged",
      body: "The focused report is stable enough to inspect secondary segments or compare the next iteration.",
      metric: "Stable",
      severity: "info",
      icon: <CheckCircle2 size={22} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: onOpenActiveReport
    });
  }

  return dedupeAttentionItems(items).slice(0, 5);
}

function buildRecentChange(current?: ReportSummary, previous?: ReportSummary) {
  if (!current || !previous) {
    return {
      direction: "insufficient" as TrendDirection,
      summary: current
        ? `${current.name} is the current baseline. Create another diagnostic to measure what changed.`
        : "Create a diagnostic report to start tracking recent changes.",
      driver: "Not enough report history yet.",
      metrics: [
        { label: "PnL change", value: "Baseline", detail: "Need another report", tone: "neutral" as const },
        { label: "Expectancy change", value: "Baseline", detail: "Need another report", tone: "neutral" as const },
        { label: "Cost drag change", value: "Baseline", detail: "Need another report", tone: "neutral" as const },
        { label: "R capture change", value: "Baseline", detail: "Need another report", tone: "neutral" as const }
      ]
    };
  }

  const pnlDelta = current.netPnl - previous.netPnl;
  const expectancyDelta = current.expectancy - previous.expectancy;
  const currentCostDrag = costDragRatio(current);
  const previousCostDrag = costDragRatio(previous);
  const costDragDelta =
    currentCostDrag !== undefined && previousCostDrag !== undefined ? currentCostDrag - previousCostDrag : undefined;
  const currentR = current.averageRealizedR;
  const previousR = previous.averageRealizedR;
  const rDelta = currentR !== undefined && previousR !== undefined ? currentR - previousR : undefined;
  const direction = trendDirection(current, previous);

  const driver = pickChangeDriver([
    { label: "Net PnL", magnitude: Math.abs(pnlDelta), text: pnlDelta >= 0 ? "Net PnL improved most." : "Net PnL weakened most." },
    {
      label: "Expectancy",
      magnitude: Math.abs(expectancyDelta) * 20,
      text: expectancyDelta >= 0 ? "Expectancy improved versus the prior report." : "Expectancy weakened versus the prior report."
    },
    {
      label: "Cost Drag",
      magnitude: costDragDelta === undefined ? 0 : Math.abs(costDragDelta) * 100,
      text:
        costDragDelta === undefined
          ? "Cost drag comparison is unavailable."
          : costDragDelta <= 0
            ? "Cost drag reduced versus the prior report."
            : "Cost drag increased versus the prior report."
    },
    {
      label: "R Capture",
      magnitude: rDelta === undefined ? 0 : Math.abs(rDelta) * 40,
      text:
        rDelta === undefined
          ? "R capture comparison is unavailable."
          : rDelta >= 0
            ? "R capture improved versus the prior report."
            : "R capture weakened versus the prior report."
    }
  ]);

  return {
    direction,
    summary: `${current.name} compared with ${previous.name}.`,
    driver,
    metrics: [
      {
        label: "PnL change",
        value: signedCurrency(pnlDelta),
        detail: `${currency.format(previous.netPnl)} to ${currency.format(current.netPnl)}`,
        tone: (pnlDelta >= 0 ? "positive" : "negative") as RecentChangeMetric["tone"]
      },
      {
        label: "Expectancy change",
        value: signedCurrency(expectancyDelta),
        detail: `${currency.format(previous.expectancy)} to ${currency.format(current.expectancy)}`,
        tone: (expectancyDelta >= 0 ? "positive" : "negative") as RecentChangeMetric["tone"]
      },
      {
        label: "Cost drag change",
        value: costDragDelta === undefined ? "Unavailable" : signedPercentagePoints(costDragDelta),
        detail:
          currentCostDrag === undefined || previousCostDrag === undefined
            ? "Needs positive gross PnL"
            : `${percent.format(previousCostDrag)} to ${percent.format(currentCostDrag)}`,
        tone: (costDragDelta === undefined ? "neutral" : costDragDelta <= 0 ? "positive" : "warning") as RecentChangeMetric["tone"]
      },
      {
        label: "R capture change",
        value: rDelta === undefined ? "Unavailable" : `${rDelta >= 0 ? "+" : ""}${number.format(rDelta)}R`,
        detail:
          currentR === undefined || previousR === undefined
            ? "R-multiple unavailable"
            : `${number.format(previousR)}R to ${number.format(currentR)}R`,
        tone: (rDelta === undefined ? "neutral" : rDelta >= 0 ? "positive" : "negative") as RecentChangeMetric["tone"]
      }
    ]
  };
}

function buildStrategySetMonitoring(collection: ReportCollectionDetail | null) {
  if (!collection) {
    return {
      collection: null as ReportCollectionDetail | null,
      direction: "insufficient" as TrendDirection,
      confidence: "Unavailable",
      latestIteration: "Unavailable",
      summary: "Create a strategy set to track related reports as iterations."
    };
  }

  const orderedReports = collection.reports ?? [];
  const current = orderedReports[orderedReports.length - 1];
  const previous = orderedReports[orderedReports.length - 2];
  const direction = current && previous ? trendDirection(current, previous) : "insufficient";
  const confidence = orderedReports.length >= 3 ? "High" : orderedReports.length >= 2 ? "Medium" : "Needs another report";
  const latestIteration = current?.name ?? "No reports yet";
  const summary =
    current && previous
      ? `${current.name} is ${trendLabel(direction).toLowerCase()} versus ${previous.name}.`
      : "Add another related report to start monitoring strategy direction.";

  return {
    collection,
    direction,
    confidence,
    latestIteration,
    summary
  };
}

function reportLikeFromDiagnostics(report: DiagnosticsResult): ReportLike {
  return {
    id: report.id,
    name: report.name,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    strategyLabel: report.strategyLabel,
    totalTrades: report.metrics.totalTrades,
    winRate: report.metrics.winRate,
    grossPnl: report.metrics.grossPnl,
    totalCosts: report.metrics.totalCosts,
    netPnl: report.metrics.netPnl,
    expectancy: report.metrics.expectancy,
    averageRealizedR: report.metrics.averageRealizedR,
    profitFactor: report.metrics.profitFactor
  };
}

function scoreReportSummary(report: ReportLike) {
  let score = 100;
  const costDrag = costDragRatio(report);
  if (report.netPnl < 0) score -= 30;
  if (report.expectancy < 0) score -= 25;
  if (report.grossPnl > 0 && report.netPnl < 0) score -= 20;
  if (costDrag !== undefined && costDrag > 0.4) score -= 15;
  if ((report.averageRealizedR ?? 1) < 0.2) score -= 15;
  if ((report.profitFactor ?? 1.2) < 1) score -= 15;
  if (report.winRate < 0.45) score -= 10;
  if (report.totalTrades < 20) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function diagnosisFromSummary(report: ReportLike) {
  const costDrag = costDragRatio(report);
  if (report.totalTrades < 5) return "Insufficient Data";
  if (report.grossPnl > 0 && report.netPnl < 0) return "Cost Drag Problem";
  if (report.netPnl < 0 && report.expectancy < 0) return "Negative Expectancy";
  if ((report.averageRealizedR ?? 1) < 0.2) return "Poor R Capture";
  if (costDrag !== undefined && costDrag > 0.4) return "Cost Drag Watchlist";
  if (report.netPnl > 0 && report.expectancy > 0) return "Healthy";
  return "Watchlist";
}

function trendDirection(current: ReportLike, previous?: ReportLike): TrendDirection {
  if (!previous) return "insufficient";
  const currentScore = scoreReportSummary(current);
  const previousScore = scoreReportSummary(previous);
  if (currentScore - previousScore >= 5) return "improving";
  if (previousScore - currentScore >= 5) return "degrading";
  return "stable";
}

function costDragRatio(report: ReportLike) {
  if (report.grossPnl <= 0) return undefined;
  return report.totalCosts / Math.max(Math.abs(report.grossPnl), 1);
}

function dedupeAttentionItems(items: AttentionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortReportsByUpdated(reports: ReportSummary[]) {
  return [...reports].sort((a, b) => safeTime(b.updatedAt || b.createdAt) - safeTime(a.updatedAt || a.createdAt));
}

function sortCollectionsByActivity(collections: ReportCollectionSummary[]) {
  return [...collections].sort((a, b) => {
    const timeDelta = safeTime(b.updatedAt || b.createdAt) - safeTime(a.updatedAt || a.createdAt);
    return timeDelta || b.reportCount - a.reportCount;
  });
}

function navigateWithinApp(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function pickChangeDriver(drivers: { label: string; magnitude: number; text: string }[]) {
  return [...drivers].sort((a, b) => b.magnitude - a.magnitude)[0]?.text ?? "No major change driver detected.";
}

function signedCurrency(value: number) {
  return `${value >= 0 ? "+" : ""}${currency.format(value)}`;
}

function signedPercentagePoints(value: number) {
  return `${value >= 0 ? "+" : ""}${number.format(value * 100)} pts`;
}

function scoreClass(score: number) {
  if (score >= 80) return "text-cyan";
  if (score >= 40) return "text-warning";
  return "text-loss";
}

function diagnosisTextClass(diagnosis: string) {
  if (diagnosis === "Healthy") return "text-cyan";
  if (diagnosis === "Watchlist" || diagnosis === "Insufficient Data") return "text-warning";
  return "text-loss";
}

function metricTextClass(status: MetricStatus) {
  if (status === "healthy") return "text-cyan";
  if (status === "warning") return "text-warning";
  if (status === "weak") return "text-loss";
  return "text-ink";
}

function statusDotClass(status: MetricStatus) {
  if (status === "healthy") return "bg-cyan";
  if (status === "warning") return "bg-warning";
  if (status === "weak") return "bg-loss";
  return "bg-muted";
}

function trendClass(trend: TrendDirection) {
  if (trend === "improving") return "border-cyan/50 bg-cyan/[0.08] text-cyan";
  if (trend === "degrading") return "border-loss/50 bg-loss/[0.08] text-loss";
  if (trend === "stable") return "border-cyan/40 bg-cyan/[0.06] text-cyan";
  return "border-white/[0.12] bg-white/[0.035] text-muted";
}

function trendLabel(trend: TrendDirection) {
  if (trend === "improving") return "Improving";
  if (trend === "degrading") return "Degrading";
  if (trend === "stable") return "Stable";
  return "Baseline";
}

function deltaBorderClass(tone: RecentChangeMetric["tone"]) {
  if (tone === "positive") return "border-cyan/35";
  if (tone === "negative") return "border-loss/45";
  if (tone === "warning") return "border-warning/45";
  return "border-white/[0.1]";
}

function deltaTextClass(tone: RecentChangeMetric["tone"]) {
  if (tone === "positive") return "text-cyan";
  if (tone === "negative") return "text-loss";
  if (tone === "warning") return "text-warning";
  return "text-ink";
}

function attentionBadgeClass(severity: AttentionItem["severity"]) {
  if (severity === "critical") return "border-loss/45 bg-loss/[0.08] text-loss";
  if (severity === "warning") return "border-warning/45 bg-warning/[0.08] text-warning";
  return "border-cyan/35 bg-cyan/[0.08] text-cyan";
}

function formatTooltipCurrency(value: unknown) {
  return typeof value === "number" ? preciseCurrency.format(value) : String(value ?? "Unavailable");
}

function formatDate(value?: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

function safeTime(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

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
    <main className="EdgeTrace-shell py-10">
      <section className="EdgeTrace-page-header mb-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
          <div>
            <h1 className="max-w-5xl text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-ink md:text-6xl">
              Dashboard
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
              Monitor what changed recently, what is leaking, and what deserves inspection now.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="EdgeTrace-primary-button" onClick={onUpload}>
                Analyze Trades
              </button>
              <button className="EdgeTrace-secondary-button" onClick={onReports}>
                View Reports
              </button>
            </div>
          </div>

          <div className="EdgeTrace-card-soft p-5 shadow-[0_24px_80px_-66px_rgba(88,214,255,0.55)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Report focus</p>
            <select
              className="mt-3 w-full border border-white/[0.12] bg-black/35 px-4 py-3 text-sm font-semibold text-ink outline-none transition focus:border-cyan"
              value={selectedId}
              onChange={(event) => void handleSelectReport(event.target.value)}
            >
              {reports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.name}
                </option>
              ))}
            </select>
            <button className="EdgeTrace-compact-secondary mt-4 w-full justify-center" onClick={() => onOpenReport(safeReport)}>
              Open focused report <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {error && <div className="mt-5 border border-loss/50 bg-loss/10 p-4 text-sm text-loss">{error}</div>}

      <section
        className="EdgeTrace-card relative overflow-hidden p-5 shadow-[0_28px_100px_-74px_rgba(88,214,255,0.95)] md:p-8"
        data-testid="dashboard-health-card"
      >
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_82%_8%,rgba(88,214,255,0.13),transparent_24rem),radial-gradient(circle_at_8%_100%,rgba(120,97,255,0.11),transparent_28rem)]" />
        <div className="relative z-10 grid gap-7 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 border border-cyan/30 bg-cyan/[0.07] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan">
                Latest report
              </span>
              <TrendBadge trend={activeTrend} />
              <span className="text-sm text-muted">{formatDate(safeReport.updatedAt || safeReport.createdAt)}</span>
            </div>

            <h2 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-5xl">
              {intelligence.primaryDiagnosis}
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">{intelligence.primaryLeak.explanation}</p>

            <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]">
              <div className="relative py-2 pl-5">
                <div className="absolute bottom-1 left-0 top-1 w-px bg-gradient-to-b from-cyan/55 via-cyan/20 to-transparent" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">Where to inspect next</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-ink">{inspectionTitle}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{inspectionReason}</p>
                {primaryInspection ? (
                  <button
                    className="EdgeTrace-command-button mt-5"
                    onClick={() =>
                      onDrillDown(safeReport, { dimension: primaryInspection.dimension, group: primaryInspection.group })
                    }
                  >
                    Inspect this leak <ArrowRight size={16} />
                  </button>
                ) : (
                  <button className="EdgeTrace-compact-secondary mt-5" onClick={() => onOpenReport(safeReport)}>
                    Open report <ArrowRight size={16} />
                  </button>
                )}
              </div>

              <div className="relative py-2 pl-5">
                <div className="absolute bottom-1 left-0 top-1 w-px bg-gradient-to-b from-white/[0.18] via-white/[0.08] to-transparent" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Primary leak</p>
                <p className="mt-3 text-xl font-semibold tracking-[-0.035em] text-ink">{intelligence.primaryLeak.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{intelligence.primaryLeak.supportingMetric}</p>
              </div>
            </div>
          </div>

          <aside className="border border-white/[0.1] bg-black/32 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Strategy health</p>
                <p className={`mt-4 text-7xl font-semibold leading-none tracking-[-0.06em] ${scoreClass(intelligence.strategyHealthScore)}`}>
                  {intelligence.strategyHealthScore}
                </p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">{intelligence.healthBand}</p>
              </div>
              <BarChart3 className="text-cyan" size={28} strokeWidth={1.5} />
            </div>
            <p className="mt-5 text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
            <div className="mt-6 h-28">
              {charts.equityCurve.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={charts.equityCurve}>
                    <CartesianGrid stroke="#272727" strokeOpacity={0.45} vertical={false} />
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
                <div className="flex h-full items-center justify-center border border-white/[0.08] bg-black/20 text-xs text-muted">
                  Equity curve unavailable
                </div>
              )}
            </div>
          </aside>
        </div>

        <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <BriefMetric
            label="Net PnL"
            value={currency.format(metrics.netPnl)}
            detail={`${metrics.totalTrades} trades`}
            status={intelligence.keyMetricStatuses.netPnl}
          />
          <BriefMetric
            label="Expectancy"
            value={currency.format(metrics.expectancy)}
            detail="After-cost average"
            status={intelligence.keyMetricStatuses.expectancy}
          />
          <BriefMetric
            label="Cost Drag"
            value={intelligence.costDragLabel}
            detail={currency.format(metrics.totalCosts)}
            status={intelligence.keyMetricStatuses.costDrag}
          />
          <BriefMetric
            label="R Capture"
            value={metrics.averageRealizedR === undefined ? "Unavailable" : `${number.format(metrics.averageRealizedR)}R`}
            detail="Risk conversion"
            status={intelligence.keyMetricStatuses.averageR}
          />
          <BriefMetric
            label="Win Rate"
            value={percent.format(metrics.winRate)}
            detail="Closed trades"
            status={metrics.winRate >= 0.5 ? "healthy" : metrics.winRate >= 0.4 ? "warning" : "weak"}
          />
          <BriefMetric
            label="Profit Factor"
            value={number.format(metrics.profitFactor)}
            detail="Gross win/loss"
            status={metrics.profitFactor >= 1.5 ? "healthy" : metrics.profitFactor >= 1 ? "warning" : "weak"}
          />
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <RecentChangePanel change={recentChange} />
        <InspectionPanel items={attentionItems} onOpenReport={() => onOpenReport(safeReport)} />
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <RecentReportsPanel
          reports={recentReports}
          activeReportId={safeReport.id}
          onFocus={(id) => void handleSelectReport(id)}
          onOpen={(id) => void openDetailedReport(id)}
          onReports={onReports}
        />
        <StrategySetPanel
          monitoring={monitoring}
          collections={collections}
          onOpenStrategySet={(id) => openStrategySets(id)}
          onCreateStrategySet={() => openStrategySets()}
        />
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
    <div className={`border bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(247,247,243,0.03)] ${metricBorderClass(status)}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">{label}</p>
        <StatusDot status={status} />
      </div>
      <p className={`mt-3 text-2xl font-semibold tracking-[-0.04em] ${metricTextClass(status)}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}

function RecentChangePanel({ change }: { change: ReturnType<typeof buildRecentChange> }) {
  return (
    <section className="EdgeTrace-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.045em] text-ink">What changed recently</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{change.summary}</p>
        </div>
        <TrendBadge trend={change.direction} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {change.metrics.map((metric) => (
          <DeltaCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="mt-5 border-l border-cyan/35 py-2 pl-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Primary change driver</p>
        <p className="mt-2 text-lg font-semibold tracking-[-0.035em] text-ink">{change.driver}</p>
      </div>
    </section>
  );
}

function DeltaCard({ metric }: { metric: RecentChangeMetric }) {
  return (
    <div className={`border bg-black/18 p-4 ${deltaBorderClass(metric.tone)}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">{metric.label}</p>
      <p className={`mt-3 text-2xl font-semibold tracking-[-0.045em] ${deltaTextClass(metric.tone)}`}>{metric.value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{metric.detail}</p>
    </div>
  );
}

function InspectionPanel({ items, onOpenReport }: { items: AttentionItem[]; onOpenReport: () => void }) {
  return (
    <section className="EdgeTrace-card p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.045em] text-ink">What needs inspection</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Direct priorities from the latest diagnostic and report library.
          </p>
        </div>
        <button className="EdgeTrace-compact-secondary" onClick={onOpenReport}>
          Open report
        </button>
      </div>
      <div className="mt-5">
        {items.map((item, index) => (
          <AttentionRow key={`${item.title}-${index}`} item={item} index={index + 1} />
        ))}
      </div>
    </section>
  );
}

function AttentionRow({ item, index }: { item: AttentionItem; index: number }) {
  return (
    <article className={`grid gap-4 border-b border-white/[0.07] py-4 last:border-b-0 md:grid-cols-[44px_minmax(0,1fr)_auto] md:items-center ${attentionBorderClass(item.severity)}`}>
      <div className={`flex h-11 w-11 items-center justify-center ${attentionBadgeClass(item.severity)}`}>
        {item.icon}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">0{index}</span>
          <h3 className="text-lg font-semibold tracking-[-0.035em] text-ink">{item.title}</h3>
          <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${attentionBadgeClass(item.severity)}`}>
            {item.metric}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
      </div>
      <button className="EdgeTrace-compact-secondary justify-center" onClick={item.onAction}>
        {item.actionLabel}
      </button>
    </article>
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
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.045em] text-ink">Recent reports</h2>
          <p className="mt-2 text-sm text-muted">A short view of recent diagnostics and their core decision metrics.</p>
        </div>
        <button className="EdgeTrace-compact-secondary" onClick={onReports}>
          View all reports
        </button>
      </div>
      <div className="EdgeTrace-card overflow-hidden p-0 shadow-[0_24px_80px_-66px_rgba(88,214,255,0.55)]">
        <div className="hidden grid-cols-[minmax(0,1.2fr)_84px_112px_112px_112px_minmax(160px,0.8fr)_96px] border-b border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted xl:grid">
          <span>Report</span>
          <span>Health</span>
          <span>Net PnL</span>
          <span>Expectancy</span>
          <span>Cost Drag</span>
          <span>Diagnosis</span>
          <span>Action</span>
        </div>
        <div className="divide-y divide-white/[0.08]">
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
      className={`grid gap-4 px-4 py-4 transition xl:grid-cols-[minmax(0,1.2fr)_84px_112px_112px_112px_minmax(160px,0.8fr)_96px] xl:items-center ${
        active ? "bg-cyan/[0.045]" : "hover:bg-white/[0.025]"
      }`}
    >
      <button className="min-w-0 text-left" onClick={onFocus}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-semibold text-ink">{report.name}</p>
          {active && (
            <span className="bg-cyan/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan">
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
        tone={costDrag !== undefined && costDrag > 0.4 ? "warning" : "cyan"}
      />
      <p className="text-sm font-semibold text-ink">{diagnosis}</p>
      <button className="EdgeTrace-compact-secondary justify-center" onClick={onOpen}>
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
    <section className="EdgeTrace-card relative overflow-hidden p-5 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgba(120,97,255,0.13),transparent_18rem)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.045em] text-ink">Strategy set monitoring</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Track related reports as iterations instead of reading isolated diagnostics.
            </p>
          </div>
          <Layers3 className="text-violet" size={26} strokeWidth={1.6} />
        </div>

        {monitoring.collection ? (
          <div className="mt-6">
            <div className="border-l border-violet/35 bg-violet/[0.035] py-2 pl-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-violet">Top strategy set</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-ink">{monitoring.collection.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{monitoring.summary}</p>
                </div>
                <TrendBadge trend={monitoring.direction} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MiniStatus label="Confidence" value={monitoring.confidence} />
                <MiniStatus label="Latest iteration" value={monitoring.latestIteration} />
                <MiniStatus label="Reports" value={String(monitoring.collection.reportCount)} />
              </div>
              <button className="EdgeTrace-command-button mt-5" onClick={() => onOpenStrategySet(monitoring.collection!.id)}>
                Open strategy set <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 border-l border-violet/35 py-2 pl-5">
            <p className="text-xl font-semibold tracking-[-0.035em] text-ink">Create a Strategy Set to track iterations over time.</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Strategy sets group related reports so you can see whether changes are improving performance or creating new leakage.
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
                className="flex items-center justify-between gap-3 bg-black/18 px-4 py-3 text-left hover:bg-violet/[0.045]"
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
    <div className="bg-black/18 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function ReportStat({ label, value, tone }: { label: string; value: string; tone: "cyan" | "warning" | "loss" }) {
  const toneClass = tone === "cyan" ? "text-cyan" : tone === "warning" ? "text-warning" : "text-loss";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted xl:hidden">{label}</p>
      <p className={`mt-1 font-semibold xl:mt-0 ${toneClass}`}>{value}</p>
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
  if (score >= 60) return "text-violet";
  if (score >= 40) return "text-warning";
  return "text-loss";
}

function metricBorderClass(status: MetricStatus) {
  if (status === "healthy") return "border-cyan/24";
  if (status === "warning") return "border-warning/32";
  if (status === "weak") return "border-loss/32";
  return "border-white/[0.1]";
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
  if (trend === "improving") return "border-cyan/38 bg-cyan/[0.08] text-cyan";
  if (trend === "degrading") return "border-loss/36 bg-loss/[0.08] text-loss";
  if (trend === "stable") return "border-violet/36 bg-violet/[0.08] text-violet";
  return "border-white/[0.12] bg-white/[0.035] text-muted";
}

function trendLabel(trend: TrendDirection) {
  if (trend === "improving") return "Improving";
  if (trend === "degrading") return "Degrading";
  if (trend === "stable") return "Stable";
  return "Baseline";
}

function deltaBorderClass(tone: RecentChangeMetric["tone"]) {
  if (tone === "positive") return "border-cyan/24";
  if (tone === "negative") return "border-loss/32";
  if (tone === "warning") return "border-warning/32";
  return "border-white/[0.1]";
}

function deltaTextClass(tone: RecentChangeMetric["tone"]) {
  if (tone === "positive") return "text-cyan";
  if (tone === "negative") return "text-loss";
  if (tone === "warning") return "text-warning";
  return "text-ink";
}

function attentionBorderClass(severity: AttentionItem["severity"]) {
  if (severity === "critical") return "border-loss/28";
  if (severity === "warning") return "border-warning/28";
  return "border-white/[0.07]";
}

function attentionBadgeClass(severity: AttentionItem["severity"]) {
  if (severity === "critical") return "bg-loss/[0.08] text-loss";
  if (severity === "warning") return "bg-warning/[0.08] text-warning";
  return "bg-cyan/[0.08] text-cyan";
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

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
import { getReport, listReports } from "../lib/api";
import { buildReportIntelligence, type MetricStatus } from "../lib/reportIntelligence";
import type { DiagnosticsResult, ReportSummary } from "../types";

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
  actionLabel?: string;
  onAction?: () => void;
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
        const response = await listReports();
        if (cancelled) return;
        const sorted = [...(response.reports ?? [])].sort(
          (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
        );
        setReports(sorted);

        const targetId = selectedReport?.id || selectedId || sorted[0]?.id || "";
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
  const activeTrend = useMemo(() => {
    if (!activeReportLike) return "insufficient";
    const index = chronologicalReports.findIndex((report) => report.id === activeReportLike.id);
    const previous = index > 0 ? chronologicalReports[index - 1] : undefined;
    return trendDirection(activeReportLike, previous);
  }, [activeReportLike, chronologicalReports]);
  const monitoring = useMemo(() => buildMonitoringPreview(chronologicalReports), [chronologicalReports]);

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

  if (isLoading && !safeReport) {
    return (
      <main className="EdgeTrace-shell py-10">
        <section className="EdgeTrace-page-header">
          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-6xl">
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
              <h1 className="max-w-5xl text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-ink md:text-6xl">
                Dashboard
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
                Start with your first diagnostic report to monitor strategy health, inspect leakage, and track
                iteration quality.
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
              <h2 className="mt-5 text-2xl font-semibold tracking-[-0.045em] text-ink">
                Start with your first diagnostic report.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Upload completed trade history to generate strategy diagnostics, attribution, and monitoring workflows.
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
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
          <div>
            <h1 className="max-w-5xl text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-ink md:text-6xl">
              Dashboard
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
              Monitor recent diagnostics, strategy health, and the reports that deserve inspection.
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

          <div className="EdgeTrace-card-soft p-5 shadow-[0_24px_80px_-64px_rgba(88,214,255,0.65)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Active diagnostic</p>
                <p className="mt-2 max-w-[17rem] truncate text-base font-semibold text-ink">
                  {safeReport.strategyLabel || safeReport.name}
                </p>
                <p className="mt-1 text-xs text-muted">{formatDate(safeReport.updatedAt || safeReport.createdAt)}</p>
              </div>
              <span className={`border px-2.5 py-1 text-xs font-semibold ${trendClass(activeTrend)}`}>
                {trendLabel(activeTrend)}
              </span>
            </div>
            <select
              className="mt-4 w-full border border-white/[0.12] bg-black/30 px-4 py-3 text-sm font-semibold text-ink outline-none transition focus:border-cyan"
              value={selectedId}
              onChange={(event) => void handleSelectReport(event.target.value)}
            >
              {reports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.name}
                </option>
              ))}
            </select>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="EdgeTrace-compact-secondary" onClick={onReports}>
                View Library
              </button>
              <button className="EdgeTrace-compact-primary" onClick={() => onOpenReport(safeReport)}>
                Open Report <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="mt-5 border border-loss/50 bg-loss/10 p-4 text-sm text-loss">{error}</div>}

      <section
        className="EdgeTrace-card relative overflow-hidden p-5 shadow-[0_28px_100px_-74px_rgba(88,214,255,0.95)] md:p-8"
        data-testid="dashboard-health-card"
      >
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_86%_6%,rgba(88,214,255,0.14),transparent_24rem),radial-gradient(circle_at_12%_98%,rgba(120,97,255,0.12),transparent_28rem)]" />
        <div className="relative z-10 grid gap-7 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 border border-warning/35 bg-warning/[0.07] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
                  <AlertTriangle size={15} />
                  Primary diagnosis
                </span>
                <TrendBadge trend={activeTrend} />
              </div>
              <h2 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.03] tracking-[-0.06em] text-ink md:text-5xl">
                {intelligence.primaryDiagnosis}
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-7 text-muted">{intelligence.primaryLeak.explanation}</p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="border border-cyan/20 bg-black/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">Where to inspect next</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">{inspectionTitle}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{inspectionReason}</p>
              </div>
              {primaryInspection ? (
                <button
                  className="EdgeTrace-command-button min-h-[3.25rem] px-6"
                  onClick={() =>
                    onDrillDown(safeReport, { dimension: primaryInspection.dimension, group: primaryInspection.group })
                  }
                >
                  Inspect leak <ArrowRight size={16} />
                </button>
              ) : (
                <button className="EdgeTrace-compact-secondary min-h-[3.25rem] px-6" onClick={() => onOpenReport(safeReport)}>
                  Open report <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>

          <aside className="border border-white/[0.1] bg-black/30 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Strategy health</p>
                <p className={`mt-4 text-7xl font-semibold leading-none tracking-[-0.075em] ${scoreClass(intelligence.strategyHealthScore)}`}>
                  {intelligence.strategyHealthScore}
                </p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-ink">{intelligence.healthBand}</p>
              </div>
              <BarChart3 className="text-cyan" size={28} strokeWidth={1.5} />
            </div>
            <p className="mt-5 text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
            <div className="mt-6 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={charts.equityCurve}>
                  <CartesianGrid stroke="#272727" strokeOpacity={0.52} vertical={false} />
                  <XAxis dataKey="trade" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "#101010", border: "1px solid #272727" }}
                    formatter={(value) => [formatTooltipCurrency(value), "Equity"]}
                  />
                  <Line type="monotone" dataKey="equity" stroke="#58D6FF" strokeWidth={3} dot={false} />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
          </aside>
        </div>

        <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <BriefMetric
            label="Net PnL"
            value={currency.format(metrics.netPnl)}
            detail={`${metrics.totalTrades} trades analyzed`}
            status={intelligence.keyMetricStatuses.netPnl}
          />
          <BriefMetric
            label="Expectancy"
            value={currency.format(metrics.expectancy)}
            detail="Average after-cost outcome per trade"
            status={intelligence.keyMetricStatuses.expectancy}
          />
          <BriefMetric
            label="Cost Drag"
            value={intelligence.costDragLabel}
            detail={`Total costs ${currency.format(metrics.totalCosts)}`}
            status={intelligence.keyMetricStatuses.costDrag}
          />
          <BriefMetric
            label="R Capture"
            value={metrics.averageRealizedR === undefined ? "Unavailable" : `${number.format(metrics.averageRealizedR)}R`}
            detail={`Win rate ${percent.format(metrics.winRate)} - PF ${number.format(metrics.profitFactor)}`}
            status={intelligence.keyMetricStatuses.averageR}
          />
        </div>
      </section>

      <section className="mt-9">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.055em] text-ink">Needs attention</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              The highest-signal areas to inspect before reviewing the rest of the library.
            </p>
          </div>
          <button className="EdgeTrace-compact-secondary" onClick={() => onOpenReport(safeReport)}>
            Open Detailed Dashboard
          </button>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {attentionItems.map((item) => (
            <AttentionCard key={item.title} item={item} />
          ))}
        </div>
      </section>

      <section className="mt-9 grid gap-6 xl:grid-cols-[1.16fr_0.84fr]">
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.055em] text-ink">Recent activity</h2>
              <p className="mt-2 text-sm text-muted">Recent diagnostics with the metrics that decide whether to inspect or compare.</p>
            </div>
            <button className="EdgeTrace-compact-secondary" onClick={onReports}>
              View All Reports
            </button>
          </div>
          <div className="EdgeTrace-card p-3 shadow-[0_24px_80px_-66px_rgba(88,214,255,0.55)]">
            <div className="grid gap-2">
              {recentReports.map((report) => (
                <RecentReportRow
                  key={report.id}
                  report={report}
                  active={report.id === safeReport.id}
                  onFocus={() => void handleSelectReport(report.id)}
                  onOpen={() => void openDetailedReport(report.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <MonitoringPreview monitoring={monitoring} reports={chronologicalReports} onUpload={onUpload} />
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
    <div className={`border bg-black/28 p-4 shadow-[inset_0_1px_0_rgba(247,247,243,0.035)] ${metricBorderClass(status)}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
        <StatusDot status={status} />
      </div>
      <p className={`mt-4 text-3xl font-semibold tracking-[-0.055em] ${metricTextClass(status)}`}>{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </div>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  return (
    <article className={`EdgeTrace-card-soft p-5 ${attentionBorderClass(item.severity)}`}>
      <div className="flex items-start justify-between gap-4">
        <div className={attentionTextClass(item.severity)}>{item.icon}</div>
        <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${attentionBadgeClass(item.severity)}`}>
          {item.severity}
        </span>
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-[-0.045em] text-ink">{item.title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
      <p className={`mt-4 text-2xl font-semibold tracking-[-0.055em] ${attentionTextClass(item.severity)}`}>
        {item.metric}
      </p>
      {item.actionLabel && item.onAction && (
        <button className="mt-5 border-b border-cyan/50 text-sm font-semibold text-cyan hover:text-ink" onClick={item.onAction}>
          {item.actionLabel}
        </button>
      )}
    </article>
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
      className={`grid gap-4 border p-4 transition xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)_auto] xl:items-center ${
        active ? "border-cyan/45 bg-cyan/[0.055]" : "border-white/[0.08] bg-black/22 hover:border-white/[0.18]"
      }`}
    >
      <button className="min-w-0 text-left" onClick={onFocus}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-semibold text-ink">{report.name}</p>
          {active && (
            <span className="border border-cyan/35 bg-cyan/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan">
              Focused
            </span>
          )}
        </div>
        <p className="mt-2 text-sm font-semibold text-muted">{diagnosis}</p>
        <p className="mt-1 text-xs text-muted">{formatDate(report.createdAt)}</p>
      </button>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-4">
        <ReportStat label="Health" value={String(score)} tone={score >= 70 ? "cyan" : score >= 45 ? "warning" : "loss"} />
        <ReportStat label="Net PnL" value={currency.format(report.netPnl)} tone={report.netPnl >= 0 ? "cyan" : "loss"} />
        <ReportStat label="Expectancy" value={currency.format(report.expectancy)} tone={report.expectancy >= 0 ? "cyan" : "loss"} />
        <ReportStat
          label="Cost Drag"
          value={costDrag === undefined ? "Unavailable" : percent.format(costDrag)}
          tone={costDrag !== undefined && costDrag > 0.4 ? "warning" : "cyan"}
        />
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {!active && (
          <button className="EdgeTrace-compact-secondary" onClick={onFocus}>
            Focus
          </button>
        )}
        <button className="EdgeTrace-compact-secondary" onClick={onOpen}>
          Open
        </button>
      </div>
    </div>
  );
}

function MonitoringPreview({
  monitoring,
  reports,
  onUpload
}: {
  monitoring: ReturnType<typeof buildMonitoringPreview>;
  reports: ReportSummary[];
  onUpload: () => void;
}) {
  return (
    <section className="EdgeTrace-card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(120,97,255,0.13),transparent_18rem)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.055em] text-ink">Strategy monitoring preview</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Track whether recent diagnostic reports are strengthening, weakening, or stabilizing.
            </p>
          </div>
          <Layers3 className="text-violet" size={26} strokeWidth={1.6} />
        </div>

        {reports.length < 2 ? (
          <div className="mt-6 border border-white/[0.1] bg-black/24 p-5">
            <p className="text-xl font-semibold tracking-[-0.04em] text-ink">Create a Strategy Set to track iterations over time.</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Monitoring becomes useful once related reports can be compared as a strategy progresses.
            </p>
            <button className="EdgeTrace-compact-primary mt-5" onClick={onUpload}>
              Analyze Trades
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {monitoring.timeline.map((item) => (
                <div key={item.id} className="border border-white/[0.08] bg-black/25 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{item.label}</p>
                  <p className={`mt-3 text-2xl font-semibold ${scoreClass(item.score)}`}>{item.score}</p>
                  <p className="mt-1 truncate text-xs text-muted">{item.name}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 border border-violet/30 bg-violet/[0.055] p-4">
              <div className="flex items-center gap-2 text-violet">
                {monitoring.direction === "degrading" ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">{trendLabel(monitoring.direction)}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{monitoring.summary}</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ReportStat({ label, value, tone }: { label: string; value: string; tone: "cyan" | "warning" | "loss" }) {
  const toneClass = tone === "cyan" ? "text-cyan" : tone === "warning" ? "text-warning" : "text-loss";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={`mt-1 font-semibold ${toneClass}`}>{value}</p>
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
  const primaryInspection = intelligence.nextBestInspections[0];
  const highestCostDragReport = [...reports]
    .filter((item) => costDragRatio(item) !== undefined)
    .sort((a, b) => (costDragRatio(b) ?? -1) - (costDragRatio(a) ?? -1))[0];
  const weakestExpectancyReport = [...reports].sort((a, b) => a.expectancy - b.expectancy)[0];
  const largestLossReport = [...reports].sort((a, b) => a.netPnl - b.netPnl)[0];
  const latestReport = chronologicalReports[chronologicalReports.length - 1];
  const previousReport = chronologicalReports[chronologicalReports.length - 2];

  if (primaryInspection) {
    items.push({
      title: primaryInspection.title,
      body: "The recommended segment is the fastest path from summary diagnosis to concrete trades.",
      metric: primaryInspection.metric,
      severity: intelligence.strategyHealthScore < 45 ? "critical" : "warning",
      icon: <Search size={24} strokeWidth={1.7} />,
      actionLabel: "Inspect segment",
      onAction: onInspect
    });
  }

  if (highestCostDragReport && (costDragRatio(highestCostDragReport) ?? 0) > 0.2) {
    items.push({
      title: "Highest cost drag",
      body: `${highestCostDragReport.name} has the strongest execution friction signal in the report library.`,
      metric: percent.format(costDragRatio(highestCostDragReport) ?? 0),
      severity: (costDragRatio(highestCostDragReport) ?? 0) > 0.4 ? "critical" : "warning",
      icon: <Compass size={24} strokeWidth={1.7} />,
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
      icon: <AlertTriangle size={24} strokeWidth={1.7} />,
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
      icon: <TrendIcon size={24} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: () => onOpenReport(largestLossReport.id)
    });
  }

  if (latestReport && previousReport && trendDirection(latestReport, previousReport) === "degrading") {
    items.push({
      title: "Latest behavior is degrading",
      body: `${latestReport.name} moved lower versus ${previousReport.name}.`,
      metric: "Watchlist",
      severity: "warning",
      icon: <TrendingDown size={24} strokeWidth={1.7} />,
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
      icon: <TrendIcon size={24} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: onOpenActiveReport
    });
  }

  if (!items.length) {
    items.push({
      title: "No urgent leak flagged",
      body: "The current report is stable enough to inspect secondary segments or compare the next iteration.",
      metric: "Stable",
      severity: "info",
      icon: <CheckCircle2 size={24} strokeWidth={1.7} />,
      actionLabel: "Open report",
      onAction: onOpenActiveReport
    });
  }

  return items.slice(0, 3);
}

function buildMonitoringPreview(reports: ReportSummary[]) {
  const timeline = reports.slice(-3).map((report, index) => ({
    id: report.id,
    label: `V${Math.max(1, reports.length - Math.min(2, reports.length - 1) + index)}`,
    name: report.name,
    score: scoreReportSummary(report)
  }));
  const current = reports[reports.length - 1];
  const previous = reports[reports.length - 2];
  const direction = current && previous ? trendDirection(current, previous) : "insufficient";
  const best = [...reports].sort((a, b) => scoreReportSummary(b) - scoreReportSummary(a))[0];
  const scoreDelta = current && previous ? scoreReportSummary(current) - scoreReportSummary(previous) : 0;

  return {
    timeline,
    direction,
    summary:
      current && previous
        ? `${current.name} is ${Math.abs(scoreDelta)} health points ${scoreDelta >= 0 ? "above" : "below"} the previous iteration. Best recent report: ${best?.name ?? "Unavailable"}.`
        : "Create another report to compare strategy quality over time."
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

function scoreClass(score: number) {
  if (score >= 80) return "text-profit";
  if (score >= 60) return "text-cyan";
  if (score >= 40) return "text-warning";
  return "text-loss";
}

function metricBorderClass(status: MetricStatus) {
  if (status === "healthy") return "border-cyan/35";
  if (status === "warning") return "border-warning/45";
  if (status === "weak") return "border-loss/45";
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
  if (trend === "improving") return "border-cyan/50 bg-cyan/[0.08] text-cyan";
  if (trend === "degrading") return "border-loss/50 bg-loss/[0.08] text-loss";
  if (trend === "stable") return "border-violet/45 bg-violet/[0.08] text-violet";
  return "border-white/[0.12] bg-white/[0.035] text-muted";
}

function trendLabel(trend: TrendDirection) {
  if (trend === "improving") return "Improving";
  if (trend === "degrading") return "Degrading";
  if (trend === "stable") return "Stable";
  return "Baseline";
}

function attentionBorderClass(severity: AttentionItem["severity"]) {
  if (severity === "critical") return "border-loss/45";
  if (severity === "warning") return "border-warning/45";
  return "border-cyan/25";
}

function attentionTextClass(severity: AttentionItem["severity"]) {
  if (severity === "critical") return "text-loss";
  if (severity === "warning") return "text-warning";
  return "text-cyan";
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

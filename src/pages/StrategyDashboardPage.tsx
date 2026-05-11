import { AlertTriangle, ArrowRight, Compass, Gauge, LineChart as TrendIcon, Search } from "lucide-react";
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
import { buildReportIntelligence } from "../lib/reportIntelligence";
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

  if (isLoading && !safeReport) {
    return (
      <main className="EdgeTrace-shell py-10">
        <section className="border-y border-white/[0.1] py-10">
          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-6xl">
            Loading strategy summary
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
            EdgeTrace is finding the most recent report and building the executive readout.
          </p>
        </section>
      </main>
    );
  }

  if (!safeReport || !intelligence) {
    return (
      <main className="EdgeTrace-shell py-10">
        <section className="border-y border-white/[0.1] py-10">
          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-6xl">
            No strategy report selected
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
            Analyze completed trade history or open a saved diagnostic report to create the high-level EdgeTrace strategy
            summary.
          </p>
          {error && <p className="mt-4 text-sm text-loss">{error}</p>}
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="EdgeTrace-primary-button" onClick={onUpload}>
              Analyze Trades
            </button>
            <button className="EdgeTrace-secondary-button" onClick={onReports}>
              Open Reports
            </button>
          </div>
        </section>
        <CommandPath className="mt-6" context="dashboard_empty" onAnalyze={onUpload} onDashboard={onReports} />
      </main>
    );
  }

  const metrics = safeReport.metrics;
  const charts = safeReport.charts;
  const primaryInspection = intelligence.nextBestInspections[0];

  return (
    <main className="EdgeTrace-shell py-10">
      <section className="border-y border-white/[0.1] py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <h1 className="max-w-5xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-6xl">
              {safeReport.strategyLabel || safeReport.name || "Selected Strategy"}
            </h1>
            <p className="mt-5 max-w-4xl text-base leading-7 text-muted">
              A summary-first readout of the current strategy. Detailed report analytics stay one click away.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="border border-white/[0.12] px-2.5 py-1 text-xs text-muted">
                {safeReport.name ?? "Diagnostic report"}
              </span>
              <span className="border border-white/[0.12] px-2.5 py-1 text-xs text-muted">
                {metrics.totalTrades} trades
              </span>
              {safeReport.createdAt && (
                <span className="border border-white/[0.12] px-2.5 py-1 text-xs text-muted">
                  {formatDate(safeReport.createdAt)}
                </span>
              )}
            </div>
          </div>

          <div className="border border-white/[0.12] bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Current Report</p>
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
            <button
              className="EdgeTrace-compact-secondary mt-4 inline-flex items-center gap-2"
              onClick={() => onOpenReport(safeReport)}
            >
              Full Report <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {error && <div className="mt-5 border border-loss/50 bg-loss/10 p-4 text-sm text-loss">{error}</div>}

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <article
          className="relative overflow-hidden border border-white/[0.12] bg-white/[0.035] p-7 md:p-8"
          data-testid="dashboard-health-card"
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
                <RechartsLineChart data={charts.equityCurve}>
                  <CartesianGrid stroke="#272727" strokeOpacity={0.7} vertical={false} />
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
          </div>
        </article>

        <article className="border border-white/[0.12] bg-white/[0.035] p-7 md:p-8">
          <div className="flex items-center gap-3 text-warning">
            <AlertTriangle size={22} />
            <p className="text-xs font-semibold uppercase tracking-[0.24em]">Primary Diagnosis</p>
          </div>
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
              className="mt-4 w-full border border-white/[0.1] bg-black/24 p-5 text-left transition hover:border-accent/70"
              onClick={() =>
                onDrillDown(safeReport, { dimension: primaryInspection.dimension, group: primaryInspection.group })
              }
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Next Inspection</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">{primaryInspection.title}</p>
              <p className="mt-1 text-sm text-muted">{primaryInspection.reason}</p>
            </button>
          )}
        </article>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        <DashboardMetricCard
          icon={<TrendIcon size={26} />}
          label="After-cost performance"
          value={currency.format(metrics.netPnl)}
          detail={`Expectancy ${currency.format(metrics.expectancy)} per trade`}
          tone={metrics.netPnl >= 0 ? "text-profit" : "text-loss"}
        />
        <DashboardMetricCard
          icon={<Compass size={26} />}
          label="Execution friction"
          value={intelligence.costDragLabel}
          detail={`Total costs ${currency.format(metrics.totalCosts)}`}
          tone={intelligence.keyMetricStatuses.costDrag === "weak" ? "text-warning" : "text-cyan"}
        />
        <DashboardMetricCard
          icon={<Search size={26} />}
          label="Trade quality"
          value={`${number.format(metrics.averageRealizedR ?? 0)}R`}
          detail={`Win rate ${percent.format(metrics.winRate)} · PF ${number.format(metrics.profitFactor)}`}
          tone={intelligence.keyMetricStatuses.averageR === "weak" ? "text-loss" : "text-cyan"}
        />
      </section>

      <section className="mt-6 border-y border-white/[0.1] py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Where To Look Next</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">Recommended investigation paths</h2>
          </div>
          <button className="EdgeTrace-compact-secondary" onClick={() => onOpenReport(safeReport)}>
            Open Detailed Dashboard
          </button>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {intelligence.nextBestInspections.map((inspection) => (
            <button
              key={`${inspection.dimension}-${inspection.group}`}
              className="group border border-white/[0.1] bg-white/[0.03] p-6 text-left transition hover:border-cyan/70 hover:bg-white/[0.055]"
              onClick={() => onDrillDown(safeReport, { dimension: inspection.dimension, group: inspection.group })}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">{inspection.reason}</p>
              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-ink">{inspection.title}</h3>
              <p className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-muted group-hover:text-cyan">
                {inspection.metric}
              </p>
            </button>
          ))}
          {!intelligence.nextBestInspections.length && (
            <div className="border border-white/[0.1] bg-white/[0.03] p-6 text-sm text-muted">
              No segment-level inspection path is available for this report yet.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function DashboardMetricCard({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <article className="border border-white/[0.12] bg-white/[0.035] p-7">
      <div className={`mb-8 inline-flex border border-white/[0.1] bg-black/24 p-3 ${tone}`}>{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className={`mt-5 text-4xl font-semibold tracking-[-0.055em] ${tone}`}>{value}</p>
      <p className="mt-4 text-sm leading-6 text-muted">{detail}</p>
    </article>
  );
}

function scoreClass(score: number) {
  if (score >= 80) return "text-profit";
  if (score >= 60) return "text-cyan";
  if (score >= 40) return "text-warning";
  return "text-loss";
}

function formatTooltipCurrency(value: unknown) {
  return typeof value === "number" ? preciseCurrency.format(value) : String(value ?? "Unavailable");
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

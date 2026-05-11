import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CommandPath } from "../components/onboarding/CommandPath";
import { PaywallGate } from "../components/PaywallGate";
import { formatReportType } from "../components/ReportDetailsEditor";
import { SavedComparisonEditor } from "../components/SavedComparisonEditor";
import { trackEvent } from "../lib/analytics";
import { deleteSavedComparison, getReport, listReports, listSavedComparisons } from "../lib/api";
import { canCreateSavedComparison, canUseFeature, formatLimit, getPlanConfig } from "../lib/entitlements";
import {
  breakdownLabels,
  buildBreakdown,
  buildBreakdownInterpretation,
  compareBreakdowns,
  type BreakdownComparisonRow,
  type BreakdownDimension
} from "../lib/breakdowns";
import {
  buildComparisonMetrics,
  buildInterpretation,
  costDragPct,
  netToGrossPct,
  type ComparisonMetric
} from "../lib/compare";
import type { DiagnosticsResult, ReportSummary, ReportType, SavedComparison, UserProfile } from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function ComparePage({
  profile,
  onAnalyze,
  onReports,
  onDrillDown,
  initialReportAId,
  initialReportBId
}: {
  profile: UserProfile | null;
  onAnalyze: () => void;
  onReports?: () => void;
  initialReportAId?: string;
  initialReportBId?: string;
  onDrillDown?: (selection: {
    reportA: DiagnosticsResult;
    reportB: DiagnosticsResult;
    dimension: BreakdownDimension;
    group: string;
  }) => void;
}) {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [reportAId, setReportAId] = useState("");
  const [reportBId, setReportBId] = useState("");
  const [reportA, setReportA] = useState<DiagnosticsResult | null>(null);
  const [reportB, setReportB] = useState<DiagnosticsResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [breakdownDimension, setBreakdownDimension] = useState<BreakdownDimension>("symbol");
  const [reportSearch, setReportSearch] = useState("");
  const [reportTypeFilter, setReportTypeFilter] = useState<"all" | ReportType>("all");
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]);
  const [editingComparison, setEditingComparison] = useState<SavedComparison | "new" | null>(null);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [trackedComparisonKey, setTrackedComparisonKey] = useState("");

  useEffect(() => {
    trackEvent("compare_opened");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryReportAId = params.get("reportAId") ?? undefined;
    const queryReportBId = params.get("reportBId") ?? undefined;
    setIsLoadingReports(true);
    listReports()
      .then(({ reports }) => {
        const safeReports = Array.isArray(reports) ? reports : [];
        const requestedReportAId = queryReportAId ?? initialReportAId;
        const requestedReportBId = queryReportBId ?? initialReportBId;
        setReports(safeReports);
        setReportAId(requestedReportAId ?? safeReports[1]?.id ?? safeReports[0]?.id ?? "");
        setReportBId(
          requestedReportAId && !requestedReportBId ? "" : requestedReportBId ?? safeReports[0]?.id ?? ""
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load reports. Create or reload reports before comparing."))
      .finally(() => setIsLoadingReports(false));
    listSavedComparisons()
      .then(({ comparisons }) => setSavedComparisons(comparisons))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load saved comparisons"));
  }, [initialReportAId, initialReportBId]);

  useEffect(() => {
    if (!reportAId || !reportBId || reportAId === reportBId) {
      setReportA(null);
      setReportB(null);
      return;
    }

    setIsLoading(true);
    setError("");
    Promise.all([getReport(reportAId), getReport(reportBId)])
      .then(([nextA, nextB]) => {
        setReportA(nextA);
        setReportB(nextB);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load comparison"))
      .finally(() => setIsLoading(false));
  }, [reportAId, reportBId]);

  useEffect(() => {
    if (!reportA || !reportB || reportA.id === reportB.id) return;
    const key = `${reportA.id}:${reportB.id}`;
    if (trackedComparisonKey === key) return;
    setTrackedComparisonKey(key);
    trackEvent("comparison_created", {
      reportAId: reportA.id,
      reportBId: reportB.id
    });
  }, [reportA, reportB, trackedComparisonKey]);

  const metrics = useMemo(
    () => (reportA && reportB ? buildComparisonMetrics(reportA, reportB) : []),
    [reportA, reportB]
  );
  const interpretation = useMemo(() => buildInterpretation(metrics), [metrics]);
  const breakdownComparison = useMemo(() => {
    if (!reportA || !reportB) return [];
    return compareBreakdowns(
      buildBreakdown(Array.isArray(reportA.trades) ? reportA.trades : [], breakdownDimension),
      buildBreakdown(Array.isArray(reportB.trades) ? reportB.trades : [], breakdownDimension)
    );
  }, [breakdownDimension, reportA, reportB]);
  const breakdownInterpretation = useMemo(
    () => buildBreakdownInterpretation(breakdownComparison, breakdownLabels[breakdownDimension]),
    [breakdownComparison, breakdownDimension]
  );
  const strategyOptions = useMemo(
    () => unique(reports.map((report) => report.strategyLabel).filter(Boolean) as string[]),
    [reports]
  );
  const tagOptions = useMemo(() => unique(reports.flatMap((report) => report.tags ?? [])), [reports]);
  const filteredReports = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();
    return reports.filter((report) => {
      const haystack = [
        report.name,
        report.strategyLabel ?? "",
        report.reportType,
        report.notesPreview ?? "",
        report.notes ?? "",
        ...(report.tags ?? [])
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || haystack.includes(query)) &&
        (reportTypeFilter === "all" || report.reportType === reportTypeFilter) &&
        (strategyFilter === "all" || report.strategyLabel === strategyFilter) &&
        (tagFilter === "all" || (report.tags ?? []).includes(tagFilter))
      );
    });
  }, [reportSearch, reportTypeFilter, reports, strategyFilter, tagFilter]);
  const selectableReports = useMemo(() => {
    const selected = reports.filter((report) => report.id === reportAId || report.id === reportBId);
    return uniqueReports([...selected, ...filteredReports]);
  }, [filteredReports, reportAId, reportBId, reports]);
  const plan = getPlanConfig(profile?.planId);
  const canSaveMoreComparisons = canCreateSavedComparison(plan, savedComparisons.length);
  const comparisonAccessLevel = canUseFeature(plan, "full_compare") ? "full" : "preview";

  const metricChartData =
    reportA && reportB
      ? [
          { metric: "Net PnL", "Report A": reportA.metrics.netPnl, "Report B": reportB.metrics.netPnl },
          { metric: "Gross PnL", "Report A": reportA.metrics.grossPnl, "Report B": reportB.metrics.grossPnl },
          { metric: "Costs", "Report A": reportA.metrics.totalCosts, "Report B": reportB.metrics.totalCosts },
          { metric: "Expectancy", "Report A": reportA.metrics.expectancy, "Report B": reportB.metrics.expectancy }
        ]
      : [];

  const costChartData =
    reportA && reportB
      ? [
          { report: "Report A", "Cost Drag": (costDragPct(reportA) ?? 0) * 100 },
          { report: "Report B", "Cost Drag": (costDragPct(reportB) ?? 0) * 100 }
        ]
      : [];

  const focusComparisonControls = () => {
    document.querySelector("[data-testid='report-b-select']")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="EdgeTrace-shell py-10" data-testid="compare-page">
      <div className="EdgeTrace-page-header mb-8 grid gap-8 xl:grid-cols-[1fr_360px] xl:items-end">
        <div>
          <p className="EdgeTrace-eyebrow">Compare</p>
          <h1 className="EdgeTrace-title">Diagnostic report comparison</h1>
          <p className="EdgeTrace-copy">
            A comparison shows what changed between two reports. Compare strategy iterations to see whether performance
            changed through costs, expectancy, R capture, or segment mix.
          </p>
        </div>
        <div className="EdgeTrace-card-soft relative z-10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Available reports</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{reports.length}</p>
          <p className="mt-1 text-sm text-muted">reports ready to compare</p>
          <p className="mt-3 text-xs text-muted">
            Saved comparisons: {savedComparisons.length} of {formatLimit(plan.limits.maxSavedComparisons)}
          </p>
          <button className="EdgeTrace-primary-button mt-5 w-full" onClick={onAnalyze}>
            Analyze Trades
          </button>
        </div>
      </div>

      <CommandPath className="mb-8" context="compare" onAnalyze={onAnalyze} onCompare={focusComparisonControls} />

      {error && <div className="mb-5 rounded-md border border-loss/60 bg-loss/10 p-4 text-loss">{error}</div>}

      <section className="EdgeTrace-card p-5">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.16em] text-muted">Find Reports</span>
            <input
              className="mt-2 w-full rounded-md border border-line bg-graphite/80 px-4 py-3 text-sm text-ink outline-none focus:border-cyan"
              placeholder="Search name, strategy, tag, notes"
              value={reportSearch}
              onChange={(event) => setReportSearch(event.target.value)}
            />
          </label>
          <FilterSelect
            label="Report Type"
            value={reportTypeFilter}
            onChange={(value) => setReportTypeFilter(value as "all" | ReportType)}
          >
            <option value="all">All types</option>
            {(["backtest", "paper", "live", "imported", "unknown"] as ReportType[]).map((type) => (
              <option key={type} value={type}>
                {formatReportType(type)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Strategy" value={strategyFilter} onChange={setStrategyFilter}>
            <option value="all">All strategies</option>
            {strategyOptions.map((strategy) => (
              <option key={strategy} value={strategy}>
                {strategy}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Tag" value={tagFilter} onChange={setTagFilter}>
            <option value="all">All tags</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </FilterSelect>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ReportSelect label="Report A" testId="report-a-select" value={reportAId} reports={selectableReports} onChange={setReportAId} />
          <ReportSelect label="Report B" testId="report-b-select" value={reportBId} reports={selectableReports} onChange={setReportBId} />
        </div>
        <p className="mt-3 text-xs text-muted">
          Showing {filteredReports.length} of {reports.length} saved reports.
        </p>
      </section>

      {isLoadingReports && (
        <section className="EdgeTrace-card mt-6 p-8">
          <p className="font-semibold">Loading reports...</p>
          <p className="mt-2 text-sm text-muted">Saved reports will appear here for comparison selection.</p>
        </section>
      )}

      {!isLoadingReports && reports.length < 2 && (
        <section className="EdgeTrace-card mt-6 p-8">
          <p className="text-2xl font-semibold tracking-[-0.04em] text-ink">Comparisons unlock after you create reports.</p>
          <p className="mt-2 text-sm text-muted">
            Create at least two diagnostic reports to see what improved, degraded, or introduced new leakage.
          </p>
          <p className="mt-2 text-xs text-muted">
            The workflow guide will mark this step complete after you open a comparison.
          </p>
          {reports.length === 1 && (
            <div className="mt-5 border border-white/[0.1] bg-black/24 p-4 text-sm">
              <p className="font-semibold text-ink">{reports[0].name}</p>
              <p className="mt-1 text-muted">One report is ready. Create another report to compare against it.</p>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="EdgeTrace-primary-button" onClick={onAnalyze}>
              {reports.length === 1 ? "Create Another Report" : "Analyze Trades"}
            </button>
            {onReports && (
              <button className="EdgeTrace-secondary-button" onClick={onReports}>
                View Reports
              </button>
            )}
            <button className="EdgeTrace-secondary-button" onClick={openFeatureGuide}>
              Learn how this works
            </button>
          </div>
        </section>
      )}

      {!isLoadingReports && reportAId && !reportBId && reports.length >= 2 && (
        <section className="mt-6 border border-cyan/40 bg-cyan/10 p-4 text-sm text-cyan">
          Select another report to compare against this one.
        </section>
      )}

      {reportAId && reportAId === reportBId && reports.length >= 2 && (
        <section className="mt-6 rounded-lg border border-warning/70 bg-warning/10 p-4 text-warning">
          Select two different reports to compare.
        </section>
      )}

      {isLoading && <p className="mt-6 text-sm text-muted">Loading comparison...</p>}

      {reportA && reportB && (
        <>
          <section className="mt-6 flex flex-wrap gap-3">
            <button
              className="EdgeTrace-compact-secondary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSaveMoreComparisons}
              onClick={() => setEditingComparison("new")}
            >
              Save Comparison
            </button>
            {!canSaveMoreComparisons && (
              <p className="self-center text-sm text-warning">
                Free plan allows 1 saved comparison. Existing comparisons remain available.
              </p>
            )}
          </section>

          <SavedComparisonsPanel
            comparisons={savedComparisons}
            onOpen={(comparison) => {
              setReportAId(comparison.reportAId);
              setReportBId(comparison.reportBId);
              if (comparison.dimension && ["symbol", "setup", "strategy", "timeOfDay"].includes(comparison.dimension)) {
                setBreakdownDimension(comparison.dimension as BreakdownDimension);
              }
            }}
            onEdit={(comparison) => setEditingComparison(comparison)}
            onDelete={async (comparison) => {
              if (!window.confirm("Delete this saved comparison? Reports will not be deleted.")) return;
              await deleteSavedComparison(comparison.id);
              setSavedComparisons((current) => current.filter((item) => item.id !== comparison.id));
            }}
          />

          <PaywallGate
            feature="full_compare"
            accessLevel={comparisonAccessLevel}
            title="Upgrade to inspect the full comparison breakdown."
            description="Comparisons show what improved, degraded, or introduced new leakage between reports."
          >
          <section className="EdgeTrace-card mt-8 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Interpretation</p>
            <p className="mt-3 max-w-4xl text-base leading-7 text-ink">{interpretation}</p>
            <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
              <SummaryLine label="Expectancy Change" value={currency.format(reportB.metrics.expectancy - reportA.metrics.expectancy)} />
              <SummaryLine
                label="R Behavior Change"
                value={
                  reportA.metrics.averageRealizedR === undefined || reportB.metrics.averageRealizedR === undefined
                    ? "N/A"
                    : number.format(reportB.metrics.averageRealizedR - reportA.metrics.averageRealizedR)
                }
              />
              <SummaryLine label="Report A Net-to-Gross" value={formatOptional(netToGrossPct(reportA), "percent")} />
              <SummaryLine label="Report B Net-to-Gross" value={formatOptional(netToGrossPct(reportB), "percent")} />
            </div>
          </section>

          <section className="mt-8 grid gap-4 xl:grid-cols-2">
            <ChartPanel title="Metric Comparison">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={metricChartData}>
                  <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
                  <XAxis dataKey="metric" stroke="#9CA8C7" />
                  <YAxis stroke="#9CA8C7" />
                  <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
                  <Bar dataKey="Report A" fill="#3E8BFF" />
                  <Bar dataKey="Report B" fill="#45D5FF" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Cost Drag Comparison">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={costChartData}>
                  <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
                  <XAxis dataKey="report" stroke="#9CA8C7" />
                  <YAxis stroke="#9CA8C7" />
                  <Tooltip contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }} />
                  <Bar dataKey="Cost Drag" fill="#FFB84D" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            {metrics.map((metric) => (
              <MetricComparisonCard key={metric.key} metric={metric} />
            ))}
          </section>

          <section className="mt-8">
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-accent">Breakdown Comparison</p>
                <h2 className="mt-2 text-2xl font-semibold">Where performance changed</h2>
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
                    onClick={() => setBreakdownDimension(dimension)}
                  >
                    {breakdownLabels[dimension]}
                  </button>
                ))}
              </div>
            </div>

            <section className="EdgeTrace-card mb-4 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Segment Interpretation</p>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-ink">{breakdownInterpretation}</p>
            </section>

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="min-w-full divide-y divide-line text-sm">
                <thead className="bg-panel text-left text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{breakdownLabels[breakdownDimension]}</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">A Net PnL</th>
                    <th className="px-4 py-3 font-medium">B Net PnL</th>
                    <th className="px-4 py-3 font-medium">Net Delta</th>
                    <th className="px-4 py-3 font-medium">A Expectancy</th>
                    <th className="px-4 py-3 font-medium">B Expectancy</th>
                    <th className="px-4 py-3 font-medium">Exp Delta</th>
                    <th className="px-4 py-3 font-medium">A Cost Drag</th>
                    <th className="px-4 py-3 font-medium">B Cost Drag</th>
                    <th className="px-4 py-3 font-medium">Cost Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {breakdownComparison.map((row) => (
                    <BreakdownComparisonTableRow
                      key={row.group}
                      row={row}
                      onOpen={() => {
                        trackEvent("drilldown_opened", {
                          source: "compare",
                          dimension: breakdownDimension,
                          group: row.group,
                          reportAId: reportA.id,
                          reportBId: reportB.id
                        });
                        onDrillDown?.({
                          reportA,
                          reportB,
                          dimension: breakdownDimension,
                          group: row.group
                        });
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </PaywallGate>
        </>
      )}

      {editingComparison && (
        <SavedComparisonEditor
          comparison={editingComparison === "new" ? undefined : editingComparison}
          defaultInput={{
            name: reportA && reportB ? `${reportA.name ?? "Report A"} vs ${reportB.name ?? "Report B"}` : "",
            reportAId,
            reportBId,
            dimension: breakdownDimension
          }}
          onCancel={() => setEditingComparison(null)}
          onSaved={(saved) => {
            setSavedComparisons((current) => {
              const exists = current.some((comparison) => comparison.id === saved.id);
              return exists
                ? current.map((comparison) => (comparison.id === saved.id ? saved : comparison))
                : [saved, ...current];
            });
            setEditingComparison(null);
          }}
        />
      )}
      {reports.length >= 2 && savedComparisons.length === 0 && (
        <section className="EdgeTrace-card mt-6 p-5">
          <p className="font-semibold">No saved comparisons yet</p>
          <p className="mt-2 text-sm text-muted">
            Select two reports, review the comparison, then save it for repeated strategy review.
          </p>
        </section>
      )}
    </main>
  );
}

function SavedComparisonsPanel({
  comparisons,
  onOpen,
  onEdit,
  onDelete
}: {
  comparisons: SavedComparison[];
  onOpen: (comparison: SavedComparison) => void;
  onEdit: (comparison: SavedComparison) => void;
  onDelete: (comparison: SavedComparison) => Promise<void>;
}) {
  if (comparisons.length === 0) return null;
  return (
    <section className="EdgeTrace-card mt-6 p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Saved Comparisons</p>
      <div className="mt-4 grid gap-3">
        {comparisons.map((comparison) => (
          <div key={comparison.id} className="rounded-md border border-line bg-graphite p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-semibold">{comparison.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {comparison.reportAName ?? comparison.reportAId} vs {comparison.reportBName ?? comparison.reportBId}
                </p>
                {comparison.description && <p className="mt-2 text-sm text-muted">{comparison.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={() => onOpen(comparison)}>Open</button>
                <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={() => onEdit(comparison)}>Edit</button>
                <button className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:border-loss hover:text-loss" onClick={() => void onDelete(comparison)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportSelect({
  label,
  testId,
  value,
  reports,
  onChange
}: {
  label: string;
  testId?: string;
  value: string;
  reports: ReportSummary[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.16em] text-muted">{label}</span>
      <select
        className="mt-2 w-full rounded-md border border-line bg-graphite/80 px-4 py-3 text-sm text-ink outline-none focus:border-cyan"
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select report</option>
        {reports.map((report) => (
          <option key={report.id} value={report.id}>
            {report.name} · {report.strategyLabel || "No strategy"} · {formatReportType(report.reportType)} · Net{" "}
            {currency.format(report.netPnl)} · Exp {currency.format(report.expectancy)}
          </option>
        ))}
      </select>
      {value && (
        <ReportSelectionCard report={reports.find((report) => report.id === value)} />
      )}
    </label>
  );
}

function ReportSelectionCard({ report }: { report: ReportSummary | undefined }) {
  if (!report) return null;
  return (
    <div className="mt-3 rounded-md border border-line bg-graphite p-3 text-xs">
      <div className="flex flex-wrap gap-2">
        <span className="rounded border border-line px-2 py-1 text-muted">{formatReportType(report.reportType)}</span>
        {report.strategyLabel && (
          <span className="rounded border border-accent/60 px-2 py-1 text-accent">{report.strategyLabel}</span>
        )}
        {(report.tags ?? []).slice(0, 4).map((tag) => (
          <span key={tag} className="rounded border border-line px-2 py-1 text-muted">
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-muted">
        <span>Created {new Date(report.createdAt).toLocaleDateString()}</span>
        <span>Trades {report.totalTrades}</span>
        <span>Win {percent.format(report.winRate)}</span>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.16em] text-muted">{label}</span>
      <select
        className="mt-2 w-full rounded-md border border-line bg-graphite/80 px-4 py-3 text-sm text-ink outline-none focus:border-cyan"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function MetricComparisonCard({ metric }: { metric: ComparisonMetric }) {
  return (
    <div className="EdgeTrace-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">{metric.label}</p>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <MetricValue label="Report A" value={metric.labelA ?? formatOptional(metric.valueA, metric.format)} />
            <MetricValue label="Report B" value={metric.labelB ?? formatOptional(metric.valueB, metric.format)} />
          </div>
        </div>
        <span className={`rounded-md border px-3 py-1 text-xs font-semibold ${statusClass(metric.status)}`}>
          {metric.status}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted">
        <span>Change: {formatOptional(metric.delta, metric.format, true)}</span>
        <span>Delta: {metric.deltaPct === undefined ? "N/A" : percent.format(metric.deltaPct)}</span>
      </div>
    </div>
  );
}

function MetricValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-graphite px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="EdgeTrace-card p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
      {children}
    </div>
  );
}

function formatOptional(value: number | undefined, format: ComparisonMetric["format"], signed = false) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  const prefix = signed && value > 0 ? "+" : "";
  if (format === "currency") return `${prefix}${currency.format(value)}`;
  if (format === "percent") return `${prefix}${percent.format(value)}`;
  return `${prefix}${number.format(value)}`;
}

function statusClass(status: ComparisonMetric["status"]) {
  if (status === "Improved") return "border-accent/70 bg-accent/10 text-accent";
  if (status === "Degraded") return "border-loss/70 bg-loss/10 text-loss";
  if (status === "Flat") return "border-line bg-graphite text-muted";
  return "border-warning/70 bg-warning/10 text-warning";
}

function BreakdownComparisonTableRow({ row, onOpen }: { row: BreakdownComparisonRow; onOpen?: () => void }) {
  return (
    <tr
      className={`cursor-pointer hover:bg-line/30 ${
        row.status === "Improved" ? "bg-accent/5" : row.status === "Degraded" ? "bg-loss/5" : ""
      }`}
      onClick={onOpen}
    >
      <td className="px-4 py-3 font-medium">{row.group}</td>
      <td className="px-4 py-3">
        <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${breakdownStatusClass(row.status)}`}>
          {row.status}
        </span>
      </td>
      <td className="px-4 py-3">{formatOptional(row.reportANetPnl, "currency")}</td>
      <td className="px-4 py-3">{formatOptional(row.reportBNetPnl, "currency")}</td>
      <td className={deltaClass(row.netPnlDelta, false)}>{formatOptional(row.netPnlDelta, "currency", true)}</td>
      <td className="px-4 py-3">{formatOptional(row.reportAExpectancy, "currency")}</td>
      <td className="px-4 py-3">{formatOptional(row.reportBExpectancy, "currency")}</td>
      <td className={deltaClass(row.expectancyDelta, false)}>
        {formatOptional(row.expectancyDelta, "currency", true)}
      </td>
      <td className="px-4 py-3">{row.reportACostDragLabel}</td>
      <td className="px-4 py-3">{row.reportBCostDragLabel}</td>
      <td className={deltaClass(row.costDragDelta, true)}>{formatOptional(row.costDragDelta, "percent", true)}</td>
    </tr>
  );
}

function breakdownStatusClass(status: BreakdownComparisonRow["status"]) {
  if (status === "Improved") return "border-accent/70 bg-accent/10 text-accent";
  if (status === "Degraded" || status === "Missing") return "border-loss/70 bg-loss/10 text-loss";
  if (status === "New") return "border-warning/70 bg-warning/10 text-warning";
  return "border-line bg-graphite text-muted";
}

function deltaClass(value: number | undefined, lowerIsBetter: boolean) {
  if (value === undefined || Math.abs(value) < 0.0001) return "px-4 py-3 text-muted";
  const improved = lowerIsBetter ? value < 0 : value > 0;
  return improved ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss";
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniqueReports(reports: ReportSummary[]) {
  const byId = new Map<string, ReportSummary>();
  reports.forEach((report) => byId.set(report.id, report));
  return [...byId.values()];
}

function openFeatureGuide() {
  window.history.pushState(null, "", "/app/how-it-works?feature=compare");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

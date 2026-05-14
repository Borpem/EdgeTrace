import { Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AddToStrategySetDialog } from "../components/AddToStrategySetDialog";
import { CommandPath } from "../components/onboarding/CommandPath";
import { formatReportType, ReportDetailsEditor } from "../components/ReportDetailsEditor";
import { WorkflowDiagram } from "../components/visuals/WorkflowDiagram";
import { deleteReport, getReport, listReports } from "../lib/api";
import { getPlanConfig, formatLimit } from "../lib/entitlements";
import type { DiagnosticsResult, ReportSummary, ReportType, UserProfile } from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const reportTypes: ReportType[] = ["backtest", "paper", "live", "imported", "unknown"];

export function ReportsPage({
  profile,
  onOpen,
  onAnalyze,
  onCompare,
  onExploreDemo
}: {
  profile: UserProfile | null;
  onOpen: (result: DiagnosticsResult) => void;
  onAnalyze: () => void;
  onCompare?: (reportId?: string) => void;
  onExploreDemo?: () => void;
}) {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [error, setError] = useState("");
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<ReportSummary | null>(null);
  const [collectionReport, setCollectionReport] = useState<ReportSummary | null>(null);
  const [search, setSearch] = useState("");
  const [reportTypeFilter, setReportTypeFilter] = useState<"all" | ReportType>("all");
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const reportsRef = useRef<ReportSummary[]>([]);
  const loadSequenceRef = useRef(0);

  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  const loadReports = async () => {
    const loadId = ++loadSequenceRef.current;
    setError("");
    setIsLoadingReports(true);
    try {
      const response = await listReports();
      if (loadId !== loadSequenceRef.current) return;
      setReports(Array.isArray(response.reports) ? response.reports.map(normalizeReportSummary) : []);
    } catch (err) {
      if (loadId !== loadSequenceRef.current) return;
      if (reportsRef.current.length > 0) {
        console.warn("[reports] Non-blocking reports refresh failed after reports were already loaded.", err);
        return;
      }
      setError(formatReportsLoadError(err));
    } finally {
      if (loadId === loadSequenceRef.current) setIsLoadingReports(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, []);

  const strategyOptions = useMemo(
    () => unique(reports.map((report) => report.strategyLabel).filter(Boolean) as string[]),
    [reports]
  );
  const tagOptions = useMemo(() => unique(reports.flatMap((report) => report.tags ?? [])), [reports]);
  const plan = getPlanConfig(profile?.planId);
  const billableReportCount = useMemo(() => reports.filter((report) => !isDemoReport(report)).length, [reports]);
  const fullReportLimit = plan.limits.maxFullReports;
  const fullReportUsage =
    fullReportLimit === "unlimited" ? billableReportCount : Math.min(billableReportCount, fullReportLimit);
  const hasPreviewReports = plan.id === "free" && billableReportCount > Number(plan.limits.maxFullReports);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      const haystack = [
        safeText(report.name),
        safeText(report.notes),
        safeText(report.notesPreview),
        safeText(report.strategyLabel),
        safeText(report.reportType),
        ...(report.tags ?? [])
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || haystack.includes(query);
      const matchesType = reportTypeFilter === "all" || report.reportType === reportTypeFilter;
      const matchesStrategy = strategyFilter === "all" || report.strategyLabel === strategyFilter;
      const matchesTag = tagFilter === "all" || (report.tags ?? []).includes(tagFilter);
      return matchesSearch && matchesType && matchesStrategy && matchesTag;
    });
  }, [reports, reportTypeFilter, search, strategyFilter, tagFilter]);

  const openReport = async (id: string) => {
    setLoadingId(id);
    setError("");
    try {
      onOpen(await getReport(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open report");
    } finally {
      setLoadingId(null);
    }
  };

  const removeReport = async (id: string) => {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    setLoadingId(id);
    setError("");
    try {
      await deleteReport(id);
      setReports((current) => current.filter((report) => report.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete report. No other reports were changed.");
    } finally {
      setLoadingId(null);
    }
  };

  const updateReportInList = (updated: ReportSummary) => {
    const normalized = normalizeReportSummary(updated);
    setReports((current) => current.map((report) => (report.id === normalized.id ? normalized : report)));
    setEditingReport(null);
  };

  return (
    <main className="EdgeTrace-shell py-10">
      <div className="EdgeTrace-page-header mb-8 grid gap-8 xl:grid-cols-[1fr_360px] xl:items-end">
        <div>
          <h1 className="EdgeTrace-title">Strategy research library</h1>
          <p className="EdgeTrace-copy">
            Review, filter, and organize saved diagnostic reports by strategy, tag, workflow stage, and research notes.
          </p>
        </div>
        <div className="EdgeTrace-card-soft relative z-10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Library status</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{reports.length}</p>
          <p className="mt-1 text-sm text-muted">saved diagnostic reports</p>
          <p className="mt-3 text-xs text-muted">
            Full report access: {fullReportUsage} of {formatLimit(fullReportLimit)}
          </p>
          {hasPreviewReports && (
            <p className="mt-2 text-xs text-warning">Additional Free reports open as previews. Upgrade to Pro to unlock the full strategy workflow.</p>
          )}
          <button className="EdgeTrace-primary-button mt-5 w-full" onClick={onAnalyze}>
            Analyze Trades
          </button>
        </div>
      </div>

      {error && <div className="mb-5 rounded-md border border-loss/60 bg-loss/10 p-4 text-loss">{error}</div>}

      {reports.length > 0 && (
        <section className="EdgeTrace-card mb-6 p-5">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.14em] text-muted">Search</span>
              <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-graphite/80 px-3 py-2 focus-within:border-cyan">
                <Search size={16} className="text-muted" />
                <input
                  className="w-full bg-transparent text-sm text-ink outline-none"
                  placeholder="Name, notes, tag, strategy, type"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </label>
            <FilterSelect
              label="Report Type"
              value={reportTypeFilter}
              onChange={(value) => setReportTypeFilter(value as "all" | ReportType)}
            >
              <option value="all">All types</option>
              {reportTypes.map((type) => (
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
        </section>
      )}

      {isLoadingReports ? (
        <section className="EdgeTrace-card p-8">
          <p className="font-semibold">Loading reports...</p>
          <p className="mt-2 text-sm text-muted">EdgeTrace is opening your saved diagnostic library.</p>
        </section>
      ) : reports.length === 0 ? (
        <section className="EdgeTrace-card p-8">
          <WorkflowDiagram steps={["Upload", "Report", "Insight"]} activeIndex={0} compact className="mb-6 max-w-2xl" />
          <p className="text-2xl font-semibold tracking-[-0.04em] text-ink">Start with your first diagnostic report.</p>
          <p className="mt-2 text-sm text-muted">
            Upload completed trade history and EdgeTrace will identify the first performance leaks to inspect.
          </p>
          <p className="mt-2 text-xs text-muted">
            The workflow guide will stay available until your first diagnostic report is created.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="EdgeTrace-primary-button" onClick={onAnalyze}>
              Analyze Trades
            </button>
            {onExploreDemo && (
              <button className="EdgeTrace-secondary-button" onClick={onExploreDemo}>
                Load Demo Workspace
              </button>
            )}
            <button className="EdgeTrace-secondary-button" onClick={openFeatureGuide}>
              Learn how this works
            </button>
          </div>
          <CommandPath className="mt-7" context="reports_empty" onAnalyze={onAnalyze} />
        </section>
      ) : filteredReports.length === 0 ? (
        <section className="EdgeTrace-card p-8">
          <p className="font-semibold">No reports match these filters</p>
          <p className="mt-2 text-sm text-muted">Clear a filter or search for another strategy label, tag, or note.</p>
        </section>
      ) : (
        <section className="grid gap-4" data-testid="reports-list">
          {filteredReports.map((report) => (
            <article key={report.id} className="EdgeTrace-card p-5 transition hover:border-accent/80 hover:shadow-accent/10">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="text-left text-xl font-semibold text-ink hover:text-cyan"
                      disabled={loadingId === report.id}
                      onClick={() => void openReport(report.id)}
                    >
                      {report.name}
                    </button>
                    <Badge>{formatReportType(report.reportType)}</Badge>
                    {report.strategyLabel && <Badge tone="accent">{report.strategyLabel}</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(report.tags ?? []).map((tag) => (
                      <span key={tag} className="rounded-md border border-line bg-graphite/80 px-2 py-1 text-xs text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                  {(report.notesPreview || report.notes) && (
                    <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{report.notesPreview ?? report.notes}</p>
                  )}
                  <p className="mt-3 text-xs text-muted">
                    Created {formatDate(report.createdAt)} · Updated {formatDate(report.updatedAt)}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Source: {formatProvenanceSource(report)} · Confidence:{" "}
                    {report.importProvenance?.confidenceLabel ?? "Unavailable"} · Trades:{" "}
                    {formatCount(report.importProvenance?.normalizedTradeCount ?? report.totalTrades)}
                  </p>
                </div>

                <div className="grid min-w-full gap-3 text-sm sm:grid-cols-4 xl:min-w-[520px]">
                  <Metric label="Trades" value={formatCount(report.totalTrades)} />
                  <Metric label="Win Rate" value={formatPercent(report.winRate)} />
                  <Metric
                    label="Net PnL"
                    value={formatCurrency(report.netPnl)}
                    tone={isFiniteNumber(report.netPnl) ? (report.netPnl >= 0 ? "accent" : "loss") : undefined}
                  />
                  <Metric label="Expectancy" value={formatCurrency(report.expectancy)} />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-line bg-graphite/50 px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:text-cyan"
                  disabled={loadingId === report.id}
                  onClick={() => void openReport(report.id)}
                >
                  Open Dashboard
                </button>
                <button
                  className="rounded-md border border-line bg-graphite/50 px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:text-cyan"
                  onClick={() => setEditingReport(report)}
                >
                  <Pencil className="mr-1 inline" size={13} />
                  Edit Details
                </button>
                {onCompare && (
                  <button
                    className="rounded-md border border-line bg-graphite/50 px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:text-cyan"
                    onClick={() => onCompare(report.id)}
                  >
                    Compare
                  </button>
                )}
                <button
                  className="rounded-md border border-line bg-graphite/50 px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:text-cyan"
                  onClick={() => setCollectionReport(report)}
                >
                  Add to Strategy Set
                </button>
                <button
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-loss hover:text-loss"
                  disabled={loadingId === report.id}
                  onClick={() => void removeReport(report.id)}
                >
                  <Trash2 className="mr-1 inline" size={13} />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {editingReport && (
        <ReportDetailsEditor
          report={editingReport}
          onCancel={() => setEditingReport(null)}
          onSaved={updateReportInList}
        />
      )}
      {collectionReport && (
        <AddToStrategySetDialog
          report={collectionReport}
          onCancel={() => setCollectionReport(null)}
          onSaved={() => setCollectionReport(null)}
        />
      )}
    </main>
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
      <span className="text-xs uppercase tracking-[0.14em] text-muted">{label}</span>
      <select
        className="mt-2 w-full rounded-md border border-line bg-graphite px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "accent" | "loss" }) {
  return (
    <div className="EdgeTrace-card-soft px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={`mt-1 font-semibold ${tone === "accent" ? "text-accent" : tone === "loss" ? "text-loss" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone?: "accent" }) {
  return (
    <span
      className={`rounded-md border px-2 py-1 text-xs ${
        tone === "accent" ? "border-accent/60 text-accent" : "border-line text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeReportSummary(report: Partial<ReportSummary> & { id?: unknown }): ReportSummary {
  const notes = safeText(report.notes);
  const name = safeText(report.name) || "Untitled diagnostic report";
  const tags = Array.isArray(report.tags) ? report.tags.map(safeText).filter(Boolean) : [];
  const reportType = reportTypes.includes(report.reportType as ReportType) ? (report.reportType as ReportType) : "unknown";
  return {
    id: safeText(report.id) || `report-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    createdAt: safeText(report.createdAt),
    updatedAt: safeText(report.updatedAt) || safeText(report.createdAt),
    notes,
    notesPreview: safeText(report.notesPreview) || (notes.length > 140 ? `${notes.slice(0, 137)}...` : notes),
    tags,
    strategyLabel: safeText(report.strategyLabel),
    reportType,
    totalTrades: toNumber(report.totalTrades),
    winRate: toNumber(report.winRate),
    grossPnl: toNumber(report.grossPnl),
    totalCosts: toNumber(report.totalCosts),
    netPnl: toNumber(report.netPnl),
    expectancy: toNumber(report.expectancy),
    averageRealizedR: isFiniteNumber(report.averageRealizedR) ? Number(report.averageRealizedR) : undefined,
    profitFactor: isFiniteNumber(report.profitFactor) ? Number(report.profitFactor) : undefined,
    importProvenance: report.importProvenance
  };
}

function formatProvenanceSource(report: ReportSummary) {
  const provenance = report.importProvenance;
  return provenance?.brokerDisplayName ?? provenance?.selectedSource ?? provenance?.detectedSource ?? "Unavailable";
}

function isDemoReport(report: ReportSummary) {
  return (
    safeText(report.name).startsWith("Demo Report") ||
    safeText(report.name).startsWith("ORB Demo") ||
    report.strategyLabel === "ORB Demo Strategy" ||
    (report.tags ?? []).some((tag) => tag.toLowerCase() === "demo")
  );
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function toNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : Number.NaN;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDate(value: string | undefined) {
  const timestamp = safeText(value);
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatCurrency(value: number | undefined) {
  return isFiniteNumber(value) ? currency.format(value) : "—";
}

function formatPercent(value: number | undefined) {
  return isFiniteNumber(value) ? percent.format(value) : "—";
}

function formatCount(value: number | undefined) {
  return isFiniteNumber(value) ? String(value) : "—";
}

function formatReportsLoadError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unable to load reports. Try refreshing the page.";
  return import.meta.env.DEV ? `Reports list failed: ${message}` : message;
}

function openFeatureGuide() {
  window.history.pushState(null, "", "/app/how-it-works");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
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
import { PaywallGate } from "../components/PaywallGate";
import { formatReportType } from "../components/ReportDetailsEditor";
import { TableContainer } from "../components/ui/Primitives";
import { breakdownLabels, type BreakdownDimension } from "../lib/breakdowns";
import {
  buildCollectionAnalytics,
  costDragPct,
  type CollectionAnalytics,
  type CollectionTrendMetric
} from "../lib/collectionAnalytics";
import { buildCollectionAttribution, type CollectionAttributionRow } from "../lib/collectionAttribution";
import {
  buildIterationChangeAttribution,
  formatDriver,
  type IterationChangeSummary
} from "../lib/iterationChangeAttribution";
import {
  buildIterationReviewQueue,
  type IterationReviewItem,
  type PriorityLabel
} from "../lib/iterationReviewQueue";
import { canUseFeature, canUseStrategyMonitoring, getPlanConfig } from "../lib/entitlements";
import { buildStrategyMonitoring, type StrategyMonitoringOutput } from "../lib/strategyMonitoring";
import {
  deleteCollectionReviewState,
  getCollection,
  getCollectionReviewStates,
  getReport,
  removeReportFromCollection,
  reorderCollectionReports,
  updateCollectionReviewState
} from "../lib/api";
import type {
  CollectionReviewState,
  CollectionReviewStatus,
  DiagnosticsResult,
  ReportCollectionDetail,
  ReportSummary,
  UserProfile
} from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export function CollectionDetailPage({
  collectionId,
  onBack,
  onOpenReport,
  onCompare,
  onAttribution,
  onReviewWorkspace,
  profile
}: {
  collectionId: string;
  onBack: () => void;
  onOpenReport: (report: DiagnosticsResult) => void;
  onCompare: (reportAId: string, reportBId: string) => void;
  onAttribution: (selection: { dimension: BreakdownDimension; group: string }) => void;
  onReviewWorkspace: () => void;
  profile?: UserProfile | null;
}) {
  const [collection, setCollection] = useState<ReportCollectionDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [attributionDimension, setAttributionDimension] = useState<BreakdownDimension>("symbol");
  const [showAllReviewItems, setShowAllReviewItems] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<"all" | PriorityLabel>("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CollectionReviewStatus>("all");
  const [reviewStates, setReviewStates] = useState<CollectionReviewState[]>([]);
  const [noteTarget, setNoteTarget] = useState<IterationReviewItem | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const analytics = useMemo(() => (collection ? buildCollectionAnalytics(collection) : null), [collection]);
  const attribution = useMemo(() => (collection ? buildCollectionAttribution(collection) : null), [collection]);
  const iterationChanges = useMemo(() => (collection ? buildIterationChangeAttribution(collection) : []), [collection]);
  const reviewQueue = useMemo(() => buildIterationReviewQueue(iterationChanges), [iterationChanges]);
  const plan = getPlanConfig(profile?.planId);
  const monitoring = useMemo(() => (collection ? buildStrategyMonitoring(collection) : null), [collection]);

  const load = async () => {
    try {
      setCollection(await getCollection(collectionId));
      const response = await getCollectionReviewStates(collectionId);
      setReviewStates(response.reviewStates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load strategy set");
    }
  };

  useEffect(() => {
    void load();
  }, [collectionId]);

  const openReport = async (id: string) => {
    try {
      onOpenReport(await getReport(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open report");
    }
  };

  const remove = async (reportId: string) => {
    if (!window.confirm("Remove this report from the strategy set? The report itself will not be deleted.")) return;
    try {
      await removeReportFromCollection(collectionId, reportId);
      setCollection((current) =>
        current ? { ...current, reports: current.reports.filter((report) => report.id !== reportId), reportCount: current.reportCount - 1 } : current
      );
      setSelected((current) => current.filter((id) => id !== reportId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove report");
    }
  };

  const persistReportOrder = async (nextReports: ReportSummary[]) => {
    if (!collection) return;
    setError("");
    setIsReordering(true);
    setCollection({
      ...collection,
      reports: nextReports,
      fullReports: orderFullReports(collection.fullReports, nextReports)
    });
    try {
      setCollection(await reorderCollectionReports(collectionId, nextReports.map((report) => report.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reorder reports");
      void load();
    } finally {
      setIsReordering(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!collection || isReordering) return;
    const next = [...collection.reports];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await persistReportOrder(next);
  };

  const sortByCreatedAt = async (direction: "asc" | "desc") => {
    if (!collection || isReordering) return;
    const next = [...collection.reports].sort((a, b) => {
      const left = safeTime(a.createdAt);
      const right = safeTime(b.createdAt);
      return direction === "asc" ? left - right : right - left;
    });
    await persistReportOrder(next);
  };

  const toggleSelected = (reportId: string) => {
    setSelected((current) => {
      if (current.includes(reportId)) return current.filter((id) => id !== reportId);
      return [...current, reportId].slice(-2);
    });
  };

  const reviewStateFor = (item: IterationReviewItem) =>
    reviewStates.find(
      (state) => state.previousReportId === item.previousReportId && state.currentReportId === item.currentReportId
    );

  const saveReviewState = async (item: IterationReviewItem, status: CollectionReviewStatus, note?: string) => {
    const existing = reviewStateFor(item);
    const saved = await updateCollectionReviewState(collectionId, {
      previousReportId: item.previousReportId,
      currentReportId: item.currentReportId,
      status,
      note: note ?? existing?.note ?? ""
    });
    setReviewStates((current) => {
      const exists = current.some((state) => state.id === saved.id);
      return exists ? current.map((state) => (state.id === saved.id ? saved : state)) : [saved, ...current];
    });
  };

  const clearReviewState = async (item: IterationReviewItem) => {
    if (!window.confirm("Clear this review state and note?")) return;
    await deleteCollectionReviewState(collectionId, item.previousReportId, item.currentReportId);
    setReviewStates((current) =>
      current.filter(
        (state) => !(state.previousReportId === item.previousReportId && state.currentReportId === item.currentReportId)
      )
    );
  };

  return (
    <main className="EdgeTrace-shell py-10" data-testid="collection-detail">
      <button className="mb-6 text-sm text-muted hover:text-accent" onClick={onBack}>
        Back to Strategy Sets
      </button>
      {error && <div className="mb-5 rounded-md border border-loss/60 bg-loss/10 p-4 text-loss">{error}</div>}
      {!collection ? (
        <p className="text-sm text-muted">Loading strategy set...</p>
      ) : (
        <>
          <section className="EdgeTrace-page-header mb-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="max-w-5xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-6xl">{collection.name}</h1>
              <p className="mt-5 max-w-4xl text-base leading-7 text-muted">
                {collection.description ||
                  "A strategy set groups related reports so you can track changes across iterations."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {collection.tags.map((tag) => (
                  <span key={tag} className="rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="EdgeTrace-primary-button disabled:opacity-50"
              disabled={selected.length !== 2}
              onClick={() => selected.length === 2 && onCompare(selected[0], selected[1])}
            >
              Compare Selected
            </button>
          </section>

          {collection.reports.length > 0 && (
            <ReportOrderPanel
              reports={collection.reports}
              isSaving={isReordering}
              onMove={move}
              onSortByCreatedAt={sortByCreatedAt}
            />
          )}

          {analytics && (
            <PaywallGate
              feature="collection_attribution"
              accessLevel={canUseFeature(plan, "collection_attribution") ? "full" : "preview"}
              title="Upgrade to Pro to unlock strategy set analytics."
              description="Pro unlocks the full strategy workflow, including whether related reports are improving or degrading across iterations."
            >
              <CollectionAnalyticsSection analytics={analytics} />
            </PaywallGate>
          )}

          {monitoring && (
            <StrategyMonitoringSection
              monitoring={monitoring}
              strategyMonitoringAccess={canUseStrategyMonitoring(plan) ? "full" : "locked"}
            />
          )}

          {reviewQueue.length > 0 && (
            <PaywallGate
              feature="review_workspace"
              accessLevel={canUseFeature(plan, "review_workspace") ? "full" : "preview"}
              title="Upgrade to Pro to unlock the review workflow."
              description="Pro unlocks report-to-report transition ranking so you can decide what deserves inspection first."
            >
            <ReviewQueueSection
              items={reviewQueue}
              reviewStates={reviewStates}
              showAll={showAllReviewItems}
              onToggleShowAll={() => setShowAllReviewItems((current) => !current)}
              priorityFilter={priorityFilter}
              onPriorityFilter={setPriorityFilter}
              classificationFilter={classificationFilter}
              onClassificationFilter={setClassificationFilter}
              driverFilter={driverFilter}
              onDriverFilter={setDriverFilter}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              onCompare={(item) => onCompare(item.previousReportId, item.currentReportId)}
              onOpenReport={(id) => void openReport(id)}
              onSetStatus={(item, status) => void saveReviewState(item, status)}
              onEditNote={setNoteTarget}
              onClearState={(item) => void clearReviewState(item)}
              onOpenWorkspace={onReviewWorkspace}
            />
            </PaywallGate>
          )}

          {attribution && (
            <PaywallGate
              feature="collection_attribution"
              accessLevel={canUseFeature(plan, "collection_attribution") ? "full" : "preview"}
              title="Upgrade to Pro to unlock full attribution."
              description="Pro shows which symbols, strategies, and time buckets are driving improvement or degradation across reports."
            >
            <CollectionAttributionSection
              attribution={attribution}
              dimension={attributionDimension}
              onDimensionChange={setAttributionDimension}
              onOpen={onAttribution}
            />
            </PaywallGate>
          )}

          {iterationChanges.length > 0 && (
            <PaywallGate
              feature="advanced_attribution"
              accessLevel={canUseFeature(plan, "advanced_attribution") ? "full" : "preview"}
              title="Upgrade to Pro to unlock iteration attribution."
              description="Pro explains what changed from one report to the next and where to inspect."
            >
            <IterationChangesSection
              changes={iterationChanges}
              onCompare={(change) => onCompare(change.previousReportId, change.currentReportId)}
              onOpenReport={(id) => void openReport(id)}
            />
            </PaywallGate>
          )}

          {collection.reports.length === 0 ? (
            <section className="rounded-lg border border-line bg-panel p-8">
              <p className="font-semibold">No reports in this strategy set</p>
              <p className="mt-2 text-sm text-muted">Add reports from the Reports page to track strategy iterations.</p>
            </section>
          ) : (
            <TableContainer>
              <table className="min-w-full divide-y divide-line text-sm">
                <thead className="bg-panel text-left text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Compare</th>
                    <th className="px-4 py-3 font-medium">Iteration</th>
                    <th className="px-4 py-3 font-medium">Report</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Net PnL</th>
                    <th className="px-4 py-3 font-medium">Expectancy</th>
                    <th className="px-4 py-3 font-medium">Win Rate</th>
                    <th className="px-4 py-3 font-medium">Costs</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {collection.reports.map((report, index) => (
                    <CollectionReportRow
                      key={report.id}
                      report={report}
                      iteration={index + 1}
                      previousReport={collection.reports[index - 1]}
                      bestReportId={analytics?.bestReportByExpectancy?.id}
                      selected={selected.includes(report.id)}
                      onSelect={() => toggleSelected(report.id)}
                      onOpen={() => void openReport(report.id)}
                      onRemove={() => void remove(report.id)}
                      onMoveUp={() => void move(index, -1)}
                      onMoveDown={() => void move(index, 1)}
                      canMoveUp={!isReordering && index > 0}
                      canMoveDown={!isReordering && index < collection.reports.length - 1}
                      isReordering={isReordering}
                      onComparePrevious={() => index > 0 && onCompare(collection.reports[index - 1].id, report.id)}
                      onCompareBest={() => analytics?.bestReportByExpectancy && onCompare(analytics.bestReportByExpectancy.id, report.id)}
                    />
                  ))}
                </tbody>
              </table>
            </TableContainer>
          )}
        </>
      )}
      {noteTarget && (
        <ReviewNoteEditor
          item={noteTarget}
          state={reviewStateFor(noteTarget)}
          onCancel={() => setNoteTarget(null)}
          onSaved={(note, status) => {
            void saveReviewState(noteTarget, status, note);
            setNoteTarget(null);
          }}
        />
      )}
    </main>
  );
}

function StrategyMonitoringSection({
  monitoring,
  strategyMonitoringAccess
}: {
  monitoring: StrategyMonitoringOutput;
  strategyMonitoringAccess: "full" | "preview" | "locked";
}) {
  return (
    <section className="mb-6">
      <PaywallGate
        feature="strategy_health_monitoring"
        accessLevel={strategyMonitoringAccess}
        title="Upgrade to Pro to unlock Edge Health monitoring."
        description="Pro compares the latest iteration against prior reports, cost drag, expectancy, and R capture trends."
      >
        <div className="border border-white/[0.1] bg-white/[0.025] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Edge Health Monitoring</p>
              <h2 className="mt-3 text-2xl font-semibold capitalize tracking-[-0.045em] text-ink">
                {monitoring.healthStatus.replace(/_/g, " ")}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{monitoring.primaryMonitoringInsight}</p>
            </div>
            <div className="border border-white/[0.1] bg-black/25 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Current vs best</p>
              <p className="mt-2 max-w-xs text-sm text-ink">{monitoring.currentVsBestSummary}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {monitoring.trendMetrics.slice(0, 6).map((trend) => (
              <div key={trend.label} className={`EdgeTrace-drilldown-stripe ${collectionTrendStripeClass(trend.direction)} border border-white/[0.08] bg-black/25 p-3`}>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{trend.label}</p>
                <p className={`mt-2 text-sm font-semibold ${trend.direction === "improving" ? "text-profit" : trend.direction === "degrading" ? "text-loss" : "text-ink"}`}>
                  {trend.direction.replace(/_/g, " ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </PaywallGate>
    </section>
  );
}

function orderFullReports(fullReports: DiagnosticsResult[] | undefined, orderedReports: ReportSummary[]) {
  if (!fullReports) return undefined;
  const byId = new Map(fullReports.map((report) => [report.id, report]));
  return orderedReports.map((report) => byId.get(report.id)).filter((report): report is DiagnosticsResult => Boolean(report));
}

function safeTime(value: string | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function formatDate(value: string | undefined) {
  const time = safeTime(value);
  return time > 0 ? new Date(time).toLocaleDateString() : "Date unavailable";
}

function ReportOrderPanel({
  reports,
  isSaving,
  onMove,
  onSortByCreatedAt
}: {
  reports: ReportSummary[];
  isSaving: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onSortByCreatedAt: (direction: "asc" | "desc") => void;
}) {
  return (
    <section className="mb-8 border border-cyan/25 bg-cyan/[0.035] p-5">
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr] xl:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Strategy Timeline Order</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">
            Set the report sequence before reading progress.
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Trend charts, iteration changes, prioritized review items, and current-vs-best monitoring use this order. Put the earliest version first and
            the latest version last so EdgeTrace reads the strategy timeline correctly.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="EdgeTrace-compact-secondary disabled:opacity-50"
              disabled={isSaving || reports.length < 2}
              onClick={() => onSortByCreatedAt("asc")}
              type="button"
            >
              Sort Oldest to Newest
            </button>
            <button
              className="EdgeTrace-compact-secondary disabled:opacity-50"
              disabled={isSaving || reports.length < 2}
              onClick={() => onSortByCreatedAt("desc")}
              type="button"
            >
              Sort Newest to Oldest
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Use chronological sort as a starting point, then move individual reports when upload date does not match strategy version.
          </p>
          {isSaving && <p className="mt-3 text-xs text-cyan">Saving timeline order...</p>}
        </div>

        <div className="grid gap-2">
          {reports.map((report, index) => (
            <div key={report.id} className="grid gap-3 border border-white/[0.1] bg-black/25 p-3 md:grid-cols-[72px_1fr_auto] md:items-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">V{index + 1}</p>
              <div>
                <p className="font-semibold text-ink">{report.name}</p>
                <p className="mt-1 text-xs text-muted">
                  Created {formatDate(report.createdAt)} / Exp {currency.format(report.expectancy)} / Net {currency.format(report.netPnl)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="border border-white/[0.12] px-2.5 py-1.5 text-xs font-semibold text-muted hover:border-cyan hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={isSaving || index === 0}
                  onClick={() => onMove(index, -1)}
                  type="button"
                >
                  Earlier
                </button>
                <button
                  className="border border-white/[0.12] px-2.5 py-1.5 text-xs font-semibold text-muted hover:border-cyan hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={isSaving || index === reports.length - 1}
                  onClick={() => onMove(index, 1)}
                  type="button"
                >
                  Later
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CollectionAnalyticsSection({ analytics }: { analytics: CollectionAnalytics }) {
  return (
    <>
      <section className="mb-6 rounded-lg border border-line bg-panel p-6">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Strategy Set Health</p>
            <p className={`mt-3 text-6xl font-semibold ${scoreClass(analytics.healthScore)}`}>{analytics.healthScore}</p>
            <p className="mt-2 font-semibold">{analytics.healthBand}</p>
            <p className="mt-1 text-xs text-muted">{analytics.trendConfidence} confidence</p>
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-accent">Strategy Iteration Readout</p>
            <p className="mt-3 max-w-4xl text-base leading-7 text-ink">{analytics.primaryCollectionInsight}</p>
            {analytics.warningFlags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {analytics.warningFlags.map((warning) => (
                  <span key={warning} className="rounded-md border border-warning/60 bg-warning/10 px-2 py-1 text-xs text-warning">
                    {warning}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {analytics.trends
          .filter((trend) => ["expectancy", "netPnl", "costDragPct", "averageRealizedR"].includes(trend.key))
          .map((trend) => (
            <TrendCard key={trend.key} trend={trend} />
          ))}
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportRankCard title="Best Expectancy" report={analytics.bestReportByExpectancy} value={analytics.bestReportByExpectancy?.expectancy} />
        <ReportRankCard title="Worst Expectancy" report={analytics.worstReportByExpectancy} value={analytics.worstReportByExpectancy?.expectancy} />
        <ReportRankCard title="Best Net PnL" report={analytics.bestReportByNetPnl} value={analytics.bestReportByNetPnl?.netPnl} />
        <ReportRankCard title="Worst Net PnL" report={analytics.worstReportByNetPnl} value={analytics.worstReportByNetPnl?.netPnl} />
      </section>

      <section className="mb-8 grid gap-4 xl:grid-cols-2">
        <TrendChart title="Expectancy Over Reports" dataKey="expectancy" data={analytics.chartRows} format="currency" />
        <TrendChart title="Net PnL Over Reports" dataKey="netPnl" data={analytics.chartRows} format="currency" />
        <TrendChart title="Cost Drag % Over Reports" dataKey="costDragPct" data={analytics.chartRows} format="percent" />
        <TrendChart title="Average R Over Reports" dataKey="averageRealizedR" data={analytics.chartRows} format="number" />
      </section>
    </>
  );
}

function ReviewQueueSection({
  items,
  reviewStates,
  showAll,
  onToggleShowAll,
  priorityFilter,
  onPriorityFilter,
  classificationFilter,
  onClassificationFilter,
  driverFilter,
  onDriverFilter,
  statusFilter,
  onStatusFilter,
  onCompare,
  onOpenReport,
  onSetStatus,
  onEditNote,
  onClearState,
  onOpenWorkspace
}: {
  items: IterationReviewItem[];
  reviewStates: CollectionReviewState[];
  showAll: boolean;
  onToggleShowAll: () => void;
  priorityFilter: "all" | PriorityLabel;
  onPriorityFilter: (value: "all" | PriorityLabel) => void;
  classificationFilter: string;
  onClassificationFilter: (value: string) => void;
  driverFilter: string;
  onDriverFilter: (value: string) => void;
  statusFilter: "all" | CollectionReviewStatus;
  onStatusFilter: (value: "all" | CollectionReviewStatus) => void;
  onCompare: (item: IterationReviewItem) => void;
  onOpenReport: (id: string) => void;
  onSetStatus: (item: IterationReviewItem, status: CollectionReviewStatus) => void;
  onEditNote: (item: IterationReviewItem) => void;
  onClearState: (item: IterationReviewItem) => void;
  onOpenWorkspace: () => void;
}) {
  const driverOptions = [...new Set(items.map((item) => item.primaryDriver))];
  const stateFor = (item: IterationReviewItem) =>
    reviewStates.find(
      (state) => state.previousReportId === item.previousReportId && state.currentReportId === item.currentReportId
    );
  const filtered = items.filter((item) => {
    const itemStatus = stateFor(item)?.status ?? "open";
    const priorityMatch = priorityFilter === "all" || item.priorityLabel === priorityFilter;
    const classificationMatch = classificationFilter === "all" || item.changeClassification === classificationFilter;
    const driverMatch = driverFilter === "all" || item.primaryDriver === driverFilter;
    const statusMatch = statusFilter === "all" || itemStatus === statusFilter;
    return priorityMatch && classificationMatch && driverMatch && statusMatch;
  });
  const visibleItems = showAll ? filtered : filtered.slice(0, 3);
  const progress = buildReviewProgress(items, reviewStates);
  const workspaceProminent = progress.needsFollowUp > 0;

  return (
    <section className="mb-8 rounded-lg border border-line bg-panel p-5">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-accent">Review Queue</p>
          <h2 className="mt-2 text-2xl font-semibold">Iteration changes ranked by priority</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Start with the highest-priority transitions before reviewing routine iteration changes.
          </p>
          <p className="mt-2 text-sm text-muted">
            {progress.reviewed} of {progress.total} reviewed · {progress.needsFollowUp} needs follow-up · {progress.percentReviewed}% reviewed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={`${workspaceProminent ? "EdgeTrace-compact-primary" : "EdgeTrace-compact-secondary"}`}
            onClick={onOpenWorkspace}
          >
            Open Review Workspace
          </button>
          <button className="rounded-md border border-line px-4 py-2 text-sm hover:border-accent" onClick={onToggleShowAll}>
            {showAll ? "Show top 3" : "Show all review items"}
          </button>
        </div>
      </div>

      {showAll && (
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <QueueFilter label="Review Status" value={statusFilter} onChange={(value) => onStatusFilter(value as "all" | CollectionReviewStatus)}>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="reviewed">Reviewed</option>
            <option value="needs_follow_up">Needs follow-up</option>
          </QueueFilter>
          <QueueFilter label="Priority" value={priorityFilter} onChange={(value) => onPriorityFilter(value as "all" | PriorityLabel)}>
            <option value="all">All priorities</option>
            {(["Critical", "High", "Medium", "Low"] as PriorityLabel[]).map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </QueueFilter>
          <QueueFilter label="Classification" value={classificationFilter} onChange={onClassificationFilter}>
            <option value="all">All classifications</option>
            {["degraded", "improved", "mixed", "flat", "insufficient_data"].map((classification) => (
              <option key={classification} value={classification}>{classification.replace("_", " ")}</option>
            ))}
          </QueueFilter>
          <QueueFilter label="Primary Driver" value={driverFilter} onChange={onDriverFilter}>
            <option value="all">All drivers</option>
            {driverOptions.map((driver) => (
              <option key={driver} value={driver}>{formatDriver(driver)}</option>
            ))}
          </QueueFilter>
        </div>
      )}

      <div className="grid gap-4">
        {visibleItems.map((item) => (
          <ReviewQueueCard
            key={item.id}
            item={item}
            state={stateFor(item)}
            onCompare={() => onCompare(item)}
            onOpenPrior={() => onOpenReport(item.previousReportId)}
            onOpenCurrent={() => onOpenReport(item.currentReportId)}
            onSetStatus={(status) => onSetStatus(item, status)}
            onEditNote={() => onEditNote(item)}
            onClearState={() => onClearState(item)}
          />
        ))}
      </div>
    </section>
  );
}

function ReviewQueueCard({
  item,
  state,
  onCompare,
  onOpenPrior,
  onOpenCurrent,
  onSetStatus,
  onEditNote,
  onClearState
}: {
  item: IterationReviewItem;
  state?: CollectionReviewState;
  onCompare: () => void;
  onOpenPrior: () => void;
  onOpenCurrent: () => void;
  onSetStatus: (status: CollectionReviewStatus) => void;
  onEditNote: () => void;
  onClearState: () => void;
}) {
  const status = state?.status ?? "open";
  return (
    <article className={`rounded-lg border bg-graphite p-5 ${priorityClass(item.priorityLabel)}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${priorityPillClass(item.priorityLabel)}`}>
              {item.priorityLabel}
            </span>
            <span className="rounded-md border border-line px-2 py-1 text-xs text-muted">{item.reviewCategory}</span>
            <span className="rounded-md border border-line px-2 py-1 text-xs text-muted">{item.confidence} confidence</span>
            <span className="rounded-md border border-line px-2 py-1 text-xs text-muted">{formatDriver(item.primaryDriver)}</span>
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${reviewStatusClass(status)}`}>
              {formatReviewStatus(status)}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold">{item.headline}</h3>
          <p className="mt-1 text-xs text-muted">
            {item.previousReportName} {"->"} {item.currentReportName}
          </p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{item.explanation}</p>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-ink">{item.recommendedAction}</p>
          {state?.note && <p className="mt-2 max-w-4xl text-sm leading-6 text-warning">Note: {state.note}</p>}
        </div>
        <div className="grid min-w-full gap-2 text-sm sm:grid-cols-4 xl:min-w-[520px]">
          <MiniDelta label="Net PnL" value={item.source.netPnlDelta} format="currency" lowerIsBetter={false} />
          <MiniDelta label="Expectancy" value={item.source.expectancyDelta} format="currency" lowerIsBetter={false} />
          <MiniDelta label="Cost Drag" value={item.source.costDragDelta} format="percent" lowerIsBetter />
          <MiniDelta label="Average R" value={item.source.averageRDelta} format="number" lowerIsBetter={false} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={onCompare}>Compare These Reports</button>
        <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={onOpenCurrent}>Open Current Report</button>
        <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={onOpenPrior}>Open Prior Report</button>
        <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={() => onSetStatus("reviewed")}>Mark Reviewed</button>
        <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-warning hover:text-warning" onClick={() => onSetStatus("needs_follow_up")}>Needs Follow-up</button>
        <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={() => onSetStatus("open")}>Reopen</button>
        <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={onEditNote}>Add/Edit Note</button>
        <button className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:border-loss hover:text-loss" onClick={onClearState}>Clear State</button>
      </div>
    </article>
  );
}

function QueueFilter({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.14em] text-muted">{label}</span>
      <select
        className="mt-2 w-full rounded-md border border-line bg-graphite px-3 py-2 text-sm outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function CollectionAttributionSection({
  attribution,
  dimension,
  onDimensionChange,
  onOpen
}: {
  attribution: ReturnType<typeof buildCollectionAttribution>;
  dimension: BreakdownDimension;
  onDimensionChange: (dimension: BreakdownDimension) => void;
  onOpen: (selection: { dimension: BreakdownDimension; group: string }) => void;
}) {
  const rows = attribution.rowsByDimension[dimension];
  return (
    <section className="mb-8 rounded-lg border border-line bg-panel p-5">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-accent">What Changed?</p>
          <h2 className="mt-2 text-2xl font-semibold">Strategy set attribution drilldowns</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["symbol", "strategy", "timeOfDay"] as BreakdownDimension[]).map((item) => (
            <button
              key={item}
              className={`rounded-md border px-4 py-2 text-sm ${
                dimension === item ? "border-accent text-accent" : "border-line hover:border-accent"
              }`}
              onClick={() => onDimensionChange(item)}
            >
              {breakdownLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <DriverPanel title="Top Improvement Drivers" rows={attribution.improvementDrivers} tone="accent" />
        <DriverPanel title="Top Degradation Drivers" rows={attribution.degradationDrivers} tone="loss" />
      </div>

      <TableContainer>
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-graphite text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium">Reports Seen</th>
              <th className="px-4 py-3 font-medium">Trades</th>
              <th className="px-4 py-3 font-medium">Net Delta</th>
              <th className="px-4 py-3 font-medium">Expectancy Delta</th>
              <th className="px-4 py-3 font-medium">Cost Drag Delta</th>
              <th className="px-4 py-3 font-medium">Avg R Delta</th>
              <th className="px-4 py-3 font-medium">Trend</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <AttributionTableRow key={row.group} row={row} onOpen={() => onOpen({ dimension, group: row.group })} />
            ))}
          </tbody>
        </table>
      </TableContainer>
    </section>
  );
}

function IterationChangesSection({
  changes,
  onCompare,
  onOpenReport
}: {
  changes: IterationChangeSummary[];
  onCompare: (change: IterationChangeSummary) => void;
  onOpenReport: (id: string) => void;
}) {
  return (
    <section className="mb-8 rounded-lg border border-line bg-panel p-5">
      <div className="mb-5">
        <p className="text-sm uppercase tracking-[0.22em] text-accent">Iteration Changes</p>
        <h2 className="mt-2 text-2xl font-semibold">What changed version to version</h2>
      </div>
      <div className="grid gap-4">
        {changes.map((change) => (
          <article key={`${change.previousReportId}-${change.currentReportId}`} className="rounded-lg border border-line bg-graphite p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold capitalize ${changeBadgeClass(change.changeClassification)}`}>
                    {change.changeClassification.replace("_", " ")}
                  </span>
                  <span className="rounded-md border border-line px-2 py-1 text-xs text-muted">
                    {change.confidence} confidence
                  </span>
                  <span className="rounded-md border border-line px-2 py-1 text-xs text-muted">
                    {formatDriver(change.primaryChangeDriver)}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">
                  {change.previousReportName} {"->"} {change.currentReportName}
                </h3>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">{change.explanation}</p>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-ink">{change.recommendedAction}</p>
                {change.secondaryChangeDrivers.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    Secondary drivers: {change.secondaryChangeDrivers.map(formatDriver).join(", ")}
                  </p>
                )}
              </div>
              <div className="grid min-w-full gap-2 text-sm sm:grid-cols-4 xl:min-w-[520px]">
                <MiniDelta label="Net PnL" value={change.netPnlDelta} format="currency" lowerIsBetter={false} />
                <MiniDelta label="Expectancy" value={change.expectancyDelta} format="currency" lowerIsBetter={false} />
                <MiniDelta label="Cost Drag" value={change.costDragDelta} format="percent" lowerIsBetter />
                <MiniDelta label="Average R" value={change.averageRDelta} format="number" lowerIsBetter={false} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={() => onCompare(change)}>
                Compare These Reports
              </button>
              <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={() => onOpenReport(change.previousReportId)}>
                Open Prior Report
              </button>
              <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={() => onOpenReport(change.currentReportId)}>
                Open Current Report
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MiniDelta({
  label,
  value,
  format,
  lowerIsBetter
}: {
  label: string;
  value?: number;
  format: "currency" | "percent" | "number";
  lowerIsBetter: boolean;
}) {
  const neutral = value === undefined || Math.abs(value) < 0.0001;
  const improved = !neutral && (lowerIsBetter ? value < 0 : value > 0);
  const formatted =
    value === undefined
      ? "N/A"
      : format === "currency"
        ? currency.format(value)
        : format === "percent"
          ? percent.format(value)
          : value.toFixed(2);
  return (
    <div className={`EdgeTrace-drilldown-stripe ${neutral ? "tone-gray" : improved ? "tone-green" : "tone-red"} rounded-md border border-line bg-panel px-3 py-2`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-semibold ${neutral ? "" : improved ? "text-accent" : "text-loss"}`}>{formatted}</p>
    </div>
  );
}

function changeBadgeClass(classification: IterationChangeSummary["changeClassification"]) {
  if (classification === "improved") return "border-accent/70 bg-accent/10 text-accent";
  if (classification === "degraded") return "border-loss/70 bg-loss/10 text-loss";
  if (classification === "mixed") return "border-warning/70 bg-warning/10 text-warning";
  return "border-line text-muted";
}

function priorityClass(priority: PriorityLabel) {
  if (priority === "Critical") return "border-loss/70";
  if (priority === "High") return "border-warning/70";
  if (priority === "Medium") return "border-accent/50";
  return "border-line";
}

function priorityPillClass(priority: PriorityLabel) {
  if (priority === "Critical") return "border-loss/70 bg-loss/10 text-loss";
  if (priority === "High") return "border-warning/70 bg-warning/10 text-warning";
  if (priority === "Medium") return "border-accent/70 bg-accent/10 text-accent";
  return "border-line text-muted";
}

function buildReviewProgress(items: IterationReviewItem[], states: CollectionReviewState[]) {
  const total = items.length;
  const matchedStates = items.map((item) =>
    states.find(
      (state) => state.previousReportId === item.previousReportId && state.currentReportId === item.currentReportId
    )
  );
  const reviewed = matchedStates.filter((state) => state?.status === "reviewed").length;
  const needsFollowUp = matchedStates.filter((state) => state?.status === "needs_follow_up").length;
  const percentReviewed = total ? Math.round((reviewed / total) * 100) : 0;
  return { total, reviewed, needsFollowUp, percentReviewed };
}

function formatReviewStatus(status: CollectionReviewStatus) {
  if (status === "needs_follow_up") return "Needs follow-up";
  if (status === "reviewed") return "Reviewed";
  return "Open";
}

function reviewStatusClass(status: CollectionReviewStatus) {
  if (status === "reviewed") return "border-accent/70 bg-accent/10 text-accent";
  if (status === "needs_follow_up") return "border-warning/70 bg-warning/10 text-warning";
  return "border-line text-muted";
}

function ReviewNoteEditor({
  item,
  state,
  onCancel,
  onSaved
}: {
  item: IterationReviewItem;
  state?: CollectionReviewState;
  onCancel: () => void;
  onSaved: (note: string, status: CollectionReviewStatus) => void;
}) {
  const [note, setNote] = useState(state?.note ?? "");
  const [status, setStatus] = useState<CollectionReviewStatus>(state?.status ?? "needs_follow_up");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/80 px-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-panel p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Review Note</p>
        <h2 className="mt-2 text-xl font-semibold">{item.previousReportName} {"->"} {item.currentReportName}</h2>
        <label className="mt-5 block">
          <span className="text-xs uppercase tracking-[0.14em] text-muted">Status</span>
          <select
            className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
            value={status}
            onChange={(event) => setStatus(event.target.value as CollectionReviewStatus)}
          >
            <option value="open">Open</option>
            <option value="reviewed">Reviewed</option>
            <option value="needs_follow_up">Needs follow-up</option>
          </select>
        </label>
        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-[0.14em] text-muted">Note</span>
          <textarea
            className="mt-2 min-h-28 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Investigate NVDA losses. Likely caused by open-session slippage."
          />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button className="EdgeTrace-compact-secondary" onClick={onCancel}>Cancel</button>
          <button className="EdgeTrace-compact-primary" onClick={() => onSaved(note, status)}>
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
}

function DriverPanel({ title, rows, tone }: { title: string; rows: CollectionAttributionRow[]; tone: "accent" | "loss" }) {
  return (
    <div className={`EdgeTrace-drilldown-stripe ${tone === "accent" ? "tone-green" : "tone-red"} rounded-lg border bg-graphite p-4 ${tone === "accent" ? "border-accent/50" : "border-loss/50"}`}>
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{title}</p>
      <div className="mt-3 grid gap-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No clear drivers detected yet.</p>
        ) : (
          rows.map((row) => (
            <div key={`${row.dimension}-${row.group}`} className="rounded-md border border-line bg-panel p-3">
              <p className="font-semibold">{row.group}</p>
              <p className="mt-1 text-sm text-muted">{row.interpretation}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AttributionTableRow({ row, onOpen }: { row: CollectionAttributionRow; onOpen: () => void }) {
  return (
    <tr>
      <td className="px-4 py-3 font-medium">{row.group}</td>
      <td className="px-4 py-3 text-muted">{row.appearances}</td>
      <td className="px-4 py-3 text-muted">{row.totalTrades}</td>
      <td className={deltaClass(row.netPnlDelta, false)}>{formatOptionalCurrency(row.netPnlDelta)}</td>
      <td className={deltaClass(row.expectancyDelta, false)}>{formatOptionalCurrency(row.expectancyDelta)}</td>
      <td className={deltaClass(row.costDragDelta, true)}>{formatOptionalPercent(row.costDragDelta)}</td>
      <td className={deltaClass(row.averageRDelta, false)}>{row.averageRDelta?.toFixed(2) ?? "N/A"}</td>
      <td className="px-4 py-3 capitalize">{row.trendDirection.replace("_", " ")}</td>
      <td className="px-4 py-3">
        <button className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent" onClick={onOpen}>
          View Drilldown
        </button>
      </td>
    </tr>
  );
}

function TrendCard({ trend }: { trend: CollectionTrendMetric }) {
  return (
    <div className={`EdgeTrace-drilldown-stripe ${collectionTrendStripeClass(trend.direction)} rounded-lg border bg-panel p-5 ${trendClass(trend.direction)}`}>
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{trend.label} Trend</p>
      <p className="mt-3 text-xl font-semibold capitalize">{trend.direction.replace("_", " ")}</p>
      <p className="mt-2 text-xs text-muted">{trend.confidence} confidence</p>
      <p className="mt-4 text-sm text-muted">
        {formatTrendValue(trend.firstValue, trend.key)} to {formatTrendValue(trend.latestValue, trend.key)}
      </p>
    </div>
  );
}

function ReportRankCard({ title, report, value }: { title: string; report?: ReportSummary; value?: number }) {
  return (
    <div className={`EdgeTrace-card EdgeTrace-drilldown-stripe ${value === undefined ? "tone-gray" : value >= 0 ? "tone-green" : "tone-red"} p-5`}>
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{title}</p>
      <p className="mt-3 font-semibold">{report?.name ?? "N/A"}</p>
      <p className={`mt-2 text-lg font-semibold ${value === undefined ? "" : value >= 0 ? "text-accent" : "text-loss"}`}>{value === undefined ? "N/A" : currency.format(value)}</p>
    </div>
  );
}

function TrendChart({
  title,
  data,
  dataKey,
  format
}: {
  title: string;
  data: CollectionAnalytics["chartRows"];
  dataKey: keyof CollectionAnalytics["chartRows"][number];
  format: "currency" | "percent" | "number";
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</h2>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid stroke="#243B64" strokeOpacity={0.45} />
          <XAxis dataKey="iteration" stroke="#9CA8C7" />
          <YAxis stroke="#9CA8C7" />
          <Tooltip
            contentStyle={{ background: "#0D1424", border: "1px solid #243B64" }}
            formatter={(value) => formatChartValue(Number(value), format)}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.reportName ?? ""}
          />
          <Line type="monotone" dataKey={dataKey as string} stroke="#45D5FF" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CollectionReportRow({
  report,
  iteration,
  previousReport,
  bestReportId,
  selected,
  onSelect,
  onOpen,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  isReordering,
  onComparePrevious,
  onCompareBest
}: {
  report: ReportSummary;
  iteration: number;
  previousReport?: ReportSummary;
  bestReportId?: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isReordering: boolean;
  onComparePrevious: () => void;
  onCompareBest: () => void;
}) {
  const expectancyDelta = previousReport ? report.expectancy - previousReport.expectancy : undefined;
  const netPnlDelta = previousReport ? report.netPnl - previousReport.netPnl : undefined;
  const previousCostDrag = previousReport ? costDragPct(previousReport) : undefined;
  const currentCostDrag = costDragPct(report);
  const costDragDelta = currentCostDrag !== undefined && previousCostDrag !== undefined ? currentCostDrag - previousCostDrag : undefined;
  return (
    <tr>
      <td className="px-4 py-3">
        <input type="checkbox" checked={selected} onChange={onSelect} />
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-ink">V{iteration}</p>
        <p className="mt-1 text-[11px] text-muted">{formatDate(report.createdAt)}</p>
      </td>
      <td className="px-4 py-3">
        <button className="font-medium hover:text-accent" onClick={onOpen}>{report.name}</button>
        <div className="mt-1 flex flex-wrap gap-1">
          {(report.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">{tag}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-muted">{formatReportType(report.reportType)}</td>
      <td className={report.netPnl >= 0 ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss"}>{currency.format(report.netPnl)}</td>
      <td className="px-4 py-3">{currency.format(report.expectancy)}</td>
      <td className="px-4 py-3">{percent.format(report.winRate)}</td>
      <td className="px-4 py-3 text-warning">{currency.format(report.totalCosts)}</td>
      <td className="px-4 py-3">
        <div className="mb-2 grid gap-1 text-xs">
          <Delta label="Exp" value={expectancyDelta} format="currency" lowerIsBetter={false} />
          <Delta label="Net" value={netPnlDelta} format="currency" lowerIsBetter={false} />
          <Delta label="Cost Drag" value={costDragDelta} format="percent" lowerIsBetter />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-1 border border-line px-2 py-1 text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canMoveUp || isReordering}
            onClick={onMoveUp}
            title="Move earlier in strategy timeline"
          >
            <ArrowUp size={13} /> Earlier
          </button>
          <button
            className="inline-flex items-center gap-1 border border-line px-2 py-1 text-xs hover:border-accent disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canMoveDown || isReordering}
            onClick={onMoveDown}
            title="Move later in strategy timeline"
          >
            <ArrowDown size={13} /> Later
          </button>
          <button className="border border-line px-2 py-1 text-xs hover:border-accent" onClick={onOpen}>Open</button>
          <button className="border border-line px-2 py-1 text-xs hover:border-accent disabled:opacity-40" disabled={!previousReport} onClick={onComparePrevious}>Compare Previous</button>
          <button className="border border-line px-2 py-1 text-xs hover:border-accent disabled:opacity-40" disabled={!bestReportId || bestReportId === report.id} onClick={onCompareBest}>Compare Best</button>
          <button className="border border-line p-1.5 text-muted hover:border-loss hover:text-loss" onClick={onRemove} title="Remove"><Trash2 size={14} /></button>
        </div>
      </td>
    </tr>
  );
}

function Delta({ label, value, format, lowerIsBetter }: { label: string; value?: number; format: "currency" | "percent"; lowerIsBetter: boolean }) {
  const neutral = value === undefined || Math.abs(value) < 0.0001;
  const improved = !neutral && (lowerIsBetter ? value < 0 : value > 0);
  return (
    <span className={neutral ? "text-muted" : improved ? "text-accent" : "text-loss"}>
      {label}: {value === undefined ? "N/A" : format === "currency" ? currency.format(value) : percent.format(value)}
    </span>
  );
}

function scoreClass(score: number) {
  if (score >= 80) return "text-accent";
  if (score >= 60) return "text-warning";
  return "text-loss";
}

function trendClass(direction: CollectionTrendMetric["direction"]) {
  if (direction === "improving") return "border-accent/60";
  if (direction === "degrading") return "border-loss/60";
  if (direction === "mixed") return "border-warning/60";
  return "border-line";
}

function collectionTrendStripeClass(direction: CollectionTrendMetric["direction"]) {
  if (direction === "improving") return "tone-green";
  if (direction === "degrading") return "tone-red";
  if (direction === "mixed") return "tone-yellow";
  return "tone-gray";
}

function formatTrendValue(value: number | undefined, key: CollectionTrendMetric["key"]) {
  if (value === undefined) return "N/A";
  if (key === "costDragPct" || key === "winRate") return percent.format(value);
  if (key === "netPnl" || key === "expectancy" || key === "totalCosts") return currency.format(value);
  return value.toFixed(2);
}

function formatChartValue(value: number, format: "currency" | "percent" | "number") {
  if (!Number.isFinite(value)) return "N/A";
  if (format === "currency") return currency.format(value);
  if (format === "percent") return percent.format(value);
  return value.toFixed(2);
}

function formatOptionalCurrency(value: number | undefined) {
  return value === undefined ? "N/A" : currency.format(value);
}

function formatOptionalPercent(value: number | undefined) {
  return value === undefined ? "N/A" : percent.format(value);
}

function deltaClass(value: number | undefined, lowerIsBetter: boolean) {
  if (value === undefined || Math.abs(value) < 0.0001) return "px-4 py-3 text-muted";
  const improved = lowerIsBetter ? value < 0 : value > 0;
  return improved ? "px-4 py-3 text-accent" : "px-4 py-3 text-loss";
}

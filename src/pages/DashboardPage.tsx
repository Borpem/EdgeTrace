import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  FileText,
  HelpCircle,
  Home,
  Info,
  Layers3,
  Lock,
  Scale,
  TrendingDown,
  TrendingUp,
  X
} from "lucide-react";
import { AddToStrategySetDialog } from "../components/AddToStrategySetDialog";
import { PaywallGate } from "../components/PaywallGate";
import { formatReportType, ReportDetailsEditor } from "../components/ReportDetailsEditor";
import { TableContainer } from "../components/ui/Primitives";
import { trackEvent } from "../lib/analytics";
import { getActivationSummary, getReportBenchmarks, listReports } from "../lib/api";
import {
  breakdownLabels,
  buildBreakdown,
  findLargestLeak,
  findStrongestSegment,
  type BreakdownDimension,
  type BreakdownRow
} from "../lib/breakdowns";
import { costDragSortValue } from "../lib/costDrag";
import { NO_LOSS_PROFIT_FACTOR, normalizePortfolioMetrics } from "../lib/diagnostics";
import { canUseFeature, canViewFullDrilldown, getPlanConfig, getReportAccessLevel } from "../lib/entitlements";
import { buildReportIntelligence, type MetricStatus } from "../lib/reportIntelligence";
import type {
  ActivationSummary,
  AggregateBenchmarkMetric,
  AggregateBenchmarkSnapshot,
  DiagnosticsResult,
  NormalizedTrade,
  ReportSummary,
  UserProfile
} from "../types";

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
type DashboardTab = "overview" | "breakdown" | "trades";
type GuideMetricTone = "red" | "yellow" | "green" | "blue" | "gray" | "white";
type ProQuestionId = "fix-first" | "explain-report" | "next-risk";
type GuideMetric = {
  label: string;
  value: string;
  tone?: GuideMetricTone;
};
type GuidedReportStep = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  metrics?: GuideMetric[];
  details?: string[];
};
type EdgeScoreFactor = {
  label: string;
  value: number;
  detail: string;
  nextStep: string;
  tone: "green" | "yellow" | "red" | "gray";
};
type EdgeScoreOutput = {
  score: number;
  band: string;
  summary: string;
  factors: EdgeScoreFactor[];
};
type LocalCoachAnswer = {
  label: string;
  title: string;
  body: string;
  bullets: string[];
};
type RegressionWatchItem = {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low" | "clear";
};
type DashboardReviewAgenda = {
  label: string;
  title: string;
  summary: string;
  items: string[];
  checks: Array<{ label: string; current: string; target: string }>;
};
type EquityCurvePoint = { trade: number; equity: number };
type SignedEquityCurvePoint = EquityCurvePoint & {
  positiveEquity: number | null;
  negativeEquity: number | null;
};

type DashboardPageProps = {
  result: DiagnosticsResult;
  profile?: UserProfile | null;
  onDrillDown?: (selection: { dimension: BreakdownDimension; group: string }) => void;
  onReconstructionAudit?: () => void;
  onReportUpdated?: (report: ReportSummary) => void;
  onCompareReport?: (reportId: string) => void;
  onSelectReport?: (reportId: string) => Promise<void> | void;
  onViewReports?: () => void;
  onCreateReport?: () => void;
  onOpenDashboard?: () => void;
  onOpenCollections?: () => void;
  onOpenFeatures?: () => void;
  accountControl?: ReactNode;
  reportJustCreated?: boolean;
  onDismissCreatedBanner?: () => void;
  demoMode?: boolean;
  onExitDemo?: () => void;
};

export function DashboardPage({
  result,
  profile,
  onDrillDown,
  onReconstructionAudit,
  onReportUpdated,
  onCompareReport,
  onSelectReport,
  onViewReports,
  onCreateReport,
  onOpenDashboard,
  onOpenCollections,
  onOpenFeatures,
  accountControl,
  reportJustCreated,
  onDismissCreatedBanner,
  demoMode,
  onExitDemo
}: DashboardPageProps) {
  const [sortKey, setSortKey] = useState<SortKey>("entryTime");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [breakdownDimension, setBreakdownDimension] = useState<BreakdownDimension>("symbol");
  const [breakdownSortKey, setBreakdownSortKey] = useState<BreakdownSortKey>("netPnl");
  const [breakdownSortDirection, setBreakdownSortDirection] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isAddingToStrategySet, setIsAddingToStrategySet] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [activation, setActivation] = useState<ActivationSummary | null>(null);
  const [benchmarks, setBenchmarks] = useState<AggregateBenchmarkSnapshot | null>(null);
  const [benchmarksLoading, setBenchmarksLoading] = useState(false);
  const [benchmarksError, setBenchmarksError] = useState("");
  const [availableReports, setAvailableReports] = useState<ReportSummary[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportSelectorError, setReportSelectorError] = useState("");

  const trades = Array.isArray(result.trades) ? result.trades : [];
  const charts = result.charts ?? { equityCurve: [], pnlBySymbol: [], pnlByHour: [] };
  const metrics = useMemo(() => normalizePortfolioMetrics(result.metrics, trades), [result.metrics, trades]);
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
  const canViewAggregateBenchmarks = canUseFeature(plan, "aggregate_benchmarks");
  const canUseProIntelligence =
    canUseFeature(plan, "ask_edge_trace") &&
    canUseFeature(plan, "what_if_simulator") &&
    canUseFeature(plan, "edge_stability_score");
  const canInspectFullDrilldown = reportAccessLevel === "full" && canViewFullDrilldown(plan);
  const fullAttributionAccess =
    canInspectFullDrilldown &&
    !(result.lockedSections ?? []).some((section) => ["full_breakdowns", "full_drilldowns"].includes(section));
  const fullTradeAccess =
    reportAccessLevel === "full" && !(result.lockedSections ?? []).some((section) => ["full_trades"].includes(section));
  const canViewReconstructionAudit = reportAccessLevel === "full" && canUseFeature(plan, "reconstruction_audit");
  const hasReconstructionAudit = useMemo(
    () => trades.some((trade) => trade.reconstructionMethod || trade.sourceExecutionIds?.length),
    [trades]
  );
  const primaryInspection = intelligence.nextBestInspections[0];
  const provenance = result.importProvenance;
  const costsIncluded =
    provenance?.costsDetected ?? (trades.some((trade) => getTradeCosts(trade) > 0) || metrics.totalCosts > 0);
  const rValuesAvailable =
    provenance?.rMultipleDetected ??
    (trades.some((trade) => typeof trade.realizedR === "number") || metrics.averageRealizedR !== undefined);
  const reconstructionUsed = provenance?.reconstructionEnabled ?? hasReconstructionAudit;
  const firstReportReady =
    Boolean(reportJustCreated) &&
    (activation ? !activation.firstReportCreatedAt || activation.firstReportCreatedAt === result.createdAt : true);
  const hasDashboardNotices = Boolean(
    reportJustCreated || firstReportReady || !costsIncluded || !rValuesAvailable || reconstructionUsed
  );
  const normalizedTradeCount = provenance?.normalizedTradeCount ?? metrics.totalTrades ?? trades.length;
  const performanceData = charts.equityCurve.length ? charts.equityCurve : buildEquityCurve(trades);
  const signedPerformanceData = useMemo(() => buildSignedEquityCurve(performanceData), [performanceData]);
  const overviewLabel = overviewStatus(intelligence.strategyHealthScore, intelligence.primaryDiagnosis);
  const overviewCardTone = overviewTone(intelligence.strategyHealthScore, intelligence.primaryDiagnosis);
  const impactBreakdown = buildImpactBreakdown(metrics, largestLeak);
  const priorityInsights = buildPriorityInsights(safeResult, intelligence, largestLeak, primaryInspection);
  const actionItems = buildActionItems(intelligence, primaryInspection, largestLeak, metrics);
  const edgeScore = useMemo(
    () =>
      buildEdgeScore({
        metrics,
        normalizedTradeCount,
        costsIncluded,
        rValuesAvailable
      }),
    [costsIncluded, metrics, normalizedTradeCount, rValuesAvailable]
  );
  const proCoachAnswers = useMemo(
    () =>
      buildLocalCoachAnswers({
        result: safeResult,
        intelligence,
        primaryInspection,
        largestLeak,
        strongestSegment,
        actionItems,
        priorityInsights,
        edgeScore
      }),
    [actionItems, edgeScore, intelligence, largestLeak, primaryInspection, priorityInsights, safeResult, strongestSegment]
  );
  const regressionWatch = useMemo(
    () => buildDashboardRegressionWatch(metrics, intelligence, largestLeak),
    [intelligence, largestLeak, metrics]
  );
  const reviewAgenda = useMemo(
    () => buildDashboardReviewAgenda(safeResult, intelligence, actionItems, regressionWatch),
    [actionItems, intelligence, regressionWatch, safeResult]
  );
  const reportDate = result.createdAt ? new Date(result.createdAt) : undefined;
  const guideSteps = useMemo(
    () =>
      buildGuidedReportSteps({
        result: safeResult,
        intelligence,
        normalizedTradeCount,
        costsIncluded,
        rValuesAvailable,
        reconstructionUsed,
        largestLeak,
        strongestSegment,
        primaryInspection,
        priorityInsights,
        actionItems
      }),
    [
      actionItems,
      costsIncluded,
      intelligence,
      largestLeak,
      normalizedTradeCount,
      primaryInspection,
      priorityInsights,
      rValuesAvailable,
      reconstructionUsed,
      safeResult,
      strongestSegment
    ]
  );
  const walkthroughOpen = isGuideOpen || Boolean(demoMode);
  const activeGuideStep = Math.min(guideStep, Math.max(guideSteps.length - 1, 0));

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

  useEffect(() => {
    let active = true;
    setReportsLoading(true);
    setReportSelectorError("");
    void listReports()
      .then(({ reports }) => {
        if (!active) return;
        const sortedReports = [...(reports ?? [])].sort(
          (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
        );
        setAvailableReports(sortedReports);
      })
      .catch(() => {
        if (active) setReportSelectorError("Reports could not be loaded.");
      })
      .finally(() => {
        if (active) setReportsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [result.id]);

  useEffect(() => {
    let active = true;
    setBenchmarks(null);
    setBenchmarksError("");

    if (!canViewAggregateBenchmarks) {
      setBenchmarksLoading(false);
      return () => {
        active = false;
      };
    }

    setBenchmarksLoading(true);
    void getReportBenchmarks(result.id)
      .then((snapshot) => {
        if (active) setBenchmarks(snapshot);
      })
      .catch((err) => {
        if (active) setBenchmarksError(err instanceof Error ? err.message : "Aggregate benchmarks could not be loaded.");
      })
      .finally(() => {
        if (active) setBenchmarksLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canViewAggregateBenchmarks, result.id]);

  useEffect(() => {
    setGuideStep(0);
    setIsGuideOpen(false);
  }, [result.id]);

  useEffect(() => {
    setGuideStep((current) => Math.min(current, Math.max(guideSteps.length - 1, 0)));
  }, [guideSteps.length]);

  useEffect(() => {
    if (!walkthroughOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (demoMode && onExitDemo) {
        onExitDemo();
      } else {
        setIsGuideOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [demoMode, onExitDemo, walkthroughOpen]);

  const openWalkthrough = () => {
    setGuideStep(0);
    setIsGuideOpen(true);
    trackEvent("dashboard_walkthrough_opened", { reportId: result.id, stepCount: guideSteps.length });
  };

  const closeWalkthrough = () => {
    if (demoMode && onExitDemo) {
      onExitDemo();
    } else {
      setIsGuideOpen(false);
    }
  };

  const finishWalkthrough = () => {
    if (demoMode && onExitDemo) {
      onExitDemo();
    } else {
      setIsGuideOpen(false);
    }
    trackEvent("dashboard_walkthrough_completed", { reportId: result.id });
  };

  const goToNextWalkthroughStep = () => {
    if (activeGuideStep >= guideSteps.length - 1) {
      finishWalkthrough();
      return;
    }
    const nextStep = activeGuideStep + 1;
    setGuideStep(nextStep);
    trackEvent("dashboard_walkthrough_step_opened", { reportId: result.id, step: guideSteps[nextStep]?.id ?? "" });
  };

  const goToPreviousWalkthroughStep = () => {
    setGuideStep((current) => Math.max(current - 1, 0));
  };

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

  const openDetailTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    trackEvent("report_tab_opened", { reportId: result.id, tab, source: "dashboard_action" });
    window.requestAnimationFrame(() => {
      document.getElementById("dashboard-detail-dock")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleAudit = () => {
    if (!canViewReconstructionAudit) {
      window.history.pushState(null, "", "/pricing");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    trackEvent("reconstruction_audit_opened", { reportId: result.id });
    onReconstructionAudit?.();
  };

  const handleSidebarCompare = () => {
    if (onCompareReport) onCompareReport(result.id);
  };

  const handleReportSelect = async (reportId: string) => {
    if (!reportId || reportId === result.id) return;
    if (!onSelectReport) {
      onViewReports?.();
      return;
    }
    setReportSelectorError("");
    try {
      trackEvent("dashboard_report_selector_changed", { reportId });
      await onSelectReport(reportId);
    } catch (err) {
      setReportSelectorError(err instanceof Error ? err.message : "Selected report could not be opened.");
    }
  };

  const workflowAction = useMemo(() => {
    if (!activation?.hasClickedDrilldown && primaryInspection) {
      return {
        title: "Inspect the weakest segment",
        detail: "Drill into the trades behind the primary leak.",
        label: "Open drilldown",
        action: inspectPrimarySegment
      };
    }
    if (!activation?.hasCreatedComparison && onCompareReport) {
      return {
        title: "Compare this report",
        detail: "See whether the next iteration improves the weak metric.",
        label: "Open comparison",
        action: () => onCompareReport(result.id)
      };
    }
    if (!activation?.hasCreatedCollection) {
      return {
        title: "Add to strategy set",
        detail: "Group this result with related strategy iterations.",
        label: "Add to set",
        action: () => setIsAddingToStrategySet(true)
      };
    }
    return undefined;
  }, [activation, onCompareReport, primaryInspection, result.id]);

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
    <main className={`EdgeTrace-report-dashboard ${walkthroughOpen ? "has-walkthrough-open" : ""}`}>
      <DashboardSidebar
        onDashboard={onOpenDashboard}
        onAnalyze={onCreateReport}
        onReports={onViewReports}
        onCollections={onOpenCollections}
        onCompare={handleSidebarCompare}
        onFeatures={onOpenFeatures}
        ariaHidden={walkthroughOpen}
      />

      <section className="EdgeTrace-dashboard-main" aria-hidden={walkthroughOpen}>
        <header className="EdgeTrace-dashboard-header">
          <div className="EdgeTrace-dashboard-title-group">
            <div>
              <h1>Dashboard</h1>
              <p>Post-report intelligence at a glance.</p>
            </div>
            <div className="EdgeTrace-report-selector-wrap">
              <div className="EdgeTrace-report-selector-head">
                <label htmlFor="dashboard-report-select">Report</label>
                <button className="EdgeTrace-report-edit-button" type="button" onClick={() => setIsEditingDetails(true)}>
                  Edit details
                </button>
              </div>
              <select
                id="dashboard-report-select"
                className="EdgeTrace-report-selector"
                value={result.id}
                disabled={reportsLoading}
                onChange={(event) => void handleReportSelect(event.target.value)}
              >
                {!availableReports.some((report) => report.id === result.id) && (
                  <option value={result.id}>{result.name ?? "Diagnostic Report"}</option>
                )}
                {availableReports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.name}
                  </option>
                ))}
              </select>
              {reportSelectorError && <small>{reportSelectorError}</small>}
            </div>
          </div>
          <div className="EdgeTrace-dashboard-report-meta">
            <div className="EdgeTrace-report-generated">
              <span>
                Generated{" "}
                {reportDate
                  ? reportDate.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit"
                    })
                  : "date unavailable"}
              </span>
              <CalendarDays size={13} aria-hidden="true" />
            </div>
            {accountControl && <div className="EdgeTrace-dashboard-account-control">{accountControl}</div>}
          </div>
          <div className="EdgeTrace-dashboard-actions">
            <button className="EdgeTrace-results-walkthrough-button" onClick={openWalkthrough}>
              <span className="EdgeTrace-results-walkthrough-icon" aria-hidden="true">
                <BookOpen size={24} />
              </span>
              <span className="EdgeTrace-results-walkthrough-copy">
                <strong>Results Walkthrough</strong>
                <small>Step-by-step report explanation</small>
              </span>
              <ArrowRight className="EdgeTrace-results-walkthrough-arrow" size={19} aria-hidden="true" />
            </button>
          </div>
        </header>

        {hasDashboardNotices && (
          <section className="EdgeTrace-dashboard-alerts" aria-label="Report notices">
            {reportJustCreated && (
              <Notice
                tone="blue"
                title="Report created"
                message="Start with the primary diagnosis, then inspect the recommended segment."
                action={onDismissCreatedBanner}
                actionLabel="Dismiss"
              />
            )}
            {firstReportReady && (
              <Notice
                tone="blue"
                title="First report ready"
                message="Review the diagnosis, inspect the weakest segment, then compare the next iteration."
              />
            )}
            {!costsIncluded && (
              <Notice
                tone="yellow"
                title="Cost data missing"
                message="Net performance may be overstated because cost data was not detected."
              />
            )}
            {!rValuesAvailable && (
              <Notice
                tone="yellow"
                title="R-multiple limited"
                message="R analysis is limited because stop or risk data was not available."
              />
            )}
            {reconstructionUsed && (
              <Notice
                tone="gray"
                title="Reconstructed trades"
                message="This report uses reconstructed execution records. Audit lineage if results look unexpected."
                action={hasReconstructionAudit ? handleAudit : undefined}
                actionLabel="Audit"
              />
            )}
          </section>
        )}

        <DashboardLegend />

        <section className="EdgeTrace-kpi-grid" aria-label="Dashboard overview metrics">
          <DashboardMetricCard
            title="Overview"
            value={overviewLabel}
            detail={overviewDetail(overviewLabel)}
            tone={overviewCardTone}
            icon={overviewCardTone === "green" ? <CheckCircle2 size={52} /> : <AlertCircle size={52} />}
            dataTestId="dashboard-health-card"
          />
          <DashboardMetricCard
            title="Strategy Health"
            value={`${intelligence.strategyHealthScore}`}
            suffix="/100"
            detail={healthScoreCopy(intelligence.strategyHealthScore)}
            tone={healthScoreTone(intelligence.strategyHealthScore)}
          />
          <DashboardMetricCard
            title="Expectancy"
            value={currency.format(metrics.expectancy)}
            suffix="Per Trade"
            detail={`After-cost average. Gross ${currency.format(metrics.grossExpectancy)}.`}
            tone={metrics.expectancy >= 0 ? "green" : "red"}
          />
          <DashboardMetricCard
            title="Net PnL"
            value={currency.format(metrics.netPnl)}
            detail={`${number.format(normalizedTradeCount)} trades`}
            subdetail="After-cost performance"
            tone={metrics.netPnl >= 0 ? "green" : "red"}
          />
          <DashboardMetricCard
            title="Win Rate"
            value={percent.format(metrics.winRate)}
            detail={winRateCopy(metrics.winRate)}
            tone={statusTone(intelligence.keyMetricStatuses.winRate)}
          />
          <DashboardMetricCard
            title="R-Multiple"
            value={metrics.averageRealizedR !== undefined ? `${number.format(metrics.averageRealizedR)}R` : "N/A"}
            detail={rMultipleCopy(metrics.averageRealizedR)}
            subdetail="Avg R"
            tone={statusTone(intelligence.keyMetricStatuses.averageR)}
          />
        </section>

        <section className="EdgeTrace-dashboard-middle">
          <DiagnosisPanel
            intelligence={intelligence}
            metrics={metrics}
            impactBreakdown={impactBreakdown}
            onBreakdown={() => openDetailTab("breakdown")}
          />

          <div className="EdgeTrace-dashboard-panel EdgeTrace-trend-panel">
            <PanelHeader title="Key Performance Trend" info />
            <div className="EdgeTrace-trend-select">Net PnL</div>
            <ResponsiveContainer width="100%" height={310}>
              <LineChart data={signedPerformanceData} margin={{ top: 14, right: 10, left: 2, bottom: 0 }}>
                <CartesianGrid stroke="#1d3042" strokeOpacity={0.58} vertical={false} />
                <XAxis
                  dataKey="trade"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  allowDecimals={false}
                  stroke="#8796a8"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 13 }}
                />
                <YAxis
                  stroke="#8796a8"
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 13 }}
                  tickFormatter={formatAxisCurrency}
                />
                <ReferenceLine y={0} stroke="#5b6a76" strokeOpacity={0.45} strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ stroke: "#5b6a76", strokeOpacity: 0.36 }}
                  content={<PerformanceTrendTooltip />}
                />
                <Line
                  type="linear"
                  dataKey="positiveEquity"
                  stroke="#6fc78a"
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#6fc78a", stroke: "#07111d", strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Line
                  type="linear"
                  dataKey="negativeEquity"
                  stroke="#f45b72"
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#f45b72", stroke: "#07111d", strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <button className="EdgeTrace-dashboard-link" onClick={() => openDetailTab("breakdown")}>
              View breakdown analytics <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>

          <PriorityInsights
            insights={priorityInsights}
            onOpenInsight={inspectPrimarySegment}
            onViewAllInsights={() => openDetailTab("overview")}
          />
        </section>

        <BenchmarkIntelligencePanel
          accessLevel={canViewAggregateBenchmarks ? "full" : "locked"}
          snapshot={benchmarks}
          isLoading={benchmarksLoading}
          error={benchmarksError}
        />

        <PaywallGate
          feature="ask_edge_trace"
          accessLevel={canUseProIntelligence ? "full" : "preview"}
          title="Upgrade to Pro to unlock the local intelligence workspace."
          description="Pro adds local Ask EdgeTrace answers, What-If Simulator projections, Edge Score factors, review agenda, and regression watch on the dashboard."
        >
          <ProIntelligenceWorkspace
            answers={proCoachAnswers}
            edgeScore={edgeScore}
            metrics={metrics}
            regressionWatch={regressionWatch}
            reviewAgenda={reviewAgenda}
          />
        </PaywallGate>

        <section className="EdgeTrace-dashboard-bottom">
          <SnapshotStats
            metrics={metrics}
            averageR={metrics.averageRealizedR}
            normalizedTradeCount={normalizedTradeCount}
            onCompare={onCompareReport ? () => onCompareReport(result.id) : undefined}
          />
          <TopActions
            actionItems={actionItems}
            workflowAction={workflowAction}
            onInspect={inspectPrimarySegment}
            onAddToStrategySet={() => setIsAddingToStrategySet(true)}
          />
          <ContextGlance
            result={result}
            metrics={metrics}
            normalizedTradeCount={normalizedTradeCount}
            hasReconstructionAudit={hasReconstructionAudit}
            onAudit={handleAudit}
          />
        </section>

        <section id="dashboard-detail-dock" className="EdgeTrace-detail-dock" aria-label="Detailed report data">
          <div className="EdgeTrace-detail-tabs">
            {(["overview", "breakdown", "trades"] as DashboardTab[]).map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => {
                  setActiveTab(tab);
                  trackEvent("report_tab_opened", { reportId: result.id, tab });
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div className="EdgeTrace-dashboard-panel EdgeTrace-overview-panel">
              <div>
                <PanelHeader title="Report Snapshot" info />
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                  {intelligence.primaryExplanation}
                </p>
              </div>
              <div className="EdgeTrace-overview-tags">
                <span>{formatReportType(result.reportType)}</span>
                {result.strategyLabel && <span>{result.strategyLabel}</span>}
                {(result.tags ?? []).slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="EdgeTrace-overview-insights">
                <PanelHeader title="All Insights" info />
                <div className="EdgeTrace-overview-insight-list">
                  {priorityInsights.map((insight) => (
                    <div key={`${insight.label}-${insight.title}`} className={`tone-${insight.tone}`}>
                      <p>
                        <strong>{insight.title}</strong>
                        <small>{insight.detail}</small>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "breakdown" && (
            <PaywallGate
              feature="advanced_attribution"
              accessLevel={fullAttributionAccess ? "full" : "preview"}
              title="Upgrade to Pro to unlock the full attribution breakdown."
              description="EdgeTrace detected a performance leak. Pro shows which symbols, strategies, and time windows contributed most."
            >
              <section className="mt-5">
                <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Attribution</p>
                    <h2 className="mt-2 text-2xl font-semibold">Breakdown analytics</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["symbol", "strategy", "timeOfDay"] as BreakdownDimension[]).map((dimension) => (
                      <button
                        key={dimension}
                        className={`EdgeTrace-dimension-toggle ${breakdownDimension === dimension ? "active" : ""}`}
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
                            trackEvent("drilldown_opened", {
                              reportId: result.id,
                              dimension: breakdownDimension,
                              group: row.group
                            });
                            onDrillDown?.({ dimension: breakdownDimension, group: row.group });
                          }}
                        >
                          <td className="px-4 py-3 font-medium">{row.group}</td>
                          <td className="px-4 py-3 text-muted">{row.totalTrades}</td>
                          <td className="px-4 py-3">{percent.format(row.winRate)}</td>
                          <td className={`px-4 py-3 ${numericValueClass(row.netPnl)}`}>{currency.format(row.netPnl)}</td>
                          <td className={`px-4 py-3 ${numericValueClass(row.expectancy)}`}>
                            {currency.format(row.expectancy)}
                          </td>
                          <td className="px-4 py-3 text-muted">{formatNumber(row.averageRealizedR)}</td>
                          <td className={`px-4 py-3 ${costDragValueClass(row.costDragPct)}`}>{row.costDrag.label}</td>
                          <td className="px-4 py-3">{currency.format(row.grossPnl)}</td>
                          <td className={row.totalCosts > 0 ? "px-4 py-3 text-warning" : "px-4 py-3 text-muted"}>
                            {currency.format(row.totalCosts)}
                          </td>
                          <td className="px-4 py-3 text-cyan">{currency.format(row.averageWin)}</td>
                          <td className="px-4 py-3 text-loss">{currency.format(row.averageLoss)}</td>
                          <td className="px-4 py-3 text-muted">{formatProfitFactor(row.profitFactor)}</td>
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
              <TableContainer className="mt-5">
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
                        <td className={`px-4 py-3 ${numericValueClass(trade.netPnl)}`}>
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
        </section>
      </section>

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
      {walkthroughOpen && guideSteps.length > 0 && (
        <GuidedReportWalkthrough
          step={guideSteps[activeGuideStep]}
          stepIndex={activeGuideStep}
          stepCount={guideSteps.length}
          onBack={goToPreviousWalkthroughStep}
          onClose={closeWalkthrough}
          onNext={goToNextWalkthroughStep}
        />
      )}
    </main>
  );
}

function DashboardSidebar({
  onDashboard,
  onAnalyze,
  onReports,
  onCollections,
  onCompare,
  onFeatures,
  ariaHidden
}: {
  onDashboard?: () => void;
  onAnalyze?: () => void;
  onReports?: () => void;
  onCollections?: () => void;
  onCompare?: () => void;
  onFeatures?: () => void;
  ariaHidden?: boolean;
}) {
  const navItems = [
    { label: "Dashboard", icon: Home, action: onDashboard, active: true },
    { label: "Import Trades", icon: TrendingUp, action: onAnalyze },
    { label: "Reports", icon: FileText, action: onReports },
    { label: "Strategy Sets", icon: Layers3, action: onCollections },
    { label: "Compare", icon: Scale, action: onCompare },
    { label: "How It Works", icon: HelpCircle, action: onFeatures }
  ];

  return (
    <aside className="EdgeTrace-dashboard-sidebar" aria-hidden={ariaHidden}>
      <button className="EdgeTrace-sidebar-brand" onClick={onDashboard} aria-label="EdgeTrace dashboard">
        <img src="/brand/edgetrace_icon_monochrome_white_transparent.png" alt="" aria-hidden="true" />
        <img className="EdgeTrace-sidebar-wordmark" src="/brand/edgetrace_wordmark_monochrome_white.png" alt="EdgeTrace" />
      </button>

      <nav aria-label="Dashboard navigation" className="EdgeTrace-sidebar-nav">
        {navItems.map(({ label, icon: Icon, action, active }) => (
          <button key={label} className={active ? "active" : ""} onClick={action}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function DashboardMetricCard({
  title,
  value,
  suffix,
  detail,
  subdetail,
  tone,
  icon,
  sparkline,
  progress,
  dataTestId
}: {
  title: string;
  value: string;
  suffix?: string;
  detail: string;
  subdetail?: string;
  tone: "red" | "yellow" | "green" | "blue" | "gray";
  icon?: ReactNode;
  sparkline?: Array<{ trade: number; equity: number }>;
  progress?: number;
  dataTestId?: string;
}) {
  return (
    <article className={`EdgeTrace-dashboard-panel EdgeTrace-kpi-card tone-${tone} ${icon ? "has-icon" : ""}`} data-testid={dataTestId}>
      <PanelHeader title={title} info />
      <div className="EdgeTrace-kpi-body">
        <div>
          <p className="EdgeTrace-kpi-value">
            {value}
            {suffix && <span>{suffix}</span>}
          </p>
          {subdetail && <p className="EdgeTrace-kpi-subdetail">{subdetail}</p>}
          <p className="EdgeTrace-kpi-detail">{detail}</p>
        </div>
        {icon && <div className="EdgeTrace-kpi-icon" aria-hidden="true">{icon}</div>}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="EdgeTrace-kpi-sparkline" aria-hidden="true">
          <ResponsiveContainer width="100%" height={44}>
            <LineChart data={sparkline}>
              <Line type="monotone" dataKey="equity" stroke="currentColor" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {typeof progress === "number" && (
        <div className="EdgeTrace-kpi-progress" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
          <div>
            <small>0%</small>
            <small>100%</small>
          </div>
        </div>
      )}
    </article>
  );
}

function PerformanceTrendTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload?: SignedEquityCurvePoint }>;
}) {
  const point = payload?.find((item) => typeof item.payload?.equity === "number")?.payload;
  if (!active || !point) return null;

  const tone = point.equity >= 0 ? "positive" : "negative";

  return (
    <div className={`EdgeTrace-trend-tooltip tone-${tone}`}>
      <span>Trade {number.format(point.trade)}</span>
      <strong>{currency.format(point.equity)}</strong>
    </div>
  );
}

function DiagnosisPanel({
  intelligence,
  metrics,
  impactBreakdown,
  onBreakdown
}: {
  intelligence: ReturnType<typeof buildReportIntelligence>;
  metrics: DiagnosticsResult["metrics"];
  impactBreakdown: ReturnType<typeof buildImpactBreakdown>;
  onBreakdown: () => void;
}) {
  const totalImpact = impactBreakdown.reduce((total, item) => total + item.value, 0);
  let running = 0;
  const stops = impactBreakdown
    .map((item) => {
      const start = running;
      running += item.percent;
      return `${item.color} ${start}% ${running}%`;
    })
    .join(", ");

  return (
    <div id="primary-diagnosis" className="EdgeTrace-dashboard-panel EdgeTrace-diagnosis-panel">
      <PanelHeader title="Primary Diagnosis" info />
      <div className="EdgeTrace-diagnosis-layout">
        <div>
          <h2 className={diagnosisToneClass(intelligence.primaryDiagnosis)}>{humanDiagnosis(intelligence.primaryDiagnosis)}</h2>
          <p>{intelligence.primaryLeak.explanation}</p>
          <div className="EdgeTrace-diagnosis-foot">
            <MetricMini label="Est. Impact" value={currency.format(-Math.abs(totalImpact || metrics.totalCosts))} tone="red" />
            <MetricMini label="Confidence" value={diagnosisConfidence(intelligence.strategyHealthScore)} tone="white" />
          </div>
        </div>

        <div className="EdgeTrace-impact-donut-wrap">
          <div className="EdgeTrace-impact-donut" style={{ background: `conic-gradient(${stops})` }}>
            <span>Total Impact</span>
            <strong>{currency.format(-Math.abs(totalImpact || metrics.totalCosts))}</strong>
          </div>
        </div>

        <div className="EdgeTrace-impact-list">
          {impactBreakdown.map((item) => (
            <div key={item.label}>
              <span style={{ backgroundColor: item.color }} />
              <p>
                <strong>{item.label}</strong>
                <small>{currency.format(-Math.abs(item.value))}</small>
              </p>
              <em>{Math.round(item.percent)}%</em>
            </div>
          ))}
          <button className="EdgeTrace-dashboard-link" onClick={onBreakdown}>
            View full breakdown <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PriorityInsights({
  insights,
  onOpenInsight,
  onViewAllInsights
}: {
  insights: Array<{ label: string; title: string; detail: string; tone: "red" | "yellow" | "gray" | "green" }>;
  onOpenInsight: () => void;
  onViewAllInsights: () => void;
}) {
  return (
    <div className="EdgeTrace-dashboard-panel EdgeTrace-insights-panel">
      <PanelHeader title="Priority Insights" info />
      <div className="EdgeTrace-priority-list">
        {insights.map((insight) => (
          <button key={`${insight.label}-${insight.title}`} className={`tone-${insight.tone}`} onClick={onOpenInsight}>
            <p>
              <strong>{insight.title}</strong>
              <small>{insight.detail}</small>
            </p>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      <button className="EdgeTrace-dashboard-link" onClick={onViewAllInsights}>
        View all insights <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function BenchmarkIntelligencePanel({
  accessLevel,
  snapshot,
  isLoading,
  error
}: {
  accessLevel: "full" | "locked";
  snapshot: AggregateBenchmarkSnapshot | null;
  isLoading: boolean;
  error: string;
}) {
  if (accessLevel === "locked") {
    return (
      <section className="EdgeTrace-dashboard-panel EdgeTrace-benchmark-panel is-locked">
        <div className="EdgeTrace-benchmark-copy">
          <PanelHeader title="EdgeTrace Benchmarks" info />
          <h2>See how this report compares to the aggregate trader cohort.</h2>
          <p>
            Pro turns collected report data into cost-drag percentiles, R-capture comparisons, expectancy benchmarks,
            and Edge Score factor context.
          </p>
        </div>

        <div className="EdgeTrace-benchmark-preview" aria-hidden="true">
          {[
            ["Cost Drag", "Percentile"],
            ["R Capture", "Benchmark"],
            ["Expectancy", "Median Gap"]
          ].map(([label, value], index) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <i style={{ width: `${72 - index * 14}%` }} />
            </div>
          ))}
        </div>

        <div className="EdgeTrace-benchmark-lock">
          <Lock size={16} aria-hidden="true" />
          <span>Included with Pro</span>
          <button type="button" onClick={openBenchmarkPricing}>
            Upgrade <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </section>
    );
  }

  const metrics = snapshot?.metrics ?? [];

  return (
    <section className="EdgeTrace-dashboard-panel EdgeTrace-benchmark-panel">
      <div className="EdgeTrace-benchmark-copy">
        <PanelHeader title="EdgeTrace Benchmarks" info />
        <h2>{snapshot?.topInsight ?? "Compare this report against the aggregate cohort."}</h2>
        <p>
          {snapshot
            ? `${snapshot.cohortLabel} · ${snapshot.sampleSize} eligible reports · minimum cohort ${snapshot.minimumCohortSize}`
            : "Loading cohort medians and percentiles for this report."}
        </p>
      </div>

      <div className="EdgeTrace-benchmark-metrics">
        {isLoading && (
          <div className="EdgeTrace-benchmark-empty">
            <BarChart3 size={18} aria-hidden="true" />
            <span>Loading aggregate benchmarks...</span>
          </div>
        )}

        {!isLoading && error && (
          <div className="EdgeTrace-benchmark-empty tone-warning">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!isLoading && !error && metrics.map((metric) => <BenchmarkMetricRow key={metric.key} metric={metric} />)}
      </div>

      {snapshot?.privacyNote && <p className="EdgeTrace-benchmark-note">{snapshot.privacyNote}</p>}
    </section>
  );
}

function BenchmarkMetricRow({ metric }: { metric: AggregateBenchmarkMetric }) {
  const percentileValue = metric.percentile ?? 0;
  return (
    <div className={`EdgeTrace-benchmark-row tone-${metric.status}`}>
      <div>
        <strong>{metric.label}</strong>
        <span>{metric.description}</span>
      </div>
      <div className="EdgeTrace-benchmark-values">
        <span>{formatBenchmarkValue(metric.userValue, metric.unit)}</span>
        <small>Median {formatBenchmarkValue(metric.populationMedian, metric.unit)}</small>
      </div>
      <div className="EdgeTrace-benchmark-percentile" aria-label={`${metric.label} percentile`}>
        <span>{metric.percentile ? `${metric.percentile}th` : "N/A"}</span>
        <i>
          <b style={{ width: `${Math.max(0, Math.min(100, percentileValue))}%` }} />
        </i>
      </div>
    </div>
  );
}

function ProIntelligenceWorkspace({
  answers,
  edgeScore,
  metrics,
  regressionWatch,
  reviewAgenda
}: {
  answers: Record<ProQuestionId, LocalCoachAnswer>;
  edgeScore: EdgeScoreOutput;
  metrics: DiagnosticsResult["metrics"];
  regressionWatch: RegressionWatchItem[];
  reviewAgenda: DashboardReviewAgenda;
}) {
  const [activeQuestion, setActiveQuestion] = useState<ProQuestionId>("fix-first");
  const [customQuestion, setCustomQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [costReductionPct, setCostReductionPct] = useState(15);
  const [winRateTargetPct, setWinRateTargetPct] = useState(() => Math.round(clamp(metrics.winRate * 100 + 3, 0, 95) * 10) / 10);
  const [rCaptureLift, setRCaptureLift] = useState(0.15);
  const activeAnswer = answers[activeQuestion];
  const displayedAnswer = submittedQuestion
    ? answerLocalCoachQuestion(submittedQuestion, { answers, metrics, edgeScore, regressionWatch, reviewAgenda })
    : activeAnswer;
  const projection = projectWhatIf(metrics, costReductionPct, winRateTargetPct, rCaptureLift);

  const submitQuestion = () => {
    const question = customQuestion.trim();
    if (!question) return;
    setSubmittedQuestion(question);
    trackEvent("ask_edge_trace_custom_question_submitted", { questionLength: question.length });
  };

  useEffect(() => {
    setWinRateTargetPct(Math.round(clamp(metrics.winRate * 100 + 3, 0, 95) * 10) / 10);
    setCostReductionPct(15);
    setRCaptureLift(0.15);
    setSubmittedQuestion("");
    setCustomQuestion("");
  }, [metrics.totalTrades, metrics.winRate]);

  return (
    <section className="EdgeTrace-dashboard-panel EdgeTrace-pro-workspace">
      <div className="EdgeTrace-pro-workspace-header">
        <div>
          <PanelHeader title="Pro Intelligence Workspace" info />
          <h2>Local coaching, simulations, and review planning from this report.</h2>
        </div>
        <span>Runs locally</span>
      </div>

      <div className="EdgeTrace-pro-workspace-grid">
        <div className="EdgeTrace-pro-cell EdgeTrace-pro-coach">
          <div className="EdgeTrace-pro-cell-heading">
            <HelpCircle size={17} aria-hidden="true" />
            <span>Ask EdgeTrace</span>
          </div>
          <div className="EdgeTrace-pro-ask-box">
            <input
              type="text"
              value={customQuestion}
              placeholder="Ask about costs, win rate, R, risk, next action..."
              onChange={(event) => setCustomQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitQuestion();
              }}
            />
            <button type="button" onClick={submitQuestion}>
              Ask
            </button>
          </div>
          <div className="EdgeTrace-pro-question-tabs" role="tablist" aria-label="Ask EdgeTrace local prompts">
            {(Object.entries(answers) as Array<[ProQuestionId, LocalCoachAnswer]>).map(([id, answer]) => (
              <button
                key={id}
                type="button"
                className={activeQuestion === id ? "active" : ""}
                onClick={() => {
                  setActiveQuestion(id);
                  setSubmittedQuestion("");
                  trackEvent("ask_edge_trace_prompt_selected", { prompt: id });
                }}
              >
                {answer.label}
              </button>
            ))}
          </div>
          <div className="EdgeTrace-pro-answer">
            {submittedQuestion && <span className="EdgeTrace-pro-answer-source">Local answer to: {submittedQuestion}</span>}
            <h3>{displayedAnswer.title}</h3>
            <p>{displayedAnswer.body}</p>
            <ul>
              {displayedAnswer.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="EdgeTrace-pro-cell EdgeTrace-pro-score">
          <div className="EdgeTrace-pro-cell-heading">
            <Activity size={17} aria-hidden="true" />
            <span>Edge Score</span>
          </div>
          <div className="EdgeTrace-edge-score-readout">
            <strong>{edgeScore.score}</strong>
            <div>
              <span>{edgeScore.band}</span>
              <p>{edgeScore.summary}</p>
            </div>
          </div>
          <div className="EdgeTrace-edge-factor-list">
            {edgeScore.factors.map((factor) => (
              <div key={factor.label} className={`tone-${factor.tone}`}>
                <div>
                  <strong>{factor.label}</strong>
                  <span>{factor.detail}</span>
                </div>
                <em>{factor.value}</em>
                <i aria-hidden="true">
                  <b style={{ width: `${factor.value}%` }} />
                </i>
                <small>{factor.nextStep}</small>
              </div>
            ))}
          </div>
          <div className="EdgeTrace-edge-score-actions">
            <span>Highest-value score moves</span>
            {edgeScore.factors
              .filter((factor) => factor.value < 70)
              .slice(0, 2)
              .map((factor) => (
                <p key={`move-${factor.label}`}>{factor.nextStep}</p>
              ))}
            {edgeScore.factors.every((factor) => factor.value >= 70) && <p>Preserve the current process and use the next report to verify stability.</p>}
          </div>
        </div>

        <div className="EdgeTrace-pro-cell EdgeTrace-pro-simulator">
          <div className="EdgeTrace-pro-cell-heading">
            <Scale size={17} aria-hidden="true" />
            <span>What-If Simulator</span>
          </div>
          <div className="EdgeTrace-pro-sliders">
            <SimulatorControl
              label="Reduce costs"
              value={`${costReductionPct}%`}
              min={0}
              max={60}
              step={0.1}
              numericValue={costReductionPct}
              suffix="%"
              onChange={setCostReductionPct}
            />
            <SimulatorControl
              label="Target win rate"
              value={`${number.format(winRateTargetPct)}%`}
              min={0}
              max={95}
              step={0.1}
              numericValue={winRateTargetPct}
              suffix="%"
              onChange={setWinRateTargetPct}
            />
            <SimulatorControl
              label="Increase R capture"
              value={`+${number.format(rCaptureLift)}R`}
              min={0}
              max={0.5}
              step={0.01}
              numericValue={rCaptureLift}
              suffix="R"
              onChange={setRCaptureLift}
            />
          </div>
          <div className="EdgeTrace-pro-projection">
            <div>
              <span>Projected Net PnL</span>
              <strong className={projection.projectedNetPnl >= 0 ? "text-profit" : "text-loss"}>
                {currency.format(projection.projectedNetPnl)}
              </strong>
            </div>
            <div>
              <span>Projected Expectancy</span>
              <strong className={projection.projectedExpectancy >= 0 ? "text-profit" : "text-loss"}>
                {currency.format(projection.projectedExpectancy)}
              </strong>
            </div>
            <div>
              <span>Expected Change</span>
              <strong className={projection.delta >= 0 ? "text-profit" : "text-loss"}>
                {projection.delta >= 0 ? "+" : ""}
                {currency.format(projection.delta)}
              </strong>
            </div>
            <p>{projection.summary}</p>
            <div className="EdgeTrace-pro-impact-stack">
              <span>Cost impact: {currency.format(projection.costImpact)}</span>
              <span>Win-rate impact: {currency.format(projection.winRateImpact)}</span>
              <span>R-capture impact: {currency.format(projection.rCaptureImpact)}</span>
            </div>
          </div>
        </div>

        <div className="EdgeTrace-pro-cell EdgeTrace-pro-regression">
          <div className="EdgeTrace-pro-cell-heading">
            <TrendingDown size={17} aria-hidden="true" />
            <span>Regression Watch</span>
          </div>
          <p>Signals to compare against the next import. These are the metrics most likely to confirm improvement or deterioration.</p>
          <div className="EdgeTrace-pro-regression-watch is-standalone">
            {regressionWatch.map((item) => (
              <div key={item.title} className={`tone-${item.severity}`}>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="EdgeTrace-pro-cell EdgeTrace-pro-review">
          <div className="EdgeTrace-pro-cell-heading">
            <CalendarDays size={17} aria-hidden="true" />
            <span>{reviewAgenda.label}</span>
          </div>
          <h3>{reviewAgenda.title}</h3>
          <p>{reviewAgenda.summary}</p>
          <ul className="EdgeTrace-pro-review-list">
            {reviewAgenda.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="EdgeTrace-pro-review-checks">
            <span>Next-report pass/fail checks</span>
            {reviewAgenda.checks.map((check) => (
              <div key={check.label}>
                <strong>{check.label}</strong>
                <small>{check.current}</small>
                <em>{check.target}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SimulatorControl({
  label,
  value,
  min,
  max,
  step,
  numericValue,
  suffix,
  onChange
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  numericValue: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const commitValue = (value: number) => onChange(clamp(value, min, max));

  return (
    <label>
      <span>
        <strong>{label}</strong>
        <em>{value}</em>
      </span>
      <div className="EdgeTrace-pro-control-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          onChange={(event) => commitValue(Number(event.target.value))}
        />
        <div className="EdgeTrace-pro-number-input">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={numericValue}
            onChange={(event) => commitValue(Number(event.target.value))}
          />
          {suffix && <span>{suffix}</span>}
        </div>
      </div>
    </label>
  );
}

function SnapshotStats({
  metrics,
  averageR,
  normalizedTradeCount,
  onCompare
}: {
  metrics: DiagnosticsResult["metrics"];
  averageR?: number;
  normalizedTradeCount: number;
  onCompare?: () => void;
}) {
  const items = [
    { label: "Net PnL", value: currency.format(metrics.netPnl), delta: `${normalizedTradeCount} trades`, tone: metrics.netPnl >= 0 ? "green" : "red" },
    { label: "Expectancy", value: currency.format(metrics.expectancy), delta: "After costs", tone: metrics.expectancy >= 0 ? "green" : "red" },
    { label: "Win Rate", value: percent.format(metrics.winRate), delta: winRateCopy(metrics.winRate), tone: metrics.winRate >= 0.5 ? "green" : "red" },
    { label: "Profit Factor", value: formatProfitFactor(metrics.profitFactor), delta: profitFactorCopy(metrics.profitFactor), tone: metrics.profitFactor >= 1 ? "green" : "red" },
    { label: "R-Multiple", value: averageR !== undefined ? `${number.format(averageR)}R` : "N/A", delta: rMultipleCopy(averageR), tone: (averageR ?? 0) >= 0.5 ? "green" : "yellow" }
  ];

  return (
    <div className="EdgeTrace-dashboard-panel EdgeTrace-snapshot-panel">
      <PanelHeader title="What Changed vs Prior Report" info />
      <div className="EdgeTrace-snapshot-grid">
        {items.map((item) => (
          <div key={item.label} className={`tone-${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.delta}</small>
          </div>
        ))}
      </div>
      <button className="EdgeTrace-dashboard-link" onClick={onCompare} disabled={!onCompare}>
        See full comparison <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function TopActions({
  actionItems,
  workflowAction,
  onInspect,
  onAddToStrategySet
}: {
  actionItems: Array<{ title: string; impact: string; tone: "red" | "yellow" | "green" | "gray" }>;
  workflowAction?: { title: string; detail: string; label: string; action: () => void };
  onInspect: () => void;
  onAddToStrategySet: () => void;
}) {
  return (
    <div className="EdgeTrace-dashboard-panel EdgeTrace-actions-panel">
      <PanelHeader title="Top Actions (Next Steps)" info />
      <div className="EdgeTrace-next-actions">
        {actionItems.map((action, index) => (
          <button key={action.title} onClick={index === actionItems.length - 1 ? onAddToStrategySet : onInspect}>
            <span>{index + 1}</span>
            <strong>{action.title}</strong>
            <em className={`tone-${action.tone}`}>{action.impact}</em>
          </button>
        ))}
      </div>
      {workflowAction && (
        <button className="EdgeTrace-dashboard-link" onClick={workflowAction.action}>
          {workflowAction.label} <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function ContextGlance({
  result,
  metrics,
  normalizedTradeCount,
  hasReconstructionAudit,
  onAudit
}: {
  result: DiagnosticsResult;
  metrics: DiagnosticsResult["metrics"];
  normalizedTradeCount: number;
  hasReconstructionAudit: boolean;
  onAudit: () => void;
}) {
  const tradeFrequency = estimateTradeFrequency(result.trades);
  const dataQuality = result.importProvenance?.confidenceLabel ?? (result.importProvenance?.warningCount ? "Review Recommended" : "High");
  const rows = [
    ["Market Regime", inferRegime(metrics)],
    ["Execution friction", currency.format(metrics.totalCosts)],
    ["Volatility (ATR)", "Data unavailable"],
    ["Trade Frequency", tradeFrequency ? `${tradeFrequency} trades/day` : "Not enough dates"],
    ["Data Quality", dataQuality],
    ["Reconstruction", hasReconstructionAudit ? `${normalizedTradeCount} / ${metrics.totalTrades} trades` : `${normalizedTradeCount} trades`]
  ];

  return (
    <div className="EdgeTrace-dashboard-panel EdgeTrace-context-panel">
      <PanelHeader title="Context at a Glance" info />
      <div className="EdgeTrace-context-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <button className="EdgeTrace-dashboard-link" onClick={onAudit}>
        View report details <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function DashboardLegend() {
  const items = [
    ["Red", "Negative / Degraded", "Needs immediate attention", "#ff485c"],
    ["Yellow", "Caution / Watchlist", "Monitor and investigate", "#ffb82e"],
    ["Green", "Positive / Strength", "Healthy and working", "#74c476"],
    ["Blue", "Action / Primary", "Recommended next steps", "#45b7f4"],
    ["Gray", "Neutral / Info", "Supporting information", "#9aa7b5"]
  ];

  return (
    <section className="EdgeTrace-dashboard-legend">
      {items.map(([label, title, detail, color]) => (
        <div key={label}>
          <span style={{ backgroundColor: color }} />
          <strong>
            {label} <small>- {title}</small>
          </strong>
          <em>{detail}</em>
        </div>
      ))}
    </section>
  );
}

function Notice({
  tone,
  title,
  message,
  action,
  actionLabel
}: {
  tone: "blue" | "yellow" | "gray";
  title: string;
  message: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className={`EdgeTrace-dashboard-notice tone-${tone}`}>
      <Info size={15} aria-hidden="true" />
      <p>
        <strong>{title}</strong>
        <span>{message}</span>
      </p>
      {action && (
        <button onClick={action}>
          {actionLabel ?? "Open"}
        </button>
      )}
    </div>
  );
}

function PanelHeader({ title, info }: { title: string; info?: boolean | string }) {
  const infoText = typeof info === "string" ? info : info ? panelInfoText(title) : undefined;

  return (
    <div className="EdgeTrace-panel-header">
      <span>{title}</span>
      {infoText && (
        <span className="EdgeTrace-panel-info" tabIndex={0} aria-label={infoText}>
          <Info size={13} aria-hidden="true" />
          <span className="EdgeTrace-panel-tooltip" role="tooltip">{infoText}</span>
        </span>
      )}
    </div>
  );
}

function panelInfoText(title: string) {
  const descriptions: Record<string, string> = {
    Overview: "Overall read of the imported report based on health score and primary diagnosis.",
    "Strategy Health": "Composite 0-100 score from profitability, expectancy, costs, R capture, win rate, and trade count.",
    Expectancy: "Average after-cost profit or loss per completed trade.",
    "Net PnL": "Total after-cost profit or loss across the imported trades.",
    "Win Rate": "Percentage of imported trades that closed profitably.",
    "R-Multiple": "Average realized reward-to-risk when planned risk or stop data is available.",
    "Key Performance Trend": "Trade-by-trade net PnL path for the imported report.",
    "Primary Diagnosis": "The highest-priority issue EdgeTrace found in the report.",
    "Priority Insights": "The most important items to inspect before changing the strategy.",
    "EdgeTrace Benchmarks": "How this report compares against eligible aggregate report cohorts.",
    "Pro Intelligence Workspace": "Local coaching, simulation, score, review, and regression tools for this report.",
    "What Changed vs Prior Report": "Key report metrics compared with the prior selected report when available.",
    "Top Actions (Next Steps)": "Suggested review actions ordered by expected impact.",
    "Context at a Glance": "Supporting metadata and data-quality context for this report.",
    "Report Snapshot": "Short written summary of the report diagnosis.",
    "All Insights": "Full list of insights generated for this report."
  };

  return descriptions[title] ?? `More context about ${title}.`;
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

function GuidedReportWalkthrough({
  step,
  stepIndex,
  stepCount,
  onBack,
  onClose,
  onNext
}: {
  step: GuidedReportStep;
  stepIndex: number;
  stepCount: number;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
}) {
  const isFinalStep = stepIndex === stepCount - 1;
  const progress = `${((stepIndex + 1) / stepCount) * 100}%`;

  return (
    <div className="EdgeTrace-walkthrough-overlay" role="presentation">
      <section
        className="EdgeTrace-walkthrough-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-walkthrough-title"
      >
        <button className="EdgeTrace-walkthrough-close" onClick={onClose} aria-label="Close walkthrough">
          <X size={18} aria-hidden="true" />
        </button>

        <div className="EdgeTrace-walkthrough-top">
          <div className="EdgeTrace-walkthrough-icon" aria-hidden="true">
            <BookOpen size={22} />
          </div>
          <div>
            <p>{step.eyebrow} {stepIndex + 1} / {stepCount}</p>
            <h2 id="dashboard-walkthrough-title">{step.title}</h2>
          </div>
        </div>

        <p className="EdgeTrace-walkthrough-body">{step.body}</p>

        {step.metrics?.length ? (
          <div className="EdgeTrace-walkthrough-metrics">
            {step.metrics.map((metric) => (
              <div key={`${step.id}-${metric.label}`} className={`tone-${metric.tone ?? "white"}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {step.details?.length ? (
          <ul className="EdgeTrace-walkthrough-details">
            {step.details.map((detail) => (
              <li key={`${step.id}-${detail}`}>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="EdgeTrace-walkthrough-footer">
          <div className="EdgeTrace-walkthrough-progress" aria-hidden="true">
            <span style={{ width: progress }} />
          </div>
          <div className="EdgeTrace-walkthrough-actions">
            <button className="EdgeTrace-walkthrough-back" onClick={onBack} disabled={stepIndex === 0}>
              <ChevronLeft size={16} aria-hidden="true" />
              Back
            </button>
            <button className="EdgeTrace-walkthrough-next" onClick={onNext}>
              {isFinalStep ? <CheckCircle2 size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
              {isFinalStep ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function buildGuidedReportSteps({
  result,
  intelligence,
  normalizedTradeCount,
  costsIncluded,
  rValuesAvailable,
  reconstructionUsed,
  largestLeak,
  strongestSegment,
  primaryInspection,
  priorityInsights,
  actionItems
}: {
  result: DiagnosticsResult;
  intelligence: ReturnType<typeof buildReportIntelligence>;
  normalizedTradeCount: number;
  costsIncluded: boolean;
  rValuesAvailable: boolean;
  reconstructionUsed: boolean;
  largestLeak: BreakdownRow | undefined;
  strongestSegment: BreakdownRow | undefined;
  primaryInspection: ReturnType<typeof buildReportIntelligence>["nextBestInspections"][number] | undefined;
  priorityInsights: Array<{ label: string; title: string; detail: string; tone: "red" | "yellow" | "gray" | "green" }>;
  actionItems: Array<{ title: string; impact: string; tone: "red" | "yellow" | "green" | "gray" }>;
}): GuidedReportStep[] {
  const provenance = result.importProvenance;
  const source = provenance?.brokerDisplayName ?? provenance?.selectedSource ?? provenance?.detectedSource ?? "Uploaded CSV";
  const importedAt = formatGuideDate(provenance?.importedAt ?? result.createdAt);
  const warningCount = provenance?.warningCount ?? provenance?.warnings?.length ?? 0;
  const firstWarning = provenance?.warnings?.[0];
  const topInsight = priorityInsights[0];
  const firstAction = actionItems[0];

  return [
    {
      id: "import",
      eyebrow: "Imported data",
      title: "First, confirm what EdgeTrace read.",
      body: `This walkthrough starts from ${provenance?.originalFilename ?? "the imported file"} and explains the report in the same order a reviewer would read it.`,
      metrics: [
        { label: "Source", value: source, tone: "blue" },
        { label: "Trades read", value: number.format(normalizedTradeCount), tone: normalizedTradeCount > 0 ? "green" : "yellow" },
        { label: "Data quality", value: provenance?.confidenceLabel ?? (warningCount ? "Review" : "Ready"), tone: warningCount ? "yellow" : "green" },
        { label: "Imported", value: importedAt ?? "Unknown", tone: "gray" }
      ],
      details: compactDetails([
        provenance?.excludedRowCount ? `${number.format(provenance.excludedRowCount)} source rows were excluded before diagnostics.` : undefined,
        warningCount ? `${number.format(warningCount)} import warning${warningCount === 1 ? "" : "s"} should be reviewed.` : "No import warnings are blocking this read.",
        firstWarning ? `First warning: ${firstWarning}` : undefined
      ])
    },
    {
      id: "verdict",
      eyebrow: "Main read",
      title: `The headline is ${humanDiagnosis(intelligence.primaryDiagnosis)}.`,
      body: intelligence.primaryExplanation,
      metrics: [
        { label: "Health score", value: `${intelligence.strategyHealthScore}/100`, tone: guideToneForScore(intelligence.strategyHealthScore) },
        { label: "Band", value: intelligence.healthBand, tone: guideToneForScore(intelligence.strategyHealthScore) },
        { label: "Primary leak", value: intelligence.primaryLeak.title.replace("Primary Leak: ", ""), tone: intelligence.primaryDiagnosis === "Healthy" ? "green" : "red" }
      ],
      details: compactDetails([
        intelligence.primaryLeak.explanation,
        `Inspection path: ${intelligence.primaryLeak.recommendedInspection}`
      ])
    },
    {
      id: "performance",
      eyebrow: "Money",
      title: "Now translate the report into dollars.",
      body: `Net PnL is the number that matters after costs. Gross PnL tells you what the strategy produced before friction; the gap between the two is execution drag.`,
      metrics: [
        { label: "Gross PnL", value: currency.format(result.metrics.grossPnl), tone: result.metrics.grossPnl >= 0 ? "green" : "red" },
        { label: "Net PnL", value: currency.format(result.metrics.netPnl), tone: result.metrics.netPnl >= 0 ? "green" : "red" },
        { label: "Total costs", value: currency.format(result.metrics.totalCosts), tone: result.metrics.totalCosts > 0 ? "yellow" : "gray" },
        { label: "Profit factor", value: formatProfitFactor(result.metrics.profitFactor), tone: result.metrics.profitFactor >= 1 ? "green" : "red" }
      ],
      details: compactDetails([
        `Expectancy is ${currency.format(result.metrics.expectancy)} per trade after costs.`,
        `Gross expectancy is ${currency.format(result.metrics.grossExpectancy)}, before commission, fees, and estimated costs.`,
        intelligence.costDragLabel ? `Cost drag is classified as ${intelligence.costDragLabel}.` : undefined
      ])
    },
    {
      id: "quality",
      eyebrow: "Trade quality",
      title: "Next, check whether the individual trades are healthy.",
      body: "This step separates a strategy that wins enough often from one that wins enough size. Win rate, average win, average loss, and R-multiple need to make sense together.",
      metrics: [
        { label: "Win rate", value: percent.format(result.metrics.winRate), tone: statusTone(intelligence.keyMetricStatuses.winRate) },
        { label: "Average win", value: currency.format(result.metrics.averageWin), tone: "green" },
        { label: "Average loss", value: currency.format(result.metrics.averageLoss), tone: "red" },
        {
          label: "Average R",
          value: result.metrics.averageRealizedR !== undefined ? `${number.format(result.metrics.averageRealizedR)}R` : "Unavailable",
          tone: statusTone(intelligence.keyMetricStatuses.averageR)
        }
      ],
      details: compactDetails([
        winRateCopy(result.metrics.winRate),
        profitFactorCopy(result.metrics.profitFactor) === "Weak" ? "Profit factor is below 1, so losses outweigh winners." : `Profit factor is ${profitFactorCopy(result.metrics.profitFactor).toLowerCase()}.`,
        rMultipleCopy(result.metrics.averageRealizedR)
      ])
    },
    {
      id: "data-context",
      eyebrow: "Data context",
      title: "Then check what the data can and cannot prove.",
      body: "Some conclusions are stronger when the import includes costs, R-multiple data, and clean trade reconstruction. Missing inputs do not break the dashboard, but they change how much confidence to put in the read.",
      metrics: [
        { label: "Costs", value: costsIncluded ? "Included" : "Missing", tone: costsIncluded ? "green" : "yellow" },
        { label: "R data", value: rValuesAvailable ? "Available" : "Limited", tone: rValuesAvailable ? "green" : "yellow" },
        { label: "Reconstruction", value: reconstructionUsed ? "Used" : "Not used", tone: reconstructionUsed ? "blue" : "gray" },
        { label: "Warnings", value: number.format(warningCount), tone: warningCount ? "yellow" : "green" }
      ],
      details: compactDetails([
        costsIncluded ? "Net performance includes detected costs." : "Net performance may be overstated because cost data was not detected.",
        rValuesAvailable ? "R-based quality checks are available." : "R analysis is limited because stop or risk data was not available.",
        reconstructionUsed ? "Some trades were reconstructed from execution records, so the audit view can explain lineage." : undefined
      ])
    },
    {
      id: "segments",
      eyebrow: "Where to look",
      title: primaryInspection ? `The first place to inspect is ${primaryInspection.group}.` : "Now look for the weakest segment.",
      body: "The dashboard is not asking you to scan every table first. It points you to the segment most likely to explain the leak.",
      metrics: [
        { label: "Recommended", value: primaryInspection?.group ?? "Review breakdowns", tone: primaryInspection ? "blue" : "gray" },
        { label: "Reason", value: primaryInspection?.reason ?? "No dominant segment", tone: "gray" },
        { label: "Metric", value: primaryInspection?.metric ?? "N/A", tone: primaryInspection?.metric?.startsWith("-") ? "red" : "yellow" }
      ],
      details: compactDetails([
        largestLeak ? `Largest leak in the visible breakdown: ${largestLeak.group} at ${currency.format(largestLeak.netPnl)} net PnL.` : undefined,
        strongestSegment ? `Strongest segment: ${strongestSegment.group} at ${currency.format(strongestSegment.netPnl)} net PnL.` : undefined,
        "Use the Breakdown tab when you want the exact rows behind this signal."
      ])
    },
    {
      id: "actions",
      eyebrow: "Action list",
      title: firstAction ? `Start with: ${firstAction.title}.` : "Turn the read into a next action.",
      body: "After the report has been spoon-fed, the useful move is to act on the smallest set of issues that can change expectancy.",
      metrics: [
        { label: "Top priority", value: firstAction?.title ?? "Review report", tone: firstAction?.tone ?? "gray" },
        { label: "Impact", value: firstAction?.impact ?? "Unknown", tone: firstAction?.tone ?? "gray" },
        { label: "Top insight", value: topInsight?.title ?? "No extra insight", tone: topInsight?.tone ?? "gray" }
      ],
      details: compactDetails([
        topInsight ? topInsight.detail : undefined,
        actionItems[1] ? `Second action: ${actionItems[1].title}.` : undefined,
        actionItems[2] ? `Third action: ${actionItems[2].title}.` : undefined
      ])
    },
    {
      id: "handoff",
      eyebrow: "Full dashboard",
      title: "That is the guided read. The dashboard is still here for the full picture.",
      body: "Use the dashboard after this point to explore freely: Overview for the summary, Breakdown for attribution, and Trades for row-level evidence.",
      metrics: [
        { label: "Overview", value: "Narrative", tone: "blue" },
        { label: "Breakdown", value: "Attribution", tone: "yellow" },
        { label: "Trades", value: "Evidence", tone: "green" }
      ],
      details: compactDetails([
        "The walkthrough gives the initial interpretation.",
        "The dashboard keeps every metric and table available once you want to inspect the source data yourself.",
        "Open Compare or Strategy Sets after you have multiple reports for the same strategy."
      ])
    }
  ];
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
  const borderClass = tone === "accent" ? "border-cyan/50" : "border-loss/50";
  const hoverClass = row ? (tone === "accent" ? "hover:border-cyan" : "hover:border-loss") : "";
  return (
    <button
      className={`rounded-lg border bg-panel p-5 text-left ${borderClass} ${hoverClass}`}
      disabled={!row}
      onClick={() => row && onSelect?.(row)}
    >
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{title}</p>
      {row ? (
        <>
          <p className="mt-3 text-xl font-semibold">{row.group}</p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <MetricMini label="Net PnL" value={currency.format(row.netPnl)} tone={row.netPnl >= 0 ? "green" : "red"} />
            <MetricMini label="Expectancy" value={currency.format(row.expectancy)} tone={row.expectancy >= 0 ? "green" : "red"} />
            <MetricMini label="Cost Drag" value={row.costDrag.label} tone="white" />
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">No segment data available.</p>
      )}
    </button>
  );
}

function MetricMini({ label, value, tone = "white" }: { label: string; value: string; tone?: "red" | "green" | "yellow" | "white" }) {
  return (
    <div className={`EdgeTrace-metric-mini tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function buildEquityCurve(trades: NormalizedTrade[]) {
  let equity = 0;
  return trades.map((trade, index) => {
    equity += trade.netPnl;
    return { trade: index + 1, equity };
  });
}

function buildSignedEquityCurve(points: EquityCurvePoint[]): SignedEquityCurvePoint[] {
  const signedPoints: SignedEquityCurvePoint[] = [];

  points.forEach((point, index) => {
    const previous = points[index - 1];
    const crossesZero =
      previous &&
      previous.equity !== point.equity &&
      ((previous.equity < 0 && point.equity >= 0) || (previous.equity >= 0 && point.equity < 0));

    if (crossesZero) {
      const progressToZero = (0 - previous.equity) / (point.equity - previous.equity);
      signedPoints.push({
        trade: previous.trade + (point.trade - previous.trade) * progressToZero,
        equity: 0,
        positiveEquity: 0,
        negativeEquity: 0
      });
    }

    signedPoints.push({
      ...point,
      positiveEquity: point.equity >= 0 ? point.equity : null,
      negativeEquity: point.equity < 0 ? point.equity : null
    });
  });

  return signedPoints;
}

function buildImpactBreakdown(metrics: DiagnosticsResult["metrics"], largestLeak: BreakdownRow | undefined) {
  const transactionCosts = Math.max(0, Math.abs(metrics.totalCosts));
  const tradeQuality = Math.max(0, Math.abs(Math.min(metrics.expectancy, 0) * Math.max(1, metrics.totalTrades)));
  const segmentLoss = Math.max(0, Math.abs(Math.min(largestLeak?.netPnl ?? 0, 0)) * 0.25);
  const baseline = transactionCosts + tradeQuality + segmentLoss || 1;
  const items = [
    { label: "Transaction Costs", value: transactionCosts || baseline * 0.55, color: "#ff485c" },
    { label: "R:R / Trade Quality", value: tradeQuality || baseline * 0.32, color: "#ffbd45" },
    { label: "Other Factors", value: segmentLoss || baseline * 0.13, color: "#9aa7b5" }
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  return items.map((item) => ({ ...item, percent: (item.value / total) * 100 }));
}

function buildPriorityInsights(
  result: DiagnosticsResult,
  intelligence: ReturnType<typeof buildReportIntelligence>,
  largestLeak: BreakdownRow | undefined,
  primaryInspection: ReturnType<typeof buildReportIntelligence>["nextBestInspections"][number] | undefined
): Array<{ label: string; title: string; detail: string; tone: "red" | "yellow" | "gray" | "green" }> {
  const averageRTitle =
    result.metrics.averageRealizedR === undefined
      ? "R Data Unavailable"
      : result.metrics.averageRealizedR >= 1
        ? "Strong R Capture"
        : result.metrics.averageRealizedR >= 0.5
          ? "Acceptable R Capture"
          : "Weak R Capture";
  const base = [
    {
      label: "1",
      title: "Transaction Costs",
      detail: intelligence.primaryLeak.supportingMetric,
      tone: intelligence.keyMetricStatuses.costDrag === "weak" ? "red" : "yellow"
    },
    {
      label: "2",
      title: averageRTitle,
      detail: result.metrics.averageRealizedR !== undefined ? `Average R is ${number.format(result.metrics.averageRealizedR)}R` : "R-multiple data unavailable",
      tone: intelligence.keyMetricStatuses.averageR === "healthy" ? "green" : "yellow"
    },
    {
      label: "3",
      title: result.metrics.winRate < 0.5 ? "Low Win Rate" : "Win Rate Quality",
      detail: `Win rate is ${percent.format(result.metrics.winRate)}`,
      tone: intelligence.keyMetricStatuses.winRate === "healthy" ? "green" : "yellow"
    },
    {
      label: "4",
      title: largestLeak ? `${largestLeak.group} Setup Quality` : "Setup Quality",
      detail: primaryInspection?.reason ?? "Review segment consistency across losing trades",
      tone: "gray"
    }
  ] satisfies Array<{ label: string; title: string; detail: string; tone: "red" | "yellow" | "gray" | "green" }>;

  const reportInsights: Array<{ label: string; title: string; detail: string; tone: "red" | "yellow" | "gray" }> =
    (result.insights ?? []).slice(0, 2).map((insight, index) => ({
    label: String(index + 1),
    title: insight.title,
    detail: insight.message,
    tone: insight.severity === "critical" ? "red" : insight.severity === "warning" ? "yellow" : "gray"
  }));

  return [...reportInsights, ...base].slice(0, 4);
}

function buildActionItems(
  intelligence: ReturnType<typeof buildReportIntelligence>,
  primaryInspection: ReturnType<typeof buildReportIntelligence>["nextBestInspections"][number] | undefined,
  largestLeak: BreakdownRow | undefined,
  metrics: DiagnosticsResult["metrics"]
) {
  return [
    {
      title: intelligence.primaryDiagnosis === "Cost Drag Problem" ? "Reduce Cost Drag" : "Review Primary Leak",
      impact: "High Impact",
      tone: intelligence.strategyHealthScore >= 60 ? "yellow" : "red"
    },
    {
      title: metrics.averageRealizedR !== undefined && metrics.averageRealizedR < 0.5 ? "Improve R:R" : "Improve Expectancy",
      impact: "High Impact",
      tone: "red"
    },
    {
      title: primaryInspection ? primaryInspection.title.replace("Inspect ", "Filter ") : "Filter Weak Setups",
      impact: "Medium Impact",
      tone: "yellow"
    },
    {
      title: largestLeak ? `Review ${largestLeak.group}` : "Review Losses",
      impact: "Medium Impact",
      tone: "yellow"
    },
    {
      title: "Build Consistency",
      impact: "Long Term",
      tone: "green"
    }
  ] satisfies Array<{ title: string; impact: string; tone: "red" | "yellow" | "green" | "gray" }>;
}

function buildLocalCoachAnswers({
  result,
  intelligence,
  primaryInspection,
  largestLeak,
  strongestSegment,
  actionItems,
  priorityInsights,
  edgeScore
}: {
  result: DiagnosticsResult;
  intelligence: ReturnType<typeof buildReportIntelligence>;
  primaryInspection: ReturnType<typeof buildReportIntelligence>["nextBestInspections"][number] | undefined;
  largestLeak: BreakdownRow | undefined;
  strongestSegment: BreakdownRow | undefined;
  actionItems: Array<{ title: string; impact: string; tone: "red" | "yellow" | "green" | "gray" }>;
  priorityInsights: Array<{ label: string; title: string; detail: string; tone: "red" | "yellow" | "gray" | "green" }>;
  edgeScore: EdgeScoreOutput;
}): Record<ProQuestionId, LocalCoachAnswer> {
  const firstAction = actionItems[0]?.title ?? "Review Primary Leak";
  const secondAction = actionItems[1]?.title ?? "Improve Expectancy";
  const topInsight = priorityInsights[0];
  const inspectionTarget = primaryInspection ? `${primaryInspection.group} (${breakdownLabels[primaryInspection.dimension]})` : "the weakest visible segment";

  return {
    "fix-first": {
      label: "Fix first",
      title: `Start with ${firstAction.toLowerCase()}.`,
      body: intelligence.primaryLeak.explanation,
      bullets: compactDetails([
        `Open ${inspectionTarget} before scanning every table.`,
        largestLeak ? `${largestLeak.group} is currently the largest visible leak at ${currency.format(largestLeak.netPnl)} net PnL.` : undefined,
        `Second move: ${secondAction}.`
      ])
    },
    "explain-report": {
      label: "Explain result",
      title: `${humanDiagnosis(intelligence.primaryDiagnosis)} with an Edge Score of ${edgeScore.score}.`,
      body: `This report has ${number.format(result.metrics.totalTrades)} trades, ${percent.format(result.metrics.winRate)} win rate, and ${currency.format(result.metrics.expectancy)} after-cost expectancy.`,
      bullets: compactDetails([
        `Net PnL is ${currency.format(result.metrics.netPnl)} after ${currency.format(result.metrics.totalCosts)} of detected costs.`,
        `Profit factor reads ${profitFactorCopy(result.metrics.profitFactor).toLowerCase()}.`,
        strongestSegment ? `${strongestSegment.group} is the strongest visible segment at ${currency.format(strongestSegment.netPnl)} net PnL.` : undefined
      ])
    },
    "next-risk": {
      label: "Next risk",
      title: topInsight ? topInsight.title : "Monitor the first weak metric that changes next.",
      body: topInsight?.detail ?? "The current report does not show a single dominant extra risk beyond the primary diagnosis.",
      bullets: compactDetails([
        `Primary monitoring metric: ${intelligence.primaryLeak.supportingMetric}.`,
        primaryInspection ? `If the next report worsens, compare this report against ${primaryInspection.group}.` : undefined,
        "Keep the next import attached to the same strategy set so regression watch has history to compare."
      ])
    }
  };
}

function answerLocalCoachQuestion(
  question: string,
  {
    answers,
    metrics,
    edgeScore,
    regressionWatch,
    reviewAgenda
  }: {
    answers: Record<ProQuestionId, LocalCoachAnswer>;
    metrics: DiagnosticsResult["metrics"];
    edgeScore: EdgeScoreOutput;
    regressionWatch: RegressionWatchItem[];
    reviewAgenda: DashboardReviewAgenda;
  }
): LocalCoachAnswer {
  const normalized = question.toLowerCase();
  const costDragPct = metrics.grossPnl > 0 ? metrics.totalCosts / metrics.grossPnl : undefined;
  const weakestFactor = [...edgeScore.factors].sort((a, b) => a.value - b.value)[0];
  const firstWatch = regressionWatch.find((item) => item.severity !== "clear") ?? regressionWatch[0];

  if (/(cost|commission|fee|slippage|friction|spread)/.test(normalized)) {
    return {
      label: "Costs",
      title: costDragPct !== undefined && costDragPct > 0.3 ? "Costs are large enough to change the read." : "Cost drag is a monitoring variable.",
      body:
        costDragPct !== undefined
          ? `Detected costs are ${percent.format(costDragPct)} of gross PnL. The practical question is whether the next report lowers that percentage without reducing trade quality.`
          : "This report does not have enough gross-profit context to calculate cost drag cleanly.",
      bullets: compactDetails([
        `Current detected costs: ${currency.format(metrics.totalCosts)}.`,
        costDragPct !== undefined ? `Target next report: keep cost drag below ${percent.format(Math.max(0.18, costDragPct - 0.05))}.` : undefined,
        "Use the What-If Simulator cost control to estimate the PnL impact before changing execution rules."
      ])
    };
  }

  if (/(win|hit rate|accuracy|percent|%)/.test(normalized)) {
    const targetWinRate = Math.min(0.95, metrics.winRate + 0.05);
    const projected = projectWhatIf(metrics, 0, targetWinRate * 100, 0);
    return {
      label: "Win rate",
      title: `A ${percent.format(targetWinRate)} win-rate target changes PnL by ${currency.format(projected.winRateImpact)}.`,
      body: "Win rate only matters if payoff quality holds. The simulator keeps the current average win/loss profile and changes the number of winners.",
      bullets: [
        `Current win rate: ${percent.format(metrics.winRate)}.`,
        `Five percentage points higher projects net PnL at ${currency.format(projected.projectedNetPnl)}.`,
        "If payoff quality drops while hit rate improves, the report can still regress."
      ]
    };
  }

  if (/(r\b|r-|reward|payoff|average win|average loss|loss)/.test(normalized)) {
    return {
      label: "R capture",
      title: metrics.averageRealizedR === undefined ? "R capture is unavailable in this import." : `Average R is ${number.format(metrics.averageRealizedR)}R.`,
      body:
        metrics.averageRealizedR === undefined
          ? "Ask EdgeTrace cannot judge planned-risk conversion without stop/risk inputs. Use average win/loss and segment losses as substitutes."
          : "R capture is the fastest way to separate a strategy that wins often from one that wins enough size.",
      bullets: compactDetails([
        metrics.averageRealizedR !== undefined && metrics.averageRealizedR < 0.5 ? "Target the next report above 0.50R before increasing size." : undefined,
        `Average win: ${currency.format(metrics.averageWin)}. Average loss: ${currency.format(metrics.averageLoss)}.`,
        "Use the R-capture simulator input to test whether holding winners longer changes expectancy enough to matter."
      ])
    };
  }

  if (/(edge score|score|grade|rating)/.test(normalized)) {
    return {
      label: "Edge Score",
      title: weakestFactor ? `${weakestFactor.label} is holding the Edge Score down.` : `Edge Score is ${edgeScore.score}.`,
      body: "Edge Score is useful only as a to-do list. The factor bars show which dimension has the best chance to move the score next.",
      bullets: compactDetails([
        weakestFactor?.nextStep,
        `Current band: ${edgeScore.band}.`,
        "Treat the score as secondary to expectancy; do not optimize the score if after-cost expectancy gets worse."
      ])
    };
  }

  if (/(regression|watch|risk|worse|break|fail)/.test(normalized)) {
    return {
      label: "Risk",
      title: firstWatch ? firstWatch.title : "No regression watch item is active.",
      body: firstWatch?.detail ?? "The current report does not show a dominant regression trigger.",
      bullets: [
        "Use Regression Watch as the pass/fail list for the next import.",
        reviewAgenda.checks[0] ? `${reviewAgenda.checks[0].label}: ${reviewAgenda.checks[0].target}.` : "Compare the next report against this baseline.",
        "If two watch items worsen at the same time, inspect before changing more variables."
      ]
    };
  }

  if (/(size|position|scale|increase size|bigger)/.test(normalized)) {
    return {
      label: "Sizing",
      title: metrics.expectancy > 0 && edgeScore.score >= 70 ? "Sizing can be considered, but only after the next confirmation report." : "Do not size up from this report alone.",
      body: "Sizing should follow repeatability. This report needs the next import to confirm the same expectancy and risk profile before size increases.",
      bullets: [
        `Current expectancy: ${currency.format(metrics.expectancy)} per trade.`,
        `Current Edge Score: ${edgeScore.score} (${edgeScore.band}).`,
        "Use the weekly review checks as the gate before adding risk."
      ]
    };
  }

  if (/(next|do|fix|first|action|priority)/.test(normalized)) {
    return answers["fix-first"];
  }

  return {
    label: "Local answer",
    title: "I can answer this locally if it maps to report metrics.",
    body: "Try asking about costs, win rate, R capture, Edge Score, regression risk, sizing, or the next action. This local coach does not call an external AI model.",
    bullets: [
      `Current primary read: ${answers["explain-report"].title}`,
      `Most useful next prompt: ${weakestFactor ? `How do I improve ${weakestFactor.label.toLowerCase()}?` : "What should I fix first?"}`,
      "For open-ended strategy questions, add more reports to a strategy set so the local logic has history to compare."
    ]
  };
}

function buildEdgeScore({
  metrics,
  normalizedTradeCount,
  costsIncluded,
  rValuesAvailable
}: {
  metrics: DiagnosticsResult["metrics"];
  normalizedTradeCount: number;
  costsIncluded: boolean;
  rValuesAvailable: boolean;
}): EdgeScoreOutput {
  const costDragPct = metrics.grossPnl > 0 ? metrics.totalCosts / metrics.grossPnl : undefined;
  const expectancyScore = metrics.expectancy > 0 ? 82 : metrics.expectancy > -2 ? 58 : metrics.expectancy > -8 ? 38 : 22;
  const frictionScore =
    costDragPct === undefined ? 62 : costDragPct <= 0.15 ? 92 : costDragPct <= 0.3 ? 72 : costDragPct <= 0.45 ? 48 : 24;
  const payoffScore =
    metrics.averageRealizedR === undefined
      ? 52
      : metrics.averageRealizedR >= 1
        ? 92
        : metrics.averageRealizedR >= 0.5
          ? 74
          : metrics.averageRealizedR >= 0.2
            ? 48
            : 24;
  const profitFactorScore = metrics.profitFactor >= 1.5 ? 92 : metrics.profitFactor >= 1 ? 72 : metrics.profitFactor >= 0.8 ? 46 : 24;
  const winRateScore = metrics.winRate >= 0.55 ? 88 : metrics.winRate >= 0.5 ? 74 : metrics.winRate >= 0.45 ? 52 : 30;
  const consistencyScore = Math.round(profitFactorScore * 0.62 + winRateScore * 0.38);
  let dataScore = normalizedTradeCount >= 100 ? 92 : normalizedTradeCount >= 50 ? 78 : normalizedTradeCount >= 20 ? 62 : 38;
  if (!costsIncluded) dataScore -= 10;
  if (!rValuesAvailable) dataScore -= 10;
  dataScore = clamp(dataScore, 0, 100);

  const factors: EdgeScoreFactor[] = [
    {
      label: "Expectancy",
      value: expectancyScore,
      detail: `${currency.format(metrics.expectancy)} per trade`,
      nextStep:
        metrics.expectancy < 0
          ? `Get after-cost expectancy above ${currency.format(0)} before adding size.`
          : `Keep next-report expectancy above ${currency.format(Math.max(0, metrics.expectancy * 0.85))}.`,
      tone: scoreTone(expectancyScore)
    },
    {
      label: "Friction",
      value: frictionScore,
      detail: costDragPct === undefined ? "Cost drag unavailable" : `${percent.format(costDragPct)} of gross PnL`,
      nextStep:
        costDragPct === undefined
          ? "Import commission/fee data so cost drag can be scored."
          : costDragPct > 0.2
            ? `Reduce cost drag toward ${percent.format(Math.max(0.15, costDragPct - 0.08))}.`
            : "Preserve the current execution cost profile.",
      tone: scoreTone(frictionScore)
    },
    {
      label: "Payoff Quality",
      value: payoffScore,
      detail: metrics.averageRealizedR === undefined ? "R data unavailable" : `${number.format(metrics.averageRealizedR)}R average capture`,
      nextStep:
        metrics.averageRealizedR === undefined
          ? "Add planned risk or stop data so R capture can be scored."
          : metrics.averageRealizedR < 0.5
            ? "Push average R above 0.50R in the next report."
            : "Keep R capture stable while improving selectivity.",
      tone: scoreTone(payoffScore)
    },
    {
      label: "Consistency",
      value: consistencyScore,
      detail: `${percent.format(metrics.winRate)} win rate, ${profitFactorCopy(metrics.profitFactor)} profit factor`,
      nextStep:
        metrics.profitFactor < 1
          ? "Lift profit factor above 1.00 by cutting low-quality losses first."
          : metrics.winRate < 0.5
            ? "Raise win rate above 50% without shrinking average win."
            : "Confirm the same win-rate/profit-factor mix in the next import.",
      tone: scoreTone(consistencyScore)
    },
    {
      label: "Data Confidence",
      value: dataScore,
      detail: `${number.format(normalizedTradeCount)} normalized trades`,
      nextStep:
        normalizedTradeCount < 50
          ? `Add ${number.format(50 - normalizedTradeCount)} more trades before trusting fine-grained conclusions.`
          : !costsIncluded || !rValuesAvailable
            ? "Improve import quality by including costs and planned-risk fields."
            : "Use strategy-set history to validate repeatability.",
      tone: scoreTone(dataScore)
    }
  ];
  const score = Math.round(
    expectancyScore * 0.3 + frictionScore * 0.2 + payoffScore * 0.22 + consistencyScore * 0.18 + dataScore * 0.1
  );
  const band = score >= 85 ? "Durable Edge" : score >= 70 ? "Tradable Edge" : score >= 55 ? "Watchlist Edge" : score >= 40 ? "Fragile Edge" : "No Clear Edge";
  const weakestFactor = [...factors].sort((a, b) => a.value - b.value)[0];

  return {
    score,
    band,
    summary: weakestFactor ? `Weakest factor: ${weakestFactor.label.toLowerCase()}.` : "Add more reports to improve confidence.",
    factors
  };
}

function buildDashboardRegressionWatch(
  metrics: DiagnosticsResult["metrics"],
  intelligence: ReturnType<typeof buildReportIntelligence>,
  largestLeak: BreakdownRow | undefined
): RegressionWatchItem[] {
  const items: RegressionWatchItem[] = [];
  const costDragPct = metrics.grossPnl > 0 ? metrics.totalCosts / metrics.grossPnl : undefined;

  if (metrics.expectancy < 0) {
    items.push({
      severity: "high",
      title: "Negative expectancy",
      detail: `${currency.format(metrics.expectancy)} per trade after costs needs review before the next import.`
    });
  }
  if (costDragPct !== undefined && costDragPct > 0.3) {
    items.push({
      severity: costDragPct > 0.45 ? "high" : "medium",
      title: "Cost drag risk",
      detail: `Costs are ${percent.format(costDragPct)} of gross PnL; watch whether the next report rises further.`
    });
  }
  if (metrics.averageRealizedR !== undefined && metrics.averageRealizedR < 0.5) {
    items.push({
      severity: metrics.averageRealizedR < 0.2 ? "high" : "medium",
      title: "R capture risk",
      detail: `Average R is ${number.format(metrics.averageRealizedR)}R; monitor payoff quality next.`
    });
  }
  if (metrics.winRate < 0.45) {
    items.push({
      severity: "medium",
      title: "Win-rate pressure",
      detail: `${percent.format(metrics.winRate)} win rate is below the break-even watch zone.`
    });
  }
  if (largestLeak && largestLeak.netPnl < 0) {
    items.push({
      severity: "low",
      title: `${largestLeak.group} leak`,
      detail: `${currency.format(largestLeak.netPnl)} net PnL is the first segment to compare against the next report.`
    });
  }

  if (!items.length) {
    items.push({
      severity: "clear",
      title: "No immediate regression trigger",
      detail: `${intelligence.healthBand} status is not showing a dominant one-report deterioration signal.`
    });
  }

  return items.slice(0, 4);
}

function buildDashboardReviewAgenda(
  result: DiagnosticsResult,
  intelligence: ReturnType<typeof buildReportIntelligence>,
  actionItems: Array<{ title: string; impact: string; tone: "red" | "yellow" | "green" | "gray" }>,
  regressionWatch: RegressionWatchItem[]
): DashboardReviewAgenda {
  const nextReviewDate = nextWeeklyReviewDate(result.createdAt);
  const firstRegression = regressionWatch.find((item) => item.severity !== "clear");
  const metrics = result.metrics;
  const costDragPct = metrics.grossPnl > 0 ? metrics.totalCosts / metrics.grossPnl : undefined;
  const targetExpectancy = metrics.expectancy < 0 ? 0 : Math.max(0, metrics.expectancy * 0.85);
  const targetCostDrag = costDragPct === undefined ? undefined : Math.max(0.15, costDragPct - 0.05);
  const targetR = metrics.averageRealizedR === undefined ? undefined : Math.max(0.5, metrics.averageRealizedR);

  return {
    label: "Weekly Review Agenda",
    title: `Next review theme: prove ${humanDiagnosis(intelligence.primaryDiagnosis).toLowerCase()} improved.`,
    summary: nextReviewDate
      ? `Use this report as the baseline for ${nextReviewDate}. The next report passes only if the leak improves without creating a new one.`
      : "Use this report as the baseline for the next review. The next report passes only if the leak improves without creating a new one.",
    items: compactDetails([
      actionItems[0] ? `Change one variable tied to ${actionItems[0].title.toLowerCase()}.` : undefined,
      firstRegression ? `Do not ignore ${firstRegression.title.toLowerCase()}; it is the first fail condition.` : "Preserve what is working; the fail condition is any new red watch item.",
      `Compare the next report against ${result.name ?? "this report"} before making another process change.`
    ]).slice(0, 3),
    checks: [
      {
        label: "Expectancy",
        current: `Now ${currency.format(metrics.expectancy)} / trade`,
        target: `Pass ${currency.format(targetExpectancy)} or better`
      },
      {
        label: "Cost drag",
        current: costDragPct === undefined ? "Now unavailable" : `Now ${percent.format(costDragPct)}`,
        target: targetCostDrag === undefined ? "Pass with detected cost data" : `Pass below ${percent.format(targetCostDrag)}`
      },
      {
        label: "R capture",
        current: metrics.averageRealizedR === undefined ? "Now unavailable" : `Now ${number.format(metrics.averageRealizedR)}R`,
        target: targetR === undefined ? "Pass with risk/R data" : `Pass at ${number.format(targetR)}R or better`
      }
    ]
  };
}

function projectWhatIf(
  metrics: DiagnosticsResult["metrics"],
  costReductionPct: number,
  winRateTargetPct: number,
  rCaptureLift: number
) {
  const tradeCount = Math.max(1, metrics.totalTrades);
  const averageWin = metrics.averageWin > 0 ? metrics.averageWin : Math.max(metrics.expectancy, 1);
  const averageLoss = metrics.averageLoss < 0 ? metrics.averageLoss : -Math.max(Math.abs(metrics.expectancy), averageWin * 0.7, 1);
  const currentWinRate = clamp(metrics.winRate, 0, 0.95);
  const targetWinRate = clamp(winRateTargetPct / 100, 0, 0.95);
  const currentWinningTrades = currentWinRate * tradeCount;
  const targetWinningTrades = targetWinRate * tradeCount;
  const costSavings = metrics.totalCosts * (costReductionPct / 100);
  const rCaptureImpact = targetWinningTrades * rCaptureLift * Math.abs(averageLoss);
  const winRateImpact = (targetWinningTrades - currentWinningTrades) * (averageWin - averageLoss);
  const modeledCurrentNetPnl = currentWinningTrades * averageWin + (tradeCount - currentWinningTrades) * averageLoss;
  const currentNetPnl = Number.isFinite(metrics.netPnl) ? metrics.netPnl : modeledCurrentNetPnl;
  const projectedNetPnl = currentNetPnl + costSavings + winRateImpact + rCaptureImpact;
  const projectedExpectancy = projectedNetPnl / tradeCount;
  const delta = projectedNetPnl - currentNetPnl;

  return {
    projectedNetPnl,
    projectedExpectancy,
    delta,
    costImpact: costSavings,
    winRateImpact,
    rCaptureImpact,
    summary:
      delta >= 0
        ? `Targeting ${percent.format(targetWinRate)} win rate adds ${currency.format(delta)} across the same ${number.format(tradeCount)} trades.`
        : `Targeting ${percent.format(targetWinRate)} win rate still trails the current report by ${currency.format(Math.abs(delta))}.`
  };
}

function scoreTone(score: number): EdgeScoreFactor["tone"] {
  if (score >= 70) return "green";
  if (score >= 50) return "yellow";
  if (score > 0) return "red";
  return "gray";
}

function nextWeeklyReviewDate(value: string | undefined) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) return undefined;
  const next = new Date(base);
  next.setDate(next.getDate() + 7);
  return next.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function compactDetails(values: Array<string | undefined | false>) {
  return values.filter((value): value is string => Boolean(value));
}

function overviewStatus(score: number, diagnosis: ReturnType<typeof buildReportIntelligence>["primaryDiagnosis"]) {
  if (diagnosis === "Insufficient Data") return "Needs Data";
  if (score >= 80) return hasMaterialOverviewRisk(diagnosis) ? "Strong But Uneven" : "On Track";
  if (score >= 60) return "Watchlist";
  return "Needs Attention";
}

function hasMaterialOverviewRisk(diagnosis: ReturnType<typeof buildReportIntelligence>["primaryDiagnosis"]) {
  return ["Negative Expectancy", "Cost Drag Problem", "Large Loss Problem", "Poor R Capture"].includes(diagnosis);
}

function overviewDetail(status: string) {
  if (status === "On Track") return "Core metrics are above target. Monitor listed watch items separately.";
  if (status === "Strong But Uneven") return "Most metrics are healthy, but large-loss exposure still needs review.";
  if (status === "Watchlist") return "A few metrics need monitoring before adding size.";
  if (status === "Needs Data") return "Import more complete trade, cost, or risk data.";
  return "Primary issues are dragging performance.";
}

function overviewTone(
  score: number,
  diagnosis: ReturnType<typeof buildReportIntelligence>["primaryDiagnosis"]
): "red" | "yellow" | "green" | "blue" | "gray" {
  const status = overviewStatus(score, diagnosis);
  if (status === "On Track") return "green";
  if (status === "Strong But Uneven") return "blue";
  if (status === "Watchlist") return "yellow";
  if (status === "Needs Data") return "gray";
  return "red";
}

function healthScoreTone(score: number): "red" | "yellow" | "green" | "blue" | "gray" {
  if (score >= 80) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

function healthScoreCopy(score: number) {
  if (score >= 80) return "Healthy score. At or above target.";
  if (score >= 60) return "Watchlist score. Monitor before adding size.";
  if (score >= 40) return "Unstable score. Review weak metrics before the next iteration.";
  return "High-risk score. Fix the primary leak before adding trades.";
}

function winRateCopy(winRate: number) {
  if (winRate >= 0.55) return "Above quality threshold";
  if (winRate >= 0.45) return "Near break-even threshold";
  return "Below break-even threshold";
}

function rMultipleCopy(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "R data unavailable";
  if (value >= 1) return "Strong R capture";
  if (value >= 0.5) return "Acceptable R capture";
  return "Weak R capture";
}

function profitFactorCopy(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Unavailable";
  if (value === Infinity || value >= NO_LOSS_PROFIT_FACTOR) return "No losses";
  if (value >= 1.5) return "Strong";
  if (value >= 1) return "Watch";
  return "Weak";
}

function statusTone(status: MetricStatus): "red" | "yellow" | "green" | "blue" | "gray" {
  if (status === "healthy") return "green";
  if (status === "warning") return "yellow";
  if (status === "weak") return "red";
  return "gray";
}

function guideToneForScore(score: number): GuideMetricTone {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  if (score >= 40) return "yellow";
  return "red";
}

function humanDiagnosis(diagnosis: ReturnType<typeof buildReportIntelligence>["primaryDiagnosis"]) {
  if (diagnosis === "Cost Drag Problem") return "High Cost Drag";
  if (diagnosis === "Negative Expectancy") return "Negative Expectancy";
  if (diagnosis === "Poor R Capture") return "Poor R Capture";
  if (diagnosis === "Large Loss Problem") return "Loss Concentration";
  if (diagnosis === "Insufficient Data") return "Insufficient Data";
  return diagnosis;
}

function diagnosisToneClass(diagnosis: ReturnType<typeof buildReportIntelligence>["primaryDiagnosis"]) {
  if (diagnosis === "Healthy") return "text-green-300";
  if (diagnosis === "Watchlist" || diagnosis === "Insufficient Data") return "text-warning";
  return "text-loss";
}

function diagnosisConfidence(score: number) {
  if (score < 40) return "High";
  if (score < 70) return "Medium";
  return "Stable";
}

function inferRegime(metrics: DiagnosticsResult["metrics"]) {
  if (metrics.profitFactor >= 1.5 && metrics.winRate >= 0.5) return "Favorable";
  if (metrics.profitFactor < 1 || metrics.expectancy < 0) return "Choppy / Range";
  return "Mixed";
}

function estimateTradeFrequency(trades: NormalizedTrade[]) {
  const dates = trades
    .map((trade) => Date.parse(trade.entryTime))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (dates.length < 2) return undefined;
  const days = Math.max(1, Math.ceil((dates[dates.length - 1] - dates[0]) / 86_400_000));
  return number.format(trades.length / days);
}

function scoreClass(score: number) {
  if (score >= 80) return "text-cyan";
  if (score >= 40) return "text-warning";
  return "text-loss";
}

function metricStatusClass(status: MetricStatus) {
  if (status === "healthy") return "border-cyan/50";
  if (status === "warning") return "border-warning/60";
  if (status === "weak") return "border-loss/60";
  return "border-line";
}

function metricValueClass(status: MetricStatus) {
  if (status === "healthy") return "text-cyan";
  if (status === "warning") return "text-warning";
  if (status === "weak") return "text-loss";
  return "text-muted";
}

function numericValueClass(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "text-muted";
  return value >= 0 ? "text-cyan" : "text-loss";
}

function costDragValueClass(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "text-muted";
  if (value > 0.4) return "text-loss";
  if (value > 0.2) return "text-warning";
  return "text-cyan";
}

function formatBenchmarkValue(value: number | undefined, unit: AggregateBenchmarkMetric["unit"]) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  if (unit === "currency") return currency.format(value);
  if (unit === "percent") return percent.format(value);
  if (unit === "rMultiple") return `${number.format(value)}R`;
  return number.format(value);
}

function openBenchmarkPricing() {
  trackEvent("plan_feature_cta_clicked", { feature: "aggregate_benchmarks", requiredPlan: "pro" });
  window.history.pushState(null, "", "/pricing");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatNumber(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  return number.format(value);
}

function formatProfitFactor(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  if (value === Infinity || value >= NO_LOSS_PROFIT_FACTOR) return "No losses";
  if (!Number.isFinite(value)) return "N/A";
  return number.format(value);
}

function formatGuideDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  return percent.format(value);
}

function formatAxisCurrency(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return "";
  if (Math.abs(numericValue) >= 1000) return `$${number.format(numericValue / 1000)}K`;
  return currency.format(numericValue);
}

function formatTooltipCurrency(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return String(value ?? "N/A");
  return currency.format(numericValue);
}

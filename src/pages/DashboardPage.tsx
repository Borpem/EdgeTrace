import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Info,
  Menu,
  Lock,
  TrendingDown,
  TrendingUp,
  X
} from "lucide-react";
import { AddToStrategySetDialog } from "../components/AddToStrategySetDialog";
import { PaywallGate } from "../components/PaywallGate";
import { ProFeaturePrompt } from "../components/ProFeaturePrompt";
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
import {
  buildProFeaturePrompt,
  type ProFeaturePromptInput,
  type ProFeaturePromptState
} from "../lib/proFeaturePrompts";
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

function formatOrdinal(value: number) {
  const rounded = Math.round(value);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number.format(rounded)}th`;
  const suffix = rounded % 10 === 1 ? "st" : rounded % 10 === 2 ? "nd" : rounded % 10 === 3 ? "rd" : "th";
  return `${number.format(rounded)}${suffix}`;
}

type SortKey = keyof Pick<NormalizedTrade, "symbol" | "side" | "entryTime" | "grossPnl" | "netPnl" | "realizedR">;
type BreakdownSortKey =
  | "totalTrades"
  | "winRate"
  | "netPnl"
  | "expectancy"
  | "averageRealizedR"
  | "costDragPct";
type DashboardTab = "overview" | "breakdown" | "trades";
type DashboardDisclosureId = "diagnosis" | "insights" | "nextSteps" | "details";
type GuideMetricTone = "red" | "yellow" | "green" | "blue" | "gray" | "white";
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
type EquityCurvePoint = { trade: number; equity: number };
type SignedEquityCurvePoint = EquityCurvePoint & {
  positiveEquity: number | null;
  negativeEquity: number | null;
};
type ReviewLoopTone = "red" | "yellow" | "green" | "blue" | "gray";
type ReviewLoopItem = {
  label: string;
  title: string;
  detail: string;
  tone: ReviewLoopTone;
};
type ReviewBenchmarkTile = {
  label: string;
  value: string;
  detail: string;
  percentile?: number;
  tone: ReviewLoopTone;
};
type ReviewLoopOutput = {
  statusTitle: string;
  statusDetail: string;
  statusTone: ReviewLoopTone;
  issueCount: number;
  reviewVerdict: string;
  reviewSummary: string;
  comparisonSummary: string;
  alerts: ReviewLoopItem[];
  benchmarkTiles: ReviewBenchmarkTile[];
  checklist: ReviewLoopItem[];
};
type MistakeHeatmapCell = {
  id: string;
  weekday: string;
  bucket: string;
  score: number;
  trades: number;
  losingTrades: number;
  winningTrades: number;
  loss: number;
  gain: number;
  costs: number;
  level: number;
};
type HeatmapSummary = {
  trades: number;
  losingTrades: number;
  winningTrades: number;
  loss: number;
  gain: number;
  costs: number;
};
type MistakeHeatmapRank = {
  label: string;
  value: number;
  detail: string;
  level: number;
};
type MistakeHeatmapOutput = {
  cells: MistakeHeatmapCell[];
  edgeCells: MistakeHeatmapCell[];
  peakLabel: string;
  peakDetail: string;
  edgePeakLabel: string;
  edgePeakDetail: string;
  totalMistakeCost: number;
  totalEdgeValue: number;
  mistakeTrades: number;
  edgeTrades: number;
  mistakeRate: number;
  edgeRate: number;
  averageMistakeLoss: number;
  averageEdgeWin: number;
  costDrag: number;
  activeCells: number;
  activeEdgeCells: number;
  topClusters: MistakeHeatmapRank[];
  topSymbols: MistakeHeatmapRank[];
  topSessions: MistakeHeatmapRank[];
  topEdgeClusters: MistakeHeatmapRank[];
  topEdgeSymbols: MistakeHeatmapRank[];
  topEdgeSessions: MistakeHeatmapRank[];
};

const dashboardDisclosureIds: DashboardDisclosureId[] = ["diagnosis", "insights", "nextSteps", "details"];

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
  onFeedback?: () => void;
  accountControl?: ReactNode;
  reportJustCreated?: boolean;
  onDismissCreatedBanner?: () => void;
  onLockedFeature?: (prompt: ProFeaturePromptInput) => void;
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
  onFeedback,
  accountControl,
  reportJustCreated,
  onDismissCreatedBanner,
  onLockedFeature
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
  const [expandedDashboardSections, setExpandedDashboardSections] = useState<DashboardDisclosureId[]>([]);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [dashboardProFeaturePrompt, setDashboardProFeaturePrompt] = useState<ProFeaturePromptState | null>(null);

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
  const canUseReviewLoop = canUseFeature(plan, "review_cadence");
  const canViewMistakeHeatmap = canUseFeature(plan, "mistake_heatmap");
  const canInspectFullDrilldown = reportAccessLevel === "full" && canViewFullDrilldown(plan);
  const shouldGateFullDrilldown = plan.id === "free" || !canInspectFullDrilldown;
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
  const walkthroughOpen = isGuideOpen;
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
      setIsGuideOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [walkthroughOpen]);

  const openWalkthrough = () => {
    setGuideStep(0);
    setIsGuideOpen(true);
    trackEvent("dashboard_walkthrough_opened", { reportId: result.id, stepCount: guideSteps.length });
  };

  const closeWalkthrough = () => {
    setIsGuideOpen(false);
  };

  const finishWalkthrough = () => {
    setIsGuideOpen(false);
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

  const showLockedFeaturePrompt = (prompt: ProFeaturePromptInput) => {
    const resolvedPrompt = buildProFeaturePrompt(prompt.feature, prompt);
    setDashboardProFeaturePrompt(resolvedPrompt);
  };

  const showFullDrilldownPrompt = () => {
    showLockedFeaturePrompt({ feature: "full_drilldowns" });
  };

  const showAttributionBreakdownPrompt = () => {
    showLockedFeaturePrompt({ feature: "advanced_attribution" });
  };

  const openDetailTab = (tab: DashboardTab) => {
    if (tab === "breakdown" && !fullAttributionAccess) {
      showAttributionBreakdownPrompt();
      return;
    }

    setExpandedDashboardSections((current) => (current.includes("details") ? current : [...current, "details"]));
    setActiveTab(tab);
    trackEvent("report_tab_opened", { reportId: result.id, tab, source: "dashboard_action" });
    window.requestAnimationFrame(() => {
      document.getElementById("dashboard-detail-dock")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const inspectPrimarySegment = () => {
    if (shouldGateFullDrilldown) {
      showFullDrilldownPrompt();
      return;
    }

    if (!primaryInspection) {
      openDetailTab("breakdown");
      return;
    }

    trackEvent("drilldown_opened", {
      reportId: result.id,
      dimension: primaryInspection.dimension,
      group: primaryInspection.group
    });
    onDrillDown?.({ dimension: primaryInspection.dimension, group: primaryInspection.group });
  };

  const handlePrimarySegmentAction = () => {
    if (shouldGateFullDrilldown) {
      showFullDrilldownPrompt();
      return;
    }

    inspectPrimarySegment();
  };

  const closeDashboardProFeaturePrompt = () => {
    setDashboardProFeaturePrompt(null);
  };

  const upgradeFromDashboardProFeaturePrompt = () => {
    if (dashboardProFeaturePrompt) {
      trackEvent("plan_feature_cta_clicked", {
        feature: dashboardProFeaturePrompt.feature,
        requiredPlan: "pro",
        source: "dashboard_pro_feature_prompt"
      });
    }
    setDashboardProFeaturePrompt(null);
    window.history.pushState(null, "", "/pricing");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const learnFromDashboardProFeaturePrompt = () => {
    if (!dashboardProFeaturePrompt) return;
    trackEvent("paywall_learn_more_clicked", {
      feature: dashboardProFeaturePrompt.feature,
      requiredPlan: "pro",
      source: "dashboard_pro_feature_prompt"
    });
    const path = `/app/how-it-works?feature=${encodeURIComponent(dashboardProFeaturePrompt.learnPath)}`;
    setDashboardProFeaturePrompt(null);
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const toggleDashboardSection = (sectionId: DashboardDisclosureId) => {
    setExpandedDashboardSections((current) =>
      current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId]
    );
  };

  const expandAllDashboardSections = () => {
    setExpandedDashboardSections(dashboardDisclosureIds);
  };

  const collapseAllDashboardSections = () => {
    setExpandedDashboardSections([]);
  };

  const handleAudit = () => {
    if (!canViewReconstructionAudit) {
      showLockedFeaturePrompt({ feature: "reconstruction_audit" });
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

  const reportName = result.name ?? "Diagnostic Report";
  const healthTone = healthScoreTone(intelligence.strategyHealthScore);
  const healthTrendDelta =
    performanceData.length > 1
      ? (performanceData[performanceData.length - 1]?.equity ?? 0) - (performanceData[0]?.equity ?? 0)
      : metrics.netPnl;
  const healthTrendLabel = healthTrendDelta >= 0 ? "Equity curve rising" : "Equity curve falling";
  const trendLabel = intelligence.strategyHealthScore >= 70 ? "Improving" : intelligence.strategyHealthScore >= 50 ? "Stabilizing" : "Needs Work";
  const driverImpact = Math.abs(impactBreakdown.reduce((total, item) => total + item.value, 0) || metrics.totalCosts || metrics.netPnl);
  const driverSignals = compactDetails([
    {
      label: "Cost drag",
      value: metrics.totalCosts > 0 ? currency.format(-Math.abs(metrics.totalCosts)) : currency.format(0),
      detail: "Commissions, fees, and estimated costs.",
      tone: metrics.totalCosts > 0 ? "red" : "gray"
    },
    largestLeak
      ? {
          label: "Weakest segment",
          value: currency.format(largestLeak.netPnl),
          detail: `${largestLeak.group} by net PnL.`,
          tone: largestLeak.netPnl < 0 ? "red" : "green"
        }
      : undefined,
    {
      label: "Average loss",
      value: currency.format(metrics.averageLoss),
      detail: "Typical losing trade size.",
      tone: metrics.averageLoss < 0 ? "red" : "gray"
    },
    {
      label: "Average win",
      value: currency.format(metrics.averageWin),
      detail: "Typical winning trade size.",
      tone: metrics.averageWin > 0 ? "green" : "gray"
    },
    strongestSegment
      ? {
          label: "Best segment",
          value: currency.format(strongestSegment.netPnl),
          detail: `${strongestSegment.group} by net PnL.`,
          tone: strongestSegment.netPnl > 0 ? "green" : "gray"
        }
      : undefined
  ]);
  const priorReport = findPriorReport(result, availableReports);
  const priorReportDate = formatShortDate(priorReport?.createdAt);
  const priorReportName = priorReport?.name ?? "prior report";
  const comparisonRows = priorReport
    ? [
        buildComparisonRow("Net PnL", metrics.netPnl, priorReport.netPnl, currency.format),
        buildComparisonRow("Expectancy", metrics.expectancy, priorReport.expectancy, currency.format),
        buildComparisonRow("Win Rate", metrics.winRate, priorReport.winRate, percent.format),
        buildComparisonRow("Profit Factor", metrics.profitFactor, priorReport.profitFactor, formatProfitFactor)
      ]
    : [];
  const reportActivityRows = [
    { name: reportName, health: intelligence.strategyHealthScore, net: metrics.netPnl, exp: metrics.expectancy, date: reportDate ? reportDate.toLocaleString(undefined, { month: "short", day: "numeric" }) : "Latest" },
    ...availableReports
      .filter((report) => report.id !== result.id)
      .slice(0, 3)
      .map((report, index) => ({
        name: report.name,
        health: Math.max(1, Math.min(99, Math.round((report.profitFactor ?? 1) * 32 + report.winRate * 36 - index * 3))),
        net: report.netPnl,
        exp: report.expectancy,
        date: new Date(report.createdAt).toLocaleString(undefined, { month: "short", day: "numeric" })
      }))
  ];
  const strategyMonitorRows = (breakdownRows.length ? breakdownRows : []).slice(0, 4).map((row, index) => ({
    name: row.group,
    health: Math.max(1, Math.min(99, Math.round(55 + row.winRate * 28 + Math.min(row.profitFactor, 2) * 9 - index * 3))),
    trend: row.netPnl >= 0 ? "up" : row.expectancy >= 0 ? "flat" : "down",
    note: row.netPnl >= 0 ? "Strong performance" : row.expectancy >= 0 ? "Needs refinement" : "Underperforming"
  }));
  const commandActions = actionItems.slice(0, 4);
  const reviewLoop = buildReviewLoop({
    result: safeResult,
    metrics,
    intelligence,
    currentReportName: reportName,
    normalizedTradeCount,
    availableReports,
    priorReport,
    benchmarks,
    actionItems,
    largestLeak
  });
  const mistakeHeatmap = useMemo(() => buildMistakeHeatmap(trades), [trades]);
  const actionPriorityCounts = commandActions.reduce(
    (counts, item) => {
      if (item.tone === "red") counts.high += 1;
      else if (item.tone === "yellow") counts.medium += 1;
      else counts.low += 1;
      return counts;
    },
    { high: 0, medium: 0, low: 0 }
  );
  const commandNavItems: Array<{ label: string; action?: () => void; active?: boolean }> = [
    { label: "Dashboard", action: onOpenDashboard, active: true },
    { label: "Import Trades", action: onCreateReport },
    { label: "Reports", action: onViewReports },
    { label: "Strategy Sets", action: onOpenCollections },
    { label: "Compare", action: handleSidebarCompare },
    { label: "How It Works", action: onOpenFeatures },
    { label: "Feedback", action: onFeedback }
  ];
  const activeCommandNavLabel = commandNavItems.find((item) => item.active)?.label ?? "Dashboard";

  const handleCommandNavAction = (action: (() => void) | undefined) => {
    setIsMobileNavOpen(false);
    if (action) action();
  };

  return (
    <main className={`EdgeTrace-report-dashboard EdgeTrace-command-dashboard ${walkthroughOpen ? "has-walkthrough-open" : ""}`}>
      <section className="EdgeTrace-dashboard-main" aria-hidden={walkthroughOpen}>
        <div className="EdgeTrace-command-shell">
          <header
            className={[
              "EdgeTrace-command-nav",
              isMobileNavOpen ? "is-mobile-open" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button className="EdgeTrace-command-brand" onClick={onOpenDashboard} aria-label="EdgeTrace dashboard">
              <img src="/brand/edgetrace_icon_monochrome_white_transparent.png" alt="" aria-hidden="true" />
              <img src="/brand/edgetrace_wordmark_monochrome_white.png" alt="EdgeTrace" />
            </button>
            <nav aria-label="Dashboard navigation">
              {commandNavItems.map(({ label, action, active }) => (
                <button
                  key={label}
                  className={`EdgeTrace-command-nav-item ${active ? "active" : ""}`}
                  onClick={() => handleCommandNavAction(action)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="EdgeTrace-command-nav-actions">
              <button className="EdgeTrace-command-primary" onClick={onCreateReport}>+ New Report</button>
              <button
                className="EdgeTrace-mobile-nav-toggle"
                type="button"
                aria-expanded={isMobileNavOpen}
                aria-label={isMobileNavOpen ? "Close section menu" : "Open section menu"}
                onClick={() => setIsMobileNavOpen((open) => !open)}
              >
                {isMobileNavOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
              </button>
              {accountControl && <div className="EdgeTrace-dashboard-account-control">{accountControl}</div>}
            </div>
            <div
              aria-label="Dashboard navigation (all sections)"
              className="EdgeTrace-mobile-nav-menu EdgeTrace-command-mobile-nav-menu"
              role="navigation"
            >
              {commandNavItems
                .filter((item) => item.label !== activeCommandNavLabel)
                .map(({ label, action }) => (
                  <button
                    key={label}
                    className="EdgeTrace-command-nav-item"
                    onClick={() => handleCommandNavAction(action)}
                  >
                    {label}
                  </button>
                ))}
            </div>
          </header>

          <section className="EdgeTrace-command-card EdgeTrace-command-card-1">
            <div className="EdgeTrace-command-card-heading">
              <span>Report Overview</span>
            </div>
            <div className="EdgeTrace-command-overview-main">
              <div className="EdgeTrace-command-overview-copy">
                <div className="EdgeTrace-command-report-selector-wrap">
                  <div className="EdgeTrace-command-report-selector-head">
                    <label htmlFor="command-dashboard-report-select">Report</label>
                    <button type="button" onClick={() => setIsEditingDetails(true)}>
                      Edit details
                    </button>
                  </div>
                  <select
                    id="command-dashboard-report-select"
                    value={result.id}
                    disabled={reportsLoading}
                    onChange={(event) => void handleReportSelect(event.target.value)}
                    aria-label="Select dashboard report"
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
              <div className="EdgeTrace-command-overview-summary" aria-label="Report summary">
                <div className={`EdgeTrace-drilldown-stripe tone-${metrics.netPnl >= 0 ? "green" : "red"}`}>
                  <span>Net PnL</span>
                  <strong className={metrics.netPnl >= 0 ? "tone-green" : "tone-red"}>{currency.format(metrics.netPnl)}</strong>
                </div>
                <div className={`EdgeTrace-drilldown-stripe tone-${metrics.expectancy >= 0 ? "green" : "red"}`}>
                  <span>Expectancy</span>
                  <strong className={metrics.expectancy >= 0 ? "tone-green" : "tone-red"}>{currency.format(metrics.expectancy)}</strong>
                </div>
                <div className={`EdgeTrace-drilldown-stripe tone-${winRateTone(metrics.winRate)}`}>
                  <span>Win Rate</span>
                  <strong className={`tone-${winRateTone(metrics.winRate)}`}>{percent.format(metrics.winRate)}</strong>
                </div>
                <div className={`EdgeTrace-drilldown-stripe tone-${profitFactorTone(metrics.profitFactor)}`}>
                  <span>Profit Factor</span>
                  <strong className={`tone-${profitFactorTone(metrics.profitFactor)}`}>{formatProfitFactor(metrics.profitFactor)}</strong>
                </div>
                <div className={`EdgeTrace-drilldown-stripe tone-${rMultipleTone(metrics.averageRealizedR)}`}>
                  <span>R-Multiple</span>
                  <strong className={`tone-${rMultipleTone(metrics.averageRealizedR)}`}>
                    {metrics.averageRealizedR !== undefined ? `${number.format(metrics.averageRealizedR)}R` : "N/A"}
                  </strong>
                </div>
                <div className={`EdgeTrace-drilldown-stripe tone-${sampleSizeTone(normalizedTradeCount)}`}>
                  <span>Trades</span>
                  <strong className={`tone-${sampleSizeTone(normalizedTradeCount)}`}>{number.format(normalizedTradeCount)}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="EdgeTrace-command-grid" aria-label="Dashboard command center">
            <article className="EdgeTrace-command-card EdgeTrace-command-diagnosis">
              <div className="EdgeTrace-command-card-heading">
                <span>Primary Diagnosis</span>
              </div>
              <h2>{humanDiagnosis(intelligence.primaryDiagnosis)}</h2>
              <p>{intelligence.primaryLeak.explanation}</p>
              <div className="EdgeTrace-command-two-metrics">
                <div className="EdgeTrace-drilldown-stripe tone-red"><span>Est. Impact</span><strong className="is-red">{currency.format(-Math.abs(driverImpact))}</strong></div>
                <div className={`EdgeTrace-drilldown-stripe tone-${healthTone}`}><span>Diagnosis Strength</span><strong>{diagnosisStrength(intelligence.strategyHealthScore)}</strong></div>
              </div>
              <button
                type="button"
                onClick={handlePrimarySegmentAction}
              >
                View breakdown <ArrowRight size={15} aria-hidden="true" />
              </button>
            </article>

            <article className="EdgeTrace-command-card EdgeTrace-command-health" data-testid="dashboard-health-card">
              <div className="EdgeTrace-command-card-heading">
                <span>Edge Health</span>
              </div>
              <div className={`EdgeTrace-command-health-score tone-${healthTone}`}>
                <strong>{intelligence.strategyHealthScore}</strong>
                <span>/100</span>
                <em>{trendLabel} {healthTrendDelta >= 0 ? <TrendingUp size={16} aria-hidden="true" /> : <TrendingDown size={16} aria-hidden="true" />}</em>
              </div>
              <p className="EdgeTrace-command-health-summary">{healthScoreCopy(intelligence.strategyHealthScore)}</p>
              <div className="EdgeTrace-command-mini-chart">
                <ResponsiveContainer width="100%" height={118}>
                  <LineChart data={signedPerformanceData} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
                    <CartesianGrid stroke="#203241" strokeOpacity={0.42} vertical={false} />
                    <XAxis
                      dataKey="trade"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      allowDecimals={false}
                      interval="preserveStartEnd"
                      stroke="#8393a4"
                      tickLine={false}
                      axisLine={{ stroke: "#243746", strokeOpacity: 0.72 }}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      width={56}
                      stroke="#8393a4"
                      tickLine={false}
                      axisLine={{ stroke: "#243746", strokeOpacity: 0.72 }}
                      tick={{ fontSize: 10 }}
                      tickFormatter={formatCompactAxisCurrency}
                    />
                    <ReferenceLine y={0} stroke="#6b7784" strokeOpacity={0.44} strokeDasharray="3 4" />
                    <Tooltip cursor={{ stroke: "#5b6a76", strokeOpacity: 0.28 }} content={<PerformanceTrendTooltip />} />
                    <Line
                      type="linear"
                      dataKey="positiveEquity"
                      stroke="#73c98f"
                      strokeWidth={2.2}
                      dot={false}
                      activeDot={{ r: 3, fill: "#73c98f", stroke: "#07111d", strokeWidth: 1.5 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                    <Line
                      type="linear"
                      dataKey="negativeEquity"
                      stroke="#e65f73"
                      strokeWidth={2.2}
                      dot={false}
                      activeDot={{ r: 3, fill: "#e65f73", stroke: "#07111d", strokeWidth: 1.5 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <small className={`tone-${healthTrendDelta >= 0 ? "green" : "red"}`}>
                {healthTrendDelta >= 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
                {healthTrendLabel}
              </small>
            </article>

            <article className="EdgeTrace-command-card EdgeTrace-command-drivers">
              <div className="EdgeTrace-command-card-heading">
                <span>Top Drivers</span>
              </div>
              <div className="EdgeTrace-command-driver-signal-grid">
                {driverSignals.map((driver) => (
                  <div key={driver.label} className={`EdgeTrace-drilldown-stripe tone-${driver.tone}`}>
                    <span>{driver.label}</span>
                    <strong>{driver.value}</strong>
                    <small>{driver.detail}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="EdgeTrace-command-card EdgeTrace-command-changed">
              <div className="EdgeTrace-command-card-heading">
                <span>What Changed vs Prior Report</span>
              </div>
              {priorReport ? (
                <>
                  <p className="EdgeTrace-command-compare-source">
                    Compared with <strong>{priorReportName}</strong>{priorReportDate ? ` from ${priorReportDate}` : ""}.
                  </p>
                  <div className="EdgeTrace-command-change-grid">
                    {comparisonRows.map((row) => (
                      <div key={row.label} className={`EdgeTrace-drilldown-stripe tone-${row.tone}`}>
                        <span>{row.label}</span>
                        <strong className={`tone-${row.tone}`}>{row.delta}</strong>
                        <small className={`tone-${row.tone}`}>
                          {row.tone === "green" ? <TrendingUp size={13} aria-hidden="true" /> : row.tone === "red" ? <TrendingDown size={13} aria-hidden="true" /> : null}
                          {row.previous ? `Prior ${row.previous}` : row.current}
                        </small>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="EdgeTrace-command-empty-compare">
                  <strong>No earlier report to compare.</strong>
                  <span>Import another report or add this report to a strategy set to track changes over time.</span>
                </div>
              )}
            </article>

            <PaywallGate
              feature="review_cadence"
              accessLevel={canUseReviewLoop ? "full" : "preview"}
              title="Upgrade to Pro to unlock the review loop."
              description="Pro turns repeated imports into weekly edge reviews, mistake heatmaps, benchmark context, and a checklist for the next upload."
              className="EdgeTrace-command-pro-loop-gate"
            >
              <ProReviewLoopPanel
                review={reviewLoop}
                onCreateReport={onCreateReport}
                onOpenCollections={onOpenCollections}
              />
            </PaywallGate>

            <PaywallGate
              feature="mistake_heatmap"
              accessLevel={canViewMistakeHeatmap ? "full" : "preview"}
              title="Upgrade to Pro to unlock the mistake heatmap."
              description="Pro shows where losses, cost drag, and weak trade clusters repeat by weekday and session so the next upload has a clear inspection target."
              className="EdgeTrace-command-mistake-heatmap-gate"
            >
              <MistakeHeatmapPanel heatmap={mistakeHeatmap} />
            </PaywallGate>

            <article className="EdgeTrace-command-card EdgeTrace-command-actions">
              <div className="EdgeTrace-command-card-heading">
                <span>Recommended Actions (Next Steps)</span>
              </div>
              <div className="EdgeTrace-command-action-row">
                <div className="EdgeTrace-command-action-list">
                  {commandActions.map((item) => (
                    <div key={item.title} className={`EdgeTrace-command-action-card is-action-${item.tone}`}>
                      <span className={`tone-${item.tone}`}>{item.impact}</span>
                      <div className="EdgeTrace-command-action-copy">
                        <strong>{item.title}</strong>
                        <p>{item.title === "Review Primary Leak" ? intelligence.primaryLeak.recommendedInspection : item.impact}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handlePrimarySegmentAction}
                      >
                        <span>Take Action</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <aside>
                  <h3>Action Priority</h3>
                  <p><span className="is-red">High Impact</span><strong>{actionPriorityCounts.high}</strong></p>
                  <p><span className="is-yellow">Medium Impact</span><strong>{actionPriorityCounts.medium}</strong></p>
                  <p><span className="is-green">Low Impact</span><strong>{actionPriorityCounts.low}</strong></p>
                </aside>
              </div>
            </article>

            <article className="EdgeTrace-command-card EdgeTrace-command-table-card">
              <div className="EdgeTrace-command-card-heading">
                <span>Report Activity</span>
                <button onClick={onViewReports}>View all reports <ArrowRight size={13} aria-hidden="true" /></button>
              </div>
              <table>
                <thead><tr><th>Report</th><th>Health</th><th>Net PnL</th><th>Expectancy</th><th>Date</th></tr></thead>
                <tbody>
                  {reportActivityRows.map((row) => (
                    <tr key={`${row.name}-${row.date}`}>
                      <td>{row.name}</td><td className={row.health >= 70 ? "is-green" : row.health >= 50 ? "is-yellow" : "is-red"}>{row.health}</td>
                      <td className={row.net >= 0 ? "is-blue" : "is-red"}>{currency.format(row.net)}</td><td className={row.exp >= 0 ? "is-blue" : "is-red"}>{currency.format(row.exp)}</td><td>{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>

            <article className="EdgeTrace-command-card EdgeTrace-command-table-card">
              <div className="EdgeTrace-command-card-heading">
                <span>Strategy Set Monitoring</span>
                <button onClick={onOpenCollections}>Open strategy sets <ArrowRight size={13} aria-hidden="true" /></button>
              </div>
              <table>
                <thead><tr><th>Strategy Set</th><th>Health</th><th>Trend</th><th>Notes</th></tr></thead>
                <tbody>
                  {strategyMonitorRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td><td className={row.health >= 70 ? "is-green" : row.health >= 50 ? "is-yellow" : "is-red"}>{row.health}</td>
                      <td className={row.trend === "up" ? "is-green" : row.trend === "flat" ? "is-yellow" : "is-red"}>{row.trend === "up" ? "↑" : row.trend === "flat" ? "→" : "↓"}</td><td>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>

            <article className="EdgeTrace-command-card EdgeTrace-command-context">
              <div className="EdgeTrace-command-card-heading">
                <span>Supporting Context</span>
                <button onClick={hasReconstructionAudit ? handleAudit : onViewReports}>View details <ArrowRight size={13} aria-hidden="true" /></button>
              </div>
              <div>
                <p><span>Market Regime</span><strong>{inferRegime(metrics)}</strong></p>
                <p><span>Volatility (ATR)</span><strong>Data unavailable</strong></p>
                <p><span>Trade Frequency</span><strong>{number.format(normalizedTradeCount / 17)} trades/day</strong></p>
                <p><span>Data Quality</span><strong>{provenance?.confidenceLabel ?? "High"}</strong></p>
                <p><span>Reconstruction</span><strong>{reconstructionUsed ? `${normalizedTradeCount} / ${normalizedTradeCount} trades` : "Not used"}</strong></p>
              </div>
            </article>
          </section>
        </div>

        {false && (
          <>
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
                {reportDate?.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit"
                    }) ?? "date unavailable"}
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
          />
          <DashboardMetricCard
            title="Edge Health"
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
            value={metrics.averageRealizedR != null ? `${number.format(metrics.averageRealizedR as number)}R` : "N/A"}
            detail={rMultipleCopy(metrics.averageRealizedR)}
            subdetail="Avg R"
            tone={statusTone(intelligence.keyMetricStatuses.averageR)}
          />
        </section>

        <section className="EdgeTrace-dashboard-panel EdgeTrace-trend-panel EdgeTrace-trend-panel-primary">
          <PanelHeader title="Key Performance Trend" info />
          <div className="EdgeTrace-trend-select">Net PnL</div>
          <ResponsiveContainer width="100%" height={330}>
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
              <Tooltip cursor={{ stroke: "#5b6a76", strokeOpacity: 0.36 }} content={<PerformanceTrendTooltip />} />
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
        </section>

        <section className="EdgeTrace-disclosure-section" aria-label="Additional dashboard details">
          <div className="EdgeTrace-disclosure-toolbar">
            <div>
              <span>More report detail</span>
              <p>Open only the sections you want to inspect.</p>
            </div>
            <div>
              <button onClick={expandAllDashboardSections}>Open all</button>
              <button onClick={collapseAllDashboardSections}>Collapse all</button>
            </div>
          </div>

          <div className="EdgeTrace-disclosure-grid">
            <DashboardDisclosureCard
              title="Primary Diagnosis"
              summary={humanDiagnosis(intelligence.primaryDiagnosis)}
              detail={intelligence.primaryLeak.explanation}
              tone="red"
              isExpanded={expandedDashboardSections.includes("diagnosis")}
              onToggle={() => toggleDashboardSection("diagnosis")}
            >
              <DiagnosisPanel
                intelligence={intelligence}
                metrics={metrics}
                impactBreakdown={impactBreakdown}
                onBreakdown={() => openDetailTab("breakdown")}
              />
            </DashboardDisclosureCard>

            <DashboardDisclosureCard
              title="Priority Insights"
              summary={priorityInsights[0]?.title ?? "No dominant insight"}
              detail={priorityInsights[0]?.detail ?? "Open this section for all report insights."}
              tone="yellow"
              isExpanded={expandedDashboardSections.includes("insights")}
              onToggle={() => toggleDashboardSection("insights")}
            >
              <PriorityInsights
                insights={priorityInsights}
                onOpenInsight={inspectPrimarySegment}
                onViewAllInsights={() => openDetailTab("overview")}
              />
            </DashboardDisclosureCard>

            <BenchmarkIntelligencePanel
              accessLevel={canViewAggregateBenchmarks ? "full" : "locked"}
              snapshot={benchmarks}
              isLoading={benchmarksLoading}
              error={benchmarksError}
            />

            <DashboardDisclosureCard
              title="Changes, Actions, and Context"
              summary={actionItems[0]?.title ?? "Review report context"}
              detail="Prior-report changes, recommended actions, and import/data quality context."
              tone="gray"
              isExpanded={expandedDashboardSections.includes("nextSteps")}
              onToggle={() => toggleDashboardSection("nextSteps")}
            >
              <section className="EdgeTrace-dashboard-bottom">
                <SnapshotStats
                  metrics={metrics}
                  averageR={metrics.averageRealizedR}
                  normalizedTradeCount={normalizedTradeCount}
                  onCompare={onCompareReport ? () => onCompareReport?.(result.id) : undefined}
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
            </DashboardDisclosureCard>

            <DashboardDisclosureCard
              title="Detailed Report Data"
              summary={`${activeTab.charAt(0).toUpperCase()}${activeTab.slice(1)} view`}
              detail="Open the full report snapshot, attribution breakdowns, or normalized trades without leaving the page."
              tone="gray"
              isExpanded={expandedDashboardSections.includes("details")}
              onToggle={() => toggleDashboardSection("details")}
            >
              <section id="dashboard-detail-dock" className="EdgeTrace-detail-dock" aria-label="Detailed report data">
          <div className="EdgeTrace-detail-tabs">
            {(["overview", "breakdown", "trades"] as DashboardTab[]).map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                type="button"
                onClick={() => openDetailTab(tab)}
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
            </DashboardDisclosureCard>
          </div>
        </section>
          </>
        )}
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
      {dashboardProFeaturePrompt && (
        <ProFeaturePrompt
          feature={dashboardProFeaturePrompt.feature}
          title={dashboardProFeaturePrompt.title}
          description={dashboardProFeaturePrompt.description}
          onClose={closeDashboardProFeaturePrompt}
          onUpgrade={upgradeFromDashboardProFeaturePrompt}
          onLearn={learnFromDashboardProFeaturePrompt}
        />
      )}
    </main>
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
    <article className={`EdgeTrace-dashboard-panel EdgeTrace-kpi-card EdgeTrace-drilldown-stripe tone-${tone} ${icon ? "has-icon" : ""}`} data-testid={dataTestId}>
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

function DashboardDisclosureCard({
  title,
  summary,
  detail,
  tone,
  isExpanded,
  onToggle,
  children
}: {
  title: string;
  summary: string;
  detail: string;
  tone: "red" | "yellow" | "green" | "blue" | "gray";
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <article className={`EdgeTrace-dashboard-panel EdgeTrace-disclosure-card tone-${tone} ${isExpanded ? "is-open" : ""}`}>
      <button
        className="EdgeTrace-disclosure-trigger"
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <span className="EdgeTrace-disclosure-copy">
          <span className="EdgeTrace-disclosure-kicker">{title}</span>
          <strong>{summary}</strong>
          <small>{detail}</small>
        </span>
        <span className="EdgeTrace-disclosure-action">
          {isExpanded ? "Hide" : "Open"}
          <ChevronDown size={17} aria-hidden="true" />
        </span>
      </button>
      {isExpanded && <div className="EdgeTrace-disclosure-content">{children}</div>}
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

  return (
    <div id="primary-diagnosis" className="EdgeTrace-dashboard-panel EdgeTrace-diagnosis-panel">
      <PanelHeader title="Primary Diagnosis" info />
      <div className="EdgeTrace-diagnosis-layout">
        <div>
          <h2 className={diagnosisToneClass(intelligence.primaryDiagnosis)}>{humanDiagnosis(intelligence.primaryDiagnosis)}</h2>
          <p>{intelligence.primaryLeak.explanation}</p>
          <div className="EdgeTrace-diagnosis-foot">
            <MetricMini label="Est. Impact" value={currency.format(-Math.abs(totalImpact || metrics.totalCosts))} tone="red" />
            <MetricMini label="Diagnosis Strength" value={diagnosisStrength(intelligence.strategyHealthScore)} tone="white" />
          </div>
        </div>

        <div className="EdgeTrace-impact-summary">
          <span>Total impact</span>
          <strong>{currency.format(-Math.abs(totalImpact || metrics.totalCosts))}</strong>
          <div className="EdgeTrace-impact-bar" aria-hidden="true">
            {impactBreakdown.map((item) => (
              <i key={item.label} style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
            ))}
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
            and profit-factor context.
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
        <span>{metric.percentile ? formatOrdinal(metric.percentile) : "N/A"}</span>
        <i>
          <b style={{ width: `${Math.max(0, Math.min(100, percentileValue))}%` }} />
        </i>
      </div>
    </div>
  );
}

function ProReviewLoopPanel({
  review,
  onCreateReport,
  onOpenCollections
}: {
  review: ReviewLoopOutput;
  onCreateReport?: () => void;
  onOpenCollections?: () => void;
}) {
  return (
    <article className="EdgeTrace-command-card EdgeTrace-command-pro-loop">
      <div className="EdgeTrace-command-card-heading">
        <span>Pro Review Loop</span>
      </div>

      <div className={`EdgeTrace-review-loop-status tone-${review.statusTone}`}>
        <strong>{review.statusTitle}</strong>
        <p>{review.statusDetail}</p>
        <div className="EdgeTrace-review-loop-issue-count">
          {number.format(review.issueCount)} {review.issueCount === 1 ? "issue to verify" : "issues to verify"}
        </div>
      </div>

      <div className="EdgeTrace-review-benchmark-tiles" aria-label="Benchmark scorecards">
        {review.benchmarkTiles.map((tile) => (
          <div key={tile.label} className={`tone-${tile.tone}`}>
            <span>{tile.label}</span>
            <div
              className="EdgeTrace-review-percentile-gauge"
              style={{ "--percentile": `${Math.max(0, Math.min(100, tile.percentile ?? 0)) * 3.6}deg` } as CSSProperties}
            >
              <strong>{tile.value}</strong>
              <em>{tile.percentile === undefined ? "Benchmark" : "Percentile"}</em>
            </div>
            <small>{tile.detail}</small>
            <i aria-hidden="true">
              <b style={{ width: `${Math.max(0, Math.min(100, tile.percentile ?? 0))}%` }} />
            </i>
          </div>
        ))}
      </div>

      <div className="EdgeTrace-review-loop-grid">
        <section className="EdgeTrace-review-story">
          <span>Weekly Edge Review</span>
          <h3>{review.reviewVerdict}</h3>
          <p>{review.reviewSummary}</p>
          <div className="EdgeTrace-review-loop-items">
            {review.alerts.map((item) => (
              <div key={`review-${item.label}-${item.title}`} className={`tone-${item.tone}`}>
                <span>{item.label}</span>
                <p>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="EdgeTrace-review-targets">
          <span>Next Review Targets</span>
          <h3>Prove these fixes next</h3>
          <p>{review.comparisonSummary}</p>
          <div className="EdgeTrace-review-loop-items">
            {review.checklist.map((item) => (
              <div key={`target-${item.label}-${item.title}`} className={`tone-${item.tone}`}>
                <span>{item.label}</span>
                <p>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="EdgeTrace-review-loop-actions">
        <button type="button" onClick={onCreateReport}>
          Import next report <ArrowRight size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={onOpenCollections}>
          Open strategy sets <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function MistakeHeatmapPanel({ heatmap }: { heatmap: MistakeHeatmapOutput }) {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const buckets = ["Open", "AM", "Mid", "PM", "Close"];
  const cellMap = new Map(heatmap.cells.map((cell) => [cell.id, cell]));
  const edgeCellMap = new Map(heatmap.edgeCells.map((cell) => [cell.id, cell]));

  return (
    <article className="EdgeTrace-command-card EdgeTrace-command-mistake-heatmap">
      <div className="EdgeTrace-command-card-heading">
        <span>Trade Pattern Heatmaps</span>
      </div>
      <div className="EdgeTrace-mistake-heatmap-layout">
        <div className="EdgeTrace-mistake-heatmap-summary">
          <div className="EdgeTrace-mistake-heatmap-summary-block is-red">
            <span>Leaks to fix</span>
            <h3>{heatmap.peakLabel}</h3>
            <p>{heatmap.peakDetail}</p>
          </div>
          <div className="EdgeTrace-mistake-heatmap-summary-block is-green">
            <span>What is working</span>
            <h3>{heatmap.edgePeakLabel}</h3>
            <p>{heatmap.edgePeakDetail}</p>
          </div>
          <div className="EdgeTrace-mistake-heatmap-stats">
            <div className="EdgeTrace-mistake-heatmap-stat">
              <span>Net downside</span>
              <strong className="is-red">{formatHeatCurrency(heatmap.totalMistakeCost, "red")}</strong>
            </div>
            <div className="EdgeTrace-mistake-heatmap-stat">
              <span>Net upside</span>
              <strong className="is-green">{formatHeatCurrency(heatmap.totalEdgeValue, "green")}</strong>
            </div>
            <div className="EdgeTrace-mistake-heatmap-stat">
              <span>Losing trades</span>
              <strong className="is-red">{heatmap.mistakeTrades}</strong>
            </div>
            <div className="EdgeTrace-mistake-heatmap-stat">
              <span>Winning trades</span>
              <strong className="is-green">{heatmap.edgeTrades}</strong>
            </div>
            <div className="EdgeTrace-mistake-heatmap-stat">
              <span>Losing share</span>
              <strong className="is-red">{percent.format(heatmap.mistakeRate)}</strong>
            </div>
            <div className="EdgeTrace-mistake-heatmap-stat">
              <span>Win rate</span>
              <strong className="is-green">{percent.format(heatmap.edgeRate)}</strong>
            </div>
            <div className="EdgeTrace-mistake-heatmap-stat">
              <span>Avg loss</span>
              <strong className="is-red">{formatHeatCurrency(heatmap.averageMistakeLoss, "red")}</strong>
            </div>
            <div className="EdgeTrace-mistake-heatmap-stat">
              <span>Avg winning trade</span>
              <strong className="is-green">{formatHeatCurrency(heatmap.averageEdgeWin, "green")}</strong>
            </div>
          </div>
        </div>
        <div className="EdgeTrace-mistake-heatmap-stage">
          <HeatmapBlock
            title="Leak map"
            subtitle="Where losses outweigh gains by weekday and market session."
            tone="red"
            weekdays={weekdays}
            buckets={buckets}
            cellMap={cellMap}
          />
          <HeatmapBlock
            title="Edge map"
            subtitle="Where gains outweigh losses by weekday and market session."
            tone="green"
            weekdays={weekdays}
            buckets={buckets}
            cellMap={edgeCellMap}
          />
        </div>
        <div className="EdgeTrace-mistake-heatmap-rail">
          <MistakeHeatmapList title="Edge clusters" labelTitle="Window" metricTitle="Net upside" tone="green" items={heatmap.topEdgeClusters} />
          <MistakeHeatmapList title="Strong symbols" labelTitle="Symbol" metricTitle="Net upside" tone="green" items={heatmap.topEdgeSymbols} />
          <MistakeHeatmapList title="Best sessions" labelTitle="Session" metricTitle="Net upside" tone="green" items={heatmap.topEdgeSessions} />
          <MistakeHeatmapList title="Leak clusters" labelTitle="Window" metricTitle="Net downside" tone="red" items={heatmap.topClusters} />
          <MistakeHeatmapList title="Weak symbols" labelTitle="Symbol" metricTitle="Net downside" tone="red" items={heatmap.topSymbols} />
          <MistakeHeatmapList title="Worst sessions" labelTitle="Session" metricTitle="Net downside" tone="red" items={heatmap.topSessions} />
        </div>
      </div>
    </article>
  );
}

function HeatmapBlock({
  title,
  subtitle,
  tone,
  weekdays,
  buckets,
  cellMap
}: {
  title: string;
  subtitle: string;
  tone: "red" | "green";
  weekdays: string[];
  buckets: string[];
  cellMap: Map<string, MistakeHeatmapCell>;
}) {
  return (
    <section className={`EdgeTrace-mistake-heatmap-block is-${tone}`}>
      <div className="EdgeTrace-mistake-heatmap-block-header">
        <div>
          <h4>{title}</h4>
          <p>{subtitle}</p>
        </div>
        <div className="EdgeTrace-mistake-heatmap-legend" aria-hidden="true">
          <span>Less</span>
          {[0.12, 0.28, 0.44, 0.62, 0.78, 0.94].map((level) => (
            <i key={level} style={{ background: heatmapCellBackground(level, tone) }} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="EdgeTrace-mistake-heatmap-grid" role="img" aria-label={`${title} by weekday and session`}>
        <div className="EdgeTrace-mistake-heatmap-corner" />
        {buckets.map((bucket) => (
          <span key={bucket} className="EdgeTrace-mistake-heatmap-axis is-column">
            <strong>{bucket}</strong>
            <em>{heatmapBucketRangeLabel(bucket)}</em>
          </span>
        ))}
        {weekdays.map((weekday) => (
          <MistakeHeatmapRow
            key={weekday}
            weekday={weekday}
            buckets={buckets}
            cellMap={cellMap}
            tone={tone}
          />
        ))}
      </div>
    </section>
  );
}

function MistakeHeatmapList({
  title,
  labelTitle,
  metricTitle,
  tone,
  items
}: {
  title: string;
  labelTitle: string;
  metricTitle: string;
  tone: "red" | "green";
  items: MistakeHeatmapRank[];
}) {
  return (
    <section className={`EdgeTrace-mistake-heatmap-list is-${tone}`}>
      <h4>{title}</h4>
      {items.length > 0 ? (
        <div>
          <div className="EdgeTrace-mistake-heatmap-list-head">
            <span>{labelTitle}</span>
            <span>{metricTitle}</span>
            <span>Evidence</span>
          </div>
          {items.map((item) => (
            <div key={`${title}-${item.label}`} className="EdgeTrace-mistake-heatmap-list-row">
              <span>
                <i style={{ background: heatmapCellBackground(item.level, tone) }} />
                {item.label}
              </span>
              <strong>{formatHeatCurrency(item.value, tone)}</strong>
              <em>{item.detail}</em>
            </div>
          ))}
        </div>
      ) : (
        <p>No concentrated pattern yet.</p>
      )}
    </section>
  );
}

function MistakeHeatmapRow({
  weekday,
  buckets,
  cellMap,
  tone
}: {
  weekday: string;
  buckets: string[];
  cellMap: Map<string, MistakeHeatmapCell>;
  tone: "red" | "green";
}) {
  return (
    <>
      <span className="EdgeTrace-mistake-heatmap-axis is-row">{weekday}</span>
      {buckets.map((bucket) => {
        const cell = cellMap.get(`${weekday}-${bucket}`) ?? {
          id: `${weekday}-${bucket}`,
          weekday,
          bucket,
          score: 0,
          trades: 0,
          losingTrades: 0,
          winningTrades: 0,
          loss: 0,
          gain: 0,
          costs: 0,
          level: 0
        };
        const valueLabel =
          tone === "green"
            ? `${formatHeatCurrency(cell.score, "green")} net upside`
            : `${formatHeatCurrency(cell.score, "red")} net downside`;
        const bucketRange = heatmapBucketRangeLabel(bucket);
        return (
          <span
            key={cell.id}
            className="EdgeTrace-mistake-heatmap-cell"
            style={{ background: heatmapCellBackground(cell.level, tone) }}
            title={`${weekday} ${bucket} (${bucketRange}): ${cell.trades} trade${cell.trades === 1 ? "" : "s"}, ${valueLabel}`}
            aria-label={`${weekday} ${bucket} ${bucketRange}, ${cell.trades} trade${cell.trades === 1 ? "" : "s"}, ${valueLabel}`}
          >
            {cell.score > 0 ? (
              <>
                <strong>{formatHeatCurrency(cell.score, tone)}</strong>
                <em>{cell.winningTrades}W / {cell.losingTrades}L</em>
              </>
            ) : null}
          </span>
        );
      })}
    </>
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
    Overview: "Overall read of the imported report based on Edge Health and primary diagnosis.",
    "Edge Health": "Composite 0-100 score from expectancy, payoff quality, equity stability, costs, win rate, R capture, and sample confidence.",
    Expectancy: "Average after-cost profit or loss per completed trade.",
    "Net PnL": "Total after-cost profit or loss across the imported trades.",
    "Win Rate": "Percentage of imported trades that closed profitably.",
    "R-Multiple": "Average realized reward-to-risk when planned risk or stop data is available.",
    "Key Performance Trend": "Trade-by-trade net PnL path for the imported report.",
    "Primary Diagnosis": "The highest-priority issue EdgeTrace found in the report.",
    "Priority Insights": "The most important items to inspect before changing the strategy.",
    "EdgeTrace Benchmarks": "How this report compares against eligible aggregate report cohorts.",
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
        { label: "Edge Health", value: `${intelligence.strategyHealthScore}/100`, tone: guideToneForScore(intelligence.strategyHealthScore) },
        { label: "Status", value: intelligence.healthBand, tone: guideToneForScore(intelligence.strategyHealthScore) },
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

const mistakeWeekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const mistakeBuckets = [
  { label: "Open", start: 9.5, end: 10.5 },
  { label: "AM", start: 10.5, end: 12 },
  { label: "Mid", start: 12, end: 14 },
  { label: "PM", start: 14, end: 15.5 },
  { label: "Close", start: 15.5, end: 16 }
] as const;

function heatmapBucketRangeLabel(label: string) {
  const bucket = mistakeBuckets.find((item) => item.label === label);
  return bucket ? `${formatSessionHour(bucket.start)}-${formatSessionHour(bucket.end)}` : "";
}

function formatSessionHour(hourValue: number) {
  const hour = Math.floor(hourValue);
  const minutes = Math.round((hourValue - hour) * 60);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")}${period}`;
}

function buildMistakeHeatmap(trades: NormalizedTrade[]): MistakeHeatmapOutput {
  const cells = new Map<string, MistakeHeatmapCell>();
  const edgeCells = new Map<string, MistakeHeatmapCell>();
  const symbols = new Map<string, HeatmapSummary>();
  const sessions = new Map<string, HeatmapSummary>();
  let mistakeTrades = 0;
  let edgeTrades = 0;
  let totalLoss = 0;
  let totalGain = 0;
  let totalCosts = 0;
  const emptySummary = (): HeatmapSummary => ({
    trades: 0,
    losingTrades: 0,
    winningTrades: 0,
    loss: 0,
    gain: 0,
    costs: 0
  });
  const updateSummary = (map: Map<string, HeatmapSummary>, key: string, loss: number, gain: number, costs: number) => {
    const summary = map.get(key) ?? emptySummary();
    summary.trades += 1;
    summary.loss += loss;
    summary.gain += gain;
    summary.costs += costs;
    if (loss > 0) summary.losingTrades += 1;
    if (gain > 0) summary.winningTrades += 1;
    map.set(key, summary);
  };

  mistakeWeekdays.forEach((weekday) => {
    mistakeBuckets.forEach((bucket) => {
      const emptyCell = {
        id: `${weekday}-${bucket.label}`,
        weekday,
        bucket: bucket.label,
        score: 0,
        trades: 0,
        losingTrades: 0,
        winningTrades: 0,
        loss: 0,
        gain: 0,
        costs: 0,
        level: 0
      };
      cells.set(`${weekday}-${bucket.label}`, { ...emptyCell });
      edgeCells.set(`${weekday}-${bucket.label}`, { ...emptyCell });
    });
  });
  mistakeBuckets.forEach((bucket) => {
    sessions.set(bucket.label, emptySummary());
  });

  trades.forEach((trade) => {
    const date = parseTradeDate(trade.entryTime);
    if (!date) return;
    const weekday = weekdayLabel(date);
    if (!mistakeWeekdays.includes(weekday as (typeof mistakeWeekdays)[number])) return;
    const bucket = sessionBucket(date);
    const cell = cells.get(`${weekday}-${bucket}`);
    const edgeCell = edgeCells.get(`${weekday}-${bucket}`);
    if (!cell || !edgeCell) return;

    const loss = Math.max(0, -trade.netPnl);
    const gain = Math.max(0, trade.netPnl);
    const costs = getTradeCosts(trade);
    if (loss <= 0 && gain <= 0) return;

    [cell, edgeCell].forEach((target) => {
      target.trades += 1;
      target.loss += loss;
      target.gain += gain;
      target.costs += costs;
      if (loss > 0) target.losingTrades += 1;
      if (gain > 0) target.winningTrades += 1;
    });

    if (loss > 0) {
      mistakeTrades += 1;
      totalLoss += loss;
      totalCosts += costs;
    }
    if (gain > 0) {
      edgeTrades += 1;
      totalGain += gain;
    }

    const symbol = trade.symbol || "Unspecified";
    updateSummary(symbols, symbol, loss, gain, costs);
    updateSummary(sessions, bucket, loss, gain, costs);
  });

  const scoredCells = [...cells.values()];
  scoredCells.forEach((cell) => {
    cell.score = Math.max(cell.loss - cell.gain, 0);
  });
  const maxScore = Math.max(...scoredCells.map((cell) => cell.score), 0);
  scoredCells.forEach((cell) => {
    cell.level = maxScore > 0 ? cell.score / maxScore : 0;
  });
  const scoredEdgeCells = [...edgeCells.values()];
  scoredEdgeCells.forEach((cell) => {
    cell.score = Math.max(cell.gain - cell.loss, 0);
  });
  const maxEdgeScore = Math.max(...scoredEdgeCells.map((cell) => cell.score), 0);
  scoredEdgeCells.forEach((cell) => {
    cell.level = maxEdgeScore > 0 ? cell.score / maxEdgeScore : 0;
  });

  const peak = [...scoredCells].sort((a, b) => b.score - a.score)[0];
  const edgePeak = [...scoredEdgeCells].sort((a, b) => b.score - a.score)[0];
  const totalMistakeCost = scoredCells.reduce((sum, cell) => sum + cell.score, 0);
  const totalEdgeValue = scoredEdgeCells.reduce((sum, cell) => sum + cell.score, 0);
  const topClusters = [...scoredCells]
    .filter((cell) => cell.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((cell) => ({
      label: `${cell.weekday} ${cell.bucket}`,
      value: cell.score,
      detail: `${cell.losingTrades} losing vs ${cell.winningTrades} winning trades`,
      level: cell.level
    }));
  const topEdgeClusters = [...scoredEdgeCells]
    .filter((cell) => cell.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((cell) => ({
      label: `${cell.weekday} ${cell.bucket}`,
      value: cell.score,
      detail: `${cell.winningTrades} winning vs ${cell.losingTrades} losing trades`,
      level: cell.level
    }));
  const topSymbols = rankedNetHeatmapSummaries(symbols, "red", (label) => label);
  const topSessions = rankedNetHeatmapSummaries(sessions, "red", (label) => `${label} session`);
  const topEdgeSymbols = rankedNetHeatmapSummaries(symbols, "green", (label) => label);
  const topEdgeSessions = rankedNetHeatmapSummaries(sessions, "green", (label) => `${label} session`);

  return {
    cells: scoredCells,
    edgeCells: scoredEdgeCells,
    peakLabel: peak && peak.score > 0 ? `${peak.weekday} ${peak.bucket} is the biggest net leak.` : "No net losing cluster detected.",
    peakDetail:
      peak && peak.score > 0
        ? `${peak.losingTrades} losing vs ${peak.winningTrades} winning trades, for ${formatHeatCurrency(peak.score, "red")} net downside.`
        : "This report does not show a concentrated net losing weekday/session pattern yet.",
    edgePeakLabel:
      edgePeak && edgePeak.score > 0 ? `${edgePeak.weekday} ${edgePeak.bucket} is producing the most net edge.` : "No net winning cluster detected yet.",
    edgePeakDetail:
      edgePeak && edgePeak.score > 0
        ? `${edgePeak.winningTrades} winning vs ${edgePeak.losingTrades} losing trades, for ${formatHeatCurrency(edgePeak.score, "green")} net upside.`
        : "This report does not show a concentrated net winning weekday/session pattern yet.",
    totalMistakeCost,
    totalEdgeValue,
    mistakeTrades,
    edgeTrades,
    mistakeRate: trades.length > 0 ? mistakeTrades / trades.length : 0,
    edgeRate: trades.length > 0 ? edgeTrades / trades.length : 0,
    averageMistakeLoss: mistakeTrades > 0 ? totalLoss / mistakeTrades : 0,
    averageEdgeWin: edgeTrades > 0 ? totalGain / edgeTrades : 0,
    costDrag: totalCosts,
    activeCells: scoredCells.filter((cell) => cell.score > 0).length,
    activeEdgeCells: scoredEdgeCells.filter((cell) => cell.score > 0).length,
    topClusters,
    topSymbols,
    topSessions,
    topEdgeClusters,
    topEdgeSymbols,
    topEdgeSessions
  };
}

function rankedNetHeatmapSummaries(
  summaries: Map<string, HeatmapSummary>,
  tone: "red" | "green",
  labelFormatter: (label: string) => string
): MistakeHeatmapRank[] {
  const ranked = [...summaries.entries()]
    .map(([label, summary]) => ({
      label,
      summary,
      value: tone === "green" ? Math.max(summary.gain - summary.loss, 0) : Math.max(summary.loss - summary.gain, 0)
    }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 3);
  const maxValue = Math.max(...ranked.map((item) => item.value), 0);
  return ranked.map(({ label, summary, value }) => ({
    label: labelFormatter(label),
    value,
    detail:
      tone === "green"
        ? `${summary.winningTrades} winning vs ${summary.losingTrades} losing trades`
        : `${summary.losingTrades} losing vs ${summary.winningTrades} winning trades`,
    level: maxValue > 0 ? value / maxValue : 0
  }));
}

function parseTradeDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function weekdayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function sessionBucket(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const match = mistakeBuckets.find((bucket) => hour >= bucket.start && hour < bucket.end);
  return match?.label ?? (hour < mistakeBuckets[0].start ? "Open" : "Close");
}

function heatmapCellBackground(level: number, tone: "red" | "green") {
  if (level <= 0) return "rgba(36, 53, 66, 0.36)";
  const clamped = Math.max(0.08, Math.min(1, level));
  if (tone === "green") {
    if (clamped < 0.34) return `rgba(41, 101, 77, ${0.34 + clamped * 0.72})`;
    if (clamped < 0.68) return `rgba(57, 153, 104, ${0.34 + clamped * 0.72})`;
    return `rgba(103, 211, 143, ${0.36 + clamped * 0.5})`;
  }
  if (clamped < 0.34) return `rgba(160, 76, 42, ${0.36 + clamped * 0.8})`;
  if (clamped < 0.68) return `rgba(226, 104, 48, ${0.34 + clamped * 0.72})`;
  return `rgba(230, 72, 79, ${0.38 + clamped * 0.58})`;
}

function formatHeatCurrency(value: number, tone: "red" | "green") {
  const absoluteValue = Math.abs(value);
  if (absoluteValue === 0) return currency.format(0);
  return tone === "green" ? `+${currency.format(absoluteValue)}` : currency.format(-absoluteValue);
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

function buildReviewLoop({
  result,
  metrics,
  intelligence,
  currentReportName,
  normalizedTradeCount,
  availableReports,
  priorReport,
  benchmarks,
  actionItems,
  largestLeak
}: {
  result: DiagnosticsResult;
  metrics: DiagnosticsResult["metrics"];
  intelligence: ReturnType<typeof buildReportIntelligence>;
  currentReportName: string;
  normalizedTradeCount: number;
  availableReports: ReportSummary[];
  priorReport?: ReportSummary;
  benchmarks: AggregateBenchmarkSnapshot | null;
  actionItems: Array<{ title: string; impact: string; tone: "red" | "yellow" | "green" | "gray" }>;
  largestLeak: BreakdownRow | undefined;
}): ReviewLoopOutput {
  const currentReport = summaryFromResult(result, metrics, currentReportName, normalizedTradeCount);
  const loopReports = uniqueReports([currentReport, ...availableReports])
    .sort((a, b) => safeTime(a.createdAt) - safeTime(b.createdAt))
    .slice(-8);
  const latestDate = safeTime(result.createdAt);
  const daysSinceLatest = latestDate ? Math.max(0, Math.floor((Date.now() - latestDate) / 86_400_000)) : undefined;
  const cadence = reviewCadence(daysSinceLatest, loopReports.length);
  const alerts = buildReviewAlerts(metrics, intelligence, priorReport, largestLeak);
  const benchmarkTiles = buildBenchmarkTiles(benchmarks);
  const checklist = buildNextReviewChecklist(actionItems, metrics, largestLeak, priorReport);
  const issueCount = alerts.filter((item) => item.tone === "red" || item.tone === "yellow").length;
  const reviewState = reviewLoopStatus(cadence, issueCount, priorReport);
  const regressionNames = alerts
    .filter((item) => item.tone === "red" || item.tone === "yellow")
    .map((item) => item.title.toLowerCase());

  return {
    statusTitle: reviewState.title,
    statusDetail: reviewState.detail,
    statusTone: reviewState.tone,
    issueCount,
    reviewVerdict: weeklyReviewVerdict(issueCount, priorReport),
    reviewSummary: priorReport
      ? regressionNames.length
        ? `${sentenceList(regressionNames)} ${regressionNames.length === 1 ? "is" : "are"} the next items to prove or fix versus ${priorReport.name}.`
        : `No major regression signal versus ${priorReport.name}. Keep the next import focused on confirming the same behavior.`
      : "This report is the baseline. Import again after the next focused trading block to see whether the edge is improving or leaking.",
    comparisonSummary: priorReport
      ? `${currentReportName} is being checked against ${priorReport.name}.`
      : "Add a second report to turn this into a recurring review loop.",
    alerts,
    benchmarkTiles,
    checklist
  };
}

function summaryFromResult(
  result: DiagnosticsResult,
  metrics: DiagnosticsResult["metrics"],
  name: string,
  normalizedTradeCount: number
): ReportSummary {
  return {
    id: result.id,
    name,
    createdAt: result.createdAt ?? new Date().toISOString(),
    updatedAt: result.updatedAt ?? result.createdAt ?? new Date().toISOString(),
    notes: result.notes,
    notesPreview: result.notes,
    tags: result.tags ?? [],
    strategyLabel: result.strategyLabel,
    reportType: result.reportType ?? "unknown",
    totalTrades: normalizedTradeCount,
    winRate: metrics.winRate,
    grossPnl: metrics.grossPnl,
    totalCosts: metrics.totalCosts,
    netPnl: metrics.netPnl,
    expectancy: metrics.expectancy,
    averageRealizedR: metrics.averageRealizedR,
    profitFactor: metrics.profitFactor,
    importProvenance: result.importProvenance
  };
}

function uniqueReports(reports: ReportSummary[]) {
  const byId = new Map<string, ReportSummary>();
  for (const report of reports) byId.set(report.id, report);
  return [...byId.values()];
}

function safeTime(value: string | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function reviewCadence(daysSinceLatest: number | undefined, reportCount: number): { label: string; detail: string; tone: ReviewLoopTone } {
  if (reportCount < 2) {
    return {
      label: "Setup needed",
      detail: "Import one more report",
      tone: "yellow"
    };
  }
  if (daysSinceLatest === undefined) {
    return {
      label: "Cadence unknown",
      detail: "Report date unavailable",
      tone: "gray"
    };
  }
  if (daysSinceLatest <= 2) {
    return {
      label: "Cadence on track",
      detail: "Next review in 1-2 days",
      tone: "green"
    };
  }
  if (daysSinceLatest <= 4) {
    return {
      label: "Review window open",
      detail: "Upload after next session",
      tone: "blue"
    };
  }
  return {
    label: "Review overdue",
    detail: `${number.format(daysSinceLatest)} days since import`,
    tone: "red"
  };
}

function buildReviewAlerts(
  metrics: DiagnosticsResult["metrics"],
  intelligence: ReturnType<typeof buildReportIntelligence>,
  priorReport: ReportSummary | undefined,
  largestLeak: BreakdownRow | undefined
): ReviewLoopItem[] {
  const alerts: ReviewLoopItem[] = [];

  if (!priorReport) {
    return [
      {
        label: "Baseline",
        title: "No prior report yet",
        detail: "Import again after the next trading block so Pro can grade what changed.",
        tone: "yellow"
      },
      {
        label: "Focus",
        title: humanDiagnosis(intelligence.primaryDiagnosis),
        detail: intelligence.primaryLeak.recommendedInspection,
        tone: intelligence.strategyHealthScore >= 70 ? "blue" : "red"
      }
    ];
  }

  const expectancyDelta = metrics.expectancy - priorReport.expectancy;
  const costDelta = metrics.totalCosts - priorReport.totalCosts;
  const profitFactorDelta = metrics.profitFactor - (priorReport.profitFactor ?? 0);
  const winRateDelta = metrics.winRate - priorReport.winRate;

  if (expectancyDelta < -Math.max(Math.abs(priorReport.expectancy) * 0.15, 0.05)) {
    alerts.push({
      label: "Regression",
      title: "Expectancy slipped",
      detail: `${currency.format(priorReport.expectancy)} to ${currency.format(metrics.expectancy)} per trade.`,
      tone: metrics.expectancy < 0 ? "red" : "yellow"
    });
  }
  if (costDelta > Math.max(Math.abs(priorReport.totalCosts) * 0.12, 10)) {
    alerts.push({
      label: "Cost",
      title: "Execution friction rose",
      detail: `Detected costs increased by ${currency.format(costDelta)} since the prior report.`,
      tone: "yellow"
    });
  }
  if (profitFactorDelta < -0.2) {
    alerts.push({
      label: "Quality",
      title: "Profit factor weakened",
      detail: `${formatProfitFactor(priorReport.profitFactor)} to ${formatProfitFactor(metrics.profitFactor)}.`,
      tone: metrics.profitFactor < 1 ? "red" : "yellow"
    });
  }
  if (winRateDelta < -0.05) {
    alerts.push({
      label: "Hit rate",
      title: "Win rate is falling",
      detail: `${percent.format(priorReport.winRate)} to ${percent.format(metrics.winRate)}.`,
      tone: "yellow"
    });
  }
  if (largestLeak && largestLeak.netPnl < 0) {
    alerts.push({
      label: "Leak",
      title: `${largestLeak.group} still needs review`,
      detail: `${currency.format(largestLeak.netPnl)} net PnL is the first segment to inspect.`,
      tone: largestLeak.expectancy < 0 ? "red" : "yellow"
    });
  }

  if (!alerts.length) {
    alerts.push({
      label: "Clear",
      title: "No major regression signal",
      detail: "The latest report is not showing a material deterioration versus the prior report.",
      tone: "green"
    });
  }

  return alerts.slice(0, 3);
}

function reviewLoopStatus(
  cadence: { label: string; detail: string; tone: ReviewLoopTone },
  issueCount: number,
  priorReport: ReportSummary | undefined
): { title: string; detail: string; tone: ReviewLoopTone } {
  if (!priorReport) {
    return {
      title: "Baseline Ready",
      detail: "Import one more report after the next trading block to start tracking change.",
      tone: "blue"
    };
  }
  if (cadence.tone === "red") {
    return {
      title: "Review Overdue",
      detail: `${cadence.detail}. Import after the next 2-3 sessions so the loop stays useful.`,
      tone: "red"
    };
  }
  if (issueCount >= 3) {
    return {
      title: "Regression Check",
      detail: `${number.format(issueCount)} items need confirmation before increasing size.`,
      tone: "yellow"
    };
  }
  if (issueCount > 0) {
    return {
      title: "Follow-Up Needed",
      detail: `${number.format(issueCount)} item should be checked on the next upload.`,
      tone: "yellow"
    };
  }
  return {
    title: "Review On Track",
    detail: "No major deterioration versus the prior report. Keep the cadence steady.",
    tone: "green"
  };
}

function weeklyReviewVerdict(issueCount: number, priorReport: ReportSummary | undefined) {
  if (!priorReport) return "Start the review loop";
  if (issueCount >= 3) return "This review got worse";
  if (issueCount > 0) return "This review needs follow-up";
  return "This review is holding up";
}

function sentenceList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function buildBenchmarkTiles(snapshot: AggregateBenchmarkSnapshot | null): ReviewBenchmarkTile[] {
  if (!snapshot) {
    return [
      {
        label: "Cost Drag",
        value: "Pro",
        detail: "Compare execution friction against the cohort.",
        tone: "blue"
      },
      {
        label: "Expectancy",
        value: "Pro",
        detail: "Track whether your per-trade edge is above similar reports.",
        tone: "blue"
      },
      {
        label: "Profit Factor",
        value: "Pro",
        detail: "See if gross wins are covering gross losses well enough.",
        tone: "gray"
      }
    ];
  }

  const ranked = [...snapshot.metrics]
    .filter((metric) => metric.status !== "unavailable")
    .sort((a, b) => statusPriority(a.status) - statusPriority(b.status));

  const items = ranked.slice(0, 3).map((metric) => {
    const percentileValue = metric.percentile ?? 0;
    return {
      label: metric.label,
      value: metric.percentile ? formatOrdinal(metric.percentile) : "N/A",
      detail: metric.percentile ? `Better than ${number.format(percentileValue)}% of cohort` : metric.insight,
      percentile: percentileValue,
      tone: toneFromPercentile(metric.percentile)
    };
  }) satisfies ReviewBenchmarkTile[];

  return items.length
    ? items
    : [
        {
          label: "Cohort Read",
          value: "Clear",
          detail: snapshot.topInsight,
          tone: "green"
        }
      ];
}

function buildNextReviewChecklist(
  actionItems: Array<{ title: string; impact: string; tone: "red" | "yellow" | "green" | "gray" }>,
  metrics: DiagnosticsResult["metrics"],
  largestLeak: BreakdownRow | undefined,
  priorReport: ReportSummary | undefined
): ReviewLoopItem[] {
  const primaryAction = actionItems[0];
  const targetExpectancy = priorReport ? Math.max(metrics.expectancy, priorReport.expectancy) : Math.max(0, metrics.expectancy);

  return compactDetails<ReviewLoopItem>([
    primaryAction
      ? {
          label: "Fix",
          title: primaryAction.title,
          detail: "Next upload should show whether this fix improved the report.",
          tone: primaryAction.tone
        }
      : undefined,
    largestLeak
      ? {
          label: "Limit",
          title: `Recheck ${largestLeak.group}`,
          detail: `Target less than ${currency.format(Math.abs(largestLeak.netPnl))} of downside from this segment.`,
          tone: largestLeak.netPnl < 0 ? "yellow" : "green"
        }
      : undefined,
    {
      label: "Target",
      title: "Protect expectancy",
      detail: `Next report target: ${currency.format(targetExpectancy)} per trade or better.`,
      tone: metrics.expectancy >= 0 ? "green" : "red"
    },
    {
      label: "Cadence",
      title: "Import after 2-3 sessions",
      detail: "A smaller next sample makes the change easier to confirm.",
      tone: "blue"
    }
  ]).slice(0, 3);
}

function statusPriority(status: AggregateBenchmarkMetric["status"]) {
  if (status === "lagging") return 0;
  if (status === "in_line") return 1;
  if (status === "leading") return 2;
  return 3;
}

function toneFromPercentile(percentileValue: number | undefined): ReviewLoopTone {
  if (percentileValue === undefined) return "gray";
  if (percentileValue < 30) return "red";
  if (percentileValue < 55) return "yellow";
  if (percentileValue < 70) return "blue";
  return "green";
}

function compactDetails<T>(values: Array<T | undefined | false | null>) {
  return values.filter((value): value is T => Boolean(value));
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

function winRateTone(winRate: number): "red" | "yellow" | "green" {
  if (winRate >= 0.5) return "green";
  if (winRate >= 0.45) return "yellow";
  return "red";
}

function profitFactorTone(value: number | undefined): "red" | "yellow" | "green" | "gray" {
  if (typeof value !== "number" || Number.isNaN(value)) return "gray";
  if (value === Infinity || value >= NO_LOSS_PROFIT_FACTOR || value >= 1.5) return "green";
  if (value >= 1) return "yellow";
  return "red";
}

function rMultipleTone(value: number | undefined): "red" | "yellow" | "green" | "gray" {
  if (value === undefined || !Number.isFinite(value)) return "gray";
  if (value >= 1) return "green";
  if (value >= 0.5) return "yellow";
  return "red";
}

function sampleSizeTone(value: number): "red" | "yellow" | "green" | "blue" {
  if (value >= 100) return "green";
  if (value >= 30) return "blue";
  if (value >= 10) return "yellow";
  return "red";
}

function healthScoreCopy(score: number) {
  if (score >= 80) return "Strong edge profile across expectancy, payoff, stability, costs, and sample quality.";
  if (score >= 60) return "Positive edge profile with one or two areas still worth reviewing.";
  if (score >= 40) return "Mixed edge profile. Review weak components before adding size.";
  return "Fragile edge profile. Fix the primary leak before adding trades.";
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

function diagnosisStrength(score: number) {
  if (score < 40) return "Strong";
  if (score < 70) return "Moderate";
  return "Light";
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

function findPriorReport(currentReport: DiagnosticsResult, reports: ReportSummary[]) {
  const currentTime = Date.parse(currentReport.createdAt ?? "");
  if (!Number.isFinite(currentTime)) return undefined;

  return reports
    .filter((report) => report.id !== currentReport.id)
    .map((report) => ({ report, createdTime: Date.parse(report.createdAt) }))
    .filter(({ createdTime }) => Number.isFinite(createdTime) && createdTime < currentTime)
    .sort((left, right) => right.createdTime - left.createdTime)[0]?.report;
}

function buildComparisonRow(
  label: string,
  currentValue: number,
  previousValue: number | undefined,
  formatValue: (value: number) => string
) {
  if (previousValue === undefined || !Number.isFinite(previousValue)) {
    return { label, current: formatValue(currentValue), previous: undefined, delta: "No prior value", tone: "gray" as const };
  }

  const difference = currentValue - previousValue;
  const percentChange = previousValue !== 0 ? difference / Math.abs(previousValue) : undefined;
  const formattedDifference = formatSignedValue(difference, formatValue);
  const formattedPercent = percentChange === undefined ? "" : ` (${formatSignedPercent(percentChange)})`;

  return {
    label,
    current: formatValue(currentValue),
    previous: formatValue(previousValue),
    delta: `${formattedDifference}${formattedPercent}`,
    tone: difference > 0 ? ("green" as const) : difference < 0 ? ("red" as const) : ("gray" as const)
  };
}

function formatSignedValue(value: number, formatValue: (value: number) => string) {
  if (value === 0) return "No change";
  const formatted = formatValue(Math.abs(value));
  return `${value > 0 ? "+" : "-"}${formatted}`;
}

function formatSignedPercent(value: number) {
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : "-"}${percent.format(Math.abs(value))}`;
}

function formatShortDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatAxisCurrency(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return "";
  if (Math.abs(numericValue) >= 1000) return `$${number.format(numericValue / 1000)}K`;
  return currency.format(numericValue);
}

function formatCompactAxisCurrency(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return "";
  const sign = numericValue < 0 ? "-" : "";
  const absoluteValue = Math.abs(numericValue);
  if (absoluteValue >= 1000) return `${sign}$${number.format(absoluteValue / 1000)}K`;
  return `${sign}$${Math.round(absoluteValue)}`;
}

function formatTooltipCurrency(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return String(value ?? "N/A");
  return currency.format(numericValue);
}

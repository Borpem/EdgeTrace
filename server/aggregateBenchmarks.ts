import type {
  AggregateBenchmarkMetric,
  AggregateBenchmarkSnapshot,
  BenchmarkMetricKey,
  BenchmarkMetricUnit,
  BenchmarkMetricStatus,
  DiagnosticsResult,
  ReportSummary
} from "../src/types";

const DEFAULT_MINIMUM_COHORT_SIZE = 5;
const DEFAULT_MAX_REPORT_AGE_DAYS = 540;

type BenchmarkSourceReport = DiagnosticsResult | ReportSummary;

type MetricDefinition = {
  key: BenchmarkMetricKey;
  label: string;
  description: string;
  unit: BenchmarkMetricUnit;
  higherIsBetter: boolean;
  read: (report: BenchmarkSourceReport) => number | undefined;
};

const metricDefinitions: MetricDefinition[] = [
  {
    key: "costDragPct",
    label: "Cost Drag Percentile",
    description: "Compares execution friction against the benchmark cohort.",
    unit: "percent",
    higherIsBetter: false,
    read: readCostDragPct
  },
  {
    key: "averageRealizedR",
    label: "R-Capture Benchmark",
    description: "Shows whether the report captures more planned risk than similar reports.",
    unit: "rMultiple",
    higherIsBetter: true,
    read: readAverageRealizedR
  },
  {
    key: "expectancy",
    label: "Expectancy Benchmark",
    description: "Compares after-cost average PnL per completed trade.",
    unit: "currency",
    higherIsBetter: true,
    read: readExpectancy
  },
  {
    key: "winRate",
    label: "Win Rate Benchmark",
    description: "Compares the share of winning trades against the cohort.",
    unit: "percent",
    higherIsBetter: true,
    read: readWinRate
  },
  {
    key: "profitFactor",
    label: "Profit Factor Benchmark",
    description: "Compares gross winning dollars against gross losing dollars.",
    unit: "number",
    higherIsBetter: true,
    read: readProfitFactor
  }
];

export function buildAggregateBenchmarkSnapshot(
  currentReport: DiagnosticsResult,
  sourceReports: ReportSummary[],
  options?: { minimumCohortSize?: number; maxReportAgeDays?: number; generatedAt?: string }
): AggregateBenchmarkSnapshot {
  const minimumCohortSize = options?.minimumCohortSize ?? DEFAULT_MINIMUM_COHORT_SIZE;
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const cohort = chooseCohort(
    currentReport,
    sourceReports,
    options?.maxReportAgeDays ?? DEFAULT_MAX_REPORT_AGE_DAYS,
    minimumCohortSize
  );
  const metrics = metricDefinitions.map((definition) =>
    buildBenchmarkMetric(definition, currentReport, cohort.reports, minimumCohortSize)
  );

  return {
    accessLevel: "full",
    generatedAt,
    cohortLabel: cohort.label,
    minimumCohortSize,
    sampleSize: cohort.reports.length,
    metrics,
    topInsight: buildTopInsight(metrics, cohort.reports.length, minimumCohortSize),
    privacyNote: "Benchmarks are cohort-level only and require a minimum sample before percentiles are shown."
  };
}

function chooseCohort(
  currentReport: DiagnosticsResult,
  sourceReports: ReportSummary[],
  maxReportAgeDays: number,
  minimumCohortSize: number
): { label: string; reports: ReportSummary[] } {
  const cutoff = Date.now() - maxReportAgeDays * 24 * 60 * 60 * 1000;
  const eligible = sourceReports.filter((report) => isEligibleSourceReport(report, cutoff));
  const reportType = currentReport.reportType && currentReport.reportType !== "unknown" ? currentReport.reportType : "";
  const sameType = reportType ? eligible.filter((report) => report.reportType === reportType) : [];

  if (sameType.length >= minimumCohortSize) {
    return { label: `${formatReportType(reportType)} cohort`, reports: sameType };
  }

  return { label: "All EdgeTrace reports", reports: eligible };
}

function isEligibleSourceReport(report: ReportSummary, cutoff: number) {
  if (!Number.isFinite(report.totalTrades) || report.totalTrades < 5) return false;
  const createdAt = Date.parse(report.createdAt);
  if (Number.isFinite(createdAt) && createdAt < cutoff) return false;
  return true;
}

function buildBenchmarkMetric(
  definition: MetricDefinition,
  currentReport: DiagnosticsResult,
  cohortReports: ReportSummary[],
  minimumCohortSize: number
): AggregateBenchmarkMetric {
  const userValue = definition.read(currentReport);
  const values = cohortReports.map(definition.read).filter(isFiniteNumber);
  const sampleSize = values.length;

  if (!isFiniteNumber(userValue) || sampleSize < minimumCohortSize) {
    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      unit: definition.unit,
      higherIsBetter: definition.higherIsBetter,
      userValue,
      sampleSize,
      status: "unavailable",
      insight:
        sampleSize < minimumCohortSize
          ? `Needs ${minimumCohortSize - sampleSize} more eligible reports before EdgeTrace can show this benchmark.`
          : "This report does not include enough data for this benchmark."
    };
  }

  const percentile = percentileRank(values, userValue, definition.higherIsBetter);
  const status = statusFromPercentile(percentile);

  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    unit: definition.unit,
    higherIsBetter: definition.higherIsBetter,
    userValue,
    populationMedian: median(values),
    percentile,
    sampleSize,
    status,
    insight: benchmarkInsight(definition, percentile, status)
  };
}

function readMetrics(report: BenchmarkSourceReport) {
  return "metrics" in report ? report.metrics : report;
}

function readExpectancy(report: BenchmarkSourceReport) {
  return finiteOrUndefined(readMetrics(report).expectancy);
}

function readWinRate(report: BenchmarkSourceReport) {
  return finiteOrUndefined(readMetrics(report).winRate);
}

function readAverageRealizedR(report: BenchmarkSourceReport) {
  return finiteOrUndefined(readMetrics(report).averageRealizedR);
}

function readProfitFactor(report: BenchmarkSourceReport) {
  return finiteOrUndefined(readMetrics(report).profitFactor);
}

function readCostDragPct(report: BenchmarkSourceReport) {
  const metrics = readMetrics(report);
  const grossBase = Math.abs(metrics.grossPnl);
  if (!Number.isFinite(grossBase) || grossBase <= 0) return undefined;
  const totalCosts = finiteOrUndefined(metrics.totalCosts);
  if (totalCosts === undefined) return undefined;
  return Math.min(Math.max(totalCosts / grossBase, 0), 5);
}

function finiteOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  return sorted[midpoint];
}

function percentileRank(values: number[], value: number, higherIsBetter: boolean) {
  const sorted = [...values].sort((a, b) => a - b);
  const less = sorted.filter((item) => item < value).length;
  const equal = sorted.filter((item) => item === value).length;
  const ascendingRank = ((less + equal * 0.5) / sorted.length) * 100;
  const performanceRank = higherIsBetter ? ascendingRank : 100 - ascendingRank;
  return Math.max(1, Math.min(99, Math.round(performanceRank)));
}

function statusFromPercentile(percentile: number): BenchmarkMetricStatus {
  if (percentile >= 70) return "leading";
  if (percentile <= 30) return "lagging";
  return "in_line";
}

function benchmarkInsight(definition: MetricDefinition, percentile: number, status: BenchmarkMetricStatus) {
  if (status === "leading") {
    return `${definition.label} is stronger than ${percentile}% of the cohort.`;
  }
  if (status === "lagging") {
    return `${definition.label} trails most of the cohort and should be reviewed first.`;
  }
  return `${definition.label} is broadly in line with the cohort.`;
}

function buildTopInsight(metrics: AggregateBenchmarkMetric[], sampleSize: number, minimumCohortSize: number) {
  if (sampleSize < minimumCohortSize) {
    return `Benchmark cohort is warming up. EdgeTrace needs at least ${minimumCohortSize} eligible reports before showing aggregate percentiles.`;
  }

  const available = metrics.filter((metric) => typeof metric.percentile === "number");
  const weakest = [...available].sort((a, b) => (a.percentile ?? 100) - (b.percentile ?? 100))[0];
  if (!weakest) return "Aggregate benchmark data is not available for this report yet.";

  if (weakest.status === "lagging") {
    return `${weakest.label} is the clearest cohort gap. Start there before expanding the review.`;
  }

  const strongest = [...available].sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))[0];
  if (strongest?.status === "leading") {
    return `${strongest.label} is a relative strength versus the cohort. Preserve that behavior while fixing weaker areas.`;
  }

  return "This report is broadly in line with the benchmark cohort. Focus on the dashboard's primary diagnosis next.";
}

function formatReportType(reportType: string) {
  if (reportType === "backtest") return "Backtest";
  if (reportType === "paper") return "Paper trading";
  if (reportType === "live") return "Live trading";
  if (reportType === "imported") return "Imported report";
  return "Report";
}

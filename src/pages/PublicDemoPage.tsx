import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import Papa from "papaparse";
import { DisclosurePanel } from "../components/DisclosurePanel";
import { PageHeader, PageShell } from "../components/ui/Primitives";
import { WorkflowDiagram } from "../components/visuals/WorkflowDiagram";
import {
  breakdownLabels,
  buildBreakdown,
  findLargestLeak,
  type BreakdownDimension,
  type BreakdownRow
} from "../lib/breakdowns";
import { buildComparisonMetrics, costDragPct, type ComparisonMetric } from "../lib/compare";
import { runDiagnostics } from "../lib/diagnostics";
import { normalizeTrades } from "../lib/normalize";
import { buildReportIntelligence } from "../lib/reportIntelligence";
import { trackEvent } from "../lib/analytics";
import type { DiagnosticsResult } from "../types";

type PublicDemoPageProps = {
  isAuthenticated: boolean;
  onAnalyze: () => void;
  onSignup: () => void;
  onPricing: () => void;
  onHowItWorks: () => void;
};

type DemoStep = "diagnose" | "inspect" | "compare" | "monitor" | "start";

type DemoReport = DiagnosticsResult & {
  demoLabel: string;
  demoNote: string;
};

type StepConfig = {
  id: DemoStep;
  number: string;
  title: string;
  shortTitle: string;
  body: string;
  why: string;
  cta: string;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const currencyPrecise = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

const demoSpecs = [
  {
    id: "orb-demo-v1",
    name: "ORB Demo V1",
    label: "V1 Baseline",
    note: "Baseline report with visible execution drag.",
    file: "/sample-trades-breakdown.csv"
  },
  {
    id: "orb-demo-v2",
    name: "ORB Demo V2",
    label: "V2 Lower Costs",
    note: "Follow-up iteration with reduced cost drag.",
    file: "/sample-trades-improved.csv"
  },
  {
    id: "orb-demo-v3",
    name: "ORB Demo V3",
    label: "V3 Higher Selectivity",
    note: "Selective version with fewer weak segments.",
    file: "/sample-trades.csv"
  }
] as const;

const guidedSteps: StepConfig[] = [
  {
    id: "diagnose",
    number: "01",
    title: "Start with the primary diagnosis.",
    shortTitle: "Diagnose",
    body:
      "EdgeTrace turns sample trade history into a diagnostic report showing strategy health, cost drag, expectancy, and the main leak.",
    why: "The first screen should tell a trader what matters before they inspect detail.",
    cta: "Inspect the Leak"
  },
  {
    id: "inspect",
    number: "02",
    title: "Inspect the segment causing the leak.",
    shortTitle: "Inspect",
    body: "Drilldowns show which symbols, strategies, or time windows are contributing most to the issue.",
    why: "Attribution turns a vague problem into a concrete segment to review.",
    cta: "Compare Iterations"
  },
  {
    id: "compare",
    number: "03",
    title: "Compare strategy iterations.",
    shortTitle: "Compare",
    body: "Compare reports to see whether adjustments improved performance, reduced costs, or introduced new leakage.",
    why: "Iteration comparison shows whether a change actually helped after costs.",
    cta: "View Strategy Trend"
  },
  {
    id: "monitor",
    number: "04",
    title: "Monitor strategy health over time.",
    shortTitle: "Monitor",
    body: "Strategy sets track whether a strategy is improving, degrading, or becoming unstable across multiple reports.",
    why: "Ongoing monitoring is where the workflow becomes recurring strategy intelligence.",
    cta: "Start With Your Trades"
  },
  {
    id: "start",
    number: "05",
    title: "Ready to analyze your own trades?",
    shortTitle: "Start",
    body: "You have seen the EdgeTrace workflow on sample data. Create a free account to analyze your own trade history.",
    why: "Free includes the complete workflow. Pro adds coaching, alerts, simulations, and Edge Score.",
    cta: "Create Free Account"
  }
];

export function PublicDemoPage({
  isAuthenticated,
  onAnalyze,
  onSignup,
  onPricing,
  onHowItWorks
}: PublicDemoPageProps) {
  const [reports, setReports] = useState<DemoReport[]>([]);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState<DemoStep>("diagnose");
  const [completedSteps, setCompletedSteps] = useState<DemoStep[]>([]);
  const [drilldownDimension, setDrilldownDimension] = useState<BreakdownDimension>("timeOfDay");
  const [selectedGroup, setSelectedGroup] = useState<string>("");

  useEffect(() => {
    trackEvent("public_demo_opened");
    let active = true;
    void Promise.all(demoSpecs.map(loadDemoReport))
      .then((loadedReports) => {
        if (!active) return;
        setReports(loadedReports);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load public demo data.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    trackEvent("public_demo_step_viewed", { step: activeStep });
  }, [activeStep]);

  const primaryReport = reports[0];
  const compareA = reports[0];
  const compareB = reports[1] ?? reports[0];
  const intelligence = useMemo(() => (primaryReport ? buildReportIntelligence(primaryReport) : null), [primaryReport]);
  const drilldownRows = useMemo(
    () => (primaryReport ? buildBreakdown(primaryReport.trades, drilldownDimension) : []),
    [drilldownDimension, primaryReport]
  );
  const recommendedRow = useMemo(() => getRecommendedRow(drilldownRows, drilldownDimension), [drilldownDimension, drilldownRows]);
  const selectedRow = useMemo(
    () => drilldownRows.find((row) => row.group === selectedGroup) ?? recommendedRow ?? drilldownRows[0],
    [drilldownRows, recommendedRow, selectedGroup]
  );
  const comparisonMetrics = useMemo(
    () => (compareA && compareB ? buildComparisonMetrics(compareA, compareB) : []),
    [compareA, compareB]
  );
  const trend = useMemo(() => buildStrategyTrend(reports), [reports]);
  const activeConfig = guidedSteps.find((step) => step.id === activeStep) ?? guidedSteps[0];
  const activeIndex = guidedSteps.findIndex((step) => step.id === activeStep);
  const progressPct = ((activeIndex + 1) / guidedSteps.length) * 100;

  const markStepComplete = (step: DemoStep) => {
    setCompletedSteps((current) => {
      if (current.includes(step)) return current;
      trackEvent("public_demo_step_completed", { step });
      return [...current, step];
    });
  };

  const goToStep = (step: DemoStep, source: string) => {
    setActiveStep(step);
    trackEvent("public_demo_step_viewed", { step, source });
  };

  const completeAndGo = (current: DemoStep, next: DemoStep, cta: string) => {
    markStepComplete(current);
    trackEvent("public_demo_primary_cta_clicked", { step: current, cta });
    goToStep(next, "primary_cta");
  };

  const selectDrilldownRow = (row: BreakdownRow) => {
    setSelectedGroup(row.group);
    markStepComplete("inspect");
    trackEvent("demo_drilldown_clicked", { dimension: drilldownDimension, group: row.group });
    trackEvent("public_demo_step_completed", { step: "inspect", action: "drilldown_row_clicked" });
  };

  const handleDimensionChange = (dimension: BreakdownDimension) => {
    setDrilldownDimension(dimension);
    setSelectedGroup("");
  };

  const trackCta = (cta: string, action: () => void) => {
    trackEvent("public_demo_primary_cta_clicked", { step: "start", cta });
    if (cta === "create_account") trackEvent("demo_signup_clicked");
    if (cta === "analyze_trades") trackEvent("demo_analyze_trades_clicked");
    action();
  };

  return (
    <PageShell>
      <PageHeader
        title="Follow the path from trade history to strategy insight."
        subtitle="A guided Pro preview using sample data: diagnose the report, inspect the leak, compare iterations, then monitor the strategy trend."
        aside={
          <aside className="border border-cyan/30 bg-cyan/[0.045] p-5">
            <p className="text-sm font-semibold text-ink">Interactive Demo</p>
            <p className="mt-1 text-sm text-muted">Sample data - no account required.</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">
              {primaryReport ? `${primaryReport.metrics.totalTrades} trades analyzed` : "Loading sample"}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              No database writes. No real broker data. This walkthrough previews the Pro value loop only.
            </p>
          </aside>
        }
      />

      {error && <section className="mt-6 border border-loss/50 bg-loss/10 p-5 text-sm text-loss">{error}</section>}

      {!primaryReport || !intelligence || !compareA || !compareB ? (
        <section className="mt-6 border border-white/[0.1] bg-white/[0.025] p-8">
          <p className="font-semibold text-ink">Loading guided demo...</p>
          <p className="mt-2 text-sm text-muted">EdgeTrace is preparing the sample diagnostic workflow.</p>
        </section>
      ) : (
        <section className="mt-6 border border-white/[0.1] bg-white/[0.025]">
          <GuidedStepper
            activeStep={activeStep}
            completedSteps={completedSteps}
            onSelectStep={(step) => goToStep(step, "stepper")}
          />

          <div className="h-px bg-white/[0.1]">
            <div className="h-px bg-cyan transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <WorkflowDiagram
            steps={["Diagnose", "Inspect", "Compare", "Monitor", "Start"]}
            activeIndex={activeIndex}
            compact
            className="border-x-0 border-t-0"
          />

          <section className="grid gap-0 xl:grid-cols-[360px_1fr]">
            <StepContextPanel
              config={activeConfig}
              activeIndex={activeIndex}
              onPrimary={() => {
                if (activeStep === "diagnose") completeAndGo("diagnose", "inspect", "Inspect the Leak");
                if (activeStep === "inspect") completeAndGo("inspect", "compare", "Compare Iterations");
                if (activeStep === "compare") completeAndGo("compare", "monitor", "View Strategy Trend");
                if (activeStep === "monitor") completeAndGo("monitor", "start", "Start With Your Trades");
                if (activeStep === "start") trackCta("create_account", onSignup);
              }}
              onHowItWorks={onHowItWorks}
            />

            <div className="min-w-0 border-t border-white/[0.1] p-5 md:p-6 xl:border-l xl:border-t-0">
              {activeStep === "diagnose" && (
                <DiagnoseStep
                  report={primaryReport}
                  intelligence={intelligence}
                  onInspect={() => completeAndGo("diagnose", "inspect", "Inspect the Leak")}
                />
              )}
              {activeStep === "inspect" && (
                <InspectStep
                  dimension={drilldownDimension}
                  rows={drilldownRows}
                  recommendedRow={recommendedRow}
                  selectedRow={selectedRow}
                  onDimensionChange={handleDimensionChange}
                  onSelectRow={selectDrilldownRow}
                  onCompare={() => completeAndGo("inspect", "compare", "Compare Iterations")}
                />
              )}
              {activeStep === "compare" && (
                <CompareStep
                  reportA={compareA}
                  reportB={compareB}
                  metrics={comparisonMetrics}
                  onMonitor={() => completeAndGo("compare", "monitor", "View Strategy Trend")}
                />
              )}
              {activeStep === "monitor" && (
                <MonitorStep
                  reports={reports}
                  trend={trend}
                  onStart={() => completeAndGo("monitor", "start", "Start With Your Trades")}
                />
              )}
              {activeStep === "start" && (
                <StartStep
                  isAuthenticated={isAuthenticated}
                  onSignup={() => trackCta("create_account", onSignup)}
                  onAnalyze={() => trackCta("analyze_trades", onAnalyze)}
                  onPricing={() => trackCta("pricing", onPricing)}
                />
              )}
            </div>
          </section>
        </section>
      )}
    </PageShell>
  );
}

function GuidedStepper({
  activeStep,
  completedSteps,
  onSelectStep
}: {
  activeStep: DemoStep;
  completedSteps: DemoStep[];
  onSelectStep: (step: DemoStep) => void;
}) {
  return (
    <div className="grid md:grid-cols-5">
      {guidedSteps.map((step) => {
        const active = activeStep === step.id;
        const complete = completedSteps.includes(step.id);
        return (
          <button
            key={step.id}
            className={`border-b border-r border-white/[0.08] p-4 text-left transition last:border-r-0 ${
              active ? "bg-cyan/[0.075] shadow-[0_0_42px_-36px_rgba(88,214,255,0.95)]" : "bg-black/20 hover:bg-white/[0.025]"
            }`}
            onClick={() => onSelectStep(step.id)}
          >
            <span className="flex items-center justify-between gap-3">
              <span className={active ? "text-xs font-semibold uppercase tracking-[0.24em] text-cyan" : "text-xs font-semibold uppercase tracking-[0.24em] text-muted"}>
                {step.number}
              </span>
              {complete && (
                <span className="grid h-5 w-5 place-items-center border border-cyan bg-cyan text-black">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className={active ? "mt-3 block text-lg font-semibold text-ink" : "mt-3 block text-sm font-semibold text-muted"}>
              {step.shortTitle}
            </span>
            <span className={active ? "mt-2 block text-xs leading-5 text-muted" : "mt-2 hidden text-xs leading-5 text-muted lg:block"}>
              {step.why}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StepContextPanel({
  config,
  activeIndex,
  onPrimary,
  onHowItWorks
}: {
  config: StepConfig;
  activeIndex: number;
  onPrimary: () => void;
  onHowItWorks: () => void;
}) {
  return (
    <aside className="bg-black/34 p-5 md:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">
        Step {activeIndex + 1} of {guidedSteps.length}
      </p>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-ink">{config.title}</h2>
      <p className="mt-4 text-sm leading-6 text-muted">{config.body}</p>
      <DisclosurePanel className="mt-6" title="Why this matters" subtitle="Open for context." compact>
        <p className="text-sm leading-6 text-muted">{config.why}</p>
      </DisclosurePanel>
      <button className="EdgeTrace-command-button mt-7 w-full justify-between" onClick={onPrimary}>
        {config.cta} <ArrowRight size={16} />
      </button>
      <button className="mt-4 border-b border-cyan/50 text-sm font-semibold text-cyan hover:text-ink" onClick={onHowItWorks}>
        Learn how EdgeTrace works
      </button>
    </aside>
  );
}

function DiagnoseStep({
  report,
  intelligence,
  onInspect
}: {
  report: DemoReport;
  intelligence: ReturnType<typeof buildReportIntelligence>;
  onInspect: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.055em] text-ink">Essential report summary</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Dense details stay hidden until they matter. This step shows only the diagnosis a trader needs first.
          </p>
        </div>
        <span className="border border-cyan/35 bg-cyan/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
          Workflow preview
        </span>
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="relative overflow-hidden border border-white/[0.12] bg-white/[0.035] p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_28%,rgba(88,214,255,0.12),transparent_16rem)]" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy Health</p>
            <p className="mt-6 text-8xl font-semibold leading-none tracking-[-0.08em] text-ink">
              {intelligence.strategyHealthScore}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">{intelligence.healthBand}</p>
            <p className="mt-5 text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
          </div>
        </div>

        <div className="border border-white/[0.12] bg-white/[0.035] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">Primary Diagnosis</p>
          <h3 className="mt-5 text-3xl font-semibold tracking-[-0.055em] text-ink">{intelligence.primaryDiagnosis}</h3>
          <p className="mt-4 text-sm leading-6 text-muted">{intelligence.primaryLeak.explanation}</p>
          <div className="mt-6 border border-cyan/25 bg-cyan/[0.04] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Where to Look Next</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">{intelligence.primaryLeak.recommendedInspection}</p>
            <p className="mt-1 text-sm text-muted">{intelligence.primaryLeak.supportingMetric}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DemoMetric label="Net PnL" value={currency.format(report.metrics.netPnl)} detail="After costs" />
        <DemoMetric label="Expectancy" value={currencyPrecise.format(report.metrics.expectancy)} detail="Per trade" />
        <DemoMetric label="Cost Drag" value={intelligence.costDragLabel} detail={`Costs ${currency.format(report.metrics.totalCosts)}`} />
        <DemoMetric
          label="R Capture"
          value={report.metrics.averageRealizedR === undefined ? "Unavailable" : `${decimal.format(report.metrics.averageRealizedR)}R`}
          detail={`Win rate ${percent.format(report.metrics.winRate)}`}
        />
      </section>

      <button className="EdgeTrace-command-button mt-5" onClick={onInspect}>
        Inspect the Leak <ArrowRight size={16} />
      </button>
    </div>
  );
}

function InspectStep({
  dimension,
  rows,
  recommendedRow,
  selectedRow,
  onDimensionChange,
  onSelectRow,
  onCompare
}: {
  dimension: BreakdownDimension;
  rows: BreakdownRow[];
  recommendedRow?: BreakdownRow;
  selectedRow?: BreakdownRow;
  onDimensionChange: (dimension: BreakdownDimension) => void;
  onSelectRow: (row: BreakdownRow) => void;
  onCompare: () => void;
}) {
  const visibleRows = getVisibleRows(rows, recommendedRow);

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.055em] text-ink">Start with the recommended segment.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            The demo defaults to a single attribution lens, then lets you switch dimensions if you want to explore.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["timeOfDay", "symbol", "strategy"] as BreakdownDimension[]).map((item) => (
            <button
              key={item}
              className={`border px-3 py-2 text-sm font-semibold ${
                dimension === item ? "border-cyan/60 bg-cyan/[0.08] text-cyan" : "border-white/[0.12] text-muted hover:border-white/25 hover:text-ink"
              }`}
              onClick={() => onDimensionChange(item)}
            >
              {breakdownLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          {visibleRows.map((row, index) => {
            const selected = selectedRow?.group === row.group;
            const recommended = recommendedRow?.group === row.group;
            return (
              <button
                key={row.group}
                className={`w-full border p-4 text-left transition ${
                  selected
                    ? "border-cyan/55 bg-cyan/[0.075] shadow-[0_0_38px_-32px_rgba(88,214,255,0.9)]"
                    : "border-white/[0.1] bg-white/[0.025] hover:border-white/25"
                }`}
                onClick={() => onSelectRow(row)}
              >
                <span className="flex items-start justify-between gap-4">
                  <span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
                      {recommended ? "Recommended" : `Segment ${index + 1}`}
                    </span>
                    <span className="mt-2 block text-xl font-semibold tracking-[-0.04em] text-ink">
                      {displayGroupName(row.group)}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-muted">
                      {row.totalTrades} trades · {currencyPrecise.format(row.expectancy)} expectancy · {row.costDrag.label}
                    </span>
                  </span>
                  <span className={row.netPnl >= 0 ? "text-sm font-semibold text-cyan" : "text-sm font-semibold text-loss"}>
                    {currency.format(row.netPnl)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="border border-cyan/30 bg-cyan/[0.045] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Attribution detail</p>
          {selectedRow ? (
            <>
              <h3 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-ink">
                {displayGroupName(selectedRow.group)}
              </h3>
              <p className="mt-4 text-sm leading-6 text-muted">
                {selectedRow.netPnl < 0
                  ? "This segment is weakening the sample report. In the full product, this is where you would inspect exact trades and leakage drivers."
                  : "This segment is contributing positively. In the full product, you would compare whether it stays strong across iterations."}
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <MetricMini label="Net PnL" value={currency.format(selectedRow.netPnl)} />
                <MetricMini label="Win rate" value={percent.format(selectedRow.winRate)} />
                <MetricMini
                  label="Average R"
                  value={selectedRow.averageRealizedR === undefined ? "Unavailable" : `${decimal.format(selectedRow.averageRealizedR)}R`}
                />
                <MetricMini
                  label="Net/gross conversion"
                  value={selectedRow.netToGrossPct === undefined ? "Unavailable" : percent.format(selectedRow.netToGrossPct)}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Select the recommended row to inspect the segment behind the leak.</p>
          )}
        </div>
      </section>

      <button className="EdgeTrace-command-button mt-5" onClick={onCompare}>
        Compare Iterations <ArrowRight size={16} />
      </button>
    </div>
  );
}

function CompareStep({
  reportA,
  reportB,
  metrics,
  onMonitor
}: {
  reportA: DemoReport;
  reportB: DemoReport;
  metrics: ComparisonMetric[];
  onMonitor: () => void;
}) {
  const keyMetrics = ["expectancy", "costDragPct", "averageRealizedR"]
    .map((key) => metrics.find((metric) => metric.key === key))
    .filter((metric): metric is ComparisonMetric => Boolean(metric));

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.055em] text-ink">V1 Baseline vs V2 Lower Costs</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            The demo keeps this comparison focused on the three deltas that explain the iteration.
          </p>
        </div>
        <span className="border border-cyan/35 bg-cyan/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
          Workflow preview
        </span>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <ReportSnapshot report={reportA} />
        <ReportSnapshot report={reportB} />
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {keyMetrics.map((metric) => (
          <DeltaCard key={metric.key} metric={metric} />
        ))}
      </section>

      <section className="mt-5 border border-cyan/30 bg-cyan/[0.045] p-5">
        <p className="max-w-4xl text-xl font-semibold leading-8 tracking-[-0.035em] text-ink">
          V2 improved because cost drag fell and R capture increased.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          In the full workflow, EdgeTrace lets you compare saved reports to see whether changes reduced leakage or
          introduced new weaknesses.
        </p>
      </section>

      <button className="EdgeTrace-command-button mt-5" onClick={onMonitor}>
        View Strategy Trend <ArrowRight size={16} />
      </button>
    </div>
  );
}

function MonitorStep({
  reports,
  trend,
  onStart
}: {
  reports: DemoReport[];
  trend: ReturnType<typeof buildStrategyTrend>;
  onStart: () => void;
}) {
  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.055em] text-ink">One strategy, three iterations.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Strategy sets turn individual reports into a monitoring workflow.
          </p>
        </div>
        <span className="border border-cyan/35 bg-cyan/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
          Workflow preview
        </span>
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-white/[0.1] bg-white/[0.025] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Strategy health trend</p>
          <svg className="mt-5 h-64 w-full" viewBox="0 0 680 260" fill="none" role="img" aria-label="Strategy health trend">
            <path d="M40 34H650M40 92H650M40 150H650M40 208H650" stroke="white" strokeOpacity=".08" />
            <polyline points={trend.points} fill="none" stroke="#58D6FF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            {trend.markers.map((marker) => (
              <g key={marker.label}>
                <circle cx={marker.x} cy={marker.y} r="6" fill="#58D6FF" />
                <text x={marker.x} y="242" textAnchor="middle" fill="#9b9b95" fontSize="12" fontWeight="700">
                  {marker.label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="grid gap-4">
          <div className="border border-cyan/30 bg-cyan/[0.045] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Latest health status</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">{trend.insightTitle}</h3>
            <p className="mt-3 text-sm leading-6 text-muted">{trend.insight}</p>
          </div>
          <div className="border border-white/[0.1] bg-white/[0.025] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-warning">Current vs best</p>
            <p className="mt-3 text-sm leading-6 text-muted">{trend.currentVsBest}</p>
          </div>
          <div className="border border-white/[0.1] bg-white/[0.025] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-warning">Watchlist teaser</p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Pro strategy monitoring flags recurring cost drag, expectancy deterioration, and unstable segment behavior.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-3">
        {reports.map((report) => {
          const score = buildReportIntelligence(report).strategyHealthScore;
          return (
            <div key={report.id} className="border border-white/[0.1] bg-white/[0.025] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{report.demoLabel}</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">{score}</p>
              <p className="mt-2 text-sm text-muted">{report.demoNote}</p>
            </div>
          );
        })}
      </section>

      <button className="EdgeTrace-command-button mt-5" onClick={onStart}>
        Start With Your Trades <ArrowRight size={16} />
      </button>
    </div>
  );
}

function StartStep({
  isAuthenticated,
  onSignup,
  onAnalyze,
  onPricing
}: {
  isAuthenticated: boolean;
  onSignup: () => void;
  onAnalyze: () => void;
  onPricing: () => void;
}) {
  return (
    <section className="border border-cyan/30 bg-cyan/[0.045] p-6 md:p-8">
      <h2 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.065em] text-ink">
        Ready to analyze your own trades?
      </h2>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
        You have seen the EdgeTrace workflow on sample data. Create a free account to analyze your own trade history.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        {!isAuthenticated && (
          <button className="EdgeTrace-command-button" onClick={onSignup}>
            Create Free Account <ArrowRight size={16} />
          </button>
        )}
        <button className="EdgeTrace-secondary-button" onClick={onAnalyze}>
          {isAuthenticated ? "Create Your Own Report" : "Import My Trades"}
        </button>
        <button className="EdgeTrace-secondary-button" onClick={onPricing}>
          View Pricing
        </button>
      </div>
    </section>
  );
}

function DemoMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-white/[0.1] bg-white/[0.025] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-ink">{value}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/[0.08] bg-black/25 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function ReportSnapshot({ report }: { report: DemoReport }) {
  const intelligence = buildReportIntelligence(report);
  return (
    <div className="border border-white/[0.1] bg-white/[0.025] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{report.demoLabel}</p>
      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">{report.name}</h3>
      <p className="mt-3 text-sm leading-6 text-muted">{report.demoNote}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <MetricMini label="Health" value={String(intelligence.strategyHealthScore)} />
        <MetricMini label="Net PnL" value={currency.format(report.metrics.netPnl)} />
      </div>
    </div>
  );
}

function DeltaCard({ metric }: { metric: ComparisonMetric }) {
  return (
    <div className="border border-white/[0.1] bg-white/[0.025] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{metric.label}</p>
      <p
        className={
          metric.status === "Improved"
            ? "mt-4 text-4xl font-semibold tracking-[-0.06em] text-cyan"
            : metric.status === "Degraded"
              ? "mt-4 text-4xl font-semibold tracking-[-0.06em] text-loss"
              : "mt-4 text-4xl font-semibold tracking-[-0.06em] text-ink"
        }
      >
        {formatDelta(metric.delta, metric.format)}
      </p>
      <p className="mt-2 text-sm text-muted">{metric.status}</p>
    </div>
  );
}

async function loadDemoReport(spec: (typeof demoSpecs)[number]): Promise<DemoReport> {
  const response = await fetch(spec.file);
  if (!response.ok) throw new Error(`Unable to load ${spec.file}`);
  const parsed = Papa.parse<unknown[]>(await response.text(), { header: false, skipEmptyLines: true });
  const trades = normalizeTrades(parsed.data);
  const diagnostics = runDiagnostics(spec.id, trades);
  return {
    ...diagnostics,
    id: spec.id,
    name: spec.name,
    demoLabel: spec.label,
    demoNote: spec.note,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategyLabel: "ORB Demo Strategy",
    reportType: "imported",
    tags: ["demo", "public-preview"],
    importProvenance: {
      originalFilename: spec.file.replace("/", ""),
      importedAt: new Date().toISOString(),
      detectedSource: "Generic CSV",
      selectedSource: "Generic CSV",
      brokerId: "generic_csv",
      brokerDisplayName: "Generic CSV",
      detectionConfidence: 0.92,
      confidenceLabel: "Ready",
      mappedFieldsCount: 10,
      normalizedTradeCount: trades.length,
      excludedRowCount: 0,
      warningCount: 0,
      costsDetected: true,
      rMultipleDetected: trades.some((trade) => trade.realizedR !== undefined),
      reconstructionEnabled: false
    }
  };
}

function getRecommendedRow(rows: BreakdownRow[], dimension: BreakdownDimension) {
  if (!rows.length) return undefined;
  if (dimension === "timeOfDay") {
    return rows.find((row) => row.group === "Open 09:30-10:30") ?? findLargestLeak(rows);
  }
  if (dimension === "symbol") {
    return rows.find((row) => row.group === "QQQ") ?? findLargestLeak(rows);
  }
  return findLargestLeak(rows);
}

function getVisibleRows(rows: BreakdownRow[], recommendedRow: BreakdownRow | undefined) {
  if (!recommendedRow) return rows.slice(0, 4);
  const sorted = [...rows].sort((a, b) => a.netPnl - b.netPnl).filter((row) => row.group !== recommendedRow.group);
  return [recommendedRow, ...sorted].slice(0, 4);
}

function displayGroupName(group: string) {
  if (group === "Open 09:30-10:30") return "Opening Session";
  if (group === "Midday 10:30-14:00") return "Midday Session";
  if (group === "Power Hour 14:00-16:00") return "Power Hour";
  return group;
}

function buildStrategyTrend(reports: DemoReport[]) {
  const scored = reports.map((report) => ({
    report,
    score: buildReportIntelligence(report).strategyHealthScore,
    costDrag: costDragPct(report),
    expectancy: report.metrics.expectancy,
    averageR: report.metrics.averageRealizedR
  }));
  const scores = scored.map((item) => item.score);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const span = max - min || 1;
  const markers = scored.map((item, index) => {
    const x = 70 + index * 250;
    const y = 208 - ((item.score - min) / span) * 170;
    return { x, y, label: item.report.demoLabel.replace(" ", " ") };
  });
  const first = scored[0];
  const latest = scored[scored.length - 1];
  const best = [...scored].sort((a, b) => b.score - a.score)[0];
  const expectancyImproved = first && latest ? latest.expectancy > first.expectancy : false;
  const costDragImproved =
    first?.costDrag !== undefined && latest?.costDrag !== undefined ? latest.costDrag < first.costDrag : false;
  const latestScore = latest?.score ?? 0;
  const bestScore = best?.score ?? latestScore;
  const scoreGap = bestScore - latestScore;

  return {
    points: markers.map((marker) => `${marker.x.toFixed(1)},${marker.y.toFixed(1)}`).join(" "),
    markers,
    insightTitle: expectancyImproved || costDragImproved ? "Improving, with watchlist items." : "Needs strategy review.",
    insight:
      expectancyImproved || costDragImproved
        ? "The latest sample iteration improved versus baseline, while remaining weak segments still deserve monitoring."
        : "The latest sample iteration does not clearly outperform the baseline. EdgeTrace would flag this for deeper review.",
    currentVsBest:
      scoreGap <= 2
        ? "The current sample iteration is near the best observed health score."
        : `The current sample iteration is ${decimal.format(scoreGap)} points below the best observed health score.`
  };
}

function formatDelta(value: number | undefined, format: "currency" | "number" | "percent") {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  if (format === "currency") return `${sign}${currencyPrecise.format(value)}`;
  if (format === "percent") return `${sign}${percent.format(value)}`;
  return `${sign}${decimal.format(value)}`;
}

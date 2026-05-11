import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import Papa from "papaparse";
import {
  breakdownLabels,
  buildBreakdown,
  findLargestLeak,
  type BreakdownDimension,
  type BreakdownRow
} from "../lib/breakdowns";
import { buildComparisonMetrics, buildInterpretation, costDragPct } from "../lib/compare";
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

type DemoTab = "diagnostic" | "drilldowns" | "compare" | "strategy";
type DemoStep = "diagnosis" | "drilldown" | "compare" | "strategy";

type DemoReport = DiagnosticsResult & {
  demoLabel: string;
  demoNote: string;
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

const guideSteps: Array<{ id: DemoStep; title: string; tab: DemoTab; cta: string }> = [
  { id: "diagnosis", title: "Review the primary diagnosis", tab: "diagnostic", cta: "Review Diagnosis" },
  { id: "drilldown", title: "Click a drilldown row", tab: "drilldowns", cta: "Inspect Cost Drag" },
  { id: "compare", title: "Compare V1 vs V2", tab: "compare", cta: "Compare Iterations" },
  { id: "strategy", title: "View the strategy health trend", tab: "strategy", cta: "View Strategy Trend" }
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
  const [activeTab, setActiveTab] = useState<DemoTab>("diagnostic");
  const [completedSteps, setCompletedSteps] = useState<Set<DemoStep>>(() => new Set(["diagnosis"]));
  const [drilldownDimension, setDrilldownDimension] = useState<BreakdownDimension>("symbol");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [compareAId, setCompareAId] = useState("orb-demo-v1");
  const [compareBId, setCompareBId] = useState("orb-demo-v2");

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

  const primaryReport = reports[0];
  const intelligence = useMemo(() => (primaryReport ? buildReportIntelligence(primaryReport) : null), [primaryReport]);
  const drilldownRows = useMemo(
    () => (primaryReport ? buildBreakdown(primaryReport.trades, drilldownDimension) : []),
    [drilldownDimension, primaryReport]
  );
  const selectedRow = useMemo(
    () => drilldownRows.find((row) => row.group === selectedGroup) ?? drilldownRows[0],
    [drilldownRows, selectedGroup]
  );
  const compareA = reports.find((report) => report.id === compareAId) ?? reports[0];
  const compareB = reports.find((report) => report.id === compareBId) ?? reports[1] ?? reports[0];
  const comparisonMetrics = useMemo(
    () => (compareA && compareB ? buildComparisonMetrics(compareA, compareB) : []),
    [compareA, compareB]
  );
  const comparisonInterpretation = useMemo(() => buildInterpretation(comparisonMetrics), [comparisonMetrics]);
  const trend = useMemo(() => buildStrategyTrend(reports), [reports]);

  const markStep = (step: DemoStep) => {
    setCompletedSteps((current) => new Set([...current, step]));
  };

  const openTab = (tab: DemoTab, source: string) => {
    setActiveTab(tab);
    if (tab === "diagnostic") markStep("diagnosis");
    if (tab === "compare") {
      markStep("compare");
      trackEvent("demo_compare_used", { source });
    }
    if (tab === "strategy") {
      markStep("strategy");
      trackEvent("demo_strategy_trend_viewed", { source });
    }
  };

  const selectDrilldownRow = (row: BreakdownRow) => {
    setSelectedGroup(row.group);
    markStep("drilldown");
    trackEvent("demo_drilldown_clicked", { dimension: drilldownDimension, group: row.group });
  };

  const handleDimensionChange = (dimension: BreakdownDimension) => {
    setDrilldownDimension(dimension);
    setSelectedGroup("");
    openTab("drilldowns", "dimension");
  };

  const trackCta = (cta: string, action: () => void) => {
    trackEvent("public_demo_cta_clicked", { cta });
    if (cta === "create_account") trackEvent("demo_signup_clicked");
    if (cta === "analyze_trades") trackEvent("demo_analyze_trades_clicked");
    action();
  };

  return (
    <main className="EdgeTrace-shell py-10 md:py-14">
      <section className="border-y border-white/[0.1] py-10">
        <div className="grid gap-8 xl:grid-cols-[1fr_380px] xl:items-end">
          <div>
            <p className="EdgeTrace-eyebrow">Interactive Demo</p>
            <h1 className="EdgeTrace-title">Experience the EdgeTrace Pro workflow with sample trades.</h1>
            <p className="EdgeTrace-copy">
              Demo unlocks a preview of Pro features using sample data. Diagnose a report, inspect attribution,
              compare iterations, and preview strategy monitoring without an account.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {!isAuthenticated && (
                <button className="EdgeTrace-primary-button" onClick={() => trackCta("create_account", onSignup)}>
                  Create Free Account <ArrowRight size={16} />
                </button>
              )}
              <button className="EdgeTrace-secondary-button" onClick={() => trackCta("analyze_trades", onAnalyze)}>
                {isAuthenticated ? "Create Your Own Report" : "Analyze My Trades"}
              </button>
              <button className="EdgeTrace-secondary-button" onClick={() => trackCta("pricing", onPricing)}>
                View Pricing
              </button>
            </div>
          </div>
          <aside className="border border-cyan/30 bg-cyan/[0.045] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">
              Sample data - no account required.
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">
              {primaryReport ? `${primaryReport.metrics.totalTrades} trades analyzed` : "Loading sample"}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              No database writes. No real broker data. This sandbox is only a guided Pro workflow preview.
            </p>
          </aside>
        </div>
      </section>

      {error && <section className="mt-6 border border-loss/50 bg-loss/10 p-5 text-sm text-loss">{error}</section>}

      {!primaryReport || !intelligence ? (
        <section className="mt-6 border border-white/[0.1] bg-white/[0.025] p-8">
          <p className="font-semibold text-ink">Loading demo workspace...</p>
          <p className="mt-2 text-sm text-muted">EdgeTrace is preparing the sample diagnostic reports.</p>
        </section>
      ) : (
        <>
          <section className="mt-6 grid gap-5 xl:grid-cols-[380px_1fr]">
            <DemoGuide
              activeTab={activeTab}
              completedSteps={completedSteps}
              onOpenTab={(tab) => openTab(tab, "guide")}
              onHowItWorks={onHowItWorks}
            />

            <section className="min-w-0 border border-white/[0.1] bg-white/[0.025]">
              <div className="flex flex-wrap border-b border-white/[0.1]">
                {[
                  ["diagnostic", "Diagnostic Report"],
                  ["drilldowns", "Drilldowns"],
                  ["compare", "Compare"],
                  ["strategy", "Strategy Set Preview"]
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    className={`border-r border-white/[0.08] px-4 py-3 text-sm font-semibold ${
                      activeTab === tab ? "bg-cyan/[0.08] text-cyan" : "text-muted hover:bg-white/[0.035] hover:text-ink"
                    }`}
                    onClick={() => openTab(tab as DemoTab, "tab")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-5 md:p-6">
                {activeTab === "diagnostic" && (
                  <DiagnosticDemoSection report={primaryReport} intelligence={intelligence} onInspect={() => openTab("drilldowns", "diagnostic_cta")} />
                )}
                {activeTab === "drilldowns" && (
                  <DrilldownDemoSection
                    dimension={drilldownDimension}
                    rows={drilldownRows}
                    selectedRow={selectedRow}
                    onDimensionChange={handleDimensionChange}
                    onSelectRow={selectDrilldownRow}
                  />
                )}
                {activeTab === "compare" && compareA && compareB && (
                  <CompareDemoSection
                    reports={reports}
                    reportA={compareA}
                    reportB={compareB}
                    reportAId={compareAId}
                    reportBId={compareBId}
                    metrics={comparisonMetrics}
                    interpretation={comparisonInterpretation}
                    onSelectA={(id) => {
                      setCompareAId(id);
                      markStep("compare");
                      trackEvent("demo_compare_used", { action: "select_report_a" });
                    }}
                    onSelectB={(id) => {
                      setCompareBId(id);
                      markStep("compare");
                      trackEvent("demo_compare_used", { action: "select_report_b" });
                    }}
                  />
                )}
                {activeTab === "strategy" && <StrategyTrendDemoSection reports={reports} trend={trend} />}
              </div>
            </section>
          </section>

          <section className="mt-8 border border-cyan/30 bg-cyan/[0.045] p-6">
            <p className="EdgeTrace-eyebrow">Ready for your own trades?</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">
              You have seen the Pro workflow on sample data.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              Create a free account to analyze your own completed trades. Free includes one full diagnostic report;
              Pro unlocks the full strategy workflow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {!isAuthenticated && (
                <button className="EdgeTrace-command-button" onClick={() => trackCta("create_account", onSignup)}>
                  Create Free Account <ArrowRight size={16} />
                </button>
              )}
              <button className="EdgeTrace-secondary-button" onClick={() => trackCta("analyze_trades", onAnalyze)}>
                {isAuthenticated ? "Create Your Own Report" : "Analyze My Trades"}
              </button>
              <button className="EdgeTrace-secondary-button" onClick={onHowItWorks}>
                Learn How It Works
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function DemoGuide({
  activeTab,
  completedSteps,
  onOpenTab,
  onHowItWorks
}: {
  activeTab: DemoTab;
  completedSteps: Set<DemoStep>;
  onOpenTab: (tab: DemoTab) => void;
  onHowItWorks: () => void;
}) {
  return (
    <aside className="border border-cyan/25 bg-black/42 p-5 shadow-[0_0_42px_-34px_rgba(88,214,255,0.9)]">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Try the core workflow</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">
        {"Diagnose -> inspect -> compare -> monitor."}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted">
        This public sandbox previews Pro workflows with sample data. Follow the prompts or explore the tabs directly.
      </p>
      <div className="mt-5 space-y-3">
        {guideSteps.map((step) => {
          const complete = completedSteps.has(step.id);
          const active = activeTab === step.tab;
          return (
            <button
              key={step.id}
              className={`w-full border p-4 text-left transition ${
                active
                  ? "border-cyan/55 bg-cyan/[0.07] shadow-[0_0_40px_-34px_rgba(88,214,255,0.9)]"
                  : "border-white/[0.1] bg-white/[0.025] hover:border-white/25"
              }`}
              onClick={() => onOpenTab(step.tab)}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                    {complete ? "Complete" : active ? "Active" : "Next"}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-ink">{step.title}</span>
                </span>
                {complete && (
                  <span className="grid h-6 w-6 place-items-center border border-cyan bg-cyan text-black">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </span>
              {active && <span className="mt-3 inline-flex text-sm font-semibold text-cyan">{step.cta}</span>}
            </button>
          );
        })}
      </div>
      <button className="mt-5 border-b border-cyan/60 text-sm font-semibold text-cyan hover:text-ink" onClick={onHowItWorks}>
        Learn how each feature works
      </button>
    </aside>
  );
}

function DiagnosticDemoSection({
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="EdgeTrace-eyebrow">Diagnostic Report</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-ink">{report.name}</h2>
          <p className="mt-2 text-sm text-muted">Pro workflow preview - diagnostic summary from sample trades.</p>
        </div>
        <button className="EdgeTrace-command-button" onClick={onInspect}>
          Inspect Cost Drag <ArrowRight size={16} />
        </button>
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative overflow-hidden border border-white/[0.12] bg-white/[0.035] p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_28%,rgba(61,220,151,0.13),transparent_17rem)]" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy Health</p>
            <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end">
              <div>
                <p className="text-8xl font-semibold leading-none tracking-[-0.08em] text-ink">
                  {intelligence.strategyHealthScore}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">{intelligence.healthBand}</p>
              </div>
              <p className="max-w-2xl pb-1 text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
            </div>
            <svg className="mt-8 h-36 w-full" viewBox="0 0 520 150" fill="none" role="img" aria-label="Demo equity curve">
              <path d="M0 28H520M0 74H520M0 120H520" stroke="white" strokeOpacity=".08" />
              <polyline points={buildLinePoints(report.charts.equityCurve)} fill="none" stroke="#58D6FF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <div className="border border-white/[0.12] bg-white/[0.035] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">Primary Diagnosis</p>
          <h3 className="mt-6 text-3xl font-semibold tracking-[-0.055em] text-ink">{intelligence.primaryDiagnosis}</h3>
          <p className="mt-5 text-sm leading-6 text-muted">{intelligence.primaryLeak.explanation}</p>
          <div className="mt-7 border border-white/[0.1] bg-black/24 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Where to Look Next</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">{intelligence.primaryLeak.recommendedInspection}</p>
            <p className="mt-1 text-sm text-muted">{intelligence.primaryLeak.supportingMetric}</p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        <DemoMetric label="After-cost performance" value={currency.format(report.metrics.netPnl)} detail={`Expectancy ${currencyPrecise.format(report.metrics.expectancy)} per trade`} />
        <DemoMetric label="Cost drag" value={intelligence.costDragLabel} detail={`Total costs ${currency.format(report.metrics.totalCosts)}`} />
        <DemoMetric label="R capture" value={report.metrics.averageRealizedR === undefined ? "Unavailable" : `${decimal.format(report.metrics.averageRealizedR)}R`} detail={`Win rate ${percent.format(report.metrics.winRate)}`} />
      </section>
    </div>
  );
}

function DrilldownDemoSection({
  dimension,
  rows,
  selectedRow,
  onDimensionChange,
  onSelectRow
}: {
  dimension: BreakdownDimension;
  rows: BreakdownRow[];
  selectedRow?: BreakdownRow;
  onDimensionChange: (dimension: BreakdownDimension) => void;
  onSelectRow: (row: BreakdownRow) => void;
}) {
  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="EdgeTrace-eyebrow">Drilldowns</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-ink">Find which segments are driving the leak.</h2>
          <p className="mt-2 text-sm text-muted">Pro workflow preview - click rows to update the detail panel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["symbol", "setup", "timeOfDay"] as BreakdownDimension[]).map((item) => (
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

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-x-auto border border-white/[0.1]">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/[0.1] text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{breakdownLabels[dimension]}</th>
                <th className="px-4 py-3 font-medium">Trades</th>
                <th className="px-4 py-3 font-medium">Net PnL</th>
                <th className="px-4 py-3 font-medium">Expectancy</th>
                <th className="px-4 py-3 font-medium">Cost Drag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {rows.slice(0, 7).map((row) => (
                <tr
                  key={row.group}
                  className={`cursor-pointer ${selectedRow?.group === row.group ? "bg-cyan/[0.08]" : "hover:bg-white/[0.035]"}`}
                  onClick={() => onSelectRow(row)}
                >
                  <td className="px-4 py-3 font-semibold text-ink">{row.group}</td>
                  <td className="px-4 py-3 text-muted">{row.totalTrades}</td>
                  <td className={row.netPnl >= 0 ? "px-4 py-3 text-cyan" : "px-4 py-3 text-loss"}>{currency.format(row.netPnl)}</td>
                  <td className="px-4 py-3 text-ink">{currencyPrecise.format(row.expectancy)}</td>
                  <td className="px-4 py-3 text-warning">{row.costDrag.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border border-cyan/30 bg-cyan/[0.045] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Selected attribution</p>
          {selectedRow ? (
            <>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">{selectedRow.group}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                {selectedRow.netPnl < 0
                  ? "This segment is weakening the report and deserves inspection before changing the whole strategy."
                  : "This segment is contributing positively. Compare whether it remains strong in later iterations."}
              </p>
              <div className="mt-5 grid gap-3">
                <MetricMini label="Net PnL" value={currency.format(selectedRow.netPnl)} />
                <MetricMini label="Win rate" value={percent.format(selectedRow.winRate)} />
                <MetricMini label="Average R" value={selectedRow.averageRealizedR === undefined ? "Unavailable" : `${decimal.format(selectedRow.averageRealizedR)}R`} />
                <MetricMini label="Net/gross conversion" value={selectedRow.netToGrossPct === undefined ? "Unavailable" : percent.format(selectedRow.netToGrossPct)} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Select a row to inspect the attribution detail.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function CompareDemoSection({
  reports,
  reportA,
  reportB,
  reportAId,
  reportBId,
  metrics,
  interpretation,
  onSelectA,
  onSelectB
}: {
  reports: DemoReport[];
  reportA: DemoReport;
  reportB: DemoReport;
  reportAId: string;
  reportBId: string;
  metrics: ReturnType<typeof buildComparisonMetrics>;
  interpretation: string;
  onSelectA: (id: string) => void;
  onSelectB: (id: string) => void;
}) {
  const keyMetrics = metrics.filter((metric) => ["expectancy", "costDragPct", "averageRealizedR", "netPnl"].includes(metric.key));

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="EdgeTrace-eyebrow">Compare</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-ink">Understand what changed between iterations.</h2>
          <p className="mt-2 text-sm text-muted">Pro workflow preview - compare sample reports without saving anything.</p>
        </div>
        <span className="border border-cyan/35 bg-cyan/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
          Pro workflow preview
        </span>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <ReportSelector label="Report A" value={reportAId} reports={reports} onChange={onSelectA} />
        <ReportSelector label="Report B" value={reportBId} reports={reports} onChange={onSelectB} />
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {keyMetrics.map((metric) => (
          <div key={metric.key} className="border border-white/[0.1] bg-white/[0.025] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{metric.label}</p>
            <p className={metric.status === "Improved" ? "mt-4 text-3xl font-semibold text-cyan" : metric.status === "Degraded" ? "mt-4 text-3xl font-semibold text-loss" : "mt-4 text-3xl font-semibold text-ink"}>
              {formatDelta(metric.delta, metric.format)}
            </p>
            <p className="mt-2 text-sm text-muted">{metric.status}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 border border-white/[0.1] bg-black/24 p-5">
        <p className="EdgeTrace-eyebrow">Interpretation</p>
        <p className="mt-3 max-w-4xl text-base leading-7 text-ink">{interpretation}</p>
        <p className="mt-4 text-sm text-muted">
          {reportA.demoLabel}: {reportA.demoNote} {reportB.demoLabel}: {reportB.demoNote}
        </p>
      </section>
    </div>
  );
}

function StrategyTrendDemoSection({ reports, trend }: { reports: DemoReport[]; trend: ReturnType<typeof buildStrategyTrend> }) {
  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="EdgeTrace-eyebrow">Strategy Set Preview</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-ink">Monitor strategy health over time.</h2>
          <p className="mt-2 text-sm text-muted">Pro workflow preview - strategy sets track whether iterations are strengthening or weakening.</p>
        </div>
        <span className="border border-cyan/35 bg-cyan/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
          Pro workflow preview
        </span>
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-white/[0.1] bg-white/[0.025] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Three-report strategy trend</p>
          <svg className="mt-5 h-72 w-full" viewBox="0 0 680 280" fill="none" role="img" aria-label="Strategy health trend">
            <path d="M40 36H650M40 100H650M40 164H650M40 228H650" stroke="white" strokeOpacity=".08" />
            <polyline points={trend.points} fill="none" stroke="#58D6FF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            {trend.markers.map((marker) => (
              <g key={marker.label}>
                <circle cx={marker.x} cy={marker.y} r="6" fill="#58D6FF" />
                <text x={marker.x} y="258" textAnchor="middle" fill="#9b9b95" fontSize="12" fontWeight="700">
                  {marker.label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="grid gap-4">
          <div className="border border-cyan/30 bg-cyan/[0.045] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Monitoring insight</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">{trend.insightTitle}</h3>
            <p className="mt-3 text-sm leading-6 text-muted">{trend.insight}</p>
          </div>
          <div className="border border-white/[0.1] bg-white/[0.025] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-warning">Watchlist teaser</p>
            <p className="mt-3 text-sm leading-6 text-muted">
              EdgeTrace can monitor whether cost drag, expectancy, R capture, and segment concentration are improving or
              deteriorating across strategy iterations.
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
    </div>
  );
}

function DemoMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-white/[0.1] bg-white/[0.025] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className="mt-5 text-4xl font-semibold tracking-[-0.06em] text-ink">{value}</p>
      <p className="mt-3 text-sm text-muted">{detail}</p>
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

function ReportSelector({
  label,
  value,
  reports,
  onChange
}: {
  label: string;
  value: string;
  reports: DemoReport[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block border border-white/[0.1] bg-white/[0.025] p-4">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</span>
      <select
        className="mt-3 w-full border border-white/[0.12] bg-black/40 px-3 py-2 text-sm font-semibold text-ink"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {reports.map((report) => (
          <option key={report.id} value={report.id}>
            {report.demoLabel}
          </option>
        ))}
      </select>
    </label>
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

function buildLinePoints(rows: Array<{ trade: number; equity: number }>, width = 520, height = 150, padding = 20) {
  if (!rows.length) return "";
  const min = Math.min(...rows.map((row) => row.equity));
  const max = Math.max(...rows.map((row) => row.equity));
  const span = max - min || 1;
  return rows
    .map((row, index) => {
      const x = rows.length === 1 ? padding : padding + (index / (rows.length - 1)) * (width - padding * 2);
      const y = height - padding - ((row.equity - min) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
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
    const y = 228 - ((item.score - min) / span) * 180;
    return { x, y, label: item.report.demoLabel.replace(" ", "\n") };
  });
  const first = scored[0];
  const latest = scored[scored.length - 1];
  const expectancyImproved = first && latest ? latest.expectancy > first.expectancy : false;
  const costDragImproved =
    first?.costDrag !== undefined && latest?.costDrag !== undefined ? latest.costDrag < first.costDrag : false;

  return {
    points: markers.map((marker) => `${marker.x.toFixed(1)},${marker.y.toFixed(1)}`).join(" "),
    markers,
    insightTitle: expectancyImproved || costDragImproved ? "Strategy trend is improving." : "Strategy trend needs review.",
    insight:
      expectancyImproved || costDragImproved
        ? "The latest sample iteration shows better conversion quality: expectancy and/or cost drag improved versus the baseline."
        : "The latest sample iteration does not clearly outperform the baseline. EdgeTrace would flag this for deeper review."
  };
}

function formatDelta(value: number | undefined, format: "currency" | "number" | "percent") {
  if (value === undefined || !Number.isFinite(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  if (format === "currency") return `${sign}${currencyPrecise.format(value)}`;
  if (format === "percent") return `${sign}${percent.format(value)}`;
  return `${sign}${decimal.format(value)}`;
}

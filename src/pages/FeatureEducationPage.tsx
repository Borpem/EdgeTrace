import { useEffect, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  Gauge,
  Layers,
  Minus,
  Search,
  type LucideIcon
} from "lucide-react";
import { PageShell } from "../components/ui/Primitives";
import { trackEvent } from "../lib/analytics";
import { getPlanConfig } from "../lib/entitlements";
import { planConfigs, planOrder, type FeatureKey, type PlanId } from "../lib/plans";
import type { UserProfile } from "../types";

type FeatureEducationPageProps = {
  profile?: UserProfile | null;
  isAuthenticated?: boolean;
  onAnalyze: () => void;
  onPricing: () => void;
  onSignup?: () => void;
  onOpenReport?: (reportId: string) => void;
  onCreateStrategySet?: () => void;
};

type Tone = "cyan" | "purple" | "amber";

const insightGroups: Array<{
  title: string;
  body: string;
  tone: Tone;
  icon: LucideIcon;
  bullets: string[];
  anchorIds: string[];
}> = [
  {
    title: "Diagnostics",
    body:
      "Understand Edge Health, expectancy, cost drag, and R capture from completed trade history before you inspect individual segments.",
    tone: "cyan",
    icon: Gauge,
    bullets: ["Edge Health", "Cost drag analysis", "Expectancy breakdowns", "R-multiple analysis"],
    anchorIds: ["diagnostic-reports", "import-provenance", "broker-imports", "full-report-access"]
  },
  {
    title: "Attribution",
    body:
      "Separate where performance is being created or lost across symbols, strategies, time windows, and report comparisons.",
    tone: "purple",
    icon: Search,
    bullets: ["Symbol performance", "Strategy breakdowns", "Time-window attribution", "Report comparisons"],
    anchorIds: ["drilldowns", "compare", "full-drilldowns", "full-compare", "reconstruction-audit"]
  },
  {
    title: "Monitoring",
    body:
      "Group related reports into strategy sets, then use Pro to turn repeated uploads into a twice-weekly review loop.",
    tone: "amber",
    icon: Layers,
    bullets: ["Strategy sets", "Iteration tracking", "Regression monitoring", "Stability analysis"],
    anchorIds: ["strategy-sets", "strategy-monitoring", "exports", "strategy-health-monitoring"]
  }
];

const featureRows: Array<{ label: string; feature?: FeatureKey; access: Record<PlanId, string> }> = [
  { label: "Unlimited full diagnostic reports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Broker and generic CSV imports", feature: "broker_imports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Full drilldowns", feature: "full_drilldowns", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Full compare", feature: "full_compare", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Strategy sets", feature: "strategy_sets", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Reconstruction audit", feature: "reconstruction_audit", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Exports", feature: "audit_exports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Strategy monitoring", feature: "strategy_health_monitoring", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Weekly Edge Review loop", feature: "review_cadence", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Regression / improvement tracking", feature: "review_cadence", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Benchmark percentile cards", feature: "review_cadence", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Next-review checklist", feature: "review_cadence", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Review cadence status", feature: "review_cadence", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Aggregate benchmark intelligence", feature: "aggregate_benchmarks", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Cost-drag cohort percentiles", feature: "aggregate_benchmarks", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "R-capture comparisons", feature: "aggregate_benchmarks", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Expectancy and profit-factor context", feature: "aggregate_benchmarks", access: { free: "-", pro: "Included", advanced: "Included" } }
];

export function FeatureEducationPage({
  profile,
  isAuthenticated = Boolean(profile),
  onAnalyze,
  onPricing,
  onSignup
}: FeatureEducationPageProps) {
  const plan = getPlanConfig(profile?.planId);
  const accountAction = isAuthenticated ? onAnalyze : onSignup ?? onAnalyze;
  const accountLabel = isAuthenticated ? "Create Diagnostic Report" : "Create Free Account";

  useEffect(() => {
    trackEvent(isAuthenticated ? "feature_education_opened" : "public_how_it_works_opened");
  }, [isAuthenticated]);

  useEffect(() => {
    const feature = new URLSearchParams(window.location.search).get("feature");
    if (!feature) return;
    const targetId = feature.replace(/_/g, "-");
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  return (
    <PageShell className={`${isAuthenticated ? "EdgeTrace-auth-education" : ""} relative z-10 pb-16`}>
      <HeroSection accountAction={accountAction} accountLabel={accountLabel} onPricing={onPricing} />
      <WorkflowWalkthrough />
      <DiagnosticInsight />
      <StrategyEvolution />
      <PlansSection currentPlan={plan.id} isAuthenticated={isAuthenticated} onPricing={onPricing} />
      <FinalCta accountAction={accountAction} accountLabel={accountLabel} />
    </PageShell>
  );
}

function HeroSection({
  accountAction,
  accountLabel,
  onPricing
}: {
  accountAction: () => void;
  accountLabel: string;
  onPricing: () => void;
}) {
  return (
    <section className="relative z-10 overflow-hidden border-b border-white/[0.08] py-12 md:py-16">
      <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[54rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,197,245,0.12),rgba(124,92,255,0.06)_44%,transparent_72%)] blur-[118px]" />
      <div className="relative grid gap-10 lg:grid-cols-[0.95fr_0.9fr] lg:items-center">
        <div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink md:text-6xl xl:text-7xl">
            Understand every layer of your trading performance.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted md:text-lg md:leading-8">
            EdgeTrace turns completed trade history into diagnostics, attribution, comparisons, and strategy monitoring
            so traders can understand what actually drives performance.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="EdgeTrace-primary-button" onClick={accountAction}>
              {accountLabel}
              <ArrowRight size={16} />
            </button>
            <button className="EdgeTrace-secondary-button" onClick={onPricing}>
              View Pricing
            </button>
          </div>
        </div>
        <WorkspaceVisual />
      </div>
    </section>
  );
}

function PresentationFrame({
  children,
  tilt = "none"
}: {
  children: ReactNode;
  tilt?: "left" | "right" | "none";
}) {
  const tiltClass =
    tilt === "left"
      ? "lg:[transform:rotateX(1.2deg)_rotateY(1.6deg)_translateZ(0)]"
      : tilt === "right"
        ? "lg:[transform:rotateX(1.2deg)_rotateY(-1.6deg)_translateZ(0)]"
        : "lg:[transform:translateZ(0)]";

  return (
    <div className="pointer-events-none relative isolate select-none [perspective:1200px]" aria-hidden="true">
      <div className="absolute -inset-x-4 bottom-[-1.15rem] h-10 bg-[radial-gradient(ellipse,rgba(30,120,150,0.16),rgba(0,0,0,0)_68%)] blur-2xl" />
      <div
        className={`relative overflow-hidden rounded-md border border-[#203747] bg-[#071015] shadow-[0_26px_72px_-54px_rgba(84,214,255,0.42),0_18px_42px_-32px_rgba(0,0,0,0.98)] ring-1 ring-white/[0.025] ${tiltClass}`}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan/35 to-transparent" />
        {children}
      </div>
    </div>
  );
}

function WorkspaceVisual() {
  const metrics = [
    ["Net PnL", "$2,730", "text-profit"],
    ["Expectancy", "$14.07", "text-profit"],
    ["Win Rate", "46.4%", "text-warning"],
    ["R-Multiple", "0.26R", "text-loss"]
  ];

  return (
    <PresentationFrame tilt="right">
      <div className="relative p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-[#1b3342] pb-3">
          <div className="flex items-center gap-3">
            <span className="h-3 w-6 skew-x-[-18deg] bg-white/85" />
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.38em] text-ink/85">EDGETRACE</span>
          </div>
          <span className="rounded-sm border border-cyan/35 px-2.5 py-1 text-[0.62rem] font-semibold text-cyan">
            Dashboard
          </span>
        </div>

        <div className="mt-4 rounded-md border border-[#203747] bg-[#101b23] p-4">
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-cyan">Report overview</p>
            <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-ink">Test - improved trades</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {metrics.map(([label, value, color]) => (
              <div key={label} className="rounded-sm border border-[#1d3443] bg-[#070d12] p-3">
                <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
                <p className={`mt-2 text-lg font-semibold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
          <div className="rounded-md border border-[#284758] bg-[#111d25] p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Edge Health</p>
                <p className="mt-3 text-5xl font-semibold tracking-[-0.06em] text-warning">60<span className="text-base text-ink">/100</span></p>
              </div>
              <span className="text-sm font-medium text-warning">Stabilizing</span>
            </div>
            <svg className="mt-4 h-16 w-full overflow-visible" viewBox="0 0 300 82" role="img" aria-label="Equity curve">
              <path d="M0 56 L300 56" stroke="rgba(130,160,178,0.18)" strokeDasharray="4 5" />
              <path d="M8 46 C28 22, 48 62, 70 54 S115 62, 132 55 S166 48, 186 57 S224 22, 292 26" fill="none" stroke="#6bd28f" strokeWidth="3" />
            </svg>
            <p className="mt-2 text-xs text-profit">Equity curve rising</p>
          </div>
          <div className="rounded-md border border-loss/30 bg-[#111820] p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Primary diagnosis</p>
            <h3 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-ink">Loss Concentration</h3>
            <p className="mt-3 text-sm leading-6 text-muted">One or two losses are large enough to materially distort performance.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-sm border border-[#1d3443] bg-[#070d12] p-3">
                <p className="text-[0.6rem] uppercase tracking-[0.14em] text-muted">Est. impact</p>
                <p className="mt-2 text-lg font-semibold text-loss">-$1,610</p>
              </div>
              <div className="rounded-sm border border-[#1d3443] bg-[#070d12] p-3">
                <p className="text-[0.6rem] uppercase tracking-[0.14em] text-muted">Diagnosis strength</p>
                <p className="mt-2 text-lg font-semibold text-ink">Moderate</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-[#203747] bg-[#070d12] p-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Pro Review Loop</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ["Cost Drag", "38th", "text-warning"],
              ["R-Capture", "59th", "text-cyan"],
              ["Expectancy", "63rd", "text-cyan"]
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-sm border border-[#1d3443] bg-[#0b151b] p-3">
                <p className="text-[0.58rem] uppercase tracking-[0.16em] text-muted">{label}</p>
                <p className={`mt-1 text-2xl font-semibold tracking-[-0.04em] ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PresentationFrame>
  );
}

function WorkflowWalkthrough() {
  return (
    <section className="relative z-10 py-12 md:py-16">
      <div className="mb-9 grid gap-5 lg:grid-cols-[0.78fr_1fr] lg:items-end">
        <h2 className="max-w-4xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl xl:text-6xl">
          From broker export to strategy intelligence.
        </h2>
        <p className="max-w-xl text-base leading-7 text-muted">
          The workflow is intentionally linear: import the file, isolate what changed, then use new uploads to prove
          whether the strategy improved.
        </p>
      </div>
      <div className="space-y-12">
        <WalkthroughSection
          title="Import completed trade history."
          body="Upload broker exports or generic CSV files. EdgeTrace normalizes completed trades into a structured diagnostic workflow."
          visual={<ImportReportVisual />}
        />
        <WalkthroughSection
          title="Identify what actually drives performance."
          body="EdgeTrace separates expectancy, cost drag, R capture, symbol performance, strategy behavior, and time-window attribution so traders can isolate the largest source of edge or leakage."
          visual={<AttributionVisual />}
          reverse
        />
      </div>
    </section>
  );
}

function WalkthroughSection({
  title,
  body,
  visual,
  reverse = false
}: {
  title: string;
  body: string;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className={`grid gap-7 lg:grid-cols-[0.82fr_1.18fr] lg:items-center ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <div>
        <h3 className="max-w-2xl text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-4xl">
          {title}
        </h3>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted">{body}</p>
      </div>
      {visual}
    </section>
  );
}

function ImportReportVisual() {
  return (
    <PresentationFrame tilt="left">
      <div className="relative p-5">
        <div className="grid gap-3 md:grid-cols-[0.78fr_1fr_1fr] md:items-stretch">
          <div className="rounded-md border border-[#203747] bg-[#101b23] p-4">
            <div className="grid h-10 w-10 place-items-center rounded-sm border border-cyan/35 bg-cyan/[0.06] text-cyan">
              <FileText size={20} />
            </div>
            <p className="mt-5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Import Trades</p>
            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-ink">IBKR export</p>
            <p className="mt-2 text-sm leading-6 text-muted">Completed executions, fees, side, time, and symbol.</p>
          </div>

          <div className="rounded-md border border-[#203747] bg-[#070d12] p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-cyan">Review mapping</p>
            <div className="mt-4 space-y-2">
              {[
                ["Trades detected", "194"],
                ["Costs mapped", "Yes"],
                ["R data", "Partial"],
                ["Reconstruction", "194 / 194"]
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-[#1b3342] py-2 text-sm last:border-b-0">
                  <span className="text-muted">{label}</span>
                  <span className="font-semibold text-ink">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[#203747] bg-[#101b23] p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Generated report</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["Net PnL", "$2,730", "text-profit"],
                ["Expectancy", "$14.07", "text-profit"],
                ["Win Rate", "46.4%", "text-warning"],
                ["Trades", "194", "text-profit"]
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-sm border border-[#1d3443] bg-[#070d12] p-3">
                  <p className="text-[0.58rem] uppercase tracking-[0.14em] text-muted">{label}</p>
                  <p className={`mt-2 text-lg font-semibold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-sm border border-cyan/30 bg-cyan/[0.04] px-3 py-2 text-sm font-semibold text-cyan">
              <span>Open dashboard</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </div>
      </div>
    </PresentationFrame>
  );
}

function AttributionVisual() {
  const drivers = [
    ["Cost Drag", "-$1,140.07", "Commissions, fees, and estimated costs.", "text-loss", "border-loss/60"],
    ["Weakest Segment", "-$318.83", "META by net PnL.", "text-loss", "border-loss/60"],
    ["Average Loss", "-$155.20", "Typical losing trade size.", "text-loss", "border-loss/60"],
    ["Average Win", "$209.67", "Typical winning trade size.", "text-profit", "border-profit/60"],
    ["Best Segment", "$1,114.15", "TSLA by net PnL.", "text-profit", "border-profit/60"]
  ];

  return (
    <PresentationFrame tilt="right">
      <div className="relative p-5">
        <div className="rounded-md border border-[#203747] bg-[#101b23] p-4">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Top Drivers</p>
          <div className="mt-4 grid gap-2 md:grid-cols-5">
            {drivers.map(([label, value, body, color, border]) => (
              <div key={label} className={`rounded-sm border border-[#1d3443] border-l-2 ${border} bg-[#070d12] p-3`}>
                <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
                <p className={`mt-3 text-2xl font-semibold tracking-[-0.04em] ${color}`}>{value}</p>
                <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-md border border-loss/30 border-l-loss/70 bg-[#101820] p-5">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Primary diagnosis</p>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-ink">Loss Concentration</h3>
            <p className="mt-2 text-sm leading-6 text-muted">The largest loss pocket is driving the report more than the average trade.</p>
          </div>
          <div className="rounded-md border border-[#203747] bg-[#070d12] p-5">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-cyan">What changed</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-muted">Expectancy</p>
                <p className="mt-1 text-xl font-semibold text-profit">+$58.29</p>
              </div>
              <div>
                <p className="text-sm text-muted">Profit factor</p>
                <p className="mt-1 text-xl font-semibold text-profit">+0.64</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PresentationFrame>
  );
}

function StrategyTimelineReviewVisual() {
  const reviewItems = [
    ["Regression", "Expectancy slipped", "$35.55 to $14.07 per trade."],
    ["Quality", "Profit factor weakened", "1.40 to 1.17."],
    ["Hit rate", "Win rate is falling", "51.8% to 46.4%."]
  ];
  const targets = [
    ["Fix", "Review Primary Leak", "Next upload should show whether this fix improved the report."],
    ["Limit", "Recheck META", "Target less than $318.83 of downside from this segment."],
    ["Target", "Protect expectancy", "Next report target: $35.55 per trade or better."]
  ];

  return (
    <PresentationFrame>
      <div className="relative p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-[#1b3342] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Pro Review Loop</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Review Overdue</p>
            <p className="mt-1 text-sm text-muted">Import after the next 2-3 sessions to keep the loop useful.</p>
          </div>
          <span className="w-fit rounded-sm border border-cyan/30 px-3 py-1 text-xs font-semibold text-cyan">
            2x weekly check-in
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Cost Drag Percentile", "38th", "text-warning", "border-warning/45"],
            ["R-Capture Benchmark", "59th", "text-cyan", "border-cyan/45"],
            ["Expectancy Benchmark", "63rd", "text-cyan", "border-cyan/45"]
          ].map(([label, value, color, border]) => (
            <div key={label} className={`rounded-md border ${border} bg-[#0a141a] p-4`}>
              <p className={`text-[0.62rem] font-semibold uppercase tracking-[0.16em] ${color}`}>{label}</p>
              <div className="mt-4 flex items-end gap-3">
                <span className={`text-5xl font-semibold tracking-[-0.06em] ${color}`}>{value}</span>
                <span className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted">Percentile</span>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-[#16313d]">
                <div className={`h-full rounded-full ${label.startsWith("Cost") ? "w-[38%] bg-warning" : label.startsWith("R-") ? "w-[59%] bg-cyan" : "w-[63%] bg-cyan"}`} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-[#203747] bg-[#070d12] p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Weekly Edge Review</p>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-ink">This review got worse</h3>
            <div className="mt-4 space-y-2">
              {reviewItems.map(([badge, title, detail]) => (
                <div key={title} className="grid gap-3 rounded-sm border border-[#1d3443] border-l-warning/80 bg-[#090f14] p-3 sm:grid-cols-[5.5rem_1fr] sm:items-center">
                  <span className="w-fit rounded-full border border-warning/45 px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-warning">
                    {badge}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{title}</p>
                    <p className="mt-1 text-xs text-muted">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[#203747] bg-[#070d12] p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">Next Review Targets</p>
            <p className="mt-3 text-sm text-muted">Next upload is checked against the current problem areas.</p>
            <div className="mt-4 space-y-2">
              {targets.map(([badge, title, detail], index) => (
                <div key={title} className={`grid gap-3 rounded-sm border border-[#1d3443] bg-[#090f14] p-3 sm:grid-cols-[5.5rem_1fr] sm:items-center ${index === 2 ? "border-l-profit/80" : "border-l-warning/80"}`}>
                  <span className={`w-fit rounded-full border px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] ${index === 2 ? "border-profit/45 text-profit" : "border-warning/45 text-warning"}`}>
                    {badge}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">{title}</p>
                    <p className="mt-1 text-xs text-muted">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PresentationFrame>
  );
}

function DiagnosticInsight() {
  return (
    <section className="relative z-10 border-y border-white/[0.08] bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,245,0.035),transparent_32rem),rgba(3,6,12,0.24)] py-12 md:py-16">
      <div className="mb-9 max-w-3xl">
        <h2 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
          What EdgeTrace analyzes.
        </h2>
        <p className="mt-4 text-base leading-7 text-muted">
          Each layer answers a different question about completed trade performance.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {insightGroups.map((group) => (
          <InsightPanel key={group.title} group={group} />
        ))}
      </div>
    </section>
  );
}

function InsightPanel({ group }: { group: (typeof insightGroups)[number] }) {
  const Icon = group.icon;
  const toneClass = toneClasses[group.tone];
  return (
    <article className="relative overflow-hidden border border-white/[0.1] bg-[#050a12]/94 p-6">
      {group.anchorIds.map((id) => (
        <span key={id} id={id} className="absolute -top-24" aria-hidden="true" />
      ))}
      <div className={`mb-7 grid h-14 w-14 place-items-center border ${toneClass.border} ${toneClass.bg} ${toneClass.text}`}>
        <Icon size={27} strokeWidth={1.7} />
      </div>
      <h3 className="text-3xl font-semibold tracking-[-0.05em] text-ink">{group.title}</h3>
      <p className="mt-4 min-h-24 text-base leading-7 text-muted">{group.body}</p>
      <ul className="mt-6 space-y-3">
        {group.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-3 text-sm leading-5 text-muted">
            <Check className={`mt-0.5 shrink-0 ${toneClass.text}`} size={15} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function StrategyEvolution() {
  return (
    <section className="relative z-10 py-12 md:py-16">
      <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div>
          <h2 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
            Track whether your edge is improving or deteriorating.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            Compare strategy iterations, identify regression risk, and monitor whether changes are improving performance
            or introducing leakage.
          </p>
          <div className="mt-7 space-y-3">
            {["Compare the current report against prior iterations.", "Group related reports into strategy sets.", "Review stability and regression risk over time."].map((item) => (
              <div key={item} className="flex gap-3 text-sm leading-6 text-muted">
                <Check className="mt-1 shrink-0 text-violet" size={15} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <StrategyTimelineReviewVisual />
      </div>
    </section>
  );
}

function PlansSection({
  currentPlan,
  isAuthenticated,
  onPricing
}: {
  currentPlan: PlanId;
  isAuthenticated: boolean;
  onPricing: () => void;
}) {
  return (
    <section className="EdgeTrace-education-plans-section">
      <div className="EdgeTrace-education-plans-head">
        <p>Free vs Pro</p>
        <h2>Core analytics are free. Pro adds the review loop.</h2>
        <span>
          EdgeTrace gives every trader the complete reporting workflow. The paid tier is reserved for aggregate
          weekly Edge Reviews, benchmark percentiles, next-review checklists, review cadence status, and regression / improvement tracking.
        </span>
        {isAuthenticated && (
          <em className={currentPlanPillClass(currentPlan)}>
            Current plan: <strong>{planConfigs[currentPlan].displayName}</strong>
          </em>
        )}
      </div>

      <div className="EdgeTrace-education-feature-card">
        <div className="EdgeTrace-education-feature-row is-head">
          <span>Feature access</span>
          {planOrder.map((planId) => (
            <strong key={planId} className={currentPlan === planId ? "is-current" : ""}>
              {planConfigs[planId].displayName}
              <small>
                {planId === "free"
                  ? "Complete workflow"
                  : planId === "pro"
                    ? "$9.99/month intelligence"
                    : "Legacy benchmark access"}
              </small>
            </strong>
          ))}
        </div>

        {featureRows.map((row) => (
          <div key={row.label} className="EdgeTrace-education-feature-row">
            <span>{row.label}</span>
            {planOrder.map((planId) => (
              <div key={planId} className={currentPlan === planId ? "is-current" : ""}>
                <AccessValue value={row.access[planId]} planId={planId} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {!isAuthenticated && (
        <button className="EdgeTrace-secondary-button EdgeTrace-education-pricing-cta" onClick={onPricing}>
          Compare Pricing
        </button>
      )}
    </section>
  );
}

function FinalCta({
  accountAction,
  accountLabel
}: {
  accountAction: () => void;
  accountLabel: string;
}) {
  return (
    <section className="relative z-10 pt-11 md:pt-14">
      <div className="relative overflow-hidden border border-cyan/25 bg-[radial-gradient(circle_at_18%_0%,rgba(34,197,245,0.12),transparent_34%),radial-gradient(circle_at_88%_92%,rgba(124,92,255,0.1),transparent_36%),rgba(255,255,255,0.03)] p-7 md:p-9">
        <h2 className="max-w-4xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
          See how EdgeTrace evaluates completed trades.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Create an account to start analyzing completed trade history.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button className="EdgeTrace-primary-button" onClick={accountAction}>
            {accountLabel}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function AccessValue({ value, planId }: { value: string; planId: PlanId }) {
  const toneClass = toneClasses[planToneFromId(planId)];
  if (value === "-") {
    return (
      <span className="inline-flex items-center gap-2 text-muted">
        <Minus size={14} /> Not included
      </span>
    );
  }
  if (value === "Coming soon") {
    return <span className={`inline-flex items-center gap-2 ${toneClass.text}`}>Coming soon</span>;
  }
  return (
    <span className={`inline-flex items-center gap-2 ${toneClass.text}`}>
      <Check size={14} /> {value}
    </span>
  );
}

function planToneFromId(planId: PlanId): Tone {
  return planId === "advanced" ? "amber" : planId === "pro" ? "purple" : "cyan";
}

function currentPlanPillClass(planId: PlanId) {
  if (planId === "advanced") return "border-warning/35 bg-warning/[0.045] text-warning";
  if (planId === "pro") return "border-violet/35 bg-violet/[0.045] text-violet";
  return "border-cyan/30 bg-cyan/[0.04] text-cyan";
}

function currentPlanTableClass(currentPlanId: PlanId, columnPlanId: PlanId, area: "head" | "body") {
  if (currentPlanId !== columnPlanId) return "";
  if (columnPlanId === "advanced") return area === "head" ? "bg-warning/[0.07] text-warning" : "bg-warning/[0.025]";
  if (columnPlanId === "pro") return area === "head" ? "bg-violet/[0.07] text-violet" : "bg-violet/[0.025]";
  return area === "head" ? "bg-cyan/[0.07] text-cyan" : "bg-cyan/[0.025]";
}

const toneClasses = {
  cyan: {
    text: "text-cyan",
    bg: "bg-cyan/[0.055]",
    border: "border-cyan/35"
  },
  purple: {
    text: "text-violet",
    bg: "bg-violet/[0.055]",
    border: "border-violet/35"
  },
  amber: {
    text: "text-warning",
    bg: "bg-warning/[0.055]",
    border: "border-warning/35"
  }
} as const;

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
  onDemo?: () => void;
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
      "Understand strategy health, expectancy, cost drag, and R capture from completed trade history before you inspect individual segments.",
    tone: "cyan",
    icon: Gauge,
    bullets: ["Strategy health", "Cost drag analysis", "Expectancy breakdowns", "R-multiple analysis"],
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
      "Group related reports into strategy sets so the review becomes a repeatable process instead of a one-time diagnosis.",
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
  { label: "Aggregate benchmark intelligence", feature: "aggregate_benchmarks", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Weekly strategy reviews", feature: "recurring_reviews", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Regression alerts", feature: "regression_alerts", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Ask EdgeTrace", feature: "ask_edge_trace", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "What-If Simulator", feature: "what_if_simulator", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Edge Score", feature: "edge_stability_score", access: { free: "-", pro: "Included", advanced: "Included" } }
];

export function FeatureEducationPage({
  profile,
  isAuthenticated = Boolean(profile),
  onAnalyze,
  onPricing,
  onDemo,
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
      <HeroSection accountAction={accountAction} accountLabel={accountLabel} onDemo={onDemo ?? onAnalyze} onPricing={onPricing} />
      <WorkflowWalkthrough />
      <DiagnosticInsight />
      <StrategyEvolution />
      <PlansSection currentPlan={plan.id} isAuthenticated={isAuthenticated} onPricing={onPricing} />
      <FinalCta accountAction={accountAction} accountLabel={accountLabel} onDemo={onDemo ?? onAnalyze} />
    </PageShell>
  );
}

function HeroSection({
  accountAction,
  accountLabel,
  onDemo,
  onPricing
}: {
  accountAction: () => void;
  accountLabel: string;
  onDemo: () => void;
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
            <button className="EdgeTrace-primary-button" onClick={onDemo}>
              Try Interactive Demo <ArrowRight size={16} />
            </button>
            <button className="EdgeTrace-secondary-button" onClick={accountAction}>
              {accountLabel}
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
      <div className="absolute -inset-x-5 bottom-[-1.35rem] h-12 bg-[radial-gradient(ellipse,rgba(88,214,255,0.18),rgba(124,92,255,0.08)_42%,transparent_72%)] blur-2xl" />
      <div
        className={`relative overflow-hidden border border-white/[0.095] bg-[linear-gradient(145deg,rgba(8,13,22,0.98),rgba(4,8,15,0.95))] shadow-[0_30px_92px_-60px_rgba(88,214,255,0.72),0_14px_34px_-26px_rgba(0,0,0,0.96)] ring-1 ring-white/[0.035] ${tiltClass}`}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        {children}
      </div>
    </div>
  );
}

function WorkspaceVisual() {
  return (
    <PresentationFrame tilt="right">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(124,92,255,0.12),transparent_35%),radial-gradient(circle_at_18%_86%,rgba(34,197,245,0.11),transparent_34%)]" />
      <div className="relative p-5">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div>
            <p className="text-sm font-semibold text-ink">Diagnostic report preview</p>
            <p className="mt-1 text-xs text-muted">Completed trades to primary diagnosis</p>
          </div>
          <span className="border border-cyan/30 bg-cyan/[0.05] px-3 py-1 text-xs font-semibold text-cyan">
            Report ready
          </span>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[0.88fr_1.12fr]">
            <div className="border border-white/[0.08] bg-black/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Upload</p>
                  <p className="mt-3 text-base font-semibold text-ink">broker-export.csv</p>
                  <p className="mt-1 text-xs text-muted">1,248 completed trades</p>
                </div>
                <FileText className="text-cyan" size={24} />
              </div>
              <div className="mt-4 h-2 bg-white/[0.08]">
                <div className="h-full w-[86%] bg-gradient-to-r from-cyan to-accent" />
              </div>
            </div>

            <div className="border border-white/[0.08] bg-[#050a12]/94 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">Strategy health</p>
                  <p className="mt-3 text-5xl font-semibold tracking-[-0.07em] text-ink">82</p>
                </div>
                <p className="border border-cyan/25 bg-cyan/[0.04] px-2.5 py-1 text-xs font-semibold text-cyan">
                  Improving
                </p>
              </div>
              <svg className="mt-4 h-20 w-full overflow-visible" viewBox="0 0 320 92" role="img" aria-label="Strategy trend line">
                <path d="M8 70 C54 60, 76 75, 112 48 S170 44, 210 34 S270 27, 312 16" fill="none" stroke="rgba(88,214,255,0.92)" strokeWidth="3" />
                <path d="M8 78 C62 74, 92 66, 136 66 S206 50, 312 42" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
                <circle cx="312" cy="16" r="4" fill="rgba(88,214,255,1)" />
              </svg>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.08fr_0.92fr]">
            <div className="border border-violet/25 bg-violet/[0.045] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet">Primary diagnosis</p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.04em] text-ink">Cost drag reduced, but still visible.</p>
              <p className="mt-2 text-sm leading-6 text-muted">Next inspection starts with opening-session trades.</p>
            </div>
            <div className="border border-white/[0.08] bg-black/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Workflow</p>
              <div className="mt-4 space-y-3 text-sm">
                {["Import", "Diagnose", "Inspect", "Monitor"].map((step, index) => (
                  <div key={step} className="flex items-center gap-3 text-muted">
                    <span className={`h-1.5 w-1.5 ${index < 3 ? "bg-cyan" : "bg-violet"}`} />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
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
          The workflow is intentionally linear: import the file, isolate what changed, then monitor whether the strategy
          keeps improving.
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(34,197,245,0.12),transparent_30%),radial-gradient(circle_at_86%_82%,rgba(124,92,255,0.1),transparent_36%)]" />
      <div className="relative grid gap-5 p-6 md:grid-cols-[0.8fr_auto_1.1fr] md:items-center">
        <div className="border border-white/[0.09] bg-black/25 p-5">
          <FileText className="text-cyan" size={30} />
          <p className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-ink">CSV export</p>
          <p className="mt-2 text-sm text-muted">Broker rows, fills, costs, and timestamps</p>
        </div>
        <ArrowRight className="hidden text-cyan/70 md:block" size={28} />
        <div className="border border-cyan/20 bg-cyan/[0.035] p-5">
          <p className="text-sm font-semibold text-cyan">Normalized report input</p>
          <div className="mt-5 space-y-3">
            {["Trades normalized", "Costs detected", "Mapping verified"].map((label) => (
              <div key={label} className="flex items-center justify-between border-b border-white/[0.07] pb-3 text-sm">
                <span className="text-muted">{label}</span>
                <span className="text-cyan">Ready</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PresentationFrame>
  );
}

function AttributionVisual() {
  return (
    <PresentationFrame tilt="right">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(124,92,255,0.11),transparent_34%)]" />
      <div className="relative p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="border border-white/[0.08] bg-black/20 p-4">
            <p className="text-sm font-semibold text-muted">Gross edge</p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.06em] text-ink">$6.1k</p>
            <p className="mt-3 text-xs text-muted">Before costs</p>
          </div>
          <div className="border border-warning/35 bg-warning/[0.045] p-4">
            <p className="text-sm font-semibold text-warning">Leak detected</p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.06em] text-ink">22.6%</p>
            <p className="mt-3 text-xs text-muted">Cost drag</p>
          </div>
          <div className="border border-cyan/25 bg-cyan/[0.04] p-4">
            <p className="text-sm font-semibold text-cyan">After-cost return</p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.06em] text-ink">$4.8k</p>
            <p className="mt-3 text-xs text-muted">Net result</p>
          </div>
        </div>

        <div className="mt-5 border border-white/[0.08] bg-black/20 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Primary attribution path</p>
              <p className="mt-1 text-sm text-muted">Opening-session costs remain the largest drag.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="h-1.5 w-12 bg-gradient-to-r from-cyan to-warning" />
              <span>Gross to net</span>
            </div>
          </div>
        </div>
      </div>
    </PresentationFrame>
  );
}

function StrategyTimelineReviewVisual() {
  const previousMetrics = [
    ["Expectancy", "+0.18R"],
    ["Cost drag", "31.4%"],
    ["R capture", "0.51R"],
    ["Health", "68"]
  ];
  const currentMetrics = [
    ["Expectancy", "+0.31R"],
    ["Cost drag", "22.6%"],
    ["R capture", "0.74R"],
    ["Health", "82"]
  ];
  const changes = [
    ["Expectancy improved", "+0.13R", "cyan" as Tone],
    ["Cost drag reduced", "-8.8 pts", "purple" as Tone],
    ["Execution improved", "Watchlist clear", "amber" as Tone]
  ];

  return (
    <PresentationFrame>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_18%,rgba(124,92,255,0.14),transparent_34%),radial-gradient(circle_at_18%_84%,rgba(34,197,245,0.12),transparent_34%)]" />
      <div className="relative p-5">
        <div className="mb-5 flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Strategy timeline review</p>
            <p className="mt-1 text-xs text-muted">Compare what changed between saved reports.</p>
          </div>
          <span className="w-fit border border-warning/30 bg-warning/[0.045] px-3 py-1 text-xs font-semibold text-warning">
            Monitoring active
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_0.78fr_1fr] lg:items-stretch">
          <IterationMetricPanel
            label="Previous iteration"
            title="ORB V2"
            subtitle="Lower cost experiment"
            metrics={previousMetrics}
            tone="cyan"
          />

          <div className="relative border border-white/[0.08] bg-black/25 p-4">
            <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-white/[0.06] lg:block" />
            <p className="relative text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">What changed</p>
            <div className="relative mt-4 space-y-3">
              {changes.map(([label, value, tone]) => {
                const toneClass = toneClasses[tone as Tone];
                return (
                  <div key={label} className="border border-white/[0.08] bg-[#050a12]/92 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted">{label}</span>
                      <span className={`text-sm font-semibold ${toneClass.text}`}>{value}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="relative mt-5 hidden items-center justify-center gap-2 text-xs text-muted lg:flex">
              <span className="h-px w-10 bg-cyan/45" />
              <ArrowRight size={14} className="text-cyan" />
              <span className="h-px w-10 bg-violet/45" />
            </div>
          </div>

          <IterationMetricPanel
            label="Current iteration"
            title="ORB V3"
            subtitle="May live review"
            metrics={currentMetrics}
            tone="purple"
            emphasized
          />
        </div>

        <div className="mt-4 border border-white/[0.08] bg-black/20 p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-semibold text-ink">Monitoring insight</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                V3 improved because cost drag fell and R capture expanded, but opening-session trades remain the next
                review target.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-warning">
              <span className="h-2 w-2 bg-warning" />
              Watch opening session
            </div>
          </div>
        </div>
      </div>
    </PresentationFrame>
  );
}

function IterationMetricPanel({
  label,
  title,
  subtitle,
  metrics,
  tone,
  emphasized = false
}: {
  label: string;
  title: string;
  subtitle: string;
  metrics: string[][];
  tone: Tone;
  emphasized?: boolean;
}) {
  const toneClass = toneClasses[tone];
  return (
    <div className={`border p-4 ${emphasized ? `${toneClass.border} bg-violet/[0.045]` : "border-white/[0.08] bg-black/25"}`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${toneClass.text}`}>{label}</p>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{title}</h3>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        {emphasized && <span className="border border-cyan/25 bg-cyan/[0.04] px-2.5 py-1 text-xs font-semibold text-cyan">Current</span>}
      </div>
      <div className="mt-5 space-y-3">
        {metrics.map(([metric, value]) => (
          <div key={metric} className="flex items-center justify-between border-b border-white/[0.07] pb-2 text-sm">
            <span className="text-muted">{metric}</span>
            <span className="font-semibold text-ink">{value}</span>
          </div>
        ))}
      </div>
    </div>
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
        <h2>Core analytics are free. Pro adds benchmarks and coaching.</h2>
        <span>
          EdgeTrace gives every trader the complete reporting workflow. The paid tier is reserved for aggregate
          benchmarks, weekly reviews, regression alerts, Ask EdgeTrace, What-If Simulator, and Edge Score.
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
                    : "Legacy automation"}
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
  accountLabel,
  onDemo
}: {
  accountAction: () => void;
  accountLabel: string;
  onDemo: () => void;
}) {
  return (
    <section className="relative z-10 pt-11 md:pt-14">
      <div className="relative overflow-hidden border border-cyan/25 bg-[radial-gradient(circle_at_18%_0%,rgba(34,197,245,0.12),transparent_34%),radial-gradient(circle_at_88%_92%,rgba(124,92,255,0.1),transparent_36%),rgba(255,255,255,0.03)] p-7 md:p-9">
        <h2 className="max-w-4xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
          See how EdgeTrace evaluates completed trades.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Explore the interactive demo or create an account to start analyzing trade history.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button className="EdgeTrace-primary-button" onClick={onDemo}>
            Try Interactive Demo <ArrowRight size={16} />
          </button>
          <button className="EdgeTrace-secondary-button" onClick={accountAction}>
            {accountLabel}
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

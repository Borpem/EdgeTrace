import { useEffect, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
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
      <div className="absolute -inset-x-6 -bottom-6 h-16 bg-[radial-gradient(ellipse,rgba(78,196,236,0.18),rgba(0,0,0,0)_68%)] blur-2xl" />
      <div
        className={`relative overflow-hidden rounded-md border border-[#294757] bg-[#04080c] shadow-[0_34px_110px_-70px_rgba(78,196,236,0.62),0_18px_42px_-32px_rgba(0,0,0,0.98)] ring-1 ring-white/[0.025] ${tiltClass}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(78,196,236,0.055)_1px,transparent_1px),linear-gradient(180deg,rgba(78,196,236,0.035)_1px,transparent_1px)] bg-[size:36px_36px] opacity-35 [mask-image:radial-gradient(circle_at_50%_44%,black,transparent_78%)]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan/35 to-transparent" />
        {children}
      </div>
    </div>
  );
}

function MarketingGraphicImage({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} className="relative block w-full select-none" draggable={false} />;
}

function WorkspaceVisual() {
  return (
    <PresentationFrame tilt="right">
      <MarketingGraphicImage
        src="/marketing/edgetrace-signal-board.svg"
        alt="EdgeTrace signal board showing edge health, primary diagnosis, driver metrics, and benchmark context."
      />
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
      <MarketingGraphicImage
        src="/marketing/edgetrace-import-flow.svg"
        alt="EdgeTrace import pipeline graphic showing broker export, mapping, and generated diagnostic report."
      />
    </PresentationFrame>
  );
}

function AttributionVisual() {
  return (
    <PresentationFrame tilt="right">
      <MarketingGraphicImage
        src="/marketing/edgetrace-driver-map.svg"
        alt="EdgeTrace driver map graphic separating negative drivers, watchlist metrics, and positive drivers."
      />
    </PresentationFrame>
  );
}

function StrategyTimelineReviewVisual() {
  return (
    <PresentationFrame>
      <MarketingGraphicImage
        src="/marketing/edgetrace-review-loop.svg"
        alt="EdgeTrace Pro review loop graphic showing benchmark percentiles and next review targets."
      />
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

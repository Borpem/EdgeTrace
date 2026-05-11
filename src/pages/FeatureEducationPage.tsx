import { useEffect } from "react";
import {
  ArrowRight,
  Check,
  FileSearch,
  Gauge,
  GitCompare,
  Layers,
  LineChart,
  Minus,
  Search,
  UploadCloud,
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

type WorkflowStep = {
  title: string;
  description: string;
  plan: "Free" | "Pro" | "Advanced";
  icon: LucideIcon;
  tone: Tone;
};

const workflowSteps: WorkflowStep[] = [
  {
    title: "Import Trades",
    description: "Upload broker exports or CSV history.",
    plan: "Free",
    icon: UploadCloud,
    tone: "cyan"
  },
  {
    title: "Create Diagnostic Report",
    description: "Generate health, expectancy, cost drag, and R-capture analysis.",
    plan: "Free",
    icon: FileSearch,
    tone: "cyan"
  },
  {
    title: "Inspect Leaks",
    description: "Break down symbols, setups, time windows, and strategy segments.",
    plan: "Pro",
    icon: Search,
    tone: "purple"
  },
  {
    title: "Compare Iterations",
    description: "Measure whether changes improved or degraded the edge.",
    plan: "Pro",
    icon: GitCompare,
    tone: "purple"
  },
  {
    title: "Monitor Strategy Health",
    description: "Identify instability, regression risk, and deterioration.",
    plan: "Advanced",
    icon: LineChart,
    tone: "amber"
  }
];

const capabilityGroups: Array<{
  title: string;
  body: string;
  tone: Tone;
  icon: LucideIcon;
  capabilities: string[];
}> = [
  {
    title: "Diagnostics",
    body: "Start with a summary of the current report: what is healthy, what is leaking, and which metric deserves attention first.",
    tone: "cyan",
    icon: Gauge,
    capabilities: ["Strategy Health", "Cost Drag", "Expectancy", "R Capture"]
  },
  {
    title: "Attribution",
    body: "Separate where performance is being created or lost so review starts with evidence instead of broad assumptions.",
    tone: "purple",
    icon: Search,
    capabilities: ["Symbol performance", "Setup breakdowns", "Time-window analysis", "Strategy comparisons"]
  },
  {
    title: "Monitoring",
    body: "Group reports over time to understand whether a strategy is improving, weakening, or becoming unstable.",
    tone: "amber",
    icon: Layers,
    capabilities: ["Strategy Sets", "Iteration tracking", "Regression monitoring", "Stability analysis"]
  }
];

const featureRows: Array<{ label: string; feature?: FeatureKey; access: Record<PlanId, string> }> = [
  { label: "1 full diagnostic report", access: { free: "Included", pro: "Unlimited", advanced: "Unlimited" } },
  { label: "Preview reports", feature: "preview_reports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "All broker imports", feature: "broker_imports", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Full drilldowns", feature: "full_drilldowns", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Full compare", feature: "full_compare", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Strategy sets", feature: "strategy_sets", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Reconstruction audit", feature: "reconstruction_audit", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Exports", feature: "audit_exports", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Strategy monitoring", feature: "strategy_health_monitoring", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Recurring strategy reviews", feature: "recurring_reviews", access: { free: "-", pro: "-", advanced: "Coming soon" } },
  { label: "Regression alerts", feature: "regression_alerts", access: { free: "-", pro: "-", advanced: "Coming soon" } },
  { label: "Edge Stability Score", feature: "edge_stability_score", access: { free: "-", pro: "-", advanced: "Coming soon" } }
];

const planDepth: Record<PlanId, number> = {
  free: 32,
  pro: 70,
  advanced: 100
};

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
    <PageShell className="relative z-10 pb-16">
      <HeroSection accountAction={accountAction} accountLabel={accountLabel} onDemo={onDemo ?? onAnalyze} onPricing={onPricing} />
      <WorkflowStory />
      <CoreCapabilities />
      <StrategyEvolution />
      <PlanAccess currentPlan={plan.id} isAuthenticated={isAuthenticated} onPricing={onPricing} />
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
      <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[54rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,197,245,0.11),rgba(124,92,255,0.06)_44%,transparent_72%)] blur-[118px]" />
      <div className="relative grid gap-9 lg:grid-cols-[0.96fr_0.9fr] lg:items-center">
        <div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink md:text-6xl xl:text-7xl">
            Understand every layer of your trading performance.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted md:text-lg md:leading-8">
            EdgeTrace turns completed trade history into diagnostics, attribution, comparisons, and strategy monitoring
            so you can understand what actually drives performance.
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
        <DiagnosticFlowVisual />
      </div>
    </section>
  );
}

function DiagnosticFlowVisual() {
  return (
    <div className="relative overflow-hidden border border-white/[0.1] bg-[linear-gradient(145deg,rgba(7,12,20,0.96),rgba(5,10,18,0.9))] p-5 shadow-[0_24px_72px_-56px_rgba(88,214,255,0.6)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(124,92,255,0.16),transparent_34%),radial-gradient(circle_at_14%_88%,rgba(34,197,245,0.13),transparent_34%)]" />
      <div className="relative">
        <div className="grid gap-3">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            const toneClass = toneClasses[step.tone];
            return (
              <div key={step.title} className="grid grid-cols-[42px_1fr_auto] items-center gap-4">
                <div className="relative">
                  <div className={`grid h-10 w-10 place-items-center border ${toneClass.border} ${toneClass.bg} ${toneClass.text}`}>
                    <Icon size={18} strokeWidth={1.8} />
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className="absolute left-1/2 top-10 h-3 w-px -translate-x-1/2 bg-white/[0.14]" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{step.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{step.description}</p>
                </div>
                <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${toneClass.border} ${toneClass.text}`}>
                  {step.plan}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[0.1] pt-4">
          <MiniReadout label="Cost drag" value="↓" tone="amber" />
          <MiniReadout label="Expectancy" value="+0.31" tone="cyan" />
          <MiniReadout label="R capture" value="0.74R" tone="purple" />
        </div>
      </div>
    </div>
  );
}

function WorkflowStory() {
  return (
    <section className="relative z-10 py-11 md:py-14">
      <div className="mb-7">
        <h2 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
          From broker export to strategy intelligence.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Follow how completed trade history becomes a diagnostic workflow.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {workflowSteps.map((step, index) => (
          <WorkflowStepCard key={step.title} step={step} number={index + 1} showConnector={index < workflowSteps.length - 1} />
        ))}
      </div>
    </section>
  );
}

function WorkflowStepCard({ step, number, showConnector }: { step: WorkflowStep; number: number; showConnector: boolean }) {
  const Icon = step.icon;
  const toneClass = toneClasses[step.tone];
  return (
    <article className="relative z-10 border border-white/[0.12] bg-[#050a12] p-4 shadow-[0_0_0_1px_rgba(3,6,12,0.92),0_18px_44px_-36px_rgba(0,0,0,0.95)]">
      {showConnector && (
        <ArrowRight className="pointer-events-none absolute -right-3 top-8 z-20 hidden text-muted/45 xl:block" size={16} strokeWidth={1.6} />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-11 w-11 place-items-center border ${toneClass.border} ${toneClass.bg} ${toneClass.text}`}>
          <Icon size={21} strokeWidth={1.7} />
        </div>
        <PlanBadge label={step.plan} />
      </div>
      <p className="mt-5 text-sm font-semibold text-muted">{String(number).padStart(2, "0")}</p>
      <h3 className="mt-2 text-xl font-semibold leading-tight tracking-[-0.04em] text-ink">{step.title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted">{step.description}</p>
    </article>
  );
}

function CoreCapabilities() {
  return (
    <section className="relative z-10 border-y border-white/[0.08] bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,245,0.035),transparent_32rem),rgba(3,6,12,0.28)] py-12 md:py-14">
      <div className="mb-8 max-w-4xl">
        <h2 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
          What EdgeTrace analyzes.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Each layer isolates a different source of strategy performance.
        </p>
      </div>
      <div className="space-y-7">
        {capabilityGroups.map((group) => (
          <CapabilityGroup key={group.title} group={group} />
        ))}
      </div>
    </section>
  );
}

function CapabilityGroup({ group }: { group: (typeof capabilityGroups)[number] }) {
  const Icon = group.icon;
  const toneClass = toneClasses[group.tone];
  return (
    <section className="grid gap-5 py-2 lg:grid-cols-[260px_1fr]">
      <div className="lg:pt-3">
        <div className={`mb-4 h-px w-16 ${toneClass.gradient}`} />
        <div className="flex items-center gap-3">
          <Icon className={toneClass.text} size={24} strokeWidth={1.7} />
          <h3 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{group.title}</h3>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">{group.body}</p>
      </div>
      <div className="grid gap-3 border-t border-white/[0.075] pt-5 sm:grid-cols-2 xl:grid-cols-4">
        {group.capabilities.map((capability) => (
          <div key={capability} className="border border-white/[0.08] bg-[#050a12]/92 p-4">
            <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${toneClass.text}`}>{capability}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StrategyEvolution() {
  const versions = [
    { label: "V1", title: "Baseline", health: "68", note: "Cost drag visible", tone: "cyan" as Tone },
    { label: "V2", title: "Lower Costs", health: "76", note: "Execution drag reduced", tone: "purple" as Tone },
    { label: "V3", title: "Monitoring", health: "82", note: "Current vs best tracked", tone: "amber" as Tone }
  ];

  return (
    <section className="relative z-10 py-12 md:py-14">
      <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
        <div>
          <h2 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
            Track whether your edge is improving or deteriorating.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            EdgeTrace helps traders compare iterations, identify regression risk, and monitor strategy stability over
            time.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {["Strategy Sets", "Iteration tracking", "Recurring review concepts"].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-muted">
                <Check className="text-violet" size={16} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative overflow-hidden border border-white/[0.1] bg-[linear-gradient(145deg,rgba(7,12,20,0.95),rgba(5,10,18,0.9))] p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(124,92,255,0.13),transparent_34%),radial-gradient(circle_at_16%_84%,rgba(34,197,245,0.1),transparent_30%)]" />
          <div className="relative grid gap-3 md:grid-cols-3">
            {versions.map((version, index) => {
              const toneClass = toneClasses[version.tone];
              return (
                <article key={version.label} className="relative border border-white/[0.09] bg-[#050a12] p-4">
                  {index < versions.length - 1 && (
                    <ArrowRight className="absolute -right-3 top-8 hidden text-muted/45 md:block" size={16} strokeWidth={1.6} />
                  )}
                  <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${toneClass.text}`}>{version.label}</p>
                  <h3 className="mt-4 text-xl font-semibold tracking-[-0.04em] text-ink">{version.title}</h3>
                  <p className="mt-4 text-5xl font-semibold tracking-[-0.06em] text-ink">{version.health}</p>
                  <p className="mt-3 text-sm leading-6 text-muted">{version.note}</p>
                  <div className="mt-5 h-1.5 bg-white/[0.08]">
                    <div className={`h-full ${toneClass.gradient}`} style={{ width: `${55 + index * 18}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
          <p className="relative mt-5 border-t border-white/[0.08] pt-4 text-sm leading-6 text-muted">
            Advanced monitoring features are marked Coming Soon. Pro focuses on the live workflow: full reports,
            drilldowns, comparisons, strategy sets, and monitoring.
          </p>
        </div>
      </div>
    </section>
  );
}

function PlanAccess({
  currentPlan,
  isAuthenticated,
  onPricing
}: {
  currentPlan: PlanId;
  isAuthenticated: boolean;
  onPricing: () => void;
}) {
  return (
    <section className="relative z-10 border-y border-white/[0.08] bg-[radial-gradient(circle_at_80%_0%,rgba(124,92,255,0.035),transparent_30rem),rgba(3,6,12,0.28)] py-12 md:py-14">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
            Choose how deep you want to inspect performance.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            Free previews the diagnostic layer. Pro unlocks the full workflow. Advanced is the monitoring roadmap.
          </p>
        </div>
        {isAuthenticated && (
          <p className={`shrink-0 border px-4 py-3 text-sm ${currentPlanPillClass(currentPlan)}`}>
            Current plan: <span className="font-semibold">{planConfigs[currentPlan].displayName}</span>
          </p>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {planOrder.map((planId) => (
          <PlanProgressCard key={planId} planId={planId} active={currentPlan === planId} />
        ))}
      </div>
      <div className="mt-8 overflow-x-auto border border-white/[0.08] bg-[#050a12]/94">
        <table className="min-w-full text-sm">
          <thead className="border-b border-white/[0.1] bg-white/[0.03] text-left text-muted">
            <tr>
              <th className="px-5 py-4 font-medium">Feature</th>
              {planOrder.map((planId) => (
                <th key={planId} className={`px-5 py-4 font-medium ${currentPlanTableClass(currentPlan, planId, "head")}`}>
                  {planConfigs[planId].displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {featureRows.map((row, index) => (
              <tr key={row.label} className={index % 2 === 1 ? "bg-white/[0.018]" : ""}>
                <td className="px-5 py-4 font-semibold text-ink">{row.label}</td>
                {planOrder.map((planId) => (
                  <td key={planId} className={`px-5 py-4 ${currentPlanTableClass(currentPlan, planId, "body")}`}>
                    <AccessValue value={row.access[planId]} planId={planId} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isAuthenticated && (
        <button className="EdgeTrace-secondary-button mt-5" onClick={onPricing}>
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

function MiniReadout({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const toneClass = toneClasses[tone];
  return (
    <div className="border border-white/[0.08] bg-black/25 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={`mt-2 text-lg font-semibold tracking-[-0.04em] ${toneClass.text}`}>{value}</p>
    </div>
  );
}

function PlanProgressCard({ planId, active }: { planId: PlanId; active: boolean }) {
  const config = planConfigs[planId];
  const toneClass = toneClasses[planToneFromId(planId)];
  const bullets =
    planId === "advanced"
      ? ["Recurring strategy reviews", "Regression alerts", "Edge Stability Score", "Future team/API support"]
      : config.featureBullets.slice(0, 4);

  return (
    <article className={`border p-5 ${active ? `${toneClass.border} bg-[#07101c]` : "border-white/[0.1] bg-[#050a12]/92"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{config.displayName}</h3>
          <p className={`mt-2 text-sm font-semibold ${toneClass.text}`}>{config.monthlyPriceLabel}</p>
        </div>
        {active && <span className={`border px-3 py-1 text-xs font-semibold ${toneClass.border} ${toneClass.text}`}>Current</span>}
      </div>
      <p className="mt-4 text-base font-semibold text-ink">{config.description}</p>
      <div className="mt-4 h-2 bg-white/[0.08]">
        <div className={`h-full ${toneClass.gradient}`} style={{ width: `${planDepth[planId]}%` }} />
      </div>
      <ul className="mt-4 space-y-2.5">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-3 text-sm leading-5 text-muted">
            <Check className={`mt-0.5 shrink-0 ${toneClass.text}`} size={15} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PlanBadge({ label }: { label: string }) {
  const toneClass = toneClasses[planToneFromLabel(label)];
  return (
    <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${toneClass.border} ${toneClass.text} ${toneClass.bg}`}>
      {label}
    </span>
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

function planToneFromLabel(label: string): Tone {
  if (label.toLowerCase().includes("advanced")) return "amber";
  if (label.toLowerCase().includes("pro")) return "purple";
  return "cyan";
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
    border: "border-cyan/35",
    gradient: "bg-gradient-to-r from-cyan to-accent"
  },
  purple: {
    text: "text-violet",
    bg: "bg-violet/[0.055]",
    border: "border-violet/35",
    gradient: "bg-gradient-to-r from-accent to-violet"
  },
  amber: {
    text: "text-warning",
    bg: "bg-warning/[0.055]",
    border: "border-warning/35",
    gradient: "bg-gradient-to-r from-warning to-violet"
  }
} as const;

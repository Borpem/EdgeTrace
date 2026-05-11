import { useEffect } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  Database,
  FileSearch,
  Gauge,
  GitCompare,
  Layers,
  LineChart,
  Minus,
  Route,
  Search,
  ShieldCheck,
  UploadCloud,
  type LucideIcon
} from "lucide-react";
import { PageShell } from "../components/ui/Primitives";
import { trackEvent } from "../lib/analytics";
import { canUseFeature, getPlanConfig } from "../lib/entitlements";
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

type WorkflowStage = {
  number: string;
  title: string;
  description: string;
  plan: "FREE" | "PRO" | "ADVANCED";
  icon: LucideIcon;
  tone: "cyan" | "purple" | "amber";
};

const workflowStages: WorkflowStage[] = [
  {
    number: "01",
    title: "Import Trades",
    description: "Upload completed broker exports or CSV history.",
    plan: "FREE",
    icon: UploadCloud,
    tone: "cyan"
  },
  {
    number: "02",
    title: "Create Diagnostic Report",
    description: "Generate health, expectancy, cost drag, and R-capture analysis.",
    plan: "FREE",
    icon: FileSearch,
    tone: "cyan"
  },
  {
    number: "03",
    title: "Review Primary Diagnosis",
    description: "See the largest issue affecting performance.",
    plan: "FREE",
    icon: Gauge,
    tone: "cyan"
  },
  {
    number: "04",
    title: "Inspect Leaks",
    description: "Break down symbols, setups, time windows, and strategy segments.",
    plan: "PRO",
    icon: Search,
    tone: "purple"
  },
  {
    number: "05",
    title: "Compare Iterations",
    description: "Measure whether changes improved or degraded the edge.",
    plan: "PRO",
    icon: GitCompare,
    tone: "purple"
  },
  {
    number: "06",
    title: "Build Strategy Set",
    description: "Track related reports across strategy iterations.",
    plan: "PRO",
    icon: Layers,
    tone: "purple"
  },
  {
    number: "07",
    title: "Monitor Strategy Health",
    description: "Identify instability, regression risk, and behavioral deterioration.",
    plan: "ADVANCED",
    icon: LineChart,
    tone: "amber"
  }
];

const capabilityGroups: Array<{
  title: string;
  summary: string;
  accent: "cyan" | "purple" | "amber";
  features: Array<{
    id: string;
    title: string;
    feature?: FeatureKey;
    plan: "Free" | "Pro" | "Advanced";
    icon: LucideIcon;
    summary: string;
    detail: string;
  }>;
}> = [
  {
    title: "Diagnostics",
    summary: "Turn messy completed trade history into a report that explains current performance.",
    accent: "cyan",
    features: [
      {
        id: "diagnostic-reports",
        title: "Diagnostic Reports",
        feature: "full_report_access",
        plan: "Free",
        icon: FileSearch,
        summary: "Health, primary diagnosis, expectancy, cost drag, R capture, and next inspection.",
        detail:
          "Single-report analysis showing strategy health, primary diagnosis, expectancy, cost drag, R capture, and where to inspect next."
      },
      {
        id: "import-provenance",
        title: "Import Provenance",
        plan: "Free",
        icon: ShieldCheck,
        summary: "Source, confidence, warnings, reconstruction status, and included data.",
        detail:
          "Every report can show how it was created: source file, broker, confidence, warnings, reconstruction status, and included data."
      },
      {
        id: "broker-imports",
        title: "Broker-Aware Imports",
        feature: "broker_imports",
        plan: "Pro",
        icon: Database,
        summary: "Detect and normalize supported broker exports and generic CSV files.",
        detail: "EdgeTrace detects and normalizes trade files from supported brokers and generic CSV exports."
      }
    ]
  },
  {
    title: "Attribution",
    summary: "Separate what changed, where performance leaked, and which segments deserve review.",
    accent: "purple",
    features: [
      {
        id: "drilldowns",
        title: "Drilldowns",
        feature: "full_drilldowns",
        plan: "Pro",
        icon: Search,
        summary: "Break performance down by symbol, setup, time window, and segment.",
        detail:
          "Drilldowns reveal which symbols, setups, time windows, and trades are contributing to performance leaks."
      },
      {
        id: "compare",
        title: "Compare",
        feature: "full_compare",
        plan: "Pro",
        icon: GitCompare,
        summary: "Compare two reports to identify what improved, degraded, or introduced leakage.",
        detail: "Compare two reports to identify what improved, degraded, or introduced new leakage."
      },
      {
        id: "reconstruction-audit",
        title: "Reconstruction Audit",
        feature: "reconstruction_audit",
        plan: "Pro",
        icon: Route,
        summary: "Review how execution-level records were reconstructed into completed trades.",
        detail:
          "For execution-level broker files, EdgeTrace can reconstruct completed trades and explain how they were built."
      }
    ]
  },
  {
    title: "Monitoring",
    summary: "Move from one-off reports to an ongoing strategy review system.",
    accent: "amber",
    features: [
      {
        id: "strategy-sets",
        title: "Strategy Sets",
        feature: "strategy_sets",
        plan: "Pro",
        icon: Layers,
        summary: "Group related reports to track strategy iterations over time.",
        detail: "Group related reports to track iterations and monitor whether a strategy is improving over time."
      },
      {
        id: "strategy-monitoring",
        title: "Strategy Monitoring",
        feature: "strategy_health_monitoring",
        plan: "Pro",
        icon: LineChart,
        summary: "Track current-vs-best behavior, regression flags, stability, and drift.",
        detail:
          "Track expectancy, cost drag, R capture, current-vs-best behavior, regression flags, and stability over time."
      },
      {
        id: "exports",
        title: "Exports",
        feature: "audit_exports",
        plan: "Pro",
        icon: BarChart3,
        summary: "Export report and audit details where available for review or recordkeeping.",
        detail: "Export audit and report details where available for review or recordkeeping."
      }
    ]
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

  const heroAccountAction = isAuthenticated ? onAnalyze : onSignup ?? onAnalyze;
  const heroAccountLabel = isAuthenticated ? "Create Diagnostic Report" : "Create Free Account";

  return (
    <PageShell className="relative z-10 pb-16">
      <section className="relative z-10 overflow-hidden border-b border-white/[0.08] py-12 md:py-16">
        <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,197,245,0.11),rgba(124,92,255,0.06)_42%,transparent_72%)] blur-[118px]" />
        <div className="relative mx-auto max-w-5xl">
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink md:text-6xl xl:text-7xl">
            Understand every layer of your trading performance.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted md:text-lg md:leading-8">
            EdgeTrace turns completed trade history into diagnostics, attribution, comparisons, strategy monitoring,
            and actionable review workflows.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="EdgeTrace-primary-button" onClick={onDemo ?? onAnalyze}>
              Try Interactive Demo <ArrowRight size={16} />
            </button>
            <button className="EdgeTrace-secondary-button" onClick={heroAccountAction}>
              {heroAccountLabel}
            </button>
            <button className="EdgeTrace-secondary-button" onClick={onPricing}>
              View Pricing
            </button>
          </div>
        </div>
      </section>

      <section className="relative z-10 py-10 md:py-12">
        <div className="mb-7">
          <h2 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
            From import to strategy monitoring.
          </h2>
        </div>
        <div className="relative isolate">
          <div className="relative z-10 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {workflowStages.map((stage, index) => (
              <WorkflowStageCard key={stage.title} stage={stage} showConnector={index < workflowStages.length - 1} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/[0.08] bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,245,0.035),transparent_32rem),rgba(3,6,12,0.28)] py-11 md:py-14">
        <div className="mb-8 max-w-4xl">
          <h2 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
            What EdgeTrace analyzes.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            Each layer isolates a different source of strategy performance without making every detail compete for
            attention at once.
          </p>
        </div>
        <div className="space-y-7">
          {capabilityGroups.map((group) => (
            <CapabilityGroup key={group.title} group={group} planId={plan.id} />
          ))}
        </div>
      </section>

      <section className="relative z-10 py-11 md:py-14">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
              Choose how deep you want to inspect performance.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
              Start with one full diagnostic, unlock the complete workflow with Pro, and prepare for continuous
              monitoring with Advanced.
            </p>
          </div>
          {isAuthenticated && (
            <p className={`shrink-0 border px-4 py-3 text-sm text-muted ${currentPlanPillClass(plan.id)}`}>
              Current plan: <span className="font-semibold">{plan.displayName}</span>
            </p>
          )}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {planOrder.map((planId) => (
            <PlanProgressCard key={planId} planId={planId} active={plan.id === planId} />
          ))}
        </div>
      </section>

      <section className="relative z-10 border-y border-white/[0.08] bg-[radial-gradient(circle_at_80%_0%,rgba(124,92,255,0.035),transparent_30rem),rgba(3,6,12,0.28)] py-11 md:py-14">
        <div className="mx-auto mb-6 grid max-w-6xl gap-4 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <h2 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
              Feature access by plan.
            </h2>
          </div>
          <p className="max-w-3xl text-base leading-7 text-muted">
            The table gives the precise access model for reports, attribution, monitoring, and Advanced capabilities.
          </p>
        </div>
        <div className="mx-auto max-w-6xl overflow-x-auto border border-white/[0.08] bg-[#050a12]/92">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/[0.1] bg-white/[0.03] text-left text-muted">
              <tr>
                <th className="px-5 py-4 font-medium">Feature</th>
                {planOrder.map((planId) => (
                  <th
                    key={planId}
                    className={`px-5 py-4 font-medium ${currentPlanTableClass(plan.id, planId, "head")}`}
                  >
                    {planConfigs[planId].displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {featureRows.map((row, index) => (
                <tr key={row.label} className={index % 2 === 1 ? "bg-white/[0.018]" : ""}>
                  <td className="px-5 py-4 font-semibold text-ink">{row.label}</td>
                  {planOrder.map((planId) => (
                    <td key={planId} className={`px-5 py-4 ${currentPlanTableClass(plan.id, planId, "body")}`}>
                      <AccessValue value={row.access[planId]} planId={planId} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="relative z-10 pt-11 md:pt-14">
        <div className="relative overflow-hidden border border-cyan/25 bg-[radial-gradient(circle_at_18%_0%,rgba(34,197,245,0.12),transparent_34%),radial-gradient(circle_at_88%_92%,rgba(124,92,255,0.1),transparent_36%),rgba(255,255,255,0.03)] p-7 md:p-9">
          <div className="max-w-4xl">
            <h2 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
              Start with your own completed trades.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
              Create a free account to generate your first full diagnostic report, then decide whether the Pro workflow
              fits how you review strategy changes.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="EdgeTrace-primary-button" onClick={heroAccountAction}>
                {heroAccountLabel} <ArrowRight size={16} />
              </button>
              <button className="EdgeTrace-secondary-button" onClick={onPricing}>
                View Pricing
              </button>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function WorkflowStageCard({ stage, showConnector }: { stage: WorkflowStage; showConnector: boolean }) {
  const Icon = stage.icon;
  const toneClass = toneClasses[stage.tone];

  return (
    <article
      className="relative z-10 border border-white/[0.12] bg-[#050a12] p-4 shadow-[0_0_0_1px_rgba(3,6,12,0.92),0_18px_44px_-36px_rgba(0,0,0,0.95)] transition hover:border-white/[0.18] hover:bg-[#07101c]"
    >
      {showConnector && (
        <ArrowRight
          className="pointer-events-none absolute -right-3 top-8 z-20 hidden text-muted/45 xl:block"
          size={16}
          strokeWidth={1.6}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-12 w-12 place-items-center border ${toneClass.border} ${toneClass.bg} ${toneClass.text}`}>
          <Icon size={23} strokeWidth={1.7} />
        </div>
        <span className={`w-fit border px-2 py-1 text-[10px] font-semibold ${toneClass.border} ${toneClass.text}`}>
          {stage.plan}
        </span>
      </div>
      <p className="mt-5 text-sm font-semibold text-muted">{stage.number}</p>
      <h3 className="mt-2 text-xl font-semibold leading-tight tracking-[-0.04em] text-ink">{stage.title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted">{stage.description}</p>
    </article>
  );
}

function CapabilityGroup({ group, planId }: { group: (typeof capabilityGroups)[number]; planId: PlanId }) {
  return (
    <section className="grid gap-5 py-2 lg:grid-cols-[230px_1fr]">
      <div className="bg-transparent lg:pt-4">
        <div className={`mb-4 h-px w-16 ${toneClasses[group.accent].gradient}`} />
        <h3 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{group.title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted">{group.summary}</p>
      </div>
      <div className="grid gap-3 border-t border-white/[0.075] pt-5 md:grid-cols-3">
        {group.features.map((feature) => {
          const Icon = feature.icon;
          const included = feature.feature ? canUseFeature(getPlanConfig(planId), feature.feature) : true;
          const toneClass = toneClasses[group.accent];
          return (
            <article
              id={feature.id}
              key={feature.id}
              className="scroll-mt-28 border border-white/[0.08] bg-[#050a12]/92 p-4 transition hover:border-white/[0.16] hover:bg-[#07101c]"
            >
              <div className="flex items-start justify-between gap-3">
                <Icon className={toneClass.text} size={24} strokeWidth={1.7} />
                <PlanBadge label={feature.plan} active={included} />
              </div>
              <h4 className="mt-5 text-lg font-semibold tracking-[-0.035em] text-ink">{feature.title}</h4>
              <p className="mt-3 text-sm leading-6 text-muted">{feature.summary}</p>
              <p className="mt-4 border-t border-white/[0.08] pt-4 text-xs leading-5 text-muted/85">{feature.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlanProgressCard({ planId, active }: { planId: PlanId; active: boolean }) {
  const config = planConfigs[planId];
  const tone = planId === "free" ? "cyan" : planId === "pro" ? "purple" : "amber";
  const toneClass = toneClasses[tone];

  return (
    <article className={`border p-4 md:p-5 ${active ? `${toneClass.border} bg-[#07101c]` : "border-white/[0.1] bg-[#050a12]/90"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{config.displayName}</h3>
          <p className="mt-2 text-sm text-muted">{config.monthlyPriceLabel}</p>
        </div>
        {active && <span className={`border px-3 py-1 text-xs font-semibold ${toneClass.border} ${toneClass.text}`}>Current</span>}
      </div>
      <p className="mt-4 text-base font-semibold text-ink">{config.description}</p>
      <div className="mt-4 h-2 bg-white/[0.08]">
        <div className={`h-full ${toneClass.gradient}`} style={{ width: `${planDepth[planId]}%` }} />
      </div>
      <ul className="mt-4 space-y-2.5">
        {config.featureBullets.slice(0, 5).map((bullet) => (
          <li key={bullet} className="flex gap-3 text-sm leading-5 text-muted">
            <Check className={`mt-0.5 shrink-0 ${toneClass.text}`} size={15} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PlanBadge({ label, active }: { label: string; active: boolean }) {
  const tone = planToneFromLabel(label);
  const toneClass = toneClasses[tone];
  return (
    <span
      className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
        active ? `${toneClass.border} ${toneClass.text} ${toneClass.bg}` : `${toneClass.border} ${toneClass.text} bg-black/20`
      }`}
    >
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

function planToneFromLabel(label: string): "cyan" | "purple" | "amber" {
  if (label.toLowerCase().includes("advanced")) return "amber";
  if (label.toLowerCase().includes("pro")) return "purple";
  return "cyan";
}

function planToneFromId(planId: PlanId): "cyan" | "purple" | "amber" {
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

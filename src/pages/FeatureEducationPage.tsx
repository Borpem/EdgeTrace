import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
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
  ShieldAlert,
  UploadCloud,
  Users,
  type LucideIcon
} from "lucide-react";
import { PageShell } from "../components/ui/Primitives";
import { trackEvent } from "../lib/analytics";
import { getActivationSummary, listReports } from "../lib/api";
import { canUseFeature, getPlanConfig } from "../lib/entitlements";
import { planConfigs, planOrder, type FeatureKey, type PlanId } from "../lib/plans";
import type { ActivationSummary, ReportSummary, UserProfile } from "../types";

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
    description: "See the single largest issue affecting performance.",
    plan: "FREE",
    icon: Gauge,
    tone: "cyan"
  },
  {
    number: "04",
    title: "Inspect Leaks",
    description: "Analyze symbols, setups, time windows, and strategy segments.",
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
    description: "Track related reports across iterations and strategy evolution.",
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

const advancedPreviewFeatures: Array<{ title: string; body: string; icon: LucideIcon }> = [
  {
    title: "Recurring strategy reviews",
    body: "Periodic summaries of what improved, weakened, or deserves review.",
    icon: Activity
  },
  {
    title: "Regression alerts",
    body: "Flag when expectancy, cost drag, or R capture starts moving the wrong way.",
    icon: Bell
  },
  {
    title: "Edge Stability Score",
    body: "A durability readout based on consistency, outliers, losses, and segment concentration.",
    icon: Gauge
  },
  {
    title: "Strategy deterioration monitoring",
    body: "Track whether a strategy is becoming unstable across reports and iterations.",
    icon: ShieldAlert
  },
  {
    title: "Future team/API support",
    body: "Designed for deeper workflows, shared review, and programmatic access later.",
    icon: Users
  }
];

export function FeatureEducationPage({
  profile,
  isAuthenticated = Boolean(profile),
  onAnalyze,
  onPricing,
  onDemo,
  onSignup,
  onOpenReport,
  onCreateStrategySet
}: FeatureEducationPageProps) {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [activation, setActivation] = useState<ActivationSummary | null>(null);
  const plan = getPlanConfig(profile?.planId);
  const latestReport = reports[0];

  useEffect(() => {
    trackEvent(isAuthenticated ? "feature_education_opened" : "public_how_it_works_opened");
    if (!isAuthenticated) {
      setReports([]);
      setActivation(null);
      return;
    }
    void listReports()
      .then((response) => setReports(Array.isArray(response.reports) ? response.reports : []))
      .catch(() => setReports([]));
    void getActivationSummary().then(setActivation).catch(() => setActivation(null));
  }, [isAuthenticated]);

  useEffect(() => {
    const feature = new URLSearchParams(window.location.search).get("feature");
    if (!feature) return;
    const targetId = feature.replace(/_/g, "-");
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const nextAction = useMemo(() => {
    if (!isAuthenticated) {
      return {
        title: "Preview the workflow before creating an account.",
        body: "Open the public demo to see how a completed trade file becomes a diagnostic report, attribution path, and next inspection.",
        cta: "Try Interactive Demo",
        action: onDemo ?? onSignup ?? onAnalyze
      };
    }
    if (!activation?.hasCreatedReport) {
      return {
        title: "Start with your first diagnostic report.",
        body: "Upload completed trade history and generate the first performance leak readout.",
        cta: "Analyze Trades",
        action: onAnalyze
      };
    }
    if (!activation?.hasClickedDrilldown && latestReport && onOpenReport) {
      return {
        title: "Inspect the primary leak.",
        body: "Open the latest report and use the recommended next inspection path.",
        cta: "Open Latest Report",
        action: () => onOpenReport(latestReport.id)
      };
    }
    if (!activation?.hasCreatedComparison) {
      return {
        title: "Create another report and compare changes.",
        body: "Comparisons show what improved, degraded, or introduced new leakage between reports.",
        cta: "Create New Report",
        action: onAnalyze
      };
    }
    if (!activation?.hasCreatedCollection) {
      return {
        title: "Group reports into a strategy set.",
        body: "Strategy sets help you track related iterations over time.",
        cta: "Create Strategy Set",
        action: onCreateStrategySet ?? onAnalyze
      };
    }
    return {
      title: plan.id === "advanced" ? "Monitor durability over time." : "Use strategy sets to track progress.",
      body:
        plan.id === "free"
          ? "Your first report gives you the full diagnostic experience. Upgrade to Pro when you are ready to track strategy changes continuously."
          : plan.id === "pro"
            ? "Use strategy sets and monitoring to track improvement over time."
            : "Review regression alerts, strategy digests, and Edge Stability Score to monitor durability.",
      cta: plan.id === "free" ? "View Pricing" : "Analyze Trades",
      action: plan.id === "free" ? onPricing : onAnalyze
    };
  }, [activation, isAuthenticated, latestReport, onAnalyze, onCreateStrategySet, onDemo, onOpenReport, onPricing, onSignup, plan.id]);

  const heroAccountAction = isAuthenticated ? onAnalyze : onSignup ?? onAnalyze;
  const heroAccountLabel = isAuthenticated ? "Create Diagnostic Report" : "Create Free Account";

  return (
    <PageShell className="relative z-10 pb-16">
      <section className="relative z-10 overflow-hidden border-b border-white/[0.08] pb-10 pt-1 md:pb-12">
        <div className="pointer-events-none absolute left-[56%] top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-cyan/10 blur-[110px]" />
        <div className="relative grid gap-7 lg:grid-cols-[1fr_0.95fr] lg:items-center">
          <div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink md:text-6xl xl:text-7xl">
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
          <ProgressionPanel />
        </div>
      </section>

      <section className="relative z-10 py-10 md:py-12">
        <div className="mb-6 grid gap-4 lg:grid-cols-[0.74fr_1fr] lg:items-end">
          <h2 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
            From import to strategy monitoring.
          </h2>
          <p className="max-w-2xl text-base leading-7 text-muted">
            Follow how a completed trade file becomes a diagnostic workflow, then a repeatable strategy review system.
          </p>
        </div>
        <div className="relative">
          <div className="absolute left-[7%] right-[7%] top-[4.4rem] hidden h-px bg-gradient-to-r from-cyan/25 via-violet/22 to-warning/18 xl:block" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {workflowStages.map((stage, index) => (
              <WorkflowStageCard key={stage.title} stage={stage} offset={index % 2 === 1} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/[0.08] bg-[#03060c]/55 py-11 md:py-14">
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

      <AdvancedPreviewSection />

      <section className="relative z-10 border-y border-white/[0.08] bg-[#03060c]/55 py-11 md:py-14">
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
              Preview the workflow before creating an account.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
              See how completed trade history becomes diagnostics, attribution paths, and strategy monitoring.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="EdgeTrace-primary-button" onClick={onDemo ?? onAnalyze}>
                Try Interactive Demo <ArrowRight size={16} />
              </button>
              <button className="EdgeTrace-secondary-button" onClick={onPricing}>
                View Pricing
              </button>
            </div>
          </div>
          <div className="mt-7 flex flex-col gap-4 border-t border-white/[0.1] pt-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">{nextAction.title}</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{nextAction.body}</p>
            </div>
            <button className="EdgeTrace-command-button shrink-0" onClick={nextAction.action}>
              {nextAction.cta}
            </button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function ProgressionPanel() {
  const steps = [
    { label: "Import", metric: "CSV / broker export", icon: UploadCloud },
    { label: "Diagnose", metric: "Health + primary leak", icon: Gauge },
    { label: "Inspect", metric: "Symbol / setup / time", icon: Search },
    { label: "Compare", metric: "Iteration deltas", icon: GitCompare },
    { label: "Monitor", metric: "Regression watch", icon: LineChart }
  ];

  return (
    <div className="relative border border-white/[0.1] bg-[linear-gradient(145deg,rgba(7,12,20,0.96),rgba(6,10,18,0.9))] p-4 shadow-[0_24px_72px_rgba(0,0,0,0.32)] md:p-5 lg:-ml-2">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(124,92,255,0.18),transparent_36%),radial-gradient(circle_at_20%_80%,rgba(34,197,245,0.12),transparent_34%)]" />
      <div className="relative">
        <div className="border-b border-white/[0.1] pb-4">
          <div>
            <p className="text-sm font-semibold text-ink">Workflow progression</p>
            <p className="mt-1 text-xs text-muted">Import to monitoring, one report at a time.</p>
          </div>
        </div>
        <div className="mt-4 space-y-2.5">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="grid grid-cols-[38px_1fr_auto] items-center gap-4">
                <div className="relative">
                  <div className="grid h-9 w-9 place-items-center border border-cyan/25 bg-black/35 text-cyan">
                    <Icon size={17} strokeWidth={1.8} />
                  </div>
                  {index < steps.length - 1 && <div className="absolute left-1/2 top-9 h-3 w-px -translate-x-1/2 bg-cyan/30" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{step.label}</p>
                  <p className="mt-1 truncate text-xs text-muted">{step.metric}</p>
                </div>
                <div className="h-1.5 w-20 bg-white/[0.08]">
                  <div
                    className="h-full bg-gradient-to-r from-cyan to-violet"
                    style={{ width: `${Math.min(100, 32 + index * 15)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WorkflowStageCard({ stage, offset }: { stage: WorkflowStage; offset: boolean }) {
  const Icon = stage.icon;
  const toneClass = toneClasses[stage.tone];

  return (
    <article
      className={`relative border border-white/[0.1] bg-[#050a12]/92 p-4 transition hover:border-white/[0.18] hover:bg-[#07101c] ${
        offset ? "xl:translate-y-4" : ""
      }`}
    >
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
    <section className="grid gap-5 border-t border-white/[0.09] pt-6 lg:grid-cols-[230px_1fr]">
      <div>
        <div className={`mb-4 h-px w-16 ${toneClasses[group.accent].gradient}`} />
        <h3 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{group.title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted">{group.summary}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
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

function AdvancedPreviewSection() {
  return (
    <section className="relative z-10 border-t border-white/[0.08] py-11 md:py-14">
      <div className="mb-6 grid gap-4 lg:grid-cols-[0.74fr_1fr] lg:items-end">
        <div>
          <h2 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
            Continuous strategy intelligence.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            Advanced evolves EdgeTrace from diagnostic reports into continuous monitoring for strategy deterioration
            and review workflows.
          </p>
        </div>
        <p className="max-w-2xl border-l border-warning/35 pl-4 text-sm leading-6 text-muted">
          These capabilities are marked Coming Soon while the beta validates how traders use ongoing strategy
          monitoring.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {advancedPreviewFeatures.map((feature) => {
          const Icon = feature.icon;
          return (
            <article key={feature.title} className="border border-warning/20 bg-[#060a11]/94 p-4">
              <div className="flex items-start justify-between gap-3">
                <Icon className="text-warning" size={23} strokeWidth={1.7} />
                <span className="border border-warning/30 bg-warning/[0.055] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-warning">
                  Coming Soon
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold leading-tight tracking-[-0.035em] text-ink">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{feature.body}</p>
            </article>
          );
        })}
      </div>
    </section>
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

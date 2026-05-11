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
      "Separate where performance is being created or lost across symbols, setups, time windows, and strategy comparisons.",
    tone: "purple",
    icon: Search,
    bullets: ["Symbol performance", "Setup breakdowns", "Time-window attribution", "Report comparisons"],
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

function WorkspaceVisual() {
  return (
    <div className="relative overflow-hidden border border-white/[0.1] bg-[linear-gradient(145deg,rgba(8,13,22,0.98),rgba(4,8,15,0.96))] p-5 shadow-[0_24px_84px_-58px_rgba(88,214,255,0.65)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(124,92,255,0.12),transparent_35%),radial-gradient(circle_at_18%_86%,rgba(34,197,245,0.11),transparent_34%)]" />
      <div className="relative">
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
    </div>
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
          body="EdgeTrace separates expectancy, cost drag, R capture, symbol performance, setup behavior, and time-window attribution so traders can isolate the largest source of edge or leakage."
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
    <div className="relative overflow-hidden border border-white/[0.1] bg-[#050a12]/94 p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(34,197,245,0.12),transparent_30%),radial-gradient(circle_at_86%_82%,rgba(124,92,255,0.1),transparent_36%)]" />
      <div className="relative grid gap-5 md:grid-cols-[0.8fr_auto_1.1fr] md:items-center">
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
    </div>
  );
}

function AttributionVisual() {
  return (
    <div className="relative overflow-hidden border border-white/[0.1] bg-[#050a12]/94 p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(124,92,255,0.11),transparent_34%)]" />
      <div className="relative">
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
    </div>
  );
}

function EvolutionLineVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative overflow-hidden border border-white/[0.1] bg-[#050a12]/94 p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(245,166,35,0.1),transparent_32%),radial-gradient(circle_at_16%_86%,rgba(34,197,245,0.1),transparent_32%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          {[
            ["V1", "Baseline"],
            ["V2", "Improved"],
            ["V3", "Monitor"]
          ].map(([version, label], index) => (
            <div key={version} className="relative flex-1">
              {index < 2 && <div className="absolute left-[54%] top-5 hidden h-px w-[92%] bg-white/[0.14] sm:block" />}
              <div className={`relative z-10 grid h-11 w-11 place-items-center border ${index === 0 ? "border-cyan/35 text-cyan" : index === 1 ? "border-violet/35 text-violet" : "border-warning/35 text-warning"} bg-black/35`}>
                {version}
              </div>
              <p className="mt-3 text-sm font-semibold text-ink">{label}</p>
              {!compact && <p className="mt-1 text-xs text-muted">Strategy iteration</p>}
            </div>
          ))}
        </div>
        <svg className="mt-8 h-32 w-full overflow-visible" viewBox="0 0 420 130" role="img" aria-label="Strategy evolution line">
          <path d="M8 98 C68 92, 106 84, 150 72 S224 36, 284 48 S356 74, 412 44" fill="none" stroke="rgba(88,214,255,0.85)" strokeWidth="3" />
          <path d="M8 106 C88 105, 156 96, 220 88 S324 82, 412 78" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
          <circle cx="150" cy="72" r="4" fill="rgba(124,92,255,1)" />
          <circle cx="412" cy="44" r="4" fill="rgba(245,166,35,1)" />
        </svg>
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
            EdgeTrace helps traders compare iterations, monitor stability, and identify degradation before weak behavior
            compounds.
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
        <EvolutionLineVisual />
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
    <section className="relative z-10 border-y border-white/[0.08] bg-[radial-gradient(circle_at_80%_0%,rgba(124,92,255,0.035),transparent_30rem),rgba(3,6,12,0.24)] py-12 md:py-16">
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
            Choose how deep you want to inspect performance.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            EdgeTrace scales from a first diagnostic report to full attribution, comparison, monitoring, and future
            strategy intelligence workflows.
          </p>
        </div>
        {isAuthenticated && (
          <p className={`shrink-0 border px-4 py-3 text-sm ${currentPlanPillClass(currentPlan)}`}>
            Current plan: <span className="font-semibold">{planConfigs[currentPlan].displayName}</span>
          </p>
        )}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {planOrder.map((planId) => {
          const toneClass = toneClasses[planToneFromId(planId)];
          return (
            <div key={planId} className={`border px-4 py-3 ${toneClass.border} ${toneClass.bg}`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${toneClass.text}`}>
                {planConfigs[planId].displayName}
              </p>
              <p className="mt-2 text-sm text-muted">
                {planId === "free"
                  ? "First diagnostic and previews"
                  : planId === "pro"
                    ? "Full workflow access"
                    : "Coming soon monitoring"}
              </p>
            </div>
          );
        })}
      </div>

      <div>
        <div className="overflow-x-auto border border-white/[0.1] bg-[#050a12]/94 shadow-[0_18px_60px_-52px_rgba(88,214,255,0.45)]">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/[0.1] bg-white/[0.035] text-left text-muted">
              <tr>
                <th className="px-5 py-4 font-semibold text-ink">Feature access</th>
                {planOrder.map((planId) => (
                  <th key={planId} className={`px-5 py-4 font-semibold ${currentPlanTableClass(currentPlan, planId, "head")}`}>
                    {planConfigs[planId].displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {featureRows.map((row, index) => (
                <tr key={row.label} className={index % 2 === 1 ? "bg-white/[0.016]" : ""}>
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

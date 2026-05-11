import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import { DisclosurePanel } from "../components/DisclosurePanel";
import { CinematicDashboardVisual } from "../components/marketing/CinematicDashboardVisual";
import { StrategyEvolutionVisual } from "../components/marketing/StrategyEvolutionVisual";
import { PlanAccessGraphic } from "../components/visuals/PlanAccessGraphic";
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

const workflowSteps = [
  ["01", "Import Trades", "Upload completed broker or CSV history.", "Free"],
  ["02", "Create Diagnostic Report", "Generate strategy health, diagnosis, cost drag, and R capture.", "Free"],
  ["03", "Review Primary Diagnosis", "Start from the single issue most likely affecting performance.", "Free"],
  ["04", "Inspect Leaks", "Open attribution drilldowns by symbol, setup, strategy, or time bucket.", "Pro"],
  ["05", "Compare Iterations", "See what improved, degraded, or introduced new leakage.", "Pro"],
  ["06", "Build Strategy Set", "Group related reports into a strategy timeline.", "Pro"],
  ["07", "Monitor Strategy Health", "Track current-vs-best behavior, regression risk, and stability.", "Pro / Advanced"]
];

const featureCards: Array<{
  id: string;
  title: string;
  feature?: FeatureKey;
  plan: "Free" | "Pro" | "Advanced";
  explanation: string;
}> = [
  {
    id: "diagnostic-reports",
    title: "Diagnostic Reports",
    feature: "full_report_access",
    plan: "Free",
    explanation:
      "Single-report analysis showing strategy health, primary diagnosis, expectancy, cost drag, R capture, and where to inspect next."
  },
  {
    id: "broker-imports",
    title: "Broker-Aware Imports",
    feature: "broker_imports",
    plan: "Pro",
    explanation: "EdgeTrace detects and normalizes trade files from supported brokers and generic CSV exports."
  },
  {
    id: "import-provenance",
    title: "Import Provenance",
    plan: "Free",
    explanation:
      "Every report can show how it was created: source file, broker, confidence, warnings, reconstruction status, and included data."
  },
  {
    id: "drilldowns",
    title: "Drilldowns",
    feature: "full_drilldowns",
    plan: "Pro",
    explanation:
      "Drilldowns reveal which symbols, setups, time windows, and trades are contributing to performance leaks."
  },
  {
    id: "compare",
    title: "Compare",
    feature: "full_compare",
    plan: "Pro",
    explanation: "Compare two reports to identify what improved, degraded, or introduced new leakage."
  },
  {
    id: "strategy-sets",
    title: "Strategy Sets",
    feature: "strategy_sets",
    plan: "Pro",
    explanation: "Group related reports to track iterations and monitor whether a strategy is improving over time."
  },
  {
    id: "strategy-monitoring",
    title: "Strategy Monitoring",
    feature: "strategy_health_monitoring",
    plan: "Pro",
    explanation:
      "Track expectancy, cost drag, R capture, current-vs-best behavior, regression flags, and stability over time."
  },
  {
    id: "reconstruction-audit",
    title: "Reconstruction Audit",
    feature: "reconstruction_audit",
    plan: "Pro",
    explanation:
      "For execution-level broker files, EdgeTrace can reconstruct completed trades and explain how they were built."
  },
  {
    id: "exports",
    title: "Exports",
    feature: "audit_exports",
    plan: "Pro",
    explanation: "Export audit and report details where available for review or recordkeeping."
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

  return (
    <main className="EdgeTrace-shell py-10">
      <section className="border-y border-white/[0.1] py-10">
        <div className="grid gap-8 xl:grid-cols-[1fr_360px] xl:items-end">
          <div>
            <p className="EdgeTrace-eyebrow">How It Works</p>
            <h1 className="EdgeTrace-title">Understand every layer of your trading performance.</h1>
            <p className="EdgeTrace-copy">A visual guide to reports, drilldowns, comparisons, strategy sets, and plan access.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              {isAuthenticated ? (
                <>
                  <button className="EdgeTrace-primary-button" onClick={onAnalyze}>
                    Create Diagnostic Report <ArrowRight size={16} />
                  </button>
                  {plan.id === "free" && (
                    <button className="EdgeTrace-secondary-button" onClick={onPricing}>
                      View Pricing
                    </button>
                  )}
                </>
              ) : (
                <>
                  {onDemo && (
                    <button className="EdgeTrace-primary-button" onClick={onDemo}>
                      Try Interactive Demo <ArrowRight size={16} />
                    </button>
                  )}
                  {onSignup && (
                    <button className="EdgeTrace-secondary-button" onClick={onSignup}>
                      Create Free Account
                    </button>
                  )}
                  <button className="EdgeTrace-secondary-button" onClick={onPricing}>
                    View Pricing
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="border border-cyan/30 bg-cyan/[0.045] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">
              {isAuthenticated ? "Current Plan" : "Plan Guide"}
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-ink">
              {isAuthenticated ? plan.displayName : "Free to Advanced"}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {isAuthenticated
                ? plan.description
                : "Review the full feature scope before creating an account. Free starts with one full diagnostic; Pro unlocks the workflow."}
            </p>
          </div>
        </div>
        <CinematicDashboardVisual compact className="mt-10" />
      </section>

      <section className="mt-10">
        <div className="mb-5">
          <p className="EdgeTrace-eyebrow">Workflow</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-ink">From import to strategy monitoring.</h2>
        </div>
        <StrategyEvolutionVisual compact className="mb-5" />
        <div className="grid border border-white/[0.1] md:grid-cols-2 xl:grid-cols-7">
          {workflowSteps.map(([number, title, description, includedPlan]) => (
            <article key={title} className="min-h-52 border-b border-r border-white/[0.08] p-4 last:border-r-0 md:last:border-b-0">
              <p className="text-xs font-semibold text-cyan">{number}</p>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.035em] text-ink">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{includedPlan}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <p className="EdgeTrace-eyebrow">Feature Guide</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-ink">What each layer does.</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((feature) => (
            <article
              id={feature.id}
              key={feature.id}
              className="scroll-mt-28 border border-white/[0.1] bg-white/[0.025] p-5"
            >
              <FeatureThumbnail id={feature.id} />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-semibold tracking-[-0.04em] text-ink">{feature.title}</h3>
                <PlanBadge label={feature.plan} active={feature.feature ? canUseFeature(plan, feature.feature) : true} />
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">{shortFeatureCopy(feature.explanation)}</p>
              <DisclosurePanel className="mt-4" title="Expand details" compact>
                <p className="text-sm leading-6 text-muted">{feature.explanation}</p>
              </DisclosurePanel>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="EdgeTrace-eyebrow">Plan Access</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-ink">What your plan includes.</h2>
          </div>
          {isAuthenticated ? (
            <p className="text-sm text-muted">
              Current plan: <span className="font-semibold text-cyan">{plan.displayName}</span>
            </p>
          ) : (
            <p className="text-sm text-muted">Public preview: compare plans before signing up.</p>
          )}
        </div>
        <PlanAccessGraphic className="mb-5" />
        <div className="overflow-x-auto border border-white/[0.1]">
          <table className="min-w-full text-sm">
            <thead className="border-b border-white/[0.1] text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Feature</th>
                {planOrder.map((planId) => (
                  <th
                    key={planId}
                    className={`px-4 py-3 font-medium ${plan.id === planId ? "bg-cyan/[0.08] text-cyan" : ""}`}
                  >
                    {planConfigs[planId].displayName}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">{isAuthenticated ? "Your Access" : "Free Preview"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {featureRows.map((row) => (
                <tr key={row.label}>
                  <td className="px-4 py-3 font-semibold text-ink">{row.label}</td>
                  {planOrder.map((planId) => (
                    <td key={planId} className={`px-4 py-3 ${plan.id === planId ? "bg-cyan/[0.035]" : ""}`}>
                      <AccessValue value={row.access[planId]} />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    {row.feature ? (
                      canUseFeature(plan, row.feature) ? (
                        <span className="text-cyan">Included</span>
                      ) : isAdvancedOnlyFeature(row.feature) ? (
                        <span className="text-muted">Coming soon</span>
                      ) : (
                        <button
                          className="border-b border-cyan/60 text-cyan hover:text-ink"
                          onClick={() => {
                            trackEvent("plan_feature_cta_clicked", { feature: row.feature ?? row.label });
                            onPricing();
                          }}
                        >
                          Upgrade
                        </button>
                      )
                    ) : (
                      <span className="text-cyan">Included</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 border border-cyan/30 bg-cyan/[0.045] p-6">
        <p className="EdgeTrace-eyebrow">What should I do next?</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">{nextAction.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{nextAction.body}</p>
        <button className="EdgeTrace-command-button mt-6" onClick={nextAction.action}>
          {nextAction.cta}
        </button>
      </section>
    </main>
  );
}

function PlanBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${active ? "border-cyan/50 text-cyan" : "border-white/[0.12] text-muted"}`}>
      {active ? "Included" : label}
    </span>
  );
}

function AccessValue({ value }: { value: string }) {
  if (value === "-") {
    return (
      <span className="inline-flex items-center gap-2 text-muted">
        <Minus size={14} /> Not included
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-cyan">
      <Check size={14} /> {value}
    </span>
  );
}

function isAdvancedOnlyFeature(feature: FeatureKey) {
  return ["recurring_reviews", "regression_alerts", "edge_stability_score"].includes(feature);
}

function shortFeatureCopy(text: string) {
  const firstSentence = text.split(".")[0]?.trim();
  return firstSentence ? `${firstSentence}.` : text;
}

function FeatureThumbnail({ id }: { id: string }) {
  const visualType = id.includes("drilldown") || id.includes("provenance") ? "leak" : id.includes("compare") || id.includes("strategy") ? "trend" : "dashboard";
  return (
    <div className="mb-5 h-28 overflow-hidden border border-white/[0.08] bg-black/28">
      {visualType === "dashboard" && (
        <svg viewBox="0 0 360 112" className="h-full w-full" fill="none" aria-hidden="true">
          <path d="M0 0H360V112H0z" fill="url(#dashboardGlow)" />
          <rect x="24" y="24" width="92" height="56" stroke="#58D6FF" strokeOpacity=".45" />
          <rect x="132" y="24" width="92" height="56" stroke="white" strokeOpacity=".18" />
          <rect x="240" y="24" width="92" height="56" stroke="#FFB84D" strokeOpacity=".45" />
          <path d="M36 68L58 58L80 62L104 42" stroke="#58D6FF" strokeWidth="3" strokeLinecap="round" />
          <defs>
            <radialGradient id="dashboardGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(266 20) rotate(143) scale(160 90)">
              <stop stopColor="#58D6FF" stopOpacity=".16" />
              <stop offset="1" stopColor="#050505" stopOpacity=".05" />
            </radialGradient>
          </defs>
        </svg>
      )}
      {visualType === "leak" && (
        <svg viewBox="0 0 360 112" className="h-full w-full" fill="none" aria-hidden="true">
          <path d="M34 32C118 32 136 32 186 32C238 32 248 22 326 20" stroke="#58D6FF" strokeWidth="3" strokeLinecap="round" />
          <path d="M34 56C122 56 142 56 186 56C236 56 252 70 326 74" stroke="#FFB84D" strokeWidth="3" strokeLinecap="round" />
          <path d="M34 82C126 82 144 82 186 82C238 82 254 92 326 94" stroke="#7861FF" strokeWidth="3" strokeLinecap="round" />
          <rect x="224" y="44" width="86" height="34" stroke="#FFB84D" strokeOpacity=".48" fill="#FFB84D" fillOpacity=".08" />
        </svg>
      )}
      {visualType === "trend" && (
        <svg viewBox="0 0 360 112" className="h-full w-full" fill="none" aria-hidden="true">
          <path d="M28 84C82 72 112 78 150 58C196 34 224 46 262 32C302 18 326 24 342 14" stroke="#58D6FF" strokeWidth="4" strokeLinecap="round" />
          <rect x="30" y="66" width="50" height="24" stroke="white" strokeOpacity=".14" />
          <rect x="154" y="46" width="50" height="36" stroke="#58D6FF" strokeOpacity=".38" />
          <rect x="278" y="18" width="50" height="48" stroke="#7861FF" strokeOpacity=".48" />
        </svg>
      )}
    </div>
  );
}

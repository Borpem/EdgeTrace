import type { ReactNode } from "react";
import type { FeatureKey } from "../lib/plans";
import type { ReportAccessLevel } from "../lib/entitlements";
import { trackEvent } from "../lib/analytics";

type PaywallGateProps = {
  feature: FeatureKey | string;
  title: string;
  description: string;
  children?: ReactNode;
  accessLevel?: ReportAccessLevel | "full";
  className?: string;
  requiredPlan?: "pro" | "advanced";
};

export function PaywallGate({
  feature,
  title,
  description,
  children,
  accessLevel = "full",
  className = "",
  requiredPlan
}: PaywallGateProps) {
  if (accessLevel === "full") return <>{children}</>;
  const planLabel = requiredPlan ?? requiredPlanForFeature(feature);

  const goToPricing = () => {
    trackEvent("plan_feature_cta_clicked", { feature: String(feature), requiredPlan: planLabel });
    window.history.pushState(null, "", "/pricing");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const learnMore = () => {
    trackEvent("paywall_learn_more_clicked", { feature: String(feature), requiredPlan: planLabel });
    window.history.pushState(null, "", `/app/how-it-works?feature=${encodeURIComponent(featureParam(feature))}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  if (accessLevel === "locked") {
    return (
      <section className={`border border-white/[0.12] bg-white/[0.025] p-6 ${className}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">{featureLabel(feature)}</p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">{title}</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{description}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="EdgeTrace-primary-button" type="button" onClick={goToPricing}>
            Upgrade to Pro
          </button>
          <button className="EdgeTrace-secondary-button" type="button" onClick={learnMore}>
            Learn what this unlocks
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={`relative overflow-hidden border border-cyan/25 bg-white/[0.025] ${className}`}>
      <div className="pointer-events-none max-h-[360px] overflow-hidden blur-[1.5px] saturate-[0.65]">
        <div className="opacity-45">{children}</div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-black/90" />
      <div className="absolute inset-x-0 bottom-0 border-t border-cyan/25 bg-black/90 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Preview unlocked</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-ink">{title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="EdgeTrace-primary-button" type="button" onClick={goToPricing}>
            Upgrade to Pro
          </button>
          <button className="EdgeTrace-secondary-button" type="button" onClick={learnMore}>
            Learn what this unlocks
          </button>
        </div>
      </div>
    </section>
  );
}

function featureLabel(feature: FeatureKey | string) {
  return feature.replace(/_/g, " ");
}

function requiredPlanForFeature(_feature: FeatureKey | string): "pro" | "advanced" {
  return "pro";
}

function featureParam(feature: FeatureKey | string) {
  const value = String(feature);
  const aliases: Record<string, string> = {
    full_drilldowns: "drilldowns",
    advanced_attribution: "drilldowns",
    full_compare: "compare",
    strategy_sets: "strategy-sets",
    collections: "strategy-sets",
    collection_attribution: "strategy-sets",
    reconstruction_audit: "reconstruction-audit",
    export_audit: "exports",
    audit_exports: "exports",
    strategy_health_monitoring: "strategy-monitoring",
    edge_stability_score: "strategy-monitoring",
    recurring_reviews: "strategy-monitoring",
    regression_alerts: "strategy-monitoring",
    ask_edge_trace: "ask-edge-trace",
    what_if_simulator: "what-if-simulator",
    broker_imports: "broker-imports"
  };
  return aliases[value] ?? value.replace(/_/g, "-");
}

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
    <section className={`EdgeTrace-paywall-preview relative overflow-hidden border border-cyan/25 bg-white/[0.025] ${className}`}>
      <div className="EdgeTrace-paywall-preview-content pointer-events-none max-h-[460px] overflow-hidden">
        <div>{children}</div>
      </div>
      <div className="EdgeTrace-paywall-preview-scrim absolute inset-0" />
      <div className="EdgeTrace-paywall-preview-card absolute left-1/2 top-1/2 w-[min(92%,34rem)] -translate-x-1/2 -translate-y-1/2 border border-cyan/30 bg-black/90 p-6 text-center shadow-[0_22px_70px_-36px_rgba(88,214,255,0.72)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Preview unlocked</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-ink">{title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
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
    review_cadence: "how-review-loop",
    aggregate_benchmarks: "how-review-loop",
    mistake_heatmap: "how-review-loop",
    broker_imports: "broker-imports"
  };
  return aliases[value] ?? value.replace(/_/g, "-");
}

import type { ReactNode } from "react";
import type { FeatureKey } from "../lib/plans";
import type { ReportAccessLevel } from "../lib/entitlements";
import { trackEvent } from "../lib/analytics";
import { proFeatureLearnPath } from "../lib/proFeaturePrompts";

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
    window.history.pushState(null, "", `/app/how-it-works?feature=${encodeURIComponent(proFeatureLearnPath(feature))}`);
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

  const showGeneratedPreview = shouldUseGeneratedPreview(feature);

  return (
    <section className={`EdgeTrace-paywall-preview relative overflow-hidden border border-cyan/25 bg-white/[0.025] ${className}`}>
      <div className="EdgeTrace-paywall-preview-content pointer-events-none max-h-[460px] overflow-hidden">
        {showGeneratedPreview ? <FeaturePaywallTeaser feature={feature} /> : null}
        <div>{children}</div>
      </div>
      <div className="EdgeTrace-paywall-preview-scrim absolute inset-0" />
      <div className="EdgeTrace-paywall-preview-card absolute left-1/2 top-1/2 w-[min(92%,34rem)] -translate-x-1/2 -translate-y-1/2 border border-cyan/30 bg-black/90 p-6 text-center shadow-[0_22px_70px_-36px_rgba(88,214,255,0.72)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Pro subscription feature</p>
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

function FeaturePaywallTeaser({ feature }: { feature: FeatureKey | string }) {
  const kind = String(feature).includes("heatmap") ? "heatmap" : "review";

  if (kind === "heatmap") {
    return (
      <div className="EdgeTrace-paywall-teaser EdgeTrace-paywall-teaser-heatmap" aria-hidden="true">
        <div className="EdgeTrace-paywall-teaser-summary">
          <span>Biggest net leak</span>
          <strong>Tue AM cluster</strong>
          <em>-1,161.98</em>
        </div>
        <div className="EdgeTrace-paywall-teaser-grid is-red">
          {Array.from({ length: 25 }).map((_, index) => (
            <i key={`red-${index}`} style={{ opacity: [0.34, 0.56, 0.78, 0.95, 0.42][index % 5] }} />
          ))}
        </div>
        <div className="EdgeTrace-paywall-teaser-grid is-green">
          {Array.from({ length: 25 }).map((_, index) => (
            <i key={`green-${index}`} style={{ opacity: [0.42, 0.72, 0.38, 0.9, 0.58][index % 5] }} />
          ))}
        </div>
        <div className="EdgeTrace-paywall-teaser-strip">
          <b />
          <b />
          <b />
          <b />
        </div>
      </div>
    );
  }

  return (
    <div className="EdgeTrace-paywall-teaser EdgeTrace-paywall-teaser-review" aria-hidden="true">
      <div className="EdgeTrace-paywall-teaser-status">
        <span>Review status</span>
        <strong>Follow-up required</strong>
        <em>3 issues to verify</em>
      </div>
      <div className="EdgeTrace-paywall-teaser-gauge">
        <strong>38th</strong>
        <span>Cost drag percentile</span>
      </div>
      <div className="EdgeTrace-paywall-teaser-gauge is-blue">
        <strong>59th</strong>
        <span>R-capture benchmark</span>
      </div>
      <div className="EdgeTrace-paywall-teaser-gauge is-blue">
        <strong>63rd</strong>
        <span>Expectancy benchmark</span>
      </div>
      <div className="EdgeTrace-paywall-teaser-list">
        <b />
        <b />
        <b />
      </div>
      <div className="EdgeTrace-paywall-teaser-list is-targets">
        <b />
        <b />
        <b />
      </div>
    </div>
  );
}

function featureLabel(feature: FeatureKey | string) {
  return feature.replace(/_/g, " ");
}

function requiredPlanForFeature(_feature: FeatureKey | string): "pro" | "advanced" {
  return "pro";
}

function shouldUseGeneratedPreview(feature: FeatureKey | string) {
  const value = String(feature);
  return value === "review_cadence" || value === "aggregate_benchmarks" || value === "mistake_heatmap";
}

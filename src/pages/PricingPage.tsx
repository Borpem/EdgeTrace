import { useEffect, useState } from "react";
import { createBillingPortalSession, createCheckoutSession } from "../lib/api";
import { DisclosurePanel } from "../components/DisclosurePanel";
import { PlanAccessGraphic } from "../components/visuals/PlanAccessGraphic";
import { trackEvent } from "../lib/analytics";
import { formatLimit, getPlanConfig } from "../lib/entitlements";
import { planOrder, type PlanId } from "../lib/plans";
import type { UserProfile } from "../types";

export function PricingPage({
  profile,
  onStart
}: {
  profile: UserProfile | null;
  onStart: () => void;
  onPlanChanged?: (profile: UserProfile) => void;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const currentPlanId = profile?.planId ?? "free";
  const billingConfigured = !profile || profile.billingConfigured === true;

  useEffect(() => {
    trackEvent("pricing_page_opened");
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setNotice("Checkout completed. Your plan will update after Stripe confirms the subscription.");
    }
    if (checkout === "cancelled") {
      setNotice("Checkout was cancelled. Your plan was not changed.");
    }
  }, []);

  const startCheckout = async (planId: Exclude<PlanId, "free">) => {
    setError("");
    setActiveAction(planId);
    try {
      const { url } = await createCheckoutSession(planId);
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Checkout could not be started. Confirm billing is configured and try again."
      );
      setActiveAction(null);
    }
  };

  const openPortal = async () => {
    setError("");
    setActiveAction("portal");
    try {
      const { url } = await createBillingPortalSession();
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The billing portal could not be opened. Try again or contact support."
      );
      setActiveAction(null);
    }
  };

  const renderPlanAction = (planId: PlanId) => {
    const isCurrent = currentPlanId === planId;

    if (planId === "advanced" && !isCurrent) {
      return (
        <button className="EdgeTrace-secondary-button mt-8 w-full cursor-not-allowed opacity-70" disabled>
          Coming Soon
        </button>
      );
    }

    if (!profile) {
      return (
        <button className="EdgeTrace-secondary-button mt-8 w-full" onClick={onStart}>
          {planId === "free" ? "Start Free" : "Sign In for Pro"}
        </button>
      );
    }

    if (!billingConfigured && planId !== "free") {
      return (
        <button className="EdgeTrace-secondary-button mt-8 w-full cursor-not-allowed opacity-60" disabled>
          Billing Not Configured
        </button>
      );
    }

    if (isCurrent) {
      return (
        <div className="mt-8 grid gap-3">
          <button className="EdgeTrace-secondary-button w-full cursor-default" disabled>
            Current Plan
          </button>
          {planId !== "free" && (
            <button
              className="border border-white/[0.1] px-4 py-3 text-sm font-semibold text-muted hover:border-white/25 hover:text-ink disabled:opacity-60"
              disabled={activeAction === "portal"}
              onClick={() => void openPortal()}
            >
              {activeAction === "portal" ? "Opening..." : "Manage Billing"}
            </button>
          )}
        </div>
      );
    }

    if (planId === "free") {
      return (
        <button
          className="EdgeTrace-secondary-button mt-8 w-full"
          disabled={!billingConfigured}
          onClick={() => void openPortal()}
        >
          Manage Billing
        </button>
      );
    }

    if (currentPlanId !== "free") {
      return (
        <button
          className="EdgeTrace-secondary-button mt-8 w-full"
          disabled={activeAction === "portal"}
          onClick={() => void openPortal()}
        >
          {activeAction === "portal" ? "Opening..." : "Manage Billing"}
        </button>
      );
    }

    return (
      <button
        className={planId === "pro" ? "EdgeTrace-primary-button mt-8 w-full" : "EdgeTrace-secondary-button mt-8 w-full"}
        disabled={activeAction === planId}
        onClick={() => void startCheckout(planId)}
      >
        {activeAction === planId ? "Redirecting..." : "Upgrade to Pro"}
      </button>
    );
  };

  return (
    <main className="EdgeTrace-shell py-16 md:py-24">
      <section className="border-y border-white/[0.1] py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Pricing</p>
        <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[1.07] tracking-[-0.036em] text-ink md:text-7xl">
          Start with one full report. Scale into continuous strategy intelligence.
        </h1>
        <p className="mt-7 max-w-3xl text-lg leading-8 text-muted">Free previews the diagnostic. Pro unlocks the full workflow. Advanced monitoring is coming soon.</p>
        {profile && (
          <button
            className="mt-6 border-b border-cyan/60 text-sm font-semibold text-cyan hover:text-ink"
            onClick={() => {
              window.history.pushState(null, "", "/app/how-it-works");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
          >
            See how each feature works
          </button>
        )}
        {profile && (
          <p className="mt-6 text-sm text-muted">
            Current plan: <span className="font-semibold text-cyan">{getPlanConfig(currentPlanId).displayName}</span>
            {profile.stripeSubscriptionStatus ? ` - ${formatSubscriptionStatus(profile.stripeSubscriptionStatus)}` : ""}
            {profile.currentPeriodEnd ? ` - Current period ends ${new Date(profile.currentPeriodEnd).toLocaleDateString()}` : ""}
          </p>
        )}
      </section>

      {!billingConfigured && (
        <div className="mt-6 border border-warn/50 bg-warn/10 p-4 text-sm text-warn">
          Billing is not configured in this environment. Add Stripe test keys and price IDs to enable checkout.
        </div>
      )}
      {notice && <div className="mt-6 border border-cyan/50 bg-cyan/10 p-4 text-sm text-cyan">{notice}</div>}
      {error && <div className="mt-6 border border-loss/60 bg-loss/10 p-4 text-sm text-loss">{error}</div>}

      <PlanAccessGraphic className="mt-10" />

      <section className="mt-10 grid gap-5 lg:grid-cols-3">
        {planOrder.map((planId) => {
          const plan = getPlanConfig(planId);
          const isCurrent = currentPlanId === planId;
          return (
            <article
              key={plan.id}
              className={`border bg-white/[0.025] p-7 ${
                isCurrent || plan.id === "pro" ? "border-cyan/45" : "border-white/[0.12]"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">{plan.displayName}</p>
              <p className="mt-5 text-4xl font-semibold tracking-[-0.055em] text-ink">{plan.monthlyPriceLabel}</p>
              {plan.id === "pro" && (
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan">Main beta upgrade</p>
              )}
              {plan.id === "advanced" && (
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Not available for checkout yet</p>
              )}
              <p className="mt-5 min-h-16 text-sm leading-6 text-muted">{plan.description}</p>

              <ul className="mt-7 space-y-3 text-sm text-muted">
                {plan.featureBullets.slice(0, 6).map((feature) => (
                  <li key={feature} className="border-t border-white/[0.08] pt-3">
                    {feature}
                  </li>
                ))}
              </ul>

              <DisclosurePanel className="mt-5" title="Full feature details" compact>
                <div className="grid gap-2 text-xs text-muted">
                  <span>Full reports: {formatLimit(plan.limits.maxFullReports)}</span>
                  <span>Report history: {formatLimit(plan.limits.maxReports)}</span>
                  <span>Strategy sets: {formatLimit(plan.limits.maxCollections)}</span>
                  <span>Saved comparisons: {formatLimit(plan.limits.maxSavedComparisons)}</span>
                  <span>Imports: {plan.limits.brokerAdapters === "all" ? "All broker CSV adapters" : "Generic CSV only"}</span>
                  {plan.featureBullets.slice(6).map((feature) => (
                    <span key={feature}>{feature}</span>
                  ))}
                </div>
              </DisclosurePanel>

              {renderPlanAction(plan.id)}
            </article>
          );
        })}
      </section>
    </main>
  );
}

function formatSubscriptionStatus(status: string) {
  const normalized = status.replace(/_/g, " ");
  return `Subscription ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}


import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Database,
  Lock,
  ReceiptText,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import { confirmCheckoutSession, createBillingPortalSession, createCheckoutSession, getMe } from "../lib/api";
import { trackEvent } from "../lib/analytics";
import { getPlanConfig } from "../lib/entitlements";
import { planOrder, type PlanId } from "../lib/plans";
import type { UserProfile } from "../types";

const planSummaries: Record<PlanId, string> = {
  free: "Complete reporting and analysis workflow.",
  pro: "Review loop, mistake heatmaps, benchmark percentiles, and clear targets for the next upload.",
  advanced: "Legacy access with all paid review features."
};

const featureRows: Array<{ label: string; access: Record<PlanId, string> }> = [
  { label: "Full diagnostic reports", access: { free: "Unlimited", pro: "Unlimited", advanced: "Unlimited" } },
  { label: "Broker and generic CSV imports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Full attribution and drilldowns", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Compare reports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Strategy sets", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Reconstruction audit", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Exports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Strategy health monitoring", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Weekly Edge Review loop", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Regression / improvement tracking", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Benchmark percentile cards", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Mistake heatmap", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Next-review checklist", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Review cadence status", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Aggregate benchmark intelligence", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Cost-drag cohort percentiles", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "R-capture comparisons", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Expectancy and profit-factor context", access: { free: "-", pro: "Included", advanced: "Included" } }
];

const faqs = [
  {
    question: "What is included on Free?",
    answer:
      "Free includes the complete current EdgeTrace workflow: unlimited reports, broker and CSV imports, attribution, drilldowns, compare, strategy sets, audits, exports, and monitoring."
  },
  {
    question: "What does Pro unlock?",
    answer:
      "Pro is the $9.99/month review loop: weekly Edge Reviews, mistake heatmaps, benchmark percentile cards, next-review checklists, review cadence status, and regression / improvement tracking."
  },
  {
    question: "Can I use Free long term?",
    answer:
      "Yes. The core product stays free. Pro is for traders who want a recurring review layer that measures whether each new upload improved."
  },
  {
    question: "Is my data secure?",
    answer:
      "EdgeTrace uses encrypted HTTPS transport, managed production infrastructure, and account-scoped access controls for the diagnostic workflow."
  }
];

const trustItems: Array<{ title: string; body: string; icon: LucideIcon; accent: "cyan" | "purple" | "amber" }> = [
  {
    title: "Aggregate-ready insights",
    body: "Trade data can support richer benchmarks and strategy intelligence.",
    icon: Database,
    accent: "cyan"
  },
  {
    title: "Secure access",
    body: "Encrypted transport and account-scoped access controls.",
    icon: ShieldCheck,
    accent: "purple"
  },
  {
    title: "Transparent diagnostics",
    body: "Key report inputs and diagnostic logic are visible in the workflow.",
    icon: ReceiptText,
    accent: "cyan"
  },
  {
    title: "Manage billing",
    body: "Subscriptions are managed through Stripe billing.",
    icon: Lock,
    accent: "amber"
  }
];

export function PricingPage({
  profile,
  isAuthenticated = Boolean(profile),
  onStart,
  onPlanChanged
}: {
  profile: UserProfile | null;
  isAuthenticated?: boolean;
  onStart: () => void;
  onPlanChanged?: (profile: UserProfile) => void;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [confirmedSessionId, setConfirmedSessionId] = useState("");
  const accountLoading = isAuthenticated && !profile;
  const hasSignedInAccount = isAuthenticated || Boolean(profile);
  const currentPlanId = profile?.planId ?? "free";
  const highlightedPlanId = profile ? currentPlanId : "pro";
  const billingConfigured = !profile || profile.billingConfigured === true;

  useEffect(() => {
    trackEvent("pricing_page_opened");
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setNotice("Checkout completed. Refreshing your plan...");
    }
    if (checkout === "cancelled") {
      setNotice("Checkout was cancelled. Your plan was not changed.");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    const sessionId = params.get("session_id") ?? "";
    if (sessionId && sessionId === confirmedSessionId) return;
    if (sessionId && !profile) return;

    let cancelled = false;
    setActiveAction("confirm-checkout");
    const refresh = sessionId ? confirmCheckoutSession(sessionId) : getMe();
    void refresh
      .then(({ profile: refreshedProfile }) => {
        if (cancelled) return;
        setConfirmedSessionId(sessionId);
        onPlanChanged?.(refreshedProfile);
        setNotice(
          refreshedProfile.planId === "pro"
            ? "Checkout completed. Your Pro plan is active."
            : "Checkout completed. Your plan is still updating. Refresh this page in a moment."
        );
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((err) => {
        if (cancelled) return;
        setNotice("Checkout completed. Your plan may take a moment to update from Stripe.");
        setError(err instanceof Error ? err.message : "Checkout completed, but the plan could not be refreshed yet.");
      })
      .finally(() => {
        if (!cancelled) setActiveAction(null);
      });

    return () => {
      cancelled = true;
    };
  }, [confirmedSessionId, onPlanChanged, profile]);

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

  const handleProCta = () => {
    if (accountLoading) {
      setError("Your account profile is still loading. Try again in a moment.");
      return;
    }
    if (!hasSignedInAccount) {
      onStart();
      return;
    }
    if (currentPlanId !== "free") {
      void openPortal();
      return;
    }
    if (billingConfigured) {
      void startCheckout("pro");
      return;
    }
    setError("Billing is not configured in this environment. Add Stripe test keys and price IDs to enable checkout.");
  };

  const renderPlanAction = (planId: PlanId) => {
    const isCurrent = currentPlanId === planId;

    if (planId === "advanced" && !isCurrent) {
      return (
        <button className="EdgeTrace-pricing-secondary mt-7 w-full cursor-not-allowed opacity-70" disabled>
          Coming Soon
        </button>
      );
    }

    if (accountLoading) {
      return (
        <button className="EdgeTrace-pricing-secondary mt-7 w-full cursor-wait opacity-70" disabled>
          Loading Account...
        </button>
      );
    }

    if (!hasSignedInAccount) {
      return (
        <button className={planId === "pro" ? "EdgeTrace-pricing-primary mt-7 w-full" : "EdgeTrace-pricing-secondary mt-7 w-full"} onClick={onStart}>
          {planId === "free" ? "Start Free" : planId === "pro" ? "Create Account for Pro" : "Join Early Access"}
        </button>
      );
    }

    if (!billingConfigured && planId !== "free") {
      return (
        <button className="EdgeTrace-pricing-secondary mt-7 w-full cursor-not-allowed opacity-60" disabled>
          Billing Not Configured
        </button>
      );
    }

    if (isCurrent) {
      return (
        <div className="mt-7 grid gap-3">
          <button className="EdgeTrace-pricing-secondary w-full cursor-default" disabled>
            Current Plan
          </button>
          {planId !== "free" && (
            <button
              className="EdgeTrace-pricing-secondary w-full"
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
        <button className="EdgeTrace-pricing-secondary mt-7 w-full" disabled={!billingConfigured} onClick={() => void openPortal()}>
          Manage Billing
        </button>
      );
    }

    if (currentPlanId !== "free") {
      return (
        <button className="EdgeTrace-pricing-secondary mt-7 w-full" disabled={activeAction === "portal"} onClick={() => void openPortal()}>
          {activeAction === "portal" ? "Opening..." : "Manage Billing"}
        </button>
      );
    }

    return (
      <button
        className={planId === "pro" ? "EdgeTrace-pricing-primary mt-7 w-full" : "EdgeTrace-pricing-secondary mt-7 w-full"}
        disabled={activeAction === planId}
        onClick={() => void startCheckout(planId as Exclude<PlanId, "free">)}
      >
        {activeAction === planId ? "Redirecting..." : "Upgrade to Pro"}
      </button>
    );
  };

  return (
    <main className="EdgeTrace-pricing-page">
      <section className="EdgeTrace-pricing-hero">
        <p className="EdgeTrace-pricing-eyebrow">Pricing</p>
        <h1>Simple pricing. Serious edge.</h1>
        <p>
          Use the full EdgeTrace reporting workflow for free. Upgrade to Pro when you want the recurring review loop,
          mistake heatmaps, benchmark percentiles, and next-upload targets.
        </p>
      </section>

      <StatusMessages billingConfigured={billingConfigured} notice={notice} error={error} />

      <FeatureComparison
        activePlanId={highlightedPlanId}
        currentPlanId={Boolean(profile) ? currentPlanId : undefined}
        renderPlanAction={renderPlanAction}
      />
      <TrustSection />
      <FaqSection />
      <FinalCta onStart={onStart} onPro={handleProCta} activeAction={activeAction} profile={profile} isAuthenticated={isAuthenticated} />
    </main>
  );
}

function StatusMessages({
  billingConfigured,
  notice,
  error
}: {
  billingConfigured: boolean;
  notice: string;
  error: string;
}) {
  return (
    <section className="EdgeTrace-pricing-status">
      {!billingConfigured && (
        <div className="tone-warning">
          Billing is not configured in this environment. Add Stripe test keys and price IDs to enable checkout.
        </div>
      )}
      {notice && <div className="tone-info">{notice}</div>}
      {error && <div className="tone-error">{error}</div>}
    </section>
  );
}

function FeatureComparison({
  activePlanId,
  currentPlanId,
  renderPlanAction
}: {
  activePlanId: PlanId;
  currentPlanId?: PlanId;
  renderPlanAction: (planId: PlanId) => ReactNode;
}) {
  return (
    <section className="EdgeTrace-pricing-compare">
      <div className="EdgeTrace-pricing-compare-heading">
        <div>
          <h2>Free vs Pro</h2>
          <p>Core reporting stays free. Pro adds the recurring review layer and benchmark context.</p>
        </div>
        <div className="EdgeTrace-pricing-footnote">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Pro is $9.99/month.</span>
        </div>
      </div>
      <div className="EdgeTrace-pricing-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              {planOrder.map((planId) => (
                <th key={planId} className={activePlanId === planId ? "active" : ""}>
                  <PlanColumnHeader
                    planId={planId}
                    isCurrent={currentPlanId === planId}
                    action={renderPlanAction(planId)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureRows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                {planOrder.map((planId) => (
                  <td key={planId} className={activePlanId === planId ? "active" : ""}>
                    <AccessValue value={row.access[planId]} planId={planId} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PlanColumnHeader({
  planId,
  isCurrent,
  action
}: {
  planId: PlanId;
  isCurrent: boolean;
  action: ReactNode;
}) {
  const config = getPlanConfig(planId);
  const price = config.monthlyPriceLabel.replace("/month", "");

  return (
    <div className="EdgeTrace-pricing-column-head">
      <div className="EdgeTrace-pricing-column-title">
        <span>{config.displayName}</span>
        {planId === "pro" && <small>Most Popular</small>}
        {isCurrent && <em>Current</em>}
      </div>
      <p>{planSummaries[planId]}</p>
      <div className="EdgeTrace-pricing-column-price">
        <strong>{price}</strong>
        {config.monthlyPriceLabel.includes("/month") && <span>/mo</span>}
      </div>
      <div>{action}</div>
    </div>
  );
}

function TrustSection() {
  return (
    <section className="EdgeTrace-pricing-trust">
      {trustItems.map((item) => {
        const Icon = item.icon;
        return (
          <article key={item.title}>
            <Icon className={toneClasses[item.accent].icon} size={24} strokeWidth={1.7} />
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        );
      })}
    </section>
  );
}

function FaqSection() {
  return (
    <section className="EdgeTrace-pricing-faq">
      <h2>Frequently asked questions</h2>
      <div>
        {faqs.map((faq) => (
          <article key={faq.question}>
            <h3>
              {faq.question}
              <ArrowRight size={16} aria-hidden="true" />
            </h3>
            <p>{faq.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalCta({
  onStart,
  onPro,
  activeAction,
  profile,
  isAuthenticated
}: {
  onStart: () => void;
  onPro: () => void;
  activeAction: string | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
}) {
  return (
    <section className="EdgeTrace-pricing-final">
      <div className="EdgeTrace-pricing-final-icon">
        <ArrowRight size={28} aria-hidden="true" />
      </div>
      <div>
        <h2>Ready to gain the edge?</h2>
        <p>Start with the free workflow, then upgrade to Pro when you want recurring review targets, heatmaps, and benchmark context.</p>
      </div>
      <div>
        <button className="EdgeTrace-pricing-primary" onClick={onPro}>
          {activeAction === "pro"
            ? "Redirecting..."
            : isAuthenticated
              ? profile?.planId === "free"
                ? "Upgrade to Pro"
                : "Manage Billing"
              : "Create Account for Pro"}
        </button>
        <button className="EdgeTrace-pricing-secondary" onClick={onStart}>
          {profile ? "Import Trades" : "Start Free"}
        </button>
      </div>
    </section>
  );
}

function AccessValue({ value, planId }: { value: string; planId: PlanId }) {
  if (value === "-") {
    return <span className="muted">-</span>;
  }
  if (value === "Coming soon") {
    return <span className={toneClasses[planToneFromId(planId)].text}>Coming soon</span>;
  }
  return (
    <span className="included">
      {value === "Included" ? <Check size={16} aria-hidden="true" /> : value}
    </span>
  );
}

function planToneFromId(planId: PlanId): "cyan" | "purple" | "amber" {
  return planId === "advanced" ? "amber" : planId === "pro" ? "purple" : "cyan";
}

const toneClasses = {
  cyan: {
    card: "tone-cyan",
    ribbon: "tone-cyan",
    text: "text-cyan",
    icon: "text-cyan"
  },
  purple: {
    card: "tone-purple",
    ribbon: "tone-purple",
    text: "text-violet",
    icon: "text-violet"
  },
  amber: {
    card: "tone-amber",
    ribbon: "tone-amber",
    text: "text-warning",
    icon: "text-warning"
  }
} as const;

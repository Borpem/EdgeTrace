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
import { shouldHandleClientNavigation } from "../lib/navigation";
import { planOrder, type PlanId } from "../lib/plans";
import type { UserProfile } from "../types";

const proMonthlyPriceLabel = getPlanConfig("pro").monthlyPriceLabel;

const featureRows: Array<{ label: string; access: Record<PlanId, string> }> = [
  { label: "Full diagnostic reports", access: { free: "Unlimited", pro: "Unlimited", advanced: "Unlimited" } },
  { label: "Broker and generic CSV imports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Dashboard diagnosis and top drivers", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Compare reports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Strategy sets", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Reconstruction audit", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Exports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Strategy health monitoring", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Full drilldowns by symbol, session, setup, and time", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Weekly Edge Review loop", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Regression / improvement tracking", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Mistake heatmap", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Next-review checklist", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Review cadence status", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "R-capture comparisons", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Expectancy and profit-factor context", access: { free: "-", pro: "Included", advanced: "Included" } }
];

const faqs = [
  {
    question: "What is included on Free?",
    answer:
      "Free includes unlimited reports, broker and CSV imports, dashboard diagnosis, top drivers, compare, strategy sets, audits, exports, and monitoring."
  },
  {
    question: "What does Pro unlock?",
    answer: `Pro is the ${proMonthlyPriceLabel} investigation and review layer: full drilldowns, weekly Edge Reviews, mistake heatmaps, next-review checklists, review cadence status, and regression / improvement tracking.`
  },
  {
    question: "Can I compare reports on Free?",
    answer:
      "Yes. Free includes report comparison and strategy sets. Pro adds full segment drilldowns and the recurring review layer."
  },
  {
    question: "Is my data secure?",
    answer:
      "EdgeTrace sends production traffic over HTTPS and uses account-scoped access controls. Only upload trade data you are authorized to use."
  },
  {
    question: "Do I need to connect my brokerage account?",
    answer:
      "No automatic broker sync is required or claimed. EdgeTrace starts with a supported broker export or generic CSV that you review before analysis."
  }
];

const trustItems: Array<{ title: string; body: string; icon: LucideIcon; accent: "cyan" | "purple" | "amber" }> = [
  {
    title: "Visible import review",
    body: "Review the detected source, mapped fields, excluded rows, and warnings before a report is created.",
    icon: Database,
    accent: "cyan"
  },
  {
    title: "Account-scoped access",
    body: "Production traffic uses HTTPS and report access is scoped to the signed-in account.",
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
    trackEvent("pricing_page_viewed");
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
        trackEvent("checkout_completed", { plan: refreshedProfile.planId });
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
    trackEvent("checkout_started", { plan: planId });
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
        <a
          className={planId === "pro" ? "EdgeTrace-pricing-primary mt-7 w-full" : "EdgeTrace-pricing-secondary mt-7 w-full"}
          href="/signup?next=/app/upload"
          onClick={(event) => {
            if (!shouldHandleClientNavigation(event)) return;
            event.preventDefault();
            onStart();
          }}
        >
          {planId === "free" ? "Start Free" : planId === "pro" ? "Create Account for Pro" : "Join Early Access"}
        </a>
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
    <main id="main-content" tabIndex={-1} className="EdgeTrace-pricing-page">
      <section className="EdgeTrace-pricing-hero">
        <h1>
          <span>Trade analytics pricing.</span>
          <span>Start with the core workflow free.</span>
        </h1>
        <p>Build completed-trade reports on Free, then add deeper drilldowns and a recurring review layer with Pro.</p>
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
    <section className="EdgeTrace-pricing-status" aria-live="polite">
      {!billingConfigured && (
        <div className="tone-warning" role="status">
          Billing is not configured in this environment. Add Stripe test keys and price IDs to enable checkout.
        </div>
      )}
      {notice && <div className="tone-info" role="status">{notice}</div>}
      {error && <div className="tone-error" role="alert">{error}</div>}
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
    <section className="EdgeTrace-pricing-compare" aria-labelledby="pricing-comparison-title">
      <h2 id="pricing-comparison-title" className="sr-only">EdgeTrace plan comparison</h2>
      <div className="EdgeTrace-pricing-board" role="table" aria-label="EdgeTrace Free and Pro feature comparison">
        <div className="EdgeTrace-pricing-header-row" role="row">
          <div className="EdgeTrace-pricing-board-label plan-intro" role="columnheader">
            <div>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>Plans</span>
            </div>
          </div>
          {planOrder.map((planId) => (
            <PlanColumnHeader
              key={planId}
              planId={planId}
              isActive={activePlanId === planId}
              isCurrent={currentPlanId === planId}
              action={renderPlanAction(planId)}
            />
          ))}
        </div>
        {featureRows.map((row) => (
          <div className="EdgeTrace-pricing-feature-row" key={row.label} role="row">
            <div className="EdgeTrace-pricing-feature-name" role="rowheader">{row.label}</div>
            {planOrder.map((planId) => (
              <div
                key={planId}
                className={`EdgeTrace-pricing-feature-access ${activePlanId === planId ? "active" : ""}`}
                role="cell"
                aria-label={`${row.label}, ${getPlanConfig(planId).displayName}: ${row.access[planId]}`}
              >
                <AccessValue value={row.access[planId]} planId={planId} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function PlanColumnHeader({
  planId,
  isActive,
  isCurrent,
  action
}: {
  planId: PlanId;
  isActive: boolean;
  isCurrent: boolean;
  action: ReactNode;
}) {
  const config = getPlanConfig(planId);
  const price = config.monthlyPriceLabel.replace("/month", "");

  return (
    <div className={`EdgeTrace-pricing-column-head ${isActive ? "active" : ""}`} role="columnheader">
      <div className="EdgeTrace-pricing-column-title">
        <span>{config.displayName}</span>
        {isCurrent && <em>Current</em>}
      </div>
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
        <h2>Ready to review your trading data?</h2>
        <p>Start with the free workflow, then upgrade to Pro when you want recurring review targets, heatmaps, and full drilldowns.</p>
      </div>
      <div>
        {isAuthenticated ? (
          <button className="EdgeTrace-pricing-primary" onClick={onPro}>
            {activeAction === "pro"
              ? "Redirecting..."
              : profile?.planId === "free"
                ? "Upgrade to Pro"
                : "Manage Billing"}
          </button>
        ) : (
          <a
            className="EdgeTrace-pricing-primary"
            href="/signup?next=/app/upload"
            onClick={(event) => {
              if (!shouldHandleClientNavigation(event)) return;
              event.preventDefault();
              onPro();
            }}
          >
            Create Account for Pro
          </a>
        )}
        {profile ? (
          <button className="EdgeTrace-pricing-secondary" onClick={onStart}>Import Trades</button>
        ) : (
          <a
            className="EdgeTrace-pricing-secondary"
            href="/signup?next=/app/upload"
            onClick={(event) => {
              if (!shouldHandleClientNavigation(event)) return;
              event.preventDefault();
              onStart();
            }}
          >
            Start Free
          </a>
        )}
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

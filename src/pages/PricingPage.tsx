import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, FileX, Lock, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";
import { createBillingPortalSession, createCheckoutSession } from "../lib/api";
import { PageShell } from "../components/ui/Primitives";
import { trackEvent } from "../lib/analytics";
import { getPlanConfig } from "../lib/entitlements";
import { planOrder, type PlanId } from "../lib/plans";
import type { UserProfile } from "../types";

type PricingPlan = {
  id: PlanId;
  price: string;
  title: string;
  bullets: string[];
  accent: "cyan" | "purple" | "amber";
  recommended?: boolean;
};

const pricingPlans: PricingPlan[] = [
  {
    id: "free",
    price: "$0",
    title: "Explore the first diagnostic",
    bullets: [
      "1 full diagnostic report",
      "Generic CSV import",
      "Preview deeper insights after first report",
      "Limited report history"
    ],
    accent: "cyan"
  },
  {
    id: "pro",
    price: "$19/month",
    title: "Full strategy workflow",
    bullets: [
      "Unlimited full diagnostic reports",
      "Supported broker CSV imports",
      "Full attribution and drilldowns",
      "Compare reports",
      "Strategy sets",
      "Reconstruction audit",
      "Exports",
      "Strategy health monitoring"
    ],
    accent: "purple",
    recommended: true
  },
  {
    id: "advanced",
    price: "Coming Soon",
    title: "Continuous strategy intelligence",
    bullets: [
      "Everything in Pro",
      "Recurring strategy reviews",
      "Regression alerts",
      "Edge Stability Score",
      "Future team/API support"
    ],
    accent: "amber"
  }
];

const featureRows: Array<{ label: string; access: Record<PlanId, string> }> = [
  { label: "Full diagnostic reports", access: { free: "1", pro: "Unlimited", advanced: "Unlimited" } },
  { label: "Preview reports", access: { free: "Included", pro: "Included", advanced: "Included" } },
  { label: "Broker CSV imports", access: { free: "Generic CSV", pro: "Supported brokers", advanced: "Supported brokers" } },
  { label: "Full attribution and drilldowns", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Compare reports", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Strategy sets", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Reconstruction audit", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Exports", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Strategy health monitoring", access: { free: "-", pro: "Included", advanced: "Included" } },
  { label: "Recurring strategy reviews", access: { free: "-", pro: "-", advanced: "Coming soon" } },
  { label: "Regression alerts", access: { free: "-", pro: "-", advanced: "Coming soon" } },
  { label: "Edge Stability Score", access: { free: "-", pro: "-", advanced: "Coming soon" } }
];

const trustItems: Array<{ title: string; body: string; icon: LucideIcon; accent: "cyan" | "purple" | "amber" }> = [
  {
    title: "Privacy first",
    body: "Raw files are not stored.",
    icon: FileX,
    accent: "cyan"
  },
  {
    title: "Secure infrastructure",
    body: "Encrypted in transit and at rest.",
    icon: ShieldCheck,
    accent: "purple"
  },
  {
    title: "Transparent diagnostics",
    body: "See how every report is calculated.",
    icon: ReceiptText,
    accent: "cyan"
  },
  {
    title: "Manage billing",
    body: "Subscriptions are managed through the billing portal.",
    icon: Lock,
    accent: "amber"
  }
];

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

  const scrollToPlan = (planId: PlanId) => {
    document.getElementById(`pricing-plan-${planId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleProCta = () => {
    if (!profile) {
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
        <button className="EdgeTrace-secondary-button mt-7 w-full cursor-not-allowed opacity-70" disabled>
          Coming Soon
        </button>
      );
    }

    if (!profile) {
      return (
        <button className={planId === "pro" ? "EdgeTrace-primary-button mt-7 w-full" : "EdgeTrace-secondary-button mt-7 w-full"} onClick={onStart}>
          {planId === "free" ? "Start Free" : planId === "pro" ? "Sign In for Pro" : "Join Early Access"}
        </button>
      );
    }

    if (!billingConfigured && planId !== "free") {
      return (
        <button className="EdgeTrace-secondary-button mt-7 w-full cursor-not-allowed opacity-60" disabled>
          Billing Not Configured
        </button>
      );
    }

    if (isCurrent) {
      return (
        <div className="mt-7 grid gap-3">
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
          className="EdgeTrace-secondary-button mt-7 w-full"
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
          className="EdgeTrace-secondary-button mt-7 w-full"
          disabled={activeAction === "portal"}
          onClick={() => void openPortal()}
        >
          {activeAction === "portal" ? "Opening..." : "Manage Billing"}
        </button>
      );
    }

    return (
      <button
        className={planId === "pro" ? "EdgeTrace-primary-button mt-7 w-full" : "EdgeTrace-secondary-button mt-7 w-full"}
        disabled={activeAction === planId}
        onClick={() => void startCheckout(planId as Exclude<PlanId, "free">)}
      >
        {activeAction === planId ? "Redirecting..." : "Upgrade to Pro"}
      </button>
    );
  };

  return (
    <PageShell className="pb-16 md:py-16">
      <section className="relative z-10 overflow-hidden border-b border-white/[0.08] pb-12 md:pb-16">
        <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[54rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,197,245,0.11),rgba(124,92,255,0.065)_44%,transparent_72%)] blur-[118px]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <h1 className="max-w-5xl text-5xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-7xl">
              Choose the workflow depth your strategy needs.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-muted md:text-lg md:leading-8">
              Start with a first diagnostic, unlock the full attribution workflow with Pro, and prepare for continuous
              strategy intelligence with Advanced.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="EdgeTrace-primary-button" onClick={profile ? () => scrollToPlan("free") : onStart}>
                Start with Free <ArrowRight size={16} />
              </button>
              <button className="EdgeTrace-secondary-button" onClick={() => scrollToPlan("pro")}>
                View Pro
              </button>
            </div>
          </div>
          {profile && (
            <div className={`border p-5 ${toneClasses[planToneFromId(currentPlanId)].border} ${toneClasses[planToneFromId(currentPlanId)].bg}`}>
              <p className="text-sm text-muted">Current plan</p>
              <p className={`mt-3 text-4xl font-semibold tracking-[-0.055em] ${toneClasses[planToneFromId(currentPlanId)].text}`}>
                {getPlanConfig(currentPlanId).displayName}
              </p>
              {(profile.stripeSubscriptionStatus || profile.currentPeriodEnd) && (
                <p className="mt-3 text-sm leading-6 text-muted">
                  {profile.stripeSubscriptionStatus ? formatSubscriptionStatus(profile.stripeSubscriptionStatus) : ""}
                  {profile.currentPeriodEnd ? ` · Current period ends ${new Date(profile.currentPeriodEnd).toLocaleDateString()}` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <StatusMessages billingConfigured={billingConfigured} notice={notice} error={error} />

      <section className="relative z-10 py-12 md:py-16">
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
              Plans built around inspection depth.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
              Free gives a real first report. Pro is the main paid workflow. Advanced is the monitoring roadmap.
            </p>
          </div>
          <button
            className="border-b border-cyan/60 text-sm font-semibold text-cyan hover:text-ink"
            onClick={() => {
              window.history.pushState(null, "", profile ? "/app/how-it-works" : "/how-it-works");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
          >
            See how each feature works
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={currentPlanId === plan.id}
              action={renderPlanAction(plan.id)}
            />
          ))}
        </div>
      </section>

      <FeatureComparison currentPlanId={currentPlanId} />
      <TrustSection />
      <FinalCta onStart={onStart} onPro={handleProCta} activeAction={activeAction} profile={profile} />
    </PageShell>
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
    <>
      {!billingConfigured && (
        <div className="mt-6 border border-warn/50 bg-warn/10 p-4 text-sm text-warn">
          Billing is not configured in this environment. Add Stripe test keys and price IDs to enable checkout.
        </div>
      )}
      {notice && <div className="mt-6 border border-cyan/50 bg-cyan/10 p-4 text-sm text-cyan">{notice}</div>}
      {error && <div className="mt-6 border border-loss/60 bg-loss/10 p-4 text-sm text-loss">{error}</div>}
    </>
  );
}

function PlanCard({
  plan,
  isCurrent,
  action
}: {
  plan: PricingPlan;
  isCurrent: boolean;
  action: ReactNode;
}) {
  const toneClass = toneClasses[plan.accent];
  return (
    <article
      id={`pricing-plan-${plan.id}`}
      className={`relative overflow-hidden border bg-[#050a12]/94 p-6 shadow-[0_20px_70px_-58px_rgba(88,214,255,0.55)] ${
        plan.recommended || isCurrent ? toneClass.border : "border-white/[0.1]"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex min-h-14 items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{getPlanConfig(plan.id).displayName}</h3>
          <p className={`mt-2 text-sm font-semibold ${toneClass.text}`}>{plan.title}</p>
        </div>
        {(plan.recommended || isCurrent || plan.id === "advanced") && (
          <span className={`border px-2.5 py-1 text-xs font-semibold ${toneClass.border} ${toneClass.text}`}>
            {isCurrent ? "Current" : plan.recommended ? "Core plan" : "Coming soon"}
          </span>
        )}
      </div>
      <p className="mt-6 text-4xl font-semibold tracking-[-0.055em] text-ink">{plan.price}</p>
      <ul className="mt-7 space-y-3">
        {plan.bullets.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm leading-5 text-muted">
            <Check className={`mt-0.5 shrink-0 ${toneClass.text}`} size={15} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {action}
    </article>
  );
}

function FeatureComparison({ currentPlanId }: { currentPlanId: PlanId }) {
  return (
    <section className="relative z-10 border-y border-white/[0.08] bg-[radial-gradient(circle_at_82%_0%,rgba(124,92,255,0.035),transparent_30rem),rgba(3,6,12,0.24)] py-12 md:py-16">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
          Compare access by plan.
        </h2>
        <p className="mt-4 text-base leading-7 text-muted">
          The table is a reference layer for the cards above. Advanced items are visible as roadmap capabilities and are
          not part of self-serve checkout yet.
        </p>
      </div>
      <div className="overflow-x-auto border border-white/[0.1] bg-[#050a12]/94 shadow-[0_18px_60px_-52px_rgba(88,214,255,0.45)]">
        <table className="min-w-full text-sm">
          <thead className="border-b border-white/[0.1] bg-white/[0.035] text-left text-muted">
            <tr>
              <th className="px-5 py-4 font-semibold text-ink">Feature</th>
              {planOrder.map((planId) => (
                <th key={planId} className={`px-5 py-4 font-semibold ${currentPlanTableClass(currentPlanId, planId, "head")}`}>
                  {getPlanConfig(planId).displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {featureRows.map((row, index) => (
              <tr key={row.label} className={index % 2 === 1 ? "bg-white/[0.016]" : ""}>
                <td className="px-5 py-4 font-semibold text-ink">{row.label}</td>
                {planOrder.map((planId) => (
                  <td key={planId} className={`px-5 py-4 ${currentPlanTableClass(currentPlanId, planId, "body")}`}>
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

function TrustSection() {
  return (
    <section className="relative z-10 py-12 md:py-14">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {trustItems.map((item) => {
          const Icon = item.icon;
          const toneClass = toneClasses[item.accent];
          return (
            <article key={item.title} className="border border-white/[0.09] bg-white/[0.03] p-5">
              <Icon className={toneClass.text} size={27} strokeWidth={1.6} />
              <h3 className="mt-5 font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta({
  onStart,
  onPro,
  activeAction,
  profile
}: {
  onStart: () => void;
  onPro: () => void;
  activeAction: string | null;
  profile: UserProfile | null;
}) {
  return (
    <section className="relative z-10">
      <div className="relative overflow-hidden border border-cyan/25 bg-[radial-gradient(circle_at_18%_0%,rgba(34,197,245,0.12),transparent_34%),radial-gradient(circle_at_88%_92%,rgba(124,92,255,0.1),transparent_36%),rgba(255,255,255,0.03)] p-7 md:p-9">
        <h2 className="max-w-4xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-5xl">
          Start with a diagnostic. Upgrade when you need deeper inspection.
        </h2>
        <div className="mt-7 flex flex-wrap gap-3">
          <button className="EdgeTrace-secondary-button" onClick={onStart}>
            {profile ? "Analyze Trades" : "Create Free Account"}
          </button>
          <button className="EdgeTrace-primary-button" onClick={onPro}>
            {activeAction === "pro" ? "Redirecting..." : profile ? "Upgrade to Pro" : "Choose Pro"} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function AccessValue({ value, planId }: { value: string; planId: PlanId }) {
  const toneClass = toneClasses[planToneFromId(planId)];
  if (value === "-") {
    return <span className="text-muted">Not included</span>;
  }
  if (value === "Coming soon") {
    return <span className={toneClass.text}>Coming soon</span>;
  }
  return (
    <span className={`inline-flex items-center gap-2 ${toneClass.text}`}>
      <Check size={14} /> {value}
    </span>
  );
}

function planToneFromId(planId: PlanId): "cyan" | "purple" | "amber" {
  return planId === "advanced" ? "amber" : planId === "pro" ? "purple" : "cyan";
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

function formatSubscriptionStatus(status: string) {
  const normalized = status.replace(/_/g, " ");
  return `Subscription ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

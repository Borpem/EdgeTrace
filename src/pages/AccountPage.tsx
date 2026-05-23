import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Check,
  CreditCard,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCircle
} from "lucide-react";
import type { AuthUser } from "../context/AuthContext";
import { createBillingPortalSession, createCheckoutSession, getMe } from "../lib/api";
import { getPlanConfig } from "../lib/entitlements";
import type { PlanId, UserProfile } from "../types";

type AccountPageProps = {
  profile: UserProfile | null;
  user: AuthUser | null;
  onPlanChanged: (profile: UserProfile) => void;
  onAnalyze: () => void;
  onPricing: () => void;
};

type Tone = "cyan" | "purple" | "amber";
const accountPlanOrder: PlanId[] = ["free", "pro", "advanced"];

export function AccountPage({ profile, user, onPlanChanged, onAnalyze, onPricing }: AccountPageProps) {
  const [localProfile, setLocalProfile] = useState<UserProfile | null>(profile);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const effectiveProfile = localProfile ?? profile;
  const currentPlanId = effectiveProfile?.planId ?? "free";
  const plan = getPlanConfig(currentPlanId);
  const billingConfigured = !effectiveProfile || effectiveProfile.billingConfigured === true;
  const displayName = user?.name || effectiveProfile?.name || "EdgeTrace user";
  const displayEmail = user?.email || effectiveProfile?.email || "Email unavailable";
  const planToneClass = planTone(currentPlanId);

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (currentPlanId !== "free" && error.toLowerCase().includes("checkout")) {
      setError("");
      setNotice("Pro access is active for this account.");
    }
  }, [currentPlanId, error]);

  const refreshProfile = async () => {
    setError("");
    setNotice("");
    setActiveAction("refresh");
    try {
      const { profile: refreshed } = await getMe();
      setLocalProfile(refreshed);
      onPlanChanged(refreshed);
      setNotice("Account details refreshed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh account details.");
    } finally {
      setActiveAction(null);
    }
  };

  const startProCheckout = async () => {
    setNotice("");
    setError("");
    setActiveAction("pro");
    try {
      const { url } = await createCheckoutSession("pro");
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start Pro checkout.";
      setError(
        message.includes("diagnostics service") || message.includes("EdgeTrace service")
          ? "Checkout could not start because the billing service returned an internal error. Try again in a moment."
          : message
      );
      setActiveAction(null);
    }
  };

  const openPortal = async () => {
    setNotice("");
    setError("");
    setActiveAction("portal");
    try {
      const { url } = await createBillingPortalSession();
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to open the billing portal.";
      setError(
        message.includes("billing service") || message.includes("EdgeTrace service")
          ? "Billing portal could not open. Refresh account details and confirm Stripe Customer Portal is configured."
          : message
      );
      setActiveAction(null);
    }
  };

  const isPaid = currentPlanId !== "free";
  const hasStripeCustomer = Boolean(effectiveProfile?.stripeCustomerId);

  return (
    <main className="EdgeTrace-account-page EdgeTrace-shell py-8 md:py-12">
      <section className="EdgeTrace-account-hero">
        <div>
          <p className="EdgeTrace-account-eyebrow">Account & billing</p>
          <h1>Simple pricing. Serious edge.</h1>
          <p>
            Manage your plan, Stripe billing access, and the diagnostic workflow available to this workspace.
          </p>
          <div className="EdgeTrace-account-plan-chip">
            <span>Current plan</span>
            <strong className={planToneClass.text}>{plan.displayName}</strong>
            <span>{plan.monthlyPriceLabel}</span>
          </div>
        </div>
        <div className="EdgeTrace-account-actions">
          <button className="EdgeTrace-pricing-secondary" disabled={activeAction === "refresh"} onClick={() => void refreshProfile()}>
            <RefreshCw size={16} /> {activeAction === "refresh" ? "Refreshing..." : "Refresh"}
          </button>
          <button className="EdgeTrace-pricing-primary" onClick={onPricing}>
            View full pricing
          </button>
        </div>
      </section>

      {notice && <div className="mt-6 border border-cyan/45 bg-cyan/10 p-4 text-sm text-cyan">{notice}</div>}
      {error && <div className="mt-6 border border-loss/60 bg-loss/10 p-4 text-sm text-loss">{error}</div>}
      {!billingConfigured && (
        <div className="mt-6 border border-warning/50 bg-warning/10 p-4 text-sm text-warning">
          Billing is not configured in this environment. Add Stripe keys and the Pro price ID before testing checkout.
        </div>
      )}

      <section className="EdgeTrace-account-summary-grid">
        <AccountSummaryCard
          icon={UserCircle}
          accent="cyan"
          label="Workspace"
          value={displayName}
          detail={displayEmail}
        />
        <AccountSummaryCard
          icon={CreditCard}
          accent={currentPlanId === "advanced" ? "amber" : currentPlanId === "pro" ? "purple" : "cyan"}
          label="Current access"
          value={plan.displayName}
          detail={`${plan.monthlyPriceLabel} · ${plan.description}`}
          badge={isPaid ? "Active" : "Free"}
        />
        <AccountSummaryCard
          icon={Lock}
          accent={hasStripeCustomer ? "cyan" : "amber"}
          label="Billing"
          value={hasStripeCustomer ? "Stripe connected" : isPaid ? "Refresh needed" : "No paid subscription"}
          detail={hasStripeCustomer ? "Manage payment method and invoices through Stripe." : "Upgrade to Pro to create a Stripe billing profile."}
        />
      </section>

      <section className="EdgeTrace-account-plan-stage">
        <div className="EdgeTrace-account-plan-top">
          <div>
            <div className="flex items-center gap-3">
              <CreditCard className={isPaid ? "text-violet" : "text-cyan"} size={26} strokeWidth={1.6} />
              <h2>Choose the workflow depth your strategy needs.</h2>
            </div>
            <p>
              Free gives a real first diagnostic. Pro is the full self-serve workflow at $19/month. Advanced is the
              monitoring roadmap.
            </p>
          </div>
          <div className="EdgeTrace-account-billing-card">
            <p>{isPaid ? "Subscription" : "Recommended"}</p>
            <h3>{isPaid ? "Manage billing" : "Upgrade to Pro"}</h3>
            <span>
              {isPaid
                ? "Open Stripe for payment methods, invoices, and cancellation settings."
                : "Activate unlimited reports, full drilldowns, comparisons, strategy sets, exports, and monitoring."}
            </span>
            {isPaid && !hasStripeCustomer ? (
              <button className="EdgeTrace-pricing-secondary mt-5 w-full" disabled={activeAction === "refresh"} onClick={() => void refreshProfile()}>
                <RefreshCw size={16} /> {activeAction === "refresh" ? "Refreshing..." : "Refresh billing status"}
              </button>
            ) : (
              <button
                className="EdgeTrace-pricing-primary mt-5 w-full"
                disabled={!billingConfigured || activeAction === "pro" || activeAction === "portal"}
                onClick={() => void (isPaid ? openPortal() : startProCheckout())}
              >
                {activeAction === "pro"
                  ? "Opening Checkout..."
                  : activeAction === "portal"
                    ? "Opening Portal..."
                    : isPaid
                      ? "Manage Billing"
                      : "Upgrade to Pro"}{" "}
                <ArrowRight size={16} />
              </button>
            )}
            {isPaid && !hasStripeCustomer && (
              <small>
                Pro access is active, but no Stripe billing customer is linked yet. Refresh after checkout completes.
              </small>
            )}
            {effectiveProfile?.stripeCustomerId && !isPaid && (
              <button className="EdgeTrace-pricing-secondary mt-3 w-full" onClick={() => void openPortal()}>
                Open Billing Portal
              </button>
            )}
          </div>
        </div>

        <div className="EdgeTrace-account-plan-grid">
          {accountPlanOrder.map((planId) => (
            <AccountPlanCard
              key={planId}
              planId={planId}
              currentPlanId={currentPlanId}
              billingConfigured={billingConfigured}
              activeAction={activeAction}
              onStartPro={() => void startProCheckout()}
              onManage={() => void openPortal()}
            />
          ))}
        </div>
      </section>

      <section className="EdgeTrace-account-detail-grid">
            <article className="EdgeTrace-card p-6">
              <div className="flex items-center gap-3">
                <UserCircle className="text-cyan" size={25} strokeWidth={1.6} />
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-ink">Profile</h2>
              </div>
              <dl className="mt-5 divide-y divide-white/[0.07]">
                <DetailRow label="Name" value={displayName} />
                <DetailRow label="Email" value={displayEmail} />
                <DetailRow label="Plan" value={plan.displayName} valueClass={planToneClass.text} />
                <DetailRow
                  label="Subscription"
                  value={
                    effectiveProfile?.stripeSubscriptionStatus
                      ? formatSubscriptionStatus(effectiveProfile.stripeSubscriptionStatus)
                      : "No active paid subscription"
                  }
                />
                <DetailRow
                  label="Stripe customer"
                  value={hasStripeCustomer ? "Connected" : "Not linked"}
                  valueClass={hasStripeCustomer ? "text-cyan" : "text-warning"}
                />
                <DetailRow label="Current period" value={formatDate(effectiveProfile?.currentPeriodEnd) || "Not available"} />
              </dl>
            </article>

            <article className="EdgeTrace-card p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-violet" size={25} strokeWidth={1.6} />
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-ink">Access included</h2>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {accessItems(currentPlanId).map((item) => (
                  <div key={item.title} className="flex gap-3 border border-white/[0.08] bg-white/[0.025] p-4">
                    <Check className={item.enabled ? "text-cyan" : "text-muted"} size={16} />
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
      </section>

      <section className="EdgeTrace-account-support-grid">
        <InfoTile
          icon={Lock}
          title="Stripe-hosted billing"
          body="Checkout and portal management stay inside Stripe-hosted flows."
          accent="cyan"
        />
        <InfoTile
          icon={FileText}
          title="Report access"
          body="Free includes one full report. Pro unlocks the full workflow across reports."
          accent="purple"
        />
        <InfoTile
          icon={Sparkles}
          title="Advanced roadmap"
          body="Recurring reviews, regression alerts, and Edge Stability Score remain coming soon."
          accent="amber"
        />
      </section>
    </main>
  );
}

function AccountSummaryCard({
  icon: Icon,
  accent,
  label,
  value,
  detail,
  badge
}: {
  icon: LucideIcon;
  accent: Tone;
  label: string;
  value: string;
  detail: string;
  badge?: string;
}) {
  const tone = toneClasses[accent];
  return (
    <article className="EdgeTrace-account-summary-card">
      <div className="flex items-start justify-between gap-4">
        <Icon className={tone.text} size={24} strokeWidth={1.6} />
        {badge && <span className={tone.text}>{badge}</span>}
      </div>
      <p>{label}</p>
      <h2 className={tone.text}>{value}</h2>
      <small>{detail}</small>
    </article>
  );
}

function AccountPlanCard({
  planId,
  currentPlanId,
  billingConfigured,
  activeAction,
  onStartPro,
  onManage
}: {
  planId: PlanId;
  currentPlanId: PlanId;
  billingConfigured: boolean;
  activeAction: string | null;
  onStartPro: () => void;
  onManage: () => void;
}) {
  const config = getPlanConfig(planId);
  const tone = planTone(planId);
  const isCurrent = currentPlanId === planId;
  const isPro = planId === "pro";
  const isAdvanced = planId === "advanced";
  const canManagePaid = currentPlanId !== "free";
  const isBusy = activeAction === "pro" || activeAction === "portal";

  const button = (() => {
    if (isAdvanced && !isCurrent) {
      return (
        <button className="EdgeTrace-pricing-secondary" disabled>
          Coming Soon
        </button>
      );
    }
    if (isCurrent && planId === "free") {
      return (
        <button className="EdgeTrace-pricing-secondary" disabled>
          Current Plan
        </button>
      );
    }
    if (isCurrent || (canManagePaid && isPro)) {
      return (
        <button className="EdgeTrace-pricing-secondary" disabled={isBusy} onClick={onManage}>
          {activeAction === "portal" ? "Opening..." : isCurrent ? "Manage Billing" : "Included"}
        </button>
      );
    }
    if (isPro) {
      return (
        <button className="EdgeTrace-pricing-primary" disabled={!billingConfigured || isBusy} onClick={onStartPro}>
          {activeAction === "pro" ? "Opening..." : "Upgrade to Pro"}
        </button>
      );
    }
    return (
      <button className="EdgeTrace-pricing-secondary" disabled>
        Included
      </button>
    );
  })();

  return (
    <article className={`EdgeTrace-account-plan-card ${isPro ? "featured" : ""} ${planId}`}>
      {(isPro || isAdvanced) && (
        <div className={`EdgeTrace-account-plan-ribbon ${planId}`}>
          {isPro ? "Most Popular" : "Coming Soon"}
        </div>
      )}
      <div className="EdgeTrace-account-plan-card-body">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3>{config.displayName}</h3>
            <p>{config.description}</p>
          </div>
          {isCurrent && <span className={tone.text}>Current</span>}
        </div>
        <div className="EdgeTrace-account-plan-price">
          {config.monthlyPriceLabel === "Coming Soon" ? (
            <strong>Coming Soon</strong>
          ) : (
            <>
              <strong>{config.monthlyPriceLabel.replace("/month", "")}</strong>
              {config.monthlyPriceLabel.includes("/month") && <em>/mo</em>}
            </>
          )}
        </div>
        {button}
        <ul>
          {config.featureBullets.map((feature) => (
            <li key={feature}>
              <Check size={15} aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function DetailRow({ label, value, valueClass = "text-ink" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[150px_1fr]">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd className={`break-words text-sm font-semibold ${valueClass}`}>{value}</dd>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  title,
  body,
  accent
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  accent: Tone;
}) {
  const tone = toneClasses[accent];
  return (
    <article className="EdgeTrace-card-soft p-5">
      <Icon className={tone.text} size={24} strokeWidth={1.6} />
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </article>
  );
}

function accessItems(planId: PlanId) {
  const pro = planId === "pro" || planId === "advanced";
  return [
    {
      title: "Diagnostic reports",
      body: planId === "free" ? "One full report, then preview access." : "Unlimited full reports.",
      enabled: true
    },
    {
      title: "Broker CSV imports",
      body: "Supported broker and generic CSV uploads.",
      enabled: true
    },
    {
      title: "Full drilldowns",
      body: pro ? "Unlocked across report attribution." : "Upgrade to inspect full attribution.",
      enabled: pro
    },
    {
      title: "Compare and strategy sets",
      body: pro ? "Unlocked for iteration tracking." : "Preview only on Free.",
      enabled: pro
    }
  ];
}

function planTone(planId: PlanId) {
  return planId === "advanced" ? toneClasses.amber : planId === "pro" ? toneClasses.purple : toneClasses.cyan;
}

function formatDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function formatSubscriptionStatus(status: string) {
  const normalized = status.replace(/_/g, " ");
  return `Subscription ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

const toneClasses = {
  cyan: {
    text: "text-cyan",
    bg: "bg-cyan/[0.055]",
    border: "border-cyan/35",
    dot: "bg-cyan"
  },
  purple: {
    text: "text-violet",
    bg: "bg-violet/[0.055]",
    border: "border-violet/35",
    dot: "bg-violet"
  },
  amber: {
    text: "text-warning",
    bg: "bg-warning/[0.055]",
    border: "border-warning/35",
    dot: "bg-warning"
  }
} as const;

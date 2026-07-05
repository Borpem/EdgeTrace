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
  XCircle,
  UserCircle
} from "lucide-react";
import type { AuthUser } from "../context/AuthContext";
import { createBillingPortalSession, createCheckoutSession, createSubscriptionCancellationSession, getMe } from "../lib/api";
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
const accountPlanOrder: PlanId[] = ["free", "pro"];
const cancellationCheckKey = "edgetrace:billing-cancellation-check";

export function AccountPage({ profile, user, onPlanChanged, onAnalyze, onPricing }: AccountPageProps) {
  const [localProfile, setLocalProfile] = useState<UserProfile | null>(profile);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [billingActionMessage, setBillingActionMessage] = useState("");
  const [billingActionError, setBillingActionError] = useState("");

  const effectiveProfile = localProfile ?? profile;
  const currentPlanId = effectiveProfile?.planId ?? "free";
  const plan = getPlanConfig(currentPlanId);
  const proPlan = getPlanConfig("pro");
  const billingConfigured = !effectiveProfile || effectiveProfile.billingConfigured === true;
  const displayName = user?.name || effectiveProfile?.name || "EdgeTrace user";
  const displayEmail = user?.email || effectiveProfile?.email || "Email unavailable";
  const planToneClass = planTone(currentPlanId);
  const isPaid = currentPlanId !== "free";
  const hasStripeCustomer = Boolean(effectiveProfile?.stripeCustomerId);
  const billingLinkStatus = effectiveProfile?.billingLinkStatus;
  const billingLinkMessage = effectiveProfile?.billingLinkMessage || "";
  const billingLinkProblem = billingLinkStatus === "needs_repair" || /could not find.*customer|live customer or subscription|billing link/i.test(
    `${billingLinkMessage} ${billingActionError} ${error}`
  );
  const hasVerifiedStripeCustomer = hasStripeCustomer && !billingLinkProblem;
  const periodEndLabel = formatDate(effectiveProfile?.currentPeriodEnd);
  const subscriptionStatus = effectiveProfile?.stripeSubscriptionStatus ?? "";
  const subscriptionCanceled = isCanceledSubscriptionStatus(subscriptionStatus);
  const cancellationScheduled = Boolean(effectiveProfile?.stripeCancelAtPeriodEnd);
  const hasKnownCancellation = cancellationScheduled || subscriptionCanceled;
  const cancellationEndLabel = periodEndLabel || "the current billing period end";
  const cancellationEndedLabel = periodEndLabel || "the Stripe cancellation date";
  const renewalLabel = billingLinkProblem
    ? "Unverified"
    : cancellationScheduled
      ? cancellationEndLabel
      : subscriptionCanceled
        ? cancellationEndedLabel
        : periodEndLabel || "Not available";
  const planChipDetail =
    billingLinkProblem && isPaid
      ? "Billing unverified"
      : cancellationScheduled
        ? `Access until ${cancellationEndLabel}`
        : subscriptionCanceled
          ? "Subscription canceled"
        : isPaid && periodEndLabel
          ? `Renews ${periodEndLabel}`
          : plan.monthlyPriceLabel;
  const subscriptionLabel =
    billingLinkProblem
      ? "Billing link unverified"
      : cancellationScheduled
      ? `Cancels on ${cancellationEndLabel}`
      : subscriptionCanceled
        ? `Canceled${periodEndLabel ? ` on ${periodEndLabel}` : ""}`
      : subscriptionStatus
        ? formatSubscriptionStatus(subscriptionStatus)
        : "No active paid subscription";
  const currentAccessDetail =
    billingLinkProblem
      ? "Pro access is set locally, but Stripe billing could not be verified."
      : cancellationScheduled
      ? `Pro access remains active until ${cancellationEndLabel}.`
      : subscriptionCanceled
      ? `Stripe reports this subscription as canceled. Current access is ${plan.displayName}.`
      : isPaid
      ? periodEndLabel
        ? `Pro is active. Next renewal is ${periodEndLabel}.`
        : `${plan.monthlyPriceLabel} - ${plan.description}`
      : periodEndLabel
        ? `Previous billing period ended ${periodEndLabel}. Current access is ${plan.displayName}.`
        : `${plan.monthlyPriceLabel} - ${plan.description}`;
  const billingCardDetail =
    billingLinkProblem
      ? billingLinkMessage || "Stripe could not verify the saved billing customer. Refresh account details, then try again."
      : cancellationScheduled
      ? `Cancellation is scheduled. Pro access remains until ${cancellationEndLabel}.`
      : subscriptionCanceled
      ? `Stripe reports this subscription as canceled${periodEndLabel ? ` as of ${periodEndLabel}` : ""}.`
      : isPaid
        ? periodEndLabel
          ? `Stripe reports this subscription as active. Next renewal: ${periodEndLabel}.`
          : "Stripe reports this subscription as active."
        : "Activate the recurring review loop that checks new imports and flags what changed.";

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
    setBillingActionError("");
    setBillingActionMessage("");
    setActiveAction("refresh");
    try {
      const { profile: refreshed } = await getMe();
      setLocalProfile(refreshed);
      onPlanChanged(refreshed);
      setNotice(accountRefreshNotice(refreshed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh account details.");
    } finally {
      setActiveAction(null);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldCheckCancellation =
      params.get("billing") === "cancelled" || window.sessionStorage.getItem(cancellationCheckKey) === "1";
    if (!shouldCheckCancellation) return;

    let cancelled = false;
    window.sessionStorage.removeItem(cancellationCheckKey);
    setError("");
    setNotice("Checking Stripe cancellation status...");
    void getMe()
      .then(({ profile: refreshed }) => {
        if (cancelled) return;
        setLocalProfile(refreshed);
        onPlanChanged(refreshed);
        setNotice(cancellationCheckNotice(refreshed));
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Cancellation submitted, but account details could not be refreshed yet.");
      });

    return () => {
      cancelled = true;
    };
  }, [onPlanChanged]);

  const startProCheckout = async () => {
    setNotice("");
    setError("");
    setBillingActionError("");
    setBillingActionMessage("");
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
    setBillingActionError("");
    if (billingLinkProblem) {
      const message = billingLinkMessage || "Stripe could not verify the saved billing link for this account. Refresh account details, then try again.";
      setError(message);
      setBillingActionError(message);
      setBillingActionMessage("");
      return;
    }
    setBillingActionMessage("Opening Stripe billing portal...");
    setActiveAction("portal");
    try {
      const { url } = await createBillingPortalSession();
      if (!url) throw new Error("Stripe did not return a billing portal URL.");
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to open the billing portal.";
      setError(
        message.includes("billing service") || message.includes("EdgeTrace service")
          ? "Billing portal could not open. Refresh account details and confirm Stripe Customer Portal is configured."
          : message
      );
      setBillingActionError("Billing portal could not open. Refresh account details and try again.");
      setBillingActionMessage("");
      setActiveAction(null);
    }
  };

  const openCancellation = async () => {
    setNotice("");
    setError("");
    setBillingActionError("");
    if (billingLinkProblem) {
      const message = billingLinkMessage || "Stripe could not verify the saved billing link for this account. Refresh account details, then try again.";
      setError(message);
      setBillingActionError(message);
      setBillingActionMessage("");
      return;
    }
    setBillingActionMessage("Opening Stripe cancellation flow...");
    setActiveAction("cancel");
    try {
      const { url } = await createSubscriptionCancellationSession();
      if (!url) throw new Error("Stripe did not return a cancellation URL.");
      window.sessionStorage.setItem(cancellationCheckKey, "1");
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to open subscription cancellation.";
      setBillingActionMessage("Direct cancellation did not open. Trying the Stripe billing portal...");
      try {
        const { url } = await createBillingPortalSession();
        if (!url) throw new Error("Stripe did not return a billing portal URL.");
        window.sessionStorage.setItem(cancellationCheckKey, "1");
        window.location.href = url;
      } catch {
        const displayMessage =
          message.includes("billing service") || message.includes("EdgeTrace service")
            ? "Cancellation could not open. Refresh account details, then try Manage Billing."
            : message;
        setError(displayMessage);
        setBillingActionError(displayMessage);
        setBillingActionMessage("");
        setActiveAction(null);
      }
    }
  };

  const hasCancelableSubscription = isPaid && hasVerifiedStripeCustomer && Boolean(effectiveProfile?.stripeSubscriptionId) && !hasKnownCancellation;

  return (
    <main className="EdgeTrace-account-page EdgeTrace-shell py-8 md:py-12">
      <section className="EdgeTrace-account-hero">
        <div>
          <p className="EdgeTrace-account-eyebrow">Account & billing</p>
          <h1>Manage your account and billing.</h1>
          <p>
            Review your profile, current plan, Stripe billing access, and the diagnostic workflow available to this workspace.
          </p>
          <div className="EdgeTrace-account-plan-chip">
            <span>Current plan</span>
            <strong className={planToneClass.text}>{plan.displayName}</strong>
            <span>{planChipDetail}</span>
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
      {hasKnownCancellation && (
        <section className="EdgeTrace-account-cancellation-notice" aria-live="polite">
          <div>
            <p>{cancellationScheduled ? "Subscription cancellation scheduled" : "Subscription canceled"}</p>
            <h2>
              {cancellationScheduled
                ? `Your Pro access remains active until ${cancellationEndLabel}.`
                : `Stripe reports this subscription as canceled${periodEndLabel ? ` on ${periodEndLabel}` : ""}.`}
            </h2>
            <span>
              {cancellationScheduled
                ? "Stripe has marked this subscription to cancel at the end of the current billing period. You can keep using Pro features until that date."
                : `Your current account access is ${plan.displayName}. Refresh status if you recently changed billing in Stripe.`}
            </span>
          </div>
          <button className="EdgeTrace-pricing-secondary" disabled={activeAction === "refresh"} onClick={() => void refreshProfile()}>
            <RefreshCw size={16} /> {activeAction === "refresh" ? "Refreshing..." : "Refresh status"}
          </button>
        </section>
      )}
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
          detail={currentAccessDetail}
          badge={billingLinkProblem && isPaid ? "Unverified" : cancellationScheduled ? "Cancelling" : subscriptionCanceled ? "Canceled" : isPaid ? "Active" : "Free"}
        />
        <AccountSummaryCard
          icon={Lock}
          accent={billingLinkProblem ? "amber" : hasVerifiedStripeCustomer ? "cyan" : "amber"}
          label="Billing"
          value={billingLinkProblem ? "Stripe link needs repair" : hasVerifiedStripeCustomer ? "Stripe connected" : isPaid ? "Refresh needed" : "No paid subscription"}
          detail={
            billingLinkProblem
              ? "Stripe could not verify the saved billing customer for this account."
              : hasVerifiedStripeCustomer
                ? "Manage payment method and invoices through Stripe."
                : "Upgrade to Pro to create a Stripe billing profile."
          }
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
              Free includes the full core workflow. Pro adds weekly Edge Reviews, regression alerts,
              benchmark context, next-review checklists, review status, and aggregate context for {proPlan.monthlyPriceLabel}.
            </p>
          </div>
          <div className="EdgeTrace-account-billing-card">
            <p>{isPaid ? "Subscription" : "Recommended"}</p>
            <h3>{isPaid ? "Manage billing" : "Upgrade to Pro"}</h3>
            <span>{billingCardDetail}</span>
            {isPaid && (billingLinkProblem || !hasVerifiedStripeCustomer) ? (
              <button className="EdgeTrace-pricing-secondary mt-5 w-full" disabled={activeAction === "refresh"} onClick={() => void refreshProfile()}>
                <RefreshCw size={16} /> {activeAction === "refresh" ? "Refreshing..." : "Refresh billing status"}
              </button>
            ) : (
              <div className="mt-5 grid gap-3">
                <button
                  className="EdgeTrace-pricing-primary w-full"
                  disabled={!billingConfigured || activeAction === "pro" || activeAction === "portal" || activeAction === "cancel"}
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
                {isPaid && (
                  <button
                    className="EdgeTrace-pricing-secondary w-full border-loss/50 text-loss hover:border-loss disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      !billingConfigured ||
                      !hasCancelableSubscription ||
                      hasKnownCancellation ||
                      activeAction === "cancel" ||
                      activeAction === "portal"
                    }
                    onClick={() => void openCancellation()}
                  >
                    {subscriptionCanceled
                      ? "Subscription canceled"
                      : cancellationScheduled
                      ? "Cancellation scheduled"
                      : activeAction === "cancel"
                        ? "Opening Stripe..."
                        : "Open cancellation in Stripe"}{" "}
                    <XCircle size={16} />
                  </button>
                )}
              </div>
            )}
            {isPaid && hasCancelableSubscription && !cancellationScheduled && (
              <small>
                This opens Stripe. Your subscription is still active until Stripe confirms cancellation.
              </small>
            )}
            {billingActionMessage && <small className="text-cyan">{billingActionMessage}</small>}
            {billingActionError && <small className="text-loss">{billingActionError}</small>}
            {isPaid && !billingLinkProblem && !hasVerifiedStripeCustomer && (
              <small>
                Pro access is active, but no Stripe billing customer is linked yet. Refresh after checkout completes.
              </small>
            )}
            {isPaid && billingLinkProblem && (
              <small className="text-warning">
                Stripe actions are unavailable until the backend can verify the customer or subscription for this account.
              </small>
            )}
            {isPaid && hasVerifiedStripeCustomer && !hasCancelableSubscription && (
              <small>
                Subscription cancellation will appear after Stripe links the active subscription. Refresh account details or use Manage Billing.
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
              billingLinkProblem={billingLinkProblem}
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
                  value={subscriptionLabel}
                  valueClass={billingLinkProblem || hasKnownCancellation ? "text-warning" : "text-ink"}
                />
                <DetailRow
                  label="Stripe customer"
                  value={billingLinkProblem ? "Needs repair" : hasVerifiedStripeCustomer ? "Connected" : "Not linked"}
                  valueClass={billingLinkProblem ? "text-warning" : hasVerifiedStripeCustomer ? "text-cyan" : "text-warning"}
                />
                <DetailRow label={cancellationScheduled ? "Access ends" : subscriptionCanceled ? "Canceled date" : isPaid ? "Next renewal" : "Current period"} value={renewalLabel} />
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
          title="Core analytics"
          body="Free includes unlimited reports, dashboard diagnosis, top drivers, compare, strategy sets, audits, exports, and monitoring."
          accent="cyan"
        />
        <InfoTile
          icon={Sparkles}
          title="Pro review loop"
          body="Pro adds weekly Edge Reviews, regression alerts, benchmark context, review status, and next-review checklists."
          accent="purple"
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
  billingLinkProblem,
  activeAction,
  onStartPro,
  onManage
}: {
  planId: PlanId;
  currentPlanId: PlanId;
  billingConfigured: boolean;
  billingLinkProblem: boolean;
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
        <button className="EdgeTrace-pricing-secondary" disabled={isBusy || billingLinkProblem} onClick={onManage}>
          {billingLinkProblem ? "Billing Link Unavailable" : activeAction === "portal" ? "Opening..." : isCurrent ? "Manage Billing" : "Included"}
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
      body: "Unlimited full reports.",
      enabled: true
    },
    {
      title: "Broker CSV imports",
      body: "Supported broker and generic CSV uploads.",
      enabled: true
    },
    {
      title: "Full drilldowns",
      body: pro
        ? "Unlocked across symbols, sessions, setups, and time buckets."
        : "Upgrade to inspect the exact segment behind each report issue.",
      enabled: pro
    },
    {
      title: "Compare and strategy sets",
      body: "Unlocked for iteration tracking.",
      enabled: true
    },
    {
      title: "Review loop",
      body: pro ? "Weekly Edge Reviews and next-review checklists are active." : "Upgrade for recurring process reviews.",
      enabled: pro
    },
    {
      title: "Benchmark context",
      body: pro ? "Benchmark percentiles and cohort context are active." : "Upgrade for benchmark percentiles and cohort context.",
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

function accountRefreshNotice(profile: UserProfile) {
  const periodEnd = formatDate(profile.currentPeriodEnd);
  if (profile.billingLinkStatus === "needs_repair") {
    return profile.billingLinkMessage || "Stripe could not verify the saved billing link for this account.";
  }
  if (profile.stripeCancelAtPeriodEnd) {
    return `Cancellation detected. Pro access ends on ${periodEnd || "the current billing period end"}.`;
  }
  if (isCanceledSubscriptionStatus(profile.stripeSubscriptionStatus)) {
    return periodEnd
      ? `Subscription canceled. Stripe reports the billing period ended on ${periodEnd}.`
      : "Subscription canceled. This account is now on Free unless another active subscription is linked.";
  }
  if (profile.planId === "free") {
    return "You are on Free. No active Pro subscription is linked to this account.";
  }
  return periodEnd
    ? `Stripe reports Pro as active. Next renewal is ${periodEnd}.`
    : "Stripe reports Pro as active. Next renewal date is not available yet.";
}

function cancellationCheckNotice(profile: UserProfile) {
  const periodEnd = formatDate(profile.currentPeriodEnd);
  if (profile.billingLinkStatus === "needs_repair") {
    return profile.billingLinkMessage || "Stripe could not verify the saved billing link after checking cancellation status.";
  }
  if (profile.stripeCancelAtPeriodEnd) {
    return `Cancellation confirmed. Pro access remains available until ${periodEnd || "the current billing period end"}.`;
  }
  if (isCanceledSubscriptionStatus(profile.stripeSubscriptionStatus)) {
    return periodEnd
      ? `Cancellation confirmed. Stripe reports this subscription as canceled as of ${periodEnd}.`
      : "Cancellation confirmed. Stripe reports this subscription as canceled.";
  }
  if (profile.planId === "free") {
    return "Cancellation confirmed. This account is now on Free.";
  }
  return periodEnd
    ? `Cancellation was not detected. Stripe still reports this subscription as active and renewing on ${periodEnd}. Open the Stripe cancellation flow and confirm the final step.`
    : "Cancellation was not detected. Stripe still reports this subscription as active. Open the Stripe cancellation flow and confirm the final step.";
}

function formatSubscriptionStatus(status: string) {
  const normalized = status.replace(/_/g, " ");
  return `Subscription ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function isCanceledSubscriptionStatus(status: string | undefined) {
  const normalized = status?.trim().toLowerCase();
  return normalized === "canceled" || normalized === "cancelled";
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

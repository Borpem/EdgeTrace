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
    <main className="EdgeTrace-shell py-8 md:py-12">
      <section className="border-b border-white/[0.08] pb-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-6xl">
              Account & billing
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
              Manage your plan, Stripe billing access, and the diagnostic workflow available to this workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="EdgeTrace-secondary-button" disabled={activeAction === "refresh"} onClick={() => void refreshProfile()}>
              <RefreshCw size={16} /> {activeAction === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
            <button className="EdgeTrace-secondary-button" onClick={onPricing}>
              View pricing
            </button>
          </div>
        </div>
      </section>

      {notice && <div className="mt-6 border border-cyan/45 bg-cyan/10 p-4 text-sm text-cyan">{notice}</div>}
      {error && <div className="mt-6 border border-loss/60 bg-loss/10 p-4 text-sm text-loss">{error}</div>}
      {!billingConfigured && (
        <div className="mt-6 border border-warning/50 bg-warning/10 p-4 text-sm text-warning">
          Billing is not configured in this environment. Add Stripe keys and the Pro price ID before testing checkout.
        </div>
      )}

      <section className="mt-7 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <article className="EdgeTrace-card-soft p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center border border-cyan/35 bg-cyan/[0.08] text-xl font-semibold text-cyan">
                {initials(displayName, displayEmail)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold tracking-[-0.03em] text-ink">{displayName}</p>
                <p className="mt-1 truncate text-sm text-muted">{displayEmail}</p>
              </div>
            </div>
            <div className="mt-6 space-y-3 border-t border-white/[0.08] pt-5">
              <AccountMeta label="Workspace ID" value={shortId(effectiveProfile?.userId || user?.id || "")} />
              <AccountMeta label="Account created" value={formatDate(user?.createdAt || effectiveProfile?.createdAt)} />
            </div>
          </article>

          <article className={`border p-5 ${planToneClass.border} ${planToneClass.bg}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Current access</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className={`text-4xl font-semibold tracking-[-0.055em] ${planToneClass.text}`}>
                  {plan.displayName}
                </p>
                <p className="mt-2 text-sm text-muted">{plan.monthlyPriceLabel}</p>
              </div>
              <span className={`border px-2.5 py-1 text-xs font-semibold ${planToneClass.border} ${planToneClass.text}`}>
                {isPaid ? "Active" : "Free"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">{plan.description}</p>
          </article>
        </aside>

        <div className="space-y-5">
          <section className="relative overflow-hidden border border-white/[0.1] bg-[radial-gradient(circle_at_12%_0%,rgba(124,92,255,0.11),transparent_28rem),rgba(255,255,255,0.03)] p-6 md:p-7">
            <div className="grid gap-7 lg:grid-cols-[1fr_330px] lg:items-start">
              <div>
                <div className="flex items-center gap-3">
                  <CreditCard className={isPaid ? "text-violet" : "text-cyan"} size={26} strokeWidth={1.6} />
                  <h2 className="text-3xl font-semibold tracking-[-0.045em] text-ink">Plan management</h2>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
                  Pro unlocks the full EdgeTrace workflow: unlimited diagnostic reports, full drilldowns, report
                  comparisons, strategy sets, reconstruction audit, exports, and strategy health monitoring.
                </p>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <PlanPill title="Free" body="First full diagnostic" accent="cyan" active={currentPlanId === "free"} />
                  <PlanPill title="Pro" body="$19/month full workflow" accent="purple" active={currentPlanId === "pro"} />
                  <PlanPill title="Advanced" body="Coming soon" accent="amber" active={currentPlanId === "advanced"} />
                </div>
              </div>

              <div className="border border-violet/30 bg-violet/[0.055] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet">
                  {isPaid ? "Subscription" : "Recommended upgrade"}
                </p>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-ink">
                  {isPaid ? "Manage your subscription" : "Upgrade to Pro"}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {isPaid
                    ? "Open Stripe to update payment method, invoices, or cancellation settings."
                    : "Start Stripe Checkout to activate Pro access for this account."}
                </p>
                {isPaid && !hasStripeCustomer ? (
                  <button className="EdgeTrace-secondary-button mt-5 w-full justify-center" disabled={activeAction === "refresh"} onClick={() => void refreshProfile()}>
                    <RefreshCw size={16} /> {activeAction === "refresh" ? "Refreshing..." : "Refresh billing status"}
                  </button>
                ) : (
                  <button
                    className="EdgeTrace-primary-button mt-5 w-full justify-center"
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
                  <p className="mt-3 text-xs leading-5 text-warning">
                    Pro access is active, but no Stripe billing customer is linked yet. Refresh after checkout completes.
                  </p>
                )}
                {effectiveProfile?.stripeCustomerId && !isPaid && (
                  <button className="mt-3 w-full border border-white/[0.1] px-4 py-3 text-sm font-semibold text-muted hover:border-white/25 hover:text-ink" onClick={() => void openPortal()}>
                    Open Billing Portal
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
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

          <section className="grid gap-4 md:grid-cols-3">
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
        </div>
      </section>
    </main>
  );
}

function AccountMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted">{label}</span>
      <span className="truncate font-semibold text-ink">{value}</span>
    </div>
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

function PlanPill({
  title,
  body,
  accent,
  active
}: {
  title: string;
  body: string;
  accent: Tone;
  active: boolean;
}) {
  const tone = toneClasses[accent];
  return (
    <div className={`border p-4 ${active ? `${tone.border} ${tone.bg}` : "border-white/[0.08] bg-white/[0.02]"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`font-semibold ${active ? tone.text : "text-ink"}`}>{title}</p>
        {active && <span className={`h-2 w-2 ${tone.dot}`} />}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
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

function initials(name: string, email: string) {
  const source = name !== "EdgeTrace user" ? name : email;
  const letters = source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return letters || "ET";
}

function shortId(value: string) {
  if (!value) return "Unavailable";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
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

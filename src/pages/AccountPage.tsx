import { useEffect, useState } from "react";
import { ArrowRight, CreditCard, FileText, RefreshCw, ShieldCheck, Sparkles, UserCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createBillingPortalSession, createCheckoutSession, getMe } from "../lib/api";
import { getPlanConfig } from "../lib/entitlements";
import type { UserProfile } from "../types";

type AccountPageProps = {
  profile: UserProfile | null;
  onPlanChanged: (profile: UserProfile) => void;
  onAnalyze: () => void;
  onPricing: () => void;
};

export function AccountPage({ profile, onPlanChanged, onAnalyze, onPricing }: AccountPageProps) {
  const [localProfile, setLocalProfile] = useState<UserProfile | null>(profile);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const effectiveProfile = localProfile ?? profile;
  const currentPlanId = effectiveProfile?.planId ?? "free";
  const plan = getPlanConfig(currentPlanId);
  const billingConfigured = !effectiveProfile || effectiveProfile.billingConfigured === true;

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  const refreshProfile = async () => {
    setError("");
    setActiveAction("refresh");
    try {
      const { profile: refreshed } = await getMe();
      setLocalProfile(refreshed);
      onPlanChanged(refreshed);
      setNotice("Account plan refreshed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh account.");
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
      setError(err instanceof Error ? err.message : "Unable to start Pro checkout.");
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
      setError(err instanceof Error ? err.message : "Unable to open the billing portal.");
      setActiveAction(null);
    }
  };

  const primaryAction =
    currentPlanId === "free" ? (
      <button className="EdgeTrace-primary-button" disabled={!billingConfigured || activeAction === "pro"} onClick={() => void startProCheckout()}>
        {activeAction === "pro" ? "Opening Checkout..." : "Upgrade to Pro"} <ArrowRight size={16} />
      </button>
    ) : (
      <button className="EdgeTrace-primary-button" disabled={activeAction === "portal"} onClick={() => void openPortal()}>
        {activeAction === "portal" ? "Opening..." : "Manage Billing"} <ArrowRight size={16} />
      </button>
    );

  return (
    <main className="EdgeTrace-shell py-8 md:py-12">
      <section className="relative overflow-hidden border border-white/[0.08] bg-[radial-gradient(circle_at_18%_0%,rgba(34,197,245,0.12),transparent_32rem),radial-gradient(circle_at_82%_12%,rgba(124,92,255,0.11),transparent_30rem),rgba(255,255,255,0.025)] p-6 md:p-8">
        <div className="grid gap-7 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-6xl">
              My Account
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
              Manage your plan, billing access, and the workflow depth available in EdgeTrace.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {primaryAction}
              <button className="EdgeTrace-secondary-button" onClick={onAnalyze}>
                Analyze Trades
              </button>
              <button className="EdgeTrace-secondary-button" onClick={onPricing}>
                View Pricing
              </button>
            </div>
          </div>

          <div className={`border p-5 ${planTone(currentPlanId).border} ${planTone(currentPlanId).bg}`}>
            <p className="text-sm text-muted">Current plan</p>
            <p className={`mt-3 text-4xl font-semibold tracking-[-0.055em] ${planTone(currentPlanId).text}`}>
              {plan.displayName}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">{plan.description}</p>
            {effectiveProfile?.stripeSubscriptionStatus && (
              <p className="mt-4 text-sm font-semibold text-ink">
                {formatSubscriptionStatus(effectiveProfile.stripeSubscriptionStatus)}
              </p>
            )}
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

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="EdgeTrace-card p-6">
          <div className="flex items-start gap-4">
            <UserCircle className="text-cyan" size={30} strokeWidth={1.6} />
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-ink">Account details</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {effectiveProfile?.email || effectiveProfile?.name
                  ? "This is the signed-in account used for reports, comparisons, strategy sets, and billing."
                  : "Your signed-in profile is still loading. Refresh account details if the plan looks stale."}
              </p>
            </div>
          </div>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <AccountFact label="Name" value={effectiveProfile?.name || "Not provided"} />
            <AccountFact label="Email" value={effectiveProfile?.email || "Not provided"} />
            <AccountFact label="Plan" value={plan.displayName} tone={planTone(currentPlanId).text} />
            <AccountFact
              label="Subscription"
              value={effectiveProfile?.stripeSubscriptionStatus ? formatSubscriptionStatus(effectiveProfile.stripeSubscriptionStatus) : "No active paid subscription"}
            />
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="EdgeTrace-secondary-button" disabled={activeAction === "refresh"} onClick={() => void refreshProfile()}>
              <RefreshCw size={16} /> {activeAction === "refresh" ? "Refreshing..." : "Refresh Account"}
            </button>
            {effectiveProfile?.stripeCustomerId && (
              <button className="EdgeTrace-secondary-button" disabled={activeAction === "portal"} onClick={() => void openPortal()}>
                <CreditCard size={16} /> {activeAction === "portal" ? "Opening..." : "Billing Portal"}
              </button>
            )}
          </div>
        </article>

        <article className="EdgeTrace-card p-6">
          <div className="flex items-start gap-4">
            <Sparkles className="text-violet" size={30} strokeWidth={1.6} />
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-ink">Upgrade path</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Pro is the current paid workflow. Advanced monitoring remains visible as the roadmap tier.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            <PlanRow title="Free" body="One full diagnostic report with preview access after that." accent="cyan" active={currentPlanId === "free"} />
            <PlanRow title="Pro" body="Unlimited reports, drilldowns, compare, strategy sets, reconstruction audit, and exports." accent="purple" active={currentPlanId === "pro"} />
            <PlanRow title="Advanced" body="Recurring reviews, regression alerts, and Edge Stability Score. Coming soon." accent="amber" active={currentPlanId === "advanced"} />
          </div>
        </article>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-3">
        <InfoTile
          icon={FileText}
          title="Full workflow in Pro"
          body="Upgrade to inspect attribution, compare iterations, and organize related reports into strategy sets."
          accent="purple"
        />
        <InfoTile
          icon={ShieldCheck}
          title="Billing stays in Stripe"
          body="Checkout and subscription management use Stripe-hosted flows so payment data is not handled by EdgeTrace."
          accent="cyan"
        />
        <InfoTile
          icon={Sparkles}
          title="Advanced is coming soon"
          body="Advanced features remain in the product model for testing and roadmap visibility, but self-serve checkout is Pro only."
          accent="amber"
        />
      </section>
    </main>
  );
}

function AccountFact({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-white/[0.08] bg-white/[0.025] p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd className={`mt-2 break-words text-sm font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function PlanRow({
  title,
  body,
  accent,
  active
}: {
  title: string;
  body: string;
  accent: "cyan" | "purple" | "amber";
  active: boolean;
}) {
  const tone = toneClasses[accent];
  return (
    <div className={`border p-4 ${active ? `${tone.border} ${tone.bg}` : "border-white/[0.08] bg-white/[0.02]"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={`font-semibold ${active ? tone.text : "text-ink"}`}>{title}</h3>
        {active && <span className={`border px-2 py-1 text-xs font-semibold ${tone.border} ${tone.text}`}>Current</span>}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
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
  accent: "cyan" | "purple" | "amber";
}) {
  const tone = toneClasses[accent];
  return (
    <article className="EdgeTrace-card-soft p-5">
      <Icon className={tone.text} size={25} strokeWidth={1.6} />
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </article>
  );
}

function planTone(planId: string) {
  return planId === "advanced" ? toneClasses.amber : planId === "pro" ? toneClasses.purple : toneClasses.cyan;
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

import { SignUp } from "@clerk/clerk-react";
import { useAuth } from "../context/AuthContext";
import { Check } from "lucide-react";
import { PageShell } from "../components/ui/Primitives";
import { edgeTraceClerkAppearance } from "../lib/clerkAppearance";

export function SignupPage({
  onCreateAccount,
  onLogin
}: {
  onCreateAccount: () => void;
  onLogin: () => void;
}) {
  const { authMode } = useAuth();

  return (
    <PageShell className="pb-16 md:py-16">
      <section className="relative z-10 overflow-hidden border-b border-white/[0.08] pb-12 md:pb-16">
        <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[54rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,197,245,0.1),rgba(124,92,255,0.065)_44%,transparent_72%)] blur-[118px]" />
        <div className="relative grid gap-9 lg:grid-cols-[0.92fr_0.78fr] lg:items-center">
          <div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.08] tracking-[-0.04em] text-ink md:text-6xl xl:text-7xl">
              Create a strategy diagnostics workspace.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted md:text-lg md:leading-8">
              Upload completed trades, create unlimited diagnostic reports, and start tracking strategy changes over time.
            </p>
            <div className="mt-8 grid max-w-xl gap-3">
              {[
                "Full reporting workflow on Free",
                "Unlimited reports, imports, dashboard diagnosis, compare, and strategy sets",
                "Upgrade to Pro for drilldowns, heatmaps, benchmark percentiles, and next-review checklists"
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-muted">
                  <Check className="text-cyan" size={16} strokeWidth={1.7} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute -inset-x-5 bottom-[-1.4rem] h-12 bg-[radial-gradient(ellipse,rgba(88,214,255,0.18),rgba(124,92,255,0.08)_42%,transparent_72%)] blur-2xl" />
            <div className="relative overflow-hidden border border-white/[0.1] bg-[linear-gradient(145deg,rgba(8,13,22,0.98),rgba(4,8,15,0.95))] p-5 shadow-[0_30px_92px_-60px_rgba(88,214,255,0.72),0_14px_34px_-26px_rgba(0,0,0,0.96)] ring-1 ring-white/[0.035]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(124,92,255,0.12),transparent_34%),radial-gradient(circle_at_14%_86%,rgba(34,197,245,0.1),transparent_34%)]" />
              <div className="relative">
                <div className="mb-5 border-b border-white/[0.08] pb-4">
                  <p className="text-sm font-semibold text-ink">Create account</p>
                  <p className="mt-1 text-xs text-muted">Start with a free diagnostics workspace.</p>
                </div>
                {authMode === "clerk" ? (
                  <div className="flex justify-center">
                    <SignUp
                      routing="path"
                      path="/signup"
                      signInUrl="/login"
                      fallbackRedirectUrl="/app/dashboard"
                      appearance={edgeTraceClerkAppearance}
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <button className="EdgeTrace-primary-button" onClick={onCreateAccount}>
                      Create Account
                    </button>
                    <button className="EdgeTrace-secondary-button" onClick={onLogin}>
                      Already have access
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

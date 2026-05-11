import { SignIn } from "@clerk/clerk-react";
import { useAuth } from "../context/AuthContext";
import { edgeTraceClerkAppearance } from "../lib/clerkAppearance";

export function LoginPage({
  nextPath,
  onContinue,
  onSignup
}: {
  nextPath?: string;
  onContinue: () => void;
  onSignup: () => void;
}) {
  const { authMode } = useAuth();

  return (
    <main className="EdgeTrace-shell py-16 md:py-24">
      <section className="mx-auto max-w-3xl border-y border-white/[0.1] py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Login</p>
        <h1 className="mt-5 text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-ink md:text-7xl">
          Continue to your strategy workspace.
        </h1>
        <p className="mt-7 text-lg leading-8 text-muted">
          Sign in to access your private EdgeTrace workspace, saved reports, strategy sets, comparisons, and review
          workflows.
        </p>
        {nextPath && (
          <p className="mt-5 border-l border-cyan/70 pl-4 text-sm leading-6 text-muted">
            After login, EdgeTrace will return you to <span className="font-semibold text-ink">{nextPath}</span>.
          </p>
        )}
        {authMode === "clerk" ? (
          <div className="mt-9 flex justify-center">
            <SignIn
              routing="path"
              path="/login"
              signUpUrl="/signup"
              fallbackRedirectUrl={nextPath ?? "/app/dashboard"}
              appearance={edgeTraceClerkAppearance}
            />
          </div>
        ) : (
          <div className="mt-9 flex flex-wrap gap-3">
            <button className="EdgeTrace-primary-button" onClick={onContinue}>
              Continue to App
            </button>
            <button className="EdgeTrace-secondary-button" onClick={onSignup}>
              Create Demo Account
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

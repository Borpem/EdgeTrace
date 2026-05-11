import { SignUp } from "@clerk/clerk-react";
import { useAuth } from "../context/AuthContext";
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
    <main className="EdgeTrace-shell py-16 md:py-24">
      <section className="mx-auto max-w-3xl border-y border-white/[0.1] py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Sign Up</p>
        <h1 className="mt-5 text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-ink md:text-7xl">
          Create a strategy diagnostics workspace.
        </h1>
        <p className="mt-7 text-lg leading-8 text-muted">
          Access the private app workspace, upload completed trades, save reports, compare iterations, and organize
          strategy sets.
        </p>
        {authMode === "clerk" ? (
          <div className="mt-9 flex justify-center">
            <SignUp
              routing="path"
              path="/signup"
              signInUrl="/login"
              fallbackRedirectUrl="/app/dashboard"
              appearance={edgeTraceClerkAppearance}
            />
          </div>
        ) : (
          <div className="mt-9 flex flex-wrap gap-3">
            <button className="EdgeTrace-primary-button" onClick={onCreateAccount}>
              Create Demo Account
            </button>
            <button className="EdgeTrace-secondary-button" onClick={onLogin}>
              Already have access
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

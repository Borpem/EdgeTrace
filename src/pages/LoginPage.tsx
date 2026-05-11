import { SignIn } from "@clerk/clerk-react";
import { useAuth } from "../context/AuthContext";
import { PageHeader, PageShell } from "../components/ui/Primitives";
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
    <PageShell className="md:py-20">
      <section className="mx-auto max-w-3xl">
        <PageHeader
          title="Continue to your strategy workspace."
          subtitle="Sign in to access saved reports, strategy sets, comparisons, and review workflows."
        />
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
    </PageShell>
  );
}

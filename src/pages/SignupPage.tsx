import { SignUp } from "@clerk/clerk-react";
import { useAuth } from "../context/AuthContext";
import { PageHeader, PageShell } from "../components/ui/Primitives";
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
    <PageShell className="md:py-20">
      <section className="mx-auto max-w-3xl">
        <PageHeader
          title="Create a strategy diagnostics workspace."
          subtitle="Upload completed trades, save reports, compare iterations, and organize strategy sets."
        />
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
    </PageShell>
  );
}

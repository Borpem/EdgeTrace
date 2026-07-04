import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { Analytics } from "@vercel/analytics/react";
import { App } from "./App";
import {
  ClerkAuthProvider,
  MockAuthProvider,
  clerkProviderProps,
  clientAuthMode,
  clientStartupError
} from "./context/AuthContext";
import { OnboardingProvider } from "./context/OnboardingContext";
import "./styles.css";

const app = clientStartupError ? (
  <StartupError message={clientStartupError} />
) : clientAuthMode === "clerk" ? (
    <ClerkProvider {...clerkProviderProps}>
      <ClerkAuthProvider>
        <OnboardingProvider>
          <App />
        </OnboardingProvider>
      </ClerkAuthProvider>
    </ClerkProvider>
  ) : (
    <MockAuthProvider>
      <OnboardingProvider>
        <App />
      </OnboardingProvider>
    </MockAuthProvider>
  );

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {app}
    <Analytics />
  </React.StrictMode>
);

function StartupError({ message }: { message: string }) {
  return (
    <div className="EdgeTrace-contours min-h-screen text-ink EdgeTrace-public-framed">
      <main className="EdgeTrace-shell py-10">
        <section className="EdgeTrace-command-card p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky">EdgeTrace unavailable</p>
          <h1 className="mt-4 text-2xl font-semibold text-ink">The app is temporarily unavailable.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{message}</p>
        </section>
      </main>
    </div>
  );
}

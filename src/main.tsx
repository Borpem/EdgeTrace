import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { Analytics } from "@vercel/analytics/react";
import { App } from "./App";
import {
  ClerkAuthProvider,
  MockAuthProvider,
  clerkProviderProps,
  clientAuthMode
} from "./context/AuthContext";
import { OnboardingProvider } from "./context/OnboardingContext";
import "./styles.css";

const app =
  clientAuthMode === "clerk" ? (
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

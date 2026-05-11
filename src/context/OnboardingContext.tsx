import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import {
  defaultOnboardingState,
  mergeOnboardingState,
  onboardingStorageKey,
  type OnboardingState,
  type OnboardingStepId
} from "../lib/onboarding";

type OnboardingContextValue = {
  state: OnboardingState;
  start: () => void;
  markStepCompleted: (step: OnboardingStepId) => void;
  markStepsCompleted: (steps: OnboardingStepId[]) => void;
  dismiss: () => void;
  hidePermanently: () => void;
  restart: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<OnboardingState>(defaultOnboardingState);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setState(defaultOnboardingState);
      return;
    }

    try {
      const raw = window.localStorage.getItem(onboardingStorageKey(user.id));
      setState(mergeOnboardingState(raw ? (JSON.parse(raw) as Partial<OnboardingState>) : null));
    } catch {
      setState(defaultOnboardingState);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    window.localStorage.setItem(onboardingStorageKey(user.id), JSON.stringify(state));
  }, [isAuthenticated, state, user?.id]);

  const value = useMemo<OnboardingContextValue>(() => {
    const update = (next: (current: OnboardingState) => OnboardingState) => {
      setState((current) => mergeOnboardingState(next(current)));
    };

    return {
      state,
      start: () => {
        update((current) => ({ ...current, hasSeenOnboarding: true, dismissed: false, doNotShowAgain: false }));
      },
      markStepCompleted: (step) => {
        update((current) => ({
          ...current,
          hasSeenOnboarding: true,
          completedSteps: Array.from(new Set([...current.completedSteps, step]))
        }));
      },
      markStepsCompleted: (steps) => {
        update((current) => ({
          ...current,
          hasSeenOnboarding: true,
          completedSteps: Array.from(new Set([...current.completedSteps, ...steps]))
        }));
      },
      dismiss: () => {
        update((current) => ({ ...current, hasSeenOnboarding: true, dismissed: true }));
      },
      hidePermanently: () => {
        update((current) => ({ ...current, hasSeenOnboarding: true, dismissed: true, doNotShowAgain: true }));
      },
      restart: () => {
        setState({
          ...defaultOnboardingState
        });
      }
    };
  }, [state]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used within OnboardingProvider");
  return context;
}

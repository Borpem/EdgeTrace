export type OnboardingStepId =
  | "create_report"
  | "upload_trade_history"
  | "run_diagnostics"
  | "review_diagnosis"
  | "inspect_leaks"
  | "compare_reports"
  | "create_strategy_set";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  message: string;
  ctaLabel: string;
  targetPage: "upload" | "dashboard" | "reports" | "compare" | "collections";
};

export type OnboardingState = {
  hasSeenOnboarding: boolean;
  completedSteps: OnboardingStepId[];
  dismissed: boolean;
  doNotShowAgain: boolean;
};

export const defaultOnboardingState: OnboardingState = {
  hasSeenOnboarding: false,
  completedSteps: [],
  dismissed: false,
  doNotShowAgain: false
};

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "create_report",
    title: "Welcome to EdgeTrace",
    message: "EdgeTrace analyzes completed trade history to identify what changed, what leaked, and where to inspect next.",
    ctaLabel: "Analyze Trades",
    targetPage: "upload"
  },
  {
    id: "upload_trade_history",
    title: "Upload trade history",
    message: "Start with a broker export or generic CSV. EdgeTrace detects the source and reviews field mappings before analysis.",
    ctaLabel: "Open Analyze Trades",
    targetPage: "upload"
  },
  {
    id: "run_diagnostics",
    title: "Run diagnostics",
    message: "A report is a diagnostic analysis generated from one uploaded trade file.",
    ctaLabel: "Create a Report",
    targetPage: "upload"
  },
  {
    id: "review_diagnosis",
    title: "Review diagnosis",
    message: "Strategy health, primary diagnosis, cost drag, and R capture show whether costs, expectancy, or unstable segments are affecting performance.",
    ctaLabel: "Open Dashboard",
    targetPage: "dashboard"
  },
  {
    id: "inspect_leaks",
    title: "Inspect leaks",
    message: "Use drilldowns and next-step recommendations to inspect the symbols, setups, and time windows driving performance.",
    ctaLabel: "View Reports",
    targetPage: "reports"
  },
  {
    id: "compare_reports",
    title: "Compare reports",
    message: "Comparisons show what improved, degraded, or introduced new leakage between two strategy reports.",
    ctaLabel: "Open Compare",
    targetPage: "compare"
  },
  {
    id: "create_strategy_set",
    title: "Create a strategy set",
    message: "Strategy sets group related reports so you can track iterations and review changes over time.",
    ctaLabel: "Open Strategy Sets",
    targetPage: "collections"
  }
];

export function onboardingStorageKey(userId: string) {
  return `edgetrace.onboarding.${userId}`;
}

export function mergeOnboardingState(input: Partial<OnboardingState> | null | undefined): OnboardingState {
  return {
    ...defaultOnboardingState,
    ...(input ?? {}),
    completedSteps: Array.from(new Set(input?.completedSteps ?? []))
  };
}

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { trackEvent } from "../../lib/analytics";
import { getActivationSummary, listCollections, listReports } from "../../lib/api";
import { onboardingSteps, type OnboardingStepId } from "../../lib/onboarding";
import type { ActivationSummary } from "../../types";

type WorkflowGuideProps = {
  currentPage: string;
  onNavigate: (target: "upload" | "dashboard" | "reports" | "compare" | "collections") => void;
};

export function WorkflowGuide({ currentPage, onNavigate }: WorkflowGuideProps) {
  const { isAuthenticated } = useAuth();
  const { state, markStepsCompleted, dismiss, hidePermanently } = useOnboarding();
  const [reportCount, setReportCount] = useState(0);
  const [collectionCount, setCollectionCount] = useState(0);
  const [activation, setActivation] = useState<ActivationSummary | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [trackedStarted, setTrackedStarted] = useState(false);
  const [trackedCompleted, setTrackedCompleted] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;

    void Promise.all([listReports(), listCollections(), getActivationSummary()])
      .then(([reportResponse, collectionResponse, activationSummary]) => {
        if (!active) return;
        setReportCount(reportResponse.reports.length);
        setCollectionCount(collectionResponse.collections.length);
        setActivation(activationSummary);
      })
      .catch(() => {
        if (!active) return;
        setReportCount(0);
        setCollectionCount(0);
        setActivation(null);
      });

    return () => {
      active = false;
    };
  }, [currentPage, isAuthenticated]);

  const inferredCompletedSteps = useMemo(() => {
    const steps: OnboardingStepId[] = [];
    if (reportCount > 0 || activation?.hasCreatedReport) {
      steps.push("create_report", "upload_trade_history", "run_diagnostics");
    }
    if (activation?.hasOpenedDashboard || ["dashboard", "drilldown", "reconstructionAudit"].includes(currentPage)) {
      steps.push("review_diagnosis");
    }
    if (activation?.hasClickedDrilldown || currentPage === "drilldown" || currentPage === "compareDrilldown") {
      steps.push("inspect_leaks");
    }
    if (activation?.hasCreatedComparison || ["compare", "compareDrilldown"].includes(currentPage)) {
      steps.push("compare_reports");
    }
    if (activation?.hasCreatedCollection || collectionCount > 0 || currentPage.startsWith("collection")) {
      steps.push("create_strategy_set");
    }
    return Array.from(new Set(steps));
  }, [activation, collectionCount, currentPage, reportCount]);

  useEffect(() => {
    const missing = inferredCompletedSteps.filter((step) => !state.completedSteps.includes(step));
    if (missing.length > 0) markStepsCompleted(missing);
  }, [inferredCompletedSteps, markStepsCompleted, state.completedSteps]);

  const completed = new Set([...state.completedSteps, ...inferredCompletedSteps]);
  const activeStep = onboardingSteps.find((step) => !completed.has(step.id)) ?? onboardingSteps[onboardingSteps.length - 1];
  const completedCount = onboardingSteps.filter((step) => completed.has(step.id)).length;
  const isComplete = completedCount === onboardingSteps.length;
  const shouldShowGuide = !state.dismissed && !isComplete && !isCollapsed;

  useEffect(() => {
    if (!isAuthenticated || state.doNotShowAgain || !shouldShowGuide || trackedStarted) return;
    trackEvent("onboarding_started");
    setTrackedStarted(true);
  }, [isAuthenticated, shouldShowGuide, state.doNotShowAgain, trackedStarted]);

  useEffect(() => {
    if (!isAuthenticated || !isComplete || trackedCompleted) return;
    trackEvent("onboarding_completed");
    setTrackedCompleted(true);
  }, [isAuthenticated, isComplete, trackedCompleted]);

  const handleDismiss = () => {
    trackEvent("onboarding_skipped");
    dismiss();
  };

  const handleHidePermanently = () => {
    trackEvent("onboarding_do_not_show_again");
    hidePermanently();
  };

  if (!isAuthenticated || state.doNotShowAgain) return null;

  if (!shouldShowGuide && isComplete) return null;

  if (!shouldShowGuide) {
    return (
      <aside className="fixed bottom-5 left-5 z-50 w-[min(22rem,calc(100vw-2.5rem))] border border-white/[0.12] bg-graphite/95 p-4 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Your workflow</p>
            <p className="mt-2 text-sm text-muted">
              {completedCount} of {onboardingSteps.length} steps complete.
            </p>
          </div>
          <button className="text-xs font-semibold text-ink hover:text-cyan" onClick={() => setIsCollapsed(false)}>
            Open guide
          </button>
        </div>
        <Checklist completed={completed} compact />
      </aside>
    );
  }

  return (
    <aside className="fixed right-5 top-24 z-50 w-[min(26rem,calc(100vw-2.5rem))] border border-cyan/35 bg-graphite/95 p-5 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.1] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Guided workflow</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">{activeStep.title}</h2>
        </div>
        <button className="text-xs font-semibold text-muted hover:text-ink" onClick={() => setIsCollapsed(true)}>
          Collapse
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted">{activeStep.message}</p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button className="EdgeTrace-compact-primary inline-flex items-center justify-center gap-2" onClick={() => onNavigate(activeStep.targetPage)}>
          {activeStep.ctaLabel}
          <ChevronRight size={15} />
        </button>
        <button className="EdgeTrace-compact-secondary" onClick={handleDismiss}>
          Skip for now
        </button>
      </div>

      <Checklist completed={completed} />

      <button className="mt-4 text-xs font-semibold text-muted hover:text-ink" onClick={handleHidePermanently}>
        Do not show this again
      </button>
    </aside>
  );
}

function Checklist({ completed, compact = false }: { completed: Set<OnboardingStepId>; compact?: boolean }) {
  const visibleSteps = compact
    ? onboardingSteps.filter((step) =>
        ["create_report", "review_diagnosis", "compare_reports", "create_strategy_set"].includes(step.id)
      )
    : onboardingSteps;

  return (
    <div className={compact ? "mt-3 grid gap-2" : "mt-5 grid gap-2 border-t border-white/[0.1] pt-4"}>
      {visibleSteps.map((step) => {
        const done = completed.has(step.id);
        return (
          <div key={step.id} className="grid grid-cols-[1.25rem_1fr] items-start gap-3 text-sm">
            <span
              className={`mt-0.5 grid h-4 w-4 place-items-center border ${
                done ? "border-cyan bg-cyan text-black" : "border-white/[0.18] text-muted"
              }`}
            >
              {done ? <Check size={11} strokeWidth={3} /> : null}
            </span>
            <span className={done ? "text-ink" : "text-muted"}>{step.title}</span>
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { trackEvent } from "../../lib/analytics";
import { getActivationSummary } from "../../lib/api";
import type { ActivationSummary } from "../../types";

type CommandPathContext = "dashboard_empty" | "reports_empty" | "upload" | "report" | "compare" | "collections";
type CommandStepId = "create_report" | "review_diagnosis" | "inspect_leak" | "compare_iterations" | "build_strategy_set";

type CommandPathProps = {
  context: CommandPathContext;
  className?: string;
  onAnalyze?: () => void;
  onDashboard?: () => void;
  onInspectLeak?: () => void;
  onCompare?: () => void;
  onCreateStrategySet?: () => void;
  onLearn?: () => void;
};

const commandSteps: Array<{
  id: CommandStepId;
  number: string;
  title: string;
  description: string;
  cta: string;
}> = [
  {
    id: "create_report",
    number: "01",
    title: "Create Report",
    description: "Upload completed trades and generate your first diagnostic report.",
    cta: "Import Trades"
  },
  {
    id: "review_diagnosis",
    number: "02",
    title: "Review Diagnosis",
    description: "See Edge Health, cost drag, expectancy, R capture, and the primary leak.",
    cta: "Open Dashboard"
  },
  {
    id: "inspect_leak",
    number: "03",
    title: "Inspect Leak",
    description: "Use drilldowns to find the symbols, strategies, or time windows causing the issue.",
    cta: "Inspect Weakest Segment"
  },
  {
    id: "compare_iterations",
    number: "04",
    title: "Compare Iterations",
    description: "Compare reports to understand what improved, degraded, or introduced new leakage.",
    cta: "Compare Reports"
  },
  {
    id: "build_strategy_set",
    number: "05",
    title: "Build Strategy Set",
    description: "Group related reports so you can track strategy changes over time.",
    cta: "Create Strategy Set"
  }
];

export function CommandPath({
  context,
  className = "",
  onAnalyze,
  onDashboard,
  onInspectLeak,
  onCompare,
  onCreateStrategySet,
  onLearn
}: CommandPathProps) {
  const { isAuthenticated } = useAuth();
  const { state } = useOnboarding();
  const [activation, setActivation] = useState<ActivationSummary | null>(null);
  const [hasTrackedView, setHasTrackedView] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || state.doNotShowAgain) return;
    let active = true;
    void getActivationSummary()
      .then((summary) => {
        if (active) setActivation(summary);
      })
      .catch(() => {
        if (active) setActivation(null);
      });
    return () => {
      active = false;
    };
  }, [context, isAuthenticated, state.doNotShowAgain]);

  const completed = useMemo(() => buildCompletedSet(activation, context), [activation, context]);
  const activeStepId = useMemo(() => pickActiveStep(context, activation, completed), [activation, completed, context]);
  const completeCount = commandSteps.filter((step) => completed.has(step.id)).length;
  const isComplete = completeCount === commandSteps.length;

  useEffect(() => {
    if (!isAuthenticated || state.doNotShowAgain || isComplete || hasTrackedView) return;
    trackEvent("command_path_viewed", { context });
    setHasTrackedView(true);
  }, [context, hasTrackedView, isAuthenticated, isComplete, state.doNotShowAgain]);

  if (!isAuthenticated || state.doNotShowAgain || isComplete) return null;

  const activeStep = commandSteps.find((step) => step.id === activeStepId) ?? commandSteps[0];

  const handleStepClick = (stepId: CommandStepId) => {
    trackEvent("command_path_step_clicked", { stepId, context });
    if (stepId === "create_report") onAnalyze?.();
    if (stepId === "review_diagnosis") onDashboard?.();
    if (stepId === "inspect_leak") onInspectLeak?.();
    if (stepId === "compare_iterations") onCompare?.();
    if (stepId === "build_strategy_set") onCreateStrategySet?.();
  };

  const handleLearn = () => {
    trackEvent("feature_education_opened", { source: "command_path" });
    if (onLearn) {
      onLearn();
      return;
    }
    window.history.pushState(null, "", "/app/how-it-works");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <section className={`border border-cyan/25 bg-black/40 shadow-[0_0_42px_-34px_rgba(88,214,255,0.9)] ${className}`}>
      <div className="border-b border-white/[0.09] p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Guided Command Path</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-ink">
              Follow the path from trade history to strategy insight.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              Current command: <span className="font-semibold text-ink">{activeStep.title}</span>. {activeStep.description}
            </p>
          </div>
          <div className="border border-white/[0.1] bg-white/[0.035] px-4 py-3 text-sm text-muted">
            <span className="font-semibold text-cyan">{completeCount}</span> / {commandSteps.length} complete
          </div>
          <button className="EdgeTrace-compact-secondary" onClick={handleLearn}>
            View Feature Guide
          </button>
        </div>
      </div>

      <div className="grid divide-y divide-white/[0.08] lg:grid-cols-5 lg:divide-x lg:divide-y-0">
        {commandSteps.map((step, index) => {
          const status = step.id === activeStepId ? "active" : completed.has(step.id) ? "complete" : isLocked(index, activeStepId, completed) ? "locked" : "open";
          return (
            <article
              key={step.id}
              className={`relative min-h-56 p-5 transition ${
                status === "active"
                  ? "bg-cyan/[0.055] ring-1 ring-inset ring-cyan/45"
                  : status === "complete"
                    ? "bg-white/[0.035]"
                    : "bg-transparent"
              }`}
            >
              {status === "active" && (
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(88,214,255,0.17),transparent_12rem)]" />
              )}
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <span className={status === "active" ? "text-cyan" : "text-muted"}>{step.number}</span>
                  <StatusMark status={status} />
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.04em] text-ink">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{step.description}</p>
                <div className="mt-auto pt-6">
                  {status === "active" ? (
                    <button className="EdgeTrace-command-button w-full" onClick={() => handleStepClick(step.id)}>
                      {step.cta}
                    </button>
                  ) : (
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                      {status === "complete" ? "Complete" : status === "locked" ? "Locked" : "Available"}
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildCompletedSet(activation: ActivationSummary | null, context: CommandPathContext) {
  const completed = new Set<CommandStepId>();
  if (activation?.hasCreatedReport) completed.add("create_report");
  if (activation?.hasOpenedDashboard || context === "report") completed.add("review_diagnosis");
  if (activation?.hasClickedDrilldown) completed.add("inspect_leak");
  if (activation?.hasCreatedComparison || activation?.hasOpenedCompare) completed.add("compare_iterations");
  if (activation?.hasCreatedCollection) completed.add("build_strategy_set");
  return completed;
}

function pickActiveStep(
  context: CommandPathContext,
  activation: ActivationSummary | null,
  completed: Set<CommandStepId>
): CommandStepId {
  if (context === "dashboard_empty" || context === "reports_empty" || context === "upload") return "create_report";
  if (context === "compare" && !activation?.hasCreatedComparison) return "compare_iterations";
  if (context === "collections" && !completed.has("build_strategy_set")) return "build_strategy_set";
  if (context === "report") {
    if (!activation?.hasClickedDrilldown) return "inspect_leak";
    if (!activation?.hasCreatedComparison) return "compare_iterations";
    if (!activation?.hasCreatedCollection) return "build_strategy_set";
  }
  return commandSteps.find((step) => !completed.has(step.id))?.id ?? "build_strategy_set";
}

function isLocked(index: number, activeStepId: CommandStepId, completed: Set<CommandStepId>) {
  const activeIndex = commandSteps.findIndex((step) => step.id === activeStepId);
  if (index <= activeIndex) return false;
  return commandSteps.slice(0, index).some((step) => !completed.has(step.id) && step.id !== activeStepId);
}

function StatusMark({ status }: { status: "active" | "complete" | "locked" | "open" }) {
  if (status === "complete") {
    return (
      <span className="grid h-7 w-7 place-items-center border border-cyan bg-cyan text-black">
        <Check size={15} strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="grid h-7 w-7 place-items-center border border-cyan/70 text-cyan">
        <Sparkles size={14} />
      </span>
    );
  }
  if (status === "locked") {
    return (
      <span className="grid h-7 w-7 place-items-center border border-white/[0.12] text-muted">
        <Lock size={13} />
      </span>
    );
  }
  return <span className="h-7 w-7 border border-white/[0.12]" />;
}

import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useOnboarding } from "../../context/OnboardingContext";
import { trackEvent } from "../../lib/analytics";

type OnboardingOverlayProps = {
  onStart: () => void;
  onLearn?: () => void;
};

export function OnboardingOverlay({ onStart, onLearn }: OnboardingOverlayProps) {
  const { state, start, dismiss, hidePermanently } = useOnboarding();
  const overlayDisabled = import.meta.env.VITE_DISABLE_ONBOARDING_OVERLAY === "1";

  useEffect(() => {
    if (!overlayDisabled && !state.hasSeenOnboarding && !state.doNotShowAgain) {
      trackEvent("onboarding_overlay_started");
    }
  }, [overlayDisabled, state.doNotShowAgain, state.hasSeenOnboarding]);

  if (overlayDisabled || state.hasSeenOnboarding || state.doNotShowAgain) return null;

  const handleStart = () => {
    start();
    onStart();
  };

  const handleSkip = () => {
    trackEvent("onboarding_overlay_skipped");
    dismiss();
  };

  const handleLearn = () => {
    dismiss();
    onLearn?.();
  };

  const handleHide = () => {
    trackEvent("onboarding_overlay_do_not_show_again");
    hidePermanently();
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/78 px-5 backdrop-blur-md">
      <section className="w-[min(46rem,100%)] border border-cyan/35 bg-[#050505] shadow-[0_0_80px_-46px_rgba(88,214,255,0.95)]">
        <div className="border-b border-white/[0.1] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan">First Run Guide</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.055em] text-ink md:text-5xl">
            Follow the path from trade history to strategy insight.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
            EdgeTrace works best when you create a report, review the diagnosis, inspect the leak, compare iterations,
            and group related reports into a strategy set.
          </p>
        </div>

        <div className="grid gap-0 divide-y divide-white/[0.08] p-6 text-sm md:grid-cols-5 md:divide-x md:divide-y-0 md:p-0">
          {["Create report", "Review diagnosis", "Inspect leak", "Compare", "Strategy set"].map((label, index) => (
            <div key={label} className="p-4">
              <p className="text-xs font-semibold text-cyan">0{index + 1}</p>
              <p className="mt-2 font-semibold text-ink">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/[0.1] p-6 sm:flex-row sm:items-center">
          <button className="EdgeTrace-command-button inline-flex items-center justify-center gap-2" onClick={handleStart}>
            Start Guided Workflow <ArrowRight size={16} />
          </button>
          {onLearn && (
            <button className="EdgeTrace-compact-secondary" onClick={handleLearn}>
              Learn How EdgeTrace Works
            </button>
          )}
          <button className="EdgeTrace-compact-secondary" onClick={handleSkip}>
            Skip for now
          </button>
          <button className="text-sm font-semibold text-muted hover:text-ink sm:ml-auto" onClick={handleHide}>
            Don't show again
          </button>
        </div>
      </section>
    </div>
  );
}

import type { CSSProperties } from "react";

type WorkflowDiagramProps = {
  steps?: string[];
  activeIndex?: number;
  compact?: boolean;
  className?: string;
};

const defaultSteps = ["Import", "Diagnose", "Inspect", "Compare", "Monitor"];

export function WorkflowDiagram({
  steps = defaultSteps,
  activeIndex,
  compact = false,
  className = ""
}: WorkflowDiagramProps) {
  return (
    <div className={`border border-white/[0.1] bg-white/[0.025] ${compact ? "p-3" : "p-5"} ${className}`}>
      <div className="grid gap-2 md:grid-cols-[repeat(var(--step-count),minmax(0,1fr))]" style={{ "--step-count": steps.length } as CSSProperties}>
        {steps.map((step, index) => {
          const active = activeIndex === index;
          const completed = activeIndex !== undefined && index < activeIndex;
          return (
            <div key={step} className="relative">
              <div
                className={`border p-3 ${
                  active
                    ? "border-cyan/60 bg-cyan/[0.08] shadow-[0_0_36px_-30px_rgba(88,214,255,0.9)]"
                    : completed
                      ? "border-cyan/25 bg-cyan/[0.035]"
                      : "border-white/[0.1] bg-black/20"
                }`}
              >
                <p className={active ? "text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan" : "text-[10px] font-semibold uppercase tracking-[0.2em] text-muted"}>
                  0{index + 1}
                </p>
                <p className="mt-3 text-sm font-semibold text-ink">{step}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="pointer-events-none absolute left-full top-1/2 z-10 hidden h-px w-2 -translate-y-1/2 bg-cyan/40 md:block" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

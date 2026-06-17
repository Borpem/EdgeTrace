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
    <div className={`border border-[#223746] bg-[#071017] ${compact ? "p-3" : "p-5"} ${className}`}>
      <div className="grid gap-2 md:grid-cols-[repeat(var(--step-count),minmax(0,1fr))]" style={{ "--step-count": steps.length } as CSSProperties}>
        {steps.map((step, index) => {
          const active = activeIndex === index;
          const completed = activeIndex !== undefined && index < activeIndex;
          return (
            <div key={step} className="relative">
              <div
                className={`border p-3 ${
                  active
                    ? "border-[#4ec4ec]/55 bg-[#0a2b3a]/45 shadow-[0_0_36px_-34px_rgba(78,196,236,0.7)]"
                    : completed
                      ? "border-[#284657] bg-[#0b151d]"
                      : "border-[#1f3441] bg-[#060d13]"
                }`}
              >
                <p className={active ? "text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4ec4ec]" : "text-[10px] font-semibold uppercase tracking-[0.2em] text-muted"}>
                  0{index + 1}
                </p>
                <p className="mt-3 text-sm font-semibold text-ink">{step}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="pointer-events-none absolute left-full top-1/2 z-10 hidden h-px w-2 -translate-y-1/2 bg-[#4ec4ec]/32 md:block" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

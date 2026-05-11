export function PlanProgressionVisual({ className = "" }: { className?: string }) {
  const plans = [
    ["Free", "First diagnostic", "1 full report"],
    ["Pro", "Full workflow", "Reports, drilldowns, compare"],
    ["Advanced", "Monitoring intelligence", "Coming soon"]
  ];

  return (
    <div className={`relative overflow-hidden border-y border-white/[0.1] bg-white/[0.018] p-5 md:p-7 ${className}`}>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map(([name, headline, detail], index) => (
          <div
            key={name}
            className={`relative min-h-44 border p-5 ${
              name === "Pro" ? "border-cyan/45 bg-cyan/[0.055]" : "border-white/[0.1] bg-black/28"
            }`}
          >
            {index < plans.length - 1 && (
              <div className="absolute -right-4 top-1/2 hidden h-px w-8 bg-cyan/50 md:block" />
            )}
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">0{index + 1}</p>
            <h3 className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-ink">{name}</h3>
            <p className={name === "Pro" ? "mt-3 text-lg font-semibold text-cyan" : "mt-3 text-lg font-semibold text-ink"}>{headline}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

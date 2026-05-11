export function StrategyEvolutionVisual({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const versions = [
    ["V1", "Baseline", "64", "+$0.08", "38%"],
    ["V2", "Lower Costs", "76", "+$0.24", "24%"],
    ["V3", "Higher Selectivity", "82", "+$0.31", "22%"]
  ];

  return (
    <div
      className={`relative overflow-hidden border-y border-white/[0.1] bg-[radial-gradient(circle_at_80%_22%,rgba(88,214,255,0.13),transparent_24rem),rgba(255,255,255,0.018)] ${
        compact ? "p-5" : "p-6 md:p-9"
      } ${className}`}
    >
      <div className="grid gap-8 xl:grid-cols-[0.72fr_1.28fr] xl:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy Evolution</p>
          <h3 className="mt-3 max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.032em] text-ink md:text-5xl">
            One strategy becomes a timeline, not a pile of reports.
          </h3>
        </div>
        <div className="relative">
          <svg className="absolute inset-x-4 top-1/2 hidden h-28 -translate-y-1/2 md:block" viewBox="0 0 760 120" fill="none" aria-hidden="true">
            <path d="M20 82C154 82 190 78 292 56C412 30 470 42 558 34C642 26 690 18 740 12" stroke="#58D6FF" strokeWidth="4" strokeLinecap="round" />
            <path d="M20 96C174 98 220 90 292 80C410 62 476 66 558 54C650 40 692 34 740 28" stroke="white" strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div className="relative grid gap-4 md:grid-cols-3">
            {versions.map(([version, name, health, expectancy, costDrag], index) => (
              <article
                key={version}
                className={`border p-5 ${
                  index === versions.length - 1
                    ? "border-cyan/45 bg-cyan/[0.055] shadow-[0_0_46px_-38px_rgba(88,214,255,0.95)]"
                    : "border-white/[0.1] bg-black/38"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">{version}</p>
                <h4 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-ink">{name}</h4>
                <div className="mt-7 grid gap-3">
                  <Metric label="Health" value={health} tone={index === versions.length - 1 ? "text-cyan" : "text-ink"} />
                  <Metric label="Expectancy" value={expectancy} tone="text-cyan" />
                  <Metric label="Cost Drag" value={costDrag} tone={index === 0 ? "text-warning" : "text-muted"} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      <span className={`text-lg font-semibold tracking-[-0.02em] ${tone}`}>{value}</span>
    </div>
  );
}

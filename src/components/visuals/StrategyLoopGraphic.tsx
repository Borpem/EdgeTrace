export function StrategyLoopGraphic({ className = "" }: { className?: string }) {
  const nodes = ["Report", "Insight", "Change", "Compare", "Monitor"];

  return (
    <div className={`border border-white/[0.1] bg-white/[0.025] p-5 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Strategy loop</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        {nodes.map((node, index) => (
          <div key={node} className="relative border border-cyan/20 bg-cyan/[0.035] p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan">0{index + 1}</p>
            <p className="mt-2 text-sm font-semibold text-ink">{node}</p>
            {index < nodes.length - 1 && (
              <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-cyan/50 sm:block" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

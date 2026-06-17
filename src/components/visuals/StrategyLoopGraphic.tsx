export function StrategyLoopGraphic({ className = "" }: { className?: string }) {
  const nodes = ["Report", "Diagnose", "Change", "Compare", "Review"];

  return (
    <div className={`border border-[#223746] bg-[#071017] p-5 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Strategy loop</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        {nodes.map((node, index) => (
          <div key={node} className="relative border border-[#284657] bg-[#0b151d] p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4ec4ec]">0{index + 1}</p>
            <p className="mt-2 text-sm font-semibold text-ink">{node}</p>
            {index < nodes.length - 1 && (
              <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-[#4ec4ec]/36 sm:block" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

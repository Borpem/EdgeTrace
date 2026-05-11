export function MetricFlowGraphic({ className = "" }: { className?: string }) {
  const items = [
    ["Gross", "Trade outcome"],
    ["Costs", "Execution drag"],
    ["Net", "After-cost result"],
    ["Quality", "Edge readout"]
  ];

  return (
    <div className={`border border-white/[0.1] bg-white/[0.025] p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Metric flow</p>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {items.map(([title, detail], index) => (
          <div key={title} className="relative border border-white/[0.1] bg-black/24 p-3">
            <p className="text-sm font-semibold text-ink">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
            {index < items.length - 1 && (
              <span className="absolute -right-2 top-1/2 hidden h-px w-4 bg-cyan/40 md:block" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

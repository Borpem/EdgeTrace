export function PlanAccessGraphic({ className = "" }: { className?: string }) {
  const plans = [
    ["Free", "Full reporting workflow", "$0"],
    ["Pro", "Review loop + benchmarks", "$9.99"]
  ];

  return (
    <div className={`border border-[#223746] bg-[#071017] p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Access path</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {plans.map(([name, detail, badge], index) => (
          <div
            key={name}
            className={`border p-4 ${name === "Pro" ? "border-[#4ec4ec]/45 bg-[#0a2b3a]/38" : "border-[#1f3441] bg-[#060d13]"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-ink">{name}</p>
                <p className="mt-1 text-xs text-muted">{detail}</p>
              </div>
              <span className={name === "Pro" ? "text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4ec4ec]" : "text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"}>
                {badge}
              </span>
            </div>
            <div className="mt-4 h-1 bg-[#1f3441]">
              <div className="h-1 bg-[#4ec4ec]" style={{ width: `${(index + 1) * 50}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

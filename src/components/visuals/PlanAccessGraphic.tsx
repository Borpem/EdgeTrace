export function PlanAccessGraphic({ className = "" }: { className?: string }) {
  const plans = [
    ["Free", "First diagnostic", "Preview"],
    ["Pro", "Full workflow", "Core"],
    ["Advanced", "Monitoring", "Soon"]
  ];

  return (
    <div className={`border border-white/[0.1] bg-white/[0.025] p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Access path</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {plans.map(([name, detail, badge], index) => (
          <div
            key={name}
            className={`border p-4 ${name === "Pro" ? "border-cyan/50 bg-cyan/[0.06]" : "border-white/[0.1] bg-black/22"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-ink">{name}</p>
                <p className="mt-1 text-xs text-muted">{detail}</p>
              </div>
              <span className={name === "Pro" ? "text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan" : "text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"}>
                {badge}
              </span>
            </div>
            <div className="mt-4 h-1 bg-white/[0.08]">
              <div className="h-1 bg-cyan" style={{ width: `${(index + 1) * 33}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

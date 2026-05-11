export function DiagnosticLeakVisual({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden border-y border-white/[0.1] bg-[radial-gradient(circle_at_18%_50%,rgba(88,214,255,0.11),transparent_18rem),rgba(255,255,255,0.018)] ${
        compact ? "p-5" : "p-6 md:p-9"
      } ${className}`}
    >
      <div className="relative grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Attribution</p>
          <h3 className="mt-3 max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.032em] text-ink md:text-5xl">
            See where performance leaks before it reaches net.
          </h3>
        </div>
        <div className="relative min-h-[320px] border border-white/[0.1] bg-black/35 p-5">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 720 320" fill="none" preserveAspectRatio="none" aria-hidden="true">
            <path d="M70 86C230 86 258 86 354 86C450 86 484 48 650 48" stroke="#58D6FF" strokeWidth="3" strokeLinecap="round" />
            <path d="M70 158C232 158 266 158 354 158C454 158 504 196 650 196" stroke="#FFB84D" strokeWidth="3" strokeLinecap="round" />
            <path d="M70 232C236 232 272 232 354 232C456 232 508 260 650 260" stroke="#7861FF" strokeWidth="3" strokeLinecap="round" />
            <path d="M354 28V292" stroke="white" strokeOpacity=".1" />
          </svg>
          <div className="relative grid h-full gap-4 md:grid-cols-[0.82fr_0.18fr_0.9fr] md:items-center">
            <div className="space-y-4">
              <LeakNode label="Gross PnL" value="$6.4k" />
              <LeakNode label="Execution Costs" value="-$1.6k" tone="text-warning" />
              <LeakNode label="R Capture" value="0.74R" tone="text-cyan" />
            </div>
            <div className="hidden h-28 border-l border-cyan/35 md:block" />
            <div className="space-y-4">
              <div className="border border-warning/45 bg-warning/[0.08] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-warning">Leak Detected</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Opening Session</p>
                <p className="mt-1 text-sm text-muted">Cost concentration exposed</p>
              </div>
              <LeakNode label="Net PnL" value="$4.8k" tone="text-cyan" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeakNode({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-white/[0.1] bg-black/34 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${tone}`}>{value}</p>
    </div>
  );
}

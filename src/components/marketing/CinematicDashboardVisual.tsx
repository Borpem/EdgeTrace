type MarketingVisualProps = {
  className?: string;
  compact?: boolean;
};

export function CinematicDashboardVisual({ className = "", compact = false }: MarketingVisualProps) {
  return (
    <div
      className={`relative overflow-hidden border-y border-white/[0.1] bg-[radial-gradient(circle_at_78%_14%,rgba(88,214,255,0.13),transparent_24rem),radial-gradient(circle_at_20%_86%,rgba(120,97,255,0.12),transparent_24rem),rgba(255,255,255,0.018)] ${
        compact ? "p-5" : "p-6 md:p-10"
      } ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:88px_88px]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr] md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy Dashboard</p>
            <h3 className="mt-3 max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.032em] text-ink md:text-6xl">
              One screen for the signal beneath the result.
            </h3>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted md:justify-self-end">
            Health, diagnosis, and the next inspection path are staged before dense tables.
          </p>
        </div>

        <div className="relative mt-8 overflow-hidden border border-white/[0.12] bg-black/45 p-4 shadow-[0_52px_140px_-96px_rgba(88,214,255,0.75)] md:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_28%,rgba(88,214,255,0.12),transparent_20rem)]" />
          <div className="relative grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="border border-white/[0.1] bg-white/[0.025] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy Health</p>
              <div className="mt-7 flex items-end gap-5">
                <p className="text-7xl font-semibold leading-none tracking-[-0.055em] text-ink md:text-8xl">82</p>
                <div className="pb-2">
                  <p className="text-2xl font-semibold tracking-[-0.025em] text-cyan">Improving</p>
                  <p className="mt-1 text-sm text-muted">+9 vs prior report</p>
                </div>
              </div>
              <svg className="mt-8 h-36 w-full" viewBox="0 0 620 160" fill="none" role="img" aria-label="Sample equity curve">
                <path d="M0 128H620M0 88H620M0 48H620" stroke="white" strokeOpacity=".08" />
                <path d="M12 126L80 110L148 116L216 76L284 90L352 48L420 60L488 34L556 48L608 22" stroke="#58D6FF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 138L80 128L148 130L216 108L284 112L352 88L420 96L488 70L556 78L608 60" stroke="white" strokeOpacity=".23" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </section>

            <section className="grid gap-4">
              <div className="border border-white/[0.1] bg-white/[0.025] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">Primary Diagnosis</p>
                <h4 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-ink">Cost drag reduced</h4>
                <p className="mt-3 text-sm leading-6 text-muted">The latest iteration converted more gross edge into after-cost returns.</p>
              </div>
              <div className="border border-cyan/30 bg-cyan/[0.055] p-5 shadow-[0_0_42px_-34px_rgba(88,214,255,0.9)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Where to Look Next</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">Inspect Opening Session</p>
                <p className="mt-1 text-sm text-muted">Largest remaining cost concentration</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <MiniMetric label="PnL" value="$4.8k" tone="text-cyan" />
                <MiniMetric label="Cost Drag" value="22.6%" tone="text-warning" />
                <MiniMetric label="R Capture" value="0.74R" tone="text-cyan" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="border border-white/[0.1] bg-black/28 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tracking-[-0.035em] ${tone}`}>{value}</p>
    </div>
  );
}

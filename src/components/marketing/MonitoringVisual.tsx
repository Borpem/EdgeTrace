export function MonitoringVisual({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden border-y border-white/[0.1] bg-[radial-gradient(circle_at_74%_32%,rgba(120,97,255,0.13),transparent_22rem),rgba(255,255,255,0.018)] ${
        compact ? "p-5" : "p-6 md:p-9"
      } ${className}`}
    >
      <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
        <div className="border border-white/[0.1] bg-black/36 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy Health Timeline</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink">Monitor whether edge is strengthening or degrading.</h3>
            </div>
            <span className="border border-warning/45 bg-warning/[0.08] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-warning">
              Watchlist
            </span>
          </div>
          <svg className="mt-7 h-72 w-full" viewBox="0 0 760 300" fill="none" role="img" aria-label="Strategy monitoring timeline">
            <path d="M40 54H720M40 118H720M40 182H720M40 246H720" stroke="white" strokeOpacity=".08" />
            <path d="M58 220C124 184 164 210 226 176C286 144 320 118 390 126C460 134 496 86 560 72C622 58 672 84 704 48" stroke="#58D6FF" strokeWidth="5" strokeLinecap="round" />
            <path d="M58 232C132 216 174 222 226 204C292 182 330 162 390 168C462 176 498 142 560 132C628 120 672 132 704 112" stroke="white" strokeOpacity=".2" strokeWidth="2" strokeLinecap="round" />
            <circle cx="390" cy="126" r="7" fill="#58D6FF" />
            <circle cx="560" cy="72" r="7" fill="#FFB84D" />
            <circle cx="704" cy="48" r="7" fill="#7861FF" />
          </svg>
        </div>

        <div className="grid gap-4">
          <div className="border border-warning/40 bg-warning/[0.08] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-warning">Regression Signal</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">Cost drag rising</p>
            <p className="mt-2 text-sm leading-6 text-muted">Execution friction is increasing versus the best iteration.</p>
          </div>
          <div className="border border-cyan/30 bg-cyan/[0.05] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Edge Stability</p>
            <p className="mt-3 text-6xl font-semibold tracking-[-0.055em] text-ink">74</p>
            <p className="mt-2 text-sm text-muted">Preview score for strategy durability.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

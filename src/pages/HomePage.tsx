import { ArrowRight } from "lucide-react";

const supportedImports = [
  "Interactive Brokers",
  "Robinhood",
  "Schwab / Thinkorswim",
  "Fidelity",
  "Webull",
  "E*TRADE",
  "Generic CSV"
] as const;

export function HomePage({
  onStart,
  onFullDemo,
  onLearn,
  onCleanupDemo,
  showDemoCleanup = false,
  fullDemoLoading,
  fullDemoStatus
}: {
  onStart: () => void;
  onFullDemo: () => void;
  onLearn: () => void;
  onCleanupDemo: () => void;
  showDemoCleanup?: boolean;
  fullDemoLoading?: boolean;
  fullDemoStatus?: string;
}) {
  return (
    <main className="overflow-hidden">
      <section className="relative isolate">
        <HeroBackdrop />
        <div className="EdgeTrace-shell min-h-[calc(100vh-64px)] pb-20 pt-20 md:pb-28 md:pt-24">
          <div className="mx-auto max-w-[1320px] text-center">
            <h1 className="EdgeTrace-hero-title mx-auto mt-8 max-w-[1060px] text-[clamp(3.25rem,6.05vw,7rem)] font-semibold leading-[1.01] tracking-[-0.052em] text-ink">
              Know exactly why your
              <br className="hidden md:block" /> strategy wins or fails.
            </h1>
            <p className="mx-auto mt-10 max-w-3xl text-xl font-medium leading-8 text-muted md:text-2xl md:leading-9">
              Diagnose what changed, what leaked, and where to inspect next.
            </p>
            <div className="mt-11 flex flex-wrap items-center justify-center gap-8">
              <button
                className="inline-flex items-center gap-2 border-b border-ink pb-1 text-base font-semibold text-ink hover:border-cyan hover:text-cyan"
                onClick={onStart}
              >
                Analyze My Trades <ArrowRight size={18} />
              </button>
              <button
                className="inline-flex items-center gap-2 border-b border-white/20 pb-1 text-base font-semibold text-muted hover:border-ink hover:text-ink"
                data-testid="launch-full-demo-button"
                onClick={onFullDemo}
                disabled={fullDemoLoading}
              >
                {fullDemoLoading ? fullDemoStatus || "Building demo..." : "Explore Interactive Demo"}
              </button>
            </div>
          </div>

          <div className="mx-auto mt-20 max-w-[1400px]">
            <MarketingVisual />
          </div>
        </div>
      </section>

      <section className="EdgeTrace-shell py-20 md:py-28">
        <StrategyIntelligenceSection onLearn={onLearn} />
      </section>

      <section className="EdgeTrace-shell pb-10">
        <div className="flex flex-col items-center gap-5 border-t border-white/[0.08] pt-8">
          <img
            src="/brand/edgetrace_monochrome_white_no_tagline.png"
            alt="EdgeTrace"
            className="h-20 w-auto object-contain opacity-60"
          />
          {showDemoCleanup && (
            <button
              className="text-xs font-semibold text-muted hover:text-ink"
              onClick={onCleanupDemo}
              disabled={fullDemoLoading}
            >
              Clean up demo data
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute left-1/2 top-[-18rem] h-[42rem] w-[70rem] -translate-x-1/2 rounded-full bg-white/[0.075] blur-3xl" />
      <div className="absolute left-[-14rem] top-[10rem] h-[35rem] w-[35rem] rounded-full bg-accent/16 blur-3xl" />
      <div className="absolute right-[-16rem] top-[14rem] h-[40rem] w-[40rem] rounded-full bg-violet/16 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-[42rem] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_62%)]" />
    </div>
  );
}

function StrategyIntelligenceSection({ onLearn }: { onLearn: () => void }) {
  return (
    <div className="space-y-8 md:space-y-10">
      <section className="relative overflow-hidden border-y border-white/[0.1] py-10 md:py-14">
        <div className="pointer-events-none absolute left-0 top-0 h-px w-56 bg-gradient-to-r from-cyan via-accent to-transparent" />
        <div className="grid gap-10 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan">
              Continuous Strategy Intelligence
            </p>
            <h2 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-ink md:text-7xl">
              Know when your edge improves, weakens, or breaks.
            </h2>
          </div>
          <div>
            <p className="max-w-3xl text-lg leading-8 text-muted">
              EdgeTrace tracks strategy health across reports, comparisons, and strategy iterations so traders can
              identify degradation, cost drag, instability, and changing edge behavior before it compounds.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <button
                className="inline-flex items-center gap-2 border-b border-ink pb-1 text-base font-semibold text-ink hover:border-cyan hover:text-cyan"
                onClick={onLearn}
              >
                See how EdgeTrace works <ArrowRight size={18} />
              </button>
              <p className="max-w-md text-sm leading-6 text-muted">
                Most traders review results. EdgeTrace helps monitor edge deterioration.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StrategyPillar
          label="Diagnose"
          headline="Find the leaks affecting performance."
          body="EdgeTrace separates execution drag, expectancy quality, R capture, and unstable segments into actionable diagnostics."
        />
        <StrategyPillar
          label="Compare"
          headline="Track what changed between iterations."
          body="Compare reports to understand whether adjustments improved performance, introduced new leakage, or weakened edge stability."
        />
        <StrategyPillar
          emphasized
          label="Monitor"
          headline="Monitor strategy health over time."
          body="Strategy sets, recurring reviews, regression detection, and Edge Stability scoring help traders monitor whether a strategy is strengthening or deteriorating over time."
        />
      </section>

      <SupportedImportsSection />
    </div>
  );
}

function StrategyPillar({
  label,
  headline,
  body,
  emphasized = false
}: {
  label: string;
  headline: string;
  body: string;
  emphasized?: boolean;
}) {
  return (
    <article
      className={`min-h-72 border p-6 md:p-7 ${
        emphasized
          ? "border-cyan/30 bg-cyan/[0.04] shadow-[0_0_52px_-44px_rgba(88,214,255,0.9)]"
          : "border-white/[0.1] bg-white/[0.02]"
      }`}
    >
      <div className="flex h-full flex-col">
        <p className={emphasized ? "text-xs font-semibold uppercase tracking-[0.24em] text-cyan" : "text-xs font-semibold uppercase tracking-[0.24em] text-muted"}>
          {label}
        </p>
        <h3 className="mt-8 text-3xl font-semibold leading-[1.02] tracking-[-0.055em] text-ink md:text-4xl">
          {headline}
        </h3>
        <p className="mt-auto pt-8 text-base leading-7 text-muted">{body}</p>
      </div>
    </article>
  );
}

function SupportedImportsSection() {
  return (
    <section className="grid gap-8 border-t border-white/[0.1] pt-9 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Supported Imports</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-[1.03] tracking-[-0.055em] text-ink md:text-5xl">
          Broker files in. Structured diagnostics out.
        </h2>
      </div>
      <div>
        <p className="max-w-4xl text-base leading-7 text-muted">
          Upload completed trade data from supported brokers or generic CSV exports. EdgeTrace preserves import
          provenance so saved reports can show source, confidence, warnings, and reconstruction details after reload.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          {supportedImports.map((broker) => (
            <span
              key={broker}
              className="border border-white/[0.14] bg-white/[0.025] px-3 py-1.5 text-xs font-semibold text-ink"
            >
              {broker}
            </span>
          ))}
        </div>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-muted">
          Broker files vary by export type. EdgeTrace uses broker-aware detection, field mapping, and reconstruction where
          possible.
        </p>
      </div>
    </section>
  );
}

function MarketingVisual() {
  return (
    <div className="relative overflow-hidden border-y border-white/[0.1] py-16 md:py-24">
      <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">How EdgeTrace Works</p>
          <p className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.04] tracking-[-0.055em] text-ink md:text-6xl">
            The dashboard surfaces the leaks affecting performance first.
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Every report begins with a diagnostic summary showing whether execution costs, weak expectancy,
            deteriorating R capture, or unstable segments are driving performance.
          </p>
          <div className="mt-10 space-y-5">
            {[
              ["01", "Strategy health", "Quickly identify whether a strategy is improving, degrading, or losing edge after costs."],
              ["02", "Leak attribution", "Separate execution drag, weak expectancy, poor R capture, and unstable segments before making changes."],
              ["03", "Guided inspection", "EdgeTrace highlights the reports, symbols, setups, and time windows worth reviewing next."]
            ].map(([number, title, detail]) => (
              <div key={title} className="grid grid-cols-[3rem_1fr] gap-5 border-t border-white/[0.1] pt-5">
                <span className="text-sm font-semibold text-muted">{number}</span>
                <span>
                  <span className="block text-xl font-semibold tracking-[-0.035em] text-ink">{title}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted">{detail}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <DashboardPreview />
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative border-l border-white/[0.1] pl-0 lg:pl-10">
      <div className="relative overflow-hidden border border-white/[0.11] bg-white/[0.035] p-6 shadow-[0_40px_120px_-86px_rgba(88,214,255,0.45)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_20%,rgba(88,214,255,0.11),transparent_18rem),radial-gradient(circle_at_18%_82%,rgba(120,97,255,0.12),transparent_20rem)]" />
        <div className="relative border-b border-white/[0.1] pb-6 md:flex md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img src="/brand/edgetrace_icon_monochrome_white_transparent.png" alt="EdgeTrace" className="h-8 w-auto object-contain opacity-80" />
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Strategy dashboard</p>
            </div>
            <h3 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink md:text-4xl">
              ORB Iteration V3
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              Summary-first diagnostics from a completed-trade sample.
            </p>
          </div>
          <div className="mt-5 border border-white/[0.12] bg-black/30 px-4 py-3 md:mt-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Current report</p>
            <p className="mt-1 text-sm font-semibold text-ink">May Live Review</p>
          </div>
        </div>

        <div className="relative mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="border border-white/[0.1] bg-black/28 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy health</p>
            <div className="mt-7 flex items-end gap-5">
              <p className="text-7xl font-semibold tracking-[-0.08em] text-ink">82</p>
              <div className="pb-3">
                <p className="text-2xl font-semibold tracking-[-0.04em] text-profit">Improving</p>
                <p className="mt-1 text-sm text-muted">+9 vs prior report</p>
              </div>
            </div>
            <p className="mt-7 max-w-xl text-sm leading-6 text-muted">
              Net performance improved after cost drag fell and average R capture expanded.
            </p>
            <svg className="mt-8 h-28 w-full" viewBox="0 0 520 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 96H520M0 58H520M0 20H520" stroke="white" strokeOpacity=".08" />
              <path d="M8 96L62 82L116 88L170 54L224 68L278 36L332 46L386 24L440 38L512 12" stroke="#58D6FF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 106L62 98L116 100L170 82L224 86L278 66L332 72L386 50L440 58L512 42" stroke="white" strokeOpacity=".22" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </section>

          <section className="border border-white/[0.1] bg-black/28 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">Primary diagnosis</p>
            <h4 className="mt-7 text-3xl font-semibold tracking-[-0.055em] text-ink">Cost drag reduced</h4>
            <p className="mt-5 text-sm leading-6 text-muted">
              Costs are still visible, but the latest iteration converted more gross edge into after-cost returns.
            </p>
            <div className="mt-8 border border-white/[0.1] bg-black/24 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Next inspection</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">Inspect Opening Session</p>
              <p className="mt-1 text-sm text-muted">Largest remaining cost concentration</p>
            </div>
          </section>
        </div>

        <div className="relative mt-4 grid gap-4 md:grid-cols-3">
          <PreviewMetric label="After-cost PnL" value="$4.8k" detail="Expectancy +$42/trade" tone="text-profit" />
          <PreviewMetric label="Cost drag" value="22.6%" detail="Down 14 pts vs V2" tone="text-warning" />
          <PreviewMetric label="R capture" value="0.74R" detail="Win rate 57.8% · PF 1.48" tone="text-cyan" />
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="border border-white/[0.1] bg-black/24 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className={`mt-6 text-4xl font-semibold tracking-[-0.06em] ${tone}`}>{value}</p>
      <p className="mt-4 text-sm text-muted">{detail}</p>
    </div>
  );
}

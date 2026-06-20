import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  FileText,
  GitCompare,
  Lock,
  Search,
  Send,
  Shield,
  Target,
  TrendingUp,
  Upload
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const capabilityItems: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Search, title: "Diagnose the leak", body: "Find the cost, segment, or risk issue dragging the report." },
  { icon: TrendingUp, title: "Track each upload", body: "See whether the next report improved or slipped." },
  { icon: Activity, title: "Review the process", body: "Use Pro to check in twice a week with clear targets." },
  { icon: Target, title: "Compare to context", body: "Benchmark percentiles show where the report stands." }
];

const workflowSteps: Array<{ icon: LucideIcon; title: string; body: string; visual: "upload" | "report" | "bars" | "compare" | "monitor" }> = [
  { icon: Upload, title: "Import Trades", body: "Upload broker exports or a generic CSV.", visual: "upload" },
  { icon: CheckCircle2, title: "Diagnostic Report", body: "See expectancy, cost drag, R capture, and health.", visual: "report" },
  { icon: BarChart3, title: "Drilldowns", body: "Break performance down by symbol, strategy, and time.", visual: "bars" },
  { icon: GitCompare, title: "Compare", body: "Measure whether an iteration improved or introduced leakage.", visual: "compare" },
  { icon: Activity, title: "Strategy Monitoring", body: "Track whether edge is strengthening or deteriorating.", visual: "monitor" }
];

const brokerPills = ["Interactive Brokers", "Robinhood", "Thinkorswim", "Fidelity", "Webull", "E*TRADE", "Generic CSV"] as const;

const trustItems: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Shield, title: "Aggregate intelligence", body: "Trade history can power sharper diagnostics and benchmark insights." },
  { icon: Lock, title: "Secure access", body: "Encrypted transport and account-scoped access controls." },
  { icon: BarChart3, title: "Transparent analysis", body: "Key report inputs and diagnostic logic are visible in the workflow." },
  { icon: Send, title: "Free core, paid loop", body: "Use the full workflow free. Upgrade when you want recurring review pressure." }
];

export function HomePage({
  onStart
}: {
  onStart: () => void;
  onLearn: () => void;
}) {
  return (
    <main className="relative isolate overflow-hidden bg-graphite">
      <HomeBackdrop />

      <section className="EdgeTrace-shell relative pb-12 pt-12 md:pb-16 md:pt-16 lg:pb-20 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:gap-10 xl:gap-12">
          <div className="max-w-[760px]">
            <h1 className="overflow-visible text-[clamp(3.2rem,5.7vw,6rem)] font-semibold leading-[1.02] tracking-[-0.048em] text-ink md:tracking-[-0.052em]">
              <span className="block">Know exactly why your </span>
              <span className="block">
                strategy{" "}
                <span className="inline-block overflow-visible bg-gradient-to-r from-cyan to-accent bg-clip-text pr-2 text-transparent">wins</span>{" "}
                or{" "}
                <span className="inline-block overflow-visible bg-gradient-to-r from-violet to-fuchsia-400 bg-clip-text pr-1 text-transparent">fails.</span>
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300 md:text-xl md:leading-9">
              EdgeTrace turns completed trade history into clear diagnostics. Free gives you the full reporting workflow. Pro adds the recurring review loop that keeps you coming back.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <button
                className="EdgeTrace-primary-button min-h-12 px-6"
                onClick={onStart}
              >
                Import My Trades <ArrowRight size={17} />
              </button>
            </div>
          </div>

          <DashboardMockup />
        </div>

        <div className="mt-12 grid gap-5 border border-white/[0.07] bg-white/[0.022] p-5 shadow-[0_24px_90px_-74px_rgba(88,214,255,0.45)] sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:gap-6 lg:p-6">
          {capabilityItems.map(({ icon: Icon, title, body }) => (
            <article key={title} className="grid grid-cols-[2rem_1fr] gap-4">
              <Icon className="mt-1 text-cyan" size={25} strokeWidth={1.7} />
              <div>
                <h2 className="text-sm font-semibold text-ink">{title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <WorkflowSection />
      <LeakDiagnosticsSection />
      <ImportCompatibilitySection />
      <TrustBar />

      <section className="EdgeTrace-shell pb-10" />
    </main>
  );
}

function HomeBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(78,196,236,0.08),transparent_28rem),radial-gradient(circle_at_82%_10%,rgba(232,190,76,0.045),transparent_31rem),linear-gradient(180deg,#020609_0%,#050a0e_48%,#020609_100%)]" />
      <div className="absolute inset-x-0 top-0 h-[46rem] bg-[linear-gradient(90deg,rgba(78,196,236,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(78,196,236,0.018)_1px,transparent_1px)] bg-[size:96px_96px] opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
      <div className="absolute left-1/2 top-[35rem] h-px w-[calc(100%-5rem)] max-w-[1420px] -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan/10 to-transparent" />
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[1080px] lg:mx-0 lg:w-[108%] xl:w-[112%]">
      <div className="absolute -inset-8 bg-[radial-gradient(circle_at_68%_32%,rgba(78,196,236,0.26),transparent_25rem),radial-gradient(circle_at_28%_82%,rgba(232,190,76,0.12),transparent_22rem)] blur-2xl" />
      <img
        src="/marketing/edgetrace-hero-dashboard-preview-text-adjusted.svg"
        alt="EdgeTrace strategy signal board showing edge health, diagnosis, review targets, and benchmark metrics."
        className="relative block w-full select-none drop-shadow-[0_34px_95px_rgba(0,0,0,0.72)]"
        draggable={false}
      />
    </div>
  );
}

function WorkflowSection() {
  return (
    <section className="EdgeTrace-shell py-14 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-4xl font-semibold tracking-[-0.042em] text-ink md:text-5xl">From trades to clarity.</h2>
        <p className="mt-5 text-lg leading-8 text-muted">A complete workflow for understanding what changed, what leaked, and what deserves attention.</p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-start">
        {workflowSteps.map((step, index) => (
          <WorkflowStep key={step.title} step={step} index={index} isLast={index === workflowSteps.length - 1} />
        ))}
      </div>
    </section>
  );
}

function WorkflowStep({
  step,
  index,
  isLast
}: {
  step: (typeof workflowSteps)[number];
  index: number;
  isLast: boolean;
}) {
  const Icon = step.icon;
  return (
    <>
      <article className="text-center lg:text-left">
        <div className="mx-auto flex h-28 w-32 items-center justify-center overflow-hidden border border-[#284657] bg-[#071017] shadow-[0_24px_80px_-58px_rgba(78,196,236,0.78)] lg:mx-0">
          <StepVisual visual={step.visual} Icon={Icon} />
        </div>
        <h3 className="mt-6 text-xl font-semibold tracking-[-0.025em] text-ink">
          {index + 1}. {step.title}
        </h3>
        <p className="mx-auto mt-3 max-w-[14.5rem] text-sm leading-6 text-muted lg:mx-0">{step.body}</p>
      </article>
      {!isLast && <div className="hidden pt-12 text-2xl text-white/16 lg:block">&gt;</div>}
    </>
  );
}

function StepVisual({ visual, Icon }: { visual: (typeof workflowSteps)[number]["visual"]; Icon: LucideIcon }) {
  if (visual === "upload") {
    return (
      <div className="relative grid h-20 w-20 place-items-center border border-cyan/35 bg-[#061019]">
        <div className="absolute inset-2 border border-cyan/15" />
        <Upload className="relative text-cyan drop-shadow-[0_0_14px_rgba(78,196,236,0.55)]" size={31} />
      </div>
    );
  }

  if (visual === "bars") {
    return (
      <svg width="82" height="62" viewBox="0 0 72 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 48H68" stroke="#284657" />
        <rect x="9" y="25" width="9" height="23" fill="#E65F73" />
        <rect x="25" y="17" width="9" height="31" fill="#E8BE4C" />
        <rect x="41" y="8" width="9" height="40" fill="#73C98F" />
        <rect x="57" y="20" width="9" height="28" fill="#4EC4EC" />
      </svg>
    );
  }

  if (visual === "compare") {
    return (
      <svg width="90" height="60" viewBox="0 0 82 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 42C13 30 22 25 33 30C43 35 48 18 57 14C65 10 72 18 79 7" stroke="#73C98F" strokeWidth="3" strokeLinecap="round" />
        <path d="M3 34C13 31 21 34 31 42C43 52 52 32 61 26C68 21 74 25 79 20" stroke="#E65F73" strokeWidth="3" strokeLinecap="round" />
        <circle cx="57" cy="14" r="3" fill="#E8BE4C" />
      </svg>
    );
  }

  if (visual === "monitor") {
    return (
      <svg width="90" height="62" viewBox="0 0 78 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 30H19L26 12L38 46L48 23H61L67 14L74 30" stroke="#4EC4EC" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 45H74" stroke="#284657" />
      </svg>
    );
  }

  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-3">
          <Icon className={item === 0 ? "text-cyan" : item === 1 ? "text-profit" : "text-warning"} size={16} />
          <span className="h-1.5 w-14 bg-[#203747]" />
        </div>
      ))}
    </div>
  );
}

function LeakDiagnosticsSection() {
  return (
    <section className="EdgeTrace-shell py-12 md:py-16">
      <div className="grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        <RadarVisual />
        <div className="max-w-xl">
          <h2 className="text-4xl font-semibold leading-[1.04] tracking-[-0.042em] text-ink md:text-5xl">
            Find what's degrading your edge.
          </h2>
          <p className="mt-6 text-lg leading-8 text-muted">
            EdgeTrace separates execution drag, weak expectancy, poor R capture, and unstable segments so you can fix the right problems.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              "Cost analysis and cost drag",
              "Expectancy and R-multiple breakdowns",
              "Symbol, strategy, and time attribution",
              "Trade quality & execution insights",
              "Drawdown and large-loss diagnostics"
            ].map((item, index) => (
              <li key={item} className="flex items-center gap-3 text-base text-slate-200">
                <CheckCircle2 className={index < 2 ? "text-cyan" : "text-violet"} size={20} strokeWidth={1.8} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function RadarVisual() {
  const points = [
    { label: "Cost Drag", icon: Database, x: "50%", y: "11%" },
    { label: "R Capture", icon: FileText, x: "84%", y: "34%" },
    { label: "Consistency", icon: Shield, x: "82%", y: "73%" },
    { label: "Risk & Drawdown", icon: Activity, x: "50%", y: "88%" },
    { label: "Trade Quality", icon: TrendingUp, x: "17%", y: "73%" },
    { label: "Expectancy", icon: Target, x: "17%", y: "34%" }
  ];

  return (
    <div className="relative min-h-[450px] overflow-hidden border border-white/[0.12] bg-white/[0.038] p-5 shadow-[0_34px_120px_-78px_rgba(88,214,255,0.46)] md:min-h-[560px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,97,255,0.2),transparent_18rem)]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 540" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="300" cy="270" r="58" stroke="white" strokeOpacity=".08" />
        <circle cx="300" cy="270" r="94" stroke="white" strokeOpacity=".08" />
        <circle cx="300" cy="270" r="130" stroke="white" strokeOpacity=".08" />
        <circle cx="300" cy="270" r="166" stroke="white" strokeOpacity=".08" />
        <path d="M300 76V464M132 173L468 367M132 367L468 173" stroke="white" strokeOpacity=".07" />
      </svg>
      <div className="absolute left-1/2 top-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-violet/28 bg-violet/[0.12] shadow-[0_0_58px_-22px_rgba(120,97,255,0.95)]">
        <img src="/brand/edgetrace_icon_monochrome_white_transparent.png" alt="EdgeTrace" className="h-14 w-auto opacity-85" />
      </div>
      {points.map(({ label, icon: Icon, x, y }) => (
        <div key={label} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center" style={{ left: x, top: y }}>
          <div className="flex h-12 w-12 items-center justify-center border border-cyan/35 bg-black/38 text-cyan shadow-[0_0_28px_-22px_rgba(88,214,255,0.9)]">
            <Icon size={22} strokeWidth={1.75} />
          </div>
          <p className="max-w-[9rem] bg-black/20 px-2 py-1 text-sm font-medium text-slate-100">{label}</p>
        </div>
      ))}
    </div>
  );
}

function ImportCompatibilitySection() {
  return (
    <section className="EdgeTrace-shell py-12 md:py-16">
      <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div>
          <h2 className="text-4xl font-semibold tracking-[-0.042em] text-ink md:text-5xl">Works with your data.</h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            Import from major broker exports or use a generic CSV. EdgeTrace normalizes completed trade history into diagnostics without turning it into a manual journal.
          </p>
          <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            {brokerPills.map((broker) => {
              const Icon = broker === "Generic CSV" ? FileText : Database;
              return (
                <div
                  key={broker}
                  className="flex min-h-12 items-center gap-3 border border-white/[0.12] bg-white/[0.035] px-4 py-3 text-sm font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-cyan/35 hover:bg-cyan/[0.045]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center border border-cyan/25 bg-cyan/[0.055] text-cyan">
                    <Icon size={15} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 truncate">{broker}</span>
                </div>
              );
            })}
          </div>
        </div>

        <ImportVisual />
      </div>
    </section>
  );
}

function ImportVisual() {
  return (
    <div className="relative overflow-hidden border border-white/[0.12] bg-white/[0.038] p-6 shadow-[0_34px_110px_-78px_rgba(88,214,255,0.42)] md:p-8 lg:p-9">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_14%,rgba(88,214,255,0.11),transparent_18rem),radial-gradient(circle_at_82%_84%,rgba(120,97,255,0.12),transparent_18rem)]" />
      <div className="relative grid items-center gap-8 md:grid-cols-[0.95fr_auto_1.12fr]">
        <div className="border border-white/[0.14] bg-black/28 p-6">
          <div className="relative h-60">
            <div className="absolute inset-x-3 bottom-0 top-2 border border-white/24 bg-white/[0.04] shadow-[0_20px_50px_-38px_rgba(88,214,255,0.65)]">
              <div className="absolute right-0 top-0 h-16 w-16 border-b border-l border-white/20 bg-black/35 [clip-path:polygon(0_0,100%_100%,0_100%)]" />
              <p className="absolute left-5 top-14 text-3xl font-semibold tracking-[-0.04em] text-ink">.CSV</p>
              <div className="absolute bottom-8 left-5 right-5 space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="grid grid-cols-[0.5fr_1fr_0.8fr] gap-2">
                    <span className="h-2 bg-white/20" />
                    <span className="h-2 bg-cyan/30" />
                    <span className="h-2 bg-white/14" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <ArrowRight className="mx-auto text-cyan drop-shadow-[0_0_14px_rgba(88,214,255,0.45)]" size={38} strokeWidth={1.55} />
        <div className="border border-white/[0.13] bg-[#0b111c]/86 p-6">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-ink">Import Summary</h3>
          <dl className="mt-6 space-y-4">
            <SummaryRow label="Trades imported" value="1,248" tone="text-cyan" />
            <SummaryRow label="Costs detected" value="Yes" tone="text-cyan" />
            <SummaryRow label="R-multiple detected" value="Yes" tone="text-cyan" />
            <SummaryRow label="Mapping confidence" value="High" tone="text-cyan" />
            <SummaryRow label="Warnings" value="2" tone="text-warning" />
          </dl>
          <button className="mt-7 flex w-full items-center justify-center border border-cyan/35 bg-[#061019] px-5 py-3 text-sm font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_-30px_rgba(88,214,255,0.8)] transition hover:border-cyan/55 hover:bg-[#0a1722]">
            Run Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2 text-sm text-slate-300">
        <CheckCircle2 className="text-cyan" size={14} /> {label}
      </dt>
      <dd className={`text-sm font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function TrustBar() {
  return (
    <section className="EdgeTrace-shell py-10 md:py-14">
      <div className="grid gap-0 border border-white/[0.09] bg-white/[0.035] shadow-[0_24px_90px_-78px_rgba(88,214,255,0.35)] md:grid-cols-2 lg:grid-cols-4">
        {trustItems.map(({ icon: Icon, title, body }, index) => (
          <article key={title} className={`flex gap-5 p-6 transition hover:bg-white/[0.025] ${index > 0 ? "border-t border-white/[0.08] md:border-l md:border-t-0" : ""}`}>
            <Icon className="mt-1 text-cyan" size={31} strokeWidth={1.55} />
            <div>
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

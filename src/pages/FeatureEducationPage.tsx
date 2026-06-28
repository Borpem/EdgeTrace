import { useEffect, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  FileSearch,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import { PageShell } from "../components/ui/Primitives";
import { trackEvent } from "../lib/analytics";
import type { UserProfile } from "../types";

type FeatureEducationPageProps = {
  profile?: UserProfile | null;
  isAuthenticated?: boolean;
  onAnalyze: () => void;
  onPricing: () => void;
  onSignup?: () => void;
  onOpenReport?: (reportId: string) => void;
  onCreateStrategySet?: () => void;
};

type FeatureItem = {
  icon: LucideIcon;
  title: string;
  body: string;
};

type HowSection = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  reverse?: boolean;
  visual: ReactNode;
};

const valueStrip: FeatureItem[] = [
  { icon: BarChart3, title: "Aggregate intelligence", body: "Trade history becomes sharper diagnostics and benchmark insight." },
  { icon: ShieldCheck, title: "Secure access", body: "Encrypted transport and account-scoped access controls." },
  { icon: FileSearch, title: "Transparent analysis", body: "Key report inputs and diagnostic logic stay visible in the workflow." },
  { icon: Activity, title: "Free core, paid loop", body: "Use the full workflow free. Upgrade for heatmaps, benchmarks, and recurring review pressure." }
];

export function FeatureEducationPage({
  profile,
  isAuthenticated = Boolean(profile),
  onAnalyze,
  onSignup
}: FeatureEducationPageProps) {
  const accountAction = isAuthenticated ? onAnalyze : onSignup ?? onAnalyze;
  const accountLabel = isAuthenticated ? "Create a Report" : "Create Free Account";
  const sampleAction = () => {
    document.getElementById("how-diagnose")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const howSections: HowSection[] = [
    {
      id: "how-import",
      kicker: "01 / Import",
      title: "Start with the trades you already have.",
      body:
        "Upload completed trade history from a broker export or a generic CSV. EdgeTrace reviews the mapping, normalizes the file, and turns messy trade rows into report-ready data.",
      points: ["Broker and generic CSV imports", "Mapping review before diagnostics", "Clean workflow from upload to report"],
      visual: (
        <HowGraphic
          src="/graphics/edgetrace-how-report-builder-workflow-clean.png"
          alt="EdgeTrace import workflow showing source file, normalized inputs, and generated report."
        />
      )
    },
    {
      id: "how-diagnose",
      kicker: "02 / Diagnose",
      title: "Find what is degrading your edge.",
      body:
        "The report turns the import into a quick read on health, expectancy, cost drag, R-capture, and the primary issue most likely to improve the next upload.",
      points: ["Primary diagnosis", "Edge health score", "Top performance drivers"],
      reverse: true,
      visual: (
        <HowGraphic
          src="/graphics/edgetrace-how-report-overview-negative-expectancy-final-clean.png"
          alt="EdgeTrace report overview graphic showing negative expectancy, edge health, and diagnostic metrics."
        />
      )
    },
    {
      id: "how-drilldowns",
      kicker: "03 / Drilldowns",
      title: "Drill into the segment behind the report.",
      body:
        "Move from the dashboard into symbol and segment readouts to understand whether the leak is coming from costs, weak net PnL, risk capture, or a concentrated pocket of losses.",
      points: ["Symbol-level readouts", "Cost and net PnL context", "Diagnostic flags for weak segments"],
      visual: (
        <HowGraphic
          src="/graphics/edgetrace-how-segment-analysis-readout-polished.png"
          alt="EdgeTrace segment analysis readout with symbol metrics and diagnostic flags."
        />
      )
    },
    {
      id: "how-actions",
      kicker: "04 / Actions",
      title: "Turn the diagnosis into a review queue.",
      body:
        "Recommended actions translate the report into a short list of fixes to inspect, retest, or limit before you upload the next batch of completed trades.",
      points: ["Prioritized next steps", "High, medium, and low impact grouping", "Clear next-best-move card"],
      reverse: true,
      visual: (
        <HowGraphic
          src="/graphics/edgetrace-how-recommended-actions-nextmove-clean.png"
          alt="EdgeTrace recommended actions graphic with priorities and next move."
        />
      )
    },
    {
      id: "how-review-loop",
      kicker: "05 / Review Loop",
      title: "Measure whether the fix worked.",
      body:
        "Pro adds the recurring review layer: mistake heatmaps, benchmark movement, next-upload targets, and check-in prompts that make EdgeTrace useful after every new report.",
      points: ["Mistake heatmap", "Review targets", "Benchmark movement", "Recurring improvement loop"],
      visual: (
        <HowGraphic
          src="/graphics/edgetrace-how-pro-review-loop-thin-gauge.png"
          alt="EdgeTrace Pro review loop graphic with benchmark gauges and next review targets."
        />
      )
    }
  ];

  useEffect(() => {
    trackEvent(isAuthenticated ? "feature_education_opened" : "public_how_it_works_opened");
  }, [isAuthenticated]);

  useEffect(() => {
    const feature = new URLSearchParams(window.location.search).get("feature");
    if (!feature) return;
    const targetId = feature.replace(/_/g, "-");
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  return (
    <PageShell className={`${isAuthenticated ? "EdgeTrace-auth-education" : ""} how-page relative z-10`}>
      <section className="how-hero">
        <div className="how-hero-copy">
          <p className="how-eyebrow">Trading Diagnostics</p>
          <h1 className="how-title">Your trade history already knows what to fix next.</h1>
          <p className="how-body">
            EdgeTrace turns completed trades into a diagnostic workflow that exposes hidden leaks, shows where your
            edge is working, and tells you what to prove on the next upload.
          </p>
          <div className="how-cta-row">
            <button className="EdgeTrace-primary-button" onClick={accountAction}>
              {accountLabel}
              <ArrowRight size={16} />
            </button>
            <button className="EdgeTrace-secondary-button" onClick={sampleAction}>
              View Sample Report
            </button>
          </div>
        </div>
      </section>

      <div className="how-section-stack">
        {howSections.map((section) => (
          <HowEditorialSection key={section.id} section={section} />
        ))}
      </div>

      <FeatureStrip items={valueStrip} className="how-value-strip" />

      <section className="how-final-cta">
        <div>
          <p className="how-eyebrow">Start Now</p>
          <h2>Build your first diagnostic report.</h2>
          <p>Import completed trades and see the drivers behind your edge.</p>
        </div>
        <button className="EdgeTrace-primary-button" onClick={accountAction}>
          Create a Report
          <ArrowRight size={16} />
        </button>
      </section>
    </PageShell>
  );
}

function FeatureStrip({ items, className = "" }: { items: FeatureItem[]; className?: string }) {
  return (
    <section className={`how-feature-strip ${className}`}>
      {items.map(({ icon: Icon, title, body }) => (
        <article className="how-feature-item" key={title}>
          <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
          <div>
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function HowEditorialSection({ section }: { section: HowSection }) {
  return (
    <section id={section.id} className={`how-section ${section.reverse ? "how-section--reverse" : ""}`}>
      <div className="how-section-copy">
        <p className="how-kicker">{section.kicker}</p>
        <h2 className="how-section-title">{section.title}</h2>
        <p className="how-section-body">{section.body}</p>
        <ul className="how-points">
          {section.points.map((point) => (
            <li key={point}>
              <Check aria-hidden="true" size={17} strokeWidth={2} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="how-section-visual">{section.visual}</div>
    </section>
  );
}

function HowGraphic({
  src,
  alt,
  hero = false
}: {
  src: string;
  alt: string;
  hero?: boolean;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={`how-graphic ${hero ? "how-graphic--hero" : ""}`}
      draggable={false}
      loading={hero ? "eager" : "lazy"}
    />
  );
}

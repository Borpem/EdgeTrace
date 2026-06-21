import { useEffect, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  FileSearch,
  Layers,
  ShieldCheck,
  Target,
  Upload,
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

const featureStrip: FeatureItem[] = [
  { icon: FileSearch, title: "Diagnose the leak", body: "Find the cost, segment, or risk issue dragging the report." },
  { icon: Activity, title: "Track each upload", body: "See whether the next report improved or slipped." },
  { icon: Target, title: "Review the process", body: "Use Pro check-ins to keep the review loop active." },
  { icon: BarChart3, title: "Compare to context", body: "Benchmark percentiles show where the report stands." }
];

const workflowSteps: FeatureItem[] = [
  { icon: Upload, title: "Import Trades", body: "Upload broker exports or a generic CSV." },
  { icon: FileSearch, title: "Diagnostic Report", body: "See expectancy, cost drag, R-capture, and health." },
  { icon: Layers, title: "Drilldowns", body: "Break performance down by symbol, strategy, and time." },
  { icon: Target, title: "Recommended Actions", body: "Prioritize the next fixes to inspect or retest." },
  { icon: Activity, title: "Review Loop", body: "Track whether edge is strengthening or deteriorating." }
];

const valueStrip: FeatureItem[] = [
  { icon: BarChart3, title: "Aggregate intelligence", body: "Trade history becomes sharper diagnostics and benchmark insight." },
  { icon: ShieldCheck, title: "Secure access", body: "Encrypted transport and account-scoped access controls." },
  { icon: FileSearch, title: "Transparent analysis", body: "Key report inputs and diagnostic logic stay visible in the workflow." },
  { icon: Activity, title: "Free core, paid loop", body: "Use the full workflow free. Upgrade when you want recurring review pressure." }
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
          src="/graphics/edgetrace-how-report-builder-workflow-clean.svg"
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
          src="/graphics/edgetrace-how-pro-review-loop-thin-gauge.png"
          alt="EdgeTrace Pro review loop graphic with benchmark gauges, weekly review, and next review targets."
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
          src="/graphics/edgetrace-how-recommended-actions-nextmove-clean.svg"
          alt="EdgeTrace recommended actions graphic with priorities and next move."
        />
      )
    },
    {
      id: "how-review-loop",
      kicker: "05 / Review Loop",
      title: "Measure whether the fix worked.",
      body:
        "Pro adds the recurring review layer: benchmark movement, next-upload targets, and check-in prompts that make EdgeTrace useful after every new report.",
      points: ["Review targets", "Benchmark movement", "Recurring improvement loop"],
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
          <p className="how-eyebrow">How It Works</p>
          <h1 className="how-title">From completed trades to clear next steps.</h1>
          <p className="how-body">
            EdgeTrace turns your trade history into a diagnostic workflow: import your data, identify what is degrading
            performance, drill into weak segments, and track whether your fixes actually improve the next report.
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

      <FeatureStrip items={featureStrip} />

      <section className="how-workflow-intro" id="how-workflow">
        <p className="how-eyebrow">Workflow</p>
        <h2>From trades to clarity.</h2>
        <p>A complete workflow for understanding what changed, what leaked, and what deserves attention next.</p>
      </section>

      <ProcessRow />

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

function ProcessRow() {
  return (
    <section className="how-process-row" aria-label="EdgeTrace workflow steps">
      {workflowSteps.map(({ icon: Icon, title, body }, index) => (
        <article className="how-process-step" key={title}>
          <div className="how-step-index">0{index + 1}</div>
          <div className="how-step-icon">
            <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
          </div>
          <h3>{title}</h3>
          <p>{body}</p>
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

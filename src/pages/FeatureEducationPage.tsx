import { useEffect, type MouseEvent, type ReactNode } from "react";
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
import { shouldHandleClientNavigation } from "../lib/navigation";
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
  { icon: BarChart3, title: "Completed-trade diagnostics", body: "Review expectancy, costs, R-capture, and performance segments from imported history." },
  { icon: ShieldCheck, title: "Secure access", body: "Encrypted transport and account-scoped access controls." },
  { icon: FileSearch, title: "Transparent analysis", body: "Key report inputs and diagnostic logic stay visible in the workflow." },
  { icon: Activity, title: "Free core, paid review layer", body: "Use the core reporting workflow free. Upgrade for drilldowns, heatmaps, and recurring reviews." }
];

export function FeatureEducationPage({
  profile,
  isAuthenticated = Boolean(profile),
  onAnalyze,
  onSignup
}: FeatureEducationPageProps) {
  const accountAction = isAuthenticated ? onAnalyze : onSignup ?? onAnalyze;
  const accountLabel = isAuthenticated ? "Create a Report" : "Create Free Account";

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
          width={1200}
          height={690}
        />
      )
    },
    {
      id: "how-diagnose",
      kicker: "02 / Diagnose",
      title: "Find what is degrading your edge.",
      body:
        "The report turns the import into a quick read on health, expectancy, cost drag, R-capture, and the primary issue to inspect before the next upload.",
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
      kicker: "03 / Pro drilldowns",
      title: "Drill into the segment behind the report.",
      body:
        "Pro opens the symbol and segment readouts behind the dashboard so you can see whether the leak is coming from costs, weak net PnL, risk capture, or a concentrated pocket of losses.",
      points: ["Symbol-level readouts", "Cost and net PnL context", "Diagnostic flags for weak segments"],
      visual: (
        <HowGraphic
          src="/marketing/edgetrace-segment-analysis-readout-polished.png"
          alt="EdgeTrace segment analysis readout with symbol metrics and diagnostic flags."
          width={1200}
          height={720}
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
          width={1200}
          height={720}
        />
      )
    },
    {
      id: "how-heatmaps",
      kicker: "05 / Heatmaps",
      title: "Spot when your best and worst trades repeat.",
      body:
        "Pro heatmaps separate leak clusters from edge clusters by weekday, session, and symbol, so you can see when money is being lost, where money is being made, and which patterns deserve the next review.",
      points: ["Leak and edge maps by day and session", "Strong and weak symbol clusters", "Winning and losing trade context"],
      visual: (
        <HowGraphic
          src="/graphics/edgetrace-how-trade-pattern-heatmaps.png"
          alt="EdgeTrace trade pattern heatmaps showing leak map, edge map, symbol clusters, and session performance."
        />
      )
    },
    {
      id: "how-review-loop",
      kicker: "06 / Review Loop",
      title: "Measure whether the fix worked.",
      body:
        "Pro adds the recurring review layer: mistake heatmaps, report-to-report checks, next-upload targets, and review prompts that make EdgeTrace useful after every new report.",
      points: ["Mistake heatmap", "Review targets", "Report comparison", "Recurring review loop"],
      reverse: true,
      visual: (
        <HowGraphic
          src="/marketing/edgetrace-signal-board.svg"
          alt="EdgeTrace action plan showing diagnostic priorities and a measure-again review step."
          width={1200}
          height={720}
        />
      )
    }
  ];

  useEffect(() => {
    trackEvent(isAuthenticated ? "feature_education_opened" : "public_how_it_works_opened");
    if (!isAuthenticated) trackEvent("landing_page_viewed");
  }, [isAuthenticated]);

  useEffect(() => {
    const feature = new URLSearchParams(window.location.search).get("feature");
    if (!feature) return;
    const targetId = feature.replace(/_/g, "-");
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handleAccountAction = (event: MouseEvent<HTMLAnchorElement>, source: "primary" | "secondary") => {
    if (!shouldHandleClientNavigation(event)) return;
    event.preventDefault();
    trackEvent(source === "primary" ? "landing_primary_cta_clicked" : "landing_secondary_cta_clicked");
    accountAction();
  };

  return (
    <PageShell id="main-content" className={`${isAuthenticated ? "EdgeTrace-auth-education" : ""} how-page relative z-10`}>
      <section className="how-hero">
        <div className="how-hero-copy">
          <h1 className="how-title">
            <span>Trade performance analytics</span>
            <span>for completed trades.</span>
          </h1>
          <p className="how-body">
            Import broker or generic CSV history to review expectancy, cost drag, R-capture, weak symbols and
            sessions, and the changes between diagnostic reports.
          </p>
          <div className="how-cta-row">
            <a
              className="EdgeTrace-primary-button"
              href={isAuthenticated ? "/app/upload" : "/signup?next=/app/upload"}
              onClick={(event) => handleAccountAction(event, "primary")}
            >
              {accountLabel}
              <ArrowRight size={16} />
            </a>
            <a className="EdgeTrace-secondary-button" href="/broker-csv-trade-analysis">
              Review Supported CSV Sources
            </a>
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
        <a
          className="EdgeTrace-primary-button"
          href={isAuthenticated ? "/app/upload" : "/signup?next=/app/upload"}
          onClick={(event) => handleAccountAction(event, "secondary")}
        >
          Create a Report
          <ArrowRight size={16} />
        </a>
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
  hero = false,
  width = 1672,
  height = 941
}: {
  src: string;
  alt: string;
  hero?: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={`how-graphic ${hero ? "how-graphic--hero" : ""}`}
      draggable={false}
      loading={hero ? "eager" : "lazy"}
      decoding="async"
      width={width}
      height={height}
      sizes="(max-width: 1100px) 100vw, 50vw"
    />
  );
}

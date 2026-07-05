import { ArrowRight, BarChart3, Clock, LineChart, ShieldCheck, Target } from "lucide-react";
import { PageShell } from "../components/ui/Primitives";
import { trackEvent } from "../lib/analytics";
import { useEffect } from "react";

type SampleReportPageProps = {
  onStart: () => void;
  onPricing: () => void;
};

const metrics = [
  { label: "Net PnL", value: "-$132.75", tone: "loss" },
  { label: "Expectancy", value: "-$2.66", tone: "loss" },
  { label: "Win Rate", value: "62%", tone: "profit" },
  { label: "Profit Factor", value: "0.72", tone: "loss" },
  { label: "Trades", value: "50", tone: "neutral" }
];

const findings = [
  {
    icon: Target,
    title: "Primary diagnosis",
    body: "Costs consumed a large share of gross gains in this sample, making cost review the first place to inspect."
  },
  {
    icon: Clock,
    title: "Repeatable review points",
    body: "The report groups issues by symbol, timing, and setup context so a trader can review completed activity more deliberately."
  },
  {
    icon: ShieldCheck,
    title: "Educational analytics",
    body: "EdgeTrace summarizes completed trade history. It does not tell users what to buy, sell, or trade next."
  }
];

const heatmapColumns = ["Open", "Midday", "Power Hour", "Overnight"];
const heatmapRows = [
  { day: "Mon", values: [2, 1, 3, 0] },
  { day: "Tue", values: [1, 4, 2, 1] },
  { day: "Wed", values: [3, 2, 5, 1] },
  { day: "Thu", values: [2, 1, 4, 2] },
  { day: "Fri", values: [1, 3, 2, 0] }
];

const drilldownRows = [
  { group: "AAPL - Open", trades: "12", netPnl: "-$84.20", expectancy: "-$7.02", issue: "Cost drag", tone: "loss" },
  { group: "MSFT - Midday", trades: "9", netPnl: "$48.60", expectancy: "$5.40", issue: "Stable winners", tone: "profit" },
  { group: "TSLA - Power Hour", trades: "8", netPnl: "-$71.15", expectancy: "-$8.89", issue: "Late-session leak", tone: "loss" },
  { group: "NVDA - Open", trades: "7", netPnl: "$39.00", expectancy: "$5.57", issue: "Positive cluster", tone: "profit" }
];

export function SampleReportPage({ onStart, onPricing }: SampleReportPageProps) {
  useEffect(() => {
    trackEvent("sample_report_viewed");
  }, []);

  return (
    <PageShell className="EdgeTrace-sample-page relative z-10">
      <section className="EdgeTrace-sample-hero">
        <p className="EdgeTrace-sample-eyebrow">Sample Report</p>
        <h1>See the diagnostic workflow before uploading your trades.</h1>
        <p>
          This public sample uses demonstration data to show how EdgeTrace organizes completed trade history into
          reviewable diagnostics, risk context, and next inspection areas.
        </p>
        <div className="EdgeTrace-sample-actions">
          <button className="EdgeTrace-primary-button" onClick={onStart}>
            Create Free Account <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button className="EdgeTrace-secondary-button" onClick={onPricing}>
            View Pricing <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="EdgeTrace-sample-report-card">
        <div className="EdgeTrace-sample-report-head">
          <div>
            <p className="EdgeTrace-sample-eyebrow">Report Overview</p>
            <h2>Diagnostic Report - Sample Data</h2>
          </div>
          <span>Demonstration only</span>
        </div>
        <div className="EdgeTrace-sample-metrics">
          {metrics.map((metric) => (
            <article className={`tone-${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
        <div className="EdgeTrace-sample-grid">
          <article>
            <p className="EdgeTrace-sample-eyebrow">Primary Diagnosis</p>
            <h3>High Cost Drag</h3>
            <p>
              Gross PnL is positive in this sample, but estimated costs reduce the net result. The report points the
              user toward cost-heavy symbols and timing buckets for review.
            </p>
          </article>
          <article>
            <p className="EdgeTrace-sample-eyebrow">Edge Health</p>
            <div className="EdgeTrace-sample-score">
              <strong>29</strong>
              <span>/100</span>
            </div>
            <p>Composite score from expectancy, payoff quality, costs, stability, win rate, and sample confidence.</p>
          </article>
        </div>
      </section>

      <section className="EdgeTrace-sample-analysis-grid">
        <article className="EdgeTrace-sample-analysis-card">
          <div className="EdgeTrace-sample-report-head">
            <div>
              <p className="EdgeTrace-sample-eyebrow">Sample Heatmap</p>
              <h2>Leak clusters by weekday and session</h2>
            </div>
            <span>Pattern view</span>
          </div>
          <p className="EdgeTrace-sample-section-copy">
            Heatmaps group completed trades into reviewable clusters so repeated weak spots are easier to inspect.
          </p>
          <div className="EdgeTrace-sample-heatmap" role="img" aria-label="Sample trading heatmap by weekday and session">
            <span className="EdgeTrace-sample-heatmap-corner" />
            {heatmapColumns.map((column) => (
              <span key={column} className="EdgeTrace-sample-heatmap-axis is-column">{column}</span>
            ))}
            {heatmapRows.map((row) => (
              <div className="EdgeTrace-sample-heatmap-row" key={row.day}>
                <span className="EdgeTrace-sample-heatmap-axis is-row">{row.day}</span>
                {row.values.map((level, index) => (
                  <span
                    key={`${row.day}-${heatmapColumns[index]}`}
                    className={`EdgeTrace-sample-heatmap-cell level-${level}`}
                    title={`${row.day} ${heatmapColumns[index]} sample intensity ${level}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="EdgeTrace-sample-heatmap-legend" aria-hidden="true">
            <span>Lower</span>
            {[1, 2, 3, 4, 5].map((level) => (
              <i key={level} className={`level-${level}`} />
            ))}
            <span>Higher</span>
          </div>
        </article>

        <article className="EdgeTrace-sample-analysis-card">
          <div className="EdgeTrace-sample-report-head">
            <div>
              <p className="EdgeTrace-sample-eyebrow">Sample Drilldown</p>
              <h2>Symbol and session attribution</h2>
            </div>
            <span>Detail view</span>
          </div>
          <p className="EdgeTrace-sample-section-copy">
            Drilldowns break the overview into specific groups, making it clear which completed-trade segments drove the sample result.
          </p>
          <div className="EdgeTrace-sample-drilldown-table">
            <div className="EdgeTrace-sample-drilldown-head">
              <span>Group</span>
              <span>Trades</span>
              <span>Net PnL</span>
              <span>Expectancy</span>
              <span>Flag</span>
            </div>
            {drilldownRows.map((row) => (
              <div className={`EdgeTrace-sample-drilldown-row tone-${row.tone}`} key={row.group}>
                <span>{row.group}</span>
                <span>{row.trades}</span>
                <strong>{row.netPnl}</strong>
                <strong>{row.expectancy}</strong>
                <em>{row.issue}</em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="EdgeTrace-sample-findings">
        {findings.map(({ icon: Icon, title, body }) => (
          <article key={title}>
            <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="EdgeTrace-sample-disclaimer">
        <BarChart3 size={18} aria-hidden="true" />
        <p>
          EdgeTrace is an analytics and journaling tool for completed trade data. It does not provide financial,
          investment, trading, tax, or legal advice and does not promise profitability or improved returns.
        </p>
      </section>
    </PageShell>
  );
}

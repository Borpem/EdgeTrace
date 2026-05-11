import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import Papa from "papaparse";
import { buildBreakdown, findLargestLeak } from "../lib/breakdowns";
import { runDiagnostics } from "../lib/diagnostics";
import { normalizeTrades } from "../lib/normalize";
import { buildReportIntelligence } from "../lib/reportIntelligence";
import { trackEvent } from "../lib/analytics";
import type { DiagnosticsResult } from "../types";

type PublicDemoPageProps = {
  isAuthenticated: boolean;
  onAnalyze: () => void;
  onSignup: () => void;
  onPricing: () => void;
  onHowItWorks: () => void;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export function PublicDemoPage({
  isAuthenticated,
  onAnalyze,
  onSignup,
  onPricing,
  onHowItWorks
}: PublicDemoPageProps) {
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    trackEvent("public_demo_opened");
    let active = true;
    void fetch("/sample-trades-breakdown.csv")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load public demo data.");
        return response.text();
      })
      .then((csv) => {
        const parsed = Papa.parse<unknown[]>(csv, { header: false, skipEmptyLines: true });
        const trades = normalizeTrades(parsed.data);
        const diagnostics = runDiagnostics("public-demo-report", trades);
        if (!active) return;
        setResult({
          ...diagnostics,
          name: "Demo Diagnostic Report",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          strategyLabel: "ORB Demo Strategy",
          reportType: "imported",
          tags: ["demo", "public-preview"],
          importProvenance: {
            originalFilename: "sample-trades-breakdown.csv",
            importedAt: new Date().toISOString(),
            detectedSource: "Generic CSV",
            selectedSource: "Generic CSV",
            brokerId: "generic_csv",
            brokerDisplayName: "Generic CSV",
            detectionConfidence: 0.92,
            confidenceLabel: "Ready",
            mappedFieldsCount: 10,
            normalizedTradeCount: trades.length,
            excludedRowCount: 0,
            warningCount: 0,
            costsDetected: true,
            rMultipleDetected: trades.some((trade) => trade.realizedR !== undefined),
            reconstructionEnabled: false
          }
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load public demo data.");
      });
    return () => {
      active = false;
    };
  }, []);

  const intelligence = useMemo(() => (result ? buildReportIntelligence(result) : null), [result]);
  const symbolRows = useMemo(() => (result ? buildBreakdown(result.trades, "symbol") : []), [result]);
  const timeRows = useMemo(() => (result ? buildBreakdown(result.trades, "timeOfDay") : []), [result]);
  const largestLeak = useMemo(() => findLargestLeak(symbolRows) ?? findLargestLeak(timeRows), [symbolRows, timeRows]);
  const equityPoints = useMemo(() => buildLinePoints(result?.charts.equityCurve ?? []), [result?.charts.equityCurve]);
  const topSymbols = useMemo(() => [...symbolRows].sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl)).slice(0, 4), [symbolRows]);

  const trackCta = (cta: string, action: () => void) => {
    trackEvent("public_demo_cta_clicked", { cta });
    if (cta === "create_account") trackEvent("demo_signup_clicked");
    if (cta === "analyze_trades") trackEvent("demo_analyze_trades_clicked");
    action();
  };

  return (
    <main className="EdgeTrace-shell py-10 md:py-14">
      <section className="border-y border-white/[0.1] py-10">
        <div className="grid gap-8 xl:grid-cols-[1fr_360px] xl:items-end">
          <div>
            <p className="EdgeTrace-eyebrow">Interactive Demo</p>
            <h1 className="EdgeTrace-title">See how EdgeTrace turns trade history into a diagnostic path.</h1>
            <p className="EdgeTrace-copy">
              This public demo uses bundled sample trades. It does not require sign-in, does not write to your account,
              and does not save any data.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                className="EdgeTrace-primary-button"
                onClick={() => trackCta("analyze_trades", onAnalyze)}
              >
                {isAuthenticated ? "Create Your Own Report" : "Analyze My Trades"} <ArrowRight size={16} />
              </button>
              {!isAuthenticated && (
                <button className="EdgeTrace-secondary-button" onClick={() => trackCta("create_account", onSignup)}>
                  Create Free Account
                </button>
              )}
              <button className="EdgeTrace-secondary-button" onClick={() => trackCta("pricing", onPricing)}>
                View Pricing
              </button>
            </div>
          </div>
          <aside className="border border-cyan/30 bg-cyan/[0.045] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Demo data - not your account</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">
              {result ? `${result.metrics.totalTrades} trades analyzed` : "Loading sample"}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              The demo shows the same report concepts users see after uploading completed broker history.
            </p>
          </aside>
        </div>
      </section>

      {error && (
        <section className="mt-6 border border-loss/50 bg-loss/10 p-5 text-sm text-loss">
          {error}
        </section>
      )}

      {!result || !intelligence ? (
        <section className="mt-6 border border-white/[0.1] bg-white/[0.025] p-8">
          <p className="font-semibold text-ink">Loading demo report...</p>
          <p className="mt-2 text-sm text-muted">EdgeTrace is preparing the sample diagnostic readout.</p>
        </section>
      ) : (
        <>
          <section className="mt-6 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="relative overflow-hidden border border-white/[0.12] bg-white/[0.035] p-7 md:p-8">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_28%,rgba(61,220,151,0.13),transparent_17rem)]" />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Strategy Health</p>
                <div className="mt-7 flex flex-col gap-7 md:flex-row md:items-end">
                  <div>
                    <p className="text-8xl font-semibold leading-none tracking-[-0.08em] text-ink">
                      {intelligence.strategyHealthScore}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">
                      {intelligence.healthBand}
                    </p>
                  </div>
                  <p className="max-w-3xl pb-1 text-sm leading-6 text-muted">{intelligence.primaryExplanation}</p>
                </div>
                <svg className="mt-8 h-36 w-full" viewBox="0 0 520 150" fill="none" role="img" aria-label="Demo equity curve">
                  <path d="M0 28H520M0 74H520M0 120H520" stroke="white" strokeOpacity=".08" />
                  <polyline points={equityPoints} fill="none" stroke="#58D6FF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            <div className="border border-white/[0.12] bg-white/[0.035] p-7 md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">Primary Diagnosis</p>
              <h2 className="mt-7 text-3xl font-semibold tracking-[-0.055em] text-ink">{intelligence.primaryDiagnosis}</h2>
              <p className="mt-5 text-sm leading-6 text-muted">{intelligence.primaryLeak.explanation}</p>
              <div className="mt-8 border border-white/[0.1] bg-black/24 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Where to look next</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">
                  {largestLeak ? `Inspect ${largestLeak.group}` : intelligence.primaryLeak.recommendedInspection}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {largestLeak ? `${currency.format(largestLeak.netPnl)} net PnL in this segment` : "Open the primary leak path first"}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-4 md:grid-cols-3">
            <DemoMetric label="After-cost PnL" value={currency.format(result.metrics.netPnl)} detail={`Expectancy ${currency.format(result.metrics.expectancy)} per trade`} />
            <DemoMetric label="Cost drag" value={intelligence.costDragLabel} detail={`Total costs ${currency.format(result.metrics.totalCosts)}`} />
            <DemoMetric label="R capture" value={result.metrics.averageRealizedR === undefined ? "Unavailable" : `${decimal.format(result.metrics.averageRealizedR)}R`} detail={`Win rate ${percent.format(result.metrics.winRate)}`} />
          </section>

          <section className="mt-8 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="border border-white/[0.1] bg-white/[0.025] p-6">
              <p className="EdgeTrace-eyebrow">Drilldown Preview</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">See which segments are moving the report.</h2>
              <div className="mt-6 space-y-3">
                {topSymbols.map((row) => (
                  <div key={row.group} className="grid grid-cols-[6rem_1fr_7rem] items-center gap-4 border-t border-white/[0.08] pt-3 text-sm">
                    <span className="font-semibold text-ink">{row.group}</span>
                    <span className="h-2 bg-white/[0.08]">
                      <span
                        className={`block h-2 ${row.netPnl >= 0 ? "bg-cyan" : "bg-loss"}`}
                        style={{ width: `${Math.max(12, Math.min(100, Math.abs(row.netPnl) / maxAbs(topSymbols) * 100))}%` }}
                      />
                    </span>
                    <span className={row.netPnl >= 0 ? "text-cyan" : "text-loss"}>{currency.format(row.netPnl)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5">
              <PreviewPanel
                label="Compare"
                title="Compare iterations"
                body="Compare two reports to see what improved, degraded, or introduced new leakage."
              />
              <PreviewPanel
                label="Strategy Sets"
                title="Monitor over time"
                body="Group related reports to track health, cost drag, R capture, and regression risk across strategy versions."
              />
            </div>
          </section>

          <section className="mt-8 border border-cyan/30 bg-cyan/[0.045] p-6">
            <p className="EdgeTrace-eyebrow">Ready for your own trades?</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-ink">Create a real diagnostic report from completed trade history.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              Free includes one full diagnostic report. Pro unlocks the full strategy workflow, including drilldowns,
              comparisons, strategy sets, and monitoring.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="EdgeTrace-command-button" onClick={() => trackCta("analyze_trades", onAnalyze)}>
                {isAuthenticated ? "Create Your Own Report" : "Analyze My Trades"}
              </button>
              <button className="EdgeTrace-secondary-button" onClick={onHowItWorks}>
                Learn How It Works
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function DemoMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-white/[0.1] bg-white/[0.025] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className="mt-5 text-4xl font-semibold tracking-[-0.06em] text-ink">{value}</p>
      <p className="mt-3 text-sm text-muted">{detail}</p>
    </div>
  );
}

function PreviewPanel({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <article className="border border-white/[0.1] bg-white/[0.025] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">{label}</p>
      <h3 className="mt-4 text-2xl font-semibold tracking-[-0.045em] text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
    </article>
  );
}

function buildLinePoints(rows: Array<{ trade: number; equity: number }>) {
  if (!rows.length) return "";
  const min = Math.min(...rows.map((row) => row.equity));
  const max = Math.max(...rows.map((row) => row.equity));
  const span = max - min || 1;
  return rows
    .map((row, index) => {
      const x = rows.length === 1 ? 0 : (index / (rows.length - 1)) * 520;
      const y = 130 - ((row.equity - min) / span) * 110;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function maxAbs(rows: Array<{ netPnl: number }>) {
  return Math.max(1, ...rows.map((row) => Math.abs(row.netPnl)));
}

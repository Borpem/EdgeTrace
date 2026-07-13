import { useEffect, type MouseEvent } from "react";
import { ArrowRight, Check, FileCheck2, FileSpreadsheet, SearchCheck, ShieldCheck } from "lucide-react";
import { PageShell } from "../components/ui/Primitives";
import { trackEvent } from "../lib/analytics";
import { shouldHandleClientNavigation } from "../lib/navigation";

type BrokerCsvPageProps = {
  onHome: () => void;
  onStart: () => void;
};

const supportedSources = [
  {
    source: "Interactive Brokers",
    file: "Activity Statement or Flex CSV",
    handling: "Detects IBKR execution fields and can reconstruct completed positions from execution-level rows."
  },
  {
    source: "Robinhood",
    file: "Account activity or tax-lot-style CSV",
    handling: "Recognized dividends, transfers, deposits, withdrawals, and other non-trade activity are excluded."
  },
  {
    source: "Schwab / Thinkorswim",
    file: "Transaction or activity CSV",
    handling: "Maps trade actions, quantities, prices, costs, and timestamps; transaction rows may need reconstruction."
  },
  {
    source: "Fidelity",
    file: "History CSV",
    handling: "Maps Fidelity activity fields and excludes recognized cash or non-trade rows before diagnostics."
  },
  {
    source: "Webull",
    file: "Order history CSV",
    handling: "Uses filled quantity and average price fields while excluding recognized cancelled or incomplete rows."
  },
  {
    source: "E*TRADE",
    file: "Transaction history CSV",
    handling: "Maps action, symbol, quantity, price, costs, order IDs, and execution IDs when present."
  },
  {
    source: "Generic CSV",
    file: "Your own completed-trade file",
    handling: "Review and map symbol, side, entry time, entry price, quantity, and exit price or realized PnL."
  }
];

const workflow = [
  {
    icon: FileSpreadsheet,
    title: "Export completed trade history",
    body: "Download a supported activity, order-history, transaction-history, or Flex CSV from your broker."
  },
  {
    icon: SearchCheck,
    title: "Review detection and mapping",
    body: "EdgeTrace shows the detected source, mapped columns, excluded rows, and warnings before you create a report."
  },
  {
    icon: FileCheck2,
    title: "Build a diagnostic report",
    body: "Review expectancy, costs, R-capture, weak segments, and the drivers most relevant to the imported history."
  }
];

const faqs = [
  {
    question: "Does EdgeTrace connect directly to my brokerage account?",
    answer:
      "No automatic broker sync is claimed. The current workflow starts with a file you export and upload, so you can review the source and mapping before diagnostics run."
  },
  {
    question: "What happens if my CSV columns are different?",
    answer:
      "You can review the proposed field mapping before creating a report. Generic CSV imports require symbol, side, entry time, entry price, and quantity, plus exit price or realized PnL for complete performance calculations."
  },
  {
    question: "How are deposits, dividends, and cancelled orders handled?",
    answer:
      "Broker exports can contain non-trade activity. EdgeTrace excludes recognized cash, transfer, cancelled, and incomplete rows and shows import warnings so you can review what was omitted."
  },
  {
    question: "Does a diagnostic tell me what to trade next?",
    answer:
      "No. EdgeTrace analyzes completed trade history for informational and educational review. It does not predict markets, place trades, or provide personalized investment advice."
  }
];

export function BrokerCsvPage({ onHome, onStart }: BrokerCsvPageProps) {
  useEffect(() => {
    trackEvent("landing_page_viewed", { source: "broker_csv_trade_analysis" });
  }, []);

  const start = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldHandleClientNavigation(event)) return;
    event.preventDefault();
    trackEvent("landing_primary_cta_clicked", { source: "broker_csv_trade_analysis" });
    onStart();
  };

  return (
    <PageShell id="main-content" className="broker-csv-page relative z-10">
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-sm text-muted">
        <a
          className="font-semibold text-cyan hover:underline"
          href="/"
          onClick={(event) => {
            if (!shouldHandleClientNavigation(event)) return;
            event.preventDefault();
            onHome();
          }}
        >
          Home
        </a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Broker CSV trade analysis</span>
      </nav>

      <section className="EdgeTrace-page-header grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Broker CSV trade analysis</p>
          <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-ink md:text-6xl">
            Turn broker exports into completed-trade diagnostics.
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-muted md:text-lg md:leading-8">
            Upload supported trade history from Interactive Brokers, Robinhood, Schwab or Thinkorswim, Fidelity,
            Webull, E*TRADE, or a generic CSV. The workflow uses an uploaded file rather than an automatic broker
            connection, and its diagnostics describe completed trades rather than predicting future results.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a className="EdgeTrace-primary-button" href="/signup?next=/app/upload" onClick={start}>
              Analyze a Trade CSV <ArrowRight aria-hidden="true" size={16} />
            </a>
            <a className="EdgeTrace-secondary-button" href="#supported-formats">
              Check supported formats
            </a>
          </div>
        </div>
        <aside className="EdgeTrace-card-soft p-6" aria-label="Import safeguards">
          <ShieldCheck className="text-cyan" aria-hidden="true" size={26} />
          <h2 className="mt-5 text-xl font-semibold text-ink">Review before analysis</h2>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted">
            <li className="flex gap-3"><Check className="mt-1 shrink-0 text-cyan" aria-hidden="true" size={16} />Source detection is shown</li>
            <li className="flex gap-3"><Check className="mt-1 shrink-0 text-cyan" aria-hidden="true" size={16} />Field mappings stay visible</li>
            <li className="flex gap-3"><Check className="mt-1 shrink-0 text-cyan" aria-hidden="true" size={16} />Excluded rows and warnings are summarized</li>
          </ul>
        </aside>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-3" aria-labelledby="broker-workflow-title">
        <h2 id="broker-workflow-title" className="sr-only">How broker CSV analysis works</h2>
        {workflow.map(({ icon: Icon, title, body }, index) => (
          <article className="EdgeTrace-card p-6" key={title}>
            <div className="flex items-center justify-between">
              <Icon className="text-cyan" aria-hidden="true" size={24} />
              <span className="text-xs font-semibold text-muted">0{index + 1}</span>
            </div>
            <h3 className="mt-6 text-xl font-semibold text-ink">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
          </article>
        ))}
      </section>

      <section id="supported-formats" className="mt-16 scroll-mt-24" aria-labelledby="supported-formats-title">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Tested import adapters</p>
        <h2 id="supported-formats-title" className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink md:text-4xl">
          Supported broker and CSV sources
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Support means EdgeTrace has source-specific detection and mapping logic. Broker exports change, so every
          import still includes a mapping review and may surface warnings.
        </p>
        <div className="mt-8 overflow-x-auto rounded-xl border border-white/[0.1]">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-white/[0.04] text-ink">
              <tr>
                <th className="p-4 font-semibold" scope="col">Source</th>
                <th className="p-4 font-semibold" scope="col">Expected file</th>
                <th className="p-4 font-semibold" scope="col">Import handling</th>
              </tr>
            </thead>
            <tbody>
              {supportedSources.map((row) => (
                <tr className="border-t border-white/[0.08] align-top" key={row.source}>
                  <th className="p-4 font-semibold text-ink" scope="row">{row.source}</th>
                  <td className="p-4 text-muted">{row.file}</td>
                  <td className="p-4 leading-6 text-muted">{row.handling}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">
          Broker names identify export formats handled by the current import adapters. They do not imply an
          integration, endorsement, or partnership.
        </p>
        <aside className="EdgeTrace-card-soft mt-8 p-6" aria-labelledby="official-export-help-title">
          <h3 id="official-export-help-title" className="text-lg font-semibold text-ink">Official export help</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Broker menus and file formats can change. Check the broker's current instructions before exporting.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <li><a className="font-semibold text-cyan hover:underline" href="https://ibkrguides.com/clientportal/configure-flex-with-ai.htm" target="_blank" rel="noopener noreferrer">IBKR Flex reports</a></li>
            <li><a className="font-semibold text-cyan hover:underline" href="https://robinhood.com/us/en/support/articles/finding-your-reports-and-statements/" target="_blank" rel="noopener noreferrer">Robinhood reports</a></li>
            <li><a className="font-semibold text-cyan hover:underline" href="https://www.webull.com/help/faq/992" target="_blank" rel="noopener noreferrer">Webull order history</a></li>
            <li><a className="font-semibold text-cyan hover:underline" href="https://www.fidelity.com/products/atbt/help/ActiveTraderTools_History_Help.html" target="_blank" rel="noopener noreferrer">Fidelity history</a></li>
          </ul>
        </aside>
      </section>

      <section className="mt-16" aria-labelledby="broker-csv-faq-title">
        <h2 id="broker-csv-faq-title" className="text-3xl font-semibold tracking-[-0.04em] text-ink md:text-4xl">
          Broker CSV analysis questions
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <article className="EdgeTrace-card-soft p-6" key={faq.question}>
              <h3 className="text-lg font-semibold text-ink">{faq.question}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-final-cta mt-16">
        <div>
          <p className="how-eyebrow">Start with your own export</p>
          <h2>Review the mapping before you build a report.</h2>
          <p>Import completed trade history and inspect exactly what EdgeTrace detected.</p>
        </div>
        <a className="EdgeTrace-primary-button" href="/signup?next=/app/upload" onClick={start}>
          Create a Free Account <ArrowRight aria-hidden="true" size={16} />
        </a>
      </section>
    </PageShell>
  );
}

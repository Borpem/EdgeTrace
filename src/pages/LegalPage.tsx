import { ShieldCheck } from "lucide-react";
import { PageShell } from "../components/ui/Primitives";

export type LegalPageKind = "privacy" | "terms" | "disclaimer";

type LegalPageProps = {
  kind: LegalPageKind;
  onContact: () => void;
};

const legalContent: Record<
  LegalPageKind,
  {
    eyebrow: string;
    title: string;
    intro: string;
    sections: Array<{ title: string; body: string }>;
  }
> = {
  privacy: {
    eyebrow: "Privacy",
    title: "Privacy Policy",
    intro:
      "This beta policy explains how EdgeTrace handles account, billing, feedback, and uploaded trade data during the controlled public beta.",
    sections: [
      {
        title: "Data you provide",
        body:
          "EdgeTrace processes account details, feedback submissions, billing identifiers from Stripe, and trade exports you upload to generate reports."
      },
      {
        title: "How data is used",
        body:
          "Uploaded trade data is used to normalize records, generate diagnostics, save reports to your account, and provide account-scoped product workflows."
      },
      {
        title: "Data sharing",
        body:
          "EdgeTrace uses service providers for authentication, billing, hosting, and analytics. It does not sell uploaded trade data."
      },
      {
        title: "Support",
        body:
          "For data access or deletion requests, contact support from inside the app or through the beta support path."
      }
    ]
  },
  terms: {
    eyebrow: "Terms",
    title: "Terms of Service",
    intro:
      "These beta terms describe acceptable use of EdgeTrace and the limits of the product while it is in controlled public beta.",
    sections: [
      {
        title: "Use of the service",
        body:
          "Use EdgeTrace only with trade data you are authorized to upload. Do not attempt to access another user's reports, billing records, or account data."
      },
      {
        title: "Beta availability",
        body:
          "Beta features may change, be unavailable, or produce incomplete output. Keep your own records and verify broker data independently."
      },
      {
        title: "Billing",
        body:
          "Paid subscriptions are processed through Stripe. Subscription management, cancellation, and billing updates are handled through Stripe billing tools."
      },
      {
        title: "No professional advice",
        body:
          "EdgeTrace provides analytics for completed trade history. It is not a financial, investment, trading, tax, legal, or accounting advisor."
      }
    ]
  },
  disclaimer: {
    eyebrow: "Disclaimer",
    title: "Financial and Trading Disclaimer",
    intro:
      "EdgeTrace is a trade-analysis and journaling platform. It is designed to help users review completed trading activity, not to direct future trades.",
    sections: [
      {
        title: "No financial advice",
        body:
          "EdgeTrace does not provide financial, investment, trading, tax, legal, or accounting advice. Report output is informational and educational only."
      },
      {
        title: "No performance guarantee",
        body:
          "EdgeTrace does not promise profitability, improved returns, reduced losses, or any trading outcome. Trading involves risk, including possible loss of capital."
      },
      {
        title: "User responsibility",
        body:
          "Users are responsible for their own trading decisions and should consult qualified professionals when they need advice."
      },
      {
        title: "Data limitations",
        body:
          "Diagnostics depend on the completeness and accuracy of uploaded data. Broker exports can be incomplete, delayed, or formatted unexpectedly."
      }
    ]
  }
};

export function LegalPage({ kind, onContact }: LegalPageProps) {
  const content = legalContent[kind];

  return (
    <PageShell className="EdgeTrace-legal-page relative z-10">
      <section className="EdgeTrace-legal-hero">
        <p className="EdgeTrace-legal-eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.intro}</p>
      </section>

      <section className="EdgeTrace-legal-card">
        {content.sections.map((section) => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>

      <section className="EdgeTrace-legal-note">
        <ShieldCheck size={18} aria-hidden="true" />
        <p>
          These beta notices may be updated as EdgeTrace moves toward wider availability. Contact EdgeTrace support
          with privacy, billing, or account access questions.
        </p>
        <button className="EdgeTrace-secondary-button" onClick={onContact}>
          Contact Support
        </button>
      </section>
    </PageShell>
  );
}

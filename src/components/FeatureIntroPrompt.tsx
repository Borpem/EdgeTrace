import { CheckCircle2, Sparkles, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { FeatureIntroContent } from "../lib/featureIntros";

type FeatureIntroPromptProps = {
  intro: FeatureIntroContent;
  onClose: (doNotShowAgain: boolean) => void;
};

export function FeatureIntroPrompt({ intro, onClose }: FeatureIntroPromptProps) {
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const titleId = useId();
  const checkboxId = useId();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={() => onClose(false)}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-xl border border-cyan/30 bg-graphite p-6 shadow-[0_24px_90px_-48px_rgba(88,214,255,0.78)]"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-cyan/35 bg-cyan/[0.08] text-cyan">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <button
            aria-label="Close"
            className="border border-white/[0.12] p-2 text-muted transition hover:border-cyan/40 hover:text-ink"
            type="button"
            onClick={() => onClose(false)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan">{intro.eyebrow}</p>
        <h2 id={titleId} className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">
          {intro.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">{intro.body}</p>

        <ul className="mt-5 grid gap-3 text-sm leading-6 text-muted">
          {intro.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-cyan" size={16} aria-hidden="true" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-muted" htmlFor={checkboxId}>
          <input
            id={checkboxId}
            checked={doNotShowAgain}
            className="h-4 w-4 accent-cyan"
            type="checkbox"
            onChange={(event) => setDoNotShowAgain(event.target.checked)}
          />
          Do not show this again for this page
        </label>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className="EdgeTrace-primary-button" type="button" onClick={() => onClose(doNotShowAgain)}>
            Got it
          </button>
          <button className="EdgeTrace-secondary-button" type="button" onClick={() => onClose(true)}>
            Do not show again
          </button>
        </div>
      </section>
    </div>
  );
}

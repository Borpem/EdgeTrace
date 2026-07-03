import { ArrowRight, Lock, X } from "lucide-react";
import { useEffect } from "react";
import type { FeatureKey } from "../lib/plans";

type ProFeaturePromptProps = {
  feature: FeatureKey;
  title: string;
  description: string;
  onClose: () => void;
  onUpgrade: () => void;
  onLearn: () => void;
};

export function ProFeaturePrompt({
  feature,
  title,
  description,
  onClose,
  onUpgrade,
  onLearn
}: ProFeaturePromptProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className="w-full max-w-lg border border-cyan/30 bg-graphite p-6 shadow-[0_24px_90px_-48px_rgba(88,214,255,0.78)]"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-cyan/35 bg-cyan/[0.08] text-cyan">
            <Lock size={18} aria-hidden="true" />
          </span>
          <button className="border border-white/[0.12] p-2 text-muted transition hover:border-cyan/40 hover:text-ink" type="button" aria-label="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan">
          Pro feature
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        <p className="mt-3 text-xs text-muted">Feature: {feature.replace(/_/g, " ")}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className="EdgeTrace-primary-button" type="button" onClick={onUpgrade}>
            Upgrade to Pro <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button className="EdgeTrace-secondary-button" type="button" onClick={onLearn}>
            Learn what this unlocks
          </button>
        </div>
      </section>
    </div>
  );
}

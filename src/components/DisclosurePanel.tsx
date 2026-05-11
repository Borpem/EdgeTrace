import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

type DisclosurePanelProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  compact?: boolean;
  className?: string;
};

export function DisclosurePanel({
  title,
  subtitle,
  children,
  defaultOpen = false,
  compact = false,
  className = ""
}: DisclosurePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <section className={`border border-white/[0.1] bg-white/[0.025] ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        className={`flex w-full items-center justify-between gap-4 text-left ${compact ? "p-3" : "p-4"}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {subtitle && <span className="mt-1 block text-xs leading-5 text-muted">{subtitle}</span>}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-cyan transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={id} className={`border-t border-white/[0.1] ${compact ? "p-3" : "p-4"}`}>
          {children}
        </div>
      )}
    </section>
  );
}

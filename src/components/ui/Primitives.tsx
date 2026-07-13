import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Accent = "cyan" | "purple" | "amber" | "neutral";
type WorkflowStep = {
  title: string;
  body?: string;
  status?: "complete" | "active" | "locked" | "idle";
};

const accentText: Record<Accent, string> = {
  cyan: "text-cyan",
  purple: "text-violet",
  amber: "text-warning",
  neutral: "text-ink"
};

const accentBorder: Record<Accent, string> = {
  cyan: "border-cyan/35",
  purple: "border-violet/35",
  amber: "border-warning/35",
  neutral: "border-white/[0.11]"
};

const accentGlow: Record<Accent, string> = {
  cyan: "from-cyan/[0.12]",
  purple: "from-violet/[0.12]",
  amber: "from-warning/[0.12]",
  neutral: "from-white/[0.07]"
};

export function PageShell({
  children,
  className = "",
  id
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <main id={id} tabIndex={id ? -1 : undefined} className={`EdgeTrace-shell py-8 md:py-12 ${className}`}>
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  aside,
  className = ""
}: {
  title: string;
  subtitle?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`EdgeTrace-page-header ${className}`}>
      <div className={aside ? "grid gap-8 xl:grid-cols-[1fr_360px] xl:items-end" : ""}>
        <div>
          <h1 className="max-w-5xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-ink md:text-6xl">
            {title}
          </h1>
          {subtitle && <p className="mt-5 max-w-3xl text-base leading-7 text-muted md:text-lg md:leading-8">{subtitle}</p>}
          {(primaryAction || secondaryAction) && (
            <div className="mt-7 flex flex-wrap gap-3">
              {primaryAction}
              {secondaryAction}
            </div>
          )}
        </div>
        {aside}
      </div>
    </section>
  );
}

export function SectionBlock({
  title,
  subtitle,
  children,
  action,
  split = false,
  className = ""
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  split?: boolean;
  className?: string;
}) {
  return (
    <section className={`mt-8 md:mt-10 ${className}`}>
      {(title || subtitle || action) && (
        <div className={`mb-4 flex flex-col gap-3 ${split ? "md:flex-row md:items-end md:justify-between" : ""}`}>
          <div>
            {title && <h2 className="text-3xl font-semibold tracking-[-0.045em] text-ink md:text-4xl">{title}</h2>}
            {subtitle && <p className="mt-3 max-w-3xl text-sm leading-6 text-muted md:text-base md:leading-7">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function CardGrid({
  children,
  columns = "3",
  className = ""
}: {
  children: ReactNode;
  columns?: "2" | "3" | "4";
  className?: string;
}) {
  const gridClass =
    columns === "4"
      ? "md:grid-cols-2 xl:grid-cols-4"
      : columns === "2"
        ? "md:grid-cols-2"
        : "md:grid-cols-2 xl:grid-cols-3";
  return <div className={`grid gap-4 ${gridClass} ${className}`}>{children}</div>;
}

export function SummaryPanel({
  title,
  body,
  children,
  action,
  accent = "cyan",
  className = ""
}: {
  title: string;
  body?: string;
  children?: ReactNode;
  action?: ReactNode;
  accent?: Accent;
  className?: string;
}) {
  return (
    <section className={`EdgeTrace-summary-panel relative overflow-hidden ${className}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentGlow[accent]} to-transparent opacity-80`} />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.045em] text-ink md:text-3xl">{title}</h2>
          {body && <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">{body}</p>}
          {children && <div className="mt-5">{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  trend,
  accent = "cyan"
}: {
  label: string;
  value: string;
  helper?: string;
  trend?: string;
  accent?: Accent;
}) {
  return (
    <article className={`EdgeTrace-card border ${accentBorder[accent]} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className={`mt-4 text-3xl font-semibold tracking-[-0.055em] ${accentText[accent]}`}>{value}</p>
      {helper && <p className="mt-3 text-sm leading-6 text-muted">{helper}</p>}
      {trend && <p className={`mt-3 text-sm font-semibold ${accentText[accent]}`}>{trend}</p>}
    </article>
  );
}

export function InsightCard({
  title,
  body,
  icon: Icon,
  action,
  accent = "neutral"
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
  action?: ReactNode;
  accent?: Accent;
}) {
  return (
    <article className={`EdgeTrace-card-soft border ${accentBorder[accent]} p-5 transition hover:border-cyan/35`}>
      <div className="flex items-start gap-4">
        {Icon && <Icon className={accentText[accent]} size={24} strokeWidth={1.7} />}
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-[-0.035em] text-ink">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
          {action && <div className="mt-5">{action}</div>}
        </div>
      </div>
    </article>
  );
}

export function EmptyStateCard({
  icon: Icon,
  title,
  body,
  primaryAction
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  primaryAction?: ReactNode;
}) {
  return (
    <section className="EdgeTrace-card p-7">
      {Icon && <Icon className="text-cyan" size={34} strokeWidth={1.6} />}
      <h2 className="mt-5 text-3xl font-semibold tracking-[-0.045em] text-ink">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{body}</p>
      {primaryAction && <div className="mt-6">{primaryAction}</div>}
    </section>
  );
}

export function InfoCard({
  icon: Icon,
  title,
  body,
  accent = "cyan"
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  accent?: Accent;
}) {
  return (
    <article className="EdgeTrace-info-card flex gap-5 p-5">
      {Icon && <Icon className={accentText[accent]} size={28} strokeWidth={1.6} />}
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
      </div>
    </article>
  );
}

export function TableContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`EdgeTrace-table-container ${className}`}>{children}</div>;
}

export function WorkflowPanel({
  steps,
  action,
  className = ""
}: {
  steps: WorkflowStep[];
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`EdgeTrace-workflow-panel ${className}`}>
      <div className="grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={`${step.title}-${index}`}
            className={`EdgeTrace-workflow-step ${
              step.status === "active"
                ? "EdgeTrace-workflow-step-active"
                : step.status === "complete"
                  ? "EdgeTrace-workflow-step-complete"
                  : ""
            }`}
          >
            <p className="text-[11px] font-semibold text-muted">0{index + 1}</p>
            <p className="mt-2 font-semibold text-ink">{step.title}</p>
            {step.body && <p className="mt-1 text-xs leading-5 text-muted">{step.body}</p>}
          </div>
        ))}
      </div>
      {action && <div className="mt-4 flex flex-wrap gap-3">{action}</div>}
    </section>
  );
}

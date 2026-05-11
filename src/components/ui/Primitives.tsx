import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Accent = "cyan" | "purple" | "amber" | "neutral";

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

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`EdgeTrace-shell py-10 md:py-14 ${className}`}>{children}</main>;
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
          <h1 className="max-w-5xl text-5xl font-semibold leading-[1.07] tracking-[-0.04em] text-ink md:text-7xl">
            {title}
          </h1>
          {subtitle && <p className="mt-6 max-w-3xl text-lg leading-8 text-muted">{subtitle}</p>}
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
    <section className={`mt-10 md:mt-12 ${className}`}>
      {(title || subtitle || action) && (
        <div className={`mb-5 flex flex-col gap-3 ${split ? "md:flex-row md:items-end md:justify-between" : ""}`}>
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
    <article className={`border ${accentBorder[accent]} bg-white/[0.03] p-5`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className={`mt-5 text-4xl font-semibold tracking-[-0.06em] ${accentText[accent]}`}>{value}</p>
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
    <article className={`border ${accentBorder[accent]} bg-white/[0.03] p-5 transition hover:bg-white/[0.045]`}>
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
    <section className="border border-white/[0.1] bg-white/[0.03] p-7">
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
    <article className="flex gap-5 border border-white/[0.09] bg-white/[0.03] p-5">
      {Icon && <Icon className={accentText[accent]} size={28} strokeWidth={1.6} />}
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
      </div>
    </article>
  );
}

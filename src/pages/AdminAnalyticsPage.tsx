import { Activity, AlertTriangle, BarChart3, CheckCircle2, CreditCard, MousePointerClick, TrendingUp, UploadCloud, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getAdminAnalytics, getAdminStatus } from "../lib/api";
import type { AnalyticsCount, AnalyticsSummary } from "../types";
import type { LucideIcon } from "lucide-react";

export function AdminAnalyticsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadAnalytics = async () => {
      setError("");
      try {
        const adminStatus = await getAdminStatus();
        if (cancelled) return;
        setIsAdmin(adminStatus.isAdmin);
        if (!adminStatus.isAdmin) return;
        const response = await getAdminAnalytics();
        if (!cancelled) setAnalytics(response.analytics);
      } catch (err) {
        if (!cancelled) {
          setIsAdmin(false);
          setError(err instanceof Error ? err.message : "Analytics could not be loaded.");
        }
      }
    };

    void loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, []);

  const topEvents = useMemo(() => analytics?.eventCounts.slice(0, 12) ?? [], [analytics]);
  const keyMetrics = useMemo(() => (analytics ? buildKeyMetrics(analytics) : []), [analytics]);

  if (isAdmin === null) {
    return (
      <main className="EdgeTrace-shell py-8">
        <section className="EdgeTrace-command-card p-6">
          <p className="text-sm text-muted">Loading workspace...</p>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="EdgeTrace-shell py-8">
        <section className="EdgeTrace-command-card p-6">
          <h1 className="text-2xl font-semibold">Not found</h1>
          <p className="mt-2 text-sm text-muted">The requested page does not exist.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="EdgeTrace-shell EdgeTrace-admin-analytics py-8">
      <section className="EdgeTrace-admin-analytics-hero">
        <div>
          <div className="EdgeTrace-command-card-heading">
            <span>Admin analytics</span>
          </div>
          <h1>Launch funnel dashboard</h1>
          <p>
            Internal, privacy-conscious product analytics. Sensitive upload, report, trade, and billing payloads stay excluded.
          </p>
        </div>
        {analytics?.generatedAt && (
          <div className="EdgeTrace-admin-generated">
            <span>Last refreshed</span>
            <strong>{formatDate(analytics.generatedAt)}</strong>
          </div>
        )}
      </section>

      {error && <p className="EdgeTrace-admin-alert">{error}</p>}

      {!analytics ? (
        <section className="EdgeTrace-command-card p-6">
          <p className="text-sm text-muted">No analytics available yet.</p>
        </section>
      ) : (
        <div className="EdgeTrace-admin-analytics-stack">
          <section className="EdgeTrace-admin-kpi-grid">
            {keyMetrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </section>

          <section className="EdgeTrace-admin-main-grid">
            <FunnelPanel analytics={analytics} />
            <ConversionPanel analytics={analytics} />
          </section>

          <section className="EdgeTrace-admin-secondary-grid">
            <CountList title="Top events" items={topEvents} />
            <CountList title="Upload failures" items={analytics.uploadFailures} emptyLabel="No upload failures tracked." tone="warning" />
            <CountList title="Report failures" items={analytics.reportFailures} emptyLabel="No report failures tracked." tone="danger" />
            <DailyEventsPanel items={analytics.dailyCounts.slice(-14)} />
          </section>

          <RecentEventsTable analytics={analytics} />
        </div>
      )}
    </main>
  );
}

type KeyMetric = {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: "blue" | "green" | "yellow" | "red";
};

function MetricCard({ metric }: { metric: KeyMetric }) {
  const Icon = metric.icon;
  return (
    <article className={`EdgeTrace-admin-kpi tone-${metric.tone}`}>
      <Icon aria-hidden="true" />
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <p>{metric.helper}</p>
    </article>
  );
}

function FunnelPanel({ analytics }: { analytics: AnalyticsSummary }) {
  const maxCount = Math.max(...analytics.funnelCounts.map((item) => item.count), 1);
  const conversionByTarget = new Map(analytics.conversionRates.map((conversion) => [conversion.to, conversion]));

  return (
    <section className="EdgeTrace-admin-panel EdgeTrace-admin-funnel-panel">
      <PanelHeader icon={TrendingUp} label="Primary funnel" title="Launch path progression" />
      <div className="EdgeTrace-admin-funnel">
        {analytics.funnelCounts.map((item, index) => {
          const conversion = conversionByTarget.get(item.label);
          const barWidth = Math.round((item.count / maxCount) * 100);
          return (
            <div key={item.label} className="EdgeTrace-admin-funnel-step">
              <div className="EdgeTrace-admin-funnel-index">{index + 1}</div>
              <div className="EdgeTrace-admin-funnel-content">
                <div className="EdgeTrace-admin-funnel-row">
                  <div>
                    <strong>{humanizeEventName(item.label)}</strong>
                    {conversion && (
                      <span>
                        {formatPercent(conversion.percent)} from {humanizeEventName(conversion.from)}
                      </span>
                    )}
                  </div>
                  <em>{formatNumber(item.count)}</em>
                </div>
                <div className="EdgeTrace-admin-funnel-track" aria-hidden="true">
                  <span style={{ width: `${barWidth}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ConversionPanel({ analytics }: { analytics: AnalyticsSummary }) {
  return (
    <section className="EdgeTrace-admin-panel">
      <PanelHeader icon={MousePointerClick} label="Step conversion" title="Where users move forward" />
      <div className="EdgeTrace-admin-conversion-list">
        {analytics.conversionRates.map((conversion) => (
          <div key={`${conversion.from}-${conversion.to}`} className="EdgeTrace-admin-conversion-row">
            <div>
              <span>{humanizeEventName(conversion.from)}</span>
              <strong>{humanizeEventName(conversion.to)}</strong>
            </div>
            <em>{formatPercent(conversion.percent)}</em>
            <small>
              {formatNumber(conversion.toCount)} of {formatNumber(conversion.fromCount)}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

function CountList({
  title,
  items,
  emptyLabel = "No events tracked.",
  tone = "blue"
}: {
  title: string;
  items: AnalyticsCount[];
  emptyLabel?: string;
  tone?: "blue" | "warning" | "danger";
}) {
  return (
    <section className={`EdgeTrace-admin-panel EdgeTrace-admin-count-panel tone-${tone}`}>
      <PanelHeader icon={tone === "danger" || tone === "warning" ? AlertTriangle : BarChart3} label={title} />
      {items.length === 0 ? (
        <p className="EdgeTrace-admin-empty">{emptyLabel}</p>
      ) : (
        <div className="EdgeTrace-admin-count-list">
          {items.map((item) => (
            <div key={item.label} className="EdgeTrace-admin-count-row">
              <span>{humanizeEventName(item.label)}</span>
              <strong>{formatNumber(item.count)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DailyEventsPanel({ items }: { items: AnalyticsCount[] }) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);
  return (
    <section className="EdgeTrace-admin-panel EdgeTrace-admin-daily-panel">
      <PanelHeader icon={Activity} label="Daily activity" />
      {items.length === 0 ? (
        <p className="EdgeTrace-admin-empty">No daily events tracked.</p>
      ) : (
        <div className="EdgeTrace-admin-daily-bars">
          {items.map((item) => {
            const barWidth = Math.max(5, Math.round((item.count / maxCount) * 100));
            return (
              <div key={item.label} className="EdgeTrace-admin-daily-row">
                <span>{formatShortDate(item.label)}</span>
                <div aria-hidden="true">
                  <em style={{ width: `${barWidth}%` }} />
                </div>
                <strong>{formatNumber(item.count)}</strong>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RecentEventsTable({ analytics }: { analytics: AnalyticsSummary }) {
  return (
    <section className="EdgeTrace-admin-panel EdgeTrace-admin-events">
      <PanelHeader icon={CheckCircle2} label="Recent events" title="Latest sanitized activity" />
      {analytics.recentEvents.length === 0 ? (
        <p className="EdgeTrace-admin-empty">No recent events tracked.</p>
      ) : (
        <div className="EdgeTrace-admin-events-scroll">
          <table>
            <thead>
            <tr>
              <th>Event</th>
              <th>User</th>
              <th>Properties</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {analytics.recentEvents.map((event) => (
              <tr key={event.id}>
                <td>
                  <strong>{humanizeEventName(event.eventName)}</strong>
                </td>
                <td>
                  <span className="EdgeTrace-admin-user-id">{event.userId || "anonymous"}</span>
                </td>
                <td>
                  <PropertyChips properties={event.properties} />
                </td>
                <td>{formatDate(event.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}

function PanelHeader({ icon: Icon, label, title }: { icon: LucideIcon; label: string; title?: string }) {
  return (
    <div className="EdgeTrace-admin-panel-header">
      <Icon aria-hidden="true" />
      <div>
        <span>{label}</span>
        {title && <strong>{title}</strong>}
      </div>
    </div>
  );
}

function PropertyChips({ properties }: { properties: Record<string, unknown> }) {
  const entries = Object.entries(properties);
  if (entries.length === 0) return <span className="EdgeTrace-admin-empty-inline">None</span>;

  const visibleEntries = entries.slice(0, 4);
  return (
    <div className="EdgeTrace-admin-property-chips">
      {visibleEntries.map(([key, value]) => (
        <span key={key}>
          <b>{key}</b>
          {formatPropertyValue(value)}
        </span>
      ))}
      {entries.length > visibleEntries.length && <span>+{entries.length - visibleEntries.length}</span>}
    </div>
  );
}

function buildKeyMetrics(analytics: AnalyticsSummary): KeyMetric[] {
  const totalEvents = analytics.eventCounts.reduce((sum, item) => sum + item.count, 0);
  return [
    {
      label: "Total events",
      value: formatNumber(totalEvents),
      helper: `${formatNumber(analytics.eventCounts.length)} tracked event types`,
      icon: Activity,
      tone: "blue"
    },
    {
      label: "Landing views",
      value: formatNumber(getCount(analytics.eventCounts, "landing_page_viewed")),
      helper: "Public entry traffic",
      icon: BarChart3,
      tone: "blue"
    },
    {
      label: "Signups",
      value: formatNumber(getCount(analytics.eventCounts, "signup_completed")),
      helper: `${formatNumber(getCount(analytics.eventCounts, "signup_started"))} started`,
      icon: UserPlus,
      tone: "green"
    },
    {
      label: "Uploads",
      value: formatNumber(getCount(analytics.eventCounts, "upload_completed")),
      helper: `${formatNumber(getCount(analytics.eventCounts, "upload_failed"))} failed`,
      icon: UploadCloud,
      tone: getCount(analytics.eventCounts, "upload_failed") > 0 ? "yellow" : "green"
    },
    {
      label: "Reports generated",
      value: formatNumber(getCount(analytics.eventCounts, "report_generation_completed")),
      helper: `${formatNumber(getCount(analytics.eventCounts, "report_viewed"))} report views`,
      icon: CheckCircle2,
      tone: "green"
    },
    {
      label: "Checkout completed",
      value: formatNumber(getCount(analytics.eventCounts, "checkout_completed")),
      helper: `${formatNumber(getCount(analytics.eventCounts, "checkout_started"))} checkout starts`,
      icon: CreditCard,
      tone: "blue"
    }
  ];
}

function getCount(items: AnalyticsCount[], label: string) {
  return items.find((item) => item.label === label)?.count ?? 0;
}

function formatPropertyValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "empty";
  const text = String(value);
  return text.length > 42 ? `${text.slice(0, 39)}...` : text;
}

function humanizeEventName(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

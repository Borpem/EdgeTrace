import { useEffect, useMemo, useState } from "react";
import { getAdminAnalytics, getAdminStatus } from "../lib/api";
import type { AnalyticsCount, AnalyticsSummary } from "../types";

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
    <main className="EdgeTrace-shell py-8">
      <section className="EdgeTrace-command-card p-6">
        <div className="EdgeTrace-command-card-heading">
          <span>Admin analytics</span>
        </div>
        <div className="mt-5">
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">Launch funnel</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Privacy-conscious product analytics from internal EdgeTrace events. Sensitive upload, report, trade, and billing payloads are excluded.
          </p>
          {analytics?.generatedAt && <p className="mt-2 text-xs text-muted">Generated {formatDate(analytics.generatedAt)}</p>}
        </div>

        {error && <p className="mt-5 rounded-md border border-loss/50 bg-loss/10 px-4 py-3 text-sm text-loss">{error}</p>}

        {!analytics ? (
          <div className="mt-6 rounded-md border border-line bg-black/[0.28] p-5 text-sm text-muted">No analytics available yet.</div>
        ) : (
          <div className="mt-6 grid gap-5">
            <CountGrid title="Funnel counts" items={analytics.funnelCounts} />
            <section className="grid gap-4 lg:grid-cols-2">
              <CountGrid title="Top events" items={topEvents} />
              <ConversionPanel analytics={analytics} />
            </section>
            <section className="grid gap-4 lg:grid-cols-3">
              <CountGrid title="Upload failures" items={analytics.uploadFailures} emptyLabel="No upload failures tracked." />
              <CountGrid title="Report failures" items={analytics.reportFailures} emptyLabel="No report failures tracked." />
              <CountGrid title="Daily events" items={analytics.dailyCounts.slice(-14)} emptyLabel="No daily events tracked." />
            </section>
            <RecentEventsTable analytics={analytics} />
          </div>
        )}
      </section>
    </main>
  );
}

function CountGrid({ title, items, emptyLabel = "No events tracked." }: { title: string; items: AnalyticsCount[]; emptyLabel?: string }) {
  return (
    <section className="rounded-md border border-line bg-black/[0.26] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-sky">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="rounded-md border border-white/[0.08] bg-black/[0.26] px-3 py-3">
              <strong className="block text-xl font-semibold text-ink">{item.count}</strong>
              <span className="mt-1 block break-words text-xs text-muted">{humanizeEventName(item.label)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ConversionPanel({ analytics }: { analytics: AnalyticsSummary }) {
  return (
    <section className="rounded-md border border-line bg-black/[0.26] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-sky">Conversion percentages</h2>
      <div className="mt-4 grid gap-2">
        {analytics.conversionRates.map((conversion) => (
          <div key={`${conversion.from}-${conversion.to}`} className="rounded-md border border-white/[0.08] bg-black/[0.22] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">
                {humanizeEventName(conversion.from)} &rarr; {humanizeEventName(conversion.to)}
              </span>
              <strong className="text-sm text-ink">{conversion.percent}%</strong>
            </div>
            <p className="mt-1 text-xs text-muted">
              {conversion.toCount} of {conversion.fromCount}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentEventsTable({ analytics }: { analytics: AnalyticsSummary }) {
  return (
    <section className="rounded-md border border-line bg-black/[0.26] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-sky">Recent events</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="border-b border-line px-3 py-2">Event</th>
              <th className="border-b border-line px-3 py-2">User</th>
              <th className="border-b border-line px-3 py-2">Properties</th>
              <th className="border-b border-line px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {analytics.recentEvents.map((event) => (
              <tr key={event.id} className="border-b border-white/[0.06] last:border-0">
                <td className="px-3 py-3 font-semibold text-ink">{humanizeEventName(event.eventName)}</td>
                <td className="max-w-[14rem] break-all px-3 py-3 text-xs text-muted">{event.userId}</td>
                <td className="max-w-[22rem] break-words px-3 py-3 text-xs text-muted">{formatProperties(event.properties)}</td>
                <td className="px-3 py-3 text-xs text-muted">{formatDate(event.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatProperties(properties: Record<string, unknown>) {
  const entries = Object.entries(properties);
  if (entries.length === 0) return "None";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" | ");
}

function humanizeEventName(value: string) {
  return value.replace(/_/g, " ");
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

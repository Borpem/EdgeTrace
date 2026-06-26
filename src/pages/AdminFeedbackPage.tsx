import { useEffect, useMemo, useState } from "react";
import { getAdminStatus, listAdminFeedback, updateAdminFeedbackStatus } from "../lib/api";
import type { FeedbackItem, FeedbackStatus, FeedbackType } from "../types";

const statusLabels: Record<FeedbackStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  closed: "Closed"
};

const typeLabels: Record<FeedbackType, string> = {
  bug: "Bug",
  suggestion: "Suggestion",
  other: "Other"
};

export function AdminFeedbackPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadFeedback = async () => {
      setError("");
      try {
        const adminStatus = await getAdminStatus();
        if (cancelled) return;
        setIsAdmin(adminStatus.isAdmin);
        if (!adminStatus.isAdmin) return;
        const response = await listAdminFeedback();
        if (!cancelled) setFeedback(response.feedback);
      } catch (err) {
        if (!cancelled) {
          setIsAdmin(false);
          setError(err instanceof Error ? err.message : "Feedback could not be loaded.");
        }
      }
    };

    void loadFeedback();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(
    () => ({
      new: feedback.filter((item) => item.status === "new").length,
      reviewed: feedback.filter((item) => item.status === "reviewed").length,
      closed: feedback.filter((item) => item.status === "closed").length
    }),
    [feedback]
  );

  const updateStatus = async (item: FeedbackItem, status: FeedbackStatus) => {
    if (item.status === status) return;
    setUpdatingId(item.id);
    setError("");
    try {
      const response = await updateAdminFeedbackStatus(item.id, status);
      setFeedback((current) => current.map((entry) => (entry.id === item.id ? response.feedback : entry)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback could not be updated.");
    } finally {
      setUpdatingId("");
    }
  };

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
          <span>Admin feedback</span>
        </div>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">Feedback inbox</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Review bug reports and product suggestions submitted from signed-in accounts.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <CountPill label="New" value={counts.new} tone="red" />
            <CountPill label="Reviewed" value={counts.reviewed} tone="yellow" />
            <CountPill label="Closed" value={counts.closed} tone="green" />
          </div>
        </div>

        {error && <p className="mt-5 rounded-md border border-loss/50 bg-loss/10 px-4 py-3 text-sm text-loss">{error}</p>}

        <div className="mt-6 grid gap-3">
          {feedback.length === 0 ? (
            <div className="rounded-md border border-line bg-black/[0.28] p-5 text-sm text-muted">No feedback submitted yet.</div>
          ) : (
            feedback.map((item) => (
              <article key={item.id} className="rounded-md border border-line bg-black/[0.32] p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`EdgeTrace-feedback-chip tone-${item.type}`}>{typeLabels[item.type]}</span>
                      <span className={`EdgeTrace-feedback-chip status-${item.status}`}>{statusLabels[item.status]}</span>
                      <span className="text-xs text-muted">{formatDate(item.createdAt)}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">{item.message}</p>
                    <div className="mt-4 grid gap-2 text-xs text-muted">
                      <span>{item.userName || item.userEmail || item.userId}</span>
                      {item.userEmail && <span>{item.userEmail}</span>}
                      {item.pageUrl && (
                        <a className="break-all text-sky hover:text-cyan" href={item.pageUrl} target="_blank" rel="noreferrer">
                          {item.pageUrl}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {(["new", "reviewed", "closed"] as FeedbackStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                          item.status === status
                            ? "border-cyan/60 bg-cyan/[0.1] text-cyan"
                            : "border-line bg-black/[0.2] text-muted hover:border-cyan/40 hover:text-ink"
                        }`}
                        disabled={updatingId === item.id}
                        onClick={() => void updateStatus(item, status)}
                      >
                        {statusLabels[status]}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function CountPill({ label, value, tone }: { label: string; value: number; tone: "red" | "yellow" | "green" }) {
  return (
    <div className={`rounded-md border bg-black/[0.3] px-4 py-3 text-center EdgeTrace-feedback-count tone-${tone}`}>
      <strong className="block text-xl font-semibold">{value}</strong>
      <span className="text-[0.66rem] uppercase tracking-[0.14em] text-muted">{label}</span>
    </div>
  );
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

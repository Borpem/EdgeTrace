import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { submitFeedback } from "../lib/api";
import type { FeedbackType, UserProfile } from "../types";

type FeedbackPageProps = {
  profile?: UserProfile | null;
};

const feedbackOptions: Array<{ type: FeedbackType; label: string; description: string }> = [
  { type: "bug", label: "Bug", description: "Something broke, loaded incorrectly, or gave a confusing result." },
  { type: "suggestion", label: "Suggestion", description: "A workflow, visual, or analysis idea that would make EdgeTrace better." },
  { type: "other", label: "Other", description: "Anything else you want to send over." }
];

export function FeedbackPage({ profile }: FeedbackPageProps) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted">("idle");
  const [error, setError] = useState("");

  const selectedOption = useMemo(() => feedbackOptions.find((option) => option.type === type), [type]);
  const canSubmit = message.trim().length >= 5 && status !== "submitting";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");
    setStatus("submitting");
    try {
      await submitFeedback({
        type,
        message: message.trim(),
        pageUrl: window.location.href,
        userAgent: window.navigator.userAgent
      });
      setMessage("");
      setStatus("submitted");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Feedback could not be submitted.");
    }
  };

  return (
    <main className="EdgeTrace-shell py-8">
      <section className="EdgeTrace-command-card p-6">
        <div className="EdgeTrace-command-card-heading">
          <span>Feedback</span>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[0.62fr_0.38fr]">
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Send bugs or suggestions.</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Tell me what broke, what felt confusing, or what would make EdgeTrace more useful. The page URL is attached automatically.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {feedbackOptions.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  className={`rounded-md border p-4 text-left transition ${
                    type === option.type
                      ? "border-cyan/70 bg-cyan/[0.08] text-ink"
                      : "border-line bg-black/[0.28] text-muted hover:border-cyan/40 hover:text-ink"
                  }`}
                  onClick={() => setType(option.type)}
                >
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="mt-2 block text-xs leading-5 text-muted">{option.description}</span>
                </button>
              ))}
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-sky">Details</span>
              <textarea
                className="min-h-[220px] resize-y rounded-md border border-line bg-black/[0.42] p-4 text-sm leading-6 text-ink outline-none transition focus:border-cyan/70 focus:ring-2 focus:ring-cyan/15"
                value={message}
                maxLength={4000}
                placeholder="What happened? What page were you on? What did you expect instead?"
                onChange={(event) => {
                  setMessage(event.target.value);
                  if (status === "submitted") setStatus("idle");
                }}
              />
            </label>

            {error && <p className="rounded-md border border-loss/50 bg-loss/10 px-4 py-3 text-sm text-loss">{error}</p>}
            {status === "submitted" && (
              <p className="rounded-md border border-profit/45 bg-profit/10 px-4 py-3 text-sm text-profit">
                Feedback submitted. Thanks, it is now in the admin review queue.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button className="EdgeTrace-command-primary min-w-[10rem]" type="submit" disabled={!canSubmit}>
                {status === "submitting" ? "Sending..." : "Submit Feedback"}
              </button>
              <span className="text-xs text-muted">{message.trim().length}/4000 characters</span>
            </div>
          </form>

          <aside className="EdgeTrace-command-card p-5">
            <div className="EdgeTrace-command-card-heading">
              <span>Attached context</span>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              <ContextRow label="Category" value={selectedOption?.label ?? "Other"} />
              <ContextRow label="Account" value={profile?.email || profile?.name || "Signed-in user"} />
              <ContextRow label="Current page" value={window.location.pathname} />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-black/[0.28] p-3">
      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <strong className="mt-1 block break-words text-sm font-semibold text-ink">{value}</strong>
    </div>
  );
}

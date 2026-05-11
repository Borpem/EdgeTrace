import { useState } from "react";
import { updateReportDetails } from "../lib/api";
import type { DiagnosticsResult, ReportSummary, ReportType } from "../types";

const reportTypeOptions: Array<{ value: ReportType; label: string }> = [
  { value: "backtest", label: "Backtest" },
  { value: "paper", label: "Paper" },
  { value: "live", label: "Live" },
  { value: "imported", label: "Imported" },
  { value: "unknown", label: "Unknown" }
];

const validReportTypes = new Set(reportTypeOptions.map((option) => option.value));

type EditableReport = Pick<
  DiagnosticsResult | ReportSummary,
  "id" | "name" | "notes" | "tags" | "strategyLabel" | "reportType"
>;

export function ReportDetailsEditor({
  report,
  onCancel,
  onSaved
}: {
  report: EditableReport;
  onCancel: () => void;
  onSaved: (report: ReportSummary) => void;
}) {
  const [name, setName] = useState(report.name ?? "");
  const [notes, setNotes] = useState(report.notes ?? "");
  const [tags, setTags] = useState((report.tags ?? []).join(", "));
  const [strategyLabel, setStrategyLabel] = useState(report.strategyLabel ?? "");
  const [reportType, setReportType] = useState<ReportType>(report.reportType ?? "unknown");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Report name is required.");
      return;
    }
    if (!validReportTypes.has(reportType)) {
      setError("Select a valid report type.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const updated = await updateReportDetails(report.id, {
        name: trimmedName,
        notes: notes.trim(),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .filter((tag, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === tag.toLowerCase()) === index),
        strategyLabel: strategyLabel.trim(),
        reportType
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update report details");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/80 px-4">
      <div className="w-full max-w-2xl rounded-lg border border-line bg-panel p-6 shadow-2xl">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">Report Details</p>
          <h2 className="mt-2 text-2xl font-semibold">Organize diagnostic report</h2>
        </div>

        {error && <div className="mb-4 rounded-md border border-loss/60 bg-loss/10 p-3 text-sm text-loss">{error}</div>}

        <div className="grid gap-4">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Report Name</span>
            <input
              className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.14em] text-muted">Strategy Label</span>
              <input
                className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm text-ink outline-none focus:border-accent"
                placeholder="ORB V1, Mean Reversion, Futures PM"
                value={strategyLabel}
                onChange={(event) => setStrategyLabel(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-[0.14em] text-muted">Report Type</span>
              <select
                className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm text-ink outline-none focus:border-accent"
                value={reportType}
                onChange={(event) => setReportType(event.target.value as ReportType)}
              >
                {reportTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Tags</span>
            <input
              className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              placeholder="ORB, V1, IBKR, high-cost"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted">Separate tags with commas.</p>
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Notes</span>
            <textarea
              className="mt-2 min-h-32 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              placeholder="What changed, what to inspect next, or why this report matters."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="EdgeTrace-compact-secondary"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className="EdgeTrace-compact-primary disabled:opacity-60"
            onClick={() => void save()}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? "Saving..." : "Save Details"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function formatReportType(value: ReportType | undefined) {
  const found = reportTypeOptions.find((option) => option.value === value);
  return found?.label ?? "Unknown";
}

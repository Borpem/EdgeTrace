import { useState } from "react";
import { createSavedComparison, updateSavedComparison } from "../lib/api";
import type { SavedComparison, SavedComparisonInput } from "../types";

export function SavedComparisonEditor({
  comparison,
  defaultInput,
  onCancel,
  onSaved
}: {
  comparison?: SavedComparison;
  defaultInput?: Partial<SavedComparisonInput>;
  onCancel: () => void;
  onSaved: (comparison: SavedComparison) => void;
}) {
  const [name, setName] = useState(comparison?.name ?? defaultInput?.name ?? "");
  const [description, setDescription] = useState(comparison?.description ?? defaultInput?.description ?? "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const reportAId = comparison?.reportAId ?? defaultInput?.reportAId ?? "";
  const reportBId = comparison?.reportBId ?? defaultInput?.reportBId ?? "";

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Comparison name is required.");
      return;
    }
    if (!reportAId || !reportBId || reportAId === reportBId) {
      setError("Select two different reports before saving a comparison.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const payload: SavedComparisonInput = {
        name: trimmedName,
        description: description.trim(),
        reportAId,
        reportBId,
        dimension: comparison?.dimension ?? defaultInput?.dimension,
        groupKey: comparison?.groupKey ?? defaultInput?.groupKey
      };
      const saved = comparison ? await updateSavedComparison(comparison.id, payload) : await createSavedComparison(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save comparison");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/80 px-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-panel p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Saved Comparison</p>
        <h2 className="mt-2 text-2xl font-semibold">{comparison ? "Edit comparison" : "Save comparison"}</h2>
        {error && <div className="mt-4 rounded-md border border-loss/60 bg-loss/10 p-3 text-sm text-loss">{error}</div>}
        <div className="mt-5 grid gap-4">
          <label>
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Name</span>
            <input
              className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Backtest vs Live Validation"
            />
          </label>
          <label>
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Description</span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this comparison should be used to review."
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="EdgeTrace-compact-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="EdgeTrace-compact-primary disabled:opacity-60"
            disabled={isSaving || !name.trim() || !reportAId || !reportBId || reportAId === reportBId}
            onClick={() => void save()}
          >
            {isSaving ? "Saving..." : "Save Comparison"}
          </button>
        </div>
      </div>
    </div>
  );
}

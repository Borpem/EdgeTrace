import { useState } from "react";
import { createCollection, updateCollection } from "../lib/api";
import type { ReportCollectionSummary } from "../types";

export function CollectionEditor({
  collection,
  onCancel,
  onSaved
}: {
  collection?: ReportCollectionSummary;
  onCancel: () => void;
  onSaved: (collection: ReportCollectionSummary) => void;
}) {
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [tags, setTags] = useState((collection?.tags ?? []).join(", "));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Strategy set name is required.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const payload = {
        name: trimmedName,
        description: description.trim(),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .filter((tag, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === tag.toLowerCase()) === index)
      };
      const saved = collection ? await updateCollection(collection.id, payload) : await createCollection(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save strategy set");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/80 px-4">
      <div className="w-full max-w-xl rounded-lg border border-line bg-panel p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Strategy Set</p>
        <h2 className="mt-2 text-2xl font-semibold">{collection ? "Edit strategy set" : "Create strategy set"}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          A strategy set groups related reports so you can track changes across iterations.
        </p>
        {error && <div className="mt-4 rounded-md border border-loss/60 bg-loss/10 p-3 text-sm text-loss">{error}</div>}
        <div className="mt-5 grid gap-4">
          <label>
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Name</span>
            <input
              className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="ORB Strategy Iterations"
            />
          </label>
          <label>
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Description</span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Research objective, market, timeframe, or validation notes."
            />
          </label>
          <label>
            <span className="text-xs uppercase tracking-[0.14em] text-muted">Tags</span>
            <input
              className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="ORB, live, weekly"
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="EdgeTrace-compact-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="EdgeTrace-compact-primary disabled:opacity-60"
            disabled={isSaving || !name.trim()}
            onClick={() => void save()}
          >
            {isSaving ? "Saving..." : "Save Strategy Set"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { addReportToCollection, createCollection, listCollections } from "../lib/api";
import type { ReportCollectionSummary } from "../types";

type ReportTarget = {
  id: string;
  name?: string;
  strategyLabel?: string;
  tags?: string[];
};

export function AddToStrategySetDialog({
  report,
  onCancel,
  onSaved
}: {
  report: ReportTarget;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [collections, setCollections] = useState<ReportCollectionSummary[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listCollections()
      .then(({ collections }) => {
        setCollections(collections);
        setCollectionId(collections[0]?.id ?? "__new");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load strategy sets"));
  }, []);

  const save = async () => {
    setIsSaving(true);
    setError("");
    try {
      const targetId =
        collectionId === "__new" || collections.length === 0
          ? (
              await createCollection({
                name: (newName || `${report.strategyLabel || "Strategy"} Strategy Set`).trim(),
                tags: report.tags
              })
            ).id
          : collectionId;
      await addReportToCollection(targetId, report.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add report to strategy set");
    } finally {
      setIsSaving(false);
    }
  };

  const creatingNew = collectionId === "__new" || collections.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/80 px-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-panel p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Add to Strategy Set</p>
        <h2 className="mt-2 text-2xl font-semibold">{report.name ?? "Diagnostic report"}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          A strategy set groups related reports so you can track changes across iterations.
        </p>
        {error && <div className="mt-4 rounded-md border border-loss/60 bg-loss/10 p-3 text-sm text-loss">{error}</div>}
        <label className="mt-5 block">
          <span className="text-xs uppercase tracking-[0.14em] text-muted">Strategy Set</span>
          <select
            className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
            value={collectionId}
            onChange={(event) => setCollectionId(event.target.value)}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
            <option value="__new">Create new strategy set</option>
          </select>
        </label>
        {creatingNew && (
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-[0.14em] text-muted">New Strategy Set Name</span>
            <input
              className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="ORB Strategy Iterations"
            />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button className="EdgeTrace-compact-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="EdgeTrace-compact-primary disabled:opacity-60"
            disabled={isSaving || (!collectionId && collections.length > 0) || (creatingNew && !newName.trim())}
            onClick={() => void save()}
          >
            {isSaving ? "Adding..." : "Add Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

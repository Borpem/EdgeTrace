import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { CollectionEditor } from "../components/CollectionEditor";
import { CommandPath } from "../components/onboarding/CommandPath";
import { StrategyLoopGraphic } from "../components/visuals/StrategyLoopGraphic";
import { deleteCollection, listCollections } from "../lib/api";
import { canCreateCollection, formatLimit, getPlanConfig } from "../lib/entitlements";
import type { ReportCollectionSummary, UserProfile } from "../types";

export function CollectionsPage({
  profile,
  onOpen,
  onAnalyze
}: {
  profile: UserProfile | null;
  onOpen: (collection: ReportCollectionSummary) => void;
  onAnalyze?: () => void;
}) {
  const [collections, setCollections] = useState<ReportCollectionSummary[]>([]);
  const [editing, setEditing] = useState<ReportCollectionSummary | null | "new">(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setError("");
    setIsLoading(true);
    try {
      const response = await listCollections();
      setCollections(Array.isArray(response.collections) ? response.collections : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load strategy sets. Try refreshing the page.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const plan = getPlanConfig(profile?.planId);
  const canCreateMoreCollections = canCreateCollection(plan, collections.length);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this strategy set? Reports inside it will not be deleted.")) return;
    try {
      await deleteCollection(id);
      setCollections((current) => current.filter((collection) => collection.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete strategy set. Reports were not changed.");
    }
  };

  return (
    <main className="EdgeTrace-shell py-10">
      <div className="EdgeTrace-page-header mb-8 grid gap-8 xl:grid-cols-[1fr_360px] xl:items-end">
        <div>
          <p className="EdgeTrace-eyebrow">Strategy Sets</p>
          <h1 className="EdgeTrace-title">Strategy sets</h1>
          <p className="EdgeTrace-copy">
            Strategy sets group related reports so you can track iterations over time.
          </p>
        </div>
        <div className="EdgeTrace-card-soft relative z-10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Strategy sets</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{collections.length}</p>
          <p className="mt-1 text-sm text-muted">active strategy sets</p>
          <p className="mt-3 text-xs text-muted">
            Plan usage: {collections.length} of {formatLimit(plan.limits.maxCollections)} strategy sets
          </p>
          {!canCreateMoreCollections && <p className="mt-2 text-xs text-warning">Free strategy set limit reached.</p>}
          <button
            className="EdgeTrace-primary-button mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCreateMoreCollections}
            onClick={() => setEditing("new")}
          >
            Create Strategy Set
          </button>
        </div>
      </div>

      {error && <div className="mb-5 rounded-md border border-loss/60 bg-loss/10 p-4 text-loss">{error}</div>}

      {isLoading ? (
        <section className="EdgeTrace-card p-8">
          <p className="font-semibold">Loading strategy sets...</p>
          <p className="mt-2 text-sm text-muted">EdgeTrace is opening your strategy iteration workspace.</p>
        </section>
      ) : collections.length === 0 ? (
        <section className="EdgeTrace-card p-8">
          <StrategyLoopGraphic className="mb-6 max-w-2xl" />
          <p className="text-2xl font-semibold tracking-[-0.04em] text-ink">Group reports into strategy sets.</p>
          <p className="mt-2 text-sm text-muted">
            Strategy sets help you track iterations and understand whether a strategy is improving over time.
          </p>
          <p className="mt-2 text-xs text-muted">
            After you create reports, the workflow guide will point you here to organize related strategy iterations.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="EdgeTrace-primary-button disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canCreateMoreCollections}
              onClick={() => setEditing("new")}
            >
              Create Strategy Set
            </button>
            {onAnalyze && (
              <button className="EdgeTrace-secondary-button" onClick={onAnalyze}>
                Analyze Trades
              </button>
            )}
            <button className="EdgeTrace-secondary-button" onClick={openFeatureGuide}>
              Learn how this works
            </button>
          </div>
          <CommandPath
            className="mt-7"
            context="collections"
            onAnalyze={onAnalyze}
            onCreateStrategySet={() => setEditing("new")}
          />
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {collections.map((collection) => (
            <article key={collection.id} className="EdgeTrace-card p-5 transition hover:border-accent/80">
              <button className="text-left text-xl font-semibold hover:text-cyan" onClick={() => onOpen(collection)}>
                {collection.name}
              </button>
              {collection.description && <p className="mt-3 text-sm leading-6 text-muted">{collection.description}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {collection.tags.map((tag) => (
                  <span key={tag} className="rounded-md border border-line bg-graphite/80 px-2 py-1 text-xs text-muted">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <Metric label="Reports" value={String(collection.reportCount)} />
                <Metric label="Created" value={new Date(collection.createdAt).toLocaleDateString()} />
                <Metric label="Updated" value={new Date(collection.updatedAt).toLocaleDateString()} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="rounded-md border border-line bg-graphite/50 px-3 py-1.5 text-xs hover:border-accent hover:text-cyan" onClick={() => onOpen(collection)}>
                  Open
                </button>
                <button className="rounded-md border border-line bg-graphite/50 px-3 py-1.5 text-xs hover:border-accent hover:text-cyan" onClick={() => setEditing(collection)}>
                  <Pencil className="mr-1 inline" size={13} />
                  Edit
                </button>
                <button className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:border-loss hover:text-loss" onClick={() => void remove(collection.id)}>
                  <Trash2 className="mr-1 inline" size={13} />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {editing && (
        <CollectionEditor
          collection={editing === "new" ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setCollections((current) => {
              const exists = current.some((collection) => collection.id === saved.id);
              return exists
                ? current.map((collection) => (collection.id === saved.id ? saved : collection))
                : [saved, ...current];
            });
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-graphite px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function openFeatureGuide() {
  window.history.pushState(null, "", "/app/how-it-works?feature=strategy-sets");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

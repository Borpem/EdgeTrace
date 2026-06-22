import { useEffect, useMemo, useState } from "react";
import {
  deleteCollectionReviewState,
  getCollection,
  getCollectionReviewStates,
  getReport,
  updateCollectionReviewState
} from "../lib/api";
import { type BreakdownDimension } from "../lib/breakdowns";
import { buildCollectionAttribution } from "../lib/collectionAttribution";
import { buildIterationChangeAttribution } from "../lib/iterationChangeAttribution";
import { buildIterationReviewQueue, formatDriver, type IterationReviewItem } from "../lib/iterationReviewQueue";
import type {
  CollectionReviewState,
  CollectionReviewStatus,
  DiagnosticsResult,
  ReportCollectionDetail
} from "../types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export function CollectionReviewWorkspacePage({
  collectionId,
  onBack,
  onCompare,
  onOpenReport,
  onAttribution
}: {
  collectionId: string;
  onBack: () => void;
  onCompare: (reportAId: string, reportBId: string) => void;
  onOpenReport: (report: DiagnosticsResult) => void;
  onAttribution: (selection: { dimension: BreakdownDimension; group: string }) => void;
}) {
  const [collection, setCollection] = useState<ReportCollectionDetail | null>(null);
  const [reviewStates, setReviewStates] = useState<CollectionReviewState[]>([]);
  const [error, setError] = useState("");
  const [noteTarget, setNoteTarget] = useState<IterationReviewItem | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);

  const load = async () => {
    try {
      const [nextCollection, stateResponse] = await Promise.all([
        getCollection(collectionId),
        getCollectionReviewStates(collectionId)
      ]);
      setCollection(nextCollection);
      setReviewStates(stateResponse.reviewStates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load review workspace");
    }
  };

  useEffect(() => {
    void load();
  }, [collectionId]);

  const queue = useMemo(
    () => (collection ? buildIterationReviewQueue(buildIterationChangeAttribution(collection)) : []),
    [collection]
  );
  const attribution = useMemo(() => (collection ? buildCollectionAttribution(collection) : null), [collection]);

  const stateFor = (item: IterationReviewItem) =>
    reviewStates.find(
      (state) => state.previousReportId === item.previousReportId && state.currentReportId === item.currentReportId
    );
  const statusFor = (item: IterationReviewItem): CollectionReviewStatus => stateFor(item)?.status ?? "open";
  const needsFollowUp = queue.filter((item) => statusFor(item) === "needs_follow_up");
  const reviewed = queue.filter((item) => statusFor(item) === "reviewed");
  const open = queue.filter((item) => statusFor(item) === "open");

  const saveState = async (item: IterationReviewItem, status: CollectionReviewStatus, note?: string) => {
    const existing = stateFor(item);
    const saved = await updateCollectionReviewState(collectionId, {
      previousReportId: item.previousReportId,
      currentReportId: item.currentReportId,
      status,
      note: note ?? existing?.note ?? ""
    });
    setReviewStates((current) => {
      const exists = current.some((state) => state.id === saved.id);
      return exists ? current.map((state) => (state.id === saved.id ? saved : state)) : [saved, ...current];
    });
  };

  const clearState = async (item: IterationReviewItem) => {
    if (!window.confirm("Clear this review state and note?")) return;
    await deleteCollectionReviewState(collectionId, item.previousReportId, item.currentReportId);
    setReviewStates((current) =>
      current.filter(
        (state) => !(state.previousReportId === item.previousReportId && state.currentReportId === item.currentReportId)
      )
    );
  };

  const openReport = async (id: string) => {
    try {
      onOpenReport(await getReport(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open report");
    }
  };

  const attributionTarget = (item: IterationReviewItem) => {
    if (item.source.segmentShift) return item.source.segmentShift;
    const degraded = attribution?.degradationDrivers[0];
    const improved = attribution?.improvementDrivers[0];
    return degraded ?? improved;
  };

  return (
    <main className="EdgeTrace-shell py-10">
      <button className="mb-6 text-sm text-muted hover:text-accent" onClick={onBack}>
        Back to Strategy Set
      </button>
      {error && <div className="mb-5 rounded-md border border-loss/60 bg-loss/10 p-4 text-loss">{error}</div>}
      {!collection ? (
        <p className="text-sm text-muted">Loading review workspace...</p>
      ) : (
        <>
          <section className="EdgeTrace-page-header mb-6">
            <h1 className="max-w-5xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink md:text-6xl">{collection.name}</h1>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <Metric label="Total Items" value={String(queue.length)} />
              <Metric label="Needs Follow-up" value={String(needsFollowUp.length)} tone="warning" />
              <Metric label="Open" value={String(open.length)} />
              <Metric label="Reviewed" value={String(reviewed.length)} tone="accent" />
            </div>
          </section>

          <WorkspaceSection
            title="Needs Follow-up"
            description="Items marked for additional analyst review."
            items={needsFollowUp}
            states={reviewStates}
            tone="warning"
            onCompare={onCompare}
            onOpenReport={(id) => void openReport(id)}
            onSetStatus={(item, status) => void saveState(item, status)}
            onEditNote={setNoteTarget}
            onClearState={(item) => void clearState(item)}
            onAttribution={(item) => {
              const target = attributionTarget(item);
              if (target) onAttribution({ dimension: target.dimension, group: target.group });
            }}
          />

          <WorkspaceSection
            title="Open / Unreviewed"
            description="Queue items that have not been marked reviewed or follow-up."
            items={open}
            states={reviewStates}
            onCompare={onCompare}
            onOpenReport={(id) => void openReport(id)}
            onSetStatus={(item, status) => void saveState(item, status)}
            onEditNote={setNoteTarget}
            onClearState={(item) => void clearState(item)}
            onAttribution={(item) => {
              const target = attributionTarget(item);
              if (target) onAttribution({ dimension: target.dimension, group: target.group });
            }}
          />

          <section className="EdgeTrace-card mt-8 p-5">
            <button className="text-left" onClick={() => setShowReviewed((current) => !current)}>
              <p className="text-sm uppercase tracking-[0.22em] text-muted">Reviewed</p>
              <h2 className="mt-2 text-xl font-semibold">{showReviewed ? "Hide reviewed items" : `Show ${reviewed.length} reviewed items`}</h2>
            </button>
            {showReviewed && (
              <div className="mt-5">
                <WorkspaceSection
                  title=""
                  description=""
                  items={reviewed}
                  states={reviewStates}
                  onCompare={onCompare}
                  onOpenReport={(id) => void openReport(id)}
                  onSetStatus={(item, status) => void saveState(item, status)}
                  onEditNote={setNoteTarget}
                  onClearState={(item) => void clearState(item)}
                  onAttribution={(item) => {
                    const target = attributionTarget(item);
                    if (target) onAttribution({ dimension: target.dimension, group: target.group });
                  }}
                />
              </div>
            )}
          </section>
        </>
      )}

      {noteTarget && (
        <WorkspaceNoteEditor
          item={noteTarget}
          state={stateFor(noteTarget)}
          onCancel={() => setNoteTarget(null)}
          onSaved={(note, status) => {
            void saveState(noteTarget, status, note);
            setNoteTarget(null);
          }}
        />
      )}
    </main>
  );
}

function WorkspaceSection({
  title,
  description,
  items,
  states,
  tone,
  onCompare,
  onOpenReport,
  onSetStatus,
  onEditNote,
  onClearState,
  onAttribution
}: {
  title: string;
  description: string;
  items: IterationReviewItem[];
  states: CollectionReviewState[];
  tone?: "warning";
  onCompare: (reportAId: string, reportBId: string) => void;
  onOpenReport: (id: string) => void;
  onSetStatus: (item: IterationReviewItem, status: CollectionReviewStatus) => void;
  onEditNote: (item: IterationReviewItem) => void;
  onClearState: (item: IterationReviewItem) => void;
  onAttribution: (item: IterationReviewItem) => void;
}) {
  const stateFor = (item: IterationReviewItem) =>
    states.find(
      (state) => state.previousReportId === item.previousReportId && state.currentReportId === item.currentReportId
    );
  return (
    <section className={`EdgeTrace-card mt-8 p-5 ${tone === "warning" ? "border-warning/60" : "border-line"}`}>
      {title && (
        <div className="mb-5">
          <p className="text-sm uppercase tracking-[0.22em] text-accent">{title}</p>
          {description && <p className="mt-2 text-sm text-muted">{description}</p>}
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted">No items in this section.</p>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <WorkspaceCard
              key={item.id}
              item={item}
              state={stateFor(item)}
              onCompare={() => onCompare(item.previousReportId, item.currentReportId)}
              onOpenPrior={() => onOpenReport(item.previousReportId)}
              onOpenCurrent={() => onOpenReport(item.currentReportId)}
              onSetStatus={(status) => onSetStatus(item, status)}
              onEditNote={() => onEditNote(item)}
              onClearState={() => onClearState(item)}
              onAttribution={() => onAttribution(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function WorkspaceCard({
  item,
  state,
  onCompare,
  onOpenPrior,
  onOpenCurrent,
  onSetStatus,
  onEditNote,
  onClearState,
  onAttribution
}: {
  item: IterationReviewItem;
  state?: CollectionReviewState;
  onCompare: () => void;
  onOpenPrior: () => void;
  onOpenCurrent: () => void;
  onSetStatus: (status: CollectionReviewStatus) => void;
  onEditNote: () => void;
  onClearState: () => void;
  onAttribution: () => void;
}) {
  return (
    <article className="EdgeTrace-card-soft p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={item.priorityLabel === "Critical" ? "loss" : item.priorityLabel === "High" ? "warning" : "default"}>{item.priorityLabel}</Badge>
            <Badge>{item.reviewCategory}</Badge>
            <Badge>{formatDriver(item.primaryDriver)}</Badge>
            <Badge>{item.confidence} confidence</Badge>
          </div>
          <h3 className="mt-3 text-lg font-semibold">{item.headline}</h3>
          <p className="mt-1 text-xs text-muted">{item.previousReportName} {"->"} {item.currentReportName}</p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{item.recommendedAction}</p>
          {state?.note && <p className="mt-3 max-w-4xl text-sm leading-6 text-warning">Note: {state.note}</p>}
        </div>
        <div className="grid min-w-full gap-2 text-sm sm:grid-cols-4 xl:min-w-[520px]">
          <Delta label="Net PnL" value={item.source.netPnlDelta} format="currency" lowerIsBetter={false} />
          <Delta label="Expectancy" value={item.source.expectancyDelta} format="currency" lowerIsBetter={false} />
          <Delta label="Cost Drag" value={item.source.costDragDelta} format="percent" lowerIsBetter />
          <Delta label="Average R" value={item.source.averageRDelta} format="number" lowerIsBetter={false} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Action onClick={onCompare}>Compare Reports</Action>
        <Action onClick={onOpenPrior}>Open Prior Report</Action>
        <Action onClick={onOpenCurrent}>Open Current Report</Action>
        <Action onClick={onAttribution}>View Strategy Set Attribution</Action>
        <Action onClick={() => onSetStatus("reviewed")}>Mark Reviewed</Action>
        <Action onClick={() => onSetStatus("needs_follow_up")}>Needs Follow-up</Action>
        <Action onClick={() => onSetStatus("open")}>Reopen</Action>
        <Action onClick={onEditNote}>Edit Note</Action>
        <Action onClick={onClearState} muted>Clear State</Action>
      </div>
    </article>
  );
}

function WorkspaceNoteEditor({
  item,
  state,
  onCancel,
  onSaved
}: {
  item: IterationReviewItem;
  state?: CollectionReviewState;
  onCancel: () => void;
  onSaved: (note: string, status: CollectionReviewStatus) => void;
}) {
  const [note, setNote] = useState(state?.note ?? "");
  const [status, setStatus] = useState<CollectionReviewStatus>(state?.status ?? "needs_follow_up");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/80 px-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-panel p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Workspace Note</p>
        <h2 className="mt-2 text-xl font-semibold">{item.currentReportName}</h2>
        <label className="mt-5 block">
          <span className="text-xs uppercase tracking-[0.14em] text-muted">Status</span>
          <select className="mt-2 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent" value={status} onChange={(event) => setStatus(event.target.value as CollectionReviewStatus)}>
            <option value="open">Open</option>
            <option value="reviewed">Reviewed</option>
            <option value="needs_follow_up">Needs follow-up</option>
          </select>
        </label>
        <textarea
          className="mt-4 min-h-28 w-full rounded-md border border-line bg-graphite px-4 py-3 text-sm outline-none focus:border-accent"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add follow-up context or resolution notes."
        />
        <div className="mt-6 flex justify-end gap-3">
          <button className="EdgeTrace-compact-secondary" onClick={onCancel}>Cancel</button>
          <button className="EdgeTrace-compact-primary" onClick={() => onSaved(note, status)}>Save Note</button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "accent" | "warning" }) {
  const stripeTone = tone === "accent" ? "tone-green" : tone === "warning" ? "tone-yellow" : "tone-gray";
  return (
    <div className={`EdgeTrace-card-soft EdgeTrace-drilldown-stripe ${stripeTone} px-3 py-2`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={`mt-1 font-semibold ${tone === "accent" ? "text-accent" : tone === "warning" ? "text-warning" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Delta({ label, value, format, lowerIsBetter }: { label: string; value?: number; format: "currency" | "percent" | "number"; lowerIsBetter: boolean }) {
  const neutral = value === undefined || Math.abs(value) < 0.0001;
  const improved = !neutral && (lowerIsBetter ? value < 0 : value > 0);
  const formatted = value === undefined ? "N/A" : format === "currency" ? currency.format(value) : format === "percent" ? percent.format(value) : value.toFixed(2);
  return (
    <div className={`EdgeTrace-drilldown-stripe ${neutral ? "tone-gray" : improved ? "tone-green" : "tone-red"} border border-white/[0.08] bg-black/25 px-3 py-2`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-semibold ${neutral ? "" : improved ? "text-accent" : "text-loss"}`}>{formatted}</p>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "default" | "warning" | "loss" }) {
  return (
    <span className={`rounded-md border px-2 py-1 text-xs ${tone === "warning" ? "border-warning/70 text-warning" : tone === "loss" ? "border-loss/70 text-loss" : "border-line text-muted"}`}>
      {children}
    </span>
  );
}

function Action({ children, onClick, muted }: { children: React.ReactNode; onClick: () => void; muted?: boolean }) {
  return (
    <button className={`rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent ${muted ? "text-muted" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

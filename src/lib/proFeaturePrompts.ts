import type { FeatureKey } from "./plans";

export type ProFeaturePromptState = {
  feature: FeatureKey;
  title: string;
  description: string;
  learnPath: string;
};

export type ProFeaturePromptInput = {
  feature: FeatureKey;
  title?: string;
  description?: string;
  learnPath?: string;
};

const defaultProFeaturePrompts: Partial<Record<FeatureKey, Omit<ProFeaturePromptState, "feature">>> = {
  full_drilldowns: {
    title: "Upgrade to Pro to unlock drilldowns.",
    description: "Pro shows the exact symbols, strategies, time windows, and trades behind the primary leak.",
    learnPath: "drilldowns"
  },
  collection_attribution: {
    title: "Upgrade to Pro to unlock strategy-set attribution.",
    description: "Pro shows which symbols, strategies, and time buckets are driving improvement or degradation across reports.",
    learnPath: "strategy-sets"
  },
  advanced_attribution: {
    title: "Upgrade to Pro to unlock full attribution.",
    description: "Pro explains the report-to-report drivers behind performance changes and where to inspect next.",
    learnPath: "drilldowns"
  },
  aggregate_benchmarks: {
    title: "This feature is unavailable in the current release.",
    description: "This option is not included in the current launch.",
    learnPath: "how-review-loop"
  },
  mistake_heatmap: {
    title: "Upgrade to Pro to unlock the mistake heatmap.",
    description: "Pro shows where losses, cost drag, and weak trade clusters repeat by weekday and session.",
    learnPath: "how-review-loop"
  },
  review_cadence: {
    title: "Upgrade to Pro to unlock the review loop.",
    description: "Pro turns repeated imports into recurring edge reviews and next-upload targets.",
    learnPath: "how-review-loop"
  },
  reconstruction_audit: {
    title: "Upgrade to Pro to review reconstruction lineage.",
    description: "Pro unlocks the audit showing which source executions created each completed trade and enables audit exports.",
    learnPath: "reconstruction-audit"
  }
};

export function buildProFeaturePrompt(
  feature: FeatureKey,
  override: Partial<Omit<ProFeaturePromptState, "feature">> = {}
): ProFeaturePromptState {
  const base = defaultProFeaturePrompts[feature] ?? {
    title: "Upgrade to Pro to unlock this feature.",
    description: "This workflow is included with Pro.",
    learnPath: proFeatureLearnPath(feature)
  };
  return { feature, ...base, ...override };
}

export function proFeatureLearnPath(feature: FeatureKey | string) {
  const value = String(feature);
  const aliases: Record<string, string> = {
    full_drilldowns: "drilldowns",
    advanced_attribution: "drilldowns",
    full_compare: "compare",
    strategy_sets: "strategy-sets",
    collections: "strategy-sets",
    collection_attribution: "strategy-sets",
    reconstruction_audit: "reconstruction-audit",
    export_audit: "exports",
    audit_exports: "exports",
    strategy_health_monitoring: "strategy-monitoring",
    review_cadence: "how-review-loop",
    aggregate_benchmarks: "how-review-loop",
    mistake_heatmap: "how-review-loop",
    broker_imports: "broker-imports"
  };
  return aliases[value] ?? value.replace(/_/g, "-");
}

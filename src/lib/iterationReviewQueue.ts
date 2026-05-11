import {
  formatDriver,
  type ChangeClassification,
  type ChangeConfidence,
  type ChangeDriver,
  type IterationChangeSummary
} from "./iterationChangeAttribution";

export type PriorityLabel = "Critical" | "High" | "Medium" | "Low";
export type ReviewCategory =
  | "Major degradation"
  | "Hidden degradation"
  | "Material improvement"
  | "Mixed signal"
  | "Low-confidence change"
  | "Stability check";

export type IterationReviewItem = {
  id: string;
  previousReportId: string;
  currentReportId: string;
  previousReportName: string;
  currentReportName: string;
  priorityScore: number;
  priorityLabel: PriorityLabel;
  reviewCategory: ReviewCategory;
  primaryDriver: ChangeDriver;
  changeClassification: ChangeClassification;
  confidence: ChangeConfidence;
  headline: string;
  explanation: string;
  recommendedAction: string;
  actions: Array<"compare" | "open_current" | "open_prior">;
  source: IterationChangeSummary;
};

export function buildIterationReviewQueue(changes: IterationChangeSummary[]): IterationReviewItem[] {
  return changes
    .map((change) => {
      const priorityScore = scoreChange(change);
      return {
        id: `${change.previousReportId}-${change.currentReportId}`,
        previousReportId: change.previousReportId,
        currentReportId: change.currentReportId,
        previousReportName: change.previousReportName,
        currentReportName: change.currentReportName,
        priorityScore,
        priorityLabel: priorityLabel(priorityScore),
        reviewCategory: reviewCategory(change, priorityScore),
        primaryDriver: change.primaryChangeDriver,
        changeClassification: change.changeClassification,
        confidence: change.confidence,
        headline: buildHeadline(change),
        explanation: change.explanation,
        recommendedAction: buildRecommendedAction(change),
        actions: ["compare", "open_current", "open_prior"] as IterationReviewItem["actions"],
        source: change
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

function scoreChange(change: IterationChangeSummary) {
  let score = 0;
  if (change.changeClassification === "degraded") score += 35;
  if (change.changeClassification === "mixed") score += 25;
  if (change.changeClassification === "improved") score += 20;
  if (change.netPnlDelta < -25) score += 20;
  if (change.expectancyDelta < -0.05) score += 20;
  if ((change.costDragDelta ?? 0) > 0.05) score += 15;
  if ((change.averageRDelta ?? 0) < -0.05) score += 15;
  if ((change.largeLossConcentrationDelta ?? 0) > 0.08) score += 15;
  if (change.confidence === "high") score += 10;
  if (change.confidence === "medium") score += 5;
  if (change.primaryChangeDriver === "large_loss_increase") score += 10;
  if (change.primaryChangeDriver === "cost_increase") score += 10;
  if (change.primaryChangeDriver === "r_capture_deterioration") score += 10;
  if (change.confidence === "low") score -= 10;
  if (change.changeClassification === "flat") score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function priorityLabel(score: number): PriorityLabel {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}

function reviewCategory(change: IterationChangeSummary, score: number): ReviewCategory {
  if (change.confidence === "low") return "Low-confidence change";
  if (change.changeClassification === "degraded" && score >= 60) return "Major degradation";
  if (change.changeClassification === "mixed" && change.netPnlDelta > 0 && change.expectancyDelta < 0) return "Hidden degradation";
  if (change.changeClassification === "improved" && score >= 35) return "Material improvement";
  if (change.changeClassification === "mixed") return "Mixed signal";
  return "Stability check";
}

function buildHeadline(change: IterationChangeSummary) {
  const current = change.currentReportName;
  const driver = formatDriver(change.primaryChangeDriver);
  if (change.confidence === "low") return `${current} has low-confidence attribution; verify before acting.`;
  if (change.changeClassification === "degraded") return `${current} degraded materially due to ${driver}.`;
  if (change.changeClassification === "improved" && (change.costDragDelta ?? 0) > 0.03) {
    return `${current} improved, but cost drag increased.`;
  }
  if (change.changeClassification === "improved") return `${current} improved primarily from ${driver}.`;
  if (change.changeClassification === "mixed" && change.netPnlDelta > 0 && change.expectancyDelta < 0) {
    return `${current} deserves review: net PnL improved while expectancy weakened.`;
  }
  if (change.changeClassification === "mixed") return `${current} shows mixed iteration signals.`;
  return `${current} appears stable versus the prior report.`;
}

function buildRecommendedAction(change: IterationChangeSummary) {
  if (change.confidence === "low") return "Open comparison and verify attribution manually.";
  if (change.primaryChangeDriver === "cost_increase") return "Inspect cost-heavy symbols and compare execution quality.";
  if (change.primaryChangeDriver === "r_capture_deterioration") return "Inspect realized R distribution and losing trade size.";
  if (change.primaryChangeDriver === "large_loss_increase") return "Review largest losing trades and stop discipline.";
  if (change.changeClassification === "improved") return "Compare against prior report and preserve the changes that reduced leakage.";
  if (change.primaryChangeDriver === "segment_mix_shift") return "Review segment-level attribution to identify which group drove the transition.";
  return change.recommendedAction;
}

export { formatDriver } from "./iterationChangeAttribution";

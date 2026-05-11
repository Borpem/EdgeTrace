import type { ReportCollectionDetail } from "../types";
import { buildCollectionAnalytics } from "./collectionAnalytics";
import { detectStrategyRegressions } from "./regressionDetection";

export type StrategyReviewDigest = {
  periodLabel: string;
  summary: string;
  highlights: string[];
  warnings: string[];
  recommendedActions: string[];
};

export function buildStrategyReviewDigest(collection: ReportCollectionDetail): StrategyReviewDigest {
  const analytics = buildCollectionAnalytics(collection);
  const regressions = detectStrategyRegressions(collection);
  const latest = analytics.latestReport;

  if (!latest || analytics.reportCount < 2) {
    return {
      periodLabel: "Latest Strategy Review",
      summary: "This strategy set needs at least two reports before EdgeTrace can produce a reliable recurring review.",
      highlights: [],
      warnings: ["Insufficient report history for iteration review."],
      recommendedActions: ["Create another diagnostic report for the same strategy and add it to this strategy set."]
    };
  }

  const highlights: string[] = [];
  const warnings: string[] = [];
  const recommendedActions: string[] = [];

  if (analytics.trendDirection === "improving") {
    highlights.push("Recent reports show improving strategy health across core metrics.");
  }
  if ((latest.expectancy ?? 0) > 0) highlights.push("Latest expectancy is positive after available costs.");
  if ((latest.netPnl ?? 0) > 0) highlights.push("Latest report is net profitable.");

  for (const regression of regressions) {
    warnings.push(regression.title);
    recommendedActions.push(regression.recommendedAction);
  }
  for (const flag of analytics.warningFlags) warnings.push(flag);

  const summary =
    regressions.length > 0
      ? `${latest.name} needs review: ${regressions[0].explanation}`
      : analytics.primaryCollectionInsight;

  return {
    periodLabel: "Latest Strategy Review",
    summary,
    highlights: unique(highlights).slice(0, 4),
    warnings: unique(warnings).slice(0, 5),
    recommendedActions: unique(recommendedActions.length ? recommendedActions : ["Compare the latest report against the prior iteration and preserve changes supported by evidence."]).slice(0, 4)
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

import { timeOfDayBucket } from "./breakdowns";
import type { NormalizedTrade } from "../types";

export type MatchedTradePair = {
  tradeA: NormalizedTrade;
  tradeB: NormalizedTrade;
  confidenceScore: number;
  confidenceLabel: "High" | "Medium" | "Low" | "Manual";
  matchReasons: string[];
  reviewState: "auto" | "approved" | "rejected" | "manually_matched";
  audit: {
    symbolMatch: boolean;
    sideMatch: boolean;
    strategyMatch: boolean;
    timeBucketMatch: boolean;
    entryTimeDifferenceMinutes?: number;
    reportATimeBucket: string;
    reportBTimeBucket: string;
  };
  grossPnlDelta: number;
  netPnlDelta: number;
  costDelta: number;
  realizedRDelta?: number;
  entryPriceDelta?: number;
  exitPriceDelta?: number;
  classifications: string[];
};

export type TradePairingResult = {
  matched: MatchedTradePair[];
  onlyA: NormalizedTrade[];
  onlyB: NormalizedTrade[];
  summary: {
    matchedCount: number;
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
    averageConfidence: number;
    onlyACount: number;
    onlyBCount: number;
    removedNetPnl: number;
    addedNetPnl: number;
    averageRemovedNetPnl: number;
    averageAddedNetPnl: number;
  };
  attribution: string;
};

export function pairTrades(tradesA: NormalizedTrade[], tradesB: NormalizedTrade[]): TradePairingResult {
  const unmatchedB = new Set(tradesB.map((_, index) => index));
  const matched: MatchedTradePair[] = [];
  const onlyA: NormalizedTrade[] = [];

  tradesA.forEach((tradeA) => {
    const matchIndex = bestMatchIndex(tradeA, tradesB, unmatchedB);
    if (matchIndex === undefined) {
      onlyA.push(tradeA);
      return;
    }

    unmatchedB.delete(matchIndex);
    matched.push(buildPair(tradeA, tradesB[matchIndex], "auto"));
  });

  const onlyB = [...unmatchedB].map((index) => tradesB[index]);
  const summary = {
    matchedCount: matched.length,
    highConfidenceCount: matched.filter((pair) => pair.confidenceLabel === "High").length,
    mediumConfidenceCount: matched.filter((pair) => pair.confidenceLabel === "Medium").length,
    lowConfidenceCount: matched.filter((pair) => pair.confidenceLabel === "Low").length,
    averageConfidence: average(matched.map((pair) => pair.confidenceScore)),
    onlyACount: onlyA.length,
    onlyBCount: onlyB.length,
    removedNetPnl: sum(onlyA.map((trade) => trade.netPnl)),
    addedNetPnl: sum(onlyB.map((trade) => trade.netPnl)),
    averageRemovedNetPnl: average(onlyA.map((trade) => trade.netPnl)),
    averageAddedNetPnl: average(onlyB.map((trade) => trade.netPnl))
  };

  return {
    matched,
    onlyA,
    onlyB,
    summary,
    attribution: buildAttribution(matched, summary)
  };
}

function bestMatchIndex(
  tradeA: NormalizedTrade,
  tradesB: NormalizedTrade[],
  unmatchedB: Set<number>
) {
  const candidates = [...unmatchedB]
    .map((index) => ({ index, tradeB: tradesB[index], score: matchScore(tradeA, tradesB[index]) }))
    .filter((candidate) => candidate.score !== undefined)
    .sort((a, b) => a.score! - b.score!);

  return candidates[0]?.index;
}

function matchScore(tradeA: NormalizedTrade, tradeB: NormalizedTrade) {
  if (tradeA.symbol !== tradeB.symbol) return undefined;
  if (tradeA.side !== tradeB.side) return undefined;
  if (tradeA.strategy && tradeB.strategy && tradeA.strategy !== tradeB.strategy) return undefined;
  if (timeOfDayBucket(tradeA.entryTime) !== timeOfDayBucket(tradeB.entryTime)) return undefined;

  const timeDelta = Math.abs(new Date(tradeA.entryTime).getTime() - new Date(tradeB.entryTime).getTime());
  if (Number.isNaN(timeDelta)) return 0;
  return timeDelta;
}

export function createManualPair(tradeA: NormalizedTrade, tradeB: NormalizedTrade): MatchedTradePair {
  return buildPair(tradeA, tradeB, "manually_matched");
}

function buildPair(
  tradeA: NormalizedTrade,
  tradeB: NormalizedTrade,
  reviewState: MatchedTradePair["reviewState"]
): MatchedTradePair {
  const grossPnlDelta = tradeB.grossPnl - tradeA.grossPnl;
  const netPnlDelta = tradeB.netPnl - tradeA.netPnl;
  const costDelta = tradeB.estimatedCosts - tradeA.estimatedCosts;
  const realizedRDelta =
    tradeA.realizedR === undefined || tradeB.realizedR === undefined
      ? undefined
      : tradeB.realizedR - tradeA.realizedR;
  const entryPriceDelta = tradeB.entryPrice - tradeA.entryPrice;
  const exitPriceDelta =
    tradeA.exitPrice === undefined || tradeB.exitPrice === undefined
      ? undefined
      : tradeB.exitPrice - tradeA.exitPrice;
  const confidence =
    reviewState === "manually_matched" ? manualConfidence(tradeA, tradeB) : scoreConfidence(tradeA, tradeB);

  return {
    tradeA,
    tradeB,
    ...confidence,
    reviewState,
    grossPnlDelta,
    netPnlDelta,
    costDelta,
    realizedRDelta,
    entryPriceDelta,
    exitPriceDelta,
    classifications: classifyPair(tradeA, tradeB, netPnlDelta, costDelta, realizedRDelta)
  };
}

function manualConfidence(tradeA: NormalizedTrade, tradeB: NormalizedTrade) {
  return {
    confidenceScore: 100,
    confidenceLabel: "Manual",
    matchReasons: ["User manually matched these trades"],
    audit: {
      symbolMatch: tradeA.symbol === tradeB.symbol,
      sideMatch: tradeA.side === tradeB.side,
      strategyMatch: Boolean(tradeA.strategy && tradeB.strategy && tradeA.strategy === tradeB.strategy),
      timeBucketMatch: timeOfDayBucket(tradeA.entryTime) === timeOfDayBucket(tradeB.entryTime),
      entryTimeDifferenceMinutes: entryDifferenceMinutes(tradeA, tradeB),
      reportATimeBucket: timeOfDayBucket(tradeA.entryTime),
      reportBTimeBucket: timeOfDayBucket(tradeB.entryTime)
    }
  } satisfies Pick<MatchedTradePair, "confidenceScore" | "confidenceLabel" | "matchReasons" | "audit">;
}

function classifyPair(
  tradeA: NormalizedTrade,
  tradeB: NormalizedTrade,
  netPnlDelta: number,
  costDelta: number,
  realizedRDelta: number | undefined
) {
  const classifications: string[] = [];
  classifications.push(netPnlDelta >= 0 ? "Better net result" : "Worse net result");
  if (Math.abs(costDelta) > 0.01) classifications.push(costDelta < 0 ? "Lower cost" : "Higher cost");
  if (realizedRDelta !== undefined && Math.abs(realizedRDelta) > 0.05) {
    classifications.push(realizedRDelta > 0 ? "Better R capture" : "Worse R capture");
  }
  const entryQuality = priceQualityDelta(tradeA.side, tradeA.entryPrice, tradeB.entryPrice, "entry");
  if (entryQuality) classifications.push(entryQuality);
  if (tradeA.exitPrice !== undefined && tradeB.exitPrice !== undefined) {
    const exitQuality = priceQualityDelta(tradeA.side, tradeA.exitPrice, tradeB.exitPrice, "exit");
    if (exitQuality) classifications.push(exitQuality);
  }
  return classifications;
}

function priceQualityDelta(
  side: NormalizedTrade["side"],
  priceA: number,
  priceB: number,
  type: "entry" | "exit"
) {
  const delta = priceB - priceA;
  if (Math.abs(delta) < 0.01) return undefined;
  const better =
    type === "entry"
      ? side === "long"
        ? delta < 0
        : delta > 0
      : side === "long"
        ? delta > 0
        : delta < 0;
  if (type === "entry") return better ? "Better entry" : "Worse entry";
  return better ? "Better exit" : "Worse exit";
}

function buildAttribution(matched: MatchedTradePair[], summary: TradePairingResult["summary"]) {
  const matchedNetDelta = sum(matched.map((pair) => pair.netPnlDelta));
  const matchedCostDelta = sum(matched.map((pair) => pair.costDelta));
  const matchedRDelta = average(
    matched.map((pair) => pair.realizedRDelta).filter((value): value is number => value !== undefined)
  );

  const confidenceContext =
    summary.lowConfidenceCount > Math.max(1, summary.matchedCount * 0.25)
      ? "Matched-trade attribution should be treated cautiously because several pairs are low-confidence."
      : summary.highConfidenceCount >= summary.matchedCount * 0.6
        ? "Matched-trade attribution is based mostly on high-confidence pairs."
        : "Matched-trade attribution is based on mixed-confidence heuristic pairs.";

  if (summary.removedNetPnl < 0 && Math.abs(summary.removedNetPnl) > Math.abs(matchedNetDelta)) {
    return `Report B improved primarily because weak trades from Report A were removed. ${confidenceContext}`;
  }

  if (summary.onlyBCount > 0 && summary.averageAddedNetPnl < summary.averageRemovedNetPnl) {
    return `Report B degraded because added trades had weaker average net PnL. ${confidenceContext}`;
  }

  if (matched.length > 0 && matchedCostDelta < 0 && Math.abs(matchedCostDelta) > Math.abs(matchedNetDelta) * 0.25) {
    return `Matched trades improved mostly through lower costs. ${confidenceContext}`;
  }

  if (matched.length > 0 && matchedRDelta > 0.1) {
    return `Matched trades improved mostly through better R-multiple capture. ${confidenceContext}`;
  }

  const entryQualityCount = matched.filter((pair) => pair.classifications.includes("Better entry")).length;
  const exitQualityCount = matched.filter((pair) => pair.classifications.includes("Better exit")).length;
  if (entryQualityCount > matched.length / 2) {
    return `Matched trades improved mostly through better entry quality. ${confidenceContext}`;
  }
  if (exitQualityCount > matched.length / 2) {
    return `Matched trades improved mostly through better exit quality. ${confidenceContext}`;
  }

  if (summary.onlyACount + summary.onlyBCount > matched.length) {
    return `The change appears driven more by trade selection than execution quality. ${confidenceContext}`;
  }

  return `The change appears split across matched trade quality and trade selection. ${confidenceContext}`;
}

function scoreConfidence(tradeA: NormalizedTrade, tradeB: NormalizedTrade) {
  const reasons: string[] = [];
  let score = 0;
  const reportATimeBucket = timeOfDayBucket(tradeA.entryTime);
  const reportBTimeBucket = timeOfDayBucket(tradeB.entryTime);
  const entryTimeDifferenceMinutes = entryDifferenceMinutes(tradeA, tradeB);
  const symbolMatch = tradeA.symbol === tradeB.symbol;
  const sideMatch = tradeA.side === tradeB.side;
  const strategyMatch = Boolean(tradeA.strategy && tradeB.strategy && tradeA.strategy === tradeB.strategy);
  const timeBucketMatch = reportATimeBucket === reportBTimeBucket;

  if (symbolMatch) {
    score += 25;
    reasons.push("Same symbol");
  }
  if (sideMatch) {
    score += 15;
    reasons.push("Same side");
  }
  if (strategyMatch) {
    score += 15;
    reasons.push("Same strategy");
  }
  if (timeBucketMatch) {
    score += 15;
    reasons.push("Same time bucket");
  }
  if (entryTimeDifferenceMinutes !== undefined && entryTimeDifferenceMinutes <= 30) {
    score += 10;
    reasons.push("Entry times within 30 minutes");
  } else if (entryTimeDifferenceMinutes !== undefined && entryTimeDifferenceMinutes <= 60) {
    score += 5;
    reasons.push("Entry times within 60 minutes");
  }

  const confidenceScore = Math.min(score, 100);
  return {
    confidenceScore,
    confidenceLabel: confidenceScore >= 80 ? "High" : confidenceScore >= 60 ? "Medium" : "Low",
    matchReasons: reasons,
    audit: {
      symbolMatch,
      sideMatch,
      strategyMatch,
      timeBucketMatch,
      entryTimeDifferenceMinutes,
      reportATimeBucket,
      reportBTimeBucket
    }
  } satisfies Pick<MatchedTradePair, "confidenceScore" | "confidenceLabel" | "matchReasons" | "audit">;
}

function entryDifferenceMinutes(tradeA: NormalizedTrade, tradeB: NormalizedTrade) {
  const left = new Date(tradeA.entryTime).getTime();
  const right = new Date(tradeB.entryTime).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return undefined;
  return Math.abs(left - right) / 60000;
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

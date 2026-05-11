import type { NormalizedTrade } from "../types";
import type { FieldMapping, ImportDetection } from "./importAdapters";

export const ibkrFieldCandidates: Record<string, string[]> = {
  symbol: ["Symbol", "Underlying", "Description"],
  rawSide: ["Buy/Sell", "Side", "Action"],
  entryTime: ["Date/Time", "Date Time", "Trade Date/Time", "Trade Date"],
  entryPrice: ["T. Price", "Trade Price", "Price"],
  quantity: ["Quantity", "Qty"],
  commission: ["Commission", "Comm/Fee", "Commissions"],
  fees: ["Fee", "Fees"],
  actualPnl: ["Realized P/L", "Realized P&L", "Realized PNL", "Realized PnL"],
  currency: ["Currency"],
  assetCategory: ["Asset Category"],
  brokerOrderId: ["IB Order ID", "Order ID"],
  brokerExecutionId: ["IB Execution ID", "Execution ID", "Exec ID"],
  openCloseIndicator: ["Open/Close Indicator", "O/C", "Open/Close"]
};

const ibkrSignals = [
  "asset category",
  "date/time",
  "t. price",
  "trade price",
  "comm/fee",
  "realized p/l",
  "realized p&l",
  "realized pnl",
  "buy/sell",
  "open/close indicator",
  "ib order id",
  "ib execution id",
  "proceeds",
  "basis"
];

export function detectIbkr(headers: string[]): ImportDetection | undefined {
  const normalizedHeaders = headers.map(normalizeHeader);
  const matchedSignals = ibkrSignals.filter((signal) => normalizedHeaders.includes(normalizeHeader(signal)));
  if (matchedSignals.length < 3) return undefined;

  const isFlex = normalizedHeaders.some((header) =>
    ["iborderid", "ibexecutionid", "opencloseindicator"].includes(header)
  );

  return {
    type: isFlex ? "ibkr_flex_query" : "ibkr_activity_statement",
    label: isFlex ? "Interactive Brokers Flex CSV" : "Interactive Brokers Activity/Flex CSV",
    confidence: Math.min(98, 65 + matchedSignals.length * 6)
  };
}

export function createIbkrMappings(headers: string[]): FieldMapping[] {
  const usedTargets = new Set<string>();
  return headers.map((sourceColumn) => {
    const target = findIbkrTarget(sourceColumn, usedTargets);
    if (target) usedTargets.add(target);

    return {
      sourceColumn,
      targetField: target,
      confidence: target ? (isExactIbkrCandidate(sourceColumn, target) ? 95 : 80) : 0,
      status: target ? "mapped" : "unmapped"
    };
  });
}

function findIbkrTarget(sourceColumn: string, usedTargets: Set<string>) {
  const normalized = normalizeHeader(sourceColumn);
  const match = Object.entries(ibkrFieldCandidates).find(([, candidates]) =>
    candidates.some((candidate) => normalizeHeader(candidate) === normalized)
  );
  if (!match || usedTargets.has(match[0])) return undefined;
  return match[0] as keyof NormalizedTrade | "rawSide";
}

function isExactIbkrCandidate(sourceColumn: string, target: string) {
  return ibkrFieldCandidates[target]?.some((candidate) => normalizeHeader(candidate) === normalizeHeader(sourceColumn));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

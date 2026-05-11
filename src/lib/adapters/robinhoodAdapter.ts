import type { NormalizedTrade } from "../../types";
import type { EdgeTraceField, FieldMapping, ImportDetection } from "../importAdapters";

export type ExcludedImportRow = {
  rowNumber: number;
  reason: string;
  action: string;
  description: string;
};

export type PreparedRobinhoodRows = {
  rows: Record<string, unknown>[];
  excludedRows: ExcludedImportRow[];
};

const robinhoodFieldCandidates: Record<string, string[]> = {
  symbol: ["Symbol", "Instrument"],
  rawSide: ["Action", "Type", "Trans Code", "Transaction Type"],
  entryTime: ["Activity Date", "Transaction Date", "Date", "Process Date", "Acquired Date"],
  entryPrice: ["Price"],
  quantity: ["Quantity"],
  fees: ["Fees"],
  commission: ["Commission"],
  actualPnl: ["Realized Gain/Loss", "Realized Gain Loss", "Realized P/L", "Amount"],
  currency: ["Currency"],
  description: ["Description"],
  proceeds: ["Proceeds"],
  costBasis: ["Cost Basis"],
  exitTime: ["Sold Date", "Sale Date"],
  brokerImportId: ["Account"]
};

const robinhoodSignals = [
  "activity date",
  "process date",
  "transaction date",
  "instrument",
  "trans code",
  "realized gain/loss",
  "proceeds",
  "cost basis",
  "amount"
];

const nonTradeActions = [
  "dividend",
  "interest",
  "transfer",
  "deposit",
  "withdrawal",
  "journal",
  "fee",
  "ach",
  "cash",
  "card",
  "acat"
];

export function detectRobinhood(headers: string[], sampleRows: unknown[]): ImportDetection | undefined {
  const normalizedHeaders = headers.map(normalizeHeader);
  const matchedSignals = robinhoodSignals.filter((signal) => normalizedHeaders.includes(normalizeHeader(signal)));
  const hasActivityShape =
    hasAny(normalizedHeaders, ["activitydate", "transactiondate", "date"]) &&
    hasAny(normalizedHeaders, ["instrument", "description", "symbol"]) &&
    hasAny(normalizedHeaders, ["amount", "quantity", "price"]);
  const hasTaxLotShape = hasAny(normalizedHeaders, ["proceeds"]) && hasAny(normalizedHeaders, ["costbasis", "realizedgainloss"]);

  const sampleText = sampleRows
    .filter(Array.isArray)
    .slice(1, 8)
    .flat()
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  const hasRobinhoodActivity = ["dividend", "deposit", "withdrawal", "bought", "sold"].some((token) =>
    sampleText.includes(token)
  );

  if (matchedSignals.length < 3 && !hasActivityShape && !hasTaxLotShape) return undefined;

  const confidence = Math.min(94, 55 + matchedSignals.length * 7 + (hasRobinhoodActivity ? 10 : 0));
  return {
    type: confidence >= 75 ? "robinhood" : "robinhood_potential",
    label: confidence >= 75 ? "Robinhood CSV" : "Potential Robinhood export detected",
    confidence
  };
}

export function createRobinhoodMappings(headers: string[]): FieldMapping[] {
  const usedTargets = new Set<string>();
  return headers.map((sourceColumn) => {
    const target = findTarget(sourceColumn, usedTargets);
    if (target) usedTargets.add(target);
    return {
      sourceColumn,
      targetField: target,
      confidence: target ? (target === "actualPnl" && normalizeHeader(sourceColumn) === "amount" ? 55 : 88) : 0,
      status: target ? "mapped" : "unmapped"
    };
  });
}

export function prepareRobinhoodRows(rows: unknown[], mappings: FieldMapping[]): PreparedRobinhoodRows {
  const headers = getHeaders(rows);
  const dataRows = rows.filter(Array.isArray).slice(1) as unknown[][];
  const activeMappings = mappings.filter((mapping) => mapping.targetField && mapping.status !== "required_missing");
  const preparedRows: Record<string, unknown>[] = [];
  const excludedRows: ExcludedImportRow[] = [];

  dataRows.forEach((row, index) => {
    const mapped = Object.fromEntries(
      activeMappings.map((mapping) => [mapping.targetField, row[headers.indexOf(mapping.sourceColumn)]])
    ) as Record<string, unknown>;
    const action = String(mapped.rawSide ?? "").trim();
    const description = String(mapped.description ?? mapped.symbol ?? "").trim();
    const exclusion = exclusionReason(action, description);
    if (exclusion) {
      excludedRows.push({ rowNumber: index + 2, reason: exclusion, action, description });
      return;
    }

    const quantity = Math.abs(toNumber(mapped.quantity) ?? 0);
    const proceeds = toNumber(mapped.proceeds);
    const costBasis = toNumber(mapped.costBasis);
    const realizedPnl = toNumber(mapped.actualPnl);
    const hasTaxLot = proceeds !== undefined && costBasis !== undefined && quantity > 0;

    if (hasTaxLot) {
      preparedRows.push({
        ...mapped,
        rawSide: sideFromAction(action) ?? "buy",
        entryTime: mapped.entryTime,
        exitTime: mapped.exitTime || mapped.entryTime,
        entryPrice: Math.abs(costBasis / quantity),
        exitPrice: Math.abs(proceeds / quantity),
        quantity,
        actualPnl: realizedPnl ?? proceeds - costBasis,
        commission: Math.abs(toNumber(mapped.commission) ?? 0),
        fees: Math.abs(toNumber(mapped.fees) ?? 0)
      });
      return;
    }

    preparedRows.push({
      ...mapped,
      rawSide: sideFromAction(action) ?? mapped.rawSide,
      quantity,
      commission: Math.abs(toNumber(mapped.commission) ?? 0),
      fees: Math.abs(toNumber(mapped.fees) ?? 0),
      actualPnl: realizedPnl
    });
  });

  return { rows: preparedRows, excludedRows };
}

export function robinhoodWarnings(excludedRows: ExcludedImportRow[]) {
  if (!excludedRows.length) return [];
  const counts = excludedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.reason] = (acc[row.reason] ?? 0) + 1;
    return acc;
  }, {});
  return [`${excludedRows.length} Robinhood non-trade activity rows were excluded: ${Object.entries(counts).map(([reason, count]) => `${count} ${reason}`).join(", ")}.`];
}

function findTarget(sourceColumn: string, usedTargets: Set<string>) {
  const normalized = normalizeHeader(sourceColumn);
  const match = Object.entries(robinhoodFieldCandidates).find(([, candidates]) =>
    candidates.some((candidate) => normalizeHeader(candidate) === normalized)
  );
  if (!match || usedTargets.has(match[0])) return undefined;
  return match[0] as keyof NormalizedTrade | "rawSide";
}

function exclusionReason(action: string, description: string) {
  const text = `${action} ${description}`.toLowerCase();
  return nonTradeActions.find((token) => text.includes(token));
}

function sideFromAction(action: string) {
  const normalized = action.trim().toLowerCase();
  if (["buy", "bought"].includes(normalized)) return "buy";
  if (["sell", "sold"].includes(normalized)) return "sell";
  if (["sell short", "short sale"].includes(normalized)) return "sell short";
  if (["buy to cover", "cover"].includes(normalized)) return "buy to cover";
  return undefined;
}

function getHeaders(rows: unknown[]) {
  const first = rows.find(Array.isArray) as unknown[] | undefined;
  return first?.map((value) => String(value ?? "").trim()) ?? [];
}

function hasAny(headers: string[], candidates: string[]) {
  return candidates.some((candidate) => headers.includes(normalizeHeader(candidate)));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  const negative = /^\(.*\)$/.test(text);
  const parsed = Number(text.replace(/[()$,\s]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : undefined;
}

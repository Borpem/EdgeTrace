import type { NormalizedTrade } from "../../types";
import type { EdgeTraceField, FieldMapping } from "../importAdapters";
import type { ExcludedImportRow } from "./robinhoodAdapter";

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseBrokerNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  const negative = /^\(.*\)$/.test(text);
  const parsed = Number(text.replace(/[()$,\s]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : undefined;
}

export function normalizeBrokerAction(action: string) {
  const normalized = action.trim().toLowerCase();
  if (["buy", "bought", "bot", "you bought"].includes(normalized)) return "buy";
  if (["sell", "sold", "sld", "you sold"].includes(normalized)) return "sell";
  if (["sell short", "sold short", "short sale"].includes(normalized)) return "sell short";
  if (["buy to cover", "bought to cover", "cover"].includes(normalized)) return "buy to cover";
  return undefined;
}

export function isNonTradeActivity(action: string, description: string) {
  const text = `${action} ${description}`.toLowerCase();
  return [
    "dividend",
    "interest",
    "transfer",
    "deposit",
    "withdrawal",
    "journal",
    "fee",
    "ach",
    "cash",
    "moneylink",
    "wire",
    "reinvestment",
    "cancelled",
    "canceled",
    "rejected",
    "expired",
    "failed",
    "pending"
  ].find((token) => text.includes(token));
}

export function combineDateTime(date: unknown, time: unknown) {
  const dateText = String(date ?? "").trim();
  const timeText = String(time ?? "").trim();
  if (!dateText) return "";
  return timeText ? `${dateText} ${timeText}` : dateText;
}

export function detectHeaderConfidence(headers: string[], signals: string[], base = 50, weight = 7) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const matches = signals.filter((signal) => normalizedHeaders.includes(normalizeHeader(signal))).length;
  return { matches, confidence: Math.min(96, base + matches * weight) };
}

export function mapKnownFields(headers: string[], candidates: Record<string, string[]>) {
  const usedTargets = new Set<string>();
  return headers.map((sourceColumn) => {
    const target = findTarget(sourceColumn, candidates, usedTargets);
    if (target) usedTargets.add(target);
    return {
      sourceColumn,
      targetField: target,
      confidence: target ? confidenceFor(sourceColumn, target) : 0,
      status: target ? ("mapped" as const) : ("unmapped" as const)
    };
  });
}

export function prepareMappedBrokerRows(
  rows: unknown[],
  mappings: FieldMapping[],
  options: {
    getExtraFields?: (row: unknown[], headers: string[]) => Record<string, unknown>;
    getExclusionReason?: (mapped: Record<string, unknown>) => string | undefined;
  } = {}
) {
  const headers = getHeaders(rows);
  const dataRows = rows.filter(Array.isArray).slice(1) as unknown[][];
  const activeMappings = mappings.filter((mapping) => mapping.targetField && mapping.status !== "required_missing");
  const preparedRows: Record<string, unknown>[] = [];
  const excludedRows: ExcludedImportRow[] = [];

  dataRows.forEach((row, index) => {
    const mapped = Object.fromEntries(
      activeMappings.map((mapping) => [mapping.targetField, row[headers.indexOf(mapping.sourceColumn)]])
    ) as Record<string, unknown>;
    Object.assign(mapped, options.getExtraFields?.(row, headers) ?? {});

    const action = String(mapped.rawSide ?? "").trim();
    const description = String(mapped.description ?? mapped.symbol ?? "").trim();
    const exclusion = options.getExclusionReason?.(mapped) ?? isNonTradeActivity(action, description);
    if (exclusion) {
      excludedRows.push({ rowNumber: index + 2, reason: exclusion, action, description });
      return;
    }

    const quantity = Math.abs(parseBrokerNumber(mapped.quantity) ?? 0);
    const proceeds = parseBrokerNumber(mapped.proceeds);
    const costBasis = parseBrokerNumber(mapped.costBasis);
    const realizedPnl = parseBrokerNumber(mapped.actualPnl);
    const hasTaxLot = proceeds !== undefined && costBasis !== undefined && quantity > 0;

    if (hasTaxLot) {
      preparedRows.push({
        ...mapped,
        rawSide: normalizeBrokerAction(action) ?? "buy",
        exitTime: mapped.exitTime || mapped.entryTime,
        entryPrice: Math.abs(costBasis / quantity),
        exitPrice: Math.abs(proceeds / quantity),
        quantity,
        actualPnl: realizedPnl ?? proceeds - costBasis,
        commission: Math.abs(parseBrokerNumber(mapped.commission) ?? 0),
        fees: Math.abs(parseBrokerNumber(mapped.fees) ?? 0)
      });
      return;
    }

    preparedRows.push({
      ...mapped,
      rawSide: normalizeBrokerAction(action) ?? mapped.rawSide,
      quantity,
      commission: Math.abs(parseBrokerNumber(mapped.commission) ?? 0),
      fees: Math.abs(parseBrokerNumber(mapped.fees) ?? 0),
      actualPnl: realizedPnl
    });
  });

  return { rows: preparedRows, excludedRows };
}

export function brokerExclusionWarnings(brokerName: string, excludedRows: ExcludedImportRow[]) {
  if (!excludedRows.length) return [];
  const counts = excludedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.reason] = (acc[row.reason] ?? 0) + 1;
    return acc;
  }, {});
  return [`${excludedRows.length} ${brokerName} non-trade activity rows were excluded: ${Object.entries(counts).map(([reason, count]) => `${count} ${reason}`).join(", ")}.`];
}

export function getHeaders(rows: unknown[]) {
  const first = rows.find(Array.isArray) as unknown[] | undefined;
  return first?.map((value) => String(value ?? "").trim()) ?? [];
}

export function hasAny(headers: string[], candidates: string[]) {
  return candidates.some((candidate) => headers.includes(normalizeHeader(candidate)));
}

export function valueByHeader(row: unknown[], headers: string[], candidates: string[]) {
  const index = headers.findIndex((header) => candidates.some((candidate) => normalizeHeader(candidate) === normalizeHeader(header)));
  return index >= 0 ? row[index] : undefined;
}

function findTarget(sourceColumn: string, candidates: Record<string, string[]>, usedTargets: Set<string>) {
  const normalized = normalizeHeader(sourceColumn);
  const match = Object.entries(candidates).find(([, fieldCandidates]) =>
    fieldCandidates.some((candidate) => normalizeHeader(candidate) === normalized)
  );
  if (!match || usedTargets.has(match[0])) return undefined;
  return match[0] as keyof NormalizedTrade | "rawSide";
}

function confidenceFor(sourceColumn: string, target: string) {
  if (target === "actualPnl" && ["amount", "netamount"].includes(normalizeHeader(sourceColumn))) return 55;
  return 88;
}

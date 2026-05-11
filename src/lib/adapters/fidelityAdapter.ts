import type { FieldMapping, ImportDetection } from "../importAdapters";
import {
  brokerExclusionWarnings,
  combineDateTime,
  detectHeaderConfidence,
  hasAny,
  mapKnownFields,
  normalizeHeader,
  prepareMappedBrokerRows,
  valueByHeader
} from "./adapterUtils";
import type { ExcludedImportRow } from "./robinhoodAdapter";

const fidelityFieldCandidates = {
  symbol: ["Symbol"],
  rawSide: ["Action", "Type"],
  entryTime: ["Trade Date", "Transaction Date", "Run Date", "Date"],
  entryPrice: ["Price"],
  quantity: ["Quantity"],
  commission: ["Commission"],
  fees: ["Fees"],
  actualPnl: ["Amount"],
  description: ["Security Description", "Description"],
  assetCategory: ["Security Type"],
  account: ["Account"],
  settlementDate: ["Settlement Date"]
};

const fidelitySignals = [
  "run date",
  "account",
  "action",
  "symbol",
  "security description",
  "security type",
  "quantity",
  "price",
  "commission",
  "fees",
  "amount",
  "settlement date",
  "trade date",
  "transaction date",
  "type",
  "description"
];

export function detectFidelity(headers: string[], rows: unknown[]): ImportDetection | undefined {
  const normalizedHeaders = headers.map(normalizeHeader);
  const { matches, confidence } = detectHeaderConfidence(headers, fidelitySignals, 48, 6);
  const hasExecutionShape =
    hasAny(normalizedHeaders, ["action", "type"]) &&
    hasAny(normalizedHeaders, ["symbol"]) &&
    hasAny(normalizedHeaders, ["quantity"]) &&
    hasAny(normalizedHeaders, ["price"]);
  const hasActivityShape =
    hasAny(normalizedHeaders, ["tradedate", "settlementdate", "transactiondate"]) &&
    hasAny(normalizedHeaders, ["securitydescription", "description"]) &&
    hasAny(normalizedHeaders, ["amount"]);
  const hasRunShape = hasAny(normalizedHeaders, ["rundate"]) && hasAny(normalizedHeaders, ["account"]) && hasAny(normalizedHeaders, ["action"]);
  const sampleText = rows.filter(Array.isArray).slice(1, 8).flat().map((value) => String(value ?? "").toLowerCase()).join(" ");
  const hasFidelityActions = ["you bought", "you sold", "dividend received", "bought to cover"].some((token) => sampleText.includes(token));
  const hasFidelitySpecific = hasAny(normalizedHeaders, ["rundate", "securitydescription", "securitytype"]) || hasFidelityActions;

  if (!hasFidelitySpecific) return undefined;
  if (matches < 4 && !hasExecutionShape && !hasActivityShape && !hasRunShape) return undefined;

  return {
    type: "fidelity",
    label: "Fidelity CSV",
    confidence: Math.min(96, confidence + (hasExecutionShape ? 10 : 0) + (hasFidelityActions ? 8 : 0))
  };
}

export function createFidelityMappings(headers: string[]) {
  return mapKnownFields(headers, fidelityFieldCandidates);
}

export function prepareFidelityRows(rows: unknown[], mappings: FieldMapping[]) {
  return prepareMappedBrokerRows(rows, mappings, {
    getExtraFields: (row, headers) => ({
      entryTime: combineDateTime(
        valueByHeader(row, headers, ["Trade Date", "Transaction Date", "Run Date", "Date"]),
        valueByHeader(row, headers, ["Time"])
      )
    })
  });
}

export function fidelityWarnings(excludedRows: ExcludedImportRow[]) {
  return brokerExclusionWarnings("Fidelity", excludedRows);
}

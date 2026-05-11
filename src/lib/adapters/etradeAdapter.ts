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

const etradeFieldCandidates = {
  symbol: ["Symbol"],
  rawSide: ["Action", "Transaction Type"],
  entryTime: ["Transaction Date"],
  quantity: ["Quantity"],
  entryPrice: ["Price"],
  commission: ["Commission"],
  fees: ["Fees"],
  actualPnl: ["Amount", "Net Amount"],
  description: ["Description"],
  account: ["Account"],
  settlementDate: ["Settlement Date"],
  brokerOrderId: ["Order Number"],
  brokerExecutionId: ["Execution ID"],
  cusip: ["CUSIP"]
};

const etradeSignals = [
  "transaction date",
  "settlement date",
  "action",
  "symbol",
  "description",
  "quantity",
  "price",
  "commission",
  "fees",
  "amount",
  "net amount",
  "account",
  "transaction type",
  "order number",
  "execution id",
  "cusip"
];

export function detectEtrade(headers: string[], rows: unknown[]): ImportDetection | undefined {
  const normalizedHeaders = headers.map(normalizeHeader);
  const { matches, confidence } = detectHeaderConfidence(headers, etradeSignals, 48, 6);
  const hasEtradeSpecific = hasAny(normalizedHeaders, ["transactiondate"]) && hasAny(normalizedHeaders, ["ordernumber", "executionid"]);
  const hasExecutionShape =
    hasAny(normalizedHeaders, ["symbol"]) &&
    hasAny(normalizedHeaders, ["action", "transactiontype"]) &&
    hasAny(normalizedHeaders, ["quantity"]) &&
    hasAny(normalizedHeaders, ["price"]);
  const sampleText = rows.filter(Array.isArray).slice(1, 8).flat().map((value) => String(value ?? "").toLowerCase()).join(" ");
  const hasEtradeActions = ["bought", "sold", "sold short", "bought to cover"].some((token) => sampleText.includes(token));

  if (!hasEtradeSpecific) return undefined;
  if (matches < 4 && !hasExecutionShape) return undefined;

  return {
    type: "etrade",
    label: "E*TRADE CSV",
    confidence: Math.min(96, confidence + (hasExecutionShape ? 10 : 0) + (hasEtradeActions ? 6 : 0))
  };
}

export function createEtradeMappings(headers: string[]) {
  return mapKnownFields(headers, etradeFieldCandidates);
}

export function prepareEtradeRows(rows: unknown[], mappings: FieldMapping[]) {
  return prepareMappedBrokerRows(rows, mappings, {
    getExtraFields: (row, headers) => ({
      entryTime: combineDateTime(valueByHeader(row, headers, ["Transaction Date"]), undefined)
    })
  });
}

export function etradeWarnings(excludedRows: ExcludedImportRow[]) {
  return brokerExclusionWarnings("E*TRADE", excludedRows);
}

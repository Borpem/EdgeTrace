import type { ImportDetection } from "../importAdapters";
import type { FieldMapping } from "../importAdapters";
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

const schwabFieldCandidates = {
  symbol: ["Symbol", "Instrument"],
  rawSide: ["Action", "Type"],
  entryTime: ["Date", "Trade Date"],
  entryPrice: ["Price"],
  quantity: ["Quantity"],
  actualPnl: ["Amount", "Net Amount"],
  fees: ["Commissions & Fees", "Fees"],
  commission: ["Commission"],
  description: ["Description"],
  account: ["Account"],
  cusip: ["CUSIP"],
  settlementDate: ["Settlement Date"]
};

const schwabSignals = [
  "date",
  "time",
  "symbol",
  "description",
  "action",
  "type",
  "quantity",
  "price",
  "amount",
  "commissions & fees",
  "net amount",
  "account",
  "instrument",
  "cusip",
  "trade date",
  "settlement date"
];

export function detectSchwab(headers: string[], rows: unknown[]): ImportDetection | undefined {
  const normalizedHeaders = headers.map(normalizeHeader);
  if (hasAny(normalizedHeaders, ["transactiondate"]) && hasAny(normalizedHeaders, ["ordernumber", "executionid"])) {
    return undefined;
  }
  const { matches, confidence } = detectHeaderConfidence(headers, schwabSignals, 48, 6);
  const hasExecutionShape =
    hasAny(normalizedHeaders, ["symbol"]) &&
    hasAny(normalizedHeaders, ["action", "type"]) &&
    hasAny(normalizedHeaders, ["quantity"]) &&
    hasAny(normalizedHeaders, ["price"]);
  const hasActivityShape =
    hasAny(normalizedHeaders, ["date", "tradedate"]) &&
    hasAny(normalizedHeaders, ["action", "type"]) &&
    hasAny(normalizedHeaders, ["symbol"]) &&
    hasAny(normalizedHeaders, ["amount", "netamount"]);
  const hasSchwabSpecific = hasAny(normalizedHeaders, ["commissionsfees", "netamount", "cusip"]);
  const sampleText = rows.filter(Array.isArray).slice(1, 8).flat().map((value) => String(value ?? "").toLowerCase()).join(" ");
  const hasTosActions = ["bot", "sld", "buy to cover", "sell short"].some((token) => sampleText.includes(token));

  if (!hasSchwabSpecific && !hasTosActions) return undefined;
  if (matches < 4 && !hasExecutionShape && !hasActivityShape) return undefined;

  return {
    type: "schwab",
    label: "Schwab / Thinkorswim CSV",
    confidence: Math.min(96, confidence + (hasExecutionShape ? 10 : 0) + (hasTosActions ? 8 : 0))
  };
}

export function createSchwabMappings(headers: string[]) {
  return mapKnownFields(headers, schwabFieldCandidates);
}

export function prepareSchwabRows(rows: unknown[], mappings: FieldMapping[]) {
  return prepareMappedBrokerRows(rows, mappings, {
    getExtraFields: (row, headers) => ({
      entryTime: combineDateTime(
        valueByHeader(row, headers, ["Trade Date", "Date"]),
        valueByHeader(row, headers, ["Time"])
      )
    })
  });
}

export function schwabWarnings(excludedRows: ExcludedImportRow[]) {
  return brokerExclusionWarnings("Schwab/Thinkorswim", excludedRows);
}

export function isSchwabTransactionLevel(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  return hasAny(normalizedHeaders, ["action", "type"]) && hasAny(normalizedHeaders, ["amount", "netamount"]);
}

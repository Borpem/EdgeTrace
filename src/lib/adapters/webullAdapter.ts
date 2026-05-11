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

const webullFieldCandidates = {
  symbol: ["Symbol"],
  rawSide: ["Side", "Action"],
  entryTime: ["Filled Time", "Executed Time", "Placed Time"],
  quantity: ["Filled Quantity", "Quantity"],
  entryPrice: ["Avg Price", "Price"],
  fees: ["Fees"],
  commission: ["Commission"],
  actualPnl: ["Total", "Amount"],
  currency: ["Currency"],
  brokerOrderId: ["Order ID"],
  brokerExecutionId: ["Trade ID"],
  description: ["Name"],
  orderType: ["Order Type"],
  status: ["Status"]
};

const webullSignals = [
  "symbol",
  "name",
  "side",
  "action",
  "filled time",
  "placed time",
  "filled quantity",
  "avg price",
  "order type",
  "status",
  "total",
  "order id",
  "trade id",
  "executed time"
];

export function detectWebull(headers: string[], rows: unknown[]): ImportDetection | undefined {
  const normalizedHeaders = headers.map(normalizeHeader);
  const { matches, confidence } = detectHeaderConfidence(headers, webullSignals, 48, 6);
  const hasWebullSpecific = hasAny(normalizedHeaders, ["filledtime", "placedtime", "filledquantity", "avgprice", "orderid", "tradeid"]);
  const hasExecutionShape =
    hasAny(normalizedHeaders, ["symbol"]) &&
    hasAny(normalizedHeaders, ["side", "action"]) &&
    hasAny(normalizedHeaders, ["filledquantity", "quantity"]) &&
    hasAny(normalizedHeaders, ["avgprice", "price"]);
  const sampleText = rows.filter(Array.isArray).slice(1, 8).flat().map((value) => String(value ?? "").toLowerCase()).join(" ");
  const hasWebullStatus = ["filled", "cancelled", "rejected"].some((token) => sampleText.includes(token));

  if (!hasWebullSpecific && !hasWebullStatus) return undefined;
  if (matches < 4 && !hasExecutionShape) return undefined;

  return {
    type: "webull",
    label: "Webull CSV",
    confidence: Math.min(96, confidence + (hasExecutionShape ? 10 : 0) + (hasWebullStatus ? 6 : 0))
  };
}

export function createWebullMappings(headers: string[]) {
  return mapKnownFields(headers, webullFieldCandidates);
}

export function prepareWebullRows(rows: unknown[], mappings: FieldMapping[]) {
  return prepareMappedBrokerRows(rows, mappings, {
    getExtraFields: (row, headers) => ({
      entryTime: combineDateTime(
        valueByHeader(row, headers, ["Filled Time", "Executed Time", "Placed Time"]),
        undefined
      )
    }),
    getExclusionReason: (mapped) => {
      const status = String(mapped.status ?? "").trim().toLowerCase();
      if (["cancelled", "canceled", "rejected", "expired", "failed", "pending"].some((token) => status.includes(token))) {
        return status || "incomplete";
      }
      return undefined;
    }
  });
}

export function webullWarnings(excludedRows: ExcludedImportRow[]) {
  return brokerExclusionWarnings("Webull", excludedRows);
}

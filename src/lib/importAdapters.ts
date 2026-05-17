import type { NormalizedTrade } from "../types";
import { adapterForDetection, detectBrokerAdapter } from "./brokerAdapters";

export type ImportType =
  | "generic_csv"
  | "ibkr_activity_statement"
  | "ibkr_flex_query"
  | "robinhood"
  | "robinhood_potential"
  | "schwab"
  | "fidelity"
  | "webull"
  | "etrade";
export type MappingStatus = "mapped" | "unmapped" | "optional" | "required_missing";
export type EdgeTraceField = keyof NormalizedTrade | "rawSide";

export type ImportDetection = {
  type: ImportType;
  label: string;
  confidence: number;
};

export type FieldMapping = {
  sourceColumn: string;
  targetField?: EdgeTraceField;
  confidence: number;
  status: MappingStatus;
};

export const edgeTraceFieldOptions: Array<{ value: EdgeTraceField | ""; label: string }> = [
  { value: "", label: "Do not import" },
  { value: "symbol", label: "Symbol" },
  { value: "rawSide", label: "Side" },
  { value: "entryTime", label: "Entry time" },
  { value: "exitTime", label: "Exit time" },
  { value: "entryPrice", label: "Entry price" },
  { value: "exitPrice", label: "Exit price" },
  { value: "quantity", label: "Quantity" },
  { value: "commission", label: "Commission" },
  { value: "fees", label: "Fees" },
  { value: "actualPnl", label: "Actual PnL" },
  { value: "strategy", label: "Strategy" },
  { value: "plannedStop", label: "Planned stop" },
  { value: "plannedTarget", label: "Planned target" },
  { value: "currency", label: "Currency" },
  { value: "assetCategory", label: "Asset category" },
  { value: "brokerOrderId", label: "IB order ID" },
  { value: "brokerExecutionId", label: "IB execution ID" },
  { value: "openCloseIndicator", label: "Open/close" },
  { value: "brokerImportId", label: "Broker import ID" },
  { value: "description", label: "Description" },
  { value: "account", label: "Account" },
  { value: "cusip", label: "CUSIP" },
  { value: "settlementDate", label: "Settlement date" },
  { value: "orderType", label: "Order type" },
  { value: "status", label: "Status" },
  { value: "proceeds", label: "Proceeds" },
  { value: "costBasis", label: "Cost basis" }
];

const requiredTargets: EdgeTraceField[] = ["symbol", "rawSide", "entryTime", "entryPrice", "quantity"];

export function getCsvHeaders(rows: unknown[]) {
  const first = rows.find(Array.isArray) as unknown[] | undefined;
  return first?.map((value) => String(value ?? "").trim()) ?? [];
}

export function getCsvDataRows(rows: unknown[]) {
  return rows.filter(Array.isArray).slice(1) as unknown[][];
}

export function detectImport(headers: string[], rows: unknown[]): ImportDetection {
  return detectBrokerAdapter(headers, rows).detection;
}

export function createFieldMappings(headers: string[], detection: ImportDetection): FieldMapping[] {
  const mappings = adapterForDetection(detection).getFieldMappings(headers);
  return applyRequiredStatuses(mappings, detection);
}

export function applyMappings(rows: unknown[], mappings: FieldMapping[]) {
  const headers = getCsvHeaders(rows);
  const dataRows = getCsvDataRows(rows);
  const activeMappings = mappings.filter((mapping) => mapping.targetField && mapping.status !== "required_missing");
  return dataRows.map((row) =>
    Object.fromEntries(activeMappings.map((mapping) => [mapping.targetField, row[headers.indexOf(mapping.sourceColumn)]]))
  );
}

export function updateMapping(mappings: FieldMapping[], sourceColumn: string, targetField: EdgeTraceField | "") {
  const next = mappings.map((mapping) =>
    mapping.sourceColumn === sourceColumn
      ? {
          ...mapping,
          targetField: targetField || undefined,
          confidence: targetField ? mapping.confidence || 70 : 0,
          status: targetField ? ("mapped" as const) : ("unmapped" as const)
        }
      : mapping
  );
  return applyRequiredStatuses(next);
}

export function getImportWarnings(
  detection: ImportDetection,
  mappings: FieldMapping[],
  normalizedTradeCount: number
) {
  const targets = new Set(mappings.map((mapping) => mapping.targetField).filter(Boolean));
  const warnings: string[] = [];
  const missing = requiredTargets.filter((target) => !targets.has(target));
  if (missing.length) warnings.push(`Required mapping missing: ${missing.map(formatTarget).join(", ")}.`);
  if (!targets.has("exitPrice") && !targets.has("actualPnl")) {
    warnings.push("Exit price and realized PnL are missing, so PnL may be incomplete.");
  }
  if (detection.type === "ibkr_activity_statement" || detection.type === "ibkr_flex_query") {
    warnings.push("This IBKR file appears to contain execution-level records. EdgeTrace can reconstruct completed trades from executions.");
  }
  if (detection.type === "robinhood" || detection.type === "robinhood_potential") {
    warnings.push("Robinhood activity exports can include non-trade cash activity. EdgeTrace excludes recognized non-trade rows before diagnostics.");
  }
  if (detection.type === "schwab") {
    warnings.push("Schwab/Thinkorswim activity exports can include non-trade cash activity. EdgeTrace excludes recognized non-trade rows before diagnostics.");
  }
  if (detection.type === "fidelity") {
    warnings.push("Fidelity activity exports can include non-trade cash activity. EdgeTrace excludes recognized non-trade rows before diagnostics.");
  }
  if (detection.type === "webull") {
    warnings.push("Webull order exports can include incomplete or non-trade rows. EdgeTrace excludes recognized cancelled and non-trade rows before diagnostics.");
  }
  if (detection.type === "etrade") {
    warnings.push("E*TRADE activity exports can include non-trade cash activity. EdgeTrace excludes recognized non-trade rows before diagnostics.");
  }
  if (!targets.has("commission") && !targets.has("fees")) warnings.push("Cost fields were not mapped, so cost drag may be understated.");
  if (!targets.has("strategy")) warnings.push("Strategy tags are missing, so strategy breakdowns may be limited.");
  if (!targets.has("plannedStop")) warnings.push("R-multiple analysis is unavailable because planned stop is missing.");
  if (normalizedTradeCount === 0 && !missing.length) warnings.push("No analyzable trades were produced from the current mapping.");
  return warnings;
}

function applyRequiredStatuses(mappings: FieldMapping[], detection?: ImportDetection): FieldMapping[] {
  const sourceMappings = mappings.filter((mapping) => mapping.status !== "required_missing");
  const mappedTargets = new Set(sourceMappings.map((mapping) => mapping.targetField).filter(Boolean));
  const activeRequiredTargets =
    detection &&
    (detection.type === "robinhood" || detection.type === "robinhood_potential") &&
    mappedTargets.has("proceeds") &&
    mappedTargets.has("costBasis")
      ? (["symbol", "entryTime", "quantity", "proceeds", "costBasis"] as EdgeTraceField[])
      : requiredTargets;
  const reviewedMappings: FieldMapping[] = sourceMappings.map((mapping) => {
    if (mapping.targetField) return { ...mapping, status: "mapped" as const };
    return { ...mapping, status: "unmapped" as const };
  });
  const missingMappings: FieldMapping[] = activeRequiredTargets
    .filter((target) => !mappedTargets.has(target))
    .map((target) => ({
      sourceColumn: `Missing: ${formatTarget(target)}`,
      targetField: target,
      confidence: 0,
      status: "required_missing"
    }));
  return [...reviewedMappings, ...missingMappings];
}

function formatTarget(target: EdgeTraceField) {
  return edgeTraceFieldOptions.find((option) => option.value === target)?.label ?? target;
}

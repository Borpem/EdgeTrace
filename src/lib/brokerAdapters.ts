import {
  createGenericMappings
} from "./adapters/genericCsvAdapter";
import { createIbkrMappings, detectIbkr } from "./adapters/ibkrAdapter";
import {
  createRobinhoodMappings,
  detectRobinhood,
  prepareRobinhoodRows,
  robinhoodWarnings,
  type ExcludedImportRow
} from "./adapters/robinhoodAdapter";
import {
  createSchwabMappings,
  detectSchwab,
  prepareSchwabRows,
  schwabWarnings
} from "./adapters/schwabAdapter";
import {
  createFidelityMappings,
  detectFidelity,
  prepareFidelityRows,
  fidelityWarnings
} from "./adapters/fidelityAdapter";
import {
  createWebullMappings,
  detectWebull,
  prepareWebullRows,
  webullWarnings
} from "./adapters/webullAdapter";
import {
  createEtradeMappings,
  detectEtrade,
  prepareEtradeRows,
  etradeWarnings
} from "./adapters/etradeAdapter";
import type { FieldMapping, ImportDetection, ImportType } from "./importAdapters";

export type BrokerId = "generic_csv" | "ibkr" | "robinhood" | "schwab" | "fidelity" | "webull" | "etrade";
export type ImportSourceOverride = "auto" | BrokerId;

export type BrokerAdapter = {
  brokerId: BrokerId;
  displayName: string;
  detect: (headers: string[], rows: unknown[]) => ImportDetection | undefined;
  getFieldMappings: (headers: string[]) => FieldMapping[];
  prepareRows?: (rows: unknown[], mappings: FieldMapping[]) => { rows: unknown[]; excludedRows: ExcludedImportRow[] };
  getWarnings?: (excludedRows: ExcludedImportRow[]) => string[];
  supportsExecutionReconstruction: boolean;
  reconstructionMode?: "position_tracking";
};

export type AdapterDetectionResult = {
  brokerId: BrokerId;
  displayName: string;
  confidence: number;
  matchedHeaders: string[];
  missingImportantHeaders: string[];
  signalReasons: string[];
  warnings: string[];
};

type AdapterExplainConfig = {
  importantHeaders: string[];
  signalRules: Array<{ headers: string[]; reason: string }>;
  warnings?: string[];
};

const explainConfig: Record<BrokerId, AdapterExplainConfig> = {
  generic_csv: {
    importantHeaders: ["symbol", "side", "entry_time", "entry_price", "quantity"],
    signalRules: [{ headers: ["symbol", "quantity"], reason: "Detected basic trade CSV fields" }],
    warnings: ["Generic CSV detection uses field mapping rather than broker-specific headers."]
  },
  ibkr: {
    importantHeaders: ["Symbol", "Date/Time", "Quantity", "T. Price", "Buy/Sell", "IB Execution ID", "Open/Close Indicator"],
    signalRules: [
      { headers: ["Symbol", "Date/Time", "Quantity", "T. Price"], reason: "Detected IBKR execution price and quantity fields" },
      { headers: ["IB Execution ID"], reason: "Detected IB Execution ID" },
      { headers: ["Open/Close Indicator"], reason: "Detected IBKR open/close indicator" }
    ],
    warnings: ["This file may be execution-level and may require reconstruction."]
  },
  robinhood: {
    importantHeaders: ["Activity Date", "Instrument", "Description", "Amount", "Realized Gain/Loss", "Proceeds", "Cost Basis"],
    signalRules: [
      { headers: ["Activity Date", "Instrument", "Amount"], reason: "Detected Robinhood-style Activity Date, Instrument, and Amount" },
      { headers: ["Realized Gain/Loss"], reason: "Detected Robinhood realized gain/loss field" },
      { headers: ["Proceeds", "Cost Basis"], reason: "Detected Robinhood tax-lot proceeds and cost basis fields" }
    ],
    warnings: ["Robinhood activity files may include dividends, transfers, deposits, withdrawals, and other non-trade rows."]
  },
  schwab: {
    importantHeaders: ["Date", "Time", "Symbol", "Action", "Quantity", "Price", "Commissions & Fees", "Net Amount", "CUSIP"],
    signalRules: [
      { headers: ["Symbol", "Action", "Quantity", "Price"], reason: "Detected Symbol + Action + Quantity + Price" },
      { headers: ["Commissions & Fees"], reason: "Detected Schwab/TOS-style Commissions & Fees" },
      { headers: ["Net Amount"], reason: "Detected Schwab/TOS-style Net Amount" }
    ],
    warnings: ["Schwab/Thinkorswim activity files may be transaction-level and may require reconstruction."]
  },
  fidelity: {
    importantHeaders: ["Run Date", "Account", "Action", "Symbol", "Security Description", "Security Type", "Quantity", "Price", "Amount"],
    signalRules: [
      { headers: ["Run Date", "Account", "Action"], reason: "Detected Fidelity-style Run Date, Account, and Action" },
      { headers: ["Security Description"], reason: "Detected Fidelity security description field" },
      { headers: ["Action", "Symbol", "Quantity", "Price"], reason: "Detected Action + Symbol + Quantity + Price" }
    ],
    warnings: ["Fidelity activity files may include cash activity and may require reconstruction."]
  },
  webull: {
    importantHeaders: ["Symbol", "Side", "Filled Time", "Filled Quantity", "Avg Price", "Status", "Order ID", "Trade ID"],
    signalRules: [
      { headers: ["Filled Quantity", "Avg Price"], reason: "Detected Webull-style Filled Quantity and Avg Price" },
      { headers: ["Order ID", "Trade ID"], reason: "Detected Webull order and trade identifiers" },
      { headers: ["Status"], reason: "Detected Webull order status field" }
    ],
    warnings: ["Webull order exports may include cancelled, rejected, pending, or otherwise incomplete rows."]
  },
  etrade: {
    importantHeaders: ["Transaction Date", "Action", "Symbol", "Quantity", "Price", "Net Amount", "Order Number", "Execution ID"],
    signalRules: [
      { headers: ["Order Number", "Transaction Date"], reason: "Detected E*TRADE-style Order Number and Transaction Date" },
      { headers: ["Execution ID"], reason: "Detected E*TRADE execution ID" },
      { headers: ["Action", "Symbol", "Quantity", "Price"], reason: "Detected Action + Symbol + Quantity + Price" }
    ],
    warnings: ["E*TRADE activity files may be transaction-level and may require reconstruction."]
  }
};

export const brokerAdapters: BrokerAdapter[] = [
  {
    brokerId: "ibkr",
    displayName: "Interactive Brokers",
    detect: (headers, rows) => {
      if (isSectionedIbkrStatement(rows)) {
        return { type: "ibkr_activity_statement", label: "Interactive Brokers Activity Statement CSV", confidence: 92 };
      }
      return detectIbkr(headers);
    },
    getFieldMappings: createIbkrMappings,
    supportsExecutionReconstruction: true,
    reconstructionMode: "position_tracking"
  },
  {
    brokerId: "robinhood",
    displayName: "Robinhood",
    detect: detectRobinhood,
    getFieldMappings: createRobinhoodMappings,
    prepareRows: prepareRobinhoodRows,
    getWarnings: robinhoodWarnings,
    supportsExecutionReconstruction: true,
    reconstructionMode: "position_tracking"
  },
  {
    brokerId: "schwab",
    displayName: "Schwab / Thinkorswim",
    detect: detectSchwab,
    getFieldMappings: createSchwabMappings,
    prepareRows: prepareSchwabRows,
    getWarnings: schwabWarnings,
    supportsExecutionReconstruction: true,
    reconstructionMode: "position_tracking"
  },
  {
    brokerId: "fidelity",
    displayName: "Fidelity",
    detect: detectFidelity,
    getFieldMappings: createFidelityMappings,
    prepareRows: prepareFidelityRows,
    getWarnings: fidelityWarnings,
    supportsExecutionReconstruction: true,
    reconstructionMode: "position_tracking"
  },
  {
    brokerId: "webull",
    displayName: "Webull",
    detect: detectWebull,
    getFieldMappings: createWebullMappings,
    prepareRows: prepareWebullRows,
    getWarnings: webullWarnings,
    supportsExecutionReconstruction: true,
    reconstructionMode: "position_tracking"
  },
  {
    brokerId: "etrade",
    displayName: "E*TRADE",
    detect: detectEtrade,
    getFieldMappings: createEtradeMappings,
    prepareRows: prepareEtradeRows,
    getWarnings: etradeWarnings,
    supportsExecutionReconstruction: true,
    reconstructionMode: "position_tracking"
  },
  {
    brokerId: "generic_csv",
    displayName: "Generic CSV",
    detect: () => ({ type: "generic_csv", label: "Generic CSV", confidence: 70 }),
    getFieldMappings: createGenericMappings,
    supportsExecutionReconstruction: false
  }
];

export function adapterForDetection(detection: ImportDetection) {
  return brokerAdapters.find((adapter) => adapter.brokerId === brokerIdFromImportType(detection.type)) ?? brokerAdapters[2];
}

export function adapterForOverride(override: ImportSourceOverride, headers: string[], rows: unknown[]) {
  if (override === "auto") return detectBrokerAdapter(headers, rows);
  const adapter = brokerAdapters.find((item) => item.brokerId === override) ?? brokerAdapters[2];
  return {
    adapter,
    detection: forcedDetection(adapter.brokerId)
  };
}

export function detectBrokerAdapter(headers: string[], rows: unknown[]) {
  const results = getAdapterDetectionResults(headers, rows);
  const topBroker = results.find((result) => result.brokerId !== "generic_csv" && result.confidence >= 50);
  if (topBroker) {
    const adapter = brokerAdapters.find((item) => item.brokerId === topBroker.brokerId) ?? brokerAdapters[brokerAdapters.length - 1];
    return { adapter, detection: detectionFromResult(topBroker) };
  }

  const generic = brokerAdapters.find((adapter) => adapter.brokerId === "generic_csv") ?? brokerAdapters[2];
  return { adapter: generic, detection: generic.detect(headers, rows)! };
}

export function getAdapterDetectionResults(headers: string[], rows: unknown[]): AdapterDetectionResult[] {
  const specificResults = brokerAdapters
    .filter((adapter) => adapter.brokerId !== "generic_csv")
    .map((adapter) => explainAdapter(adapter, headers, rows));
  const topSpecific = Math.max(0, ...specificResults.map((result) => result.confidence));
  const generic = brokerAdapters.find((adapter) => adapter.brokerId === "generic_csv") ?? brokerAdapters[brokerAdapters.length - 1];
  const genericResult = explainAdapter(generic, headers, rows, topSpecific >= 50 ? 40 : 70);
  return [...specificResults, genericResult].sort((a, b) => b.confidence - a.confidence);
}

export function brokerIdFromImportType(type: ImportType): BrokerId {
  if (type === "ibkr_activity_statement" || type === "ibkr_flex_query") return "ibkr";
  if (type === "robinhood" || type === "robinhood_potential") return "robinhood";
  if (type === "schwab") return "schwab";
  if (type === "fidelity") return "fidelity";
  if (type === "webull") return "webull";
  if (type === "etrade") return "etrade";
  return "generic_csv";
}

function forcedDetection(brokerId: BrokerId): ImportDetection {
  if (brokerId === "ibkr") return { type: "ibkr_flex_query", label: "Interactive Brokers", confidence: 100 };
  if (brokerId === "robinhood") return { type: "robinhood", label: "Robinhood", confidence: 100 };
  if (brokerId === "schwab") return { type: "schwab", label: "Schwab / Thinkorswim", confidence: 100 };
  if (brokerId === "fidelity") return { type: "fidelity", label: "Fidelity", confidence: 100 };
  if (brokerId === "webull") return { type: "webull", label: "Webull", confidence: 100 };
  if (brokerId === "etrade") return { type: "etrade", label: "E*TRADE", confidence: 100 };
  return { type: "generic_csv", label: "Generic CSV", confidence: 100 };
}

function explainAdapter(
  adapter: BrokerAdapter,
  headers: string[],
  rows: unknown[],
  forcedConfidence?: number
): AdapterDetectionResult {
  const detection = adapter.brokerId === "generic_csv" ? adapter.detect(headers, rows) : adapter.detect(headers, rows);
  const config = explainConfig[adapter.brokerId];
  const normalizedHeaders = headers.map(normalizeHeader);
  const matchedHeaders = config.importantHeaders.filter((header) => normalizedHeaders.includes(normalizeHeader(header)));
  const missingImportantHeaders = config.importantHeaders.filter((header) => !normalizedHeaders.includes(normalizeHeader(header)));
  const signalReasons = config.signalRules
    .filter((rule) => rule.headers.every((header) => normalizedHeaders.includes(normalizeHeader(header))))
    .map((rule) => rule.reason);
  const confidence = forcedConfidence ?? detection?.confidence ?? 0;
  const warnings = [...(config.warnings ?? [])];
  if (!matchedHeaders.some((header) => ["actual_pnl", "Realized P/L", "Realized Gain/Loss", "Amount", "Net Amount", "Total"].includes(header))) {
    warnings.push("PnL field was not detected or may be inferred from transaction amounts.");
  }
  if (!matchedHeaders.some((header) => ["Commission", "Fees", "Commissions & Fees", "Comm/Fee"].includes(header))) {
    warnings.push("Costs field was not detected.");
  }
  if (confidence < 50) warnings.push("Low-confidence import detection. Review field mappings before running diagnostics.");
  if (confidence < 30) warnings.push("Manual mapping recommended.");

  return {
    brokerId: adapter.brokerId,
    displayName: adapter.displayName,
    confidence,
    matchedHeaders,
    missingImportantHeaders,
    signalReasons: signalReasons.length ? signalReasons : ["No strong broker-specific signal detected"],
    warnings
  };
}

function detectionFromResult(result: AdapterDetectionResult): ImportDetection {
  return {
    type: result.brokerId === "ibkr" ? "ibkr_flex_query" : result.brokerId,
    label: result.displayName === "Interactive Brokers" ? "Interactive Brokers Flex CSV" : `${result.displayName} CSV`,
    confidence: result.confidence
  } as ImportDetection;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSectionedIbkrStatement(rows: unknown[]) {
  return rows.some((row) => {
    if (!Array.isArray(row)) return false;
    const section = String(row[0] ?? "").trim().toLowerCase();
    const rowType = String(row[1] ?? "").trim().toLowerCase();
    return rowType === "header" && ["statement", "account information", "trades", "cash report"].includes(section);
  });
}

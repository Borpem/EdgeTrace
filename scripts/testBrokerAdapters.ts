import Papa from "papaparse";
import { readFileSync } from "node:fs";
import { adapterForOverride, getAdapterDetectionResults, type BrokerId } from "../src/lib/brokerAdapters";
import { applyMappings, createFieldMappings, getCsvHeaders } from "../src/lib/importAdapters";
import { normalizeTrades } from "../src/lib/normalize";
import { buildImportDebugPayload } from "../src/lib/importDebugExport";
import { reconstructPositions } from "../src/lib/positionReconstruction";
import type { NormalizedTrade } from "../src/types";

type Expectation = {
  file: string;
  brokerId: BrokerId;
  minConfidence: number;
  minNormalized: number;
  excludedRows: number;
  reconstructionExpected: boolean;
};

const expectations: Expectation[] = [
  {
    file: "sample-trades.csv",
    brokerId: "generic_csv",
    minConfidence: 70,
    minNormalized: 1,
    excludedRows: 0,
    reconstructionExpected: false
  },
  {
    file: "sample-ibkr-trades.csv",
    brokerId: "ibkr",
    minConfidence: 90,
    minNormalized: 1,
    excludedRows: 0,
    reconstructionExpected: true
  },
  {
    file: "sample-ibkr-executions-reconstruction.csv",
    brokerId: "ibkr",
    minConfidence: 90,
    minNormalized: 1,
    excludedRows: 0,
    reconstructionExpected: true
  },
  {
    file: "sample-robinhood-transactions.csv",
    brokerId: "robinhood",
    minConfidence: 80,
    minNormalized: 1,
    excludedRows: 4,
    reconstructionExpected: true
  },
  {
    file: "sample-robinhood-tax-lots.csv",
    brokerId: "robinhood",
    minConfidence: 70,
    minNormalized: 1,
    excludedRows: 0,
    reconstructionExpected: false
  },
  {
    file: "sample-schwab-thinkorswim-transactions.csv",
    brokerId: "schwab",
    minConfidence: 80,
    minNormalized: 1,
    excludedRows: 4,
    reconstructionExpected: true
  },
  {
    file: "sample-fidelity-transactions.csv",
    brokerId: "fidelity",
    minConfidence: 80,
    minNormalized: 1,
    excludedRows: 4,
    reconstructionExpected: true
  },
  {
    file: "sample-webull-transactions.csv",
    brokerId: "webull",
    minConfidence: 80,
    minNormalized: 1,
    excludedRows: 5,
    reconstructionExpected: true
  },
  {
    file: "sample-etrade-transactions.csv",
    brokerId: "etrade",
    minConfidence: 80,
    minNormalized: 1,
    excludedRows: 4,
    reconstructionExpected: true
  }
];

let failures = 0;

for (const expectation of expectations) {
  const result = runImport(expectation.file);
  assertEqual(result.brokerId, expectation.brokerId, `${expectation.file} broker`);
  assertEqual(result.topRankedBroker, expectation.brokerId, `${expectation.file} top-ranked broker`);
  assertAtLeast(result.confidence, expectation.minConfidence, `${expectation.file} confidence`);
  assertAtLeast(result.adapterScores, 7, `${expectation.file} adapter scores`);
  assertAtLeast(result.matchedHeaders, 1, `${expectation.file} matched headers`);
  assertAtLeast(result.signalReasons, 1, `${expectation.file} signal reasons`);
  assertEqual(result.debugHasDetection, true, `${expectation.file} debug detection`);
  assertEqual(result.debugHasMappings, true, `${expectation.file} debug mappings`);
  assertEqual(result.debugHasExcludedSummary, true, `${expectation.file} debug excluded summary`);
  assertAtLeast(result.mappedFields, 5, `${expectation.file} mapped fields`);
  assertEqual(result.missingRequired, 0, `${expectation.file} required mappings`);
  assertAtLeast(result.normalizedRows, expectation.minNormalized, `${expectation.file} normalized rows`);
  assertEqual(result.excludedRows, expectation.excludedRows, `${expectation.file} excluded rows`);

  if (expectation.reconstructionExpected) {
    assertAtLeast(result.reconstructedRows, 1, `${expectation.file} reconstructed rows`);
    assertEqual(result.debugHasReconstruction, true, `${expectation.file} debug reconstruction`);
  } else {
    assertEqual(result.reconstructionAvailable, false, `${expectation.file} reconstruction availability`);
  }

  console.log(
    `${expectation.file}: ${result.brokerId}, normalized=${result.normalizedRows}, excluded=${result.excludedRows}, reconstructed=${result.reconstructedRows}`
  );
}

if (failures > 0) {
  console.error(`${failures} broker import regression check(s) failed.`);
  process.exit(1);
}

console.log("Broker import regression tests passed.");

function runImport(file: string) {
  const csv = readFileSync(`public/${file}`, "utf8");
  const rows = Papa.parse<unknown[]>(csv, { header: false, skipEmptyLines: true }).data;
  const headers = getCsvHeaders(rows);
  const detectionResults = getAdapterDetectionResults(headers, rows);
  const { adapter, detection } = adapterForOverride("auto", headers, rows);
  const mappings = createFieldMappings(headers, detection);
  const prepared = adapter.prepareRows
    ? adapter.prepareRows(rows, mappings)
    : { rows: applyMappings(rows, mappings), excludedRows: [] };
  const normalized = normalizeTrades(prepared.rows);
  const reconstructionAvailable = canReconstruct(normalized, adapter.supportsExecutionReconstruction);
  const reconstructed = reconstructionAvailable ? reconstructPositions(normalized, adapter.brokerId).trades : [];
  const reconstructionResult = reconstructionAvailable ? reconstructPositions(normalized, adapter.brokerId) : undefined;
  const debugPayload = buildImportDebugPayload({
    filename: file,
    rows,
    headers,
    sourceOverride: "auto",
    selectedAdapter: adapter,
    autoDetection: detectionResults[0],
    detectionResults,
    importDetection: detection,
    fieldMappings: mappings,
    excludedRows: prepared.excludedRows,
    normalizedTrades: reconstructionResult?.trades ?? normalized,
    executionTrades: normalized,
    warning: "",
    reconstructionEnabled: reconstructionAvailable,
    reconstructionResult
  });

  return {
    brokerId: adapter.brokerId,
    topRankedBroker: detectionResults[0]?.brokerId,
    confidence: detection.confidence,
    adapterScores: detectionResults.length,
    matchedHeaders: detectionResults[0]?.matchedHeaders.length ?? 0,
    signalReasons: detectionResults[0]?.signalReasons.length ?? 0,
    mappedFields: mappings.filter((mapping) => mapping.status === "mapped").length,
    missingRequired: mappings.filter((mapping) => mapping.status === "required_missing").length,
    normalizedRows: normalized.length,
    excludedRows: prepared.excludedRows.length,
    reconstructionAvailable,
    reconstructedRows: reconstructed.length,
    debugHasDetection: Boolean(debugPayload.detectionDiagnostics?.allAdapterScores?.length),
    debugHasMappings: Boolean(debugPayload.fieldMappings?.length),
    debugHasExcludedSummary: typeof debugPayload.excludedRows?.excludedCount === "number",
    debugHasReconstruction: Boolean(debugPayload.reconstruction?.completedTrades)
  };
}

function canReconstruct(trades: NormalizedTrade[], supported: boolean) {
  return (
    supported &&
    trades.some((trade) => trade.brokerExecutionId || trade.openCloseIndicator || !trade.exitTime || trade.exitPrice === undefined)
  );
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    failures += 1;
    console.error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertAtLeast(actual: number, expected: number, label: string) {
  if (actual < expected) {
    failures += 1;
    console.error(`${label}: expected at least ${expected}, received ${actual}`);
  }
}

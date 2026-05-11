import type { AdapterDetectionResult, BrokerAdapter, ImportSourceOverride } from "./brokerAdapters";
import { downloadJson } from "./exportUtils";
import type { ExcludedImportRow } from "./adapters/robinhoodAdapter";
import type { FieldMapping, ImportDetection } from "./importAdapters";
import type { PositionReconstructionResult } from "./positionReconstruction";
import type { NormalizedTrade } from "../types";

type BuildImportDebugPayloadArgs = {
  filename: string;
  rows: unknown[];
  headers: string[];
  sourceOverride: ImportSourceOverride;
  selectedAdapter?: BrokerAdapter;
  autoDetection?: AdapterDetectionResult;
  detectionResults: AdapterDetectionResult[];
  importDetection?: ImportDetection;
  fieldMappings: FieldMapping[];
  excludedRows: ExcludedImportRow[];
  normalizedTrades: NormalizedTrade[];
  executionTrades: NormalizedTrade[];
  warning: string;
  reconstructionEnabled: boolean;
  reconstructionResult?: PositionReconstructionResult;
};

const IMPORT_ADAPTER_VERSION = "broker-adapters-v1";

export function buildImportDebugPayload({
  filename,
  rows,
  headers,
  sourceOverride,
  selectedAdapter,
  autoDetection,
  detectionResults,
  importDetection,
  fieldMappings,
  excludedRows,
  normalizedTrades,
  executionTrades,
  warning,
  reconstructionEnabled,
  reconstructionResult
}: BuildImportDebugPayloadArgs) {
  const selectedDetection = detectionResults.find((result) => result.brokerId === selectedAdapter?.brokerId);
  const runnerUp = detectionResults.find((result) => result.brokerId !== selectedDetection?.brokerId);
  const missingRequired = fieldMappings
    .filter((mapping) => mapping.status === "required_missing")
    .map((mapping) => mapping.sourceColumn);
  const excludedReasonCounts = excludedRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.reason] = (acc[row.reason] ?? 0) + 1;
    return acc;
  }, {});

  return {
    file: {
      originalFilename: filename,
      rowCount: rows.length,
      columnHeaders: headers,
      parseTimestamp: new Date().toISOString(),
      selectedImportSource: selectedAdapter?.brokerId ?? importDetection?.type ?? "unknown",
      autoDetectedImportSource: autoDetection?.brokerId,
      manualOverrideSource: sourceOverride === "auto" ? undefined : sourceOverride
    },
    detectionDiagnostics: {
      allAdapterScores: detectionResults,
      selectedAdapter: selectedDetection,
      confidence: selectedDetection?.confidence ?? importDetection?.confidence,
      confidenceLabel: confidenceLabel(selectedDetection?.confidence ?? importDetection?.confidence ?? 0),
      matchedHeaders: selectedDetection?.matchedHeaders ?? [],
      missingImportantHeaders: selectedDetection?.missingImportantHeaders ?? [],
      signalReasons: selectedDetection?.signalReasons ?? [],
      warnings: selectedDetection?.warnings ?? [],
      runnerUpAdapter: runnerUp,
      confidenceGap:
        selectedDetection && runnerUp ? selectedDetection.confidence - runnerUp.confidence : selectedDetection?.confidence
    },
    fieldMappings: fieldMappings.map((mapping) => ({
      sourceColumn: mapping.sourceColumn,
      mappedEdgeTraceField: mapping.targetField,
      confidence: mapping.confidence,
      status: mapping.status,
      contributedToDetection: Boolean(selectedDetection?.matchedHeaders.includes(mapping.sourceColumn))
    })),
    excludedRows: {
      excludedCount: excludedRows.length,
      exclusionReasons: excludedReasonCounts,
      sampleRows: excludedRows.slice(0, 10)
    },
    normalization: {
      normalizedRowCount: normalizedTrades.length,
      rawNormalizedExecutionCount: executionTrades.length,
      missingRequiredFields: missingRequired,
      normalizationWarnings: warning ? warning.split(/(?<=\.)\s+/).filter(Boolean) : [],
      sampleNormalizedRecords: normalizedTrades.slice(0, 10)
    },
    reconstruction: reconstructionResult
      ? {
          enabled: reconstructionEnabled,
          rawExecutions: reconstructionResult.summary.rawExecutionRows,
          completedTrades: reconstructionResult.summary.reconstructedTrades,
          openPositions: reconstructionResult.summary.openPositionsRemaining,
          partialExits: reconstructionResult.summary.partialExitsDetected,
          positionFlips: reconstructionResult.summary.positionFlipsDetected,
          reconstructionWarnings: reconstructionResult.summary.reconstructionWarnings,
          sampleReconstructedTrades: reconstructionResult.trades.slice(0, 10)
        }
      : {
          enabled: reconstructionEnabled,
          rawExecutions: executionTrades.length,
          completedTrades: 0,
          openPositions: 0,
          partialExits: 0,
          positionFlips: 0,
          reconstructionWarnings: [],
          sampleReconstructedTrades: []
        },
    appDebugMetadata: {
      appName: "EdgeTrace",
      appVersion: "0.1.0",
      importAdapterVersion: IMPORT_ADAPTER_VERSION,
      exportTimestamp: new Date().toISOString()
    }
  };
}

export function downloadImportDebugJson(brokerOrGeneric: string, payload: unknown) {
  downloadJson(`edgetrace-import-debug-${sanitizeFilename(brokerOrGeneric)}-${timestampSlug()}.json`, payload);
}

function confidenceLabel(confidence: number) {
  if (confidence >= 80) return "High";
  if (confidence >= 50) return "Medium";
  return "Low";
}

function timestampSlug() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function sanitizeFilename(filename: string) {
  return filename
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

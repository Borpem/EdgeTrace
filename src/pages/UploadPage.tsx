import Papa from "papaparse";
import { UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import { DisclosurePanel } from "../components/DisclosurePanel";
import { CommandPath } from "../components/onboarding/CommandPath";
import { WorkflowDiagram } from "../components/visuals/WorkflowDiagram";
import { trackEvent } from "../lib/analytics";
import {
  adapterForOverride,
  brokerAdapters,
  getAdapterDetectionResults,
  type AdapterDetectionResult,
  type BrokerAdapter,
  type ImportSourceOverride
} from "../lib/brokerAdapters";
import type { ExcludedImportRow } from "../lib/adapters/robinhoodAdapter";
import {
  applyMappings,
  createFieldMappings,
  edgeTraceFieldOptions,
  getCsvHeaders,
  getImportWarnings,
  updateMapping,
  type FieldMapping,
  type ImportDetection
} from "../lib/importAdapters";
import { buildImportDebugPayload, downloadImportDebugJson } from "../lib/importDebugExport";
import { reconstructPositions, type PositionReconstructionResult } from "../lib/positionReconstruction";
import { canCreateReport, canUseBrokerAdapter, formatLimit, getPlanConfig } from "../lib/entitlements";
import type { DiagnosticsResult, ImportProvenance, NormalizedTrade, ReportSummary, UserProfile } from "../types";
import { listReports, runTradeDiagnostics, uploadHtmlTrades, uploadTrades } from "../lib/api";

export function UploadPage({
  profile,
  onComplete,
  onViewPricing
}: {
  profile: UserProfile | null;
  onComplete: (result: DiagnosticsResult) => void;
  onViewPricing?: () => void;
}) {
  const [rows, setRows] = useState<unknown[]>([]);
  const [uploadedFilename, setUploadedFilename] = useState("");
  const [executionTrades, setExecutionTrades] = useState<NormalizedTrade[]>([]);
  const [normalizedTrades, setNormalizedTrades] = useState<NormalizedTrade[]>([]);
  const [reportName, setReportName] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [uploadWarning, setUploadWarning] = useState("");
  const [importDetection, setImportDetection] = useState<ImportDetection>();
  const [autoDetection, setAutoDetection] = useState<AdapterDetectionResult>();
  const [detectionResults, setDetectionResults] = useState<AdapterDetectionResult[]>([]);
  const [activeAdapter, setActiveAdapter] = useState<BrokerAdapter>();
  const [sourceOverride, setSourceOverride] = useState<ImportSourceOverride>("auto");
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [reconstructIbkr, setReconstructIbkr] = useState(true);
  const [reconstructionResult, setReconstructionResult] = useState<PositionReconstructionResult>();
  const [excludedRows, setExcludedRows] = useState<ExcludedImportRow[]>([]);
  const [showAuditPreview, setShowAuditPreview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [billableReportCount, setBillableReportCount] = useState(0);
  const plan = getPlanConfig(profile?.planId);
  const activeBrokerId = activeAdapter?.brokerId ?? "generic_csv";
  const brokerBlocked = Boolean(activeAdapter) && !canUseBrokerAdapter(plan, activeBrokerId);
  const reportLimitReached = Boolean(profile) && !canCreateReport(plan, billableReportCount);
  const missingRequiredFields = fieldMappings
    .filter((mapping) => mapping.status === "required_missing")
    .map((mapping) => mapping.sourceColumn.replace(/^Missing:\s*/i, ""));
  const hasParsedFile = rows.length > 0 && !isParsing;
  const detectedSourceLabel = importDetection?.label ?? activeAdapter?.displayName ?? "Unknown";
  const detectionConfidence = importDetection?.confidence ?? autoDetection?.confidence ?? 0;
  const costsDetected = normalizedTrades.some((trade) => getTradeCosts(trade) > 0);
  const rMultipleAvailable = normalizedTrades.some((trade) => typeof trade.realizedR === "number");
  const mappedFieldsCount = fieldMappings.filter((mapping) => mapping.status === "mapped").length;
  const importWarnings = buildImportWarningList({
    warning,
    normalizedTrades,
    fieldMappings,
    excludedRows,
    reconstructionResult,
    costsDetected,
    rMultipleAvailable
  });
  const canRunDiagnostics =
    normalizedTrades.length > 0 && !brokerBlocked && !reportLimitReached && missingRequiredFields.length === 0;
  const runBlockerMessage = missingRequiredFields.length
    ? `Missing required fields: ${missingRequiredFields.join(", ")}.`
    : brokerBlocked
      ? `${plan.displayName} plan supports generic CSV imports only.`
      : reportLimitReached
        ? `You've reached the Free full-report limit. Upgrade to Pro to unlock the full strategy workflow.`
        : hasParsedFile && normalizedTrades.length === 0
          ? "No normalized trades are ready yet."
          : "";
  const hasMappingCaveats = canRunDiagnostics && Boolean(warning || fieldMappings.some((mapping) => mapping.status === "unmapped"));
  const importConfidenceStatus: ImportConfidenceStatus =
    brokerBlocked || reportLimitReached || missingRequiredFields.length > 0 || (hasParsedFile && normalizedTrades.length === 0)
      ? "Blocked"
      : importWarnings.length > 0 || hasMappingCaveats
        ? "Review Recommended"
        : "Ready";
  const actionStatus = canRunDiagnostics
    ? "Ready to create report"
    : importConfidenceStatus === "Blocked"
      ? "Blocked before creating report"
      : "Review required before creating report";
  const activeStepIndex = !rows.length ? 0 : canRunDiagnostics ? 2 : 1;
  const showStickyActionBar = hasParsedFile;
  const reconstructionStatus = reconstructionResult
    ? `On - ${reconstructionResult.summary.reconstructedTrades} completed trades`
    : canReconstructBroker(executionTrades, activeAdapter)
      ? reconstructIbkr
        ? "On"
        : "Off"
      : "Not applicable";
  const reportLimitSummary =
    profile?.planId === "free"
      ? `Free plan: ${Math.min(billableReportCount, Number(plan.limits.maxFullReports))} of ${formatLimit(plan.limits.maxFullReports)} full reports used. Additional reports open as previews.`
      : `${plan.displayName} plan: ${formatLimit(plan.limits.maxFullReports)} full reports.`;

  useEffect(() => {
    trackEvent("upload_page_opened");
  }, []);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    void listReports()
      .then(({ reports }) => {
        if (active) setBillableReportCount(reports.filter((report) => !isDemoReport(report)).length);
      })
      .catch(() => {
        if (active) setBillableReportCount(0);
      });
    return () => {
      active = false;
    };
  }, [profile?.userId]);

  const parseFile = (file: File) => {
    setIsParsing(true);
    setError("");
    setWarning("");
    setUploadWarning("");
    setUploadedFilename(file.name);
    setImportDetection(undefined);
    setAutoDetection(undefined);
    setDetectionResults([]);
    setActiveAdapter(undefined);
    setSourceOverride("auto");
    setExcludedRows([]);
    setFieldMappings([]);
    setExecutionTrades([]);
    setNormalizedTrades([]);
    setReconstructionResult(undefined);
    setShowAuditPreview(false);
    if (/\.(html?|xhtml)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = async () => {
        const html = String(reader.result ?? "");
        setRows([["HTML file", file.name]]);
        try {
          const upload = await uploadHtmlTrades(html);
          setExecutionTrades(upload.normalizedTrades);
          setNormalizedTrades(upload.normalizedTrades);
          setWarning(upload.warning ?? "");
        } catch (err) {
          setError(formatUploadError(err, "html_parse"));
        } finally {
          setIsParsing(false);
        }
      };
      reader.onerror = () => {
        setError("Unable to read HTML file. Try exporting it again from your broker.");
        setIsParsing(false);
      };
      reader.readAsText(file);
      return;
    }
    trackEvent("csv_uploaded", {
      filenameExtension: file.name.split(".").pop()?.toLowerCase() ?? "csv"
    });
    Papa.parse<unknown[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        try {
          setRows(data);
          await prepareCsvImport(data, "auto");
        } catch (err) {
          setError(formatUploadError(err, "csv_parse"));
        } finally {
          setIsParsing(false);
        }
      },
      error: (err) => {
        setError(formatUploadError(err, "csv_parse"));
        setIsParsing(false);
      }
    });
  };

  const prepareCsvImport = async (data: unknown[], override: ImportSourceOverride = sourceOverride) => {
    const headers = getCsvHeaders(data);
    const results = getAdapterDetectionResults(headers, data);
    setDetectionResults(results);
    setAutoDetection(results[0]);
    const { adapter, detection } = adapterForOverride(override, headers, data);
    setImportDetection(detection);
    setActiveAdapter(adapter);
    trackEvent("import_source_detected", {
      brokerId: adapter.brokerId,
      confidence: detection.confidence
    });

    if (isSectionedIbkrStatement(data)) {
      setFieldMappings([]);
      await normalizeRows(data, detection, []);
      return;
    }

    const mappings = createFieldMappings(headers, detection);
    setFieldMappings(mappings);
    const prepared = prepareRowsForAdapter(data, mappings, adapter);
    setExcludedRows(prepared.excludedRows);
    await normalizeRows(prepared.rows, detection, mappings, adapter, prepared.excludedRows);
  };

  const normalizeRows = async (
    rowsToNormalize: unknown[],
    detection?: ImportDetection,
    mappings: FieldMapping[] = [],
    adapter: BrokerAdapter | undefined = activeAdapter,
    currentExcludedRows: ExcludedImportRow[] = excludedRows
  ) => {
    try {
      const upload = await uploadTrades(rowsToNormalize);
      setUploadWarning(upload.warning ?? "");
      setExecutionTrades(upload.normalizedTrades);
      const finalTrades = applyReconstructionMode(upload.normalizedTrades, detection, adapter, reconstructIbkr);
      setNormalizedTrades(finalTrades.trades);
      setReconstructionResult(finalTrades.reconstruction);
      setWarning(composeWarnings(upload.warning, detection, mappings, upload.normalizedTrades.length, finalTrades.reconstruction, currentExcludedRows, adapter));
    } catch (err) {
      setError(formatUploadError(err, "normalize"));
    }
  };

  const handleMappingChange = async (sourceColumn: string, targetField: string) => {
    const nextMappings = updateMapping(fieldMappings, sourceColumn, targetField as Parameters<typeof updateMapping>[2]);
    setFieldMappings(nextMappings);
    const prepared = prepareRowsForAdapter(rows, nextMappings, activeAdapter);
    setExcludedRows(prepared.excludedRows);
    await normalizeRows(prepared.rows, importDetection, nextMappings, activeAdapter, prepared.excludedRows);
  };

  const handleReconstructionModeChange = (enabled: boolean) => {
    setReconstructIbkr(enabled);
    const finalTrades = applyReconstructionMode(executionTrades, importDetection, activeAdapter, enabled);
    setNormalizedTrades(finalTrades.trades);
    setReconstructionResult(finalTrades.reconstruction);
    setWarning(composeWarnings(uploadWarning, importDetection, fieldMappings, executionTrades.length, finalTrades.reconstruction, excludedRows, activeAdapter));
  };

  const handleSourceOverrideChange = async (override: ImportSourceOverride) => {
    setSourceOverride(override);
    if (!rows.length || !getCsvHeaders(rows).length) return;
    const { adapter, detection } = adapterForOverride(override, getCsvHeaders(rows), rows);
    const results = getAdapterDetectionResults(getCsvHeaders(rows), rows);
    setDetectionResults(results);
    setAutoDetection(results[0]);
    setImportDetection(detection);
    setActiveAdapter(adapter);
    const mappings = createFieldMappings(getCsvHeaders(rows), detection);
    setFieldMappings(mappings);
    const prepared = prepareRowsForAdapter(rows, mappings, adapter);
    setExcludedRows(prepared.excludedRows);
    await normalizeRows(prepared.rows, detection, mappings, adapter, prepared.excludedRows);
  };

  const runAnalysis = async () => {
    setIsRunning(true);
    setError("");
    try {
      if (missingRequiredFields.length) {
        throw new Error(`Missing required fields: ${missingRequiredFields.join(", ")}.`);
      }
      if (!normalizedTrades.length) {
        throw new Error("No normalized trades are ready yet. Review the uploaded file and field mapping.");
      }
      if (brokerBlocked) {
        throw new Error("Free plan supports generic CSV imports only. Upgrade to Pro to unlock all supported broker CSV imports.");
      }
      if (reportLimitReached) {
        throw new Error("You've reached the Free full-report limit. Upgrade to Pro to unlock the full strategy workflow.");
      }
      trackEvent("diagnostics_started", {
        brokerId: activeBrokerId,
        tradeCount: normalizedTrades.length
      });
      onComplete(
        await runTradeDiagnostics(normalizedTrades, reportName, {
          brokerId: activeBrokerId,
          importProvenance: buildImportProvenance({
            uploadedFilename,
            detectedSourceLabel,
            sourceOverride,
            activeAdapter,
            detectionConfidence,
            importConfidenceStatus,
            mappedFieldsCount,
            normalizedTrades,
            excludedRows,
            importWarnings,
            missingRequiredFields,
            costsDetected,
            rMultipleAvailable,
            reconstructIbkr,
            reconstructionResult
          })
        })
      );
    } catch (err) {
      setError(formatUploadError(err, "diagnostics"));
    } finally {
      setIsRunning(false);
    }
  };

  const handleDebugExport = () => {
    const payload = buildImportDebugPayload({
      filename: uploadedFilename || "uploaded-file.csv",
      rows,
      headers: getCsvHeaders(rows),
      sourceOverride,
      selectedAdapter: activeAdapter,
      autoDetection,
      detectionResults,
      importDetection,
      fieldMappings,
      excludedRows,
      normalizedTrades,
      executionTrades,
      warning,
      reconstructionEnabled: reconstructIbkr,
      reconstructionResult
    });
    downloadImportDebugJson(activeAdapter?.brokerId ?? importDetection?.type ?? "generic", payload);
  };

  const scrollToMappingReview = () => {
    document.getElementById("mapping-review")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const focusUploadArea = () => {
    document.getElementById("trade-file-import")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className={`EdgeTrace-shell py-10 ${showStickyActionBar ? "pb-44 md:pb-36" : ""}`}>
      <div className="EdgeTrace-page-header mb-8 grid gap-8 xl:grid-cols-[1fr_420px] xl:items-end">
        <div>
          <h1 className="EdgeTrace-title">Create a Diagnostic Report</h1>
          <p className="EdgeTrace-copy">
            Upload completed trade history, review the mapping, and generate a diagnostic report.
          </p>
          <div className="mt-6 grid gap-2 text-sm sm:grid-cols-4">
            {["Import trades", "Review mapping", "Run diagnostics", "Open report"].map((step, index) => (
              <div
                key={step}
                className={`border px-3 py-3 ${
                  activeStepIndex === index
                    ? "border-cyan/70 bg-cyan/10"
                    : index < activeStepIndex
                      ? "border-accent/45 bg-accent/5"
                      : "border-white/[0.1] bg-white/[0.025]"
                }`}
              >
                <p className={`text-xs font-semibold ${activeStepIndex === index ? "text-cyan" : "text-muted"}`}>
                  0{index + 1}
                </p>
                <p className="mt-1 font-semibold text-ink">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 border border-white/[0.1] bg-white/[0.025] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold text-ink">{rows.length ? actionStatus : "Upload a trade file to continue"}</p>
                <p className="mt-1 text-sm text-muted">
                  {rows.length
                    ? `${normalizedTrades.length} trades detected - Detected source: ${detectedSourceLabel}`
                    : "Import trades first, then review mapping and create a diagnostic report."}
                </p>
                {profile && <p className="mt-2 text-xs text-muted">{reportLimitSummary}</p>}
                {runBlockerMessage && <p className="mt-2 text-sm text-warning">{runBlockerMessage}</p>}
                {hasMappingCaveats && (
                  <p className="mt-2 text-sm text-warning">
                    Some fields are missing or inferred. You can still create a report, but review mapping if results look wrong.
                  </p>
                )}
                {hasParsedFile && (
                  <FinalReportSummary
                    className="mt-4"
                    normalizedTradeCount={normalizedTrades.length}
                    sourceLabel={detectedSourceLabel}
                    costsDetected={costsDetected}
                    rMultipleAvailable={rMultipleAvailable}
                    reconstructionStatus={reconstructionStatus}
                  />
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  className={`${rows.length ? "EdgeTrace-primary-button" : "EdgeTrace-secondary-button"} px-6 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50`}
                  disabled={!canRunDiagnostics || isRunning}
                  onClick={runAnalysis}
                  type="button"
                >
                  {rows.length ? (isRunning ? "Running..." : "Run Diagnostics & Create Report") : "Upload a trade file to continue"}
                </button>
                {reportLimitReached && onViewPricing && (
                  <button className="EdgeTrace-secondary-button" onClick={onViewPricing} type="button">
                    View Pricing
                  </button>
                )}
                {fieldMappings.length > 0 && (
                  <button className="EdgeTrace-secondary-button" onClick={scrollToMappingReview} type="button">
                    Review Mapping
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="EdgeTrace-card-soft relative z-10 p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.18em] text-muted">Sample files</p>
          <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1">
          {[
            ["/sample-trades.csv", "Cost-drag sample"],
            ["/sample-trades-improved.csv", "Improved sample"],
            ["/sample-trades-breakdown.csv", "Breakdown sample"],
            ["/sample-ibkr-executions-reconstruction.csv", "IBKR reconstruction"],
            ["/sample-robinhood-transactions.csv", "Robinhood"],
            ["/sample-schwab-thinkorswim-transactions.csv", "Schwab/TOS"]
          ].map(([href, label]) => (
            <a key={href} className="rounded-md border border-line bg-graphite/60 px-3 py-2 text-cyan hover:border-accent" href={href}>
              {label}
            </a>
          ))}
          </div>
          {profile && (
            <p className="mt-4 text-xs text-muted">
              Current plan: <span className="text-cyan">{plan.displayName}</span>
              {plan.limits.brokerAdapters === "generic_csv" ? " · Generic CSV imports only" : " · All broker CSV imports"}
            </p>
          )}
        </div>
      </div>

      <CommandPath className="mb-8" context="upload" onAnalyze={focusUploadArea} />

      <label
        id="trade-file-import"
        className="grid min-h-72 cursor-pointer gap-8 rounded-2xl border border-dashed border-accent/60 bg-panel/70 p-8 text-left shadow-2xl shadow-black/20 hover:border-cyan hover:bg-panel md:grid-cols-[340px_1fr] md:items-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) parseFile(file);
        }}
      >
        <div>
          <UploadCloud className="mb-4 text-cyan" size={40} />
          <span className="block text-2xl font-semibold">Drop a CSV or IBKR HTML file here</span>
          <span className="mt-3 block max-w-md text-sm leading-6 text-muted">
            Select a file from your machine. EdgeTrace detects the source, reviews mappings, normalizes trades, and then runs diagnostics.
          </span>
        </div>
        <WorkflowDiagram
          steps={["Import", "Map", "Diagnose", "Report"]}
          activeIndex={activeStepIndex}
          compact
          className="hidden md:block"
        />
        <input
          className="sr-only"
          data-testid="upload-input"
          type="file"
          accept=".csv,.html,.htm,text/csv,text/html"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) parseFile(file);
          }}
        />
      </label>

      {error && <div className="mt-5 rounded-md border border-loss/60 bg-loss/10 p-4 text-loss">{error}</div>}
      {isParsing && (
        <div className="mt-5 rounded-md border border-line bg-panel p-4 text-sm text-muted">
          Parsing and mapping the uploaded file...
        </div>
      )}
      {warning && <div className="mt-5 rounded-md border border-warning/60 bg-warning/10 p-4 text-warning">{warning}</div>}
      {brokerBlocked && (
        <div className="mt-5 rounded-md border border-warning/60 bg-warning/10 p-4 text-warning">
          {plan.displayName} plan supports generic CSV imports only. This file was detected as {activeAdapter?.displayName}.
          Upgrade options are listed on Pricing.
        </div>
      )}

      {rows.length > 0 && (
        <section className="mt-8">
          {hasParsedFile && (
            <ImportConfidencePanel
              status={importConfidenceStatus}
              detectedSource={detectedSourceLabel}
              confidence={detectionConfidence}
              mappedFieldsCount={mappedFieldsCount}
              normalizedTradeCount={normalizedTrades.length}
              excludedRowCount={excludedRows.length}
              warningsCount={importWarnings.length}
              reconstructionStatus={reconstructionStatus}
              blockerMessage={runBlockerMessage}
            />
          )}
          {importDetection && (
            <div className="EdgeTrace-card mb-5 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Detected Source</p>
                  <h2 className="mt-1 text-lg font-semibold">{importDetection.label}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    className="rounded-md border border-line bg-graphite px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    value={sourceOverride}
                    onChange={(event) => handleSourceOverrideChange(event.target.value as ImportSourceOverride)}
                  >
                    <option value="auto">Auto-detect</option>
                    {brokerAdapters.map((adapter) => (
                      <option key={adapter.brokerId} value={adapter.brokerId}>
                        {adapter.displayName}
                      </option>
                    ))}
                  </select>
                  <span className="w-fit rounded-full border border-line px-3 py-1 text-sm text-muted">
                    {importDetection.confidence}% confidence
                  </span>
                </div>
              </div>

              <DisclosurePanel
                className="mt-4"
                title="Import detection details"
                subtitle={`Selected source: ${importDetection.label}. Expand to review competing adapter scores.`}
                compact
              >
                <ImportDiagnosticsPanel
                  selected={detectionResults.find((result) => result.brokerId === activeAdapter?.brokerId)}
                  autoDetected={autoDetection}
                  results={detectionResults}
                  sourceOverride={sourceOverride}
                />
              </DisclosurePanel>

              <DisclosurePanel
                className="mt-4"
                title="Debug export"
                subtitle="For support use only. May include trade rows from the uploaded file."
                compact
              >
                <button
                  className="EdgeTrace-secondary-button"
                  type="button"
                  onClick={handleDebugExport}
                >
                  Download import debug JSON
                </button>
              </DisclosurePanel>

              {fieldMappings.length > 0 && (
                <DisclosurePanel
                  className="mt-5 scroll-mt-28"
                  title="Field mapping details"
                  subtitle={`${mappedFieldsCount} fields mapped. Expand if you need to adjust columns.`}
                  defaultOpen={missingRequiredFields.length > 0}
                >
                  <div id="mapping-review" className="overflow-x-auto border border-line">
                    <table className="min-w-full divide-y divide-line text-sm">
                      <thead className="bg-graphite text-left text-muted">
                        <tr>
                          <th className="px-4 py-3 font-medium">Source column</th>
                          <th className="px-4 py-3 font-medium">EdgeTrace field</th>
                          <th className="px-4 py-3 font-medium">Confidence</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {fieldMappings.map((mapping) => (
                        <tr key={mapping.sourceColumn} className={mapping.status === "required_missing" ? "bg-loss/5" : ""}>
                            <td className="px-4 py-3 text-muted">{mapping.sourceColumn}</td>
                            <td className="px-4 py-3">
                              {mapping.status === "required_missing" ? (
                                <span className="text-loss">Required field not mapped</span>
                              ) : (
                                <select
                                  className="rounded-md border border-line bg-graphite px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                                  value={mapping.targetField ?? ""}
                                  onChange={(event) => handleMappingChange(mapping.sourceColumn, event.target.value)}
                                >
                                  {edgeTraceFieldOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted">
                              {mapping.confidence ? `${mapping.confidence}%` : "-"}
                              {detectionResults
                                .find((result) => result.brokerId === activeAdapter?.brokerId)
                                ?.matchedHeaders.includes(mapping.sourceColumn) && (
                                <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                                  signal
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs ${
                                  mapping.status === "mapped"
                                    ? "bg-accent/10 text-cyan"
                                    : mapping.status === "required_missing"
                                      ? "bg-loss/10 text-loss"
                                      : "bg-graphite text-muted"
                                }`}
                              >
                                {mapping.status.replace("_", " ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DisclosurePanel>
              )}

              {canReconstructBroker(executionTrades, activeAdapter) && (
                <DisclosurePanel className="mt-5" title="Reconstruction details" subtitle="Execution files can be reconstructed into completed trades.">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold">{activeAdapter?.displayName ?? "Broker"} execution handling</p>
                      <p className="mt-1 max-w-3xl text-sm text-muted">
                        Reconstruct completed trades from transactions by tracking position changes. Direct row analysis remains available for audit work.
                      </p>
                    </div>
                    <div className="flex rounded-md border border-line p-1 text-sm">
                      <button
                        className={`rounded px-3 py-2 ${
                          reconstructIbkr ? "bg-gradient-to-br from-accent to-[#7861FF] text-ink" : "text-muted"
                        }`}
                        onClick={() => handleReconstructionModeChange(true)}
                        type="button"
                      >
                        Reconstruct trades
                      </button>
                      <button
                        className={`rounded px-3 py-2 ${
                          !reconstructIbkr ? "bg-gradient-to-br from-accent to-[#7861FF] text-ink" : "text-muted"
                        }`}
                        onClick={() => handleReconstructionModeChange(false)}
                        type="button"
                      >
                        Analyze executions
                      </button>
                    </div>
                  </div>

                  {reconstructIbkr && reconstructionResult && (
                    <>
                      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
                        <SummaryStat label="Raw executions" value={reconstructionResult.summary.rawExecutionRows} />
                        <SummaryStat label="Completed trades" value={reconstructionResult.summary.reconstructedTrades} />
                        <SummaryStat label="Executions used" value={countUsedExecutions(reconstructionResult.trades)} />
                        <SummaryStat label="Executions excluded" value={Math.max(0, reconstructionResult.summary.rawExecutionRows - countUsedExecutions(reconstructionResult.trades))} />
                        <SummaryStat label="Open positions" value={reconstructionResult.summary.openPositionsRemaining} />
                        <SummaryStat label="Partial exits" value={reconstructionResult.summary.partialExitsDetected} />
                        <SummaryStat label="Position flips" value={reconstructionResult.summary.positionFlipsDetected} />
                        <SummaryStat label="Warnings" value={reconstructionResult.summary.reconstructionWarnings.length} />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted">
                          Total allocated costs: {formatCurrency(reconstructionResult.trades.reduce((sum, trade) => sum + (trade.totalAllocatedCosts ?? trade.estimatedCosts), 0))}
                        </p>
                        <button
                          className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
                          type="button"
                          onClick={() => setShowAuditPreview(!showAuditPreview)}
                        >
                          {showAuditPreview ? "Hide audit preview" : "Review reconstructed trades"}
                        </button>
                      </div>
                      {showAuditPreview && (
                        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                          <table className="min-w-full divide-y divide-line text-sm">
                            <thead className="bg-panel text-left text-muted">
                              <tr>
                                <th className="px-3 py-2 font-medium">Symbol</th>
                                <th className="px-3 py-2 font-medium">Side</th>
                                <th className="px-3 py-2 font-medium">Qty</th>
                                <th className="px-3 py-2 font-medium">Entry</th>
                                <th className="px-3 py-2 font-medium">Exit</th>
                                <th className="px-3 py-2 font-medium">Source executions</th>
                                <th className="px-3 py-2 font-medium">Costs</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {reconstructionResult.trades.slice(0, 6).map((trade) => (
                                <tr key={trade.id}>
                                  <td className="px-3 py-2 font-medium">{trade.symbol}</td>
                                  <td className="px-3 py-2 text-muted">{trade.side}</td>
                                  <td className="px-3 py-2">{trade.quantity}</td>
                                  <td className="px-3 py-2 text-muted">{trade.entryTime}</td>
                                  <td className="px-3 py-2 text-muted">{trade.exitTime}</td>
                                  <td className="px-3 py-2 text-muted">{trade.sourceExecutionIds?.join(", ")}</td>
                                  <td className="px-3 py-2 text-warning">{formatCurrency(trade.totalAllocatedCosts ?? trade.estimatedCosts)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </DisclosurePanel>
              )}
              <DisclosurePanel
                className="mt-5"
                title="Import summary and excluded rows"
                subtitle={`${excludedRows.length} rows excluded. Expand for row-level import summary.`}
                compact
              >
                <ImportSummary
                  detection={importDetection}
                  rawRows={Math.max(0, rows.filter(Array.isArray).length - 1)}
                  mappedRows={executionTrades.length}
                  excludedRows={excludedRows}
                  reconstructedTrades={reconstructionResult?.summary.reconstructedTrades}
                  missingRequired={fieldMappings.filter((mapping) => mapping.status === "required_missing").map((mapping) => mapping.sourceColumn)}
                />
              </DisclosurePanel>
            </div>
          )}
          <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <p className="text-sm text-muted">
                {normalizedTrades.length} trades ready from {rows.length} uploaded rows
              </p>
              <FinalReportSummary
                className="mt-3"
                normalizedTradeCount={normalizedTrades.length}
                sourceLabel={detectedSourceLabel}
                costsDetected={costsDetected}
                rMultipleAvailable={rMultipleAvailable}
                reconstructionStatus={reconstructionStatus}
              />
              {reportLimitReached && (
                <div className="mt-3 border border-warning/50 bg-warning/10 p-3 text-sm text-warning">
                  You've reached the Free full-report limit. Upgrade to Pro to unlock the full strategy workflow.
                  {onViewPricing && (
                    <button className="ml-3 border-b border-warning/60 font-semibold text-warning" onClick={onViewPricing} type="button">
                      View Pricing
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="rounded-md border border-line bg-graphite px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                placeholder="Optional report name"
                value={reportName}
                onChange={(event) => setReportName(event.target.value)}
              />
              <button
                className="EdgeTrace-primary-button disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="run-diagnostics-button"
                disabled={!canRunDiagnostics || isRunning}
                onClick={runAnalysis}
              >
                {isRunning ? "Running..." : "Run Diagnostics & Create Report"}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-panel text-left text-muted">
                <tr>
                  {previewHeaders(rows).map((key) => (
                    <th key={key} className="px-4 py-3 font-medium">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, 6).map((row, index) => (
                  <tr key={index}>
                    {previewCells(row).map((value, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-3 text-muted">
                        {String(value ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {showStickyActionBar && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.12] bg-graphite/95 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="EdgeTrace-shell flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-ink">{actionStatus}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {normalizedTrades.length} trades detected - Detected source: {detectedSourceLabel}
              </p>
              <FinalReportSummary
                className="mt-2"
                compact
                normalizedTradeCount={normalizedTrades.length}
                sourceLabel={detectedSourceLabel}
                costsDetected={costsDetected}
                rMultipleAvailable={rMultipleAvailable}
                reconstructionStatus={reconstructionStatus}
              />
              {profile && <p className="mt-1 text-xs text-muted">{reportLimitSummary}</p>}
              {runBlockerMessage && <p className="mt-1 text-xs text-warning">{runBlockerMessage}</p>}
              {hasMappingCaveats && (
                <p className="mt-1 text-xs text-warning">
                  Some fields are missing or inferred. You can still create a report, but review mapping if results look wrong.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:items-center">
              {fieldMappings.length > 0 && (
                <button className="EdgeTrace-secondary-button w-full sm:w-auto" onClick={scrollToMappingReview} type="button">
                  Review Mapping
                </button>
              )}
              <button
                className="EdgeTrace-primary-button w-full px-6 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                data-testid="sticky-run-diagnostics-button"
                disabled={!canRunDiagnostics || isRunning}
                onClick={runAnalysis}
                type="button"
              >
                {isRunning ? "Running..." : "Run Diagnostics & Create Report"}
              </button>
              {reportLimitReached && onViewPricing && (
                <button className="EdgeTrace-secondary-button w-full sm:w-auto" onClick={onViewPricing} type="button">
                  View Pricing
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function applyReconstructionMode(
  trades: NormalizedTrade[],
  detection: ImportDetection | undefined,
  adapter: BrokerAdapter | undefined,
  enabled: boolean
): { trades: NormalizedTrade[]; reconstruction?: PositionReconstructionResult } {
  if (!enabled || !canReconstructBroker(trades, adapter)) return { trades };
  const reconstruction = reconstructPositions(trades, adapter?.brokerId);
  return { trades: reconstruction.trades, reconstruction };
}

function canReconstructBroker(trades: NormalizedTrade[], adapter: BrokerAdapter | undefined) {
  return (
    Boolean(adapter?.supportsExecutionReconstruction) &&
    trades.some((trade) => trade.brokerExecutionId || trade.openCloseIndicator || !trade.exitTime || trade.exitPrice === undefined)
  );
}

function prepareRowsForAdapter(rows: unknown[], mappings: FieldMapping[], adapter: BrokerAdapter | undefined) {
  if (adapter?.prepareRows) {
    return adapter.prepareRows(rows, mappings);
  }
  return { rows: applyMappings(rows, mappings), excludedRows: [] };
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

type ImportConfidenceStatus = "Ready" | "Review Recommended" | "Blocked";

function ImportConfidencePanel({
  status,
  detectedSource,
  confidence,
  mappedFieldsCount,
  normalizedTradeCount,
  excludedRowCount,
  warningsCount,
  reconstructionStatus,
  blockerMessage
}: {
  status: ImportConfidenceStatus;
  detectedSource: string;
  confidence: number;
  mappedFieldsCount: number;
  normalizedTradeCount: number;
  excludedRowCount: number;
  warningsCount: number;
  reconstructionStatus: string;
  blockerMessage?: string;
}) {
  const statusCopy =
    status === "Ready"
      ? "EdgeTrace found enough data to create a diagnostic report."
      : status === "Review Recommended"
        ? "Some fields were inferred or missing. You can still create a report, but review mapping if the report looks wrong."
        : "EdgeTrace cannot create a report until required fields are mapped.";
  const tone =
    status === "Ready"
      ? "border-profit/40 bg-profit/10 text-profit"
      : status === "Review Recommended"
        ? "border-warning/45 bg-warning/10 text-warning"
        : "border-loss/45 bg-loss/10 text-loss";

  return (
    <div className="mb-5 border border-white/[0.12] bg-white/[0.035] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Import Confidence</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={`border px-3 py-1.5 text-sm font-semibold ${tone}`}>{status}</span>
            <span className="text-sm text-muted">Detected source: <span className="text-ink">{detectedSource}</span></span>
            <span className="text-sm text-muted">Confidence: <span className="text-ink">{confidence}%</span></span>
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{statusCopy}</p>
          {blockerMessage && status === "Blocked" && <p className="mt-2 text-sm text-warning">{blockerMessage}</p>}
        </div>
        <div className="grid min-w-full gap-2 text-sm sm:grid-cols-2 lg:min-w-[520px] xl:grid-cols-3">
          <ConfidenceMetric label="Mapped fields" value={mappedFieldsCount} />
          <ConfidenceMetric label="Trades normalized" value={normalizedTradeCount} />
          <ConfidenceMetric label="Excluded rows" value={excludedRowCount} />
          <ConfidenceMetric label="Warnings" value={warningsCount} />
          <ConfidenceMetric label="Reconstruction" value={reconstructionStatus} wide />
        </div>
      </div>
    </div>
  );
}

function ConfidenceMetric({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={`border border-white/[0.1] bg-black/25 px-3 py-3 ${wide ? "sm:col-span-2 xl:col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function FinalReportSummary({
  normalizedTradeCount,
  sourceLabel,
  costsDetected,
  rMultipleAvailable,
  reconstructionStatus,
  compact,
  className = ""
}: {
  normalizedTradeCount: number;
  sourceLabel: string;
  costsDetected: boolean;
  rMultipleAvailable: boolean;
  reconstructionStatus: string;
  compact?: boolean;
  className?: string;
}) {
  const items = [
    `${normalizedTradeCount} normalized trades`,
    `Source: ${sourceLabel}`,
    `Costs detected: ${costsDetected ? "Yes" : "No"}`,
    `R-multiple available: ${rMultipleAvailable ? "Yes" : "No"}`,
    `Reconstruction: ${reconstructionStatus}`
  ];
  return (
    <div className={className}>
      {!compact && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ready to create report from</p>}
      <div className={`flex flex-wrap gap-2 ${compact ? "text-[11px]" : "text-xs"}`}>
        {items.map((item) => (
          <span key={item} className="border border-white/[0.1] bg-black/20 px-2.5 py-1 text-muted">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ImportDiagnosticsPanel({
  selected,
  autoDetected,
  results,
  sourceOverride
}: {
  selected: AdapterDetectionResult | undefined;
  autoDetected: AdapterDetectionResult | undefined;
  results: AdapterDetectionResult[];
  sourceOverride: ImportSourceOverride;
}) {
  const [open, setOpen] = useState(true);
  const active = selected ?? autoDetected;
  const runnerUp = results.find((result) => result.brokerId !== active?.brokerId);
  if (!active) return null;

  const confidenceGap = runnerUp ? active.confidence - runnerUp.confidence : active.confidence;
  const confidenceLabel = active.confidence >= 80 ? "High" : active.confidence >= 50 ? "Medium" : "Low";

  return (
    <div className="mt-5 rounded-lg border border-line bg-graphite">
      <button
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        type="button"
        onClick={() => setOpen(!open)}
      >
        <div>
          <p className="text-sm font-semibold">Why this file was detected as {active.displayName}</p>
          <p className="mt-1 text-xs text-muted">
            Runner-up: {runnerUp?.displayName ?? "None"} {runnerUp ? `${runnerUp.confidence}%` : ""} · Confidence gap {confidenceGap}%
          </p>
        </div>
        <span className="text-sm text-accent">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-line p-4">
          {sourceOverride !== "auto" && autoDetected && selected && autoDetected.brokerId !== selected.brokerId && (
            <div className="mb-4 rounded-md border border-warning/60 bg-warning/10 p-3 text-sm text-warning">
              Auto-detected {autoDetected.displayName}. You manually selected {selected.displayName}. Field mappings and reconstruction behavior now follow that adapter.
            </div>
          )}

          {active.confidence < 50 && (
            <div className="mb-4 rounded-md border border-loss/60 bg-loss/10 p-3 text-sm text-loss">
              Low-confidence import detection. Review field mappings before running diagnostics.
              {active.confidence < 30 ? " Manual mapping recommended." : ""}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Detection Summary</p>
              <p className="mt-2 text-lg font-semibold">{active.displayName}</p>
              <p className="mt-1 text-sm text-muted">
                {active.confidence}% confidence · {confidenceLabel}
              </p>
            </div>
            <SignalList title="Matched Header Signals" items={active.matchedHeaders} empty="No important headers matched." />
            <SignalList title="Missing Useful Headers" items={active.missingImportantHeaders.slice(0, 8)} empty="No major header gaps detected." />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="min-w-full divide-y divide-line text-sm">
                <thead className="bg-panel text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Broker</th>
                    <th className="px-3 py-2 font-medium">Confidence</th>
                    <th className="px-3 py-2 font-medium">Matched</th>
                    <th className="px-3 py-2 font-medium">Key reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {results.map((result) => (
                    <tr key={result.brokerId} className={result.brokerId === active.brokerId ? "bg-accent/5" : ""}>
                      <td className="px-3 py-2 font-medium">{result.displayName}</td>
                      <td className="px-3 py-2 text-muted">{result.confidence}%</td>
                      <td className="px-3 py-2 text-muted">{result.matchedHeaders.length}</td>
                      <td className="px-3 py-2 text-muted">{result.signalReasons[0] ?? "No signal"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-line bg-panel p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Import Warnings</p>
              <ul className="mt-3 space-y-2 text-sm text-warning">
                {active.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Signal Reasons</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {active.signalReasons.map((reason) => (
                <span key={reason} className="rounded-full border border-line px-3 py-1 text-sm text-muted">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{title}</p>
      {items.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

function countUsedExecutions(trades: NormalizedTrade[]) {
  return new Set(trades.flatMap((trade) => trade.sourceExecutionIds ?? [])).size;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function composeWarnings(
  uploadWarning: string | undefined,
  detection: ImportDetection | undefined,
  mappings: FieldMapping[],
  normalizedTradeCount: number,
  reconstruction: PositionReconstructionResult | undefined,
  excludedRows: ExcludedImportRow[],
  adapter: BrokerAdapter | undefined
) {
  return [
    uploadWarning,
    ...getImportWarnings(detection ?? { type: "generic_csv", label: "Generic CSV", confidence: 70 }, mappings, normalizedTradeCount),
    ...(adapter?.getWarnings?.(excludedRows) ?? []),
    ...(reconstruction?.summary.reconstructionWarnings ?? [])
  ]
    .filter(Boolean)
    .join(" ");
}

function ImportSummary({
  detection,
  rawRows,
  mappedRows,
  excludedRows,
  reconstructedTrades,
  missingRequired
}: {
  detection: ImportDetection;
  rawRows: number;
  mappedRows: number;
  excludedRows: ExcludedImportRow[];
  reconstructedTrades?: number;
  missingRequired: string[];
}) {
  return (
    <div className="mt-5 rounded-lg border border-line bg-graphite p-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryStat label="Raw rows" value={rawRows} />
        <SummaryStat label="Mapped rows" value={mappedRows} />
        <SummaryStat label="Excluded rows" value={excludedRows.length} />
        <SummaryStat label="Reconstructed" value={reconstructedTrades ?? 0} />
        <SummaryStat label="Missing fields" value={missingRequired.length} />
        <SummaryStat label="Confidence" value={detection.confidence} />
      </div>
      {excludedRows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-panel text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {excludedRows.slice(0, 8).map((row) => (
                <tr key={`${row.rowNumber}-${row.reason}`}>
                  <td className="px-3 py-2 text-muted">{row.rowNumber}</td>
                  <td className="px-3 py-2 text-warning">{row.reason}</td>
                  <td className="px-3 py-2">{row.action || "N/A"}</td>
                  <td className="px-3 py-2 text-muted">{row.description || "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function isSectionedIbkrStatement(rows: unknown[]) {
  return rows.some((row) => {
    if (!Array.isArray(row)) return false;
    const section = String(row[0] ?? "").trim().toLowerCase();
    const rowType = String(row[1] ?? "").trim().toLowerCase();
    return rowType === "header" && ["statement", "account information", "trades", "cash report"].includes(section);
  });
}

function previewHeaders(rows: unknown[]) {
  const first = rows[0];
  if (Array.isArray(first)) {
    return first.slice(0, 8).map((value, index) => String(value || `Column ${index + 1}`));
  }
  return Object.keys((first ?? {}) as Record<string, unknown>).slice(0, 8);
}

function previewCells(row: unknown) {
  if (Array.isArray(row)) return row.slice(0, 8);
  const objectRow = (row ?? {}) as Record<string, unknown>;
  return Object.keys(objectRow)
    .slice(0, 8)
    .map((key) => objectRow[key]);
}

function getTradeCosts(trade: NormalizedTrade) {
  return Math.abs((trade.commission ?? 0) + (trade.fees ?? 0) + (trade.estimatedCosts ?? 0) + (trade.totalAllocatedCosts ?? 0));
}

function buildImportWarningList({
  warning,
  normalizedTrades,
  fieldMappings,
  excludedRows,
  reconstructionResult,
  costsDetected,
  rMultipleAvailable
}: {
  warning: string;
  normalizedTrades: NormalizedTrade[];
  fieldMappings: FieldMapping[];
  excludedRows: ExcludedImportRow[];
  reconstructionResult?: PositionReconstructionResult;
  costsDetected: boolean;
  rMultipleAvailable: boolean;
}) {
  const warnings = new Set<string>();
  if (warning) warnings.add(warning);
  if (fieldMappings.some((mapping) => mapping.status === "unmapped")) warnings.add("Some source columns are not mapped.");
  if (fieldMappings.some((mapping) => mapping.status === "required_missing")) warnings.add("Required fields are missing.");
  if (excludedRows.length) warnings.add(`${excludedRows.length} non-trade or incomplete rows were excluded.`);
  if (normalizedTrades.length && !costsDetected) warnings.add("Cost data was not detected.");
  if (normalizedTrades.length && !rMultipleAvailable) warnings.add("R-multiple data was not detected.");
  for (const reconstructionWarning of reconstructionResult?.summary.reconstructionWarnings ?? []) {
    warnings.add(reconstructionWarning);
  }
  return Array.from(warnings);
}

function buildImportProvenance({
  uploadedFilename,
  detectedSourceLabel,
  sourceOverride,
  activeAdapter,
  detectionConfidence,
  importConfidenceStatus,
  mappedFieldsCount,
  normalizedTrades,
  excludedRows,
  importWarnings,
  missingRequiredFields,
  costsDetected,
  rMultipleAvailable,
  reconstructIbkr,
  reconstructionResult
}: {
  uploadedFilename: string;
  detectedSourceLabel: string;
  sourceOverride: ImportSourceOverride;
  activeAdapter?: BrokerAdapter;
  detectionConfidence: number;
  importConfidenceStatus: ImportConfidenceStatus;
  mappedFieldsCount: number;
  normalizedTrades: NormalizedTrade[];
  excludedRows: ExcludedImportRow[];
  importWarnings: string[];
  missingRequiredFields: string[];
  costsDetected: boolean;
  rMultipleAvailable: boolean;
  reconstructIbkr: boolean;
  reconstructionResult?: PositionReconstructionResult;
}): ImportProvenance {
  return {
    originalFilename: uploadedFilename || undefined,
    importedAt: new Date().toISOString(),
    detectedSource: detectedSourceLabel,
    selectedSource: sourceOverride === "auto" ? detectedSourceLabel : activeAdapter?.displayName ?? sourceOverride,
    brokerId: activeAdapter?.brokerId,
    brokerDisplayName: activeAdapter?.displayName,
    detectionConfidence,
    confidenceLabel: importConfidenceStatus,
    mappedFieldsCount,
    normalizedTradeCount: normalizedTrades.length,
    excludedRowCount: excludedRows.length,
    warningCount: importWarnings.length,
    warnings: importWarnings.slice(0, 12),
    missingRequiredFields,
    costsDetected,
    rMultipleDetected: rMultipleAvailable,
    reconstructionEnabled: Boolean(reconstructIbkr && reconstructionResult),
    reconstructionSummary: reconstructionResult
      ? {
          rawExecutions: reconstructionResult.summary.rawExecutionRows,
          completedTrades: reconstructionResult.summary.reconstructedTrades,
          openPositions: reconstructionResult.summary.openPositionsRemaining,
          partialExits: reconstructionResult.summary.partialExitsDetected,
          positionFlips: reconstructionResult.summary.positionFlipsDetected,
          warnings: reconstructionResult.summary.reconstructionWarnings.slice(0, 10)
        }
      : undefined
  };
}

function formatUploadError(error: unknown, context: "csv_parse" | "html_parse" | "normalize" | "diagnostics") {
  const message = error instanceof Error ? error.message : "";
  if (/PLAN_LIMIT_REACHED|free report limit|reached the Free report limit/i.test(message)) {
    return "You've reached the Free full-report limit. Upgrade to Pro to unlock the full strategy workflow, or delete an older non-demo report.";
  }
  if (/generic csv imports only|broker-specific/i.test(message)) {
    return "This broker export is not available on the Free plan. Use a generic CSV export or upgrade to Pro to unlock all broker imports.";
  }
  if (/missing required fields/i.test(message)) {
    return `${message} Review the field mapping, then run diagnostics again.`;
  }
  if (context === "csv_parse") {
    return "EdgeTrace could not read this CSV. Confirm it is a valid comma-separated file exported from your broker, then upload it again.";
  }
  if (context === "html_parse") {
    return "EdgeTrace could not read this HTML statement. Confirm it contains broker trade confirmations, then upload it again.";
  }
  if (context === "normalize") {
    return message || "EdgeTrace could not find enough completed trade data in this file. Review source detection and field mappings before trying again.";
  }
  if (/network|fetch|failed to fetch/i.test(message)) {
    return "EdgeTrace could not reach the diagnostics service. Check your connection and try again.";
  }
  return message || "Diagnostics could not run on this upload. Check normalized trades and try again.";
}

function isDemoReport(report: ReportSummary) {
  return (
    report.name.startsWith("Demo Report") ||
    report.name.startsWith("ORB Demo") ||
    report.strategyLabel === "ORB Demo Strategy" ||
    (report.tags ?? []).some((tag) => tag.toLowerCase() === "demo")
  );
}

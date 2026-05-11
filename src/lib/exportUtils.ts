import type { DiagnosticsResult, NormalizedTrade } from "../types";

type CsvValue = string | number | boolean | null | undefined | string[];
type CsvRow = Record<string, CsvValue>;

export function downloadCsv(filename: string, rows: CsvRow[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ].join("\r\n");
  downloadBlob(sanitizeFilename(filename), csv, "text/csv;charset=utf-8");
}

export function downloadJson(filename: string, data: unknown) {
  downloadBlob(sanitizeFilename(filename), JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}

export function buildReconstructionAuditCsvRows(report: DiagnosticsResult, trades: NormalizedTrade[]): CsvRow[] {
  return trades.map((trade) => ({
    reportId: report.id,
    tradeId: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    quantity: trade.quantity,
    averageEntryPrice: trade.averageEntryPrice ?? trade.entryPrice,
    averageExitPrice: trade.averageExitPrice ?? trade.exitPrice,
    grossPnl: trade.grossPnl,
    allocatedEntryCosts: trade.allocatedEntryCosts,
    allocatedExitCosts: trade.allocatedExitCosts,
    totalAllocatedCosts: trade.totalAllocatedCosts ?? trade.estimatedCosts,
    netPnl: trade.netPnl,
    entryExecutionCount: trade.entryExecutionCount,
    exitExecutionCount: trade.exitExecutionCount,
    sourceExecutionIds: trade.sourceExecutionIds,
    reconstructionMethod: trade.reconstructionMethod,
    reconstructionWarnings: trade.reconstructionWarnings
  }));
}

export function buildReconstructionAuditJson(report: DiagnosticsResult, trades: NormalizedTrade[]) {
  return {
    report: {
      id: report.id,
      name: report.name,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt
    },
    exportedAt: new Date().toISOString(),
    reconstructedTrades: trades.map((trade) => ({
      tradeId: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      quantity: trade.quantity,
      averageEntryPrice: trade.averageEntryPrice ?? trade.entryPrice,
      averageExitPrice: trade.averageExitPrice ?? trade.exitPrice,
      grossPnl: trade.grossPnl,
      allocatedEntryCosts: trade.allocatedEntryCosts,
      allocatedExitCosts: trade.allocatedExitCosts,
      totalAllocatedCosts: trade.totalAllocatedCosts ?? trade.estimatedCosts,
      netPnl: trade.netPnl,
      entryExecutionCount: trade.entryExecutionCount,
      exitExecutionCount: trade.exitExecutionCount,
      sourceExecutionIds: trade.sourceExecutionIds ?? [],
      reconstructionMethod: trade.reconstructionMethod,
      reconstructionWarnings: trade.reconstructionWarnings ?? [],
      positionPath: trade.positionPath ?? []
    }))
  };
}

export function reconstructionAuditFilename(report: DiagnosticsResult, extension: "csv" | "json") {
  return `edgetrace-reconstruction-audit-${reportSlug(report)}-${timestampSlug()}.${extension}`;
}

export function reconstructionTradeFilename(trade: NormalizedTrade, extension: "csv" | "json") {
  return `edgetrace-reconstruction-trade-${trade.symbol}-${trade.id}.${extension}`;
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: CsvValue) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function reportSlug(report: DiagnosticsResult) {
  return sanitizeFilename(report.name || report.id).replace(/\.[^.]+$/, "");
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
    .slice(0, 180);
}

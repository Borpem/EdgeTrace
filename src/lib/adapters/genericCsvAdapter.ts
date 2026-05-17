import type { EdgeTraceField, FieldMapping } from "../importAdapters";

export const genericFieldCandidates: Record<string, string[]> = {
  symbol: ["symbol", "ticker"],
  rawSide: ["side", "direction", "buy_sell"],
  entryTime: ["entry_time", "open_time"],
  exitTime: ["exit_time", "close_time"],
  entryPrice: ["entry_price", "avg_entry"],
  exitPrice: ["exit_price", "avg_exit"],
  quantity: ["quantity", "shares", "contracts"],
  commission: ["commission"],
  fees: ["fees"],
  strategy: ["strategy"],
  plannedStop: ["planned_stop"],
  plannedTarget: ["planned_target"],
  actualPnl: ["actual_pnl", "pnl", "net_pnl"]
};

export function createGenericMappings(headers: string[]): FieldMapping[] {
  const usedTargets = new Set<string>();
  return headers.map((sourceColumn) => {
    const normalized = normalizeHeader(sourceColumn);
    const match = Object.entries(genericFieldCandidates).find(([, candidates]) =>
      candidates.some((candidate) => normalizeHeader(candidate) === normalized)
    );
    const targetField = match && !usedTargets.has(match[0]) ? (match[0] as EdgeTraceField) : undefined;
    if (targetField) usedTargets.add(targetField);
    return {
      sourceColumn,
      targetField,
      confidence: targetField ? 95 : 0,
      status: targetField ? ("mapped" as const) : ("unmapped" as const)
    };
  });
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

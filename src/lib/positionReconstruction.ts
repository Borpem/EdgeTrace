import { reconstructIbkrExecutions, type IbkrReconstructionResult } from "./ibkrReconstruction";
import type { NormalizedTrade } from "../types";

export type PositionReconstructionResult = IbkrReconstructionResult;

export function reconstructPositions(executions: NormalizedTrade[], brokerLabel = "broker") {
  const result = reconstructIbkrExecutions(executions);
  return {
    ...result,
    trades: result.trades.map((trade) => ({
      ...trade,
      reconstructionMethod: `${brokerLabel === "broker" ? "generic" : brokerLabel}_position_tracking_v1`
    }))
  };
}

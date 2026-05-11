import type { NormalizedTrade, TradeSide } from "../types";

type PositionState = {
  quantity: number;
  averageEntryPrice: number;
  entryTime: string;
  commissionRemaining: number;
  feesRemaining: number;
  sourceExecutionIds: string[];
  entryExecutionCount: number;
  currency?: string;
  assetCategory?: string;
  positionPath: NonNullable<NormalizedTrade["positionPath"]>;
};

export type IbkrReconstructionSummary = {
  rawExecutionRows: number;
  reconstructedTrades: number;
  openPositionsRemaining: number;
  partialExitsDetected: number;
  positionFlipsDetected: number;
  reconstructionWarnings: string[];
};

export type IbkrReconstructionResult = {
  trades: NormalizedTrade[];
  summary: IbkrReconstructionSummary;
};

export function reconstructIbkrExecutions(executions: NormalizedTrade[]): IbkrReconstructionResult {
  const warnings = new Set<string>();
  const trades: NormalizedTrade[] = [];
  const groups = groupExecutions(executions);
  let partialExitsDetected = 0;
  let positionFlipsDetected = 0;
  let openPositionsRemaining = 0;

  groups.forEach((groupExecutions) => {
    const sorted = [...groupExecutions].sort((a, b) => Date.parse(a.entryTime) - Date.parse(b.entryTime));
    let position: PositionState | undefined;

    sorted.forEach((execution) => {
      const signedQuantity = execution.side === "long" ? Math.abs(execution.quantity) : -Math.abs(execution.quantity);
      const executionAbsQuantity = Math.abs(signedQuantity);
      if (!executionAbsQuantity || !Number.isFinite(execution.entryPrice)) return;

      let remainingSignedQuantity = signedQuantity;
      const executionCommissionPerUnit = Math.abs(execution.commission ?? 0) / executionAbsQuantity;
      const executionFeesPerUnit = Math.abs(execution.fees ?? 0) / executionAbsQuantity;

      if (!position || Math.abs(position.quantity) < 0.000001) {
        if (isCloseIndicator(execution.openCloseIndicator)) {
          warnings.add(`${execution.symbol}: close indicator appeared without an open tracked position.`);
        }
        position = openPosition(execution, remainingSignedQuantity);
        return;
      }

      if (Math.sign(position.quantity) === Math.sign(remainingSignedQuantity)) {
        if (isCloseIndicator(execution.openCloseIndicator)) {
          warnings.add(`${execution.symbol}: close indicator conflicted with position tracking; treated as position increase.`);
        }
        position = addToPosition(position, execution, remainingSignedQuantity);
        return;
      }

      if (isOpenIndicator(execution.openCloseIndicator)) {
        warnings.add(`${execution.symbol}: open indicator conflicted with position tracking; treated as position reduction.`);
      }

      const positionBeforeClose = position;
      const positionAbsQuantity = Math.abs(positionBeforeClose.quantity);
      const closeQuantity = Math.min(positionAbsQuantity, Math.abs(remainingSignedQuantity));
      const entryRatio = closeQuantity / positionAbsQuantity;
      const exitRatio = closeQuantity / executionAbsQuantity;
      const entryCommission = positionBeforeClose.commissionRemaining * entryRatio;
      const entryFees = positionBeforeClose.feesRemaining * entryRatio;
      const exitCommission = executionCommissionPerUnit * closeQuantity;
      const exitFees = executionFeesPerUnit * closeQuantity;
      const allocatedEntryCosts = entryCommission + entryFees;
      const allocatedExitCosts = exitCommission + exitFees;
      const side: TradeSide = positionBeforeClose.quantity > 0 ? "long" : "short";
      const grossPnl =
        side === "long"
          ? (execution.entryPrice - positionBeforeClose.averageEntryPrice) * closeQuantity
          : (positionBeforeClose.averageEntryPrice - execution.entryPrice) * closeQuantity;
      const commission = entryCommission + exitCommission;
      const fees = entryFees + exitFees;
      const estimatedCosts = commission + fees;
      const executionId = execution.brokerExecutionId ?? execution.id;
      const positionAfterClose =
        positionBeforeClose.quantity - Math.sign(positionBeforeClose.quantity) * closeQuantity;
      const exitPathRole = Math.abs(remainingSignedQuantity) > positionAbsQuantity ? "flip" : "exit";
      const positionPath: NonNullable<NormalizedTrade["positionPath"]> = [
        ...positionBeforeClose.positionPath,
        {
          executionTime: execution.entryTime,
          action: execution.side === "long" ? "BUY" : "SELL",
          quantity: closeQuantity,
          price: execution.entryPrice,
          positionBefore: positionBeforeClose.quantity,
          positionAfter: Math.abs(positionAfterClose) < 0.000001 ? 0 : positionAfterClose,
          role: exitPathRole
        }
      ];

      if (closeQuantity < positionAbsQuantity) partialExitsDetected += 1;
      if (Math.abs(remainingSignedQuantity) > positionAbsQuantity) positionFlipsDetected += 1;

      trades.push({
        id: `ibkr-reconstructed-${trades.length + 1}`,
        symbol: execution.symbol,
        side,
        entryTime: positionBeforeClose.entryTime,
        exitTime: execution.entryTime,
        entryPrice: positionBeforeClose.averageEntryPrice,
        exitPrice: execution.entryPrice,
        quantity: closeQuantity,
        commission,
        fees,
        currency: execution.currency ?? positionBeforeClose.currency,
        assetCategory: execution.assetCategory ?? positionBeforeClose.assetCategory,
        brokerExecutionId: execution.brokerExecutionId,
        brokerOrderId: execution.brokerOrderId,
        sourceExecutionIds: [...positionBeforeClose.sourceExecutionIds, executionId],
        reconstructionMethod: "ibkr_position_tracking_v1",
        reconstructionWarnings: [],
        entryExecutionCount: positionBeforeClose.entryExecutionCount,
        exitExecutionCount: 1,
        averageEntryPrice: positionBeforeClose.averageEntryPrice,
        averageExitPrice: execution.entryPrice,
        allocatedEntryCosts,
        allocatedExitCosts,
        totalAllocatedCosts: estimatedCosts,
        positionPath,
        grossPnl,
        estimatedCosts,
        netPnl: grossPnl - estimatedCosts
      });

      position.quantity -= Math.sign(positionBeforeClose.quantity) * closeQuantity;
      position.commissionRemaining -= entryCommission;
      position.feesRemaining -= entryFees;
      remainingSignedQuantity -= Math.sign(remainingSignedQuantity) * closeQuantity;

      if (Math.abs(position.quantity) < 0.000001) {
        position = undefined;
      }

      if (Math.abs(remainingSignedQuantity) > 0.000001) {
        const remainingRatio = Math.abs(remainingSignedQuantity) / executionAbsQuantity;
        position = {
          quantity: remainingSignedQuantity,
          averageEntryPrice: execution.entryPrice,
          entryTime: execution.entryTime,
          commissionRemaining: Math.abs(execution.commission ?? 0) * remainingRatio,
          feesRemaining: Math.abs(execution.fees ?? 0) * remainingRatio,
          sourceExecutionIds: [executionId],
          entryExecutionCount: 1,
          currency: execution.currency,
          assetCategory: execution.assetCategory,
          positionPath: [
            {
              executionTime: execution.entryTime,
              action: execution.side === "long" ? "BUY" : "SELL",
              quantity: Math.abs(remainingSignedQuantity),
              price: execution.entryPrice,
              positionBefore: 0,
              positionAfter: remainingSignedQuantity,
              role: "flip"
            }
          ]
        };
      }
    });

    if (position && Math.abs(position.quantity) > 0.000001) openPositionsRemaining += 1;
  });

  if (openPositionsRemaining) {
    warnings.add("Some executions appear to leave open positions. These were not included as completed trades.");
  }
  if (partialExitsDetected) {
    warnings.add("Partial exits were converted into proportional completed trades.");
  }
  if (positionFlipsDetected) {
    warnings.add("Some executions both closed an existing position and opened a new one.");
  }
  if (executions.length) {
    warnings.add("Reconstruction is based on execution sequencing and may differ from broker tax-lot accounting.");
  }

  const reconstructionWarnings = [...warnings];
  return {
    trades: trades.map((trade) => ({ ...trade, reconstructionWarnings })),
    summary: {
      rawExecutionRows: executions.length,
      reconstructedTrades: trades.length,
      openPositionsRemaining,
      partialExitsDetected,
      positionFlipsDetected,
      reconstructionWarnings
    }
  };
}

function groupExecutions(executions: NormalizedTrade[]) {
  return executions.reduce((groups, execution) => {
    const key = [execution.symbol, execution.assetCategory ?? "", execution.currency ?? ""].join("|");
    groups.set(key, [...(groups.get(key) ?? []), execution]);
    return groups;
  }, new Map<string, NormalizedTrade[]>());
}

function openPosition(execution: NormalizedTrade, signedQuantity: number): PositionState {
  return {
    quantity: signedQuantity,
    averageEntryPrice: execution.entryPrice,
    entryTime: execution.entryTime,
    commissionRemaining: Math.abs(execution.commission ?? 0),
    feesRemaining: Math.abs(execution.fees ?? 0),
    sourceExecutionIds: [execution.brokerExecutionId ?? execution.id],
    entryExecutionCount: 1,
    currency: execution.currency,
    assetCategory: execution.assetCategory,
    positionPath: [
      {
        executionTime: execution.entryTime,
        action: execution.side === "long" ? "BUY" : "SELL",
        quantity: Math.abs(signedQuantity),
        price: execution.entryPrice,
        positionBefore: 0,
        positionAfter: signedQuantity,
        role: "entry"
      }
    ]
  };
}

function addToPosition(position: PositionState, execution: NormalizedTrade, signedQuantity: number): PositionState {
  const currentAbsQuantity = Math.abs(position.quantity);
  const addedAbsQuantity = Math.abs(signedQuantity);
  const nextAbsQuantity = currentAbsQuantity + addedAbsQuantity;
  return {
    ...position,
    quantity: position.quantity + signedQuantity,
    averageEntryPrice:
      (position.averageEntryPrice * currentAbsQuantity + execution.entryPrice * addedAbsQuantity) / nextAbsQuantity,
    commissionRemaining: position.commissionRemaining + Math.abs(execution.commission ?? 0),
    feesRemaining: position.feesRemaining + Math.abs(execution.fees ?? 0),
    sourceExecutionIds: [...position.sourceExecutionIds, execution.brokerExecutionId ?? execution.id],
    entryExecutionCount: position.entryExecutionCount + 1,
    positionPath: [
      ...position.positionPath,
      {
        executionTime: execution.entryTime,
        action: execution.side === "long" ? "BUY" : "SELL",
        quantity: Math.abs(signedQuantity),
        price: execution.entryPrice,
        positionBefore: position.quantity,
        positionAfter: position.quantity + signedQuantity,
        role: "entry"
      }
    ]
  };
}

function isOpenIndicator(value?: string) {
  return String(value ?? "").trim().toUpperCase().startsWith("O");
}

function isCloseIndicator(value?: string) {
  return String(value ?? "").trim().toUpperCase().startsWith("C");
}

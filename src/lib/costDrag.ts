export type CostDragState =
  | {
      type: "percentage";
      value: number;
      label: string;
    }
  | {
      type: "pre_cost_unprofitable";
      label: string;
    }
  | {
      type: "no_cost_data";
      label: string;
    }
  | {
      type: "insufficient_data";
      label: string;
    };

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1
});

export function classifyCostDrag({
  grossPnl,
  totalCosts,
  totalTrades,
  minTrades = 1
}: {
  grossPnl: number;
  totalCosts: number;
  totalTrades: number;
  minTrades?: number;
}): CostDragState {
  if (totalTrades < minTrades) {
    return { type: "insufficient_data", label: "Insufficient data" };
  }

  if (totalCosts === 0) {
    return { type: "no_cost_data", label: "No cost data" };
  }

  if (grossPnl > 0) {
    const value = totalCosts / grossPnl;
    return { type: "percentage", value, label: percent.format(value) };
  }

  return { type: "pre_cost_unprofitable", label: "Pre-cost unprofitable" };
}

export function costDragSortValue(state: CostDragState) {
  if (state.type === "percentage") return state.value;
  if (state.type === "pre_cost_unprofitable") return Number.POSITIVE_INFINITY;
  if (state.type === "no_cost_data") return Number.NEGATIVE_INFINITY;
  return Number.NEGATIVE_INFINITY + 1;
}

export function numericCostDrag(state: CostDragState) {
  return state.type === "percentage" ? state.value : undefined;
}

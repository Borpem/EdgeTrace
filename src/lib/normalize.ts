import type { NormalizedTrade, TradeSide } from "../types";

const fieldMap: Record<string, keyof NormalizedTrade | "rawSide"> = {
  symbol: "symbol",
  ticker: "symbol",
  side: "rawSide",
  direction: "rawSide",
  buy_sell: "rawSide",
  buysell: "rawSide",
  rawside: "rawSide",
  entry_time: "entryTime",
  open_time: "entryTime",
  entrytime: "entryTime",
  opentime: "entryTime",
  exit_time: "exitTime",
  close_time: "exitTime",
  exittime: "exitTime",
  closetime: "exitTime",
  entry_price: "entryPrice",
  avg_entry: "entryPrice",
  entryprice: "entryPrice",
  avgentry: "entryPrice",
  exit_price: "exitPrice",
  avg_exit: "exitPrice",
  exitprice: "exitPrice",
  avgexit: "exitPrice",
  quantity: "quantity",
  shares: "quantity",
  contracts: "quantity",
  commission: "commission",
  fees: "fees",
  strategy: "strategy",
  setup: "setup",
  planned_stop: "plannedStop",
  plannedstop: "plannedStop",
  planned_target: "plannedTarget",
  plannedtarget: "plannedTarget",
  actual_pnl: "actualPnl",
  actualpnl: "actualPnl",
  pnl: "actualPnl",
  net_pnl: "actualPnl",
  netpnl: "actualPnl",
  currency: "currency",
  assetcategory: "assetCategory",
  brokerorderid: "brokerOrderId",
  brokerexecutionid: "brokerExecutionId",
  opencloseindicator: "openCloseIndicator",
  brokerimportid: "brokerImportId",
  description: "description",
  account: "account",
  cusip: "cusip",
  settlementdate: "settlementDate",
  ordertype: "orderType",
  status: "status",
  proceeds: "proceeds",
  costbasis: "costBasis"
};

type RawRow = Record<string, unknown>;
type RawArrayRow = unknown[];

type IbkrExecution = {
  symbol: string;
  time: string;
  quantity: number;
  price: number;
  commission: number;
  fee: number;
};

const toNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  const negative = /^\(.*\)$/.test(text);
  const parsed = Number(text.replace(/[()$,\s]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : undefined;
};

const toSide = (value: unknown): TradeSide | undefined => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["long", "buy", "bought", "bot", "b", "l", "buy to cover", "bought to cover", "cover", "you bought"].includes(normalized)) return "long";
  if (["short", "sell", "sold", "sld", "s", "sell short", "sold short", "short sale", "you sold"].includes(normalized)) return "short";
  return undefined;
};

export function normalizeTrades(rows: unknown[]): NormalizedTrade[] {
  const safeRows = Array.isArray(rows) ? rows.filter((row) => row !== null && row !== undefined) : [];
  const htmlRow = safeRows.find(isHtmlRow);
  if (htmlRow) return normalizeIbkrHtml(String(htmlRow.content ?? ""));

  if (safeRows.some(Array.isArray)) {
    return normalizeArrayRows(safeRows.filter(Array.isArray) as RawArrayRow[]);
  }

  return normalizeObjectRows(safeRows.filter(isRawRow));
}

export function describeNormalizationIssue(rows: unknown[]) {
  const safeRows = Array.isArray(rows) ? rows.filter((row) => row !== null && row !== undefined) : [];
  const arrayRows = safeRows.filter(Array.isArray) as RawArrayRow[];
  if (arrayRows.length && isIbkrLikeStatement(arrayRows) && !isIbkrStatement(arrayRows)) {
    return "This looks like an IBKR Activity Statement, but it does not contain a Trades section. Export an Activity Statement that includes Trades, or select a date range with executions.";
  }
  if (arrayRows.length && isIbkrStatement(arrayRows)) {
    return "IBKR statement detected, but no realized trade rows were found. Opening trades without Realized P/L are skipped until they are closed.";
  }
  const htmlRow = safeRows.find(isHtmlRow);
  if (htmlRow) {
    return "IBKR HTML trade confirmation detected, but no closed round-trip trades could be reconstructed from the executions.";
  }
  return undefined;
}

function isHtmlRow(row: unknown): row is { sourceType: "html"; content: string } {
  return isRawRow(row) && row.sourceType === "html" && typeof row.content === "string";
}

function isRawRow(row: unknown): row is RawRow {
  return typeof row === "object" && row !== null && !Array.isArray(row);
}

function normalizeObjectRows(rows: RawRow[]): NormalizedTrade[] {
  return rows.flatMap((row, index) => {
    const mapped: Record<string, unknown> = {};

    Object.entries(row).forEach(([key, value]) => {
      const normalizedKey = normalizeKey(key);
      const target = fieldMap[normalizedKey];
      if (target) mapped[target] = value;
    });

    const symbol = String(mapped.symbol ?? "").trim().toUpperCase();
    const side = toSide(mapped.rawSide);
    const entryTime = String(mapped.entryTime ?? "").trim();
    const exitTime = String(mapped.exitTime ?? "").trim() || undefined;
    const entryPrice = toNumber(mapped.entryPrice);
    const exitPrice = toNumber(mapped.exitPrice);
    const quantityValue = toNumber(mapped.quantity);
    const quantity = quantityValue === undefined ? undefined : Math.abs(quantityValue);
    const commission = Math.abs(toNumber(mapped.commission) ?? 0);
    const fees = Math.abs(toNumber(mapped.fees) ?? 0);
    const plannedStop = toNumber(mapped.plannedStop);
    const plannedTarget = toNumber(mapped.plannedTarget);
    const actualPnl = toNumber(mapped.actualPnl);
    const proceeds = toNumber(mapped.proceeds);
    const costBasis = toNumber(mapped.costBasis);

    if (!symbol || !side || !entryTime || entryPrice === undefined || quantity === undefined) {
      return [];
    }

    const grossPnl =
      actualPnl !== undefined
        ? actualPnl + commission + fees
        : exitPrice === undefined
          ? 0
          : side === "long"
            ? (exitPrice - entryPrice) * quantity
            : (entryPrice - exitPrice) * quantity;
    const estimatedCosts = commission + fees;
    const netPnl = actualPnl ?? grossPnl - estimatedCosts;
    const riskPerUnit =
      plannedStop === undefined ? undefined : Math.abs(entryPrice - plannedStop);
    const realizedR =
      riskPerUnit && riskPerUnit > 0 ? grossPnl / (riskPerUnit * quantity) : undefined;

    return [
      {
        id: `trade-${index + 1}`,
        symbol,
        side,
        entryTime,
        exitTime,
        entryPrice,
        exitPrice,
        quantity,
        commission,
        fees,
        strategy: mapped.strategy ? String(mapped.strategy) : undefined,
        setup: mapped.setup ? String(mapped.setup) : undefined,
        currency: mapped.currency ? String(mapped.currency) : undefined,
        assetCategory: mapped.assetCategory ? String(mapped.assetCategory) : undefined,
        brokerOrderId: mapped.brokerOrderId ? String(mapped.brokerOrderId) : undefined,
        brokerExecutionId: mapped.brokerExecutionId ? String(mapped.brokerExecutionId) : undefined,
        openCloseIndicator: mapped.openCloseIndicator ? String(mapped.openCloseIndicator) : undefined,
        brokerImportId: mapped.brokerImportId ? String(mapped.brokerImportId) : undefined,
        description: mapped.description ? String(mapped.description) : undefined,
        account: mapped.account ? String(mapped.account) : undefined,
        cusip: mapped.cusip ? String(mapped.cusip) : undefined,
        settlementDate: mapped.settlementDate ? String(mapped.settlementDate) : undefined,
        orderType: mapped.orderType ? String(mapped.orderType) : undefined,
        status: mapped.status ? String(mapped.status) : undefined,
        proceeds,
        costBasis,
        plannedStop,
        plannedTarget,
        actualPnl,
        grossPnl,
        estimatedCosts,
        netPnl,
        realizedR
      }
    ];
  });
}

function normalizeArrayRows(rows: RawArrayRow[]): NormalizedTrade[] {
  const firstMeaningful = rows.find((row) => row.some((cell) => String(cell ?? "").trim()));
  if (!firstMeaningful) return [];

  if (isIbkrStatement(rows)) {
    return normalizeIbkrStatementRows(rows);
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((value) => String(value ?? "").trim());
  const objectRows = dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index]]))
  );
  return normalizeObjectRows(objectRows);
}

function isIbkrStatement(rows: RawArrayRow[]) {
  return rows.some((row) => {
    const section = String(row[0] ?? "").trim().toLowerCase();
    const rowType = String(row[1] ?? "").trim().toLowerCase();
    return section === "trades" && (rowType === "header" || rowType === "data");
  });
}

function isIbkrLikeStatement(rows: RawArrayRow[]) {
  return rows.some((row) => {
    const section = String(row[0] ?? "").trim().toLowerCase();
    const rowType = String(row[1] ?? "").trim().toLowerCase();
    return rowType === "header" && ["statement", "account information", "net asset value", "cash report"].includes(section);
  });
}

function normalizeIbkrStatementRows(rows: RawArrayRow[]): NormalizedTrade[] {
  const headersBySection = new Map<string, string[]>();
  const trades: NormalizedTrade[] = [];

  rows.forEach((row, rowIndex) => {
    const section = String(row[0] ?? "").trim();
    const rowType = String(row[1] ?? "").trim().toLowerCase();
    if (!section || !rowType) return;

    if (rowType === "header") {
      headersBySection.set(section.toLowerCase(), row.slice(2).map((value) => String(value ?? "").trim()));
      return;
    }

    if (section.toLowerCase() !== "trades" || rowType !== "data") return;

    const headers = headersBySection.get("trades");
    if (!headers) return;

    const tradeRow = Object.fromEntries(headers.map((header, index) => [header, row[index + 2]]));
    const trade = normalizeIbkrTradeRow(tradeRow, rowIndex);
    if (trade) trades.push(trade);
  });

  return trades;
}

function normalizeIbkrTradeRow(row: RawRow, rowIndex: number): NormalizedTrade | undefined {
  const symbol = String(pick(row, ["Symbol", "Underlying", "Description"]) ?? "")
    .trim()
    .split(" ")[0]
    .toUpperCase();
  const quantityRaw = toNumber(pick(row, ["Quantity", "Qty"]));
  const quantity = quantityRaw === undefined ? undefined : Math.abs(quantityRaw);
  const price = toNumber(pick(row, ["T. Price", "Trade Price", "Price"]));
  const dateTime = String(pick(row, ["Date/Time", "Date Time", "Trade Date"]) ?? "").trim();
  const commissionRaw = toNumber(pick(row, ["Comm/Fee", "Commission", "Commissions", "Fees"]));
  const commission = Math.abs(commissionRaw ?? 0);
  const realizedPnl = toNumber(pick(row, ["Realized P/L", "Realized P&L", "RealizedPL", "Realized PnL"]));

  if (!symbol || quantity === undefined || quantity <= 0 || price === undefined || !dateTime) {
    return undefined;
  }

  if (realizedPnl === undefined || realizedPnl === 0) {
    return undefined;
  }

  const side: TradeSide = (quantityRaw ?? 0) < 0 ? "long" : "short";
  const estimatedCosts = commission;
  const netPnl = realizedPnl;
  const grossPnl = netPnl + estimatedCosts;

  return {
    id: `ibkr-trade-${rowIndex + 1}`,
    symbol,
    side,
    entryTime: dateTime,
    exitTime: dateTime,
    entryPrice: price,
    exitPrice: price,
    quantity,
    commission,
    fees: 0,
    actualPnl: realizedPnl,
    grossPnl,
    estimatedCosts,
    netPnl
  };
}

function pick(row: RawRow, candidates: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const);
  const normalizedCandidates = candidates.map(normalizeKey);
  return normalizedEntries.find(([key]) => normalizedCandidates.includes(key))?.[1];
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeIbkrHtml(html: string): NormalizedTrade[] {
  const executions = extractIbkrHtmlExecutions(html).sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );
  return reconstructRoundTrips(executions);
}

function extractIbkrHtmlExecutions(html: string): IbkrExecution[] {
  const executions: IbkrExecution[] = [];
  const rowMatches = html.matchAll(/<tr[^>]*class="row-summary"[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const match of rowMatches) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanHtml(cell[1]));
    if (cells.length < 12) continue;

    const symbol = cells[1]?.trim().toUpperCase();
    const time = cells[2]?.trim();
    const action = cells[5]?.trim().toUpperCase();
    const quantityValue = toNumber(cells[6]);
    const price = toNumber(cells[7]);
    const commission = Math.abs(toNumber(cells[9]) ?? 0);
    const fee = Math.abs(toNumber(cells[10]) ?? 0);

    if (!symbol || !time || !["BUY", "SELL"].includes(action) || quantityValue === undefined || price === undefined) {
      continue;
    }

    const quantity = action === "SELL" ? -Math.abs(quantityValue) : Math.abs(quantityValue);
    executions.push({ symbol, time, quantity, price, commission, fee });
  }

  return executions;
}

function reconstructRoundTrips(executions: IbkrExecution[]): NormalizedTrade[] {
  const openLots = new Map<string, IbkrExecution[]>();
  const trades: NormalizedTrade[] = [];

  executions.forEach((execution) => {
    const lots = openLots.get(execution.symbol) ?? [];
    let remaining = execution.quantity;

    while (remaining !== 0 && lots.length && Math.sign(lots[0].quantity) !== Math.sign(remaining)) {
      const lot = lots[0];
      const closeQuantity = Math.min(Math.abs(lot.quantity), Math.abs(remaining));
      const entryQuantitySign = Math.sign(lot.quantity);
      const side: TradeSide = entryQuantitySign > 0 ? "long" : "short";
      const grossPnl =
        side === "long"
          ? (execution.price - lot.price) * closeQuantity
          : (lot.price - execution.price) * closeQuantity;
      const entryCostShare = (lot.commission + lot.fee) * (closeQuantity / Math.abs(lot.quantity));
      const closeCostShare = (execution.commission + execution.fee) * (closeQuantity / Math.abs(execution.quantity));
      const estimatedCosts = entryCostShare + closeCostShare;

      trades.push({
        id: `ibkr-html-trade-${trades.length + 1}`,
        symbol: execution.symbol,
        side,
        entryTime: lot.time,
        exitTime: execution.time,
        entryPrice: lot.price,
        exitPrice: execution.price,
        quantity: closeQuantity,
        commission: estimatedCosts,
        fees: 0,
        grossPnl,
        estimatedCosts,
        netPnl: grossPnl - estimatedCosts
      });

      lot.quantity -= entryQuantitySign * closeQuantity;
      remaining -= Math.sign(remaining) * closeQuantity;
      if (Math.abs(lot.quantity) < 0.000001) lots.shift();
    }

    if (Math.abs(remaining) > 0.000001) {
      lots.push({ ...execution, quantity: remaining });
    }

    openLots.set(execution.symbol, lots);
  });

  return trades;
}

function cleanHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

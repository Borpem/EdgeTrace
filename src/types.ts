export type TradeSide = "long" | "short";

export type NormalizedTrade = {
  id: string;
  symbol: string;
  side: TradeSide;
  entryTime: string;
  exitTime?: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  commission: number;
  fees: number;
  strategy?: string;
  plannedStop?: number;
  plannedTarget?: number;
  actualPnl?: number;
  currency?: string;
  assetCategory?: string;
  brokerOrderId?: string;
  brokerExecutionId?: string;
  openCloseIndicator?: string;
  brokerImportId?: string;
  description?: string;
  account?: string;
  cusip?: string;
  settlementDate?: string;
  orderType?: string;
  status?: string;
  proceeds?: number;
  costBasis?: number;
  excludedActivityReason?: string;
  sourceExecutionIds?: string[];
  reconstructionMethod?: string;
  reconstructionWarnings?: string[];
  entryExecutionCount?: number;
  exitExecutionCount?: number;
  averageEntryPrice?: number;
  averageExitPrice?: number;
  allocatedEntryCosts?: number;
  allocatedExitCosts?: number;
  totalAllocatedCosts?: number;
  positionPath?: Array<{
    executionTime: string;
    action: string;
    quantity: number;
    price: number;
    positionBefore: number;
    positionAfter: number;
    role: "entry" | "exit" | "flip";
  }>;
  grossPnl: number;
  estimatedCosts: number;
  netPnl: number;
  realizedR?: number;
};

export type PortfolioMetrics = {
  totalTrades: number;
  winRate: number;
  grossPnl: number;
  totalCosts: number;
  netPnl: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  expectancy: number;
  grossExpectancy: number;
  averageRealizedR?: number;
};

export type InsightCard = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
};

export type DiagnosticsResult = {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
  tags?: string[];
  strategyLabel?: string;
  reportType?: ReportType;
  importProvenance?: ImportProvenance;
  metrics: PortfolioMetrics;
  insights: InsightCard[];
  trades: NormalizedTrade[];
  charts: {
    equityCurve: Array<{ trade: number; equity: number }>;
    pnlBySymbol: Array<{ symbol: string; pnl: number }>;
    pnlByHour: Array<{ hour: string; pnl: number }>;
  };
  accessLevel?: "full" | "preview" | "locked";
  lockedSections?: string[];
  upgradeMessage?: string;
};

export type ReportType = "backtest" | "paper" | "live" | "imported" | "unknown";

export type ImportConfidenceLabel = "Ready" | "Review Recommended" | "Blocked";

export type ImportProvenance = {
  originalFilename?: string;
  importedAt: string;
  detectedSource?: string;
  selectedSource?: string;
  brokerId?: string;
  brokerDisplayName?: string;
  detectionConfidence?: number;
  confidenceLabel?: ImportConfidenceLabel;
  mappedFieldsCount?: number;
  normalizedTradeCount?: number;
  excludedRowCount?: number;
  warningCount?: number;
  warnings?: string[];
  missingRequiredFields?: string[];
  costsDetected?: boolean;
  rMultipleDetected?: boolean;
  reconstructionEnabled?: boolean;
  reconstructionSummary?: {
    rawExecutions?: number;
    completedTrades?: number;
    openPositions?: number;
    partialExits?: number;
    positionFlips?: number;
    warnings?: string[];
  };
};

export type ReportSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  notesPreview?: string;
  tags: string[];
  strategyLabel?: string;
  reportType: ReportType;
  totalTrades: number;
  winRate: number;
  grossPnl: number;
  totalCosts: number;
  netPnl: number;
  expectancy: number;
  averageRealizedR?: number;
  profitFactor?: number;
  importProvenance?: ImportProvenance;
};

export type ReportUpdateInput = {
  name?: string;
  notes?: string;
  tags?: string[];
  strategyLabel?: string;
  reportType?: ReportType;
};

export type ReportCollectionSummary = {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  reportCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ReportCollectionDetail = ReportCollectionSummary & {
  reports: ReportSummary[];
  fullReports?: DiagnosticsResult[];
};

export type CollectionInput = {
  name: string;
  description?: string;
  tags?: string[];
};

export type SavedComparison = {
  id: string;
  name: string;
  description?: string;
  reportAId: string;
  reportBId: string;
  reportAName?: string;
  reportBName?: string;
  dimension?: string;
  groupKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedComparisonInput = {
  name: string;
  description?: string;
  reportAId: string;
  reportBId: string;
  dimension?: string;
  groupKey?: string;
};

export type CollectionReviewStatus = "open" | "reviewed" | "needs_follow_up";

export type CollectionReviewState = {
  id: string;
  collectionId: string;
  previousReportId: string;
  currentReportId: string;
  status: CollectionReviewStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type CollectionReviewStateInput = {
  previousReportId: string;
  currentReportId: string;
  status: CollectionReviewStatus;
  note?: string;
};

export type PlanId = "free" | "pro" | "advanced";

export type UserProfile = {
  userId: string;
  email?: string;
  name?: string;
  planId: PlanId;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
  stripePriceId?: string;
  currentPeriodEnd?: string;
  billingConfigured?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserEvent = {
  id: string;
  eventName: string;
  properties?: Record<string, unknown>;
  createdAt: string;
};

export type ActivationSummary = {
  hasUploadedCsv: boolean;
  hasCreatedReport: boolean;
  hasOpenedDashboard: boolean;
  hasClickedDrilldown: boolean;
  hasOpenedCompare: boolean;
  hasCreatedCollection: boolean;
  hasCreatedComparison: boolean;
  hasStartedCheckout: boolean;
  hasCompletedCheckout: boolean;
  firstReportCreatedAt?: string;
  lastEventAt?: string;
};

export type BenchmarkMetricKey = "expectancy" | "winRate" | "costDragPct" | "averageRealizedR" | "profitFactor";

export type BenchmarkMetricUnit = "currency" | "percent" | "number" | "rMultiple";

export type BenchmarkMetricStatus = "leading" | "in_line" | "lagging" | "unavailable";

export type AggregateBenchmarkMetric = {
  key: BenchmarkMetricKey;
  label: string;
  description: string;
  unit: BenchmarkMetricUnit;
  higherIsBetter: boolean;
  userValue?: number;
  populationMedian?: number;
  percentile?: number;
  sampleSize: number;
  status: BenchmarkMetricStatus;
  insight: string;
};

export type AggregateBenchmarkSnapshot = {
  accessLevel: "full" | "locked";
  generatedAt: string;
  cohortLabel: string;
  minimumCohortSize: number;
  sampleSize: number;
  metrics: AggregateBenchmarkMetric[];
  topInsight: string;
  privacyNote: string;
  upgradeMessage?: string;
};

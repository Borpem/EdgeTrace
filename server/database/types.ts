import type {
  CollectionInput,
  CollectionReviewState,
  CollectionReviewStateInput,
  DiagnosticsResult,
  ActivationSummary,
  FeedbackInput,
  FeedbackItem,
  FeedbackStatus,
  ReportCollectionDetail,
  ReportCollectionSummary,
  ReportSummary,
  ReportUpdateInput,
  SavedComparison,
  SavedComparisonInput,
  UserEvent,
  UserProfile
} from "../../src/types";

export type UserProfileInput = { email?: string; name?: string };

export type BillingStateInput = {
  planId: string;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  stripePriceId?: string | null;
  currentPeriodEnd?: string | null;
};

export type DemoCleanupResult = {
  deletedReports: number;
  deletedCollections: number;
  deletedSavedComparisons: number;
};

export type UserEventInput = {
  eventName: string;
  properties?: Record<string, unknown>;
};

export type DatabaseAdapter = {
  initDb?: () => void | Promise<void>;
  getOrCreateUserProfile: (userId: string, input?: UserProfileInput) => UserProfile | Promise<UserProfile>;
  updateUserPlan: (userId: string, planId: string) => UserProfile | Promise<UserProfile>;
  getUserProfile: (userId: string) => UserProfile | null | Promise<UserProfile | null>;
  getUserProfileByStripeCustomerId: (customerId: string) => UserProfile | null | Promise<UserProfile | null>;
  setStripeCustomerId: (userId: string, customerId: string) => UserProfile | Promise<UserProfile>;
  updateUserBillingState: (userId: string, input: BillingStateInput) => UserProfile | Promise<UserProfile>;
  countBillableReports: (userId: string) => number | Promise<number>;
  countCollections: (userId: string) => number | Promise<number>;
  countSavedComparisons: (userId: string) => number | Promise<number>;
  saveDiagnosticReport: (userId: string, result: DiagnosticsResult, name?: string) => DiagnosticsResult | Promise<DiagnosticsResult>;
  listDiagnosticReports: (userId: string) => ReportSummary[] | Promise<ReportSummary[]>;
  listBenchmarkReports: (maxReports?: number) => ReportSummary[] | Promise<ReportSummary[]>;
  getDiagnosticReport: (userId: string, id: string) => DiagnosticsResult | null | Promise<DiagnosticsResult | null>;
  deleteDiagnosticReport: (userId: string, id: string) => boolean | Promise<boolean>;
  archiveDiagnosticReport: (userId: string, id: string) => boolean | Promise<boolean>;
  updateDiagnosticReport: (userId: string, id: string, input: ReportUpdateInput) => ReportSummary | null | Promise<ReportSummary | null>;
  listCollections: (userId: string) => ReportCollectionSummary[] | Promise<ReportCollectionSummary[]>;
  createCollection: (userId: string, input: CollectionInput) => ReportCollectionSummary | Promise<ReportCollectionSummary>;
  getCollection: (userId: string, id: string) => ReportCollectionDetail | null | Promise<ReportCollectionDetail | null>;
  updateCollection: (userId: string, id: string, input: Partial<CollectionInput>) => ReportCollectionSummary | null | Promise<ReportCollectionSummary | null>;
  deleteCollection: (userId: string, id: string) => boolean | Promise<boolean>;
  addReportToCollection: (userId: string, collectionId: string, reportId: string) => ReportCollectionDetail | null | Promise<ReportCollectionDetail | null>;
  removeReportFromCollection: (userId: string, collectionId: string, reportId: string) => boolean | Promise<boolean>;
  reorderCollectionReports: (userId: string, collectionId: string, reportIds: string[]) => ReportCollectionDetail | null | Promise<ReportCollectionDetail | null>;
  listSavedComparisons: (userId: string) => SavedComparison[] | Promise<SavedComparison[]>;
  createSavedComparison: (userId: string, input: SavedComparisonInput) => SavedComparison | null | Promise<SavedComparison | null>;
  getSavedComparison: (userId: string, id: string) => SavedComparison | null | Promise<SavedComparison | null>;
  updateSavedComparison: (userId: string, id: string, input: Partial<SavedComparisonInput>) => SavedComparison | null | Promise<SavedComparison | null>;
  deleteSavedComparison: (userId: string, id: string) => boolean | Promise<boolean>;
  cleanupDemoData: (userId: string) => DemoCleanupResult | Promise<DemoCleanupResult>;
  listCollectionReviewStates: (userId: string, collectionId: string) => CollectionReviewState[] | Promise<CollectionReviewState[]>;
  upsertCollectionReviewState: (userId: string, collectionId: string, input: CollectionReviewStateInput) => CollectionReviewState | null | Promise<CollectionReviewState | null>;
  deleteCollectionReviewState: (userId: string, collectionId: string, previousReportId: string, currentReportId: string) => boolean | Promise<boolean>;
  trackUserEvent: (userId: string, input: UserEventInput) => UserEvent | Promise<UserEvent>;
  getActivationSummary: (userId: string) => ActivationSummary | Promise<ActivationSummary>;
  saveFeedback: (
    userId: string,
    input: FeedbackInput & { userEmail?: string; userName?: string }
  ) => FeedbackItem | Promise<FeedbackItem>;
  listFeedback: () => FeedbackItem[] | Promise<FeedbackItem[]>;
  updateFeedbackStatus: (id: string, status: FeedbackStatus) => FeedbackItem | null | Promise<FeedbackItem | null>;
};

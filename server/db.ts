import { getDatabaseProvider } from "./env";
import * as sqlite from "./database/sqlite";
import * as postgres from "./database/postgres";
import type {
  CollectionInput,
  CollectionReviewStateInput,
  DiagnosticsResult,
  FeedbackInput,
  FeedbackStatus,
  ReportUpdateInput,
  SavedComparisonInput
} from "../src/types";
import type { BillingStateInput, DatabaseAdapter, UserEventInput, UserProfileInput } from "./database/types";

const provider = getDatabaseProvider();
const adapter: DatabaseAdapter = provider === "postgres" ? postgres : sqlite;

export const DEFAULT_USER_ID = sqlite.DEFAULT_USER_ID;

export function getDatabaseProviderName() {
  return provider;
}

export async function initDb() {
  await adapter.initDb?.();
}

export async function getOrCreateUserProfile(userId: string, input?: UserProfileInput) {
  return adapter.getOrCreateUserProfile(userId, input);
}

export async function updateUserPlan(userId: string, planId: string) {
  return adapter.updateUserPlan(userId, planId);
}

export async function getUserProfile(userId: string) {
  return adapter.getUserProfile(userId);
}

export async function getUserProfileByStripeCustomerId(customerId: string) {
  return adapter.getUserProfileByStripeCustomerId(customerId);
}

export async function setStripeCustomerId(userId: string, customerId: string) {
  return adapter.setStripeCustomerId(userId, customerId);
}

export async function updateUserBillingState(userId: string, input: BillingStateInput) {
  return adapter.updateUserBillingState(userId, input);
}

export async function countBillableReports(userId: string) {
  return adapter.countBillableReports(userId);
}

export async function countCollections(userId: string) {
  return adapter.countCollections(userId);
}

export async function countSavedComparisons(userId: string) {
  return adapter.countSavedComparisons(userId);
}

export async function saveDiagnosticReport(userId: string, result: DiagnosticsResult, name?: string) {
  return adapter.saveDiagnosticReport(userId, result, name);
}

export async function listDiagnosticReports(userId: string) {
  return adapter.listDiagnosticReports(userId);
}

export async function listBenchmarkReports(maxReports?: number) {
  return adapter.listBenchmarkReports(maxReports);
}

export async function getDiagnosticReport(userId: string, id: string) {
  return adapter.getDiagnosticReport(userId, id);
}

export async function deleteDiagnosticReport(userId: string, id: string) {
  return adapter.deleteDiagnosticReport(userId, id);
}

export async function archiveDiagnosticReport(userId: string, id: string) {
  return adapter.archiveDiagnosticReport(userId, id);
}

export async function updateDiagnosticReport(userId: string, id: string, input: ReportUpdateInput) {
  return adapter.updateDiagnosticReport(userId, id, input);
}

export async function listCollections(userId: string) {
  return adapter.listCollections(userId);
}

export async function createCollection(userId: string, input: CollectionInput) {
  return adapter.createCollection(userId, input);
}

export async function getCollection(userId: string, id: string) {
  return adapter.getCollection(userId, id);
}

export async function updateCollection(userId: string, id: string, input: Partial<CollectionInput>) {
  return adapter.updateCollection(userId, id, input);
}

export async function deleteCollection(userId: string, id: string) {
  return adapter.deleteCollection(userId, id);
}

export async function addReportToCollection(userId: string, collectionId: string, reportId: string) {
  return adapter.addReportToCollection(userId, collectionId, reportId);
}

export async function removeReportFromCollection(userId: string, collectionId: string, reportId: string) {
  return adapter.removeReportFromCollection(userId, collectionId, reportId);
}

export async function reorderCollectionReports(userId: string, collectionId: string, reportIds: string[]) {
  return adapter.reorderCollectionReports(userId, collectionId, reportIds);
}

export async function listSavedComparisons(userId: string) {
  return adapter.listSavedComparisons(userId);
}

export async function createSavedComparison(userId: string, input: SavedComparisonInput) {
  return adapter.createSavedComparison(userId, input);
}

export async function getSavedComparison(userId: string, id: string) {
  return adapter.getSavedComparison(userId, id);
}

export async function updateSavedComparison(userId: string, id: string, input: Partial<SavedComparisonInput>) {
  return adapter.updateSavedComparison(userId, id, input);
}

export async function deleteSavedComparison(userId: string, id: string) {
  return adapter.deleteSavedComparison(userId, id);
}

export async function cleanupDemoData(userId: string) {
  return adapter.cleanupDemoData(userId);
}

export async function listCollectionReviewStates(userId: string, collectionId: string) {
  return adapter.listCollectionReviewStates(userId, collectionId);
}

export async function upsertCollectionReviewState(
  userId: string,
  collectionId: string,
  input: CollectionReviewStateInput
) {
  return adapter.upsertCollectionReviewState(userId, collectionId, input);
}

export async function deleteCollectionReviewState(
  userId: string,
  collectionId: string,
  previousReportId: string,
  currentReportId: string
) {
  return adapter.deleteCollectionReviewState(userId, collectionId, previousReportId, currentReportId);
}

export async function trackUserEvent(userId: string, input: UserEventInput) {
  return adapter.trackUserEvent(userId, input);
}

export async function getActivationSummary(userId: string) {
  return adapter.getActivationSummary(userId);
}

export async function getAnalyticsSummary() {
  return adapter.getAnalyticsSummary();
}

export async function saveFeedback(
  userId: string,
  input: FeedbackInput & { userEmail?: string; userName?: string }
) {
  return adapter.saveFeedback(userId, input);
}

export async function listFeedback() {
  return adapter.listFeedback();
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  return adapter.updateFeedbackStatus(id, status);
}

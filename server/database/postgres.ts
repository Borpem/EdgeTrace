import { randomUUID } from "node:crypto";
import pg from "pg";
import { getDatabaseUrl } from "../env";
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
  ImportProvenance,
  ReportType,
  ReportUpdateInput,
  SavedComparison,
  SavedComparisonInput,
  AnalyticsSummary,
  UserEvent,
  UserProfile
} from "../../src/types";
import { normalizePlanId } from "../../src/lib/plans";
import type { BillingStateInput, DemoCleanupResult, UserEventInput, UserProfileInput } from "./types";

const { Pool } = pg;

export const DEFAULT_USER_ID = "local-demo-user";

let pool: pg.Pool | null = null;
let initPromise: Promise<void> | null = null;

type ReportRow = {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  tags_json: string | null;
  strategy_label: string | null;
  report_type: string | null;
  created_at: string;
  updated_at: string;
  total_trades: number;
  win_rate: number;
  gross_pnl: number;
  total_costs: number;
  net_pnl: number;
  expectancy: number;
  average_realized_r: number | null;
  summary_json: string;
  insights_json: string;
  trades_json: string;
  charts_json: string;
  import_provenance_json: string | null;
};

type UserProfileRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  plan_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_cancel_at_period_end: boolean | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

type CollectionRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  tags_json: string | null;
  created_at: string;
  updated_at: string;
  report_count?: number;
};

type SavedComparisonRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  report_a_id: string;
  report_b_id: string;
  report_a_name?: string | null;
  report_b_name?: string | null;
  dimension: string | null;
  group_key: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewStateRow = {
  id: string;
  user_id: string;
  collection_id: string;
  previous_report_id: string;
  current_report_id: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type UserEventRow = {
  id: string;
  user_id: string;
  event_name: string;
  event_properties_json: string | null;
  created_at: string;
};

type FeedbackRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  type: string;
  message: string;
  page_url: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

const allowedReportTypes = new Set<ReportType>(["backtest", "paper", "live", "imported", "unknown"]);

const defaultReportName = (date: Date) => {
  const datePart = date.toISOString().slice(0, 10);
  const timePart = date.toTimeString().slice(0, 5);
  return `Diagnostic Report - ${datePart} ${timePart}`;
};

function getPool() {
  if (pool) return pool;
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when DATABASE_PROVIDER=postgres.");
  }
  pool = new Pool({ connectionString });
  return pool;
}

export async function initDb() {
  initPromise ??= initializeSchema();
  await initPromise;
}

async function initializeSchema() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS diagnostic_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '${DEFAULT_USER_ID}',
      name TEXT,
      notes TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      strategy_label TEXT DEFAULT '',
      report_type TEXT DEFAULT 'unknown',
      created_at TEXT,
      updated_at TEXT,
      total_trades INTEGER,
      win_rate DOUBLE PRECISION,
      gross_pnl DOUBLE PRECISION,
      total_costs DOUBLE PRECISION,
      net_pnl DOUBLE PRECISION,
      expectancy DOUBLE PRECISION,
      average_realized_r DOUBLE PRECISION,
      summary_json TEXT,
      insights_json TEXT,
      trades_json TEXT,
      charts_json TEXT,
      import_provenance_json TEXT
    );

    CREATE TABLE IF NOT EXISTS report_collections (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '${DEFAULT_USER_ID}',
      name TEXT NOT NULL,
      description TEXT,
      tags_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS collection_reports (
      user_id TEXT DEFAULT '${DEFAULT_USER_ID}',
      collection_id TEXT,
      report_id TEXT,
      sort_order INTEGER,
      added_at TEXT,
      PRIMARY KEY (collection_id, report_id)
    );

    CREATE TABLE IF NOT EXISTS saved_comparisons (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '${DEFAULT_USER_ID}',
      name TEXT NOT NULL,
      description TEXT,
      report_a_id TEXT,
      report_b_id TEXT,
      dimension TEXT,
      group_key TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS collection_review_states (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '${DEFAULT_USER_ID}',
      collection_id TEXT NOT NULL,
      previous_report_id TEXT NOT NULL,
      current_report_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(collection_id, previous_report_id, current_report_id)
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      plan_id TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_subscription_status TEXT,
      stripe_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
      stripe_price_id TEXT,
      current_period_end TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_properties_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      page_url TEXT,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_user_id ON diagnostic_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_report_collections_user_id ON report_collections(user_id);
    CREATE INDEX IF NOT EXISTS idx_collection_reports_user_id ON collection_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_saved_comparisons_user_id ON saved_comparisons(user_id);
    CREATE INDEX IF NOT EXISTS idx_collection_review_states_user_id ON collection_review_states(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer_id ON user_profiles(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_events_user_event ON user_events(user_id, event_name);
    CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON user_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
  `);
  await db.query("ALTER TABLE diagnostic_reports ADD COLUMN IF NOT EXISTS import_provenance_json TEXT");
  await db.query("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stripe_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false");
}

async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  await initDb();
  return getPool().query<T>(sql, params);
}

async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  await initDb();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getOne<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const result = await query<T>(sql, params);
  return result.rows[0];
}

export async function getOrCreateUserProfile(userId: string, input?: UserProfileInput): Promise<UserProfile> {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO user_profiles (user_id, email, name, plan_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'free', $4, $4)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, input?.email ?? null, input?.name ?? null, now]
  );

  if (input?.email || input?.name) {
    await query(
      `UPDATE user_profiles
       SET email = COALESCE($2, email),
         name = COALESCE($3, name),
         updated_at = $4
       WHERE user_id = $1`,
      [userId, input?.email ?? null, input?.name ?? null, now]
    );
  }

  const row = await getOne<UserProfileRow>("SELECT * FROM user_profiles WHERE user_id = $1", [userId]);
  return mapUserProfile(row);
}

export async function updateUserPlan(userId: string, planId: string): Promise<UserProfile> {
  await getOrCreateUserProfile(userId);
  const updatedAt = new Date().toISOString();
  const row = await getOne<UserProfileRow>(
    `UPDATE user_profiles
     SET plan_id = $2, updated_at = $3
     WHERE user_id = $1
     RETURNING *`,
    [userId, normalizePlanId(planId), updatedAt]
  );
  return mapUserProfile(row);
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const row = await getOne<UserProfileRow>("SELECT * FROM user_profiles WHERE user_id = $1", [userId]);
  return row ? mapUserProfile(row) : null;
}

export async function getUserProfileByStripeCustomerId(customerId: string): Promise<UserProfile | null> {
  const row = await getOne<UserProfileRow>("SELECT * FROM user_profiles WHERE stripe_customer_id = $1", [customerId]);
  return row ? mapUserProfile(row) : null;
}

export async function setStripeCustomerId(userId: string, customerId: string): Promise<UserProfile> {
  await getOrCreateUserProfile(userId);
  const updatedAt = new Date().toISOString();
  const row = await getOne<UserProfileRow>(
    `UPDATE user_profiles
     SET stripe_customer_id = $2, updated_at = $3
     WHERE user_id = $1
     RETURNING *`,
    [userId, customerId, updatedAt]
  );
  return mapUserProfile(row);
}

export async function updateUserBillingState(userId: string, input: BillingStateInput): Promise<UserProfile> {
  await getOrCreateUserProfile(userId);
  const updatedAt = new Date().toISOString();
  const row = await getOne<UserProfileRow>(
    `UPDATE user_profiles
     SET plan_id = $2,
       stripe_subscription_id = $3,
       stripe_subscription_status = $4,
       stripe_cancel_at_period_end = $5,
       stripe_price_id = $6,
       current_period_end = $7,
       updated_at = $8
     WHERE user_id = $1
     RETURNING *`,
    [
      userId,
      normalizePlanId(input.planId),
      input.stripeSubscriptionId ?? null,
      input.stripeSubscriptionStatus ?? null,
      Boolean(input.stripeCancelAtPeriodEnd),
      input.stripePriceId ?? null,
      input.currentPeriodEnd ?? null,
      updatedAt
    ]
  );
  return mapUserProfile(row);
}

export async function countBillableReports(userId: string): Promise<number> {
  const rows = await listDiagnosticReports(userId);
  return rows.filter((row) => !isDemoReportLike({ name: row.name, tags_json: JSON.stringify(row.tags), strategy_label: row.strategyLabel ?? "" })).length;
}

export async function countCollections(userId: string): Promise<number> {
  const result = await getOne<{ count: string }>("SELECT COUNT(*)::text AS count FROM report_collections WHERE user_id = $1", [userId]);
  return Number(result?.count ?? 0);
}

export async function countSavedComparisons(userId: string): Promise<number> {
  const result = await getOne<{ count: string }>("SELECT COUNT(*)::text AS count FROM saved_comparisons WHERE user_id = $1", [userId]);
  return Number(result?.count ?? 0);
}

export async function saveDiagnosticReport(userId: string, result: DiagnosticsResult, name?: string): Promise<DiagnosticsResult> {
  const timestamp = new Date().toISOString();
  const reportName = name?.trim() || defaultReportName(new Date());
  await query(
    `INSERT INTO diagnostic_reports (
       id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at,
       total_trades, win_rate, gross_pnl, total_costs, net_pnl, expectancy, average_realized_r,
       summary_json, insights_json, trades_json, charts_json, import_provenance_json
     ) VALUES (
       $1, $2, $3, '', '[]', '', 'imported', $4, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     )`,
    [
      result.id,
      userId,
      reportName,
      timestamp,
      result.metrics.totalTrades,
      result.metrics.winRate,
      result.metrics.grossPnl,
      result.metrics.totalCosts,
      result.metrics.netPnl,
      result.metrics.expectancy,
      result.metrics.averageRealizedR ?? null,
      JSON.stringify(result.metrics),
      JSON.stringify(result.insights),
      JSON.stringify(result.trades),
      JSON.stringify(result.charts),
      result.importProvenance ? JSON.stringify(result.importProvenance) : null
    ]
  );

  return {
    ...result,
    name: reportName,
    notes: "",
    tags: [],
    strategyLabel: "",
    reportType: "imported",
    importProvenance: result.importProvenance,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function listDiagnosticReports(userId: string): Promise<ReportSummary[]> {
  const result = await query<Omit<ReportRow, "insights_json" | "trades_json" | "charts_json">>(
    `SELECT id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at,
       total_trades, win_rate, gross_pnl, total_costs, net_pnl, expectancy, average_realized_r, summary_json, import_provenance_json
     FROM diagnostic_reports
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows.map(mapSummaryRow);
}

export async function listBenchmarkReports(maxReports = 5000): Promise<ReportSummary[]> {
  const result = await query<Omit<ReportRow, "insights_json" | "trades_json" | "charts_json">>(
    `SELECT id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at,
       total_trades, win_rate, gross_pnl, total_costs, net_pnl, expectancy, average_realized_r, summary_json, import_provenance_json
     FROM diagnostic_reports
     WHERE user_id NOT LIKE 'deleted:%'
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(maxReports, 10000))]
  );
  return result.rows.filter((row) => !isDemoReportLike(row)).map(mapSummaryRow);
}

export async function getDiagnosticReport(userId: string, id: string): Promise<DiagnosticsResult | null> {
  const row = await getOne<ReportRow>("SELECT * FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: row.notes ?? "",
    tags: parseTags(row.tags_json),
    strategyLabel: row.strategy_label ?? "",
    reportType: normalizeReportType(row.report_type),
    metrics: JSON.parse(row.summary_json),
    insights: JSON.parse(row.insights_json),
    trades: JSON.parse(row.trades_json),
    charts: JSON.parse(row.charts_json),
    importProvenance: parseImportProvenance(row.import_provenance_json)
  };
}

export async function deleteDiagnosticReport(userId: string, id: string): Promise<boolean> {
  return transaction(async (client) => {
    const owned = await client.query("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [id, userId]);
    if ((owned.rowCount ?? 0) === 0) return false;

    await client.query("DELETE FROM collection_review_states WHERE user_id = $1 AND (previous_report_id = $2 OR current_report_id = $2)", [userId, id]);
    await client.query(
      `DELETE FROM collection_review_states
       WHERE user_id = $1
         AND collection_id IN (
           SELECT collection_id FROM collection_reports WHERE report_id = $2 AND user_id = $1
         )`,
      [userId, id]
    );
    await client.query("DELETE FROM saved_comparisons WHERE user_id = $1 AND (report_a_id = $2 OR report_b_id = $2)", [userId, id]);
    await client.query("DELETE FROM collection_reports WHERE report_id = $1 AND user_id = $2", [id, userId]);
    const result = await client.query("DELETE FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [id, userId]);
    return (result.rowCount ?? 0) > 0;
  });
}

export async function archiveDiagnosticReport(userId: string, id: string): Promise<boolean> {
  return transaction(async (client) => {
    const owned = await client.query("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [id, userId]);
    if ((owned.rowCount ?? 0) === 0) return false;

    await client.query("DELETE FROM collection_review_states WHERE user_id = $1 AND (previous_report_id = $2 OR current_report_id = $2)", [userId, id]);
    await client.query(
      `DELETE FROM collection_review_states
       WHERE user_id = $1
         AND collection_id IN (
           SELECT collection_id FROM collection_reports WHERE report_id = $2 AND user_id = $1
         )`,
      [userId, id]
    );
    await client.query("DELETE FROM saved_comparisons WHERE user_id = $1 AND (report_a_id = $2 OR report_b_id = $2)", [userId, id]);
    await client.query("DELETE FROM collection_reports WHERE report_id = $1 AND user_id = $2", [id, userId]);
    const result = await client.query(
      "UPDATE diagnostic_reports SET user_id = $3, updated_at = $4 WHERE id = $1 AND user_id = $2",
      [id, userId, deletedReportOwnerId(userId, id), new Date().toISOString()]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function updateDiagnosticReport(userId: string, id: string, input: ReportUpdateInput): Promise<ReportSummary | null> {
  const existing = await getOne<Omit<ReportRow, "summary_json" | "insights_json" | "trades_json" | "charts_json">>(
    `SELECT id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at,
       total_trades, win_rate, gross_pnl, total_costs, net_pnl, expectancy, average_realized_r
     FROM diagnostic_reports WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (!existing) return null;

  const updatedAt = new Date().toISOString();
  const result = await query<Omit<ReportRow, "insights_json" | "trades_json" | "charts_json">>(
    `UPDATE diagnostic_reports
     SET name = $3,
       notes = $4,
       tags_json = $5,
       strategy_label = $6,
       report_type = $7,
       updated_at = $8
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at,
       total_trades, win_rate, gross_pnl, total_costs, net_pnl, expectancy, average_realized_r, summary_json`,
    [
      id,
      userId,
      input.name !== undefined ? input.name.trim() || existing.name : existing.name,
      input.notes !== undefined ? input.notes : existing.notes ?? "",
      input.tags !== undefined ? JSON.stringify(normalizeTags(input.tags)) : existing.tags_json ?? "[]",
      input.strategyLabel !== undefined ? input.strategyLabel.trim() : existing.strategy_label ?? "",
      input.reportType !== undefined ? normalizeReportType(input.reportType) : normalizeReportType(existing.report_type),
      updatedAt
    ]
  );
  return result.rows[0] ? mapSummaryRow(result.rows[0]) : null;
}

function deletedReportOwnerId(userId: string, reportId: string) {
  return `deleted:${userId}:${reportId}:${Date.now()}`;
}

export async function listCollections(userId: string): Promise<ReportCollectionSummary[]> {
  const result = await query<CollectionRow>(
    `SELECT c.*, COUNT(cr.report_id)::int AS report_count
     FROM report_collections c
     LEFT JOIN collection_reports cr ON cr.collection_id = c.id AND cr.user_id = c.user_id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.updated_at DESC`,
    [userId]
  );
  return result.rows.map(mapCollectionSummary);
}

export async function createCollection(userId: string, input: CollectionInput): Promise<ReportCollectionSummary> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const row = await getOne<CollectionRow>(
    `INSERT INTO report_collections (id, user_id, name, description, tags_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING *, 0::int AS report_count`,
    [
      id,
      userId,
      input.name.trim() || "Untitled Collection",
      input.description?.trim() ?? "",
      JSON.stringify(normalizeTags(input.tags ?? [])),
      now
    ]
  );
  return mapCollectionSummary(row);
}

export async function getCollection(userId: string, id: string): Promise<ReportCollectionDetail | null> {
  const row = await getOne<CollectionRow>(
    `SELECT c.*, COUNT(cr.report_id)::int AS report_count
     FROM report_collections c
     LEFT JOIN collection_reports cr ON cr.collection_id = c.id AND cr.user_id = c.user_id
     WHERE c.id = $1 AND c.user_id = $2
     GROUP BY c.id`,
    [id, userId]
  );
  if (!row) return null;

  const reportsResult = await query<Omit<ReportRow, "insights_json" | "trades_json" | "charts_json">>(
    `SELECT r.id, r.user_id, r.name, r.notes, r.tags_json, r.strategy_label, r.report_type, r.created_at, r.updated_at,
       r.total_trades, r.win_rate, r.gross_pnl, r.total_costs, r.net_pnl, r.expectancy, r.average_realized_r, r.summary_json
     FROM collection_reports cr
     JOIN diagnostic_reports r ON r.id = cr.report_id AND r.user_id = cr.user_id
     WHERE cr.collection_id = $1 AND cr.user_id = $2
     ORDER BY cr.sort_order ASC, cr.added_at ASC`,
    [id, userId]
  );

  const fullReports = await Promise.all(reportsResult.rows.map((report) => getDiagnosticReport(userId, report.id)));
  return {
    ...mapCollectionSummary({ ...row, report_count: reportsResult.rows.length }),
    reports: reportsResult.rows.map(mapSummaryRow),
    fullReports: fullReports.filter((report): report is DiagnosticsResult => Boolean(report))
  };
}

export async function updateCollection(userId: string, id: string, input: Partial<CollectionInput>): Promise<ReportCollectionSummary | null> {
  const existing = await getOne<CollectionRow>("SELECT * FROM report_collections WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!existing) return null;

  const updatedAt = new Date().toISOString();
  const row = await getOne<CollectionRow>(
    `UPDATE report_collections
     SET name = $3, description = $4, tags_json = $5, updated_at = $6
     WHERE id = $1 AND user_id = $2
     RETURNING *, (
       SELECT COUNT(*)::int FROM collection_reports cr WHERE cr.collection_id = report_collections.id AND cr.user_id = report_collections.user_id
     ) AS report_count`,
    [
      id,
      userId,
      input.name !== undefined ? input.name.trim() || existing.name : existing.name,
      input.description !== undefined ? input.description : existing.description ?? "",
      input.tags !== undefined ? JSON.stringify(normalizeTags(input.tags)) : existing.tags_json ?? "[]",
      updatedAt
    ]
  );
  return row ? mapCollectionSummary(row) : null;
}

export async function deleteCollection(userId: string, id: string): Promise<boolean> {
  return transaction(async (client) => {
    await client.query("DELETE FROM collection_reports WHERE collection_id = $1 AND user_id = $2", [id, userId]);
    await client.query("DELETE FROM collection_review_states WHERE collection_id = $1 AND user_id = $2", [id, userId]);
    const result = await client.query("DELETE FROM report_collections WHERE id = $1 AND user_id = $2", [id, userId]);
    return (result.rowCount ?? 0) > 0;
  });
}

export async function addReportToCollection(userId: string, collectionId: string, reportId: string): Promise<ReportCollectionDetail | null> {
  const collection = await getOne<{ id: string }>("SELECT id FROM report_collections WHERE id = $1 AND user_id = $2", [collectionId, userId]);
  const report = await getOne<{ id: string }>("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [reportId, userId]);
  if (!collection || !report) return null;

  const maxRow = await getOne<{ max_order: number | null }>(
    "SELECT MAX(sort_order)::int AS max_order FROM collection_reports WHERE collection_id = $1 AND user_id = $2",
    [collectionId, userId]
  );
  await query(
    `INSERT INTO collection_reports (user_id, collection_id, report_id, sort_order, added_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (collection_id, report_id) DO NOTHING`,
    [userId, collectionId, reportId, (maxRow?.max_order ?? -1) + 1, new Date().toISOString()]
  );
  await touchCollection(userId, collectionId);
  return getCollection(userId, collectionId);
}

export async function removeReportFromCollection(userId: string, collectionId: string, reportId: string): Promise<boolean> {
  const result = await query(
    "DELETE FROM collection_reports WHERE collection_id = $1 AND report_id = $2 AND user_id = $3",
    [collectionId, reportId, userId]
  );
  if ((result.rowCount ?? 0) > 0) await touchCollection(userId, collectionId);
  return (result.rowCount ?? 0) > 0;
}

export async function reorderCollectionReports(userId: string, collectionId: string, reportIds: string[]): Promise<ReportCollectionDetail | null> {
  const collection = await getOne<{ id: string }>("SELECT id FROM report_collections WHERE id = $1 AND user_id = $2", [collectionId, userId]);
  if (!collection) return null;

  await transaction(async (client) => {
    for (const [index, reportId] of reportIds.entries()) {
      await client.query(
        "UPDATE collection_reports SET sort_order = $1 WHERE collection_id = $2 AND report_id = $3 AND user_id = $4",
        [index, collectionId, reportId, userId]
      );
    }
    await client.query("UPDATE report_collections SET updated_at = $1 WHERE id = $2 AND user_id = $3", [
      new Date().toISOString(),
      collectionId,
      userId
    ]);
  });
  return getCollection(userId, collectionId);
}

export async function listSavedComparisons(userId: string): Promise<SavedComparison[]> {
  const result = await query<SavedComparisonRow>(
    `SELECT sc.*, a.name AS report_a_name, b.name AS report_b_name
     FROM saved_comparisons sc
     LEFT JOIN diagnostic_reports a ON a.id = sc.report_a_id AND a.user_id = sc.user_id
     LEFT JOIN diagnostic_reports b ON b.id = sc.report_b_id AND b.user_id = sc.user_id
     WHERE sc.user_id = $1
     ORDER BY sc.updated_at DESC`,
    [userId]
  );
  return result.rows.map(mapSavedComparison);
}

export async function createSavedComparison(userId: string, input: SavedComparisonInput): Promise<SavedComparison | null> {
  const reportA = await getOne<{ id: string }>("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [input.reportAId, userId]);
  const reportB = await getOne<{ id: string }>("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [input.reportBId, userId]);
  if (!reportA || !reportB) return null;

  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO saved_comparisons (
       id, user_id, name, description, report_a_id, report_b_id, dimension, group_key, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [
      id,
      userId,
      input.name.trim() || "Saved Comparison",
      input.description?.trim() ?? "",
      input.reportAId,
      input.reportBId,
      input.dimension ?? null,
      input.groupKey ?? null,
      now
    ]
  );
  return getSavedComparison(userId, id);
}

export async function getSavedComparison(userId: string, id: string): Promise<SavedComparison | null> {
  const row = await getOne<SavedComparisonRow>(
    `SELECT sc.*, a.name AS report_a_name, b.name AS report_b_name
     FROM saved_comparisons sc
     LEFT JOIN diagnostic_reports a ON a.id = sc.report_a_id AND a.user_id = sc.user_id
     LEFT JOIN diagnostic_reports b ON b.id = sc.report_b_id AND b.user_id = sc.user_id
     WHERE sc.id = $1 AND sc.user_id = $2`,
    [id, userId]
  );
  return row ? mapSavedComparison(row) : null;
}

export async function updateSavedComparison(userId: string, id: string, input: Partial<SavedComparisonInput>): Promise<SavedComparison | null> {
  const existing = await getOne<SavedComparisonRow>("SELECT * FROM saved_comparisons WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!existing) return null;

  const reportAId = input.reportAId ?? existing.report_a_id;
  const reportBId = input.reportBId ?? existing.report_b_id;
  const reportA = await getOne<{ id: string }>("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [reportAId, userId]);
  const reportB = await getOne<{ id: string }>("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [reportBId, userId]);
  if (!reportA || !reportB) return null;

  await query(
    `UPDATE saved_comparisons
     SET name = $3,
       description = $4,
       report_a_id = $5,
       report_b_id = $6,
       dimension = $7,
       group_key = $8,
       updated_at = $9
     WHERE id = $1 AND user_id = $2`,
    [
      id,
      userId,
      input.name !== undefined ? input.name.trim() || existing.name : existing.name,
      input.description !== undefined ? input.description : existing.description ?? "",
      reportAId,
      reportBId,
      input.dimension !== undefined ? input.dimension : existing.dimension,
      input.groupKey !== undefined ? input.groupKey : existing.group_key,
      new Date().toISOString()
    ]
  );
  return getSavedComparison(userId, id);
}

export async function deleteSavedComparison(userId: string, id: string): Promise<boolean> {
  const result = await query("DELETE FROM saved_comparisons WHERE id = $1 AND user_id = $2", [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function cleanupDemoData(userId: string): Promise<DemoCleanupResult> {
  const reports = (await query<{ id: string; name: string | null; tags_json: string | null; strategy_label: string | null }>(
    "SELECT id, name, tags_json, strategy_label FROM diagnostic_reports WHERE user_id = $1",
    [userId]
  )).rows.filter(isDemoReportLike);
  const collections = (await query<{ id: string; name: string | null; tags_json: string | null }>(
    "SELECT id, name, tags_json FROM report_collections WHERE user_id = $1",
    [userId]
  )).rows.filter(isDemoCollectionLike);
  const comparisons = (await query<{ id: string; name: string | null; description: string | null }>(
    "SELECT id, name, description FROM saved_comparisons WHERE user_id = $1",
    [userId]
  )).rows.filter(isDemoComparisonLike);

  await transaction(async (client) => {
    for (const comparison of comparisons) {
      await client.query("DELETE FROM saved_comparisons WHERE id = $1 AND user_id = $2", [comparison.id, userId]);
    }
    for (const collection of collections) {
      await client.query("DELETE FROM collection_reports WHERE collection_id = $1 AND user_id = $2", [collection.id, userId]);
      await client.query("DELETE FROM collection_review_states WHERE collection_id = $1 AND user_id = $2", [collection.id, userId]);
      await client.query("DELETE FROM report_collections WHERE id = $1 AND user_id = $2", [collection.id, userId]);
    }
    for (const report of reports) {
      await client.query("DELETE FROM collection_review_states WHERE user_id = $1 AND (previous_report_id = $2 OR current_report_id = $2)", [userId, report.id]);
      await client.query("DELETE FROM collection_reports WHERE report_id = $1 AND user_id = $2", [report.id, userId]);
      await client.query("DELETE FROM saved_comparisons WHERE user_id = $1 AND (report_a_id = $2 OR report_b_id = $2)", [userId, report.id]);
      await client.query("DELETE FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [report.id, userId]);
    }
  });

  return {
    deletedReports: reports.length,
    deletedCollections: collections.length,
    deletedSavedComparisons: comparisons.length
  };
}

export async function listCollectionReviewStates(userId: string, collectionId: string): Promise<CollectionReviewState[]> {
  const result = await query<ReviewStateRow>(
    `SELECT * FROM collection_review_states
     WHERE user_id = $1 AND collection_id = $2
     ORDER BY updated_at DESC`,
    [userId, collectionId]
  );
  return result.rows.map(mapReviewState);
}

export async function upsertCollectionReviewState(
  userId: string,
  collectionId: string,
  input: CollectionReviewStateInput
): Promise<CollectionReviewState | null> {
  const collection = await getOne<{ id: string }>("SELECT id FROM report_collections WHERE id = $1 AND user_id = $2", [collectionId, userId]);
  const previousReport = await getOne<{ id: string }>("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [input.previousReportId, userId]);
  const currentReport = await getOne<{ id: string }>("SELECT id FROM diagnostic_reports WHERE id = $1 AND user_id = $2", [input.currentReportId, userId]);
  if (!collection || !previousReport || !currentReport) return null;

  const now = new Date().toISOString();
  const status = normalizeReviewStatus(input.status);
  const row = await getOne<ReviewStateRow>(
    `INSERT INTO collection_review_states (
       id, user_id, collection_id, previous_report_id, current_report_id, status, note, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     ON CONFLICT (collection_id, previous_report_id, current_report_id)
     DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      randomUUID(),
      userId,
      collectionId,
      input.previousReportId,
      input.currentReportId,
      status,
      input.note ?? "",
      now
    ]
  );
  return row ? mapReviewState(row) : null;
}

export async function deleteCollectionReviewState(
  userId: string,
  collectionId: string,
  previousReportId: string,
  currentReportId: string
): Promise<boolean> {
  const result = await query(
    `DELETE FROM collection_review_states
     WHERE collection_id = $1 AND previous_report_id = $2 AND current_report_id = $3 AND user_id = $4`,
    [collectionId, previousReportId, currentReportId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function trackUserEvent(userId: string, input: UserEventInput): Promise<UserEvent> {
  await getOrCreateUserProfile(userId);
  if (input.eventName === "created_first_report") {
    const existing = await getOne<UserEventRow>(
      "SELECT * FROM user_events WHERE user_id = $1 AND event_name = $2 ORDER BY created_at ASC LIMIT 1",
      [userId, input.eventName]
    );
    if (existing) return mapUserEvent(existing);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const row = await getOne<UserEventRow>(
    `INSERT INTO user_events (id, user_id, event_name, event_properties_json, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, userId, input.eventName, JSON.stringify(input.properties ?? {}), now]
  );
  return mapUserEvent(row);
}

export async function getActivationSummary(userId: string): Promise<ActivationSummary> {
  const [events, reportInfo, collectionInfo, comparisonInfo] = await Promise.all([
    query<{ event_name: string; created_at: string }>("SELECT event_name, created_at FROM user_events WHERE user_id = $1", [userId]),
    getOne<{ count: number; first_created_at: string | null }>(
      "SELECT COUNT(*)::int AS count, MIN(created_at) AS first_created_at FROM diagnostic_reports WHERE user_id = $1",
      [userId]
    ),
    getOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM report_collections WHERE user_id = $1", [userId]),
    getOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM saved_comparisons WHERE user_id = $1", [userId])
  ]);
  const eventNames = new Set(events.rows.map((row) => row.event_name));
  const lastEventAt = events.rows.map((row) => row.created_at).sort((a, b) => b.localeCompare(a))[0];

  return {
    hasUploadedCsv: eventNames.has("csv_uploaded"),
    hasCreatedReport: eventNames.has("diagnostic_report_created") || Number(reportInfo?.count ?? 0) > 0,
    hasOpenedDashboard: eventNames.has("dashboard_opened"),
    hasClickedDrilldown: eventNames.has("drilldown_opened"),
    hasOpenedCompare: eventNames.has("compare_opened"),
    hasCreatedCollection: eventNames.has("strategy_set_created") || Number(collectionInfo?.count ?? 0) > 0,
    hasCreatedComparison:
      eventNames.has("comparison_created") ||
      eventNames.has("saved_comparison_created") ||
      Number(comparisonInfo?.count ?? 0) > 0,
    hasStartedCheckout: eventNames.has("checkout_started"),
    hasCompletedCheckout: eventNames.has("checkout_completed"),
    firstReportCreatedAt: reportInfo?.first_created_at ?? undefined,
    lastEventAt
  };
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const events = await query<UserEventRow>("SELECT * FROM user_events ORDER BY created_at DESC");
  return buildAnalyticsSummary(events.rows.map(mapAnalyticsEventRow));
}

export async function saveFeedback(
  userId: string,
  input: FeedbackInput & { userEmail?: string; userName?: string }
): Promise<FeedbackItem> {
  await getOrCreateUserProfile(userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  const row = await getOne<FeedbackRow>(
    `INSERT INTO feedback (
       id, user_id, user_email, user_name, type, message, page_url, user_agent, status, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, $9
     )
     RETURNING *`,
    [
      id,
      userId,
      input.userEmail ?? "",
      input.userName ?? "",
      normalizeFeedbackType(input.type),
      input.message,
      input.pageUrl ?? "",
      input.userAgent ?? "",
      now
    ]
  );
  return mapFeedback(row);
}

export async function listFeedback(): Promise<FeedbackItem[]> {
  const result = await query<FeedbackRow>("SELECT * FROM feedback ORDER BY created_at DESC");
  return result.rows.map(mapFeedback);
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null> {
  const row = await getOne<FeedbackRow>(
    `UPDATE feedback
     SET status = $2, updated_at = $3
     WHERE id = $1
     RETURNING *`,
    [id, normalizeFeedbackStatus(status), new Date().toISOString()]
  );
  return row ? mapFeedback(row) : null;
}

async function touchCollection(userId: string, collectionId: string) {
  await query("UPDATE report_collections SET updated_at = $1 WHERE id = $2 AND user_id = $3", [
    new Date().toISOString(),
    collectionId,
    userId
  ]);
}

function mapSummaryRow(
  row: Omit<ReportRow, "insights_json" | "trades_json" | "charts_json"> & Partial<Pick<ReportRow, "summary_json">>
): ReportSummary {
  const notes = row.notes ?? "";
  const metrics = row.summary_json ? safeParseJson(row.summary_json) : undefined;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes,
    notesPreview: notes.length > 140 ? `${notes.slice(0, 137)}...` : notes,
    tags: parseTags(row.tags_json),
    strategyLabel: row.strategy_label ?? "",
    reportType: normalizeReportType(row.report_type),
    totalTrades: Number(row.total_trades ?? 0),
    winRate: Number(row.win_rate ?? 0),
    grossPnl: Number(row.gross_pnl ?? 0),
    totalCosts: Number(row.total_costs ?? 0),
    netPnl: Number(row.net_pnl ?? 0),
    expectancy: Number(row.expectancy ?? 0),
    averageRealizedR: row.average_realized_r === null || row.average_realized_r === undefined ? undefined : Number(row.average_realized_r),
    profitFactor: typeof metrics?.profitFactor === "number" ? metrics.profitFactor : undefined,
    importProvenance: parseImportProvenance(row.import_provenance_json)
  };
}

function mapCollectionSummary(row: CollectionRow): ReportCollectionSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    tags: parseTags(row.tags_json),
    reportCount: row.report_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSavedComparison(row: SavedComparisonRow): SavedComparison {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    reportAId: row.report_a_id,
    reportBId: row.report_b_id,
    reportAName: row.report_a_name ?? undefined,
    reportBName: row.report_b_name ?? undefined,
    dimension: row.dimension ?? undefined,
    groupKey: row.group_key ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReviewState(row: ReviewStateRow): CollectionReviewState {
  return {
    id: row.id,
    collectionId: row.collection_id,
    previousReportId: row.previous_report_id,
    currentReportId: row.current_report_id,
    status: normalizeReviewStatus(row.status),
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.user_id,
    email: row.email ?? "",
    name: row.name ?? "",
    planId: normalizePlanId(row.plan_id),
    stripeCustomerId: row.stripe_customer_id ?? "",
    stripeSubscriptionId: row.stripe_subscription_id ?? "",
    stripeSubscriptionStatus: row.stripe_subscription_status ?? "",
    stripeCancelAtPeriodEnd: Boolean(row.stripe_cancel_at_period_end),
    stripePriceId: row.stripe_price_id ?? "",
    currentPeriodEnd: row.current_period_end ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapUserEvent(row: UserEventRow): UserEvent {
  const parsed = row.event_properties_json ? safeParseJson(row.event_properties_json) : undefined;
  return {
    id: row.id,
    eventName: row.event_name,
    properties: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined,
    createdAt: row.created_at
  };
}

type AnalyticsEventRow = {
  id: string;
  userId: string;
  eventName: string;
  properties: Record<string, unknown>;
  createdAt: string;
};

const funnelEventOrder = [
  "landing_page_viewed",
  "landing_primary_cta_clicked",
  "signup_started",
  "signup_completed",
  "upload_started",
  "upload_completed",
  "report_generation_started",
  "report_generation_completed",
  "report_viewed",
  "upgrade_prompt_viewed",
  "upgrade_prompt_clicked",
  "checkout_started",
  "checkout_completed"
];

function mapAnalyticsEventRow(row: UserEventRow): AnalyticsEventRow {
  const parsed = row.event_properties_json ? safeParseJson(row.event_properties_json) : {};
  return {
    id: row.id,
    userId: row.user_id,
    eventName: row.event_name,
    properties: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? sanitizeAnalyticsProperties(parsed as Record<string, unknown>) : {},
    createdAt: row.created_at
  };
}

function buildAnalyticsSummary(events: AnalyticsEventRow[]): AnalyticsSummary {
  return {
    generatedAt: new Date().toISOString(),
    eventCounts: countBy(events, (event) => event.eventName),
    funnelCounts: funnelEventOrder.map((eventName) => ({
      label: eventName,
      count: events.filter((event) => event.eventName === eventName).length
    })),
    conversionRates: buildConversionRates(events),
    uploadFailures: countFailures(events, "upload_failed"),
    reportFailures: countFailures(events, "report_generation_failed"),
    dailyCounts: countBy(events, (event) => event.createdAt.slice(0, 10)).sort((a, b) => a.label.localeCompare(b.label)),
    recentEvents: events.slice(0, 100).map((event) => ({
      id: event.id,
      eventName: event.eventName,
      userId: event.userId,
      properties: event.properties,
      createdAt: event.createdAt
    }))
  };
}

function buildConversionRates(events: AnalyticsEventRow[]) {
  const counts = new Map(funnelEventOrder.map((eventName) => [eventName, events.filter((event) => event.eventName === eventName).length]));
  return funnelEventOrder.slice(0, -1).map((from, index) => {
    const to = funnelEventOrder[index + 1];
    const fromCount = counts.get(from) ?? 0;
    const toCount = counts.get(to) ?? 0;
    return {
      from,
      to,
      fromCount,
      toCount,
      percent: fromCount > 0 ? Math.round((toCount / fromCount) * 1000) / 10 : 0
    };
  });
}

function countFailures(events: AnalyticsEventRow[], eventName: string) {
  return countBy(
    events.filter((event) => event.eventName === eventName),
    (event) => safeAnalyticsLabel(event.properties.category) || "unknown"
  );
}

function countBy(events: AnalyticsEventRow[], labelFor: (event: AnalyticsEventRow) => string) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const label = labelFor(event);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function sanitizeAnalyticsProperties(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, 20)) {
    if (isSensitiveAnalyticsKey(key)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number") output[key] = value;
    if (typeof value === "string") output[key] = value.slice(0, 120);
  }
  return output;
}

function safeAnalyticsLabel(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function isSensitiveAnalyticsKey(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.endsWith("count")) return false;
  return /(trade|trades|row|rows|csv|html|token|secret|password|account|execution|sourceexecution|brokerexecution|payment|card|symbol|pnl|quantity|notes?|strategy|reportcontent)/i.test(
    normalized
  );
}

function mapFeedback(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email ?? "",
    userName: row.user_name ?? "",
    type: normalizeFeedbackType(row.type),
    message: row.message,
    pageUrl: row.page_url ?? "",
    userAgent: row.user_agent ?? "",
    status: normalizeFeedbackStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeFeedbackType(value: string): FeedbackInput["type"] {
  if (value === "bug" || value === "suggestion" || value === "other") return value;
  return "other";
}

function normalizeFeedbackStatus(value: string): FeedbackStatus {
  if (value === "reviewed" || value === "closed") return value;
  return "new";
}

function normalizeReportType(value: string | null | undefined): ReportType {
  return allowedReportTypes.has(value as ReportType) ? (value as ReportType) : "unknown";
}

function parseTags(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeTags(parsed) : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags: unknown[]): string[] {
  const unique = new Set<string>();
  for (const tag of tags) {
    const normalized = String(tag).trim();
    if (normalized) unique.add(normalized);
  }
  return [...unique].slice(0, 30);
}

function isDemoReportLike(row: { name: string | null; tags_json: string | null; strategy_label: string | null }) {
  const tags = parseTags(row.tags_json).map((tag) => tag.toLowerCase());
  const name = row.name ?? "";
  return tags.includes("demo") || row.strategy_label === "ORB Demo Strategy" || name.startsWith("ORB Demo") || name.startsWith("Demo Report");
}

function isDemoCollectionLike(row: { name: string | null; tags_json: string | null }) {
  const tags = parseTags(row.tags_json).map((tag) => tag.toLowerCase());
  return tags.includes("demo") || (row.name ?? "").startsWith("ORB Demo Strategy Iterations");
}

function isDemoComparisonLike(row: { name: string | null; description: string | null }) {
  return (row.name ?? "").startsWith("ORB Demo") || (row.description ?? "").toLowerCase().includes("demo");
}

function normalizeReviewStatus(value: string): CollectionReviewState["status"] {
  if (value === "reviewed" || value === "needs_follow_up") return value;
  return "open";
}

function safeParseJson(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseImportProvenance(value: string | null | undefined): ImportProvenance | undefined {
  if (!value) return undefined;
  const parsed = safeParseJson(value);
  return parsed && typeof parsed === "object" ? (parsed as ImportProvenance) : undefined;
}

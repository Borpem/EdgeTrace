import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDatabasePath } from "../env";
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
  PlanId,
  ReportType,
  ReportUpdateInput,
  SavedComparison,
  SavedComparisonInput,
  UserEvent,
  UserProfile
} from "../../src/types";
import { normalizePlanId } from "../../src/lib/plans";
import type { UserEventInput } from "./types";

const configuredDatabasePath = getDatabasePath();
const databasePath = configuredDatabasePath || path.join(process.cwd(), "data", "edgetrace.sqlite");
mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(path.resolve(databasePath));
db.pragma("journal_mode = WAL");

export const DEFAULT_USER_ID = "local-demo-user";

db.exec(`
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
    win_rate REAL,
    gross_pnl REAL,
    total_costs REAL,
    net_pnl REAL,
    expectancy REAL,
    average_realized_r REAL,
    summary_json TEXT,
    insights_json TEXT,
    trades_json TEXT,
    charts_json TEXT,
    import_provenance_json TEXT
  )
`);

function addColumnIfMissing(table: string, name: string, definition: string) {
  const existingColumns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const existingColumnNames = new Set(existingColumns.map((column) => column.name));
  if (!existingColumnNames.has(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

addColumnIfMissing("diagnostic_reports", "notes", "TEXT DEFAULT ''");
addColumnIfMissing("diagnostic_reports", "tags_json", "TEXT DEFAULT '[]'");
addColumnIfMissing("diagnostic_reports", "strategy_label", "TEXT DEFAULT ''");
addColumnIfMissing("diagnostic_reports", "report_type", "TEXT DEFAULT 'unknown'");
addColumnIfMissing("diagnostic_reports", "user_id", `TEXT DEFAULT '${DEFAULT_USER_ID}'`);
addColumnIfMissing("diagnostic_reports", "import_provenance_json", "TEXT");

db.exec(`
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
    stripe_cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
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
`);

for (const table of ["report_collections", "collection_reports", "saved_comparisons", "collection_review_states"]) {
  addColumnIfMissing(table, "user_id", `TEXT DEFAULT '${DEFAULT_USER_ID}'`);
}

addColumnIfMissing("user_profiles", "stripe_customer_id", "TEXT");
addColumnIfMissing("user_profiles", "stripe_subscription_id", "TEXT");
addColumnIfMissing("user_profiles", "stripe_subscription_status", "TEXT");
addColumnIfMissing("user_profiles", "stripe_cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("user_profiles", "stripe_price_id", "TEXT");
addColumnIfMissing("user_profiles", "current_period_end", "TEXT");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_events_user_event ON user_events(user_id, event_name);
  CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON user_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
  CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
`);

for (const table of [
  "diagnostic_reports",
  "report_collections",
  "collection_reports",
  "saved_comparisons",
  "collection_review_states"
]) {
  db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL OR user_id = ''`).run(DEFAULT_USER_ID);
}

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
  stripe_cancel_at_period_end: number | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
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

export function getOrCreateUserProfile(userId: string, input?: { email?: string; name?: string }): UserProfile {
  const existing = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId) as UserProfileRow | undefined;
  if (existing) {
    if (
      (input?.email && input.email !== existing.email) ||
      (input?.name && input.name !== existing.name)
    ) {
      const updatedAt = new Date().toISOString();
      db.prepare(
        `UPDATE user_profiles
         SET email = COALESCE(@email, email),
           name = COALESCE(@name, name),
           updated_at = @updatedAt
         WHERE user_id = @userId`
      ).run({ userId, email: input?.email ?? null, name: input?.name ?? null, updatedAt });
      const updated = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId) as UserProfileRow;
      return mapUserProfile(updated);
    }
    return mapUserProfile(existing);
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO user_profiles (user_id, email, name, plan_id, created_at, updated_at)
     VALUES (@userId, @email, @name, 'free', @createdAt, @updatedAt)`
  ).run({
    userId,
    email: input?.email ?? "",
    name: input?.name ?? "",
    createdAt: now,
    updatedAt: now
  });

  return mapUserProfile(db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId) as UserProfileRow);
}

export function updateUserPlan(userId: string, planId: string): UserProfile {
  getOrCreateUserProfile(userId);
  const normalized = normalizePlanId(planId);
  const updatedAt = new Date().toISOString();
  db.prepare("UPDATE user_profiles SET plan_id = ?, updated_at = ? WHERE user_id = ?").run(
    normalized,
    updatedAt,
    userId
  );
  return mapUserProfile(db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId) as UserProfileRow);
}

export function getUserProfile(userId: string): UserProfile | null {
  const row = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId) as UserProfileRow | undefined;
  return row ? mapUserProfile(row) : null;
}

export function getUserProfileByStripeCustomerId(customerId: string): UserProfile | null {
  const row = db
    .prepare("SELECT * FROM user_profiles WHERE stripe_customer_id = ?")
    .get(customerId) as UserProfileRow | undefined;
  return row ? mapUserProfile(row) : null;
}

export function setStripeCustomerId(userId: string, customerId: string): UserProfile {
  getOrCreateUserProfile(userId);
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE user_profiles
     SET stripe_customer_id = @customerId,
       updated_at = @updatedAt
     WHERE user_id = @userId`
  ).run({ userId, customerId, updatedAt });
  return mapUserProfile(db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId) as UserProfileRow);
}

export function updateUserBillingState(
  userId: string,
  input: {
    planId: string;
    stripeSubscriptionId?: string | null;
    stripeSubscriptionStatus?: string | null;
    stripeCancelAtPeriodEnd?: boolean | null;
    stripePriceId?: string | null;
    currentPeriodEnd?: string | null;
  }
): UserProfile {
  getOrCreateUserProfile(userId);
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE user_profiles
     SET plan_id = @planId,
       stripe_subscription_id = @stripeSubscriptionId,
       stripe_subscription_status = @stripeSubscriptionStatus,
       stripe_cancel_at_period_end = @stripeCancelAtPeriodEnd,
       stripe_price_id = @stripePriceId,
       current_period_end = @currentPeriodEnd,
       updated_at = @updatedAt
     WHERE user_id = @userId`
  ).run({
    userId,
    planId: normalizePlanId(input.planId),
    stripeSubscriptionId: input.stripeSubscriptionId ?? "",
    stripeSubscriptionStatus: input.stripeSubscriptionStatus ?? "",
    stripeCancelAtPeriodEnd: input.stripeCancelAtPeriodEnd ? 1 : 0,
    stripePriceId: input.stripePriceId ?? "",
    currentPeriodEnd: input.currentPeriodEnd ?? "",
    updatedAt
  });
  return mapUserProfile(db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId) as UserProfileRow);
}

export function countBillableReports(userId: string): number {
  const rows = db
    .prepare("SELECT name, tags_json, strategy_label FROM diagnostic_reports WHERE user_id = ?")
    .all(userId) as Array<{ name: string | null; tags_json: string | null; strategy_label: string | null }>;
  return rows.filter((row) => !isDemoReportLike(row)).length;
}

export function countCollections(userId: string): number {
  const rows = db
    .prepare("SELECT name, tags_json FROM report_collections WHERE user_id = ?")
    .all(userId) as Array<{ name: string | null; tags_json: string | null }>;
  return rows.filter((row) => !isDemoCollectionLike(row)).length;
}

export function countSavedComparisons(userId: string): number {
  const rows = db
    .prepare("SELECT name, description FROM saved_comparisons WHERE user_id = ?")
    .all(userId) as Array<{ name: string | null; description: string | null }>;
  return rows.filter((row) => !isDemoComparisonLike(row)).length;
}

export function saveDiagnosticReport(userId: string, result: DiagnosticsResult, name?: string): DiagnosticsResult {
  const now = new Date();
  const timestamp = now.toISOString();
  const reportName = name?.trim() || defaultReportName(now);

  db.prepare(
    `
    INSERT INTO diagnostic_reports (
      id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at, total_trades, win_rate, gross_pnl,
      total_costs, net_pnl, expectancy, average_realized_r, summary_json,
      insights_json, trades_json, charts_json, import_provenance_json
    ) VALUES (
      @id, @userId, @name, @notes, @tagsJson, @strategyLabel, @reportType, @createdAt, @updatedAt, @totalTrades, @winRate, @grossPnl,
      @totalCosts, @netPnl, @expectancy, @averageRealizedR, @summaryJson,
      @insightsJson, @tradesJson, @chartsJson, @importProvenanceJson
    )
  `
  ).run({
    id: result.id,
    userId,
    name: reportName,
    notes: "",
    tagsJson: "[]",
    strategyLabel: "",
    reportType: "imported",
    createdAt: timestamp,
    updatedAt: timestamp,
    totalTrades: result.metrics.totalTrades,
    winRate: result.metrics.winRate,
    grossPnl: result.metrics.grossPnl,
    totalCosts: result.metrics.totalCosts,
    netPnl: result.metrics.netPnl,
    expectancy: result.metrics.expectancy,
    averageRealizedR: result.metrics.averageRealizedR ?? null,
    summaryJson: JSON.stringify(result.metrics),
    insightsJson: JSON.stringify(result.insights),
    tradesJson: JSON.stringify(result.trades),
    chartsJson: JSON.stringify(result.charts),
    importProvenanceJson: result.importProvenance ? JSON.stringify(result.importProvenance) : null
  });

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

export function listDiagnosticReports(userId: string): ReportSummary[] {
  const rows = db
    .prepare(
      `
      SELECT id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at, total_trades, win_rate, gross_pnl,
        total_costs, net_pnl, expectancy, average_realized_r, import_provenance_json
      FROM diagnostic_reports
      WHERE user_id = ?
      ORDER BY created_at DESC
    `
    )
    .all(userId) as Omit<ReportRow, "summary_json" | "insights_json" | "trades_json" | "charts_json">[];

  return rows.map(mapSummaryRow);
}

export function listBenchmarkReports(maxReports = 5000): ReportSummary[] {
  const rows = db
    .prepare(
      `
      SELECT id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at, total_trades, win_rate, gross_pnl,
        total_costs, net_pnl, expectancy, average_realized_r, summary_json, import_provenance_json
      FROM diagnostic_reports
      WHERE user_id NOT LIKE 'deleted:%'
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(Math.max(1, Math.min(maxReports, 10000))) as (Omit<ReportRow, "insights_json" | "trades_json" | "charts_json"> & {
    summary_json: string;
  })[];

  return rows.filter((row) => !isDemoReportLike(row)).map(mapSummaryRow);
}

function mapSummaryRow(
  row: Omit<ReportRow, "summary_json" | "insights_json" | "trades_json" | "charts_json"> &
    Partial<Pick<ReportRow, "summary_json">>
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
    totalTrades: row.total_trades,
    winRate: row.win_rate,
    grossPnl: row.gross_pnl,
    totalCosts: row.total_costs,
    netPnl: row.net_pnl,
    expectancy: row.expectancy,
    averageRealizedR: row.average_realized_r ?? undefined,
    profitFactor: typeof metrics?.profitFactor === "number" ? metrics.profitFactor : undefined,
    importProvenance: parseImportProvenance(row.import_provenance_json)
  };
}

export function getDiagnosticReport(userId: string, id: string): DiagnosticsResult | null {
  const row = db.prepare("SELECT * FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(id, userId) as
    | ReportRow
    | undefined;

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

export function deleteDiagnosticReport(userId: string, id: string) {
  const tx = db.transaction(() => {
    const owned = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(id, userId);
    if (!owned) return false;

    db.prepare("DELETE FROM collection_review_states WHERE user_id = ? AND (previous_report_id = ? OR current_report_id = ?)").run(userId, id, id);
    db.prepare(
      `DELETE FROM collection_review_states
       WHERE user_id = ?
         AND collection_id IN (
           SELECT collection_id FROM collection_reports WHERE report_id = ? AND user_id = ?
         )`
    ).run(userId, id, userId);
    db.prepare("DELETE FROM saved_comparisons WHERE user_id = ? AND (report_a_id = ? OR report_b_id = ?)").run(userId, id, id);
    db.prepare("DELETE FROM collection_reports WHERE report_id = ? AND user_id = ?").run(id, userId);
    return db.prepare("DELETE FROM diagnostic_reports WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
  });
  return tx();
}

export function archiveDiagnosticReport(userId: string, id: string) {
  const tx = db.transaction(() => {
    const owned = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(id, userId);
    if (!owned) return false;

    db.prepare("DELETE FROM collection_review_states WHERE user_id = ? AND (previous_report_id = ? OR current_report_id = ?)").run(userId, id, id);
    db.prepare(
      `DELETE FROM collection_review_states
       WHERE user_id = ?
         AND collection_id IN (
           SELECT collection_id FROM collection_reports WHERE report_id = ? AND user_id = ?
         )`
    ).run(userId, id, userId);
    db.prepare("DELETE FROM saved_comparisons WHERE user_id = ? AND (report_a_id = ? OR report_b_id = ?)").run(userId, id, id);
    db.prepare("DELETE FROM collection_reports WHERE report_id = ? AND user_id = ?").run(id, userId);
    return db
      .prepare("UPDATE diagnostic_reports SET user_id = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(deletedReportOwnerId(userId, id), new Date().toISOString(), id, userId).changes > 0;
  });
  return tx();
}

export function updateDiagnosticReport(userId: string, id: string, input: ReportUpdateInput): ReportSummary | null {
  const existing = db
    .prepare(
      `SELECT id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at,
        total_trades, win_rate, gross_pnl, total_costs, net_pnl, expectancy, average_realized_r
       FROM diagnostic_reports WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as Omit<ReportRow, "summary_json" | "insights_json" | "trades_json" | "charts_json"> | undefined;

  if (!existing) return null;

  const next = {
    name: input.name !== undefined ? input.name.trim() || existing.name : existing.name,
    notes: input.notes !== undefined ? input.notes : existing.notes ?? "",
    tagsJson: input.tags !== undefined ? JSON.stringify(normalizeTags(input.tags)) : existing.tags_json ?? "[]",
    strategyLabel:
      input.strategyLabel !== undefined ? input.strategyLabel.trim() : existing.strategy_label ?? "",
    reportType: input.reportType !== undefined ? normalizeReportType(input.reportType) : normalizeReportType(existing.report_type),
    updatedAt: new Date().toISOString(),
    userId,
    id
  };

  db.prepare(
    `UPDATE diagnostic_reports
     SET name = @name,
       notes = @notes,
       tags_json = @tagsJson,
       strategy_label = @strategyLabel,
       report_type = @reportType,
       updated_at = @updatedAt
     WHERE id = @id AND user_id = @userId`
  ).run(next);

  const updated = db
    .prepare(
      `SELECT id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at,
        total_trades, win_rate, gross_pnl, total_costs, net_pnl, expectancy, average_realized_r
       FROM diagnostic_reports WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as Omit<ReportRow, "summary_json" | "insights_json" | "trades_json" | "charts_json">;

  return mapSummaryRow(updated);
}

function deletedReportOwnerId(userId: string, reportId: string) {
  return `deleted:${userId}:${reportId}:${Date.now()}`;
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

export function listCollections(userId: string): ReportCollectionSummary[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.user_id, c.name, c.description, c.tags_json, c.created_at, c.updated_at,
        COUNT(cr.report_id) AS report_count
       FROM report_collections c
       LEFT JOIN collection_reports cr ON cr.collection_id = c.id AND cr.user_id = c.user_id
       WHERE c.user_id = ?
       GROUP BY c.id
       ORDER BY c.updated_at DESC`
    )
    .all(userId) as CollectionRow[];
  return rows.map(mapCollectionSummary);
}

export function createCollection(userId: string, input: CollectionInput): ReportCollectionSummary {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId,
    name: input.name.trim() || "Untitled Collection",
    description: input.description?.trim() ?? "",
    tagsJson: JSON.stringify(normalizeTags(input.tags ?? [])),
    createdAt: now,
    updatedAt: now
  };
  db.prepare(
    `INSERT INTO report_collections (id, user_id, name, description, tags_json, created_at, updated_at)
     VALUES (@id, @userId, @name, @description, @tagsJson, @createdAt, @updatedAt)`
  ).run(row);
  return { ...mapCollectionSummary({ ...rowToCollection(row), report_count: 0 }) };
}

export function getCollection(userId: string, id: string): ReportCollectionDetail | null {
  const collection = db.prepare("SELECT * FROM report_collections WHERE id = ? AND user_id = ?").get(id, userId) as CollectionRow | undefined;
  if (!collection) return null;
  const reports = db
    .prepare(
      `SELECT r.id, r.user_id, r.name, r.notes, r.tags_json, r.strategy_label, r.report_type, r.created_at, r.updated_at,
        r.total_trades, r.win_rate, r.gross_pnl, r.total_costs, r.net_pnl, r.expectancy, r.average_realized_r,
        r.summary_json
       FROM collection_reports cr
       JOIN diagnostic_reports r ON r.id = cr.report_id AND r.user_id = cr.user_id
       WHERE cr.collection_id = ? AND cr.user_id = ?
       ORDER BY cr.sort_order ASC, cr.added_at ASC`
    )
    .all(id, userId) as Omit<ReportRow, "insights_json" | "trades_json" | "charts_json">[];
  return {
    ...mapCollectionSummary({ ...collection, report_count: reports.length }),
    reports: reports.map(mapSummaryRow),
    fullReports: reports
      .map((report) => getDiagnosticReport(userId, report.id))
      .filter((report): report is DiagnosticsResult => Boolean(report))
  };
}

export function updateCollection(userId: string, id: string, input: Partial<CollectionInput>): ReportCollectionSummary | null {
  const existing = db.prepare("SELECT * FROM report_collections WHERE id = ? AND user_id = ?").get(id, userId) as CollectionRow | undefined;
  if (!existing) return null;
  const next = {
    id,
    name: input.name !== undefined ? input.name.trim() || existing.name : existing.name,
    description: input.description !== undefined ? input.description : existing.description ?? "",
    tagsJson: input.tags !== undefined ? JSON.stringify(normalizeTags(input.tags)) : existing.tags_json ?? "[]",
    updatedAt: new Date().toISOString()
  };
  db.prepare(
    `UPDATE report_collections
     SET name = @name, description = @description, tags_json = @tagsJson, updated_at = @updatedAt
     WHERE id = @id AND user_id = @userId`
  ).run({ ...next, userId });
  const updated = getCollection(userId, id);
  return updated
    ? {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        tags: updated.tags,
        reportCount: updated.reportCount,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      }
    : null;
}

export function deleteCollection(userId: string, id: string): boolean {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM collection_reports WHERE collection_id = ? AND user_id = ?").run(id, userId);
    return db.prepare("DELETE FROM report_collections WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
  });
  return tx();
}

export function addReportToCollection(userId: string, collectionId: string, reportId: string): ReportCollectionDetail | null {
  const collection = db.prepare("SELECT id FROM report_collections WHERE id = ? AND user_id = ?").get(collectionId, userId);
  const report = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(reportId, userId);
  if (!collection || !report) return null;
  const nextOrder =
    ((db
      .prepare("SELECT MAX(sort_order) AS max_order FROM collection_reports WHERE collection_id = ? AND user_id = ?")
      .get(collectionId, userId) as { max_order: number | null }).max_order ?? -1) + 1;
  db.prepare(
    `INSERT OR IGNORE INTO collection_reports (user_id, collection_id, report_id, sort_order, added_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, collectionId, reportId, nextOrder, new Date().toISOString());
  db.prepare("UPDATE report_collections SET updated_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), collectionId, userId);
  return getCollection(userId, collectionId);
}

export function removeReportFromCollection(userId: string, collectionId: string, reportId: string): boolean {
  const removed = db
    .prepare("DELETE FROM collection_reports WHERE collection_id = ? AND report_id = ? AND user_id = ?")
    .run(collectionId, reportId, userId).changes > 0;
  if (removed) db.prepare("UPDATE report_collections SET updated_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), collectionId, userId);
  return removed;
}

export function reorderCollectionReports(userId: string, collectionId: string, reportIds: string[]): ReportCollectionDetail | null {
  const collection = db.prepare("SELECT id FROM report_collections WHERE id = ? AND user_id = ?").get(collectionId, userId);
  if (!collection) return null;
  const tx = db.transaction(() => {
    reportIds.forEach((reportId, index) => {
      db.prepare("UPDATE collection_reports SET sort_order = ? WHERE collection_id = ? AND report_id = ? AND user_id = ?").run(
        index,
        collectionId,
        reportId,
        userId
      );
    });
    db.prepare("UPDATE report_collections SET updated_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), collectionId, userId);
  });
  tx();
  return getCollection(userId, collectionId);
}

export function listSavedComparisons(userId: string): SavedComparison[] {
  const rows = db
    .prepare(
      `SELECT sc.*, a.name AS report_a_name, b.name AS report_b_name
       FROM saved_comparisons sc
       LEFT JOIN diagnostic_reports a ON a.id = sc.report_a_id AND a.user_id = sc.user_id
       LEFT JOIN diagnostic_reports b ON b.id = sc.report_b_id AND b.user_id = sc.user_id
       WHERE sc.user_id = ?
       ORDER BY sc.updated_at DESC`
    )
    .all(userId) as SavedComparisonRow[];
  return rows.map(mapSavedComparison);
}

export function createSavedComparison(userId: string, input: SavedComparisonInput): SavedComparison | null {
  const reportA = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(input.reportAId, userId);
  const reportB = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(input.reportBId, userId);
  if (!reportA || !reportB) return null;
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    userId,
    name: input.name.trim() || "Saved Comparison",
    description: input.description?.trim() ?? "",
    reportAId: input.reportAId,
    reportBId: input.reportBId,
    dimension: input.dimension ?? "",
    groupKey: input.groupKey ?? "",
    createdAt: now,
    updatedAt: now
  };
  db.prepare(
    `INSERT INTO saved_comparisons
      (id, user_id, name, description, report_a_id, report_b_id, dimension, group_key, created_at, updated_at)
     VALUES
      (@id, @userId, @name, @description, @reportAId, @reportBId, @dimension, @groupKey, @createdAt, @updatedAt)`
  ).run(row);
  return getSavedComparison(userId, row.id) as SavedComparison;
}

export function getSavedComparison(userId: string, id: string): SavedComparison | null {
  const row = db
    .prepare(
      `SELECT sc.*, a.name AS report_a_name, b.name AS report_b_name
       FROM saved_comparisons sc
       LEFT JOIN diagnostic_reports a ON a.id = sc.report_a_id AND a.user_id = sc.user_id
       LEFT JOIN diagnostic_reports b ON b.id = sc.report_b_id AND b.user_id = sc.user_id
       WHERE sc.id = ? AND sc.user_id = ?`
    )
    .get(id, userId) as SavedComparisonRow | undefined;
  return row ? mapSavedComparison(row) : null;
}

export function updateSavedComparison(userId: string, id: string, input: Partial<SavedComparisonInput>): SavedComparison | null {
  const existing = getSavedComparison(userId, id);
  if (!existing) return null;
  const nextReportAId = input.reportAId ?? existing.reportAId;
  const nextReportBId = input.reportBId ?? existing.reportBId;
  const reportA = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(nextReportAId, userId);
  const reportB = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(nextReportBId, userId);
  if (!reportA || !reportB) return null;
  db.prepare(
    `UPDATE saved_comparisons
     SET name = @name, description = @description, report_a_id = @reportAId, report_b_id = @reportBId,
       dimension = @dimension, group_key = @groupKey, updated_at = @updatedAt
     WHERE id = @id AND user_id = @userId`
  ).run({
    id,
    userId,
    name: input.name !== undefined ? input.name.trim() || existing.name : existing.name,
    description: input.description !== undefined ? input.description : existing.description ?? "",
    reportAId: nextReportAId,
    reportBId: nextReportBId,
    dimension: input.dimension ?? existing.dimension ?? "",
    groupKey: input.groupKey ?? existing.groupKey ?? "",
    updatedAt: new Date().toISOString()
  });
  return getSavedComparison(userId, id);
}

export function deleteSavedComparison(userId: string, id: string): boolean {
  return db.prepare("DELETE FROM saved_comparisons WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function cleanupDemoData(userId: string) {
  const demoReportRows = db
    .prepare("SELECT id, name, tags_json, strategy_label FROM diagnostic_reports WHERE user_id = ?")
    .all(userId) as Array<{ id: string; name: string | null; tags_json: string | null; strategy_label: string | null }>;
  const demoReportIds = demoReportRows
    .filter((row) => {
      const tags = parseTags(row.tags_json).map((tag) => tag.toLowerCase());
      return tags.includes("demo") || row.strategy_label === "ORB Demo Strategy" || (row.name ?? "").startsWith("ORB Demo");
    })
    .map((row) => row.id);

  const demoCollectionRows = db
    .prepare("SELECT id, name, tags_json FROM report_collections WHERE user_id = ?")
    .all(userId) as Array<{ id: string; name: string | null; tags_json: string | null }>;
  const demoCollectionIds = demoCollectionRows
    .filter((row) => {
      const tags = parseTags(row.tags_json).map((tag) => tag.toLowerCase());
      return tags.includes("demo") || (row.name ?? "").startsWith("ORB Demo Strategy Iterations");
    })
    .map((row) => row.id);

  const demoComparisonRows = db
    .prepare("SELECT id, name, description FROM saved_comparisons WHERE user_id = ?")
    .all(userId) as Array<{ id: string; name: string | null; description: string | null }>;
  const demoComparisonIds = demoComparisonRows
    .filter((row) => (row.name ?? "").startsWith("ORB Demo") || (row.description ?? "").toLowerCase().includes("demo"))
    .map((row) => row.id);

  const tx = db.transaction(() => {
    let deletedReports = 0;
    let deletedCollections = 0;
    let deletedSavedComparisons = 0;

    demoComparisonIds.forEach((id) => {
      deletedSavedComparisons += db.prepare("DELETE FROM saved_comparisons WHERE id = ? AND user_id = ?").run(id, userId).changes;
    });

    demoCollectionIds.forEach((id) => {
      db.prepare("DELETE FROM collection_review_states WHERE collection_id = ? AND user_id = ?").run(id, userId);
      db.prepare("DELETE FROM collection_reports WHERE collection_id = ? AND user_id = ?").run(id, userId);
      deletedCollections += db.prepare("DELETE FROM report_collections WHERE id = ? AND user_id = ?").run(id, userId).changes;
    });

    demoReportIds.forEach((id) => {
      db.prepare("DELETE FROM collection_review_states WHERE user_id = ? AND (previous_report_id = ? OR current_report_id = ?)").run(userId, id, id);
      db.prepare("DELETE FROM collection_reports WHERE report_id = ? AND user_id = ?").run(id, userId);
      db.prepare("DELETE FROM saved_comparisons WHERE user_id = ? AND (report_a_id = ? OR report_b_id = ?)").run(userId, id, id);
      deletedReports += db.prepare("DELETE FROM diagnostic_reports WHERE id = ? AND user_id = ?").run(id, userId).changes;
    });

    return { deletedReports, deletedCollections, deletedSavedComparisons };
  });

  return tx();
}

export function listCollectionReviewStates(userId: string, collectionId: string): CollectionReviewState[] {
  const collection = db.prepare("SELECT id FROM report_collections WHERE id = ? AND user_id = ?").get(collectionId, userId);
  if (!collection) return [];
  const rows = db
    .prepare("SELECT * FROM collection_review_states WHERE collection_id = ? AND user_id = ? ORDER BY updated_at DESC")
    .all(collectionId, userId) as ReviewStateRow[];
  return rows.map(mapReviewState);
}

export function upsertCollectionReviewState(
  userId: string,
  collectionId: string,
  input: CollectionReviewStateInput
): CollectionReviewState | null {
  const collection = db.prepare("SELECT id FROM report_collections WHERE id = ? AND user_id = ?").get(collectionId, userId);
  const previousReport = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(input.previousReportId, userId);
  const currentReport = db.prepare("SELECT id FROM diagnostic_reports WHERE id = ? AND user_id = ?").get(input.currentReportId, userId);
  if (!collection || !previousReport || !currentReport) return null;
  const existing = db
    .prepare(
      `SELECT * FROM collection_review_states
       WHERE collection_id = ? AND previous_report_id = ? AND current_report_id = ? AND user_id = ?`
    )
    .get(collectionId, input.previousReportId, input.currentReportId, userId) as ReviewStateRow | undefined;
  const now = new Date().toISOString();
  const status = normalizeReviewStatus(input.status);
  if (existing) {
    db.prepare(
      `UPDATE collection_review_states
       SET status = @status, note = @note, updated_at = @updatedAt
       WHERE id = @id AND user_id = @userId`
    ).run({
      id: existing.id,
      userId,
      status,
      note: input.note ?? existing.note ?? "",
      updatedAt: now
    });
    return mapReviewState(
      db.prepare("SELECT * FROM collection_review_states WHERE id = ? AND user_id = ?").get(existing.id, userId) as ReviewStateRow
    );
  }

  const row = {
    id: randomUUID(),
    userId,
    collectionId,
    previousReportId: input.previousReportId,
    currentReportId: input.currentReportId,
    status,
    note: input.note ?? "",
    createdAt: now,
    updatedAt: now
  };
  db.prepare(
    `INSERT INTO collection_review_states
      (id, user_id, collection_id, previous_report_id, current_report_id, status, note, created_at, updated_at)
     VALUES
      (@id, @userId, @collectionId, @previousReportId, @currentReportId, @status, @note, @createdAt, @updatedAt)`
  ).run(row);
  return {
    id: row.id,
    collectionId,
    previousReportId: row.previousReportId,
    currentReportId: row.currentReportId,
    status,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function deleteCollectionReviewState(
  userId: string,
  collectionId: string,
  previousReportId: string,
  currentReportId: string
): boolean {
  return db
    .prepare(
      `DELETE FROM collection_review_states
       WHERE collection_id = ? AND previous_report_id = ? AND current_report_id = ? AND user_id = ?`
    )
    .run(collectionId, previousReportId, currentReportId, userId).changes > 0;
}

export function trackUserEvent(userId: string, input: UserEventInput): UserEvent {
  getOrCreateUserProfile(userId);
  if (input.eventName === "created_first_report") {
    const existing = db
      .prepare("SELECT * FROM user_events WHERE user_id = ? AND event_name = ? ORDER BY created_at ASC LIMIT 1")
      .get(userId, input.eventName) as UserEventRow | undefined;
    if (existing) return mapUserEvent(existing);
  }

  const row = {
    id: randomUUID(),
    userId,
    eventName: input.eventName,
    propertiesJson: JSON.stringify(input.properties ?? {}),
    createdAt: new Date().toISOString()
  };
  db.prepare(
    `INSERT INTO user_events (id, user_id, event_name, event_properties_json, created_at)
     VALUES (@id, @userId, @eventName, @propertiesJson, @createdAt)`
  ).run(row);
  return mapUserEvent(
    db.prepare("SELECT * FROM user_events WHERE id = ? AND user_id = ?").get(row.id, userId) as UserEventRow
  );
}

export function getActivationSummary(userId: string): ActivationSummary {
  const eventRows = db
    .prepare("SELECT event_name, created_at FROM user_events WHERE user_id = ?")
    .all(userId) as Array<{ event_name: string; created_at: string }>;
  const eventNames = new Set(eventRows.map((row) => row.event_name));
  const reportInfo = db
    .prepare("SELECT COUNT(*) AS count, MIN(created_at) AS first_created_at FROM diagnostic_reports WHERE user_id = ?")
    .get(userId) as { count: number; first_created_at: string | null };
  const collectionCount = (db
    .prepare("SELECT COUNT(*) AS count FROM report_collections WHERE user_id = ?")
    .get(userId) as { count: number }).count;
  const comparisonCount = (db
    .prepare("SELECT COUNT(*) AS count FROM saved_comparisons WHERE user_id = ?")
    .get(userId) as { count: number }).count;
  const lastEventAt = eventRows
    .map((row) => row.created_at)
    .sort((a, b) => b.localeCompare(a))[0];

  return {
    hasUploadedCsv: eventNames.has("csv_uploaded"),
    hasCreatedReport: eventNames.has("diagnostic_report_created") || Number(reportInfo.count) > 0,
    hasOpenedDashboard: eventNames.has("dashboard_opened"),
    hasClickedDrilldown: eventNames.has("drilldown_opened"),
    hasOpenedCompare: eventNames.has("compare_opened"),
    hasCreatedCollection: eventNames.has("strategy_set_created") || Number(collectionCount) > 0,
    hasCreatedComparison: eventNames.has("comparison_created") || eventNames.has("saved_comparison_created") || Number(comparisonCount) > 0,
    hasStartedCheckout: eventNames.has("checkout_started"),
    hasCompletedCheckout: eventNames.has("checkout_completed"),
    firstReportCreatedAt: reportInfo.first_created_at ?? undefined,
    lastEventAt
  };
}

export function saveFeedback(
  userId: string,
  input: FeedbackInput & { userEmail?: string; userName?: string }
): FeedbackItem {
  getOrCreateUserProfile(userId);
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO feedback (
       id, user_id, user_email, user_name, type, message, page_url, user_agent, status, created_at, updated_at
     ) VALUES (
       @id, @userId, @userEmail, @userName, @type, @message, @pageUrl, @userAgent, 'new', @createdAt, @updatedAt
     )`
  ).run({
    id,
    userId,
    userEmail: input.userEmail ?? "",
    userName: input.userName ?? "",
    type: normalizeFeedbackType(input.type),
    message: input.message,
    pageUrl: input.pageUrl ?? "",
    userAgent: input.userAgent ?? "",
    createdAt: now,
    updatedAt: now
  });
  return mapFeedback(db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) as FeedbackRow);
}

export function listFeedback(): FeedbackItem[] {
  const rows = db.prepare("SELECT * FROM feedback ORDER BY created_at DESC").all() as FeedbackRow[];
  return rows.map(mapFeedback);
}

export function updateFeedbackStatus(id: string, status: FeedbackStatus): FeedbackItem | null {
  const normalizedStatus = normalizeFeedbackStatus(status);
  const updatedAt = new Date().toISOString();
  db.prepare("UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?").run(normalizedStatus, updatedAt, id);
  const row = db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) as FeedbackRow | undefined;
  return row ? mapFeedback(row) : null;
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

function rowToCollection(row: {
  id: string;
  userId: string;
  name: string;
  description: string;
  tagsJson: string;
  createdAt: string;
  updatedAt: string;
}): CollectionRow {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    description: row.description,
    tags_json: row.tagsJson,
    created_at: row.createdAt,
    updated_at: row.updatedAt
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


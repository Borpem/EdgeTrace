import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

loadDotEnv();

const PREFIX = "postgres-smoke-test-";
const DEFAULT_USER_ID = "local-demo-user";

if (process.env.DATABASE_PROVIDER !== "postgres") {
  console.error("Postgres smoke test requires DATABASE_PROVIDER=postgres.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("Postgres smoke test requires DATABASE_URL. The URL is intentionally not logged.");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const runId = `${PREFIX}${Date.now()}`;
const userId = `${runId}-user`;
const reportAId = `${runId}-report-a`;
const reportBId = `${runId}-report-b`;
const collectionId = `${runId}-collection`;
const comparisonId = `${runId}-comparison`;
const eventId = `${runId}-event`;

try {
  console.log("Postgres smoke test: connecting and initializing schema...");
  await initializeSchema();

  console.log("Postgres smoke test: cleaning old smoke-test rows...");
  await cleanupSmokeRows();

  console.log("Postgres smoke test: creating user profile...");
  await query(
    `INSERT INTO user_profiles (user_id, email, name, plan_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'free', $4, $4)`,
    [userId, `${userId}@edgetrace.local`, "Postgres Smoke Test", now()]
  );

  console.log("Postgres smoke test: creating diagnostic reports...");
  await insertDiagnosticReport(reportAId, userId, "Postgres Smoke Test Report A", 8, 0.5, 210, 24, 186, 23.25, 0.31);
  await insertDiagnosticReport(reportBId, userId, "Postgres Smoke Test Report B", 9, 0.56, 260, 18, 242, 26.88, 0.42);

  console.log("Postgres smoke test: creating collection and membership...");
  await query(
    `INSERT INTO report_collections (id, user_id, name, description, tags_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [collectionId, userId, "Postgres Smoke Test Collection", "Temporary validation collection.", JSON.stringify(["postgres-smoke-test"]), now()]
  );
  await query(
    `INSERT INTO collection_reports (user_id, collection_id, report_id, sort_order, added_at)
     VALUES ($1, $2, $3, 0, $4), ($1, $2, $5, 1, $4)`,
    [userId, collectionId, reportAId, now(), reportBId]
  );

  console.log("Postgres smoke test: creating saved comparison...");
  await query(
    `INSERT INTO saved_comparisons (
       id, user_id, name, description, report_a_id, report_b_id, dimension, group_key, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [
      comparisonId,
      userId,
      "Postgres Smoke Test Comparison",
      "Temporary validation comparison.",
      reportAId,
      reportBId,
      "symbol",
      "QQQ",
      now()
    ]
  );

  console.log("Postgres smoke test: creating activation event...");
  await query(
    `INSERT INTO user_events (id, user_id, event_name, event_properties_json, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      eventId,
      userId,
      "created_first_report",
      JSON.stringify({ reportId: reportAId, brokerId: "generic_csv", tradeCount: 8 }),
      now()
    ]
  );

  console.log("Postgres smoke test: reading records back...");
  await assertCount("user_profiles", "user_id = $1", [userId], 1);
  await assertCount("diagnostic_reports", "user_id = $1 AND id LIKE $2", [userId, `${PREFIX}%`], 2);
  await assertCount("report_collections", "user_id = $1 AND id = $2", [userId, collectionId], 1);
  await assertCount("collection_reports", "user_id = $1 AND collection_id = $2", [userId, collectionId], 2);
  await assertCount("saved_comparisons", "user_id = $1 AND id = $2", [userId, comparisonId], 1);
  await assertCount("user_events", "user_id = $1 AND id = $2", [userId, eventId], 1);

  const readback = await query(
    `SELECT r.name, c.name AS collection_name, sc.name AS comparison_name
     FROM diagnostic_reports r
     JOIN collection_reports cr ON cr.report_id = r.id AND cr.user_id = r.user_id
     JOIN report_collections c ON c.id = cr.collection_id AND c.user_id = cr.user_id
     JOIN saved_comparisons sc ON sc.report_a_id = r.id AND sc.user_id = r.user_id
     WHERE r.id = $1 AND r.user_id = $2`,
    [reportAId, userId]
  );
  if (readback.rowCount !== 1) {
    throw new Error("Joined report/collection/comparison readback failed.");
  }

  console.log("Postgres smoke test: deleting smoke-test rows...");
  await cleanupSmokeRows();
  await assertCount("diagnostic_reports", "user_id = $1", [userId], 0);
  await assertCount("report_collections", "user_id = $1", [userId], 0);
  await assertCount("saved_comparisons", "user_id = $1", [userId], 0);
  await assertCount("user_events", "user_id = $1", [userId], 0);
  await assertCount("user_profiles", "user_id = $1", [userId], 0);

  console.log("Postgres smoke test passed. Schema, core writes, readback, and cleanup succeeded.");
} finally {
  try {
    await cleanupSmokeRows();
  } finally {
    await pool.end();
  }
}

async function initializeSchema() {
  await query(`
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
      charts_json TEXT
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

    CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_user_id ON diagnostic_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_report_collections_user_id ON report_collections(user_id);
    CREATE INDEX IF NOT EXISTS idx_collection_reports_user_id ON collection_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_saved_comparisons_user_id ON saved_comparisons(user_id);
    CREATE INDEX IF NOT EXISTS idx_collection_review_states_user_id ON collection_review_states(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer_id ON user_profiles(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_events_user_event ON user_events(user_id, event_name);
    CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON user_events(created_at);
  `);
}

async function insertDiagnosticReport(id, ownerUserId, name, totalTrades, winRate, grossPnl, totalCosts, netPnl, expectancy, averageRealizedR) {
  const timestamp = now();
  const metrics = {
    totalTrades,
    winRate,
    grossPnl,
    totalCosts,
    netPnl,
    averageWin: 52,
    averageLoss: -28,
    profitFactor: 1.4,
    expectancy,
    grossExpectancy: grossPnl / totalTrades,
    averageRealizedR
  };
  const trades = [
    {
      id: `${id}-trade-1`,
      symbol: "QQQ",
      side: "long",
      entryTime: timestamp,
      entryPrice: 420,
      quantity: 1,
      commission: 1,
      fees: 0.25,
      grossPnl,
      estimatedCosts: totalCosts,
      netPnl,
      realizedR: averageRealizedR
    }
  ];
  const charts = {
    equityCurve: [{ trade: 1, equity: netPnl }],
    pnlBySymbol: [{ symbol: "QQQ", pnl: netPnl }],
    pnlByHour: [{ hour: "09:30", pnl: netPnl }]
  };

  await query(
    `INSERT INTO diagnostic_reports (
       id, user_id, name, notes, tags_json, strategy_label, report_type, created_at, updated_at,
       total_trades, win_rate, gross_pnl, total_costs, net_pnl, expectancy, average_realized_r,
       summary_json, insights_json, trades_json, charts_json
     ) VALUES (
       $1, $2, $3, '', $4, 'Postgres Smoke Test', 'imported', $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     )`,
    [
      id,
      ownerUserId,
      name,
      JSON.stringify(["postgres-smoke-test"]),
      timestamp,
      totalTrades,
      winRate,
      grossPnl,
      totalCosts,
      netPnl,
      expectancy,
      averageRealizedR,
      JSON.stringify(metrics),
      JSON.stringify([]),
      JSON.stringify(trades),
      JSON.stringify(charts)
    ]
  );
}

async function cleanupSmokeRows() {
  await query("DELETE FROM user_events WHERE user_id LIKE $1 OR id LIKE $1 OR event_name LIKE $2", [`${PREFIX}%`, "postgres_smoke_test%"]);
  await query("DELETE FROM collection_review_states WHERE user_id LIKE $1 OR collection_id LIKE $1 OR previous_report_id LIKE $1 OR current_report_id LIKE $1", [`${PREFIX}%`]);
  await query("DELETE FROM collection_reports WHERE user_id LIKE $1 OR collection_id LIKE $1 OR report_id LIKE $1", [`${PREFIX}%`]);
  await query("DELETE FROM saved_comparisons WHERE user_id LIKE $1 OR id LIKE $1 OR name LIKE $2", [`${PREFIX}%`, "Postgres Smoke Test%"]);
  await query("DELETE FROM report_collections WHERE user_id LIKE $1 OR id LIKE $1 OR name LIKE $2", [`${PREFIX}%`, "Postgres Smoke Test%"]);
  await query("DELETE FROM diagnostic_reports WHERE user_id LIKE $1 OR id LIKE $1 OR name LIKE $2", [`${PREFIX}%`, "Postgres Smoke Test%"]);
  await query("DELETE FROM user_profiles WHERE user_id LIKE $1 OR email LIKE $1", [`${PREFIX}%`]);
}

async function assertCount(table, whereClause, params, expected) {
  const result = await query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${whereClause}`, params);
  const count = Number(result.rows[0]?.count ?? 0);
  if (count !== expected) {
    throw new Error(`Expected ${expected} rows in ${table}, found ${count}.`);
  }
}

async function query(sql, params = []) {
  return pool.query(sql, params);
}

function now() {
  return new Date().toISOString();
}

function loadDotEnv() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), filename);
    if (!existsSync(envPath)) continue;

    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

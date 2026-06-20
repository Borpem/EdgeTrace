import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.DATABASE_PROVIDER = "sqlite";
process.env.EDGETRACE_DB_PATH = join(mkdtempSync(join(tmpdir(), "edgetrace-security-")), "security.sqlite");

const db = await import("../server/db");
const { runDiagnostics } = await import("../src/lib/diagnostics");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const userA = "security-user-a";
const userB = "security-user-b";
const reportA = runDiagnostics("security-report-a", [
  {
    id: "trade-a-1",
    symbol: "AAPL",
    side: "long",
    entryTime: "2026-05-01T09:30:00.000Z",
    exitTime: "2026-05-01T10:00:00.000Z",
    quantity: 1,
    entryPrice: 100,
    exitPrice: 110,
    grossPnl: 10,
    netPnl: 9,
    costs: 1,
    source: "generic_csv"
  }
]);
const reportB = runDiagnostics("security-report-b", [
  {
    id: "trade-b-1",
    symbol: "MSFT",
    side: "short",
    entryTime: "2026-05-02T09:30:00.000Z",
    exitTime: "2026-05-02T10:00:00.000Z",
    quantity: 1,
    entryPrice: 100,
    exitPrice: 95,
    grossPnl: 5,
    netPnl: 4,
    costs: 1,
    source: "generic_csv"
  }
]);

await db.initDb();
await db.getOrCreateUserProfile(userA, { email: "a@example.test", name: "Security A" });
await db.getOrCreateUserProfile(userB, { email: "b@example.test", name: "Security B" });

const savedA = await db.saveDiagnosticReport(userA, reportA, "Security A report");
const savedB = await db.saveDiagnosticReport(userB, reportB, "Security B report");

assert(await db.getDiagnosticReport(userA, savedA.id), "User A should read own report.");
assert(!(await db.getDiagnosticReport(userB, savedA.id)), "User B must not read User A report.");
assert(!(await db.deleteDiagnosticReport(userB, savedA.id)), "User B must not delete User A report.");
assert(await db.getDiagnosticReport(userA, savedA.id), "User A report should still exist after User B delete attempt.");

const collectionB = await db.createCollection(userB, { name: "Security B set", description: "", tags: [] });
assert(!(await db.addReportToCollection(userB, collectionB.id, savedA.id)), "User B must not link User A report to a strategy set.");

const mixedComparison = await db.createSavedComparison(userB, {
  name: "Mixed ownership comparison",
  description: "",
  reportAId: savedA.id,
  reportBId: savedB.id
});
assert(!mixedComparison, "User B must not create a saved comparison with User A report.");

console.log("Security isolation checks passed.");

/**
 * Deploy-time SQL migration runner.
 *
 * Applies any not-yet-applied prisma/sql/NNN_*.sql files, in order, and records
 * them in a `_sql_migrations` table so each runs exactly once. Runs in the Vercel
 * build (see package.json `build`). If no database URL is configured (e.g. a local
 * `next build` with no env), it logs and exits 0 so the build still succeeds.
 *
 * Bootstrap: files numbered <= BASELINE_MAX are treated as already-applied on an
 * EXISTING database (one that predates this runner and had them pasted manually),
 * so we never re-run the non-idempotent initial schema. A FRESH database (no
 * `User` table) gets everything applied from 000.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BASELINE_MAX = 5; // 000..005 were applied by hand before the runner existed.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, "..", "prisma", "sql");

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "";

function fileNumber(name) {
  const m = /^(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

/**
 * Split a .sql file into individual statements so each runs on its own — matching how the Neon
 * SQL editor / psql apply files (one autocommit statement at a time). This is REQUIRED for files
 * like 030 that `ALTER TYPE ... ADD VALUE` and then USE the new value: Postgres forbids using a
 * newly-added enum value in the same transaction, and node-postgres would otherwise run the whole
 * file as a single implicit transaction. Files that carry their own BEGIN/COMMIT still work —
 * BEGIN and COMMIT become their own statements bracketing the rest on the same connection.
 *
 * Respects `--` line comments, `/* *\/` block comments, single-quoted strings, and dollar-quoted
 * blocks ($$ … $$ / $tag$ … $tag$) so semicolons inside them never split a statement.
 */
function splitStatements(sql) {
  const stmts = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      const end = nl === -1 ? n : nl;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (two === "/*") {
      const close = sql.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      cur += sql.slice(i, j);
      i = j;
      continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        cur += sql.slice(i, end);
        i = end;
        continue;
      }
    }
    if (ch === ";") {
      const t = cur.trim();
      if (t) stmts.push(t);
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  const last = cur.trim();
  if (last) stmts.push(last);
  return stmts;
}

async function main() {
  if (!connectionString) {
    console.log("[apply-sql] No database URL set — skipping migrations (build continues).");
    return;
  }

  const files = readdirSync(SQL_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => fileNumber(a) - fileNumber(b) || a.localeCompare(b));

  const ssl =
    /sslmode=require/.test(connectionString) || /neon\.tech/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined;

  const client = new pg.Client({ connectionString, ssl });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS "_sql_migrations" (
         filename text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    );

    const applied = new Set(
      (await client.query(`SELECT filename FROM "_sql_migrations"`)).rows.map((r) => r.filename)
    );

    // First run on a pre-existing database: baseline the hand-applied files.
    if (applied.size === 0) {
      const probe = await client.query(`SELECT to_regclass('public."User"') AS t`);
      const dbHasSchema = probe.rows[0]?.t != null;
      if (dbHasSchema) {
        for (const f of files) {
          if (fileNumber(f) <= BASELINE_MAX) {
            await client.query(`INSERT INTO "_sql_migrations"(filename) VALUES ($1) ON CONFLICT DO NOTHING`, [f]);
            applied.add(f);
            console.log(`[apply-sql] baseline (assumed applied): ${f}`);
          }
        }
      }
    }

    let ran = 0;
    let failed = 0;
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(join(SQL_DIR, f), "utf8");
      process.stdout.write(`[apply-sql] applying ${f} … `);
      try {
        // Statement-by-statement (autocommit) so files like 030 (ADD ENUM VALUE + use it) work.
        for (const stmt of splitStatements(sql)) {
          await client.query(stmt);
        }
        await client.query(`INSERT INTO "_sql_migrations"(filename) VALUES ($1) ON CONFLICT DO NOTHING`, [f]);
        ran++;
        console.log("done");
      } catch (err) {
        // Never let one file abort the whole migration (or the deploy). Reset any open/aborted
        // transaction and continue; the file is NOT recorded, so a later run retries it.
        await client.query("ROLLBACK").catch(() => {});
        failed++;
        console.log(`FAILED — ${err.message}`);
        console.error(`[apply-sql] ⚠ ${f} failed and was skipped: ${err.message}`);
      }
    }
    if (failed > 0) {
      console.error(`[apply-sql] ${failed} file(s) failed — see above. Deploy continues; apply them in the Neon SQL editor if they persist.`);
    }
    console.log(`[apply-sql] complete — ${ran} file(s) applied, ${applied.size} already present.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // NON-FATAL: a migration/connection problem must never block the app deploy. Log loudly and
  // exit 0 so `next build` still runs. Any un-applied migration is retried on the next deploy or
  // can be pasted into the Neon SQL editor.
  console.error("[apply-sql] ERROR (non-fatal, deploy continues):", err.message);
  process.exit(0);
});

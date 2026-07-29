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
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(join(SQL_DIR, f), "utf8");
      process.stdout.write(`[apply-sql] applying ${f} … `);
      await client.query(sql);
      await client.query(`INSERT INTO "_sql_migrations"(filename) VALUES ($1) ON CONFLICT DO NOTHING`, [f]);
      ran++;
      console.log("done");
    }
    console.log(`[apply-sql] complete — ${ran} file(s) applied, ${applied.size} already present.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[apply-sql] FAILED:", err.message);
  process.exit(1);
});

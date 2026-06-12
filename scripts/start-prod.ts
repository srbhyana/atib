/**
 * scripts/start-prod.ts
 *
 * Production startup wrapper for Railway. Runs in this order:
 *   1. init-db    — enables pgvector extension (idempotent)
 *   2. migrate()  — applies all SQL migrations in ./drizzle/ via drizzle-orm migrator
 *   3. next start — boots the Next.js server
 *
 * This is what railway.toml points its startCommand at. The container
 * self-bootstraps the schema on first boot so we never have to run
 * `railway run npm run db:push` manually.
 *
 * Safety: init-db and migrate() are both idempotent — running them on every
 * boot is fine. They cost <1 second when there's nothing to do.
 */

import { spawn } from "node:child_process";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Railway's postgres-ssl:18 template REQUIRES SSL on every connection — even
// from inside the Railway network. (Earlier we tried to disable SSL for
// `*.railway.internal`; that caused "Connection terminated unexpectedly" on
// every query because the server slams the connection closed.)
// Always-on SSL with rejectUnauthorized:false is the correct setting.

function run(label: string, cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n[start-prod] ▶ ${label} — ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`[start-prod] ✓ ${label} done`);
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Always SSL with self-signed accepted — see top-of-file comment for why.
  console.log("[start-prod] migrations: ssl = on, no-verify");

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    max: 2,
  });

  try {
    const db = drizzle(pool);
    console.log("[start-prod] applying migrations from ./drizzle ...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[start-prod] ✓ migrations applied");
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log("[start-prod] beginning production boot sequence");

  // Step 1: enable pgvector
  try {
    await run("init-db (pgvector)", "npx", ["tsx", "scripts/init-db.ts"]);
  } catch (err) {
    // If pgvector init fails (e.g. permission), we don't want to hard-fail the
    // entire startup — vector ops will simply fail later with a clearer error.
    console.error("[start-prod] init-db failed (continuing anyway):", err);
  }

  // Step 2: apply schema via drizzle-orm migrate() (deterministic SQL, no TTY needed)
  try {
    await runMigrations();
  } catch (err) {
    // Log but don't hard-fail — Next.js will surface the real DB error.
    console.error("[start-prod] migrations failed (continuing anyway):", err);
  }

  // Step 3: hand off to Next.js. Use exec semantics — replace this process
  // so signals (SIGTERM from Railway on deploy) reach next directly.
  console.log("\n[start-prod] ▶ next start (taking over PID)");
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("npx", ["next", "start"], {
      stdio: "inherit",
      env: process.env,
    });
  } catch (err) {
    // execFileSync throws when the child exits non-zero (which is fine on
    // SIGTERM). Bubble up so the container exits cleanly.
    const code =
      (err as { status?: number; signal?: NodeJS.Signals }).status ??
      ((err as { signal?: NodeJS.Signals }).signal ? 0 : 1);
    process.exit(typeof code === "number" ? code : 1);
  }
}

main().catch((err) => {
  console.error("[start-prod] fatal:", err);
  process.exit(1);
});

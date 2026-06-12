/**
 * scripts/init-db.ts
 *
 * Creates the `vector` extension needed by Drizzle's vector(1536) columns.
 * Idempotent — safe to run repeatedly.
 *
 * Run before `npm run db:push`. Uses standard `pg` with SSL bypassed for
 * Railway's self-signed cert.
 */
import "dotenv/config";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  console.log("init-db: connecting to", url.replace(/:[^@]+@/, ":***@"));

  // Railway's postgres-ssl:18 template REQUIRES SSL on every connection,
  // including internal. Always negotiate SSL, accept the self-signed cert.
  console.log("init-db: ssl = on, no-verify");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("init-db: connected ✓");

  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  const r = await client.query(
    "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
  );
  console.log(`init-db: pgvector v${r.rows[0]?.extversion} ready ✓`);

  await client.end();
}

main().catch((err) => {
  console.error("init-db failed:", err.message);
  process.exit(1);
});

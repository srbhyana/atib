import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Shared connection pool.
 *
 * Railway's internal Postgres (`*.railway.internal`) does NOT speak SSL —
 * the internal network is trusted. The public proxy (`*.proxy.rlwy.net` /
 * `*.up.railway.app`) DOES require SSL with a self-signed cert.
 *
 * We auto-detect the host type so the same code works in the deployed
 * container AND from a developer's laptop hitting the public URL.
 */
function isInternalRailwayHost(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".railway.internal");
  } catch {
    return false;
  }
}

function stripSslMode(url: string): string {
  // Remove ?sslmode=... or &sslmode=... so our explicit ssl option takes
  // precedence. Railway's internal host doesn't speak SSL and pg will
  // "Connection terminated unexpectedly" if it attempts a TLS handshake.
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url;
  }
}

function createPool() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const url = stripSslMode(rawUrl);
  const isInternal = isInternalRailwayHost(url);
  const ssl = isInternal
    ? false
    : { rejectUnauthorized: false, checkServerIdentity: () => undefined };

  return new Pool({
    connectionString: url,
    ssl,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 5,
    keepAlive: true,
  });
}

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = createPool();
  }
  return _pool;
}

function getInstance(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof getInstance>, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_target, prop) {
    return (getInstance() as any)[prop];
  },
});

/**
 * Returns a function that executes raw SQL against a fresh pool client.
 * Kept for backward compatibility with call-sites that used the Neon
 * template-literal tag (`sql\`...\``).
 */
export function getRawSql() {
  const pool = getPool();
  return async (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    // Support both template-literal and plain-string invocations
    const query =
      typeof strings === "string"
        ? { text: strings, values: values as unknown[] }
        : {
            text: (strings as TemplateStringsArray).reduce(
              (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""),
              ""
            ),
            values,
          };
    const result = await pool.query(query.text, query.values);
    return result.rows;
  };
}

/**
 * Execute a query within a workspace-scoped context.
 * Sets `app.current_workspace_id` on the connection so any Postgres RLS
 * policies can filter rows automatically.
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (db: ReturnType<typeof getInstance>) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(
      `SET LOCAL app.current_workspace_id = '${workspaceId}'`
    );
    const scopedDb = drizzle(client, { schema });
    return await fn(scopedDb as unknown as ReturnType<typeof getInstance>);
  } finally {
    client.release();
  }
}

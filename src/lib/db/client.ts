import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Shared connection pool.
 * Uses node-postgres (pg) over TCP so it works with Railway's standard
 * Postgres (the old Neon HTTP driver only works with Neon's cloud proxy).
 *
 * SSL is disabled for Railway's private network (*.railway.internal) and
 * enabled (self-signed accepted) for all public URLs.
 */
function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  // DATABASE_URL contains ?sslmode=no-verify for Railway's self-signed cert Postgres.
  // Pass ssl with checkServerIdentity override to fully bypass cert validation.
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
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
    return await fn(scopedDb as ReturnType<typeof getInstance>);
  } finally {
    client.release();
  }
}

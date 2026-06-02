import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Lazy-initialized DB client.
 * Defers the DATABASE_URL check to first access so `next build`
 * can compile server components without the env var set.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const sql = neon(url);
  return { db: drizzle(sql, { schema }), sql };
}

let _instance: ReturnType<typeof createDb> | null = null;

function getInstance() {
  if (!_instance) {
    _instance = createDb();
  }
  return _instance;
}

export const db = new Proxy({} as ReturnType<typeof createDb>["db"], {
  get(_target, prop) {
    return (getInstance().db as any)[prop];
  },
});

export function getRawSql() {
  return getInstance().sql;
}

/**
 * Execute a query within a workspace-scoped RLS context.
 * Sets `app.current_workspace_id` on the connection so Postgres RLS
 * policies filter rows automatically.
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (db: typeof import("drizzle-orm/neon-http").NeonHttpDatabase) => Promise<T>
): Promise<T> {
  const { sql } = getInstance();
  await sql(`SET app.current_workspace_id = '${workspaceId}'`);
  try {
    return await fn(db as any);
  } finally {
    await sql(`RESET app.current_workspace_id`);
  }
}

import { Pool } from 'pg';

let pool: Pool | null = null;

/** Shared PostgreSQL connection pool for the scanner and reconciliation routes. */
export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  pool = new Pool({ connectionString, max: 10 });
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const activePool = pool;
  pool = null;
  await activePool.end();
}

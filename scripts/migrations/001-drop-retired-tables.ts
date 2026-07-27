import { Pool } from 'pg';

const LEGACY_TABLES = [
  'coa_pipeline',
  'coa_spend_rows',
  'coa_exclusions',
  'coa_reconciliation_results',
  'coa_runs',
  'exclusion_entries',
] as const;

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of LEGACY_TABLES) {
      await client.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await client.query('COMMIT');
    console.log(`Dropped legacy tables: ${LEGACY_TABLES.join(', ')}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import { Pool } from 'pg';

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_entity_embeddings (
        entity_type VARCHAR(30) NOT NULL,
        canonical_value TEXT NOT NULL,
        embedding DOUBLE PRECISION[] NOT NULL,
        embedding_model VARCHAR(100) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (entity_type, canonical_value)
      );
    `);
    console.log('Fallback PostgreSQL entity-embedding store is ready.');
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

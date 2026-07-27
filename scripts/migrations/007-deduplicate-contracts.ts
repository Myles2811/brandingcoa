import { Pool, PoolClient } from 'pg';
import { realAwardKey } from '../../src/lib/awardIdentity';

interface ContractRow {
  id: string; candidate_id: string; buyer_name: string; supplier_name: string;
  award_date: string; award_value: number | null; currency: string;
  contract_description: string; framework_hints: string; ocid: string | null;
  release_id: string | null; award_id: string | null; link: string;
}

function quality(row: ContractRow): number {
  return (row.candidate_id.startsWith('legacy:') ? 0 : 100) +
    (row.ocid ? 10 : 0) + (row.release_id ? 5 : 0) + (row.award_id ? 5 : 0);
}

async function replaceHistoricalReferences(client: PoolClient, removedId: string, keeperId: string): Promise<void> {
  const findings = await client.query<{ id: string; external_award_ids: string[] }>(
    'SELECT id, external_award_ids FROM reconciliation_findings WHERE external_award_ids ? $1', [removedId],
  );
  for (const finding of findings.rows) {
    const updated = [...new Set(finding.external_award_ids.map(id => id === removedId ? keeperId : id))];
    await client.query('UPDATE reconciliation_findings SET external_award_ids=$2::jsonb WHERE id=$1',
      [finding.id, JSON.stringify(updated)]);
  }
}

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS real_award_key TEXT');
    const result = await client.query<ContractRow>(`
      SELECT id,candidate_id,buyer_name,supplier_name,award_date,award_value,currency,
             contract_description,framework_hints,ocid,release_id,award_id,link FROM contracts ORDER BY id
    `);
    const groups = new Map<string, ContractRow[]>();
    for (const row of result.rows) {
      const key = realAwardKey({ ...row, framework_hints: JSON.parse(row.framework_hints || '[]') as string[] });
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    let removed = 0;
    for (const [key, rows] of groups) {
      rows.sort((left, right) => quality(right) - quality(left) || Number(right.id) - Number(left.id));
      const keeper = rows[0];
      await client.query('UPDATE contracts SET real_award_key=$2 WHERE id=$1', [keeper.id, key]);
      for (const duplicate of rows.slice(1)) {
        await replaceHistoricalReferences(client, duplicate.candidate_id, keeper.candidate_id);
        await client.query('DELETE FROM contracts WHERE id=$1', [duplicate.id]);
        removed++;
      }
    }
    await client.query('ALTER TABLE contracts ALTER COLUMN real_award_key SET NOT NULL');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS contracts_real_award_key_unique ON contracts(real_award_key)');
    await client.query('COMMIT');
    console.log(`Contracts deduplicated: removed=${removed}, remaining=${groups.size}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

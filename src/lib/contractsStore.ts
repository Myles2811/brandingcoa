import { getPool } from './db';
import { PSAwardResult } from './types';
import { realAwardKey } from './awardIdentity';

export interface StoredContract extends PSAwardResult {
  id: number;
  search_year: number;
  search_month: number;
  created_at: string;
}

function rowToContract(row: Record<string, unknown>): StoredContract {
  return {
    ...(row as unknown as StoredContract),
    framework_hints: JSON.parse((row.framework_hints as string) ?? '[]'),
    lot_ids: JSON.parse((row.lot_ids as string) ?? '[]'),
    contract_ids: JSON.parse((row.contract_ids as string) ?? '[]'),
    award_value: row.award_value != null ? (row.award_value as number) : null,
  };
}

export async function saveContracts(year: number, month: number, results: PSAwardResult[]): Promise<number> {
  const pool = getPool();
  let saved = 0;
  for (const result of results) {
    const values = [
      year, month, result.candidate_id, result.ocid, result.release_id, result.award_id,
      JSON.stringify(result.lot_ids), JSON.stringify(result.contract_ids), result.buyer_name ?? '',
      result.supplier_name ?? '', result.contract_description ?? '', result.award_date ?? '',
      result.publication_date ?? '', result.award_value ?? null, result.currency ?? 'GBP',
      result.evidence_excerpt ?? '', result.confidence ?? 'Medium', result.link,
      JSON.stringify(result.framework_hints ?? []), result.first_seen_timestamp ?? '', result.source ?? '', realAwardKey(result),
    ];
    const inserted = await pool.query(`
      INSERT INTO contracts
        (search_year, search_month, candidate_id, ocid, release_id, award_id, lot_ids, contract_ids,
         buyer_name, supplier_name, contract_description, award_date, publication_date, award_value,
         currency, evidence_excerpt, confidence, link, framework_hints, first_seen_timestamp, source, real_award_key)
      VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
      ON CONFLICT DO NOTHING
    `, values);
    if ((inserted.rowCount ?? 0) > 0) saved++;
  }
  return saved;
}

export async function getContractsByMonth(year: number, month: number): Promise<StoredContract[]> {
  const result = await getPool().query(
    'SELECT * FROM contracts WHERE search_year = $1 AND search_month = $2 ORDER BY created_at DESC',
    [year, month],
  );
  return result.rows.map(rowToContract);
}

export async function getAllContracts(): Promise<StoredContract[]> {
  const result = await getPool().query(
    'SELECT * FROM contracts ORDER BY search_year DESC, search_month DESC, created_at DESC',
  );
  return result.rows.map(rowToContract);
}

export async function getStoredCandidateIds(): Promise<Set<string>> {
  const result = await getPool().query<{ candidate_id: string }>(
    'SELECT candidate_id FROM contracts WHERE candidate_id IS NOT NULL',
  );
  return new Set(result.rows.map(row => row.candidate_id));
}

export async function getStoredRealAwardKeys(): Promise<Set<string>> {
  const result = await getPool().query<{ real_award_key: string }>(
    'SELECT real_award_key FROM contracts WHERE real_award_key IS NOT NULL',
  );
  return new Set(result.rows.map(row => row.real_award_key));
}

export async function getHistorySummary(): Promise<{ year: number; month: number; count: number }[]> {
  const result = await getPool().query<{ year: number; month: number; count: string }>(`
    SELECT search_year AS year, search_month AS month, COUNT(*) AS count
    FROM contracts
    GROUP BY search_year, search_month
    ORDER BY search_year DESC, search_month DESC
  `);
  return result.rows.map(row => ({ ...row, count: Number(row.count) }));
}

export async function deleteContract(id: number): Promise<void> {
  await getPool().query('DELETE FROM contracts WHERE id = $1', [id]);
}

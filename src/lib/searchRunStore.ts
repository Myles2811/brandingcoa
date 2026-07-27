import { getPool } from './db';
import { PSAwardsState } from './graph/state';
import { PS_AWARDS_MODEL } from './psAwardClassifier';

export async function saveSearchRun(state: PSAwardsState, qualifiedCount: number, excludedCount: number): Promise<string> {
  const runId = crypto.randomUUID();
  await getPool().query(`
    INSERT INTO ps_search_runs
      (run_id, search_year, search_month, complete, raw_count, candidate_count,
       qualified_count, excluded_count, input_tokens, output_tokens,
       cache_creation_input_tokens, cache_read_input_tokens, issues, source_statuses, model)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  `, [
    runId, state.year, state.month, state.complete, state.rawCount, state.candidates.length,
    qualifiedCount, excludedCount, state.usage.input, state.usage.output,
    state.usage.cache_creation_input, state.usage.cache_read_input,
    JSON.stringify(state.issues), JSON.stringify(state.sourceStatuses), PS_AWARDS_MODEL,
  ]);
  return runId;
}


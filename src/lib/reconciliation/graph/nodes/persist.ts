import { persistCrossCheckFinding } from '../../store';
import { ReconciliationGraphState } from '../state';
import { recordRunAudit } from '../audit';

export async function persistNode(state: ReconciliationGraphState): Promise<Partial<ReconciliationGraphState>> {
  await persistCrossCheckFinding(state);
  recordRunAudit({
    run_id: state.runId, award_id: state.award.id, node: 'persist', model: null, tool: null,
    attempt: 1, system_prompt: null, input: state.output, output: { persisted: true }, usage: null, error: null,
  });
  return {};
}

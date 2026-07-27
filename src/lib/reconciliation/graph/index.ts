import { END, START, StateGraph } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ReconciliationAnnotation, ReconciliationGraphState } from './state';
import { frameworkRateLookupNode } from './nodes/frameworkRateLookup';
import { buyerEvidenceNode } from './nodes/buyerEvidence';
import { supplierEvidenceNode } from './nodes/supplierEvidence';
import { evidenceJudgeNode } from './nodes/evidenceJudge';
import { confidenceAndFindingNode } from './nodes/confidenceAndFinding';
import { structuredOutputNode } from './nodes/structuredOutput';
import { persistNode } from './nodes/persist';

let compiled: ReturnType<typeof buildGraph> | null = null;
let saver: PostgresSaver | null = null;

function routeRate(state: ReconciliationGraphState): 'structured_output' | 'evidence_fanout' {
  return state.frameworkRate?.rate_status === 'PENDING_RATE' ? 'structured_output' : 'evidence_fanout';
}

function routeJudge(state: ReconciliationGraphState): 'buyer_evidence' | 'supplier_evidence' | 'confidence_and_finding' {
  const judge = state.judgeResult;
  if (!judge) throw new Error('judge result is missing');
  if (!judge.buyer_evidence_pass && state.buyerAttempts < 2) return 'buyer_evidence';
  if (!judge.supplier_evidence_pass && state.supplierAttempts < 2) return 'supplier_evidence';
  return 'confidence_and_finding';
}

async function evidenceFanoutNode(): Promise<Partial<ReconciliationGraphState>> { return {}; }

function buildGraph(checkpointer?: PostgresSaver) {
  return new StateGraph(ReconciliationAnnotation)
    .addNode('framework_rate_lookup', frameworkRateLookupNode)
    .addNode('evidence_fanout', evidenceFanoutNode)
    .addNode('buyer_evidence', buyerEvidenceNode)
    .addNode('supplier_evidence', supplierEvidenceNode)
    .addNode('evidence_judge', evidenceJudgeNode)
    .addNode('confidence_and_finding', confidenceAndFindingNode)
    .addNode('structured_output', structuredOutputNode)
    .addNode('persist', persistNode)
    .addEdge(START, 'framework_rate_lookup')
    .addConditionalEdges('framework_rate_lookup', routeRate)
    .addEdge('evidence_fanout', 'buyer_evidence')
    .addEdge('evidence_fanout', 'supplier_evidence')
    .addEdge('buyer_evidence', 'evidence_judge')
    .addEdge('supplier_evidence', 'evidence_judge')
    .addConditionalEdges('evidence_judge', routeJudge)
    .addEdge('confidence_and_finding', 'structured_output')
    .addEdge('structured_output', 'persist')
    .addEdge('persist', END)
    .compile({ checkpointer });
}

export async function getReconciliationGraph() {
  if (compiled) return compiled;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  saver = PostgresSaver.fromConnString(connectionString, { schema: 'public' });
  await saver.setup();
  compiled = buildGraph(saver);
  return compiled;
}

export type { ReconciliationGraphState } from './state';

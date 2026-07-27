import { StateGraph, START, END } from '@langchain/langgraph';
import { PSAwardsAnnotation } from './state';
import { fetchNotices } from './nodes/fetchNotices';
import { classifyAndFilter } from './nodes/classifyAndFilter';
import { persistResults } from './nodes/persistResults';

const graph = new StateGraph(PSAwardsAnnotation)
  .addNode('fetch_notices', fetchNotices)
  .addNode('classify_and_filter', classifyAndFilter)
  .addNode('persist_results', persistResults)
  .addEdge(START, 'fetch_notices')
  .addEdge('fetch_notices', 'classify_and_filter')
  .addEdge('classify_and_filter', 'persist_results')
  .addEdge('persist_results', END)
  .compile();

export { graph };
export type { PSAwardsState } from './state';

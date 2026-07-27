export interface ReconciliationModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface ReconciliationAuditEvent {
  run_id: string;
  award_id: string;
  node: string;
  model: string | null;
  tool: string | null;
  attempt: number;
  system_prompt: string | null;
  input: unknown;
  output: unknown;
  usage: ReconciliationModelUsage | null;
  error: string | null;
  timestamp: string;
}

const eventsByRun = new Map<string, ReconciliationAuditEvent[]>();

export function beginRunAudit(runId: string): void { eventsByRun.set(runId, []); }

export function recordRunAudit(event: Omit<ReconciliationAuditEvent, 'timestamp'>): void {
  const events = eventsByRun.get(event.run_id) ?? [];
  events.push({ ...event, timestamp: new Date().toISOString() });
  eventsByRun.set(event.run_id, events);
}

export function getRunAudit(runId: string): ReconciliationAuditEvent[] {
  return [...(eventsByRun.get(runId) ?? [])];
}

export function auditUsage(events: ReconciliationAuditEvent[]): ReconciliationModelUsage {
  return events.reduce((total, event) => ({
    input_tokens: total.input_tokens + (event.usage?.input_tokens ?? 0),
    output_tokens: total.output_tokens + (event.usage?.output_tokens ?? 0),
    cache_creation_input_tokens: total.cache_creation_input_tokens + (event.usage?.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens: total.cache_read_input_tokens + (event.usage?.cache_read_input_tokens ?? 0),
  }), { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
}

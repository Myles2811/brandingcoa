import AnalyticsScreen from '@/components/reconciliation/AnalyticsScreen';
import { previousCompleteMonth } from '@/lib/laravelApi';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({ searchParams }: {
  searchParams: Promise<{ run_id?: string | string[] }>;
}) {
  const runId = (await searchParams).run_id;

  return (
    <AnalyticsScreen
      initialMonth={previousCompleteMonth()}
      reportRunId={typeof runId === 'string' ? runId : undefined}
    />
  );
}

import DashboardShell from '@/components/reconciliation/DashboardShell';
import { demoDefaultMonth, demoInitialData } from '@/lib/demo/demoData';

// Static demo build: the dashboard is prerendered from the snapshot in
// src/lib/demo/snapshot.json, so there is no database call and no request-time work.
// ?run_id= deep links still work — DashboardShell resolves them client-side.
export const dynamic = 'force-static';

export default function Home() {
  return <DashboardShell initialData={demoInitialData()} initialMonth={demoDefaultMonth} />;
}

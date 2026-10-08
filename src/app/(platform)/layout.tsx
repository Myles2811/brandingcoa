import { Suspense } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import DashboardShell from '@/components/reconciliation/DashboardShell';
import { ReconciliationDataProvider } from '@/components/reconciliation/ReconciliationDataProvider';

export default function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGate>
      <Suspense fallback={<PlatformLoading />}>
        <ReconciliationDataProvider>
          <DashboardShell>{children}</DashboardShell>
        </ReconciliationDataProvider>
      </Suspense>
    </AuthGate>
  );
}

function PlatformLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F7FB] px-6 text-center text-[#101828]">
      <p className="text-sm font-semibold text-[#667085]">Loading Rebate Intelligence...</p>
    </main>
  );
}

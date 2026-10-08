'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { authenticatedFetch } from '@/lib/auth/authenticated-fetch';
import { DashboardData } from './types';

interface ReconciliationDataContextValue {
  dashboardData: DashboardData;
  isLoading: boolean;
  isRefreshing: boolean;
  loadDashboard: (runId?: string) => Promise<void>;
  refreshDashboard: () => void;
}

const emptyDashboard: DashboardData = { run: null, findings: [], error: null };
const ReconciliationDataContext = createContext<ReconciliationDataContextValue | null>(null);

export function ReconciliationDataProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedRunId = pathname === '/analytics' ? searchParams.get('run_id') ?? undefined : undefined;
  const [dashboardData, setDashboardData] = useState<DashboardData>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [isRefreshing, startRefresh] = useTransition();

  const loadDashboard = useCallback(async (runId?: string) => {
    setActiveRunId(runId);
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (runId) params.set('run_id', runId);
      const response = await authenticatedFetch(
        `/api/reconciliation/dashboard${params.size ? `?${params.toString()}` : ''}`,
        { cache: 'no-store' },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setDashboardData(data as DashboardData);
    } catch (error) {
      setDashboardData({
        run: null,
        findings: [],
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(requestedRunId);
  }, [loadDashboard, requestedRunId]);

  const refreshDashboard = useCallback(() => {
    startRefresh(async () => {
      await loadDashboard(activeRunId);
    });
  }, [activeRunId, loadDashboard]);

  const value = useMemo(() => ({
    dashboardData,
    isLoading,
    isRefreshing,
    loadDashboard,
    refreshDashboard,
  }), [dashboardData, isLoading, isRefreshing, loadDashboard, refreshDashboard]);

  return <ReconciliationDataContext.Provider value={value}>{children}</ReconciliationDataContext.Provider>;
}

export function useReconciliationData() {
  const context = useContext(ReconciliationDataContext);
  if (!context) throw new Error('useReconciliationData must be used within ReconciliationDataProvider.');
  return context;
}

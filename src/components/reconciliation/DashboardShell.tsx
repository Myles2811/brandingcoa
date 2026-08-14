'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useAuth } from '@/components/auth/client-auth-provider';
import { authenticatedFetch } from '@/lib/auth/authenticated-fetch';
import CaseDrawer from './CaseDrawer';
import KpiRow from './KpiRow';
import MonthlyExposureCard from './MonthlyExposureCard';
import PipelineTab, { defaultPipelineFilters, PipelineFilters } from './PipelineTab';
import ReportsTab, { AnalyticsDrillDown } from './ReportsTab';
import SettingsTab from './SettingsTab';
import { dueNowRebate, isActionableOpportunity, issueForFinding, type OpportunityIssue } from './opportunityModel';
import { DashboardData, ReconciliationFindingRecord } from './types';

type View = 'analytics' | 'opportunities' | 'settings';

const mainViews: { id: Exclude<View, 'settings'>; label: string; description: string }[] = [
  { id: 'analytics', label: 'Analytics', description: 'Exposure, trends and prioritisation' },
  { id: 'opportunities', label: 'Opportunities', description: 'Evidence queue and follow-up' },
];

const views: { id: View; label: string }[] = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'settings', label: 'Settings' },
];

const settingsView = { id: 'settings' as const, label: 'Settings', description: 'Users and access control' };

function compactMoney(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function stableDateTimeLabel(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

function dashboardMonthOptions(anchor: { year: number; month: number }) {
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(Date.UTC(anchor.year, anchor.month - 1 - index, 1));
    return {
      value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
    };
  });
}

export default function DashboardShell({ initialData, initialMonth, reportRunId }: {
  initialData: DashboardData;
  initialMonth: { year: number; month: number };
  reportRunId?: string;
}) {
  const [activeView, setActiveView] = useState<View>('analytics');
  const [opportunitiesData, setOpportunitiesData] = useState<DashboardData>(initialData);
  const [dashboardData, setDashboardData] = useState<DashboardData>(initialData);
  const [selectedCase, setSelectedCase] = useState<ReconciliationFindingRecord | null>(null);
  const [pipelineFilters, setPipelineFilters] = useState<PipelineFilters>(defaultPipelineFilters);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const { logout, user } = useAuth();
  const availableMonths = useMemo(() => dashboardMonthOptions(initialMonth), [initialMonth]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const configuredRunId = reportRunId;
      const params = new URLSearchParams();
      if (configuredRunId) params.set('run_id', configuredRunId);
      const response = await authenticatedFetch(`/api/reconciliation/dashboard${params.size ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setDashboardData(data as DashboardData);
    } catch (error) {
      const fallback = { run: null, findings: [], error: error instanceof Error ? error.message : String(error) };
      setDashboardData(fallback);
    } finally {
      setDashboardLoading(false);
    }
  }, [reportRunId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const refresh = () => startRefresh(() => {
    void loadDashboard();
  });
  const loadOpportunitiesMonth = async (monthValue: string) => {
    if (monthValue === 'all') {
      setOpportunitiesLoading(false);
      setOpportunitiesData(dashboardData);
      return;
    }
    const [year, month] = monthValue.split('-').map(Number);
    if (!year || !month) return;
    setOpportunitiesLoading(true);
    try {
      const response = await authenticatedFetch(`/api/reconciliation/dashboard?year=${year}&month=${month}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setOpportunitiesData(data as DashboardData);
    } catch (error) {
      setOpportunitiesData({ run: null, findings: [], error: error instanceof Error ? error.message : String(error) });
    } finally {
      setOpportunitiesLoading(false);
    }
  };
  const updatePipelineFilters = (nextFilters: PipelineFilters) => {
    const monthChanged = nextFilters.month !== pipelineFilters.month;
    setPipelineFilters(nextFilters);
    if (monthChanged) void loadOpportunitiesMonth(nextFilters.month);
  };
  const displayedOpportunitiesData = pipelineFilters.month === 'all' ? dashboardData : opportunitiesData;
  const drillIntoOpportunities = (drillDown: AnalyticsDrillDown) => {
    setPipelineFilters({
      ...defaultPipelineFilters,
      query: drillDown.query ?? defaultPipelineFilters.query,
      buyer: drillDown.buyer ?? defaultPipelineFilters.buyer,
      supplier: drillDown.supplier ?? defaultPipelineFilters.supplier,
      framework: drillDown.framework ?? defaultPipelineFilters.framework,
      issue: (drillDown.issue as OpportunityIssue | undefined) ?? defaultPipelineFilters.issue,
      status: drillDown.status ?? defaultPipelineFilters.status,
      dateFrom: drillDown.dateFrom ?? defaultPipelineFilters.dateFrom,
      dateTo: drillDown.dateTo ?? defaultPipelineFilters.dateTo,
    });
    setActiveView('opportunities');
  };
  const pulse = useMemo(() => {
    const actionable = dashboardData.findings.filter(isActionableOpportunity);
    const dueNow = actionable.reduce((sum, finding) => sum + dueNowRebate(finding), 0);
    const supplier = actionable.filter(finding => issueForFinding(finding) === 'supplier_side_issue').length;
    const buyer = actionable.filter(finding => issueForFinding(finding) === 'buyer_side_issue').length;
    const both = actionable.filter(finding => issueForFinding(finding) === 'both_sides_missing').length;
    return { actionable: actionable.length, dueNow, supplier, buyer, both };
  }, [dashboardData.findings]);

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#101828]">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-[#D9E2EF] bg-white/94 py-5 shadow-[12px_0_34px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all duration-200 lg:block ${sidebarCollapsed ? 'w-20 px-3' : 'w-72 px-4'}`}>
        <div className={`flex items-center gap-3 px-2 ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0B1F4D] text-sm font-bold text-white shadow-[0_10px_24px_rgba(11,31,77,0.22)]">R</div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">Rebate Intelligence</h1>
              <p className="text-xs text-[#667085]">Award-to-rebate control</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSidebarCollapsed(value => !value)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`absolute top-5 flex h-8 w-8 items-center justify-center rounded-md border border-[#D0D5DD] bg-white text-xs font-semibold text-[#667085] shadow-sm transition hover:bg-[#F8FAFC] ${sidebarCollapsed ? 'right-[-16px]' : 'right-4'}`}
        >
          {sidebarCollapsed ? '>' : '<'}
        </button>

        <nav className="mt-8 space-y-2" aria-label="Primary">
          {mainViews.map(view => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              title={sidebarCollapsed ? view.label : undefined}
              className={`w-full rounded-xl border text-left transition ${
                activeView === view.id
                  ? 'border-[#B8C7FF] bg-[#EEF3FF] text-[#0B1F4D] shadow-[0_10px_26px_rgba(42,100,255,0.10)]'
                  : 'border-transparent text-[#475467] hover:border-[#E1E7F0] hover:bg-[#F7F9FC]'
              } ${sidebarCollapsed ? 'flex h-11 items-center justify-center px-0 py-0 text-center' : 'px-3 py-3'}`}
            >
              {sidebarCollapsed ? (
                <span className="text-sm font-semibold">{view.label.slice(0, 1)}</span>
              ) : (
                <>
                  <span className="block text-sm font-semibold">{view.label}</span>
                  <span className="mt-0.5 block text-xs text-[#667085]">{view.description}</span>
                </>
              )}
            </button>
          ))}
        </nav>

        {sidebarCollapsed ? (
          <div className="mt-8 rounded-xl border border-[#E1E7F0] bg-[#F8FAFD] p-2 text-center" title={`${pulse.actionable} actionable opportunities`}>
            <p className="text-xs font-semibold uppercase text-[#667085]">Live</p>
            <p className="mt-1 text-sm font-semibold text-[#101828]">{pulse.actionable}</p>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-[#E1E7F0] bg-[#F8FAFD] p-3">
            <p className="text-xs font-semibold uppercase text-[#667085]">Current exposure</p>
            <p className="mt-2 text-lg font-semibold text-[#101828]">{compactMoney(pulse.dueNow)}</p>
            <p className="mt-1 text-xs text-[#667085]">{pulse.actionable} actionable opportunities</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-[#667085]">
              <div className="rounded-md bg-white p-2"><span className="block font-semibold text-[#101828]">{pulse.buyer}</span>Buyer</div>
              <div className="rounded-md bg-white p-2"><span className="block font-semibold text-[#101828]">{pulse.supplier}</span>Supplier</div>
              <div className="rounded-md bg-white p-2"><span className="block font-semibold text-[#101828]">{pulse.both}</span>Both</div>
            </div>
          </div>
        )}

        <div className={`absolute bottom-5 space-y-2 ${sidebarCollapsed ? 'inset-x-3' : 'inset-x-4'}`}>
          {!sidebarCollapsed && (
            <div className="rounded-xl border border-[#E1E7F0] bg-white p-3">
              <div className="flex items-center gap-2 text-xs text-[#667085]">
                <span className={`h-2 w-2 rounded-full ${initialData.error ? 'bg-red-500' : 'bg-emerald-500'}`} />
                {dashboardData.run ? `Run ${dashboardData.run.id.slice(0, 8)}` : 'Data unavailable'}
              </div>
              {dashboardData.run && <p className="mt-2 text-xs text-[#98A2B3]">Completed {stableDateTimeLabel(dashboardData.run.completed_at ?? dashboardData.run.created_at)}</p>}
            </div>
          )}
          <button
            type="button"
            onClick={() => setActiveView('settings')}
            title={sidebarCollapsed ? settingsView.label : undefined}
            className={`w-full rounded-xl border text-left transition ${
              activeView === 'settings'
                ? 'border-[#B8C7FF] bg-[#EEF3FF] text-[#0B1F4D] shadow-[0_10px_26px_rgba(42,100,255,0.10)]'
                : 'border-[#E1E7F0] bg-white text-[#475467] hover:border-[#B8C7FF] hover:bg-[#F7F9FC]'
            } ${sidebarCollapsed ? 'flex h-11 items-center justify-center px-0 py-0 text-center' : 'px-3 py-3'}`}
          >
            {sidebarCollapsed ? (
              <span className="text-sm font-semibold">S</span>
            ) : (
              <>
                <span className="block text-sm font-semibold">{settingsView.label}</span>
                <span className="mt-0.5 block text-xs text-[#667085]">{settingsView.description}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-[#D9E2EF] bg-white/88 px-4 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B1F4D] text-xs font-bold text-white">R</div>
            <div>
              <h1 className="text-sm font-semibold">Rebate Intelligence</h1>
              <p className="text-xs text-[#667085]">Award-to-rebate control</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={isRefreshing} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] disabled:opacity-50">
              {isRefreshing ? 'Refreshing' : 'Refresh'}
            </button>
            <button onClick={() => void logout()} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054]">
              Logout
            </button>
          </div>
        </div>
        <div className="flex gap-2 pb-3">
          {views.map(view => <button key={view.id} onClick={() => setActiveView(view.id)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeView === view.id ? 'bg-[#0B1F4D] text-white' : 'bg-[#EEF2F7] text-[#475467]'}`}>{view.label}</button>)}
        </div>
      </header>

      <main className={`w-full max-w-none space-y-4 px-4 py-4 transition-all duration-200 sm:px-6 lg:px-6 lg:py-5 2xl:px-10 ${sidebarCollapsed ? 'lg:ml-20 lg:w-[calc(100%-5rem)]' : 'lg:ml-72 lg:w-[calc(100%-18rem)]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[#2A64FF]">Rebate recovery cockpit</p>
            <h2 className="mt-1 text-lg font-semibold text-[#101828]">{views.find(view => view.id === activeView)?.label}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#667085]">
              {activeView === 'analytics'
                ? 'Prioritise missing rebate exposure by issue, framework, supplier and buyer.'
                : activeView === 'opportunities'
                  ? 'Review surfaced awards, confirm evidence and record the follow-up outcome.'
                  : 'Manage user invitations, roles and platform access.'}
            </p>
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            {user && (
              <div className="rounded-xl border border-[#E1E7F0] bg-white px-3 py-2 text-right shadow-sm">
                <p className="text-xs font-semibold text-[#101828]">{user.name}</p>
                <p className="text-[11px] text-[#667085]">{user.role}</p>
              </div>
            )}
            <button onClick={refresh} disabled={isRefreshing} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-semibold text-[#344054] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50">
              {isRefreshing ? 'Refreshing' : 'Refresh data'}
            </button>
            <button onClick={() => void logout()} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-semibold text-[#344054] shadow-sm transition hover:bg-[#F8FAFC]">
              Logout
            </button>
          </div>
        </div>

        {activeView === 'analytics' && (
          <>
            <KpiRow findings={dashboardData.findings} loading={isRefreshing || dashboardLoading} error={dashboardData.error} />
            <MonthlyExposureCard initialMonth={initialMonth} />
            <ReportsTab findings={dashboardData.findings} loading={isRefreshing || dashboardLoading} error={dashboardData.error} reportRunId={reportRunId} onDrillDown={drillIntoOpportunities} />
          </>
        )}

        {activeView === 'opportunities' && (
          <>
            <KpiRow findings={displayedOpportunitiesData.findings} loading={isRefreshing || opportunitiesLoading} error={displayedOpportunitiesData.error} />
            <PipelineTab
              findings={displayedOpportunitiesData.findings}
              loading={isRefreshing || opportunitiesLoading}
              error={displayedOpportunitiesData.error}
              onOpenCase={setSelectedCase}
              filters={pipelineFilters}
              onFiltersChange={updatePipelineFilters}
              monthOptions={availableMonths}
            />
          </>
        )}

        {activeView === 'settings' && <SettingsTab />}
      </main>
      {selectedCase && <CaseDrawer finding={selectedCase} onClose={() => setSelectedCase(null)} />}
    </div>
  );
}

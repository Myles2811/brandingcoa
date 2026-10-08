'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/client-auth-provider';
import { dueNowRebate, isActionableOpportunity, issueForFinding } from './opportunityModel';
import { useReconciliationData } from './ReconciliationDataProvider';

interface NavigationItem {
  href: string;
  label: string;
  description: string;
}

const mainNavigation: NavigationItem[] = [
  { href: '/analytics', label: 'Analytics', description: 'Exposure, trends and prioritisation' },
  { href: '/opportunities', label: 'Opportunities', description: 'Evidence queue and follow-up' },
];

const settingsNavigation: NavigationItem = {
  href: '/settings',
  label: 'Settings',
  description: 'Users and access control',
};

const allNavigation = [...mainNavigation, settingsNavigation];

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

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { logout, user } = useAuth();
  const { dashboardData, isRefreshing, refreshDashboard } = useReconciliationData();
  const currentView = allNavigation.find(item => isActivePath(pathname, item.href)) ?? mainNavigation[0];
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
          {mainNavigation.map(item => (
            <NavigationLink key={item.href} item={item} active={isActivePath(pathname, item.href)} collapsed={sidebarCollapsed} />
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
                <span className={`h-2 w-2 rounded-full ${dashboardData.error ? 'bg-red-500' : 'bg-emerald-500'}`} />
                {dashboardData.run ? `Run ${dashboardData.run.id.slice(0, 8)}` : 'Data unavailable'}
              </div>
              {dashboardData.run && <p className="mt-2 text-xs text-[#98A2B3]">Completed {stableDateTimeLabel(dashboardData.run.completed_at ?? dashboardData.run.created_at)}</p>}
            </div>
          )}
          <NavigationLink item={settingsNavigation} active={isActivePath(pathname, settingsNavigation.href)} collapsed={sidebarCollapsed} bordered />
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-[#D9E2EF] bg-white/88 px-4 backdrop-blur-xl lg:hidden">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B1F4D] text-xs font-bold text-white">R</div>
            <div>
              <h1 className="text-sm font-semibold">Rebate Intelligence</h1>
              <p className="text-xs text-[#667085]">Award-to-rebate control</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshDashboard} disabled={isRefreshing} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] disabled:opacity-50">
              {isRefreshing ? 'Refreshing' : 'Refresh'}
            </button>
            <button onClick={() => void logout()} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054]">
              Logout
            </button>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-3" aria-label="Mobile primary">
          {allNavigation.map(item => (
            <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${isActivePath(pathname, item.href) ? 'bg-[#0B1F4D] text-white' : 'bg-[#EEF2F7] text-[#475467]'}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className={`w-full max-w-none space-y-4 px-4 py-4 transition-all duration-200 sm:px-6 lg:px-6 lg:py-5 2xl:px-10 ${sidebarCollapsed ? 'lg:ml-20 lg:w-[calc(100%-5rem)]' : 'lg:ml-72 lg:w-[calc(100%-18rem)]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[#2A64FF]">Rebate recovery cockpit</p>
            <h2 className="mt-1 text-lg font-semibold text-[#101828]">{currentView.label}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#667085]">{currentView.description}</p>
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            {user && (
              <div className="rounded-xl border border-[#E1E7F0] bg-white px-3 py-2 text-right shadow-sm">
                <p className="text-xs font-semibold text-[#101828]">{user.name}</p>
                <p className="text-[11px] text-[#667085]">{user.role}</p>
              </div>
            )}
            <button onClick={refreshDashboard} disabled={isRefreshing} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-semibold text-[#344054] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50">
              {isRefreshing ? 'Refreshing' : 'Refresh data'}
            </button>
            <button onClick={() => void logout()} className="rounded-md border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-semibold text-[#344054] shadow-sm transition hover:bg-[#F8FAFC]">
              Logout
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function NavigationLink({ item, active, collapsed, bordered = false }: {
  item: NavigationItem;
  active: boolean;
  collapsed: boolean;
  bordered?: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`block w-full rounded-xl border text-left transition ${
        active
          ? 'border-[#B8C7FF] bg-[#EEF3FF] text-[#0B1F4D] shadow-[0_10px_26px_rgba(42,100,255,0.10)]'
          : `${bordered ? 'border-[#E1E7F0] bg-white' : 'border-transparent'} text-[#475467] hover:border-[#B8C7FF] hover:bg-[#F7F9FC]`
      } ${collapsed ? 'flex h-11 items-center justify-center p-0 text-center' : 'px-3 py-3'}`}
    >
      {collapsed ? (
        <span className="text-sm font-semibold">{item.label.slice(0, 1)}</span>
      ) : (
        <>
          <span className="block text-sm font-semibold">{item.label}</span>
          <span className="mt-0.5 block text-xs text-[#667085]">{item.description}</span>
        </>
      )}
    </Link>
  );
}

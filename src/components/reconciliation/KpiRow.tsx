import { confirmedFrameworkFindings, money } from './format';
import { dueNowRebate, isActionableOpportunity, issueForFinding, lifetimeRebate, reviewStatusLabels, reviewStatusVisuals } from './opportunityModel';
import { OpportunityReviewStatus, ReconciliationFindingRecord } from './types';

const reviewStatusOrder: OpportunityReviewStatus[] = ['new', 'acknowledged', 'in_review', 'outreach_sent', 'resolved', 'not_relevant'];

export default function KpiRow({ findings, loading, error }: { findings: ReconciliationFindingRecord[]; loading: boolean; error: string | null }) {
  const confirmedFindings = confirmedFrameworkFindings(findings);
  const dueNow = confirmedFindings.reduce((sum, finding) => sum + dueNowRebate(finding), 0);
  const lifetime = confirmedFindings.reduce((sum, finding) => sum + lifetimeRebate(finding), 0);
  const actionable = confirmedFindings.filter(isActionableOpportunity);
  const onTrackValue = confirmedFindings
    .filter(finding => issueForFinding(finding) === 'on_track')
    .reduce((sum, finding) => sum + (finding.award_contract_value ?? 0), 0);
  const unconfirmed = findings.length - confirmedFindings.length;
  const statusExposure = reviewStatusOrder.map(status => ({
    status,
    label: reviewStatusLabels[status],
    value: confirmedFindings
      .filter(finding => (finding.opportunity_review?.status ?? 'new') === status)
      .reduce((sum, finding) => sum + dueNowRebate(finding), 0),
    count: confirmedFindings.filter(finding => (finding.opportunity_review?.status ?? 'new') === status).length,
  }));
  const exposureTotal = statusExposure.reduce((sum, row) => sum + row.value, 0);
  const cards = [
    { label: 'Missing rebate due now', value: money(dueNow), hint: 'Confirmed framework opportunities requiring action' },
    { label: 'Estimated total rebate', value: money(lifetime), hint: 'Lifetime estimate across confirmed findings' },
    { label: 'Open opportunities', value: String(actionable.length), hint: 'Buyer, supplier or combined follow-up needed' },
    { label: 'On-track award value', value: money(onTrackValue), hint: `${confirmedFindings.length} confirmed · ${unconfirmed} framework review` },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {cards.map(card => (
          <div key={card.label} className="min-h-24 rounded-xl border border-[#E1E7F0] bg-white p-3.5 text-[#101828] shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase text-[#667085]">{card.label}</p>
            <p className={`mt-2 text-base font-semibold ${loading ? 'text-[#98A2B3]' : error ? 'text-red-700' : 'text-[#101828]'}`}>{loading ? '...' : error ? '-' : card.value}</p>
            <p className="mt-1 text-xs text-[#667085]">{error ? 'Data unavailable' : card.hint}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[#E1E7F0] bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[#667085]">Workflow exposure</p>
            <p className="mt-1 text-xs text-[#667085]">Due-now rebate by current review status</p>
          </div>
          <p className="text-sm font-semibold text-[#101828]">{money(exposureTotal)}</p>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[#E6ECF5]">
          {statusExposure.map(row => (
            <div key={row.status} className={reviewStatusVisuals[row.status].barClass} style={{ width: `${exposureTotal > 0 ? (row.value / exposureTotal) * 100 : 0}%` }} title={`${row.label}: ${money(row.value)}`} />
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {statusExposure.map(row => (
            <div key={row.status} className="rounded-lg bg-[#F8FAFD] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${reviewStatusVisuals[row.status].dotClass}`} />
                <p className="truncate text-xs font-semibold text-[#475467]">{row.label}</p>
              </div>
              <p className="mt-1 text-xs font-semibold text-[#101828]">{money(row.value)}</p>
              <p className="text-xs text-[#667085]">{row.count} items</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

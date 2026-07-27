'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { updateOpportunityReviewAction } from '@/app/actions/operations';
import {
  AwardMatchConfidenceBadge,
  EvidenceChip,
  FindingConfidenceBadge,
  FrameworkRegisterBadge,
  OpportunityIssueBadge,
  ReviewStatusBadge,
} from './Badges';
import {
  awardEvidenceExcerpt,
  dateLabel,
  frameworkDisplay,
  frameworkRegisterStatus,
  money,
  organisationName,
  primaryAward,
  supplierName,
} from './format';
import {
  dueNowRebate,
  issueForFinding,
  lifetimeRebate,
  opportunityKey,
  recommendedAction,
  reviewStatusLabels,
  reviewStatusVisuals,
} from './opportunityModel';
import { BuyerEvidence, OpportunityReviewStatus, ReconciliationFindingRecord, SupplierEvidence } from './types';

const statusOrder: OpportunityReviewStatus[] = ['new', 'acknowledged', 'in_review', 'outreach_sent', 'resolved', 'not_relevant'];

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase text-[#667085]">{label}</dt><dd className="mt-1 text-sm text-[#101828]">{value || '-'}</dd></div>;
}

function cleanNarrative(value: string | null | undefined): string {
  return (value ?? '')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bCOA\b/g, 'COA')
    .replace(/\bCAA\b/g, 'CAA')
    .trim();
}

function narrativeParts(value: string | null | undefined): string[] {
  const cleaned = cleanNarrative(value);
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(part => part.trim())
    .filter(Boolean);
}

function NarrativeText({ value }: { value: string | null | undefined }) {
  const parts = narrativeParts(value);
  if (parts.length === 0) return <p className="text-sm text-[#667085]">No narrative evidence was provided.</p>;
  if (parts.length === 1) return <p className="text-sm leading-relaxed text-[#475467]">{parts[0]}</p>;
  return (
    <div className="space-y-2">
      {parts.map((part, index) => (
        <p key={`${part}-${index}`} className="text-sm leading-relaxed text-[#475467]">{part}</p>
      ))}
    </div>
  );
}

function verdictLabel(value: string | null | undefined): string {
  if (!value) return 'Not reached';
  const labels: Record<string, string> = {
    COA_CONFIRMED: 'COA confirmed',
    CAA_ONLY: 'CAA only - COA not confirmed',
    NO_RECORD: 'No buyer record found',
    ON_SCHEDULE: 'Supplier reporting on schedule',
    OFF_CYCLE: 'Supplier reporting off cycle',
    MISSING_FOR_DUE_PERIOD: 'Supplier spend missing for due period',
    NO_CYCLE_DEFINED: 'Supplier reporting cycle not defined',
  };
  return labels[value] ?? value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
}

function evidenceValue(value: string | null | undefined): string {
  if (!value) return 'Not shown';
  const normalised = value.trim().toLowerCase();
  if (['yes', 'y', 'true', 'confirmed', 'present'].includes(normalised)) return 'Present';
  if (['no', 'n', 'false', 'missing', 'not present'].includes(normalised)) return 'Not present';
  return value;
}

function yesNo(value: boolean | null | undefined): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Not confirmed';
}

function buyerCaaPresent(evidence: BuyerEvidence | null): boolean | null {
  if (!evidence) return null;
  if (evidence.verdict === 'NO_RECORD') return false;
  if (evidence.verdict === 'CAA_ONLY' || evidence.verdict === 'COA_CONFIRMED') return true;
  const value = evidenceValue(evidence.caa_value);
  if (value === 'Present') return true;
  if (value === 'Not present') return false;
  return null;
}

function buyerCoaPresent(evidence: BuyerEvidence | null): boolean | null {
  if (!evidence) return null;
  if (evidence.verdict === 'COA_CONFIRMED') return true;
  if (evidence.verdict === 'CAA_ONLY' || evidence.verdict === 'NO_RECORD') return false;
  const value = evidenceValue(evidence.coa_value);
  if (value === 'Present') return true;
  if (value === 'Not present') return false;
  return null;
}

function supplierSpendReported(evidence: SupplierEvidence | null): boolean | null {
  if (!evidence) return null;
  return evidence.verdict === 'ON_SCHEDULE' || evidence.verdict === 'OFF_CYCLE';
}

function supplierOnSchedule(evidence: SupplierEvidence | null): boolean | null {
  if (!evidence) return null;
  if (evidence.verdict === 'ON_SCHEDULE') return true;
  if (evidence.verdict === 'OFF_CYCLE' || evidence.verdict === 'MISSING_FOR_DUE_PERIOD' || evidence.verdict === 'NO_CYCLE_DEFINED') return false;
  return null;
}

function CheckItem({ label, value, reference, tone }: {
  label: string;
  value: string;
  reference?: string | null;
  tone?: 'good' | 'warning' | 'neutral';
}) {
  const style = tone === 'good'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <div className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-3">
      <p className="text-xs font-semibold uppercase text-[#667085]">{label}</p>
      <span className={`mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${style}`}>{value}</span>
      {reference && <p className="mt-2 break-words font-mono text-xs text-[#98A2B3]">{reference}</p>}
    </div>
  );
}

function EvidenceChecksSummary({ finding }: { finding: ReconciliationFindingRecord }) {
  const buyerCaa = buyerCaaPresent(finding.buyer_evidence);
  const buyerCoa = buyerCoaPresent(finding.buyer_evidence);
  const spendReported = supplierSpendReported(finding.supplier_evidence);
  const onSchedule = supplierOnSchedule(finding.supplier_evidence);
  const dueNow = dueNowRebate(finding) > 0;
  const conflict = finding.judge_result?.cross_evidence_conflict ?? null;

  return (
    <EvidencePanel title="Evidence checks summary">
      <div className="grid gap-2 sm:grid-cols-2">
        <CheckItem
          label="Buyer CAA evidence"
          value={yesNo(buyerCaa)}
          reference={finding.buyer_evidence?.matched_row_reference}
          tone={buyerCaa ? 'good' : buyerCaa === false ? 'warning' : 'neutral'}
        />
        <CheckItem
          label="Buyer COA evidence"
          value={yesNo(buyerCoa)}
          reference={finding.buyer_evidence?.matched_row_reference}
          tone={buyerCoa ? 'good' : buyerCoa === false ? 'warning' : 'neutral'}
        />
        <CheckItem
          label="Supplier spend reported"
          value={yesNo(spendReported)}
          reference={finding.supplier_evidence?.matched_supplier_row}
          tone={spendReported ? 'good' : spendReported === false ? 'warning' : 'neutral'}
        />
        <CheckItem
          label="Reporting on schedule"
          value={yesNo(onSchedule)}
          reference={finding.supplier_evidence?.framework_due_months ? `Cycle: ${finding.supplier_evidence.framework_due_months}` : null}
          tone={onSchedule ? 'good' : onSchedule === false ? 'warning' : 'neutral'}
        />
        <CheckItem
          label="Due now"
          value={dueNow ? 'Yes' : 'No'}
          reference={finding.due_date ? `Due date: ${dateLabel(finding.due_date)}` : null}
          tone={dueNow ? 'warning' : 'good'}
        />
        <CheckItem
          label="Cross-check result"
          value={conflict === true ? 'Conflict found' : conflict === false ? 'No conflict found' : 'Not confirmed'}
          reference={finding.judge_result?.cross_evidence_conflict_note ? cleanNarrative(finding.judge_result.cross_evidence_conflict_note) : null}
          tone={conflict === true ? 'warning' : conflict === false ? 'good' : 'neutral'}
        />
      </div>
    </EvidencePanel>
  );
}

function EvidencePanel({ title, children, chip }: { title: string; children: React.ReactNode; chip?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-[#475467]">{title}</h3>
        {chip}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BuyerEvidencePanel({ evidence }: { evidence: BuyerEvidence | null }) {
  return <EvidencePanel title="Internal buyer evidence" chip={<EvidenceChip kind="Buyer" verdict={evidence?.verdict ?? null} />}>
    {evidence ? <div className="space-y-3">
      <div className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-3">
        <p className="text-xs font-semibold uppercase text-[#667085]">Buyer record status</p>
        <p className="mt-1 text-sm font-semibold text-[#101828]">{verdictLabel(evidence.verdict)}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#667085]">
          CAA: {evidenceValue(evidence.caa_value)} · COA: {evidenceValue(evidence.coa_value)}
        </p>
      </div>
      <NarrativeText value={evidence.evidence_excerpt} />
      <dl className="grid grid-cols-2 gap-3"><Detail label="Workbook tab" value={evidence.matched_tab} /><Detail label="Matched row" value={evidence.matched_row_reference} /><Detail label="COA evidence" value={evidenceValue(evidence.coa_value)} /><Detail label="CAA evidence" value={evidenceValue(evidence.caa_value)} /><Detail label="Award date" value={dateLabel(evidence.award_date)} /><Detail label="Expiry date" value={dateLabel(evidence.expiry_date)} /></dl>
      {evidence.ambiguity_note && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><strong>Ambiguity:</strong> {cleanNarrative(evidence.ambiguity_note)}</div>}
    </div> : <p className="text-sm text-[#667085]">No buyer evidence was produced for this finding.</p>}
  </EvidencePanel>;
}

function SupplierEvidencePanel({ evidence }: { evidence: SupplierEvidence | null }) {
  return <EvidencePanel title="Internal supplier evidence" chip={<EvidenceChip kind="Supplier" verdict={evidence?.verdict ?? null} />}>
    {evidence ? <div className="space-y-3">
      <div className="rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-3">
        <p className="text-xs font-semibold uppercase text-[#667085]">Supplier reporting status</p>
        <p className="mt-1 text-sm font-semibold text-[#101828]">{verdictLabel(evidence.verdict)}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#667085]">
          Last period: {evidence.last_spend_entry_month ?? 'None found'} · Cycle: {evidence.framework_due_months ?? 'Not defined'}
        </p>
      </div>
      <NarrativeText value={evidence.evidence_excerpt} />
      <dl className="grid grid-cols-2 gap-3"><Detail label="Workbook tab" value={evidence.matched_tab} /><Detail label="Matched row" value={evidence.matched_supplier_row} /><Detail label="Last period" value={evidence.last_spend_entry_month} /><Detail label="Last spend" value={money(evidence.last_spend_amount)} /><Detail label="Reporting cycle" value={evidence.framework_due_months} /></dl>
    </div> : <p className="text-sm text-[#667085]">No supplier evidence was produced for this finding.</p>}
  </EvidencePanel>;
}

export default function CaseDrawer({ finding, onClose }: { finding: ReconciliationFindingRecord; onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<OpportunityReviewStatus>(finding.opportunity_review?.status ?? 'new');
  const [note, setNote] = useState('');
  const [dueNow, setDueNow] = useState(String(dueNowRebate(finding)));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const parsedDueNow = useMemo(() => {
    const value = Number(dueNow);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }, [dueNow]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const award = primaryAward(finding);
  const framework = frameworkDisplay(finding);
  const registerStatus = frameworkRegisterStatus(finding);
  const issue = issueForFinding(finding);
  const awardEvidence = awardEvidenceExcerpt(finding);
  const key = opportunityKey(finding);
  const notes = finding.opportunity_review?.notes ?? [];
  if (typeof document === 'undefined') return null;

  const save = (nextStatus = status) => {
    setSaveError(null);
    startSaving(async () => {
      const result = await updateOpportunityReviewAction({
        opportunityKey: key,
        status: nextStatus,
        note,
        dueNowRebate: parsedDueNow,
        updatedBy: 'dashboard',
      });
      if (!result.ok) {
        setSaveError(result.errors.join(' '));
        return;
      }
      setStatus(nextStatus);
      setNote('');
      router.refresh();
    });
  };

  return createPortal(
    <div className="drawer-overlay fixed inset-0 z-50 bg-[#020612]/62 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="drawer-panel absolute inset-y-0 right-0 w-full max-w-[760px] overflow-y-auto border-l border-[#D9E2EF] bg-[#F4F7FB] text-[#101828] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="opportunity-title">
        <header className="sticky top-0 z-10 border-b border-[#D9E2EF] bg-white/92 px-5 py-4 backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-2"><OpportunityIssueBadge issue={issue} /><ReviewStatusBadge status={status} /><FindingConfidenceBadge tier={finding.confidence_tier} /></div>
              <h2 id="opportunity-title" className="truncate text-lg font-semibold">{organisationName(finding)}</h2>
              <p className="mt-1 truncate text-sm text-[#667085]">{supplierName(finding)} · {framework.reference ?? 'Framework unresolved'}</p>
            </div>
            <button onClick={onClose} aria-label="Close opportunity drawer" className="flex h-8 w-8 items-center justify-center rounded-md border border-[#D0D5DD] text-lg text-[#667085] hover:bg-[#F8FAFC]">x</button>
          </div>
        </header>

        <div className="space-y-4 p-5">
          <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs font-semibold uppercase text-[#667085]">Due now</p><p className="mt-2 text-lg font-semibold">{money(parsedDueNow ?? dueNowRebate(finding))}</p></div>
              <div><p className="text-xs font-semibold uppercase text-[#667085]">Potential total</p><p className="mt-2 text-lg font-semibold">{money(lifetimeRebate(finding))}</p></div>
              <div><p className="text-xs font-semibold uppercase text-[#667085]">Award value</p><p className="mt-2 text-lg font-semibold">{money(finding.award_contract_value ?? award?.award_value, award?.currency ?? 'GBP')}</p></div>
            </div>
            <div className="mt-4 rounded-lg border border-[#E1E7F0] bg-[#F8FAFD] p-3">
              <p className="text-xs font-semibold uppercase text-[#667085]">Recommended next step</p>
              <p className="mt-2 text-sm leading-relaxed text-[#475467]">{recommendedAction(finding)}</p>
            </div>
          </section>

          <section className="rounded-xl border border-[#E1E7F0] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Review outcome</h3>
                <p className="mt-1 text-xs text-[#667085]">Update status, adjust due-now rebate, and leave notes for the next reviewer.</p>
              </div>
              <button disabled={isSaving || parsedDueNow === null} onClick={() => save()} className="h-9 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-45">{isSaving ? 'Saving' : 'Save review'}</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="flex flex-wrap gap-2">
                {statusOrder.map(value => (
                  <button key={value} onClick={() => save(value)} disabled={isSaving || parsedDueNow === null} className={`rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-45 ${status === value ? reviewStatusVisuals[value].activeButtonClass : reviewStatusVisuals[value].inactiveButtonClass}`}>
                    <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${reviewStatusVisuals[value].dotClass} ${reviewStatusVisuals[value].pulse ? 'skeleton-pulse' : ''}`} />
                    {reviewStatusLabels[value]}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-[#667085]">Due-now rebate</span>
                <input value={dueNow} onChange={event => setDueNow(event.target.value)} inputMode="decimal" className="mt-1 h-9 w-full rounded-md border border-[#D0D5DD] bg-white px-3 text-sm text-[#101828] outline-none focus:border-[#2A64FF]" />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold uppercase text-[#667085]">Add note</span>
              <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder="Record what was checked, who was contacted, or why this was marked not relevant." className="mt-1 w-full resize-none rounded-md border border-[#D0D5DD] bg-white px-3 py-2 text-sm leading-relaxed text-[#101828] outline-none placeholder:text-[#98A2B3] focus:border-[#2A64FF]" />
            </label>
            {saveError && <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">{saveError}</p>}
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase text-[#667085]">Notes history</p>
              {notes.length === 0 ? <p className="text-xs text-[#667085]">No notes have been added yet.</p> : notes.map(item => (
                <div key={item.id} className="rounded-md border border-[#E1E7F0] bg-[#F8FAFD] p-3">
                  <p className="text-xs leading-relaxed text-[#475467]">{item.note}</p>
                  <p className="mt-2 text-xs text-[#98A2B3]">{item.author ?? 'dashboard'} · {dateLabel(item.created_at)}</p>
                </div>
              ))}
            </div>
          </section>

          <EvidencePanel title="Award evidence" chip={<AwardMatchConfidenceBadge confidence={award?.confidence} />}>
            <div className="flex flex-wrap gap-2"><FrameworkRegisterBadge status={registerStatus} /></div>
            <p className="mt-3 rounded-md border border-[#E1E7F0] bg-[#F8FAFD] p-3 text-xs leading-relaxed text-[#475467]">{registerStatus.reason}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3"><Detail label="Framework reference" value={framework.reference} /><Detail label="Framework name" value={framework.name} /><Detail label="Published" value={dateLabel(award?.publication_date)} /><Detail label="Award date" value={dateLabel(award?.award_date)} /><Detail label="Source" value={award?.source} /><Detail label="Candidate ID" value={award?.candidate_id} /></dl>
            {award?.contract_description && <p className="mt-3 text-sm leading-relaxed text-[#667085]">{award.contract_description}</p>}
            {awardEvidence && <div className="mt-3 rounded-md border border-[#E1E7F0] bg-[#F8FAFD] p-3 text-xs leading-relaxed text-[#475467]"><strong className="text-[#101828]">Award surfacing rationale:</strong> {awardEvidence}</div>}
            {award?.source_url && <a href={award.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-[#2A64FF] underline">Open source notice</a>}
          </EvidencePanel>

          <EvidenceChecksSummary finding={finding} />
          <BuyerEvidencePanel evidence={finding.buyer_evidence} />
          <SupplierEvidencePanel evidence={finding.supplier_evidence} />

          <EvidencePanel title="Audit links">
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-[#0B1F4D]">Show technical references</summary>
              <dl className="mt-3 grid grid-cols-2 gap-3"><Detail label="External awards" value={finding.external_award_ids.join(', ')} /><Detail label="Rebate records" value={finding.rebate_check_record_ids.join(', ') || 'None'} /><Detail label="Invoice rows" value={finding.invoice_spend_record_ids.join(', ') || 'None'} /><Detail label="Run ID" value={finding.run_id} /></dl>
            </details>
          </EvidencePanel>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

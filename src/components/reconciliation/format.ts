import { ReconciliationFindingRecord } from './types';

export function money(value: number | null | undefined, currency = 'GBP'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.replace(/\b\w/g, character => character.toUpperCase());
}

export function primaryAward(finding: ReconciliationFindingRecord) {
  return finding.external_awards[0] ?? null;
}

export interface FrameworkRegisterStatus {
  confirmed: boolean;
  reference: string | null;
  name: string | null;
  label: string;
  reason: string;
  tone: 'confirmed' | 'review' | 'unconfirmed';
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function frameworkRateName(finding: ReconciliationFindingRecord): string | null {
  const rate = finding.framework_rate;
  return stringValue(rate?.framework_name) ?? stringValue(rate?.matched_framework_name) ?? stringValue(rate?.official_name);
}

function frameworkNameFromEvidence(reference: string | null | undefined, evidence: string | null | undefined): string | null {
  if (!reference || !evidence) return null;
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const afterRef = evidence.match(new RegExp(`${escaped}\\s*[-–—:]\\s*([^.;\\n]+)`, 'i'))?.[1]?.trim();
  if (afterRef) return afterRef.replace(/\s+framework(?: agreement)?$/i, '').trim();
  const beforeRef = evidence.match(new RegExp(`([^.;\\n]{3,80}?)\\s+(?:ref(?:erence)?\\s*)?${escaped}`, 'i'))?.[1]?.trim();
  return beforeRef ? beforeRef.replace(/^(?:the|via|under|through|using|provided for in the)\\s+/i, '').trim() : null;
}

export function frameworkDisplay(finding: ReconciliationFindingRecord): { reference: string | null; name: string | null; hints: string[] } {
  const award = primaryAward(finding);
  const hints = award?.framework_hints ?? [];
  const reference = finding.framework_reference ?? hints[0] ?? null;
  return {
    reference,
    name: frameworkRateName(finding) ?? frameworkNameFromEvidence(reference, award?.evidence_excerpt),
    hints,
  };
}

export function frameworkRegisterStatusForAward(input: {
  framework_reference?: string | null;
  framework_hints?: string[] | null;
  award_date?: string | null;
  publication_date?: string | null;
}): FrameworkRegisterStatus {
  const candidates = [
    input.framework_reference,
    ...(input.framework_hints ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const unique = [...new Set(candidates.map(value => value.trim().toUpperCase()))];
  return {
    confirmed: unique.length > 0,
    reference: unique[0] ?? null,
    name: null,
    label: unique.length ? 'Framework resolved' : 'Framework unresolved',
    reason: unique.length
      ? `${unique.join(', ')} was resolved by the Laravel API response. Lifecycle/register validation is owned by csg-api.`
      : 'No framework reference was resolved from the source award evidence, so this award needs manual review before it counts as a confirmed matched opportunity.',
    tone: unique.length ? 'confirmed' : 'unconfirmed',
  };
}

export function frameworkRegisterStatus(finding: ReconciliationFindingRecord): FrameworkRegisterStatus {
  const award = primaryAward(finding);
  if (finding.identity_confirmed === false) {
    return {
      confirmed: false,
      reference: finding.framework_reference ?? award?.framework_hints[0] ?? null,
      name: frameworkDisplay(finding).name,
      label: 'Framework not confirmed',
      reason: 'Laravel returned this finding without confirmed award/framework identity.',
      tone: 'unconfirmed',
    };
  }
  return frameworkRegisterStatusForAward({
    framework_reference: finding.framework_reference,
    framework_hints: award?.framework_hints ?? [],
    award_date: award?.award_date ?? null,
    publication_date: award?.publication_date ?? null,
  });
}

export function confirmedFrameworkFindings(findings: ReconciliationFindingRecord[]): ReconciliationFindingRecord[] {
  return findings.filter(finding => frameworkRegisterStatus(finding).confirmed);
}

export function awardEvidenceExcerpt(finding: ReconciliationFindingRecord): string | null {
  return primaryAward(finding)?.evidence_excerpt || null;
}

export function matchJustification(finding: ReconciliationFindingRecord): string {
  return awardEvidenceExcerpt(finding) ?? finding.explanation;
}

export function organisationName(finding: ReconciliationFindingRecord): string {
  return finding.organisation_display || primaryAward(finding)?.buyer_name || titleCase(finding.customer_canonical);
}

export function supplierName(finding: ReconciliationFindingRecord): string {
  return finding.supplier_display || primaryAward(finding)?.supplier_name || titleCase(finding.supplier_canonical);
}

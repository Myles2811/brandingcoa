import { NormalizedNotice, PSAwardResult } from './types';

type AwardIdentityFields = (Pick<NormalizedNotice, 'buyer_name' | 'supplier_name' | 'award_date' | 'award_value' | 'currency' | 'contract_description' | 'framework_hints'> & { notice_url?: string; link?: string }) |
  (Pick<PSAwardResult, 'buyer_name' | 'supplier_name' | 'award_date' | 'award_value' | 'currency' | 'contract_description' | 'framework_hints'> & { notice_url?: string; link?: string });

function normalized(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizedDescription(value: string): string {
  return normalized(value.replace(/^\s*\[award date:[^\]]+\]\s*/i, ''));
}

export function realAwardKey(award: AwardIdentityFields): string {
  const date = award.award_date ? award.award_date.slice(0, 10) : '';
  const value = award.award_value === null ? '' : Number(award.award_value).toFixed(2);
  const frameworks = [...award.framework_hints].map(normalized).sort().join(',');
  const url = normalized(award.link ?? award.notice_url ?? '');
  return [url, normalized(award.buyer_name), normalized(award.supplier_name), date, value,
    normalized(award.currency || 'GBP'), frameworks, normalizedDescription(award.contract_description)].join('|');
}

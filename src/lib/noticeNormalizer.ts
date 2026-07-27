import { NormalizedNotice } from './types';
import { getKnownFrameworkIds } from './frameworkCatalogue';

// PS Framework ID allow-list for discovery hints
// Includes current, coming-soon and retired IDs so historical searches remain accurate.
export const PS_FRAMEWORK_IDS = getKnownFrameworkIds();

// Extract PS framework IDs from text
export function extractFrameworkHints(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const id of PS_FRAMEWORK_IDS) {
    if (text.toUpperCase().includes(id.toUpperCase())) {
      if (!found.includes(id)) found.push(id);
    }
  }
  // Also catch Y2x pattern generically
  const genericMatches = text.match(/\bY2[0-9]{4}\b/gi) ?? [];
  for (const m of genericMatches) {
    const upper = m.toUpperCase();
    if (!found.includes(upper)) found.push(upper);
  }
  return found;
}

function textValues(values: unknown[]): string[] {
  return values
    .flatMap(value => Array.isArray(value) ? value : [value])
    .map(value => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean);
}

function itemText(items: Array<Record<string, unknown>> = []): string[] {
  return items.flatMap(item => textValues([item.title, item.description]));
}

function documentText(documents: Array<Record<string, unknown>> = []): string[] {
  return documents.flatMap(document => textValues([document.title, document.description]));
}

function makeCandidateId(parts: {
  source: NormalizedNotice['source']; ocid: string; releaseId: string;
  awardId: string; supplierId: string; lotIds: string[];
}): string {
  return [parts.source, parts.ocid || parts.releaseId, parts.releaseId, parts.awardId,
    parts.supplierId, [...parts.lotIds].sort().join(',')]
    .map(value => encodeURIComponent(value || '_')).join(':');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeOCDSRelease(release: any, source: NormalizedNotice['source']): NormalizedNotice[] {
  const results: NormalizedNotice[] = [];

  const ocid: string = release?.ocid ?? '';
  const releaseId: string = release?.id ?? '';
  const publicationDate: string = release?.date ?? '';
  const buyerName: string = release?.buyer?.name ?? '';

  const tenderTitle: string = release?.tender?.title ?? '';
  const tenderDesc: string = release?.tender?.description ?? '';

  // Build notice URL
  // FaT: release.id is the notice reference e.g. "008710-2026" → /Notice/008710-2026
  // CF:  release.id is "{uuid}-{number}", the notice URL uses just the UUID part
  let noticeUrl = '';
  if (source === 'find_tender') {
    noticeUrl = `https://www.find-tender.service.gov.uk/Notice/${releaseId}`;
  } else if (source === 'contracts_finder') {
    const cfUuid = releaseId.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (cfUuid) {
      noticeUrl = `https://www.contractsfinder.service.gov.uk/Notice/${cfUuid[1]}`;
    }
  } else {
    const awardDocument = release?.tender?.documents?.find(
      (document: { documentType?: string; url?: string }) => document.documentType === 'awardNotice' && document.url
    );
    noticeUrl = awardDocument?.url ??
      `https://www.publiccontractsscotland.gov.uk/search/show/search_view.aspx?ID=${encodeURIComponent(releaseId.replace(/^rls-\d+-/, ''))}`;
  }

  const awards = release?.awards ?? [];
  if (awards.length === 0) {
    // No award blocks — create a single stub from tender info
    const evidenceText = textValues([
      tenderTitle, tenderDesc, release?.tender?.procurementMethodRationale,
      itemText(release?.tender?.items),
      (release?.tender?.lots ?? []).flatMap((lot: Record<string, unknown>) => textValues([lot.title, lot.description])),
      documentText(release?.tender?.documents),
    ]).join(' | ');
    const frameworkHints = extractFrameworkHints(evidenceText);
    const candidateId = makeCandidateId({ source, ocid, releaseId, awardId: '_', supplierId: '_', lotIds: [] });
    results.push({
      source,
      candidate_id: candidateId,
      notice_id: releaseId,
      release_id: releaseId,
      award_id: '',
      lot_ids: [],
      contract_ids: [],
      ocid,
      buyer_name: buyerName,
      supplier_name: '',
      contract_description: tenderTitle || tenderDesc,
      award_date: '',
      publication_date: publicationDate,
      award_value: null,
      currency: 'GBP',
      notice_url: noticeUrl,
      evidence_text: evidenceText,
      framework_hints: frameworkHints,
    });
    return results;
  }

  for (const [awardIndex, award] of awards.entries()) {
    const suppliers: Array<{ name?: string; id?: string }> = award?.suppliers ?? [];
    // PCS commonly records the signed/award date and value on the related contract.
    const relatedContracts = (release?.contracts ?? []).filter(
      (c: { awardID?: string }) => !award.id || c.awardID === award.id
    );
    const awardDate: string = award?.date ?? relatedContracts[0]?.dateSigned ?? '';
    const awardValue: number | null = award?.value?.amount ?? relatedContracts[0]?.value?.amount ?? null;
    const currency: string = award?.value?.currency ?? relatedContracts[0]?.value?.currency ?? 'GBP';
    const awardTitle: string = award?.title ?? '';
    const awardDesc: string = award?.description ?? '';

    const contracts = relatedContracts;
    const lotIds: string[] = (award?.relatedLots ?? award?.relatedLotsIds ?? []).map(String);
    const relevantLots = (release?.tender?.lots ?? []).filter(
      (lot: { id?: string }) => lotIds.length === 0 || lotIds.includes(String(lot.id ?? ''))
    );
    const evidenceParts = textValues([
      awardTitle, awardDesc, itemText(award?.items), documentText(award?.documents),
      contracts.flatMap((contract: Record<string, unknown>) => textValues([
        contract.title, contract.description,
        itemText(contract.items as Array<Record<string, unknown>>),
        documentText(contract.documents as Array<Record<string, unknown>>),
      ])),
      tenderTitle, tenderDesc, release?.tender?.procurementMethodRationale,
      itemText(release?.tender?.items),
      relevantLots.flatMap((lot: Record<string, unknown>) => textValues([lot.title, lot.description])),
      documentText(release?.tender?.documents),
    ]);
    const contractDescription = textValues([awardTitle, awardDesc, contracts[0]?.title, contracts[0]?.description, tenderTitle, tenderDesc])[0] ?? '';
    const evidenceText = [...new Set(evidenceParts)].join(' | ');
    const frameworkHints = extractFrameworkHints(evidenceText);
    const supplierEntries = suppliers.length > 0 ? suppliers : [{ name: '', id: '_' }];

    for (const [supplierIndex, supplier] of supplierEntries.entries()) {
      const awardId = String(award?.id ?? `award-${awardIndex + 1}`);
      const supplierId = String(supplier.id ?? supplier.name ?? `supplier-${supplierIndex + 1}`);
      results.push({
        source,
        candidate_id: makeCandidateId({ source, ocid, releaseId, awardId, supplierId, lotIds }),
        notice_id: releaseId,
        release_id: releaseId,
        award_id: awardId,
        lot_ids: lotIds,
        contract_ids: contracts.map((contract: { id?: string }) => String(contract.id ?? '')).filter(Boolean),
        ocid,
        buyer_name: buyerName,
        supplier_name: supplier.name ?? '',
        contract_description: contractDescription,
        award_date: awardDate,
        publication_date: publicationDate,
        award_value: awardValue,
        currency,
        notice_url: noticeUrl,
        evidence_text: evidenceText,
        framework_hints: frameworkHints,
      });
    }
  }

  return results;
}

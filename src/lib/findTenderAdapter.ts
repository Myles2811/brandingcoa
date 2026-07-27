import { DateRange, NormalizedNotice, SourceFetchResult } from './types';
import { normalizeOCDSRelease } from './noticeNormalizer';
import { fetchWithRetry, sourceIssue } from './sourceFetch';

const FT_BASE = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';

interface FTResponse {
  releases?: OCDSRelease[];
  links?: {
    next?: string;
  };
}

interface OCDSRelease {
  ocid?: string;
  id?: string;
  date?: string;
  tag?: string[];
  buyer?: { name?: string; id?: string };
  awards?: OCDSAward[];
  tender?: {
    title?: string;
    description?: string;
    lots?: Array<{ id?: string; title?: string; description?: string }>;
  };
  contracts?: OCDSContract[];
}

interface OCDSAward {
  id?: string;
  date?: string;
  value?: { amount?: number; currency?: string };
  suppliers?: Array<{ name?: string; id?: string }>;
  title?: string;
  description?: string;
  relatedLots?: string[];
}

interface OCDSContract {
  id?: string;
  awardID?: string;
  title?: string;
  description?: string;
  value?: { amount?: number; currency?: string };
  period?: { startDate?: string; endDate?: string };
}

export async function fetchFindTenderNotices(range: DateRange): Promise<NormalizedNotice[]> {
  return (await fetchFindTenderNoticesDetailed(range)).notices;
}

export async function fetchFindTenderNoticesDetailed(range: DateRange): Promise<SourceFetchResult> {
  const results: NormalizedNotice[] = [];
  const issues = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 50;

  do {
    const params = new URLSearchParams({
      stages: 'award',
      limit: '100',
      updatedFrom: range.start,
      updatedTo: range.end,
    });
    if (cursor) params.set('cursor', cursor);

    const url = `${FT_BASE}?${params.toString()}`;

    let data: FTResponse;
    try {
      const response = await fetchWithRetry(url, 'find_tender');
      data = await response.json();
    } catch (err) {
      console.error('Find a Tender fetch error:', err);
      issues.push(sourceIssue('find_tender', err instanceof Error ? err.message : String(err)));
      break;
    }

    const releases: OCDSRelease[] = data.releases ?? [];
    for (const release of releases) {
      const normalized = normalizeOCDSRelease(release, 'find_tender');
      if (normalized) results.push(...normalized);
    }

    // Cursor-based pagination
    const nextLink = data.links?.next;
    if (nextLink) {
      try {
        const nextUrl = new URL(nextLink.startsWith('http') ? nextLink : `https://www.find-tender.service.gov.uk${nextLink}`);
        cursor = nextUrl.searchParams.get('cursor') ?? undefined;
      } catch {
        cursor = undefined;
      }
    } else {
      cursor = undefined;
    }

    pageCount++;
  } while (cursor && pageCount < maxPages);

  if (cursor && pageCount >= maxPages) {
    issues.push(sourceIssue('find_tender', `pagination stopped at the ${maxPages}-page safety limit`));
  }

  return { notices: results, status: { source: 'find_tender', complete: issues.length === 0, count: results.length, issues } };
}

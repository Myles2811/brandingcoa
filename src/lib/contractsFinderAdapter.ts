import { DateRange, NormalizedNotice, SourceFetchResult } from './types';
import { normalizeOCDSRelease } from './noticeNormalizer';
import { fetchWithRetry, sourceIssue } from './sourceFetch';

const CF_BASE = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';

interface CFResponse {
  releases?: CFRelease[];
  links?: {
    next?: string;
  };
}

interface CFRelease {
  ocid?: string;
  id?: string;
  date?: string;
  tag?: string[];
  buyer?: { name?: string; id?: string };
  awards?: CFAward[];
  tender?: {
    title?: string;
    description?: string;
  };
  contracts?: CFContract[];
}

interface CFAward {
  id?: string;
  date?: string;
  value?: { amount?: number; currency?: string };
  suppliers?: Array<{ name?: string; id?: string }>;
  title?: string;
  description?: string;
}

interface CFContract {
  id?: string;
  awardID?: string;
  title?: string;
  description?: string;
  value?: { amount?: number; currency?: string };
}

export async function fetchContractsFinderNotices(range: DateRange): Promise<NormalizedNotice[]> {
  return (await fetchContractsFinderNoticesDetailed(range)).notices;
}

export async function fetchContractsFinderNoticesDetailed(range: DateRange): Promise<SourceFetchResult> {
  const results: NormalizedNotice[] = [];
  const issues = [];
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 50;

  do {
    const params = new URLSearchParams({
      stages: 'award',
      limit: '100',
      publishedFrom: range.start,
      publishedTo: range.end,
    });
    if (cursor) params.set('cursor', cursor);

    const url = `${CF_BASE}?${params.toString()}`;

    let data: CFResponse;
    try {
      // Contracts Finder asks rate-limited clients to wait five minutes. Retrying this
      // exact URL preserves the current pagination cursor instead of skipping a page.
      const response = await fetchWithRetry(url, 'contracts_finder', {
        attempts: 3,
        rateLimitDelayMs: 5 * 60_000,
        maxRateLimitDelayMs: 10 * 60_000,
      });
      data = await response.json();
    } catch (err) {
      console.error('Contracts Finder fetch error:', err);
      issues.push(sourceIssue('contracts_finder', err instanceof Error ? err.message : String(err)));
      break;
    }

    const releases: CFRelease[] = data.releases ?? [];
    for (const release of releases) {
      const normalized = normalizeOCDSRelease(release, 'contracts_finder');
      if (normalized) results.push(...normalized);
    }

    const nextLink = data.links?.next;
    if (nextLink) {
      try {
        const nextUrl = new URL(nextLink.startsWith('http') ? nextLink : `https://www.contractsfinder.service.gov.uk${nextLink}`);
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
    issues.push(sourceIssue('contracts_finder', `pagination stopped at the ${maxPages}-page safety limit`));
  }

  return { notices: results, status: { source: 'contracts_finder', complete: issues.length === 0, count: results.length, issues } };
}

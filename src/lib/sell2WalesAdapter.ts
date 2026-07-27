import { DateRange, NormalizedNotice, RunIssue, SourceFetchResult } from './types';
import { normalizeOCDSRelease } from './noticeNormalizer';
import { fetchWithRetry } from './sourceFetch';
import * as cheerio from 'cheerio';

const API = 'https://api.sell2wales.gov.wales/v1/Notices';
const BULK_DOWNLOAD = 'https://www.sell2wales.gov.wales/Notice/Download/Download.aspx';
const AWARD_TYPES = [3, 6, 21, 22, 23, 25, 53, 56] as const;
const MIXED_TYPES = new Set<number>([21, 22, 23]);

interface Sell2WalesRelease extends Record<string, unknown> {
  tag?: unknown;
}

function releasePackage(value: unknown): Sell2WalesRelease[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('releases' in value)) return [];
  const releases = (value as { releases?: unknown }).releases;
  if (!Array.isArray(releases)) return [];
  return releases.filter((release): release is Sell2WalesRelease =>
    release !== null && typeof release === 'object' && !Array.isArray(release)
  );
}

function isAwardRelease(release: Sell2WalesRelease): boolean {
  return Array.isArray(release.tag) && release.tag.some(tag => tag === 'award');
}

/** Official JSON bulk-download page, used only when the documented API is unavailable. */
async function fetchOfficialBulkDownload(monthYear: string, noticeType: number): Promise<Sell2WalesRelease[]> {
  const page = await fetchWithRetry(BULK_DOWNLOAD, 'sell2wales_bulk_download', 2);
  const html = await page.text();
  const $ = cheerio.load(html);
  const [month, year] = monthYear.split('-');
  const dateRange = $('#ctl00_MainBody_ddDateRange option').toArray()
    .map(option => $(option).attr('value') ?? '')
    .find(value => value.startsWith(`${year}-${month}-`));
  if (!dateRange) throw new Error(`official bulk download does not offer ${monthYear}`);

  const form = new URLSearchParams();
  $('input[type="hidden"]').each((_index, element) => {
    const name = $(element).attr('name');
    if (name) form.set(name, $(element).attr('value') ?? '');
  });
  form.set('ctl00$MainBody$rblCollectionType', '0');
  form.set('ctl00$MainBody$ddDateRange', dateRange);
  form.set('ctl00$MainBody$rblOutputType', '0');
  form.set('ctl00$MainBody$rblDownloadType', '0');
  form.set('ctl00$MainBody$ddlNoticeTypes', String(noticeType));
  form.set('ctl00$MainBody$buttonDownload', 'Download');
  const cookie = page.headers.get('set-cookie')?.split(';', 1)[0];
  const response = await fetch(BULK_DOWNLOAD, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/json, */*',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://www.sell2wales.gov.wales',
      Referer: BULK_DOWNLOAD,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.text();
  if (!response.ok || /CustomErrors\.aspx|An error has occurred/i.test(`${response.url}\n${body.slice(0, 500)}`)) {
    throw new Error(response.ok
      ? 'official bulk download returned its application error page'
      : `official bulk download failed with HTTP ${response.status}`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(body.replace(/^\uFEFF/, '')); }
  catch { throw new Error('official bulk download returned non-JSON data'); }
  return releasePackage(parsed);
}

async function fetchType(monthYear: string, noticeType: number): Promise<{ notices: NormalizedNotice[]; issue?: RunIssue }> {
  const params = new URLSearchParams({ dateFrom: monthYear, noticeType: String(noticeType), outputType: '0' });
  try {
    const response = await fetchWithRetry(`${API}?${params}`, 'sell2wales');
    const releases = releasePackage(await response.json());
    const awardReleases = MIXED_TYPES.has(noticeType) ? releases.filter(isAwardRelease) : releases;
    return { notices: awardReleases.flatMap(release => normalizeOCDSRelease(release, 'sell2wales')) };
  } catch (error) {
    const cause = error && typeof error === 'object' && 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
    const apiMessage = [error instanceof Error ? error.message : String(error), cause instanceof Error ? cause.message : ''].filter(Boolean).join(': ');
    try {
      const releases = await fetchOfficialBulkDownload(monthYear, noticeType);
      const awardReleases = MIXED_TYPES.has(noticeType) ? releases.filter(isAwardRelease) : releases;
      return { notices: awardReleases.flatMap(release => normalizeOCDSRelease(release, 'sell2wales')) };
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      const message = `API ${apiMessage}; bulk fallback ${fallbackMessage}`;
      return {
        notices: [],
        issue: {
          stage: 'source_fetch', source: 'sell2wales', recoverable: true,
          message: `notice type ${noticeType}: ${message}`,
        },
      };
    }
  }
}

export async function fetchSell2WalesAwardsDetailed(range: DateRange): Promise<SourceFetchResult> {
  const [year, month] = range.start.slice(0, 7).split('-');
  const monthYear = `${month}-${year}`;
  const groups = await Promise.all(AWARD_TYPES.map(type => fetchType(monthYear, type)));
  const notices = groups.flatMap(group => group.notices);
  const issues = groups.flatMap(group => group.issue ? [group.issue] : []);
  return { notices, status: { source: 'sell2wales', complete: issues.length === 0, count: notices.length, issues } };
}

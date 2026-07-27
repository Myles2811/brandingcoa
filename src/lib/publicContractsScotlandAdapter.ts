import { DateRange, NormalizedNotice, RunIssue, SourceFetchResult } from './types';
import { normalizeOCDSRelease } from './noticeNormalizer';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';

const PCS_API = 'https://api.publiccontractsscotland.gov.uk/v1/Notices';

// Explicit award/result categories documented by PCS.
export const PCS_AWARD_NOTICE_TYPES = [3, 6, 21, 22, 23, 25, 103, 104] as const;
const MIXED_NOTICE_TYPES = new Set<number>([21, 22, 23]);
const REQUEST_TIMEOUT_MS = 150_000;

interface PCSReleasePackage {
  releases?: unknown[];
}

interface PCSRelease extends Record<string, unknown> {
  tag?: unknown;
}

function isPCSRelease(value: unknown): value is PCSRelease {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAwardRelease(release: PCSRelease): boolean {
  return Array.isArray(release.tag) && release.tag.some(tag => tag === 'award');
}

function fetchJson(url: string): Promise<PCSReleasePackage> {
  const intermediate = fs.readFileSync(
    path.join(process.cwd(), 'certs/sectigo-public-server-authentication-ca-dv-r36.pem'),
    'utf8'
  );
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { Accept: 'application/json' },
      // PCS omits its intermediate certificate. Add that public CA certificate while
      // retaining Node's full root store and normal hostname/certificate validation.
      ca: [...tls.rootCertificates, intermediate],
      timeout: REQUEST_TIMEOUT_MS,
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode ?? 'unknown'}`));
          return;
        }
        try { resolve(JSON.parse(body) as PCSReleasePackage); }
        catch { reject(new Error('invalid JSON response')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`timeout after ${REQUEST_TIMEOUT_MS}ms`)));
    request.on('error', reject);
  });
}

async function fetchAwardType(monthYear: string, noticeType: number): Promise<{ notices: NormalizedNotice[]; issue?: RunIssue }> {
  const params = new URLSearchParams({ dateFrom: monthYear, noticeType: String(noticeType), outputType: '0' });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fetchJson(`${PCS_API}?${params}`);
      const releases = (data.releases ?? []).filter(isPCSRelease);
      const awardReleases = MIXED_NOTICE_TYPES.has(noticeType)
        ? releases.filter(isAwardRelease)
        : releases;
      return { notices: awardReleases.flatMap(release =>
        normalizeOCDSRelease(release, 'public_contracts_scotland')
      ) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 3) {
        console.error(`[PCS] notice type ${noticeType} failed after ${attempt} attempts: ${message}`);
        return {
          notices: [],
          issue: { stage: 'source_fetch', source: 'public_contracts_scotland', message: `notice type ${noticeType}: ${message}`, recoverable: true },
        };
      }
      console.warn(`[PCS] notice type ${noticeType} attempt ${attempt} failed: ${message}; retrying`);
      await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  return { notices: [] };
}

/** Fetch all explicit PCS award categories for the publication month in range. */
export async function fetchPublicContractsScotlandAwards(range: DateRange): Promise<NormalizedNotice[]> {
  return (await fetchPublicContractsScotlandAwardsDetailed(range)).notices;
}

export async function fetchPublicContractsScotlandAwardsDetailed(range: DateRange): Promise<SourceFetchResult> {
  const [year, month] = range.start.slice(0, 7).split('-');
  const monthYear = `${month}-${year}`;
  const groups = await Promise.all(
    PCS_AWARD_NOTICE_TYPES.map(type => fetchAwardType(monthYear, type))
  );
  const notices = groups.flatMap(group => group.notices);
  const issues = groups.flatMap(group => group.issue ? [group.issue] : []);
  console.log(`[PCS] ${monthYear}: ${notices.length} normalized award records`);
  return {
    notices,
    status: { source: 'public_contracts_scotland', complete: issues.length === 0, count: notices.length, issues },
  };
}

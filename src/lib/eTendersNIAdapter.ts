import * as cheerio from 'cheerio';
import { DateRange, NormalizedNotice, RunIssue, SourceFetchResult } from './types';
import { extractFrameworkHints } from './noticeNormalizer';
import { fetchWithRetry } from './sourceFetch';

const BASE = 'https://etendersni.gov.uk';
const LIST = `${BASE}/epps/notices/viewPublishedNotices.do`;
const MAX_PAGES = 500;

interface ListEntry { title: string; href: string; publicationDate: string; }

function parseDate(value: string): Date | null {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) {
    const parsed = new Date(value.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)));
}

function isoDate(value: string): string {
  return parseDate(value)?.toISOString() ?? '';
}

function parseList(html: string): Array<ListEntry & { date: Date }> {
  const $ = cheerio.load(html);
  const entries: Array<ListEntry & { date: Date }> = [];
  $('#T01 tbody tr').each((_index, row) => {
    const cells = $(row).find('td');
    const link = cells.eq(0).find('a').first();
    const type = link.text().replace(/\s+/g, ' ').trim();
    const dateText = cells.eq(5).text().replace(/\s+/g, ' ').trim();
    const date = parseDate(dateText);
    if (!date || !/Contract Award Notice|Contract Details Notice/i.test(type)) return;
    entries.push({
      title: cells.eq(1).text().replace(/\s+/g, ' ').trim(),
      href: new URL(link.attr('href') ?? '', BASE).toString(),
      publicationDate: date.toISOString(),
      date,
    });
  });
  return entries;
}

async function detailNotices(entry: ListEntry, buffer: Buffer): Promise<NormalizedNotice[]> {
  let text = '';
  if (buffer.subarray(0, 4).toString() === '%PDF') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else {
    const $ = cheerio.load(buffer.toString('utf8'));
    $('script,style,noscript').remove();
    text = $('body').text();
  }
  text = text.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const officialNames = [...text.matchAll(/Official name:\s*(.*?)(?=\s+National registration number:|\n)/gi)].map(match => match[1].trim());
  const buyer = officialNames[0] ?? text.match(/Contracting authority\n([^\n]+)/i)?.[1]?.trim() ?? '';
  const modernSuppliers = [...text.matchAll(/(?:^|\n)Supplier\n([^\n]+)/gi)].map(match => match[1].trim());
  const suppliers = [...new Set(officialNames.length > 1 ? officialNames.slice(1) : modernSuppliers)];
  const supplierList = suppliers.length > 0 ? suppliers : [''];
  const awardDate = isoDate(text.match(/(?:Date of conclusion of the contract:|Award decision date\n)\s*([^\n]+)/i)?.[1] ?? '');
  const valueMatch = text.match(/(?:Total value of the contract\/lot|Value excluding VAT):?\s*(?:£)?([\d,.]+)[^\n]*?(?:Currency:\s*)?([A-Z]{3})?/i)
    ?? text.match(/Contract value\n£([\d,.]+)/i);
  const value = valueMatch ? Number(valueMatch[1].replace(/,/g, '')) : null;
  const currency = valueMatch?.[2] ?? 'GBP';
  const url = new URL(entry.href);
  const noticeId = url.searchParams.get('noticeId') ?? url.searchParams.get('documentId') ?? entry.href;
  const resourceId = url.searchParams.get('resourceId') ?? '';
  const hints = extractFrameworkHints(text);

  return supplierList.map((supplier, index) => {
    const candidateId = ['etenders_ni', resourceId || noticeId, noticeId, `award-${index + 1}`, supplier || '_', '_']
      .map(part => encodeURIComponent(part)).join(':');
    return {
      source: 'etenders_ni' as const,
      candidate_id: candidateId,
      notice_id: noticeId,
      release_id: noticeId,
      award_id: `award-${index + 1}`,
      lot_ids: [],
      contract_ids: resourceId ? [resourceId] : [],
      ocid: resourceId,
      buyer_name: buyer,
      supplier_name: supplier,
      contract_description: entry.title,
      award_date: awardDate,
      publication_date: entry.publicationDate,
      award_value: Number.isFinite(value) ? value : null,
      currency,
      notice_url: entry.href,
      evidence_text: text,
      framework_hints: hints,
    };
  });
}

export async function fetchETendersNIAwardsDetailed(range: DateRange): Promise<SourceFetchResult> {
  const start = new Date(`${range.start}Z`);
  const end = new Date(`${range.end}Z`);
  const issues: RunIssue[] = [];
  const entries: ListEntry[] = [];
  let reachedStart = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      'd-446978-o': '1', 'd-446978-n': '1', 'd-446978-s': 'datePublished', 'd-446978-p': String(page),
    });
    try {
      const response = await fetchWithRetry(`${LIST}?${params}`, 'etenders_ni');
      const html = await response.text();
      const parsed = parseList(html);
      const $page = cheerio.load(html);
      const allRows = $page('#T01 tbody tr');
      for (const entry of parsed) if (entry.date >= start && entry.date <= end) entries.push(entry);
      // Award-only parsing can yield no rows, so inspect the last publication date in the page HTML separately.
      const dates = allRows.map((_i, row) => parseDate($page(row).find('td').eq(5).text())?.getTime() ?? NaN).get().filter(Number.isFinite);
      if (dates.length > 0 && Math.min(...dates) < start.getTime()) { reachedStart = true; break; }
    } catch (error) {
      issues.push({ stage: 'source_fetch', source: 'etenders_ni', message: error instanceof Error ? error.message : String(error), recoverable: true });
      break;
    }
  }
  if (!reachedStart) issues.push({ stage: 'source_fetch', source: 'etenders_ni', message: `did not reach requested month within ${MAX_PAGES} pages`, recoverable: true });

  const notices: NormalizedNotice[] = [];
  for (let index = 0; index < entries.length; index += 5) {
    await Promise.all(entries.slice(index, index + 5).map(async entry => {
      try {
        const response = await fetchWithRetry(entry.href, 'etenders_ni');
        notices.push(...await detailNotices(entry, Buffer.from(await response.arrayBuffer())));
      } catch (error) {
        issues.push({ stage: 'source_fetch', source: 'etenders_ni', message: `${entry.href}: ${error instanceof Error ? error.message : String(error)}`, recoverable: true });
      }
    }));
  }
  return { notices, status: { source: 'etenders_ni', complete: issues.length === 0, count: notices.length, issues } };
}

import { load } from 'cheerio';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FrameworkCatalogue, FrameworkRecord, FrameworkStatus, normalizeSupplierName, supplierAliases } from '../src/lib/frameworkCatalogue';

const BASE_URL = 'https://www-v17.procurementservices.co.uk';
const INDEX_URL = `${BASE_URL}/our-solutions/frameworks`;
const OUTPUT = path.resolve(process.cwd(), 'data/procurement-services-catalogue.json');
const AUDIT_OUTPUT = path.resolve(process.cwd(), 'data/procurement-services-catalogue-audit.json');

function isoDate(text: string): string | null {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value) return null;
  const parsed = Date.parse(`${value} 12:00:00 UTC`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function mapStatus(text: string): FrameworkStatus {
  const value = text.trim().toLowerCase();
  if (value.includes('coming')) return 'coming_soon';
  if (value.includes('expir')) return 'expiring';
  if (value.includes('active')) return 'active';
  return 'expired';
}

async function fetchHtml(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'PS-Awards-Scanner catalogue audit/1.0' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

async function detailData(url: string): Promise<Pick<FrameworkRecord, 'start_date' | 'expiry_date' | 'suppliers'>> {
  const html = await fetchHtml(url);
  const $ = load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const period = bodyText.match(/Framework Period:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*-\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  const supplierRows = $('#suppliers-tab-pane dd').map((_, element) => {
    const name = $(element).find('a').first().text().replace(/\s+/g, ' ').trim() || $(element).text().replace(/\s+/g, ' ').trim();
    const lots: string[] = [];
    const list = $(element).closest('dl');
    const label = (list.find('dt').first().text() || list.prevAll('h2,h3,h4,h5,dt').first().text()).replace(/\s+/g, ' ').trim();
    if (/\blot\b/i.test(label)) lots.push(label);
    return { name, normalized_name: normalizeSupplierName(name), aliases: supplierAliases(name), lots };
  }).get().filter(supplier => supplier.name);
  const suppliers = [...supplierRows.reduce((byName, supplier) => {
    const existing = byName.get(supplier.normalized_name);
    if (existing) existing.lots = [...new Set([...existing.lots, ...supplier.lots])].sort();
    else byName.set(supplier.normalized_name, supplier);
    return byName;
  }, new Map<string, typeof supplierRows[number]>()).values()];
  return {
    start_date: isoDate(period?.[1] ?? ''),
    expiry_date: isoDate(period?.[2] ?? ''),
    suppliers,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function refreshFrameworkCatalogue(): Promise<{ catalogue: FrameworkCatalogue; audit: Record<string, unknown> }> {
  const previous = JSON.parse(await readFile(OUTPUT, 'utf8')) as FrameworkCatalogue;
  const html = await fetchHtml(INDEX_URL);
  const $ = load(html);
  const generatedAt = new Date().toISOString();
  const approvedText = $('.framework-counts').text().match(/Approved Suppliers:\s*(\d+)/i)?.[1];
  const cards = $('.frameworks-list .card').map((_, element) => {
    const card = $(element);
    const id = card.find('.card-text strong').first().text().trim().toUpperCase();
    const name = card.find('.card-title').text().replace(/\s+/g, ' ').trim();
    const href = card.find('.card-title a').attr('href') ?? '';
    const expiryText = card.find('p').filter((_, p) => /Expiry Date/i.test($(p).text())).find('strong').text();
    return {
      id, name, source_status: mapStatus(card.find('.badge').text()),
      expiry_date: isoDate(expiryText),
      url: href && href !== '#' ? new URL(href, BASE_URL).toString() : null,
    };
  }).get().filter(item => item.id && item.name);

  if (cards.length < 45) throw new Error(`Safety check failed: official page yielded only ${cards.length} frameworks`);
  const current = await mapLimit(cards, 5, async card => {
    const detail = card.url ? await detailData(card.url) : { start_date: null, expiry_date: null, suppliers: [] };
    return {
      ...card,
      start_date: detail.start_date,
      expiry_date: detail.expiry_date ?? card.expiry_date,
      suppliers: detail.suppliers,
      last_seen_at: generatedAt,
    } satisfies FrameworkRecord;
  });

  const currentIds = new Set(current.map(framework => framework.id));
  const retired = previous.frameworks
    .filter(framework => !currentIds.has(framework.id))
    .map(framework => ({ ...framework, source_status: 'expired' as const }));
  const frameworks = [...current, ...retired].sort((a, b) => a.id.localeCompare(b.id));
  const previousById = new Map(previous.frameworks.map(framework => [framework.id, framework]));
  const added = current.filter(framework => !previousById.has(framework.id)).map(framework => framework.id);
  const removed = previous.frameworks.filter(framework => !currentIds.has(framework.id) && framework.source_status !== 'expired').map(framework => framework.id);
  const changed = current.filter(framework => {
    const old = previousById.get(framework.id);
    return old && (old.name !== framework.name || old.source_status !== framework.source_status || old.expiry_date !== framework.expiry_date || JSON.stringify(old.suppliers) !== JSON.stringify(framework.suppliers));
  }).map(framework => framework.id);
  const catalogue: FrameworkCatalogue = {
    generated_at: generatedAt,
    source_url: INDEX_URL,
    approved_supplier_count: approvedText ? Number(approvedText) : null,
    frameworks,
  };
  const audit = {
    generated_at: generatedAt,
    source_url: INDEX_URL,
    current_frameworks: current.length,
    preserved_expired_frameworks: retired.length,
    framework_supplier_memberships: current.reduce((sum, framework) => sum + framework.suppliers.length, 0),
    unique_suppliers: new Set(current.flatMap(framework => framework.suppliers.map(supplier => supplier.normalized_name))).size,
    added, removed, changed,
    frameworks_without_supplier_data: current.filter(framework => framework.source_status !== 'coming_soon' && framework.suppliers.length === 0).map(framework => framework.id),
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(catalogue, null, 2)}\n`);
  await writeFile(AUDIT_OUTPUT, `${JSON.stringify(audit, null, 2)}\n`);
  return { catalogue, audit };
}

if (process.argv[1]?.includes('refresh-framework-catalogue')) {
  refreshFrameworkCatalogue()
    .then(({ audit }) => console.log(JSON.stringify(audit, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

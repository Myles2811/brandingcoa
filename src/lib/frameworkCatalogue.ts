import catalogueData from '../../data/procurement-services-catalogue.json';

export type FrameworkStatus = 'active' | 'expiring' | 'expired' | 'coming_soon';

export interface FrameworkSupplier {
  name: string;
  normalized_name: string;
  aliases: string[];
  lots: string[];
}

export interface FrameworkRecord {
  id: string;
  name: string;
  source_status: FrameworkStatus;
  start_date: string | null;
  expiry_date: string | null;
  url: string | null;
  suppliers: FrameworkSupplier[];
  last_seen_at: string;
}

export interface FrameworkCatalogue {
  generated_at: string;
  source_url: string;
  approved_supplier_count: number | null;
  frameworks: FrameworkRecord[];
}

const catalogue = catalogueData as FrameworkCatalogue;
const frameworksById = new Map(catalogue.frameworks.map(framework => [framework.id.toUpperCase(), framework]));

const LEGAL_SUFFIXES = new Set([
  'limited', 'ltd', 'plc', 'llp', 'inc', 'incorporated', 'company', 'co',
]);

/** Stable supplier comparison form; intentionally keeps the meaningful trading name. */
export function normalizeSupplierName(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/\b(?:trading\s+as|t\s*\/?\s*a)\b.*$/i, '')
    .replace(/&/g, ' and ')
    .replace(/\b(?:the|uk|u\.k\.)\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words.at(-1)!)) words.pop();
  return words.join(' ');
}

export function supplierAliases(name: string): string[] {
  const variants = new Set<string>([name.trim()]);
  const trading = name.split(/\b(?:trading\s+as|t\s*\/?\s*a)\b/i).map(value => value.trim()).filter(Boolean);
  for (const value of trading) variants.add(value);
  const withoutParenthetical = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (withoutParenthetical) variants.add(withoutParenthetical);
  return [...new Set([...variants].map(normalizeSupplierName).filter(Boolean))];
}

function dateOnly(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T23:59:59Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Effective status wins over a stale website badge once a framework has expired. */
export function frameworkStatusAt(framework: FrameworkRecord, at: string | Date = new Date()): FrameworkStatus {
  const timestamp = typeof at === 'string' ? Date.parse(at) : at.getTime();
  const expiry = dateOnly(framework.expiry_date);
  if (expiry !== null && timestamp > expiry) return 'expired';
  // A retired catalogue entry was still active when historical awards pre-date its expiry.
  if (framework.source_status === 'expired' && expiry !== null) {
    return expiry - timestamp <= 1000 * 60 * 60 * 24 * 92 ? 'expiring' : 'active';
  }
  if (framework.source_status === 'coming_soon') return 'coming_soon';
  if (framework.source_status === 'expired') return 'expired';
  if (framework.source_status === 'expiring') return 'expiring';
  if (expiry !== null && expiry - timestamp <= 1000 * 60 * 60 * 24 * 92) return 'expiring';
  return 'active';
}

export function getFramework(id: string): FrameworkRecord | undefined {
  return frameworksById.get(id.toUpperCase());
}

export function getKnownFrameworkIds(): string[] {
  return catalogue.frameworks.map(framework => framework.id);
}

export function getCurrentFrameworkIds(at: string | Date = new Date()): string[] {
  return catalogue.frameworks
    .filter(framework => ['active', 'expiring'].includes(frameworkStatusAt(framework, at)))
    .map(framework => framework.id);
}

export interface SupplierFrameworkSupport {
  framework_id: string;
  framework_name: string;
  status: FrameworkStatus;
  lots: string[];
  matched_supplier: string;
}

/** Supporting signal only. Callers must never promote a notice using this result alone. */
export function findSupplierFrameworkSupport(
  supplierName: string,
  at: string | Date = new Date(),
): SupplierFrameworkSupport[] {
  const aliases = new Set(supplierAliases(supplierName));
  if (aliases.size === 0) return [];
  const results: SupplierFrameworkSupport[] = [];
  for (const framework of catalogue.frameworks) {
    const matched = framework.suppliers.find(supplier =>
      supplier.aliases.some(alias => aliases.has(alias)) || aliases.has(supplier.normalized_name)
    );
    if (matched) {
      results.push({
        framework_id: framework.id,
        framework_name: framework.name,
        status: frameworkStatusAt(framework, at),
        lots: matched.lots,
        matched_supplier: matched.name,
      });
    }
  }
  return results;
}

export const procurementServicesCatalogue = catalogue;

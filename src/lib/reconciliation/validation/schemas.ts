import { normalizeSupplierName } from '../../frameworkCatalogue';

export function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export function nullableText(value: unknown): string | null {
  return text(value) || null;
}

export function canonicalOrganisation(value: unknown): string {
  return text(value)
    .normalize('NFKD')
    .replace(/&/g, ' and ')
    .replace(/\b(?:the)\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function canonicalSupplier(value: unknown): string {
  return normalizeSupplierName(text(value));
}

export function frameworkReference(value: unknown): string | null {
  const raw = text(value).toUpperCase();
  const match = raw.match(/\b(?:Y\d{5}|TPPL[A-Z0-9]+|PS[A-Z0-9-]{3,})\b/);
  return match?.[0] ?? null;
}

export function isoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 20_000 && value < 80_000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86_400_000).toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (!raw) return null;
  const uk = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (uk) {
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

export function decimal(value: unknown): string | null {
  if (value === null || value === undefined || text(value) === '') return null;
  const negative = /^\s*\(/.test(String(value));
  const cleaned = String(value).replace(/[£$€,()%\s]/g, '').replace(/,/g, '');
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return `${negative ? -number : number}`;
}

export function rebateRate(value: unknown): string | null {
  const parsed = decimal(value);
  if (parsed === null) return null;
  let rate = Number(parsed);
  if (String(value).includes('%') || Math.abs(rate) > 0.2) rate /= 100;
  return rate >= 0 && rate <= 1 ? String(rate) : null;
}

export function nonNegativeInteger(value: unknown, fallback: number | null): number | null {
  const parsed = Number(text(value));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function stableRecordId(prefix: string, snapshotId: string, sheet: string, row: number): string {
  return `${prefix}:${snapshotId}:${encodeURIComponent(sheet)}:${row}`;
}

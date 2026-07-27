export interface WorkbookRow {
  rowNumber: number;
  values: unknown[];
}

export type ColumnAliases<T extends string> = Record<T, readonly string[]>;

export interface HeaderDetection<T extends string> {
  headerRow: WorkbookRow;
  columns: Partial<Record<T, number>>;
  score: number;
  missingRequired: T[];
  ambiguous: boolean;
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9%]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function detectOnRow<T extends string>(
  row: WorkbookRow,
  aliases: ColumnAliases<T>,
  required: readonly T[],
): HeaderDetection<T> {
  const normalized = row.values.map(normalizeHeader);
  const columns: Partial<Record<T, number>> = {};
  for (const field of Object.keys(aliases) as T[]) {
    const accepted = new Set(aliases[field].map(normalizeHeader));
    const index = normalized.findIndex(value => accepted.has(value));
    if (index >= 0) columns[field] = index;
  }
  const matched = Object.keys(columns).length;
  const requiredMatched = required.filter(field => columns[field] !== undefined).length;
  const missingRequired = required.filter(field => columns[field] === undefined);
  return {
    headerRow: row,
    columns,
    score: requiredMatched * 100 + matched,
    missingRequired,
    ambiguous: false,
  };
}

/** Searches the first 50 populated rows, not merely physical rows 1-50. */
export function detectHeaderRow<T extends string>(
  rows: WorkbookRow[],
  aliases: ColumnAliases<T>,
  required: readonly T[],
): HeaderDetection<T> | null {
  const populated = rows.filter(row => row.values.some(value => normalizeHeader(value))).slice(0, 50);
  const ranked = populated
    .map(row => detectOnRow(row, aliases, required))
    .sort((a, b) => b.score - a.score || a.headerRow.rowNumber - b.headerRow.rowNumber);
  const best = ranked[0];
  if (!best || best.score < required.length * 100) return null;
  best.ambiguous = ranked.length > 1 && ranked[1].score === best.score;
  return best;
}

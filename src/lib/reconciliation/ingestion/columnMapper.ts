import { HeaderDetection, WorkbookRow } from './headerDetector';

export function mappedValue<T extends string>(
  row: WorkbookRow,
  detection: HeaderDetection<T>,
  field: T,
): unknown {
  const index = detection.columns[field];
  return index === undefined ? undefined : row.values[index];
}

export function dataRowsAfterHeader(rows: WorkbookRow[], headerRowNumber: number): WorkbookRow[] {
  return rows.filter(row =>
    row.rowNumber > headerRowNumber && row.values.some(value => String(value ?? '').trim() !== '')
  );
}

export function isRepeatedHeader<T extends string>(row: WorkbookRow, detection: HeaderDetection<T>): boolean {
  let matches = 0;
  for (const index of Object.values(detection.columns) as number[]) {
    const header = String(detection.headerRow.values[index] ?? '').trim().toLowerCase();
    const value = String(row.values[index] ?? '').trim().toLowerCase();
    if (header && value === header) matches++;
  }
  return matches >= Math.max(2, Math.floor(Object.keys(detection.columns).length / 2));
}

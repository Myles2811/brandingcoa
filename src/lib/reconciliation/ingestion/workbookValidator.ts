import * as XLSX from 'xlsx';
import { WorkbookRow } from './headerDetector';
import { ValidationIssue } from '../types';

export interface LocalWorksheet {
  name: string;
  hidden: boolean;
  rows: WorkbookRow[];
}

export function readWorkbookUsedRanges(buffer: Buffer): LocalWorksheet[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: true });
  return workbook.SheetNames.flatMap((name, sheetIndex) => {
    const sheet = workbook.Sheets[name];
    if (!sheet?.['!ref']) return [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rows: WorkbookRow[] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const values: unknown[] = [];
      let populated = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const value = cell?.v ?? null;
        values.push(value);
        if (value !== null && value !== undefined && String(value).trim() !== '') populated = true;
      }
      if (populated) rows.push({ rowNumber: r + 1, values });
    }
    const visibility = workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden ?? 0;
    return [{ name, hidden: visibility !== 0, rows }];
  });
}

export function missingHeaderIssue(
  workbook: ValidationIssue['workbook'],
  worksheet: string,
  requiredLabels: string[],
): ValidationIssue {
  return {
    workbook,
    worksheet,
    code: 'HEADER_NOT_FOUND',
    message: `No header row containing required columns was found in the first 50 populated rows (${requiredLabels.join(', ')}).`,
    fatal: true,
  };
}

export function rowIssue(
  workbook: ValidationIssue['workbook'], worksheet: string, row: number,
  code: string, message: string, fatal = false,
): ValidationIssue {
  return { workbook, worksheet, row, code, message, fatal };
}

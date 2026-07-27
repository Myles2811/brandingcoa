import * as XLSX from 'xlsx';
import { WorkbookMetadata } from '../../../src/lib/reconciliation/types';

function workbookBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function metadata(name: string): WorkbookMetadata {
  return { itemId: name, name, eTag: 'fixture', lastModifiedDateTime: '2026-07-01T00:00:00Z', size: null, snapshotId: `fixture-${name}` };
}

export const frameworkRulesWorkbook = workbookBuffer({
  Cover: [['Framework Rules'], ['Generated for deterministic tests']],
  Rules: [
    ['Framework configuration'],
    [],
    ['Do not edit calculated cells'],
    ['Y Number', 'Framework Name', 'Category', 'Rebate Fee %', 'Reporting Frequency', 'Reporting Lag Days', 'Grace Days'],
    ['Y23065', 'Software Products', 'Technology', 0.02, 'Monthly', 30, 5],
    ['Y23030', 'Audit Services', 'Professional', '1%', 'Monthly', 30, 0],
  ],
});

export const rebateCheckWorkbook = workbookBuffer({
  Rebate_Log: [
    ['Rebate Check Log 2026'],
    ['Internal working document'],
    [],
    ['Organisation', 'Supplier Name', 'Framework Reference', 'COA Status', 'CAA Status', 'Rebate Status', 'Order Value', 'Expected Rebate', 'Award Date', 'Notes'],
    ['Example Council', 'Example Ltd', 'Y23065', 'Completed', 'Approved', 'Reported', 10000, 200, '2026-01-10', 'Expected match'],
    ['No Spend Council', 'Supplier B Ltd', 'Y23030', 'Completed', 'Approved', 'Awaiting', 5000, 50, '2026-01-15', 'Overdue'],
    ['Future Council', 'Supplier C Ltd', 'Y23065', 'Completed', 'Approved', 'Not due', 8000, 160, '2026-06-20', 'Within reporting window'],
    ['Mismatch Council', 'Supplier D Ltd', 'Y23065', 'Completed', 'Approved', 'Reported', 1000, 20, '2026-01-12', 'Wrong rebate'],
    ['Matched Council', 'Supplier E Ltd', 'Y23065', 'Completed', 'Approved', 'Reported', 1000, 20, '2026-01-12', 'Correct rebate'],
  ],
});

export const invoiceSpendWorkbook = workbookBuffer({
  Jan_2026: [
    ['Supplier submissions'],
    [],
    ['Supplier', 'Customer Organisation', 'Framework Ref', 'Supplier Spend', 'Reported Rebate', 'Period Start', 'Period End', 'Invoice Status', 'Invoice Number'],
    ['Example Limited', 'Example Council', 'Y23065', 10000, 200, '2026-01-01', '2026-01-31', 'Invoiced', 'INV-1'],
    ['Supplier D Ltd', 'Mismatch Council', 'Y23065', 1000, 10, '2026-01-01', '2026-01-31', 'Invoiced', 'INV-2'],
    ['Supplier E Limited', 'Matched Council', 'Y23065', 1000, 20, '2026-01-01', '2026-01-31', 'Invoiced', 'INV-3'],
    ['Supplier G Ltd', 'Unknown Council', 'Y23065', 500, 10, '2026-01-01', '2026-01-31', 'Invoiced', 'INV-4'],
  ],
});

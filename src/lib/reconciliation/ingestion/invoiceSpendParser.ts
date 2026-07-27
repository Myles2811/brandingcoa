import { InvoiceSpendRecord, ParsedWorkbook, ValidationIssue, WorkbookMetadata } from '../types';
import { ColumnAliases, detectHeaderRow } from './headerDetector';
import { dataRowsAfterHeader, isRepeatedHeader, mappedValue } from './columnMapper';
import { missingHeaderIssue, readWorkbookUsedRanges, rowIssue } from './workbookValidator';
import { canonicalOrganisation, canonicalSupplier, decimal, frameworkReference, isoDate, nullableText, stableRecordId, text } from '../validation/schemas';

type Field = 'supplier' | 'customer' | 'framework' | 'category' | 'periodStart' | 'periodEnd' | 'period' | 'spend' | 'rebate' | 'invoiceStatus' | 'invoiceReference' | 'comments';
const ALIASES: ColumnAliases<Field> = {
  supplier: ['supplier', 'supplier name', 'vendor', 'contractor'],
  customer: ['customer', 'customer organisation', 'organisation', 'organization', 'buyer', 'authority'],
  framework: ['framework', 'framework reference', 'framework ref', 'framework number', 'y number', 'category/framework'],
  category: ['category', 'spend category', 'framework category'],
  periodStart: ['period start', 'reporting period start', 'from date', 'start date'],
  periodEnd: ['period end', 'reporting period end', 'to date', 'end date'],
  period: ['period', 'reporting period', 'month', 'reporting month'],
  spend: ['spend', 'supplier spend', 'spend amount', 'invoice value', 'net spend', 'total spend'],
  rebate: ['rebate', 'reported rebate', 'rebate amount', 'rebate value'],
  invoiceStatus: ['invoice status', 'status', 'rebate status'],
  invoiceReference: ['invoice reference', 'invoice ref', 'invoice number', 'invoice no'],
  comments: ['comments', 'comment', 'notes', 'remarks'],
};
const REQUIRED: Field[] = ['supplier', 'framework', 'spend'];

export function parseInvoiceSpendWorkbook(buffer: Buffer, metadata: WorkbookMetadata): ParsedWorkbook<InvoiceSpendRecord> {
  const sheets = readWorkbookUsedRanges(buffer);
  const records: InvoiceSpendRecord[] = [];
  const issues: ValidationIssue[] = [];
  let validSheets = 0;
  for (const sheet of sheets) {
    const header = detectHeaderRow(sheet.rows, ALIASES, REQUIRED);
    if (!header) continue;
    validSheets++;
    if (header.ambiguous) issues.push(rowIssue('invoice_spreadsheet', sheet.name, header.headerRow.rowNumber, 'AMBIGUOUS_HEADER', 'Multiple rows have the same header score.', true));
    for (const row of dataRowsAfterHeader(sheet.rows, header.headerRow.rowNumber)) {
      if (isRepeatedHeader(row, header)) continue;
      const supplierRaw = text(mappedValue(row, header, 'supplier'));
      const frameworkRaw = text(mappedValue(row, header, 'framework'));
      const spendAmount = decimal(mappedValue(row, header, 'spend'));
      if (!supplierRaw && !frameworkRaw && spendAmount === null) continue;
      if (!supplierRaw || !frameworkRaw || spendAmount === null) {
        issues.push(rowIssue('invoice_spreadsheet', sheet.name, row.rowNumber, 'INVALID_INVOICE_ROW', 'Supplier, framework and a numeric spend amount are required.'));
        continue;
      }
      const customerRaw = nullableText(mappedValue(row, header, 'customer'));
      const singlePeriod = mappedValue(row, header, 'period');
      records.push({
        id: stableRecordId('invoice', metadata.snapshotId, sheet.name, row.rowNumber),
        supplierRaw, supplierCanonical: canonicalSupplier(supplierRaw),
        customerRaw, customerCanonical: customerRaw ? canonicalOrganisation(customerRaw) : null,
        frameworkRaw, frameworkReference: frameworkReference(frameworkRaw),
        category: nullableText(mappedValue(row, header, 'category')),
        reportingPeriodStart: isoDate(mappedValue(row, header, 'periodStart')) ?? isoDate(singlePeriod),
        reportingPeriodEnd: isoDate(mappedValue(row, header, 'periodEnd')) ?? isoDate(singlePeriod),
        spendAmount,
        reportedRebate: decimal(mappedValue(row, header, 'rebate')),
        invoiceStatus: nullableText(mappedValue(row, header, 'invoiceStatus')),
        invoiceReference: nullableText(mappedValue(row, header, 'invoiceReference')),
        comments: nullableText(mappedValue(row, header, 'comments')),
        sourceSnapshotId: metadata.snapshotId, sourceWorksheet: sheet.name, sourceRow: row.rowNumber,
      });
    }
  }
  if (validSheets === 0) issues.push(missingHeaderIssue('invoice_spreadsheet', '(all worksheets)', REQUIRED));
  if (records.length === 0) issues.push({ workbook: 'invoice_spreadsheet', code: 'NO_VALID_RECORDS', message: 'No valid supplier-spend records were parsed.', fatal: true });
  return { metadata, records, issues, worksheets: sheets.map(sheet => sheet.name) };
}

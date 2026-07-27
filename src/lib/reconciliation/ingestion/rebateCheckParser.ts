import { ParsedWorkbook, RebateCheckRecord, ValidationIssue, WorkbookMetadata } from '../types';
import { ColumnAliases, detectHeaderRow } from './headerDetector';
import { dataRowsAfterHeader, isRepeatedHeader, mappedValue } from './columnMapper';
import { missingHeaderIssue, readWorkbookUsedRanges, rowIssue } from './workbookValidator';
import { canonicalOrganisation, canonicalSupplier, decimal, frameworkReference, isoDate, nullableText, stableRecordId, text } from '../validation/schemas';

type Field = 'customer' | 'supplier' | 'framework' | 'coaStatus' | 'caaStatus' | 'rebateStatus' | 'notes' | 'orderValue' | 'expectedRebate' | 'awardDate' | 'externalReference';
const ALIASES: ColumnAliases<Field> = {
  customer: ['customer', 'customer organisation', 'organisation', 'organization', 'buyer', 'authority', 'contracting authority'],
  supplier: ['supplier', 'supplier name', 'vendor', 'contractor'],
  framework: ['framework', 'framework reference', 'framework ref', 'framework number', 'y number', 'category/framework'],
  coaStatus: ['coa status', 'confirmation of award status', 'coa'],
  caaStatus: ['caa status', 'customer access agreement status', 'caa'],
  rebateStatus: ['rebate status', 'missing rebate status', 'rebate/invoice status'],
  notes: ['notes', 'comments', 'comment', 'remarks'],
  orderValue: ['order value', 'contract value', 'award value', 'value'],
  expectedRebate: ['expected rebate', 'rebate expected', 'calculated rebate'],
  awardDate: ['award date', 'date awarded', 'contract award date'],
  externalReference: ['external reference', 'award reference', 'notice reference', 'contract reference', 'coa reference'],
};
const REQUIRED: Field[] = ['customer', 'supplier', 'framework', 'coaStatus'];

export function parseRebateCheckWorkbook(buffer: Buffer, metadata: WorkbookMetadata): ParsedWorkbook<RebateCheckRecord> {
  const sheets = readWorkbookUsedRanges(buffer);
  const records: RebateCheckRecord[] = [];
  const issues: ValidationIssue[] = [];
  let validSheets = 0;
  for (const sheet of sheets) {
    const header = detectHeaderRow(sheet.rows, ALIASES, REQUIRED);
    if (!header) continue;
    validSheets++;
    if (header.ambiguous) issues.push(rowIssue('rebate_check_log', sheet.name, header.headerRow.rowNumber, 'AMBIGUOUS_HEADER', 'Multiple rows have the same header score.', true));
    for (const row of dataRowsAfterHeader(sheet.rows, header.headerRow.rowNumber)) {
      if (isRepeatedHeader(row, header)) continue;
      const customerRaw = text(mappedValue(row, header, 'customer'));
      const supplierRaw = text(mappedValue(row, header, 'supplier'));
      const frameworkRaw = text(mappedValue(row, header, 'framework'));
      if (!customerRaw && !supplierRaw && !frameworkRaw) continue;
      if (!customerRaw || !supplierRaw || !frameworkRaw) {
        issues.push(rowIssue('rebate_check_log', sheet.name, row.rowNumber, 'INVALID_REBATE_CHECK_ROW', 'Customer, supplier and framework are required.'));
        continue;
      }
      records.push({
        id: stableRecordId('rebate', metadata.snapshotId, sheet.name, row.rowNumber),
        externalReference: nullableText(mappedValue(row, header, 'externalReference')),
        customerRaw, customerCanonical: canonicalOrganisation(customerRaw),
        supplierRaw, supplierCanonical: canonicalSupplier(supplierRaw),
        frameworkRaw, frameworkReference: frameworkReference(frameworkRaw),
        coaStatus: nullableText(mappedValue(row, header, 'coaStatus')),
        caaStatus: nullableText(mappedValue(row, header, 'caaStatus')),
        rebateStatus: nullableText(mappedValue(row, header, 'rebateStatus')),
        orderValue: decimal(mappedValue(row, header, 'orderValue')),
        expectedRebate: decimal(mappedValue(row, header, 'expectedRebate')),
        notes: nullableText(mappedValue(row, header, 'notes')),
        awardDate: isoDate(mappedValue(row, header, 'awardDate')),
        sourceSnapshotId: metadata.snapshotId, sourceWorksheet: sheet.name, sourceRow: row.rowNumber,
      });
    }
  }
  if (validSheets === 0) issues.push(missingHeaderIssue('rebate_check_log', '(all worksheets)', REQUIRED));
  if (records.length === 0) issues.push({ workbook: 'rebate_check_log', code: 'NO_VALID_RECORDS', message: 'No valid rebate-check records were parsed.', fatal: true });
  return { metadata, records, issues, worksheets: sheets.map(sheet => sheet.name) };
}

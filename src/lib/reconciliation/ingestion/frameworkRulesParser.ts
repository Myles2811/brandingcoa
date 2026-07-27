import { FrameworkRule, ParsedWorkbook, WorkbookMetadata, ValidationIssue } from '../types';
import { detectHeaderRow, ColumnAliases } from './headerDetector';
import { dataRowsAfterHeader, isRepeatedHeader, mappedValue } from './columnMapper';
import { missingHeaderIssue, readWorkbookUsedRanges, rowIssue } from './workbookValidator';
import { decimal, frameworkReference, isoDate, nonNegativeInteger, nullableText, rebateRate, stableRecordId, text } from '../validation/schemas';

type Field = 'frameworkReference' | 'frameworkName' | 'category' | 'rebateRate' | 'validFrom' | 'validTo' | 'reportingFrequency' | 'reportingLagDays' | 'graceDays';
const ALIASES: ColumnAliases<Field> = {
  frameworkReference: ['framework reference', 'framework ref', 'framework number', 'framework id', 'y number', 'y-number', 'reference'],
  frameworkName: ['framework name', 'official framework name', 'framework', 'agreement name'],
  category: ['category', 'framework category', 'lot category'],
  rebateRate: ['rebate fee percentage', 'rebate fee %', 'rebate percentage', 'rebate %', 'rebate rate', 'fee percentage', 'fee %'],
  validFrom: ['valid from', 'start date', 'framework start', 'framework start date', 'effective from'],
  validTo: ['valid to', 'end date', 'expiry date', 'framework end', 'framework end date', 'effective to'],
  reportingFrequency: ['reporting frequency', 'reporting period', 'reporting cycle', 'invoice frequency', 'frequency'],
  reportingLagDays: ['reporting lag days', 'reporting window days', 'days to report', 'due days'],
  graceDays: ['grace days', 'grace period days'],
};
const REQUIRED: Field[] = ['frameworkReference', 'frameworkName', 'rebateRate'];

function frequency(value: unknown): FrameworkRule['reportingFrequency'] {
  const normalized = text(value).toLowerCase();
  if (/month/.test(normalized)) return 'monthly';
  if (/quarter/.test(normalized)) return 'quarterly';
  if (/annual|year/.test(normalized)) return 'annual';
  return 'unknown';
}

export function parseFrameworkRulesWorkbook(buffer: Buffer, metadata: WorkbookMetadata): ParsedWorkbook<FrameworkRule> {
  const sheets = readWorkbookUsedRanges(buffer);
  const records: FrameworkRule[] = [];
  const issues: ValidationIssue[] = [];
  let validSheets = 0;
  for (const sheet of sheets) {
    const header = detectHeaderRow(sheet.rows, ALIASES, REQUIRED);
    if (!header) continue;
    validSheets++;
    if (header.ambiguous) issues.push(rowIssue('framework_rules', sheet.name, header.headerRow.rowNumber, 'AMBIGUOUS_HEADER', 'Multiple rows have the same header score.', true));
    for (const row of dataRowsAfterHeader(sheet.rows, header.headerRow.rowNumber)) {
      if (isRepeatedHeader(row, header)) continue;
      const reference = frameworkReference(mappedValue(row, header, 'frameworkReference'));
      const name = text(mappedValue(row, header, 'frameworkName'));
      const rawRate = mappedValue(row, header, 'rebateRate');
      const rate = rebateRate(rawRate) ?? (/\b(?:tbc|pending|to be confirmed)\b/i.test(text(rawRate)) ? 'TBC' : null);
      if (!reference && !name && rate === null) continue;
      if (!reference || !name || rate === null) {
        issues.push(rowIssue('framework_rules', sheet.name, row.rowNumber, 'INVALID_RULE_ROW', 'Framework reference, name and a valid rebate percentage are required.'));
        continue;
      }
      records.push({
        id: stableRecordId('rule', metadata.snapshotId, sheet.name, row.rowNumber),
        frameworkReference: reference,
        frameworkName: name,
        category: nullableText(mappedValue(row, header, 'category')),
        rebateRate: rate,
        validFrom: isoDate(mappedValue(row, header, 'validFrom')),
        validTo: isoDate(mappedValue(row, header, 'validTo')),
        reportingFrequency: frequency(mappedValue(row, header, 'reportingFrequency')),
        reportingLagDays: nonNegativeInteger(mappedValue(row, header, 'reportingLagDays'), null),
        graceDays: nonNegativeInteger(mappedValue(row, header, 'graceDays'), 0) ?? 0,
        sourceSnapshotId: metadata.snapshotId,
        sourceWorksheet: sheet.name,
        sourceRow: row.rowNumber,
      });
    }
  }
  if (validSheets === 0) issues.push(missingHeaderIssue('framework_rules', '(all worksheets)', REQUIRED,));
  if (records.length === 0) issues.push({ workbook: 'framework_rules', code: 'NO_VALID_RECORDS', message: 'No valid framework rules were parsed.', fatal: true });
  // Explicitly touch decimal here so malformed numeric imports are caught by the same module contract.
  void decimal;
  return { metadata, records, issues, worksheets: sheets.map(sheet => sheet.name) };
}

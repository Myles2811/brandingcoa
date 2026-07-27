import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrameworkRulesWorkbook } from '../../src/lib/reconciliation/ingestion/frameworkRulesParser';
import { parseRebateCheckWorkbook } from '../../src/lib/reconciliation/ingestion/rebateCheckParser';
import { parseInvoiceSpendWorkbook } from '../../src/lib/reconciliation/ingestion/invoiceSpendParser';
import { frameworkRulesWorkbook, invoiceSpendWorkbook, metadata, rebateCheckWorkbook } from './fixtures/workbooks';

test('parsers discover sheets, headers after preambles and source row lineage', () => {
  const rules = parseFrameworkRulesWorkbook(frameworkRulesWorkbook, metadata('rules.xlsx'));
  const rebates = parseRebateCheckWorkbook(rebateCheckWorkbook, metadata('rebates.xlsx'));
  const invoices = parseInvoiceSpendWorkbook(invoiceSpendWorkbook, metadata('invoices.xlsx'));

  assert.equal(rules.records.length, 2);
  assert.equal(rebates.records.length, 5);
  assert.equal(invoices.records.length, 4);
  assert.equal(rules.records[0].sourceWorksheet, 'Rules');
  assert.equal(rules.records[0].sourceRow, 5);
  assert.equal(rebates.records[0].sourceRow, 5);
  assert.equal(invoices.records[0].sourceRow, 4);
  assert.equal(rules.records[0].rebateRate, '0.02');
  assert.equal(invoices.records[0].supplierCanonical, 'example');
  assert.ok(![...rules.issues, ...rebates.issues, ...invoices.issues].some(issue => issue.fatal));
});

test('missing required workbook headers produces a fatal validation issue', () => {
  const invalid = Buffer.from(frameworkRulesWorkbook);
  // An invoice workbook cannot satisfy the framework-rules schema.
  const parsed = parseFrameworkRulesWorkbook(invoiceSpendWorkbook, metadata('invalid.xlsx'));
  assert.ok(parsed.issues.some(issue => issue.fatal && issue.code === 'HEADER_NOT_FOUND'));
  assert.ok(invalid.length > 0);
});

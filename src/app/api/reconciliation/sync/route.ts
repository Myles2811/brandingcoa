export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { GraphClient } from '@/lib/reconciliation/graph/client';
import { resolveGraphWorkbookConfig } from '@/lib/reconciliation/graph/driveItems';
import { downloadWorkbook } from '@/lib/reconciliation/graph/workbookDownloader';
import { parseFrameworkRulesWorkbook } from '@/lib/reconciliation/ingestion/frameworkRulesParser';
import { parseRebateCheckWorkbook } from '@/lib/reconciliation/ingestion/rebateCheckParser';
import { parseInvoiceSpendWorkbook } from '@/lib/reconciliation/ingestion/invoiceSpendParser';
import { reconciliationAuthError } from '@/lib/reconciliation/auth';
import { completeSyncRun, createReconciliationRun, failReconciliationRun } from '@/lib/reconciliation/store';

export async function POST(request: NextRequest) {
  const authError = reconciliationAuthError(request);
  if (authError) return authError;
  let runId: string | null = null;
  try {
    runId = await createReconciliationRun('sync');
    const client = GraphClient.fromEnvironment();
    const { siteId, driveId, itemIds } = await resolveGraphWorkbookConfig(client);
    const [rulesFile, rebateFile, invoiceFile] = await Promise.all([
      downloadWorkbook(client, driveId, itemIds.frameworkRules),
      downloadWorkbook(client, driveId, itemIds.rebateCheckLog),
      downloadWorkbook(client, driveId, itemIds.invoiceSpreadsheet),
    ]);
    const frameworkRules = parseFrameworkRulesWorkbook(rulesFile.buffer, rulesFile.metadata);
    const rebateChecks = parseRebateCheckWorkbook(rebateFile.buffer, rebateFile.metadata);
    const invoiceSpend = parseInvoiceSpendWorkbook(invoiceFile.buffer, invoiceFile.metadata);
    const issues = [...frameworkRules.issues, ...rebateChecks.issues, ...invoiceSpend.issues];
    const complete = !issues.some(issue => issue.fatal);
    const counts = {
      frameworkRules: frameworkRules.records.length,
      rebateCheckRecords: rebateChecks.records.length,
      invoiceSpendRecords: invoiceSpend.records.length,
    };
    await completeSyncRun(runId, complete, {
      frameworkRules: frameworkRules.metadata.snapshotId,
      rebateCheckLog: rebateChecks.metadata.snapshotId,
      invoiceSpreadsheet: invoiceSpend.metadata.snapshotId,
    }, counts, issues);
    return NextResponse.json({
      run_id: runId,
      complete,
      site_id: siteId,
      drive_id: driveId,
      synced_at: new Date().toISOString(),
      workbooks: { framework_rules: frameworkRules, rebate_check_log: rebateChecks, invoice_spreadsheet: invoiceSpend },
      counts: {
        framework_rules: counts.frameworkRules,
        rebate_check_records: counts.rebateCheckRecords,
        invoice_spend_records: counts.invoiceSpendRecords,
      },
      issues,
    }, { status: complete ? 200 : 422, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (runId) await failReconciliationRun(runId, error).catch(persistError =>
      console.error('[Reconciliation] Failed to persist sync failure:', persistError)
    );
    return NextResponse.json({ complete: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

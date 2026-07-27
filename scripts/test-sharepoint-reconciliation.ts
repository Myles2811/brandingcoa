import { GraphClient } from '../src/lib/reconciliation/graph/client';
import { downloadWorkbook, DownloadedWorkbook } from '../src/lib/reconciliation/graph/workbookDownloader';
import { getDriveItemMetadata } from '../src/lib/reconciliation/graph/driveItems';
import { parseFrameworkRulesWorkbook } from '../src/lib/reconciliation/ingestion/frameworkRulesParser';
import { parseRebateCheckWorkbook } from '../src/lib/reconciliation/ingestion/rebateCheckParser';
import { parseInvoiceSpendWorkbook } from '../src/lib/reconciliation/ingestion/invoiceSpendParser';
import { getAllContracts } from '../src/lib/contractsStore';

interface SiteResponse { id: string; displayName?: string; webUrl?: string }
interface DriveResponse { value?: Array<{ id: string; name?: string; webUrl?: string; driveType?: string }> }

const itemIds = {
  rebate_check_log: process.env.REBATE_CHECK_LOG_ITEM_ID?.trim() ?? '',
  invoice_spreadsheet: process.env.INVOICE_SPREADSHEET_ITEM_ID?.trim() ?? '',
  framework_rules: process.env.FRAMEWORK_RULES_ITEM_ID?.trim() ?? '',
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function authenticationMode(): 'bearer_token' | 'client_credentials' {
  if (process.env.GRAPH_BEARER_TOKEN?.trim()) return 'bearer_token';
  required('GRAPH_TENANT_ID');
  required('GRAPH_CLIENT_ID');
  required('GRAPH_CLIENT_SECRET');
  return 'client_credentials';
}

async function resolveSite(client: GraphClient): Promise<SiteResponse> {
  const configured = process.env.SHAREPOINT_SITE_ID?.trim();
  if (configured) {
    const response = await client.request(`/sites/${encodeURIComponent(configured)}?$select=id,displayName,webUrl`);
    return response.json() as Promise<SiteResponse>;
  }
  const hostname = required('SHAREPOINT_HOSTNAME');
  const path = required('SHAREPOINT_SITE_PATH');
  const response = await client.request(`/sites/${hostname}:${path}?$select=id,displayName,webUrl`);
  return response.json() as Promise<SiteResponse>;
}

async function driveContainsAllItems(client: GraphClient, driveId: string): Promise<boolean> {
  try {
    await Promise.all(Object.values(itemIds).map(itemId => getDriveItemMetadata(client, driveId, itemId)));
    return true;
  } catch {
    return false;
  }
}

async function resolveDrive(client: GraphClient, siteId: string) {
  const configured = process.env.SHAREPOINT_DRIVE_ID?.trim();
  if (configured) {
    if (!await driveContainsAllItems(client, configured)) {
      throw new Error(`Configured SHAREPOINT_DRIVE_ID ${configured} does not contain all three workbook item IDs.`);
    }
    return { id: configured, name: '(configured)' };
  }
  const response = await client.request(`/sites/${encodeURIComponent(siteId)}/drives?$select=id,name,webUrl,driveType`);
  const drives = (await response.json() as DriveResponse).value ?? [];
  for (const drive of drives) {
    if (await driveContainsAllItems(client, drive.id)) return drive;
  }
  throw new Error(`No drive in site ${siteId} contains all three configured workbook item IDs.`);
}

async function downloadAll(client: GraphClient, driveId: string): Promise<Record<keyof typeof itemIds, DownloadedWorkbook>> {
  const [rebate, invoice, rules] = await Promise.all([
    downloadWorkbook(client, driveId, itemIds.rebate_check_log),
    downloadWorkbook(client, driveId, itemIds.invoice_spreadsheet),
    downloadWorkbook(client, driveId, itemIds.framework_rules),
  ]);
  return { rebate_check_log: rebate, invoice_spreadsheet: invoice, framework_rules: rules };
}

async function main() {
  for (const [label, itemId] of Object.entries(itemIds)) if (!itemId) throw new Error(`Missing item ID for ${label}`);
  const mode = authenticationMode();
  const client = GraphClient.fromEnvironment();
  console.log(`Authentication: ${mode}`);

  const site = await resolveSite(client);
  console.log(`SHAREPOINT_SITE_ID=${site.id}`);
  console.log(`Site: ${site.displayName ?? '(unnamed)'} ${site.webUrl ?? ''}`.trim());

  const drive = await resolveDrive(client, site.id);
  console.log(`SHAREPOINT_DRIVE_ID=${drive.id}`);
  console.log(`Drive: ${drive.name ?? '(unnamed)'}`);

  const metadata = await Promise.all(Object.entries(itemIds).map(async ([label, itemId]) => ({
    label, metadata: await getDriveItemMetadata(client, drive.id, itemId),
  })));
  for (const { label, metadata: item } of metadata) {
    console.log(`${label}: name=${item.name} size=${item.size ?? 'unknown'} etag=${item.eTag ?? 'none'} modified=${item.lastModifiedDateTime ?? 'unknown'}`);
  }

  if (!process.argv.includes('--download')) {
    console.log('Metadata check passed. Re-run with --download to download, parse and count all workbook records.');
    return;
  }

  const files = await downloadAll(client, drive.id);
  const rules = parseFrameworkRulesWorkbook(files.framework_rules.buffer, files.framework_rules.metadata);
  const rebate = parseRebateCheckWorkbook(files.rebate_check_log.buffer, files.rebate_check_log.metadata);
  const invoice = parseInvoiceSpendWorkbook(files.invoice_spreadsheet.buffer, files.invoice_spreadsheet.metadata);
  const issues = [...rules.issues, ...rebate.issues, ...invoice.issues];
  console.log(`Parsed framework rules: ${rules.records.length}`);
  console.log(`Parsed rebate records: ${rebate.records.length}`);
  console.log(`Parsed invoice spend records: ${invoice.records.length}`);
  console.log(`Validation issues: ${issues.length} (fatal=${issues.filter(issue => issue.fatal).length})`);
  for (const issue of issues) console.log(`- ${issue.fatal ? 'FATAL' : 'WARN'} ${issue.workbook}/${issue.worksheet ?? '-'}:${issue.row ?? '-'} ${issue.code}: ${issue.message}`);

  const awards = await getAllContracts();
  console.log(`External awards available in PostgreSQL: ${awards.length}`);
  if (issues.some(issue => issue.fatal)) process.exitCode = 2;
}

main().catch(error => {
  console.error(`Live SharePoint check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

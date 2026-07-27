import { createHash } from 'node:crypto';
import { GraphClient } from './client';
import { WorkbookMetadata } from '../types';

interface DriveItemResponse {
  id: string;
  name?: string;
  eTag?: string;
  lastModifiedDateTime?: string;
  size?: number;
}

export async function getDriveItemMetadata(
  client: GraphClient,
  driveId: string,
  itemId: string,
): Promise<WorkbookMetadata> {
  const response = await client.request(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,eTag,lastModifiedDateTime,size`,
  );
  const item = await response.json() as DriveItemResponse;
  const identity = `${item.id}|${item.eTag ?? ''}|${item.lastModifiedDateTime ?? ''}|${item.size ?? ''}`;
  return {
    itemId: item.id,
    name: item.name ?? itemId,
    eTag: item.eTag ?? null,
    lastModifiedDateTime: item.lastModifiedDateTime ?? null,
    size: item.size ?? null,
    snapshotId: createHash('sha256').update(identity).digest('hex').slice(0, 24),
  };
}

export function requireGraphWorkbookConfig() {
  const siteId = process.env.SHAREPOINT_SITE_ID?.trim();
  const driveId = process.env.SHAREPOINT_DRIVE_ID?.trim();
  const itemIds = {
    rebateCheckLog: process.env.REBATE_CHECK_LOG_ITEM_ID?.trim(),
    invoiceSpreadsheet: process.env.INVOICE_SPREADSHEET_ITEM_ID?.trim(),
    frameworkRules: process.env.FRAMEWORK_RULES_ITEM_ID?.trim(),
  };
  const missing = [
    !siteId && 'SHAREPOINT_SITE_ID',
    !driveId && 'SHAREPOINT_DRIVE_ID',
    !itemIds.rebateCheckLog && 'REBATE_CHECK_LOG_ITEM_ID',
    !itemIds.invoiceSpreadsheet && 'INVOICE_SPREADSHEET_ITEM_ID',
    !itemIds.frameworkRules && 'FRAMEWORK_RULES_ITEM_ID',
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing Graph workbook configuration: ${missing.join(', ')}`);
  return { siteId: siteId!, driveId: driveId!, itemIds: itemIds as Record<keyof typeof itemIds, string> };
}

function configuredItemIds() {
  const itemIds = {
    rebateCheckLog: process.env.REBATE_CHECK_LOG_ITEM_ID?.trim(),
    invoiceSpreadsheet: process.env.INVOICE_SPREADSHEET_ITEM_ID?.trim(),
    frameworkRules: process.env.FRAMEWORK_RULES_ITEM_ID?.trim(),
  };
  const missing = Object.entries(itemIds).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing Graph workbook item IDs: ${missing.join(', ')}`);
  return itemIds as Record<keyof typeof itemIds, string>;
}

export async function resolveGraphWorkbookConfig(client: GraphClient) {
  const itemIds = configuredItemIds();
  let siteId = process.env.SHAREPOINT_SITE_ID?.trim();
  if (!siteId) {
    const hostname = process.env.SHAREPOINT_HOSTNAME?.trim();
    const sitePath = process.env.SHAREPOINT_SITE_PATH?.trim();
    if (!hostname || !sitePath) throw new Error('Configure SHAREPOINT_SITE_ID or SHAREPOINT_HOSTNAME and SHAREPOINT_SITE_PATH');
    const response = await client.request(`/sites/${hostname}:${sitePath}?$select=id`);
    siteId = ((await response.json()) as { id?: string }).id;
    if (!siteId) throw new Error('Graph site resolution did not return a site ID');
  }

  let driveId = process.env.SHAREPOINT_DRIVE_ID?.trim();
  if (!driveId) {
    const response = await client.request(`/sites/${encodeURIComponent(siteId)}/drives?$select=id,name`);
    const drives = ((await response.json()) as { value?: Array<{ id: string; name?: string }> }).value ?? [];
    for (const drive of drives) {
      try {
        await Promise.all(Object.values(itemIds).map(itemId => getDriveItemMetadata(client, drive.id, itemId)));
        driveId = drive.id;
        break;
      } catch { /* workbook IDs are not in this drive */ }
    }
    if (!driveId) throw new Error('No drive in the resolved SharePoint site contains all three workbook item IDs');
  }
  return { siteId, driveId, itemIds };
}

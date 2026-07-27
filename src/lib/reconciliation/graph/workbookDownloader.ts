import { GraphClient } from './client';
import { getDriveItemMetadata } from './driveItems';
import { WorkbookMetadata } from '../types';

export interface DownloadedWorkbook {
  metadata: WorkbookMetadata;
  buffer: Buffer;
}

export async function downloadWorkbook(
  client: GraphClient,
  driveId: string,
  itemId: string,
): Promise<DownloadedWorkbook> {
  const metadata = await getDriveItemMetadata(client, driveId, itemId);
  const response = await client.request(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
    { headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } },
  );
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error(`Downloaded workbook ${metadata.name} is empty`);
  if (metadata.size !== null && metadata.size > 0 && buffer.length !== metadata.size) {
    throw new Error(`Downloaded workbook ${metadata.name} is incomplete (${buffer.length}/${metadata.size} bytes)`);
  }
  return { metadata, buffer };
}

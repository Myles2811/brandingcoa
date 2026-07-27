import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphClient } from '../../src/lib/reconciliation/graph/client';
import { downloadWorkbook } from '../../src/lib/reconciliation/graph/workbookDownloader';

test('temporary bearer-token mode reads metadata and downloads workbook content', async () => {
  const bytes = Buffer.from('fixture-workbook');
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer local-token');
    if (url.includes('/content')) return new Response(bytes, { status: 200 });
    return Response.json({
      id: 'item-1', name: 'fixture.xlsx', eTag: 'etag-1',
      lastModifiedDateTime: '2026-07-04T00:00:00Z', size: bytes.length,
    });
  };
  const client = new GraphClient({ bearerToken: 'local-token', fetchImpl });
  const downloaded = await downloadWorkbook(client, 'drive-1', 'item-1');
  assert.deepEqual(downloaded.buffer, bytes);
  assert.equal(downloaded.metadata.name, 'fixture.xlsx');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith('/drives/drive-1/items/item-1/content'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchWithRetry } from '../src/lib/sourceFetch';

test('rate-limited requests retry the exact URL and recover', async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    assert.equal(request.url, '/page?cursor=keep-me');
    if (requests === 1) {
      response.statusCode = 429;
      response.end('rate limited');
    } else {
      response.setHeader('content-type', 'application/json');
      response.end('{"ok":true}');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');
    const response = await fetchWithRetry(`http://127.0.0.1:${address.port}/page?cursor=keep-me`, 'test', {
      attempts: 2, rateLimitDelayMs: 1, maxRateLimitDelayMs: 1,
    });
    assert.equal(response.status, 200);
    assert.equal(requests, 2);
  } finally {
    server.close();
  }
});

import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_STAGE_ONE_PREFIX = '/api/v1/procurement-services/stage-one';

type JsonObject = Record<string, unknown>;

export class LaravelApiError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

function baseUrl(): string {
  const value = process.env.CSG_API_BASE_URL?.trim();
  if (!value) {
    throw new LaravelApiError('CSG_API_BASE_URL is not configured. Set it to the Laravel csg-api origin.', 500);
  }
  return value.replace(/\/+$/, '');
}

function stageOnePrefix(): string {
  return (process.env.CSG_API_STAGE_ONE_PREFIX?.trim() || DEFAULT_STAGE_ONE_PREFIX).replace(/^\/?/, '/').replace(/\/+$/, '');
}

function targetUrl(path: string, search = ''): string {
  const normalizedPath = path.replace(/^\/?/, '/');
  return `${baseUrl()}${stageOnePrefix()}${normalizedPath}${search}`;
}

function serverAuthHeaders(incoming?: Headers): HeadersInit {
  const headers = new Headers();
  const token = process.env.CSG_API_TOKEN?.trim();
  const apiKey = process.env.CSG_API_KEY?.trim();

  if (token) headers.set('authorization', `Bearer ${token}`);
  else if (incoming?.get('authorization')) headers.set('authorization', incoming.get('authorization') as string);

  if (apiKey) headers.set('x-api-key', apiKey);
  if (incoming?.get('cookie')) headers.set('cookie', incoming.get('cookie') as string);
  if (incoming?.get('x-business-unit-id')) headers.set('x-business-unit-id', incoming.get('x-business-unit-id') as string);
  if (incoming?.get('x-request-id')) headers.set('x-request-id', incoming.get('x-request-id') as string);
  return headers;
}

function unwrapLaravelEnvelope(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as JsonObject;
  if ('success' in record && 'data' in record) return record.data;
  return value;
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as JsonObject;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
  }
  return fallback;
}

export async function laravelJson<T = unknown>(
  path: string,
  init: RequestInit = {},
  options: { unwrap?: boolean; incomingHeaders?: Headers } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const method = init.method?.toUpperCase() ?? 'GET';
  for (const [key, value] of new Headers(serverAuthHeaders(options.incomingHeaders))) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  const response = await fetch(targetUrl(path), {
    ...init,
    method,
    headers,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LaravelApiError(errorMessage(payload, `Laravel API request failed with HTTP ${response.status}`), response.status);
  }
  return (options.unwrap === false ? payload : unwrapLaravelEnvelope(payload)) as T;
}

export async function proxyLaravelRoute(
  request: NextRequest,
  path: string,
  options: { unwrap?: boolean } = {},
): Promise<NextResponse> {
  try {
    const requestHeaders = new Headers(serverAuthHeaders(request.headers));
    const contentType = request.headers.get('content-type');
    const accept = request.headers.get('accept');
    if (contentType) requestHeaders.set('content-type', contentType);
    if (accept) requestHeaders.set('accept', accept);

    const method = request.method.toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method);
    const response = await fetch(targetUrl(path, request.nextUrl.search), {
      method,
      headers: requestHeaders,
      body: hasBody ? await request.text() : undefined,
      cache: 'no-store',
    });

    const responseHeaders = new Headers();
    for (const header of ['content-type', 'content-disposition', 'cache-control']) {
      const value = response.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }
    if (!responseHeaders.has('cache-control')) responseHeaders.set('cache-control', 'no-store');

    const responseContentType = response.headers.get('content-type') ?? '';
    if (options.unwrap !== false && responseContentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      return NextResponse.json(unwrapLaravelEnvelope(payload), {
        status: response.status,
        headers: responseHeaders,
      });
    }

    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const status = error instanceof LaravelApiError ? error.status : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export function previousCompleteMonth(date = new Date()): { year: number; month: number } {
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return { year: previous.getUTCFullYear(), month: previous.getUTCMonth() + 1 };
}

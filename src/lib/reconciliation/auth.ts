import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function suppliedCredential(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (/^Bearer\s+/i.test(authorization ?? '')) return authorization!.replace(/^Bearer\s+/i, '').trim() || null;
  return request.headers.get('x-api-key')?.trim() || null;
}

export function reconciliationAuthError(request: Request): NextResponse | null {
  const expected = process.env.RECONCILIATION_API_KEY?.trim();
  if (!expected) {
    console.error('[Reconciliation Auth] RECONCILIATION_API_KEY is not configured');
    return NextResponse.json(
      { complete: false, error: 'Reconciliation API authentication is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const supplied = suppliedCredential(request);
  if (!supplied || !timingSafeEqual(digest(supplied), digest(expected))) {
    return NextResponse.json(
      { complete: false, error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer' } },
    );
  }
  return null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { proxyLaravelRoute } from '@/lib/laravelApi';

export async function GET(request: NextRequest) {
  return proxyLaravelRoute(request, '/reconciliation/monthly-summary');
}

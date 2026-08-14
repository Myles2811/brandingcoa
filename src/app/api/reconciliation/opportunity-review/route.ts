export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { proxyLaravelRoute } from '@/lib/laravelApi';

export async function POST(request: NextRequest) {
  return proxyLaravelRoute(request, '/reconciliation/opportunity-review');
}

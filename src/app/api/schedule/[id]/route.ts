export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { proxyLaravelRoute } from '@/lib/laravelApi';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyLaravelRoute(request, `/schedule/${encodeURIComponent(id)}`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyLaravelRoute(request, `/schedule/${encodeURIComponent(id)}`);
}

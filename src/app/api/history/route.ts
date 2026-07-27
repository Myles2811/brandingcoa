export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  getHistorySummary,
  getContractsByMonth,
  deleteContract,
} from '@/lib/contractsStore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (year && month) {
    const contracts = await getContractsByMonth(Number(year), Number(month));
    return NextResponse.json({ contracts });
  }

  const summary = await getHistorySummary();
  return NextResponse.json({ summary });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  await deleteContract(Number(id));
  return NextResponse.json({ ok: true });
}

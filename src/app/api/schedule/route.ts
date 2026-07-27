export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAllSchedules, createSchedule } from '@/lib/schedulerStore';

export async function GET() {
  const schedules = await getAllSchedules();
  return NextResponse.json({ schedules });
}

export async function POST(req: NextRequest) {
  let body: {
    year: number;
    month: number;
    framework_id?: string;
    use_contracts_finder?: boolean;
    strict_mode?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { year, month, framework_id, use_contracts_finder, strict_mode } = body;

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
  }

  const job = await createSchedule({ year, month, framework_id, use_contracts_finder, strict_mode });
  return NextResponse.json({ job });
}

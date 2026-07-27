export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { deleteSchedule, updateScheduleActive, getSchedule } from '@/lib/schedulerStore';
import { runScheduledJob } from '@/lib/cron';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteSchedule(Number(id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);

  let body: { active?: boolean; runNow?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body.active === 'boolean') {
    await updateScheduleActive(numId, body.active);
  }

  if (body.runNow) {
    const job = await getSchedule(numId);
    if (job) {
      const found = await runScheduledJob(numId, job.year, job.month, {
        frameworkId: job.framework_id,
        useContractsFinderCrossCheck: job.use_contracts_finder,
      });
      return NextResponse.json({ ok: true, found });
    }
  }

  return NextResponse.json({ ok: true });
}

import { getPool } from './db';

export interface ScheduleJob {
  id: number;
  year: number;
  month: number;
  framework_id: string;
  use_contracts_finder: boolean;
  strict_mode: boolean;
  active: boolean;
  last_run_at: string | null;
  last_run_found: number;
  total_found: number;
  created_at: string;
}

export async function createSchedule(data: {
  year: number;
  month: number;
  framework_id?: string;
  use_contracts_finder?: boolean;
  strict_mode?: boolean;
}): Promise<ScheduleJob> {
  const result = await getPool().query<ScheduleJob>(`
    INSERT INTO schedules (year, month, framework_id, use_contracts_finder, strict_mode)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [data.year, data.month, data.framework_id ?? '', data.use_contracts_finder ?? false, data.strict_mode ?? false]);
  return result.rows[0];
}

export async function getSchedule(id: number): Promise<ScheduleJob | null> {
  const result = await getPool().query<ScheduleJob>('SELECT * FROM schedules WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function getAllSchedules(): Promise<ScheduleJob[]> {
  return (await getPool().query<ScheduleJob>('SELECT * FROM schedules ORDER BY created_at DESC')).rows;
}

export async function updateScheduleActive(id: number, active: boolean): Promise<void> {
  await getPool().query('UPDATE schedules SET active = $1 WHERE id = $2', [active, id]);
}

export async function updateScheduleRun(id: number, found: number): Promise<void> {
  await getPool().query(`
    UPDATE schedules
    SET last_run_at = CURRENT_TIMESTAMP, last_run_found = $1, total_found = total_found + $1
    WHERE id = $2
  `, [found, id]);
}

export async function deleteSchedule(id: number): Promise<void> {
  await getPool().query('DELETE FROM schedules WHERE id = $1', [id]);
}

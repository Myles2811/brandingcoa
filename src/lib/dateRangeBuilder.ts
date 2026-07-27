import { DateRange } from './types';

export function buildDateRange(year: number, month: number): DateRange {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month

  const format = (d: Date, endOfDay = false): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
    return `${y}-${m}-${day}${time}`;
  };

  return {
    start: format(start),
    end: format(end, true),
  };
}

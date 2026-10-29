import { addDays, startOfDay } from 'date-fns';
import type { TZDate } from '@date-fns/tz';
import type { BlockedRange, BusinessHours } from '../types';
import { inZone, overlaps } from './dates';

const DEFAULT_DAYS = [1, 2, 3, 4, 5];

/** Whether a slot [minute, minute+len) on `day` lies within business hours. */
export function isBusinessTime(hours: BusinessHours | undefined, day: Date, minute: number, len: number): boolean {
  if (!hours) return true;
  const days = hours.daysOfWeek ?? DEFAULT_DAYS;
  if (!days.includes(day.getDay())) return false;
  return minute >= hours.startHour * 60 && minute + len <= hours.endHour * 60;
}

export function blocksFor(blocked: readonly BlockedRange[], resourceIds?: readonly string[]): BlockedRange[] {
  return blocked.filter((b) => !b.resourceId || (resourceIds?.includes(b.resourceId) ?? false));
}

export function isRangeBlocked(
  blocked: readonly BlockedRange[],
  start: Date,
  end: Date,
  resourceIds?: readonly string[],
): boolean {
  return blocksFor(blocked, resourceIds).some((b) => overlaps(start, end, b.start, b.end));
}

export interface BlockSegment {
  key: string;
  block: BlockedRange;
  startMinute: number;
  endMinute: number;
}

/** Clip blocks to one day (display zone), in wall-clock minutes. */
export function blockSegmentsForDay(
  blocked: readonly BlockedRange[],
  day: TZDate,
  timeZone: string,
  resourceId?: string,
): BlockSegment[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return blocked
    .filter((b) => (resourceId ? !b.resourceId || b.resourceId === resourceId : !b.resourceId))
    .filter((b) => overlaps(b.start, b.end, dayStart, dayEnd))
    .map((b, i) => {
      const s = Math.max(b.start.getTime(), dayStart.getTime());
      const e = Math.min(b.end.getTime(), dayEnd.getTime());
      const zs = inZone(s, timeZone);
      const ze = inZone(e, timeZone);
      return {
        key: `${i}:${b.start.getTime()}`,
        block: b,
        startMinute: zs.getHours() * 60 + zs.getMinutes(),
        endMinute: e >= dayEnd.getTime() ? 1440 : ze.getHours() * 60 + ze.getMinutes(),
      };
    });
}

export const hatchStyle = {
  backgroundImage:
    'repeating-linear-gradient(135deg, color-mix(in oklab, var(--muted-foreground) 18%, transparent) 0 2px, transparent 2px 8px)',
} as const;

import { TZDate } from '@date-fns/tz';
import {
  addDays,
  addMilliseconds,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import type { CalendarEvent, CalendarView, WeekStartsOn } from '../types';

export const MS_MINUTE = 60_000;
export const MS_DAY = 86_400_000;

export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Re-express an instant in the given IANA zone so date-fns operates on that zone's wall clock. */
export function inZone(date: Date | number, timeZone: string): TZDate {
  return new TZDate(typeof date === 'number' ? date : date.getTime(), timeZone);
}

/** Midnight of a given calendar day in a zone. */
export function zonedDay(year: number, monthIndex: number, day: number, timeZone: string): TZDate {
  return new TZDate(year, monthIndex, day, timeZone);
}

export function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDay(value: string, timeZone: string): TZDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = zonedDay(Number(y), Number(m) - 1, Number(d), timeZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface VisibleRange {
  start: TZDate;
  /** Exclusive end. */
  end: TZDate;
  days: TZDate[];
}

export function getMonthGridRange(cursor: TZDate, weekStartsOn: WeekStartsOn): VisibleRange {
  // date-fns preserves the TZDate subclass at runtime (via constructFrom); the cast restores the type.
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn }) as TZDate;
  const lastDay = endOfWeek(endOfMonth(cursor), { weekStartsOn });
  const days: TZDate[] = [];
  for (let d = start; d.getTime() <= lastDay.getTime(); d = addDays(d, 1)) days.push(d);
  // Always render 6 weeks so the grid height is stable between months.
  while (days.length < 42) days.push(addDays(days[days.length - 1]!, 1));
  return { start, end: addDays(days[days.length - 1]!, 1), days };
}

export function getWeekRange(
  cursor: TZDate,
  weekStartsOn: WeekStartsOn,
  variant: 'week' | 'work-week' | 'day',
): VisibleRange {
  if (variant === 'day') {
    const start = startOfDay(cursor);
    return { start, end: addDays(start, 1), days: [start] };
  }
  const start = startOfWeek(cursor, { weekStartsOn });
  let days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  if (variant === 'work-week') days = days.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  return { start: days[0]!, end: addDays(days[days.length - 1]!, 1), days };
}

function daysFrom(start: TZDate, count: number): VisibleRange {
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  return { start, end: addDays(start, count), days };
}

export interface RangeOptions {
  /** Below 768px complex views collapse (week/timeline → single day). */
  narrow?: boolean;
  agendaDays?: number;
}

export function getRangeForView(
  view: CalendarView,
  cursor: TZDate,
  weekStartsOn: WeekStartsOn,
  options: RangeOptions = {},
): VisibleRange {
  switch (view) {
    case 'week':
    case 'work-week':
    case 'day':
      return getWeekRange(cursor, weekStartsOn, view);
    case 'year': {
      const start = startOfYear(cursor) as TZDate;
      return daysFrom(start, differenceInCalendarDays(addYears(start, 1), start));
    }
    case 'agenda':
      return daysFrom(startOfDay(cursor), options.agendaDays ?? 30);
    case 'timeline':
      return getWeekRange(cursor, weekStartsOn, options.narrow ? 'day' : 'week');
    case 'month':
    default:
      return getMonthGridRange(cursor, weekStartsOn);
  }
}

/**
 * Last calendar day touched by an interval. End is exclusive, so a timed event ending
 * exactly at midnight does not spill into the next day. Zero-length events stay on start day.
 */
export function lastTouchedDay(start: TZDate, end: TZDate): TZDate {
  if (end.getTime() <= start.getTime()) return startOfDay(start);
  return startOfDay(addMilliseconds(end, -1));
}

/** Events rendered in the all-day lane of time grids. */
export function isAllDayLike(event: Pick<CalendarEvent, 'allDay' | 'start' | 'end'>): boolean {
  return Boolean(event.allDay) || event.end.getTime() - event.start.getTime() >= MS_DAY;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  const aE = Math.max(aEnd.getTime(), aStart.getTime() + 1);
  return aStart.getTime() < bEnd.getTime() && aE > bStart.getTime();
}

export function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

export function dayDiff(a: Date, b: Date): number {
  return differenceInCalendarDays(a, b);
}

export { isSameDay };

export function formatTimeRange(
  start: Date,
  end: Date,
  timeZone: string,
  locale?: string,
  allDay?: boolean,
  allDayLabel = 'All day',
): string {
  if (allDay) return allDayLabel;
  const fmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone });
  return fmt.formatRange(start, end);
}

export function formatDayLabel(date: Date, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(date);
}

export function formatDateTime(date: Date, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

export function formatTitle(
  view: CalendarView,
  range: VisibleRange,
  cursor: Date,
  timeZone: string,
  locale?: string,
): string {
  if (view === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone }).format(cursor);
  }
  if (view === 'day') return formatDayLabel(cursor, timeZone, locale);
  if (view === 'year') return new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone }).format(cursor);
  if (range.days.length === 1) return formatDayLabel(range.days[0]!, timeZone, locale);
  const first = range.days[0]!;
  const last = range.days[range.days.length - 1]!;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone }).formatRange(
    first,
    last,
  );
}

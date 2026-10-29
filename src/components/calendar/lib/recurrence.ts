import { TZDate } from '@date-fns/tz';
import { RRule } from 'rrule';
import type { CalendarEvent, EventOccurrence } from '../types';
import { MS_DAY, overlaps } from './dates';

/**
 * rrule.js computes in UTC. To get RFC 5545 wall-clock semantics (a 9:00 meeting stays at
 * 9:00 across DST), we convert DTSTART to a "floating" UTC date holding the event zone's
 * wall-clock fields, expand, then map each result back to a real instant in that zone.
 */
export function toFloating(date: Date, timeZone: string): Date {
  const z = new TZDate(date.getTime(), timeZone);
  return new Date(
    Date.UTC(z.getFullYear(), z.getMonth(), z.getDate(), z.getHours(), z.getMinutes(), z.getSeconds()),
  );
}

export function fromFloating(floating: Date, timeZone: string): Date {
  const z = new TZDate(
    floating.getUTCFullYear(),
    floating.getUTCMonth(),
    floating.getUTCDate(),
    floating.getUTCHours(),
    floating.getUTCMinutes(),
    floating.getUTCSeconds(),
    timeZone,
  );
  return new Date(z.getTime());
}

export function normaliseRule(rrule: string): string {
  return rrule
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('DTSTART'))
    .map((l) => l.replace(/^RRULE:/i, ''))
    .join(';');
}

export function occurrenceId(seriesId: string, originalStart: Date): string {
  return `${seriesId}::${originalStart.toISOString()}`;
}

/** Expand an event (recurring or not) into the occurrences overlapping [rangeStart, rangeEnd). */
export function expandEvent(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
  defaultTimeZone: string,
): EventOccurrence[] {
  const duration = Math.max(0, event.end.getTime() - event.start.getTime());

  if (!event.rrule) {
    if (!overlaps(event.start, event.end, rangeStart, rangeEnd)) return [];
    return [
      { ...event, occurrenceId: event.id, seriesId: event.id, isRecurring: false, originalStart: event.start },
    ];
  }

  const tz = event.timeZone ?? defaultTimeZone;
  let rule: RRule;
  try {
    const options = RRule.parseString(normaliseRule(event.rrule));
    rule = new RRule({ ...options, dtstart: toFloating(event.start, tz), tzid: null });
  } catch {
    if (import.meta.env.DEV) console.warn(`[Calendar] Invalid RRULE on event "${event.id}": ${event.rrule}`);
    return [];
  }

  // Pad the window by the duration (events starting before range but still running) and a
  // day either side to absorb offset differences between floating and real time.
  const windowStart = toFloating(new Date(rangeStart.getTime() - duration - MS_DAY), tz);
  const windowEnd = toFloating(new Date(rangeEnd.getTime() + MS_DAY), tz);
  const excluded = new Set((event.exdates ?? []).map((d) => d.getTime()));

  let dates: Date[];
  try {
    dates = rule.between(windowStart, windowEnd, true);
  } catch {
    return [];
  }
  const result: EventOccurrence[] = [];
  for (const floating of dates) {
    const start = fromFloating(floating, tz);
    if (excluded.has(start.getTime())) continue;
    const end = new Date(start.getTime() + duration);
    if (!overlaps(start, end, rangeStart, rangeEnd)) continue;
    result.push({
      ...event,
      start,
      end,
      occurrenceId: occurrenceId(event.id, start),
      seriesId: event.id,
      isRecurring: true,
      originalStart: start,
    });
  }
  return result;
}

/**
 * Per-event cache of the last expansion. Optimistic updates replace only the edited event
 * object, so every other event (including expensive recurring ones) hits the cache.
 */
const expansionCache = new WeakMap<CalendarEvent, { key: string; result: EventOccurrence[] }>();

function expandCached(event: CalendarEvent, rangeStart: Date, rangeEnd: Date, tz: string): EventOccurrence[] {
  const key = `${rangeStart.getTime()}|${rangeEnd.getTime()}|${tz}`;
  const hit = expansionCache.get(event);
  if (hit && hit.key === key) return hit.result;
  const result = expandEvent(event, rangeStart, rangeEnd, tz);
  expansionCache.set(event, { key, result });
  return result;
}

export function expandEvents(
  events: readonly CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
  defaultTimeZone: string,
): EventOccurrence[] {
  return events
    .flatMap((e) => expandCached(e, rangeStart, rangeEnd, defaultTimeZone))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
}

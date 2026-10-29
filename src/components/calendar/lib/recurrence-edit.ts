import { RRule } from 'rrule';
import type { CalendarEvent, EventChange, EventChangeType, EventOccurrence, RecurrenceScope } from '../types';
import { createEventId } from './optimistic';
import { fromFloating, normaliseRule, toFloating } from './recurrence';

export interface ChangeRequest {
  type: EventChangeType;
  series: CalendarEvent;
  occurrence: EventOccurrence;
  /** New start/end of the occurrence (ignored for `delete`). */
  start: Date;
  end: Date;
  resourceIds?: string[];
  /** Field edits from the editor (title, rrule, location…). */
  patch?: Partial<CalendarEvent>;
  scope: RecurrenceScope;
  defaultTimeZone: string;
}

const shiftDates = (dates: Date[] | undefined, delta: number) => dates?.map((d) => new Date(d.getTime() + delta));

/** Return the rule with UNTIL set just before `before` (COUNT removed). */
export function truncateRule(rrule: string, seriesTz: string, before: Date): string {
  const options = RRule.parseString(normaliseRule(rrule));
  delete options.count;
  options.until = toFloating(new Date(before.getTime() - 1000), seriesTz);
  return RRule.optionsToString(options).replace(/^RRULE:/, '');
}

/** For COUNT-limited rules, the count left from `from` onwards; otherwise the rule unchanged. */
export function remainingRule(series: CalendarEvent, from: Date, seriesTz: string): string | undefined {
  if (!series.rrule) return undefined;
  const options = RRule.parseString(normaliseRule(series.rrule));
  if (!options.count) return normaliseRule(series.rrule);
  const rule = new RRule({ ...options, dtstart: toFloating(series.start, seriesTz), tzid: null });
  const before = rule
    .between(toFloating(series.start, seriesTz), toFloating(new Date(from.getTime() - 1000), seriesTz), true)
    .filter((f) => fromFloating(f, seriesTz).getTime() < from.getTime()).length;
  return RRule.optionsToString({ ...options, count: Math.max(1, options.count - before) }).replace(/^RRULE:/, '');
}

/**
 * Build a persisted change for any scope. Non-recurring events always use `all`.
 * Pure: the caller decides how to apply (optimistically) and persist it.
 */
export function buildScopedChange(req: ChangeRequest): EventChange {
  const { type, series, occurrence, start, end, resourceIds, patch = {} } = req;
  const scope: RecurrenceScope = occurrence.isRecurring ? req.scope : 'all';
  const seriesTz = series.timeZone ?? req.defaultTimeZone;
  const startDelta = start.getTime() - occurrence.start.getTime();
  const endDelta = end.getTime() - occurrence.end.getTime();
  const base = { type, event: series, occurrence, start, end, scope };

  const isFirst = occurrence.originalStart.getTime() === series.start.getTime();

  if (scope === 'all' || (scope === 'following' && isFirst)) {
    if (type === 'delete') return { ...base, scope: 'all', nextEvent: series };
    return {
      ...base,
      scope: 'all',
      nextEvent: {
        ...series,
        ...patch,
        id: series.id,
        start: new Date(series.start.getTime() + startDelta),
        end: new Date(series.end.getTime() + endDelta),
        // Keep exclusions aligned with the shifted occurrences.
        exdates: shiftDates(series.exdates, startDelta),
        ...(resourceIds ? { resourceIds } : {}),
      },
    };
  }

  if (scope === 'this') {
    const nextEvent: CalendarEvent = { ...series, exdates: [...(series.exdates ?? []), occurrence.originalStart] };
    if (type === 'delete') return { ...base, nextEvent };
    const exception: CalendarEvent = {
      ...series,
      ...patch,
      id: createEventId(),
      start,
      end,
      rrule: undefined,
      exdates: undefined,
      recurringEventId: series.id,
      originalStart: occurrence.originalStart,
      ...(resourceIds ? { resourceIds } : {}),
    };
    return { ...base, nextEvent, created: [exception] };
  }

  // following
  const nextEvent: CalendarEvent = {
    ...series,
    rrule: truncateRule(series.rrule!, seriesTz, occurrence.originalStart),
    exdates: series.exdates?.filter((d) => d.getTime() < occurrence.originalStart.getTime()),
  };
  if (type === 'delete') return { ...base, nextEvent };
  const newSeries: CalendarEvent = {
    ...series,
    rrule: remainingRule(series, occurrence.originalStart, seriesTz),
    ...patch,
    id: createEventId(),
    start,
    end,
    exdates: shiftDates(
      series.exdates?.filter((d) => d.getTime() > occurrence.originalStart.getTime()),
      startDelta,
    ),
    ...(resourceIds ? { resourceIds } : {}),
  };
  return { ...base, nextEvent, created: [newSeries] };
}

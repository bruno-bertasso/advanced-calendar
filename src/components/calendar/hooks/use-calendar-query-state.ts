import { createParser, parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';
import { getLocalTimeZone, parseIsoDay, toIsoDay, inZone } from '../lib/dates';
import { CALENDAR_VIEWS, type CalendarView } from '../types';

export interface CalendarQueryStateOptions {
  defaultView?: CalendarView;
  timeZone?: string;
  /** Query-string keys, in case they clash with the host app. */
  keys?: { view?: string; date?: string; resources?: string };
}

export interface CalendarQueryState {
  view: CalendarView;
  date: Date;
  resourceIds: string[];
  setView: (view: CalendarView) => void;
  setDate: (date: Date) => void;
  setResourceIds: (ids: string[]) => void;
}

/**
 * URL-synced calendar state via nuqs: `?view=week&date=2026-10-28&resources=a,b`.
 * Dates are serialised as calendar days in the display zone so links are stable.
 * Requires a nuqs adapter (e.g. `NuqsAdapter` from `nuqs/adapters/react`) above the tree.
 */
export function useCalendarQueryState(options: CalendarQueryStateOptions = {}): CalendarQueryState {
  const timeZone = options.timeZone ?? getLocalTimeZone();
  const keys = { view: 'view', date: 'date', resources: 'resources', ...options.keys };

  const parsers = useMemo(() => {
    const dayParser = createParser<Date>({
      parse: (v) => parseIsoDay(v, timeZone),
      serialize: (d) => toIsoDay(inZone(d, timeZone)),
      eq: (a, b) => toIsoDay(inZone(a, timeZone)) === toIsoDay(inZone(b, timeZone)),
    });
    return {
      view: parseAsStringLiteral(CALENDAR_VIEWS).withDefault(options.defaultView ?? 'month'),
      date: dayParser,
      resources: parseAsArrayOf(parseAsString).withDefault([]),
    };
  }, [timeZone, options.defaultView]);

  const [state, setState] = useQueryStates(parsers, {
    urlKeys: { view: keys.view, date: keys.date, resources: keys.resources },
    history: 'replace',
  });

  // Stable "today" fallback for the lifetime of the hook when ?date is absent.
  const today = useMemo(() => new Date(), []);

  return {
    view: state.view,
    date: state.date ?? today,
    resourceIds: state.resources,
    setView: useCallback((view: CalendarView) => void setState({ view }), [setState]),
    setDate: useCallback((date: Date) => void setState({ date }), [setState]),
    setResourceIds: useCallback((resources: string[]) => void setState({ resources }), [setState]),
  };
}

import { Calendar as CalendarRoot } from './calendar';
import { CalendarBody } from './calendar-body';
import { CalendarHeader } from './calendar-header';
import { AgendaView } from './views/agenda-view';
import { MonthView } from './views/month-view';
import { TimelineView } from './views/timeline-view';
import { WeekView } from './views/week-view';
import { YearView } from './views/year-view';

export { AgendaView, CalendarBody, CalendarHeader, MonthView, TimelineView, WeekView, YearView };
export { EventEditorDialog, REPEAT_PRESETS } from './event-editor-dialog';
export { CalendarContextMenu } from './calendar-context-menu';
export { DEFAULT_VIEW_REGISTRY, type CalendarBodyProps, type ViewRegistry } from './calendar-body';
export { VIEW_LABELS, type CalendarHeaderProps } from './calendar-header';
export { useCalendar, type CalendarContextValue, type EditorState, type NudgeAction } from './calendar-context';
export { EventCard, type EventCardProps } from './event-card';
export { useCalendarQueryState, type CalendarQueryState } from './hooks/use-calendar-query-state';
export { expandEvents, expandEvent } from './lib/recurrence';
export * from './types';

/**
 * Compound API: `<Calendar>` plus static members, so both styles work:
 *   <Calendar><CalendarHeader /><CalendarBody /></Calendar>
 *   <Calendar><Calendar.Header /><Calendar.Body /></Calendar>
 */
export const Calendar = Object.assign(CalendarRoot, {
  Header: CalendarHeader,
  Body: CalendarBody,
  MonthView,
  WeekView,
  YearView,
  AgendaView,
  TimelineView,
});

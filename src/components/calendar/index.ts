import { Calendar as CalendarRoot } from './calendar';
import { AgendaView, CalendarBody, TimelineView, YearView } from './calendar-body';
import { CalendarHeader } from './calendar-header';
import { MonthView } from './views/month-view';
import { WeekView } from './views/week-view';

// Year / Agenda / Timeline are exported as React.lazy components (code-split); render them
// inside <Suspense> if you use them directly. The editor dialog is lazy-loaded internally.
export { AgendaView, CalendarBody, CalendarHeader, MonthView, TimelineView, WeekView, YearView };
export { REPEAT_PRESETS, repeatKeyFor } from './lib/repeat';
export { CalendarContextMenu } from './calendar-context-menu';
export { RecurrenceScopeDialog } from './recurrence-scope-dialog';
export { DEFAULT_VIEW_REGISTRY, type CalendarBodyProps, type ViewRegistry } from './calendar-body';
export { VIEW_LABELS, type CalendarHeaderProps } from './calendar-header';
export {
  useCalendar,
  useCalendarConfig,
  useCalendarState,
  useDragState,
  type CalendarConfigValue,
  type CalendarContextValue,
  type CalendarStateValue,
  type DragState,
  type EditorState,
  type NudgeAction,
} from './calendar-context';
export { EventCard, type EventCardProps } from './event-card';
export { useCalendarQueryState, type CalendarQueryState } from './hooks/use-calendar-query-state';
export { expandEvents, expandEvent } from './lib/recurrence';
export { buildScopedChange, truncateRule } from './lib/recurrence-edit';
export { enMessages, ptBRMessages, resolveMessages, type CalendarMessages, type DeepPartial } from './messages';
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

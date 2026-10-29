import type { ReactNode } from 'react';
import type { CalendarMessages, DeepPartial } from './messages';

export const CALENDAR_VIEWS = [
  'day',
  'week',
  'work-week',
  'month',
  'year',
  'agenda',
  'timeline',
] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A calendar event as supplied by the consumer. Instants are absolute (`Date`). */
export interface CalendarEvent {
  id: string;
  title: string;
  /** Absolute start instant. For recurring events this is DTSTART of the series. */
  start: Date;
  /** Absolute end instant (exclusive). For all-day events, midnight after the last day. */
  end: Date;
  allDay?: boolean;
  /** RFC 5545 RRULE body, e.g. `FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10` (with or without `RRULE:` prefix). */
  rrule?: string;
  /** Excluded occurrence start instants (EXDATE). */
  exdates?: Date[];
  /** IANA zone the event's wall-clock time (and recurrence) is anchored to. Defaults to the calendar zone. */
  timeZone?: string;
  resourceIds?: string[];
  /** Any CSS color. Falls back to the resource color, then `--calendar-event`. */
  color?: string;
  description?: string;
  location?: string;
  /** Set to false to disable drag & resize for this event. */
  editable?: boolean;
  /** Set on exception events created by "this event only" edits: the series they override. */
  recurringEventId?: string;
  /** For exception events: start of the series occurrence they replace. */
  originalStart?: Date;
  meta?: Record<string, unknown>;
}

/** A single concrete instance of an event inside the visible range. */
export interface EventOccurrence extends CalendarEvent {
  /** Unique per occurrence: `${seriesId}::${originalStartISO}` for recurring events, else the event id. */
  occurrenceId: string;
  seriesId: string;
  isRecurring: boolean;
  /** Start instant of this occurrence before any edits. */
  originalStart: Date;
}

export interface CalendarResource {
  id: string;
  title: string;
  color?: string;
  avatarUrl?: string;
  parentId?: string;
  meta?: Record<string, unknown>;
}

export type EventDensity = 'compact' | 'default';

export interface EventRenderContext {
  event: EventOccurrence;
  view: CalendarView;
  timeZone: string;
  /** Visual density hint; cards additionally adapt via container queries. */
  density: EventDensity;
  /** This rendered segment is the first/last piece of a multi-day event. */
  isStart: boolean;
  isEnd: boolean;
  isDragging: boolean;
  /** An optimistic update for this event is awaiting server confirmation. */
  isPending: boolean;
  isSelected: boolean;
  /** Pre-formatted time label, e.g. "9:00 – 10:30 AM". */
  timeLabel: string;
}

export interface CellRenderContext {
  date: Date;
  view: CalendarView;
  isToday: boolean;
  isOutsideRange: boolean;
  isWeekend: boolean;
  isSelected: boolean;
  events: EventOccurrence[];
  resource?: CalendarResource;
  /** The default cell contents (date label). Return it to decorate rather than replace. */
  defaultContent: ReactNode;
}

export interface ResourceHeaderRenderContext {
  resource: CalendarResource;
  view: CalendarView;
  date?: Date;
}

export type EventChangeType = 'move' | 'resize' | 'edit' | 'delete';

/** Which events of a recurring series a change applies to (RFC 5545 RANGE semantics). */
export type RecurrenceScope = 'this' | 'following' | 'all';

export interface BusinessHours {
  /** 0 = Sunday … 6 = Saturday. Defaults to Monday–Friday. */
  daysOfWeek?: number[];
  startHour: number;
  endHour: number;
}

export interface BlockedRange {
  start: Date;
  end: Date;
  /** Restrict to one resource; omit to block for everyone. */
  resourceId?: string;
  label?: string;
}

/** Return `false` or a reason string to reject a change before it is applied. */
export type BeforeEventChange = (
  change: EventChange,
) => boolean | string | void | Promise<boolean | string | void>;

export interface EventChange {
  type: EventChangeType;
  /** Original (series) event as passed in props. */
  event: CalendarEvent;
  occurrence: EventOccurrence;
  /** New start/end of the dragged occurrence. */
  start: Date;
  end: Date;
  /** Scope chosen for recurring events (`'all'` for non-recurring ones). */
  scope: RecurrenceScope;
  /**
   * The (series) event with the change applied, ready to persist:
   * - `all`: the series shifted/edited by the same delta (EXDATEs shifted too)
   * - `this`: the series with an EXDATE for this occurrence (see `created` for the exception)
   * - `following`: the series truncated with UNTIL (see `created` for the new series)
   * - type `delete` + `this`/`following`: the series with the EXDATE / UNTIL applied
   */
  nextEvent: CalendarEvent;
  /** New events to persist alongside `nextEvent` (exception event or split-off series). */
  created?: CalendarEvent[];
}

export interface SlotSelectInfo {
  start: Date;
  end: Date;
  allDay: boolean;
  resourceId?: string;
}

export interface CalendarProps {
  events: CalendarEvent[];
  resources?: CalendarResource[];
  /** Resource ids to show as columns in time-grid views. Defaults to none (no resource columns). */
  visibleResourceIds?: string[];

  view?: CalendarView;
  defaultView?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  /** Views offered in the header switcher. */
  views?: readonly CalendarView[];

  date?: Date;
  defaultDate?: Date;
  onDateChange?: (date: Date) => void;

  /** IANA display zone. Defaults to the runtime zone. */
  timeZone?: string;
  weekStartsOn?: WeekStartsOn;
  locale?: string;

  /** Time grid configuration. */
  slotDuration?: 15 | 30 | 60;
  dayStartHour?: number;
  dayEndHour?: number;
  /** Hour the week/day views scroll to initially. */
  scrollToHour?: number;
  /** Maximum stacked event rows in a month cell before "+N more". */
  maxEventsPerCell?: number;

  /** Days shown by the agenda view (from the cursor date). */
  agendaDays?: number;
  /** Column size of the timeline view, in minutes. */
  timelineSlotMinutes?: 15 | 30 | 60 | 120;
  /** Text direction. Mirrors keyboard navigation and layout for RTL locales. */
  direction?: 'ltr' | 'rtl';

  /**
   * Called with a new event (generated id) from the editor dialog or "Duplicate".
   * Providing it enables the built-in create dialog. May return a promise (optimistic).
   */
  onEventCreate?: (event: CalendarEvent) => void | Promise<void>;
  /** Called when an event (whole series) is deleted. May return a promise (optimistic). */
  onEventDelete?: (event: CalendarEvent) => void | Promise<void>;
  /** Disable the built-in create/edit dialog (keep callbacks, bring your own UI). */
  disableEventEditor?: boolean;

  /** How edits to recurring occurrences are scoped. `'ask'` (default) shows a dialog. */
  recurringEditScope?: 'ask' | RecurrenceScope;
  /** Validate a change before it is applied (optimistically) — e.g. room conflicts. */
  onBeforeEventChange?: BeforeEventChange;
  /** Shade time outside business hours in time grids and the timeline. */
  businessHours?: BusinessHours;
  /** Unavailable ranges: rendered hatched; moves, resizes and creation into them are rejected. */
  blockedRanges?: BlockedRange[];
  /** Override any user-facing string (see `enMessages` / `ptBRMessages`). */
  messages?: DeepPartial<CalendarMessages>;

  /** May return a promise; the UI shows the optimistic state until it settles and reverts on rejection. */
  onEventChange?: (change: EventChange) => void | Promise<void>;
  onEventClick?: (event: EventOccurrence) => void;
  onSlotSelect?: (info: SlotSelectInfo) => void;

  renderEvent?: (ctx: EventRenderContext) => ReactNode;
  renderCell?: (ctx: CellRenderContext) => ReactNode;
  renderResourceHeader?: (ctx: ResourceHeaderRenderContext) => ReactNode;

  /** Disable the built-in event details popover (e.g. if you handle onEventClick yourself). */
  disableEventPopover?: boolean;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
}

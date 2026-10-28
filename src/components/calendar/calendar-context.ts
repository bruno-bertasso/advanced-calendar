import type { TZDate } from '@date-fns/tz';
import { createContext, use } from 'react';
import type { VisibleRange } from './lib/dates';
import type {
  CalendarEvent,
  CalendarProps,
  CalendarResource,
  CalendarView,
  EventOccurrence,
  SlotSelectInfo,
  WeekStartsOn,
} from './types';

export type EditorState =
  | { mode: 'create'; slot: SlotSelectInfo }
  | { mode: 'edit'; occurrence: EventOccurrence };

export type NudgeAction = 'earlier' | 'later' | 'prev-day' | 'next-day' | 'shorter' | 'longer';

export interface CalendarContextValue {
  view: CalendarView;
  views: readonly CalendarView[];
  setView: (view: CalendarView) => void;
  /** Focused/anchor date, in the display zone. */
  cursor: TZDate;
  setCursor: (date: Date) => void;
  navigate: (direction: 'prev' | 'next' | 'today') => void;
  range: VisibleRange;
  today: TZDate;
  title: string;

  timeZone: string;
  locale: string | undefined;
  weekStartsOn: WeekStartsOn;
  direction: 'ltr' | 'rtl';
  slotDuration: 15 | 30 | 60;
  pxPerMinute: number;
  timelineSlotMinutes: number;
  /** Horizontal scale of the timeline view. */
  timelinePxPerMinute: number;
  agendaDays: number;
  dayStartHour: number;
  dayEndHour: number;
  scrollToHour: number;
  maxEventsPerCell: number;

  /** Base events with optimistic edits applied. */
  events: CalendarEvent[];
  /** Expanded occurrences for the visible range. */
  occurrences: EventOccurrence[];
  resources: CalendarResource[];
  visibleResources: CalendarResource[];
  isPending: (eventId: string) => boolean;
  canEdit: (event: CalendarEvent) => boolean;
  canDelete: (event: CalendarEvent) => boolean;
  /** Whether new events can be created (onEventCreate provided). */
  canCreate: boolean;

  selectedOccurrenceId: string | null;
  openEvent: (occurrence: EventOccurrence, anchor: HTMLElement) => void;
  openEditor: (state: EditorState) => void;
  deleteEvent: (occurrence: EventOccurrence) => void;
  duplicateEvent: (occurrence: EventOccurrence) => void;
  /** Defined when slot activation does something (consumer callback and/or create dialog). */
  onSlotSelect: CalendarProps['onSlotSelect'];
  /** Keyboard / single-pointer alternative to drag & resize (WCAG 2.5.7). */
  nudge: (occurrence: EventOccurrence, action: NudgeAction) => void;

  renderEvent: CalendarProps['renderEvent'];
  renderCell: CalendarProps['renderCell'];
  renderResourceHeader: CalendarProps['renderResourceHeader'];

  announce: (message: string, politeness?: 'polite' | 'assertive') => void;
  isNarrow: boolean;
}

export const CalendarContext = createContext<CalendarContextValue | null>(null);

export function useCalendar(): CalendarContextValue {
  const ctx = use(CalendarContext);
  if (!ctx) throw new Error('Calendar compound components must be rendered inside <Calendar>.');
  return ctx;
}

/** Live drag state, split out so pointer moves don't re-render the whole tree's consumers. */
export interface DragState {
  activeId: string | null;
  kind: 'move' | 'resize' | null;
  /** Snapped resize delta in minutes, for live height preview. */
  resizeMinutes: number;
}

export const DragStateContext = createContext<DragState>({ activeId: null, kind: null, resizeMinutes: 0 });

export function useDragState(): DragState {
  return use(DragStateContext);
}
